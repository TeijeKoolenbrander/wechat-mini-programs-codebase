'use strict';
// Closing, 定分 (frozen references), percentile, archive, 加一题, distribution unlock: AC 25, 36-40 (server side).
const S = require('../../../game/core/score');
const { playDay } = require('../helpers/backends');

const T1 = '20261105';
const T2 = '20261106';
const T3 = '20261107';
const T4 = '20261108';
const flat = (x) => JSON.stringify(x);
const posOf = (i) => [0, 1, 2, 3, 4].map((c) => (i * 7 + c * 19) % 101);

module.exports = function archive(T) {
  const { test, assert } = T;

  test('AC 25: references freeze at D+1 00:30 and never move; the percentile appears only after finalizeDay and only from 30 dailies', async (be) => {
    await be.call('alice', 'getDaily', {});
    for (let i = 0; i < 5; i++) await be.seedCrowd(T1, i, 80);
    await playDay(be, 'alice', [10, 30, 50, 70, 90]);
    for (let b = 0; b < 40; b++) {
      be.clock.add(1000);
      await playDay(be, 'bot' + b, posOf(b));
    }
    be.clock.set(be.BJ(T2, 0, 20, 0));
    assert.equal((await be.call('alice', 'getArchiveDay', { dateKey: T1 })).code, 'DAY_OPEN', 'inside the grace window');
    assert.equal((await be.call('alice', 'getDaily', {})).yesterday, null);
    be.clock.set(be.BJ(T2, 0, 31, 0));
    const d = await be.call('alice', 'getDaily', {});
    assert.equal(d.dateKey, T2);
    assert.ok(d.yesterday && d.yesterday.final === true && d.yesterday.dateKey === T1 && d.yesterday.issueNo === 5);
    assert.equal(d.yesterday.pct, null, 'the percentile waits for finalizeDay (AC 25)');
    const day1 = await be.call('alice', 'getArchiveDay', { dateKey: T1 });
    assert.equal(day1.ok, true);
    assert.equal(day1.finals.length, 5);
    assert.equal(day1.mine.total, S.dailyTotal(day1.mine.pos, day1.finals).total);
    assert.equal(d.yesterday.total, day1.mine.total);
    // the crowd moves after closing; the references do not
    for (let i = 0; i < 5; i++) await be.seedCrowd(T1, i, 400, { mean: 5, sd: 2 });
    assert.deepEqual((await be.call('alice', 'getArchiveDay', { dateKey: T1 })).finals, day1.finals);
    assert.equal((await be.call('bot1', 'submitCard', { dateKey: T1, idx: 0, pos: 3 })).code, 'CARD_DONE');
    assert.equal((await be.call('newcomer', 'submitCard', { dateKey: T1, idx: 0, pos: 3 })).code, 'LATE_SUBMIT');

    const f = await be.timer('finalizeDay');
    assert.equal(f.ok, true);
    assert.deepEqual(f.finalized, [T1]);
    const set = await be.setDoc(T1);
    assert.equal(set.finalCount, 41);
    assert.equal(S.histTotal(set.finalHist), 41);
    assert.deepEqual(set.final, day1.finals);
    assert.equal(typeof set.finalizedAt, 'number');
    const d2 = await be.call('alice', 'getDaily', {});
    assert.equal(d2.yesterday.pct, S.percentile(d2.yesterday.total, set.finalHist, 41));
    assert.equal(typeof d2.yesterday.pct, 'number');
    assert.equal((await be.call('alice', 'getArchiveDay', { dateKey: T1 })).mine.pct, d2.yesterday.pct);
    assert.deepEqual((await be.timer('finalizeDay')).finalized, [], 'idempotent');
    assert.deepEqual((await be.setDoc(T1)).finalHist, set.finalHist);
  });

  test('AC 25: below 30 complete dailies the percentile stays hidden', async (be) => {
    await playDay(be, 'alice', [10, 30, 50, 70, 90]);
    await playDay(be, 'bob', [12, 31, 52, 71, 92]);
    be.clock.set(be.BJ(T2, 0, 40, 0));
    assert.deepEqual((await be.timer('finalizeDay')).finalized, [T1]);
    assert.equal((await be.setDoc(T1)).finalCount, 2);
    assert.equal((await be.call('alice', 'getDaily', {})).yesterday.pct, null);
  });

  test('AC 36: getArchive lists closed days newest first with paging; mine only for completed days; open days are hidden', async (be) => {
    await playDay(be, 'alice', [10, 20, 30, 40, 50]);
    await be.call('bob', 'submitCard', { dateKey: T1, idx: 0, pos: 5 });
    be.clock.set(be.BJ(T2, 10, 0, 0));
    await playDay(be, 'alice', [11, 21, 31, 41, 51]);
    be.clock.set(be.BJ(T3, 10, 0, 0));
    await be.call('alice', 'getDaily', {});
    await be.call('alice', 'submitCard', { dateKey: T3, idx: 0, pos: 50 });
    be.clock.set(be.BJ(T4, 0, 10, 0));
    const inGrace = await be.call('alice', 'getArchive', {});
    assert.deepEqual(inGrace.items.map((i) => i.dateKey), [T2, T1], 'T3 is still in its grace window');
    be.clock.set(be.BJ(T4, 10, 0, 0));
    const all = await be.call('alice', 'getArchive', {});
    assert.deepEqual(all.items.map((i) => i.dateKey), [T3, T2, T1]);
    assert.deepEqual(all.items.map((i) => i.issueNo), [7, 6, 5]);
    assert.equal(all.hasMore, false);
    assert.equal(all.items[0].mine, undefined, 'partial day: no mine');
    assert.equal(all.items[1].mine.final, true);
    assert.equal(typeof all.items[2].mine.total, 'number');
    assert.equal(all.bestStreak, 2);
    const bob = await be.call('bob', 'getArchive', {});
    assert.ok(bob.items.every((i) => i.mine === undefined));
    assert.equal(bob.bestStreak, 0);
    const p1 = await be.call('alice', 'getArchive', { limit: 2 });
    assert.deepEqual(p1.items.map((i) => i.dateKey), [T3, T2]);
    assert.equal(p1.hasMore, true);
    const p2 = await be.call('alice', 'getArchive', { limit: 2, before: T2 });
    assert.deepEqual(p2.items.map((i) => i.dateKey), [T1]);
    assert.equal(p2.hasMore, false);
    for (const bad of [{ limit: 0 }, { limit: 'x' }, { before: 'nope' }]) assert.equal((await be.call('alice', 'getArchive', bad)).code, 'INVALID_INPUT');
    assert.equal((await be.call('alice', 'getArchive', { limit: 500 })).ok, true, 'limit is clamped');
  });

  test('AC 36-38: getArchiveDay: DAY_OPEN for today, the grace window and unknown days; review data for closed days', async (be) => {
    await playDay(be, 'alice', [10, 20, 30, 40, 50]);
    await be.call('bob', 'submitCard', { dateKey: T1, idx: 0, pos: 5 });
    be.clock.set(be.BJ(T2, 0, 10, 0));
    assert.equal((await be.call('alice', 'getArchiveDay', { dateKey: T1 })).code, 'DAY_OPEN');
    assert.equal((await be.call('alice', 'getArchiveDay', { dateKey: T2 })).code, 'DAY_OPEN');
    assert.equal((await be.call('alice', 'getArchiveDay', { dateKey: '20260101' })).code, 'DAY_OPEN');
    assert.equal((await be.call('alice', 'getArchiveDay', { dateKey: 'x' })).code, 'INVALID_INPUT');
    be.clock.set(be.BJ(T2, 1, 0, 0));
    const a = await be.call('alice', 'getArchiveDay', { dateKey: T1 });
    assert.equal(a.ok, true);
    assert.equal(a.issueNo, 5);
    assert.equal(a.cards.length, 5);
    assert.ok(!/anchor|hist/.test(flat(a)), 'no histograms (TD-11)');
    assert.equal(a.mine.complete, true);
    assert.equal(a.mine.answered, 5);
    assert.equal(typeof a.mine.total, 'number');
    assert.equal(a.mine.cardScores.length, 5);
    const b = await be.call('bob', 'getArchiveDay', { dateKey: T1 });
    assert.equal(b.mine.complete, false);
    assert.equal(b.mine.total, null);
    assert.deepEqual(b.mine.pos, [5, null, null, null, null]);
    assert.equal((await be.call('carol', 'getArchiveDay', { dateKey: T1 })).mine, null);
  });

  test('AC 39: getBonusCard serves an unanswered card of a closed day, 3 per Beijing day, consumed only when served', async (be) => {
    await be.call('alice', 'getDaily', {});
    for (let i = 0; i < 4; i++) assert.equal((await be.call('alice', 'getBonusCard', {})).code, 'NO_CARD_AVAILABLE', 'launch week: nothing closed yet');
    be.clock.set(be.BJ(T2, 10, 0, 0));
    await be.call('bob', 'getDaily', {});
    be.clock.set(be.BJ(T3, 10, 0, 0));
    await be.call('bob', 'getDaily', {});
    await playDay(be, 'alice', [1, 2, 3, 4, 5], null, T3);
    const seen = [];
    for (let i = 0; i < 3; i++) {
      const r = await be.call('alice', 'getBonusCard', {});
      assert.equal(r.ok, true, flat(r));
      assert.ok([T1, T2].includes(r.dateKey));
      assert.equal(typeof r.final, 'number');
      assert.ok(!/anchor/.test(flat(r)));
      assert.deepEqual(Object.keys(r.card).sort(), ['catLabel', 'itemId', 'left', 'prompt', 'right', 'spectrumId']);
      seen.push(r.card.itemId);
    }
    const lim = await be.call('alice', 'getBonusCard', {});
    assert.equal(lim.code, 'RATE_LIMITED');
    be.clock.set(be.BJ('20261108', 9, 0, 0));
    const next = await be.call('alice', 'getBonusCard', {});
    assert.equal(next.ok, true, 'a new Beijing day');
    // exclude: everything but one item of the closed days
    const keep = be.schedule.days[0][0];
    const exclude = [...be.schedule.days[0], ...be.schedule.days[1]].filter((id) => id !== keep).slice(0, 60);
    const only = await be.call('bob', 'getBonusCard', { exclude });
    assert.equal(only.ok, true);
    assert.ok(!exclude.includes(only.card.itemId));
    assert.equal((await be.call('bob', 'getBonusCard', { exclude: ['bad'] })).code, 'INVALID_INPUT');
  });

  test('AC 39: a card the caller already answered in the daily is never offered', async (be) => {
    await playDay(be, 'alice', [1, 2, 3, 4, 5]);
    be.clock.set(be.BJ(T2, 10, 0, 0));
    await be.call('bob', 'getDaily', {});
    be.clock.set(be.BJ(T3, 10, 0, 0));
    for (let i = 0; i < 3; i++) {
      const r = await be.call('alice', 'getBonusCard', {});
      assert.equal(r.ok, true);
      assert.notEqual(r.dateKey, T1, 'all five cards of T1 are answered');
    }
  });

  test('AC 40 + TD-8: unlockDistribution: open day only answered cards; closed day all five; 20 a day', async (be) => {
    await be.call('alice', 'getDaily', {});
    for (let i = 0; i < 5; i++) await be.seedCrowd(T1, i, 50);
    await be.call('alice', 'submitCard', { dateKey: T1, idx: 0, pos: 40 });
    await be.call('alice', 'submitCard', { dateKey: T1, idx: 1, pos: 41 });
    const u = await be.call('alice', 'unlockDistribution', { dateKey: T1 });
    assert.equal(u.ok, true);
    assert.equal(u.hist.length, 5);
    assert.equal(u.hist[0].length, 21);
    assert.equal(u.hist[2], null);
    assert.equal(u.hist[4], null);
    assert.equal(u.hist[0].reduce((a, b) => a + b, 0), 51);
    assert.ok(!/anchor/.test(flat(u)));
    assert.equal((await be.call('alice', 'unlockDistribution', { dateKey: T2 })).code, 'INVALID_INPUT', 'unpublished / future');
    assert.equal((await be.call('alice', 'unlockDistribution', { dateKey: 'bad' })).code, 'INVALID_INPUT');
    for (let i = 0; i < 19; i++) assert.equal((await be.call('alice', 'unlockDistribution', { dateKey: T1 })).ok, true, 'call ' + (i + 2));
    assert.equal((await be.call('alice', 'unlockDistribution', { dateKey: T1 })).code, 'RATE_LIMITED', 'the 21st');
    assert.equal((await be.call('bob', 'unlockDistribution', { dateKey: T1 })).ok, true, 'per player');
    be.clock.set(be.BJ(T2, 1, 0, 0));
    const closed = await be.call('alice', 'unlockDistribution', { dateKey: T1 });
    assert.equal(closed.ok, true, 'a new Beijing day resets the counter');
    assert.ok(closed.hist.every((h) => Array.isArray(h) && h.length === 21), 'closed day: all five');
  });
};
