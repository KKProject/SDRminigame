## Why

在线牌局通过 WebSocket 增量消息进入胡牌结果时，客户端会先把可见阶段切换为 `phase=result`，但此时完整结果尚未提交，渲染器因缺少 `result.type` 短暂显示“荒庄”，随后才显示正确的胡牌结算。现有显示状态闸门只覆盖全量快照，没有覆盖正常实时对局使用的增量路径，需要补齐两条状态入口的一致性。

## What Changes

- 将结果类 WebSocket delta 纳入权威状态与显示状态分离机制，避免结果阶段在对应事件完成前直接进入渲染状态。
- 为 `hu`、`circle-loss` 和 `draw-round` 增量事件建立完整的结果显示 checkpoint，并在动画完成、快进或跳过后一次性提交。
- 收紧结果面板的渲染前置条件：缺失或未知的结果类型不得被解释为“荒庄”。
- 增加覆盖实时 delta、全量 snapshot、动画完成与跳过路径的结果显示回归测试。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `client-animation-system`: 明确所有结果类状态入口均须遵守显示状态闸门，且结果缺失时不得渲染错误的荒庄信息。
- `realtime-state-sync`: 明确 WebSocket 增量结果事件必须同时维护权威结果镜像和延迟提交的显示 checkpoint。

## Impact

- 客户端在线同步与事件时间线：`js/net/online.js`
- 结果面板渲染：`js/game/renderer.js`
- 服务端 WebSocket 增量载荷（如需补充结果字段）：`services/backend/src/socket-server.js`
- 在线与动画回归检查：`scripts/run-online-checks.mjs`、相关动画检查脚本
- 不改变胡牌、进圈、流局的服务端裁决和计分规则，也不引入协议破坏性变更。
