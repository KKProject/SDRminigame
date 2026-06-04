import TableLayout from './layout.mjs';

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
  }

  render(ctx, state) {
    const layout = this.layout.build(state);
    this.lastLayout = layout;

    ctx.clearRect(0, 0, layout.width, layout.height);
    this.drawBackground(ctx, layout);
    this.drawHeader(ctx, state, layout);
    this.drawOpponents(ctx, state, layout);
    this.drawDiscardArea(ctx, state, layout);
    this.drawMeldArea(ctx, state, layout);
    this.drawPrompt(ctx, state, layout);
    this.drawPlayerHand(ctx, state, layout);
    if (state.phase === 'result') this.drawResult(ctx, state, layout);
    this.drawButtons(ctx, state, layout);
  }

  drawBackground(ctx, layout) {
    const table = this.assets.getImage('table');
    if (table) {
      ctx.drawImage(table, 0, 0, layout.width, layout.height);
      ctx.fillStyle = 'rgba(10, 39, 32, 0.52)';
      ctx.fillRect(0, 0, layout.width, layout.height);
      return;
    }

    ctx.fillStyle = '#153f34';
    ctx.fillRect(0, 0, layout.width, layout.height);
    ctx.fillStyle = '#d9b56c';
    ctx.fillRect(0, 0, layout.width, 4);
  }

  drawHeader(ctx, state, layout) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    roundRect(ctx, layout.safe, layout.safe, 310, 34, 6);
    ctx.fill();
    ctx.fillStyle = '#fff7dc';
    ctx.font = '16px Arial';
    const dealer = state.seats[state.dealerSeat] ? state.seats[state.dealerSeat].name : '-';
    const jiang = state.jiangCard ? `${state.jiangCard.phraseText}/${state.jiangCard.text}` : '-';
    ctx.fillText(`上大人  庄:${dealer}  将:${jiang}  余:${state.deck.length}`, layout.safe + 10, layout.safe + 22);
    this.drawButton(ctx, layout.muteButton, state.muted ? '静音' : '有声', true);
  }

  drawOpponents(ctx, state, layout) {
    layout.opponents.forEach((area) => {
      const seat = state.seats[area.seat];
      const isCurrent = state.currentSeat === seat.id;
      ctx.fillStyle = isCurrent ? 'rgba(255, 214, 102, 0.32)' : 'rgba(255, 255, 255, 0.14)';
      roundRect(ctx, area.x, area.y, area.width, area.height, 6);
      ctx.fill();
      ctx.fillStyle = '#fff7dc';
      ctx.font = '14px Arial';
      ctx.fillText(`${seat.name}${seat.isDealer ? ' 庄' : ''}`, area.x + 8, area.y + 20);
      ctx.fillText(`${seat.hand.length} 张`, area.x + 8, area.y + 42);
      if (area.height >= 60) {
        ctx.fillText(`弃 ${seat.discards.length}`, area.x + 8, area.y + 60);
      }
    });
  }

  drawDiscardArea(ctx, state, layout) {
    const area = layout.discardArea;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.13)';
    roundRect(ctx, area.x, area.y, area.width, area.height, 8);
    ctx.fill();

    ctx.fillStyle = '#fff7dc';
    ctx.font = '15px Arial';
    ctx.fillText('弃牌区', area.x + 10, area.y + 24);

    if (layout.isLandscape) {
      state.seats.forEach((seat, seatIndex) => {
        const col = seatIndex % 2;
        const row = Math.floor(seatIndex / 2);
        const laneWidth = area.width / 2;
        const x = area.x + 10 + col * laneWidth;
        const y = area.y + 30 + row * 28;
        ctx.fillStyle = '#fff7dc';
        ctx.font = '12px Arial';
        ctx.fillText(seat.name, x, y + 16);
        seat.discards.slice(-6).forEach((card, index) => {
          this.drawTinyCard(ctx, card, x + 36 + index * 20, y);
        });
      });
      if (state.recentDiscard) {
        ctx.fillStyle = '#ffd666';
        ctx.font = '13px Arial';
        ctx.fillText(
          `最近：${state.recentDiscard.card.text}`,
          area.x + area.width - 70,
          area.y + 24
        );
      }
      return;
    }

    const recent = state.recentDiscard;
    if (recent) {
      this.drawCard(ctx, recent.card, area.x + area.width / 2 - 22, area.y + 36, 44, 64, true, false, 'small');
      ctx.fillStyle = '#fff7dc';
      ctx.font = '13px Arial';
      ctx.fillText(`${state.seats[recent.seat].name} 打出`, area.x + area.width / 2 - 38, area.y + 128);
    }

    state.seats.forEach((seat, seatIndex) => {
      const rowY = area.y + 30 + seatIndex * 26;
      const cards = seat.discards.slice(-5);
      cards.forEach((card, index) => {
        this.drawTinyCard(ctx, card, area.x + 10 + index * 22, rowY);
      });
    });
  }

  drawMeldArea(ctx, state, layout) {
    const player = state.seats[state.humanSeat];
    const area = layout.meldArea;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    roundRect(ctx, area.x, area.y, area.width, area.height, 6);
    ctx.fill();
    ctx.fillStyle = '#fff7dc';
    ctx.font = '14px Arial';
    ctx.fillText('我的门前', area.x + 8, area.y + 20);

    let x = area.x + 76;
    player.melds.forEach((meld) => {
      meld.cards.forEach((card) => {
        this.drawTinyCard(ctx, card, x, area.y + 30);
        x += 20;
      });
      ctx.fillStyle = '#ffd666';
      ctx.fillText(meld.label, x + 2, area.y + 48);
      x += 34;
    });
    if (player.history && player.history.takeover) {
      ctx.fillStyle = '#ffd666';
      ctx.font = '13px Arial';
      ctx.fillText(`接庄凑牌 ${player.history.takeoverOperations}/3 ${player.history.listening ? '已听' : ''}`, area.x + area.width - 150, area.y + 20);
    }
  }

  drawPrompt(ctx, state, layout) {
    const text = state.feedback || this.getPhaseText(state);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    roundRect(ctx, layout.prompt.x, layout.prompt.y, layout.prompt.width, layout.prompt.height, 6);
    ctx.fill();
    ctx.fillStyle = '#fff7dc';
    ctx.font = '15px Arial';
    ctx.fillText(text, layout.prompt.x + 10, layout.prompt.y + 20);
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
        ctx.fillText(`将：${jiangPhrase ? jiangPhrase.text : '-'}  等级：${result.grade}  福：${result.scoring.totalFu}  分：${result.points}`, area.x + 24, area.y + 142);
        const detail = result.scoring.entries
          .slice(0, 3)
          .map((entry) => `${entry.description}+${entry.fu}`)
          .join('，');
        ctx.fillText(detail || '无额外计福', area.x + 24, area.y + 172);
      }
    } else if (result.type === 'circle-loss') {
      ctx.fillText(`输家：${state.seats[result.loser].name}`, area.x + 24, area.y + 82);
      ctx.fillText(`赢家：${result.winners.map((seat) => state.seats[seat].name).join('、')}`, area.x + 24, area.y + 112);
      ctx.fillText(result.reason || '', area.x + 24, area.y + 142);
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
    this.drawCard(ctx, card, x, y, 18, 24, true, false, 'small');
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
}
