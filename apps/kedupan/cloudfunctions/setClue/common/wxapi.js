'use strict';
// Thin wrappers around the cloud SDK's content-security calls (spec 11.6). NOTHING else in the code base calls
// cloud.openapi, so the platform parameter names and response shapes [VERIFY E12] are adapted in exactly one place.
// No platform secret is involved (cloud calls need none). Copied from 传画接龙 common/wxapi.js (text half).
const { CONFIG } = require('./coreapi');
const store = require('./store');
const { withTimeout } = require('./util');

const cloud = () => {
  store.db(); // makes sure cloud.init ran
  return store.cloud;
};

/** openapi results carry errCode (0 = ok); a non-zero code is a failure even when the SDK did not throw */
function okResult(res, what) {
  if (!res) throw new Error(what + ': empty response');
  // the cloud SDK answers errCode / errMsg, the HTTPS API errcode / errmsg: read both
  const code = res.errCode !== undefined && res.errCode !== null ? res.errCode : res.errcode;
  if (code !== undefined && code !== null && code !== 0) {
    throw Object.assign(new Error(what + ': errCode ' + code + ' ' + (res.errMsg || res.errmsg || '')), { errCode: code });
  }
  return res;
}

/** the platform's namespace for the mini-game content-security calls (wx-server-sdk: cloud.openapi.wxa.game.contentSpam) */
function contentSpam() {
  const o = cloud().openapi;
  const c = o && o.wxa && o.wxa.game && o.wxa.game.contentSpam;
  if (!c) throw Object.assign(new Error('openapi.wxa.game.contentSpam is not available in this SDK'), { errCode: 'NO_SDK_API' });
  return c;
}

/**
 * Game msgSecCheck (wxa.game.contentSpam.msgSecCheck [VERIFY E12]), timeout 2 s. `params` = core/moderation.gameTextParams.
 * @returns {Promise<{suggest:string|undefined, label:*, traceId:string|null}>} the caller maps `suggest` with moderation.planOutcome
 */
async function gameMsgSecCheck(params) {
  const res = okResult(await withTimeout(contentSpam().msgSecCheck(params), CONFIG.moderation.textGameTimeoutMs, 'game msgSecCheck'), 'game msgSecCheck');
  const r = res.result || {};
  return { suggest: r.suggest, label: r.label, traceId: res.trace_id || res.traceId || null };
}

/**
 * msgSecCheck v2 (the `textApi: 'general'` fallback). `params` = core/moderation.textCheckParams. Timeout 3 s.
 * @returns {Promise<{suggest:string|undefined, label:*, traceId:string|null}>}
 */
async function msgSecCheck(params) {
  const o = cloud().openapi;
  if (!o || !o.security || typeof o.security.msgSecCheck !== 'function') throw Object.assign(new Error('openapi.security.msgSecCheck is not available'), { errCode: 'NO_SDK_API' });
  const res = okResult(await withTimeout(o.security.msgSecCheck(params), CONFIG.moderation.textTimeoutMs, 'msgSecCheck'), 'msgSecCheck');
  const r = res.result || {};
  return { suggest: r.suggest, label: r.label, traceId: res.trace_id || res.traceId || null };
}

module.exports = { gameMsgSecCheck, msgSecCheck };
