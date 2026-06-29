## 1. 状态同步修复

- [x] 1.1 在服务端房间编排中新增统一结果状态同步入口。
- [x] 1.2 在 `writeRoomState` 的无观察事件推进后同步 `finished/tableResult`。
- [x] 1.3 在 `startRound` 中恢复旧的 `playing + phase=result` 漂移房间，使非最终局可继续下一局。

## 2. 回归测试

- [x] 2.1 增加非最终局 `playing + phase=result` 房间点击下一局可恢复并开局的测试。
- [x] 2.2 增加最终局结果持久化为 `tableResult` 且不能直接 `startRound` 的测试。
- [x] 2.3 运行在线、后端和核心检查。

## 3. OpenSpec 与部署

- [x] 3.1 同步主规格并归档本次变更。
- [x] 3.2 提交本地 commit。
- [x] 3.3 部署到阿里云并验证线上后端健康状态。
