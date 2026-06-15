import { eventPlan } from './presets';
import { claimedTarget, seatFront } from './targets';

const RESPONSE_TYPES = ['chi', 'peng', 'zhao', 'ta', 'hu', 'pass'];

function findClaim(state, cardId) {
  for (let seat = 0; seat < (state.seats || []).length; seat++) {
    const meld = (state.seats[seat].melds || []).find((item) => (
      (item.cards || []).some((card) => card.id === cardId)
    ));
    if (meld) return { seat, meld };
  }
  return null;
}

function isResponseCard(action, cardId) {
  return RESPONSE_TYPES.indexOf(action.type) >= 0 && (!action.card || action.card.id === cardId);
}

export default class StateAnimationController {
  constructor(manager, onClear = null) {
    this.manager = manager;
    this.onClear = onClear;
    this.active = null;
    this.lastSignature = '';
    this.resolutionSignature = '';
    this.resultCleared = false;
  }

  observe(state, layout, blocked = false) {
    if (!state || !layout || blocked) return;
    if (state.phase === 'result' && state.result && state.result.type === 'win') {
      if (!this.resultCleared) {
        this.clear('win-result');
        this.resultCleared = true;
      }
      return;
    }
    this.resultCleared = false;

    const event = state.drawnCard && typeof state.currentSeat === 'number'
      ? { type: 'draw', seat: state.currentSeat, card: state.drawnCard }
      : (state.recentDiscard ? { type: 'discard', seat: state.recentDiscard.seat, card: state.recentDiscard.card } : null);
    const signature = event ? `${event.type}:${event.seat}:${event.card.id}` : '';

    if (this.resolveRetainedCard(state, layout)) return;

    if (signature && signature !== this.lastSignature) {
      this.releaseActive();
      this.playRetained(event, layout, `state:${signature}`);
      this.lastSignature = signature;
      this.resolutionSignature = '';
    } else if (!signature) {
      this.lastSignature = '';
    }

    this.resolveRetainedCard(state, layout);
  }

  playRetained(event, layout, id) {
    const plan = eventPlan(event, { layout });
    if (!plan) return;
    plan.id = id;
    (plan.visuals || []).forEach((visual) => {
      if (visual.kind === 'card') visual.retain = true;
    });
    this.manager.play(plan);
    this.active = { id, event, position: seatFront(event.seat, layout) };
  }

  resolveRetainedCard(state, layout) {
    const active = this.active;
    if (!active || !active.event || !active.event.card) return false;
    const { event } = active;
    const cardId = event.card.id;
    const actions = (state.pendingActions || []).concat(state.playerActions || []);
    if (actions.some((action) => isResponseCard(action, cardId))) return false;

    const claim = findClaim(state, cardId);
    if (claim) {
      const signature = `claim:${claim.seat}:${cardId}:${claim.meld.id || claim.meld.type}`;
      if (signature === this.resolutionSignature) return true;
      this.resolutionSignature = signature;
      this.releaseActive();
      const plan = eventPlan({
        type: claim.meld.type,
        seat: claim.seat,
        card: event.card,
      }, {
        layout,
        start: active.position,
        end: claimedTarget(claim.seat, layout),
      });
      plan.id = `state:${signature}`;
      this.manager.play(plan);
      return true;
    }

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

  movingCardIds() {
    return this.manager.getVisualState()
      .filter((visual) => visual.kind === 'card')
      .map((visual) => visual.card.id);
  }

  releaseActive() {
    if (!this.active) return;
    this.manager.release(this.active.id);
    this.active = null;
  }

  clear(reason = 'clear-state-animation') {
    this.releaseActive();
    this.manager.clear(reason);
    this.lastSignature = '';
    this.resolutionSignature = '';
    this.resultCleared = false;
    if (typeof this.onClear === 'function') this.onClear(reason);
  }
}
