## ADDED Requirements

### Requirement: AI Turn Execution
The system SHALL allow each AI opponent to draw, evaluate legal wins, choose a discard, and end its turn without human input.

#### Scenario: AI active turn
- **WHEN** an AI seat becomes the active player and no pending response blocks play
- **THEN** the AI MUST draw if required, evaluate win, discard one legal card if it does not win, and advance the round

### Requirement: AI Response Priority
The system SHALL evaluate AI responses to discards in priority order: win, gang, peng, chi, pass, subject to rule legality and seat eligibility.

#### Scenario: AI can win from discard
- **WHEN** an AI seat has a legal win response to a discarded card
- **THEN** the AI MUST choose the win response before any meld response

### Requirement: AI Discard Heuristic
The system SHALL choose AI discards with a deterministic heuristic that preserves likely groups before isolated low-value cards.

#### Scenario: AI has isolated cards
- **WHEN** the AI must discard and has cards that do not contribute to pairs, triples, or configured sequences
- **THEN** the AI MUST prefer discarding one of those isolated cards

### Requirement: AI Timing
The system SHALL delay visible AI decisions briefly enough for the player to perceive turn progression while keeping the round responsive.

#### Scenario: AI discards
- **WHEN** an AI chooses a discard
- **THEN** the system MUST show an AI turn or thinking state before rendering the discard
