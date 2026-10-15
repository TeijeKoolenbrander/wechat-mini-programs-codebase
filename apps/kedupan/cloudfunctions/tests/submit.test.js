'use strict';
// submitCard trust properties: server-side validation, no score tampering, idempotency, windows, streak.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, play, T0, DAY } = require('./helpers/harness');

let h;
beforeEach(() => { h = createHarness({ now: T0 }); });
afterEach(() => h.teardown());

const TODAY = '20261103';
const submit = (openid, idx, pos, extra = {}) => h.call('submitCard', { dateKey: TODAY, idx, pos, ...extra }, { openid });
const stats = (idx, dateKey = TODAY) => h.db.all('daily_card_stats').find((d) => d._id === `${dateKey}_${idx}`);

test('rejects non-integers, out-of-range, wrong types and bad idx/dateKey (AC 15)', async () => {
  await h.call('getDaily', {}, { openid: 'A' });
  for (const pos of [-1, 101, 50.5, '50', null, undefined, NaN, Infinity, [50], { v: 50 }, true]) {
    const r = await submit('A', 0, pos);
    assert.equal(r.code, 'INVALID_INPUT', `pos ${String(pos)}`);
  }
  for (const idx of [-1, 5, 0.5, '0', null]) assert.equal((await submit('A', idx, 50)).code, 'INVALID_INPUT');
  for (const dateKey of ['2026-11-03', '20261303', 20261103, null, undefined]) {
    assert.equal((await h.call('submitCard', { dateKey, idx: 0, pos: 50 }, { openid: 'A' })).code, 'INVALID_INPUT');
  }
  assert.equal((await submit('A', 0, 50, { groupRef: 'nothex' })).code, 'INVALID_INPUT');
  assert.equal((await h.call('submitCard', { dateKey: '20261104', idx: 0, pos: 50 }, { openid: 'A' })).code, 'INVALID_INPUT'); // future
  assert.equal(h.db.all('daily_entries').length, 0);
  assert.equal(stats(0).n, 0);
});

test('identity comes only from the context: no OPENID -> UNAUTHENTICATED; a client-sent openid is ignored', async () => {
  const none = await h.call('submitCard', { dateKey: TODAY, idx: 0, pos: 50 });
  assert.equal(none.code, 'UNAUTHENTICATED');
  const r = await submit('A', 0, 50, { openid: 'victim', OPENID: 'victim', userId: 'victim' });
  assert.equal(r.ok, true);
  assert.deepEqual(h.db.all('daily_entries').map((e) => e._id), [`${TODAY}_A`]);
});

test('no score tampering: score/ref/label/total sent by the client are ignored; the server computes them (PD-3, PD-25)', async () => {
  const r = await submit('A', 0, 30, { score: 100, ref: 30, label: '心有灵犀', total: 500, d: 0, hist: [1], n: 99 });
  assert.equal(r.ok, true);
  const anchor = h.db.all('daily_sets')[0].cards[0].anchor;
  const core = h.mod('submitCard', ['common', 'coreapi.js']);
  // with 0 other players the reference is the anchor (W = 10 prior)
  assert.equal(r.ref, anchor);
  assert.equal(r.score, core.cardScore(Math.abs(30 - anchor)));
  assert.equal(r.n, 1);
  assert.equal(stats(0).n, 1);
  assert.equal(stats(0).hist[30], 1);
});

test('national reference: median with 10 virtual votes at the anchor (PD-4, AC 3)', async () => {
  await h.call('getDaily', {}, { openid: 'seed' });
  const set = h.db.all('daily_sets')[0];
  const anchor = set.cards[0].anchor;
  // 1,000 real positions at 30 dominate the prior
  const st = stats(0);
  st.hist[30] = 1000; st.n = 1000;
  h.db.put('daily_card_stats', st);
  const r = await submit('A', 0, 30);
  assert.equal(r.ref, 30);
  assert.equal(r.score, 100);
  assert.equal(r.label, '心有灵犀');
  assert.equal(r.agreePct, 100);
  assert.notEqual(anchor, 30);
});

test('agreePct is hidden below 30 real answers (AC 16)', async () => {
  const r = await submit('A', 0, 50);
  assert.equal(r.agreePct, null);
});

test('cards must be answered in order (CARD_ORDER) and a second answer returns CARD_DONE with the stored reveal (AC 15)', async () => {
  const skip = await submit('A', 1, 50);
  assert.equal(skip.code, 'CARD_ORDER');
  assert.equal(h.db.all('daily_entries').length, 0);
  const first = await submit('A', 0, 20);
  assert.equal(first.ok, true);
  const again = await submit('A', 0, 99);
  assert.equal(again.code, 'CARD_DONE');
  assert.equal(again.reveal.pos, 20, 'the stored position wins');
  assert.equal(again.reveal.ref, first.ref);
  assert.equal(stats(0).n, 1, 'histogram incremented once');
  assert.equal(stats(0).hist[99], 0);
});

test('two parallel identical submits increment the histogram exactly once (AC 15)', async () => {
  await h.call('getDaily', {}, { openid: 'A' });
  const [a, b] = await Promise.all([submit('A', 0, 55), submit('A', 0, 55)]);
  assert.deepEqual([a, b].map((r) => r.ok === true).sort(), [false, true]);
  assert.ok([a, b].some((r) => r.code === 'CARD_DONE'));
  assert.equal(stats(0).n, 1);
  assert.equal(stats(0).hist[55], 1);
});

test('complete daily: total = sum of the 5 card scores, streak 1, entry flagged complete', async () => {
  const outs = await play(h, 'A', [10, 20, 30, 40, 50]);
  assert.ok(outs.every((o) => o.ok));
  const last = outs[4];
  assert.equal(last.complete, true);
  const sum = outs.reduce((a, o) => a + o.score, 0);
  // the last response total is scored at the CURRENT references, which equal the reveals' when nobody else played
  assert.equal(last.total, sum);
  assert.equal(last.streak, 1);
  const e = h.db.all('daily_entries')[0];
  assert.equal(e.complete, true);
  assert.deepEqual(e.pos, [10, 20, 30, 40, 50]);
  const day = await h.call('getDaily', {}, { openid: 'A' });
  assert.equal(day.mine.complete, true);
  assert.equal(day.mine.total, sum);
});

test('Beijing midnight / grace edges: D 23:59 start accepts cards until D+1 00:30, LATE_SUBMIT at 00:31 (AC 20)', async () => {
  h.setNow(h.bjt(2026, 11, 3, 23, 59, 0));
  assert.equal((await submit('A', 0, 10)).ok, true);
  assert.equal((await submit('B', 0, 10)).ok, true);
  h.setNow(h.bjt(2026, 11, 4, 0, 0, 0));
  // the new Beijing day: yesterday's dateKey is now in its grace window
  assert.equal((await submit('A', 1, 20)).ok, true);
  h.setNow(h.bjt(2026, 11, 4, 0, 29, 59));
  assert.equal((await submit('A', 2, 30)).ok, true);
  h.setNow(h.bjt(2026, 11, 4, 0, 30, 0));
  const late = await submit('A', 3, 40);
  assert.equal(late.code, 'LATE_SUBMIT');
  h.setNow(h.bjt(2026, 11, 4, 0, 31, 0));
  assert.equal((await submit('B', 1, 40)).code, 'LATE_SUBMIT');
  const a = h.db.all('daily_entries').find((e) => e._id === `${TODAY}_A`);
  assert.equal(a.complete, false);
  assert.deepEqual(a.pos, [10, 20, 30, null, null]);
});

test('grace window needs a first card on D: a player who never started D gets LATE_SUBMIT at 00:10', async () => {
  await h.call('getDaily', {}, { openid: 'seed' });
  h.setNow(h.bjt(2026, 11, 4, 0, 10, 0));
  assert.equal((await submit('C', 0, 10)).code, 'LATE_SUBMIT');
  assert.equal(h.db.all('daily_entries').length, 0);
});

test('getDaily with dateKey=yesterday works only in the grace window and for a started daily', async () => {
  await submit('A', 0, 10);
  h.setNow(h.bjt(2026, 11, 4, 0, 5, 0));
  const y = await h.call('getDaily', { dateKey: TODAY }, { openid: 'A' });
  assert.equal(y.ok, true);
  assert.equal(y.dateKey, TODAY);
  assert.equal(y.mine.answered, 1);
  assert.equal((await h.call('getDaily', { dateKey: TODAY }, { openid: 'B' })).code, 'LATE_SUBMIT');
  h.setNow(h.bjt(2026, 11, 4, 0, 40, 0));
  assert.equal((await h.call('getDaily', { dateKey: TODAY }, { openid: 'A' })).code, 'LATE_SUBMIT');
});

test('incomplete days never appear on boards or in streaks (AC 20)', async () => {
  await play(h, 'A', [10, 20, 30]);
  await play(h, 'B', [10, 20, 30, 40, 50]);
  const board = await h.call('getFriendBoard', { dateKey: TODAY }, { openid: 'B' });
  assert.equal(board.rows.length, 1);
  assert.equal(h.db.all('player_stats').filter((p) => p._id === 'A').length, 0);
});

test('streak (PD-17, AC 80): consecutive +1; skipped published day resets; unpublished day skipped; no double count', async () => {
  const day = async (d, openid, doPlay = true) => {
    h.setNow(h.bjt(2026, 11, d, 12));
    await h.call('getDaily', {}, { openid: 'warm' }); // publishes the day
    if (doPlay) return (await play(h, openid, [50, 50, 50, 50, 50]))[4];
    return null;
  };
  assert.equal((await day(3, 'S')).streak, 1);
  assert.equal((await day(4, 'S')).streak, 2);
  // 5 not played by S, but published (warm played it) -> streak resets
  await day(5, 'S', false);
  assert.equal((await day(6, 'S')).streak, 1);
  // day 7 never published (nobody opens the game); day 8 is published: unpublished day is skipped
  assert.equal((await day(8, 'S')).streak, 2);
  const ps = h.db.all('player_stats').find((p) => p._id === 'S');
  assert.equal(ps.bestStreak, 2);
  assert.equal(ps.totalDays, 4);
  // duplicate completion does not double-count
  const dup = await h.call('submitCard', { dateKey: '20261108', idx: 4, pos: 50 }, { openid: 'S' });
  assert.equal(dup.code, 'CARD_DONE');
  assert.equal(h.db.all('player_stats').find((p) => p._id === 'S').totalDays, 4);
  // myStreak shows the streak all of the next day until it is complete
  h.setNow(h.bjt(2026, 11, 9, 9));
  await h.call('getDaily', {}, { openid: 'warm' });
  assert.equal((await h.call('getDaily', {}, { openid: 'S' })).myStreak.current, 2);
  h.setNow(h.bjt(2026, 11, 10, 9));
  await h.call('getDaily', {}, { openid: 'warm' });
  assert.equal((await h.call('getDaily', {}, { openid: 'S' })).myStreak.current, 0);
});

test('grace-window completion counts for D', async () => {
  await play(h, 'A', [1, 2, 3, 4]);
  h.setNow(h.bjt(2026, 11, 4, 0, 10, 0));
  const r = await submit('A', 4, 5);
  assert.equal(r.ok, true);
  assert.equal(r.streak, 1);
  assert.equal(h.db.all('player_stats')[0].lastCompleteDate, TODAY);
});

test('fast flag is observe-only: written when card 5 follows card 1 within 6 s, never changes scores/streak (AC 82)', async () => {
  const outs = await play(h, 'F', [10, 20, 30, 40, 50]); // clock frozen: 0 ms between cards
  const an = h.db.all('anomalies');
  assert.equal(an.length, 1);
  assert.equal(an[0].kind, 'fast');
  assert.equal(an[0]._id, `F_${TODAY}_fast`);
  assert.equal(outs[4].streak, 1);
  // a slow player is not flagged
  for (let i = 0; i < 5; i++) { h.advance(5000); await submit('G', i, 10 * (i + 1)); }
  assert.equal(h.db.all('anomalies').length, 1);
  // same positions give the same score whether flagged or not
  const f = h.db.all('daily_entries').find((e) => e.openid === 'F');
  const g = h.db.all('daily_entries').find((e) => e.openid === 'G');
  assert.deepEqual(f.pos, g.pos);
});

test('rate limited: more than 60 submits a minute -> RATE_LIMITED', async () => {
  let last;
  for (let i = 0; i < 62; i++) last = await submit('R', 0, 50);
  assert.equal(last.code, 'RATE_LIMITED');
});

test('group block only for a groupRef the caller belongs to; otherwise ignored (spec 11.2)', async () => {
  const ref = 'aaaaaaaaaaaaaaaa';
  h.db.put('group_members', { _id: 'OG_B', openGId: 'OG', openid: 'B', groupRef: ref, firstSeen: TODAY, lastSeen: TODAY });
  await submit('B', 0, 70);
  const notMember = await submit('A', 0, 60, { groupRef: ref });
  assert.equal(notMember.ok, true);
  assert.equal(notMember.group, undefined);
  h.db.put('group_members', { _id: 'OG_A', openGId: 'OG', openid: 'A2', groupRef: ref, firstSeen: TODAY, lastSeen: TODAY });
  const member = await submit('A2', 0, 60, { groupRef: ref });
  assert.deepEqual(member.group, { median: 70, n: 1, dots: [70] });
  assert.doesNotMatch(JSON.stringify(member), /"B"/);
});
