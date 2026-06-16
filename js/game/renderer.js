import TableLayout, { CARD_ASPECT_RATIO } from './layout';
import { calculateOperationFu } from './evaluator';
import AnimationManager from './animation/manager';
import TableAnimationController from './animation/controller';
import { cardFlightPlan, textEffectPlan, visualCardSize } from './animation/presets';
import StateAnimationController from './animation/state-controller';
import {
  cardSize as managedCardSize,
  clampPosition as managedClampPosition,
  claimedTarget as managedClaimedTarget,
  discardTarget as managedDiscardTarget,
  effectTarget as managedEffectTarget,
  seatFront as managedSeatFront,
  seatStart as managedSeatStart,
} from './animation/targets';

const BIG_CARD_ASPECT_RATIO = 88 / 307;
const BIG_CARD_SOURCE_SIZE = { width: 88, height: 307 };
const CARD_SOURCE_SIZES = {
  big: BIG_CARD_SOURCE_SIZE,
  small: { width: 88, height: 108 },
  mini: { width: 38, height: 42 },
};
const CHI_COMBO_DURATION_MS = 900;
const CHI_COMBO_FALLBACK_DURATION_MS = 650;
const GLOW_STROKE = '#2ee8ff';
const ACTION_EFFECT_LABELS = {
  chi: '吃',
  peng: '碰',
  zhao: '招',
  ta: '踏',
  hu: '胡',
  pass: '过',
};
const MELD_EVENT_TYPES = ['chi', 'peng', 'zhao', 'ta'];

function appearanceTrace(source, payload = {}) {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('[appearance-trace]', source, payload);
  }
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function lerp(start, end, progress) {
  return start + (end - start) * progress;
}

function easeOutCubic(progress) {
  const p = clamp01(progress);
  return 1 - Math.pow(1 - p, 3);
}

function easeOutBack(progress) {
  const p = clamp01(progress);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export default class TableRenderer {
  constructor(assetLoader) {
    this.assets = assetLoader;
    this.layout = new TableLayout();
    this.lastLayout = null;
    this.lastState = null;
    this.lastDiscardEvent = null;
    this.lastMeldSignatures = null;
    this.lastResultEffectSignature = '';
    this.buttonPanelSignature = '';
    this.buttonPanelStartedAt = 0;
    this.buttonPress = null;
    this.previousHandCards = [];
    this.suppressNextMeldEffect = false;
    this.suppressNextResultEffect = false;
    this.effectSequence = 0;
    this.animationManager = new AnimationManager();
    this.stateAnimationController = new StateAnimationController(this.animationManager, () => {
      this.lastDiscardEvent = null;
    });
    this.animationController = new TableAnimationController(this, this.animationManager);
    this.viewportSignature = '';
    this.restoreAnimationsAfterLayout = false;
    this.fallbackTraceSignature = '';
    this.currentJiangPhraseId = null;
    appearanceTrace('trace:boot', { scope: 'renderer' });
  }

  setViewport(metrics) {
    if (!metrics) return false;
    const insets = metrics.safeAreaInsets || {};
    const signature = [
      metrics.width,
      metrics.height,
      insets.left || 0,
      insets.top || 0,
      insets.right || 0,
      insets.bottom || 0,
    ].join(':');
    if (signature === this.viewportSignature) return false;

    this.animationController.prepareForLayoutChange();
    this.stateAnimationController.handleLayoutChange();
    this.layout.setViewport(metrics.width, metrics.height, { safeAreaInsets: insets });
    this.viewportSignature = signature;
    this.lastLayout = null;
    this.lastDiscardEvent = null;
    this.previousHandCards = [];
    this.buttonPanelSignature = '';
    this.buttonPress = null;
    this.restoreAnimationsAfterLayout = true;
    return true;
  }

  render(ctx, state) {
    const layout = this.layout.build(state);
    this.lastLayout = layout;
    this.lastState = state;
    this.currentJiangPhraseId = state.jiangPhraseId || null;
    if (this.restoreAnimationsAfterLayout) {
      this.restoreAnimationsAfterLayout = false;
      this.animationController.restoreAfterLayoutChange();
    }

    ctx.clearRect(0, 0, layout.width, layout.height);
    const blockStateAnimation = this.animationController.isBlockingStateAnimation()
      || Boolean(state.animationWaiting);
    this.stateAnimationController.observe(state, layout, blockStateAnimation);
    if (this.stateAnimationController.active && this.stateAnimationController.active.event.card) {
      this.lastDiscardEvent = {
        seat: this.stateAnimationController.active.event.seat,
        card: this.stateAnimationController.active.event.card,
        holdPosition: this.stateAnimationController.active.position,
      };
    }
    this.updateEffects(state, layout);
    this.drawBackground(ctx, layout);
    this.drawHeader(ctx, state, layout);
    this.drawSeatStatuses(ctx, state, layout);
    this.drawDiscardArea(ctx, state, layout);
    this.drawMeldArea(ctx, state, layout);
    this.drawCenterFocus(ctx, state, layout);
    this.drawPlayerHand(ctx, state, layout);
    this.drawPrompt(ctx, state, layout);
    this.drawHeldDiscardFallback(ctx, state, layout);
    this.drawHeldDrawFallback(ctx, state, layout);
    this.drawManagedAnimations(ctx, layout);
    if (state.phase === 'result') this.drawResult(ctx, state, layout);
    this.drawButtons(ctx, state, layout);
    this.previousHandCards = layout.handCards.map((item) => ({ ...item }));
  }

  drawBackground(ctx, layout) {
    const table = this.assets.getImage('table');
    if (table) {
      ctx.drawImage(table, 0, 0, layout.width, layout.height);
      return;
    }

    ctx.fillStyle = '#24150f';
    ctx.fillRect(0, 0, layout.width, layout.height);
    ctx.fillStyle = '#26395c';
    ctx.fillRect(layout.safe, layout.safe, layout.width - layout.safe * 2, layout.height - layout.safe * 2);
  }

  drawTextShadow(ctx, text, x, y) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
    ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = '#fff7dc';
    ctx.fillText(text, x, y);
  }

  drawCenteredTextShadow(ctx, text, x, y) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
    ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = '#fff7dc';
    ctx.fillText(text, x, y);
  }

  drawLightText(ctx, text, x, y, maxWidth = 220) {
    let output = String(text || '');
    while (output.length > 1 && ctx.measureText(output).width > maxWidth) {
      output = `${output.slice(0, -2)}…`;
    }
    this.drawTextShadow(ctx, output, x, y);
  }

  drawHeader(ctx, state, layout) {
    this.drawHudButton(ctx, layout.muteButton, state.muted ? '静' : '音');
  }

  drawSeatStatuses(ctx, state, layout) {
    const colors = ['#d94841', '#2f9e44', '#1971c2', '#f08c00'];
    Object.values(layout.seatStatusAreas || {}).forEach((area) => {
      const seat = state.seats[area.seat];
      if (!seat) return;
      const avatar = area.avatar;
      const avatarImage = seat.avatarUrl && this.assets.getRemoteImage
        ? this.assets.getRemoteImage(seat.avatarUrl)
        : null;
      if (avatarImage) {
        ctx.drawImage(avatarImage, avatar.x, avatar.y, avatar.width, avatar.height);
      } else {
        roundRect(ctx, avatar.x, avatar.y, avatar.width, avatar.height, 3);
        ctx.fillStyle = colors[area.seat % colors.length];
        ctx.fill();
        ctx.fillStyle = '#fff7dc';
        ctx.font = `${Math.max(13, Math.floor(avatar.height * 0.34))}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText((seat.name || '?').slice(0, 1), avatar.x + avatar.width / 2, avatar.y + avatar.height / 2 + 5);
      }
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.70)';
      ctx.lineWidth = 1;
      roundRect(ctx, avatar.x, avatar.y, avatar.width, avatar.height, 3);
      ctx.stroke();

      const totalScore = typeof seat.score === 'number' ? seat.score : 0;
      const operationFu = calculateOperationFu(seat.melds || [], state.rules, {
        jiangPhraseId: state.jiangPhraseId,
      }).totalFu;
      ctx.font = '12px Arial';
      this.drawCenteredTextShadow(ctx, `${totalScore > 0 ? '+' : ''}${totalScore}`, area.totalScore.x + area.totalScore.width / 2, area.totalScore.y + 11);
      this.drawCenteredTextShadow(ctx, `${operationFu}福`, area.roundFu.x + area.roundFu.width / 2, area.roundFu.y + 11);
      ctx.textAlign = 'left';
    });
  }

  drawSeatPanels(ctx) {
    // Kept for compatibility with older smoke tests. Normal play uses no seat panels.
  }

  drawOpponents(ctx, state, layout) {
    this.drawSeatPanels(ctx, state, layout);
  }

  drawDiscardArea(ctx, state, layout) {
    Object.entries(layout.unclaimedZones || layout.discardZones).forEach(([, area]) => {
      const seat = state.seats[area.seat];
      if (!seat) return;
      const hiddenId = this.shouldHideDiscardMini(state, area.seat)
        ? state.recentDiscard.card.id
        : this.resolvingDiscardMiniId(area.seat);
      const cards = hiddenId
        ? seat.discards.filter((card) => card.id !== hiddenId)
        : seat.discards;
      this.drawMiniSequence(ctx, area, cards.slice(-12), layout);
    });
  }

  drawMeldArea(ctx, state, layout) {
    Object.entries(layout.claimedZones || layout.meldZones).forEach(([, area]) => {
      const seat = state.seats[area.seat];
      if (!seat) return;
      this.drawClaimedColumns(ctx, area, seat.melds, layout, this.resolvingClaimedMiniIds(state, area.seat));
    });

    const player = state.seats[state.humanSeat];
    const area = layout.claimedZones ? layout.claimedZones.bottom : layout.meldZones.bottom;
    if (player && player.history && player.history.takeover) {
      ctx.font = '12px Arial';
      this.drawLightText(ctx, `接庄 ${player.history.takeoverOperations}/3${player.history.listening ? ' 已听' : ''}`, area.x, area.y + area.height + 14, area.width);
    }
  }

  drawPrompt(ctx, state, layout) {
    const text = state.feedback || this.getPhaseText(state);
    if (layout.actionModal && layout.actionModal.visible) {
      return;
    }

    ctx.font = layout.isLandscape ? '14px Arial' : '15px Arial';
    this.drawLightText(ctx, text, layout.prompt.x + 10, layout.prompt.y + 20, layout.prompt.width - 20);
  }

  drawCenterFocus(ctx, state, layout) {
    const area = layout.centerFocus;
    ctx.font = '12px Arial';
    const turnName = state.seats[state.currentSeat] ? state.seats[state.currentSeat].name : '-';
    this.drawLightText(ctx, `行牌:${turnName}`, area.x, area.y + 18, 96);
    if (state.jiangCard) {
      this.drawCard(ctx, state.jiangCard, area.x + area.width - 28, area.y, 22, Math.round(22 / CARD_ASPECT_RATIO), true, false, 'mini');
      this.drawLightText(ctx, '将', area.x + area.width - 48, area.y + 17, 18);
    }
  }

  drawActionModal(ctx, state, layout, text) {
    const area = layout.actionModal;
    ctx.fillStyle = 'rgba(8, 14, 24, 0.72)';
    roundRect(ctx, area.x, area.y, area.width, area.height, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 214, 102, 0.50)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#fff7dc';
    ctx.font = '14px Arial';
    this.fillClampedText(ctx, text, area.x + 12, area.y + 24, area.width - 24);
  }

  updateEffects(state, layout) {
    const now = Date.now();
    this.updateButtonPanelState(layout, now);
    this.updateMeldEffects(state, layout, now);
    this.updateResultEffects(state, layout, now);
  }

  updateButtonPanelState(layout, now) {
    const buttons = layout.actionButtons || [];
    const signature = buttons.map((button) => `${button.action.type}:${button.x}:${button.y}:${button.width}:${button.height}`).join('|');
    if (signature && signature !== this.buttonPanelSignature) {
      this.buttonPanelStartedAt = now;
    }
    this.buttonPanelSignature = signature;
    if (this.buttonPress && now - this.buttonPress.startedAt >= this.buttonPress.duration) {
      this.buttonPress = null;
    }
  }

  updateMeldEffects(state, layout, now) {
    const current = {};
    const suppress = this.suppressNextMeldEffect || Boolean(state.animationWaiting);
    (state.seats || []).forEach((seat, seatIndex) => {
      (seat.melds || []).forEach((meld) => {
        const signature = this.meldSignature(seatIndex, meld);
        current[signature] = true;
        if (!suppress && this.lastMeldSignatures && !this.lastMeldSignatures[signature]) {
          const point = this.effectPointForSeat(seatIndex, layout);
          this.addTextEffect(meld.label || ACTION_EFFECT_LABELS[meld.type] || '成', point.x, point.y, {
            tone: meld.type,
            startedAt: now,
          });
          if (meld.type === 'chi') {
            this.createChiComboAnimation(seatIndex, meld, layout, now);
          }
        }
      });
    });
    this.lastMeldSignatures = current;
    this.suppressNextMeldEffect = false;
  }

  updateResultEffects(state, layout, now) {
    const result = state.result;
    const signature = result ? `${result.type}:${result.winner}:${result.loser}:${state.round}` : '';
    if (!this.suppressNextResultEffect && signature && signature !== this.lastResultEffectSignature && result.type === 'win') {
      const winner = typeof result.winner === 'number' ? result.winner : state.humanSeat;
      const point = this.effectPointForSeat(winner, layout);
      this.addTextEffect('胡', point.x, point.y, {
        tone: 'hu',
        duration: 1050,
        fontSize: 82,
        startedAt: now,
      });
    }
    this.lastResultEffectSignature = signature;
    this.suppressNextResultEffect = false;
  }

  meldSignature(seatIndex, meld) {
    const cards = (meld.cards || []).map((card) => card.id).join(',');
    return `${seatIndex}:${meld.id || meld.type}:${meld.type}:${cards}`;
  }

  effectPointForSeat(seat, layout) {
    return managedEffectTarget(seat, layout);
  }

  addTextEffect(label, x, y, options = {}) {
    this.effectSequence += 1;
    const plan = textEffectPlan(
      `effect:${this.effectSequence}:${label}`,
      label,
      { x, y },
      options
    );
    this.animationManager.play(plan, null, { replay: true });
  }

  createChiComboAnimation(seat, meld, layout, now) {
    const cards = (meld.cards || []).slice(0, 3);
    if (!cards.length) return;
    const target = this.claimedAnimationEnd(seat, layout);
    const { width } = this.animationCardSize(layout);
    const cardWidth = Math.max(28, Math.round(width * 0.78));
    const cardHeight = Math.round(cardWidth / BIG_CARD_ASPECT_RATIO);
    const handRegions = {};
    cards.forEach((card) => {
      const handRegion = this.previousHandCards.find((region) => region.card && region.card.id === card.id);
      if (handRegion) handRegions[card.id] = handRegion;
    });
    const handOriginCount = Object.keys(handRegions).length;
    if (cards.length >= 3 && handOriginCount < 2) {
      const incoming = this.lastDiscardEvent
        ? cards.find((card) => card.id === this.lastDiscardEvent.card.id)
        : cards.find((card) => !handRegions[card.id]);
      if (!incoming || !this.lastDiscardEvent || !this.lastDiscardEvent.holdPosition) return;
      this.playChiCombo([incoming], {
        [incoming.id]: {
          ...this.lastDiscardEvent.holdPosition,
          targetX: target.x,
          targetY: target.y,
        },
      }, CHI_COMBO_FALLBACK_DURATION_MS);
      return;
    }
    const origins = {};
    cards.forEach((card, index) => {
      const handRegion = handRegions[card.id];
      if (handRegion) {
        origins[card.id] = {
          x: handRegion.x + handRegion.width / 2 - cardWidth / 2,
          y: handRegion.y + handRegion.height / 2 - cardHeight / 2,
        };
      } else if (this.lastDiscardEvent && this.lastDiscardEvent.card.id === card.id && this.lastDiscardEvent.holdPosition) {
        origins[card.id] = { ...this.lastDiscardEvent.holdPosition };
      } else {
        origins[card.id] = { x: target.x, y: target.y };
      }
      origins[card.id].targetX = target.x + index * Math.round(cardWidth * 0.78);
      origins[card.id].targetY = target.y;
    });
    this.playChiCombo(cards, origins, CHI_COMBO_DURATION_MS);
  }

  playChiCombo(cards, origins, duration) {
    this.effectSequence += 1;
    const plans = cards.map((card) => {
      const origin = origins[card.id];
      return cardFlightPlan({
        id: `chi-combo:${this.effectSequence}:${card.id}`,
        card,
        start: { x: origin.x, y: origin.y },
        end: { x: origin.targetX, y: origin.targetY },
        duration,
        stage: 'chi-combo',
      });
    });
    this.animationManager.play({
      id: `chi-combo:${this.effectSequence}`,
      visuals: plans.reduce((all, plan) => all.concat(plan.visuals), []),
      steps: [{ type: 'parallel', steps: plans.map((plan) => ({ type: 'sequence', steps: plan.steps })) }],
    }, null, { replay: true });
  }

  markButtonPressed(region) {
    const button = region && region.action ? region : null;
    if (!button) return;
    const now = Date.now();
    this.buttonPress = {
      type: button.action.type,
      seat: button.action.seat,
      startedAt: now,
      duration: 160,
    };
    if (button.action.type === 'pass') {
      this.addTextEffect(ACTION_EFFECT_LABELS.pass, button.x + button.width / 2, button.y + button.height / 2, {
        tone: 'pass',
        fontSize: 44,
        duration: 520,
        startedAt: now,
      });
    }
  }

  animationStartForSeat(seat, layout) {
    return managedSeatStart(seat, layout);
  }

  animationEndForSeat(seat, layout) {
    return managedSeatFront(seat, layout);
  }

  animationCardSize(layout) {
    return managedCardSize(layout);
  }

  discardAnimationEnd(seat, layout) {
    return managedDiscardTarget(seat, layout);
  }

  claimedAnimationEnd(seat, layout) {
    return managedClaimedTarget(seat, layout);
  }

  clampAnimationPosition(point, layout) {
    return managedClampPosition(point, layout);
  }

  shouldHoldRecentDiscard(state, sourceSeat) {
    if (!state.recentDiscard || state.recentDiscard.seat !== sourceSeat) return false;
    if (state.drawnCard && state.drawnCard.id !== state.recentDiscard.card.id) return false;
    const isRecentDiscardAction = (action) => (
      ['chi', 'peng', 'zhao', 'ta', 'hu', 'pass'].indexOf(action.type) >= 0
      && (!action.card || action.card.id === state.recentDiscard.card.id)
    );
    return Boolean(
      (state.pendingActions && state.pendingActions.some(isRecentDiscardAction))
      || (state.playerActions && state.playerActions.some(isRecentDiscardAction))
    );
  }

  shouldHoldDrawnCard(state) {
    if (!state.drawnCard || typeof state.currentSeat !== 'number') return false;
    return Boolean(
      (state.pendingActions && state.pendingActions.some((action) => action.card && action.card.id === state.drawnCard.id))
      || (state.playerActions && state.playerActions.some((action) => (
        ['chi', 'peng', 'zhao', 'ta', 'hu', 'pass'].indexOf(action.type) >= 0
        && (!action.card || action.card.id === state.drawnCard.id)
      )))
    );
  }

  shouldHideDiscardMini(state, sourceSeat) {
    return this.shouldHoldRecentDiscard(state, sourceSeat)
      || Boolean(
        state.recentDiscard
        && this.managedCardVisual(state.recentDiscard.card.id)
      );
  }

  resolvingDiscardMiniId(sourceSeat) {
    const managed = this.animationManager.getVisualState().find((visual) => (
      visual.kind === 'card'
      && (visual.stage === 'discard' || visual.stage === 'unclaimed')
    ));
    if (managed) return managed.card.id;
    return null;
  }

  resolvingClaimedMiniId(state, seat) {
    const managed = this.animationManager.getVisualState().find((visual) => (
      visual.kind === 'card'
      && ['chi', 'peng', 'zhao', 'ta'].indexOf(visual.stage) >= 0
      && this.findClaimedCard(state, visual.card.id)
      && this.findClaimedCard(state, visual.card.id).seat === seat
    ));
    if (managed) return managed.card.id;
    return null;
  }

  resolvingClaimedMiniIds(state, seat) {
    const ids = [];
    const previewMeld = this.animationController.localActionPreview
      && this.animationController.localActionPreview.meld;
    if (previewMeld) {
      const claimed = this.findClaimedCard(state, previewMeld.cards[0] && previewMeld.cards[0].id);
      if (claimed && claimed.seat === seat) {
        (previewMeld.cards || []).forEach((card) => ids.push(card.id));
      }
    }
    this.animationManager.getVisualState()
      .filter((visual) => (
        visual.kind === 'card'
        && ['chi', 'peng', 'zhao', 'ta'].indexOf(visual.stage) >= 0
      ))
      .forEach((visual) => {
        const claimed = this.findClaimedCard(state, visual.card.id);
        if (claimed && claimed.seat === seat && ids.indexOf(visual.card.id) < 0) ids.push(visual.card.id);
      });
    this.animationManager.getVisualState()
      .filter((visual) => visual.kind === 'card' && visual.stage === 'chi-combo')
      .forEach((visual) => {
        if (ids.indexOf(visual.card.id) < 0) ids.push(visual.card.id);
      });
    return ids;
  }

  findClaimedCard(state, cardId) {
    for (let seatIndex = 0; seatIndex < state.seats.length; seatIndex++) {
      const seat = state.seats[seatIndex];
      const meld = (seat.melds || []).find((item) => (item.cards || []).some((card) => card.id === cardId));
      if (meld) return { seat: seatIndex, meld };
    }
    return null;
  }

  drawHeldDiscardFallback(ctx, state, layout) {
    if (!state.recentDiscard || !this.shouldHoldRecentDiscard(state, state.recentDiscard.seat)) return;
    if (this.managedCardVisual(state.recentDiscard.card.id)) return;
    const { width: cardWidth, height: cardHeight } = this.animationCardSize(layout);
    const position = this.animationEndForSeat(state.recentDiscard.seat, layout);
    this.traceFallbackOnce('fallback:discard', {
      type: 'discard',
      seat: state.recentDiscard.seat,
      cardId: state.recentDiscard.card.id,
      phase: state.phase,
      currentSeat: state.currentSeat,
      animationWaiting: Boolean(state.animationWaiting),
      pendingActionCount: (state.pendingActions || []).length,
      playerActionCount: (state.playerActions || []).length,
      managedSameCardCount: this.animationManager.getVisualState().filter((visual) => (
        visual.kind === 'card' && visual.card && visual.card.id === state.recentDiscard.card.id
      )).length,
    });
    this.drawCard(ctx, state.recentDiscard.card, position.x, position.y, cardWidth, cardHeight, true, false, 'big', {
      shadow: true,
      border: false,
      appearanceOverlay: 'play',
    });
  }

  drawHeldDrawFallback(ctx, state, layout) {
    if (!this.shouldHoldDrawnCard(state)) return;
    if (this.managedCardVisual(state.drawnCard.id)) return;
    const { width: cardWidth, height: cardHeight } = this.animationCardSize(layout);
    const position = this.animationEndForSeat(state.currentSeat, layout);
    this.traceFallbackOnce('fallback:draw', {
      type: 'draw',
      seat: state.currentSeat,
      cardId: state.drawnCard.id,
      sourceSeat: state.appearingCard && state.appearingCard.sourceSeat,
      phase: state.phase,
      animationWaiting: Boolean(state.animationWaiting),
      pendingActionCount: (state.pendingActions || []).length,
      playerActionCount: (state.playerActions || []).length,
      managedSameCardCount: this.animationManager.getVisualState().filter((visual) => (
        visual.kind === 'card' && visual.card && visual.card.id === state.drawnCard.id
      )).length,
    });
    this.drawCard(ctx, state.drawnCard, position.x, position.y, cardWidth, cardHeight, true, false, 'big', {
      shadow: true,
      border: false,
      appearanceOverlay: 'move',
    });
  }

  traceFallbackOnce(source, payload) {
    const signature = [
      source,
      payload.cardId || '',
      payload.seat,
      payload.phase || '',
      payload.animationWaiting ? 'waiting' : 'ready',
      payload.pendingActionCount || 0,
      payload.playerActionCount || 0,
    ].join(':');
    if (signature === this.fallbackTraceSignature) return;
    this.fallbackTraceSignature = signature;
    appearanceTrace(source, payload);
  }

  managedCardVisual(cardId) {
    return this.animationManager.getVisualState().find((visual) => (
      visual.kind === 'card' && visual.card && visual.card.id === cardId
    )) || null;
  }

  drawManagedAnimations(ctx, layout) {
    this.animationManager.getVisualState().forEach((visual) => {
      if (visual.kind === 'card' && visual.card) {
        const size = visualCardSize(layout, visual);
        const base = this.animationCardSize(layout);
        const appearanceOverlay = this.appearanceOverlayForStage(visual.stage);
        this.drawCard(
          ctx,
          visual.card,
          visual.x - (size.width - base.width) / 2,
          visual.y - (size.height - base.height) / 2,
          size.width,
          size.height,
          true,
          false,
          'big',
          {
            glow: !appearanceOverlay,
            shadow: true,
            alpha: visual.alpha,
            border: appearanceOverlay ? false : undefined,
            appearanceOverlay,
          }
        );
        return;
      }
      if (visual.kind !== 'text') return;
      const isHu = visual.tone === 'hu';
      ctx.save();
      ctx.globalAlpha = typeof visual.alpha === 'number' ? visual.alpha : 1;
      ctx.translate(visual.x, visual.y);
      ctx.scale(visual.scale || 1, visual.scale || 1);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${visual.fontSize}px serif`;
      ctx.lineWidth = isHu ? 7 : 5;
      ctx.strokeStyle = isHu ? 'rgba(120, 20, 12, 0.78)' : 'rgba(7, 42, 53, 0.76)';
      if (ctx.strokeText) ctx.strokeText(visual.label, 0, 0);
      ctx.fillStyle = isHu ? '#ff3b30' : (visual.tone === 'pass' ? '#ffffff' : '#ffd666');
      ctx.fillText(visual.label, 0, 0);
      ctx.restore();
    });
  }

  drawMiniSequence(ctx, area, cards, layout) {
    const cardWidth = layout.miniCardWidth || 16;
    const cardHeight = layout.miniCardHeight || Math.round(cardWidth / CARD_ASPECT_RATIO);
    const maxVisible = Math.max(0, Math.floor(area.width / cardWidth));
    const visible = cards.slice(-maxVisible);
    const direction = area.direction || 'ltr';
    visible.forEach((card, index) => {
      const x = direction === 'rtl'
        ? area.x + area.width - cardWidth * (index + 1)
        : area.x + index * cardWidth;
      this.drawCard(ctx, card, x, area.y, cardWidth, cardHeight, true, false, 'mini');
    });
  }

  drawClaimedColumns(ctx, area, melds, layout, hiddenCardIds = null) {
    const hiddenIds = Array.isArray(hiddenCardIds)
      ? hiddenCardIds
      : (hiddenCardIds ? [hiddenCardIds] : []);
    const cardWidth = layout.miniCardWidth || 16;
    const cardHeight = layout.miniCardHeight || Math.round(cardWidth / CARD_ASPECT_RATIO);
    const maxColumns = Math.max(0, Math.floor(area.width / cardWidth));
    const visible = (melds || []).slice(-maxColumns);
    const direction = area.direction || 'ltr';
    visible.forEach((meld, columnIndex) => {
      const x = direction === 'rtl'
        ? area.x + area.width - cardWidth * (columnIndex + 1)
        : area.x + columnIndex * cardWidth;
      (meld.cards || [])
        .filter((card) => hiddenIds.indexOf(card.id) < 0)
        .slice(0, Math.floor(area.height / cardHeight))
        .forEach((card, rowIndex) => {
        this.drawCard(ctx, card, x, area.y + rowIndex * cardHeight, cardWidth, cardHeight, true, false, 'mini');
      });
    });
  }

  getPhaseText(state) {
    if (state.phase === 'takeover-choice') return '请选择是否接庄';
    if (state.phase === 'dealer-gift') {
      return state.currentSeat === state.humanSeat ? '请选择一张牌交给接庄者' : '等待原庄家选牌';
    }
    if (state.phase === 'ai-thinking') return `${state.seats[state.currentSeat].name} 正在思考`;
    if (state.phase === 'human-response') return '请选择吃、碰、招、踏、胡，或跳过';
    if (state.currentSeat === state.humanSeat) return '轮到你出牌';
    return `${state.seats[state.currentSeat].name} 行牌中`;
  }

  drawPlayerHand(ctx, state, layout) {
    const previewMeldIds = new Set(
      this.animationController.localActionPreview
      && this.animationController.localActionPreview.meld
        ? this.animationController.localActionPreview.meld.cards.map((card) => card.id)
        : []
    );
    layout.handCards.forEach((region) => {
      if (
        previewMeldIds.has(region.card.id)
        || (
          this.animationController.localActionPreview
          && this.animationController.localActionPreview.type === 'discard'
          && this.animationController.localActionPreview.cardId === region.card.id
        )
      ) return;
      const selected = state.selectedCardId === region.card.id;
      this.drawCard(ctx, region.card, region.x, region.y, region.width, region.height, true, selected, 'small');
    });
  }

  drawButtons(ctx, state, layout) {
    layout.actionButtons.forEach((button) => {
      const visual = this.buttonVisual(button);
      const centerX = button.x + button.width / 2;
      const centerY = button.y + button.height / 2;
      ctx.save();
      ctx.globalAlpha = visual.alpha;
      ctx.translate(centerX, centerY);
      if (ctx.scale) ctx.scale(visual.scale, visual.scale);
      this.drawButton(ctx, {
        ...button,
        x: -button.width / 2,
        y: -button.height / 2,
      }, button.action.label || button.action.type, false, visual, button.action.type);
      ctx.restore();
    });
  }

  actionSpriteBounds(sprite, button, padding = 0) {
    const frame = sprite && sprite.frame && sprite.frame.frame;
    if (!frame) return null;
    const sourceWidth = sprite.rotateCw || sprite.rotateCcw ? frame.h : frame.w;
    const sourceHeight = sprite.rotateCw || sprite.rotateCcw ? frame.w : frame.h;
    if (!sourceWidth || !sourceHeight) return null;
    const availableWidth = Math.max(1, button.width - padding * 2);
    const availableHeight = Math.max(1, button.height - padding * 2);
    const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    return {
      x: button.x + (button.width - width) / 2,
      y: button.y + (button.height - height) / 2,
      width,
      height,
    };
  }

  drawActionButtonSprite(ctx, button, actionType) {
    if (!actionType || !this.assets.getActionSprite) return false;
    const sprite = this.assets.getActionSprite(actionType);
    const bounds = this.actionSpriteBounds(sprite, button);
    if (!sprite || !bounds) return false;
    this.drawAtlasSprite(ctx, sprite, bounds.x, bounds.y, bounds.width, bounds.height, false, {
      border: false,
    });
    return true;
  }

  buttonVisual(button) {
    const now = Date.now();
    const enterProgress = this.buttonPanelStartedAt
      ? clamp01((now - this.buttonPanelStartedAt) / 260)
      : 1;
    let scale = 0.72 + easeOutBack(enterProgress) * 0.28;
    let alpha = enterProgress;
    let pressed = false;
    if (
      this.buttonPress
      && this.buttonPress.type === button.action.type
      && this.buttonPress.seat === button.action.seat
    ) {
      pressed = true;
      const pressProgress = clamp01((now - this.buttonPress.startedAt) / this.buttonPress.duration);
      const pressScale = pressProgress < 0.5
        ? lerp(1, 0.9, easeOutCubic(pressProgress / 0.5))
        : lerp(0.9, 1, easeOutCubic((pressProgress - 0.5) / 0.5));
      scale *= pressScale;
      alpha = Math.min(1, alpha + 0.08);
    }
    return { scale, alpha, pressed };
  }

  drawResult(ctx, state, layout) {
    const area = layout.result;
    ctx.fillStyle = 'rgba(10, 24, 20, 0.92)';
    roundRect(ctx, area.x, area.y, area.width, area.height, 8);
    ctx.fill();
    ctx.strokeStyle = '#ffd666';
    ctx.lineWidth = 2;
    ctx.stroke();

    const result = state.result || {};
    ctx.fillStyle = '#fff7dc';
    ctx.font = '24px Arial';
    const title = result.type === 'win'
      ? '本局胡牌'
      : (result.type === 'circle-loss' ? '进圈' : (result.type === 'draw-round' ? '流局' : '荒庄'));
    ctx.fillText(title, area.x + 24, area.y + 44);
    ctx.font = '16px Arial';
    if (result.type === 'win') {
      ctx.fillText(`赢家：${state.seats[result.winner].name}`, area.x + 24, area.y + 82);
      ctx.fillText(result.summary || '', area.x + 24, area.y + 112);
      if (result.scoring) {
        const jiangPhrase = state.rules.phrases.find((phrase) => phrase.id === result.jiangPhraseId);
        const payment = result.settlement ? `每家赔${result.settlement.point}分` : `分：${result.points}`;
        ctx.fillText(`将：${jiangPhrase ? jiangPhrase.text : '-'}  等级：${result.grade}  福：${result.scoring.totalFu}  ${payment}`, area.x + 24, area.y + 142);
        const detail = result.scoring.entries
          .slice(0, 3)
          .map((entry) => `${entry.description}+${entry.fu}`)
          .join('，');
        ctx.fillText(detail || '无额外计福', area.x + 24, area.y + 172);
      }
    } else if (result.type === 'circle-loss') {
      ctx.fillText(`输家：${state.seats[result.loser].name}`, area.x + 24, area.y + 82);
      ctx.fillText(`赢家：${result.winners.map((seat) => state.seats[seat].name).join('、')}`, area.x + 24, area.y + 112);
      ctx.fillText(`${result.reason || ''}${result.settlement ? `，每家赔${result.settlement.point}分` : ''}`, area.x + 24, area.y + 142);
    } else if (result.type === 'draw-round') {
      ctx.fillText(result.summary || '流局，重新开局', area.x + 24, area.y + 86);
    } else {
      ctx.fillText('牌堆摸完，无人胡牌', area.x + 24, area.y + 86);
    }
  }

  drawAtlasSprite(ctx, sprite, x, y, width, height, selected = false, options = {}) {
    ctx.save();
    if (typeof options.alpha === 'number') ctx.globalAlpha = options.alpha;
    if (options.shadow) {
      ctx.shadowColor = 'rgba(46, 232, 255, 0.42)';
      ctx.shadowBlur = Math.max(8, Math.round(width * 0.32));
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }
    if (selected) {
      ctx.fillStyle = '#fff1b8';
      roundRect(ctx, x - 2, y - 2, width + 4, height + 4, 6);
      ctx.fill();
    }
    const frame = sprite.frame.frame;
    if (sprite.rotateCw) {
      ctx.save();
      ctx.translate(x + width, y);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(sprite.image, frame.x, frame.y, frame.w, frame.h, 0, 0, height, width);
      ctx.restore();
    } else if (sprite.rotateCcw) {
      ctx.save();
      ctx.translate(x, y + height);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(sprite.image, frame.x, frame.y, frame.w, frame.h, 0, 0, height, width);
      ctx.restore();
    } else {
      ctx.drawImage(sprite.image, frame.x, frame.y, frame.w, frame.h, x, y, width, height);
    }
    if (options.border !== false) {
      ctx.strokeStyle = selected ? '#f79009' : 'rgba(138, 90, 22, 0.64)';
      ctx.lineWidth = selected ? 2 : 1;
      roundRect(ctx, x, y, width, height, 5);
      ctx.stroke();
    }
    if (options.glow) {
      ctx.shadowColor = 'rgba(46, 232, 255, 0.65)';
      ctx.shadowBlur = Math.max(8, Math.round(width * 0.36));
      ctx.strokeStyle = GLOW_STROKE;
      ctx.lineWidth = Math.max(2, Math.round(width * 0.045));
      roundRect(ctx, x - 2, y - 2, width + 4, height + 4, 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  spriteSourceSize(sprite, fallback = null) {
    const frame = sprite && sprite.frame && sprite.frame.frame;
    if (!frame) return fallback;
    return sprite.rotateCw || sprite.rotateCcw
      ? { width: frame.h, height: frame.w }
      : { width: frame.w, height: frame.h };
  }

  overlayBounds(sprite, baseSprite, x, y, width, height, fallbackBaseSize = BIG_CARD_SOURCE_SIZE) {
    const overlaySize = this.spriteSourceSize(sprite);
    const baseSize = this.spriteSourceSize(baseSprite, fallbackBaseSize);
    if (
      !overlaySize
      || !baseSize
      || !baseSize.width
      || !baseSize.height
    ) return { x, y, width, height };
    const overlayWidth = width * (overlaySize.width / baseSize.width);
    const overlayHeight = height * (overlaySize.height / baseSize.height);
    return {
      x: x + (width - overlayWidth) / 2,
      y: y + (height - overlayHeight) / 2,
      width: overlayWidth,
      height: overlayHeight,
    };
  }

  appearanceOverlayBounds(sprite, baseSprite, x, y, width, height) {
    return this.overlayBounds(sprite, baseSprite, x, y, width, height, BIG_CARD_SOURCE_SIZE);
  }

  drawAppearanceOverlay(ctx, overlayType, x, y, width, height, options = {}, baseSprite = null) {
    if (!overlayType || !this.assets.getAppearanceOverlaySprite) return false;
    const sprite = this.assets.getAppearanceOverlaySprite(overlayType);
    if (!sprite) return false;
    const bounds = this.appearanceOverlayBounds(sprite, baseSprite, x, y, width, height);
    this.drawAtlasSprite(ctx, sprite, bounds.x, bounds.y, bounds.width, bounds.height, false, {
      border: false,
      alpha: options.alpha,
    });
    return true;
  }

  cardSourceSizeFor(size = 'big') {
    return CARD_SOURCE_SIZES[size] || CARD_SOURCE_SIZES.big;
  }

  isJiangCard(card, options = {}) {
    if (options.jiangOverlay === false) return false;
    const jiangPhraseId = options.jiangPhraseId || this.currentJiangPhraseId;
    return Boolean(card && card.phraseId && jiangPhraseId && card.phraseId === jiangPhraseId);
  }

  drawJiangOverlay(ctx, card, size, x, y, width, height, options = {}, baseSprite = null) {
    if (!this.isJiangCard(card, options) || !this.assets.getJiangOverlaySprite) return false;
    const sprite = this.assets.getJiangOverlaySprite(size);
    if (!sprite) return false;
    const bounds = this.overlayBounds(
      sprite,
      baseSprite,
      x,
      y,
      width,
      height,
      this.cardSourceSizeFor(size)
    );
    this.drawAtlasSprite(ctx, sprite, bounds.x, bounds.y, bounds.width, bounds.height, false, {
      border: false,
      alpha: options.alpha,
    });
    return true;
  }

  appearanceOverlayForStage(stage) {
    if (stage === 'discard') return 'play';
    if (stage === 'draw') return 'move';
    return null;
  }

  drawCard(ctx, card, x, y, width, height, front = true, selected = false, size = 'big', options = {}) {
    if (!front) {
      this.drawCardBack(ctx, x, y, width, height, size, options);
      return;
    }

    const sprite = this.assets.getCardSprite(card, size);
    if (sprite) {
      this.drawAtlasSprite(ctx, sprite, x, y, width, height, selected, options);
      this.drawAppearanceOverlay(ctx, options.appearanceOverlay, x, y, width, height, options, sprite);
      this.drawJiangOverlay(ctx, card, size, x, y, width, height, options, sprite);
      return;
    }

    ctx.save();
    if (typeof options.alpha === 'number') ctx.globalAlpha = options.alpha;
    if (options.shadow) {
      ctx.shadowColor = 'rgba(46, 232, 255, 0.42)';
      ctx.shadowBlur = Math.max(8, Math.round(width * 0.32));
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }
    ctx.fillStyle = selected ? '#fff1b8' : '#fffaf0';
    roundRect(ctx, x, y, width, height, 5);
    ctx.fill();
    if (options.border !== false) {
      ctx.strokeStyle = selected ? '#f79009' : '#8a5a16';
      ctx.lineWidth = selected ? 2 : 1;
      ctx.stroke();
    }
    ctx.fillStyle = card.color || '#202020';
    ctx.font = `${Math.max(18, Math.floor(height * 0.44))}px serif`;
    ctx.textAlign = 'center';
    ctx.fillText(card.text, x + width / 2, y + height * 0.62);
    ctx.textAlign = 'left';
    if (options.glow) {
      ctx.shadowColor = 'rgba(46, 232, 255, 0.65)';
      ctx.shadowBlur = Math.max(8, Math.round(width * 0.36));
      ctx.strokeStyle = GLOW_STROKE;
      ctx.lineWidth = Math.max(2, Math.round(width * 0.045));
      roundRect(ctx, x - 2, y - 2, width + 4, height + 4, 6);
      ctx.stroke();
    }
    ctx.restore();
    this.drawAppearanceOverlay(ctx, options.appearanceOverlay, x, y, width, height, options);
    this.drawJiangOverlay(ctx, card, size, x, y, width, height, options);
  }

  drawCardBack(ctx, x, y, width, height, size = 'big', options = {}) {
    const sprite = this.assets.getCardBackSprite(size);
    if (sprite) {
      this.drawAtlasSprite(ctx, sprite, x, y, width, height, false, options);
      return;
    }

    ctx.save();
    if (typeof options.alpha === 'number') ctx.globalAlpha = options.alpha;
    const back = this.assets.getImage('cardBack');
    if (back) {
      ctx.drawImage(back, x, y, width, height);
      ctx.restore();
      return;
    }
    ctx.fillStyle = '#8a3ffc';
    roundRect(ctx, x, y, width, height, 5);
    ctx.fill();
    ctx.strokeStyle = '#fff7dc';
    ctx.stroke();
    ctx.restore();
  }

  drawTinyCard(ctx, card, x, y) {
    this.drawCard(ctx, card, x, y, 18, 22, true, false, 'mini');
  }

  drawCardZone(ctx, area, title, cards, layout) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
    roundRect(ctx, area.x, area.y, area.width, area.height, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 247, 220, 0.74)';
    ctx.font = '11px Arial';
    ctx.fillText(title, area.x + 6, area.y + 14);

    const cardWidth = layout.miniCardWidth || 16;
    const cardHeight = layout.miniCardHeight || Math.round(cardWidth / CARD_ASPECT_RATIO);
    const gap = 3;
    const startX = area.x + 6;
    const startY = area.y + area.height - cardHeight - 4;
    const maxVisible = Math.max(0, Math.floor((area.width - 12) / (cardWidth + gap)));
    cards.slice(-maxVisible).forEach((card, index) => {
      this.drawCard(ctx, card, startX + index * (cardWidth + gap), startY, cardWidth, cardHeight, true, false, 'mini');
    });
  }

  drawButton(ctx, button, label, compact = false, visual = {}, actionType = null) {
    if (this.drawActionButtonSprite(ctx, button, actionType)) return;
    ctx.fillStyle = visual.pressed ? 'rgba(255, 238, 153, 0.98)' : 'rgba(255, 214, 102, 0.92)';
    roundRect(ctx, button.x, button.y, button.width, button.height, 6);
    ctx.fill();
    ctx.fillStyle = '#3b2a04';
    ctx.font = compact ? '12px Arial' : '15px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(label, button.x + button.width / 2, button.y + button.height / 2 + 5);
    ctx.textAlign = 'left';
  }

  drawHudButton(ctx, button, label) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    roundRect(ctx, button.x, button.y, button.width, button.height, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#fff7dc';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(label, button.x + button.width / 2, button.y + button.height / 2 + 5);
    ctx.textAlign = 'left';
  }

  fillClampedText(ctx, text, x, y, maxWidth) {
    let output = String(text || '');
    while (output.length > 1 && ctx.measureText(output).width > maxWidth) {
      output = `${output.slice(0, -2)}…`;
    }
    ctx.fillText(output, x, y);
  }
}
