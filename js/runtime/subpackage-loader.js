import { getRenderMetrics } from '../render';
import { reportClientDiagnostic, flushClientDiagnostics } from '../net/diagnostics';

let assetsRef = null;
let tableViewRef = null;
let loadPromise = null;

export function configureGamePackageLoader(assets, tableView) {
  assetsRef = assets;
  tableViewRef = tableView;
}

function requireGameEntry() {
  // 有意使用运行时 require 而不是静态 import：静态 import 会被编译器在解析期
  // 就纳入主包，使分包形同虚设。这里必须等 wx.loadSubpackage 成功回调之后才执行。
  // eslint-disable-next-line global-require
  return require('../../subpackages/game/game');
}

const LOAD_TIMEOUT_MS = 20000;

export function ensureGamePackage(onProgress) {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (typeof wx === 'undefined' || !wx.loadSubpackage) {
      reject(new Error('wx.loadSubpackage unavailable'));
      return;
    }
    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      loadPromise = null;
      reportClientDiagnostic('subpackage-load-timeout', {});
      flushClientDiagnostics();
      settle(reject, new Error('loadSubpackage timeout'));
    }, LOAD_TIMEOUT_MS);
    const task = wx.loadSubpackage({
      name: 'game',
      success: () => {
        try {
          const entry = requireGameEntry();
          const { default: TableRenderer, GAME_ASSET_MANIFEST } = entry || {};
          if (!TableRenderer || !GAME_ASSET_MANIFEST) {
            throw new Error(`game entry missing exports: ${JSON.stringify(entry ? Object.keys(entry) : entry)}`);
          }
          if (assetsRef) assetsRef.extendManifest(GAME_ASSET_MANIFEST);
          const renderer = new TableRenderer(assetsRef);
          const metrics = getRenderMetrics();
          if (metrics) renderer.setViewport(metrics);
          if (tableViewRef) tableViewRef.attach(renderer);
          settle(resolve, { renderer, manifest: GAME_ASSET_MANIFEST });
        } catch (error) {
          loadPromise = null;
          reportClientDiagnostic('subpackage-require-error', {
            message: String(error && (error.message || error)),
            stack: error && error.stack ? String(error.stack).slice(0, 800) : '',
          });
          flushClientDiagnostics();
          settle(reject, error);
        }
      },
      fail: (error) => {
        loadPromise = null;
        reportClientDiagnostic('subpackage-load-fail', {
          message: String((error && error.errMsg) || error),
        });
        flushClientDiagnostics();
        settle(reject, error instanceof Error ? error : new Error((error && error.errMsg) || 'loadSubpackage failed'));
      },
    });
    if (task && typeof task.onProgressUpdate === 'function' && onProgress) {
      task.onProgressUpdate(onProgress);
    }
  });

  return loadPromise;
}

export function isGamePackageReady() {
  return Boolean(tableViewRef && tableViewRef.ready);
}
