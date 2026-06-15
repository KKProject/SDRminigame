/**
 * 花牌云函数入口（index.js）
 *
 * 职责：接收客户端 `wx.cloud.callFunction({ name: 'game', data: { action, ... } })` 请求，
 * 按 action 路由到对应 handler，统一注入微信上下文与数据库句柄。
 *
 * 架构分层：
 *   index.js  → 路由与错误兜底
 *   room.js   → 匹配、房间 CRUD、操作裁决、心跳与掉线托管
 *   core/*    → 纯逻辑引擎（无 IO），从客户端 js/game 移植为 CommonJS
 *
 * 所有对局状态以云数据库 `rooms` 集合为权威源；客户端通过 `roomStates` 集合 watch 公共视图。
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const rules = require('./core/rules');
const cards = require('./core/cards');
const evaluator = require('./core/evaluator');
const ai = require('./core/ai');
const room = require('./room');

/**
 * 各业务动作处理器表。
 *
 * 约定：
 *   - 每个 handler 签名：async (event, ctx) => serializableObject
 *   - ctx = { OPENID, db, _, core }
 *   - 成功返回 { ok: true, ... }；失败返回 { ok: false, error: 'CODE', ... }
 *
 * action 一览：
 *   ping          健康检查
 *   dealPreview   发牌预览（开发自检）
 *   quickMatch    快速匹配入队/撮合
 *   cancelMatch   取消匹配
 *   matchStatus   查询匹配状态
 *   createRoom    创建好友房
 *   joinRoom      加入好友房
 *   startRound    房主开局
 *   op            提交游戏操作（出牌/响应/接庄）
 *   pull          拉取全量状态（断线重连）
 *   heartbeat     心跳 + 掉线检测
 *   ackAnimation  当前公开动作动画完成回执
 */
const handlers = {
  /** 连通性探测，返回当前用户 openid */
  ping: async (event, ctx) => ({ ok: true, pong: true, openid: ctx.OPENID }),

  /**
   * 开发自检：用核心逻辑模拟一手发牌。
   * event.seed 可选，用于复现洗牌结果。
   */
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

  // 房间与对局相关 handler 均委托给 room.js
  quickMatch: room.quickMatch,
  cancelMatch: room.cancelMatch,
  matchStatus: room.matchStatus,
  createRoom: room.createRoom,
  joinRoom: room.joinRoom,
  startRound: room.startRound,
  op: room.op,
  pull: room.pull,
  heartbeat: room.heartbeat,
  ackAnimation: room.ackAnimation,
};

/**
 * 云函数主入口。
 * @param {object} event - 客户端传入参数，必须含 action 字段
 * @returns {Promise<object>} 可 JSON 序列化的响应
 */
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

  // 注入上下文：openid、数据库、查询命令符、核心逻辑模块（供 room 内部按需使用）
  const ctx = {
    OPENID,
    db: cloud.database(),
    _: cloud.database().command,
    core: { rules, cards, evaluator, ai },
  };

  try {
    return await handler(event, ctx);
  } catch (err) {
    // 兜底：避免未捕获异常导致云函数 500，将错误信息返回客户端
    return { ok: false, error: 'HANDLER_ERROR', message: err && err.message };
  }
};
