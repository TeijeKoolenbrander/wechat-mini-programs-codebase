/**
 * Remote feature config (spec 13.1 app_config, via getHome): normalised and clamped. Anything missing or invalid falls back to
 * safe defaults (edge 31): subscribe hidden, banner off, interstitial on the core defaults, UGC enabled, timers 60/45.
 * Interstitial values are clamped again here (the server clamps too) so a config typo can never flood players.
 */

const { CONFIG } = require('../core/config');

function num(v, def, lo, hi) {
  const n = typeof v === 'number' && isFinite(v) ? Math.floor(v) : def;
  return Math.max(lo, Math.min(hi, n));
}

const D = CONFIG.ads.interstitial;
// Hard client limits of the interstitial (spec 11, AC 104): at most 3 a day, at least 180 s apart, whatever the remote config or
// core/config.js clamps say (they allowed 4 / 120 s, QA-R2-10). The client never shows more than this.
const AD_MAX_PER_DAY = 3;
const AD_MIN_GAP_SEC = 180;

/**
 * raw: the getHome response (or null). build: build-config (optional local template id, used when the remote one is absent).
 * Returns { liveRooms, rt, room, subscribe, updatableCard, banner, interstitial, timers, ugc }.
 */
function normalizeFeatures(raw, build) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const f = raw.features && typeof raw.features === 'object' ? raw.features : {};
  const ri = f.interstitial && typeof f.interstitial === 'object' ? f.interstitial : {};
  const interstitial = {
    enabled: ri.enabled === undefined ? D.enabled : ri.enabled === true,
    minLifetimeReveals: num(ri.minLifetimeReveals, D.minLifetimeReveals, 0, 50),
    minGapSec: num(ri.minGapSec, Math.max(D.minGapSec, AD_MIN_GAP_SEC), Math.max(D.clampMinGapSec, AD_MIN_GAP_SEC), 3600),
    maxPerDay: num(ri.maxPerDay, Math.min(D.maxPerDay, AD_MAX_PER_DAY), 0, Math.min(D.clampMaxPerDay, AD_MAX_PER_DAY)),
  };
  const rb = f.banner && typeof f.banner === 'object' ? f.banner : {};
  const banner = { enabled: rb.enabled === true, adUnitId: typeof rb.adUnitId === 'string' && rb.adUnitId ? rb.adUnitId : (build && build.adUnits && build.adUnits.banner) || null };
  let tmplId = f.subscribe && typeof f.subscribe.tmplId === 'string' ? f.subscribe.tmplId : '';
  if (!tmplId && build && typeof build.subscribeTmplId === 'string') tmplId = build.subscribeTmplId;
  const t = raw.timers && typeof raw.timers === 'object' ? raw.timers : {};
  const u = raw.ugc && typeof raw.ugc === 'object' ? raw.ugc : {};
  const rt0 = f.rt && typeof f.rt === 'object' ? f.rt : {};
  const rm = raw.room && typeof raw.room === 'object' ? raw.room : {};
  const R = CONFIG.room;
  return {
    // live rooms are the default mode; the server forces them off when imageMode is async (AC 154)
    liveRooms: f.liveRooms !== false,
    rt: {
      watch: rt0.watch !== false,
      pollSec: num(rt0.pollSec, CONFIG.rt.pollSec, 1, 10),
      safetyPollSec: num(rt0.safetyPollSec, CONFIG.rt.safetyPollSec, 5, 60),
    },
    room: {
      minPlayers: num(rm.minPlayers, R.minPlayers, 3, 10),
      maxPlayers: num(rm.maxPlayers, R.maxPlayers, 3, 10),
      promptSec: num(rm.promptSec, R.promptSec, 10, 120),
      drawSec: num(rm.drawSec, R.drawSec, 15, 180),
      describeSec: num(rm.describeSec, R.describeSec, 15, 180),
      graceSec: num(rm.graceSec, R.graceSec, 0, 15),
    },
    subscribe: tmplId ? { tmplId } : null,
    updatableCard: f.updatableCard === true,
    banner,
    interstitial,
    timers: {
      drawSec: num(t.drawSec, CONFIG.timers.drawSec, 15, 180),
      describeSec: num(t.describeSec, CONFIG.timers.describeSec, 15, 180),
      warnSec: num(t.warnSec, CONFIG.timers.warnSec, 3, 30),
    },
    ugc: { createEnabled: u.createEnabled !== false, viewEnabled: u.viewEnabled !== false },
  };
}

module.exports = { normalizeFeatures };
