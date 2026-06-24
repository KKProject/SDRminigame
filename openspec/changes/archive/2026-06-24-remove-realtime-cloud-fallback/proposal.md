## Why

当前 WebSocket 断开后客户端会自动走云函数 `pull`、`op`、`ackAnimation`、`heartbeat` 等兜底路径继续同步，导致玩家看不到明确的掉线状态，也削弱了 WebSocket 作为唯一实时通道的语义。

需要改为：在线牌桌进行中 WebSocket 断开即进入“等待重连”，服务端向其他玩家展示对应席位掉线；客户端不得通过云函数实时兜底继续提交操作或推进同步。

## What Changes

- **BREAKING**: 在线牌桌实时阶段移除云函数实时兜底。WebSocket 不可用时，客户端 MUST NOT 使用云函数提交操作、动画回执、心跳或订阅 `roomStates.watch()` 继续同步。
- WebSocket 断开后，断线玩家本机 MUST 显示等待重连状态，并暂停牌局操作。
- WebSocket 服务 MUST 在连接断开或心跳超时后将对应玩家标记为离线，并广播公共状态，使其他玩家看到该用户掉线。
- WebSocket 重连成功后，客户端重新订阅房间并获取最新权威快照，服务端将玩家标记为在线并广播恢复状态。
- 云函数保留登录、socket token、房间创建/加入等非实时入口；已进入牌桌后的实时同步、操作、回执和心跳只走 WebSocket。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `websocket-transport`: 将“降级与恢复”改为“断线等待重连”，禁止实时云函数兜底，并要求断线/重连广播在线状态。
- `realtime-state-sync`: 将状态下发、操作意图、断线重连和动画回执要求改为 WebSocket-only 主链路，不允许 socket 断开期间通过云函数兜底。

## Impact

- 客户端代码：`js/net/online.js`、`js/net/socket.js`、在线测试。
- 服务端代码：`services/socket/src/server.js`、`services/socket/src/game-service.js`、必要时复用/扩展 `cloudfunctions/game/room.js` 的在线状态更新能力。
- 文档与规格：更新 WebSocket 部署说明，删除实时兜底描述。
- 测试：覆盖 socket 断开时不再调用云函数实时兜底、断线用户在线状态广播、重连恢复。
