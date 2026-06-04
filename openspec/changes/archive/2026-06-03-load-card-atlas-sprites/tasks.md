## 1. Asset Setup

- [x] 1.1 Copy `/Users/wangyoukun/Desktop/bcfa2b6b_named_atlas.json` into the project, preferably as `images/element.atlas.json`.
- [x] 1.2 Add atlas metadata to the asset manifest so `images/element.png` and its JSON atlas are associated.
- [x] 1.3 Add helper APIs on the asset loader to return atlas frames by name and report missing/invalid frame metadata safely.

## 2. Card Sprite Mapping

- [x] 2.1 Define a stable mapping from the 24 configured Shang Da Ren card keys to atlas frame candidates for vertical and small card rendering.
- [x] 2.2 Map hidden card backs to atlas back frames such as `tile_back_green_vertical` and retain the existing standalone card-back image fallback.
- [x] 2.3 Ensure low-confidence or missing atlas frames fall back to canvas-rendered text without affecting other cards.
- [x] 2.4 Derive card mappings from the first 24 atlas entries using each frame's `label` text.

## 3. Rendering

- [x] 3.1 Update normal card rendering to draw cropped atlas sprites from `images/element.png` when a matching vertical frame is available.
- [x] 3.2 Update tiny card rendering for meld and discard areas to prefer matching small atlas frames.
- [x] 3.3 Preserve selected-card styling and card bounds when atlas sprites are used.
- [x] 3.4 Rotate matched horizontal atlas frames clockwise by 90 degrees during rendering.

## 4. Validation

- [x] 4.1 Add self-checks for atlas JSON presence, frame lookup, and card-key-to-frame mapping.
- [x] 4.2 Extend `scripts/run-huapai-checks.mjs` to verify the copied atlas file and representative frames exist.
- [x] 4.3 Run `node scripts/run-huapai-checks.mjs` and the existing bundle/build validation.
- [x] 4.4 Add validation for first-24 label mapping and horizontal-frame rotation flags.
