## MODIFIED Requirements

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
