'use strict';
// getHistory: the list, and the issue detail whose full deck unlocks only after D+1 00:30 BJT.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, oracle, playDaily } = require('./helpers/harness');

let h;
beforeEach(() => { h = createHarness(); h.loadDailyFacts(); });
afterEach(() => h.teardown());

const A = 'openid-hist-alice1';
const B = 'openid-hist-bob0002';
const at = (d, hr = 4, min = 0) => h.setNow(Date.UTC(2026, 9, d, hr, min, 0));

test('list: last <= 30 published issues, my 连对 or none, today flagged, bests', async () => {
  for (let d = 1; d <= 34; d++) {
    at(d);
    await h.call('genDaily', { dateKey: `202610${String(d).padStart(2, '0')}` });
  }
  at(15);
  await playDaily(h, A, { right: 6 });
  at(16);
  await h.call('getDaily', {}, { openid: A });
  await h.call('startRun', { mode: 'daily', clientRunId: 'hist-run-0001' }, { openid: A });
  const r = await h.call('getHistory', {}, { openid: A });
  assert.equal(r.ok, true);
  assert.equal(r.items.length, 16, 'only published dates up to today (Oct 1-16)');
  assert.equal(r.items[0].dateKey, '20261016');
  assert.equal(r.items[0].isToday, true);
  assert.equal(r.items[0].status, 'open');
  assert.equal(r.items[1].dateKey, '20261015');
  assert.deepEqual(r.items[1].mine, { n: 6 });
  assert.equal(r.items[1].status, 'done');
  assert.equal(r.items[2].mine, null);
  assert.equal(r.items[2].status, 'none');
  assert.deepEqual([r.bestDays, r.bestDaily], [1, 6]);
  at(31);
  assert.equal((await h.call('getHistory', {}, { openid: A })).items.length, 30);
  for (const it of r.items) assert.deepEqual(Object.keys(it).sort(), ['dateKey', 'isToday', 'issueNo', 'mine', 'status', 'theme', 'themeLabel']);
});

test('SPOILER LOCK: the deck with values and my answers appears only after D+1 00:30 BJT', async () => {
  await playDaily(h, A, { right: 5 });
  const o = oracle(h, '20261015');
  const labels = Object.values(o.facts).map((f) => f.label);
  const check = async (when, unlocked) => {
    h.setNow(when);
    const r = await h.call('getHistory', { dateKey: '20261015' }, { openid: A });
    assert.equal(r.ok, true);
    assert.equal(r.locked, !unlocked);
    if (!unlocked) {
      assert.equal(r.deck, null);
      const json = JSON.stringify(r);
      for (const l of labels) assert.equal(json.includes(`"${l}"`), false);
    }
    return r;
  };
  await check(Date.UTC(2026, 9, 15, 8, 0, 0), false); // same day
  await check(Date.UTC(2026, 9, 15, 16, 0, 1), false); // 00:00:01 next day
  await check(Date.UTC(2026, 9, 15, 16, 29, 59), false); // 00:29:59
  await check(Date.UTC(2026, 9, 15, 16, 30, 0), false); // exactly 00:30 is still inside the window
  const open = await check(Date.UTC(2026, 9, 15, 16, 31, 0), true); // 00:31
  assert.equal(open.deck.length, 40);
  const q1 = open.deck[0];
  assert.equal(q1.k, 1);
  assert.equal(q1.top.label, o.facts[o.deck.questions[0].a].label);
  assert.ok(q1.top.valueText && q1.bottom.valueText && q1.bottom.sourceText);
  assert.equal(q1.answer, o.correct(1));
  assert.ok(q1.answerVerb.length > 0);
  assert.equal(open.deck.slice(0, 5).every((q) => q.mine === 'correct'), true);
  assert.equal(open.deck[5].mine, 'miss');
  assert.equal(open.deck[6].mine, 'unanswered');
  assert.deepEqual([open.mine.streak, open.mine.missK], [5, 6]);
  // a player who did not take part sees the deck without answers
  const bob = await h.call('getHistory', { dateKey: '20261015' }, { openid: B });
  assert.equal(bob.mine, null);
  assert.equal(bob.deck.every((q) => q.mine === null), true);
});

test('distribution only at >= 30 results; errata lines come from fact_overrides', async () => {
  await playDaily(h, A, { right: 2 });
  const d = () => h.call('getHistory', { dateKey: '20261015' }, { openid: A });
  assert.equal((await d()).stats, null);
  const st = h.db.all('daily_stats')[0];
  const hist = new Array(41).fill(0);
  hist[0] = 10; hist[3] = 20; hist[40] = 1;
  h.db.put('daily_stats', { ...st, hist, total: 31 });
  const s = (await d()).stats;
  assert.equal(s.total, 31);
  assert.deepEqual(s.buckets.map((b) => b.count), [10, 20, 0, 0, 0, 0, 0, 1]);
  h.db.put('fact_overrides', { _id: 'live', suspended: [], errata: { 20261015: [{ k: 7, factId: 'x', text: '勘误：该数据已更正' }], 20261001: [{ k: 1, factId: 'y', text: 'other day' }] } });
  assert.deepEqual((await d()).errata, [{ k: 7, text: '勘误：该数据已更正' }]);
});

test('unknown, future or malformed issues', async () => {
  await h.call('getDaily', {}, { openid: A });
  assert.equal((await h.call('getHistory', { dateKey: '20250101' }, { openid: A })).code, 'DECK_NOT_FOUND');
  await h.call('genDaily', { dateKey: '20261016' });
  assert.equal((await h.call('getHistory', { dateKey: '20261016' }, { openid: A })).code, 'DECK_NOT_FOUND', 'tomorrow is not history yet');
  assert.equal((await h.call('getHistory', { dateKey: 'yesterday' }, { openid: A })).code, 'INVALID_ACTIONS');
});

test('missing daily content is an INTERNAL error with an ALERT, not a crash', async () => {
  await playDaily(h, A, { right: 1 });
  const o = oracle(h, '20261015');
  h.db.cols.daily_facts.delete(`v1_${o.deck.questions[10].a}`);
  h.mod('getHistory', 'common/pool').clearCaches();
  h.setNow(Date.UTC(2026, 9, 15, 17, 0, 0));
  const r = await h.call('getHistory', { dateKey: '20261015' }, { openid: A });
  assert.equal(r.code, 'INTERNAL');
});
