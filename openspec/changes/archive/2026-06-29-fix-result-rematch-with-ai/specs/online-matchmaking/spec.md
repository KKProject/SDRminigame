## ADDED Requirements

### Requirement: 结果阶段房间状态一致性
系统 SHALL 保证房间生命周期状态与服务端权威引擎结果阶段一致。任意房间只要权威引擎处于 `phase=result`，服务端持久化房间或处理下一局请求前 MUST 将房间状态同步为 `finished` 或 `tableResult`。

#### Scenario: 非最终局结果可继续
- **WHEN** 牌桌完成一局结算且当前局数小于 `settings.maxRounds`
- **THEN** 服务端 MUST 将房间状态同步为 `finished`
- **AND** 房主点击本局结果页“再来一局”时 MUST 能开启下一局

#### Scenario: 最终局结果进入最终结果
- **WHEN** 牌桌完成一局结算且当前局数达到 `settings.maxRounds`
- **THEN** 服务端 MUST 将房间状态同步为 `tableResult`
- **AND** 客户端 MUST 进入最终结果与重开确认流程

#### Scenario: 恢复旧漂移状态
- **WHEN** 房间文档仍为 `playing` 但权威引擎已经处于非最终局 `phase=result`
- **THEN** 服务端处理房主下一局请求时 MUST 恢复该房间为可继续状态
- **AND** 服务端 MUST NOT 将该请求误判为牌桌正在进行中
