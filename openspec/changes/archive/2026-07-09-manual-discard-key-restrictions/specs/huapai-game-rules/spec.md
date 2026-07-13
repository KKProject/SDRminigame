## MODIFIED Requirements

### Requirement: Discarded Key Response Restrictions
The system SHALL maintain, for each player and round, a manual hand-discard key record containing only character keys that the player actively discarded from hand by selecting a hand card and confirming discard (`discard` event). The system SHALL NOT treat draw auto-discard (`auto-discard-draw`) as a manual hand discard. The system SHALL prevent that player from later claiming an appearing card with the same key through chi, peng, zhao, ta, or hu, even if the player still holds other hand cards with that key. The system SHALL treat a mandatory chi that is blocked by this record as circle-loss for that player.

#### Scenario: Manual hand discard creates response restriction
- **WHEN** a player actively selects and discards key `x` from hand during the current round
- **THEN** the system MUST add key `x` to that player's manual hand-discard key record for the current round

#### Scenario: Draw auto-discard does not create response restriction
- **WHEN** a player draws key `x` and no player claims that appearing card
- **AND** the system auto-discards that card as `auto-discard-draw`
- **THEN** the system MUST NOT add key `x` to that player's manual hand-discard key record

#### Scenario: Claimed hand discard remains recorded
- **WHEN** a player actively discards key `x` from hand
- **AND** that discarded card is later removed from the discard pile because another player claims it
- **THEN** the system MUST still treat key `x` as manually hand-discarded by the original player for future response restrictions

#### Scenario: Manually hand-discarded key cannot be chi
- **WHEN** a player has key `x` in the manual hand-discard key record
- **AND** an appearing card with key `x` creates an otherwise legal chi action for that player
- **THEN** the system MUST NOT offer or allow a chi action for that player with key `x`

#### Scenario: Manually hand-discarded key cannot be peng
- **WHEN** a player has key `x` in the manual hand-discard key record
- **AND** an appearing card with key `x` creates an otherwise legal peng action for that player
- **THEN** the system MUST NOT offer or allow peng for that player with key `x`
- **AND** the restriction MUST apply even if the player still holds two or more hand cards with key `x`

#### Scenario: Manually hand-discarded key cannot be zhao
- **WHEN** a player has key `x` in the manual hand-discard key record
- **AND** an appearing card with key `x` creates an otherwise legal zhao action for that player
- **THEN** the system MUST NOT offer or allow zhao for that player with key `x`

#### Scenario: Manually hand-discarded key cannot be ta
- **WHEN** a player has key `x` in the manual hand-discard key record
- **AND** an appearing card with key `x` creates an otherwise legal ta action for that player
- **THEN** the system MUST NOT offer or allow ta for that player with key `x`

#### Scenario: Manually hand-discarded key cannot be hu
- **WHEN** a player has key `x` in the manual hand-discard key record
- **AND** an appearing card with key `x` creates an otherwise legal hu action for that player
- **THEN** the system MUST NOT offer or allow hu for that player with that appearing card

#### Scenario: Non-manual discard does not block responses
- **WHEN** key `x` previously appeared only through draw auto-discard or another non-manual-hand-discard event for a player
- **AND** a later appearing card with key `x` creates an otherwise legal response action for that player
- **THEN** the system MUST allow that response if all other rule requirements are satisfied

#### Scenario: Mandatory chi blocked by manual hand discard causes circle-loss
- **WHEN** an appearing card with key `x` creates a mandatory chi for a player
- **AND** key `x` is in that player's manual hand-discard key record
- **THEN** the system MUST end the round as circle-loss for that player
- **AND** the result MUST pay the other three seats according to the configured circle-loss settlement
