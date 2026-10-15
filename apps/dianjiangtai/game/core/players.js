/**
 * Simulated players (spec 7.5, 7.5.1). They play the real draft engine, so
 * a player can never do something a human could not. Used by the tuning
 * tool and by the daily seed gates (core/gates.js).
 *
 *   playRun(model, seed, contentVersion, mode, rng, scn?, opts?) ->   (opts.rounds: a prebuilt sheet, saves rebuilding it per player)
 *     { run, lineup, record:{w,l} }
 *   models: 'random' | 'naive' | 'greedy' | 'greedyNoisy' | 'sensible'
 *
 * Choices use `rng` only; the battle and event streams belong to the seed,
 * so every player on a seed faces the same battles.
 */

const draft = require('./draft');
const { SLOTS } = require('./content');
const { makeScenario, simulateScenario } = require('./sim');
const { int } = require('./rng');

const TIER_RANK = { jia: 3, yi: 2, bing: 1 };

/** All (generalIndex, slotIndex, score) options for the current pool, best first. */
function options(run) {
  const out = [];
  const pool = draft.currentPool(run);
  const rs = run.content.roleScores;
  for (const g of pool) {
    for (let s = 0; s < SLOTS.length; s++) {
      if (run.slots[SLOTS[s]]) continue;
      out.push({ g, s, score: rs[g][s] });
    }
  }
  out.sort((a, b) => b.score - a.score || a.g - b.g || a.s - b.s);
  return out;
}

function doPick(run, g, s) {
  return draft.apply(run, { round: run.round, type: 'pick', generalId: run.content.roster[g], slot: SLOTS[s] });
}

function availableRespins(run) {
  const out = [];
  for (const dim of ['faction', 'era']) {
    const info = draft.respinInfo(run, dim);
    if (info.enabled && info.nextSource === 'free') out.push(dim);
  }
  return out;
}

function doRespin(run, dim) {
  return draft.apply(run, { round: run.round, type: dim === 'faction' ? 'respinFaction' : 'respinEra', source: 'free' });
}

/**
 * One round for a model. Returns nothing; mutates the run.
 * `cfg` = {respin: 'none'|'random'|'greedy'|'greedyNoisy', respinP, gainBelow, takeBest}
 */
function playRound(run, model, rng, cfg) {
  draft.apply(run, { round: run.round, type: 'flip' });

  // --- re-spins ---
  if (cfg.respin === 'random') {
    // each available re-spin is used with probability respinP
    for (const dim of ['faction', 'era']) {
      const info = draft.respinInfo(run, dim);
      if (info.enabled && info.nextSource === 'free' && rng() < cfg.respinP) doRespin(run, dim);
    }
  } else if (cfg.respin === 'greedy' || cfg.respin === 'greedyNoisy') {
    for (let guard = 0; guard < 2; guard++) {
      const dims = availableRespins(run);
      if (dims.length === 0) break;
      const opts = options(run);
      const best = opts.length ? opts[0].score : 0;
      if (best >= cfg.gainBelow) break;
      if (cfg.respin === 'greedyNoisy' && rng() >= cfg.respinP) break;
      doRespin(run, dims[dims.length === 1 ? 0 : int(rng, dims.length)]);
    }
  }

  // --- pick ---
  const opts = options(run);
  if (model === 'random') {
    const pool = draft.currentPool(run);
    const g = pool[int(rng, pool.length)];
    const open = [];
    for (let s = 0; s < SLOTS.length; s++) if (!run.slots[SLOTS[s]]) open.push(s);
    doPick(run, g, open[int(rng, open.length)]);
    return;
  }
  if (model === 'naive') {
    const pool = draft.currentPool(run);
    const gens = run.content.generals;
    let bg = -1;
    let bk = -1;
    for (const g of pool) {
      const st = gens[g].stats;
      const key = TIER_RANK[gens[g].tier] * 1000 + st.zhi + st.xin + st.ren + st.yong + st.yan;
      if (key > bk) {
        bk = key;
        bg = g;
      }
    }
    const pr = SLOTS.indexOf(gens[bg].primaryRole);
    if (!run.slots[SLOTS[pr]]) {
      doPick(run, bg, pr);
      return;
    }
    let bs = -1;
    let bv = -1;
    for (let s = 0; s < SLOTS.length; s++) {
      if (run.slots[SLOTS[s]]) continue;
      const v = run.content.roleScores[bg][s];
      if (v > bv) {
        bv = v;
        bs = s;
      }
    }
    doPick(run, bg, bs);
    return;
  }
  // greedy / greedyNoisy
  let k = 0;
  if (model === 'greedyNoisy' && opts.length > 1 && rng() >= cfg.takeBest) k = 1;
  doPick(run, opts[k].g, opts[k].s);
}

function cfgFor(model, config, opts) {
  const g = config.gates;
  switch (model) {
    case 'random':
      return { respin: opts && opts.noRespin ? 'none' : 'random', respinP: g.random.respinP };
    case 'greedyNoisy':
      return { respin: 'greedyNoisy', respinP: g.greedy.respinP, gainBelow: g.greedy.gainBelow, takeBest: g.greedy.takeBest };
    case 'greedy':
      return { respin: 'greedy', gainBelow: config.players.greedyRespinBelow };
    case 'naive':
    default:
      return { respin: 'none' };
  }
}

function playRun(model, seed, contentVersion, mode, rng, scn, opts) {
  const sc = scn || makeScenario(seed, contentVersion, opts && opts.configVersion);
  let m = model;
  if (m === 'sensible') m = rng() < 0.5 ? 'naive' : 'greedy';
  const run = draft.createRun({ seed, contentVersion, mode, configVersion: sc.config.configVersion, rounds: opts && opts.rounds });
  const cfg = cfgFor(m, sc.config, opts);
  for (let r = 0; r < sc.config.rounds; r++) {
    if (r > 0) draft.nextRound(run);
    playRound(run, m, rng, cfg);
  }
  const lineup = draft.lineupOf(run);
  const sim = simulateScenario(sc, lineup);
  return { run, lineup, record: sim.record, sim };
}

module.exports = { playRun, options };
