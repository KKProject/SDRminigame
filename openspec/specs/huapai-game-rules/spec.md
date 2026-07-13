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
The system SHALL evaluate Shang Da Ren actions for the current rule configuration, including chi, peng, zhao, and ta, and SHALL resolve simultaneous opportunities by priority `hu > ta > zhao > peng > chi`. Within the same action tier, the system SHALL use the current response order and award the action to the first legal seat. When one appearing card creates legal opportunities for multiple seats, the system SHALL allow all eligible seats to decide concurrently, then award the appearing card to the highest-priority accepted legal action. When the currently accepted best action cannot be defeated by any unresolved legal action, the system SHALL resolve that action immediately without waiting for lower-priority unresolved seats. When the first legal seat has multiple legal choices within the awarded action tier, the system SHALL allow that seat to choose among those legal choices.

#### Scenario: Legal response actions are found
- **WHEN** a player discards or draws a card that an eligible seat can use for a configured action
- **THEN** the system MUST expose only legal actions available to each eligible seat
- **AND** legal actions for one seat MUST NOT be exposed to other seats

#### Scenario: Concurrent response actions are collected
- **WHEN** multiple eligible seats can respond to the same appearing card
- **THEN** the system MUST allow each eligible human seat to choose from its own legal actions without waiting for earlier response-order seats to pass
- **AND** the system MUST keep the appearing card reserved until the response window resolves

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

#### Scenario: Zhao choices are enumerated
- **WHEN** a player has 3, 4, or 5 matching hand cards and receives a matching appearing card
- **THEN** the system MUST enumerate one legal zhao choice for each target group size from 4 cards through the maximum size that can be formed with that hand and appearing card
- **AND** each zhao choice MUST identify the target group size or equivalent number of matching hand cards consumed

#### Scenario: Zhao is accepted with selected size
- **WHEN** a player accepts a legal zhao action with a matching appearing card
- **THEN** the system MUST consume exactly the number of matching hand cards identified by that zhao choice
- **AND** the system MUST create a fixed 4-to-6-card high-order group matching the selected zhao size
- **AND** any extra matching hand cards not selected for this zhao MUST remain in the player's hand

#### Scenario: Zhao support pairs use selected size
- **WHEN** a zhao group is selected as 4, 5, or 6 cards
- **THEN** the system MUST require 1, 2, or 3 support pairs respectively, allow support pairs split from larger same-character groups, prevent the same support pair from serving multiple high-order groups, and require distinct pair source characters when multiple pairs are required by one group

#### Scenario: Xxxxy can preserve same-phrase remainder
- **WHEN** a player has same-phrase cards `xxxxy` and receives an appearing `x`
- **THEN** the system MUST allow a zhao choice that consumes exactly three hand `x` cards and the appearing `x` to form a 4-card zhao group
- **AND** the remaining hand cards from that phrase MUST still include `xy`

#### Scenario: Larger zhao choice does not hide smaller legal choice
- **WHEN** a larger zhao choice lacks enough support pairs
- **AND** a smaller zhao choice with the same appearing card has enough support pairs
- **THEN** the system MUST still offer or allow the smaller legal zhao choice

#### Scenario: Ta is accepted
- **WHEN** a drawn card matches an already-zhaoed table group and a legal seat accepts ta
- **THEN** the system MUST add the card to that zhao/ta group, increase that group's required support-pair count by 1, and revalidate support-pair obligations

#### Scenario: Ta source is draw only
- **WHEN** an appearing card came from a player discard
- **THEN** the system MUST NOT allow ta with that card

#### Scenario: Support failure causes circle-loss
- **WHEN** a zhao or ta action leaves the player without enough valid support pairs under the immediate validation rule for the selected group size
- **THEN** the system MUST end the round as circle-loss for that player

#### Scenario: Action priority is applied
- **WHEN** multiple players or actions are available for the same appearing card
- **THEN** the system MUST resolve only the highest-priority accepted legal action tier before lower-priority actions
- **AND** a lower-priority accepted action MUST NOT take the appearing card while a higher-priority legal candidate remains unresolved

#### Scenario: Zhao or ta resolves before lower priority candidates
- **WHEN** a player accepts a legal zhao or ta action for an appearing card
- **AND** no unresolved hu candidate can still claim that appearing card
- **THEN** the system MUST resolve the zhao or ta immediately
- **AND** unresolved peng or chi choices for the same appearing card MUST become invalid

#### Scenario: Hu intercepts zhao or ta
- **WHEN** one seat can hu an appearing card and another seat can zhao or ta that same appearing card
- **THEN** the hu candidate MUST remain able to win according to priority until it chooses, times out, or is otherwise resolved
- **AND** zhao or ta MUST NOT be applied before the hu candidate is no longer able to defeat it

#### Scenario: Same-tier response order decides winner
- **WHEN** multiple seats accept legal actions in the same priority tier for the same appearing card
- **THEN** the system MUST award the action to the earliest seat in the current response order

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
The system SHALL detect winning hands using the eight-door Shang Da Ren rule. A winning hand MUST decompose into exactly 8 doors, each door MUST be one of `xxx`, `xyz`, `xxxx`, `xxxxx`, `xxxxxx`, `xx`, or `xy`, and the decomposition MUST contain exactly one `xy` door. Support-pair constraints for 4/5/6-of-a-kind doors MUST be satisfied, and manual hand-discard response restrictions MUST be applied before exposing hu actions.

#### Scenario: Eight-door win succeeds
- **WHEN** a player's concealed cards, exposed groups, and the appearing card can be decomposed into 8 valid doors with exactly one `xy` door and all required support pairs
- **AND** the appearing card is not blocked by manual hand-discard response restrictions
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
- **AND** the appearing card is not blocked by manual hand-discard response restrictions
- **THEN** the system MUST allow hu from any appearing-card source

#### Scenario: Appearing card completes pair
- **WHEN** the appearing card combines with one matching hand card to form an `xx` pair door and the decomposition still contains exactly one other `xy` door
- **AND** the appearing card is not blocked by manual hand-discard response restrictions
- **THEN** the system MUST allow hu

#### Scenario: Appearing card triggers regrouping
- **WHEN** a player has a complete `xyz` phrase and the appearing card is another character from that phrase, allowing regrouping such as `xyz + x` into `xx + yz`
- **AND** the appearing card is not blocked by manual hand-discard response restrictions
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

### Requirement: Round Restart
The system SHALL allow the player to start a fresh round after a win or draw without reloading the minigame.

#### Scenario: Result restart
- **WHEN** the player taps restart on the result overlay
- **THEN** the system MUST clear previous round state and begin a new shuffled round

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
The system SHALL enforce phrase discard restrictions with a same-phrase reachability algorithm based only on cards actively discarded from hand, SHALL allow opening-hand `xxyy` same-phrase two-pair structures to be freely discarded, SHALL NOT let draw auto-discard (`auto-discard-draw`) consume same-phrase hand discard allowance, and SHALL treat inability to make a legal discard while not winning as circle-loss.

#### Scenario: Exact complete phrase card is discarded
- **WHEN** a player's same-phrase hand cards are exactly `xyz`
- **AND** the player attempts to discard `x`, `y`, or `z` from that phrase
- **THEN** the system MUST prevent the discard for a human player or mark the player circle-loss if the violation is committed by automated play

#### Scenario: Same-phrase discard preserves a reachable door
- **WHEN** a player attempts to discard a card from phrase `x/y/z`
- **THEN** the system MUST simulate that discard together with prior manual hand discards from the same phrase
- **AND** the discard MUST be legal only if the remaining same-phrase hand cards can still preserve or reach at least one final door among `xyz`, `xxx`, `yyy`, or `zzz` without exceeding the phrase discard allowance, unless a more specific same-phrase discard scenario permits the discard

#### Scenario: Draw auto-discard does not consume same-phrase hand allowance
- **WHEN** a player holds same-phrase hand cards such as `yyz`
- **AND** a drawn appearing card from the same phrase was previously auto-discarded as `auto-discard-draw`
- **THEN** the system MUST judge the next hand discard using only the player's current hand cards and prior manual hand discards
- **AND** the auto-discarded drawn card MUST NOT consume the same-phrase hand discard allowance

#### Scenario: Xxyz only discards the extra key
- **WHEN** a player's same-phrase structure is `xxyz`
- **THEN** the system MUST allow discarding `x`
- **AND** the system MUST reject discarding `y` or `z`

#### Scenario: Xxxyz supports sequence or triplet remainder
- **WHEN** a player's same-phrase structure is `xxxyz`
- **THEN** the system MUST allow discard paths that eventually discard `xx` and preserve `xyz`
- **AND** the system MUST allow discard paths that eventually discard `yz` and preserve `xxx`
- **AND** the system MUST reject any discard that can no longer reach either preserved door

#### Scenario: Xxyy may be freely discarded
- **WHEN** a player's opening-hand same-phrase structure is `xxyy`
- **THEN** the system MUST allow discarding `x` or `y`
- **AND** the system MUST continue allowing follow-up discards from that same phrase even if the remaining same-phrase cards can no longer preserve or reach `xyz`, `xxx`, `yyy`, or `zzz`
- **AND** the system MUST allow the player to discard all four same-phrase cards if each discard is otherwise legal

#### Scenario: Xxyyz may discard z and then stop
- **WHEN** a player's same-phrase structure is `xxyyz`
- **THEN** the system MUST allow discard paths that eventually discard `xy` and preserve `xyz`
- **AND** the system MUST allow discarding `z` only if no further discard from that phrase is allowed afterward
- **AND** the system MUST reject follow-up same-phrase discards after `z` because no preserved door remains reachable

#### Scenario: Zzzxxy supports both target doors
- **WHEN** a player's same-phrase structure is `zzzxxy`
- **THEN** the system MUST allow discard paths that eventually discard `xzz` and preserve `xyz`
- **AND** the system MUST allow discard paths that eventually discard `xxy` and preserve `zzz`
- **AND** the system MUST reject any discard path that cannot still reach one of those preserved doors

#### Scenario: No legal discard exists
- **WHEN** a player is required to discard, cannot legally discard any hand card, and does not have a legal hu
- **THEN** the system MUST end the round as circle-loss for that player

### Requirement: Discarded Key Response Restrictions
The system SHALL maintain, for each player and round, a manual hand-discard key record containing only character keys that the player actively discarded from hand by selecting a hand card and confirming discard (`discard` event). The system SHALL NOT treat draw auto-discard (`auto-discard-draw`) as a manual hand discard. The system SHALL prevent that player from later claiming an appearing card with the same key through chi, peng, zhao, ta, or hu, even if the player still holds other hand cards with that key. The system SHALL treat a mandatory chi that is blocked by this record as circle-loss for that player.

#### Scenario: Manual hand discard creates response restriction
- **WHEN** a player actively selects and discards key `x` from hand during the current round
- **THEN** the system MUST add key `x` to that player's manual hand-discard key record for the current round

#### Scenario: Draw auto-discard does not create response restriction
- **WHEN** a player draws key `x` and no player claims that appearing card
- **AND** the system auto-discards that card as `auto-discard-draw`
- **THEN** the system MUST NOT add key `x` to that player's manual hand-discard key record

#### Scenario: Claimed hand discard remains recorded
- **WHEN** a player actively discards key `x` from hand
- **AND** that discarded card is later removed from the discard pile because another player claims it
- **THEN** the system MUST still treat key `x` as manually hand-discarded by the original player for future response restrictions

#### Scenario: Manually hand-discarded key cannot be chi
- **WHEN** a player has key `x` in the manual hand-discard key record
- **AND** an appearing card with key `x` creates an otherwise legal chi action for that player
- **THEN** the system MUST NOT offer or allow a chi action for that player with key `x`

#### Scenario: Manually hand-discarded key cannot be peng
- **WHEN** a player has key `x` in the manual hand-discard key record
- **AND** an appearing card with key `x` creates an otherwise legal peng action for that player
- **THEN** the system MUST NOT offer or allow peng for that player with key `x`
- **AND** the restriction MUST apply even if the player still holds two or more hand cards with key `x`

#### Scenario: Manually hand-discarded key cannot be zhao
- **WHEN** a player has key `x` in the manual hand-discard key record
- **AND** an appearing card with key `x` creates an otherwise legal zhao action for that player
- **THEN** the system MUST NOT offer or allow zhao for that player with key `x`

#### Scenario: Manually hand-discarded key cannot be ta
- **WHEN** a player has key `x` in the manual hand-discard key record
- **AND** an appearing card with key `x` creates an otherwise legal ta action for that player
- **THEN** the system MUST NOT offer or allow ta for that player with key `x`

#### Scenario: Manually hand-discarded key cannot be hu
- **WHEN** a player has key `x` in the manual hand-discard key record
- **AND** an appearing card with key `x` creates an otherwise legal hu action for that player
- **THEN** the system MUST NOT offer or allow hu for that player with that appearing card

#### Scenario: Non-manual discard does not block responses
- **WHEN** key `x` previously appeared only through draw auto-discard or another non-manual-hand-discard event for a player
- **AND** a later appearing card with key `x` creates an otherwise legal response action for that player
- **THEN** the system MUST allow that response if all other rule requirements are satisfied

#### Scenario: Mandatory chi blocked by manual hand discard causes circle-loss
- **WHEN** an appearing card with key `x` creates a mandatory chi for a player
- **AND** key `x` is in that player's manual hand-discard key record
- **THEN** the system MUST end the round as circle-loss for that player
- **AND** the result MUST pay the other three seats according to the configured circle-loss settlement

### Requirement: 配置化胡牌结算
The system SHALL calculate win settlement points from the winning hand grade, total fu, and room settlement rules. A normal `场` hand SHALL charge each non-winning player 4 points; when heavy-round settlement is enabled and the winning hand has total fu greater than or equal to 88, the same `场` hand SHALL charge each non-winning player 8 points. Heavy-round settlement MUST NOT change the hand grade or total fu.

#### Scenario: 普通场按一场结算
- **WHEN** a player wins with grade `场`
- **AND** heavy-round settlement is disabled
- **THEN** each non-winning player MUST pay 4 points to the winner
- **AND** the result MUST NOT be marked as heavy-round settlement

#### Scenario: 低于八十八福不触发重场
- **WHEN** a player wins with grade `场`
- **AND** heavy-round settlement is enabled
- **AND** the winning hand has total fu less than 88
- **THEN** each non-winning player MUST pay 4 points to the winner
- **AND** the result MUST NOT be marked as heavy-round settlement

#### Scenario: 八十八福场触发重场
- **WHEN** a player wins with grade `场`
- **AND** heavy-round settlement is enabled
- **AND** the winning hand has total fu greater than or equal to 88
- **THEN** each non-winning player MUST pay 8 points to the winner
- **AND** the result MUST keep grade `场`
- **AND** the result MUST be marked as heavy-round settlement

### Requirement: 配置化进圈赔付
The system SHALL calculate circle-loss settlement points from the room's configured circle-loss pay type. `pihu` SHALL pay 1 point to each winner, `jiahu` SHALL pay 2 points to each winner, and `changhu` SHALL pay 4 points to each winner.

#### Scenario: 进圈按屁胡赔付
- **WHEN** a player enters circle-loss with circle-loss pay type `pihu`
- **THEN** the losing player MUST pay 1 point to each of the other three players

#### Scenario: 进圈按甲胡赔付
- **WHEN** a player enters circle-loss with circle-loss pay type `jiahu`
- **THEN** the losing player MUST pay 2 points to each of the other three players

#### Scenario: 进圈按场胡赔付
- **WHEN** a player enters circle-loss with circle-loss pay type `changhu`
- **THEN** the losing player MUST pay 4 points to each of the other three players

### Requirement: 单局结算分差
The system SHALL include deterministic payment details and per-seat round score deltas in every win or circle-loss result. The sum of all round score deltas MUST equal zero.

#### Scenario: 胡牌结果包含单局分差
- **WHEN** a player wins and the result is created
- **THEN** the result MUST include one payment from each non-winning player to the winner
- **AND** the result MUST include each seat's score delta for that round
- **AND** the winner's round score delta MUST equal the sum of received payments

#### Scenario: 进圈结果包含单局分差
- **WHEN** a player enters circle-loss and the result is created
- **THEN** the result MUST include one payment from the losing player to each of the other three players
- **AND** the result MUST include each seat's score delta for that round
- **AND** all round score deltas MUST sum to zero
