import TableLayout, { CARD_ASPECT_RATIO } from './layout.mjs';
import { calculateOperationFu } from './evaluator.mjs';

const BIG_CARD_ASPECT_RATIO = 88 / 307;

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
    this.animation = null;
    this.lastEventSignature = '';
    this.lastDiscardEvent = null;
  }

  render(ctx, state) {
    const layout = this.layout.build(state);
    this.lastLayout = layout;

    ctx.clearRect(0, 0, layout.width, layout.height);
    this.updateAnimation(state, layout);
    this.drawBackground(ctx, layout);
    this.drawHeader(ctx, state, layout);
    this.drawSeatStatuses(ctx, state, layout);
    this.drawDiscardArea(ctx, state, layout);
    this.drawMeldArea(ctx, state, layout);
    this.drawCenterFocus(ctx, state, layout);
    this.drawPlayerHand(ctx, state, layout);
    this.drawPrompt(ctx, state, layout);
    this.drawHeldDiscardFallback(ctx, state, layout);
    this.drawCardAnimation(ctx, layout);
    if (state.phase === 'result') this.drawResult(ctx, state, layout);
    this.drawButtons(ctx, state, layout);
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
      ctx.fillStyle = colors[area.seat % colors.length];
      roundRect(ctx, avatar.x, avatar.y, avatar.width, avatar.height, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.70)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#fff7dc';
      ctx.font = `${Math.max(13, Math.floor(avatar.height * 0.34))}px Arial`;
      ctx.textAlign = 'center';
      ctx.fillText((seat.name || '?').slice(0, 1), avatar.x + avatar.width / 2, avatar.y + avatar.height / 2 + 5);

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
      this.drawClaimedColumns(ctx, area, seat.melds, layout, this.resolvingClaimedMiniId(state, area.seat));
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
      this.drawActionModal(ctx, state, layout, text);
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

  updateAnimation(state, layout) {
    const event = this.getAnimationEvent(state);
    const signature = event ? `${event.type}:${event.seat}:${event.card.id}` : '';
    if (this.animation && this.animation.stage === 'hold-discard') {
      this.updateHeldDiscardAnimation(state, layout);
    }
    if (this.isDiscardResolutionActive()) return;
    if (!this.animation && this.lastDiscardEvent && !state.recentDiscard) {
      const claim = this.findClaimedCard(state, this.lastDiscardEvent.card.id);
      if (claim) {
        this.animation = this.createCardAnimation(
          `claim:${claim.seat}:${this.lastDiscardEvent.card.id}:${claim.meld.id}`,
          this.lastDiscardEvent.card,
          this.lastDiscardEvent.holdPosition || this.animationEndForSeat(this.lastDiscardEvent.seat, layout),
          this.claimedAnimationEnd(claim.seat, layout),
          'to-claimed',
          360
        );
      }
      this.lastDiscardEvent = null;
    }

    if (signature && signature !== this.lastEventSignature) {
      const start = this.animationStartForSeat(event.seat, layout);
      const end = this.animationEndForSeat(event.seat, layout);
      const isDiscard = event.type === 'discard';
      this.animation = this.createCardAnimation(
        signature,
        event.card,
        start,
        end,
        isDiscard ? 'to-front' : 'to-front',
        420
      );
      if (isDiscard) {
        this.lastDiscardEvent = {
          seat: event.seat,
          card: event.card,
          holdPosition: end,
        };
      }
      this.lastEventSignature = signature;
    } else if (!signature) {
      this.lastEventSignature = '';
    }
  }

  createCardAnimation(signature, card, start, end, stage, duration) {
    return {
      signature,
      card,
      start,
      end,
      stage,
      startedAt: Date.now(),
      duration,
    };
  }

  updateHeldDiscardAnimation(state, layout) {
    const event = this.lastDiscardEvent;
    if (!event) {
      this.animation = null;
      return;
    }

    if (state.recentDiscard && state.recentDiscard.card.id === event.card.id) {
      if (this.shouldHoldRecentDiscard(state, event.seat)) return;
      this.animation = this.createCardAnimation(
        `discard-zone:${event.seat}:${event.card.id}`,
        event.card,
        event.holdPosition || this.animationEndForSeat(event.seat, layout),
        this.discardAnimationEnd(event.seat, layout),
        'to-discard',
        360
      );
      return;
    }

    const claim = this.findClaimedCard(state, event.card.id);
    if (claim) {
      this.animation = this.createCardAnimation(
        `claim:${claim.seat}:${event.card.id}:${claim.meld.id}`,
        event.card,
        event.holdPosition || this.animationEndForSeat(event.seat, layout),
        this.claimedAnimationEnd(claim.seat, layout),
        'to-claimed',
        360
      );
      this.lastDiscardEvent = null;
      return;
    }

    this.animation = null;
    this.lastDiscardEvent = null;
  }

  isDiscardResolutionActive() {
    if (!this.animation) return false;
    if (this.animation.stage === 'hold-discard') return false;
    return ['to-front', 'to-discard', 'to-claimed'].indexOf(this.animation.stage) >= 0
      && (
        this.animation.signature.startsWith('discard:')
        || this.animation.signature.startsWith('discard-zone:')
        || this.animation.signature.startsWith('claim:')
      );
  }

  getAnimationEvent(state) {
    if (state.drawnCard && typeof state.currentSeat === 'number') {
      return { type: 'draw', seat: state.currentSeat, card: state.drawnCard };
    }
    if (state.recentDiscard) {
      return { type: 'discard', seat: state.recentDiscard.seat, card: state.recentDiscard.card };
    }
    return null;
  }

  animationStartForSeat(seat, layout) {
    const { width: cardWidth, height: cardHeight } = this.animationCardSize(layout);
    const bounds = layout.contentBounds || { x: 0, y: 0, width: layout.width, height: layout.height };
    if (seat === 0) return this.clampAnimationPosition({ x: bounds.x + bounds.width / 2 - cardWidth / 2, y: bounds.y + bounds.height - cardHeight - 8 }, layout);
    if (seat === 1) return this.clampAnimationPosition({ x: bounds.x + bounds.width - cardWidth - 8, y: bounds.y + bounds.height / 2 - cardHeight / 2 }, layout);
    if (seat === 2) return this.clampAnimationPosition({ x: bounds.x + bounds.width / 2 - cardWidth / 2, y: bounds.y + 8 }, layout);
    return this.clampAnimationPosition({ x: bounds.x + 8, y: bounds.y + bounds.height / 2 - cardHeight / 2 }, layout);
  }

  animationEndForSeat(seat, layout) {
    const side = seat === 0 ? 'bottom' : (seat === 1 ? 'right' : (seat === 2 ? 'top' : 'left'));
    const front = layout.playerFronts && layout.playerFronts[side];
    const { width: cardWidth, height: cardHeight } = this.animationCardSize(layout);
    if (!front) return this.animationStartForSeat(seat, layout);
    return this.clampAnimationPosition({
      x: front.x + front.width / 2 - cardWidth / 2,
      y: front.y + front.height / 2 - cardHeight / 2,
    }, layout);
  }

  animationCardSize(layout) {
    const width = Math.max(34, Math.min(54, Math.floor(layout.height * 0.13), Math.floor(layout.cardWidth * 1.12)));
    return {
      width,
      height: Math.round(width / BIG_CARD_ASPECT_RATIO),
    };
  }

  discardAnimationEnd(seat, layout) {
    const side = seat === 0 ? 'bottom' : (seat === 1 ? 'right' : (seat === 2 ? 'top' : 'left'));
    const area = layout.unclaimedZones && layout.unclaimedZones[side];
    const { width, height } = this.animationCardSize(layout);
    if (!area) return this.animationEndForSeat(seat, layout);
    return this.clampAnimationPosition({
      x: area.direction === 'rtl' ? area.x + area.width - width : area.x,
      y: area.y + area.height / 2 - height / 2,
    }, layout);
  }

  claimedAnimationEnd(seat, layout) {
    const side = seat === 0 ? 'bottom' : (seat === 1 ? 'right' : (seat === 2 ? 'top' : 'left'));
    const area = layout.claimedZones && layout.claimedZones[side];
    const { width, height } = this.animationCardSize(layout);
    if (!area) return this.animationEndForSeat(seat, layout);
    return this.clampAnimationPosition({
      x: area.direction === 'rtl' ? area.x + area.width - width : area.x,
      y: area.y,
    }, layout);
  }

  clampAnimationPosition(point, layout) {
    const bounds = layout.contentBounds || { x: 0, y: 0, width: layout.width, height: layout.height };
    const { width, height } = this.animationCardSize(layout);
    return {
      x: Math.max(bounds.x, Math.min(point.x, bounds.x + bounds.width - width)),
      y: Math.max(bounds.y, Math.min(point.y, bounds.y + bounds.height - height)),
    };
  }

  shouldHoldRecentDiscard(state, sourceSeat) {
    if (!state.recentDiscard || state.recentDiscard.seat !== sourceSeat) return false;
    return Boolean(
      (state.pendingActions && state.pendingActions.length)
      || (state.playerActions && state.playerActions.some((action) => ['chi', 'peng', 'zhao', 'ta', 'hu', 'pass'].indexOf(action.type) >= 0))
    );
  }

  shouldHideDiscardMini(state, sourceSeat) {
    return this.shouldHoldRecentDiscard(state, sourceSeat)
      || (
        this.animation
        && this.animation.stage === 'to-discard'
        && this.lastDiscardEvent
        && this.lastDiscardEvent.seat === sourceSeat
        && state.recentDiscard
        && state.recentDiscard.card.id === this.animation.card.id
      );
  }

  resolvingDiscardMiniId(sourceSeat) {
    if (
      this.animation
      && this.animation.stage === 'to-discard'
      && this.lastDiscardEvent
      && this.lastDiscardEvent.seat === sourceSeat
    ) {
      return this.animation.card.id;
    }
    return null;
  }

  resolvingClaimedMiniId(state, seat) {
    if (!this.animation || this.animation.stage !== 'to-claimed') return null;
    const claim = this.findClaimedCard(state, this.animation.card.id);
    if (!claim || claim.seat !== seat) return null;
    return this.animation.card.id;
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
    if (this.animation && this.animation.card && this.animation.card.id === state.recentDiscard.card.id) return;
    const { width: cardWidth, height: cardHeight } = this.animationCardSize(layout);
    const position = this.animationEndForSeat(state.recentDiscard.seat, layout);
    this.drawCard(ctx, state.recentDiscard.card, position.x, position.y, cardWidth, cardHeight, true, false, 'big');
  }

  drawCardAnimation(ctx, layout) {
    if (!this.animation) return;
    const elapsed = Date.now() - this.animation.startedAt;
    const progress = Math.min(1, Math.max(0, elapsed / this.animation.duration));
    const eased = 1 - Math.pow(1 - progress, 3);
    const { width: cardWidth, height: cardHeight } = this.animationCardSize(layout);
    const x = this.animation.start.x + (this.animation.end.x - this.animation.start.x) * eased;
    const y = this.animation.start.y + (this.animation.end.y - this.animation.start.y) * eased;
    this.drawCard(ctx, this.animation.card, x, y, cardWidth, cardHeight, true, false, 'big');
    if (progress < 1) return;

    if (this.animation.stage === 'to-front' && this.animation.signature.startsWith('discard:')) {
      this.animation.stage = 'hold-discard';
      this.animation.start = this.animation.end;
      this.animation.startedAt = Date.now();
      if (this.lastDiscardEvent) this.lastDiscardEvent.holdPosition = this.animation.end;
      return;
    }

    if (['to-discard', 'to-claimed'].indexOf(this.animation.stage) >= 0) {
      this.lastDiscardEvent = null;
    }
    this.animation = null;
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

  drawClaimedColumns(ctx, area, melds, layout, hiddenCardId = null) {
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
        .filter((card) => card.id !== hiddenCardId)
        .slice(0, Math.floor(area.height / cardHeight))
        .forEach((card, rowIndex) => {
        this.drawCard(ctx, card, x, area.y + rowIndex * cardHeight, cardWidth, cardHeight, true, false, 'mini');
      });
    });
  }

  getPhaseText(state) {
    if (state.phase === 'takeover-choice') return '请选择是否接庄';
    if (state.phase === 'ai-thinking') return `${state.seats[state.currentSeat].name} 正在思考`;
    if (state.phase === 'human-response') return '请选择吃、碰、招、踏、胡，或跳过';
    if (state.currentSeat === state.humanSeat) return '轮到你出牌';
    return `${state.seats[state.currentSeat].name} 行牌中`;
  }

  drawPlayerHand(ctx, state, layout) {
    layout.handCards.forEach((region) => {
      const selected = state.selectedCardId === region.card.id;
      this.drawCard(ctx, region.card, region.x, region.y, region.width, region.height, true, selected, 'small');
    });
  }

  drawButtons(ctx, state, layout) {
    layout.actionButtons.forEach((button) => {
      this.drawButton(ctx, button, button.action.label || button.action.type);
    });
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

  drawAtlasSprite(ctx, sprite, x, y, width, height, selected = false) {
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
    ctx.strokeStyle = selected ? '#f79009' : 'rgba(138, 90, 22, 0.64)';
    ctx.lineWidth = selected ? 2 : 1;
    roundRect(ctx, x, y, width, height, 5);
    ctx.stroke();
  }

  drawCard(ctx, card, x, y, width, height, front = true, selected = false, size = 'big') {
    if (!front) {
      this.drawCardBack(ctx, x, y, width, height, size);
      return;
    }

    const sprite = this.assets.getCardSprite(card, size);
    if (sprite) {
      this.drawAtlasSprite(ctx, sprite, x, y, width, height, selected);
      return;
    }

    ctx.fillStyle = selected ? '#fff1b8' : '#fffaf0';
    roundRect(ctx, x, y, width, height, 5);
    ctx.fill();
    ctx.strokeStyle = selected ? '#f79009' : '#8a5a16';
    ctx.lineWidth = selected ? 2 : 1;
    ctx.stroke();
    ctx.fillStyle = card.color || '#202020';
    ctx.font = `${Math.max(18, Math.floor(height * 0.44))}px serif`;
    ctx.textAlign = 'center';
    ctx.fillText(card.text, x + width / 2, y + height * 0.62);
    ctx.textAlign = 'left';
  }

  drawCardBack(ctx, x, y, width, height, size = 'big') {
    const sprite = this.assets.getCardBackSprite(size);
    if (sprite) {
      this.drawAtlasSprite(ctx, sprite, x, y, width, height, false);
      return;
    }

    const back = this.assets.getImage('cardBack');
    if (back) {
      ctx.drawImage(back, x, y, width, height);
      return;
    }
    ctx.fillStyle = '#8a3ffc';
    roundRect(ctx, x, y, width, height, 5);
    ctx.fill();
    ctx.strokeStyle = '#fff7dc';
    ctx.stroke();
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

  drawButton(ctx, button, label, compact = false) {
    ctx.fillStyle = 'rgba(255, 214, 102, 0.92)';
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
