const crypto = require('crypto');

const { issueToken, verifyToken } = require('./tokens');

const DEFAULT_ADMIN_ROLE = 'superadmin';
const ADMIN_COLLECTION = 'adminUsers';
const PASSWORD_ITERATIONS = 100000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = 'sha256';
const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function normalizeUsername(username) {
  return String(username || '').trim();
}

function safeAdmin(user) {
  if (!user) return null;
  return {
    username: user.username || user._id,
    role: user.role || 'admin',
    enabled: user.enabled !== false,
    defaultAdmin: Boolean(user.defaultAdmin),
    createdAt: user.createdAt || '',
    updatedAt: user.updatedAt || '',
    createdBy: user.createdBy || '',
    lastLoginAt: user.lastLoginAt || '',
  };
}

function validateUsername(username) {
  if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) {
    const error = new Error('ADMIN_USERNAME_INVALID');
    error.code = 'ADMIN_USERNAME_INVALID';
    throw error;
  }
}

function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 6 || value.length > 128) {
    const error = new Error('ADMIN_PASSWORD_INVALID');
    error.code = 'ADMIN_PASSWORD_INVALID';
    throw error;
  }
}

function validateRole(role) {
  const value = role || 'admin';
  if (value !== 'admin' && value !== 'superadmin') {
    const error = new Error('ADMIN_ROLE_INVALID');
    error.code = 'ADMIN_ROLE_INVALID';
    throw error;
  }
  return value;
}

function initialAdminConfigError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(
    String(password || ''),
    salt,
    PASSWORD_ITERATIONS,
    PASSWORD_KEY_LENGTH,
    PASSWORD_DIGEST,
  ).toString('hex');
  return { salt, passwordHash: hash };
}

function timingSafeHexEqual(actual, expected) {
  const actualBuffer = Buffer.from(String(actual || ''), 'hex');
  const expectedBuffer = Buffer.from(String(expected || ''), 'hex');
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function verifyPassword(password, user) {
  if (!user || !user.salt || !user.passwordHash) return false;
  const next = hashPassword(password, user.salt);
  return timingSafeHexEqual(next.passwordHash, user.passwordHash);
}

class AdminService {
  constructor({ config, db }) {
    this.config = config || {};
    this.db = db;
  }

  collection() {
    return this.db.collection(ADMIN_COLLECTION);
  }

  sessionSecret() {
    return this.config.adminSessionSecret
      || this.config.appTokenSecret
      || this.config.adminToken
      || 'huapai-dev-admin-secret';
  }

  sessionTtlMs() {
    return Number(this.config.adminSessionTtlMs || DEFAULT_SESSION_TTL_MS);
  }

  async getAdmin(username) {
    const id = normalizeUsername(username);
    if (!id) return null;
    try {
      const snap = await this.collection().doc(id).get();
      return snap.data;
    } catch (err) {
      if (err.message === 'DOCUMENT_NOT_FOUND') return null;
      throw err;
    }
  }

  async ensureInitialAdmin() {
    const existing = await this.collection().limit(1).get();
    if (existing.data && existing.data.length) return safeAdmin(existing.data[0]);

    const username = normalizeUsername(this.config.initialAdminUsername);
    const initialPassword = String(this.config.initialAdminPassword || '');
    if (!username) throw initialAdminConfigError('INITIAL_ADMIN_USERNAME_REQUIRED');
    if (!initialPassword) throw initialAdminConfigError('INITIAL_ADMIN_PASSWORD_REQUIRED');
    try {
      validateUsername(username);
    } catch (err) {
      throw initialAdminConfigError('INITIAL_ADMIN_USERNAME_INVALID');
    }
    try {
      validatePassword(initialPassword);
    } catch (err) {
      throw initialAdminConfigError('INITIAL_ADMIN_PASSWORD_INVALID');
    }

    const stampedAt = nowIso();
    const password = hashPassword(initialPassword);
    const data = {
      username,
      role: DEFAULT_ADMIN_ROLE,
      enabled: true,
      defaultAdmin: true,
      createdAt: stampedAt,
      updatedAt: stampedAt,
      createdBy: 'system',
      salt: password.salt,
      passwordHash: password.passwordHash,
    };
    await this.collection().doc(username).set({ data });
    return safeAdmin(data);
  }

  issueSession(admin, options = {}) {
    return issueToken(admin.username, {
      type: 'admin',
      secret: this.sessionSecret(),
      ttlMs: options.ttlMs || this.sessionTtlMs(),
      now: options.now,
      nonce: options.nonce,
    });
  }

  async login(body = {}) {
    const username = normalizeUsername(body.username);
    const password = String(body.password || '');
    const user = await this.getAdmin(username);
    if (!user || user.enabled === false || !verifyPassword(password, user)) {
      return { ok: false, error: 'ADMIN_LOGIN_FAILED' };
    }
    const stampedAt = nowIso();
    await this.collection().doc(username).update({ data: { lastLoginAt: stampedAt, updatedAt: stampedAt } });
    const updated = Object.assign({}, user, { lastLoginAt: stampedAt, updatedAt: stampedAt });
    const session = this.issueSession(updated);
    return { ok: true, token: session.token, expiresAt: session.expiresAt, admin: safeAdmin(updated) };
  }

  async verifySession(token, options = {}) {
    const verified = verifyToken(token, Object.assign({}, options, {
      type: 'admin',
      secret: this.sessionSecret(),
    }));
    if (!verified.ok) return { ok: false, error: verified.error || 'ADMIN_UNAUTHORIZED' };
    const user = await this.getAdmin(verified.openid);
    if (!user || user.enabled === false) return { ok: false, error: 'ADMIN_UNAUTHORIZED' };
    return { ok: true, admin: safeAdmin(user), payload: verified.payload };
  }

  requireSuperAdmin(actor) {
    if (!actor || actor.role !== 'superadmin') {
      const error = new Error('ADMIN_FORBIDDEN');
      error.code = 'ADMIN_FORBIDDEN';
      throw error;
    }
  }

  async listAdmins(actor) {
    this.requireSuperAdmin(actor);
    const snap = await this.collection().limit(1000).get();
    const admins = (snap.data || []).map(safeAdmin).sort((a, b) => a.username.localeCompare(b.username));
    return { ok: true, admins };
  }

  async createAdmin(actor, body = {}) {
    this.requireSuperAdmin(actor);
    const username = normalizeUsername(body.username);
    const password = String(body.password || '');
    const role = validateRole(body.role || 'admin');
    validateUsername(username);
    validatePassword(password);
    const existing = await this.getAdmin(username);
    if (existing) return { ok: false, error: 'ADMIN_ALREADY_EXISTS' };
    const stampedAt = nowIso();
    const hashed = hashPassword(password);
    const data = {
      username,
      role,
      enabled: true,
      defaultAdmin: false,
      createdAt: stampedAt,
      updatedAt: stampedAt,
      createdBy: actor.username,
      salt: hashed.salt,
      passwordHash: hashed.passwordHash,
    };
    await this.collection().doc(username).set({ data });
    return { ok: true, admin: safeAdmin(data) };
  }

  async disableAdmin(actor, username) {
    this.requireSuperAdmin(actor);
    const id = normalizeUsername(username);
    const existing = await this.getAdmin(id);
    if (!existing) return { ok: false, error: 'ADMIN_NOT_FOUND' };
    if (existing.defaultAdmin) return { ok: false, error: 'ADMIN_DEFAULT_CANNOT_DISABLE' };
    if (id === actor.username) return { ok: false, error: 'ADMIN_SELF_CANNOT_DISABLE' };
    const stampedAt = nowIso();
    await this.collection().doc(id).update({ data: { enabled: false, updatedAt: stampedAt } });
    return { ok: true, admin: safeAdmin(Object.assign({}, existing, { enabled: false, updatedAt: stampedAt })) };
  }

  logout() {
    return { ok: true };
  }
}

module.exports = {
  ADMIN_COLLECTION,
  AdminService,
  hashPassword,
  verifyPassword,
};
