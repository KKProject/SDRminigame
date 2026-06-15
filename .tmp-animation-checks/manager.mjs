import { Group, Tween } from './tween.mjs';

/**
 * 包装一个回调函数，使其只被执行一次。
 * 常用于 onComplete，防止完成回调被重复触发。
 */
function once(callback) {
  let called = false;
  return (value) => {
    if (called) return;
    called = true;
    if (typeof callback === 'function') callback(value);
  };
}

/**
 * AnimationManager 是动画核心调度器。
 * 职责：
 *   1. 维护一个 Tween 组，并在每一帧 update 时推进所有补间。
 *   2. 接收“动画计划（plan）”，把 plan 解析成 Tween 并执行。
 *   3. 管理视觉对象（visuals）列表，供渲染器读取。
 *   4. 支持普通播放、预览播放（preview）、取消、清理等操作。
 */
export default class AnimationManager {
  constructor() {
    this.group = new Group();        // Tween.js 的 Group，所有 Tween 都会加到这里统一更新
    this.visuals = [];               // 当前所有活着的视觉对象，渲染器会读取它
    this.active = new Map();         // 正在播放的 plan，key 是 plan.id
    this.completedIds = new Set();   // 已经播放完成的 plan ID，用于防止重复播放
    this.preview = null;             // 当前本地操作预览的状态对象
    this.time = 0;                   // 当前动画时间戳，由外部主循环传入
    this.nextToken = 1;              // 每次 play 生成一个唯一 token，用于区分同一 plan 的多次播放
  }

  /**
   * 每帧由外部调用，推进 Tween 组的时间。
   * @param {number} time 当前时间戳（毫秒）
   */
  update(time) {
    if (typeof time === 'number') this.time = time;
    this.group.update(this.time, false);
  }

  /**
   * 获取当前所有视觉对象，供渲染器使用。
   */
  getVisualState() {
    return this.visuals;
  }

  /**
   * 查询是否有动画在播放。
   * 传入 id 则查询指定 plan；不传则查询是否有任意 plan 在播放。
   */
  isPlaying(id) {
    return id ? this.active.has(id) : this.active.size > 0;
  }

  /**
   * 查询指定 plan 是否已经播放完成过。
   */
  hasCompleted(id) {
    return this.completedIds.has(id);
  }

  /**
   * 播放一个动画计划。
   * @param {object} plan 动画计划，包含 id、visuals、steps
   * @param {function} onComplete 完成回调
   * @param {object} options 可选参数：replay 是否允许重复播放、replace 是否清空现有动画
   * @returns {boolean} 是否成功开始播放
   */
  play(plan, onComplete, options = {}) {
    if (!plan || !plan.id) return false;

    // 同一个 plan 已经在播放中：直接返回 true，不再重复启动。
    if (this.active.has(plan.id)) return true;

    // 如果已经播放完成过，且不允许重播，则直接返回 false。
    if (!options.replay && this.completedIds.has(plan.id)) return false;

    // replace 模式下清空所有正在播放的动画（用于切换场景等）。
    if (options.replace) this.clear('replace');

    const token = this.nextToken++;

    // entry 是这次播放的内部记录，包含 plan 的 visuals、所有 Tween 实例、完成回调等。
    const entry = {
      id: plan.id,
      token,
      visuals: plan.visuals || [],
      tweens: [],
      cancelled: false,
      onComplete: once(onComplete),
    };

    // 给每个视觉对象标记所属 plan.id，方便后续清理。
    entry.visuals.forEach((visual) => { visual.ownerId = plan.id; });

    this.active.set(plan.id, entry);
    this.visuals.push(...entry.visuals);

    // 开始递归执行 steps。
    this.runSteps(plan.steps || [], entry, () => this.finish(entry), 0);

    return true;
  }

  /**
   * 顺序执行一个 steps 数组。
   * 这是一个递归函数：每次执行 index 位置的 step，完成后调用自己执行下一个。
   */
  runSteps(steps, entry, done, index) {
    if (!this.isCurrent(entry)) return; // 如果 entry 已经被取消或替换，直接停止。
    if (index >= steps.length) {
      done();
      return;
    }
    this.runStep(steps[index], entry, () => this.runSteps(steps, entry, done, index + 1));
  }

  /**
   * 执行单个 step。
   * 支持的 step 类型：
   *   - call：调用 step.run()，然后立即完成
   *   - sequence：顺序执行子 steps
   *   - parallel：并行执行子 steps
   *   - tween：对 target 做补间动画
   *   - wait：等待一段时间
   */
  runStep(step, entry, done) {
    if (!this.isCurrent(entry)) return;

    if (!step || step.type === 'call') {
      // call 类型：执行自定义函数，不创建 Tween。
      if (step && typeof step.run === 'function') step.run();
      done();
      return;
    }

    if (step.type === 'sequence') {
      // sequence：子步骤串行执行。
      this.runSteps(step.steps || [], entry, done, 0);
      return;
    }

    if (step.type === 'parallel') {
      // parallel：子步骤同时开始，等全部完成后才算完成。
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

    // 普通 tween 或 wait 类型：创建一个 Tween 实例。
    // wait 实际上就是对一个 { progress: 0 } 的对象 tween 到 { progress: 1 }。
    const target = step.type === 'wait' ? { progress: 0 } : step.target;
    const to = step.type === 'wait' ? { progress: 1 } : (step.to || {});

    const tween = new Tween(target, this.group)
      .to(to, Math.max(0, step.duration || 0))
      .onComplete(() => {
        if (!this.isCurrent(entry)) return;
        done();
      });

    // 可选：设置缓动函数。
    if (step.easing) tween.easing(step.easing);

    // 可选：每帧回调，用于在 Tween 更新时执行额外逻辑。
    if (typeof step.onUpdate === 'function') tween.onUpdate(step.onUpdate);

    entry.tweens.push(tween);
    tween.start(this.time);
  }

  /**
   * 一个 plan 的所有 steps 执行完成后调用。
   * 负责：从 active 移除、加入 completedIds、清理不需要保留的视觉对象、触发 onComplete。
   */
  finish(entry) {
    if (!this.isCurrent(entry)) return;
    this.active.delete(entry.id);
    this.completedIds.add(entry.id);

    // 只移除 retain 为 false 的视觉对象；retain=true 的会保留在场景中。
    this.removeVisuals(entry.visuals.filter((visual) => !visual.retain));
    entry.onComplete({ id: entry.id, cancelled: false });
  }

  /**
   * 取消指定 plan 的动画。
   * 会停止该 plan 下的所有 Tween，并移除其 visuals。
   */
  cancel(id, reason = 'cancelled') {
    const entry = this.active.get(id);
    if (!entry) return false;
    entry.cancelled = true;
    entry.tweens.forEach((tween) => tween.stop());
    this.active.delete(id);
    this.removeVisuals(entry.visuals);
    return reason;
  }

  /**
   * 清空所有动画和视觉对象，重置状态。
   */
  clear(reason = 'clear') {
    Array.from(this.active.keys()).forEach((id) => this.cancel(id, reason));
    this.group.removeAll();
    this.visuals = [];
    this.preview = null;
    this.completedIds.clear();
  }

  /**
   * 开始一个“本地操作预览”动画。
   * 与普通 play 的区别：
   *   - 会有一个 preview 状态对象记录当前预览信息。
   *   - 播放完成后不会立即触发完成回调，而是要等 confirmPreview 确认事件后才会真正完成。
   */
  startPreview(action, plan, onLocalComplete) {
    this.cancelPreview('replace-preview'); // 先取消之前的预览
    if (!plan) return false;

    this.preview = {
      action,
      planId: plan.id,
      visuals: plan.visuals || [],
      confirmedEvent: null,   // 等待后续确认的网络/本地事件
      completed: false,       // plan 本身的动画是否已播放完
      completion: null,       // 确认后真正要调用的完成回调
    };

    return this.play(plan, () => {
      if (!this.preview || this.preview.planId !== plan.id) return;
      this.preview.completed = true;
      if (typeof onLocalComplete === 'function') onLocalComplete(action);
      if (!this.preview || this.preview.planId !== plan.id) return;
      // 如果动画放完时已经收到确认事件，则立即触发完成回调。
      if (this.preview.confirmedEvent && this.preview.completion) {
        this.preview.completion(this.preview.confirmedEvent);
      }
    }, { replay: true });
  }

  /**
   * 确认本地操作预览对应的真正事件。
   * 如果预览动画已经播完，会立即触发 onComplete；否则先暂存 completion。
   */
  confirmPreview(event, onComplete) {
    if (!this.preview || !event || !this.preview.action) return false;
    const actingSeat = typeof event.actingSeat === 'number' ? event.actingSeat : event.seat;
    if (this.preview.action.type !== event.type || actingSeat !== 0) return false;

    this.preview.confirmedEvent = event;
    this.preview.completion = once(onComplete);

    if (this.preview.completed) this.preview.completion(event);
    return true;
  }

  /**
   * 取消当前预览。
   * 会同时取消 plan 的动画，并移除预览相关的 visuals。
   */
  cancelPreview(reason = 'cancel-preview') {
    if (!this.preview) return false;
    const planId = this.preview.planId;
    const visuals = this.preview.visuals || [];
    this.preview = null;
    this.cancel(planId, reason);
    this.removeVisuals(visuals);
    return true;
  }

  finishPreview(reason = 'finish-preview') {
    if (!this.preview) return false;
    const planId = this.preview.planId;
    this.preview = null;
    this.cancel(planId, reason);
    this.removeVisuals(this.visuals.filter((visual) => visual.ownerId === planId));
    return true;
  }

  /**
   * 释放一个已经完成的 plan 的资源。
   * 调用后该 plan 的 visuals 会被移除，completedIds 中也会被删除（允许再次播放）。
   */
  release(id) {
    if (id) this.completedIds.delete(id);
    this.visuals = this.visuals.filter((visual) => !id || visual.ownerId !== id);
  }

  transferVisuals(fromId, toId) {
    if (!fromId || !toId) return [];
    const transferred = this.visuals.filter((visual) => visual.ownerId === fromId);
    transferred.forEach((visual) => {
      visual.ownerId = toId;
      visual.retain = true;
    });
    return transferred;
  }

  /**
   * 从 visuals 列表中移除指定的视觉对象。
   */
  removeVisuals(visuals) {
    if (!visuals.length) return;
    const remove = new Set(visuals);
    this.visuals = this.visuals.filter((visual) => !remove.has(visual));
  }

  /**
   * 判断一个 entry 是否仍然是当前正在执行的记录。
   * 防止取消/替换后还继续执行旧的回调。
   */
  isCurrent(entry) {
    return Boolean(entry && !entry.cancelled && this.active.get(entry.id) === entry);
  }
}
