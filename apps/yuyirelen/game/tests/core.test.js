'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getConfig, clampAds } = require('../core/config');
const T = require('../core/temp');
const { normalizeInput } = require('../core/normalize');
const { createDict } = require('../core/dict');
const t2s = require('../core/t2s');
const vocab = require('../core/vocab');
const { STARTERS, warmupsFor } = require('../core/starters');
const H = require('../core/hints');
const S = require('../core/streak');
const SC = require('../core/schedule');
const P = require('../core/play');
const C = require('../core/card');
const D = require('../core/date');
const { mulberry32 } = require('../core/rng');

const cfg = getConfig(1);
const dict = createDict(vocab);

test('temperature: T(1)=100, T(V)=0, matches the formula (AC 30)', () => {
  const V = 30000;
  assert.equal(T.temperature(1, V), 100);
  assert.equal(T.temperature(V, V), 0);
  for (const r of [2, 10, 100, 1000, 5000, 29999]) assert.equal(T.temperature(r, V), Math.round(100 * (1 - Math.log(r) / Math.log(V))));
  assert.equal(T.temperature(10, V), 78);
  assert.equal(T.temperature(100, V), 55);
});

test('bands follow the boundaries (AC 31)', () => {
  const want = { 1: 'hit', 2: 'boil', 10: 'boil', 11: 'scald', 100: 'scald', 101: 'hot', 500: 'hot', 501: 'warm', 2000: 'warm', 2001: 'cold', 29999: 'cold' };
  for (const r of Object.keys(want)) assert.equal(T.bandOf(+r).key, want[r], 'rank ' + r);
  for (const b of T.BANDS) assert.ok(b.label.length >= 1 && b.color);
});

test('rank labels use thousands separators', () => {
  assert.equal(T.rankLabel(1), '第 1 名');
  assert.equal(T.rankLabel(1284), '第 1,284 名');
  assert.equal(T.rankLabel(9812), '第 9,812 名');
  assert.equal(T.rankLabel(1234567), '第 1,234,567 名');
});

test('normalize: spaces, punctuation, full-width, traditional (AC 23)', () => {
  assert.equal(normalizeInput('  番 茄  ', t2s), '番茄');
  assert.equal(normalizeInput('番茄！？', t2s), '番茄');
  assert.equal(normalizeInput('番，茄。', t2s), '番茄');
  assert.equal(normalizeInput('ＡＢＣ１２３', t2s), 'ABC123');
  assert.equal(normalizeInput('蕃茄', t2s), '番茄');
  assert.equal(normalizeInput('貓', t2s), '猫');
  assert.equal(normalizeInput(null, t2s), '');
  // letters and digits are kept so they fall out of the vocabulary
  assert.ok(!dict.has(normalizeInput('abc', t2s)));
});

test('dict suggestions: exact first, then prefix by frequency, max 6 (AC 20, 22)', () => {
  const d = createDict('火锅\n火车\n火\n火山\n火焰\n火腿\n火星\n火柴\n水');
  assert.deepEqual(d.suggest('火', 6), ['火', '火锅', '火车', '火山', '火焰', '火腿']);
  assert.deepEqual(d.suggest('火锅', 6), ['火锅']);
  assert.deepEqual(d.suggest('', 6), []);
  assert.deepEqual(d.suggest('x', 6), []);
  assert.equal(d.suggest('火', 3).length, 3);
  for (const w of dict.suggest('番', 6)) assert.ok(dict.has(w));
});

test('fixture vocabulary: unique words, 1-4 characters, starters inside it', () => {
  assert.equal(new Set(dict.words).size, dict.words.length);
  for (const w of dict.words) assert.ok(Array.from(w).length >= 1 && Array.from(w).length <= 4, w);
  assert.equal(STARTERS.length, 120);
  assert.equal(new Set(STARTERS).size, 120);
  for (const w of STARTERS) assert.ok(dict.has(w), 'starter not in vocab: ' + w);
});

test('warm-ups: 6 distinct starters, same for a date, different dates differ (AC 27, 28)', () => {
  const a = warmupsFor('20261120');
  assert.equal(a.length, 6);
  assert.equal(new Set(a).size, 6);
  for (const w of a) assert.ok(STARTERS.includes(w));
  assert.deepEqual(a, warmupsFor('20261120'));
  const keys = ['20261121', '20261122', '20261123', 'p1', 'p2'];
  assert.ok(keys.some((k) => warmupsFor(k).join() !== a.join()));
});

test('hintStatus: unlock at 10/20/30/40, labels (AC 42)', () => {
  assert.deepEqual(H.hintStatus(cfg, 9, []), { next: 1, state: 'locked', threshold: 10, label: '第 10 步后可用提示' });
  assert.equal(H.hintStatus(cfg, 10, []).state, 'available');
  assert.equal(H.hintStatus(cfg, 10, []).label, '提示 1 可用');
  assert.equal(H.hintStatus(cfg, 19, [1]).state, 'locked');
  assert.equal(H.hintStatus(cfg, 20, [1]).next, 2);
  assert.equal(H.hintStatus(cfg, 30, [1, 2]).next, 3);
  assert.equal(H.hintStatus(cfg, 40, [1, 2, 3]).next, 4);
  assert.deepEqual(H.hintStatus(cfg, 99, [1, 2, 3, 4]), { next: null, state: 'exhausted', threshold: null, label: '提示已用完' });
  assert.deepEqual(H.newlyUnlocked(cfg, 9, 10), [1]);
  assert.deepEqual(H.newlyUnlocked(cfg, 9, 21), [1, 2]);
  assert.deepEqual(H.newlyUnlocked(cfg, 10, 11), []);
});

test('hint target rank uses the caps (spec 4.4)', () => {
  assert.equal(H.hintTargetRank(cfg, 1, 30000), 300);
  assert.equal(H.hintTargetRank(cfg, 1, 400), 200);
  assert.equal(H.hintTargetRank(cfg, 2, 400), 50);
  assert.equal(H.hintTargetRank(cfg, 2, 60), 30);
  assert.equal(H.hintTargetRank(cfg, 4, 5000), 10);
  assert.equal(H.hintTargetRank(cfg, 4, 8), 4);
  assert.equal(H.hintTargetRank(cfg, 1, 3), 2);
  assert.equal(H.adTargetRank(30000), 15000);
  assert.equal(H.adTargetRank(3), 2);
  assert.ok(H.atBest(2));
  assert.ok(!H.atBest(3));
});

test('pickHintRank: property test, never rank 1, closer first, then outward (AC 44)', () => {
  const rng = mulberry32(7);
  for (let n = 0; n < 500; n++) {
    const V = 50 + Math.floor(rng() * 500);
    const taken = new Set();
    const k = Math.floor(rng() * 40);
    for (let i = 0; i < k; i++) taken.add(2 + Math.floor(rng() * (V - 2)));
    const best = 3 + Math.floor(rng() * (V - 3));
    const hk = [1, 2, 4][Math.floor(rng() * 3)];
    const target = H.hintTargetRank(cfg, hk, best);
    const r = H.pickHintRank(target, (x) => x === 1 || taken.has(x), V);
    assert.ok(r !== null && r >= 2 && r <= V, 'rank ' + r);
    assert.ok(!taken.has(r));
    if (!taken.has(Math.min(target, V))) assert.equal(r, Math.min(target, V));
    else if (r < target) for (let x = r + 1; x <= target; x++) assert.ok(taken.has(x), 'closer rank free: ' + x);
  }
  // everything closer taken: step outward
  assert.equal(H.pickHintRank(5, (x) => x <= 5, 100), 6);
  assert.equal(H.pickHintRank(5, () => true, 100), null);
});

test('streak rules (AC 65-67)', () => {
  const s0 = { curStreak: 0, bestStreak: 0, lastSolvedDate: null };
  const s1 = S.onRankedSolve(s0, '20261101', null);
  assert.equal(s1.curStreak, 1);
  const s2 = S.onRankedSolve(s1, '20261102', '20261101');
  assert.equal(s2.curStreak, 2);
  const s3 = S.onRankedSolve(s2, '20261104', '20261103'); // 03 was published and skipped
  assert.equal(s3.curStreak, 1);
  assert.equal(s3.bestStreak, 2);
  const s4 = S.onRankedSolve(s2, '20261104', '20261102'); // 03 unpublished: prev published day is 02
  assert.equal(s4.curStreak, 3);
  assert.equal(S.onRankedGiveUp(s2).curStreak, 0);
  assert.equal(S.onRankedGiveUp(s2).bestStreak, 2);
  assert.equal(S.displayStreak(s2, '20261102', '20261101'), 2);
  assert.equal(S.displayStreak(s2, '20261103', '20261102'), 2); // yesterday's streak lives all of today
  assert.equal(S.displayStreak(s2, '20261104', '20261103'), 0);
});

test('schedule: ids, window, labels, next puzzle', () => {
  assert.deepEqual(SC.parsePuzzleId('d20261120'), { kind: 'daily', dateKey: '20261120' });
  assert.deepEqual(SC.parsePuzzleId('p12'), { kind: 'practice', n: 12 });
  for (const bad of ['', 'x1', 'd2026', 'd20261340', 'p0', 'p123456', null, undefined, 'd20261120x']) assert.equal(SC.parsePuzzleId(bad), null, String(bad));
  assert.ok(SC.isChallengeId('AbC12345'));
  assert.ok(!SC.isChallengeId('short'));
  const g = cfg.daily.graceMs;
  const d0 = D.dateKeyToMs('20261120');
  assert.ok(SC.inRankedWindow('20261120', d0, g));
  assert.ok(SC.inRankedWindow('20261120', d0 + D.DAY_MS + g - 1, g));
  assert.ok(!SC.inRankedWindow('20261120', d0 + D.DAY_MS + g, g));
  assert.ok(!SC.inRankedWindow('20261120', d0 - 1, g));
  assert.equal(SC.dateLabel('20261015'), '10月15日');
  assert.equal(SC.puzzleTitle('daily', 128), '今日一词 第128期');
  assert.equal(SC.puzzleTitle('archive', 97), '往期 第97期');
  assert.equal(SC.puzzleTitle('practice', null, 12), '练习 #12');
  const past = [{ puzzleId: 'd3', played: true }, { puzzleId: 'd2', played: false }, { puzzleId: 'd1', played: false }];
  const pr = [{ puzzleId: 'p1', played: true }, { puzzleId: 'p2', played: false }];
  assert.equal(SC.nextPuzzle(past, pr), 'd2');
  assert.equal(SC.nextPuzzle(past, pr, 'practice'), 'p2');
  assert.equal(SC.nextPuzzle([], pr), 'p2');
  assert.equal(SC.nextPuzzle([], [{ puzzleId: 'p1', played: true }]), null);
});

test('play helpers: ladder sorted by rank, chips skip guessed words, temps carry over the first-char step', () => {
  const V = 30000;
  const g = [
    P.toEntry({ word: '动物', r: 9812, t: 3, src: 'warmup' }, V),
    P.toEntry({ word: '蔬菜', r: 37, src: 'chip' }, V),
    P.toEntry({ word: null, r: null, t: null, src: 'hint', ch: '番' }, V),
    P.toEntry({ word: '土豆', r: 300, src: 'hint' }, V),
  ];
  const rows = P.ladderRows(g, '土豆');
  assert.deepEqual(rows.map((r) => r.word), ['蔬菜', '土豆', '动物']);
  assert.equal(rows[0].rankLabel, '第 37 名');
  assert.equal(rows[0].band, 'scald');
  assert.equal(rows[0].bandLabel, '烫');
  assert.equal(rows[1].isHint, true);
  assert.equal(rows[1].isLatest, true);
  assert.equal(rows[2].temp, 3);
  assert.deepEqual(P.chipsFrom(['蔬菜', '黄瓜', '白菜', '土豆', '萝卜', '青菜', '辣椒'], g, 5), ['黄瓜', '白菜', '萝卜', '青菜', '辣椒']);
  const temps = P.stepTemps(g);
  assert.equal(temps.length, 4);
  assert.equal(temps[2], temps[1]); // carries the best so far
  assert.equal(P.stepBands(g).length, 4);
  assert.equal(P.bestRank(g), 37);
  assert.deepEqual(P.srcMix(g), { warmup: 1, chip: 1, suggest: 0, typed: 0 });
  assert.equal(P.summaryLine('solved', 21, 1, 1), '21 步猜中 · 用了 1 次提示');
  assert.equal(P.summaryLine('solved', 14, 0, 1), '14 步猜中');
  assert.equal(P.summaryLine('gaveup', 30, 0, 3), '未猜中 · 最近第 3 名');
});

test('share card: bucketing to 60 columns keeps the hottest step, no word in the data (AC 70, 71)', () => {
  const temps = [];
  const bands = [];
  for (let i = 0; i < 130; i++) {
    temps.push(i % 7);
    bands.push(i === 100 ? 'boil' : 'cold');
  }
  temps[100] = 90;
  const b = C.bucket(temps, bands, 60);
  assert.equal(b.temps.length, 60);
  assert.equal(b.bands.length, 60);
  assert.ok(b.temps.includes(90));
  assert.equal(b.bands[b.temps.indexOf(90)], 'boil');
  assert.equal(C.bucket([1, 2, 3], ['cold', 'cold', 'cold'], 60).temps.length, 3);
  const vm = C.cardVm({ kind: 'daily', issueNo: 128, outcome: 'solved', steps: 21, hints: 1, best: 1, temps: [10, 50], bands: ['cold', 'hot'] }, 60);
  assert.equal(vm.headline, '21 步猜中');
  assert.equal(vm.subline, '用了 1 次提示');
  assert.equal(vm.title, '语义热冷 · 今日一词 第128期');
  assert.equal(C.cardVm({ kind: 'daily', issueNo: 1, outcome: 'gaveup', steps: 30, hints: 0, best: 3, temps: [], bands: [] }).headline, '未猜中 · 最近第 3 名');
  assert.equal(C.cardVm({ kind: 'practice', practiceNo: 12, outcome: 'solved', steps: 9, hints: 0, temps: [], bands: [] }).title, '语义热冷 · 练习 #12');
  assert.equal(C.shareTitle({ kind: 'daily', issueNo: 128, outcome: 'solved', steps: 21 }), '第128期我 21 步猜中，你几步？');
  assert.equal(C.shareTitle({ kind: 'daily', issueNo: 128, outcome: 'gaveup', steps: 21 }), '第128期没猜中，你来试试？');
});

test('ads clamps (spec 12)', () => {
  const a = clampAds({ interstitial: { everyNPuzzles: 1, minLifetime: 0, minGapSec: 5, maxPerDay: 99 }, banner: { enabled: true, adUnitId: '' } });
  assert.deepEqual(a.interstitial, { everyNPuzzles: 2, minLifetime: 2, minGapSec: 60, maxPerDay: 8 });
  assert.equal(a.banner.enabled, false); // no unit id -> off
  assert.equal(clampAds({ banner: { enabled: true, adUnitId: 'u' } }).banner.enabled, true);
  assert.deepEqual(clampAds(null).interstitial, { everyNPuzzles: 2, minLifetime: 3, minGapSec: 120, maxPerDay: 5 });
});

test('date helpers are timezone-proof (AC 55)', () => {
  assert.equal(D.beijingDateKey(Date.UTC(2026, 10, 19, 15, 59, 59)), '20261119');
  assert.equal(D.beijingDateKey(Date.UTC(2026, 10, 19, 16, 0, 0)), '20261120');
  assert.equal(D.addDays('20261130', 1), '20261201');
  assert.equal(D.issueNo('20261105', '20261101'), 5);
});
