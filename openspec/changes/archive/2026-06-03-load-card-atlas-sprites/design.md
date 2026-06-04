## Context

The game currently renders Shang Da Ren cards with canvas-drawn rounded rectangles and text. `images/element.png` is already in the image manifest, and the provided `/Users/wangyoukun/Desktop/bcfa2b6b_named_atlas.json` describes named sprite frames inside that image using top-left coordinates. The atlas includes large vertical tiles, small tiles, card backs, and UI panels.

## Goals / Non-Goals

**Goals:**
- Copy the atlas JSON into the project so it is packaged with the minigame.
- Load atlas metadata through the existing asset layer.
- Draw card faces and backs by cropping `images/element.png` when matching frames exist.
- Keep card text and color fallback rendering for missing atlas frames or image load failures.

**Non-Goals:**
- Replacing the background image or audio assets.
- Redesigning table layout, hand sizing, or touch behavior.
- Renaming every uncertain atlas frame; low-confidence frames can remain unused until confirmed.

## Decisions

1. Keep card identity in rule data and sprite identity in the asset layer.
   - Decision: The card model keeps using keys such as `shang`, `da`, and `ren`; the asset layer exposes a lookup from card key and preferred size to atlas frame.
   - Rationale: Rule evaluation should not depend on image filenames or atlas naming.
   - Alternative considered: Store atlas frame names on each card at deck creation. That would spread rendering concerns into card construction.

2. Derive card mapping from the first 24 card-labeled atlas frames.
   - Decision: Scan atlas frames in order, parse each frame's `label` to match the configured Shang Da Ren character, skip non-card labels, and stop after collecting 24 distinct card characters.
   - Rationale: The atlas has been curated so the first usable card labels are the intended card images, while an occasional UI or icon frame can still appear in the ordering.
   - Alternative considered: Keep explicit frame-name candidates. That is brittle when atlas names are adjusted.

3. Rotate horizontal card frames at draw time.
   - Decision: If a frame label contains `横向`, or the frame is wider than tall, draw it rotated clockwise by 90 degrees into the existing vertical card bounds.
   - Rationale: This keeps the table layout unchanged while allowing horizontal source artwork to be used as vertical cards.
   - Alternative considered: Preprocess the atlas image. That would create another generated asset and make future atlas edits harder to absorb.

4. Keep atlas loading synchronous from bundled JSON.
   - Decision: Import or require the local JSON metadata as a bundled module where supported by the current build/runtime path; expose a plain object fallback for validation.
   - Rationale: The atlas is static app data, so no async file fetch is needed during gameplay.
   - Alternative considered: Fetch JSON at runtime. That is less reliable in a WeChat minigame package and complicates startup.

## Risks / Trade-offs

- [Atlas names are partially uncertain] -> Use explicit mapping only for known names and keep text fallback for missing or low-confidence frames.
- [An early frame label does not contain a configured card character] -> Skip that frame and continue scanning until 24 distinct card labels are collected.
- [Image aspect ratio differs from layout card sizes] -> Draw cropped atlas frames into the existing card bounds while preserving the current rounded fallback if no sprite is available.
- [JSON import support varies] -> If direct JSON import is awkward for the existing bundler, implementation can convert the atlas JSON into an exported JS object while still storing the original JSON asset in the project.
- [Tiny cards may become unreadable] -> Use small atlas frames where available and retain text fallback when the sprite is too small or missing.
