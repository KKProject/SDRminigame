## Why

项目已经以在线对战作为正式玩法入口，继续保留单机练习会维护两套牌局权威流程、输入路径和 AI 实现，增加规则不一致、动画重复与后续迭代遗漏的风险。需要彻底移除练习模式及其专属依赖，让客户端只负责在线牌局交互和展示。

## What Changes

- **BREAKING**：删除启动界面的“单机练习”入口，不再提供离线练习或在线功能关闭后的单机回退。
- **BREAKING**：删除客户端本地权威牌局引擎、本地直接输入控制器和仅服务于练习模式的客户端 AI 流程。
- 将启动、授权、登录与牌局进入流程收敛为仅在线对战路径。
- 清理练习模式专属配置开关、状态分支、注释、测试与文档引用。
- 保留在线对战使用的服务端权威引擎、服务端 AI、共享规则判断、布局、渲染和动画能力。
- 调整共享自检与测试，使其不再依赖已删除的客户端练习引擎或客户端 AI，同时继续覆盖共享规则和在线服务端能力。

## Capabilities

### New Capabilities

- `online-only-game-entry`: 规定游戏仅通过在线对战进入可玩牌局，不再存在单机练习入口、离线回退或客户端本地权威牌局。

### Modified Capabilities

- `client-animation-system`: 删除单机状态变化的动画入口要求，统一播放入口仅覆盖在线权威事件和在线操作的本地预演。
- `huapai-ai-opponents`: 删除 AI 支撑离线单机练习的要求，保留在线服务端 AI 的空座补位、断线托管和自动操作职责。

## Impact

- 客户端启动与菜单：`js/main.js`、`js/ui/menu.js`、`js/config.js`、`js/net/cloud.js`。
- 客户端练习实现：`js/game/engine.js`、`js/game/input.js`、`js/game/ai.js` 及其引用。
- 共享自检与测试：`js/game/self-check.js`、`scripts/run-huapai-checks.mjs` 及相关测试说明。
- 文档与规格：`README.md`、`client-animation-system`、`huapai-ai-opponents`。
- 在线服务端引擎与服务端 AI 不删除，在线协议和云数据库结构不发生兼容性变化。
