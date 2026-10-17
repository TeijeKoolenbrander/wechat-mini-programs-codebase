'use strict';
/**
 * Typed-clue state rules at document level (spec 6.12, 11.1, 11.2, 11.6-11.8, D-2). Pure JS over plain documents: no
 * database, no clock (callers pass `nowMs`), no WeChat. The cloud functions read documents, call these and write inside
 * their transaction; the mock server calls the very same functions, so client mock, server and tests share one rule set.
 *
 * What may leave the server about a typed clue:
 *   - `clueText` of a TEXT clue only while it passed, is not hidden (report / admin / deleted) and viewEnabled is true;
 *   - never the reporter, the host openid, `clueMod` (trace id), or any moderation field (AC 49);
 *   - a legacy 'chat' round reads as mode 'chat', text null, hidden false.
 */

const { CONFIG } = require('./config');
const { checkClue, normalizeClue } = require('./clue');
const ST = require('./strikes');

// ---- remote switches ------------------------------------------------------------------------------------------------

/** app_config/live -> {createEnabled, viewEnabled, textApi}. Missing or malformed = everything on, game API. */
function flags(appConfig) {
  const c = appConfig && typeof appConfig === 'object' ? appConfig : {};
  const u = c.ugc && typeof c.ugc === 'object' ? c.ugc : {};
  const m = c.moderation && typeof c.moderation === 'object' ? c.moderation : {};
  return { createEnabled: u.createEnabled !== false, viewEnabled: u.viewEnabled !== false, textApi: m.textApi === 'general' ? 'general' : 'game' };
}

// ---- player_stats (UGC half) --------------------------------------------------------------------------------------

/** A fresh player_stats document (streak fields zeroed, so streak code and getArchive read it like any other). */
function newPlayerStats(openid, nowMs) {
  return { _id: openid, curStreak: 0, bestStreak: 0, lastCompleteDate: null, totalDays: 0, updatedAt: nowMs };
}

/** The viewer's UGC state: rulesAgreed, rulesVersion, restriction {level, until, permanent}|null, warnPending. */
function playerView(ps, nowMs) {
  const p = ps || {};
  const v = Number.isInteger(p.rulesVersion) ? p.rulesVersion : null;
  return { rulesVersion: v, rulesAgreed: v !== null && v >= CONFIG.ugc.rulesVersion, restriction: ST.restrictionOf(p, nowMs), warnPending: p.warnPending === true };
}

/** agreeRules: the new document (idempotent: an agreement at this version is kept as it is). */
function agreeRules(ps, openid, nowMs) {
  const base = ps || newPlayerStats(openid, nowMs);
  if (Number.isInteger(base.rulesVersion) && base.rulesVersion >= CONFIG.ugc.rulesVersion) return { player: base, changed: false };
  return { player: { ...base, rulesVersion: CONFIG.ugc.rulesVersion, rulesAt: nowMs, updatedAt: nowMs }, changed: true };
}

/** Probing guard (spec 11.2): one more WeChat check today? Returns {ok, clueChecks} (the value to store) or {ok:false}. */
function takeCheck(ps, dateKey) {
  const cur = ps && ps.clueChecks && ps.clueChecks.dateKey === dateKey ? ps.clueChecks.n : 0;
  if (cur >= CONFIG.limits.clueChecksPerDay) return { ok: false };
  return { ok: true, clueChecks: { dateKey, n: cur + 1 } };
}

// ---- reading a clue ------------------------------------------------------------------------------------------------------

/** 'shown' | 'hidden' (reported / admin-hidden / deleted) | 'paused' (kill switch viewEnabled false). Only TEXT clues can be hidden or paused. */
function clueState(round, fl) {
  if (round.clueMode !== 'text') return 'shown';
  if (round.clueHidden === true) return 'hidden';
  if (!fl.viewEnabled) return 'paused';
  return 'shown';
}

/**
 * The clue as a viewer may see it: {mode: 'text'|'preset'|'chat'|null, text, hidden, state}. `hidden` is true for both
 * 'hidden' and 'paused'; `state` tells them apart. Text is null unless it may be shown.
 */
function clueView(round, fl) {
  const mode = round.clueMode || null;
  const state = clueState(round, fl);
  let text = null;
  if (mode === 'preset' || mode === 'text') text = state === 'shown' && typeof round.clueText === 'string' ? round.clueText : null;
  return { mode, text, hidden: state !== 'shown', state };
}

/** The curated preset text only: what group boards, share cards and notices may carry (PD-37). A typed clue is never public text. */
function publicClueText(round) {
  return round.clueMode === 'preset' && typeof round.clueText === 'string' ? round.clueText : null;
}

/** Can this viewer report the clue? Typed, shown, not the host, not reported by them before, round not a draft. */
function canReport(round, viewerOpenid, fl, hasReport) {
  return round.clueMode === 'text' && round.status !== 'draft' && round.hostOpenid !== viewerOpenid && clueState(round, fl) === 'shown' && !hasReport;
}

// ---- setClue (text) -------------------------------------------------------------------------------------------------------

/**
 * Everything setClue checks BEFORE a WeChat call, in the spec order (11.2): host -> state -> hidden -> identical text ->
 * UGC_PAUSED -> RULES_REQUIRED -> RESTRICTED -> local rules (TEXT_REJECTED). The labels are the round's STORED ones.
 * @param {{round:object|null, isHost:boolean, rawText:string, fl:object, player:object|null, nowMs:number}} o
 * @returns {{ok:false, code:string, reason?:string, until?:number, permanent?:boolean}|{ok:true, same:true}|{ok:true, same:false, text:string}}
 */
function textGate(o) {
  const round = o.round;
  if (!round || round.status === 'discarded') return { ok: false, code: 'ROUND_NOT_FOUND' };
  if (!o.isHost) return { ok: false, code: 'NOT_HOST' };
  if (round.status === 'revealed' || round.status === 'noGuesses' || round.guessCount > 0) return { ok: false, code: 'ROUND_EXPIRED' };
  if (round.clueHidden === true) return { ok: false, code: 'INVALID_INPUT' }; // a hidden clue cannot be replaced
  const text = normalizeClue(o.rawText);
  if (text && round.clueMode === 'text' && round.clueText === text && round.status === 'open') return { ok: true, same: true };
  if (!o.fl.createEnabled) return { ok: false, code: 'UGC_PAUSED' };
  const pv = playerView(o.player, o.nowMs);
  if (!pv.rulesAgreed) return { ok: false, code: 'RULES_REQUIRED' };
  if (pv.restriction) return { ok: false, code: 'RESTRICTED', until: pv.restriction.until, permanent: pv.restriction.permanent };
  const c = checkClue(o.rawText, { leftLabel: round.left, rightLabel: round.right });
  if (!c.ok) return { ok: false, code: 'TEXT_REJECTED', reason: c.reason };
  return { ok: true, same: false, text: c.text };
}

/** The round after a passed typed clue: the clue replaces any earlier one, the round opens. */
function applyTextClue(round, text, mod, nowMs) {
  return {
    ...round,
    status: 'open',
    clueMode: 'text',
    clueItemId: null,
    clueText: text,
    clueMod: { api: mod.api, suggest: mod.suggest, label: mod.label === undefined ? null : mod.label, traceId: mod.traceId || null, ts: nowMs },
  };
}

// ---- reports and takedowns ---------------------------------------------------------------------------------------------

/**
 * reportClue gate (spec 11.2): ROUND_NOT_FOUND -> OWN_ROUND -> INVALID_INPUT (not a shown typed clue) -> ok.
 * A clue already hidden by another player's report is still reportable (`alreadyHidden`: the report row is stored, the
 * answer is ok); one hidden by admin, deleted, or paused is not.
 * @returns {{ok:false, code:string}|{ok:true, alreadyHidden:boolean}}
 */
function reportGate(round, viewerOpenid, fl) {
  if (!round || round.status === 'discarded' || (round.status === 'draft' && round.hostOpenid !== viewerOpenid)) return { ok: false, code: 'ROUND_NOT_FOUND' };
  if (round.hostOpenid === viewerOpenid) return { ok: false, code: 'OWN_ROUND' };
  if (round.status === 'draft' || round.clueMode !== 'text' || typeof round.clueText !== 'string') return { ok: false, code: 'INVALID_INPUT' };
  if (round.clueHidden === true) return round.clueHiddenBy === 'report' ? { ok: true, alreadyHidden: true } : { ok: false, code: 'INVALID_INPUT' };
  if (!fl.viewEnabled) return { ok: false, code: 'INVALID_INPUT' };
  return { ok: true, alreadyHidden: false };
}

/** A report hides the clue for everyone at once. */
function hideClue(round, by, nowMs) {
  return { ...round, clueHidden: true, clueHiddenAt: nowMs, clueHiddenBy: by };
}
/** Show a hidden clue again (admin restoreClue / dismissReport {restore}). A deleted clue (no text) cannot come back. */
function restoreClue(round) {
  if (typeof round.clueText !== 'string') return { ok: false, round };
  const next = { ...round, clueHidden: false };
  delete next.clueHiddenAt;
  delete next.clueHiddenBy;
  return { ok: true, round: next };
}
/** Admin deleteClue: the text leaves the round (the mod_log evidence stays), the round shows the hidden placeholder. */
function deleteClue(round, nowMs) {
  return { ...round, clueText: null, clueHidden: true, clueHiddenAt: nowMs, clueHiddenBy: 'admin' };
}

module.exports = {
  flags, newPlayerStats, playerView, agreeRules, takeCheck, clueState, clueView, publicClueText, canReport,
  textGate, applyTextClue, reportGate, hideClue, restoreClue, deleteClue,
};
