## 1. 消息模型

- [x] 1.1 定义 socket `snapshot`、`event`、`delta`、`resync` 消息结构
- [x] 1.2 为增量消息增加 `roomId`、`baseVersion`、`version`、`eventSeq` 和 codec version 校验字段
- [x] 1.3 明确哪些事件首版走增量，哪些事件仍走完整快照

## 2. 服务端广播

- [x] 2.1 将当前 `broadcastSnapshot` 拆分为订阅/恢复快照发送与正常增量广播
- [x] 2.2 为出牌和弃牌归位生成公开 append discard 增量
- [x] 2.3 为吃、碰、招、踏生成公开 append/extend meld 增量
- [x] 2.4 保留首次订阅、重连、缺口恢复时的完整快照发送

## 3. 客户端 reducer

- [x] 3.1 新增增量应用入口，先校验 `roomId`、`baseVersion`、`eventSeq` 和 codec version
- [x] 3.2 实现 append discard reducer
- [x] 3.3 实现 append/extend meld reducer
- [x] 3.4 实现本机权威出牌事件驱动手牌 remove
- [x] 3.5 实现本机权威凑牌事件驱动手牌 remove
- [x] 3.6 增量无法应用时通过 socket 请求快照恢复

## 4. 测试

- [x] 4.1 增加正常出牌只发送增量、不发送完整 snapshot 的服务端测试
- [x] 4.2 增加客户端 append discard / append meld reducer 测试
- [x] 4.3 增加本机手牌 remove 与失败恢复测试
- [x] 4.4 增加 eventSeq 跳号触发快照恢复测试
- [x] 4.5 运行 `node scripts/run-online-checks.mjs`
- [x] 4.6 运行 `node scripts/run-backend-checks.mjs`
