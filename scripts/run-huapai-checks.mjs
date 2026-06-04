import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceDir = join(root, 'js/game');
const tempDir = join(root, '.tmp-huapai-checks');
const files = ['rules', 'cards', 'evaluator', 'ai', 'engine', 'layout', 'assets', 'renderer', 'self-check'];

function rewriteImports(source) {
  return source
    .replace(/from '(\.\/[^']+)'/g, "from '$1.mjs'")
    .replace(/from '\.\.\/render'/g, "from './render-stub.mjs'");
}

await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });

for (const file of files) {
  const source = await readFile(join(sourceDir, `${file}.js`), 'utf8');
  await writeFile(join(tempDir, `${file}.mjs`), rewriteImports(source));
}
await writeFile(join(tempDir, 'render-runtime.mjs'), await readFile(join(root, 'js/render.js'), 'utf8'));
await writeFile(join(tempDir, 'render-stub.mjs'), [
  'export const SCREEN_WIDTH = 375;',
  'export const SCREEN_HEIGHT = 667;',
  'export const DEVICE_PIXEL_RATIO = 2;',
  'export const RENDER_PIXEL_RATIO = 2;',
  'export const BACKING_STORE_WIDTH = 750;',
  'export const BACKING_STORE_HEIGHT = 1334;',
].join(' '));

const { runSelfChecks } = await import(pathToFileURL(join(tempDir, 'self-check.mjs')));
const { default: HuapaiEngine } = await import(pathToFileURL(join(tempDir, 'engine.mjs')));
const {
  default: TableLayout,
  CARD_ASPECT_RATIO,
  CARD_SOURCE_HEIGHT,
  HAND_STACK_SOURCE_STEP,
} = await import(pathToFileURL(join(tempDir, 'layout.mjs')));
const { ASSET_MANIFEST, buildCardAtlasFrameMap } = await import(pathToFileURL(join(tempDir, 'assets.mjs')));
const { createDeck, createSeats } = await import(pathToFileURL(join(tempDir, 'cards.mjs')));
const { DEFAULT_RULES, PHASES } = await import(pathToFileURL(join(tempDir, 'rules.mjs')));

runSelfChecks();

async function loadRenderRuntime(windowInfo, options = {}) {
  const calls = {
    setTransform: [],
    scale: [],
  };
  const context = {};
  if (options.withoutSetTransform) {
    context.scale = (...args) => calls.scale.push(args);
  } else {
    context.setTransform = (...args) => calls.setTransform.push(args);
    context.scale = (...args) => calls.scale.push(args);
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext(type) {
      if (type !== '2d') throw new Error('render should request a 2d context');
      return context;
    },
  };

  globalThis.GameGlobal = {};
  globalThis.wx = {
    createCanvas() {
      return canvas;
    },
    getWindowInfo() {
      return windowInfo;
    },
  };

  const url = `${pathToFileURL(join(tempDir, 'render-runtime.mjs')).href}?case=${encodeURIComponent(JSON.stringify(windowInfo))}&fallback=${Boolean(options.withoutSetTransform)}`;
  const module = await import(url);
  return { module, canvas, calls };
}

let renderCase = await loadRenderRuntime({ windowWidth: 320, windowHeight: 568, pixelRatio: 1 });
if (
  renderCase.module.SCREEN_WIDTH !== 320
  || renderCase.module.SCREEN_HEIGHT !== 568
  || renderCase.module.RENDER_PIXEL_RATIO !== 1
  || renderCase.canvas.width !== 320
  || renderCase.canvas.height !== 568
) {
  throw new Error('DPR 1 render setup should keep logical and backing sizes equal');
}
if (renderCase.calls.setTransform.length !== 1 || renderCase.calls.setTransform[0].join(',') !== '1,0,0,1,0,0') {
  throw new Error('DPR 1 render setup should apply one identity transform');
}

renderCase = await loadRenderRuntime({ windowWidth: 375, windowHeight: 667, pixelRatio: 2 });
if (
  renderCase.module.SCREEN_WIDTH !== 375
  || renderCase.module.SCREEN_HEIGHT !== 667
  || renderCase.module.RENDER_PIXEL_RATIO !== 2
  || renderCase.canvas.width !== 750
  || renderCase.canvas.height !== 1334
) {
  throw new Error('DPR 2 render setup should use high-DPI backing store with logical exports');
}
if (renderCase.calls.setTransform.length !== 1 || renderCase.calls.setTransform[0].join(',') !== '2,0,0,2,0,0') {
  throw new Error('DPR 2 render setup should apply one scaled transform');
}

renderCase = await loadRenderRuntime({ windowWidth: 390, windowHeight: 844, pixelRatio: 3 });
if (
  renderCase.module.DEVICE_PIXEL_RATIO !== 3
  || renderCase.module.RENDER_PIXEL_RATIO !== 2
  || renderCase.canvas.width !== 780
  || renderCase.canvas.height !== 1688
) {
  throw new Error('high-DPR render setup should clamp backing store scale');
}

renderCase = await loadRenderRuntime({ screenWidth: 300, screenHeight: 500 }, { withoutSetTransform: true });
if (
  renderCase.module.SCREEN_WIDTH !== 300
  || renderCase.module.SCREEN_HEIGHT !== 500
  || renderCase.module.RENDER_PIXEL_RATIO !== 1
  || renderCase.calls.scale.length !== 1
) {
  throw new Error('render setup should fall back safely when pixel ratio or setTransform are unavailable');
}

const databus = {
  muted: false,
  round: 0,
  setRoundState(state) {
    Object.assign(this, state);
  },
};
const engine = new HuapaiEngine(databus, { playCue() {}, setMuted() {} }, DEFAULT_RULES);
engine.startRound(1001);
if (engine.aiTimer) clearTimeout(engine.aiTimer);

if (databus.seats.length !== DEFAULT_RULES.seatCount) {
  throw new Error('round did not create all seats');
}

if (databus.seats[databus.dealerSeat].hand.length !== DEFAULT_RULES.dealerHandSize) {
  throw new Error('dealer opening hand size mismatch');
}
if (!databus.seats.every((seat) => seat.id === databus.dealerSeat || seat.hand.length === DEFAULT_RULES.idleHandSize)) {
  throw new Error('idle opening hand size mismatch');
}
if (!databus.jiangCard || !databus.jiangPhraseId) {
  throw new Error('round did not mark jiang card');
}
if (![PHASES.HUMAN_DISCARD, PHASES.TAKEOVER_CHOICE, PHASES.AI_THINKING, PHASES.RESULT].includes(databus.phase)) {
  throw new Error('round started in invalid phase');
}

engine.finishDraw();
if (databus.result.type !== 'draw') {
  throw new Error('draw result was not created');
}

const responseSeats = createSeats(DEFAULT_RULES, 1);
const responseDeck = createDeck(DEFAULT_RULES);
responseSeats[0].hand = ['da', 'ren'].map((key) => responseDeck.splice(responseDeck.findIndex((card) => card.key === key), 1)[0]);
responseSeats[3].hand = [responseDeck.splice(responseDeck.findIndex((card) => card.key === 'shang'), 1)[0]];
databus.setRoundState({
  rules: DEFAULT_RULES,
  seats: responseSeats,
  deck: responseDeck,
  phase: PHASES.AI_THINKING,
  currentSeat: 3,
  humanSeat: 0,
  dealerSeat: 1,
  nextDealerSeat: 1,
  slippedDealer: null,
  takeoverDealer: null,
  takeoverQueue: [],
  jiangCard: null,
  jiangPhraseId: null,
  drawnCard: null,
  selectedCardId: null,
  recentDiscard: null,
  pendingActions: [],
  playerActions: [],
  feedback: '',
  result: null,
  muted: false,
  round: 2,
});
engine.discardCard(3, responseSeats[3].hand[0].id);
if (databus.phase !== PHASES.HUMAN_RESPONSE || !databus.playerActions.find((action) => action.type === 'chi')) {
  throw new Error('human response prompt was not created');
}
engine.handlePlayerAction(databus.playerActions.find((action) => action.type === 'chi'));
if (databus.phase !== PHASES.HUMAN_DISCARD || !databus.seats[0].melds.length) {
  throw new Error('human meld action did not resolve');
}

const takeoverSeats = createSeats(DEFAULT_RULES, 0);
const takeoverDeck = createDeck(DEFAULT_RULES);
const jiangCard = takeoverDeck.splice(takeoverDeck.findIndex((card) => card.key === 'shang'), 1)[0];
takeoverSeats[0].hand = [jiangCard];
takeoverSeats[1].hand = ['da', 'da', 'da'].map((key) => takeoverDeck.splice(takeoverDeck.findIndex((card) => card.key === key), 1)[0]);
databus.setRoundState({
  rules: DEFAULT_RULES,
  seats: takeoverSeats,
  deck: takeoverDeck,
  phase: PHASES.TAKEOVER_CHOICE,
  currentSeat: 1,
  humanSeat: 0,
  dealerSeat: 0,
  nextDealerSeat: 0,
  slippedDealer: 0,
  takeoverDealer: null,
  takeoverQueue: [1],
  jiangCard,
  jiangPhraseId: jiangCard.phraseId,
  drawnCard: null,
  selectedCardId: null,
  recentDiscard: null,
  pendingActions: [],
  playerActions: [],
  feedback: '',
  result: null,
  muted: false,
  round: 3,
});
engine.acceptTakeover(1);
if (databus.dealerSeat !== 1 || !databus.seats[1].hand.find((card) => card.id === jiangCard.id)) {
  throw new Error('takeover should transfer slipped dealer jiang card');
}

const dealerChiSeats = createSeats(DEFAULT_RULES, 0);
const dealerChiDeck = createDeck(DEFAULT_RULES);
dealerChiSeats[0].hand = ['shang', 'shang', 'da', 'ren'].map((key) => dealerChiDeck.splice(dealerChiDeck.findIndex((card) => card.key === key), 1)[0]);
dealerChiSeats[3].hand = [dealerChiDeck.splice(dealerChiDeck.findIndex((card) => card.key === 'shang'), 1)[0]];
databus.setRoundState({
  rules: DEFAULT_RULES,
  seats: dealerChiSeats,
  deck: dealerChiDeck,
  phase: PHASES.AI_THINKING,
  currentSeat: 3,
  humanSeat: 0,
  dealerSeat: 0,
  nextDealerSeat: 0,
  slippedDealer: null,
  takeoverDealer: null,
  takeoverQueue: [],
  jiangCard: null,
  jiangPhraseId: null,
  drawnCard: null,
  selectedCardId: null,
  recentDiscard: null,
  pendingActions: [],
  playerActions: [],
  feedback: '',
  result: null,
  muted: false,
  round: 4,
});
engine.discardCard(3, dealerChiSeats[3].hand[0].id);
const dealerChi = databus.playerActions.find((action) => action.type === 'chi');
engine.handlePlayerAction(dealerChi);
if (databus.result.type !== 'circle-loss' || databus.result.loser !== 0) {
  throw new Error('dealer chi that removes last kezi should circle-loss');
}

engine.finishWin(0, databus.seats[0].hand[0], { summary: 'scripted win', score: 1, pattern: 'scripted', doors: [] });
if (databus.result.type !== 'win') {
  throw new Error('win result was not created');
}
engine.finishCircleLoss(0, 'scripted circle-loss');
if (databus.result.type !== 'circle-loss' || databus.result.winners.length !== 3) {
  throw new Error('circle-loss result was not created');
}
engine.finishDrawRound('scripted draw-round');
if (databus.result.type !== 'draw-round') {
  throw new Error('draw-round result was not created');
}

if (ASSET_MANIFEST.images.table !== 'images/background.jpg') {
  throw new Error('default table background must be images/background.jpg');
}
if (ASSET_MANIFEST.images.cardFront !== 'images/element.png') {
  throw new Error('default card atlas image must be images/element.png');
}
if (!ASSET_MANIFEST.atlases || ASSET_MANIFEST.atlases.cards.path !== 'images/element.atlas.json') {
  throw new Error('default card atlas metadata must be images/element.atlas.json');
}
if (ASSET_MANIFEST.audio.bgm !== 'audio/bgmusic.mp3') {
  throw new Error('default background music must be audio/bgmusic.mp3');
}
await access(join(root, ASSET_MANIFEST.images.table));
await access(join(root, ASSET_MANIFEST.images.cardFront));
await access(join(root, ASSET_MANIFEST.atlases.cards.path));
await access(join(root, ASSET_MANIFEST.audio.bgm));

const atlas = JSON.parse(await readFile(join(root, ASSET_MANIFEST.atlases.cards.path), 'utf8'));
for (const size of ['big', 'small', 'mini']) {
  if (!atlas.frames || !atlas.frames[size] || typeof atlas.frames[size] !== 'object') {
    throw new Error(`missing nested atlas frame group ${size}`);
  }
  const frameNames = Object.keys(atlas.frames[size]);
  const cardFrameNames = frameNames.filter((name) => new RegExp(`^${size}_[a-z0-9]+_(hl|hf|v)$`).test(name));
  if (cardFrameNames.length !== DEFAULT_RULES.cardSymbols.length) {
    throw new Error(`atlas ${size} group should contain 24 uniformly named card frames`);
  }
  const cardKeys = cardFrameNames.map((name) => name.match(new RegExp(`^${size}_([a-z0-9]+)_(?:hl|hf|v)$`))[1]);
  for (const symbol of DEFAULT_RULES.cardSymbols) {
    if (cardKeys.indexOf(symbol.key) < 0) {
      throw new Error(`atlas ${size} group should contain ${size}_${symbol.key}_hl/hf/v`);
    }
  }
  for (const frameName of cardFrameNames) {
    const frame = atlas.frames[size][frameName];
    const isHorizontalLeft = frameName.endsWith('_hl');
    const isHorizontalRight = frameName.endsWith('_hf');
    const isVertical = frameName.endsWith('_v');
    if ((isHorizontalLeft || isHorizontalRight) && frame.frame.w < frame.frame.h) {
      throw new Error(`atlas horizontal frame should be wider than tall: ${frameName}`);
    }
    if (isVertical && frame.frame.h < frame.frame.w) {
      throw new Error(`atlas vertical frame should be taller than wide: ${frameName}`);
    }
  }
}
const first24CardMap = buildCardAtlasFrameMap(atlas);
for (const symbol of DEFAULT_RULES.cardSymbols) {
  const bucket = first24CardMap[symbol.key];
  const sizedCount = bucket && bucket.bySize
    ? Object.values(bucket.bySize).reduce((count, matches) => count + matches.length, 0)
    : 0;
  if (!bucket || (!sizedCount && (!bucket.legacy || !bucket.legacy.length))) {
    throw new Error(`atlas should map at least one frame for ${symbol.key}`);
  }
}
if (!first24CardMap.shang.bySize.big[0].rotateCw) {
  throw new Error('horizontal shang big frame should rotate clockwise');
}
if (first24CardMap.shang.bySize.big[0].rotateCcw) {
  throw new Error('horizontal-left shang big frame should not rotate counterclockwise');
}
if (first24CardMap.fu.bySize.big[0].rotateCw) {
  throw new Error('vertical fu big frame should not rotate');
}
if (first24CardMap.shang.bySize.big[0].size !== 'big') {
  throw new Error('shang big frame should be mapped to big size');
}
if (first24CardMap.shang.bySize.small[0].size !== 'small') {
  throw new Error('shang small frame should be mapped to small size');
}
if (first24CardMap.shang.bySize.mini[0].size !== 'mini') {
  throw new Error('shang mini frame should be mapped to mini size');
}

const layoutSeats = createSeats(DEFAULT_RULES);
layoutSeats[0].hand = createDeck(DEFAULT_RULES).slice(0, DEFAULT_RULES.dealerHandSize);
const layoutState = {
  ...databus,
  seats: layoutSeats,
  humanSeat: 0,
  currentSeat: 0,
  dealerSeat: 0,
  phase: PHASES.HUMAN_DISCARD,
  playerActions: [
    { type: 'chi', label: '吃' },
    { type: 'peng', label: '碰' },
    { type: 'zhao', label: '招' },
    { type: 'ta', label: '踏' },
  ],
};

function intersects(a, b) {
  return !(
    a.x + a.width <= b.x
    || b.x + b.width <= a.x
    || a.y + a.height <= b.y
    || b.y + b.height <= a.y
  );
}

function assertInBounds(region, width, height) {
  if (
    region.x < 0
    || region.y < 0
    || region.x + region.width > width + 1
    || region.y + region.height > height + 1
  ) {
    throw new Error(`layout region out of bounds at ${width}x${height}`);
  }
}

for (const [width, height] of [[568, 320], [667, 375], [844, 390], [932, 430], [320, 568]]) {
  const layout = new TableLayout(width, height).build(layoutState);
  const allRegions = layout.handCards.concat(
    layout.actionButtons,
    layout.opponents,
    [layout.muteButton, layout.prompt, layout.result, layout.discardArea, layout.meldArea]
  );
  for (const region of allRegions) {
    assertInBounds(region, width, height);
  }

  if (layout.handCards.length) {
    const ratio = layout.handCards[0].width / layout.handCards[0].height;
    if (Math.abs(ratio - CARD_ASPECT_RATIO) > 0.015) {
      throw new Error(`hand card aspect ratio mismatch at ${width}x${height}`);
    }
    const phraseColumns = layout.handCards.map((card) => card.phraseColumn);
    for (let i = 1; i < phraseColumns.length; i++) {
      if (phraseColumns[i] < phraseColumns[i - 1]) {
        throw new Error(`hand cards should be ordered by phrase column at ${width}x${height}`);
      }
    }
    const groupedByKey = layout.handCards.reduce((groups, card) => {
      const key = `${card.phraseColumn}:${card.keyIndex}`;
      groups[key] = groups[key] || [];
      groups[key].push(card.stackIndex);
      return groups;
    }, {});
    Object.keys(groupedByKey).forEach((key) => {
      const indexes = groupedByKey[key].slice().sort((a, b) => a - b);
      indexes.forEach((value, index) => {
        if (index > 0 && value !== indexes[index - 1] + 1) {
          throw new Error(`same-key cards should be adjacent at ${width}x${height}`);
        }
      });
    });
    const expectedStackStep = Math.max(1, Math.round(HAND_STACK_SOURCE_STEP * (layout.cardHeight / CARD_SOURCE_HEIGHT)));
    if (layout.cardStep !== expectedStackStep) {
      throw new Error(`phrase stack offset should scale from small-card source at ${width}x${height}`);
    }
    const totalHandWidth = layout.cardWidth * layout.handColumns.length;
    const expectedLeft = Math.floor((width - totalHandWidth) / 2);
    for (const card of layout.handCards) {
      const expectedX = expectedLeft + card.phraseColumn * layout.cardWidth;
      if (Math.abs(card.x - expectedX) > 1) {
        throw new Error(`phrase stacks should touch and stay centered at ${width}x${height}`);
      }
    }
    const groupedByPhrase = layout.handCards.reduce((groups, card) => {
      groups[card.phraseColumn] = groups[card.phraseColumn] || [];
      groups[card.phraseColumn].push(card);
      return groups;
    }, {});
    let alignedBottom = null;
    Object.values(groupedByPhrase).forEach((cards) => {
      const sorted = cards.slice().sort((a, b) => a.stackIndex - b.stackIndex);
      for (let i = 1; i < sorted.length; i++) {
        if (Math.abs((sorted[i].y - sorted[i - 1].y) - expectedStackStep) > 1) {
          throw new Error(`same-phrase cards should stack with scaled small-card offset at ${width}x${height}`);
        }
      }
      const stackBottom = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height;
      if (alignedBottom === null) {
        alignedBottom = stackBottom;
      } else if (Math.abs(stackBottom - alignedBottom) > 1) {
        throw new Error(`phrase stacks should align to the same bottom edge at ${width}x${height}`);
      }
    });
  }

  if (width > height) {
    const protectedRegions = layout.actionButtons.concat([layout.prompt, layout.meldArea]);
    for (let i = 0; i < protectedRegions.length; i++) {
      for (let j = i + 1; j < protectedRegions.length; j++) {
        if (intersects(protectedRegions[i], protectedRegions[j])) {
          throw new Error(`landscape table regions overlap at ${width}x${height}`);
        }
      }
    }
    for (const handCard of layout.handCards) {
      for (const protectedRegion of protectedRegions) {
        if (intersects(handCard, protectedRegion)) {
          throw new Error(`landscape hand overlaps controls at ${width}x${height}`);
        }
      }
    }
  }
}

console.log('huapai checks passed');
