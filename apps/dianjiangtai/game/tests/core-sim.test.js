const test = require('node:test');
const assert = require('node:assert');

const rng = require('../core/rng');
const C = require('../core/content');
const { getConfig, bandFor } = require('../core/config');
const draft = require('../core/draft');
const { replay } = require('../core/validate');
const { buildSheet } = require('../core/sheet');
const { simulate, simulateScenario, makeScenario } = require('../core/sim');
const { bestLineup, enumerateSets } = require('../core/search');
const { gateCheck, acceptDailySeed } = require('../core/gates');
const { playRun } = require('../core/players');

const content = C.getContent(1);
const config = getConfig(1);
const SLOTS = C.SLOTS;

/** Plays a legal run with a seeded chooser; returns the actions. */
function playActions(seed, mode, chooseSeed, opts) {
  opts = opts || {};
  const run = draft.createRun({ seed, contentVersion: 1, mode });
  const r = rng.mulberry32(chooseSeed);
  for (let round = 1; round <= 5; round++) {
    if (round > 1) draft.nextRound(run);
    assert.ok(draft.apply(run, { round, type: 'flip' }).ok);
    if (opts.respin) {
      const dim = r() < 0.5 ? 'faction' : 'era';
      draft.apply(run, { round, type: dim === 'faction' ? 'respinFaction' : 'respinEra', source: 'free' });
    }
    const pool = draft.currentPool(run);
    const g = pool[Math.floor(r() * pool.length)];
    const open = SLOTS.filter((s) => !run.slots[s]);
    const slot = open[Math.floor(r() * open.length)];
    assert.ok(draft.apply(run, { round, type: 'pick', generalId: content.roster[g], slot }).ok);
  }
  return { run, actions: run.actions.slice() };
}

// --- draft engine / replay rules (AC 1-4, 8-10, 26) ---------------------------

test('a legal run replays to the same lineup (AC 1, 3)', () => {
  for (let i = 0; i < 100; i++) {
    const seed = rng.hash32('legal' + i);
    const { run, actions } = playActions(seed, 'free', i, { respin: true });
    const rep = replay(seed, 1, actions, 'free');
    assert.ok(rep.ok, JSON.stringify(rep));
    assert.deepStrictEqual(rep.lineup, draft.lineupOf(run));
    assert.deepStrictEqual(new Set(rep.lineup.map((e) => e.generalId)).size, 5);
    assert.deepStrictEqual(rep.tokens, rep.finalTokens);
  }
});

test('pools list only undrafted generals of the faction and era (AC 2)', () => {
  for (let i = 0; i < 50; i++) {
    const seed = rng.hash32('pool' + i);
    const run = draft.createRun({ seed, contentVersion: 1, mode: 'free' });
    for (let round = 1; round <= 5; round++) {
      if (round > 1) draft.nextRound(run);
      draft.apply(run, { round, type: 'flip' });
      const pool = draft.currentPool(run);
      assert.ok(pool.length >= 1);
      for (const gi of pool) {
        const g = content.generals[gi];
        assert.strictEqual(g.faction, run.token.faction);
        assert.ok(g.eras.includes(run.token.era));
        assert.ok(!run.drafted[g.id]);
      }
      draft.apply(run, { round, type: 'pick', generalId: content.roster[pool[0]], slot: SLOTS[round - 1] });
    }
  }
});

test('undo restores the pool and the slot, until the next flip (AC 4)', () => {
  const run = draft.createRun({ seed: 7, contentVersion: 1, mode: 'free' });
  draft.apply(run, { round: 1, type: 'flip' });
  const before = draft.currentPool(run).slice();
  const g = content.roster[before[0]];
  draft.apply(run, { round: 1, type: 'pick', generalId: g, slot: 'junshi' });
  assert.strictEqual(run.slots.junshi, g);
  assert.ok(draft.apply(run, { round: 1, type: 'undo' }).ok);
  assert.strictEqual(run.slots.junshi, null);
  assert.deepStrictEqual(draft.currentPool(run), before);
  // after the next flip there is nothing left to undo
  draft.apply(run, { round: 1, type: 'pick', generalId: g, slot: 'junshi' });
  draft.nextRound(run);
  draft.apply(run, { round: 2, type: 'flip' });
  assert.strictEqual(draft.apply(run, { round: 2, type: 'undo' }).ok, false);
});

function base(mode) {
  return { seed: 4242, mode: mode || 'daily' };
}

function rej(actions, mode, reason, cv) {
  const r = replay(4242, cv || 1, actions, mode || 'daily');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, 'INVALID_ACTIONS');
  if (reason) assert.strictEqual(r.reason, reason);
  return r;
}

test('replay rejects: unknown contentVersion, unknown mode, non-array actions', () => {
  rej([], 'daily', 'UNKNOWN_CONTENT_VERSION', 99);
  rej([], 'weird', 'UNKNOWN_MODE');
  const r = replay(1, 1, 'nope', 'daily');
  assert.strictEqual(r.reason, 'BAD_ACTIONS');
});

test('replay rejects: pick outside the pool, duplicate general, duplicate slot', () => {
  const sheet = buildSheet(4242, 1);
  const cell = content.cells[sheet[0].faction + '|' + sheet[0].era];
  const inPool = content.roster[cell[0]];
  const outside = content.generals.find((g) => !(g.faction === sheet[0].faction && g.eras.includes(sheet[0].era))).id;
  rej([{ round: 1, type: 'flip' }, { round: 1, type: 'pick', generalId: outside, slot: 'zhugong' }], 'daily', 'NOT_IN_POOL');
  rej([{ round: 1, type: 'flip' }, { round: 1, type: 'pick', generalId: 'g_nobody', slot: 'zhugong' }], 'daily', 'NOT_IN_POOL');
  rej([{ round: 1, type: 'flip' }, { round: 1, type: 'pick', generalId: inPool, slot: 'bad' }], 'daily', 'BAD_SLOT');
  // duplicate general: draft it in round 1, then try to draft it again from a later pool that contains it
  const run = draft.createRun({ seed: 4242, contentVersion: 1, mode: 'daily' });
  draft.apply(run, { round: 1, type: 'flip' });
  draft.apply(run, { round: 1, type: 'pick', generalId: inPool, slot: 'zhugong' });
  draft.nextRound(run);
  draft.apply(run, { round: 2, type: 'flip' });
  const r2 = run.rounds[1];
  void r2;
  // force the duplicate through a hand-made sheet where round 2 is the same cell
  const rounds = buildSheet(4242, 1);
  rounds[1] = rounds[0];
  const run2 = draft.createRun({ seed: 4242, contentVersion: 1, mode: 'daily', rounds });
  draft.apply(run2, { round: 1, type: 'flip' });
  draft.apply(run2, { round: 1, type: 'pick', generalId: inPool, slot: 'zhugong' });
  draft.nextRound(run2);
  draft.apply(run2, { round: 2, type: 'flip' });
  assert.strictEqual(draft.apply(run2, { round: 2, type: 'pick', generalId: inPool, slot: 'junshi' }).reason, 'DUPLICATE_GENERAL');
  // duplicate slot
  const other = content.roster[cell[1]];
  const run3 = draft.createRun({ seed: 4242, contentVersion: 1, mode: 'daily', rounds });
  draft.apply(run3, { round: 1, type: 'flip' });
  draft.apply(run3, { round: 1, type: 'pick', generalId: inPool, slot: 'zhugong' });
  draft.nextRound(run3);
  draft.apply(run3, { round: 2, type: 'flip' });
  assert.strictEqual(draft.apply(run3, { round: 2, type: 'pick', generalId: other, slot: 'zhugong' }).reason, 'DUPLICATE_SLOT');
});

test('replay rejects: re-spin after a pick, before the flip, beyond the allowance', () => {
  const sheet = buildSheet(4242, 1);
  const g = content.roster[content.cells[sheet[0].faction + '|' + sheet[0].era][0]];
  const flip = { round: 1, type: 'flip' };
  rej([flip, { round: 1, type: 'pick', generalId: g, slot: 'zhugong' }, { round: 1, type: 'respinFaction', source: 'free' }], 'free', 'RESPIN_AFTER_PICK');
  rej([{ round: 1, type: 'respinFaction', source: 'free' }], 'free', 'NOT_FLIPPED');
  rej([flip, { round: 1, type: 'respinFaction', source: 'free' }, { round: 1, type: 'respinFaction', source: 'free' }], 'free', 'RESPIN_LIMIT');
  rej([flip, { round: 1, type: 'respinEra', source: 'free' }, { round: 1, type: 'respinEra', source: 'free' }], 'daily', 'RESPIN_LIMIT');
  // free allowance is per RUN, not per round
  const r = replay(4242, 1, [flip, { round: 1, type: 'respinFaction', source: 'free' }, { round: 1, type: 'pick', generalId: 'x', slot: 'zhugong' }], 'free');
  assert.strictEqual(r.ok, false);
});

test('free re-spin is once per dimension per run, across rounds', () => {
  const run = draft.createRun({ seed: 99, contentVersion: 1, mode: 'free' });
  draft.apply(run, { round: 1, type: 'flip' });
  assert.ok(draft.apply(run, { round: 1, type: 'respinFaction', source: 'free' }).ok);
  assert.ok(draft.apply(run, { round: 1, type: 'respinEra', source: 'free' }).ok);
  const pool = draft.currentPool(run);
  draft.apply(run, { round: 1, type: 'pick', generalId: content.roster[pool[0]], slot: 'zhugong' });
  draft.nextRound(run);
  draft.apply(run, { round: 2, type: 'flip' });
  assert.strictEqual(draft.apply(run, { round: 2, type: 'respinFaction', source: 'free' }).reason, 'RESPIN_LIMIT');
  assert.strictEqual(draft.respinInfo(run, 'faction').nextSource, 'ad');
});

test('ad re-spins: free play only, after the free one, at most 2 (AC 9, 26)', () => {
  const flip = { round: 1, type: 'flip' };
  const rf = { round: 1, type: 'respinFaction', source: 'free' };
  const ad = { round: 1, type: 'respinFaction', source: 'ad' };
  const ade = { round: 1, type: 'respinEra', source: 'ad' };
  rej([flip, rf, ad], 'daily', 'AD_RESPIN_NOT_ALLOWED');
  rej([flip, rf, ad], 'challenge', 'AD_RESPIN_NOT_ALLOWED');
  rej([flip, ad], 'free', 'AD_BEFORE_FREE');
  const run = draft.createRun({ seed: 4242, contentVersion: 1, mode: 'free' });
  draft.apply(run, flip);
  assert.ok(draft.apply(run, rf).ok);
  assert.ok(draft.apply(run, ad).ok);
  assert.ok(draft.apply(run, { round: 1, type: 'respinEra', source: 'free' }).ok);
  assert.ok(draft.apply(run, ade).ok);
  assert.strictEqual(draft.apply(run, { round: 1, type: 'respinFaction', source: 'ad' }).reason, 'RESPIN_LIMIT');
  assert.strictEqual(run.respinsAd, 2);
});

test('replay rejects: fewer or more than 5 picks, wrong round, malformed actions', () => {
  const { actions } = playActions(4242, 'daily', 3);
  assert.ok(replay(4242, 1, actions, 'daily').ok);
  rej(actions.slice(0, -2), 'daily', 'WRONG_PICK_COUNT');
  rej([], 'daily', 'WRONG_PICK_COUNT');
  rej(actions.concat([{ round: 5, type: 'flip' }]), 'daily', 'EXTRA_ACTIONS');
  rej(actions.concat([{ round: 6, type: 'flip' }]), 'daily', 'EXTRA_ACTIONS');
  rej([{ round: 2, type: 'flip' }], 'daily', 'ROUND_MISMATCH');
  rej([null], 'daily', 'BAD_ACTION');
  rej([{ round: 1, type: 'teleport' }], 'daily', 'BAD_ACTION');
  rej([{ type: 'flip' }], 'daily', 'BAD_ACTION');
  rej([{ round: 1, type: 'flip' }, { round: 1, type: 'flip' }], 'daily', 'ALREADY_FLIPPED');
  rej(new Array(200).fill({ round: 1, type: 'flip' }), 'daily', 'BAD_ACTIONS');
});

test('empty pool after earlier picks reflips automatically from the carried fallback list (spec 4)', () => {
  // round 1 and 2 on the 2-general cell 群-三分; round 3 on the same cell is then empty
  const rounds = buildSheet(5, 1);
  const cell = { faction: 'qun', era: 'sanfen' };
  for (const k of [0, 1, 2]) {
    rounds[k] = Object.assign({}, rounds[k], cell, { altFaction: rounds[k].altFaction, altEra: rounds[k].altEra });
  }
  const run = draft.createRun({ seed: 5, contentVersion: 1, mode: 'daily', rounds });
  const picks = [];
  for (let round = 1; round <= 3; round++) {
    if (round > 1) draft.nextRound(run);
    assert.ok(draft.apply(run, { round, type: 'flip' }).ok);
    const pool = draft.currentPool(run);
    assert.ok(pool.length >= 1);
    if (round === 3) {
      assert.ok(run.log.some((l) => l.text === '此路无将，重新翻令'));
      assert.ok(run.fbIdx >= 0);
      assert.strictEqual(run.respinsFree + run.respinsAd, 0, 'a reflip is not a re-spin');
    }
    picks.push(content.roster[pool[0]]);
    draft.apply(run, { round, type: 'pick', generalId: content.roster[pool[0]], slot: SLOTS[round - 1] });
  }
  // the daily client has rounds only (no seed): the same replay works from rounds alone
  const run2 = draft.createRun({ seed: 0, contentVersion: 1, mode: 'daily', rounds });
  for (const a of run.actions) assert.ok(draft.apply(run2, a).ok);
  assert.deepStrictEqual(draft.lineupOf(run2), draft.lineupOf(run));
});

test('the sheet carries precomputed fallback tokens (the daily client has no seed)', () => {
  for (let i = 0; i < 20; i++) {
    const sheet = buildSheet(rng.hash32('fb' + i), 1);
    for (const r of sheet) {
      assert.ok(Array.isArray(r.fallback) && r.fallback.length >= 1);
      for (const f of r.fallback) assert.ok(f.faction && f.era && Array.isArray(f.altFaction) && Array.isArray(f.altEra));
    }
  }
});

test('same seed, same actions: identical sheet, record and battle log across 1000 replays; mode does not matter (AC 11, 18)', () => {
  const seed = 1234567;
  const { actions } = playActions(seed, 'free', 5);
  const ref = simulate(replay(seed, 1, actions, 'free').lineup, seed, 1, 1);
  for (let i = 0; i < 1000; i++) {
    const mode = ['free', 'free', 'free'][i % 3];
    const rep = replay(seed, 1, actions, mode);
    assert.deepStrictEqual(simulate(rep.lineup, seed, 1, 1), ref);
  }
  // identical outcome whatever the mode, since no ad re-spins were used
  for (const mode of ['daily', 'challenge']) {
    const noAd = playActions(seed, mode, 5).actions;
    assert.deepStrictEqual(simulate(replay(seed, 1, noAd, mode).lineup, seed, 1, 1).record, simulate(replay(seed, 1, noAd, 'free').lineup, seed, 1, 1).record);
  }
});

// --- simulator (AC 12-14, 18) ---------------------------------------------------

test('records sum to 12 and the band matches the 7.5 table for every value (AC 12)', () => {
  const expect = { 12: 'yitong', 11: 'baye', 10: 'baye', 9: 'xiongju', 8: 'xiongju', 7: 'dingli', 6: 'dingli', 5: 'pianan', 4: 'pianan', 3: 'bingwei', 2: 'bingwei', 1: 'tubai', 0: 'tubai' };
  for (let w = 0; w <= 12; w++) assert.strictEqual(bandFor(config, w).key, expect[w]);
  const labels = ['一统天下', '霸业将成', '雄踞一方', '三分鼎立', '偏安一方', '兵微将寡', '一败涂地'];
  assert.deepStrictEqual(config.bands.map((b) => b.label), labels);
  for (let i = 0; i < 300; i++) {
    const seed = rng.hash32('rec' + i);
    const r = playRun('random', seed, 1, 'free', rng.sub(seed, 'x'));
    assert.strictEqual(r.record.w + r.record.l, 12);
    assert.strictEqual(r.sim.band.key, expect[r.record.w]);
    assert.strictEqual(r.sim.battles.length, 12);
    assert.strictEqual(r.sim.battles.filter((b) => b.win).length, r.record.w);
  }
});

test('every battle type appears at least once per run', () => {
  for (let i = 0; i < 200; i++) {
    const scn = makeScenario(rng.hash32('t' + i), 1);
    const types = new Set(scn.typeIdx);
    assert.strictEqual(types.size, config.battleTypes.length);
  }
});

function cloneContentWith(mod) {
  const generals = JSON.parse(JSON.stringify(content.generals));
  mod(generals);
  const roleScores = generals.map((g) =>
    SLOTS.map((s) => {
      let sum = 0;
      for (const k of C.STAT_KEYS) sum += content.roleByKey[s].weights[k] * g.stats[k];
      return Math.round(sum * 1e6) / 1e6;
    })
  );
  return Object.assign({}, content, { generals, roleScores });
}

test('monotonicity: raising any stat of any drafted general never lowers wins (events off) (AC 13)', () => {
  let strictlyBetter = 0;
  for (let i = 0; i < 300; i++) {
    const seed = rng.hash32('mono' + i);
    const r = playRun('random', seed, 1, 'free', rng.sub(seed, 'm'));
    const scn = makeScenario(seed, 1);
    const base = simulateScenario(scn, r.lineup, { events: false }).record.w;
    const rr = rng.sub(seed, 'stat');
    const gid = r.lineup[Math.floor(rr() * 5)].generalId;
    const stat = C.STAT_KEYS[Math.floor(rr() * 5)];
    const bump = cloneContentWith((gens) => {
      const g = gens.find((x) => x.id === gid);
      g.stats[stat] = Math.min(10, g.stats[stat] + 3);
    });
    const scn2 = Object.assign({}, scn, { content: bump });
    const after = simulateScenario(scn2, r.lineup, { events: false }).record.w;
    assert.ok(after >= base, `${gid} ${stat}: ${base} -> ${after}`);
    if (after > base) strictlyBetter++;
  }
  assert.ok(strictlyBetter > 0, 'the bump should help at least sometimes');
});

test('a stronger lineup never does worse on the same seed, before events (AC 13)', () => {
  // pairwise: lineup B is A with every slot upgraded to a general at least as good in that role
  for (let i = 0; i < 200; i++) {
    const seed = rng.hash32('dom' + i);
    const scn = makeScenario(seed, 1);
    const pick = rng.sub(seed, 'dom');
    const ids = rng.shuffle(pick, content.roster.slice()).slice(0, 5);
    const A = SLOTS.map((s, k) => ({ slot: s, generalId: ids[k] }));
    // B: same generals but boosted stats via cloned content (dominance in every role score)
    const boosted = cloneContentWith((gens) => gens.forEach((g) => ids.includes(g.id) && C.STAT_KEYS.forEach((k) => (g.stats[k] = Math.min(10, g.stats[k] + 1)))));
    const a = simulateScenario(scn, A, { events: false }).record.w;
    const b = simulateScenario(Object.assign({}, scn, { content: boosted }), A, { events: false }).record.w;
    assert.ok(b >= a);
    // and per battle, not just in total
    const ba = simulateScenario(scn, A, { events: false }).battles;
    const bb = simulateScenario(Object.assign({}, scn, { content: boosted }), A, { events: false }).battles;
    for (let j = 0; j < 12; j++) assert.ok(!(ba[j].win && !bb[j].win));
  }
});

test('battle and event randomness never depend on the lineup (AC 18)', () => {
  const seed = 77;
  const s1 = makeScenario(seed, 1);
  const s2 = makeScenario(seed, 1);
  assert.deepStrictEqual(s1.typeIdx, s2.typeIdx);
  assert.deepStrictEqual(s1.u, s2.u);
  const A = SLOTS.map((s, k) => ({ slot: s, generalId: content.roster[k] }));
  const B = SLOTS.map((s, k) => ({ slot: s, generalId: content.roster[k + 8] }));
  const ra = simulateScenario(s1, A);
  const rb = simulateScenario(s1, B);
  assert.deepStrictEqual(ra.battles.map((b) => [b.type, b.u, b.D]), rb.battles.map((b) => [b.type, b.u, b.D]));
});

test('events: fire only under their conditions, at most once each, named rows (AC 14)', () => {
  const seen = { wavering: 0, stratagem: 0, unstoppable: 0 };
  for (let i = 0; i < 3000; i++) {
    const seed = rng.hash32('ev' + i);
    const r = playRun('sensible', seed, 1, 'free', rng.sub(seed, 'e'));
    const kinds = r.sim.events.map((e) => e.kind);
    assert.strictEqual(new Set(kinds).size, kinds.length, 'at most one of each');
    const byslot = {};
    r.lineup.forEach((e) => (byslot[e.slot] = content.byId[e.generalId]));
    for (const e of r.sim.events) {
      seen[e.kind]++;
      const row = r.sim.battles[e.battle - 1];
      assert.ok(row.event && row.cause === e.line, 'event row is named');
      if (e.kind === 'wavering') {
        assert.ok(content.byId[e.generalId].stats.xin <= 3);
        assert.strictEqual(row.win, false);
        assert.strictEqual(row.baseWin, true);
        assert.ok(content.texts.wavering.some((t) => t.replace('{name}', content.byId[e.generalId].name) === e.line));
      }
      if (e.kind === 'stratagem') {
        assert.ok(byslot.junshi.stats.zhi >= 9);
        assert.ok(['shuiZhan', 'qiXi'].includes(row.type));
        assert.ok(row.win && !row.baseWin && row.p >= 0.35 - 1e-9);
      }
      if (e.kind === 'unstoppable') {
        assert.strictEqual(byslot.mengjiang.stats.yong, 10);
        assert.strictEqual(row.type, 'yeZhan');
        assert.ok(row.win && !row.baseWin && row.p >= 0.35 - 1e-9);
      }
    }
    // events off: no event rows and the record is the natural one
    const off = simulateScenario(makeScenario(seed, 1), r.lineup, { events: false });
    assert.strictEqual(off.events.length, 0);
    assert.ok(off.battles.every((b) => b.win === b.baseWin && b.event === null));
  }
  assert.ok(seen.wavering > 0 && seen.stratagem > 0 && seen.unstoppable > 0, JSON.stringify(seen));
});

test('only the first strong 军师 / 猛将 qualifies: weak lineups never fire 奇谋 or 万夫莫敌', () => {
  const weak = SLOTS.map((s) => ({ slot: s, generalId: 'g_liubei' }));
  void weak;
  const ids = { zhugong: 'g_liubei', junshi: 'g_jiangwei', xianfeng: 'g_machao', mengjiang: 'g_zhaoyun', shoujiang: 'g_huangzhong' };
  const lineup = SLOTS.map((s) => ({ slot: s, generalId: ids[s] }));
  for (let i = 0; i < 500; i++) {
    const r = simulate(lineup, rng.hash32('weak' + i), 1, 1);
    assert.strictEqual(r.events.length, 0, 'no wavering, 智8 junshi, 勇9 mengjiang');
  }
});

test('morale: base, lord, bonds (桃园, 江东), cohesion, cap 1.25', () => {
  const { moraleOf } = require('../core/sim');
  const idx = (ids) => ids.map((id) => content.indexOf[id]);
  const m1 = moraleOf(content, config, idx(['g_liubei', 'g_zhugeliang', 'g_zhaoyun', 'g_guanyu', 'g_zhangfei']), 8);
  assert.deepStrictEqual(m1.bondKeys, ['taoyuan']);
  assert.ok(Math.abs(m1.total - (0.85 + 0.24 + 0.04 + 0.05)) < 1e-9, 'all 蜀: bond + cohesion 5');
  const m2 = moraleOf(content, config, idx(['g_caocao', 'g_guojia', 'g_xuchu', 'g_zhangliao', 'g_lvbu']), 7);
  assert.strictEqual(m2.cohesion, 0.03, 'four wei + one qun: cohesion 4');
  const m3 = moraleOf(content, config, idx(['g_caocao', 'g_guojia', 'g_xuchu', 'g_zhangliao', 'g_xunyu']), 7);
  assert.strictEqual(m3.cohesion, 0.05);
  const m4 = moraleOf(content, config, idx(['g_sunce', 'g_zhouyu', 'g_caocao', 'g_xuchu', 'g_lvbu']), 8);
  assert.deepStrictEqual(m4.bondKeys, ['jiangdong']);
  const capped = moraleOf(content, config, idx(['g_liubei', 'g_zhugeliang', 'g_zhaoyun', 'g_guanyu', 'g_zhangfei']), 40);
  assert.strictEqual(capped.total, 1.25);
});

test('role cause lines are templated and name the slot occupant', () => {
  const seed = 31;
  const r = playRun('greedy', seed, 1, 'free', rng.sub(seed, 'c'));
  for (const b of r.sim.battles) {
    if (b.event) continue;
    assert.ok(b.cause.startsWith(b.typeLabel + '：'));
    const name = content.byId[r.lineup.find((e) => e.slot === b.causeSlot).generalId].name;
    assert.ok(b.cause.indexOf(name) >= 0);
  }
});

// --- search (复盘, AC 16) -------------------------------------------------------

function bruteBest(seed, tokens) {
  const scn = makeScenario(seed, 1);
  const pools = tokens.map((t) => content.cells[t.faction + '|' + t.era]);
  let best = null;
  const perms = [];
  (function p(a, rest) {
    if (!rest.length) return perms.push(a);
    rest.forEach((x, i) => p(a.concat([x]), rest.slice(0, i).concat(rest.slice(i + 1))));
  })([], [0, 1, 2, 3, 4]);
  const seen = new Set();
  (function rec(r, picked) {
    if (r === 5) {
      const key = picked.slice().sort().join(',');
      if (seen.has(key)) return;
      seen.add(key);
      for (const perm of perms) {
        const lineup = perm.map((pi, k) => ({ slot: SLOTS[k], generalId: content.roster[picked[pi]] }));
        const s = simulateScenario(scn, lineup);
        let metric = 0;
        s.battles.forEach((b, i) => (metric += 1 / (1 + Math.exp(-(b.P - b.D) / config.tau))));
        if (!best || s.record.w > best.w || (s.record.w === best.w && metric > best.metric + 1e-12)) best = { w: s.record.w, metric };
      }
      return;
    }
    for (const g of pools[r]) if (!picked.includes(g)) rec(r + 1, picked.concat([g]));
  })(0, []);
  return best;
}

test('复盘 search equals brute force (record and tie-break), is drawable and >= the player (AC 16)', () => {
  for (let i = 0; i < 5; i++) {
    const seed = rng.hash32('bf' + i);
    const played = playRun('sensible', seed, 1, 'free', rng.sub(seed, 'p'));
    const tokens = played.run.finalTokens;
    const res = bestLineup(seed, 1, tokens);
    assert.ok(res);
    const brute = bruteBest(seed, tokens);
    assert.strictEqual(res.record.w, brute.w, 'optimal wins match brute force');
    assert.ok(res.record.w >= played.record.w);
    // drawable: each general belongs to a distinct round pool
    const ids = res.lineup.map((e) => e.generalId);
    assert.strictEqual(new Set(ids).size, 5);
    const sets = enumerateSets(content, tokens);
    const key = ids.map((id) => content.indexOf[id]).sort((a, b) => a - b).join(',');
    assert.ok(sets.some((s) => s.join(',') === key));
    // tie-break equals brute force
    const scn = makeScenario(seed, 1);
    const s = simulateScenario(scn, res.lineup);
    let metric = 0;
    s.battles.forEach((b) => (metric += 1 / (1 + Math.exp(-(b.P - b.D) / config.tau))));
    assert.ok(Math.abs(metric - brute.metric) < 1e-9, `tie-break ${metric} vs ${brute.metric}`);
  }
});

test('复盘 is deterministic; stopAt12 agrees on the 12-0 question; null when no 5 distinct generals', () => {
  for (let i = 0; i < 10; i++) {
    const seed = rng.hash32('det' + i);
    const sheet = buildSheet(seed, 1);
    const tokens = sheet.map((r) => ({ faction: r.faction, era: r.era }));
    const a = bestLineup(seed, 1, tokens);
    const b = bestLineup(seed, 1, tokens);
    assert.deepStrictEqual(a, b);
    if (a) {
      const quick = bestLineup(seed, 1, tokens, { stopAt12: true });
      assert.strictEqual(quick.record.l === 0, a.record.l === 0);
    }
  }
  const tiny = [0, 1, 2, 3, 4].map(() => ({ faction: 'qun', era: 'sanfen' }));
  assert.strictEqual(bestLineup(1, 1, tiny), null);
});

// --- gates (AC 21, 55) ------------------------------------------------------------

test('gateCheck is deterministic and its rates are shares of K=400 players (AC 55)', () => {
  let checked = 0;
  for (let i = 0; i < 1500 && checked < 2; i++) {
    const seed = rng.hash32('gate' + i);
    const a = gateCheck(seed, 1, 1);
    const b = gateCheck(seed, 1, 1);
    assert.deepStrictEqual(a, b);
    assert.strictEqual(a.K, 400);
    assert.strictEqual(a.gateVersion, config.gateVersion);
    assert.strictEqual(a.relaxed, false);
    if (a.greedyRate !== null) {
      checked++;
      assert.ok(Math.abs(a.greedyRate * 400 - Math.round(a.greedyRate * 400)) < 1e-9);
      assert.ok(Math.abs(a.randomRate * 400 - Math.round(a.randomRate * 400)) < 1e-9);
    }
  }
  assert.ok(checked > 0, 'at least one candidate reached the population stage');
});

test('acceptDailySeed: accepted seeds have optimal 12-0 and rates inside the bands; returns best and rounds', () => {
  let accepted = null;
  for (let i = 0; i < 8000 && !accepted; i++) {
    const r = acceptDailySeed(rng.hash32('accept' + i));
    if (r.accepted) accepted = r;
  }
  assert.ok(accepted, 'at least one seed accepted in 8000 candidates');
  assert.strictEqual(accepted.gates.optimal.l, 0);
  assert.ok(accepted.gates.greedyRate >= config.gates.greedy.rateMin && accepted.gates.greedyRate <= config.gates.greedy.rateMax);
  assert.ok(accepted.gates.randomRate < config.gates.random.rateMax);
  assert.strictEqual(accepted.best.record.l, 0);
  assert.strictEqual(accepted.rounds.length, 5);
});
