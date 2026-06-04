## MODIFIED Requirements

### Requirement: Responsive Card Table Layout
The system SHALL render the table, player hand, opponent hand backs, meld areas, discard areas, draw pile count, turn marker, prompts, and action area within the current canvas dimensions, with a landscape-first layout that uses the wider screen to show more player hand cards and table information at once. The human hand SHALL use phrase-grouped stacks: each configured phrase gets one visual stack, cards from the same phrase share that stack's x position, and identical characters remain adjacent within the stack. The canvas backing store SHALL be sized for the device render pixel ratio so the table, cards, and text remain sharp on high-density phone screens while layout dimensions remain logical pixels.

#### Scenario: Canvas size changes at startup
- **WHEN** the game starts on a device with a different screen size
- **THEN** the layout MUST compute card sizes and positions that keep all primary controls visible and non-overlapping

#### Scenario: High-density canvas is initialized
- **WHEN** the game starts on a device whose pixel ratio is greater than 1
- **THEN** the canvas backing-store width and height MUST be greater than the logical screen width and height by the configured render pixel ratio
- **AND** exported layout dimensions MUST remain the logical screen width and height

#### Scenario: Drawing context uses logical coordinates
- **WHEN** the renderer draws the table after high-density canvas initialization
- **THEN** the 2D context MUST be scaled by the render pixel ratio so drawing commands continue to use logical layout coordinates

#### Scenario: Render pixel ratio is bounded
- **WHEN** the device reports an unusually high pixel ratio
- **THEN** the render pixel ratio MUST be capped to avoid excessive backing-store memory use

#### Scenario: Landscape table is shown
- **WHEN** the game starts on a landscape canvas
- **THEN** the layout MUST allocate a wider player hand area, wider discard area, and opponent zones that do not overlap the hand, action buttons, prompt, or result overlay

#### Scenario: Many hand cards are visible
- **WHEN** the human player's hand contains the normal dealt card count
- **THEN** the layout MUST use available horizontal space so more cards are visible than in the portrait layout while keeping every card touchable

#### Scenario: Phrase stacks are shown
- **WHEN** the human player's hand contains cards from multiple configured phrases
- **THEN** the layout MUST place cards from different phrases in different phrase stacks ordered by configured phrase order
- **AND** every card from the same phrase MUST share the same stack x position

#### Scenario: Identical cards are adjacent
- **WHEN** the human player's hand contains multiple copies of the same character
- **THEN** the layout MUST place those copies adjacent inside that character's group within the phrase stack

#### Scenario: Phrase stack order is stable
- **WHEN** the hand changes due to draw, discard, chi, peng, zhao, or ta
- **THEN** the layout MUST keep phrase stacks in configured phrase order and character groups in phrase character order

#### Scenario: Phrase stacks touch and center
- **WHEN** the layout computes visible hand card regions
- **THEN** adjacent phrase stacks MUST be separated by exactly one card width with no additional horizontal gap
- **AND** the full eight-stack hand area MUST be centered in the canvas

#### Scenario: Phrase stacks align at the bottom
- **WHEN** phrase stacks contain different numbers of cards
- **THEN** every non-empty phrase stack MUST align to the same bottom edge

#### Scenario: Phrase stack offset scales
- **WHEN** cards overlap within a phrase stack
- **THEN** each next card MUST be offset vertically by `40 * (cardHeight / 108)` rounded to the layout's pixel grid

#### Scenario: Hand card aspect ratio is preserved
- **WHEN** the layout computes a visible human hand card region
- **THEN** the region's width and height MUST preserve the small atlas card aspect ratio based on `88x108` within a small rounding tolerance
