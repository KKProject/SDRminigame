## Why

Card sprites from `images/element.png` use an approximately `88:307` width-to-height ratio, but the current hand layout uses arbitrary card dimensions that distort the artwork. The current hand is also a flat horizontal row, making a 22-23 card Shang Da Ren hand hard to scan.

## What Changes

- Preserve the atlas card aspect ratio when computing card bounds and when drawing cropped sprite regions.
- Rework the human hand layout so cards are grouped by the eight configured phrases.
- Put each phrase in its own visual stack, with all cards from that phrase sharing one x position.
- Keep identical characters adjacent within the same phrase stack, ordered by phrase character order.
- Place phrase stacks side by side with no horizontal gap, center the full eight-stack hand area, bottom-align non-empty stacks, and use a vertical stack offset of `25 * (cardHeight / 307)`.
- Preserve card selection, hit testing, action buttons, prompt, meld area, discard area, and result overlay without overlap.
- Keep fallback text rendering readable when sprite frames are missing.

## Capabilities

### New Capabilities

### Modified Capabilities
- `huapai-table-interaction`: Changes hand layout from a flat row to phrase-grouped stacks while keeping touch targets and responsive landscape behavior.
- `huapai-assets-audio`: Requires atlas sprite drawing to preserve source card aspect ratio instead of stretching cards into arbitrary dimensions.

## Impact

- Layout code: `js/game/layout.js` must compute aspect-correct card dimensions and grouped hand-card regions.
- Renderer code: `js/game/renderer.js` must draw aspect-correct sprites/fallbacks and maintain selected-card styling.
- Validation: `scripts/run-huapai-checks.mjs` and `js/game/self-check.js` should assert card ratio, phrase stacks, scaled stack offset, centered no-gap placement, and non-overlap on common landscape sizes.
