## 1. Rule Data Model

- [x] 1.1 Replace default phrase configuration with `上大人`, `孔乙己`, `化三千`, `七十土`, `尔小生`, `福禄寿`, `佳作仁`, and `八九子`.
- [x] 1.2 Set copies per character to 6 and verify deck creation produces 144 cards with stable copy ids.
- [x] 1.3 Add phrase metadata to each card symbol, including phrase id, phrase index, phrase text, and positional color.
- [x] 1.4 Rename action constants from `gang` concepts to `zhao`, add `ta`, and set action priority to `ta > zhao > peng > chi`.
- [x] 1.5 Add round state for dealer seat, slipped dealer, takeover dealer, jiang card, jiang phrase, draw-round result, and takeover-choice queue.
- [x] 1.6 Extend seat state with rule history fields for declined chi opportunities, chi-lock, exposed zhao/ta groups, pair-support obligations, discard counters, takeover status, takeover grouping-operation count, listening state, and circle-loss flags.

## 2. Opening Deal And Dealer Flow

- [x] 2.1 Implement alternating opening deal with dealer drawing first, dealer receiving 23 cards, and each idle player receiving 22 cards.
- [x] 2.2 Store the dealer's final drawn card as the jiang card and mark all cards in that phrase as jiang for the round.
- [x] 2.3 Implement dealer no-three-of-a-kind detection for slip-dealer flow.
- [x] 2.4 Implement takeover eligibility checks for idle players with at least one three-of-a-kind.
- [x] 2.5 Implement takeover choice flow in table order, including human accept/decline and AI deterministic accept/decline.
- [x] 2.6 Transfer the slipped dealer's final card to the accepting idle player and set that player as first discard seat.
- [x] 2.7 Implement draw-round handling when all eligible players decline or no idle player has a three-of-a-kind, and set the next dealer to the slipped dealer's next player.
- [x] 2.8 Implement takeover grouping-operation counting and listening-state check after the third grouping operation.

## 3. Action Evaluators

- [x] 3.1 Implement phrase helper functions for full phrase `xyz`, incomplete phrase `xy`, same-character groups, and phrase-card counts.
- [x] 3.2 Implement chi detection for previous-player discard and own drawn cards using two same-phrase hand cards.
- [x] 3.3 Implement peng detection for any player's discard and own drawn matching card.
- [x] 3.4 Implement zhao detection for any player's discard and own drawn matching card when hand contains at least three matching cards.
- [x] 3.5 Implement ta detection when a drawn card matches an already-zhaoed table group.
- [x] 3.6 Implement priority filtering so lower-priority actions are hidden until higher-priority action tiers are resolved.
- [x] 3.7 Implement forced chi/peng detection for `xxy`, `yyz`, `zzx`, `zzy`, and related two-with-one patterns described by the rules.
- [x] 3.8 Implement zhao/ta support-pair validation for 4, 5, and 6 matching-card groups, including distinct-pair requirements.

## 4. Win And Circle-Loss Evaluation

- [x] 4.1 Replace the existing generic win evaluator with an eight-door decomposition evaluator.
- [x] 4.2 Support door types `xxx`, `xyz`, `xxxx`, `xxxxx`, `xxxxxx`, `xx`, and `xy`.
- [x] 4.3 Enforce exactly one `xy` door in every winning hand.
- [x] 4.4 Enforce support-pair constraints for every 4/5/6-of-a-kind door and reject invalid same-character pair splitting.
- [x] 4.5 Implement listening-state evaluator for takeover dealers as one incoming card away from a valid eight-door win.
- [x] 4.6 Implement circle-loss result creation with one loser, three winners, and a rule reason.
- [x] 4.7 Implement circle-loss checks for takeover operation-limit failure, declined-then-later-chi, illegal zhao/ta support state, impossible support-pair state, and structurally impossible eight-door grouping.
- [x] 4.8 Implement discard legality checks for complete phrases and phrase-count discard limits.

## 5. Engine Flow

- [x] 5.1 Update round setup to initialize the new opening deal, seat history, takeover, jiang, and support-pair state.
- [x] 5.2 Update startup flow to route into dealer-slip takeover choice, draw-round restart, or first discard phase.
- [x] 5.3 Update draw flow to evaluate self-draw chi, peng, zhao, ta, and hu before discarding.
- [x] 5.4 Auto-discard a drawn card when it cannot group with the player's hand or exposed groups.
- [x] 5.5 Update response flow to use incoming-card source restrictions and priority filtering.
- [x] 5.6 Update action application for chi, peng, zhao, and ta, including card movement, exposed group records, support-pair updates, chi-lock history, and takeover operation-count updates.
- [x] 5.7 Update pass handling to record declined chi opportunities and trigger circle-loss when later chi violates the rule.
- [x] 5.8 Update discard flow to reject illegal human discards and circle-loss illegal AI discards.
- [x] 5.9 Update result handling for eight-door win, exhausted-deck draw, draw-round, and circle-loss.

## 6. AI And UI

- [x] 6.1 Update AI takeover decision logic for eligible idle players.
- [x] 6.2 Update AI response selection to use `ta > zhao > peng > chi` plus legal win handling.
- [x] 6.3 Update AI self-draw behavior to choose required legal grouping actions or auto-discard the drawn card.
- [x] 6.4 Update AI discard heuristic to preserve valid doors and avoid complete-phrase and phrase-count discard violations.
- [x] 6.5 Update action button labels and prompts to show `接庄`, `不接`, `吃`, `碰`, `招`, `踏`, `胡`, and `过`.
- [x] 6.6 Update renderer to show current dealer, jiang card/phrase, slip-dealer state, takeover operation count, and draw-round result.
- [x] 6.7 Update renderer result display to show circle-loss loser, winners, and reason.
- [x] 6.8 Update feedback text for forced actions, chi-lock, zhao/ta pair obligations, takeover operation limit, illegal discard, and auto-discard.

## 7. Verification And Documentation

- [x] 7.1 Update `scripts/run-huapai-checks.mjs` for deck size, phrase list, copy counts, and positional colors.
- [x] 7.2 Add deterministic checks for alternating 23/22 opening deal, jiang card/phrase marking, dealer no-three-of-a-kind slip, takeover eligibility, takeover transfer, and draw-round next-dealer behavior.
- [x] 7.3 Add deterministic checks for takeover grouping-operation limit and listening-state success/failure.
- [x] 7.4 Add deterministic checks for chi, peng, zhao, ta, and action priority.
- [x] 7.5 Add deterministic checks for forced chi/peng, declined-then-later-chi circle-loss, and chi-lock restrictions.
- [x] 7.6 Add deterministic checks for zhao/ta support-pair validation and invalid support-pair circle-loss.
- [x] 7.7 Add deterministic checks for discard restrictions from complete phrases and phrase-count limits.
- [x] 7.8 Add deterministic checks for valid eight-door win, missing-`xy` rejection, and insufficient support-pair rejection.
- [x] 7.9 Run the self-check script and entry bundle parsing.
- [x] 7.10 Update `README.md` with the complete Shang Da Ren rule summary and assumptions.
