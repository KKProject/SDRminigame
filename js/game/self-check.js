import { chooseDiscard, chooseResponse } from './ai';
import AssetLoader, {
  ASSET_MANIFEST,
  buildCardAtlasFrameMap,
} from './assets';
import { createDeck, createSeats } from './cards';
import TableLayout, {
  CARD_ASPECT_RATIO,
  CARD_SOURCE_HEIGHT,
  HAND_STACK_SOURCE_STEP,
} from './layout';
import TableRenderer from './renderer';
import {
  ACTION_PRIORITY,
  DEFAULT_RULES,
  PHRASES,
} from './rules';
import {
  buildCircleLossResult,
  calculateOperationFu,
  calculateHuScoring,
  dealOpeningHands,
  evaluateWin,
  filterHighestPriority,
  findResponseActions,
  findSelfDrawActions,
  findTakeoverEligibleSeats,
  hasKezi,
  hasTriplet,
  isLegalDiscard,
  isListening,
  pointValueForGrade,
  validateSupportPairs,
} from './evaluator';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function cardsFor(keys) {
  const deck = createDeck(DEFAULT_RULES);
  return keys.map((key) => {
    const index = deck.findIndex((card) => card.key === key);
    const card = deck[index];
    deck.splice(index, 1);
    return card;
  });
}

function makeState() {
  return {
    seats: createSeats(DEFAULT_RULES, 0),
    deck: [],
    currentSeat: 0,
    humanSeat: 0,
  };
}

function makeTestAtlas() {
  const frame = (x, y, w, h, label, category = 'tile', confidence = 'high') => ({
    frame: { x, y, w, h },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w, h },
    sourceSize: { w, h },
    label,
    category,
    confidence,
  });
  return {
    meta: { image: 'element.png', size: { w: 1281, h: 1021 } },
    frames: {
      big: {
        big_fu_v: frame(523, 3, 88, 307, '红色福-竖向'),
        big_shang_hl: frame(839, 591, 307, 88, '红色上-横向', 'meld', 'low'),
        big_da_hr: frame(880, 591, 307, 88, '绿色大-横向', 'meld', 'low'),
        tile_back_green_vertical: frame(247, 3, 88, 307, '绿色牌背-竖向', 'back'),
      },
      small: {
        small_shang_v: frame(300, 360, 88, 108, '红色上-小牌'),
      },
      mini: {
        mini_shang_hl: frame(500, 360, 42, 38, 'mini红色上', 'mini_tile', 'low'),
      },
      tile_back_green_small: frame(1, 80, 30, 48, '绿色牌背-小', 'back'),
    },
  };
}

function makeLegacyTestAtlas() {
  const frame = (x, y, w, h, label, category = 'tile', confidence = 'high') => ({
    frame: { x, y, w, h },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w, h },
    sourceSize: { w, h },
    label,
    category,
    confidence,
  });
  const frames = {
    legacy_red_fu_vertical: frame(523, 3, 88, 307, '红色福-竖向'),
    legacy_red_horizontal_shang: frame(839, 591, 307, 88, '红色上-横向', 'meld', 'low'),
  };
  for (let i = 3; i <= 24; i++) {
    frames[`test_unused_${i}`] = frame(i, i, 88, 307, `测试${i}`, 'ui', 'low');
  }
  frames.legacy_red_horizontal_hua = frame(527, 407, 307, 88, '红色化-横向', 'meld', 'low');
  return {
    meta: { image: 'element.png', size: { w: 1281, h: 1021 } },
    frames,
  };
}

export function runSelfChecks() {
  const deck = createDeck(DEFAULT_RULES);
  assert(deck.length === 144, 'deck should contain 144 cards');
  assert(DEFAULT_RULES.phrases.length === 8, 'must configure 8 phrases');
  assert(PHRASES.map((phrase) => phrase.text).join(' ') === '上大人 孔乙己 化三千 七十土 尔小生 福禄寿 佳作仁 八九子', 'phrase list mismatch');
  assert(deck.filter((card) => card.key === 'shang').length === 6, 'each character should have 6 copies');
  assert(deck.find((card) => card.key === 'shang').color === '#d92d20', 'first phrase card should be red');
  assert(deck.find((card) => card.key === 'da').color === '#079455', 'middle phrase card should be green');
  assert(deck.find((card) => card.key === 'ren').color === '#1d2939', 'last phrase card should be black');
  assert(ASSET_MANIFEST.images.cardFront === 'images/element.png', 'card atlas image should be element.png');
  assert(ASSET_MANIFEST.atlases.cards.path === 'images/element.atlas.json', 'card atlas json path should be configured');

  const cardFrameMap = buildCardAtlasFrameMap(makeTestAtlas());
  assert(cardFrameMap.fu.bySize.big[0].name === 'big_fu_v', 'big vertical card should map from nested key name');
  assert(!cardFrameMap.fu.bySize.big[0].rotateCw, 'v card frame should not rotate');
  assert(cardFrameMap.shang.bySize.big[0].name === 'big_shang_hl' && cardFrameMap.shang.bySize.big[0].rotateCw, 'hl card frame should rotate clockwise');
  assert(cardFrameMap.da.bySize.big[0].name === 'big_da_hr' && cardFrameMap.da.bySize.big[0].rotateCcw, 'hr card frame should rotate counterclockwise');
  assert(cardFrameMap.shang.bySize.small[0].name === 'small_shang_v', 'small card should map from nested key name');
  assert(cardFrameMap.shang.bySize.mini[0].name === 'mini_shang_hl', 'mini card should map from nested key name');
  const legacyFrameMap = buildCardAtlasFrameMap(makeLegacyTestAtlas());
  assert(legacyFrameMap.fu.legacy[0].name === 'legacy_red_fu_vertical', 'legacy vertical card should map from first 24 labels');
  assert(legacyFrameMap.shang.legacy[0].name === 'legacy_red_horizontal_shang' && legacyFrameMap.shang.legacy[0].rotateCw, 'legacy horizontal card should be marked for clockwise rotation');
  assert(legacyFrameMap.hua.legacy[0].name === 'legacy_red_horizontal_hua', 'legacy mapper should skip non-card labels and continue collecting card frames');
  const assetLoader = new AssetLoader(ASSET_MANIFEST);
  assetLoader.setAtlas('cards', makeTestAtlas());
  assetLoader.images.cardFront = {};
  assetLoader.status.cardFront = 'ready';
  assert(assetLoader.getAtlasFrame('cards', 'big_shang_hl'), 'nested atlas frame lookup should work');
  assert(assetLoader.getCardFrame({ key: 'shang' }, 'big').name === 'big_shang_hl', 'card frame should prefer requested big match');
  assert(assetLoader.getCardFrame({ key: 'shang' }, 'small').name === 'small_shang_v', 'card frame should prefer requested small match');
  assert(assetLoader.getCardFrame({ key: 'shang' }, 'mini').name === 'mini_shang_hl', 'card frame should prefer requested mini match');
  assert(assetLoader.getCardFrame({ key: 'fu' }, 'small').name === 'big_fu_v', 'missing requested size should fall back to another size');
  assert(assetLoader.getCardSprite({ key: 'shang' }, 'big').rotateCw, 'hl card sprite should carry clockwise rotation flag');
  assert(assetLoader.getCardSprite({ key: 'da' }, 'big').rotateCcw, 'hr card sprite should carry counterclockwise rotation flag');
  assert(!assetLoader.getCardSprite({ key: 'fu' }, 'big').rotateCw, 'v card sprite should not rotate');
  assert(assetLoader.getCardSprite({ key: 'fu' }, 'small'), 'card sprite should resolve fallback size when image and frame are ready');
  assert(assetLoader.getCardBackFrame('vertical').name === 'tile_back_green_vertical', 'card back frame should resolve');
  assert(!assetLoader.getCardFrame({ key: 'unknown' }), 'missing card frame should return null for canvas fallback');

  const opening = dealOpeningHands(createDeck(DEFAULT_RULES), 0, DEFAULT_RULES);
  assert(opening.hands[0].length === 23, 'dealer should receive 23 cards');
  assert(opening.hands[1].length === 22 && opening.hands[2].length === 22 && opening.hands[3].length === 22, 'idle players should receive 22 cards');
  assert(opening.jiangCard && opening.jiangPhraseId === opening.jiangCard.phraseId, 'jiang card phrase should be marked');
  assert(opening.dealLog.slice(0, 4).map((item) => item.seat).join(',') === '0,1,2,3', 'opening deal should start with dealer and continue counterclockwise');
  const dealerDraws = opening.dealLog.filter((item) => item.seat === 0);
  assert(dealerDraws[dealerDraws.length - 1].card.id === opening.jiangCard.id, 'dealer final opening draw should be jiang card');

  const seats = createSeats(DEFAULT_RULES, 0);
  seats[0].hand = cardsFor(['shang', 'da', 'ren', 'kong', 'yi']);
  seats[1].hand = cardsFor(['qi', 'qi', 'qi', 'da']);
  assert(!hasTriplet(seats[0].hand), 'dealer should have no triplet');
  assert(findTakeoverEligibleSeats(seats, 0, DEFAULT_RULES)[0] === 1, 'seat 1 should be takeover eligible');

  const state = makeState();
  state.seats[0].hand = cardsFor(['da', 'ren']);
  state.seats[3].hand = cardsFor(['shang']);
  state.seats[1].hand = cardsFor(['shang', 'shang', 'shang']);
  const discard = state.seats[3].hand[0];
  let actions = filterHighestPriority(findResponseActions(state, 3, discard, DEFAULT_RULES));
  assert(actions[0].type === 'zhao', 'zhao should outrank chi');

  const pengState = makeState();
  pengState.seats[0].hand = cardsFor(['shang', 'shang']);
  pengState.seats[2].hand = cardsFor(['shang']);
  actions = findResponseActions(pengState, 2, pengState.seats[2].hand[0], DEFAULT_RULES);
  assert(actions.find((action) => action.type === 'peng'), 'peng should be available');
  assert(chooseResponse(actions).priority >= ACTION_PRIORITY.peng, 'AI should choose a priority response');

  const chiPengState = makeState();
  chiPengState.seats[0].hand = cardsFor(['shang', 'shang', 'da', 'ren']);
  chiPengState.seats[3].hand = cardsFor(['shang']);
  const chiPengActions = filterHighestPriority(findResponseActions(chiPengState, 3, chiPengState.seats[3].hand[0], DEFAULT_RULES));
  assert(chiPengActions.find((action) => action.type === 'peng') && chiPengActions.find((action) => action.type === 'chi'), 'xxyz receiving x should offer both peng and chi');

  const zhaoHand = cardsFor(['shang', 'shang', 'shang', 'da', 'da']);
  const zhaoCard = cardsFor(['shang'])[0];
  const zhaoState = makeState();
  zhaoState.seats[0].hand = zhaoHand;
  actions = findSelfDrawActions(zhaoState, 0, zhaoCard, DEFAULT_RULES);
  assert(actions.find((action) => action.type === 'zhao'), 'self-draw zhao should be available');
  assert(validateSupportPairs(zhaoHand, zhaoHand.slice(0, 3).concat([zhaoCard]), DEFAULT_RULES).valid, '4-card zhao should be supported by one pair');
  assert(!validateSupportPairs(cardsFor(['da', 'da', 'da', 'da']), cardsFor(['shang', 'shang', 'shang', 'shang', 'shang']), DEFAULT_RULES).valid, '5-card zhao needs two distinct pair sources');
  assert(!validateSupportPairs(cardsFor(['da', 'da', 'da', 'da']), cardsFor(['shang', 'shang', 'shang', 'shang', 'shang', 'shang']), DEFAULT_RULES).valid, '6-card ta needs three valid pair sources');

  const winCards = cardsFor([
    'shang', 'shang', 'shang',
    'da', 'ren',
    'kong', 'yi', 'ji',
    'hua', 'san', 'qian',
    'qi', 'shi', 'tu',
    'er', 'xiao', 'sheng',
    'fu', 'lu', 'shou',
    'jia', 'zuo', 'ren2',
  ]);
  const win = evaluateWin(winCards, [], 'self', DEFAULT_RULES);
  assert(win.isWin, 'expected eight-door win');
  assert(win.scoring && win.grade && win.points, 'winning result should include scoring summary');
  const noXy = evaluateWin(cardsFor([
    'shang', 'shang', 'shang',
    'da', 'da', 'da',
    'ren', 'ren', 'ren',
    'kong', 'yi', 'ji',
    'hua', 'san', 'qian',
    'qi', 'shi', 'tu',
    'er', 'xiao', 'sheng',
    'fu', 'lu', 'shou',
  ]), [], 'self', DEFAULT_RULES);
  assert(!noXy.isWin, 'missing xy must fail');

  const discardSeat = createSeats(DEFAULT_RULES, 0)[0];
  discardSeat.hand = cardsFor(['shang', 'da', 'ren', 'kong']);
  assert(!isLegalDiscard(discardSeat, discardSeat.hand[0], DEFAULT_RULES).legal, 'complete phrase discard should be illegal');
  const extraPhraseSeat = createSeats(DEFAULT_RULES, 0)[0];
  extraPhraseSeat.hand = cardsFor(['shang', 'shang', 'da', 'ren']);
  assert(isLegalDiscard(extraPhraseSeat, extraPhraseSeat.hand[0], DEFAULT_RULES).legal, 'xxyz should allow one extra-card discard');
  assert(buildCircleLossResult(0, createSeats(DEFAULT_RULES), '测试进圈').type === 'circle-loss', 'circle-loss result should be created');
  assert(chooseDiscard({ hand: cardsFor(['shang', 'shang', 'kong']) }, DEFAULT_RULES), 'AI should choose discard');
  assert(typeof isListening(cardsFor(['shang', 'shang']), [], DEFAULT_RULES) === 'boolean', 'listening evaluator should return boolean');
  assert(hasKezi(cardsFor(['shang', 'shang', 'shang']), []), 'three same cards should count as kezi');
  assert(!hasKezi(cardsFor(['shang', 'da', 'ren']), []), 'plain phrase should not count as kezi');

  const scoring = calculateHuScoring([
    { type: 'same', key: 'shang', keys: ['shang', 'shang', 'shang'] },
    { type: 'same', key: 'da', keys: ['da', 'da', 'da', 'da'], meldType: 'zhao' },
    { type: 'xyz', keys: ['kong', 'yi', 'ji'] },
    { type: 'xyz', keys: ['hua', 'san', 'qian'] },
    { type: 'xyz', keys: ['qi', 'shi', 'tu'] },
    { type: 'xyz', keys: ['er', 'xiao', 'sheng'] },
    { type: 'xx', key: 'fu', keys: ['fu', 'fu'] },
    { type: 'xy', keys: ['jia', 'zuo'] },
  ], DEFAULT_RULES, { jiangPhraseId: 'sdr' });
  assert(scoring.totalFu >= 24 && scoring.hasJiangMultiplier, 'scoring should apply jiang multiplier');
  assert(pointValueForGrade('屁胡', DEFAULT_RULES) === 1, 'pi hu should settle 1 point');
  assert(pointValueForGrade('小甲', DEFAULT_RULES) === 2, 'jia hands should settle 2 points');
  assert(pointValueForGrade('场', DEFAULT_RULES) === 4, 'chang should settle 4 points');
  const operationScoring = calculateOperationFu([
    { type: 'chi', label: '吃', cards: cardsFor(['shang', 'da', 'ren']) },
    { type: 'peng', label: '碰', key: 'da', cards: cardsFor(['da', 'da', 'da']) },
    { type: 'zhao', label: '招', key: 'shang', cards: cardsFor(['shang', 'shang', 'shang', 'shang']) },
  ], DEFAULT_RULES, { jiangPhraseId: 'sdr' });
  assert(operationScoring.entries.find((entry) => entry.type === 'chi').fu === 1, 'chi should count one operation fu');
  assert(operationScoring.totalFu === 1 + 8 + 32, 'operation fu should score chi, peng, zhao and jiang multiplier');

  const layoutSeats = createSeats(DEFAULT_RULES, 0);
  layoutSeats[0].hand = cardsFor([
    'shang', 'shang', 'da', 'ren',
    'kong', 'yi', 'yi', 'ji',
    'hua', 'san', 'qian',
    'qi', 'shi', 'tu',
    'er', 'xiao', 'sheng',
    'fu', 'lu', 'shou',
    'jia', 'zuo', 'ren2',
  ]);
  const layout = new TableLayout(844, 390).build({
    rules: DEFAULT_RULES,
    seats: layoutSeats,
    humanSeat: 0,
    selectedCardId: null,
    playerActions: [],
    phase: 'human-discard',
  });
  assert(Math.abs((layout.handCards[0].width / layout.handCards[0].height) - CARD_ASPECT_RATIO) < 0.015, 'hand cards should preserve atlas aspect ratio');
  assert(layout.handColumns.length > 0 && layout.handColumns.length < DEFAULT_RULES.phrases.length, 'hand should collapse empty phrase columns');
  assert(layout.handCards[0].phraseColumn === 0 && layout.handCards[layout.handCards.length - 1].phraseColumn === 6, 'hand cards should be ordered by phrase column');
  const shangCards = layout.handCards.filter((card) => card.key === 'shang');
  assert(shangCards.length === 2 && shangCards[0].stackIndex === 0 && shangCards[1].stackIndex === 1, 'identical cards should be adjacent in a stack');
  const expectedLeft = Math.floor((layout.width - layout.cardWidth * layout.handColumns.length) / 2);
  const expectedStep = Math.max(1, Math.round(HAND_STACK_SOURCE_STEP * (layout.cardHeight / CARD_SOURCE_HEIGHT)));
  assert(layout.cardStep === expectedStep, 'same-phrase stack offset should scale from the small-card source offset');
  layout.handCards.forEach((card) => {
    assert(card.x === expectedLeft + card.phraseColumn * layout.cardWidth, 'phrase stacks should touch without gaps and stay centered');
  });
  const firstPhraseCards = layout.handCards.filter((card) => card.phraseColumn === 0).sort((a, b) => a.stackIndex - b.stackIndex);
  assert(firstPhraseCards.every((card) => card.x === firstPhraseCards[0].x), 'same phrase cards should share one stack x position');
  assert(firstPhraseCards[1].y - firstPhraseCards[0].y === expectedStep, 'same phrase cards should use the scaled vertical offset');
  const phraseBottoms = Object.keys(layout.handCards.reduce((columns, card) => {
    columns[card.phraseColumn] = true;
    return columns;
  }, {})).map((phraseColumn) => {
    const cards = layout.handCards.filter((card) => card.phraseColumn === Number(phraseColumn)).sort((a, b) => a.stackIndex - b.stackIndex);
    return cards[cards.length - 1].y + cards[cards.length - 1].height;
  });
  assert(phraseBottoms.every((bottom) => bottom === phraseBottoms[0]), 'phrase stacks should align to the same bottom edge');
  const renderer = new TableRenderer({});
  const handSpriteSizes = [];
  renderer.drawCard = (...args) => {
    handSpriteSizes.push(args[8]);
  };
  renderer.drawPlayerHand({}, { selectedCardId: null }, layout);
  assert(handSpriteSizes.length === layout.handCards.length, 'renderer should draw each hand card');
  assert(handSpriteSizes.every((size) => size === 'small'), 'human hand cards should request small sprites');

  return true;
}
