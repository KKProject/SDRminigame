## MODIFIED Requirements

### Requirement: Responsive Card Table Layout
The system SHALL render a reference-style four-player landscape table within the current canvas dimensions, including a full table surface, top information bar, anchored player seat panels, player hand, opponent hand backs, per-seat meld areas, per-seat discard areas, draw pile count, central recent-card focus, turn marker, prompts, and action area. The landscape layout SHALL use the wider screen to show more player hand cards and table information at once. The human hand SHALL use phrase-grouped stacks: each configured phrase gets one visual stack, cards from the same phrase share that stack's x position, and identical characters remain adjacent within the stack. The canvas backing store SHALL be sized for the device render pixel ratio so the table, cards, and text remain sharp on high-density phone screens while layout dimensions remain logical pixels.

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

#### Scenario: Reference-style table surface is shown
- **WHEN** the game starts on a landscape canvas
- **THEN** the renderer MUST draw a full-table play surface with visible table field, edge rails, and readable contrast between the table, cards, and status overlays

#### Scenario: Top information bar is shown
- **WHEN** the game starts on a landscape canvas
- **THEN** the layout MUST reserve a compact top bar for round/progress text, rule/help placeholder, audio or control buttons, and table/version/time placeholder text when available
- **AND** the top bar MUST NOT overlap any seat panel, central focus card, discard zone, or action button

#### Scenario: Four seat panels are anchored
- **WHEN** four players are present
- **THEN** the layout MUST place the human player panel near the bottom edge and the three opponent panels near the left, top, and right table edges
- **AND** each visible seat panel MUST have bounded space for avatar placeholder, dealer/current-turn indicator, score or points, and remaining hand count

#### Scenario: Per-seat card zones are spatial
- **WHEN** a player has visible discards or melds
- **THEN** the renderer MUST place those cards in that player's corresponding table-side discard or meld zone instead of a single shared opponent block
- **AND** the zones MUST keep the four players' cards visually distinguishable

#### Scenario: Central table focus is shown
- **WHEN** the round is active
- **THEN** the layout MUST reserve a central focus area for deck/remaining count, latest discard or drawn-card focus, jiang card or jiang phrase, and current turn feedback
- **AND** central focus content MUST NOT cover the human hand stacks

#### Scenario: Many hand cards are visible
- **WHEN** the human player's hand contains the normal dealt card count
- **THEN** the layout MUST use available horizontal space so more cards are visible than in the portrait layout while keeping every card touchable

#### Scenario: Human hand remains dominant
- **WHEN** the human player's hand is rendered
- **THEN** the hand MUST occupy the bottom play area as the largest visible card group on the table
- **AND** opponent, center, and status cards MUST use smaller regions or scaling so they do not visually compete with the human hand

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

### Requirement: Action Prompts
The system SHALL render legal action buttons for pending player choices such as accept takeover, decline takeover, chi, peng, zhao, ta, hu, pass, and restart, and SHALL show dealer-slip, takeover-limit, forced-action, support-pair, dealer-kezi, scoring, or circle-loss warnings when the current rule state requires them. Action prompts SHALL be placed in the lower-center or center table area of the reference-style layout without covering the selected human hand card, top information bar, seat panels, or central recent-card focus.

#### Scenario: Pending response choices
- **WHEN** the human player has one or more legal responses to an incoming card
- **THEN** the system MUST show the available response buttons using labels `吃`, `碰`, `招`, `踏`, `胡`, and `过` as appropriate, and prevent unrelated hand discards until the player chooses an action

#### Scenario: Prompt controls do not cover hand cards
- **WHEN** legal action buttons are visible
- **THEN** the action button hit regions MUST NOT overlap any visible human hand card hit region

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
The system SHALL render clear feedback for current dealer, jiang card and jiang phrase, dealer slip, takeover choice, takeover operation count, current turn, recent discard, drawn-card resolution, illegal taps, AI thinking delay, forced actions, zhao/ta support-pair obligations, win/draw result, circle-loss result, score, hu grade, fu summary, point settlement, and hu summary. Feedback SHALL use the reference-style table regions: persistent round/status information in the top bar, active turn/recent-card information in the center focus, and modal round-end summaries above the table without hiding required action choices.

#### Scenario: Illegal tap
- **WHEN** the player taps a card or area that is not legal in the current phase
- **THEN** the system MUST keep game state unchanged and display a short feedback prompt

#### Scenario: Central active feedback
- **WHEN** the round is active and no modal result is shown
- **THEN** the system MUST render current turn, deck count, recent discard, drawn-card resolution, or jiang information in the central focus or top bar regions

#### Scenario: Circle-loss result
- **WHEN** a player enters circle-loss
- **THEN** the system MUST show the losing player, the three winning players, and the rule reason that ended the round

#### Scenario: Win scoring result
- **WHEN** a player wins the round
- **THEN** the system MUST show the winner, hu source, jiang phrase, total fu, hu grade, point value, and concise itemized scoring summary

#### Scenario: Draw-round result
- **WHEN** dealer slip produces a draw-round because nobody can or will accept takeover
- **THEN** the system MUST show the draw-round reason and identify the next dealer
