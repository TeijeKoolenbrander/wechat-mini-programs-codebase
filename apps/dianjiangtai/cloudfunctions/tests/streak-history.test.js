'use strict';
// v1 streaks (spec 8.9, 14.3 step 8, AC 80) and getHistory (AC 82), including the Beijing midnight edges.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, bestActions } = require('./helpers/harness');
const { runId, startDaily, playDaily, sheetOf, releaseAll, allKeys, allStrings } = require('./helpers/fixtures');

// 2026-11-03 12:00 BJT = 04:00 UTC (a Tuesday). noon(n) = noon BJT, n days later.
const T0 = Date.UTC(2026, 10, 3, 4, 0, 0);
const DAY = 86400000;
const noon = (n) => T0 + n * DAY;
const key = (n) => `2026110${3 + n}`;
let h;
beforeEach(() => { h = createHarness({ now: T0 }); });
afterEach(() => h.teardown());

async function playOn(n, openid = 'u', rank = 0) {
  h.setNow(noon(n));
  const r = await playDaily(h, openid, { rank });
  assert.equal(r.ok, true, JSON.stringify(r));
  return r;
}
const stats = (o = 'u') => h.db.all('player_stats').find((p) => p._id === o);
const myStreak = async (o = 'u') => (await h.call('getDaily', {}, { openid: o })).myStreak;

test('consecutive published days: +1 each; bestStreak and daily_results.streak follow; submit returns it', async () => {
  const r1 = await playOn(0);
  assert.deepEqual(r1.streak, { current: 1, best: 1 });
  const r2 = await playOn(1);
  assert.deepEqual(r2.streak, { current: 2, best: 2 });
  const r3 = await playOn(2);
  assert.deepEqual(r3.streak, { current: 3, best: 3 });
  assert.deepEqual(h.db.all('daily_results').map((r) => r.streak).sort(), [1, 2, 3]);
  assert.deepEqual([stats().curStreak, stats().bestStreak, stats().lastDailyDate, stats().totalDailies], [3, 3, key(2), 3]);
  assert.deepEqual(await myStreak(), { current: 3, best: 3 });
});

test('a skipped PUBLISHED day resets to 1; bestStreak is kept (spec edge 27)', async () => {
  await playOn(0);
  await playOn(1);
  h.setNow(noon(2));
  await h.call('getDaily', {}, { openid: 'other' }); // Wed is published, but u does not play
  const r = await playOn(3);
  assert.deepEqual(r.streak, { current: 1, best: 2 });
  assert.equal(h.db.all('daily_results').find((x) => x._id === `${key(3)}_u`).streak, 1);
});

test('a day with NO published seed is skipped, it neither extends nor breaks the streak (spec edge 27)', async () => {
  await playOn(0);
  // day 1: nobody opens the game, so no daily_seeds document exists
  const r = await playOn(2);
  assert.equal(h.db.all('daily_seeds').some((s) => s._id === key(1)), false);
  assert.deepEqual(r.streak, { current: 2, best: 2 });
});

test('streak across the Beijing midnight: 23:59:59 and 00:00:01 are consecutive dates', async () => {
  h.setNow(Date.UTC(2026, 10, 3, 15, 59, 59)); // 23:59:59 BJT on the 3rd
  const s1 = await startDaily(h, 'u');
  const a = await h.call('submitRun', { mode: 'daily', clientRunId: runId(), dateKey: '20261103', actions: s1.actions }, { openid: 'u' });
  assert.equal(a.ok, true);
  h.setNow(Date.UTC(2026, 10, 3, 16, 0, 1)); // 00:00:01 BJT on the 4th
  const b = await playDaily(h, 'u');
  assert.equal(b.ok, true);
  assert.deepEqual(b.streak, { current: 2, best: 2 });
});

test('grace-window submit counts for D and joins up with a D+1 result played earlier in the grace window', async () => {
  h.setNow(Date.UTC(2026, 10, 3, 15, 59, 0)); // 23:59 BJT on the 3rd
  const s1 = await startDaily(h, 'u');
  h.setNow(Date.UTC(2026, 10, 3, 16, 5, 0)); // 00:05 on the 4th: u plays the NEW daily first
  const d2 = await playDaily(h, 'u');
  assert.deepEqual(d2.streak, { current: 1, best: 1 }, 'yesterday is not recorded yet');
  h.setNow(Date.UTC(2026, 10, 3, 16, 10, 0)); // 00:10: now submits yesterday's inside the grace window
  const d1 = await h.call('submitRun', { mode: 'daily', clientRunId: runId(), dateKey: '20261103', actions: s1.actions }, { openid: 'u' });
  assert.equal(d1.ok, true);
  assert.deepEqual(d1.streak, { current: 2, best: 2 });
  assert.equal(h.db.all('daily_results').find((r) => r._id === '20261104_u').streak, 2, 'the later day was re-linked');
  assert.equal(stats().lastDailyDate, '20261104');
  assert.equal(stats().totalDailies, 2);
});

test('a LATE_SUBMIT friendly does not count; duplicate and ALREADY_PLAYED submits do not double count', async () => {
  h.setNow(Date.UTC(2026, 10, 3, 15, 59, 0));
  const s1 = await startDaily(h, 'u');
  h.setNow(Date.UTC(2026, 10, 3, 16, 31, 0)); // 00:31, grace over
  const late = await h.call('submitRun', { mode: 'daily', clientRunId: runId(), dateKey: '20261103', actions: s1.actions }, { openid: 'u' });
  assert.equal(late.code, 'LATE_SUBMIT');
  assert.equal(stats(), undefined, 'no player_stats written');
  const id = runId();
  const s2 = await startDaily(h, 'u');
  const first = await h.call('submitRun', { mode: 'daily', clientRunId: id, dateKey: s2.dateKey, actions: s2.actions }, { openid: 'u' });
  const dup = await h.call('submitRun', { mode: 'daily', clientRunId: id, dateKey: s2.dateKey, actions: s2.actions }, { openid: 'u' });
  const second = await h.call('submitRun', { mode: 'daily', clientRunId: runId(), dateKey: s2.dateKey, actions: s2.actions }, { openid: 'u' });
  assert.deepEqual(dup, first);
  assert.equal(second.code, 'ALREADY_PLAYED');
  assert.deepEqual([stats().curStreak, stats().totalDailies], [1, 1]);
});

test('getDaily.myStreak: alive through today after yesterday, dies when a published date closes unplayed', async () => {
  await playOn(0);
  await playOn(1);
  h.setNow(noon(2));
  assert.deepEqual(await myStreak(), { current: 2, best: 2 }, 'played yesterday, not yet today');
  h.setNow(Date.UTC(2026, 10, 5, 16, 10, 0)); // 00:10 BJT on the 6th: the 4th (last played) is D-2; the 5th (published, unplayed) is still in its grace window
  assert.deepEqual(await myStreak(), { current: 2, best: 2 }, 'the 5th can still be played inside its grace window');
  h.setNow(noon(3) + 2 * DAY); // the 8th, noon: the 5th's window has long closed
  assert.deepEqual(await myStreak(), { current: 0, best: 2 });
});

test('no streak-linked grants: ranking, rows and responses do not depend on the streak', async () => {
  await playOn(0, 'a');
  await playOn(1, 'a');
  await playOn(1, 'b');
  const board = await h.call('getBoard', { kind: 'friend', dateKey: key(1) }, { openid: 'a' });
  assert.equal(board.variant, 'standard');
  const withK = board.rows.filter((r) => r.length >= 5);
  assert.equal(withK.length, 1, 'only the player with streak >= 2 carries k');
  assert.equal(withK[0][4], 2);
  for (const r of board.rows) assert.ok(r.length === 5 || r[4] === undefined);
});

// ---------------- getHistory ----------------
test('getHistory: newest first, own record/band/rarity, best only after the window closes, no spoilers for today', async () => {
  await playOn(0, 'u', 0);
  h.setNow(noon(1));
  await h.call('getDaily', {}, { openid: 'u' }); // today = 4th, unplayed
  const r = await h.call('getHistory', {}, { openid: 'u' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.items.map((i) => i.dateKey), ['20261104', '20261103']);
  const [today, yday] = r.items;
  assert.equal(today.mine, undefined, 'not played today');
  assert.equal(today.best, undefined);
  assert.equal(today.hist, undefined);
  assert.equal(today.status, 'open');
  assert.equal(yday.status, 'closed');
  assert.equal(yday.mine.lineupIdx.length, 5);
  assert.ok(yday.mine.band && yday.mine.band.label);
  assert.equal(yday.best.lineupIdx.length, 5);
  assert.deepEqual(yday.best.record, h.db.all('daily_seeds').find((d) => d._id === '20261103').best.record);
  assert.equal(r.bestStreak, 1);
  const text = JSON.stringify(r);
  assert.doesNotMatch(text, /"seed"|"rounds"|boardSalt|"openid"/);
});

test('getHistory: best appears exactly at D+1 00:30 BJT (00:29:59 hidden, 00:30:00 shown); played-today shows the result', async () => {
  const D = '20261103';
  h.setNow(T0);
  await playDaily(h, 'u');
  h.setNow(Date.UTC(2026, 10, 3, 16, 29, 59)); // 00:29:59 on the 4th
  let it = (await h.call('getHistory', {}, { openid: 'u' })).items.find((i) => i.dateKey === D);
  assert.equal(it.best, undefined);
  assert.equal(it.status, 'open');
  assert.ok(it.mine, 'own result is visible');
  h.setNow(Date.UTC(2026, 10, 3, 16, 30, 0)); // 00:30:00
  it = (await h.call('getHistory', {}, { openid: 'u' })).items.find((i) => i.dateKey === D);
  assert.equal(it.best.lineupIdx.length, 5);
  assert.equal(it.status, 'closed');
});

test('getHistory: at most 30 issues, limit validated, never tomorrow\'s seed, only the caller\'s results', async () => {
  const base = h.db.all('daily_seeds');
  await h.call('getDaily', {}, { openid: 'u' });
  const seed = h.db.all('daily_seeds')[0];
  for (let i = 1; i <= 40; i++) {
    const d = new Date(Date.UTC(2026, 10, 3) - i * DAY).toISOString().slice(0, 10).replace(/-/g, '');
    h.db.put('daily_seeds', { ...seed, _id: d, issueNo: 1 });
  }
  h.db.put('daily_seeds', { ...seed, _id: '20261104' }); // genDaily wrote tomorrow already
  assert.equal(base.length, 0);
  const r = await h.call('getHistory', {}, { openid: 'u' });
  assert.equal(r.items.length, 30);
  assert.equal(r.items[0].dateKey, '20261103', 'tomorrow is not listed');
  assert.equal(r.items[0].mine, undefined);
  assert.equal((await h.call('getHistory', { limit: 5 }, { openid: 'u' })).items.length, 5);
  for (const bad of [0, 31, 1.5, 'x']) assert.equal((await h.call('getHistory', { limit: bad }, { openid: 'u' })).code, 'INVALID_ACTIONS', String(bad));
  assert.equal((await h.call('getHistory', {}, {})).code, 'UNAUTHENTICATED');
  // another player's result never appears
  h.db.put('daily_results', { _id: '20261103_other', dateKey: '20261103', openid: 'other', w: 12, l: 0, lineupIdx: [1, 2, 3, 4, 5] });
  assert.equal((await h.call('getHistory', {}, { openid: 'u' })).items[0].mine, undefined);
});

test('getHistory: distribution only from 30 runs, only once the date is closed or the caller played; no openids', async () => {
  const seed = (await (async () => { await h.call('getDaily', {}, { openid: 'x' }); return h.db.all('daily_seeds')[0]; })());
  h.db.put('daily_seeds', { ...seed, _id: '20261102' });
  const hist = new Array(13).fill(0); hist[7] = 20; hist[9] = 10;
  h.db.put('daily_stats', { _id: '20261102', hist, total: 30 });
  h.db.put('daily_stats', { _id: '20261103', hist, total: 30 });
  const r = await h.call('getHistory', {}, { openid: 'x' });
  const t = r.items.find((i) => i.dateKey === '20261103');
  const y = r.items.find((i) => i.dateKey === '20261102');
  assert.equal(t.hist, undefined, 'open date, not played: no distribution');
  assert.deepEqual(y.hist, hist);
  assert.equal(y.total, 30);
  assert.equal(allKeys(r).includes('openid'), false);
  assert.equal(allStrings(r).includes('x'), false);
});
