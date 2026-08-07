const http = require('http');
const { URL } = require('url');

const { AdminService } = require('./admin-service');
const { AuthService } = require('./auth-service');
const { readConfig } = require('./config');
const { createDatabase } = require('./db');
const { LocalGameService } = require('./game-service');
const room = require('./game/room');
const { createSocketLayer } = require('./socket-server');
const { verifyAppToken } = require('./tokens');

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) reject(new Error('BODY_TOO_LARGE'));
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('BODY_JSON_INVALID'));
      }
    });
    req.on('error', reject);
  });
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

function truncateString(value, max = 500) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function sanitizeLogValue(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return truncateString(value);
  if (depth >= 5) return '[depth-limit]';
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeLogValue(item, depth + 1));
  if (typeof value !== 'object') return truncateString(value);
  const result = {};
  Object.keys(value).slice(0, 80).forEach((key) => {
    if (/token|secret|authorization|password/i.test(key)) {
      result[key] = '[redacted]';
      return;
    }
    result[key] = sanitizeLogValue(value[key], depth + 1);
  });
  return result;
}

function requestIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '';
}

function logClientDiagnostics(logger, req, body = {}) {
  const events = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
  const detail = sanitizeLogValue({
    sessionId: body.sessionId || '',
    source: body.source || 'client',
    count: events.length,
    ip: requestIp(req),
    userAgent: req.headers['user-agent'] || '',
    events,
  });
  const target = logger && typeof logger.info === 'function' ? logger : console;
  if (target === console) {
    target.info('[client-log] render-diagnostics', JSON.stringify(detail));
  } else {
    target.info('[client-log] render-diagnostics', detail);
  }
  return { ok: true, accepted: events.length };
}

const ADMIN_COLLECTIONS = [
  { name: 'rooms', description: '权威房间状态和玩家手牌' },
  { name: 'roomStates', description: '牌桌公共状态快照' },
  { name: 'matchQueue', description: '快速匹配等待队列' },
];

function adminCollectionNames() {
  return ADMIN_COLLECTIONS.map((item) => item.name);
}

async function adminStatus(db) {
  const collections = await Promise.all(ADMIN_COLLECTIONS.map(async (item) => ({
    name: item.name,
    description: item.description,
    count: await db.collection(item.name).countDocuments({}),
  })));
  return { ok: true, collections };
}

async function clearAdminCollection(db, name) {
  const allowed = adminCollectionNames();
  if (allowed.indexOf(name) < 0) {
    const error = new Error('ADMIN_COLLECTION_NOT_ALLOWED');
    error.code = 'ADMIN_COLLECTION_NOT_ALLOWED';
    throw error;
  }
  const res = await db.collection(name).deleteMany({});
  return res.deletedCount || 0;
}

async function adminClear(db, body = {}) {
  if (body.confirm !== 'CLEAR') return { ok: false, error: 'ADMIN_CONFIRM_REQUIRED' };
  const target = body.collection || '';
  const names = target === 'all' ? adminCollectionNames() : [target];
  const deleted = {};
  for (const name of names) {
    deleted[name] = await clearAdminCollection(db, name);
  }
  return { ok: true, deleted };
}

async function verifyAdminRequest(req, admin) {
  const verified = await admin.verifySession(bearerToken(req));
  if (!verified.ok) return { ok: false, status: 401, error: verified.error || 'ADMIN_UNAUTHORIZED' };
  return verified;
}

function adminErrorStatus(error) {
  if (error === 'ADMIN_FORBIDDEN') return 403;
  if (error === 'ADMIN_UNAUTHORIZED') return 401;
  return 200;
}

async function createBackendServer(options = {}) {
  const config = options.config || readConfig();
  const db = options.db || await createDatabase(config);
  const admin = options.admin || new AdminService({ config, db });
  await admin.ensureInitialAdmin();
  const auth = options.auth || new AuthService({ config, db, fetch: options.fetch });
  const game = options.game || new LocalGameService({ db });
  const logger = options.logger || console;

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {});
      return;
    }
    if (req.method === 'GET' && parsedUrl.pathname === '/healthz') {
      sendJson(res, 200, { ok: true, service: 'huapai-backend' });
      return;
    }
    if (parsedUrl.pathname === '/api/client-log' && req.method === 'POST') {
      try {
        const body = await readBody(req);
        sendJson(res, 200, logClientDiagnostics(logger, req, body));
      } catch (err) {
        sendJson(res, 200, { ok: false, error: err.code || err.message || 'CLIENT_LOG_FAILED' });
      }
      return;
    }
    if (parsedUrl.pathname === '/api/admin/login' && req.method === 'POST') {
      try {
        const body = await readBody(req);
        const result = await admin.login(body);
        sendJson(res, result.ok ? 200 : 401, result);
      } catch (err) {
        sendJson(res, 200, { ok: false, error: err.code || err.message || 'ADMIN_LOGIN_FAILED', message: err.message });
      }
      return;
    }
    if (parsedUrl.pathname === '/api/admin/logout' && req.method === 'POST') {
      sendJson(res, 200, admin.logout());
      return;
    }
    if (parsedUrl.pathname === '/api/admin/me' && req.method === 'GET') {
      const verified = await verifyAdminRequest(req, admin);
      if (!verified.ok) {
        sendJson(res, verified.status, { ok: false, error: verified.error });
        return;
      }
      sendJson(res, 200, { ok: true, admin: verified.admin });
      return;
    }
    if (parsedUrl.pathname === '/api/admin/admins' && req.method === 'GET') {
      const verified = await verifyAdminRequest(req, admin);
      if (!verified.ok) {
        sendJson(res, verified.status, { ok: false, error: verified.error });
        return;
      }
      try {
        sendJson(res, 200, await admin.listAdmins(verified.admin));
      } catch (err) {
        const error = err.code || err.message || 'ADMIN_LIST_FAILED';
        sendJson(res, adminErrorStatus(error), { ok: false, error, message: err.message });
      }
      return;
    }
    if (parsedUrl.pathname === '/api/admin/admins' && req.method === 'POST') {
      const verified = await verifyAdminRequest(req, admin);
      if (!verified.ok) {
        sendJson(res, verified.status, { ok: false, error: verified.error });
        return;
      }
      try {
        const body = await readBody(req);
        sendJson(res, 200, await admin.createAdmin(verified.admin, body));
      } catch (err) {
        const error = err.code || err.message || 'ADMIN_CREATE_FAILED';
        sendJson(res, adminErrorStatus(error), { ok: false, error, message: err.message });
      }
      return;
    }
    if (parsedUrl.pathname === '/api/admin/admins/disable' && req.method === 'POST') {
      const verified = await verifyAdminRequest(req, admin);
      if (!verified.ok) {
        sendJson(res, verified.status, { ok: false, error: verified.error });
        return;
      }
      try {
        const body = await readBody(req);
        sendJson(res, 200, await admin.disableAdmin(verified.admin, body.username));
      } catch (err) {
        const error = err.code || err.message || 'ADMIN_DISABLE_FAILED';
        sendJson(res, adminErrorStatus(error), { ok: false, error, message: err.message });
      }
      return;
    }
    if (parsedUrl.pathname === '/api/admin/status' && req.method === 'GET') {
      const verified = await verifyAdminRequest(req, admin);
      if (!verified.ok) {
        sendJson(res, verified.status, { ok: false, error: verified.error });
        return;
      }
      try {
        sendJson(res, 200, await adminStatus(db));
      } catch (err) {
        sendJson(res, 200, { ok: false, error: err.code || err.message || 'ADMIN_STATUS_FAILED', message: err.message });
      }
      return;
    }
    if (parsedUrl.pathname === '/api/admin/clear' && req.method === 'POST') {
      const verified = await verifyAdminRequest(req, admin);
      if (!verified.ok) {
        sendJson(res, verified.status, { ok: false, error: verified.error });
        return;
      }
      try {
        const body = await readBody(req);
        sendJson(res, 200, await adminClear(db, body));
      } catch (err) {
        sendJson(res, 200, { ok: false, error: err.code || err.message || 'ADMIN_CLEAR_FAILED', message: err.message });
      }
      return;
    }
    if (parsedUrl.pathname === '/api/admin/rooms' && req.method === 'GET') {
      const verified = await verifyAdminRequest(req, admin);
      if (!verified.ok) {
        sendJson(res, verified.status, { ok: false, error: verified.error });
        return;
      }
      try {
        sendJson(res, 200, { ok: true, rooms: await room.listRoomsForAdmin(db) });
      } catch (err) {
        sendJson(res, 200, { ok: false, error: err.code || err.message || 'ADMIN_ROOMS_LIST_FAILED', message: err.message });
      }
      return;
    }
    if (parsedUrl.pathname === '/api/admin/rooms/close' && req.method === 'POST') {
      const verified = await verifyAdminRequest(req, admin);
      if (!verified.ok) {
        sendJson(res, verified.status, { ok: false, error: verified.error });
        return;
      }
      try {
        const body = await readBody(req);
        sendJson(res, 200, await room.closeRoomForAdmin(db, body.roomId));
      } catch (err) {
        sendJson(res, 200, { ok: false, error: err.code || err.message || 'ADMIN_ROOM_CLOSE_FAILED', message: err.message });
      }
      return;
    }
    if (parsedUrl.pathname === '/api/admin/users' && req.method === 'GET') {
      const verified = await verifyAdminRequest(req, admin);
      if (!verified.ok) {
        sendJson(res, verified.status, { ok: false, error: verified.error });
        return;
      }
      try {
        sendJson(res, 200, { ok: true, users: await auth.listUsersForAdmin() });
      } catch (err) {
        sendJson(res, 200, { ok: false, error: err.code || err.message || 'ADMIN_USERS_LIST_FAILED', message: err.message });
      }
      return;
    }
    if (parsedUrl.pathname === '/api/admin/users/delete' && req.method === 'POST') {
      const verified = await verifyAdminRequest(req, admin);
      if (!verified.ok) {
        sendJson(res, verified.status, { ok: false, error: verified.error });
        return;
      }
      try {
        const body = await readBody(req);
        sendJson(res, 200, await auth.deleteUsersForAdmin(body.openids || body.openid));
      } catch (err) {
        sendJson(res, 200, { ok: false, error: err.code || err.message || 'ADMIN_USER_DELETE_FAILED', message: err.message });
      }
      return;
    }
    if (req.method === 'POST' && parsedUrl.pathname === '/api/auth/login') {
      try {
        const body = await readBody(req);
        sendJson(res, 200, await auth.login(body));
      } catch (err) {
        sendJson(res, 200, { ok: false, error: err.code || err.message || 'LOGIN_FAILED', message: err.message });
      }
      return;
    }
    if (req.method === 'POST' && parsedUrl.pathname === '/api/game') {
      const verified = verifyAppToken(bearerToken(req), config);
      if (!verified.ok) {
        sendJson(res, 401, { ok: false, error: verified.error });
        return;
      }
      try {
        const body = await readBody(req);
        sendJson(res, 200, await game.callAction(body.action, verified.openid, body));
      } catch (err) {
        sendJson(res, 200, { ok: false, error: err.code || err.message || 'GAME_REQUEST_FAILED', message: err.message });
      }
      return;
    }
    sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });
  });

  const socket = createSocketLayer({ server, config, game, logger });
  return {
    server,
    config,
    db,
    admin,
    auth,
    game,
    socket,
    listen(port = config.port) {
      return new Promise((resolve) => server.listen(port, () => resolve(server)));
    },
    close() {
      socket.close();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

module.exports = {
  createBackendServer,
  readBody,
  adminStatus,
  adminClear,
  verifyAdminRequest,
  logClientDiagnostics,
};
