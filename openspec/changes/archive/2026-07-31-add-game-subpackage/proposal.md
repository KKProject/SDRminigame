## Why

最近一次实机上传（v1.0.11）主包已达 3.92MB / 4MB 微信硬上限，剩余空间不足 0.1MB，任何后续新增图片、音频或对局结果类资源都会立刻触顶。经核实微信官方文档：普通分包无单独大小上限，主包+全部分包总预算为 30MB。把"大厅/创建房间/等待界面"与"游戏桌/对局结果页/结算页"拆成主包+子包两个包，可以把主包压到约 1.5MB，同时把游戏相关资源的可用空间从"几乎为零"扩大到"总预算 30MB 里的大部分"，为后续继续加图、加语音、加动画资源留出长期空间。

## What Changes

- 新增 `game.json` 的 `subpackages` 配置，声明一个名为 `game` 的子包，`root` 指向新的子包目录。
- 把 `js/game/*`（`TableRenderer`、`TableLayout`、game 专属资源清单条目、卡牌规则/评估逻辑、动画子系统）连同其专属图片资源（游戏桌背景、动作按钮图集、卡牌图集、对局结果七张切图、结算页九张切图）迁移到子包目录。
- `audio/bgmusic.mp3` 随子包迁移：大厅、创建房间、等待界面 SHALL NOT 播放背景音乐，背景音乐 MUST 仅在进入游戏桌后播放。牌面语音、动作语音（吃/碰/招/踏/胡）本身已是游戏中专用，随子包一并迁移。
- 资源清单（`ASSET_MANIFEST`）按包归属拆分为主包清单（大厅/创建房间/等待界面用到的图片）和子包清单（游戏桌/对局结果/结算用到的图片、图集、音频），不再是单一扁平对象。
- 新增 `TableViewProxy`（主包运行时模块）：`OnlineController`（联网房间生命周期管理，等待界面阶段即存在）不再直接持有或访问 `TableRenderer` 内部字段（`lastLayout`、`layout`）做触屏命中测试和滚动，改为通过该代理调用；子包未加载完成时代理安全降级（返回 null / 空转），不排队、不报错。
- 新增子包加载模块：封装 `wx.loadSubpackage()`，在"确认创建房间/加入房间"时机启动预取（早于进入等待界面，覆盖断线直接恢复到进行中房间的路径），提供幂等的"确保子包就绪"接口。
- **BREAKING（内部实现，非对外行为）**：`TableRenderer` 不再在 `Main` 类字段初始化时同步构造，改为子包加载完成后才构造；`Main` 主循环中原先无条件的 `renderer.animationController.update(time)` 需要判空处理。
- 在联网房间进入正式对局前（房主开局 / 断线恢复发现房间已开局）新增一道"确保游戏子包已就绪"的等待点，避免开局权威快照早于子包加载完成导致开场动画丢失。

## Capabilities

### New Capabilities
- `client-subpackaging`: 微信小游戏主包与游戏子包的边界划分、包体预算、子包加载时机与失败处理、主包代码不得静态依赖子包代码的约束。

### Modified Capabilities
- `huapai-assets-audio`: 资源清单从单一扁平对象改为按包拆分；对局结果资源包体预算的适用范围从"整包"收窄为"主包"，并新增子包侧的预算表述；背景音乐从"全程可用"改为"仅子包加载后可用，大厅阶段不播放"。

## Impact

- `game.json`：新增 `subpackages` 字段。
- `js/main.js`：`renderer` 字段从同步构造改为懒加载；`OnlineController` 构造参数从 `this.renderer` 改为 `this.tableView`（代理）；`enterOnlineTable()` 增加"确保子包就绪"等待；主循环 `animationController.update` 判空。
- `js/net/online.js`：触屏命中测试、滚动、动画方法调用改为通过 `TableViewProxy`；新增"确保游戏子包就绪"等待点，插入在 socket 订阅/断线恢复处理之前。
- `js/game/assets.js`：`ASSET_MANIFEST` 拆分为主包/子包两份清单。
- 新增文件：`js/runtime/table-view-proxy.js`、`js/runtime/subpackage-loader.js`。
- 目录结构：新增子包根目录，`js/game/*` 及其专属图片/音频资源物理迁移至该目录。
- 上传与发布流程（`scripts/upload.js`、`scripts/upload.config.json`）：子包目录需要从 `packOptions.ignore` 排除、纳入正式上传范围。
- 回归脚本：`scripts/run-huapai-checks.mjs`、`scripts/run-online-checks.mjs`、`scripts/run-animation-checks.mjs` 需要在改动后继续通过；微信开发者工具"代码依赖分析"需要人工确认主包不再包含子包专属代码。
