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
 *  - sets are visited best-upper-bound first, and a set or a partial
 *    assignment is skipped when its per-battle upper bound cannot beat the
 *    best record (or the best tie-break) found so far. The bound never
 *    undercuts a reachable lineup, so the optimum is never skipped. This
 *    subsumes the spec's dominated-pick pruning without its exchange-
 *    argument caveats when the same general appears in several pools.
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
  (function rec(r, mask, key) {
    if (r === NS) {
      const k = bigRoster ? key : mask;
      if (!seen.has(k)) {
        seen.add(k);
        sets.push(pick.slice().sort((a, b) => a - b));
      }
      return;
    }
    const pool = pools[r];
    for (let i = 0; i < pool.length; i++) {
      const g = pool[i];
      if (bigRoster) {
        if (pick.slice(0, r).indexOf(g) >= 0) continue;
      } else if (Math.floor(mask / Math.pow(2, g)) % 2 === 1) continue;
      pick[r] = g;
      rec(r + 1, bigRoster ? 0 : mask + Math.pow(2, g), bigRoster ? key + ',' + g : '');
    }
  })(0, 0, '');
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
  const infos = [];
  for (let si = 0; si < rawSets.length; si++) {
    const set = rawSets[si];
    const ids = set.map((g) => roster[g].id);
    let bondBonus = 0;
    for (const b of content.bonds) {
      let all = true;
      for (const mem of b.members) if (ids.indexOf(mem) < 0) all = false;
      if (all) bondBonus += b.bonus === undefined ? m.perBond : b.bonus;
    }
    const counts = {};
    let top = 0;
    for (const g of set) {
      const f = roster[g].faction;
      counts[f] = (counts[f] || 0) + 1;
      if (counts[f] > top) top = counts[f];
    }
    const cohesion = top >= 5 ? m.cohesion5 : top >= 4 ? m.cohesion4 : 0;
    const M0 = m.base + bondBonus + cohesion;
    let canWaver = false;
    let canStrat = 0;
    let canUnst = 0;
    const maxRS = [0, 0, 0, 0, 0];
    for (const g of set) {
      const st = roster[g].stats;
      if (st.xin <= ev.wavering.maxXin) canWaver = true;
      if (st.zhi >= ev.stratagem.minZhi) canStrat = 1;
      if (st.yong >= ev.unstoppable.yong) canUnst = 1;
      for (let s = 0; s < NS; s++) if (rs[g][s] > maxRS[s]) maxRS[s] = rs[g][s];
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
  const S = [0, 0, 0, 0, 0];
  const P = new Array(nb);
  const win = new Array(nb);
  const fin = new Array(nb);
  const xin = [0, 0, 0, 0, 0];
  const used = [false, false, false, false, false];
  const assign = [0, 0, 0, 0, 0];
  const maxR = [0, 0, 0, 0, 0];

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

  /** Upper bound on the count for a partial assignment of slots 0..s-1. */
  function partialUbCount(s) {
    for (let k = s; k < NS; k++) {
      let mx = 0;
      for (let a = 0; a < NS; a++) if (!used[a] && rs[set[a]][k] > mx) mx = rs[set[a]][k];
      maxR[k] = mx;
    }
    const M = Math.min(m.cap, info.M0 + m.perLord * (s > 0 ? S[0] : maxR[0]));
    const t = T[s];
    let c = 0;
    for (let i = 0; i < nb; i++) {
      const b = bw[i];
      let sum = t[i];
      for (let k = s; k < NS; k++) sum += b[k] * maxR[k];
      if (M * sum + EPS > need[i]) c++;
    }
    return c + info.gain;
  }

  function dfs(s) {
    if (done) return;
    if (s === NS) {
      evaluated++;
      const M = Math.min(m.cap, info.M0 + m.perLord * S[0]);
      const T5 = T[NS];
      let w0 = 0;
      for (let i = 0; i < nb; i++) {
        const p = M * T5[i];
        P[i] = p;
        const ok = p > need[i];
        win[i] = ok;
        if (ok) w0++;
      }
      let count = w0;
      if (!info.plain) {
        if (w0 + info.gain < bestCount) return;
        for (let k = 0; k < NS; k++) xin[k] = roster[assign[k]].stats.xin;
        applyEvents(scn, S, P, win, fin, xin, roster[assign[1]].stats.zhi, roster[assign[3]].stats.yong);
        count = 0;
        for (let i = 0; i < nb; i++) if (fin[i]) count++;
      }
      if (count < bestCount) return;
      let metric = 0;
      for (let i = 0; i < nb; i++) metric += 1 / (1 + Math.exp(-(P[i] - D[i]) / tau));
      if (beats(count, metric)) {
        bestCount = count;
        bestMetric = metric;
        for (let k = 0; k < NS; k++) bestAssign[k] = assign[k];
        if (opts.stopAt12 && count === nb) done = true;
      }
      return;
    }
    if ((s === 2 || s === 3) && bestCount >= 0 && partialUbCount(s) < bestCount) return;
    const prev = T[s];
    const cur = T[s + 1];
    for (let a = 0; a < NS; a++) {
      if (used[a]) continue;
      used[a] = true;
      const g = set[a];
      assign[s] = g;
      const sc = rs[g][s];
      S[s] = sc;
      for (let i = 0; i < nb; i++) cur[i] = prev[i] + bw[i][s] * sc;
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
