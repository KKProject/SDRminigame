import { getRenderMetrics } from '../render';
import {
  createUserProfileButton,
  getAuthorizedProfile,
  profileWithFallback,
} from '../net/profile';

/**
 * 启动主菜单覆盖层：进入在线对战。
 * 自管触摸事件，选择后通过回调通知，并停止接收触摸。
 */
export default class StartMenu {
  constructor(onSelect) {
    this.onSelect = onSelect;
    this.active = false;
    this.status = '';
    this.buttons = [];
    this.profileButton = null;
    this.profileButtonSignature = '';
    this.checkingProfile = false;
    this.busy = false;
    this.boundTouch = this.handleTouch.bind(this);
    this.screen = 'start';
    this.lobby = {
      state: '',
      profile: null,
      error: '',
      selectedMaxRounds: 2,
    };
    this.waiting = {
      room: null,
      profile: null,
      error: '',
    };
    this.avatarImage = null;
    this.avatarUrl = '';
    this.avatarLoaded = false;
  }

  show() {
    if (this.active) return;
    this.active = true;
    wx.onTouchStart(this.boundTouch);
  }

  hide() {
    if (!this.active) return;
    this.active = false;
    if (wx.offTouchStart) wx.offTouchStart(this.boundTouch);
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
    this.destroyProfileButton();
  }

  handleTouch(event) {
    if (!this.active) return;
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    const hit = this.buttons.find((btn) => (
      touch.clientX >= btn.x
      && touch.clientX <= btn.x + btn.w
      && touch.clientY >= btn.y
      && touch.clientY <= btn.y + btn.h
    ));
    if (!hit || typeof this.onSelect !== 'function') return;
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
      this.handleOnlineTouch();
    }
  }

  handleOnlineTouch() {
    if (this.checkingProfile) return;
    this.checkingProfile = true;
    getAuthorizedProfile()
      .then((profile) => {
        if (profile) {
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
    if (this.screen === 'room-waiting') {
      this.renderWaitingRoom(ctx, metrics);
      return;
    }
    const bounds = metrics.safeAreaBounds || { x: 0, y: 0, width: metrics.width, height: metrics.height };
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(13, 18, 28, 0.82)';
    ctx.fillRect(0, 0, metrics.width, metrics.height);

    ctx.fillStyle = '#f7f3e8';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('上大人 · 花牌', centerX, centerY - 110);

    const btnW = Math.min(320, bounds.width * 0.6);
    const btnH = 64;
    const defs = [{ mode: 'online', label: '在线对战', fill: '#d92d20' }];

    this.buttons = defs.map((def, index) => {
      const x = centerX - btnW / 2;
      const y = centerY - 20 + index * btnH;
      ctx.fillStyle = def.fill;
      this.roundRect(ctx, x, y, btnW, btnH, 14);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText(def.label, centerX, y + btnH / 2);
      return { mode: def.mode, x, y, w: btnW, h: btnH };
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

  renderLobby(ctx, metrics) {
    const bounds = metrics.safeAreaBounds || { x: 0, y: 0, width: metrics.width, height: metrics.height };
    const centerX = bounds.x + bounds.width / 2;
    const top = bounds.y + 34;
    const profile = this.lobby.profile || {};
    const state = this.lobby.state;
    this.buttons = [];
    this.destroyProfileButton();

    ctx.save();
    ctx.fillStyle = 'rgba(13, 18, 28, 0.86)';
    ctx.fillRect(0, 0, metrics.width, metrics.height);

    ctx.fillStyle = '#f7f3e8';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('在线大厅', centerX, top + 24);

    const avatarSize = 72;
    const avatarX = centerX - avatarSize / 2;
    const avatarY = top + 66;
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
    ctx.fillStyle = 'rgba(13, 18, 28, 0.88)';
    ctx.fillRect(0, 0, metrics.width, metrics.height);

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
