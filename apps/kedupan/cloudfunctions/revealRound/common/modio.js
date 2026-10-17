'use strict';
// Typed-clue moderation I/O (spec 11.6): the only code that talks to the content-security APIs (through wxapi.js) and keeps
// the moderation bookkeeping (mod_quota counters, mod_log evidence, the clue_check event). Every DECISION comes from
// core/moderation.js (pure, shared with the mock server). FAIL CLOSED: any error, timeout, unknown verdict or quota
// problem means "not shown" (MODERATION_BUSY), never a pass.
//
//   checkText   game msgSecCheck (textApi 'game', default) or the general msgSecCheck v2 ('general'), synchronous, 2 s / 3 s
//   mock mode   (MODERATION_MODE=mock, dev only; ENV_KIND=prod refuses every call with SERVER_CONFIG, env.js)
const { core, CONFIG, dateKeyAt } = require('./coreapi');
const store = require('./store');
const wx = require('./wxapi');
const env = require('./env');
const groups = require('./groups');
const { now, sleep, newMockTraceId } = require('./util');

const dateKey = () => dateKeyAt(now());
const QUOTA_BASE = () => ({ dateKey: dateKey(), ts: now(), text: 0, busy: 0 });

/** [ALERT] lines are what the founder greps the function log for (README) */
function alert(msg) {
  console.error('[ALERT] ' + msg);
}

/**
 * Dev + live only: reserve one call from the daily budget (default 80 of the pre-publish quota), atomically in
 * mod_quota/<dateKey>. Everywhere else true. false = over budget (MODERATION_BUSY).
 */
async function reserve(e) {
  if (e.envKind !== 'dev' || e.mode !== 'live') return true;
  const budget = env.textDailyBudget();
  let ok = false;
  await store.db().runTransaction(async (t) => {
    const key = dateKey();
    const d = (await store.getDocT(t, 'mod_quota', key)) || { _id: key, ...QUOTA_BASE() };
    ok = core.MOD.textBudgetAllows(e, d.text || 0, budget);
    if (!ok) return;
    const { _id, ...rest } = d;
    await store.collT(t, 'mod_quota').doc(key).set({ data: { ...rest, text: (d.text || 0) + 1 } });
  });
  return ok;
}

/** counters (volume alert): every call counts; busy ones also count as busy. The dev-live budget counted itself in reserve(). */
async function noteCall(e, busy) {
  const f = { busy: busy ? 1 : 0 };
  if (!(e.envKind === 'dev' && e.mode === 'live')) f.text = 1;
  await store.bump('mod_quota', dateKey(), f, QUOTA_BASE());
}

/**
 * Evidence (mod_log, 180 days, admin only). The text is kept ONLY for non-pass results (the blocked text is the evidence);
 * a pass keeps the verdict, label and trace id but not the words. Never throws.
 */
async function logMod(entry) {
  try {
    await store.coll('mod_log').add({ data: { kind: 'clue', label: null, traceId: null, errCode: null, ts: now(), ...entry } });
  } catch (e) {
    console.warn('mod_log failed', store.errText(e));
  }
}

/**
 * Synchronous check of one typed clue (already normalised, already through core/clue.js). The caller reserved the day
 * allowance. Writes mod_log (+ text if not pass) and the `clue_check` server event (no text, no trace id).
 * @param {{openid:string, text:string, roundId:string}} o
 * @returns {Promise<{ok:true, mod:{api,suggest,label,traceId}} | {ok:false, code:'TEXT_BLOCKED'|'MODERATION_BUSY', strike?:boolean}>}
 */
async function checkText({ openid, text, roundId }) {
  const e = env.ugcGuard(); // SERVER_CONFIG: mock in production, unknown mode
  const flags = await groups.ugcFlags();
  const planApi = flags.textApi === 'general' ? 'general' : 'game';
  const api = e.mode === 'mock' ? 'mock' : planApi;
  const t0 = now();
  const log = async (result, extra) => {
    const nonPass = result !== 'pass';
    await logMod({ roundId, openid, api, result, latencyMs: now() - t0, ...(nonPass ? { text } : {}), ...extra });
    await store.writeEvent('server', 'clue_check', {
      api, suggest: extra && extra.suggest ? extra.suggest : 'none', latencyMs: now() - t0, ...(extra && extra.label !== null && extra.label !== undefined ? { label: extra.label } : {}), ...(extra && extra.errCode ? { errCode: extra.errCode } : {}),
    });
  };
  if (!(await reserve(e))) {
    await noteCall(e, true);
    await log('busy', { errCode: 'BUDGET', suggest: null });
    return { ok: false, code: 'MODERATION_BUSY' };
  }
  let suggest;
  let label = null;
  let traceId = null;
  try {
    if (e.mode === 'mock') {
      const delay = env.mockSyncDelayMs();
      if (delay > 0) await sleep(delay);
      const r = core.MOD.mockText(text);
      if (r.error) throw Object.assign(new Error('mock text error'), { errCode: 'MOCK_BUSY' });
      suggest = r.suggest;
      label = suggest === 'pass' ? 100 : suggest === 'risky' ? 20002 : 21000;
      traceId = newMockTraceId();
    } else if (planApi === 'game') {
      const r = await wx.gameMsgSecCheck(core.MOD.gameTextParams(text, openid));
      ({ suggest, label, traceId } = r);
    } else {
      const r = await wx.msgSecCheck(core.MOD.textCheckParams(text, openid));
      ({ suggest, label, traceId } = r);
    }
  } catch (err) {
    console.warn('msgSecCheck failed', store.errText(err));
    if (core.MOD.isQuotaCode(err && err.errCode)) alert('text check quota error ' + err.errCode + ' (750032 per minute / 750033 per day): ask WeChat for a raise');
    await noteCall(e, true);
    await log('busy', { errCode: String((err && err.errCode) || (err && err.timeout ? 'TIMEOUT' : 'ERR')).slice(0, 40), suggest: null });
    return { ok: false, code: 'MODERATION_BUSY' };
  }
  const plan = core.MOD.planOutcome(planApi, suggest);
  if (plan.outcome === 'busy') {
    await noteCall(e, true); // an unknown verdict (or `review` from the game API, which has none) is an error, never a pass
    await log('busy', { errCode: 'BAD_SUGGEST', suggest: null });
    return { ok: false, code: 'MODERATION_BUSY' };
  }
  await noteCall(e, false);
  const lbl = label === undefined ? null : label;
  await log(suggest, { suggest, label: lbl, traceId });
  if (plan.outcome === 'pass') return { ok: true, mod: { api, suggest: 'pass', label: lbl, traceId } };
  return { ok: false, code: 'TEXT_BLOCKED', strike: plan.strike };
}

/** typed-clue calls and busy results of the last window (sweepRounds alert) from mod_log */
async function busyWindow(windowMs) {
  const _ = store._();
  const rows = await store.queryAll('mod_log', { kind: 'clue', ts: _.gte(now() - windowMs) }, { field: { result: true }, max: 5000 });
  return { total: rows.length, busy: rows.filter((r) => r.result === 'busy').length };
}

module.exports = { checkText, busyWindow, logMod, alert, CONFIG };
