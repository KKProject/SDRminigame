## Why

The current game uses a simplified Shang Da Ren-like rule model, but the intended gameplay has a specific local rule set with 8 phrases, 6 copies per character, chi/peng/zhao/ta actions, forced-action penalties, circle-loss detection, and eight-door win requirements. Implementing these rules will make the game match the user's target play style instead of behaving like a generic Mahjong-inspired prototype.

## What Changes

- **BREAKING**: Replace the current 24-symbol, 4-copy deck with 8 fixed phrases of 3 characters each and 6 copies per character.
- **BREAKING**: Update card color metadata so each phrase's first character is red, middle character is green, and last character is black.
- Add the revised opening deal: four players draw alternately with the dealer drawing first, the dealer receives 23 cards, idle players receive 22 cards, and the dealer's final drawn card becomes the jiang card.
- Add jiang-card phrase marking: all three characters in the jiang card's phrase are treated as jiang cards for the round.
- Add slip-dealer flow: if the dealer's 23-card hand has no three-of-a-kind, the dealer slips; each next player with a three-of-a-kind may accept or decline dealer takeover; if nobody accepts or nobody has a three-of-a-kind, the round is a draw and restarts with the next dealer.
- Add takeover-dealer restrictions: when an idle player accepts dealer takeover, the slipped dealer's final card transfers to that player, that player acts first, and that player may perform at most 3 grouping operations before reaching listening state; failure after 3 grouping operations triggers circle-loss.
- Add complete action evaluation for eating, peng, zhao, and ta, including source restrictions and priority order `ta > zhao > peng > chi`.
- Add self-draw handling where the drawn card can trigger chi, peng, zhao, or ta; if no grouping operation is possible, the drawn card is automatically discarded.
- Add forced-operation and circle-loss rules for mandatory chi/peng patterns, illegal zhao/ta pair support, illegal discard from complete phrases, and impossible future grouping.
- Add zhao and ta support-pair accounting for 4/5/6-of-a-kind groups and enforce distinct-pair requirements where required.
- Replace the current win evaluator with the eight-door rule: 8 doors total, exactly one `xy` door, allowed doors `xxx`, `xyz`, `xxxx`, `xxxxx`, `xxxxxx`, `xx`, and `xy`, plus pair-support constraints for 4/5/6-of-a-kind groups.
- Update action prompts and AI behavior to include zhao, ta, forced actions, and circle-loss outcomes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `huapai-game-rules`: Replace simplified deck, meld, win, discard, and round-result rules with the full Shang Da Ren rule set.
- `huapai-ai-opponents`: Update AI action priority and discard behavior to obey chi/peng/zhao/ta, forced actions, and circle-loss avoidance.
- `huapai-table-interaction`: Update player prompts, action buttons, feedback, and result display to support zhao, ta, and circle-loss states.

## Impact

- Affected files include `js/game/rules.js`, `js/game/cards.js`, `js/game/evaluator.js`, `js/game/engine.js`, `js/game/ai.js`, `js/game/renderer.js`, `js/game/layout.js`, `scripts/run-huapai-checks.mjs`, and `README.md`.
- Existing simplified `gang` behavior will be renamed/reworked into `zhao`, and `ta` will become a new exposed action tied to already-zhaoed cards.
- Round startup must become a multi-step flow instead of immediately entering the first discard phase.
- Existing tests/checks for the previous win model must be replaced with deterministic scenarios for deck composition, action priority, forced actions, circle-loss, and eight-door win validation.
