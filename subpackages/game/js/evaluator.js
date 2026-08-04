import {
  ACTION_LABELS,
  ACTION_PRIORITY,
  DEFAULT_RULES,
  createSymbolMap,
  getPhraseKeysForKey,
} from '../../../js/rules';
import {
  countByKey,
  countByPhrase,
  createSupportPairProof,
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

export function responseSeatOrder(sourceSeat, rules = DEFAULT_RULES, options = {}) {
  const includeSource = Boolean(options.includeSource);
  const order = [];
  let seat = includeSource ? sourceSeat : nextSeat(sourceSeat, rules);
  while (order.length < rules.seatCount - (includeSource ? 0 : 1)) {
    order.push(seat);
    seat = nextSeat(seat, rules);
  }
  return order;
}

export function findChiActions(state, seatIndex, incomingCard, sourceSeat, sourceType, rules = DEFAULT_RULES) {
  if (rules.allowChiFromPreviousOnly) {
    const canChiSource = sourceType === 'draw'
      ? sourceSeat === seatIndex || isPreviousSeat(sourceSeat, seatIndex, rules)
      : isPreviousSeat(sourceSeat, seatIndex, rules);
    if (!canChiSource) return [];
  }

  const seat = state.seats[seatIndex];
  if (seat.history && seat.history.chiLocked) return [];
  if (hasManuallyDiscardedHandKey(seat, incomingCard.key)) return [];
  if (phraseHasExactComplete(seat.hand, incomingCard.phraseId, rules)) return [];

  const phraseKeys = getPhraseKeysForKey(incomingCard.key, rules);
  const needed = phraseKeys.filter((key) => key !== incomingCard.key);
  const counts = countByKey(seat.hand);
  if (needed.length !== 2 || !needed.every((key) => counts[key] > 0)) return [];

  const specialTazi = getSpecialTaziRequirement(seat.hand, incomingCard, rules, 'chi');
  const forced = Boolean(specialTazi);
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
    forcedPattern: forced ? specialTazi.pattern : null,
    createsChiLock: canPengWithIncoming(seat.hand, incomingCard),
  }];
}

export function canPengWithIncoming(hand, incomingCard) {
  return (countByKey(hand)[incomingCard.key] || 0) >= 2;
}

export function findPengActions(state, seatIndex, incomingCard, sourceSeat, sourceType, rules = DEFAULT_RULES) {
  const seat = state.seats[seatIndex];
  if (seat.history && seat.history.chiLocked) return [];
  if (hasManuallyDiscardedHandKey(seat, incomingCard.key)) return [];
  if (!canPengWithIncoming(seat.hand, incomingCard)) return [];
  const specialTazi = getSpecialTaziRequirement(seat.hand, incomingCard, rules, 'peng');
  return [{
    type: 'peng',
    seat: seatIndex,
    card: incomingCard,
    sourceSeat,
    sourceType,
    keys: [incomingCard.key, incomingCard.key],
    priority: ACTION_PRIORITY.peng,
    label: ACTION_LABELS.peng,
    forced: Boolean(specialTazi),
    forcedPattern: specialTazi ? specialTazi.pattern : null,
  }];
}

export function findZhaoActions(state, seatIndex, incomingCard, sourceSeat, sourceType) {
  const seat = state.seats[seatIndex];
  if (seat.history && seat.history.chiLocked) return [];
  if (hasManuallyDiscardedHandKey(seat, incomingCard.key)) return [];
  const count = countByKey(seat.hand)[incomingCard.key] || 0;
  if (count < 3) return [];
  const maxGroupSize = Math.min(count + 1, 6);
  const actions = [];

  for (let zhaoSize = 4; zhaoSize <= maxGroupSize; zhaoSize++) {
    const handKeyCount = zhaoSize - 1;
    const keys = Array.from({ length: handKeyCount }).map(() => incomingCard.key);
    const removed = removeCardsByKeys(seat.hand, keys);
    const prospectiveMeld = {
      type: 'zhao',
      key: incomingCard.key,
      cards: removed.removed.concat([incomingCard]),
    };
    const support = validateSupportPairObligations(
      removed.cards,
      seat.melds.filter((meld) => meld.cards.length >= 4).concat([prospectiveMeld]),
    );
    actions.push({
      type: 'zhao',
      seat: seatIndex,
      card: incomingCard,
      sourceSeat,
      sourceType,
      keys,
      zhaoSize,
      handKeyCount,
      supportNeeded: supportPairsNeeded(zhaoSize),
      supportValid: support.valid,
      priority: ACTION_PRIORITY.zhao,
      label: `${ACTION_LABELS.zhao}${zhaoSize}张${supportPairsNeeded(zhaoSize)}对`,
      circleLossRisk: !support.valid,
    });
  }

  return actions;
}

export function findTaActions(state, seatIndex, incomingCard, sourceType) {
  if (sourceType !== 'draw') return [];
  const respondingSeat = state.seats[seatIndex];
  if (respondingSeat && hasManuallyDiscardedHandKey(respondingSeat, incomingCard.key)) return [];
  const actions = [];
  state.seats.forEach((owner) => {
    if (owner.id !== seatIndex) return;
    owner.melds
      .filter((meld) => (meld.type === 'zhao' || meld.type === 'ta') && meld.key === incomingCard.key && meld.cards.length < 6)
      .forEach((meld) => {
        const actingSeat = owner;
        const prospectiveMeld = { ...meld, cards: meld.cards.concat([incomingCard]) };
        const highOrderGroups = actingSeat.melds
          .filter((item) => item.cards.length >= 4 && item.id !== meld.id)
          .concat([prospectiveMeld]);
        const support = validateSupportPairObligations(actingSeat.hand, highOrderGroups);
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
          circleLossRisk: !support.valid,
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

export function findAppearingCardActions(state, sourceSeat, incomingCard, sourceType, rules = DEFAULT_RULES) {
  const actions = [];
  const order = responseSeatOrder(sourceSeat, rules, { includeSource: sourceType === 'draw' });
  order.forEach((seatIndex, responseIndex) => {
    const seat = state.seats[seatIndex];

    const allowWin = sourceType === 'draw' ? rules.allowSelfDrawWin : rules.allowDiscardWin;
    if (allowWin) {
      const win = evaluateWin(seat.hand.concat([incomingCard]), seat.melds, sourceType === 'draw' && seatIndex === sourceSeat ? 'self' : sourceType, rules, {
        jiangPhraseId: state.jiangPhraseId,
      });
      if (win.isWin && !isManualHandDiscardHuBlocked(seat, incomingCard)) {
        actions.push({
          type: 'hu',
          seat: seatIndex,
          card: incomingCard,
          sourceSeat,
          sourceType,
          keys: [],
          priority: ACTION_PRIORITY.hu,
          label: ACTION_LABELS.hu,
          responseIndex,
          win,
        });
      }
    }

    actions.push(...findTaActions(state, seatIndex, incomingCard, sourceType).map((action) => ({ ...action, responseIndex })));
    actions.push(...findZhaoActions(state, seatIndex, incomingCard, sourceSeat, sourceType, rules).map((action) => ({ ...action, responseIndex })));
    actions.push(...findPengActions(state, seatIndex, incomingCard, sourceSeat, sourceType, rules).map((action) => ({ ...action, responseIndex })));
    actions.push(...findChiActions(state, seatIndex, incomingCard, sourceSeat, sourceType, rules).map((action) => ({ ...action, responseIndex })));
  });

  return actions.sort((a, b) => b.priority - a.priority || a.responseIndex - b.responseIndex || a.seat - b.seat);
}

export function findResponseActions(state, sourceSeat, incomingCard, rules = DEFAULT_RULES) {
  return findAppearingCardActions(state, sourceSeat, incomingCard, 'discard', rules);
}

export function highestPriorityActions(actions) {
  if (!actions.length) return [];
  const top = actions[0].priority;
  return actions.filter((action) => action.priority === top);
}

export function filterHighestPriority(actions) {
  const safeActions = actions.filter((action) => !action.circleLossRisk || action.forced);
  const sorted = safeActions.slice().sort((a, b) => b.priority - a.priority || (a.responseIndex || 0) - (b.responseIndex || 0) || a.seat - b.seat);
  const top = highestPriorityActions(sorted);
  if (top.length && top[0].type === 'zhao') {
    const topSeats = top.map((action) => action.seat);
    const sameSeatChoices = sorted.filter((action) => (
      ['peng', 'chi'].indexOf(action.type) >= 0
      && topSeats.indexOf(action.seat) >= 0
    ));
    return top.concat(sameSeatChoices);
  }
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
  return Boolean(getSpecialTaziRequirement(hand, incomingCard, rules));
}

export function getSpecialTaziRequirement(hand, incomingCard, rules = DEFAULT_RULES, actionType = null) {
  const phraseKeys = getPhraseKeysForKey(incomingCard.key, rules);
  if (phraseKeys.length !== 3) return null;
  const phraseCards = hand.filter((card) => phraseKeys.indexOf(card.key) >= 0);
  if (phraseCards.length !== 3) return null;
  const [x, y, z] = phraseKeys;
  const counts = countByKey(phraseCards);
  const signature = phraseKeys.map((key) => key.repeat(counts[key] || 0)).join('');
  const table = {
    [x + x + y]: { pattern: 'xxy', chiKey: z, pengKey: x },
    [y + y + z]: { pattern: 'yyz', chiKey: x, pengKey: y },
    [z + z + x]: { pattern: 'zzx', chiKey: y, pengKey: z },
    [z + z + y]: { pattern: 'zzy', chiKey: x, pengKey: z },
  };
  const match = table[signature];
  if (!match) return null;
  if (incomingCard.key === match.chiKey && (!actionType || actionType === 'chi')) {
    return { actionType: 'chi', pattern: match.pattern, missingKey: match.chiKey };
  }
  if (incomingCard.key === match.pengKey && (!actionType || actionType === 'peng')) {
    return { actionType: 'peng', pattern: match.pattern, missingKey: match.pengKey };
  }
  return null;
}

export function createChiPenaltyKey(actionOrCard) {
  const card = actionOrCard.card || actionOrCard;
  return `${card.phraseId}:${card.key}`;
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
  if (!needed) {
    return createSupportPairProof({
      groupKey: sameKeyGroupCards[0] ? sameKeyGroupCards[0].key : null,
      groupSize: sameKeyGroupCards.length,
      needed,
      valid: true,
    });
  }
  const pairSources = availablePairSources(hand, sameKeyGroupCards.map((card) => card.id));
  const totalPairs = pairSources.reduce((total, source) => total + source.pairs, 0);
  const distinctNeeded = sameKeyGroupCards.length >= 5 ? needed : 1;
  return createSupportPairProof({
    groupKey: sameKeyGroupCards[0] ? sameKeyGroupCards[0].key : null,
    groupSize: sameKeyGroupCards.length,
    valid: totalPairs >= needed && pairSources.length >= distinctNeeded,
    needed,
    pairKeys: pairSources.slice(0, needed).map((source) => source.key),
    pairSources,
    reason: `招踏${sameKeyGroupCards.length}张需要${needed}对`,
  });
}

function chooseDistinctPairKeys(pairCounts, needed) {
  const keys = Object.keys(pairCounts).filter((key) => pairCounts[key] > 0);
  const results = [];

  function walk(start, selected) {
    if (selected.length === needed) {
      results.push(selected.slice());
      return;
    }
    for (let i = start; i < keys.length; i++) {
      selected.push(keys[i]);
      walk(i + 1, selected);
      selected.pop();
    }
  }

  walk(0, []);
  return results;
}

export function validateSupportPairObligations(hand, highOrderGroups = [], rules = DEFAULT_RULES) {
  const obligations = highOrderGroups
    .filter((group) => group && Array.isArray(group.cards) && group.cards.length >= 4)
    .map((group) => ({
      group,
      needed: supportPairsNeeded(group.cards.length),
    }))
    .filter((item) => item.needed > 0)
    .sort((a, b) => b.needed - a.needed);

  if (!obligations.length) return { valid: true, proofs: [] };

  const pairCounts = availablePairSources(hand).reduce((counts, source) => {
    counts[source.key] = source.pairs;
    return counts;
  }, {});
  const proofs = [];

  function allocate(index) {
    if (index >= obligations.length) return true;
    const obligation = obligations[index];
    const choices = chooseDistinctPairKeys(pairCounts, obligation.needed);
    for (let i = 0; i < choices.length; i++) {
      const keys = choices[i];
      keys.forEach((key) => { pairCounts[key] -= 1; });
      proofs[index] = createSupportPairProof({
        groupKey: obligation.group.key || (obligation.group.cards[0] && obligation.group.cards[0].key),
        groupSize: obligation.group.cards.length,
        needed: obligation.needed,
        pairKeys: keys,
        pairSources: keys.map((key) => ({ key, pairs: 1 })),
        valid: true,
      });
      if (allocate(index + 1)) return true;
      keys.forEach((key) => { pairCounts[key] += 1; });
      proofs[index] = null;
    }
    return false;
  }

  const valid = allocate(0);
  return {
    valid,
    proofs: valid ? proofs.filter(Boolean) : [],
    reason: valid ? '' : '招踏对子不足或对子被复用',
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

// 计算一手牌中各句「发牌那一刻」能组成的完整原句数（用于锁定下限）。
// 原句 = 某句三字各至少一张可凑成的一组，该句原句数 = min(cx, cy, cz)。
// 在 startRound 发牌后调用，结果写入 seat.history.lockedPhraseTriplets，之后不再变。
export function computePhraseTripletLocks(hand, rules = DEFAULT_RULES) {
  const counts = countByKey(hand);
  return rules.phrases.reduce((locks, phrase) => {
    const min = Math.min(...phrase.keys.map((key) => counts[key] || 0));
    if (min > 0) locks[phrase.id] = min;
    return locks;
  }, {});
}

function isManualHandDiscardHistoryEntry(entry) {
  return entry && entry.type === 'discard';
}

function manualDiscardedKeyCounts(seat, keys) {
  const keySet = new Set(keys);
  return ((seat.history && seat.history.actionHistory) || []).reduce((counts, entry) => {
    if (isManualHandDiscardHistoryEntry(entry) && keySet.has(entry.key)) {
      counts[entry.key] = (counts[entry.key] || 0) + 1;
    }
    return counts;
  }, {});
}

function hasManuallyDiscardedHandKey(seat, key) {
  return ((seat.history && seat.history.actionHistory) || [])
    .some((entry) => isManualHandDiscardHistoryEntry(entry) && entry.key === key);
}

function isManualHandDiscardHuBlocked(seat, incomingCard) {
  return Boolean(incomingCard && hasManuallyDiscardedHandKey(seat, incomingCard.key));
}

function sumCounts(counts, keys) {
  return keys.reduce((total, key) => total + (counts[key] || 0), 0);
}

function phraseDoorTargets(phraseKeys) {
  return [
    phraseKeys,
    [phraseKeys[0], phraseKeys[0], phraseKeys[0]],
    [phraseKeys[1], phraseKeys[1], phraseKeys[1]],
    [phraseKeys[2], phraseKeys[2], phraseKeys[2]],
  ];
}

function countsContainKeys(counts, keys) {
  const needed = keys.reduce((result, key) => {
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});
  return Object.keys(needed).every((key) => (counts[key] || 0) >= needed[key]);
}

function canReachFinalPhraseDoor(counts, phraseKeys, remainingDiscards) {
  const total = sumCounts(counts, phraseKeys);
  const extraCards = total - 3;
  if (extraCards < 0 || extraCards > remainingDiscards) return false;
  return phraseDoorTargets(phraseKeys).some((target) => countsContainKeys(counts, target));
}

function isInitialTwoPairStop(countsBefore, countsAfter, phraseKeys, usedBefore, usedAfter, allowance, cardKey) {
  if (usedBefore !== 0 || usedAfter >= allowance) return false;
  if ((countsBefore[cardKey] || 0) !== 1) return false;
  const beforeValues = phraseKeys.map((key) => countsBefore[key] || 0).sort((a, b) => a - b);
  const afterValues = phraseKeys.map((key) => countsAfter[key] || 0).sort((a, b) => a - b);
  return beforeValues.join(',') === '1,2,2' && afterValues.join(',') === '0,2,2';
}

function isOpeningTwoPairDiscardChain(handCounts, manualCounts, phraseKeys) {
  const originalValues = phraseKeys
    .map((key) => (handCounts[key] || 0) + (manualCounts[key] || 0))
    .sort((a, b) => a - b);
  return originalValues.join(',') === '0,2,2';
}

function handExactlyTilesPhraseDoors(handCounts, phraseKeys) {
  const [kx, ky, kz] = phraseKeys;
  const cx = handCounts[kx] || 0;
  const cy = handCounts[ky] || 0;
  const cz = handCounts[kz] || 0;
  const maxXyzGroups = Math.min(cx, cy, cz);
  for (let a = 0; a <= maxXyzGroups; a += 1) {
    if ((cx - a) % 3 === 0 && (cy - a) % 3 === 0 && (cz - a) % 3 === 0) return true;
  }
  return false;
}

function canDiscardPreservingPhraseDoor(seat, card, rules = DEFAULT_RULES) {
  const phraseKeys = getPhraseKeysForKey(card.key, rules);
  if (phraseKeys.length !== 3) return true;

  const handCounts = countByKey(seat.hand || []);

  if (handExactlyTilesPhraseDoors(handCounts, phraseKeys)) return false;
  if ((handCounts[card.key] || 0) >= 3) return false;
  if (phraseKeys.some((key) => (handCounts[key] || 0) >= 3)) return true;

  const manualDiscardedCounts = manualDiscardedKeyCounts(seat, phraseKeys);
  if (isOpeningTwoPairDiscardChain(handCounts, manualDiscardedCounts, phraseKeys)) return true;

  const discardedCounts = manualDiscardedKeyCounts(seat, phraseKeys);
  const currentTotal = sumCounts(handCounts, phraseKeys);
  const discardedTotal = sumCounts(discardedCounts, phraseKeys);
  const originalTotal = currentTotal + discardedTotal;
  if (originalTotal <= 3) {
    return !phraseDoorTargets(phraseKeys).some((target) => countsContainKeys(handCounts, target));
  }
  const allowance = Math.max(0, originalTotal - 3);
  const usedAfter = discardedTotal + 1;

  if (usedAfter > allowance) return false;

  const afterCounts = cloneCounts(handCounts);
  afterCounts[card.key] = (afterCounts[card.key] || 0) - 1;
  const remainingDiscards = allowance - usedAfter;

  if (canReachFinalPhraseDoor(afterCounts, phraseKeys, remainingDiscards)) return true;
  return isInitialTwoPairStop(handCounts, afterCounts, phraseKeys, discardedTotal, usedAfter, allowance, card.key);
}

export function isLegalDiscard(seat, card, rules = DEFAULT_RULES) {
  const history = seat.history || { discardPhraseCounts: {} };
  if (history.forcedDiscardCardId && card.id !== history.forcedDiscardCardId) {
    return { legal: false, reason: '特殊搭子凑牌后必须先打出剩余牌' };
  }
  if (!canDiscardPreservingPhraseDoor(seat, card, rules)) {
    return { legal: false, reason: '同句出牌后必须保留可成门路径' };
  }
  if ((history.chiKeys || []).includes(card.key)) {
    return { legal: false, reason: '吃过的牌不能再次打出' };
  }
  return { legal: true };
}

export function getLegalDiscards(seat, rules = DEFAULT_RULES) {
  return (seat.hand || []).filter((card) => isLegalDiscard(seat, card, rules).legal);
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
    if (index >= 0) {
      phrase
        .filter((phraseKey) => phraseKey !== key)
        .forEach((pairKey) => {
          const xyPair = [key, pairKey];
          if (xyPair.every((phraseKey) => counts[phraseKey] > 0)) {
            options.push({ type: 'xy', keys: xyPair, supportNeeded: 0 });
          }
        });
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

function naturalKeziBase(symbol) {
  return cardColorBase(symbol) * 2;
}

function applyJiangMultiplier(amount, symbol, jiangPhraseId) {
  const multiplier = symbol && symbol.phraseId === jiangPhraseId ? 4 : 1;
  return {
    multiplier,
    amount: amount * multiplier,
  };
}

export function scoreOperationMeld(meld, rules = DEFAULT_RULES, context = {}) {
  if (!meld || !Array.isArray(meld.cards) || !meld.cards.length) return null;
  if (meld.type === 'chi') {
    const symbol = meld.cards[0];
    const result = applyJiangMultiplier(1, symbol, context.jiangPhraseId || null);
    return {
      type: 'chi',
      key: meld.key || meld.cards[0].key,
      text: meld.label || '吃',
      baseFu: 1,
      multiplier: result.multiplier,
      fu: result.amount,
      description: '吃牌句子',
    };
  }

  const key = meld.key || meld.cards[0].key;
  const symbols = createSymbolMap(rules);
  const symbol = symbols[key] || meld.cards[0];
  const increment = cardColorBase(symbol);
  const base = meld.type === 'peng' ? increment : naturalKeziBase(symbol);
  const baseFu = base + Math.max(0, meld.cards.length - 3) * increment;
  const result = applyJiangMultiplier(baseFu, symbol, context.jiangPhraseId || null);
  return {
    type: meld.type || 'peng',
    key,
    text: symbol ? symbol.text : key,
    baseFu,
    multiplier: result.multiplier,
    fu: result.amount,
    description: `${symbol ? symbol.text : key}${meld.cards.length}张${meld.label || meld.type || '凑牌'}`,
  };
}

export function calculateOperationFu(melds = [], rules = DEFAULT_RULES, context = {}) {
  const entries = (melds || [])
    .map((meld) => scoreOperationMeld(meld, rules, context))
    .filter(Boolean);
  return {
    totalFu: entries.reduce((total, entry) => total + entry.fu, 0),
    entries,
    jiangPhraseId: context.jiangPhraseId || null,
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

function isHeavyRoundSettlement(grade, totalFu = 0, rules = DEFAULT_RULES) {
  return Boolean(
    rules.heavyRoundEnabled
    && grade === '场'
    && totalFu >= (rules.heavyRoundFuThreshold || 88)
  );
}

function pointValueForGrade(grade, rules = DEFAULT_RULES, totalFu = 0) {
  const payments = rules.huPayments || {};
  const base = rules.basePoint || 1;
  const normalPoint = payments[grade] || (
    grade === '场' ? base * 4 : (grade === '大甲' || grade === '小甲' ? base * 2 : base)
  );
  if (isHeavyRoundSettlement(grade, totalFu, rules)) {
    return normalPoint * (rules.heavyRoundMultiplier || 2);
  }
  return normalPoint;
}

function calculateRoundScores(seatCount, payments = []) {
  const scores = {};
  for (let seat = 0; seat < seatCount; seat += 1) scores[seat] = 0;
  payments.forEach((payment) => {
    const points = Number(payment.points) || 0;
    scores[payment.from] = (scores[payment.from] || 0) - points;
    scores[payment.to] = (scores[payment.to] || 0) + points;
  });
  return scores;
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
      const increment = cardColorBase(symbol);
      const base = door.meldType === 'peng' ? increment : naturalKeziBase(symbol);
      const baseResult = applyJiangMultiplier(base, symbol, jiangPhraseId);
      entries.push({
        type: door.meldType === 'peng' ? 'peng' : 'natural-keitzi',
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
        const extraBase = extraCards * increment;
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

  doors
    .filter((door) => door.type === 'xyz')
    .forEach((door) => {
      const key = door.keys[0];
      const symbol = symbols[key];
      const result = applyJiangMultiplier(1, symbol, jiangPhraseId);
      entries.push({
        type: 'xyz',
        key,
        text: symbol ? symbol.phraseText : key,
        baseFu: 1,
        multiplier: result.multiplier,
        fu: result.amount,
        description: `${symbol ? symbol.phraseText : key}原句`,
      });
      totalFu += result.amount;
    });

  const grade = classifyHuGrade(doors, totalFu);
  const points = pointValueForGrade(grade, rules, totalFu);
  const heavyRound = isHeavyRoundSettlement(grade, totalFu, rules);
  return {
    totalFu,
    entries,
    grade,
    basePoint: rules.basePoint || 1,
    points,
    heavyRound,
    heavyRoundThreshold: rules.heavyRoundFuThreshold || 88,
    heavyRoundMultiplier: heavyRound ? (rules.heavyRoundMultiplier || 2) : 1,
    jiangPhraseId,
    hasJiangMultiplier: entries.some((entry) => entry.multiplier > 1),
  };
}

export { calculateRoundScores, classifyHuGrade, isHeavyRoundSettlement, pointValueForGrade };

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
  const payType = rules.circleLossPayType || 'pihu';
  const paymentsByType = rules.circleLossPayments || {};
  const point = paymentsByType[payType] || rules.circleLossPoint || rules.basePoint || 1;
  const winners = seats.map((seat) => seat.id).filter((seat) => seat !== loser);
  const payments = winners.map((winner) => ({ from: loser, to: winner, points: point }));
  return {
    type: 'circle-loss',
    loser,
    winners,
    reason,
    summary: `${seats[loser].name}进圈，三家赢`,
    score: point,
    roundScores: calculateRoundScores(seats.length, payments),
    settlement: {
      point,
      payType,
      payments,
    },
  };
}

export function applyMeldCards(seat, incomingCard, action, rules = DEFAULT_RULES) {
  const removed = findCardsByKeys(seat.hand, action.keys);
  const nextHand = removeCardsByKeys(seat.hand, action.keys).cards;
  const cards = sortCards(removed.concat([incomingCard]), rules);
  return { hand: sortCards(nextHand, rules), cards };
}
