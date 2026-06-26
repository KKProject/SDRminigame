const DEFAULT_REQUEST_TIMEOUT_MS = 20000;
const DEFAULT_HEARTBEAT_MS = 15000;

function appendToken(url, token) {
  if (!url || !token) return url || '';
  const sep = url.indexOf('?') >= 0 ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

function authHeader(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function isWxCloudRunUrl(url) {
  return /\.run\.(wxcloudrun|tcloudbase)\.com(?::\d+)?(?:\/|$)/.test(String(url || ''));
}

function requestId() {
  return `sock-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function parseMessage(message) {
  const data = message && typeof message.data !== 'undefined' ? message.data : message;
  if (typeof data === 'object') return data || {};
  try {
    return JSON.parse(String(data || '{}'));
  } catch (err) {
    return { type: 'error', ok: false, error: 'MESSAGE_JSON_INVALID' };
  }
}

export function socketError(code, detail = null) {
  const error = new Error(code);
  error.code = code;
  if (detail) error.detail = detail;
  return error;
}

function normalizeSocketError(err, fallbackCode) {
  if (err && err.code && typeof err.code !== 'number') return err;
  const closeCode = err && typeof err.code === 'number' ? err.code : 0;
  const code = closeCode === 1006 ? 'SOCKET_ABNORMAL_CLOSE' : fallbackCode;
  const error = new Error((err && err.errMsg) || (err && err.message) || fallbackCode);
  error.code = code;
  if (closeCode) error.closeCode = closeCode;
  if (err && err.reason) error.reason = err.reason;
  error.detail = err || null;
  return error;
}

export default class OnlineSocketTransport {
  constructor(runtime = wx, options = {}) {
    this.runtime = runtime;
    this.requestTimeoutMs = options.requestTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS;
    this.heartbeatMs = options.heartbeatMs || DEFAULT_HEARTBEAT_MS;
    this.socket = null;
    this.connected = false;
    this.connecting = false;
    this.pending = {};
    this.heartbeatTimer = null;
    this.onSnapshot = null;
    this.onDisconnect = null;
    this.lastAuth = null;
  }

  isSupported(auth = {}) {
    return this.runtime && typeof this.runtime.connectSocket === 'function';
  }

  isReady() {
    return Boolean(this.connected && this.socket);
  }

  connect(auth = {}) {
    if (!auth || !auth.url) return Promise.reject(socketError('SOCKET_ENDPOINT_MISSING'));
    if (!auth.token) return Promise.reject(socketError('SOCKET_TOKEN_MISSING'));
    if (!this.isSupported(auth)) return Promise.reject(socketError('SOCKET_UNSUPPORTED'));
    if (this.isReady()) return Promise.resolve(true);
    if (this.connecting) return this.connecting;
    this.lastAuth = auth;
    this.connecting = new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        this.connecting = false;
        callback(value);
      };
      const attachSocket = (socket) => {
        this.socket = socket;
        if (!socket) {
          finish(reject, socketError('SOCKET_CONNECT_FAILED'));
          return;
        }
        socket.onOpen(() => {
          this.connected = true;
          this.startHeartbeat();
          finish(resolve, true);
        });
        socket.onMessage((message) => this.handleMessage(message));
        socket.onClose((err) => this.handleClose(normalizeSocketError(err, 'SOCKET_CLOSED')));
        socket.onError((err) => {
          const error = normalizeSocketError(err, 'SOCKET_CONNECT_FAILED');
          if (!this.connected) finish(reject, error);
          this.handleClose(error);
        });
      };
      attachSocket(this.runtime.connectSocket({
        url: appendToken(auth.url, auth.token),
        header: authHeader(auth.token),
        success: () => {},
        fail: (err) => finish(reject, normalizeSocketError(err, 'SOCKET_CONNECT_FAILED')),
      }));
    });
    return this.connecting;
  }

  handleMessage(message) {
    const envelope = parseMessage(message);
    if (envelope.type === 'snapshot' && envelope.payload && typeof this.onSnapshot === 'function') {
      this.onSnapshot(envelope.payload);
      return;
    }
    const requestIdValue = envelope.requestId;
    if (!requestIdValue || !this.pending[requestIdValue]) return;
    const pending = this.pending[requestIdValue];
    delete this.pending[requestIdValue];
    clearTimeout(pending.timer);
    if (envelope.ok === false) {
      const error = new Error(envelope.error || 'SOCKET_REQUEST_FAILED');
      error.code = envelope.error || 'SOCKET_REQUEST_FAILED';
      pending.reject(error);
      return;
    }
    pending.resolve(envelope.payload || {});
  }

  handleClose(err) {
    this.connected = false;
    this.stopHeartbeat();
    Object.keys(this.pending).forEach((key) => {
      const pending = this.pending[key];
      clearTimeout(pending.timer);
      pending.reject(err || new Error('SOCKET_CLOSED'));
    });
    this.pending = {};
    if (typeof this.onDisconnect === 'function') this.onDisconnect(err);
  }

  request(type, fields = {}) {
    if (!this.isReady()) return Promise.reject(socketError('SOCKET_NOT_CONNECTED'));
    const id = fields.requestId || requestId();
    const payload = {
      type,
      requestId: id,
      roomId: fields.roomId || '',
      version: typeof fields.version === 'number' ? fields.version : undefined,
      eventSeq: typeof fields.eventSeq === 'number' ? fields.eventSeq : undefined,
      payload: fields.payload || {},
    };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        delete this.pending[id];
        const error = new Error('SOCKET_REQUEST_TIMEOUT');
        error.code = 'SOCKET_REQUEST_TIMEOUT';
        reject(error);
      }, this.requestTimeoutMs);
      this.pending[id] = { resolve, reject, timer };
      this.socket.send({
        data: JSON.stringify(payload),
        fail: (err) => {
          clearTimeout(timer);
          delete this.pending[id];
          reject(normalizeSocketError(err, 'SOCKET_SEND_FAILED'));
        },
      });
    });
  }

  subscribe(roomId, version, eventSeq) {
    return this.request('subscribe', {
      roomId,
      version,
      eventSeq,
      payload: { version, eventSeq },
    });
  }

  heartbeat(roomId) {
    if (!this.isReady()) return Promise.reject(socketError('SOCKET_NOT_CONNECTED'));
    return this.request('heartbeat', { roomId });
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.isReady()) return;
      this.request('ping').catch(() => {});
    }, this.heartbeatMs);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  close() {
    this.stopHeartbeat();
    if (this.socket && this.socket.close) {
      try { this.socket.close(); } catch (err) { /* ignore */ }
    }
    this.connected = false;
    this.socket = null;
  }
}
