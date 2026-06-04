# huapai-scoring Specification

## Purpose
TBD - created by archiving change align-with-reorganized-shangdaren-rules. Update Purpose after archive.
## Requirements
### Requirement: Fu Calculation
The system SHALL calculate Shang Da Ren fu after a legal hu using the winning doors, exposed action groups, card colors, zhao/ta increments, and the round's jiang phrase.

#### Scenario: Red peng fu
- **WHEN** a winning hand contains a red-character `xxx` peng or kezi group that is not part of a plain phrase or `xy` tazi
- **THEN** the system MUST count 4 fu for that group before jiang multiplier is applied

#### Scenario: Green or black peng fu
- **WHEN** a winning hand contains a green-character or black-character `xxx` peng or kezi group that is not part of a plain phrase or `xy` tazi
- **THEN** the system MUST count 2 fu for that group before jiang multiplier is applied

#### Scenario: Repeated red kezi fu
- **WHEN** a winning hand contains 3 red-character kezi groups
- **THEN** the system MUST count 8 fu for those red kezi groups and add 4 fu for each additional red-character kezi group

#### Scenario: Repeated green or black kezi fu
- **WHEN** a winning hand contains 3 green-character or 3 black-character kezi groups of the same color category
- **THEN** the system MUST count half of the corresponding red-character repeated-kezi fu for those groups

#### Scenario: Zhao fu
- **WHEN** a red-character kezi becomes `xxxx`, `xxxxx`, or `xxxxxx` through zhao
- **THEN** the system MUST add 4 fu for each card beyond the base `xxx` group before jiang multiplier is applied

#### Scenario: Green or black zhao fu
- **WHEN** a green-character or black-character kezi becomes `xxxx`, `xxxxx`, or `xxxxxx` through zhao
- **THEN** the system MUST add 2 fu for each card beyond the base `xxx` group before jiang multiplier is applied

#### Scenario: Ta fu
- **WHEN** a red-character zhao group receives a ta card
- **THEN** the system MUST add 4 fu for each ta increment before jiang multiplier is applied

#### Scenario: Green or black ta fu
- **WHEN** a green-character or black-character zhao group receives a ta card
- **THEN** the system MUST add 2 fu for each ta increment before jiang multiplier is applied

#### Scenario: Jiang multiplier
- **WHEN** a scoring group belongs to the round's jiang phrase
- **THEN** the system MUST multiply that scoring group's fu by 4 before adding it to total fu

#### Scenario: Non-scoring doors
- **WHEN** a winning decomposition contains `xx`, `xyz`, or the required final `xy`
- **THEN** the system MUST count those doors as valid doors but MUST NOT add standalone fu for them

### Requirement: 当前局操作福数显示值
系统 SHALL 为每个玩家提供当前局已操作牌福数显示值。该值 SHALL 只统计当前局已经公开形成的操作牌组，包括吃、碰、招、踏以及其他按福数规则可计分的公开牌组；不统计尚未公开的手牌。普通吃牌句子 SHALL 计 1 福。计算口径 SHALL 尽量复用胡牌福数规则中的吃牌、颜色、招、踏和将牌倍数逻辑，使局中显示值与最终计福口径一致。

#### Scenario: 新局操作福数归零
- **WHEN** 新一局开始
- **THEN** 每个玩家的当前局已操作牌福数显示值 MUST 为 0

#### Scenario: 吃牌增加一福
- **WHEN** 玩家通过吃形成普通 `xyz` 句子
- **THEN** 该操作牌组 MUST 作为公开操作显示
- **AND** 当前局已操作牌福数显示值 MUST 增加 1 福

#### Scenario: 碰牌增加福数
- **WHEN** 玩家通过碰形成 `xxx` 公开牌组
- **THEN** 当前局已操作牌福数显示值 MUST 按该字颜色和将牌规则增加对应福数

#### Scenario: 招牌增加福数
- **WHEN** 玩家通过招形成 `xxxx`、`xxxxx` 或 `xxxxxx` 公开牌组
- **THEN** 当前局已操作牌福数显示值 MUST 按基础刻子和招牌增量规则计算该公开牌组福数

#### Scenario: 踏牌更新福数
- **WHEN** 已招牌组通过踏增加牌数
- **THEN** 当前局已操作牌福数显示值 MUST 重新反映踏牌后的公开牌组福数

#### Scenario: 只统计当前玩家公开操作
- **WHEN** 计算某个玩家头像下方的当前局已操作牌福数
- **THEN** 系统 MUST 只统计该玩家自己的公开操作牌组
- **AND** 不得混入其他玩家的公开操作牌组或弃牌

### Requirement: Hu Grade Classification
The system SHALL classify each legal hu into the highest applicable grade among `场`, `大甲`, `小甲`, and `屁胡`.

#### Scenario: Xiao jia
- **WHEN** a legal hu decomposes into 7 `xyz` phrase doors and exactly 1 `xy` tazi door
- **THEN** the system MUST classify it as at least `小甲`, even when phrase doors repeat the same phrase

#### Scenario: Da jia
- **WHEN** a legal hu has total fu greater than or equal to 33 and less than or equal to 43
- **THEN** the system MUST classify it as at least `大甲`

#### Scenario: Chang
- **WHEN** a legal hu has total fu greater than or equal to 44
- **THEN** the system MUST classify it as `场`

#### Scenario: Grade priority
- **WHEN** a legal hu satisfies multiple grade conditions
- **THEN** the system MUST choose the highest grade by priority `场 > 大甲 > 小甲 > 屁胡`

#### Scenario: Pi hu fallback
- **WHEN** a legal hu satisfies none of the `场`, `大甲`, or `小甲` conditions
- **THEN** the system MUST classify it as `屁胡`

### Requirement: Point Settlement
The system SHALL convert the classified hu grade into points using a base score of 1 point.

#### Scenario: Pi hu points
- **WHEN** a winning result is classified as `屁胡`
- **THEN** the system MUST assign 1 point to the winner's settlement value

#### Scenario: Jia points
- **WHEN** a winning result is classified as `大甲` or `小甲`
- **THEN** the system MUST assign 2 points to the winner's settlement value

#### Scenario: Chang points
- **WHEN** a winning result is classified as `场`
- **THEN** the system MUST assign 4 points to the winner's settlement value

#### Scenario: Scoring summary
- **WHEN** the system resolves a legal hu
- **THEN** the result MUST include total fu, itemized fu entries, hu grade, base score, point value, and whether jiang multipliers were applied
