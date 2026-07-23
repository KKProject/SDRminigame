## MODIFIED Requirements

### Requirement: 结果阶段公开冻结牌况
实时同步系统 SHALL 在权威牌局进入 `phase=result` 后向本局玩家公开冻结的 `roundDetail`，其中包含四名玩家的最终剩余手牌、公开牌组、本局分数和胡牌玩家最终胡数。胡牌结果中，赢家详情 MUST 额外包含从权威 `result.card` 与 `result.doors` 冻结的最后胡牌和完整胡牌分组；完整胡牌分组 MUST 包含最后胡牌，最后胡牌字段 MUST 允许客户端将同一张牌再次显示为独立“胡”列。系统 MUST 保证非结果阶段的公共 snapshot 与 delta 继续只公开其他玩家的手牌数量，不得携带其完整手牌。

#### Scenario: 进行中不公开对手手牌
- **WHEN** 权威牌局尚未进入 `phase=result`
- **THEN** 公共 snapshot 和 delta MUST NOT 包含其他玩家的完整手牌
- **AND** 现有本人私密手牌下发边界 MUST 保持不变

#### Scenario: 结果阶段公开四家最终手牌
- **WHEN** 权威牌局已经进入 `phase=result`
- **THEN** 公共状态 MUST 包含与当前局号绑定的四家冻结最终牌况
- **AND** 每家详情 MUST 包含座位、最终剩余手牌、公开牌组和本局分数
- **AND** 只有胡牌赢家的详情 MAY 包含最终胡数

#### Scenario: 胡牌结果冻结最后胡牌和完整分组
- **WHEN** 服务端完成胡牌裁决并构造 `roundDetail`
- **THEN** 赢家详情 MUST 包含与权威 `result.card` 一致的 `winningCard`
- **AND** 赢家详情 MUST 包含由权威 `result.doors` 和冻结牌对象构成的 `winningGroups`
- **AND** `finalHand` 或 `winningGroups` 中的完整胡牌牌型 MUST 继续包含 `winningCard`
- **AND** 服务端 MUST NOT 为非赢家或非胡牌结果伪造最后胡牌
- **AND** 赢家详情 MUST 包含来自权威结果的 `huGrade`
- **AND** 非赢家的 `huGrade` MUST 为空

#### Scenario: 吃上胡的冻结结果不去重
- **WHEN** 权威胡牌分组包含以“上”完成的“上大人”吃牌句子
- **THEN** `winningGroups` MUST 包含完整的“上大人”牌组及“吃”语义
- **AND** `winningCard` MUST 另行指向“上”牌
- **AND** 冻结结果 MUST NOT 因两处引用同一张牌而删除任一展示语义

#### Scenario: 冻结结果保留碰招踏语义
- **WHEN** 服务端将权威胡牌门转换为 `winningGroups`
- **THEN** 三张同字门 MUST 标记为“碰”
- **AND** 四张及以上同字门 MUST 标记为“招”
- **AND** `meldType` 为 `ta` 的公开门 MUST 标记为“踏”
- **AND** 服务端 MUST NOT 将招或踏统一标记为“碰”

#### Scenario: 冻结结果区分对门和口门
- **WHEN** 服务端将权威胡牌门转换为 `winningGroups`
- **THEN** `xx` 门 MUST 标记为“对”
- **AND** `xy` 门 MUST 标记为“口”
- **AND** 服务端 MUST NOT 将 `xy` 门标记为“对”

#### Scenario: 结果增量和重连保持胡牌详情
- **WHEN** 客户端通过结果 delta、完整 snapshot 或重连恢复接收同一局 `roundDetail`
- **THEN** `winningCard` 和 `winningGroups` MUST 保持一致
- **AND** 客户端座位旋转 MUST 只调整玩家 seat，不得改变胡牌对象或分组牌序
- **AND** `huGrade` MUST 在结果 delta、完整 snapshot 和重连恢复之间保持一致

#### Scenario: 下一局清除上一局牌况
- **WHEN** 所有真人确认后服务端开始下一局
- **THEN** 新局公共状态 MUST 不再包含上一局的 `roundDetail`
- **AND** 其他玩家的新局手牌 MUST 恢复为仅公开数量

#### Scenario: 结果详情等待终局动画提交
- **WHEN** 客户端先收到 `phase=result` 和 `roundDetail`，但对应终局事件仍在时间线播放
- **THEN** 客户端 MUST 暂存权威结果详情
- **AND** 客户端 MUST 在终局事件完成、快进或跳过的显示提交点才展示全屏结果页
