import { eventPlan } from './presets';

// 属于“吃碰杠”类型的动作，本地预览和网络事件都会用到。
const MELD_EVENT_TYPES = ['chi', 'peng', 'zhao', 'ta'];

function previewMeld(action, state) {
  if (!action || MELD_EVENT_TYPES.indexOf(action.type) < 0 || !action.card) return null;
  const seat = state && state.seats && state.seats[0] ? state.seats[0] : null;
  if (action.type === 'ta' && seat) {
    const existing = (seat.melds || []).find((meld) => meld.id === action.meldId);
    if (existing) {
      return {
        ...existing,
        type: 'ta',
        label: action.label,
        cards: (existing.cards || []).concat([action.card]),
      };
    }
  }
  const hand = seat ? (seat.hand || []) : [];
  const used = new Set();
  const cards = (action.keys || []).map((key) => {
    const card = hand.find((item) => item.key === key && !used.has(item.id));
    if (card) used.add(card.id);
    return card;
  }).filter(Boolean).concat([action.card]);
  if (cards.length < 2) return null;
  return {
    id: `local-preview:${action.type}:${action.card.id}`,
    type: action.type,
    label: action.label,
    key: action.card.key,
    cards,
    from: action.sourceSeat,
  };
}

/**
 * TableAnimationController 是“网络事件”和“本地操作预览”的动画入口。
 * 它把渲染器（renderer）中的布局/状态信息转换成 plan，交给 AnimationManager 执行。
 * 渲染器无需关心 plan 怎么生成，网络层也无需关心 Canvas 怎么绘制。
 */
export default class TableAnimationController {
  constructor(renderer, manager) {
    this.renderer = renderer;         // 渲染器，提供 lastLayout、lastDiscardEvent 等状态
    this.manager = manager;           // AnimationManager 实例
    this.onlinePlayback = null;       // 当前正在播放的网络事件状态
    this.localActionPreview = null;   // 当前正在播放的本地操作预览状态
    this.heldAppearance = null;
    this.layoutRecovery = null;
  }

  /**
   * 每帧由外部调用，同步时间给 AnimationManager。
   */
  update(time) {
    this.manager.update(time);
  }

  /**
   * 播放网络事件动画。
   * 该方法由网络层调用，传入服务器下发的事件对象。
   *
   * @param {object} event 网络事件，必须包含 eventSeq
   * @param {function} onComplete 动画完成后的回调
   * @returns {boolean} 是否成功开始播放
   */
  playOnlineEvent(event, onComplete) {
    // 必须是带 eventSeq 的网络事件。
    if (!event || typeof event.eventSeq !== 'number') return false;

    // 如果已经在播放同一个 eventSeq，直接返回 true，避免重复。
    if (this.onlinePlayback && this.onlinePlayback.eventSeq === event.eventSeq) return true;

    const renderer = this.renderer;
    const layout = renderer.lastLayout;
    if (!layout) return false;

    // 释放上一个网络事件的资源，避免多个网络事件动画重叠。
    if (this.onlinePlayback) this.manager.release(`online:${this.onlinePlayback.eventSeq}`);

    this.onlinePlayback = {
      eventSeq: event.eventSeq,
      event,
      completed: false,
      onComplete,
    };

    // 对于“吃碰”等特效，通知渲染器抑制它自己可能渲染的重复特效。
    if (MELD_EVENT_TYPES.indexOf(event.type) >= 0) renderer.suppressNextMeldEffect = true;

    // 对于“胡/进圈/流局/结算”特效，通知渲染器抑制它自己可能渲染的结果特效。
    if (['hu', 'circle-loss', 'draw-round', 'settlement'].indexOf(event.type) >= 0) renderer.suppressNextResultEffect = true;

    // 构造动画上下文：默认只需要 layout。
    const context = { layout };

    // 如果当前事件有卡牌，并且上一张打出的牌（lastDiscardEvent）就是这张牌，
    // 那么让动画从“上一张牌停留的位置”开始飞，而不是从手牌区开始飞。
    const held = renderer.lastDiscardEvent;
    if (event.card && held && held.card.id === event.card.id && held.holdPosition) context.start = held.holdPosition;
    if (event.type === 'unclaimed' && this.heldAppearance && event.card && this.heldAppearance.card.id === event.card.id) {
      context.start = this.heldAppearance.position;
      this.releaseHeldAppearance();
    }
    if ((MELD_EVENT_TYPES.indexOf(event.type) >= 0 || event.type === 'hu') && this.heldAppearance) {
      this.releaseHeldAppearance();
    }

    // 某些事件不带 event.card，但带 meld（例如吃碰时亮出的组合）。
    // 这种情况下需要从 meld 中找到上一张被打出的那张牌，并设置它的起点/终点。
    if (!event.card && event.meld && held && held.card) {
      const heldCard = (event.meld.cards || []).find((card) => card.id === held.card.id);
      if (heldCard) {
        context.card = heldCard;
        context.start = held.holdPosition || renderer.animationEndForSeat(event.seat, layout);
        context.end = renderer.claimedAnimationEnd(event.seat, layout);
      }
    }

    // 记录本次 draw/discard 事件的最终停留位置，供后续事件做飞行起点。
    if ((event.type === 'draw' || event.type === 'discard') && event.card) {
      renderer.lastDiscardEvent = {
        seat: event.seat,
        card: event.card,
        holdPosition: renderer.animationEndForSeat(event.seat, layout),
      };
    }

    const plan = eventPlan(event, context);
    return this.manager.play(plan, () => {
      if (!this.onlinePlayback || this.onlinePlayback.eventSeq !== event.eventSeq) return;
      if (
        (event.type === 'draw' || event.type === 'discard')
        && event.appearanceResolution === 'await-response'
        && event.card
      ) {
        this.holdPlanAppearance(plan.id, event.card, renderer.animationEndForSeat(event.seat, layout), event);
      }
      if (
        event.card
        && (
          event.type === 'unclaimed'
          || ((event.type === 'draw' || event.type === 'discard') && event.appearanceResolution === 'auto-discard')
        )
      ) {
        renderer.stateAnimationController.lastSignature = `discard:${event.seat}:${event.card.id}`;
        renderer.stateAnimationController.resolutionSignature = `unclaimed:${event.seat}:${event.card.id}`;
      }
      this.onlinePlayback.completed = true;
      if (typeof onComplete === 'function') onComplete(event);
    });
  }

  /**
   * 释放某个网络事件的资源。
   * 如果不传 eventSeq，则释放当前记录的网络事件。
   */
  releaseOnlineEvent(eventSeq) {
    if (!this.onlinePlayback) return;
    if (typeof eventSeq === 'number' && this.onlinePlayback.eventSeq !== eventSeq) return;
    this.manager.release(`online:${this.onlinePlayback.eventSeq}`);
    this.onlinePlayback = null;
  }

  holdPlanAppearance(planId, card, position, event = null) {
    this.releaseHeldAppearance();
    const heldId = `held:${card.id}`;
    this.manager.transferVisuals(planId, heldId);
    this.heldAppearance = { id: heldId, card, position, event };
  }

  releaseHeldAppearance() {
    if (!this.heldAppearance) return;
    this.manager.release(this.heldAppearance.id);
    this.heldAppearance = null;
  }

  restoreHeldAppearance(event) {
    if (
      !event
      || !event.card
      || event.appearanceResolution !== 'await-response'
      || this.heldAppearance
      || !this.renderer.lastLayout
    ) return false;
    const plan = eventPlan(event, { layout: this.renderer.lastLayout });
    (plan.visuals || []).forEach((visual) => {
      if (visual.kind === 'card') visual.scale = 1;
    });
    plan.steps = [];
    return this.manager.play(plan, () => {
      const position = this.renderer.animationEndForSeat(event.seat, this.renderer.lastLayout);
      this.renderer.lastDiscardEvent = {
        seat: event.seat,
        card: event.card,
        holdPosition: position,
      };
      this.holdPlanAppearance(
        plan.id,
        event.card,
        position,
        event
      );
    }, { replay: true });
  }

  /**
   * 播放本地操作的预览动画。
   * 例如玩家点击“打牌”“吃”“碰”后，先在本机立刻播放一段动画，给用户即时反馈；
   * 等网络确认后再调用 confirmLocalActionPreview 真正落袋。
   *
   * @param {object} action 本地动作对象，包含 type、card、sourceSeat 等
   */
  playLocalActionPreview(action, onLocalComplete) {
    const renderer = this.renderer;
    if (!action || !action.type || !renderer.lastLayout) return false;

    // 把驼峰命名转换成 plan 里用的短横线命名。
    const normalizedType = action.type === 'acceptTakeover'
      ? 'accept-takeover'
      : (action.type === 'declineTakeover' ? 'decline-takeover' : action.type);

    const context = { layout: renderer.lastLayout };
    if (MELD_EVENT_TYPES.indexOf(action.type) >= 0 || action.type === 'hu') this.releaseHeldAppearance();

    // 打牌动作：从手牌位置开始飞。
    if (action.type === 'discard' && action.card) {
      context.start = renderer.animationEndForSeat(0, renderer.lastLayout);

    // 吃碰等动作：从被打出的牌的位置开始飞。
    } else if (MELD_EVENT_TYPES.indexOf(action.type) >= 0 && action.card) {
      const held = renderer.lastDiscardEvent;
      context.start = held && held.card.id === action.card.id
        ? (held.holdPosition || renderer.animationEndForSeat(action.sourceSeat || 0, renderer.lastLayout))
        : renderer.animationEndForSeat(typeof action.sourceSeat === 'number' ? action.sourceSeat : 0, renderer.lastLayout);
      context.end = renderer.claimedAnimationEnd(0, renderer.lastLayout);
    }

    const localMeld = previewMeld(action, renderer.lastState);
    const previewEvent = localMeld
      ? {
        ...action,
        type: normalizedType,
        seat: 0,
        actingSeat: 0,
        meld: localMeld,
        meldIndex: renderer.lastState && renderer.lastState.seats && renderer.lastState.seats[0]
          ? (renderer.lastState.seats[0].melds || []).length
          : 0,
        meldCount: renderer.lastState && renderer.lastState.seats && renderer.lastState.seats[0]
          ? (renderer.lastState.seats[0].melds || []).length + 1
          : 1,
      }
      : { ...action, type: normalizedType, seat: 0, actingSeat: 0 };
    const plan = eventPlan(previewEvent, context);
    if (localMeld) {
      (plan.visuals || []).forEach((visual) => {
        if (visual.kind === 'card') visual.retain = true;
      });
    }
    plan.id = `local-preview:${action.type}:${action.card ? action.card.id : ''}`;

    this.localActionPreview = {
      type: normalizedType,
      cardId: action.card ? action.card.id : null,
      meld: localMeld,
    };

    return this.manager.startPreview({ ...action, type: normalizedType }, plan, onLocalComplete);
  }

  /**
   * 确认本地操作预览，把预览动画“转正”。
   * 当网络返回对应事件时调用，事件 seat 必须为 0（自己）。
   */
  confirmLocalActionPreview(event, onComplete) {
    const preview = this.localActionPreview;
    const actingSeat = event && typeof event.actingSeat === 'number' ? event.actingSeat : (event && event.seat);
    if (!preview || !event || preview.type !== event.type || actingSeat !== 0) return false;

    const renderer = this.renderer;

    // 抑制渲染器自己可能重复渲染的特效。
    if (MELD_EVENT_TYPES.indexOf(event.type) >= 0) renderer.suppressNextMeldEffect = true;
    if (event.type === 'hu') renderer.suppressNextResultEffect = true;

    // 如果是自己打牌，更新 lastDiscardEvent 和 stateAnimationController 的签名。
    if (event.type === 'discard' && event.card) {
      renderer.stateAnimationController.lastSignature = `discard:${event.seat}:${event.card.id}`;
      renderer.lastDiscardEvent = {
        seat: event.seat,
        card: event.card,
        holdPosition: renderer.animationEndForSeat(event.seat, renderer.lastLayout),
      };
    }

    if ((event.type === 'draw' || event.type === 'discard') && event.card) {
      return this.manager.confirmPreview(event, () => {
        const previewId = this.manager.preview ? this.manager.preview.planId : null;
        const position = renderer.animationEndForSeat(event.seat, renderer.lastLayout);
        if (previewId) this.holdPlanAppearance(previewId, event.card, position, event);
        if (event.appearanceResolution === 'auto-discard') {
          this.releaseHeldAppearance();
          const resolution = eventPlan({
            ...event,
            type: 'unclaimed',
          }, {
            layout: renderer.lastLayout,
            start: position,
          });
          resolution.id = `online:${event.eventSeq}`;
          this.manager.play(resolution, () => {
            if (typeof onComplete === 'function') onComplete(event);
          }, { replay: true });
          return;
        }
        if (typeof onComplete === 'function') onComplete(event);
      });
    }
    if (MELD_EVENT_TYPES.indexOf(event.type) >= 0 && event.meld) {
      this.localActionPreview.meld = event.meld;
      return this.manager.confirmPreview(event, onComplete);
    }
    return this.manager.confirmPreview(event, onComplete);
  }

  /**
   * 取消当前本地操作预览。
   */
  cancelLocalActionPreview() {
    this.localActionPreview = null;
    this.manager.finishPreview();
  }

  /**
   * 当前是否有网络事件或本地预览在播放。
   * 用于外部判断是否应阻塞其他状态动画。
   */
  isBlockingStateAnimation() {
    return Boolean(this.onlinePlayback || this.localActionPreview || this.heldAppearance);
  }

  prepareForLayoutChange() {
    const activeOnline = this.onlinePlayback && !this.onlinePlayback.completed
      ? {
        event: this.onlinePlayback.event,
        onComplete: this.onlinePlayback.onComplete,
      }
      : null;
    const heldEvent = this.heldAppearance && this.heldAppearance.event
      ? this.heldAppearance.event
      : null;
    this.layoutRecovery = activeOnline || heldEvent
      ? { activeOnline, heldEvent }
      : null;
    this.onlinePlayback = null;
    this.localActionPreview = null;
    this.heldAppearance = null;
    this.manager.clear('viewport-change');
  }

  restoreAfterLayoutChange() {
    const recovery = this.layoutRecovery;
    this.layoutRecovery = null;
    if (!recovery || !this.renderer.lastLayout) return false;
    if (recovery.activeOnline) {
      return this.playOnlineEvent(recovery.activeOnline.event, recovery.activeOnline.onComplete);
    }
    if (recovery.heldEvent) {
      return this.restoreHeldAppearance(recovery.heldEvent);
    }
    return false;
  }

  /**
   * 清空所有动画和本地状态。
   */
  clear(reason) {
    this.onlinePlayback = null;
    this.localActionPreview = null;
    this.heldAppearance = null;
    this.layoutRecovery = null;
    this.manager.clear(reason);
  }
}
