import {
  ACTION_LABELS,
  ACTION_PRIORITY,
  DEFAULT_RULES,
  createSymbolMap,
  getPhraseKeysForKey,
} from './rules';
import {
  countByKey,
  countByPhrase,
  nextSeat,
  removeCardsByKeys,
  sortCards,
} from './cards';

function cloneCounts(counts) {
  return Object.keys(counts).reduce((copy, key) => {
    copy[key] = counts[key];
    return copy;
  }, {});
}

function keyCountSignature(counts) {
  return Object.keys(counts)
    .sort()
    .filter((key) => counts[key] > 0)
    .map((key) => `${key}:${counts[key]}`)
    .join('|');
}

function firstAvailableKey(counts) {
  return Object.keys(counts).sort().find((key) => counts[key] > 0);
}

function consumeKeys(counts, keys) {
  const next = cloneCounts(counts);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (!next[key]) return null;
    next[key] -= 1;
  }
  return next;
}

function findCardsByKeys(cards, keys) {
  return removeCardsByKeys(cards, keys).removed;
}

export function counterclockwiseSeat(seat, rules = DEFAULT_RULES) {
  return nextSeat(seat, rules);
}

export function dealOpeningHands(deck, dealerSeat, rules = DEFAULT_RULES) {
  const hands = Array.from({ length: rules.seatCount }).map(() => []);
  const dealLog = [];
  let jiangCard = null;
  let drawSeat = dealerSeat;

  while (hands.some((hand, seat) => hand.length < (seat === dealerSeat ? rules.dealerHandSize : rules.idleHandSize))) {
    const target = drawSeat === dealerSeat ? rules.dealerHandSize : rules.idleHandSize;
    if (hands[drawSeat].length < target) {
      const card = deck.shift();
      hands[drawSeat].push(card);
      dealLog.push({ seat: drawSeat, card });
      if (drawSeat === dealerSeat && hands[drawSeat].length === rules.dealerHandSize) {
        jiangCard = card;
      }
    }
    drawSeat = counterclockwiseSeat(drawSeat, rules);
  }

  return {
    hands: hands.map((hand) => sortCards(hand, rules)),
    deck,
    jiangCard,
    jiangPhraseId: jiangCard ? jiangCard.phraseId : null,
    dealLog,
  };
}

export function hasTriplet(cards) {
  return Object.keys(countByKey(cards)).some((key) => countByKey(cards)[key] >= 3);
}

export function findTakeoverEligibleSeats(seats, dealerSeat, rules = DEFAULT_RULES) {
  const eligible = [];
  for (let offset = 1; offset < rules.seatCount; offset++) {
    const seat = (dealerSeat + offset) % rules.seatCount;
    if (hasTriplet(seats[seat].hand)) eligible.push(seat);
  }
  return eligible;
}

export function phraseHasComplete(hand, phraseId, rules = DEFAULT_RULES) {
  const symbols = createSymbolMap(rules);
  const phraseKeys = rules.phrases.find((phrase) => phrase.id === phraseId).keys;
  const counts = countByKey(hand);
  return phraseKeys.every((key) => counts[key] > 0 && symbols[key]);
}

export function getCompletePhraseKeys(hand, rules = DEFAULT_RULES) {
  return rules.phrases
    .filter((phrase) => phraseHasComplete(hand, phrase.id, rules))
    .reduce((keys, phrase) => keys.concat(phrase.keys), []);
}

export function getPhraseCardCount(hand, phraseId) {
  return hand.filter((card) => card.phraseId === phraseId).length;
}

export function isPreviousSeat(sourceSeat, seatIndex, rules = DEFAULT_RULES) {
  return nextSeat(sourceSeat, rules) === seatIndex;
}

export function findChiActions(state, seatIndex, incomingCard, sourceSeat, sourceType, rules = DEFAULT_RULES) {
  if (
    sourceType === 'discard'
    && rules.allowChiFromPreviousOnly
    && !isPreviousSeat(sourceSeat, seatIndex, rules)
  ) {
    return [];
  }

  const seat = state.seats[seatIndex];
  if (seat.history && seat.history.chiLocked) return [];

  const phraseKeys = getPhraseKeysForKey(incomingCard.key, rules);
  const needed = phraseKeys.filter((key) => key !== incomingCard.key);
  const counts = countByKey(seat.hand);
  if (needed.length !== 2 || !needed.every((key) => counts[key] > 0)) return [];

  const forced = isForcedPhrasePattern(seat.hand, incomingCard, rules);
  return [{
    type: 'chi',
    seat: seatIndex,
    card: incomingCard,
    sourceSeat,
    sourceType,
    keys: needed,
    sequence: phraseKeys,
    priority: ACTION_PRIORITY.chi,
    label: ACTION_LABELS.chi,
    forced,
    createsChiLock: canPengWithIncoming(seat.hand, incomingCard),
  }];
}

export function canPengWithIncoming(hand, incomingCard) {
  return (countByKey(hand)[incomingCard.key] || 0) >= 2;
}

export function findPengActions(state, seatIndex, incomingCard, sourceSeat, sourceType, rules = DEFAULT_RULES) {
  const seat = state.seats[seatIndex];
  if (seat.history && seat.history.chiLocked) return [];
  if (!canPengWithIncoming(seat.hand, incomingCard)) return [];
  return [{
    type: 'peng',
    seat: seatIndex,
    card: incomingCard,
    sourceSeat,
    sourceType,
    keys: [incomingCard.key, incomingCard.key],
    priority: ACTION_PRIORITY.peng,
    label: ACTION_LABELS.peng,
    forced: isForcedPhrasePattern(seat.hand, incomingCard, rules),
  }];
}

export function findZhaoActions(state, seatIndex, incomingCard, sourceSeat, sourceType) {
  const seat = state.seats[seatIndex];
  if (seat.history && seat.history.chiLocked) return [];
  const count = countByKey(seat.hand)[incomingCard.key] || 0;
  if (count < 3) return [];
  const keys = Array.from({ length: Math.min(count, 5) }).map(() => incomingCard.key);
  return [{
    type: 'zhao',
    seat: seatIndex,
    card: incomingCard,
    sourceSeat,
    sourceType,
    keys,
    priority: ACTION_PRIORITY.zhao,
    label: ACTION_LABELS.zhao,
  }];
}

export function findTaActions(state, seatIndex, incomingCard, sourceType) {
  if (sourceType !== 'draw') return [];
  const actions = [];
  state.seats.forEach((owner) => {
    owner.melds
      .filter((meld) => (meld.type === 'zhao' || meld.type === 'ta') && meld.key === incomingCard.key && meld.cards.length < 6)
      .forEach((meld) => {
        actions.push({
          type: 'ta',
          seat: seatIndex,
          ownerSeat: owner.id,
          meldId: meld.id,
          card: incomingCard,
          sourceType,
          keys: [],
          priority: ACTION_PRIORITY.ta,
          label: ACTION_LABELS.ta,
        });
      });
  });
  return actions;
}

export function findSelfDrawActions(state, seatIndex, drawnCard, rules = DEFAULT_RULES) {
  return []
    .concat(findTaActions(state, seatIndex, drawnCard, 'draw'))
    .concat(findZhaoActions(state, seatIndex, drawnCard, seatIndex, 'draw'))
    .concat(findPengActions(state, seatIndex, drawnCard, seatIndex, 'draw', rules))
    .concat(findChiActions(state, seatIndex, drawnCard, seatIndex, 'draw', rules));
}

export function findResponseActions(state, sourceSeat, incomingCard, rules = DEFAULT_RULES) {
  const actions = [];
  state.seats.forEach((seat, seatIndex) => {
    if (seatIndex === sourceSeat) return;

    if (rules.allowDiscardWin) {
      const win = evaluateWin(seat.hand.concat([incomingCard]), seat.melds, 'discard', rules, {
        jiangPhraseId: state.jiangPhraseId,
      });
      if (win.isWin) {
        actions.push({
          type: 'hu',
          seat: seatIndex,
          card: incomingCard,
          sourceSeat,
          sourceType: 'discard',
          keys: [],
          priority: ACTION_PRIORITY.hu,
          label: ACTION_LABELS.hu,
          win,
        });
      }
    }

    actions.push(...findZhaoActions(state, seatIndex, incomingCard, sourceSeat, 'discard', rules));
    actions.push(...findPengActions(state, seatIndex, incomingCard, sourceSeat, 'discard', rules));
    actions.push(...findChiActions(state, seatIndex, incomingCard, sourceSeat, 'discard', rules));
  });

  return actions.sort((a, b) => b.priority - a.priority || a.seat - b.seat);
}

export function highestPriorityActions(actions) {
  if (!actions.length) return [];
  const top = actions[0].priority;
  return actions.filter((action) => action.priority === top);
}

export function filterHighestPriority(actions) {
  const sorted = actions.slice().sort((a, b) => b.priority - a.priority || a.seat - b.seat);
  const top = highestPriorityActions(sorted);
  if (!top.length || top[0].type !== 'peng') return top;

  const topPengSeats = top
    .filter((action) => action.type === 'peng')
    .map((action) => action.seat);
  const chiConflictActions = sorted.filter((action) => (
    action.type === 'chi'
    && action.createsChiLock
    && topPengSeats.indexOf(action.seat) >= 0
  ));
  return top.concat(chiConflictActions);
}

export function isForcedPhrasePattern(hand, incomingCard, rules = DEFAULT_RULES) {
  const phraseKeys = getPhraseKeysForKey(incomingCard.key, rules);
  const phraseCards = hand.filter((card) => phraseKeys.indexOf(card.key) >= 0).concat([incomingCard]);
  if (phraseCards.length < 3) return false;
  const counts = countByKey(phraseCards);
  return phraseKeys.some((key) => counts[key] >= 2) && phraseKeys.some((key) => counts[key] === 1);
}

function supportPairsNeeded(size) {
  if (size < 4) return 0;
  return size - 3;
}

function availablePairSources(cards, excludeIds = []) {
  const filtered = cards.filter((card) => excludeIds.indexOf(card.id) < 0);
  const counts = countByKey(filtered);
  return Object.keys(counts)
    .filter((key) => counts[key] >= 2)
    .map((key) => ({
      key,
      pairs: Math.floor(counts[key] / 2),
    }));
}

export function validateSupportPairs(hand, sameKeyGroupCards, rules = DEFAULT_RULES) {
  const needed = supportPairsNeeded(sameKeyGroupCards.length);
  if (!needed) return { valid: true, needed, pairKeys: [], pairSources: [] };
  const pairSources = availablePairSources(hand, sameKeyGroupCards.map((card) => card.id));
  const totalPairs = pairSources.reduce((total, source) => total + source.pairs, 0);
  const distinctNeeded = sameKeyGroupCards.length >= 5 ? needed : 1;
  return {
    valid: totalPairs >= needed && pairSources.length >= distinctNeeded,
    needed,
    pairKeys: pairSources.slice(0, needed).map((source) => source.key),
    pairSources,
    reason: `招踏${sameKeyGroupCards.length}张需要${needed}对`,
  };
}

function phraseHasExactComplete(hand, phraseId, rules = DEFAULT_RULES) {
  const phrase = rules.phrases.find((item) => item.id === phraseId);
  if (!phrase) return false;
  const phraseCards = hand.filter((card) => card.phraseId === phraseId);
  if (phraseCards.length !== phrase.keys.length) return false;
  const counts = countByKey(phraseCards);
  return phrase.keys.every((key) => counts[key] === 1);
}

export function isLegalDiscard(seat, card, rules = DEFAULT_RULES) {
  const history = seat.history || { discardPhraseCounts: {} };
  if (phraseHasExactComplete(seat.hand, card.phraseId, rules)) {
    return { legal: false, reason: '不能打出原句中的牌' };
  }

  const phraseCount = getPhraseCardCount(seat.hand, card.phraseId);
  const discarded = (history.discardPhraseCounts[card.phraseId] || 0) + 1;
  if (phraseCount >= 5 && discarded > 2) {
    return { legal: false, reason: '五张同句最多只能打两张' };
  }
  if (phraseCount === 4 && discarded > 1) {
    return { legal: false, reason: '四张同句最多只能打一张' };
  }
  return { legal: true };
}

function buildDoorOptions(counts, rules) {
  const key = firstAvailableKey(counts);
  if (!key) return [];
  const options = [];
  const count = counts[key];

  [6, 5, 4, 3, 2].forEach((size) => {
    if (count >= size) {
      options.push({
        type: size === 2 ? 'xx' : 'same',
        key,
        keys: Array.from({ length: size }).map(() => key),
        supportNeeded: supportPairsNeeded(size),
      });
    }
  });

  const phrase = getPhraseKeysForKey(key, rules);
  if (phrase.length === 3) {
    const phraseCounts = phrase.map((phraseKey) => counts[phraseKey] || 0);
    if (phraseCounts.every((value) => value > 0)) {
      options.push({ type: 'xyz', keys: phrase, supportNeeded: 0 });
    }
    const index = phrase.indexOf(key);
    const xyPairs = index >= 0
      ? phrase.filter((_, phraseIndex) => phraseIndex !== (index + 2) % 3)
      : [];
    if (xyPairs.length === 2 && xyPairs.every((phraseKey) => counts[phraseKey] > 0)) {
      options.push({ type: 'xy', keys: xyPairs, supportNeeded: 0 });
    }
  }

  return options;
}

function validateDoorSupport(doors) {
  const pairDoors = doors.filter((door) => door.type === 'xx');
  const pairKeys = pairDoors.map((door) => door.key);
  const obligations = doors.filter((door) => door.supportNeeded > 0);
  const usedPairDoorIndexes = new Set();
  let needed = 0;

  for (let i = 0; i < obligations.length; i++) {
    const obligation = obligations[i];
    needed += obligation.supportNeeded;
    const availableIndexes = pairDoors
      .map((door, index) => ({ door, index }))
      .filter((item) => !usedPairDoorIndexes.has(item.index));
    const distinctKeys = [];
    for (let j = 0; j < availableIndexes.length; j++) {
      const { door, index } = availableIndexes[j];
      if (obligation.supportNeeded >= 2 && distinctKeys.indexOf(door.key) >= 0) continue;
      distinctKeys.push(door.key);
      usedPairDoorIndexes.add(index);
      if (distinctKeys.length >= obligation.supportNeeded) break;
    }
    if (distinctKeys.length < obligation.supportNeeded) return false;
  }

  return pairDoors.length >= needed;
}

function decomposeDoors(counts, rules, doors = [], memo = {}) {
  const signature = `${keyCountSignature(counts)}::${doors.length}`;
  if (memo[signature]) return null;

  if (doors.length > rules.targetDoorCount) return null;
  const key = firstAvailableKey(counts);
  if (!key) {
    if (doors.length !== rules.targetDoorCount) return null;
    const xyCount = doors.filter((door) => door.type === 'xy').length;
    if (xyCount !== 1) return null;
    if (!validateDoorSupport(doors)) return null;
    return doors;
  }

  const options = buildDoorOptions(counts, rules);
  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    const next = consumeKeys(counts, option.keys);
    if (!next) continue;
    const result = decomposeDoors(next, rules, doors.concat([option]), memo);
    if (result) return result;
  }

  memo[signature] = true;
  return null;
}

function exposedDoors(melds) {
  return melds.map((meld) => ({
    type: meld.type === 'chi' ? 'xyz' : 'same',
    key: meld.key,
    keys: meld.cards.map((card) => card.key),
    supportNeeded: supportPairsNeeded(meld.cards.length),
    exposed: true,
    meldType: meld.type,
    label: meld.label,
    size: meld.cards.length,
  }));
}

export function hasKezi(cards, melds = []) {
  const counts = countByKey(cards);
  if (Object.keys(counts).some((key) => counts[key] >= 3)) return true;
  return melds.some((meld) => meld.type !== 'chi' && meld.cards.length >= 3);
}

function cardColorBase(symbol) {
  return symbol && symbol.position === 0 ? 4 : 2;
}

function applyJiangMultiplier(amount, symbol, jiangPhraseId) {
  const multiplier = symbol && symbol.phraseId === jiangPhraseId ? 4 : 1;
  return {
    multiplier,
    amount: amount * multiplier,
  };
}

function classifyHuGrade(doors, totalFu) {
  if (totalFu >= 44) return '场';
  if (totalFu >= 33 && totalFu <= 43) return '大甲';
  const xyzCount = doors.filter((door) => door.type === 'xyz').length;
  const xyCount = doors.filter((door) => door.type === 'xy').length;
  if (xyzCount === 7 && xyCount === 1) return '小甲';
  return '屁胡';
}

function pointValueForGrade(grade, rules = DEFAULT_RULES) {
  const base = rules.basePoint || 1;
  if (grade === '场') return base * 4;
  if (grade === '大甲' || grade === '小甲') return base * 2;
  return base;
}

export function calculateHuScoring(doors, rules = DEFAULT_RULES, context = {}) {
  const symbols = createSymbolMap(rules);
  const jiangPhraseId = context.jiangPhraseId || null;
  const entries = [];
  let totalFu = 0;

  doors
    .filter((door) => door.type === 'same' && door.keys.length >= 3)
    .forEach((door) => {
      const symbol = symbols[door.key];
      const base = cardColorBase(symbol);
      const baseResult = applyJiangMultiplier(base, symbol, jiangPhraseId);
      entries.push({
        type: 'kezi',
        key: door.key,
        text: symbol ? symbol.text : door.key,
        baseFu: base,
        multiplier: baseResult.multiplier,
        fu: baseResult.amount,
        description: `${symbol ? symbol.text : door.key}${door.keys.length}张刻子`,
      });
      totalFu += baseResult.amount;

      const extraCards = Math.max(0, door.keys.length - 3);
      if (extraCards) {
        const extraBase = extraCards * base;
        const extraResult = applyJiangMultiplier(extraBase, symbol, jiangPhraseId);
        entries.push({
          type: door.meldType === 'ta' ? 'ta' : 'zhao',
          key: door.key,
          text: symbol ? symbol.text : door.key,
          baseFu: extraBase,
          multiplier: extraResult.multiplier,
          fu: extraResult.amount,
          description: `${symbol ? symbol.text : door.key}${door.keys.length}张${door.meldType === 'ta' ? '踏' : '招'}加福`,
        });
        totalFu += extraResult.amount;
      }
    });

  const sameGroupsByColor = doors
    .filter((door) => door.type === 'same' && door.keys.length >= 3)
    .reduce((groups, door) => {
      const symbol = symbols[door.key];
      const colorKey = symbol && symbol.position === 0 ? 'red' : `${symbol ? symbol.position : 'other'}`;
      groups[colorKey] = (groups[colorKey] || 0) + 1;
      return groups;
    }, {});

  Object.keys(sameGroupsByColor).forEach((colorKey) => {
    const count = sameGroupsByColor[colorKey];
    if (count < 3) return;
    const isRed = colorKey === 'red';
    const fu = (isRed ? 8 : 4) + Math.max(0, count - 3) * (isRed ? 4 : 2);
    entries.push({
      type: 'kezi-run',
      key: colorKey,
      text: isRed ? '红字' : '黑绿字',
      baseFu: fu,
      multiplier: 1,
      fu,
      description: `${isRed ? '红字' : '黑绿字'}${count}个刻子累计`,
    });
    totalFu += fu;
  });

  const grade = classifyHuGrade(doors, totalFu);
  const points = pointValueForGrade(grade, rules);
  return {
    totalFu,
    entries,
    grade,
    basePoint: rules.basePoint || 1,
    points,
    jiangPhraseId,
    hasJiangMultiplier: entries.some((entry) => entry.multiplier > 1),
  };
}

export { classifyHuGrade, pointValueForGrade };

export function evaluateWin(cards, melds = [], source = 'self', rules = DEFAULT_RULES, context = {}) {
  const exposed = exposedDoors(melds);
  const counts = countByKey(cards);
  const doorTarget = rules.targetDoorCount - exposed.length;
  if (doorTarget < 0) return { isWin: false };
  const hiddenRules = { ...rules, targetDoorCount: doorTarget };
  const hiddenDoors = decomposeDoors(counts, hiddenRules);
  if (!hiddenDoors) return { isWin: false };

  const doors = exposed.concat(hiddenDoors);
  const xyCount = doors.filter((door) => door.type === 'xy').length;
  if (doors.length !== rules.targetDoorCount || xyCount !== 1 || !validateDoorSupport(doors)) {
    return { isWin: false };
  }

  const scoring = calculateHuScoring(doors, rules, context);
  const score = scoring.points;
  return {
    isWin: true,
    source,
    doors,
    score,
    scoring,
    grade: scoring.grade,
    points: scoring.points,
    pattern: 'eight-door',
    summary: `${source === 'self' ? '自摸' : '接炮'} ${scoring.grade} ${scoring.totalFu}福 ${score}分`,
  };
}

export function isListening(hand, melds = [], rules = DEFAULT_RULES, options = {}) {
  const symbols = createSymbolMap(rules);
  if (options.requiresKezi && !hasKezi(hand, melds)) return false;
  return Object.keys(symbols).some((key) => {
    const symbol = symbols[key];
    const card = {
      id: `listen-${key}`,
      key,
      text: symbol.text,
      phraseId: symbol.phraseId,
      phraseText: symbol.phraseText,
      phraseIndex: symbol.phraseIndex,
      position: symbol.position,
      order: symbol.order,
      color: symbol.color,
      copy: 99,
    };
    if (options.requiresKezi && !hasKezi(hand.concat([card]), melds)) return false;
    return evaluateWin(hand.concat([card]), melds, 'self', rules, options).isWin;
  });
}

export function buildCircleLossResult(loser, seats, reason, rules = DEFAULT_RULES) {
  return {
    type: 'circle-loss',
    loser,
    winners: seats.map((seat) => seat.id).filter((seat) => seat !== loser),
    reason,
    summary: `${seats[loser].name}进圈，三家赢`,
    score: rules.scoring.circleLossPenalty,
  };
}

export function applyMeldCards(seat, incomingCard, action, rules = DEFAULT_RULES) {
  const removed = findCardsByKeys(seat.hand, action.keys);
  const nextHand = removeCardsByKeys(seat.hand, action.keys).cards;
  const cards = sortCards(removed.concat([incomingCard]), rules);
  return { hand: sortCards(nextHand, rules), cards };
}
