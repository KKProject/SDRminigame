## ADDED Requirements

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
