# huapai-game-rules Specification

## Purpose
TBD - created by archiving change build-shangdaren-huapai-game. Update Purpose after archive.
## Requirements
### Requirement: Configurable Shang Da Ren Deck
The system SHALL create the Shang Da Ren deck from exactly 8 configured phrases: `上大人`, `孔乙己`, `化三千`, `七十土`, `尔小生`, `福禄寿`, `佳作仁`, and `八九子`. Each phrase SHALL contain 3 characters, each character SHALL have 6 copies, and each character SHALL be colored by phrase position: first red, second green, third black.

#### Scenario: Default deck is created
- **WHEN** a new round starts with the default rule configuration
- **THEN** the system MUST create a shuffled 144-card deck containing 6 copies of each of the 24 configured characters exactly once per copy id

#### Scenario: Deck supports rule variants
- **WHEN** the rule configuration changes phrase definitions, copies per character, or color rules
- **THEN** the system MUST use the updated configuration without requiring changes to table rendering or AI modules

#### Scenario: Card colors are assigned
- **WHEN** cards are created for any configured phrase
- **THEN** the first character MUST render as red, the second as green, and the third as black

### Requirement: Round Setup
The system SHALL initialize a four-seat round with one human player, three AI opponents, a dealer, shuffled deck, opening-deal state, jiang-card state, empty exposed action areas, empty discard piles, action-history state, pair-support obligations, takeover state, and an active turn state.

#### Scenario: New round begins
- **WHEN** the player starts or restarts a game
- **THEN** the system MUST initialize each seat's rule history, run the opening deal, set jiang-card state, evaluate dealer slip, and enter takeover-choice, draw-round, or first-discard phase required by the configured rules

### Requirement: Turn Flow
The system SHALL advance play through opening deal, dealer-slip takeover choice, draw-round restart, draw, self-draw action evaluation, discard, response, chi/peng/zhao/ta resolution, takeover operation-limit checks, win resolution, circle-loss resolution, and exhausted-deck phases.

#### Scenario: Player discards
- **WHEN** the active human player selects a legal hand card and confirms discard
- **THEN** the system MUST remove that card from the hand, add it to the player discard pile, and offer legal response actions to eligible seats using the configured priority order

#### Scenario: Self-drawn card cannot group
- **WHEN** a player draws a card and the drawn card cannot be used for chi, peng, zhao, or ta with that player's current hand and exposed groups
- **THEN** the system MUST directly discard the drawn card

#### Scenario: Self-drawn card can group
- **WHEN** a player draws a card that can be used for chi, peng, zhao, or ta
- **THEN** the system MUST evaluate the legal self-draw actions and require the player or AI to resolve the highest-priority legal action tier before discarding

#### Scenario: Takeover dealer groups
- **WHEN** a takeover dealer completes chi, peng, zhao, or ta
- **THEN** the system MUST increment that player's takeover grouping-operation count and evaluate whether the player is listening before allowing play to continue after the third grouping operation

#### Scenario: Takeover dealer misses listening limit
- **WHEN** a takeover dealer has completed 3 grouping operations and is not listening
- **THEN** the system MUST end the round as circle-loss for that takeover dealer

#### Scenario: Deck is exhausted
- **WHEN** no cards remain to draw and no pending win or circle-loss action exists
- **THEN** the system MUST end the round as a draw and show the round result

### Requirement: Meld Actions
The system SHALL evaluate Shang Da Ren actions for the current rule configuration, including chi, peng, zhao, and ta, and SHALL resolve simultaneous opportunities by priority `ta > zhao > peng > chi`.

#### Scenario: Legal response actions are found
- **WHEN** a player discards or draws a card that another eligible seat can use for a configured action
- **THEN** the system MUST expose only legal actions available to each eligible seat

#### Scenario: Chi is accepted
- **WHEN** a player accepts a legal chi action
- **THEN** the system MUST combine the incoming card with two same-phrase hand cards to form a complete phrase and record whether the choice creates a chi-lock restriction

#### Scenario: Chi source is limited
- **WHEN** a player is evaluating chi
- **THEN** the system MUST allow chi only from the previous player's discard or from that player's own draw

#### Scenario: Peng is accepted
- **WHEN** a player accepts a legal peng action
- **THEN** the system MUST combine the incoming card with two matching hand cards to form a three-of-a-kind door

#### Scenario: Zhao is accepted
- **WHEN** a player accepts a legal zhao action
- **THEN** the system MUST combine the incoming card with at least three matching hand cards, create a 4-to-6-card zhao group, and validate required support pairs

#### Scenario: Zhao support pairs are validated
- **WHEN** a zhao group contains 4, 5, or 6 cards
- **THEN** the system MUST require 1, 2, or 3 support pairs respectively, allow support pairs split from larger same-character groups, prevent the same support pair from serving multiple high-order groups, and require distinct pair source characters for 5-card and 6-card zhao groups

#### Scenario: Ta is accepted
- **WHEN** a player draws a card matching an already-zhaoed table group and accepts ta
- **THEN** the system MUST add the card to the zhao/ta group, increase that group's required support-pair count, and revalidate the support-pair obligations

#### Scenario: Ta support failure
- **WHEN** a ta action leaves the player without enough valid support pairs and the player cannot legally continue grouping to satisfy the obligation
- **THEN** the system MUST end the round as circle-loss for that player

#### Scenario: Action priority is applied
- **WHEN** multiple players or actions are available for the same incoming card
- **THEN** the system MUST offer or execute only the highest-priority action tier before lower-priority actions

#### Scenario: Chi-peng conflict creates chi lock
- **WHEN** a player with an `xxyz` structure receives `x` and chooses chi instead of peng
- **THEN** the system MUST prevent that player from later using any other hand card for peng, zhao, or ta in the round

#### Scenario: Chi-peng conflict accepts peng
- **WHEN** a player with an `xxyz` structure receives `x` and chooses peng
- **THEN** the system MUST allow that player to continue using later legal peng, zhao, and ta actions

### Requirement: Win Detection
The system SHALL detect winning hands using the eight-door Shang Da Ren rule. A winning hand MUST decompose into exactly 8 doors, each door MUST be one of `xxx`, `xyz`, `xxxx`, `xxxxx`, `xxxxxx`, `xx`, or `xy`, and the decomposition MUST contain exactly one `xy` door. Support-pair constraints for 4/5/6-of-a-kind doors MUST be satisfied.

#### Scenario: Eight-door win succeeds
- **WHEN** a player's concealed cards and exposed groups can be decomposed into 8 valid doors with exactly one `xy` door and all required support pairs
- **THEN** the system MUST produce a win result containing winner, source, winning card, doors, support-pair summary, scoring summary, hu grade, and point-settlement summary

#### Scenario: Missing xy door fails
- **WHEN** a candidate hand has 8 valid-looking doors but does not contain exactly one `xy` door
- **THEN** the system MUST reject the win

#### Scenario: Multiple xy doors fail
- **WHEN** a candidate hand can only be decomposed with more than one `xy` door
- **THEN** the system MUST reject the win

#### Scenario: Support pairs are insufficient
- **WHEN** a candidate hand contains 4/5/6-of-a-kind doors but lacks the required number of valid support-pair doors or violates distinct-pair requirements
- **THEN** the system MUST reject the win or mark circle-loss if the invalid support state was caused by an illegal zhao or ta

#### Scenario: Dealer listening requires kezi
- **WHEN** the active dealer or takeover dealer reaches a listening candidate state
- **THEN** the system MUST treat the state as legal only if the hand or exposed groups still contain at least one `xxx` or larger same-character kezi, counting zhao and ta groups as kezi

#### Scenario: Dealer splits last kezi through chi
- **WHEN** a dealer or takeover dealer uses chi in a way that leaves no remaining `xxx` or larger same-character kezi
- **THEN** the system MUST end the round as circle-loss for that dealer

#### Scenario: Discard win
- **WHEN** a discarded card completes a legal eight-door winning hand for an eligible seat and the rule configuration allows discard wins
- **THEN** the system MUST prioritize the win action above non-winning action choices if win priority remains enabled in the implementation

### Requirement: Round Restart
The system SHALL allow the player to start a fresh round after a win or draw without reloading the minigame.

#### Scenario: Result restart
- **WHEN** the player taps restart on the result overlay
- **THEN** the system MUST clear previous round state and begin a new shuffled round

### Requirement: Opening Deal And Dealer Takeover
The system SHALL implement the revised opening flow: four players draw counterclockwise with the dealer drawing first, the dealer receives 23 cards, each idle player receives 22 cards, the dealer's final drawn card becomes the jiang card, and every character in the jiang card's phrase is treated as jiang for the round. If the dealer's 23-card hand contains no three-of-a-kind, the dealer SHALL slip; each following player with at least one three-of-a-kind SHALL be offered dealer takeover in turn. If nobody accepts takeover, or no idle player has a three-of-a-kind, the round SHALL be a draw-round and the next round's dealer SHALL be the slipped dealer's next player.

#### Scenario: Opening deal completes
- **WHEN** a new round starts
- **THEN** the system MUST deal 23 cards to the dealer and 22 cards to each idle player by counterclockwise alternating draws, with the dealer receiving the first draw

#### Scenario: Jiang card is marked
- **WHEN** the dealer receives the final card of the opening deal
- **THEN** the system MUST store that card as the jiang card and mark all three characters in that card's phrase as jiang cards for the round

#### Scenario: Dealer has no three-of-a-kind
- **WHEN** the dealer's 23-card hand contains no three cards with the same character key
- **THEN** the system MUST enter dealer-slip flow and offer takeover only to following players who have at least one three-of-a-kind

#### Scenario: Idle player accepts takeover
- **WHEN** an eligible idle player accepts dealer takeover
- **THEN** the system MUST transfer the slipped dealer's final jiang card to that player, set that player as the active dealer for the round, set that player as first discard seat, and start tracking that player's takeover grouping-operation limit

#### Scenario: No player accepts takeover
- **WHEN** every eligible idle player declines takeover or no idle player has a three-of-a-kind
- **THEN** the system MUST end the round as draw-round and start the next round with dealer set to the slipped dealer's next player

#### Scenario: Takeover operation limit is exceeded
- **WHEN** a takeover dealer completes 3 grouping operations and is not in listening state
- **THEN** the system MUST end the round as circle-loss for that takeover dealer

### Requirement: Forced Action And Circle-Loss Rules
The system SHALL detect mandatory chi or peng situations, declined-then-later-chi penalties, zhao/ta support-pair failures, illegal discards, impossible future grouping, and rule violations as circle-loss outcomes.

#### Scenario: Player enters circle-loss
- **WHEN** a player violates a mandatory rule or reaches a state that cannot satisfy required grouping under the configured rules
- **THEN** the system MUST end the round with that player as loser and the other three seats as winners

#### Scenario: Special tazi requires grouping
- **WHEN** a player holds a special tazi structure `xxy`, `yyz`, `zzx`, or `zzy` and the missing or matching incoming card creates a mandatory chi or peng opportunity
- **THEN** the system MUST require the applicable chi or peng unless a higher-priority ta or zhao action is being resolved first

#### Scenario: Declined chi later chosen
- **WHEN** a player declines a legal chi opportunity and later chooses chi on a later chi opportunity covered by the same penalty rule
- **THEN** the system MUST end the round as circle-loss for that player

#### Scenario: Zhao support-pair violation
- **WHEN** a player completes zhao and lacks enough valid support pairs under the four-, five-, or six-card rules
- **THEN** the system MUST end the round as circle-loss if the player cannot legally continue grouping to satisfy the required support pairs

#### Scenario: Rule violation result
- **WHEN** circle-loss is triggered
- **THEN** the result MUST name the current player as loser and the other three players as winners

### Requirement: Discard Restrictions
The system SHALL reject discards from protected complete phrases and enforce phrase-count discard limits.

#### Scenario: Complete phrase card is discarded
- **WHEN** a player's hand contains a complete phrase `xyz` with exactly the three original phrase cards and the player attempts to discard `x`, `y`, or `z` from that complete phrase
- **THEN** the system MUST prevent the discard or mark the player circle-loss if the violation is committed by automated play

#### Scenario: Extra phrase card may be discarded
- **WHEN** a player's hand contains a phrase pattern such as `xxyz`
- **THEN** the system MUST allow the player to discard at most one extra card from that phrase without treating the original `xyz` as illegally split

#### Scenario: Phrase discard limit is exceeded
- **WHEN** a phrase has 4 cards in the player's hand before discarding and the player attempts to discard more than 1 card from that phrase, or a phrase has 5 cards in the player's hand before discarding and the player attempts to discard more than 2 cards from that phrase
- **THEN** the system MUST mark the player circle-loss

