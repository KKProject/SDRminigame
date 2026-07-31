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
  audioRegistered = false;

  constructor() {
    if (instance) return instance;
    instance = this;
  }

  registerAudioManifest(audioManifest = {}) {
    if (this.audioRegistered) return;
    this.audioRegistered = true;

    this.bgmAudio = createAudio(audioManifest.bgm, true);
    Object.keys(audioManifest).forEach((name) => {
      if (name !== 'bgm' && typeof audioManifest[name] === 'string') {
        this.cues[name] = createAudio(audioManifest[name]);
      }
    });
    this.cardVoiceCues = createAudioMap(audioManifest.cardVoices);
    this.actionVoiceCues = createAudioMap(audioManifest.actionVoices);
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
