## Why

The current flower-card table is configured for portrait orientation, which limits visible card capacity and makes the play area feel cramped. The project also now has canonical local assets named `background.jpg` and `bgmusic.mp3`, so the game should use those defaults instead of generated UUID filenames.

## What Changes

- Configure the WeChat minigame to run in landscape orientation.
- Rework the table layout for landscape-first play so more player hand cards, discards, melds, and opponent information can be visible at once.
- Keep touch hit-testing and result/action overlays aligned with the new landscape layout.
- Use `images/background.jpg` as the default table background image.
- Use `audio/bgmusic.mp3` as the default looping background music.
- Preserve graceful fallback behavior when the background image or music file cannot load.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `huapai-table-interaction`: Update table layout requirements to prefer landscape orientation and higher visible card capacity.
- `huapai-assets-audio`: Update default asset/audio requirements to use `background.jpg` and `bgmusic.mp3`.

## Impact

- Affected files include `game.json`, `js/render.js`, `js/game/layout.js`, `js/game/renderer.js`, `js/game/assets.js`, `js/runtime/music.js`, `scripts/run-huapai-checks.mjs`, and `README.md`.
- The minigame runtime orientation changes from portrait to landscape.
- Existing canvas fallback drawing and mute behavior should continue to work.
