/**
 * Server-side replay and rejection rules (spec 14.3, AC 26), plus the
 * progressive token delivery API for the ranked daily (spec 5.2, AC 86).
 *
 *   replay(seed, contentVersion, actions, mode[, configVersion]) ->
 *     { ok:true, lineup:[{slot, generalId, faction}] (fixed slot order), finalTokens, respinsFree, respinsAd }
 *   | { ok:false, error:'INVALID_ACTIONS', reason, index? }
 *
 *   replayPrefix(seed, contentVersion, actions, mode[, configVersion]) ->
 *     { ok:true, picks:n, round, phase, complete, lineup (partial), finalTokens (partial) } | { ok:false, ... }
 *     validates a PARTIAL run (any prefix of a legal run).
 *
 *   roundToken(seed, contentVersion, n, priorActions[, mode[, configVersion]]) ->
 *     { ok:true, n, round } | { ok:false, error:'INVALID_ACTIONS', reason, index? }
 *     the ONLY way the daily server hands out round n (1..5): priorActions must be a valid
 *     prefix holding exactly n-1 picks that ends right after round n-1's pick (round 1: []).
 *     `round` = { faction, era, altFaction, altEra, fallback, pools? } (the sheet's round n).
 *
 *   extendsPrefix(frozen, actions) -> boolean  (do `actions` start with exactly the frozen actions?)
 *
 * Rejected: a pick outside the round's pool (the capped pool, spec 4), a
 * person drafted twice (from any cells), a duplicate slot, a re-spin beyond
 * the mode's allowance (ad re-spins in daily or challenge), a re-spin after a
 * pick, fewer or more than 5 picks, an unknown contentVersion, malformed
 * actions.
 *
 * Reasons: UNKNOWN_CONTENT_VERSION, UNKNOWN_MODE, BAD_ACTIONS, BAD_ACTION,
 * ROUND_MISMATCH, NOT_FLIPPED, ALREADY_FLIPPED, ALREADY_PICKED, RESPIN_AFTER_PICK,
 * AD_RESPIN_NOT_ALLOWED, AD_BEFORE_FREE, RESPIN_LIMIT, NO_ALT, NO_POOL, NOT_IN_POOL,
 * DUPLICATE_GENERAL, DUPLICATE_SLOT, BAD_SLOT, UNDO_INVALID, EXTRA_ACTIONS,
 * WRONG_PICK_COUNT, BAD_ROUND, NOT_AT_ROUND_END.
 */

const { getContent } = require('./content');
const draft = require('./draft');
const { buildSheet } = require('./sheet');
const { getConfig, defaultConfigVersion } = require('./config');

const MAX_ACTIONS = 64;

function fail(reason, index) {
  const r = { ok: false, error: 'INVALID_ACTIONS', reason };
  if (index !== undefined) r.index = index;
  return r;
}

/** Shared by replay, replayPrefix and roundToken. */
function run(seed, contentVersion, actions, mode, configVersion) {
  if (!getContent(contentVersion)) return fail('UNKNOWN_CONTENT_VERSION');
  if (mode !== 'daily' && mode !== 'free' && mode !== 'challenge') return fail('UNKNOWN_MODE');
  if (!Array.isArray(actions) || actions.length > MAX_ACTIONS) return fail('BAD_ACTIONS');
  const r = draft.createRun({ seed, contentVersion, mode, configVersion });
  if (!r) return fail('UNKNOWN_CONTENT_VERSION');
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    const res = draft.apply(r, a && typeof a === 'object' ? a : null);
    if (!res.ok) return fail(res.reason, i);
  }
  return { ok: true, run: r };
}

function replay(seed, contentVersion, actions, mode, configVersion) {
  const res = run(seed, contentVersion, actions, mode, configVersion);
  if (!res.ok) return res;
  const r = res.run;
  if (!draft.isComplete(r)) return fail('WRONG_PICK_COUNT');
  const finalTokens = r.finalTokens.map((t) => ({ faction: t.faction, era: t.era }));
  return {
    ok: true,
    lineup: draft.lineupOf(r),
    finalTokens,
    tokens: finalTokens, // alias (backend coreapi.js reads `tokens`)
    respinsFree: r.respinsFree,
    respinsAd: r.respinsAd,
  };
}

/** Validate a partial run (spec 14.3 "partial run"). */
function replayPrefix(seed, contentVersion, actions, mode, configVersion) {
  const res = run(seed, contentVersion, actions, mode, configVersion);
  if (!res.ok) return res;
  const r = res.run;
  return {
    ok: true,
    picks: r.picks.length,
    round: r.round,
    phase: r.phase,
    complete: draft.isComplete(r),
    lineup: draft.lineupOf(r),
    finalTokens: r.finalTokens.map((t) => (t ? { faction: t.faction, era: t.era } : null)),
    respinsFree: r.respinsFree,
    respinsAd: r.respinsAd,
  };
}

/**
 * Round n of the sheet, only against a valid prefix with exactly n-1 picks that stands right after
 * round n-1's pick (the client has not flipped round n yet). Idempotent: the same prefix gives the same round.
 */
function roundToken(seed, contentVersion, n, priorActions, mode, configVersion) {
  const content = getContent(contentVersion);
  if (!content) return fail('UNKNOWN_CONTENT_VERSION');
  const config = getConfig(configVersion || defaultConfigVersion(contentVersion));
  if (!Number.isInteger(n) || n < 1 || n > config.rounds) return fail('BAD_ROUND');
  const actions = priorActions || [];
  const res = run(seed, contentVersion, actions, mode || 'daily', configVersion);
  if (!res.ok) return res;
  const r = res.run;
  if (r.picks.length !== n - 1) return fail('WRONG_PICK_COUNT');
  if (n > 1 && (r.phase !== 'placed' || r.round !== n - 1)) return fail('NOT_AT_ROUND_END');
  if (n === 1 && actions.length !== 0) return fail('NOT_AT_ROUND_END');
  return { ok: true, n, round: buildSheet(seed, contentVersion, config.configVersion)[n - 1] };
}

function sameAction(a, b) {
  return !!a && !!b && a.round === b.round && a.type === b.type && (a.generalId || null) === (b.generalId || null) && (a.slot || null) === (b.slot || null) && (a.source || null) === (b.source || null);
}

/** True when `actions` begins with exactly the frozen actions (daily_progress prefix rule, spec 5.2 step 3-4). */
function extendsPrefix(frozen, actions) {
  if (!Array.isArray(frozen) || !Array.isArray(actions) || actions.length < frozen.length) return false;
  for (let i = 0; i < frozen.length; i++) if (!sameAction(frozen[i], actions[i])) return false;
  return true;
}

module.exports = { replay, replayPrefix, roundToken, extendsPrefix };
