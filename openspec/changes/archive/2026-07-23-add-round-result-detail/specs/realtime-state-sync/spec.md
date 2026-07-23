## ADDED Requirements

### Requirement: 结果阶段公开冻结牌况
实时同步系统 SHALL 在权威牌局进入 `phase=result` 后向本局玩家公开冻结的 `roundDetail`，其中包含四名玩家的最终剩余手牌、公开牌组、本局分数和胡牌玩家最终胡数。系统 MUST 保证非结果阶段的公共 snapshot 与 delta 继续只公开其他玩家的手牌数量，不得携带其完整手牌。

#### Scenario: 进行中不公开对手手牌
- **WHEN** 权威牌局尚未进入 `phase=result`
- **THEN** 公共 snapshot 和 delta MUST NOT 包含其他玩家的完整手牌
- **AND** 现有本人私密手牌下发边界 MUST 保持不变

#### Scenario: 结果阶段公开四家最终手牌
- **WHEN** 权威牌局已经进入 `phase=result`
- **THEN** 公共状态 MUST 包含与当前局号绑定的四家冻结最终牌况
- **AND** 每家详情 MUST 包含座位、最终剩余手牌、公开牌组和本局分数
- **AND** 只有胡牌赢家的详情 MAY 包含最终胡数

#### Scenario: 下一局清除上一局牌况
- **WHEN** 所有真人确认后服务端开始下一局
- **THEN** 新局公共状态 MUST 不再包含上一局的 `roundDetail`
- **AND** 其他玩家的新局手牌 MUST 恢复为仅公开数量

#### Scenario: 结果详情等待终局动画提交
- **WHEN** 客户端先收到 `phase=result` 和 `roundDetail`，但对应终局事件仍在时间线播放
- **THEN** 客户端 MUST 暂存权威结果详情
- **AND** 客户端 MUST 在终局事件完成、快进或跳过的显示提交点才展示全屏结果页

### Requirement: 下一局确认状态实时同步
实时同步系统 SHALL 向每名房间玩家下发当前局的继续确认摘要，并 MUST 通过 snapshot、delta 和重连恢复保持所需真人、已确认真人及本人确认状态一致。确认状态 MUST 与局号绑定，重复或迟到请求不得错误开启下一局。

#### Scenario: 玩家确认后广播等待状态
- **WHEN** 一名真人点击“继续下一局”且仍有其他真人未确认
- **THEN** 服务端 MUST 幂等记录该玩家确认
- **AND** 所有客户端 MUST 收到更新后的已确认人数或座位摘要
- **AND** 已确认客户端 MUST 禁止重复提交但继续显示结果详情

#### Scenario: 重连恢复结果与确认状态
- **WHEN** 玩家在结果详情阶段断线并重新连接
- **THEN** 服务端 MUST 返回同一局冻结的 `roundDetail`
- **AND** 客户端 MUST 恢复该玩家是否已经确认及其他玩家的等待状态

#### Scenario: 拒绝迟到的上一局确认
- **WHEN** 服务端收到绑定旧局号的继续确认请求
- **THEN** 服务端 MUST 拒绝或幂等忽略该请求
- **AND** 当前局状态 MUST NOT 因该请求推进
