## MODIFIED Requirements

### Requirement: Round Setup
The system SHALL initialize a four-seat Shang Da Ren round with a counterclockwise seating order, one dealer, shuffled deck, opening-deal state, jiang-card state, empty exposed action areas, empty discard piles, action-history state, forced-action state, chi-decline penalty state, discard-restriction counters, takeover state, and active turn state.

#### Scenario: New round begins
- **WHEN** the player starts or restarts a game
- **THEN** the system MUST initialize each seat's rule history, run the opening deal, set jiang-card state, evaluate dealer slip, and enter takeover-choice, slip draw-round, or first-discard phase required by the configured rules

#### Scenario: Counterclockwise order is used
- **WHEN** the system evaluates next player, previous player, response order, takeover order, or dealer rotation
- **THEN** it MUST use the configured counterclockwise seat order consistently

### Requirement: Turn Flow
The system SHALL advance play through opening deal, dealer-slip takeover choice, slip draw-round restart, first dealer discard, draw, appearing-card response, discard, chi/peng/zhao/ta resolution, required post-operation discard, takeover operation-limit checks, win resolution, circle-loss resolution, low-deck draw-round, and round restart phases. Drawn cards SHALL NOT enter the drawing player's hand unless a legal action claims them.

#### Scenario: Player discards
- **WHEN** the active human player selects a legal hand card and confirms discard
- **THEN** the system MUST remove that card from the hand, create an appearing card with source `discard`, add or reserve it for the player's discard pile, and offer legal response actions to eligible seats using the configured priority order

#### Scenario: Drawn card cannot group or win
- **WHEN** a player draws a card and no eligible player can win, ta, zhao, peng, or chi using that appearing card
- **THEN** the system MUST put the drawn card directly into the drawing player's discard pile without adding it to any hand
- **AND** the drawing player's next player MUST become the next draw seat

#### Scenario: Drawn card can group or win
- **WHEN** a player draws a card that can be used for hu, ta, zhao, peng, or chi
- **THEN** the system MUST evaluate legal actions for all eligible seats and resolve the highest-priority action tier before lower-priority actions

#### Scenario: Operation requires discard
- **WHEN** a player completes chi, peng, zhao, or ta
- **THEN** the system MUST update that player's hand and exposed groups
- **AND** the player MUST discard one legal hand card before the round can continue

#### Scenario: Response chain ends after discard is unclaimed
- **WHEN** a discarded appearing card has no legal or accepted response
- **THEN** the card MUST remain in the discarding player's discard pile
- **AND** the discarding player's next player MUST become the next draw seat

#### Scenario: Low deck draw-round
- **WHEN** the deck has fewer than 15 cards and no pending win or circle-loss exists
- **THEN** the system MUST end the round as a low-deck draw-round
- **AND** the dealer MUST remain unchanged for the next round

### Requirement: Meld Actions
The system SHALL evaluate Shang Da Ren actions for the current rule configuration, including chi, peng, zhao, and ta, and SHALL resolve simultaneous opportunities by priority `hu > ta > zhao > peng > chi`. Within the same action tier, the system SHALL use the current response order and award the action to the first legal seat.

#### Scenario: Legal response actions are found
- **WHEN** a player discards or draws a card that an eligible seat can use for a configured action
- **THEN** the system MUST expose only legal actions available to each eligible seat

#### Scenario: Chi is accepted
- **WHEN** a player accepts a legal chi action
- **THEN** the system MUST combine the incoming card with two same-phrase hand cards to form a complete phrase and record whether the choice creates a chi-lock restriction

#### Scenario: Exact complete phrase cannot chi again
- **WHEN** a player's hand contains exactly one protected complete `xyz` phrase and the appearing card is `x`, `y`, or `z` from that phrase
- **THEN** the system MUST NOT offer or allow chi using that protected complete phrase
- **AND** the restriction MUST NOT prevent a separate legal hu decomposition using the appearing card

#### Scenario: Chi source is limited
- **WHEN** a player is evaluating ordinary chi
- **THEN** the system MUST allow chi only from that player's own drawn appearing card or from the previous player's appearing card

#### Scenario: Peng is accepted
- **WHEN** a player accepts a legal peng action
- **THEN** the system MUST combine the incoming card with two matching hand cards to form a three-of-a-kind door

#### Scenario: Zhao is accepted
- **WHEN** a player has at least three matching hand cards and accepts a legal zhao action with a matching appearing card
- **THEN** the system MUST create a fixed 4-to-6-card high-order group and immediately validate its support-pair requirement

#### Scenario: Zhao support pairs are validated
- **WHEN** a zhao group contains 4, 5, or 6 cards
- **THEN** the system MUST require 1, 2, or 3 support pairs respectively, allow support pairs split from larger same-character groups, prevent the same support pair from serving multiple high-order groups, and require distinct pair source characters when multiple pairs are required by one group

#### Scenario: Ta is accepted
- **WHEN** a drawn card matches an already-zhaoed table group and a legal seat accepts ta
- **THEN** the system MUST add the card to that zhao/ta group, increase that group's required support-pair count by 1, and revalidate support-pair obligations

#### Scenario: Ta source is draw only
- **WHEN** an appearing card came from a player discard
- **THEN** the system MUST NOT allow ta with that card

#### Scenario: Support failure causes circle-loss
- **WHEN** a zhao or ta action leaves the player without enough valid support pairs under the immediate validation rule
- **THEN** the system MUST end the round as circle-loss for that player

#### Scenario: Action priority is applied
- **WHEN** multiple players or actions are available for the same appearing card
- **THEN** the system MUST resolve only the highest-priority action tier before lower-priority actions

#### Scenario: Same player has chi and peng
- **WHEN** the same player can both chi and peng the same appearing card and no higher-priority action intercepts it
- **THEN** the system MUST allow that player or AI to choose between legal chi and legal peng

#### Scenario: Chi-peng conflict creates chi lock
- **WHEN** a player with an `xxyz` structure receives `x` and chooses chi instead of peng
- **THEN** the system MUST prevent that player from later using any hand card for peng, zhao, or ta in the round

#### Scenario: Chi-peng conflict accepts peng
- **WHEN** a player with an `xxyz` structure receives `x` and chooses peng
- **THEN** the system MUST allow that player to continue using later legal peng, zhao, and ta actions

### Requirement: Win Detection
The system SHALL detect winning hands using the eight-door Shang Da Ren rule. A winning hand MUST decompose into exactly 8 doors, each door MUST be one of `xxx`, `xyz`, `xxxx`, `xxxxx`, `xxxxxx`, `xx`, or `xy`, and the decomposition MUST contain exactly one `xy` door. Support-pair constraints for 4/5/6-of-a-kind doors MUST be satisfied.

#### Scenario: Eight-door win succeeds
- **WHEN** a player's concealed cards, exposed groups, and the appearing card can be decomposed into 8 valid doors with exactly one `xy` door and all required support pairs
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

#### Scenario: Appearing card completes xy
- **WHEN** the appearing card combines with one same-phrase hand card to form the only `xy` door in an otherwise legal 8-door decomposition
- **THEN** the system MUST allow hu from any appearing-card source

#### Scenario: Appearing card completes pair
- **WHEN** the appearing card combines with one matching hand card to form an `xx` pair door and the decomposition still contains exactly one other `xy` door
- **THEN** the system MUST allow hu

#### Scenario: Appearing card triggers regrouping
- **WHEN** a player has a complete `xyz` phrase and the appearing card is another character from that phrase, allowing regrouping such as `xyz + x` into `xx + yz`
- **THEN** the system MUST allow that regrouping only if the final decomposition has exactly 8 doors and exactly one `xy`

#### Scenario: Dealer listening requires kezi
- **WHEN** the active dealer or takeover dealer reaches a listening candidate state
- **THEN** the system MUST treat the state as legal only if the hand or exposed groups still contain at least one `xxx` or larger same-character kezi, counting zhao and ta groups as kezi

#### Scenario: Dealer splits last kezi through chi
- **WHEN** a dealer or takeover dealer uses chi in a way that leaves no remaining `xxx` or larger same-character kezi
- **THEN** the system MUST end the round as circle-loss for that dealer

#### Scenario: Single winner by response order
- **WHEN** multiple players can hu with the same appearing card
- **THEN** the system MUST award hu only to the first legal player in the current response order

### Requirement: Opening Deal And Dealer Takeover
The system SHALL implement the revised opening flow: four players draw counterclockwise with the dealer drawing first, the dealer receives 23 cards, each idle player receives 22 cards, the dealer's final drawn card becomes the jiang card, and every character in the jiang card's phrase is treated as jiang for the round. If the dealer's 23-card hand contains no three-of-a-kind or larger same-character group, the dealer SHALL slip; each following player with at least one three-of-a-kind or larger same-character group SHALL be offered dealer takeover in turn. If nobody accepts takeover, or no idle player has a three-of-a-kind, the round SHALL be a slip draw-round and the next round's dealer SHALL be the slipped dealer's next player.

#### Scenario: Opening deal completes
- **WHEN** a new round starts
- **THEN** the system MUST deal 23 cards to the dealer and 22 cards to each idle player by counterclockwise alternating draws, with the dealer receiving the first draw

#### Scenario: Jiang card is marked
- **WHEN** the dealer receives the final card of the opening deal
- **THEN** the system MUST store that card as the jiang card and mark all three characters in that card's phrase as jiang cards for the round

#### Scenario: Dealer has no kezi base
- **WHEN** the dealer's 23-card hand contains no `xxx`, `xxxx`, `xxxxx`, or `xxxxxx` same-character group
- **THEN** the system MUST enter dealer-slip flow and offer takeover only to following players who have at least one kezi base

#### Scenario: Idle player accepts takeover
- **WHEN** an eligible idle player accepts dealer takeover
- **THEN** the system MUST transfer the slipped dealer's final jiang card to that player, set that player as the active dealer for the round, set that player as first discard seat, and start tracking that player's takeover grouping-operation limit

#### Scenario: No player accepts takeover
- **WHEN** every eligible idle player declines takeover or no idle player has a kezi base
- **THEN** the system MUST end the round as slip draw-round and start the next round with dealer set to the slipped dealer's next player

#### Scenario: Takeover operation limit is checked after discard
- **WHEN** a takeover dealer completes the third chi, peng, zhao, or ta operation and then discards the required third card
- **THEN** the system MUST immediately check whether that player is listening

#### Scenario: Takeover operation limit is missed
- **WHEN** a takeover dealer has completed 3 grouping operations and is not in listening state after the required discard
- **THEN** the system MUST end the round as circle-loss for that takeover dealer

### Requirement: Forced Action And Circle-Loss Rules
The system SHALL detect mandatory chi or peng situations, declined-then-later-chi penalties, zhao/ta support-pair failures, illegal discards, impossible future grouping, chi-lock violations, dealer kezi violations, and rule violations as circle-loss outcomes.

#### Scenario: Player enters circle-loss
- **WHEN** a player violates a mandatory rule or reaches a state that cannot satisfy required grouping under the configured rules
- **THEN** the system MUST end the round with that player as loser and the other three seats as winners

#### Scenario: Special tazi requires grouping
- **WHEN** a player holds exactly three hand cards in one phrase with structure `xxy`, `yyz`, `zzx`, or `zzy`, and the appearing card creates the table-defined mandatory chi or peng opportunity
- **THEN** the system MUST require the applicable chi or peng unless a higher-priority hu, ta, or zhao action is being resolved first

#### Scenario: Mandatory peng discards remainder
- **WHEN** a player resolves mandatory peng from a special tazi structure
- **THEN** the remaining different hand card from that phrase MUST be the next discarded card

#### Scenario: Mandatory chi discards remainder
- **WHEN** a player resolves mandatory chi from a special tazi structure that leaves one extra different card in that phrase
- **THEN** that remaining different card MUST be the next discarded card

#### Scenario: Declined chi later chosen
- **WHEN** a player declines a legal chi opportunity and later chooses chi for the same phrase and same missing-card penalty key
- **THEN** the system MUST end the round as circle-loss for that player

#### Scenario: Zhao support-pair violation
- **WHEN** a player completes zhao or ta and lacks enough valid support pairs under the current high-order group rules
- **THEN** the system MUST end the round as circle-loss for that player

#### Scenario: Chi-lock violation
- **WHEN** a player previously chose chi in a chi-peng conflict and later attempts peng, zhao, or ta with any hand card in the same round
- **THEN** the system MUST end the round as circle-loss for that player

#### Scenario: Rule violation result
- **WHEN** circle-loss is triggered
- **THEN** the result MUST name the current player as loser and the other three players as winners

### Requirement: Discard Restrictions
The system SHALL reject discards from protected complete phrases, enforce phrase-count discard limits, and treat inability to make a legal discard while not winning as circle-loss.

#### Scenario: Complete phrase card is discarded
- **WHEN** a player's hand contains a complete phrase `xyz` with exactly the three original phrase cards and the player attempts to discard `x`, `y`, or `z` from that complete phrase
- **THEN** the system MUST prevent the discard for a human player or mark the player circle-loss if the violation is committed by automated play

#### Scenario: Extra phrase card may be discarded
- **WHEN** a player's hand contains a phrase pattern such as `xxyz`
- **THEN** the system MUST allow the player to discard at most one extra card from that phrase without treating the original `xyz` as illegally split

#### Scenario: Four-card phrase discard limit is exceeded
- **WHEN** a phrase has 4 cards in the player's hand before discard tracking for that phrase and the player attempts to discard more than 1 card from that phrase
- **THEN** the system MUST mark the player circle-loss

#### Scenario: Five-card phrase discard limit is exceeded
- **WHEN** a phrase has 5 cards in the player's hand before discard tracking for that phrase and the player attempts to discard more than 2 cards from that phrase
- **THEN** the system MUST mark the player circle-loss

#### Scenario: No legal discard exists
- **WHEN** a player is required to discard, cannot legally discard any hand card, and does not have a legal hu
- **THEN** the system MUST end the round as circle-loss for that player
