/**
 * AI 决策模块（ai.js）
 *
 * 云端 AI 在 engine 中同步调用（无 setTimeout 延迟）。
 * 策略为启发式规则，非最优博弈：
 *   - 出牌：保留搭子潜力高的牌，打出 keepScore 最低的合法牌
 *   - 响应：优先无进圈风险的动作，forced 动作兜底
 *   - 接庄：手牌中至少 2 种刻子才接
 *
 * 依赖 evaluator.isLegalDiscard 保证出牌合法性。
 */
const { DEFAULT_RULES, getPhraseKeysForKey } = require('./rules');
const { countByKey } = require('./cards');
const { isLegalDiscard } = require('./evaluator');

/**
 * 评估一张牌「保留价值」：同 key 数量越多、同句关联越多、句首字越高分。
 * 出牌时选 keepScore 最小者（最不值得留）。
 */
function cardKeepScore(card, counts, rules) {
  let score = 0;
  const sameCount = counts[card.key] || 0;
  if (sameCount >= 2) score += sameCount * 5;
  if (sameCount >= 3) score += 8;

  const phraseKeys = getPhraseKeysForKey(card.key, rules);
  score += phraseKeys
    .filter((key) => key !== card.key)
    .reduce((total, key) => total + (counts[key] || 0), 0) * 3;

  score += 8 - (card.position || 0);
  return score;
}

/**
 * 选择要打出的牌。
 * @param {object} seat - 含 hand、history 的座位对象
 * @returns {object|null} 要打出的 card，无牌可打返回 null
 */
function chooseDiscard(seat, rules = DEFAULT_RULES) {
  const hand = seat.hand || seat;
  const counts = countByKey(hand);
  const legal = hand.filter((card) => isLegalDiscard(seat.hand ? seat : { hand, history: { discardPhraseCounts: {} } }, card, rules).legal);
  if (!legal.length) return null;
  return legal.slice().sort((a, b) => {
    const aScore = cardKeepScore(a, counts, rules);
    const bScore = cardKeepScore(b, counts, rules);
    if (aScore !== bScore) return aScore - bScore;
    if (a.order !== b.order) return a.order - b.order;
    return a.copy - b.copy;
  })[0];
}

/**
 * 从可用响应动作中选一个。
 * 优先 circleLossRisk=false；若无则仅考虑 forced 动作。
 * 排序：priority 高 > forced > responseIndex 小 > seat 小
 */
function chooseResponse(actions) {
  if (!actions.length) return null;
  const safeActions = actions.filter((action) => !action.circleLossRisk);
  const candidates = safeActions.length ? safeActions : actions.filter((action) => action.forced);
  if (!candidates.length) return null;
  return candidates.slice().sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (a.forced !== b.forced) return a.forced ? -1 : 1;
    if ((a.responseIndex || 0) !== (b.responseIndex || 0)) return (a.responseIndex || 0) - (b.responseIndex || 0);
    return a.seat - b.seat;
  })[0];
}

/** 自摸响应与通用响应策略相同 */
function chooseSelfDrawAction(actions) {
  return chooseResponse(actions);
}

/**
 * 滑庄被接庄后，原庄家选一张「不要的牌」交给接庄者。
 * 不受出牌合法性限制（可送任意牌），直接选保留价值最低者。
 */
function chooseDealerGift(seat, rules = DEFAULT_RULES) {
  const hand = seat.hand || seat;
  if (!hand.length) return null;
  const counts = countByKey(hand);
  return hand.slice().sort((a, b) => {
    const aScore = cardKeepScore(a, counts, rules);
    const bScore = cardKeepScore(b, counts, rules);
    if (aScore !== bScore) return aScore - bScore;
    if (a.order !== b.order) return a.order - b.order;
    return a.copy - b.copy;
  })[0];
}

/**
 * 滑庄接庄决策：手牌中刻子种类 >= 2 才接。
 * 接庄后须在 3 次凑牌内听牌，否则进圈。
 */
function chooseAcceptTakeover(seat) {
  const triplets = Object.keys(countByKey(seat.hand)).filter((key) => countByKey(seat.hand)[key] >= 3);
  return triplets.length >= 2;
}

module.exports = {
  chooseDiscard,
  chooseResponse,
  chooseSelfDrawAction,
  chooseDealerGift,
  chooseAcceptTakeover,
};
