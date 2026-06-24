const DEFAULT_PORT = 8080;
const DEFAULT_HEARTBEAT_MS = 20000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 45000;
const DEFAULT_HANDLER_TIMEOUT_MS = 15000;
const DEFAULT_DB_TIMEOUT_MS = 15000;
const DEFAULT_GAME_FUNCTION_TIMEOUT_MS = 15000;

function readConfig(env = process.env) {
  return {
    port: Number(env.PORT || env.SOCKET_PORT || DEFAULT_PORT),
    cloudEnv: env.TCB_ENV || env.SCF_NAMESPACE || env.CLOUD_ENV || env.WX_CLOUD_ENV || '',
    tokenSecret: env.SOCKET_TOKEN_SECRET || env.WEBSOCKET_TOKEN_SECRET || env.TCB_ENV || 'huapai-dev-socket-secret',
    allowedOrigins: String(env.SOCKET_ALLOWED_ORIGINS || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    heartbeatMs: Number(env.SOCKET_HEARTBEAT_MS || DEFAULT_HEARTBEAT_MS),
    connectionTimeoutMs: Number(env.SOCKET_CONNECTION_TIMEOUT_MS || DEFAULT_CONNECTION_TIMEOUT_MS),
    handlerTimeoutMs: Number(env.SOCKET_HANDLER_TIMEOUT_MS || DEFAULT_HANDLER_TIMEOUT_MS),
    dbTimeoutMs: Number(env.SOCKET_DB_TIMEOUT_MS || env.CLOUDBASE_TIMEOUT_MS || DEFAULT_DB_TIMEOUT_MS),
    gameFunctionUrl: env.GAME_FUNCTION_URL || env.SOCKET_GAME_FUNCTION_URL || '',
    gameFunctionTimeoutMs: Number(env.GAME_FUNCTION_TIMEOUT_MS || env.SOCKET_GAME_FUNCTION_TIMEOUT_MS || DEFAULT_GAME_FUNCTION_TIMEOUT_MS),
    socketProxySecret: env.SOCKET_PROXY_SECRET || env.SOCKET_TOKEN_SECRET || '',
  };
}

module.exports = {
  DEFAULT_CONNECTION_TIMEOUT_MS,
  DEFAULT_DB_TIMEOUT_MS,
  DEFAULT_GAME_FUNCTION_TIMEOUT_MS,
  DEFAULT_HANDLER_TIMEOUT_MS,
  DEFAULT_HEARTBEAT_MS,
  DEFAULT_PORT,
  readConfig,
};
