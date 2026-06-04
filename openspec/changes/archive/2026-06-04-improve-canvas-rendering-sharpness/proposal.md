## Why

The game currently sizes the canvas backing store to the logical window size, which makes the whole UI look low-resolution on high-density phone screens. Rendering should account for device pixel ratio so cards, text, and table UI stay sharp without changing gameplay layout.

## What Changes

- Initialize the WeChat canvas with a high-DPI backing store using the device pixel ratio.
- Keep exported screen/layout dimensions in logical pixels so existing layout and touch hit testing continue to work.
- Scale the 2D drawing context so renderer code can continue drawing in logical coordinates.
- Clamp or normalize the render pixel ratio if needed to avoid excessive memory use on very high-DPI devices.
- Add validation coverage for canvas logical size, backing-store size, render scale, and touch-coordinate stability.

## Capabilities

### New Capabilities

### Modified Capabilities
- `huapai-table-interaction`: Canvas rendering must be high-DPI aware so table UI, cards, and text render sharply on phone screens while preserving logical layout behavior.

## Impact

- Canvas setup: `js/render.js` must compute and export logical dimensions plus render pixel ratio, and size/scale the canvas accordingly.
- Main loop: `js/main.js` may need to use the scaled context from render setup and continue passing logical dimensions to layout.
- Tests: `scripts/run-huapai-checks.mjs` and self-checks should cover DPR scaling behavior without requiring a real WeChat runtime.
- Risk: Higher backing-store resolution increases memory/GPU cost, so implementation should avoid unbounded scaling.
