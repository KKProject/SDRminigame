import { chooseAcceptTakeover, chooseDiscard, chooseResponse } from './ai';
import {
  createActionHistoryEntry,
  createAppearingCard,
  createDeck,
  createSeats,
  nextSeat,
  removeCardsByIds,
  shuffleDeck,
  sortCards,
} from './cards';
import {
  ACTION_LABELS,
  APPEARING_CARD_SOURCES,
  DEFAULT_RULES,
  DRAW_ROUND_REASONS,
  PHASES,
  RESULT_TYPES,
} from './rules';
import {
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
} from './evaluator';

export default class HuapaiEngine {
  constructor(databus, music, rules = DEFAULT_RULES) {
    this.databus = databus;
    this.music = music;
    this.rules = rules;
    this.aiTimer = null;
    this.advanceTimer = null;
  }

  startRound(seed, dealerSeat) {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    const roundDealer = typeof dealerSeat === 'number'
      ? dealerSeat
      : (typeof this.databus.nextDealerSeat === 'number' ? this.databus.nextDealerSeat : this.rules.dealerSeat);
    const deck = shuffleDeck(createDeck(this.rules), seed);
    const seats = createSeats(this.rules, roundDealer);
    const opening = dealOpeningHands(deck, roundDealer, this.rules);

    seats.forEach((seat, seatIndex) => {
      seat.hand = opening.hands[seatIndex];
    });

    this.databus.setRoundState({
      rules: this.rules,
      seats,
      deck: opening.deck,
      phase: PHASES.HUMAN_DISCARD,
      currentSeat: roundDealer,
      humanSeat: this.rules.humanSeat,
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
      feedback: `庄家${seats[roundDealer].name}开局，将牌${opening.jiangCard ? opening.jiangCard.text : ''}`,
      result: null,
      muted: this.databus.muted || false,
      round: this.databus.round + 1,
    });

    if (!hasTriplet(seats[roundDealer].hand)) {
      this.enterDealerSlip(roundDealer);
      return;
    }

    this.enterDiscardPhase(roundDealer, '庄家先出牌');
  }

  setFeedback(text) {
    this.databus.feedback = text;
  }

  toggleMute() {
    this.databus.muted = !this.databus.muted;
    if (this.music) this.music.setMuted(this.databus.muted);
    this.setFeedback(this.databus.muted ? '已静音' : '声音已开启');
  }

  enterDealerSlip(dealerSeat) {
    const state = this.databus;
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
    const state = this.databus;
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
    const state = this.databus;
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
    const state = this.databus;
    state.takeoverQueue = state.takeoverQueue.filter((seat) => seat !== seatIndex);
    state.playerActions = [];
    this.setFeedback(`${state.seats[seatIndex].name}不接庄`);
    this.processTakeoverQueue();
  }

  finishDrawRound(reason) {
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    const state = this.databus;
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
    const state = this.databus;
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
    const state = this.databus;
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

  handleCardTap(cardId) {
    const state = this.databus;
    if (state.phase !== PHASES.HUMAN_DISCARD || state.currentSeat !== state.humanSeat) {
      this.setFeedback('现在还不能出牌');
      return;
    }
    if (state.selectedCardId === cardId) {
      this.discardSelected();
      return;
    }
    state.selectedCardId = cardId;
    this.setFeedback('再次点击此牌即可打出');
  }

  discardSelected() {
    const state = this.databus;
    if (!state.selectedCardId) {
      this.setFeedback('请先选一张牌');
      return;
    }
    this.discardCard(state.humanSeat, state.selectedCardId);
  }

  discardCard(seatIndex, cardId, options = {}) {
    const state = this.databus;
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
        jiangPhraseId: this.databus.jiangPhraseId,
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
    if (this.music) this.music.playCue('discard');

    const actions = filterHighestPriority(findResponseActions(state, seatIndex, card, this.rules));
    this.handleResponseWindow(actions, seatIndex);
  }

  discardUnclaimedDraw(seatIndex, card) {
    const state = this.databus;
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
    const state = this.databus;
    state.pendingActions = actions;
    if (!actions.length) {
      this.resolveUnclaimedAppearingCard(sourceSeat);
      return;
    }

    const responseSeat = actions[0].seat;
    const responseActions = actions.filter((action) => action.seat === responseSeat);
    state.currentSeat = responseSeat;

    if (responseSeat === state.humanSeat) {
      state.playerActions = responseActions.concat([{ type: 'pass', seat: state.humanSeat, label: ACTION_LABELS.pass }]);
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
    const state = this.databus;
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
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    const state = this.databus;
    const next = nextSeat(sourceSeat, this.rules);
    state.currentSeat = sourceSeat;
    state.pendingActions = [];
    state.playerActions = [];
    state.phase = PHASES.AI_THINKING;
    this.advanceTimer = setTimeout(() => {
      this.advanceTimer = null;
      if (state.phase === PHASES.RESULT) return;
      this.beginTurn(next, true);
    }, this.rules.unclaimedDiscardSettleMs);
  }

  scheduleAfterMeldAnimation(seatIndex, label) {
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    const state = this.databus;
    state.currentSeat = seatIndex;
    state.pendingActions = [];
    state.playerActions = [];
    state.phase = PHASES.AI_THINKING;
    this.setFeedback(`${state.seats[seatIndex].name}${label}，等待动作完成`);
    this.advanceTimer = setTimeout(() => {
      this.advanceTimer = null;
      if (state.phase === PHASES.RESULT) return;
      this.afterGroupingAction(seatIndex, label);
    }, this.rules.meldActionSettleMs);
  }

  handlePlayerAction(action) {
    if (action.type === 'restart') {
      this.startRound();
      return;
    }
    if (action.type === 'mute') {
      this.toggleMute();
      return;
    }
    if (action.type === 'acceptTakeover') {
      this.acceptTakeover(action.seat);
      return;
    }
    if (action.type === 'declineTakeover') {
      this.declineTakeover(action.seat);
      return;
    }
    if (action.type === 'pass') {
      this.passHumanResponse();
      return;
    }
    if (this.databus.phase !== PHASES.HUMAN_RESPONSE) {
      this.setFeedback('现在没有可执行的动作');
      return;
    }
    this.applyAction(action);
  }

  passHumanResponse() {
    const state = this.databus;
    const forcedAction = state.pendingActions.find((action) => action.seat === state.humanSeat && action.forced);
    if (forcedAction) {
      this.finishCircleLoss(state.humanSeat, `必须${forcedAction.label}，放弃后进圈`);
      return;
    }

    state.pendingActions
      .filter((action) => action.type === 'chi' && action.seat === state.humanSeat)
      .forEach((action) => {
        const key = createChiPenaltyKey(action);
        state.seats[state.humanSeat].history.declinedChiPenaltyKeys.push(key);
        state.seats[state.humanSeat].history.declinedChiKeys.push(action.card.key);
      });

    const remaining = state.pendingActions.filter((action) => action.seat !== state.humanSeat);
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

    const state = this.databus;
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
    if (this.music) this.music.playCue('meld');
    this.scheduleAfterMeldAnimation(action.seat, action.label);
  }

  applyTa(action) {
    const state = this.databus;
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
    if (this.music) this.music.playCue('meld');
    this.scheduleAfterMeldAnimation(action.seat, ACTION_LABELS.ta);
  }

  afterGroupingAction(seatIndex, label) {
    const seat = this.databus.seats[seatIndex];
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
    const state = this.databus;
    state.currentSeat = seatIndex;
    state.pendingActions = [];
    state.playerActions = [];
    state.selectedCardId = null;

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
    const actions = filterHighestPriority(findAppearingCardActions(state, seatIndex, drawnCard, APPEARING_CARD_SOURCES.DRAW, this.rules));
    if (!actions.length) {
      this.discardUnclaimedDraw(seatIndex, drawnCard);
      return;
    }

    this.handleResponseWindow(actions, seatIndex);
  }

  aiDiscard(seatIndex) {
    const seat = this.databus.seats[seatIndex];
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
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.databus.phase = PHASES.AI_THINKING;
    this.databus.playerActions = [];
    this.setFeedback(feedback || `${this.databus.seats[this.databus.currentSeat].name} 正在思考`);
    this.aiTimer = setTimeout(callback, this.rules.aiDelayMs);
  }

  finishWin(winner, card, win) {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    this.databus.phase = PHASES.RESULT;
    this.databus.pendingActions = [];
    this.databus.playerActions = [];
    this.databus.selectedCardId = null;
    this.databus.appearingCard = null;
    this.databus.drawnCard = null;
    const point = win.points || 0;
    const payers = this.databus.seats.map((seat) => seat.id).filter((seat) => seat !== winner);
    const payments = payers.map((payer) => ({ from: payer, to: winner, points: point }));
    payments.forEach((payment) => {
      this.databus.seats[payment.from].score -= payment.points;
      this.databus.seats[payment.to].score += payment.points;
    });
    this.databus.result = {
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
      jiangPhraseId: this.databus.jiangPhraseId,
      pattern: win.pattern,
      doors: win.doors,
    };
    if (this.music) this.music.playCue('win');
  }

  finishCircleLoss(loser, reason) {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    const result = buildCircleLossResult(loser, this.databus.seats, reason, this.rules);
    this.databus.phase = PHASES.RESULT;
    this.databus.pendingActions = [];
    this.databus.playerActions = [];
    this.databus.selectedCardId = null;
    this.databus.appearingCard = null;
    this.databus.drawnCard = null;
    this.databus.result = result;
    result.settlement.payments.forEach((payment) => {
      this.databus.seats[payment.from].score -= payment.points;
      this.databus.seats[payment.to].score += payment.points;
    });
  }

  finishDraw() {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    this.databus.phase = PHASES.RESULT;
    this.databus.playerActions = [];
    this.databus.appearingCard = null;
    this.databus.result = { type: RESULT_TYPES.DRAW, reasonCode: DRAW_ROUND_REASONS.EXHAUSTED_DECK, summary: '荒庄' };
  }
}
