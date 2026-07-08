## MODIFIED Requirements

### Requirement: Discard Restrictions
The system SHALL enforce phrase discard restrictions with a same-phrase reachability algorithm, SHALL allow opening-hand `xxyy` same-phrase two-pair structures to be freely discarded, and SHALL treat inability to make a legal discard while not winning as circle-loss.

#### Scenario: Exact complete phrase card is discarded
- **WHEN** a player's same-phrase hand cards are exactly `xyz`
- **AND** the player attempts to discard `x`, `y`, or `z` from that phrase
- **THEN** the system MUST prevent the discard for a human player or mark the player circle-loss if the violation is committed by automated play

#### Scenario: Same-phrase discard preserves a reachable door
- **WHEN** a player attempts to discard a card from phrase `x/y/z`
- **THEN** the system MUST simulate that discard together with prior discards from the same phrase
- **AND** the discard MUST be legal only if the remaining same-phrase hand cards can still preserve or reach at least one final door among `xyz`, `xxx`, `yyy`, or `zzz` without exceeding the phrase discard allowance, unless a more specific same-phrase discard scenario permits the discard

#### Scenario: Xxyz only discards the extra key
- **WHEN** a player's same-phrase structure is `xxyz`
- **THEN** the system MUST allow discarding `x`
- **AND** the system MUST reject discarding `y` or `z`

#### Scenario: Xxxyz supports sequence or triplet remainder
- **WHEN** a player's same-phrase structure is `xxxyz`
- **THEN** the system MUST allow discard paths that eventually discard `xx` and preserve `xyz`
- **AND** the system MUST allow discard paths that eventually discard `yz` and preserve `xxx`
- **AND** the system MUST reject any discard that can no longer reach either preserved door

#### Scenario: Xxyy may be freely discarded
- **WHEN** a player's opening-hand same-phrase structure is `xxyy`
- **THEN** the system MUST allow discarding `x` or `y`
- **AND** the system MUST continue allowing follow-up discards from that same phrase even if the remaining same-phrase cards can no longer preserve or reach `xyz`, `xxx`, `yyy`, or `zzz`
- **AND** the system MUST allow the player to discard all four same-phrase cards if each discard is otherwise legal

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
