## 1. High-DPI Canvas Setup

- [x] 1.1 Add render setup helpers in `js/render.js` that compute logical width, logical height, device pixel ratio, capped render pixel ratio, and backing-store dimensions.
- [x] 1.2 Set `canvas.width` and `canvas.height` to backing-store dimensions while keeping exported `SCREEN_WIDTH` and `SCREEN_HEIGHT` as logical dimensions.
- [x] 1.3 Export the render pixel ratio and backing-store dimensions for tests and diagnostics.
- [x] 1.4 Apply the render pixel ratio to the 2D context using `setTransform` or equivalent scaling so renderer code keeps using logical coordinates.
- [x] 1.5 Keep fallback behavior safe when pixel ratio or WeChat window APIs are unavailable.

## 2. Rendering and Interaction Compatibility

- [x] 2.1 Ensure `js/main.js` uses the high-DPI-scaled context from render setup without applying duplicate scaling.
- [x] 2.2 Confirm layout construction still receives logical screen dimensions.
- [x] 2.3 Confirm existing touch hit regions continue to use logical touch coordinates.
- [x] 2.4 Preserve existing asset drawing and fallback canvas rendering paths after context scaling.

## 3. Validation

- [x] 3.1 Add unit-style checks for DPR 1, DPR 2, and high-DPR clamping behavior.
- [x] 3.2 Update `scripts/run-huapai-checks.mjs` render stub to expose high-DPI constants and verify logical dimensions remain stable.
- [x] 3.3 Add checks that canvas backing-store dimensions equal logical dimensions multiplied by render pixel ratio.
- [x] 3.4 Add checks that the context scale transform is applied exactly once.
- [x] 3.5 Run `node scripts/run-huapai-checks.mjs`, bundle validation, and `openspec validate improve-canvas-rendering-sharpness`.
