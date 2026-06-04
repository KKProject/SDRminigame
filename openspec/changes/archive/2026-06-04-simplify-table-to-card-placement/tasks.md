## 1. Layout Placement Model

- [x] 1.1 Replace visible panel-oriented layout fields with invisible placement regions for player-front animation endpoints, right-corner unclaimed mini-card queues, right-side claimed mini-card columns, modal actions, result overlay, retained controls, and human hand hit regions.
- [x] 1.2 Preserve bottom-centered human hand phrase stacks, small-card `88x108` aspect ratio, bottom alignment, no inter-phrase gaps, and `40 * (cardHeight / 108)` vertical stack offset.
- [x] 1.3 Add per-player unclaimed-card placement regions that append mini cards in order at the corresponding player's right-side corner without overlap.
- [x] 1.4 Add claimed-card placement regions that group chi, peng, zhao, and ta cards by phrase and arrange mini cards in right-side columns without overlap.
- [x] 1.5 Add modal action layout regions that do not overlap visible hand card hit regions or result overlays.

## 2. Background-First Rendering

- [x] 2.1 Remove normal-play drawing of persistent filled table surfaces, rails, shaded seat boxes, central operation panels, boxed discard zones, and boxed meld zones.
- [x] 2.2 Render the original background image as the primary visible table surface with only lightweight text or compact controls where required.
- [x] 2.3 Render unclaimed cards directly as mini sprites in each player's right-corner mini-card sequence.
- [x] 2.4 Render claimed chi, peng, zhao, and ta cards directly as mini sprites in right-side phrase columns without overlap.
- [x] 2.5 Keep result overlays readable while avoiding unnecessary normal-play panel fills.

## 3. Animation And Interaction

- [x] 3.1 Add renderer-local animation state for visible draw/discard events using big card sprites.
- [x] 3.2 Animate each visible draw/discard from the acting player's side to that player's front placement point and then fall back to permanent mini-card placement.
- [x] 3.3 Move chi, peng, zhao, ta, hu, pass, accept takeover, and decline takeover action controls into a modal popup.
- [x] 3.4 Preserve existing hand card selection, discard, mute/control, restart, and modal action hit testing.
- [x] 3.5 Ensure pending action modals remain visible and tappable while a card animation is active.

## 4. Feedback And Validation

- [x] 4.1 Move normal-play dealer, jiang, turn, deck, recent-card, illegal-tap, AI-thinking, and forced-action feedback to lightweight text/card placement or modal prompts without central operation panels.
- [x] 4.2 Update automated layout checks for invisible placement regions, mini-card queue bounds, claimed-card column bounds, modal non-overlap, and existing hand stack invariants.
- [x] 4.3 Update renderer smoke coverage to verify background-first rendering paths and absence of normal-play panel drawing.
- [x] 4.4 Add animation smoke coverage for big-card draw/discard movement endpoints.
- [x] 4.5 Run `node scripts/run-huapai-checks.mjs` and fix any regressions.
- [x] 4.6 Run `openspec validate simplify-table-to-card-placement` before applying or archiving the change.
