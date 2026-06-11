const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 服务端权威逻辑核心（由客户端 js/game 移植为 CommonJS）。
const rules = require('./core/rules');
const cards = require('./core/cards');
const evaluator = require('./core/evaluator');
const ai = require('./core/ai');
const room = require('./room');

/**
 * 各业务动作处理器。
 * 约定：每个 handler 接收 (event, ctx)，返回可序列化对象。
 * ctx = { OPENID, db, _ }
 */
const handlers = {
  ping: async (event, ctx) => ({ ok: true, pong: true, openid: ctx.OPENID }),

  // 自检：用核心逻辑发一手牌，验证云函数已正确加载移植后的引擎核心。
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
  createRoom: room.createRoom,
  joinRoom: room.joinRoom,
  startRound: room.startRound,
  op: room.op,
  pull: room.pull,
  heartbeat: room.heartbeat,
};

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { ok: false, error: 'NO_OPENID' };
  }

  const action = event.action;
  const handler = handlers[action];
  if (!handler) {
    return { ok: false, error: 'UNKNOWN_ACTION', action };
  }

  const ctx = {
    OPENID,
    db: cloud.database(),
    _: cloud.database().command,
    core: { rules, cards, evaluator, ai },
  };

  try {
    return await handler(event, ctx);
  } catch (err) {
    return { ok: false, error: 'HANDLER_ERROR', message: err && err.message };
  }
};
