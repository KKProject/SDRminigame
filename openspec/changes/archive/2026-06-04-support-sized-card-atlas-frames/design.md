## Context

The current atlas loader expects card frames to be discoverable from a flat `frames` object by scanning labels until 24 distinct card symbols are found. The revised `images/element.atlas.json` groups card artwork under `frames.big`, `frames.small`, and `frames.mini`, and the frame names encode the intended render size, card key, and orientation.

The game already has separate rendering contexts for normal hand cards, smaller table/discard cards, and mini/status visuals. The loader should expose those as size-aware card sprite lookups without forcing the renderer to understand atlas internals.

## Goals / Non-Goals

**Goals:**
- Parse nested `big`, `small`, and `mini` atlas frame groups.
- Resolve card sprites by configured card key using frame names such as `big_ren_v`, `small_ren_v`, `mini_ren_hl`, or `mini_ren_hf`.
- Interpret `hl` as horizontal-left source artwork that needs clockwise 90 degree rotation at draw time.
- Interpret `hf` as horizontal-right source artwork that needs counterclockwise 90 degree rotation at draw time.
- Interpret `v` as vertical source artwork that draws without rotation.
- Preserve support for existing flat/label-based atlases as a fallback.
- Keep gameplay and hand layout behavior unchanged.

**Non-Goals:**
- Redesigning card dimensions or hand grouping layout.
- Changing the card rule key list or phrase definitions.
- Renaming the image asset path away from `images/element.png`.
- Requiring every optional size to exist for every card; missing sizes can fall back safely.

## Decisions

1. Normalize atlas frames into a size-aware lookup table.
   - Decision: Convert both nested atlas groups and compatible flat entries into a structure keyed by card key and size, for example `cardAtlasFrames.ren.big`.
   - Rationale: Rendering code can ask for a card and size without knowing whether the atlas was nested or flat.
   - Alternative considered: Search the JSON on every draw call. That is simpler initially but creates repeated parsing work and spreads naming assumptions into rendering.

2. Prefer explicit frame-name parsing over label scanning.
   - Decision: Parse names that contain a size token (`big`, `small`, `mini`), a configured card key, and an orientation token (`hl`, `hf`, or `v`) as the primary source of truth.
   - Rationale: The new JSON was reorganized specifically to make names deterministic and clearer than labels.
   - Alternative considered: Continue using labels and original order. That remains fragile when groups are reordered or labels are edited.

3. Keep label scanning as a compatibility fallback.
   - Decision: If the new key-based format cannot provide a requested sprite, fall back to the existing first-24 label-matching behavior.
   - Rationale: This protects older atlas files and partial edits while the asset pipeline is settling.
   - Alternative considered: Drop legacy support. That would make failures more obvious, but would also make the game brittle during asset iteration.

4. Let renderer choose semantic sprite sizes.
   - Decision: `drawCard` should request `big` for normal hand cards, `small` for table/discard/meld cards, and `mini` where the UI renders compact card indicators. Missing requested sizes can fall back to another available size for the same key.
   - Rationale: Atlas size selection belongs to the rendering layer's visual intent, while lookup mechanics belong to the asset loader.
   - Alternative considered: Always draw `big` sprites scaled down. That avoids missing-size handling but wastes atlas detail and ignores the new mini/small assets.

5. Use orientation suffix for rotation.
   - Decision: Frames ending in or otherwise matching `hl` are marked for clockwise rotation, frames matching `hf` are marked for counterclockwise rotation, and frames matching `v` are drawn without rotation.
   - Rationale: The atlas source distinguishes horizontal-left and horizontal-right artwork, while vertical frames need no transform.
   - Alternative considered: Infer rotation only from width and height. That works in many cases but loses the explicit meaning encoded in the new names.

## Risks / Trade-offs

- [Ambiguous frame names] -> Match only known card keys and known size/orientation tokens, and ignore unrelated UI frames.
- [Duplicate entries for one card size] -> Prefer exact key/size/orientation matches from the named groups and keep deterministic fallback order.
- [Missing small or mini sprites] -> Fall back to another available size for the same card, then to canvas text.
- [Legacy atlas regressions] -> Preserve the existing label-based fallback path and cover it with self-checks.
