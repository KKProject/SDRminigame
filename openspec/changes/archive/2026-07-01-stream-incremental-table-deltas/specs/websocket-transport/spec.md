## MODIFIED Requirements

### Requirement: 房间订阅与状态广播
系统 SHALL 允许已鉴权连接订阅自己所在的在线房间。socket 服务 MUST 校验连接用户属于目标房间后才允许订阅；订阅成功、首次进入、重连和恢复时服务端 MUST 向该连接发送当前权威快照。服务端权威状态变化后 SHOULD 通过 socket 向房间内已订阅连接推送权威事件或增量 delta，并仅在首次订阅、重连、事件缺口或无法安全增量表达时下发完整快照。公共消息不得包含其他玩家私密手牌；本人私密视图只发给对应玩家连接。

#### Scenario: 房间成员订阅成功
- **WHEN** 已鉴权玩家订阅自己所在的房间
- **THEN** socket 服务 MUST 记录该连接的房间订阅
- **AND** 服务端 MUST 向该连接发送当前权威快照

#### Scenario: 非成员订阅被拒绝
- **WHEN** 已鉴权玩家尝试订阅自己不属于的房间
- **THEN** socket 服务 MUST 拒绝订阅
- **AND** 服务端 MUST NOT 下发该房间的公共状态或私密状态

#### Scenario: 状态变化广播增量
- **WHEN** 服务端裁决导致房间权威状态变化且该变化可安全增量表达
- **THEN** socket 服务 SHOULD 向该房间所有已订阅连接推送权威事件或增量 delta
- **AND** socket 服务 MUST NOT 在正常路径为每个连接重新拉取并下发完整快照

#### Scenario: 需要快照恢复
- **WHEN** 客户端首次订阅、重连、报告事件缺口、codec 不支持或增量无法应用
- **THEN** socket 服务 MUST 向该连接下发最新权威快照
- **AND** 快照 MUST 包含该连接玩家可见的公共状态和本人私密视图
