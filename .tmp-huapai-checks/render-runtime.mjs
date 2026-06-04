export const MAX_RENDER_PIXEL_RATIO = 2;

function fallbackNumber(value, fallback) {
  return typeof value === 'number' && isFinite(value) && value > 0 ? value : fallback;
}

export function clampRenderPixelRatio(pixelRatio, maxPixelRatio = MAX_RENDER_PIXEL_RATIO) {
  const safeRatio = fallbackNumber(pixelRatio, 1);
  const safeMax = fallbackNumber(maxPixelRatio, MAX_RENDER_PIXEL_RATIO);
  return Math.max(1, Math.min(safeRatio, safeMax));
}

export function createRenderMetrics(windowInfo = {}, maxPixelRatio = MAX_RENDER_PIXEL_RATIO) {
  const width = fallbackNumber(windowInfo.windowWidth, fallbackNumber(windowInfo.screenWidth, 375));
  const height = fallbackNumber(windowInfo.windowHeight, fallbackNumber(windowInfo.screenHeight, 667));
  const devicePixelRatio = fallbackNumber(windowInfo.pixelRatio, fallbackNumber(windowInfo.devicePixelRatio, 1));
  const renderPixelRatio = clampRenderPixelRatio(devicePixelRatio, maxPixelRatio);

  return {
    width,
    height,
    devicePixelRatio,
    renderPixelRatio,
    backingStoreWidth: Math.round(width * renderPixelRatio),
    backingStoreHeight: Math.round(height * renderPixelRatio),
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
