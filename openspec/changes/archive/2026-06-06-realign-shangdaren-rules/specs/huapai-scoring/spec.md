## MODIFIED Requirements

### Requirement: Fu Calculation
The system SHALL calculate Shang Da Ren fu after a legal hu using the winning doors, concealed natural groups, exposed action groups, card colors, zhao/ta increments, phrase doors, and the round's jiang phrase. The system SHALL calculate each scoring door's base fu and increments first, then apply the jiang multiplier if that door belongs to the jiang phrase.

#### Scenario: Phrase door fu
- **WHEN** a winning decomposition contains an `xyz` phrase door from hand, chi, or the winning appearing card
- **THEN** the system MUST count 1 fu for that phrase door before jiang multiplier is applied

#### Scenario: Jiang phrase door fu
- **WHEN** a winning decomposition contains an `xyz` phrase door whose phrase is the jiang phrase
- **THEN** the system MUST count 4 fu for that phrase door after applying the jiang multiplier

#### Scenario: Red peng fu
- **WHEN** a winning hand contains a red-character `xxx` peng group that is not part of a plain phrase or `xy` tazi
- **THEN** the system MUST count 4 fu for that group before jiang multiplier is applied

#### Scenario: Green or black peng fu
- **WHEN** a winning hand contains a green-character or black-character `xxx` peng group that is not part of a plain phrase or `xy` tazi
- **THEN** the system MUST count 2 fu for that group before jiang multiplier is applied

#### Scenario: Red natural kezi fu
- **WHEN** a winning hand contains a red-character natural concealed `xxx` kezi that existed in the initial hand or concealed hand state and was not created by peng
- **THEN** the system MUST count 8 fu for that group before jiang multiplier is applied

#### Scenario: Green or black natural kezi fu
- **WHEN** a winning hand contains a green-character or black-character natural concealed `xxx` kezi that existed in the initial hand or concealed hand state and was not created by peng
- **THEN** the system MUST count 4 fu for that group before jiang multiplier is applied

#### Scenario: Zhao fu from natural kezi
- **WHEN** a natural red-character kezi becomes `xxxx`, `xxxxx`, or `xxxxxx` through zhao
- **THEN** the system MUST start from 8 fu and add 4 fu for each card beyond the base `xxx` group before jiang multiplier is applied

#### Scenario: Zhao fu from peng
- **WHEN** a red-character peng group becomes `xxxx`, `xxxxx`, or `xxxxxx` through zhao
- **THEN** the system MUST start from 4 fu and add 4 fu for each card beyond the base `xxx` group before jiang multiplier is applied

#### Scenario: Green or black zhao fu
- **WHEN** a green-character or black-character kezi or peng group becomes `xxxx`, `xxxxx`, or `xxxxxx` through zhao
- **THEN** the system MUST use the corresponding green/black base fu and add 2 fu for each card beyond the base `xxx` group before jiang multiplier is applied

#### Scenario: Ta fu
- **WHEN** a red-character zhao group receives a ta card
- **THEN** the system MUST add 4 fu for each ta increment before jiang multiplier is applied

#### Scenario: Green or black ta fu
- **WHEN** a green-character or black-character zhao group receives a ta card
- **THEN** the system MUST add 2 fu for each ta increment before jiang multiplier is applied

#### Scenario: Jiang multiplier
- **WHEN** a scoring group belongs to the round's jiang phrase
- **THEN** the system MUST multiply that scoring group's base-and-increment fu by 4 before adding it to total fu

#### Scenario: Non-scoring doors
- **WHEN** a winning decomposition contains `xx` or the required final `xy`
- **THEN** the system MUST count those doors as valid doors but MUST NOT add standalone fu for them

#### Scenario: Fu remains integer
- **WHEN** the system totals all fu entries for a legal hu
- **THEN** the total fu MUST be an integer value

### Requirement: 当前局操作福数显示值
系统 SHALL 为每个玩家提供当前局已操作牌福数显示值。该值 SHALL 只统计当前局已经公开形成的操作牌组，包括吃、碰、招、踏以及其他按福数规则可计分的公开牌组；不统计尚未公开的手牌。普通吃牌句子 SHALL 计 1 福，将牌句子的吃牌 SHALL 计 4 福。计算口径 SHALL 复用胡牌福数规则中的吃牌、颜色、招、踏和将牌倍数逻辑，使局中显示值与最终计福口径一致。

#### Scenario: 新局操作福数归零
- **WHEN** 新一局开始
- **THEN** 每个玩家的当前局已操作牌福数显示值 MUST 为 0

#### Scenario: 吃牌增加一福
- **WHEN** 玩家通过吃形成普通 `xyz` 句子
- **THEN** 该操作牌组 MUST 作为公开操作显示
- **AND** 当前局已操作牌福数显示值 MUST 增加 1 福

#### Scenario: 将牌吃牌增加四福
- **WHEN** 玩家通过吃形成属于将牌句子的 `xyz`
- **THEN** 当前局已操作牌福数显示值 MUST 增加 4 福

#### Scenario: 碰牌增加福数
- **WHEN** 玩家通过碰形成 `xxx` 公开牌组
- **THEN** 当前局已操作牌福数显示值 MUST 按碰牌颜色和将牌规则增加对应福数

#### Scenario: 招牌增加福数
- **WHEN** 玩家通过招形成 `xxxx`、`xxxxx` 或 `xxxxxx` 公开牌组
- **THEN** 当前局已操作牌福数显示值 MUST 按该牌组的来源基础福数、颜色、招牌增量和将牌倍率计算公开牌组福数

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
The system SHALL convert the classified hu grade or circle-loss result into point changes using a base score of 1 point. Any hu SHALL be paid by the other three players equally, regardless of self-draw, discard win, or interception. Circle-loss SHALL make the circle-loss player pay the other three players 1 base point each.

#### Scenario: Pi hu points
- **WHEN** a winning result is classified as `屁胡`
- **THEN** the system MUST assign 1 point as each losing player's payment to the winner

#### Scenario: Jia points
- **WHEN** a winning result is classified as `大甲` or `小甲`
- **THEN** the system MUST assign 2 points as each losing player's payment to the winner

#### Scenario: Chang points
- **WHEN** a winning result is classified as `场`
- **THEN** the system MUST assign 4 points as each losing player's payment to the winner

#### Scenario: Three players pay for hu
- **WHEN** any player wins by self-draw, discard win, or interception
- **THEN** the system MUST deduct the hu grade payment from each of the other three players
- **AND** the system MUST add the sum of those three payments to the winner

#### Scenario: Discarder does not pay extra
- **WHEN** a player's discarded card causes another player to hu
- **THEN** the discarder MUST NOT pay any extra point beyond the same payment owed by each non-winning player

#### Scenario: Circle-loss settlement
- **WHEN** a player enters circle-loss
- **THEN** the system MUST deduct 1 base point from the circle-loss player for each other player
- **AND** the system MUST add 1 base point to each of the other three players

#### Scenario: Scoring summary
- **WHEN** the system resolves a legal hu or circle-loss
- **THEN** the result MUST include total fu when applicable, itemized fu entries when applicable, hu grade when applicable, base score, point value, payer/payee summary, and whether jiang multipliers were applied
