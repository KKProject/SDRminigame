# chi-key-discard-restriction Specification

## Purpose
定义玩家通过吃牌获得的 key 在本局内对后续出牌的限制，避免玩家吃进某个 key 后又从手牌打出同 key 牌。

## Requirements

### Requirement: Chi Key Discard Restriction
The system SHALL maintain, for each player and round, a `chiKeys` record containing character keys that the player has claimed through a successful chi action during the current round. The system SHALL prevent that player from later discarding any hand card whose key appears in `chiKeys`.

#### Scenario: Chi adds key to discard restriction record
- **WHEN** a player successfully completes a chi action with an incoming card of key `x`
- **THEN** the system MUST append key `x` to that player's `chiKeys` record for the current round

#### Scenario: Chi key cannot be discarded
- **WHEN** a player has key `x` in `chiKeys`
- **AND** the player attempts to discard a hand card with key `x`
- **THEN** the system MUST reject the discard for a human player
- **AND** the system MUST treat the violation as circle-loss if committed by automated play

#### Scenario: Non-chi keys remain discardable
- **WHEN** a player has not chi-claimed key `x`
- **AND** the player attempts to discard a hand card with key `x` that is otherwise legal under phrase-discard rules
- **THEN** the system MUST allow the discard

#### Scenario: Peng zhao ta do not add chi key restriction
- **WHEN** a player successfully completes peng, zhao, or ta with an incoming card of key `x`
- **THEN** the system MUST NOT append key `x` to `chiKeys` solely because of that peng, zhao, or ta action
