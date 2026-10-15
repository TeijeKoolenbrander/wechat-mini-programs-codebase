'use strict';
// Moderation pipeline (spec 6, PO-13/14/15). Fail closed everywhere: any error, timeout, quota
// problem or missing verdict leaves content unseen (steps stay `pending`) and eventually `void`.
//
// Text:   local rules (text.js) -> msgSecCheck v2 (scene 3, author openid), synchronous.
// Image:  strokes -> server PNG -> cloud storage -> temp URL -> mediaCheckAsync v2 (scene 3).
//         The verdict arrives later via the push handler (onMediaCheck) -> resolveVerdict().
//         Fallback route MEDIA_CHECK_ROUTE=sync uses the legacy synchronous imgSecCheck.
const store = require('./store');
const cfgLib = require('./config');
const lifecycle = require('./lifecycle');
const players = require('./players');
const raster = require('./raster');
const { LIMITS } = cfgLib;
const { fail, now, dateKeyAt, withTimeout, randomBase32 } = require('./util');

const SUGGESTS = ['pass', 'review', 'risky'];

// ---------------------------------------------------------------- counters

async function incDoc(col, id, incs, initial) {
  const _ = store._();
  const data = {};
  for (const [k, v] of Object.entries(incs)) data[k] = _.inc(v);
  const r = await store.db().collection(col).doc(id).update({ data });
  if (!r || !r.stats || !r.stats.updated) {
    await store.addIfAbsent(col, { _id: id, ...initial });
    await store.db().collection(col).doc(id).update({ data });
  }
}
const QUOTA_INIT = { text: 0, image: 0, errors: 0 };

async function getQuota(dateKey) {
  return (await store.getDoc('mod_quota', dateKey)) || { _id: dateKey, ...QUOTA_INIT };
}

/** Circuit-breaker sample: one doc per minute (spec 6.8). Never throws. */
async function recordCall(ok) {
  try {
    const minute = Math.floor(now() / 60000);
    await incDoc('rate_limits', `modcalls_${minute}`, { calls: 1, errors: ok ? 0 : 1 }, {
      bucket: 'modcalls', openid: 'server', minute, calls: 0, errors: 0, expireAt: now() + 3600e3,
    });
  } catch (e) { console.warn('recordCall failed', store.errText(e)); }
}

// ---------------------------------------------------------------- text

function busy(msg) {
  fail('MODERATION_BUSY', msg || 'moderation busy');
}

/** Dev `live` mode: count against MOD_TEXT_DAILY_BUDGET atomically; beyond it the request fails closed. */
async function takeDevTextBudget(dateKey) {
  const budget = cfgLib.envInt('MOD_TEXT_DAILY_BUDGET', 80);
  const ok = await store.db().runTransaction(async (t) => {
    const q = (await store.getDocT(t, 'mod_quota', dateKey)) || { _id: dateKey, ...QUOTA_INIT };
    if (q.text >= budget) return false;
    q.text += 1;
    await store.putT(t, 'mod_quota', q);
    return true;
  });
  if (!ok) busy('dev text budget exhausted');
}

/**
 * msgSecCheck for one string. Returns {suggest:'pass'|'review'|'risky', label, source}.
 * Throws MODERATION_BUSY on any failure (nothing is stored by the caller).
 */
async function checkText(openid, text) {
  const env = cfgLib.moderationEnv();
  const dateKey = dateKeyAt(now());
  if (env.mode === 'mock') {
    if (text.includes('测试繁忙')) { await recordCall(false); busy('mock busy'); }
    await recordCall(true);
    if (text.includes('测试违规')) return { suggest: 'risky', label: 20001, source: 'mock' };
    if (text.includes('测试复审')) return { suggest: 'review', label: 20002, source: 'mock' };
    return { suggest: 'pass', label: 100, source: 'mock' };
  }
  if (env.envKind === 'dev') await takeDevTextBudget(dateKey);
  else incDoc('mod_quota', dateKey, { text: 1 }, { ...QUOTA_INIT, text: 0 }).catch(() => {});
  try {
    const res = await withTimeout(store.sdk().openapi.security.msgSecCheck({ content: text, version: 2, scene: 3, openid }), LIMITS.textTimeoutMs, 'msgSecCheck');
    const r = res && (res.result || res);
    const suggest = r && r.suggest;
    if (!SUGGESTS.includes(suggest)) throw new Error('no suggest in msgSecCheck result');
    await recordCall(true);
    return { suggest, label: r.label === undefined ? null : r.label, source: 'api' };
  } catch (e) {
    await recordCall(false);
    incDoc('mod_quota', dateKey, { errors: 1 }, QUOTA_INIT).catch(() => {});
    console.warn('msgSecCheck failed', store.errText(e));
    return busy('text check failed');
  }
}

/** Evidence copy for the admin (180 days). Never throws. */
async function writeModLog(entry) {
  try {
    await store.db().collection('mod_log').add({ data: { ts: now(), ...entry } });
  } catch (e) { console.warn('mod_log failed', store.errText(e)); }
}

// ---------------------------------------------------------------- image quota

/** Spec 6.7. `forCreate`: new chains pause at 95%; drawing submissions fail closed at 100%. */
async function assertImageCapacity({ forCreate }) {
  const q = await getQuota(dateKeyAt(now()));
  const ratio = q.image / LIMITS.imageDailyLimit;
  if (forCreate && ratio >= LIMITS.imagePauseRatio) fail('UGC_BUSY', 'image quota nearly exhausted');
  if (!forCreate && ratio >= 1) busy('image quota exhausted');
}

// ---------------------------------------------------------------- image submit

function pngPathFor(step) {
  return `chuanhua/mod/${dateKeyAt(step.createdAt).slice(0, 6)}/${step.chainId}/${step.n}_${step.attempt}.png`;
}

async function ensurePng(step) {
  if (step.fileID) return step.fileID;
  const png = raster.renderPng(step.strokes);
  const up = await store.sdk().uploadFile({ cloudPath: pngPathFor(step), fileContent: png });
  if (!up || !up.fileID) throw new Error('uploadFile returned no fileID');
  step.fileID = up.fileID;
  await store.db().collection('steps').doc(step._id).update({ data: { fileID: up.fileID, hasFile: true } });
  return up.fileID;
}

async function tempUrl(fileID, maxAge) {
  const r = await store.sdk().getTempFileURL({ fileList: [{ fileID, maxAge }] });
  const f = r && r.fileList && r.fileList[0];
  if (!f || !f.tempFileURL) throw new Error('no temp url');
  return f.tempFileURL;
}

function traceFrom(res) {
  const id = res && (res.traceId || res.trace_id || (res.result && (res.result.traceId || res.result.trace_id)));
  if (!id || typeof id !== 'string') throw new Error('mediaCheckAsync returned no trace id');
  return id;
}

async function recordTrace(stepId, traceId, { mock, isRecheck, nowMs }) {
  await store.txn(async (t) => {
    const step = await store.getDocT(t, 'steps', stepId);
    if (!step || step.state !== 'pending') return;
    step.mod = {
      ...step.mod,
      traceIds: [...(step.mod.traceIds || []), traceId],
      lastCheckAt: nowMs,
      callFailed: false,
      callRetries: step.mod.callRetries || 0,
      nextAttemptAt: null,
      rechecked: !!(step.mod.rechecked || isRecheck),
      mock: !!mock,
    };
    await store.putT(t, 'steps', step);
    await t.collection('mod_traces').add({ data: { _id: traceId, stepId, submittedAt: nowMs, mock: !!mock, done: false } });
  });
}

async function noteCallFailure(stepId, { isRetry, nowMs }) {
  let toVoid = false;
  await store.txn(async (t) => {
    const step = await store.getDocT(t, 'steps', stepId);
    if (!step || step.state !== 'pending') return;
    const retries = (step.mod.callRetries || 0) + (isRetry ? 1 : 0);
    step.mod = { ...step.mod, callFailed: true, callRetries: retries, nextAttemptAt: nowMs + LIMITS.mediaRetryGapMs };
    toVoid = retries >= LIMITS.mediaMaxCallRetries && isRetry;
    await store.putT(t, 'steps', step);
  });
  if (toVoid) await voidStep(stepId, 'error');
}

/**
 * Start (or retry, or re-check) the platform check for a pending drawing. Never throws except
 * SERVER_CONFIG; failures are booked on the step and retried by modSweeper (spec 6.3 step 8).
 */
async function startMediaCheck(stepId, { isRetry = false, isRecheck = false } = {}) {
  const env = cfgLib.moderationEnv();
  const nowMs = now();
  const step = await store.getDoc('steps', stepId);
  if (!step || step.state !== 'pending') return { skipped: true };
  try {
    const fileID = await ensurePng(step);
    const dateKey = dateKeyAt(nowMs);
    if (env.mode === 'mock') {
      const traceId = `mock_${stepId}_${(step.mod.traceIds || []).length + 1}`;
      await recordTrace(stepId, traceId, { mock: true, isRecheck, nowMs });
      incDoc('mod_quota', dateKey, { image: 1 }, QUOTA_INIT).catch(() => {});
      return { ok: true, traceId, mock: true };
    }
    if (cfgLib.mediaRoute() === 'sync') return await syncImgSecCheck(step, fileID, nowMs);
    const url = await tempUrl(fileID, 7200);
    incDoc('mod_quota', dateKey, { image: 1 }, QUOTA_INIT).catch(() => {});
    let res;
    try {
      res = await withTimeout(store.sdk().openapi.security.mediaCheckAsync({
        mediaUrl: url, mediaType: 2, version: 2, scene: 3, openid: step.author,
      }), 8000, 'mediaCheckAsync');
    } catch (e) {
      incDoc('mod_quota', dateKey, { errors: 1 }, QUOTA_INIT).catch(() => {});
      throw e;
    }
    const traceId = traceFrom(res);
    await recordTrace(stepId, traceId, { mock: false, isRecheck, nowMs });
    await recordCall(true);
    return { ok: true, traceId };
  } catch (e) {
    await recordCall(false);
    console.warn('startMediaCheck failed', stepId, store.errText(e));
    await noteCallFailure(stepId, { isRetry: isRetry || isRecheck, nowMs });
    return { ok: false, error: true };
  }
}

/** Fallback route: legacy synchronous imgSecCheck (pass or errCode 87014). Needs V3 verification. */
async function syncImgSecCheck(step, fileID, nowMs) {
  const dl = await store.sdk().downloadFile({ fileID });
  let suggest = 'pass';
  try {
    await withTimeout(store.sdk().openapi.security.imgSecCheck({ media: { contentType: 'image/png', value: dl.fileContent } }), 8000, 'imgSecCheck');
  } catch (e) {
    if (e && (e.errCode === 87014 || /87014/.test(store.errText(e)))) suggest = 'risky';
    else throw e;
  }
  const traceId = `sync_${step._id}_${(step.mod.traceIds || []).length + 1}`;
  await recordTrace(step._id, traceId, { mock: false, isRecheck: false, nowMs });
  await recordCall(true);
  const r = await resolveVerdict({ traceId, suggest, label: suggest === 'risky' ? 87014 : null, source: 'sync' });
  return { ok: true, traceId, verdict: r };
}

// ---------------------------------------------------------------- verdicts

/**
 * Apply one platform verdict. Idempotent per trace id; unknown traces are ignored (spec edge 8, 9).
 * pass -> passed; review -> blocked (no strike); risky -> blocked + one strike.
 * A verdict for a step that is no longer pending is logged and ignored, except that a late `risky`
 * still adds a strike (AC 48).
 */
async function resolveVerdict({ traceId, suggest, label, source = 'api' }) {
  if (!SUGGESTS.includes(suggest)) return { ignored: 'bad_suggest' };
  const nowMs = now();
  const outcome = { ignored: null };
  let chainForCard = null;
  let latencyMs = null;
  let mockTrace = false;
  await store.txn(async (t) => {
    outcome.ignored = null;
    outcome.state = undefined;
    const trace = await store.getDocT(t, 'mod_traces', traceId);
    if (!trace) { outcome.ignored = 'unknown_trace'; return; }
    if (trace.done) { outcome.ignored = 'duplicate'; return; }
    mockTrace = !!trace.mock;
    latencyMs = nowMs - trace.submittedAt;
    trace.done = true;
    trace.suggest = suggest;
    trace.verdictAt = nowMs;
    await store.putT(t, 'mod_traces', trace);
    const step = await store.getDocT(t, 'steps', trace.stepId);
    if (!step) { outcome.ignored = 'unknown_step'; return; }
    const pc = lifecycle.makePlayerCache(t, nowMs);
    const k = (step.mod.traceIds || []).indexOf(traceId) + 1;
    await t.collection('mod_log').add({
      data: { _id: `${step._id}_${k}`, stepId: step._id, author: step.author, kind: 'image', fileID: step.fileID || null, hasFile: !!step.fileID, suggest, label: label === undefined ? null : label, source, ts: nowMs },
    }).catch((e) => { if (!store.isDup(e)) throw e; });
    if (step.state !== 'pending') {
      outcome.ignored = 'late';
      if (suggest === 'risky') {
        const author = await pc.get(step.author);
        players.addStrike(author, step._id, 'verdict', nowMs);
        await pc.flush();
      }
      return;
    }
    const chain = await store.getDocT(t, 'chains', step.chainId);
    step.mod = { ...step.mod, suggest, label: label === undefined ? null : label, verdictAt: nowMs };
    if (!chain) { step.state = 'blocked'; await store.putT(t, 'steps', step); return; }
    if (suggest === 'pass') {
      const r = await lifecycle.passStepT(t, { chain, step, nowMs, pc });
      outcome.state = 'passed';
      outcome.revealed = r.revealed;
    } else {
      await lifecycle.failStepT(t, { chain, step, outcome: 'blocked', nowMs, pc });
      outcome.state = 'blocked';
      if (suggest === 'risky') {
        const author = await pc.get(step.author);
        players.addStrike(author, step._id, 'verdict', nowMs);
      }
    }
    await store.putT(t, 'steps', step);
    await store.putT(t, 'chains', chain);
    await pc.flush();
    chainForCard = chain;
  });
  if (!outcome.ignored) {
    await store.writeEvent(null, 'mod_verdict', { kind: 'image', suggest, label: label === undefined ? null : label, latencyMs, retry: false, mock: mockTrace });
    if (chainForCard) await require('./activity').updateCard(chainForCard);
  }
  return outcome;
}

/** Void a pending drawing after a platform fault (no strike, allowance restored). */
async function voidStep(stepId, reason) {
  const nowMs = now();
  let done = false;
  await store.txn(async (t) => {
    done = false;
    const step = await store.getDocT(t, 'steps', stepId);
    if (!step || step.state !== 'pending') return;
    const chain = await store.getDocT(t, 'chains', step.chainId);
    const pc = lifecycle.makePlayerCache(t, nowMs);
    step.mod = { ...step.mod, voidReason: reason, verdictAt: nowMs };
    if (chain) {
      await lifecycle.failStepT(t, { chain, step, outcome: 'void', nowMs, pc });
      await store.putT(t, 'chains', chain);
    } else {
      step.state = 'void';
    }
    await store.putT(t, 'steps', step);
    await pc.flush();
    done = true;
  });
  if (done) await store.writeEvent(null, 'mod_void', { kind: 'image', reason });
  return done;
}

// ---------------------------------------------------------------- callback parsing

/**
 * Parse a `wxa_media_check` push (JSON). Returns {traceId, suggest, label} when a verdict is present,
 * {traceId, error:true} when the platform reports a check failure (the step stays pending), else null.
 * Shape per the official push: {Event:'wxa_media_check', trace_id, errcode, result:{suggest,label}, detail:[...]}.
 */
function parseMediaCallback(msg) {
  if (!msg || typeof msg !== 'object') return null;
  const ev = msg.Event || msg.event;
  if (ev !== undefined && ev !== 'wxa_media_check') return null;
  const traceId = msg.trace_id || msg.traceId;
  if (typeof traceId !== 'string' || !traceId) return null;
  if (msg.errcode !== undefined && Number(msg.errcode) !== 0) return { traceId, error: true };
  let suggest = msg.result && msg.result.suggest;
  let label = msg.result && msg.result.label;
  if (!suggest && Array.isArray(msg.detail) && msg.detail.length) {
    const rank = { pass: 0, review: 1, risky: 2 };
    let worst = null;
    for (const d of msg.detail) {
      if (d && SUGGESTS.includes(d.suggest) && (!worst || rank[d.suggest] > rank[worst.suggest])) worst = d;
    }
    if (worst) { suggest = worst.suggest; label = worst.label; }
  }
  if (!SUGGESTS.includes(suggest)) return { traceId, error: true };
  return { traceId, suggest, label: label === undefined ? null : label };
}

/** Mock verdict rules for drawings (spec 6.6): 13 strokes -> risky, 14 -> review, 15 -> no verdict, else pass. */
function mockImageSuggest(strokeCount) {
  if (strokeCount === 13) return 'risky';
  if (strokeCount === 14) return 'review';
  if (strokeCount === 15) return null;
  return 'pass';
}

module.exports = {
  checkText, writeModLog, assertImageCapacity, startMediaCheck, resolveVerdict, voidStep, parseMediaCallback,
  mockImageSuggest, getQuota, incDoc, recordCall, QUOTA_INIT, pngPathFor, randomBase32,
};
