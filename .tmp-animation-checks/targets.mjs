const BIG_CARD_ASPECT_RATIO = 88 / 307;

function sideForSeat(seat) {
  return seat === 0 ? 'bottom' : (seat === 1 ? 'right' : (seat === 2 ? 'top' : 'left'));
}

export function cardSize(layout) {
  const width = Math.max(34, Math.min(54, Math.floor(layout.height * 0.13), Math.floor(layout.cardWidth * 1.12)));
  return { width, height: Math.round(width / BIG_CARD_ASPECT_RATIO) };
}

export function clampPosition(point, layout) {
  const bounds = layout.contentBounds || { x: 0, y: 0, width: layout.width, height: layout.height };
  const size = cardSize(layout);
  return {
    x: Math.max(bounds.x, Math.min(point.x, bounds.x + bounds.width - size.width)),
    y: Math.max(bounds.y, Math.min(point.y, bounds.y + bounds.height - size.height)),
  };
}

export function seatStart(seat, layout) {
  const size = cardSize(layout);
  const bounds = layout.contentBounds || { x: 0, y: 0, width: layout.width, height: layout.height };
  if (seat === 0) return clampPosition({ x: bounds.x + bounds.width / 2 - size.width / 2, y: bounds.y + bounds.height - size.height - 8 }, layout);
  if (seat === 1) return clampPosition({ x: bounds.x + bounds.width - size.width - 8, y: bounds.y + bounds.height / 2 - size.height / 2 }, layout);
  if (seat === 2) return clampPosition({ x: bounds.x + bounds.width / 2 - size.width / 2, y: bounds.y + 8 }, layout);
  return clampPosition({ x: bounds.x + 8, y: bounds.y + bounds.height / 2 - size.height / 2 }, layout);
}

export function seatFront(seat, layout) {
  const front = layout.playerFronts && layout.playerFronts[sideForSeat(seat)];
  const size = cardSize(layout);
  if (!front) return seatStart(seat, layout);
  return clampPosition({
    x: front.x + front.width / 2 - size.width / 2,
    y: front.y + front.height / 2 - size.height / 2,
  }, layout);
}

export function discardTarget(seat, layout) {
  const area = layout.unclaimedZones && layout.unclaimedZones[sideForSeat(seat)];
  const size = cardSize(layout);
  if (!area) return seatFront(seat, layout);
  return clampPosition({
    x: area.direction === 'rtl' ? area.x + area.width - size.width : area.x,
    y: area.y + area.height / 2 - size.height / 2,
  }, layout);
}

export function discardMiniTarget(seat, layout, discardIndex = 0) {
  const area = layout.unclaimedZones && layout.unclaimedZones[sideForSeat(seat)];
  const width = layout.miniCardWidth || 16;
  const height = layout.miniCardHeight || Math.round(width / (88 / 108));
  if (!area) return { ...seatFront(seat, layout), width, height };
  const maxVisible = Math.max(1, Math.floor(area.width / width));
  const visibleIndex = Math.max(0, Math.min(maxVisible - 1, Number(discardIndex) || 0));
  return {
    x: area.direction === 'rtl'
      ? area.x + area.width - width * (visibleIndex + 1)
      : area.x + width * visibleIndex,
    y: area.y,
    width,
    height,
  };
}

export function claimedTarget(seat, layout) {
  const area = layout.claimedZones && layout.claimedZones[sideForSeat(seat)];
  const size = cardSize(layout);
  if (!area) return seatFront(seat, layout);
  return clampPosition({
    x: area.direction === 'rtl' ? area.x + area.width - size.width : area.x,
    y: area.y,
  }, layout);
}

export function claimedMeldTargets(seat, layout, meldIndex = 0, cardCount = 0, meldCount = 0) {
  const area = layout.claimedZones && layout.claimedZones[sideForSeat(seat)];
  const width = layout.miniCardWidth || 16;
  const height = layout.miniCardHeight || Math.round(width / (88 / 108));
  if (!area) {
    const fallback = seatFront(seat, layout);
    return Array.from({ length: cardCount }, (_, index) => ({
      x: fallback.x,
      y: fallback.y + index * height,
      width,
      height,
    }));
  }
  const maxColumns = Math.max(1, Math.floor(area.width / width));
  const hiddenColumns = Math.max(0, (Number(meldCount) || 0) - maxColumns);
  const visibleIndex = Math.max(0, Math.min(maxColumns - 1, (Number(meldIndex) || 0) - hiddenColumns));
  const x = area.direction === 'rtl'
    ? area.x + area.width - width * (visibleIndex + 1)
    : area.x + width * visibleIndex;
  return Array.from({ length: cardCount }, (_, index) => ({
    x,
    y: area.y + index * height,
    width,
    height,
  }));
}

export function tableCenter(layout) {
  const bounds = layout.contentBounds || { x: 0, y: 0, width: layout.width, height: layout.height };
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

export function effectTarget(seat, layout) {
  const front = layout.playerFronts && layout.playerFronts[sideForSeat(seat)];
  if (front) return { x: front.x + front.width / 2, y: front.y + front.height / 2 };
  const bounds = layout.contentBounds || { x: 0, y: 0, width: layout.width, height: layout.height };
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}
