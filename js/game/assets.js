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
    actions: {
      image: 'button',
      path: 'images/action_buttons_named_atlas.json',
    },
  },
  audio: {
    bgm: 'audio/bgmusic.mp3',
    tap: '',
    cardVoices: {
      shang: 'audio/上.mp3',
      da: 'audio/大.mp3',
      ren: 'audio/人.mp3',
      kong: 'audio/孔.mp3',
      yi: 'audio/乙.mp3',
      ji: 'audio/己.mp3',
      hua: 'audio/化.mp3',
      san: 'audio/三.mp3',
      qian: 'audio/千.mp3',
      qi: 'audio/七.mp3',
      shi: 'audio/十.mp3',
      tu: 'audio/土.mp3',
      er: 'audio/尔.mp3',
      xiao: 'audio/小.mp3',
      sheng: 'audio/生.mp3',
      fu: 'audio/福.mp3',
      lu: 'audio/禄.mp3',
      shou: 'audio/寿.mp3',
      jia: 'audio/佳.mp3',
      zuo: 'audio/作.mp3',
      ren2: 'audio/仁.mp3',
      ba: 'audio/八.mp3',
      jiu: 'audio/九.mp3',
      zi: 'audio/子.mp3',
    },
    actionVoices: {
      chi: 'audio/吃.mp3',
      peng: 'audio/碰.mp3',
      zhao: 'audio/招.mp3',
      ta: 'audio/踏.mp3',
      hu: 'audio/胡.mp3',
    },
  },
};

export const ACTION_ATLAS_FRAME_CONFIG = {
  acceptTakeover: { originalIndex: 1, rotateCcw: true },
  declineTakeover: { originalIndex: 4, rotateCcw: true },
  hu: { originalIndex: 13, rotateCcw: true },
  zhao: { originalIndex: 47, rotateCcw: true },
  ta: { originalIndex: 36, rotateCcw: false },
  peng: { originalIndex: 51, rotateCcw: true },
  chi: { originalIndex: 27, rotateCcw: false },
  pass: { originalIndex: 58, rotateCcw: false },
};

export const APPEARANCE_OVERLAY_FRAME_CONFIG = {
  play: 'ui_left_play_panel_da',
  move: 'ui_left_move_panel_ban',
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

export const CARD_ATLAS_SIZES = ['big', 'small', 'mini'];

const CARD_ATLAS_SIZE_FALLBACKS = {
  big: ['big', 'small', 'mini'],
  small: ['small', 'big', 'mini'],
  mini: ['mini', 'small', 'big'],
};

const CARD_ATLAS_SIZE_ALIASES = {
  vertical: 'big',
  default: 'big',
};

const CARD_ATLAS_KEY_SET = Object.keys(CARD_ATLAS_LABEL_KEYS).reduce((set, label) => {
  set[CARD_ATLAS_LABEL_KEYS[label]] = true;
  return set;
}, {});

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

function normalizeSpriteSize(size = 'big') {
  const normalized = CARD_ATLAS_SIZE_ALIASES[size] || size;
  return CARD_ATLAS_SIZES.indexOf(normalized) >= 0 ? normalized : 'big';
}

function nameTokens(name = '') {
  return String(name).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function keyFromLabel(label = '') {
  const chars = Object.keys(CARD_ATLAS_LABEL_KEYS);
  for (let i = 0; i < chars.length; i++) {
    if (label.indexOf(chars[i]) >= 0) return CARD_ATLAS_LABEL_KEYS[chars[i]];
  }
  return null;
}

function keyFromFrameName(name = '') {
  const tokens = nameTokens(name);
  for (let i = 0; i < tokens.length; i++) {
    if (CARD_ATLAS_KEY_SET[tokens[i]]) return tokens[i];
  }
  return null;
}

function sizeFromFrameName(name = '', groupSize = null) {
  if (groupSize && CARD_ATLAS_SIZES.indexOf(groupSize) >= 0) return groupSize;
  const tokens = nameTokens(name);
  for (let i = 0; i < tokens.length; i++) {
    if (CARD_ATLAS_SIZES.indexOf(tokens[i]) >= 0) return tokens[i];
  }
  return null;
}

function orientationFromFrameName(name = '') {
  const tokens = nameTokens(name);
  if (tokens.indexOf('hr') >= 0) return 'hr';
  if (tokens.indexOf('hl') >= 0 || tokens.indexOf('horizontal') >= 0) return 'hl';
  if (tokens.indexOf('v') >= 0 || tokens.indexOf('vertical') >= 0) return 'v';
  return null;
}

function frameNeedsCounterClockwiseRotation(name = '') {
  return orientationFromFrameName(name) === 'hr';
}

function frameNeedsClockwiseRotation(frame, name = '') {
  const orientation = orientationFromFrameName(name);
  if (orientation === 'hl') return true;
  if (orientation === 'hr') return false;
  if (orientation === 'v') return false;
  if (!frame || !frame.frame) return false;
  return (frame.label || '').indexOf('横向') >= 0 || frame.frame.w > frame.frame.h;
}

function enumerateAtlasFrames(atlas) {
  if (!atlas || !atlas.frames) return [];
  const entries = [];

  Object.entries(atlas.frames).forEach(([name, frameOrGroup]) => {
    if (isValidFrame(frameOrGroup)) {
      entries.push({ name, frame: frameOrGroup, sizeGroup: null });
      return;
    }

    if (CARD_ATLAS_SIZES.indexOf(name) < 0 || !frameOrGroup || typeof frameOrGroup !== 'object') return;
    Object.entries(frameOrGroup).forEach(([frameName, frame]) => {
      if (isValidFrame(frame)) entries.push({ name: frameName, frame, sizeGroup: name });
    });
  });

  return entries;
}

function createFrameMatch(name, frame, size, source) {
  return {
    name,
    frame,
    size,
    source,
    rotateCw: frameNeedsClockwiseRotation(frame, name),
    rotateCcw: frameNeedsCounterClockwiseRotation(name),
  };
}

function ensureCardFrameBucket(map, key) {
  if (!map[key]) {
    map[key] = {
      bySize: CARD_ATLAS_SIZES.reduce((sizes, size) => {
        sizes[size] = [];
        return sizes;
      }, {}),
      legacy: [],
    };
  }
  return map[key];
}

function addSizedFrameMatch(map, key, match) {
  if (!key || !match || !match.size) return;
  const bucket = ensureCardFrameBucket(map, key);
  bucket.bySize[match.size].push(match);
}

function addLegacyFrameMatch(map, key, match) {
  if (!key || !match) return;
  ensureCardFrameBucket(map, key).legacy.push(match);
}

export function buildCardAtlasFrameMap(atlas, targetCount = 24) {
  const map = {};
  const entries = enumerateAtlasFrames(atlas);
  entries.forEach(({ name, frame, sizeGroup }) => {
    const key = keyFromFrameName(name) || keyFromLabel(frame.label || name);
    const size = sizeFromFrameName(name, sizeGroup);
    if (key && size) addSizedFrameMatch(map, key, createFrameMatch(name, frame, size, 'name'));
  });

  let mappedCount = 0;
  entries.some(({ name, frame }) => {
    const key = keyFromLabel(frame.label || name);
    if (!key) return;
    const bucket = ensureCardFrameBucket(map, key);
    const isNewKey = bucket.legacy.length === 0;
    addLegacyFrameMatch(map, key, createFrameMatch(name, frame, sizeFromFrameName(name) || 'big', 'label'));
    if (isNewKey) mappedCount += 1;
    return mappedCount >= targetCount;
  });

  return map;
}

export function buildAtlasOriginalIndexMap(atlas) {
  if (!atlas || !atlas.frames) return {};
  return Object.entries(atlas.frames).reduce((map, [name, frame]) => {
    if (isValidFrame(frame) && typeof frame.originalIndex === 'number') {
      map[frame.originalIndex] = { name, frame };
    }
    return map;
  }, {});
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
    this.atlasOriginalIndexes = {};
    this.remoteImages = {};
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
    this.atlasOriginalIndexes[name] = buildAtlasOriginalIndexMap(atlas);
    this.status[`${name}Atlas`] = 'ready';
    return true;
  }

  getImage(name) {
    return this.status[name] === 'ready' ? this.images[name] : null;
  }

  getRemoteImage(src) {
    if (!src || typeof wx === 'undefined' || !wx.createImage) return null;
    const cached = this.remoteImages[src];
    if (cached) return cached.ready ? cached.image : null;
    const image = wx.createImage();
    const entry = { image, ready: false, failed: false };
    this.remoteImages[src] = entry;
    image.onload = () => { entry.ready = true; };
    image.onerror = () => { entry.failed = true; };
    image.src = src;
    return null;
  }

  getAtlasFrame(name, frameName) {
    const atlas = this.atlases[name];
    if (!atlas || !atlas.frames) return null;
    if (isValidFrame(atlas.frames[frameName])) return atlas.frames[frameName];
    for (let i = 0; i < CARD_ATLAS_SIZES.length; i++) {
      const group = atlas.frames[CARD_ATLAS_SIZES[i]];
      if (group && isValidFrame(group[frameName])) return group[frameName];
    }
    return null;
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
    return image && frame ? {
      image,
      frame,
      name: frameName,
      rotateCw: Boolean(options.rotateCw),
      rotateCcw: Boolean(options.rotateCcw),
    } : null;
  }

  getAtlasFrameByOriginalIndex(atlasName, originalIndex) {
    const map = this.atlasOriginalIndexes[atlasName];
    return map && map[originalIndex] ? map[originalIndex] : null;
  }

  getActionSprite(actionType) {
    const config = ACTION_ATLAS_FRAME_CONFIG[actionType];
    if (!config) return null;
    const match = this.getAtlasFrameByOriginalIndex('actions', config.originalIndex);
    if (!match) return null;
    return this.getAtlasSprite(match.name, 'actions', {
      rotateCcw: config.rotateCcw,
    });
  }

  getAppearanceOverlaySprite(type) {
    const frameName = APPEARANCE_OVERLAY_FRAME_CONFIG[type];
    if (!frameName) return null;
    return this.getAtlasSprite(frameName, 'cards');
  }

  getCardFrame(card, size = 'big') {
    const bucket = this.cardAtlasFrames[card && card.key];
    if (!bucket) return null;
    const requestedSize = normalizeSpriteSize(size);
    const fallbackSizes = CARD_ATLAS_SIZE_FALLBACKS[requestedSize] || CARD_ATLAS_SIZE_FALLBACKS.big;
    for (let i = 0; i < fallbackSizes.length; i++) {
      const matches = bucket.bySize && bucket.bySize[fallbackSizes[i]];
      if (matches && matches.length) return matches[0];
    }
    return bucket.legacy && bucket.legacy.length ? bucket.legacy[0] : null;
  }

  getCardSprite(card, size = 'big') {
    const match = this.getCardFrame(card, size);
    if (!match) return null;
    const config = this.manifest.atlases && this.manifest.atlases.cards;
    const image = config ? this.getImage(config.image) : null;
    return image && match.frame ? {
      image,
      frame: match.frame,
      name: match.name,
      size: match.size,
      rotateCw: match.rotateCw,
      rotateCcw: match.rotateCcw,
    } : null;
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
