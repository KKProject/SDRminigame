## 1. 规格与现状确认

- [x] 1.1 对照 `websocket-transport` 与 `realtime-state-sync`，确认牌桌进行中所有实时路径均以 WebSocket 为主通道
- [x] 1.2 梳理客户端现有 HTTPS 实时兜底调用点，包括 `pull`、`op`、`ackAnimation`、`heartbeat`

## 2. 客户端行为收敛

- [x] 2.1 移除或隔离牌桌进行中 socket 断开时的 HTTPS `pull` 兜底刷新
- [x] 2.2 移除或隔离牌桌进行中 socket 断开时的 HTTPS `op` 兜底提交
- [x] 2.3 确保动画回执失败时只等待 socket 重连重试，不走 HTTPS 或云函数兜底
- [x] 2.4 确保 socket 断开时 UI 冻结最后权威画面、禁用牌桌操作并显示等待重连状态

## 3. 服务端恢复能力

- [x] 3.1 确认 socket `subscribe` 在首次进入和重连时返回完整权威快照
- [x] 3.2 确认非房间成员订阅仍被拒绝且不会返回公共或私密状态

## 4. 回归验证

- [x] 4.1 增加 socket 断开后点击出牌/响应不会调用 HTTPS 实时 API 的测试
- [x] 4.2 增加 socket 断开后动画回执只排队等待重连的测试
- [x] 4.3 运行 `node scripts/run-online-checks.mjs`
- [x] 4.4 运行 `node scripts/run-backend-checks.mjs`
