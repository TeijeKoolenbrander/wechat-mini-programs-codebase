#!/usr/bin/env node
/**
 * Tuning and distribution tool (spec 7.5; pattern: cheatshaizi tools/stats.js).
 *
 *   node tools/simstats.js [--seeds 100000] [--optseeds 3000] [--gateseeds 200]
 *                          [--set tau=0.45] [--curve 4.8,5.2,...] [--out report.md]
 *                          [--bank 30 [--bank-file path]] [--check]
 *
 * Reports, over the seeds: the four player models against the 7.5 targets,
 * the sensible band shares, optimal (复盘) rates, arguability checks, the
 * 复盘 search timing (incl. the constructed worst case), cell frequencies by
 * tier, and gateCheck timing. --check exits non-zero if a hard target fails
 * (CI gate, AC 15). --bank writes accepted daily seeds (never commit it).
 */

const fs = require('fs');
const path = require('path');
const { hash32, sub } = require('../core/rng');
const { getConfig, LATEST_CONFIG_VERSION } = require('../core/config');
const { getContent, LATEST_CONTENT_VERSION, SLOTS, cellKey } = require('../core/content');
const { makeScenario, simulateScenario } = require('../core/sim');
const { buildSheet } = require('../core/sheet');
const { bestLineup } = require('../core/search');
const { playRun } = require('../core/players');
const { gateCheck, acceptDailySeed } = require('../core/gates');

function parseArgs(argv) {
  const a = { offset: 0, seeds: 100000, optseeds: 3000, gateseeds: 200, sets: [], out: null, bank: 0, check: false, curve: null };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--seeds') a.seeds = +argv[++i];
    else if (k === '--offset') a.offset = +argv[++i];
    else if (k === '--optseeds') a.optseeds = +argv[++i];
    else if (k === '--gateseeds') a.gateseeds = +argv[++i];
    else if (k === '--set') a.sets.push(argv[++i]);
    else if (k === '--curve') a.curve = argv[++i].split(',').map(Number);
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--bank') a.bank = +argv[++i];
    else if (k === '--bank-file') a.bankFile = argv[++i];
    else if (k === '--check') a.check = true;
  }
  return a;
}

function applySets(config, args) {
  if (args.curve) config.curve = args.curve;
  for (const s of args.sets) {
    const [k, v] = s.split('=');
    const parts = k.split('.');
    let o = config;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = Number(v);
  }
}

let seedBase = 0;
const seedOf = (i) => hash32('simstats:' + (i + seedBase));
const pct = (x) => (100 * x).toFixed(2) + '%';
const q = (arr, p) => {
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

function distStats(wins) {
  const n = wins.length;
  const hist = new Array(13).fill(0);
  let sum = 0;
  for (const w of wins) {
    hist[w]++;
    sum += w;
  }
  let acc = 0;
  let median = 0;
  for (let w = 0; w <= 12; w++) {
    acc += hist[w];
    if (acc >= n / 2) {
      median = w;
      break;
    }
  }
  return { n, mean: sum / n, median, hist };
}

function bandShares(config, hist, n) {
  return config.bands.map((b) => {
    let c = 0;
    for (let w = b.min; w <= b.max; w++) c += hist[w];
    return { key: b.key, label: b.label, share: c / n, target: b.target };
  });
}

function run(args) {
  seedBase = args.offset || 0;
  const config = getConfig(LATEST_CONFIG_VERSION);
  applySets(config, args);
  const cv = LATEST_CONTENT_VERSION;
  const content = getContent(cv);
  const lines = [];
  const out = (s) => {
    lines.push(s);
    console.log(s);
  };
  const failures = [];
  const note = (msg) => out(`- NOTE ${msg}`);
  const check = (ok, msg) => {
    out((ok ? '- PASS ' : '- FAIL ') + msg);
    if (!ok) failures.push(msg);
  };

  out('# simstats report');
  out('');
  out(`contentVersion ${cv}, configVersion ${config.configVersion}, gateVersion ${config.gateVersion}, node ${process.version}`);
  out(`seeds ${args.seeds}; tau ${config.tau}; jitter ${config.jitter}; curve [${config.curve.join(', ')}]`);
  out('');

  // --- player models over N seeds --------------------------------------
  const models = ['random', 'naive', 'greedy', 'sensible'];
  const wins = {};
  const evFired = { count: 0, n: 0 };
  const cellCount = {};
  const tierAppear = { jia: 0, yi: 0, bing: 0 };
  const t0 = Date.now();
  for (const m of models) wins[m] = [];
  for (let i = 0; i < args.seeds; i++) {
    const seed = seedOf(i);
    const scn = makeScenario(seed, cv, config.configVersion);
    for (const m of models) {
      const rng = sub(seed, 'sim:' + m);
      const r = playRun(m, seed, cv, 'free', rng, scn);
      wins[m].push(r.record.w);
      if (m === 'sensible') {
        evFired.n++;
        if (r.sim.events.length > 0) evFired.count++;
      }
    }
    const sheet = buildSheet(seed, cv, config.configVersion);
    for (const r of sheet) {
      const k = cellKey(r.faction, r.era);
      cellCount[k] = (cellCount[k] || 0) + 1;
    }
  }
  void tierAppear;
  out(`models simulated in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  out('');
  out('## Player models (free play, 1 free re-spin per dimension)');
  out('');
  out('| model | mean wins | median | 12-0 | target |');
  out('|---|---|---|---|---|');
  const stats = {};
  for (const m of models) {
    const s = distStats(wins[m]);
    stats[m] = s;
    const tgt = { random: 'mean 4.5-5.5', naive: 'mean 7-8', greedy: 'mean 8-9, 12-0 <= 5%', sensible: 'median 7, 12-0 1-3%' }[m];
    out(`| ${m} | ${s.mean.toFixed(2)} | ${s.median} | ${pct(s.hist[12] / s.n)} | ${tgt} |`);
  }
  out('');
  note(`random mean ${stats.random.mean.toFixed(2)} (soft; original target 4.5-5.5)`);
  note(`naive mean ${stats.naive.mean.toFixed(2)} (soft; original target 7-8)`);
  note(`greedy mean ${stats.greedy.mean.toFixed(2)} (soft; original target 8-9)`);
  check(stats.greedy.hist[12] / stats.greedy.n <= 0.01, `greedy 12-0 ${pct(stats.greedy.hist[12] / stats.greedy.n)} <= 1%`);
  check(stats.random.hist[12] / stats.random.n < 0.0001, `random 12-0 ${pct(stats.random.hist[12] / stats.random.n)} < 0.01%`);
  check(stats.naive.hist[12] / stats.naive.n < 0.002, `naive 12-0 ${pct(stats.naive.hist[12] / stats.naive.n)} < 0.2%`);
  check(stats.sensible.hist[12] / stats.sensible.n >= 0.002 && stats.sensible.hist[12] / stats.sensible.n <= 0.005, `sensible 12-0 ${pct(stats.sensible.hist[12] / stats.sensible.n)} in 0.2-0.5%`);
  check(stats.sensible.median >= 6 && stats.sensible.median <= 7, `sensible median ${stats.sensible.median} in 6-7`);
  out('');
  out('## Sensible band shares vs 7.5 targets');
  out('');
  out('| band | wins | share | target | ok |');
  out('|---|---|---|---|---|');
  const shares = bandShares(config, stats.sensible.hist, stats.sensible.n);
  shares.forEach((b, k) => {
    const cfgB = config.bands[k];
    const ok = b.share >= b.target[0] && b.share <= b.target[1];
    out(`| ${b.label} | ${cfgB.min === cfgB.max ? cfgB.min : cfgB.min + '-' + cfgB.max} | ${pct(b.share)} | ${pct(b.target[0])} - ${pct(b.target[1])} | ${ok ? 'yes' : 'NO'} |`);
    failuresIf(!ok, `band ${b.label} share ${pct(b.share)} in ${pct(b.target[0])}-${pct(b.target[1])}`);
  });
  function failuresIf(bad, msg) {
    if (bad) failures.push(msg);
  }
  out('');
  out('Cumulative share of sensible runs reaching w wins or better (config.freeRarity):');
  out('');
  const cum = [];
  let acc = 0;
  for (let w = 12; w >= 0; w--) {
    acc += stats.sensible.hist[w];
    cum[w] = acc / stats.sensible.n;
  }
  out('`[' + cum.map((x) => +x.toFixed(4)).join(', ') + ']`');
  out('');
  out(`Events fired in ${pct(evFired.count / evFired.n)} of sensible runs (target 15-30%).`);
  failuresIf(evFired.count / evFired.n < 0.15 || evFired.count / evFired.n > 0.3, 'events fire in 15-30% of runs');
  out('');

  // --- cell frequencies (AC 6) ------------------------------------------
  out('## Cell frequencies over seeds (AC 6: tiers never change draw odds)');
  out('');
  const totalCells = Object.values(cellCount).reduce((a, b) => a + b, 0);
  const expect = 1 / content.validCells.length;
  let maxDev = 0;
  for (const c of content.validCells) {
    const f = (cellCount[cellKey(c.faction, c.era)] || 0) / totalCells;
    maxDev = Math.max(maxDev, Math.abs(f - expect) / expect);
  }
  out(`16 cells, expected ${pct(expect)} each; max relative deviation ${pct(maxDev)} (uniform by construction, no weighting by tier or rarity).`);
  check(maxDev < 0.05, 'cell frequencies uniform within 5%');
  out('');

  // --- optimal / 复盘 ----------------------------------------------------
  out('## Optimal (复盘) rates and search timing');
  out('');
  const N = Math.min(args.optseeds, args.seeds);
  let opt12 = 0;
  let optSensible12 = 0;
  const times = [];
  const evals = [];
  const localTimes = []; // 复盘 searches the client runs itself (<= config.search.heavySets sets)
  let heavyCount = 0;
  const occupants = SLOTS.map(() => ({}));
  const generalCount = {};
  for (let i = 0; i < N; i++) {
    const seed = seedOf(i);
    const sheet = buildSheet(seed, cv, config.configVersion);
    const primary = sheet.map((r) => ({ faction: r.faction, era: r.era }));
    const scn = makeScenario(seed, cv, config.configVersion);
    const t = process.hrtime.bigint();
    const b = bestLineup(seed, cv, primary, { scenario: scn });
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    times.push(ms);
    evals.push(b ? b.evaluated : 0);
    if (b && b.record.l === 0) opt12++;
    if (b) {
      b.lineup.forEach((e, k) => {
        occupants[k][e.generalId] = (occupants[k][e.generalId] || 0) + 1;
        generalCount[e.generalId] = (generalCount[e.generalId] || 0) + 1;
      });
    }
    // 复盘 on the sensible player's own final tokens (the real use)
    const rng = sub(seed, 'sim:sensible');
    const r = playRun('sensible', seed, cv, 'free', rng, scn);
    const t2 = process.hrtime.bigint();
    const b2 = bestLineup(seed, cv, r.run.finalTokens, { scenario: scn });
    const ms2 = Number(process.hrtime.bigint() - t2) / 1e6;
    times.push(ms2);
    if (b2 && b2.sets > config.search.heavySets) heavyCount++;
    else localTimes.push(ms2);
    if (b2 && b2.record.l === 0) optSensible12++;
  }
  out(`Optimal over primary tokens (no re-spins), ${N} seeds: 12-0 on ${pct(opt12 / N)} (target >= 95%).`);
  out(`Optimal over the sensible player's final tokens (what 复盘 shows), ${N} seeds: 12-0 on ${pct(optSensible12 / N)}.`);
  note(`optimal 12-0 on ${pct(opt12 / N)} of free seeds (soft; original target >= 95%, relaxed by the 12-0-is-really-hard decision)`);
  out('');
  const sorted = times.slice().sort((a, b) => a - b);
  out(`Search time over ${times.length} searches (node ${process.version}, this machine): p50 ${q(times, 0.5).toFixed(1)} ms, p90 ${q(times, 0.9).toFixed(1)} ms, p99 ${q(times, 0.99).toFixed(1)} ms, max ${sorted[sorted.length - 1].toFixed(1)} ms; lineup evaluations p50 ${q(evals, 0.5)}, p99 ${q(evals, 0.99)}, max ${Math.max(...evals)}.`);
  const lsorted = localTimes.slice().sort((a, b) => a - b);
  out(`Client-side 复盘 (the sensible player's final tokens, <= ${config.search.heavySets} distinct sets): ${localTimes.length} searches, p50 ${q(localTimes, 0.5).toFixed(1)} ms, p99 ${q(localTimes, 0.99).toFixed(1)} ms, max ${lsorted[lsorted.length - 1].toFixed(1)} ms. ${heavyCount} of ${N} runs (${pct(heavyCount / N)}) exceed that size and are served by getReplay first (spec 7.4).`);
  const worst = worstCase(content, config, cv);
  out(`Constructed worst case (largest set count over all token combinations sampled, ${worst.label}): ${worst.sets} distinct sets, ${worst.evaluated} lineup evaluations, ${worst.ms.toFixed(1)} ms.`);
  check(lsorted[lsorted.length - 1] < 300, `client-side 复盘 max ${lsorted[lsorted.length - 1].toFixed(1)} ms < 300 ms in node (heavy token sets go to getReplay; the constructed worst case is one of them)`);
  out('');

  // --- arguability ---------------------------------------------------------
  out('## Arguability');
  out('');
  const topGeneral = Object.entries(generalCount).sort((a, b) => b[1] - a[1])[0];
  const share = topGeneral ? topGeneral[1] / N : 0;
  check(share <= 0.6, `most frequent general in optimal lineups: ${content.byId[topGeneral[0]].name} in ${pct(share)} (<= 60%)`);
  SLOTS.forEach((s, k) => {
    const entries = Object.entries(occupants[k]).sort((a, b) => b[1] - a[1]);
    const top3 = entries.slice(0, 3).map(([id, c]) => `${content.byId[id].name} ${pct(c / N)}`).join(', ');
    out(`- ${content.roleByKey[s].label}: ${entries.length} different best occupants; top: ${top3}`);
    failuresIf(entries.length < 4, `role ${s} best occupant varies`);
  });
  out('');

  // --- gates ---------------------------------------------------------------
  out('## Daily gates');
  out('');
  const gt = [];
  let accepted = 0;
  let gOptFail = 0;
  let sumG = 0;
  let sumR = 0;
  let nGate = 0;
  for (let i = 0; i < args.gateseeds; i++) {
    const seed = hash32('gate:' + i);
    const t = process.hrtime.bigint();
    const g = gateCheck(seed, cv, config.configVersion);
    gt.push(Number(process.hrtime.bigint() - t) / 1e6);
    if (g.pass.all) accepted++;
    if (!g.pass.optimal) gOptFail++;
    else {
      sumG += g.greedyRate;
      sumR += g.randomRate;
      nGate++;
    }
  }
  out(`Seeds where perfect play reaches 12-0 (the 'relaxed' daily fallback, spec 5.2): ${pct(1 - gOptFail / args.gateseeds)}.`);
  out(`gateCheck over ${args.gateseeds} candidate seeds: accepted ${pct(accepted / args.gateseeds)}; optimal failed ${pct(gOptFail / args.gateseeds)}; mean greedy 12-0 rate ${pct(sumG / Math.max(1, nGate))}; mean random 12-0 rate ${pct(sumR / Math.max(1, nGate))}.`);
  out(`gateCheck time per seed: median ${q(gt, 0.5).toFixed(1)} ms, p99 ${q(gt, 0.99).toFixed(1)} ms; p99 x 50 candidates = ${(q(gt, 0.99) * 50 / 1000).toFixed(1)} s (cloud-function-equivalent Node runtime).`);
  const pAccept = accepted / args.gateseeds;
  out(`Probability that at least one of 50 candidates is accepted: ${pct(1 - Math.pow(1 - pAccept, 50))}.`);
  note(`strict daily gate acceptance ${pct(pAccept)}; P(at least one of 50 live tries passes) ${pct(1 - Math.pow(1 - pAccept, 50))}; about ${pAccept > 0 ? Math.round(1 / pAccept) : 'many'} candidates per accepted seed, so the offline seed bank (--bank) is mandatory`);
  out('');

  // --- bank ---------------------------------------------------------------
  if (args.bank > 0) {
    const bank = [];
    const t0Bank = Date.now();
    let cand = 0;
    while (bank.length < args.bank && cand < args.bank * 5000) {
      const seed = hash32('bank:' + Date.now() + ':' + cand++);
      const r = acceptDailySeed(seed, { contentVersion: cv, configVersion: config.configVersion });
      if (r.accepted) bank.push({ seed, contentVersion: cv, configVersion: config.configVersion, gateVersion: config.gateVersion, best: r.best, gates: r.gates, used: false });
    }
    const file = args.bankFile || path.join(process.cwd(), 'daily-seed-bank.json');
    fs.writeFileSync(file, JSON.stringify(bank, null, 1));
    out(`Wrote ${bank.length} accepted seeds to ${file} (tried ${cand} candidates, about ${bank.length ? Math.round(cand / bank.length) : 0} per accepted seed, ${((Date.now() - t0Bank) / 1000).toFixed(0)} s) (spoiler: never commit it, delete after import).`);
  }

  out('');
  out(failures.length ? `RESULT: ${failures.length} target(s) not met` : 'RESULT: all targets met');
  for (const f of failures) out('  not met: ' + f);
  if (args.out) fs.writeFileSync(args.out, lines.join('\n') + '\n');
  return { failures, stats, shares, cum };
}

/** The costliest token combination: five rounds on the biggest, most distinct cells. */
function worstCase(content, config, cv) {
  const cells = content.validCells.slice().sort((a, b) => content.cells[cellKey(b.faction, b.era)].length - content.cells[cellKey(a.faction, a.era)].length);
  // five different biggest cells maximise the number of distinct sets
  const top = cells.slice(0, 5).map((c) => ({ faction: c.faction, era: c.era }));
  const same = [0, 1, 2, 3, 4].map(() => ({ faction: cells[0].faction, era: cells[0].era }));
  let worst = { sets: 0, evaluated: 0, ms: 0, label: '' };
  for (const [label, tokens] of [['five biggest distinct cells', top], ['five times the biggest cell', same]]) {
    for (let rep = 0; rep < 3; rep++) {
      const seed = hash32('worst:' + rep);
      const scn = makeScenario(seed, cv, config.configVersion);
      const t = process.hrtime.bigint();
      const b = bestLineup(seed, cv, tokens, { scenario: scn });
      const ms = Number(process.hrtime.bigint() - t) / 1e6;
      if (b && ms >= worst.ms) worst = { sets: b.sets, evaluated: b.evaluated, ms, label };
    }
  }
  return worst;
}

if (require.main === module) {
  const args = parseArgs(process.argv);
  const res = run(args);
  if (args.check && res.failures.length) process.exit(1);
}

module.exports = { run, parseArgs, worstCase };
void simulateScenario;
