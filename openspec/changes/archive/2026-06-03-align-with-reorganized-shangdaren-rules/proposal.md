## Why

The game already implements the main Shang Da Ren table flow, but the newly organized rule document clarifies several edge cases and adds scoring, win-grade, and point-settlement rules that are not yet fully specified. This change aligns the project contract with that source document before implementation continues.

## What Changes

- Tighten the opening and takeover rules around counterclockwise dealing, dealer slip, takeover compensation card transfer, and takeover operation limits.
- Clarify kezi-dependent dealer/listening behavior: a dealer listening state must retain at least one kezi or zhao-derived kezi, and splitting the last kezi into chi causes circle-loss.
- Refine chi, peng, zhao, ta, discard, support-pair, and circle-loss requirements using the reorganized rule document's mandatory-action and pair-source constraints.
- Add scoring support for fu counting, jiang multiplier, hu grade classification, and point settlement.
- Update table feedback requirements so players can see fu, hu grade, points, and rule-specific failure reasons after a win or circle-loss.

## Capabilities

### New Capabilities
- `huapai-scoring`: Calculates fu, classifies hu grade, applies jiang multipliers, and resolves base-point settlement after a legal hu.

### Modified Capabilities
- `huapai-game-rules`: Aligns opening deal, takeover, action legality, pair support, discard restrictions, win detection, and circle-loss rules with the reorganized Shang Da Ren rules.
- `huapai-table-interaction`: Expands result and prompt feedback to include scoring, hu grade, point settlement, and clarified rule warnings.

## Impact

- Affected rule modules: `js/game/rules.js`, `js/game/cards.js`, `js/game/evaluator.js`, and `js/game/engine.js`.
- Affected AI behavior: `js/game/ai.js` must obey refined mandatory-action and discard constraints.
- Affected UI rendering: `js/game/renderer.js` and `js/game/input.js` must expose updated prompts and result summaries.
- Affected validation: `scripts/run-huapai-checks.mjs` should cover the updated edge cases and new scoring examples.
