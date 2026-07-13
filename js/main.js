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
import { readStoredProfile } from './net/profile';
import { flushClientDiagnostics, reportClientDiagnostic } from './net/diagnostics';

GameGlobal.databus = new DataBus();
GameGlobal.musicManager = new Music();

const APP_MODES = {
  HALL: 'start',
  CREATE_ROOM: 'create-room',
  WAITING_ROOM: 'waiting',
  GAME_TABLE: 'online',
  START: 'start',
};

const INVITE_START_HOME_ERROR_CODES = new Set([
  'ROOM_NOT_FOUND',
  'ROOM_ENDED',
  'ROOM_ALREADY_STARTED',
  'ROOM_NOT_JOINABLE',
  'ROOM_FULL',
]);

function errorCodeOf(err) {
  return (err && (err.code || err.message)) || '';
}

function shouldReturnInviteToStart(err) {
  return INVITE_START_HOME_ERROR_CODES.has(errorCodeOf(err));
}

function inviteStartMessage(err) {
  const code = errorCodeOf(err);
  if (code === 'ROOM_NOT_FOUND' || code === 'ROOM_ENDED') return '房间不存在或已结束';
  return onlineErrorMessage(err);
}

function showToast(message) {
  if (!message || typeof wx === 'undefined' || !wx.showToast) return;
  wx.showToast({ title: message, icon: 'none', duration: 2000 });
}

function hasProfile(profile = {}) {
  return Boolean(profile && (profile.profileReady || profile.nickName || profile.avatarUrl));
}

export default class Main {
  aniId = 0;
  assets = new AssetLoader();
  renderer = new TableRenderer(this.assets);
  online = null;
  mode = null;
  menu = null;
  loggedInProfile = null;
  pendingInviteRoomId = '';
  startSilentLoginPending = false;
  cleanupInviteListener = null;

  constructor() {
    this.assets.loadImages();
    this.menu = new StartMenu(this.handleModeSelect.bind(this), this.assets);
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
    if (this.online && this.online.starting) return;
    if (this.mode === APP_MODES.GAME_TABLE && this.online && this.online.active) {
      this.menu.setStatus('你已有进行中的牌桌');
      return;
    }
    if (this.mode === APP_MODES.WAITING_ROOM && this.online && this.online.roomId === roomId) {
      this.online.refreshWaitingRoom();
      return;
    }
    const profile = (this.online && this.online.lobbyProfile) || this.loggedInProfile || readStoredProfile();
    if (!hasProfile(profile)) {
      this.mode = APP_MODES.HALL;
      if (this.menu) {
        this.menu.showStartHome({});
        this.menu.setStatus('正在登录…');
        this.menu.show();
      }
      this.silentLoginFromStart('invite');
      return;
    }
    if (this.menu) this.menu.setStatus('收到房间邀请，正在进入…');
    if (autoStart || this.mode === APP_MODES.HALL || this.mode === null) {
      this.startOnline(profile, roomId);
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
    if (mode === 'startReady') {
      this.startFromHome(profile);
    } else if (mode === 'startLogin') {
      this.loginFromStart(profile);
    } else if (mode === 'startSilentLogin') {
      this.silentLoginFromStart('idle');
    } else if (mode === 'openCreateRoomSettings') {
      this.mode = APP_MODES.CREATE_ROOM;
      this.menu.setStatus('');
    } else if (mode === 'confirmCreateRoom') {
      this.createOnlineRoom(profile);
    } else if (mode === 'online') {
      this.startOnline(profile, this.pendingInviteRoomId);
    } else if (mode === 'returnStartHome') {
      this.mode = APP_MODES.HALL;
    } else if (mode === 'createRoom') {
      this.mode = APP_MODES.CREATE_ROOM;
      this.menu.showCreateRoomSettings();
    } else if (mode === 'lobbyRetry') {
      const retryProfile = this.online && this.online.lobbyProfile ? this.online.lobbyProfile : {};
      this.startOnline(retryProfile, this.pendingInviteRoomId);
    } else if (mode === 'roomReady') {
      this.readyInWaitingRoom(profile && typeof profile.ready === 'boolean' ? profile.ready : true);
    } else if (mode === 'roomInvite') {
      this.inviteWaitingRoom();
    } else if (mode === 'roomStart') {
      this.startWaitingRoom();
    } else if (mode === 'roomDisband') {
      this.disbandWaitingRoom();
    } else if (mode === 'seatSwapRequest') {
      this.requestSeatSwap(profile && profile.player);
    } else if (mode === 'seatSwapRespond') {
      this.respondSeatSwap(profile || {});
    } else if (mode === 'waitingRetry') {
      if (this.online) this.online.refreshWaitingRoom();
    }
  }

  bindOnlineController(controller) {
    controller.onStatus = (text) => this.menu.setStatus(text);
    controller.onLobby = (lobby) => {
      this.loggedInProfile = lobby.profile || this.loggedInProfile;
      if (lobby.profile) this.menu.setStartAuthState('ready', { profile: lobby.profile });
      if (this.mode === APP_MODES.CREATE_ROOM && lobby.state !== 'idle') return;
      const lobbyProfile = lobby.profile || this.loggedInProfile || controller.lobbyProfile || {};
      if (lobby.state === 'idle') {
        this.menu.showStartHome(lobbyProfile);
        this.mode = APP_MODES.HALL;
        this.menu.show();
        return;
      }
      this.menu.showLobby(lobbyProfile);
      this.menu.setLobbyState(lobby.state, lobby);
      this.mode = APP_MODES.HALL;
      this.menu.show();
    };
    controller.onWaitingRoom = (waiting) => {
      this.mode = APP_MODES.WAITING_ROOM;
      this.menu.showWaitingRoom(waiting);
      this.menu.setWaitingRoomState(waiting);
      this.menu.show();
    };
    controller.onEnterTable = () => {
      this.enterOnlineTable();
    };
  }

  ensureOnlineController() {
    if (!this.online) {
      this.online = new OnlineController(GameGlobal.databus, this.renderer, GameGlobal.musicManager, this.renderer.animationController);
      this.bindOnlineController(this.online);
    }
    return this.online;
  }

  loginFromStart(profile = {}) {
    const controller = this.ensureOnlineController();
    if (controller.starting) return;
    this.menu.setBusy(true);
    this.menu.setStartAuthState('logging-in', { profile });
    controller.loginForLobby(profile)
      .then((lobbyProfile) => {
        this.loggedInProfile = lobbyProfile;
        this.mode = APP_MODES.START;
        this.menu.setBusy(false);
        this.menu.setStartAuthState('ready', { profile: lobbyProfile });
      })
      .catch((err) => {
        console.error('[online] start login failed', err);
        this.menu.setBusy(false);
        this.menu.setStartAuthState('error', { error: onlineErrorMessage(err), profile });
      });
  }

  startFromHome(profile = {}) {
    const storedProfile = hasProfile(profile) ? profile : readStoredProfile();
    if (!hasProfile(storedProfile)) {
      this.menu.promptLogin(this.pendingInviteRoomId ? '请先微信登录后进入房间' : '请先微信登录后开始');
      return;
    }
    if (this.pendingInviteRoomId) {
      this.startOnline(storedProfile, this.pendingInviteRoomId);
      return;
    }
    this.openCreateRoomWithProfile(storedProfile);
  }

  loginAndOpenCreateRoom(profile = {}) {
    const controller = this.ensureOnlineController();
    if (controller.starting) return;
    this.menu.setBusy(true);
    this.menu.setStartAuthState('logging-in', { profile });
    controller.loginForLobby(profile)
      .then((lobbyProfile) => {
        this.openCreateRoomWithProfile(lobbyProfile);
      })
      .catch((err) => {
        console.error('[online] start gate login failed', err);
        this.mode = APP_MODES.HALL;
        this.menu.setBusy(false);
        this.menu.setStartAuthState('error', { error: onlineErrorMessage(err), profile });
      });
  }

  openCreateRoomWithProfile(profile = {}) {
    this.loggedInProfile = profile;
    const controller = this.ensureOnlineController();
    controller.lobbyProfile = Object.assign({}, controller.lobbyProfile || {}, profile);
    controller.loginProfile = Object.assign({}, controller.loginProfile || {}, profile);
    this.mode = APP_MODES.CREATE_ROOM;
    this.menu.setBusy(false);
    this.menu.setStartAuthState('ready', { profile });
    this.menu.showCreateRoomSettings();
  }

  silentLoginFromStart(intent = 'idle') {
    if (this.startSilentLoginPending) return;
    const controller = this.ensureOnlineController();
    if (controller.starting) return;
    this.startSilentLoginPending = true;
    this.mode = APP_MODES.HALL;
    this.menu.setBusy(true);
    this.menu.setStartAuthState('logging-in');
    controller.loginForLobby({})
      .then((lobbyProfile) => {
        this.loggedInProfile = lobbyProfile;
        this.menu.setBusy(false);
        if (!hasProfile(lobbyProfile)) {
          this.menu.promptLogin(intent === 'invite' ? '请先微信登录后进入房间' : '请先微信登录后开始');
          return;
        }
        this.menu.setStartAuthState('ready', { profile: lobbyProfile });
        if (intent === 'invite' && this.pendingInviteRoomId) {
          this.startOnline(lobbyProfile, this.pendingInviteRoomId);
        } else if (intent === 'create') {
          this.openCreateRoomWithProfile(lobbyProfile);
        }
      })
      .catch((err) => {
        console.error('[online] silent start login failed', err);
        this.menu.setBusy(false);
        this.menu.setStartAuthState('error', { error: onlineErrorMessage(err) });
      })
      .finally(() => {
        this.startSilentLoginPending = false;
      });
  }

  startOnline(profile = {}, inviteRoomId = '') {
    if (this.online && this.online.starting) return;
    this.menu.setBusy(true);
    this.menu.setStatus('登录中…');
    this.online = new OnlineController(GameGlobal.databus, this.renderer, GameGlobal.musicManager, this.renderer.animationController);
    this.bindOnlineController(this.online);
    this.online.startLobby(profile, { inviteRoomId })
      .then((result) => {
        if (result && result.entered) {
          this.enterOnlineTable();
        } else if (result && result.waiting) {
          this.pendingInviteRoomId = '';
          this.mode = APP_MODES.WAITING_ROOM;
          this.menu.setBusy(false);
        } else {
          this.mode = APP_MODES.HALL;
          this.menu.setBusy(false);
        }
      })
      .catch((err) => {
        console.error('[online] start failed', err);
        if (inviteRoomId && shouldReturnInviteToStart(err)) {
          const message = inviteStartMessage(err);
          const homeProfile = (this.online && this.online.lobbyProfile) || this.loggedInProfile || readStoredProfile();
          this.pendingInviteRoomId = '';
          this.mode = APP_MODES.HALL;
          this.menu.showStartHome(homeProfile);
          this.menu.setBusy(false);
          showToast(message);
          return;
        }
        this.menu.setBusy(false);
        this.menu.setStatus(onlineErrorMessage(err));
      });
  }

  promptContinueExistingRoom(controller, existing) {
    if (!existing || !existing.roomId || !wx.showModal) return;
    wx.showModal({
      title: '已有进行中房间',
      content: '是否继续当前房间？',
      confirmText: '继续游戏',
      cancelText: '留在此页',
      success: (choice) => {
        if (!choice || !choice.confirm) return;
        this.menu.setBusy(true);
        this.menu.setStatus('正在进入当前房间…');
        controller.enterExistingRoom(existing)
          .then((result) => {
            if (result && result.waiting) {
              this.mode = APP_MODES.WAITING_ROOM;
              this.menu.setBusy(false);
              this.menu.showWaitingRoom(result.room || controller.waitingRoom);
              return;
            }
            this.enterOnlineTable();
          })
          .catch((err) => {
            console.error('[online] continue existing room failed', {
              roomId: existing.roomId,
              code: err && (err.code || err.message),
            });
            this.mode = APP_MODES.CREATE_ROOM;
            this.menu.setBusy(false);
            this.menu.setStatus(onlineErrorMessage(err));
          });
      },
    });
  }

  createOnlineRoom(settings = {}) {
    const controller = this.ensureOnlineController();
    if (controller.starting) return;
    this.mode = APP_MODES.CREATE_ROOM;
    this.menu.setBusy(true);
    this.menu.setStatus('正在创建房间…');
    const profile = controller.lobbyProfile || this.loggedInProfile || readStoredProfile();
    const ensureSession = controller.socketAuth
      ? Promise.resolve()
      : controller.loginForLobby(profile, { silent: true }).then((lobbyProfile) => {
        this.loggedInProfile = lobbyProfile;
        this.menu.setStartAuthState('ready', { profile: lobbyProfile });
        this.menu.setStatus('正在创建房间…');
      });
    ensureSession
      .then(() => controller.createLobbyRoom(settings))
      .then((result) => {
        if (result && result.entered) {
          this.enterOnlineTable();
          return;
        }
        this.mode = APP_MODES.WAITING_ROOM;
        this.menu.setBusy(false);
        this.menu.showWaitingRoom(result);
      })
      .catch((err) => {
        console.error('[online] create room failed', {
          code: err && (err.code || err.message),
          existingRoomId: err && err.existing && err.existing.roomId ? err.existing.roomId : '',
        });
        this.mode = APP_MODES.CREATE_ROOM;
        if (this.menu.screen !== 'create-room-settings') this.menu.showCreateRoomSettings();
        this.menu.setBusy(false);
        this.menu.setStatus(onlineErrorMessage(err));
        if (err && err.code === 'ALREADY_IN_ACTIVE_ROOM') {
          this.promptContinueExistingRoom(controller, err.existing);
        }
      });
  }

  readyInWaitingRoom(ready = true) {
    if (!this.online) return;
    this.menu.setBusy(true);
    this.online.setReady(ready).finally(() => {
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

  disbandWaitingRoom() {
    if (!this.online) return;
    this.menu.setBusy(true);
    this.online.leaveTable()
      .finally(() => {
        this.menu.setBusy(false);
      });
  }

  requestSeatSwap(player = {}) {
    if (!this.online || typeof player.seat !== 'number') return;
    this.menu.setBusy(true);
    this.online.requestSeatSwap(player.seat)
      .finally(() => {
        this.menu.setBusy(false);
      });
  }

  respondSeatSwap(detail = {}) {
    if (!this.online) return;
    this.menu.setBusy(true);
    this.online.respondSeatSwap(detail.requestId, detail.accept !== false)
      .finally(() => {
        this.menu.setBusy(false);
      });
  }

  enterOnlineTable() {
    if (!this.online) return;
    this.pendingInviteRoomId = '';
    this.menu.hide();
    this.mode = APP_MODES.GAME_TABLE;
    this.online.enableInput();
  }

  hasRenderableState() {
    const state = GameGlobal.databus;
    return Array.isArray(state.seats) && state.seats.length > 0 && state.seats[state.humanSeat];
  }

  render() {
    if (!getRenderMetrics()) return;
    if (this.mode === APP_MODES.GAME_TABLE && this.hasRenderableState()) {
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
