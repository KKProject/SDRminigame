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
 *   rooms       权威全量状态（含手牌），仅云函数可读写
 *   roomStates  脱敏公共状态，客户端可 watch（无手牌明细）
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
const { DEFAULT_RULES } = require('./core/rules');

/** 固定 4 人桌，取自规则配置 */
const SEAT_COUNT = DEFAULT_RULES.seatCount;
/** 快速匹配最少真人数；不足 4 人时由 AI 补位 */
const MIN_HUMANS = 2;

const ROOMS = 'rooms';
const ROOM_STATES = 'roomStates';
const QUEUE = 'matchQueue';
/** 玩家超过此毫秒未心跳则视为掉线 */
const PLAYER_TIMEOUT_MS = 60000;
/** 单个公开动作等待客户端动画回执的最长时间 */
const ANIMATION_ACK_TIMEOUT_MS = 12000;

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

function requiredAnimationOpenids(room) {
  return (room.players || [])
    .filter((player) => player.online !== false)
    .map((player) => player.openid)
    .filter(Boolean);
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
    const online = new Set(requiredAnimationOpenids(room));
    current.requiredOpenids = (current.requiredOpenids || []).filter((openid) => online.has(openid));
    current.ackedOpenids = (current.ackedOpenids || []).filter((openid) => current.requiredOpenids.indexOf(openid) >= 0);
    return current;
  }
  room.animationBarrier = {
    eventSeq: event.eventSeq,
    requiredOpenids: requiredAnimationOpenids(room),
    ackedOpenids: [],
    createdAt: now,
    deadlineAt: now + ANIMATION_ACK_TIMEOUT_MS,
  };
  animationMetrics(room).eventCount += 1;
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
  return {
    currentEvent: engine.state ? serializePublicEvent(engine.state.publicEvent) : null,
    latestEventSeq: engine.state && typeof engine.state.eventSeq === 'number' ? engine.state.eventSeq : 0,
    requiredSeats: barrier ? (barrier.requiredOpenids || []).map((id) => seatByOpenid[id]).filter((seat) => typeof seat === 'number') : [],
    ackedSeats: barrier ? (barrier.ackedOpenids || []).map((id) => seatByOpenid[id]).filter((seat) => typeof seat === 'number') : [],
    deadlineAt: barrier ? barrier.deadlineAt : null,
    selfAcked: Boolean(openid && barrier && (barrier.ackedOpenids || []).indexOf(openid) >= 0),
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
  animationMetrics(room).stateWriteCount += 1;
  const publicState = buildPublicState(engine.state);
  const animation = animationState(room, engine);
  await db.collection(ROOMS).doc(roomId).set({
    data: documentData(Object.assign({}, room, {
      status: room.status,
      version,
      state: stripState(engine.state),
      players: room.players,
      updatedAt: Date.now(),
    })),
  });
  await db.collection(ROOM_STATES).doc(roomId).set({
    data: {
      version,
      public: publicState,
      animation,
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
      lastSeenAt: Date.now(),
    }));
    const room = {
      _id: roomId,
      status: 'playing',
      seatCount: SEAT_COUNT,
      players,
      hostOpenid: players[0].openid,
      version: 0,
      createdAt: Date.now(),
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
  const { db, OPENID } = ctx;
  const profile = event.profile || {};
  const roomId = genRoomCode();
  const room = {
    _id: roomId,
    status: 'waiting',
    seatCount: SEAT_COUNT,
    players: [{
      seat: 0,
      openid: OPENID,
      nickName: profile.nickName || '玩家',
      avatarUrl: profile.avatarUrl || '',
      isHuman: true,
      online: true,
      lastSeenAt: Date.now(),
    }],
    hostOpenid: OPENID,
    version: 0,
    createdAt: Date.now(),
  };
  await db.collection(ROOMS).doc(roomId).set({ data: documentData(room) });
  return { ok: true, roomId, seat: 0 };
}

/**
 * 加入好友房：分配最小可用座位号。
 * 已在房间内则幂等返回原座位。
 */
async function joinRoom(event, ctx) {
  const { db, OPENID } = ctx;
  const roomId = event.roomId;
  const profile = event.profile || {};
  const room = await getRoom(db, roomId);
  if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
  if (room.status !== 'waiting') return { ok: false, error: 'ROOM_NOT_JOINABLE' };

  const existing = seatOfOpenid(room, OPENID);
  if (existing >= 0) return { ok: true, roomId, seat: existing, players: room.players };

  if ((room.players || []).length >= SEAT_COUNT) return { ok: false, error: 'ROOM_FULL' };

  const used = new Set((room.players || []).map((p) => p.seat));
  let seat = 0;
  while (used.has(seat)) seat++;
  const player = {
    seat,
    openid: OPENID,
    nickName: profile.nickName || '玩家',
    avatarUrl: profile.avatarUrl || '',
    isHuman: true,
    online: true,
    lastSeenAt: Date.now(),
  };
  await db.collection(ROOMS).doc(roomId).update({ data: { players: room.players.concat([player]) } });
  return { ok: true, roomId, seat, players: room.players.concat([player]) };
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
  engine.startRound({ players: buildSeatPlayers(room) });
  room.status = 'playing';
  const version = (room.version || 0) + 1;
  await writeRoomState(db, roomId, room, engine, version);
  return { ok: true, roomId, version };
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
    return { ok: false, error: 'VERSION_STALE', version: room.version };
  }

  const seat = seatOfOpenid(room, OPENID);
  if (seat < 0) return { ok: false, error: 'NOT_IN_ROOM' };

  const engine = loadEngine(room.state || null);
  if (!engine.state) return { ok: false, error: 'NO_STATE' };
  if (syncAnimationBarrier(room, engine)) {
    return {
      ok: false,
      error: 'ANIMATION_PENDING',
      version: room.version,
      eventSeq: room.animationBarrier.eventSeq,
    };
  }
  if (engine.state.currentSeat !== seat) {
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
    return { ok: false, error: 'OP_REJECTED', reason: result && result.reason, version: room.version };
  }

  if (engine.state.phase === 'result') {
    room.status = 'finished';
  }
  const version = (room.version || 0) + 1;
  const publicState = await writeRoomState(db, roomId, room, engine, version);
  return {
    ok: true,
    roomId,
    version,
    yourSeat: seat,
    status: room.status,
    public: publicState,
    private: buildPrivateView(engine.state, seat),
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
  if (seat >= 0) {
    const player = room.players.find((item) => item.openid === OPENID);
    const restored = player.online === false
      || Boolean(engine.state && engine.state.seats[seat] && !engine.state.seats[seat].isHuman);
    player.online = true;
    player.lastSeenAt = Date.now();
    if (engine.state && engine.state.seats[seat]) {
      engine.state.seats[seat].isHuman = true;
      engine.state.seats[seat].online = true;
    }
    if (restored) {
      await writeRoomState(db, roomId, room, engine, room.version || 0);
    } else {
      await db.collection(ROOMS).doc(roomId).update({
        data: { players: room.players, updatedAt: Date.now() },
      });
    }
  }
  return {
    ok: true,
    roomId,
    version: room.version || 0,
    yourSeat: seat,
    status: room.status,
    public: engine.state ? buildPublicState(engine.state) : null,
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
    return { ok: true, version: room.version || 0, advanced: false, stale: true };
  }
  if (event.eventSeq !== barrier.eventSeq) {
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
  let advanced = false;
  if (barrierComplete(barrier)) {
    const duration = Math.max(0, Date.now() - (barrier.createdAt || Date.now()));
    room.animationMetrics.lastAckDurationMs = duration;
    room.animationMetrics.maxAckDurationMs = Math.max(room.animationMetrics.maxAckDurationMs || 0, duration);
    engine.resumePublicEvent();
    room.animationBarrier = null;
    advanceUnobservedEvents(room, engine);
    advanced = true;
  }
  if (engine.state && engine.state.phase === 'result' && !engine.state.publicEvent) room.status = 'finished';
  const version = (room.version || 0) + 1;
  const publicState = await writeRoomState(db, event.roomId, room, engine, version);
  return {
    ok: true,
    roomId: event.roomId,
    version,
    yourSeat: seatOfOpenid(room, OPENID),
    status: room.status,
    advanced,
    public: publicState,
    private: buildPrivateView(engine.state, seatOfOpenid(room, OPENID)),
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
  state.seats[seat].isHuman = false;
  state.seats[seat].online = false;
  if (state.phase === 'human-discard') {
    engine.enterDiscardPhase(seat, `${state.seats[seat].nickName}掉线，托管出牌`);
    return true;
  }
  if (state.phase === 'human-response') {
    const source = state.appearingCard
      ? state.appearingCard.sourceSeat
      : (state.recentDiscard ? state.recentDiscard.seat : seat);
    engine.handleResponseWindow(state.pendingActions || [], source);
    return true;
  }
  if (state.phase === 'takeover-choice') {
    engine.submitTakeover(seat, false);
    return true;
  }
  if (state.phase === 'dealer-gift') {
    // 座位已标记为非真人，重新进入选牌阶段即走 AI 自动选牌分支
    engine.enterDealerGiftPhase(seat, state.takeoverDealer);
    return true;
  }
  return false;
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
  const barrier = syncAnimationBarrier(room, engine, now);
  (room.players || []).forEach((player) => {
    if (player.openid === OPENID) {
      player.online = true;
      player.lastSeenAt = now;
      return;
    }
    if (player.online !== false && now - (player.lastSeenAt || room.createdAt || now) >= PLAYER_TIMEOUT_MS) {
      player.online = false;
      if (engine.state && engine.state.seats[player.seat]) {
        engine.state.seats[player.seat].online = false;
        engine.state.seats[player.seat].isHuman = false;
      }
      if (!barrier) advanced = advanceTimedOutSeat(engine, player.seat) || advanced;
    }
  });
  if (barrier && now >= barrier.deadlineAt) {
    animationMetrics(room).timeoutCount += 1;
    const acked = new Set(barrier.ackedOpenids || []);
    (room.players || []).forEach((player) => {
      if ((barrier.requiredOpenids || []).indexOf(player.openid) < 0 || acked.has(player.openid)) return;
      player.online = false;
      if (engine.state && engine.state.seats[player.seat]) {
        engine.state.seats[player.seat].online = false;
        engine.state.seats[player.seat].isHuman = false;
      }
    });
    syncAnimationBarrier(room, engine, now);
    if (barrierComplete(room.animationBarrier)) {
      engine.resumePublicEvent();
      room.animationBarrier = null;
      advanceUnobservedEvents(room, engine);
      advanced = true;
    }
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

module.exports = {
  documentData,
  quickMatch,
  cancelMatch,
  matchStatus,
  createRoom,
  joinRoom,
  startRound,
  op,
  pull,
  heartbeat,
  ackAnimation,
  advanceTimedOutSeat,
  animationState,
  barrierComplete,
  syncAnimationBarrier,
};
