const { HuapaiEngine, buildPublicState, buildPrivateView } = require('./core/engine');
const { DEFAULT_RULES } = require('./core/rules');

const SEAT_COUNT = DEFAULT_RULES.seatCount;
const MIN_HUMANS = 2; // 快速匹配最少真人数，其余座位由 AI 补位

const ROOMS = 'rooms';          // 权威全量状态（含手牌），仅云函数可读写
const ROOM_STATES = 'roomStates'; // 公共状态，客户端可 watch
const QUEUE = 'matchQueue';
const PLAYER_TIMEOUT_MS = 60000;

function documentData(value) {
  const data = Object.assign({}, value);
  delete data._id;
  return data;
}

function genRoomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// 持久化时剥离庞大的 rules，读取时再挂载，减小文档体积。
function stripState(state) {
  if (!state) return null;
  return Object.assign({}, state, { rules: undefined });
}

function loadEngine(state) {
  const engine = new HuapaiEngine(DEFAULT_RULES);
  if (state) {
    state.rules = DEFAULT_RULES;
    engine.load(state);
  }
  return engine;
}

function seatOfOpenid(room, openid) {
  const player = (room.players || []).find((p) => p.openid === openid);
  return player ? player.seat : -1;
}

// 把 room.players（真人）补足 AI 到满座，生成开局所需 players 数组。
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

async function writeRoomState(db, roomId, room, engine, version) {
  const publicState = buildPublicState(engine.state);
  // CloudBase update 会递归合并嵌套对象；当旧值为 null、新值为对象时会报
  // “Cannot create field ... in element ... null”。权威状态每次都应完整替换。
  await db.collection(ROOMS).doc(roomId).set({
    data: documentData(Object.assign({}, room, {
      status: room.status,
      version,
      state: stripState(engine.state),
      players: room.players,
      updatedAt: Date.now(),
    })),
  });
  // 公共状态用独立集合，便于客户端 watch，且不含手牌。
  await db.collection(ROOM_STATES).doc(roomId).set({
    data: {
      version,
      public: publicState,
      updatedAt: Date.now(),
    },
  });
  return publicState;
}

async function getRoom(db, roomId) {
  try {
    const snap = await db.collection(ROOMS).doc(roomId).get();
    return snap.data;
  } catch (err) {
    return null;
  }
}

// ===== 匹配 =====

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

  // 尝试撮合：取最早等待的若干人
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
    await db.collection(ROOMS).doc(roomId).set({
      data: documentData(Object.assign({}, room, { state: stripState(engine.state) })),
    });
    await db.collection(ROOM_STATES).doc(roomId).set({
      data: { version: 0, public: buildPublicState(engine.state), updatedAt: Date.now() },
    });
    // 标记这些人已匹配
    for (const p of players) {
      await db.collection(QUEUE).doc(p.openid).update({ data: { status: 'matched', roomId, seat: p.seat } });
    }
    const mine = players.find((p) => p.openid === OPENID);
    return { ok: true, status: 'matched', roomId, seat: mine ? mine.seat : -1 };
  }

  return { ok: true, status: 'waiting' };
}

async function cancelMatch(event, ctx) {
  const { db, OPENID } = ctx;
  try {
    const snap = await db.collection(QUEUE).doc(OPENID).get();
    if (snap.data && snap.data.status === 'waiting') {
      await db.collection(QUEUE).doc(OPENID).remove();
    }
  } catch (err) { /* 不存在则忽略 */ }
  return { ok: true };
}

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

// ===== 好友房间 =====

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

// 房主开局（空座由 AI 补位）。
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

// ===== 操作裁决 =====

async function op(event, ctx) {
  const { db, OPENID } = ctx;
  const roomId = event.roomId;
  const room = await getRoom(db, roomId);
  if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
  if (room.status !== 'playing') return { ok: false, error: 'ROOM_NOT_PLAYING', status: room.status };

  // 并发一致性：客户端须带上它看到的 version。
  if (typeof event.version === 'number' && event.version !== room.version) {
    return { ok: false, error: 'VERSION_STALE', version: room.version };
  }

  const seat = seatOfOpenid(room, OPENID);
  if (seat < 0) return { ok: false, error: 'NOT_IN_ROOM' };

  const engine = loadEngine(room.state || null);
  if (!engine.state) return { ok: false, error: 'NO_STATE' };
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
  } else {
    return { ok: false, error: 'UNKNOWN_OP_KIND' };
  }

  if (!result || !result.ok) {
    // 非法操作：不推进、不增版本，返回拒绝原因。
    return { ok: false, error: 'OP_REJECTED', reason: result && result.reason, version: room.version };
  }

  if (engine.state.phase === 'result') {
    room.status = 'finished';
  }
  const version = (room.version || 0) + 1;
  await writeRoomState(db, roomId, room, engine, version);
  return { ok: true, version };
}

// 拉取：公共状态 + 本人私密手牌（断线重连用）。
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
  };
}

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
  return false;
}

async function heartbeat(event, ctx) {
  const { db, OPENID } = ctx;
  const room = await getRoom(db, event.roomId);
  if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
  if (seatOfOpenid(room, OPENID) < 0) return { ok: false, error: 'NOT_IN_ROOM' };
  const now = Date.now();
  const engine = loadEngine(room.state || null);
  let advanced = false;
  (room.players || []).forEach((player) => {
    if (player.openid === OPENID) {
      player.online = true;
      player.lastSeenAt = now;
      return;
    }
    if (player.online !== false && now - (player.lastSeenAt || room.createdAt || now) >= PLAYER_TIMEOUT_MS) {
      player.online = false;
      advanced = advanceTimedOutSeat(engine, player.seat) || advanced;
    }
  });
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
  advanceTimedOutSeat,
};
