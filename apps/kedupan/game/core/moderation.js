'use strict';
/**
 * Moderation decisions for typed clues (spec 11.6, AC 89-90, 94) as pure functions. The cloud functions' SDK calls are
 * thin wrappers around these (common/modio.js), and the mock server runs exactly the same decisions, so every rule is
 * testable offline. Copied from 传画接龙 core/moderation.js (text half) and adapted.
 *
 * FAIL CLOSED: anything unexpected means "not shown": nobody but the author sees a typed clue until WeChat said `pass`.
 */

const { CONFIG } = require('./config');

const M = CONFIG.moderation;

/**
 * The platform's `suggest` -> what we do: pass = shown; review = blocked WITHOUT a strike (general API only; we have no
 * staff to hold it for a human); risky = blocked WITH a strike. Anything else is not a verdict (null): an error.
 * @returns {{outcome:'passed'|'blocked', strike:boolean} | null}
 */
function verdictOf(suggest) {
  if (suggest === 'pass') return { outcome: 'passed', strike: false };
  if (suggest === 'review') return { outcome: 'blocked', strike: false };
  if (suggest === 'risky') return { outcome: 'blocked', strike: true };
  return null;
}

/**
 * Map one API answer to the setClue outcome. `api` is 'game' or 'general'; the game interface knows only pass / risky, so a
 * `review` from it is NOT a verdict (busy, like any unknown value).
 * @returns {{outcome:'pass'}|{outcome:'blocked', strike:boolean}|{outcome:'busy'}}
 */
function planOutcome(api, suggest) {
  const v = verdictOf(suggest);
  if (!v || (api === 'game' && suggest === 'review')) return { outcome: 'busy' };
  if (v.outcome === 'passed') return { outcome: 'pass' };
  return { outcome: 'blocked', strike: v.strike };
}

/**
 * Resolve ENV_KIND / MODERATION_MODE. Production (and anything unrecognised: fail closed) forces `live`; a mock mode in
 * production is a configuration error that makes every typed-clue call return SERVER_CONFIG and log [ALERT].
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

/** dev + live only: WeChat calls are capped per day to protect the pre-publish quota */
function textBudgetAllows(env, usedToday, budget) {
  if (env.envKind !== 'dev' || env.mode !== 'live') return true;
  return usedToday < (budget === undefined ? M.devTextDailyBudget : budget);
}

/**
 * Mock text moderation (dev only): `测试违规` -> risky, `测试复审` -> review (general path), `测试繁忙` -> error
 * (MODERATION_BUSY), anything else -> pass.
 * @returns {{suggest:string}|{error:true}}
 */
function mockText(text) {
  if (text.includes('测试繁忙')) return { error: true };
  if (text.includes('测试违规')) return { suggest: 'risky' };
  if (text.includes('测试复审')) return { suggest: 'review' };
  return { suggest: 'pass' };
}

/** parameters of the game msgSecCheck call (spec 11.6, AC 89): openid, version 2, scene 3, content */
function gameTextParams(content, openid) {
  return { openid, version: 2, scene: M.scene, content };
}

/** parameters of the general msgSecCheck v2 call (the `textApi: 'general'` fallback) */
function textCheckParams(content, openid) {
  return { content, version: 2, scene: M.scene, openid };
}

/** 750032 (per minute) / 750033 (per day): the quota; the call fails closed as MODERATION_BUSY */
function isQuotaCode(errCode) {
  return Number(errCode) === 750032 || Number(errCode) === 750033;
}

/** does a window of text checks call for the busy-rate alert? (sweepRounds) */
function busyAlert(win) {
  const B = CONFIG.ugc.busyAlert;
  return win.total >= B.minCalls && win.busy / win.total >= B.rate;
}

module.exports = { verdictOf, planOutcome, resolveEnv, textBudgetAllows, mockText, gameTextParams, textCheckParams, isQuotaCode, busyAlert };
