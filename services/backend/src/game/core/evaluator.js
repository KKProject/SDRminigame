/**
 * 规则判定与计分核心（evaluator.js）
 *
 * 本模块为纯函数，无副作用，被 engine / ai / room 调用。
 *
 * 功能分区：
 *   1. 发牌与接庄   dealOpeningHands, findTakeoverEligibleSeats
 *   2. 动作枚举     findChi/Peng/Zhao/TaActions, findAppearingCardActions
 *   3. 出牌合法性   isLegalDiscard, getLegalDiscards
 *   4. 八门分解     decomposeDoors, buildDoorOptions（胡牌结构）
 *   5. 计福计分     calculateHuScoring, classifyHuGrade
 *   6. 听牌/胡牌     evaluateWin, isListening
 *   7. 招踏对子     validateSupportPairs, validateSupportPairObligations
 *
 * 「门」概念：胡牌需 8 门 = 明牌 melds + 手牌暗分解。
 * 门类型：xyz（原句吃）、xy（二字搭）、same（同字 3+）、xx（对子，作挂载）
 */
const {
  ACTION_LABELS,
  ACTION_PRIORITY,
  DEFAULT_RULES,
  createSymbolMap,
  getPhraseKeysForKey,
} = require('./rules');
const {
  countByKey,
  countByPhrase,
  createSupportPairProof,
  nextSeat,
  removeCardsByKeys,
  sortCards,
} = require('./cards');

// ===================== 手牌计数工具 =====================

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

/** 逆时针下家（发牌顺序与响应顺序共用） */
function counterclockwiseSeat(seat, rules = DEFAULT_RULES) {
  return nextSeat(seat, rules);
}

/**
 * 开局发牌：按座位逆时针轮流发至目标张数。
 * 庄家 23 张（最后一张为将牌 jiangCard），闲家 22 张。
 */
function dealOpeningHands(deck, dealerSeat, rules = DEFAULT_RULES) {
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

/** 手牌中是否存在任意 key 数量 >= 3（刻子） */
function hasTriplet(cards) {
  return Object.keys(countByKey(cards)).some((key) => countByKey(cards)[key] >= 3);
}

/** 滑庄时按座位顺序（跳过庄家）找出有刻子可接庄的座位 */
function findTakeoverEligibleSeats(seats, dealerSeat, rules = DEFAULT_RULES) {
  const eligible = [];
  for (let offset = 1; offset < rules.seatCount; offset++) {
    const seat = (dealerSeat + offset) % rules.seatCount;
    if (hasTriplet(seats[seat].hand)) eligible.push(seat);
  }
  return eligible;
}

function phraseHasComplete(hand, phraseId, rules = DEFAULT_RULES) {
  const symbols = createSymbolMap(rules);
  const phraseKeys = rules.phrases.find((phrase) => phrase.id === phraseId).keys;
  const counts = countByKey(hand);
  return phraseKeys.every((key) => counts[key] > 0 && symbols[key]);
}

function getCompletePhraseKeys(hand, rules = DEFAULT_RULES) {
  return rules.phrases
    .filter((phrase) => phraseHasComplete(hand, phrase.id, rules))
    .reduce((keys, phrase) => keys.concat(phrase.keys), []);
}

function getPhraseCardCount(hand, phraseId) {
  return hand.filter((card) => card.phraseId === phraseId).length;
}

/** 是否为上家（出牌吃牌规则：仅上家可吃） */
function isPreviousSeat(sourceSeat, seatIndex, rules = DEFAULT_RULES) {
  return nextSeat(sourceSeat, rules) === seatIndex;
}

/**
 * 响应座位轮转顺序。摸牌时可 includeSource 让摸牌者先响应（自摸/自招）。
 */
function responseSeatOrder(sourceSeat, rules = DEFAULT_RULES, options = {}) {
  const includeSource = Boolean(options.includeSource);
  const order = [];
  let seat = includeSource ? sourceSeat : nextSeat(sourceSeat, rules);
  while (order.length < rules.seatCount - (includeSource ? 0 : 1)) {
    order.push(seat);
    seat = nextSeat(seat, rules);
  }
  return order;
}

// ===================== 动作枚举（吃碰招踏胡） =====================

/**
 * 吃：用 incoming 与同句另外两字组成 xyz 门。
 * 限制：仅上家（或摸牌自吃）；已有完整原句不能吃；特殊搭子 xxy 等可能 forced。
 */
function findChiActions(state, seatIndex, incomingCard, sourceSeat, sourceType, rules = DEFAULT_RULES) {
  if (rules.allowChiFromPreviousOnly) {
    const canChiSource = sourceType === 'draw'
      ? sourceSeat === seatIndex || isPreviousSeat(sourceSeat, seatIndex, rules)
      : isPreviousSeat(sourceSeat, seatIndex, rules);
    if (!canChiSource) return [];
  }

  const seat = state.seats[seatIndex];
  if (seat.history && seat.history.chiLocked) return [];
  if (hasDiscardedKey(seat, incomingCard.key)) return [];
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

/** 手牌中同 key 至少 2 张时可碰 */
function canPengWithIncoming(hand, incomingCard) {
  return (countByKey(hand)[incomingCard.key] || 0) >= 2;
}

/** 碰：incoming + 手牌 2 张同 key */
function findPengActions(state, seatIndex, incomingCard, sourceSeat, sourceType, rules = DEFAULT_RULES) {
  const seat = state.seats[seatIndex];
  if (seat.history && seat.history.chiLocked) return [];
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

/**
 * 招：incoming + 手牌 3~5 张同 key（4 张起需对子挂载）。
 * circleLossRisk：对子不足时标为进圈风险，filterHighestPriority 会过滤。
 */
function findZhaoActions(state, seatIndex, incomingCard, sourceSeat, sourceType) {
  const seat = state.seats[seatIndex];
  if (seat.history && seat.history.chiLocked) return [];
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

/** 踏：仅摸牌时，在己方已有招/踏上追加同 key 牌（未满 6 张） */
function findTaActions(state, seatIndex, incomingCard, sourceType) {
  if (sourceType !== 'draw') return [];
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

function findSelfDrawActions(state, seatIndex, drawnCard, rules = DEFAULT_RULES) {
  return []
    .concat(findTaActions(state, seatIndex, drawnCard, 'draw'))
    .concat(findZhaoActions(state, seatIndex, drawnCard, seatIndex, 'draw'))
    .concat(findPengActions(state, seatIndex, drawnCard, seatIndex, 'draw', rules))
    .concat(findChiActions(state, seatIndex, drawnCard, seatIndex, 'draw', rules));
}

/**
 * 汇总某张出现牌的全部可能响应（按座位顺序 + 优先级排序）。
 * 含胡牌检测 evaluateWin。
 */
function findAppearingCardActions(state, sourceSeat, incomingCard, sourceType, rules = DEFAULT_RULES) {
  const actions = [];
  const order = responseSeatOrder(sourceSeat, rules, { includeSource: sourceType === 'draw' });
  order.forEach((seatIndex, responseIndex) => {
    const seat = state.seats[seatIndex];

    const allowWin = sourceType === 'draw' ? rules.allowSelfDrawWin : rules.allowDiscardWin;
    if (allowWin) {
      const win = evaluateWin(seat.hand.concat([incomingCard]), seat.melds, sourceType === 'draw' && seatIndex === sourceSeat ? 'self' : sourceType, rules, {
        jiangPhraseId: state.jiangPhraseId,
      });
      if (win.isWin && !isChiStyleHuBlocked(seat, incomingCard, sourceType, win)) {
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

/** 他人出牌后的响应动作（sourceType = discard） */
function findResponseActions(state, sourceSeat, incomingCard, rules = DEFAULT_RULES) {
  return findAppearingCardActions(state, sourceSeat, incomingCard, 'discard', rules);
}

function highestPriorityActions(actions) {
  if (!actions.length) return [];
  const top = actions[0].priority;
  return actions.filter((action) => action.priority === top);
}

/**
 * 过滤出当前应展示/执行的最高优先级动作集。
 * 特殊：招与碰/吃冲突时同座位的低优先级也保留供选择；
 * 碰与 createsChiLock 的吃冲突时保留吃选项。
 */
function filterHighestPriority(actions) {
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

function isForcedPhrasePattern(hand, incomingCard, rules = DEFAULT_RULES) {
  return Boolean(getSpecialTaziRequirement(hand, incomingCard, rules));
}

/**
 * 特殊搭子（塌子）检测：手牌恰 3 张同句且形如 xxy/yyz/zzx/zzy。
 *  incoming 为缺失字时吃/碰为 forced（必须操作，否则过则进圈）。
 */
function getSpecialTaziRequirement(hand, incomingCard, rules = DEFAULT_RULES, actionType = null) {
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

/** 放弃吃后的惩罚键，格式 phraseId:key，同键再次吃会进圈 */
function createChiPenaltyKey(actionOrCard) {
  const card = actionOrCard.card || actionOrCard;
  return `${card.phraseId}:${card.key}`;
}

/** 招/踏 N 张（N>=4）需挂载的对子数：N-3 */
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

/** 单组招/踏的对子挂载是否满足（手牌中可用对子数） */
function validateSupportPairs(hand, sameKeyGroupCards, rules = DEFAULT_RULES) {
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

/**
 * 多组招/踏的对子义务联合校验（对子不能复用）。
 * 回溯分配 pairKeys，失败则招踏后进圈。
 */
function validateSupportPairObligations(hand, highOrderGroups = [], rules = DEFAULT_RULES) {
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

/** 手牌中某句是否恰有 3 张且每字 1 张（完整原句，不可打出其中任一张） */
function phraseHasExactComplete(hand, phraseId, rules = DEFAULT_RULES) {
  const phrase = rules.phrases.find((item) => item.id === phraseId);
  if (!phrase) return false;
  const phraseCards = hand.filter((card) => card.phraseId === phraseId);
  if (phraseCards.length !== phrase.keys.length) return false;
  const counts = countByKey(phraseCards);
  return phrase.keys.every((key) => counts[key] === 1);
}

// ===================== 出牌合法性 =====================

/**
 * 计算一手牌中各句「发牌那一刻」能组成的完整原句数（用于锁定下限）。
 *
 * 原句 = 某句三字（x/y/z）各至少一张可凑成的一组，
 * 该句原句数 = min(cx, cy, cz)。仅记录 > 0 的句子。
 *
 * 在 startRound 发牌后调用一次，结果写入 seat.history.lockedPhraseTriplets，
 * 之后摸牌/吃碰均不再改变此基准。
 *
 * @returns {{ [phraseId]: number }} 各句锁定的原句数
 */
function computePhraseTripletLocks(hand, rules = DEFAULT_RULES) {
  const counts = countByKey(hand);
  return rules.phrases.reduce((locks, phrase) => {
    const min = Math.min(...phrase.keys.map((key) => counts[key] || 0));
    if (min > 0) locks[phrase.id] = min;
    return locks;
  }, {});
}

function isDiscardHistoryEntry(entry) {
  return entry && (entry.type === 'discard' || entry.type === 'auto-discard-draw');
}

function discardedKeyCounts(seat, keys) {
  const keySet = new Set(keys);
  return ((seat.history && seat.history.actionHistory) || []).reduce((counts, entry) => {
    if (isDiscardHistoryEntry(entry) && keySet.has(entry.key)) {
      counts[entry.key] = (counts[entry.key] || 0) + 1;
    }
    return counts;
  }, {});
}

function hasDiscardedKey(seat, key) {
  return ((seat.history && seat.history.actionHistory) || [])
    .some((entry) => isDiscardHistoryEntry(entry) && entry.key === key);
}

function isChiStyleHuBlocked(seat, incomingCard, sourceType, win) {
  if (sourceType !== 'discard' || !hasDiscardedKey(seat, incomingCard.key)) return false;
  return ((win && win.doors) || []).some((door) => (
    (door.type === 'xy' || door.type === 'xyz')
    && (door.keys || []).indexOf(incomingCard.key) >= 0
  ));
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

/**
 * 判断同句出牌后是否仍保留可达门子。
 * 常规路径要求后续能在出牌上限内留下 xyz 或 xxx/yyy/zzz；
 * 特例允许 xxyyz 先打单张 z 后停止，后续同句牌会被本函数拒绝。
 */
function canDiscardPreservingPhraseDoor(seat, card, rules = DEFAULT_RULES) {
  const phraseKeys = getPhraseKeysForKey(card.key, rules);
  if (phraseKeys.length !== 3) return true;

  const handCounts = countByKey(seat.hand || []);
  const discardedCounts = discardedKeyCounts(seat, phraseKeys);
  const currentTotal = sumCounts(handCounts, phraseKeys);
  const discardedTotal = sumCounts(discardedCounts, phraseKeys);
  const originalTotal = currentTotal + discardedTotal;
  if (originalTotal <= 3) {
    return !phraseKeys.every((key) => (handCounts[key] || 0) > 0);
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

/**
 * 判断能否打出 card。
 * 规则：
 *   1. 特殊搭子凑牌后必须先打出指定剩余牌（forcedDiscardCardId）；
 *   2. 同句出牌后必须仍保留可达门子（见 canDiscardPreservingPhraseDoor）。
 */
function isLegalDiscard(seat, card, rules = DEFAULT_RULES) {
  const history = seat.history || { discardPhraseCounts: {} };
  if (history.forcedDiscardCardId && card.id !== history.forcedDiscardCardId) {
    return { legal: false, reason: '特殊搭子凑牌后必须先打出剩余牌' };
  }
  if (!canDiscardPreservingPhraseDoor(seat, card, rules)) {
    return { legal: false, reason: '同句出牌后必须保留可成门路径' };
  }
  return { legal: true };
}

function getLegalDiscards(seat, rules = DEFAULT_RULES) {
  return (seat.hand || []).filter((card) => isLegalDiscard(seat, card, rules).legal);
}

// ===================== 八门分解（胡牌结构） =====================

/**
 * 从当前手牌计数生成一种「门」的候选拆法（贪心取第一个可用 key）。
 * 门类型：same(3~6同字)、xyz(原句)、xy(二字搭)、xx(对子)
 */
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

/** 校验暗牌分解中 xx 对子是否足够支撑 same 门的 supportNeeded */
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

/**
 * 回溯将手牌计数分解为 targetDoorCount 门。
 * 胡牌条件：恰好 8 门、其中 xy 恰好 1 个、对子挂载合法。
 */
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

/** 将桌面明牌 melds 转为门结构，参与胡牌判定 */
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

/** 手牌或明牌中是否存在刻子（3+ 同字或碰招踏） */
function hasKezi(cards, melds = []) {
  const counts = countByKey(cards);
  if (Object.keys(counts).some((key) => counts[key] >= 3)) return true;
  return melds.some((meld) => meld.type !== 'chi' && meld.cards.length >= 3);
}

// ===================== 计福与胡牌档位 =====================

/** 句首字（position=0）基福 4，其余字基福 2 */
function cardColorBase(symbol) {
  return symbol && symbol.position === 0 ? 4 : 2;
}

function naturalKeziBase(symbol) {
  return cardColorBase(symbol) * 2;
}

/** 将牌（jiang）所在句子的牌计福 ×4 */
function applyJiangMultiplier(amount, symbol, jiangPhraseId) {
  const multiplier = symbol && symbol.phraseId === jiangPhraseId ? 4 : 1;
  return {
    multiplier,
    amount: amount * multiplier,
  };
}

function scoreOperationMeld(meld, rules = DEFAULT_RULES, context = {}) {
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

function calculateOperationFu(melds = [], rules = DEFAULT_RULES, context = {}) {
  const entries = (melds || [])
    .map((meld) => scoreOperationMeld(meld, rules, context))
    .filter(Boolean);
  return {
    totalFu: entries.reduce((total, entry) => total + entry.fu, 0),
    entries,
    jiangPhraseId: context.jiangPhraseId || null,
  };
}

/**
 * 胡牌档位：场(44+福)、大甲(33~43)、小甲(7xyz+1xy)、屁胡。
 */
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

function calculateHuScoring(doors, rules = DEFAULT_RULES, context = {}) {
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

/**
 * 胡牌判定：明牌 + 手牌暗分解为 8 门且结构合法则 isWin。
 * @param {string} source - 'self' 自摸 | 'discard' 点炮
 * @param {object} context - { jiangPhraseId } 将牌句用于计福翻倍
 */
function evaluateWin(cards, melds = [], source = 'self', rules = DEFAULT_RULES, context = {}) {
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

/**
 * 听牌：是否存在某张补牌使 evaluateWin 成立。
 * options.requiresKezi：接庄听牌检查须含刻子。
 */
function isListening(hand, melds = [], rules = DEFAULT_RULES, options = {}) {
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

/** 构建进圈结算结构：loser 付其余三家各 circleLossPoint 分 */
function buildCircleLossResult(loser, seats, reason, rules = DEFAULT_RULES) {
  const point = rules.circleLossPoint || rules.basePoint || 1;
  const winners = seats.map((seat) => seat.id).filter((seat) => seat !== loser);
  return {
    type: 'circle-loss',
    loser,
    winners,
    reason,
    summary: `${seats[loser].name}进圈，三家赢`,
    score: point,
    settlement: {
      point,
      payments: winners.map((winner) => ({ from: loser, to: winner, points: point })),
    },
  };
}

/** 执行吃碰招：从手牌移除 action.keys 对应牌，与 incoming 组成 meld.cards */
function applyMeldCards(seat, incomingCard, action, rules = DEFAULT_RULES) {
  const removed = findCardsByKeys(seat.hand, action.keys);
  const nextHand = removeCardsByKeys(seat.hand, action.keys).cards;
  const cards = sortCards(removed.concat([incomingCard]), rules);
  return { hand: sortCards(nextHand, rules), cards };
}

module.exports = {
  counterclockwiseSeat,
  dealOpeningHands,
  hasTriplet,
  findTakeoverEligibleSeats,
  phraseHasComplete,
  getCompletePhraseKeys,
  getPhraseCardCount,
  isPreviousSeat,
  responseSeatOrder,
  findChiActions,
  canPengWithIncoming,
  findPengActions,
  findZhaoActions,
  findTaActions,
  findSelfDrawActions,
  findAppearingCardActions,
  findResponseActions,
  highestPriorityActions,
  filterHighestPriority,
  isForcedPhrasePattern,
  getSpecialTaziRequirement,
  createChiPenaltyKey,
  validateSupportPairs,
  validateSupportPairObligations,
  computePhraseTripletLocks,
  isLegalDiscard,
  getLegalDiscards,
  hasKezi,
  scoreOperationMeld,
  calculateOperationFu,
  calculateHuScoring,
  evaluateWin,
  isListening,
  buildCircleLossResult,
  applyMeldCards,
  classifyHuGrade,
  pointValueForGrade,
};
