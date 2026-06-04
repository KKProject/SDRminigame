## ADDED Requirements

### Requirement: Configurable Shang Da Ren Deck
The system SHALL create a Shang Da Ren flower-card deck from a rule configuration that defines card symbols, copies per symbol, display color, optional flower/wildcard flags, and scoring metadata.

#### Scenario: Default deck is created
- **WHEN** a new round starts with the default rule configuration
- **THEN** the system MUST create a shuffled deck containing every configured card copy exactly once

#### Scenario: Deck supports rule variants
- **WHEN** the rule configuration changes symbol counts or special-card flags
- **THEN** the system MUST use the updated configuration without requiring changes to table rendering or AI modules

### Requirement: Round Setup
The system SHALL initialize a four-seat round with one human player, three AI opponents, a dealer, shuffled deck, dealt hands, empty meld areas, empty discard piles, and an active turn state.

#### Scenario: New round begins
- **WHEN** the player starts or restarts a game
- **THEN** the system MUST deal configured starting hands, set the dealer as the first active seat, and enter the discard phase after any required dealer draw

### Requirement: Turn Flow
The system SHALL advance play through draw, discard, response, meld resolution, win resolution, and exhausted-deck phases.

#### Scenario: Player discards
- **WHEN** the active human player selects a legal hand card and confirms discard
- **THEN** the system MUST remove that card from the hand, add it to the player discard pile, and offer legal response actions to eligible seats

#### Scenario: Deck is exhausted
- **WHEN** no cards remain to draw and no pending win action exists
- **THEN** the system MUST end the round as a draw and show the round result

### Requirement: Meld Actions
The system SHALL evaluate Mahjong-like exposed actions for the current rule configuration, including chi-style sequences, peng-style triples, and gang-style four-of-a-kind actions.

#### Scenario: Legal response actions are found
- **WHEN** a player discards a card that another seat can use for a configured meld
- **THEN** the system MUST expose only the legal actions available to each eligible seat

#### Scenario: Meld is accepted
- **WHEN** a player accepts a legal meld action
- **THEN** the system MUST move the required cards from hand and discard source into that player's meld area and set that player as the active seat

### Requirement: Win Detection
The system SHALL detect winning hands according to the configured Shang Da Ren rule evaluator and produce a result containing winner, win source, winning card, hand groups, and scoring summary.

#### Scenario: Self-draw win
- **WHEN** the active player draws a card that completes a legal winning hand
- **THEN** the system MUST offer or execute a self-draw win according to the current player type and rule settings

#### Scenario: Discard win
- **WHEN** a discarded card completes a legal winning hand for an eligible seat and the rule configuration allows discard wins
- **THEN** the system MUST prioritize the win action above meld actions

### Requirement: Round Restart
The system SHALL allow the player to start a fresh round after a win or draw without reloading the minigame.

#### Scenario: Result restart
- **WHEN** the player taps restart on the result overlay
- **THEN** the system MUST clear previous round state and begin a new shuffled round
