function timeoutAfter(ms, action) {
  return new Promise((_, reject) => {
    setTimeout(() => {
      const error = new Error('SOCKET_GAME_FUNCTION_TIMEOUT');
      error.code = 'SOCKET_GAME_FUNCTION_TIMEOUT';
      error.action = action;
      reject(error);
    }, ms);
  });
}

function normalizeServiceError(err, action) {
  const message = String((err && (err.message || err.errMsg)) || err || '');
  const code = (err && (err.code || err.error)) || 'SOCKET_GAME_FUNCTION_FAILED';
  console.error('[socket] game function failed', {
    action,
    code,
    message,
  });
  return {
    ok: false,
    error: code,
    message,
  };
}

function parseFunctionResponse(text) {
  if (!text) return {};
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: 'SOCKET_GAME_FUNCTION_RESPONSE_INVALID', message: text };
  }
  if (parsed && typeof parsed === 'object' && typeof parsed.body === 'string') {
    try {
      return JSON.parse(parsed.body);
    } catch (err) {
      return parsed;
    }
  }
  if (parsed && typeof parsed === 'object' && typeof parsed.result === 'string') {
    try {
      return JSON.parse(parsed.result);
    } catch (err) {
      return parsed;
    }
  }
  if (parsed && typeof parsed === 'object' && parsed.result && typeof parsed.result === 'object') {
    return parsed.result;
  }
  if (parsed && typeof parsed === 'object' && parsed.response_data && typeof parsed.response_data === 'object') {
    return parsed.response_data;
  }
  return parsed;
}

class GameService {
  constructor(config = {}) {
    this.functionUrl = config.gameFunctionUrl || '';
    this.proxySecret = config.socketProxySecret || '';
    this.timeoutMs = config.gameFunctionTimeoutMs || 15000;
    this.fetch = config.fetch || globalThis.fetch;
  }

  async callFunction(action, openid, payload = {}) {
    if (!this.functionUrl) {
      return { ok: false, error: 'SOCKET_GAME_FUNCTION_URL_MISSING' };
    }
    if (!this.proxySecret) {
      return { ok: false, error: 'SOCKET_PROXY_SECRET_MISSING' };
    }
    if (typeof this.fetch !== 'function') {
      return { ok: false, error: 'SOCKET_FETCH_UNSUPPORTED' };
    }
    const body = Object.assign({}, payload, {
      action,
      socketOpenid: openid,
      socketProxySecret: this.proxySecret,
    });
    const request = this.fetch(this.functionUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-socket-proxy-secret': this.proxySecret,
      },
      body: JSON.stringify(body),
    }).then(async (res) => {
      const text = await res.text();
      const parsed = parseFunctionResponse(text);
      if (!res.ok) {
        const message = parsed.message || text;
        console.error('[socket] game function http error', {
          action,
          statusCode: res.status,
          message: String(message || '').slice(0, 500),
        });
        return {
          ok: false,
          error: parsed.error || 'SOCKET_GAME_FUNCTION_HTTP_ERROR',
          statusCode: res.status,
          message,
        };
      }
      return parsed;
    });
    try {
      return await Promise.race([request, timeoutAfter(this.timeoutMs, action)]);
    } catch (err) {
      return normalizeServiceError(err, action);
    }
  }

  async pull(openid, roomId) {
    return this.callFunction('pull', openid, { roomId });
  }

  async heartbeat(openid, roomId) {
    return this.callFunction('heartbeat', openid, { roomId });
  }

  async setConnection(openid, roomId, online) {
    return this.callFunction('setConnection', openid, { roomId, online });
  }

  async op(openid, request) {
    return this.callFunction('op', openid, Object.assign({
      roomId: request.roomId,
      version: request.version,
    }, request.payload || {}));
  }

  async ackAnimation(openid, request) {
    return this.callFunction('ackAnimation', openid, {
      roomId: request.roomId,
      eventSeq: request.eventSeq || (request.payload && request.payload.eventSeq),
    });
  }

  async setReady(openid, request) {
    return this.callFunction('setReady', openid, {
      roomId: request.roomId,
      ready: request.payload ? request.payload.ready : undefined,
    });
  }

  async startRound(openid, request) {
    return this.callFunction('startRound', openid, {
      roomId: request.roomId,
    });
  }
}

module.exports = {
  GameService,
  normalizeServiceError,
  parseFunctionResponse,
};
