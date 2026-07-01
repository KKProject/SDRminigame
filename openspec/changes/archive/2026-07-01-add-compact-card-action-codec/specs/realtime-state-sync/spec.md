## ADDED Requirements

### Requirement: 稳定牌编码
实时同步系统 SHALL 使用稳定牌编码表达在线牌局中的牌。`symbolCode` MUST 按固定规则表中的 24 种字顺序编码，`cardCode` MUST 能唯一表示一副牌中的 144 张具体牌，且客户端和服务端 MUST 对编码往返保持一致。

#### Scenario: symbolCode 映射字
- **WHEN** codec 收到任一 `symbolCode`
- **THEN** 系统 MUST 将其映射到固定的牌字、句子、位置和颜色
- **AND** 同一 `symbolCode` 在客户端和服务端 MUST 表示同一种字

#### Scenario: cardCode 映射具体牌
- **WHEN** codec 收到任一合法 `cardCode`
- **THEN** 系统 MUST 还原出对应 `symbolCode` 与 copy 序号
- **AND** 还原后的牌 id MUST 与现有 `key-copy` 语义一致

### Requirement: 稳定动作编码
实时同步系统 SHALL 使用稳定动作编码表达出牌、吃、碰、招、踏、胡、过、接庄、不接庄和交牌等动作。动作编码 MUST 与显示文案解耦，客户端 MUST 使用本地资源和规则表渲染动作文案与动画。

#### Scenario: 解码动作类型
- **WHEN** 客户端收到一个动作编码
- **THEN** 客户端 MUST 将其映射到唯一动作语义
- **AND** 客户端 MUST NOT 依赖服务端下发的中文动作文案决定规则或动画分支

#### Scenario: 未知动作编码
- **WHEN** 客户端收到未知动作编码
- **THEN** 客户端 MUST 拒绝应用该实时增量
- **AND** 客户端 MUST 通过 socket 请求完整快照或重新订阅恢复
