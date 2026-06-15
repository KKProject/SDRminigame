export const MAX_RENDER_PIXEL_RATIO = 2;
export const MIN_LANDSCAPE_WIDTH = 480;
export const MIN_LANDSCAPE_HEIGHT = 240;

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

export function renderMetricsSignature(metrics) {
  if (!metrics) return '';
  const insets = metrics.safeAreaInsets || {};
  return [
    metrics.width,
    metrics.height,
    metrics.devicePixelRatio,
    metrics.renderPixelRatio,
    insets.left || 0,
    insets.top || 0,
    insets.right || 0,
    insets.bottom || 0,
  ].join(':');
}

export function isValidLandscapeMetrics(metrics) {
  if (!metrics) return false;
  const values = [
    metrics.width,
    metrics.height,
    metrics.devicePixelRatio,
    metrics.renderPixelRatio,
    metrics.safeAreaBounds && metrics.safeAreaBounds.width,
    metrics.safeAreaBounds && metrics.safeAreaBounds.height,
  ];
  return values.every((value) => typeof value === 'number' && isFinite(value) && value > 0)
    && metrics.width > metrics.height
    && metrics.width >= MIN_LANDSCAPE_WIDTH
    && metrics.height >= MIN_LANDSCAPE_HEIGHT;
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

export function readWindowInfo(runtime) {
  try {
    if (runtime && runtime.getWindowInfo) {
      const info = runtime.getWindowInfo() || {};
      if (
        fallbackNumber(info.windowWidth, fallbackNumber(info.screenWidth, 0))
        && fallbackNumber(info.windowHeight, fallbackNumber(info.screenHeight, 0))
      ) return info;
    }
  } catch (err) {
    console.warn('[render] getWindowInfo failed', err);
  }
  try {
    if (runtime && runtime.getSystemInfoSync) return runtime.getSystemInfoSync() || {};
  } catch (err) {
    console.warn('[render] getSystemInfoSync failed', err);
  }
  return { windowWidth: 667, windowHeight: 375, pixelRatio: 1 };
}

export let RENDER_METRICS = null;
export let SCREEN_WIDTH = 667;
export let SCREEN_HEIGHT = 375;
export let DEVICE_PIXEL_RATIO = 1;
export let RENDER_PIXEL_RATIO = 1;
export let BACKING_STORE_WIDTH = 667;
export let BACKING_STORE_HEIGHT = 375;
export let SAFE_AREA_INSETS = { left: 0, top: 0, right: 0, bottom: 0 };
export let SAFE_AREA_BOUNDS = { x: 0, y: 0, width: 667, height: 375 };

function syncLegacyExports(metrics) {
  RENDER_METRICS = metrics;
  SCREEN_WIDTH = metrics.width;
  SCREEN_HEIGHT = metrics.height;
  DEVICE_PIXEL_RATIO = metrics.devicePixelRatio;
  RENDER_PIXEL_RATIO = metrics.renderPixelRatio;
  BACKING_STORE_WIDTH = metrics.backingStoreWidth;
  BACKING_STORE_HEIGHT = metrics.backingStoreHeight;
  SAFE_AREA_INSETS = metrics.safeAreaInsets;
  SAFE_AREA_BOUNDS = metrics.safeAreaBounds;
}

export class RenderMetricsManager {
  constructor(options = {}) {
    this.runtime = options.runtime || null;
    this.canvas = options.canvas || null;
    this.context = options.context || null;
    this.confirmations = Math.max(1, options.confirmations || 2);
    this.stableMetrics = null;
    this.stableSignature = '';
    this.candidateSignature = '';
    this.candidateCount = 0;
    this.listeners = new Set();
    this.appliedSignature = options.appliedSignature || '';
  }

  get() {
    return this.stableMetrics;
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  refresh() {
    return this.consider(readWindowInfo(this.runtime));
  }

  consider(windowInfo) {
    const metrics = createRenderMetrics(windowInfo);
    if (!isValidLandscapeMetrics(metrics)) {
      this.candidateSignature = '';
      this.candidateCount = 0;
      return { status: 'invalid', metrics };
    }

    const signature = renderMetricsSignature(metrics);
    if (signature === this.stableSignature) {
      this.candidateSignature = '';
      this.candidateCount = 0;
      return { status: 'duplicate', metrics: this.stableMetrics };
    }

    if (signature === this.candidateSignature) {
      this.candidateCount += 1;
    } else {
      this.candidateSignature = signature;
      this.candidateCount = 1;
    }

    if (this.candidateCount < this.confirmations) {
      return { status: 'candidate', metrics, confirmations: this.candidateCount };
    }
    return { status: 'committed', metrics: this.commit(metrics, signature) };
  }

  commit(metrics, signature = renderMetricsSignature(metrics)) {
    if (signature === this.stableSignature) return this.stableMetrics;

    if (signature !== this.appliedSignature) {
      applyCanvasMetrics(this.canvas, metrics);
      applyContextScale(this.context, metrics.renderPixelRatio);
      this.appliedSignature = signature;
    }

    this.stableMetrics = metrics;
    this.stableSignature = signature;
    this.candidateSignature = '';
    this.candidateCount = 0;
    syncLegacyExports(metrics);
    this.listeners.forEach((listener) => listener(metrics));
    return metrics;
  }
}

GameGlobal.canvas = wx.createCanvas();

export const canvas = GameGlobal.canvas;
export const ctx = canvas.getContext('2d');

const initialWindowInfo = readWindowInfo(wx);
const initialMetrics = createRenderMetrics(initialWindowInfo);
applyCanvasMetrics(canvas, initialMetrics);
applyContextScale(ctx, initialMetrics.renderPixelRatio);
syncLegacyExports(initialMetrics);

export const renderMetricsManager = new RenderMetricsManager({
  runtime: wx,
  canvas,
  context: ctx,
  appliedSignature: renderMetricsSignature(initialMetrics),
});

// 连续读取两次；有效横屏通常在模块加载时即可稳定，过渡尺寸则不会进入正式布局。
renderMetricsManager.consider(initialWindowInfo);
renderMetricsManager.refresh();

export function getRenderMetrics() {
  return renderMetricsManager.get();
}

export function subscribeRenderMetrics(listener) {
  return renderMetricsManager.subscribe(listener);
}

export function refreshRenderMetrics() {
  return renderMetricsManager.refresh();
}
