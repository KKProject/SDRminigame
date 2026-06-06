## MODIFIED Requirements

### Requirement: Action Prompts
The system SHALL render legal action choices for pending player decisions such as accept takeover, decline takeover, chi, peng, zhao, ta, hu, pass, and restart. During normal play, the hand SHALL be the only persistent operation area. Chi, peng, zhao, ta, hu, pass, accept takeover, decline takeover, dealer-slip, takeover-limit, forced-action, support-pair, dealer-kezi, chi-lock, discard-restriction, scoring, draw-round, or circle-loss warnings SHALL appear in a temporary modal popup when the current rule state requires a decision or warning. The modal SHALL be the only place where non-hand action controls are shown while a decision is pending.

#### Scenario: Pending response choices
- **WHEN** the human player has one or more legal responses to an appearing card
- **THEN** the system MUST show a modal popup containing only the currently legal response buttons using labels `吃`, `碰`, `招`, `踏`, `胡`, and `过` as appropriate, and prevent unrelated hand discards until the player chooses an action

#### Scenario: Prompt follows global priority
- **WHEN** a higher-priority action tier is available for the current appearing card
- **THEN** the modal MUST NOT offer lower-priority actions that the player is not currently allowed to take

#### Scenario: Prompt controls do not cover hand cards
- **WHEN** legal action buttons are visible
- **THEN** the modal action button hit regions MUST NOT overlap any visible human hand card hit region

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
The system SHALL render clear feedback for current dealer, jiang card and jiang phrase, dealer slip, takeover choice, takeover operation count, current turn, appearing card source, recent discard, drawn-card resolution, illegal taps, AI thinking delay, forced actions, chi-decline penalties, zhao/ta support-pair obligations, win/draw result, circle-loss result, score, hu grade, fu summary, point settlement, and hu summary. Normal-play feedback SHALL be lightweight and background-first: persistent feedback MUST avoid large filled panels and central operation blocks, while decision warnings and round-end summaries SHALL use modal overlays when readability or player action is required.

#### Scenario: Illegal tap
- **WHEN** the player taps a card or area that is not legal in the current phase
- **THEN** the system MUST keep game state unchanged and display a short lightweight feedback prompt or modal message

#### Scenario: Appearing card source is visible
- **WHEN** a drawn or discarded card is waiting for response
- **THEN** the system MUST make the appearing card and its source player visually clear until the response resolves

#### Scenario: Drawn card auto-discard feedback
- **WHEN** a drawn appearing card cannot be used for any legal operation or hu
- **THEN** the system MUST show that the card went directly to the drawing player's discard area without entering hand

#### Scenario: Central active feedback
- **WHEN** the round is active and no modal result or decision is shown
- **THEN** the system MUST render current turn, deck count, recent discard, drawn-card resolution, or jiang information as lightweight text or card placement without drawing a persistent central panel

#### Scenario: Circle-loss result
- **WHEN** a player enters circle-loss
- **THEN** the system MUST show the losing player, the three winning players, the rule reason that ended the round, and the 1-base-point payments

#### Scenario: Win scoring result
- **WHEN** a player wins the round
- **THEN** the system MUST show the winner, hu source, jiang phrase, total fu, hu grade, three-player payment value, and concise itemized scoring summary

#### Scenario: Slip draw-round result
- **WHEN** dealer slip produces a draw-round because nobody can or will accept takeover
- **THEN** the system MUST show the slip draw-round reason and identify the next dealer

#### Scenario: Low-deck draw-round result
- **WHEN** the deck has fewer than 15 cards and the round ends without a winner
- **THEN** the system MUST show the low-deck draw-round reason and indicate that the dealer remains unchanged
