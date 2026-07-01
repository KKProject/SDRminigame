const { URL } = require('url');
const { WebSocketServer } = require('ws');

const { ConnectionRegistry } = require('./connections');
const { encodeEnvelope, envelope, failure, normalizeEnvelope, success } = require('./protocol');
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
  if (connection.protobuf && typeof message === 'string') {
    const parsed = JSON.parse(message);
    connection.ws.send(encodeEnvelope(parsed.type, parsed, { protobuf: true }));
  } else {
    connection.ws.send(message);
  }
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

function publicPatch(publicState = {}) {
  return {
    phase: publicState.phase,
    currentSeat: publicState.currentSeat,
    dealerSeat: publicState.dealerSeat,
    nextDealerSeat: publicState.nextDealerSeat,
    feedback: publicState.feedback || '',
    responseSummary: publicState.responseSummary || null,
    pendingActions: [],
    playerActions: [],
  };
}

function privatePatch(publicState = {}, seat) {
  if (typeof seat !== 'number' || seat < 0) return { seat: -1, playerActions: [] };
  const summary = publicState.responseSummary || null;
  const waitingSeats = summary && Array.isArray(summary.waitingSeats) ? summary.waitingSeats : [];
  if (!summary || !summary.active || waitingSeats.indexOf(seat) < 0) {
    return { seat, playerActions: [] };
  }
  const actions = (publicState.pendingActions || []).filter((action) => action && action.seat === seat);
  return {
    seat,
    playerActions: actions.concat([{ type: 'pass', seat, label: '过' }]),
  };
}

function deltaForEvent(event = {}, publicState = {}) {
  const delta = {
    publicPatch: publicPatch(publicState),
  };
  if ((event.type === 'discard' || event.type === 'unclaimed') && event.card && typeof event.seat === 'number') {
    delta.appendDiscard = {
      seat: event.seat,
      card: event.card,
      index: typeof event.discardIndex === 'number' ? event.discardIndex : undefined,
    };
  }
  if (event.meld && typeof event.seat === 'number' && ['chi', 'peng', 'zhao', 'ta'].indexOf(event.type) >= 0) {
    const key = event.type === 'ta' ? 'extendMeld' : 'appendMeld';
    delta[key] = {
      seat: event.seat,
      meld: event.meld,
      index: typeof event.meldIndex === 'number' ? event.meldIndex : undefined,
    };
  }
  return delta;
}

function cloneDeltaForConnection(delta = {}, connection = {}) {
  return Object.assign({}, delta, {
    privatePatch: privatePatch(delta.publicState || {}, connection.seat),
    publicState: undefined,
  });
}

function incrementalPayload(res) {
  if (!res || !res.ok || !res.roomId || typeof res.version !== 'number') return null;
  const animation = res.animation || {};
  const event = animation.currentEvent || (res.public && res.public.publicEvent) || null;
  const eventSeq = event && typeof event.eventSeq === 'number' ? event.eventSeq : 0;
  if (!event || !eventSeq) return null;
  return {
    ok: true,
    roomId: res.roomId,
    baseVersion: res.version - 1,
    version: res.version,
    eventSeq,
    event,
    delta: Object.assign(deltaForEvent(event, res.public || {}), {
      publicState: res.public || {},
    }),
  };
}

function reasonText(reason) {
  if (!reason) return '';
  if (Buffer.isBuffer(reason)) return reason.toString('utf8');
  return String(reason);
}

function logSocket(logger, level, message, detail = {}) {
  const target = logger && typeof logger[level] === 'function' ? logger[level] : null;
  if (!target) return;
  target.call(logger, message, detail);
}

function connectionLogDetail(connection, extra = {}) {
  return Object.assign({
    connectionId: connection && connection.id,
    openid: connection && connection.openid,
    roomId: connection && connection.roomId,
  }, extra);
}

function createSocketLayer({ server, config, game, registry, logger = console } = {}) {
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
      logSocket(logger, 'warn', '[socket] upgrade rejected', {
        path: tokenInfo.pathname,
        reason: 'ORIGIN_FORBIDDEN',
      });
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    const verified = verifySocketToken(tokenInfo.token, config);
    if (!verified.ok) {
      logSocket(logger, 'warn', '[socket] auth failed', {
        path: tokenInfo.pathname,
        reason: verified.error || 'SOCKET_UNAUTHORIZED',
        tokenSource: tokenInfo.source || '',
      });
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
      connection.seat = fresh.yourSeat;
      const payload = snapshotPayload(fresh);
      send(connection, envelope('snapshot', {
        roomId,
        version: payload.version,
        eventSeq: payload.animation && payload.animation.latestEventSeq,
        payload,
      }));
    }));
  }

  async function broadcastIncremental(roomId, res) {
    const payload = incrementalPayload(res);
    if (!payload) return false;
    const roomConnections = connections.roomConnections(roomId);
    roomConnections.forEach((connection) => {
      const connectionPayload = Object.assign({}, payload, {
        delta: cloneDeltaForConnection(payload.delta, connection),
      });
      send(connection, envelope('delta', {
        roomId,
        version: connectionPayload.version,
        eventSeq: connectionPayload.eventSeq,
        payload: connectionPayload,
      }));
    });
    return true;
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
      connection.seat = res.yourSeat;
      connection.protobuf = Boolean(
        config.protobufEnabled
        && request.payload
        && request.payload.transport
        && request.payload.transport.protobuf
      );
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
    const shouldBroadcast = request.type !== 'ackAnimation' || Boolean(res && res.advanced);
    if (shouldBroadcast && res && res.ok && request.roomId && (res.public || res.animation || res.room)) {
      const sentIncremental = await broadcastIncremental(request.roomId, res);
      if (!sentIncremental) await broadcastSnapshot(request.roomId, res);
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
        send(connection, failure('error', parsed.value || {}, parsed.error));
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
    const closeConnection = async (event = 'close', detail = {}) => {
      const roomId = connection.roomId;
      const openid = connection.openid;
      logSocket(logger, event === 'error' ? 'warn' : 'info', `[socket] connection ${event}`, connectionLogDetail(connection, detail));
      connections.remove(connection);
      if (!roomId || connections.hasRoomConnection(openid, roomId)) return;
      // 普通 close 可能只是小程序临时断线，离线托管交给心跳超时处理，避免吞掉响应窗口按钮。
      if (event !== 'close' || detail.code !== 4000) return;
      const res = await game.setConnection(openid, roomId, false).catch(() => null);
      if (res && res.ok) await broadcastSnapshot(roomId, res);
    };
    ws.on('close', (code, reason) => {
      closeConnection('close', { code, reason: reasonText(reason) }).catch(() => {});
    });
    ws.on('error', (err) => {
      closeConnection('error', { code: errorCode(err, 'SOCKET_ERROR'), reason: err && err.message }).catch(() => {});
    });
  });

  const heartbeat = setInterval(() => {
    const now = Date.now();
    Array.from(connections.byId.values()).forEach((connection) => {
      if (now - connection.lastSeenAt <= config.connectionTimeoutMs) return;
      logSocket(logger, 'warn', '[socket] heartbeat timeout', connectionLogDetail(connection, {
        idleMs: now - connection.lastSeenAt,
        timeoutMs: config.connectionTimeoutMs,
      }));
      try { connection.ws.close(4000, 'heartbeat timeout'); } catch (err) { /* ignore */ }
    });
  }, config.heartbeatMs);
  if (heartbeat.unref) heartbeat.unref();

  return { wss, registry: connections, close: () => clearInterval(heartbeat) };
}

module.exports = {
  createSocketLayer,
  logSocket,
  originAllowed,
  reasonText,
  tokenInfoFromRequest,
};
