'use strict';
// The ONLY place that touches the shared game core (copied into ./core by sync-core.js).
// Real core contract: apps/dianjiangtai/game/core/README.md.
const dateMod = require('../core/date');
const content = require('../core/content');
const config = require('../core/config');
const sheet = require('../core/sheet');
const validate = require('../core/validate');
const sim = require('../core/sim');
const search = require('../core/search');
const gates = require('../core/gates');
const draft = require('../core/draft');
const { fail, SLOTS, utcMidnight } = require('./util');

/** Beijing date key for a ms timestamp (core date.js; explicit UTC+8 arithmetic). */
function dateKeyAt(ms) {
  return dateMod.beijingDateKey(ms);
}

/** Live versions: content.js LATEST_CONTENT_VERSION, config.js LATEST_CONFIG_VERSION, getConfig(v).gateVersion. */
function currentVersions() {
  const configVersion = config.LATEST_CONFIG_VERSION;
  return {
    contentVersion: content.LATEST_CONTENT_VERSION,
    configVersion,
    gateVersion: config.getConfig(configVersion).gateVersion,
  };
}

/** versioned config; null for an unknown version */
function getConfig(version) {
  return config.getConfig(version) || null;
}
/** low-bank warning threshold (days of seeds), single source: core config daily.bankLowWarn */
function bankLowWarn() {
  const c = getConfig(currentVersions().configVersion) || {};
  return (c.daily && c.daily.bankLowWarn) || 10;
}
function boardListCap() {
  const c = getConfig(currentVersions().configVersion) || {};
  return Number.isInteger(c.boardListCap) && c.boardListCap > 0 ? c.boardListCap : 3000;
}

/** Roster array for a content version; unknown version (core returns null) -> INVALID_ACTIONS. */
function roster(contentVersion) {
  const c = content.getContent(contentVersion);
  if (!c || !Array.isArray(c.generals) || c.generals.length === 0) fail('INVALID_ACTIONS', 'unknown contentVersion');
  return c.generals;
}

function buildSheet(seed, contentVersion, configVersion) {
  const r = sheet.buildSheet(seed, contentVersion, configVersion);
  if (!r) fail('INVALID_ACTIONS', 'unknown contentVersion');
  return r;
}
function primaryTokens(rounds) {
  return rounds.map((r) => ({ faction: r.faction, era: r.era }));
}

/** Replay actions. Never throws: returns {ok:false, error:'<reason>[@index]'}. */
function replay(seed, contentVersion, actions, mode, configVersion) {
  try {
    const r = validate.replay(seed, contentVersion, actions, mode, configVersion);
    if (!r) return { ok: false, error: 'replay returned nothing' };
    if (r.ok === false) return { ok: false, error: [r.reason || r.error, r.index].filter((x) => x !== undefined).join('@') };
    return r;
  } catch (e) {
    return { ok: false, error: 'replay threw: ' + String(e && e.message).slice(0, 80) };
  }
}
function simulate(lineup, seed, contentVersion, configVersion) {
  return sim.simulate(lineup, seed, contentVersion, configVersion);
}
/** null when five distinct generals cannot be drafted */
function bestLineup(seed, contentVersion, finalTokens) {
  return search.bestLineup(seed, contentVersion, finalTokens);
}
/** -> {accepted, gates, best?, rounds?} */
function acceptDailySeed(seed) {
  return gates.acceptDailySeed(seed);
}


/**
 * Partial replay for progressive delivery (getRound): the actions must end exactly after the pick of some
 * round n (1..4), valid under the same rules as a full replay. Uses the shared draft state machine, so the
 * pool cap, multi-appearance and the drafted-person rule of whichever content version applies are honoured.
 * -> {ok:true, picks:n} | {ok:false, error}. Never throws.
 */
function replayPartial(seed, contentVersion, actions, mode, rounds, configVersion) {
  try {
    if (!content.getContent(contentVersion)) return { ok: false, error: 'UNKNOWN_CONTENT_VERSION' };
    const run = draft.createRun({ seed, contentVersion, mode, rounds, configVersion });
    if (!run) return { ok: false, error: 'UNKNOWN_MODE' };
    for (let i = 0; i < actions.length; i++) {
      const r = draft.apply(run, actions[i]);
      if (!r.ok) return { ok: false, error: `${r.reason}@${i}` };
    }
    const n = run.picks.length;
    if (n < 1 || n > 4) return { ok: false, error: 'WRONG_PICK_COUNT' };
    if (run.phase !== 'placed' || run.round !== n) return { ok: false, error: 'NOT_AT_PICK' };
    return { ok: true, picks: n };
  } catch (e) {
    return { ok: false, error: 'replay threw: ' + String(e && e.message).slice(0, 80) };
  }
}

/** 'shiren' on the configured weekday (core config.shiren.weekday, default Sunday) of the Beijing date key, else 'standard'. */
function variantFor(dateKey) {
  const c = getConfig(currentVersions().configVersion) || {};
  const wd = c.shiren && Number.isInteger(c.shiren.weekday) ? c.shiren.weekday : 0;
  return new Date(utcMidnight(dateKey)).getUTCDay() === wd ? 'shiren' : 'standard';
}
/** observe-only anomaly threshold: ranked daily submitted faster than this after its start (ms) */
function anomalyMinMs() {
  const c = getConfig(currentVersions().configVersion) || {};
  return c.anomaly && c.anomaly.minDailyMs > 0 ? c.anomaly.minDailyMs : 8000;
}
/** interstitial defaults in the spec's remote-config names (core names: everyNthRun, minGapMs) */
function interstitialDefaults() {
  const c = getConfig(currentVersions().configVersion) || {};
  const i = (c.ads && c.ads.interstitial) || {};
  return {
    enabled: i.enabled !== false,
    everyNRuns: i.everyNRuns || i.everyNthRun || 3,
    minLifetimeRuns: i.minLifetimeRuns || 4,
    minGapSec: i.minGapSec || (i.minGapMs ? Math.round(i.minGapMs / 1000) : 120),
    maxPerDay: Number.isInteger(i.maxPerDay) ? i.maxPerDay : 5,
  };
}
/** {key,label} of the band for a win count under a config version */
function bandOf(configVersion, wins) {
  try {
    const b = config.bandFor(config.getConfig(configVersion), wins);
    return b ? { key: b.key, label: b.label } : null;
  } catch (e) {
    return null;
  }
}

/** lineup (any order, [{slot, generalId}]) -> normalised slot order, or null if malformed */
function normaliseLineup(lineup) {
  if (!Array.isArray(lineup) || lineup.length !== 5) return null;
  const out = [];
  const seen = new Set();
  for (const slot of SLOTS) {
    const e = lineup.find((l) => l && l.slot === slot);
    if (!e || typeof e.generalId !== 'string' || seen.has(e.generalId)) return null;
    seen.add(e.generalId);
    out.push({ slot, generalId: e.generalId });
  }
  return out;
}
function lineupToIdx(lineup, contentVersion) {
  const gens = roster(contentVersion);
  return lineup.map((l) => gens.findIndex((g) => g.id === l.generalId));
}

/** Final tokens per round after re-spins: replay().finalTokens (alias tokens); sheet-derived fallback. */
function finalTokens(rounds, actions, replayResult) {
  const ft = replayResult && (replayResult.finalTokens || replayResult.tokens);
  if (Array.isArray(ft) && ft.length === 5) return ft.map((t) => ({ faction: t.faction, era: t.era }));
  return rounds.map((r, i) => {
    let faction = r.faction;
    let era = r.era;
    let kf = 0;
    let ke = 0;
    for (const a of actions) {
      if (a.round !== i + 1) continue;
      if (a.type === 'respinFaction') { if (r.altFaction && r.altFaction[kf] != null) faction = r.altFaction[kf]; kf++; }
      if (a.type === 'respinEra') { if (r.altEra && r.altEra[ke] != null) era = r.altEra[ke]; ke++; }
    }
    return { faction, era };
  });
}

module.exports = {
  dateKeyAt, currentVersions, getConfig, boardListCap, bankLowWarn, roster,
  buildSheet, primaryTokens, replay, simulate, bestLineup, acceptDailySeed,
  normaliseLineup, lineupToIdx, finalTokens,
  replayPartial, variantFor, anomalyMinMs, interstitialDefaults, bandOf,
};
