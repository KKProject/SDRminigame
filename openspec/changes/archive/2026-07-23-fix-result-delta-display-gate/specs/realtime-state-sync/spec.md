## MODIFIED Requirements

### Requirement: 权威状态与可播放事件分离消费
实时同步系统 SHALL 允许客户端把通过 snapshot 或 delta 收到的权威状态与公开事件分开消费。客户端 MUST 立即保存最新权威状态用于版本校验、操作可用性和重连恢复，但公开桌面事件 MUST 通过客户端时间线队列按序播放或跳过后再影响显示状态。结果类 delta MUST 提供或携带足以构建完整权威结果和显示 checkpoint 的数据。

#### Scenario: snapshot 同时包含结果状态和结果事件
- **WHEN** 服务端下发的 snapshot 同时包含 `phase=result` 和当前结果类 `publicEvent`
- **THEN** 客户端 MUST 保存该权威状态
- **AND** 客户端 MUST 通过时间线处理该 `publicEvent` 后再把结果状态提交为可见显示状态

#### Scenario: delta 同时包含结果阶段和结果事件
- **WHEN** 服务端下发的 WebSocket delta 同时包含结果类事件、`phase=result` 补丁和事件对应的结果数据
- **THEN** 客户端 MUST 将完整结果保存到权威状态镜像
- **AND** 客户端 MUST NOT 直接用该补丁把当前可见阶段切换为 `result`
- **AND** 客户端 MUST 把完整结果状态绑定到该事件的显示 checkpoint

#### Scenario: 结果 delta 完成后提交
- **WHEN** 客户端完成、快进或跳过由结果 delta 创建的 `hu`、`circle-loss` 或 `draw-round` 时间线事件
- **THEN** 客户端 MUST 提交该事件绑定的完整结果显示状态
- **AND** 提交的 `result.type` 和结算数据 MUST 与服务端权威结果一致

#### Scenario: 结果 delta 无法构建 checkpoint
- **WHEN** 结果类 delta 缺失结果数据或客户端无法由其重建有效显示 checkpoint
- **THEN** 客户端 MUST 请求重新订阅或恢复最新权威快照
- **AND** 客户端 MUST NOT 本地猜测结果类型或把缺失结果解释为荒庄

#### Scenario: 私密响应动作不等待结果落屏
- **WHEN** 服务端下发本人可响应动作和当前等待响应公开事件
- **THEN** 客户端 MUST 能使用私密动作更新本人响应 UI
- **AND** 客户端 MUST NOT 因桌面显示状态尚未完全提交而丢失或隐藏合法响应按钮
