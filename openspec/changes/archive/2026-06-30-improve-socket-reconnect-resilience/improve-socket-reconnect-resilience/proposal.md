## Why

在线牌桌的 WebSocket 偶发断连属于移动网络和小程序生命周期里的常见情况，但当前重连链路在 socket token 过期、弱网连续失败和服务端缺少 close 日志时不够可诊断。需要让断线恢复从“通常能重连”升级为“token 过期也能自动刷新并恢复牌局”，同时给服务端留下足够日志方便定位。

## What Changes

- 客户端在 WebSocket 重连失败且疑似 token 过期、鉴权失败或 token 即将过期时，自动重新登录刷新 socket auth，再重新建立连接并订阅原房间。
- 客户端保持在线牌桌实时同步只走 WebSocket，不因为刷新 token 而恢复 HTTPS 游戏兜底路径。
- 客户端在断线、重连、重连失败和恢复成功时记录更明确的诊断信息，并继续显示等待重连状态。
- 服务端记录 socket 连接关闭、错误、鉴权失败和心跳超时的基本诊断信息，包括 close code/reason、openid、roomId 和连接 id，日志不得输出 token。
- 回归测试覆盖 token 过期后的自动刷新重连、连续重连失败保持等待、以及服务端 socket close 诊断不泄露 token。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `websocket-transport`: WebSocket 鉴权、心跳、断线检测和降级恢复需要支持可诊断日志与 token 刷新重连。
- `realtime-state-sync`: 断线重连恢复需要明确客户端可刷新 socket auth 后继续通过 WebSocket 恢复权威牌局。

## Impact

- 客户端网络层：`js/net/online.js`、`js/net/socket.js`、`js/net/cloud.js`
- 服务端 WebSocket 层：`services/backend/src/socket-server.js`、`services/backend/src/config.js`
- 测试：`scripts/run-online-checks.mjs`、`scripts/run-backend-checks.mjs`
- 运维：socket close/heartbeat timeout 日志会进入 `journalctl -u huapai-backend.service`
