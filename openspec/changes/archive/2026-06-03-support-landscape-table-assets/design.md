## Context

The archived card-game implementation currently runs with `game.json` set to portrait orientation. Its layout scales to canvas dimensions, but the player hand is still constrained by portrait-first sizing and a narrow discard/table area. The user wants a landscape game so more cards can be shown at once, and the project now includes canonical assets at `images/background.jpg` and `audio/bgmusic.mp3`.

## Goals / Non-Goals

**Goals:**

- Run the WeChat minigame in landscape orientation.
- Rebalance the canvas layout for a wide table: larger horizontal player hand capacity, wider discard area, clearer opponent zones, and action/result controls that do not collide with cards.
- Make `images/background.jpg` the default table background image.
- Make `audio/bgmusic.mp3` the default looping background music.
- Preserve fallback drawing and silent audio behavior if assets fail to load.
- Extend local checks to cover landscape dimensions.

**Non-Goals:**

- Changing the Shang Da Ren rule set or AI strategy.
- Adding new card art slicing or a complete card atlas system.
- Supporting live orientation switching during a running round.
- Replacing the existing canvas renderer with DOM or third-party UI.

## Decisions

1. Set `game.json.deviceOrientation` to `landscape`.

   This is the WeChat minigame-level signal that the game is intended to run horizontally. The layout code will still consume actual canvas dimensions, but landscape becomes the expected runtime mode.

   Alternative considered: keep portrait runtime and rotate the table manually in canvas. That would complicate touch coordinate mapping and make system-level orientation behavior inconsistent.

2. Keep layout dimension-driven, but tune it for wide screens.

   `TableLayout` should derive card sizes, hand spacing, discard width, opponent panels, prompt placement, and result overlay from the actual canvas width and height. For landscape, the hand can use more horizontal span, the discard area can be wider, and action buttons can sit above or beside the hand without covering it.

   Alternative considered: hard-code one landscape resolution. That is brittle across phones and WeChat simulator presets.

3. Treat `background.jpg` and `bgmusic.mp3` as semantic defaults in the asset manifest.

   The manifest should point `table` to `images/background.jpg` and `bgm` to `audio/bgmusic.mp3`. Event sound effects can either reuse the same file temporarily or remain optional, but background music must have its dedicated canonical path.

   Alternative considered: infer assets by scanning directories. Explicit mapping is more predictable and matches the existing manifest design.

4. Start background music through the existing music manager and respect mute state.

   The manager should load `bgmusic.mp3` as a looping track, start it at game initialization when allowed by the runtime, and stop/resume based on the mute control. Playback failure remains non-fatal because some WeChat contexts restrict autoplay.

   Alternative considered: play music directly from `Main`. Keeping playback inside `Music` preserves one responsibility boundary.

## Risks / Trade-offs

- Some devices may report dimensions after orientation setup differently than expected -> Keep layout based on measured canvas size and test multiple landscape dimensions.
- WeChat autoplay restrictions may block immediate BGM playback -> Attempt playback safely and allow the first tap/mute toggle to resume future playback.
- A wide layout can make cards too small on compact landscape screens -> Use min/max card dimensions and overlap spacing when hand count exceeds available width.
- Existing portrait self-checks may no longer reflect the intended target -> Add landscape checks while keeping at least one compact-size guard for bounds.

## Migration Plan

1. Update `game.json` orientation to landscape.
2. Update `ASSET_MANIFEST` to use `images/background.jpg` and `audio/bgmusic.mp3`.
3. Adjust `TableLayout` and renderer positioning for landscape-first use.
4. Ensure `Music` starts and mutes background music through the existing manager.
5. Update self-check dimensions and README instructions for landscape.
6. Validate with the rule/layout check script and entry bundle parsing.
