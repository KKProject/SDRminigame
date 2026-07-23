## ADDED Requirements

### Requirement: 最终局战绩入口
系统 SHALL 将最终局结果页的“查看战绩”作为当前房间总结算页面的有效入口。该入口 MUST 只在房间达到最大局数时替代普通继续下一局操作，并 MUST 保留现有 `tableResult` 退出与受控重开生命周期。

#### Scenario: 最终局查看战绩
- **WHEN** 房间达到最大局数且客户端展示最终局结果
- **THEN** 结果页 MUST 只提供“查看战绩”作为进入总结算的主入口
- **AND** 点击入口 MUST 打开当前房间总结算页面

#### Scenario: 非最终局继续下一局
- **WHEN** 当前局数小于房间最大局数
- **THEN** 结果页 MUST 继续提供现有下一局确认操作
- **AND** 客户端 MUST NOT 提前打开房间总结算页面

#### Scenario: 总结算不改变房间生命周期
- **WHEN** 玩家打开或关闭本地总结算视图
- **THEN** 服务端房间 MUST 继续保持权威 `tableResult` 生命周期
- **AND** 退出、超时和重开规则 MUST 继续按现有要求执行
