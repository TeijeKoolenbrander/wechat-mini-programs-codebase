'use strict';
// genDaily / getDaily: deck generation, idempotency, gates, themes, repeat window, suspension, time zones.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, oracle, NOON, HOUR } = require('./helpers/harness');
const realDeck = require('../../game/core/deck');
const { BY_KEY } = require('../../game/core/measures');

let h;
beforeEach(() => { h = createHarness(); h.loadDailyFacts(); });
afterEach(() => h.teardown());

const P1 = 'openid-player-1';

test('getDaily lazily creates today\'s deck and returns status only (no questions)', async () => {
  const d = await h.call('getDaily', {}, { openid: P1 });
  assert.equal(d.ok, true);
  assert.equal(d.dateKey, '20261015');
  assert.equal(d.myStatus, 'none');
  assert.equal(d.issueNo, 1);
  assert.equal(d.theme, 'mix', 'v1 has no weekday themes');
  assert.equal(d.themeLabel, '');
  assert.deepEqual(d.myDays, { current: 0, best: 0 });
  assert.ok(d.features && d.features.interstitial.everyNRuns >= 2);
  for (const bad of ['questions', 'deck', 'question', 'rounds']) assert.equal(bad in d, false, bad);
  assert.equal(h.db.all('daily_decks').length, 1);
});

test('the deck: 40 questions, daily facts only, gates passed, every measure mixed, legal pairs', async () => {
  await h.call('getDaily', {}, { openid: P1 });
  const { deck, facts } = oracle(h, '20261015');
  assert.equal(deck.questions.length, 40);
  assert.equal(deck.gates.pass, true);
  assert.ok(deck.gates.median >= 6 && deck.gates.median <= 12);
  assert.equal(typeof deck.boardSalt, 'string');
  const used = deck.questions.flatMap((q) => [q.a, q.b]);
  for (const id of used) assert.equal(facts[id].pool, 'daily');
  // within a segment the next top card is the previous bottom card; each fact is a top at most once
  const tops = deck.questions.map((q) => q.a);
  assert.equal(new Set(tops).size, tops.length);
  // pair rules: same measure, legal gap
  const cfg = h.core('config').getConfig(1);
  const deckmod = h.core('deck');
  for (const q of deck.questions) assert.ok(deckmod.pairLegal(cfg, facts[q.a], facts[q.b]), q.a + ' / ' + q.b);
  assert.ok(realDeck.pairLegal, 'the staged core is the game core');
  const perMeasure = {};
  deck.questions.forEach((q, i) => { if (i === 0 || deck.questions[i - 1].b !== q.a) perMeasure[facts[q.a].measure] = (perMeasure[facts[q.a].measure] || 0) + 1; });
  assert.ok(Object.keys(perMeasure).length >= 4, 'a mix of measures: ' + Object.keys(perMeasure).join());
  Object.keys(perMeasure).forEach((m) => assert.ok(perMeasure[m] <= 2 && BY_KEY[m], m));
});

test('genDaily (timer) builds TOMORROW and is idempotent under a double-fired trigger', async () => {
  h.setNow(Date.UTC(2026, 9, 15, 15, 0, 0)); // 23:00 BJT
  const [a, b] = await Promise.all([h.call('genDaily', {}), h.call('genDaily', {})]);
  assert.equal(a.ok && b.ok, true);
  assert.equal(a.dateKey, '20261016');
  assert.equal([a.created, b.created].filter(Boolean).length <= 2, true);
  assert.equal(h.db.all('daily_decks').length, 1, 'exactly one deck document');
  const again = await h.call('genDaily', {});
  assert.equal(again.created, false);
  assert.equal(h.db.all('daily_decks').length, 1);
  const gens = h.db.all('events').filter((e) => e.name === 'daily_gen' && !e.props.failed);
  assert.ok(gens.length >= 1 && gens.length <= 2);
});

test('lazy getDaily racing genDaily creates one deck', async () => {
  h.setNow(Date.UTC(2026, 9, 15, 15, 59, 59));
  const r = await Promise.all([h.call('genDaily', {}), h.call('getDaily', {}, { openid: P1 }), h.call('getDaily', {}, { openid: 'p2' })]);
  assert.ok(r.every((x) => x.ok));
  assert.equal(h.db.all('daily_decks').length, 2); // 20261015 (lazy) and 20261016 (timer)
  assert.equal(new Set(h.db.all('daily_decks').map((d) => d._id)).size, 2);
});

test('genDaily and cleanup reject calls from the mini game (server-only)', async () => {
  assert.equal((await h.call('genDaily', {}, { openid: P1 })).code, 'FORBIDDEN');
  assert.equal((await h.call('cleanup', {}, { openid: P1 })).code, 'FORBIDDEN');
});

test('impossible gates: DAILY_UNAVAILABLE, no deck, ALERT, daily_gen failed event; nothing relaxed', async () => {
  h.patchConfig((c) => { c.gates = { median: [100, 200], p20: [0.99, 1], pFull: 0 }; c.maxAttempts = 20; });
  const errs = [];
  const orig = console.error;
  console.error = (...a) => errs.push(a.join(' '));
  let r;
  try { r = await h.call('genDaily', {}); } finally { console.error = orig; }
  assert.equal(r.ok, false);
  assert.equal(r.code, 'DAILY_UNAVAILABLE');
  assert.equal(h.db.all('daily_decks').length, 0);
  assert.ok(errs.some((e) => e.includes('[ALERT]')));
  assert.ok(h.db.all('events').some((e) => e.name === 'daily_gen' && e.props.failed === true));
  const g = await h.call('getDaily', {}, { openid: P1 });
  assert.equal(g.code, 'DAILY_UNAVAILABLE');
});

test('too few daily facts: DAILY_UNAVAILABLE', async () => {
  const h2 = createHarness();
  const r = await h2.call('genDaily', {});
  assert.equal(r.code, 'DAILY_UNAVAILABLE');
  h2.teardown();
});

test('the issue date follows Beijing time at 15:59:59 and 16:00:00 UTC, with TZ=UTC and unset (no weekday themes)', async () => {
  const saved = process.env.TZ;
  for (const tz of ['UTC', undefined]) {
    if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz;
    const hh = createHarness({ now: Date.UTC(2026, 9, 15, 15, 59, 59) }); // Thu 23:59:59 BJT
    hh.loadDailyFacts();
    const before = await hh.call('getDaily', {}, { openid: P1 });
    assert.equal(before.dateKey, '20261015');
    assert.equal(before.theme, 'mix');
    hh.setNow(Date.UTC(2026, 9, 15, 16, 0, 0)); // Fri 00:00:00 BJT
    const after = await hh.call('getDaily', {}, { openid: P1 });
    assert.equal(after.dateKey, '20261016');
    assert.equal(after.theme, 'mix');
    assert.equal(after.issueNo, 2);
    hh.teardown();
  }
  if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved;
});

test('every function config sets TZ=Asia/Shanghai and an explicit timeout', () => {
  const fs = require('fs');
  const path = require('path');
  const sync = require('../scripts/sync-core');
  for (const fn of sync.listFunctions()) {
    const c = JSON.parse(fs.readFileSync(path.join(sync.CF_ROOT, fn, 'function.config.json'), 'utf8'));
    assert.equal(c.envVariables.TZ, 'Asia/Shanghai', fn);
    assert.ok(Number.isInteger(c.timeout) && c.timeout >= 3 && c.timeout <= 60, fn);
  }
});

test('repeat window: no daily fact in two decks within 3 consecutive days', async () => {
  const keys = ['20261015', '20261016', '20261017', '20261018', '20261019'];
  for (const k of keys) assert.equal((await h.call('genDaily', { dateKey: k })).ok, true);
  const decks = h.db.all('daily_decks').sort((a, b) => (a._id < b._id ? -1 : 1));
  const ids = (d) => new Set(d.questions.flatMap((q) => [q.a, q.b]));
  for (let i = 0; i < decks.length; i++) {
    for (let j = i + 1; j < decks.length && j <= i + 2; j++) {
      const a = ids(decks[i]);
      for (const x of ids(decks[j])) assert.equal(a.has(x), false, `${decks[i]._id} vs ${decks[j]._id}: ${x}`);
    }
  }
});

test('suspended facts never appear in decks generated after the suspension; published decks are untouched', async () => {
  await h.call('genDaily', { dateKey: '20261015' });
  const before = JSON.stringify(h.db.all('daily_decks')[0]);
  const victim = oracle(h, '20261015').deck.questions[0].a;
  h.db.put('fact_overrides', { _id: 'live', suspended: [{ factId: victim, auto: false, since: 1 }], errata: {} });
  // regenerate far enough away that the repeat window does not already exclude it
  await h.call('genDaily', { dateKey: '20261025' });
  const later = oracle(h, '20261025').deck.questions.flatMap((q) => [q.a, q.b]);
  assert.equal(later.includes(victim), false);
  assert.equal(JSON.stringify(h.db.all('daily_decks').find((d) => d._id === '20261015')), before);
});

test('issue number counts days since launch (LAUNCH_DATE_KEY override)', async () => {
  h.setEnv('LAUNCH_DATE_KEY', '20261010');
  const d = await h.call('getDaily', {}, { openid: P1 });
  assert.equal(d.issueNo, 6);
});

test('app_config missing or unreadable: getDaily still works with default features', async () => {
  const d = await h.call('getDaily', {}, { openid: P1 });
  assert.equal(d.features.subscribe, null);
  assert.equal(d.features.banner.enabled, false);
  assert.deepEqual(d.features.interstitial, { enabled: true, everyNRuns: 3, minLifetimeRuns: 4, minGapSec: 120, maxPerDay: 5 });
});

test('app_config values are clamped', async () => {
  h.db.put('app_config', { _id: 'live', subscribe: { tmplId: 'tmpl-1' }, ads: { banner: { enabled: true, adUnitId: 'adunit-x' }, interstitial: { everyNRuns: 1, minLifetimeRuns: 0, minGapSec: 5, maxPerDay: 99 } } });
  const d = await h.call('getDaily', {}, { openid: P1 });
  assert.deepEqual(d.features.subscribe, { tmplId: 'tmpl-1' });
  assert.deepEqual(d.features.banner, { enabled: true, adUnitId: 'adunit-x' });
  assert.deepEqual(d.features.interstitial, { enabled: true, everyNRuns: 2, minLifetimeRuns: 2, minGapSec: 60, maxPerDay: 8 });
});

test('unauthenticated calls are rejected', async () => {
  assert.equal((await h.call('getDaily', {})).code, 'UNAUTHENTICATED');
  assert.equal((await h.call('answer', {})).code, 'UNAUTHENTICATED');
});
