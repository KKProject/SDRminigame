import { getRenderMetrics } from '../render';
import {
  createUserProfileButton,
  getAuthorizedProfile,
  profileWithFallback,
  readStoredProfile,
} from '../net/profile';

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
    this.screen = 'start';
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
    };
    this.avatarImage = null;
    this.avatarUrl = '';
    this.avatarLoaded = false;
    this.startProfile = readStoredProfile(typeof wx !== 'undefined' ? wx : null);
    this.loadAvatar(this.startProfile.avatarUrl);
  }

  show() {
    if (this.active) return;
    this.active = true;
    wx.onTouchStart(this.boundTouch);
    if (wx.onTouchMove) wx.onTouchMove(this.boundTouchMove);
    if (wx.onTouchEnd) wx.onTouchEnd(this.boundTouchEnd);
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

  showLobby(profile = {}) {
    this.screen = 'lobby';
    this.busy = false;
    this.destroyProfileButton();
    this.lobby.profile = Object.assign({ nickName: '玩家', avatarUrl: '' }, profile);
    this.loadAvatar(this.lobby.profile.avatarUrl);
  }

  setLobbyState(state, detail = {}) {
    this.screen = 'lobby';
    this.busy = state === 'checking-room' || state === 'reconnecting' || state === 'creating';
    if (detail.profile) {
      this.lobby.profile = Object.assign({ nickName: '玩家', avatarUrl: '' }, detail.profile);
      this.loadAvatar(this.lobby.profile.avatarUrl);
    }
    this.lobby.state = state || '';
    this.lobby.error = detail.error || '';
  }

  showCreateRoomSettings() {
    this.screen = 'create-room-settings';
    this.busy = false;
    this.status = '';
    this.destroyProfileButton();
  }

  showSeatSelection() {
    this.screen = 'seat-selection';
    this.busy = false;
    this.status = '';
    this.destroyProfileButton();
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
    this.screen = 'room-waiting';
    this.busy = false;
    this.destroyProfileButton();
    this.waiting.profile = detail.profile || this.lobby.profile || {};
    this.waiting.room = detail.room || detail;
    this.waiting.error = detail.error || '';
  }

  setWaitingRoomState(detail = {}) {
    this.screen = 'room-waiting';
    this.busy = Boolean(detail.busy);
    if (detail.profile) this.waiting.profile = detail.profile;
    if (detail.room) this.waiting.room = detail.room;
    this.waiting.error = detail.error || '';
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
    this.createSettingsTouchActive = this.screen === 'create-room-settings'
      && this.isInsideCreateSettingsViewport(touch);
    const hit = this.buttons.find((btn) => (
      touch.clientX >= btn.x
      && touch.clientX <= btn.x + btn.w
      && touch.clientY >= btn.y
      && touch.clientY <= btn.y + btn.h
    ));
    if (!hit || typeof this.onSelect !== 'function') return;
    if (this.screen === 'create-room-settings') {
      if (hit.type === 'round' && !this.busy) {
        this.roomDraft.maxRounds = hit.maxRounds;
      } else if (hit.type === 'repeat-round' && !this.busy) {
        this.roomDraft.repeatRound = !this.roomDraft.repeatRound;
      } else if (hit.type === 'wash-twice' && !this.busy) {
        this.roomDraft.washTwice = !this.roomDraft.washTwice;
      } else if (hit.type === 'pay-type' && !this.busy) {
        this.roomDraft.payType = hit.payType;
      } else if (hit.type === 'create-back' && !this.busy) {
        this.screen = 'start';
        this.status = '';
      } else if (hit.type === 'create-next' && !this.busy) {
        this.showSeatSelection();
        this.onSelect('createRoomNext', this.getRoomDraft());
      }
      return;
    }
    if (this.screen === 'seat-selection') {
      if (hit.type === 'seat' && !this.busy) {
        this.roomDraft.seat = hit.seat;
      } else if (hit.type === 'seat-back' && !this.busy) {
        this.showCreateRoomSettings();
      } else if (hit.type === 'seat-confirm' && !this.busy) {
        this.onSelect('confirmSeatSelection', this.getRoomDraft());
      }
      return;
    }
    if (this.screen === 'room-waiting') {
      if (hit.type === 'ready' && !this.busy) this.onSelect('roomReady');
      else if (hit.type === 'invite' && !this.busy) this.onSelect('roomInvite');
      else if (hit.type === 'start-room' && !this.busy) this.onSelect('roomStart');
      else if (hit.type === 'waiting-retry' && !this.busy) this.onSelect('waitingRetry');
      return;
    }
    if (this.screen === 'lobby') {
      if (hit.type === 'round') {
        if (!this.busy) this.lobby.selectedMaxRounds = hit.maxRounds;
        return;
      }
      if (hit.type === 'create-room' && !this.busy) {
        this.onSelect('createRoom', { maxRounds: this.lobby.selectedMaxRounds });
        return;
      }
      if (hit.type === 'retry' && !this.busy) {
        this.onSelect('lobbyRetry');
      }
      return;
    }
    if (this.busy) return;
    if (hit) {
      this.showCreateRoomSettings();
      this.onSelect('openCreateRoomSettings', this.getRoomDraft());
    }
  }

  handleTouchMove(event) {
    if (!this.active || this.screen !== 'create-room-settings') return;
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
    getAuthorizedProfile()
      .then((profile) => {
        if (profile) {
          this.updateStartProfile(profile);
          this.destroyProfileButton();
          this.onSelect('online', profile);
          return;
        }
        if (this.profileButton) {
          try {
            if (typeof this.profileButton.show === 'function') this.profileButton.show();
          } catch (err) {
            console.warn('[profile] show authorization button failed', err);
            this.destroyProfileButton();
            this.onSelect('online', profileWithFallback());
            return;
          }
          this.setStatus('请点击“在线对战”并确认微信授权');
          return;
        }
        this.onSelect('online', profileWithFallback());
      })
      .catch(() => {
        this.onSelect('online', profileWithFallback());
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
    if (this.screen !== 'start') {
      this.destroyProfileButton();
      return;
    }
    const online = this.buttons.find((button) => button.mode === 'online');
    if (!this.active || this.busy || !online) {
      this.destroyProfileButton();
      return;
    }
    const signature = [online.x, online.y, online.w, online.h].join(':');
    if (this.profileButton && signature === this.profileButtonSignature) return;
    this.destroyProfileButton();
    this.profileButton = createUserProfileButton(online, (profile) => {
      this.updateStartProfile(profile);
      this.destroyProfileButton();
      if (typeof this.onSelect === 'function') this.onSelect('online', profile);
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
    if (this.screen === 'lobby') {
      this.renderLobby(ctx, metrics);
      return;
    }
    if (this.screen === 'create-room-settings') {
      this.renderCreateRoomSettings(ctx, metrics);
      return;
    }
    if (this.screen === 'seat-selection') {
      this.renderSeatSelection(ctx, metrics);
      return;
    }
    if (this.screen === 'room-waiting') {
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
    const defs = [{ mode: 'start', label: '开始', fill: '#d92d20' }];

    this.buttons = defs.map((def, index) => {
      const x = centerX - startButton.width / 2;
      const y = flowers.bottom - 25 + index * startButton.height;
      this.drawStartButton(ctx, x, y, startButton.width, startButton.height, def);
      return { mode: def.mode, x, y, w: startButton.width, h: startButton.height };
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
      ctx.drawImage(image, x, y, width, height);
      return;
    }

    ctx.fillStyle = def.fill;
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
    this.drawRoomFlowHeader(ctx, layout, '创建房间', '选择规则后进入座位设置');
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
    this.drawFooterButton(ctx, layout, 938, 744, 212, '下一步', true, 'create-next');

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
      const roundY = avatarY + avatarSize + 104;
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '20px sans-serif';
      ctx.fillText('局数', centerX, roundY - 24);
      const roundOptions = [1, 2, 4, 6];
      const optionW = 62;
      const optionH = 48;
      const gap = 12;
      const optionsWidth = optionW * roundOptions.length + gap * (roundOptions.length - 1);
      roundOptions.forEach((maxRounds, index) => {
        const x = centerX - optionsWidth / 2 + index * (optionW + gap);
        const selected = this.lobby.selectedMaxRounds === maxRounds;
        ctx.fillStyle = selected ? '#d92d20' : 'rgba(255,255,255,0.14)';
        this.roundRect(ctx, x, roundY, optionW, optionH, 8);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText(`${maxRounds}`, x + optionW / 2, roundY + optionH / 2);
        this.buttons.push({ type: 'round', maxRounds, x, y: roundY, w: optionW, h: optionH });
      });

      const btnW = Math.min(300, bounds.width * 0.68);
      const btnH = 60;
      const btnX = centerX - btnW / 2;
      const btnY = roundY + 78;
      ctx.fillStyle = '#d92d20';
      this.roundRect(ctx, btnX, btnY, btnW, btnH, 12);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 25px sans-serif';
      ctx.fillText('创建房间', centerX, btnY + btnH / 2);
      this.buttons.push({ type: 'create-room', x: btnX, y: btnY, w: btnW, h: btnH });
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
    const bounds = metrics.safeAreaBounds || { x: 0, y: 0, width: metrics.width, height: metrics.height };
    const centerX = bounds.x + bounds.width / 2;
    const top = bounds.y + 30;
    const room = this.waiting.room || {};
    const players = Array.isArray(room.players) ? room.players : [];
    const mine = players.find((player) => player.seat === room.yourSeat) || {};
    this.buttons = [];
    this.destroyProfileButton();

    ctx.save();
    this.drawHallBackground(ctx, metrics, 'rgba(13, 18, 28, 0.88)');

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f7f3e8';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText('等待好友加入', centerX, top + 20);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '21px sans-serif';
    ctx.fillText(`房间号 ${room.roomId || '------'}`, centerX, top + 62);
    ctx.fillText(`局数 ${room.settings && room.settings.maxRounds ? room.settings.maxRounds : 2}`, centerX, top + 94);

    const listTop = top + 132;
    const rowH = 54;
    const listW = Math.min(360, bounds.width - 42);
    const listX = centerX - listW / 2;
    for (let index = 0; index < Math.max(players.length, 1); index++) {
      const player = players[index];
      const y = listTop + index * rowH;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      this.roundRect(ctx, listX, y, listW, rowH - 8, 8);
      ctx.fill();
      if (!player) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '20px sans-serif';
        ctx.fillText('等待玩家加入', centerX, y + rowH / 2 - 4);
        continue;
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 21px sans-serif';
      const tags = [player.isHost ? '房主' : '', player.online === false ? '离线' : ''].filter(Boolean).join(' ');
      ctx.fillText(`${player.nickName || '玩家'}${tags ? ` · ${tags}` : ''}`, listX + 18, y + 20);
      ctx.fillStyle = player.ready ? '#8ee6a7' : '#ffd27a';
      ctx.font = '18px sans-serif';
      ctx.fillText(player.ready ? '已准备' : '未准备', listX + 18, y + 42);
      ctx.textAlign = 'center';
    }

    const errorText = this.waiting.error || '';
    const hint = errorText || (room.canStart
      ? '房主可以开始牌局'
      : (room.readyToStart ? '等待房主开始' : `至少 ${room.minHumansToStart || 2} 名真人，房主准备后开局`));
    ctx.fillStyle = errorText ? '#ffb4a8' : '#cbd5e1';
    ctx.font = '20px sans-serif';
    ctx.fillText(hint, centerX, bounds.y + bounds.height - 176);

    const btnW = Math.min(156, (bounds.width - 54) / 2);
    const btnH = 52;
    const gap = 14;
    const btnY = bounds.y + bounds.height - 132;
    const readyDisabled = mine.ready || this.busy;
    const readyX = centerX - btnW - gap / 2;
    ctx.fillStyle = readyDisabled ? 'rgba(255,255,255,0.14)' : '#d92d20';
    this.roundRect(ctx, readyX, btnY, btnW, btnH, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(mine.ready ? '已准备' : '准备', readyX + btnW / 2, btnY + btnH / 2);
    this.buttons.push({ type: 'ready', x: readyX, y: btnY, w: btnW, h: btnH });

    const inviteX = centerX + gap / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    this.roundRect(ctx, inviteX, btnY, btnW, btnH, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText('微信邀请', inviteX + btnW / 2, btnY + btnH / 2);
    this.buttons.push({ type: 'invite', x: inviteX, y: btnY, w: btnW, h: btnH });

    if (room.isHost) {
      const startW = Math.min(326, bounds.width - 42);
      const startX = centerX - startW / 2;
      const startY = btnY + 66;
      ctx.fillStyle = room.canStart && !this.busy ? '#1570ef' : 'rgba(255,255,255,0.12)';
      this.roundRect(ctx, startX, startY, startW, btnH, 10);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('开始牌局', centerX, startY + btnH / 2);
      this.buttons.push({ type: 'start-room', x: startX, y: startY, w: startW, h: btnH });
    } else if (errorText) {
      const retryW = Math.min(220, bounds.width - 80);
      const retryX = centerX - retryW / 2;
      const retryY = btnY + 66;
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      this.roundRect(ctx, retryX, retryY, retryW, btnH, 10);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('重试', centerX, retryY + btnH / 2);
      this.buttons.push({ type: 'waiting-retry', x: retryX, y: retryY, w: retryW, h: btnH });
    }

    ctx.restore();
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
