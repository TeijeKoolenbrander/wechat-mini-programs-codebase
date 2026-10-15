/**
 * 复盘: the best lineup for a run's own final tokens (spec 7.4).
 *
 *   bestLineup(seed, contentVersion, finalTokens, opts?) ->
 *     { lineup:[{slot,generalId,faction}], record:{w,l}, evaluated, sets } | null
 *
 * `finalTokens` is 5 x {faction, era}: the tokens the player actually
 * drafted from (after re-spins). The search is exact: every set of 5
 * distinct generals reachable by drafting one general per round from that
 * round's POOL (the pool cap of spec 4 applies: the first `poolCap` undrafted
 * generals of the cell in the round's seeded pool order, so a pool depends on
 * who was drafted in earlier rounds), times all 120 slot permutations,
 * scored with the exact simulator rules (events included; cohesion uses the
 * faction of the cell each general was drafted from, which is the round's
 * token faction whoever is picked). Tie-break: highest sum of win chances
 * (natural battle outcomes), then first found. Returns null when no five
 * distinct generals can be drafted from the tokens.
 *
 * Speed (all exact, none changes the answer):
 *  - picks are deduplicated by (general, drafted faction) SET: slot
 *    assignment is free, so a set reachable through several round orders is
 *    scored once (numeric keys, no allocation per path);
 *  - per set, slots are filled depth-first and the 12 partial team-power
 *    sums are reused across permutations;
 *  - wins are decided by precomputed thresholds (no exp in the hot loop);
 *  - sets are visited best-upper-bound first, and a set is skipped when its
 *    per-battle upper bound cannot beat the best record (or the best
 *    tie-break) found so far. The bound never undercuts a reachable lineup,
 *    so the optimum is never skipped;
 *  - inside a set, once the lord is placed (M is then exact) a partial
 *    assignment is dropped when even the best remaining members of the open
 *    slots cannot reach the best record;
 *  - a leaf is abandoned as soon as it has lost too many battles to tie the
 *    best record.
 *
 * `opts.stopAt12` returns at the first lineup that wins every battle (gate
 * check); the stored daily `best` uses the full search.
 * `opts.configVersion`, `opts.scenario` (a prebuilt makeScenario) and
 * `opts.rounds` (the sheet, whose `pools` give the pool orders; default:
 * derived from the seed) are optional.
 */

const { SLOTS, cellKey } = require('./content');
const { makeScenario, simulateScenario, applyEvents } = require('./sim');
const { poolOrder } = require('./sheet');

const NS = 5;
const EPS = 1e-9;

/** Per round: the cell's pool order (roster indexes). */
function ordersFor(seed, content, finalTokens, cap, rounds) {
  return finalTokens.map((t, r) => {
    const key = cellKey(t.faction, t.era);
    const cell = content.cells[key];
    if (!cell || cell.length <= cap) return cell || [];
    const given = rounds && rounds[r] && rounds[r].pools && rounds[r].pools[key];
    return given || poolOrder(seed, content, r + 1, t.faction, t.era);
  });
}

/**
 * Distinct (general, faction) sets as flat codes: 5 ascending codes per set, code = general * 8 + factionIndex.
 */
function enumerateCodes(content, finalTokens, cap, orders) {
  const facIdx = {};
  content.factions.forEach((f, i) => (facIdx[f.key] = i));
  const nR = content.generals.length;
  const seen = new Set();
  const out = [];
  const taken = new Uint8Array(nR);
  const code = [0, 0, 0, 0, 0];
  const buf = new Int32Array(NS);
  const tokF = finalTokens.map((t) => facIdx[t.faction]);
  function leaf() {
    // insertion sort of 5 codes (general-major, so ascending codes = ascending generals)
    for (let i = 0; i < NS; i++) buf[i] = code[i];
    for (let i = 1; i < NS; i++) {
      const v = buf[i];
      let j = i - 1;
      while (j >= 0 && buf[j] > v) {
        buf[j + 1] = buf[j];
        j--;
      }
      buf[j + 1] = v;
    }
    const c0 = buf[0];
    const c1 = buf[1];
    const c2 = buf[2];
    const c3 = buf[3];
    const c4 = buf[4];
    const key = (((c0 * 1024 + c1) * 1024 + c2) * 1024 + c3) * 1024 + c4;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(c0, c1, c2, c3, c4);
  }
  (function rec(r) {
    if (r === NS) return leaf();
    const order = orders[r];
    let n = 0;
    for (let i = 0; i < order.length && n < cap; i++) {
      const g = order[i];
      if (taken[g]) continue;
      n++;
      taken[g] = 1;
      code[r] = g * 8 + tokF[r];
      rec(r + 1);
      taken[g] = 0;
    }
  })(0);
  return out;
}

/**
 * All distinct (general, faction) sets draftable from the tokens, honouring the pool cap.
 * Returns [{g:[5 roster indexes ascending], f:[5 faction indexes aligned with g]}].
 */
function enumerateSets(content, finalTokens, cap, orders) {
  // old two-argument form: cap 8, pool orders = roster order (a size estimate; pass orders for the exact sets)
  if (cap === undefined) cap = 8;
  if (!orders) orders = finalTokens.map((t) => content.cells[cellKey(t.faction, t.era)] || []);
  const flat = enumerateCodes(content, finalTokens, cap, orders);
  const sets = [];
  for (let i = 0; i < flat.length; i += 5) {
    const g = [];
    const f = [];
    for (let j = 0; j < 5; j++) {
      g.push(flat[i + j] >> 3);
      f.push(flat[i + j] & 7);
    }
    sets.push({ g, f });
  }
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
  const cap = config.poolCap;

  const orders = ordersFor(seed, content, finalTokens, cap, opts.rounds);
  const flat = enumerateCodes(content, finalTokens, cap, orders);
  const nSets = flat.length / 5;
  if (nSets === 0) return null;

  // --- per-set constants and upper bounds ------------------------------------
  const nR = roster.length;
  const factionKeys = content.factions.map((f) => f.key);
  const waverG = new Uint8Array(nR);
  const stratG = new Uint8Array(nR);
  const unstG = new Uint8Array(nR);
  for (let g = 0; g < nR; g++) {
    waverG[g] = roster[g].stats.xin <= ev.wavering.maxXin ? 1 : 0;
    stratG[g] = roster[g].stats.zhi >= ev.stratagem.minZhi ? 1 : 0;
    unstG[g] = roster[g].stats.yong >= ev.unstoppable.yong ? 1 : 0;
  }
  // bonds per general; the faction of each pick is the round's token faction whoever is picked, so cohesion is
  // the same for every set
  const nBonds = content.bonds.length;
  const bondsOf = roster.map(() => []);
  const bondSize = new Int8Array(nBonds);
  const bondBonusOf = new Float64Array(nBonds);
  content.bonds.forEach((b, bi) => {
    bondSize[bi] = b.members.length;
    bondBonusOf[bi] = b.bonus === undefined ? m.perBond : b.bonus;
    for (const id of b.members) bondsOf[content.indexOf[id]].push(bi);
  });
  const bondCnt = new Int8Array(nBonds);
  const facCount = new Int8Array(factionKeys.length);
  let top = 0;
  for (const t of finalTokens) {
    const c = ++facCount[factionKeys.indexOf(t.faction)];
    if (c > top) top = c;
  }
  const cohesion = top >= 5 ? m.cohesion5 : top >= 4 ? m.cohesion4 : 0;

  const M0s = new Float64Array(nSets);
  const gains = new Int8Array(nSets);
  const plains = new Uint8Array(nSets);
  const ubCounts = new Int8Array(nSets);
  const ubMetrics = new Float64Array(nSets);
  const maxRS = [0, 0, 0, 0, 0];
  for (let si = 0; si < nSets; si++) {
    const o = si * 5;
    let bondBonus = 0;
    maxRS[0] = maxRS[1] = maxRS[2] = maxRS[3] = maxRS[4] = 0;
    let canWaver = false;
    let canStrat = 0;
    let canUnst = 0;
    for (let j = 0; j < NS; j++) {
      const g = flat[o + j] >> 3;
      const bl = bondsOf[g];
      for (let k = 0; k < bl.length; k++) if (++bondCnt[bl[k]] === bondSize[bl[k]]) bondBonus += bondBonusOf[bl[k]];
      if (waverG[g]) canWaver = true;
      if (stratG[g]) canStrat = 1;
      if (unstG[g]) canUnst = 1;
      const row = rs[g];
      for (let s = 0; s < NS; s++) if (row[s] > maxRS[s]) maxRS[s] = row[s];
    }
    for (let j = 0; j < NS; j++) {
      const bl = bondsOf[flat[o + j] >> 3];
      for (let k = 0; k < bl.length; k++) bondCnt[bl[k]] = 0;
    }
    const M0 = m.base + bondBonus + cohesion;
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
    M0s[si] = M0;
    gains[si] = gain;
    plains[si] = !canWaver && gain === 0 ? 1 : 0;
    ubCounts[si] = ubCount + gain;
    ubMetrics[si] = ubMetric;
  }
  const orderIdx = new Uint32Array(nSets);
  for (let i = 0; i < nSets; i++) orderIdx[i] = i;
  orderIdx.sort((a, b) => ubCounts[b] - ubCounts[a] || ubMetrics[b] - ubMetrics[a]);

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
  const assignA = [0, 0, 0, 0, 0];
  const mr = [0, 0, 0, 0, 0];
  const set = [0, 0, 0, 0, 0];
  const setF = [0, 0, 0, 0, 0];

  let bestCount = -1;
  let bestMetric = -Infinity;
  const bestAssign = [0, 0, 0, 0, 0];
  const bestFac = [0, 0, 0, 0, 0];
  let evaluated = 0;
  let done = false;
  let M0 = 0;
  let gain = 0;
  let plain = true;

  function dfs(s) {
    if (done) return;
    if (s === NS) {
      evaluated++;
      const M = Math.min(m.cap, M0 + m.perLord * S[0]);
      const T5 = T[NS];
      // abandon the leaf once it has lost too many battles to tie the best record
      const allowed = bestCount < 0 ? nb : nb - (bestCount - gain);
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
      if (!plain) {
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
      if (count > bestCount || (count === bestCount && metric > bestMetric)) {
        bestCount = count;
        bestMetric = metric;
        for (let k = 0; k < NS; k++) {
          bestAssign[k] = assign[k];
          bestFac[k] = setF[assignA[k]];
        }
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
      assignA[s] = a;
      const sc = rs[g][s];
      S[s] = sc;
      const col = bwCol[s];
      for (let i = 0; i < nb; i++) cur[i] = prev[i] + col[i] * sc;
      if (s + 1 < NS && bestCount >= 0) {
        // branch-and-bound: M is exact once the lord is placed; the best the open slots can still add is bounded by
        // the best remaining set member per slot. Events add at most `gain` wins. Never prunes a tie.
        const Mx = Math.min(m.cap, M0 + m.perLord * S[0]);
        for (let t = s + 1; t < NS; t++) {
          let mx = 0;
          for (let b = 0; b < NS; b++) {
            if (!used[b]) {
              const v = rs[set[b]][t];
              if (v > mx) mx = v;
            }
          }
          mr[t] = mx;
        }
        let cnt = gain;
        for (let i = 0; i < nb; i++) {
          let ub = cur[i];
          for (let t = s + 1; t < NS; t++) ub += bwCol[t][i] * mr[t];
          if (Mx * ub > need[i]) cnt++;
        }
        if (cnt < bestCount) {
          used[a] = false;
          continue;
        }
      }
      dfs(s + 1);
      used[a] = false;
      if (done) return;
    }
  }

  for (let k = 0; k < nSets && !done; k++) {
    const si = orderIdx[k];
    // a set whose bound cannot beat the best record (or tie-break) is skipped
    if (ubCounts[si] < bestCount) continue;
    if (ubCounts[si] === bestCount && ubMetrics[si] <= bestMetric) continue; // sorted by ubCount desc: only the metric is left
    const o = si * 5;
    for (let j = 0; j < NS; j++) {
      set[j] = flat[o + j] >> 3;
      setF[j] = flat[o + j] & 7;
    }
    M0 = M0s[si];
    gain = gains[si];
    plain = plains[si] === 1;
    dfs(0);
  }

  const lineup = SLOTS.map((slot, k) => ({ slot, generalId: roster[bestAssign[k]].id, faction: factionKeys[bestFac[k]] }));
  const res = simulateScenario(scn, lineup);
  return { lineup, record: res.record, evaluated, sets: nSets };
}

module.exports = { bestLineup, enumerateSets, ordersFor };
