# huapai-ai-opponents Specification

## Purpose
TBD - created by archiving change build-shangdaren-huapai-game. Update Purpose after archive.
## Requirements
### Requirement: AI Turn Execution
The system SHALL allow each AI opponent to choose whether to accept eligible dealer takeover, draw, evaluate legal wins and appearing-card grouping actions, obey required chi/peng/zhao/ta operations, choose a legal discard, and end its turn without human input. In online battles, AI seats SHALL be hosted by the server-side authoritative engine and used to fill empty seats, to take over disconnected or timed-out human seats, and to back the offline single-player practice mode. AI SHALL never add a drawn appearing card to hand unless a legal action claims it. AI decisions MUST be applied as authoritative state changes by the server, not by any client.

#### Scenario: AI active turn
- **WHEN** an AI seat becomes the active player and no pending response blocks play
- **THEN** the AI MUST draw if required, evaluate legal hu and self-draw appearing-card actions, discard the drawn card if no legal action is possible, and otherwise advance the round through a legal action

#### Scenario: AI runs on the server
- **WHEN** an online battle requires an AI seat to act
- **THEN** the server-side engine MUST compute the AI decision and apply it to the authoritative state
- **AND** clients MUST only render the resulting state changes

#### Scenario: AI takes over disconnected seat
- **WHEN** a human player disconnects or times out beyond the configured threshold during an online battle
- **THEN** the server MUST let AI take over that seat to keep the round progressing

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
The system SHALL pace visible AI decisions briefly enough for the player to perceive turn progression while keeping the round responsive. In online battles, the server SHALL control AI decision pacing and clients SHALL render the resulting AI turn or thinking state from the authoritative state updates.

#### Scenario: AI discards
- **WHEN** an AI chooses a discard or action
- **THEN** the system MUST show an AI turn or thinking state before rendering the result

#### Scenario: AI forced action still shows progression
- **WHEN** an AI performs a mandatory chi, peng, zhao, ta, or circle-loss resolution
- **THEN** the system MUST still show a brief visible progression state before applying the result

#### Scenario: Server paces online AI
- **WHEN** an AI seat acts in an online battle
- **THEN** the server MUST pace the decision and publish the AI turn or thinking state
- **AND** clients MUST render that progression from the authoritative state updates

