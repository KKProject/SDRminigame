## Context

The current minigame already has a landscape canvas, high-DPI rendering, card atlas drawing, four-player state, grouped human hand layout, action buttons, prompts, and rule feedback. The table UI is still mostly utilitarian: opponents are simple blocks, discards/melds are grouped into broad areas, and the middle of the table does not yet communicate the active round as a complete four-player card table.

The reference image establishes the desired direction: a full landscape table with visual rails, compact top controls, player panels anchored around the edges, per-seat card areas placed near each player, a central deck/recent-card focus, and a large bottom hand for the local player.

## Goals / Non-Goals

**Goals:**
- Redesign the canvas layout into a reference-style four-seat table while preserving existing game rules and input behavior.
- Make player identity, dealer/current-turn state, score/points, hand count, discards, melds, deck count, jiang card, and prompts readable at a glance.
- Keep the human hand dominant at the bottom, using the existing small-card phrase stacks and selection behavior.
- Keep rendering sharp by continuing to use the existing high-DPI canvas metrics.
- Define bounded layout regions that can be validated for common landscape phone sizes.

**Non-Goals:**
- Implement online multiplayer, chat, avatar downloads, or real table id networking.
- Add new Shang Da Ren rule logic.
- Require the UI to exactly copy every decorative detail from the reference image.
- Replace the existing canvas renderer with DOM or a different rendering engine.

## Decisions

1. Use a fixed four-seat table model in layout output.

   The layout module will expose `topBar`, `tableSurface`, `centerFocus`, `seats`, `discardZones`, `meldZones`, `handCards`, `actionButtons`, `prompt`, and `result` regions. Seats will use stable ids for bottom human, left opponent, top opponent, and right opponent so renderer and touch code do not need to infer positions from arbitrary rectangles.

   Alternative considered: keep the existing opponent rectangles and add decorative drawing around them. That would be faster, but it would not give enough structure for per-seat card zones or future UI checks.

2. Keep reference styling procedural and asset-light.

   The table surface, edge rails, shadows, panels, badges, and placeholders will be drawn with canvas primitives and existing assets where available. This avoids adding a large dependency on new art while still matching the composition of the reference.

   Alternative considered: import the reference image as a static background. That would make the first pass visually close but would not scale well across devices, and text/cards would be harder to align cleanly.

3. Use compact card rendering for opponents and center zones.

   The human hand continues to use small atlas card sprites. Opponent discards/melds and central recent-card previews should use mini or scaled-small sprites according to available atlas frames, with orientation chosen by seat direction when useful. This gives more room for four-player state without hiding the bottom hand.

   Alternative considered: draw every visible card at the same size as the human hand. That would be readable but consumes too much landscape width and height once all four seats have discards and melds.

4. Keep top controls informational first.

   The top bar will show round/progress, rule/help placeholder, audio/control button, and table id/version/time placeholders if state has values. Controls remain compact and must not overlap the play area. Existing mute/restart actions remain routable through hit regions.

   Alternative considered: create a large HUD with explanatory text. That would make development state easier to see, but it would compete with the cards and is not appropriate for repeated gameplay.

5. Preserve existing rule feedback with new placement.

   Prompts, forced-action warnings, circle-loss/win/draw results, and scoring feedback keep the same content requirements. They move into center or lower-center overlay regions that fit the new table without covering legal action buttons or selected hand cards.

## Risks / Trade-offs

- Dense four-player state can overlap on smaller landscape screens. Mitigation: compute regions from screen size, use mini/scaled cards for non-human zones, clamp text, and add layout checks for common phone sizes.
- Procedural styling may feel less rich than a fully illustrated table skin. Mitigation: prioritize structure first, then add rails, shadows, gradients, and badges that are cheap to render and easy to tune.
- More layout regions increase hit-testing complexity. Mitigation: keep existing hand/action hit regions authoritative and add named regions instead of deriving touch behavior from drawing order.
- Opponent card zones may need more tuning once real play produces long discard rows. Mitigation: wrap cards inside bounded zones and cap visible card size before adding scrolling or pagination.
