## Context

The current hand layout uses source dimensions `88x307`, matching the large card artwork. The atlas now provides `small` card sprites with source dimensions `88x108`, and the human hand should use those smaller proportions. The phrase-stack layout already derives card height and stack offsets from source dimensions, so this change should update the hand-specific source metrics rather than redesigning grouping.

## Goals / Non-Goals

**Goals:**
- Use `small` atlas sprites for visible human hand cards.
- Compute human hand card bounds from the small card ratio `88 / 108`.
- Scale phrase stack offsets from a source offset of `40` relative to small-card source height `108`.
- Preserve phrase grouping, no-gap centering, bottom alignment, selection, and hit testing.
- Keep table/discard/meld compact cards working with existing small sprite lookups.

**Non-Goals:**
- Changing the rules engine, hand contents, sorting, or meld logic.
- Changing the atlas frame naming scheme.
- Redesigning opponent hands, discard layout, or result overlays beyond avoiding overlap with the adjusted hand.
- Removing big or mini sprite support from the asset loader.

## Decisions

1. Introduce hand-card source metrics.
   - Decision: Define hand layout metrics from `SMALL_CARD_SOURCE_WIDTH = 88`, `SMALL_CARD_SOURCE_HEIGHT = 108`, and `HAND_STACK_SOURCE_STEP = 40`.
   - Rationale: The hand has a different visual source than the large card artwork, and explicit constants make the ratio and stack step easy to verify.
   - Alternative considered: Reuse the existing large-card constants and only request small sprites. That would stretch the small artwork and keep the hand too tall.

2. Keep layout responsive but use small-card aspect ratio.
   - Decision: Compute card width from horizontal capacity and vertical stack capacity, then derive height from the small-card aspect ratio.
   - Rationale: The existing hand grouping logic remains useful, while the new ratio lets cards fit with a more compact height.
   - Alternative considered: Fixed card dimensions. That would be brittle across landscape and portrait canvas sizes.

3. Scale stack offset from small-card source height.
   - Decision: Use `Math.round(40 * (cardHeight / 108))` for the vertical offset between cards in a phrase stack.
   - Rationale: This matches the user's requested source offset while staying proportional when the layout scales.
   - Alternative considered: Keep the old `25 * (cardHeight / 307)`. That is tied to the old large-card artwork and would make the smaller cards overlap too tightly.

4. Request small sprites for hand cards.
   - Decision: The renderer should call `drawCard(..., 'small')` for human hand regions.
   - Rationale: The asset loader already supports size-aware lookup, so the renderer can express the intended hand sprite size directly.
   - Alternative considered: Let the loader infer small size from card bounds. That would couple rendering dimensions to asset lookup and make behavior less predictable.

## Risks / Trade-offs

- [Cards may become too wide because small ratio is shorter] -> Keep width constrained by eight phrase stacks and vertical stack capacity.
- [Controls may overlap the shorter hand differently] -> Preserve layout region checks across existing viewport sizes.
- [Fallback text cards may look different] -> Use the same small-card bounds for atlas and canvas fallback rendering.
- [Sprite size mismatch] -> Add checks that hand rendering requests `small` and layout ratio matches `88x108`.
