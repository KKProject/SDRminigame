const DEFAULT_PORT = 8080;
const DEFAULT_APP_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_SOCKET_TOKEN_TTL_MS = 10 * 60 * 1000;
const DEFAULT_ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function cleanUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

function normalizeDatabaseDriver(env = {}) {
  const explicit = String(env.DATABASE_DRIVER || env.DB_DRIVER || '').trim().toLowerCase();
  if (explicit) return explicit;
  return 'mongodb';
}

function readConfig(env = process.env) {
  const apiBaseUrl = cleanUrl(env.PUBLIC_API_BASE_URL || env.BACKEND_API_BASE_URL || '');
  const socketUrl = env.PUBLIC_SOCKET_URL
    || env.BACKEND_SOCKET_URL
    || (apiBaseUrl ? `${apiBaseUrl.replace(/^http/i, 'ws')}/ws` : '');
  return {
    port: Number(env.PORT || env.BACKEND_PORT || DEFAULT_PORT),
    apiBaseUrl,
    socketUrl,
    allowedOrigins: String(env.BACKEND_ALLOWED_ORIGINS || env.SOCKET_ALLOWED_ORIGINS || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    wechatAppid: env.WECHAT_APPID || env.WX_APPID || '',
    wechatSecret: env.WECHAT_SECRET || env.WX_SECRET || '',
    devOpenid: env.BACKEND_DEV_OPENID || '',
    appTokenSecret: env.APP_TOKEN_SECRET || env.SESSION_TOKEN_SECRET || 'huapai-dev-app-secret',
    socketTokenSecret: env.SOCKET_TOKEN_SECRET || env.WEBSOCKET_TOKEN_SECRET || 'huapai-dev-socket-secret',
    adminToken: env.ADMIN_TOKEN || '',
    adminSessionSecret: env.ADMIN_SESSION_SECRET || env.ADMIN_TOKEN || env.APP_TOKEN_SECRET || env.SESSION_TOKEN_SECRET || 'huapai-dev-admin-secret',
    appTokenTtlMs: Number(env.APP_TOKEN_TTL_MS || DEFAULT_APP_TOKEN_TTL_MS),
    socketTokenTtlMs: Number(env.SOCKET_TOKEN_TTL_MS || DEFAULT_SOCKET_TOKEN_TTL_MS),
    adminSessionTtlMs: Number(env.ADMIN_SESSION_TTL_MS || DEFAULT_ADMIN_SESSION_TTL_MS),
    databaseDriver: normalizeDatabaseDriver(env),
    mongodbUri: env.MONGODB_URI || '',
    mongodbDb: env.MONGODB_DB || 'huapai',
    fileDbPath: env.FILE_DB_PATH || '',
    heartbeatMs: Number(env.SOCKET_HEARTBEAT_MS || 20000),
    connectionTimeoutMs: Number(env.SOCKET_CONNECTION_TIMEOUT_MS || 45000),
    handlerTimeoutMs: Number(env.SOCKET_HANDLER_TIMEOUT_MS || 15000),
    protobufEnabled: String(env.SOCKET_PROTOBUF_ENABLED || env.REALTIME_PROTOBUF_ENABLED || '1') !== '0',
  };
}

module.exports = {
  DEFAULT_ADMIN_SESSION_TTL_MS,
  DEFAULT_APP_TOKEN_TTL_MS,
  DEFAULT_SOCKET_TOKEN_TTL_MS,
  normalizeDatabaseDriver,
  readConfig,
};
