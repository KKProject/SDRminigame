## MODIFIED Requirements

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
