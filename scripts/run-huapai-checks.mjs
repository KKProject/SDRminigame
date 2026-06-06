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
  'export const SAFE_AREA_INSETS = { left: 0, top: 0, right: 0, bottom: 0 };',
  'export const SAFE_AREA_BOUNDS = { x: 0, y: 0, width: 375, height: 667 };',
].join(' '));

const { runSelfChecks } = await import(pathToFileURL(join(tempDir, 'self-check.mjs')));
const { default: HuapaiEngine } = await import(pathToFileURL(join(tempDir, 'engine.mjs')));
const {
  default: TableLayout,
  CARD_ASPECT_RATIO,
  CARD_SOURCE_HEIGHT,
  HAND_STACK_SOURCE_STEP,
} = await import(pathToFileURL(join(tempDir, 'layout.mjs')));
const { default: TableRenderer } = await import(pathToFileURL(join(tempDir, 'renderer.mjs')));
const { ASSET_MANIFEST, buildCardAtlasFrameMap } = await import(pathToFileURL(join(tempDir, 'assets.mjs')));
const { createDeck, createSeats } = await import(pathToFileURL(join(tempDir, 'cards.mjs')));
const { DEFAULT_RULES, PHASES } = await import(pathToFileURL(join(tempDir, 'rules.mjs')));
const { calculateOperationFu } = await import(pathToFileURL(join(tempDir, 'evaluator.mjs')));

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

renderCase = await loadRenderRuntime({
  windowWidth: 844,
  windowHeight: 390,
  pixelRatio: 3,
  safeArea: { left: 47, top: 0, right: 844, bottom: 369, width: 797, height: 369 },
});
if (
  renderCase.module.SCREEN_WIDTH !== 844
  || renderCase.module.SCREEN_HEIGHT !== 390
  || renderCase.module.BACKING_STORE_WIDTH !== 1688
  || renderCase.module.BACKING_STORE_HEIGHT !== 780
) {
  throw new Error('safe-area render setup should keep full logical and backing canvas sizes');
}
if (
  renderCase.module.SAFE_AREA_INSETS.left !== 47
  || renderCase.module.SAFE_AREA_INSETS.right !== 0
  || renderCase.module.SAFE_AREA_INSETS.bottom !== 21
  || renderCase.module.SAFE_AREA_BOUNDS.width !== 797
  || renderCase.module.SAFE_AREA_BOUNDS.height !== 369
) {
  throw new Error('render setup should export logical safe-area insets and bounds');
}

renderCase = await loadRenderRuntime({
  windowWidth: 844,
  windowHeight: 390,
  pixelRatio: 2,
  safeArea: { left: 900, top: 0, right: 800, bottom: 390 },
});
if (
  renderCase.module.SAFE_AREA_INSETS.left !== 0
  || renderCase.module.SAFE_AREA_INSETS.right !== 0
  || renderCase.module.SAFE_AREA_BOUNDS.width !== 844
) {
  throw new Error('invalid safe-area data should fall back to the full logical canvas');
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

engine.handleResponseWindow([
  { type: 'peng', seat: 1, responseIndex: 0, priority: 3, label: '碰' },
  { type: 'peng', seat: 0, responseIndex: 1, priority: 3, label: '碰' },
], 3);
if (databus.phase !== PHASES.AI_THINKING || databus.playerActions.length) {
  throw new Error('AI response ownership should not prompt the human player');
}
if (engine.aiTimer) clearTimeout(engine.aiTimer);

const transitionRules = { ...DEFAULT_RULES, unclaimedDiscardSettleMs: 5, aiDelayMs: 1000 };
engine.rules = transitionRules;
const transitionSeats = createSeats(transitionRules, 0);
const transitionDeck = createDeck(transitionRules);
const unclaimedCard = transitionDeck.shift();
transitionSeats[1].discards.push(unclaimedCard);
databus.setRoundState({
  rules: transitionRules,
  seats: transitionSeats,
  deck: transitionDeck,
  phase: PHASES.AI_THINKING,
  currentSeat: 1,
  humanSeat: 0,
  dealerSeat: 0,
  nextDealerSeat: 0,
  slippedDealer: null,
  takeoverDealer: null,
  takeoverQueue: [],
  jiangCard: null,
  jiangPhraseId: null,
  appearingCard: { card: unclaimedCard, source: 'discard', sourceSeat: 1 },
  drawnCard: null,
  selectedCardId: null,
  recentDiscard: { seat: 1, card: unclaimedCard },
  pendingActions: [],
  playerActions: [],
  feedback: '',
  result: null,
  muted: false,
  round: 2,
});
const deckBeforeUnclaimedAdvance = databus.deck.length;
engine.resolveUnclaimedAppearingCard(1);
if (
  databus.deck.length !== deckBeforeUnclaimedAdvance
  || !databus.recentDiscard.unclaimed
  || databus.currentSeat !== 1
) {
  throw new Error('unclaimed card should enter discard area before next player draws');
}
await new Promise((resolve) => setTimeout(resolve, transitionRules.unclaimedDiscardSettleMs + 10));
if (databus.deck.length >= deckBeforeUnclaimedAdvance) {
  throw new Error('next player should draw only after unclaimed discard settles');
}
if (engine.aiTimer) clearTimeout(engine.aiTimer);
if (engine.advanceTimer) clearTimeout(engine.advanceTimer);
engine.rules = DEFAULT_RULES;

const fastMeldRules = { ...DEFAULT_RULES, meldActionSettleMs: 5 };
engine.rules = fastMeldRules;
const responseSeats = createSeats(fastMeldRules, 1);
const responseDeck = createDeck(fastMeldRules);
responseSeats[0].hand = ['da', 'ren'].map((key) => responseDeck.splice(responseDeck.findIndex((card) => card.key === key), 1)[0]);
responseSeats[3].hand = [responseDeck.splice(responseDeck.findIndex((card) => card.key === 'shang'), 1)[0]];
databus.setRoundState({
  rules: fastMeldRules,
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
if (databus.phase !== PHASES.AI_THINKING || !databus.seats[0].melds.length) {
  throw new Error('human meld should wait for its animation before discard phase');
}
await new Promise((resolve) => setTimeout(resolve, fastMeldRules.meldActionSettleMs + 10));
if (databus.phase !== PHASES.HUMAN_DISCARD || !databus.seats[0].melds.length) {
  throw new Error('human meld action did not resolve');
}
engine.rules = DEFAULT_RULES;

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
engine.rules = fastMeldRules;
engine.handlePlayerAction(dealerChi);
await new Promise((resolve) => setTimeout(resolve, fastMeldRules.meldActionSettleMs + 10));
if (databus.result.type !== 'circle-loss' || databus.result.loser !== 0) {
  throw new Error('dealer chi that removes last kezi should circle-loss');
}
engine.rules = DEFAULT_RULES;

engine.finishWin(0, databus.seats[0].hand[0], { summary: 'scripted win', score: 1, pattern: 'scripted', doors: [] });
if (databus.result.type !== 'win' || databus.result.settlement.payments.length !== 3) {
  throw new Error('win result was not created');
}
engine.finishCircleLoss(0, 'scripted circle-loss');
if (databus.result.type !== 'circle-loss' || databus.result.winners.length !== 3 || databus.result.settlement.payments.length !== 3) {
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
  const cardFrameNames = frameNames.filter((name) => new RegExp(`^${size}_[a-z0-9]+_(hl|hr|v)$`).test(name));
  if (cardFrameNames.length !== DEFAULT_RULES.cardSymbols.length) {
    throw new Error(`atlas ${size} group should contain 24 uniformly named card frames`);
  }
  const cardKeys = cardFrameNames.map((name) => name.match(new RegExp(`^${size}_([a-z0-9]+)_(?:hl|hr|v)$`))[1]);
  for (const symbol of DEFAULT_RULES.cardSymbols) {
    if (cardKeys.indexOf(symbol.key) < 0) {
      throw new Error(`atlas ${size} group should contain ${size}_${symbol.key}_hl/hr/v`);
    }
  }
  for (const frameName of cardFrameNames) {
    const frame = atlas.frames[size][frameName];
    const isHorizontalLeft = frameName.endsWith('_hl');
    const isHorizontalRight = frameName.endsWith('_hr');
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
if (!first24CardMap.shang.bySize.mini[0].rotateCcw) {
  throw new Error('horizontal-right shang mini frame should rotate counterclockwise');
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

function takeCards(deck, keys) {
  return keys.map((key) => {
    const index = deck.findIndex((card) => card.key === key);
    if (index < 0) throw new Error(`missing card ${key} in test deck`);
    return deck.splice(index, 1)[0];
  });
}

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

function assertWithinBounds(region, bounds, label) {
  if (!region) throw new Error(`${label} is missing`);
  if (
    region.x < bounds.x - 1
    || region.y < bounds.y - 1
    || region.x + region.width > bounds.x + bounds.width + 1
    || region.y + region.height > bounds.y + bounds.height + 1
  ) {
    throw new Error(`${label} should stay inside safe content bounds`);
  }
}

function visibleSafeRegions(layout) {
  return layout.handCards.concat(
    layout.actionButtons,
    Object.values(layout.playerFronts || {}),
    Object.values(layout.unclaimedZones || {}),
    Object.values(layout.claimedZones || {}),
    Object.values(layout.seatStatusAreas || {}),
    Object.values(layout.seatStatusAreas || {}).flatMap((area) => [area.avatar, area.totalScore, area.roundFu]),
    [layout.muteButton, layout.centerFocus, layout.prompt, layout.result, layout.actionModal]
  ).filter((region) => region && region.width > 0 && region.height > 0);
}

for (const [width, height] of [[568, 320], [667, 375], [844, 390], [932, 430], [320, 568]]) {
  const layout = new TableLayout(width, height).build(layoutState);
  const allRegions = layout.handCards.concat(
    layout.actionButtons,
    Object.values(layout.playerFronts || {}),
    Object.values(layout.unclaimedZones || {}),
    Object.values(layout.claimedZones || {}),
    Object.values(layout.seatStatusAreas || {}),
    Object.values(layout.seatStatusAreas || {}).flatMap((area) => [area.avatar, area.totalScore, area.roundFu]),
    [layout.muteButton, layout.topBar, layout.centerFocus, layout.prompt, layout.result, layout.actionArea, layout.actionModal]
  );
  for (const region of allRegions) {
    assertInBounds(region, width, height);
  }

  for (const side of ['bottom', 'left', 'top', 'right']) {
    if (!layout.playerFronts[side] || !layout.unclaimedZones[side] || !layout.claimedZones[side]) {
      throw new Error(`placement table layout should expose ${side} front and mini-card zones at ${width}x${height}`);
    }
    if (!layout.seatStatusAreas || !layout.seatStatusAreas[side]) {
      throw new Error(`seat status area should exist for ${side} at ${width}x${height}`);
    }
    const queueCapacity = Math.floor(layout.unclaimedZones[side].width / (layout.miniCardWidth || 1));
    if (queueCapacity < 3) {
      throw new Error(`unclaimed mini-card queue should fit multiple cards at ${width}x${height}`);
    }
    const claimedCapacity = Math.floor(layout.claimedZones[side].width / (layout.miniCardWidth || 1));
    if (claimedCapacity < 3) {
      throw new Error(`claimed mini-card row should fit multiple cards at ${width}x${height}`);
    }
  }

  const discardDirections = { bottom: 'rtl', left: 'ltr', top: 'ltr', right: 'rtl' };
  const claimedDirections = { bottom: 'ltr', left: 'ltr', top: 'rtl', right: 'rtl' };
  for (const side of Object.keys(discardDirections)) {
    if (layout.unclaimedZones[side].direction !== discardDirections[side]) {
      throw new Error(`discard direction mismatch for ${side} at ${width}x${height}`);
    }
    if (layout.claimedZones[side].direction !== claimedDirections[side]) {
      throw new Error(`claimed direction mismatch for ${side} at ${width}x${height}`);
    }
  }

  if (Math.abs((layout.seatStatusAreas.top.avatar.x + layout.seatStatusAreas.top.avatar.width / 2) - (width / 2)) > 1) {
    throw new Error(`opposite avatar should be centered at top at ${width}x${height}`);
  }
  if (layout.seatStatusAreas.bottom.x > layout.safe + 1 || layout.seatStatusAreas.bottom.avatar.y < height / 2) {
    throw new Error(`self avatar should stay near lower-left corner at ${width}x${height}`);
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
    const protectedRegions = layout.actionButtons;
    for (let i = 0; i < protectedRegions.length; i++) {
      for (let j = i + 1; j < protectedRegions.length; j++) {
        if (intersects(protectedRegions[i], protectedRegions[j])) {
          throw new Error(`modal action regions overlap at ${width}x${height}`);
        }
      }
    }
    for (const handCard of layout.handCards) {
      for (const protectedRegion of protectedRegions) {
        if (intersects(handCard, protectedRegion)) {
          throw new Error(`landscape hand overlaps controls at ${width}x${height}`);
        }
      }
      if (layout.actionModal.visible && intersects(handCard, layout.actionModal)) {
        throw new Error(`landscape hand overlaps action modal at ${width}x${height}`);
      }
    }
    for (const handCard of layout.handCards) {
      for (const claimedZone of Object.values(layout.claimedZones)) {
        if (claimedZone.side === 'bottom' && intersects(handCard, claimedZone)) {
          throw new Error(`bottom claimed mini cards should not cover hand cards at ${width}x${height}`);
        }
      }
    }
  }
}

for (const safeCase of [
  { width: 844, height: 390, insets: { left: 47, top: 0, right: 0, bottom: 21 }, label: 'left-notch landscape' },
  { width: 844, height: 390, insets: { left: 0, top: 0, right: 47, bottom: 21 }, label: 'right-notch landscape' },
  { width: 932, height: 430, insets: { left: 59, top: 8, right: 0, bottom: 24 }, label: 'tall safe-area landscape' },
  { width: 844, height: 390, insets: null, label: 'missing safe-area landscape' },
]) {
  const layout = new TableLayout(safeCase.width, safeCase.height, {
    safeAreaInsets: safeCase.insets,
  }).build(layoutState);
  const expectedLeft = (safeCase.insets && safeCase.insets.left ? safeCase.insets.left : 0) + layout.safe;
  const expectedTop = (safeCase.insets && safeCase.insets.top ? safeCase.insets.top : 0) + layout.safe;
  const expectedRight = safeCase.width - ((safeCase.insets && safeCase.insets.right ? safeCase.insets.right : 0) + layout.safe);
  const expectedBottom = safeCase.height - ((safeCase.insets && safeCase.insets.bottom ? safeCase.insets.bottom : 0) + layout.safe);
  if (
    layout.contentBounds.x !== expectedLeft
    || layout.contentBounds.y !== expectedTop
    || layout.contentBounds.x + layout.contentBounds.width !== expectedRight
    || layout.contentBounds.y + layout.contentBounds.height !== expectedBottom
  ) {
    throw new Error(`content bounds mismatch for ${safeCase.label}`);
  }
  visibleSafeRegions(layout).forEach((region) => {
    assertWithinBounds(region, layout.contentBounds, `${region.type || 'region'} in ${safeCase.label}`);
  });
  const rendererForSafeArea = new TableRenderer({
    getImage() { return null; },
    getCardSprite() { return null; },
    getCardBackSprite() { return null; },
  });
  [0, 1, 2, 3].forEach((seat) => {
    const start = rendererForSafeArea.animationStartForSeat(seat, layout);
    const front = rendererForSafeArea.animationEndForSeat(seat, layout);
    const discard = rendererForSafeArea.discardAnimationEnd(seat, layout);
    const claimed = rendererForSafeArea.claimedAnimationEnd(seat, layout);
    const size = rendererForSafeArea.animationCardSize(layout);
    [start, front, discard, claimed].forEach((point) => {
      assertWithinBounds(
        { x: point.x, y: point.y, width: size.width, height: size.height, type: 'animation-card' },
        layout.contentBounds,
        `animation endpoint seat ${seat} in ${safeCase.label}`
      );
    });
  });
}

const splitDeck = createDeck(DEFAULT_RULES);
const splitSeats = createSeats(DEFAULT_RULES);
splitSeats[0].hand = takeCards(splitDeck, [
  'shang', 'shang', 'shang', 'shang',
  'da', 'da', 'da',
  'ren', 'ren', 'ren',
  'kong', 'yi',
  'fu',
]);
let splitLayout = new TableLayout(844, 390).build({
  ...layoutState,
  seats: splitSeats,
  playerActions: [],
});
if (splitLayout.handColumns.length !== 4) {
  throw new Error('hand split should create adjacent split, remainder, partial phrase and singles columns');
}
if (splitLayout.handColumns[0].cards.length !== 4 || splitLayout.handColumns[0].groups[0].key !== 'shang') {
  throw new Error('hand split should move the most frequent word into its own first adjacent column');
}
if (splitLayout.handColumns[1].cards.length !== 6 || splitLayout.handColumns[1].groups.map((group) => group.key).join(',') !== 'da,ren') {
  throw new Error('hand split should keep the <=6 remaining words in one phrase column');
}
if (!splitLayout.handColumns[3].singleCollection || splitLayout.handColumns[3].cards[0].key !== 'fu') {
  throw new Error('single-word phrase groups should be collected into the last hand column');
}
if (!splitLayout.handColumns.every((column) => column.cards.length <= 6)) {
  throw new Error('every hand column should contain at most six cards');
}

const pairSingletonDeck = createDeck(DEFAULT_RULES);
const pairSingletonSeats = createSeats(DEFAULT_RULES);
pairSingletonSeats[0].hand = takeCards(pairSingletonDeck, [
  'kong', 'kong',
  'fu',
]);
const pairSingletonLayout = new TableLayout(844, 390).build({
  ...layoutState,
  seats: pairSingletonSeats,
  playerActions: [],
});
const singletonColumn = pairSingletonLayout.handColumns.find((column) => column.singleCollection);
if (!singletonColumn || singletonColumn.cards.map((card) => card.key).join(',') !== 'fu') {
  throw new Error('initial singleton column should contain only true single cards');
}
if (!pairSingletonLayout.handColumns.find((column) => !column.singleCollection && column.cards.length === 2 && column.cards.every((card) => card.key === 'kong'))) {
  throw new Error('initial singleton column should not mix pairs into the final single-card column');
}

const stableDiscardDeck = createDeck(DEFAULT_RULES);
const stableDiscardSeats = createSeats(DEFAULT_RULES);
stableDiscardSeats[0].hand = takeCards(stableDiscardDeck, [
  'shang', 'shang',
  'kong',
]);
const stableDiscardLayoutBuilder = new TableLayout(844, 390);
let stableLayout = stableDiscardLayoutBuilder.build({
  ...layoutState,
  seats: stableDiscardSeats,
  playerActions: [],
});
if (stableLayout.handColumns[0].cards.length !== 2 || stableLayout.handColumns[0].cards[0].key !== 'shang') {
  throw new Error('stable discard setup should begin with a shang pair column');
}
stableDiscardSeats[0].hand = stableDiscardSeats[0].hand.filter((card) => !(card.key === 'shang' && card.copy === 0));
stableLayout = stableDiscardLayoutBuilder.build({
  ...layoutState,
  seats: stableDiscardSeats,
  playerActions: [],
});
if (
  stableLayout.handColumns[0].singleCollection
  || stableLayout.handColumns[0].cards.length !== 1
  || stableLayout.handColumns[0].cards[0].key !== 'shang'
) {
  throw new Error('discard should keep a non-empty original hand column even when one card remains');
}

const stableMeldDeck = createDeck(DEFAULT_RULES);
const stableMeldSeats = createSeats(DEFAULT_RULES);
stableMeldSeats[0].hand = takeCards(stableMeldDeck, [
  'shang', 'shang',
  'da',
  'ren',
  'kong',
]);
const stableMeldLayoutBuilder = new TableLayout(844, 390);
stableLayout = stableMeldLayoutBuilder.build({
  ...layoutState,
  seats: stableMeldSeats,
  playerActions: [],
});
if (stableLayout.handColumns[0].cards.map((card) => card.key).join(',') !== 'shang,shang,da,ren') {
  throw new Error('stable meld setup should begin with a same-phrase column');
}
stableMeldSeats[0].hand = stableMeldSeats[0].hand.filter((card) => (
  card.key === 'shang' && card.copy === 1
) || card.key === 'kong');
stableLayout = stableMeldLayoutBuilder.build({
  ...layoutState,
  seats: stableMeldSeats,
  playerActions: [],
});
if (
  stableLayout.handColumns[0].singleCollection
  || stableLayout.handColumns[0].cards.length !== 1
  || stableLayout.handColumns[0].cards[0].key !== 'shang'
) {
  throw new Error('meld should keep a non-empty original hand column even when one card remains');
}

const emptyCollapseDeck = createDeck(DEFAULT_RULES);
const emptyCollapseSeats = createSeats(DEFAULT_RULES);
emptyCollapseSeats[0].hand = takeCards(emptyCollapseDeck, [
  'shang', 'shang',
  'kong', 'kong',
  'fu',
]);
const emptyCollapseLayoutBuilder = new TableLayout(844, 390);
stableLayout = emptyCollapseLayoutBuilder.build({
  ...layoutState,
  seats: emptyCollapseSeats,
  playerActions: [],
});
if (stableLayout.handColumns.map((column) => column.cards[0].key).join(',') !== 'shang,kong,fu') {
  throw new Error('empty collapse setup should begin with adjacent pair and singleton columns');
}
emptyCollapseSeats[0].hand = emptyCollapseSeats[0].hand.filter((card) => card.key !== 'shang');
stableLayout = emptyCollapseLayoutBuilder.build({
  ...layoutState,
  seats: emptyCollapseSeats,
  playerActions: [],
});
if (stableLayout.handColumns.map((column) => column.cards[0].key).join(',') !== 'kong,fu') {
  throw new Error('empty hand columns should collapse while preserving remaining column order');
}

const collapsedDeck = createDeck(DEFAULT_RULES);
const collapsedSeats = createSeats(DEFAULT_RULES);
collapsedSeats[0].hand = takeCards(collapsedDeck, [
  'da', 'da', 'da',
  'ren', 'ren', 'ren',
  'kong', 'yi',
  'fu',
]);
splitLayout = new TableLayout(844, 390).build({
  ...layoutState,
  seats: collapsedSeats,
  playerActions: [],
});
const columnIndexes = splitLayout.handColumns.map((_, index) => index);
if (columnIndexes.join(',') !== '0,1,2' || splitLayout.handCards.some((card) => card.key === 'shang')) {
  throw new Error('empty split columns should collapse while preserving remaining order');
}

const fuDeck = createDeck(DEFAULT_RULES);
const operationFu = calculateOperationFu([
  { type: 'chi', label: '吃', cards: takeCards(fuDeck, ['shang', 'da', 'ren']) },
  { type: 'peng', label: '碰', key: 'da', cards: takeCards(fuDeck, ['da', 'da', 'da']) },
  { type: 'zhao', label: '招', key: 'shang', cards: takeCards(fuDeck, ['shang', 'shang', 'shang', 'shang']) },
], DEFAULT_RULES, { jiangPhraseId: 'sdr' });
if (operationFu.totalFu !== 60 || operationFu.entries.find((entry) => entry.type === 'chi').fu !== 4) {
  throw new Error('operation fu should include jiang chi=4 and color/jiang scores for peng and natural zhao');
}
if (calculateOperationFu(createSeats(DEFAULT_RULES)[0].melds, DEFAULT_RULES).totalFu !== 0) {
  throw new Error('new round operation fu should derive as zero from empty exposed melds');
}

function createFakeRenderContext() {
  const calls = [];
  return {
    calls,
    clearRect: (...args) => calls.push(['clearRect', args]),
    fillRect: (...args) => calls.push(['fillRect', args]),
    drawImage: (...args) => calls.push(['drawImage', args]),
    beginPath: () => calls.push(['beginPath']),
    moveTo: (...args) => calls.push(['moveTo', args]),
    lineTo: (...args) => calls.push(['lineTo', args]),
    quadraticCurveTo: (...args) => calls.push(['quadraticCurveTo', args]),
    closePath: () => calls.push(['closePath']),
    fill: () => calls.push(['fill']),
    stroke: () => calls.push(['stroke']),
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    translate: (...args) => calls.push(['translate', args]),
    rotate: (...args) => calls.push(['rotate', args]),
    fillText: (...args) => calls.push(['fillText', args]),
    measureText: (text) => ({ width: String(text || '').length * 7 }),
    createLinearGradient: (...args) => {
      calls.push(['createLinearGradient', args]);
      return {
        addColorStop() {},
      };
    },
  };
}

const renderSeats = createSeats(DEFAULT_RULES);
const renderDeck = createDeck(DEFAULT_RULES);
renderSeats[0].hand = renderDeck.slice(0, DEFAULT_RULES.dealerHandSize);
renderSeats[1].discards = renderDeck.slice(24, 29);
renderSeats[2].discards = renderDeck.slice(29, 34);
renderSeats[3].discards = renderDeck.slice(34, 39);
renderSeats[0].melds = [{ label: '吃', cards: renderDeck.slice(39, 42) }];
const renderer = new TableRenderer({
  getImage(name) { return name === 'table' ? { id: 'table-image' } : null; },
  getCardSprite() { return null; },
  getCardBackSprite() { return null; },
});
const directionRenderer = new TableRenderer({
  getImage() { return null; },
  getCardSprite() { return null; },
  getCardBackSprite() { return null; },
});
let miniPositions = [];
directionRenderer.drawCard = (ctx, card, x, y, cardWidth, cardHeight, front, selected, size) => {
  miniPositions.push({ x, cardWidth, size });
};
directionRenderer.drawMiniSequence({}, { x: 10, y: 5, width: 48, height: 20, direction: 'rtl' }, renderDeck.slice(0, 3), { miniCardWidth: 16, miniCardHeight: 20 });
if (miniPositions.map((item) => item.x).join(',') !== '42,26,10') {
  throw new Error('rtl mini-card rendering should place cards right-to-left with no gap');
}
miniPositions = [];
directionRenderer.drawMiniSequence({}, { x: 10, y: 5, width: 48, height: 20, direction: 'ltr' }, renderDeck.slice(0, 3), { miniCardWidth: 16, miniCardHeight: 20 });
if (miniPositions.map((item) => item.x).join(',') !== '10,26,42') {
  throw new Error('ltr mini-card rendering should place cards left-to-right with no gap');
}
miniPositions = [];
directionRenderer.drawCard = (ctx, card, x, y, cardWidth, cardHeight, front, selected, size) => {
  miniPositions.push({ x, y, size });
};
directionRenderer.drawClaimedColumns(
  {},
  { x: 100, y: 20, width: 48, height: 120, direction: 'rtl' },
  [{ cards: renderDeck.slice(0, 3) }, { cards: renderDeck.slice(3, 6) }],
  { miniCardWidth: 16, miniCardHeight: 20 }
);
if (miniPositions.map((item) => `${item.x}:${item.y}`).join(',') !== '132:20,132:40,132:60,116:20,116:40,116:60') {
  throw new Error('claimed melds should render each meld as one right-to-left vertical column with no gap');
}
miniPositions = [];
directionRenderer.drawClaimedColumns(
  {},
  { x: 100, y: 20, width: 48, height: 120, direction: 'ltr' },
  [{ cards: renderDeck.slice(0, 3) }, { cards: renderDeck.slice(3, 6) }],
  { miniCardWidth: 16, miniCardHeight: 20 }
);
if (miniPositions.map((item) => `${item.x}:${item.y}`).join(',') !== '100:20,100:40,100:60,116:20,116:40,116:60') {
  throw new Error('claimed melds should render each meld as one left-to-right vertical column with no gap');
}
const animationSize = directionRenderer.animationCardSize(new TableLayout(667, 375).build(layoutState));
if (Math.abs((animationSize.width / animationSize.height) - (88 / 307)) > 0.01) {
  throw new Error('big-card animation should preserve the big atlas card ratio');
}
if (!directionRenderer.shouldHoldRecentDiscard({
  ...layoutState,
  recentDiscard: { seat: 1, card: renderDeck[24] },
  pendingActions: [{ type: 'chi', seat: 0 }],
  playerActions: [],
}, 1)) {
  throw new Error('recent discard should remain at the player front while responses are pending');
}
const discardResolutionLayout = new TableLayout(667, 375).build(layoutState);
const pendingDiscardCard = renderDeck[24];
const pendingDiscardState = {
  ...layoutState,
  seats: createSeats(DEFAULT_RULES),
  recentDiscard: { seat: 1, card: pendingDiscardCard },
  pendingActions: [{ type: 'chi', seat: 0 }],
  playerActions: [{ type: 'chi', seat: 0 }, { type: 'pass', seat: 0 }],
  phase: PHASES.HUMAN_RESPONSE,
};
pendingDiscardState.seats[1].discards = [pendingDiscardCard];
const pendingDiscardRenderer = new TableRenderer({
  getImage() { return null; },
  getCardSprite() { return null; },
  getCardBackSprite() { return null; },
});
pendingDiscardRenderer.updateAnimation(pendingDiscardState, discardResolutionLayout);
pendingDiscardRenderer.animation.startedAt -= pendingDiscardRenderer.animation.duration;
pendingDiscardRenderer.drawCard = () => {};
pendingDiscardRenderer.drawCardAnimation({}, discardResolutionLayout);
if (pendingDiscardRenderer.animation.stage !== 'hold-discard') {
  throw new Error('pending human response should hold the discard at the player front');
}
if (!pendingDiscardRenderer.shouldHideDiscardMini(pendingDiscardState, 1)) {
  throw new Error('pending human response should not duplicate the discard in the discard mini area');
}
let fallbackDraws = [];
const fallbackRenderer = new TableRenderer({
  getImage() { return null; },
  getCardSprite() { return null; },
  getCardBackSprite() { return null; },
});
fallbackRenderer.drawCard = (ctx, card, x, y, cardWidth, cardHeight, front, selected, size) => {
  fallbackDraws.push({ card, x, y, size });
};
fallbackRenderer.drawHeldDiscardFallback({}, pendingDiscardState, discardResolutionLayout);
if (fallbackDraws.length !== 1 || fallbackDraws[0].card.id !== pendingDiscardCard.id || fallbackDraws[0].size !== 'big') {
  throw new Error('pending human response should draw a fallback big discard if animation state is momentarily absent');
}
const claimState = {
  ...pendingDiscardState,
  recentDiscard: null,
  pendingActions: [],
  playerActions: [],
  drawnCard: renderDeck[30],
  currentSeat: 2,
};
claimState.seats = createSeats(DEFAULT_RULES);
claimState.seats[0].melds = [{ id: 'claim-test', cards: [pendingDiscardCard] }];
pendingDiscardRenderer.updateAnimation(claimState, discardResolutionLayout);
if (pendingDiscardRenderer.animation.stage !== 'to-claimed' || pendingDiscardRenderer.animation.card.id !== pendingDiscardCard.id) {
  throw new Error('claimed discard should resolve to the claiming player before later draw animations');
}
if (pendingDiscardRenderer.resolvingClaimedMiniId(claimState, 0) !== pendingDiscardCard.id) {
  throw new Error('claimed mini card should stay hidden until the claim animation completes');
}
const passRenderer = new TableRenderer({
  getImage() { return null; },
  getCardSprite() { return null; },
  getCardBackSprite() { return null; },
});
passRenderer.animation = passRenderer.createCardAnimation(
  `discard:1:${pendingDiscardCard.id}`,
  pendingDiscardCard,
  passRenderer.animationEndForSeat(1, discardResolutionLayout),
  passRenderer.animationEndForSeat(1, discardResolutionLayout),
  'hold-discard',
  420
);
passRenderer.lastDiscardEvent = {
  seat: 1,
  card: pendingDiscardCard,
  holdPosition: passRenderer.animationEndForSeat(1, discardResolutionLayout),
};
const passState = {
  ...pendingDiscardState,
  pendingActions: [],
  playerActions: [],
  drawnCard: renderDeck[31],
  currentSeat: 2,
};
passRenderer.updateAnimation(passState, discardResolutionLayout);
if (passRenderer.animation.stage !== 'to-discard' || passRenderer.animation.card.id !== pendingDiscardCard.id) {
  throw new Error('passed discard should resolve to the discarder area before later draw animations');
}
if (passRenderer.resolvingDiscardMiniId(1) !== pendingDiscardCard.id) {
  throw new Error('discard mini card should stay hidden until the discard animation completes');
}
renderer.layout = new TableLayout(667, 375);
const fakeCtx = createFakeRenderContext();
renderer.render(fakeCtx, {
  ...layoutState,
  seats: renderSeats,
  deck: renderDeck.slice(42),
  recentDiscard: { seat: 1, card: renderDeck[24] },
  jiangCard: renderDeck[0],
  jiangPhraseId: renderDeck[0].phraseId,
  feedback: '渲染检查',
});
if (!renderer.lastLayout || !renderer.lastLayout.centerFocus || !renderer.lastLayout.seatPanels.bottom) {
  throw new Error('renderer should keep the placement table layout after rendering');
}
if (!fakeCtx.calls.find((call) => call[0] === 'fillText' && call[1][0] === '渲染检查')) {
  throw new Error('renderer should draw modal feedback in the placement layout');
}
if (!fakeCtx.calls.find((call) => call[0] === 'clearRect')) {
  throw new Error('renderer smoke test should exercise canvas drawing');
}
const tableDrawCall = fakeCtx.calls.find((call) => call[0] === 'drawImage' && call[1][0] && call[1][0].id === 'table-image');
if (!tableDrawCall) {
  throw new Error('renderer should draw the table background image as the primary surface');
}
if (tableDrawCall[1][1] !== 0 || tableDrawCall[1][2] !== 0 || tableDrawCall[1][3] !== 667 || tableDrawCall[1][4] !== 375) {
  throw new Error('renderer should draw the table background across the full canvas, not only safe content bounds');
}
if (fakeCtx.calls.find((call) => call[0] === 'createLinearGradient')) {
  throw new Error('renderer should not draw a generated table panel over the background');
}
if (fakeCtx.calls.find((call) => call[0] === 'fillRect')) {
  throw new Error('renderer should not tint or cover the background image during normal play');
}
if (!renderer.animation || renderer.animation.card.id !== renderDeck[24].id) {
  throw new Error('renderer should create a big-card animation for recent discard');
}
if (
  renderer.animation.start.x === renderer.animation.end.x
  && renderer.animation.start.y === renderer.animation.end.y
) {
  throw new Error('card animation should have distinct movement endpoints');
}

console.log('huapai checks passed');
