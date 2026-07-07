/**
 * 房间与对局编排层（room.js）
 *
 * 职责：
 *   1. 快速匹配队列撮合
 *   2. 好友房创建/加入/开局
 *   3. 玩家操作裁决（op）与乐观锁版本校验
 *   4. 状态持久化（权威 rooms + 公共 roomStates）
 *   5. 心跳、掉线检测与 AI 托管推进
 *
 * 数据模型：
 *   rooms       权威全量状态（含手牌），仅自有后端可读写
 *   roomStates  脱敏公共状态（无手牌明细）
 *   matchQueue  快速匹配等待队列，以 openid 为文档 ID
 *
 * 并发策略：
 *   - 客户端提交 op 时须携带本地看到的 version
 *   - version 不一致则拒绝（VERSION_STALE），客户端 pull 后重试
 *   - 每次合法推进 version + 1，并同步写入两个集合
 */
const {
  HuapaiEngine,
  buildPublicState,
  buildPrivateView,
  serializePublicEvent,
} = require('./core/engine');
const { chooseAcceptTakeover, chooseDealerGift } = require('./core/ai');
const { DEFAULT_RULES } = require('./core/rules');

/** 固定 4 人桌，取自规则配置 */
const SEAT_COUNT = DEFAULT_RULES.seatCount;
/** 快速匹配最少真人数；不足 4 人时由 AI 补位 */
const MIN_HUMANS = 2;

const ROOMS = 'rooms';
const ROOM_STATES = 'roomStates';
const QUEUE = 'matchQueue';
const SUPPORTED_MAX_ROUNDS = [1, 2, 4, 6];
const DEFAULT_MAX_ROUNDS = 2;
const SUPPORTED_PAY_TYPES = ['pihu', 'jiahu', 'changhu'];
const CLOSED_ROOM_STATUSES = ['closed'];

function buildPrivateViewsBySeat(state) {
  if (!state || !Array.isArray(state.seats)) return {};
  return state.seats.reduce((output, seat, seatIndex) => {
    output[seatIndex] = buildPrivateView(state, seatIndex);
    return output;
  }, {});
}
/** 玩家超过此毫秒未心跳则视为掉线 */
const PLAYER_TIMEOUT_MS = 60000;
/** 单个公开动作等待客户端动画回执的最长时间 */
const ANIMATION_ACK_TIMEOUT_MS = 12000;
/** 最大局数结束后，房主决定是否继续牌局的窗口 */
const FINAL_REMATCH_HOST_DECISION_MS = 15000;

/**
 * 剥离 CloudBase 文档 _id，写入 set 时使用业务 roomId 作为 doc id。
 */
function documentData(value) {
  const data = Object.assign({}, value);
  delete data._id;
  return data;
}

/** 生成 6 位数字房间号 */
function genRoomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizeMaxRounds(value) {
  const numeric = Number(value);
  return SUPPORTED_MAX_ROUNDS.indexOf(numeric) >= 0 ? numeric : DEFAULT_MAX_ROUNDS;
}

function normalizeRoomSettings(settings = {}) {
  const payType = SUPPORTED_PAY_TYPES.indexOf(settings.payType) >= 0 ? settings.payType : 'pihu';
  return {
    maxRounds: normalizeMaxRounds(settings.maxRounds),
    repeatRound: Boolean(settings.repeatRound),
    washTwice: Boolean(settings.washTwice),
    payType,
  };
}

function activeRoomStatus(status) {
  return CLOSED_ROOM_STATUSES.indexOf(status) < 0;
}

function playerOpenids(players = []) {
  return players.map((player) => player.openid).filter(Boolean);
}

function roomPlayerOpenids(room) {
  return room && room.status === 'closed' ? [] : playerOpenids(room.players || []);
}

function buildRematchState(room, openid = null) {
  const rematch = room && room.rematch ? room.rematch : null;
  const players = humanPlayers(room);
  const requiredOpenids = playerOpenids(players);
  const agreedOpenids = rematch && Array.isArray(rematch.agreedOpenids) ? rematch.agreedOpenids : [];
  const status = rematch ? (rematch.status || '') : '';
  const isHost = Boolean(openid && room && openid === room.hostOpenid);
  const selfAgreed = Boolean(openid && agreedOpenids.indexOf(openid) >= 0);
  return {
    status,
    active: status === 'pending',
    hostDecision: status === 'host-decision',
    requestedBy: rematch ? (rematch.requestedBy || '') : '',
    deadlineAt: rematch ? (rematch.deadlineAt || null) : null,
    agreedOpenids,
    agreedCount: agreedOpenids.filter((id) => requiredOpenids.indexOf(id) >= 0).length,
    requiredCount: requiredOpenids.length,
    selfAgreed,
    isHost,
    canRequest: Boolean(isHost && status === 'host-decision'),
    canAccept: Boolean(!isHost && status === 'pending' && !selfAgreed),
    canDecline: Boolean(!isHost && status === 'pending'),
  };
}

function makeWaitingPlayer(seat, openid, profile = {}, now = Date.now()) {
  return {
    seat,
    openid,
    nickName: profile.nickName || '玩家',
    avatarUrl: profile.avatarUrl || '',
    isHuman: true,
    online: true,
    ready: Boolean(profile.ready),
    lastSeenAt: now,
  };
}

function humanPlayers(room) {
  return (room.players || []).filter((player) => player && player.isHuman !== false && player.openid);
}

function canStartWaitingRoom(room) {
  const players = humanPlayers(room);
  const host = players.find((player) => player.openid === room.hostOpenid);
  return room.status === 'waiting'
    && players.length >= MIN_HUMANS
    && players.every((player) => player.ready)
    && Boolean(host && host.ready);
}

function publicWaitingPlayer(player) {
  if (!player) return null;
  return {
    seat: player.seat,
    nickName: player.nickName || '玩家',
    avatarUrl: player.avatarUrl || '',
    ready: Boolean(player.ready),
    isHost: false,
  };
}

function buildSeatSwapSnapshot(room, openid) {
  const request = room && room.seatSwapRequest;
  if (!request || request.status !== 'pending' || !openid) return null;
  if (openid !== request.fromOpenid && openid !== request.toOpenid) return null;
  return {
    id: request.id,
    direction: openid === request.toOpenid ? 'incoming' : 'outgoing',
    fromSeat: request.fromSeat,
    toSeat: request.toSeat,
    fromPlayer: publicWaitingPlayer((room.players || []).find((player) => player.openid === request.fromOpenid)),
    toPlayer: publicWaitingPlayer((room.players || []).find((player) => player.openid === request.toOpenid)),
    createdAt: request.createdAt || null,
  };
}

function buildWaitingRoomSnapshot(room, openid = null) {
  const settings = normalizeRoomSettings(room.settings);
  const players = humanPlayers(room)
    .slice()
    .sort((a, b) => a.seat - b.seat)
    .map((player) => ({
      seat: player.seat,
      openid: player.openid,
      nickName: player.nickName || '玩家',
      avatarUrl: player.avatarUrl || '',
      isHuman: true,
      online: player.online !== false,
      ready: Boolean(player.ready),
      lastSeenAt: player.lastSeenAt || null,
      isHost: player.openid === room.hostOpenid,
    }));
  const seat = openid ? seatOfOpenid(room, openid) : -1;
  return {
    roomId: room._id,
    status: room.status,
    hostOpenid: room.hostOpenid,
    settings,
    seatCount: room.seatCount || SEAT_COUNT,
    players,
    humanCount: players.length,
    minHumansToStart: MIN_HUMANS,
    canStart: Boolean(openid && openid === room.hostOpenid && canStartWaitingRoom(room)),
    readyToStart: canStartWaitingRoom(room),
    yourSeat: seat,
    isHost: Boolean(openid && openid === room.hostOpenid),
    swapRequest: buildSeatSwapSnapshot(room, openid),
  };
}

function touchWaitingPlayer(room, openid, now = Date.now()) {
  const player = (room.players || []).find((item) => item.openid === openid);
  if (!player) return null;
  player.online = true;
  player.lastSeenAt = now;
  if (typeof player.ready !== 'boolean') player.ready = false;
  return player;
}

function buildActiveRoomResult(room, openid) {
  if (!room || !activeRoomStatus(room.status)) return { ok: true, hasRoom: false };
  const seat = seatOfOpenid(room, openid);
  if (seat < 0) return { ok: true, hasRoom: false };
  const result = {
    ok: true,
    hasRoom: true,
    roomId: room._id,
    seat,
    status: room.status,
    version: room.version || 0,
    settings: normalizeRoomSettings(room.settings),
  };
  if (room.status === 'waiting') result.room = buildWaitingRoomSnapshot(room, openid);
  result.rematch = buildRematchState(room, openid);
  return result;
}

function reachedMaxRounds(room, engine) {
  const state = engine && engine.state;
  if (!state || state.phase !== 'result') return false;
  const maxRounds = normalizeRoomSettings(room.settings).maxRounds;
  return (state.round || 0) >= maxRounds;
}

function ensureFinalRematchDecision(room, now = Date.now()) {
  if (!room || room.status !== 'tableResult') return false;
  if (room.rematch && (room.rematch.status === 'host-decision' || room.rematch.status === 'pending')) return false;
  room.rematch = {
    status: 'host-decision',
    requestedBy: '',
    agreedOpenids: [],
    declinedOpenids: [],
    createdAt: now,
    deadlineAt: now + FINAL_REMATCH_HOST_DECISION_MS,
  };
  return true;
}

function closeRoom(room) {
  room.status = 'closed';
  room.playerOpenids = [];
  room.rematch = null;
  return room;
}

function expireFinalRematchDecision(room, now = Date.now()) {
  if (
    !room
    || room.status !== 'tableResult'
    || !room.rematch
    || room.rematch.status !== 'host-decision'
    || !room.rematch.deadlineAt
    || now < room.rematch.deadlineAt
  ) {
    return false;
  }
  closeRoom(room);
  return true;
}

function settleRoomStatus(room, engine) {
  if (reachedMaxRounds(room, engine)) {
    room.status = 'tableResult';
    ensureFinalRematchDecision(room);
  } else if (engine && engine.state && engine.state.phase === 'result') {
    room.status = 'finished';
  }
  return room.status;
}

/**
 * 持久化前剥离 rules 对象（体积大且固定），读取时由 loadEngine 重新挂载 DEFAULT_RULES。
 */
function stripState(state) {
  if (!state) return null;
  return Object.assign({}, state, { rules: undefined });
}

/**
 * 从持久化 state 恢复引擎实例。
 * @param {object|null} state - 数据库中的 strip 后状态
 * @returns {HuapaiEngine}
 */
function loadEngine(state) {
  const engine = new HuapaiEngine(DEFAULT_RULES);
  if (state) {
    state.rules = DEFAULT_RULES;
    engine.load(state);
  }
  return engine;
}

/** 根据 openid 查找座位号，不在房间返回 -1 */
function seatOfOpenid(room, openid) {
  const player = (room.players || []).find((p) => p.openid === openid);
  return player ? player.seat : -1;
}

/**
 * 将 room.players（仅真人）映射为满座 players 数组，空座填充 AI。
 * 供 engine.startRound 使用。
 */
function buildSeatPlayers(room) {
  const players = [];
  for (let seat = 0; seat < SEAT_COUNT; seat++) {
    const human = (room.players || []).find((p) => p.seat === seat);
    if (human) {
      players.push({
        openid: human.openid,
        nickName: human.nickName,
        avatarUrl: human.avatarUrl,
        isHuman: true,
        online: human.online !== false,
      });
    } else {
      players.push({ openid: null, nickName: `电脑${seat}`, avatarUrl: '', isHuman: false });
    }
  }
  return players;
}

function onlineAnimationOpenids(room) {
  return (room.players || [])
    .filter((player) => player.online !== false)
    .map((player) => player.openid)
    .filter(Boolean);
}

function playerOpenidAtSeat(room, seat) {
  const player = (room.players || []).find((item) => item && item.seat === seat);
  return player && player.openid ? player.openid : '';
}

function requiredOpenidsForSeats(room, seats = []) {
  const online = new Set(onlineAnimationOpenids(room));
  return seats
    .map((seat) => playerOpenidAtSeat(room, seat))
    .filter((openid, index, list) => openid && online.has(openid) && list.indexOf(openid) === index);
}

function roomDebugId(room) {
  return room && (room.roomId || room._id || room.id) ? (room.roomId || room._id || room.id) : '';
}

function seatsForOpenids(room, openids = []) {
  return openids
    .map((openid) => seatOfOpenid(room, openid))
    .filter((seat, index, list) => typeof seat === 'number' && seat >= 0 && list.indexOf(seat) === index);
}

function responseWindowDebug(responseWindow = {}) {
  if (!responseWindow) return null;
  const decisions = responseWindow.decisions || {};
  const candidateSeats = Object.keys(decisions)
    .map((seat) => Number(seat))
    .filter((seat) => Number.isInteger(seat));
  const waitingSeats = candidateSeats.filter((seat) => decisions[seat] && decisions[seat].status === 'pending');
  const decidedSeats = candidateSeats.filter((seat) => decisions[seat] && decisions[seat].status !== 'pending');
  return {
    id: responseWindow.id || '',
    sourceSeat: typeof responseWindow.sourceSeat === 'number' ? responseWindow.sourceSeat : null,
    sourceType: responseWindow.sourceType || '',
    cardId: responseWindow.card && responseWindow.card.id ? responseWindow.card.id : '',
    candidateSeats,
    waitingSeats,
    decidedSeats,
    currentBest: responseWindow.currentBest ? {
      seat: responseWindow.currentBest.seat,
      type: responseWindow.currentBest.type,
      priority: responseWindow.currentBest.priority,
    } : null,
  };
}

function logResponseFlowDebug(message, detail = {}) {
  if (process.env.HUAPAI_RESPONSE_FLOW_DEBUG === '0') return;
  try {
    console.info(`[room:response-flow] ${message}`, JSON.stringify(detail));
  } catch (err) {
    console.info(`[room:response-flow] ${message}`, detail);
  }
}

function sameOpenidList(left = [], right = []) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

function animationBarrierDebug(room, engine, barrier = null) {
  const state = engine && engine.state ? engine.state : {};
  const event = state.publicEvent || {};
  const continuation = state.pendingContinuation || {};
  const currentBarrier = barrier || room.animationBarrier || null;
  return {
    roomId: roomDebugId(room),
    eventSeq: event.eventSeq || (currentBarrier && currentBarrier.eventSeq) || null,
    eventType: event.type || '',
    eventSeat: typeof event.seat === 'number' ? event.seat : null,
    eventAppearanceResolution: event.appearanceResolution || '',
    continuationType: continuation.type || '',
    continuationSourceSeat: typeof continuation.sourceSeat === 'number' ? continuation.sourceSeat : null,
    continuationActionSeats: responseContinuationSeats(continuation),
    requiredSeats: currentBarrier ? seatsForOpenids(room, currentBarrier.requiredOpenids || []) : [],
    ackedSeats: currentBarrier ? seatsForOpenids(room, currentBarrier.ackedOpenids || []) : [],
    deadlineAt: currentBarrier ? currentBarrier.deadlineAt : null,
    responseWindow: responseWindowDebug(state.responseWindow),
  };
}

function responseContinuationSeat(continuation = {}) {
  const actions = Array.isArray(continuation.actions) ? continuation.actions : [];
  return actions.length && typeof actions[0].seat === 'number' ? actions[0].seat : null;
}

function responseContinuationSeats(continuation = {}) {
  const actions = Array.isArray(continuation.actions) ? continuation.actions : [];
  return actions
    .map((action) => action.seat)
    .filter((seat, index, list) => typeof seat === 'number' && list.indexOf(seat) === index);
}

function requiredAnimationOpenids(room, engine) {
  const state = engine && engine.state ? engine.state : {};
  const continuation = state.pendingContinuation || {};
  const allOnline = onlineAnimationOpenids(room);
  if (continuation.type === 'draw-response-window' && continuation.actions) {
    const sourceSeat = typeof continuation.sourceSeat === 'number' ? continuation.sourceSeat : null;
    const seats = responseContinuationSeats(continuation)
      .filter((seat) => sourceSeat === null || seat !== sourceSeat);
    return requiredOpenidsForSeats(room, seats);
  }
  if (continuation.type === 'handle-response-window' || continuation.type === 'draw-response-window') {
    const seats = responseContinuationSeats(continuation);
    return requiredOpenidsForSeats(room, seats.length ? seats : [responseContinuationSeat(continuation)]);
  }
  if (continuation.type === 'after-grouping' && typeof continuation.seatIndex === 'number') {
    return requiredOpenidsForSeats(room, [continuation.seatIndex]);
  }
  if (continuation.type === 'enter-dealer-gift' && typeof continuation.slippedSeat === 'number') {
    return requiredOpenidsForSeats(room, [continuation.slippedSeat]);
  }
  if (continuation.type === 'next-draw' && typeof continuation.sourceSeat === 'number') {
    const nextSeatOpenids = requiredOpenidsForSeats(room, [(continuation.sourceSeat + 1) % SEAT_COUNT]);
    return nextSeatOpenids.length ? nextSeatOpenids : requiredOpenidsForSeats(room, [continuation.sourceSeat]);
  }
  return allOnline;
}

function animationMetrics(room) {
  if (!room.animationMetrics) {
    room.animationMetrics = {
      eventCount: 0,
      ackCallCount: 0,
      timeoutCount: 0,
      stateWriteCount: 0,
      lastAckDurationMs: 0,
      maxAckDurationMs: 0,
    };
  }
  return room.animationMetrics;
}

/** 根据引擎当前公开事件建立或延续动画屏障，兼容旧房间无此字段的状态。 */
function syncAnimationBarrier(room, engine, now = Date.now()) {
  const event = engine.state && engine.state.publicEvent;
  if (!event) {
    room.animationBarrier = null;
    return null;
  }
  const current = room.animationBarrier;
  if (current && current.eventSeq === event.eventSeq) {
    const online = new Set(requiredAnimationOpenids(room, engine));
    const beforeRequired = current.requiredOpenids || [];
    const beforeAcked = current.ackedOpenids || [];
    current.requiredOpenids = (current.requiredOpenids || []).filter((openid) => online.has(openid));
    current.ackedOpenids = (current.ackedOpenids || []).filter((openid) => current.requiredOpenids.indexOf(openid) >= 0);
    if (!sameOpenidList(beforeRequired, current.requiredOpenids) || !sameOpenidList(beforeAcked, current.ackedOpenids)) {
      logResponseFlowDebug('barrier-update', animationBarrierDebug(room, engine, current));
    }
    return current;
  }
  room.animationBarrier = {
    eventSeq: event.eventSeq,
    requiredOpenids: requiredAnimationOpenids(room, engine),
    ackedOpenids: [],
    createdAt: now,
    deadlineAt: now + ANIMATION_ACK_TIMEOUT_MS,
  };
  animationMetrics(room).eventCount += 1;
  logResponseFlowDebug('barrier-create', animationBarrierDebug(room, engine, room.animationBarrier));
  return room.animationBarrier;
}

function barrierComplete(barrier) {
  if (!barrier) return true;
  const acked = new Set(barrier.ackedOpenids || []);
  return (barrier.requiredOpenids || []).every((openid) => acked.has(openid));
}

/**
 * 没有在线真人需要观看时自动越过屏障；有真人时停在当前公开动作等待回执。
 */
function advanceUnobservedEvents(room, engine) {
  let guard = 0;
  let barrier = syncAnimationBarrier(room, engine);
  while (barrier && barrierComplete(barrier) && guard < 64) {
    engine.resumePublicEvent();
    barrier = syncAnimationBarrier(room, engine);
    guard += 1;
  }
  return barrier;
}

function animationState(room, engine, openid = null) {
  const barrier = syncAnimationBarrier(room, engine);
  const seatByOpenid = {};
  (room.players || []).forEach((player) => {
    seatByOpenid[player.openid] = player.seat;
  });
  const requiredOpenids = barrier ? (barrier.requiredOpenids || []) : [];
  const ackedOpenids = barrier ? (barrier.ackedOpenids || []) : [];
  const selfRequiresAck = Boolean(openid && requiredOpenids.indexOf(openid) >= 0);
  return {
    currentEvent: engine.state ? serializePublicEvent(engine.state.publicEvent) : null,
    latestEventSeq: engine.state && typeof engine.state.eventSeq === 'number' ? engine.state.eventSeq : 0,
    requiredSeats: requiredOpenids.map((id) => seatByOpenid[id]).filter((seat) => typeof seat === 'number'),
    ackedSeats: ackedOpenids.map((id) => seatByOpenid[id]).filter((seat) => typeof seat === 'number'),
    deadlineAt: barrier ? barrier.deadlineAt : null,
    selfAcked: Boolean(barrier && openid && (!selfRequiresAck || ackedOpenids.indexOf(openid) >= 0)),
    waiting: Boolean(barrier),
  };
}

/**
 * 原子写入权威房间 + 公共状态。
 *
 * 注意：rooms 使用 set 全量替换而非 update 嵌套合并，
 * 避免 CloudBase「在 null 元素上创建字段」错误。
 *
 * @returns {object} publicState - 脱敏后的公共视图
 */
async function writeRoomState(db, roomId, room, engine, version) {
  advanceUnobservedEvents(room, engine);
  settleRoomStatus(room, engine);
  animationMetrics(room).stateWriteCount += 1;
  const publicState = buildPublicState(engine.state);
  const animation = animationState(room, engine);
  await db.collection(ROOMS).doc(roomId).set({
    data: documentData(Object.assign({}, room, {
      status: room.status,
      version,
      state: stripState(engine.state),
      players: room.players,
      playerOpenids: roomPlayerOpenids(room),
      settings: normalizeRoomSettings(room.settings),
      rematch: room.rematch || null,
      updatedAt: Date.now(),
    })),
  });
  await db.collection(ROOM_STATES).doc(roomId).set({
    data: {
      version,
      public: publicState,
      animation,
      rematch: buildRematchState(room),
      updatedAt: Date.now(),
    },
  });
  return publicState;
}

/** 读取房间文档，不存在返回 null */
async function getRoom(db, roomId) {
  try {
    const snap = await db.collection(ROOMS).doc(roomId).get();
    return snap.data;
  } catch (err) {
    return null;
  }
}

async function queryActiveRoom(db, _, openid) {
  const queries = [
    { playerOpenids: openid },
    { 'players.openid': openid },
  ];
  for (const query of queries) {
    try {
      const snap = await db.collection(ROOMS)
        .where(query)
        .orderBy('updatedAt', 'desc')
        .limit(10)
        .get();
      const room = (snap.data || [])
        .filter((item) => seatOfOpenid(item, openid) >= 0 && activeRoomStatus(item.status))
        .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))[0];
      if (room) return room;
    } catch (err) { /* 尝试下一种查询形态 */ }
  }
  return null;
}

async function activeRoom(event, ctx) {
  const { db, _, OPENID } = ctx;
  const room = await queryActiveRoom(db, _, OPENID);
  return buildActiveRoomResult(room, OPENID);
}

// ===================== 快速匹配 =====================

/**
 * 加入匹配队列；若等待人数 >= MIN_HUMANS 则立即撮合开局。
 *
 * @param {object} event.profile - { nickName, avatarUrl }
 * @returns {{ ok, status: 'waiting'|'matched', roomId?, seat? }}
 */
async function quickMatch(event, ctx) {
  const { db, OPENID } = ctx;
  const profile = event.profile || {};
  await db.collection(QUEUE).doc(OPENID).set({
    data: {
      openid: OPENID,
      nickName: profile.nickName || '玩家',
      avatarUrl: profile.avatarUrl || '',
      status: 'waiting',
      createdAt: Date.now(),
    },
  });

  // 按入队时间升序取前 SEAT_COUNT 人尝试撮合
  const waitingSnap = await db.collection(QUEUE)
    .where({ status: 'waiting' })
    .orderBy('createdAt', 'asc')
    .limit(SEAT_COUNT)
    .get();
  const waiting = waitingSnap.data || [];

  if (waiting.length >= MIN_HUMANS) {
    const group = waiting.slice(0, SEAT_COUNT);
    const roomId = genRoomCode();
    const players = group.map((entry, seat) => ({
      seat,
      openid: entry.openid,
      nickName: entry.nickName,
      avatarUrl: entry.avatarUrl,
      isHuman: true,
      online: true,
      ready: true,
      lastSeenAt: Date.now(),
    }));
    const room = {
      _id: roomId,
      status: 'playing',
      seatCount: SEAT_COUNT,
      players,
      playerOpenids: playerOpenids(players),
      settings: normalizeRoomSettings(event.settings || {}),
      hostOpenid: players[0].openid,
      version: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const engine = loadEngine(null);
    engine.startRound({ players: buildSeatPlayers(room) });
    await writeRoomState(db, roomId, room, engine, 0);
    for (const p of players) {
      await db.collection(QUEUE).doc(p.openid).update({ data: { status: 'matched', roomId, seat: p.seat } });
    }
    const mine = players.find((p) => p.openid === OPENID);
    return { ok: true, status: 'matched', roomId, seat: mine ? mine.seat : -1 };
  }

  return { ok: true, status: 'waiting' };
}

/** 取消匹配：仅 waiting 状态才从队列移除 */
async function cancelMatch(event, ctx) {
  const { db, OPENID } = ctx;
  try {
    const snap = await db.collection(QUEUE).doc(OPENID).get();
    if (snap.data && snap.data.status === 'waiting') {
      await db.collection(QUEUE).doc(OPENID).remove();
    }
  } catch (err) { /* 文档不存在则忽略 */ }
  return { ok: true };
}

/**
 * 轮询匹配结果。
 * @returns {{ status: 'matched'|'waiting'|'none', roomId?, seat? }}
 */
async function matchStatus(event, ctx) {
  const { db, OPENID } = ctx;
  try {
    const snap = await db.collection(QUEUE).doc(OPENID).get();
    const entry = snap.data;
    if (entry && entry.status === 'matched') {
      return { ok: true, status: 'matched', roomId: entry.roomId, seat: entry.seat };
    }
    return { ok: true, status: 'waiting' };
  } catch (err) {
    return { ok: true, status: 'none' };
  }
}

// ===================== 好友房间 =====================

/**
 * 创建等待中的好友房，创建者占 0 号座且为房主。
 */
async function createRoom(event, ctx) {
  const { db, _, OPENID } = ctx;
  const existing = await queryActiveRoom(db, _, OPENID);
  if (existing) {
    return Object.assign(buildActiveRoomResult(existing, OPENID), { alreadyInRoom: true });
  }
  const profile = event.profile || {};
  const settingsInput = Object.assign({}, event.settings || {});
  if (event.maxRounds !== undefined) settingsInput.maxRounds = event.maxRounds;
  const settings = normalizeRoomSettings(settingsInput);
  const roomId = genRoomCode();
  const players = [{
    ...makeWaitingPlayer(0, OPENID, profile),
  }];
  const room = {
    _id: roomId,
    status: 'waiting',
    seatCount: SEAT_COUNT,
    players,
    playerOpenids: playerOpenids(players),
    settings,
    hostOpenid: OPENID,
    version: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.collection(ROOMS).doc(roomId).set({ data: documentData(room) });
  return { ok: true, roomId, seat: 0, settings, room: buildWaitingRoomSnapshot(room, OPENID) };
}

/**
 * 加入好友房：分配最小可用座位号。
 * 已在房间内则幂等返回原座位。
 */
async function joinRoom(event, ctx) {
  const { db, _, OPENID } = ctx;
  const roomId = event.roomId;
  const profile = event.profile || {};
  if (!roomId) return { ok: false, error: 'ROOM_NOT_FOUND' };

  const active = await queryActiveRoom(db, _, OPENID);
  if (active && active._id !== roomId && activeRoomStatus(active.status)) {
    return {
      ok: false,
      error: 'ALREADY_IN_ROOM',
      existing: buildActiveRoomResult(active, OPENID),
    };
  }

  const room = await getRoom(db, roomId);
  if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
  if (room.status === 'tableResult' || !activeRoomStatus(room.status)) return { ok: false, error: 'ROOM_ENDED' };
  if (room.status !== 'waiting') return { ok: false, error: 'ROOM_ALREADY_STARTED', status: room.status };

  const existing = seatOfOpenid(room, OPENID);
  if (existing >= 0) {
    touchWaitingPlayer(room, OPENID);
    await db.collection(ROOMS).doc(roomId).update({
      data: {
        players: room.players,
        playerOpenids: roomPlayerOpenids(room),
        updatedAt: Date.now(),
      },
    });
    return { ok: true, roomId, seat: existing, room: buildWaitingRoomSnapshot(room, OPENID) };
  }

  if ((room.players || []).length >= SEAT_COUNT) return { ok: false, error: 'ROOM_FULL' };

  const used = new Set((room.players || []).map((p) => p.seat));
  let seat = 0;
  while (used.has(seat)) seat++;
  const player = makeWaitingPlayer(seat, OPENID, profile);
  const players = room.players.concat([player]);
  room.players = players;
  await db.collection(ROOMS).doc(roomId).update({
    data: {
      players,
      playerOpenids: playerOpenids(players),
      updatedAt: Date.now(),
    },
  });
  return { ok: true, roomId, seat, room: buildWaitingRoomSnapshot(room, OPENID) };
}

async function roomInfo(event, ctx) {
  const { db, OPENID } = ctx;
  const roomId = event.roomId;
  if (!roomId) return { ok: false, error: 'ROOM_NOT_FOUND' };
  const room = await getRoom(db, roomId);
  if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
  if (seatOfOpenid(room, OPENID) < 0) return { ok: false, error: 'NOT_IN_ROOM' };
  touchWaitingPlayer(room, OPENID);
  await db.collection(ROOMS).doc(roomId).update({
    data: {
      players: room.players,
      playerOpenids: roomPlayerOpenids(room),
      updatedAt: Date.now(),
    },
  });
  return {
    ok: true,
    roomId,
    seat: seatOfOpenid(room, OPENID),
    room: buildWaitingRoomSnapshot(room, OPENID),
  };
}

async function setReady(event, ctx) {
  const { db, OPENID } = ctx;
  const roomId = event.roomId;
  if (!roomId) return { ok: false, error: 'ROOM_NOT_FOUND' };
  const room = await getRoom(db, roomId);
  if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
  if (room.status !== 'waiting') return { ok: false, error: 'ROOM_ALREADY_STARTED', status: room.status };
  const player = touchWaitingPlayer(room, OPENID);
  if (!player) return { ok: false, error: 'NOT_IN_ROOM' };
  player.ready = event.ready === false ? false : true;
  await db.collection(ROOMS).doc(roomId).update({
    data: {
      players: room.players,
      playerOpenids: roomPlayerOpenids(room),
      updatedAt: Date.now(),
    },
  });
  return {
    ok: true,
    roomId,
    seat: player.seat,
    room: buildWaitingRoomSnapshot(room, OPENID),
  };
}

async function requestSeatSwap(event, ctx) {
  const { db, OPENID } = ctx;
  const roomId = event.roomId;
  const targetSeat = Number(event.targetSeat);
  if (!roomId) return { ok: false, error: 'ROOM_NOT_FOUND' };
  if (!Number.isInteger(targetSeat) || targetSeat < 0 || targetSeat >= SEAT_COUNT) {
    return { ok: false, error: 'INVALID_SEAT' };
  }
  const room = await getRoom(db, roomId);
  if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
  if (room.status !== 'waiting') return { ok: false, error: 'ROOM_ALREADY_STARTED', status: room.status };
  const fromPlayer = touchWaitingPlayer(room, OPENID);
  if (!fromPlayer) return { ok: false, error: 'NOT_IN_ROOM' };
  const toPlayer = (room.players || []).find((player) => player && player.seat === targetSeat && player.openid);
  if (!toPlayer) return { ok: false, error: 'TARGET_NOT_FOUND' };
  if (toPlayer.openid === OPENID) return { ok: false, error: 'CANNOT_SWAP_SELF' };
  const existing = room.seatSwapRequest;
  if (existing && existing.status === 'pending') {
    const sameRequest = existing.fromOpenid === OPENID && existing.toOpenid === toPlayer.openid;
    if (!sameRequest) return { ok: false, error: 'SWAP_REQUEST_PENDING' };
  }
  room.seatSwapRequest = {
    id: `${Date.now()}-${fromPlayer.seat}-${targetSeat}`,
    status: 'pending',
    fromOpenid: OPENID,
    fromSeat: fromPlayer.seat,
    toOpenid: toPlayer.openid,
    toSeat: toPlayer.seat,
    createdAt: Date.now(),
  };
  await db.collection(ROOMS).doc(roomId).update({
    data: {
      players: room.players,
      playerOpenids: roomPlayerOpenids(room),
      seatSwapRequest: room.seatSwapRequest,
      updatedAt: Date.now(),
    },
  });
  return {
    ok: true,
    roomId,
    seat: fromPlayer.seat,
    room: buildWaitingRoomSnapshot(room, OPENID),
  };
}

async function respondSeatSwap(event, ctx) {
  const { db, OPENID } = ctx;
  const roomId = event.roomId;
  if (!roomId) return { ok: false, error: 'ROOM_NOT_FOUND' };
  const room = await getRoom(db, roomId);
  if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
  if (room.status !== 'waiting') return { ok: false, error: 'ROOM_ALREADY_STARTED', status: room.status };
  const request = room.seatSwapRequest;
  if (!request || request.status !== 'pending') return { ok: false, error: 'SWAP_REQUEST_NOT_FOUND' };
  if (event.requestId && request.id !== event.requestId) return { ok: false, error: 'SWAP_REQUEST_STALE' };
  if (request.toOpenid !== OPENID) return { ok: false, error: 'NOT_SWAP_TARGET' };
  touchWaitingPlayer(room, OPENID);
  const fromPlayer = (room.players || []).find((player) => player && player.openid === request.fromOpenid);
  const toPlayer = (room.players || []).find((player) => player && player.openid === request.toOpenid);
  if (!fromPlayer || !toPlayer) {
    room.seatSwapRequest = null;
    await db.collection(ROOMS).doc(roomId).update({
      data: { seatSwapRequest: null, players: room.players, playerOpenids: roomPlayerOpenids(room), updatedAt: Date.now() },
    });
    return { ok: false, error: 'SWAP_PLAYER_LEFT', room: buildWaitingRoomSnapshot(room, OPENID) };
  }
  if (event.accept !== false) {
    const fromSeat = fromPlayer.seat;
    fromPlayer.seat = toPlayer.seat;
    toPlayer.seat = fromSeat;
  }
  room.seatSwapRequest = null;
  await db.collection(ROOMS).doc(roomId).update({
    data: {
      players: room.players,
      playerOpenids: roomPlayerOpenids(room),
      seatSwapRequest: null,
      updatedAt: Date.now(),
    },
  });
  return {
    ok: true,
    roomId,
    accepted: event.accept !== false,
    seat: seatOfOpenid(room, OPENID),
    room: buildWaitingRoomSnapshot(room, OPENID),
  };
}

/**
 * 房主开局：空座由 AI 补位，状态变为 playing。
 * 仅 hostOpenid 可调用。
 */
async function startRound(event, ctx) {
  const { db, OPENID } = ctx;
  const roomId = event.roomId;
  const room = await getRoom(db, roomId);
  if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
  if (room.hostOpenid !== OPENID) return { ok: false, error: 'NOT_HOST' };

  const engine = loadEngine(room.state || null);
  settleRoomStatus(room, engine);
  if (room.status === 'tableResult' || reachedMaxRounds(room, engine)) {
    room.status = 'tableResult';
    await db.collection(ROOMS).doc(roomId).update({
      data: {
        status: room.status,
        settings: normalizeRoomSettings(room.settings),
        updatedAt: Date.now(),
      },
    });
    return {
      ok: false,
      error: 'TABLE_FINISHED',
      status: room.status,
      settings: normalizeRoomSettings(room.settings),
      rematch: buildRematchState(room, OPENID),
    };
  }
  if (room.status === 'waiting') {
    if (humanPlayers(room).length < MIN_HUMANS) {
      return {
        ok: false,
        error: 'WAITING_FOR_PLAYERS',
        room: buildWaitingRoomSnapshot(room, OPENID),
      };
    }
    if (!canStartWaitingRoom(room)) {
      return {
        ok: false,
        error: 'PLAYERS_NOT_READY',
        room: buildWaitingRoomSnapshot(room, OPENID),
      };
    }
  } else if (room.status !== 'finished') {
    return { ok: false, error: 'ROOM_ALREADY_PLAYING', status: room.status };
  }
  engine.startRound({ players: buildSeatPlayers(room) });
  room.status = 'playing';
  const version = (room.version || 0) + 1;
  await writeRoomState(db, roomId, room, engine, version);
  return { ok: true, roomId, version, status: room.status, settings: normalizeRoomSettings(room.settings), rematch: buildRematchState(room, OPENID) };
}

async function leaveRoom(event, ctx) {
  const { db, OPENID } = ctx;
  const roomId = event.roomId;
  const room = await getRoom(db, roomId);
  if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
  const now = Number(event.now) || Date.now();
  const engine = loadEngine(room.state || null);
  settleRoomStatus(room, engine);
  const expired = expireFinalRematchDecision(room, now);
  if (expired) {
    await db.collection(ROOMS).doc(roomId).set({
      data: documentData(Object.assign({}, room, {
        playerOpenids: roomPlayerOpenids(room),
        updatedAt: now,
      })),
    });
    return {
      ok: true,
      roomId,
      left: true,
      closed: true,
      status: room.status,
      version: room.version || 0,
      public: engine.state ? buildPublicState(engine.state) : null,
      animation: engine.state ? animationState(room, engine, OPENID) : null,
      rematch: buildRematchState(room, OPENID),
    };
  }
  if (room.status === 'closed') {
    return { ok: true, roomId, left: true, closed: true, status: room.status, version: room.version || 0, rematch: buildRematchState(room, OPENID) };
  }
  const seat = seatOfOpenid(room, OPENID);
  if (seat < 0) return { ok: false, error: 'NOT_IN_ROOM' };
  if (room.status === 'waiting') {
    const hostLeavingWaiting = room.hostOpenid === OPENID;
    if (hostLeavingWaiting) {
      closeRoom(room);
    } else {
      room.players = (room.players || []).filter((player) => player.openid !== OPENID);
      if (
        room.seatSwapRequest
        && (room.seatSwapRequest.fromOpenid === OPENID || room.seatSwapRequest.toOpenid === OPENID)
      ) {
        room.seatSwapRequest = null;
      }
      room.playerOpenids = roomPlayerOpenids(room);
    }
    await db.collection(ROOMS).doc(roomId).set({
      data: documentData(Object.assign({}, room, {
        playerOpenids: roomPlayerOpenids(room),
        updatedAt: now,
      })),
    });
    return {
      ok: true,
      roomId,
      left: true,
      closed: room.status === 'closed',
      status: room.status,
      seat,
      room: room.status === 'waiting' ? buildWaitingRoomSnapshot(room, OPENID) : null,
    };
  }
  if (room.status !== 'tableResult' && room.status !== 'closed') {
    return { ok: false, error: 'ROOM_NOT_FINISHED', status: room.status };
  }

  const hostLeaving = room.hostOpenid === OPENID;
  room.players = (room.players || []).filter((player) => player.openid !== OPENID);
  room.playerOpenids = roomPlayerOpenids(room);
  if (hostLeaving) {
    room.hostOpenid = room.players.length ? room.players[0].openid : '';
  }
  if (room.rematch && Array.isArray(room.rematch.agreedOpenids)) {
    room.rematch.agreedOpenids = room.rematch.agreedOpenids.filter((id) => id !== OPENID);
  }
  if (hostLeaving || humanPlayers(room).length < MIN_HUMANS) closeRoom(room);
  await db.collection(ROOMS).doc(roomId).set({
    data: documentData(Object.assign({}, room, {
      playerOpenids: roomPlayerOpenids(room),
      updatedAt: now,
    })),
  });
  return {
    ok: true,
    roomId,
    left: true,
    closed: room.status === 'closed',
    status: room.status,
    version: room.version || 0,
    public: engine.state ? buildPublicState(engine.state) : null,
    animation: engine.state ? animationState(room, engine, OPENID) : null,
    rematch: buildRematchState(room, OPENID),
  };
}

function resetRoundCounter(engine) {
  if (engine && engine.state) {
    engine.state.round = 0;
    engine.state.result = null;
    engine.state.publicEvent = null;
    engine.state.pendingContinuation = null;
  }
}

async function requestRematch(event, ctx) {
  const { db, OPENID } = ctx;
  const roomId = event.roomId;
  const room = await getRoom(db, roomId);
  if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
  const now = Number(event.now) || Date.now();
  const engine = loadEngine(room.state || null);
  settleRoomStatus(room, engine);
  const expired = expireFinalRematchDecision(room, now);
  if (expired) {
    await db.collection(ROOMS).doc(roomId).set({
      data: documentData(Object.assign({}, room, {
        playerOpenids: roomPlayerOpenids(room),
        settings: normalizeRoomSettings(room.settings),
        updatedAt: now,
      })),
    });
    return {
      ok: true,
      roomId,
      left: true,
      closed: true,
      status: room.status,
      version: room.version || 0,
      rematch: buildRematchState(room, OPENID),
      public: engine.state ? buildPublicState(engine.state) : null,
      private: { hand: [] },
      animation: engine.state ? animationState(room, engine, OPENID) : null,
    };
  }
  if (room.status !== 'tableResult') return { ok: false, error: 'ROOM_NOT_FINISHED', status: room.status };
  const seat = seatOfOpenid(room, OPENID);
  if (seat < 0) return { ok: false, error: 'NOT_IN_ROOM' };
  let players = humanPlayers(room);
  if (players.length < MIN_HUMANS) {
    return { ok: false, error: 'WAITING_FOR_PLAYERS', rematch: buildRematchState(room, OPENID) };
  }
  if (event.accept === false) {
    const hostDeclined = OPENID === room.hostOpenid;
    room.players = (room.players || []).filter((player) => player.openid !== OPENID);
    room.playerOpenids = roomPlayerOpenids(room);
    if (room.rematch && Array.isArray(room.rematch.agreedOpenids)) {
      room.rematch.agreedOpenids = room.rematch.agreedOpenids.filter((id) => id !== OPENID);
    }
    players = humanPlayers(room);
    if (hostDeclined || players.length < MIN_HUMANS) {
      closeRoom(room);
    } else if (room.rematch && room.rematch.status === 'pending') {
      const agreedAfterDecline = new Set(room.rematch.agreedOpenids || []);
      if (playerOpenids(players).every((id) => agreedAfterDecline.has(id))) {
        resetRoundCounter(engine);
        room.rematch = null;
        room.status = 'playing';
        engine.startRound({ players: buildSeatPlayers(room) });
        const startedVersion = (room.version || 0) + 1;
        await writeRoomState(db, roomId, room, engine, startedVersion);
        return {
          ok: true,
          roomId,
          version: startedVersion,
          left: true,
          declined: true,
          status: room.status,
          rematch: buildRematchState(room, OPENID),
        };
      }
    }
    const declinedVersion = (room.version || 0) + 1;
    room.version = declinedVersion;
    await db.collection(ROOMS).doc(roomId).set({
      data: documentData(Object.assign({}, room, {
        playerOpenids: roomPlayerOpenids(room),
        settings: normalizeRoomSettings(room.settings),
        updatedAt: now,
      })),
    });
    return {
      ok: true,
      roomId,
      version: declinedVersion,
      left: true,
      declined: true,
      closed: room.status === 'closed',
      status: room.status,
      rematch: buildRematchState(room, OPENID),
      public: engine.state ? buildPublicState(engine.state) : null,
      private: { hand: [] },
      animation: engine.state ? animationState(room, engine, OPENID) : null,
    };
  }
  if (!room.rematch || room.rematch.status === 'host-decision') {
    if (OPENID !== room.hostOpenid) {
      return { ok: false, error: 'NOT_HOST', rematch: buildRematchState(room, OPENID) };
    }
    room.rematch = {
      status: 'pending',
      requestedBy: OPENID,
      agreedOpenids: [OPENID],
      declinedOpenids: [],
      createdAt: now,
      deadlineAt: null,
    };
  } else if (room.rematch.agreedOpenids.indexOf(OPENID) < 0) {
    room.rematch.agreedOpenids.push(OPENID);
  }

  const requiredOpenids = playerOpenids(players);
  const agreed = new Set(room.rematch.agreedOpenids || []);
  const allAgreed = requiredOpenids.every((id) => agreed.has(id));
  if (allAgreed) {
    resetRoundCounter(engine);
    room.rematch = null;
    room.status = 'playing';
    engine.startRound({ players: buildSeatPlayers(room) });
    const version = (room.version || 0) + 1;
    const publicState = await writeRoomState(db, roomId, room, engine, version);
    return {
      ok: true,
      roomId,
      version,
      yourSeat: seat,
      status: room.status,
      settings: normalizeRoomSettings(room.settings),
      public: publicState,
      private: buildPrivateView(engine.state, seat),
      animation: animationState(room, engine, OPENID),
      rematch: buildRematchState(room, OPENID),
      rematchStarted: true,
    };
  }

  const version = (room.version || 0) + 1;
  room.version = version;
  await db.collection(ROOMS).doc(roomId).set({
    data: documentData(Object.assign({}, room, {
      playerOpenids: roomPlayerOpenids(room),
      settings: normalizeRoomSettings(room.settings),
      updatedAt: Date.now(),
    })),
  });
  return {
    ok: true,
    roomId,
    version,
    yourSeat: seat,
    status: room.status,
    settings: normalizeRoomSettings(room.settings),
    public: engine.state ? buildPublicState(engine.state) : null,
    private: engine.state ? buildPrivateView(engine.state, seat) : { hand: [] },
    animation: animationState(room, engine, OPENID),
    rematch: buildRematchState(room, OPENID),
    rematchStarted: false,
  };
}

// ===================== 操作裁决 =====================

/**
 * 提交游戏操作，服务端权威校验并推进状态机。
 *
 * event 结构：
 *   roomId   房间号
 *   version  客户端本地版本（乐观锁）
 *   kind     'discard' | 'response' | 'takeover'
 *   cardId   出牌时必填
 *   ref      响应时：{ index } 或 { type, key, meldId }
 *   accept   接庄时：boolean
 *
 * 错误码：ROOM_NOT_FOUND, ROOM_NOT_PLAYING, VERSION_STALE, NOT_IN_ROOM,
 *         NOT_YOUR_TURN, NO_STATE, UNKNOWN_OP_KIND, OP_REJECTED
 */
async function op(event, ctx) {
  const { db, OPENID } = ctx;
  const roomId = event.roomId;
  const room = await getRoom(db, roomId);
  if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
  if (room.status !== 'playing') return { ok: false, error: 'ROOM_NOT_PLAYING', status: room.status };

  if (typeof event.version === 'number' && event.version !== room.version) {
    if (event.kind === 'response') {
      logResponseFlowDebug('response-op-rejected-version', {
        roomId: roomId || roomDebugId(room),
        clientVersion: event.version,
        roomVersion: room.version,
        opRef: event.ref || null,
      });
    }
    return { ok: false, error: 'VERSION_STALE', version: room.version };
  }

  const seat = seatOfOpenid(room, OPENID);
  if (seat < 0) return { ok: false, error: 'NOT_IN_ROOM' };

  const engine = loadEngine(room.state || null);
  if (!engine.state) return { ok: false, error: 'NO_STATE' };
  const barrier = syncAnimationBarrier(room, engine);
  if (barrier) {
    logResponseFlowDebug('op-blocked-animation', Object.assign(animationBarrierDebug(room, engine, barrier), {
      opKind: event.kind || '',
      opSeat: seat,
      opRef: event.ref || null,
      clientVersion: event.version,
      roomVersion: room.version,
    }));
    return {
      ok: false,
      error: 'ANIMATION_PENDING',
      version: room.version,
      eventSeq: room.animationBarrier.eventSeq,
    };
  }
  const responseWindow = engine.state.responseWindow;
  const canRespondInWindow = event.kind === 'response'
    && responseWindow
    && responseWindow.decisions
    && responseWindow.decisions[seat]
    && responseWindow.decisions[seat].status === 'pending';
  if (event.kind === 'response') {
    logResponseFlowDebug('response-op-received', {
      roomId: roomId || roomDebugId(room),
      opSeat: seat,
      opRef: event.ref || null,
      clientVersion: event.version,
      roomVersion: room.version,
      canRespondInWindow: Boolean(canRespondInWindow),
      currentSeat: engine.state.currentSeat,
      phase: engine.state.phase,
      responseWindow: responseWindowDebug(responseWindow),
    });
  }
  if (!canRespondInWindow && engine.state.currentSeat !== seat) {
    if (event.kind === 'response') {
      logResponseFlowDebug('response-op-rejected-turn', {
        roomId: roomId || roomDebugId(room),
        opSeat: seat,
        currentSeat: engine.state.currentSeat,
        phase: engine.state.phase,
        responseWindow: responseWindowDebug(responseWindow),
      });
    }
    return {
      ok: false,
      error: 'NOT_YOUR_TURN',
      seat,
      currentSeat: engine.state.currentSeat,
      phase: engine.state.phase,
    };
  }

  let result;
  if (event.kind === 'discard') {
    result = engine.submitDiscard(seat, event.cardId);
  } else if (event.kind === 'response') {
    result = engine.submitResponse(seat, event.ref || {});
  } else if (event.kind === 'takeover') {
    result = engine.submitTakeover(seat, Boolean(event.accept));
  } else if (event.kind === 'dealerGift') {
    result = engine.submitDealerGift(seat, event.cardId);
  } else {
    return { ok: false, error: 'UNKNOWN_OP_KIND' };
  }

  if (!result || !result.ok) {
    if (event.kind === 'response') {
      logResponseFlowDebug('response-op-rejected-engine', {
        roomId: roomId || roomDebugId(room),
        opSeat: seat,
        opRef: event.ref || null,
        reason: result && result.reason,
        responseWindow: responseWindowDebug(engine.state.responseWindow),
      });
    }
    return { ok: false, error: 'OP_REJECTED', reason: result && result.reason, version: room.version };
  }
  if (event.kind === 'response') {
    logResponseFlowDebug('response-op-accepted', {
      roomId: roomId || roomDebugId(room),
      opSeat: seat,
      opRef: event.ref || null,
      nextVersion: (room.version || 0) + 1,
      responseWindow: responseWindowDebug(engine.state.responseWindow),
    });
  }

  settleRoomStatus(room, engine);
  const version = (room.version || 0) + 1;
  const publicState = await writeRoomState(db, roomId, room, engine, version);
  return {
    ok: true,
    roomId,
    version,
    yourSeat: seat,
    status: room.status,
    settings: normalizeRoomSettings(room.settings),
    rematch: buildRematchState(room, OPENID),
    public: publicState,
    private: buildPrivateView(engine.state, seat),
    privateViewsBySeat: buildPrivateViewsBySeat(engine.state),
    animation: animationState(room, engine, OPENID),
  };
}

/**
 * 拉取房间状态：公共视图 + 本人私密手牌。
 * 用于进入房间、断线重连、version 冲突后同步。
 *
 * 重连时会将本人标记为 online，若此前被托管则恢复 isHuman 并回写引擎状态。
 */
async function pull(event, ctx) {
  const { db, OPENID } = ctx;
  const roomId = event.roomId;
  const room = await getRoom(db, roomId);
  if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
  const seat = seatOfOpenid(room, OPENID);
  const engine = loadEngine(room.state || null);
  const now = Date.now();
  let shouldWriteState = false;
  if (seat >= 0) {
    const player = room.players.find((item) => item.openid === OPENID);
    const restored = player.online === false
      || Boolean(engine.state && engine.state.seats[seat] && !engine.state.seats[seat].isHuman);
    player.online = true;
    player.lastSeenAt = now;
    if (engine.state && engine.state.seats[seat]) {
      engine.state.seats[seat].isHuman = true;
      engine.state.seats[seat].online = true;
    }
    shouldWriteState = restored;
  }
  const advanced = advanceExpiredAnimationBarrier(room, engine, now);
  const version = advanced ? (room.version || 0) + 1 : (room.version || 0);
  let publicState = engine.state ? buildPublicState(engine.state) : null;
  if (advanced || shouldWriteState) {
    publicState = await writeRoomState(db, roomId, room, engine, version);
  } else if (seat >= 0) {
    await db.collection(ROOMS).doc(roomId).update({
      data: { players: room.players, updatedAt: now },
    });
  }
  return {
    ok: true,
    roomId,
    version,
    yourSeat: seat,
    status: room.status,
    settings: normalizeRoomSettings(room.settings),
    rematch: buildRematchState(room, OPENID),
    public: publicState,
    private: (engine.state && seat >= 0) ? buildPrivateView(engine.state, seat) : { hand: [] },
    animation: animationState(room, engine, OPENID),
  };
}

/**
 * 客户端完成当前公开动作动画后的幂等回执。最后一个必需回执会恢复一次服务端继续令牌。
 */
async function ackAnimation(event, ctx) {
  const { db, OPENID } = ctx;
  const room = await getRoom(db, event.roomId);
  if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
  if (seatOfOpenid(room, OPENID) < 0) return { ok: false, error: 'NOT_IN_ROOM' };
  const engine = loadEngine(room.state || null);
  animationMetrics(room).ackCallCount += 1;
  const barrier = syncAnimationBarrier(room, engine);
  if (!barrier) {
    logResponseFlowDebug('ack-animation-no-barrier', {
      roomId: event.roomId || roomDebugId(room),
      ackSeat: seatOfOpenid(room, OPENID),
      eventSeq: event.eventSeq,
      roomVersion: room.version || 0,
    });
    return { ok: true, version: room.version || 0, advanced: false, stale: true };
  }
  if (event.eventSeq !== barrier.eventSeq) {
    logResponseFlowDebug('ack-animation-stale', Object.assign(animationBarrierDebug(room, engine, barrier), {
      ackSeat: seatOfOpenid(room, OPENID),
      ackEventSeq: event.eventSeq,
      roomVersion: room.version || 0,
    }));
    return {
      ok: true,
      version: room.version || 0,
      advanced: false,
      stale: true,
      currentEventSeq: barrier.eventSeq,
    };
  }

  if ((barrier.requiredOpenids || []).indexOf(OPENID) >= 0 && (barrier.ackedOpenids || []).indexOf(OPENID) < 0) {
    barrier.ackedOpenids.push(OPENID);
  }
  logResponseFlowDebug('ack-animation-received', Object.assign(animationBarrierDebug(room, engine, barrier), {
    ackSeat: seatOfOpenid(room, OPENID),
    ackEventSeq: event.eventSeq,
    complete: barrierComplete(barrier),
  }));
  let advanced = false;
  if (!barrierComplete(barrier)) {
    await db.collection(ROOMS).doc(event.roomId).update({
      data: {
        animationBarrier: room.animationBarrier,
        animationMetrics: room.animationMetrics,
        updatedAt: Date.now(),
      },
    });
    return {
      ok: true,
      roomId: event.roomId,
      version: room.version || 0,
      yourSeat: seatOfOpenid(room, OPENID),
      status: room.status,
      settings: normalizeRoomSettings(room.settings),
      rematch: buildRematchState(room, OPENID),
      advanced,
      public: buildPublicState(engine.state),
      private: buildPrivateView(engine.state, seatOfOpenid(room, OPENID)),
      privateViewsBySeat: buildPrivateViewsBySeat(engine.state),
      animation: animationState(room, engine, OPENID),
    };
  }

  const duration = Math.max(0, Date.now() - (barrier.createdAt || Date.now()));
  room.animationMetrics.lastAckDurationMs = duration;
  room.animationMetrics.maxAckDurationMs = Math.max(room.animationMetrics.maxAckDurationMs || 0, duration);
  logResponseFlowDebug('ack-animation-resume', Object.assign(animationBarrierDebug(room, engine, barrier), {
    duration,
  }));
  engine.resumePublicEvent();
  room.animationBarrier = null;
  advanceUnobservedEvents(room, engine);
  advanced = true;
  if (engine.state && engine.state.phase === 'result' && !engine.state.publicEvent) settleRoomStatus(room, engine);
  const version = (room.version || 0) + 1;
  const publicState = await writeRoomState(db, event.roomId, room, engine, version);
  return {
    ok: true,
    roomId: event.roomId,
    version,
    yourSeat: seatOfOpenid(room, OPENID),
    status: room.status,
    settings: normalizeRoomSettings(room.settings),
    rematch: buildRematchState(room, OPENID),
    advanced,
    public: publicState,
    private: buildPrivateView(engine.state, seatOfOpenid(room, OPENID)),
    privateViewsBySeat: buildPrivateViewsBySeat(engine.state),
    animation: animationState(room, engine, OPENID),
  };
}

/**
 * 对超时掉线座位执行托管推进（由 heartbeat 调用）。
 *
 * 各 phase 处理策略：
 *   human-discard    → AI 代出牌
 *   human-response   → 自动 pass（可能触发进圈）
 *   takeover-choice  → 自动不接庄
 *   dealer-gift      → AI 自动选一张牌交给接庄者
 */
function advanceTimedOutSeat(engine, seat) {
  const state = engine.state;
  if (!state || state.currentSeat !== seat || state.phase === 'result') return false;
  state.seats[seat].online = false;
  state.seats[seat].isHuman = false;
  if (state.phase === 'human-discard') {
    engine.aiDiscard(seat);
    return true;
  }
  if (
    state.responseWindow
    && state.responseWindow.decisions
    && state.responseWindow.decisions[seat]
    && state.responseWindow.decisions[seat].status === 'pending'
  ) {
    engine.passResponse(seat);
    return true;
  }
  if (state.phase === 'takeover-choice') {
    const result = engine.submitTakeover(seat, chooseAcceptTakeover(state.seats[seat]));
    return Boolean(result && result.ok);
  }
  if (state.phase === 'dealer-gift') {
    const card = chooseDealerGift(state.seats[seat], engine.rules);
    if (!card) return false;
    const result = engine.submitDealerGift(seat, card.id);
    return Boolean(result && result.ok);
  }
  return false;
}

function advanceExpiredAnimationBarrier(room, engine, now = Date.now()) {
  let barrier = syncAnimationBarrier(room, engine, now);
  if (!barrier) return false;
  if (barrierComplete(barrier)) {
    logResponseFlowDebug('barrier-complete-resume', animationBarrierDebug(room, engine, barrier));
    engine.resumePublicEvent();
    room.animationBarrier = null;
    advanceUnobservedEvents(room, engine);
    return true;
  }
  if (now < barrier.deadlineAt) {
    const detail = animationBarrierDebug(room, engine, barrier);
    detail.remainingMs = barrier.deadlineAt - now;
    logResponseFlowDebug('barrier-waiting', detail);
    return false;
  }

  animationMetrics(room).timeoutCount += 1;
  logResponseFlowDebug('barrier-timeout', animationBarrierDebug(room, engine, barrier));
  const acked = new Set(barrier.ackedOpenids || []);
  (room.players || []).forEach((player) => {
    if ((barrier.requiredOpenids || []).indexOf(player.openid) < 0 || acked.has(player.openid)) return;
    player.online = false;
    if (engine.state && engine.state.seats[player.seat]) {
      engine.state.seats[player.seat].online = false;
    }
  });
  syncAnimationBarrier(room, engine, now);
  if (!barrierComplete(room.animationBarrier)) {
    logResponseFlowDebug('barrier-timeout-still-waiting', animationBarrierDebug(room, engine, room.animationBarrier));
    return false;
  }
  logResponseFlowDebug('barrier-timeout-resume', animationBarrierDebug(room, engine, room.animationBarrier));
  engine.resumePublicEvent();
  room.animationBarrier = null;
  advanceUnobservedEvents(room, engine);
  return true;
}

/**
 * 心跳：刷新本人 lastSeenAt；检测他人超时并触发托管。
 * @returns {{ ok, version, advanced }} advanced 表示是否因掉线推进了游戏
 */
async function heartbeat(event, ctx) {
  const { db, OPENID } = ctx;
  const room = await getRoom(db, event.roomId);
  if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
  if (seatOfOpenid(room, OPENID) < 0) return { ok: false, error: 'NOT_IN_ROOM' };
  const now = Date.now();
  const engine = loadEngine(room.state || null);
  let advanced = false;
  let barrier = syncAnimationBarrier(room, engine, now);
  (room.players || []).forEach((player) => {
    if (player.openid === OPENID) {
      player.online = true;
      player.lastSeenAt = now;
      return;
    }
    if (now - (player.lastSeenAt || room.createdAt || now) < PLAYER_TIMEOUT_MS) return;
    if (player.online !== false) {
      player.online = false;
      if (engine.state && engine.state.seats[player.seat]) {
        engine.state.seats[player.seat].online = false;
      }
    }
    if (!barrier) advanced = advanceTimedOutSeat(engine, player.seat) || advanced;
  });
  if (barrier) {
    advanced = advanceExpiredAnimationBarrier(room, engine, now) || advanced;
  }
  const version = advanced ? (room.version || 0) + 1 : (room.version || 0);
  if (advanced) {
    await writeRoomState(db, event.roomId, room, engine, version);
  } else {
    await db.collection(ROOMS).doc(event.roomId).update({
      data: { players: room.players, updatedAt: now },
    });
  }
  return { ok: true, version, advanced };
}

/**
 * WebSocket 连接状态同步：只更新在线/离线可见状态，不直接执行托管。
 */
async function setPlayerConnection(event, ctx) {
  const { db, OPENID } = ctx;
  const room = await getRoom(db, event.roomId);
  if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
  const seat = seatOfOpenid(room, OPENID);
  if (seat < 0) return { ok: false, error: 'NOT_IN_ROOM' };
  const now = Date.now();
  const online = event.online !== false;
  const player = (room.players || []).find((item) => item.openid === OPENID);
  if (player) {
    player.online = online;
    if (online) player.lastSeenAt = now;
  }
  const engine = loadEngine(room.state || null);
  if (engine.state && engine.state.seats && engine.state.seats[seat]) {
    engine.state.seats[seat].online = online;
  }
  let advanced = false;
  const barrier = syncAnimationBarrier(room, engine, now);
  if (!online && barrier && barrierComplete(barrier)) {
    engine.resumePublicEvent();
    room.animationBarrier = null;
    advanceUnobservedEvents(room, engine);
    advanced = true;
  }
  const version = advanced ? (room.version || 0) + 1 : (room.version || 0);
  if (engine.state) {
    const publicState = await writeRoomState(db, event.roomId, room, engine, version);
    return {
      ok: true,
      roomId: event.roomId,
      version,
      advanced,
      yourSeat: seat,
      status: room.status,
      settings: normalizeRoomSettings(room.settings),
      rematch: buildRematchState(room, OPENID),
      public: publicState,
      private: buildPrivateView(engine.state, seat),
      animation: animationState(room, engine, OPENID),
    };
  }
  await db.collection(ROOMS).doc(event.roomId).update({
    data: { players: room.players, updatedAt: now },
  });
  return {
    ok: true,
    roomId: event.roomId,
    version,
    advanced,
    yourSeat: seat,
    status: room.status,
    settings: normalizeRoomSettings(room.settings),
    rematch: buildRematchState(room, OPENID),
    room: buildWaitingRoomSnapshot(room, OPENID),
  };
}

module.exports = {
  documentData,
  normalizeMaxRounds,
  normalizeRoomSettings,
  activeRoom,
  quickMatch,
  cancelMatch,
  matchStatus,
  createRoom,
  joinRoom,
  roomInfo,
  setReady,
  requestSeatSwap,
  respondSeatSwap,
  startRound,
  leaveRoom,
  requestRematch,
  op,
  pull,
  heartbeat,
  setPlayerConnection,
  ackAnimation,
  advanceTimedOutSeat,
  animationState,
  barrierComplete,
  syncAnimationBarrier,
};
