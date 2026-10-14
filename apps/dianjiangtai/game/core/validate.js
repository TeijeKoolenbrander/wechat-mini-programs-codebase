/**
 * Server-side replay and rejection rules (spec 14.3, AC 26).
 *
 *   replay(seed, contentVersion, actions, mode) ->
 *     { ok:true, lineup:[{slot, generalId}] (fixed slot order), finalTokens, respinsFree, respinsAd }
 *   | { ok:false, error:'INVALID_ACTIONS', reason, index? }
 *
 * Rejected: a pick outside the round's pool, a duplicate general or slot, a
 * re-spin beyond the mode's allowance (ad re-spins in daily or challenge),
 * a re-spin after a pick, fewer or more than 5 picks, an unknown
 * contentVersion, malformed actions.
 *
 * Reasons: UNKNOWN_CONTENT_VERSION, UNKNOWN_MODE, BAD_ACTIONS, BAD_ACTION,
 * ROUND_MISMATCH, NOT_FLIPPED, ALREADY_FLIPPED, RESPIN_AFTER_PICK,
 * AD_RESPIN_NOT_ALLOWED, AD_BEFORE_FREE, RESPIN_LIMIT, NO_ALT, NOT_IN_POOL,
 * DUPLICATE_GENERAL, DUPLICATE_SLOT, BAD_SLOT, UNDO_INVALID, EXTRA_ACTIONS,
 * WRONG_PICK_COUNT.
 */

const { getContent } = require('./content');
const draft = require('./draft');

const MAX_ACTIONS = 64;

function fail(reason, index) {
  const r = { ok: false, error: 'INVALID_ACTIONS', reason };
  if (index !== undefined) r.index = index;
  return r;
}

function replay(seed, contentVersion, actions, mode, configVersion) {
  if (!getContent(contentVersion)) return fail('UNKNOWN_CONTENT_VERSION');
  if (mode !== 'daily' && mode !== 'free' && mode !== 'challenge') return fail('UNKNOWN_MODE');
  if (!Array.isArray(actions) || actions.length > MAX_ACTIONS) return fail('BAD_ACTIONS');
  const run = draft.createRun({ seed, contentVersion, mode, configVersion });
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    const r = draft.apply(run, a && typeof a === 'object' ? a : null);
    if (!r.ok) return fail(r.reason, i);
  }
  if (!draft.isComplete(run)) return fail('WRONG_PICK_COUNT');
  const finalTokens = run.finalTokens.map((t) => ({ faction: t.faction, era: t.era }));
  return {
    ok: true,
    lineup: draft.lineupOf(run),
    finalTokens,
    tokens: finalTokens, // alias (backend coreapi.js reads `tokens`)
    respinsFree: run.respinsFree,
    respinsAd: run.respinsAd,
  };
}

module.exports = { replay };
