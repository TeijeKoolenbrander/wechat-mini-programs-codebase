'use strict';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, OPTIMAL_SEEDS, CV, CFG, GATE } = require('./helpers/harness');

const T0 = Date.UTC(2026, 10, 3, 4, 0, 0); // 2026-11-03 12:00 BJT
let h;
beforeEach(() => { h = createHarness({ now: T0 }); });
afterEach(() => h.teardown());

// Bank entries use real seeds whose optimal lineup (found by the real search) scores 12-0.
const bankEntry = (id, i = 0, over = {}) => {
  const f = OPTIMAL_SEEDS[i];
  return {
    _id: id, seed: f.seed, contentVersion: CV, configVersion: CFG, gateVersion: GATE,
    best: { lineup: f.lineup, record: { w: 12, l: 0 } },
    gates: { optimal: { w: 12, l: 0 }, greedyRate: 0.02, randomRate: 0, K: 400, gateVersion: GATE, relaxed: false },
    used: false, importedAt: 1, ...over,
  };
};

test('getDaily: identical issueNo/variant for two users, NO rounds, no seed/best/battle data leaked (AC 19, 86)', async () => {
  const a = await h.call('getDaily', {}, { openid: 'userA' });
  const b = await h.call('getDaily', {}, { openid: 'userB' });
  assert.equal(a.ok, true);
  assert.equal(a.rounds, undefined);
  assert.equal(a.issueNo, b.issueNo);
  assert.equal(a.variant, b.variant);
  assert.equal(a.variant, 'standard'); // 2026-11-03 is a Tuesday
  assert.equal(a.dateKey, '20261103');
  assert.equal(a.myStatus, 'none');
  assert.equal(a.serverNow, T0);
  assert.deepEqual(a.myStreak, { current: 0, best: 0 });
  const keys = Object.keys(a).sort();
  assert.deepEqual(keys, ['dateKey', 'features', 'issueNo', 'myStatus', 'myStreak', 'ok', 'serverNow', 'variant']);
  assert.doesNotMatch(JSON.stringify(a), /"seed"|"best":{|battle|boardSalt|lineup|faction|fallback/);
  assert.equal(h.db.all('daily_seeds').length, 1, 'lazy creation happens once');
});

test('getDaily without OPENID in the context is rejected (identity is never client-supplied)', async () => {
  const r = await h.call('getDaily', { openid: 'forged' }, {});
  assert.equal(r.ok, false);
  assert.equal(r.code, 'UNAUTHENTICATED');
});

test('date key comes from core date.js even when the runtime TZ is UTC (AC 20, 66)', async () => {
  const prevTz = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    h.setNow(Date.UTC(2026, 10, 3, 15, 59, 59)); // 23:59:59 BJT on the 3rd
    assert.equal((await h.call('getDaily', {}, { openid: 'u' })).dateKey, '20261103');
    h.setNow(Date.UTC(2026, 10, 3, 16, 0, 0)); // 00:00:00 BJT on the 4th
    assert.equal((await h.call('getDaily', {}, { openid: 'u' })).dateKey, '20261104');
  } finally {
    if (prevTz === undefined) delete process.env.TZ; else process.env.TZ = prevTz;
  }
});

test('genDaily writes the NEXT day, only for server/timer calls', async () => {
  const denied = await h.call('genDaily', {}, { openid: 'someClient' });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, 'FORBIDDEN');
  const r = await h.call('genDaily', { Type: 'Timer', TriggerName: 'test' }, {});
  assert.equal(r.ok, true);
  assert.equal(r.dateKey, '20261104');
  const doc = h.db.all('daily_seeds')[0];
  assert.equal(doc._id, '20261104');
  assert.equal(doc.source, 'live');
  assert.equal(doc.rounds.length, 5);
  assert.equal(doc.boardSalt.length, 32);
  assert.ok(doc.attempts >= 1 && typeof doc.genMs === 'number');
  assert.equal(doc.gates.relaxed, false);
  assert.equal(h.db.all('events').filter((e) => e.name === 'daily_gen').length, 1);
});

test('genDaily double-fire: concurrent invocations create one document and use one bank entry (AC 54, edge 23)', async () => {
  for (const i of [0, 1, 2]) h.db.put('daily_seed_bank', bankEntry(`b${i}`, i));
  const results = await Promise.all([
    h.call('genDaily', { Type: 'Timer', TriggerName: 'test' }, {}),
    h.call('genDaily', { Type: 'Timer', TriggerName: 'test' }, {}),
    h.call('genDaily', { Type: 'Timer', TriggerName: 'test' }, {}),
  ]);
  assert.ok(results.every((r) => r.ok), JSON.stringify(results));
  assert.equal(results.filter((r) => r.created).length, 1);
  assert.equal(h.db.all('daily_seeds').length, 1);
  const used = h.db.all('daily_seed_bank').filter((b) => b.used);
  assert.equal(used.length, 1, 'losing writers roll back and consume no bank entry');
  assert.equal(used[0].usedFor, '20261104');
  assert.equal(h.db.all('daily_seeds')[0].source, 'bank');
  const again = await h.call('genDaily', { Type: 'Timer', TriggerName: 'test' }, {});
  assert.equal(again.created, false);
  assert.equal(h.db.all('daily_seed_bank').filter((b) => b.used).length, 1);
});

test('genDaily races the lazy getDaily path: one document, one bank entry', async () => {
  h.setNow(Date.UTC(2026, 10, 3, 15, 0, 0)); // 23:00 BJT on the 3rd
  for (const i of [0, 1]) h.db.put('daily_seed_bank', bankEntry(`b${i}`, i));
  const [g, d] = await Promise.all([
    h.call('genDaily', { dateKey: '20261103' }, {}),
    h.call('getDaily', {}, { openid: 'u1' }),
  ]);
  assert.equal(g.ok, true);
  assert.equal(d.ok, true);
  assert.equal(d.dateKey, '20261103');
  assert.equal(h.db.all('daily_seeds').length, 1);
  assert.equal(h.db.all('daily_seed_bank').filter((x) => x.used).length, 1);
});

test('bank is the primary path: next unused entry in _id order, version-matched, re-verified 12-0, marked used (AC 54)', async () => {
  h.db.put('daily_seed_bank', bankEntry('b1', 0, { contentVersion: CV + 7 }));
  h.db.put('daily_seed_bank', bankEntry('b2', 0, { gateVersion: 0 }));
  h.db.put('daily_seed_bank', bankEntry('b3', 0, { configVersion: 9 }));
  h.db.put('daily_seed_bank', bankEntry('b4', 0, { used: true }));
  // b5: the stored best belongs to another seed -> does not score 12-0 on this seed -> skipped by the cheap re-check
  const weak = bankEntry('b5', 1);
  const roster = require(require('path').join(require('../scripts/sync-core').DEFAULT_CORE, 'content')).getContent(CV).generals;
  const weakest = roster.map((g) => [g.id, Object.values(g.stats).reduce((x, y) => x + y, 0)]).sort((x, y) => x[1] - y[1]).slice(0, 5);
  weak.best = { lineup: OPTIMAL_SEEDS[2].lineup.map((l, i) => ({ slot: l.slot, generalId: weakest[i][0] })), record: { w: 12, l: 0 } }; // claims 12-0 but plays badly
  h.db.put('daily_seed_bank', weak);
  h.db.put('daily_seed_bank', bankEntry('b6', 3));
  h.db.put('daily_seed_bank', bankEntry('b7', 4));
  global.__DJ_GATES_LOG = [];
  const r = await h.call('genDaily', {}, {});
  assert.equal(r.source, 'bank');
  assert.deepEqual(global.__DJ_GATES_LOG, [], 'no live generation when the bank has a usable entry');
  const doc = h.db.all('daily_seeds')[0];
  assert.equal(doc.seed, OPTIMAL_SEEDS[3].seed);
  assert.equal(doc.source, 'bank');
  assert.equal(doc.rounds.length, 5);
  assert.ok(doc.rounds.every((x) => Array.isArray(x.fallback)), 'rounds carry the fallback tokens for the seedless client');
  const byId = Object.fromEntries(h.db.all('daily_seed_bank').map((b) => [b._id, b]));
  assert.equal(byId.b6.used, true);
  assert.equal(byId.b6.usedFor, '20261104');
  for (const id of ['b1', 'b2', 'b3', 'b5', 'b7']) assert.equal(byId[id].used, false, id);
  delete global.__DJ_GATES_LOG;
});

test('low-bank warning (< 10 days left) in the logs and bankLeft on the daily_gen event', async () => {
  for (const i of [0, 1, 2]) h.db.put('daily_seed_bank', bankEntry(`b${i}`, i));
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  try { await h.call('genDaily', {}, {}); } finally { console.warn = orig; }
  assert.ok(warns.some((w) => /seed bank low: 2 entries left/.test(w)), warns.join('|'));
  assert.equal(h.db.all('events').find((e) => e.name === 'daily_gen').props.bankLeft, 2);
  for (let i = 0; i < 12; i++) h.db.put('daily_seed_bank', bankEntry(`c${i}`, i % 8));
  const warns2 = [];
  console.warn = (...a) => warns2.push(a.join(' '));
  try { await h.call('genDaily', { dateKey: '20261105' }, {}); } finally { console.warn = orig; }
  assert.equal(warns2.filter((w) => /bank low/.test(w)).length, 0);
});

test('live is the last resort: stops at the first accepted candidate', async () => {
  global.__DJ_GATES_LOG = [];
  h.patchGates(() => global.__DJ_GATES_LOG.length === 7); // the log is pushed before the predicate runs
  const r = await h.call('genDaily', {}, {});
  assert.equal(r.ok, true);
  const doc = h.db.all('daily_seeds')[0];
  assert.equal(doc.attempts, 7);
  assert.equal(doc.source, 'live');
  assert.equal(doc.gates.relaxed, false);
  assert.equal(doc.rounds.length, 5);
  assert.equal(doc.best.lineup.length, 5);
  delete global.__DJ_GATES_LOG;
});

test('live failure: NO seed is published (no relaxed seeds), ALERT logged, nothing stored', async () => {
  global.__DJ_GATES_LOG = [];
  h.patchGates(() => false);
  const errs = [];
  const orig = console.error;
  console.error = (...a) => errs.push(a.join(' '));
  let r;
  try { r = await h.call('genDaily', {}, {}); } finally { console.error = orig; }
  assert.equal(r.ok, false);
  assert.equal(r.code, 'DAILY_UNAVAILABLE');
  assert.equal(global.__DJ_GATES_LOG.length, 50, 'tries at most 50 candidates');
  assert.equal(h.db.all('daily_seeds').length, 0);
  assert.ok(errs.some((e) => /ALERT.*seed bank/.test(e)));
  assert.equal(h.db.all('events').find((e) => e.name === 'daily_gen').props.failed, true);
  delete global.__DJ_GATES_LOG;
});

test('live loop honours the 70% time budget read from function.config.json (AC 53)', async () => {
  const cfg = require(require('path').join(h.root, 'genDaily', 'function.config.json'));
  const budget = cfg.timeout * 1000 * 0.7;
  global.__DJ_GATES_LOG = [];
  h.patchGates(() => { h.advance(budget / 4 + 1); return false; }); // each candidate costs 25% of the budget
  const orig = console.error;
  console.error = () => {};
  let r;
  try { r = await h.call('genDaily', {}, {}); } finally { console.error = orig; }
  assert.equal(r.code, 'DAILY_UNAVAILABLE');
  assert.equal(global.__DJ_GATES_LOG.length, 4, 'stops once 70% of the configured timeout is used');
  delete global.__DJ_GATES_LOG;
});

test('every function sets TZ=Asia/Shanghai and an explicit timeout; timers have the right cron', () => {
  const fs = require('fs');
  const path = require('path');
  const sync = require('../scripts/sync-core');
  for (const fn of sync.listFunctions()) {
    const c = JSON.parse(fs.readFileSync(path.join(sync.CF_ROOT, fn, 'function.config.json'), 'utf8'));
    assert.equal(c.envVariables.TZ, 'Asia/Shanghai', fn);
    assert.ok(Number.isInteger(c.timeout) && c.timeout >= 5, fn);
  }
  const t = (fn) => JSON.parse(fs.readFileSync(path.join(sync.CF_ROOT, fn, 'config.json'), 'utf8')).triggers;
  assert.equal(t('genDaily').length, 1);
  assert.equal(t('genDaily')[0].config, '0 0 23 * * * *');
  assert.equal(t('cleanup').length, 1);
  assert.equal(t('cleanup')[0].config, '0 0 4 * * * *');
});
