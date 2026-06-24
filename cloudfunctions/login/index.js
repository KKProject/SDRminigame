const cloud = require('wx-server-sdk');
const { issueSocketToken } = require('./socket-token');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const USERS = 'users';
const REQUIRED_COLLECTIONS = ['users', 'rooms', 'matchQueue', 'roomStates'];

function socketEndpoint() {
  if (socketService()) return '';
  return process.env.SOCKET_URL || process.env.WEBSOCKET_URL || '';
}

function socketService() {
  return process.env.SOCKET_SERVICE || process.env.WEBSOCKET_SERVICE || '';
}

function socketEnv() {
  return process.env.SOCKET_ENV
    || process.env.TCB_ENV
    || process.env.CLOUD_ENV
    || process.env.WX_CLOUD_ENV
    || '';
}

function socketPath() {
  const path = process.env.SOCKET_PATH || process.env.WEBSOCKET_PATH || '/';
  return path.charAt(0) === '/' ? path : `/${path}`;
}

function isCollectionMissingError(err) {
  const code = err && (err.errCode || err.code);
  const message = String((err && (err.errMsg || err.message)) || '').toLowerCase();
  return code === -502005 || message.includes('collection not exist') || message.includes('collection not exists');
}

async function ensureCollections() {
  for (const name of REQUIRED_COLLECTIONS) {
  try {
      await db.collection(name).limit(1).get();
    } catch (err) {
      if (!isCollectionMissingError(err)) throw err;
      try {
        await db.createCollection(name);
      } catch (createErr) {
        // 多个首次登录并发创建时，其他请求可能已经完成创建。
        try {
          await db.collection(name).limit(1).get();
        } catch (verifyErr) {
          throw createErr;
        }
      }
    }
  }
}

/**
 * 登录云函数。
 * 由 wx-server-sdk 自动注入调用者身份（OPENID），无需客户端传 code。
 * 入参（可选）：{ nickName, avatarUrl } —— 客户端拿到资料后可一并写入。
 * 返回：{ openid, user }
 */
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { ok: false, error: 'NO_OPENID' };
  }

  try {
    await ensureCollections();

    const now = Date.now();
    const profile = {};
    const inputProfile = event && event.profile && typeof event.profile === 'object'
      ? event.profile
      : event || {};
    if (typeof inputProfile.nickName === 'string' && inputProfile.nickName) {
      profile.nickName = inputProfile.nickName.trim().slice(0, 24);
    }
    if (typeof inputProfile.avatarUrl === 'string' && inputProfile.avatarUrl) {
      profile.avatarUrl = inputProfile.avatarUrl.trim().slice(0, 500);
    }

    const userRef = db.collection(USERS).doc(OPENID);
    let existing = null;
    try {
      const snapshot = await userRef.get();
      existing = snapshot.data;
    } catch (err) {
      existing = null;
    }

    if (existing) {
      await userRef.update({
        data: {
          ...profile,
          lastLoginAt: now,
        },
      });
    } else {
      await userRef.set({
        data: {
          openid: OPENID,
          nickName: profile.nickName || '',
          avatarUrl: profile.avatarUrl || '',
          totalScore: 0,
          createdAt: now,
          lastLoginAt: now,
        },
      });
    }

    const fresh = await userRef.get();
    const socketToken = issueSocketToken(OPENID);
    return {
      ok: true,
      openid: OPENID,
      user: fresh.data,
      receivedProfile: profile,
      socket: {
        url: socketEndpoint(),
        env: socketEnv(),
        service: socketService(),
        path: socketPath(),
        token: socketToken.token,
        expiresAt: socketToken.expiresAt,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: 'LOGIN_STORAGE_ERROR',
      message: String((err && (err.errMsg || err.message)) || err || ''),
    };
  }
};

exports.ensureCollections = ensureCollections;
exports.isCollectionMissingError = isCollectionMissingError;
exports.issueSocketToken = issueSocketToken;
exports.socketEndpoint = socketEndpoint;
exports.socketEnv = socketEnv;
exports.socketService = socketService;
exports.socketPath = socketPath;
