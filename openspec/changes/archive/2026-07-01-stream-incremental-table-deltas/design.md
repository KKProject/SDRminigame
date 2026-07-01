## Context

当前 socket 广播路径简单可靠，但每次推进都会给每个连接发送完整 `public + private + animation`。开局单玩家 snapshot 粗略约 5KB，主要重复在手牌和牌对象字段。前置 change 会统一 WebSocket 主通道、引入短编码，并将凑牌动作改为权威事件驱动；本 change 在此基础上把主同步模型切换成增量流。

## Goals / Non-Goals

**Goals:**

- 正常牌局推进使用权威事件和公开 append delta。
- 首次进入、重连、事件缺口和无法应用增量时使用完整快照恢复。
- 私密手牌不再每次操作后完整下发。
- 保持服务端权威状态仍然持久化完整房间。

**Non-Goals:**

- 不改变数据库中 `rooms` 的权威全量状态。
- 不要求删除 `roomStates` 调试/兼容写入。
- 不引入 protobuf。

## Decisions

### 决策 1：消息分为 snapshot 与 incremental

`snapshot` 用于订阅、重连、缺口恢复；`event`/`delta` 用于正常推进。客户端只有在 `baseVersion` 和 `eventSeq` 连续时才应用增量。

### 决策 2：公开 melds/discards 只追加

公开凑牌和弃牌是所有玩家可见的 append-only 数据。普通事件只传追加内容，不传整组历史。若出现需要修正历史的异常情况，服务端发完整快照。

### 决策 3：私密手牌只在边界全量下发

发牌、首次进入、断线重连需要完整手牌。普通吃碰招踏由权威事件驱动本机 remove；普通打牌由权威出牌事件驱动本机 remove；摸出的出现牌不进入手牌。

### 决策 4：增量 reducer 必须可拒绝应用

客户端应用增量前检查：

- `roomId` 匹配。
- `baseVersion` 等于本地版本。
- `eventSeq` 连续或可去重。
- 编码版本支持。
- 本机手牌能找到要移除的牌字。

任一失败则停止应用并请求 socket 快照恢复。

## Risks / Trade-offs

- [增量 reducer 复杂度上升] → 每类事件独立测试，无法应用时立即快照恢复。
- [漏发私密动作选项] → 响应窗口动作按钮仍通过本人私密消息或快照下发。
- [append-only 假设被特殊规则打破] → 对非追加型变化使用完整快照，不强行增量化。

## Migration Plan

1. 先保留旧 `snapshot` 路径，新增增量消息和客户端 reducer。
2. 对单类事件灰度启用增量，例如弃牌 append。
3. 扩展到凑牌 append、本人手牌 remove、响应窗口按钮。
4. 所有普通推进稳定后，停止每次操作后广播完整 snapshot。
5. 保留订阅/重连/缺口恢复 snapshot。

## Open Questions

- 是否需要实现短事件缓存支持补发，还是首版发现缺口直接发快照；建议首版直接快照恢复。
