/**
 * Tuning constants (spec 3, 5, 9, 11). Pure JS; copied into the cloud functions.
 * One frozen object, versioned. The server may override only the keys the spec lists
 * as remote (app_config: ads.interstitial, ads.banner, subscribe), see features.js / adpolicy.js.
 */

const CONFIG = Object.freeze({
  configVersion: 2,

  /** Track: integer positions 0..100 (spec 3). */
  track: { min: 0, max: 100, nudge: 1, tickEvery: 5 },

  score: {
    /** s(d) = max(0, 100 - ceil(perStep * d)) (spec 3.1) */
    perStep: 2.5,
    /** card label upper bounds on d (spec 3.1): <=2, <=6, <=12, <=20, else the last label */
    labels: [
      { maxD: 2, label: '心有灵犀' },
      { maxD: 6, label: '很同频' },
      { maxD: 12, label: '差不多' },
      { maxD: 20, label: '有点偏' },
      { maxD: Infinity, label: '想法独特' },
    ],
    /** day bands: lowest total for each band, descending (spec 3.3) */
    bands: [
      { min: 450, label: '灵魂同频' },
      { min: 380, label: '默契十足' },
      { min: 300, label: '大体同频' },
      { min: 200, label: '各有想法' },
      { min: 0, label: '独树一帜' },
    ],
    /** virtual votes at the editor anchor (PD-4) */
    priorVotes: 10,
    /** "和全国 x% 的人想法相近": within +-agreeRadius, shown from agreeMinN real answers (spec 3.3) */
    agreeRadius: 10,
    agreeMinN: 30,
    /** percentile hidden below this many complete dailies (spec 3.3) */
    percentileMinN: 30,
    /** hollow-dot / sample size under which the national label says 样本少 (spec 15.7) */
    smallSampleN: 30,
    /** "和你一样" when the group median is within this many steps (spec 6.3) */
    sameAsYouD: 2,
    /** bullseye (confetti, chime, vibrate): d <= this (spec 6.3, AC 17) */
    bullseyeD: 2,
  },

  daily: {
    cards: 5,
    /** placeholder; LAUNCH_DATE_KEY env / meta.launch override it on the server (spec 5) */
    launchDateKey: '20261101',
    /** a daily started on D may finish until D+1 00:30 BJT; 定分 at the same moment (spec 5, PD-24) */
    graceMs: 30 * 60 * 1000,
    /** card 5 within this many ms of card 1 raises the observe-only `fast` flag (spec 11.5) */
    fastMs: 6000,
  },

  group: {
    /** group page: members needed (spec 3.4) */
    minForLeaveOneOut: 2,
    minForMq: 3,
    rowCap: 500,
    /** dots drawn in the reveal are down-sampled to this many */
    dotCap: 60,
    trendDays: 7,
    roundsListCap: 10,
    cacheSec: 60,
  },

  board: { listCap: 3000, cacheSec: 60 },

  rounds: {
    targetMin: 5,
    targetMax: 95,
    minGuessesToReveal: 2,
    autoRevealAtGuesses: 8,
    autoRevealMs: 24 * 3600e3,
    guessCloseMs: 7 * 24 * 3600e3,
    draftMs: 30 * 60e3,
    groupRefsCap: 10,
    offerSpectra: 3,
    clueOptions: 6,
    freeSpectraSwaps: 1,
    adSpectraSwapsMax: 3,
  },

  limits: {
    createRoundPerDay: 20,
    bonusPerDay: 3,
    /** spec 11.2 says 3; raised, see decisions TD-8 (the ad was already watched when this is hit) */
    distributionPerDay: 20,
    reportPerDay: 10,
    trackBatchMax: 50,
    /**
     * Per-openid fixed-window (1 minute) call limits of EVERY client-callable function (M3, TD-63). Reads about 60,
     * writes about 20; the heavy readers (a board or 60-set scan per call) and the one-shot writers are lower.
     * Applied by store.handler before any work; a refused call returns RATE_LIMITED.
     */
    perMinute: {
      getDaily: 60, getArchive: 60, getArchiveDay: 60, getRound: 60,
      getGroupDay: 30, getFriendBoard: 30, getBonusCard: 10, unlockDistribution: 20,
      submitCard: 30, submitGuess: 20, createRound: 20, setClue: 20, revealRound: 20, subscribeRound: 20,
      joinGroup: 20, reportCard: 10, track: 30,
      // D-2 (spec 11.6): agreeRules 20, reportClue 10; admin 60 applies to an allow-listed openid only (the console carries none)
      agreeRules: 20, reportClue: 10, admin: 60,
    },
    /** typed-clue WeChat checks per user per Beijing day (spec 11.2 setClue, AC 99); local rejections do not count */
    clueChecksPerDay: 50,
    /** reportClue per user per Beijing day (spec 11.2, AC 91) */
    clueReportsPerDay: 10,
  },

  /** Display caps for responses and server events (M3). */
  caps: {
    /** guesses read for a reveal view (a round hardly passes the 8th on-time guess; late guesses are the tail) */
    guessesShown: 500,
    /** board_list server events are written for one request in this many (the rest are sampled out) */
    boardEventEvery: 10,
  },

  archive: { pageMax: 30, bonusExcludeMax: 60 },

  /** Interstitial defaults and clamps (spec 9); app_config.ads.interstitial may override within the clamps. */
  interstitial: {
    defaults: { enabled: true, everyNSets: 2, minLifetimeSets: 3, minGapSec: 120, maxPerDay: 6 },
    clamp: { everyNSets: { min: 2 }, minLifetimeSets: { min: 2 }, minGapSec: { min: 60 }, maxPerDay: { max: 8 } },
  },

  analytics: { flushMs: 20000, maxBatch: 50, sessionGapMs: 30 * 60 * 1000 },

  /**
   * Typed clues (D-2, spec 6.12, 11.6-11.8). rulesVersion: the 发言规则 version a host must have agreed to.
   * reportReasons: the five report reasons (the legacy spelling 'ad' is accepted by input.js and stored as 'ads').
   */
  ugc: {
    rulesVersion: 1,
    clueMax: 12,
    reportReasons: ['porn', 'politics', 'abuse', 'ads', 'other'],
    /** sweepRounds alerts for a report still open after this long */
    staleReportAlertMs: 48 * 3600e3,
    /** sweepRounds alerts when >= rate of >= minCalls text checks in the last windowMs were busy */
    busyAlert: { minCalls: 20, rate: 0.5, windowMs: 3600e3 },
    /** admin sample: passed typed clues of the last 24 h */
    sampleWindowMs: 24 * 3600e3,
  },

  /** WeChat text check (spec 11.6). scene 3 = 论坛 (a clue is shown to several people). */
  moderation: {
    scene: 3,
    textGameTimeoutMs: 2000,
    textTimeoutMs: 3000,
    mockSyncDelayMs: 300,
    /** dev + live only: calls per day (protects the pre-publish quota), counted in mod_quota/<dateKey> */
    devTextDailyBudget: 80,
  },

  /** Strike ladder (spec 11.8, 传画接龙 7.3): strikes in the rolling window -> consequence. */
  strikes: {
    windowMs: 30 * 86400e3,
    /** strike timestamps kept per player */
    keepMax: 10,
    ladder: [
      { at: 1, warn: true, restrictMs: 0, flag: false },
      { at: 2, warn: false, restrictMs: 24 * 3600e3, flag: false },
      { at: 3, warn: false, restrictMs: 7 * 86400e3, flag: false },
      { at: 4, warn: false, restrictMs: 30 * 86400e3, flag: true },
    ],
  },

  /** retention days (spec 13) */
  retentionDays: 180,
});

module.exports = { CONFIG, getConfig: () => CONFIG };
