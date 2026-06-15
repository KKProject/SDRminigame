import {
  ctx,
  getRenderMetrics,
  refreshRenderMetrics,
  subscribeRenderMetrics,
} from './render';
import AssetLoader from './game/assets';
import TableRenderer from './game/renderer';
import DataBus from './databus';
import Music from './runtime/music';
import StartMenu from './ui/menu';
import OnlineController, { onlineErrorMessage } from './net/online';

GameGlobal.databus = new DataBus();
GameGlobal.musicManager = new Music();

export default class Main {
  aniId = 0;
  assets = new AssetLoader();
  renderer = new TableRenderer(this.assets);
  online = null;
  mode = null;
  menu = null;

  constructor() {
    this.assets.loadImages();
    this.menu = new StartMenu(this.handleModeSelect.bind(this));
    this.metricsRetryRemaining = 120;
    this.boundMetricsChange = this.handleMetricsChange.bind(this);
    this.unsubscribeMetrics = subscribeRenderMetrics(this.boundMetricsChange);
    this.boundWindowResize = this.handleWindowResize.bind(this);
    if (wx.onWindowResize) wx.onWindowResize(this.boundWindowResize);
    if (wx.onShow) wx.onShow(this.boundWindowResize);
    const metrics = getRenderMetrics();
    if (metrics) this.handleMetricsChange(metrics);
    cancelAnimationFrame(this.aniId);
    this.aniId = requestAnimationFrame(this.loop.bind(this));
  }

  handleWindowResize() {
    this.metricsRetryRemaining = 30;
    refreshRenderMetrics();
  }

  handleMetricsChange(metrics) {
    if (!metrics) return;
    this.metricsRetryRemaining = 0;
    this.renderer.setViewport(metrics);
    this.menu.handleMetricsChange();
    if (!this.mode && !this.menu.active) this.menu.show();
  }

  handleModeSelect(mode, profile = {}) {
    if (mode === 'online') {
      this.startOnline(profile);
    }
  }

  startOnline(profile = {}) {
    if (this.online && this.online.starting) return;
    this.menu.setBusy(true);
    this.online = new OnlineController(GameGlobal.databus, this.renderer, GameGlobal.musicManager, this.renderer.animationController);
    this.online.onStatus = (text) => this.menu.setStatus(text);
    this.online.startSoloOnline(profile)
      .then(() => {
        this.menu.hide();
        this.mode = 'online';
        this.online.enableInput();
      })
      .catch((err) => {
        console.error('[online] start failed', err);
        this.menu.setBusy(false);
        this.menu.setStatus(onlineErrorMessage(err));
      });
  }

  hasRenderableState() {
    const state = GameGlobal.databus;
    return Array.isArray(state.seats) && state.seats.length > 0 && state.seats[state.humanSeat];
  }

  render() {
    if (!getRenderMetrics()) return;
    if (this.mode === 'online' && this.hasRenderableState()) {
      this.renderer.render(ctx, GameGlobal.databus);
    }
    if (this.menu) {
      this.menu.render(ctx);
    }
  }

  loop(time) {
    if (this.metricsRetryRemaining > 0) {
      this.metricsRetryRemaining -= 1;
      refreshRenderMetrics();
    }
    this.renderer.animationController.update(time);
    this.render();
    this.aniId = requestAnimationFrame(this.loop.bind(this));
  }
}
