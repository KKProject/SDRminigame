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

export function claimedTarget(seat, layout) {
  const area = layout.claimedZones && layout.claimedZones[sideForSeat(seat)];
  const size = cardSize(layout);
  if (!area) return seatFront(seat, layout);
  return clampPosition({
    x: area.direction === 'rtl' ? area.x + area.width - size.width : area.x,
    y: area.y,
  }, layout);
}

export function effectTarget(seat, layout) {
  const front = layout.playerFronts && layout.playerFronts[sideForSeat(seat)];
  if (front) return { x: front.x + front.width / 2, y: front.y + front.height / 2 };
  const bounds = layout.contentBounds || { x: 0, y: 0, width: layout.width, height: layout.height };
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}
