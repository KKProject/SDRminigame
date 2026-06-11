/**
 * 牌面数据结构与基础操作（cards.js）
 *
 * 职责：
 *   - 根据规则生成整副牌、洗牌
 *   - 手牌排序、按 key/phrase 计数
 *   - 从手牌中移除指定牌
 *   - 创建座位、出现牌、历史记录等状态工厂函数
 *
 * 牌对象字段说明：
 *   id          唯一标识，格式 `${key}-${copyIndex}`
 *   key         字符逻辑键（如 shang, da, ren）
 *   text        显示汉字（上、大、人）
 *   phraseId    所属句子 ID（如 sdr = 上大人）
 *   phraseText  整句文本
 *   phraseIndex 句子在 PHRASES 中的序号
 *   position    字在句中位置 0/1/2（影响颜色与计福）
 *   order       全局排序权重
 *   color       位置对应颜色
 *   copy        同字符第几张（0~5）
 */
const { DEFAULT_RULES, createSymbolMap } = require('./rules');

/**
 * 线性同余伪随机数生成器，支持 seed 复现洗牌结果（调试用）。
 * @param {number} [seed] - 不传则用 Date.now()
 * @returns {() => number} 返回 [0, 1) 随机数
 */
function seededRandom(seed) {
  let value = seed || Date.now();
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

/**
 * 根据规则生成整副牌。
 * 每种字符 copiesPerSymbol 张（默认 6），共 8 句 × 3 字 × 6 = 144 张。
 */
function createDeck(rules = DEFAULT_RULES) {
  const deck = [];
  rules.cardSymbols.forEach((symbol) => {
    for (let copy = 0; copy < rules.copiesPerSymbol; copy++) {
      deck.push({
        id: `${symbol.key}-${copy}`,
        key: symbol.key,
        text: symbol.text,
        phraseId: symbol.phraseId,
        phraseText: symbol.phraseText,
        phraseIndex: symbol.phraseIndex,
        position: symbol.position,
        group: symbol.phraseId,
        order: symbol.order,
        color: symbol.color,
        copy,
      });
    }
  });
  return deck;
}

/** Fisher-Yates 洗牌，可选 seed 保证可复现 */
function shuffleDeck(deck, seed) {
  const random = seededRandom(seed);
  const shuffled = deck.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }
  return shuffled;
}

/** 按 order（句子顺序 + 字位）及 copy 排序，用于展示与凑牌后整理 */
function sortCards(cards, rules = DEFAULT_RULES) {
  const symbols = createSymbolMap(rules);
  return cards.slice().sort((a, b) => {
    const aSymbol = symbols[a.key] || a;
    const bSymbol = symbols[b.key] || b;
    if (aSymbol.order !== bSymbol.order) {
      return aSymbol.order - bSymbol.order;
    }
    return a.copy - b.copy;
  });
}

/** 统计手牌中各 key 出现次数，返回 { [key]: count } */
function countByKey(cards) {
  return cards.reduce((counts, card) => {
    counts[card.key] = (counts[card.key] || 0) + 1;
    return counts;
  }, {});
}

/** 统计手牌中各句子 phraseId 出现次数 */
function countByPhrase(cards) {
  return cards.reduce((counts, card) => {
    counts[card.phraseId] = (counts[card.phraseId] || 0) + 1;
    return counts;
  }, {});
}

/**
 * 按 id 列表从手牌移除（每个 id 只移除一张）。
 * @returns {{ cards: 剩余, removed: 已移除 }}
 */
function removeCardsByIds(cards, ids) {
  const remainingIds = ids.slice();
  const removed = [];
  const kept = [];

  cards.forEach((card) => {
    const index = remainingIds.indexOf(card.id);
    if (index >= 0) {
      removed.push(card);
      remainingIds.splice(index, 1);
    } else {
      kept.push(card);
    }
  });

  return { cards: kept, removed };
}

/**
 * 按 key 列表从手牌移除（每个 key 只移除一张，用于吃碰招）。
 */
function removeCardsByKeys(cards, keys) {
  const remainingKeys = keys.slice();
  const removed = [];
  const kept = [];

  cards.forEach((card) => {
    const index = remainingKeys.indexOf(card.key);
    if (index >= 0) {
      removed.push(card);
      remainingKeys.splice(index, 1);
    } else {
      kept.push(card);
    }
  });

  return { cards: kept, removed };
}

/**
 * 创建「场上出现牌」对象：摸牌或出牌后进入响应窗口的中间态。
 *
 * @param {object} options
 * @param {object} options.card - 出现的牌
 * @param {string} options.source - 'draw' | 'discard'
 * @param {number} options.sourceSeat - 来源座位
 * @param {number} options.responseStartSeat - 响应轮转起始座位
 * @param {boolean} options.allowSourceSeatResponse - 摸牌时来源座可自摸/自招
 */
function createAppearingCard({
  card,
  source,
  sourceSeat,
  responseStartSeat,
  allowSourceSeatResponse = false,
}) {
  return {
    card,
    source,
    sourceSeat,
    responseStartSeat,
    allowSourceSeatResponse,
    claimedBy: null,
    resolved: false,
  };
}

/**
 * 招/踏「对子挂载」校验结果结构。
 * 招 4 张需 1 对，5 张需 2 对等（size - 3）。
 */
function createSupportPairProof({
  groupKey,
  groupSize,
  needed,
  pairKeys = [],
  pairSources = [],
  valid = false,
  reason = '',
}) {
  return {
    groupKey,
    groupSize,
    needed,
    pairKeys,
    pairSources,
    valid,
    reason,
  };
}

/** 座位操作历史条目（出牌、吃碰等） */
function createActionHistoryEntry(type, detail = {}) {
  return {
    type,
    at: Date.now(),
    ...detail,
  };
}

/**
 * 单座位历史状态初始化。
 * 记录：放弃吃的惩罚键、吃锁、强制出牌、招踏义务、接庄听牌等。
 */
function createSeatHistory() {
  return {
    declinedChiKeys: [],           // 曾放弃吃的牌 key
    declinedChiPenaltyKeys: [],    // 放弃吃后的惩罚键（再次吃会进圈）
    chiLocked: false,              // 吃后碰招踏冲突锁
    chiLockSource: null,
    forcedDiscardCardId: null,     // 特殊搭子后必须打出的牌
    forcedAction: null,
    lockedPhraseTriplets: {},      // 发牌锁定的各句原句数下限 { [phraseId]: N0 }
    supportPairObligations: [],    // 招踏需挂载的对子义务
    supportPairProofs: [],
    discardPhraseCounts: {},       // 各句已打出张数（限制同句出牌）
    takeover: false,               // 是否接庄
    takeoverOperations: 0,         // 接庄后凑牌次数
    pendingTakeoverListeningCheck: false,
    listening: false,
    circleLoss: false,
    actionHistory: [],
  };
}

/**
 * 初始化 4 个空座位。
 * @param {number} dealerSeat - 庄家座位号
 */
function createSeats(rules = DEFAULT_RULES, dealerSeat = rules.dealerSeat) {
  const names = ['我', '下家', '对家', '上家'];
  return Array.from({ length: rules.seatCount }).map((_, seatIndex) => ({
    id: seatIndex,
    name: names[seatIndex] || `玩家${seatIndex + 1}`,
    isHuman: seatIndex === rules.humanSeat,
    isDealer: seatIndex === dealerSeat,
    hand: [],
    melds: [],      // 明牌组（吃/碰/招/踏）
    discards: [],   // 打出的牌（进弃牌区）
    score: 0,
    history: createSeatHistory(),
  }));
}

/** 逆时针下家：(seat + 1) % 4 */
function nextSeat(seat, rules = DEFAULT_RULES) {
  return (seat + 1) % rules.seatCount;
}

/** 上家 */
function previousSeat(seat, rules = DEFAULT_RULES) {
  return (seat + rules.seatCount - 1) % rules.seatCount;
}

module.exports = {
  createDeck,
  shuffleDeck,
  sortCards,
  countByKey,
  countByPhrase,
  removeCardsByIds,
  removeCardsByKeys,
  createAppearingCard,
  createSupportPairProof,
  createActionHistoryEntry,
  createSeatHistory,
  createSeats,
  nextSeat,
  previousSeat,
};
