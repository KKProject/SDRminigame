## Why

当前服务端每次有效推进后会对房间内每个连接重新 `pull` 并推送完整 `snapshot`。这重复发送大量未变化的公共状态、私密手牌和动画字段。牌桌数据天然可以拆成首次/重连快照与平时事件增量：私密手牌只在发牌和重连全量下发，公开凑牌和弃牌只追加。

## What Changes

- 将正常牌局推进从“每次广播完整 snapshot”改为“首次/重连用 snapshot，平时用 event/delta”。
- 定义公开只增集合：各玩家 `melds` 和 `discards` 只能通过增量 append 或明确扩展事件更新。
- 定义私密手牌策略：发牌、首次进入、断线重连下发完整手牌；普通吃碰招踏由权威事件驱动本机本地 remove，不额外发送私密 hand delta。
- 保留完整快照作为版本缺口、事件缺失、未知编码、客户端状态无法应用时的恢复方式。
- 为后续 protobuf 做消息结构稳定化。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `realtime-state-sync`: 从全量快照主路径改为事件/增量主路径。
- `websocket-transport`: 状态广播支持 snapshot、event、delta/resync 等消息类型。

## Impact

- 服务端：`broadcastSnapshot` 需要拆分为订阅/恢复快照与正常事件广播。
- 客户端：`applySocketSnapshot` 之外新增 event/delta reducer。
- 数据一致性：必须严格检查 `version/eventSeq/baseVersion`。
- 测试：需覆盖增量应用、缺口恢复、只增集合、本人手牌本地 remove。
