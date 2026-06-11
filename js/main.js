import { ctx } from './render';
import AssetLoader from './game/assets';
import HuapaiEngine from './game/engine';
import TableInput from './game/input';
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
  engine = new HuapaiEngine(GameGlobal.databus, GameGlobal.musicManager);
  input = null;
  online = null;
  mode = null;
  menu = null;

  constructor() {
    this.assets.loadImages();
    this.menu = new StartMenu(this.handleModeSelect.bind(this));
    this.menu.show();
    cancelAnimationFrame(this.aniId);
    this.aniId = requestAnimationFrame(this.loop.bind(this));
  }

  handleModeSelect(mode, profile = {}) {
    if (mode === 'single') {
      this.menu.hide();
      this.startSinglePlayer();
      return;
    }
    if (mode === 'online') {
      this.startOnline(profile);
    }
  }

  startSinglePlayer() {
    this.mode = 'single';
    this.input = new TableInput(this.engine, this.renderer, GameGlobal.musicManager);
    this.engine.startRound();
  }

  startOnline(profile = {}) {
    if (this.online && this.online.starting) return;
    this.menu.setBusy(true);
    this.online = new OnlineController(GameGlobal.databus, this.renderer, GameGlobal.musicManager);
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
    if ((this.mode === 'single' || this.mode === 'online') && this.hasRenderableState()) {
      this.renderer.render(ctx, GameGlobal.databus);
    }
    if (this.menu) {
      this.menu.render(ctx);
    }
  }

  loop() {
    this.render();
    this.aniId = requestAnimationFrame(this.loop.bind(this));
  }
}
