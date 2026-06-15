import { eventPlan } from './presets';

const MELD_EVENT_TYPES = ['chi', 'peng', 'zhao', 'ta'];

/**
 * 暴露给主循环和网络层的窄动画接口。
 * 网络层无需知道 Canvas 渲染器如何保存布局或绘制视觉对象。
 */
export default class TableAnimationController {
  constructor(renderer, manager) {
    this.renderer = renderer;
    this.manager = manager;
    this.onlinePlayback = null;
    this.localActionPreview = null;
  }

  update(time) {
    this.manager.update(time);
  }

  playOnlineEvent(event, onComplete) {
    if (!event || typeof event.eventSeq !== 'number') return false;
    if (this.onlinePlayback && this.onlinePlayback.eventSeq === event.eventSeq) return true;
    const renderer = this.renderer;
    const layout = renderer.lastLayout;
    if (!layout) return false;
    if (this.onlinePlayback) this.manager.release(`online:${this.onlinePlayback.eventSeq}`);
    this.onlinePlayback = { eventSeq: event.eventSeq, event, completed: false };
    if (MELD_EVENT_TYPES.indexOf(event.type) >= 0) renderer.suppressNextMeldEffect = true;
    if (['hu', 'circle-loss', 'draw-round', 'settlement'].indexOf(event.type) >= 0) renderer.suppressNextResultEffect = true;

    const context = { layout };
    const held = renderer.lastDiscardEvent;
    if (event.card && held && held.card.id === event.card.id && held.holdPosition) context.start = held.holdPosition;
    if (!event.card && event.meld && held && held.card) {
      const heldCard = (event.meld.cards || []).find((card) => card.id === held.card.id);
      if (heldCard) {
        context.card = heldCard;
        context.start = held.holdPosition || renderer.animationEndForSeat(event.seat, layout);
        context.end = renderer.claimedAnimationEnd(event.seat, layout);
      }
    }
    if ((event.type === 'draw' || event.type === 'discard') && event.card) {
      renderer.lastDiscardEvent = {
        seat: event.seat,
        card: event.card,
        holdPosition: renderer.animationEndForSeat(event.seat, layout),
      };
    }
    return this.manager.play(eventPlan(event, context), () => {
      if (!this.onlinePlayback || this.onlinePlayback.eventSeq !== event.eventSeq) return;
      this.onlinePlayback.completed = true;
      if (typeof onComplete === 'function') onComplete(event);
    });
  }

  releaseOnlineEvent(eventSeq) {
    if (!this.onlinePlayback) return;
    if (typeof eventSeq === 'number' && this.onlinePlayback.eventSeq !== eventSeq) return;
    this.manager.release(`online:${this.onlinePlayback.eventSeq}`);
    this.onlinePlayback = null;
  }

  playLocalActionPreview(action) {
    const renderer = this.renderer;
    if (!action || !action.type || !renderer.lastLayout) return false;
    const normalizedType = action.type === 'acceptTakeover'
      ? 'accept-takeover'
      : (action.type === 'declineTakeover' ? 'decline-takeover' : action.type);
    const context = { layout: renderer.lastLayout };
    if (action.type === 'discard' && action.card) {
      const handCard = renderer.previousHandCards.find((region) => region.card && region.card.id === action.card.id);
      context.start = handCard
        ? { x: handCard.x, y: handCard.y }
        : renderer.animationStartForSeat(0, renderer.lastLayout);
    } else if (MELD_EVENT_TYPES.indexOf(action.type) >= 0 && action.card) {
      const held = renderer.lastDiscardEvent;
      context.start = held && held.card.id === action.card.id
        ? (held.holdPosition || renderer.animationEndForSeat(action.sourceSeat || 0, renderer.lastLayout))
        : renderer.animationEndForSeat(typeof action.sourceSeat === 'number' ? action.sourceSeat : 0, renderer.lastLayout);
      context.end = renderer.claimedAnimationEnd(0, renderer.lastLayout);
    }
    const plan = eventPlan({ ...action, type: normalizedType, seat: 0 }, context);
    plan.id = `local-preview:${action.type}:${action.card ? action.card.id : ''}`;
    this.localActionPreview = {
      type: normalizedType,
      cardId: action.card ? action.card.id : null,
    };
    return this.manager.startPreview({ ...action, type: normalizedType }, plan);
  }

  confirmLocalActionPreview(event, onComplete) {
    const preview = this.localActionPreview;
    if (!preview || !event || preview.type !== event.type || event.seat !== 0) return false;
    const renderer = this.renderer;
    if (MELD_EVENT_TYPES.indexOf(event.type) >= 0) renderer.suppressNextMeldEffect = true;
    if (event.type === 'hu') renderer.suppressNextResultEffect = true;
    if (event.type === 'discard' && event.card) {
      renderer.stateAnimationController.lastSignature = `discard:${event.seat}:${event.card.id}`;
      renderer.lastDiscardEvent = {
        seat: event.seat,
        card: event.card,
        holdPosition: renderer.animationEndForSeat(event.seat, renderer.lastLayout),
      };
    }
    return this.manager.confirmPreview(event, onComplete);
  }

  cancelLocalActionPreview() {
    this.localActionPreview = null;
    this.manager.cancelPreview();
  }

  isBlockingStateAnimation() {
    return Boolean(this.onlinePlayback || this.localActionPreview);
  }

  clear(reason) {
    this.onlinePlayback = null;
    this.localActionPreview = null;
    this.manager.clear(reason);
  }
}
