## 1. Runtime Orientation

- [x] 1.1 Update `game.json` to request landscape orientation.
- [x] 1.2 Confirm canvas sizing still uses WeChat window info after the orientation change.

## 2. Landscape Table Layout

- [x] 2.1 Update `TableLayout` to use a landscape-first layout with wider hand, discard, meld, and action regions.
- [x] 2.2 Ensure normal dealt hands show more cards at once and remain touchable on common landscape phone sizes.
- [x] 2.3 Reposition opponent panels, prompts, result overlay, mute control, and action buttons so they do not overlap the hand or discard area.
- [x] 2.4 Update renderer assumptions if any drawing code depends on portrait-era region sizes.

## 3. Default Assets And Music

- [x] 3.1 Update `ASSET_MANIFEST.images.table` to `images/background.jpg`.
- [x] 3.2 Update `ASSET_MANIFEST.audio.bgm` to `audio/bgmusic.mp3`.
- [x] 3.3 Ensure background music starts through `Music` initialization when not muted and remains safe if autoplay is blocked.
- [x] 3.4 Preserve fallback background drawing and silent audio behavior when files fail to load.

## 4. Verification And Docs

- [x] 4.1 Extend `scripts/run-huapai-checks.mjs` to validate landscape dimensions and region bounds.
- [x] 4.2 Run the self-check script and entry bundle parsing.
- [x] 4.3 Update `README.md` to mention landscape orientation and the default `background.jpg` / `bgmusic.mp3` assets.
