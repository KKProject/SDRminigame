const { chooseAcceptTakeover, chooseDiscard, chooseResponse } = require('./ai');
const {
  createActionHistoryEntry,
  createAppearingCard,
  createDeck,
  createSeats,
  nextSeat,
  removeCardsByIds,
  shuffleDeck,
  sortCards,
} = require('./cards');
const {
  ACTION_LABELS,
  APPEARING_CARD_SOURCES,
  DEFAULT_RULES,
  DRAW_ROUND_REASONS,
  PHASES,
  RESULT_TYPES,
} = require('./rules');
const {
  applyMeldCards,
  buildCircleLossResult,
  createChiPenaltyKey,
  dealOpeningHands,
  evaluateWin,
  filterHighestPriority,
  findAppearingCardActions,
  findResponseActions,
  findTakeoverEligibleSeats,
  getLegalDiscards,
  hasKezi,
  hasTriplet,
  isLegalDiscard,
  isListening,
  validateSupportPairObligations,
  validateSupportPairs,
} = require('./evaluator');

class HuapaiEngine {
  constructor(rules = DEFAULT_RULES) {
    this.rules = rules;
    this.music = null;
    this.state = null;
  }

  // 加载已有权威状态（用于从数据库恢复后继续推进）。
  load(state) {
    this.state = state;
    if (state && state.rules) {
      this.rules = state.rules;
    }
    return this;
  }

  /**
   * 开局。
   * options: { seed, dealerSeat, players, round }
   * players: 长度为座位数的数组，每项 { openid, nickName, avatarUrl, isHuman }。
   */
  startRound(options = {}) {
    const { seed, players = [] } = options;
    const prevRound = (this.state && this.state.round) || 0;
    const prevNextDealer = this.state && typeof this.state.nextDealerSeat === 'number'
      ? this.state.nextDealerSeat
      : null;
    const roundDealer = typeof options.dealerSeat === 'number'
      ? options.dealerSeat
      : (typeof prevNextDealer === 'number' ? prevNextDealer : this.rules.dealerSeat);
    const roundSeed = typeof seed === 'number' ? seed : Date.now();
    const deck = shuffleDeck(createDeck(this.rules), roundSeed);
    const seats = createSeats(this.rules, roundDealer);
    const opening = dealOpeningHands(deck, roundDealer, this.rules);

    seats.forEach((seat, seatIndex) => {
      seat.hand = opening.hands[seatIndex];
      const player = players[seatIndex] || {};
      seat.isHuman = Boolean(player.isHuman);
      seat.openid = player.openid || null;
      seat.nickName = player.nickName || seat.name;
      seat.avatarUrl = player.avatarUrl || '';
      seat.online = player.online !== false;
    });

    this.state = {
      rules: this.rules,
      seats,
      deck: opening.deck,
      phase: PHASES.HUMAN_DISCARD,
      currentSeat: roundDealer,
      dealerSeat: roundDealer,
      nextDealerSeat: roundDealer,
      slippedDealer: null,
      takeoverDealer: null,
      takeoverQueue: [],
      jiangCard: opening.jiangCard,
      jiangPhraseId: opening.jiangPhraseId,
      appearingCard: null,
      drawnCard: null,
      selectedCardId: null,
      recentDiscard: null,
      pendingActions: [],
      playerActions: [],
      feedback: `庄家${seats[roundDealer].nickName}开局，将牌${opening.jiangCard ? opening.jiangCard.text : ''}`,
      result: null,
      round: prevRound + 1,
      seed: roundSeed,
    };

    if (!hasTriplet(seats[roundDealer].hand)) {
      this.enterDealerSlip(roundDealer);
      return this;
    }

    this.enterDiscardPhase(roundDealer, '庄家先出牌');
    return this;
  }

  setFeedback(text) {
    this.state.feedback = text;
  }

  enterDealerSlip(dealerSeat) {
    const state = this.state;
    const queue = findTakeoverEligibleSeats(state.seats, dealerSeat, this.rules);
    state.slippedDealer = dealerSeat;
    state.takeoverQueue = queue;
    state.feedback = `${state.seats[dealerSeat].name}无刻子，滑庄`;
    if (!queue.length) {
      this.finishDrawRound('无人有刻子接庄');
      return;
    }
    this.processTakeoverQueue();
  }

  processTakeoverQueue() {
    const state = this.state;
    if (!state.takeoverQueue.length) {
      this.finishDrawRound('无人接庄');
      return;
    }
    const seatIndex = state.takeoverQueue[0];
    const seat = state.seats[seatIndex];
    state.currentSeat = seatIndex;
    if (seat.isHuman) {
      state.phase = PHASES.TAKEOVER_CHOICE;
      state.playerActions = [
        { type: 'acceptTakeover', seat: seatIndex, label: ACTION_LABELS.acceptTakeover },
        { type: 'declineTakeover', seat: seatIndex, label: ACTION_LABELS.declineTakeover },
      ];
      this.setFeedback('你有刻子，可选择接庄；接庄后三次凑牌内需听牌');
      return;
    }

    this.scheduleAI(() => {
      if (chooseAcceptTakeover(seat)) {
        this.acceptTakeover(seatIndex);
      } else {
        this.declineTakeover(seatIndex);
      }
    }, `${seat.name}考虑是否接庄`);
  }

  acceptTakeover(seatIndex) {
    const state = this.state;
    const slipped = state.seats[state.slippedDealer];
    const taker = state.seats[seatIndex];
    const jiang = state.jiangCard;

    if (jiang) {
      const removed = removeCardsByIds(slipped.hand, [jiang.id]);
      slipped.hand = removed.cards;
      taker.hand = sortCards(taker.hand.concat(removed.removed), this.rules);
    }

    state.seats.forEach((seat) => {
      seat.isDealer = seat.id === seatIndex;
    });
    taker.history.takeover = true;
    taker.history.takeoverOperations = 0;
    state.dealerSeat = seatIndex;
    state.takeoverDealer = seatIndex;
    state.takeoverQueue = [];
    state.playerActions = [];
    this.enterDiscardPhase(seatIndex, `${taker.name}接庄，先出牌`);
  }

  declineTakeover(seatIndex) {
    const state = this.state;
    state.takeoverQueue = state.takeoverQueue.filter((seat) => seat !== seatIndex);
    state.playerActions = [];
    this.setFeedback(`${state.seats[seatIndex].name}不接庄`);
    this.processTakeoverQueue();
  }

  finishDrawRound(reason) {
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    const state = this.state;
    const nextDealer = nextSeat(state.slippedDealer, this.rules);
    state.nextDealerSeat = nextDealer;
    state.phase = PHASES.RESULT;
    state.playerActions = [];
    state.result = {
      type: RESULT_TYPES.DRAW_ROUND,
      reasonCode: DRAW_ROUND_REASONS.SLIP_NO_TAKEOVER,
      nextDealer,
      reason,
      summary: `${reason}，下局${state.seats[nextDealer].name}坐庄`,
    };
  }

  finishLowDeckDrawRound() {
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    const state = this.state;
    state.nextDealerSeat = state.dealerSeat;
    state.phase = PHASES.RESULT;
    state.playerActions = [];
    state.pendingActions = [];
    state.appearingCard = null;
    state.drawnCard = null;
    state.result = {
      type: RESULT_TYPES.DRAW_ROUND,
      reasonCode: DRAW_ROUND_REASONS.LOW_DECK,
      nextDealer: state.dealerSeat,
      reason: '牌堆少于15张',
      summary: '牌堆少于15张流局，庄家不变',
    };
  }

  enterDiscardPhase(seatIndex, feedback) {
    const state = this.state;
    const seat = state.seats[seatIndex];
    if (seat.hand.length && !getLegalDiscards(seat, this.rules).length) {
      this.finishCircleLoss(seatIndex, '没有可合法打出的牌，进圈');
      return;
    }
    state.currentSeat = seatIndex;
    state.appearingCard = null;
    state.drawnCard = null;
    state.selectedCardId = null;
    state.pendingActions = [];
    state.playerActions = [];
    state.phase = seat.isHuman ? PHASES.HUMAN_DISCARD : PHASES.AI_THINKING;
    this.setFeedback(feedback);
    if (!seat.isHuman) {
      this.scheduleAI(() => this.aiDiscard(seatIndex));
    }
  }

  discardCard(seatIndex, cardId, options = {}) {
    const state = this.state;
    const seat = state.seats[seatIndex];
    const drawn = options.drawnCard || null;
    const card = drawn || seat.hand.find((item) => item.id === cardId);

    if (!card || state.phase === PHASES.RESULT) {
      this.setFeedback('这张牌不能打出');
      return;
    }

    if (!drawn) {
      const legal = isLegalDiscard(seat, card, this.rules);
      if (!legal.legal) {
        if (seat.isHuman) {
          this.setFeedback(legal.reason);
          return;
        }
        this.finishCircleLoss(seatIndex, legal.reason);
        return;
      }
      seat.hand = seat.hand.filter((item) => item.id !== cardId);
      this.clearForcedDiscardIfSatisfied(seat, card);
    }

    if (!drawn && seat.history.pendingTakeoverListeningCheck) {
      seat.history.pendingTakeoverListeningCheck = false;
      seat.history.listening = isListening(seat.hand, seat.melds, this.rules, {
        requiresKezi: true,
        jiangPhraseId: this.state.jiangPhraseId,
      });
      if (!seat.history.listening) {
        this.finishCircleLoss(seatIndex, '接庄后三次凑牌并出牌后仍未听牌');
        return;
      }
    }

    const source = drawn ? APPEARING_CARD_SOURCES.DRAW : APPEARING_CARD_SOURCES.DISCARD;
    state.appearingCard = createAppearingCard({
      card,
      source,
      sourceSeat: seatIndex,
      responseStartSeat: drawn ? seatIndex : nextSeat(seatIndex, this.rules),
      allowSourceSeatResponse: Boolean(drawn),
    });

    seat.discards.push(card);
    seat.history.discardPhraseCounts[card.phraseId] = (seat.history.discardPhraseCounts[card.phraseId] || 0) + 1;
    seat.history.actionHistory.push(createActionHistoryEntry('discard', {
      cardId: card.id,
      key: card.key,
      source,
    }));
    state.drawnCard = null;
    state.selectedCardId = null;
    state.recentDiscard = { seat: seatIndex, card };
    if (this.music) this.music.playCardVoice(card);

    const actions = filterHighestPriority(findResponseActions(state, seatIndex, card, this.rules));
    this.handleResponseWindow(actions, seatIndex);
  }

  discardUnclaimedDraw(seatIndex, card) {
    const state = this.state;
    const seat = state.seats[seatIndex];
    seat.discards.push(card);
    seat.history.discardPhraseCounts[card.phraseId] = (seat.history.discardPhraseCounts[card.phraseId] || 0) + 1;
    seat.history.actionHistory.push(createActionHistoryEntry('auto-discard-draw', {
      cardId: card.id,
      key: card.key,
      source: APPEARING_CARD_SOURCES.DRAW,
    }));
    state.drawnCard = null;
    state.appearingCard = null;
    state.recentDiscard = { seat: seatIndex, card, source: APPEARING_CARD_SOURCES.DRAW, unclaimed: true };
    this.setFeedback(`${seat.name}摸牌无人可用，${card.text}进入弃牌区`);
    this.scheduleNextDrawAfterDiscard(seatIndex);
  }

  handleResponseWindow(actions, sourceSeat) {
    const state = this.state;
    state.pendingActions = actions;
    if (!actions.length) {
      this.resolveUnclaimedAppearingCard(sourceSeat);
      return;
    }

    const responseSeat = actions[0].seat;
    const responseActions = actions.filter((action) => action.seat === responseSeat);
    state.currentSeat = responseSeat;

    if (state.seats[responseSeat].isHuman) {
      state.playerActions = responseActions.concat([{ type: 'pass', seat: responseSeat, label: ACTION_LABELS.pass }]);
      state.phase = PHASES.HUMAN_RESPONSE;
      this.setFeedback(this.describeActions('你可以响应这张牌', responseActions));
      return;
    }

    const aiAction = chooseResponse(responseActions);
    if (aiAction) {
      this.scheduleAI(() => this.applyAction(aiAction));
      return;
    }

    this.handleResponseWindow(actions.filter((action) => action.seat !== responseSeat), sourceSeat);
  }

  resolveUnclaimedAppearingCard(sourceSeat) {
    const state = this.state;
    if (state.drawnCard) {
      this.discardUnclaimedDraw(sourceSeat, state.drawnCard);
      return;
    }
    state.pendingActions = [];
    state.playerActions = [];
    state.appearingCard = null;
    if (state.recentDiscard) {
      state.recentDiscard.unclaimed = true;
      state.recentDiscard.resolved = true;
    }
    this.setFeedback(`${state.seats[sourceSeat].name}打出的牌无人响应，进入弃牌区`);
    this.scheduleNextDrawAfterDiscard(sourceSeat);
  }

  scheduleNextDrawAfterDiscard(sourceSeat) {
    const state = this.state;
    const next = nextSeat(sourceSeat, this.rules);
    state.currentSeat = sourceSeat;
    state.pendingActions = [];
    state.playerActions = [];
    state.phase = PHASES.AI_THINKING;
    if (state.phase === PHASES.RESULT) return;
    this.beginTurn(next, true);
  }

  scheduleAfterMeldAnimation(seatIndex, label) {
    const state = this.state;
    state.currentSeat = seatIndex;
    state.pendingActions = [];
    state.playerActions = [];
    state.phase = PHASES.AI_THINKING;
    this.setFeedback(`${state.seats[seatIndex].nickName}${label}，等待动作完成`);
    this.afterGroupingAction(seatIndex, label);
  }

  passResponse(seatIndex) {
    const state = this.state;
    const forcedAction = state.pendingActions.find((action) => action.seat === seatIndex && action.forced);
    if (forcedAction) {
      this.finishCircleLoss(seatIndex, `必须${forcedAction.label}，放弃后进圈`);
      return;
    }

    state.pendingActions
      .filter((action) => action.type === 'chi' && action.seat === seatIndex)
      .forEach((action) => {
        const key = createChiPenaltyKey(action);
        state.seats[seatIndex].history.declinedChiPenaltyKeys.push(key);
        state.seats[seatIndex].history.declinedChiKeys.push(action.card.key);
      });

    const remaining = state.pendingActions.filter((action) => action.seat !== seatIndex);
    state.pendingActions = remaining;
    state.playerActions = [];
    const source = state.appearingCard
      ? state.appearingCard.sourceSeat
      : (state.recentDiscard ? state.recentDiscard.seat : state.currentSeat);
    this.handleResponseWindow(remaining, source);
  }

  validateSeatSupportPairs(seat) {
    const highOrderGroups = seat.melds.filter((meld) => (meld.type === 'zhao' || meld.type === 'ta') && meld.cards.length >= 4);
    const support = validateSupportPairObligations(seat.hand, highOrderGroups, this.rules);
    seat.history.supportPairProofs = support.proofs || [];
    return support;
  }

  setForcedRemainderDiscard(seat, action, consumedCards) {
    if (!action.forced) return;
    const consumedIds = new Set(consumedCards.map((card) => card.id));
    const remaining = seat.hand.filter((card) => (
      card.phraseId === action.card.phraseId
      && !consumedIds.has(card.id)
    ));
    if (remaining.length === 1) {
      seat.history.forcedDiscardCardId = remaining[0].id;
      seat.history.forcedAction = {
        type: action.type,
        pattern: action.forcedPattern || null,
        phraseId: action.card.phraseId,
      };
    }
  }

  clearForcedDiscardIfSatisfied(seat, card) {
    if (seat.history.forcedDiscardCardId === card.id) {
      seat.history.forcedDiscardCardId = null;
      seat.history.forcedAction = null;
    }
  }

  applyAction(action) {
    if (action.type === 'hu') {
      this.finishWin(action.seat, action.card, action.win);
      return;
    }
    if (action.type === 'ta') {
      this.applyTa(action);
      return;
    }

    const state = this.state;
    const seat = state.seats[action.seat];
    const incoming = state.drawnCard || (state.recentDiscard && state.recentDiscard.card);
    if (!incoming) {
      this.setFeedback('没有可响应的牌');
      return;
    }

    if (action.type === 'chi' && seat.history.declinedChiPenaltyKeys.indexOf(createChiPenaltyKey(action)) >= 0) {
      this.finishCircleLoss(action.seat, '前次放弃吃牌后再次选择吃，进圈');
      return;
    }
    if ((action.type === 'peng' || action.type === 'zhao') && seat.history.chiLocked) {
      this.finishCircleLoss(action.seat, '碰吃冲突选择吃后又进行碰招踏，进圈');
      return;
    }

    if (state.recentDiscard && state.recentDiscard.seat !== action.seat) {
      const sourceSeat = state.seats[state.recentDiscard.seat];
      sourceSeat.discards = sourceSeat.discards.filter((card) => card.id !== incoming.id);
    }

    const applied = applyMeldCards(seat, incoming, action, this.rules);
    seat.hand = applied.hand;
    this.setForcedRemainderDiscard(seat, action, applied.cards);
    const meld = {
      id: `${action.type}-${Date.now()}-${Math.random()}`,
      type: action.type,
      label: action.label,
      key: incoming.key,
      cards: applied.cards,
      from: action.sourceSeat,
    };
    seat.melds.push(meld);
    if (action.type === 'chi' && action.createsChiLock) {
      seat.history.chiLocked = true;
      seat.history.chiLockSource = {
        phraseId: incoming.phraseId,
        key: incoming.key,
      };
    }

    if (action.type === 'zhao') {
      const support = validateSupportPairs(seat.hand, meld.cards, this.rules);
      seat.history.supportPairObligations.push({
        key: incoming.key,
        size: meld.cards.length,
        needed: support.needed,
        pairKeys: support.pairKeys || [],
      });
      seat.history.supportPairProofs.push(support);
      const allSupport = support.valid ? this.validateSeatSupportPairs(seat) : support;
      if (!allSupport.valid) {
        this.finishCircleLoss(action.seat, allSupport.reason || support.reason);
        return;
      }
    }

    state.appearingCard = null;
    state.drawnCard = null;
    state.recentDiscard = null;
    state.pendingActions = [];
    state.playerActions = [];
    state.currentSeat = action.seat;
    if (this.music) this.music.playActionVoice(action.type);
    this.scheduleAfterMeldAnimation(action.seat, action.label);
  }

  applyTa(action) {
    const state = this.state;
    const owner = state.seats[action.ownerSeat];
    const actingSeat = state.seats[action.seat];
    if (actingSeat.history.chiLocked) {
      this.finishCircleLoss(action.seat, '碰吃冲突选择吃后又进行碰招踏，进圈');
      return;
    }
    const meld = owner.melds.find((item) => item.id === action.meldId);
    if (!meld || !state.drawnCard) {
      this.setFeedback('无法踏牌');
      return;
    }
    meld.cards = sortCards(meld.cards.concat([state.drawnCard]), this.rules);
    meld.type = 'ta';
    meld.label = ACTION_LABELS.ta;
    const support = validateSupportPairs(state.seats[action.seat].hand, meld.cards, this.rules);
    state.seats[action.seat].history.supportPairObligations.push({
      key: state.drawnCard.key,
      size: meld.cards.length,
      needed: support.needed,
      pairKeys: support.pairKeys || [],
    });
    state.seats[action.seat].history.supportPairProofs.push(support);
    const allSupport = support.valid ? this.validateSeatSupportPairs(actingSeat) : support;
    if (!allSupport.valid) {
      this.finishCircleLoss(action.seat, allSupport.reason || support.reason);
      return;
    }
    state.appearingCard = null;
    state.drawnCard = null;
    state.pendingActions = [];
    state.playerActions = [];
    if (this.music) this.music.playActionVoice('ta');
    this.scheduleAfterMeldAnimation(action.seat, ACTION_LABELS.ta);
  }

  afterGroupingAction(seatIndex, label) {
    const seat = this.state.seats[seatIndex];
    if (seat.isDealer && !hasKezi(seat.hand, seat.melds)) {
      this.finishCircleLoss(seatIndex, '庄家吃后无刻子，进圈');
      return;
    }
    if (seat.history.takeover) {
      seat.history.takeoverOperations += 1;
      if (seat.history.takeoverOperations >= this.rules.takeoverOperationLimit) {
        seat.history.pendingTakeoverListeningCheck = true;
      }
    }
    this.enterDiscardPhase(seatIndex, `${label}后，请出牌`);
  }

  beginTurn(seatIndex, needsDraw) {
    const state = this.state;
    state.currentSeat = seatIndex;
    state.pendingActions = [];
    state.playerActions = [];
    state.selectedCardId = null;
    state.recentDiscard = null;

    if (!needsDraw) {
      this.enterDiscardPhase(seatIndex, '请出牌');
      return;
    }
    if (state.deck.length < this.rules.lowDeckDrawThreshold) {
      this.finishLowDeckDrawRound();
      return;
    }
    if (!state.deck.length) {
      this.finishDraw();
      return;
    }

    const seat = state.seats[seatIndex];
    const drawnCard = state.deck.shift();
    state.appearingCard = createAppearingCard({
      card: drawnCard,
      source: APPEARING_CARD_SOURCES.DRAW,
      sourceSeat: seatIndex,
      responseStartSeat: seatIndex,
      allowSourceSeatResponse: true,
    });
    state.drawnCard = drawnCard;
    if (this.music) this.music.playCardVoice(drawnCard);
    const actions = filterHighestPriority(findAppearingCardActions(state, seatIndex, drawnCard, APPEARING_CARD_SOURCES.DRAW, this.rules));
    if (!actions.length) {
      this.discardUnclaimedDraw(seatIndex, drawnCard);
      return;
    }

    this.handleResponseWindow(actions, seatIndex);
  }

  aiDiscard(seatIndex) {
    const seat = this.state.seats[seatIndex];
    const card = chooseDiscard(seat, this.rules);
    if (!card) {
      this.finishDraw();
      return;
    }
    this.discardCard(seatIndex, card.id);
  }

  describeActions(prefix, actions) {
    if (!actions.length) return prefix;
    if (actions.some((action) => action.forced)) return `${prefix}，有必须操作，放弃进圈`;
    const zhaoOrTa = actions.find((action) => action.type === 'zhao' || action.type === 'ta');
    if (zhaoOrTa) return `${prefix}，可${zhaoOrTa.label}，需满足对子挂载`;
    return `${prefix}，可选择凑牌或打出`;
  }

  scheduleAI(callback, feedback) {
    this.state.phase = PHASES.AI_THINKING;
    this.state.playerActions = [];
    this.setFeedback(feedback || `${this.state.seats[this.state.currentSeat].nickName} 正在思考`);
    callback();
  }

  finishWin(winner, card, win) {
    if (this.aiTimer) {
      clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }
    if (this.advanceTimer) {
      clearTimeout(this.advanceTimer);
      this.advanceTimer = null;
    }
    this.state.phase = PHASES.RESULT;
    this.state.pendingActions = [];
    this.state.playerActions = [];
    this.state.selectedCardId = null;
    this.state.appearingCard = null;
    this.state.drawnCard = null;
    this.state.recentDiscard = null;
    const point = win.points || 0;
    const payers = this.state.seats.map((seat) => seat.id).filter((seat) => seat !== winner);
    const payments = payers.map((payer) => ({ from: payer, to: winner, points: point }));
    payments.forEach((payment) => {
      this.state.seats[payment.from].score -= payment.points;
      this.state.seats[payment.to].score += payment.points;
    });
    this.state.result = {
      type: RESULT_TYPES.WIN,
      winner,
      card,
      summary: win.summary,
      score: point * payers.length,
      scoring: win.scoring,
      grade: win.grade,
      points: win.points,
      settlement: {
        point,
        payments,
      },
      jiangPhraseId: this.state.jiangPhraseId,
      pattern: win.pattern,
      doors: win.doors,
    };
    if (this.music) this.music.playActionVoice('hu');
  }

  finishCircleLoss(loser, reason) {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    const result = buildCircleLossResult(loser, this.state.seats, reason, this.rules);
    this.state.phase = PHASES.RESULT;
    this.state.pendingActions = [];
    this.state.playerActions = [];
    this.state.selectedCardId = null;
    this.state.appearingCard = null;
    this.state.drawnCard = null;
    this.state.result = result;
    result.settlement.payments.forEach((payment) => {
      this.state.seats[payment.from].score -= payment.points;
      this.state.seats[payment.to].score += payment.points;
    });
  }

  finishDraw() {
    this.state.phase = PHASES.RESULT;
    this.state.playerActions = [];
    this.state.appearingCard = null;
    this.state.result = { type: RESULT_TYPES.DRAW, reasonCode: DRAW_ROUND_REASONS.EXHAUSTED_DECK, summary: '荒庄' };
  }

  // ===== 服务端意图入口 =====
  // 所有入口先校验「该座位确实是当前应行动方」，非法返回 { ok:false, reason }，
  // 合法则推进状态机（同步驱动到下一个真人决策点或结算），返回 { ok:true }。

  isSeatToAct(seatIndex) {
    return this.state && this.state.currentSeat === seatIndex;
  }

  submitDiscard(seatIndex, cardId) {
    const state = this.state;
    if (state.phase !== PHASES.HUMAN_DISCARD || !this.isSeatToAct(seatIndex)) {
      return { ok: false, reason: '现在不能出牌' };
    }
    const seat = state.seats[seatIndex];
    const card = seat.hand.find((item) => item.id === cardId);
    if (!card) {
      return { ok: false, reason: '没有这张牌' };
    }
    const legal = isLegalDiscard(seat, card, this.rules);
    if (!legal.legal) {
      return { ok: false, reason: legal.reason };
    }
    this.discardCard(seatIndex, cardId);
    return { ok: true };
  }

  // ref: { index } 优先；否则按 { type, key, meldId } 匹配 playerActions。
  findPlayerAction(seatIndex, ref = {}) {
    const list = this.state.playerActions || [];
    if (typeof ref.index === 'number' && list[ref.index]) {
      return list[ref.index];
    }
    return list.find((action) => {
      if (action.seat !== seatIndex) return false;
      if (ref.type && action.type !== ref.type) return false;
      if (ref.meldId && action.meldId !== ref.meldId) return false;
      if (ref.key && action.card && action.card.key !== ref.key) return false;
      return true;
    }) || null;
  }

  submitResponse(seatIndex, ref = {}) {
    const state = this.state;
    if (state.phase !== PHASES.HUMAN_RESPONSE || !this.isSeatToAct(seatIndex)) {
      return { ok: false, reason: '现在不能响应' };
    }
    const action = this.findPlayerAction(seatIndex, ref);
    if (!action) {
      return { ok: false, reason: '该动作不可用' };
    }
    if (action.type === 'pass') {
      this.passResponse(seatIndex);
      return { ok: true };
    }
    if (action.type === 'hu') {
      this.finishWin(action.seat, action.card, action.win);
      return { ok: true };
    }
    if (action.type === 'ta') {
      this.applyTa(action);
      return { ok: true };
    }
    this.applyAction(action);
    return { ok: true };
  }

  submitTakeover(seatIndex, accept) {
    const state = this.state;
    if (state.phase !== PHASES.TAKEOVER_CHOICE || !this.isSeatToAct(seatIndex)) {
      return { ok: false, reason: '现在不能选择接庄' };
    }
    if (accept) {
      this.acceptTakeover(seatIndex);
    } else {
      this.declineTakeover(seatIndex);
    }
    return { ok: true };
  }
}

// 公共状态：可被本局所有玩家读取，不含任何玩家手牌明细。
function buildPublicState(state) {
  if (!state) return null;
  return {
    phase: state.phase,
    currentSeat: state.currentSeat,
    dealerSeat: state.dealerSeat,
    nextDealerSeat: state.nextDealerSeat,
    slippedDealer: state.slippedDealer,
    takeoverDealer: state.takeoverDealer,
    jiangCard: state.jiangCard,
    jiangPhraseId: state.jiangPhraseId,
    round: state.round,
    feedback: state.feedback,
    result: state.result,
    deckCount: Array.isArray(state.deck) ? state.deck.length : 0,
    recentDiscard: state.recentDiscard || null,
    appearingCard: state.appearingCard || null,
    pendingActions: state.pendingActions || [],
    playerActions: state.playerActions || [],
    seats: (state.seats || []).map((seat) => ({
      id: seat.id,
      nickName: seat.nickName || seat.name,
      avatarUrl: seat.avatarUrl || '',
      isHuman: Boolean(seat.isHuman),
      isDealer: Boolean(seat.isDealer),
      online: seat.online !== false,
      score: seat.score || 0,
      handCount: Array.isArray(seat.hand) ? seat.hand.length : 0,
      melds: seat.melds || [],
      discards: seat.discards || [],
      history: {
        takeover: Boolean(seat.history && seat.history.takeover),
        takeoverOperations: (seat.history && seat.history.takeoverOperations) || 0,
        listening: Boolean(seat.history && seat.history.listening),
        circleLoss: Boolean(seat.history && seat.history.circleLoss),
      },
    })),
  };
}

// 私密视图：仅下发给本人，含自己的手牌。
function buildPrivateView(state, seatIndex) {
  if (!state || !state.seats || !state.seats[seatIndex]) return { hand: [] };
  const seat = state.seats[seatIndex];
  return {
    seat: seatIndex,
    hand: seat.hand || [],
    drawnCard: state.drawnCard || null,
  };
}

module.exports = {
  HuapaiEngine,
  buildPublicState,
  buildPrivateView,
};
