import { DEFAULT_RULES, createSymbolMap } from './rules.mjs';

function seededRandom(seed) {
  let value = seed || Date.now();
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

export function createDeck(rules = DEFAULT_RULES) {
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

export function shuffleDeck(deck, seed) {
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

export function sortCards(cards, rules = DEFAULT_RULES) {
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

export function countByKey(cards) {
  return cards.reduce((counts, card) => {
    counts[card.key] = (counts[card.key] || 0) + 1;
    return counts;
  }, {});
}

export function countByPhrase(cards) {
  return cards.reduce((counts, card) => {
    counts[card.phraseId] = (counts[card.phraseId] || 0) + 1;
    return counts;
  }, {});
}

export function removeCardsByIds(cards, ids) {
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

export function removeCardsByKeys(cards, keys) {
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

export function createSeatHistory() {
  return {
    declinedChiKeys: [],
    chiLocked: false,
    supportPairObligations: [],
    discardPhraseCounts: {},
    takeover: false,
    takeoverOperations: 0,
    listening: false,
    circleLoss: false,
    actionHistory: [],
  };
}

export function createSeats(rules = DEFAULT_RULES, dealerSeat = rules.dealerSeat) {
  const names = ['我', '下家', '对家', '上家'];
  return Array.from({ length: rules.seatCount }).map((_, seatIndex) => ({
    id: seatIndex,
    name: names[seatIndex] || `玩家${seatIndex + 1}`,
    isHuman: seatIndex === rules.humanSeat,
    isDealer: seatIndex === dealerSeat,
    hand: [],
    melds: [],
    discards: [],
    score: 0,
    history: createSeatHistory(),
  }));
}

export function nextSeat(seat, rules = DEFAULT_RULES) {
  return (seat + 1) % rules.seatCount;
}

export function previousSeat(seat, rules = DEFAULT_RULES) {
  return (seat + rules.seatCount - 1) % rules.seatCount;
}
