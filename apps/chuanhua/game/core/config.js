'use strict';
/**
 * Game constants (spec 3, 4, 5, 6, 7, 11). Pure data + two helpers. Shared by client, mock server and
 * cloud functions (copied by cloudfunctions/scripts/sync-core.js). Nothing here reads wx, process or time.
 *
 * Remote overrides (app_config) go through `applyRemote`, which clamps every value so a bad console edit
 * cannot break the rules (spec 17.31: unreadable config -> defaults).
 */

const MIN = 60e3;
const HOUR = 3600e3;
const DAY = 86400e3;

const CONFIG = {
  /** bumped when the 接龙公约 text changes (spec 8.2): everybody is asked again */
  rulesVersion: 2, // rev. 2 (rooms, 80 turns a day, rolls) is a material change to the agreement (spec 8.2)
  promptsVersion: 2,

  chain: {
    length: 6, // PO-1: 6 棒 after the prompt
    drawSteps: [1, 3, 5],
    describeSteps: [2, 4, 6],
    maxPerPerson: 3, // PO-3, counts passed + pending, never blocked/void/hidden/deleted
    earlyRevealMin: 4, // PO-5: 现在揭晓 and expiry reveal need >= 4 passed
    lifetimeMs: 48 * HOUR,
    claimTtlMs: 150e3, // PO-4
    membershipFreshMs: 30 * DAY, // group_members.lastSeen must be this recent to claim (3.3)
  },

  timers: { drawSec: 60, describeSec: 45, warnSec: 10 },

  /** live rooms (spec 3A, PO-41..43), remote-configurable under app_config.room (clamped by applyRemote) */
  room: {
    minPlayers: 3,
    maxPlayers: 10,
    maxRounds: 4, // R = min(n - 1, maxRounds); clamp 2-6
    promptSec: 30,
    drawSec: 60,
    describeSec: 45,
    graceSec: 5,
    lobbyIdleMin: 30,
    gameMaxMin: 20,
    startDelayMs: 1000, // the next round starts this long after the advance so clients can fetch (3A.5)
    inFlightMs: 8000, // a slot `received` for less than this blocks a deadline end (3A.5)
    sweepOverdueMs: 10e3, // roomSweeper advances rounds overdue by more than this
    quietMs: 60e3, // lobby "可能已离开" hint after this much silence (3A.6)
    signalKeepMs: DAY, // room_signals and closed lobbies are deleted this long after the end (7.5)
  },

  /** realtime sync (3A.7), remote-configurable under app_config.rt */
  rt: { watch: true, pollSec: 2, safetyPollSec: 10 },

  text: {
    promptMin: 2,
    promptMax: 12,
    describeMin: 2,
    describeMax: 16,
    /** 5 or more digits in total are rejected (5.6) */
    digitsReject: 5,
  },

  strokes: {
    version: 2, // v2 adds the stored height `h`; v1 (square, h = 1024) still decodes (5.3)
    grid: 1024,
    minH: 768,
    maxH: 2048,
    maxStrokes: 200,
    maxPoints: 4000,
    maxPointsPerStroke: 600,
    maxBytes: 32 * 1024,
    /** ink budget: total path length of all strokes in grid units (backend raster cost guard, TD-24 backend; reason 'pathLength') */
    maxPathUnits: 250000,
    /** the recorder stops this far below the cap (the longest single segment is about 1,450 units) so a conforming drawing always validates */
    pathMargin: 1500,
    minPointDist: 3, // grid units between kept points (5.1)
    colors: 12,
    sizes: 3,
  },

  raster: { size: 512 }, // server PNG for moderation: 512 x round(512 * h / 1024); widths scale with size / 1024

  allowances: {
    freeStarts: 3,
    adStartsMax: 2,
    stepsPerDay: 80, // sent turns across both modes, markers excluded (PO-48)
    roomsCreatedPerDay: 10,
    roomsJoinedPerDay: 30,
    claimsPerChainPerDay: 3,
    reportsPerDay: 10,
  },

  moderation: {
    scene: 3, // 论坛 (6.1, V3)
    textTimeoutMs: 3000, // general msgSecCheck
    textGameTimeoutMs: 2000, // game msgSecCheck (6.1: the doc suggests 1 s, we use 2 s)
    imageSyncTimeoutMs: 5000, // mediaCheckSync (6.1: the doc recommends 5 s)
    imageMode: 'sync', // 'sync' (default) | 'async' (fallback: live rooms off, 6.9-6.10)
    textApi: 'game', // 'game' | 'general'
    notSupportedCode: 750031, // mediaCheckSync: game not configured for this AppID (6.1) -> imageMode becomes 'async'
    mockSyncDelayMs: 800,
    devImageDailyBudget: 200,
    pendingTimeoutMs: 35 * MIN, // 6.3 step 7
    callRetryAfterMs: [5 * MIN, 10 * MIN], // 6.3 step 8: retry k at submittedAt + this[k-1]
    maxCallErrors: 3, // initial attempt + 2 retries
    maxRechecks: 1,
    mockMediaDelaySec: 60,
    devTextDailyBudget: 80, // of the ~100 pre-publish msgSecCheck calls (6.6)
    quota: { imageDaily: 200000, alertAt: 0.7, createPauseAt: 0.95, failAt: 1 },
    breaker: { windowMs: 5 * MIN, minCalls: 20, failRate: 0.5, pauseMs: 15 * MIN },
  },

  strikes: {
    windowMs: 30 * DAY,
    /** strikes in the window -> consequence (7.3) */
    ladder: [
      { at: 1, warn: true, restrictMs: 0, flag: false },
      { at: 2, warn: false, restrictMs: 24 * HOUR, flag: false },
      { at: 3, warn: false, restrictMs: 7 * DAY, flag: false },
      { at: 4, warn: false, restrictMs: 30 * DAY, flag: true },
    ],
  },

  reports: { reasons: ['porn', 'politics', 'abuse', 'ad', 'other'], staleAlertMs: 48 * HOUR },

  retention: { days: 180, abandonedDays: 1 },

  /** reveal notices are held between these Beijing hours (7.6, AC 78) */
  quietHours: { fromHour: 22, toHour: 8 },

  roll: { size: 3, window: 300, rerollsPerPick: 5 }, // 4.1: 3 prompts from 3 categories, never among the last 300 shown; up to 5 换一批 per pick (TD-151)

  stats: { streakMin: 2 },

  cache: { appConfigHomeMs: 60e3, appConfigGateMs: 10e3 },

  ads: {
    interstitial: { enabled: true, minLifetimeReveals: 3, minGapSec: 180, maxPerDay: 3, clampMinGapSec: 180, clampMaxPerDay: 3 },
    banner: { enabled: false },
    rewardedStartsPerDay: 2,
    paletteUnlocksPerDay: 1,
  },

  groupList: { revealedMax: 20, albumPage: 20 },
  reactions: { perStepPerPlayer: 1 },
};

function clampInt(v, lo, hi, dflt) {
  return Number.isInteger(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
}

/** A deep copy of the defaults, so callers (tests, remote config) can mutate their own. */
function getConfig() {
  return JSON.parse(JSON.stringify(CONFIG));
}

/**
 * Merge the remote `app_config` document (spec 13.1) over the defaults with clamping.
 * Unknown or malformed fields are ignored. Returns {config, ugc, subscribe, features}.
 */
function applyRemote(remote) {
  const cfg = getConfig();
  const r = remote && typeof remote === 'object' ? remote : {};
  if (r.timers && typeof r.timers === 'object') {
    cfg.timers.drawSec = clampInt(r.timers.drawSec, 15, 180, cfg.timers.drawSec);
    cfg.timers.describeSec = clampInt(r.timers.describeSec, 15, 180, cfg.timers.describeSec);
  }
  const ia = r.ads && r.ads.interstitial;
  if (ia && typeof ia === 'object') {
    const c = cfg.ads.interstitial;
    if (typeof ia.enabled === 'boolean') c.enabled = ia.enabled;
    c.minLifetimeReveals = clampInt(ia.minLifetimeReveals, 0, 50, c.minLifetimeReveals);
    c.minGapSec = clampInt(ia.minGapSec, c.clampMinGapSec, 3600, c.minGapSec);
    c.maxPerDay = clampInt(ia.maxPerDay, 0, c.clampMaxPerDay, c.maxPerDay);
  }
  const ban = r.ads && r.ads.banner;
  const banner = { enabled: false, adUnitId: null };
  if (ban && typeof ban === 'object') {
    banner.enabled = ban.enabled === true;
    banner.adUnitId = typeof ban.adUnitId === 'string' && ban.adUnitId ? ban.adUnitId : null;
  }
  const ugcIn = r.ugc && typeof r.ugc === 'object' ? r.ugc : {};
  const ugc = {
    createEnabled: ugcIn.createEnabled !== false, // missing -> enabled (17.31)
    viewEnabled: ugcIn.viewEnabled !== false,
    autoPausedUntil: Number.isFinite(ugcIn.autoPausedUntil) ? ugcIn.autoPausedUntil : 0,
  };
  const sub = r.subscribe && typeof r.subscribe.tmplId === 'string' && r.subscribe.tmplId ? { tmplId: r.subscribe.tmplId } : null;
  if (r.room && typeof r.room === 'object') {
    const c = cfg.room;
    const x = r.room;
    c.minPlayers = clampInt(x.minPlayers, 3, 10, c.minPlayers);
    c.maxPlayers = clampInt(x.maxPlayers, Math.max(3, c.minPlayers), 10, c.maxPlayers);
    c.maxRounds = clampInt(x.maxRounds, 2, 6, c.maxRounds);
    c.promptSec = clampInt(x.promptSec, 10, 120, c.promptSec);
    c.drawSec = clampInt(x.drawSec, 15, 180, c.drawSec);
    c.describeSec = clampInt(x.describeSec, 15, 180, c.describeSec);
    c.graceSec = clampInt(x.graceSec, 0, 15, c.graceSec);
    c.lobbyIdleMin = clampInt(x.lobbyIdleMin, 1, 240, c.lobbyIdleMin);
    c.gameMaxMin = clampInt(x.gameMaxMin, 5, 120, c.gameMaxMin);
  }
  if (r.rt && typeof r.rt === 'object') {
    if (typeof r.rt.watch === 'boolean') cfg.rt.watch = r.rt.watch;
    cfg.rt.pollSec = clampInt(r.rt.pollSec, 1, 10, cfg.rt.pollSec);
    cfg.rt.safetyPollSec = clampInt(r.rt.safetyPollSec, 5, 60, cfg.rt.safetyPollSec);
  }
  const m = r.moderation && typeof r.moderation === 'object' ? r.moderation : {};
  cfg.moderation.imageMode = m.imageMode === 'async' ? 'async' : 'sync'; // anything else -> the default 'sync' (6.9)
  cfg.moderation.textApi = m.textApi === 'general' ? 'general' : 'game';
  const f = r.features && typeof r.features === 'object' ? r.features : {};
  const features = {
    updatableCard: f.updatableCard === true, // default off until the device pass (V7)
    // live rooms are the default, and `imageMode: 'async'` forces them off (6.9 item 6, AC 154)
    liveRooms: f.liveRooms !== false && cfg.moderation.imageMode === 'sync',
  };
  return { config: cfg, ugc, subscribe: sub, banner, features };
}

/** Is creation (new chains, claims, submissions) allowed right now? (6.8). Viewing is `ugc.viewEnabled`. */
function ugcCreateAllowed(ugc, nowMs) {
  const u = ugc || {};
  if (u.createEnabled === false) return { ok: false, source: 'switch' };
  if (Number.isFinite(u.autoPausedUntil) && u.autoPausedUntil > nowMs) return { ok: false, source: 'breaker' };
  return { ok: true, source: null };
}

module.exports = { CONFIG, getConfig, applyRemote, ugcCreateAllowed, MIN, HOUR, DAY };
