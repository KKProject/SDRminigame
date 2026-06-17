import { eventPlan } from './presets';
import { claimedTarget, seatFront } from './targets';

// 这些动作类型意味着某张牌被“响应”了（吃/碰/招/踏/胡/过）。
const RESPONSE_TYPES = ['chi', 'peng', 'zhao', 'ta', 'hu', 'pass'];

/**
 * 在全局 state 中查找某张牌出现在哪个座位的 meld（副露）里。
 * 用于判断一张被弃的牌是否已经被某家“吃碰”。
 * @returns {object|null} { seat, meld }
 */
function findClaim(state, cardId) {
  for (let seat = 0; seat < (state.seats || []).length; seat++) {
    const meld = (state.seats[seat].melds || []).find((item) => (
      (item.cards || []).some((card) => card.id === cardId)
    ));
    if (meld) return { seat, meld };
  }
  return null;
}

/**
 * 判断某个 pendingAction 是否是对 cardId 这张牌的响应。
 */
function isResponseCard(action, cardId) {
  return RESPONSE_TYPES.indexOf(action.type) >= 0 && (!action.card || action.card.id === cardId);
}

/**
 * StateAnimationController 负责根据游戏状态自动补全动画。
 * 它不是由网络事件直接驱动，而是“观察” state 的变化：
 *   - 发现 state 里有摸牌/打牌，就播放对应的 retained 动画。
 *   - 发现某张牌被吃了/碰了/没人要，就播放它飞向对应区域的动画。
 *
 * 这样即使网络事件缺失或乱序，只要 state 最终一致，动画也能跟上。
 */
export default class StateAnimationController {
  constructor(manager, onClear = null) {
    this.manager = manager;          // AnimationManager 实例
    this.onClear = onClear;          // 清理时的回调
    this.active = null;              // 当前正在保留的动画状态
    this.lastSignature = '';         // 上一次观察到的事件签名，用于去重
    this.resolutionSignature = '';   // 上一次处理过的“结果”签名，用于去重
    this.resultCleared = false;      // 是否已经在本局结果阶段清理过动画
  }

  /**
   * 观察 state 变化，并决定是否需要播放动画。
   * @param {object} state 当前游戏状态
   * @param {object} layout 当前布局
   * @param {boolean} blocked 是否被阻塞（被阻塞时不播放新动画）
   */
  observe(state, layout, blocked = false) {
    if (!state || !layout || blocked) return;

    // 进入结算/结果阶段：如果是 win，直接清理动画，避免动画和结算界面冲突。
    if (state.phase === 'result' && state.result && state.result.type === 'win') {
      if (!this.resultCleared) {
        this.clear('win-result');
        this.resultCleared = true;
      }
      return;
    }
    this.resultCleared = false;

    // 从 state 中提取当前应该被“保留显示”的事件：
    // - 如果有 drawnCard，说明刚摸/亮了牌。座位 MUST 用“摸牌人”而非 currentSeat，
    //   否则响应权轮转到响应方时签名会变化，导致同一张待响应牌迁移到响应方区域重播。
    // - 否则如果有 recentDiscard，说明刚打了牌，座位固定为出牌人。
    const drawSeat = state.appearingCard && typeof state.appearingCard.sourceSeat === 'number'
      ? state.appearingCard.sourceSeat
      : state.currentSeat;
    const event = state.drawnCard && typeof drawSeat === 'number'
      ? { type: 'draw', seat: drawSeat, card: state.drawnCard }
      : (state.recentDiscard ? { type: 'discard', seat: state.recentDiscard.seat, card: state.recentDiscard.card } : null);

    const signature = event ? `${event.type}:${event.seat}:${event.card.id}` : '';

    // 先尝试处理“保留卡牌”的后续去向（被吃碰或变为 unclaimed）。
    if (this.resolveRetainedCard(state, layout)) return;

    if (signature && signature !== this.lastSignature) {
      // 有新的摸牌/打牌事件，播放 retained 动画。
      this.releaseActive();
      this.playRetained(event, layout, `state:${signature}`);
      this.lastSignature = signature;
      this.resolutionSignature = '';
    } else if (!signature) {
      this.lastSignature = '';
    }

    // 再次尝试处理保留卡牌的去向。
    this.resolveRetainedCard(state, layout);
  }

  /**
   * 播放一个“保留”在场景中的动画。
   * 卡牌视觉对象 retain=true，动画结束后不会消失，直到被 resolveRetainedCard 处理。
   */
  playRetained(event, layout, id) {
    const plan = eventPlan(event, { layout });
    if (!plan) return;
    plan.id = id;

    // 把 plan 里的所有卡牌视觉对象标记为 retain，使其在动画结束后仍显示。
    (plan.visuals || []).forEach((visual) => {
      if (visual.kind === 'card') visual.retain = true;
    });

    this.manager.play(plan);
    this.active = { id, event, position: seatFront(event.seat, layout) };
  }

  /**
   * 判断当前保留的卡牌是否已经被吃碰或进入弃牌区，如果是则播放后续动画。
   * @returns {boolean} 是否已经处理
   */
  resolveRetainedCard(state, layout) {
    const active = this.active;
    if (!active || !active.event || !active.event.card) return false;

    const { event } = active;
    const cardId = event.card.id;

    // 如果存在对这张牌的 pending 响应动作，先不处理，等待响应完成。
    const actions = (state.pendingActions || []).concat(state.playerActions || []);
    if (actions.some((action) => isResponseCard(action, cardId))) return false;

    // 情况 1：这张牌已经被某家吃碰，飞向 claimed 区域。
    const claim = findClaim(state, cardId);
    if (claim) {
      const signature = `claim:${claim.seat}:${cardId}:${claim.meld.id || claim.meld.type}`;
      if (signature === this.resolutionSignature) return true; // 已经处理过
      this.resolutionSignature = signature;

      this.releaseActive();
      const plan = eventPlan({
        type: claim.meld.type,
        seat: claim.seat,
        card: event.card,
      }, {
        layout,
        start: active.position,              // 从保留位置开始飞
        end: claimedTarget(claim.seat, layout),
      });
      plan.id = `state:${signature}`;
      this.manager.play(plan);
      return true;
    }

    // 情况 2：这张牌是 discard 且变为 unclaimed（没人要），飞向弃牌区。
    const recent = state.recentDiscard;
    if (event.type !== 'discard' || !recent || recent.card.id !== cardId || (!recent.unclaimed && !recent.resolved)) return false;

    const signature = `unclaimed:${event.seat}:${cardId}`;
    if (signature === this.resolutionSignature) return true;
    this.resolutionSignature = signature;

    this.releaseActive();
    const plan = eventPlan({ type: 'unclaimed', seat: event.seat, card: event.card }, {
      layout,
      start: active.position,
    });
    plan.id = `state:${signature}`;
    this.manager.play(plan);
    return true;
  }

  /**
   * 获取当前正在移动的卡牌 ID 列表。
   * 渲染器可以用这个信息避免在同一位置重复绘制静态卡牌。
   */
  movingCardIds() {
    return this.manager.getVisualState()
      .filter((visual) => visual.kind === 'card')
      .map((visual) => visual.card.id);
  }

  /**
   * 释放当前保留的动画，清理资源并把 active 置空。
   */
  releaseActive() {
    if (!this.active) return;
    this.manager.release(this.active.id);
    this.active = null;
  }

  releaseActiveCard(cardId) {
    if (!cardId || !this.active || !this.active.event || !this.active.event.card) return false;
    if (this.active.event.card.id !== cardId) return false;
    this.releaseActive();
    return true;
  }

  /**
   * 清理所有状态动画并重置内部状态。
   */
  clear(reason = 'clear-state-animation') {
    this.releaseActive();
    this.manager.clear(reason);
    this.lastSignature = '';
    this.resolutionSignature = '';
    this.resultCleared = false;
    if (typeof this.onClear === 'function') this.onClear(reason);
  }

  handleLayoutChange() {
    this.active = null;
    this.lastSignature = '';
    this.resolutionSignature = '';
    this.resultCleared = false;
  }
}
