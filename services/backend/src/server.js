const http = require('http');

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

async function createBackendServer(options = {}) {
  const config = options.config || readConfig();
  const db = options.db || await createDatabase(config);
  const auth = options.auth || new AuthService({ config, db, fetch: options.fetch });
  const game = options.game || new LocalGameService({ db });

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {});
      return;
    }
    if (req.method === 'GET' && req.url === '/healthz') {
      sendJson(res, 200, { ok: true, service: 'huapai-backend' });
      return;
    }
    if (req.method === 'POST' && req.url === '/api/auth/login') {
      try {
        const body = await readBody(req);
        sendJson(res, 200, await auth.login(body));
      } catch (err) {
        sendJson(res, 200, { ok: false, error: err.code || err.message || 'LOGIN_FAILED', message: err.message });
      }
      return;
    }
    if (req.method === 'POST' && req.url === '/api/game') {
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
};
