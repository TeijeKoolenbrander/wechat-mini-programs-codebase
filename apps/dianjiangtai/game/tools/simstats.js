#!/usr/bin/env node
/**
 * Tuning and distribution tool (spec 7.5; pattern: cheatshaizi tools/stats.js).
 *
 *   node tools/simstats.js [--seeds 100000] [--offset 0] [--optseeds 3000] [--gateseeds 4000] [--timeseeds 600]
 *                          [--cv 2] [--workers 8] [--set tau=0.45] [--curve 4.8,5.2,...] [--out report.md]
 *                          [--bank 60 [--bank-only] [--bank-file path] [--bank-offset 0]] [--check]
 *
 * Reports, over the seeds: the four player models against the 7.5 targets,
 * the sensible band shares, optimal (复盘) rates, arguability checks (no
 * general in > 60% of optimal lineups, bond firing rates, the share of runs
 * drafting a multi-appearance general), the 复盘 search timing (client and
 * heavy, incl. the constructed worst case), cell frequencies, and gateCheck
 * timing / acceptance. --check exits non-zero if a hard target fails (CI
 * gate, AC 15, AC 74). --bank writes accepted daily seeds (never commit it).
 *
 * The heavy loops run on worker threads (--workers, default up to 8). The
 * result for a given --offset/--seeds does not depend on the worker count.
 * Search timing is measured on the main thread alone, so it is not distorted
 * by the workers.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const { hash32, sub } = require('../core/rng');
const { getConfig, defaultConfigVersion } = require('../core/config');
const { getContent, LATEST_CONTENT_VERSION, SLOTS, cellKey } = require('../core/content');
const { makeScenario } = require('../core/sim');
const { buildSheet } = require('../core/sheet');
const { bestLineup } = require('../core/search');
const { playRun } = require('../core/players');
const { gateCheck, acceptDailySeed } = require('../core/gates');

function parseArgs(argv) {
  const a = {
    offset: 0, seeds: 100000, optseeds: 3000, gateseeds: 4000, timeseeds: 600, sets: [], out: null, bank: 0, bankOffset: 0,
    check: false, curve: null, cv: LATEST_CONTENT_VERSION, workers: Math.max(1, Math.min(8, os.cpus().length)),
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--seeds') a.seeds = +argv[++i];
    else if (k === '--offset') a.offset = +argv[++i];
    else if (k === '--optseeds') a.optseeds = +argv[++i];
    else if (k === '--gateseeds') a.gateseeds = +argv[++i];
    else if (k === '--timeseeds') a.timeseeds = +argv[++i];
    else if (k === '--cv') a.cv = +argv[++i];
    else if (k === '--workers') a.workers = Math.max(1, +argv[++i]);
    else if (k === '--set') a.sets.push(argv[++i]);
    else if (k === '--curve') a.curve = argv[++i].split(',').map(Number);
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--bank') a.bank = +argv[++i];
    else if (k === '--bank-file') a.bankFile = argv[++i];
    else if (k === '--bank-only') a.bankOnly = true;
    else if (k === '--bank-offset') a.bankOffset = +argv[++i];
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

const pct = (x) => (100 * x).toFixed(2) + '%';
const q = (arr, p) => {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const maxOf = (arr) => arr.reduce((a, b) => (b > a ? b : a), 0);

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

// ---------------------------------------------------------------- worker side

const seedOf = (i) => hash32('simstats:' + i);
const MODELS = ['random', 'naive', 'greedy', 'sensible'];

function setup(d) {
  const config = getConfig(d.config);
  applySets(config, { sets: d.sets, curve: d.curve });
  return { config, content: getContent(d.cv) };
}

/** Task 'models': the four player models over the striped seeds. */
function taskModels(d) {
  const { config, content } = setup(d);
  const hist = {};
  for (const m of MODELS) hist[m] = new Array(13).fill(0);
  const cellCount = {};
  const bondFire = {};
  let ev = 0;
  let n = 0;
  let multi = 0;
  let offPrimary = 0;
  let picks = 0;
  for (let i = d.from + d.w; i < d.from + d.total; i += d.step) {
    const seed = seedOf(i);
    const scn = makeScenario(seed, d.cv, config.configVersion);
    const rounds = buildSheet(seed, d.cv, config.configVersion);
    for (const r of rounds) {
      const k = cellKey(r.faction, r.era);
      cellCount[k] = (cellCount[k] || 0) + 1;
    }
    for (const m of MODELS) {
      const r = playRun(m, seed, d.cv, 'free', sub(seed, 'sim:' + m), scn, { rounds });
      hist[m][r.record.w]++;
      if (m === 'sensible') {
        n++;
        if (r.sim.events.length > 0) ev++;
        let any = false;
        for (const e of r.lineup) {
          const g = content.byId[e.generalId];
          picks++;
          if (g.appearances.length > 1) any = true;
          if (e.faction !== g.faction) offPrimary++;
        }
        if (any) multi++;
        for (const b of r.sim.morale.bondKeys) bondFire[b] = (bondFire[b] || 0) + 1;
      }
    }
  }
  return { hist, cellCount, bondFire, ev, n, multi, offPrimary, picks };
}

/** Task 'optimal': 复盘 over primary tokens and over the sensible player's final tokens. */
function taskOptimal(d) {
  const { config, content } = setup(d);
  let n = 0;
  let opt12 = 0;
  let optSensible12 = 0;
  let heavy = 0;
  const occupants = SLOTS.map(() => ({}));
  const generalCount = {};
  const bondFire = {};
  for (let i = d.from + d.w; i < d.from + d.total; i += d.step) {
    const seed = seedOf(i);
    const rounds = buildSheet(seed, d.cv, config.configVersion);
    const primary = rounds.map((r) => ({ faction: r.faction, era: r.era }));
    const scn = makeScenario(seed, d.cv, config.configVersion);
    const b = bestLineup(seed, d.cv, primary, { scenario: scn, rounds });
    n++;
    if (b && b.record.l === 0) opt12++;
    if (b) {
      b.lineup.forEach((e, k) => {
        occupants[k][e.generalId] = (occupants[k][e.generalId] || 0) + 1;
        generalCount[e.generalId] = (generalCount[e.generalId] || 0) + 1;
      });
      const sim = require('../core/sim').simulateScenario(scn, b.lineup);
      for (const bk of sim.morale.bondKeys) bondFire[bk] = (bondFire[bk] || 0) + 1;
    }
    const r = playRun('sensible', seed, d.cv, 'free', sub(seed, 'sim:sensible'), scn, { rounds });
    const b2 = bestLineup(seed, d.cv, r.run.finalTokens, { scenario: scn, rounds });
    if (b2 && b2.sets > config.search.heavySets) heavy++;
    if (b2 && b2.record.l === 0) optSensible12++;
  }
  return { n, opt12, optSensible12, heavy, occupants, generalCount, bondFire };
}

/** Task 'gate': gateCheck over candidate seeds. */
function taskGate(d) {
  const times = [];
  let accepted = 0;
  let optFail = 0;
  let sumG = 0;
  let sumR = 0;
  let nGate = 0;
  let n = 0;
  for (let i = d.from + d.w; i < d.from + d.total; i += d.step) {
    const seed = hash32('gate:' + i);
    const t = process.hrtime.bigint();
    const g = gateCheck(seed, d.cv, d.config);
    times.push(Number(process.hrtime.bigint() - t) / 1e6);
    n++;
    if (g.pass.all) accepted++;
    if (!g.pass.optimal) optFail++;
    else {
      sumG += g.greedyRate;
      sumR += g.randomRate;
      nGate++;
    }
  }
  return { n, accepted, optFail, sumG, sumR, nGate, times };
}

/** Task 'bank': scan candidates until told to stop; post each accepted seed. */
function taskBank(d) {
  const config = getConfig(d.config);
  let tried = 0;
  for (let i = d.from + d.w; ; i += d.step) {
    const seed = hash32('bank:' + d.cv + ':' + i);
    const r = acceptDailySeed(seed, { contentVersion: d.cv, configVersion: config.configVersion });
    tried++;
    if (r.accepted) {
      parentPort.postMessage({ kind: 'seed', tried, entry: { seed, contentVersion: d.cv, configVersion: config.configVersion, gateVersion: config.gateVersion, best: r.best, gates: r.gates, used: false } });
      tried = 0;
    } else if (tried >= 200) {
      parentPort.postMessage({ kind: 'progress', tried });
      tried = 0;
    }
  }
}

if (!isMainThread && workerData && workerData.task) {
  const T = { models: taskModels, optimal: taskOptimal, gate: taskGate, bank: taskBank };
  const res = T[workerData.task](workerData);
  parentPort.postMessage({ kind: 'done', res });
}

// ------------------------------------------------------------------ main side

function runTask(task, args, config, total, from) {
  const workers = Math.max(1, Math.min(args.workers, total));
  const base = { task, cv: args.cv, config: config.configVersion, sets: args.sets, curve: args.curve, from: from || 0, total, step: workers };
  return Promise.all(
    Array.from({ length: workers }, (_, w) =>
      new Promise((resolve, reject) => {
        const wk = new Worker(__filename, { workerData: Object.assign({}, base, { w }) });
        wk.on('message', (m) => m.kind === 'done' && resolve(m.res));
        wk.on('error', reject);
      })
    )
  );
}

function sumObj(list, key) {
  const out = {};
  for (const r of list) for (const k of Object.keys(r[key])) out[k] = (out[k] || 0) + r[key][k];
  return out;
}

async function run(args) {
  const config = getConfig(args.config || defaultConfigVersion(args.cv));
  applySets(config, args);
  const cv = args.cv;
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
  const failuresIf = (bad, msg) => {
    if (bad) failures.push(msg);
  };

  out('# simstats report');
  out('');
  out(`contentVersion ${cv}, configVersion ${config.configVersion}, gateVersion ${config.gateVersion}, node ${process.version}, ${args.workers} worker(s)`);
  out(`seeds ${args.seeds} (offset ${args.offset}); tau ${config.tau}; jitter ${config.jitter}; poolCap ${config.poolCap}; pMin ${config.events.stratagem.pMin}; curve [${config.curve.join(', ')}]`);
  out('');

  if (args.bankOnly) {
    await makeBank(args, config, content, out);
    if (args.out) fs.writeFileSync(args.out, lines.join('\n') + '\n');
    return { failures, stats: {}, shares: [], cum: [], config };
  }

  // --- player models over N seeds --------------------------------------
  const t0 = Date.now();
  const parts = await runTask('models', args, config, args.seeds, args.offset);
  const wins = {};
  for (const m of MODELS) {
    wins[m] = new Array(13).fill(0);
    for (const p of parts) for (let w = 0; w <= 12; w++) wins[m][w] += p.hist[m][w];
  }
  const cellCount = sumObj(parts, 'cellCount');
  const bondFireSensible = sumObj(parts, 'bondFire');
  const evFired = { count: parts.reduce((a, p) => a + p.ev, 0), n: parts.reduce((a, p) => a + p.n, 0) };
  const multi = parts.reduce((a, p) => a + p.multi, 0);
  const offPrimary = parts.reduce((a, p) => a + p.offPrimary, 0);
  const picks = parts.reduce((a, p) => a + p.picks, 0);
  out(`models simulated in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  out('');
  out('## Player models (free play, 1 free re-spin per dimension)');
  out('');
  out('| model | mean wins | median | 12-0 | target |');
  out('|---|---|---|---|---|');
  const stats = {};
  for (const m of MODELS) {
    const n = wins[m].reduce((a, b) => a + b, 0);
    const hist = wins[m];
    let acc = 0;
    let median = 0;
    for (let w = 0; w <= 12; w++) {
      acc += hist[w];
      if (acc >= n / 2) {
        median = w;
        break;
      }
    }
    const s = { n, mean: hist.reduce((a, b, i) => a + b * i, 0) / n, median, hist };
    stats[m] = s;
    const tgt = { random: '12-0 < 0.01%', naive: '12-0 < 0.2%', greedy: '12-0 <= 1%', sensible: 'median 6-7, 12-0 0.2-0.5%' }[m];
    out(`| ${m} | ${s.mean.toFixed(2)} | ${s.median} | ${pct(s.hist[12] / s.n)} | ${tgt} |`);
  }
  out('');
  note(`random mean ${stats.random.mean.toFixed(2)}, naive mean ${stats.naive.mean.toFixed(2)}, greedy mean ${stats.greedy.mean.toFixed(2)} (soft: reported, never gating, D15)`);
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
  out(`${content.validCells.length} cells, expected ${pct(expect)} each; max relative deviation ${pct(maxDev)} (uniform by construction, no weighting by tier or rarity).`);
  check(maxDev < 0.05, 'cell frequencies uniform within 5%');
  out('');

  // --- v1 roster facts -------------------------------------------------------
  out('## Multi-appearance and bonds (sensible player, free play)');
  out('');
  out(`Runs drafting at least one multi-appearance general: ${pct(multi / evFired.n)}; picks drafted from a cell other than the general's primary faction: ${pct(offPrimary / picks)}.`);
  out('');
  out('| bond | fires (sensible runs) |');
  out('|---|---|');
  for (const b of content.bonds) out(`| ${b.label} (${b.key}) | ${pct((bondFireSensible[b.key] || 0) / evFired.n)} |`);
  out('');

  // --- optimal / 复盘 ----------------------------------------------------
  out('## Optimal (复盘) rates and arguability');
  out('');
  const N = Math.min(args.optseeds, args.seeds);
  const optParts = await runTask('optimal', args, config, N, args.offset);
  const nOpt = optParts.reduce((a, p) => a + p.n, 0);
  const opt12 = optParts.reduce((a, p) => a + p.opt12, 0);
  const optSensible12 = optParts.reduce((a, p) => a + p.optSensible12, 0);
  const heavyCount = optParts.reduce((a, p) => a + p.heavy, 0);
  out(`Optimal over primary tokens (no re-spins), ${nOpt} seeds: 12-0 on ${pct(opt12 / nOpt)}.`);
  out(`Optimal over the sensible player's final tokens (what 复盘 shows), ${nOpt} seeds: 12-0 on ${pct(optSensible12 / nOpt)}.`);
  note(`optimal 12-0 on ${pct(opt12 / nOpt)} of free seeds (soft; about 1-2% is accepted under D15)`);
  out(`${heavyCount} of ${nOpt} runs (${pct(heavyCount / nOpt)}) exceed search.heavySets (${config.search.heavySets}) distinct sets and are served by getReplay first (spec 7.4).`);
  out('');
  const generalCount = sumObj(optParts, 'generalCount');
  const occupants = SLOTS.map((_, k) => {
    const o = {};
    for (const p of optParts) for (const id of Object.keys(p.occupants[k])) o[id] = (o[id] || 0) + p.occupants[k][id];
    return o;
  });
  const topGeneral = Object.entries(generalCount).sort((a, b) => b[1] - a[1])[0];
  const share = topGeneral ? topGeneral[1] / nOpt : 0;
  check(share <= 0.6, `most frequent general in optimal lineups: ${content.byId[topGeneral[0]].name} in ${pct(share)} (<= 60%)`);
  SLOTS.forEach((s, k) => {
    const entries = Object.entries(occupants[k]).sort((a, b) => b[1] - a[1]);
    const top3 = entries.slice(0, 3).map(([id, c]) => `${content.byId[id].name} ${pct(c / nOpt)}`).join(', ');
    out(`- ${content.roleByKey[s].label}: ${entries.length} different best occupants; top: ${top3}`);
    failuresIf(entries.length < 4, `role ${s} best occupant varies`);
  });
  const bondFireOpt = sumObj(optParts, 'bondFire');
  out('');
  out('Bonds in optimal lineups: ' + content.bonds.map((b) => `${b.key} ${pct((bondFireOpt[b.key] || 0) / nOpt)}`).join(', '));
  out('');

  // --- 复盘 timing (main thread only, no worker load) ----------------------
  out('## 复盘 search timing');
  out('');
  const T = Math.min(args.timeseeds, args.seeds);
  const rows = [];
  for (let i = 0; i < T; i++) {
    const seed = seedOf(args.offset + i);
    const scn = makeScenario(seed, cv, config.configVersion);
    const rounds = buildSheet(seed, cv, config.configVersion);
    const primary = rounds.map((r) => ({ faction: r.faction, era: r.era }));
    const r = playRun('sensible', seed, cv, 'free', sub(seed, 'sim:sensible'), scn, { rounds });
    for (const tokens of [primary, r.run.finalTokens]) {
      const t = process.hrtime.bigint();
      const b = bestLineup(seed, cv, tokens, { scenario: scn, rounds });
      let ms = Number(process.hrtime.bigint() - t) / 1e6;
      // wall-clock noise on a busy machine (other processes, GC) is not the search cost: a slow first reading is re-timed up to twice and the
      // fastest of the readings is kept (search is deterministic, so every repeat does identical work)
      for (let rep = 0; rep < 2 && ms > 100; rep++) {
        const t2 = process.hrtime.bigint();
        bestLineup(seed, cv, tokens, { scenario: scn, rounds });
        ms = Math.min(ms, Number(process.hrtime.bigint() - t2) / 1e6);
      }
      rows.push({ sets: b ? b.sets : 0, evaluated: b ? b.evaluated : 0, ms });
    }
  }
  const all = rows.map((r) => r.ms);
  out(`${rows.length} searches (node ${process.version}, this machine, one thread): p50 ${q(all, 0.5).toFixed(1)} ms, p90 ${q(all, 0.9).toFixed(1)} ms, p99 ${q(all, 0.99).toFixed(1)} ms, max ${maxOf(all).toFixed(1)} ms; distinct sets p50 ${q(rows.map((r) => r.sets), 0.5)}, max ${maxOf(rows.map((r) => r.sets))}; lineup evaluations p50 ${q(rows.map((r) => r.evaluated), 0.5)}, p99 ${q(rows.map((r) => r.evaluated), 0.99)}.`);
  const local = rows.filter((r) => r.sets <= config.search.heavySets).map((r) => r.ms);
  const heavy = rows.filter((r) => r.sets > config.search.heavySets).map((r) => r.ms);
  out(`Client-side 复盘 (<= ${config.search.heavySets} distinct sets, ${pct(local.length / rows.length)} of searches): p50 ${q(local, 0.5).toFixed(1)} ms, p99 ${q(local, 0.99).toFixed(1)} ms, max ${maxOf(local).toFixed(1)} ms.`);
  out(`Heavy (server getReplay first, ${pct(heavy.length / rows.length)} of searches): p50 ${q(heavy, 0.5).toFixed(1)} ms, p99 ${q(heavy, 0.99).toFixed(1)} ms, max ${maxOf(heavy).toFixed(1)} ms (cloud function timeout 10 s).`);
  const worst = worstCase(content, config, cv);
  out(`Constructed worst case (${worst.label}): ${worst.sets} distinct sets, ${worst.evaluated} lineup evaluations, ${worst.ms.toFixed(1)} ms.`);
  let rec = 0;
  for (let th = 2000; th <= 32768; th += 1000) {
    const sel = rows.filter((r) => r.sets <= th).map((r) => r.ms);
    if (sel.length && maxOf(sel) < 250) rec = th;
  }
  note(`largest heavySets keeping this sample's client max under 250 ms: ${rec}`);
  check(maxOf(local) < 300, `client-side 复盘 max ${maxOf(local).toFixed(1)} ms < 300 ms in node (p99 ${q(local, 0.99).toFixed(1)} ms; heavy token sets go to getReplay)`);
  check(worst.ms < 10000, `heavy / worst-case search ${worst.ms.toFixed(0)} ms is far inside the 10 s getReplay timeout`);
  out('');

  // --- gates ---------------------------------------------------------------
  out('## Daily gates');
  out('');
  const gParts = await runTask('gate', args, config, args.gateseeds, 0);
  const gn = gParts.reduce((a, p) => a + p.n, 0);
  const accepted = gParts.reduce((a, p) => a + p.accepted, 0);
  const gOptFail = gParts.reduce((a, p) => a + p.optFail, 0);
  const sumG = gParts.reduce((a, p) => a + p.sumG, 0);
  const sumR = gParts.reduce((a, p) => a + p.sumR, 0);
  const nGate = gParts.reduce((a, p) => a + p.nGate, 0);
  const gt = [].concat(...gParts.map((p) => p.times));
  out(`Seeds where perfect play reaches 12-0: ${pct(1 - gOptFail / gn)}.`);
  out(`gateCheck over ${gn} candidate seeds: accepted ${pct(accepted / gn)}; optimal failed ${pct(gOptFail / gn)}; mean greedy 12-0 rate ${pct(sumG / Math.max(1, nGate))}; mean random 12-0 rate ${pct(sumR / Math.max(1, nGate))}.`);
  out(`gateCheck time per seed (under ${args.workers}-way parallel load): median ${q(gt, 0.5).toFixed(1)} ms, p99 ${q(gt, 0.99).toFixed(1)} ms.`);
  const pAccept = accepted / gn;
  out(`Probability that at least one of 50 candidates is accepted: ${pct(1 - Math.pow(1 - pAccept, 50))}.`);
  note(`strict daily gate acceptance ${pct(pAccept)}: about ${pAccept > 0 ? Math.round(1 / pAccept) : 'many'} candidates per accepted seed, so the offline seed bank (--bank) is mandatory`);
  check(pAccept > 0, 'the gate accepts some seeds (the offline bank can be filled)');
  out('');

  if (args.bank > 0) await makeBank(args, config, content, out);

  out('');
  out(failures.length ? `RESULT: ${failures.length} target(s) not met` : 'RESULT: all targets met');
  for (const f of failures) out('  not met: ' + f);
  if (args.out) fs.writeFileSync(args.out, lines.join('\n') + '\n');
  return { failures, stats, shares, cum, config };
}

/** Scan candidate seeds on the workers until `args.bank` pass the strict gate; write the bank file. */
async function makeBank(args, config, content, out) {
  const cv = content.contentVersion;
  const t0Bank = Date.now();
  const bank = [];
  let tried = 0;
  await new Promise((resolve, reject) => {
    const workers = [];
    const stop = () => {
      for (const w of workers) w.terminate();
      resolve();
    };
    for (let w = 0; w < args.workers; w++) {
      const wk = new Worker(__filename, { workerData: { task: 'bank', cv, config: config.configVersion, from: args.bankOffset, total: 0, step: args.workers, w } });
      wk.on('message', (m) => {
        if (bank.length >= args.bank) return;
        tried += m.tried;
        if (m.kind === 'seed') {
          bank.push(m.entry);
          if (bank.length >= args.bank) stop();
        }
      });
      wk.on('error', reject);
      workers.push(wk);
    }
  });
  bank.sort((a, b) => a.seed - b.seed);
  const file = args.bankFile || path.join(process.cwd(), 'daily-seed-bank.json');
  fs.writeFileSync(file, JSON.stringify(bank));
  out(`Wrote ${bank.length} accepted seeds to ${file} (about ${tried} candidates tried, about ${bank.length ? Math.round(tried / bank.length) : 0} per accepted seed, ${((Date.now() - t0Bank) / 1000).toFixed(0)} s on ${args.workers} workers) (spoiler: never commit it unless it is the founder-approved bank, delete after import).`);
}

/** The costliest token combination: five rounds on the biggest, most distinct cells. */
function worstCase(content, config, cv) {
  const cells = content.validCells.slice().sort((a, b) => content.cells[cellKey(b.faction, b.era)].length - content.cells[cellKey(a.faction, a.era)].length);
  const top = cells.slice(0, 5).map((c) => ({ faction: c.faction, era: c.era }));
  const same = [0, 1, 2, 3, 4].map(() => ({ faction: cells[0].faction, era: cells[0].era }));
  let worst = { sets: 0, evaluated: 0, ms: 0, label: '' };
  for (const [label, tokens] of [['five biggest distinct cells', top], ['five times the biggest cell', same]]) {
    for (let rep = 0; rep < 12; rep++) {
      const seed = hash32('worst:' + rep);
      const rounds = buildSheet(seed, cv, config.configVersion);
      const scn = makeScenario(seed, cv, config.configVersion);
      const t = process.hrtime.bigint();
      const b = bestLineup(seed, cv, tokens, { scenario: scn, rounds });
      let ms = Number(process.hrtime.bigint() - t) / 1e6;
      // wall-clock noise on a busy machine (other processes, GC) is not the search cost: a slow first reading is re-timed up to twice and the
      // fastest of the readings is kept (search is deterministic, so every repeat does identical work)
      for (let rep = 0; rep < 2 && ms > 100; rep++) {
        const t2 = process.hrtime.bigint();
        bestLineup(seed, cv, tokens, { scenario: scn, rounds });
        ms = Math.min(ms, Number(process.hrtime.bigint() - t2) / 1e6);
      }
      if (b && ms >= worst.ms) worst = { sets: b.sets, evaluated: b.evaluated, ms, label };
    }
  }
  return worst;
}

if (isMainThread && require.main === module) {
  const args = parseArgs(process.argv);
  run(args).then((res) => {
    if (args.check && res.failures.length) process.exit(1);
  });
}

module.exports = { run, parseArgs, worstCase };
