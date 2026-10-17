'use strict';
/**
 * Moderation decisions (spec 6, PO-13/14/15, AC 37-56) as pure functions. The cloud functions' SDK calls
 * (msgSecCheck, mediaCheckAsync, the push) are thin wrappers around these, so every rule is testable offline and the
 * mock server runs exactly the same decisions.
 *
 * Fail closed: anything unexpected means "not visible".
 */

const { CONFIG } = require('./config');
const strokes = require('./strokes');

const M = CONFIG.moderation;

// ---- verdicts ----------------------------------------------------------------------------------------------

/**
 * The platform's `suggest` -> what we do (PO-13): pass = visible; review = blocked WITHOUT a strike (we have no staff
 * to hold it for a human); risky = blocked WITH a strike. Anything else is not a verdict (null): treat as an error.
 * @returns {{outcome:'passed'|'blocked', strike:boolean} | null}
 */
function verdictOf(suggest) {
  if (suggest === 'pass') return { outcome: 'passed', strike: false };
  if (suggest === 'review') return { outcome: 'blocked', strike: false };
  if (suggest === 'risky') return { outcome: 'blocked', strike: true };
  return null;
}

/**
 * What to do with a pushed image verdict (AC 44, 45, 48). `stepState` is the stored step's state (null/undefined for an
 * unknown trace).
 *  - pending step: apply the outcome (+ strike for risky)
 *  - any other state (already passed/blocked/void/hidden/deleted, duplicate push, or voided by timeout): ignore, except a
 *    late `risky` still adds a strike and changes no visibility (edge 7)
 *  - unknown step / unrecognised suggest: ignore
 * @returns {{action:'apply'|'ignore', outcome?:string, strike:boolean, reason?:string}}
 */
function planVerdict(stepState, suggest) {
  const v = verdictOf(suggest);
  if (!stepState) return { action: 'ignore', strike: false, reason: 'unknown' };
  if (!v) return { action: 'ignore', strike: false, reason: 'badSuggest' };
  if (stepState === 'pending') return { action: 'apply', outcome: v.outcome, strike: v.strike };
  const lateStrike = suggest === 'risky' && stepState === 'void';
  return { action: 'ignore', strike: lateStrike, reason: stepState === 'void' ? 'late' : 'duplicate' };
}

// ---- pending drawings (modSweeper) -------------------------------------------------------------------------------

/**
 * Sweeper plan for a `pending` drawing (6.3 steps 7, 8; AC 46, 47). `mod` is the step's moderation block:
 *   { submittedAt, traceIds: [], lastCheckAt: ms|null, rechecks: n, callErrors: n }
 * `lastCheckAt` = when the last mediaCheckAsync CALL succeeded (null if every call so far failed).
 *  - no successful call yet: retry at submittedAt + 5 min, then + 10 min (callErrors 1, 2); after 3 failures -> void('error')
 *  - a check is out: 35 min without a verdict -> one re-check; 35 min after that -> void('timeout')
 * @returns {{action:'wait'|'retryCall'|'recheck'|'void', reason?:string}}
 */
function planPendingImage(mod, now) {
  if (!mod.lastCheckAt) {
    if (mod.callErrors >= M.maxCallErrors) return { action: 'void', reason: 'error' };
    const due = mod.submittedAt + M.callRetryAfterMs[Math.max(0, mod.callErrors - 1)];
    return now >= due ? { action: 'retryCall' } : { action: 'wait' };
  }
  if (now - mod.lastCheckAt < M.pendingTimeoutMs) return { action: 'wait' };
  if ((mod.rechecks || 0) < M.maxRechecks) return { action: 'recheck' };
  return { action: 'void', reason: 'timeout' };
}

// ---- environment gate (6.6, AC 51, 52) ------------------------------------------------------------------------------

/**
 * Resolve ENV_KIND / MODERATION_MODE. Production (and anything unrecognised: fail closed) forces `live`; a mock mode in
 * production is a configuration error that makes every UGC function return SERVER_CONFIG and log [ALERT].
 * @param {{envKind?:string, mode?:string}} env raw env var values
 * @returns {{ok:true, envKind:'prod'|'dev', mode:'live'|'mock'} | {ok:false, code:'SERVER_CONFIG', alert:string}}
 */
function resolveEnv(env) {
  const raw = env || {};
  const envKind = raw.envKind === 'dev' ? 'dev' : 'prod'; // unset or unknown -> prod (safe)
  const mode = raw.mode === undefined || raw.mode === '' ? 'live' : raw.mode;
  if (mode !== 'live' && mode !== 'mock') return { ok: false, code: 'SERVER_CONFIG', alert: '[ALERT] unknown MODERATION_MODE' };
  if (envKind === 'prod' && mode === 'mock') return { ok: false, code: 'SERVER_CONFIG', alert: '[ALERT] MODERATION_MODE=mock in production' };
  return { ok: true, envKind, mode };
}

/** dev + live only: msgSecCheck calls are capped per day to protect the ~100/day pre-publish quota (AC 52) */
function textBudgetAllows(env, usedToday, budget) {
  if (env.envKind !== 'dev' || env.mode !== 'live') return true;
  return usedToday < (budget === undefined ? M.devTextDailyBudget : budget);
}

// ---- mock verdicts (dev only, 6.6) ------------------------------------------------------------------------------

/**
 * Mock text moderation: `测试违规` -> risky, `测试复审` -> review, `测试繁忙` -> error (MODERATION_BUSY), otherwise pass.
 * @returns {{suggest:string}|{error:true}}
 */
function mockText(text) {
  if (text.includes('测试繁忙')) return { error: true };
  if (text.includes('测试违规')) return { suggest: 'risky' };
  if (text.includes('测试复审')) return { suggest: 'review' };
  return { suggest: 'pass' };
}

/**
 * Mock image moderation by stroke count: exactly 13 strokes -> risky, 14 -> review, 15 -> no verdict ever (exercises
 * timeout, re-check and void), anything else -> pass. Verdicts are delivered MOCK_MEDIA_DELAY_SEC after submission
 * through the same onMediaCheck code path as real pushes.
 * @returns {{suggest:string}|null} null = never delivered
 */
function mockImage(drawing) {
  const n = drawing.s.length;
  if (n === 13) return { suggest: 'risky' };
  if (n === 14) return { suggest: 'review' };
  if (n === 15) return null;
  return { suggest: 'pass' };
}

// ---- quota and breaker (6.7, 6.8) -------------------------------------------------------------------------------

/**
 * Image quota level from today's count (AC 56): 'ok' < 70% <= 'alert' < 95% <= 'pauseCreate' < 100% <= 'failClosed'.
 * alert -> [ALERT] log (founder asks WeChat for a raise); pauseCreate -> createChain returns UGC_BUSY, existing chains
 * continue; failClosed -> drawing submissions return MODERATION_BUSY.
 */
function quotaLevel(imageCount, limit) {
  const q = M.quota;
  const lim = limit || q.imageDaily;
  const r = imageCount / lim;
  if (r >= q.failAt) return 'failClosed';
  if (r >= q.createPauseAt) return 'pauseCreate';
  if (r >= q.alertAt) return 'alert';
  return 'ok';
}

/**
 * Circuit breaker (AC 55): >= 50% failures over >= 20 calls in the 5-minute window -> pause creation for 15 minutes.
 * @param {{total:number, failed:number}} win calls and failures in the last 5 minutes
 */
function breakerDecision(win, now) {
  const B = M.breaker;
  if (win.total >= B.minCalls && win.failed / win.total >= B.failRate) return { trip: true, pausedUntil: now + B.pauseMs };
  return { trip: false, pausedUntil: 0 };
}

// ---- the image the moderation service sees ------------------------------------------------------------------------

/** Cloud storage path of the moderation PNG (13.3). `now` only supplies YYYYMM (Beijing). */
function modPngPath(chainId, n, attempt, now) {
  const d = new Date(now + 8 * 3600e3);
  const ym = d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0');
  return 'chuanhua/mod/' + ym + '/' + chainId + '/' + n + '_' + attempt + '.png';
}

/** parameters of the real mediaCheckAsync v2 call (AC 42); the caller adds the temp URL and the author's openid */
function mediaCheckParams(mediaUrl, openid) {
  return { media_url: mediaUrl, media_type: 2, version: 2, scene: M.scene, openid };
}

/**
 * Mock SYNC image moderation by stroke count (6.6, dev only): exactly 13 strokes -> risky, 15 -> timeout (MODERATION_BUSY), anything
 * else -> pass (after MOCK_SYNC_DELAY_MS in the cloud functions to simulate latency). 14 is a plain pass here (review exists only
 * in the async fallback).
 * @returns {{suggest:string}|{timeout:true}}
 */
function mockImageSync(drawing) {
  const n = drawing.s.length;
  if (n === 13) return { suggest: 'risky' };
  if (n === 15) return { timeout: true };
  return { suggest: 'pass' };
}

/** parameters of the real mediaCheckSync call (6.1, AC 152): openid, version 2, scene 3, media_type 2, media_url (the checker downloads it) */
function syncImageParams(mediaUrl, openid) {
  return { openid, version: 2, scene: M.scene, media_url: mediaUrl, media_type: 2 };
}

/** parameters of the game msgSecCheck call (6.1, AC 37): openid, version 2, scene 3, content */
function gameTextParams(content, openid) {
  return { openid, version: 2, scene: M.scene, content };
}

/** error 750031 of mediaCheckSync: the game is not configured for this AppID -> imageMode 'async' (6.9 item 6) */
function isNotSupported(errCode) {
  return Number(errCode) === M.notSupportedCode;
}
/** 750032 (per minute) / 750033 (per day): the quota; the call fails closed as MODERATION_BUSY (AC 153) */
function isQuotaCode(errCode) {
  return Number(errCode) === 750032 || Number(errCode) === 750033;
}

/** dev + live only: mediaCheckSync calls are capped per day (AC 52) */
function imageBudgetAllows(env, usedToday, budget) {
  if (env.envKind !== 'dev' || env.mode !== 'live') return true;
  return usedToday < (budget === undefined ? M.devImageDailyBudget : budget);
}

/** the sync image pipeline in use? Anything but an explicit 'async' is 'sync' (fail towards the primary path, 6.9) */
function imageModeOf(cfgModeration) {
  return cfgModeration && cfgModeration.imageMode === 'async' ? 'async' : 'sync';
}

/** parameters of the real msgSecCheck v2 call (AC 37), general API (the textApi 'general' fallback) */
function textCheckParams(content, openid) {
  return { content, version: 2, scene: M.scene, openid };
}

module.exports = {
  verdictOf, planVerdict, planPendingImage, resolveEnv, textBudgetAllows, mockText, mockImage, mockImageSync, syncImageParams, gameTextParams,
  isNotSupported, isQuotaCode, imageBudgetAllows, imageModeOf,
  quotaLevel, breakerDecision, modPngPath, mediaCheckParams, textCheckParams, validateStrokes: strokes.validate,
};
