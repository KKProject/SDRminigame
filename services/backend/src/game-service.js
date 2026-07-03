const room = require('./game/room');
const rules = require('./game/core/rules');
const cards = require('./game/core/cards');
const evaluator = require('./game/core/evaluator');
const ai = require('./game/core/ai');

const handlers = {
  ping: async (event, ctx) => ({ ok: true, pong: true, openid: ctx.OPENID }),
  dealPreview: async (event) => {
    const deck = cards.shuffleDeck(cards.createDeck(rules.DEFAULT_RULES), event && event.seed);
    const opening = evaluator.dealOpeningHands(deck, 0, rules.DEFAULT_RULES);
    return {
      ok: true,
      handSizes: opening.hands.map((hand) => hand.length),
      jiangCard: opening.jiangCard ? opening.jiangCard.text : null,
      remaining: opening.deck.length,
    };
  },
  quickMatch: room.quickMatch,
  cancelMatch: room.cancelMatch,
  matchStatus: room.matchStatus,
  activeRoom: room.activeRoom,
  createRoom: room.createRoom,
  joinRoom: room.joinRoom,
  roomInfo: room.roomInfo,
  setReady: room.setReady,
  requestSeatSwap: room.requestSeatSwap,
  respondSeatSwap: room.respondSeatSwap,
  startRound: room.startRound,
  leaveRoom: room.leaveRoom,
  requestRematch: room.requestRematch,
  op: room.op,
  pull: room.pull,
  heartbeat: room.heartbeat,
  setConnection: room.setPlayerConnection,
  ackAnimation: room.ackAnimation,
};

class LocalGameService {
  constructor({ db } = {}) {
    this.db = db;
  }

  async callAction(action, openid, payload = {}) {
    const handler = handlers[action];
    if (!handler) return { ok: false, error: 'UNKNOWN_ACTION', action };
    const ctx = {
      OPENID: openid,
      db: this.db,
      _: this.db && this.db.command ? this.db.command : {},
      core: { rules, cards, evaluator, ai },
    };
    try {
      return await handler(Object.assign({}, payload, { action }), ctx);
    } catch (err) {
      return { ok: false, error: 'HANDLER_ERROR', message: err && err.message };
    }
  }

  pull(openid, roomId) {
    return this.callAction('pull', openid, { roomId });
  }

  heartbeat(openid, roomId) {
    return this.callAction('heartbeat', openid, { roomId });
  }

  setConnection(openid, roomId, online) {
    return this.callAction('setConnection', openid, { roomId, online });
  }

  op(openid, request) {
    return this.callAction('op', openid, Object.assign({
      roomId: request.roomId,
      version: request.version,
    }, request.payload || {}));
  }

  ackAnimation(openid, request) {
    return this.callAction('ackAnimation', openid, {
      roomId: request.roomId,
      eventSeq: request.eventSeq || (request.payload && request.payload.eventSeq),
    });
  }

  setReady(openid, request) {
    return this.callAction('setReady', openid, {
      roomId: request.roomId,
      ready: request.payload ? request.payload.ready : undefined,
    });
  }

  requestSeatSwap(openid, request) {
    return this.callAction('requestSeatSwap', openid, {
      roomId: request.roomId,
      targetSeat: request.payload ? request.payload.targetSeat : request.targetSeat,
    });
  }

  respondSeatSwap(openid, request) {
    return this.callAction('respondSeatSwap', openid, {
      roomId: request.roomId,
      requestId: request.payload ? request.payload.requestId : request.requestId,
      accept: request.payload ? request.payload.accept : request.accept,
    });
  }

  startRound(openid, request) {
    return this.callAction('startRound', openid, { roomId: request.roomId });
  }

  leaveRoom(openid, request) {
    return this.callAction('leaveRoom', openid, { roomId: request.roomId });
  }

  requestRematch(openid, request) {
    return this.callAction('requestRematch', openid, {
      roomId: request.roomId,
      accept: request.payload ? request.payload.accept : request.accept,
    });
  }
}

module.exports = {
  LocalGameService,
  handlers,
};
