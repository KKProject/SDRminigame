## ADDED Requirements

### Requirement: Card Movement Animation
The system SHALL animate visible draw or discard events with the corresponding character's big atlas sprite. The animation SHALL start from the acting player's side of the table and finish in front of that player, then leave any permanent history rendering to the mini-card placement rules.

#### Scenario: Discard animation starts from acting player
- **WHEN** a player discards a card
- **THEN** the renderer MUST animate that card using its big sprite from the discarding player's side toward that player's front placement point

#### Scenario: Draw animation starts from drawing player
- **WHEN** a player draws a card and the draw is visible to the table flow
- **THEN** the renderer MUST animate that card using its big sprite from the drawing player's side toward that player's front placement point

#### Scenario: Animation ends before permanent mini placement
- **WHEN** the movement animation finishes and no player claims the card
- **THEN** the card MUST be represented by the corresponding player's mini-card placement area according to unclaimed card placement rules

#### Scenario: Animation does not block modal choices
- **WHEN** a legal chi, peng, zhao, ta, hu, pass, accept takeover, or decline takeover choice is pending
- **THEN** the action modal MUST remain visible and tappable even if a card movement animation is active

## MODIFIED Requirements

### Requirement: Responsive Card Table Layout
The system SHALL render a background-first four-player landscape table within the current canvas dimensions. The original table background image SHALL remain the primary visual surface during normal play, and the renderer SHALL place cards directly at configured table positions instead of drawing persistent filled panels, table frames, shaded seat boxes, central operation blocks, or boxed discard/meld regions. The layout SHALL still expose invisible placement regions for player-front animation endpoints, each player's right-corner unclaimed mini-card sequence, right-side claimed-card phrase columns, player hand, modal prompts, result overlay, and retained control hit regions. The landscape layout SHALL use the wider screen to show more player hand cards and table information at once. The human hand SHALL use phrase-grouped stacks: each configured phrase gets one visual stack, cards from the same phrase share that stack's x position, and identical characters remain adjacent within the stack. The canvas backing store SHALL be sized for the device render pixel ratio so the table, cards, and text remain sharp on high-density phone screens while layout dimensions remain logical pixels.

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
- **THEN** the layout MUST allocate a wider player hand area, visible card placement areas, and modal regions that do not overlap the hand, action modal, prompt, or result overlay

#### Scenario: Background-first table is shown
- **WHEN** the game starts on a landscape canvas during normal play
- **THEN** the renderer MUST draw the original background image as the visible table surface
- **AND** the renderer MUST NOT draw persistent filled table panels, shaded seat boxes, central operation blocks, or boxed discard/meld regions over the background

#### Scenario: Top information remains lightweight
- **WHEN** persistent round, dealer, jiang, audio, or control information is shown during normal play
- **THEN** it MUST be rendered as lightweight text or compact controls that do not create a large filled bar covering the background
- **AND** it MUST NOT overlap visible cards, the human hand, or action modal controls

#### Scenario: Invisible player placement regions are anchored
- **WHEN** four players are present
- **THEN** the layout MUST expose player-front endpoints, right-corner unclaimed card placement regions, and right-side claimed-card placement regions for the human player and the three opponents
- **AND** those regions MUST be bounded within the canvas without requiring visible panel backgrounds

#### Scenario: Unclaimed mini cards are sequenced
- **WHEN** a player draws or discards a card and no player claims it through chi, peng, zhao, or ta
- **THEN** the renderer MUST place that card as a mini sprite in that player's right-side corner sequence
- **AND** later unclaimed cards for the same player MUST appear in order without overlapping previous mini cards

#### Scenario: Claimed cards are grouped by phrase
- **WHEN** a player claims a card through chi, peng, zhao, or ta
- **THEN** the renderer MUST place the claimed incoming card plus the relevant hand cards on the right side using mini sprites
- **AND** the mini cards MUST be grouped by phrase and arranged in columns without overlap

#### Scenario: Central operation area is absent
- **WHEN** the round is in normal play
- **THEN** the center table area MUST NOT contain persistent operation buttons, boxed controls, or a central operation panel

#### Scenario: Many hand cards are visible
- **WHEN** the human player's hand contains the normal dealt card count
- **THEN** the layout MUST use available horizontal space so more cards are visible than in the portrait layout while keeping every card touchable

#### Scenario: Human hand remains the persistent operation area
- **WHEN** the human player's hand is rendered
- **THEN** the hand MUST occupy the bottom play area as the largest visible card group on the table
- **AND** no other persistent operation area MUST compete with the hand

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
The system SHALL render legal action choices for pending player decisions such as accept takeover, decline takeover, chi, peng, zhao, ta, hu, pass, and restart. During normal play, the hand SHALL be the only persistent operation area. Chi, peng, zhao, ta, hu, pass, accept takeover, decline takeover, dealer-slip, takeover-limit, forced-action, support-pair, dealer-kezi, scoring, or circle-loss warnings SHALL appear in a temporary modal popup when the current rule state requires a decision or warning. The modal SHALL be the only place where non-hand action controls are shown while a decision is pending.

#### Scenario: Pending response choices
- **WHEN** the human player has one or more legal responses to an incoming card
- **THEN** the system MUST show a modal popup containing the available response buttons using labels `吃`, `碰`, `招`, `踏`, `胡`, and `过` as appropriate, and prevent unrelated hand discards until the player chooses an action

#### Scenario: Prompt controls do not cover hand cards
- **WHEN** legal action buttons are visible
- **THEN** the modal action button hit regions MUST NOT overlap any visible human hand card hit region

#### Scenario: Takeover choice is pending
- **WHEN** dealer slip reaches the human player and the human player has at least one three-of-a-kind
- **THEN** the system MUST show accept and decline takeover choices in a modal popup and explain that accepting limits the player to 3 grouping operations before listening

#### Scenario: Forced action warning
- **WHEN** the human player is in a mandatory chi or peng situation
- **THEN** the system MUST show modal feedback that declining the required action can trigger circle-loss according to the rules

#### Scenario: Zhao or ta support warning
- **WHEN** the human player is considering or has completed zhao or ta
- **THEN** the system MUST show the required support-pair count in the modal popup and warn when the current hand lacks enough valid support pairs

#### Scenario: Dealer kezi warning
- **WHEN** the human dealer or takeover dealer is about to chi in a way that would remove the last kezi
- **THEN** the system MUST warn in the modal popup that the move will cause circle-loss

#### Scenario: No center action controls during normal play
- **WHEN** no player decision is pending
- **THEN** the renderer MUST NOT draw center-table action buttons or operation prompts

### Requirement: Game Feedback
The system SHALL render clear feedback for current dealer, jiang card and jiang phrase, dealer slip, takeover choice, takeover operation count, current turn, recent discard, drawn-card resolution, illegal taps, AI thinking delay, forced actions, zhao/ta support-pair obligations, win/draw result, circle-loss result, score, hu grade, fu summary, point settlement, and hu summary. Normal-play feedback SHALL be lightweight and background-first: persistent feedback MUST avoid large filled panels and central operation blocks, while decision warnings and round-end summaries SHALL use modal overlays when readability or player action is required.

#### Scenario: Illegal tap
- **WHEN** the player taps a card or area that is not legal in the current phase
- **THEN** the system MUST keep game state unchanged and display a short lightweight feedback prompt or modal message

#### Scenario: Central active feedback
- **WHEN** the round is active and no modal result or decision is shown
- **THEN** the system MUST render current turn, deck count, recent discard, drawn-card resolution, or jiang information as lightweight text or card placement without drawing a persistent central panel

#### Scenario: Circle-loss result
- **WHEN** a player enters circle-loss
- **THEN** the system MUST show the losing player, the three winning players, and the rule reason that ended the round

#### Scenario: Win scoring result
- **WHEN** a player wins the round
- **THEN** the system MUST show the winner, hu source, jiang phrase, total fu, hu grade, point value, and concise itemized scoring summary

#### Scenario: Draw-round result
- **WHEN** dealer slip produces a draw-round because nobody can or will accept takeover
- **THEN** the system MUST show the draw-round reason and identify the next dealer
