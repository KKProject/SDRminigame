const { URL } = require('url');
const { WebSocketServer } = require('ws');

const { ConnectionRegistry } = require('./connections');
const { envelope, failure, normalizeEnvelope, success } = require('./protocol');
const { verifySocketToken } = require('./tokens');

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

function originAllowed(req, allowedOrigins) {
  if (!allowedOrigins || !allowedOrigins.length) return true;
  const origin = req && req.headers ? (req.headers.origin || '') : '';
  return !origin || allowedOrigins.indexOf(origin) >= 0;
}

function send(connection, message) {
  if (!connection || !connection.ws || connection.ws.readyState !== 1) return false;
  connection.ws.send(message);
  return true;
}

function errorCode(err, fallback = 'REQUEST_FAILED') {
  return (err && (err.code || err.error || err.message)) || fallback;
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
    room: res && res.room,
    animation: res && res.animation,
    rematch: res && res.rematch,
  };
}

function createSocketLayer({ server, config, game, registry } = {}) {
  const wss = new WebSocketServer({ noServer: true });
  const connections = registry || new ConnectionRegistry();

  server.on('upgrade', (req, socket, head) => {
    const tokenInfo = tokenInfoFromRequest(req);
    if (tokenInfo.pathname !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    if (!originAllowed(req, config.allowedOrigins)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    const verified = verifySocketToken(tokenInfo.token, config);
    if (!verified.ok) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.openid = verified.openid;
      wss.emit('connection', ws, req);
    });
  });

  async function broadcastSnapshot(roomId, res) {
    const roomConnections = connections.roomConnections(roomId);
    await Promise.all(roomConnections.map(async (connection) => {
      const fresh = await game.pull(connection.openid, roomId).catch(() => null);
      if (!fresh || !fresh.ok || typeof fresh.yourSeat !== 'number' || fresh.yourSeat < 0) {
        return;
      }
      const payload = snapshotPayload(fresh);
      send(connection, envelope('snapshot', {
        roomId,
        version: payload.version,
        eventSeq: payload.animation && payload.animation.latestEventSeq,
        payload,
      }));
    }));
  }

  async function handleMessage(connection, request) {
    if (request.type === 'ping' || request.type === 'heartbeat') {
      connections.touch(connection);
      if (request.roomId) {
        const res = await game.heartbeat(connection.openid, request.roomId);
        return success('heartbeat:result', request, res, { version: res && res.version });
      }
      return success('pong', request, { now: Date.now() });
    }
    if (request.type === 'subscribe') {
      const res = await game.pull(connection.openid, request.roomId);
      if (!res || !res.ok || typeof res.yourSeat !== 'number' || res.yourSeat < 0) {
        return failure('subscribe:result', request, (res && res.error) || 'NOT_IN_ROOM');
      }
      connections.subscribe(connection, request.roomId);
      game.setConnection(connection.openid, request.roomId, true)
        .then(async (onlineRes) => {
          if (onlineRes && onlineRes.ok) await broadcastSnapshot(request.roomId, onlineRes);
        })
        .catch(() => {});
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
      leaveRoom: () => game.leaveRoom(connection.openid, request),
      requestRematch: () => game.requestRematch(connection.openid, request),
    };
    const handler = handlers[request.type];
    if (!handler) return failure('error', request, 'UNKNOWN_MESSAGE_TYPE');
    const res = await handler();
    const responseType = `${request.type}:result`;
    const payload = snapshotPayload(res);
    if (res && res.ok && request.roomId && (res.public || res.animation || res.room)) {
      await broadcastSnapshot(request.roomId, res);
    }
    if (!res || !res.ok) return failure(responseType, request, (res && res.error) || 'REQUEST_FAILED', { version: res && res.version });
    return success(responseType, request, Object.assign({}, res, payload), {
      version: res.version,
      eventSeq: res.animation && res.animation.latestEventSeq,
    });
  }

  wss.on('connection', (ws) => {
    const connection = connections.add(ws, ws.openid);
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
        send(connection, failure(`${parsed.value.type || 'message'}:result`, parsed.value, errorCode(err, 'HANDLER_ERROR')));
      }
    });
    const closeConnection = async () => {
      const roomId = connection.roomId;
      const openid = connection.openid;
      connections.remove(connection);
      if (!roomId || connections.hasRoomConnection(openid, roomId)) return;
      const res = await game.setConnection(openid, roomId, false).catch(() => null);
      if (res && res.ok) await broadcastSnapshot(roomId, res);
    };
    ws.on('close', () => { closeConnection().catch(() => {}); });
    ws.on('error', () => { closeConnection().catch(() => {}); });
  });

  const heartbeat = setInterval(() => {
    const now = Date.now();
    Array.from(connections.byId.values()).forEach((connection) => {
      if (now - connection.lastSeenAt <= config.connectionTimeoutMs) return;
      try { connection.ws.close(4000, 'heartbeat timeout'); } catch (err) { /* ignore */ }
    });
  }, config.heartbeatMs);
  if (heartbeat.unref) heartbeat.unref();

  return { wss, registry: connections, close: () => clearInterval(heartbeat) };
}

module.exports = {
  createSocketLayer,
  originAllowed,
  tokenInfoFromRequest,
};
