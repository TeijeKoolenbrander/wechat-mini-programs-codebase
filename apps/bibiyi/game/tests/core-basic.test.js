'use strict';
// Units for the small core modules: rng, date, measures, format, judge, score, gates.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sub, hash32, mulberry32, shuffle } = require('../core/rng');
const D = require('../core/date');
const { MEASURES, CATEGORIES, DAILY_THEME, FREE_GROUPS } = require('../core/measures');
const F = require('../core/format');
const J = require('../core/judge');
const S = require('../core/score');
const G = require('../core/gates');
const { getConfig, resolveInterstitial, bandAt } = require('../core/config');
const { findForbidden } = require('../core/forbidden');

const cfg = getConfig(1);

test('rng: same seed gives the same stream, sub-streams are independent', () => {
  const a = sub(7, 'x');
  const b = sub(7, 'x');
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
  assert.notEqual(sub(7, 'x')(), sub(7, 'y')());
  assert.equal(hash32('abc'), hash32('abc'));
  const arr = shuffle(mulberry32(1), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(arr.slice().sort(), [1, 2, 3, 4, 5, 6]);
});

test('date: Beijing date keys at 15:59:59 and 16:00:00 UTC, whatever TZ the process runs in (AC 34)', () => {
  const t1 = Date.UTC(2026, 10, 1, 15, 59, 59);
  const t2 = Date.UTC(2026, 10, 1, 16, 0, 0);
  assert.equal(D.beijingDateKey(t1), '20261101');
  assert.equal(D.beijingDateKey(t2), '20261102');
  // 2026-11-01 is a Sunday, 2026-11-02 a Monday
  assert.equal(D.weekdayOf('20261101'), 0);
  assert.equal(D.weekdayOf('20261102'), 1);
  assert.equal(D.weekdayOf('20261107'), 6);
  const saved = process.env.TZ;
  for (const tz of ['UTC', 'America/Los_Angeles', undefined]) {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
    assert.equal(D.beijingDateKey(t1), '20261101');
    assert.equal(D.beijingDateKey(t2), '20261102');
    assert.equal(D.weekdayOf('20261102'), 1);
  }
  if (saved === undefined) delete process.env.TZ;
  else process.env.TZ = saved;
});

test('date: answer window closes at D+1 00:30 BJT (AC 24)', () => {
  const close = D.windowCloseMs('20261101'); // 2026-11-02 00:30 BJT = 2026-11-01 16:30 UTC
  assert.equal(close, Date.UTC(2026, 10, 1, 16, 30, 0));
  assert.ok(D.inWindow('20261101', close - 60000)); // 00:29
  assert.ok(!D.inWindow('20261101', close + 60000)); // 00:31
  assert.equal(D.issueNo('20261103', '20261101'), 3);
  assert.equal(D.addDays('20261130', 1), '20261201');
});

test('measures: 13 measures in 8 categories, real verbs, never a bare big/small word (AC 9)', () => {
  assert.equal(MEASURES.length, 13);
  assert.equal(CATEGORIES.length, 8);
  for (const m of MEASURES) {
    for (const v of [m.hi, m.lo]) {
      assert.ok(v.length >= 2, m.key + ' verb ' + v);
      assert.ok(!['大', '小'].includes(v));
      assert.equal(findForbidden(v), null);
    }
    assert.ok(CATEGORIES.some((c) => c.key === m.category));
  }
  assert.equal(MEASURES.find((m) => m.key === 'river').hi, '更长');
  assert.equal(MEASURES.find((m) => m.key === 'year').hi, '更晚');
  assert.deepEqual(DAILY_THEME, { key: 'mix', label: '', categories: null }, 'v1 has no weekday themes');
  assert.equal(MEASURES.find((m) => m.key === 'animal_life').subLabel, '最长寿命纪录', 'decision b: never a typical lifespan');
  assert.equal(FREE_GROUPS.length, 9);
});

test('format: separators, 万 scale with one decimal, 约, BCE years (AC 82)', () => {
  const river = MEASURES.find((m) => m.key === 'river');
  const city = MEASURES.find((m) => m.key === 'city_pop');
  const year = MEASURES.find((m) => m.key === 'year');
  const mount = MEASURES.find((m) => m.key === 'mountain');
  assert.equal(F.valueText(river, { value: 6300 }), '6,300');
  assert.equal(F.valueText(city, { value: 20937757 }), '2,093.8');
  assert.equal(F.unitText(city), '万人');
  assert.equal(F.valueText(river, { value: 6300, approx: true }), '约6,300');
  assert.equal(F.valueText(year, { value: -221 }), '公元前221');
  assert.equal(F.valueText(year, { value: 1420 }), '1420');
  assert.equal(F.valueText(mount, { value: 8848.86 }), '8,848.86');
  assert.equal(F.sourceText({ publisher: '水利部', year: 2013 }), '来源：水利部 · 2013');
  assert.equal(F.fixedWithSeparators(1234567, 0), '1,234,567');
  // rounding tie check: two raw values that display the same
  assert.equal(F.displayNumber(city, 1000001), F.displayNumber(city, 1000002));
});

test('judge: hi means the bottom value is greater; years: later', () => {
  const top = { value: 6300 };
  assert.deepEqual(J.judge(top, { value: 5464 }, 'lo'), { correct: true, answer: 'lo' });
  assert.deepEqual(J.judge(top, { value: 5464 }, 'hi'), { correct: false, answer: 'lo' });
  assert.equal(J.correctChoice({ value: -221 }, { value: 1420 }), 'hi');
});

function fakeDeck(values) {
  // a chain: question k compares values[k-1] (top) with values[k] (bottom)
  const byId = {};
  const questions = [];
  values.forEach((v, i) => {
    byId['f' + i] = { id: 'f' + i, value: v, measure: 'river' };
  });
  for (let i = 0; i < values.length - 1; i++) questions.push({ k: i + 1, a: 'f' + i, b: 'f' + (i + 1), segStart: i === 0 });
  return { deck: { length: questions.length, questions }, byId };
}

test('judge: streak counts correct answers before the first miss; clearing the deck ends as cleared (AC 4, 5)', () => {
  const { deck, byId } = fakeDeck([10, 20, 5, 40, 3]);
  // answers: hi (20>10 ok), lo (5<20 ok), hi (40>5 ok), lo (3<40 ok) -> cleared with 4
  const run = J.createRun(deck.length);
  for (const c of ['hi', 'lo', 'hi']) assert.ok(J.applyAnswer(run, deck, byId, c).correct);
  assert.equal(run.streak, 3);
  assert.equal(run.status, 'open');
  const last = J.applyAnswer(run, deck, byId, 'lo');
  assert.ok(last.ended && last.endReason === 'cleared');
  assert.equal(run.streak, 4);
  assert.equal(J.applyAnswer(run, deck, byId, 'hi').code, 'RUN_ENDED');

  const run2 = J.createRun(deck.length);
  J.applyAnswer(run2, deck, byId, 'hi');
  const miss = J.applyAnswer(run2, deck, byId, 'hi');
  assert.ok(!miss.correct && miss.ended && miss.endReason === 'miss');
  assert.equal(run2.streak, 1);
  assert.equal(run2.missK, 2);
});

test('judge: one life (再答一次) forgives the miss, does not add to the streak, and is single-use (AC 41)', () => {
  const { deck, byId } = fakeDeck([10, 20, 5, 40, 3]);
  const run = J.createRun(deck.length);
  J.applyAnswer(run, deck, byId, 'hi');
  J.applyAnswer(run, deck, byId, 'hi'); // miss at k=2
  assert.ok(J.canUseLife(run));
  assert.ok(J.useLife(run));
  assert.equal(run.status, 'open');
  assert.equal(run.k, 3);
  assert.equal(run.streak, 1);
  assert.ok(!J.canUseLife(run));
  assert.ok(!J.useLife(run));
  J.applyAnswer(run, deck, byId, 'hi'); // k=3 ok
  assert.equal(run.streak, 2);
  const m2 = J.applyAnswer(run, deck, byId, 'hi'); // k=4 miss, no second life
  assert.ok(m2.ended && !J.canUseLife(run));
  assert.equal(run.streak, 2);
});

test('judge: a forgiven miss on the last question clears the deck', () => {
  const { deck, byId } = fakeDeck([10, 20, 5]);
  const run = J.createRun(deck.length);
  J.applyAnswer(run, deck, byId, 'hi');
  J.applyAnswer(run, deck, byId, 'hi'); // miss at the last question
  assert.ok(J.useLife(run));
  assert.equal(run.status, 'ended');
  assert.equal(run.endReason, 'cleared');
  assert.equal(run.streak, 1);
});

test('replayRun validates like the server: sequence, single life, no trailing answers (AC 38, 39)', () => {
  const { deck, byId } = fakeDeck([10, 20, 5, 40, 3, 50]);
  const ok = J.replayRun(deck, byId, [{ k: 1, c: 'hi' }, { k: 2, c: 'hi' }, { k: 3, c: 'hi' }], 2);
  assert.ok(ok.ok, JSON.stringify(ok));
  assert.equal(ok.streak, 2);
  assert.ok(ok.lifeUsed);
  const noLife = J.replayRun(deck, byId, [{ k: 1, c: 'hi' }, { k: 2, c: 'hi' }], null);
  assert.ok(noLife.ok && noLife.streak === 1 && noLife.endReason === 'miss');
  const bad = (answers, life) => J.replayRun(deck, byId, answers, life);
  assert.equal(bad([{ k: 1, c: 'hi' }, { k: 2, c: 'hi' }, { k: 3, c: 'hi' }], null).code, 'INVALID_ACTIONS'); // answer after a miss without a life
  assert.equal(bad([{ k: 1, c: 'hi' }, { k: 3, c: 'hi' }], null).code, 'INVALID_ACTIONS'); // non-sequential
  assert.equal(bad([{ k: 1, c: 'hi' }, { k: 2, c: 'lo' }], 2).code, 'INVALID_ACTIONS'); // a life not at a miss
  assert.equal(bad([{ k: 1, c: 'hi' }, { k: 2, c: 'hi' }, { k: 3, c: 'lo' }, { k: 4, c: 'hi' }], 2).code, 'INVALID_ACTIONS'); // second miss then more
  assert.equal(bad([{ k: 1, c: 'sideways' }], null).code, 'INVALID_ACTIONS');
  assert.equal(bad([], null).code, 'INVALID_ACTIONS');
  assert.equal(bad('x', null).code, 'INVALID_ACTIONS');
});

test('score: comment bands, streak text, rarity needs 30 results (PO-30)', () => {
  assert.equal(S.commentFor(0), '热身一下，再来！');
  assert.equal(S.commentFor(3), '不错的开局');
  assert.equal(S.commentFor(8), '有点东西');
  assert.equal(S.commentFor(15), '活地图本图');
  assert.equal(S.commentFor(40), '这都知道？！');
  assert.equal(S.streakText(18, true), '18（含再答一次）');
  assert.equal(S.streakText(18, false), '18');
  const hist = new Array(41).fill(0);
  hist[0] = 10;
  hist[5] = 10;
  hist[14] = 10;
  hist[20] = 10;
  assert.equal(S.rarityShare(hist, 29, 14, 30), null);
  assert.equal(S.rarityShare(hist, 40, 14, 30), 0.5);
  assert.equal(S.rarityText(0.825), '超过今日 82% 的玩家');
  assert.equal(S.dayStreakText(1), null);
  assert.equal(S.dayStreakText(5), '连续 5 天');
  for (const c of S.COMMENTS) assert.equal(findForbidden(c.text), null);
});

test('gates: the model gives easy pairs a high chance and a monotone cumulative product (spec 4.4)', () => {
  const river = MEASURES.find((m) => m.key === 'river');
  const easy = G.questionProb(cfg, river, { value: 100 }, { value: 1000 });
  const hard = G.questionProb(cfg, river, { value: 1000 }, { value: 1100 });
  assert.ok(easy > 0.9 && hard < 0.65 && hard > 0.5);
  const byId = { a: { value: 100, measure: 'river' }, b: { value: 1000, measure: 'river' }, c: { value: 100, measure: 'river' } };
  const st = G.deckStats({ questions: [{ a: 'a', b: 'b' }, { a: 'b', b: 'c' }] }, byId, cfg);
  assert.equal(st.cum[0], 1);
  assert.ok(st.cum[1] > st.cum[2]);
  assert.equal(st.pFull, st.cum[2]);
  assert.ok(G.passesGates({ median: 8, p20: 0.1, pFull: 0.001 }, cfg).pass);
  assert.ok(!G.passesGates({ median: 3, p20: 0.1, pFull: 0.001 }, cfg).pass);
  assert.ok(!G.passesGates({ median: 8, p20: 0.5, pFull: 0.001 }, cfg).pass);
  assert.ok(!G.passesGates({ median: 8, p20: 0.1, pFull: 0.01 }, cfg).pass);
});

test('config: interstitial caps clamp remote values and fall back to defaults (AC 72)', () => {
  const d = resolveInterstitial(cfg, undefined);
  assert.deepEqual(d, { enabled: true, everyNRuns: 3, minLifetimeRuns: 4, minGapSec: 120, maxPerDay: 5 });
  const c = resolveInterstitial(cfg, { everyNRuns: 1, minLifetimeRuns: 0, minGapSec: 5, maxPerDay: 99, enabled: false });
  assert.deepEqual(c, { enabled: false, everyNRuns: 2, minLifetimeRuns: 2, minGapSec: 60, maxPerDay: 8 });
  assert.equal(resolveInterstitial(cfg, { everyNRuns: 'x' }).everyNRuns, 3);
  assert.equal(bandAt(cfg, 1).ratio[0], 2.0);
  assert.equal(bandAt(cfg, 60).ratio[1], 1.4);
});
