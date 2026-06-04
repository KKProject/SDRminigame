## Context

The game creates a WeChat canvas and currently assigns `canvas.width` and `canvas.height` to the window's logical dimensions. On high-density phone screens this produces a low-resolution backing store that the platform scales up, causing cards, text, and UI strokes to look blurry.

The layout system already operates in logical pixels, and touch hit regions are expressed in those same logical coordinates. The fix should improve drawing resolution without changing layout math or touch coordinates.

## Goals / Non-Goals

**Goals:**
- Render the canvas at high DPI using device pixel ratio.
- Keep `SCREEN_WIDTH` and `SCREEN_HEIGHT` as logical window dimensions.
- Scale the 2D context so renderer code continues to draw in logical pixels.
- Preserve existing layout, touch hit testing, and asset loading behavior.
- Avoid excessive canvas sizes on unusually high-DPI devices.

**Non-Goals:**
- Redesigning UI layout, card positions, or visual style.
- Replacing image assets with higher-resolution files.
- Changing the game loop or rules engine.
- Adding per-device art variants beyond correct canvas backing-store scaling.

## Decisions

1. Separate logical size from backing-store size.
   - Decision: Export logical `SCREEN_WIDTH`/`SCREEN_HEIGHT`, plus render pixel ratio and backing-store dimensions. Set `canvas.width = logicalWidth * renderPixelRatio` and `canvas.height = logicalHeight * renderPixelRatio`.
   - Rationale: Logical layout and touch coordinates remain stable, while the actual render target has enough pixels for sharp display.
   - Alternative considered: Multiply all layout dimensions by DPR. That would require changing every layout and hit-test path and would be much riskier.

2. Scale the drawing context once during setup.
   - Decision: After creating the 2D context, call `ctx.setTransform(renderPixelRatio, 0, 0, renderPixelRatio, 0, 0)` or equivalent setup before rendering.
   - Rationale: Renderers can keep using logical coordinates, and clearing/drawing APIs continue to match layout values.
   - Alternative considered: Manually multiply every draw call. That would be noisy and error-prone.

3. Cap render pixel ratio.
   - Decision: Use the WeChat-reported pixel ratio, but cap it at a small maximum such as `2` unless the device ratio is lower.
   - Rationale: DPR 2 usually removes visible blur while avoiding very large backing stores on high-end devices.
   - Alternative considered: Always use full DPR. That maximizes sharpness but can increase memory and GPU cost unnecessarily.

4. Centralize canvas setup helpers.
   - Decision: Keep the sizing/scaling logic in `js/render.js` and export values that tests can inspect.
   - Rationale: `Main` and renderer code should not duplicate platform sizing details.
   - Alternative considered: Configure scaling in `js/main.js`. That would split canvas lifecycle concerns across modules.

## Risks / Trade-offs

- [Higher memory use] -> Cap render pixel ratio and expose the cap for tests.
- [Double scaling after context reset] -> Apply transform in a single setup path and use `setTransform` where available.
- [Blurry assets if source art is low resolution] -> DPR scaling fixes canvas backing-store blur; source art quality still depends on atlas resolution.
- [Test environment lacks WeChat APIs] -> Keep fallback behavior compatible with existing render stubs.
