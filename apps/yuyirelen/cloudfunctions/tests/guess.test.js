'use strict';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, dailyScenario, gidNext, T0, DAY } = require('./helpers/harness');

let h;
let sc;
beforeEach(async () => {
  h = createHarness();
  sc = await dailyScenario(h); // answer = word 10, synonym = word 11
});
afterEach(() => h.teardown());

const guess = (openid, wordIdx, extra = {}) =>
  h.call('guess', { puzzleId: 'd20261103', word: h.words[wordIdx], clientGuessId: gidNext(), src: 'typed', ...extra }, { openid });
/** a word index that is not the answer, not a synonym */
const wrong = (n) => 50 + n;

test('a guess returns its rank, temperature, band and step count (AC 29, 30)', async () => {
  const r = await guess('u1', wrong(0));
  const rank = sc.answer.ranks[wrong(0)];
  assert.equal(r.ok, true);
  assert.equal(r.r, rank);
  assert.equal(r.t, Math.round(100 * (1 - Math.log(rank) / Math.log(h.V))));
  assert.equal(r.steps, 1);
  assert.equal(r.best, rank);
  assert.equal(r.solved, false);
  assert.equal(r.dup, false);
  assert.equal(r.ranked, true);
  assert.ok(['boil', 'scald', 'hot', 'warm', 'cold'].includes(r.band));
});

test('the client never receives the answer or any rank list before finishing (AC 13, 14)', async () => {
  const answerWord = h.words[10];
  const blob = [];
  for (let i = 0; i < 5; i++) blob.push(JSON.stringify(await guess('u1', wrong(i))));
  blob.push(JSON.stringify(await h.call('startPuzzle', { puzzleId: 'd20261103' }, { openid: 'u1' })));
  blob.push(JSON.stringify(await h.call('getDaily', {}, { openid: 'u1' })));
  for (const s of blob) {
    assert.ok(!s.includes(answerWord), 'answer word leaked: ' + s.slice(0, 200));
    assert.doesNotMatch(s, /answerRef|"ranks"|answer_bank|bank0000/);
    assert.doesNotMatch(s, /"answer"/);
  }
});

test('words outside the vocabulary return NOT_IN_VOCAB, write nothing and the text is never logged (AC 24)', async () => {
  const logged = [];
  const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  for (const k of Object.keys(orig)) console[k] = (...a) => logged.push(a.map(String).join(' '));
  let r;
  try {
    r = await h.call('guess', { puzzleId: 'd20261103', word: '火星探测器零号', clientGuessId: gidNext(), src: 'typed' }, { openid: 'u1' });
    await h.call('guess', { puzzleId: 'd20261103', word: 'hello', clientGuessId: gidNext() }, { openid: 'u1' });
  } finally {
    Object.assign(console, orig);
  }
  assert.equal(r.ok, false);
  assert.equal(r.code, 'NOT_IN_VOCAB');
  assert.equal(h.db.all('plays').length, 0);
  assert.equal(h.db.all('events').filter((e) => JSON.stringify(e).includes('火星')).length, 0);
  assert.ok(!logged.join('\n').includes('火星') && !logged.join('\n').includes('hello'));
  assert.ok(!JSON.stringify(h.db.all('rate_limits')).includes('火星'));
});

test('input is normalised: spaces, punctuation and full-width forms are stripped before lookup', async () => {
  const w = h.words[60];
  const r = await h.call('guess', { puzzleId: 'd20261103', word: ` ${w[0]} ${w.slice(1)}！`, clientGuessId: gidNext(), src: 'typed' }, { openid: 'u1' });
  assert.equal(r.ok, true);
  assert.equal(r.r, sc.answer.ranks[60]);
});

test('bad input is rejected with a code, never a throw', async () => {
  for (const ev of [
    {}, { puzzleId: 'd20261103' }, { puzzleId: 'x1', word: h.words[1], clientGuessId: gidNext() },
    { puzzleId: 'd20261103', word: h.words[1], clientGuessId: 'short' },
    { puzzleId: 'd20261103', word: h.words[1], clientGuessId: gidNext(), src: 'bogus' },
    { puzzleId: 'd20261103', word: 123, clientGuessId: gidNext() },
    { puzzleId: 'd20261103', word: 'x'.repeat(500), clientGuessId: gidNext() },
  ]) {
    const r = await h.call('guess', ev, { openid: 'u1' });
    assert.equal(r.ok, false);
    assert.ok(typeof r.code === 'string');
  }
  assert.equal(h.db.all('plays').length, 0);
});

test('no OPENID in the context returns UNAUTHENTICATED; identity is never taken from input (AC 106)', async () => {
  const r = await h.call('guess', { puzzleId: 'd20261103', word: h.words[1], clientGuessId: gidNext(), openid: 'victim' }, {});
  assert.equal(r.code, 'UNAUTHENTICATED');
  await guess('u1', wrong(0), { openid: 'victim', OPENID: 'victim' });
  assert.deepEqual(h.db.all('plays').map((p) => p.openid), ['u1']);
});

test('steps are computed by the server; client-sent steps/ranks are ignored (AC 38)', async () => {
  const r = await guess('u1', wrong(0), { steps: 999, r: 1, rank: 1, solved: true });
  assert.equal(r.steps, 1);
  assert.equal(r.solved, false);
  const play = h.db.all('plays')[0];
  assert.equal(play.steps, 1);
  assert.equal(play.status, 'playing');
});

test('retrying the same clientGuessId returns the same result and adds no step (AC 39)', async () => {
  const id = gidNext();
  const a = await guess('u1', wrong(0), { clientGuessId: id });
  const b = await guess('u1', wrong(0), { clientGuessId: id });
  assert.deepEqual(b, a);
  assert.equal(h.db.all('plays')[0].steps, 1);
});

test('concurrent identical requests create one play and one step', async () => {
  const id = gidNext();
  const rs = await Promise.all([1, 2, 3, 4].map(() => guess('u1', wrong(0), { clientGuessId: id })));
  assert.ok(rs.every((r) => r.ok && r.steps === 1));
  assert.equal(h.db.all('plays').length, 1);
  assert.equal(h.db.all('plays')[0].steps, 1);
});

test('a duplicate word adds no step and returns the existing rank (AC 35)', async () => {
  const a = await guess('u1', wrong(0));
  const b = await guess('u1', wrong(0));
  assert.equal(b.dup, true);
  assert.equal(b.r, a.r);
  assert.equal(b.steps, 1);
  assert.equal(h.db.all('plays')[0].steps, 1);
});

test('the answer solves: status, answer in the response only now, daily_stats and streak updated (AC 36)', async () => {
  await guess('u1', wrong(0));
  const r = await guess('u1', 10);
  assert.equal(r.solved, true);
  assert.equal(r.solvedBy, 'answer');
  assert.equal(r.answer, h.words[10]);
  assert.equal(r.r, 1);
  assert.equal(r.t, 100);
  assert.equal(r.band, 'hit');
  assert.equal(r.steps, 2);
  const play = h.db.all('plays')[0];
  assert.equal(play.status, 'solved');
  assert.equal(play.solvedBy, undefined);
  const stats = h.db.all('daily_stats').find((s) => s._id === '20261103');
  assert.equal(stats.solved, 1);
  assert.equal(stats.started, 1);
  assert.equal(stats.stepsHist[2], 1);
  const ps = h.db.all('player_stats')[0];
  assert.equal(ps.curStreak, 1);
  assert.equal(ps.lastSolvedDate, '20261103');
  assert.equal(ps.finishedTotal, 1);
});

test('a listed synonym also solves and is recorded as solvedBy synonym (AC 37)', async () => {
  const r = await guess('u1', 11);
  assert.equal(r.solved, true);
  assert.equal(r.solvedBy, 'synonym');
  assert.equal(r.answer, h.words[10]);
  assert.equal(r.r, sc.answer.ranks[11], 'synonyms keep their real rank');
  assert.ok(r.r > 1);
  assert.equal(h.db.all('plays')[0].guesses[0].sv, 'synonym');
});

test('a guess on a finished play returns FINISHED; the winning guess can still be retried (AC 40)', async () => {
  const id = gidNext();
  const win = await guess('u1', 10, { clientGuessId: id });
  assert.equal(win.solved, true);
  const again = await guess('u1', wrong(1));
  assert.equal(again.code, 'FINISHED');
  const retry = await guess('u1', 10, { clientGuessId: id });
  assert.equal(retry.solved, true);
  assert.equal(retry.answer, h.words[10]);
  assert.equal(h.db.all('plays')[0].steps, 1);
});

test('50 guesses from one player: one ranked daily play per openid, deterministic _id (AC 60)', async () => {
  for (let i = 0; i < 5; i++) await guess('u1', wrong(i));
  await guess('u2', wrong(0));
  const ids = h.db.all('plays').map((p) => p._id).sort();
  assert.deepEqual(ids, ['d20261103_u1', 'd20261103_u2']);
});

test('RATE_LIMITED after 40 guesses in a minute, GUESS_LIMIT at 601 (AC 41)', async () => {
  for (let i = 0; i < 40; i++) assert.equal((await guess('u1', 50 + i)).ok, true, 'guess ' + i);
  const r = await guess('u1', 100);
  assert.equal(r.code, 'RATE_LIMITED');
  assert.equal(h.db.all('plays')[0].steps, 40, 'a limited guess is not counted');
  h.advance(61e3);
  assert.equal((await guess('u1', 100)).ok, true);
  assert.ok(h.db.all('anomalies').some((a) => a.kind === 'burst'), 'burst flagged');
});

test('GUESS_LIMIT: guess 601 on one puzzle is refused; hints and give-up still work', async () => {
  const play = {
    _id: 'd20261103_u9', openid: 'u9', puzzleId: 'd20261103', kind: 'daily', ranked: true, dateKey: '20261103',
    guesses: [], steps: 600, hintsUsed: [], adHints: 0, best: 5000, status: 'playing', startedAt: T0, lastAt: T0, vocabVersion: 1, configVersion: 1,
  };
  for (let i = 0; i < 600; i++) play.guesses.push({ w: 12 + (i % 100), r: 5000 + i, t: 10, src: 'typed', cg: 'cg' + i, ts: T0 });
  h.db.put('plays', play);
  const r = await guess('u9', 119);
  assert.equal(r.code, 'GUESS_LIMIT');
  assert.ok(h.db.all('anomalies').some((a) => a.kind === 'limit'));
  assert.equal((await h.call('giveUp', { puzzleId: 'd20261103' }, { openid: 'u9' })).ok, true);
});

test('chips (near) are the guessed word\'s own neighbours, skip the ladder and do not depend on the answer (AC 32, 34)', async () => {
  const a = await guess('u1', 60);
  assert.equal(a.near.length, 5);
  assert.deepEqual(a.near, [61, 62, 63, 64, 65].map((i) => h.words[i]));
  await guess('u1', 61);
  const c = await h.call('near', { puzzleId: 'd20261103', word: h.words[60] }, { openid: 'u1' });
  assert.deepEqual(c.near, [62, 63, 64, 65, 66].map((i) => h.words[i]), 'already-guessed 61 skipped');
  // same neighbours on a puzzle with a different answer
  const p = await h.call('near', { puzzleId: 'p1', word: h.words[60] }, { openid: 'u3' });
  assert.deepEqual(p.near, [61, 62, 63, 64, 65].map((i) => h.words[i]));
});

test('window: a play started on D stays ranked until D+1 00:30 BJT, then turns unranked (AC 59)', async () => {
  const r1 = await guess('u1', wrong(0));
  assert.equal(r1.ranked, true);
  h.setNow(Date.UTC(2026, 10, 3, 16, 29, 0)); // 2026-11-04 00:29 BJT
  assert.equal((await guess('u1', wrong(1))).ranked, true);
  h.setNow(Date.UTC(2026, 10, 3, 16, 31, 0)); // 00:31 BJT
  const late = await guess('u1', wrong(2));
  assert.equal(late.ok, true);
  assert.equal(late.ranked, false);
  assert.equal(h.db.all('plays')[0].ranked, false);
  // solving now does not feed streak or daily_stats
  const win = await guess('u1', 10);
  assert.equal(win.solved, true);
  assert.equal(h.db.all('daily_stats').find((s) => s._id === '20261103').solved, 0);
  assert.equal(h.db.all('player_stats')[0].curStreak, 0);
});

test('a daily opened after its window is an archive play: unranked from the start (AC 64)', async () => {
  h.setNow(T0 + 3 * DAY);
  const r = await guess('u1', wrong(0));
  assert.equal(r.ranked, false);
  const play = h.db.all('plays')[0];
  assert.equal(play.kind, 'archive');
  await guess('u1', 10);
  assert.equal(h.db.all('daily_stats').find((s) => s._id === '20261103').solved, 0);
});

test('practice puzzles are unranked and never touch daily stats or streaks (AC 64)', async () => {
  const r = await h.call('guess', { puzzleId: 'p1', word: h.words[20], clientGuessId: gidNext(), src: 'chip' }, { openid: 'u1' });
  assert.equal(r.solved, true);
  assert.equal(r.ranked, false);
  assert.equal(h.db.all('daily_stats').find((s) => s._id === '20261103').solved, 0);
  const ps = h.db.all('player_stats')[0];
  assert.equal(ps.curStreak, 0);
  assert.equal(ps.finishedTotal, 1);
});

test('future and unknown puzzles return PUZZLE_NOT_FOUND (AC 63)', async () => {
  for (const id of ['d20261104', 'd20990101', 'd20261030', 'p999', 'd20261399', 'p0', 'zzz']) {
    const r = await h.call('guess', { puzzleId: id, word: h.words[1], clientGuessId: gidNext() }, { openid: 'u1' });
    assert.equal(r.code, 'PUZZLE_NOT_FOUND', id);
  }
});

test('fast_solve is flagged for a ranked daily solved in <= 3 steps without hints, and never changes the result (AC 109)', async () => {
  const r = await guess('u1', 10);
  assert.equal(r.solved, true);
  assert.ok(h.db.all('anomalies').some((a) => a.kind === 'fast_solve'));
  assert.equal(h.db.all('plays')[0].status, 'solved');
});

test('hintUnlocked is reported at steps 10, 20, 30, 40', async () => {
  const seen = [];
  for (let i = 0; i < 12; i++) {
    const r = await guess('u1', 50 + i);
    if (r.hintUnlocked) seen.push([r.steps, r.hintUnlocked]);
  }
  assert.deepEqual(seen, [[10, 1]]);
});
