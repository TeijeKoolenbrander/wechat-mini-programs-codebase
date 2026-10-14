'use strict';
// The ONLY place that touches the shared game core (copied into ./core by sync-core.js).
// Assumptions about shapes the core spec did not pin down are isolated here.
const rng = require('../core/rng');
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

/** ASSUMPTION: config.js exports CONTENT_VERSION / CONFIG_VERSION / GATE_VERSION (current live versions). */
function currentVersions() {
  return {
    contentVersion: config.CONTENT_VERSION != null ? config.CONTENT_VERSION : 1,
    configVersion: config.CONFIG_VERSION != null ? config.CONFIG_VERSION : 1,
    gateVersion: config.GATE_VERSION != null ? config.GATE_VERSION : 1,
  };
}

/** ASSUMPTION: config.getConfig(version) returns the versioned config object (or config itself is it). */
function getConfig(version) {
  const c = typeof config.getConfig === 'function' ? config.getConfig(version) : config;
  return c || {};
}
function boardListCap() {
  const c = getConfig(currentVersions().configVersion);
  return Number.isInteger(c.boardListCap) && c.boardListCap > 0 ? c.boardListCap : 3000;
}

/** Roster array for a content version, or throws INVALID_ACTIONS (unknown contentVersion).
 *  ASSUMPTION: getContent(v) returns {generals:[...]} (or the array itself); unknown version throws or returns null. */
function roster(contentVersion) {
  let c = null;
  try { c = content.getContent(contentVersion); } catch (e) { c = null; }
  const gens = c && (Array.isArray(c) ? c : c.generals);
  if (!Array.isArray(gens) || gens.length === 0) fail('INVALID_ACTIONS', 'unknown contentVersion');
  return gens;
}
function generalIndex(contentVersion, generalId) {
  const idx = roster(contentVersion).findIndex((g) => g.id === generalId);
  return idx;
}

function buildSheet(seed, contentVersion) {
  return sheet.buildSheet(seed, contentVersion);
}
function primaryTokens(rounds) {
  return rounds.map((r) => ({ faction: r.faction, era: r.era }));
}

/** Replay actions. Never throws: returns {ok:false,error}. */
function replay(seed, contentVersion, actions, mode) {
  try {
    const r = validate.replay(seed, contentVersion, actions, mode);
    return r || { ok: false, error: 'replay returned nothing' };
  } catch (e) {
    return { ok: false, error: 'replay threw: ' + String(e && e.message).slice(0, 80) };
  }
}
function simulate(lineup, seed, contentVersion, configVersion) {
  return sim.simulate(lineup, seed, contentVersion, configVersion);
}
function bestLineup(seed, contentVersion, finalTokens) {
  return search.bestLineup(seed, contentVersion, finalTokens);
}
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

/**
 * Final tokens per round after re-spins: [{faction, era}] x5.
 * Uses replay().tokens when the core provides it; else derives from the sheet + actions
 * (re-spin k of a dimension reads alt[k], spec §4). Auto-reflip on empty pool is core-internal.
 */
function finalTokens(rounds, actions, replayResult) {
  if (replayResult && Array.isArray(replayResult.tokens) && replayResult.tokens.length === 5) {
    return replayResult.tokens.map((t) => ({ faction: t.faction, era: t.era }));
  }
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
  hash32: rng.hash32, dateKeyAt, currentVersions, getConfig, boardListCap, roster, generalIndex,
  buildSheet, primaryTokens, replay, simulate, bestLineup, acceptDailySeed,
  normaliseLineup, lineupToIdx, finalTokens,
};
