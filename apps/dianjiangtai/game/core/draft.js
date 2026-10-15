/**
 * The draft state machine (spec 2, 4, 5.1). One engine shared by the client
 * (live play), `validate.replay` (server) and the simulated players, so the
 * rules can never drift between them.
 *
 * A run is fully defined by (seed, contentVersion, actions[]). Actions:
 *   { round, type: 'flip' }
 *   { round, type: 'respinFaction'|'respinEra', source?: 'free'|'ad' }
 *   { round, type: 'pick', generalId, slot }
 *   { round, type: 'undo' }
 *
 * Phases per round: awaitFlip -> flipped -> placed. After the 5th pick the
 * run is complete (phase 'placed', round 5, 5 picks). `flip` for round n+1
 * is accepted straight from 'placed' of round n (the UI's 下一轮 step is
 * not an action).
 *
 * Decisions on points the spec leaves open:
 * - Re-spin is allowed after an undo (no pick is standing), never while a
 *   pick is placed.
 * - An ad re-spin of a dimension requires that dimension's free re-spin to
 *   be spent already; at most `allowance.ad` ad re-spins per run, free play
 *   only.
 * - A re-spin result (or a flip) whose pool is empty is replaced from the
 *   round's deterministic fallback list, at no cost, with a log line.
 */

const { getContent, SLOTS, cellKey } = require('./content');
const { buildSheet, isValidCell } = require('./sheet');
const { getConfig, defaultConfigVersion } = require('./config');

const ACTION_TYPES = ['flip', 'respinFaction', 'respinEra', 'pick', 'undo'];

function createRun(opts) {
  const content = getContent(opts.contentVersion);
  if (!content) return null;
  const config = getConfig(opts.configVersion || defaultConfigVersion(content.contentVersion));
  if (!config) return null;
  const mode = opts.mode || 'free';
  const allowance = config.allowance[mode];
  if (!allowance) return null;
  return {
    seed: opts.seed >>> 0,
    mode,
    contentVersion: content.contentVersion,
    configVersion: config.configVersion,
    content,
    config,
    allowance,
    rounds: opts.rounds || buildSheet(opts.seed >>> 0, content.contentVersion, config.configVersion),
    round: 1,
    phase: 'awaitFlip',
    token: null,
    fbIdx: -1,
    used: { faction: 0, era: 0 },
    free: { faction: false, era: false },
    adUsed: 0,
    picks: [],
    drafted: {},
    slots: { zhugong: null, junshi: null, xianfeng: null, mengjiang: null, shoujiang: null },
    finalTokens: [null, null, null, null, null],
    respinsFree: 0,
    respinsAd: 0,
    log: [],
    actions: [],
  };
}

/**
 * The selectable pool (roster indexes, roster order) of a (faction, era) cell in the run's current round
 * (spec 4): the first `config.poolCap` undrafted members in the round's seeded pool order
 * (`rounds[r].pools[cell]`), or all undrafted members when the cell has no order (size <= poolCap).
 * Depends only on the seed, the round, the cell and which people are drafted.
 */
function poolOf(run, faction, era) {
  const key = cellKey(faction, era);
  const cell = run.content.cells[key] || [];
  const round = run.rounds[run.round - 1];
  const order = round && round.pools && round.pools[key];
  const roster = run.content.roster;
  const cap = run.config.poolCap;
  const out = [];
  if (order && order.length > cap) {
    for (let i = 0; i < order.length && out.length < cap; i++) if (!run.drafted[roster[order[i]]]) out.push(order[i]);
    out.sort((a, b) => a - b);
    return out;
  }
  for (let i = 0; i < cell.length; i++) if (!run.drafted[roster[cell[i]]]) out.push(cell[i]);
  return out;
}

/** Members of the cell already in the lineup (roster indexes): shown after the pool, dimmed "已点将", not selectable. */
function draftedInCell(run, faction, era) {
  const cell = run.content.cells[cellKey(faction, era)] || [];
  const out = [];
  for (let i = 0; i < cell.length; i++) if (run.drafted[run.content.roster[cell[i]]]) out.push(cell[i]);
  return out;
}

/** Pool of the current token (empty before the flip). */
function currentPool(run) {
  return run.token ? poolOf(run, run.token.faction, run.token.era) : [];
}

function startToken(run) {
  return run.rounds[run.round - 1];
}

/** Replace an empty-pool token from the round's fallback list. */
function settleToken(run) {
  while (run.token && poolOf(run, run.token.faction, run.token.era).length === 0) {
    const next = run.rounds[run.round - 1].fallback[run.fbIdx + 1];
    if (!next) return false;
    run.fbIdx++;
    run.token = {
      faction: next.faction,
      era: next.era,
      altFaction: next.altFaction,
      altEra: next.altEra,
    };
    run.log.push({ round: run.round, text: '此路无将，重新翻令' });
  }
  return true;
}

/** What a re-spin of `dim` ('faction'|'era') would do right now. */
function respinInfo(run, dim) {
  const base = { free: run.free[dim] ? 0 : 1, enabled: false, hint: '', nextSource: null, target: null };
  if (run.phase !== 'flipped' || !run.token) return base;
  const alts = dim === 'faction' ? run.token.altFaction : run.token.altEra;
  const k = run.used[dim];
  const alt = alts[k];
  const valid =
    alt !== undefined &&
    (dim === 'faction' ? isValidCell(run.content, alt, run.token.era) : isValidCell(run.content, run.token.faction, alt));
  if (!valid) {
    base.hint = '此令无可换';
    return base;
  }
  base.target = alt;
  if (!run.free[dim]) {
    base.enabled = true;
    base.nextSource = 'free';
  } else if (run.allowance.ad > 0 && run.adUsed < run.allowance.ad) {
    base.nextSource = 'ad';
  } else {
    base.hint = '已用';
  }
  return base;
}

function reject(reason) {
  return { ok: false, reason };
}

/** Apply one action. Returns {ok:true} or {ok:false, reason}. Mutates `run` on success only. */
function apply(run, a) {
  if (!a || ACTION_TYPES.indexOf(a.type) < 0 || !Number.isInteger(a.round)) return reject('BAD_ACTION');
  const type = a.type;

  if (run.picks.length === run.config.rounds && type !== 'undo') return reject('EXTRA_ACTIONS');

  if (type === 'flip') {
    if (run.phase === 'placed' && run.round < run.config.rounds && a.round === run.round + 1) {
      // progressive delivery (spec 5.2): a client holding only the rounds released so far cannot flip further
      if (!run.rounds[run.round]) return reject('ROUND_NOT_RELEASED');
      run.round++;
      run.phase = 'awaitFlip';
      run.token = null;
      run.fbIdx = -1;
      run.used = { faction: 0, era: 0 };
    }
    if (a.round !== run.round) return reject('ROUND_MISMATCH');
    if (run.phase !== 'awaitFlip') return reject('ALREADY_FLIPPED');
    const t = startToken(run);
    if (!t) return reject('ROUND_NOT_RELEASED');
    run.token = { faction: t.faction, era: t.era, altFaction: t.altFaction, altEra: t.altEra };
    if (!settleToken(run)) return reject('NO_POOL');
    run.phase = 'flipped';
    run.actions.push({ round: a.round, type });
    return { ok: true };
  }

  if (a.round !== run.round) return reject('ROUND_MISMATCH');

  if (type === 'respinFaction' || type === 'respinEra') {
    const dim = type === 'respinFaction' ? 'faction' : 'era';
    if (run.phase === 'awaitFlip') return reject('NOT_FLIPPED');
    if (run.phase === 'placed') return reject('RESPIN_AFTER_PICK');
    const source = a.source || 'free';
    if (source !== 'free' && source !== 'ad') return reject('BAD_ACTION');
    if (source === 'ad') {
      if (!(run.allowance.ad > 0)) return reject('AD_RESPIN_NOT_ALLOWED');
      if (!run.free[dim]) return reject('AD_BEFORE_FREE');
      if (run.adUsed >= run.allowance.ad) return reject('RESPIN_LIMIT');
    } else if (run.free[dim] || !(run.allowance[dim] > 0)) {
      return reject('RESPIN_LIMIT');
    }
    const info = respinInfo(run, dim);
    if (info.target === null) return reject('NO_ALT');
    if (dim === 'faction') run.token.faction = info.target;
    else run.token.era = info.target;
    run.used[dim]++;
    if (source === 'free') {
      run.free[dim] = true;
      run.respinsFree++;
    } else {
      run.adUsed++;
      run.respinsAd++;
    }
    settleToken(run);
    run.actions.push({ round: a.round, type, source });
    return { ok: true };
  }

  if (type === 'pick') {
    if (run.phase === 'awaitFlip') return reject('NOT_FLIPPED');
    if (run.phase === 'placed') return reject('ALREADY_PICKED');
    if (SLOTS.indexOf(a.slot) < 0) return reject('BAD_SLOT');
    const content = run.content;
    const gi = content.indexOf[a.generalId];
    if (gi === undefined) return reject('NOT_IN_POOL');
    const inCell = content.cells[cellKey(run.token.faction, run.token.era)].indexOf(gi) >= 0;
    if (!inCell) return reject('NOT_IN_POOL');
    // a person can be drafted at most once per run, from whichever cell (spec 3.2)
    if (run.drafted[a.generalId]) return reject('DUPLICATE_GENERAL');
    // pool cap (spec 4): only the first poolCap undrafted members of the pool order are selectable
    if (currentPool(run).indexOf(gi) < 0) return reject('NOT_IN_POOL');
    if (run.slots[a.slot]) return reject('DUPLICATE_SLOT');
    run.drafted[a.generalId] = true;
    run.slots[a.slot] = a.generalId;
    run.picks.push({ round: run.round, generalId: a.generalId, slot: a.slot, faction: run.token.faction });
    run.finalTokens[run.round - 1] = { faction: run.token.faction, era: run.token.era };
    run.phase = 'placed';
    run.actions.push({ round: a.round, type, generalId: a.generalId, slot: a.slot });
    return { ok: true };
  }

  // undo
  if (run.phase !== 'placed') return reject('UNDO_INVALID');
  const last = run.picks[run.picks.length - 1];
  if (!last || last.round !== run.round) return reject('UNDO_INVALID');
  run.picks.pop();
  delete run.drafted[last.generalId];
  run.slots[last.slot] = null;
  run.finalTokens[run.round - 1] = null;
  run.phase = 'flipped';
  run.actions.push({ round: a.round, type });
  return { ok: true };
}

/** UI step 下一轮: move to the next round's face-down tokens. Not an action. */
function nextRound(run) {
  if (run.phase !== 'placed' || run.round >= run.config.rounds) return false;
  run.round++;
  run.phase = 'awaitFlip';
  run.token = null;
  run.fbIdx = -1;
  run.used = { faction: 0, era: 0 };
  return true;
}

function isComplete(run) {
  return run.picks.length === run.config.rounds;
}

/**
 * Lineup in fixed slot order. Slots may be null until complete. Each entry carries `faction`, the faction of the
 * cell the general was drafted from (cohesion uses it, spec 3.2/7.2); pass the entries to `simulate` unchanged.
 */
function lineupOf(run) {
  return SLOTS.map((s) => {
    const p = run.picks.find((x) => x.slot === s);
    return { slot: s, generalId: run.slots[s], faction: p ? p.faction : null };
  });
}

module.exports = {
  createRun,
  apply,
  nextRound,
  poolOf,
  draftedInCell,
  currentPool,
  respinInfo,
  isComplete,
  lineupOf,
  ACTION_TYPES,
};
