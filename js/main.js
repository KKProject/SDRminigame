import {
  beginRenderMetricsRecovery,
  ctx,
  getRenderMetrics,
  refreshRenderMetrics,
  restoreRenderContext,
  subscribeRenderMetrics,
} from './render';
import AssetLoader from './game/assets';
import TableRenderer from './game/renderer';
import DataBus from './databus';
import Music from './runtime/music';
import StartMenu from './ui/menu';
import OnlineController, {
  onlineErrorMessage,
  readLaunchInviteRoomId,
  registerInviteRoomListener,
} from './net/online';
import { profileWithFallback } from './net/profile';
import { flushClientDiagnostics, reportClientDiagnostic } from './net/diagnostics';

GameGlobal.databus = new DataBus();
GameGlobal.musicManager = new Music();

export default class Main {
  aniId = 0;
  assets = new AssetLoader();
  renderer = new TableRenderer(this.assets);
  online = null;
  mode = null;
  menu = null;
  pendingInviteRoomId = '';
  cleanupInviteListener = null;

  constructor() {
    this.assets.loadImages();
    this.menu = new StartMenu(this.handleModeSelect.bind(this));
    this.metricsRetryRemaining = 120;
    this.contextRestoreRetryRemaining = 0;
    this.boundMetricsChange = this.handleMetricsChange.bind(this);
    this.unsubscribeMetrics = subscribeRenderMetrics(this.boundMetricsChange);
    this.boundWindowResize = this.handleWindowResize.bind(this);
    this.boundAppShow = this.handleAppShow.bind(this);
    this.boundAppHide = this.handleAppHide.bind(this);
    if (wx.onWindowResize) wx.onWindowResize(this.boundWindowResize);
    if (wx.onShow) wx.onShow(this.boundAppShow);
    if (wx.onHide) wx.onHide(this.boundAppHide);
    this.bindInviteLaunch();
    const metrics = getRenderMetrics();
    if (metrics) this.handleMetricsChange(metrics);
    cancelAnimationFrame(this.aniId);
    this.aniId = requestAnimationFrame(this.loop.bind(this));
  }

  bindInviteLaunch() {
    const launchRoomId = readLaunchInviteRoomId();
    this.cleanupInviteListener = registerInviteRoomListener((roomId) => {
      this.handleInviteRoomId(roomId, false);
    });
    if (launchRoomId) {
      setTimeout(() => this.handleInviteRoomId(launchRoomId, true), 0);
    }
  }

  handleInviteRoomId(roomId, autoStart = false) {
    if (!roomId) return;
    this.pendingInviteRoomId = roomId;
    if (this.menu) this.menu.setStatus('收到房间邀请，正在进入…');
    if (this.online && this.online.starting) return;
    if (this.mode === 'online' && this.online && this.online.active) {
      this.menu.setStatus('你已有进行中的牌桌');
      return;
    }
    if (this.mode === 'waiting' && this.online && this.online.roomId === roomId) {
      this.online.refreshWaitingRoom();
      return;
    }
    if (autoStart || this.mode === 'lobby' || this.mode === null) {
      this.startOnline(this.online && this.online.lobbyProfile ? this.online.lobbyProfile : profileWithFallback(), roomId);
    }
  }

  runtimeSnapshot(extra = {}) {
    let windowInfo = null;
    try {
      windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : null;
    } catch (err) {
      windowInfo = { error: err && err.message ? err.message : String(err) };
    }
    const metrics = getRenderMetrics();
    return Object.assign({
      mode: this.mode,
      metricsRetryRemaining: this.metricsRetryRemaining,
      contextRestoreRetryRemaining: this.contextRestoreRetryRemaining,
      windowInfo,
      renderMetrics: metrics ? {
        width: metrics.width,
        height: metrics.height,
        windowRawWidth: metrics.windowRawWidth,
        windowRawHeight: metrics.windowRawHeight,
        screenRawWidth: metrics.screenRawWidth,
        screenRawHeight: metrics.screenRawHeight,
        hasScreenSize: metrics.hasScreenSize,
        renderPixelRatio: metrics.renderPixelRatio,
        backingStoreWidth: metrics.backingStoreWidth,
        backingStoreHeight: metrics.backingStoreHeight,
        safeAreaInsets: metrics.safeAreaInsets,
      } : null,
    }, extra);
  }

  handleWindowResize(res = {}) {
    reportClientDiagnostic('app-window-resize', this.runtimeSnapshot({
      resize: res && res.size ? res.size : res,
    }));
    this.metricsRetryRemaining = 30;
    refreshRenderMetrics();
  }

  handleAppShow(options = {}) {
    reportClientDiagnostic('app-show', this.runtimeSnapshot({ options }));
    beginRenderMetricsRecovery();
    this.contextRestoreRetryRemaining = 120;
    this.metricsRetryRemaining = 120;
    refreshRenderMetrics();
  }

  handleAppHide() {
    reportClientDiagnostic('app-hide', this.runtimeSnapshot());
    flushClientDiagnostics();
  }

  handleMetricsChange(metrics, detail = {}) {
    if (!metrics) return;
    reportClientDiagnostic('app-metrics-change', this.runtimeSnapshot({
      detail,
      nextMetrics: {
        width: metrics.width,
        height: metrics.height,
        windowRawWidth: metrics.windowRawWidth,
        windowRawHeight: metrics.windowRawHeight,
        screenRawWidth: metrics.screenRawWidth,
        screenRawHeight: metrics.screenRawHeight,
        hasScreenSize: metrics.hasScreenSize,
        renderPixelRatio: metrics.renderPixelRatio,
        backingStoreWidth: metrics.backingStoreWidth,
        backingStoreHeight: metrics.backingStoreHeight,
        safeAreaInsets: metrics.safeAreaInsets,
      },
    }));
    this.metricsRetryRemaining = 0;
    this.renderer.setViewport(metrics, { forceLayout: Boolean(detail.forceLayout) });
    this.menu.handleMetricsChange();
    if (!this.mode && !this.menu.active) this.menu.show();
  }

  handleModeSelect(mode, profile = {}) {
    if (mode === 'online') {
      this.startOnline(profile, this.pendingInviteRoomId);
    } else if (mode === 'createRoom') {
      this.createOnlineRoom(profile.maxRounds);
    } else if (mode === 'lobbyRetry') {
      const retryProfile = this.online && this.online.lobbyProfile ? this.online.lobbyProfile : {};
      this.startOnline(retryProfile, this.pendingInviteRoomId);
    } else if (mode === 'roomReady') {
      this.readyInWaitingRoom();
    } else if (mode === 'roomInvite') {
      this.inviteWaitingRoom();
    } else if (mode === 'roomStart') {
      this.startWaitingRoom();
    } else if (mode === 'waitingRetry') {
      if (this.online) this.online.refreshWaitingRoom();
    }
  }

  startOnline(profile = {}, inviteRoomId = '') {
    if (this.online && this.online.starting) return;
    this.menu.setBusy(true);
    this.menu.setStatus('登录中…');
    this.online = new OnlineController(GameGlobal.databus, this.renderer, GameGlobal.musicManager, this.renderer.animationController);
    this.online.onStatus = (text) => this.menu.setStatus(text);
    this.online.onLobby = (lobby) => {
      if (lobby.profile) this.menu.showLobby(lobby.profile);
      this.menu.setLobbyState(lobby.state, lobby);
      this.mode = 'lobby';
      this.menu.show();
    };
    this.online.onWaitingRoom = (waiting) => {
      this.menu.showWaitingRoom(waiting);
      this.menu.setWaitingRoomState(waiting);
    };
    this.online.onEnterTable = () => {
      this.enterOnlineTable();
    };
    this.online.startLobby(profile, { inviteRoomId })
      .then((result) => {
        if (result && result.entered) {
          this.enterOnlineTable();
        } else if (result && result.waiting) {
          this.pendingInviteRoomId = '';
          this.mode = 'waiting';
          this.menu.setBusy(false);
        } else {
          this.mode = 'lobby';
          this.menu.setBusy(false);
        }
      })
      .catch((err) => {
        console.error('[online] start failed', err);
        this.menu.setBusy(false);
        this.menu.setStatus(onlineErrorMessage(err));
      });
  }

  createOnlineRoom(maxRounds = 2) {
    if (!this.online || this.online.starting) return;
    this.online.createLobbyRoom(maxRounds)
      .then((result) => {
        if (result && result.entered) {
          this.enterOnlineTable();
          return;
        }
        this.mode = 'waiting';
        this.menu.setBusy(false);
      })
      .catch((err) => {
        console.error('[online] create room failed', err);
        this.menu.setBusy(false);
        this.menu.setStatus(onlineErrorMessage(err));
      });
  }

  readyInWaitingRoom() {
    if (!this.online) return;
    this.menu.setBusy(true);
    this.online.setReady(true).finally(() => {
      this.menu.setBusy(false);
    });
  }

  inviteWaitingRoom() {
    if (!this.online) return;
    const shared = this.online.shareWaitingRoom();
    this.menu.setStatus(shared ? '已唤起微信邀请' : '当前环境不支持微信邀请');
  }

  startWaitingRoom() {
    if (!this.online) return;
    this.menu.setBusy(true);
    this.online.startWaitingRoom()
      .then((entered) => {
        if (!entered) return;
        this.enterOnlineTable();
      })
      .finally(() => {
        this.menu.setBusy(false);
      });
  }

  enterOnlineTable() {
    if (!this.online) return;
    this.pendingInviteRoomId = '';
    this.menu.hide();
    this.mode = 'online';
    this.online.enableInput();
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
    if (this.contextRestoreRetryRemaining > 0) {
      this.contextRestoreRetryRemaining -= 1;
      restoreRenderContext();
    }
    if (this.metricsRetryRemaining > 0) {
      this.metricsRetryRemaining -= 1;
      refreshRenderMetrics();
    }
    this.renderer.animationController.update(time);
    this.render();
    this.aniId = requestAnimationFrame(this.loop.bind(this));
  }
}
