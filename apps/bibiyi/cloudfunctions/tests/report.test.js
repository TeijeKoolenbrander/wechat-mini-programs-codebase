'use strict';
// reportFact: fixed reasons, one report per (fact, player), rate limit, auto-suspend at 5 distinct reporters.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, oracle, playDaily } = require('./helpers/harness');

let h;
beforeEach(() => { h = createHarness(); h.loadDailyFacts(); });
afterEach(() => h.teardown());

const FACT = 'f_river_D5';
const FREE_FACT = 'f_river_F3';
const who = (i) => `openid-reporter-${String(i).padStart(3, '0')}`;
const report = (i, extra = {}) => h.call('reportFact', { factId: FACT, reasons: ['value'], where: 'reveal', ...extra }, { openid: who(i) });
const overrides = () => h.db.all('fact_overrides')[0];

test('stores one report per (fact, player); a repeat updates the reasons', async () => {
  assert.deepEqual(await report(1), { ok: true });
  assert.deepEqual(await report(1, { reasons: ['unit', 'source', 'unit'], where: 'result' }), { ok: true });
  const docs = h.db.all('fact_reports');
  assert.equal(docs.length, 1);
  assert.equal(docs[0]._id, `${FACT}_${who(1)}`);
  assert.deepEqual(docs[0].reasons, ['unit', 'source']);
  assert.equal(docs[0].where, 'result');
  assert.equal(docs[0].status, 'new');
  assert.equal(docs[0].contentVersion, 1);
});

test('free-pool facts can be reported too', async () => {
  const r = await h.call('reportFact', { factId: FREE_FACT, reasons: ['name'], where: 'list' }, { openid: who(1) });
  assert.equal(r.ok, true);
});

test('validation: UNKNOWN_FACT, only the six fixed reasons, fixed places, no free text', async () => {
  assert.equal((await report(1, { factId: 'f_nope_1' })).code, 'UNKNOWN_FACT');
  assert.equal((await report(1, { factId: 'v1_f_river_D5' })).code, 'UNKNOWN_FACT', 'doc ids are not fact ids');
  for (const bad of [[], ['bogus'], ['value', 'free text here'], 'value', null, ['value', 'unit', 'name', 'source', 'wording', 'other', 'value']]) {
    assert.equal((await report(1, { reasons: bad })).code, 'INVALID_ACTIONS', JSON.stringify(bad));
  }
  assert.equal((await report(1, { where: 'somewhere' })).code, 'INVALID_ACTIONS');
  assert.equal((await report(1, { factId: '../x' })).code, 'INVALID_ACTIONS');
  assert.equal((await report(1, { dateKey: '2026-10-15' })).code, 'INVALID_ACTIONS');
  assert.equal((await h.call('reportFact', { factId: FACT, reasons: ['value'], where: 'reveal' })).code, 'UNAUTHENTICATED');
  for (const ok of ['value', 'unit', 'name', 'source', 'wording', 'other']) assert.equal((await report(2, { reasons: [ok] })).ok, true);
  const stored = h.db.all('fact_reports')[0];
  assert.equal('text' in stored || 'comment' in stored, false);
  assert.equal(h.db.all('fact_reports').length, 1);
});

test('rate limit: 20 reports per player per day, the 21st stores nothing; resets the next Beijing day', async () => {
  const ids = Array.from({ length: 22 }, (_, i) => `f_river_D${i % 20}`).slice(0, 22);
  const codes = [];
  for (let i = 0; i < 22; i++) {
    const r = await h.call('reportFact', { factId: `f_mountain_D${i % 20}`, reasons: ['value'], where: 'reveal' }, { openid: who(1) });
    codes.push(r.ok ? 'ok' : r.code);
  }
  assert.equal(codes.filter((c) => c === 'ok').length, 20);
  assert.deepEqual(codes.slice(20), ['RATE_LIMITED', 'RATE_LIMITED']);
  assert.equal(h.db.all('fact_reports').length, 20);
  assert.ok(ids.length);
  h.advance(24 * 3600e3);
  assert.equal((await report(1)).ok, true);
  // another player is unaffected
  assert.equal((await report(2)).ok, true);
});

test('4 distinct reporters do NOT suspend; the 5th does, with auto: true', async () => {
  for (let i = 1; i <= 4; i++) await report(i);
  assert.equal(overrides(), undefined);
  await report(5);
  const o = overrides();
  assert.equal(o._id, 'live');
  assert.equal(o.suspended.length, 1);
  assert.equal(o.suspended[0].factId, FACT);
  assert.equal(o.suspended[0].auto, true);
  assert.equal(typeof o.suspended[0].since, 'number');
  await report(6);
  assert.equal(overrides().suspended.length, 1, 'idempotent');
});

test('one player reporting repeatedly never suspends', async () => {
  for (let i = 0; i < 12; i++) await report(1, { reasons: i % 2 ? ['value'] : ['unit'] });
  for (let i = 0; i < 3; i++) await report(2 + i);
  assert.equal(overrides(), undefined);
  assert.equal(h.db.all('fact_reports').length, 4);
});

test('reports older than 7 days do not count toward the 5', async () => {
  for (let i = 1; i <= 3; i++) await report(i);
  h.advance(8 * 86400e3);
  await report(4);
  await report(5);
  await report(6);
  assert.equal(overrides(), undefined, '3 new + 0 recent old = 3');
  await report(7);
  await report(8);
  assert.equal(overrides().suspended.length, 1);
});

test('auto-suspend keeps ops entries and does not touch published decks', async () => {
  h.db.put('fact_overrides', { _id: 'live', suspended: [{ factId: 'f_other', auto: false, since: 1 }], errata: { 20261001: [{ k: 3, factId: 'x', text: '勘误' }] } });
  await h.call('getDaily', {}, { openid: who(50) });
  const deckBefore = JSON.stringify(h.db.all('daily_decks')[0]);
  for (let i = 1; i <= 5; i++) await report(i);
  const o = overrides();
  assert.deepEqual(o.suspended.map((s) => s.factId), ['f_other', FACT]);
  assert.deepEqual(Object.keys(o.errata), ['20261001']);
  assert.equal(JSON.stringify(h.db.all('daily_decks')[0]), deckBefore);
});

test('the report response reveals nothing about suspension, ids or players', async () => {
  for (let i = 1; i <= 4; i++) await report(i);
  const r = await report(5);
  assert.deepEqual(r, { ok: true });
  assert.ok(oracle);
  assert.ok(playDaily);
});
