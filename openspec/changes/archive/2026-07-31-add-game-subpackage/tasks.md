## 1. 触屏命中测试解耦（TableViewProxy）——不改变任何行为

- [x] 1.1 新建 `js/runtime/table-view-proxy.js`，实现 `TableViewProxy` 类：`attach(renderer)`、`ready`、`hitRegionAt(x, y)`、`markButtonPressed(region)`、`scrollTableRecordBy(dy)`、`scrollRoundResultBy(dy)`，以及转发 8 个动画方法（`playOnlineEvent`/`playLocalActionPreview`/`confirmLocalActionPreview`/`cancelLocalActionPreview`/`settleHeldAppearanceForEvent`/`restoreHeldAppearance`/`reconcileHeldAppearance`/`releaseOnlineEvent`）的 `animator` 子对象；未 `attach` 时全部方法安全降级（返回 null/false/no-op）
- [x] 1.2 `js/game/renderer.js` 的 `TableRenderer` 新增窄方法 `hitRegionAt(x, y)`：内部为 `this.lastLayout ? this.layout.hit(this.lastLayout, x, y) : null`
- [x] 1.3 `js/main.js`：新建 `this.tableView = new TableViewProxy()`；`renderer` 构造完成后立即 `this.tableView.attach(this.renderer)`（此阶段 renderer 仍同步构造，只是把访问路径先切到代理）
- [x] 1.4 `js/net/online.js`：`OnlineController` 构造参数从 `renderer` 改为 `tableView`；原先直接访问 `renderer.lastLayout`/`renderer.layout.hit(...)`/`renderer.markButtonPressed`/`renderer.scrollTableRecordBy`/`renderer.scrollRoundResultBy`/`renderer.animationController` 的调用点全部改为经 `tableView`
- [x] 1.5 跑 `node scripts/run-online-checks.mjs`、`node scripts/run-animation-checks.mjs`、`node scripts/run-huapai-checks.mjs`，确认这一步没有引入任何行为变化（更新了 3 处仍用旧 `lastLayout`/`layout.hit()` 形状的测试 mock 为新的 `hitRegionAt()`，并给 online.js 的触屏/滚动调用加了 typeof 防御，其余约 28 处纯 animator 形状的测试构造调用无需改动）

## 2. 资源清单按包拆分——仍在单包下验证

- [x] 2.1 列出 `ASSET_MANIFEST` 的全部 `images`/`atlases`/`audio` key，逐一标注唯一消费者（`StartMenu`/`menu.js` 还是 `TableRenderer`/`renderer.js`/`layout.js`），据此确定每个 key 归主包还是子包，不凭猜测（发现 `table`/`hall` 两个 key 被 menu.js 和 renderer.js 同时使用——`drawTableBackground` 在创建房间/选座位/等待界面都会画游戏桌背景做预览——已归为主包资源，子包代码可以正常读取主包资源，方向allowed）
- [x] 2.2 拆分 `js/game/assets.js`：`AssetLoader` 类本身（`loadImages`/`getImage`/`getRemoteImage`/图集解析）连同大厅专属 manifest 条目迁移到主包新位置 `js/runtime/asset-loader.js`（导出为 `MAIN_ASSET_MANIFEST`）；游戏专属 manifest 条目保留原位置，重命名为 `GAME_ASSET_MANIFEST`，待第 3 组随子包一起迁移
- [x] 2.3 `AssetLoader` 新增 `extendManifest(chunk)`（增量注册并只加载新增部分），对外维持单一 `getImage(key)` 查询入口，调用方不需要区分资源归属；顺带发现并修复了一个更深的耦合——`js/runtime/music.js` 的 `Music` 构造函数原本在 app 启动时就直接读取音频清单并自动播放 bgm（design.md 里悬而未决的"bgm 触发点"问题的真正答案），已改为构造函数不再读清单/不再自动播放，新增 `registerAudioManifest(audioManifest)` 由第 3 组在真正进入游戏桌时调用
- [x] 2.4 `main.js` 里 `new StartMenu(...)` 改用新位置的 `AssetLoader`；`AssetLoader` 构造函数默认参数就是 `MAIN_ASSET_MANIFEST`，无需额外改动
- [x] 2.5 跑 `node scripts/run-huapai-checks.mjs`、`run-online-checks.mjs`、`run-animation-checks.mjs`，确认拆分后（仍单包运行）现有渲染断言全部通过；同步修复了 `js/game/self-check.js` 的导入和 `scripts/run-huapai-checks.mjs` 沙箱里约 20 处 `ASSET_MANIFEST` 引用，按新分类重定向到 `MAIN_ASSET_MANIFEST`/`GAME_ASSET_MANIFEST`

## 3. 子包目录迁移与懒加载时序

- [x] 3.1 新建子包目录 `subpackages/game/js/`，把 `js/game/*`（`renderer.js`/`layout.js`/`cards.js`/`evaluator.js`/`assets.js`/`self-check.js`/`animation/*`）及其专属图片、音频（`git mv` 保留历史）物理迁移进去；调整迁移后模块的相对 `import` 路径。**实现时发现并修正**：`rules.js` 最初也随其余文件一并迁移，但核实真实调用方后发现 `js/databus.js`（app 启动即构造，字段默认值引用 `DEFAULT_RULES`/`PHASES`）和 `js/net/online.js`（模块级常量引用 `DEFAULT_RULES.seatCount`）都在主包侧静态依赖它——这类错误本地跑规格测试测不出来，因为各测试脚本的沙箱对这条 import 单独打了桩，掩盖了真实编译错误；已将 `rules.js` 移回 `js/rules.js`（主包），子包内四个消费者改为跨包引用。另发现 `audio/滑庄.mp3` 是一个清单和代码里都没有引用的孤立文件，不在本次改动范围内，已用 spawn_task 标记为独立清理任务，未移动、未删除
- [x] 3.2 `game.json` 新增 `subpackages` 字段，声明 `name: 'game'`，`root: 'subpackages/game/'`
- [x] 3.3 新建 `js/runtime/subpackage-loader.js` + `subpackages/game/js/index.js`（子包入口，重导出 `TableRenderer` 默认导出和 `GAME_ASSET_MANIFEST`）：`ensureGamePackage()` 幂等——首次调用触发 `wx.loadSubpackage`，成功回调里用运行时 `require`（不是静态 import，避免被编译器提前打进主包）取子包入口，调用 `assets.extendManifest` 增量加载图片/图集，构造 `TableRenderer` 后补一次 `setViewport(getRenderMetrics())`，`tableView.attach(renderer)`；解析值包含 `{ renderer, manifest }` 供后续（3.8）取音频清单；失败清空缓存允许重试
- [x] 3.4 `main.js`：删除 `renderer` 字段的同步初始化，改为 `renderer = null`，移除对已迁移 `TableRenderer` 的静态 import；`handleMetricsChange`/`render()`/`loop()` 里所有 `this.renderer.xxx` 调用加判空
- [x] 3.5 `main.js`：`ensureOnlineController()` 和 `startOnline()`（两个真正的 `new OnlineController(...)` 构造点，覆盖登录建房和邀请加入两条路径）构造后立即 `ensureGamePackage().catch(() => {})` 启动静默预取
- [x] 3.6 `main.js`：`enterOnlineTable()` 改为 `async`，`await ensureGamePackage()` 后再继续原逻辑（外关口）；未就绪时 `menu.setStatus('正在加载牌桌…')`，失败时提示重试并保留当前状态；成功后在此处调用 `musicManager.registerAudioManifest` + `playBackground`（对应 3.8）
- [x] ~~3.7~~ 内关口已在真机测试后完整移除（见下）。最初按设计给 `OnlineController` 构造参数追加了 `ensureTableReady`，在公共收口点 `reconnectSocketNow()` 开头 `await` 它；真机测试发现"有未完成对局、点击继续游戏"会卡死在"正在进入当前房间…"永不恢复——因为这把核心的 socket 连接/订阅流程绑定在了"子包必须先下载完"上，而这道关口原本要防的"开场动画丢失"问题本就有 `TableViewProxy` 空转 + `finishAnimation` 兜底，顶多丢动画表现、不会卡状态。已完整移除 `ensureTableReady` 相关的构造参数、字段和调用，`reconnectSocketNow()` 恢复为不等待子包
- [x] 3.8 定位到确切触发点：`js/runtime/music.js` 的 `Music` 构造函数原本直接读取清单并在构造时自动播放，已改为构造函数不读取/不播放，新增 `registerAudioManifest(audioManifest)`；播放时机收在 `enterOnlineTable()`（3.6）里，与外关口解析结果同一处调用，确保绝不会在等待界面阶段响起

## 4. 上传配置与验证

- [x] 4.1 检查 `project.config.json` 的 `packOptions.ignore` 不会误排除新的子包目录（已确认不含 `subpackages` 相关排除项）；`scripts/upload.config.json` 的版本号与描述留到实际上传时再更新，不在实现阶段预先改动
- [x] 4.2 跑 `node scripts/run-huapai-checks.mjs`、`run-online-checks.mjs`、`run-animation-checks.mjs`、`run-server-core-checks.mjs`、`run-backend-checks.mjs`，全部通过。**过程中又发现并修复一处遗漏**：`scripts/run-server-core-checks.mjs`（对拍客户端/服务端规则实现一致性的第四个测试脚本，此前未列入排查范围）同样从旧的 `js/game` 目录读取 `rules`/`cards`/`evaluator` 源码，`rules.js` 已迁走导致 `ENOENT`；已改为分别从 `js/rules.js`（主包）和 `subpackages/game/js/{cards,evaluator}.js`（子包）读取，并补上 `../../../js/rules` → `./rules.mjs` 的沙箱路径改写
- [x] 4.3 未在开发者工具里手工打开"代码依赖分析"面板，但已有等价证据：v1.0.16 实际上传结果 `__APP__`（主包）1.16 MiB、`/subpackages/game/` 2.58 MiB 分开列出，且主包体积与"只含大厅/联网代码"的预期吻合（而不是接近含子包代码后的 `__FULL__` 3.75 MiB）——说明子包代码确实没有被静态打进主包
- [x] 4.4 真机测试完整走完，确认可以正常进入牌桌（用户原话"完美解决"）。过程中发现并修复了两个问题：① 决策三"实现时的修正"里记录的内关口过度阻塞（v1.0.13）；② 真正的根因——`enterOnlineTable()` 里 `ensureGamePackage()` 解析出的 renderer 从未回填给 `Main` 自己的 `this.renderer` 字段，导致分包/require/构造全部成功但画面永远不刷新（v1.0.16，定位过程见 design.md"上线后发现的真问题"一节，靠生产环境诊断日志而非猜测定位）。`GAME_ROOT` 前缀路径假设、大厅无 bgm 等其余验证项随这轮真机测试一并通过
- [x] 4.5 grep 全仓确认 `\.lastLayout\b` 和 `\.layout\.hit\(` 的调用点只剩 `TableRenderer`/`TableAnimationController`（同属子包内部协作）内部，`OnlineController` 等主包代码没有遗漏的直接访问
