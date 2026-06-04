## 1. Atlas Frame Parsing

- [x] 1.1 Add helpers that enumerate atlas frames from both flat `frames` objects and nested `frames.big`, `frames.small`, and `frames.mini` groups.
- [x] 1.2 Add key-name parsing for supported frame names containing size tokens, configured card keys, and `hl`, `hf`, or `v` orientation suffixes.
- [x] 1.3 Build a normalized card frame map keyed by card key and size, while preserving deterministic ordering for duplicate matches.
- [x] 1.4 Mark `hl` frame matches as clockwise-rotated, `hf` frame matches as counterclockwise-rotated, and `v` frame matches as non-rotated.
- [x] 1.5 Preserve legacy label-based first-24 frame matching as a fallback path when size-keyed matches are missing.

## 2. Sprite Lookup and Rendering

- [x] 2.1 Update `AssetLoader.getAtlasFrame` and related lookup helpers to find frames inside nested atlas groups as well as flat atlas entries.
- [x] 2.2 Update `getCardFrame` and `getCardSprite` to accept a requested size and prefer exact `big`, `small`, or `mini` matches.
- [x] 2.3 Add fallback order for missing requested sizes so available sprites for the same card key are used before canvas text fallback.
- [x] 2.4 Update renderer card drawing calls so normal hand cards request `big`, compact table/discard/meld cards request `small`, and mini card UI requests `mini` where applicable.
- [x] 2.5 Keep card back sprite lookup working with both nested and flat atlas frame locations.

## 3. Validation

- [x] 3.1 Update `js/game/self-check.js` to cover nested `big`, `small`, and `mini` atlas groups.
- [x] 3.2 Add self-check assertions for `hl` clockwise rotation, `hf` counterclockwise rotation, and `v` non-rotated sprite matches.
- [x] 3.3 Add self-check assertions that requested sprite sizes prefer exact matches and fall back when missing.
- [x] 3.4 Update `scripts/run-huapai-checks.mjs` to validate the real `images/element.atlas.json` with the new nested structure.
- [x] 3.5 Normalize real card frame keys in `images/element.atlas.json` to `big|small|mini + card key + hl|hf|v`.
- [x] 3.6 Add validation that every size group has 24 uniformly named card frames with direction suffixes matching frame orientation.
- [x] 3.7 Run `node scripts/run-huapai-checks.mjs`, bundle validation, and `openspec validate support-sized-card-atlas-frames`.
