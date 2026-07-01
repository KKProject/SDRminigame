## Why

当前 WebSocket 消息仍直接传输完整牌对象和字符串动作字段，单张牌重复携带 `id/key/text/phraseId/phraseText/order/color/copy` 等可由规则表推导的信息。在线实时优化应先建立稳定的牌与动作编码，使后续增量同步和 protobuf 都有小而明确的数据模型。

## What Changes

- 新增紧凑牌编码：`symbolCode` 表示 24 种字，`cardCode` 表示 144 张具体牌。
- 新增动作编码：吃、碰、招、踏、胡、过、出牌、接庄等使用稳定枚举或短码。
- 实时消息中不得重复发送可由固定规则表推导的牌面文字、颜色、句子文本、排序权重等元数据。
- 保持内部引擎可继续使用现有牌对象，编码/解码集中在传输边界。
- 暂不切换 protobuf；本 change 仍可使用 JSON envelope 承载编码后的短结构。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `websocket-transport`: 增加实时消息 codec 版本与紧凑编码要求。
- `realtime-state-sync`: 增加牌与动作在实时同步中的最小字段约束。

## Impact

- 客户端代码：`js/net/socket.js`、`js/net/online.js`，新增或调用传输 codec。
- 服务端代码：`services/backend/src/protocol.js`、`services/backend/src/socket-server.js`、`services/backend/src/game/core/rules.js` 周边 codec。
- 测试：需要覆盖 24 种 `symbolCode`、144 张 `cardCode` 往返，以及动作枚举兼容。
