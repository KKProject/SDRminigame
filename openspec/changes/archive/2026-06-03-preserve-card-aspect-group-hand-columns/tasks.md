## 1. Card Dimensions

- [x] 1.1 Add a shared card aspect-ratio constant based on atlas frame size `88x307`.
- [x] 1.2 Update hand-card dimension calculation to derive height from width using the atlas aspect ratio.
- [x] 1.3 Ensure fallback text cards and atlas sprite cards use the same aspect-correct bounds.

## 2. Grouped Hand Layout

- [x] 2.1 Add a visual grouping helper that groups the human hand by configured phrase order without mutating the underlying hand array.
- [x] 2.2 Lay out up to eight phrase stacks across the hand area.
- [x] 2.3 Inside each phrase stack, order character groups by phrase character order and keep identical copies adjacent.
- [x] 2.4 Use a vertical stack offset scaled from `25 * (cardHeight / 307)` so normal 22-23 card hands fit on supported landscape sizes.
- [x] 2.5 Preserve stable hit regions and selected-card highlighting for grouped/overlapped cards.
- [x] 2.6 Place phrase stacks side by side with no horizontal gaps and center the full eight-stack hand area.
- [x] 2.7 Align every non-empty phrase stack to the same bottom edge.

## 3. Surrounding UI

- [x] 3.1 Adjust action button, prompt, meld, and discard regions so they do not overlap the taller aspect-correct hand cards.
- [x] 3.2 Keep result overlay and restart button visible after the hand layout changes.

## 4. Validation

- [x] 4.1 Add self-checks for card aspect ratio tolerance in hand-card regions.
- [x] 4.2 Add self-checks that phrase stacks are ordered by configured phrase, same-phrase cards share one stack x position, and identical cards are adjacent.
- [x] 4.3 Extend layout checks across existing viewport sizes to verify no overlaps between hand cards, prompt, meld area, action buttons, discard area, and result overlay.
- [x] 4.4 Add layout checks for scaled 25px stack offset, no-gap phrase stack placement, centered full-hand placement, and bottom-aligned phrase stacks.
- [x] 4.5 Run `node scripts/run-huapai-checks.mjs` and the existing bundle/build validation.
