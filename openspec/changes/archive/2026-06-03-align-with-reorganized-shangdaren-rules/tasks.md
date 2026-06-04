## 1. Rule Alignment

- [x] 1.1 Update opening deal order to explicitly deal counterclockwise with dealer first, dealer 23 cards, idle players 22 cards, and dealer final draw stored as jiang card.
- [x] 1.2 Ensure dealer slip offers takeover only to following players with `xxx` or larger same-character kezi and transfers the slipped dealer's final jiang card to the accepting player.
- [x] 1.3 Enforce takeover player's 3 grouping-operation limit and circle-loss if the player is not listening after the third chi, peng, zhao, or ta.
- [x] 1.4 Add dealer listening validation requiring at least one remaining kezi, counting zhao and ta groups as kezi, and circle-loss when chi splits the last kezi.
- [x] 1.5 Refine chi, peng, zhao, and ta legality to enforce source limits, priority `踏 > 招 > 碰 > 吃`, mandatory special-tazi actions, chi-lock behavior, and support-pair obligations.
- [x] 1.6 Refine discard validation for protected exact `xyz` phrases, allowed extra-card discards such as `xxyz`, and 4-card/5-card phrase discard limits.

## 2. Scoring

- [x] 2.1 Add scoring helpers that consume a winning decomposition, action history, jiang phrase, and rule config.
- [x] 2.2 Calculate peng/kezi fu by card color, repeated kezi bonuses, zhao increments, ta increments, and per-group jiang multipliers.
- [x] 2.3 Exclude `xx`, `xyz`, and final `xy` doors from standalone fu while preserving them in the winning door summary.
- [x] 2.4 Classify hu grade as `场`, `大甲`, `小甲`, or `屁胡` using the required priority and thresholds.
- [x] 2.5 Convert hu grade to point value using base score 1: `屁胡` = 1, `大甲`/`小甲` = 2, `场` = 4.

## 3. UI And AI

- [x] 3.1 Update human prompts for support-pair obligations, mandatory chi/peng warnings, dealer-kezi warnings, and takeover operation status.
- [x] 3.2 Update result rendering to show winner or circle-loss player, jiang phrase, total fu, hu grade, point value, and concise scoring details.
- [x] 3.3 Update AI choices to use the same action and discard legality helpers as the human player.

## 4. Validation

- [x] 4.1 Add self-check cases for counterclockwise opening deal, takeover compensation card transfer, dealer kezi listening, and last-kezi chi circle-loss.
- [x] 4.2 Add self-check cases for zhao/ta support-pair source rules, pair reuse prevention, and special-tazi mandatory chi/peng behavior.
- [x] 4.3 Add self-check cases for fu calculation, jiang multiplier, hu-grade priority, and point settlement.
- [x] 4.4 Run `node scripts/run-huapai-checks.mjs` and the existing bundle/build validation.
