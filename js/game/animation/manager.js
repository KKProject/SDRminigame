import { Group, Tween } from '../../vendor/tween/tween.esm';

function once(callback) {
  let called = false;
  return (value) => {
    if (called) return;
    called = true;
    if (typeof callback === 'function') callback(value);
  };
}

export default class AnimationManager {
  constructor() {
    this.group = new Group();
    this.visuals = [];
    this.active = new Map();
    this.completedIds = new Set();
    this.preview = null;
    this.time = 0;
    this.nextToken = 1;
  }

  update(time) {
    if (typeof time === 'number') this.time = time;
    this.group.update(this.time, false);
  }

  getVisualState() {
    return this.visuals;
  }

  isPlaying(id) {
    return id ? this.active.has(id) : this.active.size > 0;
  }

  hasCompleted(id) {
    return this.completedIds.has(id);
  }

  play(plan, onComplete, options = {}) {
    if (!plan || !plan.id) return false;
    if (this.active.has(plan.id)) return true;
    if (!options.replay && this.completedIds.has(plan.id)) return false;
    if (options.replace) this.clear('replace');

    const token = this.nextToken++;
    const entry = {
      id: plan.id,
      token,
      visuals: plan.visuals || [],
      tweens: [],
      cancelled: false,
      onComplete: once(onComplete),
    };
    entry.visuals.forEach((visual) => { visual.ownerId = plan.id; });
    this.active.set(plan.id, entry);
    this.visuals.push(...entry.visuals);
    this.runSteps(plan.steps || [], entry, () => this.finish(entry), 0);
    return true;
  }

  runSteps(steps, entry, done, index) {
    if (!this.isCurrent(entry)) return;
    if (index >= steps.length) {
      done();
      return;
    }
    this.runStep(steps[index], entry, () => this.runSteps(steps, entry, done, index + 1));
  }

  runStep(step, entry, done) {
    if (!this.isCurrent(entry)) return;
    if (!step || step.type === 'call') {
      if (step && typeof step.run === 'function') step.run();
      done();
      return;
    }
    if (step.type === 'sequence') {
      this.runSteps(step.steps || [], entry, done, 0);
      return;
    }
    if (step.type === 'parallel') {
      const children = step.steps || [];
      if (!children.length) {
        done();
        return;
      }
      let remaining = children.length;
      const childDone = once(() => {});
      children.forEach((child) => {
        this.runStep(child, entry, () => {
          if (!this.isCurrent(entry)) return;
          remaining -= 1;
          if (!remaining) {
            childDone();
            done();
          }
        });
      });
      return;
    }
    const target = step.type === 'wait' ? { progress: 0 } : step.target;
    const to = step.type === 'wait' ? { progress: 1 } : (step.to || {});
    const tween = new Tween(target, this.group)
      .to(to, Math.max(0, step.duration || 0))
      .onComplete(() => {
        if (!this.isCurrent(entry)) return;
        done();
      });
    if (step.easing) tween.easing(step.easing);
    if (typeof step.onUpdate === 'function') tween.onUpdate(step.onUpdate);
    entry.tweens.push(tween);
    tween.start(this.time);
  }

  finish(entry) {
    if (!this.isCurrent(entry)) return;
    this.active.delete(entry.id);
    this.completedIds.add(entry.id);
    this.removeVisuals(entry.visuals.filter((visual) => !visual.retain));
    entry.onComplete({ id: entry.id, cancelled: false });
  }

  cancel(id, reason = 'cancelled') {
    const entry = this.active.get(id);
    if (!entry) return false;
    entry.cancelled = true;
    entry.tweens.forEach((tween) => tween.stop());
    this.active.delete(id);
    this.removeVisuals(entry.visuals);
    return reason;
  }

  clear(reason = 'clear') {
    Array.from(this.active.keys()).forEach((id) => this.cancel(id, reason));
    this.group.removeAll();
    this.visuals = [];
    this.preview = null;
    this.completedIds.clear();
  }

  startPreview(action, plan, onComplete) {
    this.cancelPreview('replace-preview');
    if (!plan) return false;
    this.preview = {
      action,
      planId: plan.id,
      visuals: plan.visuals || [],
      confirmedEvent: null,
      completed: false,
      completion: null,
    };
    return this.play(plan, () => {
      if (!this.preview || this.preview.planId !== plan.id) return;
      this.preview.completed = true;
      if (this.preview.confirmedEvent && this.preview.completion) {
        this.preview.completion(this.preview.confirmedEvent);
      }
    }, { replay: true });
  }

  confirmPreview(event, onComplete) {
    if (!this.preview || !event || !this.preview.action) return false;
    if (this.preview.action.type !== event.type || event.seat !== 0) return false;
    this.preview.confirmedEvent = event;
    this.preview.completion = once(onComplete);
    if (this.preview.completed) this.preview.completion(event);
    return true;
  }

  cancelPreview(reason = 'cancel-preview') {
    if (!this.preview) return false;
    const planId = this.preview.planId;
    const visuals = this.preview.visuals || [];
    this.preview = null;
    this.cancel(planId, reason);
    this.removeVisuals(visuals);
    return true;
  }

  release(id) {
    if (id) this.completedIds.delete(id);
    this.visuals = this.visuals.filter((visual) => !id || visual.ownerId !== id);
  }

  removeVisuals(visuals) {
    if (!visuals.length) return;
    const remove = new Set(visuals);
    this.visuals = this.visuals.filter((visual) => !remove.has(visual));
  }

  isCurrent(entry) {
    return Boolean(entry && !entry.cancelled && this.active.get(entry.id) === entry);
  }
}
