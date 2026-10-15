'use strict';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, dailyScenario, gidNext } = require('./helpers/harness');
const rules = require('../common/rules');

let h;
let sc;
beforeEach(async () => {
  h = createHarness();
  sc = await dailyScenario(h);
});
afterEach(() => h.teardown());

const PID = 'd20261103';
const guess = (openid, idx, puzzleId = PID) => h.call('guess', { puzzleId, word: h.words[idx], clientGuessId: gidNext() }, { openid });
const reveal = (openid, puzzleId = PID) => h.call('getReveal', { puzzleId }, { openid });

test('REVEAL_LOCKED until the caller finishes; nothing about the answer is returned (AC 15)', async () => {
  assert.equal((await reveal('u1')).code, 'REVEAL_LOCKED', 'no play');
  await guess('u1', 50);
  const r = await reveal('u1');
  assert.deepEqual(Object.keys(r).sort(), ['code', 'message', 'msg', 'ok']);
  assert.ok(!JSON.stringify(r).includes(h.words[10]));
  // another player's finish does not unlock mine
  await guess('u2', 10);
  assert.equal((await reveal('u1')).code, 'REVEAL_LOCKED');
});

test('after a solve: the answer and exactly 100 [word, rank] items, ranks 1..100 in order, rank 1 = the answer (AC 15)', async () => {
  await guess('u1', 50);
  await guess('u1', 10);
  const r = await reveal('u1');
  assert.equal(r.ok, true);
  assert.equal(r.answer, h.words[10]);
  assert.equal(r.outcome, 'solved');
  assert.equal(r.top.length, 100);
  r.top.forEach(([word, rank], i) => {
    assert.equal(rank, i + 1);
    assert.equal(sc.answer.ranks[h.words.indexOf(word)], i + 1);
  });
  assert.equal(r.top[0][0], h.words[10]);
  assert.equal(r.top.filter((t) => t[2]).map((t) => t[0]).join(), h.words[11], 'the synonym is marked');
  assert.deepEqual(r.synonyms, [h.words[11]]);
  assert.ok(!JSON.stringify(r).match(/answerRef|"ranks"|bank000/));
});

test('after giving up the reveal also unlocks (AC 51)', async () => {
  await guess('u1', 50);
  assert.equal((await h.call('giveUp', { puzzleId: PID }, { openid: 'u1' })).answer, h.words[10]);
  const r = await reveal('u1');
  assert.equal(r.outcome, 'gaveup');
  assert.equal(r.top.length, 100);
  assert.equal(r.best, sc.answer.ranks[50]);
});

test('giveUp needs a step, is idempotent, and refuses after a solve', async () => {
  assert.equal((await h.call('giveUp', { puzzleId: PID }, { openid: 'u1' })).code, 'NOT_STARTED');
  assert.equal(h.db.all('plays').length, 0);
  await guess('u1', 50);
  const a = await h.call('giveUp', { puzzleId: PID }, { openid: 'u1' });
  const b = await h.call('giveUp', { puzzleId: PID }, { openid: 'u1' });
  assert.deepEqual(a, b);
  assert.equal(h.db.all('daily_stats').find((s) => s._id === '20261103').gaveUp, 1, 'counted once');
  await guess('u2', 10);
  assert.equal((await h.call('giveUp', { puzzleId: PID }, { openid: 'u2' })).code, 'FINISHED');
  assert.equal((await guess('u1', 51)).code, 'FINISHED', 'no guessing after giving up');
});

test('a retired answer hides its list but still reveals the answer (PO-27)', async () => {
  h.db.put('answer_bank', { ...sc.answer.meta, retired: true });
  await guess('u1', 10);
  const r = await reveal('u1');
  assert.equal(r.answer, h.words[10]);
  assert.equal(r.top, null);
  assert.equal(r.topHidden, true);
});

test('startPuzzle returns the answer only for a finished play (AC 14)', async () => {
  await guess('u1', 50);
  assert.ok(!('answer' in (await h.call('startPuzzle', { puzzleId: PID }, { openid: 'u1' }))));
  await guess('u1', 10);
  assert.equal((await h.call('startPuzzle', { puzzleId: PID }, { openid: 'u1' })).answer, h.words[10]);
  assert.ok(!('answer' in (await h.call('startPuzzle', { puzzleId: PID }, { openid: 'u2' }))));
});

test('day stats appear only with >= 30 finishers; median and "you beat" are computed from the histogram (AC 53)', async () => {
  await guess('u1', 10);
  assert.ok(!('stats' in (await reveal('u1'))), 'a single finisher shows no stats');
  // 40 more finishers: 10 solve in 1 step (u1 included -> 11), 29 in 2 steps
  h.db.put('daily_stats', { _id: '20261103', solved: 40, gaveUp: 0, started: 40, stepsHist: (() => { const a = new Array(81).fill(0); a[1] = 11; a[2] = 29; return a; })() });
  const r = await reveal('u1');
  assert.deepEqual(r.stats, { finishers: 40, medianSteps: 2, pctBetter: Math.round((29 / 40) * 100) });
  // practice puzzles never show day stats
  await h.call('guess', { puzzleId: 'p1', word: h.words[20], clientGuessId: gidNext() }, { openid: 'u1' });
  assert.ok(!('stats' in (await reveal('u1', 'p1'))));
});

test('rules: median, percent-better and bucket helpers', () => {
  const hist = new Array(81).fill(0);
  hist[10] = 5; hist[20] = 5; hist[80] = 2;
  assert.equal(rules.medianFromHist(hist), 20);
  assert.equal(rules.pctBetter(hist, 10), Math.round((7 / 12) * 100));
  assert.equal(rules.pctBetter(hist, 200), 0);
  assert.equal(rules.medianFromHist(new Array(81).fill(0)), null);
  assert.equal(rules.histBucket(500), 80);
});
