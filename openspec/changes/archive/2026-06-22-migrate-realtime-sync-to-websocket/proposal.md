## Why

当前在线对战使用云数据库 `watch()` 触发状态变化，再通过 `pull` 云函数拉取完整快照。实际体验中通信和状态同步延迟偏高，动作响应、动画回执和牌桌状态推进容易被云函数调用链路与数据库监听延迟放大。

需要将牌桌实时通信升级为 WebSocket 主通道，让玩家操作、服务端裁决结果、公共状态和动画回执通过一条常驻低延迟连接传输，同时保留服务端权威裁决、手牌保密和断线重连能力。

## What Changes

- 新增 WebSocket 实时传输能力：客户端进入在线牌桌后连接常驻 socket 服务，完成鉴权、入房订阅、心跳、重连和消息收发。
- 将在线对战的主同步路径从「`roomStates.watch()` + `pull` 云函数」改为「WebSocket 消息推送 + 必要时快照补拉」。
- 玩家操作、动画完成回执、房间准备/开局等高频或强时效消息 SHOULD 优先通过 WebSocket 发送，由服务端裁决后立即向相关玩家推送结果。
- 云函数保留为登录、获取 socket 连接凭证、冷启动/兼容兜底、管理类操作和 WebSocket 不可用时的降级通道。
- 服务端需要新增可常驻运行的 WebSocket 服务层，复用现有游戏核心规则与房间裁决逻辑，继续以服务端状态为权威来源。
- 客户端需要实现 socket 连接管理器，并在连接失败、断线或版本缺口时回退到现有 `pull`/云函数路径恢复状态。
- **BREAKING**: `realtime-state-sync` 的实时下发契约从微信云数据库实时推送变更为 WebSocket 主通道；`roomStates.watch()` 不再是在线牌桌的首选同步机制。

## Capabilities

### New Capabilities

- `websocket-transport`: 约束小程序客户端与常驻服务之间的 WebSocket 连接、鉴权、心跳、重连、消息协议和降级行为。

### Modified Capabilities

- `realtime-state-sync`: 将权威状态实时下发和操作意图上报从云数据库 `watch()`/云函数主路径迁移到 WebSocket 主路径，并保留快照补拉与云函数兜底。
- `server-game-engine`: 明确服务端裁决逻辑需要可被 WebSocket 服务复用，并在 socket 消息中保持版本校验、幂等回执和私密信息隔离。
- `wechat-auth`: 增加用于 WebSocket 连接的短期鉴权凭证要求，避免客户端直接用裸 `openid` 建立可信连接。

## Impact

- 客户端代码：`js/net/cloud.js`、`js/net/online.js`，新增 socket 传输/协议模块。
- 服务端代码：新增常驻 WebSocket 服务目录，复用 `cloudfunctions/game/core/*` 与房间裁决逻辑；现有 `cloudfunctions/game` 保留为兜底入口。
- 云开发/部署：需要新增云托管或等价常驻 Node.js 服务，配置 `wss` 域名，并在微信公众平台配置 socket 合法域名。
- 数据模型：继续保留 `rooms` 作为权威持久化状态；`roomStates` 可作为兼容/兜底公共快照，不再承担主实时推送职责。
- 测试：需要新增 socket 协议单测、客户端连接/重连测试，以及现有 online/server core 回归测试。
