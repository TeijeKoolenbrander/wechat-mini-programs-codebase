'use strict';
// QA: independent re-measurement of the founder tuning override ("12-0 must be really hard"), using
// the core player models but a DIFFERENT seed namespace and our own tallies (not simstats' report).
// QA_SEEDS (default 30000) sets the sample size; 100000 reproduces the report scale.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hash32, sub } = require('../core/rng');
const { getConfig, LATEST_CONFIG_VERSION, bandFor } = require('../core/config');
const { makeScenario } = require('../core/sim');
const { playRun } = require('../core/players');
const { gateCheck } = require('../core/gates');

const N = +(process.env.QA_SEEDS || 30000);
const config = getConfig(LATEST_CONFIG_VERSION);

test(`override targets over ${N} independent seeds: sensible 12-0 in 0.2-0.5%, greedy <= 1%, naive < 0.2%, random < 0.01%, median 6-7, bands 10-11 in 6-10%, 0-1 <= 2%`, { timeout: 900000 }, () => {
  const hist = { random: Array(13).fill(0), naive: Array(13).fill(0), greedy: Array(13).fill(0), sensible: Array(13).fill(0) };
  for (let i = 0; i < N; i++) {
    const seed = hash32('qa-tuning:' + i);
    const scn = makeScenario(seed, 1, config.configVersion);
    for (const m of Object.keys(hist)) hist[m][playRun(m, seed, 1, 'free', sub(seed, 'sim:' + m), scn).record.w]++;
  }
  const share = (m, lo, hi) => hist[m].slice(lo, hi + 1).reduce((a, b) => a + b, 0) / N;
  const median = (m) => { let a = 0; for (let w = 0; w <= 12; w++) { a += hist[m][w]; if (a >= N / 2) return w; } };
  const report = Object.fromEntries(Object.keys(hist).map((m) => [m, { p12: +(100 * share(m, 12, 12)).toFixed(3), median: median(m) }]));
  console.log('QA tuning (own seeds):', JSON.stringify(report), 'sensible 10-11:', (100 * share('sensible', 10, 11)).toFixed(2) + '%', '0-1:', (100 * share('sensible', 0, 1)).toFixed(2) + '%');
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

test('free-play rarity table in config matches the measured sensible distribution (within 1.5 points)', { timeout: 900000 }, () => {
  const n = Math.min(N, 20000);
  const hist = Array(13).fill(0);
  for (let i = 0; i < n; i++) {
    const seed = hash32('qa-rarity:' + i);
    hist[playRun('sensible', seed, 1, 'free', sub(seed, 'sim:sensible'), makeScenario(seed, 1, 1)).record.w]++;
  }
  let acc = 0;
  for (let w = 12; w >= 0; w--) {
    acc += hist[w];
    assert.ok(Math.abs(acc / n - config.freeRarity[w]) < 0.015, `rarity[${w}] config ${config.freeRarity[w]} measured ${(acc / n).toFixed(4)}`);
  }
});

test('accepted daily seeds: optimal reaches 12-0 on 100%, gate record is reproducible (AC 21, 55)', { timeout: 600000 }, () => {
  // seeds found by scanning the gate; fixed here so the test is fast and deterministic
  const accepted = [2640833434, 2520676696, 1999152330, 3751261748, 3451261328, 646540801];
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

test('daily gate window is the spec 0.5-5% greedy band (7.5.1) and random < 0.5%',
  { todo: 'DEVIATION: config.gates.greedy is [0.25%, 20%]; accepted seeds were measured at up to 14% noisy-greedy 12-0 (founder: 12-0 must be really hard)' },
  () => {
    const g = config.gates;
    assert.ok(g.greedy.rateMin >= 0.005 && g.greedy.rateMax <= 0.05, `greedy window ${g.greedy.rateMin}-${g.greedy.rateMax}`);
    assert.ok(g.random.rateMax <= 0.005);
    assert.equal(g.K, 400);
  });

test('event p threshold equals the spec 7.2 value (0.35)',
  { todo: 'DEVIATION: config.events.*.pMin is 0.672 (spec 7.2 says p_i >= 0.35); tuning change not reflected in the spec' },
  () => {
    assert.equal(config.events.stratagem.pMin, 0.35);
    assert.equal(config.events.unstoppable.pMin, 0.35);
  });
