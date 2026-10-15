'use strict';
// QA: independent re-measurement of the founder tuning override ("12-0 must be really hard"), using
// the core player models but a DIFFERENT seed namespace and our own tallies (not simstats' report).
// QA_SEEDS (default 30000) sets the sample size; 100000 reproduces the report scale.
// v1 amendment (contentVersion 2): the same hard targets are measured for BOTH content versions, each with its own
// configVersion (content 1 / config 1 stays intact for old seeds; content 2 / config 2 is the live pair).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hash32, sub } = require('../core/rng');
const { getConfig, bandFor } = require('../core/config');
const { makeScenario } = require('../core/sim');
const { buildSheet } = require('../core/sheet');
const { playRun } = require('../core/players');
const { gateCheck } = require('../core/gates');

const N = +(process.env.QA_SEEDS || 30000);
const PAIRS = [
  { cv: 1, cfg: 1 },
  { cv: 2, cfg: 2 },
];

for (const { cv, cfg } of PAIRS) {
  const config = getConfig(cfg);

  test(`[content ${cv} / config ${cfg}] override targets over ${N} independent seeds: sensible 12-0 in 0.2-0.5%, greedy <= 1%, naive < 0.2%, random < 0.01%, median 6-7, bands 10-11 in 6-10%, 0-1 <= 2%`, { timeout: 1800000 }, () => {
    const hist = { random: Array(13).fill(0), naive: Array(13).fill(0), greedy: Array(13).fill(0), sensible: Array(13).fill(0) };
    for (let i = 0; i < N; i++) {
      const seed = hash32('qa-tuning:' + i);
      const scn = makeScenario(seed, cv, cfg);
      const rounds = buildSheet(seed, cv, cfg);
      for (const m of Object.keys(hist)) hist[m][playRun(m, seed, cv, 'free', sub(seed, 'sim:' + m), scn, { rounds }).record.w]++;
    }
    const share = (m, lo, hi) => hist[m].slice(lo, hi + 1).reduce((a, b) => a + b, 0) / N;
    const median = (m) => { let a = 0; for (let w = 0; w <= 12; w++) { a += hist[m][w]; if (a >= N / 2) return w; } };
    const report = Object.fromEntries(Object.keys(hist).map((m) => [m, { p12: +(100 * share(m, 12, 12)).toFixed(3), median: median(m) }]));
    console.log(`QA tuning content ${cv} (own seeds):`, JSON.stringify(report), 'sensible 10-11:', (100 * share('sensible', 10, 11)).toFixed(2) + '%', '0-1:', (100 * share('sensible', 0, 1)).toFixed(2) + '%');
    // 12-0 is a rare event: allow 2 standard errors of sampling noise (the true rate sits near the 0.2% floor)
    const p12 = share('sensible', 12, 12);
    const se = Math.sqrt((p12 * (1 - p12)) / N);
    assert.ok(p12 + 2 * se >= 0.002 && p12 - 2 * se <= 0.005, `sensible 12-0 ${p12} +- ${se}`);
    assert.ok(share('greedy', 12, 12) <= 0.01, 'greedy 12-0');
    assert.ok(share('naive', 12, 12) < 0.002, 'naive 12-0');
    assert.ok(share('random', 12, 12) < 0.0001, 'random 12-0');
    assert.ok(median('sensible') >= 6 && median('sensible') <= 7, 'median ' + median('sensible'));
    assert.ok(share('sensible', 10, 11) >= 0.06 && share('sensible', 10, 11) <= 0.10, '10-11 ' + share('sensible', 10, 11));
    assert.ok(share('sensible', 0, 1) <= 0.02, '0-1 ' + share('sensible', 0, 1));
    // the band table agrees with the wins it labels (AC 12): every w 0..12 maps to exactly one band
    for (let w = 0; w <= 12; w++) assert.equal(config.bands.filter((b) => w >= b.min && w <= b.max).length, 1, 'band for ' + w);
    assert.equal(bandFor(config, 12).label, '一统天下');
  });

  test(`[content ${cv} / config ${cfg}] free-play rarity table in config matches the measured sensible distribution (within 1.5 points)`, { timeout: 1800000 }, () => {
    const n = Math.min(N, 20000);
    const hist = Array(13).fill(0);
    for (let i = 0; i < n; i++) {
      const seed = hash32('qa-rarity:' + i);
      hist[playRun('sensible', seed, cv, 'free', sub(seed, 'sim:sensible'), makeScenario(seed, cv, cfg)).record.w]++;
    }
    let acc = 0;
    for (let w = 12; w >= 0; w--) {
      acc += hist[w];
      assert.ok(Math.abs(acc / n - config.freeRarity[w]) < 0.015, `rarity[${w}] config ${config.freeRarity[w]} measured ${(acc / n).toFixed(4)}`);
    }
  });

  test(`[content ${cv} / config ${cfg}] daily gate window is the tuned one: greedy [0.25%, 20%], random < 0.5%, K = 400 (spec 7.5.1 amended)`, () => {
    const g = config.gates;
    assert.equal(g.greedy.rateMin, 0.0025);
    assert.equal(g.greedy.rateMax, 0.2);
    assert.ok(g.random.rateMax <= 0.005);
    assert.equal(g.K, 400);
  });

  test(`[content ${cv} / config ${cfg}] event p threshold is the tuned 0.672 for both 奇谋 and 万夫莫敌 (spec 7.2 said 0.35)`, () => {
    assert.equal(config.events.stratagem.pMin, 0.672);
    assert.equal(config.events.unstoppable.pMin, 0.672);
  });
}

test('accepted daily seeds (content 2 / config 2): optimal reaches 12-0 on 100%, gate record is reproducible, acceptDailySeed stores a 12-0 best (AC 21, 55, 74)', { timeout: 600000 }, () => {
  // found by scanning the gate on a candidate stream the real bank does not use (hash32('bank:2:' + i), i >= 900000000)
  const accepted = [1989661826, 3598505694, 2259125502];
  const { acceptDailySeed } = require('../core/gates');
  const { simulate } = require('../core/sim');
  for (const s of accepted) {
    const a = gateCheck(s, 2, 2);
    assert.deepEqual(a, gateCheck(s, 2, 2), 'gateCheck deterministic');
    assert.deepEqual(a.optimal, { w: 12, l: 0 });
    assert.equal(a.pass.all, true, 'seed ' + s + ' still passes the gate (regenerate the list after any retune)');
    assert.equal(a.relaxed, false);
    const r = acceptDailySeed(s, { contentVersion: 2, configVersion: 2 });
    assert.equal(r.accepted, true);
    assert.deepEqual(r.gates, a);
    assert.deepEqual(simulate(r.best.lineup, s, 2, 2).record, { w: 12, l: 0 }, 'the stored best lineup (with drafted factions) scores 12-0');
    for (const e of r.best.lineup) assert.ok(e.faction);
  }
});

test('accepted daily seeds (content 1): optimal reaches 12-0 on 100%, gate record is reproducible (AC 21, 55)', { timeout: 600000 }, () => {
  // seeds found by scanning the gate; fixed here so the test is fast and deterministic
  const accepted = [3299020323, 3344646458, 2357971745, 194365319, 1126409683, 2493224454];
  for (const s of accepted) {
    const a = gateCheck(s, 1, 1);
    const b = gateCheck(s, 1, 1);
    assert.deepEqual(a, b, 'gateCheck deterministic');
    assert.deepEqual(a.optimal, { w: 12, l: 0 });
    assert.equal(a.pass.all, true, 'seed ' + s + ' still passes the gate (regenerate the list after any retune)');
    assert.equal(a.K, 400);
    assert.equal(a.relaxed, false);
  }
});
