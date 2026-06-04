## ADDED Requirements

### Requirement: Responsive Card Table Layout
The system SHALL render the table, player hand, opponent hand backs, meld areas, discard areas, draw pile count, turn marker, prompts, and action area within the current canvas dimensions.

#### Scenario: Canvas size changes at startup
- **WHEN** the game starts on a device with a different screen size
- **THEN** the layout MUST compute card sizes and positions that keep all primary controls visible and non-overlapping

### Requirement: Human Card Selection
The system SHALL let the human player select and deselect cards from their hand by touch.

#### Scenario: Select a hand card
- **WHEN** the player taps a card in their hand during a legal discard phase
- **THEN** the system MUST mark that card as selected and render it with a visible selected state

#### Scenario: Tap selected card to discard
- **WHEN** the player taps the selected card again or taps the discard command during a legal discard phase
- **THEN** the system MUST request the game engine to discard that card

### Requirement: Action Prompts
The system SHALL render legal action buttons for pending player choices such as chi, peng, gang, hu, pass, and restart.

#### Scenario: Pending response choices
- **WHEN** the human player has one or more legal responses to a discard
- **THEN** the system MUST show the available response buttons and prevent unrelated hand discards until the player chooses an action

### Requirement: Game Feedback
The system SHALL render clear feedback for current turn, recent discard, illegal taps, AI thinking delay, win/draw result, and score or hu summary.

#### Scenario: Illegal tap
- **WHEN** the player taps a card or area that is not legal in the current phase
- **THEN** the system MUST keep game state unchanged and display a short feedback prompt

### Requirement: Touch Lifecycle
The system SHALL register WeChat touch handlers once during game initialization and route touches through current layout hit regions.

#### Scenario: Restart round does not duplicate handlers
- **WHEN** the player restarts multiple rounds
- **THEN** each touch MUST be handled exactly once
