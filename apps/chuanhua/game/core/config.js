/**
 * Constants shared by client and server (spec 3, 5, 6, 7, 11). Pure data, no logic.
 * The server may override timers and ad caps from `app_config`; everything else is fixed here.
 */

const HOUR = 3600e3;
const DAY = 24 * HOUR;

const CONFIG = {
  configVersion: 1,
  promptsVersion: 1,
  rulesVersion: 1, // 接龙公约 version; a bump shows the sheet once more

  chain: {
    length: 6, // 棒 after the prompt (PO-1)
    minReveal: 4, // early reveal / expiry reveal threshold (PO-5)
    maxPerPerson: 3, // PO-3
    lifetimeMs: 48 * HOUR,
    claimTtlMs: 150e3, // PO-4
    abandonGraceMs: 5 * 60e3, // a starting chain whose 第 1 棒 claim expired is marked abandoned after this
    takenEtaText: '约 2 分钟内',
  },

  timers: { drawSec: 60, describeSec: 45, warnSec: 10 },

  text: { promptMin: 2, promptMax: 12, descMin: 2, descMax: 16 },

  strokes: {
    version: 1,
    grid: 1024,
    maxStrokes: 200,
    maxPoints: 4000,
    maxPointsPerStroke: 600,
    maxJsonBytes: 32 * 1024,
    minPointDist: 3, // grid units between kept points (client capture)
    colorCount: 12,
    sizeCount: 3,
  },

  // index 0-5 base, 6-11 今日彩笔 (rewarded, today only)
  palette: ['#1E1B18', '#D8433B', '#F29B30', '#3E9B5A', '#3C78C8', '#7B4FB3', '#F28DB2', '#F2D13C', '#6CC3E0', '#8A5A3B', '#9A9A9A', '#9CCB4A'],
  paletteNames: ['墨', '朱', '橙', '绿', '蓝', '紫', '粉', '黄', '天青', '棕', '灰', '草'],
  baseColors: 6,
  brushSizes: [8, 18, 36], // grid units: 细 中 粗
  brushNames: ['细', '中', '粗'],

  raster: { size: 512, background: [255, 255, 255] }, // server moderation PNG (PO-10)

  allowances: {
    startsFree: 3,
    startsAd: 2,
    stepsPerDay: 40,
    claimsPerChainPerDay: 3,
    reportsPerDay: 10,
    paletteAdPerDay: 1,
  },

  moderation: {
    scene: 3,
    version: 2,
    recheckAfterMs: 35 * 60e3, // pending drawing without verdict: one new check
    voidAfterMs: 70 * 60e3, // still nothing: void
    mediaRetryDelaysMs: [5 * 60e3, 10 * 60e3], // mediaCheckAsync call errors: at most 2 retries, then void
    mockMediaDelaySec: 60,
    mockStrokeCounts: { risky: 13, review: 14, noVerdict: 15 },
    mockText: { risky: '测试违规', review: '测试复审', busy: '测试繁忙' },
  },

  strikes: {
    windowMs: 30 * DAY,
    // strikes within the window -> restriction
    ladder: [
      { strikes: 1, restrictMs: 0, warn: true },
      { strikes: 2, restrictMs: 24 * HOUR },
      { strikes: 3, restrictMs: 7 * DAY },
      { strikes: 4, restrictMs: 30 * DAY, adminReview: true },
    ],
  },

  report: { reasons: ['porn', 'politics', 'abuse', 'ad', 'other'], reasonLabels: { porn: '色情低俗', politics: '政治敏感', abuse: '辱骂攻击', ad: '广告引流', other: '其他不适' } },

  retentionMs: 180 * DAY,
  abandonedDeleteMs: DAY,
  groupMemberFreshMs: 30 * DAY,

  daily: {
    perDay: 3,
    // TODO(founder/backend): the real launch date lives in the `meta/launch` document; this is only the offline default
    launchDateKey: '20261101',
    seedName: 'chuanhua-daily-v1',
    nationalCountMin: 30,
  },

  streak: { showFrom: 2 },

  ads: {
    // remote caps are clamped to these bounds (spec 11)
    interstitial: { minLifetimeReveals: 3, minGapSec: 180, maxPerDay: 3, clampMinGapSec: 120, clampMaxPerDay: 4 },
    stubDelayMs: 3000,
    bannerGapPt: 24,
  },

  analytics: { maxBatch: 50, flushMs: 20e3, sessionGapMs: 30 * 60e3 },
  launchHints: { sentPollMs: 15e3, sentPollMaxMs: 10 * 60e3 },
};

/** Remote `app_config` merged over the defaults (missing/garbage values fall back; spec 17.31). */
function withRemote(remote) {
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  if (!remote || typeof remote !== 'object') return cfg;
  const t = remote.timers;
  if (t && Number.isFinite(t.drawSec) && t.drawSec >= 20 && t.drawSec <= 180) cfg.timers.drawSec = Math.round(t.drawSec);
  if (t && Number.isFinite(t.describeSec) && t.describeSec >= 15 && t.describeSec <= 120) cfg.timers.describeSec = Math.round(t.describeSec);
  const i = remote.ads && remote.ads.interstitial;
  if (i && typeof i === 'object') {
    const c = cfg.ads.interstitial;
    if (Number.isFinite(i.minGapSec)) c.minGapSec = Math.max(c.clampMinGapSec, i.minGapSec);
    if (Number.isFinite(i.maxPerDay)) c.maxPerDay = Math.max(0, Math.min(c.clampMaxPerDay, i.maxPerDay));
    if (Number.isFinite(i.minLifetimeReveals)) c.minLifetimeReveals = Math.max(0, i.minLifetimeReveals);
  }
  return cfg;
}

module.exports = { CONFIG, HOUR, DAY, withRemote };
