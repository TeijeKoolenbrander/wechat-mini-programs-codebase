'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMockServer } = require('../js/dev/mock-server');
const D = require('../core/date');

const T0 = Date.UTC(2026, 10, 20, 4, 0, 0); // 2026-11-20 12:00 BJT, issue 20
const TODAY = 'd20261120'; // answer 月亮 (synonym 月球)

function make(opts) {
  let t = (opts && opts.t) || T0;
  const srv = createMockServer(Object.assign({ now: () => t }, opts));
  srv.setNow = (v) => (t = v);
  srv.tick = (ms) => (t += ms);
  return srv;
}
const call = (s, n, d) => s.call(n, d);
let seq = 0;
const g = (s, puzzleId, word, src) => call(s, 'guess', { puzzleId, word, clientGuessId: 'c' + ++seq, src: src || 'typed' });

/** words that are NOT the answer or its synonyms, farthest first */
function farWords(s, puzzleId, n) {
  const ans = s.answerOf(puzzleId);
  const out = [];
  for (let r = s.V; out.length < n && r > 2; r--) {
    const w = s.wordAtRank(puzzleId, r);
    if (w && w !== ans) out.push(w);
  }
  return out;
}

test('getDaily: same puzzle and warm-ups for a Beijing date, no answer fields (AC 13, 55)', () => {
  const s = make();
  const d = call(s, 'getDaily');
  assert.equal(d.ok, true);
  assert.equal(d.dateKey, '20261120');
  assert.equal(d.puzzleId, TODAY);
  assert.equal(d.issueNo, 20);
  assert.equal(d.warmups.length, 6);
  assert.deepEqual(d.my, { status: 'none', steps: 0, best: null, hints: 0 });
  const json = JSON.stringify(d);
  assert.ok(!/answerRef|ranks|月亮/.test(json));
  // 15:59:59 UTC is still the same Beijing date, 16:00:00 UTC is the next
  const a = make({ t: Date.UTC(2026, 10, 19, 15, 59, 59) });
  const b = make({ t: Date.UTC(2026, 10, 19, 16, 0, 0) });
  assert.equal(call(a, 'getDaily').dateKey, '20261119');
  assert.equal(call(b, 'getDaily').dateKey, '20261120');
  assert.deepEqual(call(a, 'getDaily').warmups, call(make({ t: Date.UTC(2026, 10, 19, 1, 0, 0) }), 'getDaily').warmups);
});

test('bank empty: DAILY_UNAVAILABLE, practice still works', () => {
  const s = make();
  s.bankEmpty = true;
  assert.equal(call(s, 'getDaily').code, 'DAILY_UNAVAILABLE');
  assert.equal(call(s, 'startPuzzle', { puzzleId: 'p1' }).ok, true);
});

test('guess flow: rank, step, ladder data, idempotent, duplicate, vocab, spoiler-free until solved (AC 29, 38, 39)', () => {
  const s = make();
  const r1 = g(s, TODAY, '番茄');
  assert.equal(r1.ok, true);
  assert.equal(r1.steps, 1);
  assert.ok(r1.r > 1);
  assert.equal(r1.solved, false);
  assert.ok(!('answer' in r1));
  assert.equal(r1.near.length, 5);
  assert.ok(!r1.near.includes('番茄'));
  assert.equal(r1.ranked, true);
  // same clientGuessId: same result, no new step
  const again = call(s, 'guess', { puzzleId: TODAY, word: '番茄', clientGuessId: 'dup-1', src: 'typed' });
  const again2 = call(s, 'guess', { puzzleId: TODAY, word: '番茄', clientGuessId: 'dup-1', src: 'typed' });
  assert.equal(again.steps, again2.steps);
  // a duplicate word returns dup:true and no step
  const dup = g(s, TODAY, '番茄');
  assert.equal(dup.dup, true);
  assert.equal(dup.steps, again.steps);
  assert.equal(dup.r, r1.r);
  // out of vocabulary: nothing stored
  const before = JSON.stringify(s.db.plays);
  assert.equal(g(s, TODAY, '乱码词').code, 'NOT_IN_VOCAB');
  assert.equal(JSON.stringify(s.db.plays), before);
  // traditional characters are normalised by the server too
  assert.equal(g(s, TODAY, '貓').dup, false);
  // startPuzzle shows the ladder but never the answer
  const sp = call(s, 'startPuzzle', { puzzleId: TODAY });
  assert.equal(sp.play.steps, 2);
  assert.ok(!('answer' in sp));
  assert.ok(!JSON.stringify(sp).includes('月亮'));
  assert.equal(call(s, 'getReveal', { puzzleId: TODAY }).code, 'REVEAL_LOCKED');
});

test('solve by answer: FINISHED afterwards, reveal has the answer and exactly 100 ranked words (AC 15, 36, 40)', () => {
  const s = make();
  g(s, TODAY, '番茄');
  const win = g(s, TODAY, '月亮');
  assert.equal(win.solved, true);
  assert.equal(win.solvedBy, 'answer');
  assert.equal(win.answer, '月亮');
  assert.equal(win.r, 1);
  assert.equal(win.t, 100);
  assert.equal(g(s, TODAY, '太阳').code, 'FINISHED');
  const rv = call(s, 'getReveal', { puzzleId: TODAY });
  assert.equal(rv.answer, '月亮');
  assert.equal(rv.top.length, 100);
  rv.top.forEach((it, i) => assert.equal(it[1], i + 1));
  assert.equal(rv.top[0][0], '月亮');
  assert.equal(rv.top[1][2], true); // 月球 is the listed synonym at rank 2
  assert.ok(!('stats' in rv)); // fewer than 30 finishers
  const sp = call(s, 'startPuzzle', { puzzleId: TODAY });
  assert.equal(sp.answer, '月亮');
});

test('solve by synonym (AC 37)', () => {
  const s = make();
  const w = g(s, TODAY, '月球');
  assert.equal(w.solved, true);
  assert.equal(w.solvedBy, 'synonym');
  assert.equal(w.r, 2);
  assert.equal(w.answer, '月亮');
  const sp = call(s, 'startPuzzle', { puzzleId: TODAY });
  assert.equal(sp.play.status, 'solved');
});

test('rate limit 40 per minute and 600 per puzzle (AC 41)', () => {
  const s = make();
  const far = farWords(s, TODAY, 60);
  let last;
  for (let i = 0; i < 40; i++) last = g(s, TODAY, far[i]);
  assert.equal(last.ok, true);
  assert.equal(g(s, TODAY, far[40]).code, 'RATE_LIMITED');
  s.tick(61000);
  assert.equal(g(s, TODAY, far[40]).ok, true);
  assert.ok(s.db.anomalies.some((a) => a.kind === 'burst'));
  // 600 per puzzle: lower the cap through the play length
  const pl = s.db.plays[TODAY];
  for (let i = 0; i < 600; i++) pl.guesses.push({ word: 'x' + i, r: 9999, t: 1, src: 'typed' });
  s.tick(61000);
  assert.equal(g(s, TODAY, far[41]).code, 'GUESS_LIMIT');
});

function playTo(s, id, n) {
  const far = farWords(s, id, n + 5);
  for (let i = 0; i < n; i++) {
    const r = g(s, id, far[i]);
    assert.equal(r.ok, true, 'guess ' + i);
    if (i % 30 === 29) s.tick(61000);
  }
}

test('hint ladder: locked before 10, word at the capped rank, +1 step, never rank 1 (AC 42-44, 49)', () => {
  const s = make();
  playTo(s, TODAY, 9);
  assert.equal(call(s, 'useHint', { puzzleId: TODAY, k: 1, source: 'ladder' }).code, 'HINT_LOCKED');
  g(s, TODAY, farWords(s, TODAY, 12)[10]);
  const h1 = call(s, 'useHint', { puzzleId: TODAY, k: 1, source: 'ladder' });
  assert.equal(h1.ok, true);
  assert.equal(h1.kind, 'word');
  assert.equal(h1.steps, 11);
  assert.ok(h1.r >= 2 && h1.r <= 300);
  assert.equal(h1.near.length > 0, true);
  // hint 2 needs step 20
  assert.equal(call(s, 'useHint', { puzzleId: TODAY, k: 2, source: 'ladder' }).code, 'HINT_LOCKED');
  assert.equal(call(s, 'useHint', { puzzleId: TODAY, k: 3, source: 'ladder' }).code, 'HINT_LOCKED'); // not the next hint
});

test('hints 1-4 at steps 10/20/30/40 incl. first character (AC 42, 45)', () => {
  const s = make();
  const far = farWords(s, TODAY, 80);
  let n = 0;
  const step = () => g(s, TODAY, far[n++]);
  while (n < 10) step();
  s.tick(61000);
  const h1 = call(s, 'useHint', { puzzleId: TODAY, k: 1, source: 'ladder' });
  assert.equal(h1.ok, true);
  while (s.db.plays[TODAY].guesses.length < 20) {
    step();
    if (n % 30 === 0) s.tick(61000);
  }
  const h2 = call(s, 'useHint', { puzzleId: TODAY, k: 2, source: 'ladder' });
  assert.equal(h2.ok, true);
  assert.ok(h2.r <= 50 && h2.r >= 2, 'rank ' + h2.r);
  s.tick(61000);
  while (s.db.plays[TODAY].guesses.length < 30) step();
  const h3 = call(s, 'useHint', { puzzleId: TODAY, k: 3, source: 'ladder' });
  assert.equal(h3.kind, 'firstChar');
  assert.equal(h3.ch, '月');
  assert.equal(h3.steps, 31);
  s.tick(61000);
  while (s.db.plays[TODAY].guesses.length < 40) step();
  const h4 = call(s, 'useHint', { puzzleId: TODAY, k: 4, source: 'ladder' });
  assert.equal(h4.ok, true);
  assert.ok(h4.r <= 10 && h4.r >= 2);
  assert.equal(call(s, 'useHint', { puzzleId: TODAY, source: 'ladder' }).code, 'HINT_LIMIT');
  const sp = call(s, 'startPuzzle', { puzzleId: TODAY });
  assert.equal(sp.play.firstChar, '月');
  assert.deepEqual(sp.play.hintsUsed, [1, 2, 3, 4]);
  assert.equal(sp.play.guesses.find((x) => x.ch).word, null);
});

test('AT_BEST: with best rank 2 a word hint is not consumed (AC 46)', () => {
  const s = make();
  const far = farWords(s, TODAY, 20);
  for (let i = 0; i < 9; i++) g(s, TODAY, far[i]);
  assert.equal(g(s, TODAY, '月球').solved, true); // rank 2 is the synonym and solves; use a custom play instead
  const s2 = make();
  const far2 = farWords(s2, TODAY, 20);
  for (let i = 0; i < 10; i++) g(s2, TODAY, far2[i]);
  s2.db.plays[TODAY].best = 2;
  const steps = s2.db.plays[TODAY].guesses.length;
  assert.equal(call(s2, 'useHint', { puzzleId: TODAY, k: 1, source: 'ladder' }).code, 'AT_BEST');
  assert.equal(s2.db.plays[TODAY].guesses.length, steps);
  assert.deepEqual(s2.db.plays[TODAY].hintsUsed, []);
});

test('rewarded hints: never on a ranked daily, only unranked, at most 3 (AC 47, 48)', () => {
  const s = make();
  g(s, TODAY, '番茄');
  assert.equal(call(s, 'useHint', { puzzleId: TODAY, source: 'ad' }).code, 'RANKED_NO_AD');
  const p1 = 'p1';
  g(s, p1, '篮球');
  const a = call(s, 'useHint', { puzzleId: p1, source: 'ad' });
  assert.equal(a.ok, true);
  assert.equal(a.steps, 2);
  assert.equal(call(s, 'useHint', { puzzleId: p1, source: 'ad' }).ok, true);
  assert.equal(call(s, 'useHint', { puzzleId: p1, source: 'ad' }).ok, true);
  assert.equal(call(s, 'useHint', { puzzleId: p1, source: 'ad' }).code, 'HINT_LIMIT');
});

test('ranked window: unranked after D+1 00:30 BJT, practice and archive are never ranked (AC 59, 64)', () => {
  const s = make();
  assert.equal(g(s, TODAY, '番茄').ranked, true);
  s.setNow(D.dateKeyToMs('20261121') + 29 * 60e3);
  assert.equal(g(s, TODAY, '猫').ranked, true);
  s.setNow(D.dateKeyToMs('20261121') + 31 * 60e3);
  const late = g(s, TODAY, '狗');
  assert.equal(late.ranked, false);
  assert.equal(call(s, 'startPuzzle', { puzzleId: TODAY }).kind, 'archive');
  assert.equal(g(s, 'p1', '篮球').ranked, false);
  const arch = 'd20261119';
  assert.equal(call(s, 'startPuzzle', { puzzleId: arch }).ranked, false);
});

test('give up: needs a step, idempotent, ranked give-up resets the streak (AC 51, 67)', () => {
  const s = make();
  assert.equal(call(s, 'giveUp', { puzzleId: TODAY }).code, 'NOT_STARTED');
  g(s, TODAY, '番茄');
  const gu = call(s, 'giveUp', { puzzleId: TODAY });
  assert.equal(gu.answer, '月亮');
  assert.equal(call(s, 'giveUp', { puzzleId: TODAY }).answer, '月亮');
  assert.equal(s.db.player.curStreak, 0);
  assert.equal(call(s, 'getReveal', { puzzleId: TODAY }).answer, '月亮');
});

test('puzzle ids: future and malformed ids are PUZZLE_NOT_FOUND (AC 63)', () => {
  const s = make();
  for (const id of ['d20261121', 'd20261031', 'p9', 'zzz', 'd20261120x']) assert.equal(call(s, 'startPuzzle', { puzzleId: id }).code, 'PUZZLE_NOT_FOUND', id);
  assert.equal(g(s, 'd20261121', '番茄').code, 'PUZZLE_NOT_FOUND');
});

test('streak across consecutive dailies (AC 65)', () => {
  const s = make({ t: D.dateKeyToMs('20261105') + 6 * 3600e3 });
  for (const k of ['20261105', '20261106', '20261107']) {
    s.setNow(D.dateKeyToMs(k) + 6 * 3600e3);
    const id = 'd' + k;
    const ans = s.answerOf(id);
    assert.equal(g(s, id, ans).solved, true);
  }
  assert.equal(call(s, 'getDaily').myStreak.current, 3);
  s.setNow(D.dateKeyToMs('20261109') + 6 * 3600e3); // 08 skipped
  assert.equal(call(s, 'getDaily').myStreak.current, 0);
  assert.equal(g(s, 'd20261109', s.answerOf('d20261109')).solved, true);
  assert.equal(call(s, 'getDaily').myStreak.current, 1);
  assert.equal(call(s, 'getDaily').myStreak.best, 3);
});

test('archive history and 再来一题 (AC 16, 61, 62)', () => {
  const s = make();
  const h = call(s, 'getHistory', {});
  assert.equal(h.items.length, 20);
  assert.equal(h.items[0].puzzleId, TODAY);
  assert.equal(h.nextCursor, null);
  assert.equal(h.practice.total, 3);
  assert.ok(h.items.every((it) => !('answer' in it)));
  const n1 = call(s, 'startPuzzle', { next: true });
  assert.equal(n1.puzzleId, 'd20261119');
  assert.equal(n1.kind, 'archive');
  g(s, 'd20261119', s.answerOf('d20261119'));
  assert.equal(call(s, 'startPuzzle', { next: true }).puzzleId, 'd20261118');
  assert.equal(call(s, 'startPuzzle', { next: true, pool: 'practice' }).puzzleId, 'p1');
  const h2 = call(s, 'getHistory', {});
  const it = h2.items.find((x) => x.puzzleId === 'd20261119');
  assert.equal(it.answer, s.answerOf('d20261119'));
  assert.equal(it.my.status, 'solved');
  assert.equal(call(s, 'getHistory', { cursor: '0' }).items.length, 20);
  const s2 = make({ t: D.dateKeyToMs('20261215') + 6 * 3600e3 });
  const page1 = call(s2, 'getHistory', {});
  assert.equal(page1.items.length, 30);
  assert.equal(page1.nextCursor, '30');
  assert.equal(call(s2, 'getHistory', { cursor: page1.nextCursor }).items.length, 15);
});

test('near is answer-independent (AC 34)', () => {
  const s = make();
  const a = call(s, 'near', { puzzleId: TODAY, word: '火锅' });
  const b = call(s, 'near', { puzzleId: 'd20261119', word: '火锅' });
  assert.deepEqual(a.near, b.near);
  assert.equal(a.near.length, 5);
});

test('stats appear only with >= 30 finishers (AC 53)', () => {
  const s = make();
  s.seedStats('20261120', 29, 21);
  g(s, TODAY, '月亮');
  const rv = call(s, 'getReveal', { puzzleId: TODAY });
  assert.equal(rv.stats.finishers, 30);
  assert.equal(rv.stats.medianSteps, 21);
  assert.equal(rv.stats.pctBetter, 97);
});

test('challenges: only after finishing, deterministic id, owner words stay locked until the viewer finishes (AC 19, 69, 75)', () => {
  const s = make();
  assert.equal(call(s, 'createChallenge', { puzzleId: TODAY }).code, 'NOT_FINISHED');
  g(s, TODAY, '番茄');
  g(s, TODAY, '月亮');
  const c = call(s, 'createChallenge', { puzzleId: TODAY });
  assert.match(c.challengeId, /^[0-9A-Z]{8}$/);
  assert.equal(call(s, 'createChallenge', { puzzleId: TODAY }).challengeId, c.challengeId);
  const own = call(s, 'getChallenge', { challengeId: c.challengeId });
  assert.ok(own.own);
  assert.ok(!('ownerWords' in own));
  // a friend's challenge on a puzzle I have not played
  const id = s.addForeignChallenge({ puzzleId: 'd20261119', steps: 18, hints: 1, words: ['aa'] });
  const pre = call(s, 'getChallenge', { challengeId: id });
  assert.equal(pre.own, null);
  assert.equal(pre.alreadyFinished, false);
  assert.ok(!('ownerWords' in pre));
  assert.equal(pre.kind, 'archive');
  assert.equal(pre.countsAsToday, false);
  const todayId = s.addForeignChallenge({ id: 'TODAY001', puzzleId: 'd20261120' });
  assert.equal(call(s, 'getChallenge', { challengeId: todayId }).alreadyFinished, true);
  assert.equal(call(s, 'getChallenge', { challengeId: 'NOPE0000' }).code, 'CHALLENGE_NOT_FOUND');
  g(s, 'd20261119', s.answerOf('d20261119'));
  assert.deepEqual(call(s, 'getChallenge', { challengeId: id }).ownerWords, ['aa']);
});

test('boards: rows carry no words, ranked plays only, group needs membership (AC 78-83)', () => {
  const s = make();
  g(s, TODAY, '番茄');
  g(s, TODAY, '月亮');
  s.addBoardRow('20261120', 'a', 1, 14, 0, 1, 3600);
  s.addBoardRow('20261120', 'b', 2, 9, 0, 6, 4000);
  assert.equal(call(s, 'getBoard', { kind: 'group', dateKey: '20261120', groupRef: 'nope' }).code, 'NOT_MEMBER');
  const gj = call(s, 'joinGroup', { groupData: { mockData: { opengid: 'G1', chat_type: 3 } } });
  assert.equal(gj.ok, true);
  const b = call(s, 'getBoard', { kind: 'group', dateKey: '20261120', groupRef: gj.groupRef });
  assert.equal(b.ok, true);
  assert.equal(b.rows.length, 3);
  assert.equal(b.rows.find((r) => r[0] === b.selfHash)[1], 1);
  assert.ok(!/月亮|番茄|openid/.test(JSON.stringify(b)));
  assert.equal(call(s, 'getBoard', { kind: 'friend', dateKey: '20261110' }).code, 'PUZZLE_NOT_FOUND');
  const notGroup = call(s, 'joinGroup', { groupData: { mockData: { opengid: 'G2', chat_type: 1 } } });
  assert.equal(notGroup.code, 'NOT_GROUP');
});

test('track rejects typed-text props (AC 25) and the offline switch works', () => {
  const s = make();
  assert.equal(call(s, 'track', { events: [{ name: 'guess_rejected', props: { reason: 'oov', len: 3 } }] }).ok, true);
  assert.equal(call(s, 'track', { events: [{ name: 'x', props: { text: 'abc' } }] }).code, 'BAD_EVENT');
  assert.equal(call(s, 'track', { events: [{ name: 'x', props: { input: 'abc' } }] }).code, 'BAD_EVENT');
  assert.equal(call(s, 'track', { events: [{ name: 'x', props: { query: 'abc' } }] }).code, 'BAD_EVENT');
  assert.equal(s.db.events.length, 1);
  s.offline = true;
  assert.equal(call(s, 'getDaily').code, 'NETWORK');
});

test('no response ever contains answerRef, ranks or an answer for an unfinished puzzle (AC 13, 14)', () => {
  const s = make();
  const outs = [call(s, 'getDaily'), call(s, 'startPuzzle', { puzzleId: TODAY }), g(s, TODAY, '番茄'), call(s, 'near', { puzzleId: TODAY, word: '猫' }), call(s, 'getHistory', {})];
  for (const o of outs) assert.ok(!/answerRef|"ranks"|月亮/.test(JSON.stringify(o)), JSON.stringify(o).slice(0, 120));
});
