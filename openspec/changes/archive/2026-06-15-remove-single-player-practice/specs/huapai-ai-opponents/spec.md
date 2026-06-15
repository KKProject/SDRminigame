## MODIFIED Requirements

### Requirement: AI Turn Execution
The system SHALL allow each AI opponent to choose whether to accept eligible dealer takeover, draw, evaluate legal wins and appearing-card grouping actions, obey required chi/peng/zhao/ta operations, choose a legal discard, and end its turn without human input. In online battles, AI seats SHALL be hosted by the server-side authoritative engine and used to fill empty seats and to take over disconnected or timed-out human seats. The client MUST NOT host an AI opponent for an offline single-player practice mode. AI SHALL never add a drawn appearing card to hand unless a legal action claims it. AI decisions MUST be applied as authoritative state changes by the server, not by any client.

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
