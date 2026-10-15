'use strict';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, play, T0 } = require('./helpers/harness');

let h;
beforeEach(() => { h = createHarness({ now: T0 }); });
afterEach(() => h.teardown());

const TODAY = '20261103';
const dailyOf = (openid, extra = {}) => h.call('getDaily', extra, { openid });

test('getDaily: same issue and cards for two users; lazily creates exactly one daily_sets doc (AC 12, 23)', async () => {
  const [a, b] = await Promise.all([dailyOf('A'), dailyOf('B')]);
  assert.equal(a.ok, true);
  assert.equal(a.dateKey, TODAY);
  assert.equal(a.issueNo, 3);
  assert.deepEqual(a.cards, b.cards);
  assert.equal(a.cards.length, 5);
  assert.equal(h.db.all('daily_sets').length, 1);
  assert.equal(h.db.all('daily_card_stats').length, 5);
  assert.equal(h.db.all('item_usage').length, 5);
});

test('getDaily never returns anchors, histograms or refs for unanswered cards (AC 13)', async () => {
  const r = await dailyOf('A');
  const s = JSON.stringify(r);
  assert.doesNotMatch(s, /anchor|hist/);
  assert.deepEqual(r.refs, [null, null, null, null, null]);
  assert.deepEqual(r.mine.pos, [null, null, null, null, null]);
  await h.call('submitCard', { dateKey: TODAY, idx: 0, pos: 40 }, { openid: 'A' });
  const r2 = await dailyOf('A');
  assert.equal(typeof r2.refs[0], 'number');
  assert.deepEqual(r2.refs.slice(1), [null, null, null, null]);
  assert.equal(r2.mine.answered, 1);
  assert.doesNotMatch(JSON.stringify(r2), /anchor/);
});

test('genDaily: tomorrow, idempotent on double fire, FORBIDDEN with an OPENID (AC 23)', async () => {
  const forbidden = await h.call('genDaily', {}, { openid: 'A' });
  assert.equal(forbidden.code, 'FORBIDDEN');
  const [x, y] = await Promise.all([h.call('genDaily', {}), h.call('genDaily', {})]);
  assert.equal(x.dateKey, '20261104');
  assert.equal(h.db.all('daily_sets').filter((d) => d._id === '20261104').length, 1);
  assert.equal([x, y].filter((r) => r.created).length, 1);
});

test('schedule exhausted: auto path picks 5 unused items from different categories, logs an alert', async () => {
  h.setEnv('LAUNCH_DATE_KEY', '20200101'); // issue number far beyond the 80-day fake schedule
  const logs = [];
  const orig = console.error;
  console.error = (...a) => logs.push(a.join(' '));
  try {
    const r = await dailyOf('A');
    assert.equal(r.ok, true);
    const set = h.db.all('daily_sets')[0];
    assert.equal(set.source, 'auto');
    assert.equal(new Set(set.cards.map((c) => c.cat)).size, 5);
    assert.equal(new Set(set.cards.map((c) => c.spectrumId)).size, 5);
    assert.ok(logs.some((l) => l.includes('[ALERT]')));
  } finally { console.error = orig; }
});

test('timezone: Beijing date key at 15:59:59 and 16:00:00 UTC, with TZ unset and TZ=UTC (AC 22)', async () => {
  const savedTz = process.env.TZ;
  try {
    for (const tz of [undefined, 'UTC']) {
      if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz;
      h.setNow(Date.UTC(2026, 10, 3, 15, 59, 59));
      assert.equal((await dailyOf('A')).dateKey, '20261103');
      h.setNow(Date.UTC(2026, 10, 3, 16, 0, 0));
      assert.equal((await dailyOf('A')).dateKey, '20261104');
    }
  } finally { if (savedTz === undefined) delete process.env.TZ; else process.env.TZ = savedTz; }
});

test('every function config sets TZ=Asia/Shanghai and an explicit timeout (AC 22)', () => {
  const fs = require('fs');
  const path = require('path');
  const sync = require('../scripts/sync-core');
  for (const fn of sync.listFunctions()) {
    const c = JSON.parse(fs.readFileSync(path.join(sync.CF_ROOT, fn, 'function.config.json'), 'utf8'));
    assert.equal(c.envVariables.TZ, 'Asia/Shanghai', fn);
    assert.ok(c.timeout >= 5, fn);
  }
});

test('ops replaces a card in the console: next getDaily shows it, earlier answers stay valid (AC 24)', async () => {
  await dailyOf('A');
  await play(h, 'A', [10, 20]);
  const set = h.db.all('daily_sets')[0];
  const newCard = { ...set.cards[1], prompt: '换牌', itemId: 's039i01', anchor: 70 };
  h.db.put('daily_sets', { ...set, cards: set.cards.map((c, i) => (i === 1 ? newCard : c)), edits: [{ idx: 1, at: 1 }] });
  const r = await dailyOf('A');
  assert.equal(r.cards[1].prompt, '换牌');
  assert.deepEqual(r.mine.pos.slice(0, 2), [10, 20]);
  assert.doesNotMatch(JSON.stringify(r.cards), /anchor/);
});

test('getDaily features come from app_config; hidden when absent', async () => {
  assert.equal((await dailyOf('A')).features.subscribeTmplId, null);
  const store = h.mod('getDaily', ['common', 'store.js']);
  store.resetAppConfigCache();
  h.db.put('app_config', { _id: 'live', subscribe: { tmplId: 'TPL1' }, ads: { banner: { enabled: false } } });
  assert.equal((await dailyOf('A')).features.subscribeTmplId, 'TPL1');
});
