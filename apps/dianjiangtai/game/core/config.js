/**
 * Versioned tuning config (spec 7, 7.5, 12, 11.5). Pure JS; copied into the
 * cloud functions. Anything that changes a sim outcome bumps `configVersion`
 * (the seed bank and stored runs pin to it); the server keeps the last 2.
 *
 * Tuned with tools/simstats.js, see tools/simstats-report.md. Deviations from the spec 7.2/7.5 starting values (all reported to the CTO):
 * curve (flatter and higher: 7.7 -> 10.3), tau 0.7, jitter 0.35, event pMin 0.672 (was 0.35), band targets (12-0 is really hard:
 * founder decision), gate greedy window [0.0025, 0.2]. Formula weights, role weights, morale constants are unchanged.
 */

const V1 = {
  configVersion: 1,
  /** Bumped whenever the 7.5.1 population rules change. */
  gateVersion: 1,

  rounds: 5,
  battles: 12,

  /**
   * Battle types and their team-power weights over (zhugong, junshi,
   * xianfeng, mengjiang, shoujiang), spec 7.2 step 4.
   */
  battleTypes: [
    { key: 'yeZhan', label: '野战', w: [0.15, 0.15, 0.3, 0.3, 0.1] },
    { key: 'gongCheng', label: '攻城', w: [0.15, 0.25, 0.25, 0.2, 0.15] },
    { key: 'shouCheng', label: '守城', w: [0.15, 0.2, 0.05, 0.15, 0.45] },
    { key: 'shuiZhan', label: '水战', w: [0.15, 0.4, 0.15, 0.15, 0.15] },
    { key: 'qiXi', label: '奇袭', w: [0.1, 0.3, 0.35, 0.2, 0.05] },
    { key: 'anMin', label: '安民', w: [0.45, 0.25, 0.05, 0.05, 0.2] },
  ],

  /** Opponent strength per battle and the logistic temperature. */
  curve: [7.41, 7.674, 7.937, 8.201, 8.465, 8.728, 8.992, 9.255, 9.519, 9.783, 10.046, 10.31],
  tau: 0.7,
  /** Opponent jitter j_i is uniform in [-jitter, +jitter]. */
  jitter: 0.35,

  /** Morale multiplier M (spec 7.2 step 2). */
  morale: { base: 0.85, perLord: 0.03, perBond: 0.04, cohesion4: 0.03, cohesion5: 0.05, cap: 1.25 },

  /** Events (spec 7.2 step 8). */
  events: {
    wavering: { maxXin: 3, base: 4, perPoint: 0.1 },
    stratagem: { minZhi: 9, pMin: 0.672, types: ['shuiZhan', 'qiXi'] },
    unstoppable: { yong: 10, pMin: 0.672, types: ['yeZhan'] },
  },

  /** 天时 label from the shared luck roll u (low u is lucky). */
  luck: { jiBelow: 1 / 3, pingBelow: 2 / 3 },

  /** Grade bands (spec 7.5), by wins. */
  bands: [
    { key: 'yitong', label: '一统天下', min: 12, max: 12, target: [0.002, 0.005] },
    { key: 'baye', label: '霸业将成', min: 10, max: 11, target: [0.06, 0.1] },
    { key: 'xiongju', label: '雄踞一方', min: 8, max: 9, target: [0.22, 0.32] },
    { key: 'dingli', label: '三分鼎立', min: 6, max: 7, target: [0.25, 0.36] },
    { key: 'pianan', label: '偏安一方', min: 4, max: 5, target: [0.15, 0.25] },
    { key: 'bingwei', label: '兵微将寡', min: 2, max: 3, target: [0.05, 0.12] },
    { key: 'tubai', label: '一败涂地', min: 0, max: 1, target: [0, 0.02] },
  ],

  /** Re-spin allowance per run by mode (spec 4). */
  allowance: {
    free: { faction: 1, era: 1, ad: 2 },
    daily: { faction: 1, era: 1, ad: 0 },
    challenge: { faction: 1, era: 1, ad: 0 },
  },
  /** Alternates stored per dimension per round (1 free + up to 2 ad). */
  altCount: 3,
  /** Fallback token sets stored per round for the empty-pool reflip (spec 4). */
  fallbackCount: 4,

  /** Gate populations (spec 7.5.1). */
  gates: {
    K: 400,
    greedy: { respinP: 0.3, gainBelow: 7.0, takeBest: 0.8, rateMin: 0.0025, rateMax: 0.2 },
    random: { respinP: 0.5, rateMax: 0.005 },
    maxCandidates: 50,
  },

  /** Player models for tools/simstats.js (spec 7.5). */
  players: {
    // deterministic-choice greedy used for the tuning table: re-spin a
    // dimension when the best current S gain is below this
    greedyRespinBelow: 7.0,
    naiveRespin: false,
  },

  /** Ads (spec 12). */
  ads: {
    rewardedRespinPerRun: 2,
    rewardedReplayPerRun: 1,
    interstitial: { minLifetimeRuns: 4, everyNthRun: 3, minGapMs: 120000, maxPerDay: 5 },
    stubDelayMs: 3000,
  },

  /** 复盘 (spec 7.4): token sets with more distinct general sets than this are asked of the server first. */
  search: { heavySets: 2000 },

  /** Pool cap per round (spec 4, PO-5): the first poolCap undrafted generals of the cell in the seeded pool order. Cells of 8 or fewer are unaffected. */
  poolCap: 8,

  /** 识人模式 (spec 8.11): the Sunday daily (Date weekday 0). Display only: never changes the sim. */
  shiren: { weekday: 0 },

  /** Boards (spec 11.5). */
  boardListCap: 3000,
  showUnverified: true,

  /** Analytics (spec 15). */
  analytics: { flushMs: 20000, maxBatch: 50, sessionGapMs: 30 * 60 * 1000 },

  /** Daily 军令 (spec 5.2). */
  daily: { launchDateKey: '20261101', graceMs: 30 * 60 * 1000, bankLowWarn: 10 },

  /**
   * Free-play rarity (spec 7.5 "Rarity line"): freeRarity[w] is the share of
   * sensible-player runs reaching w wins or better. Filled from the
   * simstats distribution.
   */
  freeRarity: [1, 0.998, 0.9896, 0.9667, 0.9219, 0.8476, 0.7346, 0.5817, 0.3975, 0.2204, 0.0929, 0.0253, 0.0033],
};

/**
 * configVersion 2 (contentVersion 2, the v1 release). Same formula, role weights and morale constants as configVersion 1;
 * the retune for the 120-general roster (D15 targets, AC 74) lives in V2_TUNING. configVersion 1 stays intact for old seeds.
 */
const V2 = JSON.parse(JSON.stringify(V1));
V2.configVersion = 2;
V1.contentVersion = 1;
V2.contentVersion = 2;
const V2_TUNING = {};
Object.assign(V2, V2_TUNING);

const CONFIGS = { 1: V1, 2: V2 };
const LATEST_CONFIG_VERSION = 2;

/** The config a content version is tuned with: 1 -> 1, 2 -> 2. Callers that pass no configVersion get this. */
function defaultConfigVersion(contentVersion) {
  return Number(contentVersion) === 1 ? 1 : LATEST_CONFIG_VERSION;
}

/** getConfig(version) -> config | null */
function getConfig(version) {
  return CONFIGS[Number(version)] || null;
}

/** Wins -> band object. */
function bandFor(config, wins) {
  for (const b of config.bands) if (wins >= b.min && wins <= b.max) return b;
  return config.bands[config.bands.length - 1];
}

module.exports = { getConfig, bandFor, LATEST_CONFIG_VERSION, CONFIGS, defaultConfigVersion };
