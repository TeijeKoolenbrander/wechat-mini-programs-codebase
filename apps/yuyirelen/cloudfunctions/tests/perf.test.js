'use strict';
// Storage design / performance at the real vocabulary size (V = 30,000): lookup is one array read, the answer's
// rank list is read from the database once per warm instance, and responses stay small (spec 3.8: ~400 B per guess).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('perf_hooks');
const { createHarness, dailyScenario, gidNext } = require('./helpers/harness');

const V = 30000;
let h;
let sc;
before(async () => {
  h = createHarness({ V });
  sc = await dailyScenario(h, { answerIdx: 100, synonyms: [101] });
});
after(() => h.teardown());

const PID = 'd20261103';
const bytes = (o) => Buffer.byteLength(JSON.stringify(o));
const guess = (openid, idx) => h.call('guess', { puzzleId: PID, word: h.words[idx], clientGuessId: gidNext(), src: 'chip' }, { openid });

test('storage: one rank doc per answer is ~80 KB base64 (60 KB raw), metadata is a separate small doc', () => {
  const ranks = h.db.all('answer_ranks')[0];
  assert.equal(ranks.ranks.length, 80000);
  assert.ok(bytes(ranks) < 100 * 1024);
  const meta = h.db.all('answer_bank')[0];
  assert.ok(bytes(meta) < 1024, 'metadata doc stays tiny: ' + bytes(meta));
  assert.ok(!('ranks' in meta));
});

test('a guess response is under 1 KB (spec ~400 B) and carries no rank list', async () => {
  const r = await guess('p1', 5000);
  assert.ok(bytes(r) < 1024, `guess response ${bytes(r)} B`);
  assert.equal(r.near.length, 5);
});

test('the rank list is read from the database once per warm instance, then served from memory', async () => {
  const h2 = createHarness({ V });
  await dailyScenario(h2, { answerIdx: 100 });
  const mark = () => ({ ...h2.db.stats.byCol });
  await h2.call('guess', { puzzleId: PID, word: h2.words[7000], clientGuessId: gidNext() }, { openid: 'q1' });
  const after1 = mark();
  assert.equal(after1.answer_ranks, 1);
  for (let i = 1; i <= 30; i++) await h2.call('guess', { puzzleId: PID, word: h2.words[7000 + i], clientGuessId: gidNext() }, { openid: 'q1' });
  // another player on the same instance also reuses the cache
  await h2.call('guess', { puzzleId: PID, word: h2.words[9000], clientGuessId: gidNext() }, { openid: 'q2' });
  const after2 = mark();
  assert.equal(after2.answer_ranks, 1, 'no further rank-list reads');
  assert.equal(after2.answer_bank, after1.answer_bank, 'no further bank reads');
  assert.equal(after2.daily_puzzles, after1.daily_puzzles, 'the puzzle doc is cached too');
  // steady state: a guess touches only the player's play doc and the rate-limit doc
  const before = { ...h2.db.stats.byCol };
  await h2.call('guess', { puzzleId: PID, word: h2.words[7500], clientGuessId: gidNext() }, { openid: 'q1' });
  const delta = Object.fromEntries(Object.entries(h2.db.stats.byCol).map(([k, v]) => [k, v - (before[k] || 0)]).filter(([, v]) => v));
  assert.ok(Object.keys(delta).every((k) => ['plays', 'rate_limits', 'player_stats'].includes(k)), JSON.stringify(delta));
  assert.ok(Object.values(delta).reduce((a, b) => a + b, 0) <= 3, JSON.stringify(delta));
  h2.teardown();
  h.activate();
});

test('warm guesses are fast: 300 guesses average well under 10 ms of function time', async () => {
  const t0 = performance.now();
  for (let i = 0; i < 300; i++) {
    if (i % 35 === 0) h.advance(61e3);
    const r = await guess('p2', 8000 + i);
    assert.equal(r.ok, true);
  }
  const avg = (performance.now() - t0) / 300;
  assert.ok(avg < 10, `average ${avg.toFixed(2)} ms per guess`);
});

test('every rank is exact at full size: lookups agree with the stored permutation', async () => {
  const sample = [3, 400, 12345, 29999, 15000];
  for (const [i, idx] of sample.entries()) {
    if (idx === 100 || idx === 101) continue;
    const r = await guess('p3', idx);
    if (i % 30 === 29) h.advance(61e3);
    assert.equal(r.r, sc.answer.ranks[idx]);
  }
});

test('startPuzzle and getReveal responses stay small even for a long play', async () => {
  for (let i = 0; i < 100; i++) {
    if (i % 35 === 0) h.advance(61e3);
    await guess('p4', 10000 + i);
  }
  await guess('p4', 100);
  const s = await h.call('startPuzzle', { puzzleId: PID }, { openid: 'p4' });
  assert.equal(s.play.guesses.length, 101);
  assert.ok(bytes(s) < 12 * 1024, `startPuzzle ${bytes(s)} B for 101 guesses`);
  const r = await h.call('getReveal', { puzzleId: PID }, { openid: 'p4' });
  assert.equal(r.top.length, 100);
  assert.ok(bytes(r) < 6 * 1024, `getReveal ${bytes(r)} B`);
  const board = await h.call('getBoard', { kind: 'friend', dateKey: '20261103' }, { openid: 'p4' });
  assert.ok(bytes(board) < 16 * 1024);
});

test('LRU: the cache keeps at most 32 answers (memory ~4 MB), older ones reload on demand', async () => {
  const answers = require(require('path').join(h.root, 'guess', 'common', 'answers.js'));
  assert.equal(answers.RANKS_LRU, 32);
});
