export const ASSET_MANIFEST = {
  images: {
    table: 'images/background.jpg',
    cardBack: 'images/59f115d6-519c-40fc-99d4-2204eab9e574.eff8a.png',
    cardFront: 'images/element.png',
    button: 'images/actions.png',
    result: 'images/element.png',
  },
  atlases: {
    cards: {
      image: 'cardFront',
      path: 'images/element.atlas.json',
      backFrames: {
        vertical: ['tile_back_green_vertical', 'tile_back_red_vertical'],
        small: ['tile_back_green_small', 'tile_back_red_small'],
      },
    },
  },
  audio: {
    bgm: 'audio/bgmusic.mp3',
    discard: '',
    meld: '',
    win: '',
    tap: '',
  },
};

export const CARD_ATLAS_LABEL_KEYS = {
  上: 'shang',
  大: 'da',
  人: 'ren',
  孔: 'kong',
  乙: 'yi',
  己: 'ji',
  化: 'hua',
  三: 'san',
  千: 'qian',
  七: 'qi',
  十: 'shi',
  土: 'tu',
  尔: 'er',
  小: 'xiao',
  生: 'sheng',
  福: 'fu',
  禄: 'lu',
  寿: 'shou',
  佳: 'jia',
  作: 'zuo',
  仁: 'ren2',
  八: 'ba',
  九: 'jiu',
  子: 'zi',
};

function isValidFrame(frame) {
  return Boolean(
    frame
    && frame.frame
    && typeof frame.frame.x === 'number'
    && typeof frame.frame.y === 'number'
    && typeof frame.frame.w === 'number'
    && typeof frame.frame.h === 'number'
  );
}

function keyFromLabel(label = '') {
  const chars = Object.keys(CARD_ATLAS_LABEL_KEYS);
  for (let i = 0; i < chars.length; i++) {
    if (label.indexOf(chars[i]) >= 0) return CARD_ATLAS_LABEL_KEYS[chars[i]];
  }
  return null;
}

function frameNeedsClockwiseRotation(frame) {
  if (!frame || !frame.frame) return false;
  return (frame.label || '').indexOf('横向') >= 0 || frame.frame.w > frame.frame.h;
}

export function buildCardAtlasFrameMap(atlas, targetCount = 24) {
  const map = {};
  if (!atlas || !atlas.frames) return map;

  let mappedCount = 0;
  Object.entries(atlas.frames).some(([name, frame]) => {
    if (!isValidFrame(frame)) return;
    const key = keyFromLabel(frame.label || name);
    if (!key) return;
    const isNewKey = !map[key];
    if (!map[key]) map[key] = [];
    map[key].push({
      name,
      frame,
      rotateCw: frameNeedsClockwiseRotation(frame),
    });
    if (isNewKey) mappedCount += 1;
    return mappedCount >= targetCount;
  });

  return map;
}

function readJsonFile(path) {
  if (!path || typeof wx === 'undefined' || !wx.getFileSystemManager) return null;
  try {
    const content = wx.getFileSystemManager().readFileSync(path, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

export default class AssetLoader {
  constructor(manifest = ASSET_MANIFEST) {
    this.manifest = manifest;
    this.images = {};
    this.atlases = {};
    this.cardAtlasFrames = {};
    this.status = {};
  }

  loadImages() {
    this.loadAtlases();
    Object.keys(this.manifest.images).forEach((name) => {
      const src = this.manifest.images[name];
      if (!src || typeof wx === 'undefined' || !wx.createImage) {
        this.status[name] = 'missing';
        return;
      }

      const img = wx.createImage();
      this.status[name] = 'loading';
      img.onload = () => {
        this.status[name] = 'ready';
      };
      img.onerror = () => {
        this.status[name] = 'failed';
      };
      img.src = src;
      this.images[name] = img;
    });
  }

  loadAtlases() {
    Object.keys(this.manifest.atlases || {}).forEach((name) => {
      const config = this.manifest.atlases[name];
      const atlas = config.data || readJsonFile(config.path);
      this.setAtlas(name, atlas);
    });
  }

  setAtlas(name, atlas) {
    if (!atlas || !atlas.frames) {
      this.status[`${name}Atlas`] = 'missing';
      return false;
    }
    this.atlases[name] = atlas;
    if (name === 'cards') this.cardAtlasFrames = buildCardAtlasFrameMap(atlas);
    this.status[`${name}Atlas`] = 'ready';
    return true;
  }

  getImage(name) {
    return this.status[name] === 'ready' ? this.images[name] : null;
  }

  getAtlasFrame(name, frameName) {
    const atlas = this.atlases[name];
    if (!atlas || !atlas.frames) return null;
    const frame = atlas.frames[frameName];
    return isValidFrame(frame) ? frame : null;
  }

  findFirstAtlasFrame(name, candidates = []) {
    for (let i = 0; i < candidates.length; i++) {
      const frame = this.getAtlasFrame(name, candidates[i]);
      if (frame) return { name: candidates[i], frame };
    }
    return null;
  }

  getAtlasSprite(frameName, atlasName = 'cards', options = {}) {
    const config = this.manifest.atlases && this.manifest.atlases[atlasName];
    if (!config) return null;
    const image = this.getImage(config.image);
    const frame = this.getAtlasFrame(atlasName, frameName);
    return image && frame ? { image, frame, name: frameName, rotateCw: Boolean(options.rotateCw) } : null;
  }

  getCardFrame(card) {
    const entries = this.cardAtlasFrames[card && card.key] || [];
    return entries.length ? entries[0] : null;
  }

  getCardSprite(card) {
    const match = this.getCardFrame(card);
    if (!match) return null;
    return this.getAtlasSprite(match.name, 'cards', { rotateCw: match.rotateCw });
  }

  getCardBackFrame(size = 'vertical') {
    const config = this.manifest.atlases && this.manifest.atlases.cards;
    if (!config || !config.backFrames) return null;
    const primary = config.backFrames[size] || [];
    const secondary = size === 'small' ? (config.backFrames.vertical || []) : (config.backFrames.small || []);
    return this.findFirstAtlasFrame('cards', primary.concat(secondary));
  }

  getCardBackSprite(size = 'vertical') {
    const match = this.getCardBackFrame(size);
    if (!match) return null;
    return this.getAtlasSprite(match.name, 'cards');
  }

  isReady(name) {
    return this.status[name] === 'ready';
  }
}
