const http = require('http');
const { URL } = require('url');
const { WebSocketServer } = require('ws');

const { readConfig } = require('./config');
const { verifySocketToken } = require('./token');
const { ConnectionRegistry } = require('./connections');
const { envelope, failure, normalizeEnvelope, success } = require('./protocol');
const { GameService } = require('./game-service');
const { originAllowed } = require('./origin');

function installProcessErrorHandlers() {
  if (process.__huapaiSocketErrorHandlersInstalled) return;
  process.__huapaiSocketErrorHandlersInstalled = true;
  process.on('unhandledRejection', (err) => {
    console.error('[socket] unhandled rejection', {
      code: errorCode(err, 'UNHANDLED_REJECTION'),
      message: String((err && (err.message || err.errMsg)) || err || ''),
    });
  });
  process.on('uncaughtException', (err) => {
    console.error('[socket] uncaught exception', {
      code: errorCode(err, 'UNCAUGHT_EXCEPTION'),
      message: String((err && (err.message || err.errMsg)) || err || ''),
    });
  });
}

function tokenFromRequest(req) {
  return tokenInfoFromRequest(req).token;
}

function tokenInfoFromRequest(req) {
  const url = new URL(req.url || '/', 'http://localhost');
  const queryToken = url.searchParams.get('token');
  if (queryToken) return { token: queryToken, source: 'query', pathname: url.pathname };
  const header = req.headers.authorization || '';
  if (header.toLowerCase().startsWith('bearer ')) {
    return { token: header.slice(7).trim(), source: 'authorization', pathname: url.pathname };
  }
  return { token: '', source: '', pathname: url.pathname };
}

function send(connection, message) {
  if (!connection || !connection.ws || connection.ws.readyState !== 1) return false;
  connection.ws.send(message);
  return true;
}

function shortOpenid(openid = '') {
  const value = String(openid || '');
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function timeoutAfter(ms, code) {
  return new Promise((_, reject) => {
    setTimeout(() => {
      const error = new Error(code);
      error.code = code;
      reject(error);
    }, ms);
  });
}

function withTimeout(promise, ms, code) {
  if (!ms || ms <= 0) return promise;
  return Promise.race([promise, timeoutAfter(ms, code)]);
}

function snapshotPayload(res) {
  return {
    ok: Boolean(res && res.ok),
    roomId: res && res.roomId,
    version: res && res.version,
    yourSeat: res && res.yourSeat,
    status: res && res.status,
    settings: res && res.settings,
    public: res && res.public,
    private: res && res.private,
    animation: res && res.animation,
  };
}

function errorCode(err, fallback = 'REQUEST_FAILED') {
  return (err && (err.code || err.error || err.message)) || fallback;
}

function createSocketServer(options = {}) {
  const config = options.config || readConfig();
  const registry = options.registry || new ConnectionRegistry();
  const game = options.game || new GameService(config);
  const server = options.server || http.createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (!originAllowed(req, config.allowedOrigins)) {
      console.warn('[socket] upgrade rejected', {
        code: 'ORIGIN_FORBIDDEN',
        origin: req.headers.origin || '',
        url: req.url || '',
      });
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    const tokenInfo = tokenInfoFromRequest(req);
    const verified = verifySocketToken(tokenInfo.token, { secret: config.tokenSecret });
    if (!verified.ok) {
      console.warn('[socket] upgrade rejected', {
        code: verified.error,
        tokenSource: tokenInfo.source || '',
        hasToken: Boolean(tokenInfo.token),
        path: tokenInfo.pathname,
      });
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    console.info('[socket] upgrade accepted', {
      openid: shortOpenid(verified.openid),
      tokenSource: tokenInfo.source,
      path: tokenInfo.pathname,
    });
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.openid = verified.openid;
      wss.emit('connection', ws, req);
    });
  });

  async function broadcastSnapshot(roomId, res) {
    const connections = registry.roomConnections(roomId);
    await Promise.all(connections.map(async (connection) => {
      const fresh = await game.pull(connection.openid, roomId).catch(() => null);
      const payload = snapshotPayload(fresh && fresh.ok ? fresh : res);
      send(connection, envelope('snapshot', {
        roomId,
        version: payload.version,
        eventSeq: payload.animation && payload.animation.latestEventSeq,
        payload,
      }));
    }));
  }

  async function handleMessage(connection, request) {
    const startedAt = Date.now();
    console.info('[socket] message received', {
      type: request.type,
      roomId: request.roomId || '',
      requestId: request.requestId || '',
      openid: shortOpenid(connection.openid),
    });
    if (request.type === 'ping' || request.type === 'heartbeat') {
      registry.touch(connection);
      if (request.roomId) {
        const res = await game.heartbeat(connection.openid, request.roomId);
        return success('heartbeat:result', request, res, { version: res && res.version });
      }
      return success('pong', request, { now: Date.now() });
    }

    if (request.type === 'subscribe') {
      console.info('[socket] subscribe start', {
        roomId: request.roomId,
        openid: shortOpenid(connection.openid),
        version: request.version,
        eventSeq: request.eventSeq,
      });
      const res = await game.pull(connection.openid, request.roomId);
      console.info('[socket] subscribe pull done', {
        roomId: request.roomId,
        openid: shortOpenid(connection.openid),
        ok: Boolean(res && res.ok),
        error: res && res.error,
        statusCode: res && res.statusCode,
        message: res && res.message ? String(res.message).slice(0, 300) : '',
        elapsedMs: Date.now() - startedAt,
      });
      if (!res || !res.ok || typeof res.yourSeat !== 'number' || res.yourSeat < 0) {
        return failure('subscribe:result', request, (res && res.error) || 'NOT_IN_ROOM');
      }
      registry.subscribe(connection, request.roomId);
      game.setConnection(connection.openid, request.roomId, true)
        .then(async (onlineRes) => {
          console.info('[socket] subscribe connection marked online', {
            roomId: request.roomId,
            openid: shortOpenid(connection.openid),
            ok: Boolean(onlineRes && onlineRes.ok),
            error: onlineRes && onlineRes.error,
            elapsedMs: Date.now() - startedAt,
          });
          if (onlineRes && onlineRes.ok) await broadcastSnapshot(request.roomId, onlineRes);
        })
        .catch((err) => {
          console.error('[socket] subscribe online mark failed', {
            roomId: request.roomId,
            openid: shortOpenid(connection.openid),
            code: (err && err.code) || (err && err.message) || 'SET_CONNECTION_FAILED',
            elapsedMs: Date.now() - startedAt,
          });
        });
      return success('subscribe:result', request, snapshotPayload(res), {
        version: res.version,
        eventSeq: res.animation && res.animation.latestEventSeq,
      });
    }

    const handlers = {
      pull: () => game.pull(connection.openid, request.roomId),
      op: () => game.op(connection.openid, request),
      ackAnimation: () => game.ackAnimation(connection.openid, request),
      setReady: () => game.setReady(connection.openid, request),
      startRound: () => game.startRound(connection.openid, request),
    };
    const handler = handlers[request.type];
    if (!handler) return failure('error', request, 'UNKNOWN_MESSAGE_TYPE');
    const res = await handler();
    const responseType = `${request.type}:result`;
    const payload = snapshotPayload(res);
    if (res && res.ok && request.roomId && (res.public || res.animation)) await broadcastSnapshot(request.roomId, res);
    if (!res || !res.ok) return failure(responseType, request, (res && res.error) || 'REQUEST_FAILED', { version: res && res.version });
    return success(responseType, request, Object.assign({}, res, payload), {
      version: res.version,
      eventSeq: res.animation && res.animation.latestEventSeq,
    });
  }

  wss.on('connection', (ws) => {
    const connection = registry.add(ws, ws.openid);
    ws.send(envelope('connected', { payload: { openid: connection.openid, connectionId: connection.id } }));
    ws.on('message', async (raw) => {
      const parsed = normalizeEnvelope(raw);
      if (!parsed.ok) {
        send(connection, failure('error', {}, parsed.error));
        return;
      }
      try {
        const response = await withTimeout(
          handleMessage(connection, parsed.value),
          config.handlerTimeoutMs,
          'HANDLER_TIMEOUT'
        );
        send(connection, response);
      } catch (err) {
        const code = errorCode(err, 'HANDLER_ERROR');
        console.error('[socket] message handler failed', {
          type: parsed.value && parsed.value.type,
          roomId: parsed.value && parsed.value.roomId,
          requestId: parsed.value && parsed.value.requestId,
          openid: shortOpenid(connection.openid),
          code,
        });
        send(connection, failure(`${parsed.value.type || 'message'}:result`, parsed.value, code));
      }
    });
    const closeConnection = async () => {
      const roomId = connection.roomId;
      const openid = connection.openid;
      registry.remove(connection);
      if (!roomId || registry.hasRoomConnection(openid, roomId)) return;
      const res = await game.setConnection(openid, roomId, false).catch(() => null);
      if (res && res.ok) await broadcastSnapshot(roomId, res);
    };
    ws.on('close', () => { closeConnection().catch(() => {}); });
    ws.on('error', () => { closeConnection().catch(() => {}); });
  });

  const heartbeat = setInterval(() => {
    const now = Date.now();
    Array.from(registry.byId.values()).forEach((connection) => {
      if (now - connection.lastSeenAt <= config.connectionTimeoutMs) return;
      try { connection.ws.close(4000, 'heartbeat timeout'); } catch (err) { /* ignore */ }
    });
  }, config.heartbeatMs);
  heartbeat.unref();

  return { server, wss, registry, game, config };
}

if (require.main === module) {
  installProcessErrorHandlers();
  const app = createSocketServer();
  app.server.listen(app.config.port, () => {
    console.log(`[socket] listening on ${app.config.port}`);
    console.log('[socket] config', {
      cloudEnv: app.config.cloudEnv || '',
      hasTokenSecret: Boolean(app.config.tokenSecret),
      hasGameFunctionUrl: Boolean(app.config.gameFunctionUrl),
      hasSocketProxySecret: Boolean(app.config.socketProxySecret),
      handlerTimeoutMs: app.config.handlerTimeoutMs,
      connectionTimeoutMs: app.config.connectionTimeoutMs,
      gameFunctionTimeoutMs: app.config.gameFunctionTimeoutMs,
    });
  });
}

module.exports = {
  createSocketServer,
  installProcessErrorHandlers,
  tokenInfoFromRequest,
  tokenFromRequest,
};
