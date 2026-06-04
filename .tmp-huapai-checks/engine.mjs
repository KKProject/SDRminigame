import { chooseAcceptTakeover, chooseDiscard, chooseResponse, chooseSelfDrawAction } from './ai.mjs';
import { createDeck, createSeats, nextSeat, removeCardsByIds, shuffleDeck, sortCards } from './cards.mjs';
import {
  ACTION_LABELS,
  DEFAULT_RULES,
  PHASES,
} from './rules.mjs';
import {
  applyMeldCards,
  buildCircleLossResult,
  dealOpeningHands,
  evaluateWin,
  filterHighestPriority,
  findResponseActions,
  findSelfDrawActions,
  findTakeoverEligibleSeats,
  hasKezi,
  hasTriplet,
  isLegalDiscard,
  isListening,
  validateSupportPairs,
} from './evaluator.mjs';

export default class HuapaiEngine {
  constructor(databus, music, rules = DEFAULT_RULES) {
    this.databus = databus;
    this.music = music;
    this.rules = rules;
    this.aiTimer = null;
  }

  startRound(seed, dealerSeat) {
    if (this.aiTimer) clearTimeout(this.aiTimer);
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
    const state = this.databus;
    const nextDealer = nextSeat(state.slippedDealer, this.rules);
    state.nextDealerSeat = nextDealer;
    state.phase = PHASES.RESULT;
    state.playerActions = [];
    state.result = {
      type: 'draw-round',
      nextDealer,
      reason,
      summary: `${reason}，下局${state.seats[nextDealer].name}坐庄`,
    };
  }

  enterDiscardPhase(seatIndex, feedback) {
    const state = this.databus;
    state.currentSeat = seatIndex;
    state.drawnCard = null;
    state.selectedCardId = null;
    state.pendingActions = [];
    state.playerActions = [];
    state.phase = state.seats[seatIndex].isHuman ? PHASES.HUMAN_DISCARD : PHASES.AI_THINKING;
    this.setFeedback(feedback);
    if (!state.seats[seatIndex].isHuman) {
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
    }

    seat.discards.push(card);
    seat.history.discardPhraseCounts[card.phraseId] = (seat.history.discardPhraseCounts[card.phraseId] || 0) + 1;
    state.drawnCard = null;
    state.selectedCardId = null;
    state.recentDiscard = { seat: seatIndex, card };
    if (this.music) this.music.playCue('discard');

    const actions = filterHighestPriority(findResponseActions(state, seatIndex, card, this.rules));
    this.handleResponseWindow(actions, seatIndex);
  }

  handleResponseWindow(actions, sourceSeat) {
    const state = this.databus;
    state.pendingActions = actions;
    const humanActions = actions.filter((action) => action.seat === state.humanSeat);

    if (humanActions.length) {
      state.playerActions = humanActions.concat([{ type: 'pass', seat: state.humanSeat, label: ACTION_LABELS.pass }]);
      state.phase = PHASES.HUMAN_RESPONSE;
      this.setFeedback(this.describeActions('你可以响应这张牌', humanActions));
      return;
    }

    const aiAction = chooseResponse(actions);
    if (aiAction) {
      this.scheduleAI(() => this.applyAction(aiAction));
      return;
    }

    this.beginTurn(nextSeat(sourceSeat, this.rules), true);
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
    if (state.drawnCard) {
      const forcedDrawAction = state.pendingActions.find((action) => action.seat === state.humanSeat && action.forced);
      if (forcedDrawAction) {
        this.finishCircleLoss(state.humanSeat, `必须${forcedDrawAction.label}，放弃后进圈`);
        return;
      }
      const card = state.drawnCard;
      state.playerActions = [];
      state.pendingActions = [];
      this.discardCard(state.humanSeat, card.id, { drawnCard: card });
      return;
    }

    const forcedAction = state.pendingActions.find((action) => action.seat === state.humanSeat && action.forced);
    if (forcedAction) {
      this.finishCircleLoss(state.humanSeat, `必须${forcedAction.label}，放弃后进圈`);
      return;
    }

    state.pendingActions
      .filter((action) => action.type === 'chi' && action.seat === state.humanSeat)
      .forEach((action) => state.seats[state.humanSeat].history.declinedChiKeys.push(action.card.key));

    const remaining = state.pendingActions.filter((action) => action.seat !== state.humanSeat);
    state.pendingActions = remaining;
    state.playerActions = [];
    const aiAction = chooseResponse(remaining);
    if (aiAction) {
      this.scheduleAI(() => this.applyAction(aiAction));
      return;
    }
    const source = state.recentDiscard ? state.recentDiscard.seat : state.currentSeat;
    this.beginTurn(nextSeat(source, this.rules), true);
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

    if (action.type === 'chi' && seat.history.declinedChiKeys.indexOf(incoming.key) >= 0) {
      this.finishCircleLoss(action.seat, '前次放弃吃牌后再次选择吃，进圈');
      return;
    }

    if (state.recentDiscard && state.recentDiscard.seat !== action.seat) {
      const sourceSeat = state.seats[state.recentDiscard.seat];
      sourceSeat.discards = sourceSeat.discards.filter((card) => card.id !== incoming.id);
    }

    const applied = applyMeldCards(seat, incoming, action, this.rules);
    seat.hand = applied.hand;
    const meld = {
      id: `${action.type}-${Date.now()}-${Math.random()}`,
      type: action.type,
      label: action.label,
      key: incoming.key,
      cards: applied.cards,
      from: action.sourceSeat,
    };
    seat.melds.push(meld);
    if (action.type === 'chi' && action.createsChiLock) seat.history.chiLocked = true;

    if (action.type === 'zhao') {
      const support = validateSupportPairs(seat.hand, meld.cards, this.rules);
      seat.history.supportPairObligations.push({
        key: incoming.key,
        size: meld.cards.length,
        needed: support.needed,
        pairKeys: support.pairKeys || [],
      });
      if (!support.valid) {
        this.finishCircleLoss(action.seat, support.reason);
        return;
      }
    }

    state.drawnCard = null;
    state.recentDiscard = null;
    state.pendingActions = [];
    state.playerActions = [];
    state.currentSeat = action.seat;
    if (this.music) this.music.playCue('meld');
    this.afterGroupingAction(action.seat, action.label);
  }

  applyTa(action) {
    const state = this.databus;
    const owner = state.seats[action.ownerSeat];
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
    if (!support.valid) {
      this.finishCircleLoss(action.seat, support.reason);
      return;
    }
    state.drawnCard = null;
    state.pendingActions = [];
    state.playerActions = [];
    if (this.music) this.music.playCue('meld');
    this.afterGroupingAction(action.seat, ACTION_LABELS.ta);
  }

  afterGroupingAction(seatIndex, label) {
    const seat = this.databus.seats[seatIndex];
    if (seat.isDealer && !hasKezi(seat.hand, seat.melds)) {
      this.finishCircleLoss(seatIndex, '庄家吃后无刻子，进圈');
      return;
    }
    if (seat.history.takeover) {
      seat.history.takeoverOperations += 1;
      seat.history.listening = isListening(seat.hand, seat.melds, this.rules, {
        requiresKezi: true,
        jiangPhraseId: this.databus.jiangPhraseId,
      });
      if (seat.history.takeoverOperations >= this.rules.takeoverOperationLimit && !seat.history.listening) {
        this.finishCircleLoss(seatIndex, '接庄后三次凑牌仍未听牌');
        return;
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
    if (!state.deck.length) {
      this.finishDraw();
      return;
    }

    const seat = state.seats[seatIndex];
    const drawnCard = state.deck.shift();
    state.drawnCard = drawnCard;
    const win = evaluateWin(seat.hand.concat([drawnCard]), seat.melds, 'self', this.rules, {
      jiangPhraseId: state.jiangPhraseId,
    });
    if (win.isWin && this.rules.allowSelfDrawWin) {
      if (seat.isHuman) {
        state.phase = PHASES.HUMAN_RESPONSE;
        state.playerActions = [{ type: 'hu', seat: seatIndex, label: ACTION_LABELS.hu, win }, { type: 'pass', seat: seatIndex, label: ACTION_LABELS.pass }];
        this.setFeedback('你摸成了，可以胡牌');
      } else {
        this.scheduleAI(() => this.finishWin(seatIndex, drawnCard, win));
      }
      return;
    }

    const actions = filterHighestPriority(findSelfDrawActions(state, seatIndex, drawnCard, this.rules));
    if (!actions.length) {
      this.setFeedback(`${seat.name}摸牌无法凑牌，自动打出${drawnCard.text}`);
      this.discardCard(seatIndex, drawnCard.id, { drawnCard });
      return;
    }

    if (seat.isHuman) {
      state.phase = PHASES.HUMAN_RESPONSE;
      state.playerActions = actions.concat([{ type: 'pass', seat: seatIndex, label: ACTION_LABELS.pass }]);
      this.setFeedback(this.describeActions(`摸到${drawnCard.text}`, actions));
    } else {
      this.scheduleAI(() => {
        const action = chooseSelfDrawAction(actions);
        if (action) this.applyAction(action);
        else this.discardCard(seatIndex, drawnCard.id, { drawnCard });
      });
    }
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
    this.databus.phase = PHASES.RESULT;
    this.databus.pendingActions = [];
    this.databus.playerActions = [];
    this.databus.selectedCardId = null;
    this.databus.drawnCard = null;
    this.databus.result = {
      type: 'win',
      winner,
      card,
      summary: win.summary,
      score: win.score,
      scoring: win.scoring,
      grade: win.grade,
      points: win.points,
      jiangPhraseId: this.databus.jiangPhraseId,
      pattern: win.pattern,
      doors: win.doors,
    };
    this.databus.seats[winner].score += win.score || 0;
    if (this.music) this.music.playCue('win');
  }

  finishCircleLoss(loser, reason) {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    const result = buildCircleLossResult(loser, this.databus.seats, reason, this.rules);
    this.databus.phase = PHASES.RESULT;
    this.databus.pendingActions = [];
    this.databus.playerActions = [];
    this.databus.selectedCardId = null;
    this.databus.drawnCard = null;
    this.databus.result = result;
  }

  finishDraw() {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.databus.phase = PHASES.RESULT;
    this.databus.playerActions = [];
    this.databus.result = { type: 'draw', summary: '荒庄' };
  }
}
