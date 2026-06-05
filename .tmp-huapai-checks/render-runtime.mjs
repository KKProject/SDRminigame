export const MAX_RENDER_PIXEL_RATIO = 2;

function fallbackNumber(value, fallback) {
  return typeof value === 'number' && isFinite(value) && value > 0 ? value : fallback;
}

function safeNonNegativeNumber(value, fallback = 0) {
  return typeof value === 'number' && isFinite(value) && value >= 0 ? value : fallback;
}

export function clampRenderPixelRatio(pixelRatio, maxPixelRatio = MAX_RENDER_PIXEL_RATIO) {
  const safeRatio = fallbackNumber(pixelRatio, 1);
  const safeMax = fallbackNumber(maxPixelRatio, MAX_RENDER_PIXEL_RATIO);
  return Math.max(1, Math.min(safeRatio, safeMax));
}

export function createSafeAreaMetrics(windowInfo = {}, width = 375, height = 667) {
  const safeArea = windowInfo.safeArea || null;
  if (!safeArea || typeof safeArea !== 'object') {
    return {
      insets: { left: 0, top: 0, right: 0, bottom: 0 },
      bounds: { x: 0, y: 0, width, height },
    };
  }

  const left = clamp(safeNonNegativeNumber(safeArea.left, 0), 0, width);
  const top = clamp(safeNonNegativeNumber(safeArea.top, 0), 0, height);
  const safeRight = safeNonNegativeNumber(safeArea.right, width);
  const safeBottom = safeNonNegativeNumber(safeArea.bottom, height);
  const right = clamp(width - safeRight, 0, width);
  const bottom = clamp(height - safeBottom, 0, height);
  const safeWidth = width - left - right;
  const safeHeight = height - top - bottom;

  if (safeWidth <= 0 || safeHeight <= 0) {
    return {
      insets: { left: 0, top: 0, right: 0, bottom: 0 },
      bounds: { x: 0, y: 0, width, height },
    };
  }

  return {
    insets: { left, top, right, bottom },
    bounds: { x: left, y: top, width: safeWidth, height: safeHeight },
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createRenderMetrics(windowInfo = {}, maxPixelRatio = MAX_RENDER_PIXEL_RATIO) {
  const width = fallbackNumber(windowInfo.windowWidth, fallbackNumber(windowInfo.screenWidth, 375));
  const height = fallbackNumber(windowInfo.windowHeight, fallbackNumber(windowInfo.screenHeight, 667));
  const devicePixelRatio = fallbackNumber(windowInfo.pixelRatio, fallbackNumber(windowInfo.devicePixelRatio, 1));
  const renderPixelRatio = clampRenderPixelRatio(devicePixelRatio, maxPixelRatio);
  const safeArea = createSafeAreaMetrics(windowInfo, width, height);

  return {
    width,
    height,
    devicePixelRatio,
    renderPixelRatio,
    backingStoreWidth: Math.round(width * renderPixelRatio),
    backingStoreHeight: Math.round(height * renderPixelRatio),
    safeAreaInsets: safeArea.insets,
    safeAreaBounds: safeArea.bounds,
  };
}

export function applyCanvasMetrics(targetCanvas, metrics) {
  if (!targetCanvas || !metrics) return;
  targetCanvas.width = metrics.backingStoreWidth;
  targetCanvas.height = metrics.backingStoreHeight;
}

export function applyContextScale(targetContext, renderPixelRatio) {
  if (!targetContext) return;
  if (targetContext.setTransform) {
    targetContext.setTransform(renderPixelRatio, 0, 0, renderPixelRatio, 0, 0);
    return;
  }
  if (targetContext.scale) {
    targetContext.scale(renderPixelRatio, renderPixelRatio);
  }
}

function readWindowInfo(runtime) {
  if (runtime && runtime.getWindowInfo) return runtime.getWindowInfo();
  if (runtime && runtime.getSystemInfoSync) return runtime.getSystemInfoSync();
  return {};
}

GameGlobal.canvas = wx.createCanvas();

export const canvas = GameGlobal.canvas;
export const RENDER_METRICS = createRenderMetrics(readWindowInfo(wx));

applyCanvasMetrics(canvas, RENDER_METRICS);

export const ctx = canvas.getContext('2d');
applyContextScale(ctx, RENDER_METRICS.renderPixelRatio);

export const SCREEN_WIDTH = RENDER_METRICS.width;
export const SCREEN_HEIGHT = RENDER_METRICS.height;
export const DEVICE_PIXEL_RATIO = RENDER_METRICS.devicePixelRatio;
export const RENDER_PIXEL_RATIO = RENDER_METRICS.renderPixelRatio;
export const BACKING_STORE_WIDTH = RENDER_METRICS.backingStoreWidth;
export const BACKING_STORE_HEIGHT = RENDER_METRICS.backingStoreHeight;
export const SAFE_AREA_INSETS = RENDER_METRICS.safeAreaInsets;
export const SAFE_AREA_BOUNDS = RENDER_METRICS.safeAreaBounds;
