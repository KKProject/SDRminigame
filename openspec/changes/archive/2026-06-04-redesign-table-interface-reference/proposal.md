## Why

The current table UI is functional but sparse: player information, discards, melds, prompts, and hand cards do not yet feel like a complete four-player card table. The provided reference shows a clearer target direction with a full-table composition, anchored player panels, central deck/discard focus, and stronger visual hierarchy.

## What Changes

- Redesign the landscape table into a full-table layout inspired by the reference image.
- Add a compact top information bar for round/progress, rule/help, table id/version placeholder, and audio/control buttons.
- Replace simple opponent blocks with seat panels around the table edges, including avatar placeholder, score/point text, dealer/current-turn indicators, and remaining hand count.
- Reposition each seat's discard/meld areas around the center table so the four-player state reads spatially.
- Build a central table focus area for deck/remaining count, recent discard, jiang card/phrase, and current feedback.
- Keep the human hand as the dominant bottom element, preserving phrase stacks, selection, and legal action buttons.
- Improve the table surface styling with a reference-like felt/table area, edge rails, and readable overlays while continuing to use canvas rendering.
- Preserve high-DPI rendering and existing rule/game state behavior.

## Capabilities

### New Capabilities

### Modified Capabilities
- `huapai-table-interaction`: The table layout and rendering must be redesigned into a reference-style four-player table with anchored seat panels, central table focus, organized discard/meld zones, and a stronger top status bar.

## Impact

- Layout code: `js/game/layout.js` must expose regions for top bar, seat panels, central table/deck/discard focus, per-seat discard/meld zones, human hand, and action controls.
- Renderer code: `js/game/renderer.js` must draw the new table surface, seat panels, per-seat card zones, central focus, and top bar.
- Input code: hit testing must continue to support hand cards, action buttons, mute/restart, and any retained controls.
- Validation: layout checks should cover common landscape/portrait sizes, region bounds, non-overlap of critical controls, hand touchability, and reference-style spatial placement.
