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
const RENDERABLE_RESULT_TYPES = ['win', 'circle-loss', 'draw-round', 'draw'];
const ROUND_RESULT_PANEL_SOURCE_SLICES = {
  left: 170,
  top: 150,
  right: 170,
  bottom: 150,
};
const TABLE_RECORD_ROW_SOURCE_SLICES = {
  left: 30,
  top: 30,
  right: 30,
  bottom: 30,
};
const ROUND_RESULT_MAX_COLUMN_CARDS = 5;
const ROUND_RESULT_GROUP_LABELS = {
  chi: '吃',
  peng: '碰',
  zhao: '招',
  ta: '踏',
  xyz: '吃',
  xx: '对',
  xy: '口',
};

function roundResultGroupLabel(group = {}) {
  const type = group.meldType || group.type || '';
  if (type === 'same') return (group.cards || []).length >= 4 ? '招' : '碰';
  return ROUND_RESULT_GROUP_LABELS[type] || group.label || '';
}

function splitLargeRoundResultDoor(cards) {
  if (cards.length <= ROUND_RESULT_MAX_COLUMN_CARDS) return [cards];
  const columnCount = Math.ceil(cards.length / ROUND_RESULT_MAX_COLUMN_CARDS);
  const baseSize = Math.floor(cards.length / columnCount);
  const remainder = cards.length % columnCount;
  const columns = [];
  let offset = 0;
  for (let index = 0; index < columnCount; index += 1) {
    const size = baseSize + (index < remainder ? 1 : 0);
    columns.push(cards.slice(offset, offset + size));
    offset += size;
  }
  return columns;
}

function splitRoundResultCardsAtDoorBoundaries(cards) {
  const runs = [];
  cards.forEach((card) => {
    const currentRun = runs[runs.length - 1];
    if (currentRun && currentRun[0] && currentRun[0].key === card.key) {
      currentRun.push(card);
    } else {
      runs.push([card]);
    }
  });

  const columns = [];
  let pending = [];
  const flushPending = () => {
    if (!pending.length) return;
    columns.push(pending);
    pending = [];
  };

  runs.forEach((run) => {
    if (run.length >= 3) {
      flushPending();
      splitLargeRoundResultDoor(run).forEach((door) => columns.push(door));
      return;
    }
    if (pending.length + run.length > ROUND_RESULT_MAX_COLUMN_CARDS) {
      flushPending();
    }
    pending = pending.concat(run);
  });
  flushPending();
  return columns;
}

function splitRoundResultColumns(columns = []) {
  return columns.reduce((result, column) => {
    const cards = column.cards || [];
    if (cards.length <= ROUND_RESULT_MAX_COLUMN_CARDS) {
      result.push(column);
      return result;
    }
    splitRoundResultCardsAtDoorBoundaries(cards).forEach((door, index) => {
      result.push(Object.assign({}, column, {
        label: index === 0 ? column.label : '',
        cards: door,
        continuation: index > 0,
      }));
    });
    return result;
  }, []);
}

function hasRenderableResult(result) {
  return Boolean(result && RENDERABLE_RESULT_TYPES.indexOf(result.type) >= 0);
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

function drawImageContain(ctx, image, area) {
  if (!ctx || !image || !area) return false;
  const sourceWidth = Number(image.naturalWidth || image.width) || 0;
  const sourceHeight = Number(image.naturalHeight || image.height) || 0;
  if (area.width <= 0 || area.height <= 0) return false;
  if (!sourceWidth || !sourceHeight) {
    ctx.drawImage(image, area.x, area.y, area.width, area.height);
    return true;
  }
  const scale = Math.min(area.width / sourceWidth, area.height / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  ctx.drawImage(
    image,
    area.x + (area.width - width) / 2,
    area.y + (area.height - height) / 2,
    width,
    height
  );
  return true;
}

function drawImageCover(ctx, image, area) {
  if (!ctx || !image || !area) return false;
  const sourceWidth = Number(image.naturalWidth || image.width) || 0;
  const sourceHeight = Number(image.naturalHeight || image.height) || 0;
  if (area.width <= 0 || area.height <= 0) return false;
  if (!sourceWidth || !sourceHeight) {
    ctx.drawImage(image, area.x, area.y, area.width, area.height);
    return true;
  }
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = area.width / area.height;
  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;
  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx = (sourceWidth - sw) / 2;
  } else {
    sh = sourceWidth / targetRatio;
    sy = (sourceHeight - sh) / 2;
  }
  ctx.drawImage(image, sx, sy, sw, sh, area.x, area.y, area.width, area.height);
  return true;
}

function circlePath(ctx, area) {
  const radius = Math.min(area.width, area.height) / 2;
  const centerX = area.x + area.width / 2;
  const centerY = area.y + area.height / 2;
  ctx.beginPath();
  if (ctx.arc) {
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }
  roundRect(ctx, centerX - radius, centerY - radius, radius * 2, radius * 2, radius);
}

function drawHorizontalThreeSliceImage(ctx, image, target, sourceEdge = 24) {
  if (!ctx || !image || !target || target.width <= 0 || target.height <= 0) return false;
  const sourceWidth = Number(image.naturalWidth || image.width) || 0;
  const sourceHeight = Number(image.naturalHeight || image.height) || 0;
  if (!sourceWidth || !sourceHeight) return false;
  const edge = Math.max(1, Math.min(sourceEdge, sourceWidth / 2));
  const targetEdge = Math.min(target.width / 2, edge * (target.height / sourceHeight));
  ctx.drawImage(image, 0, 0, edge, sourceHeight, target.x, target.y, targetEdge, target.height);
  ctx.drawImage(
    image,
    edge,
    0,
    sourceWidth - edge * 2,
    sourceHeight,
    target.x + targetEdge,
    target.y,
    Math.max(0, target.width - targetEdge * 2),
    target.height
  );
  ctx.drawImage(
    image,
    sourceWidth - edge,
    0,
    edge,
    sourceHeight,
    target.x + target.width - targetEdge,
    target.y,
    targetEdge,
    target.height
  );
  return true;
}

export function drawNineSliceImage(ctx, image, target, sourceSlices, targetSlices) {
  if (!ctx || !image || !target || target.width <= 0 || target.height <= 0) return false;
  const sourceWidth = Number(image.naturalWidth || image.width) || 0;
  const sourceHeight = Number(image.naturalHeight || image.height) || 0;
  if (!sourceWidth || !sourceHeight) return false;

  const sourceLeft = Math.max(0, Math.min(sourceWidth, sourceSlices.left || 0));
  const sourceRight = Math.max(0, Math.min(sourceWidth - sourceLeft, sourceSlices.right || 0));
  const sourceTop = Math.max(0, Math.min(sourceHeight, sourceSlices.top || 0));
  const sourceBottom = Math.max(0, Math.min(sourceHeight - sourceTop, sourceSlices.bottom || 0));
  const targetLeft = Math.max(0, Math.min(target.width / 2, targetSlices.left || 0));
  const targetRight = Math.max(0, Math.min(target.width - targetLeft, targetSlices.right || 0));
  const targetTop = Math.max(0, Math.min(target.height / 2, targetSlices.top || 0));
  const targetBottom = Math.max(0, Math.min(target.height - targetTop, targetSlices.bottom || 0));
  const sourceXs = [0, sourceLeft, sourceWidth - sourceRight, sourceWidth];
  const sourceYs = [0, sourceTop, sourceHeight - sourceBottom, sourceHeight];
  const targetXs = [target.x, target.x + targetLeft, target.x + target.width - targetRight, target.x + target.width];
  const targetYs = [target.y, target.y + targetTop, target.y + target.height - targetBottom, target.y + target.height];

  const overlap = 0.75;
  const cells = [
    [1, 1],
    [0, 1], [1, 0], [1, 2], [2, 1],
    [0, 0], [0, 2], [2, 0], [2, 2],
  ];
  cells.forEach(([row, column]) => {
      const sourceX = Math.max(0, sourceXs[column] - (column > 0 ? 1 : 0));
      const sourceY = Math.max(0, sourceYs[row] - (row > 0 ? 1 : 0));
      const sourceEndX = Math.min(sourceWidth, sourceXs[column + 1] + (column < 2 ? 1 : 0));
      const sourceEndY = Math.min(sourceHeight, sourceYs[row + 1] + (row < 2 ? 1 : 0));
      const targetX = targetXs[column] - (column > 0 ? overlap : 0);
      const targetY = targetYs[row] - (row > 0 ? overlap : 0);
      const targetEndX = targetXs[column + 1] + (column < 2 ? overlap : 0);
      const targetEndY = targetYs[row + 1] + (row < 2 ? overlap : 0);
      const sourceCellWidth = sourceEndX - sourceX;
      const sourceCellHeight = sourceEndY - sourceY;
      const targetCellWidth = targetEndX - targetX;
      const targetCellHeight = targetEndY - targetY;
      if (sourceCellWidth <= 0 || sourceCellHeight <= 0 || targetCellWidth <= 0 || targetCellHeight <= 0) return;
      ctx.drawImage(
        image,
        sourceX,
        sourceY,
        sourceCellWidth,
        sourceCellHeight,
        targetX,
        targetY,
        targetCellWidth,
        targetCellHeight
      );
  });
  return true;
}

export function roundResultStatusPresentation(state) {
  const result = (state && state.result) || {};
  if (result.type === 'win') {
    const isWinner = result.winner === state.humanSeat;
    return {
      assetName: isWinner ? 'roundResultVictory' : 'roundResultDefeat',
      text: isWinner ? '胜利' : '失败',
    };
  }
  const labels = {
    'circle-loss': '本局进圈',
    'draw-round': '本局流局',
    draw: '本局荒庄',
  };
  return { assetName: null, text: labels[result.type] || '本局结束' };
}

export function roundResultGradeLabel(grade) {
  return ({
    屁胡: '平胡',
    平胡: '平胡',
    小甲: '小甲',
    大甲: '大甲',
    场: '场胡',
    场胡: '场胡',
  })[grade] || '';
}

export function roundResultDetailWithGrade(detail = {}, result = {}, isWinner = false) {
  if (!isWinner || detail.huGrade) return detail;
  const fallbackGrade = result.grade || (result.scoring && result.scoring.grade) || '';
  return fallbackGrade ? Object.assign({}, detail, { huGrade: fallbackGrade }) : detail;
}

export function tableRecordPlayLabel(settings = {}) {
  const payType = ({ pihu: '平胡赔', jiahu: '甲胡赔', changhu: '场胡赔' })[settings.payType] || '平胡赔';
  const flags = [
    settings.repeatRound ? '重局' : '',
    settings.washTwice ? '双洗' : '',
  ].filter(Boolean);
  return [payType].concat(flags).join('·');
}

function signedScore(value) {
  const score = Number(value) || 0;
  return score > 0 ? `+${score}` : String(score);
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
    this.currentJiangPhraseId = null;
    this.roundResultScrollOffset = 0;
    this.roundResultScrollMax = 0;
    this.roundResultScrollSignature = '';
    this.tableRecordScrollOffset = 0;
    this.tableRecordScrollMax = 0;
    this.tableRecordScrollSignature = '';
  }

  setViewport(metrics, options = {}) {
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
    if (signature === this.viewportSignature) {
      if (!options.forceLayout) return false;
      this.lastLayout = null;
      this.buttonPanelSignature = '';
      this.buttonPress = null;
      this.roundResultScrollOffset = 0;
      this.roundResultScrollMax = 0;
      this.roundResultScrollSignature = '';
      this.tableRecordScrollOffset = 0;
      this.tableRecordScrollMax = 0;
      this.tableRecordScrollSignature = '';
      return true;
    }

    this.animationController.prepareForLayoutChange();
    this.stateAnimationController.handleLayoutChange();
    this.layout.setViewport(metrics.width, metrics.height, { safeAreaInsets: insets });
    this.viewportSignature = signature;
    this.lastLayout = null;
    this.lastDiscardEvent = null;
    this.previousHandCards = [];
    this.buttonPanelSignature = '';
    this.buttonPress = null;
    this.roundResultScrollOffset = 0;
    this.roundResultScrollMax = 0;
    this.roundResultScrollSignature = '';
    this.tableRecordScrollOffset = 0;
    this.tableRecordScrollMax = 0;
    this.tableRecordScrollSignature = '';
    this.restoreAnimationsAfterLayout = true;
    return true;
  }

  render(ctx, state) {
    const displayState = state.phase === 'result' && !hasRenderableResult(state.result)
      ? Object.assign({}, state, { phase: 'ai-thinking' })
      : state;
    const layout = this.layout.build(displayState);
    this.lastLayout = layout;
    this.lastState = displayState;
    this.currentJiangPhraseId = displayState.jiangPhraseId || null;
    if (this.restoreAnimationsAfterLayout) {
      this.restoreAnimationsAfterLayout = false;
      this.animationController.restoreAfterLayoutChange();
    }

    ctx.clearRect(0, 0, layout.width, layout.height);
    const blockStateAnimation = this.animationController.isBlockingStateAnimation()
      || Boolean(displayState.animationWaiting);
    this.stateAnimationController.observe(displayState, layout, blockStateAnimation);
    if (this.stateAnimationController.active && this.stateAnimationController.active.event.card) {
      this.lastDiscardEvent = {
        seat: this.stateAnimationController.active.event.seat,
        card: this.stateAnimationController.active.event.card,
        holdPosition: this.stateAnimationController.active.position,
      };
    }
    this.updateEffects(displayState, layout);
    if (layout.tableRecord) {
      this.drawTableRecordPage(ctx, displayState, layout);
      this.drawButtons(ctx, displayState, layout);
      this.previousHandCards = [];
      return;
    }
    if (layout.roundResult) {
      this.drawRoundResultPage(ctx, displayState, layout);
      this.drawButtons(ctx, displayState, layout);
      this.previousHandCards = [];
      return;
    }
    this.drawBackground(ctx, layout);
    this.drawHeader(ctx, displayState, layout);
    this.drawSeatStatuses(ctx, displayState, layout);
    this.drawDiscardArea(ctx, displayState, layout);
    this.drawMeldArea(ctx, displayState, layout);
    this.drawCenterFocus(ctx, displayState, layout);
    this.drawPlayerHand(ctx, displayState, layout);
    this.drawHeldDiscardFallback(ctx, displayState, layout);
    this.drawHeldDrawFallback(ctx, displayState, layout);
    this.drawManagedAnimations(ctx, layout);
    if (displayState.phase === 'result') this.drawResult(ctx, displayState, layout);
    this.drawButtons(ctx, displayState, layout);
    this.previousHandCards = layout.handCards.map((item) => ({ ...item }));
  }

  drawTableRecordPage(ctx, state, layout) {
    const page = layout.tableRecord;
    const record = state.tableRecord || {};
    const scrollSignature = `${record.roomId || state.tableRoomId || ''}:${record.completedRounds || 0}:${(record.players || []).length}`;
    if (scrollSignature !== this.tableRecordScrollSignature) {
      this.tableRecordScrollSignature = scrollSignature;
      this.tableRecordScrollOffset = 0;
    }
    this.tableRecordScrollMax = page.maxScroll || 0;
    this.tableRecordScrollOffset = Math.max(
      0,
      Math.min(this.tableRecordScrollOffset, this.tableRecordScrollMax)
    );
    const background = this.assets.getImage('hall') || this.assets.getImage('table');
    if (background && background.width && background.height) {
      const sourceRatio = background.width / background.height;
      const targetRatio = layout.width / layout.height;
      let sx = 0;
      let sy = 0;
      let sw = background.width;
      let sh = background.height;
      if (sourceRatio > targetRatio) {
        sw = background.height * targetRatio;
        sx = (background.width - sw) / 2;
      } else {
        sh = background.width / targetRatio;
        sy = (background.height - sh) / 2;
      }
      ctx.drawImage(background, sx, sy, sw, sh, 0, 0, layout.width, layout.height);
    } else {
      ctx.fillStyle = '#35130d';
      ctx.fillRect(0, 0, layout.width, layout.height);
    }
    ctx.fillStyle = 'rgba(35, 8, 3, 0.32)';
    ctx.fillRect(0, 0, layout.width, layout.height);

    const panelImage = this.assets.getImage('roundResultPanel');
    const panelEdgeX = Math.max(12, Math.min(30, page.panel.height * 0.085));
    const panelEdgeY = Math.max(12, Math.min(30, page.panel.height * 0.085));
    const panelDrawn = drawNineSliceImage(
      ctx,
      panelImage,
      page.panel,
      ROUND_RESULT_PANEL_SOURCE_SLICES,
      {
        left: panelEdgeX,
        top: panelEdgeY,
        right: panelEdgeX,
        bottom: panelEdgeY,
      }
    );
    if (!panelDrawn) {
      ctx.fillStyle = 'rgba(255, 237, 199, 0.97)';
      roundRect(ctx, page.panel.x, page.panel.y, page.panel.width, page.panel.height, 13);
      ctx.fill();
      ctx.strokeStyle = '#d18a21';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    drawImageContain(ctx, this.assets.getImage('tableRecordHead'), page.title);

    ctx.save();
    ctx.beginPath();
    ctx.rect(page.scrollRegion.x, page.scrollRegion.y, page.scrollRegion.width, page.scrollRegion.height);
    ctx.clip();
    ctx.translate(0, -this.tableRecordScrollOffset);
    page.rows.forEach((row) => {
      const player = row.player || {};
      const rowImage = this.assets.getImage(player.winner ? 'tableRecordFirstRow' : 'tableRecordRow');
      if (rowImage) {
        ctx.drawImage(rowImage, row.x, row.y, row.width, row.height);
      } else {
        ctx.fillStyle = player.winner ? 'rgba(255, 211, 92, 0.34)' : 'rgba(255, 250, 232, 0.56)';
        roundRect(ctx, row.x, row.y, row.width, row.height, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(184, 117, 42, 0.42)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      const rankImage = this.assets.getImage(`tableRecordRank${player.rank}`);
      const rankTarget = {
        x: row.rank.x + row.rank.width * 0.25,
        y: row.rank.y + row.rank.height * 0.25,
        width: row.rank.width * 0.5,
        height: row.rank.height * 0.5,
      };
      if (!drawImageContain(ctx, rankImage, rankTarget)) {
        const rankColors = ['#b32616', '#31506d', '#1f6d43', '#31506d'];
        ctx.fillStyle = rankColors[player.rank - 1] || '#31506d';
        roundRect(
          ctx,
          rankTarget.x + rankTarget.width * 0.16,
          rankTarget.y + rankTarget.height * 0.12,
          rankTarget.width * 0.68,
          rankTarget.height * 0.76,
          5
        );
        ctx.fill();
        ctx.strokeStyle = '#efbd55';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#fff2bd';
        ctx.font = `bold ${Math.max(11, Math.floor(rankTarget.height * 0.46))}px serif`;
        ctx.textAlign = 'center';
        ctx.fillText(String(player.rank), row.rank.x + row.rank.width / 2, row.rank.y + row.rank.height * 0.57);
      }

      const avatar = player.avatarUrl && this.assets.getRemoteImage
        ? this.assets.getRemoteImage(player.avatarUrl)
        : null;
      ctx.save();
      circlePath(ctx, row.avatar);
      ctx.clip();
      if (avatar) {
        drawImageCover(ctx, avatar, row.avatar);
      } else {
        ctx.fillStyle = '#80452d';
        ctx.fill();
        ctx.fillStyle = '#fff0c2';
        ctx.font = `bold ${Math.max(18, Math.floor(row.avatar.height * 0.42))}px serif`;
        ctx.textAlign = 'center';
        ctx.fillText((player.nickName || '玩家').slice(0, 1), row.avatar.x + row.avatar.width / 2, row.avatar.y + row.avatar.height * 0.64);
      }
      ctx.restore();
      ctx.strokeStyle = '#d79328';
      ctx.lineWidth = 2;
      circlePath(ctx, row.avatar);
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.fillStyle = '#542611';
      ctx.font = `bold ${Math.max(14, Math.floor(row.height * 0.21))}px Arial`;
      this.fillClampedText(ctx, player.nickName || `玩家${player.seat + 1}`, row.identity.x + 3, row.identity.y + row.identity.height * 0.43, row.identity.width - 6);
      ctx.fillStyle = '#835332';
      ctx.font = `${Math.max(10, Math.floor(row.height * 0.15))}px Arial`;
      ctx.fillText(player.isHuman === false ? '电脑玩家' : (player.seat === 0 ? '本家' : '在线玩家'), row.identity.x + 3, row.identity.y + row.identity.height * 0.72);

      ctx.fillStyle = '#633317';
      ctx.font = `${Math.max(11, Math.floor(row.height * 0.17))}px Arial`;
      const statIconSize = Math.max(10, Math.min(17, row.height * 0.16));
      const statTextX = row.stats.x + statIconSize + 9;
      [0.35, 0.68].forEach((ratio) => {
        const iconY = row.stats.y + row.stats.height * ratio - statIconSize * 0.72;
        const coinGradient = ctx.createLinearGradient(row.stats.x + 3, iconY, row.stats.x + 3 + statIconSize, iconY + statIconSize);
        coinGradient.addColorStop(0, '#fff0a4');
        coinGradient.addColorStop(0.45, '#e7a322');
        coinGradient.addColorStop(1, '#9f5406');
        ctx.fillStyle = coinGradient;
        roundRect(ctx, row.stats.x + 3, iconY, statIconSize, statIconSize, statIconSize / 2);
        ctx.fill();
        ctx.strokeStyle = '#b56d12';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
      ctx.fillStyle = '#633317';
      ctx.fillText(`总赢局数：${Number(player.winRounds) || 0}局`, statTextX, row.stats.y + row.stats.height * 0.42);
      ctx.fillText(`总积分变化：${signedScore(player.totalScore)}`, statTextX, row.stats.y + row.stats.height * 0.74);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#6f3a1d';
      ctx.font = `bold ${Math.max(10, Math.floor(row.height * 0.14))}px serif`;
      const scoreCenterX = row.score.x + row.score.width / 2;
      ctx.fillText('总分', scoreCenterX, row.score.y + row.score.height * 0.30);
      ctx.fillStyle = Number(player.totalScore) >= 0 ? '#b52d1b' : '#2d6947';
      ctx.font = `bold ${Math.max(24, Math.floor(row.height * 0.39))}px serif`;
      ctx.fillText(signedScore(player.totalScore), scoreCenterX, row.score.y + row.score.height * 0.73);
    });
    ctx.restore();

    if (this.tableRecordScrollMax > 0) {
      const trackHeight = Math.max(24, page.scrollRegion.height - 12);
      const thumbHeight = Math.max(22, trackHeight * (page.scrollRegion.height / page.contentHeight));
      const thumbTravel = trackHeight - thumbHeight;
      const thumbY = page.scrollRegion.y + 6
        + (this.tableRecordScrollOffset / this.tableRecordScrollMax) * thumbTravel;
      const trackX = page.scrollRegion.x + page.scrollRegion.width - 4;
      ctx.fillStyle = 'rgba(117, 65, 27, 0.18)';
      roundRect(ctx, trackX, page.scrollRegion.y + 6, 3, trackHeight, 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(174, 92, 23, 0.72)';
      roundRect(ctx, trackX, thumbY, 3, thumbHeight, 2);
      ctx.fill();
    }

    const footerImage = this.assets.getImage('tableRecordInfo');
    if (!drawHorizontalThreeSliceImage(ctx, footerImage, page.footer)) {
      ctx.fillStyle = 'rgba(244, 185, 98, 0.42)';
      roundRect(ctx, page.footer.x, page.footer.y, page.footer.width, page.footer.height, 5);
      ctx.fill();
    }
    ctx.fillStyle = '#653719';
    ctx.font = `${Math.max(10, Math.floor(page.footer.height * 0.38))}px Arial`;
    ctx.textAlign = 'center';
    const settings = record.settings || {};
    const footerItems = page.footerItems || [page.footer, page.footer, page.footer];
    [
      `房号：${record.roomId || state.tableRoomId || '-'}`,
      `总局数：${record.completedRounds || 0}局`,
      `玩法：${tableRecordPlayLabel(settings)}`,
    ].forEach((label, index) => {
      const item = footerItems[index] || page.footer;
      this.fillClampedText(ctx, label, item.x + item.width / 2, item.y + item.height * 0.64, item.width - 10);
    });
    ctx.textAlign = 'left';
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

  drawTextShadow(ctx, text, x, y, color = '#fff7dc') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
    ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = color;
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
      const box = area.box;
      const avatar = area.avatar;

      ctx.save();
      ctx.fillStyle = 'rgba(8, 14, 24, 0.55)';
      roundRect(ctx, box.x, box.y, box.width, box.height, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 214, 102, 0.35)';
      ctx.lineWidth = 1;
      roundRect(ctx, box.x, box.y, box.width, box.height, 6);
      ctx.stroke();
      ctx.restore();

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
        ctx.textAlign = 'left';
      }
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.70)';
      ctx.lineWidth = 1;
      roundRect(ctx, avatar.x, avatar.y, avatar.width, avatar.height, 3);
      ctx.stroke();

      if (seat.isDealer) {
        const badgeSize = Math.max(14, Math.round(avatar.width * 0.46));
        const badgeX = avatar.x + avatar.width;
        const badgeY = avatar.y;
        ctx.save();
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = '#d92d20';
        ctx.fill();
        ctx.strokeStyle = '#ffd27a';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#fff6d9';
        ctx.font = `bold ${Math.max(10, Math.round(badgeSize * 0.62))}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('庄', badgeX, badgeY + 1);
        ctx.restore();
      }

      const totalScore = typeof seat.score === 'number' ? seat.score : 0;
      const operationFu = calculateOperationFu(seat.melds || [], state.rules, {
        jiangPhraseId: state.jiangPhraseId,
      }).totalFu;
      ctx.textAlign = 'center';
      ctx.font = 'bold 12px Arial';
      this.drawTextShadow(ctx, `${totalScore}`, area.totalScore.x + area.totalScore.width / 2, area.totalScore.y + 11, '#f6bd4b');
      this.drawTextShadow(ctx, `福数：${operationFu}`, area.roundFu.x + area.roundFu.width / 2, area.roundFu.y + 11, '#fff');
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

  drawCenterFocus(ctx, state, layout) {
    const area = layout.centerFocus;
    ctx.font = '12px Arial';
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

  hitRegionAt(x, y) {
    return this.lastLayout ? this.layout.hit(this.lastLayout, x, y) : null;
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
    if (
      state.responseSummary
      && state.responseSummary.active
      && state.responseSummary.cardId === state.recentDiscard.card.id
    ) return true;
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
    if (
      state.responseSummary
      && state.responseSummary.active
      && state.responseSummary.cardId === state.drawnCard.id
    ) return true;
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
    this.drawCard(ctx, state.drawnCard, position.x, position.y, cardWidth, cardHeight, true, false, 'big', {
      shadow: true,
      border: false,
      appearanceOverlay: 'move',
    });
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
      if (region.legal === false) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        roundRect(ctx, region.x, region.y, region.width, region.height, 5);
        ctx.fill();
      }
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
      if (button.action.type === 'confirmNextRound' || button.action.type === 'viewRecord') {
        this.drawRoundResultButton(ctx, {
          ...button,
          x: -button.width / 2,
          y: -button.height / 2,
        }, button.action, visual);
        ctx.restore();
        return;
      }
      if (layout.tableRecord) {
        const tableRecordAssetName = button.action.type === 'leaveTable'
          ? 'tableRecordExit'
          : (
            button.action.type === 'requestRematch'
            && button.action.label === '再来一局'
            && !button.action.disabled
              ? 'tableRecordRematch'
              : null
          );
        const tableRecordImage = tableRecordAssetName
          ? this.assets.getImage(tableRecordAssetName)
          : null;
        if (tableRecordImage) {
          ctx.drawImage(tableRecordImage, -button.width / 2, -button.height / 2, button.width, button.height);
          ctx.restore();
          return;
        }
      }
      const actionSpriteType = (button.action.zhaoSize || button.action.type === 'zhaoBack')
        ? null
        : button.action.type;
      this.drawButton(ctx, {
        ...button,
        x: -button.width / 2,
        y: -button.height / 2,
      }, button.action.label || button.action.type, false, visual, actionSpriteType);
      ctx.restore();
    });
  }

  drawRoundResultPage(ctx, state, layout) {
    const page = layout.roundResult;
    const detail = state.roundDetail || {};
    const scrollSignature = `${state.tableRoomId || ''}:${detail.round || state.round || 0}`;
    if (scrollSignature !== this.roundResultScrollSignature) {
      this.roundResultScrollSignature = scrollSignature;
      this.roundResultScrollOffset = 0;
    }
    this.roundResultScrollMax = page.maxScroll || 0;
    this.roundResultScrollOffset = Math.max(0, Math.min(this.roundResultScrollOffset, this.roundResultScrollMax));
    this.drawBackground(ctx, layout);
    ctx.fillStyle = 'rgba(32, 10, 4, 0.38)';
    ctx.fillRect(0, 0, layout.width, layout.height);

    const panelImage = this.assets.getImage('roundResultPanel');
    const panelEdgeX = Math.max(28, Math.min(90, page.panel.height * 0.13));
    const panelEdgeY = Math.max(24, Math.min(76, page.panel.height * 0.12));
    const panelDrawn = drawNineSliceImage(
      ctx,
      panelImage,
      page.panel,
      ROUND_RESULT_PANEL_SOURCE_SLICES,
      {
        left: panelEdgeX,
        top: panelEdgeY,
        right: panelEdgeX,
        bottom: panelEdgeY,
      }
    );
    if (!panelDrawn) {
      ctx.fillStyle = '#f8e6c2';
      roundRect(ctx, page.panel.x, page.panel.y, page.panel.width, page.panel.height, 12);
      ctx.fill();
      ctx.strokeStyle = '#c78b2a';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    const result = state.result || {};

    const detailPlayers = detail.players || [];
    ctx.save();
    ctx.beginPath();
    ctx.rect(page.scrollRegion.x, page.scrollRegion.y, page.scrollRegion.width, page.scrollRegion.height);
    ctx.clip();
    ctx.translate(0, -this.roundResultScrollOffset);
    page.rows.forEach((row) => {
      const detail = detailPlayers.find((player) => player.seat === row.seat) || {
        seat: row.seat,
        finalHand: [],
        melds: [],
        roundScore: 0,
        huCount: null,
        huGrade: null,
      };
      const seat = state.seats[row.seat] || { name: `玩家${row.seat + 1}` };
      const isSelf = row.seat === state.humanSeat;
      const isWinner = result.type === 'win' && result.winner === row.seat;
      const rowImage = this.assets.getImage(isWinner ? 'tableRecordFirstRow' : 'tableRecordRow');
      const rowEdge = Math.max(8, Math.min(24, Math.round(row.height * 0.19)));
      const rowDrawn = drawNineSliceImage(ctx, rowImage, row, TABLE_RECORD_ROW_SOURCE_SLICES, {
        left: rowEdge,
        top: rowEdge,
        right: rowEdge,
        bottom: rowEdge,
      });
      if (!rowDrawn) {
        ctx.fillStyle = isSelf
          ? 'rgba(255, 190, 64, 0.24)'
          : (isWinner ? 'rgba(220, 52, 32, 0.10)' : 'rgba(255, 250, 236, 0.68)');
        roundRect(ctx, row.x, row.y, row.width, row.height, 8);
        ctx.fill();
        ctx.strokeStyle = isSelf ? 'rgba(211, 128, 20, 0.80)' : 'rgba(179, 109, 45, 0.34)';
        ctx.lineWidth = isSelf ? 2 : 1;
        ctx.stroke();
      }
      this.drawRoundResultIdentity(ctx, seat, row, { isSelf, isWinner });
      this.drawRoundResultCards(
        ctx,
        roundResultDetailWithGrade(detail, result, isWinner),
        row.cards
      );
      this.drawRoundResultStats(ctx, detail, row);
    });
    ctx.restore();

    if (this.roundResultScrollMax > 0) {
      const trackHeight = Math.max(28, page.scrollRegion.height - 20);
      const thumbHeight = Math.max(24, trackHeight * (page.scrollRegion.height / page.contentHeight));
      const thumbTravel = trackHeight - thumbHeight;
      const thumbY = page.scrollRegion.y + 10
        + (this.roundResultScrollOffset / this.roundResultScrollMax) * thumbTravel;
      const trackX = page.scrollRegion.x + page.scrollRegion.width - 6;
      ctx.fillStyle = 'rgba(117, 65, 27, 0.18)';
      roundRect(ctx, trackX, page.scrollRegion.y + 10, 4, trackHeight, 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(174, 92, 23, 0.72)';
      roundRect(ctx, trackX, thumbY, 4, thumbHeight, 2);
      ctx.fill();
    }

    const titleImage = this.assets.getImage('roundResultTitle');
    if (titleImage) {
      ctx.drawImage(titleImage, page.title.x, page.title.y, page.title.width, page.title.height);
    } else {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.max(30, Math.floor(page.title.height * 0.36))}px serif`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#5d2108';
      ctx.strokeText('对局结果', page.title.x + page.title.width / 2, page.title.y + page.title.height * 0.54);
      ctx.fillStyle = '#ffe29a';
      ctx.fillText('对局结果', page.title.x + page.title.width / 2, page.title.y + page.title.height * 0.54);
      ctx.restore();
    }

    const status = roundResultStatusPresentation(state);
    const statusImage = status.assetName ? this.assets.getImage(status.assetName) : null;
    if (statusImage) {
      ctx.drawImage(statusImage, page.status.x, page.status.y, page.status.width, page.status.height);
    } else {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.max(16, Math.floor(page.status.height * 0.42))}px serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#5d2108';
      ctx.strokeText(status.text, page.status.x + page.status.width / 2, page.status.y + page.status.height * 0.67);
      ctx.fillStyle = '#ffe29a';
      ctx.fillText(status.text, page.status.x + page.status.width / 2, page.status.y + page.status.height * 0.67);
      ctx.restore();
    }

    const roomId = state.tableRoomId || '';
    ctx.fillStyle = '#f7d88b';
    ctx.font = `${Math.max(13, Math.floor(page.footer.height * 0.28))}px Arial`;
    ctx.textAlign = 'left';
    ctx.fillText(
      `${roomId ? `房号：${roomId}   ` : ''}第${detail.round || state.round || 0}/${detail.maxRounds || (state.tableSettings && state.tableSettings.maxRounds) || '-'}局`,
      page.roomInfo.x,
      page.roomInfo.y + page.roomInfo.height * 0.62
    );
    const continuation = detail.continuation || {};
    if (detail.hasNextRound && continuation.requiredCount) {
      ctx.textAlign = 'center';
      ctx.fillText(
        `已继续 ${continuation.confirmedCount || 0}/${continuation.requiredCount}`,
        page.continuation.x + page.continuation.width / 2,
        page.continuation.y + page.continuation.height * 0.62
      );
    }
    ctx.textAlign = 'left';
  }

  drawRoundResultIdentity(ctx, seat, row, flags = {}) {
    const avatarImage = seat.avatarUrl && this.assets.getRemoteImage
      ? this.assets.getRemoteImage(seat.avatarUrl)
      : null;
    const avatarRadius = Math.max(2, Math.min(4, Math.floor(row.avatar.width * 0.10)));
    if (avatarImage) {
      ctx.save();
      roundRect(ctx, row.avatar.x, row.avatar.y, row.avatar.width, row.avatar.height, avatarRadius);
      ctx.clip();
      ctx.drawImage(avatarImage, row.avatar.x, row.avatar.y, row.avatar.width, row.avatar.height);
      ctx.restore();
    } else {
      ctx.fillStyle = flags.isSelf ? '#2f80c9' : '#9a5a32';
      roundRect(ctx, row.avatar.x, row.avatar.y, row.avatar.width, row.avatar.height, avatarRadius);
      ctx.fill();
      ctx.fillStyle = '#fff5d5';
      ctx.font = `bold ${Math.max(13, Math.floor(row.avatar.height * 0.38))}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText((seat.name || seat.nickName || '?').slice(0, 1), row.avatar.x + row.avatar.width / 2, row.avatar.y + row.avatar.height * 0.62);
      ctx.textAlign = 'left';
    }
    ctx.strokeStyle = flags.isSelf ? '#db8f18' : '#b7792b';
    ctx.lineWidth = 2;
    roundRect(ctx, row.avatar.x, row.avatar.y, row.avatar.width, row.avatar.height, avatarRadius);
    ctx.stroke();
    ctx.fillStyle = '#5c2c16';
    ctx.font = `bold ${Math.max(10, Math.floor(row.name.height * 0.68))}px Arial`;
    ctx.textAlign = 'center';
    this.fillClampedText(
      ctx,
      seat.name || seat.nickName || `玩家${row.seat + 1}`,
      row.name.x + row.name.width / 2,
      row.name.y + row.name.height * 0.76,
      row.name.width
    );
    const role = flags.isSelf && flags.isWinner
      ? '本家·胡牌'
      : (flags.isSelf ? '本家' : (flags.isWinner ? '胡牌玩家' : ''));
    if (role) {
      const roleWidth = Math.min(row.role.width, role.length * 12 + 12);
      const roleX = row.role.x + (row.role.width - roleWidth) / 2;
      ctx.fillStyle = flags.isSelf ? '#a94818' : '#b52e20';
      roundRect(ctx, roleX, row.role.y, roleWidth, row.role.height, 4);
      ctx.fill();
      ctx.fillStyle = '#fff0bd';
      ctx.font = `bold ${Math.max(9, Math.floor(row.role.height * 0.56))}px Arial`;
      ctx.fillText(role, roleX + roleWidth / 2, row.role.y + row.role.height * 0.72);
    }
    ctx.textAlign = 'left';
  }

  drawRoundResultCards(ctx, detail, area) {
    const meldColumns = (detail.melds || []).map((meld) => ({
      label: ({ chi: '吃', peng: '碰', zhao: '招', ta: '踏' })[meld.type] || meld.label || '',
      cards: meld.cards || [],
      meld: true,
    }));
    const handGroups = [];
    (detail.finalHand || []).slice().sort((a, b) => (
      (a.order || 0) - (b.order || 0) || (a.copy || 0) - (b.copy || 0)
    )).forEach((card) => {
      const phraseId = card.phraseId || card.group || `key:${card.key}`;
      let group = handGroups.find((item) => item.phraseId === phraseId);
      if (!group) {
        group = { phraseId, label: '', cards: [], meld: false };
        handGroups.push(group);
      }
      group.cards.push(card);
    });
    const winningGroups = Array.isArray(detail.winningGroups) && detail.winningGroups.length
      ? detail.winningGroups.map((group) => ({
        label: roundResultGroupLabel(group),
        cards: group.cards || [],
        authoritative: true,
      }))
      : null;
    const columns = splitRoundResultColumns(
      (winningGroups || meldColumns.concat(handGroups))
        .filter((column) => column.cards.length)
    );
    if (detail.winningCard) {
      columns.push({
        label: '胡',
        cards: [detail.winningCard],
        winning: true,
      });
    }
    if (!columns.length) return;
    const gradeText = roundResultGradeLabel(detail.huGrade);
    const winnerDecorated = Boolean(detail.winningCard);
    const decorationGap = Math.max(3, Math.floor(area.width * 0.004));
    const huMarkSize = winnerDecorated
      ? Math.max(34, Math.min(50, Math.floor(area.height * 0.48)))
      : 0;
    const gradeMarkHeight = winnerDecorated && gradeText
      ? Math.max(52, Math.min(74, Math.floor(area.height * 0.72)))
      : 0;
    const gradeMarkWidth = gradeMarkHeight ? Math.round(gradeMarkHeight * 0.5) : 0;
    const decorationWidth = winnerDecorated
      ? huMarkSize + (gradeMarkWidth ? gradeMarkWidth + decorationGap : 0) + decorationGap * 2
      : 0;
    const cardAreaWidth = Math.max(80, area.width - decorationWidth);
    const gap = Math.max(1, Math.floor(area.width * 0.002));
    const availableCardWidth = Math.floor((cardAreaWidth - gap * (columns.length - 1)) / columns.length);
    const cardWidth = Math.max(13, Math.min(23, availableCardWidth));
    const cardHeight = Math.round(cardWidth / CARD_ASPECT_RATIO);
    const labelHeight = Math.max(11, Math.floor(area.height * 0.17));
    let x = area.x;
    columns.forEach((column) => {
      const maxStackHeight = Math.max(cardHeight, area.height - labelHeight - 2);
      const step = column.cards.length > 1
        ? Math.max(3, Math.min(Math.floor(cardHeight * 0.42), Math.floor((maxStackHeight - cardHeight) / (column.cards.length - 1))))
        : 0;
      if (column.label) {
        ctx.fillStyle = '#6b341b';
        ctx.font = `bold ${Math.max(10, Math.floor(labelHeight * 0.72))}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(column.label, x + cardWidth / 2, area.y + labelHeight - 2);
        ctx.textAlign = 'left';
      }
      column.cards.forEach((card, index) => {
        this.drawCard(ctx, card, x, area.y + labelHeight + index * step, cardWidth, cardHeight, true, false, 'mini');
      });
      x += cardWidth + gap + (column.meld ? gap : 0);
    });
    const winnerDecoration = winnerDecorated
      ? this.drawRoundResultWinnerDecoration(ctx, detail, {
        x: area.x + cardAreaWidth + decorationGap,
        y: area.y,
        width: Math.max(1, decorationWidth - decorationGap),
        height: area.height,
        huSize: huMarkSize,
        gradeWidth: gradeMarkWidth,
        gradeHeight: gradeMarkHeight,
        gap: decorationGap,
      })
      : null;
    return {
      columns,
      cardWidth,
      cardHeight,
      gap,
      contentRight: winnerDecorated ? area.x + area.width : x,
      winnerDecoration,
    };
  }

  drawRoundResultWinnerDecoration(ctx, detail, area) {
    const gradeText = roundResultGradeLabel(detail.huGrade);
    const huImage = this.assets.getImage('roundResultHu');
    const gradeImage = gradeText ? this.assets.getImage('roundResultGrade') : null;
    const hu = {
      x: area.x,
      y: area.y + Math.floor((area.height - area.huSize) / 2),
      width: area.huSize,
      height: area.huSize,
    };
    if (huImage && ctx.drawImage) {
      ctx.drawImage(huImage, hu.x, hu.y, hu.width, hu.height);
    } else {
      ctx.fillStyle = '#d88a16';
      ctx.font = `bold ${Math.max(24, Math.floor(hu.height * 0.72))}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText('胡', hu.x + hu.width / 2, hu.y + hu.height * 0.72);
    }

    let grade = null;
    if (gradeText) {
      grade = {
        x: hu.x + hu.width + area.gap,
        y: area.y + Math.floor((area.height - area.gradeHeight) / 2),
        width: area.gradeWidth,
        height: area.gradeHeight,
      };
      if (gradeImage && ctx.drawImage) {
        ctx.drawImage(gradeImage, grade.x, grade.y, grade.width, grade.height);
      } else if (ctx.beginPath) {
        ctx.fillStyle = '#a82112';
        roundRect(ctx, grade.x, grade.y, grade.width, grade.height, Math.max(4, Math.floor(grade.width * 0.18)));
        ctx.fill();
        ctx.strokeStyle = '#e7a72b';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      const characters = gradeText.slice(0, 2).split('');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.max(13, Math.floor(grade.width * 0.54))}px serif`;
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#67220b';
      ctx.fillStyle = '#ffe7a0';
      characters.forEach((character, index) => {
        const textY = grade.y + grade.height * (index === 0 ? 0.38 : 0.68);
        if (ctx.strokeText) ctx.strokeText(character, grade.x + grade.width / 2, textY);
        ctx.fillText(character, grade.x + grade.width / 2, textY);
      });
      ctx.textBaseline = 'alphabetic';
    }
    ctx.textAlign = 'left';
    return { hu, grade, gradeText };
  }

  scrollRoundResultBy(deltaY) {
    if (!this.roundResultScrollMax || !Number.isFinite(deltaY)) return false;
    const next = Math.max(0, Math.min(
      this.roundResultScrollMax,
      this.roundResultScrollOffset - deltaY
    ));
    if (next === this.roundResultScrollOffset) return false;
    this.roundResultScrollOffset = next;
    return true;
  }

  scrollTableRecordBy(deltaY) {
    if (!this.tableRecordScrollMax || !Number.isFinite(deltaY)) return false;
    const next = Math.max(0, Math.min(
      this.tableRecordScrollMax,
      this.tableRecordScrollOffset - deltaY
    ));
    if (next === this.tableRecordScrollOffset) return false;
    this.tableRecordScrollOffset = next;
    return true;
  }

  drawRoundResultStats(ctx, detail, row) {
    const huText = detail.huCount === null || detail.huCount === undefined ? '--' : String(detail.huCount);
    const score = Number(detail.roundScore) || 0;
    ctx.fillStyle = '#6b341b';
    ctx.textAlign = 'center';
    ctx.font = `${Math.max(11, Math.floor(row.height * 0.12))}px Arial`;
    ctx.fillText('胡数', row.hu.x + row.hu.width / 2, row.hu.y + row.hu.height * 0.30);
    ctx.fillText('分数', row.score.x + row.score.width / 2, row.score.y + row.score.height * 0.30);
    ctx.font = `bold ${Math.max(18, Math.floor(row.height * 0.24))}px Arial`;
    ctx.fillStyle = detail.huCount === null || detail.huCount === undefined ? '#8d7a68' : '#a53a13';
    ctx.fillText(huText, row.hu.x + row.hu.width / 2, row.hu.y + row.hu.height * 0.70);
    ctx.fillStyle = score > 0 ? '#bd6414' : (score < 0 ? '#2477b5' : '#8d7a68');
    ctx.fillText(`${score > 0 ? '+' : ''}${score}`, row.score.x + row.score.width / 2, row.score.y + row.score.height * 0.70);
    ctx.textAlign = 'left';
  }

  drawRoundResultButton(ctx, button, action, visual = {}) {
    const disabled = Boolean(action.disabled);
    const continueImage = action.type === 'confirmNextRound' && !disabled
      ? this.assets.getImage('roundResultContinue')
      : null;
    if (continueImage) {
      ctx.save();
      if (visual.pressed) ctx.globalAlpha *= 0.84;
      ctx.drawImage(continueImage, button.x, button.y, button.width, button.height);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.shadowColor = disabled ? 'rgba(53, 31, 20, 0.34)' : 'rgba(55, 10, 2, 0.72)';
    ctx.shadowBlur = disabled ? 4 : 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = disabled ? '#725846' : '#f6bd4b';
    roundRect(ctx, button.x - 4, button.y - 4, button.width + 8, button.height + 8, 13);
    ctx.fill();
    ctx.restore();
    const gradient = ctx.createLinearGradient(button.x, button.y, button.x, button.y + button.height);
    if (disabled) {
      gradient.addColorStop(0, '#8f7257');
      gradient.addColorStop(1, '#5e4838');
    } else {
      gradient.addColorStop(0, visual.pressed ? '#e76a31' : '#d83c24');
      gradient.addColorStop(1, visual.pressed ? '#a72b1d' : '#8e170f');
    }
    ctx.fillStyle = gradient;
    roundRect(ctx, button.x, button.y, button.width, button.height, 10);
    ctx.fill();
    ctx.strokeStyle = disabled ? '#b99a70' : '#ffd273';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = disabled ? 'rgba(87, 63, 43, 0.55)' : 'rgba(92, 24, 9, 0.78)';
    ctx.lineWidth = 1;
    roundRect(ctx, button.x + 4, button.y + 4, button.width - 8, button.height - 8, 7);
    ctx.stroke();
    ctx.fillStyle = disabled ? '#e6d2b5' : '#ffe6a0';
    ctx.font = `bold ${Math.max(15, Math.floor(button.height * 0.38))}px serif`;
    ctx.textAlign = 'center';
    ctx.fillText(action.label, button.x + button.width / 2, button.y + button.height * 0.63);
    ctx.textAlign = 'left';
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
    if (!hasRenderableResult(state.result)) return;
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
    const title = state.tableFinished
      ? '牌局已结束'
      : (result.type === 'win'
      ? '本局胡牌'
      : (result.type === 'circle-loss'
        ? '进圈'
        : (result.type === 'draw-round' ? '流局' : (result.type === 'draw' ? '荒庄' : ''))));
    ctx.fillText(title, area.x + 24, area.y + 44);
    ctx.font = '16px Arial';
    if (result.type === 'win') {
      ctx.fillText(`赢家：${state.seats[result.winner].name}`, area.x + 24, area.y + 82);
      ctx.fillText(result.summary || '', area.x + 24, area.y + 112);
      if (result.scoring) {
        const jiangPhrase = state.rules.phrases.find((phrase) => phrase.id === result.jiangPhraseId);
        const payment = result.settlement ? `每家赔${result.settlement.point}分` : `分：${result.points}`;
        const heavyRound = result.heavyRound || (result.settlement && result.settlement.heavyRound);
        ctx.fillText(`将：${jiangPhrase ? jiangPhrase.text : '-'}  等级：${result.grade}${heavyRound ? '(重场)' : ''}  福：${result.scoring.totalFu}  ${payment}`, area.x + 24, area.y + 142);
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
    } else if (result.type === 'draw') {
      ctx.fillText('牌堆摸完，无人胡牌', area.x + 24, area.y + 86);
    }
    if (state.tableFinished) {
      const maxRounds = state.tableSettings && state.tableSettings.maxRounds;
      const rematch = state.tableRematch || {};
      const waitingText = rematch.isHost ? '可发起再来一局，或退出牌桌' : '可退出牌桌，等待房主再来一局';
      ctx.fillStyle = '#ffd666';
      ctx.font = '16px Arial';
      ctx.fillText(`已完成${maxRounds || state.round || ''}局，${waitingText}`, area.x + 24, area.y + area.height - 24);
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
