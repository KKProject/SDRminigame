const { DEFAULT_RULES, getPhraseKeysForKey } = require('./rules');
const { countByKey } = require('./cards');
const { isLegalDiscard } = require('./evaluator');

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

function chooseDiscard(seat, rules = DEFAULT_RULES) {
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

function chooseSelfDrawAction(actions) {
  return chooseResponse(actions);
}

function chooseAcceptTakeover(seat) {
  const triplets = Object.keys(countByKey(seat.hand)).filter((key) => countByKey(seat.hand)[key] >= 3);
  return triplets.length >= 2;
}

module.exports = {
  chooseDiscard,
  chooseResponse,
  chooseSelfDrawAction,
  chooseAcceptTakeover,
};
