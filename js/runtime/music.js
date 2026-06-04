import { ASSET_MANIFEST } from '../game/assets';

let instance;

function createAudio(src, loop = false) {
  if (typeof wx === 'undefined' || !wx.createInnerAudioContext || !src) return null;
  const audio = wx.createInnerAudioContext();
  audio.loop = loop;
  audio.src = src;
  if (audio.onError) audio.onError(() => {});
  return audio;
}

export default class Music {
  muted = false;
  bgmAudio = null;
  cues = {};
  bgmStarted = false;

  constructor() {
    if (instance) return instance;
    instance = this;

    this.bgmAudio = createAudio(ASSET_MANIFEST.audio.bgm, true);
    Object.keys(ASSET_MANIFEST.audio).forEach((name) => {
      if (name !== 'bgm') {
        this.cues[name] = createAudio(ASSET_MANIFEST.audio[name]);
      }
    });
    this.playBackground();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.bgmAudio) {
      if (muted) {
        this.bgmAudio.stop();
      } else {
        this.safePlay(this.bgmAudio);
      }
    }
  }

  playCue(name) {
    if (this.muted) return;
    this.playBackground();
    const audio = this.cues[name];
    if (!audio) return;
    audio.currentTime = 0;
    this.safePlay(audio);
  }

  playBackground() {
    if (!this.muted && this.bgmAudio) {
      this.safePlay(this.bgmAudio);
      this.bgmStarted = true;
    }
  }

  safePlay(audio) {
    try {
      audio.play();
    } catch (error) {
      // Audio playback is optional in the minigame runtime.
    }
  }
}
