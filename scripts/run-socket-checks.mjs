import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const loginToken = require('../cloudfunctions/login/socket-token.js');
const socketToken = require('../services/socket/src/token.js');
const protocol = require('../services/socket/src/protocol.js');
const { ConnectionRegistry } = require('../services/socket/src/connections.js');
const { GameService, parseFunctionResponse } = require('../services/socket/src/game-service.js');
const { readConfig } = require('../services/socket/src/config.js');
const { originAllowed } = require('../services/socket/src/origin.js');
const { default: OnlineSocketTransport } = await import('../js/net/socket.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const issued = loginToken.issueSocketToken('openid-a', {
  now: 1000,
  ttlMs: 5000,
  nonce: 'nonce-a',
  secret: 'unit-secret',
});
assert(issued.token && issued.expiresAt === 6000, 'socket token should expose token and expiry');

const verified = socketToken.verifySocketToken(issued.token, { now: 2000, secret: 'unit-secret' });
assert(verified.ok && verified.openid === 'openid-a', 'socket service should verify login-issued token');

const expired = socketToken.verifySocketToken(issued.token, { now: 7000, secret: 'unit-secret' });
assert(!expired.ok && expired.error === 'TOKEN_EXPIRED', 'expired socket token should be rejected');

const wrongSecret = socketToken.verifySocketToken(issued.token, { now: 2000, secret: 'wrong-secret' });
assert(!wrongSecret.ok && wrongSecret.error === 'TOKEN_SIGNATURE_INVALID', 'bad token signature should be rejected');

const mismatch = loginToken.verifySocketToken(issued.token, {
  now: 2000,
  secret: 'unit-secret',
  openid: 'openid-b',
});
assert(!mismatch.ok && mismatch.error === 'TOKEN_OPENID_MISMATCH', 'openid mismatch should be rejected');

const parsed = protocol.normalizeEnvelope(JSON.stringify({
  type: 'op',
  requestId: 'req-1',
  roomId: '123456',
  version: 3,
  payload: { kind: 'discard' },
}));
assert(parsed.ok && parsed.value.requestId === 'req-1' && parsed.value.payload.kind === 'discard', 'protocol should parse valid envelope');

const invalidJson = protocol.normalizeEnvelope('{bad json');
assert(!invalidJson.ok && invalidJson.error === 'MESSAGE_JSON_INVALID', 'protocol should reject invalid JSON');

const response = JSON.parse(protocol.success('op:result', parsed.value, { ok: true }, { version: 4 }));
assert(response.requestId === 'req-1' && response.version === 4 && response.ok, 'success envelope should preserve request id and version');

const registry = new ConnectionRegistry();
const ws = { readyState: 1, OPEN: 1, send() {} };
const a = registry.add(ws, 'openid-a');
const b = registry.add(ws, 'openid-a');
registry.subscribe(a, '123456');
registry.subscribe(b, '123456');
assert(registry.roomConnections('123456').length === 2, 'registry should allow multiple connections for one openid');
assert(registry.hasRoomConnection('openid-a', '123456'), 'registry should detect active room connections for an openid');
registry.remove(a);
assert(registry.roomConnections('123456').length === 1, 'registry should remove closed room connection');
assert(registry.hasRoomConnection('openid-a', '123456'), 'registry should keep openid online while another room connection remains');
registry.remove(b);
assert(registry.roomConnections('123456').length === 0, 'registry should clean empty room sets');
assert(!registry.hasRoomConnection('openid-a', '123456'), 'registry should report no room connection after the last close');

const config = readConfig({
  SOCKET_PORT: '9090',
  SOCKET_TOKEN_SECRET: 'secret',
  SOCKET_ALLOWED_ORIGINS: 'https://a.example, https://b.example',
});
assert(config.port === 9090 && config.allowedOrigins.length === 2, 'socket config should read env values');
assert(originAllowed({ headers: { origin: 'https://a.example' } }, config.allowedOrigins), 'allowed origin should pass');
assert(!originAllowed({ headers: { origin: 'https://evil.example' } }, config.allowedOrigins), 'unknown origin should be rejected');
assert(originAllowed({ headers: {} }, config.allowedOrigins), 'wechat socket handshake without origin should pass');
assert(config.gameFunctionUrl === '', 'game function url should default to empty');

assert(parseFunctionResponse('{"ok":true}').ok === true, 'game service should parse direct json response');
assert(parseFunctionResponse('{"body":"{\\"ok\\":true,\\"value\\":1}"}').value === 1, 'game service should parse wrapped http response');
assert(parseFunctionResponse('{"result":{"ok":true,"value":2}}').value === 2, 'game service should parse result wrapped response');

let functionRequest = null;
const gameService = new GameService({
  gameFunctionUrl: 'https://game.example/proxy',
  socketProxySecret: 'proxy-secret',
  gameFunctionTimeoutMs: 1000,
  fetch: async (url, options) => {
    functionRequest = { url, options };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, roomId: '123456', yourSeat: 0 }),
    };
  },
});
const proxiedPull = await gameService.pull('openid-a', '123456');
assert(proxiedPull.ok && proxiedPull.yourSeat === 0, 'game service should call cloud function proxy');
assert(functionRequest.url === 'https://game.example/proxy', 'game service should call configured function url');
assert(functionRequest.options.headers['x-socket-proxy-secret'] === 'proxy-secret', 'game service should pass proxy secret header');
const functionBody = JSON.parse(functionRequest.options.body);
assert(functionBody.action === 'pull' && functionBody.socketOpenid === 'openid-a', 'game service should pass action and socket openid');

const missingEndpoint = await new OnlineSocketTransport({ connectSocket() {} }).connect({ token: 'token' }).catch((err) => err);
assert(missingEndpoint.code === 'SOCKET_ENDPOINT_MISSING', 'socket transport should report missing endpoint');

const missingToken = await new OnlineSocketTransport({ connectSocket() {} }).connect({ url: 'wss://socket.example' }).catch((err) => err);
assert(missingToken.code === 'SOCKET_TOKEN_MISSING', 'socket transport should report missing token');

const unsupported = await new OnlineSocketTransport({}).connect({ url: 'wss://socket.example', token: 'token' }).catch((err) => err);
assert(unsupported.code === 'SOCKET_UNSUPPORTED', 'socket transport should report unsupported runtime');

const missingEnv = await new OnlineSocketTransport({ cloud: { connectContainer() {} } })
  .connect({ service: 'huapai-socket', token: 'token' })
  .catch((err) => err);
assert(missingEnv.code === 'SOCKET_ENV_MISSING', 'socket transport should report missing cloud run env');

const directCloudRunUrl = await new OnlineSocketTransport({ connectSocket() {} })
  .connect({ url: 'wss://service-cloud1-test-123.ap-shanghai.run.wxcloudrun.com/', token: 'token' })
  .catch((err) => err);
assert(directCloudRunUrl.code === 'SOCKET_SERVICE_MISSING', 'cloud run websocket should require connectContainer service config');

let containerOptions = null;
const containerSocket = {
  send() {},
  close() {},
  onOpen(callback) { setTimeout(callback, 0); },
  onMessage() {},
  onClose() {},
  onError() {},
};
const containerTransport = new OnlineSocketTransport({
  cloud: {
    connectContainer(options) {
      containerOptions = options;
      return Promise.resolve({ socketTask: containerSocket });
    },
  },
});
await containerTransport.connect({ env: 'cloud1-unit', service: 'huapai-socket', path: '/game', token: 'container-token' });
assert(containerOptions.config.env === 'cloud1-unit', 'socket transport should pass cloud run env');
assert(containerOptions.service === 'huapai-socket', 'socket transport should connect to cloud run service');
assert(containerOptions.path === '/game?token=container-token', 'socket transport should pass token in cloud run path');
assert(containerOptions.header.Authorization === 'Bearer container-token', 'socket transport should pass token in cloud run header');
containerTransport.close();

console.log('socket checks passed');
