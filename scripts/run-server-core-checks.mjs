import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tempDir = join(root, '.tmp-server-core-checks');
const sourceDir = join(root, 'js/game');
const require = createRequire(import.meta.url);

await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });
for (const file of ['rules', 'cards', 'evaluator']) {
  const source = (await readFile(join(sourceDir, `${file}.js`), 'utf8'))
    .replace(/from '(\.\/[^']+)'/g, "from '$1.mjs'");
  await writeFile(join(tempDir, `${file}.mjs`), source);
}

const localCards = await import(pathToFileURL(join(tempDir, 'cards.mjs')));
const localEvaluator = await import(pathToFileURL(join(tempDir, 'evaluator.mjs')));
const localRules = await import(pathToFileURL(join(tempDir, 'rules.mjs')));
const serverCards = require(join(root, 'cloudfunctions/game/core/cards.js'));
const serverEvaluator = require(join(root, 'cloudfunctions/game/core/evaluator.js'));
const serverRules = require(join(root, 'cloudfunctions/game/core/rules.js'));
const serverEngine = require(join(root, 'cloudfunctions/game/core/engine.js'));
const room = require(join(root, 'cloudfunctions/game/room.js'));

const localDeck = localCards.createDeck(localRules.DEFAULT_RULES);
const serverDeck = serverCards.createDeck(serverRules.DEFAULT_RULES);
if (JSON.stringify(localDeck) !== JSON.stringify(serverDeck)) throw new Error('server deck must match local deck');

const localOpening = localEvaluator.dealOpeningHands(localDeck.slice(), 0, localRules.DEFAULT_RULES);
const serverOpening = serverEvaluator.dealOpeningHands(serverDeck.slice(), 0, serverRules.DEFAULT_RULES);
if (JSON.stringify(localOpening) !== JSON.stringify(serverOpening)) throw new Error('server dealing must match local dealing');

const hand = localDeck.filter((card) => ['shang', 'da', 'ren', 'kong', 'yi', 'ji', 'hua', 'qian', 'sheng', 'fu', 'lu', 'shou', 'ren2'].includes(card.key)).slice(0, 23);
const localWin = localEvaluator.evaluateWin(hand, [], 'self', localRules.DEFAULT_RULES);
const serverWin = serverEvaluator.evaluateWin(hand, [], 'self', serverRules.DEFAULT_RULES);
if (JSON.stringify(localWin) !== JSON.stringify(serverWin)) throw new Error('server win evaluation must match local evaluation');

const localSeats = localCards.createSeats(localRules.DEFAULT_RULES);
const serverSeats = serverCards.createSeats(serverRules.DEFAULT_RULES);
localSeats[0].hand = localDeck.slice(0, 22);
serverSeats[0].hand = serverDeck.slice(0, 22);
const incomingLocal = localDeck[22];
const incomingServer = serverDeck[22];
const localState = { seats: localSeats };
const serverState = { seats: serverSeats };
const localActions = localEvaluator.findAppearingCardActions(localState, 0, incomingLocal, 'draw', localRules.DEFAULT_RULES);
const serverActions = serverEvaluator.findAppearingCardActions(serverState, 0, incomingServer, 'draw', serverRules.DEFAULT_RULES);
if (JSON.stringify(localActions) !== JSON.stringify(serverActions)) throw new Error('server actions must match local actions');

const publicState = serverEngine.buildPublicState({
  seats: serverSeats,
  deck: serverDeck.slice(30),
  pendingActions: [],
  playerActions: [],
});
if (publicState.seats.some((seat) => 'hand' in seat)) throw new Error('public state must not expose player hands');

const timeoutEngine = new serverEngine.HuapaiEngine(serverRules.DEFAULT_RULES);
timeoutEngine.startRound({
  seed: 1001,
  players: serverSeats.map((seat) => ({ nickName: seat.name, isHuman: true })),
});
const timedOutSeat = timeoutEngine.state.currentSeat;
const previousPhase = timeoutEngine.state.phase;
if (previousPhase !== 'result' && !room.advanceTimedOutSeat(timeoutEngine, timedOutSeat)) {
  throw new Error('timed-out active human seat should be advanced by server AI takeover');
}

await rm(tempDir, { recursive: true, force: true });
console.log('server core checks passed');
