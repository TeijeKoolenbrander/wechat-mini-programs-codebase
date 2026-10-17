'use strict';
// Moderation I/O (spec 6): the only code that talks to the content-security APIs (through wxapi.js) and keeps the moderation
// bookkeeping (quota counters, breaker window, mod_traces, mod_log). Every DECISION comes from core/moderation.js (pure, shared with
// the mock server). FAIL CLOSED: any error, timeout, unknown verdict or quota problem means "not visible" (MODERATION_BUSY /
// IMAGE_BLOCKED / pending), never a pass.
//
//   text   : checkText      game msgSecCheck (textApi 'game', default) or the general msgSecCheck v2 ('general'), synchronous
//   image  : checkDrawingSync   rasterise -> upload -> temp URL -> mediaCheckSync (5 s). Error 750031 switches imageMode to 'async'.
//            sendImageCheck     the v1 mediaCheckAsync pipeline, ONLY for imageMode 'async' (the dormant fallback, 6.10)
const mod = require('../core/moderation');
const { CONFIG } = require('../core/config');
const { beijingDateKey } = require('../core/date');
const store = require('./store');
const wx = require('./wxapi');
const env = require('./env');
const players = require('./players');
const appconfig = require('./appconfig');
const raster = require('./raster');
const { now, newMockTraceId, randomId, sleep } = require('./util');

const dateKey = () => beijingDateKey(now());
const minuteKey = (t) => 'm' + Math.floor(t / 60000);
const QUOTA_BASE = { text: 0, image: 0, errors: 0, textGame: 0, imageSync: 0, calls: {} };

function alert(msg) {
  console.error('[ALERT] ' + msg);
}

// ---- counters (mod_quota/<dateKey>) and the breaker window ----------------------------------------------------------

/**
 * Count one moderation call: `kind` 'text' | 'image' | null, `failed` for the breaker. calls.m<minute>.{n,f} feed
 * breakerDecision over the last 5 minutes (spec 6.8). `extra` = more counters to bump (imageSync, textGame). Counter bumps never break the request.
 */
async function noteCall(kind, failed, extra) {
  const f = {};
  if (kind) f[kind] = 1;
  for (const k of extra || []) f[k] = 1;
  const k = minuteKey(now());
  f['calls.' + k + '.n'] = 1;
  if (failed) {
    f.errors = 1;
    f['calls.' + k + '.f'] = 1;
  }
  try {
    await store.bump('mod_quota', dateKey(), f, QUOTA_BASE);
  } catch (e) {
    console.warn('noteCall failed', store.errText(e));
  }
}

async function quotaDoc(key) {
  return (await store.getDoc('mod_quota', key || dateKey())) || Object.assign({ _id: key || dateKey() }, QUOTA_BASE);
}
async function imageLevel() {
  return mod.quotaLevel((await quotaDoc()).image || 0);
}

/** calls and failures in the last breaker window (today's and, around midnight, yesterday's counter doc) */
async function windowStats(t) {
  const lo = Math.floor(t / 60000) - Math.floor(CONFIG.moderation.breaker.windowMs / 60000) + 1;
  const keys = new Set([beijingDateKey(t), beijingDateKey(t - CONFIG.moderation.breaker.windowMs)]);
  let total = 0;
  let failed = 0;
  for (const key of keys) {
    const d = await store.getDoc('mod_quota', key);
    for (const [m, v] of Object.entries((d && d.calls) || {})) {
      const idx = Number(m.slice(1));
      if (idx >= lo && idx <= Math.floor(t / 60000)) {
        total += v.n || 0;
        failed += v.f || 0;
      }
    }
  }
  return { total, failed };
}

/**
 * Reserve one check of `kind` ('text' | 'image'). In dev + live the daily budget (text 80 of the ~100 pre-publish calls, image 200) is
 * enforced atomically (returns 'counted'); everywhere else true and the counter is incremented by noteCall. false = over budget (AC 52).
 */
async function reserve(e, kind) {
  if (e.envKind === 'dev' && e.mode === 'live') {
    const budget = kind === 'text' ? env.textDailyBudget() : env.imageDailyBudget();
    const allows = kind === 'text' ? mod.textBudgetAllows : mod.imageBudgetAllows;
    return store.txn(async (t) => {
      const key = dateKey();
      const d = (await store.getDocT(t, 'mod_quota', key)) || Object.assign({ _id: key }, QUOTA_BASE);
      if (!allows(e, d[kind] || 0, budget)) return false;
      d[kind] = (d[kind] || 0) + 1;
      await players.putT(t, 'mod_quota', key, d);
      return 'counted';
    });
  }
  return true; // counted in noteCall(kind)
}

// ---- evidence log (mod_log, 180 days, admin only) ------------------------------------------------------------------

async function logMod(entry) {
  const base = entry.stepId || 'prompt';
  const doc = Object.assign({ stepId: entry.stepId || null, label: null, ts: now() }, entry);
  for (let k = 0; k < 20; k++) {
    try {
      if (await store.addIfAbsent('mod_log', Object.assign({ _id: base + '_' + k }, doc))) return;
    } catch (e) {
      console.warn('mod_log failed', store.errText(e));
      return;
    }
  }
  await store.addIfAbsent('mod_log', Object.assign({ _id: base + '_' + randomId(8, 'abcdef0123456789') }, doc)).catch(() => {});
}

// ---- fallback switch (6.9 item 6) ------------------------------------------------------------------------------------

/**
 * mediaCheckSync answered 750031 (the game is not configured for this AppID): switch `moderation.imageMode` to 'async' (live rooms go off, the
 * v1 pipeline takes over for 慢慢传) and alert. Idempotent. NEVER falls back to showing unchecked drawings.
 */
async function switchToAsync(reason) {
  try {
    const before = await store.getDoc('app_config', 'live');
    await store.addIfAbsent('app_config', { _id: 'live', ugc: { createEnabled: true, viewEnabled: true, autoPausedUntil: 0 }, updatedAt: now() });
    await store.coll('app_config').doc('live').update({ data: { 'moderation.imageMode': 'async', updatedAt: now() } });
    await store.coll('audit_log').add({ data: { op: 'autoAsync', target: 'app_config/live', before: before && before.moderation ? before.moderation : null, after: { imageMode: 'async' }, by: 'system:' + reason, ts: now() } });
  } catch (e) {
    console.warn('switchToAsync failed', store.errText(e));
  }
  appconfig.reset();
  alert('mediaCheckSync error ' + reason + ': the game is not supported for this AppID. moderation.imageMode is now "async": live rooms are OFF. Ask WeChat to enable 小游戏内容安全 (Handoff H5), then run admin setModeration {imageMode:"sync"}');
}

// ---- text (custom prompts and descriptions, spec 6.2) -------------------------------------------------------------

/**
 * Synchronous text moderation: the game msgSecCheck (default) or the general v2 API (`textApi: 'general'`, where `review` blocks without a strike).
 * @param {{openid:string, text:string, stepId?:string|null, auto?:boolean}} o
 * @returns {Promise<{ok:true} | {ok:false, code:'TEXT_BLOCKED'|'MODERATION_BUSY', strike?:boolean}>}
 */
async function checkText({ openid, text, stepId, auto }) {
  const e = env.ugcGuard();
  const cfg = await appconfig.get();
  const api = cfg.config.moderation.textApi === 'general' ? 'general' : 'game';
  const reserved = await reserve(e, 'text');
  const kind = reserved === 'counted' ? null : 'text'; // dev live already incremented the counter in the reservation
  const extra = api === 'game' ? ['textGame'] : [];
  if (!reserved) {
    await noteCall(null, true);
    return { ok: false, code: 'MODERATION_BUSY' };
  }
  const t0 = now();
  let suggest;
  let label = null;
  let source;
  try {
    if (e.mode === 'mock') {
      const r = mod.mockText(text);
      if (r.error) throw new Error('mock text error');
      suggest = r.suggest;
      source = 'mock';
    } else if (api === 'game') {
      const r = await wx.gameMsgSecCheck(mod.gameTextParams(text, openid));
      suggest = r.suggest;
      label = r.label === undefined ? null : r.label;
      source = 'api';
    } else {
      const r = await wx.msgSecCheck(mod.textCheckParams(text, openid));
      suggest = r.suggest;
      label = r.label === undefined ? null : r.label;
      source = 'api';
    }
  } catch (err) {
    console.warn('msgSecCheck failed', store.errText(err));
    await noteCall(kind, true, extra);
    return { ok: false, code: 'MODERATION_BUSY' };
  }
  const v = mod.verdictOf(suggest);
  if (!v || (api === 'game' && suggest === 'review')) {
    await noteCall(kind, true, extra); // an unknown verdict is an error, never a pass
    return { ok: false, code: 'MODERATION_BUSY' };
  }
  await noteCall(kind, false, extra);
  await logMod({ stepId: stepId || null, author: openid, kind: 'text', textCopy: text, suggest, label, source });
  await store.writeEvent(null, 'mod_verdict', { kind: 'text', api, suggest: String(suggest), latencyMs: now() - t0, auto: !!auto, mock: e.mode === 'mock' });
  if (v.outcome === 'passed') return { ok: true };
  if (v.strike) await players.strike(openid, stepId || null, 'verdict');
  return { ok: false, code: 'TEXT_BLOCKED', strike: v.strike };
}

// ---- drawings (spec 6.3) ---------------------------------------------------------------------------------------------

/** upload the moderation PNG; returns the fileID (throws on failure: the caller answers MODERATION_BUSY, nothing is stored) */
async function storePng(chainId, n, attempt, png) {
  return wx.uploadPng(mod.modPngPath(chainId, n, attempt, now()), png);
}

/** a sync check leaves a trace record for every uploaded PNG, so cleanup can delete the file whatever the outcome (7.5) */
async function traceSync(stepId, fileID, extra) {
  await store.addIfAbsent('mod_traces', Object.assign({ _id: 'sync_' + stepId + '_' + randomId(6, 'abcdef0123456789'), stepId, fileID: fileID || null, submittedAt: now(), sync: true, done: true }, extra)).catch(() => {});
}

/**
 * The synchronous image check of one drawing (6.3): rasterise the PNG (512 x round(512 h / 1024)), upload it, get a 600 s temp URL, call
 * mediaCheckSync with a 5 s timeout. The caller validated the strokes already. NOTHING is trusted unless the verdict is `pass`.
 * @param {{openid:string, chainId:string, n:number, attempt:number, stepId:string, strokes:object, auto?:boolean}} o
 * @returns {Promise<{ok:true, fileID:string} | {ok:false, code:'IMAGE_BLOCKED'|'MODERATION_BUSY'|'INVALID_STROKES', strike?:boolean, fileID?:string, suggest?:string, reason?:string}>}
 */
async function checkDrawingSync(o) {
  const e = env.ugcGuard();
  const lvl = await imageLevel();
  if (lvl === 'failClosed') return { ok: false, code: 'MODERATION_BUSY' };
  if (lvl === 'alert') alert('image quota >= 70% of the daily mediaCheckSync limit; ask WeChat for a raise (Handoff H11)');
  const img = raster.strokesToPng(o.strokes);
  if (!img.ok) return { ok: false, code: 'INVALID_STROKES', reason: img.reason };
  const reserved = await reserve(e, 'image');
  if (!reserved) {
    await noteCall(null, true);
    return { ok: false, code: 'MODERATION_BUSY' };
  }
  const kind = reserved === 'counted' ? null : 'image';
  let fileID;
  try {
    fileID = await storePng(o.chainId, o.n, o.attempt, img.png);
  } catch (err) {
    console.error('[ALERT] moderation PNG upload failed', store.errText(err));
    await noteCall(kind, true, ['imageSync']);
    return { ok: false, code: 'MODERATION_BUSY' };
  }
  const t0 = now();
  let r;
  try {
    if (e.mode === 'mock') {
      const delay = env.mockSyncDelayMs();
      if (delay > 0) await sleep(delay);
      const m = mod.mockImageSync(o.strokes);
      if (m.timeout) throw Object.assign(new Error('mock mediaCheckSync timed out'), { timeout: true });
      r = { suggest: m.suggest, label: m.suggest === 'pass' ? 100 : 20002, traceId: newMockTraceId() };
    } else {
      const url = await wx.tempUrl(fileID, 600);
      r = await wx.mediaCheckSync(mod.syncImageParams(url, o.openid));
    }
  } catch (err) {
    console.warn('mediaCheckSync failed', store.errText(err));
    await noteCall(kind, true, ['imageSync']);
    await traceSync(o.stepId, fileID, { suggest: null, error: String((err && (err.errCode || err.message)) || 'error').slice(0, 80) });
    if (mod.isNotSupported(err && err.errCode)) await switchToAsync(String(err.errCode));
    return { ok: false, code: 'MODERATION_BUSY', fileID };
  }
  const v = mod.verdictOf(r.suggest);
  if (!v || r.suggest === 'review') {
    await noteCall(kind, true, ['imageSync']); // an unknown verdict (the game API knows only pass / risky) is an error, never a pass
    await traceSync(o.stepId, fileID, { suggest: null, error: 'unknown suggest' });
    return { ok: false, code: 'MODERATION_BUSY', fileID };
  }
  await noteCall(kind, false, ['imageSync']);
  await traceSync(o.stepId, fileID, { suggest: r.suggest, traceId: r.traceId || null, mock: e.mode === 'mock' });
  await logMod({ stepId: o.stepId, author: o.openid, kind: 'image', fileID, suggest: r.suggest, label: r.label === undefined ? null : r.label, source: e.mode === 'mock' ? 'mock' : 'api' });
  await store.writeEvent(null, 'mod_verdict', { kind: 'image', api: 'game', suggest: String(r.suggest), label: r.label === undefined ? null : r.label, latencyMs: now() - t0, auto: !!o.auto, mock: e.mode === 'mock' });
  if (v.outcome === 'passed') return { ok: true, fileID };
  if (v.strike) await players.strike(o.openid, o.stepId, 'verdict');
  return { ok: false, code: 'IMAGE_BLOCKED', strike: v.strike, fileID, suggest: r.suggest };
}

/**
 * [imageMode 'async' only] Send one image for checking: live = temp URL + mediaCheckAsync; mock (dev only) = schedule the mock verdict. Writes
 * mod_traces/<trace_id>. Returns {ok:true, traceId} or {ok:false} when the CALL failed (the step stays pending and
 * modSweeper retries, 6.10).
 */
async function sendImageCheck({ stepId, openid, fileID, strokes }) {
  const e = env.ugcGuard();
  const t = now();
  let traceId;
  let trace;
  if (e.mode === 'mock') {
    const v = mod.mockImage(strokes);
    traceId = newMockTraceId();
    trace = { stepId, fileID: fileID || null, submittedAt: t, mock: true, done: false, deliverAt: v ? t + env.mockMediaDelayMs() : null, suggest: v ? v.suggest : null };
  } else {
    try {
      const url = await wx.tempUrl(fileID, 7200);
      traceId = await wx.mediaCheckAsync(mod.mediaCheckParams(url, openid));
    } catch (err) {
      console.warn('mediaCheckAsync failed', store.errText(err));
      await noteCall('image', true);
      return { ok: false };
    }
    trace = { stepId, fileID: fileID || null, submittedAt: t, mock: false, done: false };
  }
  await noteCall('image', false);
  await store.addIfAbsent('mod_traces', Object.assign({ _id: traceId }, trace));
  return { ok: true, traceId };
}

module.exports = { dateKey, alert, noteCall, quotaDoc, imageLevel, windowStats, logMod, checkText, checkDrawingSync, switchToAsync, storePng, sendImageCheck, QUOTA_BASE };
