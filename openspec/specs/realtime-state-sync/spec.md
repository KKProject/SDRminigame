# realtime-state-sync Specification

## Purpose
TBD - created by archiving change add-wechat-online-battle. Update Purpose after archive.
## Requirements
### Requirement: 权威状态实时下发
系统 SHALL 通过微信云开发的实时数据推送把牌桌公共状态下发给本局所有客户端。客户端 MUST 订阅本牌桌的公共状态并在状态变化时更新本地镜像与渲染；公共状态 MUST 只包含可对全体玩家公开的信息（阶段、当前行动席、各席公开资料与分数、最近弃牌、将牌、待响应动作摘要等）。

#### Scenario: 状态变化推送
- **WHEN** 服务端更新了牌桌公共状态
- **THEN** 订阅该牌桌的客户端 MUST 收到最新公共状态
- **AND** 客户端 MUST 用最新状态刷新牌桌渲染

#### Scenario: 客户端只镜像不裁决
- **WHEN** 客户端收到新的公共状态
- **THEN** 客户端 MUST 把该状态写入本地状态镜像用于渲染
- **AND** 客户端 MUST NOT 用本地推断替代服务端下发的权威字段

### Requirement: 私密手牌保密下发
系统 SHALL 保证每位玩家只能获取自己的私密信息（如手牌）。私密手牌 MUST 仅通过按 OPENID 鉴权的通道下发给本人；公共状态文档 MUST NOT 包含其他玩家的手牌明细。

#### Scenario: 玩家获取本人手牌
- **WHEN** 玩家需要查看或操作自己的手牌
- **THEN** 系统 MUST 仅向该玩家本人下发其手牌
- **AND** 其他玩家 MUST NOT 能从公共状态读取到该玩家手牌

#### Scenario: 公共状态不含他人手牌
- **WHEN** 客户端订阅牌桌公共状态
- **THEN** 公共状态 MUST NOT 包含任何玩家的私密手牌明细
- **AND** 仅 MUST 包含各玩家的公开信息（如已亮出的凑牌、弃牌、分数）

### Requirement: 操作意图上报
系统 SHALL 让客户端以「操作意图」形式把玩家动作上报服务端，而不是本地直接执行。客户端 MUST 把出牌、吃、碰、招、踏、胡、过、接庄、不接庄等动作作为意图提交，并在服务端确认后才反映为最终状态。

#### Scenario: 上报出牌意图
- **WHEN** 玩家在自己回合选择打出一张牌
- **THEN** 客户端 MUST 把该出牌意图上报服务端
- **AND** 客户端 MUST 等待服务端下发的权威状态来确认该出牌结果

#### Scenario: 意图被拒绝的反馈
- **WHEN** 服务端拒绝某个操作意图
- **THEN** 客户端 MUST 保持服务端权威状态显示不变
- **AND** 客户端 MUST 向玩家展示对应的拒绝提示

### Requirement: 断线重连恢复
系统 SHALL 支持玩家断线后重连并恢复当前牌局视图。客户端重连后 MUST 从服务端拉取当前权威状态与本人手牌并重新订阅推送；服务端 MUST 在玩家掉线期间保留其牌局状态。

#### Scenario: 重连恢复牌局
- **WHEN** 玩家断线后重新进入同一牌局
- **THEN** 客户端 MUST 拉取最新权威公共状态与本人手牌并重新订阅推送
- **AND** 玩家 MUST 看到与当前牌局一致的视图

#### Scenario: 掉线期间状态保留
- **WHEN** 玩家在牌局进行中掉线
- **THEN** 服务端 MUST 保留该玩家在牌局中的状态
- **AND** 服务端 MUST 在重连后允许其继续参与，或在超时后按托管规则处理

