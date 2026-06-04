## Context

The project is a WeChat minigame that has already moved from the shooter template into a landscape Shang Da Ren card-table game. The current implementation contains the deck model, four-seat round state, AI seats, chi/peng/zhao/ta action resolution, dealer slip and takeover, win detection, and basic result feedback. The reorganized rule document now acts as the gameplay source of truth and adds clearer edge-case rules plus fu, hu-grade, and point-settlement rules.

The implementation should keep the current lightweight JavaScript module structure. Rule calculation should remain inside `js/game/rules.js`, `js/game/cards.js`, and `js/game/evaluator.js`, while `engine.js` owns phase transitions and `renderer.js` owns display.

## Goals / Non-Goals

**Goals:**
- Align opening deal, jiang, slip-dealer, takeover, mandatory actions, pair-support, discard, circle-loss, and win checks with the reorganized rules.
- Add a deterministic scoring evaluator that returns fu details, hu grade, and points after a legal hu.
- Surface enough feedback for a player to understand why a move is required, illegal, winning, scored, or circle-loss.
- Extend self-checks with examples from the reorganized rule document.

**Non-Goals:**
- Multiplayer networking, online matchmaking, or persistent score history.
- Art redesign beyond presenting the new rule and scoring information.
- A complete tutorial or help manual inside the game.

## Decisions

1. Keep scoring separate from turn resolution.
   - Decision: Add scoring helpers that consume the winning decomposition, jiang phrase state, meld/action history, and rule config, then return a scoring summary object.
   - Rationale: Win legality and settlement value are related but separate concerns. Keeping them separate reduces the chance that fu rules accidentally change whether a hand is legal.
   - Alternative considered: Fold fu calculation into the existing win evaluator. This would be faster to wire initially, but harder to test and reason about.

2. Represent support-pair obligations explicitly.
   - Decision: Track each high-order same-character group with required pair count and consumed pair sources, and validate distinct-source constraints for five- and six-card groups.
   - Rationale: The reorganized rules allow pairs to be split from larger groups, but prohibit using multiple pairs from one same-character source for some obligations. This needs provenance, not just pair counts.
   - Alternative considered: Count available pairs globally. That is simpler, but cannot detect examples such as `xxxxx + aaaa` being illegal.

3. Preserve current phase machine and add stricter guards.
   - Decision: Keep existing phases for opening deal, takeover choice, discard, response, draw, result, and draw-round. Add guards for counterclockwise deal order, dealer-listening kezi, chi-lock, forced action, and discard restrictions.
   - Rationale: The present architecture already matches the table flow, so this change should refine behavior rather than rewrite the engine.
   - Alternative considered: Rebuild the game as an event-sourced rules engine. That would be overkill for this minigame and risk delaying visible progress.

4. Store result details in round state.
   - Decision: Win and circle-loss result state should include rule reason, decomposition, fu breakdown, hu grade, points, jiang multiplier, and winners/loser.
   - Rationale: The canvas renderer and future tests both need stable, inspectable result data.
   - Alternative considered: Generate result text directly in the renderer. That would couple UI text to rule logic and make tests weaker.

## Risks / Trade-offs

- Kezi wording ambiguity -> The source document says the dealer has no kezi when lacking same-character groups, while examples define kezi as `xxx`; implementation will treat `xxx` or larger as kezi, matching the examples and previous rule description.
- Complex support-pair search -> Use bounded recursive or dynamic search over 24 symbols and existing door candidates, with explicit tests for four-, five-, and six-card groups.
- AI illegal discard risk -> Reuse the same legality helpers for human and AI discards so automated play cannot bypass protected phrase and phrase-count rules.
- Scoring trace readability -> Return itemized scoring entries so UI and tests can inspect which groups produced fu and which jiang multiplier was applied.
