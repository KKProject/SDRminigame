## ADDED Requirements

### Requirement: 配置化胡牌结算
The system SHALL calculate win settlement points from the winning hand grade, total fu, and room settlement rules. A normal `场` hand SHALL charge each non-winning player 4 points; when heavy-round settlement is enabled and the winning hand has total fu greater than or equal to 88, the same `场` hand SHALL charge each non-winning player 8 points. Heavy-round settlement MUST NOT change the hand grade or total fu.

#### Scenario: 普通场按一场结算
- **WHEN** a player wins with grade `场`
- **AND** heavy-round settlement is disabled
- **THEN** each non-winning player MUST pay 4 points to the winner
- **AND** the result MUST NOT be marked as heavy-round settlement

#### Scenario: 低于八十八福不触发重场
- **WHEN** a player wins with grade `场`
- **AND** heavy-round settlement is enabled
- **AND** the winning hand has total fu less than 88
- **THEN** each non-winning player MUST pay 4 points to the winner
- **AND** the result MUST NOT be marked as heavy-round settlement

#### Scenario: 八十八福场触发重场
- **WHEN** a player wins with grade `场`
- **AND** heavy-round settlement is enabled
- **AND** the winning hand has total fu greater than or equal to 88
- **THEN** each non-winning player MUST pay 8 points to the winner
- **AND** the result MUST keep grade `场`
- **AND** the result MUST be marked as heavy-round settlement

### Requirement: 配置化进圈赔付
The system SHALL calculate circle-loss settlement points from the room's configured circle-loss pay type. `pihu` SHALL pay 1 point to each winner, `jiahu` SHALL pay 2 points to each winner, and `changhu` SHALL pay 4 points to each winner.

#### Scenario: 进圈按屁胡赔付
- **WHEN** a player enters circle-loss with circle-loss pay type `pihu`
- **THEN** the losing player MUST pay 1 point to each of the other three players

#### Scenario: 进圈按甲胡赔付
- **WHEN** a player enters circle-loss with circle-loss pay type `jiahu`
- **THEN** the losing player MUST pay 2 points to each of the other three players

#### Scenario: 进圈按场胡赔付
- **WHEN** a player enters circle-loss with circle-loss pay type `changhu`
- **THEN** the losing player MUST pay 4 points to each of the other three players

### Requirement: 单局结算分差
The system SHALL include deterministic payment details and per-seat round score deltas in every win or circle-loss result. The sum of all round score deltas MUST equal zero.

#### Scenario: 胡牌结果包含单局分差
- **WHEN** a player wins and the result is created
- **THEN** the result MUST include one payment from each non-winning player to the winner
- **AND** the result MUST include each seat's score delta for that round
- **AND** the winner's round score delta MUST equal the sum of received payments

#### Scenario: 进圈结果包含单局分差
- **WHEN** a player enters circle-loss and the result is created
- **THEN** the result MUST include one payment from the losing player to each of the other three players
- **AND** the result MUST include each seat's score delta for that round
- **AND** all round score deltas MUST sum to zero
