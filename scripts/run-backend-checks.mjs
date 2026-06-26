import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { AuthService } = require('../services/backend/src/auth-service.js');
const { readConfig } = require('../services/backend/src/config.js');
const { MemoryDocumentDatabase } = require('../services/backend/src/db.js');
const { LocalGameService } = require('../services/backend/src/game-service.js');
const { createBackendServer } = require('../services/backend/src/server.js');
const { issueAppToken, issueSocketToken, verifyAppToken, verifySocketToken } = require('../services/backend/src/tokens.js');
const { WebSocket } = require('../services/backend/node_modules/ws');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const config = readConfig({
  PORT: '0',
  PUBLIC_API_BASE_URL: 'https://api.example.com',
  PUBLIC_SOCKET_URL: 'wss://api.example.com/ws',
  APP_TOKEN_SECRET: 'app-secret',
  SOCKET_TOKEN_SECRET: 'socket-secret',
  BACKEND_DEV_OPENID: 'openid-a',
});

const appToken = issueAppToken('openid-a', config, { now: 1000, ttlMs: 5000, nonce: 'app-nonce' });
assert(verifyAppToken(appToken.token, config, { now: 2000 }).openid === 'openid-a', 'app token should verify');
assert(!verifyAppToken(appToken.token, config, { now: 7000 }).ok, 'expired app token should fail');
const socketToken = issueSocketToken('openid-a', config, { now: 1000, ttlMs: 5000, nonce: 'socket-nonce' });
assert(verifySocketToken(socketToken.token, config, { now: 2000 }).openid === 'openid-a', 'socket token should verify');
assert(!verifySocketToken(socketToken.token, config, { now: 2000, openid: 'openid-b' }).ok, 'socket openid mismatch should fail');

const db = new MemoryDocumentDatabase();
await db.collection('rooms').doc('123456').set({
  data: {
    status: 'waiting',
    playerOpenids: ['openid-a'],
    players: [{ openid: 'openid-a', seat: 0 }],
    updatedAt: 10,
  },
});
const byArray = await db.collection('rooms').where({ playerOpenids: 'openid-a' }).orderBy('updatedAt', 'desc').limit(1).get();
assert(byArray.data.length === 1 && byArray.data[0]._id === '123456', 'memory db should query array membership');
const byNested = await db.collection('rooms').where({ 'players.openid': 'openid-a' }).get();
assert(byNested.data.length === 1, 'memory db should query nested array fields');

const auth = new AuthService({ config, db });
const login = await auth.login({ code: 'dev-code', profile: { nickName: '测试玩家', avatarUrl: 'avatar.png' } });
assert(login.ok && login.openid === 'openid-a' && login.token && login.socket.token, 'auth service should login and issue tokens');
const user = await db.collection('users').doc('openid-a').get();
assert(user.data.nickName === '测试玩家', 'auth service should upsert user profile');

const game = new LocalGameService({ db });
const ping = await game.callAction('ping', 'openid-a', {});
assert(ping.ok && ping.openid === 'openid-a', 'local game service should inject openid');
const unknown = await game.callAction('missing', 'openid-a', {});
assert(!unknown.ok && unknown.error === 'UNKNOWN_ACTION', 'local game service should reject unknown actions');

const app = await createBackendServer({ config, db });
await app.listen(0);
const address = app.server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const health = await fetch(`${baseUrl}/healthz`).then((res) => res.json());
assert(health.ok && health.service === 'huapai-backend', 'healthz should respond');
const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code: 'dev-code', profile: { nickName: '服务玩家' } }),
}).then((res) => res.json());
assert(loginRes.ok && loginRes.token && loginRes.socket.url === 'wss://api.example.com/ws', 'login api should return tokens and socket url');
const gameRes = await fetch(`${baseUrl}/api/game`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', Authorization: `Bearer ${loginRes.token}` },
  body: JSON.stringify({ action: 'ping' }),
}).then((res) => res.json());
assert(gameRes.ok && gameRes.openid === 'openid-a', 'game api should authorize bearer token');
const unauthorized = await fetch(`${baseUrl}/api/game`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'ping' }),
});
assert(unauthorized.status === 401, 'game api should reject missing bearer token');
await app.close();

const adminDisabledApp = await createBackendServer({
  config,
  db: new MemoryDocumentDatabase(),
});
await adminDisabledApp.listen(0);
const adminDisabledBase = `http://127.0.0.1:${adminDisabledApp.server.address().port}`;
const disabledStatus = await fetch(`${adminDisabledBase}/api/admin/status`, {
  headers: { authorization: 'Bearer admin-secret' },
});
assert(disabledStatus.status === 503, 'admin api should be disabled when ADMIN_TOKEN is not configured');
await adminDisabledApp.close();

const adminConfig = readConfig({
  PORT: '0',
  PUBLIC_API_BASE_URL: 'https://api.example.com',
  PUBLIC_SOCKET_URL: 'wss://api.example.com/ws',
  APP_TOKEN_SECRET: 'app-secret',
  SOCKET_TOKEN_SECRET: 'socket-secret',
  ADMIN_TOKEN: 'admin-secret',
});
const adminDb = new MemoryDocumentDatabase();
await adminDb.collection('rooms').doc('room-a').set({ data: { status: 'waiting' } });
await adminDb.collection('rooms').doc('room-b').set({ data: { status: 'playing' } });
await adminDb.collection('roomStates').doc('room-a').set({ data: { version: 1 } });
await adminDb.collection('matchQueue').doc('openid-a').set({ data: { status: 'waiting' } });
await adminDb.collection('users').doc('openid-a').set({ data: { nickName: '保留用户' } });
const adminApp = await createBackendServer({ config: adminConfig, db: adminDb });
await adminApp.listen(0);
const adminBase = `http://127.0.0.1:${adminApp.server.address().port}`;
const adminPage = await fetch(`${adminBase}/admin?token=admin-secret`);
assert(adminPage.status === 200 && /花牌后端管理/.test(await adminPage.text()), 'admin page should render with a valid token');
const adminPageUnauthorized = await fetch(`${adminBase}/admin?token=wrong`);
assert(adminPageUnauthorized.status === 401, 'admin page should reject an invalid token');
const adminApiUnauthorized = await fetch(`${adminBase}/api/admin/status`, {
  headers: { authorization: 'Bearer wrong' },
});
assert(adminApiUnauthorized.status === 401, 'admin api should reject an invalid token');
const adminStatus = await fetch(`${adminBase}/api/admin/status`, {
  headers: { authorization: 'Bearer admin-secret' },
}).then((res) => res.json());
const roomsStatus = adminStatus.collections.find((item) => item.name === 'rooms');
const roomStatesStatus = adminStatus.collections.find((item) => item.name === 'roomStates');
assert(adminStatus.ok && roomsStatus.count === 2 && roomStatesStatus.count === 1, 'admin status should count managed collections');
const forbiddenClear = await fetch(`${adminBase}/api/admin/clear`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer admin-secret' },
  body: JSON.stringify({ collection: 'users', confirm: 'CLEAR' }),
}).then((res) => res.json());
assert(!forbiddenClear.ok && forbiddenClear.error === 'ADMIN_COLLECTION_NOT_ALLOWED', 'admin clear should reject collections outside the allowlist');
const missingConfirm = await fetch(`${adminBase}/api/admin/clear`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer admin-secret' },
  body: JSON.stringify({ collection: 'rooms', confirm: 'NO' }),
}).then((res) => res.json());
assert(!missingConfirm.ok && missingConfirm.error === 'ADMIN_CONFIRM_REQUIRED', 'admin clear should require explicit confirmation');
const clearRooms = await fetch(`${adminBase}/api/admin/clear`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer admin-secret' },
  body: JSON.stringify({ collection: 'rooms', confirm: 'CLEAR' }),
}).then((res) => res.json());
assert(clearRooms.ok && clearRooms.deleted.rooms === 2, 'admin clear should delete one managed collection');
assert(await adminDb.collection('users').countDocuments({}) === 1, 'admin clear should leave non-managed collections untouched');
const clearAll = await fetch(`${adminBase}/api/admin/clear`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer admin-secret' },
  body: JSON.stringify({ collection: 'all', confirm: 'CLEAR' }),
}).then((res) => res.json());
assert(clearAll.ok && clearAll.deleted.roomStates === 1 && clearAll.deleted.matchQueue === 1, 'admin clear all should delete all managed room collections');
await adminApp.close();

function waitForOpen(ws) {
  return new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let rejectPullForB = false;
const socketMessages = { a: [], b: [] };
const socketGame = {
  async pull(openid, roomId) {
    if (openid === 'openid-b' && rejectPullForB) return { ok: false, error: 'PULL_FAILED' };
    const seat = openid === 'openid-a' ? 0 : 1;
    return {
      ok: true,
      roomId,
      version: 1,
      yourSeat: seat,
      public: { seats: [], phase: 'human-discard', currentSeat: 0 },
      private: { seat, hand: [{ id: `private-${seat}` }] },
      animation: { waiting: false, latestEventSeq: 0 },
    };
  },
  async setConnection(openid, roomId) {
    return { ok: true, roomId, version: 1, room: { roomId, players: [] } };
  },
  async op(openid, request) {
    return {
      ok: true,
      roomId: request.roomId,
      version: 2,
      yourSeat: 0,
      public: { seats: [], phase: 'human-discard', currentSeat: 0 },
      private: { seat: 0, hand: [{ id: 'actor-private-card' }] },
      animation: { waiting: false, latestEventSeq: 2 },
    };
  },
};
const socketApp = await createBackendServer({ config, db: new MemoryDocumentDatabase(), game: socketGame });
await socketApp.listen(0);
const socketPort = socketApp.server.address().port;
const wsA = new WebSocket(`ws://127.0.0.1:${socketPort}/ws?token=${encodeURIComponent(issueSocketToken('openid-a', config).token)}`);
const wsB = new WebSocket(`ws://127.0.0.1:${socketPort}/ws?token=${encodeURIComponent(issueSocketToken('openid-b', config).token)}`);
wsA.on('message', (raw) => socketMessages.a.push(JSON.parse(String(raw))));
wsB.on('message', (raw) => socketMessages.b.push(JSON.parse(String(raw))));
await Promise.all([waitForOpen(wsA), waitForOpen(wsB)]);
wsA.send(JSON.stringify({ type: 'subscribe', requestId: 'sub-a', roomId: 'room-1' }));
wsB.send(JSON.stringify({ type: 'subscribe', requestId: 'sub-b', roomId: 'room-1' }));
await wait(80);
socketMessages.a.length = 0;
socketMessages.b.length = 0;
rejectPullForB = true;
wsA.send(JSON.stringify({ type: 'op', requestId: 'op-a', roomId: 'room-1', payload: { kind: 'discard' } }));
await wait(80);
const leakedToB = socketMessages.b.some((message) => (
  message.type === 'snapshot'
  && message.payload
  && message.payload.private
  && message.payload.private.hand
  && message.payload.private.hand.some((card) => card.id === 'actor-private-card')
));
assert(!leakedToB, 'socket broadcast should never fall back to another player private snapshot');
wsA.close();
wsB.close();
await socketApp.close();

console.log('backend checks passed');
