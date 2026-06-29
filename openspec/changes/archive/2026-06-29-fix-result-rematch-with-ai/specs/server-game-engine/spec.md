## ADDED Requirements

### Requirement: 动画推进后的结果落态
服务端权威状态机 SHALL 在动画屏障解除、掉线回执处理或 AI 自动推进后重新同步房间生命周期状态。若这些推进使引擎进入 `phase=result`，服务端 MUST 在写入房间状态前完成 `finished` 或 `tableResult` 判定。

#### Scenario: 动画回执推进到结果
- **WHEN** 当前公开事件的动画屏障解除后，服务端继续推进并进入结果阶段
- **THEN** 服务端 MUST 在持久化前同步房间生命周期状态
- **AND** 后续客户端操作 MUST 能按本局结果或最终结果流程继续

#### Scenario: 无真人观察事件推进到结果
- **WHEN** 服务端跳过无在线真人需要观看的公开事件并进入结果阶段
- **THEN** 服务端 MUST 在持久化前同步房间生命周期状态
- **AND** 房间文档 MUST NOT 保持 `playing` 状态
