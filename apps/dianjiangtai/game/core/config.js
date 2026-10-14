/**
 * Versioned tuning config (spec 7, 7.5, 12, 11.5). Pure JS; copied into the
 * cloud functions. Anything that changes a sim outcome bumps `configVersion`
 * (the seed bank and stored runs pin to it); the server keeps the last 2.
 *
 * Tuned with tools/simstats.js, see tools/simstats-report.md.
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
  curve: [8.479, 8.495, 8.511, 8.528, 8.544, 8.56, 8.576, 8.593, 8.609, 8.625, 8.641, 8.658],
  tau: 1.343,
  /** Opponent jitter j_i is uniform in [-jitter, +jitter]. */
  jitter: 0.322,

  /** Morale multiplier M (spec 7.2 step 2). */
  morale: { base: 0.85, perLord: 0.03, perBond: 0.04, cohesion4: 0.03, cohesion5: 0.05, cap: 1.25 },

  /** Events (spec 7.2 step 8). */
  events: {
    wavering: { maxXin: 3, base: 4, perPoint: 0.1 },
    stratagem: { minZhi: 9, pMin: 0.67, types: ['shuiZhan', 'qiXi'] },
    unstoppable: { yong: 10, pMin: 0.67, types: ['yeZhan'] },
  },

  /** 天时 label from the shared luck roll u (low u is lucky). */
  luck: { jiBelow: 1 / 3, pingBelow: 2 / 3 },

  /** Grade bands (spec 7.5), by wins. */
  bands: [
    { key: 'yitong', label: '一统天下', min: 12, max: 12, target: [0.01, 0.03] },
    { key: 'baye', label: '霸业将成', min: 10, max: 11, target: [0.12, 0.18] },
    { key: 'xiongju', label: '雄踞一方', min: 8, max: 9, target: [0.25, 0.3] },
    { key: 'dingli', label: '三分鼎立', min: 6, max: 7, target: [0.25, 0.3] },
    { key: 'pianan', label: '偏安一方', min: 4, max: 5, target: [0.12, 0.18] },
    { key: 'bingwei', label: '兵微将寡', min: 2, max: 3, target: [0.04, 0.08] },
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
    greedy: { respinP: 0.3, gainBelow: 7.0, takeBest: 0.8, rateMin: 0.005, rateMax: 0.05 },
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

  /** Boards (spec 11.5). */
  boardListCap: 3000,
  showUnverified: true,

  /** Analytics (spec 15). */
  analytics: { flushMs: 20000, maxBatch: 50, sessionGapMs: 30 * 60 * 1000 },

  /** Daily 军令 (spec 5.2). */
  daily: { launchDateKey: '20261101', graceMs: 30 * 60 * 1000, bankLowWarn: 7 },

  /**
   * Free-play rarity (spec 7.5 "Rarity line"): freeRarity[w] is the share of
   * sensible-player runs reaching w wins or better. Filled from the
   * simstats distribution.
   */
  freeRarity: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
};

const CONFIGS = { 1: V1 };
const LATEST_CONFIG_VERSION = 1;

/** getConfig(version) -> config | null */
function getConfig(version) {
  return CONFIGS[Number(version)] || null;
}

/** Wins -> band object. */
function bandFor(config, wins) {
  for (const b of config.bands) if (wins >= b.min && wins <= b.max) return b;
  return config.bands[config.bands.length - 1];
}

module.exports = { getConfig, bandFor, LATEST_CONFIG_VERSION, CONFIGS };
