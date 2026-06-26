const http = require('http');
const { URL } = require('url');

const { adminPageHtml } = require('./admin-page');
const { AuthService } = require('./auth-service');
const { readConfig } = require('./config');
const { createDatabase } = require('./db');
const { LocalGameService } = require('./game-service');
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

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(html);
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

function adminToken(req, parsedUrl) {
  return bearerToken(req) || (parsedUrl && parsedUrl.searchParams.get('token')) || '';
}

function verifyAdmin(req, parsedUrl, config) {
  if (!config.adminToken) return { ok: false, status: 503, error: 'ADMIN_DISABLED' };
  if (adminToken(req, parsedUrl) !== config.adminToken) return { ok: false, status: 401, error: 'ADMIN_UNAUTHORIZED' };
  return { ok: true };
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

async function createBackendServer(options = {}) {
  const config = options.config || readConfig();
  const db = options.db || await createDatabase(config);
  const auth = options.auth || new AuthService({ config, db, fetch: options.fetch });
  const game = options.game || new LocalGameService({ db });

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
    if (req.method === 'GET' && parsedUrl.pathname === '/admin') {
      const verified = verifyAdmin(req, parsedUrl, config);
      if (!verified.ok) {
        sendHtml(res, verified.status, `<h1>${verified.error}</h1>`);
        return;
      }
      sendHtml(res, 200, adminPageHtml());
      return;
    }
    if (parsedUrl.pathname === '/api/admin/status' && req.method === 'GET') {
      const verified = verifyAdmin(req, parsedUrl, config);
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
      const verified = verifyAdmin(req, parsedUrl, config);
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

  const socket = createSocketLayer({ server, config, game });
  return {
    server,
    config,
    db,
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
};
