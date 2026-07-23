## ADDED Requirements

### Requirement: 最终房间战绩实时同步
实时同步系统 SHALL 在 `tableResult` 阶段通过完整 snapshot、增量状态和仍有效的结果页连接提供一致的脱敏 `tableRecord` 与重开摘要。客户端 MUST 使用服务端权威数据渲染总结算，不得根据本地已观看动画自行累计积分或胜局。

#### Scenario: 最终结果状态下发战绩
- **WHEN** 服务端将房间推进到 `tableResult`
- **THEN** 下发给房间成员的公共状态 MUST 包含权威 `tableRecord`
- **AND** 同一版本中的累计积分、胜局、完成局数和重开摘要 MUST 相互一致

#### Scenario: 重开状态变化刷新页面
- **WHEN** 房主发起重开或其他真人提交接受、拒绝
- **THEN** 仍停留在总结算页的客户端 MUST 收到更新后的权威重开摘要
- **AND** 页面操作状态 MUST 随最新摘要更新

#### Scenario: 客户端不得本地累计战绩
- **WHEN** 客户端重复收到最终事件、snapshot 或状态增量
- **THEN** 客户端 MUST 以最新权威 `tableRecord` 覆盖显示模型
- **AND** 客户端 MUST NOT 因重复消费事件而增加胜局或总积分
