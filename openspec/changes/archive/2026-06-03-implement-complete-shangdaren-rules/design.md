## Context

The current implementation is a playable local card-table prototype, but its rules are still simplified: 24 symbols, 4 copies per symbol, chi/peng/gang-like actions, and a generic grouped-hand win evaluator. The target game now has a concrete Shang Da Ren local rule set with 8 fixed phrases, 6 copies per character, alternating opening deal, dealer slip/takeover, jiang-card phrase marking, positional colors, chi/peng/zhao/ta actions, forced-operation penalties, circle-loss outcomes, discard restrictions, and an eight-door win model.

This change is primarily a rule-engine rewrite. The renderer and input system can be kept, but action labels, prompts, result text, AI choices, and self-check scenarios must be updated to reflect zhao, ta, and circle-loss states.

## Goals / Non-Goals

**Goals:**

- Represent the exact 8 phrases: `上大人`, `孔乙己`, `化三千`, `七十土`, `尔小生`, `福禄寿`, `佳作仁`, `八九子`.
- Build a 144-card deck with 6 copies of each character.
- Color every phrase by position: first red, second green, third black.
- Deal by alternating draws with the dealer drawing first; dealer receives 23 cards, idle players receive 22 cards.
- Mark the dealer's final drawn card as the jiang card and treat all characters in its phrase as jiang cards for the round.
- Implement dealer slip, takeover selection, draw-round restart, and next-dealer assignment when no player accepts takeover.
- Enforce the takeover dealer's maximum 3 grouping operations before listening state, with circle-loss on failure.
- Implement chi, peng, zhao, and ta action detection, priority, application, and prompts.
- Implement self-draw grouping behavior, including auto-discard of a drawn card when no grouping action is possible.
- Implement forced chi/peng rules, pass-then-chi circle-loss rules, chi-lock behavior, zhao/ta pair support checks, discard restrictions, and impossible-grouping circle-loss.
- Implement eight-door win evaluation with exactly one `xy` door and support-pair requirements for 4/5/6-of-a-kind doors.
- Update AI to choose legal high-priority actions and avoid rule violations where a deterministic safe choice exists.
- Add deterministic self-check cases for the full rule set.

**Non-Goals:**

- Network multiplayer or human-vs-human room logic.
- Visual card-art atlas slicing beyond existing character rendering.
- Gambling, settlement persistence, or account-level ranking.
- Exhaustively solving every future hand for perfect AI; impossible-grouping checks should be conservative and deterministic.

## Decisions

1. Model phrases and character position as first-class metadata.

   Each card symbol will store `phraseId`, `phraseIndex`, `text`, `key`, and color. Action and win evaluators can then ask whether cards form a full phrase (`xyz`), two-character incomplete phrase (`xy`), same-rank group (`xxx` through `xxxxxx`), or pair (`xx`) without relying on ad hoc string matching.

   Alternative considered: keep the existing `group/order` fields only. That is close, but the new rules depend heavily on phrase-level reasoning, so explicit naming is clearer.

2. Make opening deal a dedicated engine phase before normal play.

   The engine should explicitly model `opening-deal`, `dealer-slip`, `takeover-choice`, `draw-round`, and normal action phases. The dealer's last card must be tracked separately as `jiangCard` before being transferred during takeover. This prevents special startup rules from being hidden inside generic `startRound()`.

   Alternative considered: deal hands directly and then patch state if the dealer lacks a three-of-a-kind. That makes jiang-card transfer and next-dealer logic fragile.

3. Replace `gang` with `zhao`, and add `ta` as a separate action type.

   Zhao represents taking a fourth to sixth copy into an exposed same-character group. Ta represents adding a drawn card to an already-zhaoed exposed group on the table and increasing that group's support-pair requirement. Keeping them distinct makes priority, prompts, support-pair validation, and result text testable.

   Alternative considered: treat both as variants of `gang`. That would preserve older code paths, but would hide important rule differences.

4. Split rule evaluation into pure helper layers.

   The evaluator should expose functions for deck metadata, action candidates, priority resolution, forced-action detection, discard legality, support-pair validation, circle-loss detection, and win decomposition. The engine should orchestrate state transitions; it should not embed the whole ruleset inline.

   Alternative considered: implement rules directly in `HuapaiEngine`. That would be faster initially, but hard to verify because many rules interact.

5. Track per-seat rule history.

   Seats need additional state such as declined chi opportunities, chi-lock after choosing chi from an `xxyz`-style hand, exposed zhao/ta groups, support-pair obligations, action history, takeover status, grouping operation count since takeover, listening state, and circle-loss status. This history is required for pass-then-chi, post-chi restrictions, and the 3-operation takeover limit.

   Alternative considered: infer everything from current hand and melds. That is not enough to know whether a later chi is invalid because a previous chi opportunity was declined.

6. Treat circle-loss as a round result type.

   When a player violates a rule or reaches a state where required grouping is impossible, the engine will finish the round with `result.type = "circle-loss"`, `loser`, and `winners` containing the other three seats. The renderer can display this alongside win/draw results.

   Alternative considered: keep circle-loss as a feedback prompt and continue play. The rule says the current player loses to the other three, so it must end the round.

7. Implement conservative AI.

   AI should always choose the highest-priority mandatory legal operation, validate support-pair requirements before zhao/ta when possible, and avoid discards that are immediately illegal. It does not need to optimize long-term hand value perfectly.

   Alternative considered: random AI with rule validation after the fact. That would create frequent circle-loss states and make the game feel broken.

## Risks / Trade-offs

- Some rule phrases are ambiguous, especially "和者摸的牌" in the chi source rule -> Implement the clear cases first: own draw may be grouped; response chi is limited to the previous player's discard; table-wide responses to discards still use priority `ta > zhao > peng > chi`.
- "Listening state" after takeover needs a concrete evaluator -> Treat listening as "one legal incoming card away from a valid eight-door win"; implement a deterministic helper and use it after each takeover grouping operation.
- Dealer slip can create a pre-play draw round -> Model it as `draw-round` with restart and next dealer, not as exhausted-deck draw.
- Determining "rules cannot form enough pairs in the future" can be complex -> Start with deterministic impossibility checks for known support-pair shortages and structurally impossible eight-door decomposition; leave deeper AI search out of scope.
- Forced chi/peng patterns such as `xxy`, `yyz`, `zzx`, `zzy` can overlap multiple legal actions -> Record all legal forced actions and require the highest-priority applicable operation; if the human declines and later chooses chi under the specified condition, trigger circle-loss.
- Eight-door decomposition can be combinatorial -> Use backtracking over counted cards and exposed groups, memoized by counts plus required support-pair obligations.
- Existing UI only has generic action buttons -> Reuse the button renderer but update labels, prompts, and result text to include `招`, `踏`, and `进圈`.

## Migration Plan

1. Update rule constants and card creation for the 8 phrases, 6 copies, and positional colors.
2. Implement opening deal helpers for alternating 23/22 card dealing, jiang-card extraction, dealer triplet checks, slip detection, takeover eligibility, and next-dealer selection.
3. Replace old meld/win evaluator functions with full action and win helper functions.
4. Extend DataBus/seat state for rule history, zhao/ta groups, support-pair obligations, takeover state, listening state, and circle-loss result data.
5. Update engine startup, draw/discard/response/application flow for slip/takeover, self-draw grouping, action priority, forced actions, discard legality, and circle-loss.
6. Update AI takeover, response, and discard logic to use the new evaluator.
7. Update table prompts and result rendering for jiang card, slip/takeover, zhao, ta, and circle-loss.
8. Replace self-check scenarios with deterministic cases for opening deal, jiang marking, slip/takeover, operation limits, deck counts, colors, action priority, forced actions, discard restrictions, zhao/ta pair support, and eight-door wins.
9. Update README rule notes.

## Open Questions

- The phrase "和者摸的牌" is interpreted as "摸到的牌", so own drawn cards can be used for chi/peng/zhao/ta; response chi remains limited to the previous player's discard unless clarified otherwise.
- The `xy` door is interpreted as two different characters from the same phrase, and the final winning hand must contain exactly one such door.
- "初始牌有 4/5 张" in discard restrictions is interpreted as the phrase-card count in hand before the discard decision.
- "听牌" after takeover is interpreted as one incoming card away from a valid eight-door win.
