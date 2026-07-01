## ADDED Requirements

### Requirement: 实时消息紧凑编码版本
系统 SHALL 为 WebSocket 牌桌实时消息提供稳定的 codec 版本。客户端和服务端 MUST 能识别当前实时消息使用的编码版本，并在不支持该版本时拒绝处理或请求完整快照恢复。

#### Scenario: 使用支持的 codec 版本
- **WHEN** 客户端收到带受支持 codec 版本的实时消息
- **THEN** 客户端 MUST 使用对应 codec 解码牌、动作和短字段
- **AND** 客户端 MUST 正常执行后续版本和事件序号校验

#### Scenario: 收到不支持的 codec 版本
- **WHEN** 客户端收到不支持的 codec 版本
- **THEN** 客户端 MUST 停止应用该增量消息
- **AND** 客户端 MUST 通过 socket 重新订阅或请求完整快照恢复

### Requirement: 牌与动作编码边界
WebSocket 实时消息 SHALL 优先使用紧凑的 `symbolCode`、`cardCode`、`phraseCode` 和动作编码传输牌局语义。实时消息 MUST NOT 重复携带可由固定规则表推导的牌面文字、句子文本、颜色、排序权重或完整牌对象，除非该消息明确声明为兼容旧格式或诊断输出。

#### Scenario: 传输具体手牌
- **WHEN** 服务端下发发牌、重连快照或其他需要精确手牌的私密数据
- **THEN** 消息 MUST 使用 `cardCode` 表示具体牌
- **AND** 客户端 MUST 能从 `cardCode` 还原现有渲染所需牌对象

#### Scenario: 传输公开动作字义
- **WHEN** 服务端下发碰、招、踏、弃牌等只需要字义和视觉表现的公开动作
- **THEN** 消息 MUST 使用 `symbolCode` 表示对应字
- **AND** 消息 MUST NOT 为该字重复发送文字、颜色或句子元数据
