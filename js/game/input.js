export default class TableInput {
  constructor(engine, renderer, music) {
    this.engine = engine;
    this.renderer = renderer;
    this.music = music;
    this.boundTouch = this.handleTouch.bind(this);
    wx.onTouchStart(this.boundTouch);
  }

  destroy() {
    if (wx.offTouchStart) {
      wx.offTouchStart(this.boundTouch);
    }
  }

  handleTouch(event) {
    const touch = event.touches && event.touches[0];
    if (!touch || !this.renderer.lastLayout) return;

    const layoutHelper = this.renderer.layout;
    const region = layoutHelper.hit(this.renderer.lastLayout, touch.clientX, touch.clientY);
    if (!region) {
      this.engine.setFeedback('这里暂时不能操作');
      return;
    }

    if (this.music) this.music.playCue('tap');

    if (region.type === 'hand-card') {
      this.engine.handleCardTap(region.card.id);
      return;
    }

    if (region.type === 'action') {
      if (this.renderer && this.renderer.markButtonPressed) {
        this.renderer.markButtonPressed(region);
      }
      this.engine.handlePlayerAction(region.action);
      return;
    }

    if (region.type === 'restart') {
      this.engine.startRound();
      return;
    }

    if (region.type === 'mute') {
      this.engine.toggleMute();
    }
  }
}
