## 1. 客户端重连韧性

- [x] 1.1 在在线控制器中记录可复用的登录 profile，并为 socket auth 增加过期/即将过期判断
- [x] 1.2 在重连流程中支持刷新 socket auth 后重新连接和订阅原房间
- [x] 1.3 在 token 过期、无效或未授权类连接失败后刷新 auth 并重试一次，失败时保持等待重连
- [x] 1.4 保持在线牌桌断线期间只走 WebSocket，不恢复 HTTPS 游戏 API 兜底

## 2. 服务端诊断日志

- [x] 2.1 为 WebSocket upgrade 鉴权失败增加脱敏日志
- [x] 2.2 为连接关闭、连接错误和心跳超时增加包含 connection id/openid/roomId/code/reason 的诊断日志
- [x] 2.3 确认普通 ping/heartbeat 成功路径不输出噪声日志，且日志不包含 token 或 Authorization

## 3. 验证与回归

- [x] 3.1 增加在线控制器测试：过期 socket token 会刷新 auth 后重连并订阅原房间
- [x] 3.2 增加服务端 socket 测试：鉴权失败/关闭/超时日志脱敏且包含诊断字段
- [x] 3.3 运行 `node scripts/run-online-checks.mjs`、`node scripts/run-backend-checks.mjs` 和 OpenSpec 校验
