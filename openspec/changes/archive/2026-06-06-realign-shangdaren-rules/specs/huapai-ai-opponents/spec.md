## MODIFIED Requirements

### Requirement: AI Turn Execution
The system SHALL allow each AI opponent to choose whether to accept eligible dealer takeover, draw, evaluate legal wins and appearing-card grouping actions, obey required chi/peng/zhao/ta operations, choose a legal discard, and end its turn without human input. AI SHALL never add a drawn appearing card to hand unless a legal action claims it.

#### Scenario: AI active turn
- **WHEN** an AI seat becomes the active player and no pending response blocks play
- **THEN** the AI MUST draw if required, evaluate legal hu and self-draw appearing-card actions, discard the drawn card if no legal action is possible, and otherwise advance the round through a legal action

#### Scenario: AI can accept takeover
- **WHEN** dealer slip reaches an AI seat that has at least one kezi base
- **THEN** the AI MUST deterministically choose whether to accept takeover based on configured safety heuristics and must obey the 3 grouping-operation listening limit if it accepts

#### Scenario: AI takeover limit
- **WHEN** an AI takeover dealer completes the third chi, peng, zhao, or ta operation and discards the required card
- **THEN** the AI MUST let the rules engine check listening state and resolve circle-loss if the AI is not listening

### Requirement: AI Response Priority
The system SHALL evaluate AI responses to incoming appearing cards in priority order: hu, ta, zhao, peng, chi, pass, while respecting response seat order, mandatory actions, and rule legality.

#### Scenario: AI can use highest-priority action
- **WHEN** an AI seat has multiple legal responses to an appearing card
- **THEN** the AI MUST choose within the highest-priority legal response tier unless a legal hu is available and configured to end the round

#### Scenario: AI obeys mandatory special tazi
- **WHEN** an AI has a mandatory chi or peng from a special tazi structure and no higher-priority action intercepts the appearing card
- **THEN** the AI MUST perform the mandatory action

#### Scenario: AI resolves chi-peng conflict legally
- **WHEN** an AI can choose either chi or peng in an `xxyz + x` conflict
- **THEN** the AI MUST choose one legal action and persist the resulting chi-lock state if it chooses chi

#### Scenario: AI does not respond out of order
- **WHEN** another player earlier in the response order has a legal higher-priority or same-tier action
- **THEN** the AI MUST NOT take the appearing card

### Requirement: AI Discard Heuristic
The system SHALL choose AI discards with a deterministic heuristic that preserves valid doors, avoids discarding from complete phrases, avoids exceeding phrase-count discard limits, respects mandatory remainder discards, preserves dealer kezi requirements, and reduces circle-loss risk.

#### Scenario: AI has illegal discard candidates
- **WHEN** the AI must discard and some hand cards would violate complete-phrase, phrase-count, dealer-kezi, or chi-lock restrictions
- **THEN** the AI MUST exclude those cards from discard candidates when any legal candidate exists

#### Scenario: AI mandatory remainder discard
- **WHEN** the AI completes mandatory chi or peng and the rules engine requires a specific remaining different phrase card to be discarded
- **THEN** the AI MUST discard that required card

#### Scenario: AI has no legal discard
- **WHEN** the AI is required to discard and the rules engine reports no legal discard candidates while the AI has no legal hu
- **THEN** the round MUST resolve as circle-loss for that AI seat

### Requirement: AI Timing
The system SHALL delay visible AI decisions briefly enough for the player to perceive turn progression while keeping the round responsive.

#### Scenario: AI discards
- **WHEN** an AI chooses a discard or action
- **THEN** the system MUST show an AI turn or thinking state before rendering the result

#### Scenario: AI forced action still shows progression
- **WHEN** an AI performs a mandatory chi, peng, zhao, ta, or circle-loss resolution
- **THEN** the system MUST still show a brief visible progression state before applying the result
