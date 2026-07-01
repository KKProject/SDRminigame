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

const publicState = serverEngine.buildPublicState({
  seats: serverSeats,
  deck: serverDeck.slice(30),
  pendingActions: [],
  playerActions: [],
});
if (publicState.seats.some((seat) => 'hand' in seat)) throw new Error('public state must not expose player hands');
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
if (previousPhase !== 'result' && room.advanceTimedOutSeat(timeoutEngine, timedOutSeat)) {
  throw new Error('timed-out human manual action should pause instead of being auto-selected');
}
if (previousPhase !== 'result' && timeoutEngine.state.currentSeat !== timedOutSeat) {
  throw new Error('timed-out human manual action should keep the same acting seat');
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
  if ((publicWindow.pendingActions || []).length !== 2 || (publicWindow.playerActions || []).length || !publicWindow.responseSummary) {
    throw new Error('concurrent response public state should keep pending actions and expose a response summary');
  }
  if (!privateOne.playerActions || privateOne.playerActions.length !== 2) {
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

await rm(tempDir, { recursive: true, force: true });
console.log('server core checks passed');
