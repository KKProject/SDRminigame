## MODIFIED Requirements

### Requirement: Responsive Card Table Layout
The system SHALL render the table, player hand, opponent hand backs, meld areas, discard areas, draw pile count, turn marker, prompts, and action area within the current canvas dimensions, with a landscape-first layout that uses the wider screen to show more player hand cards and table information at once. The human hand SHALL use phrase-grouped stacks: each configured phrase gets one visual stack, cards from the same phrase share that stack's x position, and identical characters remain adjacent within the stack.

#### Scenario: Canvas size changes at startup
- **WHEN** the game starts on a device with a different screen size
- **THEN** the layout MUST compute card sizes and positions that keep all primary controls visible and non-overlapping

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
- **THEN** each next card MUST be offset vertically by `25 * (cardHeight / 307)` rounded to the layout's pixel grid

#### Scenario: Card aspect ratio is preserved
- **WHEN** the layout computes a visible hand card region
- **THEN** the region's width and height MUST preserve the configured atlas card aspect ratio based on `88x307` within a small rounding tolerance

### Requirement: Human Card Selection
The system SHALL let the human player select and deselect cards from their hand by touch, including cards positioned in phrase-grouped stacks with overlapped or adjacent copies.

#### Scenario: Select a hand card
- **WHEN** the player taps a card in their hand during a legal discard phase
- **THEN** the system MUST mark that card as selected and render it with a visible selected state

#### Scenario: Tap selected card to discard
- **WHEN** the player taps the selected card again or taps the discard command during a legal discard phase
- **THEN** the system MUST request the game engine to discard that card

#### Scenario: Select a grouped card
- **WHEN** the player taps a card inside a phrase stack where copies overlap or sit closely adjacent
- **THEN** hit testing MUST choose the topmost matching card region and keep the selected state on that exact card id
