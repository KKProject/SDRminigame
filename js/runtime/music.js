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

function createAudioMap(sources = {}) {
  return Object.keys(sources).reduce((map, name) => {
    const audio = createAudio(sources[name]);
    if (audio) map[name] = audio;
    return map;
  }, {});
}

export default class Music {
  muted = false;
  bgmAudio = null;
  cues = {};
  cardVoiceCues = {};
  actionVoiceCues = {};
  bgmStarted = false;

  constructor() {
    if (instance) return instance;
    instance = this;

    this.bgmAudio = createAudio(ASSET_MANIFEST.audio.bgm, true);
    Object.keys(ASSET_MANIFEST.audio).forEach((name) => {
      if (name !== 'bgm' && typeof ASSET_MANIFEST.audio[name] === 'string') {
        this.cues[name] = createAudio(ASSET_MANIFEST.audio[name]);
      }
    });
    this.cardVoiceCues = createAudioMap(ASSET_MANIFEST.audio.cardVoices);
    this.actionVoiceCues = createAudioMap(ASSET_MANIFEST.audio.actionVoices);
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

  playCardVoice(card) {
    if (this.muted || !card) return;
    const audio = this.cardVoiceCues[card.key];
    if (!audio) return;
    audio.currentTime = 0;
    this.safePlay(audio);
  }

  playActionVoice(type) {
    if (this.muted) return;
    const audio = this.actionVoiceCues[type];
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
