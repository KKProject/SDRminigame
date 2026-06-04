## MODIFIED Requirements

### Requirement: AI Turn Execution
The system SHALL allow each AI opponent to choose whether to accept eligible dealer takeover, draw, evaluate legal wins and self-draw grouping actions, choose required chi/peng/zhao/ta operations, choose a legal discard, and end its turn without human input.

#### Scenario: AI active turn
- **WHEN** an AI seat becomes the active player and no pending response blocks play
- **THEN** the AI MUST draw if required, evaluate win, evaluate self-draw chi/peng/zhao/ta, discard the drawn card if no grouping operation is possible, and otherwise advance the round through a legal action

#### Scenario: AI can accept takeover
- **WHEN** dealer slip reaches an AI seat that has at least one three-of-a-kind
- **THEN** the AI MUST deterministically choose whether to accept takeover based on configured safety heuristics and must obey the 3 grouping-operation listening limit if it accepts

### Requirement: AI Response Priority
The system SHALL evaluate AI responses to incoming cards in priority order: ta, zhao, peng, chi, pass, while also respecting win opportunities and rule legality.

#### Scenario: AI can use highest-priority action
- **WHEN** an AI seat has multiple legal responses to an incoming card
- **THEN** the AI MUST choose the highest-priority legal response among ta, zhao, peng, and chi unless a legal win is available and configured to end the round

### Requirement: AI Discard Heuristic
The system SHALL choose AI discards with a deterministic heuristic that preserves valid doors, avoids discarding from complete phrases, avoids exceeding phrase-count discard limits, and reduces circle-loss risk.

#### Scenario: AI has illegal discard candidates
- **WHEN** the AI must discard and some hand cards would violate complete-phrase or phrase-count discard restrictions
- **THEN** the AI MUST exclude those cards from discard candidates when any legal candidate exists

### Requirement: AI Timing
The system SHALL delay visible AI decisions briefly enough for the player to perceive turn progression while keeping the round responsive.

#### Scenario: AI discards
- **WHEN** an AI chooses a discard or action
- **THEN** the system MUST show an AI turn or thinking state before rendering the result
