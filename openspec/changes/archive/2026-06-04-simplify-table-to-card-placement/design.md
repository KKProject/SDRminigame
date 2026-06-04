## Context

The current interface recently moved toward a reference-style table with top bars, seat panels, central focus panels, and shaded card zones. That made table state easier to read, but it also covered much of `images/background.jpg`. The desired direction is more minimal: the background image should be the table surface, and cards should be placed directly on top of it.

The game already has high-DPI canvas rendering, atlas card drawing for big/small/mini sprites, grouped human hand layout, action buttons, prompts, and rule-state feedback. This change keeps the rule engine intact and focuses on layout/rendering behavior.

## Goals / Non-Goals

**Goals:**
- Remove persistent normal-play panel fills, rails, framed table surfaces, and central operation blocks so the background image is visible.
- Keep layout regions as invisible placement guides for cards, hit testing, and validation.
- Render ignored drawn/discarded cards as mini cards in each player's right-side corner in sequence.
- Render claimed chi/peng/zhao/ta card groups on the right side with mini cards grouped by phrase in columns without overlap.
- Animate draw/discard events using the corresponding character's big sprite from the acting player toward that player's front placement point.
- Move legal action choices into a modal popup while keeping the hand area as the only persistent operation area.
- Preserve human hand selection, high-DPI rendering, atlas sizing, and Shang Da Ren rules.

**Non-Goals:**
- Change the rule engine's chi/peng/zhao/ta priority or scoring behavior.
- Add new art assets beyond using the existing background image and card atlas.
- Implement networked table state, real avatars, chat, or external animations.
- Require every card movement to be historically replayable after the animation finishes.

## Decisions

1. Keep layout regions but render them transparently in normal play.

   `layout.js` should still expose named regions for human hand, player-front animation endpoints, right-corner unclaimed placements, right-side claimed placement columns, modal actions, and results. These regions support hit testing and tests, but `renderer.js` must not draw their fills or borders during normal play.

   Alternative considered: remove the regions entirely and hard-code drawing positions in the renderer. That would make the renderer brittle and make non-overlap tests much harder.

2. Treat unclaimed and claimed cards as separate placement concepts.

   Unclaimed cards are cards that no one takes after a draw/discard resolution; they belong near the acting player's right-side corner and append in order using mini sprites. Claimed cards are cards involved in chi/peng/zhao/ta; they render in right-side phrase columns with the incoming card plus hand cards, using mini sprites without overlap.

   Alternative considered: keep all visible history inside the old discard/meld zones. That would preserve existing code shape but does not match the desired visual language.

3. Use renderer-local animation state derived from game state changes.

   The renderer can remember the previously rendered `recentDiscard`, `drawnCard`, or a lightweight event signature and create a short big-card animation when the visible event changes. This avoids changing rule behavior while giving visual movement.

   Alternative considered: add full animation events to the engine. That is cleaner for future replay, but it is a larger rule/state change than needed for this UI pass.

4. Use a modal for legal choices.

   Legal actions such as chi, peng, zhao, ta, hu, pass, and takeover choices should appear in a temporary popup above the hand or centered over the background. The modal may have a dimmed or translucent backdrop, but normal table regions must remain unboxed. Action hit regions move into this modal while the hand stays the only persistent operation area.

   Alternative considered: keep action buttons near the hand without a modal. That is simpler, but the user explicitly asked for a popup when grouping actions are needed.

5. Keep result overlays distinct from normal play.

   Win, draw, circle-loss, and restart summaries may remain modal because they are not normal play placement regions. They should still avoid unnecessary heavy fills where possible, but readability is more important during round-end states.

## Risks / Trade-offs

- Without visible panels, some text may be harder to read on busy areas of the background. Mitigation: keep text minimal and use lightweight shadows or small translucent modal backdrops only where needed.
- Renderer-local animation may miss some subtle rule transitions. Mitigation: start with recent draw/discard signatures and add explicit engine event data only if implementation reveals gaps.
- Right-side mini-card columns can become dense late in a round. Mitigation: define bounded placement regions, use mini sprites, wrap by phrase columns, and cap visible overflow only if required.
- Removing central status panels reduces always-visible explanations. Mitigation: show state feedback only in concise text or modal prompts when the user needs to decide.
