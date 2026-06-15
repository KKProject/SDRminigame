import { Easing } from './tween.mjs';
import {
  cardSize,
  claimedMeldTargets,
  claimedTarget,
  discardMiniTarget,
  discardTarget,
  effectTarget,
  seatFront,
  seatStart,
  tableCenter,
} from './targets.mjs';

// 动作/事件类型 -> 显示文案 的映射表。
// 用于在牌桌上方弹出“吃、碰、胡”等文字特效。
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

// 每种事件类型对应的默认动画时长（毫秒）。
// 修改这里的数值可以整体加快或放慢某一类动画。
export const EVENT_DURATIONS = {
  draw: 500,              // 摸牌
  discard: 520,           // 打牌
  unclaimed: 500,         // 无人要的牌进入弃牌区
  chi: 900,               // 吃
  peng: 760,              // 碰
  zhao: 820,              // 招
  ta: 820,                // 踏
  pass: 560,              // 过
  'accept-takeover': 700, // 接庄
  'decline-takeover': 700,// 不接庄
  hu: 1050,               // 胡
  'circle-loss': 1050,    // 进圈（圈 loss）
  'draw-round': 900,      // 流局
  settlement: 900,        // 结算
};

/**
 * 生成稳定的事件 ID。
 * 作用：同一个事件即使被多次调用，也能得到相同 ID，避免动画重复播放。
 * - 如果 event.eventSeq 存在（网络事件），使用 `online:${eventSeq}`。
 * - 否则用事件类型 + 座位 + 卡牌 ID 拼接一个兜底 ID。
 */
export function stableEventId(event = {}) {
  if (typeof event.eventSeq === 'number') return `online:${event.eventSeq}`;
  const cardId = event.card && event.card.id ? event.card.id : '';
  return `${event.type || 'event'}:${typeof event.seat === 'number' ? event.seat : ''}:${cardId}`;
}

/**
 * 构造一张卡牌“飞入/飞出”的动画计划（plan）。
 * @param {object} options
 *   - id: 计划唯一标识
 *   - card: 卡牌数据对象
 *   - start: 起始坐标 {x, y}
 *   - end: 目标坐标 {x, y}
 *   - duration: 动画时长（毫秒）
 *   - stage: 动画阶段/类型标记，会写入 visual.stage
 *   - retain: 动画结束后是否保留该视觉对象（不删除）
 * @returns {object} 一个 plan 对象，包含 visuals（视觉对象数组）和 steps（动画步骤数组）
 */
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

  // visual 是动画系统真正操作的“视觉对象”。
  // 这里 kind='card' 表示它是一张卡牌，后续渲染器会根据这个对象绘制卡牌。
  const visual = {
    id: `${id}:card`,        // 视觉对象自己的 ID
    kind: 'card',             // 类型：卡牌
    card,                     // 关联的卡牌数据
    stage,                    // 动画阶段标记
    x: start.x,               // 当前绘制 x 坐标
    y: start.y,               // 当前绘制 y 坐标
    scale: 1,                 // 缩放，1 为原始大小
    alpha: 1,                 // 透明度，1 为不透明
    retain,                   // 是否保留
  };

  return {
    id,
    visuals: [visual],
    steps: [{
      // parallel 表示下面的子步骤同时开始。
      type: 'parallel',
      steps: [
        // 子步骤 1：同时移动 x、y，让卡牌从 start 飞到 end。
        {
          type: 'tween',
          target: visual,                     // 被修改的对象
          to: { x: end.x, y: end.y },         // 目标属性
          duration,                           // 时长
          easing: Easing.Cubic.Out,           // 缓动：先快后慢
        },
        // 子步骤 2：飞行过程中做一个轻微的“放大-缩小”弹性效果。
        {
          type: 'sequence',                   // sequence 表示子步骤依次执行
          steps: [
            { type: 'tween', target: visual, to: { scale: 1.12 }, duration: Math.round(duration * 0.55), easing: Easing.Cubic.Out },
            { type: 'tween', target: visual, to: { scale: 1 }, duration: Math.round(duration * 0.45), easing: Easing.Cubic.Out },
          ],
        },
      ],
    }],
  };
}

function targetVisualPosition(target, baseSize) {
  return {
    x: target.x + (target.width - baseSize.width) / 2,
    y: target.y + (target.height - baseSize.height) / 2,
  };
}

function pulseSteps(visual, duration) {
  return [
    { type: 'tween', target: visual, to: { scale: 1.2 }, duration: Math.round(duration * 0.55), easing: Easing.Back.Out },
    { type: 'tween', target: visual, to: { scale: 1 }, duration: Math.round(duration * 0.45), easing: Easing.Cubic.Out },
  ];
}

export function appearingCardPlan(event, context = {}) {
  const layout = context.layout;
  const id = stableEventId(event);
  const seat = typeof event.seat === 'number' ? event.seat : 0;
  const baseSize = cardSize(layout);
  const start = context.start || seatFront(seat, layout);
  const resolution = event.appearanceResolution || 'await-response';
  const visual = {
    id: `${id}:appearing-card`,
    kind: 'card',
    card: event.card,
    stage: event.type,
    x: start.x,
    y: start.y,
    scale: 0.8,
    alpha: 1,
    retain: resolution === 'await-response',
    appearanceResolution: resolution,
  };
  const steps = pulseSteps(visual, EVENT_DURATIONS[event.type] || 500);
  if (resolution === 'auto-discard') {
    const target = context.discardTarget || discardMiniTarget(seat, layout, event.discardIndex);
    const end = targetVisualPosition(target, baseSize);
    steps.push({
      type: 'tween',
      target: visual,
      to: {
        x: end.x,
        y: end.y,
        scale: target.width / baseSize.width,
      },
      duration: EVENT_DURATIONS.unclaimed,
      easing: Easing.Cubic.InOut,
    });
  }
  return { id, visuals: [visual], steps };
}

export function unclaimedCardPlan(event, context = {}) {
  const layout = context.layout;
  const id = stableEventId(event);
  const seat = typeof event.seat === 'number' ? event.seat : 0;
  const baseSize = cardSize(layout);
  const start = context.start || seatFront(seat, layout);
  const target = context.discardTarget || discardMiniTarget(seat, layout, event.discardIndex);
  const end = targetVisualPosition(target, baseSize);
  const visual = {
    id: `${id}:unclaimed-card`,
    kind: 'card',
    card: event.card,
    stage: 'unclaimed',
    x: start.x,
    y: start.y,
    scale: 1,
    alpha: 1,
  };
  return {
    id,
    visuals: [visual],
    steps: [{
      type: 'tween',
      target: visual,
      to: { x: end.x, y: end.y, scale: target.width / baseSize.width },
      duration: EVENT_DURATIONS.unclaimed,
      easing: Easing.Cubic.InOut,
    }],
  };
}

export function meldGroupPlan(event, context = {}) {
  const layout = context.layout;
  const meld = event.meld;
  if (!meld || !Array.isArray(meld.cards) || !meld.cards.length) return null;
  const id = stableEventId(event);
  const seat = typeof event.seat === 'number' ? event.seat : 0;
  const baseSize = cardSize(layout);
  const center = tableCenter(layout);
  const stackStep = Math.round(baseSize.height * 0.5);
  const groupHeight = baseSize.height + Math.max(0, meld.cards.length - 1) * stackStep;
  const targets = context.meldTargets || claimedMeldTargets(seat, layout, event.meldIndex, meld.cards.length, event.meldCount);
  const visuals = meld.cards.map((card, index) => ({
    id: `${id}:meld-card:${card.id}`,
    kind: 'card',
    card,
    meldId: meld.id,
    stage: event.type,
    x: center.x - baseSize.width / 2,
    y: center.y - groupHeight / 2 + index * stackStep,
    scale: 0.8,
    alpha: 1,
  }));
  const pulse = (scale, duration, easing) => ({
    type: 'parallel',
    steps: visuals.map((visual) => ({
      type: 'tween',
      target: visual,
      to: { scale },
      duration,
      easing,
    })),
  });
  const fly = {
    type: 'parallel',
    steps: visuals.map((visual, index) => {
      const target = targets[index] || targets[targets.length - 1];
      const end = targetVisualPosition(target, baseSize);
      return {
        type: 'tween',
        target: visual,
        to: { x: end.x, y: end.y, scale: target.width / baseSize.width },
        duration: Math.round((EVENT_DURATIONS[event.type] || 820) * 0.65),
        easing: Easing.Cubic.InOut,
      };
    }),
  };
  return {
    id,
    visuals,
    steps: [
      pulse(1.2, 230, Easing.Back.Out),
      pulse(1, 170, Easing.Cubic.Out),
      fly,
    ],
  };
}

/**
 * 构造一个“文字特效”动画计划（例如弹出“胡”字）。
 * @param {string} id 计划 ID
 * @param {string} label 显示文字
 * @param {object} point 中心点坐标 {x, y}
 * @param {object} options 可选配置：duration、tone、fontSize
 */
export function textEffectPlan(id, label, point, options = {}) {
  const duration = options.duration || 760;

  const visual = {
    id: `${id}:effect`,
    kind: 'text',             // 类型：文字
    label,                    // 显示内容
    tone: options.tone || 'action', // 色调/样式分类
    fontSize: options.fontSize || 58,
    x: point.x,
    y: point.y,
    scale: 0,                 // 从 0 开始放大
    alpha: 1,
  };

  return {
    id,
    visuals: [visual],
    steps: [{
      type: 'parallel',
      steps: [
        // 文字缩放动画：从小变大 -> 略微回弹 -> 稳定 -> 等待
        {
          type: 'sequence',
          steps: [
            { type: 'tween', target: visual, to: { scale: 1.08 }, duration: Math.round(duration * 0.22), easing: Easing.Back.Out },
            { type: 'tween', target: visual, to: { scale: 0.96 }, duration: Math.round(duration * 0.14), easing: Easing.Cubic.Out },
            { type: 'tween', target: visual, to: { scale: 1 }, duration: Math.round(duration * 0.12), easing: Easing.Cubic.Out },
            { type: 'wait', duration: Math.round(duration * 0.52) },
          ],
        },
        // 文字淡入淡出：先等待 72% 时间，再在最后 28% 渐隐。
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

/**
 * 根据事件对象构造完整的动画计划。
 * 这是最重要的入口函数：输入一个事件 + 布局，输出要播放的动画 plan。
 *
 * @param {object} event 事件对象，包含 type、seat、card 等字段
 * @param {object} context 上下文，通常包含 { layout, start, end, card }
 * @returns {object|null} plan 对象；如果无法构造则返回 null
 */
export function eventPlan(event, context = {}) {
  const layout = context.layout;
  if (!event || !layout) return null;

  const id = stableEventId(event);                         // 稳定 ID，防止重复播放
  const duration = EVENT_DURATIONS[event.type] || 700;    // 取该事件类型的默认时长
  const seat = typeof event.seat === 'number' ? event.seat : 0;

  const plans = [];                                        // 可能同时包含卡牌飞行 + 文字特效
  const eventCard = event.card || context.card;

  if ((event.type === 'draw' || event.type === 'discard') && eventCard) {
    plans.push(appearingCardPlan({ ...event, card: eventCard }, context));
  } else if (event.type === 'unclaimed' && eventCard) {
    plans.push(unclaimedCardPlan({ ...event, card: eventCard }, context));
  } else if (['chi', 'peng', 'zhao', 'ta'].indexOf(event.type) >= 0 && event.meld) {
    plans.push(meldGroupPlan(event, context));
  } else if (eventCard) {
    // 起始位置：context.start 优先；
    // 如果是 'unclaimed' 事件，默认从座位前方开始；其他从 seatStart 开始。
    const start = context.start || (event.type === 'unclaimed' ? seatFront(seat, layout) : seatStart(seat, layout));

    // 目标位置：context.end 优先；
    // - unclaimed：飞到弃牌区
    // - chi/peng/zhao/ta：飞到已吃/碰牌区
    // - 其他：飞到座位前方
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
      // draw/discard 事件播放完后保留视觉对象，避免立刻消失（后续由状态渲染接管）。
      retain: false,
    }));
  }

  // 如果该事件有对应文字标签，就在牌桌上方显示文字特效。
  const label = context.suppressLabel ? null : (ACTION_LABELS[event.actionType] || ACTION_LABELS[event.type]);
  if (label) {
    plans.push(textEffectPlan(`${id}:label`, label, effectTarget(seat, layout), {
      tone: event.actionType || event.type,
      duration,
      fontSize: event.type === 'hu' ? 82 : 58,
    }));
  }

  // 没有任何视觉对象时，播放一个等长的空等待，保持时间线一致。
  if (!plans.length) return { id, steps: [{ type: 'wait', duration }], visuals: [] };

  return {
    id,
    // 合并所有子 plan 的视觉对象。
    visuals: plans.reduce((all, plan) => all.concat(plan.visuals || []), []),
    // 所有子 plan 同时并行播放。
    steps: [{ type: 'parallel', steps: plans.map((plan) => ({ type: 'sequence', steps: plan.steps })) }],
  };
}

/**
 * 根据当前布局和视觉对象的 scale，计算卡牌实际显示尺寸。
 * 用于渲染器绘制卡牌时确定宽高。
 */
export function visualCardSize(layout, visual) {
  const size = cardSize(layout);
  const scale = typeof visual.scale === 'number' ? visual.scale : 1;
  return { width: size.width * scale, height: size.height * scale };
}
