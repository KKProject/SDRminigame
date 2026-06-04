## Why

The current table UI draws many panels, rails, overlays, and tinted backgrounds that cover the original background image. The desired direction is a cleaner card-placement table: keep the background visible, place cards directly in meaningful positions, and show prompts only when player decisions are needed.

## What Changes

- Remove decorative table frames, filled panels, central operation blocks, and persistent boxed seat/card areas from the normal gameplay screen.
- Keep the original background image visible as the primary visual surface.
- Place mini cards directly at each player's assigned table positions for ignored drawn/discarded cards.
- Add a big-card animation for draw or discard events, starting from the acting player and ending in front of that player.
- Render unclaimed cards on the corresponding player's right-side corner in sequence using mini sprites.
- Render claimed meld cards for chi, peng, zhao, and ta on the right side using mini sprites, grouped by phrase and arranged in columns without overlap.
- Move grouping operation choices out of the center table area into a modal popup; the only persistent operation area remains the human hand area.
- Preserve human hand layout, card selection, high-DPI rendering, and existing Shang Da Ren rule behavior.

## Capabilities

### New Capabilities

### Modified Capabilities
- `huapai-table-interaction`: The table UI must shift from panel-based rendering to background-first card placement, with mini-card placement zones, big-card movement animation, and modal action prompts.

## Impact

- Layout code: `js/game/layout.js` must expose placement-only zones for player-front animation endpoints, right-corner unclaimed cards, right-side claimed meld columns, human hand, action modal, and result overlay.
- Renderer code: `js/game/renderer.js` must stop drawing persistent filled panels/frames during normal play, render cards directly on the background, draw mini card placement groups, and render big-card transition animations.
- Game/input code: action choices must remain tappable through the modal popup while the hand remains the only persistent operation area.
- State/event tracking: renderer may need lightweight animation state derived from recent draw/discard/meld changes without changing rule outcomes.
- Validation: layout and renderer checks should verify background-first rendering, no normal-play panel fills, placement zones, modal action controls, and animation endpoint bounds.
