import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../render';
import { DEFAULT_RULES } from './rules';

export const HAND_CARD_SOURCE_WIDTH = 88;
export const HAND_CARD_SOURCE_HEIGHT = 108;
export const HAND_STACK_SOURCE_STEP = 40;
export const CARD_SOURCE_WIDTH = HAND_CARD_SOURCE_WIDTH;
export const CARD_SOURCE_HEIGHT = HAND_CARD_SOURCE_HEIGHT;
export const CARD_ASPECT_RATIO = HAND_CARD_SOURCE_WIDTH / HAND_CARD_SOURCE_HEIGHT;

function rect(x, y, width, height, meta = {}) {
  return { x, y, width, height, ...meta };
}

function phraseColumnData(hand, rules = DEFAULT_RULES) {
  const phrases = rules.phrases || DEFAULT_RULES.phrases;
  const phraseMap = phrases.reduce((map, phrase, phraseIndex) => {
    map[phrase.id] = { phrase, phraseIndex };
    return map;
  }, {});

  return phrases.map((phrase, phraseIndex) => {
    const groups = phrase.keys.map((key, keyIndex) => ({
      key,
      keyIndex,
      cards: [],
    }));
    hand.forEach((card) => {
      if (card.phraseId !== phrase.id) return;
      const keyIndex = phrase.keys.indexOf(card.key);
      if (keyIndex >= 0) groups[keyIndex].cards.push(card);
    });
    groups.forEach((group) => {
      group.cards.sort((a, b) => {
        if ((a.copy || 0) !== (b.copy || 0)) return (a.copy || 0) - (b.copy || 0);
        return a.id.localeCompare(b.id);
      });
    });
    return {
      phrase,
      phraseIndex,
      groups,
      cards: groups.reduce((cards, group) => cards.concat(group.cards), []),
    };
  }).sort((a, b) => {
    const aOrder = phraseMap[a.phrase.id] ? phraseMap[a.phrase.id].phraseIndex : a.phraseIndex;
    const bOrder = phraseMap[b.phrase.id] ? phraseMap[b.phrase.id].phraseIndex : b.phraseIndex;
    return aOrder - bOrder;
  });
}

function maxPhraseCardCount(columns) {
  return Math.max(1, ...columns.map((column) => column.cards.length));
}

function stackStepForHeight(cardHeight) {
  return Math.max(1, Math.round(HAND_STACK_SOURCE_STEP * (cardHeight / HAND_CARD_SOURCE_HEIGHT)));
}

function computeAspectCardWidth(handWidth, columnCount, handAreaHeight, maxStack) {
  const horizontalLimit = Math.floor(handWidth / columnCount);
  const verticalLimit = Math.floor(
    (handAreaHeight * HAND_CARD_SOURCE_WIDTH)
    / (HAND_CARD_SOURCE_HEIGHT + HAND_STACK_SOURCE_STEP * Math.max(0, maxStack - 1))
  );
  return Math.max(8, Math.min(horizontalLimit, verticalLimit));
}

function buildGroupedHandCards(player, state, metrics) {
  const columns = phraseColumnData(player.hand, state.rules || DEFAULT_RULES);
  const {
    cardWidth,
    cardHeight,
    handX,
    handY,
    maxStack,
    stackStep,
    selectedLift,
  } = metrics;
  const handCards = [];

  columns.forEach((column, phraseColumn) => {
    const columnX = handX + phraseColumn * cardWidth;
    const columnY = handY + Math.max(0, maxStack - column.cards.length) * stackStep;
    let phraseStackIndex = 0;
    column.groups.forEach((group, keyIndex) => {
      group.cards.forEach((card) => {
        const selected = state.selectedCardId === card.id;
        handCards.push(rect(
          columnX,
          columnY + phraseStackIndex * stackStep - (selected ? selectedLift : 0),
          cardWidth,
          cardHeight,
          {
            type: 'hand-card',
            card,
            index: handCards.length,
            phraseId: column.phrase.id,
            phraseIndex: column.phraseIndex,
            phraseColumn,
            key: group.key,
            keyIndex,
            stackIndex: phraseStackIndex,
          }
        ));
        phraseStackIndex += 1;
      });
    });
  });

  return { handCards, columns };
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
    const handWidth = width - safe * 2;
    const handBottom = height - (isLandscape ? 10 : 12);
    const handAreaHeight = isLandscape
      ? Math.max(86, Math.min(148, Math.floor(height * 0.34)))
      : Math.max(96, Math.min(170, Math.floor(height * 0.30)));
    const columnCount = (state.rules && state.rules.phrases ? state.rules.phrases.length : DEFAULT_RULES.phrases.length);
    const columns = phraseColumnData(player.hand, state.rules || DEFAULT_RULES);
    const maxStack = maxPhraseCardCount(columns);
    const cardWidth = computeAspectCardWidth(handWidth, columnCount, handAreaHeight, maxStack);
    const cardHeight = Math.round(cardWidth / CARD_ASPECT_RATIO);
    const stackStep = stackStepForHeight(cardHeight);
    const handContentHeight = cardHeight + Math.max(0, maxStack - 1) * stackStep;
    const centeredHandWidth = cardWidth * columnCount;
    const centeredHandX = Math.floor((width - centeredHandWidth) / 2);
    const handY = handBottom - handContentHeight;
    const selectedLift = Math.min(12, Math.max(5, Math.floor(cardHeight * 0.12)));
    const groupedHand = buildGroupedHandCards(player, state, {
      cardWidth,
      cardHeight,
      handX: centeredHandX,
      handY,
      maxStack,
      stackStep,
      selectedLift,
    });
    const handCards = groupedHand.handCards;

    const buttonWidth = isLandscape ? Math.max(58, Math.min(82, Math.floor(width / 9))) : Math.max(48, Math.min(70, Math.floor(width / 5.5)));
    const buttonHeight = isLandscape ? 34 : 36;
    const actionY = isLandscape ? handY - buttonHeight - 8 : handY - buttonHeight - 12;
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

    const meldHeight = isLandscape ? 42 : 60;
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
      cardStep: stackStep,
      cardAspectRatio: CARD_ASPECT_RATIO,
      handColumns: groupedHand.columns,
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
