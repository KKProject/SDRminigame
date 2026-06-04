# huapai-table-interaction Specification

## Purpose
TBD - created by archiving change build-shangdaren-huapai-game. Update Purpose after archive.
## Requirements
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

### Requirement: Action Prompts
The system SHALL render legal action buttons for pending player choices such as accept takeover, decline takeover, chi, peng, zhao, ta, hu, pass, and restart, and SHALL show dealer-slip, takeover-limit, forced-action, support-pair, dealer-kezi, scoring, or circle-loss warnings when the current rule state requires them.

#### Scenario: Pending response choices
- **WHEN** the human player has one or more legal responses to an incoming card
- **THEN** the system MUST show the available response buttons using labels `吃`, `碰`, `招`, `踏`, `胡`, and `过` as appropriate, and prevent unrelated hand discards until the player chooses an action

#### Scenario: Takeover choice is pending
- **WHEN** dealer slip reaches the human player and the human player has at least one three-of-a-kind
- **THEN** the system MUST show accept and decline takeover choices and explain that accepting limits the player to 3 grouping operations before listening

#### Scenario: Forced action warning
- **WHEN** the human player is in a mandatory chi or peng situation
- **THEN** the system MUST show feedback that declining the required action can trigger circle-loss according to the rules

#### Scenario: Zhao or ta support warning
- **WHEN** the human player is considering or has completed zhao or ta
- **THEN** the system MUST show the required support-pair count and warn when the current hand lacks enough valid support pairs

#### Scenario: Dealer kezi warning
- **WHEN** the human dealer or takeover dealer is about to chi in a way that would remove the last kezi
- **THEN** the system MUST warn that the move will cause circle-loss

### Requirement: Game Feedback
The system SHALL render clear feedback for current dealer, jiang card and jiang phrase, dealer slip, takeover choice, takeover operation count, current turn, recent discard, drawn-card resolution, illegal taps, AI thinking delay, forced actions, zhao/ta support-pair obligations, win/draw result, circle-loss result, score, hu grade, fu summary, point settlement, and hu summary.

#### Scenario: Illegal tap
- **WHEN** the player taps a card or area that is not legal in the current phase
- **THEN** the system MUST keep game state unchanged and display a short feedback prompt

#### Scenario: Circle-loss result
- **WHEN** a player enters circle-loss
- **THEN** the system MUST show the losing player, the three winning players, and the rule reason that ended the round

#### Scenario: Win scoring result
- **WHEN** a player wins the round
- **THEN** the system MUST show the winner, hu source, jiang phrase, total fu, hu grade, point value, and concise itemized scoring summary

#### Scenario: Draw-round result
- **WHEN** dealer slip produces a draw-round because nobody can or will accept takeover
- **THEN** the system MUST show the draw-round reason and identify the next dealer

### Requirement: Touch Lifecycle
The system SHALL register WeChat touch handlers once during game initialization and route touches through current layout hit regions.

#### Scenario: Restart round does not duplicate handlers
- **WHEN** the player restarts multiple rounds
- **THEN** each touch MUST be handled exactly once

### Requirement: Landscape Runtime Orientation
The system SHALL configure the WeChat minigame to run in landscape orientation for normal gameplay.

#### Scenario: Game launches
- **WHEN** the minigame runtime reads the project configuration
- **THEN** the game MUST request landscape orientation
