import { Easing } from '../../vendor/tween/tween.esm';
import { cardSize, claimedTarget, discardTarget, effectTarget, seatFront, seatStart } from './targets';

export const ACTION_LABELS = {
  chi: '吃',
  peng: '碰',
  zhao: '招',
  ta: '踏',
  hu: '胡',
  pass: '过',
  'accept-takeover': '接庄',
  'decline-takeover': '不接',
  'circle-loss': '进圈',
  'draw-round': '流局',
};

export const EVENT_DURATIONS = {
  draw: 500,
  discard: 520,
  unclaimed: 500,
  chi: 900,
  peng: 760,
  zhao: 820,
  ta: 820,
  pass: 560,
  'accept-takeover': 700,
  'decline-takeover': 700,
  hu: 1050,
  'circle-loss': 1050,
  'draw-round': 900,
  settlement: 900,
};

export function stableEventId(event = {}) {
  if (typeof event.eventSeq === 'number') return `online:${event.eventSeq}`;
  const cardId = event.card && event.card.id ? event.card.id : '';
  return `${event.type || 'event'}:${typeof event.seat === 'number' ? event.seat : ''}:${cardId}`;
}

export function cardFlightPlan(options) {
  const {
    id,
    card,
    start,
    end,
    duration,
    stage = 'flight',
    retain = false,
  } = options;
  const visual = {
    id: `${id}:card`,
    kind: 'card',
    card,
    stage,
    x: start.x,
    y: start.y,
    scale: 1,
    alpha: 1,
    retain,
  };
  return {
    id,
    visuals: [visual],
    steps: [{
      type: 'parallel',
      steps: [
        {
          type: 'tween',
          target: visual,
          to: { x: end.x, y: end.y },
          duration,
          easing: Easing.Cubic.Out,
        },
        {
          type: 'sequence',
          steps: [
            { type: 'tween', target: visual, to: { scale: 1.12 }, duration: Math.round(duration * 0.55), easing: Easing.Cubic.Out },
            { type: 'tween', target: visual, to: { scale: 1 }, duration: Math.round(duration * 0.45), easing: Easing.Cubic.Out },
          ],
        },
      ],
    }],
  };
}

export function textEffectPlan(id, label, point, options = {}) {
  const duration = options.duration || 760;
  const visual = {
    id: `${id}:effect`,
    kind: 'text',
    label,
    tone: options.tone || 'action',
    fontSize: options.fontSize || 58,
    x: point.x,
    y: point.y,
    scale: 0,
    alpha: 1,
  };
  return {
    id,
    visuals: [visual],
    steps: [{
      type: 'parallel',
      steps: [
        {
          type: 'sequence',
          steps: [
            { type: 'tween', target: visual, to: { scale: 1.08 }, duration: Math.round(duration * 0.22), easing: Easing.Back.Out },
            { type: 'tween', target: visual, to: { scale: 0.96 }, duration: Math.round(duration * 0.14), easing: Easing.Cubic.Out },
            { type: 'tween', target: visual, to: { scale: 1 }, duration: Math.round(duration * 0.12), easing: Easing.Cubic.Out },
            { type: 'wait', duration: Math.round(duration * 0.52) },
          ],
        },
        {
          type: 'sequence',
          steps: [
            { type: 'wait', duration: Math.round(duration * 0.72) },
            { type: 'tween', target: visual, to: { alpha: 0 }, duration: Math.round(duration * 0.28), easing: Easing.Cubic.Out },
          ],
        },
      ],
    }],
  };
}

export function eventPlan(event, context = {}) {
  const layout = context.layout;
  if (!event || !layout) return null;
  const id = stableEventId(event);
  const duration = EVENT_DURATIONS[event.type] || 700;
  const seat = typeof event.seat === 'number' ? event.seat : 0;
  const plans = [];
  const eventCard = event.card || context.card;
  if (eventCard) {
    const start = context.start || (event.type === 'unclaimed' ? seatFront(seat, layout) : seatStart(seat, layout));
    const end = context.end || (event.type === 'unclaimed'
      ? discardTarget(seat, layout)
      : (['chi', 'peng', 'zhao', 'ta'].indexOf(event.type) >= 0 ? claimedTarget(seat, layout) : seatFront(seat, layout)));
    plans.push(cardFlightPlan({
      id: `${id}:flight`,
      card: eventCard,
      start,
      end,
      duration,
      stage: event.type,
      retain: event.type === 'draw' || event.type === 'discard',
    }));
  }
  const label = ACTION_LABELS[event.actionType] || ACTION_LABELS[event.type];
  if (label) {
    plans.push(textEffectPlan(`${id}:label`, label, effectTarget(seat, layout), {
      tone: event.actionType || event.type,
      duration,
      fontSize: event.type === 'hu' ? 82 : 58,
    }));
  }
  if (!plans.length) return { id, steps: [{ type: 'wait', duration }], visuals: [] };
  return {
    id,
    visuals: plans.reduce((all, plan) => all.concat(plan.visuals || []), []),
    steps: [{ type: 'parallel', steps: plans.map((plan) => ({ type: 'sequence', steps: plan.steps })) }],
  };
}

export function visualCardSize(layout, visual) {
  const size = cardSize(layout);
  const scale = typeof visual.scale === 'number' ? visual.scale : 1;
  return { width: size.width * scale, height: size.height * scale };
}
