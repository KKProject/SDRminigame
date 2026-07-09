## MODIFIED Requirements

### Requirement: Action Prompts
The system SHALL render legal action choices for pending player decisions such as accept takeover, decline takeover, chi, peng, zhao, ta, hu, pass, and restart. During normal play, the hand SHALL be the only persistent operation area. Chi, peng, zhao, ta, hu, pass, accept takeover, decline takeover, dealer-slip, takeover-limit, forced-action, support-pair, dealer-kezi, chi-lock, discard-restriction, scoring, draw-round, or circle-loss warnings SHALL appear in a temporary modal popup when the current rule state requires a decision or warning. The modal SHALL be the only place where non-hand action controls are shown while the local player has a pending decision. When zhao is legal for the same appearing card, the modal SHALL show a single `招` button instead of one button per legal zhao size; when more than one zhao size is legal, tapping the `招` button SHALL open a zhao-size sub-panel that replaces the main action panel and lets the human player choose the intended zhao size before submitting; when exactly one zhao size is legal, tapping the `招` button SHALL submit that zhao size directly without opening a sub-panel. In an online concurrent response window, the local player's modal SHALL be based only on private actions sent to that player, while public table feedback MAY show that other seats are still responding.

#### Scenario: Pending response choices
- **WHEN** the human player has one or more legal responses to an appearing card
- **THEN** the system MUST show a modal popup containing only the currently legal response buttons using labels `吃`, `碰`, `招`, `踏`, `胡`, and `过` as appropriate, and prevent unrelated hand discards until the player chooses an action
- **AND** when one or more zhao sizes are legal, the popup MUST show a single `招` button rather than a separate button per zhao size

#### Scenario: Concurrent response choices are private
- **WHEN** multiple players can respond to the same appearing card
- **THEN** the local client MUST show only the current player's legal response buttons
- **AND** the local client MUST NOT infer or display other players' concrete legal response actions from public state

#### Scenario: Single zhao size submits directly
- **WHEN** the human player has exactly one legal zhao size for the appearing card
- **THEN** the modal MUST show a single `招` button
- **AND** tapping the `招` button MUST submit that zhao size immediately without opening a zhao-size sub-panel
- **AND** the submitted action MUST preserve the zhao size for server validation

#### Scenario: Multiple zhao sizes open a size sub-panel
- **WHEN** the human player can form more than one legal zhao group size with the same appearing card
- **AND** the player taps the `招` button
- **THEN** the system MUST replace the main action panel with a zhao-size sub-panel showing one text option per legal zhao size, such as `招4`, `招5`, or `招6`
- **AND** the sub-panel MUST offer a return control that restores the main action panel without submitting or passing
- **AND** tapping a size option MUST submit the corresponding zhao size for server validation

#### Scenario: Zhao size sub-panel is transient
- **WHEN** the zhao-size sub-panel is open
- **AND** the response window is closed by server裁决, or the player's legal zhao candidates change, or the player submits a size, or the player returns, or the player chooses a non-zhao action
- **THEN** the system MUST close the sub-panel and render the latest authoritative action choices
- **AND** a later tap on a stale sub-panel option MUST NOT submit a response

#### Scenario: Zhao size support warning
- **WHEN** the human player is choosing among zhao sizes
- **THEN** the modal MUST show or otherwise make available the support-pair requirement for each zhao size
- **AND** a zhao size lacking enough current support pairs MUST NOT be offered as a legal zhao size and MUST NOT hide another zhao size that is currently legal

#### Scenario: Prompt follows global priority
- **WHEN** a higher-priority action tier is available for the current appearing card and has already made lower-priority local actions impossible
- **THEN** the modal MUST NOT offer lower-priority actions that the player is not currently allowed to take

#### Scenario: Prompt controls do not cover hand cards
- **WHEN** legal action buttons or zhao-size sub-panel options are visible
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
