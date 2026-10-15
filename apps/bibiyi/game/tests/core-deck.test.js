'use strict';
// Deck engine: pair rules, bands, free decks (AC 28, 29, 35, 37), daily decks, themes, gates (AC 30-33).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getContent, indexFacts } = require('../core/content');
const { getConfig } = require('../core/config');
const { BY_KEY, MEASURES, THEMES } = require('../core/measures');
const D = require('../core/deck');
const { deckStats, passesGates } = require('../core/gates');
const { addDays, weekdayOf } = require('../core/date');

const cfg = getConfig(1);
const free = getContent(1);
const daily = (() => {
  const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'out', 'daily-facts.json'), 'utf8'));
  return indexFacts(j.facts, j.contentVersion);
})();

test('bundled free pool exists and holds free facts only', () => {
  assert.ok(free && free.facts.length > 100);
  assert.ok(free.facts.every((f) => f.pool === 'free'));
  MEASURES.forEach((m) => assert.ok(free.byMeasure[m.key].length >= 10, m.key));
});

test('pairLegal: gap, approx stretch, years, suspended, noPairWith, display ties (AC 28)', () => {
  const mk = (id, v, o) => Object.assign({ id, label: id, measure: 'river', value: v, pool: 'free', status: 'active' }, o);
  assert.ok(D.pairLegal(cfg, mk('a', 100), mk('b', 111))); // river min gap 1.10
  assert.ok(!D.pairLegal(cfg, mk('a', 100), mk('b', 109)));
  assert.ok(!D.pairLegal(cfg, mk('a', 100), mk('a', 300))); // same fact
  assert.ok(!D.pairLegal(cfg, mk('a', 100), mk('b', 300, { measure: 'lake' }))); // other measure
  assert.ok(!D.pairLegal(cfg, mk('a', 100), mk('b', 300, { status: 'suspended' })));
  assert.ok(!D.pairLegal(cfg, mk('a', 100), mk('b', 300), { suspended: new Set(['b']) }));
  assert.ok(!D.pairLegal(cfg, mk('a', 100), mk('b', 300, { noPairWith: ['a'] })));
  assert.ok(!D.pairLegal(cfg, mk('a', 100), mk('b', 300, { label: 'a' })));
  // approximate facts need the stretched gap: 1.1^1.5 = 1.154
  assert.ok(!D.pairLegal(cfg, mk('a', 100, { approx: true }), mk('b', 112)));
  assert.ok(D.pairLegal(cfg, mk('a', 100, { approx: true }), mk('b', 116)));
  // years: >= 30 and >= 2x the larger uncertainty
  const y = (id, v, u) => ({ id, label: id, measure: 'year', value: v, uncertainty: u || 0, pool: 'free', status: 'active' });
  assert.ok(D.pairLegal(cfg, y('a', 1000), y('b', 1030)));
  assert.ok(!D.pairLegal(cfg, y('a', 1000), y('b', 1029)));
  assert.ok(!D.pairLegal(cfg, y('a', 1000, 20), y('b', 1035)));
  assert.ok(D.pairLegal(cfg, y('a', 1000, 20), y('b', 1040)));
  // rounding ties: city_pop shows one decimal in 万人
  const c = (id, v) => ({ id, label: id, measure: 'city_pop', value: v, pool: 'free', status: 'active' });
  assert.ok(!D.pairLegal(cfg, c('a', 1000001), c('b', 1000002)));
});

test('bandRange: raised to the minimum gap and stretched when the minimum exceeds the band (spec 4.2)', () => {
  const m = BY_KEY.animal_weight;
  const a = { approx: false, value: 10 };
  const b = { approx: false, value: 20 };
  assert.deepEqual(D.bandRange(cfg, m, 1, a, b), [2.0, 1e9]);
  const r = D.bandRange(cfg, m, 35, a, b); // band 31+: [0, 1.4] -> min gap 1.5 -> hi = 1.8
  assert.equal(r[0], 1.5);
  assert.ok(Math.abs(r[1] - 1.8) < 1e-9);
  const ya = { value: 100, uncertainty: 0 };
  assert.deepEqual(D.bandRange(cfg, BY_KEY.year, 35, ya, { value: 200, uncertainty: 0 }), [30, 120]);
});

test('free deck: deterministic, 60 questions, same on repeat (AC 35)', () => {
  for (const g of ['all', 'geo', 'city']) {
    const a = D.buildFreeDeck(12345, 1, 1, g);
    const b = D.buildFreeDeck(12345, 1, 1, g);
    assert.deepEqual(a, b);
    assert.equal(a.questions.length, 60);
    assert.notDeepEqual(a.questions, D.buildFreeDeck(54321, 1, 1, g).questions);
  }
});

test('free decks: every question legal, in band, recency respected, group filter holds (AC 28, 29, 37)', () => {
  const N = 50;
  const groups = ['all', 'city', 'geo', 'era', 'animal', 'space', 'build', 'food', 'dist'];
  let outOfBand = 0;
  let total = 0;
  for (const g of groups) {
    for (let seed = 1; seed <= N; seed++) {
      const deck = D.buildFreeDeck(seed * 7919, 1, 1, g);
      const strict = D.validateDeck(deck, free.byId, cfg, { strictBands: false });
      assert.deepEqual(strict, [], g + ' seed ' + seed);
      const inBand = D.validateDeck(deck, free.byId, cfg, { strictBands: true });
      outOfBand += inBand.length;
      if (g === 'all') assert.ok(inBand.length <= 1, 'all-group deck with ' + inBand.length + ' out-of-band questions');
      total += 60;
      deck.questions.forEach((q) => {
        const m = BY_KEY[free.byId[q.a].measure];
        if (g !== 'all') assert.equal(m.category, g);
      });
      const sizes = D.segmentSizes(deck);
      sizes.forEach((s, i) => assert.ok(s >= 5 && s <= 10, 'segment ' + s));
      assert.equal(sizes.reduce((x, y) => x + y, 0), 60);
    }
  }
  // the nearest-gap fallback must be rare with this pool
  assert.ok(outOfBand / total < 0.05, 'out of band share ' + outOfBand / total);
});

test('free deck: consecutive segments use different measures when the group has several', () => {
  const deck = D.buildFreeDeck(99, 1, 1, 'all');
  const segs = [];
  deck.questions.forEach((q) => {
    if (q.segStart) segs.push(q.m);
  });
  for (let i = 1; i < segs.length; i++) assert.notEqual(segs[i], segs[i - 1]);
});

test('free deck: a tiny pool still yields a full legal deck (never repeats within 10 when avoidable)', () => {
  const small = indexFacts(free.facts.filter((f) => f.measure === 'river').slice(0, 14), 1);
  const deck = D.buildFreeDeck(5, 1, 1, 'geo', small);
  assert.equal(deck.questions.length, 60);
  assert.deepEqual(D.validateDeck(deck, small.byId, cfg, { strictBands: false, allowRepeats: true }), []);
});

test('daily decks: 40 questions, weekday theme for 1-20, mixed after, segment sizes, no repeats, in band (AC 28-31)', () => {
  const start = '20261101';
  for (let i = 0; i < 21; i++) {
    const dateKey = addDays(start, i);
    const r = D.generateDaily({ dateKey, index: daily, contentVersion: 1, configVersion: 1 });
    assert.ok(r.ok, dateKey);
    const deck = r.deck;
    assert.equal(deck.questions.length, 40);
    assert.deepEqual(D.validateDeck(deck, daily.byId, cfg, {}), [], dateKey);
    const theme = THEMES[weekdayOf(dateKey)];
    assert.equal(deck.theme.label, theme.label);
    deck.questions.slice(0, 20).forEach((q) => {
      if (theme.categories) assert.ok(theme.categories.includes(BY_KEY[q.m].category), dateKey + ' q' + q.k + ' ' + q.m);
    });
    const sizes = D.segmentSizes(deck);
    sizes.forEach((s) => assert.ok(s >= 4 && s <= 8, 'segment ' + s));
    // segments 1-20 and 21-40 split exactly at question 20/21
    assert.ok(deck.questions[20].segStart);
    // mixed segments: at most 2 per measure
    const mixedCount = {};
    deck.questions.slice(20).forEach((q) => {
      if (q.segStart) mixedCount[q.m] = (mixedCount[q.m] || 0) + 1;
    });
    Object.keys(mixedCount).forEach((k) => assert.ok(mixedCount[k] <= 2, k));
    // daily facts only
    D.deckFactIds(deck).forEach((id) => assert.equal(daily.byId[id].pool, 'daily'));
    assert.ok(deck.gates.pass);
  }
});

test('daily decks: identical for identical inputs (AC 19), differ per date', () => {
  const a = D.generateDaily({ dateKey: '20261105', index: daily, contentVersion: 1, configVersion: 1 });
  const b = D.generateDaily({ dateKey: '20261105', index: daily, contentVersion: 1, configVersion: 1 });
  const c = D.generateDaily({ dateKey: '20261106', index: daily, contentVersion: 1, configVersion: 1 });
  assert.deepEqual(a.deck, b.deck);
  assert.notDeepEqual(a.deck.questions, c.deck.questions);
});

test('daily decks pass the gates: median 6-12, P(>=20) in 2-15%, P(40) <= 0.5% (AC 30)', () => {
  for (let i = 0; i < 40; i++) {
    const dateKey = addDays('20261201', i);
    const r = D.generateDaily({ dateKey, index: daily, contentVersion: 1, configVersion: 1 });
    assert.ok(r.ok);
    const st = deckStats(r.deck, daily.byId, cfg);
    assert.ok(passesGates(st, cfg).pass);
    assert.ok(st.median >= 6 && st.median <= 12);
    assert.ok(st.p20 >= 0.02 && st.p20 <= 0.15);
    assert.ok(st.pFull <= 0.005);
  }
});

test('daily: repeat window and suspended facts are honoured (AC 32)', () => {
  const day1 = D.generateDaily({ dateKey: '20261110', index: daily, contentVersion: 1, configVersion: 1 });
  const used = new Set(D.deckFactIds(day1.deck));
  const day2 = D.generateDaily({ dateKey: '20261111', index: daily, contentVersion: 1, configVersion: 1, exclude: used });
  assert.ok(day2.ok);
  D.deckFactIds(day2.deck).forEach((id) => assert.ok(!used.has(id), id));
  const some = new Set(Array.from(used).slice(0, 5));
  const again = D.generateDaily({ dateKey: '20261110', index: daily, contentVersion: 1, configVersion: 1, suspended: some });
  assert.ok(again.ok);
  D.deckFactIds(again.deck).forEach((id) => assert.ok(!some.has(id), id));
});

test('daily: impossible gates publish nothing, never a relaxed deck (AC 33)', () => {
  const r = D.generateDaily({ dateKey: '20261110', index: daily, contentVersion: 1, configVersion: 1, maxAttempts: 30 });
  assert.ok(r.ok);
  // an empty daily pool cannot build anything
  const empty = indexFacts([], 1);
  const bad = D.generateDaily({ dateKey: '20261110', index: empty, contentVersion: 1, configVersion: 1, maxAttempts: 20 });
  assert.deepEqual({ ok: bad.ok, code: bad.code }, { ok: false, code: 'DAILY_UNAVAILABLE' });
  // gates that no deck can meet
  const impossible = JSON.parse(JSON.stringify(cfg));
  impossible.gates.median = [39, 40];
  require('../core/config').CONFIGS[99] = impossible;
  const nope = D.generateDaily({ dateKey: '20261110', index: daily, contentVersion: 1, configVersion: 99, maxAttempts: 25 });
  assert.equal(nope.ok, false);
  assert.equal(nope.code, 'DAILY_UNAVAILABLE');
  delete require.cache[require.resolve('../core/config')].exports.CONFIGS[99];
});

test('tools/deckstats: candidate pass rate over many dates is at least 20% (AC 30)', () => {
  const { run } = require('../tools/deckstats');
  const r = run({ dates: 120 });
  assert.ok(r.passRate >= 0.2, 'pass rate ' + r.passRate);
  assert.equal(r.unavailable, 0);
  assert.ok(r.pFullMax <= 0.005);
});

test('questions reveal nothing about the bottom card before the answer (AC 2, 18)', () => {
  const { questionPayload, revealOf, promptText, segmentBannerText } = require('../core/question');
  const deck = D.buildFreeDeck(3, 1, 1, 'geo');
  const q = deck.questions[0];
  const p = questionPayload(q, free.byId);
  assert.ok(p.top.valueText && p.top.sourceText && p.top.unitText);
  assert.equal(p.bottom.valueText, undefined);
  assert.equal(p.bottom.sourceText, undefined);
  assert.deepEqual(Object.keys(p.bottom).sort(), ['factId', 'label', 'unitText'].concat(p.bottom.sub ? ['sub'] : []).sort());
  const text = JSON.stringify(p);
  assert.ok(!text.includes(String(free.byId[q.b].value)) || String(free.byId[q.b].value) === String(free.byId[q.a].value));
  assert.equal(p.verbs.hi, BY_KEY[q.m].hi);
  assert.ok(promptText(p).startsWith(p.bottom.label + ' 比 ' + p.top.label));
  assert.ok(segmentBannerText(p).startsWith('下一组：比'));
  const rv = revealOf(free.byId[q.b]);
  assert.equal(rv.value, free.byId[q.b].value);
  assert.ok(rv.sourceText.startsWith('来源：'));
});
