import { DEFAULT_RULES, getPhraseKeysForKey } from './rules';
import { countByKey } from './cards';
import { isLegalDiscard } from './evaluator';

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

export function chooseDiscard(seat, rules = DEFAULT_RULES) {
  const hand = seat.hand || seat;
  const counts = countByKey(hand);
  const legal = hand.filter((card) => isLegalDiscard(seat.hand ? seat : { hand, history: { discardPhraseCounts: {} } }, card, rules).legal);
  const candidates = legal.length ? legal : hand;
  return candidates.slice().sort((a, b) => {
    const aScore = cardKeepScore(a, counts, rules);
    const bScore = cardKeepScore(b, counts, rules);
    if (aScore !== bScore) return aScore - bScore;
    if (a.order !== b.order) return a.order - b.order;
    return a.copy - b.copy;
  })[0];
}

export function chooseResponse(actions) {
  if (!actions.length) return null;
  return actions.slice().sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (a.forced !== b.forced) return a.forced ? -1 : 1;
    return a.seat - b.seat;
  })[0];
}

export function chooseSelfDrawAction(actions) {
  return chooseResponse(actions);
}

export function chooseAcceptTakeover(seat) {
  const triplets = Object.keys(countByKey(seat.hand)).filter((key) => countByKey(seat.hand)[key] >= 3);
  return triplets.length >= 2;
}
