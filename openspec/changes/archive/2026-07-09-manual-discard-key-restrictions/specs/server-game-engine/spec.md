## ADDED Requirements

### Requirement: Seat History Key Restrictions
The server game engine SHALL maintain per-seat history fields needed for bidirectional key restrictions during a round. The engine MUST record manual hand discards in `actionHistory` with type `discard` and key, MUST record draw auto-discards with type `auto-discard-draw` without treating them as manual hand discards, and MUST append incoming card keys to `chiKeys` when a chi action is successfully applied.

#### Scenario: Engine records manual discard in action history
- **WHEN** a player successfully discards a hand card with key `x` through the authoritative discard flow
- **THEN** the engine MUST append an `actionHistory` entry with type `discard` and key `x` for that seat

#### Scenario: Engine records draw auto-discard separately
- **WHEN** a drawn appearing card with key `x` is auto-discarded because no player claims it
- **THEN** the engine MUST append an `actionHistory` entry with type `auto-discard-draw` and key `x`
- **AND** the engine MUST NOT treat that entry as a manual hand-discard key record

#### Scenario: Engine records chi key on successful chi
- **WHEN** the engine successfully applies a chi action with incoming card key `x` for a seat
- **THEN** the engine MUST append key `x` to that seat's `chiKeys`

#### Scenario: Engine does not record chi key for peng zhao ta
- **WHEN** the engine successfully applies peng, zhao, or ta for incoming card key `x`
- **THEN** the engine MUST NOT append key `x` to `chiKeys` solely because of that action
