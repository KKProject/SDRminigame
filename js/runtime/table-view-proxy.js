const ANIMATOR_METHODS = [
  'playOnlineEvent',
  'playLocalActionPreview',
  'confirmLocalActionPreview',
  'cancelLocalActionPreview',
  'settleHeldAppearanceForEvent',
  'restoreHeldAppearance',
  'reconcileHeldAppearance',
  'releaseOnlineEvent',
];

export default class TableViewProxy {
  constructor() {
    this.target = null;
    this.animator = {};
    ANIMATOR_METHODS.forEach((method) => {
      this.animator[method] = (...args) => {
        const controller = this.target && this.target.animationController;
        if (!controller || typeof controller[method] !== 'function') return undefined;
        return controller[method](...args);
      };
    });
  }

  attach(renderer) {
    this.target = renderer || null;
  }

  get ready() {
    return Boolean(this.target);
  }

  hitRegionAt(x, y) {
    if (!this.target || typeof this.target.hitRegionAt !== 'function') return null;
    return this.target.hitRegionAt(x, y);
  }

  markButtonPressed(region) {
    if (this.target && typeof this.target.markButtonPressed === 'function') {
      this.target.markButtonPressed(region);
    }
  }

  scrollTableRecordBy(deltaY) {
    if (this.target && typeof this.target.scrollTableRecordBy === 'function') {
      this.target.scrollTableRecordBy(deltaY);
    }
  }

  scrollRoundResultBy(deltaY) {
    if (this.target && typeof this.target.scrollRoundResultBy === 'function') {
      this.target.scrollRoundResultBy(deltaY);
    }
  }
}
