'use strict';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, dailyScenario, gidNext, DAY } = require('./helpers/harness');
const rules = require('../common/rules');

let h;
let sc;
beforeEach(async () => {
  h = createHarness();
  sc = await dailyScenario(h); // answer word 10, synonym 11
});
afterEach(() => h.teardown());

const PID = 'd20261103';
const guess = (openid, idx, puzzleId = PID) =>
  h.call('guess', { puzzleId, word: h.words[idx], clientGuessId: gidNext(), src: 'chip' }, { openid });
const hint = (openid, ev = {}, puzzleId = PID) => { h.advance(61e3); return h.call('useHint', { puzzleId, ...ev }, { openid }); };
/** make n steps with words that are neither the answer nor its synonym */
async function steps(openid, n, puzzleId = PID, from = 50) {
  h.advance(61e3); // the 40/min limiter is not what these tests are about
  for (let i = 0; i < n; i++) assert.equal((await guess(openid, from + i, puzzleId)).ok, true);
}
const wordAtRank = (r) => sc.answer.ranks.indexOf(r);

test('hint 1 is locked before step 10 and available at step 10; hints 2-4 unlock at 20/30/40 (AC 42)', async () => {
  await steps('u1', 9);
  assert.equal((await hint('u1')).code, 'HINT_LOCKED');
  await steps('u1', 1, PID, 59);
  assert.equal((await hint('u1')).ok, true); // hint 1 -> step 11
  assert.equal((await hint('u1')).code, 'HINT_LOCKED', 'hint 2 needs step 20');
  await steps('u1', 9, PID, 60); // steps 20
  assert.equal((await hint('u1')).kind, 'word'); // hint 2 -> 21
  await steps('u1', 8, PID, 70); // 29
  assert.equal((await hint('u1')).code, 'HINT_LOCKED');
  await steps('u1', 1, PID, 78); // 30
  const h3 = await hint('u1');
  assert.equal(h3.kind, 'firstChar');
  assert.equal(h3.ch, h.words[10][0]);
  assert.equal(h3.steps, 31);
  await steps('u1', 8, PID, 79); // 39
  assert.equal((await hint('u1')).code, 'HINT_LOCKED');
  await steps('u1', 1, PID, 87); // 40
  assert.equal((await hint('u1')).kind, 'word');
  assert.equal((await hint('u1')).code, 'HINT_LIMIT', 'all four used');
});

test('each used hint adds exactly one step and is recorded (AC 43)', async () => {
  await steps('u1', 10);
  const r = await hint('u1');
  assert.equal(r.steps, 11);
  const play = h.db.all('plays')[0];
  assert.equal(play.steps, 11);
  assert.deepEqual(play.hintsUsed, [1]);
  assert.equal(play.guesses.length, 11);
});

test('a hint can be asked for with k, but only the next one (no skipping, no replaying)', async () => {
  await steps('u1', 20);
  assert.equal((await hint('u1', { k: 2 })).code, 'HINT_LOCKED');
  assert.equal((await hint('u1', { k: 1 })).ok, true);
  assert.equal((await hint('u1', { k: 1 })).code, 'HINT_LOCKED');
  assert.equal((await hint('u1', { k: 2 })).ok, true);
  assert.equal((await hint('u1', { k: 9 })).ok, false);
});

test('hint word rank is min(cap, max(2, floor(best/2))) and the word is the one at that rank (AC 44)', async () => {
  await steps('u1', 10);
  const best = h.db.all('plays')[0].best;
  const r = await hint('u1');
  const expect = Math.min(300, Math.max(2, Math.floor(best / 2)));
  assert.equal(r.r, expect);
  assert.equal(r.word, h.words[wordAtRank(expect)]);
  assert.equal(r.t, rules.tempOf(expect, h.V));
  assert.equal(r.near.length, 5);
});

test('a hint word is marked as a hint in the ladder and appears in startPuzzle (AC 49)', async () => {
  await steps('u1', 10);
  const r = await hint('u1');
  const s = await h.call('startPuzzle', { puzzleId: PID }, { openid: 'u1' });
  const row = s.play.guesses.find((g) => g.word === r.word);
  assert.equal(row.src, 'hint');
  assert.equal(row.r, r.r);
  assert.equal(s.play.steps, 11);
  assert.deepEqual(s.play.hintsUsed, [1]);
});

test('hint 3 reveals the first character, which stays available for the rest of the puzzle (AC 45)', async () => {
  await steps('u1', 30);
  await hint('u1');
  await steps('u1', 0);
  await hint('u1'); // hint 2 (needs step 20: fine)
  const h3 = await hint('u1');
  assert.equal(h3.ch, h.words[10][0]);
  const s = await h.call('startPuzzle', { puzzleId: PID }, { openid: 'u1' });
  assert.equal(s.play.firstChar, h.words[10][0]);
  assert.ok(!('answer' in s));
  const fc = s.play.guesses.filter((g) => g.word === null);
  assert.equal(fc.length, 1, 'the first-character hint is a step with word:null, as the client contract says');
  assert.deepEqual([fc[0].r, fc[0].t, fc[0].ch, fc[0].src], [null, null, h.words[10][0], 'hint']);
});

test('with best rank 2 a word hint returns AT_BEST and costs nothing (AC 46)', async () => {
  await guess('u1', wordAtRank(2));
  await steps('u1', 9);
  const before = h.db.all('plays')[0];
  const r = await hint('u1');
  assert.equal(r.code, 'AT_BEST');
  const after = h.db.all('plays')[0];
  assert.equal(after.steps, before.steps);
  assert.deepEqual(after.hintsUsed, []);
});

test('hint rule property: never rank 1, never a taken rank, cap respected unless every closer rank is taken (AC 44)', () => {
  for (let trial = 0; trial < 400; trial++) {
    const V = 50 + (trial % 400);
    const best = trial % 3 === 0 ? null : 3 + ((trial * 37) % (V - 2));
    const taken = new Set();
    for (let i = 0; i < trial % 25; i++) taken.add(2 + ((i * 7 + trial) % (V - 1)));
    for (const cap of [300, 50, 10, null]) {
      const pick = rules.pickHintRank({ best, cap, V, taken });
      if (pick == null) continue;
      assert.ok(pick >= 2 && pick <= V, 'never rank 1');
      assert.ok(!taken.has(pick), 'never a taken rank');
      if (cap != null && pick > cap) {
        for (let r = 2; r <= Math.min(cap, V); r++) assert.ok(taken.has(r), 'outward only when every closer rank is taken');
      }
    }
  }
});

test('pickHintRank: closer free rank first, then outward; null when best is 2 (AC 44, 46)', () => {
  const V = 1000;
  assert.equal(rules.pickHintRank({ best: 800, cap: 300, V, taken: new Set() }), 300);
  assert.equal(rules.pickHintRank({ best: 400, cap: 300, V, taken: new Set() }), 200);
  assert.equal(rules.pickHintRank({ best: 400, cap: 300, V, taken: new Set([200, 199]) }), 198);
  assert.equal(rules.pickHintRank({ best: null, cap: 50, V, taken: new Set() }), 50);
  assert.equal(rules.pickHintRank({ best: 3, cap: 10, V, taken: new Set() }), 2);
  assert.equal(rules.pickHintRank({ best: 3, cap: 10, V, taken: new Set([2]) }), 3, 'nothing closer is free: step outward');
  assert.equal(rules.pickHintRank({ best: 2, cap: 10, V, taken: new Set() }), null);
  assert.equal(rules.pickHintRank({ best: 4000, cap: null, V: 5000, taken: new Set() }), 2000);
});

test('a hint skips a synonym: if the target rank is a synonym it moves to the next closer free rank', async () => {
  const synRank = 30;
  const synIdx = wordAtRank(synRank);
  h.db.put('answer_bank', { ...sc.answer.meta, synonyms: [synIdx] });
  // best = 61 -> target floor(61/2) = 30 = the synonym's rank
  await guess('u1', wordAtRank(61));
  const fillers = [];
  for (let i = 12; i < h.V && fillers.length < 9; i++) if (sc.answer.ranks[i] > 61 && i !== synIdx) fillers.push(i);
  for (const f of fillers) await guess('u1', f);
  const r = await hint('u1');
  assert.equal(r.ok, true);
  assert.equal(r.r, 29);
  assert.notEqual(r.word, h.words[synIdx]);
  assert.notEqual(r.word, h.words[10]);
});

test('rewarded (ad) hints: refused on a ranked daily (AC 47), allowed in unranked play, max 3 (AC 48)', async () => {
  await steps('u1', 3);
  const denied = await hint('u1', { source: 'ad' });
  assert.equal(denied.code, 'RANKED_NO_AD');
  assert.equal(h.db.all('plays')[0].steps, 3);

  // practice puzzle p2 (answer word 25)
  const P = 'p2';
  await guess('u2', 60, P);
  const r1 = await hint('u2', { source: 'ad' }, P);
  assert.equal(r1.ok, true);
  assert.equal(r1.steps, 2);
  assert.equal((await hint('u2', { source: 'ad' }, P)).ok, true);
  assert.equal((await hint('u2', { source: 'ad' }, P)).ok, true);
  assert.equal((await hint('u2', { source: 'ad' }, P)).code, 'HINT_LIMIT');
  const play = h.db.all('plays').find((p) => p.openid === 'u2');
  assert.equal(play.adHints, 3);
  assert.equal(play.steps, 4);
  assert.deepEqual(play.hintsUsed, []);
});

test('a daily played after its window is unranked, so rewarded hints work there', async () => {
  h.setNow(h.now() + 5 * DAY);
  await steps('u1', 2);
  assert.equal((await hint('u1', { source: 'ad' })).ok, true);
});

test('hints on a finished play return FINISHED; bad input is rejected', async () => {
  await guess('u1', 10);
  assert.equal((await hint('u1')).code, 'FINISHED');
  assert.equal((await hint('u1', { source: 'bogus' })).ok, false);
  assert.equal((await hint('u1', { puzzleId: 'nope' }, 'nope')).ok, false);
});

test('hints with no play yet are locked (ladder)', async () => {
  const r = await hint('u1');
  assert.equal(r.code, 'HINT_LOCKED');
  assert.equal(h.db.all('plays').length, 0);
});
