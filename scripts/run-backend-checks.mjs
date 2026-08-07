import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { AdminService, hashPassword } = require('../services/backend/src/admin-service.js');
const { AuthService } = require('../services/backend/src/auth-service.js');
const { readConfig } = require('../services/backend/src/config.js');
const { createDatabase, MemoryDocumentDatabase } = require('../services/backend/src/db.js');
const { LocalGameService } = require('../services/backend/src/game-service.js');
const { createBackendServer } = require('../services/backend/src/server.js');
const { CODEC_VERSION } = require('../services/backend/src/codec.js');
const { decodeProtobufFrame, encodeProtobufFrame } = require('../services/backend/src/protobuf.js');
const { issueAppToken, issueSocketToken, verifyAppToken, verifySocketToken } = require('../services/backend/src/tokens.js');
const { WebSocket } = require('../services/backend/node_modules/ws');

const TEST_INITIAL_USERNAME = 'bootstrap-owner';
const TEST_INITIAL_PASSWORD = 'test-only-bootstrap-pass';

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
  INITIAL_ADMIN_USERNAME: TEST_INITIAL_USERNAME,
  INITIAL_ADMIN_PASSWORD: TEST_INITIAL_PASSWORD,
});
assert(config.databaseDriver === 'mongodb', 'backend should default to MongoDB storage');

let missingMongoUriRejected = false;
try {
  await createDatabase(config);
} catch (err) {
  missingMongoUriRejected = err && err.code === 'MONGODB_URI_REQUIRED';
}
assert(missingMongoUriRejected, 'MongoDB storage should require MONGODB_URI');

const appToken = issueAppToken('openid-a', config, { now: 1000, ttlMs: 5000, nonce: 'app-nonce' });
assert(verifyAppToken(appToken.token, config, { now: 2000 }).openid === 'openid-a', 'app token should verify');
assert(!verifyAppToken(appToken.token, config, { now: 7000 }).ok, 'expired app token should fail');
const socketToken = issueSocketToken('openid-a', config, { now: 1000, ttlMs: 5000, nonce: 'socket-nonce' });
assert(verifySocketToken(socketToken.token, config, { now: 2000 }).openid === 'openid-a', 'socket token should verify');
assert(!verifySocketToken(socketToken.token, config, { now: 2000, openid: 'openid-b' }).ok, 'socket openid mismatch should fail');
const protobufFixture = {
  type: 'delta',
  codecVersion: CODEC_VERSION,
  requestId: 'pb-fixture',
  roomId: 'room-pb',
  version: 3,
  eventSeq: 2,
  ok: true,
  payload: { baseVersion: 2, delta: { appendDiscard: { seat: 0, cardCode: 0 } } },
};
const decodedProtobufFixture = decodeProtobufFrame(encodeProtobufFrame(protobufFixture));
assert(
  decodedProtobufFixture.type === protobufFixture.type
  && decodedProtobufFixture.codecVersion === protobufFixture.codecVersion
  && decodedProtobufFixture.requestId === protobufFixture.requestId
  && decodedProtobufFixture.roomId === protobufFixture.roomId
  && decodedProtobufFixture.version === protobufFixture.version
  && decodedProtobufFixture.eventSeq === protobufFixture.eventSeq
  && decodedProtobufFixture.payload.delta.appendDiscard.cardCode === 0,
  'server protobuf frame should preserve the JSON envelope semantics'
);

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
const codeOnlyLogin = await auth.login({ code: 'dev-code' });
assert(codeOnlyLogin.user.nickName === '测试玩家' && codeOnlyLogin.user.avatarUrl === 'avatar.png', 'code-only login should recover stored user profile');
await auth.login({ code: 'dev-code', profile: { nickName: '新昵称' } });
const mergedUser = await db.collection('users').doc('openid-a').get();
assert(mergedUser.data.nickName === '新昵称' && mergedUser.data.avatarUrl === 'avatar.png', 'partial profile login should not clear stored avatar');

const game = new LocalGameService({ db });
const ping = await game.callAction('ping', 'openid-a', {});
assert(ping.ok && ping.openid === 'openid-a', 'local game service should inject openid');
const unknown = await game.callAction('missing', 'openid-a', {});
assert(!unknown.ok && unknown.error === 'UNKNOWN_ACTION', 'local game service should reject unknown actions');

const clientLogMessages = [];
const app = await createBackendServer({
  config,
  db,
  logger: {
    info(message, detail) {
      clientLogMessages.push({ level: 'info', message, detail });
    },
    warn() {},
    error() {},
  },
});
await app.listen(0);
const address = app.server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const health = await fetch(`${baseUrl}/healthz`).then((res) => res.json());
assert(health.ok && health.service === 'huapai-backend', 'healthz should respond');
const clientLogRes = await fetch(`${baseUrl}/api/client-log`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    sessionId: 'diag-session',
    source: 'unit-test',
    events: [
      {
        event: 'render-metrics-canonical-shrink-rejected',
        detail: {
          token: 'should-not-leak',
          windowInfo: { windowWidth: 520, windowHeight: 390, screenWidth: 844, screenHeight: 390 },
        },
      },
    ],
  }),
}).then((res) => res.json());
assert(clientLogRes.ok && clientLogRes.accepted === 1, 'client log endpoint should accept diagnostic events');
assert(
  clientLogMessages.some((log) => log.message === '[client-log] render-diagnostics'
    && log.detail
    && log.detail.sessionId === 'diag-session'
    && log.detail.events[0].detail.token === '[redacted]'),
  'client log endpoint should emit sanitized render diagnostics'
);
assert(!JSON.stringify(clientLogMessages).includes('should-not-leak'), 'client diagnostic logs must redact token-like fields');
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

const adminConfig = readConfig({
  PORT: '0',
  PUBLIC_API_BASE_URL: 'https://api.example.com',
  PUBLIC_SOCKET_URL: 'wss://api.example.com/ws',
  APP_TOKEN_SECRET: 'app-secret',
  SOCKET_TOKEN_SECRET: 'socket-secret',
  ADMIN_SESSION_SECRET: 'admin-secret',
  INITIAL_ADMIN_USERNAME: TEST_INITIAL_USERNAME,
  INITIAL_ADMIN_PASSWORD: TEST_INITIAL_PASSWORD,
});
assert(adminConfig.initialAdminPassword === TEST_INITIAL_PASSWORD, 'admin bootstrap password should be readable by the initializer');
assert(!Object.keys(adminConfig).includes('initialAdminPassword'), 'admin bootstrap password should not be enumerable');
assert(!JSON.stringify(adminConfig).includes(TEST_INITIAL_PASSWORD), 'serialized config should not expose the admin bootstrap password');

const missingInitialDb = new MemoryDocumentDatabase();
const missingInitialAdmin = new AdminService({ config: readConfig({ ADMIN_SESSION_SECRET: 'admin-secret' }), db: missingInitialDb });
let missingInitialError = null;
try {
  await missingInitialAdmin.ensureInitialAdmin();
} catch (err) {
  missingInitialError = err;
}
assert(missingInitialError && missingInitialError.code === 'INITIAL_ADMIN_USERNAME_REQUIRED', 'empty admin storage should require bootstrap configuration');
assert(!JSON.stringify(missingInitialError).includes(TEST_INITIAL_PASSWORD), 'bootstrap configuration errors should not expose credentials');

const invalidInitialAdmin = new AdminService({
  config: readConfig({ INITIAL_ADMIN_USERNAME: 'invalid username', INITIAL_ADMIN_PASSWORD: TEST_INITIAL_PASSWORD }),
  db: new MemoryDocumentDatabase(),
});
let invalidInitialError = null;
try {
  await invalidInitialAdmin.ensureInitialAdmin();
} catch (err) {
  invalidInitialError = err;
}
assert(invalidInitialError && invalidInitialError.code === 'INITIAL_ADMIN_USERNAME_INVALID', 'invalid bootstrap username should reject initialization');

const existingAdminDb = new MemoryDocumentDatabase();
const existingPassword = hashPassword('existing-test-password');
await existingAdminDb.collection('adminUsers').doc('existing-owner').set({ data: {
  username: 'existing-owner', role: 'superadmin', enabled: true, defaultAdmin: true,
  createdAt: 'existing', updatedAt: 'existing', createdBy: 'migration',
  salt: existingPassword.salt, passwordHash: existingPassword.passwordHash,
} });
const existingAdminService = new AdminService({ config: readConfig({}), db: existingAdminDb });
await existingAdminService.ensureInitialAdmin();
const existingAdminSnap = await existingAdminDb.collection('adminUsers').limit(10).get();
assert(existingAdminSnap.data.length === 1 && existingAdminSnap.data[0].updatedAt === 'existing', 'existing admins should not be created or overwritten');

const adminDb = new MemoryDocumentDatabase();
await adminDb.collection('rooms').doc('room-a').set({
  data: {
    status: 'waiting',
    seatCount: 4,
    hostOpenid: 'openid-a',
    players: [{ seat: 0, openid: 'openid-a', nickName: '保留用户', avatarUrl: '' }],
    settings: { maxRounds: 2, repeatRound: false, washTwice: false, payType: 'pihu' },
    state: { seats: [], phase: 'waiting' },
    version: 0,
    createdAt: 1000,
    updatedAt: 2000,
  },
});
await adminDb.collection('rooms').doc('room-b').set({
  data: { status: 'playing', hostOpenid: 'openid-b', createdAt: 1500, updatedAt: 2500 },
});
await adminDb.collection('roomStates').doc('room-a').set({ data: { version: 1 } });
await adminDb.collection('matchQueue').doc('openid-a').set({ data: { status: 'waiting' } });
await adminDb.collection('users').doc('openid-a').set({
  data: { openid: 'openid-a', nickName: '保留用户', totalScore: 12, createdAt: 1000, lastLoginAt: 3000 },
});
await adminDb.collection('users').doc('openid-b').set({
  data: { openid: 'openid-b', nickName: '后来者', totalScore: 5, createdAt: 1200, lastLoginAt: 4000 },
});
await adminDb.collection('users').doc('openid-temp').set({
  data: { openid: 'openid-temp', nickName: '待删除', totalScore: 0, createdAt: 1300, lastLoginAt: 500 },
});
await adminDb.collection('users').doc('openid-temp2').set({
  data: { openid: 'openid-temp2', nickName: '待批量删除甲', totalScore: 0, createdAt: 1300, lastLoginAt: 600 },
});
await adminDb.collection('users').doc('openid-temp3').set({
  data: { openid: 'openid-temp3', nickName: '待批量删除乙', totalScore: 0, createdAt: 1300, lastLoginAt: 700 },
});
const adminApp = await createBackendServer({ config: adminConfig, db: adminDb });
await adminApp.listen(0);
const adminBase = `http://127.0.0.1:${adminApp.server.address().port}`;
const adminPage = await fetch(`${adminBase}/admin`);
assert(adminPage.status === 404, 'Node backend should no longer render the admin page');
const adminApiUnauthorized = await fetch(`${adminBase}/api/admin/status`, {
  headers: { authorization: 'Bearer wrong' },
});
assert(adminApiUnauthorized.status === 401, 'admin api should reject an invalid session token');
const roomsListUnauthorized = await fetch(`${adminBase}/api/admin/rooms`, { headers: { authorization: 'Bearer wrong' } });
assert(roomsListUnauthorized.status === 401, 'admin rooms list should reject an invalid session token');
const roomsCloseUnauthorized = await fetch(`${adminBase}/api/admin/rooms/close`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer wrong' },
  body: JSON.stringify({ roomId: 'room-a' }),
});
assert(roomsCloseUnauthorized.status === 401, 'admin room close should reject an invalid session token');
const usersListUnauthorized = await fetch(`${adminBase}/api/admin/users`, { headers: { authorization: 'Bearer wrong' } });
assert(usersListUnauthorized.status === 401, 'admin users list should reject an invalid session token');
const usersDeleteUnauthorized = await fetch(`${adminBase}/api/admin/users/delete`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer wrong' },
  body: JSON.stringify({ openid: 'openid-a' }),
});
assert(usersDeleteUnauthorized.status === 401, 'admin user delete should reject an invalid session token');
const adminLoginFailed = await fetch(`${adminBase}/api/admin/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: TEST_INITIAL_USERNAME, password: 'wrong' }),
});
assert(adminLoginFailed.status === 401, 'admin login should reject wrong password');
const adminLogin = await fetch(`${adminBase}/api/admin/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: TEST_INITIAL_USERNAME, password: TEST_INITIAL_PASSWORD }),
}).then((res) => res.json());
assert(adminLogin.ok && adminLogin.token && adminLogin.admin.role === 'superadmin', 'initial superadmin should login');
const adminAuthHeaders = { authorization: `Bearer ${adminLogin.token}` };
const adminMe = await fetch(`${adminBase}/api/admin/me`, { headers: adminAuthHeaders }).then((res) => res.json());
assert(adminMe.ok && adminMe.admin.username === TEST_INITIAL_USERNAME, 'admin me should return current admin');
const adminList = await fetch(`${adminBase}/api/admin/admins`, { headers: adminAuthHeaders }).then((res) => res.json());
assert(adminList.ok && adminList.admins.some((item) => item.username === TEST_INITIAL_USERNAME), 'superadmin should list admins');
assert(!JSON.stringify(adminList).includes('passwordHash') && !JSON.stringify(adminList).includes('salt'), 'admin list should hide password fields');
const createAdmin = await fetch(`${adminBase}/api/admin/admins`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...adminAuthHeaders },
  body: JSON.stringify({ username: 'opsadmin', password: 'ops-pass-123', role: 'admin' }),
}).then((res) => res.json());
assert(createAdmin.ok && createAdmin.admin.username === 'opsadmin', 'superadmin should create an admin');
const duplicateAdmin = await fetch(`${adminBase}/api/admin/admins`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...adminAuthHeaders },
  body: JSON.stringify({ username: 'opsadmin', password: 'ops-pass-123', role: 'admin' }),
}).then((res) => res.json());
assert(!duplicateAdmin.ok && duplicateAdmin.error === 'ADMIN_ALREADY_EXISTS', 'duplicate admin username should be rejected');
const opsLogin = await fetch(`${adminBase}/api/admin/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'opsadmin', password: 'ops-pass-123' }),
}).then((res) => res.json());
assert(opsLogin.ok && opsLogin.admin.role === 'admin', 'created admin should login');
const opsAuthHeaders = { authorization: `Bearer ${opsLogin.token}` };
const opsAdminList = await fetch(`${adminBase}/api/admin/admins`, { headers: opsAuthHeaders });
assert(opsAdminList.status === 403, 'regular admin should not list admins');
const disableDefaultAdmin = await fetch(`${adminBase}/api/admin/admins/disable`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...adminAuthHeaders },
  body: JSON.stringify({ username: TEST_INITIAL_USERNAME }),
}).then((res) => res.json());
assert(!disableDefaultAdmin.ok && disableDefaultAdmin.error === 'ADMIN_DEFAULT_CANNOT_DISABLE', 'initial superadmin should not be disabled');
const disableOpsAdmin = await fetch(`${adminBase}/api/admin/admins/disable`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...adminAuthHeaders },
  body: JSON.stringify({ username: 'opsadmin' }),
}).then((res) => res.json());
assert(disableOpsAdmin.ok && disableOpsAdmin.admin.enabled === false, 'superadmin should disable regular admins');
const disabledOpsStatus = await fetch(`${adminBase}/api/admin/status`, { headers: opsAuthHeaders });
assert(disabledOpsStatus.status === 401, 'disabled admin sessions should stop working');
const adminStatus = await fetch(`${adminBase}/api/admin/status`, {
  headers: adminAuthHeaders,
}).then((res) => res.json());
const roomsStatus = adminStatus.collections.find((item) => item.name === 'rooms');
const roomStatesStatus = adminStatus.collections.find((item) => item.name === 'roomStates');
assert(adminStatus.ok && roomsStatus.count === 2 && roomStatesStatus.count === 1, 'admin status should count managed collections');

const roomsList = await fetch(`${adminBase}/api/admin/rooms`, { headers: adminAuthHeaders }).then((res) => res.json());
assert(roomsList.ok && roomsList.rooms.length === 2, 'admin rooms list should return every seeded room');
const roomARow = roomsList.rooms.find((item) => item.roomId === 'room-a');
assert(roomARow && roomARow.status === 'waiting' && roomARow.hostOpenid === 'openid-a', 'admin rooms list should surface real room fields');
assert(roomARow.players.length === 1 && roomARow.players[0].nickName === '保留用户', 'admin rooms list should surface seated players');
assert(!('state' in roomARow), 'admin rooms list should strip the heavy engine state field');
const roomBClose = await fetch(`${adminBase}/api/admin/rooms/close`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...adminAuthHeaders },
  body: JSON.stringify({ roomId: 'room-b' }),
}).then((res) => res.json());
assert(roomBClose.ok && roomBClose.room.status === 'closed', 'admin should be able to force-close a room');
const roomBCloseAgain = await fetch(`${adminBase}/api/admin/rooms/close`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...adminAuthHeaders },
  body: JSON.stringify({ roomId: 'room-b' }),
}).then((res) => res.json());
assert(roomBCloseAgain.ok && roomBCloseAgain.room.status === 'closed', 'closing an already-closed room should be idempotent');
const roomCloseMissing = await fetch(`${adminBase}/api/admin/rooms/close`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...adminAuthHeaders },
  body: JSON.stringify({ roomId: 'no-such-room' }),
}).then((res) => res.json());
assert(!roomCloseMissing.ok && roomCloseMissing.error === 'ADMIN_ROOM_NOT_FOUND', 'closing an unknown room should fail clearly');

const usersList = await fetch(`${adminBase}/api/admin/users`, { headers: adminAuthHeaders }).then((res) => res.json());
assert(usersList.ok && usersList.users.length === 5, 'admin users list should return every seeded player');
assert(usersList.users[0].openid === 'openid-b', 'admin users list should sort by most recent login first');
const userARow = usersList.users.find((item) => item.openid === 'openid-a');
assert(userARow && userARow.nickName === '保留用户' && userARow.totalScore === 12, 'admin users list should surface real player fields');

const deleteMissingUser = await fetch(`${adminBase}/api/admin/users/delete`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...adminAuthHeaders },
  body: JSON.stringify({ openid: 'no-such-user' }),
}).then((res) => res.json());
assert(!deleteMissingUser.ok && deleteMissingUser.error === 'ADMIN_USER_NOT_FOUND', 'deleting an unknown player should fail clearly');
const deleteUser = await fetch(`${adminBase}/api/admin/users/delete`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...adminAuthHeaders },
  body: JSON.stringify({ openid: 'openid-temp' }),
}).then((res) => res.json());
assert(deleteUser.ok && deleteUser.deleted.length === 1 && deleteUser.deleted[0] === 'openid-temp', 'admin should be able to delete a single player profile (legacy singular field)');
assert(await adminDb.collection('users').countDocuments({}) === 4, 'deleted player should no longer be present');
const usersListAfterDelete = await fetch(`${adminBase}/api/admin/users`, { headers: adminAuthHeaders }).then((res) => res.json());
assert(
  usersListAfterDelete.ok && !usersListAfterDelete.users.some((item) => item.openid === 'openid-temp'),
  'deleted player should no longer appear in the admin users list'
);

const deleteBatch = await fetch(`${adminBase}/api/admin/users/delete`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...adminAuthHeaders },
  body: JSON.stringify({ openids: ['openid-temp2', 'openid-temp3', 'no-such-user-2'] }),
}).then((res) => res.json());
assert(deleteBatch.ok, 'batch delete should succeed when at least one target exists');
assert(
  deleteBatch.deleted.length === 2 && deleteBatch.deleted.includes('openid-temp2') && deleteBatch.deleted.includes('openid-temp3'),
  'batch delete should delete every existing target'
);
assert(deleteBatch.notFound.length === 1 && deleteBatch.notFound[0] === 'no-such-user-2', 'batch delete should report targets that were not found without failing the whole batch');
assert(await adminDb.collection('users').countDocuments({}) === 2, 'both batch-deleted players should no longer be present');

const forbiddenClear = await fetch(`${adminBase}/api/admin/clear`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...adminAuthHeaders },
  body: JSON.stringify({ collection: 'users', confirm: 'CLEAR' }),
}).then((res) => res.json());
assert(!forbiddenClear.ok && forbiddenClear.error === 'ADMIN_COLLECTION_NOT_ALLOWED', 'admin clear should reject collections outside the allowlist');
const missingConfirm = await fetch(`${adminBase}/api/admin/clear`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...adminAuthHeaders },
  body: JSON.stringify({ collection: 'rooms', confirm: 'NO' }),
}).then((res) => res.json());
assert(!missingConfirm.ok && missingConfirm.error === 'ADMIN_CONFIRM_REQUIRED', 'admin clear should require explicit confirmation');
const clearRooms = await fetch(`${adminBase}/api/admin/clear`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...adminAuthHeaders },
  body: JSON.stringify({ collection: 'rooms', confirm: 'CLEAR' }),
}).then((res) => res.json());
assert(clearRooms.ok && clearRooms.deleted.rooms === 2, 'admin clear should delete one managed collection');
assert(await adminDb.collection('users').countDocuments({}) === 2, 'admin clear should leave non-managed collections untouched');
const clearAll = await fetch(`${adminBase}/api/admin/clear`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...adminAuthHeaders },
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

function waitForCloseOrError(ws) {
  return new Promise((resolve) => {
    const done = () => resolve();
    ws.once('close', done);
    ws.once('error', done);
    setTimeout(done, 120);
  });
}

function waitForMessage(ws, predicate = () => true) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      resolve(null);
    }, 120);
    function onMessage(raw) {
      let parsed = null;
      try {
        parsed = JSON.parse(String(raw));
      } catch (err) {
        parsed = null;
      }
      if (!predicate(parsed)) return;
      clearTimeout(timer);
      ws.off('message', onMessage);
      resolve(parsed);
    }
    ws.on('message', onMessage);
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseSocketMessage(raw) {
  try {
    return JSON.parse(String(raw));
  } catch (err) {
    return decodeProtobufFrame(raw);
  }
}

let rejectPullForB = false;
const socketMessages = { a: [], b: [] };
const socketConnectionEvents = [];
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
  async setConnection(openid, roomId, online) {
    socketConnectionEvents.push({ openid, roomId, online });
    return { ok: true, roomId, version: 1, room: { roomId, players: [] } };
  },
  async op(openid, request) {
    return {
      ok: true,
      roomId: request.roomId,
      version: 2,
      yourSeat: 0,
      public: {
        seats: [],
        phase: 'human-response',
        currentSeat: 0,
        feedback: '等待响应',
        responseSummary: {
          active: true,
          sourceSeat: 3,
          sourceType: 'discard',
          cardId: 'discard-a',
          waitingSeats: [0, 1],
          decidedSeats: [],
        },
        pendingActions: [
          { type: 'zhao', label: '招4张1对', seat: 0, priority: 4, card: { id: 'discard-a', key: 'shang' } },
          { type: 'peng', label: '碰', seat: 0, priority: 3, card: { id: 'discard-a', key: 'shang' } },
          { type: 'peng', label: '碰', seat: 1, priority: 3, card: { id: 'discard-a', key: 'shang' } },
        ],
        playerActions: [],
      },
      private: { seat: 0, hand: [{ id: 'actor-private-card' }] },
      animation: {
        waiting: true,
        latestEventSeq: 2,
        currentEvent: {
          eventSeq: 2,
          type: 'discard',
          seat: 0,
          card: { id: 'discard-a', key: 'shang' },
          discardIndex: 0,
        },
      },
    };
  },
  async ackAnimation(openid, request) {
    return {
      ok: true,
      roomId: request.roomId,
      version: 3,
      yourSeat: openid === 'openid-a' ? 0 : 1,
      public: { seats: [], phase: 'human-response', currentSeat: 0 },
      private: { seat: openid === 'openid-a' ? 0 : 1, playerActions: [{ type: 'pass', seat: openid === 'openid-a' ? 0 : 1 }] },
      animation: { waiting: true, selfAcked: true, currentEvent: { eventSeq: request.eventSeq, type: 'discard' }, latestEventSeq: request.eventSeq },
      advanced: false,
    };
  },
};
const quietSocketLogger = { info() {}, warn() {} };
const socketApp = await createBackendServer({ config, db: new MemoryDocumentDatabase(), game: socketGame, logger: quietSocketLogger });
await socketApp.listen(0);
const socketPort = socketApp.server.address().port;
const wsA = new WebSocket(`ws://127.0.0.1:${socketPort}/ws?token=${encodeURIComponent(issueSocketToken('openid-a', config).token)}`);
const wsB = new WebSocket(`ws://127.0.0.1:${socketPort}/ws?token=${encodeURIComponent(issueSocketToken('openid-b', config).token)}`);
wsA.on('message', (raw) => socketMessages.a.push(parseSocketMessage(raw)));
wsB.on('message', (raw) => socketMessages.b.push(parseSocketMessage(raw)));
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
const deltaToB = socketMessages.b.find((message) => message.type === 'delta');
const deltaToA = socketMessages.a.find((message) => message.type === 'delta');
const snapshotToB = socketMessages.b.find((message) => message.type === 'snapshot');
assert(deltaToB, 'normal socket operation broadcast should use an incremental delta');
assert(deltaToA, 'normal socket operation broadcast should send a personalized delta to the actor');
assert(!snapshotToB, 'normal socket operation broadcast should not send a full snapshot to peers');
assert(
  deltaToB.payload
  && deltaToB.payload.baseVersion === 1
  && deltaToB.payload.version === 2
  && deltaToB.payload.delta
  && deltaToB.payload.delta.appendDiscard
  && deltaToB.payload.delta.appendDiscard.card.id === 'discard-a',
  'discard delta should carry baseVersion, version, eventSeq and appendDiscard'
);
assert(
  deltaToA.payload.delta.privatePatch
  && deltaToA.payload.delta.privatePatch.seat === 0
  && deltaToA.payload.delta.privatePatch.playerActions.some((action) => action.type === 'zhao')
  && deltaToA.payload.delta.privatePatch.playerActions.some((action) => action.type === 'pass'),
  'actor delta should include only the actor private response actions'
);
assert(
  deltaToB.payload.delta.privatePatch
  && deltaToB.payload.delta.privatePatch.seat === 1
  && deltaToB.payload.delta.privatePatch.playerActions.some((action) => action.type === 'peng')
  && deltaToB.payload.delta.privatePatch.playerActions.some((action) => action.type === 'pass')
  && !deltaToB.payload.delta.privatePatch.playerActions.some((action) => action.type === 'zhao'),
  'peer delta should include only that peer private response actions'
);
assert(
  !deltaToB.payload.delta.publicPatch.pendingActions.length
  && !deltaToB.payload.delta.publicPatch.playerActions.length,
  'public delta patch must not leak response action lists'
);
assert(!leakedToB, 'socket broadcast should never fall back to another player private snapshot');
socketMessages.a.length = 0;
socketMessages.b.length = 0;
wsA.send(JSON.stringify({ type: 'ackAnimation', requestId: 'ack-a', roomId: 'room-1', eventSeq: 7 }));
await wait(80);
const ackResponseToA = socketMessages.a.some((message) => message.type === 'ackAnimation:result' && message.requestId === 'ack-a');
const ackBroadcastToB = socketMessages.b.some((message) => message.type === 'snapshot');
assert(ackResponseToA, 'ackAnimation should respond to the acknowledging client');
assert(socketMessages.a.some((message) => message.codecVersion === CODEC_VERSION), 'socket responses should include the codec version');
assert(!ackBroadcastToB, 'ackAnimation without public advancement should not broadcast stale selfAcked snapshots to peers');
socketMessages.a.length = 0;
wsA.send(JSON.stringify({ type: 'ping', requestId: 'bad-codec', codecVersion: 999 }));
await wait(80);
assert(
  socketMessages.a.some((message) => (
    message.type === 'error'
    && message.requestId === 'bad-codec'
    && message.error === 'CODEC_VERSION_UNSUPPORTED'
  )),
  'socket should reject unsupported codec versions before dispatching handlers'
);
const protobufMessages = [];
const protobufRawKinds = [];
const wsProtobuf = new WebSocket(`ws://127.0.0.1:${socketPort}/ws?token=${encodeURIComponent(issueSocketToken('openid-a', config).token)}`);
wsProtobuf.on('message', (raw, isBinary) => {
  protobufRawKinds.push(isBinary ? 'binary' : 'text');
  protobufMessages.push(parseSocketMessage(raw));
});
await waitForOpen(wsProtobuf);
wsProtobuf.send(encodeProtobufFrame({
  type: 'subscribe',
  codecVersion: CODEC_VERSION,
  requestId: 'sub-pb',
  roomId: 'room-1',
  payload: { transport: { protobuf: true } },
}));
await wait(80);
assert(
  protobufRawKinds.includes('binary')
  && protobufMessages.some((message) => message.type === 'subscribe:result' && message.requestId === 'sub-pb'),
  'protobuf-capable subscribers should receive protobuf binary responses with JSON-equivalent semantics'
);
wsProtobuf.close();
wsA.close();
wsB.close();
await socketApp.close();
rejectPullForB = false;

const jsonRollbackMessages = [];
const jsonRollbackRawKinds = [];
const jsonRollbackConfig = readConfig({
  PORT: '0',
  PUBLIC_API_BASE_URL: 'https://api.example.com',
  PUBLIC_SOCKET_URL: 'wss://api.example.com/ws',
  APP_TOKEN_SECRET: 'app-secret',
  SOCKET_TOKEN_SECRET: 'socket-secret',
  BACKEND_DEV_OPENID: 'openid-a',
  SOCKET_PROTOBUF_ENABLED: '0',
  INITIAL_ADMIN_USERNAME: TEST_INITIAL_USERNAME,
  INITIAL_ADMIN_PASSWORD: TEST_INITIAL_PASSWORD,
});
const jsonRollbackApp = await createBackendServer({ config: jsonRollbackConfig, db: new MemoryDocumentDatabase(), game: socketGame, logger: quietSocketLogger });
await jsonRollbackApp.listen(0);
const jsonRollbackPort = jsonRollbackApp.server.address().port;
const wsJsonRollback = new WebSocket(`ws://127.0.0.1:${jsonRollbackPort}/ws?token=${encodeURIComponent(issueSocketToken('openid-a', jsonRollbackConfig).token)}`);
wsJsonRollback.on('message', (raw, isBinary) => {
  jsonRollbackRawKinds.push(isBinary ? 'binary' : 'text');
  jsonRollbackMessages.push(parseSocketMessage(raw));
});
await waitForOpen(wsJsonRollback);
wsJsonRollback.send(encodeProtobufFrame({
  type: 'subscribe',
  codecVersion: CODEC_VERSION,
  requestId: 'sub-json-rollback',
  roomId: 'room-1',
  payload: { transport: { protobuf: true } },
}));
await wait(80);
assert(
  jsonRollbackMessages.some((message) => message.type === 'subscribe:result' && message.requestId === 'sub-json-rollback')
  && jsonRollbackRawKinds.every((kind) => kind === 'text'),
  'disabling protobuf should keep JSON responses even when the client declares protobuf support'
);
wsJsonRollback.close();
await jsonRollbackApp.close();

const socketLogs = [];
const socketLogger = {
  info(message, detail) { socketLogs.push({ level: 'info', message, detail }); },
  warn(message, detail) { socketLogs.push({ level: 'warn', message, detail }); },
};
const socketLogConfig = readConfig({
  PORT: '0',
  PUBLIC_API_BASE_URL: 'https://api.example.com',
  PUBLIC_SOCKET_URL: 'wss://api.example.com/ws',
  APP_TOKEN_SECRET: 'app-secret',
  SOCKET_TOKEN_SECRET: 'socket-secret',
  BACKEND_DEV_OPENID: 'openid-a',
  SOCKET_HEARTBEAT_MS: '10',
  SOCKET_CONNECTION_TIMEOUT_MS: '1000',
  INITIAL_ADMIN_USERNAME: TEST_INITIAL_USERNAME,
  INITIAL_ADMIN_PASSWORD: TEST_INITIAL_PASSWORD,
});
const socketLogApp = await createBackendServer({
  config: socketLogConfig,
  db: new MemoryDocumentDatabase(),
  game: socketGame,
  logger: socketLogger,
});
await socketLogApp.listen(0);
const socketLogPort = socketLogApp.server.address().port;
const invalidToken = 'invalid-token-secret';
const invalidWs = new WebSocket(`ws://127.0.0.1:${socketLogPort}/ws?token=${encodeURIComponent(invalidToken)}`);
invalidWs.on('error', () => {});
await waitForCloseOrError(invalidWs);
const authLog = socketLogs.find((log) => log.message === '[socket] auth failed');
assert(
  authLog
  && authLog.level === 'warn'
  && authLog.detail
  && authLog.detail.reason,
  'socket auth failures should emit a diagnosable warning'
);
assert(!JSON.stringify(socketLogs).includes(invalidToken), 'socket auth failure logs must not include token values');

const pingWs = new WebSocket(`ws://127.0.0.1:${socketLogPort}/ws?token=${encodeURIComponent(issueSocketToken('openid-a', socketLogConfig).token)}`);
await waitForOpen(pingWs);
const logCountBeforePing = socketLogs.length;
pingWs.send(JSON.stringify({ type: 'ping', requestId: 'ping-log-check' }));
await wait(8);
assert(socketLogs.length === logCountBeforePing, 'successful ping should not create socket lifecycle logs');
pingWs.close();
await waitForCloseOrError(pingWs);

const closeWs = new WebSocket(`ws://127.0.0.1:${socketLogPort}/ws?token=${encodeURIComponent(issueSocketToken('openid-a', socketLogConfig).token)}`);
await waitForOpen(closeWs);
closeWs.send(JSON.stringify({ type: 'subscribe', requestId: 'log-sub', roomId: 'room-log' }));
await waitForMessage(closeWs, (message) => message && message.requestId === 'log-sub');
socketConnectionEvents.length = 0;
closeWs.close(4001, 'unit close');
await waitForCloseOrError(closeWs);
await wait(40);
const closeLog = socketLogs.find((log) => log.message === '[socket] connection close' && log.detail && log.detail.roomId === 'room-log');
assert(
  closeLog
  && closeLog.detail.connectionId
  && closeLog.detail.openid === 'openid-a'
  && closeLog.detail.code === 4001
  && closeLog.detail.reason === 'unit close',
  'socket close logs should include connection context and close reason'
);
assert(
  socketConnectionEvents.some((event) => event.roomId === 'room-log' && event.openid === 'openid-a' && event.online === false),
  'ordinary socket close should refresh connection state and mark the player offline when no room connection remains'
);

const timeoutWs = new WebSocket(`ws://127.0.0.1:${socketLogPort}/ws?token=${encodeURIComponent(issueSocketToken('openid-b', socketLogConfig).token)}`);
await waitForOpen(timeoutWs);
timeoutWs.send(JSON.stringify({ type: 'subscribe', requestId: 'timeout-sub', roomId: 'room-timeout' }));
await waitForMessage(timeoutWs, (message) => message && message.requestId === 'timeout-sub');
socketConnectionEvents.length = 0;
Array.from(socketLogApp.socket.registry.byId.values()).forEach((connection) => {
  if (connection.openid === 'openid-b') connection.lastSeenAt = Date.now() - 1500;
});
await wait(150);
const timeoutLog = socketLogs.find((log) => log.message === '[socket] heartbeat timeout' && log.detail && log.detail.roomId === 'room-timeout');
assert(
  timeoutLog
  && timeoutLog.level === 'warn'
  && timeoutLog.detail.connectionId
  && timeoutLog.detail.openid === 'openid-b'
  && timeoutLog.detail.timeoutMs === 1000,
  'socket heartbeat timeout should be logged with connection context'
);
assert(
  socketConnectionEvents.some((event) => event.roomId === 'room-timeout' && event.openid === 'openid-b' && event.online === false),
  'socket heartbeat timeout should mark the timed-out player offline'
);
timeoutWs.close();
await waitForCloseOrError(timeoutWs);
await socketLogApp.close();
const serializedSocketLogs = JSON.stringify(socketLogs);
assert(
  !serializedSocketLogs.includes('Authorization')
  && !serializedSocketLogs.includes('token=')
  && !serializedSocketLogs.includes('invalid-token-secret'),
  'socket diagnostic logs must stay sanitized'
);

console.log('backend checks passed');
