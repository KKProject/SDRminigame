import { SCREEN_WIDTH, SCREEN_HEIGHT, SAFE_AREA_BOUNDS } from '../render';
import {
  createUserProfileButton,
  getAuthorizedProfile,
  profileWithFallback,
} from '../net/profile';
import { ONLINE_BATTLE_ENABLED } from '../config';

/**
 * 启动主菜单覆盖层：选择「在线对战」或「单机练习」。
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

  handleTouch(event) {
    if (!this.active || this.busy) return;
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    const hit = this.buttons.find((btn) => (
      touch.clientX >= btn.x
      && touch.clientX <= btn.x + btn.w
      && touch.clientY >= btn.y
      && touch.clientY <= btn.y + btn.h
    ));
    if (hit && typeof this.onSelect === 'function') {
      if (hit.mode === 'online') {
        this.handleOnlineTouch();
        return;
      }
      this.onSelect(hit.mode, null);
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
    const online = this.buttons.find((button) => button.mode === 'online');
    if (!ONLINE_BATTLE_ENABLED || !this.active || this.busy || !online) {
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
    const bounds = SAFE_AREA_BOUNDS || { x: 0, y: 0, width: SCREEN_WIDTH, height: SCREEN_HEIGHT };
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(13, 18, 28, 0.82)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    ctx.fillStyle = '#f7f3e8';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('上大人 · 花牌', centerX, centerY - 110);

    const btnW = Math.min(320, bounds.width * 0.6);
    const btnH = 64;
    const gap = 24;
    const defs = ONLINE_BATTLE_ENABLED
      ? [
        { mode: 'online', label: '在线对战', fill: '#d92d20' },
        { mode: 'single', label: '单机练习', fill: '#1d2939' },
      ]
      : [{ mode: 'single', label: '单机练习', fill: '#1d2939' }];

    this.buttons = defs.map((def, index) => {
      const x = centerX - btnW / 2;
      const y = centerY - 20 + index * (btnH + gap);
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
