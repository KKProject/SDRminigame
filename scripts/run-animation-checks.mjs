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
const { eventPlan, stableEventId } = await import(pathToFileURL(join(tempDir, 'presets.mjs')));
const { cardSize, claimedTarget, discardTarget, seatFront, seatStart } = await import(pathToFileURL(join(tempDir, 'targets.mjs')));

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
  },
  claimedZones: {
    bottom: { x: 60, y: 260, width: 200, height: 100, direction: 'ltr' },
  },
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

const card = { id: 'card-1', key: 'shang' };
const plan = eventPlan({ eventSeq: 9, type: 'discard', seat: 0, card }, { layout });
assert(plan.id === 'online:9' && plan.visuals[0].card === card, 'event preset should create a stable online card plan');
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

console.log('animation checks passed');
