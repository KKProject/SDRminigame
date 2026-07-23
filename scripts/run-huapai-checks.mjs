import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceDir = join(root, 'js/game');
const tempDir = join(root, '.tmp-huapai-checks');
const files = ['rules', 'cards', 'evaluator', 'layout', 'assets', 'renderer', 'self-check'];

function rewriteImports(source) {
  return source
    .replace(/from '(\.\/[^']+)'/g, "from '$1.mjs'")
    .replace(/from '\.\.\/render'/g, "from './render-stub.mjs'");
}

await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });

for (const file of files) {
  const source = await readFile(join(sourceDir, `${file}.js`), 'utf8');
  await writeFile(join(tempDir, `${file}.mjs`), rewriteImports(source));
}
await mkdir(join(tempDir, 'animation'), { recursive: true });
for (const file of ['manager', 'presets', 'targets', 'state-controller', 'controller']) {
  const source = await readFile(join(sourceDir, 'animation', `${file}.js`), 'utf8');
  await writeFile(
    join(tempDir, 'animation', `${file}.mjs`),
    rewriteImports(source).replace("from '../../vendor/tween/tween.esm'", "from '../tween.mjs'")
  );
}
await writeFile(join(tempDir, 'tween.mjs'), await readFile(join(root, 'js/vendor/tween/tween.esm.js'), 'utf8'));
await mkdir(join(tempDir, 'net'), { recursive: true });
await writeFile(join(tempDir, 'net', 'diagnostics.mjs'), [
  "export const CLIENT_DIAGNOSTIC_SESSION_ID = 'huapai-checks';",
  'export function reportClientDiagnostic() {}',
  'export function flushClientDiagnostics() {}',
].join(' '));
await writeFile(
  join(tempDir, 'render-runtime.mjs'),
  (await readFile(join(root, 'js/render.js'), 'utf8')).replace("from './net/diagnostics'", "from './net/diagnostics.mjs'")
);
await writeFile(join(tempDir, 'render-stub.mjs'), [
  'export const SCREEN_WIDTH = 375;',
  'export const SCREEN_HEIGHT = 667;',
  'export const DEVICE_PIXEL_RATIO = 2;',
  'export const RENDER_PIXEL_RATIO = 2;',
  'export const BACKING_STORE_WIDTH = 750;',
  'export const BACKING_STORE_HEIGHT = 1334;',
  'export const SAFE_AREA_INSETS = { left: 0, top: 0, right: 0, bottom: 0 };',
  'export const SAFE_AREA_BOUNDS = { x: 0, y: 0, width: 375, height: 667 };',
].join(' '));

const { runSelfChecks } = await import(pathToFileURL(join(tempDir, 'self-check.mjs')));
const {
  default: TableLayout,
  CARD_ASPECT_RATIO,
  CARD_SOURCE_HEIGHT,
  HAND_STACK_SOURCE_STEP,
} = await import(pathToFileURL(join(tempDir, 'layout.mjs')));
const { default: TableRenderer } = await import(pathToFileURL(join(tempDir, 'renderer.mjs')));
const {
  default: AssetLoader,
  ACTION_ATLAS_FRAME_CONFIG,
  APPEARANCE_OVERLAY_FRAME_CONFIG,
  ASSET_MANIFEST,
  JIANG_OVERLAY_FRAME_CONFIG,
  buildAtlasOriginalIndexMap,
  buildCardAtlasFrameMap,
} = await import(pathToFileURL(join(tempDir, 'assets.mjs')));
const { createDeck, createSeats } = await import(pathToFileURL(join(tempDir, 'cards.mjs')));
const { DEFAULT_RULES, PHASES } = await import(pathToFileURL(join(tempDir, 'rules.mjs')));
const { calculateOperationFu } = await import(pathToFileURL(join(tempDir, 'evaluator.mjs')));
const { evaluateWin } = await import(pathToFileURL(join(tempDir, 'evaluator.mjs')));
const { findAppearingCardActions, filterHighestPriority } = await import(pathToFileURL(join(tempDir, 'evaluator.mjs')));

runSelfChecks();

async function loadRenderRuntime(windowInfo, options = {}) {
  const calls = {
    setTransform: [],
    scale: [],
  };
  function createContext(id = 'ctx') {
    const context = { id };
    if (options.withoutSetTransform) {
      context.scale = (...args) => calls.scale.push([id, ...args]);
    } else {
      context.setTransform = (...args) => calls.setTransform.push([id, ...args]);
      context.scale = (...args) => calls.scale.push([id, ...args]);
    }
    return context;
  }
  let context = createContext('ctx-1');
  const canvas = {
    width: 0,
    height: 0,
    getContext(type) {
      if (type !== '2d') throw new Error('render should request a 2d context');
      return context;
    },
  };

  globalThis.GameGlobal = {};
  globalThis.wx = {
    createCanvas() {
      return canvas;
    },
    getWindowInfo() {
      return windowInfo;
    },
  };

  const url = `${pathToFileURL(join(tempDir, 'render-runtime.mjs')).href}?case=${encodeURIComponent(JSON.stringify(windowInfo))}&fallback=${Boolean(options.withoutSetTransform)}`;
  const module = await import(url);
  return {
    module,
    canvas,
    calls,
    replaceContext(id) {
      context = createContext(id);
      return context;
    },
  };
}

let renderCase = await loadRenderRuntime({ windowWidth: 200, windowHeight: 320, pixelRatio: 1 });
if (
  renderCase.module.SCREEN_WIDTH !== 320
  || renderCase.module.SCREEN_HEIGHT !== 200
  || renderCase.module.RENDER_PIXEL_RATIO !== 1
  || renderCase.canvas.width !== 320
  || renderCase.canvas.height !== 200
) {
  throw new Error('small portrait setup should normalize backing size but remain below stable layout limits');
}
if (renderCase.module.getRenderMetrics() !== null) {
  throw new Error('too-small normalized startup metrics must not create a stable interactive layout');
}
const unstableRestoreResult = renderCase.module.restoreRenderContext();
if (unstableRestoreResult.status !== 'no-stable-metrics' || renderCase.calls.setTransform.length !== 1) {
  throw new Error('foreground restore without stable landscape metrics must not reapply transient startup metrics');
}

renderCase = await loadRenderRuntime({ windowWidth: 320, windowHeight: 568, pixelRatio: 1 });
if (
  renderCase.module.SCREEN_WIDTH !== 568
  || renderCase.module.SCREEN_HEIGHT !== 320
  || renderCase.module.RENDER_PIXEL_RATIO !== 1
  || renderCase.canvas.width !== 568
  || renderCase.canvas.height !== 320
) {
  throw new Error('DPR 1 portrait startup should normalize to landscape logical size');
}
if (renderCase.calls.setTransform.length !== 1 || renderCase.calls.setTransform[0].join(',') !== 'ctx-1,1,0,0,1,0,0') {
  throw new Error('DPR 1 render setup should apply one identity transform');
}
if (
  !renderCase.module.getRenderMetrics()
  || renderCase.module.getRenderMetrics().width !== 568
  || renderCase.module.getRenderMetrics().height !== 320
) {
  throw new Error('portrait startup metrics should create a stable normalized landscape layout');
}
let metricsNotificationCount = 0;
let lastMetricsDetail = null;
renderCase.module.subscribeRenderMetrics((metrics, detail) => {
  metricsNotificationCount += 1;
  lastMetricsDetail = detail || null;
});
const recoveredLandscape = {
  windowWidth: 844,
  windowHeight: 390,
  pixelRatio: 3,
  safeArea: { left: 47, top: 0, right: 844, bottom: 369 },
};
if (renderCase.module.renderMetricsManager.consider(recoveredLandscape).status !== 'candidate') {
  throw new Error('first valid landscape read should remain a candidate');
}
if (renderCase.module.renderMetricsManager.consider(recoveredLandscape).status !== 'committed') {
  throw new Error('matching second landscape read should commit stable metrics');
}
if (
  renderCase.module.getRenderMetrics().width !== 844
  || renderCase.canvas.width !== 1688
  || metricsNotificationCount !== 1
) {
  throw new Error('stable landscape recovery should atomically update canvas and notify consumers');
}
const recoveredTransformCount = renderCase.calls.setTransform.length;
renderCase.module.renderMetricsManager.consider(recoveredLandscape);
if (renderCase.calls.setTransform.length !== recoveredTransformCount || metricsNotificationCount !== 1) {
  throw new Error('duplicate stable metrics should not reset canvas or notify consumers');
}
renderCase.canvas.width = 0;
renderCase.canvas.height = 0;
const restoreResult = renderCase.module.restoreRenderContext();
if (
  restoreResult.status !== 'restored'
  || renderCase.canvas.width !== 1688
  || renderCase.canvas.height !== 780
  || renderCase.calls.setTransform.length !== recoveredTransformCount + 1
  || metricsNotificationCount !== 1
) {
  throw new Error('foreground restore should reapply canvas/context without notifying layout consumers');
}
renderCase.module.renderMetricsManager.consider(recoveredLandscape);
if (renderCase.calls.setTransform.length !== recoveredTransformCount + 1 || metricsNotificationCount !== 1) {
  throw new Error('ordinary duplicate metrics must remain idempotent after foreground restore');
}
const transientPortrait = renderCase.module.renderMetricsManager.consider({ windowWidth: 390, windowHeight: 844, pixelRatio: 3 });
if (
  transientPortrait.status !== 'transient-orientation'
  || renderCase.module.getRenderMetrics().width !== 844
  || renderCase.calls.setTransform.length !== recoveredTransformCount + 2
) {
  throw new Error('portrait transition matching stable landscape should restore context without replacing metrics');
}
const recoveredDuplicate = renderCase.module.renderMetricsManager.consider(recoveredLandscape);
if (
  recoveredDuplicate.status !== 'recovered-duplicate'
  || renderCase.module.getRenderMetrics().width !== 844
  || renderCase.calls.setTransform.length !== recoveredTransformCount + 3
  || metricsNotificationCount !== 2
  || !lastMetricsDetail
  || lastMetricsDetail.forceLayout !== true
) {
  throw new Error('same landscape metrics after an invalid transition should force a stable layout refresh');
}
renderCase.canvas.width = 390;
renderCase.canvas.height = 844;
const repeatedRestoreResult = renderCase.module.restoreRenderContext();
if (
  repeatedRestoreResult.status !== 'restored'
  || renderCase.canvas.width !== 1688
  || renderCase.canvas.height !== 780
  || renderCase.calls.setTransform.length !== recoveredTransformCount + 4
  || metricsNotificationCount !== 2
) {
  throw new Error('foreground restore window should recover canvas/context after a delayed portrait transition');
}
const replacementContext = renderCase.replaceContext('ctx-after-share');
const replacedContextRestore = renderCase.module.restoreRenderContext();
if (
  replacedContextRestore.status !== 'restored'
  || renderCase.module.ctx !== replacementContext
  || renderCase.calls.setTransform.length !== recoveredTransformCount + 5
  || renderCase.calls.setTransform.at(-1).join(',') !== 'ctx-after-share,2,0,0,2,0,0'
  || metricsNotificationCount !== 2
) {
  throw new Error('foreground restore should reacquire a replaced 2d context after sharing');
}
const beforeShareRecoveryTransformCount = renderCase.calls.setTransform.length;
const shareRecoveryResult = renderCase.module.beginRenderMetricsRecovery(4);
if (
  shareRecoveryResult.status !== 'restored'
  || renderCase.calls.setTransform.length !== beforeShareRecoveryTransformCount + 1
  || metricsNotificationCount !== 2
) {
  throw new Error('foreground recovery should start by restoring the canonical render context only');
}
const narrowWindowWithStableScreen = {
  windowWidth: 520,
  windowHeight: 390,
  screenWidth: 844,
  screenHeight: 390,
  pixelRatio: 3,
  safeArea: { left: 47, top: 0, right: 844, bottom: 369 },
};
const narrowWindowStableScreen = renderCase.module.renderMetricsManager.consider(narrowWindowWithStableScreen);
if (
  narrowWindowStableScreen.status !== 'duplicate'
  || renderCase.module.getRenderMetrics().width !== 844
  || renderCase.module.getRenderMetrics().height !== 390
  || renderCase.canvas.width !== 1688
  || renderCase.canvas.height !== 780
  || renderCase.calls.setTransform.length !== beforeShareRecoveryTransformCount + 1
  || metricsNotificationCount !== 2
) {
  throw new Error('screen-sized canonical viewport should ignore a transiently narrow window after sharing');
}
const narrowLandscape = {
  windowWidth: 520,
  windowHeight: 390,
  pixelRatio: 3,
  safeArea: { left: 0, top: 0, right: 520, bottom: 390 },
};
const firstNarrowLandscape = renderCase.module.renderMetricsManager.consider(narrowLandscape);
const secondNarrowLandscape = renderCase.module.renderMetricsManager.consider(narrowLandscape);
if (
  firstNarrowLandscape.status !== 'transient-canonical-shrink'
  || secondNarrowLandscape.status !== 'transient-canonical-shrink'
  || renderCase.module.getRenderMetrics().width !== 844
  || renderCase.module.getRenderMetrics().height !== 390
  || renderCase.canvas.width !== 1688
  || renderCase.canvas.height !== 780
  || renderCase.calls.setTransform.length !== beforeShareRecoveryTransformCount + 3
  || metricsNotificationCount !== 2
) {
  throw new Error('canonical shrink guard should reject narrow landscape candidates and keep canonical layout metrics');
}
const recoveredAfterNarrow = renderCase.module.renderMetricsManager.consider(recoveredLandscape);
if (
  recoveredAfterNarrow.status !== 'recovered-duplicate'
  || renderCase.module.getRenderMetrics().width !== 844
  || renderCase.calls.setTransform.length !== beforeShareRecoveryTransformCount + 4
  || metricsNotificationCount !== 3
  || !lastMetricsDetail
  || lastMetricsDetail.forceLayout !== true
) {
  throw new Error('canonical metrics after a rejected narrow candidate should force one stable layout refresh');
}
const safeAreaUpdate = {
  ...recoveredLandscape,
  safeArea: { left: 59, top: 0, right: 844, bottom: 369 },
};
renderCase.module.renderMetricsManager.consider(safeAreaUpdate);
renderCase.module.renderMetricsManager.consider(safeAreaUpdate);
if (
  renderCase.module.getRenderMetrics().safeAreaInsets.left !== 59
  || metricsNotificationCount !== 4
) {
  throw new Error('confirmed safe-area changes should produce one new stable metrics notification');
}
const transposedSafeArea = {
  windowWidth: 844,
  windowHeight: 390,
  screenWidth: 844,
  screenHeight: 390,
  pixelRatio: 3,
  safeArea: { left: 0, top: 59, right: 390, bottom: 390 },
};
const firstTransposedSafeArea = renderCase.module.renderMetricsManager.consider(transposedSafeArea);
const secondTransposedSafeArea = renderCase.module.renderMetricsManager.consider(transposedSafeArea);
if (
  firstTransposedSafeArea.status !== 'duplicate'
  || secondTransposedSafeArea.status !== 'duplicate'
  || renderCase.module.getRenderMetrics().safeAreaInsets.left !== 59
  || renderCase.module.getRenderMetrics().safeAreaInsets.right !== 0
  || renderCase.module.getRenderMetrics().safeAreaInsets.top !== 0
  || renderCase.module.getRenderMetrics().safeAreaBounds.width !== 785
  || metricsNotificationCount !== 4
) {
  throw new Error('transposed portrait safe-area after sharing must not replace stable landscape safe-area metrics');
}
renderCase.module.beginRenderMetricsRecovery(1);
const rejectedBeforeResize = renderCase.module.renderMetricsManager.consider(narrowLandscape);
const realResize = {
  windowWidth: 932,
  windowHeight: 430,
  pixelRatio: 3,
  safeArea: { left: 0, top: 0, right: 932, bottom: 430 },
};
const firstRealResize = renderCase.module.renderMetricsManager.consider(realResize);
const secondRealResize = renderCase.module.renderMetricsManager.consider(realResize);
if (
  rejectedBeforeResize.status !== 'transient-canonical-shrink'
  || firstRealResize.status !== 'candidate'
  || secondRealResize.status !== 'committed'
  || renderCase.module.getRenderMetrics().width !== 932
  || renderCase.module.getRenderMetrics().height !== 430
  || renderCase.canvas.width !== 1864
  || renderCase.canvas.height !== 860
  || metricsNotificationCount !== 5
) {
  throw new Error('real landscape size changes should commit after the foreground shrink protection window ends');
}

renderCase = await loadRenderRuntime({ windowWidth: 375, windowHeight: 667, pixelRatio: 2 });
if (
  renderCase.module.SCREEN_WIDTH !== 667
  || renderCase.module.SCREEN_HEIGHT !== 375
  || renderCase.module.RENDER_PIXEL_RATIO !== 2
  || renderCase.canvas.width !== 1334
  || renderCase.canvas.height !== 750
) {
  throw new Error('DPR 2 portrait startup should normalize to high-DPI landscape backing store');
}
if (renderCase.calls.setTransform.length !== 1 || renderCase.calls.setTransform[0].join(',') !== 'ctx-1,2,0,0,2,0,0') {
  throw new Error('DPR 2 render setup should apply one scaled transform');
}

renderCase = await loadRenderRuntime({
  windowWidth: 844,
  windowHeight: 390,
  pixelRatio: 3,
  safeArea: { left: 47, top: 0, right: 844, bottom: 369, width: 797, height: 369 },
});
if (
  renderCase.module.SCREEN_WIDTH !== 844
  || renderCase.module.SCREEN_HEIGHT !== 390
  || renderCase.module.BACKING_STORE_WIDTH !== 1688
  || renderCase.module.BACKING_STORE_HEIGHT !== 780
) {
  throw new Error('safe-area render setup should keep full logical and backing canvas sizes');
}
if (
  renderCase.module.SAFE_AREA_INSETS.left !== 47
  || renderCase.module.SAFE_AREA_INSETS.right !== 0
  || renderCase.module.SAFE_AREA_INSETS.bottom !== 21
  || renderCase.module.SAFE_AREA_BOUNDS.width !== 797
  || renderCase.module.SAFE_AREA_BOUNDS.height !== 369
) {
  throw new Error('render setup should export logical safe-area insets and bounds');
}

renderCase = await loadRenderRuntime({
  windowWidth: 844,
  windowHeight: 390,
  pixelRatio: 2,
  safeArea: { left: 900, top: 0, right: 800, bottom: 390 },
});
if (
  renderCase.module.SAFE_AREA_INSETS.left !== 0
  || renderCase.module.SAFE_AREA_INSETS.right !== 0
  || renderCase.module.SAFE_AREA_BOUNDS.width !== 844
) {
  throw new Error('invalid safe-area data should fall back to the full logical canvas');
}

renderCase = await loadRenderRuntime({ windowWidth: 390, windowHeight: 844, pixelRatio: 3 });
if (
  renderCase.module.DEVICE_PIXEL_RATIO !== 3
  || renderCase.module.RENDER_PIXEL_RATIO !== 2
  || renderCase.module.SCREEN_WIDTH !== 844
  || renderCase.module.SCREEN_HEIGHT !== 390
  || renderCase.canvas.width !== 1688
  || renderCase.canvas.height !== 780
) {
  throw new Error('high-DPR portrait setup should normalize landscape size and clamp backing store scale');
}

renderCase = await loadRenderRuntime({ screenWidth: 300, screenHeight: 500 }, { withoutSetTransform: true });
if (
  renderCase.module.SCREEN_WIDTH !== 500
  || renderCase.module.SCREEN_HEIGHT !== 300
  || renderCase.module.RENDER_PIXEL_RATIO !== 1
  || renderCase.calls.scale.length !== 1
) {
  throw new Error('render setup should normalize fallback screen size when pixel ratio or setTransform are unavailable');
}

if (ASSET_MANIFEST.images.table !== 'images/background.jpg') {
  throw new Error('default table background must be images/background.jpg');
}
if (ASSET_MANIFEST.images.cardFront !== 'images/element.png') {
  throw new Error('default card atlas image must be images/element.png');
}
if (!ASSET_MANIFEST.atlases || ASSET_MANIFEST.atlases.cards.path !== 'images/element.atlas.json') {
  throw new Error('default card atlas metadata must be images/element.atlas.json');
}
if (
  !ASSET_MANIFEST.atlases.actions
  || ASSET_MANIFEST.atlases.actions.image !== 'button'
  || ASSET_MANIFEST.atlases.actions.path !== 'images/action_buttons_named_atlas.json'
) {
  throw new Error('default action atlas must use images/actions.png and action_buttons_named_atlas.json');
}
if (ASSET_MANIFEST.audio.bgm !== 'audio/bgmusic.mp3') {
  throw new Error('default background music must be audio/bgmusic.mp3');
}
await access(join(root, ASSET_MANIFEST.images.table));
await access(join(root, ASSET_MANIFEST.images.cardFront));
await access(join(root, ASSET_MANIFEST.atlases.cards.path));
await access(join(root, ASSET_MANIFEST.images.button));
await access(join(root, ASSET_MANIFEST.atlases.actions.path));
await access(join(root, ASSET_MANIFEST.audio.bgm));

const atlas = JSON.parse(await readFile(join(root, ASSET_MANIFEST.atlases.cards.path), 'utf8'));
for (const size of ['big', 'small', 'mini']) {
  if (!atlas.frames || !atlas.frames[size] || typeof atlas.frames[size] !== 'object') {
    throw new Error(`missing nested atlas frame group ${size}`);
  }
  const frameNames = Object.keys(atlas.frames[size]);
  const cardFrameNames = frameNames.filter((name) => new RegExp(`^${size}_[a-z0-9]+_(hl|hr|v)$`).test(name));
  if (cardFrameNames.length !== DEFAULT_RULES.cardSymbols.length) {
    throw new Error(`atlas ${size} group should contain 24 uniformly named card frames`);
  }
  const cardKeys = cardFrameNames.map((name) => name.match(new RegExp(`^${size}_([a-z0-9]+)_(?:hl|hr|v)$`))[1]);
  for (const symbol of DEFAULT_RULES.cardSymbols) {
    if (cardKeys.indexOf(symbol.key) < 0) {
      throw new Error(`atlas ${size} group should contain ${size}_${symbol.key}_hl/hr/v`);
    }
  }
  for (const frameName of cardFrameNames) {
    const frame = atlas.frames[size][frameName];
    const isHorizontalLeft = frameName.endsWith('_hl');
    const isHorizontalRight = frameName.endsWith('_hr');
    const isVertical = frameName.endsWith('_v');
    if ((isHorizontalLeft || isHorizontalRight) && frame.frame.w < frame.frame.h) {
      throw new Error(`atlas horizontal frame should be wider than tall: ${frameName}`);
    }
    if (isVertical && frame.frame.h < frame.frame.w) {
      throw new Error(`atlas vertical frame should be taller than wide: ${frameName}`);
    }
  }
}
const first24CardMap = buildCardAtlasFrameMap(atlas);
for (const symbol of DEFAULT_RULES.cardSymbols) {
  const bucket = first24CardMap[symbol.key];
  const sizedCount = bucket && bucket.bySize
    ? Object.values(bucket.bySize).reduce((count, matches) => count + matches.length, 0)
    : 0;
  if (!bucket || (!sizedCount && (!bucket.legacy || !bucket.legacy.length))) {
    throw new Error(`atlas should map at least one frame for ${symbol.key}`);
  }
}
if (!first24CardMap.shang.bySize.big[0].rotateCw) {
  throw new Error('horizontal shang big frame should rotate clockwise');
}
if (first24CardMap.shang.bySize.big[0].rotateCcw) {
  throw new Error('horizontal-left shang big frame should not rotate counterclockwise');
}
if (!first24CardMap.shang.bySize.mini[0].rotateCcw) {
  throw new Error('horizontal-right shang mini frame should rotate counterclockwise');
}
if (first24CardMap.fu.bySize.big[0].rotateCw) {
  throw new Error('vertical fu big frame should not rotate');
}
if (first24CardMap.shang.bySize.big[0].size !== 'big') {
  throw new Error('shang big frame should be mapped to big size');
}
if (first24CardMap.shang.bySize.small[0].size !== 'small') {
  throw new Error('shang small frame should be mapped to small size');
}
if (first24CardMap.shang.bySize.mini[0].size !== 'mini') {
  throw new Error('shang mini frame should be mapped to mini size');
}

const actionAtlas = JSON.parse(await readFile(join(root, ASSET_MANIFEST.atlases.actions.path), 'utf8'));
const actionIndexMap = buildAtlasOriginalIndexMap(actionAtlas);
const expectedActionIndexes = {
  acceptTakeover: [1, true],
  declineTakeover: [4, true],
  hu: [13, true],
  zhao: [47, true],
  ta: [36, false],
  peng: [51, true],
  chi: [27, false],
  pass: [58, false],
};
Object.entries(expectedActionIndexes).forEach(([type, [originalIndex, rotateCcw]]) => {
  if (!actionIndexMap[originalIndex]) {
    throw new Error(`action atlas should contain originalIndex ${originalIndex} for ${type}`);
  }
  const config = ACTION_ATLAS_FRAME_CONFIG[type];
  if (!config || config.originalIndex !== originalIndex || config.rotateCcw !== rotateCcw) {
    throw new Error(`action atlas config mismatch for ${type}`);
  }
});
const actionLoader = new AssetLoader({
  ...ASSET_MANIFEST,
  atlases: {
    ...ASSET_MANIFEST.atlases,
    actions: {
      ...ASSET_MANIFEST.atlases.actions,
      data: actionAtlas,
    },
  },
});
actionLoader.setAtlas('actions', actionAtlas);
actionLoader.images.button = { id: 'actions-image' };
actionLoader.status.button = 'ready';
Object.entries(expectedActionIndexes).forEach(([type, [, rotateCcw]]) => {
  const sprite = actionLoader.getActionSprite(type);
  if (!sprite || sprite.rotateCcw !== rotateCcw) {
    throw new Error(`action loader should return the configured sprite rotation for ${type}`);
  }
});
if (actionLoader.getActionSprite('restart') !== null) {
  throw new Error('unmapped action buttons should not receive an action atlas sprite');
}
const missingActionLoader = new AssetLoader({
  images: {},
  atlases: {},
  audio: {},
});
if (missingActionLoader.getActionSprite('chi') !== null) {
  throw new Error('missing action atlas should safely return no sprite');
}

const cardAtlas = JSON.parse(await readFile(join(root, ASSET_MANIFEST.atlases.cards.path), 'utf8'));
const overlayLoader = new AssetLoader({
  ...ASSET_MANIFEST,
  atlases: {
    ...ASSET_MANIFEST.atlases,
    cards: {
      ...ASSET_MANIFEST.atlases.cards,
      data: cardAtlas,
    },
  },
});
overlayLoader.setAtlas('cards', cardAtlas);
overlayLoader.images.cardFront = { id: 'card-front-image' };
overlayLoader.status.cardFront = 'ready';
if (
  APPEARANCE_OVERLAY_FRAME_CONFIG.play !== 'ui_left_play_panel_da'
  || APPEARANCE_OVERLAY_FRAME_CONFIG.move !== 'ui_left_move_panel_ban'
) {
  throw new Error('appearance overlay frame config should map play/move to the requested atlas frames');
}
if (
  !atlas.frames.icon_jiang_big
  || !atlas.frames.icon_jiang_small
  || !atlas.frames.icon_jian_mini_hr
) {
  throw new Error('cards atlas should expose big/small/mini jiang overlay frames by the requested names');
}
if (
  atlas.frames.icon_jiang_big.frame.w !== 83
  || atlas.frames.icon_jiang_big.frame.h !== 302
  || atlas.frames.icon_jiang_small.frame.w !== 87
  || atlas.frames.icon_jiang_small.frame.h !== 108
) {
  throw new Error('big/small jiang overlays should use the full atlas panel regions, not the centered small icon crops');
}
if (
  JIANG_OVERLAY_FRAME_CONFIG.big.frameName !== 'icon_jiang_big'
  || JIANG_OVERLAY_FRAME_CONFIG.small.frameName !== 'icon_jiang_small'
  || JIANG_OVERLAY_FRAME_CONFIG.mini.frameName !== 'icon_jian_mini_hr'
  || !JIANG_OVERLAY_FRAME_CONFIG.mini.rotateCcw
) {
  throw new Error('jiang overlay frame config should map sizes to requested atlas frames and rotate mini left');
}
const playOverlay = overlayLoader.getAppearanceOverlaySprite('play');
const moveOverlay = overlayLoader.getAppearanceOverlaySprite('move');
if (!playOverlay || playOverlay.name !== 'ui_left_play_panel_da') {
  throw new Error('play appearance overlay should resolve ui_left_play_panel_da from the cards atlas');
}
if (!moveOverlay || moveOverlay.name !== 'ui_left_move_panel_ban') {
  throw new Error('move appearance overlay should resolve ui_left_move_panel_ban from the cards atlas');
}
if (overlayLoader.getAppearanceOverlaySprite('unknown') !== null) {
  throw new Error('unknown appearance overlay types should safely return no sprite');
}
const missingOverlayLoader = new AssetLoader({ images: {}, atlases: {}, audio: {} });
if (missingOverlayLoader.getAppearanceOverlaySprite('play') !== null) {
  throw new Error('missing cards atlas should safely return no appearance overlay sprite');
}
const bigJiangOverlay = overlayLoader.getJiangOverlaySprite('big');
const smallJiangOverlay = overlayLoader.getJiangOverlaySprite('small');
const miniJiangOverlay = overlayLoader.getJiangOverlaySprite('mini');
if (!bigJiangOverlay || bigJiangOverlay.name !== 'icon_jiang_big') {
  throw new Error('big jiang overlay should resolve icon_jiang_big from the cards atlas');
}
if (!smallJiangOverlay || smallJiangOverlay.name !== 'icon_jiang_small') {
  throw new Error('small jiang overlay should resolve icon_jiang_small from the cards atlas');
}
if (!miniJiangOverlay || miniJiangOverlay.name !== 'icon_jian_mini_hr' || !miniJiangOverlay.rotateCcw) {
  throw new Error('mini jiang overlay should resolve icon_jian_mini_hr and rotate left');
}
if (missingOverlayLoader.getJiangOverlaySprite('big') !== null) {
  throw new Error('missing cards atlas should safely return no jiang overlay sprite');
}

const layoutSeats = createSeats(DEFAULT_RULES);
layoutSeats[0].hand = createDeck(DEFAULT_RULES).slice(0, DEFAULT_RULES.dealerHandSize);
const layoutState = {
  rules: DEFAULT_RULES,
  seats: layoutSeats,
  deck: [],
  humanSeat: 0,
  currentSeat: 0,
  dealerSeat: 0,
  jiangCard: null,
  jiangPhraseId: null,
  appearingCard: null,
  drawnCard: null,
  recentDiscard: null,
  selectedCardId: null,
  pendingActions: [],
  phase: PHASES.HUMAN_DISCARD,
  playerActions: [
    { type: 'chi', label: '吃' },
    { type: 'peng', label: '碰' },
    { type: 'zhao', label: '招' },
    { type: 'ta', label: '踏' },
  ],
};

const resultDeck = createDeck(DEFAULT_RULES);
const roundResultState = {
  ...layoutState,
  phase: PHASES.RESULT,
  result: { type: 'win', winner: 1 },
  playerActions: [],
  tableRoomId: '139240',
  tableSettings: { maxRounds: 2 },
  roundDetail: {
    round: 1,
    maxRounds: 2,
    hasNextRound: true,
    players: [0, 1, 2, 3].map((seat) => ({
      seat,
      finalHand: resultDeck.slice(seat * 18, seat * 18 + 18),
      melds: seat === 1 ? [{ type: 'peng', cards: resultDeck.slice(80, 83) }] : [],
      huCount: seat === 1 ? 21 : null,
      roundScore: seat === 1 ? 3 : -1,
    })),
    continuation: {
      requiredSeats: [0, 1],
      confirmedSeats: [1],
      confirmedCount: 1,
      requiredCount: 2,
      selfConfirmed: false,
    },
  },
};

for (const resultCase of [
  { width: 1560, height: 878, insets: null, label: 'canonical result landscape' },
  { width: 844, height: 390, insets: { left: 47, top: 0, right: 0, bottom: 21 }, label: 'narrow notched result landscape' },
  { width: 932, height: 430, insets: { left: 0, top: 8, right: 59, bottom: 24 }, label: 'right-notched result landscape' },
]) {
  const resultLayoutBuilder = new TableLayout(resultCase.width, resultCase.height, {
    safeAreaInsets: resultCase.insets,
  });
  const resultLayout = resultLayoutBuilder.build(roundResultState);
  if (!resultLayout.roundResult || resultLayout.roundResult.rows.length !== 4) {
    throw new Error(`${resultCase.label} should expose four full-screen result rows`);
  }
  if (
    resultLayout.actionButtons.length !== 1
    || resultLayout.actionButtons[0].action.type !== 'confirmNextRound'
    || resultLayout.roundResult.rows[1].seat !== 0
  ) {
    throw new Error(`${resultCase.label} should place the local player second and expose only continue`);
  }
  [
    resultLayout.roundResult.header,
    resultLayout.roundResult.panel,
    resultLayout.roundResult.footer,
    resultLayout.roundResult.button,
  ].forEach((region) => assertWithinBounds(region, resultLayout.contentBounds, `${region.type} in ${resultCase.label}`));
  resultLayout.roundResult.rows.forEach((row) => {
    if (row.height < 92 || row.cards.width <= 0 || intersects(row.cards, row.stats)) {
      throw new Error(`${resultCase.label} result cards must remain readable and separate from stats`);
    }
  });
  const panelHit = resultLayoutBuilder.hit(
    resultLayout,
    resultLayout.roundResult.panel.x + resultLayout.roundResult.panel.width / 2,
    resultLayout.roundResult.panel.y + resultLayout.roundResult.panel.height / 2
  );
  const buttonHit = resultLayoutBuilder.hit(
    resultLayout,
    resultLayout.roundResult.button.x + resultLayout.roundResult.button.width / 2,
    resultLayout.roundResult.button.y + resultLayout.roundResult.button.height / 2
  );
  if (!panelHit || panelHit.type !== 'round-result-scroll' || !buttonHit || buttonHit.type !== 'action') {
    throw new Error(`${resultCase.label} should separate vertical result scrolling from the fixed action button`);
  }
  if (resultCase.height <= 430 && resultLayout.roundResult.maxScroll <= 0) {
    throw new Error(`${resultCase.label} should vertically scroll taller player result entries`);
  }
  if (
    resultLayout.roundResult.panel.x > resultCase.width * 0.12
    || resultLayout.roundResult.panel.x + resultLayout.roundResult.panel.width < resultCase.width * 0.89
  ) {
    throw new Error(`${resultCase.label} result viewport should align with the wide blank background panel`);
  }
}

const finalRoundResultLayout = new TableLayout(844, 390).build({
  ...roundResultState,
  roundDetail: {
    ...roundResultState.roundDetail,
    round: 2,
    hasNextRound: false,
  },
});
if (
  finalRoundResultLayout.actionButtons.length !== 1
  || finalRoundResultLayout.actionButtons[0].action.type !== 'viewRecord'
) {
  throw new Error('the final round result should expose only the future record entry');
}

function takeCards(deck, keys) {
  return keys.map((key) => {
    const index = deck.findIndex((card) => card.key === key);
    if (index < 0) throw new Error(`missing card ${key} in test deck`);
    return deck.splice(index, 1)[0];
  });
}

const multiActionDeck = createDeck(DEFAULT_RULES);
const multiActionSeats = createSeats(DEFAULT_RULES);
multiActionSeats[0].hand = takeCards(multiActionDeck, [
  'shang', 'da', 'ren', 'ren', 'ren',
  'fu', 'fu',
]);
multiActionSeats[3].hand = takeCards(multiActionDeck, ['ren']);
const multiActionIncoming = multiActionSeats[3].hand[0];
const multiActions = filterHighestPriority(findAppearingCardActions({
  ...layoutState,
  seats: multiActionSeats,
  recentDiscard: { seat: 3, card: multiActionIncoming },
  drawnCard: null,
  pendingActions: [],
  playerActions: [],
}, 3, multiActionIncoming, 'discard', DEFAULT_RULES));
const multiActionTypes = multiActions.map((action) => action.type).sort().join(',');
if (multiActionTypes !== 'chi,peng,zhao') {
  throw new Error('xyzzz plus incoming z should offer zhao, peng and chi choices to the same responding player');
}

function intersects(a, b) {
  return !(
    a.x + a.width <= b.x
    || b.x + b.width <= a.x
    || a.y + a.height <= b.y
    || b.y + b.height <= a.y
  );
}

function assertInBounds(region, width, height) {
  if (
    region.x < 0
    || region.y < 0
    || region.x + region.width > width + 1
    || region.y + region.height > height + 1
  ) {
    throw new Error(`layout region out of bounds at ${width}x${height}`);
  }
}

function assertWithinBounds(region, bounds, label) {
  if (!region) throw new Error(`${label} is missing`);
  if (
    region.x < bounds.x - 1
    || region.y < bounds.y - 1
    || region.x + region.width > bounds.x + bounds.width + 1
    || region.y + region.height > bounds.y + bounds.height + 1
  ) {
    throw new Error(`${label} should stay inside safe content bounds`);
  }
}

function visibleSafeRegions(layout) {
  return layout.handCards.concat(
    layout.actionButtons,
    Object.values(layout.playerFronts || {}),
    Object.values(layout.unclaimedZones || {}),
    Object.values(layout.claimedZones || {}),
    Object.values(layout.seatStatusAreas || {}),
    Object.values(layout.seatStatusAreas || {}).flatMap((area) => [area.avatar, area.totalScore, area.roundFu]),
    [layout.muteButton, layout.centerFocus, layout.prompt, layout.result, layout.actionModal]
  ).filter((region) => region && region.width > 0 && region.height > 0);
}

for (const [width, height] of [[568, 320], [667, 375], [844, 390], [932, 430], [320, 568]]) {
  const layout = new TableLayout(width, height).build(layoutState);
  const allRegions = layout.handCards.concat(
    layout.actionButtons,
    Object.values(layout.playerFronts || {}),
    Object.values(layout.unclaimedZones || {}),
    Object.values(layout.claimedZones || {}),
    Object.values(layout.seatStatusAreas || {}),
    Object.values(layout.seatStatusAreas || {}).flatMap((area) => [area.avatar, area.totalScore, area.roundFu]),
    [layout.muteButton, layout.topBar, layout.centerFocus, layout.prompt, layout.result, layout.actionArea, layout.actionModal]
  );
  for (const region of allRegions) {
    assertInBounds(region, width, height);
  }

  for (const side of ['bottom', 'left', 'top', 'right']) {
    if (!layout.playerFronts[side] || !layout.unclaimedZones[side] || !layout.claimedZones[side]) {
      throw new Error(`placement table layout should expose ${side} front and mini-card zones at ${width}x${height}`);
    }
    if (!layout.seatStatusAreas || !layout.seatStatusAreas[side]) {
      throw new Error(`seat status area should exist for ${side} at ${width}x${height}`);
    }
    const queueCapacity = Math.floor(layout.unclaimedZones[side].width / (layout.miniCardWidth || 1));
    if (queueCapacity < 3) {
      throw new Error(`unclaimed mini-card queue should fit multiple cards at ${width}x${height}`);
    }
    const claimedCapacity = Math.floor(layout.claimedZones[side].width / (layout.miniCardWidth || 1));
    if (claimedCapacity < 3) {
      throw new Error(`claimed mini-card row should fit multiple cards at ${width}x${height}`);
    }
  }

  const discardDirections = { bottom: 'rtl', left: 'ltr', top: 'ltr', right: 'rtl' };
  const claimedDirections = { bottom: 'ltr', left: 'ltr', top: 'rtl', right: 'rtl' };
  for (const side of Object.keys(discardDirections)) {
    if (layout.unclaimedZones[side].direction !== discardDirections[side]) {
      throw new Error(`discard direction mismatch for ${side} at ${width}x${height}`);
    }
    if (layout.claimedZones[side].direction !== claimedDirections[side]) {
      throw new Error(`claimed direction mismatch for ${side} at ${width}x${height}`);
    }
  }

  if (Math.abs((layout.seatStatusAreas.top.avatar.x + layout.seatStatusAreas.top.avatar.width / 2) - (width / 2)) > 1) {
    throw new Error(`opposite avatar should be centered at top at ${width}x${height}`);
  }
  if (layout.seatStatusAreas.bottom.x > layout.safe + 1 || layout.seatStatusAreas.bottom.avatar.y < height / 2) {
    throw new Error(`self avatar should stay near lower-left corner at ${width}x${height}`);
  }
  layout.actionButtons
    .filter((button) => ACTION_ATLAS_FRAME_CONFIG[button.action.type])
    .forEach((button) => {
      const actionConfig = ACTION_ATLAS_FRAME_CONFIG[button.action.type];
      const actionFrame = actionIndexMap[actionConfig.originalIndex].frame.frame;
      const expectedRatio = actionConfig.rotateCcw
        ? actionFrame.h / actionFrame.w
        : actionFrame.w / actionFrame.h;
      if (button.height !== 50 || Math.abs((button.width / button.height) - expectedRatio) > 0.025) {
        throw new Error(`action button ${button.action.type} should use 50px height and atlas aspect ratio at ${width}x${height}`);
      }
    });

  if (layout.handCards.length) {
    const ratio = layout.handCards[0].width / layout.handCards[0].height;
    if (Math.abs(ratio - CARD_ASPECT_RATIO) > 0.015) {
      throw new Error(`hand card aspect ratio mismatch at ${width}x${height}`);
    }
    const phraseColumns = layout.handCards.map((card) => card.phraseColumn);
    for (let i = 1; i < phraseColumns.length; i++) {
      if (phraseColumns[i] < phraseColumns[i - 1]) {
        throw new Error(`hand cards should be ordered by phrase column at ${width}x${height}`);
      }
    }
    const groupedByKey = layout.handCards.reduce((groups, card) => {
      const key = `${card.phraseColumn}:${card.keyIndex}`;
      groups[key] = groups[key] || [];
      groups[key].push(card.stackIndex);
      return groups;
    }, {});
    Object.keys(groupedByKey).forEach((key) => {
      const indexes = groupedByKey[key].slice().sort((a, b) => a - b);
      indexes.forEach((value, index) => {
        if (index > 0 && value !== indexes[index - 1] + 1) {
          throw new Error(`same-key cards should be adjacent at ${width}x${height}`);
        }
      });
    });
    const expectedStackStep = Math.max(1, Math.round(HAND_STACK_SOURCE_STEP * (layout.cardHeight / CARD_SOURCE_HEIGHT)));
    if (layout.cardStep !== expectedStackStep) {
      throw new Error(`phrase stack offset should scale from small-card source at ${width}x${height}`);
    }
    const totalHandWidth = layout.cardWidth * layout.handColumns.length;
    const expectedLeft = Math.floor((width - totalHandWidth) / 2);
    for (const card of layout.handCards) {
      const expectedX = expectedLeft + card.phraseColumn * layout.cardWidth;
      if (Math.abs(card.x - expectedX) > 1) {
        throw new Error(`phrase stacks should touch and stay centered at ${width}x${height}`);
      }
    }
    const groupedByPhrase = layout.handCards.reduce((groups, card) => {
      groups[card.phraseColumn] = groups[card.phraseColumn] || [];
      groups[card.phraseColumn].push(card);
      return groups;
    }, {});
    let alignedBottom = null;
    Object.values(groupedByPhrase).forEach((cards) => {
      const sorted = cards.slice().sort((a, b) => a.stackIndex - b.stackIndex);
      for (let i = 1; i < sorted.length; i++) {
        if (Math.abs((sorted[i].y - sorted[i - 1].y) - expectedStackStep) > 1) {
          throw new Error(`same-phrase cards should stack with scaled small-card offset at ${width}x${height}`);
        }
      }
      const stackBottom = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height;
      if (alignedBottom === null) {
        alignedBottom = stackBottom;
      } else if (Math.abs(stackBottom - alignedBottom) > 1) {
        throw new Error(`phrase stacks should align to the same bottom edge at ${width}x${height}`);
      }
    });
  }

  if (width > height) {
    const protectedRegions = layout.actionButtons;
    for (let i = 0; i < protectedRegions.length; i++) {
      for (let j = i + 1; j < protectedRegions.length; j++) {
        if (intersects(protectedRegions[i], protectedRegions[j])) {
          throw new Error(`modal action regions overlap at ${width}x${height}`);
        }
      }
    }
    for (const handCard of layout.handCards) {
      for (const protectedRegion of protectedRegions) {
        if (intersects(handCard, protectedRegion)) {
          throw new Error(`landscape hand overlaps controls at ${width}x${height}`);
        }
      }
      if (layout.actionModal.visible && intersects(handCard, layout.actionModal)) {
        throw new Error(`landscape hand overlaps action modal at ${width}x${height}`);
      }
    }
    for (const handCard of layout.handCards) {
      for (const claimedZone of Object.values(layout.claimedZones)) {
        if (claimedZone.side === 'bottom' && intersects(handCard, claimedZone)) {
          throw new Error(`bottom claimed mini cards should not cover hand cards at ${width}x${height}`);
        }
      }
    }
  }
}

for (const safeCase of [
  { width: 844, height: 390, insets: { left: 47, top: 0, right: 0, bottom: 21 }, label: 'left-notch landscape' },
  { width: 844, height: 390, insets: { left: 0, top: 0, right: 47, bottom: 21 }, label: 'right-notch landscape' },
  { width: 932, height: 430, insets: { left: 59, top: 8, right: 0, bottom: 24 }, label: 'tall safe-area landscape' },
  { width: 844, height: 390, insets: null, label: 'missing safe-area landscape' },
]) {
  const layout = new TableLayout(safeCase.width, safeCase.height, {
    safeAreaInsets: safeCase.insets,
  }).build(layoutState);
  const expectedLeft = (safeCase.insets && safeCase.insets.left ? safeCase.insets.left : 0) + layout.safe;
  const expectedTop = (safeCase.insets && safeCase.insets.top ? safeCase.insets.top : 0) + layout.safe;
  const expectedRight = safeCase.width - ((safeCase.insets && safeCase.insets.right ? safeCase.insets.right : 0) + layout.safe);
  const expectedBottom = safeCase.height - ((safeCase.insets && safeCase.insets.bottom ? safeCase.insets.bottom : 0) + layout.safe);
  if (
    layout.contentBounds.x !== expectedLeft
    || layout.contentBounds.y !== expectedTop
    || layout.contentBounds.x + layout.contentBounds.width !== expectedRight
    || layout.contentBounds.y + layout.contentBounds.height !== expectedBottom
  ) {
    throw new Error(`content bounds mismatch for ${safeCase.label}`);
  }
  visibleSafeRegions(layout).forEach((region) => {
    assertWithinBounds(region, layout.contentBounds, `${region.type || 'region'} in ${safeCase.label}`);
  });
  const rendererForSafeArea = new TableRenderer({
    getImage() { return null; },
    getCardSprite() { return null; },
    getCardBackSprite() { return null; },
  });
  [0, 1, 2, 3].forEach((seat) => {
    const start = rendererForSafeArea.animationStartForSeat(seat, layout);
    const front = rendererForSafeArea.animationEndForSeat(seat, layout);
    const discard = rendererForSafeArea.discardAnimationEnd(seat, layout);
    const claimed = rendererForSafeArea.claimedAnimationEnd(seat, layout);
    const size = rendererForSafeArea.animationCardSize(layout);
    [start, front, discard, claimed].forEach((point) => {
      assertWithinBounds(
        { x: point.x, y: point.y, width: size.width, height: size.height, type: 'animation-card' },
        layout.contentBounds,
        `animation endpoint seat ${seat} in ${safeCase.label}`
      );
    });
  });
}

const splitDeck = createDeck(DEFAULT_RULES);
const splitSeats = createSeats(DEFAULT_RULES);
splitSeats[0].hand = takeCards(splitDeck, [
  'shang', 'shang', 'shang', 'shang',
  'da', 'da', 'da',
  'ren', 'ren', 'ren',
  'kong', 'yi',
  'fu',
]);
let splitLayout = new TableLayout(844, 390).build({
  ...layoutState,
  seats: splitSeats,
  playerActions: [],
});
if (splitLayout.handColumns.length !== 4) {
  throw new Error('hand split should create adjacent split, remainder, partial phrase and singles columns');
}
if (splitLayout.handColumns[0].cards.length !== 4 || splitLayout.handColumns[0].groups[0].key !== 'shang') {
  throw new Error('hand split should move the most frequent word into its own first adjacent column');
}
if (splitLayout.handColumns[1].cards.length !== 6 || splitLayout.handColumns[1].groups.map((group) => group.key).join(',') !== 'da,ren') {
  throw new Error('hand split should keep the <=6 remaining words in one phrase column');
}
if (!splitLayout.handColumns[3].singleCollection || splitLayout.handColumns[3].cards[0].key !== 'fu') {
  throw new Error('single-word phrase groups should be collected into the last hand column');
}
if (!splitLayout.handColumns.every((column) => column.cards.length <= 6)) {
  throw new Error('every hand column should contain at most six cards');
}

const pairSingletonDeck = createDeck(DEFAULT_RULES);
const pairSingletonSeats = createSeats(DEFAULT_RULES);
pairSingletonSeats[0].hand = takeCards(pairSingletonDeck, [
  'kong', 'kong',
  'fu',
]);
const pairSingletonLayout = new TableLayout(844, 390).build({
  ...layoutState,
  seats: pairSingletonSeats,
  playerActions: [],
});
const singletonColumn = pairSingletonLayout.handColumns.find((column) => column.singleCollection);
if (!singletonColumn || singletonColumn.cards.map((card) => card.key).join(',') !== 'fu') {
  throw new Error('initial singleton column should contain only true single cards');
}
if (!pairSingletonLayout.handColumns.find((column) => !column.singleCollection && column.cards.length === 2 && column.cards.every((card) => card.key === 'kong'))) {
  throw new Error('initial singleton column should not mix pairs into the final single-card column');
}

const stableDiscardDeck = createDeck(DEFAULT_RULES);
const stableDiscardSeats = createSeats(DEFAULT_RULES);
stableDiscardSeats[0].hand = takeCards(stableDiscardDeck, [
  'shang', 'shang',
  'kong',
]);
const stableDiscardLayoutBuilder = new TableLayout(844, 390);
let stableLayout = stableDiscardLayoutBuilder.build({
  ...layoutState,
  seats: stableDiscardSeats,
  playerActions: [],
});
if (stableLayout.handColumns[0].cards.length !== 2 || stableLayout.handColumns[0].cards[0].key !== 'shang') {
  throw new Error('stable discard setup should begin with a shang pair column');
}
stableDiscardSeats[0].hand = stableDiscardSeats[0].hand.filter((card) => !(card.key === 'shang' && card.copy === 0));
stableLayout = stableDiscardLayoutBuilder.build({
  ...layoutState,
  seats: stableDiscardSeats,
  playerActions: [],
});
if (
  stableLayout.handColumns[0].singleCollection
  || stableLayout.handColumns[0].cards.length !== 1
  || stableLayout.handColumns[0].cards[0].key !== 'shang'
) {
  throw new Error('discard should keep a non-empty original hand column even when one card remains');
}

const stableMeldDeck = createDeck(DEFAULT_RULES);
const stableMeldSeats = createSeats(DEFAULT_RULES);
stableMeldSeats[0].hand = takeCards(stableMeldDeck, [
  'shang', 'shang',
  'da',
  'ren',
  'kong',
]);
const stableMeldLayoutBuilder = new TableLayout(844, 390);
stableLayout = stableMeldLayoutBuilder.build({
  ...layoutState,
  seats: stableMeldSeats,
  playerActions: [],
});
if (stableLayout.handColumns[0].cards.map((card) => card.key).join(',') !== 'shang,shang,da,ren') {
  throw new Error('stable meld setup should begin with a same-phrase column');
}
stableMeldSeats[0].hand = stableMeldSeats[0].hand.filter((card) => (
  card.key === 'shang' && card.copy === 1
) || card.key === 'kong');
stableLayout = stableMeldLayoutBuilder.build({
  ...layoutState,
  seats: stableMeldSeats,
  playerActions: [],
});
if (
  stableLayout.handColumns[0].singleCollection
  || stableLayout.handColumns[0].cards.length !== 1
  || stableLayout.handColumns[0].cards[0].key !== 'shang'
) {
  throw new Error('meld should keep a non-empty original hand column even when one card remains');
}

const emptyCollapseDeck = createDeck(DEFAULT_RULES);
const emptyCollapseSeats = createSeats(DEFAULT_RULES);
emptyCollapseSeats[0].hand = takeCards(emptyCollapseDeck, [
  'shang', 'shang',
  'kong', 'kong',
  'fu',
]);
const emptyCollapseLayoutBuilder = new TableLayout(844, 390);
stableLayout = emptyCollapseLayoutBuilder.build({
  ...layoutState,
  seats: emptyCollapseSeats,
  playerActions: [],
});
if (stableLayout.handColumns.map((column) => column.cards[0].key).join(',') !== 'shang,kong,fu') {
  throw new Error('empty collapse setup should begin with adjacent pair and singleton columns');
}
emptyCollapseSeats[0].hand = emptyCollapseSeats[0].hand.filter((card) => card.key !== 'shang');
stableLayout = emptyCollapseLayoutBuilder.build({
  ...layoutState,
  seats: emptyCollapseSeats,
  playerActions: [],
});
if (stableLayout.handColumns.map((column) => column.cards[0].key).join(',') !== 'kong,fu') {
  throw new Error('empty hand columns should collapse while preserving remaining column order');
}

const collapsedDeck = createDeck(DEFAULT_RULES);
const collapsedSeats = createSeats(DEFAULT_RULES);
collapsedSeats[0].hand = takeCards(collapsedDeck, [
  'da', 'da', 'da',
  'ren', 'ren', 'ren',
  'kong', 'yi',
  'fu',
]);
splitLayout = new TableLayout(844, 390).build({
  ...layoutState,
  seats: collapsedSeats,
  playerActions: [],
});
const columnIndexes = splitLayout.handColumns.map((_, index) => index);
if (columnIndexes.join(',') !== '0,1,2' || splitLayout.handCards.some((card) => card.key === 'shang')) {
  throw new Error('empty split columns should collapse while preserving remaining order');
}

const fixedSizeDeck = createDeck(DEFAULT_RULES);
const fixedSizeSeats = createSeats(DEFAULT_RULES);
fixedSizeSeats[0].hand = takeCards(fixedSizeDeck, [
  'shang', 'da', 'ren',
  'kong', 'yi', 'ji',
  'hua', 'san', 'qian',
  'qi', 'shi', 'tu',
  'er', 'xiao', 'sheng',
  'fu', 'lu', 'shou',
  'jia', 'zuo', 'ren2',
  'ba', 'jiu',
]);
const fixedSizeLayoutBuilder = new TableLayout(844, 390);
const fullHandLayout = fixedSizeLayoutBuilder.build({
  ...layoutState,
  seats: fixedSizeSeats,
  playerActions: [],
});
fixedSizeSeats[0].hand = fixedSizeSeats[0].hand.slice(0, 3);
const shortHandLayout = fixedSizeLayoutBuilder.build({
  ...layoutState,
  seats: fixedSizeSeats,
  playerActions: [],
});
if (shortHandLayout.cardWidth > fullHandLayout.cardWidth || shortHandLayout.cardHeight > fullHandLayout.cardHeight) {
  throw new Error('hand cards should not grow larger when fewer hand columns remain');
}
if (Math.abs(shortHandLayout.cardStep - Math.round(shortHandLayout.cardHeight * 0.5)) > 1) {
  throw new Error('hand phrase stack offset should be 50 percent of card height');
}

const fuDeck = createDeck(DEFAULT_RULES);
const operationFu = calculateOperationFu([
  { type: 'chi', label: '吃', cards: takeCards(fuDeck, ['shang', 'da', 'ren']) },
  { type: 'peng', label: '碰', key: 'da', cards: takeCards(fuDeck, ['da', 'da', 'da']) },
  { type: 'zhao', label: '招', key: 'shang', cards: takeCards(fuDeck, ['shang', 'shang', 'shang', 'shang']) },
], DEFAULT_RULES, { jiangPhraseId: 'sdr' });
if (operationFu.totalFu !== 60 || operationFu.entries.find((entry) => entry.type === 'chi').fu !== 4) {
  throw new Error('operation fu should include jiang chi=4 and color/jiang scores for peng and natural zhao');
}
if (calculateOperationFu(createSeats(DEFAULT_RULES)[0].melds, DEFAULT_RULES).totalFu !== 0) {
  throw new Error('new round operation fu should derive as zero from empty exposed melds');
}
const userWinDeck = createDeck(DEFAULT_RULES);
const userWinCards = takeCards(userWinDeck, [
  'qi', 'shi', 'tu',
  'ba', 'jiu', 'zi',
  'da', 'da', 'da',
  'kong', 'yi', 'ji',
  'hua', 'qian',
  'sheng', 'sheng', 'sheng', 'sheng',
  'fu', 'lu', 'shou',
  'ren2', 'ren2',
]);
const userWin = evaluateWin(userWinCards, [], 'discard', DEFAULT_RULES);
if (
  !userWin.isWin
  || userWin.doors.filter((door) => door.type === 'xy').length !== 1
  || !userWin.doors.find((door) => door.type === 'xy' && door.keys.join(',') === 'hua,qian')
  || !userWin.doors.find((door) => door.type === 'same' && door.key === 'sheng' && door.keys.length === 4)
  || !userWin.doors.find((door) => door.type === 'xx' && door.key === 'ren2')
) {
  throw new Error('win evaluation should accept non-adjacent same-phrase xy doors such as hua+qian with a support pair');
}

function createFakeRenderContext() {
  const calls = [];
  return {
    calls,
    clearRect: (...args) => calls.push(['clearRect', args]),
    fillRect: (...args) => calls.push(['fillRect', args]),
    drawImage: (...args) => calls.push(['drawImage', args]),
    beginPath: () => calls.push(['beginPath']),
    rect: (...args) => calls.push(['rect', args]),
    clip: () => calls.push(['clip']),
    moveTo: (...args) => calls.push(['moveTo', args]),
    lineTo: (...args) => calls.push(['lineTo', args]),
    quadraticCurveTo: (...args) => calls.push(['quadraticCurveTo', args]),
    closePath: () => calls.push(['closePath']),
    fill: () => calls.push(['fill']),
    stroke: () => calls.push(['stroke']),
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    translate: (...args) => calls.push(['translate', args]),
    scale: (...args) => calls.push(['scale', args]),
    rotate: (...args) => calls.push(['rotate', args]),
    fillText: (...args) => calls.push(['fillText', args]),
    strokeText: (...args) => calls.push(['strokeText', args]),
    measureText: (text) => ({ width: String(text || '').length * 7 }),
    createLinearGradient: (...args) => {
      calls.push(['createLinearGradient', args]);
      return {
        addColorStop() {},
      };
    },
  };
}

const renderSeats = createSeats(DEFAULT_RULES);
const renderDeck = createDeck(DEFAULT_RULES);
renderSeats[0].hand = renderDeck.slice(0, DEFAULT_RULES.dealerHandSize);
renderSeats[1].discards = renderDeck.slice(24, 29);
renderSeats[2].discards = renderDeck.slice(29, 34);
renderSeats[3].discards = renderDeck.slice(34, 39);
renderSeats[0].melds = [{ label: '吃', cards: renderDeck.slice(39, 42) }];
const renderer = new TableRenderer({
  getImage(name) { return name === 'table' ? { id: 'table-image' } : null; },
  getCardSprite() { return null; },
  getCardBackSprite() { return null; },
});
const directionRenderer = new TableRenderer({
  getImage() { return null; },
  getCardSprite() { return null; },
  getCardBackSprite() { return null; },
});
let miniPositions = [];
directionRenderer.drawCard = (ctx, card, x, y, cardWidth, cardHeight, front, selected, size) => {
  miniPositions.push({ x, cardWidth, size });
};
directionRenderer.drawMiniSequence({}, { x: 10, y: 5, width: 48, height: 20, direction: 'rtl' }, renderDeck.slice(0, 3), { miniCardWidth: 16, miniCardHeight: 20 });
if (miniPositions.map((item) => item.x).join(',') !== '42,26,10') {
  throw new Error('rtl mini-card rendering should place cards right-to-left with no gap');
}
miniPositions = [];
directionRenderer.drawMiniSequence({}, { x: 10, y: 5, width: 48, height: 20, direction: 'ltr' }, renderDeck.slice(0, 3), { miniCardWidth: 16, miniCardHeight: 20 });
if (miniPositions.map((item) => item.x).join(',') !== '10,26,42') {
  throw new Error('ltr mini-card rendering should place cards left-to-right with no gap');
}
miniPositions = [];
directionRenderer.drawCard = (ctx, card, x, y, cardWidth, cardHeight, front, selected, size) => {
  miniPositions.push({ x, y, size });
};
directionRenderer.drawClaimedColumns(
  {},
  { x: 100, y: 20, width: 48, height: 120, direction: 'rtl' },
  [{ cards: renderDeck.slice(0, 3) }, { cards: renderDeck.slice(3, 6) }],
  { miniCardWidth: 16, miniCardHeight: 20 }
);
if (miniPositions.map((item) => `${item.x}:${item.y}`).join(',') !== '132:20,132:40,132:60,116:20,116:40,116:60') {
  throw new Error('claimed melds should render each meld as one right-to-left vertical column with no gap');
}
miniPositions = [];
directionRenderer.drawClaimedColumns(
  {},
  { x: 100, y: 20, width: 48, height: 120, direction: 'ltr' },
  [{ cards: renderDeck.slice(0, 3) }, { cards: renderDeck.slice(3, 6) }],
  { miniCardWidth: 16, miniCardHeight: 20 }
);
if (miniPositions.map((item) => `${item.x}:${item.y}`).join(',') !== '100:20,100:40,100:60,116:20,116:40,116:60') {
  throw new Error('claimed melds should render each meld as one left-to-right vertical column with no gap');
}
miniPositions = [];
directionRenderer.drawRoundResultCards(
  {
    fillText() {},
    set fillStyle(value) {},
    set font(value) {},
    set textAlign(value) {},
  },
  { finalHand: renderDeck.slice(0, 12), melds: [] },
  { x: 20, y: 10, width: 320, height: 96 }
);
const resultColumnXs = new Set(miniPositions.map((item) => item.x));
if (
  resultColumnXs.size >= miniPositions.length
  || !miniPositions.some((item, index) => (
    index > 0
    && item.x === miniPositions[index - 1].x
    && item.y > miniPositions[index - 1].y
    && item.size === 'mini'
  ))
) {
  throw new Error('round result cards should use vertically stacked mini-card columns');
}
directionRenderer.roundResultScrollMax = 140;
directionRenderer.roundResultScrollOffset = 0;
if (
  !directionRenderer.scrollRoundResultBy(-50)
  || directionRenderer.roundResultScrollOffset !== 50
  || !directionRenderer.scrollRoundResultBy(-500)
  || directionRenderer.roundResultScrollOffset !== 140
  || !directionRenderer.scrollRoundResultBy(500)
  || directionRenderer.roundResultScrollOffset !== 0
) {
  throw new Error('round result vertical scrolling should move and clamp the shared player list');
}

function makeSprite(name, imageId = name, width = 10, height = 20) {
  return {
    image: { id: imageId },
    name,
    frame: { frame: { x: 1, y: 2, w: width, h: height } },
  };
}

const overlayCalls = [];
const overlayRenderer = new TableRenderer({
  getImage() { return null; },
  getCardSprite(card) { return makeSprite(`base:${card.key}`, `base:${card.key}`, 88, 307); },
  getCardBackSprite() { return null; },
  getAppearanceOverlaySprite(type) {
    overlayCalls.push(type);
    if (type === 'play') return makeSprite('ui_left_play_panel_da', 'overlay:play', 123, 343);
    if (type === 'move') return makeSprite('ui_left_move_panel_ban', 'overlay:move', 117, 337);
    return null;
  },
});
overlayRenderer.animationManager = {
  getVisualState() {
    return [
      { kind: 'card', card: { id: 'overlay-discard', key: 'da' }, stage: 'discard', x: 10, y: 20, scale: 1, alpha: 1 },
      { kind: 'card', card: { id: 'overlay-draw', key: 'ren' }, stage: 'draw', x: 80, y: 20, scale: 1, alpha: 1 },
      { kind: 'card', card: { id: 'overlay-meld', key: 'shang' }, stage: 'peng', x: 150, y: 20, scale: 1, alpha: 1 },
    ];
  },
};
overlayRenderer.drawManagedAnimations(createFakeRenderContext(), {
  height: 390,
  cardWidth: 42,
});
if (overlayCalls.join(',') !== 'play,move') {
  throw new Error('managed draw/discard appearance cards should request play/move overlays, while meld cards should not');
}
function assertOverlayDrawBounds(overlayType, imageId, expectedWidth, expectedHeight) {
  const ctx = createFakeRenderContext();
  overlayCalls.length = 0;
  overlayRenderer.drawCard(
    ctx,
    { id: `sizing-${overlayType}`, key: 'da' },
    10,
    20,
    88,
    307,
    true,
    false,
    'big',
    { appearanceOverlay: overlayType, border: false }
  );
  const overlayDraw = ctx.calls.find((call) => call[0] === 'drawImage' && call[1][0] && call[1][0].id === imageId);
  if (!overlayDraw) throw new Error(`${overlayType} appearance overlay should draw its atlas image`);
  const [, , , , , dx, dy, dw, dh] = overlayDraw[1];
  if (
    Math.abs(dw - expectedWidth) > 0.001
    || Math.abs(dh - expectedHeight) > 0.001
    || Math.abs(dx - (10 + (88 - expectedWidth) / 2)) > 0.001
    || Math.abs(dy - (20 + (307 - expectedHeight) / 2)) > 0.001
  ) {
    throw new Error(`${overlayType} appearance overlay should keep its atlas source-size ratio against the card face`);
  }
  if (ctx.calls.some((call) => call[0] === 'stroke')) {
    throw new Error(`${overlayType} appearance card should not draw the default card border`);
  }
}
assertOverlayDrawBounds('play', 'overlay:play', 123, 343);
assertOverlayDrawBounds('move', 'overlay:move', 117, 337);

const discardResolutionLayout = new TableLayout(667, 375).build(layoutState);
const animationSize = directionRenderer.animationCardSize(discardResolutionLayout);
if (Math.abs((animationSize.width / animationSize.height) - (88 / 307)) > 0.01) {
  throw new Error('big-card animation should preserve the big atlas card ratio');
}
if (!directionRenderer.shouldHoldRecentDiscard({
  ...layoutState,
  recentDiscard: { seat: 1, card: renderDeck[24] },
  pendingActions: [{ type: 'chi', seat: 0 }],
  playerActions: [],
}, 1)) {
  throw new Error('recent discard should remain at the player front while responses are pending');
}
const pendingDiscardCard = renderDeck[24];
const pendingDiscardState = {
  ...layoutState,
  seats: createSeats(DEFAULT_RULES),
  recentDiscard: { seat: 1, card: pendingDiscardCard },
  pendingActions: [{ type: 'chi', seat: 0 }],
  playerActions: [{ type: 'chi', seat: 0 }, { type: 'pass', seat: 0 }],
  phase: PHASES.HUMAN_RESPONSE,
};
pendingDiscardState.seats[1].discards = [pendingDiscardCard];
const pendingDiscardRenderer = new TableRenderer({
  getImage() { return null; },
  getCardSprite() { return null; },
  getCardBackSprite() { return null; },
});
pendingDiscardRenderer.stateAnimationController.observe(pendingDiscardState, discardResolutionLayout);
if (!pendingDiscardRenderer.managedCardVisual(pendingDiscardCard.id)) {
  throw new Error('pending human response should hold the discard at the player front');
}
if (!pendingDiscardRenderer.shouldHideDiscardMini(pendingDiscardState, 1)) {
  throw new Error('pending human response should not duplicate the discard in the discard mini area');
}
let fallbackDraws = [];
const fallbackRenderer = new TableRenderer({
  getImage() { return null; },
  getCardSprite() { return null; },
  getCardBackSprite() { return null; },
  getAppearanceOverlaySprite() { return null; },
});
fallbackRenderer.drawCard = (ctx, card, x, y, cardWidth, cardHeight, front, selected, size, options = {}) => {
  fallbackDraws.push({ card, x, y, size, options });
};
fallbackRenderer.drawHeldDiscardFallback({}, pendingDiscardState, discardResolutionLayout);
if (fallbackDraws.length !== 1 || fallbackDraws[0].card.id !== pendingDiscardCard.id || fallbackDraws[0].size !== 'big') {
  throw new Error('pending human response should draw a fallback big discard if animation state is momentarily absent');
}
if (fallbackDraws[0].options.appearanceOverlay !== 'play') {
  throw new Error('pending discard fallback should request the play appearance overlay');
}
const pendingDrawCard = renderDeck[30];
fallbackRenderer.drawHeldDrawFallback({}, {
  ...layoutState,
  currentSeat: 2,
  drawnCard: pendingDrawCard,
  appearingCard: { card: pendingDrawCard, source: 'draw', sourceSeat: 2 },
  pendingActions: [],
  playerActions: [{ type: 'peng', seat: 0, card: pendingDrawCard }],
  phase: PHASES.HUMAN_RESPONSE,
}, discardResolutionLayout);
if (
  fallbackDraws.length !== 2
  || fallbackDraws[1].card.id !== pendingDrawCard.id
  || fallbackDraws[1].options.appearanceOverlay !== 'move'
) {
  throw new Error('pending draw fallback should request the move appearance overlay');
}
overlayCalls.length = 0;
overlayRenderer.drawCard(
  createFakeRenderContext(),
  { id: 'plain-card', key: 'da' },
  0,
  0,
  40,
  140,
  true,
  false,
  'small'
);
if (overlayCalls.length !== 0) {
  throw new Error('plain card rendering should not request an appearance overlay');
}
const jiangOverlayCalls = [];
const jiangRenderer = new TableRenderer({
  getImage() { return null; },
  getCardSprite(card, size) {
    if (size === 'small') return makeSprite(`base:${size}:${card.key}`, `base:${size}:${card.key}`, 88, 108);
    if (size === 'mini') return makeSprite(`base:${size}:${card.key}`, `base:${size}:${card.key}`, 38, 42);
    return makeSprite(`base:${size}:${card.key}`, `base:${size}:${card.key}`, 88, 307);
  },
  getCardBackSprite() { return makeSprite('card-back', 'card-back', 88, 108); },
  getAppearanceOverlaySprite(type) {
    if (type === 'play') return makeSprite('ui_left_play_panel_da', 'overlay:play', 123, 343);
    return null;
  },
  getJiangOverlaySprite(size) {
    jiangOverlayCalls.push(size);
    if (size === 'big') return makeSprite('icon_jiang_big', 'jiang:big', 83, 302);
    if (size === 'small') return makeSprite('icon_jiang_small', 'jiang:small', 87, 108);
    if (size === 'mini') {
      const sprite = makeSprite('icon_jian_mini_hr', 'jiang:mini', 38, 35);
      sprite.rotateCcw = true;
      return sprite;
    }
    return null;
  },
});
jiangRenderer.currentJiangPhraseId = renderDeck[0].phraseId;
function findDrawByImage(ctx, imageId) {
  return ctx.calls.find((call) => call[0] === 'drawImage' && call[1][0] && call[1][0].id === imageId);
}
function assertJiangOverlayDraw(size, card, width, height, expectedImageId, expectedWidth, expectedHeight) {
  const ctx = createFakeRenderContext();
  jiangOverlayCalls.length = 0;
  jiangRenderer.drawCard(ctx, card, 10, 20, width, height, true, false, size);
  const jiangDraw = findDrawByImage(ctx, expectedImageId);
  if (!jiangDraw) throw new Error(`${size} jiang card should draw its jiang overlay`);
  const [, , , , , dx, dy, dw, dh] = jiangDraw[1];
  if (size === 'mini') {
    const expectedX = 10 + (width - expectedWidth) / 2;
    const expectedY = 20 + (height - expectedHeight) / 2;
    const translate = ctx.calls.find((call) => call[0] === 'translate' && Math.abs(call[1][0] - expectedX) < 0.001);
    if (
      !translate
      || Math.abs(translate[1][1] - (expectedY + expectedHeight)) > 0.001
      || Math.abs(dw - expectedHeight) > 0.001
      || Math.abs(dh - expectedWidth) > 0.001
      || dx !== 0
      || dy !== 0
    ) {
      throw new Error(`${size} jiang overlay should keep its rotated atlas source-size ratio against the card face`);
    }
  } else if (
    Math.abs(dw - expectedWidth) > 0.001
    || Math.abs(dh - expectedHeight) > 0.001
    || Math.abs(dx - (10 + (width - expectedWidth) / 2)) > 0.001
    || Math.abs(dy - (20 + (height - expectedHeight) / 2)) > 0.001
  ) {
    throw new Error(`${size} jiang overlay should keep its atlas source-size ratio against the card face`);
  }
  if (jiangOverlayCalls.join(',') !== size) {
    throw new Error(`${size} jiang card should request only the matching overlay size`);
  }
}
const jiangCard = { ...renderDeck.find((card) => card.phraseId === renderDeck[0].phraseId) };
const nonJiangCard = { ...renderDeck.find((card) => card.phraseId !== renderDeck[0].phraseId) };
assertJiangOverlayDraw('big', jiangCard, 88, 307, 'jiang:big', 83, 302);
assertJiangOverlayDraw('small', jiangCard, 88, 108, 'jiang:small', 87, 108);
assertJiangOverlayDraw('mini', jiangCard, 16, 20, 'jiang:mini', 16 * (35 / 38), 20 * (38 / 42));
const miniRotateCtx = createFakeRenderContext();
jiangRenderer.drawCard(miniRotateCtx, jiangCard, 10, 20, 16, 20, true, false, 'mini');
if (!miniRotateCtx.calls.find((call) => call[0] === 'rotate' && Math.abs(call[1][0] + Math.PI / 2) < 0.001)) {
  throw new Error('mini jiang overlay should be drawn with left rotation');
}
const plainJiangCtx = createFakeRenderContext();
jiangOverlayCalls.length = 0;
jiangRenderer.drawCard(plainJiangCtx, nonJiangCard, 10, 20, 88, 307, true, false, 'big');
if (findDrawByImage(plainJiangCtx, 'jiang:big') || jiangOverlayCalls.length) {
  throw new Error('non-jiang cards should not request or draw a jiang overlay');
}
jiangRenderer.currentJiangPhraseId = null;
jiangRenderer.drawCard(createFakeRenderContext(), jiangCard, 10, 20, 88, 307, true, false, 'big');
if (jiangOverlayCalls.length) {
  throw new Error('cards should not request jiang overlays before jiang phrase is known');
}
jiangRenderer.currentJiangPhraseId = renderDeck[0].phraseId;
jiangOverlayCalls.length = 0;
jiangRenderer.drawCard(createFakeRenderContext(), jiangCard, 10, 20, 88, 108, false, false, 'small');
if (jiangOverlayCalls.length) {
  throw new Error('card backs should not request jiang overlays');
}
const combinedOverlayCtx = createFakeRenderContext();
jiangRenderer.drawCard(
  combinedOverlayCtx,
  jiangCard,
  10,
  20,
  88,
  307,
  true,
  false,
  'big',
  { appearanceOverlay: 'play', border: false }
);
const combinedOrder = combinedOverlayCtx.calls
  .filter((call) => call[0] === 'drawImage')
  .map((call) => call[1][0] && call[1][0].id);
if (combinedOrder.join(',') !== `base:big:${jiangCard.key},overlay:play,jiang:big`) {
  throw new Error('jiang appearance cards should draw base, appearance overlay, then jiang overlay');
}
const missingJiangRenderer = new TableRenderer({
  getImage() { return null; },
  getCardSprite() { return null; },
  getCardBackSprite() { return null; },
  getAppearanceOverlaySprite() { return null; },
  getJiangOverlaySprite() { return null; },
});
missingJiangRenderer.currentJiangPhraseId = jiangCard.phraseId;
missingJiangRenderer.drawCard(createFakeRenderContext(), jiangCard, 0, 0, 88, 307, true, false, 'big');
const claimState = {
  ...pendingDiscardState,
  recentDiscard: null,
  pendingActions: [],
  playerActions: [],
  drawnCard: renderDeck[30],
  currentSeat: 2,
};
claimState.seats = createSeats(DEFAULT_RULES);
claimState.seats[0].melds = [{ id: 'claim-test', type: 'peng', cards: [pendingDiscardCard] }];
pendingDiscardRenderer.stateAnimationController.observe(claimState, discardResolutionLayout);
const claimedVisual = pendingDiscardRenderer.managedCardVisual(pendingDiscardCard.id);
if (!claimedVisual || claimedVisual.stage !== 'peng') {
  throw new Error('claimed discard should resolve to the claiming player before later draw animations');
}
if (pendingDiscardRenderer.resolvingClaimedMiniId(claimState, 0) !== pendingDiscardCard.id) {
  throw new Error('claimed mini card should stay hidden until the claim animation completes');
}
const passRenderer = new TableRenderer({
  getImage() { return null; },
  getCardSprite() { return null; },
  getCardBackSprite() { return null; },
});
const passState = {
  ...pendingDiscardState,
  pendingActions: [],
  playerActions: [],
  recentDiscard: { seat: 1, card: pendingDiscardCard, unclaimed: true, resolved: true },
  drawnCard: null,
  currentSeat: 2,
};
passRenderer.stateAnimationController.observe(pendingDiscardState, discardResolutionLayout);
passRenderer.stateAnimationController.observe(passState, discardResolutionLayout);
const passedVisual = passRenderer.managedCardVisual(pendingDiscardCard.id);
if (!passedVisual || passedVisual.stage !== 'unclaimed') {
  throw new Error('passed discard should resolve to the discarder area before later draw animations');
}
if (passRenderer.resolvingDiscardMiniId(1) !== pendingDiscardCard.id) {
  throw new Error('discard mini card should stay hidden until the discard animation completes');
}

const effectRenderer = new TableRenderer({
  getImage() { return null; },
  getCardSprite() { return null; },
  getCardBackSprite() { return null; },
});
const effectCtx = createFakeRenderContext();
effectRenderer.addTextEffect('碰', 120, 80);
effectRenderer.animationManager.update(0);
effectRenderer.drawManagedAnimations(effectCtx, discardResolutionLayout);
if (
  !effectCtx.calls.find((call) => call[0] === 'strokeText' && call[1][0] === '碰')
  || !effectCtx.calls.find((call) => call[0] === 'fillText' && call[1][0] === '碰')
) {
  throw new Error('action text effect should draw stroke and fill text');
}
for (let time = 0; time <= 1200; time += 50) effectRenderer.animationManager.update(time);
if (effectRenderer.animationManager.getVisualState().some((visual) => visual.kind === 'text')) {
  throw new Error('expired text effects should be cleaned up');
}
const onlineMeldEffectRenderer = new TableRenderer({
  getImage() { return null; },
  getCardSprite() { return null; },
  getCardBackSprite() { return null; },
});
const onlineMeldBaseState = {
  ...layoutState,
  animationWaiting: true,
  seats: createSeats(DEFAULT_RULES),
};
onlineMeldEffectRenderer.updateMeldEffects(onlineMeldBaseState, discardResolutionLayout, 0);
const onlineMeldState = {
  ...onlineMeldBaseState,
  seats: createSeats(DEFAULT_RULES),
};
onlineMeldState.seats[0].melds = [{
  id: 'online-owned-chi',
  type: 'chi',
  label: '吃',
  cards: renderDeck.slice(0, 3),
}];
onlineMeldEffectRenderer.updateMeldEffects(onlineMeldState, discardResolutionLayout, 100);
if (onlineMeldEffectRenderer.animationManager.getVisualState().length) {
  throw new Error('online-owned meld events must not trigger renderer difference animations');
}

const resultEffectRenderer = new TableRenderer({
  getImage() { return null; },
  getCardSprite() { return null; },
  getCardBackSprite() { return null; },
});
resultEffectRenderer.updateResultEffects({
  ...layoutState,
  result: { type: 'win', winner: 0 },
  round: 9,
}, discardResolutionLayout, Date.now());
if (!resultEffectRenderer.animationManager.getVisualState().find((effect) => effect.label === '胡' && effect.fontSize > 70)) {
  throw new Error('win result should create a prominent hu text effect');
}
resultEffectRenderer.stateAnimationController.observe({
  ...layoutState,
  recentDiscard: { seat: 1, card: pendingDiscardCard },
}, discardResolutionLayout);
resultEffectRenderer.stateAnimationController.observe({
  ...layoutState,
  phase: PHASES.RESULT,
  result: { type: 'win', winner: 0 },
  recentDiscard: { seat: 1, card: pendingDiscardCard },
}, discardResolutionLayout);
if (resultEffectRenderer.animationManager.getVisualState().length || resultEffectRenderer.lastDiscardEvent) {
  throw new Error('win result should clear moving card animations and prevent later card motion');
}

const buttonFeedbackRenderer = new TableRenderer({
  getImage() { return null; },
  getCardSprite() { return null; },
  getCardBackSprite() { return null; },
});
const buttonLayout = new TableLayout(667, 375).build(layoutState);
buttonFeedbackRenderer.updateEffects(layoutState, buttonLayout);
buttonFeedbackRenderer.buttonPanelStartedAt = Date.now() - 40;
const buttonCtx = createFakeRenderContext();
buttonFeedbackRenderer.drawButtons(buttonCtx, layoutState, buttonLayout);
const enterScale = buttonCtx.calls.find((call) => call[0] === 'scale');
if (!enterScale || enterScale[1][0] === 1) {
  throw new Error('action buttons should draw with an entry scale animation');
}
buttonFeedbackRenderer.markButtonPressed(buttonLayout.actionButtons[0]);
const beforeButton = { ...buttonLayout.actionButtons[0] };
const pressedVisual = buttonFeedbackRenderer.buttonVisual(buttonLayout.actionButtons[0]);
if (!pressedVisual.pressed || pressedVisual.scale >= 1 || buttonLayout.actionButtons[0].x !== beforeButton.x) {
  throw new Error('pressed action button should shrink visually without changing its hit region');
}

const imageButtonRenderer = new TableRenderer({
  getImage() { return null; },
  getCardSprite() { return null; },
  getCardBackSprite() { return null; },
  getActionSprite(type) {
    if (type === 'chi') {
      return {
        image: { id: 'actions-image' },
        frame: { frame: { x: 0, y: 0, w: 113, h: 116 } },
        rotateCw: false,
        rotateCcw: false,
      };
    }
    if (type === 'peng') {
      return {
        image: { id: 'actions-image' },
        frame: { frame: { x: 0, y: 0, w: 116, h: 113 } },
        rotateCw: false,
        rotateCcw: true,
      };
    }
    return null;
  },
});
const actionButtonRegion = { x: 10, y: 20, width: 54, height: 34 };
const unrotatedBounds = imageButtonRenderer.actionSpriteBounds(imageButtonRenderer.assets.getActionSprite('chi'), actionButtonRegion);
const rotatedBounds = imageButtonRenderer.actionSpriteBounds(imageButtonRenderer.assets.getActionSprite('peng'), actionButtonRegion);
if (
  !unrotatedBounds
  || !rotatedBounds
  || Math.abs((unrotatedBounds.width / unrotatedBounds.height) - (113 / 116)) > 0.01
  || Math.abs((rotatedBounds.width / rotatedBounds.height) - (113 / 116)) > 0.01
  || Math.abs((unrotatedBounds.x + unrotatedBounds.width / 2) - (actionButtonRegion.x + actionButtonRegion.width / 2)) > 0.01
  || Math.abs((rotatedBounds.y + rotatedBounds.height / 2) - (actionButtonRegion.y + actionButtonRegion.height / 2)) > 0.01
) {
  throw new Error('action atlas sprites should be aspect-correct and centered after applying rotation');
}
let actionSpriteDraws = [];
imageButtonRenderer.drawAtlasSprite = (ctx, sprite, x, y, width, height, selected, options) => {
  actionSpriteDraws.push({ sprite, x, y, width, height, selected, options });
};
const imageButtonCtx = createFakeRenderContext();
imageButtonRenderer.drawButton(imageButtonCtx, actionButtonRegion, '吃', false, {}, 'chi');
imageButtonRenderer.drawButton(imageButtonCtx, actionButtonRegion, '碰', false, {}, 'peng');
if (
  actionSpriteDraws.length !== 2
  || actionSpriteDraws.some((draw) => !draw.options || draw.options.border !== false)
  || imageButtonCtx.calls.find((call) => call[0] === 'fillText')
) {
  throw new Error('mapped action buttons should draw atlas sprites without canvas text or card borders');
}
const fallbackButtonCtx = createFakeRenderContext();
imageButtonRenderer.drawButton(fallbackButtonCtx, actionButtonRegion, '再来一局', false, {}, 'restart');
if (!fallbackButtonCtx.calls.find((call) => call[0] === 'fillText' && call[1][0] === '再来一局')) {
  throw new Error('unmapped or missing action sprites should fall back to the existing text button');
}

const comboRenderer = new TableRenderer({
  getImage() { return null; },
  getCardSprite() { return null; },
  getCardBackSprite() { return null; },
});
const comboCards = renderDeck.slice(0, 3);
comboRenderer.previousHandCards = [
  { card: comboCards[0], x: 20, y: 260, width: 36, height: 126 },
  { card: comboCards[1], x: 56, y: 260, width: 36, height: 126 },
];
comboRenderer.lastDiscardEvent = {
  seat: 3,
  card: comboCards[2],
  holdPosition: { x: 210, y: 80 },
};
comboRenderer.lastMeldSignatures = {};
const comboState = {
  ...layoutState,
  seats: createSeats(DEFAULT_RULES),
};
comboState.seats[0].melds = [{ id: 'combo-test', type: 'chi', label: '吃', cards: comboCards }];
comboRenderer.updateMeldEffects(comboState, discardResolutionLayout, Date.now());
if (
  comboRenderer.animationManager.getVisualState().filter((visual) => visual.stage === 'chi-combo').length !== 3
  || comboRenderer.resolvingClaimedMiniIds(comboState, 0).length !== 3
) {
  throw new Error('chi meld should create a three-card combo animation and hide all moving mini cards');
}
const comboCtx = createFakeRenderContext();
let comboDraws = [];
comboRenderer.drawCard = (ctx, card, x, y, cardWidth, cardHeight, front, selected, size, options) => {
  comboDraws.push({ card, options, size });
};
comboRenderer.drawManagedAnimations(comboCtx, discardResolutionLayout);
if (comboDraws.length !== 3 || comboDraws.some((draw) => draw.size !== 'big' || !draw.options.glow)) {
  throw new Error('chi combo animation should draw all grouped cards as glowing big cards');
}
const fallbackComboRenderer = new TableRenderer({
  getImage() { return null; },
  getCardSprite() { return null; },
  getCardBackSprite() { return null; },
});
fallbackComboRenderer.lastDiscardEvent = {
  seat: 3,
  card: comboCards[2],
  holdPosition: { x: 210, y: 80 },
};
fallbackComboRenderer.createChiComboAnimation(0, { type: 'chi', cards: comboCards }, discardResolutionLayout, Date.now());
if (
  fallbackComboRenderer.animationManager.getVisualState().filter((visual) => visual.stage === 'chi-combo').length !== 1
  || fallbackComboRenderer.animationManager.getVisualState().find((visual) => visual.stage === 'chi-combo').card.id !== comboCards[2].id
) {
  throw new Error('chi combo animation should fall back to only the incoming card when source hand positions are unavailable');
}
renderer.layout = new TableLayout(667, 375);
const fakeCtx = createFakeRenderContext();
renderer.render(fakeCtx, {
  ...layoutState,
  seats: renderSeats,
  deck: renderDeck.slice(42),
  recentDiscard: { seat: 1, card: renderDeck[24] },
  jiangCard: renderDeck[0],
  jiangPhraseId: renderDeck[0].phraseId,
  feedback: '渲染检查',
});
if (!renderer.lastLayout || !renderer.lastLayout.centerFocus || !renderer.lastLayout.seatPanels.bottom) {
  throw new Error('renderer should keep the placement table layout after rendering');
}
if (fakeCtx.calls.find((call) => call[0] === 'fillText' && call[1][0] === '渲染检查')) {
  throw new Error('renderer should hide action prompt text while image action buttons are visible');
}
if (!fakeCtx.calls.find((call) => call[0] === 'clearRect')) {
  throw new Error('renderer smoke test should exercise canvas drawing');
}
const tableDrawCall = fakeCtx.calls.find((call) => call[0] === 'drawImage' && call[1][0] && call[1][0].id === 'table-image');
if (!tableDrawCall) {
  throw new Error('renderer should draw the table background image as the primary surface');
}
if (tableDrawCall[1][1] !== 0 || tableDrawCall[1][2] !== 0 || tableDrawCall[1][3] !== 667 || tableDrawCall[1][4] !== 375) {
  throw new Error('renderer should draw the table background across the full canvas, not only safe content bounds');
}
if (fakeCtx.calls.find((call) => call[0] === 'createLinearGradient')) {
  throw new Error('renderer should not draw a generated table panel over the background');
}
if (fakeCtx.calls.find((call) => call[0] === 'fillRect')) {
  throw new Error('renderer should not tint or cover the background image during normal play');
}
const inferredDiscardVisual = renderer.animationManager.getVisualState().find((visual) => visual.kind === 'card');
if (!inferredDiscardVisual || inferredDiscardVisual.card.id !== renderDeck[24].id) {
  throw new Error('renderer should create a big-card animation for recent discard');
}
const handColumnOrderBeforeResize = renderer.lastLayout.handColumns
  .map((column) => column.cards.map((card) => card.id).join(','))
  .join('|');
if (!renderer.setViewport({
  width: 844,
  height: 390,
  safeAreaInsets: { left: 47, top: 0, right: 0, bottom: 21 },
})) {
  throw new Error('renderer should accept a changed stable viewport');
}
const resizedCtx = createFakeRenderContext();
renderer.render(resizedCtx, {
  ...layoutState,
  seats: renderSeats,
  deck: renderDeck.slice(42),
  recentDiscard: { seat: 1, card: renderDeck[24] },
  jiangCard: renderDeck[0],
  jiangPhraseId: renderDeck[0].phraseId,
  feedback: '尺寸更新检查',
});
const handColumnOrderAfterResize = renderer.lastLayout.handColumns
  .map((column) => column.cards.map((card) => card.id).join(','))
  .join('|');
const resizedBackground = resizedCtx.calls.find((call) => call[0] === 'drawImage' && call[1][0] && call[1][0].id === 'table-image');
const resizedHandCard = renderer.lastLayout.handCards[0];
const resizedHandHit = renderer.layout.hit(
  renderer.lastLayout,
  resizedHandCard.x + resizedHandCard.width / 2,
  resizedHandCard.y + resizedHandCard.height / 2
);
if (
  handColumnOrderAfterResize !== handColumnOrderBeforeResize
  || !resizedBackground
  || resizedBackground[1][3] !== 844
  || resizedBackground[1][4] !== 390
  || !resizedHandHit
  || resizedHandHit.type !== 'hand-card'
) {
  throw new Error('viewport changes should preserve hand columns while rebuilding background and hit regions');
}
const stableLayoutForPreview = renderer.lastLayout;
renderer.animationManager.play({
  id: 'duplicate-viewport-animation',
  visuals: [],
  steps: [{ type: 'wait', duration: 1000 }],
});
if (renderer.setViewport({
  width: 844,
  height: 390,
  safeAreaInsets: { left: 47, top: 0, right: 0, bottom: 21 },
}) || !renderer.animationManager.isPlaying('duplicate-viewport-animation')) {
  throw new Error('duplicate viewport notifications must not cancel current animations');
}
renderer.lastLayout = { stale: true };
renderer.buttonPanelSignature = 'stale-buttons';
if (!renderer.setViewport({
  width: 844,
  height: 390,
  safeAreaInsets: { left: 47, top: 0, right: 0, bottom: 21 },
}, { forceLayout: true })
  || renderer.lastLayout !== null
  || renderer.buttonPanelSignature
  || !renderer.animationManager.isPlaying('duplicate-viewport-animation')) {
  throw new Error('forced stable viewport refresh should clear layout caches without cancelling current animations');
}

const onlineRenderer = new TableRenderer({
  getImage() { return null; },
  getCardSprite() { return null; },
  getCardBackSprite() { return null; },
});
onlineRenderer.lastLayout = stableLayoutForPreview;
const fullPreviewRenderer = new TableRenderer({
  getImage() { return null; },
  getCardSprite() { return null; },
  getCardBackSprite() { return null; },
});
fullPreviewRenderer.lastLayout = stableLayoutForPreview;
const localChiCards = [
  { id: 'local-chi-x', key: 'x', phraseId: 'preview' },
  { id: 'local-chi-y', key: 'y', phraseId: 'preview' },
  { id: 'local-chi-z', key: 'z', phraseId: 'preview' },
];
fullPreviewRenderer.lastState = {
  seats: [{ hand: localChiCards.slice(0, 2), melds: [] }],
};
let fullLocalPreviewComplete = 0;
if (!fullPreviewRenderer.animationController.playLocalActionPreview({
  type: 'chi',
  seat: 0,
  sourceSeat: 3,
  card: localChiCards[2],
  keys: ['x', 'y'],
  label: '吃',
}, () => { fullLocalPreviewComplete += 1; })) {
  throw new Error('local chi action should begin a complete optimistic meld animation');
}
if (
  fullPreviewRenderer.animationManager.getVisualState().filter((visual) => visual.kind === 'card' && visual.stage === 'chi').length !== 3
  || fullPreviewRenderer.animationManager.active.size !== 1
) {
  throw new Error('local chi preview should animate the complete meld exactly once');
}
let fullLocalAuthorityComplete = 0;
if (!fullPreviewRenderer.animationController.confirmLocalActionPreview({
  eventSeq: 10,
  type: 'chi',
  seat: 0,
  actingSeat: 0,
  meld: { id: 'confirmed-local-chi', type: 'chi', cards: localChiCards },
}, () => { fullLocalAuthorityComplete += 1; })) {
  throw new Error('matching authoritative chi should reconcile with the local complete meld preview');
}
if (
  fullPreviewRenderer.animationManager.active.size !== 1
  || fullPreviewRenderer.animationManager.isPlaying('online:10')
) {
  throw new Error('authoritative chi confirmation must not create a second full meld animation for its actor');
}
for (let time = 0; time <= 2000; time += 50) fullPreviewRenderer.animationManager.update(time);
if (fullLocalPreviewComplete !== 1 || fullLocalAuthorityComplete !== 1) {
  throw new Error('reconciled local chi animation should complete locally and authoritatively exactly once');
}
[
  { type: 'peng', handCount: 2, keys: ['same', 'same'], expected: 3 },
  { type: 'zhao', handCount: 3, keys: ['same', 'same', 'same'], expected: 4 },
  { type: 'ta', handCount: 0, keys: [], expected: 5 },
].forEach((testCase) => {
  const previewRenderer = new TableRenderer({
    getImage() { return null; },
    getCardSprite() { return null; },
    getCardBackSprite() { return null; },
  });
  previewRenderer.lastLayout = stableLayoutForPreview;
  const hand = Array.from({ length: testCase.handCount }).map((_, index) => ({
    id: `${testCase.type}-hand-${index}`,
    key: 'same',
    phraseId: 'preview',
  }));
  const existingTaMeld = {
    id: 'existing-ta-meld',
    type: 'zhao',
    key: 'same',
    cards: Array.from({ length: 4 }).map((_, index) => ({
      id: `ta-existing-${index}`,
      key: 'same',
      phraseId: 'preview',
    })),
  };
  previewRenderer.lastState = {
    seats: [{
      hand,
      melds: testCase.type === 'ta' ? [existingTaMeld] : [],
    }],
  };
  previewRenderer.animationController.playLocalActionPreview({
    type: testCase.type,
    seat: 0,
    ownerSeat: 0,
    meldId: testCase.type === 'ta' ? existingTaMeld.id : undefined,
    card: { id: `${testCase.type}-incoming`, key: 'same', phraseId: 'preview' },
    keys: testCase.keys,
    label: testCase.type,
  });
  if (
    previewRenderer.animationManager.getVisualState()
      .filter((visual) => visual.kind === 'card' && visual.stage === testCase.type).length !== testCase.expected
  ) {
    throw new Error(`local ${testCase.type} preview should animate its complete final meld exactly once`);
  }
});
const onlineIncoming = renderDeck[25];
onlineRenderer.lastDiscardEvent = {
  seat: 3,
  card: onlineIncoming,
  holdPosition: { x: 180, y: 120 },
};
let onlineCompletionCount = 0;
const onlineMeldEvent = {
  eventSeq: 11,
  type: 'peng',
  seat: 1,
  meld: { id: 'online-peng', type: 'peng', cards: [onlineIncoming] },
};
if (!onlineRenderer.animationController.playOnlineEvent(onlineMeldEvent, () => { onlineCompletionCount += 1; })) {
  throw new Error('renderer should accept explicit online events');
}
const onlineMeldVisual = onlineRenderer.animationManager.getVisualState().find((visual) => visual.kind === 'card');
if (!onlineMeldVisual || onlineMeldVisual.stage !== 'peng') {
  throw new Error('online chi/peng/zhao/ta events should move the held response card to the claimed area');
}
onlineRenderer.animationController.playOnlineEvent(onlineMeldEvent, () => { onlineCompletionCount += 100; });
for (let time = 0; time <= 2000; time += 50) onlineRenderer.animationManager.update(time);
if (onlineCompletionCount !== 1) {
  throw new Error('an online event completion callback should run exactly once');
}
onlineRenderer.animationController.releaseOnlineEvent(11);
if (onlineRenderer.animationController.onlinePlayback) {
  throw new Error('renderer should release a completed online event before the next event');
}
let localPreviewCompleted = 0;
onlineRenderer.lastState = {
  seats: [{
    hand: [
      { id: 'online-local-peng-a', key: onlineIncoming.key },
      { id: 'online-local-peng-b', key: onlineIncoming.key },
    ],
    melds: [],
  }],
};
onlineRenderer.animationController.playLocalActionPreview({
  type: 'peng',
  seat: 0,
  sourceSeat: 1,
  card: onlineIncoming,
  keys: [onlineIncoming.key, onlineIncoming.key],
});
if (!onlineRenderer.animationController.localActionPreview || !onlineRenderer.animationManager.getVisualState().length) {
  throw new Error('local action preview should begin immediately before the network response arrives');
}
if (!onlineRenderer.animationController.confirmLocalActionPreview({ eventSeq: 12, type: 'peng', seat: 0 }, () => {
  localPreviewCompleted += 1;
})) {
  throw new Error('matching authoritative action should attach to the active local preview');
}
for (let time = 2000; time <= 4000; time += 50) onlineRenderer.animationManager.update(time);
if (localPreviewCompleted !== 1) {
  throw new Error('confirmed local action preview should complete exactly once');
}
onlineRenderer.animationController.cancelLocalActionPreview();
if (onlineRenderer.animationController.localActionPreview) {
  throw new Error('local action preview should be cancellable after rejection or completion');
}
onlineRenderer.previousHandCards = [{
  card: onlineIncoming,
  x: 120,
  y: 220,
  width: 36,
  height: 110,
}];
onlineRenderer.animationController.playLocalActionPreview({ type: 'discard', seat: 0, card: onlineIncoming });
if (
  !onlineRenderer.animationController.localActionPreview
  || onlineRenderer.animationController.localActionPreview.cardId !== onlineIncoming.id
  || !onlineRenderer.animationManager.getVisualState().find((visual) => visual.kind === 'card')
) {
  throw new Error('local discard preview should immediately fly the selected hand card toward the table');
}
const localDiscardVisual = onlineRenderer.animationManager.getVisualState().find((visual) => visual.kind === 'card');
onlineRenderer.stateAnimationController.observe({
  phase: 'ai-thinking',
  drawnCard: null,
  recentDiscard: { seat: 0, card: onlineIncoming },
}, onlineRenderer.lastLayout, Boolean(onlineRenderer.animationController.localActionPreview));
if (onlineRenderer.animationManager.getVisualState().find((visual) => visual.kind === 'card') !== localDiscardVisual) {
  throw new Error('authoritative discard snapshot must not start a second animation over an active local preview');
}
onlineRenderer.animationController.confirmLocalActionPreview({
  eventSeq: 13,
  type: 'discard',
  seat: 0,
  card: onlineIncoming,
  appearanceResolution: 'auto-discard',
  discardIndex: 0,
}, () => {});
for (let time = 4000; time <= 6000; time += 50) onlineRenderer.animationManager.update(time);
onlineRenderer.animationController.cancelLocalActionPreview();
onlineRenderer.stateAnimationController.observe({
  phase: 'ai-thinking',
  drawnCard: null,
  recentDiscard: { seat: 0, card: onlineIncoming },
}, onlineRenderer.lastLayout);
if (onlineRenderer.animation || onlineRenderer.animationManager.getVisualState().length) {
  throw new Error('confirmed local discard preview must suppress inferred replay after it completes');
}

console.log('huapai checks passed');
