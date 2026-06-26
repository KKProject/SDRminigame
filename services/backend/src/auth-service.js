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
      await userRef.update({ data: Object.assign({}, profile, { lastLoginAt: now }) });
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
}

module.exports = {
  AuthService,
  normalizeProfile,
};
