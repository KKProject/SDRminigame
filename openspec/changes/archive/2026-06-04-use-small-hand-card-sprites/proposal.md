## Why

The human hand currently uses the large atlas card proportions, which makes the hand taller than needed and does not match the requested small-card artwork. Switching the hand to small card sprites lets more cards sit comfortably on screen while preserving the intended visual proportions.

## What Changes

- Render human hand cards with `small` atlas card sprites instead of `big` sprites.
- Compute visible hand-card bounds from the small card source ratio `88x108` instead of the large card ratio `88x307`.
- Increase phrase stack source offset from `25` to `40`, scaled by the small-card height shrink ratio.
- Keep phrase stacks grouped by phrase, horizontally touching, centered, bottom-aligned, and selectable.
- Keep compact discard/meld card rendering behavior compatible with the existing `small` sprite lookup.

## Capabilities

### New Capabilities

### Modified Capabilities
- `huapai-table-interaction`: Hand-card layout must use small-card aspect ratio and the new scaled 40px stack offset.
- `huapai-assets-audio`: Human hand card rendering must request small card sprites rather than large card sprites.

## Impact

- Layout code: `js/game/layout.js` must define small-card source dimensions and compute hand card bounds/stack offsets from them.
- Renderer code: `js/game/renderer.js` must draw human hand cards using the `small` atlas size.
- Validation: `js/game/self-check.js` and `scripts/run-huapai-checks.mjs` must assert small-card ratio, scaled 40px stack offset, and small sprite selection for hand cards.
