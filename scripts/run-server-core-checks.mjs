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
const serverCards = require(join(root, 'services/backend/src/game/core/cards.js'));
const serverEvaluator = require(join(root, 'services/backend/src/game/core/evaluator.js'));
const serverRules = require(join(root, 'services/backend/src/game/core/rules.js'));
const serverAi = require(join(root, 'services/backend/src/game/core/ai.js'));
const serverEngine = require(join(root, 'services/backend/src/game/core/engine.js'));
const serverCodec = require(join(root, 'services/backend/src/codec.js'));
const room = require(join(root, 'services/backend/src/game/room.js'));
const { MemoryDocumentDatabase } = require(join(root, 'services/backend/src/db.js'));

const localDeck = localCards.createDeck(localRules.DEFAULT_RULES);
const serverDeck = serverCards.createDeck(serverRules.DEFAULT_RULES);
function serverCardsFor(keys) {
  const deck = serverCards.createDeck(serverRules.DEFAULT_RULES);
  return keys.map((key) => {
    const index = deck.findIndex((card) => card.key === key);
    const card = deck[index];
    deck.splice(index, 1);
    return card;
  });
}
function serverDiscardFromSeat(seat, key) {
  const index = seat.hand.findIndex((card) => card.key === key);
  if (index < 0) throw new Error(`test hand should contain ${key}`);
  const card = seat.hand[index];
  if (!serverEvaluator.isLegalDiscard(seat, card, serverRules.DEFAULT_RULES).legal) {
    throw new Error(`${key} should be legal before test discard`);
  }
  seat.hand.splice(index, 1);
  seat.history.actionHistory.push({ type: 'discard', key: card.key });
  seat.history.discardPhraseCounts[card.phraseId] = (seat.history.discardPhraseCounts[card.phraseId] || 0) + 1;
  return card;
}
function serverLegalDiscardKeys(seat) {
  return serverEvaluator.getLegalDiscards(seat, serverRules.DEFAULT_RULES).map((card) => card.key).sort().join(',');
}
if (JSON.stringify(localDeck) !== JSON.stringify(serverDeck)) throw new Error('server deck must match local deck');
if (serverCodec.SYMBOLS.length !== serverRules.DEFAULT_RULES.cardSymbols.length || serverCodec.PHRASES.length !== serverRules.DEFAULT_RULES.phrases.length) {
  throw new Error('server codec should match rule symbol and phrase counts');
}
serverRules.DEFAULT_RULES.cardSymbols.forEach((symbol, symbolCode) => {
  const decoded = serverCodec.symbolFromCode(symbolCode);
  if (
    serverCodec.symbolCodeForKey(symbol.key) !== symbolCode
    || decoded.key !== symbol.key
    || decoded.text !== symbol.text
    || decoded.phraseId !== symbol.phraseId
  ) {
    throw new Error(`server codec symbol ${symbolCode} should match DEFAULT_RULES`);
  }
});
for (let cardCode = 0; cardCode < 144; cardCode++) {
  const card = serverCodec.cardFromCode(cardCode);
  if (serverCodec.cardToCode(card) !== cardCode || serverCodec.cardToCode({ id: card.id }) !== cardCode) {
    throw new Error(`server codec cardCode ${cardCode} should round-trip`);
  }
}
Object.keys(serverCodec.ACTION_CODES).forEach((action) => {
  if (serverCodec.actionFromCode(serverCodec.actionToCode(action)) !== action) {
    throw new Error(`server codec action ${action} should round-trip`);
  }
});
let unknownServerActionRejected = false;
try {
  serverCodec.actionFromCode(999);
} catch (err) {
  unknownServerActionRejected = err && err.code === 'CODEC_VALUE_INVALID';
}
if (!unknownServerActionRejected) {
  throw new Error('server codec should reject unknown action codes');
}
const compactServerPayload = serverCodec.normalizeTransportPayload({
  actionCode: serverCodec.ACTION_CODES.zhao,
  cardCode: 0,
  symbolCode: 0,
  phraseCode: 0,
});
if (
  compactServerPayload.action !== 'zhao'
  || compactServerPayload.card.id !== 'shang-0'
  || compactServerPayload.symbol.key !== 'shang'
  || compactServerPayload.phrase.id !== 'sdr'
) {
  throw new Error('server codec should expand compact payload fields at the transport boundary');
}

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

const safeResponse = serverAi.chooseResponse([
  { type: 'zhao', seat: 1, priority: serverRules.ACTION_PRIORITY.zhao, circleLossRisk: true },
  { type: 'peng', seat: 1, priority: serverRules.ACTION_PRIORITY.peng },
]);
if (!safeResponse || safeResponse.type !== 'peng') {
  throw new Error('server AI should choose safe peng instead of optional zhao that immediately circle-losses');
}
if (!serverAi.chooseDiscard({ hand: serverDeck.filter((card) => ['shang', 'kong'].includes(card.key)).slice(0, 3) }, serverRules.DEFAULT_RULES)) {
  throw new Error('server AI should choose a discard');
}
{
  const xxyySeat = serverCards.createSeats(serverRules.DEFAULT_RULES, 0)[0];
  xxyySeat.hand = serverCardsFor(['shang', 'shang', 'da', 'da']);
  if (serverLegalDiscardKeys(xxyySeat) !== 'da,da,shang,shang') {
    throw new Error('xxyy should allow either pair key as the first discard');
  }
  serverDiscardFromSeat(xxyySeat, 'shang');
  if (serverLegalDiscardKeys(xxyySeat) !== 'da,da,shang') {
    throw new Error('xxyy should keep allowing same-phrase discards after the first discard');
  }
  serverDiscardFromSeat(xxyySeat, 'da');
  if (serverLegalDiscardKeys(xxyySeat) !== 'da,shang') {
    throw new Error('xxyy should keep allowing mixed follow-up discards');
  }
  serverDiscardFromSeat(xxyySeat, 'shang');
  if (serverLegalDiscardKeys(xxyySeat) !== 'da') {
    throw new Error('xxyy should allow discarding down to the final same-phrase card');
  }
  serverDiscardFromSeat(xxyySeat, 'da');
  if (serverEvaluator.getLegalDiscards(xxyySeat, serverRules.DEFAULT_RULES).length !== 0 || xxyySeat.hand.length !== 0) {
    throw new Error('xxyy should allow all four same-phrase cards to be discarded');
  }
  const xxyyzSeat = serverCards.createSeats(serverRules.DEFAULT_RULES, 0)[0];
  xxyyzSeat.hand = serverCardsFor(['shang', 'shang', 'da', 'da', 'ren']);
  serverDiscardFromSeat(xxyyzSeat, 'ren');
  if (serverEvaluator.getLegalDiscards(xxyyzSeat, serverRules.DEFAULT_RULES).length !== 0) {
    throw new Error('xxyyz singleton discard path should still stop further same-phrase discards');
  }
}

const publicState = serverEngine.buildPublicState({
  seats: serverSeats,
  deck: serverDeck.slice(30),
  pendingActions: [],
  playerActions: [],
});
if (publicState.seats.some((seat) => 'hand' in seat)) throw new Error('public state must not expose player hands');
{
  const drawnCard = serverDeck[0];
  const barrierRoom = {
    players: [
      { seat: 0, openid: 'draw-self', online: true },
      { seat: 1, openid: 'draw-next', online: true },
    ],
  };
  const selfOnlyDrawEngine = {
    state: {
      eventSeq: 10,
      publicEvent: { eventSeq: 10, type: 'draw', seat: 0, card: drawnCard, appearanceResolution: 'await-response' },
      pendingContinuation: {
        type: 'draw-response-window',
        sourceSeat: 0,
        card: drawnCard,
        actions: [{ type: 'chi', seat: 0, card: drawnCard, priority: serverRules.ACTION_PRIORITY.chi }],
      },
    },
  };
  const selfOnlyBarrier = room.syncAnimationBarrier(barrierRoom, selfOnlyDrawEngine, 1);
  if (!selfOnlyBarrier || selfOnlyBarrier.requiredOpenids.length !== 0 || !room.barrierComplete(selfOnlyBarrier)) {
    throw new Error('self-only draw response windows should not wait for the same player animation ack before opening actions');
  }
  const otherDrawEngine = {
    state: {
      eventSeq: 11,
      publicEvent: { eventSeq: 11, type: 'draw', seat: 0, card: drawnCard, appearanceResolution: 'await-response' },
      pendingContinuation: {
        type: 'draw-response-window',
        sourceSeat: 0,
        card: drawnCard,
        actions: [{ type: 'peng', seat: 1, card: drawnCard, priority: serverRules.ACTION_PRIORITY.peng }],
      },
    },
  };
  const otherBarrier = room.syncAnimationBarrier(barrierRoom, otherDrawEngine, 2);
  if (!otherBarrier || otherBarrier.requiredOpenids.join(',') !== 'draw-next') {
    throw new Error('draw response windows with another human responder should still wait for that responder animation ack');
  }
  const nonRequiredAnimation = room.animationState(barrierRoom, otherDrawEngine, 'draw-self');
  if (!nonRequiredAnimation.selfAcked) {
    throw new Error('animation state should treat seats outside the barrier requirement as already self-acked');
  }
  const requiredAnimation = room.animationState(barrierRoom, otherDrawEngine, 'draw-next');
  if (requiredAnimation.selfAcked) {
    throw new Error('animation state should keep a required seat unacked until its ack is recorded');
  }
  otherBarrier.ackedOpenids.push('draw-next');
  const ackedRequiredAnimation = room.animationState(barrierRoom, otherDrawEngine, 'draw-next');
  if (!ackedRequiredAnimation.selfAcked) {
    throw new Error('animation state should mark a required seat self-acked after its ack is recorded');
  }
}
{
  const card = serverDeck[1];
  const offlineBarrierRoom = {
    players: [
      { seat: 0, openid: 'online-viewer', online: true },
      { seat: 1, openid: 'offline-viewer', online: false },
    ],
  };
  const observationalEngine = {
    state: {
      eventSeq: 20,
      publicEvent: { eventSeq: 20, type: 'unclaimed', seat: 0, card, appearanceResolution: 'auto-discard' },
      pendingContinuation: { type: 'next-draw', sourceSeat: 0 },
    },
  };
  const observationalBarrier = room.syncAnimationBarrier(offlineBarrierRoom, observationalEngine, 3);
  if (!observationalBarrier || observationalBarrier.requiredOpenids.join(',') !== 'online-viewer') {
    throw new Error('offline players should not be required for non-critical observational animation barriers');
  }

  const resultEngine = {
    state: {
      eventSeq: 21,
      publicEvent: { eventSeq: 21, type: 'hu', seat: 0, card },
      pendingContinuation: null,
    },
  };
  const resultBarrier = room.syncAnimationBarrier(offlineBarrierRoom, resultEngine, 4);
  if (!resultBarrier || resultBarrier.requiredOpenids.join(',') !== 'online-viewer') {
    throw new Error('result animation barriers should retain online viewers and exclude offline players');
  }

  const removalRoom = {
    players: [
      { seat: 0, openid: 'ack-viewer', online: true },
      { seat: 1, openid: 'drop-viewer', online: true },
    ],
  };
  const removalEngine = {
    state: {
      eventSeq: 22,
      publicEvent: { eventSeq: 22, type: 'pass', seat: 1 },
      pendingContinuation: null,
    },
  };
  const removalBarrier = room.syncAnimationBarrier(removalRoom, removalEngine, 5);
  if (!removalBarrier || removalBarrier.requiredOpenids.length !== 2) {
    throw new Error('current online viewers should initially be required for an observational animation');
  }
  removalBarrier.ackedOpenids.push('ack-viewer');
  removalRoom.players[1].online = false;
  const refreshedBarrier = room.syncAnimationBarrier(removalRoom, removalEngine, 6);
  if (
    !refreshedBarrier
    || refreshedBarrier.requiredOpenids.join(',') !== 'ack-viewer'
    || !room.barrierComplete(refreshedBarrier)
  ) {
    throw new Error('offline removal should refresh the current barrier and allow remaining acks to complete it');
  }
}
const sanitizedEvent = serverEngine.serializePublicEvent({
  eventSeq: 7,
  type: 'discard',
  seat: 0,
  card: serverDeck[0],
  appearanceResolution: 'await-response',
  discardIndex: 3,
  privateHand: serverDeck.slice(1, 4),
  responseActions: [{ type: 'peng', seat: 1 }],
  pendingContinuation: { type: 'secret' },
});
if (
  sanitizedEvent.appearanceResolution !== 'await-response'
  || sanitizedEvent.discardIndex !== 3
  || 'privateHand' in sanitizedEvent
  || 'responseActions' in sanitizedEvent
  || 'pendingContinuation' in sanitizedEvent
) {
  throw new Error('public animation events must not expose private hands or continuation tokens');
}

const legacyEngine = new serverEngine.HuapaiEngine(serverRules.DEFAULT_RULES);
legacyEngine.load({ seats: [], phase: 'human-discard' });
if (legacyEngine.state.eventSeq !== 0 || legacyEngine.state.publicEvent !== null || legacyEngine.state.pendingContinuation !== null) {
  throw new Error('loading legacy rooms should initialize animation event compatibility fields');
}

const pausedEngine = new serverEngine.HuapaiEngine(serverRules.DEFAULT_RULES);
pausedEngine.startRound({
  seed: 1,
  players: [
    { nickName: '真人', isHuman: true },
    { isHuman: false },
    { isHuman: false },
    { isHuman: false },
  ],
});
if (pausedEngine.state.phase === 'human-discard') {
  const legal = serverEvaluator.getLegalDiscards(pausedEngine.state.seats[pausedEngine.state.currentSeat], serverRules.DEFAULT_RULES)[0];
  pausedEngine.submitDiscard(pausedEngine.state.currentSeat, legal.id);
  if (!pausedEngine.state.publicEvent || pausedEngine.state.publicEvent.type !== 'discard' || !pausedEngine.state.pendingContinuation) {
    throw new Error('a public discard should pause the engine with a serializable continuation token');
  }
  if (!['await-response', 'auto-discard'].includes(pausedEngine.state.publicEvent.appearanceResolution)) {
    throw new Error('a public discard should declare its authoritative appearance resolution');
  }
  const pausedSeq = pausedEngine.state.eventSeq;
  pausedEngine.resumePublicEvent();
  if (pausedEngine.state.eventSeq < pausedSeq) {
    throw new Error('resuming a public event must preserve monotonic event sequence numbers');
  }
}

const autoDiscardEngine = new serverEngine.HuapaiEngine(serverRules.DEFAULT_RULES);
autoDiscardEngine.startRound({
  seed: 1,
  players: serverSeats.map((seat, index) => ({ nickName: seat.name, isHuman: index === 0 })),
});
autoDiscardEngine.state.seats.slice(1).forEach((seat) => { seat.hand = []; });
autoDiscardEngine.state.phase = 'human-discard';
autoDiscardEngine.state.currentSeat = 0;
const autoDiscardCard = serverEvaluator.getLegalDiscards(autoDiscardEngine.state.seats[0], serverRules.DEFAULT_RULES)[0];
autoDiscardEngine.submitDiscard(0, autoDiscardCard.id);
if (
  autoDiscardEngine.state.publicEvent.appearanceResolution !== 'auto-discard'
  || autoDiscardEngine.state.pendingContinuation.type !== 'next-draw'
  || !autoDiscardEngine.state.recentDiscard.resolved
) {
  throw new Error('an initially unresponsive discard should be committed and emitted as one auto-discard event');
}
const autoDiscardSeq = autoDiscardEngine.state.eventSeq;
autoDiscardEngine.resumePublicEvent();
if (autoDiscardEngine.state.eventSeq !== autoDiscardSeq + 1 || autoDiscardEngine.state.publicEvent.type === 'unclaimed') {
  throw new Error('an initially unresponsive discard should continue directly without an extra unclaimed event');
}

const autoDrawEngine = new serverEngine.HuapaiEngine(serverRules.DEFAULT_RULES);
const emptySeats = serverCards.createSeats(serverRules.DEFAULT_RULES);
emptySeats.forEach((seat) => {
  seat.hand = [];
  seat.isHuman = true;
});
autoDrawEngine.load({
  rules: serverRules.DEFAULT_RULES,
  seats: emptySeats,
  deck: serverDeck.slice(0, 20),
  phase: 'ai-thinking',
  currentSeat: 0,
  dealerSeat: 0,
  nextDealerSeat: 0,
  appearingCard: null,
  drawnCard: null,
  recentDiscard: null,
  pendingActions: [],
  playerActions: [],
  eventSeq: 0,
  publicEvent: null,
  pendingContinuation: null,
});
autoDrawEngine.beginTurn(0, true);
if (
  autoDrawEngine.state.publicEvent.type !== 'draw'
  || autoDrawEngine.state.publicEvent.appearanceResolution !== 'auto-discard'
  || autoDrawEngine.state.seats[0].discards.length !== 1
  || autoDrawEngine.state.pendingContinuation.type !== 'next-draw'
) {
  throw new Error('an initially unresponsive draw should include its final discard state in one draw event');
}

const timeoutEngine = new serverEngine.HuapaiEngine(serverRules.DEFAULT_RULES);
timeoutEngine.startRound({
  seed: 1001,
  players: serverSeats.map((seat) => ({ nickName: seat.name, isHuman: true })),
});
const timedOutSeat = timeoutEngine.state.currentSeat;
const previousPhase = timeoutEngine.state.phase;
if (previousPhase !== 'result' && !room.advanceTimedOutSeat(timeoutEngine, timedOutSeat)) {
  throw new Error('timed-out human manual action should be auto-selected by server-side takeover');
}
if (
  previousPhase !== 'result'
  && timeoutEngine.state.phase !== 'result'
  && !timeoutEngine.state.publicEvent
) {
  throw new Error('timed-out human discard should emit an authoritative public event or finish the round');
}

function takeServerCards(keys, excludedIds = []) {
  const used = new Set(excludedIds);
  return keys.map((key) => {
    const card = serverDeck.find((item) => item.key === key && !used.has(item.id));
    if (!card) throw new Error(`missing card for key ${key}`);
    used.add(card.id);
    return card;
  });
}

function makeResponseEngine() {
  const engine = new serverEngine.HuapaiEngine(serverRules.DEFAULT_RULES);
  const seats = serverCards.createSeats(serverRules.DEFAULT_RULES);
  seats.forEach((seat, index) => {
    seat.isHuman = true;
    seat.online = true;
    seat.openid = `test-${index}`;
    seat.nickName = `玩家${index}`;
    seat.hand = [];
  });
  const incoming = takeServerCards(['shang'])[0];
  seats[0].discards = [incoming];
  engine.load({
    rules: serverRules.DEFAULT_RULES,
    seats,
    deck: [],
    phase: 'human-response',
    currentSeat: 0,
    dealerSeat: 0,
    nextDealerSeat: 0,
    jiangPhraseId: 'sdr',
    appearingCard: serverCards.createAppearingCard({
      card: incoming,
      source: 'discard',
      sourceSeat: 0,
      responseStartSeat: 1,
    }),
    drawnCard: null,
    recentDiscard: { seat: 0, card: incoming },
    pendingActions: [],
    playerActions: [],
    eventSeq: 0,
    publicEvent: null,
    pendingContinuation: null,
    responseWindow: null,
  });
  return { engine, incoming };
}

{
  const takeoverSeats = serverCards.createSeats(serverRules.DEFAULT_RULES);
  const takeoverState = {
    rules: serverRules.DEFAULT_RULES,
    seats: takeoverSeats,
    deck: [],
    phase: 'takeover-choice',
    currentSeat: 1,
    dealerSeat: 0,
    nextDealerSeat: 0,
    takeoverQueue: [1, 3],
    playerActions: [
      { type: 'acceptTakeover', seat: 1, label: '接庄' },
      { type: 'declineTakeover', seat: 1, label: '不接' },
    ],
    pendingActions: [],
    responseWindow: null,
  };
  const takeoverPrivateOne = serverEngine.buildPrivateView(takeoverState, 1);
  const takeoverPrivateZero = serverEngine.buildPrivateView(takeoverState, 0);
  if (
    takeoverPrivateOne.actionState !== 'available'
    || takeoverPrivateOne.responseWindowId !== null
    || takeoverPrivateOne.playerActions.map((action) => action.type).join(',') !== 'acceptTakeover,declineTakeover'
    || takeoverPrivateZero.actionState !== 'closed'
    || takeoverPrivateZero.playerActions.length !== 0
  ) {
    throw new Error('private view should expose takeover actions only to the current takeover seat');
  }
}

{
  const manualDiscardChiState = { seats: serverCards.createSeats(serverRules.DEFAULT_RULES) };
  manualDiscardChiState.seats[0].hand = takeServerCards(['da', 'ren']);
  manualDiscardChiState.seats[0].history.actionHistory.push({ type: 'discard', key: 'shang' });
  manualDiscardChiState.seats[3].hand = takeServerCards(['shang']);
  const manualDiscardChiActions = serverEvaluator.findResponseActions(manualDiscardChiState, 3, manualDiscardChiState.seats[3].hand[0], serverRules.DEFAULT_RULES);
  if (manualDiscardChiActions.some((action) => action.seat === 0 && action.type === 'chi')) {
    throw new Error('manual hand-discarded key should block future chi');
  }

  const manualDiscardHuState = { seats: serverCards.createSeats(serverRules.DEFAULT_RULES) };
  manualDiscardHuState.seats[0].hand = takeServerCards([
    'shang', 'shang',
    'da', 'ren',
    'kong', 'yi', 'ji',
    'hua', 'san', 'qian',
    'qi', 'shi', 'tu',
    'er', 'xiao', 'sheng',
    'fu', 'lu', 'shou',
    'jia', 'zuo', 'ren2',
  ]);
  manualDiscardHuState.seats[0].history.actionHistory.push({ type: 'discard', key: 'shang' });
  manualDiscardHuState.seats[3].hand = takeServerCards(['shang']);
  const manualDiscardHuActions = serverEvaluator.findResponseActions(manualDiscardHuState, 3, manualDiscardHuState.seats[3].hand[0], serverRules.DEFAULT_RULES);
  if (manualDiscardHuActions.some((action) => action.seat === 0 && action.type === 'hu')) {
    throw new Error('manual hand-discarded key should block future hu for the same key');
  }

  const autoDiscardChiState = { seats: serverCards.createSeats(serverRules.DEFAULT_RULES) };
  autoDiscardChiState.seats[0].hand = takeServerCards(['da', 'ren']);
  autoDiscardChiState.seats[0].history.actionHistory.push({ type: 'auto-discard-draw', key: 'shang' });
  autoDiscardChiState.seats[3].hand = takeServerCards(['shang']);
  const autoDiscardChiActions = serverEvaluator.findResponseActions(autoDiscardChiState, 3, autoDiscardChiState.seats[3].hand[0], serverRules.DEFAULT_RULES);
  if (!autoDiscardChiActions.some((action) => action.seat === 0 && action.type === 'chi')) {
    throw new Error('auto-discarded draw key should not block future chi');
  }

  const autoDiscardHuState = { seats: serverCards.createSeats(serverRules.DEFAULT_RULES) };
  autoDiscardHuState.seats[0].hand = takeServerCards([
    'shang', 'shang',
    'da', 'ren',
    'kong', 'yi', 'ji',
    'hua', 'san', 'qian',
    'qi', 'shi', 'tu',
    'er', 'xiao', 'sheng',
    'fu', 'lu', 'shou',
    'jia', 'zuo', 'ren2',
  ]);
  autoDiscardHuState.seats[0].history.actionHistory.push({ type: 'auto-discard-draw', key: 'shang' });
  autoDiscardHuState.seats[3].hand = takeServerCards(['shang']);
  const autoDiscardHuActions = serverEvaluator.findResponseActions(autoDiscardHuState, 3, autoDiscardHuState.seats[3].hand[0], serverRules.DEFAULT_RULES);
  if (!autoDiscardHuActions.some((action) => action.seat === 0 && action.type === 'hu')) {
    throw new Error('auto-discarded draw key should not block future hu');
  }
}

{
  const { engine, incoming } = makeResponseEngine();
  engine.state.seats[1].hand = takeServerCards(['da', 'da', 'ren'], [incoming.id]);
  engine.state.seats[1].history.actionHistory.push({ type: 'discard', key: incoming.key });
  const forcedActions = serverEvaluator.findResponseActions(engine.state, 0, incoming, serverRules.DEFAULT_RULES);
  if (!forcedActions.some((action) => action.type === 'circle-loss' && action.seat === 1 && action.reasonCode === 'manual-hand-discard-blocked-forced-chi')) {
    throw new Error('mandatory chi blocked by manual hand discard should create an internal circle-loss action');
  }
  engine.handleResponseWindow(forcedActions, 0);
  if (
    engine.state.phase !== 'result'
    || !engine.state.result
    || engine.state.result.type !== 'circle-loss'
    || engine.state.result.loser !== 1
    || !engine.state.result.settlement
    || engine.state.result.settlement.payments.length !== 3
  ) {
    throw new Error('mandatory chi blocked by manual hand discard should resolve as circle-loss paying three seats');
  }
}

{
  const { engine, incoming } = makeResponseEngine();
  engine.state.seats[1].hand = takeServerCards(['shang', 'shang'], [incoming.id]);
  engine.state.seats[2].hand = takeServerCards(['shang', 'shang'], [incoming.id].concat(engine.state.seats[1].hand.map((card) => card.id)));
  const actions = [
    { type: 'peng', seat: 1, card: incoming, sourceSeat: 0, sourceType: 'discard', keys: ['shang', 'shang'], priority: serverRules.ACTION_PRIORITY.peng, label: '碰', responseIndex: 0 },
    { type: 'peng', seat: 2, card: incoming, sourceSeat: 0, sourceType: 'discard', keys: ['shang', 'shang'], priority: serverRules.ACTION_PRIORITY.peng, label: '碰', responseIndex: 1 },
  ];
  engine.handleResponseWindow(actions, 0);
  const publicWindow = serverEngine.buildPublicState(engine.state);
  const privateOne = serverEngine.buildPrivateView(engine.state, 1);
  if (
    (publicWindow.pendingActions || []).length
    || (publicWindow.playerActions || []).length
    || !publicWindow.responseSummary
    || !publicWindow.responseSummary.id
    || publicWindow.responseSummary.candidateSeats.join(',') !== '1,2'
    || publicWindow.responseSummary.blockingSeats.join(',') !== '1,2'
  ) {
    throw new Error('concurrent response public state should expose only a non-leaking response summary');
  }
  if (!privateOne.playerActions || privateOne.playerActions.length !== 2 || privateOne.actionState !== 'available' || !privateOne.responseWindowId) {
    throw new Error('private view should expose only the matching seat response actions plus pass');
  }
  engine.submitResponse(2, { type: 'peng' });
  if (!engine.state.responseWindow || engine.state.seats[2].melds.length) {
    throw new Error('later same-tier peng must wait for earlier response-order seat');
  }
  engine.submitResponse(1, { type: 'pass' });
  if (engine.state.responseWindow || engine.state.seats[2].melds[0].type !== 'peng') {
    throw new Error('later peng should resolve after earlier same-tier seat passes');
  }
  const pengEvent = engine.state.publicEvent;
  if (
    !pengEvent
    || pengEvent.type !== 'peng'
    || pengEvent.action !== 'peng'
    || pengEvent.actionCode !== serverCodec.ACTION_CODES.peng
    || pengEvent.symbolCode !== serverCodec.symbolCodeForKey('shang')
    || pengEvent.count !== undefined
    || pengEvent.phraseCode !== undefined
  ) {
    throw new Error('authoritative peng event should expose only action and symbol code');
  }
}

{
  const { engine, incoming } = makeResponseEngine();
  engine.state.seats[1].hand = takeServerCards(['da', 'ren'], [incoming.id]);
  const actions = [
    { type: 'chi', seat: 1, card: incoming, sourceSeat: 0, sourceType: 'discard', keys: ['da', 'ren'], priority: serverRules.ACTION_PRIORITY.chi, label: '吃', responseIndex: 0 },
  ];
  engine.handleResponseWindow(actions, 0);
  engine.submitResponse(1, { type: 'chi' });
  const chiEvent = engine.state.publicEvent;
  if (
    !chiEvent
    || chiEvent.type !== 'chi'
    || chiEvent.actionCode !== serverCodec.ACTION_CODES.chi
    || chiEvent.phraseCode !== serverCodec.phraseCodeForId('sdr')
    || chiEvent.incomingSymbolCode !== serverCodec.symbolCodeForKey('shang')
    || chiEvent.symbolCode !== undefined
    || chiEvent.count !== undefined
  ) {
    throw new Error('authoritative chi event should expose phrase code and incoming symbol only');
  }
}

{
  const { engine, incoming } = makeResponseEngine();
  engine.state.seats[1].hand = takeServerCards(['shang', 'shang', 'shang', 'da', 'da'], [incoming.id]);
  engine.state.seats[2].hand = takeServerCards(['shang', 'shang'], [incoming.id].concat(engine.state.seats[1].hand.map((card) => card.id)));
  const actions = [
    { type: 'zhao', seat: 1, card: incoming, sourceSeat: 0, sourceType: 'discard', keys: ['shang', 'shang', 'shang'], zhaoSize: 4, handKeyCount: 3, priority: serverRules.ACTION_PRIORITY.zhao, label: '招4张1对', responseIndex: 0 },
    { type: 'peng', seat: 2, card: incoming, sourceSeat: 0, sourceType: 'discard', keys: ['shang', 'shang'], priority: serverRules.ACTION_PRIORITY.peng, label: '碰', responseIndex: 1 },
  ];
  engine.handleResponseWindow(actions, 0);
  engine.submitResponse(1, { type: 'zhao', zhaoSize: 4, handKeyCount: 3 });
  if (engine.state.responseWindow || engine.state.seats[1].melds[0].type !== 'zhao') {
    throw new Error('zhao should resolve immediately when no unresolved hu can beat it');
  }
  const zhaoEvent = engine.state.publicEvent;
  if (
    !zhaoEvent
    || zhaoEvent.type !== 'zhao'
    || zhaoEvent.actionCode !== serverCodec.ACTION_CODES.zhao
    || zhaoEvent.symbolCode !== serverCodec.symbolCodeForKey('shang')
    || zhaoEvent.count !== 4
    || zhaoEvent.phraseCode !== undefined
  ) {
    throw new Error('authoritative zhao event should expose symbol code and count only');
  }
}

{
  const { engine, incoming } = makeResponseEngine();
  engine.state.seats[2].hand = takeServerCards(['shang', 'shang', 'shang', 'da', 'da'], [incoming.id]);
  const actions = [
    { type: 'hu', seat: 1, card: incoming, sourceSeat: 0, sourceType: 'discard', keys: [], priority: serverRules.ACTION_PRIORITY.hu, label: '胡', responseIndex: 0, win: { summary: '测试胡', points: 1, scoring: {}, grade: '屁胡', pattern: [], doors: [] } },
    { type: 'zhao', seat: 2, card: incoming, sourceSeat: 0, sourceType: 'discard', keys: ['shang', 'shang', 'shang'], zhaoSize: 4, handKeyCount: 3, priority: serverRules.ACTION_PRIORITY.zhao, label: '招4张1对', responseIndex: 1 },
  ];
  engine.handleResponseWindow(actions, 0);
  engine.submitResponse(2, { type: 'zhao', zhaoSize: 4, handKeyCount: 3 });
  if (!engine.state.responseWindow || engine.state.seats[2].melds.length) {
    throw new Error('zhao must wait while an unresolved hu candidate can beat it');
  }
  engine.submitResponse(1, { type: 'pass' });
  if (engine.state.responseWindow || engine.state.seats[2].melds[0].type !== 'zhao') {
    throw new Error('zhao should resolve after the unresolved hu candidate passes');
  }
}

{
  const { engine, incoming } = makeResponseEngine();
  engine.state.seats[1].hand = takeServerCards(['shang', 'shang'], [incoming.id]);
  engine.state.seats[2].hand = takeServerCards(['shang', 'shang'], [incoming.id].concat(engine.state.seats[1].hand.map((card) => card.id)));
  const actions = [
    { type: 'peng', seat: 1, card: incoming, sourceSeat: 0, sourceType: 'discard', keys: ['shang', 'shang'], priority: serverRules.ACTION_PRIORITY.peng, label: '碰', responseIndex: 0 },
    { type: 'peng', seat: 2, card: incoming, sourceSeat: 0, sourceType: 'discard', keys: ['shang', 'shang'], priority: serverRules.ACTION_PRIORITY.peng, label: '碰', responseIndex: 1 },
  ];
  engine.handleResponseWindow(actions, 0);
  engine.submitResponse(1, { type: 'pass' });
  engine.submitResponse(2, { type: 'pass' });
  if (engine.state.responseWindow || !engine.state.publicEvent || engine.state.publicEvent.type !== 'unclaimed') {
    throw new Error('all concurrent response passes should produce one final unclaimed event');
  }
}

{
  const { engine, incoming } = makeResponseEngine();
  engine.state.seats[1].isHuman = false;
  engine.state.seats[1].hand = takeServerCards(['shang', 'shang'], [incoming.id]);
  const actions = [
    { type: 'peng', seat: 1, card: incoming, sourceSeat: 0, sourceType: 'discard', keys: ['shang', 'shang'], priority: serverRules.ACTION_PRIORITY.peng, label: '碰', responseIndex: 0 },
  ];
  engine.handleResponseWindow(actions, 0);
  if (engine.state.responseWindow || engine.state.seats[1].melds[0].type !== 'peng') {
    throw new Error('AI response window seat should choose and resolve automatically');
  }
}

{
  const { engine, incoming } = makeResponseEngine();
  engine.state.seats[1].online = false;
  engine.state.seats[1].hand = takeServerCards(['shang', 'shang'], [incoming.id]);
  const actions = [
    { type: 'peng', seat: 1, card: incoming, sourceSeat: 0, sourceType: 'discard', keys: ['shang', 'shang'], priority: serverRules.ACTION_PRIORITY.peng, label: '碰', responseIndex: 0 },
  ];
  engine.handleResponseWindow(actions, 0);
  const decision = engine.state.responseWindow && engine.state.responseWindow.decisions[1];
  const privateOne = serverEngine.buildPrivateView(engine.state, 1);
  if (
    !engine.state.responseWindow
    || !decision
    || decision.status !== 'pending'
    || !privateOne.playerActions
    || !privateOne.playerActions.some((action) => action.type === 'peng')
  ) {
    throw new Error('offline-marked human response seat should keep pending response actions');
  }
}

{
  const timeoutDb = new MemoryDocumentDatabase();
  const { engine, incoming } = makeResponseEngine();
  engine.state.seats[1].online = false;
  engine.state.seats[1].hand = takeServerCards(['shang', 'shang'], [incoming.id]);
  engine.handleResponseWindow([
    { type: 'peng', seat: 1, card: incoming, sourceSeat: 0, sourceType: 'discard', keys: ['shang', 'shang'], priority: serverRules.ACTION_PRIORITY.peng, label: '碰', responseIndex: 0 },
  ], 0);
  const oldSeenAt = Date.now() - 70000;
  await timeoutDb.collection('rooms').doc('pending-timeout-room').set({
    data: room.documentData({
      _id: 'pending-timeout-room',
      status: 'playing',
      seatCount: 4,
      players: [
        { seat: 0, openid: 'test-0', nickName: '玩家0', avatarUrl: '', isHuman: true, online: true, lastSeenAt: Date.now() },
        { seat: 1, openid: 'test-1', nickName: '玩家1', avatarUrl: '', isHuman: true, online: false, lastSeenAt: oldSeenAt },
      ],
      playerOpenids: ['test-0', 'test-1'],
      settings: { maxRounds: 2 },
      hostOpenid: 'test-0',
      version: 3,
      state: engine.state,
      createdAt: oldSeenAt,
      updatedAt: oldSeenAt,
    }),
  });
  const heartbeatResult = await room.heartbeat({ roomId: 'pending-timeout-room' }, { db: timeoutDb, OPENID: 'test-0' });
  const advancedRoom = await timeoutDb.collection('rooms').doc('pending-timeout-room').get();
  if (
    !heartbeatResult.ok
    || !heartbeatResult.advanced
    || advancedRoom.data.version !== 4
    || (advancedRoom.data.state.responseWindow && advancedRoom.data.state.responseWindow.decisions[1].status === 'pending')
  ) {
    throw new Error('already offline pending response seat should still advance after heartbeat timeout');
  }
}

{
  const { engine, incoming } = makeResponseEngine();
  engine.state.seats[1].hand = takeServerCards(['shang', 'shang'], [incoming.id]);
  const actions = [
    { type: 'peng', seat: 1, card: incoming, sourceSeat: 0, sourceType: 'discard', keys: ['shang', 'shang'], priority: serverRules.ACTION_PRIORITY.peng, label: '碰', responseIndex: 0, forced: true },
  ];
  engine.handleResponseWindow(actions, 0);
  engine.submitResponse(1, { type: 'pass' });
  if (engine.state.phase !== 'result' || !engine.state.result || engine.state.result.type !== 'circle-loss') {
    throw new Error('forced response pass should resolve as circle-loss');
  }
}

const rematchDb = new MemoryDocumentDatabase();
const rematchRoomId = '991122';
const rematchEngine = new serverEngine.HuapaiEngine(serverRules.DEFAULT_RULES);
const rematchPlayers = [
  { seat: 0, openid: 'host-openid', nickName: '房主', avatarUrl: '', isHuman: true, online: true, ready: true },
  { seat: 1, openid: 'guest-openid', nickName: '客人', avatarUrl: '', isHuman: true, online: true, ready: true },
];
rematchEngine.startRound({
  seed: 2002,
  players: [
    { openid: 'host-openid', nickName: '房主', isHuman: true },
    { openid: 'guest-openid', nickName: '客人', isHuman: true },
    { isHuman: false },
    { isHuman: false },
  ],
});
rematchEngine.state.phase = 'result';
rematchEngine.state.round = 2;
rematchEngine.state.result = { type: 'draw-round', summary: '测试结束' };
rematchEngine.state.publicEvent = null;
rematchEngine.state.pendingContinuation = null;
await rematchDb.collection('rooms').doc(rematchRoomId).set({
  data: room.documentData({
    _id: rematchRoomId,
    status: 'tableResult',
    seatCount: 4,
    players: rematchPlayers,
    playerOpenids: rematchPlayers.map((player) => player.openid),
    settings: { maxRounds: 2 },
    hostOpenid: 'host-openid',
    version: 7,
    state: rematchEngine.state,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }),
});
const activeTableResult = await room.activeRoom({}, { db: rematchDb, _: {}, OPENID: 'host-openid' });
if (!activeTableResult.hasRoom || activeTableResult.status !== 'tableResult') {
  throw new Error('tableResult rooms should remain recoverable until the player exits');
}
const hostRematch = await room.requestRematch({ roomId: rematchRoomId }, { db: rematchDb, OPENID: 'host-openid' });
if (!hostRematch.ok || !hostRematch.rematch || !hostRematch.rematch.active || hostRematch.rematchStarted) {
  throw new Error('host should be able to request rematch and wait for other humans');
}
const guestRematch = await room.requestRematch({ roomId: rematchRoomId }, { db: rematchDb, OPENID: 'guest-openid' });
if (!guestRematch.ok || !guestRematch.rematchStarted || guestRematch.status !== 'playing' || guestRematch.public.round !== 1) {
  throw new Error('all human approvals should restart the same room with round counter reset');
}

const leaveRoomId = '991123';
const leavePlayers = [
  { seat: 0, openid: 'leave-host-openid', nickName: '房主', avatarUrl: '', isHuman: true, online: true, ready: true },
  { seat: 1, openid: 'leave-guest-openid', nickName: '客人', avatarUrl: '', isHuman: true, online: true, ready: true },
];
await rematchDb.collection('rooms').doc(leaveRoomId).set({
  data: room.documentData({
    _id: leaveRoomId,
    status: 'tableResult',
    seatCount: 4,
    players: leavePlayers,
    playerOpenids: leavePlayers.map((player) => player.openid),
    settings: { maxRounds: 2 },
    hostOpenid: 'leave-host-openid',
    version: 3,
    state: rematchEngine.state,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }),
});
const leaveResult = await room.leaveRoom({ roomId: leaveRoomId }, { db: rematchDb, OPENID: 'leave-guest-openid' });
const guestActiveAfterLeave = await room.activeRoom({}, { db: rematchDb, _: {}, OPENID: 'leave-guest-openid' });
if (!leaveResult.ok || guestActiveAfterLeave.hasRoom) {
  throw new Error('leaving a final-result room should release that player from active room lookup');
}

const waitingDb = new MemoryDocumentDatabase();
const waitingRoomId = '991124';
const waitingPlayers = [
  { seat: 0, openid: 'waiting-host-openid', nickName: '房主', avatarUrl: '', isHuman: true, online: true, ready: true },
  { seat: 1, openid: 'waiting-guest-openid', nickName: '客人', avatarUrl: '', isHuman: true, online: true, ready: false },
];
await waitingDb.collection('rooms').doc(waitingRoomId).set({
  data: room.documentData({
    _id: waitingRoomId,
    status: 'waiting',
    seatCount: 4,
    players: waitingPlayers,
    playerOpenids: waitingPlayers.map((player) => player.openid),
    settings: { maxRounds: 2 },
    hostOpenid: 'waiting-host-openid',
    version: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }),
});
const blockedStart = await room.startRound({ roomId: waitingRoomId }, { db: waitingDb, OPENID: 'waiting-host-openid' });
if (blockedStart.ok || !blockedStart.room || blockedStart.room.canStart) {
  throw new Error('waiting room should require all joined humans to be ready before starting');
}
const swapRequest = await room.requestSeatSwap(
  { roomId: waitingRoomId, targetSeat: 1 },
  { db: waitingDb, OPENID: 'waiting-host-openid' }
);
if (!swapRequest.ok || !swapRequest.room.swapRequest || swapRequest.room.swapRequest.direction !== 'outgoing') {
  throw new Error('seat swap request should be visible to requester as outgoing');
}
const incomingSwap = await room.roomInfo({ roomId: waitingRoomId }, { db: waitingDb, OPENID: 'waiting-guest-openid' });
if (!incomingSwap.ok || !incomingSwap.room.swapRequest || incomingSwap.room.swapRequest.direction !== 'incoming') {
  throw new Error('seat swap request should be visible to target as incoming');
}
const acceptedSwap = await room.respondSeatSwap(
  { roomId: waitingRoomId, requestId: incomingSwap.room.swapRequest.id, accept: true },
  { db: waitingDb, OPENID: 'waiting-guest-openid' }
);
if (!acceptedSwap.ok || acceptedSwap.seat !== 0) {
  throw new Error('accepting a seat swap should move the target player to the requester seat');
}
const hostAfterSwap = await room.roomInfo({ roomId: waitingRoomId }, { db: waitingDb, OPENID: 'waiting-host-openid' });
if (!hostAfterSwap.ok || hostAfterSwap.seat !== 1 || hostAfterSwap.room.swapRequest) {
  throw new Error('accepting a seat swap should exchange seats and clear the pending request');
}
await room.setReady({ roomId: waitingRoomId, ready: true }, { db: waitingDb, OPENID: 'waiting-guest-openid' });
const hostReadyAfterSwap = await room.setReady({ roomId: waitingRoomId, ready: true }, { db: waitingDb, OPENID: 'waiting-host-openid' });
if (!hostReadyAfterSwap.room.canStart || !hostReadyAfterSwap.room.readyToStart) {
  throw new Error('host should be able to start once all joined humans are ready');
}
const guestLeaveWaiting = await room.leaveRoom({ roomId: waitingRoomId }, { db: waitingDb, OPENID: 'waiting-guest-openid' });
if (!guestLeaveWaiting.ok || guestLeaveWaiting.closed) {
  throw new Error('guest should be able to leave a waiting room without closing it');
}
const hostCloseWaiting = await room.leaveRoom({ roomId: waitingRoomId }, { db: waitingDb, OPENID: 'waiting-host-openid' });
if (!hostCloseWaiting.ok || !hostCloseWaiting.closed) {
  throw new Error('host leaving a waiting room should disband it');
}

await rm(tempDir, { recursive: true, force: true });
console.log('server core checks passed');
