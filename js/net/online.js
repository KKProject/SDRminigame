import { DEFAULT_RULES } from '../rules';
import { ensureCloudInit, callFunction, cloudErrorCode, login } from './cloud';
import { reportClientDiagnostic } from './diagnostics';
import OnlineSocketTransport from './socket';
import { phraseFromCode, symbolFromCode } from './codec';

const SEAT_COUNT = DEFAULT_RULES.seatCount;
const ROOM_SESSION_KEY = 'huapai-online-room';
const RECONNECT_DELAY_MS = 1500;
const HEARTBEAT_INTERVAL_MS = 20000;
const WAITING_REFRESH_INTERVAL_MS = 2000;
const RESPONSE_ACTION_TYPES = ['chi', 'peng', 'zhao', 'ta', 'hu', 'pass'];
const MELD_ACTION_TYPES = ['chi', 'peng', 'zhao', 'ta'];
const RESULT_EVENT_TYPES = ['hu', 'circle-loss', 'draw-round', 'settlement'];
const SUPPORTED_RESULT_TYPES = ['win', 'circle-loss', 'draw-round', 'draw'];
const BEHAVIOR_EVENT_TYPES = ['chi', 'peng', 'zhao', 'ta', 'hu', 'circle-loss', 'draw-round'];
const OBSERVATIONAL_EVENT_TYPES = ['pass', 'settlement', 'unclaimed'];
const TIMELINE_FAST_QUEUE_THRESHOLD = 2;
const SOCKET_AUTH_REFRESH_SKEW_MS = 60 * 1000;
const INVITE_START_HOME_ERROR_CODES = new Set([
  'ROOM_NOT_FOUND',
  'ROOM_ENDED',
  'ROOM_ALREADY_STARTED',
  'ROOM_NOT_JOINABLE',
  'ROOM_FULL',
]);
const SOCKET_AUTH_ERROR_CODES = [
  'TOKEN_EXPIRED',
  'TOKEN_SIGNATURE_INVALID',
  'TOKEN_TYPE_MISMATCH',
  'TOKEN_MALFORMED',
  'TOKEN_PAYLOAD_INVALID',
  'SOCKET_UNAUTHORIZED',
  'SOCKET_TOKEN_EXPIRED',
  'SOCKET_TOKEN_INVALID',
  'SOCKET_CONNECT_UNAUTHORIZED',
];
const SUPPORTED_PAY_TYPES = ['pihu', 'jiahu', 'changhu'];
const RECOVERABLE_ROOM_STATUSES = ['waiting', 'playing', 'finished'];
export const LOBBY_STATES = {
  CHECKING_ROOM: 'checking-room',
  RECONNECTING: 'reconnecting',
  JOINING_INVITE: 'joining-invite',
  IDLE: 'idle',
  CREATING: 'creating',
  ERROR: 'error',
};

function recoverableRoomStatus(status) {
  return RECOVERABLE_ROOM_STATUSES.indexOf(status) >= 0;
}

function roomLifecycleDiagnostic(event, detail = {}) {
  console.info('[online-room-lifecycle]', Object.assign({ event }, detail));
}

function lobbyProfile(loginRes = {}, fallback = {}) {
  const user = loginRes.user || {};
  const profileReady = Boolean(user.nickName || user.avatarUrl || fallback.nickName || fallback.avatarUrl);
  return {
    nickName: user.nickName || fallback.nickName || '',
    avatarUrl: user.avatarUrl || fallback.avatarUrl || '',
    openid: loginRes.openid || user.openid || '',
    profileReady,
  };
}

function normalizeLobbyRoomSettings(input = {}) {
  const source = typeof input === 'number'
    ? { maxRounds: input }
    : Object.assign({}, input.settings || {}, input);
  const maxRounds = Number(source.maxRounds);
  const payType = SUPPORTED_PAY_TYPES.indexOf(source.payType) >= 0 ? source.payType : 'pihu';
  return {
    maxRounds: [1, 2, 4, 6].indexOf(maxRounds) >= 0 ? maxRounds : 2,
    repeatRound: Boolean(source.repeatRound),
    washTwice: Boolean(source.washTwice),
    payType,
  };
}

function animationActionType(type) {
  if (type === 'acceptTakeover') return 'accept-takeover';
  if (type === 'declineTakeover') return 'decline-takeover';
  return type;
}

function shouldPlayOptimisticLocalPreview(action = {}) {
  const type = animationActionType(action.type);
  return RESPONSE_ACTION_TYPES.indexOf(type) < 0;
}

function clonePlain(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function isResultEvent(event = {}) {
  return event && RESULT_EVENT_TYPES.indexOf(event.type) >= 0;
}

function hasSupportedResult(result = null) {
  return Boolean(result && SUPPORTED_RESULT_TYPES.indexOf(result.type) >= 0);
}

function isResponseCriticalEvent(event = {}) {
  return event
    && (event.type === 'draw' || event.type === 'discard')
    && event.appearanceResolution === 'await-response';
}

function timelineEventCategory(event = {}) {
  if (isResponseCriticalEvent(event)) return 'response-critical';
  if (BEHAVIOR_EVENT_TYPES.indexOf(event.type) >= 0) return 'behavior';
  if (OBSERVATIONAL_EVENT_TYPES.indexOf(event.type) >= 0) return 'observational';
  if ((event.type === 'draw' || event.type === 'discard') && event.appearanceResolution === 'auto-discard') return 'observational';
  return 'normal';
}

function timelinePlaybackMode(event = {}, queueLength = 0, recovering = false) {
  const category = timelineEventCategory(event);
  if (category === 'response-critical') return 'full';
  if (recovering && category === 'observational') return 'skip';
  if (queueLength >= TIMELINE_FAST_QUEUE_THRESHOLD && category === 'observational') return 'skip';
  if (queueLength >= TIMELINE_FAST_QUEUE_THRESHOLD && category === 'behavior') return 'fast';
  return 'full';
}

function isResponseAction(action = {}) {
  return RESPONSE_ACTION_TYPES.indexOf(animationActionType(action.type)) >= 0;
}

function responseActionMatches(candidate = {}, action = {}) {
  if (!candidate || !action) return false;
  if (candidate.type !== action.type) return false;
  if (typeof action.index === 'number' && typeof candidate.index === 'number' && candidate.index !== action.index) return false;
  if (action.zhaoSize != null && candidate.zhaoSize != null && candidate.zhaoSize !== action.zhaoSize) return false;
  return true;
}

function diagnosticAction(action = {}) {
  if (!action) return null;
  return {
    type: action.type || '',
    index: typeof action.index === 'number' ? action.index : null,
    seat: typeof action.seat === 'number' ? action.seat : null,
    zhaoSize: action.zhaoSize || null,
    cardId: (action.card && action.card.id) || action.cardId || '',
    key: action.key || (action.card && action.card.key) || '',
  };
}

function diagnosticEvent(event = {}) {
  if (!event) return null;
  return {
    eventSeq: typeof event.eventSeq === 'number' ? event.eventSeq : null,
    type: event.type || '',
    seat: typeof event.seat === 'number' ? event.seat : null,
    actingSeat: typeof event.actingSeat === 'number' ? event.actingSeat : null,
    cardId: (event.card && event.card.id) || event.cardId || '',
    cardKey: (event.card && event.card.key) || '',
    appearanceResolution: event.appearanceResolution || '',
    responseWindowId: event.responseWindowId || '',
  };
}

function diagnosticResponseSummary(summary = {}) {
  if (!summary || !summary.active) return summary && summary.active === false ? { active: false } : null;
  return {
    active: true,
    id: summary.id || '',
    sourceSeat: typeof summary.sourceSeat === 'number' ? summary.sourceSeat : null,
    sourceType: summary.sourceType || '',
    cardId: summary.cardId || '',
    candidateSeats: Array.isArray(summary.candidateSeats) ? summary.candidateSeats.slice() : [],
    waitingSeats: Array.isArray(summary.waitingSeats) ? summary.waitingSeats.slice() : [],
    decidedSeats: Array.isArray(summary.decidedSeats) ? summary.decidedSeats.slice() : [],
    blockingSeats: Array.isArray(summary.blockingSeats) ? summary.blockingSeats.slice() : [],
    currentBest: summary.currentBest ? {
      seat: summary.currentBest.seat,
      type: summary.currentBest.type,
      priority: summary.currentBest.priority,
    } : null,
  };
}

function diagnosticOp(op = {}) {
  if (!op) return null;
  return {
    kind: op.kind || '',
    cardId: op.cardId || '',
    accept: typeof op.accept === 'boolean' ? op.accept : null,
    ref: diagnosticAction(op.ref || {}),
  };
}

function normalizeInviteRoomId(value) {
  const roomId = String(value || '').trim();
  return /^\d{6}$/.test(roomId) ? roomId : '';
}

function roomIdFromScene(scene) {
  if (!scene) return '';
  const decoded = decodeURIComponent(String(scene));
  const params = decoded.split('&').reduce((acc, part) => {
    const [key, value = ''] = part.split('=');
    if (key) acc[key] = value;
    return acc;
  }, {});
  return normalizeInviteRoomId(params.roomId || params.r || decoded);
}

export function inviteRoomIdFromOptions(options = {}) {
  const query = options.query || {};
  return normalizeInviteRoomId(query.roomId)
    || roomIdFromScene(query.scene)
    || normalizeInviteRoomId(options.roomId);
}

export function readLaunchInviteRoomId(runtime = wx) {
  try {
    return runtime && runtime.getLaunchOptionsSync
      ? inviteRoomIdFromOptions(runtime.getLaunchOptionsSync() || {})
      : '';
  } catch (err) {
    return '';
  }
}

export function registerInviteRoomListener(onInvite, runtime = wx) {
  if (!runtime || !runtime.onShow || typeof onInvite !== 'function') return () => {};
  const listener = (options = {}) => {
    const roomId = inviteRoomIdFromOptions(options);
    if (roomId) onInvite(roomId);
  };
  runtime.onShow(listener);
  return () => {
    if (runtime.offShow) runtime.offShow(listener);
  };
}

export function shareRoomInvite(roomId, runtime = wx) {
  const normalized = normalizeInviteRoomId(roomId);
  if (!normalized) return false;
  const payload = {
    title: '来和我打一桌上大人',
    query: `roomId=${normalized}&source=friendInvite`,
  };
  if (runtime && runtime.shareAppMessage) {
    runtime.shareAppMessage(payload);
    return payload;
  }
  if (runtime && runtime.showShareMenu) runtime.showShareMenu({ withShareTicket: true });
  return payload;
}

export function localActionIdentity(action = {}) {
  const type = animationActionType(action.type);
  const cardId = action.card && action.card.id ? action.card.id : (action.cardId || '');
  return {
    type,
    actingSeat: typeof action.actingSeat === 'number' ? action.actingSeat : (typeof action.seat === 'number' ? action.seat : 0),
    cardId,
    key: action.card && action.card.key ? action.card.key : '',
    zhaoSize: action.zhaoSize || 0,
  };
}

export function localActionMatchesEvent(pending, event) {
  if (!pending || !event) return false;
  const identity = pending.identity || pending;
  const eventType = animationActionType(event.type);
  const actingSeat = typeof event.actingSeat === 'number' ? event.actingSeat : event.seat;
  if (identity.type !== eventType || actingSeat !== identity.actingSeat) return false;
  if (!identity.cardId) return true;
  if (event.card && event.card.id === identity.cardId) return true;
  if (event.meld) return (event.meld.cards || []).some((card) => card.id === identity.cardId);
  return !event.card;
}

function readRoomSession() {
  try {
    return wx.getStorageSync ? (wx.getStorageSync(ROOM_SESSION_KEY) || null) : null;
  } catch (err) {
    return null;
  }
}

function saveRoomSession(roomId, seat) {
  try {
    if (wx.setStorageSync) wx.setStorageSync(ROOM_SESSION_KEY, { roomId, seat });
  } catch (err) { /* 缓存失败不阻断牌局 */ }
}

function clearRoomSession() {
  try {
    if (wx.removeStorageSync) wx.removeStorageSync(ROOM_SESSION_KEY);
  } catch (err) { /* ignore */ }
}

function rotateSeat(seat, mySeat) {
  if (typeof seat !== 'number') return seat;
  return (seat - mySeat + SEAT_COUNT) % SEAT_COUNT;
}

function rotateAppearing(appearing, mySeat) {
  if (!appearing) return null;
  return Object.assign({}, appearing, {
    sourceSeat: rotateSeat(appearing.sourceSeat, mySeat),
    responseStartSeat: rotateSeat(appearing.responseStartSeat, mySeat),
  });
}

function rotateScoreMap(scores, mySeat) {
  if (!scores || typeof scores !== 'object') return scores;
  return Object.keys(scores).reduce((mapped, seat) => {
    const localSeat = rotateSeat(Number(seat), mySeat);
    mapped[localSeat] = scores[seat];
    return mapped;
  }, {});
}

function rotateResult(result, mySeat) {
  if (!result) return null;
  const mapped = Object.assign({}, result);
  if (typeof result.winner === 'number') mapped.winner = rotateSeat(result.winner, mySeat);
  if (typeof result.loser === 'number') mapped.loser = rotateSeat(result.loser, mySeat);
  if (Array.isArray(result.winners)) mapped.winners = result.winners.map((s) => rotateSeat(s, mySeat));
  if (typeof result.nextDealer === 'number') mapped.nextDealer = rotateSeat(result.nextDealer, mySeat);
  if (result.settlement && Array.isArray(result.settlement.payments)) {
    mapped.settlement = Object.assign({}, result.settlement, {
      payments: result.settlement.payments.map((p) => Object.assign({}, p, {
        from: rotateSeat(p.from, mySeat),
        to: rotateSeat(p.to, mySeat),
      })),
    });
  }
  if (result.roundScores) mapped.roundScores = rotateScoreMap(result.roundScores, mySeat);
  if (result.tableScores) mapped.tableScores = rotateScoreMap(result.tableScores, mySeat);
  return mapped;
}

export function rotateRoundDetail(detail, mySeat) {
  if (!detail) return null;
  const mapped = Object.assign({}, detail);
  mapped.players = (detail.players || []).map((player) => {
    const mappedPlayer = Object.assign({}, player, {
      seat: rotateSeat(player.seat, mySeat),
      finalHand: (player.finalHand || []).slice(),
      melds: (player.melds || []).slice(),
    });
    if (player.winningCard) mappedPlayer.winningCard = Object.assign({}, player.winningCard);
    if (Array.isArray(player.winningGroups)) {
      mappedPlayer.winningGroups = player.winningGroups.map((group) => Object.assign({}, group, {
        cards: (group.cards || []).slice(),
      }));
    }
    return mappedPlayer;
  }).sort((left, right) => left.seat - right.seat);
  const continuation = detail.continuation || {};
  const requiredSeats = (continuation.requiredSeats || []).map((seat) => rotateSeat(seat, mySeat));
  const confirmedSeats = (continuation.confirmedSeats || []).map((seat) => rotateSeat(seat, mySeat));
  mapped.continuation = Object.assign({}, continuation, {
    requiredSeats,
    confirmedSeats,
    selfConfirmed: confirmedSeats.indexOf(0) >= 0,
  });
  return mapped;
}

export function rotateTableRecord(record, mySeat) {
  if (!record) return null;
  return Object.assign({}, record, {
    players: (record.players || []).map((player) => Object.assign({}, player, {
      serverSeat: player.seat,
      seat: rotateSeat(player.seat, mySeat),
    })),
    settings: Object.assign({}, record.settings || {}),
    rematch: Object.assign({}, record.rematch || {}),
  });
}

export function onlineErrorMessage(err) {
  const code = cloudErrorCode(err);
  const messages = {
    BACKEND_UNSUPPORTED: '当前环境不支持网络请求，请使用微信真机或开发者工具',
    CLOUD_UNSUPPORTED: '当前环境不支持网络请求，请使用微信真机或开发者工具',
    WX_LOGIN_FAILED: '微信登录失败，请检查登录状态后重试',
    BACKEND_TIMEOUT: '后端服务响应超时，请检查网络后重试',
    BACKEND_ENDPOINT_MISSING: '自有后端 API 未配置，请设置服务器域名',
    BACKEND_AUTH_MISSING: '登录状态已失效，请重新进入在线对战',
    CLOUD_TIMEOUT: '后端服务响应超时，请检查网络后重试',
    CLOUD_ENV_INVALID: '后端服务不可用，请确认小游戏 AppID 与服务配置一致',
    FUNCTION_NOT_FOUND: '自有后端服务未部署，请先发布服务器',
    DATABASE_COLLECTION_MISSING: '后端数据库集合缺失，请检查自有服务数据库',
    NO_OPENID: '未获取到微信身份，请确认小游戏 AppID 与后端服务配置一致',
    LOGIN_STORAGE_ERROR: '登录数据库初始化失败，请检查后端数据库权限',
    LOGIN_FAILED: '登录失败，请重试',
    ACTIVE_ROOM_FAILED: '检查已有房间失败，请重试',
    RECONNECT_FAILED: '进入房间失败，请重试',
    CREATE_ROOM_FAILED: '创建牌桌失败，请检查 rooms 数据库集合',
    START_FAILED: '牌桌开局失败，请重试',
    TABLE_FINISHED: '牌桌已结束',
    NEXT_ROUND_CONFIRM_REQUIRED: '请在对局结果页确认继续',
    ROUND_STALE: '本局已经变化，正在刷新结果',
    RESULT_NOT_READY: '请等待本局动画完成',
    JOIN_ROOM_FAILED: '加入房间失败，请重试',
    ROOM_NOT_FOUND: '房间不存在或已失效',
    ROOM_FULL: '房间已满',
    ROOM_ALREADY_STARTED: '房间已经开局，无法加入',
    ROOM_ALREADY_PLAYING: '牌桌正在进行中',
    ROOM_ENDED: '房间已经结束',
    ROOM_NOT_FINISHED: '牌桌尚未结束，暂时不能退出',
    ROOM_NOT_JOINABLE: '房间当前不可加入',
    NOT_HOST: '只有房主可以发起再来一局',
    ALREADY_IN_ROOM: '你已有未结束牌桌，正在进入原牌桌',
    ALREADY_IN_ACTIVE_ROOM: '你已有进行中的房间，请先继续当前房间',
    ROOM_NOT_RECOVERABLE: '房间状态已变化，请返回大厅重试',
    NOT_IN_ROOM: '当前微信账号不在这张牌桌中',
    WAITING_FOR_PLAYERS: '至少需要 2 名真人玩家才能开局',
    HOST_NOT_READY: '房主准备后才能开局',
    PLAYERS_NOT_READY: '所有玩家准备后才能开局',
    INVALID_SEAT: '座位信息无效，请刷新后重试',
    TARGET_NOT_FOUND: '该座位暂无可交换玩家',
    CANNOT_SWAP_SELF: '不能和自己交换座位',
    SWAP_REQUEST_PENDING: '当前已有换座请求待处理',
    SWAP_REQUEST_NOT_FOUND: '换座请求已失效',
    SWAP_REQUEST_STALE: '换座请求已过期，请重新发起',
    NOT_SWAP_TARGET: '该换座请求不是发给你的',
    SWAP_PLAYER_LEFT: '对方已离开房间，换座失败',
    SWAP_REQUEST_FAILED: '发送换座请求失败，请重试',
    SWAP_RESPONSE_FAILED: '处理换座请求失败，请重试',
    SET_READY_FAILED: '准备状态更新失败，请重试',
    LEAVE_ROOM_FAILED: '退出牌桌失败，请重试',
    REMATCH_FAILED: '发起重开失败，请重试',
    SOCKET_ENDPOINT_MISSING: 'WebSocket 入口未配置，请设置自有 WSS 域名',
    SOCKET_URL_MISSING: 'WebSocket 入口未配置，请设置自有 WSS 域名',
    SOCKET_SERVICE_MISSING: 'WebSocket 入口未配置，请设置自有 WSS 域名',
    SOCKET_ENV_MISSING: 'WebSocket 入口未配置，请设置自有 WSS 域名',
    SOCKET_TOKEN_MISSING: 'WebSocket 鉴权缺失，请检查自有服务 token 配置',
    SOCKET_UNSUPPORTED: '当前环境不支持 WebSocket，请使用微信开发者工具或真机',
    SOCKET_NOT_CONNECTED: '连接已断开，等待重连',
    SOCKET_ABNORMAL_CLOSE: 'WebSocket 异常断开，请检查 socket 服务日志',
    SOCKET_CONNECT_FAILED: 'WebSocket 连接失败，请检查服务和域名配置',
  };
  return messages[code] || `进入在线对战失败：${code}`;
}

function shouldReturnInviteToStart(err) {
  return INVITE_START_HOME_ERROR_CODES.has(cloudErrorCode(err));
}

function socketAuthSummary(auth = {}) {
  const url = String((auth && auth.url) || '');
  const env = String((auth && auth.env) || '');
  const service = String((auth && auth.service) || '');
  const path = String((auth && auth.path) || '');
  let host = '';
  try {
    host = url.replace(/^wss?:\/\//, '').split('/')[0].split('?')[0];
  } catch (err) {
    host = '';
  }
  return {
    hasUrl: Boolean(url),
    hasEnv: Boolean(env),
    hasService: Boolean(service),
    hasToken: Boolean(auth && auth.token),
    host,
    env,
    service,
    path,
  };
}

function missingSocketAuthCode(auth = {}) {
  if (!auth || !auth.url) return 'SOCKET_ENDPOINT_MISSING';
  if (!auth.token) return 'SOCKET_TOKEN_MISSING';
  return '';
}

function socketAuthNeedsRefresh(auth = {}, now = Date.now()) {
  if (!auth || !auth.token) return true;
  if (typeof auth.expiresAt !== 'number') return false;
  return auth.expiresAt - now <= SOCKET_AUTH_REFRESH_SKEW_MS;
}

function isSocketAuthError(err = {}) {
  const code = String((err && (err.code || err.error || err.message)) || '');
  return SOCKET_AUTH_ERROR_CODES.indexOf(code) >= 0 || code.indexOf('TOKEN_') === 0 || code.indexOf('UNAUTHORIZED') >= 0;
}

function socketWaitingMessage(code) {
  if (code === 'SOCKET_ENDPOINT_MISSING' || code === 'SOCKET_URL_MISSING') return 'WebSocket 未配置，等待重连…';
  if (code === 'SOCKET_SERVICE_MISSING') return 'WebSocket 未配置，等待重连…';
  if (code === 'SOCKET_ENV_MISSING') return 'WebSocket 未配置，等待重连…';
  if (code === 'SOCKET_TOKEN_MISSING') return 'WebSocket 鉴权缺失，等待重连…';
  if (code === 'SOCKET_UNSUPPORTED') return '当前环境不支持 WebSocket，等待重连…';
  if (code === 'SOCKET_ABNORMAL_CLOSE') return 'WebSocket 异常断开，等待重连…';
  return '连接已断开，等待重连…';
}

function opErrorMessage(res = {}) {
  const messages = {
    ROOM_NOT_FOUND: '当前牌桌不存在，请重新进入在线对战',
    ROOM_NOT_PLAYING: '当前牌桌尚未开局或牌局已经结束',
    NOT_IN_ROOM: '当前微信账号不在这张牌桌中',
    NOT_YOUR_TURN: '当前不是你的回合',
    NO_STATE: '牌桌状态尚未准备完成',
    VERSION_STALE: '牌桌状态已更新，正在重新同步',
    ANIMATION_PENDING: '上一动作动画尚未完成，请稍候',
    UNKNOWN_OP_KIND: '无法识别这次操作',
  };
  return res.reason || messages[res.error] || `操作失败：${res.error || 'UNKNOWN_ERROR'}`;
}

function rotatePublicEvent(event, mySeat) {
  if (!event) return null;
  const mapped = Object.assign({}, event);
  if (typeof event.seat === 'number') mapped.seat = rotateSeat(event.seat, mySeat);
  if (typeof event.actingSeat === 'number') mapped.actingSeat = rotateSeat(event.actingSeat, mySeat);
  if (event.result) mapped.result = rotateResult(event.result, mySeat);
  return mapped;
}

function symbolKeyFromEvent(event = {}) {
  if (event.symbol && event.symbol.key) return event.symbol.key;
  if (typeof event.symbolCode === 'number') return symbolFromCode(event.symbolCode).key;
  if (event.meld && event.meld.key) return event.meld.key;
  if (event.meld && event.meld.cards && event.meld.cards[0]) return event.meld.cards[0].key;
  if (event.card && event.card.key) return event.card.key;
  return '';
}

function phraseKeysFromEvent(event = {}) {
  if (event.phrase && Array.isArray(event.phrase.keys)) return event.phrase.keys;
  if (typeof event.phraseCode === 'number') return phraseFromCode(event.phraseCode).keys;
  if (event.meld && Array.isArray(event.meld.cards) && event.meld.cards.length) {
    return event.meld.cards.map((card) => card.key).filter(Boolean);
  }
  return [];
}

function incomingKeyFromEvent(event = {}) {
  if (event.incomingSymbol && event.incomingSymbol.key) return event.incomingSymbol.key;
  if (typeof event.incomingSymbolCode === 'number') return symbolFromCode(event.incomingSymbolCode).key;
  if (event.card && event.card.key) return event.card.key;
  if (event.meld && event.meld.key) return event.meld.key;
  return symbolKeyFromEvent(event);
}

function removeCardsByKeys(hand = [], keys = []) {
  const remainingKeys = keys.slice();
  const removed = [];
  const nextHand = hand.filter((card) => {
    const index = remainingKeys.indexOf(card.key);
    if (index < 0) return true;
    remainingKeys.splice(index, 1);
    removed.push(card);
    return false;
  });
  return { hand: nextHand, removed };
}

function rotateAction(action, mySeat, index = null) {
  const mapped = Object.assign({}, action, {
    seat: rotateSeat(action.seat, mySeat),
  });
  if (typeof action.sourceSeat === 'number') mapped.sourceSeat = rotateSeat(action.sourceSeat, mySeat);
  if (typeof action.ownerSeat === 'number') mapped.ownerSeat = rotateSeat(action.ownerSeat, mySeat);
  if (typeof index === 'number') mapped.index = index;
  return mapped;
}

function rotateResponseSummary(summary, mySeat) {
  if (!summary) return summary;
  const mapped = Object.assign({}, summary, {
    sourceSeat: rotateSeat(summary.sourceSeat, mySeat),
    candidateSeats: (summary.candidateSeats || []).map((seat) => rotateSeat(seat, mySeat)),
    waitingSeats: (summary.waitingSeats || []).map((seat) => rotateSeat(seat, mySeat)),
    decidedSeats: (summary.decidedSeats || []).map((seat) => rotateSeat(seat, mySeat)),
    blockingSeats: (summary.blockingSeats || []).map((seat) => rotateSeat(seat, mySeat)),
  });
  if (summary.currentBest && typeof summary.currentBest.seat === 'number') {
    mapped.currentBest = Object.assign({}, summary.currentBest, {
      seat: rotateSeat(summary.currentBest.seat, mySeat),
    });
  }
  return mapped;
}

function rotatePublicPatch(patch = {}, mySeat) {
  const mapped = Object.assign({}, patch);
  ['currentSeat', 'dealerSeat', 'nextDealerSeat'].forEach((key) => {
    if (typeof mapped[key] === 'number') mapped[key] = rotateSeat(mapped[key], mySeat);
  });
  if (mapped.responseSummary) mapped.responseSummary = rotateResponseSummary(mapped.responseSummary, mySeat);
  if (mapped.result) mapped.result = rotateResult(mapped.result, mySeat);
  if (mapped.roundDetail) mapped.roundDetail = rotateRoundDetail(mapped.roundDetail, mySeat);
  if (mapped.tableRecord) mapped.tableRecord = rotateTableRecord(mapped.tableRecord, mySeat);
  if (Array.isArray(mapped.pendingActions)) {
    mapped.pendingActions = mapped.pendingActions.map((action) => rotateAction(action, mySeat));
  }
  if (Array.isArray(mapped.playerActions)) {
    mapped.playerActions = mapped.playerActions.map((action, index) => rotateAction(action, mySeat, index));
  }
  return mapped;
}

/**
 * 把服务端公共状态 + 本人私密手牌映射成本地渲染所需的 databus 状态。
 * 旋转使「我」始终位于本地座位 0，复用既有渲染器与命中测试。
 */
function buildLocalState(pub, priv, mySeat, prevSelectedId) {
  const seats = new Array(SEAT_COUNT);
  (pub.seats || []).forEach((seat) => {
    const local = rotateSeat(seat.id, mySeat);
    seats[local] = {
      id: local,
      serverSeat: seat.id,
      name: seat.nickName || `玩家${seat.id}`,
      nickName: seat.nickName || '',
      avatarUrl: seat.avatarUrl || '',
      isHuman: seat.isHuman,
      isDealer: seat.isDealer,
      hand: seat.id === mySeat ? (priv.hand || []) : [],
      melds: seat.melds || [],
      discards: seat.discards || [],
      score: seat.score || 0,
      history: Object.assign({ discardPhraseCounts: {} }, seat.history || {}),
    };
  });

  const drawnCard = pub.appearingCard && pub.appearingCard.source === 'draw'
    ? pub.appearingCard.card
    : null;

  const hasPrivateResponseProtocol = priv.responseWindowId
    || priv.actionState
    || (pub.responseSummary && pub.responseSummary.active);
  const privateActions = Array.isArray(priv.playerActions) && (hasPrivateResponseProtocol || priv.playerActions.length)
    ? priv.playerActions
    : (pub.currentSeat === mySeat ? (pub.playerActions || []) : []);
  const myTurnActions = privateActions.map((action, index) => rotateAction(action, mySeat, index));

  const recentDiscard = pub.recentDiscard
    ? Object.assign({}, pub.recentDiscard, { seat: rotateSeat(pub.recentDiscard.seat, mySeat) })
    : null;

  const handIds = new Set((priv.hand || []).map((c) => c.id));
  const selectedCardId = prevSelectedId && handIds.has(prevSelectedId) ? prevSelectedId : null;

  const responseSummary = rotateResponseSummary(pub.responseSummary, mySeat);
  const pendingActions = (pub.pendingActions || []).map((action) => rotateAction(action, mySeat));

  return {
    rules: DEFAULT_RULES,
    seats,
    deck: [],
    phase: pub.phase,
    currentSeat: rotateSeat(pub.currentSeat, mySeat),
    humanSeat: 0,
    dealerSeat: rotateSeat(pub.dealerSeat, mySeat),
    nextDealerSeat: rotateSeat(pub.nextDealerSeat, mySeat),
    slippedDealer: rotateSeat(pub.slippedDealer, mySeat),
    takeoverDealer: rotateSeat(pub.takeoverDealer, mySeat),
    jiangCard: pub.jiangCard || null,
    jiangPhraseId: pub.jiangPhraseId || null,
    appearingCard: rotateAppearing(pub.appearingCard, mySeat),
    drawnCard,
    selectedCardId,
    legalDiscardIds: priv.legalDiscardIds || [],
    recentDiscard,
    pendingActions,
    playerActions: myTurnActions,
    responseSummary,
    responseWindowId: priv.responseWindowId || null,
    actionState: priv.actionState || (responseSummary && responseSummary.active ? 'closed' : 'closed'),
    feedback: pub.feedback || '',
    result: rotateResult(pub.result, mySeat),
    roundDetail: rotateRoundDetail(pub.roundDetail, mySeat),
    tableRecord: rotateTableRecord(pub.tableRecord, mySeat),
    tableRecordOpen: false,
    tableScores: rotateScoreMap(pub.tableScores, mySeat),
    muted: false,
    round: pub.round || 0,
  };
}

export default class OnlineController {
  constructor(databus, tableView, music, animator = null) {
    this.databus = databus;
    this.tableView = tableView;
    this.music = music;
    this.animator = animator || (tableView && tableView.animator) || tableView;
    this.roomId = null;
    this.mySeat = 0;
    this.version = -1;
    this.watcher = null;
    this.boundTouch = this.handleTouch.bind(this);
    this.boundTouchMove = this.handleTouchMove.bind(this);
    this.boundTouchEnd = this.handleTouchEnd.bind(this);
    this.roundResultScrollTouch = null;
    this.active = false;
    this.onStatus = null;
    this.starting = false;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.boundNetworkChange = this.handleNetworkChange.bind(this);
    this.currentEvent = null;
    this.lastPlayedEventSeq = 0;
    this.lastAckedEventSeq = 0;
    this.lastLocallyCompletedEventSeq = 0;
    this.timelineQueue = [];
    this.timelineCurrent = null;
    this.timelineConsumedEventSeqs = new Set();
    this.authoritativeState = null;
    this.isAnimating = false;
    this.animationWaiting = false;
    this.ackRetryTimer = null;
    this.ackingEventSeq = 0;
    this.localActionPreviewType = null;
    this.pendingLocalAction = null;
    this.zhaoSizePicker = null;
    this.lobbyState = null;
    this.lobbyProfile = null;
    this.loginProfile = {};
    this.lobbyError = '';
    this.onLobby = null;
    this.onWaitingRoom = null;
    this.onEnterTable = null;
    this.waitingRoom = null;
    this.waitingError = '';
    this.waitingRefreshTimer = null;
    this.socketAuth = null;
    this.socket = new OnlineSocketTransport();
    this.socket.onSnapshot = (snapshot) => this.applySocketSnapshot(snapshot);
    this.socket.onDelta = (delta) => this.applySocketDelta(delta);
    this.socket.onDisconnect = (err) => this.handleSocketDisconnect(err);
    this.socket.onProtocolMismatch = () => this.reconnectSocketNow();
    this.lastServerEventSeq = 0;
    this.socketReconnecting = false;
    this.lastSocketErrorCode = '';
    this.rematchDecisionTimer = null;
    this.reconnectFallbackTimer = null;
    this.reconnectFallbackInFlight = false;
  }

  setStatus(text) {
    if (typeof this.onStatus === 'function') this.onStatus(text);
  }

  reportOnlineDiagnostic(event, extra = {}) {
    if (!event) return;
    const state = this.databus || {};
    const currentEvent = this.currentEvent || (state.publicEvent || null);
    const detail = Object.assign({
      roomId: this.roomId || '',
      version: this.version,
      mySeat: typeof this.mySeat === 'number' ? this.mySeat : null,
      phase: state.phase || '',
      currentSeat: typeof state.currentSeat === 'number' ? state.currentSeat : null,
      responseWindowId: state.responseWindowId || '',
      actionState: state.actionState || '',
      playerActions: Array.isArray(state.playerActions) ? state.playerActions.map(diagnosticAction) : [],
      responseSummary: diagnosticResponseSummary(state.responseSummary),
      animationWaiting: Boolean(this.animationWaiting),
      databusAnimationWaiting: Boolean(state.animationWaiting),
      isAnimating: Boolean(this.isAnimating),
      localActionPreviewType: this.localActionPreviewType || '',
      currentEvent: diagnosticEvent(currentEvent),
      lastServerEventSeq: this.lastServerEventSeq,
      lastPlayedEventSeq: this.lastPlayedEventSeq,
      lastAckedEventSeq: this.lastAckedEventSeq,
      lastLocallyCompletedEventSeq: this.lastLocallyCompletedEventSeq,
      ackingEventSeq: this.ackingEventSeq || 0,
      timelineQueueLength: this.timelineQueue ? this.timelineQueue.length : 0,
      timelineCurrentEventSeq: this.timelineCurrent && this.timelineCurrent.event
        ? this.timelineCurrent.event.eventSeq
        : null,
      timelineCurrentMode: this.timelineCurrent ? (this.timelineCurrent.mode || '') : '',
      socketReady: Boolean(this.socket && this.socket.isReady && this.socket.isReady()),
    }, extra);
    console.info(`[online:diagnostic] ${event}`, detail);
    reportClientDiagnostic(event, detail);
  }

  setLobbyState(state, detail = {}) {
    this.lobbyState = state;
    if (detail.error) this.lobbyError = detail.error;
    else if (state !== LOBBY_STATES.ERROR) this.lobbyError = '';
    if (typeof this.onLobby === 'function') {
      this.onLobby(Object.assign({
        state,
        profile: this.lobbyProfile,
        error: this.lobbyError,
      }, detail));
    }
  }

  setWaitingRoomState(room, detail = {}) {
    if (room) this.waitingRoom = room;
    if (detail.error) this.waitingError = detail.error;
    else this.waitingError = '';
    if (typeof this.onWaitingRoom === 'function') {
      this.onWaitingRoom(Object.assign({
        room: this.waitingRoom,
        profile: this.lobbyProfile,
        error: this.waitingError,
      }, detail));
    }
  }

  notifyEnterTable(result = {}) {
    if (typeof this.onEnterTable === 'function') {
      this.onEnterTable(Object.assign({
        roomId: this.roomId,
        seat: this.mySeat,
      }, result));
    }
  }

  clearRematchDecisionTimer() {
    if (this.rematchDecisionTimer) clearTimeout(this.rematchDecisionTimer);
    this.rematchDecisionTimer = null;
  }

  scheduleRematchDecisionTimer(rematch = {}) {
    this.clearRematchDecisionTimer();
    if (!rematch || !rematch.hostDecision || !rematch.deadlineAt) return;
    const delay = Math.max(0, Number(rematch.deadlineAt) - Date.now());
    this.rematchDecisionTimer = setTimeout(() => {
      this.returnToLobby();
    }, delay);
  }

  returnToLobby() {
    clearRoomSession();
    this.active = false;
    this.roomId = null;
    this.version = -1;
    this.lastServerEventSeq = 0;
    this.currentEvent = null;
    this.timelineQueue = [];
    this.timelineCurrent = null;
    this.timelineConsumedEventSeqs.clear();
    this.authoritativeState = null;
    this.isAnimating = false;
    this.animationWaiting = false;
    this.ackingEventSeq = 0;
    this.clearRematchDecisionTimer();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopReconnectFallbackRefresh();
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    if (this.ackRetryTimer) clearTimeout(this.ackRetryTimer);
    this.ackRetryTimer = null;
    this.cancelLocalActionPreview();
    this.closeWatcher();
    if (this.socket) this.socket.close();
    if (wx.offTouchStart) wx.offTouchStart(this.boundTouch);
    if (wx.offTouchMove) wx.offTouchMove(this.boundTouchMove);
    if (wx.offTouchEnd) wx.offTouchEnd(this.boundTouchEnd);
    this.roundResultScrollTouch = null;
    if (this.databus && typeof this.databus.reset === 'function') this.databus.reset();
    this.setStatus('');
    this.setLobbyState(LOBBY_STATES.IDLE, { profile: this.lobbyProfile });
    return true;
  }

  async loginForLobby(profile = {}, options = {}) {
    if (!ensureCloudInit()) throw new Error('BACKEND_UNSUPPORTED');
    if (!options.silent) this.setStatus('登录中…');
    this.loginProfile = Object.assign({}, profile);
    const loginRes = await login(profile);
    if (!loginRes || !loginRes.ok) {
      const error = new Error((loginRes && loginRes.error) || 'LOGIN_FAILED');
      error.code = (loginRes && loginRes.error) || 'LOGIN_FAILED';
      error.detail = loginRes && loginRes.message;
      throw error;
    }
    this.lobbyProfile = lobbyProfile(loginRes, profile);
    this.socketAuth = loginRes.socket || null;
    console.info('[online] profile synced', {
      nickName: this.lobbyProfile.nickName,
      hasAvatar: Boolean(this.lobbyProfile.avatarUrl),
      receivedProfile: loginRes.receivedProfile || {},
      socket: socketAuthSummary(this.socketAuth),
    });
    return this.lobbyProfile;
  }

  async refreshSocketAuth(reason = 'reconnect') {
    const profile = this.lobbyProfile || this.loginProfile || {};
    console.info('[online] refreshing socket auth', {
      reason,
      roomId: this.roomId,
      previous: socketAuthSummary(this.socketAuth),
    });
    const loginRes = await login(profile);
    if (!loginRes || !loginRes.ok || !loginRes.socket || !loginRes.socket.token) {
      const error = new Error((loginRes && loginRes.error) || 'SOCKET_TOKEN_UNAVAILABLE');
      error.code = (loginRes && loginRes.error) || 'SOCKET_TOKEN_UNAVAILABLE';
      throw error;
    }
    this.lobbyProfile = lobbyProfile(loginRes, profile);
    this.socketAuth = loginRes.socket;
    return this.socketAuth;
  }

  async enterExistingRoom(roomInfo = {}) {
    if (!roomInfo.roomId) throw new Error('ROOM_NOT_FOUND');
    if (!recoverableRoomStatus(roomInfo.status)) {
      roomLifecycleDiagnostic('unsupported-room-entry', {
        roomId: roomInfo.roomId,
        status: roomInfo.status || 'unknown',
      });
      const error = new Error('ROOM_NOT_RECOVERABLE');
      error.code = 'ROOM_NOT_RECOVERABLE';
      throw error;
    }
    if (roomInfo.status === 'waiting' || roomInfo.room) {
      return this.enterWaitingRoom(roomInfo);
    }
    this.roomId = roomInfo.roomId;
    this.mySeat = typeof roomInfo.seat === 'number' ? roomInfo.seat : 0;
    saveRoomSession(this.roomId, this.mySeat);
    if (!(await this.reconnectSocketNow())) {
      clearRoomSession();
      this.roomId = null;
      const code = this.lastSocketErrorCode || 'RECONNECT_FAILED';
      const error = new Error(code);
      error.code = code;
      throw error;
    }
    this.active = true;
    this.stopWaitingRefresh();
    this.bindNetworkEvents();
    return { roomId: this.roomId, seat: this.mySeat, reconnected: true };
  }

  async checkActiveRoom(profile = {}, options = {}) {
    if (!this.socketAuth) {
      await this.loginForLobby(profile, { silent: true });
    }
    const active = await callFunction('game', { action: 'activeRoom' });
    if (!active || !active.ok) {
      const error = new Error((active && active.error) || 'ACTIVE_ROOM_FAILED');
      error.code = (active && active.error) || 'ACTIVE_ROOM_FAILED';
      throw error;
    }
    return active;
  }

  async startLobby(profile = {}, options = {}) {
    if (this.starting) throw new Error('ONLINE_STARTING');
    this.starting = true;
    let inviteRoomId = '';
    try {
      await this.loginForLobby(profile);
      inviteRoomId = normalizeInviteRoomId(options.inviteRoomId);
      this.setLobbyState(LOBBY_STATES.CHECKING_ROOM);
      this.setStatus('检查牌桌…');
      const active = await callFunction('game', { action: 'activeRoom' });
      if (!active || !active.ok) {
        const error = new Error((active && active.error) || 'ACTIVE_ROOM_FAILED');
        error.code = (active && active.error) || 'ACTIVE_ROOM_FAILED';
        throw error;
      }
      if (active.hasRoom) {
        if (!recoverableRoomStatus(active.status)) {
          roomLifecycleDiagnostic('startup-ignored-terminal-room', {
            roomId: active.roomId || '',
            status: active.status || 'unknown',
          });
          clearRoomSession();
        } else {
          this.setLobbyState(LOBBY_STATES.RECONNECTING, { room: active });
          this.setStatus('正在进入房间…');
          const entered = await this.enterExistingRoom(active);
          this.setStatus('');
          return Object.assign({ entered: entered.entered !== false }, entered);
        }
      }
      if (inviteRoomId) {
        this.setLobbyState(LOBBY_STATES.JOINING_INVITE, { roomId: inviteRoomId });
        this.setStatus('正在加入邀请房间…');
        const joined = await this.joinInviteRoom(inviteRoomId);
        this.setStatus('');
        return joined;
      }
      clearRoomSession();
      this.setLobbyState(LOBBY_STATES.IDLE);
      this.setStatus('');
      return { entered: false, profile: this.lobbyProfile };
    } catch (err) {
      if (this.lobbyProfile && !(inviteRoomId && shouldReturnInviteToStart(err))) {
        this.setLobbyState(LOBBY_STATES.ERROR, { error: onlineErrorMessage(err) });
      }
      throw err;
    } finally {
      this.starting = false;
    }
  }

  async createLobbyRoom(settingsInput = 2) {
    if (this.starting) throw new Error('ONLINE_STARTING');
    this.starting = true;
    try {
      if (!ensureCloudInit()) throw new Error('BACKEND_UNSUPPORTED');
      const settings = normalizeLobbyRoomSettings(settingsInput);
      this.setLobbyState(LOBBY_STATES.CREATING, { settings, maxRounds: settings.maxRounds });
      this.setStatus('创建牌桌…');
      const created = await callFunction('game', {
        action: 'createRoom',
        profile: this.lobbyProfile || {},
        maxRounds: settings.maxRounds,
        settings,
      });
      if (!created || !created.ok) {
        const error = new Error((created && created.error) || 'CREATE_ROOM_FAILED');
        error.code = (created && created.error) || 'CREATE_ROOM_FAILED';
        error.existing = created && created.existing ? created.existing : null;
        if (error.code === 'ALREADY_IN_ACTIVE_ROOM') {
          roomLifecycleDiagnostic('create-room-conflict', {
            roomId: error.existing && error.existing.roomId ? error.existing.roomId : '',
            status: error.existing && error.existing.status ? error.existing.status : 'unknown',
          });
        }
        throw error;
      }
      if (created.alreadyInRoom) {
        const error = new Error('ALREADY_IN_ACTIVE_ROOM');
        error.code = 'ALREADY_IN_ACTIVE_ROOM';
        error.existing = created;
        roomLifecycleDiagnostic('legacy-create-room-conflict', {
          roomId: created.roomId || '',
          status: created.status || 'unknown',
        });
        throw error;
      }
      const waiting = await this.enterWaitingRoom(created);
      this.setStatus('');
      return waiting;
    } catch (err) {
      this.setLobbyState(LOBBY_STATES.ERROR, { error: onlineErrorMessage(err) });
      throw err;
    } finally {
      this.starting = false;
    }
  }

  async enterWaitingRoom(info = {}) {
    const room = info.room || null;
    const roomId = info.roomId || (room && room.roomId);
    if (!roomId) throw new Error('ROOM_NOT_FOUND');
    this.roomId = roomId;
    this.mySeat = typeof info.seat === 'number'
      ? info.seat
      : (room && typeof room.yourSeat === 'number' ? room.yourSeat : this.mySeat);
    saveRoomSession(this.roomId, this.mySeat);
    this.active = false;
    this.closeWatcher();
    if (wx.offTouchStart) wx.offTouchStart(this.boundTouch);
    if (wx.offTouchMove) wx.offTouchMove(this.boundTouchMove);
    if (wx.offTouchEnd) wx.offTouchEnd(this.boundTouchEnd);
    this.roundResultScrollTouch = null;
    const snapshot = room || (await this.fetchWaitingRoom());
    this.setWaitingRoomState(snapshot || {
      roomId,
      status: 'waiting',
      settings: info.settings || {},
      players: info.players || [],
      canStart: false,
      yourSeat: this.mySeat,
    });
    this.startWaitingRefresh();
    return { entered: false, waiting: true, roomId: this.roomId, seat: this.mySeat, room: this.waitingRoom };
  }

  async fetchWaitingRoom() {
    if (!this.roomId) return null;
    const res = await callFunction('game', { action: 'roomInfo', roomId: this.roomId });
    if (!res || !res.ok) {
      const error = new Error((res && res.error) || 'JOIN_ROOM_FAILED');
      error.code = (res && res.error) || 'JOIN_ROOM_FAILED';
      throw error;
    }
    this.mySeat = typeof res.seat === 'number' ? res.seat : this.mySeat;
    return res.room;
  }

  async refreshWaitingRoom() {
    if (!this.roomId || this.active) return false;
    try {
      const room = await this.fetchWaitingRoom();
      if (room && room.status !== 'waiting') {
        this.stopWaitingRefresh();
        if (room.status === 'closed') {
          this.setStatus('房间已解散');
          return this.returnToLobby();
        }
        const entered = await this.enterExistingRoom({ roomId: this.roomId, seat: this.mySeat, status: room.status });
        this.setStatus('');
        if (entered && entered.entered !== false) {
          this.notifyEnterTable(Object.assign({ entered: true }, entered));
          return true;
        }
        return false;
      }
      this.setWaitingRoomState(room);
      return true;
    } catch (err) {
      const code = cloudErrorCode(err);
      if (code === 'ROOM_ENDED' || code === 'NOT_IN_ROOM') {
        this.setStatus(code === 'ROOM_ENDED' ? '房间已解散' : '已退出房间');
        return this.returnToLobby();
      }
      this.setWaitingRoomState(this.waitingRoom, { error: onlineErrorMessage(err) });
      return false;
    }
  }

  startWaitingRefresh() {
    this.stopWaitingRefresh();
    this.waitingRefreshTimer = setInterval(() => {
      this.refreshWaitingRoom();
    }, WAITING_REFRESH_INTERVAL_MS);
  }

  stopWaitingRefresh() {
    if (this.waitingRefreshTimer) clearInterval(this.waitingRefreshTimer);
    this.waitingRefreshTimer = null;
  }

  async joinInviteRoom(roomId) {
    const normalized = normalizeInviteRoomId(roomId);
    if (!normalized) {
      const error = new Error('ROOM_NOT_FOUND');
      error.code = 'ROOM_NOT_FOUND';
      throw error;
    }
    const joined = await callFunction('game', {
      action: 'joinRoom',
      roomId: normalized,
      profile: this.lobbyProfile || {},
    });
    if (joined && joined.ok) return this.enterWaitingRoom(joined);
    if (joined && joined.error === 'ALREADY_IN_ROOM' && joined.existing) {
      const entered = await this.enterExistingRoom(joined.existing);
      return Object.assign({ entered: entered.entered !== false }, entered);
    }
    const error = new Error((joined && joined.error) || 'JOIN_ROOM_FAILED');
    error.code = (joined && joined.error) || 'JOIN_ROOM_FAILED';
    throw error;
  }

  async setReady(ready = true) {
    if (!this.roomId) return false;
    try {
      const res = await this.callGame('setReady', { ready });
      if (!res || !res.ok) {
        const error = new Error((res && res.error) || 'SET_READY_FAILED');
        error.code = (res && res.error) || 'SET_READY_FAILED';
        throw error;
      }
      this.setWaitingRoomState(res.room);
      return true;
    } catch (err) {
      this.setWaitingRoomState(this.waitingRoom, { error: onlineErrorMessage(err) });
      return false;
    }
  }

  async requestSeatSwap(targetSeat) {
    if (!this.roomId || typeof targetSeat !== 'number') return false;
    try {
      const res = await this.callGame('requestSeatSwap', { targetSeat });
      if (!res || !res.ok) {
        const error = new Error((res && res.error) || 'SWAP_REQUEST_FAILED');
        error.code = (res && res.error) || 'SWAP_REQUEST_FAILED';
        throw error;
      }
      this.setWaitingRoomState(res.room);
      return true;
    } catch (err) {
      this.setWaitingRoomState(this.waitingRoom, { error: onlineErrorMessage(err) });
      return false;
    }
  }

  async respondSeatSwap(requestId, accept = true) {
    if (!this.roomId) return false;
    try {
      const res = await this.callGame('respondSeatSwap', { requestId, accept });
      if (!res || !res.ok) {
        const error = new Error((res && res.error) || 'SWAP_RESPONSE_FAILED');
        error.code = (res && res.error) || 'SWAP_RESPONSE_FAILED';
        throw error;
      }
      if (typeof res.seat === 'number') this.mySeat = res.seat;
      this.setWaitingRoomState(res.room);
      return true;
    } catch (err) {
      this.setWaitingRoomState(this.waitingRoom, { error: onlineErrorMessage(err) });
      return false;
    }
  }

  async startWaitingRoom() {
    if (!this.roomId) return false;
    try {
      const started = await this.callGame('startRound');
      if (!started || !started.ok) {
        const error = new Error((started && started.error) || 'START_FAILED');
        error.code = (started && started.error) || 'START_FAILED';
        if (started && started.room) this.setWaitingRoomState(started.room);
        throw error;
      }
      this.stopWaitingRefresh();
      this.active = true;
      this.bindNetworkEvents();
      if (!(await this.reconnectSocketNow())) {
        const code = this.lastSocketErrorCode || 'RECONNECT_FAILED';
        const error = new Error(code);
        error.code = code;
        throw error;
      }
      this.setStatus('');
      return true;
    } catch (err) {
      this.setWaitingRoomState(this.waitingRoom, { error: onlineErrorMessage(err) });
      return false;
    }
  }

  shareWaitingRoom() {
    const roomId = this.roomId || (this.waitingRoom && this.waitingRoom.roomId);
    return shareRoomInvite(roomId);
  }

  /**
   * 兼容旧自测入口：登录 → 创建房间 → 进入等待房间。
   */
  async startSoloOnline(profile = {}) {
    if (this.starting) throw new Error('ONLINE_STARTING');
    this.starting = true;
    try {
      await this.loginForLobby(profile);

      const session = readRoomSession();
      if (session && session.roomId) {
        this.setStatus('恢复牌桌…');
        this.roomId = session.roomId;
        this.mySeat = typeof session.seat === 'number' ? session.seat : 0;
        if (await this.reconnectSocketNow()) {
          this.active = true;
          this.bindNetworkEvents();
          return { roomId: this.roomId, seat: this.mySeat, reconnected: true };
        }
        clearRoomSession();
        this.roomId = null;
      }

      this.setStatus('创建牌桌…');
      const created = await callFunction('game', { action: 'createRoom', profile });
      if (!created || !created.ok) {
        const error = new Error((created && created.error) || 'CREATE_ROOM_FAILED');
        error.code = (created && created.error) || 'CREATE_ROOM_FAILED';
        throw error;
      }
      this.roomId = created.roomId;
      this.mySeat = created.seat;
      saveRoomSession(this.roomId, this.mySeat);
      return this.enterWaitingRoom(created);
    } finally {
      this.starting = false;
    }
  }

  enableInput() {
    wx.onTouchStart(this.boundTouch);
    if (wx.onTouchMove) wx.onTouchMove(this.boundTouchMove);
    if (wx.onTouchEnd) wx.onTouchEnd(this.boundTouchEnd);
  }

  subscribe() {
    this.reconnectSocketNow();
  }

  async refresh() {
    if (!this.roomId) return false;
    if (this.active) {
      if (!this.socket.isReady()) {
        this.socketReconnecting = true;
        this.scheduleReconnect(0);
        return false;
      }
      try {
        const res = await this.socket.request('pull', { roomId: this.roomId, version: this.version });
        return this.applyServerSnapshot(res);
      } catch (err) {
        this.scheduleReconnect(0);
        return false;
      }
    }
    try {
      const res = await callFunction('game', { action: 'pull', roomId: this.roomId });
      return this.applyServerSnapshot(res);
    } catch (err) {
      return false;
    }
  }

  startReconnectFallbackRefresh() {
    this.reconnectFallbackInFlight = false;
  }

  stopReconnectFallbackRefresh() {
    if (this.reconnectFallbackTimer) clearInterval(this.reconnectFallbackTimer);
    this.reconnectFallbackTimer = null;
    this.reconnectFallbackInFlight = false;
  }

  trySocketSubscribe() {
    if (!this.roomId) return false;
    const missingCode = missingSocketAuthCode(this.socketAuth);
    if (missingCode) {
      this.lastSocketErrorCode = missingCode;
      console.warn('[online] socket auth missing', {
        code: missingCode,
        auth: socketAuthSummary(this.socketAuth),
      });
      return false;
    }
    this.closeWatcher();
    this.socket.connect(this.socketAuth)
      .then(() => this.socket.subscribe(this.roomId, this.version, this.lastServerEventSeq))
      .then((snapshot) => {
        this.socketReconnecting = false;
        this.lastSocketErrorCode = '';
        this.applySocketSnapshot(snapshot);
      })
      .catch((err) => {
        this.lastSocketErrorCode = (err && err.code) || 'SOCKET_CONNECT_FAILED';
        console.warn('[online] socket subscribe failed', {
          code: this.lastSocketErrorCode,
          auth: socketAuthSummary(this.socketAuth),
          closeCode: err && err.closeCode,
          reason: err && err.reason,
          message: err && (err.errMsg || err.message),
        });
        this.scheduleReconnect();
      });
    return true;
  }

  async reconnectSocketNow() {
    if (!this.roomId) return false;
    if (socketAuthNeedsRefresh(this.socketAuth)) {
      try {
        await this.refreshSocketAuth(this.socketAuth && this.socketAuth.token ? 'socket-auth-expiring' : 'socket-auth-missing');
      } catch (err) {
        const code = (err && err.code) || 'SOCKET_TOKEN_REFRESH_FAILED';
        this.socketReconnecting = true;
        this.lastSocketErrorCode = code;
        console.warn('[online] socket auth refresh failed', {
          code,
          roomId: this.roomId,
          message: err && (err.errMsg || err.message),
        });
        this.setStatus(socketWaitingMessage(code));
        return false;
      }
    }
    const missingCode = missingSocketAuthCode(this.socketAuth);
    if (missingCode) {
      this.socketReconnecting = true;
      this.lastSocketErrorCode = missingCode;
      console.warn('[online] socket auth missing', {
        code: missingCode,
        auth: socketAuthSummary(this.socketAuth),
      });
      this.setStatus(socketWaitingMessage(missingCode));
      return false;
    }
    const connectWithCurrentAuth = async () => {
      this.closeWatcher();
      await this.socket.connect(this.socketAuth);
      const snapshot = await this.socket.subscribe(this.roomId, this.version, this.lastServerEventSeq);
      this.socketReconnecting = false;
      this.lastSocketErrorCode = '';
      this.stopReconnectFallbackRefresh();
      this.applySocketSnapshot(snapshot);
      this.setStatus('');
      return true;
    };
    try {
      return await connectWithCurrentAuth();
    } catch (err) {
      if (isSocketAuthError(err)) {
        try {
          await this.refreshSocketAuth((err && err.code) || 'socket-auth-rejected');
          return await connectWithCurrentAuth();
        } catch (refreshErr) {
          err = refreshErr;
        }
      }
      this.socketReconnecting = true;
      this.lastSocketErrorCode = (err && err.code) || 'SOCKET_CONNECT_FAILED';
      console.warn('[online] socket reconnect failed', {
        code: this.lastSocketErrorCode,
        auth: socketAuthSummary(this.socketAuth),
        closeCode: err && err.closeCode,
        reason: err && err.reason,
        message: err && (err.errMsg || err.message),
      });
      this.setStatus(socketWaitingMessage(this.lastSocketErrorCode));
      return false;
    }
  }

  handleSocketDisconnect(err) {
    if (!this.active && !this.roomId) return;
    this.socketReconnecting = true;
    this.lastSocketErrorCode = (err && err.code) || 'SOCKET_CLOSED';
    this.setStatus(socketWaitingMessage(this.lastSocketErrorCode));
    this.scheduleReconnect();
  }

  applySocketSnapshot(snapshot = {}) {
    if (!snapshot) return false;
    if (snapshot.public) return this.applyServerSnapshot(Object.assign({ ok: true }, snapshot));
    if (snapshot.room) this.setWaitingRoomState(snapshot.room);
    return true;
  }

  applySocketDelta(delta = {}) {
    if (!delta || !this.active || !this.roomId) return false;
    if (delta.roomId && delta.roomId !== this.roomId) return this.resyncFromDelta('room-mismatch');
    const eventSeq = typeof delta.eventSeq === 'number'
      ? delta.eventSeq
      : (delta.event && typeof delta.event.eventSeq === 'number' ? delta.event.eventSeq : 0);
    if (typeof delta.version !== 'number' || typeof delta.baseVersion !== 'number' || (!eventSeq && !delta.stateOnly)) {
      return this.resyncFromDelta('missing-sequence');
    }
    if (delta.version <= this.version && eventSeq <= this.lastServerEventSeq) return true;
    if (delta.baseVersion !== this.version) return this.resyncFromDelta('version-gap');
    if (delta.stateOnly) {
      if (!this.applyPublicDelta(null, delta.delta || {})) return this.resyncFromDelta('delta-rejected');
      this.version = delta.version;
      if (eventSeq) this.lastServerEventSeq = Math.max(this.lastServerEventSeq, eventSeq);
      this.authoritativeState = clonePlain(this.databus);
      return true;
    }
    if (this.lastServerEventSeq && eventSeq > this.lastServerEventSeq + 1) {
      return this.resyncFromDelta('event-gap');
    }
    const event = rotatePublicEvent(delta.event || {}, this.mySeat);
    if (!event || event.eventSeq !== eventSeq) return this.resyncFromDelta('event-invalid');
    const publicPatch = delta.delta && delta.delta.publicPatch;
    const gateResultDisplay = isResultEvent(event) && publicPatch && publicPatch.phase === 'result';
    let displayCommit = null;
    if (gateResultDisplay) {
      if (!hasSupportedResult(event.result)) return this.resyncFromDelta('result-missing');
      const candidate = clonePlain(this.authoritativeState || this.databus);
      if (!candidate || !Array.isArray(candidate.seats)) return this.resyncFromDelta('result-state-missing');
      if (!this.applyPublicDelta(event, delta.delta || {}, candidate)) return this.resyncFromDelta('delta-rejected');
      candidate.result = clonePlain(event.result);
      candidate.animationWaiting = false;
      this.authoritativeState = clonePlain(candidate);
      displayCommit = candidate;
      this.animationWaiting = true;
      this.databus.animationWaiting = true;
    } else if (!this.applyPublicDelta(event, delta.delta || {})) {
      return this.resyncFromDelta('delta-rejected');
    }
    this.version = delta.version;
    this.lastServerEventSeq = Math.max(this.lastServerEventSeq, eventSeq);
    this.consumeAnimationState({
      waiting: true,
      selfAcked: false,
      currentEvent: delta.event,
      latestEventSeq: eventSeq,
    }, {
      displayCommit,
      source: 'delta',
    });
    if (!gateResultDisplay) this.authoritativeState = clonePlain(this.databus);
    return true;
  }

  resyncFromDelta(reason) {
    console.warn('[online] socket delta rejected, requesting snapshot', { reason, roomId: this.roomId });
    this.scheduleReconnect(0);
    return false;
  }

  applyPublicDelta(event, delta = {}, target = this.databus) {
    if (!target || !Array.isArray(target.seats)) return false;
    const appendDiscard = delta.appendDiscard || null;
    if (appendDiscard && appendDiscard.card) {
      const seatIndex = rotateSeat(appendDiscard.seat, this.mySeat);
      const seat = target.seats[seatIndex];
      if (!seat || !Array.isArray(seat.discards)) return false;
      const expectedIndex = typeof appendDiscard.index === 'number' ? appendDiscard.index : seat.discards.length;
      const alreadyAtIndex = seat.discards[expectedIndex] && seat.discards[expectedIndex].id === appendDiscard.card.id;
      if (!alreadyAtIndex) {
        if (expectedIndex !== seat.discards.length) return false;
        if (!seat.discards.some((card) => card.id === appendDiscard.card.id)) {
          seat.discards = seat.discards.concat([appendDiscard.card]);
        }
      }
    }

    const appendMeld = delta.appendMeld || delta.extendMeld || null;
    if (appendMeld && appendMeld.meld) {
      const seatIndex = rotateSeat(appendMeld.seat, this.mySeat);
      const seat = target.seats[seatIndex];
      if (!seat || !Array.isArray(seat.melds)) return false;
      const expectedIndex = typeof appendMeld.index === 'number' ? appendMeld.index : seat.melds.length;
      const existingIndex = seat.melds.findIndex((meld) => meld.id && meld.id === appendMeld.meld.id);
      if (existingIndex >= 0) {
        seat.melds[existingIndex] = appendMeld.meld;
      } else {
        if (expectedIndex !== seat.melds.length) return false;
        seat.melds = seat.melds.concat([appendMeld.meld]);
      }
    }

    if (delta.publicPatch) {
      const publicPatch = rotatePublicPatch(delta.publicPatch, this.mySeat);
      ['phase', 'currentSeat', 'dealerSeat', 'nextDealerSeat', 'feedback', 'responseSummary', 'round', 'result', 'roundDetail', 'tableRecord'].forEach((key) => {
        if (publicPatch[key] !== undefined) target[key] = publicPatch[key];
      });
      if (Array.isArray(publicPatch.pendingActions)) target.pendingActions = publicPatch.pendingActions;
      if (Array.isArray(publicPatch.playerActions)) target.playerActions = publicPatch.playerActions;
    }
    if (delta.privatePatch && Array.isArray(delta.privatePatch.playerActions)) {
      target.playerActions = delta.privatePatch.playerActions
        .map((action, index) => rotateAction(action, this.mySeat, index));
      target.responseWindowId = delta.privatePatch.responseWindowId || null;
      target.actionState = delta.privatePatch.actionState || 'closed';
      if (
        target === this.databus
        && (!target.responseWindowId || target.actionState !== 'available')
      ) {
        this.clearPendingResponseIntent(target.responseWindowId);
      }
    }
    if (delta.privatePatch && Array.isArray(delta.privatePatch.legalDiscardIds)) {
      target.legalDiscardIds = delta.privatePatch.legalDiscardIds;
    }
    if (target === this.databus) this.syncZhaoPicker();
    return true;
  }

  shouldGateDisplayState(local = {}, event = {}, animation = {}) {
    if (!local || local.phase !== 'result') return false;
    if (!isResultEvent(event)) return false;
    return !animation.selfAcked;
  }

  buildDeferredDisplayState(local = {}) {
    const display = clonePlain(local);
    const current = this.databus || {};
    if (current && Array.isArray(current.seats)) {
      if (current.phase && current.phase !== 'result') display.phase = current.phase;
      else display.phase = 'ai-thinking';
      display.result = current.phase === 'result' ? (current.result || null) : null;
      display.tableFinished = false;
      display.tableStatus = current.tableStatus || '';
    }
    display.playerActions = local.playerActions || [];
    display.pendingActions = local.pendingActions || [];
    display.responseSummary = local.responseSummary || null;
    display.responseWindowId = local.responseWindowId || null;
    display.actionState = local.actionState || 'closed';
    display.feedback = local.feedback || '';
    display.animationWaiting = local.animationWaiting;
    return display;
  }

  commitTimelineDisplayState(displayState, reason = 'timeline-display-commit', event = null) {
    if (!displayState || !this.databus || !this.databus.setRoundState) return false;
    this.databus.setRoundState(clonePlain(displayState));
    this.syncZhaoPicker();
    this.reportOnlineDiagnostic('online-timeline-display-commit', {
      reason,
      event: diagnosticEvent(event),
      committedPhase: displayState.phase || '',
      committedResultType: displayState.result ? (displayState.result.type || '') : '',
    });
    return true;
  }

  enqueueTimelineEvent(event, animation = {}, options = {}) {
    if (!event || typeof event.eventSeq !== 'number') return false;
    if (this.timelineCurrent && !this.isAnimating) {
      this.reportOnlineDiagnostic('online-timeline-release-stale-current', {
        event: diagnosticEvent(this.timelineCurrent.event),
        nextEvent: diagnosticEvent(event),
      });
      this.timelineCurrent = null;
    }
    const eventSeq = event.eventSeq;
    const existingCurrent = this.timelineCurrent
      && this.timelineCurrent.event
      && this.timelineCurrent.event.eventSeq === eventSeq;
    if (existingCurrent) {
      if (options.displayCommit) this.timelineCurrent.displayCommit = options.displayCommit;
      this.reportOnlineDiagnostic('online-timeline-dedupe', {
        event: diagnosticEvent(event),
        location: 'current',
      });
      return true;
    }
    const existingQueued = this.timelineQueue.find((entry) => entry.event && entry.event.eventSeq === eventSeq);
    if (existingQueued) {
      if (options.displayCommit) existingQueued.displayCommit = options.displayCommit;
      this.reportOnlineDiagnostic('online-timeline-dedupe', {
        event: diagnosticEvent(event),
        location: 'queue',
      });
      return true;
    }
    if (eventSeq <= this.lastAckedEventSeq) {
      this.reportOnlineDiagnostic('online-timeline-dedupe', {
        event: diagnosticEvent(event),
        location: 'consumed',
      });
      if (this.animator.settleHeldAppearanceForEvent) this.animator.settleHeldAppearanceForEvent(event);
      if (options.displayCommit) this.commitTimelineDisplayState(options.displayCommit, 'consumed-event-commit', event);
      return true;
    }
    const mode = timelinePlaybackMode(event, this.timelineQueue.length + (this.timelineCurrent ? 1 : 0), this.socketReconnecting);
    const entry = {
      event,
      animation,
      displayCommit: options.displayCommit || null,
      mode,
      category: timelineEventCategory(event),
      source: options.source || 'animation-state',
      enqueuedAt: Date.now(),
    };
    this.timelineQueue.push(entry);
    this.timelineQueue.sort((left, right) => left.event.eventSeq - right.event.eventSeq);
    this.reportOnlineDiagnostic('online-timeline-enqueue', {
      event: diagnosticEvent(event),
      mode,
      category: entry.category,
      source: entry.source,
      queueLength: this.timelineQueue.length,
    });
    this.pumpAnimationTimeline();
    return true;
  }

  pumpAnimationTimeline() {
    if (this.timelineCurrent || this.isAnimating || !this.timelineQueue.length) return false;
    const entry = this.timelineQueue.shift();
    if (!entry || !entry.event) return false;
    this.timelineCurrent = entry;
    this.playTimelineEntry(entry);
    return true;
  }

  playTimelineEntry(entry) {
    const event = entry.event;
    if (!event || typeof event.eventSeq !== 'number') {
      this.timelineCurrent = null;
      this.pumpAnimationTimeline();
      return;
    }
    if (event.eventSeq <= this.lastPlayedEventSeq && !this.isAnimating) {
      this.reportOnlineDiagnostic('online-timeline-skip', {
        event: diagnosticEvent(event),
        reason: 'already-played',
      });
      if (this.animator.settleHeldAppearanceForEvent) this.animator.settleHeldAppearanceForEvent(event);
      this.completeTimelineEvent(event.eventSeq, 'already-played');
      this.lastAckedEventSeq = Math.min(this.lastAckedEventSeq, event.eventSeq - 1);
      this.sendAnimationAck(event.eventSeq);
      return;
    }
    if (this.lastPlayedEventSeq && event.eventSeq > this.lastPlayedEventSeq + 1) {
      console.warn('[online] animation event gap, aligning to current authoritative event', {
        previous: this.lastPlayedEventSeq,
        current: event.eventSeq,
      });
      this.cancelLocalActionPreview();
      if (this.animator.releaseOnlineEvent) this.animator.releaseOnlineEvent();
      this.isAnimating = false;
    }
    this.currentEvent = event;
    this.lastPlayedEventSeq = Math.max(this.lastPlayedEventSeq, event.eventSeq);
    if (entry.mode === 'skip') {
      this.reportOnlineDiagnostic('online-timeline-skip', {
        event: diagnosticEvent(event),
        reason: 'playback-mode-skip',
        category: entry.category,
      });
      if (this.animator.settleHeldAppearanceForEvent) this.animator.settleHeldAppearanceForEvent(event);
      this.isAnimating = false;
      this.animationWaiting = false;
      if (this.databus) this.databus.animationWaiting = false;
      this.lastLocallyCompletedEventSeq = Math.max(this.lastLocallyCompletedEventSeq || 0, event.eventSeq);
      this.completeTimelineEvent(event.eventSeq, 'skipped');
      this.sendAnimationAck(event.eventSeq);
      return;
    }
    this.applyAuthoritativeDiscardEventToLocalHand(event);
    this.applyAuthoritativeMeldEventToLocalHand(event);
    this.isAnimating = true;
    this.reportOnlineDiagnostic('online-animation-start', {
      event: diagnosticEvent(event),
      animationWaitingFromServer: Boolean(entry.animation && entry.animation.waiting),
      animationSelfAcked: Boolean(entry.animation && entry.animation.selfAcked),
      playbackMode: entry.mode,
      category: entry.category,
    });
    const hasLocalPreview = Boolean(this.pendingLocalAction && this.pendingLocalAction.localPreviewStarted);
    const usesLocalPreview = hasLocalPreview
      && localActionMatchesEvent(this.pendingLocalAction, event)
      && this.animator.confirmLocalActionPreview
      && this.animator.confirmLocalActionPreview(event, () => this.markLocalAnimationComplete());
    if (usesLocalPreview) {
      this.pendingLocalAction.authoritativeEventConfirmed = true;
      this.pendingLocalAction.eventSeq = event.eventSeq;
      this.pendingLocalAction.event = event;
      this.tryFinishLocalAction();
    }
    if (!usesLocalPreview) {
      this.cancelLocalActionPreview();
      this.playEventSound(event);
    }
    const started = usesLocalPreview || (this.animator.playOnlineEvent
      ? this.animator.playOnlineEvent(event, () => this.finishAnimation(event.eventSeq), { mode: entry.mode })
      : false);
    if (!started) {
      this.reportOnlineDiagnostic('online-animation-not-started', {
        event: diagnosticEvent(event),
      });
      this.finishAnimation(event.eventSeq);
    }
  }

  completeTimelineEvent(eventSeq, reason = 'completed') {
    const entry = this.timelineCurrent
      && this.timelineCurrent.event
      && this.timelineCurrent.event.eventSeq === eventSeq
      ? this.timelineCurrent
      : null;
    if (entry && entry.displayCommit) {
      this.commitTimelineDisplayState(entry.displayCommit, reason, entry.event);
    }
    this.timelineConsumedEventSeqs.add(eventSeq);
    this.timelineCurrent = null;
    this.pumpAnimationTimeline();
  }

  /** 立即应用一次服务端裁决附带的完整快照，避免再次 pull 时错过短暂动作事件。 */
  applyServerSnapshot(res) {
    if (res && res.ok && (res.left || res.closed || res.declined || res.status === 'closed')) {
      return this.returnToLobby();
    }
    if (!res || !res.ok || !res.public) return false;
    if (typeof res.version === 'number' && this.version >= 0 && res.version < this.version) {
      return true;
    }
    const incomingSeat = typeof res.yourSeat === 'number' && res.yourSeat >= 0 ? res.yourSeat : this.mySeat;
    if (incomingSeat < 0) return false;
    const privateSeat = res.private && typeof res.private.seat === 'number' ? res.private.seat : incomingSeat;
    if (privateSeat !== incomingSeat) {
      console.warn('[online] ignored snapshot with mismatched private seat', {
        roomId: this.roomId,
        incomingSeat,
        privateSeat,
        version: res.version,
      });
      return false;
    }
    if (this.mySeat >= 0 && this.version >= 0 && incomingSeat !== this.mySeat) {
      console.warn('[online] ignored snapshot that would switch local seat', {
        roomId: this.roomId,
        currentSeat: this.mySeat,
        incomingSeat,
        version: res.version,
      });
      return false;
    }
    this.mySeat = incomingSeat;
    saveRoomSession(this.roomId, this.mySeat);
    this.version = res.version;
    const local = buildLocalState(res.public, res.private || { hand: [] }, this.mySeat, this.databus.selectedCardId);
    local.tableStatus = res.status || '';
    local.tableRoomId = this.roomId || res.roomId || '';
    local.tableSettings = res.settings || {};
    local.tableFinished = res.status === 'tableResult';
    local.tableRematch = res.rematch || null;
    local.tableRecordOpen = Boolean(this.databus.tableRecordOpen && local.tableRecord && local.tableFinished);
    this.authoritativeState = clonePlain(local);
    this.scheduleRematchDecisionTimer(local.tableRematch);
    const animation = res.animation || {
      currentEvent: res.public.publicEvent || null,
      selfAcked: false,
      waiting: Boolean(res.public.publicEvent),
    };
    this.lastServerEventSeq = Math.max(
      this.lastServerEventSeq,
      typeof animation.latestEventSeq === 'number' ? animation.latestEventSeq : 0,
      animation.currentEvent && typeof animation.currentEvent.eventSeq === 'number' ? animation.currentEvent.eventSeq : 0
    );
    const currentEventSeq = animation.currentEvent && typeof animation.currentEvent.eventSeq === 'number'
      ? animation.currentEvent.eventSeq
      : 0;
    const locallyCompletedEventSeq = Math.max(this.lastAckedEventSeq, this.lastLocallyCompletedEventSeq || 0);
    const locallyAcked = currentEventSeq > 0 && currentEventSeq <= locallyCompletedEventSeq;
    const selfAcked = Boolean(animation.selfAcked || locallyAcked);
    this.animationWaiting = Boolean((animation.waiting || animation.currentEvent) && !selfAcked);
    local.animationWaiting = this.animationWaiting;
    const hasLocalResponseActions = local.phase === 'human-response'
      && local.responseSummary
      && local.responseSummary.active
      && local.actionState === 'available'
      && Array.isArray(local.playerActions)
      && local.playerActions.length > 0;
    if (this.animationWaiting && !hasLocalResponseActions) {
      local.pendingActions = [];
      local.playerActions = [];
    }
    const serverEvent = animation.currentEvent || res.public.publicEvent || null;
    const gateDisplay = this.shouldGateDisplayState(local, serverEvent, { ...animation, selfAcked });
    const displayLocal = gateDisplay ? this.buildDeferredDisplayState(local) : local;
    this.databus.setRoundState(displayLocal);
    this.syncZhaoPicker();
    if (
      hasLocalResponseActions
      || (local.responseSummary && local.responseSummary.active)
      || (serverEvent && serverEvent.appearanceResolution === 'await-response')
      || gateDisplay
    ) {
      this.reportOnlineDiagnostic('online-response-snapshot', {
        incomingVersion: res.version,
        animationWaitingFromServer: Boolean(animation.waiting),
        animationSelfAcked: Boolean(animation.selfAcked),
        hasLocalResponseActions,
        serverEvent: diagnosticEvent(serverEvent),
        serverRequiredSeats: Array.isArray(animation.requiredSeats) ? animation.requiredSeats.slice() : [],
        serverAckedSeats: Array.isArray(animation.ackedSeats) ? animation.ackedSeats.slice() : [],
        serverDeadlineAt: animation.deadlineAt || null,
        displayGated: gateDisplay,
      });
    }
    if (!local.responseWindowId || local.actionState !== 'available') {
      this.clearPendingResponseIntent(local.responseWindowId);
    }
    const displayCommit = gateDisplay ? clonePlain(local) : null;
    if (displayCommit) displayCommit.animationWaiting = false;
    this.consumeAnimationState({ ...animation, selfAcked }, {
      displayCommit,
      source: 'snapshot',
    });
    this.setStatus('');
    return true;
  }

  consumeAnimationState(animation = {}, options = {}) {
    const event = rotatePublicEvent(animation.currentEvent, this.mySeat);
    if (!event) {
      if (this.isAnimating && this.currentEvent) {
        this.reportOnlineDiagnostic('online-animation-release-forced', {
          reason: 'server-event-cleared',
          event: diagnosticEvent(this.currentEvent),
          animationWaitingFromServer: Boolean(animation.waiting),
          animationSelfAcked: Boolean(animation.selfAcked),
        });
        if (typeof this.currentEvent.eventSeq === 'number') {
          this.lastLocallyCompletedEventSeq = Math.max(this.lastLocallyCompletedEventSeq || 0, this.currentEvent.eventSeq);
        }
      }
      if (this.animator.reconcileHeldAppearance) {
        this.animator.reconcileHeldAppearance(this.authoritativeState || this.databus || {});
      }
      if (this.animator.releaseOnlineEvent) this.animator.releaseOnlineEvent();
      this.timelineCurrent = null;
      this.timelineQueue = [];
      this.currentEvent = null;
      this.isAnimating = false;
      this.animationWaiting = false;
      if (this.databus) this.databus.animationWaiting = false;
      this.cancelLocalActionPreview();
      return;
    }
    if (animation.selfAcked) {
      this.currentEvent = event;
      this.reportOnlineDiagnostic('online-animation-self-acked', {
        event: diagnosticEvent(event),
        clearingLocalPreview: Boolean(this.localActionPreviewType || this.pendingLocalAction),
      });
      this.lastAckedEventSeq = Math.max(this.lastAckedEventSeq, event.eventSeq);
      this.lastPlayedEventSeq = Math.max(this.lastPlayedEventSeq, event.eventSeq);
      this.isAnimating = false;
      if (this.animator.settleHeldAppearanceForEvent) this.animator.settleHeldAppearanceForEvent(event);
      if (this.animator.restoreHeldAppearance) this.animator.restoreHeldAppearance(event);
      this.cancelLocalActionPreview();
      if (options.displayCommit) this.commitTimelineDisplayState(options.displayCommit, 'self-acked', event);
      this.timelineConsumedEventSeqs.add(event.eventSeq);
      this.pumpAnimationTimeline();
      return;
    }
    if (event.eventSeq <= this.lastPlayedEventSeq && !this.isAnimating) {
      this.reportOnlineDiagnostic('online-animation-consume-skipped', {
        event: diagnosticEvent(event),
        reason: 'already-played',
      });
      if (this.animator.settleHeldAppearanceForEvent) this.animator.settleHeldAppearanceForEvent(event);
      if (options.displayCommit) this.commitTimelineDisplayState(options.displayCommit, 'already-played', event);
      // 多客户端并发全量写可能覆盖单个回执；权威状态仍未记录本人时主动幂等补发。
      this.lastAckedEventSeq = Math.min(this.lastAckedEventSeq, event.eventSeq - 1);
      this.sendAnimationAck(event.eventSeq);
      return;
    }
    this.enqueueTimelineEvent(event, animation, options);
  }

  applyAuthoritativeDiscardEventToLocalHand(event = {}) {
    if (!event || event.type !== 'discard' || event.seat !== 0 || !event.card || !event.card.id) return false;
    const seat = this.databus && this.databus.seats && this.databus.seats[0];
    if (!seat || !Array.isArray(seat.hand) || !seat.hand.length) return false;
    const nextHand = seat.hand.filter((card) => card.id !== event.card.id);
    if (nextHand.length === seat.hand.length) return false;
    seat.hand = nextHand;
    if (this.databus.selectedCardId === event.card.id) this.databus.selectedCardId = null;
    return true;
  }

  applyAuthoritativeMeldEventToLocalHand(event = {}) {
    if (!event || event.seat !== 0 || MELD_ACTION_TYPES.indexOf(event.type) < 0) return false;
    const seat = this.databus && this.databus.seats && this.databus.seats[0];
    if (!seat || !Array.isArray(seat.hand) || !seat.hand.length) return false;

    const meldCards = event.meld && Array.isArray(event.meld.cards) ? event.meld.cards : [];
    if (meldCards.length) {
      const meldCardIds = new Set(meldCards.map((card) => card.id).filter(Boolean));
      const nextHand = seat.hand.filter((card) => !meldCardIds.has(card.id));
      if (nextHand.length !== seat.hand.length) {
        seat.hand = nextHand;
        if (this.databus.selectedCardId && !nextHand.some((card) => card.id === this.databus.selectedCardId)) {
          this.databus.selectedCardId = null;
        }
        return true;
      }
      return false;
    }

    let keysToRemove = [];
    if (event.type === 'peng') {
      const key = symbolKeyFromEvent(event);
      keysToRemove = key ? [key, key] : [];
    } else if (event.type === 'zhao') {
      const key = symbolKeyFromEvent(event);
      const count = [4, 5, 6].indexOf(event.count) >= 0 ? event.count : 0;
      keysToRemove = key && count ? new Array(Math.max(0, count - 1)).fill(key) : [];
    } else if (event.type === 'chi') {
      const incomingKey = incomingKeyFromEvent(event);
      keysToRemove = phraseKeysFromEvent(event).filter((key) => key !== incomingKey);
    }
    if (!keysToRemove.length) return false;
    const result = removeCardsByKeys(seat.hand, keysToRemove);
    if (!result.removed.length) return false;
    seat.hand = result.hand;
    if (this.databus.selectedCardId && !seat.hand.some((card) => card.id === this.databus.selectedCardId)) {
      this.databus.selectedCardId = null;
    }
    return true;
  }

  /** 在线动作只在首次播放对应事件时发声，重复快照与回执重试不会重复播放。 */
  playEventSound(event) {
    if (!this.music || !event) return;
    if ((event.type === 'draw' || event.type === 'discard') && event.card && this.music.playCardVoice) {
      this.music.playCardVoice(event.card);
      return;
    }
    if (['chi', 'peng', 'zhao', 'ta', 'hu'].indexOf(event.type) >= 0 && this.music.playActionVoice) {
      this.music.playActionVoice(event.type);
    }
  }

  finishAnimation(eventSeq) {
    if (!this.currentEvent || this.currentEvent.eventSeq !== eventSeq) return;
    this.reportOnlineDiagnostic('online-animation-finish', {
      eventSeq,
      event: diagnosticEvent(this.currentEvent),
    });
    this.isAnimating = false;
    this.animationWaiting = false;
    this.lastLocallyCompletedEventSeq = Math.max(this.lastLocallyCompletedEventSeq || 0, eventSeq);
    this.databus.animationWaiting = false;
    this.cancelLocalActionPreview();
    this.completeTimelineEvent(eventSeq, 'animation-finished');
    this.sendAnimationAck(eventSeq);
  }

  startLocalActionPreview(action) {
    if (!action || !action.type) return;
    const identity = localActionIdentity(action);
    if (
      this.pendingLocalAction
      && this.pendingLocalAction.identity.type === identity.type
      && this.pendingLocalAction.identity.cardId === identity.cardId
      && this.pendingLocalAction.identity.zhaoSize === identity.zhaoSize
    ) return;
    const shouldAnimate = shouldPlayOptimisticLocalPreview(action);
    this.localActionPreviewType = animationActionType(action.type);
    this.pendingLocalAction = {
      identity,
      responseWindowId: RESPONSE_ACTION_TYPES.indexOf(animationActionType(action.type)) >= 0
        ? (this.databus.responseWindowId || null)
        : null,
      localAnimationCompleted: false,
      authoritativeEventConfirmed: false,
      eventSeq: null,
      event: null,
      finishing: false,
      localPreviewStarted: false,
    };
    if (!shouldAnimate) {
      this.markLocalAnimationComplete();
      return;
    }
    if (this.music && action.type === 'discard' && action.card) {
      this.music.playCardVoice(action.card);
    } else if (this.music && ['chi', 'peng', 'zhao', 'ta', 'hu'].indexOf(action.type) >= 0) {
      this.music.playActionVoice(action.type);
    }
    const started = this.animator.playLocalActionPreview
      ? this.animator.playLocalActionPreview(action, () => this.markLocalAnimationComplete())
      : false;
    if (started && this.pendingLocalAction) this.pendingLocalAction.localPreviewStarted = true;
    if (!started) this.markLocalAnimationComplete();
  }

  markLocalAnimationComplete() {
    if (!this.pendingLocalAction) return;
    this.pendingLocalAction.localAnimationCompleted = true;
    this.tryFinishLocalAction();
  }

  tryFinishLocalAction() {
    const pending = this.pendingLocalAction;
    if (
      !pending
      || pending.finishing
      || !pending.localAnimationCompleted
      || !pending.authoritativeEventConfirmed
      || typeof pending.eventSeq !== 'number'
    ) return false;
    pending.finishing = true;
    this.finishAnimation(pending.eventSeq);
    return true;
  }

  clearPendingResponseIntent(responseWindowId = null) {
    const pending = this.pendingLocalAction;
    if (!pending || !pending.responseWindowId) return;
    if (responseWindowId && pending.responseWindowId === responseWindowId && this.databus.actionState === 'available') return;
    this.cancelLocalActionPreview();
  }

  cancelLocalActionPreview() {
    if (!this.localActionPreviewType && !this.pendingLocalAction) return;
    const shouldCancelAnimatorPreview = Boolean(this.pendingLocalAction && this.pendingLocalAction.localPreviewStarted);
    this.localActionPreviewType = null;
    this.pendingLocalAction = null;
    if (shouldCancelAnimatorPreview && this.animator.cancelLocalActionPreview) this.animator.cancelLocalActionPreview();
  }

  async sendAnimationAck(eventSeq) {
    if (!this.roomId || eventSeq <= this.lastAckedEventSeq) return;
    if (this.ackingEventSeq === eventSeq) return;
    this.ackingEventSeq = eventSeq;
    this.reportOnlineDiagnostic('online-animation-ack-send', { eventSeq });
    try {
      const res = this.socket.isReady()
        ? await this.socket.request('ackAnimation', { roomId: this.roomId, eventSeq, version: this.version })
        : null;
      if (!res) throw new Error('SOCKET_NOT_CONNECTED');
      if (!res || !res.ok) throw new Error((res && res.error) || 'ACK_FAILED');
      this.reportOnlineDiagnostic('online-animation-ack-success', {
        eventSeq,
        serverVersion: res.version,
      });
      this.lastAckedEventSeq = Math.max(this.lastAckedEventSeq, eventSeq);
      this.ackingEventSeq = 0;
      if (this.ackRetryTimer) clearTimeout(this.ackRetryTimer);
      this.ackRetryTimer = null;
      if (!this.applyServerSnapshot(res)) await this.refresh();
    } catch (err) {
      this.reportOnlineDiagnostic('online-animation-ack-failed', {
        eventSeq,
        error: err && (err.code || err.message) ? (err.code || err.message) : String(err || ''),
      });
      this.ackingEventSeq = 0;
      if (!this.socket.isReady()) {
        this.socketReconnecting = true;
        this.scheduleReconnect(0);
      }
      if (this.ackRetryTimer) return;
      this.ackRetryTimer = setTimeout(() => {
        this.ackRetryTimer = null;
        this.sendAnimationAck(eventSeq);
      }, RECONNECT_DELAY_MS);
    }
  }

  bindNetworkEvents() {
    if (wx.onNetworkStatusChange) wx.onNetworkStatusChange(this.boundNetworkChange);
    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        if (!this.active || !this.roomId) return;
        if (!this.socket.isReady()) {
          this.handleSocketDisconnect();
          return;
        }
        this.socket.heartbeat(this.roomId)
          .then((res) => {
            if (res && res.advanced) this.reconnectSocketNow();
          })
          .catch(() => { this.scheduleReconnect(); });
      }, HEARTBEAT_INTERVAL_MS);
    }
  }

  handleNetworkChange(result = {}) {
    if (result.isConnected) this.scheduleReconnect(0);
    else this.setStatus('网络已断开，等待重连…');
  }

  scheduleReconnect(delay = RECONNECT_DELAY_MS) {
    if (!this.active || this.reconnectTimer) return;
    this.setStatus('正在恢复牌桌…');
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (await this.reconnectSocketNow()) return;
      this.scheduleReconnect();
    }, delay);
  }

  closeWatcher() {
    if (this.watcher && this.watcher.close) {
      try { this.watcher.close(); } catch (err) { /* ignore */ }
    }
    this.watcher = null;
  }

  async callGame(action, payload = {}) {
    if (this.active && this.socket.isReady() && this.roomId) {
      try {
        return await this.socket.request(action, {
          roomId: this.roomId,
          version: this.version,
          payload,
        });
      } catch (err) {
        this.scheduleReconnect(0);
        throw err;
      }
    }
    if (this.active && this.roomId) {
      if (!this.socket.isReady()) {
        this.scheduleReconnect(0);
      }
      const error = new Error('SOCKET_NOT_CONNECTED');
      error.code = 'SOCKET_NOT_CONNECTED';
      throw error;
    }
    return callFunction('game', Object.assign({ action, roomId: this.roomId }, payload));
  }

  canRetryOp(op) {
    if (!op || op.kind !== 'discard') return false;
    const state = this.databus;
    const hand = state.seats && state.seats[0] ? state.seats[0].hand : [];
    return state.phase === 'human-discard'
      && state.currentSeat === 0
      && hand.some((card) => card.id === op.cardId);
  }

  canSubmitResponseWhileAnimating(action = {}) {
    const state = this.databus || {};
    if (!isResponseAction(action)) return false;
    if (!state.responseWindowId || state.actionState !== 'available') return false;
    if (!Array.isArray(state.playerActions) || !state.playerActions.length) return false;
    return state.playerActions.some((candidate) => responseActionMatches(candidate, action));
  }

  canSubmitResponseOpWhileAnimating(op = {}) {
    if (!op || op.kind !== 'response' || !op.ref) return false;
    const state = this.databus || {};
    if (!state.responseWindowId || state.actionState !== 'available') return false;
    if (op.ref.responseWindowId && op.ref.responseWindowId !== state.responseWindowId) return false;
    return this.canSubmitResponseWhileAnimating(op.ref);
  }

  async sendOp(op, allowRetry = true) {
    const allowResponseDuringAnimation = this.canSubmitResponseOpWhileAnimating(op);
    if ((this.animationWaiting || this.isAnimating) && !allowResponseDuringAnimation) {
      this.reportOnlineDiagnostic('online-op-blocked-by-animation', {
        op: diagnosticOp(op),
        allowResponseDuringAnimation,
      });
      this.databus.feedback = '请等待当前动作完成';
      return;
    }
    try {
      if (!this.socket.isReady()) {
        this.reportOnlineDiagnostic('online-op-blocked-by-socket', {
          op: diagnosticOp(op),
        });
        this.socketReconnecting = true;
        this.scheduleReconnect(0);
        this.databus.feedback = '连接已断开，等待重连';
        this.cancelLocalActionPreview();
        return;
      }
      if (op && op.kind === 'response') {
        this.reportOnlineDiagnostic('online-response-op-submit', {
          op: diagnosticOp(op),
          allowResponseDuringAnimation,
        });
      }
      const res = await this.socket.request('op', { roomId: this.roomId, version: this.version, payload: op });
      if (!res || !res.ok) {
        if (op && op.kind === 'response') {
          this.reportOnlineDiagnostic('online-response-op-rejected', {
            op: diagnosticOp(op),
            error: res && res.error ? res.error : 'NO_RESPONSE',
            reason: res && res.reason ? res.reason : '',
            serverVersion: res && typeof res.version === 'number' ? res.version : null,
            eventSeq: res && typeof res.eventSeq === 'number' ? res.eventSeq : null,
          });
        }
        if (res && res.error === 'VERSION_STALE') {
          const refreshed = await this.refresh();
          if (allowRetry && refreshed && this.canRetryOp(op)) {
            return this.sendOp(op, false);
          }
        }
        this.databus.feedback = opErrorMessage(res);
        this.cancelLocalActionPreview();
        console.warn('[online] operation rejected', {
          op,
          response: res,
          localVersion: this.version,
          phase: this.databus.phase,
          currentSeat: this.databus.currentSeat,
        });
        return;
      }
      if (op && op.kind === 'response') {
        this.reportOnlineDiagnostic('online-response-op-accepted', {
          op: diagnosticOp(op),
          serverVersion: res.version,
        });
      }
      if (!this.applyServerSnapshot(res)) await this.refresh();
    } catch (err) {
      if (op && op.kind === 'response') {
        this.reportOnlineDiagnostic('online-response-op-failed', {
          op: diagnosticOp(op),
          error: err && (err.code || err.message) ? (err.code || err.message) : String(err || ''),
        });
      }
      this.scheduleReconnect(0);
      this.cancelLocalActionPreview();
      this.databus.feedback = '网络异常，请重试';
    }
  }

  handleTouch(event) {
    if (!this.active) return;
    if (this.socketReconnecting || !this.socket.isReady()) {
      this.databus.feedback = '连接已断开，等待重连';
      this.scheduleReconnect(0);
      return;
    }
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    const region = typeof this.tableView.hitRegionAt === 'function'
      ? this.tableView.hitRegionAt(touch.clientX, touch.clientY)
      : null;
    if (!region) return;
    if (region.type === 'round-result-scroll' || region.type === 'table-record-scroll') {
      this.roundResultScrollTouch = { lastY: touch.clientY, type: region.type };
      return;
    }
    const responseActionTap = region.type === 'action' && this.canSubmitResponseWhileAnimating(region.action);
    if (region.type === 'action' && isResponseAction(region.action)) {
      this.reportOnlineDiagnostic('online-response-touch', {
        action: diagnosticAction(region.action),
        responseActionTap,
      });
    }
    if (this.localActionPreviewType || ((this.animationWaiting || this.isAnimating) && !responseActionTap)) {
      this.reportOnlineDiagnostic('online-touch-blocked', {
        regionType: region.type,
        action: region.type === 'action' ? diagnosticAction(region.action) : null,
        responseActionTap,
        blockedByLocalPreview: Boolean(this.localActionPreviewType),
        localActionPreviewType: this.localActionPreviewType || '',
        blockedByAnimationWaiting: Boolean(this.animationWaiting),
        blockedByIsAnimating: Boolean(this.isAnimating),
      });
      if (region.type === 'action' && isResponseAction(region.action)) {
        this.reportOnlineDiagnostic('online-response-touch-blocked', {
          action: diagnosticAction(region.action),
          responseActionTap,
          blockedByLocalPreview: Boolean(this.localActionPreviewType),
          blockedByAnimationWaiting: Boolean(this.animationWaiting),
          blockedByIsAnimating: Boolean(this.isAnimating),
        });
      }
      this.databus.feedback = '请等待当前动作完成';
      return;
    }
    if (region.type === 'action' && responseActionTap && (this.animationWaiting || this.isAnimating)) {
      this.reportOnlineDiagnostic('online-response-touch-allowed-during-animation', {
        action: diagnosticAction(region.action),
      });
    }
    if (this.music && this.music.playCue) this.music.playCue('tap');

    if (region.type === 'hand-card') {
      if (region.legal === false) return;
      this.handleCardTap(region.card.id);
      return;
    }
    if (region.type === 'action') {
      if (typeof this.tableView.markButtonPressed === 'function') this.tableView.markButtonPressed(region);
      this.handleActionTap(region.action);
      return;
    }
    if (region.type === 'restart') {
      this.nextRound();
    }
  }

  handleTouchMove(event) {
    if (!this.active || !this.roundResultScrollTouch) return;
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    const deltaY = touch.clientY - this.roundResultScrollTouch.lastY;
    this.roundResultScrollTouch.lastY = touch.clientY;
    if (this.roundResultScrollTouch.type === 'table-record-scroll') {
      if (typeof this.tableView.scrollTableRecordBy === 'function') this.tableView.scrollTableRecordBy(deltaY);
    } else if (typeof this.tableView.scrollRoundResultBy === 'function') {
      this.tableView.scrollRoundResultBy(deltaY);
    }
  }

  handleTouchEnd() {
    this.roundResultScrollTouch = null;
  }

  handleCardTap(cardId) {
    const state = this.databus;
    // 滑庄选牌阶段：本机座位旋转后恒为 0，原庄家是当前行动方时可选牌交给接庄者。
    if (state.phase === 'dealer-gift' && state.currentSeat === 0) {
      if (state.selectedCardId === cardId) {
        this.sendOp({ kind: 'dealerGift', cardId });
        state.selectedCardId = null;
        return;
      }
      state.selectedCardId = cardId;
      state.feedback = '再次点击此牌即可交给接庄者';
      return;
    }
    if (state.phase !== 'human-discard' || state.currentSeat !== 0) {
      state.feedback = '现在还不能出牌';
      return;
    }
    if (state.selectedCardId === cardId) {
      const card = state.seats[0].hand.find((item) => item.id === cardId);
      this.startLocalActionPreview({ type: 'discard', seat: 0, card });
      this.sendOp({ kind: 'discard', cardId });
      state.selectedCardId = null;
      return;
    }
    state.selectedCardId = cardId;
    state.feedback = '再次点击此牌即可打出';
  }

  openZhaoPicker(cardId) {
    this.zhaoSizePicker = { open: true, cardId };
    this.syncZhaoPicker();
  }

  closeZhaoPicker() {
    this.zhaoSizePicker = null;
    this.syncZhaoPicker();
  }

  /**
   * 校验招张数子面板是否仍有效：当前 playerActions 中针对该出现牌的招候选
   * 必须多于 1 个，否则关闭子面板。结果写入 databus.zhaoSizePicker 供布局读取。
   */
  syncZhaoPicker() {
    const db = this.databus;
    const picker = this.zhaoSizePicker;
    if (!picker || !db) {
      if (db) db.zhaoSizePicker = null;
      return;
    }
    const zhaoCount = (Array.isArray(db.playerActions) ? db.playerActions : [])
      .filter((a) => a.type === 'zhao' && a.card && a.card.id === picker.cardId).length;
    if (zhaoCount <= 1) {
      this.zhaoSizePicker = null;
      db.zhaoSizePicker = null;
      return;
    }
    db.zhaoSizePicker = { open: true, cardId: picker.cardId };
  }

  handleActionTap(action) {
    if (!action) return;
    if (action.type === 'zhaoBack') {
      this.closeZhaoPicker();
      return;
    }
    if (action.zhaoPicker) {
      const group = Array.isArray(action.zhaoGroup) ? action.zhaoGroup : [];
      if (group.length <= 1) {
        this.handleActionTap(group[0] || null);
        return;
      }
      const cardId = action.card && action.card.id;
      if (cardId) this.openZhaoPicker(cardId);
      return;
    }
    if (action.type === 'leaveTable') {
      this.leaveTable();
      return;
    }
    if (action.type === 'requestRematch') {
      if (!action.disabled) this.requestRematch();
      return;
    }
    if (action.type === 'declineRematch') {
      if (!action.disabled) this.requestRematch(false);
      return;
    }
    if (action.type === 'confirmNextRound') {
      if (!action.disabled) this.confirmNextRound();
      return;
    }
    if (action.type === 'viewRecord') {
      if (!this.databus.tableRecord) {
        this.databus.feedback = '战绩数据加载中';
        this.refresh();
        return;
      }
      this.databus.feedback = '';
      this.databus.tableRecordOpen = true;
      return;
    }
    if (
      RESPONSE_ACTION_TYPES.indexOf(animationActionType(action.type)) >= 0
      && this.databus.responseWindowId
      && this.databus.actionState
      && this.databus.actionState !== 'available'
    ) {
      this.databus.feedback = '动作已失效';
      return;
    }
    this.startLocalActionPreview(action);
    if (action.type === 'acceptTakeover') {
      this.sendOp({ kind: 'takeover', accept: true });
      return;
    }
    if (action.type === 'declineTakeover') {
      this.sendOp({ kind: 'takeover', accept: false });
      return;
    }
    this.sendOp({
      kind: 'response',
      ref: {
        index: action.index,
        type: action.type,
        zhaoSize: action.zhaoSize,
        handKeyCount: action.handKeyCount,
        responseWindowId: this.databus.responseWindowId || null,
      },
    });
  }

  async nextRound() {
    return this.confirmNextRound();
  }

  async confirmNextRound() {
    const detail = this.databus.roundDetail;
    if (!detail || !detail.hasNextRound) {
      this.databus.feedback = '战绩功能待开放';
      return false;
    }
    if (detail.continuation && detail.continuation.selfConfirmed) return true;
    this.setStatus('');
    try {
      const res = await this.callGame('confirmNextRound', { round: detail.round });
      if (!res || !res.ok) {
        this.databus.feedback = onlineErrorMessage({ code: res && res.error });
        if (res && res.error === 'ROUND_STALE') await this.refresh();
        return false;
      }
      if (!this.applyServerSnapshot(res)) {
        await this.refresh();
      }
      if (!res.nextRoundStarted) this.databus.feedback = '已继续，等待其他玩家';
      return true;
    } catch (err) {
      this.databus.feedback = onlineErrorMessage(err);
      return false;
    }
  }

  async leaveTable() {
    const roomId = this.roomId;
    if (!roomId) return false;
    try {
      const res = await callFunction('game', { action: 'leaveRoom', roomId });
      if (!res || !res.ok) {
        const code = (res && res.error) || 'LEAVE_ROOM_FAILED';
        roomLifecycleDiagnostic('leave-room-rejected', { roomId, code });
        this.databus.feedback = onlineErrorMessage({ code });
        return false;
      }
      if (res.left || res.closed || res.status === 'closed') {
        roomLifecycleDiagnostic('leave-room-confirmed', {
          roomId,
          status: res.status || 'left',
        });
        return this.returnToLobby();
      }
      roomLifecycleDiagnostic('leave-room-unconfirmed', {
        roomId,
        status: res.status || 'unknown',
      });
      this.databus.feedback = onlineErrorMessage({ code: 'LEAVE_ROOM_FAILED' });
      return false;
    } catch (err) {
      const code = err && (err.code || err.errMsg || err.message) || 'LEAVE_ROOM_FAILED';
      roomLifecycleDiagnostic('leave-room-request-failed', { roomId, code });
      this.databus.feedback = onlineErrorMessage(err);
      return false;
    }
  }

  async requestRematch(accept = true) {
    if (!this.roomId) return false;
    try {
      const res = await this.callGame('requestRematch', { accept });
      if (!res || !res.ok) {
        this.databus.feedback = onlineErrorMessage({ code: res && res.error });
        return false;
      }
      if (res.left || res.closed || res.declined || res.status === 'closed') {
        return this.returnToLobby();
      }
      if (!this.applyServerSnapshot(res)) {
        this.databus.tableRematch = res.rematch || this.databus.tableRematch;
        this.scheduleRematchDecisionTimer(this.databus.tableRematch);
        this.databus.feedback = accept === false ? '已退出牌桌' : (res.rematchStarted ? '新一局开始' : '已同意，等待其他玩家');
      }
      return true;
    } catch (err) {
      this.databus.feedback = onlineErrorMessage(err);
      return false;
    }
  }

  destroy() {
    this.active = false;
    this.stopWaitingRefresh();
    if (wx.offTouchStart) wx.offTouchStart(this.boundTouch);
    if (wx.offTouchMove) wx.offTouchMove(this.boundTouchMove);
    if (wx.offTouchEnd) wx.offTouchEnd(this.boundTouchEnd);
    this.roundResultScrollTouch = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopReconnectFallbackRefresh();
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    if (this.ackRetryTimer) clearTimeout(this.ackRetryTimer);
    this.ackRetryTimer = null;
    this.clearRematchDecisionTimer();
    this.ackingEventSeq = 0;
    this.cancelLocalActionPreview();
    if (wx.offNetworkStatusChange) wx.offNetworkStatusChange(this.boundNetworkChange);
    this.closeWatcher();
    if (this.socket) this.socket.close();
  }
}
