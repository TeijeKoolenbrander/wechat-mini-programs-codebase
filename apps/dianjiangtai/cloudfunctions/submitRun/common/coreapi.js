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
const { fail, SLOTS } = require('./util');

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
function replay(seed, contentVersion, actions, mode) {
  try {
    const r = validate.replay(seed, contentVersion, actions, mode);
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
  dateKeyAt, currentVersions, getConfig, boardListCap, roster,
  buildSheet, primaryTokens, replay, simulate, bestLineup, acceptDailySeed,
  normaliseLineup, lineupToIdx, finalTokens,
};
