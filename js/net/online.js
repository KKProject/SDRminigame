import { DEFAULT_RULES } from '../game/rules';
import { ensureCloudInit, callFunction, cloudErrorCode, login } from './cloud';
import OnlineSocketTransport from './socket';

const SEAT_COUNT = DEFAULT_RULES.seatCount;
const ROOM_SESSION_KEY = 'huapai-online-room';
const RECONNECT_DELAY_MS = 1500;
const HEARTBEAT_INTERVAL_MS = 20000;
const WAITING_REFRESH_INTERVAL_MS = 2000;
const RESPONSE_ACTION_TYPES = ['chi', 'peng', 'zhao', 'ta', 'hu', 'pass'];
const SOCKET_AUTH_REFRESH_SKEW_MS = 60 * 1000;
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
export const LOBBY_STATES = {
  CHECKING_ROOM: 'checking-room',
  RECONNECTING: 'reconnecting',
  JOINING_INVITE: 'joining-invite',
  IDLE: 'idle',
  CREATING: 'creating',
  ERROR: 'error',
};

function lobbyProfile(loginRes = {}, fallback = {}) {
  const user = loginRes.user || {};
  return {
    nickName: user.nickName || fallback.nickName || '玩家',
    avatarUrl: user.avatarUrl || fallback.avatarUrl || '',
    openid: loginRes.openid || user.openid || '',
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
  return mapped;
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
    NOT_IN_ROOM: '当前微信账号不在这张牌桌中',
    WAITING_FOR_PLAYERS: '至少需要 2 名真人玩家才能开局',
    HOST_NOT_READY: '房主准备后才能开局',
    SET_READY_FAILED: '准备状态更新失败，请重试',
    LEAVE_ROOM_FAILED: '退出牌桌失败，请重试',
    REMATCH_FAILED: '发起重开失败，请重试',
    SOCKET_ENDPOINT_MISSING: 'WebSocket 入口未配置，请设置自有 WSS 域名',
    SOCKET_URL_MISSING: 'WebSocket 入口未配置，请设置自有 WSS 域名',
    SOCKET_SERVICE_MISSING: 'WebSocket 入口未配置，请设置自有 WSS 域名',
    SOCKET_ENV_MISSING: 'WebSocket 入口未配置，请设置自有 WSS 域名',
    SOCKET_TOKEN_MISSING: 'WebSocket 鉴权缺失，请检查自有服务 token 配置',
    SOCKET_UNSUPPORTED: '当前环境不支持 WebSocket，请使用微信开发者工具或真机',
    SOCKET_ABNORMAL_CLOSE: 'WebSocket 异常断开，请检查 socket 服务日志',
    SOCKET_CONNECT_FAILED: 'WebSocket 连接失败，请检查服务和域名配置',
  };
  return messages[code] || `进入在线对战失败：${code}`;
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

function rotateAction(action, mySeat, index = null) {
  const mapped = Object.assign({}, action, {
    seat: rotateSeat(action.seat, mySeat),
  });
  if (typeof action.sourceSeat === 'number') mapped.sourceSeat = rotateSeat(action.sourceSeat, mySeat);
  if (typeof action.ownerSeat === 'number') mapped.ownerSeat = rotateSeat(action.ownerSeat, mySeat);
  if (typeof index === 'number') mapped.index = index;
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

  const privateActions = Array.isArray(priv.playerActions) && priv.playerActions.length
    ? priv.playerActions
    : (pub.currentSeat === mySeat ? (pub.playerActions || []) : []);
  const myTurnActions = privateActions.map((action, index) => rotateAction(action, mySeat, index));

  const recentDiscard = pub.recentDiscard
    ? Object.assign({}, pub.recentDiscard, { seat: rotateSeat(pub.recentDiscard.seat, mySeat) })
    : null;

  const handIds = new Set((priv.hand || []).map((c) => c.id));
  const selectedCardId = prevSelectedId && handIds.has(prevSelectedId) ? prevSelectedId : null;

  const responseSummary = pub.responseSummary ? Object.assign({}, pub.responseSummary, {
    sourceSeat: rotateSeat(pub.responseSummary.sourceSeat, mySeat),
    waitingSeats: (pub.responseSummary.waitingSeats || []).map((seat) => rotateSeat(seat, mySeat)),
    decidedSeats: (pub.responseSummary.decidedSeats || []).map((seat) => rotateSeat(seat, mySeat)),
  }) : null;
  const pendingActions = (pub.pendingActions || []).map((action) => rotateAction(action, mySeat));
  if (responseSummary && responseSummary.active && pub.appearingCard && !pendingActions.length) {
    pendingActions.push({
      type: 'pass',
      seat: responseSummary.sourceSeat,
      card: pub.appearingCard.card,
    });
  }

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
    recentDiscard,
    pendingActions,
    playerActions: myTurnActions,
    responseSummary,
    feedback: pub.feedback || '',
    result: rotateResult(pub.result, mySeat),
    muted: false,
    round: pub.round || 0,
  };
}

export default class OnlineController {
  constructor(databus, renderer, music, animator = null) {
    this.databus = databus;
    this.renderer = renderer;
    this.music = music;
    this.animator = animator || renderer.animationController || renderer;
    this.roomId = null;
    this.mySeat = 0;
    this.version = -1;
    this.watcher = null;
    this.boundTouch = this.handleTouch.bind(this);
    this.active = false;
    this.onStatus = null;
    this.starting = false;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.boundNetworkChange = this.handleNetworkChange.bind(this);
    this.currentEvent = null;
    this.lastPlayedEventSeq = 0;
    this.lastAckedEventSeq = 0;
    this.isAnimating = false;
    this.animationWaiting = false;
    this.ackRetryTimer = null;
    this.ackingEventSeq = 0;
    this.localActionPreviewType = null;
    this.pendingLocalAction = null;
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
    this.socket.onDisconnect = (err) => this.handleSocketDisconnect(err);
    this.lastServerEventSeq = 0;
    this.socketReconnecting = false;
    this.lastSocketErrorCode = '';
    this.rematchDecisionTimer = null;
  }

  setStatus(text) {
    if (typeof this.onStatus === 'function') this.onStatus(text);
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
    this.isAnimating = false;
    this.animationWaiting = false;
    this.ackingEventSeq = 0;
    this.clearRematchDecisionTimer();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    if (this.ackRetryTimer) clearTimeout(this.ackRetryTimer);
    this.ackRetryTimer = null;
    this.cancelLocalActionPreview();
    this.closeWatcher();
    if (this.socket) this.socket.close();
    if (wx.offTouchStart) wx.offTouchStart(this.boundTouch);
    if (this.databus && typeof this.databus.reset === 'function') this.databus.reset();
    this.setStatus('');
    this.setLobbyState(LOBBY_STATES.IDLE, { profile: this.lobbyProfile });
    return true;
  }

  async loginForLobby(profile = {}) {
    if (!ensureCloudInit()) throw new Error('BACKEND_UNSUPPORTED');
    this.setStatus('登录中…');
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

  async startLobby(profile = {}, options = {}) {
    if (this.starting) throw new Error('ONLINE_STARTING');
    this.starting = true;
    try {
      await this.loginForLobby(profile);
      const inviteRoomId = normalizeInviteRoomId(options.inviteRoomId);
      this.setLobbyState(LOBBY_STATES.CHECKING_ROOM);
      this.setStatus('检查牌桌…');
      const active = await callFunction('game', { action: 'activeRoom' });
      if (!active || !active.ok) {
        const error = new Error((active && active.error) || 'ACTIVE_ROOM_FAILED');
        error.code = (active && active.error) || 'ACTIVE_ROOM_FAILED';
        throw error;
      }
      if (active.hasRoom) {
        this.setLobbyState(LOBBY_STATES.RECONNECTING, { room: active });
        this.setStatus('正在进入房间…');
        const entered = await this.enterExistingRoom(active);
        this.setStatus('');
        return Object.assign({ entered: entered.entered !== false }, entered);
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
      if (this.lobbyProfile) this.setLobbyState(LOBBY_STATES.ERROR, { error: onlineErrorMessage(err) });
      throw err;
    } finally {
      this.starting = false;
    }
  }

  async createLobbyRoom(maxRounds = 2) {
    if (this.starting) throw new Error('ONLINE_STARTING');
    this.starting = true;
    try {
      if (!ensureCloudInit()) throw new Error('BACKEND_UNSUPPORTED');
      this.setLobbyState(LOBBY_STATES.CREATING, { maxRounds });
      this.setStatus('创建牌桌…');
      const created = await callFunction('game', {
        action: 'createRoom',
        profile: this.lobbyProfile || {},
        maxRounds,
      });
      if (!created || !created.ok) {
        const error = new Error((created && created.error) || 'CREATE_ROOM_FAILED');
        error.code = (created && created.error) || 'CREATE_ROOM_FAILED';
        throw error;
      }
      if (created.alreadyInRoom) {
        this.setStatus('正在进入房间…');
        const entered = await this.enterExistingRoom(created);
        this.setStatus('');
        return Object.assign({ entered: entered.entered !== false }, entered);
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
      return this.enterExistingRoom(joined.existing);
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
  }

  subscribe() {
    this.reconnectSocketNow();
  }

  async refresh() {
    if (!this.roomId) return false;
    try {
      const res = await callFunction('game', { action: 'pull', roomId: this.roomId });
      return this.applyServerSnapshot(res);
    } catch (err) {
      return false;
    }
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

  /** 立即应用一次服务端裁决附带的完整快照，避免再次 pull 时错过短暂动作事件。 */
  applyServerSnapshot(res) {
    if (res && res.ok && (res.left || res.closed || res.declined || res.status === 'closed')) {
      return this.returnToLobby();
    }
    if (!res || !res.ok || !res.public) return false;
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
    local.tableSettings = res.settings || {};
    local.tableFinished = res.status === 'tableResult';
    local.tableRematch = res.rematch || null;
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
    const locallyAcked = currentEventSeq > 0 && currentEventSeq <= this.lastAckedEventSeq;
    const selfAcked = Boolean(animation.selfAcked || locallyAcked);
    this.animationWaiting = Boolean((animation.waiting || animation.currentEvent) && !selfAcked);
    local.animationWaiting = this.animationWaiting;
    if (this.animationWaiting) {
      local.pendingActions = [];
      local.playerActions = [];
    }
    this.databus.setRoundState(local);
    this.consumeAnimationState(animation);
    this.setStatus('');
    return true;
  }

  consumeAnimationState(animation = {}) {
    const event = rotatePublicEvent(animation.currentEvent, this.mySeat);
    if (!event) {
      if (this.isAnimating && this.currentEvent) return;
      if (this.animator.releaseOnlineEvent) this.animator.releaseOnlineEvent();
      this.currentEvent = null;
      this.isAnimating = false;
      return;
    }
    this.currentEvent = event;
    if (animation.selfAcked) {
      this.lastAckedEventSeq = Math.max(this.lastAckedEventSeq, event.eventSeq);
      this.lastPlayedEventSeq = Math.max(this.lastPlayedEventSeq, event.eventSeq);
      this.isAnimating = false;
      if (this.animator.restoreHeldAppearance) this.animator.restoreHeldAppearance(event);
      return;
    }
    if (event.eventSeq <= this.lastPlayedEventSeq || this.isAnimating) {
      if (!this.isAnimating && event.eventSeq <= this.lastPlayedEventSeq) {
        // 多客户端并发全量写可能覆盖单个回执；权威状态仍未记录本人时主动幂等补发。
        this.lastAckedEventSeq = Math.min(this.lastAckedEventSeq, event.eventSeq - 1);
        this.sendAnimationAck(event.eventSeq);
      }
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
    this.lastPlayedEventSeq = event.eventSeq;
    this.isAnimating = true;
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
      ? this.animator.playOnlineEvent(event, () => this.finishAnimation(event.eventSeq))
      : false);
    if (!started) this.finishAnimation(event.eventSeq);
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
    this.isAnimating = false;
    this.cancelLocalActionPreview();
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
    try {
      const res = this.socket.isReady()
        ? await this.socket.request('ackAnimation', { roomId: this.roomId, eventSeq, version: this.version })
        : null;
      if (!res) throw new Error('SOCKET_NOT_CONNECTED');
      if (!res || !res.ok) throw new Error((res && res.error) || 'ACK_FAILED');
      this.lastAckedEventSeq = Math.max(this.lastAckedEventSeq, eventSeq);
      this.ackingEventSeq = 0;
      if (this.ackRetryTimer) clearTimeout(this.ackRetryTimer);
      this.ackRetryTimer = null;
      if (!this.applyServerSnapshot(res)) await this.refresh();
    } catch (err) {
      this.ackingEventSeq = 0;
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
      }
    }
    if (this.active) {
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

  async sendOp(op, allowRetry = true) {
    if (this.animationWaiting || this.isAnimating) {
      this.databus.feedback = '请等待当前动作完成';
      return;
    }
    try {
      if (!this.socket.isReady()) {
        this.socketReconnecting = true;
        this.databus.feedback = '连接已断开，等待重连';
        this.scheduleReconnect(0);
        return;
      }
      const res = await this.socket.request('op', { roomId: this.roomId, version: this.version, payload: op });
      if (!res || !res.ok) {
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
      if (!this.applyServerSnapshot(res)) await this.refresh();
    } catch (err) {
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
    if (this.animationWaiting || this.isAnimating || this.localActionPreviewType) {
      this.databus.feedback = '请等待当前动作完成';
      return;
    }
    const touch = event.touches && event.touches[0];
    if (!touch || !this.renderer.lastLayout) return;
    const region = this.renderer.layout.hit(this.renderer.lastLayout, touch.clientX, touch.clientY);
    if (!region) return;
    if (this.music) this.music.playCue('tap');

    if (region.type === 'hand-card') {
      this.handleCardTap(region.card.id);
      return;
    }
    if (region.type === 'action') {
      if (this.renderer.markButtonPressed) this.renderer.markButtonPressed(region);
      this.handleActionTap(region.action);
      return;
    }
    if (region.type === 'restart') {
      this.nextRound();
    }
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

  handleActionTap(action) {
    if (!action) return;
    if (action.type === 'leaveTable') {
      this.leaveTable();
      return;
    }
    if (action.type === 'requestRematch') {
      this.requestRematch();
      return;
    }
    if (action.type === 'declineRematch') {
      this.requestRematch(false);
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
      },
    });
  }

  async nextRound() {
    this.setStatus('');
    try {
      const started = await this.callGame('startRound');
      if (!started || !started.ok) {
        this.databus.feedback = onlineErrorMessage({ code: started && started.error });
        return;
      }
      await this.refresh();
    } catch (err) {
      this.databus.feedback = onlineErrorMessage(err);
    }
  }

  async leaveTable() {
    const roomId = this.roomId;
    if (!roomId) return false;
    callFunction('game', { action: 'leaveRoom', roomId })
      .then((res) => {
        if (!res || !res.ok) {
          console.warn('[online] leave room request rejected', { roomId, error: res && res.error });
        }
      })
      .catch((err) => {
        console.warn('[online] leave room request failed after local exit', {
          roomId,
          code: err && (err.code || err.errMsg || err.message),
        });
      });
    return this.returnToLobby();
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
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
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
