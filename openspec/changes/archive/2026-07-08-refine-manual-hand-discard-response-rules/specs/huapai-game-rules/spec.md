## MODIFIED Requirements

### Requirement: Win Detection
The system SHALL detect winning hands using the eight-door Shang Da Ren rule. A winning hand MUST decompose into exactly 8 doors, each door MUST be one of `xxx`, `xyz`, `xxxx`, `xxxxx`, `xxxxxx`, `xx`, or `xy`, and the decomposition MUST contain exactly one `xy` door. Support-pair constraints for 4/5/6-of-a-kind doors MUST be satisfied, and manual hand-discard response restrictions MUST be applied before exposing hu actions.

#### Scenario: Eight-door win succeeds
- **WHEN** a player's concealed cards, exposed groups, and the appearing card can be decomposed into 8 valid doors with exactly one `xy` door and all required support pairs
- **AND** the appearing card is not blocked by manual hand-discard response restrictions
- **THEN** the system MUST produce a win result containing winner, source, winning card, doors, support-pair summary, scoring summary, hu grade, and point-settlement summary

#### Scenario: Missing xy door fails
- **WHEN** a candidate hand has 8 valid-looking doors but does not contain exactly one `xy` door
- **THEN** the system MUST reject the win

#### Scenario: Multiple xy doors fail
- **WHEN** a candidate hand can only be decomposed with more than one `xy` door
- **THEN** the system MUST reject the win

#### Scenario: Support pairs are insufficient
- **WHEN** a candidate hand contains 4/5/6-of-a-kind doors but lacks the required number of valid support-pair doors or violates distinct-pair requirements
- **THEN** the system MUST reject the win or mark circle-loss if the invalid support state was caused by an illegal zhao or ta

#### Scenario: Appearing card completes xy
- **WHEN** the appearing card combines with one same-phrase hand card to form the only `xy` door in an otherwise legal 8-door decomposition
- **AND** the appearing card is not blocked by manual hand-discard response restrictions
- **THEN** the system MUST allow hu from any appearing-card source

#### Scenario: Appearing card completes pair
- **WHEN** the appearing card combines with one matching hand card to form an `xx` pair door and the decomposition still contains exactly one other `xy` door
- **AND** the appearing card is not blocked by manual hand-discard response restrictions
- **THEN** the system MUST allow hu

#### Scenario: Appearing card triggers regrouping
- **WHEN** a player has a complete `xyz` phrase and the appearing card is another character from that phrase, allowing regrouping such as `xyz + x` into `xx + yz`
- **AND** the appearing card is not blocked by manual hand-discard response restrictions
- **THEN** the system MUST allow that regrouping only if the final decomposition has exactly 8 doors and exactly one `xy`

#### Scenario: Dealer listening requires kezi
- **WHEN** the active dealer or takeover dealer reaches a listening candidate state
- **THEN** the system MUST treat the state as legal only if the hand or exposed groups still contain at least one `xxx` or larger same-character kezi, counting zhao and ta groups as kezi

#### Scenario: Dealer splits last kezi through chi
- **WHEN** a dealer or takeover dealer uses chi in a way that leaves no remaining `xxx` or larger same-character kezi
- **THEN** the system MUST end the round as circle-loss for that dealer

#### Scenario: Single winner by response order
- **WHEN** multiple players can hu with the same appearing card
- **THEN** the system MUST award hu only to the first legal player in the current response order

### Requirement: Discarded Key Response Restrictions
The system SHALL maintain, for each player and round, a manual hand-discard key record containing only character keys that the player actively discarded from the opening dealt hand. The system SHALL prevent that player from later claiming an appearing card with the same key through chi or hu, and SHALL treat a mandatory chi that is blocked by this record as circle-loss for that player.

#### Scenario: Opening hand discard creates response restriction
- **WHEN** a player actively selects and discards key `x` from the player's opening dealt hand during the current round
- **THEN** the system MUST add key `x` to that player's manual hand-discard key record for the current round

#### Scenario: Drawn card flow does not create response restriction
- **WHEN** a player draws key `x` from the deck after the opening deal
- **AND** no player claims that drawn appearing card
- **THEN** the system MUST move or record that card according to the draw flow without adding key `x` to the drawing player's manual hand-discard key record

#### Scenario: Claimed hand discard remains recorded
- **WHEN** a player actively discards key `x` from the player's opening dealt hand
- **AND** that discarded card is later removed from the discard pile because another player claims it
- **THEN** the system MUST still treat key `x` as manually hand-discarded by the original player for future chi and hu restrictions

#### Scenario: Manually hand-discarded key cannot be chi
- **WHEN** a player has key `x` in the player's manual hand-discard key record
- **AND** an appearing card with key `x` creates an otherwise legal chi action for that player
- **THEN** the system MUST NOT offer or allow a chi action for that player with key `x`

#### Scenario: Manually hand-discarded key cannot be hu
- **WHEN** a player has key `x` in the player's manual hand-discard key record
- **AND** an appearing card with key `x` creates an otherwise legal hu action for that player
- **THEN** the system MUST NOT offer or allow hu for that player with that appearing card

#### Scenario: Non-hand discard does not block chi or hu
- **WHEN** key `x` previously appeared only through a post-opening draw flow or another non-hand-discard event for a player
- **AND** a later appearing card with key `x` creates an otherwise legal chi or hu action for that player
- **THEN** the system MUST allow that chi or hu if all other rule requirements are satisfied

#### Scenario: Mandatory chi blocked by manual hand discard causes circle-loss
- **WHEN** an appearing card with key `x` creates a mandatory chi for a player
- **AND** key `x` is in that player's manual hand-discard key record
- **THEN** the system MUST end the round as circle-loss for that player
- **AND** the result MUST pay the other three seats according to the configured circle-loss settlement
