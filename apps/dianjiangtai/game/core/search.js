/**
 * 复盘: the best lineup for a run's own final tokens (spec 7.4).
 *
 *   bestLineup(seed, contentVersion, finalTokens, opts?) ->
 *     { lineup:[{slot,generalId}], record:{w,l}, evaluated, sets } | null
 *
 * `finalTokens` is 5 x {faction, era}: the tokens the player actually
 * drafted from (after re-spins). The search is exact: every set of 5
 * distinct generals with a round-to-general matching (one general from each
 * round's cell), times all 120 slot permutations, scored with the exact
 * simulator rules (events included). Tie-break: highest sum of win chances
 * (natural battle outcomes), then first found. Returns null when no five
 * distinct generals can be drafted from the tokens.
 *
 * Speed (all exact, none changes the answer):
 *  - picks are deduplicated by general SET: slot assignment is free, so a set
 *    reachable through several round orders is scored once;
 *  - per set, slots are filled depth-first and the 12 partial team-power
 *    sums are reused across permutations;
 *  - wins are decided by precomputed thresholds (no exp in the hot loop);
 *  - sets are visited best-upper-bound first, and a set is skipped when its
 *    per-battle upper bound cannot beat the best record (or the best
 *    tie-break) found so far. The bound never undercuts a reachable lineup,
 *    so the optimum is never skipped. This subsumes the spec's dominated-pick
 *    pruning without its exchange-argument caveats when the same general
 *    appears in several pools. (Per-node bounds inside a set were measured
 *    and cost more than they saved.)
 *  - a leaf is abandoned as soon as it has lost too many battles to tie the
 *    best record.
 *
 * `opts.stopAt12` returns at the first lineup that wins every battle (gate
 * check); the stored daily `best` uses the full search.
 * `opts.configVersion`, `opts.scenario` (a prebuilt makeScenario) optional.
 */

const { SLOTS, cellKey } = require('./content');
const { makeScenario, simulateScenario, applyEvents } = require('./sim');

const NS = 5;
const EPS = 1e-9;

function enumerateSets(content, finalTokens) {
  const pools = finalTokens.map((t) => content.cells[cellKey(t.faction, t.era)]);
  const nR = content.generals.length;
  const bigRoster = nR > 50;
  const seen = new Set();
  const sets = [];
  const pick = [0, 0, 0, 0, 0];
  const taken = new Uint8Array(nR);
  const POW = [];
  for (let g = 0; g < nR; g++) POW.push(Math.pow(2, g));
  (function rec(r, mask) {
    if (r === NS) {
      let k = mask;
      if (bigRoster) {
        k = pick.slice().sort((a, b) => a - b).join(',');
      }
      if (!seen.has(k)) {
        seen.add(k);
        // insertion sort of 5 ints
        const set = pick.slice();
        for (let i = 1; i < NS; i++) {
          const v = set[i];
          let j = i - 1;
          while (j >= 0 && set[j] > v) {
            set[j + 1] = set[j];
            j--;
          }
          set[j + 1] = v;
        }
        sets.push(set);
      }
      return;
    }
    const pool = pools[r];
    for (let i = 0; i < pool.length; i++) {
      const g = pool[i];
      if (taken[g]) continue;
      taken[g] = 1;
      pick[r] = g;
      rec(r + 1, bigRoster ? 0 : mask + POW[g]);
      taken[g] = 0;
    }
  })(0, 0);
  return sets;
}

function bestLineup(seed, contentVersion, finalTokens, opts) {
  opts = opts || {};
  const scn = opts.scenario || makeScenario(seed, contentVersion, opts.configVersion);
  const { content, config, nb } = scn;
  const ev = config.events;
  const roster = content.generals;
  const rs = content.roleScores;
  const need = scn.need;
  const bw = scn.bw;
  const D = scn.D;
  const tau = config.tau;
  const m = config.morale;

  const rawSets = enumerateSets(content, finalTokens);
  if (rawSets.length === 0) return null;

  // --- per-set constants and upper bounds ------------------------------------
  // per-general lookups, no allocation per set
  const nR = roster.length;
  const facOf = new Int8Array(nR);
  const factionKeys = content.factions.map((f) => f.key);
  const waverG = new Uint8Array(nR);
  const stratG = new Uint8Array(nR);
  const unstG = new Uint8Array(nR);
  for (let g = 0; g < nR; g++) {
    facOf[g] = factionKeys.indexOf(roster[g].faction);
    waverG[g] = roster[g].stats.xin <= ev.wavering.maxXin ? 1 : 0;
    stratG[g] = roster[g].stats.zhi >= ev.stratagem.minZhi ? 1 : 0;
    unstG[g] = roster[g].stats.yong >= ev.unstoppable.yong ? 1 : 0;
  }
  const bondIdx = content.bonds.map((b) => ({ members: b.members.map((id) => content.indexOf[id]), bonus: b.bonus === undefined ? m.perBond : b.bonus }));
  const facCount = new Int8Array(factionKeys.length);

  const infos = [];
  for (let si = 0; si < rawSets.length; si++) {
    const set = rawSets[si];
    let bondBonus = 0;
    for (let bi = 0; bi < bondIdx.length; bi++) {
      const mem = bondIdx[bi].members;
      let all = true;
      for (let k = 0; k < mem.length; k++) {
        let found = false;
        for (let j = 0; j < NS; j++) if (set[j] === mem[k]) found = true;
        if (!found) {
          all = false;
          break;
        }
      }
      if (all) bondBonus += bondIdx[bi].bonus;
    }
    facCount.fill(0);
    let top = 0;
    for (let j = 0; j < NS; j++) {
      const c = ++facCount[facOf[set[j]]];
      if (c > top) top = c;
    }
    const cohesion = top >= 5 ? m.cohesion5 : top >= 4 ? m.cohesion4 : 0;
    const M0 = m.base + bondBonus + cohesion;
    let canWaver = false;
    let canStrat = 0;
    let canUnst = 0;
    const maxRS = [0, 0, 0, 0, 0];
    for (let j = 0; j < NS; j++) {
      const g = set[j];
      if (waverG[g]) canWaver = true;
      if (stratG[g]) canStrat = 1;
      if (unstG[g]) canUnst = 1;
      const row = rs[g];
      for (let s = 0; s < NS; s++) if (row[s] > maxRS[s]) maxRS[s] = row[s];
    }
    const Mub = Math.min(m.cap, M0 + m.perLord * maxRS[0]);
    let ubCount = 0;
    let ubMetric = 0;
    for (let i = 0; i < nb; i++) {
      const b = bw[i];
      const p = Mub * (b[0] * maxRS[0] + b[1] * maxRS[1] + b[2] * maxRS[2] + b[3] * maxRS[3] + b[4] * maxRS[4]) + EPS;
      if (p > need[i]) ubCount++;
      ubMetric += 1 / (1 + Math.exp(-(p - D[i]) / tau));
    }
    const gain = canStrat + canUnst;
    infos.push({ set, M0, canWaver, gain, plain: !canWaver && gain === 0, ubCount: ubCount + gain, ubMetric });
  }
  infos.sort((a, b) => b.ubCount - a.ubCount || b.ubMetric - a.ubMetric);

  // --- search state ---------------------------------------------------------
  const T = [];
  for (let d = 0; d <= NS; d++) T.push(new Float64Array(nb));
  const bwCol = [0, 1, 2, 3, 4].map((k) => Float64Array.from(bw, (row) => row[k]));
  const S = [0, 0, 0, 0, 0];
  const P = new Float64Array(nb);
  const win = new Uint8Array(nb);
  const fin = new Uint8Array(nb);
  const xin = [0, 0, 0, 0, 0];
  const used = [false, false, false, false, false];
  const assign = [0, 0, 0, 0, 0];

  let bestCount = -1;
  let bestMetric = -Infinity;
  const bestAssign = [0, 0, 0, 0, 0];
  let evaluated = 0;
  let done = false;
  let info = null;
  let set = null;

  function beats(count, metric) {
    return count > bestCount || (count === bestCount && metric > bestMetric);
  }

  function dfs(s) {
    if (done) return;
    if (s === NS) {
      evaluated++;
      const M = Math.min(m.cap, info.M0 + m.perLord * S[0]);
      const T5 = T[NS];
      // abandon the leaf once it has lost too many battles to tie the best record
      const allowed = bestCount < 0 ? nb : nb - (bestCount - info.gain);
      let losses = 0;
      for (let i = 0; i < nb; i++) {
        const p = M * T5[i];
        P[i] = p;
        if (p > need[i]) win[i] = 1;
        else {
          win[i] = 0;
          if (++losses > allowed) return;
        }
      }
      let count = nb - losses;
      if (!info.plain) {
        for (let k = 0; k < NS; k++) xin[k] = roster[assign[k]].stats.xin;
        applyEvents(scn, S, P, win, fin, xin, roster[assign[1]].stats.zhi, roster[assign[3]].stats.yong);
        count = 0;
        for (let i = 0; i < nb; i++) if (fin[i]) count++;
      }
      if (count < bestCount) return;
      let metric = 0;
      if (count === bestCount) {
        // each term is < 1: abandon the sum as soon as it cannot beat the best tie-break
        for (let i = 0; i < nb; i++) {
          metric += 1 / (1 + Math.exp(-(P[i] - D[i]) / tau));
          if (metric + (nb - 1 - i) <= bestMetric) return;
        }
      } else {
        for (let i = 0; i < nb; i++) metric += 1 / (1 + Math.exp(-(P[i] - D[i]) / tau));
      }
      if (beats(count, metric)) {
        bestCount = count;
        bestMetric = metric;
        for (let k = 0; k < NS; k++) bestAssign[k] = assign[k];
        if (opts.stopAt12 && count === nb) done = true;
      }
      return;
    }
    const prev = T[s];
    const cur = T[s + 1];
    for (let a = 0; a < NS; a++) {
      if (used[a]) continue;
      used[a] = true;
      const g = set[a];
      assign[s] = g;
      const sc = rs[g][s];
      S[s] = sc;
      const col = bwCol[s];
      for (let i = 0; i < nb; i++) cur[i] = prev[i] + col[i] * sc;
      dfs(s + 1);
      used[a] = false;
      if (done) return;
    }
  }

  for (let k = 0; k < infos.length && !done; k++) {
    info = infos[k];
    // a set whose bound cannot beat the best record (or tie-break) is skipped
    if (info.ubCount < bestCount) continue;
    if (info.ubCount === bestCount) {
      // sets are sorted by ubCount desc, so only the metric bound is left to check
      if (info.ubMetric <= bestMetric) continue;
    }
    set = info.set;
    dfs(0);
  }

  const lineup = SLOTS.map((slot, k) => ({ slot, generalId: roster[bestAssign[k]].id }));
  const res = simulateScenario(scn, lineup);
  return { lineup, record: res.record, evaluated, sets: rawSets.length };
}

module.exports = { bestLineup, enumerateSets };
