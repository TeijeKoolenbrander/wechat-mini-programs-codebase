'use strict';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./helpers/harness');

const T0 = Date.UTC(2026, 10, 3, 4, 0, 0); // 2026-11-03 12:00 BJT
let h;
beforeEach(() => { h = createHarness({ now: T0 }); });
afterEach(() => h.teardown());

const bankEntry = (id, over = {}) => {
  // a bank entry whose stored best lineup really scores 12-0 in the fake sim
  const gens = ['g_wei7', 'g_wei6', 'g_wei5', 'g_wei4', 'g_wei3']; // power 10+9+8+7+6 = 40 -> 12-0
  const slots = ['zhugong', 'junshi', 'xianfeng', 'mengjiang', 'shoujiang'];
  return {
    _id: id, seed: 1000 + Number(id.replace(/\D/g, '') || 0), contentVersion: 1, configVersion: 1, gateVersion: 1,
    best: { lineup: slots.map((slot, i) => ({ slot, generalId: gens[i] })), record: { w: 12, l: 0 } },
    gates: { optimal: { w: 12, l: 0 }, greedyRate: 0.02, randomRate: 0, K: 400, gateVersion: 1, relaxed: false },
    used: false, importedAt: 1, ...over,
  };
};

test('getDaily: identical rounds/issueNo for two users, no seed/best/battle data leaked (AC 19)', async () => {
  const a = await h.call('getDaily', {}, { openid: 'userA' });
  const b = await h.call('getDaily', {}, { openid: 'userB' });
  assert.equal(a.ok, true);
  assert.deepEqual(a.rounds, b.rounds);
  assert.equal(a.issueNo, b.issueNo);
  assert.equal(a.dateKey, '20261103');
  assert.equal(a.myStatus, 'none');
  assert.equal(a.rounds.length, 5);
  assert.equal(a.serverNow, T0);
  const keys = Object.keys(a).sort();
  assert.deepEqual(keys, ['dateKey', 'issueNo', 'ok', 'rounds', 'serverNow', 'myStatus'].sort());
  assert.doesNotMatch(JSON.stringify(a), /"seed"|"best"|battle|boardSalt|lineup/);
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
  const r = await h.call('genDaily', { Type: 'Timer' }, {});
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
  for (const i of [1, 2, 3]) h.db.put('daily_seed_bank', bankEntry(`b${i}`));
  const results = await Promise.all([
    h.call('genDaily', { Type: 'Timer' }, {}),
    h.call('genDaily', { Type: 'Timer' }, {}),
    h.call('genDaily', { Type: 'Timer' }, {}),
  ]);
  assert.ok(results.every((r) => r.ok));
  assert.equal(results.filter((r) => r.created).length, 1);
  assert.equal(h.db.all('daily_seeds').length, 1);
  const used = h.db.all('daily_seed_bank').filter((b) => b.used);
  assert.equal(used.length, 1, 'losing writers roll back and consume no bank entry');
  assert.equal(used[0].usedFor, '20261104');
  assert.equal(h.db.all('daily_seeds')[0].source, 'bank');
  // sequential re-fire is a no-op too
  const again = await h.call('genDaily', { Type: 'Timer' }, {});
  assert.equal(again.created, false);
  assert.equal(h.db.all('daily_seed_bank').filter((b) => b.used).length, 1);
});

test('genDaily races the lazy getDaily path: one document, one bank entry', async () => {
  h.setNow(Date.UTC(2026, 10, 3, 15, 0, 0)); // 23:00 BJT on the 3rd
  for (const i of [1, 2]) h.db.put('daily_seed_bank', bankEntry(`b${i}`));
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

test('bank path: skips entries with other content/config/gate versions, re-verifies 12-0, marks used (AC 54)', async () => {
  h.db.put('daily_seed_bank', bankEntry('b1', { contentVersion: 2 }));
  h.db.put('daily_seed_bank', bankEntry('b2', { gateVersion: 0 }));
  h.db.put('daily_seed_bank', bankEntry('b3', { configVersion: 9 }));
  const weak = bankEntry('b4');
  weak.best.lineup[0].generalId = 'g_wei0'; weak.best.lineup[1].generalId = 'g_wei1'; // no longer scores 12-0 -> skipped by the cheap re-check
  h.db.put('daily_seed_bank', weak);
  h.db.put('daily_seed_bank', bankEntry('b5'));
  const r = await h.call('genDaily', {}, {});
  assert.equal(r.source, 'bank');
  const doc = h.db.all('daily_seeds')[0];
  assert.equal(doc.seed, bankEntry('b5').seed);
  assert.equal(doc.source, 'bank');
  const byId = Object.fromEntries(h.db.all('daily_seed_bank').map((b) => [b._id, b]));
  assert.equal(byId.b5.used, true);
  assert.equal(byId.b5.usedFor, '20261104');
  for (const id of ['b1', 'b2', 'b3', 'b4']) assert.equal(byId[id].used, false);
});

test('bank low-water warning (< 7 entries) and daily_gen event carries bankLeft', async () => {
  for (const i of [1, 2]) h.db.put('daily_seed_bank', bankEntry(`b${i}`));
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  try { await h.call('genDaily', {}, {}); } finally { console.warn = orig; }
  assert.ok(warns.some((w) => /seed bank low: 1 entries left/.test(w)), warns.join('|'));
  assert.equal(h.db.all('events').find((e) => e.name === 'daily_gen').props.bankLeft, 1);
});

test('live fallback: stops at the first accepted candidate, never exceeds 50 attempts', async () => {
  global.__DJ_GATES_LOG = [];
  global.__DJ_GATES = (seed) => global.__DJ_GATES_LOG.length === 7; // 7th candidate passes
  await h.call('genDaily', {}, {});
  const doc = h.db.all('daily_seeds')[0];
  assert.equal(doc.attempts, 7);
  assert.equal(doc.gates.relaxed, false);
  assert.equal(doc.source, 'live');
});

test('live fallback: no candidate passes -> relaxed seed that still reaches 12-0, alert logged, daily still opens', async () => {
  global.__DJ_GATES_LOG = [];
  global.__DJ_GATES = () => false;
  const errs = [];
  const orig = console.error;
  console.error = (...a) => errs.push(a.join(' '));
  try { await h.call('genDaily', {}, {}); } finally { console.error = orig; }
  const doc = h.db.all('daily_seeds')[0];
  assert.equal(doc.attempts, 50);
  assert.equal(doc.gates.relaxed, true);
  assert.ok(errs.some((e) => /ALERT.*relaxed/.test(e)));
  assert.equal(doc.best.record.w, 12);
});

test('live fallback: relaxed picks a candidate that reaches optimal 12-0 when one exists', async () => {
  global.__DJ_GATES_LOG = [];
  global.__DJ_GATES = () => false;
  global.__DJ_GATES_REACH12 = (seed) => global.__DJ_GATES_LOG.length === 3;
  const orig = console.error;
  console.error = () => {};
  try { await h.call('genDaily', {}, {}); } finally { console.error = orig; }
  const doc = h.db.all('daily_seeds')[0];
  assert.equal(doc.seed, global.__DJ_GATES_LOG[2]);
  assert.equal(doc.gates.relaxed, true);
});

test('live loop honours the 70% time budget read from function.config.json (AC 53)', async () => {
  const cfg = h.mod('genDaily') && require(require('path').join(h.root, 'genDaily', 'function.config.json'));
  const budget = cfg.timeout * 1000 * 0.7;
  global.__DJ_GATES_LOG = [];
  global.__DJ_GATES = () => { h.advance(budget / 4 + 1); return false; }; // each candidate costs 25% of the budget
  const orig = console.error;
  console.error = () => {};
  try { await h.call('genDaily', {}, {}); } finally { console.error = orig; }
  const doc = h.db.all('daily_seeds')[0];
  assert.equal(doc.attempts, 4, 'stops once 70% of the configured timeout is used');
  assert.ok(doc.attempts < 50);
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
