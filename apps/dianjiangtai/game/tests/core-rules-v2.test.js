'use strict';
// contentVersion 2 rules: multi-appearance drafting, the 8-general pool cap, cohesion by drafted cell, the 16 bonds,
// progressive round delivery, 识人 flags, determinism, exact 复盘 under the cap, and v1 regression pins.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const rng = require('../core/rng');
const date = require('../core/date');
const C = require('../core/content');
const draft = require('../core/draft');
const { buildSheet, poolOrder } = require('../core/sheet');
const { getConfig, defaultConfigVersion } = require('../core/config');
const { replay, replayPrefix, roundToken, extendsPrefix } = require('../core/validate');
const { simulate, makeScenario, simulateScenario } = require('../core/sim');
const { bestLineup } = require('../core/search');
const { playRun } = require('../core/players');

const content = C.getContent(2);
const cfg = getConfig(2);
const SLOTS = C.SLOTS;

/** A sheet whose rounds are on the given cells (pools of the seed's sheet kept, they cover every big cell). */
function sheetOn(seed, cells) {
  const base = buildSheet(seed, 2);
  return base.map((r, i) => Object.assign({}, r, { faction: cells[i][0], era: cells[i][1], altFaction: [], altEra: [] }));
}

function newRun(seed, cells, mode) {
  return draft.createRun({ seed, contentVersion: 2, mode: mode || 'free', rounds: sheetOn(seed, cells) });
}

function pickId(run, id, slot) {
  const r = draft.apply(run, { round: run.round, type: 'pick', generalId: id, slot });
  return r;
}

test('config 2 is the default for content 2, config 1 for content 1; unknown versions are null', () => {
  assert.equal(defaultConfigVersion(1), 1);
  assert.equal(defaultConfigVersion(2), 2);
  assert.equal(cfg.contentVersion, 2);
  assert.equal(getConfig(1).contentVersion, 1);
  assert.equal(getConfig(3), null);
  assert.equal(C.getContent(3), null);
  assert.equal(cfg.poolCap, 8);
  assert.equal(getConfig(1).poolCap, 8);
  assert.equal(cfg.gateVersion, getConfig(1).gateVersion);
});

test('sheet: only valid cells (21), alternates stay valid, 晋 only in 归晋, pools ride in every round (AC 72)', () => {
  for (let i = 0; i < 500; i++) {
    const seed = rng.hash32('s2:' + i);
    const sheet = buildSheet(seed, 2);
    assert.deepEqual(sheet, buildSheet(seed, 2));
    for (const r of sheet) {
      assert.ok(content.cells[C.cellKey(r.faction, r.era)].length >= 4);
      if (r.faction === 'jin') assert.equal(r.era, 'guijin');
      assert.equal(r.altEra.length === 0, r.faction === 'jin', 'a 晋 token has nothing to 换时代 to');
      for (const f of r.altFaction) assert.ok(content.cells[C.cellKey(f, r.era)].length >= 4);
      for (const e of r.altEra) assert.ok(content.cells[C.cellKey(r.faction, e)].length >= 4);
      const last = r.fallback[r.fallback.length - 1];
      assert.ok(content.cells[C.cellKey(last.faction, last.era)].length >= 5);
      // pools: exactly the cells above the cap, each a permutation of the cell, equal to the documented stream
      const big = content.validCells.filter((c) => content.cells[C.cellKey(c.faction, c.era)].length > 8);
      assert.equal(Object.keys(r.pools).length, big.length);
      assert.equal(big.length, 15);
    }
    sheet.forEach((r, k) => {
      for (const key of Object.keys(r.pools)) {
        const [f, e] = key.split('|');
        assert.deepEqual(r.pools[key].slice().sort((a, b) => a - b), content.cells[key], key);
        assert.deepEqual(r.pools[key], rng.shuffle(rng.sub(seed, 'pool:' + (k + 1) + ':' + f + ':' + e), content.cells[key].slice()));
        assert.deepEqual(r.pools[key], poolOrder(seed, content, k + 1, f, e));
      }
    });
  }
});

test('sheet cells are uniform over the 21 used cells, independent of tier (AC 6)', () => {
  const count = {};
  const N = 20000;
  for (let i = 0; i < N; i++) for (const r of buildSheet(rng.hash32('u2:' + i), 2)) count[r.faction + r.era] = (count[r.faction + r.era] || 0) + 1;
  assert.equal(Object.keys(count).length, 21);
  const exp = (N * 5) / 21;
  for (const k of Object.keys(count)) assert.ok(Math.abs(count[k] - exp) / exp < 0.08, k + ' ' + count[k]);
});

test('pool cap: never more than 8 selectable; cells of <= 8 show every undrafted member (AC 72)', () => {
  for (let i = 0; i < 300; i++) {
    const seed = rng.hash32('cap:' + i);
    const run = draft.createRun({ seed, contentVersion: 2, mode: 'free' });
    for (let r = 1; r <= 5; r++) {
      if (r > 1) draft.nextRound(run);
      assert.ok(draft.apply(run, { round: r, type: 'flip' }).ok);
      const pool = draft.currentPool(run);
      const cell = content.cells[C.cellKey(run.token.faction, run.token.era)];
      const undrafted = cell.filter((gi) => !run.drafted[content.roster[gi]]);
      assert.ok(pool.length <= 8);
      assert.equal(pool.length, Math.min(8, undrafted.length));
      if (undrafted.length <= 8) assert.deepEqual(pool, undrafted);
      assert.deepEqual(pool, pool.slice().sort((a, b) => a - b), 'roster order');
      // the dimmed rows: cell members already drafted, not part of the pool
      for (const gi of draft.draftedInCell(run, run.token.faction, run.token.era)) assert.ok(run.drafted[content.roster[gi]] && !pool.includes(gi));
      assert.ok(pickId(run, content.roster[pool[0]], SLOTS[r - 1]).ok);
    }
  }
});

test('pool = first 8 undrafted in the seeded order; it depends only on seed, round, cell and drafted people; undo restores it exactly', () => {
  const seed = rng.hash32('poolorder');
  const cells = [['qun', 'qunxiong'], ['wei', 'qunxiong'], ['qun', 'qunxiong'], ['wu', 'chibi'], ['shu', 'sanfen']];
  const run = newRun(seed, cells);
  draft.apply(run, { round: 1, type: 'flip' });
  const order1 = run.rounds[0].pools['qun|qunxiong'];
  assert.deepEqual(draft.currentPool(run), order1.slice(0, 8).sort((a, b) => a - b));
  const before = draft.currentPool(run).slice();
  const first = order1[0];
  assert.ok(pickId(run, content.roster[first], 'zhugong').ok);
  assert.ok(draft.apply(run, { round: 1, type: 'undo' }).ok);
  assert.deepEqual(draft.currentPool(run), before, 'undo restores the pool exactly');
  assert.ok(pickId(run, content.roster[first], 'zhugong').ok);
  draft.nextRound(run);
  draft.apply(run, { round: 2, type: 'flip' });
  assert.ok(pickId(run, content.roster[draft.currentPool(run)[0]], 'junshi').ok);
  draft.nextRound(run);
  draft.apply(run, { round: 3, type: 'flip' });
  // round 3 is the same cell as round 1, with round 3's own order and the drafted people removed
  const order3 = run.rounds[2].pools['qun|qunxiong'];
  const drafted = new Set(Object.keys(run.drafted).map((id) => content.indexOf[id]));
  const expect = order3.filter((g) => !drafted.has(g)).slice(0, 8).sort((a, b) => a - b);
  assert.deepEqual(draft.currentPool(run), expect);
  assert.notDeepEqual(order1, order3, 'each round shuffles on its own stream');
  assert.ok(!draft.currentPool(run).includes(first), 'the person drafted in round 1 is not selectable again');
  assert.ok(draft.draftedInCell(run, 'qun', 'qunxiong').includes(first), 'shown as 已点将');
});

test('a person is drafted at most once: 赵云 from 群-群雄, then his 蜀 pools show him only as 已点将 (AC 70)', () => {
  const zy = content.indexOf.g_zhaoyun;
  assert.ok(content.cells['qun|qunxiong'].includes(zy));
  assert.ok(content.cells['shu|qunxiong'].includes(zy) && content.cells['shu|chibi'].includes(zy) && content.cells['shu|sanfen'].includes(zy));
  const seed = rng.hash32('zhaoyun');
  // 蜀-三分 has 22 members: make sure 赵云 would be in round 2's pool if he were undrafted
  let s = seed;
  let ok = false;
  for (let k = 0; k < 200 && !ok; k++) {
    s = rng.hash32('zy:' + k);
    const sh = sheetOn(s, [['qun', 'qunxiong'], ['shu', 'chibi'], ['shu', 'sanfen'], ['shu', 'qunxiong'], ['shu', 'chibi']]);
    ok = sh[0].pools['qun|qunxiong'].slice(0, 8).includes(zy) && sh[1].pools['shu|chibi'].slice(0, 8).includes(zy);
  }
  assert.ok(ok, 'found a seed where 赵云 shows in both pools');
  const run = newRun(s, [['qun', 'qunxiong'], ['shu', 'chibi'], ['shu', 'sanfen'], ['shu', 'qunxiong'], ['shu', 'chibi']]);
  draft.apply(run, { round: 1, type: 'flip' });
  assert.ok(draft.currentPool(run).includes(zy));
  assert.ok(pickId(run, 'g_zhaoyun', 'mengjiang').ok);
  assert.equal(run.picks[0].faction, 'qun', 'drafted from the 群 cell');
  draft.nextRound(run);
  draft.apply(run, { round: 2, type: 'flip' });
  assert.ok(!draft.currentPool(run).includes(zy));
  assert.ok(draft.draftedInCell(run, 'shu', 'chibi').includes(zy));
  assert.equal(draft.currentPool(run).length, 8, 'the dimmed row does not count toward the cap, the pool refills to 8');
  const dup = pickId(run, 'g_zhaoyun', 'junshi');
  assert.equal(dup.ok, false);
  assert.equal(dup.reason, 'DUPLICATE_GENERAL');
  assert.equal(run.picks.length, 1);

  // crafted submitRun: the same person via two cells is rejected by the replay
  const actions = [
    { round: 1, type: 'flip' }, { round: 1, type: 'pick', generalId: 'g_zhaoyun', slot: 'mengjiang' },
    { round: 2, type: 'flip' }, { round: 2, type: 'pick', generalId: 'g_zhaoyun', slot: 'junshi' },
  ];
  const sheetSeed = s;
  // the replay uses the seed's own sheet; craft against whatever tokens it has: find a seed with 赵云 reachable twice
  let found = null;
  for (let k = 0; k < 4000 && !found; k++) {
    const sd = rng.hash32('dup:' + k);
    const sh = buildSheet(sd, 2);
    const c1 = content.cells[C.cellKey(sh[0].faction, sh[0].era)];
    const c2 = content.cells[C.cellKey(sh[1].faction, sh[1].era)];
    const p1 = sh[0].pools[C.cellKey(sh[0].faction, sh[0].era)];
    const p2 = sh[1].pools[C.cellKey(sh[1].faction, sh[1].era)];
    const in1 = p1 ? p1.slice(0, 8).includes(zy) : c1.includes(zy);
    const in2 = p2 ? p2.slice(0, 8).includes(zy) : c2.includes(zy);
    if (in1 && in2) found = sd;
  }
  assert.ok(found !== null, 'a seed with 赵云 in two pools');
  const bad = replay(found, 2, actions, 'free');
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'INVALID_ACTIONS');
  assert.equal(bad.reason, 'DUPLICATE_GENERAL');
  assert.equal(bad.index, 3);
  void sheetSeed;
});

test('a pick outside the capped pool is rejected NOT_IN_POOL even if the person belongs to the cell (AC 72)', () => {
  const seed = rng.hash32('outside');
  const run = newRun(seed, [['qun', 'qunxiong'], ['wei', 'chibi'], ['wu', 'sanfen'], ['shu', 'chibi'], ['qun', 'chibi']]);
  draft.apply(run, { round: 1, type: 'flip' });
  const order = run.rounds[0].pools['qun|qunxiong'];
  const outside = order[8];
  const r = pickId(run, content.roster[outside], 'zhugong');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'NOT_IN_POOL');
  assert.equal(run.picks.length, 0);
  assert.ok(pickId(run, content.roster[order[7]], 'zhugong').ok);
});

test('cohesion uses the drafted cell faction: 4 from 群 cells incl. a 群-appearance 赵云 get +0.03 (AC 71)', () => {
  const seed = 99;
  const lineQun = [
    { slot: 'zhugong', generalId: 'g_zhangjue', faction: 'qun' },
    { slot: 'junshi', generalId: 'g_zhaoyun', faction: 'qun' },
    { slot: 'xianfeng', generalId: 'g_zhanghe', faction: 'qun' },
    { slot: 'mengjiang', generalId: 'g_lvbu', faction: 'qun' },
    { slot: 'shoujiang', generalId: 'g_caocao', faction: 'wei' },
  ];
  const a = simulate(lineQun, seed, 2, 2);
  assert.ok(Math.abs(a.morale.cohesion - 0.03) < 1e-12);
  // the same people drafted from their primary-faction cells
  const prim = lineQun.map((e) => Object.assign({}, e, { faction: content.byId[e.generalId].faction }));
  const b = simulate(prim, seed, 2, 2);
  assert.equal(b.morale.cohesion, 0, '赵云 drafted from 蜀 does not count for 群');
  // without `faction` the primary faction is used
  const c = simulate(lineQun.map((e) => ({ slot: e.slot, generalId: e.generalId })), seed, 2, 2);
  assert.equal(c.morale.cohesion, 0);
  // all five from 群 cells: +0.05
  const five = lineQun.map((e) => Object.assign({}, e, { faction: 'qun' }));
  assert.ok(Math.abs(simulate(five, seed, 2, 2).morale.cohesion - 0.05) < 1e-12);
  // lineup returned by simulate carries the drafted faction
  assert.deepEqual(a.lineup.map((e) => e.faction), ['qun', 'qun', 'qun', 'qun', 'wei']);
  // a played run carries the drafted faction through replay -> simulate
  for (let i = 0; i < 50; i++) {
    const sd = rng.hash32('fac:' + i);
    const r = playRun('greedy', sd, 2, 'free', rng.sub(sd, 'p'));
    r.run.picks.forEach((p, k) => assert.equal(p.faction, r.run.finalTokens[k].faction));
    for (const e of r.lineup) assert.ok(e.faction);
    const rp = replay(sd, 2, r.run.actions, 'free');
    assert.ok(rp.ok);
    assert.deepEqual(rp.lineup, r.lineup);
    assert.deepEqual(simulate(rp.lineup, sd, 2).record, r.record);
  }
});

test('bonds: +0.04 only when every member is drafted (any appearance, any slot), M never above 1.25 (AC 73)', () => {
  const fill = (ids, facs) => ids.map((id, i) => ({ slot: SLOTS[i], generalId: id, faction: facs ? facs[i] : content.byId[id].faction }));
  const others = ['g_zhangjue', 'g_hansui', 'g_menghuo', 'g_yuanshu', 'g_liuzhang'];
  const m0 = simulate(fill(others), 5, 2, 2).morale;
  assert.equal(m0.bondBonus, 0);
  for (const b of content.bonds) {
    const rest = others.filter((id) => !b.members.includes(id));
    const ids = b.members.concat(rest).slice(0, 5);
    // all members present
    const full = simulate(fill(ids), 5, 2, 2).morale;
    assert.ok(full.bondKeys.includes(b.key), b.key + ' fires');
    // one member missing -> that bond does not fire
    const miss = b.members.slice(1).concat(rest).slice(0, 5);
    assert.ok(!simulate(fill(miss), 5, 2, 2).morale.bondKeys.includes(b.key), b.key + ' needs everyone');
    assert.ok(full.total <= 1.25 + 1e-12);
  }
  // two bonds at once add up (桃园 + 江东 = 5 generals)
  const two = simulate(fill(['g_liubei', 'g_guanyu', 'g_zhangfei', 'g_sunce', 'g_zhouyu']), 5, 2, 2).morale;
  assert.deepEqual(two.bondKeys.sort(), ['jiangdong', 'taoyuan']);
  assert.ok(Math.abs(two.bondBonus - 0.08) < 1e-12);
  assert.ok(two.total <= 1.25 + 1e-12);
  // 孙策 sits in two bonds
  const sc = simulate(fill(['g_sunce', 'g_zhouyu', 'g_taishici', 'g_zhangjue', 'g_hansui']), 5, 2, 2).morale;
  assert.deepEqual(sc.bondKeys.sort(), ['jiangdong', 'shenting']);
  // 关羽 in 桃园 and 父子同袍
  const gy = simulate(fill(['g_liubei', 'g_guanyu', 'g_zhangfei', 'g_guanping', 'g_hansui']), 5, 2, 2).morale;
  assert.deepEqual(gy.bondKeys.sort(), ['fuzi_guan', 'taoyuan']);
  assert.deepEqual(gy.bonds.filter((x) => x === '父子同袍').length, 1);
  // the cap bites: lord 10 + 3 bonds' worth + cohesion cannot pass 1.25
  const capped = simulate(fill(['g_liubei', 'g_guanyu', 'g_zhangfei', 'g_guanping', 'g_zhugeliang'], ['shu', 'shu', 'shu', 'shu', 'shu']), 5, 2, 2).morale;
  assert.ok(capped.total <= 1.25);
});

test('every bond can be drafted in one run (members reachable from cells of five distinct rounds)', () => {
  for (const b of content.bonds) {
    // a matching of members to five different rounds' cells: pick for each member a cell it appears in; cells may repeat
    for (const id of b.members) assert.ok(content.generals[content.indexOf[id]].appearances.length >= 1);
    assert.ok(b.members.length <= 5);
    // and the search can actually build it: five rounds on cells containing the members
    const cellsFor = b.members.map((id) => {
      const g = content.byId[id];
      return [g.appearances[0].faction, g.appearances[0].eras[0]];
    });
    while (cellsFor.length < 5) cellsFor.push(['qun', 'qunxiong']);
    const sets = require('../core/search').enumerateSets(content, cellsFor.map((c) => ({ faction: c[0], era: c[1] })), 40);
    assert.ok(sets.some((s) => b.members.every((id) => s.g.includes(content.indexOf[id]))), b.key);
  }
});

test('progressive delivery: roundToken hands out round n only for a valid prefix with n-1 picks (AC 86)', () => {
  const seed = rng.hash32('progressive');
  const sheet = buildSheet(seed, 2, 2);
  const r1 = roundToken(seed, 2, 1, [], 'daily');
  assert.equal(r1.ok, true);
  assert.deepEqual(r1.round, sheet[0]);
  assert.equal(r1.n, 1);
  // play it round by round through the API only, with a client that holds only the released rounds
  const released = [r1.round];
  const client = draft.createRun({ seed: 0, contentVersion: 2, mode: 'daily', rounds: released });
  let frozen = [];
  for (let n = 1; n <= 5; n++) {
    if (n > 1) {
      // the client cannot flip an unreleased round
      const early = draft.apply(client, { round: n, type: 'flip' });
      assert.equal(early.ok, false);
      assert.equal(early.reason, 'ROUND_NOT_RELEASED');
      const t = roundToken(seed, 2, n, client.actions, 'daily');
      assert.equal(t.ok, true);
      assert.deepEqual(t.round, sheet[n - 1]);
      assert.deepEqual(roundToken(seed, 2, n, client.actions, 'daily'), t, 'idempotent');
      assert.ok(extendsPrefix(frozen, client.actions));
      frozen = client.actions.slice();
      released.push(t.round);
      assert.equal(draft.nextRound(client), true);
    }
    assert.ok(draft.apply(client, { round: n, type: 'flip' }).ok);
    const pool = draft.currentPool(client);
    assert.ok(pickId(client, client.content.roster[pool[0]], SLOTS[n - 1]).ok);
    // the next round is refused until this pick is in the prefix
    if (n < 5) {
      const mid = client.actions.slice(0, -1);
      const noPick = roundToken(seed, 2, n + 1, mid, 'daily');
      assert.equal(noPick.ok, false);
    }
  }
  // the released rounds play out to the same result as the full-sheet replay
  const full = replay(seed, 2, client.actions, 'daily');
  assert.equal(full.ok, true);
  assert.deepEqual(full.lineup, draft.lineupOf(client));

  // rejections
  assert.equal(roundToken(seed, 2, 0, [], 'daily').reason, 'BAD_ROUND');
  assert.equal(roundToken(seed, 2, 6, client.actions, 'daily').reason, 'BAD_ROUND');
  assert.equal(roundToken(seed, 2, 2, [], 'daily').reason, 'WRONG_PICK_COUNT');
  assert.equal(roundToken(seed, 2, 3, client.actions.slice(0, 3), 'daily').reason, 'WRONG_PICK_COUNT');
  assert.equal(roundToken(seed, 2, 3, client.actions.slice(0, 4), 'daily').ok, true);
  assert.equal(roundToken(seed, 2, 1, [{ round: 1, type: 'flip' }], 'daily').reason, 'NOT_AT_ROUND_END');
  assert.equal(roundToken(seed, 2, 2, client.actions.slice(0, 1), 'daily').reason, 'WRONG_PICK_COUNT', 'flipped but not picked');
  const forged = client.actions.slice(0, 2);
  forged[1] = Object.assign({}, forged[1], { generalId: 'g_nope' });
  assert.equal(roundToken(seed, 2, 2, forged, 'daily').ok, false);
  assert.equal(roundToken(seed, 9, 1, [], 'daily').reason, 'UNKNOWN_CONTENT_VERSION');
  assert.equal(roundToken(seed, 2, 2, client.actions.slice(0, 2).concat([{ round: 1, type: 'undo' }]), 'daily').ok, false);
  // extendsPrefix
  assert.equal(extendsPrefix(client.actions.slice(0, 2), client.actions), true);
  const changed = client.actions.slice();
  changed[1] = Object.assign({}, changed[1], { slot: 'shoujiang' });
  assert.equal(extendsPrefix(client.actions.slice(0, 2), changed), false);
  assert.equal(extendsPrefix(client.actions, client.actions.slice(0, 2)), false);
});

test('replayPrefix validates partial runs and agrees with replay on complete ones', () => {
  const seed = rng.hash32('prefix');
  const r = playRun('greedy', seed, 2, 'daily', rng.sub(seed, 'p'));
  for (let k = 0; k <= r.run.actions.length; k++) {
    const p = replayPrefix(seed, 2, r.run.actions.slice(0, k), 'daily');
    assert.equal(p.ok, true);
    assert.equal(p.complete, p.picks === 5);
  }
  assert.equal(replayPrefix(seed, 2, r.run.actions, 'daily').complete, true);
  const bad = r.run.actions.slice(0, 3);
  bad[2] = { round: 1, type: 'pick', generalId: 'g_nobody', slot: 'zhugong' };
  assert.equal(replayPrefix(seed, 2, bad, 'daily').ok, false);
});

test('识人 variant: Sundays (Beijing date) only, by config weekday, TZ independent over 3 years (AC 77)', () => {
  let sundays = 0;
  let key = '20261101';
  for (let i = 0; i < 365 * 3; i++) {
    const ms = date.dateKeyToMs(key);
    const dow = new Date(ms + 12 * 3600e3 + 8 * 3600e3).getUTCDay(); // noon Beijing, via an independent route
    const v = date.variantOf(key, cfg.shiren.weekday);
    assert.equal(v, dow === 0 ? 'shiren' : 'standard', key);
    if (v === 'shiren') sundays++;
    key = date.addDays(key, 1);
  }
  assert.equal(sundays, 157); // 1095 days from a Sunday: days 0, 7, ... 1092
  assert.equal(date.weekdayOf('20261101'), 0, '2026-11-01 is a Sunday');
  assert.equal(date.variantOf('20261101'), 'shiren');
  assert.equal(date.variantOf('20261102', 1), 'shiren', 'changing the weekday changes the day, no code change');
  assert.equal(date.variantOf('20261101', 1), 'standard');
  // same answer with TZ=UTC and TZ unset (child processes)
  const prog = "const d=require('./core/date');let k='20261101',s=[];for(let i=0;i<30;i++){s.push(d.variantOf(k,0)[0]);k=d.addDays(k,1)}console.log(s.join(''))";
  const root = path.join(__dirname, '..');
  const a = spawnSync(process.execPath, ['-e', prog], { cwd: root, env: Object.assign({}, process.env, { TZ: 'UTC' }) });
  const envNoTz = Object.assign({}, process.env);
  delete envNoTz.TZ;
  const b = spawnSync(process.execPath, ['-e', prog], { cwd: root, env: envNoTz });
  const c = spawnSync(process.execPath, ['-e', prog], { cwd: root, env: Object.assign({}, process.env, { TZ: 'America/Los_Angeles' }) });
  assert.equal(a.stdout.toString(), b.stdout.toString());
  assert.equal(a.stdout.toString(), c.stdout.toString());
});

test('识人 never changes the sim: record and battle log depend on (seed, actions) only (AC 78)', () => {
  const seed = rng.hash32('shiren');
  const r = playRun('greedy', seed, 2, 'daily', rng.sub(seed, 'p'));
  const a = replay(seed, 2, r.run.actions, 'daily');
  const s1 = simulate(a.lineup, seed, 2, 2);
  const s2 = simulate(a.lineup, seed, 2, 2);
  assert.deepEqual(s1, s2);
  // simulate has no variant input at all
  assert.equal(simulate.length <= 5, true);
});

test('determinism over 1000 replays, mode does not matter, record sums to 12 (AC 11, 12, 18)', () => {
  for (let i = 0; i < 1000; i++) {
    const seed = rng.hash32('det2:' + i);
    const r = playRun('sensible', seed, 2, 'free', rng.sub(seed, 'p'));
    const a = replay(seed, 2, r.run.actions, 'free');
    const b = replay(seed, 2, r.run.actions, 'free');
    assert.ok(a.ok);
    assert.deepEqual(a, b);
    assert.deepEqual(a.lineup, r.lineup);
    const s = simulate(a.lineup, seed, 2);
    assert.equal(s.record.w + s.record.l, 12);
    assert.deepEqual(s.record, r.record);
    if (i < 100) {
      const as = r.run.actions.filter((x) => x.source !== 'ad');
      const d = replay(seed, 2, as, 'daily');
      assert.deepEqual(d.lineup, a.lineup);
    }
  }
});

test('a stronger lineup never does worse on the same seed (events off), v2 content (AC 13)', () => {
  for (let i = 0; i < 120; i++) {
    const seed = rng.hash32('mono2:' + i);
    const scn = makeScenario(seed, 2, 2);
    const r = playRun('greedy', seed, 2, 'free', rng.sub(seed, 'p'), scn);
    const base = simulateScenario(scn, r.lineup, { events: false }).record.w;
    for (const e of r.lineup) {
      const g = content.byId[e.generalId];
      // raise one stat of one drafted general in a copy of the content
      const gens = content.generals.map((x) => (x.id === g.id ? Object.assign({}, x, { stats: Object.assign({}, x.stats, { yong: Math.min(10, x.stats.yong + 2), zhi: Math.min(10, x.stats.zhi + 2) }) }) : x));
      const raised = Object.assign({}, content, {
        generals: gens,
        roleScores: gens.map((x) => SLOTS.map((s) => C.STAT_KEYS.reduce((sum, k) => sum + content.roleByKey[s].weights[k] * x.stats[k], 0))),
      });
      const scn2 = Object.assign({}, scn, { content: raised });
      assert.ok(simulateScenario(scn2, r.lineup, { events: false }).record.w >= base);
    }
  }
});

/** Independent brute force over the capped pools (no use of search.js). */
function bruteBest(seed, tokens, sheet) {
  const scn = makeScenario(seed, 2, 2);
  const cap = 8;
  const perms = [];
  (function p(a, rest) {
    if (!rest.length) return perms.push(a);
    rest.forEach((x, i) => p(a.concat([x]), rest.slice(0, i).concat(rest.slice(i + 1))));
  })([], [0, 1, 2, 3, 4]);
  const seen = new Set();
  let best = null;
  (function rec(r, picked) {
    if (r === 5) {
      const key = picked.map((g, k) => g + ':' + tokens[k].faction).sort().join(',');
      if (seen.has(key)) return;
      seen.add(key);
      for (const perm of perms) {
        const lineup = perm.map((pi, k) => ({ slot: SLOTS[k], generalId: content.roster[picked[pi]], faction: tokens[pi].faction }));
        const s = simulateScenario(scn, lineup);
        let metric = 0;
        for (const b of s.battles) metric += 1 / (1 + Math.exp(-(b.P - b.D) / cfg.tau));
        if (!best || s.record.w > best.w || (s.record.w === best.w && metric > best.metric + 1e-12)) best = { w: s.record.w, metric };
      }
      return;
    }
    const key = C.cellKey(tokens[r].faction, tokens[r].era);
    const order = sheet[r].pools && sheet[r].pools[key] ? sheet[r].pools[key] : content.cells[key];
    let n = 0;
    for (const g of order) {
      if (picked.includes(g)) continue;
      if (n++ >= cap) break;
      rec(r + 1, picked.concat([g]));
    }
  })(0, []);
  return best;
}

test('复盘 equals an independent brute force under the pool cap, drafted-person removal and drafted-cell cohesion (AC 16)', () => {
  const small = [
    [['shu', 'huangjin'], ['wei', 'huangjin'], ['qun', 'sanfen'], ['qun', 'guijin'], ['wu', 'huangjin']],
    [['qun', 'sanfen'], ['qun', 'guijin'], ['shu', 'huangjin'], ['qun', 'sanfen'], ['wei', 'huangjin']],
    [['qun', 'qunxiong'], ['qun', 'sanfen'], ['shu', 'huangjin'], ['wei', 'huangjin'], ['qun', 'guijin']],
  ];
  small.forEach((cells, i) => {
    const seed = rng.hash32('bf2:' + i);
    const sheet = buildSheet(seed, 2);
    const tokens = cells.map((c) => ({ faction: c[0], era: c[1] }));
    const res = bestLineup(seed, 2, tokens, { rounds: sheet });
    const brute = bruteBest(seed, tokens, sheet);
    assert.equal(res.record.w, brute.w, 'optimal wins match the brute force ' + i);
    const s = simulate(res.lineup, seed, 2);
    let metric = 0;
    for (const b of s.battles) metric += 1 / (1 + Math.exp(-(b.P - b.D) / cfg.tau));
    assert.ok(Math.abs(metric - brute.metric) < 1e-9, `tie-break ${metric} vs ${brute.metric}`);
    // drawable: replaying the lineup as actions on the same tokens is legal
    const run = draft.createRun({ seed, contentVersion: 2, mode: 'free', rounds: sheet.map((r, k) => Object.assign({}, r, { faction: tokens[k].faction, era: tokens[k].era, altFaction: [], altEra: [] })) });
    const ids = res.lineup.map((e) => e.generalId);
    assert.equal(new Set(ids).size, 5);
    const order = [0, 1, 2, 3, 4];
    // find a round order in which each general is in that round's capped pool
    let legal = false;
    (function perm(a, rest) {
      if (legal) return;
      if (!rest.length) {
        const rr = draft.createRun({ seed, contentVersion: 2, mode: 'free', rounds: run.rounds });
        for (let r = 0; r < 5; r++) {
          if (r > 0) draft.nextRound(rr);
          draft.apply(rr, { round: r + 1, type: 'flip' });
          const k = a[r];
          if (!draft.apply(rr, { round: r + 1, type: 'pick', generalId: res.lineup[k].generalId, slot: res.lineup[k].slot }).ok) return;
        }
        legal = true;
        return;
      }
      rest.forEach((x, j) => perm(a.concat([x]), rest.slice(0, j).concat(rest.slice(j + 1))));
    })([], order);
    assert.ok(legal, 'the 复盘 lineup is drawable from the final tokens');
  });
});

test('复盘: deterministic, >= the player, stopAt12 agrees, uses seed pools when no sheet is passed', () => {
  for (let i = 0; i < 25; i++) {
    const seed = rng.hash32('opt2:' + i);
    const sheet = buildSheet(seed, 2);
    const p = playRun('sensible', seed, 2, 'free', rng.sub(seed, 'p'), null, { rounds: sheet });
    const a = bestLineup(seed, 2, p.run.finalTokens, { rounds: sheet });
    const b = bestLineup(seed, 2, p.run.finalTokens);
    assert.deepEqual(a, b);
    assert.ok(a.record.w >= p.record.w, 'best >= own record');
    const quick = bestLineup(seed, 2, p.run.finalTokens, { stopAt12: true });
    assert.equal(quick.record.l === 0, a.record.l === 0);
    // the lineup is a legal replay of itself as picks in some order, and carries drafted factions
    for (const e of a.lineup) assert.ok(content.factions.some((f) => f.key === e.faction));
  }
});

test('v1 regression: sheets, runs, pools and 复盘 for contentVersion 1 are exactly as in the Phase 1 build (AC 72, 7)', () => {
  // pinned from the Phase 1 core (commit 90a1530)
  const golden = [
    { seed: 4146500729, w: 9, ids: ['g_zhanglu', 'g_zhouyu', 'g_sunjian', 'g_guanyu', 'g_huangfusong'] },
    { seed: 1865759728, w: 5, ids: ['g_zhanglu', 'g_hansui', 'g_sunce', 'g_zhaoyun', 'g_zhouyu'] },
    { seed: 1928092725, w: 7, ids: ['g_caocao', 'g_luxun', 'g_zhouyu', 'g_xiahoudun', 'g_zhangliao'] },
    { seed: 3341852583, w: 7, ids: ['g_zhanglu', 'g_luxun', 'g_zhangliao', 'g_guanyu', 'g_huangfusong'] },
    { seed: 2124306863, w: 5, ids: ['g_caocao', 'g_zhouyu', 'g_huanggai', 'g_sunjian', 'g_zhaoyun'] },
    { seed: 2111745359, w: 8, ids: ['g_liubei', 'g_caocao', 'g_zhangliao', 'g_guanyu', 'g_huangfusong'] },
  ];
  for (const g of golden) {
    const i = golden.indexOf(g);
    const seed = rng.hash32('cmp' + i);
    assert.equal(seed, g.seed);
    const r = playRun('sensible', seed, 1, 'free', rng.sub(seed, 'xsensible'));
    assert.equal(r.record.w, g.w);
    assert.deepEqual(r.lineup.map((e) => e.generalId), g.ids);
  }
  // v1 sheets carry no pools; the v1 pool is the Phase 1 pool (every undrafted member, cell order)
  for (let i = 0; i < 1000; i++) {
    const seed = rng.hash32('p1:' + i);
    const sheet = buildSheet(seed, 1);
    assert.ok(sheet.every((r) => r.pools === undefined));
    const run = draft.createRun({ seed, contentVersion: 1, mode: 'free' });
    const c1 = C.getContent(1);
    for (let r = 1; r <= 5; r++) {
      if (r > 1) draft.nextRound(run);
      draft.apply(run, { round: r, type: 'flip' });
      const expect = c1.cells[C.cellKey(run.token.faction, run.token.era)].filter((gi) => !run.drafted[c1.roster[gi]]);
      assert.deepEqual(draft.currentPool(run), expect);
      draft.apply(run, { round: r, type: 'pick', generalId: c1.roster[expect[i % expect.length]], slot: SLOTS[r - 1] });
    }
  }
});

test('gate and daily acceptance work for contentVersion 2 and are reproducible', () => {
  const { gateCheck } = require('../core/gates');
  for (let i = 0; i < 6; i++) {
    const seed = rng.hash32('g2:' + i);
    const a = gateCheck(seed, 2, 2);
    const b = gateCheck(seed, 2);
    assert.deepEqual(a, b, 'default config for content 2 is config 2');
    assert.equal(a.relaxed, false);
    assert.equal(a.K, 400);
    assert.equal(a.pass.optimal, a.optimal.l === 0);
  }
});
