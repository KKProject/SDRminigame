import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tempDir = join(root, '.tmp-animation-checks');
const sourceDir = join(root, 'js/game/animation');

function rewriteImports(source) {
  return source
    .replace(/from '(\.\/[^']+)'/g, "from '$1.mjs'")
    .replace("from '../../vendor/tween/tween.esm'", "from './tween.mjs'");
}

await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });
for (const file of ['manager', 'presets', 'targets', 'state-controller', 'controller']) {
  await writeFile(join(tempDir, `${file}.mjs`), rewriteImports(await readFile(join(sourceDir, `${file}.js`), 'utf8')));
}
await writeFile(join(tempDir, 'tween.mjs'), await readFile(join(root, 'js/vendor/tween/tween.esm.js'), 'utf8'));

const { default: AnimationManager } = await import(pathToFileURL(join(tempDir, 'manager.mjs')));
const { default: StateAnimationController } = await import(pathToFileURL(join(tempDir, 'state-controller.mjs')));
const { default: TableAnimationController } = await import(pathToFileURL(join(tempDir, 'controller.mjs')));
const { eventPlan, stableEventId } = await import(pathToFileURL(join(tempDir, 'presets.mjs')));
const { cardSize, claimedMeldTargets, claimedTarget, discardMiniTarget, discardTarget, seatFront, seatStart } = await import(pathToFileURL(join(tempDir, 'targets.mjs')));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const manager = new AnimationManager();
const target = { x: 0 };
let completeCount = 0;
manager.play({
  id: 'sequence',
  visuals: [],
  steps: [
    { type: 'tween', target, to: { x: 10 }, duration: 100 },
    { type: 'tween', target, to: { x: 20 }, duration: 100 },
  ],
}, () => { completeCount += 1; });
manager.update(0);
manager.update(100);
assert(target.x === 10, 'sequence should finish its first tween before starting the second');
manager.update(200);
assert(target.x === 20 && completeCount === 1, 'sequence should complete exactly once');
manager.update(300);
assert(completeCount === 1, 'completed animation callback should not repeat');

const parallel = { x: 0, alpha: 1 };
manager.play({
  id: 'parallel',
  visuals: [],
  steps: [{
    type: 'parallel',
    steps: [
      { type: 'tween', target: parallel, to: { x: 30 }, duration: 100 },
      { type: 'tween', target: parallel, to: { alpha: 0 }, duration: 200 },
    ],
  }],
});
manager.update(300);
manager.update(400);
assert(parallel.x === 30 && parallel.alpha > 0, 'parallel steps should update independently');
manager.update(500);
assert(parallel.alpha === 0, 'parallel plan should wait for its longest child');

let cancelledComplete = false;
manager.play({
  id: 'cancel',
  visuals: [{ kind: 'text', label: '取消' }],
  steps: [{ type: 'wait', duration: 100 }],
}, () => { cancelledComplete = true; });
manager.cancel('cancel');
manager.update(1000);
assert(!cancelledComplete && manager.getVisualState().length === 0, 'cancel should remove visuals and suppress completion');

let previewComplete = 0;
manager.startPreview(
  { type: 'discard' },
  { id: 'preview', visuals: [], steps: [{ type: 'wait', duration: 100 }] }
);
assert(manager.confirmPreview({ type: 'discard', seat: 0 }, () => { previewComplete += 1; }), 'matching preview should confirm');
manager.update(1000);
manager.update(1100);
assert(previewComplete === 1, 'confirmed preview should complete once');
const transferredVisual = { kind: 'card', card: { id: 'held-preview' }, retain: true };
manager.startPreview(
  { type: 'discard' },
  { id: 'transfer-preview', visuals: [transferredVisual], steps: [] }
);
manager.transferVisuals('transfer-preview', 'held:held-preview');
manager.finishPreview();
assert(manager.getVisualState().includes(transferredVisual), 'finishing a confirmed preview should preserve transferred held visuals');
manager.release('held:held-preview');

const layout = {
  width: 844,
  height: 390,
  cardWidth: 42,
  contentBounds: { x: 47, y: 0, width: 797, height: 369 },
  playerFronts: {
    bottom: { x: 300, y: 250, width: 200, height: 80 },
    right: { x: 720, y: 130, width: 70, height: 100 },
    top: { x: 300, y: 10, width: 200, height: 80 },
    left: { x: 60, y: 130, width: 70, height: 100 },
  },
  unclaimedZones: {
    bottom: { x: 500, y: 280, width: 200, height: 60, direction: 'rtl' },
    right: { x: 650, y: 100, width: 160, height: 60, direction: 'rtl' },
    top: { x: 350, y: 40, width: 160, height: 60, direction: 'ltr' },
    left: { x: 60, y: 100, width: 160, height: 60, direction: 'ltr' },
  },
  claimedZones: {
    bottom: { x: 60, y: 260, width: 200, height: 100, direction: 'ltr' },
    right: { x: 620, y: 100, width: 160, height: 180, direction: 'rtl' },
    top: { x: 80, y: 40, width: 160, height: 180, direction: 'rtl' },
    left: { x: 60, y: 100, width: 160, height: 180, direction: 'ltr' },
  },
  miniCardWidth: 16,
  miniCardHeight: 20,
};
const size = cardSize(layout);
[0, 1, 2, 3].forEach((seat) => {
  const start = seatStart(seat, layout);
  const front = seatFront(seat, layout);
  [start, front].forEach((point) => {
    assert(point.x >= layout.contentBounds.x && point.y >= layout.contentBounds.y, 'seat animation target should respect safe bounds');
    assert(point.x + size.width <= layout.contentBounds.x + layout.contentBounds.width, 'seat animation target should fit horizontally');
  });
});
assert(discardTarget(0, layout).x > claimedTarget(0, layout).x, 'discard and claimed targets should resolve to their own zones');
[0, 1, 2, 3].forEach((seat) => {
  const mini = discardMiniTarget(seat, layout, 2);
  assert(mini.width === 16 && mini.height === 20, 'discard mini target should use the exact static mini size');
  const meldTargets = claimedMeldTargets(seat, layout, 1, 3, 2);
  assert(meldTargets.length === 3 && meldTargets[1].y - meldTargets[0].y === 20, 'meld targets should match static claimed rows');
});

const card = { id: 'card-1', key: 'shang' };
const plan = eventPlan({ eventSeq: 9, type: 'discard', seat: 0, card }, { layout });
assert(plan.id === 'online:9' && plan.visuals[0].card === card, 'event preset should create a stable online card plan');
assert(plan.visuals[0].scale === 0.8 && plan.visuals[0].retain, 'await-response appearance should pulse from 80 percent and remain held');
const autoPlan = eventPlan({
  eventSeq: 10,
  type: 'discard',
  seat: 0,
  card,
  appearanceResolution: 'auto-discard',
  discardIndex: 2,
}, { layout });
assert(
  !autoPlan.visuals[0].retain
  && autoPlan.steps[0].steps[0].steps.length === 3,
  'auto-discard appearance should pulse and then move to the mini slot'
);
const meldCards = [card, { id: 'card-2', key: 'shang' }, { id: 'card-3', key: 'shang' }];
const meldPlan = eventPlan({
  eventSeq: 11,
  type: 'peng',
  seat: 0,
  meldIndex: 0,
  meld: { id: 'peng-group', type: 'peng', cards: meldCards },
}, { layout });
assert(
  meldPlan.visuals.filter((visual) => visual.kind === 'card').length === 3
  && meldPlan.visuals.every((visual) => visual.kind !== 'card' || visual.meldId === 'peng-group'),
  'meld animation should build the complete public meld as one coordinated group'
);
assert(stableEventId({ type: 'draw', seat: 2, card }) === 'draw:2:card-1', 'local event id should be stable');
['draw', 'discard', 'unclaimed', 'chi', 'peng', 'zhao', 'ta', 'hu', 'pass', 'accept-takeover', 'decline-takeover', 'circle-loss', 'draw-round', 'settlement']
  .forEach((type, index) => {
    const preset = eventPlan({
      eventSeq: 20 + index,
      type,
      seat: index % 4,
      card: ['draw', 'discard', 'unclaimed', 'chi', 'peng', 'zhao', 'ta', 'hu'].indexOf(type) >= 0 ? card : undefined,
    }, { layout });
    assert(preset && preset.steps.length, `${type} should map to an animation preset`);
  });

const stateManager = new AnimationManager();
const stateController = new StateAnimationController(stateManager);
const seats = [{ melds: [] }, { melds: [], discards: [card] }, { melds: [] }, { melds: [] }];
stateController.observe({
  phase: 'human-response',
  currentSeat: 0,
  drawnCard: null,
  recentDiscard: { seat: 1, card },
  pendingActions: [{ type: 'peng', seat: 0, card }],
  playerActions: [],
  seats,
}, layout);
assert(stateController.movingCardIds()[0] === card.id, 'state animation should hold the current response card');
seats[0].melds = [{ id: 'peng-1', type: 'peng', cards: [card] }];
stateController.observe({
  phase: 'ai-thinking',
  currentSeat: 0,
  drawnCard: null,
  recentDiscard: null,
  pendingActions: [],
  playerActions: [],
  seats,
}, layout);
assert(stateManager.getVisualState().some((visual) => visual.stage === 'peng'), 'state animation should resolve a claimed card before later actions');

// 出现牌（摸/亮牌）座位归属：响应权轮转到本机时，待响应牌 MUST 停留在摸牌人前方，不得迁移到响应方区域重播。
const appearSeatManager = new AnimationManager();
const appearSeatController = new StateAnimationController(appearSeatManager);
const drawnCard = { id: 'drawn-await', key: 'shang' };
const appearSeats = [{ melds: [] }, { melds: [] }, { melds: [] }, { melds: [] }];
// 阶段1：座位1摸/亮牌，响应权暂在座位1。
appearSeatController.observe({
  phase: 'ai-thinking',
  currentSeat: 1,
  drawnCard,
  appearingCard: { card: drawnCard, source: 'draw', sourceSeat: 1 },
  recentDiscard: null,
  pendingActions: [],
  playerActions: [],
  seats: appearSeats,
}, layout);
for (let time = 0; time <= 600; time += 50) appearSeatManager.update(time);
const appearStage1 = appearSeatManager.getVisualState().find((visual) => visual.kind === 'card' && visual.card.id === drawnCard.id);
assert(
  appearStage1 && Math.round(appearStage1.x) === Math.round(seatFront(1, layout).x),
  'appearing draw card should be held at the drawing seat front'
);
// 阶段2：响应权轮转到本机（座位0），出现牌仍在，本机可响应。
appearSeatController.observe({
  phase: 'human-response',
  currentSeat: 0,
  drawnCard,
  appearingCard: { card: drawnCard, source: 'draw', sourceSeat: 1 },
  recentDiscard: null,
  pendingActions: [],
  playerActions: [{ type: 'peng', seat: 0, card: drawnCard }, { type: 'pass', seat: 0 }],
  seats: appearSeats,
}, layout);
for (let time = 600; time <= 1400; time += 50) appearSeatManager.update(time);
const appearCards = appearSeatManager.getVisualState().filter((visual) => visual.kind === 'card' && visual.card.id === drawnCard.id);
assert(
  appearCards.length === 1 && Math.round(appearCards[0].x) === Math.round(seatFront(1, layout).x),
  'appearing draw card MUST stay at the drawing seat when response turn rotates to the local seat'
);
assert(
  appearCards.every((visual) => Math.round(visual.x) !== Math.round(seatFront(0, layout).x)),
  'appearing draw card MUST NOT be replayed at the responder (local) seat'
);

const recoveryManager = new AnimationManager();
const recoveryRenderer = {
  lastLayout: layout,
  lastDiscardEvent: null,
  suppressNextMeldEffect: false,
  suppressNextResultEffect: false,
  stateAnimationController: { lastSignature: '', resolutionSignature: '' },
  animationEndForSeat(seat, currentLayout) {
    return seatFront(seat, currentLayout);
  },
  claimedAnimationEnd(seat, currentLayout) {
    return claimedTarget(seat, currentLayout);
  },
};
const recoveryController = new TableAnimationController(recoveryRenderer, recoveryManager);
let recoveredOnlineComplete = 0;
const recoveryEvent = {
  eventSeq: 88,
  type: 'discard',
  seat: 1,
  card: { id: 'resize-card', key: 'shang' },
  appearanceResolution: 'await-response',
};
assert(
  recoveryController.playOnlineEvent(recoveryEvent, () => { recoveredOnlineComplete += 1; }),
  'layout recovery check should start an online event'
);
recoveryManager.update(0);
recoveryManager.update(100);
recoveryController.prepareForLayoutChange();
const shiftedLayout = {
  ...layout,
  playerFronts: {
    ...layout.playerFronts,
    right: { x: 680, y: 160, width: 70, height: 100 },
  },
};
recoveryRenderer.lastLayout = shiftedLayout;
assert(recoveryController.restoreAfterLayoutChange(), 'active online animation should restart against the new layout');
for (let time = 100; time <= 2000; time += 50) recoveryManager.update(time);
assert(recoveredOnlineComplete === 1, 'layout recovery should preserve exactly one online completion callback');
assert(
  recoveryController.heldAppearance
  && recoveryController.heldAppearance.position.x === seatFront(1, shiftedLayout).x,
  'await-response card should be restored at the new player-front position'
);

console.log('animation checks passed');
