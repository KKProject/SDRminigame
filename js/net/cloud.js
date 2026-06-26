/**
 * 自有后端 API 客户端。
 * 在线对战只通过 HTTPS API 与 WSS 访问自有服务器，不再依赖 wx.cloud。
 */

export const BACKEND_API_BASE_URL = 'https://www.wangyouk.cn';
const CALL_TIMEOUT_MS = 15000;

let initialized = false;
let latestSocketAuth = null;
let latestAccessToken = '';

function configuredApiBaseUrl() {
  const runtimeValue = typeof wx !== 'undefined' ? wx.__HUAPAI_BACKEND_API_BASE_URL : '';
  return String(runtimeValue || BACKEND_API_BASE_URL || '').replace(/\/+$/, '');
}

export function isCloudSupported() {
  return typeof wx !== 'undefined' && typeof wx.request === 'function';
}

export function ensureCloudInit() {
  if (initialized) return true;
  if (!isCloudSupported()) return false;
  initialized = true;
  return true;
}

export function cloudErrorCode(err) {
  if (!err) return 'UNKNOWN_ERROR';
  if (typeof err.code === 'string' && err.code) return err.code;
  if (typeof err.errCode === 'number') return String(err.errCode);
  const message = String(err.errMsg || err.message || err);
  if (message.includes('BACKEND_UNSUPPORTED')) return 'BACKEND_UNSUPPORTED';
  if (message.includes('BACKEND_TIMEOUT')) return 'BACKEND_TIMEOUT';
  if (message.includes('WX_LOGIN_FAILED')) return 'WX_LOGIN_FAILED';
  return message || 'UNKNOWN_ERROR';
}

function backendError(code, detail = null) {
  const error = new Error(code);
  error.code = code;
  if (detail) error.detail = detail;
  return error;
}

function endpointFor(name) {
  const baseUrl = configuredApiBaseUrl();
  if (!baseUrl) return '';
  if (name === 'login') return `${baseUrl}/api/auth/login`;
  if (name === 'game') return `${baseUrl}/api/game`;
  return '';
}

function authHeader() {
  return latestAccessToken ? { Authorization: `Bearer ${latestAccessToken}` } : {};
}

export function callFunction(name, data = {}) {
  if (!ensureCloudInit()) return Promise.reject(backendError('BACKEND_UNSUPPORTED'));
  const url = endpointFor(name);
  if (!url) return Promise.reject(backendError('BACKEND_ENDPOINT_MISSING'));
  if (name === 'game' && !latestAccessToken) return Promise.reject(backendError('BACKEND_AUTH_MISSING'));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      finish(reject, backendError('BACKEND_TIMEOUT'));
    }, CALL_TIMEOUT_MS);
    wx.request({
      url,
      method: 'POST',
      data,
      timeout: CALL_TIMEOUT_MS,
      header: Object.assign({ 'content-type': 'application/json' }, name === 'game' ? authHeader() : {}),
      success: (res) => {
        if (res.statusCode >= 400) {
          finish(reject, backendError((res.data && res.data.error) || `BACKEND_HTTP_${res.statusCode}`, res));
          return;
        }
        finish(resolve, res.data);
      },
      fail: (err) => finish(reject, err),
    });
  });
}

export function getSocketAuth() {
  return latestSocketAuth;
}

export function clearSocketAuth() {
  latestSocketAuth = null;
  latestAccessToken = '';
}

export function refreshSocketToken(profile = {}) {
  return login(profile).then((res) => {
    if (!res || !res.ok || !res.socket || !res.socket.token) {
      throw backendError('SOCKET_TOKEN_UNAVAILABLE');
    }
    return res.socket;
  });
}

function normalizeSocketAuth(socket = {}) {
  if (!socket || !socket.token || !socket.url) return null;
  return Object.assign({}, socket);
}

export function login(profile = {}) {
  if (!ensureCloudInit()) return Promise.reject(backendError('BACKEND_UNSUPPORTED'));
  return new Promise((resolve, reject) => {
    const proceed = (loginResult = {}) => {
      callFunction('login', Object.assign({}, profile, {
        profile,
        code: loginResult.code || '',
      })).then((res) => {
        latestAccessToken = res && res.token ? res.token : '';
        latestSocketAuth = res && res.socket ? normalizeSocketAuth(res.socket) : null;
        if (res && res.socket) res.socket = latestSocketAuth;
        resolve(res);
      }).catch(reject);
    };
    if (typeof wx.login === 'function') {
      wx.login({
        success: proceed,
        fail: (err) => {
          const error = backendError('WX_LOGIN_FAILED');
          error.cause = err;
          reject(error);
        },
      });
    } else {
      proceed();
    }
  });
}
