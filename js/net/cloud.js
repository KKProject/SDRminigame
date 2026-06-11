/**
 * 客户端云能力引导。
 * 仅在进入「在线对战」时才初始化云环境，避免影响单机练习模式。
 */

export const CLOUD_ENV = 'cloud1-d2gorzc71e74a3175';
const CALL_TIMEOUT_MS = 15000;

let initialized = false;

export function isCloudSupported() {
  return typeof wx !== 'undefined' && typeof wx.cloud !== 'undefined';
}

/**
 * 幂等初始化云环境。返回是否初始化成功。
 */
export function ensureCloudInit() {
  if (initialized) return true;
  if (!isCloudSupported()) return false;
  try {
    wx.cloud.init({ env: CLOUD_ENV, traceUser: true });
    initialized = true;
    return true;
  } catch (err) {
    return false;
  }
}

export function cloudErrorCode(err) {
  if (!err) return 'UNKNOWN_ERROR';
  if (typeof err.code === 'string' && err.code) return err.code;
  if (err.errCode === -501000) return 'FUNCTION_NOT_FOUND';
  if (err.errCode === -501005) return 'CLOUD_ENV_INVALID';
  if (err.errCode === -502005) return 'DATABASE_COLLECTION_MISSING';
  if (typeof err.errCode === 'number') return String(err.errCode);
  const message = String(err.errMsg || err.message || err);
  if (message.includes('FUNCTION_NOT_FOUND') || message.includes('-501000')) return 'FUNCTION_NOT_FOUND';
  if (message.includes('CLOUD_UNSUPPORTED')) return 'CLOUD_UNSUPPORTED';
  if (message.includes('WX_LOGIN_FAILED')) return 'WX_LOGIN_FAILED';
  if (message.includes('CLOUD_TIMEOUT')) return 'CLOUD_TIMEOUT';
  return message || 'UNKNOWN_ERROR';
}

/**
 * 调用云函数的 Promise 封装。
 */
export function callFunction(name, data = {}) {
  if (!ensureCloudInit()) {
    return Promise.reject(new Error('CLOUD_UNSUPPORTED'));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      const error = new Error('CLOUD_TIMEOUT');
      error.code = 'CLOUD_TIMEOUT';
      finish(reject, error);
    }, CALL_TIMEOUT_MS);
    wx.cloud.callFunction({
      name,
      data,
      success: (res) => finish(resolve, res && res.result),
      fail: (err) => finish(reject, err),
    });
  });
}

/**
 * 登录：先 wx.login 触发会话，再调用 login 云函数换取服务端身份。
 * profile 可选，拿到微信资料后一并写入。
 */
export function login(profile = {}) {
  if (!ensureCloudInit()) {
    return Promise.reject(new Error('CLOUD_UNSUPPORTED'));
  }
  return new Promise((resolve, reject) => {
    const proceed = (loginResult = {}) => {
      callFunction('login', Object.assign({}, profile, {
        profile,
        code: loginResult.code || '',
      })).then(resolve).catch(reject);
    };
    if (typeof wx.login === 'function') {
      wx.login({
        success: proceed,
        fail: (err) => {
          const error = new Error('WX_LOGIN_FAILED');
          error.code = 'WX_LOGIN_FAILED';
          error.cause = err;
          reject(error);
        },
      });
    } else {
      proceed();
    }
  });
}
