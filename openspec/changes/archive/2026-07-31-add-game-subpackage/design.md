## Context

- 现状：单一微信小游戏主包，实测上传 3.92MB / 4MB 硬上限（v1.0.11），剩余空间约 0.08MB，几乎榨干；`game.json` 当前没有 `subpackages` 配置。
- 已核实的微信平台事实（官方文档）：主包 ≤4MB；普通分包无单独大小上限（仅"独立分包"这种特殊类型限 4MB，本项目不需要独立分包）；主包+全部分包总预算 ≤30MB；`wx.loadSubpackage({name})` 需要显式调用触发下载，不像小程序按页面自动加载；`game.json` 用 `subpackages: [{name, root}]` 声明。子包代码可以 `require`/`import` 主包模块（方向允许），反过来主包静态依赖子包代码是不允许的（分包机制本身的约束）。
- 现有代码已经有一条天然的边界：`Main`（`js/main.js`）持有 `this.menu`（`StartMenu`，`js/ui/menu.js`，大厅/创建房间/等待界面）和 `this.renderer`（`TableRenderer`，`js/game/renderer.js`，游戏桌/对局结果/结算），`APP_MODES` 按这条线切换渲染对象。这条边界与本次要做的主包/子包切分基本重合。
- 三个需要解决的耦合点（explore 阶段确认）：
  1. `js/game/assets.js` 的 `ASSET_MANIFEST` 是单一扁平对象，大厅用的 key（`hall`/`slogan`/`nicknameBg`/`avatarBorder`/`flowers`/`startButton`/`wechatLogin`）和游戏用的 key（`cardFront`/`cardBack`/`button`/`result`/`roundResult*`/`tableRecord*`）混在一起，且 `StartMenu` 与 `TableRenderer` 共用同一个 `AssetLoader` 实例。
  2. `main.js` 里 `renderer = new TableRenderer(this.assets)` 是类字段初始化，app 启动即同步构造；主循环 `loop()` 里 `this.renderer.animationController.update(time)` 每帧无条件执行，不看当前 `mode`。
  3. `OnlineController`（`js/net/online.js`，联网房间生命周期管理，构造时机在"确认创建/加入房间"、早于进入游戏桌）直接调用 `renderer.lastLayout`、`renderer.layout.hit(...)`、`renderer.markButtonPressed`、`renderer.scrollTableRecordBy/scrollRoundResultBy`、`renderer.animationController` 这些内部细节做触屏命中测试和动画驱动。
- 已委托 `architect` agent 对复杂度最高的耦合点③做了详细方案设计（本 design.md 的决策二~四即其结论的formal化）。

## Goals / Non-Goals

**Goals:**
- 把主包/子包边界落在"大厅+创建房间+等待界面"vs"游戏桌+对局结果+结算"，主包实测体积压到约 1.5MB 量级，恢复充裕余量。
- 子包加载对玩家几乎无感知：预取时机尽量早（覆盖断线直接恢复到进行中房间的路径），进桌前的等待只在弱网等异常情况下才明显可见。
- 现有用户可见行为（对局结果展示、结算展示、触屏交互、动画表现）完全不变——这是一次纯粹的打包结构改造，不是功能改动。
- 解决三个耦合点，使 `js/game/*` 可以整体作为子包内容物理迁移，不需要把主包代码反向拆得七零八落。

**Non-Goals:**
- 不改变任何游戏规则、计分、动画时序或视觉表现。
- 不在本次范围内把子包进一步拆成多个更小的分包（游戏桌/结果/结算暂时合并为一个 `game` 子包）。
- 不改动服务端（`services/backend`）、协议或数据结构——纯客户端打包改造。
- 不解决"等待界面要不要有别的背景音乐"之类的新增产品需求，只处理"bgm 现在跟着子包走、大厅阶段不播放"这一件事。

## Decisions

### 1. 包边界：沿用现有 StartMenu / TableRenderer 分工

- **选择**：主包 = `js/main.js`、`js/render.js`、`js/databus.js`、`js/rules.js`、`js/ui/menu.js`、`js/net/*`、`js/runtime/*`；子包 = `subpackages/game/js/*`（`renderer.js`/`layout.js`/`cards.js`/`evaluator.js`/`animation/*`）及其专属图片（游戏桌背景、动作按钮图集、卡牌图集、对局结果七张切图、结算页九张切图）和专属音频（bgm、牌面/动作语音）。
- **理由**：与现有类边界重合，物理迁移成本最低；`OnlineController` 生命周期横跨等待界面（主包阶段）和游戏中（子包阶段），必须留在主包，否则等待界面也要等子包下载，分包收益归零。
- **实现时的修正**：`js/game/rules.js`（`DEFAULT_RULES`/`PHASES`/`ACTION_PRIORITY` 等纯规则常量）最初随其余 `js/game/*` 一起归类为子包，实现阶段才发现 `js/databus.js`（app 启动最早期即构造，类字段默认值直接引用 `DEFAULT_RULES`/`PHASES`）和 `js/net/online.js`（模块级常量 `SEAT_COUNT = DEFAULT_RULES.seatCount`）都在主包侧静态依赖它——这类错误在本地跑规格测试时不会报出来，因为各测试脚本自己的沙箱对这条 import 路径都单独打了桩，掩盖了真实的编译期错误；只有对照实际 import 图逐一核实之后才发现。已将 `rules.js` 移回主包（`js/rules.js`），子包内 `cards.js`/`layout.js`/`evaluator.js`/`self-check.js` 改为从主包引用它（子包引用主包模块是被允许的方向）。这也印证了决策五末尾提到的教训：manifest/模块归属不能凭目录名或"看起来像游戏逻辑"猜测，必须逐一核对真实调用方。
- **备选**：把 `OnlineController` 也整体挪进子包，边界上移到"只有 lobby HTTP 逻辑留在主包"。放弃：`OnlineController` 承担等待房间轮询、断线会话恢复、邀请加入等进游戏前就要用的能力，硬拆等于大厅也要等子包；且该文件本身规模大（2000+ 行），整体迁移的回归风险远高于收益。

### 2. `TableViewProxy`：主包持有的稳定代理，收口触屏命中测试依赖

- **选择**：新增主包模块 `js/runtime/table-view-proxy.js`，导出 `TableViewProxy` 类，接口：`attach(renderer)`、`ready`、`hitRegionAt(x, y)`、`markButtonPressed(region)`、`scrollTableRecordBy(dy)`、`scrollRoundResultBy(dy)`、`animator`（转发子对象，见决策四）。子包侧配套在 `TableRenderer` 上新增窄方法 `hitRegionAt(x, y)`（内部即 `this.lastLayout ? this.layout.hit(this.lastLayout, x, y) : null`），命中测试算法本身（`TableLayout.hit`，纯函数）留在子包不动。`OnlineController` 改为持有 `tableView`（这个代理），不再直接持有 `renderer`；未 `attach` 时代理对触屏返回 `null`，事件直接丢弃、不排队。
- **理由**：`OnlineController` 对 renderer 的依赖面经核实只有 5 个点，且调用点大多已有 `if` 守卫；薄代理是改动量最小、语义最清晰的切法。丢弃未就绪期触屏是唯一正确语义——游戏桌触屏监听（`wx.onTouchStart`）只在 `enableInput()` 时绑定，而 `enableInput` 只在真正进入游戏桌（`enterOnlineTable`）时调用，等待界面阶段根本不会产生这类触屏事件，不存在"真的漏事件"的场景。
- **备选**：把 `handleTouch`/`handleTouchMove`/`handleTouchEnd` 整体搬进新模块，`OnlineController` 只提供业务回调。放弃：会把 `isAnimating`、`localActionPreviewType`、断线重连状态等大量 `OnlineController` 内部状态暴露给新模块或回调化，耦合换了方向反而更重。

### 3. 子包加载：预取时机在"确认创建/加入房间"，唯一关口在真正进桌前

- **选择**：新增主包模块 `js/runtime/subpackage-loader.js`，导出幂等的 `ensureGamePackage(): Promise`——首次调用触发 `wx.loadSubpackage({ name: 'game' })`，成功后 `require` 子包入口、构造 `TableRenderer`、强制补一次 `setViewport(getRenderMetrics())`（弥补晚建错过的启动期 viewport 回调）、`tableView.attach(renderer)`；失败或超时（20 秒）清缓存允许重试；暴露下载进度供 UI 显示。预取调用点放在 `OnlineController` 构造时（`main.js` 里"确认创建房间"和"加入房间"两处），而不是"进入等待界面时"或"大厅空闲时"。进桌前只设一道关口：`main.enterOnlineTable()` 里 `await ensureGamePackage()`。
- **理由**：预取放在"确认创建/加入房间"而非"进等待界面"，是因为断线直接恢复到进行中房间的路径根本不经过等待界面，这个时机才是所有路径的公共最早点；也不放在"大厅空闲预取"，避免与主包首屏资源抢带宽，且违背"只逛大厅不下游戏包"的分包初衷。
- **实现时的修正（真机测试暴露）**：最初设计里除了这道"外关口"，还在 `OnlineController.reconnectSocketNow()`（socket 连接与订阅的公共收口点，覆盖开局、断线恢复、协议不匹配重连等全部路径）开头加了第二道"内关口"，理由是"权威快照可能早于玩家点'进入牌桌'到达，若子包未就绪会丢开场动画"。真机测试后发现：这道内关口把"建立 socket 连接、确认房间状态"这种核心必经流程，错误地绑定在了"子包必须先下载完成"这个条件上——结果是"有未完成对局、点击继续游戏"这条路径直接卡死在"正在进入当前房间…"，永久不resolve也不reject。而它原本要防的问题（开场动画丢失）本来就有兜底：`TableViewProxy` 未挂载时所有方法安全空转，`OnlineController` 侧看到动画未启动会走既有的 `finishAnimation` 跳过，顶多丢一次动画表现，不会导致状态卡死。用"重连可能整体卡死"换"顶多丢一次开场动画"，这笔账不划算，已将内关口完整移除（`OnlineController` 构造函数和 `reconnectSocketNow` 都不再依赖 `ensureTableReady`），只保留外关口，并给 `ensureGamePackage` 本身加了超时兜底，防止子包下载真的卡住时外关口也无限等待。
- **备选**：保留内关口但收窄触发范围（比如只在"检测到需要处理开局快照但子包未就绪"的具体分支才等待）。放弃：需要在 `reconnectSocketNow` 内部精确区分"这次连接是否会立刻收到需要动画的快照"，判断逻辑复杂且脆弱，不如干脆依赖已经存在、已验证可靠的空转降级路径。

### 4. `animator` 转发与主循环判空分开处理

- **选择**：`TableViewProxy.animator` 是构造时就创建的稳定子对象，显式转发 `OnlineController` 用到的 8 个动画方法（`playOnlineEvent`/`playLocalActionPreview`/`confirmLocalActionPreview`/`cancelLocalActionPreview`/`settleHeldAppearanceForEvent`/`restoreHeldAppearance`/`reconcileHeldAppearance`/`releaseOnlineEvent`），未 attach 时按现有调用方的 falsy/no-op 兜底语义降级（如 `playOnlineEvent` 返回 `false` 时既有代码本就会走 `finishAnimation` 分支）。`main.js` 主循环里 `this.renderer.animationController.update(time)` 不走代理，直接加一行 `if (this.renderer)` 判空——这里 `main.js` 本来就是创建 `renderer` 的地方，天然知道其存在性，为每帧热路径引入代理转发是不必要的开销。
- **理由**：8 个方法均已是 feature-detect 调用风格（`if (this.animator.xxx)` 或三目），转发到代理后现有降级路径原样成立，不需要改 `OnlineController` 侧的调用逻辑。
- **备选**：`animator` 也整个走回调注入。放弃：改动面更大，且代理已经存在，animator 面搭车成本接近零。

### 5. 资源清单按包拆分，`AssetLoader` 支持增量注册

- **选择**：`js/game/assets.js` 拆分为两部分——`AssetLoader` 类本身（加载机制：`loadImages`/`getImage`/`getRemoteImage`/图集解析）连同主包专属的 manifest 条目，一起迁到主包 `js/runtime/asset-loader.js`（导出为 `MAIN_ASSET_MANIFEST`）；游戏专属的 manifest 条目（`cardFront`/`cardBack`/`button`/`result`/`roundResult*`/`tableRecord*`/两个图集/全部音频）保留在 `js/game/assets.js`（导出为 `GAME_ASSET_MANIFEST`），随子包入口一起导出。`AssetLoader` 新增 `extendManifest(chunk)`——追加注册一份 manifest 并只加载新增部分，子包加载完成时调用一次，把游戏专属资源并入同一个 `AssetLoader` 实例——`StartMenu`/`TableRenderer` 两边始终对同一个 `assets.getImage(key)` 入口取图，不需要区分"该问哪个实例"。
- **实现时的修正**：逐一核实每个 manifest key 的真实消费者后发现，`table`（`images/background.jpg`）和 `hall`（`images/hall_background.jpg`）两个 key 被 `StartMenu`（创建房间/选座位/等待界面用于预览游戏桌背景）和 `TableRenderer`（实际游戏桌背景）**同时使用**，并非探索阶段设想的"纯游戏专属"。两者已归入 `MAIN_ASSET_MANIFEST`——这不影响子包代码读取，因为分包机制允许子包代码访问主包资源（方向单向：主包资源始终可用，子包资源要等下载完成）。这也顺带发现了 `js/runtime/music.js` 的 `Music` 构造函数原本在 app 启动时直接读取音频清单并自动播放 bgm——这正是此前悬而未决的"bgm 触发点"的答案；已改为构造函数不再读取清单/不再自动播放，新增 `registerAudioManifest(audioManifest)` 方法，由懒加载时序在真正进入游戏桌时调用（而不是子包一下载完就调用，避免玩家还在等待界面时 bgm 提前响起）。
- **理由**：维持单一 `getImage` 入口，避免 `renderer.js`/`layout.js`/`menu.js` 里几十处 `this.assets.getImage(...)` 调用点需要分辨"这个 key 归主包实例还是子包实例管"。
- **备选**：主包/子包各自独立一个 `AssetLoader` 实例，`getImage` 失败时互相 fallback。放弃：两个实例语义上更绕，且失败 fallback 容易掩盖"资源本该属于哪个包"的归属错误。

## Risks / Trade-offs

- [风险] 打包器把子包模块静态打进主包（ES import 被静态分析进主包产物），分包白做 → 缓解：主包引用子包代码一律用运行时 `require`，且仅在 `wx.loadSubpackage` 成功回调之后执行；**实现完成后必须在微信开发者工具"代码依赖分析"里人工确认**，此步无法用脚本替代。
- [风险] `TableRenderer` 晚建错过启动期 viewport/metrics 回调，进桌黑屏或布局全零 → 缓解：`attach` 流程强制补一次 `setViewport(getRenderMetrics())`；`handleMetricsChange` 里对 `this.renderer` 判空。
- [风险] 弱网导致进桌等待感知明显、玩家重复点击 → 缓解：复用现有 `setBusy`/loading 状态位，接入下载进度回调显示"正在加载牌桌…"。
- [风险] 子包下载失败（弱网/存储不足）后卡住 → 缓解：失败清缓存、允许有限重试，错误态复用现有 `waitingRetry` 交互模式。
- [风险] 遗留调用点绕过代理直接摸 `renderer` 内部字段 → 缓解：改动落地后 grep 全仓 `\.lastLayout\b`、`\.layout\.hit\(` 确认调用点只剩代理内部。
- [风险] socket 权威快照早于子包就绪到达，开场动画丢失（详见决策三）→ 缓解：内关口 `ensureTableReady` 前置于 socket 订阅/断线恢复处理；即便有遗漏路径绕过，代理 `animator` 的安全降级 + 既有 `finishAnimation` 兜底保证只损失视觉表现、不会卡住对局状态推进。
- [风险] bgm 播放触发点尚未在探索阶段精确定位，可能在资源就绪前被调用 → 缓解：见下方 Open Questions，实现阶段先定位触发调用点再接线；既有"音频加载失败静默跳过"规格本身兜底不会抛异常。
- [风险] 主包/子包 manifest 拆分时把某个 key 分错包（比如误把游戏专属图归进主包 manifest）→ 缓解：实现前列出 `ASSET_MANIFEST` 全部 key 及其唯一消费者（`StartMenu` 还是 `TableRenderer`/`renderer.js`/`layout.js`），逐一归类，不凭猜测判断归属。

## Migration Plan

纯客户端改造，跟随正常小游戏发布节奏，无需服务端配合或数据迁移：

1. 先落地 `TableViewProxy` + `TableRenderer.hitRegionAt` 的机械替换——不改变任何行为，可独立合入、独立验证（`OnlineController` 侧的调用点从摸 renderer 内部改成摸代理，行为等价）。
2. 再落地资源清单按包拆分（`AssetLoader` 支持增量注册）——此时仍是单包运行，只是内部数据结构变化，可以先在不启用 `subpackages` 配置的情况下验证拆分后渲染无回归。
3. 再落地目录物理迁移（`js/game/*` 及专属资源移入子包目录）+ `game.json` 的 `subpackages` 配置 + 懒加载与双关口时序。
4. 微信开发者工具"代码依赖分析"确认主包产物不含子包专属代码；真机/工具预览确认：进桌首帧正常、断线恢复到进行中房间正常、大厅/等待界面无 bgm、对局结果与结算页视觉和交互与改造前一致。
5. 回滚策略：整个改动集中在新增的包边界配置、目录结构和运行时懒加载路径上，不涉及协议或数据结构；如需回滚，撤回 `game.json` 的 `subpackages` 字段和目录迁移相关提交即可恢复单包行为。

## Open Questions

- ~~当前 bgm 的确切播放触发调用点尚未定位~~ 已在实现阶段（决策五）定位并解决：`Music` 构造函数原本直接读取清单并自动播放，已改为懒加载注册。
- 子包内部要不要按"游戏桌 / 对局结果 / 结算"进一步拆成多个更小的分包？本次不做（合并成一个 `game` 子包），仅在子包本身未来体积逼近某个实际约束时再考虑。

## 上线后发现的真问题（v1.0.12 → v1.0.16）

分包上传成功（主包从 3.92MB 降到 1.16MB，验证了整个改动的收益）后，真机测试发现"进入牌桌无响应"——大厅/创建房间/等待界面一切正常，点击进入牌桌没有任何反应，也没有报错提示。排查经过三轮，记录下来避免以后犯同样的错：

**第一轮（错误方向）**：怀疑是决策三的"内关口"（`reconnectSocketNow()` 开头等子包）挡住了核心连接流程，猜测是它导致"续未完成对局"卡在"正在进入当前房间…"。移除了内关口并加了超时兜底（v1.0.13）。**这个改动本身是对的**（内关口确实设计过度，见决策三的"实现时的修正"），但**不是本次故障的根因**——修完之后问题依旧，包括全新对局也进不去，证明故障与"续局"路径无关。

**第二轮（继续错误方向）**：怀疑是 `require('../../subpackages/game/game')` 在真实分包环境下没有按预期解析（微信官方文档提到 `wx.loadSubpackage` 是"下载并自动执行"子包代码，与最初设想的"下载完再手动 require"不完全一致）。没有再猜测性地改代码，而是先加了一整套诊断埋点（v1.0.14 → v1.0.15）：`game.js` 全局 `wx.onError`、`subpackage-loader.js` 每个阶段的上报、`main.js` 渲染循环和动画更新的 try/catch + 上报，全部走项目已有的 `reportClientDiagnostic` 上报通道（`/api/client-log`），用户操作后直接 SSH 到生产服务器 `journalctl -u huapai-backend.service` 查日志，不需要用户操作开发者工具。

**日志给出确定性证据**：`subpackage-load-success`→`subpackage-require-done`（`hasDefault: true, hasManifest: true`）→`subpackage-ready` 全部正常触发，`enter-online-table-done` 也正常触发（`mode: "online"`），但其 detail 里 `hasRenderer` 始终是 `false`。真正的 bug：`js/main.js` 的 `Main` 类字段 `renderer` 从同步构造改成懒加载（`renderer = null`，任务 3.4）后，`subpackage-loader.js` 的成功回调只把渲染器 `attach` 给了 `this.tableView`（供 `OnlineController` 用），**从未把它赋回 `Main` 自己的 `this.renderer` 字段**——而 `main.js` 的 `render()`/`loop()` 恰恰直接读 `this.renderer` 判断要不要绘制、要不要推进动画。分包真的下载成功、`TableRenderer` 真的构造成功，只是没人把引用交还给 `Main` 实例，导致模式已经切到 `GAME_TABLE`、`render()` 的判空条件却永远为假，画面永远不刷新——精确对应"没有报错、就是没反应"。

**v1.0.16 的修复只有一行**：`enterOnlineTable()` 里 `const loaded = await ensureGamePackage()` 之后补上 `if (loaded && loaded.renderer) this.renderer = loaded.renderer;`。真机验证通过。

**经验**：
- 文字描述"卡住了/没反应"这类症状，在没有控制台访问的情况下几乎不可能纯靠猜测定位到根因——两轮基于合理推测的修复都没有命中。**加结构化诊断埋点、走已有的服务端日志通道**，比反复"改一次、部署一次、等用户描述一次"高效得多，本项目正好有现成的 `reportClientDiagnostic`/`journalctl` 链路可以直接用。
- 引入"引用需要在多个持有者之间同步"的模式（这里是 `this.renderer` 主 vs `this.tableView` 代理）时，要么让第二个持有者也在关键路径上显式回填，要么干脆只保留一个真源、其余全部通过它访问——两处独立持有同一份运行时状态，是这次真正的设计缺陷所在。
