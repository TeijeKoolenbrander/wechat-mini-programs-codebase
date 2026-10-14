'use strict';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./helpers/harness');

const T0 = Date.UTC(2026, 10, 3, 20, 0, 0); // 2026-11-04 04:00 BJT
const DAY = 86400000;
let h;
beforeEach(() => { h = createHarness({ now: T0 }); });
afterEach(() => h.teardown());

// cutoff: 180 days before 2026-11-04 BJT is 2026-05-08
function seedData() {
  const old = T0 - 181 * DAY;
  const fresh = T0 - 179 * DAY;
  h.db.put('runs', { _id: 'old_run', submittedAt: old });
  h.db.put('runs', { _id: 'new_run', submittedAt: fresh });
  h.db.put('daily_starts', { _id: 'old_start', startedAt: old });
  h.db.put('daily_starts', { _id: 'new_start', startedAt: fresh });
  h.db.put('daily_results', { _id: 'old_res', submittedAt: old });
  h.db.put('daily_results', { _id: 'new_res', submittedAt: fresh });
  h.db.put('challenges', { _id: 'old_ch', createdAt: old });
  h.db.put('challenges', { _id: 'new_ch', createdAt: fresh });
  h.db.put('events', { _id: 'old_ev', ts: old });
  h.db.put('events', { _id: 'new_ev', ts: fresh });
  h.db.put('group_members', { _id: 'old_gm', lastSeen: '20260507' });
  h.db.put('group_members', { _id: 'edge_gm', lastSeen: '20260508' });
  h.db.put('group_members', { _id: 'new_gm', lastSeen: '20261101' });
  h.db.put('daily_stats', { _id: '20250101', hist: new Array(13).fill(0), total: 0 });
  h.db.put('rate_limits', { _id: 'rl_old', expireAt: T0 - 1 });
  h.db.put('rate_limits', { _id: 'rl_new', expireAt: T0 + 1000 });
}
const ids = (c) => h.db.all(c).map((d) => d._id).sort();

test('180-day retention deletes old rows, keeps recent rows and daily_stats (AC 57)', async () => {
  seedData();
  const r = await h.call('cleanup', { Type: 'Timer' }, {});
  assert.equal(r.ok, true);
  for (const c of ['runs', 'daily_starts', 'daily_results', 'challenges', 'events']) {
    assert.deepEqual(ids(c), ['new_' + { runs: 'run', daily_starts: 'start', daily_results: 'res', challenges: 'ch', events: 'ev' }[c]], c);
  }
  assert.deepEqual(ids('group_members'), ['edge_gm', 'new_gm'], 'lastSeen older than 180 days only');
  assert.deepEqual(ids('daily_stats'), ['20250101'], 'aggregates are kept');
  assert.deepEqual(ids('rate_limits'), ['rl_new']);
  assert.equal(r.removed.runs, 1);
});

test('idempotent: a second run deletes nothing more', async () => {
  seedData();
  await h.call('cleanup', {}, {});
  const before = JSON.stringify(h.db.cols && Object.keys(h.db.cols).map((c) => ids(c)));
  const r2 = await h.call('cleanup', {}, {});
  assert.equal(Object.values(r2.removed).reduce((a, b) => a + b, 0), 0);
  assert.equal(JSON.stringify(Object.keys(h.db.cols).map((c) => ids(c))), before);
});

test('deletes in batches (the server removes <= 1000 per call)', async () => {
  for (let i = 0; i < 2500; i++) h.db.put('events', { _id: 'e' + i, ts: T0 - 200 * DAY });
  const r = await h.call('cleanup', {}, {});
  assert.equal(r.removed.events, 2500);
  assert.equal(h.db.all('events').length, 0);
});

test('cleanup is server-only: a client call is rejected and deletes nothing', async () => {
  seedData();
  const r = await h.call('cleanup', {}, { openid: 'someClient' });
  assert.equal(r.code, 'FORBIDDEN');
  assert.ok(ids('runs').includes('old_run'));
});
