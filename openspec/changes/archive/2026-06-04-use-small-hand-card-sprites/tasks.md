## 1. Hand Layout Metrics

- [x] 1.1 Add explicit small hand-card source constants based on atlas frame size `88x108`.
- [x] 1.2 Update hand-card aspect-ratio calculation to derive visible hand card height from the small-card ratio.
- [x] 1.3 Update vertical stack capacity calculation to use small-card source height and source offset `40`.
- [x] 1.4 Update phrase stack step calculation to use `40 * (cardHeight / 108)`.
- [x] 1.5 Preserve no-gap phrase stack placement, centering, bottom alignment, and hit regions after the metric change.

## 2. Hand Sprite Selection

- [x] 2.1 Update human hand rendering to request `small` card sprites instead of `big` sprites.
- [x] 2.2 Keep discard, meld, and other compact table card rendering compatible with existing `small` sprite requests.
- [x] 2.3 Keep fallback text card rendering within the same small-card hand bounds.

## 3. Validation

- [x] 3.1 Update self-checks to assert human hand card ratio is based on `88x108`.
- [x] 3.2 Update self-checks to assert phrase stack step is `40 * (cardHeight / 108)` rounded to the layout pixel grid.
- [x] 3.3 Add or update checks proving hand rendering requests `small` sprites.
- [x] 3.4 Extend script checks across existing viewport sizes for ratio, stack offset, bottom alignment, no-gap centering, and control non-overlap.
- [x] 3.5 Run `node scripts/run-huapai-checks.mjs`, bundle validation, and `openspec validate use-small-hand-card-sprites`.
