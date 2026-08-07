const { issueAppToken, issueSocketToken } = require('./tokens');
const { exchangeCodeForSession } = require('./wechat');

const USERS = 'users';

function normalizeProfile(input = {}) {
  const profile = input && input.profile && typeof input.profile === 'object' ? input.profile : input;
  return {
    nickName: typeof profile.nickName === 'string' && profile.nickName
      ? profile.nickName.trim().slice(0, 24)
      : '',
    avatarUrl: typeof profile.avatarUrl === 'string' && profile.avatarUrl
      ? profile.avatarUrl.trim().slice(0, 500)
      : '',
  };
}

function profileUpdateData(profile = {}, now = Date.now()) {
  const data = { lastLoginAt: now };
  if (profile.nickName) data.nickName = profile.nickName;
  if (profile.avatarUrl) data.avatarUrl = profile.avatarUrl;
  return data;
}

const ADMIN_USER_LIST_LIMIT = 500;

/** 后台管理：仅保留展示所需字段，不暴露内部记录细节 */
function sanitizeUserForAdmin(user) {
  return {
    openid: user.openid || user._id || '',
    nickName: user.nickName || '',
    avatarUrl: user.avatarUrl || '',
    totalScore: Number(user.totalScore) || 0,
    createdAt: user.createdAt || 0,
    lastLoginAt: user.lastLoginAt || 0,
  };
}

class AuthService {
  constructor({ config, db, fetch } = {}) {
    this.config = config || {};
    this.db = db;
    this.fetch = fetch || globalThis.fetch;
  }

  async login(event = {}) {
    const session = await exchangeCodeForSession(event.code || '', this.config, this.fetch);
    const openid = session.openid;
    const now = Date.now();
    const profile = normalizeProfile(event);
    const userRef = this.db.collection(USERS).doc(openid);
    let existing = null;
    try {
      existing = (await userRef.get()).data;
    } catch (err) {
      existing = null;
    }
    if (existing) {
      await userRef.update({ data: profileUpdateData(profile, now) });
    } else {
      await userRef.set({
        data: {
          openid,
          nickName: profile.nickName || '',
          avatarUrl: profile.avatarUrl || '',
          totalScore: 0,
          createdAt: now,
          lastLoginAt: now,
        },
      });
    }
    const user = (await userRef.get()).data;
    const appToken = issueAppToken(openid, this.config);
    const socketToken = issueSocketToken(openid, this.config);
    return {
      ok: true,
      openid,
      user,
      receivedProfile: profile,
      token: appToken.token,
      tokenExpiresAt: appToken.expiresAt,
      apiBaseUrl: this.config.apiBaseUrl || '',
      socket: {
        url: this.config.socketUrl || '',
        token: socketToken.token,
        expiresAt: socketToken.expiresAt,
      },
    };
  }

  /** 后台管理：列出玩家账号，按最近登录时间倒序，最多 ADMIN_USER_LIST_LIMIT 条 */
  async listUsersForAdmin() {
    const snap = await this.db.collection(USERS)
      .where({})
      .orderBy('lastLoginAt', 'desc')
      .limit(ADMIN_USER_LIST_LIMIT)
      .get();
    return (snap.data || []).map(sanitizeUserForAdmin);
  }

  /**
   * 后台管理：永久删除一个或多个玩家档案（仅 users 集合，不联动房间/匹配队列数据）。
   * @param {string|string[]} openidOrOpenids - 单个 openid，或用于批量删除的 openid 数组
   * @returns {{ok:true, deleted:string[], notFound:string[]} | {ok:false, error:string, notFound?:string[]}}
   */
  async deleteUsersForAdmin(openidOrOpenids) {
    const list = Array.isArray(openidOrOpenids) ? openidOrOpenids : [openidOrOpenids];
    const ids = Array.from(new Set(list.map((value) => String(value || '').trim()).filter(Boolean)));
    if (!ids.length) return { ok: false, error: 'ADMIN_USER_ID_REQUIRED' };

    const deleted = [];
    const notFound = [];
    for (const id of ids) {
      const userRef = this.db.collection(USERS).doc(id);
      let existing = null;
      try {
        existing = (await userRef.get()).data;
      } catch (err) {
        if (err.message !== 'DOCUMENT_NOT_FOUND') throw err;
      }
      if (!existing) {
        notFound.push(id);
        continue;
      }
      await userRef.remove();
      deleted.push(id);
    }
    if (!deleted.length) return { ok: false, error: 'ADMIN_USER_NOT_FOUND', notFound };
    return { ok: true, deleted, notFound };
  }
}

module.exports = {
  AuthService,
  normalizeProfile,
  profileUpdateData,
};
