## ADDED Requirements

### Requirement: 在线待响应出牌出现动画唯一
在线权威出牌事件处于动画等待或响应窗口期间时，客户端 SHALL 使用该权威事件作为出牌出现动画的唯一正常播放入口；状态观察补偿入口 MUST NOT 为同一 `recentDiscard` 启动额外出现动画。

#### Scenario: 其他玩家出牌且本机需要响应
- **WHEN** 客户端收到其他玩家的 `discard` 权威事件，且服务端快照包含同一张 `recentDiscard` 与本机可用响应动作
- **THEN** 客户端 MUST 只播放一次该出牌的出现动画
- **AND** 客户端 MUST NOT 同时启动 `online:<eventSeq>` 与 `state:discard:<seat>:<cardId>` 两个出现牌动画
- **AND** 入场动画完成后该牌 MUST 保留在出牌玩家前方等待响应

#### Scenario: 在线动画等待期间状态观察不抢播
- **WHEN** 服务端快照标记当前存在在线动画等待，且 `recentDiscard` 指向当前权威出牌事件
- **THEN** 状态观察器 MUST NOT 根据该 `recentDiscard` 播放补偿出现动画
- **AND** 权威事件入口 MUST 继续负责播放、保留和完成回执

#### Scenario: 无权威事件恢复仍显示牌面
- **WHEN** 客户端恢复时没有可播放的在线权威事件，但权威状态仍包含需要展示的待响应出牌
- **THEN** 客户端 MUST 恢复正确牌面显示
- **AND** 客户端 MAY 使用状态补偿或静态恢复路径
- **AND** 客户端 MUST NOT 在已播放过同一权威事件后重新播放入场动画
