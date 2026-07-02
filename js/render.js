import { reportClientDiagnostic } from './net/diagnostics';

export const MAX_RENDER_PIXEL_RATIO = 2;
export const MIN_LANDSCAPE_WIDTH = 480;
export const MIN_LANDSCAPE_HEIGHT = 240;
export const FOREGROUND_RECOVERY_REFRESHES = 120;
export const CANONICAL_SHRINK_WIDTH_RATIO = 0.85;
export const CANONICAL_SHRINK_HEIGHT_TOLERANCE_RATIO = 0.15;
export const CANONICAL_SHRINK_HEIGHT_TOLERANCE_MIN = 24;
export const LANDSCAPE_SAFE_AREA_MAX_HORIZONTAL_INSET_RATIO = 0.35;
export const LANDSCAPE_SAFE_AREA_TRANSPOSE_TOLERANCE = 4;

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

function fullSafeAreaMetrics(width, height) {
  return {
    insets: { left: 0, top: 0, right: 0, bottom: 0 },
    bounds: { x: 0, y: 0, width, height },
  };
}

function cloneSafeAreaMetrics(metrics, width, height) {
  if (!metrics || !metrics.insets || !metrics.bounds) return fullSafeAreaMetrics(width, height);
  const insets = metrics.insets;
  const bounds = metrics.bounds;
  return {
    insets: {
      left: safeNonNegativeNumber(insets.left, 0),
      top: safeNonNegativeNumber(insets.top, 0),
      right: safeNonNegativeNumber(insets.right, 0),
      bottom: safeNonNegativeNumber(insets.bottom, 0),
    },
    bounds: {
      x: safeNonNegativeNumber(bounds.x, 0),
      y: safeNonNegativeNumber(bounds.y, 0),
      width: safeNonNegativeNumber(bounds.width, width),
      height: safeNonNegativeNumber(bounds.height, height),
    },
  };
}

function fallbackSafeAreaMetrics(fallback, width, height) {
  return cloneSafeAreaMetrics(fallback, width, height);
}

function isSuspiciousLandscapeSafeArea(rawSafeRight, left, top, right, safeWidth, width, height) {
  if (width <= height) return false;
  const horizontalInsetRatio = (left + right) / width;
  const rightInsetRatio = right / width;
  const rightLooksTransposed = rawSafeRight <= height + LANDSCAPE_SAFE_AREA_TRANSPOSE_TOLERANCE
    && rightInsetRatio > 0.25;
  const contentLooksPortraitWide = safeWidth <= Math.max(
    height + LANDSCAPE_SAFE_AREA_TRANSPOSE_TOLERANCE,
    width * 0.58
  ) && rightInsetRatio > 0.25;
  const horizontalInsetsTooLarge = horizontalInsetRatio > LANDSCAPE_SAFE_AREA_MAX_HORIZONTAL_INSET_RATIO;
  const topLooksTransposed = top > height * 0.12 && rightInsetRatio > 0.25;
  return rightLooksTransposed || contentLooksPortraitWide || horizontalInsetsTooLarge || topLooksTransposed;
}

export function createSafeAreaMetrics(windowInfo = {}, width = 375, height = 667, fallback = null) {
  const safeArea = windowInfo.safeArea || null;
  if (!safeArea || typeof safeArea !== 'object') {
    return fallbackSafeAreaMetrics(fallback, width, height);
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
    return fallbackSafeAreaMetrics(fallback, width, height);
  }

  if (isSuspiciousLandscapeSafeArea(safeRight, left, top, right, safeWidth, width, height)) {
    return fallbackSafeAreaMetrics(fallback, width, height);
  }

  return {
    insets: { left, top, right, bottom },
    bounds: { x: left, y: top, width: safeWidth, height: safeHeight },
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createRenderMetrics(windowInfo = {}, maxPixelRatio = MAX_RENDER_PIXEL_RATIO, safeAreaFallback = null) {
  const windowRawWidth = fallbackNumber(windowInfo.windowWidth, fallbackNumber(windowInfo.screenWidth, 375));
  const windowRawHeight = fallbackNumber(windowInfo.windowHeight, fallbackNumber(windowInfo.screenHeight, 667));
  const screenRawWidth = fallbackNumber(windowInfo.screenWidth, 0);
  const screenRawHeight = fallbackNumber(windowInfo.screenHeight, 0);
  const hasScreenSize = Boolean(screenRawWidth && screenRawHeight);
  const layoutRawWidth = hasScreenSize ? screenRawWidth : windowRawWidth;
  const layoutRawHeight = hasScreenSize ? screenRawHeight : windowRawHeight;
  const orientationNormalized = layoutRawWidth < layoutRawHeight;
  const windowOrientationNormalized = windowRawWidth < windowRawHeight;
  const width = orientationNormalized ? layoutRawHeight : layoutRawWidth;
  const height = orientationNormalized ? layoutRawWidth : layoutRawHeight;
  const devicePixelRatio = fallbackNumber(windowInfo.pixelRatio, fallbackNumber(windowInfo.devicePixelRatio, 1));
  const renderPixelRatio = clampRenderPixelRatio(devicePixelRatio, maxPixelRatio);
  const safeArea = createSafeAreaMetrics(
    orientationNormalized ? {} : windowInfo,
    width,
    height,
    safeAreaFallback
  );

  return {
    width,
    height,
    rawWidth: layoutRawWidth,
    rawHeight: layoutRawHeight,
    windowRawWidth,
    windowRawHeight,
    screenRawWidth: hasScreenSize ? screenRawWidth : 0,
    screenRawHeight: hasScreenSize ? screenRawHeight : 0,
    hasScreenSize,
    orientationNormalized,
    windowOrientationNormalized,
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

export function isCanonicalShrinkCandidate(metrics, stableMetrics) {
  if (!metrics || !stableMetrics || metrics.orientationNormalized) return false;
  const widthShrank = metrics.width < stableMetrics.width * CANONICAL_SHRINK_WIDTH_RATIO;
  const heightTolerance = Math.max(
    CANONICAL_SHRINK_HEIGHT_TOLERANCE_MIN,
    stableMetrics.height * CANONICAL_SHRINK_HEIGHT_TOLERANCE_RATIO
  );
  const heightMatches = Math.abs(metrics.height - stableMetrics.height) <= heightTolerance;
  const pixelRatioMatches = metrics.devicePixelRatio === stableMetrics.devicePixelRatio
    && metrics.renderPixelRatio === stableMetrics.renderPixelRatio;
  return widthShrank && heightMatches && pixelRatioMatches;
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

function summarizeWindowInfo(info = {}) {
  const safeArea = info.safeArea || null;
  return {
    windowWidth: info.windowWidth,
    windowHeight: info.windowHeight,
    screenWidth: info.screenWidth,
    screenHeight: info.screenHeight,
    pixelRatio: info.pixelRatio || info.devicePixelRatio,
    safeArea: safeArea ? {
      left: safeArea.left,
      top: safeArea.top,
      right: safeArea.right,
      bottom: safeArea.bottom,
      width: safeArea.width,
      height: safeArea.height,
    } : null,
  };
}

function summarizeMetrics(metrics) {
  if (!metrics) return null;
  return {
    width: metrics.width,
    height: metrics.height,
    rawWidth: metrics.rawWidth,
    rawHeight: metrics.rawHeight,
    windowRawWidth: metrics.windowRawWidth,
    windowRawHeight: metrics.windowRawHeight,
    screenRawWidth: metrics.screenRawWidth,
    screenRawHeight: metrics.screenRawHeight,
    hasScreenSize: metrics.hasScreenSize,
    orientationNormalized: metrics.orientationNormalized,
    windowOrientationNormalized: metrics.windowOrientationNormalized,
    devicePixelRatio: metrics.devicePixelRatio,
    renderPixelRatio: metrics.renderPixelRatio,
    backingStoreWidth: metrics.backingStoreWidth,
    backingStoreHeight: metrics.backingStoreHeight,
    safeAreaInsets: metrics.safeAreaInsets,
    safeAreaBounds: metrics.safeAreaBounds,
  };
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

function syncRenderTarget(targetCanvas, targetContext) {
  canvas = targetCanvas;
  ctx = targetContext;
  if (targetCanvas) GameGlobal.canvas = targetCanvas;
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
    this.pendingStableRefresh = false;
    this.foregroundRecoveryRefreshes = Math.max(1, options.foregroundRecoveryRefreshes || FOREGROUND_RECOVERY_REFRESHES);
    this.foregroundRecoveryRemaining = 0;
    this.lastDuplicateDiagnosticAt = 0;
    this.lastContextRestoreDiagnosticAt = 0;
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

  beginForegroundRecovery(refreshes = this.foregroundRecoveryRefreshes) {
    const safeRefreshes = Math.max(1, Math.floor(fallbackNumber(refreshes, this.foregroundRecoveryRefreshes)));
    this.foregroundRecoveryRemaining = Math.max(this.foregroundRecoveryRemaining, safeRefreshes);
    const result = this.restoreStableContext();
    this.reportDiagnostic('render-recovery-begin', { refreshes: safeRefreshes, result });
    return result;
  }

  reportDiagnostic(event, detail = {}) {
    reportClientDiagnostic(event, Object.assign({
      stableMetrics: summarizeMetrics(this.stableMetrics),
      stableSignature: this.stableSignature,
      candidateSignature: this.candidateSignature,
      candidateCount: this.candidateCount,
      appliedSignature: this.appliedSignature,
      pendingStableRefresh: this.pendingStableRefresh,
      foregroundRecoveryRemaining: this.foregroundRecoveryRemaining,
      canvas: this.canvas ? {
        width: this.canvas.width,
        height: this.canvas.height,
      } : null,
    }, detail));
  }

  resolveRenderTarget() {
    const globalCanvas = typeof GameGlobal !== 'undefined' && GameGlobal.canvas ? GameGlobal.canvas : this.canvas;
    if (globalCanvas) this.canvas = globalCanvas;
    if (this.canvas && this.canvas.getContext) {
      const nextContext = this.canvas.getContext('2d');
      if (nextContext) this.context = nextContext;
    }
    syncRenderTarget(this.canvas, this.context);
    return { canvas: this.canvas, context: this.context };
  }

  restoreStableContext() {
    if (!this.stableMetrics || !this.stableSignature) {
      return { status: 'no-stable-metrics', metrics: null };
    }
    this.resolveRenderTarget();
    applyCanvasMetrics(this.canvas, this.stableMetrics);
    applyContextScale(this.context, this.stableMetrics.renderPixelRatio);
    this.appliedSignature = this.stableSignature;
    const now = Date.now();
    if (now - this.lastContextRestoreDiagnosticAt > 1000) {
      this.lastContextRestoreDiagnosticAt = now;
      this.reportDiagnostic('render-context-restored', {
        metrics: summarizeMetrics(this.stableMetrics),
      });
    }
    return { status: 'restored', metrics: this.stableMetrics };
  }

  consider(windowInfo) {
    const metrics = createRenderMetrics(windowInfo, MAX_RENDER_PIXEL_RATIO, this.stableMetrics ? {
      insets: this.stableMetrics.safeAreaInsets,
      bounds: this.stableMetrics.safeAreaBounds,
    } : null);
    if (this.foregroundRecoveryRemaining > 0) this.foregroundRecoveryRemaining -= 1;

    if (!isValidLandscapeMetrics(metrics)) {
      this.candidateSignature = '';
      this.candidateCount = 0;
      if (this.stableMetrics) this.pendingStableRefresh = true;
      this.reportDiagnostic('render-metrics-invalid', {
        windowInfo: summarizeWindowInfo(windowInfo),
        metrics: summarizeMetrics(metrics),
      });
      return { status: 'invalid', metrics };
    }

    if (
      metrics.orientationNormalized
      && this.stableMetrics
      && metrics.width === this.stableMetrics.width
      && metrics.height === this.stableMetrics.height
      && metrics.devicePixelRatio === this.stableMetrics.devicePixelRatio
    ) {
      this.candidateSignature = '';
      this.candidateCount = 0;
      this.pendingStableRefresh = true;
      this.restoreStableContext();
      this.reportDiagnostic('render-metrics-transient-orientation', {
        windowInfo: summarizeWindowInfo(windowInfo),
        metrics: summarizeMetrics(metrics),
      });
      return { status: 'transient-orientation', metrics: this.stableMetrics };
    }

    if (isCanonicalShrinkCandidate(metrics, this.stableMetrics)) {
      this.candidateSignature = '';
      this.candidateCount = 0;
      this.pendingStableRefresh = true;
      this.restoreStableContext();
      this.reportDiagnostic('render-metrics-canonical-shrink-rejected', {
        windowInfo: summarizeWindowInfo(windowInfo),
        metrics: summarizeMetrics(metrics),
      });
      return { status: 'transient-canonical-shrink', metrics: this.stableMetrics };
    }

    const signature = renderMetricsSignature(metrics);
    if (signature === this.stableSignature) {
      this.candidateSignature = '';
      this.candidateCount = 0;
      if (this.pendingStableRefresh) {
        this.pendingStableRefresh = false;
        this.restoreStableContext();
        this.listeners.forEach((listener) => listener(this.stableMetrics, {
          forceLayout: true,
          reason: 'stable-after-invalid',
        }));
        this.reportDiagnostic('render-metrics-recovered-duplicate', {
          windowInfo: summarizeWindowInfo(windowInfo),
          metrics: summarizeMetrics(this.stableMetrics),
        });
        return { status: 'recovered-duplicate', metrics: this.stableMetrics };
      }
      if (
        metrics.windowRawWidth !== metrics.width
        || metrics.windowRawHeight !== metrics.height
        || metrics.hasScreenSize
      ) {
        const now = Date.now();
        if (now - this.lastDuplicateDiagnosticAt > 1000) {
          this.lastDuplicateDiagnosticAt = now;
          this.reportDiagnostic('render-metrics-duplicate', {
            windowInfo: summarizeWindowInfo(windowInfo),
            metrics: summarizeMetrics(metrics),
          });
        }
      }
      return { status: 'duplicate', metrics: this.stableMetrics };
    }

    if (signature === this.candidateSignature) {
      this.candidateCount += 1;
    } else {
      this.candidateSignature = signature;
      this.candidateCount = 1;
    }

    if (this.candidateCount < this.confirmations) {
      this.reportDiagnostic('render-metrics-candidate', {
        windowInfo: summarizeWindowInfo(windowInfo),
        metrics: summarizeMetrics(metrics),
        confirmations: this.candidateCount,
      });
      return { status: 'candidate', metrics, confirmations: this.candidateCount };
    }
    return { status: 'committed', metrics: this.commit(metrics, signature) };
  }

  commit(metrics, signature = renderMetricsSignature(metrics)) {
    if (signature === this.stableSignature) return this.stableMetrics;

    this.resolveRenderTarget();
    if (signature !== this.appliedSignature) {
      applyCanvasMetrics(this.canvas, metrics);
      applyContextScale(this.context, metrics.renderPixelRatio);
      this.appliedSignature = signature;
    }

    this.stableMetrics = metrics;
    this.stableSignature = signature;
    this.candidateSignature = '';
    this.candidateCount = 0;
    this.pendingStableRefresh = false;
    syncLegacyExports(metrics);
    this.listeners.forEach((listener) => listener(metrics, { forceLayout: false, reason: 'committed' }));
    this.reportDiagnostic('render-metrics-committed', {
      metrics: summarizeMetrics(metrics),
    });
    return metrics;
  }
}

GameGlobal.canvas = wx.createCanvas();

export let canvas = GameGlobal.canvas;
export let ctx = canvas.getContext('2d');

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
renderMetricsManager.reportDiagnostic('render-module-initialized', {
  initialWindowInfo: summarizeWindowInfo(initialWindowInfo),
  initialMetrics: summarizeMetrics(initialMetrics),
});

export function getRenderMetrics() {
  return renderMetricsManager.get();
}

export function subscribeRenderMetrics(listener) {
  return renderMetricsManager.subscribe(listener);
}

export function refreshRenderMetrics() {
  return renderMetricsManager.refresh();
}

export function restoreRenderContext() {
  return renderMetricsManager.restoreStableContext();
}

export function beginRenderMetricsRecovery(refreshes) {
  return renderMetricsManager.beginForegroundRecovery(refreshes);
}
