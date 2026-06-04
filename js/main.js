import { ctx } from './render';
import AssetLoader from './game/assets';
import HuapaiEngine from './game/engine';
import TableInput from './game/input';
import TableRenderer from './game/renderer';
import DataBus from './databus';
import Music from './runtime/music';

GameGlobal.databus = new DataBus();
GameGlobal.musicManager = new Music();

export default class Main {
  aniId = 0;
  assets = new AssetLoader();
  renderer = new TableRenderer(this.assets);
  engine = new HuapaiEngine(GameGlobal.databus, GameGlobal.musicManager);
  input = null;

  constructor() {
    this.assets.loadImages();
    this.input = new TableInput(this.engine, this.renderer, GameGlobal.musicManager);
    this.start();
  }

  start() {
    this.engine.startRound();
    cancelAnimationFrame(this.aniId);
    this.aniId = requestAnimationFrame(this.loop.bind(this));
  }

  render() {
    this.renderer.render(ctx, GameGlobal.databus);
  }

  loop() {
    this.render();
    this.aniId = requestAnimationFrame(this.loop.bind(this));
  }
}
