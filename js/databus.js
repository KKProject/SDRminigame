import { DEFAULT_RULES, PHASES } from './game/rules';

let instance;

export default class DataBus {
  rules = DEFAULT_RULES;
  seats = [];
  deck = [];
  phase = PHASES.RESULT;
  currentSeat = 0;
  humanSeat = DEFAULT_RULES.humanSeat;
  dealerSeat = DEFAULT_RULES.dealerSeat;
  nextDealerSeat = DEFAULT_RULES.dealerSeat;
  slippedDealer = null;
  takeoverDealer = null;
  takeoverQueue = [];
  jiangCard = null;
  jiangPhraseId = null;
  appearingCard = null;
  drawnCard = null;
  selectedCardId = null;
  recentDiscard = null;
  pendingActions = [];
  playerActions = [];
  responseSummary = null;
  responseWindowId = null;
  actionState = 'closed';
  zhaoSizePicker = null;
  feedback = '';
  result = null;
  roundDetail = null;
  tableRecord = null;
  tableRecordOpen = false;
  muted = false;
  round = 0;
  tableStatus = '';
  tableRoomId = '';
  tableSettings = {};
  tableFinished = false;
  tableRematch = null;

  constructor() {
    if (instance) return instance;
    instance = this;
  }

  setRoundState(state) {
    Object.assign(this, state);
  }

  reset() {
    this.setRoundState({
      rules: DEFAULT_RULES,
      seats: [],
      deck: [],
      phase: PHASES.RESULT,
      currentSeat: 0,
      humanSeat: DEFAULT_RULES.humanSeat,
      dealerSeat: DEFAULT_RULES.dealerSeat,
      nextDealerSeat: DEFAULT_RULES.dealerSeat,
      slippedDealer: null,
      takeoverDealer: null,
      takeoverQueue: [],
      jiangCard: null,
      jiangPhraseId: null,
      appearingCard: null,
      drawnCard: null,
      selectedCardId: null,
      recentDiscard: null,
      pendingActions: [],
      playerActions: [],
      responseSummary: null,
      responseWindowId: null,
      actionState: 'closed',
      zhaoSizePicker: null,
      feedback: '',
      result: null,
      roundDetail: null,
      tableRecord: null,
      tableRecordOpen: false,
      muted: this.muted,
      round: this.round,
      tableStatus: '',
      tableRoomId: '',
      tableSettings: {},
      tableFinished: false,
      tableRematch: null,
    });
  }
}
