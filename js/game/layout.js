import { SAFE_AREA_INSETS, SCREEN_HEIGHT, SCREEN_WIDTH } from '../render';
import { DEFAULT_RULES } from './rules';

export const HAND_CARD_SOURCE_WIDTH = 88;
export const HAND_CARD_SOURCE_HEIGHT = 108;
export const HAND_STACK_SOURCE_STEP = 54;
const HAND_SIZE_STACK_COUNT = 6;
const ACTION_BUTTON_HEIGHT = 50;
const ACTION_BUTTON_ASPECT_RATIOS = {
  acceptTakeover: 191 / 114,
  declineTakeover: 192 / 115,
  hu: 113 / 116,
  zhao: 113 / 116,
  ta: 113 / 116,
  peng: 113 / 116,
  chi: 113 / 116,
  pass: 94 / 97,
};
export const CARD_SOURCE_WIDTH = HAND_CARD_SOURCE_WIDTH;
export const CARD_SOURCE_HEIGHT = HAND_CARD_SOURCE_HEIGHT;
export const CARD_ASPECT_RATIO = HAND_CARD_SOURCE_WIDTH / HAND_CARD_SOURCE_HEIGHT;

function rect(x, y, width, height, meta = {}) {
  return { x, y, width, height, ...meta };
}

function sortGroupCards(cards) {
  return cards.slice().sort((a, b) => {
    if ((a.copy || 0) !== (b.copy || 0)) return (a.copy || 0) - (b.copy || 0);
    return a.id.localeCompare(b.id);
  });
}

function createColumn(phrase, phraseIndex, groups, meta = {}) {
  return {
    phrase,
    phraseIndex,
    groups,
    cards: groups.reduce((cards, group) => cards.concat(group.cards), []),
    ...meta,
  };
}

function cloneGroup(group) {
  return {
    ...group,
    cards: Array.isArray(group.cards) ? group.cards.slice() : [],
  };
}

function cloneColumn(column) {
  return {
    ...column,
    groups: (column.groups || []).map(cloneGroup),
    cards: (column.cards || []).slice(),
  };
}

function refreshColumnCards(column) {
  return {
    ...column,
    groups: (column.groups || []).filter((group) => group.cards.length).map(cloneGroup),
    cards: (column.groups || []).reduce((cards, group) => cards.concat(group.cards || []), []),
  };
}

function handIds(hand) {
  return new Set((Array.isArray(hand) ? hand : []).map((card) => card.id));
}

function buildHandResetKey(state) {
  return [
    state && typeof state.round === 'number' ? state.round : 'round',
    state && typeof state.humanSeat === 'number' ? state.humanSeat : 'human',
    state && state.jiangCard ? state.jiangCard.id : 'no-jiang',
  ].join(':');
}

function phraseColumnData(hand, rules = DEFAULT_RULES) {
  const sourceHand = Array.isArray(hand) ? hand : [];
  const phrases = Array.isArray(rules.phrases) ? rules.phrases : DEFAULT_RULES.phrases;
  const columns = [];
  const singleGroups = [];

  phrases.forEach((phrase, phraseIndex) => {
    const phraseKeys = Array.isArray(phrase.keys) ? phrase.keys : [];
    const groups = phraseKeys.map((key, keyIndex) => ({
      key,
      keyIndex,
      cards: sortGroupCards(sourceHand.filter((card) => card.phraseId === phrase.id && card.key === key)),
    }));
    let remaining = groups.map((group) => ({ ...group, cards: group.cards.slice() }));

    const splitLargestGroup = () => {
      const largest = remaining
        .filter((group) => group.cards.length)
        .sort((a, b) => (
          b.cards.length - a.cards.length
          || a.keyIndex - b.keyIndex
        ))[0];
      if (!largest) return false;
      columns.push(createColumn(phrase, phraseIndex, [{
        key: largest.key,
        keyIndex: largest.keyIndex,
        cards: largest.cards.slice(),
      }], { split: true }));
      largest.cards = [];
      return true;
    };

    while (remaining.reduce((total, group) => total + group.cards.length, 0) > 6) {
      if (!splitLargestGroup()) break;
    }

    const leftGroups = remaining.filter((group) => group.cards.length);
    const leftCount = leftGroups.reduce((total, group) => total + group.cards.length, 0);
    if (!leftCount) return;

    if (leftGroups.length === 1) {
      if (leftGroups[0].cards.length === 1) {
        singleGroups.push({
          phrase,
          phraseIndex,
          key: leftGroups[0].key,
          keyIndex: leftGroups[0].keyIndex,
          cards: leftGroups[0].cards.slice(),
        });
        return;
      }
      columns.push(createColumn(phrase, phraseIndex, [{
        key: leftGroups[0].key,
        keyIndex: leftGroups[0].keyIndex,
        cards: leftGroups[0].cards.slice(),
      }]));
      return;
    }

    columns.push(createColumn(
      phrase,
      phraseIndex,
      phraseKeys.map((key, keyIndex) => {
        const group = leftGroups.find((item) => item.key === key);
        return {
          key,
          keyIndex,
          cards: group ? group.cards.slice() : [],
        };
      }).filter((group) => group.cards.length)
    ));
  });

  let singlesBucket = [];
  singleGroups.forEach((group) => {
    group.cards.forEach((card) => {
      singlesBucket.push({ card, group });
      if (singlesBucket.length === 6) {
        columns.push(createSingleColumn(singlesBucket));
        singlesBucket = [];
      }
    });
  });
  if (singlesBucket.length) columns.push(createSingleColumn(singlesBucket));

  return columns.map((column, phraseColumn) => ({
    ...column,
    phraseColumn,
  }));
}

function assignPhraseColumns(columns) {
  return columns.map((column, phraseColumn) => ({
    ...column,
    phraseColumn,
  }));
}

function createSingleColumn(items) {
  const groups = [];
  items.forEach(({ card, group }) => {
    let target = groups.find((item) => item.key === group.key && item.phrase.id === group.phrase.id);
    if (!target) {
      target = {
        phrase: group.phrase,
        key: group.key,
        keyIndex: group.keyIndex,
        cards: [],
      };
      groups.push(target);
    }
    target.cards.push(card);
  });
  return createColumn(
    { id: 'singles', text: '单牌', keys: groups.map((group) => group.key) },
    Number.MAX_SAFE_INTEGER,
    groups.map((group, index) => ({
      key: group.key,
      keyIndex: group.keyIndex,
      phrase: group.phrase,
      cards: sortGroupCards(group.cards),
      singleGroupIndex: index,
    })),
    { singleCollection: true }
  );
}

function maxPhraseCardCount(columns) {
  return Math.max(1, ...columns.map((column) => column.cards.length));
}

function stackStepForHeight(cardHeight) {
  return Math.max(1, Math.round(HAND_STACK_SOURCE_STEP * (cardHeight / HAND_CARD_SOURCE_HEIGHT)));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeInsets(insets = {}) {
  return {
    left: Math.max(0, Number(insets.left) || 0),
    top: Math.max(0, Number(insets.top) || 0),
    right: Math.max(0, Number(insets.right) || 0),
    bottom: Math.max(0, Number(insets.bottom) || 0),
  };
}

function createContentBounds(width, height, baseSafe, insets = {}) {
  const safeInsets = normalizeInsets(insets);
  const x = Math.min(width, safeInsets.left + baseSafe);
  const y = Math.min(height, safeInsets.top + baseSafe);
  const right = Math.min(width, safeInsets.right + baseSafe);
  const bottom = Math.min(height, safeInsets.bottom + baseSafe);
  return rect(
    x,
    y,
    Math.max(1, width - x - right),
    Math.max(1, height - y - bottom),
    { type: 'content-bounds' }
  );
}

function centerRect(width, height, regionWidth, regionHeight, y, meta = {}) {
  return rect(
    Math.floor((width - regionWidth) / 2),
    y,
    regionWidth,
    regionHeight,
    meta
  );
}

function centerRectInBounds(bounds, regionWidth, regionHeight, y, meta = {}) {
  return rect(
    Math.floor(bounds.x + (bounds.width - regionWidth) / 2),
    y,
    regionWidth,
    regionHeight,
    meta
  );
}

function createSeatStatusAreas(bounds, isLandscape) {
  const width = bounds.width;
  const height = bounds.height;
  const avatarSize = isLandscape
    ? clamp(Math.floor(height * 0.12), 34, 46)
    : clamp(Math.floor(width * 0.11), 34, 42);
  const textHeight = 14;
  const statusHeight = avatarSize + textHeight * 2 + 4;
  const statusWidth = avatarSize + 8;
  const build = (side, seat, x, y) => {
    const avatar = rect(x + 4, y, avatarSize, avatarSize, { type: 'avatar', side, seat });
    const totalScore = rect(x, y + avatarSize + 3, statusWidth, textHeight, { type: 'total-score', side, seat });
    const roundFu = rect(x, y + avatarSize + textHeight + 5, statusWidth, textHeight, { type: 'round-fu', side, seat });
    return rect(x, y, statusWidth, statusHeight, {
      type: 'seat-status',
      side,
      seat,
      avatar,
      totalScore,
      roundFu,
    });
  };

  return {
    bottom: build('bottom', 0, bounds.x, bounds.y + bounds.height - statusHeight),
    left: build('left', 3, bounds.x, bounds.y),
    top: build('top', 2, Math.floor(bounds.x + (bounds.width - statusWidth) / 2), bounds.y),
    right: build('right', 1, bounds.x + bounds.width - statusWidth, bounds.y),
  };
}

function createPlayerPlacementRegions(bounds, topBar, handY, isLandscape, seatStatusAreas) {
  const width = bounds.width;
  const height = bounds.height;
  const left = bounds.x;
  const right = bounds.x + bounds.width;
  const miniCardWidth = isLandscape ? 16 : 15;
  const miniCardHeight = Math.round(miniCardWidth / CARD_ASPECT_RATIO);
  const queueWidth = isLandscape ? Math.max(112, Math.floor(width * 0.22)) : Math.max(84, Math.floor(width * 0.28));
  const claimedWidth = isLandscape ? Math.max(126, Math.floor(width * 0.22)) : Math.max(92, Math.floor(width * 0.30));
  const rowHeight = miniCardHeight;
  const claimedHeight = miniCardHeight * 6;
  const topY = topBar.y + topBar.height + 8;
  const status = seatStatusAreas;
  const rightDiscardY = status.right.y + status.right.height + 4;
  const bottomDiscardY = rightDiscardY + rowHeight + 2;
  const topClaimedWidth = Math.max(miniCardWidth * 3, status.top.avatar.x - left - 4);
  const topDiscardWidth = Math.max(
    miniCardWidth * 3,
    status.right.avatar.x - (status.top.avatar.x + status.top.avatar.width) - 8
  );

  const playerFronts = {
    bottom: rect(Math.floor(left + width / 2) - miniCardWidth, Math.max(topY, handY - 58), miniCardWidth * 2, miniCardHeight * 2, { type: 'player-front', seat: 0, side: 'bottom' }),
    left: rect(status.left.avatar.x + status.left.avatar.width + 10, status.left.avatar.y + status.left.avatar.height + 8, miniCardWidth * 2, miniCardHeight * 2, { type: 'player-front', seat: 3, side: 'left' }),
    top: rect(Math.floor(left + width / 2) - miniCardWidth, status.top.y + status.top.height + 4, miniCardWidth * 2, miniCardHeight * 2, { type: 'player-front', seat: 2, side: 'top' }),
    right: rect(status.right.avatar.x - miniCardWidth * 2 - 10, status.right.avatar.y + status.right.avatar.height + 8, miniCardWidth * 2, miniCardHeight * 2, { type: 'player-front', seat: 1, side: 'right' }),
  };

  const unclaimedZones = {
    bottom: rect(right - queueWidth, bottomDiscardY, queueWidth, rowHeight, { type: 'unclaimed-zone', seat: 0, side: 'bottom', direction: 'rtl' }),
    left: rect(status.left.avatar.x, status.left.y + status.left.height + 4, queueWidth, rowHeight, { type: 'unclaimed-zone', seat: 3, side: 'left', direction: 'ltr' }),
    top: rect(status.top.avatar.x + status.top.avatar.width + 4, status.top.avatar.y, topDiscardWidth, rowHeight, { type: 'unclaimed-zone', seat: 2, side: 'top', direction: 'ltr' }),
    right: rect(right - queueWidth, rightDiscardY, queueWidth, rowHeight, { type: 'unclaimed-zone', seat: 1, side: 'right', direction: 'rtl' }),
  };

  const claimedZones = {
    bottom: rect(left, Math.max(topY, status.bottom.y - claimedHeight - 3), claimedWidth, claimedHeight, { type: 'claimed-zone', seat: 0, side: 'bottom', direction: 'ltr' }),
    left: rect(status.left.avatar.x + status.left.avatar.width + 4, status.left.avatar.y, claimedWidth, claimedHeight, { type: 'claimed-zone', seat: 3, side: 'left', direction: 'ltr' }),
    top: rect(left, status.top.avatar.y, topClaimedWidth, claimedHeight, { type: 'claimed-zone', seat: 2, side: 'top', direction: 'rtl' }),
    right: rect(status.right.avatar.x - claimedWidth - 4, status.right.avatar.y, claimedWidth, claimedHeight, { type: 'claimed-zone', seat: 1, side: 'right', direction: 'rtl' }),
  };

  return {
    miniCardWidth,
    miniCardHeight,
    playerFronts,
    unclaimedZones,
    claimedZones,
  };
}

function createSeatPanels(bounds, topBar, handY, isLandscape) {
  const width = bounds.width;
  const height = bounds.height;
  const left = bounds.x;
  const right = bounds.x + bounds.width;
  const top = bounds.y;
  const bottom = bounds.y + bounds.height;
  if (!isLandscape) {
    const panelWidth = Math.max(68, Math.min(82, Math.floor(width * 0.22)));
    const panelHeight = 74;
    return {
      bottom: rect(left, bottom - panelHeight, panelWidth, panelHeight, { type: 'seat', seat: 0, side: 'bottom' }),
      left: rect(left, topBar.y + topBar.height + 16, panelWidth, panelHeight, { type: 'seat', seat: 3, side: 'left' }),
      top: centerRectInBounds(bounds, Math.max(86, panelWidth + 10), 48, topBar.y + topBar.height + 6, { type: 'seat', seat: 2, side: 'top' }),
      right: rect(right - panelWidth, topBar.y + topBar.height + 16, panelWidth, panelHeight, { type: 'seat', seat: 1, side: 'right' }),
    };
  }

  const sideWidth = clamp(Math.floor(width * 0.14), 78, 96);
  const sideHeight = clamp(Math.floor(height * 0.20), 58, 72);
  const bottomWidth = clamp(Math.floor(width * 0.16), 82, 106);
  const bottomHeight = clamp(Math.floor(height * 0.22), 64, 82);
  const topWidth = clamp(Math.floor(width * 0.15), 84, 96);
  const topHeight = clamp(Math.floor(height * 0.14), 40, 52);
  const tableTop = topBar.y + topBar.height + 6;
  const topSeatX = clamp(left + sideWidth + 10, left, Math.floor(left + width / 2) - topWidth - 8);

  return {
    bottom: rect(left, clamp(handY, top, bottom - bottomHeight), bottomWidth, bottomHeight, { type: 'seat', seat: 0, side: 'bottom' }),
    left: rect(left, tableTop + 8, sideWidth, sideHeight, { type: 'seat', seat: 3, side: 'left' }),
    top: rect(topSeatX, tableTop + 2, topWidth, topHeight, { type: 'seat', seat: 2, side: 'top' }),
    right: rect(right - sideWidth, tableTop + 8, sideWidth, sideHeight, { type: 'seat', seat: 1, side: 'right' }),
  };
}

function createTableZones(bounds, topBar, handY, actionY, seatPanels, isLandscape) {
  const width = bounds.width;
  const height = bounds.height;
  const left = bounds.x;
  const right = bounds.x + bounds.width;
  const top = bounds.y;
  const bottom = bounds.y + bounds.height;
  const tableSurfaceY = topBar.y + topBar.height + 6;
  const tableSurfaceBottom = Math.max(tableSurfaceY + 96, handY - 6);
  const tableSurface = rect(
    left,
    tableSurfaceY,
    width,
    Math.min(bottom - tableSurfaceY, tableSurfaceBottom - tableSurfaceY)
  );
  const promptWidth = Math.min(width, isLandscape ? 320 : 260);
  const promptHeight = isLandscape ? 26 : 30;
  const centerWidth = Math.min(isLandscape ? 156 : 132, width);
  const centerHeight = isLandscape ? clamp(Math.floor(height * 0.16), 44, 62) : 68;
  const centerY = isLandscape
    ? clamp(tableSurface.y + 26, tableSurface.y + 6, actionY - promptHeight - centerHeight - 14)
    : Math.max(tableSurface.y + 72, Math.floor(top + height * 0.36));
  const centerFocus = centerRectInBounds(bounds, centerWidth, centerHeight, centerY, { type: 'center-focus' });
  const promptY = isLandscape
    ? Math.min(actionY - promptHeight - 6, centerFocus.y + centerFocus.height + 6)
    : centerFocus.y + centerFocus.height + 8;
  const prompt = centerRectInBounds(bounds, promptWidth, promptHeight, promptY, { type: 'prompt' });
  const miniCardWidth = isLandscape ? 16 : 15;
  const miniCardHeight = Math.round(miniCardWidth / CARD_ASPECT_RATIO);
  const zoneHeight = isLandscape ? Math.max(34, miniCardHeight + 10) : 46;
  const sideZoneWidth = isLandscape ? Math.max(92, Math.floor(width * 0.20)) : Math.max(82, Math.floor(width * 0.28));
  const topZoneWidth = isLandscape ? Math.max(116, Math.floor(width * 0.24)) : Math.max(96, Math.floor(width * 0.34));
  const bottomZoneWidth = isLandscape ? clamp(Math.floor(width * 0.18), 96, 120) : Math.max(104, Math.floor(width * 0.32));

  const leftZoneX = seatPanels.left.x + seatPanels.left.width + 8;
  const rightZoneX = seatPanels.right.x - sideZoneWidth - 8;
  const topZoneX = Math.min(right - topZoneWidth, centerFocus.x + centerFocus.width + 12);
  const bottomZoneX = left;
  const lowerZoneY = clamp(actionY, top, bottom - zoneHeight);

  const discardZones = {
    bottom: rect(bottomZoneX, lowerZoneY, bottomZoneWidth, zoneHeight, { type: 'discard-zone', seat: 0, side: 'bottom' }),
    left: rect(leftZoneX, seatPanels.left.y + seatPanels.left.height + 6, sideZoneWidth, zoneHeight, { type: 'discard-zone', seat: 3, side: 'left' }),
    top: rect(topZoneX, topBar.y + topBar.height + 8, topZoneWidth, zoneHeight, { type: 'discard-zone', seat: 2, side: 'top' }),
    right: rect(rightZoneX, seatPanels.right.y + seatPanels.right.height + 6, sideZoneWidth, zoneHeight, { type: 'discard-zone', seat: 1, side: 'right' }),
  };

  const meldZones = {
    bottom: rect(discardZones.bottom.x, discardZones.bottom.y - zoneHeight - 4, bottomZoneWidth, zoneHeight, { type: 'meld-zone', seat: 0, side: 'bottom' }),
    left: rect(discardZones.left.x, discardZones.left.y + zoneHeight + 4, sideZoneWidth, zoneHeight, { type: 'meld-zone', seat: 3, side: 'left' }),
    top: rect(discardZones.top.x, discardZones.top.y + zoneHeight + 4, topZoneWidth, zoneHeight, { type: 'meld-zone', seat: 2, side: 'top' }),
    right: rect(discardZones.right.x, discardZones.right.y + zoneHeight + 4, sideZoneWidth, zoneHeight, { type: 'meld-zone', seat: 1, side: 'right' }),
  };

  return {
    tableSurface,
    centerFocus,
    prompt,
    miniCardWidth,
    miniCardHeight,
    discardZones,
    meldZones,
  };
}

function createActionModal(bounds, handY, playerActions, result, isLandscape = false) {
  const hasActions = playerActions.length > 0;
  const modalWidth = bounds.width;
  const modalHeight = hasActions ? ACTION_BUTTON_HEIGHT : 0;
  const modalY = Math.max(bounds.y + 54, handY - modalHeight - 12);
  return rect(
    Math.floor(bounds.x + (bounds.width - modalWidth) / 2),
    result ? bounds.y + bounds.height / 2 - modalHeight / 2 : modalY,
    modalWidth,
    modalHeight,
    { type: 'action-modal', visible: hasActions }
  );
}

function computeAspectCardWidth(handWidth, columnCount, handAreaHeight, maxStack) {
  const horizontalLimit = Math.floor(handWidth / columnCount);
  const sizingStack = Math.max(maxStack, HAND_SIZE_STACK_COUNT);
  const verticalLimit = Math.floor(
    (handAreaHeight * HAND_CARD_SOURCE_WIDTH)
    / (HAND_CARD_SOURCE_HEIGHT + HAND_STACK_SOURCE_STEP * Math.max(0, sizingStack - 1))
  );
  return Math.max(8, Math.min(horizontalLimit, verticalLimit));
}

function buildGroupedHandCards(player, state, metrics) {
  const columns = metrics.columns || phraseColumnData(player.hand, state.rules || DEFAULT_RULES);
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
    column.groups.forEach((group) => {
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
            phraseId: card.phraseId,
            phraseIndex: column.phraseIndex,
            phraseColumn,
            key: group.key,
            keyIndex: group.keyIndex,
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
  constructor(width = SCREEN_WIDTH, height = SCREEN_HEIGHT, options = {}) {
    this.width = width;
    this.height = height;
    this.safeAreaInsets = normalizeInsets(options.safeAreaInsets || SAFE_AREA_INSETS);
    this.handColumnState = null;
  }

  setViewport(width, height, options = {}) {
    const nextWidth = Math.max(1, Number(width) || this.width);
    const nextHeight = Math.max(1, Number(height) || this.height);
    const nextInsets = normalizeInsets(options.safeAreaInsets || this.safeAreaInsets);
    const signature = [
      nextWidth,
      nextHeight,
      nextInsets.left,
      nextInsets.top,
      nextInsets.right,
      nextInsets.bottom,
    ].join(':');
    const currentSignature = [
      this.width,
      this.height,
      this.safeAreaInsets.left,
      this.safeAreaInsets.top,
      this.safeAreaInsets.right,
      this.safeAreaInsets.bottom,
    ].join(':');
    if (signature === currentSignature) return false;
    this.width = nextWidth;
    this.height = nextHeight;
    this.safeAreaInsets = nextInsets;
    return true;
  }

  resetHandColumns() {
    this.handColumnState = null;
  }

  initialHandColumns(hand, rules) {
    return phraseColumnData(hand, rules).map(cloneColumn);
  }

  appendNewHandCards(columns, newCards, rules) {
    const appended = columns.map(cloneColumn);
    const overflow = [];

    newCards.forEach((card) => {
      const target = appended.find((column) => (
        !column.singleCollection
        && column.cards.length < 6
        && column.phrase
        && column.phrase.id === card.phraseId
      ));
      if (!target) {
        overflow.push(card);
        return;
      }

      let group = target.groups.find((item) => item.key === card.key);
      if (!group) {
        group = {
          key: card.key,
          keyIndex: typeof card.position === 'number' ? card.position : target.groups.length,
          cards: [],
        };
        target.groups.push(group);
      }
      group.cards = sortGroupCards(group.cards.concat([card]));
      target.groups = target.groups
        .filter((item) => item.cards.length)
        .sort((a, b) => (a.keyIndex || 0) - (b.keyIndex || 0));
      target.cards = target.groups.reduce((cards, item) => cards.concat(item.cards), []);
    });

    if (overflow.length) return appended.concat(this.initialHandColumns(overflow, rules));
    return appended;
  }

  stableHandColumns(hand, state, rules) {
    const sourceHand = Array.isArray(hand) ? hand : [];
    const resetKey = buildHandResetKey(state || {});
    const currentIds = handIds(sourceHand);

    if (!this.handColumnState || this.handColumnState.resetKey !== resetKey) {
      const columns = this.initialHandColumns(sourceHand, rules);
      this.handColumnState = { resetKey, columns, ids: currentIds };
      return assignPhraseColumns(columns.map(cloneColumn));
    }

    const nextColumns = [];
    const assignedIds = new Set();

    this.handColumnState.columns.forEach((column) => {
      const groups = (column.groups || []).map((group) => ({
        ...group,
        cards: (group.cards || []).filter((card) => currentIds.has(card.id)),
      })).filter((group) => group.cards.length);
      const nextColumn = refreshColumnCards({ ...column, groups });
      if (!nextColumn.cards.length) return;
      nextColumn.cards.forEach((card) => assignedIds.add(card.id));
      nextColumns.push(nextColumn);
    });

    const newCards = sourceHand.filter((card) => !assignedIds.has(card.id));
    const mergedColumns = this.appendNewHandCards(nextColumns, newCards, rules);
    const nonEmpty = mergedColumns
      .map(refreshColumnCards)
      .filter((column) => column.cards.length);

    this.handColumnState = {
      resetKey,
      columns: nonEmpty.map(cloneColumn),
      ids: currentIds,
    };
    return assignPhraseColumns(nonEmpty.map(cloneColumn));
  }

  build(state) {
    const width = this.width;
    const height = this.height;
    const isLandscape = width >= height;
    const safe = isLandscape ? 14 : 12;
    const safeAreaInsets = normalizeInsets(this.safeAreaInsets);
    const contentBounds = createContentBounds(width, height, safe, safeAreaInsets);
    const player = state.seats[state.humanSeat];
    const handWidth = contentBounds.width;
    const handBottom = contentBounds.y + contentBounds.height - (isLandscape ? 10 : 12);
    const handAreaHeight = isLandscape
      ? Math.max(140, Math.min(210, Math.floor(height * 0.46)))
      : Math.max(96, Math.min(170, Math.floor(height * 0.30)));
    const columns = this.stableHandColumns(player.hand, state, state.rules || DEFAULT_RULES);
    const columnCount = Math.max(1, columns.length);
    const maxStack = maxPhraseCardCount(columns);
    const cardWidth = computeAspectCardWidth(handWidth, columnCount, handAreaHeight, maxStack);
    const cardHeight = Math.round(cardWidth / CARD_ASPECT_RATIO);
    const stackStep = stackStepForHeight(cardHeight);
    const handContentHeight = cardHeight + Math.max(0, maxStack - 1) * stackStep;
    const centeredHandWidth = cardWidth * columnCount;
    const centeredHandX = Math.floor(contentBounds.x + (contentBounds.width - centeredHandWidth) / 2);
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
      columns,
    });
    const handCards = groupedHand.handCards;

    const topBar = rect(contentBounds.x, contentBounds.y, contentBounds.width, isLandscape ? 38 : 42, { type: 'top-bar' });
    const muteButton = rect(contentBounds.x + contentBounds.width - 42, contentBounds.y + contentBounds.height - 34, 38, 32, {
      type: 'mute',
      action: { type: 'mute', label: state.muted ? '静' : '音' },
    });
    const actionModal = createActionModal(contentBounds, handY, state.playerActions, state.phase === 'result', isLandscape);
    const buttonGap = isLandscape ? 8 : 6;
    const buttonHeight = ACTION_BUTTON_HEIGHT;
    const actionButtonWidths = state.playerActions.map((action) => (
      Math.round(buttonHeight * (ACTION_BUTTON_ASPECT_RATIOS[action.type] || 1))
    ));
    const actionGroupWidth = actionButtonWidths.reduce((total, buttonWidth) => total + buttonWidth, 0)
      + Math.max(0, state.playerActions.length - 1) * buttonGap;
    const actionStartX = Math.floor(contentBounds.x + (contentBounds.width - actionGroupWidth) / 2);
    const actionY = actionModal.visible
      ? actionModal.y
      : Math.max(contentBounds.y, handY - buttonHeight - 8);
    let nextActionX = actionStartX;
    const actionButtons = state.playerActions.map((action, index) => {
      const buttonWidth = actionButtonWidths[index];
      const button = rect(nextActionX, actionY, buttonWidth, buttonHeight, { type: 'action', action });
      nextActionX += buttonWidth + buttonGap;
      return button;
    });

    if (state.phase === 'result') {
      actionButtons.push(rect(contentBounds.x + contentBounds.width / 2 - 52, contentBounds.y + contentBounds.height / 2 + (isLandscape ? 58 : 76), 104, 40, {
        type: 'restart',
        action: { type: 'restart', label: '再来一局' },
      }));
    }

    const seatPanels = createSeatPanels(contentBounds, topBar, handY, isLandscape);
    const seatStatusAreas = createSeatStatusAreas(contentBounds, isLandscape);
    const zones = createTableZones(contentBounds, topBar, handY, actionY, seatPanels, isLandscape);
    const placements = createPlayerPlacementRegions(contentBounds, topBar, handY, isLandscape, seatStatusAreas);
    const meldArea = zones.meldZones.bottom;
    const discardArea = rect(
      Math.min(zones.discardZones.left.x, zones.discardZones.top.x, zones.centerFocus.x),
      zones.tableSurface.y,
      Math.max(
        zones.discardZones.right.x + zones.discardZones.right.width,
        zones.discardZones.top.x + zones.discardZones.top.width,
        zones.centerFocus.x + zones.centerFocus.width
      ) - Math.min(zones.discardZones.left.x, zones.discardZones.top.x, zones.centerFocus.x),
      Math.max(
        zones.meldZones.left.y + zones.meldZones.left.height,
        zones.meldZones.right.y + zones.meldZones.right.height,
        zones.meldZones.top.y + zones.meldZones.top.height,
        zones.centerFocus.y + zones.centerFocus.height
      ) - zones.tableSurface.y,
      { type: 'legacy-discard-area' }
    );
    const resultWidth = isLandscape ? Math.min(420, contentBounds.width) : contentBounds.width - 28;
    const resultHeight = isLandscape ? Math.min(180, Math.max(128, handY - topBar.y - topBar.height - 14)) : 210;
    const resultY = isLandscape
      ? Math.max(topBar.y + topBar.height + 8, Math.min(contentBounds.y + contentBounds.height / 2 - resultHeight / 2, handY - resultHeight - 8))
      : contentBounds.y + contentBounds.height / 2 - resultHeight / 2;

    return {
      width,
      height,
      safe,
      safeAreaInsets,
      contentBounds,
      isLandscape,
      topBar,
      tableSurface: zones.tableSurface,
      centerFocus: zones.centerFocus,
      cardWidth,
      cardHeight,
      cardStep: stackStep,
      cardAspectRatio: CARD_ASPECT_RATIO,
      miniCardWidth: placements.miniCardWidth,
      miniCardHeight: placements.miniCardHeight,
      handColumns: groupedHand.columns,
      handCards,
      actionButtons,
      actionArea: actionButtons.length
        ? rect(actionStartX, actionY, actionGroupWidth, buttonHeight, { type: 'action-area' })
        : rect(width / 2, actionY, 0, buttonHeight, { type: 'action-area' }),
      actionModal,
      playerFronts: placements.playerFronts,
      unclaimedZones: placements.unclaimedZones,
      claimedZones: placements.claimedZones,
      discardArea,
      meldArea,
      discardZones: placements.unclaimedZones,
      meldZones: placements.claimedZones,
      muteButton,
      seatStatusAreas,
      seatPanels,
      seats: seatPanels,
      opponents: [seatPanels.left, seatPanels.top, seatPanels.right],
      prompt: zones.prompt,
      result: rect(contentBounds.x + contentBounds.width / 2 - resultWidth / 2, resultY, resultWidth, resultHeight, { type: 'result' }),
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
