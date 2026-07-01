export const CODEC_VERSION = 1;

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

export const COPIES_PER_SYMBOL = 6;
export const POSITION_COLORS = ['#d92d20', '#079455', '#1d2939'];

export const SYMBOLS = PHRASES.flatMap((phrase, phraseIndex) => (
  phrase.keys.map((key, position) => ({
    key,
    text: phrase.chars[position],
    phraseId: phrase.id,
    phraseText: phrase.text,
    phraseIndex,
    position,
    group: phrase.id,
    order: phraseIndex * 3 + position,
    color: POSITION_COLORS[position],
  }))
));

export const ACTION_CODES = Object.freeze({
  discard: 1,
  chi: 2,
  peng: 3,
  zhao: 4,
  ta: 5,
  hu: 6,
  pass: 7,
  acceptTakeover: 8,
  declineTakeover: 9,
  dealerGift: 10,
});

const ACTIONS_BY_CODE = Object.keys(ACTION_CODES).reduce((map, action) => {
  map[ACTION_CODES[action]] = action;
  return map;
}, {});

const SYMBOL_CODE_BY_KEY = SYMBOLS.reduce((map, symbol, code) => {
  map[symbol.key] = code;
  return map;
}, {});

const PHRASE_CODE_BY_ID = PHRASES.reduce((map, phrase, code) => {
  map[phrase.id] = code;
  return map;
}, {});

function invalidCodecValue(message) {
  const error = new Error(message);
  error.code = 'CODEC_VALUE_INVALID';
  return error;
}

export function isSupportedCodecVersion(version) {
  return typeof version !== 'number' || version === CODEC_VERSION;
}

export function symbolCodeForKey(key) {
  const code = SYMBOL_CODE_BY_KEY[key];
  if (typeof code !== 'number') throw invalidCodecValue(`unknown card key: ${key}`);
  return code;
}

export function symbolFromCode(symbolCode) {
  if (!Number.isInteger(symbolCode) || symbolCode < 0 || symbolCode >= SYMBOLS.length) {
    throw invalidCodecValue(`unknown symbolCode: ${symbolCode}`);
  }
  return SYMBOLS[symbolCode];
}

export function phraseCodeForId(phraseId) {
  const code = PHRASE_CODE_BY_ID[phraseId];
  if (typeof code !== 'number') throw invalidCodecValue(`unknown phraseId: ${phraseId}`);
  return code;
}

export function phraseFromCode(phraseCode) {
  if (!Number.isInteger(phraseCode) || phraseCode < 0 || phraseCode >= PHRASES.length) {
    throw invalidCodecValue(`unknown phraseCode: ${phraseCode}`);
  }
  return PHRASES[phraseCode];
}

export function parseCardId(id) {
  const match = String(id || '').match(/^(.*)-(\d+)$/);
  if (!match) throw invalidCodecValue(`invalid card id: ${id}`);
  return { key: match[1], copy: Number(match[2]) };
}

export function cardToCode(card) {
  const key = card && card.key ? card.key : parseCardId(card && card.id).key;
  const copy = typeof (card && card.copy) === 'number' ? card.copy : parseCardId(card && card.id).copy;
  if (!Number.isInteger(copy) || copy < 0 || copy >= COPIES_PER_SYMBOL) {
    throw invalidCodecValue(`invalid card copy: ${copy}`);
  }
  return symbolCodeForKey(key) * COPIES_PER_SYMBOL + copy;
}

export function cardFromCode(cardCode) {
  if (!Number.isInteger(cardCode) || cardCode < 0 || cardCode >= SYMBOLS.length * COPIES_PER_SYMBOL) {
    throw invalidCodecValue(`unknown cardCode: ${cardCode}`);
  }
  const symbolCode = Math.floor(cardCode / COPIES_PER_SYMBOL);
  const copy = cardCode % COPIES_PER_SYMBOL;
  const symbol = symbolFromCode(symbolCode);
  return {
    id: `${symbol.key}-${copy}`,
    key: symbol.key,
    text: symbol.text,
    phraseId: symbol.phraseId,
    phraseText: symbol.phraseText,
    phraseIndex: symbol.phraseIndex,
    position: symbol.position,
    group: symbol.group,
    order: symbol.order,
    color: symbol.color,
    copy,
  };
}

export function actionToCode(action) {
  const code = ACTION_CODES[action];
  if (typeof code !== 'number') throw invalidCodecValue(`unknown action: ${action}`);
  return code;
}

export function actionFromCode(actionCode) {
  const action = ACTIONS_BY_CODE[actionCode];
  if (!action) throw invalidCodecValue(`unknown actionCode: ${actionCode}`);
  return action;
}

export function encodeCardForTransport(card) {
  return { cardCode: cardToCode(card) };
}

export function decodeCardFromTransport(value) {
  if (value && typeof value.cardCode === 'number') return cardFromCode(value.cardCode);
  if (value && value.card && typeof value.cardCode !== 'number') return value.card;
  return value || null;
}

export function encodeActionForTransport(action) {
  return { actionCode: actionToCode(action) };
}

export function decodeActionFromTransport(value) {
  if (value && typeof value.actionCode === 'number') return actionFromCode(value.actionCode);
  if (value && typeof value.action === 'string') return value.action;
  if (typeof value === 'string') return value;
  return '';
}

export function normalizeTransportPayload(value) {
  if (Array.isArray(value)) return value.map(normalizeTransportPayload);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  Object.keys(value).forEach((key) => {
    output[key] = normalizeTransportPayload(value[key]);
  });
  if (typeof value.cardCode === 'number' && !output.card) output.card = cardFromCode(value.cardCode);
  if (typeof value.actionCode === 'number' && !output.action) output.action = actionFromCode(value.actionCode);
  if (typeof value.symbolCode === 'number' && !output.symbol) output.symbol = symbolFromCode(value.symbolCode);
  if (typeof value.phraseCode === 'number' && !output.phrase) output.phrase = phraseFromCode(value.phraseCode);
  return output;
}
