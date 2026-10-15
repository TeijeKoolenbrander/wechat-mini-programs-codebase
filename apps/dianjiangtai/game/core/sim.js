/**
 * Grading simulator (spec 7). Pure JS; runs identically on the client and
 * in the cloud functions.
 *
 *   simulate(lineup, seed, contentVersion, configVersion, opts?) ->
 *     { record:{w,l}, battles[], events[], band, morale, scores, lineup }
 *
 * `lineup` is [{slot, generalId}] in any order (or {slot: generalId}).
 * `opts.events === false` switches the three events off (used by the
 * monotonicity tests: before events a stronger lineup never does worse).
 *
 * Randomness (all from the seed, never from player choices):
 *   battle stream  sub(seed,'battle'): 6 guaranteed types + 6 random, shuffled;
 *                  then per battle i: u_i (shared luck), j_i (opponent jitter)
 *   event stream   sub(seed,'event'):  5 wavering rolls (by SLOT, so a higher
 *                  信 never triggers more often), battle pick, template
 *                  picks for the three events
 * A battle is won iff P_i > D_i + tau*logit(u_i), which is exactly
 * u_i < 1/(1+exp(-(P_i-D_i)/tau)), so a stronger lineup never loses a
 * battle a weaker one wins (before events).
 */

const { sub, int, shuffle } = require('./rng');
const { getContent, SLOTS } = require('./content');
const { getConfig, bandFor, defaultConfigVersion } = require('./config');

const NS = 5;

function logit(p) {
  return Math.log(p / (1 - p));
}

/** Per-seed constants: everything that does not depend on the lineup. */
function makeScenario(seed, contentVersion, configVersion) {
  const content = getContent(contentVersion);
  if (!content) throw new Error('unknown contentVersion ' + contentVersion);
  const config = getConfig(configVersion || defaultConfigVersion(contentVersion));
  if (!config) throw new Error('unknown configVersion ' + configVersion);
  const nb = config.battles;
  const types = config.battleTypes;
  const rng = sub(seed, 'battle');

  const order = [];
  for (let t = 0; t < types.length; t++) order.push(t);
  shuffle(rng, order);
  while (order.length < nb) order.push(int(rng, types.length));
  shuffle(rng, order);

  const typeIdx = order;
  const u = new Array(nb);
  const j = new Array(nb);
  const D = new Array(nb);
  const need = new Array(nb);
  const evNeedStrat = new Array(nb);
  const evNeedUnst = new Array(nb);
  const ev = config.events;
  for (let i = 0; i < nb; i++) {
    u[i] = rng();
    j[i] = (rng() * 2 - 1) * config.jitter;
    D[i] = config.curve[i] + j[i];
    need[i] = u[i] <= 0 ? -Infinity : D[i] + config.tau * logit(u[i]);
    evNeedStrat[i] = D[i] + config.tau * logit(ev.stratagem.pMin);
    evNeedUnst[i] = D[i] + config.tau * logit(ev.unstoppable.pMin);
  }
  const bw = typeIdx.map((t) => types[t].w);

  const erng = sub(seed, 'event');
  const wr = [];
  for (let s = 0; s < NS; s++) wr.push(erng());
  const wb = erng();
  const wt = erng();
  const st = erng();
  const ut = erng();

  const stratTypes = ev.stratagem.types.map((k) => types.findIndex((t) => t.key === k));
  const unstTypes = ev.unstoppable.types.map((k) => types.findIndex((t) => t.key === k));
  const isStratType = typeIdx.map((t) => stratTypes.indexOf(t) >= 0);
  const isUnstType = typeIdx.map((t) => unstTypes.indexOf(t) >= 0);

  return {
    seed,
    content,
    config,
    nb,
    typeIdx,
    bw,
    u,
    j,
    D,
    need,
    evNeedStrat,
    evNeedUnst,
    isStratType,
    isUnstType,
    wr,
    wb,
    wt,
    st,
    ut,
  };
}

/**
 * Lineup -> general ids in slot order (null if incomplete/unknown). `ids.facs` holds the faction each general was
 * drafted from (cohesion, spec 7.2); an entry without `faction` counts as its primary faction.
 */
function normLineup(content, lineup) {
  const ids = new Array(NS);
  const facs = new Array(NS);
  if (Array.isArray(lineup)) {
    for (const e of lineup) {
      const si = SLOTS.indexOf(e && e.slot);
      if (si < 0) return null;
      ids[si] = e.generalId;
      facs[si] = e.faction || null;
    }
  } else if (lineup && typeof lineup === 'object') {
    for (let s = 0; s < NS; s++) ids[s] = lineup[SLOTS[s]];
  } else return null;
  for (let s = 0; s < NS; s++) {
    if (content.indexOf[ids[s]] === undefined) return null;
    if (!facs[s]) facs[s] = content.byId[ids[s]].faction;
  }
  ids.facs = facs;
  return ids;
}

/** Morale multiplier M and its parts for 5 general indexes in slot order. */
function moraleOf(content, config, gIdx, lordScore, facs) {
  const m = config.morale;
  const ids = gIdx.map((i) => content.roster[i]);
  const bonds = [];
  for (const b of content.bonds) {
    let all = true;
    for (const mem of b.members) if (ids.indexOf(mem) < 0) all = false;
    if (all) bonds.push(b);
  }
  const counts = {};
  let top = 0;
  for (const i of gIdx) {
    const f = facs ? facs[gIdx.indexOf(i)] : content.generals[i].faction;
    counts[f] = (counts[f] || 0) + 1;
    if (counts[f] > top) top = counts[f];
  }
  const cohesion = top >= 5 ? m.cohesion5 : top >= 4 ? m.cohesion4 : 0;
  let bondBonus = 0;
  for (const b of bonds) bondBonus += b.bonus === undefined ? m.perBond : b.bonus;
  const raw = m.base + m.perLord * lordScore + bondBonus + cohesion;
  return { total: Math.min(m.cap, raw), base: m.base, lord: m.perLord * lordScore, bondKeys: bonds.map((b) => b.key), bonds: bonds.map((b) => b.label), bondBonus, cohesion, capped: raw > m.cap };
}

/** Fast morale for the search (no allocations beyond the loop). */
function moraleTotal(content, config, gIdx, lordScore, facs) {
  return moraleOf(content, config, gIdx, lordScore, facs).total;
}

/**
 * Natural outcomes for team power vector. Fills `P` and `win` (length nb).
 * Returns number of natural wins.
 */
function naturalOutcomes(scn, S, M, P, win) {
  let w = 0;
  const bw = scn.bw;
  for (let i = 0; i < scn.nb; i++) {
    const b = bw[i];
    const p = M * (b[0] * S[0] + b[1] * S[1] + b[2] * S[2] + b[3] * S[3] + b[4] * S[4]);
    P[i] = p;
    const ok = p > scn.need[i];
    win[i] = ok;
    if (ok) w++;
  }
  return w;
}

/**
 * Apply the three events to natural outcomes. `final` is filled with the
 * final win flags; returns the event descriptor {wavering, strat, unst}
 * (battle indexes or -1, plus the slot of the wavering general).
 */
function applyEvents(scn, S, P, win, final, xin, zhiJunshi, yongMeng) {
  const ev = scn.config.events;
  const nb = scn.nb;
  const out = { wavering: -1, waverSlot: -1, strat: -1, unst: -1 };
  for (let i = 0; i < nb; i++) final[i] = win[i];

  // 临阵生变: first triggered by slot order
  for (let s = 0; s < NS; s++) {
    const x = xin[s];
    if (x <= ev.wavering.maxXin && scn.wr[s] < (ev.wavering.base - x) * ev.wavering.perPoint) {
      let n = 0;
      for (let i = 0; i < nb; i++) if (win[i]) n++;
      if (n > 0) {
        let k = Math.floor(scn.wb * n);
        for (let i = 0; i < nb; i++) {
          if (win[i]) {
            if (k === 0) {
              out.wavering = i;
              break;
            }
            k--;
          }
        }
        out.waverSlot = s;
        final[out.wavering] = false;
      }
      break;
    }
  }
  // 奇谋
  if (zhiJunshi >= ev.stratagem.minZhi) {
    for (let i = 0; i < nb; i++) {
      if (!win[i] && scn.isStratType[i] && P[i] >= scn.evNeedStrat[i]) {
        out.strat = i;
        final[i] = true;
        break;
      }
    }
  }
  // 万夫莫敌
  if (yongMeng >= ev.unstoppable.yong) {
    for (let i = 0; i < nb; i++) {
      if (!win[i] && scn.isUnstType[i] && P[i] >= scn.evNeedUnst[i]) {
        out.unst = i;
        final[i] = true;
        break;
      }
    }
  }
  return out;
}

function fill(tpl, name) {
  return tpl.replace('{name}', name);
}

/** Simulate with a prebuilt scenario. */
function simulateScenario(scn, lineup, opts) {
  const { content, config, nb } = scn;
  const ids = normLineup(content, lineup);
  if (!ids) throw new Error('incomplete lineup');
  const useEvents = !(opts && opts.events === false);
  const gIdx = ids.map((id) => content.indexOf[id]);
  const S = gIdx.map((gi, s) => content.roleScores[gi][s]);
  const morale = moraleOf(content, config, gIdx, S[0], ids.facs);
  const P = new Array(nb);
  const win = new Array(nb);
  const final = new Array(nb);
  naturalOutcomes(scn, S, morale.total, P, win);

  let ev = { wavering: -1, waverSlot: -1, strat: -1, unst: -1 };
  if (useEvents) {
    const xin = gIdx.map((gi) => content.generals[gi].stats.xin);
    ev = applyEvents(scn, S, P, win, final, xin, content.generals[gIdx[1]].stats.zhi, content.generals[gIdx[3]].stats.yong);
  } else {
    for (let i = 0; i < nb; i++) final[i] = win[i];
  }

  const texts = content.texts;
  const names = gIdx.map((gi) => content.generals[gi].name);
  const events = [];
  const battles = [];
  let w = 0;
  for (let i = 0; i < nb; i++) {
    const t = config.battleTypes[scn.typeIdx[i]];
    const p = 1 / (1 + Math.exp(-(P[i] - scn.D[i]) / config.tau));
    const luck = scn.u[i] < config.luck.jiBelow ? 'ji' : scn.u[i] < config.luck.pingBelow ? 'ping' : 'xiong';
    // cause slot: top contributor on a win, biggest shortfall on a loss
    let best = -1;
    let bestV = -Infinity;
    for (let s = 0; s < NS; s++) {
      const v = final[i] ? t.w[s] * S[s] : t.w[s] * (10 - S[s]);
      if (v > bestV) {
        bestV = v;
        best = s;
      }
    }
    let cause = t.label + '：' + names[best] + (final[i] ? texts.causeSlotWin[SLOTS[best]] + '，' + texts.causeTailWin[t.key] : texts.causeSlotLoss[SLOTS[best]] + '，' + texts.causeTailLoss[t.key]);
    let eventName = null;
    let eventKind = null;
    if (i === ev.wavering) {
      eventKind = 'wavering';
      eventName = '临阵生变';
      cause = fill(texts.wavering[Math.floor(scn.wt * texts.wavering.length)], names[ev.waverSlot]);
      best = ev.waverSlot;
    } else if (i === ev.strat) {
      eventKind = 'stratagem';
      eventName = '奇谋';
      cause = fill(texts.stratagem[Math.floor(scn.st * texts.stratagem.length)], names[1]);
      best = 1;
    } else if (i === ev.unst) {
      eventKind = 'unstoppable';
      eventName = '万夫莫敌';
      cause = fill(texts.unstoppable[Math.floor(scn.ut * texts.unstoppable.length)], names[3]);
      best = 3;
    }
    if (eventKind) events.push({ kind: eventKind, name: eventName, battle: i + 1, slot: SLOTS[best], generalId: ids[best], line: cause });
    if (final[i]) w++;
    battles.push({
      i: i + 1,
      type: t.key,
      typeLabel: t.label,
      win: final[i],
      baseWin: win[i],
      P: P[i],
      D: scn.D[i],
      u: scn.u[i],
      p,
      luck,
      causeSlot: SLOTS[best],
      cause,
      event: eventName,
      eventKind,
    });
  }
  const scores = {};
  SLOTS.forEach((s, k) => (scores[s] = S[k]));
  return {
    record: { w, l: nb - w },
    battles,
    events,
    band: bandFor(config, w),
    morale,
    scores,
    lineup: SLOTS.map((s, k) => ({ slot: s, generalId: ids[k], faction: ids.facs[k] })),
  };
}

function simulate(lineup, seed, contentVersion, configVersion, opts) {
  return simulateScenario(makeScenario(seed, contentVersion, configVersion), lineup, opts);
}

module.exports = {
  simulate,
  simulateScenario,
  makeScenario,
  normLineup,
  moraleOf,
  moraleTotal,
  naturalOutcomes,
  applyEvents,
};
