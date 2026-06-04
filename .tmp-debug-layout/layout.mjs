import { SCREEN_HEIGHT, SCREEN_WIDTH } from './render-stub.mjs';

function rect(x, y, width, height, meta = {}) {
  return { x, y, width, height, ...meta };
}

export default class TableLayout {
  constructor(width = SCREEN_WIDTH, height = SCREEN_HEIGHT) {
    this.width = width;
    this.height = height;
  }

  build(state) {
    const width = this.width;
    const height = this.height;
    const isLandscape = width >= height;
    const safe = isLandscape ? 14 : 12;
    const player = state.seats[state.humanSeat];
    const handCount = Math.max(player.hand.length, 1);
    const cardWidth = isLandscape
      ? Math.max(30, Math.min(44, Math.floor(width / 16)))
      : Math.max(26, Math.min(42, Math.floor((width - safe * 2) / 9)));
    const cardHeight = Math.floor(cardWidth * 1.45);
    const handWidth = isLandscape ? width - safe * 2 : width - safe * 2;
    const handX = safe;
    const handSpan = handWidth - cardWidth;
    const cardStep = handCount > 1 ? Math.min(cardWidth + 5, handSpan / (handCount - 1)) : 0;
    const handY = height - cardHeight - (isLandscape ? 12 : 18);
    const handCards = player.hand.map((card, index) => {
      const selected = state.selectedCardId === card.id;
      return rect(handX + index * cardStep, handY - (selected ? 14 : 0), cardWidth, cardHeight, {
        type: 'hand-card',
        card,
        index,
      });
    });

    const buttonWidth = isLandscape ? Math.max(58, Math.min(82, Math.floor(width / 9))) : Math.max(48, Math.min(70, Math.floor(width / 5.5)));
    const buttonHeight = isLandscape ? 34 : 36;
    const actionY = isLandscape ? handY - buttonHeight - 10 : handY - buttonHeight - 14;
    const actionButtons = state.playerActions.map((action, index) => rect(
      safe + index * (buttonWidth + 8),
      actionY,
      buttonWidth,
      buttonHeight,
      { type: 'action', action }
    ));

    if (state.phase === 'result') {
      actionButtons.push(rect(width / 2 - 52, height / 2 + (isLandscape ? 58 : 76), 104, 40, {
        type: 'restart',
        action: { type: 'restart', label: '再来一局' },
      }));
    }

    const meldHeight = isLandscape ? 48 : 72;
    const meldArea = rect(safe, isLandscape ? actionY - meldHeight - 8 : handY - 96, width - safe * 2, meldHeight);
    const muteButton = rect(width - safe - 38, safe, 38, 32, {
      type: 'mute',
      action: { type: 'mute', label: state.muted ? '静' : '音' },
    });
    const prompt = isLandscape
      ? rect(safe, meldArea.y - 34, width - safe * 2, 28)
      : rect(safe, handY - 136, width - safe * 2, 30);
    const discardWidth = isLandscape ? Math.min(width - 220, Math.floor(width * 0.58)) : Math.min(width - safe * 2, 250);
    const discardY = isLandscape ? safe + 48 : height / 2 - 84;
    const discardHeight = isLandscape
      ? Math.max(58, Math.min(132, prompt.y - discardY - 8))
      : 150;
    const discardArea = rect(width / 2 - discardWidth / 2, discardY, discardWidth, discardHeight);
    const resultWidth = isLandscape ? Math.min(420, width - safe * 4) : width - safe * 2 - 28;
    const resultHeight = isLandscape ? Math.min(190, height - safe * 5) : 210;

    return {
      width,
      height,
      safe,
      isLandscape,
      cardWidth,
      cardHeight,
      cardStep,
      handCards,
      actionButtons,
      discardArea,
      meldArea,
      muteButton,
      opponents: [
        rect(safe, isLandscape ? safe + 48 : 72, isLandscape ? 88 : 76, isLandscape ? 64 : 82, { seat: 3 }),
        rect(width / 2 - (isLandscape ? 56 : 44), safe, isLandscape ? 112 : 88, isLandscape ? 44 : 82, { seat: 2 }),
        rect(width - safe - (isLandscape ? 88 : 76), isLandscape ? safe + 48 : 72, isLandscape ? 88 : 76, isLandscape ? 64 : 82, { seat: 1 }),
      ],
      prompt,
      result: rect(width / 2 - resultWidth / 2, height / 2 - resultHeight / 2, resultWidth, resultHeight),
    };
  }

  hit(layout, x, y) {
    const regions = []
      .concat(layout.actionButtons)
      .concat([layout.muteButton])
      .concat(layout.handCards.slice().reverse());

    return regions.find((region) => (
      x >= region.x
      && x <= region.x + region.width
      && y >= region.y
      && y <= region.y + region.height
    )) || null;
  }
}
