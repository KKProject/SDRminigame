## MODIFIED Requirements

### Requirement: AI Response Priority
The system SHALL evaluate AI responses to incoming appearing cards in priority order: hu, ta, zhao, peng, chi, pass, while respecting response seat order, mandatory actions, rule legality, and the server's concurrent response-window裁决. AI or托管 seats MUST submit their response choice quickly when a response window opens, and their choice MUST only take effect if the authoritative server裁决 awards the appearing card to that seat.

#### Scenario: AI can use highest-priority action
- **WHEN** an AI seat has multiple legal responses to an appearing card
- **THEN** the AI MUST choose within the highest-priority legal response tier unless a legal hu is available and configured to end the round

#### Scenario: AI submits response in concurrent window
- **WHEN** a concurrent response window includes an AI or托管 seat
- **THEN** the server MUST compute that seat's response choice without waiting for a client
- **AND** the response window MUST continue toward裁决 after the AI or托管 choice is recorded

#### Scenario: AI obeys mandatory special tazi
- **WHEN** an AI has a mandatory chi or peng from a special tazi structure and no higher-priority action intercepts the appearing card
- **THEN** the AI MUST perform the mandatory action

#### Scenario: AI resolves chi-peng conflict legally
- **WHEN** an AI can choose either chi or peng in an `xxyz + x` conflict
- **THEN** the AI MUST choose one legal action and persist the resulting chi-lock state if it chooses chi

#### Scenario: AI does not override higher priority unresolved candidate
- **WHEN** another player has an unresolved legal action that would defeat the AI's selected response by priority or response order
- **THEN** the AI selection MUST NOT be applied until that higher-priority candidate is resolved

#### Scenario: AI wins same-tier by response order only
- **WHEN** an AI and a human both select legal actions in the same priority tier for the same appearing card
- **THEN** the server MUST award the action according to response order, not according to which choice arrived first
