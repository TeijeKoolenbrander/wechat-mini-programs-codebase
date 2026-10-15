'use strict';
// reportFact: "数据有误？" (spec 3.8, 11.2, PO-23). Fixed reason keys only (no free text, so no UGC).
//  - one document per (fact, player): _id = <factId>_<openid>; a repeat updates reasons
//  - rate limit: 20 reports per player per Beijing day; over the limit nothing is stored (RATE_LIMITED)
//  - auto-suspend: >= 5 DISTINCT players within 7 days adds the fact to fact_overrides.suspended (auto: true);
//    a single player can never trigger it. Published daily decks are never edited; future decks skip the fact.
const core = require('./common/coreapi');
const store = require('./common/store');
const input = require('./common/input');
const pool = require('./common/pool');
const { fail, now, DAY_MS } = require('./common/util');

const REPORTS_PER_DAY = 20;
const SUSPEND_REPORTERS = 5;
const SUSPEND_WINDOW_DAYS = 7;

/** the content version (last 2) in which this fact exists, free pool or daily pool; null if unknown */
async function findFactVersion(factId) {
  const latest = core.currentVersions().contentVersion;
  for (let v = latest; v >= Math.max(1, latest - 1); v--) {
    if (core.freeFact(v, factId)) return v;
    if (await pool.getDailyFact(v, factId)) return v;
  }
  return null;
}

async function autoSuspend(factId, ts) {
  await store.db().runTransaction(async (t) => {
    const o = await store.getDocT(t, 'fact_overrides', 'live');
    const entry = { factId, auto: true, since: ts };
    if (!o) {
      await t.collection('fact_overrides').doc('live').set({ data: { suspended: [entry], errata: {}, updatedAt: ts } });
      return;
    }
    const list = o.suspended || [];
    if (list.some((s) => s.factId === factId)) return;
    await t.collection('fact_overrides').doc('live').update({ data: { suspended: [...list, entry], updatedAt: ts } });
  });
}

exports.main = store.handler(async (event, { openid }) => {
  const factId = input.factId(event.factId);
  const reasons = input.reasons(event.reasons);
  const where = input.reportWhere(event.where);
  const dateKey = input.optDateKey(event.dateKey);
  const runId = event.runId === undefined || event.runId === null ? null : input.clientRunId(event.runId);
  const ts = now();

  const contentVersion = await findFactVersion(factId);
  if (contentVersion === null) fail('UNKNOWN_FACT', 'unknown fact');
  if (!(await store.rateLimitDay(openid, 'report', core.dateKeyAt(ts), REPORTS_PER_DAY))) fail('RATE_LIMITED', 'too many reports today');

  const id = `${factId}_${openid}`;
  const created = await store.addIfAbsent('fact_reports', {
    _id: id, factId, openid, reasons, where, dateKey, runId, contentVersion, ts, status: 'new',
  });
  if (!created) {
    await store.db().collection('fact_reports').doc(id).update({ data: { reasons, where, dateKey, runId, ts } });
  }

  const _ = store._();
  const reporters = (await store.db().collection('fact_reports').where({ factId, ts: _.gte(ts - SUSPEND_WINDOW_DAYS * DAY_MS) }).count()).total;
  if (reporters >= SUSPEND_REPORTERS) await autoSuspend(factId, ts);
  return { ok: true }; // never reveals whether a fact was suspended
});
