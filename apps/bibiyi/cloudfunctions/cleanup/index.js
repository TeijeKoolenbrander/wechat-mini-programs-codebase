'use strict';
// cleanup: timer trigger (config.json, 04:00 BJT). Server-only (rejects calls that carry an OPENID). Idempotent.
//  1. finalize leftover open ranked runs whose window closed (end reason `window`)
//  2. 180-day retention (PO-33) for every collection with personal data; daily_stats, answer_stats,
//     fact_reveals, daily_decks, daily_facts, fact_overrides, meta are aggregates/content and are kept
//  3. answer_stats roll-up of yesterday's answers (calibration, spec 4.4)
//  4. anomaly roll-up -> `anomaly_daily` event; [ALERT] when mismatch > 0.5% of free submits
//  5. per-fact report-rate check: reports > 0.3% of reveals -> [ALERT] + `fact_report_daily` event
const core = require('./common/coreapi');
const store = require('./common/store');
const runs = require('./common/runs');
const stats = require('./common/stats');
const { now, addDaysKey, bjtDayStartMs, DAY_MS, RETENTION_DAYS, configuredTimeoutMs } = require('./common/util');

const RETENTION = [
  { col: 'run_progress', field: 'startedAt' },
  { col: 'runs', field: 'submittedAt' },
  { col: 'daily_results', field: 'endedAt' },
  { col: 'challenges', field: 'createdAt' },
  { col: 'fact_reports', field: 'ts' },
  { col: 'sub_grants', field: 'grantedAt' },
  { col: 'anomalies', field: 'ts' },
  { col: 'events', field: 'ts' },
  { col: 'player_stats', field: 'updatedAt' },
];
const MISMATCH_ALERT_RATE = 0.005;
const REPORT_ALERT_RATE = 0.003;
const MIN_REVEALS_FOR_RATE = 50;

async function purge(col, cond, deadline) {
  let total = 0;
  while (now() < deadline) {
    const r = await store.db().collection(col).where(cond).remove();
    const n = (r && r.stats && r.stats.removed) || 0;
    total += n;
    if (n === 0) break;
  }
  return total;
}

async function finalizeLeftovers(today, nowMs, deadline) {
  const _ = store._();
  let finalized = 0;
  while (now() < deadline) {
    const r = await store.db().collection('run_progress').where({ status: 'open', ranked: true, dateKey: _.lt(today) }).limit(100).get();
    const due = r.data.filter((run) => runs.windowClosed(run, nowMs));
    if (!due.length) break;
    for (const run of due) {
      if (await runs.finalizeRun(run._id, 'window', nowMs)) finalized++;
    }
    if (due.length < r.data.length) break; // the rest are not due yet
  }
  return finalized;
}

async function anomalyRollup(yesterday, nowMs) {
  const _ = store._();
  const from = bjtDayStartMs(yesterday);
  const to = from + DAY_MS;
  const counts = { fast: 0, slow: 0, order: 0, mismatch: 0 };
  const rows = await store.queryAll('anomalies', { ts: _.gte(from) }, { max: 50000 });
  for (const a of rows) if (a.ts < to && a.kind in counts) counts[a.kind]++;
  const freeSubmits = (await store.db().collection('runs').where({ submittedAt: _.gte(from) }).count()).total
    - (await store.db().collection('runs').where({ submittedAt: _.gte(to) }).count()).total;
  await store.writeEvent('server', 'anomaly_daily', { dateKey: yesterday, ...counts, freeSubmits });
  if (freeSubmits > 0 && counts.mismatch / freeSubmits > MISMATCH_ALERT_RATE) {
    console.error(`[ALERT] mismatch rate ${counts.mismatch}/${freeSubmits} > 0.5% on ${yesterday}: client and server disagree on free-run streaks`);
  }
  return { ...counts, freeSubmits };
}

async function reportRateCheck() {
  const reports = await store.queryAll('fact_reports', {}, { max: 50000 });
  const per = new Map();
  for (const r of reports) if (r.status !== 'rejected') per.set(r.factId, (per.get(r.factId) || 0) + 1);
  const flagged = [];
  for (const [factId, n] of per) {
    const rv = await store.getDoc('fact_reveals', factId);
    const reveals = rv ? rv.n : 0;
    if (reveals >= MIN_REVEALS_FOR_RATE && n / reveals > REPORT_ALERT_RATE) {
      flagged.push({ factId, reports: n, reveals });
      console.error(`[ALERT] fact ${factId}: ${n} reports / ${reveals} reveals exceeds 0.3%`);
      await store.writeEvent('server', 'fact_report_daily', { factId, reports: n, reveals, rate: Math.round((n / reveals) * 10000) / 10000 });
    }
  }
  return flagged;
}

exports.main = store.handler(async (event, { startedAt }) => {
  const _ = store._();
  const nowMs = now();
  const deadline = startedAt + 0.7 * configuredTimeoutMs();
  const today = core.dateKeyAt(nowMs);
  const yesterday = addDaysKey(today, -1);

  const finalized = await finalizeLeftovers(today, nowMs, deadline);

  const cutoffMs = nowMs - RETENTION_DAYS * DAY_MS;
  const cutoffKey = addDaysKey(today, -RETENTION_DAYS);
  const removed = {};
  for (const t of RETENTION) removed[t.col] = await purge(t.col, { [t.field]: _.lt(cutoffMs) }, deadline);
  removed.group_members = await purge('group_members', { lastSeen: _.lt(cutoffKey) }, deadline);
  removed.rate_limits = await purge('rate_limits', { expireAt: _.lt(nowMs) }, deadline);

  const rollup = await stats.rollupDay(yesterday);
  const anomalies = await anomalyRollup(yesterday, nowMs);
  const flagged = await reportRateCheck();
  return { ok: true, cutoffKey, finalized, removed, rollup, anomalies, flaggedFacts: flagged.map((f) => f.factId) };
}, { auth: false, serverOnly: true });
