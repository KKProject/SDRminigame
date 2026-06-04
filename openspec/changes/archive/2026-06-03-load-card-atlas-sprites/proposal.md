## Why

The project already includes `images/element.png`, and the provided named atlas describes usable card and UI sprites inside that image. Loading card faces from the atlas will make the Shang Da Ren cards use the supplied artwork instead of relying only on canvas text.

## What Changes

- Add the provided atlas JSON to the project assets next to `element.png`.
- Extend the asset manifest/loader to load and expose atlas metadata for `images/element.png`.
- Map Shang Da Ren card symbols by scanning atlas frames in order and using the first 24 card-labeled frames.
- Rotate horizontal card frames clockwise by 90 degrees when drawing them into vertical card bounds.
- Render card faces and card backs from atlas regions when matching frames are available.
- Preserve the existing canvas text fallback when the atlas, image, or a specific frame is missing or low-confidence.

## Capabilities

### New Capabilities

### Modified Capabilities
- `huapai-assets-audio`: Adds atlas metadata loading and sprite-based card face rendering for `images/element.png`.

## Impact

- Asset files: copy `/Users/wangyoukun/Desktop/bcfa2b6b_named_atlas.json` into the project, likely under `images/`.
- Rendering code: update `js/game/assets.js` and `js/game/renderer.js` to load atlas frames and draw cropped sprites.
- Card mapping: add a stable mapping between configured rule symbols and atlas frame names, with fallbacks for missing names.
- Validation: extend `scripts/run-huapai-checks.mjs` and self-checks so atlas loading/mapping can be verified without requiring WeChat runtime image loading.
