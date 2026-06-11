export const PHASES = {
  TAKEOVER_CHOICE: 'takeover-choice',
  DEALER_GIFT: 'dealer-gift',
  HUMAN_DISCARD: 'human-discard',
  HUMAN_RESPONSE: 'human-response',
  AI_THINKING: 'ai-thinking',
  RESULT: 'result',
};

export const ACTION_PRIORITY = {
  hu: 6,
  ta: 5,
  zhao: 4,
  peng: 3,
  chi: 2,
  pass: 1,
};

export const ACTION_LABELS = {
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

export const APPEARING_CARD_SOURCES = {
  DRAW: 'draw',
  DISCARD: 'discard',
};

export const RESULT_TYPES = {
  WIN: 'win',
  CIRCLE_LOSS: 'circle-loss',
  DRAW: 'draw',
  DRAW_ROUND: 'draw-round',
};

export const CIRCLE_LOSS_REASONS = {
  RULE_VIOLATION: 'rule-violation',
  SUPPORT_PAIR_FAILURE: 'support-pair-failure',
  TAKEOVER_NOT_LISTENING: 'takeover-not-listening',
  DECLINED_CHI_LATER_CHI: 'declined-chi-later-chi',
  ILLEGAL_DISCARD: 'illegal-discard',
  NO_LEGAL_DISCARD: 'no-legal-discard',
  CHI_LOCK_VIOLATION: 'chi-lock-violation',
  DEALER_NO_KEZI: 'dealer-no-kezi',
};

export const DRAW_ROUND_REASONS = {
  SLIP_NO_TAKEOVER: 'slip-no-takeover',
  LOW_DECK: 'low-deck',
  EXHAUSTED_DECK: 'exhausted-deck',
};

export const PHRASES = [
  { id: 'sdr', text: '上大人', chars: ['上', '大', '人'], keys: ['shang', 'da', 'ren'] },
  { id: 'kyj', text: '孔乙己', chars: ['孔', '乙', '己'], keys: ['kong', 'yi', 'ji'] },
  { id: 'hsq', text: '化三千', chars: ['化', '三', '千'], keys: ['hua', 'san', 'qian'] },
  { id: 'qst', text: '七十土', chars: ['七', '十', '土'], keys: ['qi', 'shi', 'tu'] },
  { id: 'exs', text: '尔小生', chars: ['尔', '小', '生'], keys: ['er', 'xiao', 'sheng'] },
  { id: 'fls', text: '福禄寿', chars: ['福', '禄', '寿'], keys: ['fu', 'lu', 'shou'] },
  { id: 'jzr', text: '佳作仁', chars: ['佳', '作', '仁'], keys: ['jia', 'zuo', 'ren2'] },
  { id: 'bjz', text: '八九子', chars: ['八', '九', '子'], keys: ['ba', 'jiu', 'zi'] },
];

const POSITION_COLORS = ['#d92d20', '#079455', '#1d2939'];

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

export const DEFAULT_RULES = {
  seatCount: 4,
  humanSeat: 0,
  dealerSeat: 0,
  copiesPerSymbol: 6,
  dealerHandSize: 23,
  idleHandSize: 22,
  targetDoorCount: 8,
  aiDelayMs: 900,
  unclaimedDiscardSettleMs: 1300,
  meldActionSettleMs: 1350,
  allowDiscardWin: true,
  allowSelfDrawWin: true,
  allowChiFromPreviousOnly: true,
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

export function createSymbolMap(rules = DEFAULT_RULES) {
  return rules.cardSymbols.reduce((map, symbol) => {
    map[symbol.key] = symbol;
    return map;
  }, {});
}

export function createPhraseMap(rules = DEFAULT_RULES) {
  return rules.phrases.reduce((map, phrase) => {
    map[phrase.id] = phrase;
    return map;
  }, {});
}

export function getPhraseForKey(key, rules = DEFAULT_RULES) {
  const symbol = createSymbolMap(rules)[key];
  if (!symbol) return null;
  return createPhraseMap(rules)[symbol.phraseId] || null;
}

export function getPhraseKeysForKey(key, rules = DEFAULT_RULES) {
  const phrase = getPhraseForKey(key, rules);
  return phrase ? phrase.keys.slice() : [];
}
