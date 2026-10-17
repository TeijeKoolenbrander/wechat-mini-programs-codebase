'use strict';
// Daily flow: AC 12, 13, 15, 16, 20, 22, 23, 24, 25, 68, 80 (server side).
const S = require('../../../game/core/score');
const { playDay, content } = require('../helpers/backends');

const T1 = '20261105';
const T2 = '20261106';
const T3 = '20261107';
const flat = (x) => JSON.stringify(x);

module.exports = function daily(T) {
  const { test, assert } = T;

  test('AC 12: two users on the same Beijing date get the same issue and the same 5 cards (the schedule)', async (be) => {
    const a = await be.call('alice', 'getDaily', {});
    const b = await be.call('bob', 'getDaily', {});
    assert.equal(a.ok, true);
    assert.equal(a.dateKey, T1);
    assert.equal(a.issueNo, 5);
    assert.equal(b.issueNo, 5);
    assert.deepEqual(a.cards, b.cards);
    assert.deepEqual(a.cards.map((c) => c.itemId), be.schedule.days[4]);
    assert.equal((await be.setDoc(T1)).source, 'schedule');
    assert.equal(a.closesAt, be.BJ(T2, 0, 30, 0));
    assert.equal(a.serverNow, be.clock.now());
  });

  test('AC 13: getDaily never returns anchors, histograms or refs of unanswered cards', async (be) => {
    await be.call('alice', 'getDaily', {});
    await be.seedCrowd(T1, 0, 200);
    await be.seedCrowd(T1, 1, 200);
    const before = await be.call('alice', 'getDaily', {});
    assert.deepEqual(before.refs, [null, null, null, null, null]);
    assert.equal(before.mine.total, null);
    assert.ok(!/anchor|hist/.test(flat(before)));
    assert.equal(before.groupRefs, null);
    await be.call('alice', 'submitCard', { dateKey: T1, idx: 0, pos: 40 });
    const after = await be.call('alice', 'getDaily', {});
    assert.equal(typeof after.refs[0], 'number');
    assert.deepEqual(after.refs.slice(1), [null, null, null, null]);
    assert.equal(after.mine.reveals[0].pos, 40);
    assert.equal(after.mine.reveals[1], null);
    assert.equal(after.divisiveIdx, null);
    assert.ok(!/anchor|hist/.test(flat(after)));
    assert.deepEqual(Object.keys(after.cards[0]).sort(), ['catLabel', 'itemId', 'left', 'prompt', 'right', 'spectrumId']);
    // the anchor is stored server side only
    assert.equal(typeof (await be.setDoc(T1)).cards[0].anchor, 'number');
  });

  test('AC 14/15: submitCard validation: non-integer, out of range, wrong order, second answer, future day', async (be) => {
    await be.call('alice', 'getDaily', {});
    const call = (d) => be.call('alice', 'submitCard', { dateKey: T1, idx: 0, pos: 50, ...d });
    for (const bad of [{ pos: 50.5 }, { pos: -1 }, { pos: 101 }, { pos: '50' }, { idx: 5 }, { idx: -1 }, { dateKey: '2026-11-05' }, { dateKey: '20261399' }]) {
      assert.equal((await call(bad)).code, 'INVALID_INPUT', flat(bad));
    }
    assert.equal((await call({ idx: 2 })).code, 'CARD_ORDER');
    assert.equal(await be.entryDoc(T1, 'alice'), null, 'rejected calls write nothing');
    const ok = await call({ pos: 0 });
    assert.equal(ok.ok, true);
    assert.equal(ok.pos, 0);
    const again = await call({ pos: 90 });
    assert.equal(again.ok, false);
    assert.equal(again.code, 'CARD_DONE');
    assert.equal(again.reveal.pos, 0, 'the stored position wins');
    assert.equal((await be.entryDoc(T1, 'alice')).pos[0], 0);
    assert.equal(await be.statsN(T1, 0), 1, 'CARD_DONE does not count again');
    assert.equal((await be.call('alice', 'submitCard', { dateKey: T2, idx: 1, pos: 5 })).code, 'INVALID_INPUT', 'future day');
    assert.equal((await be.call('alice', 'submitCard', { idx: 1, pos: 5 })).code, 'INVALID_INPUT');
    assert.equal((await be.call('alice', 'submitCard', null)).code, 'INVALID_INPUT');
  });

  test('AC 15: the histogram n grows by exactly 1 per first answer (parallel identical calls, parallel different users)', async (be) => {
    await be.call('alice', 'getDaily', {});
    const [r1, r2] = await Promise.all([be.call('alice', 'submitCard', { dateKey: T1, idx: 0, pos: 33 }), be.call('alice', 'submitCard', { dateKey: T1, idx: 0, pos: 33 })]);
    assert.deepEqual([r1.ok, r2.ok].sort(), [false, true]);
    assert.equal([r1, r2].find((r) => !r.ok).code, 'CARD_DONE');
    assert.equal(await be.statsN(T1, 0), 1);
    const h = await be.hist(T1, 0);
    assert.equal(h[33], 1);
    assert.equal(S.histTotal(h), 1);
    const users = Array.from({ length: 12 }, (_x, i) => 'u' + i);
    await Promise.all(users.map((u) => be.call(u, 'submitCard', { dateKey: T1, idx: 0, pos: 60 })));
    assert.equal(await be.statsN(T1, 0), 13);
    assert.equal((await be.hist(T1, 0))[60], 12);
  });

  test('AC 16: the reveal carries ref, score, label; agree % only from 30 answers; refs are the live nation reference', async (be) => {
    await be.call('alice', 'getDaily', {});
    await be.seedCrowd(T1, 0, 10, { mean: 50, sd: 3 });
    const a = await be.call('alice', 'submitCard', { dateKey: T1, idx: 0, pos: 50 });
    assert.equal(a.agreePct, null);
    assert.equal(a.n, 11);
    assert.equal(a.small, true);
    await be.seedCrowd(T1, 1, 60, { mean: 50, sd: 3 });
    await be.call('alice', 'submitCard', { dateKey: T1, idx: 1, pos: 50 });
    const set = await be.setDoc(T1);
    const bob = await be.call('bob', 'getDaily', {});
    assert.equal(bob.mine.reveals[1], null);
    const mine = await be.call('alice', 'getDaily', {});
    const rev = mine.mine.reveals[1];
    assert.ok(rev.agreePct >= 90, 'tight crowd: ' + rev.agreePct);
    assert.equal(rev.small, false);
    assert.equal(rev.ref, S.nationRef(await be.hist(T1, 1), set.cards[1].anchor));
    assert.equal(rev.score, S.cardScore(Math.abs(50 - rev.ref)));
  });

  test('AC 19/16: complete day: total, band, cardScores, refs and divisiveIdx come from the core; streak starts at 1', async (be) => {
    await be.call('alice', 'getDaily', {});
    for (let i = 0; i < 5; i++) await be.seedCrowd(T1, i, 80);
    const rs = await playDay(be, 'alice', [10, 30, 50, 70, 90]);
    const last = rs[4];
    assert.equal(last.complete, true);
    assert.equal(last.cardScores.length, 5);
    assert.equal(last.total, last.cardScores.reduce((a, b) => a + b, 0));
    assert.equal(last.band, S.dayBand(last.total));
    assert.deepEqual(last.streak, { current: 1, best: 1 });
    assert.ok(last.divisiveIdx >= 0 && last.divisiveIdx <= 4);
    const d = await be.call('alice', 'getDaily', {});
    assert.equal(d.mine.complete, true);
    assert.equal(d.mine.total, last.total);
    assert.equal(d.divisiveIdx, last.divisiveIdx);
    assert.deepEqual(d.myStreak, { current: 1, best: 1 });
    const e = await be.entryDoc(T1, 'alice');
    assert.equal(typeof e.completeAt, 'number');
    assert.equal(e.streak, 1);
  });

  test('AC 20: windows: grace until D+1 00:30 only for a day started on D; the boundary is exact; the device clock never matters', async (be) => {
    await be.call('grace', 'getDaily', {});
    for (let i = 0; i < 4; i++) await be.call('grace', 'submitCard', { dateKey: T1, idx: i, pos: 50 });
    await be.call('edge', 'getDaily', {});
    for (let i = 0; i < 4; i++) await be.call('edge', 'submitCard', { dateKey: T1, idx: i, pos: 50 });
    be.clock.set(be.BJ(T2, 0, 10, 0));
    const ok = await be.call('grace', 'submitCard', { dateKey: T1, idx: 4, pos: 20 });
    assert.equal(ok.ok, true, 'finishing inside the grace window');
    assert.equal(ok.complete, true);
    assert.equal((await be.call('newbie', 'submitCard', { dateKey: T1, idx: 0, pos: 20 })).code, 'LATE_SUBMIT', 'not started on D');
    assert.equal((await be.call('newbie', 'getDaily', { dateKey: T1 })).ok, true, 'yesterday is still readable inside the grace window');
    be.clock.set(be.BJ(T2, 0, 29, 59) + 999);
    assert.equal((await be.call('edge', 'submitCard', { dateKey: T1, idx: 4, pos: 20 })).ok, true, '00:29:59.999 is still open');
    be.clock.set(be.BJ(T2, 0, 30, 0));
    await be.call('alice', 'getDaily', {}); // makes sure T2 exists
    assert.equal((await be.call('late', 'submitCard', { dateKey: T1, idx: 0, pos: 20 })).code, 'LATE_SUBMIT', '00:30:00.000 is closed');
    assert.equal((await be.call('alice', 'getDaily', { dateKey: T1 })).code, 'INVALID_INPUT', 'closed days go through getArchiveDay');
  });

  test('AC 22: the day key is the Beijing date whatever the process TZ is (UTC, Los Angeles, unset)', async (be) => {
    const saved = process.env.TZ;
    try {
      for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Shanghai', undefined]) {
        if (tz === undefined) delete process.env.TZ;
        else process.env.TZ = tz;
        // 15:59:59 UTC on Nov 5 is 23:59:59 in Beijing on Nov 5; 16:00:00 UTC is Nov 6 00:00:00 Beijing
        be.clock.set(Date.UTC(2026, 10, 5, 15, 59, 59));
        assert.equal((await be.call('tz-' + String(tz), 'getDaily', {})).dateKey, T1, 'TZ=' + tz);
        be.clock.set(Date.UTC(2026, 10, 5, 16, 0, 0));
        const d = await be.call('tz-' + String(tz), 'getDaily', {});
        assert.equal(d.dateKey, T2, 'TZ=' + tz);
        assert.equal(d.closesAt, Date.UTC(2026, 10, 6, 16, 30, 0));
      }
    } finally {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    }
  });

  test('AC 23: genDaily is idempotent, forbidden for clients, and racing lazy getDaily calls create one set', async (be) => {
    const g1 = await be.timer('genDaily');
    assert.deepEqual({ ok: g1.ok, dateKey: g1.dateKey, created: g1.created, source: g1.source }, { ok: true, dateKey: T2, created: true, source: 'schedule' });
    const g2 = await be.timer('genDaily');
    assert.deepEqual({ ok: g2.ok, dateKey: g2.dateKey, created: g2.created }, { ok: true, dateKey: T2, created: false });
    assert.equal((await be.call('alice', 'genDaily', {})).code, 'FORBIDDEN');
    for (const t of ['finalizeDay', 'sweepRounds', 'cleanup']) assert.equal((await be.call('alice', t, {})).code, 'FORBIDDEN', t);
    const ds = await Promise.all(['a', 'b', 'c', 'd', 'e', 'f'].map((u) => be.call(u, 'getDaily', {})));
    ds.forEach((d) => assert.equal(d.ok, true));
    ds.forEach((d) => assert.deepEqual(d.cards, ds[0].cards));
    assert.equal(await be.count('daily_sets'), 2, 'today + tomorrow, no duplicates');
    const before = (await be.setDoc(T1)).boardSalt;
    assert.match(before, /^[0-9a-f]{32}$/);
    await be.call('g', 'getDaily', {});
    assert.equal((await be.setDoc(T1)).boardSalt, before, 'the set is never recreated');
    assert.deepEqual(await be.hist(T1, 0), S.emptyHist());
  });

  test('AC 23: a fresh day with no genDaily is created by the first getDaily; before launch there is nothing (DAILY_UNAVAILABLE)', { date: '20261031' }, async (be) => {
    const d = await be.call('alice', 'getDaily', {});
    assert.equal(d.code, 'DAILY_UNAVAILABLE');
    assert.equal((await be.call('alice', 'submitCard', { dateKey: '20261031', idx: 0, pos: 5 })).code, 'DAILY_UNAVAILABLE');
    assert.equal((await be.timer('genDaily')).created, true, 'tomorrow is launch day');
  });

  test('AC 24: replacing a card keeps the index, resets its histogram, and the new card scores against the new anchor', async (be) => {
    const d0 = await be.call('alice', 'getDaily', {});
    await be.call('alice', 'submitCard', { dateKey: T1, idx: 0, pos: 10 });
    await be.call('alice', 'submitCard', { dateKey: T1, idx: 1, pos: 10 });
    await be.call('alice', 'submitCard', { dateKey: T1, idx: 2, pos: 10 });
    assert.equal(await be.statsN(T1, 2), 1);
    const set = await be.setDoc(T1);
    const used = new Set(be.schedule.days.flat());
    const fresh = content.itemIds.find((id) => !used.has(id) && content.itemIndex[id].spectrum.id !== set.cards[2].spectrumId);
    await be.replaceCard(T1, 2, fresh);
    assert.equal(await be.statsN(T1, 2), 0);
    assert.deepEqual(await be.hist(T1, 2), S.emptyHist());
    const d1 = await be.call('bob', 'getDaily', {});
    assert.equal(d1.cards[2].itemId, fresh);
    assert.equal(d1.cards[0].itemId, d0.cards[0].itemId);
    assert.deepEqual((await be.setDoc(T1)).edits.map((e) => [e.idx, e.to]), [[2, fresh]]);
    const r = await be.call('bob', 'submitCard', { dateKey: T1, idx: 0, pos: 50 });
    assert.equal(r.ok, true);
  });

  test('AC 80: streak: consecutive published days count; an unpublished day is skipped; a missed published day resets', async (be) => {
    const day = async (key, hour) => {
      be.clock.set(be.BJ(key, hour || 10, 0, 0));
      const rs = await playDay(be, 'sam', [10, 20, 30, 40, 50], null, key);
      return rs[4];
    };
    assert.deepEqual((await day(T1)).streak, { current: 1, best: 1 });
    assert.deepEqual((await day(T2)).streak, { current: 2, best: 2 });
    assert.deepEqual((await day(T3)).streak, { current: 3, best: 3 });
    // 20261108 is never opened by anyone (unpublished); sam plays 20261109: the chain holds
    assert.deepEqual((await day('20261109')).streak, { current: 4, best: 4 });
    // 20261110 is published (another player opens it) but sam misses it
    be.clock.set(be.BJ('20261110', 12, 0, 0));
    await be.call('other', 'getDaily', {});
    be.clock.set(be.BJ('20261111', 9, 0, 0));
    const morning = await be.call('sam', 'getDaily', {});
    assert.deepEqual(morning.myStreak, { current: 0, best: 4 }, 'a published day closed without a complete daily');
    assert.deepEqual((await day('20261111')).streak, { current: 1, best: 4 });
  });

  test('AC 80: yesterday\'s streak is shown all of today until today completes', async (be) => {
    await playDay(be, 'sam', [10, 20, 30, 40, 50]);
    be.clock.set(be.BJ(T2, 9, 0, 0));
    assert.deepEqual((await be.call('sam', 'getDaily', {})).myStreak, { current: 1, best: 1 });
  });

  test('AC 68: an openid in the event is never trusted; identity is the context only', async (be) => {
    await be.call('alice', 'getDaily', { openid: 'victim', OPENID: 'victim', userInfo: { openId: 'victim' } });
    const r = await be.call('alice', 'submitCard', { dateKey: T1, idx: 0, pos: 44, openid: 'victim', OPENID: 'victim' });
    assert.equal(r.ok, true);
    assert.ok(await be.entryDoc(T1, 'alice'));
    assert.equal(await be.entryDoc(T1, 'victim'), null);
  });

  test('daily: the auto path builds distinct, valid days when no schedule is shipped (idempotent, no repeats)', { noSchedule: true }, async (be) => {
    const seen = new Set();
    for (const key of [T1, T2, T3]) {
      be.clock.set(be.BJ(key, 10, 0, 0));
      const d = await be.call('alice', 'getDaily', {});
      assert.equal(d.ok, true);
      assert.equal((await be.setDoc(key)).source, 'auto');
      d.cards.forEach((c) => {
        assert.ok(!seen.has(c.itemId), 'repeat ' + c.itemId);
        seen.add(c.itemId);
      });
      assert.equal(new Set(d.cards.map((c) => c.spectrumId)).size, 5);
    }
  });
};
