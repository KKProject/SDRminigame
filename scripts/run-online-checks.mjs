import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tempDir = join(root, '.tmp-online-checks');

await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });

await writeFile(join(tempDir, 'cloud.mjs'), await readFile(join(root, 'js/net/cloud.js'), 'utf8'));
await writeFile(join(tempDir, 'codec.mjs'), await readFile(join(root, 'js/net/codec.js'), 'utf8'));
await writeFile(join(tempDir, 'protobuf.mjs'), await readFile(join(root, 'js/net/protobuf.js'), 'utf8'));
await writeFile(
  join(tempDir, 'socket.mjs'),
  (await readFile(join(root, 'js/net/socket.js'), 'utf8'))
    .replace("from './codec'", "from './codec.mjs'")
    .replace("from './protobuf'", "from './protobuf.mjs'")
);
await writeFile(join(tempDir, 'profile.mjs'), await readFile(join(root, 'js/net/profile.js'), 'utf8'));
await writeFile(
  join(tempDir, 'online.mjs'),
  (await readFile(join(root, 'js/net/online.js'), 'utf8'))
    .replace("from '../game/rules'", "from './rules-stub.mjs'")
    .replace("from './cloud'", "from './cloud.mjs'")
    .replace("from './socket'", "from './socket.mjs'")
    .replace("from './codec'", "from './codec.mjs'")
);
await writeFile(join(tempDir, 'rules-stub.mjs'), 'export const DEFAULT_RULES = { seatCount: 4 };');

let callData = null;
let latestLoginToken = '';
globalThis.wx = {
  __HUAPAI_BACKEND_API_BASE_URL: 'https://api.unit.test',
  request(options) {
    callData = options.data;
    if (options.url === 'https://api.unit.test/api/auth/login') {
      latestLoginToken = 'unit-access-token';
      options.success({
        statusCode: 200,
        data: {
          ok: true,
          openid: 'unit-openid',
          user: { nickName: options.data.nickName || '测试玩家', avatarUrl: '' },
          token: latestLoginToken,
          socket: { url: 'ws://unit-test', token: 'socket-token', expiresAt: Date.now() + 60000 },
        },
      });
      return;
    }
    options.success({ statusCode: 200, data: { ok: true } });
  },
  login(options) {
    options.success({ code: 'wx-login-code' });
  },
};

const cloud = await import(pathToFileURL(join(tempDir, 'cloud.mjs')));
const codec = await import(pathToFileURL(join(tempDir, 'codec.mjs')));
const protobuf = await import(pathToFileURL(join(tempDir, 'protobuf.mjs')));
const online = await import(pathToFileURL(join(tempDir, 'online.mjs')));
const profile = await import(pathToFileURL(join(tempDir, 'profile.mjs')));
const socketModule = await import(pathToFileURL(join(tempDir, 'socket.mjs')));

if (codec.SYMBOLS.length !== 24 || codec.PHRASES.length !== 8) {
  throw new Error('client codec should define 24 symbols and 8 phrases');
}
codec.SYMBOLS.forEach((symbol, symbolCode) => {
  if (codec.symbolCodeForKey(symbol.key) !== symbolCode) {
    throw new Error(`client codec symbolCode should round-trip for ${symbol.key}`);
  }
  const decoded = codec.symbolFromCode(symbolCode);
  if (decoded.key !== symbol.key || decoded.text !== symbol.text || decoded.phraseId !== symbol.phraseId) {
    throw new Error(`client codec symbol ${symbolCode} should decode to the configured symbol`);
  }
});
for (let cardCode = 0; cardCode < 144; cardCode++) {
  const card = codec.cardFromCode(cardCode);
  if (codec.cardToCode(card) !== cardCode || codec.cardToCode({ id: card.id }) !== cardCode) {
    throw new Error(`client codec cardCode ${cardCode} should round-trip`);
  }
}
Object.keys(codec.ACTION_CODES).forEach((action) => {
  if (codec.actionFromCode(codec.actionToCode(action)) !== action) {
    throw new Error(`client codec action ${action} should round-trip`);
  }
});
let unknownActionRejected = false;
try {
  codec.actionFromCode(999);
} catch (err) {
  unknownActionRejected = err && err.code === 'CODEC_VALUE_INVALID';
}
if (!unknownActionRejected) {
  throw new Error('client codec should reject unknown action codes');
}
const protobufFixture = {
  type: 'delta',
  codecVersion: codec.CODEC_VERSION,
  requestId: 'pb-1',
  roomId: 'room-pb',
  version: 7,
  eventSeq: 3,
  ok: true,
  payload: { baseVersion: 6, delta: { appendDiscard: { seat: 0, cardCode: 0 } } },
};
const decodedProtobufFixture = protobuf.decodeProtobufFrame(protobuf.encodeProtobufFrame(protobufFixture));
if (
  decodedProtobufFixture.type !== protobufFixture.type
  || decodedProtobufFixture.codecVersion !== protobufFixture.codecVersion
  || decodedProtobufFixture.requestId !== protobufFixture.requestId
  || decodedProtobufFixture.roomId !== protobufFixture.roomId
  || decodedProtobufFixture.version !== protobufFixture.version
  || decodedProtobufFixture.eventSeq !== protobufFixture.eventSeq
  || decodedProtobufFixture.payload.delta.appendDiscard.cardCode !== 0
) {
  throw new Error('client protobuf frame should preserve the JSON envelope semantics');
}
const compactPayload = codec.normalizeTransportPayload({
  actionCode: codec.ACTION_CODES.peng,
  cardCode: 0,
  symbolCode: 0,
  phraseCode: 0,
});
if (
  compactPayload.action !== 'peng'
  || compactPayload.card.id !== 'shang-0'
  || compactPayload.symbol.key !== 'shang'
  || compactPayload.phrase.id !== 'sdr'
) {
  throw new Error('client codec should expand compact payload fields at the transport boundary');
}
let sentSocketPayload = null;
const codecSocket = new socketModule.default();
codecSocket.connected = true;
codecSocket.socket = {
  send(options) {
    sentSocketPayload = JSON.parse(options.data);
  },
};
const codecRequest = codecSocket.request('ping');
if (!sentSocketPayload || sentSocketPayload.codecVersion !== codec.CODEC_VERSION) {
  throw new Error('socket requests should include the supported codec version');
}
codecSocket.handleMessage({
  data: JSON.stringify({
    type: 'pong',
    codecVersion: codec.CODEC_VERSION,
    requestId: sentSocketPayload.requestId,
    payload: { ok: true },
  }),
});
await codecRequest;
let protocolMismatchCode = '';
codecSocket.onProtocolMismatch = (err) => { protocolMismatchCode = err.code; };
codecSocket.handleMessage({ data: JSON.stringify({ type: 'snapshot', codecVersion: 999, payload: {} }) });
if (protocolMismatchCode !== 'CODEC_VERSION_UNSUPPORTED') {
  throw new Error('socket should reject unsupported pushed codec versions');
}
let protobufSentPayload = null;
const protobufSocket = new socketModule.default(globalThis.wx, { useProtobuf: true });
protobufSocket.connected = true;
protobufSocket.socket = {
  send(options) {
    protobufSentPayload = protobuf.decodeProtobufFrame(options.data);
  },
};
const protobufRequest = protobufSocket.request('ping', { roomId: 'room-pb' });
if (
  !protobufSentPayload
  || protobufSentPayload.type !== 'ping'
  || protobufSentPayload.codecVersion !== codec.CODEC_VERSION
) {
  throw new Error('protobuf socket requests should encode the same envelope fields');
}
protobufSocket.handleMessage({
  data: protobuf.encodeProtobufFrame({
    type: 'pong',
    codecVersion: codec.CODEC_VERSION,
    requestId: protobufSentPayload.requestId,
    payload: { ok: true },
  }),
});
await protobufRequest;
protobufSocket.onProtocolMismatch = (err) => { protocolMismatchCode = err.code; };
protobufSocket.handleMessage({ data: new Uint8Array([10, 99]).buffer });
if (protocolMismatchCode !== 'PROTOBUF_DECODE_FAILED') {
  throw new Error('protobuf decode failures should trigger socket recovery');
}

if (online.inviteRoomIdFromOptions({ query: { roomId: '123456' } }) !== '123456') {
  throw new Error('share query parser should read roomId from launch options');
}
if (online.inviteRoomIdFromOptions({ query: { scene: encodeURIComponent('roomId=654321&source=friendInvite') } }) !== '654321') {
  throw new Error('share query parser should read encoded scene roomId');
}
let foregroundInvite = '';
const inviteRuntime = {
  onShow(callback) { this.callback = callback; },
  offShow(callback) { if (this.callback === callback) this.callback = null; },
  getLaunchOptionsSync() { return { query: { roomId: '111222' } }; },
};
const unregisterInvite = online.registerInviteRoomListener((roomId) => { foregroundInvite = roomId; }, inviteRuntime);
if (online.readLaunchInviteRoomId(inviteRuntime) !== '111222') {
  throw new Error('cold launch invite reader should read roomId');
}
inviteRuntime.callback({ query: { roomId: '333444' } });
if (foregroundInvite !== '333444') {
  throw new Error('foreground invite listener should read a new roomId');
}
unregisterInvite();
if (inviteRuntime.callback) {
  throw new Error('foreground invite listener should unregister cleanly');
}

const localIdentity = online.localActionIdentity({ type: 'chi', seat: 0, card: { id: 'incoming-chi', key: 'zi' } });
if (
  !online.localActionMatchesEvent({ identity: localIdentity }, {
    eventSeq: 1,
    type: 'chi',
    seat: 0,
    actingSeat: 0,
    meld: { cards: [{ id: 'incoming-chi', key: 'zi' }] },
  })
  || online.localActionMatchesEvent({ identity: localIdentity }, {
    eventSeq: 2,
    type: 'chi',
    seat: 1,
    actingSeat: 1,
    meld: { cards: [{ id: 'incoming-chi', key: 'zi' }] },
  })
) {
  throw new Error('local action identity should match only the authoritative event owned by the same actor');
}

await cloud.login({ nickName: '测试玩家' });
if (
  !callData
  || callData.code !== 'wx-login-code'
  || callData.nickName !== '测试玩家'
  || !callData.profile
  || callData.profile.nickName !== '测试玩家'
) {
  throw new Error('online login should forward wx.login code and profile to the backend login api');
}

globalThis.wx.login = (options) => options.fail({ errMsg: 'login failed' });
let loginFailure = null;
try {
  await cloud.login();
} catch (err) {
  loginFailure = err;
}
if (!loginFailure || loginFailure.code !== 'WX_LOGIN_FAILED') {
  throw new Error('wx.login failure should stop online login with a diagnosable error');
}

if (online.onlineErrorMessage({ code: 'LOGIN_STORAGE_ERROR' }) !== '登录数据库初始化失败，请检查后端数据库权限') {
  throw new Error('storage login errors should display an actionable message');
}
if (online.onlineErrorMessage({ code: 'BACKEND_ENDPOINT_MISSING' }) !== '自有后端 API 未配置，请设置服务器域名') {
  throw new Error('missing backend endpoint should display an actionable message');
}
if (online.onlineErrorMessage({ code: 'ACTIVE_ROOM_FAILED' }) !== '检查已有房间失败，请重试') {
  throw new Error('active room lookup failures should display an actionable lobby message');
}
if (cloud.cloudErrorCode({ code: 'BACKEND_TIMEOUT' }) !== 'BACKEND_TIMEOUT') {
  throw new Error('backend timeout errors should be normalized');
}

const storage = {};
let profileTap = null;
let createdButton = null;
let buttonShowCount = 0;
const profileRuntime = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; },
  getUserInfo(options) {
    options.success({ userInfo: { nickName: '微信玩家', avatarUrl: 'https://example.com/avatar.png' } });
  },
  createUserInfoButton(options) {
    createdButton = {
      options,
      onTap(callback) { profileTap = callback; },
      show() { buttonShowCount += 1; },
      destroy() {},
    };
    return createdButton;
  },
};
let selectedProfile = null;
profile.createUserProfileButton({ x: 10, y: 20, w: 200, h: 64 }, (value) => {
  selectedProfile = value;
}, profileRuntime);
if (
  !createdButton
  || createdButton.options.text !== '在线对战'
  || createdButton.options.lang !== 'zh_CN'
  || createdButton.options.style.left !== 10
  || createdButton.options.style.width !== 200
  || buttonShowCount !== 1
) {
  throw new Error('online menu should create and show a native user profile button over its canvas button');
}
profileTap({ userInfo: { nickName: ' 微信玩家 ', avatarUrl: 'https://example.com/avatar.png' } });
await new Promise((resolve) => setTimeout(resolve, 0));
if (
  !selectedProfile
  || selectedProfile.nickName !== '微信玩家'
  || selectedProfile.avatarUrl !== 'https://example.com/avatar.png'
) {
  throw new Error('authorized WeChat profile should be normalized and forwarded');
}
const fallbackProfile = profile.profileWithFallback({}, profileRuntime);
if (fallbackProfile.nickName !== '微信玩家' || fallbackProfile.avatarUrl !== 'https://example.com/avatar.png') {
  throw new Error('declined profile request should reuse the stable stored fallback profile');
}
const nestedProfile = profile.extractProfile({
  detail: {
    userInfo: {
      nickName: '嵌套玩家',
      avatarUrl: 'https://example.com/nested.png',
    },
  },
});
if (nestedProfile.nickName !== '嵌套玩家' || nestedProfile.avatarUrl !== 'https://example.com/nested.png') {
  throw new Error('profile callback should support nested userInfo payloads');
}
const rawProfile = profile.extractProfile({
  rawData: JSON.stringify({
    nickName: '原始玩家',
    avatarUrl: 'https://example.com/raw.png',
  }),
});
if (rawProfile.nickName !== '原始玩家' || rawProfile.avatarUrl !== 'https://example.com/raw.png') {
  throw new Error('profile callback should support rawData payloads');
}
const authorizedRuntime = {
  ...profileRuntime,
  getSetting(options) {
    options.success({ authSetting: { 'scope.userInfo': true } });
  },
  getUserInfo(options) {
    options.success({ userInfo: { nickName: '已授权玩家', avatarUrl: 'https://example.com/authorized.png' } });
  },
};
const authorizedProfile = await profile.getAuthorizedProfile(authorizedRuntime);
if (!authorizedProfile || authorizedProfile.nickName !== '已授权玩家') {
  throw new Error('online menu should reuse an already authorized WeChat profile');
}
const unauthorizedProfile = await profile.getAuthorizedProfile({
  getSetting(options) {
    options.success({ authSetting: {} });
  },
});
if (unauthorizedProfile !== null) {
  throw new Error('unauthorized WeChat profile lookup should wait for the native authorization button');
}

globalThis.wx.login = (options) => options.success({ code: 'lobby-login-code' });
globalThis.wx.getStorageSync = () => null;
globalThis.wx.setStorageSync = () => {};
globalThis.wx.removeStorageSync = () => {};
const lobbyDatabus = { selectedCardId: null, setRoundState(state) { Object.assign(this, state); } };
const lobbyRenderer = { releaseOnlineEvent() {} };
const lobbyMusic = {};
const lobbyPublic = {
  seats: [
    { id: 0, nickName: '大厅玩家', handCount: 1, melds: [], discards: [] },
    { id: 1, nickName: '电脑1', handCount: 0, melds: [], discards: [] },
    { id: 2, nickName: '电脑2', handCount: 0, melds: [], discards: [] },
    { id: 3, nickName: '电脑3', handCount: 0, melds: [], discards: [] },
  ],
  phase: 'human-discard',
  currentSeat: 0,
  dealerSeat: 0,
  nextDealerSeat: 0,
  pendingActions: [],
  playerActions: [],
  round: 1,
};
const lobbyPrivate = { hand: [{ id: 'lobby-card', key: 'shang' }] };
let lobbyCalls = [];
let activeRoomResult = { ok: true, hasRoom: false };
let waitingRoomState = null;
let sharedPayload = null;
globalThis.wx.request = (options) => {
  lobbyCalls.push(options);
  if (options.url === 'https://api.unit.test/api/auth/login') {
    latestLoginToken = 'lobby-access-token';
    options.success({
      statusCode: 200,
      data: {
        ok: true,
        openid: 'lobby-openid',
        user: { nickName: '大厅玩家', avatarUrl: 'avatar.png' },
        token: latestLoginToken,
        socket: { url: 'ws://unit-test', token: 'socket-token', expiresAt: Date.now() + 60000 },
      },
    });
    return;
  }
  if (options.url !== 'https://api.unit.test/api/game') throw new Error(`unexpected backend url ${options.url}`);
  if (!options.header || options.header.Authorization !== `Bearer ${latestLoginToken}`) {
    throw new Error('game api should include bearer token');
  }
  const action = options.data && options.data.action;
  if (action === 'activeRoom') {
    options.success({ statusCode: 200, data: activeRoomResult });
    return;
  }
  if (action === 'createRoom') {
    waitingRoomState = {
      roomId: '123456',
      status: 'waiting',
      hostOpenid: 'lobby-openid',
      settings: { maxRounds: options.data.maxRounds },
      players: [
        { seat: 0, openid: 'lobby-openid', nickName: '大厅玩家', ready: false, online: true, isHost: true },
      ],
      humanCount: 1,
      minHumansToStart: 2,
      canStart: false,
      readyToStart: false,
      yourSeat: 0,
      isHost: true,
    };
    options.success({ statusCode: 200, data: { ok: true, roomId: '123456', seat: 0, settings: { maxRounds: options.data.maxRounds }, room: waitingRoomState } });
    return;
  }
  if (action === 'roomInfo') {
    options.success({ statusCode: 200, data: { ok: true, roomId: options.data.roomId, seat: 0, room: waitingRoomState } });
    return;
  }
  if (action === 'setReady') {
    waitingRoomState = {
      ...waitingRoomState,
      players: waitingRoomState.players.map((player) => (player.seat === 0 ? { ...player, ready: true } : player)),
      canStart: waitingRoomState.players.length >= 2,
      readyToStart: waitingRoomState.players.length >= 2,
    };
    options.success({ statusCode: 200, data: { ok: true, roomId: options.data.roomId, seat: 0, room: waitingRoomState } });
    return;
  }
  if (action === 'joinRoom') {
    waitingRoomState = {
      roomId: options.data.roomId,
      status: 'waiting',
      hostOpenid: 'host-openid',
      settings: { maxRounds: 2 },
      players: [
        { seat: 0, openid: 'host-openid', nickName: '房主', ready: true, online: true, isHost: true },
        { seat: 1, openid: 'lobby-openid', nickName: '大厅玩家', ready: false, online: true, isHost: false },
      ],
      humanCount: 2,
      minHumansToStart: 2,
      canStart: false,
      readyToStart: true,
      yourSeat: 1,
      isHost: false,
    };
    options.success({ statusCode: 200, data: { ok: true, roomId: options.data.roomId, seat: 1, room: waitingRoomState } });
    return;
  }
  if (action === 'startRound') {
    options.success({ statusCode: 200, data: { ok: true, roomId: options.data.roomId, version: 1 } });
    return;
  }
  if (action === 'pull') {
    options.success({
      statusCode: 200,
      data: {
        ok: true,
        roomId: options.data.roomId,
        version: 1,
        yourSeat: 0,
        status: 'playing',
        public: lobbyPublic,
        private: lobbyPrivate,
        animation: { waiting: false, currentEvent: null, selfAcked: false },
      },
    });
    return;
  }
  options.success({ statusCode: 200, data: { ok: true } });
};
globalThis.wx.shareAppMessage = (payload) => { sharedPayload = payload; };

const idleLobby = new online.default({ ...lobbyDatabus }, lobbyRenderer, lobbyMusic);
const idleLobbyStates = [];
idleLobby.onLobby = (state) => { idleLobbyStates.push(state); };
const idleLobbyResult = await idleLobby.startLobby({ nickName: '授权大厅' });
if (
  idleLobbyResult.entered
  || idleLobby.lobbyProfile.nickName !== '大厅玩家'
  || idleLobbyStates.map((item) => item.state).join(',') !== `${online.LOBBY_STATES.CHECKING_ROOM},${online.LOBBY_STATES.IDLE}`
  || lobbyCalls.some((call) => call.data && call.data.action === 'createRoom')
) {
  throw new Error('online lobby should show profile, query active room, and wait for explicit room creation when no room exists');
}

const createdLobby = new online.default({ ...lobbyDatabus }, lobbyRenderer, lobbyMusic);
createdLobby.lobbyProfile = { nickName: '大厅玩家', avatarUrl: 'avatar.png' };
let lobbySocketSubscribes = [];
function attachLobbySocket(controller, seat = 0) {
  controller.socketAuth = { url: 'ws://unit-test', token: 'socket-token', expiresAt: Date.now() + 60000 };
  controller.socket = {
    isReady() { return true; },
    connect() { return Promise.resolve(true); },
    subscribe(roomId, version, eventSeq) {
      lobbySocketSubscribes.push({ roomId, version, eventSeq });
      return Promise.resolve({
        ok: true,
        roomId,
        version: 1,
        yourSeat: seat,
        status: 'playing',
        public: lobbyPublic,
        private: lobbyPrivate,
        animation: { waiting: false, currentEvent: null, selfAcked: false },
      });
    },
    request() { return Promise.resolve({ ok: true }); },
    heartbeat() { return Promise.resolve({ ok: true }); },
    close() {},
  };
}
attachLobbySocket(createdLobby, 0);
lobbyCalls = [];
const createdLobbyResult = await createdLobby.createLobbyRoom(4);
if (
  createdLobbyResult.entered
  || !createdLobbyResult.waiting
  || createdLobby.waitingRoom.roomId !== '123456'
  || createdLobby.waitingRoom.settings.maxRounds !== 4
  || !lobbyCalls.find((call) => call.data && call.data.action === 'createRoom' && call.data.maxRounds === 4)
  || lobbyCalls.find((call) => call.data && call.data.action === 'startRound')
) {
  throw new Error('lobby room creation should submit selected maxRounds and enter the waiting room without auto-starting');
}
if (!createdLobby.shareWaitingRoom() || !sharedPayload || sharedPayload.query !== 'roomId=123456&source=friendInvite') {
  throw new Error('waiting room invite should call shareAppMessage with roomId query');
}
await createdLobby.setReady(true);
if (!createdLobby.waitingRoom.players[0].ready || !lobbyCalls.find((call) => call.data && call.data.action === 'setReady')) {
  throw new Error('waiting room ready button should set ready and refresh the public room state');
}
waitingRoomState = {
  ...waitingRoomState,
  players: [
    { seat: 0, openid: 'lobby-openid', nickName: '大厅玩家', ready: true, online: true, isHost: true },
    { seat: 1, openid: 'friend-openid', nickName: '好友', ready: false, online: true, isHost: false },
  ],
  humanCount: 2,
  canStart: true,
  readyToStart: true,
};
if (
  !(await createdLobby.startWaitingRoom())
  || lobbyCalls.find((call) => call.data && call.data.action === 'pull' && call.data.roomId === '123456')
  || !lobbySocketSubscribes.find((call) => call.roomId === '123456')
) {
  throw new Error('host start from waiting room should start the round and enter the online table through socket');
}
createdLobby.destroy();

activeRoomResult = { ok: true, hasRoom: false };
lobbyCalls = [];
const inviteLobby = new online.default({ ...lobbyDatabus }, lobbyRenderer, lobbyMusic);
attachLobbySocket(inviteLobby, 1);
const inviteStates = [];
inviteLobby.onLobby = (state) => { inviteStates.push(state.state); };
const inviteResult = await inviteLobby.startLobby({ nickName: '授权大厅' }, { inviteRoomId: '555666' });
if (
  inviteResult.entered
  || !inviteResult.waiting
  || inviteLobby.waitingRoom.roomId !== '555666'
  || inviteStates.join(',') !== `${online.LOBBY_STATES.CHECKING_ROOM},${online.LOBBY_STATES.JOINING_INVITE}`
  || !lobbyCalls.find((call) => call.data && call.data.action === 'joinRoom' && call.data.roomId === '555666')
) {
  throw new Error('pending invite room should join after login and show the waiting room');
}
let inviteAutoEntered = null;
inviteLobby.onEnterTable = (result) => { inviteAutoEntered = result; };
waitingRoomState = { ...waitingRoomState, status: 'playing' };
if (
  !(await inviteLobby.refreshWaitingRoom())
  || !inviteAutoEntered
  || inviteAutoEntered.roomId !== '555666'
  || !inviteLobby.active
  || lobbyCalls.find((call) => call.data && call.data.action === 'pull' && call.data.roomId === '555666')
  || !lobbySocketSubscribes.find((call) => call.roomId === '555666')
) {
  throw new Error('guest waiting room refresh should enter the online table through socket after the host starts');
}
inviteLobby.destroy();

activeRoomResult = { ok: true, hasRoom: true, roomId: 'active-room', seat: 0, status: 'playing', version: 3, settings: { maxRounds: 6 } };
lobbyCalls = [];
const reconnectLobby = new online.default({ ...lobbyDatabus }, lobbyRenderer, lobbyMusic);
attachLobbySocket(reconnectLobby, 0);
const reconnectStates = [];
reconnectLobby.onLobby = (state) => { reconnectStates.push(state.state); };
const reconnectResult = await reconnectLobby.startLobby({ nickName: '授权大厅' });
if (
  !reconnectResult.entered
  || reconnectResult.roomId !== 'active-room'
  || reconnectStates.join(',') !== `${online.LOBBY_STATES.CHECKING_ROOM},${online.LOBBY_STATES.RECONNECTING}`
  || lobbyCalls.find((call) => call.data && call.data.action === 'pull' && call.data.roomId === 'active-room')
  || !lobbySocketSubscribes.find((call) => call.roomId === 'active-room')
) {
  throw new Error('online lobby should show reconnecting state and restore an existing active room through socket');
}
reconnectLobby.destroy();
activeRoomResult = { ok: true, hasRoom: false };

const expiredAuthController = new online.default({ ...lobbyDatabus }, lobbyRenderer, lobbyMusic);
expiredAuthController.active = true;
expiredAuthController.roomId = 'expired-auth-room';
expiredAuthController.mySeat = 0;
expiredAuthController.lobbyProfile = { nickName: '刷新玩家', avatarUrl: 'avatar.png' };
expiredAuthController.socketAuth = { url: 'ws://unit-test', token: 'expired-token', expiresAt: Date.now() - 1000 };
let expiredConnectAuth = null;
let expiredSubscribe = null;
expiredAuthController.socket = {
  isReady() { return false; },
  connect(auth) {
    expiredConnectAuth = auth;
    return Promise.resolve(true);
  },
  subscribe(roomId, version, eventSeq) {
    expiredSubscribe = { roomId, version, eventSeq };
    return Promise.resolve({
      ok: true,
      roomId,
      version: 11,
      yourSeat: 0,
      status: 'playing',
      public: lobbyPublic,
      private: lobbyPrivate,
      animation: { waiting: false, currentEvent: null, selfAcked: false },
    });
  },
  request() { return Promise.resolve({ ok: true }); },
  heartbeat() { return Promise.resolve({ ok: true }); },
  close() {},
};
lobbyCalls = [];
if (!(await expiredAuthController.reconnectSocketNow())) {
  throw new Error('expired socket auth should refresh and reconnect successfully');
}
if (
  !lobbyCalls.find((call) => call.url === 'https://api.unit.test/api/auth/login')
  || lobbyCalls.find((call) => call.data && call.data.action === 'pull')
  || !expiredConnectAuth
  || expiredConnectAuth.token !== 'socket-token'
  || expiredConnectAuth.expiresAt <= Date.now()
  || !expiredSubscribe
  || expiredSubscribe.roomId !== 'expired-auth-room'
) {
  throw new Error('expired socket auth reconnect should refresh token through login and subscribe without HTTP game fallback');
}
expiredAuthController.destroy();

const rejectedAuthController = new online.default({ ...lobbyDatabus }, lobbyRenderer, lobbyMusic);
rejectedAuthController.active = true;
rejectedAuthController.roomId = 'rejected-auth-room';
rejectedAuthController.mySeat = 0;
rejectedAuthController.lobbyProfile = { nickName: '重试玩家', avatarUrl: 'avatar.png' };
rejectedAuthController.socketAuth = { url: 'ws://unit-test', token: 'stale-token', expiresAt: Date.now() + 10 * 60000 };
let rejectedConnectCount = 0;
let rejectedSubscribe = null;
rejectedAuthController.socket = {
  isReady() { return false; },
  connect() {
    rejectedConnectCount += 1;
    if (rejectedConnectCount === 1) {
      const error = new Error('TOKEN_EXPIRED');
      error.code = 'TOKEN_EXPIRED';
      return Promise.reject(error);
    }
    return Promise.resolve(true);
  },
  subscribe(roomId, version, eventSeq) {
    rejectedSubscribe = { roomId, version, eventSeq };
    return Promise.resolve({
      ok: true,
      roomId,
      version: 12,
      yourSeat: 0,
      status: 'playing',
      public: lobbyPublic,
      private: lobbyPrivate,
      animation: { waiting: false, currentEvent: null, selfAcked: false },
    });
  },
  request() { return Promise.resolve({ ok: true }); },
  heartbeat() { return Promise.resolve({ ok: true }); },
  close() {},
};
lobbyCalls = [];
if (!(await rejectedAuthController.reconnectSocketNow())) {
  throw new Error('socket auth rejection should refresh auth and retry once');
}
if (
  rejectedConnectCount !== 2
  || !lobbyCalls.find((call) => call.url === 'https://api.unit.test/api/auth/login')
  || !rejectedSubscribe
  || rejectedSubscribe.roomId !== 'rejected-auth-room'
) {
  throw new Error('auth rejection reconnect should retry with refreshed socket auth');
}
rejectedAuthController.destroy();

let animationPlayCount = 0;
let animationAckCount = 0;
let completeAnimation = null;
let localPreviewCount = 0;
let localPreviewConfirmCount = 0;
let localPreviewCancelCount = 0;
let completeLocalPreview = null;
let localPreviewFinished = false;
let localPreviewAuthority = null;
let localPreviewAuthorityEvent = null;
let activeLocalPreview = false;
let failNextLocalPreview = false;
const cardSoundEvents = [];
const actionSoundEvents = [];
globalThis.wx.request = (options) => {
  if (options.data.action === 'ackAnimation') animationAckCount += 1;
  options.success({ statusCode: 200, data: options.data.action === 'ackAnimation' ? { ok: true } : { ok: false } });
};
const onlineRenderer = {
  playOnlineEvent(event, onComplete) {
    animationPlayCount += 1;
    completeAnimation = onComplete;
    return true;
  },
  playLocalActionPreview(action, onLocalComplete) {
    localPreviewCount += 1;
    localPreviewFinished = false;
    localPreviewAuthority = null;
    localPreviewAuthorityEvent = null;
    completeLocalPreview = null;
    if (failNextLocalPreview) {
      failNextLocalPreview = false;
      activeLocalPreview = false;
      return false;
    }
    activeLocalPreview = true;
    completeLocalPreview = () => {
      localPreviewFinished = true;
      if (typeof onLocalComplete === 'function') onLocalComplete(action);
      if (localPreviewAuthority) localPreviewAuthority(localPreviewAuthorityEvent);
    };
    return true;
  },
  confirmLocalActionPreview(event, onComplete) {
    localPreviewConfirmCount += 1;
    if (!activeLocalPreview) return false;
    localPreviewAuthority = onComplete;
    localPreviewAuthorityEvent = event;
    if (localPreviewFinished) onComplete(event);
    return true;
  },
  cancelLocalActionPreview() {
    localPreviewCancelCount += 1;
    activeLocalPreview = false;
  },
  releaseOnlineEvent() {},
};
const onlineDatabus = {
  feedback: '',
  selectedCardId: null,
  setRoundState(state) { Object.assign(this, state); },
};
const onlineMusic = {
  playCardVoice(card) { cardSoundEvents.push(card.id); },
  playActionVoice(type) { actionSoundEvents.push(type); },
};
const onlineController = new online.default(onlineDatabus, onlineRenderer, onlineMusic);
onlineController.roomId = 'animation-room';
onlineController.mySeat = 0;
let fakeSocketReady = true;
let fakeSocketFailAck = false;
let fakeSocketRejectOp = false;
onlineController.socket = {
  isReady() { return fakeSocketReady; },
  request(type) {
    if (type === 'ackAnimation') {
      animationAckCount += 1;
      return fakeSocketFailAck
        ? Promise.reject(new Error('SOCKET_ACK_FAILED'))
        : Promise.resolve({ ok: true, version: onlineController.version });
    }
    if (type === 'op') {
      return fakeSocketRejectOp
        ? Promise.resolve({ ok: false, error: 'ACTION_REJECTED', reason: '动作已失效' })
        : Promise.resolve({ ok: true, version: onlineController.version });
    }
    return Promise.resolve({ ok: true });
  },
  heartbeat() { return Promise.resolve({ ok: true }); },
  close() {},
};
let leaveRoomRequestSent = false;
let leaveSocketRequestUsed = false;
let leaveSocketClosed = false;
const previousWxRequestForLeave = globalThis.wx.request;
globalThis.wx.request = (options) => {
  if (options.url === 'https://api.unit.test/api/game' && options.data && options.data.action === 'leaveRoom') {
    leaveRoomRequestSent = options.data.roomId === 'host-exit-room';
    setTimeout(() => {
      options.success({ statusCode: 200, data: { ok: true, left: true, closed: true, status: 'closed' } });
    }, 20);
    return;
  }
  previousWxRequestForLeave(options);
};
const leaveDatabus = {
  resetCount: 0,
  selectedCardId: null,
  reset() { this.resetCount += 1; },
};
const leaveController = new online.default(leaveDatabus, onlineRenderer, onlineMusic);
leaveController.roomId = 'host-exit-room';
leaveController.active = true;
leaveController.socket = {
  isReady() { return true; },
  request() {
    leaveSocketRequestUsed = true;
    return new Promise(() => {});
  },
  close() { leaveSocketClosed = true; },
};
let leaveLobbyState = null;
leaveController.onLobby = (state) => { leaveLobbyState = state; };
let leaveResolved = false;
let leaveResult = false;
const leavePromise = leaveController.leaveTable().then((result) => {
  leaveResolved = true;
  leaveResult = result;
});
await Promise.resolve();
globalThis.wx.request = previousWxRequestForLeave;
if (
  !leaveResolved
  || !leaveResult
  || !leaveRoomRequestSent
  || leaveSocketRequestUsed
  || !leaveSocketClosed
  || leaveController.roomId !== null
  || leaveController.active
  || leaveDatabus.resetCount !== 1
  || !leaveLobbyState
  || leaveLobbyState.state !== online.LOBBY_STATES.IDLE
) {
  throw new Error('leaving a table should return to the lobby immediately through HTTPS without waiting on the room socket or HTTP response');
}
await leavePromise;
const directSnapshot = {
  ok: true,
  version: 3,
  yourSeat: 0,
  public: {
    seats: [
      { id: 0, nickName: '我', handCount: 1, melds: [], discards: [] },
      { id: 1, nickName: '下家', handCount: 0, melds: [], discards: [] },
      { id: 2, nickName: '对家', handCount: 0, melds: [], discards: [] },
      { id: 3, nickName: '上家', handCount: 0, melds: [], discards: [] },
    ],
    phase: 'ai-thinking',
    currentSeat: 0,
    dealerSeat: 0,
    playerActions: [],
    pendingActions: [],
    recentDiscard: { seat: 0, card: { id: 'discarded-card', key: 'shang' } },
  },
  private: { hand: [{ id: 'remaining-card', key: 'da' }] },
  animation: {
    waiting: true,
    selfAcked: false,
    currentEvent: { eventSeq: 4, type: 'discard', seat: 0, card: { id: 'discarded-card', key: 'shang' } },
  },
};
if (!onlineController.applyServerSnapshot(directSnapshot)) {
  throw new Error('online controller should apply the snapshot returned directly by an operation');
}
if (
  onlineDatabus.seats[0].hand.some((card) => card.id === 'discarded-card')
  || animationPlayCount !== 1
  || cardSoundEvents.join(',') !== 'discarded-card'
) {
  throw new Error('direct operation snapshot should remove the discarded hand card and start its animation and card voice immediately');
}
const versionBeforeForeignSnapshot = onlineController.version;
const foreignSeatSnapshot = {
  ok: true,
  version: 99,
  yourSeat: 1,
  public: directSnapshot.public,
  private: { seat: 1, hand: [{ id: 'foreign-seat-card', key: 'ren' }] },
  animation: { waiting: false, selfAcked: false, currentEvent: null },
};
if (
  onlineController.applyServerSnapshot(foreignSeatSnapshot)
  || onlineController.mySeat !== 0
  || onlineController.version !== versionBeforeForeignSnapshot
  || onlineDatabus.seats[0].hand.some((card) => card.id === 'foreign-seat-card')
) {
  throw new Error('online controller should ignore snapshots that would switch the local player seat');
}
const mismatchedPrivateSnapshot = {
  ok: true,
  version: 100,
  yourSeat: 0,
  public: directSnapshot.public,
  private: { seat: 1, hand: [{ id: 'mismatched-private-card', key: 'ren' }] },
  animation: { waiting: false, selfAcked: false, currentEvent: null },
};
if (
  onlineController.applyServerSnapshot(mismatchedPrivateSnapshot)
  || onlineController.mySeat !== 0
  || onlineController.version !== versionBeforeForeignSnapshot
  || onlineDatabus.seats[0].hand.some((card) => card.id === 'mismatched-private-card')
) {
  throw new Error('online controller should ignore snapshots whose private hand belongs to another seat');
}
const tableResultSnapshot = {
  ok: true,
  version: 4,
  yourSeat: 0,
  status: 'tableResult',
  settings: { maxRounds: 2 },
  public: Object.assign({}, directSnapshot.public, {
    phase: 'result',
    round: 2,
    result: { type: 'draw-round', summary: '测试结算' },
  }),
  private: { hand: [] },
  animation: { waiting: false, selfAcked: false, currentEvent: null },
};
onlineController.isAnimating = false;
onlineController.currentEvent = null;
if (!onlineController.applyServerSnapshot(tableResultSnapshot) || !onlineDatabus.tableFinished || onlineDatabus.tableSettings.maxRounds !== 2) {
  throw new Error('tableResult snapshots should mark the local table as finished and keep maxRounds settings');
}
onlineController.lastPlayedEventSeq = 0;
onlineController.lastAckedEventSeq = 0;
onlineController.isAnimating = false;
onlineController.currentEvent = null;
const animationSnapshot = {
  waiting: true,
  selfAcked: false,
  currentEvent: { eventSeq: 5, type: 'discard', seat: 1, card: { id: 'card-5', key: 'shang' } },
};
onlineController.consumeAnimationState(animationSnapshot);
onlineController.consumeAnimationState(animationSnapshot);
if (animationPlayCount !== 2 || !onlineController.isAnimating || cardSoundEvents.join(',') !== 'discarded-card,card-5') {
  throw new Error('online controller should schedule the current event once and ignore duplicate snapshots');
}
completeAnimation(animationSnapshot.currentEvent);
await new Promise((resolve) => setTimeout(resolve, 0));
if (animationAckCount !== 1 || onlineController.lastAckedEventSeq !== 5) {
  throw new Error('online controller should acknowledge an event once after its animation completes');
}
onlineController.consumeAnimationState(animationSnapshot);
await new Promise((resolve) => setTimeout(resolve, 0));
if (animationAckCount !== 2) {
  throw new Error('an already played event should resend its idempotent acknowledgement when authoritative state lost it');
}
const reconnectController = new online.default(onlineDatabus, onlineRenderer, null);
reconnectController.mySeat = 0;
reconnectController.consumeAnimationState({ ...animationSnapshot, selfAcked: true });
if (animationPlayCount !== 2 || reconnectController.lastAckedEventSeq !== 5) {
  throw new Error('a reconnecting client that already acknowledged the current event should align without replaying it');
}
onlineController.lastPlayedEventSeq = 5;
onlineController.isAnimating = false;
onlineController.consumeAnimationState({
  waiting: true,
  selfAcked: false,
  currentEvent: { eventSeq: 6, type: 'peng', seat: 2 },
});
onlineController.consumeAnimationState({
  waiting: true,
  selfAcked: false,
  currentEvent: { eventSeq: 6, type: 'peng', seat: 2 },
});
if (actionSoundEvents.join(',') !== 'peng') {
  throw new Error('online action voice should play exactly once for the first consumption of an action event');
}
animationPlayCount = 0;
cardSoundEvents.length = 0;
onlineController.lastPlayedEventSeq = 8;
onlineController.lastAckedEventSeq = 8;
onlineController.isAnimating = false;
onlineController.currentEvent = null;
const responseDiscardCard = { id: 'response-discard-card', key: 'shang' };
const responseDiscardSnapshot = {
  ok: true,
  version: 9,
  yourSeat: 0,
  public: {
    seats: [
      { id: 0, nickName: '我', handCount: 3, melds: [], discards: [] },
      { id: 1, nickName: '下家', handCount: 2, melds: [], discards: [responseDiscardCard] },
      { id: 2, nickName: '对家', handCount: 2, melds: [], discards: [] },
      { id: 3, nickName: '上家', handCount: 2, melds: [], discards: [] },
    ],
    phase: 'human-response',
    currentSeat: 0,
    dealerSeat: 0,
    playerActions: [{ type: 'peng', seat: 0, card: responseDiscardCard }, { type: 'pass', seat: 0 }],
    pendingActions: [{ type: 'peng', seat: 0, card: responseDiscardCard }, { type: 'pass', seat: 0 }],
    recentDiscard: { seat: 1, card: responseDiscardCard },
  },
  private: { hand: [{ id: 'response-hand-card', key: 'da' }] },
  animation: {
    waiting: true,
    selfAcked: false,
    currentEvent: {
      eventSeq: 9,
      type: 'discard',
      seat: 1,
      card: responseDiscardCard,
      appearanceResolution: 'await-response',
    },
  },
};
if (!onlineController.applyServerSnapshot(responseDiscardSnapshot)) {
  throw new Error('online controller should apply a response-window discard snapshot');
}
if (
  animationPlayCount !== 1
  || cardSoundEvents.join(',') !== 'response-discard-card'
  || !onlineDatabus.animationWaiting
  || onlineDatabus.pendingActions.length
  || onlineDatabus.playerActions.length
) {
  throw new Error('other-player response discard should schedule exactly one authoritative appearance event while hiding response actions during animation-waiting');
}
const selfAckedResponseSnapshot = {
  ...responseDiscardSnapshot,
  version: 9,
  animation: {
    ...responseDiscardSnapshot.animation,
    selfAcked: true,
  },
};
if (!onlineController.applyServerSnapshot(selfAckedResponseSnapshot)) {
  throw new Error('online controller should apply a self-acked response-window snapshot');
}
if (
  onlineDatabus.animationWaiting
  || onlineDatabus.playerActions.length !== 2
  || onlineDatabus.pendingActions.length !== 2
) {
  throw new Error('self-acked response-window snapshots should reveal local response actions without waiting for spectators');
}
const privateResponseSnapshot = {
  ...responseDiscardSnapshot,
  version: 91,
  public: {
    ...responseDiscardSnapshot.public,
    playerActions: [],
    pendingActions: [],
    responseSummary: {
      active: true,
      sourceSeat: 1,
      sourceType: 'discard',
      cardId: responseDiscardCard.id,
      waitingSeats: [0, 2],
      decidedSeats: [],
    },
    appearingCard: {
      card: responseDiscardCard,
      source: 'discard',
      sourceSeat: 1,
      responseStartSeat: 0,
    },
  },
  private: {
    hand: [{ id: 'response-hand-card', key: 'da' }],
    playerActions: [{ type: 'peng', seat: 0, card: responseDiscardCard }, { type: 'pass', seat: 0 }],
  },
  animation: {
    ...responseDiscardSnapshot.animation,
    selfAcked: true,
  },
};
if (!onlineController.applyServerSnapshot(privateResponseSnapshot)) {
  throw new Error('online controller should apply private concurrent response actions');
}
if (
  onlineDatabus.animationWaiting
  || onlineDatabus.playerActions.length !== 2
  || onlineDatabus.pendingActions.length !== 1
  || !onlineDatabus.responseSummary
) {
  throw new Error(`private response actions should be visible while public state only exposes a response summary: ${JSON.stringify({
    animationWaiting: onlineDatabus.animationWaiting,
    playerActions: onlineDatabus.playerActions.length,
    pendingActions: onlineDatabus.pendingActions.length,
    responseSummary: onlineDatabus.responseSummary,
  })}`);
}
onlineController.lastAckedEventSeq = 8;
onlineController.lastLocallyCompletedEventSeq = 8;
if (!onlineController.applyServerSnapshot({
  ...privateResponseSnapshot,
  version: 915,
  animation: {
    ...privateResponseSnapshot.animation,
    selfAcked: false,
  },
})) {
  throw new Error('online controller should apply unacked private response-window snapshots');
}
if (
  !onlineDatabus.animationWaiting
  || onlineDatabus.playerActions.length !== 2
  || onlineDatabus.pendingActions.length !== 1
) {
  throw new Error(`private response actions should remain visible while local animation ack is still pending: ${JSON.stringify({
    animationWaiting: onlineDatabus.animationWaiting,
    playerActions: onlineDatabus.playerActions.length,
    pendingActions: onlineDatabus.pendingActions.length,
  })}`);
}
onlineController.lastAckedEventSeq = 9;
if (!onlineController.applyServerSnapshot({
  ...privateResponseSnapshot,
  version: 92,
  animation: {
    ...privateResponseSnapshot.animation,
    selfAcked: false,
  },
})) {
  throw new Error('online controller should apply stale unacked response-window snapshots');
}
if (
  onlineDatabus.animationWaiting
  || onlineDatabus.playerActions.length !== 2
) {
  throw new Error('locally acked response-window snapshots should keep response actions visible even if a stale server snapshot says selfAcked=false');
}
const looseWaitingCard = { id: 'loose-waiting-card', key: 'ren' };
const looseWaitingSnapshot = {
  ...responseDiscardSnapshot,
  version: 10,
  public: {
    ...responseDiscardSnapshot.public,
    playerActions: [{ type: 'peng', seat: 0, card: looseWaitingCard }, { type: 'pass', seat: 0 }],
    pendingActions: [{ type: 'peng', seat: 0, card: looseWaitingCard }, { type: 'pass', seat: 0 }],
    recentDiscard: { seat: 1, card: looseWaitingCard },
  },
  animation: {
    waiting: false,
    selfAcked: false,
    currentEvent: {
      eventSeq: 10,
      type: 'discard',
      seat: 1,
      card: looseWaitingCard,
      appearanceResolution: 'await-response',
    },
  },
};
onlineController.isAnimating = false;
onlineController.lastPlayedEventSeq = 9;
onlineController.lastAckedEventSeq = 9;
if (!onlineController.applyServerSnapshot(looseWaitingSnapshot)) {
  throw new Error('online controller should apply a currentEvent snapshot even when waiting is false');
}
if (
  animationPlayCount !== 2
  || !onlineDatabus.animationWaiting
  || onlineDatabus.pendingActions.length
  || onlineDatabus.playerActions.length
) {
  throw new Error('a snapshot with currentEvent should be treated as animation-waiting and hide response actions even if waiting is false');
}
let releaseWhileAnimatingCount = 0;
const activeRenderer = {
  playOnlineEvent(event, onComplete) {
    completeAnimation = onComplete;
    return true;
  },
  releaseOnlineEvent() {
    releaseWhileAnimatingCount += 1;
  },
};
const activeController = new online.default(onlineDatabus, activeRenderer, null);
activeController.roomId = 'active-animation-room';
activeController.mySeat = 0;
activeController.consumeAnimationState({
  waiting: true,
  selfAcked: false,
  currentEvent: { eventSeq: 31, type: 'discard', seat: 1, card: { id: 'active-card' } },
});
activeController.consumeAnimationState({ waiting: false, selfAcked: false, currentEvent: null });
if (!activeController.isAnimating || !activeController.currentEvent || releaseWhileAnimatingCount !== 0) {
  throw new Error('a no-event snapshot must not cancel an authoritative appearance animation that is still playing locally');
}
const authorityHandDatabus = {
  selectedCardId: 'peng-hand-1',
  seats: [{ hand: [
    { id: 'peng-hand-1', key: 'shang' },
    { id: 'peng-hand-2', key: 'shang' },
    { id: 'keep-da', key: 'da' },
  ] }],
};
const authorityHandController = new online.default(authorityHandDatabus, {
  playOnlineEvent() { return false; },
  releaseOnlineEvent() {},
}, null);
authorityHandController.consumeAnimationState({
  waiting: true,
  selfAcked: false,
  currentEvent: {
    eventSeq: 41,
    type: 'peng',
    seat: 0,
    symbolCode: codec.symbolCodeForKey('shang'),
  },
});
if (
  authorityHandDatabus.seats[0].hand.length !== 1
  || authorityHandDatabus.seats[0].hand[0].id !== 'keep-da'
  || authorityHandDatabus.selectedCardId
) {
  throw new Error('self authoritative peng event should remove two matching private hand cards');
}
authorityHandDatabus.seats[0].hand = [
  { id: 'chi-da', key: 'da' },
  { id: 'chi-ren', key: 'ren' },
  { id: 'keep-shang', key: 'shang' },
];
authorityHandController.consumeAnimationState({
  waiting: true,
  selfAcked: false,
  currentEvent: {
    eventSeq: 42,
    type: 'chi',
    seat: 0,
    phraseCode: codec.phraseCodeForId('sdr'),
    incomingSymbolCode: codec.symbolCodeForKey('shang'),
  },
});
if (authorityHandDatabus.seats[0].hand.map((card) => card.id).join(',') !== 'keep-shang') {
  throw new Error('self authoritative chi event should remove the two non-incoming phrase cards');
}
authorityHandDatabus.seats[0].hand = [
  { id: 'zhao-1', key: 'shang' },
  { id: 'zhao-2', key: 'shang' },
  { id: 'zhao-3', key: 'shang' },
  { id: 'keep-ren', key: 'ren' },
];
authorityHandController.consumeAnimationState({
  waiting: true,
  selfAcked: false,
  currentEvent: {
    eventSeq: 43,
    type: 'zhao',
    seat: 0,
    symbolCode: codec.symbolCodeForKey('shang'),
    count: 4,
  },
});
if (authorityHandDatabus.seats[0].hand.map((card) => card.id).join(',') !== 'keep-ren') {
  throw new Error('self authoritative zhao event should remove count minus one matching cards');
}
authorityHandDatabus.seats[0].hand = [
  { id: 'other-1', key: 'shang' },
  { id: 'other-2', key: 'shang' },
];
authorityHandController.consumeAnimationState({
  waiting: true,
  selfAcked: false,
  currentEvent: {
    eventSeq: 44,
    type: 'peng',
    seat: 1,
    symbolCode: codec.symbolCodeForKey('shang'),
  },
});
if (authorityHandDatabus.seats[0].hand.length !== 2) {
  throw new Error('other-player authoritative meld event must not remove private hand cards');
}
const deltaDatabus = {
  selectedCardId: 'delta-discard',
  feedback: '',
  seats: [
    { hand: [{ id: 'delta-discard', key: 'shang' }, { id: 'keep-hand', key: 'da' }], discards: [], melds: [] },
    { hand: [], discards: [], melds: [] },
    { hand: [], discards: [], melds: [] },
    { hand: [], discards: [], melds: [] },
  ],
};
let deltaPlayedCount = 0;
let deltaResyncCount = 0;
const deltaController = new online.default(deltaDatabus, {
  playOnlineEvent() {
    deltaPlayedCount += 1;
    return false;
  },
  releaseOnlineEvent() {},
}, null);
deltaController.active = true;
deltaController.roomId = 'delta-room';
deltaController.version = 10;
deltaController.lastServerEventSeq = 20;
deltaController.scheduleReconnect = () => { deltaResyncCount += 1; };
deltaController.socket = {
  isReady() { return true; },
  request() { return Promise.resolve({ ok: true, version: deltaController.version }); },
};
if (!deltaController.applySocketDelta({
  roomId: 'delta-room',
  baseVersion: 10,
  version: 11,
  eventSeq: 21,
  event: { eventSeq: 21, type: 'discard', seat: 0, card: { id: 'delta-discard', key: 'shang' }, discardIndex: 0 },
  delta: {
    appendDiscard: { seat: 0, card: { id: 'delta-discard', key: 'shang' }, index: 0 },
    publicPatch: { phase: 'ai-thinking', currentSeat: 0, pendingActions: [], playerActions: [] },
  },
})) {
  throw new Error('client should apply a continuous discard delta');
}
if (
  deltaDatabus.seats[0].discards.length !== 1
  || deltaDatabus.seats[0].hand.map((card) => card.id).join(',') !== 'keep-hand'
  || deltaDatabus.selectedCardId
  || deltaPlayedCount !== 1
) {
  throw new Error('discard delta should append public discard, remove self hand card, and play once');
}
if (!deltaController.applySocketDelta({
  roomId: 'delta-room',
  baseVersion: 11,
  version: 12,
  eventSeq: 22,
  event: { eventSeq: 22, type: 'peng', seat: 1, meld: { id: 'delta-meld', type: 'peng', cards: [{ id: 'm1', key: 'shang' }] }, meldIndex: 0 },
  delta: {
    appendMeld: { seat: 1, meld: { id: 'delta-meld', type: 'peng', cards: [{ id: 'm1', key: 'shang' }] }, index: 0 },
    publicPatch: { phase: 'ai-thinking', currentSeat: 1, pendingActions: [], playerActions: [] },
  },
})) {
  throw new Error('client should apply a continuous meld delta');
}
if (deltaDatabus.seats[1].melds.length !== 1 || deltaDatabus.seats[1].melds[0].id !== 'delta-meld') {
  throw new Error('meld delta should append to the public meld area');
}
deltaDatabus.playerActions = [{ type: 'stale', seat: 0 }];
deltaController.mySeat = 1;
if (!deltaController.applySocketDelta({
  roomId: 'delta-room',
  baseVersion: 12,
  version: 13,
  eventSeq: 23,
  event: { eventSeq: 23, type: 'discard', seat: 3, card: { id: 'response-card', key: 'sheng' }, discardIndex: 0 },
  delta: {
    publicPatch: {
      phase: 'human-response',
      currentSeat: 1,
      responseSummary: {
        active: true,
        sourceSeat: 3,
        sourceType: 'discard',
        cardId: 'response-card',
        waitingSeats: [1, 2],
        decidedSeats: [],
      },
      pendingActions: [],
      playerActions: [],
    },
    privatePatch: {
      seat: 1,
      playerActions: [
        { type: 'zhao', seat: 1, label: '招4张1对', card: { id: 'response-card', key: 'sheng' } },
        { type: 'pass', seat: 1, label: '过' },
      ],
    },
  },
})) {
  throw new Error('client should apply a response-window delta with private actions');
}
if (
  deltaDatabus.phase !== 'human-response'
  || deltaDatabus.currentSeat !== 0
  || deltaDatabus.responseSummary.sourceSeat !== 2
  || deltaDatabus.responseSummary.waitingSeats.join(',') !== '0,1'
  || deltaDatabus.playerActions.length !== 2
  || deltaDatabus.playerActions[0].type !== 'zhao'
  || deltaDatabus.playerActions[0].seat !== 0
) {
  throw new Error('private delta patch should rotate and restore local response actions');
}
if (!deltaController.applySocketDelta({
  roomId: 'delta-room',
  baseVersion: 13,
  version: 14,
  eventSeq: 24,
  event: { eventSeq: 24, type: 'discard', seat: 2, card: { id: 'clear-card', key: 'da' }, discardIndex: 0 },
  delta: {
    publicPatch: { phase: 'human-discard', currentSeat: 2, pendingActions: [], playerActions: [] },
    privatePatch: { seat: 1, playerActions: [] },
  },
})) {
  throw new Error('client should apply an empty private action patch');
}
if (deltaDatabus.playerActions.length || deltaDatabus.currentSeat !== 1) {
  throw new Error('empty private delta patch should clear stale response actions and rotate public seats');
}
if (deltaController.applySocketDelta({
  roomId: 'delta-room',
  baseVersion: 14,
  version: 15,
  eventSeq: 26,
  event: { eventSeq: 24, type: 'discard', seat: 1, card: { id: 'gap-card', key: 'da' }, discardIndex: 0 },
  delta: { appendDiscard: { seat: 1, card: { id: 'gap-card', key: 'da' }, index: 0 } },
}) || deltaResyncCount !== 1) {
  throw new Error('eventSeq gaps should reject the delta and request snapshot recovery');
}
onlineController.isAnimating = false;
onlineController.lastPlayedEventSeq = 6;
onlineController.lastAckedEventSeq = 6;
const responsePreviewBaseline = localPreviewCount;
const responsePlayBaseline = animationPlayCount;
const responseAckBaseline = animationAckCount;
const responseCancelBaseline = localPreviewCancelCount;
onlineController.startLocalActionPreview({ type: 'chi', seat: 0, card: { id: 'chi-card' } });
if (
  localPreviewCount !== responsePreviewBaseline
  || actionSoundEvents.join(',') !== 'peng'
  || !onlineController.pendingLocalAction
  || !onlineController.pendingLocalAction.localAnimationCompleted
  || onlineController.pendingLocalAction.localPreviewStarted
) {
  throw new Error('local response actions should wait for authority without starting optimistic animation or voice');
}
onlineController.startLocalActionPreview({ type: 'chi', seat: 0, card: { id: 'chi-card' } });
if (localPreviewCount !== responsePreviewBaseline || actionSoundEvents.join(',') !== 'peng') {
  throw new Error('duplicate local response taps must not start optimistic animation or voice');
}
onlineController.consumeAnimationState({
  waiting: true,
  selfAcked: false,
  currentEvent: { eventSeq: 7, type: 'chi', seat: 0 },
});
if (
  localPreviewConfirmCount !== 0
  || animationPlayCount !== responsePlayBaseline + 1
  || actionSoundEvents.join(',') !== 'peng,chi'
  || localPreviewCancelCount !== responseCancelBaseline
) {
  throw new Error('matching authoritative response should play once from the server event without confirming a local preview');
}
if (animationAckCount !== responseAckBaseline) {
  throw new Error('authoritative response must wait for its server animation before acknowledging');
}
completeAnimation();
await new Promise((resolve) => setTimeout(resolve, 0));
if (animationAckCount !== responseAckBaseline + 1 || localPreviewCancelCount !== responseCancelBaseline) {
  throw new Error('authoritative response should acknowledge after server animation without cancelling a local preview');
}
onlineController.isAnimating = false;
onlineController.lastPlayedEventSeq = 7;
onlineController.lastAckedEventSeq = 7;
const skippedPreviewPlayCount = animationPlayCount;
const skippedPreviewAckCount = animationAckCount;
onlineController.startLocalActionPreview({ type: 'peng', seat: 0, card: { id: 'skipped-peng' } });
if (
  localPreviewCount !== responsePreviewBaseline
  || !onlineController.pendingLocalAction
  || !onlineController.pendingLocalAction.localAnimationCompleted
  || onlineController.pendingLocalAction.localPreviewStarted
) {
  throw new Error('local response meld preview should be skipped while keeping pending ownership for authority');
}
onlineController.consumeAnimationState({
  waiting: true,
  selfAcked: false,
  currentEvent: {
    eventSeq: 8,
    type: 'peng',
    seat: 0,
    actingSeat: 0,
    meld: { cards: [{ id: 'skipped-peng' }, { id: 'skipped-hand-1' }, { id: 'skipped-hand-2' }] },
  },
});
if (localPreviewConfirmCount !== 0 || animationPlayCount !== skippedPreviewPlayCount + 1) {
  throw new Error('skipped local response preview should let the authoritative meld event play once');
}
if (animationAckCount !== skippedPreviewAckCount) {
  throw new Error('skipped local response preview must wait for the authoritative animation before acknowledging');
}
completeAnimation();
await new Promise((resolve) => setTimeout(resolve, 0));
if (
  animationAckCount !== skippedPreviewAckCount + 1
  || onlineController.lastAckedEventSeq !== 8
  || localPreviewCancelCount !== responseCancelBaseline
) {
  throw new Error(`authoritative meld event after a skipped local response preview should complete, acknowledge, and clear ownership: ack=${animationAckCount}/${skippedPreviewAckCount + 1}, lastAcked=${onlineController.lastAckedEventSeq}, cancel=${localPreviewCancelCount}`);
}
onlineController.isAnimating = false;
onlineController.lastPlayedEventSeq = 8;
const localDiscardSoundBaseline = cardSoundEvents.join(',');
const expectedLocalDiscardSounds = localDiscardSoundBaseline
  ? `${localDiscardSoundBaseline},local-discard`
  : 'local-discard';
onlineController.startLocalActionPreview({ type: 'discard', seat: 0, card: { id: 'local-discard' } });
if (localPreviewCount !== responsePreviewBaseline + 1 || cardSoundEvents.join(',') !== expectedLocalDiscardSounds) {
  throw new Error('local discard preview should begin with its card voice before the network response arrives');
}
completeLocalPreview();
onlineController.consumeAnimationState({
  waiting: true,
  selfAcked: false,
  currentEvent: { eventSeq: 9, type: 'discard', seat: 0, card: { id: 'local-discard' } },
});
if (localPreviewConfirmCount !== 1 || cardSoundEvents.join(',') !== expectedLocalDiscardSounds) {
  throw new Error('matching authoritative discard should reuse the local preview without replaying its card voice');
}
await new Promise((resolve) => setTimeout(resolve, 0));
if (localPreviewCancelCount !== responseCancelBaseline + 1) {
  throw new Error('an already completed local animation should acknowledge immediately after authoritative confirmation');
}
fakeSocketRejectOp = true;
onlineController.animationWaiting = false;
onlineController.isAnimating = false;
onlineController.startLocalActionPreview({ type: 'peng', seat: 0, card: { id: 'rejected-peng' } });
await onlineController.sendOp({ kind: 'response', ref: { index: 0, type: 'peng' } });
if (onlineController.pendingLocalAction || onlineController.localActionPreviewType || localPreviewCancelCount !== responseCancelBaseline + 1) {
  throw new Error('rejected local response actions should clear pending ownership without cancelling a nonexistent optimistic animation');
}
fakeSocketRejectOp = false;
fakeSocketFailAck = true;
onlineController.lastAckedEventSeq = 5;
await onlineController.sendAnimationAck(6);
if (!onlineController.ackRetryTimer) {
  throw new Error('failed socket animation acknowledgements should schedule an idempotent retry');
}
clearTimeout(onlineController.ackRetryTimer);
onlineController.ackRetryTimer = null;
fakeSocketFailAck = false;

let realtimeFallbackCalled = false;
let realtimeFallbackPayload = null;
globalThis.wx.request = (options) => {
  realtimeFallbackCalled = true;
  realtimeFallbackPayload = options.data;
  options.success({
    statusCode: 200,
    data: {
      ok: true,
      roomId: 'animation-room',
      version: onlineController.version + 1,
      yourSeat: 0,
      status: 'playing',
      public: Object.assign({}, directSnapshot.public, {
        phase: 'human-discard',
        currentSeat: 0,
        playerActions: [],
        pendingActions: [],
        publicEvent: null,
      }),
      private: { seat: 0, hand: [{ id: 'http-fallback-card', key: 'shang' }] },
      animation: { waiting: false, selfAcked: false, currentEvent: null, latestEventSeq: onlineController.lastServerEventSeq },
    },
  });
};
fakeSocketReady = false;
onlineController.animationWaiting = false;
onlineController.isAnimating = false;
await onlineController.sendOp({ kind: 'discard', cardId: 'missing-socket-card' });
if (
  realtimeFallbackCalled
  || realtimeFallbackPayload
  || onlineDatabus.feedback !== '连接已断开，等待重连'
  || !onlineController.socketReconnecting
) {
  throw new Error('socket disconnect should not submit realtime operations through HTTPS fallback');
}
if (onlineController.reconnectTimer) {
  clearTimeout(onlineController.reconnectTimer);
  onlineController.reconnectTimer = null;
}
onlineController.stopReconnectFallbackRefresh();
realtimeFallbackCalled = false;
onlineController.lastAckedEventSeq = 6;
await onlineController.sendAnimationAck(7);
if (realtimeFallbackCalled || !onlineController.ackRetryTimer) {
  throw new Error('socket disconnect should retry animation ack without cloud fallback');
}
clearTimeout(onlineController.ackRetryTimer);
onlineController.ackRetryTimer = null;
let reconnectPullCalled = false;
const phaseBeforeDisconnect = onlineDatabus.phase;
globalThis.wx.request = (options) => {
  if (options.data && options.data.action === 'pull') {
    reconnectPullCalled = true;
    options.success({
      statusCode: 200,
      data: {
        ok: true,
        roomId: 'animation-room',
        version: onlineController.version + 1,
        yourSeat: 0,
        status: 'playing',
        public: Object.assign({}, directSnapshot.public, {
          phase: 'human-response',
          currentSeat: 0,
          responseSummary: { active: true, sourceSeat: 1, sourceType: 'discard', cardId: 'jiu-4', waitingSeats: [0], decidedSeats: [] },
          pendingActions: [{ type: 'peng', seat: 0, card: { id: 'jiu-4', key: 'jiu' }, priority: 3, label: '碰' }],
          playerActions: [],
          publicEvent: null,
        }),
        private: {
          seat: 0,
          hand: [{ id: 'jiu-hand-1', key: 'jiu' }, { id: 'jiu-hand-2', key: 'jiu' }],
          playerActions: [{ type: 'peng', seat: 0, card: { id: 'jiu-4', key: 'jiu' }, priority: 3, label: '碰' }],
        },
        animation: { waiting: false, selfAcked: false, currentEvent: null, latestEventSeq: onlineController.lastServerEventSeq },
      },
    });
    return;
  }
  options.success({ statusCode: 200, data: { ok: true } });
};
onlineController.active = true;
onlineController.roomId = 'animation-room';
onlineController.handleSocketDisconnect({ code: 'SOCKET_ABNORMAL_CLOSE' });
await new Promise((resolve) => setTimeout(resolve, 0));
if (
  reconnectPullCalled
  || onlineDatabus.phase !== phaseBeforeDisconnect
  || !onlineController.socketReconnecting
) {
  throw new Error('socket reconnect should wait for WebSocket recovery without HTTPS pull fallback');
}
onlineController.stopReconnectFallbackRefresh();
if (onlineController.reconnectTimer) {
  clearTimeout(onlineController.reconnectTimer);
  onlineController.reconnectTimer = null;
}
onlineController.active = false;
let rematchFallbackPayload = null;
globalThis.wx.request = (options) => {
  rematchFallbackPayload = options.data;
  options.success({
    statusCode: 200,
    data: {
      ok: true,
      roomId: 'animation-room',
      version: onlineController.version,
      rematch: { status: 'pending', active: true, agreedOpenids: ['unit-openid'], agreedCount: 1, requiredCount: 2 },
    },
  });
};
onlineController.active = true;
fakeSocketReady = false;
onlineDatabus.feedback = '';
if ((await onlineController.requestRematch(true)) || rematchFallbackPayload) {
  throw new Error('socket disconnect should not request rematch through HTTPS fallback');
}
if (onlineDatabus.feedback !== '连接已断开，等待重连') {
  throw new Error('socket rematch while disconnected should keep the table waiting for reconnect');
}
if (onlineController.reconnectTimer) {
  clearTimeout(onlineController.reconnectTimer);
  onlineController.reconnectTimer = null;
}
onlineController.stopReconnectFallbackRefresh();
onlineController.active = false;
fakeSocketReady = true;

const require = createRequire(import.meta.url);
const roomFunction = require(join(root, 'services/backend/src/game/room.js'));
const roomDocument = roomFunction.documentData({ _id: 'room-id', status: 'waiting' });
if ('_id' in roomDocument || roomDocument.status !== 'waiting') {
  throw new Error('doc(id).set data must omit the immutable _id field');
}
function createRoomDb(initialRooms = {}) {
  const documents = { rooms: { ...initialRooms }, roomStates: {}, matchQueue: {} };
  const matches = (room, query) => Object.entries(query).every(([key, value]) => {
    if (key === 'playerOpenids') return Array.isArray(room.playerOpenids) && room.playerOpenids.indexOf(value) >= 0;
    if (key === 'players.openid') return (room.players || []).some((player) => player.openid === value);
    return room[key] === value;
  });
  return {
    documents,
    collection(name) {
      return {
        where(query) {
          const chain = {
            _query: query,
            orderBy() { return chain; },
            limit() { return chain; },
            async get() {
              return { data: Object.values(documents[name] || {}).filter((room) => matches(room, query)) };
            },
          };
          return chain;
        },
        doc(id) {
          return {
            async get() {
              if (!documents[name][id]) throw new Error('not found');
              return { data: documents[name][id] };
            },
            async update({ data }) { Object.assign(documents[name][id], data); },
            async set({ data }) { documents[name][id] = { ...data, _id: id }; },
          };
        },
      };
    },
  };
}
const activeRoomDb = createRoomDb({
  'closed-room': {
    _id: 'closed-room',
    status: 'closed',
    version: 9,
    updatedAt: 9,
    players: [{ seat: 0, openid: 'active-player' }],
    playerOpenids: ['active-player'],
    settings: { maxRounds: 6 },
  },
  'active-room': {
    _id: 'active-room',
    status: 'playing',
    version: 3,
    updatedAt: 3,
    players: [{ seat: 2, openid: 'active-player' }],
    playerOpenids: ['active-player'],
    settings: { maxRounds: 4 },
  },
});
const activeRoomLookup = await roomFunction.activeRoom({}, { db: activeRoomDb, OPENID: 'active-player' });
if (
  !activeRoomLookup.ok
  || !activeRoomLookup.hasRoom
  || activeRoomLookup.roomId !== 'active-room'
  || activeRoomLookup.seat !== 2
  || activeRoomLookup.settings.maxRounds !== 4
) {
  throw new Error('activeRoom should return the current player unfinished room and normalized settings');
}
const missingActiveRoom = await roomFunction.activeRoom({}, { db: activeRoomDb, OPENID: 'missing-player' });
if (!missingActiveRoom.ok || missingActiveRoom.hasRoom) {
  throw new Error('activeRoom should not return a room for players without unfinished rooms');
}
const createRoomDbInstance = createRoomDb();
const createdConfiguredRoom = await roomFunction.createRoom({
  profile: { nickName: '建房玩家' },
  maxRounds: 4,
}, { db: createRoomDbInstance, OPENID: 'creator-openid' });
if (
  !createdConfiguredRoom.ok
  || createdConfiguredRoom.settings.maxRounds !== 4
  || !createRoomDbInstance.documents.rooms[createdConfiguredRoom.roomId].playerOpenids.includes('creator-openid')
) {
  throw new Error('createRoom should save maxRounds settings and queryable playerOpenids');
}
const createOneRoundDbInstance = createRoomDb();
const createdOneRoundRoom = await roomFunction.createRoom({
  profile: { nickName: '一局玩家' },
  maxRounds: 1,
}, { db: createOneRoundDbInstance, OPENID: 'one-round-openid' });
if (!createdOneRoundRoom.ok || createdOneRoundRoom.settings.maxRounds !== 1) {
  throw new Error('createRoom should accept one-round rooms as a supported maxRounds option');
}
const createdDefaultRoom = await roomFunction.createRoom({
  profile: { nickName: '非法局数玩家' },
  maxRounds: 99,
}, { db: createRoomDb(), OPENID: 'invalid-rounds-openid' });
if (!createdDefaultRoom.ok || createdDefaultRoom.settings.maxRounds !== 2) {
  throw new Error('createRoom should normalize unsupported maxRounds to the default test option');
}
const duplicateRoomDb = createRoomDb({
  'duplicate-room': {
    _id: 'duplicate-room',
    status: 'playing',
    version: 1,
    updatedAt: 1,
    players: [{ seat: 0, openid: 'duplicate-openid' }],
    playerOpenids: ['duplicate-openid'],
    settings: { maxRounds: 6 },
  },
});
const duplicateCreate = await roomFunction.createRoom({
  profile: { nickName: '重复建房' },
  maxRounds: 2,
}, { db: duplicateRoomDb, OPENID: 'duplicate-openid' });
if (!duplicateCreate.alreadyInRoom || duplicateCreate.roomId !== 'duplicate-room' || Object.keys(duplicateRoomDb.documents.rooms).length !== 1) {
  throw new Error('createRoom should return the existing active room instead of creating a duplicate room');
}
const friendRoomDb = createRoomDb();
const hostRoom = await roomFunction.createRoom({
  profile: { nickName: '房主' },
  maxRounds: 2,
}, { db: friendRoomDb, OPENID: 'host-openid' });
if (
  !hostRoom.ok
  || !hostRoom.room
  || hostRoom.room.status !== 'waiting'
  || hostRoom.room.players[0].ready
  || hostRoom.room.players[0].online !== true
  || typeof hostRoom.room.players[0].lastSeenAt !== 'number'
) {
  throw new Error('createRoom should return a waiting room snapshot with ready/online player state');
}
const roomInfo = await roomFunction.roomInfo({
  roomId: hostRoom.roomId,
}, { db: friendRoomDb, OPENID: 'host-openid' });
if (!roomInfo.ok || roomInfo.room.roomId !== hostRoom.roomId || roomInfo.room.players.some((player) => 'hand' in player)) {
  throw new Error('roomInfo should expose a public waiting-room snapshot without private hands');
}
const guestJoin = await roomFunction.joinRoom({
  roomId: hostRoom.roomId,
  profile: { nickName: '好友' },
}, { db: friendRoomDb, OPENID: 'guest-openid' });
if (!guestJoin.ok || guestJoin.seat !== 1 || guestJoin.room.players.length !== 2 || guestJoin.room.players[1].ready) {
  throw new Error('joinRoom should add a shared-room guest to the next free seat and return a waiting snapshot');
}
const duplicateJoin = await roomFunction.joinRoom({
  roomId: hostRoom.roomId,
  profile: { nickName: '好友' },
}, { db: friendRoomDb, OPENID: 'guest-openid' });
if (!duplicateJoin.ok || duplicateJoin.seat !== 1 || duplicateJoin.room.players.length !== 2) {
  throw new Error('joinRoom should be idempotent for a player already in the room');
}
const blockedByOtherRoomDb = createRoomDb({
  'other-room': {
    _id: 'other-room',
    status: 'waiting',
    version: 0,
    updatedAt: 9,
    hostOpenid: 'other-player',
    players: [{ seat: 0, openid: 'busy-openid', ready: false, online: true }],
    playerOpenids: ['busy-openid'],
    settings: { maxRounds: 2 },
  },
  'target-room': {
    _id: 'target-room',
    status: 'waiting',
    version: 0,
    updatedAt: 1,
    hostOpenid: 'target-host',
    players: [{ seat: 0, openid: 'target-host', ready: false, online: true }],
    playerOpenids: ['target-host'],
    settings: { maxRounds: 2 },
  },
});
const blockedByOtherRoom = await roomFunction.joinRoom({
  roomId: 'target-room',
}, { db: blockedByOtherRoomDb, OPENID: 'busy-openid' });
if (blockedByOtherRoom.ok || blockedByOtherRoom.error !== 'ALREADY_IN_ROOM' || blockedByOtherRoom.existing.roomId !== 'other-room') {
  throw new Error('joinRoom should reject joining a second unfinished room and return existing room info');
}
const fullRoomDb = createRoomDb({
  'full-room': {
    _id: 'full-room',
    status: 'waiting',
    version: 0,
    updatedAt: 1,
    hostOpenid: 'full-0',
    players: [0, 1, 2, 3].map((seat) => ({ seat, openid: `full-${seat}`, ready: false, online: true })),
    playerOpenids: ['full-0', 'full-1', 'full-2', 'full-3'],
    settings: { maxRounds: 2 },
  },
});
const fullJoin = await roomFunction.joinRoom({
  roomId: 'full-room',
}, { db: fullRoomDb, OPENID: 'late-openid' });
if (fullJoin.ok || fullJoin.error !== 'ROOM_FULL') {
  throw new Error('joinRoom should reject full waiting rooms');
}
const startedJoin = await roomFunction.joinRoom({
  roomId: 'active-room',
}, { db: activeRoomDb, OPENID: 'late-openid' });
if (startedJoin.ok || startedJoin.error !== 'ROOM_ALREADY_STARTED') {
  throw new Error('joinRoom should reject rooms that have already started');
}
const singleHumanDb = createRoomDb();
const singleHumanRoom = await roomFunction.createRoom({
  profile: { nickName: '单人房主' },
  maxRounds: 2,
}, { db: singleHumanDb, OPENID: 'single-host' });
const oneHumanStart = await roomFunction.startRound({
  roomId: singleHumanRoom.roomId,
}, { db: singleHumanDb, OPENID: 'single-host' });
if (oneHumanStart.ok || oneHumanStart.error !== 'WAITING_FOR_PLAYERS') {
  throw new Error('startRound should reject a waiting room before at least two human players join');
}
const hostReady = await roomFunction.setReady({
  roomId: hostRoom.roomId,
}, { db: friendRoomDb, OPENID: 'host-openid' });
const hostReadyAgain = await roomFunction.setReady({
  roomId: hostRoom.roomId,
}, { db: friendRoomDb, OPENID: 'host-openid' });
if (!hostReady.ok || !hostReadyAgain.ok || !hostReadyAgain.room.players.find((player) => player.openid === 'host-openid').ready) {
  throw new Error('setReady should idempotently mark a waiting-room player ready');
}
const readyStart = await roomFunction.startRound({
  roomId: hostRoom.roomId,
}, { db: friendRoomDb, OPENID: 'host-openid' });
if (
  !readyStart.ok
  || friendRoomDb.documents.rooms[hostRoom.roomId].status !== 'playing'
  || !friendRoomDb.documents.roomStates[hostRoom.roomId]
  || friendRoomDb.documents.rooms[hostRoom.roomId].state.seats.length !== 4
) {
  throw new Error('startRound should allow a ready host with two humans and fill empty seats with AI');
}
const hostOffline = await roomFunction.setPlayerConnection({
  roomId: hostRoom.roomId,
  online: false,
}, { db: friendRoomDb, OPENID: 'host-openid' });
if (
  !hostOffline.ok
  || friendRoomDb.documents.rooms[hostRoom.roomId].players.find((player) => player.openid === 'host-openid').online !== false
  || friendRoomDb.documents.roomStates[hostRoom.roomId].public.seats[0].online !== false
) {
  throw new Error('setPlayerConnection should mark disconnected socket players offline in public state');
}
const hostOnline = await roomFunction.setPlayerConnection({
  roomId: hostRoom.roomId,
  online: true,
}, { db: friendRoomDb, OPENID: 'host-openid' });
if (
  !hostOnline.ok
  || friendRoomDb.documents.rooms[hostRoom.roomId].players.find((player) => player.openid === 'host-openid').online === false
  || friendRoomDb.documents.roomStates[hostRoom.roomId].public.seats[0].online === false
) {
  throw new Error('setPlayerConnection should mark reconnected socket players online in public state');
}
const unreadyRoomDb = createRoomDb({
  'unready-room': {
    _id: 'unready-room',
    status: 'waiting',
    version: 0,
    updatedAt: 1,
    hostOpenid: 'unready-host',
    players: [
      { seat: 0, openid: 'unready-host', ready: false, online: true },
      { seat: 1, openid: 'unready-guest', ready: true, online: true },
    ],
    playerOpenids: ['unready-host', 'unready-guest'],
    settings: { maxRounds: 2 },
  },
});
const unreadyStart = await roomFunction.startRound({
  roomId: 'unready-room',
}, { db: unreadyRoomDb, OPENID: 'unready-host' });
if (unreadyStart.ok || unreadyStart.error !== 'HOST_NOT_READY') {
  throw new Error('startRound should reject waiting rooms when the host is not ready');
}
const maxRoundDb = createRoomDb({
  'max-round-room': {
    _id: 'max-round-room',
    status: 'finished',
    version: 2,
    updatedAt: 2,
    hostOpenid: 'max-round-openid',
    players: [{ seat: 0, openid: 'max-round-openid' }],
    playerOpenids: ['max-round-openid'],
    settings: { maxRounds: 2 },
    state: {
      phase: 'result',
      round: 2,
      seats: [],
      eventSeq: 0,
      publicEvent: null,
      pendingContinuation: null,
    },
  },
});
const blockedNextRound = await roomFunction.startRound({
  roomId: 'max-round-room',
}, { db: maxRoundDb, OPENID: 'max-round-openid' });
if (blockedNextRound.ok || blockedNextRound.error !== 'TABLE_FINISHED' || maxRoundDb.documents.rooms['max-round-room'].status !== 'tableResult') {
  throw new Error('startRound should be blocked once a room reaches settings.maxRounds');
}
if (
  !maxRoundDb.documents.rooms['max-round-room'].rematch
  || maxRoundDb.documents.rooms['max-round-room'].rematch.status !== 'host-decision'
  || typeof maxRoundDb.documents.rooms['max-round-room'].rematch.deadlineAt !== 'number'
) {
  throw new Error('final table result should initialize a host rematch decision window');
}
const resultDriftDb = createRoomDb({
  'result-drift-room': {
    _id: 'result-drift-room',
    status: 'playing',
    version: 8,
    updatedAt: 8,
    hostOpenid: 'result-drift-host',
    players: [
      { seat: 0, openid: 'result-drift-host', ready: true, online: true },
      { seat: 1, openid: 'result-drift-guest', ready: true, online: true },
    ],
    playerOpenids: ['result-drift-host', 'result-drift-guest'],
    settings: { maxRounds: 2 },
    state: {
      phase: 'result',
      round: 1,
      seats: [],
      eventSeq: 0,
      publicEvent: null,
      pendingContinuation: null,
      result: { type: 'win', winner: 0 },
    },
  },
});
const recoveredNextRound = await roomFunction.startRound({
  roomId: 'result-drift-room',
}, { db: resultDriftDb, OPENID: 'result-drift-host' });
if (
  !recoveredNextRound.ok
  || resultDriftDb.documents.rooms['result-drift-room'].status !== 'playing'
  || resultDriftDb.documents.rooms['result-drift-room'].state.round !== 2
  || resultDriftDb.documents.rooms['result-drift-room'].state.seats.length !== 4
) {
  throw new Error('startRound should recover playing/result drift rooms before opening the next non-final round');
}
const finalEventDriftDb = createRoomDb({
  'final-event-drift-room': {
    _id: 'final-event-drift-room',
    status: 'playing',
    version: 11,
    updatedAt: 11,
    hostOpenid: 'final-event-host',
    players: [
      { seat: 0, openid: 'final-event-host', ready: true, online: true },
      { seat: 1, openid: 'final-event-guest', ready: true, online: true },
    ],
    playerOpenids: ['final-event-host', 'final-event-guest'],
    settings: { maxRounds: 2 },
    state: {
      phase: 'result',
      round: 2,
      seats: [{}, {}, {}, {}],
      eventSeq: 21,
      publicEvent: { eventSeq: 21, type: 'hu', createdAt: 11, result: { type: 'win', winner: 0 } },
      pendingContinuation: { type: 'settlement' },
      result: { type: 'win', winner: 0 },
    },
  },
});
const finalEventConnection = await roomFunction.setPlayerConnection({
  roomId: 'final-event-drift-room',
  online: true,
}, { db: finalEventDriftDb, OPENID: 'final-event-host' });
if (
  !finalEventConnection.ok
  || finalEventConnection.status !== 'tableResult'
  || finalEventDriftDb.documents.rooms['final-event-drift-room'].status !== 'tableResult'
) {
  throw new Error('result persistence should mark max-round result rooms as tableResult even while a result event exists');
}

const { HuapaiEngine } = require(join(root, 'services/backend/src/game/core/engine.js'));
const { DEFAULT_RULES } = require(join(root, 'services/backend/src/game/core/rules.js'));
const { getLegalDiscards } = require(join(root, 'services/backend/src/game/core/evaluator.js'));
function finalResultState(round = 2) {
  return {
    phase: 'result',
    currentSeat: 0,
    dealerSeat: 0,
    nextDealerSeat: 1,
    round,
    seats: [0, 1, 2, 3].map((seat) => ({
      id: seat,
      nickName: `座位${seat}`,
      isHuman: seat < 2,
      hand: [],
      melds: [],
      discards: [],
      history: {},
    })),
    deck: [],
    eventSeq: 0,
    publicEvent: null,
    pendingContinuation: null,
    result: { type: 'draw-round', summary: '测试结算' },
  };
}
function finalRoom(id, overrides = {}) {
  return Object.assign({
    _id: id,
    status: 'tableResult',
    version: 1,
    updatedAt: 1,
    hostOpenid: 'rematch-host',
    players: [
      { seat: 0, openid: 'rematch-host', nickName: '房主', ready: true, online: true },
      { seat: 1, openid: 'rematch-guest', nickName: '好友', ready: true, online: true },
    ],
    playerOpenids: ['rematch-host', 'rematch-guest'],
    settings: { maxRounds: 2 },
    state: finalResultState(2),
    rematch: null,
  }, overrides);
}
const leaveFinalDriftDb = createRoomDb({
  'leave-final-drift': finalRoom('leave-final-drift', { status: 'playing', rematch: null }),
});
const leaveFinalDrift = await roomFunction.leaveRoom({
  roomId: 'leave-final-drift',
}, { db: leaveFinalDriftDb, OPENID: 'rematch-guest' });
if (
  !leaveFinalDrift.ok
  || !leaveFinalDrift.left
  || leaveFinalDrift.status !== 'closed'
  || leaveFinalDriftDb.documents.rooms['leave-final-drift'].playerOpenids.length !== 0
) {
  throw new Error('leaveRoom should allow exiting max-round result drift rooms and release active room membership');
}
const hostLeaveFinalDb = createRoomDb({
  'host-leave-final': finalRoom('host-leave-final', {
    rematch: {
      status: 'host-decision',
      requestedBy: '',
      agreedOpenids: [],
      declinedOpenids: [],
      createdAt: 10,
      deadlineAt: Date.now() + 15000,
    },
  }),
});
const hostLeaveFinal = await roomFunction.leaveRoom({
  roomId: 'host-leave-final',
}, { db: hostLeaveFinalDb, OPENID: 'rematch-host' });
if (
  !hostLeaveFinal.ok
  || !hostLeaveFinal.left
  || !hostLeaveFinal.closed
  || hostLeaveFinalDb.documents.rooms['host-leave-final'].status !== 'closed'
  || hostLeaveFinalDb.documents.rooms['host-leave-final'].playerOpenids.length !== 0
) {
  throw new Error('host leave from a final rematch decision room should close the room and release active memberships');
}
const rematchTimeoutDb = createRoomDb({
  'rematch-timeout': finalRoom('rematch-timeout', {
    version: 5,
    rematch: {
      status: 'host-decision',
      requestedBy: '',
      agreedOpenids: [],
      declinedOpenids: [],
      createdAt: 10,
      deadlineAt: 100,
    },
  }),
});
const timedOutRematch = await roomFunction.requestRematch({
  roomId: 'rematch-timeout',
  now: 116,
}, { db: rematchTimeoutDb, OPENID: 'rematch-host' });
if (
  !timedOutRematch.ok
  || !timedOutRematch.closed
  || rematchTimeoutDb.documents.rooms['rematch-timeout'].status !== 'closed'
  || rematchTimeoutDb.documents.rooms['rematch-timeout'].playerOpenids.length !== 0
) {
  throw new Error('expired host rematch decisions should close the room and release all active memberships');
}
const rematchPendingDb = createRoomDb({
  'rematch-pending': finalRoom('rematch-pending', {
    rematch: {
      status: 'host-decision',
      requestedBy: '',
      agreedOpenids: [],
      declinedOpenids: [],
      createdAt: 10,
      deadlineAt: Date.now() + 15000,
    },
  }),
});
const hostRequestedRematch = await roomFunction.requestRematch({
  roomId: 'rematch-pending',
}, { db: rematchPendingDb, OPENID: 'rematch-host' });
if (
  !hostRequestedRematch.ok
  || !hostRequestedRematch.rematch.active
  || !hostRequestedRematch.rematch.selfAgreed
  || rematchPendingDb.documents.rooms['rematch-pending'].rematch.status !== 'pending'
) {
  throw new Error('only the host decision should open a pending rematch vote and count the host as agreed');
}
const rematchRejectDb = createRoomDb({
  'rematch-reject': finalRoom('rematch-reject', {
    rematch: {
      status: 'pending',
      requestedBy: 'rematch-host',
      agreedOpenids: ['rematch-host'],
      declinedOpenids: [],
      createdAt: 10,
      deadlineAt: null,
    },
  }),
});
const rejectedRematch = await roomFunction.requestRematch({
  roomId: 'rematch-reject',
  accept: false,
}, { db: rematchRejectDb, OPENID: 'rematch-guest' });
if (
  !rejectedRematch.ok
  || !rejectedRematch.left
  || !rejectedRematch.declined
  || !rejectedRematch.closed
  || rematchRejectDb.documents.rooms['rematch-reject'].status !== 'closed'
  || rematchRejectDb.documents.rooms['rematch-reject'].playerOpenids.length !== 0
) {
  throw new Error('declining a rematch should exit the player and close the room when too few humans remain');
}
const rematchAcceptDb = createRoomDb({
  'rematch-accept': finalRoom('rematch-accept', {
    rematch: {
      status: 'pending',
      requestedBy: 'rematch-host',
      agreedOpenids: ['rematch-host'],
      declinedOpenids: [],
      createdAt: 10,
      deadlineAt: null,
    },
  }),
});
const acceptedRematch = await roomFunction.requestRematch({
  roomId: 'rematch-accept',
}, { db: rematchAcceptDb, OPENID: 'rematch-guest' });
if (
  !acceptedRematch.ok
  || !acceptedRematch.rematchStarted
  || rematchAcceptDb.documents.rooms['rematch-accept'].status !== 'playing'
  || rematchAcceptDb.documents.rooms['rematch-accept'].state.round !== 1
  || rematchAcceptDb.documents.rooms['rematch-accept'].rematch !== null
) {
  throw new Error('all required rematch acceptances should reset the room counter and start a new round');
}
const targetedBarrierEngine = new HuapaiEngine(DEFAULT_RULES);
targetedBarrierEngine.load({
  phase: 'human-discard',
  currentSeat: 0,
  seats: [{}, {}, {}, {}],
  eventSeq: 0,
  publicEvent: null,
  pendingContinuation: null,
});
targetedBarrierEngine.emitPublicEvent('discard', {
  seat: 0,
  card: { id: 'targeted-barrier-card', key: 'shang' },
  appearanceResolution: 'await-response',
}, {
  type: 'handle-response-window',
  actions: [{ type: 'peng', seat: 2, card: { id: 'targeted-barrier-card', key: 'shang' } }],
  sourceSeat: 0,
});
const targetedBarrierRoom = {
  players: [
    { seat: 0, openid: 'targeted-a', online: true },
    { seat: 1, openid: 'targeted-b', online: true },
    { seat: 2, openid: 'targeted-c', online: true },
    { seat: 3, openid: 'targeted-d', online: true },
  ],
};
roomFunction.syncAnimationBarrier(targetedBarrierRoom, targetedBarrierEngine, 1);
if (
  !targetedBarrierRoom.animationBarrier
  || targetedBarrierRoom.animationBarrier.requiredOpenids.length !== 1
  || targetedBarrierRoom.animationBarrier.requiredOpenids[0] !== 'targeted-c'
) {
  throw new Error('response-window animation barriers should wait only for the next actionable player, not every spectator');
}
const opEngine = new HuapaiEngine(DEFAULT_RULES);
opEngine.startRound({
  seed: 1,
  players: [
    { openid: 'online-player', nickName: '在线玩家', isHuman: true },
    { isHuman: false },
    { isHuman: false },
    { isHuman: false },
  ],
});
const opDocuments = {
  rooms: {
    'op-room': {
      _id: 'op-room',
      status: 'playing',
      version: 1,
      players: [{ seat: 0, openid: 'online-player', online: true }],
      state: { ...opEngine.state, rules: undefined },
    },
  },
  roomStates: {},
};
const opDb = {
  collection(name) {
    return {
      doc(id) {
        return {
          async get() { return { data: opDocuments[name][id] }; },
          async update({ data }) { Object.assign(opDocuments[name][id], data); },
          async set({ data }) { opDocuments[name][id] = { ...data }; },
        };
      },
    };
  },
};
const legalDiscard = getLegalDiscards(opEngine.state.seats[0], DEFAULT_RULES)[0];
const acceptedDiscard = await roomFunction.op({
  roomId: 'op-room',
  version: 1,
  kind: 'discard',
  cardId: legalDiscard.id,
}, { db: opDb, OPENID: 'online-player' });
if (!acceptedDiscard.ok || opDocuments.rooms['op-room'].version !== 2) {
  throw new Error('online authoritative room should accept and persist a legal player discard');
}
if (
  !acceptedDiscard.public
  || !acceptedDiscard.private
  || acceptedDiscard.private.hand.some((card) => card.id === legalDiscard.id)
  || !acceptedDiscard.animation
  || acceptedDiscard.animation.currentEvent.type !== 'discard'
) {
  throw new Error('accepted discard should immediately return the authoritative event and a private hand without the discarded card');
}
const pendingRoom = opDocuments.rooms['op-room'];
const pendingPublic = opDocuments.roomStates['op-room'];
if (
  !pendingRoom.animationBarrier
  || pendingRoom.animationBarrier.eventSeq !== pendingRoom.state.publicEvent.eventSeq
  || !pendingPublic.animation
  || !pendingPublic.animation.waiting
) {
  throw new Error('accepted online operation should persist a public event animation barrier');
}
if ('requiredOpenids' in pendingPublic.animation || 'ackedOpenids' in pendingPublic.animation) {
  throw new Error('public animation state must expose acknowledgement seats instead of private OPENIDs');
}
const blockedDuringAnimation = await roomFunction.op({
  roomId: 'op-room',
  version: 2,
  kind: 'discard',
  cardId: legalDiscard.id,
}, { db: opDb, OPENID: 'online-player' });
if (blockedDuringAnimation.error !== 'ANIMATION_PENDING') {
  throw new Error('new operations must be rejected while the animation barrier is active');
}
const pendingSeq = pendingRoom.animationBarrier.eventSeq;
const pulledPending = await roomFunction.pull({ roomId: 'op-room' }, { db: opDb, OPENID: 'online-player' });
if (!pulledPending.animation || pulledPending.animation.currentEvent.eventSeq !== pendingSeq || pulledPending.animation.selfAcked) {
  throw new Error('pull should expose the current event and the caller acknowledgement state');
}
const acknowledged = await roomFunction.ackAnimation({
  roomId: 'op-room',
  eventSeq: pendingSeq,
}, { db: opDb, OPENID: 'online-player' });
if (!acknowledged.ok || !acknowledged.advanced) {
  throw new Error('the final required animation acknowledgement should advance exactly one server continuation');
}
if (!acknowledged.public || !acknowledged.private || !acknowledged.animation) {
  throw new Error('animation acknowledgement should immediately return the next authoritative snapshot');
}
const duplicateAck = await roomFunction.ackAnimation({
  roomId: 'op-room',
  eventSeq: pendingSeq,
}, { db: opDb, OPENID: 'online-player' });
if (!duplicateAck.ok || !duplicateAck.stale) {
  throw new Error('duplicate or stale animation acknowledgements should be idempotent');
}

const multiAckEngine = new HuapaiEngine(DEFAULT_RULES);
multiAckEngine.load({
  phase: 'human-discard',
  currentSeat: 0,
  seats: [{ isHuman: true, online: true }, { isHuman: true, online: true }, {}, {}],
  eventSeq: 0,
  publicEvent: null,
  pendingContinuation: null,
});
multiAckEngine.emitPublicEvent('pass', { seat: 0 });
opDocuments.rooms['multi-ack-room'] = {
  _id: 'multi-ack-room',
  status: 'playing',
  version: 5,
  players: [
    { seat: 0, openid: 'multi-a', online: true, lastSeenAt: 1 },
    { seat: 1, openid: 'multi-b', online: true, lastSeenAt: 1 },
  ],
  state: { ...multiAckEngine.state, rules: undefined },
};
roomFunction.syncAnimationBarrier(opDocuments.rooms['multi-ack-room'], multiAckEngine, 1);
const multiAckSeq = opDocuments.rooms['multi-ack-room'].animationBarrier.eventSeq;
const partialAck = await roomFunction.ackAnimation({
  roomId: 'multi-ack-room',
  eventSeq: multiAckSeq,
}, { db: opDb, OPENID: 'multi-a' });
if (
  !partialAck.ok
  || partialAck.advanced
  || partialAck.version !== 5
  || opDocuments.rooms['multi-ack-room'].version !== 5
  || opDocuments.rooms['multi-ack-room'].animationBarrier.ackedOpenids.join(',') !== 'multi-a'
) {
  throw new Error('partial animation acknowledgements must not advance the public room version');
}
const finalAck = await roomFunction.ackAnimation({
  roomId: 'multi-ack-room',
  eventSeq: multiAckSeq,
}, { db: opDb, OPENID: 'multi-b' });
if (
  !finalAck.ok
  || !finalAck.advanced
  || finalAck.version !== 6
  || opDocuments.rooms['multi-ack-room'].version !== 6
) {
  throw new Error('only the final required animation acknowledgement should advance the public room version');
}

const pullTimeoutEngine = new HuapaiEngine(DEFAULT_RULES);
pullTimeoutEngine.load({
  phase: 'human-discard',
  currentSeat: 0,
  seats: [{ isHuman: true, online: true }, {}, {}, {}],
  eventSeq: 0,
  publicEvent: null,
  pendingContinuation: null,
});
pullTimeoutEngine.emitPublicEvent('discard', {
  seat: 0,
  card: { id: 'pull-timeout-card', key: 'shang' },
});
opDocuments.rooms['pull-timeout-room'] = {
  _id: 'pull-timeout-room',
  status: 'playing',
  version: 1,
  players: [{ seat: 0, openid: 'pull-timeout-player', online: true, lastSeenAt: 1 }],
  state: { ...pullTimeoutEngine.state, rules: undefined },
};
roomFunction.syncAnimationBarrier(opDocuments.rooms['pull-timeout-room'], pullTimeoutEngine, 1).deadlineAt = Date.now() - 1;
const pullAdvanced = await roomFunction.pull({
  roomId: 'pull-timeout-room',
}, { db: opDb, OPENID: 'pull-timeout-player' });
if (
  !pullAdvanced.ok
  || pullAdvanced.version !== 2
  || opDocuments.rooms['pull-timeout-room'].animationBarrier
  || (pullAdvanced.animation && pullAdvanced.animation.waiting)
) {
  throw new Error('pull should advance expired animation barriers when HTTPS fallback is the only active path');
}

const timeoutEngine = new HuapaiEngine(DEFAULT_RULES);
timeoutEngine.startRound({
  seed: 9,
  players: [
    { openid: 'timeout-a', nickName: '超时甲', isHuman: true },
    { openid: 'timeout-b', nickName: '超时乙', isHuman: true },
    { isHuman: false },
    { isHuman: false },
  ],
});
timeoutEngine.emitPublicEvent('pass', { seat: 0 });
const timeoutRoom = {
  _id: 'timeout-room',
  status: 'playing',
  version: 1,
  createdAt: 1,
  players: [
    { seat: 0, openid: 'timeout-a', online: true, lastSeenAt: 1 },
    { seat: 1, openid: 'timeout-b', online: true, lastSeenAt: 1 },
  ],
  state: { ...timeoutEngine.state, rules: undefined },
};
roomFunction.syncAnimationBarrier(timeoutRoom, timeoutEngine, 1).deadlineAt = 2;
opDocuments.rooms['timeout-room'] = timeoutRoom;
const timeoutHeartbeat = await roomFunction.heartbeat({
  roomId: 'timeout-room',
}, { db: opDb, OPENID: 'timeout-a' });
if (
  !timeoutHeartbeat.ok
  || !timeoutHeartbeat.advanced
  || opDocuments.rooms['timeout-room'].animationMetrics.timeoutCount !== 1
  || opDocuments.rooms['timeout-room'].animationBarrier
) {
  throw new Error('expired animation barriers should mark non-acknowledging clients offline and continue the room');
}

const roomSource = await readFile(join(root, 'services/backend/src/game/room.js'), 'utf8');
if (/\.doc\([^)]*\)\.set\(\{\s*data:\s*\{\s*_id:/s.test(roomSource)) {
  throw new Error('room document set must not write _id');
}
if (!/async function writeRoomState[\s\S]*?collection\(ROOMS\)\.doc\(roomId\)\.set\(/.test(roomSource)) {
  throw new Error('authoritative room state must use document.set to safely replace null and nested object fields');
}
const animationControllerSource = await readFile(join(root, 'js/game/animation/controller.js'), 'utf8');
if (!/playOnlineEvent\(event, onComplete\)/.test(animationControllerSource)) {
  throw new Error('animation controller should expose an explicit online event animation API');
}
const mainSource = await readFile(join(root, 'js/main.js'), 'utf8');
if (!/this\.online\.onLobby = \(lobby\) => \{[\s\S]*?this\.mode = 'lobby';[\s\S]*?this\.menu\.show\(\);[\s\S]*?\};/.test(mainSource)) {
  throw new Error('returning to the online lobby should switch the main render mode away from the table and show the menu');
}
const menuSource = await readFile(join(root, 'js/ui/menu.js'), 'utf8');
if (!/roundOptions\s*=\s*\[1,\s*2,\s*4,\s*6\]/.test(menuSource)) {
  throw new Error('online lobby should expose one, two, four, and six round room options');
}
const rendererSource = await readFile(join(root, 'js/game/renderer.js'), 'utf8');
const layoutSource = await readFile(join(root, 'js/game/layout.js'), 'utf8');
if (/eventSeq|playOnlineEvent/.test(rendererSource)) {
  throw new Error('renderer should not manage online event sequence or animation lifecycle');
}
if (!/state\.animationWaiting/.test(rendererSource)) {
  throw new Error('renderer should block state compensation while an online authoritative animation is waiting');
}
if (!/leaveTable/.test(layoutSource) || !/requestRematch/.test(layoutSource) || !/declineRematch/.test(layoutSource)) {
  throw new Error('final table settlement should expose exit, accept, and decline action hit regions');
}
if (!/state\.tableFinished[\s\S]*?牌局已结束/.test(rendererSource)) {
  throw new Error('final table settlement should render an explicit table result title');
}

await rm(tempDir, { recursive: true, force: true });
console.log('online checks passed');
