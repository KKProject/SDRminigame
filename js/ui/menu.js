import { getRenderMetrics } from '../render';
import {
  createUserProfileButton,
  getAuthorizedProfile,
  readStoredProfile,
} from '../net/profile';

const MENU_SCREENS = {
  START: 'start',
  LOBBY: 'lobby',
  CREATE_ROOM: 'create-room-settings',
  WAITING_ROOM: 'room-waiting',
  SEAT_SELECTION: 'seat-selection',
};

/**
 * 启动主菜单覆盖层：进入在线对战。
 * 自管触摸事件，选择后通过回调通知，并停止接收触摸。
 */
export default class StartMenu {
  constructor(onSelect, assets = null) {
    this.onSelect = onSelect;
    this.assets = assets;
    this.active = false;
    this.status = '';
    this.buttons = [];
    this.profileButton = null;
    this.profileButtonSignature = '';
    this.checkingProfile = false;
    this.busy = false;
    this.boundTouch = this.handleTouch.bind(this);
    this.boundTouchMove = this.handleTouchMove.bind(this);
    this.boundTouchEnd = this.handleTouchEnd.bind(this);
    this.lastTouchY = 0;
    this.createSettingsTouchActive = false;
    this.createSettingsScrollY = 0;
    this.screen = MENU_SCREENS.START;
    this.authState = 'checking';
    this.authCheckStarted = false;
    this.authError = '';
    this.lobby = {
      state: '',
      profile: null,
      error: '',
      selectedMaxRounds: 2,
    };
    this.roomDraft = {
      maxRounds: 2,
      repeatRound: false,
      washTwice: false,
      payType: 'pihu',
      seat: 'south',
    };
    this.waiting = {
      room: null,
      profile: null,
      error: '',
      swapModal: null,
      swapRequestId: '',
    };
    this.waitingAvatarImages = {};
    this.avatarImage = null;
    this.avatarUrl = '';
    this.avatarLoaded = false;
    this.startProfile = readStoredProfile(typeof wx !== 'undefined' ? wx : null);
    this.loadAvatar(this.startProfile.avatarUrl);
    this.authState = this.hasStartProfile() ? 'ready' : 'login-required';
  }

  show() {
    if (this.active) return;
    this.active = true;
    wx.onTouchStart(this.boundTouch);
    if (wx.onTouchMove) wx.onTouchMove(this.boundTouchMove);
    if (wx.onTouchEnd) wx.onTouchEnd(this.boundTouchEnd);
    this.ensureStartAuthCheck();
  }

  hide() {
    if (!this.active) return;
    this.active = false;
    if (wx.offTouchStart) wx.offTouchStart(this.boundTouch);
    if (wx.offTouchMove) wx.offTouchMove(this.boundTouchMove);
    if (wx.offTouchEnd) wx.offTouchEnd(this.boundTouchEnd);
    this.destroyProfileButton();
  }

  setStatus(text) {
    this.status = text || '';
  }

  setBusy(busy) {
    this.busy = Boolean(busy);
    if (this.busy) this.destroyProfileButton();
  }

  hasStartProfile() {
    return Boolean(this.startProfile && (this.startProfile.nickName || this.startProfile.avatarUrl));
  }

  promptLogin(message = '请先微信登录后开始') {
    this.setStartAuthState('login-required');
    this.status = message;
  }

  setStartAuthState(state, detail = {}) {
    this.authState = state || 'login-required';
    this.authError = detail.error || '';
    if (detail.profile) this.updateStartProfile(detail.profile);
    if (this.authState === 'ready') {
      this.status = '';
      this.destroyProfileButton();
    } else if (this.authState === 'checking') {
      this.status = '正在检查登录状态…';
    } else if (this.authState === 'logging-in') {
      this.status = '正在登录…';
      this.destroyProfileButton();
    } else if (this.authState === 'error') {
      this.status = this.authError || '登录失败，请重试';
    } else {
      this.status = '请先微信登录后开始';
    }
  }

  ensureStartAuthCheck() {
    if (!this.active || this.screen !== MENU_SCREENS.START || this.authCheckStarted) return;
    this.authCheckStarted = true;
    this.setStartAuthState('checking');
    const stored = readStoredProfile(typeof wx !== 'undefined' ? wx : null);
    if (stored.nickName || stored.avatarUrl) {
      this.updateStartProfile(stored);
      this.setStartAuthState('ready', { profile: stored });
      return;
    }
    if (typeof this.onSelect === 'function') {
      this.onSelect('startSilentLogin');
      return;
    }
    this.setStartAuthState('login-required');
  }

  showLobby(profile = {}) {
    this.screen = MENU_SCREENS.LOBBY;
    this.busy = false;
    this.status = '';
    this.createSettingsTouchActive = false;
    this.waiting.swapModal = null;
    this.waiting.swapRequestId = '';
    this.destroyProfileButton();
    this.lobby.profile = Object.assign({ nickName: '玩家', avatarUrl: '' }, profile);
    this.loadAvatar(this.lobby.profile.avatarUrl);
  }

  showStartHome(profile = {}) {
    this.screen = MENU_SCREENS.START;
    this.busy = false;
    this.status = '';
    this.createSettingsTouchActive = false;
    this.waiting.swapModal = null;
    this.waiting.swapRequestId = '';
    if (profile && (profile.nickName || profile.avatarUrl)) {
      this.updateStartProfile(profile);
    }
    this.setStartAuthState(this.hasStartProfile() ? 'ready' : 'login-required', { profile: this.startProfile });
    this.destroyProfileButton();
  }

  setLobbyState(state, detail = {}) {
    this.screen = MENU_SCREENS.LOBBY;
    this.busy = state === 'checking-room' || state === 'reconnecting' || state === 'creating';
    if (detail.profile) {
      this.lobby.profile = Object.assign({ nickName: '玩家', avatarUrl: '' }, detail.profile);
      this.loadAvatar(this.lobby.profile.avatarUrl);
    }
    this.lobby.state = state || '';
    this.lobby.error = detail.error || '';
  }

  showCreateRoomSettings() {
    this.screen = MENU_SCREENS.CREATE_ROOM;
    this.busy = false;
    this.status = '';
    this.destroyProfileButton();
  }

  showSeatSelection() {
    this.showCreateRoomSettings();
  }

  getRoomDraft() {
    const seat = this.roomDraft.seat || 'south';
    const relations = this.getSeatRelations(seat);
    return Object.assign({}, this.roomDraft, relations);
  }

  getSeatRelations(seat) {
    const order = ['east', 'south', 'west', 'north'];
    const index = Math.max(0, order.indexOf(seat));
    return {
      upperSeat: order[(index + order.length - 1) % order.length],
      lowerSeat: order[(index + 1) % order.length],
    };
  }

  showWaitingRoom(detail = {}) {
    this.screen = MENU_SCREENS.WAITING_ROOM;
    this.busy = false;
    this.destroyProfileButton();
    this.waiting.profile = detail.profile || this.lobby.profile || {};
    this.waiting.room = detail.room || detail;
    this.waiting.error = detail.error || '';
  }

  setWaitingRoomState(detail = {}) {
    this.screen = MENU_SCREENS.WAITING_ROOM;
    this.busy = Boolean(detail.busy);
    if (detail.profile) this.waiting.profile = detail.profile;
    if (detail.room) this.waiting.room = detail.room;
    this.waiting.error = detail.error || '';
    const request = this.waiting.room && this.waiting.room.swapRequest;
    if (request && request.direction === 'incoming' && request.id !== this.waiting.swapRequestId) {
      this.waiting.swapModal = {
        type: 'received',
        requestId: request.id,
        player: request.fromPlayer || {},
      };
      this.waiting.swapRequestId = request.id;
    } else if (!request) {
      this.waiting.swapRequestId = '';
      if (this.waiting.swapModal && this.waiting.swapModal.type === 'received') this.waiting.swapModal = null;
    }
    this.destroyProfileButton();
  }

  showSeatSwapReceived(player = {}) {
    this.screen = MENU_SCREENS.WAITING_ROOM;
    this.waiting.swapModal = { type: 'received', player };
    this.destroyProfileButton();
  }

  handleMetricsChange() {
    this.buttons = [];
    this.createSettingsScrollY = 0;
    this.destroyProfileButton();
  }

  handleTouch(event) {
    if (!this.active) return;
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    this.lastTouchY = touch.clientY;
    this.createSettingsTouchActive = this.screen === MENU_SCREENS.CREATE_ROOM
      && this.isInsideCreateSettingsViewport(touch);
    const hit = this.buttons.find((btn) => (
      touch.clientX >= btn.x
      && touch.clientX <= btn.x + btn.w
      && touch.clientY >= btn.y
      && touch.clientY <= btn.y + btn.h
    ));
    if (!hit || typeof this.onSelect !== 'function') return;
    if (this.screen === MENU_SCREENS.CREATE_ROOM) {
      if (hit.type === 'round' && !this.busy) {
        this.roomDraft.maxRounds = hit.maxRounds;
      } else if (hit.type === 'repeat-round' && !this.busy) {
        this.roomDraft.repeatRound = !this.roomDraft.repeatRound;
      } else if (hit.type === 'wash-twice' && !this.busy) {
        this.roomDraft.washTwice = !this.roomDraft.washTwice;
      } else if (hit.type === 'pay-type' && !this.busy) {
        this.roomDraft.payType = hit.payType;
      } else if (hit.type === 'create-back' && !this.busy) {
        this.showStartHome(this.lobby.profile || this.startProfile || {});
        this.onSelect('returnStartHome');
      } else if (hit.type === 'create-next' && !this.busy) {
        this.setBusy(true);
        this.status = '正在创建房间…';
        this.onSelect('confirmCreateRoom', this.getRoomDraft());
      }
      return;
    }
    if (this.screen === MENU_SCREENS.WAITING_ROOM) {
      if (hit.type === 'swap-modal-cancel') {
        this.waiting.swapModal = null;
      } else if (hit.type === 'swap-modal-send') {
        this.status = '已发送换座请求，等待对方确认';
        this.onSelect('seatSwapRequest', { player: hit.player || {} });
        this.waiting.swapModal = null;
      } else if (hit.type === 'swap-modal-accept') {
        this.status = '已同意换座，等待同步座位';
        this.onSelect('seatSwapRespond', { requestId: hit.requestId || '', accept: true });
        this.waiting.swapModal = null;
      } else if (hit.type === 'swap-modal-reject') {
        this.status = '已拒绝换座请求';
        this.onSelect('seatSwapRespond', { requestId: hit.requestId || '', accept: false });
        this.waiting.swapModal = null;
      } else if (hit.type === 'swap-target' && !this.busy) {
        this.waiting.swapModal = { type: 'request', player: hit.player || {} };
      } else if (hit.type === 'ready' && !this.busy) this.onSelect('roomReady', { ready: hit.ready });
      else if (hit.type === 'invite' && !this.busy) this.onSelect('roomInvite');
      else if (hit.type === 'start-room' && !this.busy) this.onSelect('roomStart');
      else if (hit.type === 'disband-room' && !this.busy) this.onSelect('roomDisband');
      else if (hit.type === 'waiting-retry' && !this.busy) this.onSelect('waitingRetry');
      return;
    }
    if (this.screen === MENU_SCREENS.LOBBY) {
      if (hit.type === 'open-create-room-settings' && !this.busy) {
        this.showCreateRoomSettings();
        this.onSelect('openCreateRoomSettings', this.getRoomDraft());
        return;
      }
      if (hit.type === 'retry' && !this.busy) {
        this.onSelect('lobbyRetry');
      }
      return;
    }
    if (this.busy) return;
    if (hit && hit.mode === 'start' && !hit.disabled) {
      this.setBusy(true);
      this.setStartAuthState('logging-in', { profile: this.startProfile });
      this.onSelect('startReady', this.startProfile);
      return;
    }
    if (hit && hit.mode === 'login' && !hit.disabled) {
      this.handleOnlineTouch();
    }
  }

  handleTouchMove(event) {
    if (!this.active || this.screen !== MENU_SCREENS.CREATE_ROOM) return;
    if (!this.createSettingsTouchActive) return;
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    const metrics = getRenderMetrics();
    if (!metrics) return;
    const layout = this.getDesignLayout(metrics);
    const delta = (this.lastTouchY - touch.clientY) / layout.scale;
    this.lastTouchY = touch.clientY;
    if (Math.abs(delta) < 1) return;
    this.createSettingsScrollY = this.clampCreateSettingsScroll(this.createSettingsScrollY + delta);
  }

  handleTouchEnd() {
    this.lastTouchY = 0;
    this.createSettingsTouchActive = false;
  }

  handleOnlineTouch() {
    if (this.checkingProfile) return;
    this.checkingProfile = true;
    this.setStartAuthState('checking');
    getAuthorizedProfile()
      .then((profile) => {
        if (profile) {
          this.updateStartProfile(profile);
          this.destroyProfileButton();
          this.setStartAuthState('logging-in', { profile });
          this.onSelect('startReady', profile);
          return;
        }
        if (this.profileButton) {
          try {
            if (typeof this.profileButton.show === 'function') this.profileButton.show();
          } catch (err) {
            console.warn('[profile] show authorization button failed', err);
            this.destroyProfileButton();
            this.setStartAuthState('error', { error: '微信登录不可用，请稍后重试' });
            return;
          }
          this.setStartAuthState('login-required');
          return;
        }
        this.setStartAuthState('error', { error: '微信登录不可用，请稍后重试' });
      })
      .catch(() => {
        this.setStartAuthState('error', { error: '微信登录失败，请重试' });
      })
      .finally(() => {
        this.checkingProfile = false;
      });
  }

  destroyProfileButton() {
    if (this.profileButton && typeof this.profileButton.destroy === 'function') {
      this.profileButton.destroy();
    }
    this.profileButton = null;
    this.profileButtonSignature = '';
  }

  syncProfileButton() {
    if (this.screen !== MENU_SCREENS.START) {
      this.destroyProfileButton();
      return;
    }
    const loginButton = this.buttons.find((button) => button.mode === 'login');
    const needsLoginButton = this.authState === 'login-required' || this.authState === 'error';
    if (!this.active || this.busy || !needsLoginButton || !loginButton) {
      this.destroyProfileButton();
      return;
    }
    const signature = [loginButton.x, loginButton.y, loginButton.w, loginButton.h].join(':');
    if (this.profileButton && signature === this.profileButtonSignature) return;
    this.destroyProfileButton();
    this.profileButton = createUserProfileButton(loginButton, (profile) => {
      if (!profile || (!profile.nickName && !profile.avatarUrl)) {
        this.setStartAuthState('error', { error: '没有获取到头像和昵称，请重试' });
        return;
      }
      this.updateStartProfile(profile);
      this.destroyProfileButton();
      this.setStartAuthState('logging-in', { profile });
      if (typeof this.onSelect === 'function') this.onSelect('startReady', profile);
    });
    this.profileButtonSignature = this.profileButton ? signature : '';
  }

  render(ctx) {
    if (!this.active) return;
    const metrics = getRenderMetrics();
    if (!metrics) {
      this.buttons = [];
      this.destroyProfileButton();
      return;
    }
    if (this.screen === MENU_SCREENS.LOBBY) {
      this.renderLobby(ctx, metrics);
      return;
    }
    if (this.screen === MENU_SCREENS.CREATE_ROOM) {
      this.renderCreateRoomSettings(ctx, metrics);
      return;
    }
    if (this.screen === MENU_SCREENS.SEAT_SELECTION) {
      this.showCreateRoomSettings();
      this.renderCreateRoomSettings(ctx, metrics);
      return;
    }
    if (this.screen === MENU_SCREENS.WAITING_ROOM) {
      this.renderWaitingRoom(ctx, metrics);
      return;
    }
    const bounds = metrics.safeAreaBounds || { x: 0, y: 0, width: metrics.width, height: metrics.height };
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    ctx.save();
    this.drawHallBackground(ctx, metrics, 'rgba(13, 18, 28, 0.82)');
    this.drawStartProfile(ctx, bounds);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const sloganY = 0;
    const sloganOptions = {
      fallbackText: '上大人 · 花牌',
      fallbackFont: 'bold 40px sans-serif',
      fallbackY: bounds.y + 82,
      maxWidthRatio: 0.56,
      maxWidth: 520,
      maxHeight: 124,
    };
    const sloganSize = this.getFittedImageSize('slogan', bounds, sloganOptions, 3);
    const sloganHeight = this.drawSlogan(ctx, centerX, sloganY, bounds, sloganOptions);
    const flowers = this.drawStartFlowers(ctx, centerX, sloganY + sloganHeight-20, bounds, sloganSize.width * 0.8);

    const startButton = this.getStartButtonBounds(bounds);
    const ready = this.authState === 'ready';
    const loading = this.authState === 'checking' || this.authState === 'logging-in';
    const defs = [{
      mode: ready ? 'start' : 'login',
      label: ready ? '开始' : (loading ? '登录中' : '登录'),
      fill: ready ? '#d92d20' : '#a34722',
      disabled: loading,
    }];

    this.buttons = defs.map((def, index) => {
      const x = centerX - startButton.width / 2;
      const y = flowers.bottom - 25 + index * startButton.height;
      this.drawStartButton(ctx, x, y, startButton.width, startButton.height, def);
      return { mode: def.mode, disabled: def.disabled, x, y, w: startButton.width, h: startButton.height };
    });
    this.syncProfileButton();

    if (this.status) {
      ctx.fillStyle = '#ffd27a';
      ctx.font = '22px sans-serif';
      ctx.fillText(this.status, centerX, centerY + 150);
    }
    ctx.restore();
  }

  loadAvatar(url) {
    if (!url) {
      this.avatarUrl = '';
      this.avatarImage = null;
      this.avatarLoaded = false;
      return;
    }
    if (url === this.avatarUrl || typeof wx === 'undefined' || !wx.createImage) return;
    this.avatarUrl = url;
    this.avatarLoaded = false;
    try {
      const image = wx.createImage();
      image.onload = () => { this.avatarLoaded = true; };
      image.onerror = () => { this.avatarLoaded = false; };
      image.src = url;
      this.avatarImage = image;
    } catch (err) {
      this.avatarImage = null;
      this.avatarLoaded = false;
    }
  }

  updateStartProfile(profile = {}) {
    this.startProfile = Object.assign({ nickName: '玩家', avatarUrl: '' }, profile);
    this.loadAvatar(this.startProfile.avatarUrl);
  }

  drawAvatar(ctx, x, y, size, profile = {}) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = '#f2c94c';
    ctx.fill();
    if (this.avatarImage && this.avatarLoaded) {
      ctx.clip();
      ctx.drawImage(this.avatarImage, x, y, size, size);
    } else {
      ctx.fillStyle = '#1d2939';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const name = profile.nickName || '玩家';
      ctx.fillText(name.slice(0, 1), x + size / 2, y + size / 2);
    }
    ctx.restore();
  }

  drawStartProfile(ctx, bounds) {
    const profile = Object.assign({ nickName: '玩家', avatarUrl: '' }, this.startProfile || {});
    const avatarSize = Math.min(64, Math.max(52, bounds.height * 0.12));
    const avatarX = 20;
    const avatarY = bounds.y + 20;
    const nameBgW = Math.min(75, Math.max(56, bounds.width * 0.09));
    const nameBgH = Math.round(nameBgW * 0.2);
    const nameBgX = avatarX + avatarSize + 2;
    const nameBgY = avatarY + Math.round((avatarSize - nameBgH) / 2);
    const nicknameBg = this.assets && this.assets.getImage ? this.assets.getImage('nicknameBg') : null;
    const avatarBorder = this.assets && this.assets.getImage ? this.assets.getImage('avatarBorder') : null;

    if (nicknameBg && nicknameBg.width && nicknameBg.height) {
      ctx.drawImage(nicknameBg, nameBgX, nameBgY, nameBgW, nameBgH);
    } else {
      ctx.fillStyle = 'rgba(74, 25, 12, 0.78)';
      this.roundRect(ctx, nameBgX, nameBgY, nameBgW, nameBgH, 8);
      ctx.fill();
    }

    const innerInset = Math.round(avatarSize * 0.12);
    const innerX = avatarX + innerInset;
    const innerY = avatarY + innerInset;
    const innerSize = avatarSize - innerInset * 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, innerSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = '#f2c94c';
    ctx.fill();
    if (this.avatarImage && this.avatarLoaded) {
      ctx.clip();
      ctx.drawImage(this.avatarImage, innerX, innerY, innerSize, innerSize);
    } else {
      ctx.fillStyle = '#4b1f12';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((profile.nickName || '玩家').slice(0, 1), avatarX + avatarSize / 2, avatarY + avatarSize / 2);
    }
    ctx.restore();

    if (avatarBorder && avatarBorder.width && avatarBorder.height) {
      ctx.drawImage(avatarBorder, avatarX, avatarY, avatarSize, avatarSize);
    } else {
      ctx.strokeStyle = '#f7d57a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 - 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = '#fff4d0';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const name = profile.nickName || '玩家';
    ctx.fillText(name.slice(0, 7), nameBgX + nameBgW / 2, nameBgY + nameBgH / 2);
  }

  drawHallBackground(ctx, metrics, fallbackFill = 'rgba(13, 18, 28, 0.86)') {
    const image = this.assets && this.assets.getImage ? this.assets.getImage('hall') : null;
    if (!image || !image.width || !image.height) {
      ctx.fillStyle = fallbackFill;
      ctx.fillRect(0, 0, metrics.width, metrics.height);
      return;
    }

    const imageRatio = image.width / image.height;
    const canvasRatio = metrics.width / metrics.height;
    let sx = 0;
    let sy = 0;
    let sw = image.width;
    let sh = image.height;
    if (imageRatio > canvasRatio) {
      sw = image.height * canvasRatio;
      sx = (image.width - sw) / 2;
    } else {
      sh = image.width / canvasRatio;
      sy = (image.height - sh) / 2;
    }
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, metrics.width, metrics.height);
    ctx.fillStyle = 'rgba(13, 18, 28, 0.28)';
    ctx.fillRect(0, 0, metrics.width, metrics.height);
  }

  drawSlogan(ctx, centerX, y, bounds, options = {}) {
    const image = this.assets && this.assets.getImage ? this.assets.getImage('slogan') : null;
    if (!image || !image.width || !image.height) {
      ctx.fillStyle = '#f7f3e8';
      ctx.font = options.fallbackFont || 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(options.fallbackText || '在线大厅', centerX, options.fallbackY || y + 24);
      return 48;
    }

    const size = this.getFittedImageSize('slogan', bounds, options, image.width / image.height);
    ctx.drawImage(image, centerX - size.width / 2, y, size.width, size.height);
    return size.height;
  }

  drawLobbyTitle(ctx, centerX, top, bounds) {
    return this.drawSlogan(ctx, centerX, top, bounds, { fallbackText: '在线大厅' });
  }

  getFittedImageSize(name, bounds, options = {}, fallbackRatio = 1) {
    const image = this.assets && this.assets.getImage ? this.assets.getImage(name) : null;
    const ratio = image && image.width && image.height ? image.width / image.height : fallbackRatio;
    const maxW = Math.min(options.maxWidth || 430, bounds.width * (options.maxWidthRatio || 0.46));
    const maxH = options.maxHeight || Infinity;
    let width = maxW;
    let height = width / ratio;
    if (height > maxH) {
      height = maxH;
      width = height * ratio;
    }
    return { width, height };
  }

  drawStartFlowers(ctx, centerX, y, bounds, targetWidth = 0) {
    const image = this.assets && this.assets.getImage ? this.assets.getImage('flowers') : null;
    const ratio = image && image.width && image.height ? image.width / image.height : 900 / 546;
    const width = targetWidth || Math.min(310, bounds.width * 0.36);
    const height = width / ratio;
    const x = centerX - width / 2;
    if (image && image.width && image.height) {
      ctx.drawImage(image, x, y, width, height);
    }
    return { x, y, width, height, bottom: y + height };
  }

  getStartButtonBounds(bounds) {
    const image = this.assets && this.assets.getImage ? this.assets.getImage('startButton') : null;
    if (!image || !image.width || !image.height) {
      return {
        width: Math.min(320, bounds.width * 0.6),
        height: 64,
      };
    }

    const maxW = Math.min(340, bounds.width * 0.48);
    const maxH = 118;
    const ratio = image.width / image.height;
    let width = maxW;
    let height = width / ratio;
    if (height > maxH) {
      height = maxH;
      width = height * ratio;
    }
    return { width: width * 0.6, height: height * 0.6 };
  }

  drawStartButton(ctx, x, y, width, height, def) {
    const image = this.assets && this.assets.getImage ? this.assets.getImage('startButton') : null;
    if (image && image.width && image.height) {
      ctx.save();
      if (def.disabled) ctx.globalAlpha = 0.62;
      ctx.drawImage(image, x, y, width, height);
      ctx.restore();
      if (def.label && def.label !== '开始') {
        ctx.fillStyle = '#fff6d9';
        ctx.font = `bold ${Math.max(18, Math.round(height * 0.34))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(def.label, x + width / 2, y + height / 2);
      }
      return;
    }

    ctx.fillStyle = def.disabled ? 'rgba(163, 71, 34, 0.68)' : def.fill;
    this.roundRect(ctx, x, y, width, height, 14);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(def.label, x + width / 2, y + height / 2);
  }

  getDesignLayout(metrics) {
    const bounds = metrics.safeAreaBounds || { x: 0, y: 0, width: metrics.width, height: metrics.height };
    const scale = Math.min(bounds.width / 1560, bounds.height / 878);
    const width = 1560 * scale;
    const height = 878 * scale;
    return {
      scale,
      x: bounds.x + (bounds.width - width) / 2,
      y: bounds.y + (bounds.height - height) / 2,
      width,
      height,
    };
  }

  designX(layout, x) {
    return layout.x + x * layout.scale;
  }

  designY(layout, y) {
    return layout.y + y * layout.scale;
  }

  designSize(layout, size) {
    return size * layout.scale;
  }

  pushDesignButton(type, layout, x, y, w, h, extra = {}) {
    this.buttons.push(Object.assign({
      type,
      x: this.designX(layout, x),
      y: this.designY(layout, y),
      w: this.designSize(layout, w),
      h: this.designSize(layout, h),
    }, extra));
  }

  drawDesignText(ctx, layout, text, x, y, size, color, weight = 'normal', align = 'left', baseline = 'top') {
    const readableSize = size * 1.22;
    ctx.fillStyle = color;
    ctx.font = `${weight} ${this.designSize(layout, readableSize)}px sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(text, this.designX(layout, x), this.designY(layout, y));
  }

  drawDesignRect(ctx, layout, x, y, w, h, radius, fillStyle, strokeStyle = '', lineWidth = 1) {
    ctx.beginPath();
    this.roundRect(
      ctx,
      this.designX(layout, x),
      this.designY(layout, y),
      this.designSize(layout, w),
      this.designSize(layout, h),
      this.designSize(layout, radius)
    );
    ctx.fillStyle = fillStyle;
    ctx.fill();
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = Math.max(1, this.designSize(layout, lineWidth));
      ctx.stroke();
    }
  }

  drawDesignLine(ctx, layout, x, y, w) {
    ctx.strokeStyle = 'rgba(217, 167, 90, 0.42)';
    ctx.lineWidth = Math.max(1, this.designSize(layout, 1));
    ctx.beginPath();
    ctx.moveTo(this.designX(layout, x), this.designY(layout, y));
    ctx.lineTo(this.designX(layout, x + w), this.designY(layout, y));
    ctx.stroke();
  }

  getCreateSettingsViewport() {
    return { x: 450, y: 190, w: 660, h: 435 };
  }

  isInsideCreateSettingsViewport(touch) {
    const metrics = getRenderMetrics();
    if (!metrics || !touch) return false;
    const layout = this.getDesignLayout(metrics);
    const viewport = this.getCreateSettingsViewport();
    const rect = this.designRect(layout, viewport);
    return touch.clientX >= rect.x
      && touch.clientX <= rect.x + rect.w
      && touch.clientY >= rect.y
      && touch.clientY <= rect.y + rect.h;
  }

  getCreateSettingsContentBounds() {
    return { top: 204, bottom: 660, padding: 48 };
  }

  getCreateSettingsMaxScroll() {
    const viewport = this.getCreateSettingsViewport();
    const content = this.getCreateSettingsContentBounds();
    return Math.max(0, content.bottom + content.padding - (viewport.y + viewport.h));
  }

  clampCreateSettingsScroll(value) {
    return Math.max(0, Math.min(this.getCreateSettingsMaxScroll(), value || 0));
  }

  designRect(layout, rect) {
    return {
      x: this.designX(layout, rect.x),
      y: this.designY(layout, rect.y),
      w: this.designSize(layout, rect.w),
      h: this.designSize(layout, rect.h),
    };
  }

  intersectsRect(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  drawTableBackground(ctx, metrics) {
    const image = this.assets && this.assets.getImage ? this.assets.getImage('table') : null;
    if (!image || !image.width || !image.height) {
      ctx.fillStyle = '#692811';
      ctx.fillRect(0, 0, metrics.width, metrics.height);
      return;
    }

    const imageRatio = image.width / image.height;
    const canvasRatio = metrics.width / metrics.height;
    let sx = 0;
    let sy = 0;
    let sw = image.width;
    let sh = image.height;
    if (imageRatio > canvasRatio) {
      sw = image.height * canvasRatio;
      sx = (image.width - sw) / 2;
    } else {
      sh = image.width / canvasRatio;
      sy = (image.height - sh) / 2;
    }
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, metrics.width, metrics.height);
    ctx.fillStyle = 'rgba(18, 6, 4, 0.60)';
    ctx.fillRect(0, 0, metrics.width, metrics.height);
  }

  drawRoomFlowHeader(ctx, layout, title, subtitle) {
    this.drawDesignRect(ctx, layout, 630, 40, 300, 94, 4, 'rgba(49, 18, 10, 0.80)');
    this.drawDesignText(ctx, layout, title, 780, 58, 35, '#fff2c7', 'bold', 'center', 'top');
    this.drawDesignText(ctx, layout, subtitle, 780, 103, 18, '#e7c17a', 'normal', 'center', 'top');
  }

  drawRoomFlowPanel(ctx, layout, x, y, w, h) {
    this.drawDesignRect(
      ctx,
      layout,
      x,
      y,
      w,
      h,
      10,
      'rgba(49, 18, 10, 0.86)',
      'rgba(217, 167, 90, 0.74)',
      2
    );
  }

  drawCheckbox(ctx, layout, x, y, label, checked, type, extra = {}) {
    this.drawDesignRect(
      ctx,
      layout,
      x,
      y,
      44,
      44,
      7,
      checked ? '#e04822' : 'rgba(255, 255, 255, 0.08)',
      checked ? '#ffd27a' : 'rgba(217, 167, 90, 0.48)',
      2
    );
    if (checked) {
      this.drawDesignText(ctx, layout, '✓', x + 22, y + 22, 34, '#fff6d9', 'bold', 'center', 'middle');
    }
    this.drawDesignText(ctx, layout, label, x + 58, y + 22, 30, '#fff2c7', '500', 'left', 'middle');
    this.pushDesignButton(type, layout, x, y - 8, 116, 60, extra);
  }

  drawOptionToggle(ctx, layout, x, y, label, hint, checked, type, extra = {}) {
    this.drawDesignRect(ctx, layout, x, y, 44, 44, 6, checked ? '#e04822' : 'rgba(255, 255, 255, 0.10)');
    if (checked) this.drawDesignText(ctx, layout, '✓', x + 22, y + 22, 32, '#fff6d9', 'bold', 'center', 'middle');
    this.drawDesignText(ctx, layout, label, x + 58, y + 9, 27, '#fff2c7', '500', 'left', 'middle');
    this.drawDesignText(ctx, layout, hint, x + 58, y + 36, 16, '#caa879', 'normal', 'left', 'middle');
    this.pushDesignButton(type, layout, x, y - 8, 190, 64, extra);
  }

  drawChoiceButton(ctx, layout, x, y, w, label, selected, type, extra = {}) {
    this.drawDesignRect(
      ctx,
      layout,
      x,
      y,
      w,
      58,
      6,
      selected ? '#e04822' : 'rgba(255, 255, 255, 0.10)',
      selected ? '#ffd27a' : 'rgba(217, 167, 90, 0.20)',
      selected ? 1.5 : 1
    );
    this.drawDesignText(ctx, layout, label, x + w / 2, y + 29, 26, selected ? '#fff6d9' : '#dfc18b', '500', 'center', 'middle');
    this.pushDesignButton(type, layout, x, y, w, 58, extra);
  }

  drawFooterButton(ctx, layout, x, y, w, label, primary, type) {
    this.drawDesignRect(
      ctx,
      layout,
      x,
      y,
      w,
      64,
      8,
      primary ? '#e04822' : 'rgba(255, 255, 255, 0.14)',
      primary ? '#ffd27a' : 'rgba(217, 167, 90, 0.32)',
      primary ? 1.5 : 1
    );
    this.drawDesignText(ctx, layout, label, x + w / 2, y + 32, 28, primary ? '#fff6d9' : '#e7c17a', 'bold', 'center', 'middle');
    this.pushDesignButton(type, layout, x, y, w, 64);
  }

  renderCreateRoomSettings(ctx, metrics) {
    const layout = this.getDesignLayout(metrics);
    const draft = this.roomDraft;
    this.buttons = [];
    this.destroyProfileButton();

    ctx.save();
    this.drawTableBackground(ctx, metrics);
    this.drawRoomFlowHeader(ctx, layout, '创建房间', '选择规则后进入等待房间');
    this.drawRoomFlowPanel(ctx, layout, 410, 156, 740, 511);

    const viewport = this.getCreateSettingsViewport();
    const scrollY = this.clampCreateSettingsScroll(this.createSettingsScrollY);
    this.createSettingsScrollY = scrollY;
    const contentButtonStart = this.buttons.length;
    const yOf = (value) => value - scrollY;
    ctx.save();
    const clip = this.designRect(layout, viewport);
    ctx.beginPath();
    ctx.rect(clip.x, clip.y, clip.w, clip.h);
    ctx.clip();

    this.drawDesignText(ctx, layout, '选择局数', 476, yOf(204), 31, '#ffd78a', 'bold');
    this.drawCheckbox(ctx, layout, 476, yOf(271), '1局', draft.maxRounds === 1, 'round', { maxRounds: 1, scrollContent: true });
    this.drawCheckbox(ctx, layout, 608, yOf(271), '2局', draft.maxRounds === 2, 'round', { maxRounds: 2, scrollContent: true });
    this.drawCheckbox(ctx, layout, 740, yOf(271), '4局', draft.maxRounds === 4, 'round', { maxRounds: 4, scrollContent: true });
    this.drawCheckbox(ctx, layout, 872, yOf(271), '6局', draft.maxRounds === 6, 'round', { maxRounds: 6, scrollContent: true });

    this.drawDesignLine(ctx, layout, 476, yOf(376), 604);
    this.drawDesignText(ctx, layout, '房间选项', 476, yOf(398), 31, '#ffd78a', 'bold');
    this.drawOptionToggle(ctx, layout, 476, yOf(446), '重场', '可以计算重场', draft.repeatRound, 'repeat-round', { scrollContent: true });
    this.drawOptionToggle(ctx, layout, 691, yOf(446), '洗两道', '开局前执行两道洗牌', draft.washTwice, 'wash-twice', { scrollContent: true });

    this.drawDesignLine(ctx, layout, 476, yOf(536), 604);
    this.drawDesignText(ctx, layout, '进圈赔付方式', 476, yOf(556), 31, '#ffd78a', 'bold');
    this.drawChoiceButton(ctx, layout, 476, yOf(602), 170, '屁胡', draft.payType === 'pihu', 'pay-type', { payType: 'pihu', scrollContent: true });
    this.drawChoiceButton(ctx, layout, 695, yOf(602), 170, '甲胡', draft.payType === 'jiahu', 'pay-type', { payType: 'jiahu', scrollContent: true });
    this.drawChoiceButton(ctx, layout, 910, yOf(602), 170, '场胡', draft.payType === 'changhu', 'pay-type', { payType: 'changhu', scrollContent: true });
    ctx.restore();

    const clipButtonRect = this.designRect(layout, viewport);
    this.buttons = this.buttons.filter((button, index) => (
      index < contentButtonStart
      || !button.scrollContent
      || this.intersectsRect(button, clipButtonRect)
    ));

    this.drawFooterButton(ctx, layout, 704, 744, 212, '返回', false, 'create-back');
    this.drawFooterButton(ctx, layout, 938, 744, 212, '确认创建', true, 'create-next');

    if (this.status) {
      this.drawDesignText(ctx, layout, this.status, 780, 690, 18, '#ffd27a', 'normal', 'center');
    }
    ctx.restore();
  }

  renderSeatSelection(ctx, metrics) {
    const layout = this.getDesignLayout(metrics);
    const selectedSeat = this.roomDraft.seat || 'south';
    this.buttons = [];
    this.destroyProfileButton();

    ctx.save();
    this.drawTableBackground(ctx, metrics);
    this.drawRoomFlowHeader(ctx, layout, '选择座位', '请选择自己的位置');
    this.drawRoomFlowPanel(ctx, layout, 532, 156, 511, 511);

    this.drawSeatRing(ctx, layout);
    this.drawSeatOption(ctx, layout, 'north', 748, 187, '北位', '空座', selectedSeat === 'north');
    this.drawSeatOption(ctx, layout, 'west', 577, 362, '西位', '空座', selectedSeat === 'west');
    this.drawSeatOption(ctx, layout, 'east', 919, 362, '东位', '阿坤', selectedSeat === 'east');
    this.drawSeatOption(ctx, layout, 'south', 748, 537, '南位', selectedSeat === 'south' ? '已选择' : '空座', selectedSeat === 'south');

    this.drawFooterButton(ctx, layout, 639, 744, 150, '上一步', false, 'seat-back');
    this.drawFooterButton(ctx, layout, 833, 744, 210, '确认入座', true, 'seat-confirm');

    if (this.status) {
      this.drawDesignText(ctx, layout, this.status, 780, 700, 18, '#ffd27a', 'normal', 'center');
    }
    ctx.restore();
  }

  drawSeatRing(ctx, layout) {
    const cx = this.designX(layout, 788);
    const cy = this.designY(layout, 412);
    const outer = this.designSize(layout, 100);
    const inner = this.designSize(layout, 52);
    ctx.strokeStyle = 'rgba(217, 167, 90, 0.50)';
    ctx.lineWidth = Math.max(1, this.designSize(layout, 1));
    ctx.beginPath();
    ctx.arc(cx, cy, outer, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(217, 167, 90, 0.30)';
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.stroke();
    this.drawDesignText(ctx, layout, '你的位置', 788, 390, 25, '#fff2c7', 'bold', 'center');
    this.drawDesignText(ctx, layout, '点击座位加入', 788, 428, 17, '#e7c17a', 'normal', 'center');
  }

  drawSeatOption(ctx, layout, seat, x, y, label, status, selected) {
    this.drawDesignRect(
      ctx,
      layout,
      x,
      y,
      80,
      100,
      6,
      selected ? '#e04822' : 'rgba(255, 255, 255, 0.10)',
      selected ? '#ffd27a' : 'rgba(217, 167, 90, 0.18)',
      selected ? 1.5 : 1
    );
    this.drawDesignText(ctx, layout, label, x + 40, y + 31, 23, '#fff2c7', 'bold', 'center', 'middle');
    this.drawDesignText(ctx, layout, status, x + 40, y + 62, 16, selected ? '#ffe0a3' : '#caa879', 'normal', 'center', 'middle');
    this.pushDesignButton('seat', layout, x, y, 80, 100, { seat });
  }

  renderLobby(ctx, metrics) {
    const bounds = metrics.safeAreaBounds || { x: 0, y: 0, width: metrics.width, height: metrics.height };
    const centerX = bounds.x + bounds.width / 2;
    const top = bounds.y + 20;
    const profile = this.lobby.profile || {};
    const state = this.lobby.state;
    this.buttons = [];
    this.destroyProfileButton();

    ctx.save();
    this.drawHallBackground(ctx, metrics);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const titleHeight = this.drawLobbyTitle(ctx, centerX, top, bounds);

    const avatarSize = 90;
    const avatarX = centerX - avatarSize / 2;
    const avatarY = top + titleHeight + 24;
    this.drawAvatar(ctx, avatarX, avatarY, avatarSize, profile);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(profile.nickName || '玩家', centerX, avatarY + avatarSize + 28);

    const statusText = this.lobby.error
      || (state === 'checking-room' ? '正在检查已有房间…'
        : (state === 'reconnecting' ? '正在进入房间…'
          : (state === 'creating' ? '正在创建房间…' : '')));
    if (statusText) {
      ctx.fillStyle = state === 'error' ? '#ffb4a8' : '#ffd27a';
      ctx.font = '22px sans-serif';
      ctx.fillText(statusText, centerX, avatarY + avatarSize + 68);
    }

    if (state === 'idle') {
      const btnW = Math.min(300, bounds.width * 0.68);
      const btnH = 60;
      const btnX = centerX - btnW / 2;
      const btnY = avatarY + avatarSize + 118;
      ctx.fillStyle = '#d92d20';
      this.roundRect(ctx, btnX, btnY, btnW, btnH, 12);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 25px sans-serif';
      ctx.fillText('创建房间', centerX, btnY + btnH / 2);
      this.buttons.push({ type: 'open-create-room-settings', x: btnX, y: btnY, w: btnW, h: btnH });
    }

    if (state === 'error') {
      const retryW = Math.min(240, bounds.width * 0.56);
      const retryH = 50;
      const retryX = centerX - retryW / 2;
      const retryY = bounds.y + bounds.height - retryH - 34;
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      this.roundRect(ctx, retryX, retryY, retryW, retryH, 10);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('重试', centerX, retryY + retryH / 2);
      this.buttons.push({ type: 'retry', x: retryX, y: retryY, w: retryW, h: retryH });
    }

    ctx.restore();
  }

  renderWaitingRoom(ctx, metrics) {
    const layout = this.getDesignLayout(metrics);
    const room = this.waiting.room || {};
    const players = Array.isArray(room.players) ? room.players : [];
    const mySeat = typeof room.yourSeat === 'number' ? room.yourSeat : 0;
    const mine = players.find((player) => player.seat === mySeat) || {};
    this.buttons = [];
    this.destroyProfileButton();
    this.loadWaitingAvatars(players);

    ctx.save();
    this.drawTableBackground(ctx, metrics);
    this.drawWaitingHeader(ctx, layout, room, players);
    this.drawRoomFlowPanel(ctx, layout, 532, 156, 511, 511);
    this.drawWaitingSeatBoard(ctx, layout, room, players, mySeat);
    this.drawWaitingActions(ctx, layout, room, mine);

    const errorText = this.waiting.error || '';
    const request = room.swapRequest || null;
    const statusText = errorText
      || this.status
      || (request && request.direction === 'outgoing' ? '换座请求已发送，等待对方确认'
        : (room.readyToStart ? '全员已准备，等待房主开局' : '微信邀请进入后自动分配空座位'));
    this.drawDesignText(ctx, layout, statusText, 780, 824, 20, errorText ? '#ffb4a8' : '#ffd78a', '500', 'center');

    if (this.waiting.swapModal) this.drawSeatSwapModal(ctx, layout, this.waiting.swapModal);

    ctx.restore();
  }

  drawWaitingHeader(ctx, layout, room, players) {
    const settings = room.settings || {};
    const maxRounds = settings.maxRounds || room.maxRounds || 2;
    const payName = settings.payType === 'jiahu' ? '甲胡' : (settings.payType === 'changhu' ? '场胡' : '屁胡');
    const ruleTags = [
      `${maxRounds}局`,
      settings.repeatRound ? '重场' : '',
      settings.washTwice ? '洗两道' : '',
      payName,
    ].filter(Boolean).join(' · ');
    this.drawDesignRect(ctx, layout, 430, 16, 700, 104, 8, 'rgba(49, 18, 10, 0.72)', 'rgba(217, 167, 90, 0.82)', 1.2);
    this.drawDesignText(ctx, layout, '等待...', 780, 36, 36, '#fff2c7', 'bold', 'center');
    this.drawDesignText(ctx, layout, `房号 ${room.roomId || '------'} · ${ruleTags || '屁胡'}`, 780, 86, 20, '#e7c17a', '500', 'center');
  }

  drawWaitingSeatBoard(ctx, layout, room, players, mySeat) {
    const cx = this.designX(layout, 788);
    const cy = this.designY(layout, 411);
    ctx.strokeStyle = 'rgba(217, 167, 90, 0.58)';
    ctx.lineWidth = Math.max(1, this.designSize(layout, 2));
    ctx.beginPath();
    ctx.arc(cx, cy, this.designSize(layout, 100), 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(217, 167, 90, 0.34)';
    ctx.beginPath();
    ctx.arc(cx, cy, this.designSize(layout, 59), 0, Math.PI * 2);
    ctx.stroke();
    this.drawDesignText(ctx, layout, '你的位置', 788, 390, 25, '#fff2c7', 'bold', 'center');
    this.drawDesignText(ctx, layout, '点击座位加入', 788, 428, 16, '#e7c17a', 'normal', 'center');

    const playerForLocal = (localSeat) => players.find((player) => (
      player && typeof player.seat === 'number' && ((player.seat - mySeat + 4) % 4) === localSeat
    ));
    [
      { local: 2, x: 736, y: 188, relation: '对家' },
      { local: 3, x: 564, y: 362, relation: '下家' },
      { local: 1, x: 907, y: 362, relation: '上家' },
      { local: 0, x: 736, y: 538, relation: '我的位置' },
    ].forEach((slot) => {
      const player = playerForLocal(slot.local);
      this.drawWaitingSeatCard(ctx, layout, Object.assign({}, slot, {
        label: this.waitingSeatName(player && player.seat, mySeat, slot.local),
        player,
        isSelf: slot.local === 0,
      }));
    });
  }

  drawWaitingSeatCard(ctx, layout, slot) {
    const player = slot.player || null;
    const isReady = Boolean(player && player.ready);
    const isEmpty = !player;
    const avatarX = slot.x + 13;
    const avatarY = slot.y;
    this.drawWaitingAvatar(ctx, layout, avatarX, avatarY, player, isEmpty, slot.isSelf, isReady);
    this.drawDesignText(ctx, layout, player ? (player.nickName || '玩家') : '空座位', slot.x + 52, slot.y + 96, 20, isEmpty ? '#d8b47b' : '#fff0be', 'bold', 'center', 'middle');
    if (player) {
      const statusLabel = slot.isSelf ? (isReady ? '已选择' : '未准备') : (isReady ? '已准备' : '未准备');
      this.drawSeatStatusPill(ctx, layout, avatarX + 8, avatarY + 61, statusLabel, isReady);
      if (player.isHost) this.drawTinyTag(ctx, layout, slot.x + 23, slot.y + 123, '房主');
      if (!slot.isSelf) this.pushDesignButton('swap-target', layout, slot.x, slot.y, 104, 130, { player });
    } else {
      this.drawSeatStatusPill(ctx, layout, avatarX + 8, avatarY + 61, '待加入', false);
    }
  }

  waitingSeatName(serverSeat, mySeat, localSeat) {
    const names = ['东位', '南位', '西位', '北位'];
    const index = typeof serverSeat === 'number' ? serverSeat : ((mySeat + localSeat) % 4);
    return names[index] || '座位';
  }

  loadWaitingAvatars(players = []) {
    if (typeof wx === 'undefined' || !wx.createImage) return;
    players.forEach((player) => {
      if (!player || !player.avatarUrl || this.waitingAvatarImages[player.openid]) return;
      try {
        const image = wx.createImage();
        const entry = { image, loaded: false };
        image.onload = () => { entry.loaded = true; };
        image.onerror = () => { entry.loaded = false; };
        image.src = player.avatarUrl;
        this.waitingAvatarImages[player.openid] = entry;
      } catch (err) { /* 头像加载失败时使用昵称首字 */ }
    });
  }

  drawWaitingAvatar(ctx, layout, x, y, player, isEmpty, isSelf, isReady) {
    const rect = this.designRect(layout, { x, y, w: isSelf ? 82 : 78, h: isSelf ? 82 : 78 });
    const radius = this.designSize(layout, isSelf ? 12 : 18);
    const entry = player && player.openid ? this.waitingAvatarImages[player.openid] : null;
    ctx.save();
    this.roundRect(ctx, rect.x, rect.y, rect.w, rect.h, radius);
    ctx.fillStyle = isEmpty
      ? 'rgba(107, 76, 69, 0.42)'
      : (isReady ? '#e84d23' : 'rgba(107, 76, 69, 0.72)');
    ctx.fill();
    ctx.strokeStyle = isSelf || isReady ? 'rgba(255, 220, 148, 0.58)' : 'rgba(255, 220, 148, 0.24)';
    ctx.lineWidth = Math.max(1, this.designSize(layout, 1.5));
    ctx.stroke();
    if (entry && entry.loaded && entry.image) {
      ctx.clip();
      ctx.drawImage(entry.image, rect.x, rect.y, rect.w, rect.h);
    } else {
      this.drawDesignText(ctx, layout, isEmpty ? '+' : (player.nickName || '玩').slice(0, 1), x + (isSelf ? 41 : 39), y + (isSelf ? 41 : 39), 28, '#ffe7ad', 'bold', 'center', 'middle');
    }
    ctx.restore();
  }

  drawSeatStatusPill(ctx, layout, x, y, label, ready) {
    const width = label.length > 3 ? 66 : 58;
    this.drawDesignRect(ctx, layout, x, y, width, 24, 12, ready ? '#e84d23' : 'rgba(117, 68, 34, 0.92)', ready ? '#ffd27a' : 'rgba(217, 167, 90, 0.35)', 1);
    this.drawDesignText(ctx, layout, label, x + width / 2, y + 12, 12, '#fff6d9', 'bold', 'center', 'middle');
  }

  drawTinyTag(ctx, layout, x, y, label, fill = 'rgba(125, 83, 31, 0.92)') {
    this.drawDesignRect(ctx, layout, x, y, 58, 24, 12, fill, '#dcb568', 1);
    this.drawDesignText(ctx, layout, label, x + 29, y + 12, 14, '#fff6d9', 'bold', 'center', 'middle');
  }

  drawWaitingActions(ctx, layout, room, mine) {
    this.drawDesignRect(ctx, layout, 1190, 184, 250, 466, 8, 'rgba(49, 18, 10, 0.86)', 'rgba(217, 167, 90, 0.36)', 1);
    this.drawDesignText(ctx, layout, '操作', 1220, 214, 30, '#ffd78a', 'bold');
    this.drawWaitingActionButton(ctx, layout, 1220, 278, '微信邀请好友', 'invite', true, false);
    this.drawWaitingActionButton(ctx, layout, 1220, 356, mine.ready ? '取消准备' : '准备', 'ready', true, false, { ready: !mine.ready });
    if (room.isHost) {
      this.drawWaitingActionButton(ctx, layout, 1220, 434, '开始牌局', 'start-room', Boolean(room.canStart), !room.canStart);
      this.drawDesignText(ctx, layout, room.canStart ? '全员已准备，可以开始' : '仅房主可见，全员准备后可点', 1220, 504, 16, '#e7c17a', 'normal');
      this.drawWaitingActionButton(ctx, layout, 1220, 548, '解散房间', 'disband-room', true, false, {}, '#8f1e12');
    } else {
      this.drawDesignText(ctx, layout, room.readyToStart ? '等待房主开始牌局' : '准备后等待房主开始', 1220, 452, 17, '#e7c17a', 'normal');
      this.drawWaitingActionButton(ctx, layout, 1220, 548, '退出房间', 'disband-room', true, false, {}, '#8f1e12');
    }
  }

  drawWaitingActionButton(ctx, layout, x, y, label, type, enabled = true, disabled = false, extra = {}, fill = '#d84a22') {
    const buttonFill = enabled && !disabled ? fill : 'rgba(255,255,255,0.12)';
    const stroke = enabled && !disabled ? '#ffd27a' : 'rgba(217, 167, 90, 0.20)';
    this.drawDesignRect(ctx, layout, x, y, 190, 58, 7, buttonFill, stroke, 1.5);
    this.drawDesignText(ctx, layout, label, x + 95, y + 29, 22, enabled && !disabled ? '#fff6d9' : '#b89862', 'bold', 'center', 'middle');
    if (enabled && !disabled) this.pushDesignButton(type, layout, x, y, 190, 58, extra);
  }

  drawSeatSwapModal(ctx, layout, modal) {
    const player = modal.player || {};
    const playerName = player.nickName || '该玩家';
    this.drawDesignRect(ctx, layout, 0, 0, 1560, 878, 0, 'rgba(0, 0, 0, 0.46)');
    this.drawDesignRect(ctx, layout, 514, 284, 532, 310, 10, 'rgba(64, 24, 12, 0.96)', '#d9a75a', 2);
    const received = modal.type === 'received';
    this.drawDesignText(ctx, layout, received ? '收到换座请求' : '请求交换座位', 780, 326, 31, '#fff2c7', 'bold', 'center');
    this.drawDesignText(ctx, layout, received ? `${playerName} 想与你交换座位` : `向 ${playerName} 发送交换座位请求？`, 780, 390, 22, '#ffd78a', 'bold', 'center');
    this.drawDesignText(ctx, layout, '对方同意后，双方位置立即互换。', 780, 430, 18, '#e7c17a', 'normal', 'center');
    if (received) {
      this.drawWaitingActionButton(ctx, layout, 585, 496, '拒绝', 'swap-modal-reject', true, false, { requestId: modal.requestId || '' }, 'rgba(255,255,255,0.12)');
      this.drawWaitingActionButton(ctx, layout, 785, 496, '同意交换', 'swap-modal-accept', true, false, { requestId: modal.requestId || '' });
    } else {
      this.drawWaitingActionButton(ctx, layout, 585, 496, '取消', 'swap-modal-cancel', true, false, {}, 'rgba(255,255,255,0.12)');
      this.drawWaitingActionButton(ctx, layout, 785, 496, '发送请求', 'swap-modal-send', true, false, { player });
    }
  }

  roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
}
