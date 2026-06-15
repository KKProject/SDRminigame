import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tempDir = join(root, '.tmp-online-checks');

await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });

await writeFile(join(tempDir, 'cloud.mjs'), await readFile(join(root, 'js/net/cloud.js'), 'utf8'));
await writeFile(join(tempDir, 'profile.mjs'), await readFile(join(root, 'js/net/profile.js'), 'utf8'));
await writeFile(
  join(tempDir, 'online.mjs'),
  (await readFile(join(root, 'js/net/online.js'), 'utf8'))
    .replace("from '../game/rules'", "from './rules-stub.mjs'")
    .replace("from './cloud'", "from './cloud.mjs'")
);
await writeFile(join(tempDir, 'rules-stub.mjs'), 'export const DEFAULT_RULES = { seatCount: 4 };');

let callData = null;
globalThis.wx = {
  cloud: {
    init() {},
    callFunction(options) {
      callData = options.data;
      options.success({ result: { ok: true } });
    },
  },
  login(options) {
    options.success({ code: 'wx-login-code' });
  },
};

const cloud = await import(pathToFileURL(join(tempDir, 'cloud.mjs')));
const online = await import(pathToFileURL(join(tempDir, 'online.mjs')));
const profile = await import(pathToFileURL(join(tempDir, 'profile.mjs')));

await cloud.login({ nickName: '测试玩家' });
if (
  !callData
  || callData.code !== 'wx-login-code'
  || callData.nickName !== '测试玩家'
  || !callData.profile
  || callData.profile.nickName !== '测试玩家'
) {
  throw new Error('online login should forward wx.login code and profile to the login cloud function');
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

if (online.onlineErrorMessage({ code: 'LOGIN_STORAGE_ERROR' }) !== '登录数据库初始化失败，请检查云数据库权限') {
  throw new Error('storage login errors should display an actionable message');
}
if (online.onlineErrorMessage({ code: 'FUNCTION_NOT_FOUND' }) !== '登录云函数未部署，请先上传并部署云函数') {
  throw new Error('missing login cloud function should display an actionable message');
}
if (cloud.cloudErrorCode({ errCode: -501005 }) !== 'CLOUD_ENV_INVALID') {
  throw new Error('invalid cloud environment errors should be normalized');
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

let animationPlayCount = 0;
let animationAckCount = 0;
let completeAnimation = null;
let localPreviewCount = 0;
let localPreviewConfirmCount = 0;
let localPreviewCancelCount = 0;
const cardSoundEvents = [];
const actionSoundEvents = [];
globalThis.wx.cloud.callFunction = (options) => {
  if (options.data.action === 'ackAnimation') animationAckCount += 1;
  options.success({ result: options.data.action === 'ackAnimation' ? { ok: true } : { ok: false } });
};
const onlineRenderer = {
  playOnlineEvent(event, onComplete) {
    animationPlayCount += 1;
    completeAnimation = onComplete;
    return true;
  },
  playLocalActionPreview() {
    localPreviewCount += 1;
    return true;
  },
  confirmLocalActionPreview(event, onComplete) {
    localPreviewConfirmCount += 1;
    completeAnimation = onComplete;
    return true;
  },
  cancelLocalActionPreview() {
    localPreviewCancelCount += 1;
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
onlineController.isAnimating = false;
onlineController.lastPlayedEventSeq = 6;
onlineController.startLocalActionPreview({ type: 'chi', seat: 0, card: { id: 'chi-card' } });
if (localPreviewCount !== 1 || actionSoundEvents.join(',') !== 'peng,chi') {
  throw new Error('local response preview should start its animation and action voice immediately');
}
onlineController.consumeAnimationState({
  waiting: true,
  selfAcked: false,
  currentEvent: { eventSeq: 7, type: 'chi', seat: 0 },
});
if (localPreviewConfirmCount !== 1 || actionSoundEvents.join(',') !== 'peng,chi') {
  throw new Error('matching authoritative action should reuse the local preview without replaying its voice');
}
completeAnimation({ eventSeq: 7, type: 'chi', seat: 0 });
if (localPreviewCancelCount !== 1) {
  throw new Error('confirmed local action preview should be released when its animation completes');
}
onlineController.isAnimating = false;
onlineController.lastPlayedEventSeq = 7;
onlineController.startLocalActionPreview({ type: 'discard', seat: 0, card: { id: 'local-discard' } });
if (localPreviewCount !== 2 || cardSoundEvents.join(',') !== 'discarded-card,card-5,local-discard') {
  throw new Error('local discard preview should begin with its card voice before the network response arrives');
}
onlineController.consumeAnimationState({
  waiting: true,
  selfAcked: false,
  currentEvent: { eventSeq: 8, type: 'discard', seat: 0, card: { id: 'local-discard' } },
});
if (localPreviewConfirmCount !== 2 || cardSoundEvents.join(',') !== 'discarded-card,card-5,local-discard') {
  throw new Error('matching authoritative discard should reuse the local preview without replaying its card voice');
}
globalThis.wx.cloud.callFunction = (options) => {
  options.fail({ errMsg: 'temporary network failure' });
};
onlineController.lastAckedEventSeq = 5;
await onlineController.sendAnimationAck(6);
if (!onlineController.ackRetryTimer) {
  throw new Error('failed animation acknowledgements should schedule an idempotent retry');
}
clearTimeout(onlineController.ackRetryTimer);
onlineController.ackRetryTimer = null;

const require = createRequire(import.meta.url);
const loginFunction = require(join(root, 'cloudfunctions/login/index.js'));
const roomFunction = require(join(root, 'cloudfunctions/game/room.js'));
if (!loginFunction.isCollectionMissingError({ errCode: -502005 })) {
  throw new Error('login cloud function should recognize a missing database collection');
}
if (loginFunction.isCollectionMissingError({ errCode: -502003 })) {
  throw new Error('login cloud function must not treat permission errors as missing collections');
}
const roomDocument = roomFunction.documentData({ _id: 'room-id', status: 'waiting' });
if ('_id' in roomDocument || roomDocument.status !== 'waiting') {
  throw new Error('doc(id).set data must omit the immutable _id field');
}

const { HuapaiEngine } = require(join(root, 'cloudfunctions/game/core/engine.js'));
const { DEFAULT_RULES } = require(join(root, 'cloudfunctions/game/core/rules.js'));
const { getLegalDiscards } = require(join(root, 'cloudfunctions/game/core/evaluator.js'));
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

const loginSource = await readFile(join(root, 'cloudfunctions/login/index.js'), 'utf8');
const roomSource = await readFile(join(root, 'cloudfunctions/game/room.js'), 'utf8');
if (/userRef\.set\(\{\s*data:\s*\{\s*_id:/s.test(loginSource)) {
  throw new Error('login user document set must not write _id');
}
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
if (/eventSeq|playOnlineEvent/.test(await readFile(join(root, 'js/game/renderer.js'), 'utf8'))) {
  throw new Error('renderer should not manage online event sequence or animation lifecycle');
}

await rm(tempDir, { recursive: true, force: true });
console.log('online checks passed');
