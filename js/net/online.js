import { DEFAULT_RULES } from '../game/rules';
import { ensureCloudInit, callFunction, cloudErrorCode, login } from './cloud';

const SEAT_COUNT = DEFAULT_RULES.seatCount;
const ROOM_SESSION_KEY = 'huapai-online-room';
const RECONNECT_DELAY_MS = 1500;
const HEARTBEAT_INTERVAL_MS = 20000;

function animationActionType(type) {
  if (type === 'acceptTakeover') return 'accept-takeover';
  if (type === 'declineTakeover') return 'decline-takeover';
  return type;
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
    CLOUD_UNSUPPORTED: '当前环境不支持云开发，请使用微信真机或开发者工具',
    WX_LOGIN_FAILED: '微信登录失败，请检查登录状态后重试',
    CLOUD_TIMEOUT: '云服务响应超时，请检查网络后重试',
    CLOUD_ENV_INVALID: '云环境不可用，请确认小游戏 AppID 与云环境一致',
    FUNCTION_NOT_FOUND: '登录云函数未部署，请先上传并部署云函数',
    DATABASE_COLLECTION_MISSING: '云数据库集合缺失，请重新部署登录云函数',
    NO_OPENID: '未获取到微信身份，请确认小游戏 AppID 与云环境一致',
    LOGIN_STORAGE_ERROR: '登录数据库初始化失败，请检查云数据库权限',
    LOGIN_FAILED: '登录失败，请重试',
    CREATE_ROOM_FAILED: '创建牌桌失败，请检查 rooms 数据库集合',
    START_FAILED: '牌桌开局失败，请重试',
  };
  return messages[code] || `进入在线对战失败：${code}`;
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

  const myTurnActions = pub.currentSeat === mySeat
    ? (pub.playerActions || []).map((action, index) => rotateAction(action, mySeat, index))
    : [];

  const recentDiscard = pub.recentDiscard
    ? Object.assign({}, pub.recentDiscard, { seat: rotateSeat(pub.recentDiscard.seat, mySeat) })
    : null;

  const handIds = new Set((priv.hand || []).map((c) => c.id));
  const selectedCardId = prevSelectedId && handIds.has(prevSelectedId) ? prevSelectedId : null;

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
    pendingActions: (pub.pendingActions || []).map((action) => rotateAction(action, mySeat)),
    playerActions: myTurnActions,
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
  }

  setStatus(text) {
    if (typeof this.onStatus === 'function') this.onStatus(text);
  }

  /**
   * 单机即可验证的在线流程：登录 → 创建房间 → 开局（空座 AI）→ 订阅。
   */
  async startSoloOnline(profile = {}) {
    if (this.starting) throw new Error('ONLINE_STARTING');
    this.starting = true;
    try {
      if (!ensureCloudInit()) throw new Error('CLOUD_UNSUPPORTED');
      this.setStatus('登录中…');
      const loginRes = await login(profile);
      if (!loginRes || !loginRes.ok) {
        const error = new Error((loginRes && loginRes.error) || 'LOGIN_FAILED');
        error.code = (loginRes && loginRes.error) || 'LOGIN_FAILED';
        error.detail = loginRes && loginRes.message;
        throw error;
      }
      console.info('[online] profile synced', {
        nickName: loginRes.user && loginRes.user.nickName,
        hasAvatar: Boolean(loginRes.user && loginRes.user.avatarUrl),
        receivedProfile: loginRes.receivedProfile || {},
      });

      const session = readRoomSession();
      if (session && session.roomId) {
        this.setStatus('恢复牌桌…');
        this.roomId = session.roomId;
        this.mySeat = typeof session.seat === 'number' ? session.seat : 0;
        if (await this.refresh()) {
          this.active = true;
          this.subscribe();
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

      this.setStatus('开局中…');
      const started = await callFunction('game', { action: 'startRound', roomId: this.roomId });
      if (!started || !started.ok) {
        const error = new Error((started && started.error) || 'START_FAILED');
        error.code = (started && started.error) || 'START_FAILED';
        throw error;
      }

      this.active = true;
      this.subscribe();
      this.bindNetworkEvents();
      await this.refresh();
      return { roomId: this.roomId, seat: this.mySeat };
    } finally {
      this.starting = false;
    }
  }

  enableInput() {
    wx.onTouchStart(this.boundTouch);
  }

  subscribe() {
    if (!ensureCloudInit()) return;
    this.closeWatcher();
    try {
      const db = wx.cloud.database();
      this.watcher = db.collection('roomStates').doc(this.roomId).watch({
        onChange: () => { this.refresh(); },
        onError: () => { this.scheduleReconnect(); },
      });
    } catch (err) {
      // watch 不可用时退化为手动刷新
      this.watcher = null;
    }
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

  /** 立即应用一次服务端裁决附带的完整快照，避免再次 pull 时错过短暂动作事件。 */
  applyServerSnapshot(res) {
    if (!res || !res.ok || !res.public) return false;
    this.mySeat = typeof res.yourSeat === 'number' && res.yourSeat >= 0 ? res.yourSeat : this.mySeat;
    if (this.mySeat < 0) return false;
    saveRoomSession(this.roomId, this.mySeat);
    this.version = res.version;
    const local = buildLocalState(res.public, res.private || { hand: [] }, this.mySeat, this.databus.selectedCardId);
    this.animationWaiting = Boolean(res.animation && res.animation.waiting);
    local.animationWaiting = this.animationWaiting;
    if (this.animationWaiting) local.playerActions = [];
    this.databus.setRoundState(local);
    this.consumeAnimationState(res.animation || {
      currentEvent: res.public.publicEvent || null,
      selfAcked: false,
      waiting: Boolean(res.public.publicEvent),
    });
    this.setStatus('');
    return true;
  }

  consumeAnimationState(animation = {}) {
    const event = rotatePublicEvent(animation.currentEvent, this.mySeat);
    if (!event) {
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
    }
    this.lastPlayedEventSeq = event.eventSeq;
    this.isAnimating = true;
    const usesLocalPreview = this.localActionPreviewType === event.type
      && event.seat === 0
      && this.animator.confirmLocalActionPreview
      && this.animator.confirmLocalActionPreview(event, () => this.finishAnimation(event.eventSeq));
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
    this.localActionPreviewType = animationActionType(action.type);
    if (this.music && action.type === 'discard' && action.card) {
      this.music.playCardVoice(action.card);
    } else if (this.music && ['chi', 'peng', 'zhao', 'ta', 'hu'].indexOf(action.type) >= 0) {
      this.music.playActionVoice(action.type);
    }
    if (this.animator.playLocalActionPreview) this.animator.playLocalActionPreview(action);
  }

  cancelLocalActionPreview() {
    if (!this.localActionPreviewType) return;
    this.localActionPreviewType = null;
    if (this.animator.cancelLocalActionPreview) this.animator.cancelLocalActionPreview();
  }

  async sendAnimationAck(eventSeq) {
    if (!this.roomId || eventSeq <= this.lastAckedEventSeq) return;
    if (this.ackingEventSeq === eventSeq) return;
    this.ackingEventSeq = eventSeq;
    try {
      const res = await callFunction('game', {
        action: 'ackAnimation',
        roomId: this.roomId,
        eventSeq,
      });
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
        callFunction('game', { action: 'heartbeat', roomId: this.roomId })
          .then((res) => {
            if (res && res.advanced) this.refresh();
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
      if (await this.refresh()) this.subscribe();
      else this.scheduleReconnect();
    }, delay);
  }

  closeWatcher() {
    if (this.watcher && this.watcher.close) {
      try { this.watcher.close(); } catch (err) { /* ignore */ }
    }
    this.watcher = null;
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
      const res = await callFunction('game', Object.assign({ action: 'op', roomId: this.roomId, version: this.version }, op));
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
    this.startLocalActionPreview(action);
    if (action.type === 'acceptTakeover') {
      this.sendOp({ kind: 'takeover', accept: true });
      return;
    }
    if (action.type === 'declineTakeover') {
      this.sendOp({ kind: 'takeover', accept: false });
      return;
    }
    this.sendOp({ kind: 'response', ref: { index: action.index, type: action.type } });
  }

  async nextRound() {
    this.setStatus('');
    try {
      await callFunction('game', { action: 'startRound', roomId: this.roomId });
      await this.refresh();
    } catch (err) {
      this.databus.feedback = '开新局失败，请重试';
    }
  }

  destroy() {
    this.active = false;
    if (wx.offTouchStart) wx.offTouchStart(this.boundTouch);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    if (this.ackRetryTimer) clearTimeout(this.ackRetryTimer);
    this.ackRetryTimer = null;
    this.ackingEventSeq = 0;
    this.cancelLocalActionPreview();
    if (wx.offNetworkStatusChange) wx.offNetworkStatusChange(this.boundNetworkChange);
    this.closeWatcher();
  }
}
