## ADDED Requirements

### Requirement: Landscape Runtime Orientation
The system SHALL configure the WeChat minigame to run in landscape orientation for normal gameplay.

#### Scenario: Game launches
- **WHEN** the minigame runtime reads the project configuration
- **THEN** the game MUST request landscape orientation

## MODIFIED Requirements

### Requirement: Responsive Card Table Layout
The system SHALL render the table, player hand, opponent hand backs, meld areas, discard areas, draw pile count, turn marker, prompts, and action area within the current canvas dimensions, with a landscape-first layout that uses the wider screen to show more player hand cards and table information at once.

#### Scenario: Canvas size changes at startup
- **WHEN** the game starts on a device with a different screen size
- **THEN** the layout MUST compute card sizes and positions that keep all primary controls visible and non-overlapping

#### Scenario: Landscape table is shown
- **WHEN** the game starts on a landscape canvas
- **THEN** the layout MUST allocate a wider player hand area, wider discard area, and opponent zones that do not overlap the hand, action buttons, prompt, or result overlay

#### Scenario: Many hand cards are visible
- **WHEN** the human player's hand contains the normal dealt card count
- **THEN** the layout MUST use available horizontal space so more cards are visible than in the portrait layout while keeping every card touchable
