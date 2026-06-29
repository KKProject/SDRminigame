## MODIFIED Requirements

### Requirement: Action Prompts
The system SHALL render legal action choices for pending player decisions such as accept takeover, decline takeover, chi, peng, zhao, ta, hu, pass, and restart. During normal play, the hand SHALL be the only persistent operation area. Chi, peng, zhao, ta, hu, pass, accept takeover, decline takeover, dealer-slip, takeover-limit, forced-action, support-pair, dealer-kezi, chi-lock, discard-restriction, scoring, draw-round, or circle-loss warnings SHALL appear in a temporary modal popup when the current rule state requires a decision or warning. The modal SHALL be the only place where non-hand action controls are shown while the local player has a pending decision. When multiple zhao sizes are legal for the same appearing card, the modal SHALL let the human player choose the intended zhao size before submitting the zhao intent. In an online concurrent response window, the local player's modal SHALL be based only on private actions sent to that player, while public table feedback MAY show that other seats are still responding.

#### Scenario: Pending response choices
- **WHEN** the human player has one or more legal responses to an appearing card
- **THEN** the system MUST show a modal popup containing only the currently legal response buttons using labels `吃`, `碰`, `招`, `踏`, `胡`, and `过` as appropriate, and prevent unrelated hand discards until the player chooses an action

#### Scenario: Concurrent response choices are private
- **WHEN** multiple players can respond to the same appearing card
- **THEN** the local client MUST show only the current player's legal response buttons
- **AND** the local client MUST NOT infer or display other players' concrete legal response actions from public state

#### Scenario: Multiple zhao sizes are visible
- **WHEN** the human player can form more than one zhao group size with the same appearing card
- **THEN** the action modal MUST let the player distinguish and choose each legal zhao size, such as `招4张`, `招5张`, or `招6张`
- **AND** the submitted action MUST preserve the selected zhao size for server validation

#### Scenario: Zhao size support warning
- **WHEN** the human player is choosing among zhao sizes
- **THEN** the modal MUST show or otherwise make available the support-pair requirement for each zhao size
- **AND** a zhao size lacking enough current support pairs MUST NOT hide another zhao size that is currently legal

#### Scenario: Prompt follows global priority
- **WHEN** a higher-priority action tier is available for the current appearing card and has already made lower-priority local actions impossible
- **THEN** the modal MUST NOT offer lower-priority actions that the player is not currently allowed to take

#### Scenario: Prompt controls do not cover hand cards
- **WHEN** legal action buttons are visible
- **THEN** the modal action button hit regions MUST NOT overlap any visible human hand card hit region

#### Scenario: Response is preempted by server裁决
- **WHEN** the server裁决 resolves the response window before the local player submits or wins a response
- **THEN** the modal MUST close and the client MUST render the latest authoritative state
- **AND** a later tap on the closed or stale action MUST NOT submit a response

#### Scenario: Takeover choice is pending
- **WHEN** dealer slip reaches the human player and the human player has at least one kezi base
- **THEN** the system MUST show accept and decline takeover choices in a modal popup and explain that accepting limits the player to 3 grouping operations before listening

#### Scenario: Forced action warning
- **WHEN** the human player is in a mandatory chi or peng situation
- **THEN** the system MUST show modal feedback identifying the required action and the rule reason

#### Scenario: Declined chi penalty warning
- **WHEN** the human player declines a legal chi opportunity that creates or updates a same-phrase same-missing-card penalty key
- **THEN** the system MUST show modal or lightweight feedback that taking the same chi opportunity later will cause circle-loss

#### Scenario: Zhao or ta support warning
- **WHEN** the human player is considering or has completed zhao or ta
- **THEN** the system MUST show the required support-pair count in the modal popup and warn when the current hand lacks enough valid support pairs

#### Scenario: Dealer kezi warning
- **WHEN** the human dealer or takeover dealer is about to chi in a way that would remove the last kezi
- **THEN** the system MUST warn in the modal popup that the move will cause circle-loss

#### Scenario: Discard restriction warning
- **WHEN** the human player attempts to discard a protected complete phrase card or exceed a four-card or five-card phrase discard limit
- **THEN** the system MUST keep game state unchanged and show feedback explaining the discard is illegal

#### Scenario: No center action controls during normal play
- **WHEN** no player decision is pending
- **THEN** the renderer MUST NOT draw center-table action buttons or operation prompts

### Requirement: Game Feedback
The system SHALL render clear feedback for current dealer, jiang card and jiang phrase, dealer slip, takeover choice, takeover operation count, current turn, appearing card source, recent discard, drawn-card resolution, concurrent response waiting state, illegal taps, AI thinking delay, forced actions, chi-decline penalties, zhao/ta support-pair obligations, win/draw result, circle-loss result, score, hu grade, fu summary, point settlement, and hu summary. Normal-play feedback SHALL be lightweight and background-first: persistent feedback MUST avoid large filled panels and central operation blocks, while decision warnings and round-end summaries SHALL use modal overlays when readability or player action is required.

#### Scenario: Illegal tap
- **WHEN** the player taps a card or area that is not legal in the current phase
- **THEN** the system MUST keep game state unchanged and display a short lightweight feedback prompt or modal message

#### Scenario: Appearing card source is visible
- **WHEN** a drawn or discarded card is waiting for response
- **THEN** the system MUST make the appearing card and its source player visually clear until the response resolves

#### Scenario: Concurrent response waiting is visible
- **WHEN** the current appearing card is waiting for one or more players to respond
- **THEN** the system MUST show lightweight feedback that response resolution is pending
- **AND** the feedback MUST NOT reveal other players' concrete legal response actions

#### Scenario: Drawn card auto-discard feedback
- **WHEN** a drawn appearing card cannot be used for any legal operation or hu
- **THEN** the system MUST show that the card went directly to the drawing player's discard area without entering hand

#### Scenario: Central active feedback
- **WHEN** the round is active and no modal result or decision is shown
- **THEN** the system MUST render current turn, deck count, recent discard, drawn-card resolution, or jiang information as lightweight text or card placement without drawing a persistent central panel

#### Scenario: Circle-loss result
- **WHEN** a player enters circle-loss
- **THEN** the system MUST show the loser, reason, score impact, and settlement summary in a readable modal result
