'use strict';
// cleanup: 180-day retention, window finalization, calibration roll-up, anomaly and report-rate checks.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, oracle, playDaily } = require('./helpers/harness');
const { makeRun } = require('./helpers/free');

let h;
beforeEach(() => { h = createHarness(); h.loadDailyFacts(); });
afterEach(() => h.teardown());

const A = 'openid-clean-alice1';
const B = 'openid-clean-bob0002';
const DAY = 86400e3;
const at = (d, hr = 4) => h.setNow(Date.UTC(2026, 9, d, hr, 0, 0));
const count = (col) => h.db.all(col).length;

function capture() {
  const errs = [];
  const orig = console.error;
  console.error = (...a) => errs.push(a.join(' '));
  return { errs, done: () => { console.error = orig; } };
}

test('180-day retention removes personal data, keeps aggregates, content and ops docs; idempotent', async () => {
  const now = h.now();
  const old = now - 181 * DAY;
  const fresh = now - 10 * DAY;
  const oldKey = '20260401';
  const freshKey = '20261001';
  const put = (c, d) => h.db.put(c, d);
  put('run_progress', { _id: 'o', startedAt: old, status: 'ended' }); put('run_progress', { _id: 'n', startedAt: fresh, status: 'ended' });
  put('runs', { _id: 'o', submittedAt: old }); put('runs', { _id: 'n', submittedAt: fresh });
  put('daily_results', { _id: 'o', endedAt: old }); put('daily_results', { _id: 'n', endedAt: fresh });
  put('challenges', { _id: 'o', createdAt: old }); put('challenges', { _id: 'n', createdAt: fresh });
  put('fact_reports', { _id: 'o', ts: old, factId: 'f' }); put('fact_reports', { _id: 'n', ts: fresh, factId: 'f' });
  put('sub_grants', { _id: 'o', grantedAt: old }); put('sub_grants', { _id: 'n', grantedAt: fresh });
  put('anomalies', { _id: 'o', ts: old, kind: 'order' }); put('anomalies', { _id: 'n', ts: fresh, kind: 'order' });
  put('events', { _id: 'o', ts: old }); put('events', { _id: 'n', ts: fresh });
  put('player_stats', { _id: 'o', updatedAt: old }); put('player_stats', { _id: 'n', updatedAt: fresh });
  put('group_members', { _id: 'o', lastSeen: oldKey }); put('group_members', { _id: 'n', lastSeen: freshKey });
  put('rate_limits', { _id: 'o', expireAt: now - 1 }); put('rate_limits', { _id: 'n', expireAt: now + 1e6 });
  // kept
  put('daily_stats', { _id: oldKey, hist: [1], total: 1 }); put('answer_stats', { _id: 'river_g1', n: 5, correct: 3, updatedAt: old });
  put('fact_reveals', { _id: 'f', n: 3 }); put('fact_overrides', { _id: 'live', suspended: [], errata: {} });
  put('daily_decks', { _id: oldKey, questions: [] });
  const r = await h.call('cleanup', {});
  assert.equal(r.ok, true);
  for (const c of ['run_progress', 'runs', 'daily_results', 'challenges', 'fact_reports', 'sub_grants', 'anomalies', 'player_stats', 'group_members', 'rate_limits']) {
    assert.deepEqual(h.db.all(c).map((d) => d._id), ['n'], c);
    assert.equal(r.removed[c], 1, c);
  }
  assert.deepEqual(h.db.all('events').filter((e) => e._id === 'o' || e._id === 'n').map((e) => e._id), ['n']);
  for (const c of ['daily_stats', 'answer_stats', 'fact_reveals', 'fact_overrides', 'daily_decks']) assert.equal(count(c) >= 1, true, `${c} kept`);
  assert.equal(h.db.all('answer_stats').length, 1);
  assert.equal(h.db.all('daily_facts').length > 0, true);
  const again = await h.call('cleanup', {});
  for (const v of Object.values(again.removed)) assert.equal(v, 0);
  assert.equal(count('player_stats'), 1);
});

test('finalizes leftover open ranked runs from closed windows, leaves today\'s alone', async () => {
  at(15);
  await h.call('getDaily', {}, { openid: A });
  const s = await h.call('startRun', { mode: 'daily', clientRunId: 'cleanup-run-0001' }, { openid: A });
  const o = oracle(h, s.dateKey);
  for (let k = 1; k <= 3; k++) await h.call('answer', { clientRunId: s.clientRunId, k, choice: o.correct(k), ms: 2000 }, { openid: A });
  at(16, 4); // 12:00 next day: the 15th window is closed
  await h.call('getDaily', {}, { openid: B });
  const s2 = await h.call('startRun', { mode: 'daily', clientRunId: 'cleanup-run-0002' }, { openid: B });
  at(16, 20); // 04:00 BJT on the 17th
  const r = await h.call('cleanup', {});
  assert.equal(r.finalized, 2, 'both the 15th and the 16th windows are closed by 04:00 on the 17th');
  const res = h.db.all('daily_results');
  assert.equal(res.length, 2);
  assert.ok(res.every((x) => x.endReason === 'window'));
  assert.equal(res.find((x) => x.openid === A).n, 3);
  assert.equal(res.find((x) => x.openid === B).n, 0);
  assert.equal(h.db.all('daily_stats').find((x) => x._id === '20261015').hist[3], 1);
  const again = await h.call('cleanup', {});
  assert.equal(again.finalized, 0);
  assert.equal(h.db.all('daily_results').length, 2);
  assert.ok(s2.ok);
});

test('window not yet closed: an open run from "yesterday" before 00:30 is not finalized', async () => {
  at(15);
  await h.call('getDaily', {}, { openid: A });
  await h.call('startRun', { mode: 'daily', clientRunId: 'cleanup-run-0003' }, { openid: A });
  h.setNow(Date.UTC(2026, 9, 15, 16, 10, 0)); // 00:10 on the 16th
  const r = await h.call('cleanup', {});
  assert.equal(r.finalized, 0);
  assert.equal(count('daily_results'), 0);
});

test('calibration roll-up: answer_stats per measure and gap bucket from yesterday\'s answers, once only', async () => {
  at(15);
  const run = await playDaily(h, A, { right: 9 });
  await playDaily(h, B, { right: 3 });
  const total = run.steps.length + 4;
  at(16, 20); // 04:00 on the 17th? no: 16th 20:00 UTC = 17th 04:00 BJT; yesterday = the 16th
  h.setNow(Date.UTC(2026, 9, 16, 5, 0, 0)); // the 16th 13:00 BJT -> yesterday = the 15th
  const r = await h.call('cleanup', {});
  assert.equal(r.rollup.dateKey, '20261015');
  assert.equal(r.rollup.answers, total);
  const stats = h.db.all('answer_stats');
  assert.equal(stats.reduce((n, s) => n + s.n, 0), total);
  const correct = stats.reduce((n, s) => n + s.correct, 0);
  assert.equal(correct, 9 + 3);
  assert.match(stats[0]._id, /^[a-z_]+_[gy]\d+$/);
  const reveals = h.db.all('fact_reveals').reduce((n, s) => n + s.n, 0);
  assert.equal(reveals, total, 'every answer reveals its bottom card once');
  assert.equal(h.db.all('meta').some((m) => m._id === 'rollup_20261015'), true);
  const second = await h.call('cleanup', {});
  assert.equal(second.rollup, null);
  assert.equal(h.db.all('answer_stats').reduce((n, s) => n + s.n, 0), total, 'no double counting');
});

test('anomaly roll-up writes anomaly_daily and alerts when mismatch > 0.5% of free submits', async () => {
  at(15);
  for (let i = 0; i < 10; i++) {
    const run = makeRun(h, { seed: 1000 + i, right: 2 });
    await h.call('submitRun', { clientRunId: `free-run-${String(i).padStart(4, '0')}x`, ...run.event, clientStreak: i === 0 ? 30 : run.streak }, { openid: A });
  }
  h.setNow(Date.UTC(2026, 9, 15, 20, 0, 0)); // 04:00 BJT on the 16th
  const cap = capture();
  let r;
  try { r = await h.call('cleanup', {}); } finally { cap.done(); }
  assert.deepEqual([r.anomalies.mismatch, r.anomalies.freeSubmits], [1, 10]);
  const ev = h.db.all('events').find((e) => e.name === 'anomaly_daily');
  assert.equal(ev.props.mismatch, 1);
  assert.equal(ev.props.dateKey, '20261015');
  assert.ok(cap.errs.some((e) => e.includes('[ALERT]') && e.includes('mismatch')));
});

test('per-fact report rate: > 0.3% of reveals raises an ALERT and a fact_report_daily event', async () => {
  const f = 'f_river_D5';
  const g = 'f_lake_D3';
  h.db.put('fact_reveals', { _id: f, n: 1000 });
  h.db.put('fact_reveals', { _id: g, n: 1000 });
  const now = h.now();
  for (let i = 0; i < 4; i++) h.db.put('fact_reports', { _id: `${f}_u${i}`, factId: f, openid: `u${i}`, ts: now - 1000, status: 'new' });
  for (let i = 0; i < 3; i++) h.db.put('fact_reports', { _id: `${g}_u${i}`, factId: g, openid: `u${i}`, ts: now - 1000, status: 'new' });
  h.db.put('fact_reports', { _id: `${g}_rej`, factId: g, openid: 'rej', ts: now - 1000, status: 'rejected' });
  const cap = capture();
  let r;
  try { r = await h.call('cleanup', {}); } finally { cap.done(); }
  assert.deepEqual(r.flaggedFacts, [f], '4/1000 = 0.4% flagged; 3/1000 = 0.3% (rejected one ignored) is not above');
  assert.ok(cap.errs.some((e) => e.includes('[ALERT]') && e.includes(f)));
  const ev = h.db.all('events').filter((e) => e.name === 'fact_report_daily');
  assert.equal(ev.length, 1);
  assert.deepEqual([ev[0].props.factId, ev[0].props.reports, ev[0].props.reveals], [f, 4, 1000]);
});
