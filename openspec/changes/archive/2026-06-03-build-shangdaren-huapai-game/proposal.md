## Why

The current project is still the WeChat minigame starter shooter template, while the assets have already been replaced for a Shang Da Ren flower-card game. This change turns the template into a playable local card-table game so the project matches the new theme and can be iterated as an actual mini game.

## What Changes

- Replace the shooter loop, entities, collision logic, and score-only UI with a turn-based card game loop.
- Add Shang Da Ren flower-card deck setup, shuffling, dealing, draw/discard flow, meld actions, win detection, and round result handling inspired by Mahjong-style play.
- Add a canvas-rendered card table with player hand, opponents, discard piles, meld areas, action buttons, round prompts, and restart flow.
- Add simple local AI opponents that can draw, discard, and respond to exposed actions according to deterministic heuristics.
- Reuse the manually replaced image and audio resources where possible, with a fallback canvas rendering path for card faces and UI elements.
- Remove gameplay dependency on airplane, bullet, enemy, scrolling-background, and collision systems.

## Capabilities

### New Capabilities
- `huapai-game-rules`: Defines the Shang Da Ren flower-card deck, round phases, legal actions, win checks, scoring summary, and restart behavior.
- `huapai-table-interaction`: Defines the visible card table, player touch interactions, action prompts, responsive canvas layout, and feedback states.
- `huapai-ai-opponents`: Defines local opponent behavior for drawing, discarding, and responding to possible meld or win opportunities.
- `huapai-assets-audio`: Defines how card/table visual assets and game audio cues are loaded, mapped, and gracefully handled when unavailable.

### Modified Capabilities

None.

## Impact

- Affected files include `game.js`, `js/main.js`, `js/databus.js`, `js/render.js`, `js/runtime/gameinfo.js`, `js/runtime/music.js`, and new or reorganized modules under `js/` for card models, rule evaluation, AI, input, and table rendering.
- Existing shooter-specific modules under `js/player/`, `js/npc/`, and parts of `js/base/` may be removed or left unused after migration.
- No external runtime dependency is required for the first implementation; the game should continue to run in the WeChat minigame canvas environment.
- Assets under `images/` and `audio/` are expected to remain local project resources and should be referenced through WeChat-compatible paths.
