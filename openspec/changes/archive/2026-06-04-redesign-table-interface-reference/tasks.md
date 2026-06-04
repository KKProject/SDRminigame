## 1. Layout Structure

- [x] 1.1 Extend `js/game/layout.js` to expose named regions for top bar, table surface, center focus, four seat panels, per-seat discard zones, per-seat meld zones, prompt/result overlays, action buttons, and existing hand card hit regions.
- [x] 1.2 Anchor the four seat panels around the landscape table with bounded avatar, score/point, dealer/current-turn, and hand-count areas.
- [x] 1.3 Position per-seat discard and meld zones near their corresponding seat while keeping the four players' cards visually distinct.
- [x] 1.4 Preserve bottom-centered phrase hand stacks, small-card `88x108` aspect ratio, bottom alignment, no inter-phrase gaps, and `40 * (cardHeight / 108)` vertical stack offset.
- [x] 1.5 Add layout guards so top bar, center focus, action buttons, result overlay, seat panels, and human hand regions do not overlap on common landscape phone sizes.

## 2. Canvas Rendering

- [x] 2.1 Redraw the table background as a reference-style felt/table surface with visible rails, readable contrast, and high-DPI-safe logical coordinates.
- [x] 2.2 Render the compact top information bar with round/progress text, rule/help placeholder, audio/control button, and optional table/version/time placeholder text.
- [x] 2.3 Replace simple opponent blocks with seat panels that show avatar placeholder, score/points, dealer/current-turn indicators, and remaining hand count.
- [x] 2.4 Render per-seat discard and meld cards in their new spatial zones using mini or scaled-small atlas sprites where appropriate.
- [x] 2.5 Render the center focus area for deck count, latest discard or drawn-card focus, jiang card/phrase, and current turn feedback.
- [x] 2.6 Keep the human hand visually dominant at the bottom and preserve selected-card rendering.

## 3. Interaction And Feedback

- [x] 3.1 Update hit testing to use the new layout regions while preserving hand card selection, discard, action buttons, mute/control, and restart behavior.
- [x] 3.2 Place legal action prompts in lower-center or center table regions without covering hand card hit regions or central recent-card focus.
- [x] 3.3 Move persistent dealer, jiang, turn, deck, illegal-tap, forced-action, win, draw, scoring, and circle-loss feedback into the new top, center, or modal regions.

## 4. Validation

- [x] 4.1 Add or update automated layout checks for common landscape dimensions, region bounds, critical non-overlap, hand stack invariants, and action-button hit regions.
- [x] 4.2 Add renderer smoke coverage for the new table regions using the existing canvas/test harness.
- [x] 4.3 Run `node scripts/run-huapai-checks.mjs` and fix any regressions.
- [x] 4.4 Run `openspec validate redesign-table-interface-reference` before marking the change ready to apply.
