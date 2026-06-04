## Context

The current table layout computes card height as `cardWidth * 1.45`, while atlas card frames are approximately `88x307`, or height about `3.49` times width. This stretches the artwork and makes the cards look unlike the source image. The current human hand is also a single horizontal row, which is hard to scan with the normal 22-23 card hand.

## Goals / Non-Goals

**Goals:**
- Preserve the card artwork aspect ratio using the atlas frame ratio `88:307`.
- Group the human player's hand into eight phrase stacks.
- Within each phrase stack, order cards by the phrase's three characters and keep identical cards adjacent.
- Keep phrase stacks touching horizontally, center the full eight-stack hand area, bottom-align non-empty stacks, and scale the vertical overlap offset from the source 25px value.
- Keep every card selectable with stable hit regions.
- Keep action buttons, prompts, meld area, discard area, and result overlay non-overlapping in landscape and portrait test sizes.

**Non-Goals:**
- Changing card game rules or sorting semantics in the deck model.
- Redesigning opponent hand layout or discard/meld rendering beyond avoiding overlap with the new hand area.
- Adding scrolling; the first implementation should fit the normal dealt hand into the available area.

## Decisions

1. Use a single canonical card aspect ratio.
   - Decision: Define `CARD_ASPECT_RATIO = 88 / 307` and derive card height from width for hand cards and atlas card rendering.
   - Rationale: The atlas source image establishes the visual proportions.
   - Alternative considered: Read each frame ratio dynamically. Horizontal frames are rotated at draw time and would complicate layout, while most vertical card frames share the same ratio.

2. Keep hand sorting visual-only.
   - Decision: Build grouped hand-card regions from the current hand array, sorted by phrase order, phrase character position, and copy id for display and hit testing, without mutating the underlying hand.
   - Rationale: The engine already relies on selected card ids, so layout can change independently from rule state.
   - Alternative considered: Re-sort the hand array whenever state changes. That risks affecting selection and AI/debug expectations.

3. Use one visual stack per phrase.
   - Decision: Allocate up to eight side-by-side stacks across the hand area. Each stack corresponds to a phrase. All cards from that phrase share the same x position, are ordered by phrase character position and copy id, and use a controlled vertical step.
   - Rationale: This matches the requested visual model: one phrase gathers into one overlapped pile, same characters stay together, and different phrases are separated by their stack positions.
   - Alternative considered: Three rows by character position across all phrases. That makes same-phrase scanning weaker.

4. Scale cards to available space.
   - Decision: Choose card width from both horizontal stack capacity and vertical hand-area capacity, then derive card height from the aspect ratio. Derive the stack step as `25 * (cardHeight / 307)` so the visual offset follows the card shrink ratio.
   - Rationale: A 23-card hand must fit on common landscape screens without hiding controls.
   - Alternative considered: Fixed pixel card size. That would work on one viewport but break on smaller devices.

5. Center no-gap phrase stacks.
   - Decision: Treat the phrase stack width as exactly one card width, place adjacent phrase stacks at `cardWidth` intervals, center the full eight-stack width in the canvas, and offset shorter stacks downward so their bottom edge matches the tallest stack.
   - Rationale: The cards look like a compact hand with empty space distributed equally on both sides instead of visible gaps between phrases, and uneven stacks rest on the same visual baseline.

## Risks / Trade-offs

- [Tall card ratio reduces space] -> Increase the hand area height and use controlled overlap in each phrase stack.
- [Small screens may make cards tiny] -> Enforce minimum readable width and preserve stable hit boxes.
- [Dense stacks can obscure cards] -> Keep cards ordered with visible scaled offsets and ensure selected state lifts/highlights the selected card.
- [UI overlap regressions] -> Extend layout self-checks to validate regions and card ratio across existing landscape/portrait viewport sizes.
