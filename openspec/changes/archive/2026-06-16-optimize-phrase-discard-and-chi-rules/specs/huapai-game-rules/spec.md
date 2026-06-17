## ADDED Requirements

### Requirement: Discarded Key Response Restrictions
The system SHALL prevent a player from eating back a character key that the same player has previously discarded in the current round, including chi actions and chi-style hu decompositions.

#### Scenario: Previously discarded key cannot be chi
- **WHEN** a player has previously discarded key `x`
- **AND** another player discards an appearing card with key `x`
- **AND** the first player otherwise has the hand cards needed to chi that appearing card
- **THEN** the system MUST NOT offer or allow a chi action for that player with key `x`

#### Scenario: Discard history survives claimed discards
- **WHEN** a player discards key `x`
- **AND** that discarded card is later removed from the discard pile because another player claims it
- **THEN** the system MUST still treat key `x` as previously discarded by the original player for future chi and chi-style hu restrictions

#### Scenario: Previously discarded key cannot produce chi-style hu
- **WHEN** a player has previously discarded key `x`
- **AND** another player discards an appearing card with key `x`
- **AND** every winning decomposition for the first player requires that appearing card to participate in an `xy` or `xyz` door
- **THEN** the system MUST NOT offer or allow hu for that player with that appearing card

#### Scenario: Non-chi hu remains available
- **WHEN** a player has previously discarded key `x`
- **AND** another player discards an appearing card with key `x`
- **AND** the player has a winning decomposition that uses the appearing card only in an `xx`, `xxx`, `xxxx`, `xxxxx`, or `xxxxxx` same-key door
- **THEN** the system MUST allow hu if all other win requirements are satisfied

## MODIFIED Requirements

### Requirement: Win Detection
The system SHALL detect winning hands using the eight-door Shang Da Ren rule. A winning hand MUST decompose into exactly 8 doors, each door MUST be one of `xxx`, `xyz`, `xxxx`, `xxxxx`, `xxxxxx`, `xx`, or `xy`, and the decomposition MUST contain exactly one `xy` door. Support-pair constraints for 4/5/6-of-a-kind doors MUST be satisfied, and discard-history restrictions MUST be applied before exposing hu actions.

#### Scenario: Eight-door win succeeds
- **WHEN** a player's concealed cards, exposed groups, and the appearing card can be decomposed into 8 valid doors with exactly one `xy` door and all required support pairs
- **AND** the appearing card is not blocked by discard-history restrictions
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
- **AND** the appearing card is not blocked by discard-history restrictions
- **THEN** the system MUST allow hu from any appearing-card source

#### Scenario: Appearing card completes pair
- **WHEN** the appearing card combines with one matching hand card to form an `xx` pair door and the decomposition still contains exactly one other `xy` door
- **THEN** the system MUST allow hu

#### Scenario: Appearing card triggers regrouping
- **WHEN** a player has a complete `xyz` phrase and the appearing card is another character from that phrase, allowing regrouping such as `xyz + x` into `xx + yz`
- **AND** the appearing card is not blocked by discard-history restrictions when it participates in an `xy` or `xyz` door
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

### Requirement: Discard Restrictions
The system SHALL enforce phrase discard restrictions with a same-phrase reachability algorithm and treat inability to make a legal discard while not winning as circle-loss.

#### Scenario: Exact complete phrase card is discarded
- **WHEN** a player's same-phrase hand cards are exactly `xyz`
- **AND** the player attempts to discard `x`, `y`, or `z` from that phrase
- **THEN** the system MUST prevent the discard for a human player or mark the player circle-loss if the violation is committed by automated play

#### Scenario: Same-phrase discard preserves a reachable door
- **WHEN** a player attempts to discard a card from phrase `x/y/z`
- **THEN** the system MUST simulate that discard together with prior discards from the same phrase
- **AND** the discard MUST be legal only if the remaining same-phrase hand cards can still preserve or reach at least one final door among `xyz`, `xxx`, `yyy`, or `zzz` without exceeding the phrase discard allowance

#### Scenario: Xxyz only discards the extra key
- **WHEN** a player's same-phrase structure is `xxyz`
- **THEN** the system MUST allow discarding `x`
- **AND** the system MUST reject discarding `y` or `z`

#### Scenario: Xxxyz supports sequence or triplet remainder
- **WHEN** a player's same-phrase structure is `xxxyz`
- **THEN** the system MUST allow discard paths that eventually discard `xx` and preserve `xyz`
- **AND** the system MUST allow discard paths that eventually discard `yz` and preserve `xxx`
- **AND** the system MUST reject any discard that can no longer reach either preserved door

#### Scenario: Xxyyz may discard z and then stop
- **WHEN** a player's same-phrase structure is `xxyyz`
- **THEN** the system MUST allow discard paths that eventually discard `xy` and preserve `xyz`
- **AND** the system MUST allow discarding `z` only if no further discard from that phrase is allowed afterward
- **AND** the system MUST reject follow-up same-phrase discards after `z` because no preserved door remains reachable

#### Scenario: Zzzxxy supports both target doors
- **WHEN** a player's same-phrase structure is `zzzxxy`
- **THEN** the system MUST allow discard paths that eventually discard `xzz` and preserve `xyz`
- **AND** the system MUST allow discard paths that eventually discard `xxy` and preserve `zzz`
- **AND** the system MUST reject any discard path that cannot still reach one of those preserved doors

#### Scenario: No legal discard exists
- **WHEN** a player is required to discard, cannot legally discard any hand card, and does not have a legal hu
- **THEN** the system MUST end the round as circle-loss for that player
