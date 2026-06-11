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

await rm(tempDir, { recursive: true, force: true });
console.log('online checks passed');
