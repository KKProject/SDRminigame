## Why

`images/element.atlas.json` has been reorganized so card sprites are grouped by `big`, `small`, and `mini`, and card frame names now encode size, symbol key, and orientation. The asset loader should use this clearer structure directly instead of scanning flat atlas entries by label order.

## What Changes

- Update card atlas parsing to support nested `frames.big`, `frames.small`, and `frames.mini` groups.
- Resolve card sprites from frame names that encode `mini`/`small`/`big`, the card key, and orientation suffix.
- Treat `hl` frames as horizontal-left source artwork that must be rotated clockwise 90 degrees when drawn.
- Treat `hf` frames as horizontal-right source artwork that must be rotated counterclockwise 90 degrees when drawn.
- Treat `v` frames as already vertical artwork that does not need rotation.
- Select the correct atlas group for hand cards, small table cards, mini indicators, and card backs where available.
- Keep label-based fallback behavior only as a compatibility fallback when the new named frame format is absent or incomplete.

## Capabilities

### New Capabilities

### Modified Capabilities
- `huapai-assets-audio`: Card atlas frame discovery must understand nested size groups and key-based frame names instead of relying only on the first 24 label-matched flat frames.

## Impact

- Asset loading: `js/game/assets.js` must parse nested frame groups, normalize frame names, and return size-aware card sprite matches.
- Rendering: `js/game/renderer.js` must request the correct card sprite size and rotate horizontal-left frames clockwise or horizontal-right frames counterclockwise.
- Validation: `js/game/self-check.js` and `scripts/run-huapai-checks.mjs` should cover nested `big`/`small`/`mini` atlas groups, `hl`/`hf`/`v` orientation parsing, and fallback behavior.
- Assets: `images/element.atlas.json` remains the source atlas metadata and should not need manual reordering once frame names follow the new rule.
