'use strict';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, dailyScenario, gidNext, T0, DAY } = require('./helpers/harness');

let h;
beforeEach(() => { h = createHarness(); });
afterEach(() => h.teardown());

const bank = (n, extra = {}) => h.seedBank(Array.from({ length: n }, (_, i) => ({ pool: 'daily', seq: i + 1, wordIdx: 10 + i * 3, ...extra })));
const docs = (c) => h.db.all(c);
const captureWarnings = async (fn) => {
  const out = { warn: [], error: [] };
  const o = { warn: console.warn, error: console.error };
  console.warn = (...a) => out.warn.push(a.join(' '));
  console.error = (...a) => out.error.push(a.join(' '));
  try { out.result = await fn(); } finally { Object.assign(console, o); }
  return out;
};

test('genDaily publishes the next BJT date from the lowest-seq unused entry and marks it used (AC 56, 57)', async () => {
  bank(5);
  const r = await h.call('genDaily', {}); // timer-style call: no openid; nextday of 20261103
  assert.deepEqual([r.ok, r.dateKey, r.created], [true, '20261104', true]);
  const d = docs('daily_puzzles');
  assert.equal(d.length, 1);
  assert.equal(d[0]._id, '20261104');
  assert.equal(d[0].source, 'bank');
  assert.equal(d[0].warmups.length, 6);
  assert.match(d[0].boardSalt, /^[0-9a-f]{32}$/);
  const used = docs('answer_bank').filter((b) => b.used);
  assert.equal(used.length, 1);
  assert.equal(used[0].seq, 1);
  assert.equal(used[0].usedFor, '20261104');
  assert.equal(d[0].answerRef, used[0]._id);
  assert.equal(docs('daily_stats').length, 1);
});

test('genDaily is idempotent: a double fire makes one document and consumes one entry (AC 56)', async () => {
  bank(5);
  await h.call('genDaily', { dateKey: '20261104' });
  const r2 = await h.call('genDaily', { dateKey: '20261104' });
  assert.equal(r2.created, false);
  assert.equal(docs('daily_puzzles').length, 1);
  assert.equal(docs('answer_bank').filter((b) => b.used).length, 1);
});

test('concurrent genDaily + lazy getDaily race: still one document, one entry consumed (AC 56)', async () => {
  bank(5);
  const rs = await Promise.all([
    h.call('genDaily', { dateKey: '20261103' }),
    h.call('getDaily', {}, { openid: 'u1' }),
    h.call('getDaily', {}, { openid: 'u2' }),
    h.call('genDaily', { dateKey: '20261103' }),
  ]);
  assert.ok(rs.every((r) => r.ok), JSON.stringify(rs));
  assert.equal(docs('daily_puzzles').length, 1);
  assert.equal(docs('answer_bank').filter((b) => b.used).length, 1);
});

test('genDaily skips entries from another vocabVersion / gateVersion and retired ones', async () => {
  h.seedBank([
    { pool: 'daily', seq: 1, wordIdx: 10, vocabVersion: 2 },
    { pool: 'daily', seq: 2, wordIdx: 13, gateVersion: 9 },
    { pool: 'daily', seq: 3, wordIdx: 16, extra: { retired: true } },
    { pool: 'daily', seq: 4, wordIdx: 19 },
  ]);
  await h.call('genDaily', { dateKey: '20261104' });
  const used = docs('answer_bank').filter((b) => b.used);
  assert.deepEqual(used.map((b) => b.seq), [4]);
});

test('empty bank: nothing is published, DAILY_UNAVAILABLE, [ALERT] logged, daily_gen failed event (AC 57)', async () => {
  const out = await captureWarnings(() => h.call('genDaily', { dateKey: '20261104' }));
  assert.equal(out.result.ok, false);
  assert.equal(out.result.code, 'DAILY_UNAVAILABLE');
  assert.ok(out.error.some((l) => l.includes('[ALERT]')));
  assert.equal(docs('daily_puzzles').length, 0);
  const ev = docs('events').find((e) => e.name === 'daily_gen');
  assert.equal(ev.props.failed, true);
  const g = await h.call('getDaily', {}, { openid: 'u1' });
  assert.equal(g.code, 'DAILY_UNAVAILABLE');
});

test('fewer than 30 matching daily entries left logs a low-bank warning (AC 58)', async () => {
  bank(5);
  const out = await captureWarnings(() => h.call('genDaily', { dateKey: '20261104' }));
  assert.ok(out.warn.some((l) => /bank low/.test(l)));
  const ev = docs('events').find((e) => e.name === 'daily_gen');
  assert.equal(ev.props.bankLeft, 4);
  h.db.cols.answer_bank.clear();
  h.db.cols.daily_puzzles.clear();
  bank(40);
  const quiet = await captureWarnings(() => h.call('genDaily', { dateKey: '20261105' }));
  assert.ok(!quiet.warn.some((l) => /bank low/.test(l)));
});

test('genDaily and cleanup reject calls that carry an OPENID (AC 107)', async () => {
  bank(2);
  assert.equal((await h.call('genDaily', {}, { openid: 'u1' })).code, 'FORBIDDEN');
  assert.equal((await h.call('cleanup', {}, { openid: 'u1' })).code, 'FORBIDDEN');
  assert.equal(docs('daily_puzzles').length, 0);
});

test('genDaily rejects a malformed dateKey', async () => {
  bank(2);
  assert.equal((await h.call('genDaily', { dateKey: '2026-11-04' })).ok, false);
  assert.equal((await h.call('genDaily', { dateKey: '20261399' })).ok, false);
});

test('issue numbers count days since launch (LAUNCH_DATE_KEY, else the first published day)', async () => {
  bank(5);
  h.setEnv('LAUNCH_DATE_KEY', '20261101');
  await h.call('genDaily', { dateKey: '20261104' });
  assert.equal(docs('daily_puzzles')[0].issueNo, 4);
  h.setEnv('LAUNCH_DATE_KEY', undefined);
  const h2 = createHarness(); // fresh instance caches: the launch day is the first day ever published
  h2.seedBank([1, 2].map((n) => ({ pool: 'daily', seq: n, wordIdx: 10 })));
  await h2.call('genDaily', { dateKey: '20261104' });
  assert.equal(h2.db.all('daily_puzzles')[0].issueNo, 1);
  await h2.call('genDaily', { dateKey: '20261106' });
  assert.equal(h2.db.all('daily_puzzles').find((d) => d._id === '20261106').issueNo, 3);
  h2.teardown();
});

test('getDaily: same puzzleId and warm-ups for everyone, computed from server time (AC 55)', async () => {
  bank(3);
  const a = await h.call('getDaily', {}, { openid: 'u1' });
  const b = await h.call('getDaily', {}, { openid: 'u2' });
  assert.equal(a.puzzleId, 'd20261103');
  assert.deepEqual(a.warmups, b.warmups);
  assert.equal(a.warmups.length, 6);
  assert.equal(new Set(a.warmups).size, 6);
  assert.ok(a.warmups.every((w) => h.words.includes(w)));
  assert.deepEqual(a.my, { status: 'none', steps: 0, best: null, hints: 0 });
  assert.deepEqual(a.myStreak, { current: 0, best: 0 });
  assert.equal(typeof a.serverNow, 'number');
  assert.ok(!('answerRef' in a));
});

test('the Beijing date flips at 16:00 UTC regardless of the process TZ (AC 55)', async () => {
  bank(4);
  const prevTz = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    h.setNow(Date.UTC(2026, 10, 3, 15, 59, 59));
    assert.equal((await h.call('getDaily', {}, { openid: 'u1' })).dateKey, '20261103');
    h.setNow(Date.UTC(2026, 10, 3, 16, 0, 0));
    assert.equal((await h.call('getDaily', {}, { openid: 'u1' })).dateKey, '20261104');
  } finally {
    if (prevTz === undefined) delete process.env.TZ; else process.env.TZ = prevTz;
  }
});

test('warm-ups depend only on the date and the starter list, never on the answer (AC 28)', async () => {
  h.seedBank([{ pool: 'daily', seq: 1, wordIdx: 10 }]);
  const a = (await h.call('getDaily', {}, { openid: 'u1' })).warmups;
  const h2 = createHarness();
  h2.seedBank([{ pool: 'daily', seq: 1, wordIdx: 77 }]);
  const b = (await h2.call('getDaily', {}, { openid: 'u1' })).warmups;
  assert.deepEqual(a, b);
  h2.teardown();
});

test('getDaily reports my status, steps, best and hints; features carry the ad config', async () => {
  const sc = await dailyScenario(h);
  h.db.put('app_config', { _id: 'live', ads: { rewardedUnitId: 'adunit-x', banner: { enabled: false } } });
  for (let i = 0; i < 3; i++) await h.call('guess', { puzzleId: 'd20261103', word: h.words[50 + i], clientGuessId: gidNext() }, { openid: 'u1' });
  const g = await h.call('getDaily', {}, { openid: 'u1' });
  assert.equal(g.my.status, 'playing');
  assert.equal(g.my.steps, 3);
  assert.equal(g.my.best, Math.min(...[50, 51, 52].map((i) => sc.answer.ranks[i])));
  assert.equal(g.features.ads.rewardedUnitId, 'adunit-x');
  assert.equal(h.db.all('plays').length, 1, 'getDaily/startPuzzle never create a play');
});

test('streak: consecutive published dates increment, a skipped published date resets to 1 (AC 65)', async () => {
  h.seedBank([1, 2, 3, 4].map((n) => ({ pool: 'daily', seq: n, wordIdx: 10 })));
  for (const k of ['20261101', '20261102', '20261103', '20261104']) await h.publish(k);
  const play = async (day, openid = 'u1') => {
    h.setNow(Date.UTC(2026, 10, +day.slice(6), 4, 0, 0) );
    return h.call('guess', { puzzleId: 'd' + day, word: h.words[10], clientGuessId: gidNext() }, { openid });
  };
  await play('20261101');
  await play('20261102');
  assert.equal(docs('player_stats')[0].curStreak, 2);
  await play('20261103');
  assert.equal(docs('player_stats')[0].curStreak, 3);
  assert.equal(docs('player_stats')[0].bestStreak, 3);
  // u2 solves 1 and 3 but not 2: the skipped published date resets it
  await play('20261101', 'u2');
  await play('20261103', 'u2');
  const u2 = docs('player_stats').find((s) => s._id === 'u2');
  assert.equal(u2.curStreak, 1);
});

test('streak: an unpublished date neither extends nor breaks it (AC 66)', async () => {
  h.seedBank([1, 2, 3].map((n) => ({ pool: 'daily', seq: n, wordIdx: 10 })));
  await h.publish('20261101');
  await h.publish('20261103'); // 20261102 was never published
  const play = (day) => {
    h.setNow(Date.UTC(2026, 10, +day.slice(6), 4, 0, 0));
    return h.call('guess', { puzzleId: 'd' + day, word: h.words[10], clientGuessId: gidNext() }, { openid: 'u1' });
  };
  await play('20261101');
  await play('20261103');
  assert.equal(docs('player_stats')[0].curStreak, 2);
});

test('streak: a ranked give-up sets it to 0; displayed streak expires when the chain is stale (AC 67, 68)', async () => {
  h.seedBank([1, 2, 3].map((n) => ({ pool: 'daily', seq: n, wordIdx: 10 })));
  for (const k of ['20261101', '20261102', '20261103']) await h.publish(k);
  const at = (day) => h.setNow(Date.UTC(2026, 10, +day.slice(6), 4, 0, 0));
  at('20261101');
  await h.call('guess', { puzzleId: 'd20261101', word: h.words[10], clientGuessId: gidNext() }, { openid: 'u1' });
  at('20261102');
  await h.call('guess', { puzzleId: 'd20261102', word: h.words[10], clientGuessId: gidNext() }, { openid: 'u1' });
  assert.equal((await h.call('getDaily', {}, { openid: 'u1' })).myStreak.current, 2, 'yesterday\'s streak stays alive all of today');
  at('20261103');
  assert.deepEqual((await h.call('getDaily', {}, { openid: 'u1' })).myStreak, { current: 2, best: 2 });
  await h.call('guess', { puzzleId: 'd20261103', word: h.words[50], clientGuessId: gidNext() }, { openid: 'u1' });
  const gu = await h.call('giveUp', { puzzleId: 'd20261103' }, { openid: 'u1' });
  assert.equal(gu.ok, true);
  assert.equal(docs('player_stats')[0].curStreak, 0);
  assert.equal(docs('player_stats')[0].bestStreak, 2);
  assert.equal(docs('daily_stats').find((s) => s._id === '20261103').gaveUp, 1);
  // a streak whose last solve is neither today nor the previous published day shows 0
  h.db.put('player_stats', { _id: 'old', curStreak: 7, bestStreak: 9, lastSolvedDate: '20261030' });
  assert.deepEqual((await h.call('getDaily', {}, { openid: 'old' })).myStreak, { current: 0, best: 9 });
});

test('startPuzzle: a fresh puzzle creates no play; resume returns the same ladder on another call (edge 11)', async () => {
  await dailyScenario(h);
  const s0 = await h.call('startPuzzle', { puzzleId: 'd20261103' }, { openid: 'u1' });
  assert.equal(s0.play.status, 'playing');
  assert.equal(s0.play.steps, 0);
  assert.equal(s0.ranked, true);
  assert.equal(s0.warmups.length, 6);
  assert.equal(h.db.all('plays').length, 0);
  const g = await h.call('guess', { puzzleId: 'd20261103', word: h.words[50], clientGuessId: gidNext(), src: 'warmup' }, { openid: 'u1' });
  const s1 = await h.call('startPuzzle', { puzzleId: 'd20261103' }, { openid: 'u1' });
  assert.deepEqual(s1.play.guesses, [{ word: h.words[50], r: g.r, t: g.t, src: 'warmup' }]);
  assert.equal(s1.play.steps, 1);
  assert.equal(s1.play.status, 'playing');
  assert.ok(!('answer' in s1));
});

test('再来一题: newest unfinished past daily, else lowest unfinished practice (AC 61)', async () => {
  h.seedBank([
    { pool: 'daily', seq: 1, wordIdx: 10 }, { pool: 'daily', seq: 2, wordIdx: 13 }, { pool: 'daily', seq: 3, wordIdx: 16 },
    { pool: 'practice', practiceNo: 1, wordIdx: 20 }, { pool: 'practice', practiceNo: 2, wordIdx: 25 },
  ]);
  for (const k of ['20261101', '20261102', '20261103']) await h.publish(k);
  h.setNow(Date.UTC(2026, 10, 3, 4, 0, 0));
  // today is 1103 (open). Past dailies: 1102 (newest), 1101.
  const n1 = await h.call('startPuzzle', { next: true }, { openid: 'u1' });
  assert.equal(n1.puzzleId, 'd20261102');
  assert.equal(n1.kind, 'archive');
  assert.equal(n1.ranked, false);
  await h.call('guess', { puzzleId: 'd20261102', word: h.words[13], clientGuessId: gidNext() }, { openid: 'u1' });
  const n2 = await h.call('startPuzzle', { next: true }, { openid: 'u1' });
  assert.equal(n2.puzzleId, 'd20261101');
  await h.call('guess', { puzzleId: 'd20261101', word: h.words[10], clientGuessId: gidNext() }, { openid: 'u1' });
  const n3 = await h.call('startPuzzle', { next: true }, { openid: 'u1' });
  assert.equal(n3.puzzleId, 'p1');
  await h.call('guess', { puzzleId: 'p1', word: h.words[20], clientGuessId: gidNext() }, { openid: 'u1' });
  assert.equal((await h.call('startPuzzle', { next: true }, { openid: 'u1' })).puzzleId, 'p2');
  await h.call('guess', { puzzleId: 'p2', word: h.words[25], clientGuessId: gidNext() }, { openid: 'u1' });
  assert.equal((await h.call('startPuzzle', { next: true }, { openid: 'u1' })).code, 'PUZZLE_NOT_FOUND');
});

test('an unfinished archive/practice play resumes where it was left (5.3)', async () => {
  await dailyScenario(h);
  await h.call('guess', { puzzleId: 'p1', word: h.words[60], clientGuessId: gidNext() }, { openid: 'u1' });
  const s = await h.call('startPuzzle', { puzzleId: 'p1' }, { openid: 'u1' });
  assert.equal(s.play.steps, 1);
  assert.equal(s.kind, 'practice');
  assert.equal(s.practiceNo, 1);
  assert.equal(s.warmups.length, 6);
});

test('getHistory: newest first, answer only for puzzles the caller finished, practice counts (AC 16, 62)', async () => {
  h.seedBank([
    { pool: 'daily', seq: 1, wordIdx: 10 }, { pool: 'daily', seq: 2, wordIdx: 13 }, { pool: 'daily', seq: 3, wordIdx: 16 },
    { pool: 'practice', practiceNo: 1, wordIdx: 20 }, { pool: 'practice', practiceNo: 2, wordIdx: 25 },
  ]);
  for (const k of ['20261101', '20261102', '20261103']) await h.publish(k);
  await h.call('guess', { puzzleId: 'd20261101', word: h.words[10], clientGuessId: gidNext() }, { openid: 'u1' }); // solved
  await h.call('guess', { puzzleId: 'd20261102', word: h.words[50], clientGuessId: gidNext() }, { openid: 'u1' }); // playing
  await h.call('guess', { puzzleId: 'p1', word: h.words[20], clientGuessId: gidNext() }, { openid: 'u1' }); // practice done
  const r = await h.call('getHistory', {}, { openid: 'u1' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.items.map((i) => i.puzzleId), ['d20261103', 'd20261102', 'd20261101']);
  const byId = Object.fromEntries(r.items.map((i) => [i.puzzleId, i]));
  assert.equal(byId.d20261101.answer, h.words[10]);
  assert.deepEqual(byId.d20261101.my, { status: 'solved', steps: 1 });
  assert.ok(!('answer' in byId.d20261102), 'in progress: no answer');
  assert.equal(byId.d20261102.my.status, 'playing');
  assert.ok(!('answer' in byId.d20261103) && !('my' in byId.d20261103), 'unplayed: neither');
  assert.deepEqual(r.practice, { done: 1, total: 2 });
  assert.equal(r.nextCursor, null);
  assert.equal(r.bestStreak, 0);
  assert.ok(!JSON.stringify(r).match(/answerRef|ranks/));
  // another player sees no answers
  const other = await h.call('getHistory', {}, { openid: 'u2' });
  assert.ok(other.items.every((i) => !('answer' in i)));
});

test('getHistory pages 30 at a time with a cursor', async () => {
  h.seedBank(Array.from({ length: 35 }, (_, i) => ({ pool: 'daily', seq: i + 1, wordIdx: 10 })));
  for (let i = 0; i < 35; i++) {
    const d = new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10).replace(/-/g, '');
    await h.publish(d);
  }
  h.setNow(Date.UTC(2026, 10, 4, 4, 0, 0)); // 20261104 BJT; the last published is 20261104
  const p1 = await h.call('getHistory', {}, { openid: 'u1' });
  assert.equal(p1.items.length, 30);
  assert.ok(p1.nextCursor);
  const p2 = await h.call('getHistory', { cursor: p1.nextCursor }, { openid: 'u1' });
  assert.equal(p2.items.length, 5);
  assert.equal(p2.nextCursor, null);
  assert.equal(new Set([...p1.items, ...p2.items].map((i) => i.puzzleId)).size, 35);
  assert.equal((await h.call('getHistory', { cursor: 'bad' }, { openid: 'u1' })).ok, false);
});
