/**
 * 花牌规则常量与默认配置（rules.js）
 *
 * 本文件为「规则数据层」，不含游戏流程逻辑。
 * 8 句花牌字句、阶段枚举、动作优先级、计分档位等均在此定义。
 *
 * 花牌 8 句（每句 3 字，每字 6 张）：
 *   上大人、孔乙己、化三千、七十土、尔小生、福禄寿、佳作仁、八九子
 */

// ===================== 游戏阶段 =====================

/** 状态机 phase 枚举，与 engine 中 this.state.phase 对应 */
const PHASES = {
  TAKEOVER_CHOICE: 'takeover-choice', // 滑庄后等待接庄选择
  DEALER_GIFT: 'dealer-gift',         // 接庄后等待原庄家选一张牌交给接庄者
  HUMAN_DISCARD: 'human-discard',     // 等待真人出牌
  HUMAN_RESPONSE: 'human-response',   // 等待真人响应（胡/吃碰招踏/过）
  AI_THINKING: 'ai-thinking',         // AI 思考中（云端同步执行，无真实延迟）
  RESULT: 'result',                   // 本局结束（胡/进圈/流局）
};

// ===================== 动作优先级 =====================

/**
 * 响应窗口内动作优先级（数值越大越优先）。
 * 同优先级按座位响应顺序（responseIndex）决定。
 */
const ACTION_PRIORITY = {
  hu: 6,
  ta: 5,
  zhao: 4,
  peng: 3,
  chi: 2,
  pass: 1,
};

/** 动作中文标签，用于 UI 与 feedback */
const ACTION_LABELS = {
  acceptTakeover: '接庄',
  declineTakeover: '不接',
  hu: '胡',
  ta: '踏',
  zhao: '招',
  peng: '碰',
  chi: '吃',
  pass: '过',
  restart: '再来一局',
};

/** 场上出现牌的来源：摸牌 或 他人打出 */
const APPEARING_CARD_SOURCES = {
  DRAW: 'draw',
  DISCARD: 'discard',
};

// ===================== 结算类型 =====================

const RESULT_TYPES = {
  WIN: 'win',               // 有人胡牌
  CIRCLE_LOSS: 'circle-loss', // 某人进圈（违规罚分）
  DRAW: 'draw',             // 荒庄（牌堆摸完）
  DRAW_ROUND: 'draw-round', // 流局（滑庄无人接、牌堆过少等）
};

/** 进圈原因码 */
const CIRCLE_LOSS_REASONS = {
  RULE_VIOLATION: 'rule-violation',
  SUPPORT_PAIR_FAILURE: 'support-pair-failure',
  TAKEOVER_NOT_LISTENING: 'takeover-not-listening',
  DECLINED_CHI_LATER_CHI: 'declined-chi-later-chi',
  ILLEGAL_DISCARD: 'illegal-discard',
  NO_LEGAL_DISCARD: 'no-legal-discard',
  CHI_LOCK_VIOLATION: 'chi-lock-violation',
  DEALER_NO_KEZI: 'dealer-no-kezi',
};

/** 流局原因码 */
const DRAW_ROUND_REASONS = {
  SLIP_NO_TAKEOVER: 'slip-no-takeover',
  LOW_DECK: 'low-deck',
  EXHAUSTED_DECK: 'exhausted-deck',
};

// ===================== 字句定义 =====================

/**
 * 8 句花牌元数据。
 * id: 句子缩写；chars: 三字；keys: 逻辑键（与牌面 key 对应）
 */
const PHRASES = [
  { id: 'sdr', text: '上大人', chars: ['上', '大', '人'], keys: ['shang', 'da', 'ren'] },
  { id: 'kyj', text: '孔乙己', chars: ['孔', '乙', '己'], keys: ['kong', 'yi', 'ji'] },
  { id: 'hsq', text: '化三千', chars: ['化', '三', '千'], keys: ['hua', 'san', 'qian'] },
  { id: 'qst', text: '七十土', chars: ['七', '十', '土'], keys: ['qi', 'shi', 'tu'] },
  { id: 'exs', text: '尔小生', chars: ['尔', '小', '生'], keys: ['er', 'xiao', 'sheng'] },
  { id: 'fls', text: '福禄寿', chars: ['福', '禄', '寿'], keys: ['fu', 'lu', 'shou'] },
  { id: 'jzr', text: '佳作仁', chars: ['佳', '作', '仁'], keys: ['jia', 'zuo', 'ren2'] },
  { id: 'bjz', text: '八九子', chars: ['八', '九', '子'], keys: ['ba', 'jiu', 'zi'] },
];

/** 句中三字位置对应颜色：首字红、中字绿、末字深灰 */
const POSITION_COLORS = ['#d92d20', '#079455', '#1d2939'];

/** 由 PHRASES 展开为 24 种 cardSymbols（含 order、color 等） */
function buildSymbols() {
  const symbols = [];
  PHRASES.forEach((phrase, phraseIndex) => {
    phrase.keys.forEach((key, index) => {
      symbols.push({
        key,
        text: phrase.chars[index],
        phraseId: phrase.id,
        phraseText: phrase.text,
        phraseIndex,
        position: index,
        order: phraseIndex * 3 + index,
        color: POSITION_COLORS[index],
      });
    });
  });
  return symbols;
}

// ===================== 默认规则参数 =====================

/**
 * 默认规则集。engine / evaluator / cards 均以此为基准。
 *
 * 关键数值：
 *   dealerHandSize 23  庄家起手张数（最后一张为将牌）
 *   idleHandSize   22  闲家起手张数
 *   targetDoorCount 8  胡牌需 8 门（含明牌与暗牌分解）
 *   lowDeckDrawThreshold 15  牌堆少于此数流局
 *   takeoverOperationLimit 3 接庄后最多 3 次凑牌须听牌
 */
const DEFAULT_RULES = {
  seatCount: 4,
  humanSeat: 0,
  dealerSeat: 0,
  copiesPerSymbol: 6,
  dealerHandSize: 23,
  idleHandSize: 22,
  targetDoorCount: 8,
  aiDelayMs: 900,                    // 客户端动画用，云端同步执行
  unclaimedDiscardSettleMs: 1300,
  meldActionSettleMs: 1350,
  allowDiscardWin: true,             // 允许点炮胡
  allowSelfDrawWin: true,              // 允许自摸胡
  allowChiFromPreviousOnly: true,      // 吃牌仅上家（摸牌自吃除外）
  takeoverOperationLimit: 3,
  basePoint: 1,
  lowDeckDrawThreshold: 15,
  actionOrder: ['hu', 'ta', 'zhao', 'peng', 'chi'],
  circleLossPoint: 1,
  huPayments: {
    '屁胡': 1,
    '小甲': 2,
    '大甲': 2,
    '场': 4,
  },
  cardSymbols: buildSymbols(),
  phrases: PHRASES,
  scoring: {
    baseWin: 1,
    selfDrawBonus: 0,
    discardWinBonus: 0,
    circleLossPenalty: 1,
  },
};

/** key → symbol 映射，便于按 key 查 phrase、order 等 */
function createSymbolMap(rules = DEFAULT_RULES) {
  return rules.cardSymbols.reduce((map, symbol) => {
    map[symbol.key] = symbol;
    return map;
  }, {});
}

/** phraseId → phrase 映射 */
function createPhraseMap(rules = DEFAULT_RULES) {
  return rules.phrases.reduce((map, phrase) => {
    map[phrase.id] = phrase;
    return map;
  }, {});
}

/** 由字符 key 反查所属句子对象 */
function getPhraseForKey(key, rules = DEFAULT_RULES) {
  const symbol = createSymbolMap(rules)[key];
  if (!symbol) return null;
  return createPhraseMap(rules)[symbol.phraseId] || null;
}

/** 返回某 key 所在句子的全部 keys 数组 */
function getPhraseKeysForKey(key, rules = DEFAULT_RULES) {
  const phrase = getPhraseForKey(key, rules);
  return phrase ? phrase.keys.slice() : [];
}

module.exports = {
  PHASES,
  ACTION_PRIORITY,
  ACTION_LABELS,
  APPEARING_CARD_SOURCES,
  RESULT_TYPES,
  CIRCLE_LOSS_REASONS,
  DRAW_ROUND_REASONS,
  PHRASES,
  DEFAULT_RULES,
  createSymbolMap,
  createPhraseMap,
  getPhraseForKey,
  getPhraseKeysForKey,
};
