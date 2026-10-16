'use strict';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, bestActions, CV } = require('./helpers/harness');
const { runId, startDaily, playDaily, releaseAll, sheetOf } = require('./helpers/fixtures');

const T0 = Date.UTC(2026, 10, 3, 4, 0, 0); // 2026-11-03 12:00 BJT
let h;
beforeEach(() => { h = createHarness({ now: T0 }); });
afterEach(() => h.teardown());

const submitDaily = (openid, dateKey, actions, extra = {}) =>
  h.call('submitRun', { mode: 'daily', clientRunId: runId(), dateKey, actions, ...extra }, { openid });

const FACTIONS = ['wei', 'shu', 'wu', 'qun'];
const clone = (o) => JSON.parse(JSON.stringify(o));
const nothingPersisted = () => {
  assert.equal(h.db.all('runs').length, 0, 'no run stored');
  assert.equal(h.db.all('daily_results').length, 0, 'no ranked result stored');
  assert.equal((h.db.all('daily_stats')[0] || { total: 0 }).total, 0, 'no stats increment');
};

test('ranked daily: server record authoritative, daily_results + stats written, nothing secret returned', async () => {
  const r = await playDaily(h, 'userA');
  assert.equal(r.ok, true);
  assert.equal(r.ranked, true);
  assert.equal(r.record.w + r.record.l, 12);
  assert.equal(r.battles.length, 12);
  assert.doesNotMatch(JSON.stringify(r), /"seed"|"best":\{|"lineup"|userA/); // streak.best is a number, not the optimum
  assert.deepEqual(r.streak, { current: 1, best: 1 });
  const res = h.db.all('daily_results');
  assert.equal(res.length, 1);
  assert.equal(res[0]._id, '20261103_userA');
  assert.deepEqual([res[0].w, res[0].l], [r.record.w, r.record.l]);
  assert.equal(res[0].lineupIdx.length, 5);
  const st = h.db.all('daily_stats')[0];
  assert.equal(st.total, 1);
  assert.equal(st.hist[r.record.w], 1);
  assert.equal(st.hist.reduce((a, b) => a + b, 0), 1);
  assert.equal(r.rarity, null, 'rarity hidden below 30 runs');
});

test('rarity appears once >= 30 ranked runs exist', async () => {
  for (let i = 0; i < 30; i++) {
    const r = await playDaily(h, `u${i}`);
    assert.equal(r.ok, true);
  }
  const last = await playDaily(h, 'u30');
  assert.ok(last.rarity && last.rarity.total === 31 && last.rarity.pct > 0);
});

test('identity comes from the context: a forged openid in the input is ignored', async () => {
  const s = await startDaily(h, 'userA');
  const r = await h.call('submitRun', {
    mode: 'daily', clientRunId: runId(), dateKey: s.dateKey, actions: s.actions, openid: 'userB', OPENID: 'userB',
  }, { openid: 'userA' });
  assert.equal(r.ok, true);
  assert.equal(h.db.all('runs')[0].openid, 'userA');
  assert.ok(h.db.all('runs')[0]._id.startsWith('userA_'));
  assert.equal(h.db.all('daily_results')[0]._id, '20261103_userA');
  const noCtx = await h.call('submitRun', { mode: 'free', clientRunId: runId(), seed: 5, actions: [], openid: 'userB' }, {});
  assert.equal(noCtx.code, 'UNAUTHENTICATED');
});

// ---------- validation rejections (AC 26) ----------
test('rejects with INVALID_ACTIONS and persists nothing', async () => {
  const s = await startDaily(h, 'userA');
  const base = s.actions;
  const otherFaction = FACTIONS.find((f) => f !== s.rounds[0].faction);
  const cases = {
    'pick outside the round pool': (a) => { a.find((x) => x.type === 'pick').generalId = `g_${otherFaction}7`; },
    'duplicate slot': (a) => { a.filter((x) => x.type === 'pick')[1].slot = 'zhugong'; },
    'ad re-spin in daily': (a) => { a.splice(1, 0, { round: 1, type: 'respinFaction', source: 'ad' }); },
    're-spin after pick': (a) => { a.splice(2, 0, { round: 1, type: 'respinEra' }); },
    'fewer than 5 picks': (a) => { a.pop(); },
    'second pick in one round': (a) => { a.splice(3, 0, { ...a[1], generalId: 'g_wei0', slot: 'junshi' }); },
    're-spin before flip': (a) => { a.unshift({ round: 1, type: 'respinEra' }); },
    'free re-spin used twice': (a) => { a.splice(1, 0, { round: 1, type: 'respinEra' }, { round: 1, type: 'respinEra' }); },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const a = clone(base);
    mutate(a);
    const r = await submitDaily('userA', s.dateKey, a);
    assert.equal(r.ok, false, name);
    assert.equal(r.code, 'INVALID_ACTIONS', name);
  }
  nothingPersisted();
  // the attempt was not burnt by rejected submissions
  assert.equal((await submitDaily('userA', s.dateKey, base)).ok, true);
});

test('rejects duplicate general (same cell drafted twice)', async () => {
  // find a free seed whose rounds 1 and 2 share the same faction-era cell
  const core = require(require('path').join(h.root, 'getDaily', 'core', 'sheet.js'));
  let seed = 1;
  for (; seed < 5000; seed++) {
    const r = core.buildSheet(seed, CV);
    if (r[0].faction === r[1].faction && r[0].era === r[1].era) break;
  }
  const rounds = core.buildSheet(seed, CV);
  const a = bestActions(rounds); // best-power picks are distinct by construction
  const g1 = a.find((x) => x.type === 'pick' && x.round === 1).generalId;
  a.find((x) => x.type === 'pick' && x.round === 2).generalId = g1;
  const r = await h.call('submitRun', { mode: 'free', clientRunId: runId(), seed, actions: a }, { openid: 'userA' });
  assert.equal(r.code, 'INVALID_ACTIONS');
});

test('rejects malformed input shapes', async () => {
  const s = await startDaily(h, 'userA');
  const good = s.actions;
  const bad = [
    { clientRunId: 'x', actions: good }, // too short
    { clientRunId: runId(), actions: 'nope' },
    { clientRunId: runId(), actions: [] },
    { clientRunId: runId(), actions: new Array(101).fill({ round: 1, type: 'flip' }) },
    { clientRunId: runId(), actions: [{ round: 9, type: 'flip' }] },
    { clientRunId: runId(), actions: [{ round: 1, type: 'teleport' }] },
    { clientRunId: runId(), actions: [{ round: 1, type: 'pick', generalId: '../x', slot: 'zhugong' }] },
    { clientRunId: runId(), actions: [{ round: 1, type: 'pick', generalId: 'g_wei1', slot: 'king' }] },
    { clientRunId: runId(), actions: [{ round: 1, type: 'flip', source: 'paid' }] },
    { clientRunId: runId(), actions: good, clientRecord: { w: 12, l: 5 } },
    { clientRunId: runId(), actions: good, dateKey: '2026-11-03' },
    { clientRunId: runId(), actions: good, mode: 'hacker' },
  ];
  for (const b of bad) {
    const r = await h.call('submitRun', { mode: 'daily', dateKey: s.dateKey, ...b }, { openid: 'userA' });
    assert.equal(r.code, 'INVALID_ACTIONS', JSON.stringify(b).slice(0, 80));
  }
  nothingPersisted();
});

test('free mode: unknown contentVersion rejected, bad seed rejected, ad re-spins allowed (<= 2), unranked', async () => {
  const seed = 4242;
  const rounds = require(require('path').join(h.root, 'getDaily', 'core', 'sheet.js')).buildSheet(seed, CV);
  const a = bestActions(rounds, { mode: 'free' });
  const ok = await h.call('submitRun', { mode: 'free', clientRunId: runId(), seed, actions: a }, { openid: 'u' });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.ranked, false);
  assert.equal(h.db.all('daily_results').length, 0);
  const cv = await h.call('submitRun', { mode: 'free', clientRunId: runId(), seed, contentVersion: 7, actions: a }, { openid: 'u' });
  assert.equal(cv.code, 'INVALID_ACTIONS');
  const bs = await h.call('submitRun', { mode: 'free', clientRunId: runId(), seed: -1, actions: a }, { openid: 'u' });
  assert.equal(bs.code, 'INVALID_ACTIONS');
  // free re-spin then ad re-spin of the faction, free then ad of the era: two ad re-spins are allowed in free play
  const twoAd = bestActions(rounds, {
    mode: 'free',
    prelude: [
      { type: 'respinFaction' }, { type: 'respinFaction', source: 'ad' },
      { type: 'respinEra' }, { type: 'respinEra', source: 'ad' },
    ],
  });
  const r2 = await h.call('submitRun', { mode: 'free', clientRunId: runId(), seed, actions: twoAd }, { openid: 'u' });
  assert.equal(r2.ok, true, JSON.stringify(r2));
  // a third ad re-spin is rejected by the shared engine
  const three = clone(twoAd);
  const at = three.findIndex((x) => x.type === 'pick');
  three.splice(at, 0, { round: 1, type: 'respinEra', source: 'ad' });
  assert.equal((await h.call('submitRun', { mode: 'free', clientRunId: runId(), seed, actions: three }, { openid: 'u' })).code, 'INVALID_ACTIONS');
});

// ---------- mismatch ----------
test('tampered clientRecord sets mismatch=true, has no effect on the stored/returned record (AC 27)', async () => {
  const honest = await playDaily(h, 'userH', { extra: {} });
  const real = honest.record;
  const wrong = { w: real.w === 12 ? 0 : 12, l: real.w === 12 ? 12 : 0 };
  const r = await playDaily(h, 'userT', { extra: { clientRecord: wrong } });
  assert.deepEqual(r.record, real, 'same actions -> same server record');
  const run = h.db.all('runs').find((x) => x.openid === 'userT');
  assert.equal(run.mismatch, true);
  assert.deepEqual(run.serverRecord, real);
  assert.deepEqual(run.clientRecord, wrong);
  assert.equal(h.db.all('daily_results').find((x) => x.openid === 'userT').w, real.w);
  assert.ok(h.db.all('events').some((e) => e.name === 'error' && e.props.code === 'MISMATCH'));
  const honestRun = h.db.all('runs').find((x) => x.openid === 'userH');
  assert.equal(honestRun.mismatch, false);
  await playDaily(h, 'userM', { extra: { clientRecord: real } });
  assert.equal(h.db.all('runs').find((x) => x.openid === 'userM').mismatch, false);
});

// ---------- idempotency ----------
test('same clientRunId returns the stored result and never double counts (AC 22)', async () => {
  const s = await startDaily(h, 'userA');
  const id = runId();
  const first = await h.call('submitRun', { mode: 'daily', clientRunId: id, dateKey: s.dateKey, actions: s.actions }, { openid: 'userA' });
  const again = await h.call('submitRun', { mode: 'daily', clientRunId: id, dateKey: s.dateKey, actions: s.actions }, { openid: 'userA' });
  assert.deepEqual(again, first);
  assert.equal(h.db.all('daily_stats')[0].total, 1);
  assert.equal(h.db.all('runs').length, 1);
  assert.equal(h.db.all('daily_results').length, 1);
});

test('concurrent duplicate submits (double tap) count once', async () => {
  const s = await startDaily(h, 'userA');
  const id = runId();
  const call = () => h.call('submitRun', { mode: 'daily', clientRunId: id, dateKey: s.dateKey, actions: s.actions }, { openid: 'userA' });
  const [a, b, c] = await Promise.all([call(), call(), call()]);
  for (const r of [a, b, c]) assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(h.db.all('daily_stats')[0].total, 1);
  assert.equal(h.db.all('daily_results').length, 1);
  assert.equal(h.db.all('runs').length, 1);
});

test('stored result survives a retry with different actions (the stored server result wins)', async () => {
  const s = await startDaily(h, 'userA');
  const id = runId();
  const first = await h.call('submitRun', { mode: 'daily', clientRunId: id, dateKey: s.dateKey, actions: s.actions }, { openid: 'userA' });
  const tampered = clone(s.actions);
  tampered.pop();
  const again = await h.call('submitRun', { mode: 'daily', clientRunId: id, dateKey: s.dateKey, actions: tampered }, { openid: 'userA' });
  assert.deepEqual(again, first);
});

// ---------- ALREADY_PLAYED ----------
test('second distinct ranked run -> ALREADY_PLAYED with the original result (AC 22)', async () => {
  const first = await playDaily(h, 'userA');
  const s = { dateKey: '20261103' };
  const rounds = sheetOf(h, '20261103');
  const second = await h.call('submitRun', { mode: 'daily', clientRunId: runId(), dateKey: s.dateKey, actions: bestActions(rounds) }, { openid: 'userA' });
  assert.equal(second.ok, false);
  assert.equal(second.code, 'ALREADY_PLAYED');
  assert.deepEqual(second.result.record, first.record);
  assert.equal(h.db.all('daily_stats')[0].total, 1);
  assert.equal(h.db.all('daily_results').length, 1);
  assert.equal(h.db.all('runs').length, 1);
  const st = await h.call('getDaily', {}, { openid: 'userA' });
  assert.equal(st.myStatus, 'done');
  assert.deepEqual(st.myRecord, first.record);
});

test('two concurrent distinct runs: exactly one ranked, the other ALREADY_PLAYED', async () => {
  const s = await startDaily(h, 'userA');
  const call = () => h.call('submitRun', { mode: 'daily', clientRunId: runId(), dateKey: s.dateKey, actions: s.actions }, { openid: 'userA' });
  const rs = await Promise.all([call(), call()]);
  assert.equal(rs.filter((r) => r.ok).length, 1);
  assert.equal(rs.filter((r) => r.code === 'ALREADY_PLAYED').length, 1);
  assert.equal(h.db.all('daily_stats')[0].total, 1);
});

test('submit without startRun -> NOT_STARTED; unknown date -> SEED_NOT_FOUND; future date rejected', async () => {
  const d = await h.call('getDaily', {}, { openid: 'userA' });
  const a = bestActions(sheetOf(h, d.dateKey));
  assert.equal((await submitDaily('userA', d.dateKey, a)).code, 'NOT_STARTED');
  assert.equal((await submitDaily('userA', '20260101', a)).code, 'SEED_NOT_FOUND');
  h.db.put('daily_seeds', { ...h.db.all('daily_seeds')[0], _id: '20261105' });
  assert.equal((await submitDaily('userA', '20261105', a)).code, 'INVALID_ACTIONS');
  nothingPersisted();
});

// ---------- midnight grace (AC 23) ----------
test('started 23:59 BJT on D, submitted 00:10 on D+1 -> ranked for D; 00:31 -> LATE_SUBMIT', async () => {
  h.setNow(Date.UTC(2026, 10, 3, 15, 59, 0)); // 23:59 BJT on the 3rd
  const s = await startDaily(h, 'userA');
  const s2 = await startDaily(h, 'userB');
  h.setNow(Date.UTC(2026, 10, 3, 16, 10, 0)); // 00:10 BJT on the 4th
  const ok = await submitDaily('userA', '20261103', s.actions);
  assert.equal(ok.ok, true);
  assert.equal(ok.ranked, true);
  assert.equal(h.db.all('daily_results')[0]._id, '20261103_userA');
  h.setNow(Date.UTC(2026, 10, 3, 16, 29, 59));
  const edge = await h.call('submitRun', { mode: 'daily', clientRunId: runId(), dateKey: '20261103', actions: s2.actions }, { openid: 'userB' });
  assert.equal(edge.ok, true, '00:29:59 is inside the grace window');
  const s3 = await (async () => { h.setNow(Date.UTC(2026, 10, 3, 15, 59, 30)); return startDaily(h, 'userC'); })();
  h.setNow(Date.UTC(2026, 10, 3, 16, 31, 0)); // 00:31
  const late = await submitDaily('userC', '20261103', s3.actions);
  assert.equal(late.ok, false);
  assert.equal(late.code, 'LATE_SUBMIT');
  assert.equal(h.db.all('daily_results').filter((r) => r.openid === 'userC').length, 0);
});

test('startRun: daily only for today; resumed flag; free needs no start', async () => {
  await h.call('getDaily', {}, { openid: 'u' });
  const a = await h.call('startRun', { mode: 'daily', clientRunId: runId() }, { openid: 'u' });
  assert.deepEqual([a.ok, a.resumed], [true, false]);
  const b = await h.call('startRun', { mode: 'daily', clientRunId: runId() }, { openid: 'u' });
  assert.deepEqual([b.ok, b.resumed], [true, true]);
  assert.equal(h.db.all('daily_starts').length, 1);
  assert.equal(h.db.all('daily_starts')[0]._id, '20261103_u');
  assert.equal((await h.call('startRun', { mode: 'daily', clientRunId: runId(), dateKey: '20261102' }, { openid: 'u' })).code, 'INVALID_ACTIONS');
  assert.deepEqual(await h.call('startRun', { mode: 'free', clientRunId: runId() }, { openid: 'u' }), { ok: true, resumed: false });
  assert.equal((await h.call('startRun', { mode: 'daily', clientRunId: 'x' }, { openid: 'u' })).code, 'INVALID_ACTIONS');
  assert.equal((await h.call('startRun', { mode: 'daily', clientRunId: runId() }, {})).code, 'UNAUTHENTICATED');
  const st = await h.call('getDaily', {}, { openid: 'u' });
  assert.equal(st.myStatus, 'started');
});

test('submitRun is rate limited per openid', async () => {
  h.limits = true;
  const seed = 99;
  const rounds = require(require('path').join(h.root, 'getDaily', 'core', 'sheet.js')).buildSheet(seed, CV);
  const a = bestActions(rounds);
  let limited = 0;
  for (let i = 0; i < 35; i++) {
    const r = await h.call('submitRun', { mode: 'free', clientRunId: runId(), seed, actions: a }, { openid: 'spammer' });
    if (r.code === 'RATE_LIMITED') limited++;
  }
  assert.equal(limited, 15, '20 submits a minute');
  assert.equal((await h.call('submitRun', { mode: 'free', clientRunId: runId(), seed, actions: a }, { openid: 'other' })).ok, true);
});

// ---------- getReplay ----------
test('getReplay: only the owner of a completed run gets the best lineup (and it is >= the run)', async () => {
  const r = await playDaily(h, 'userA');
  const run = h.db.all('runs')[0];
  const rep = await h.call('getReplay', { runId: run.clientRunId }, { openid: 'userA' });
  assert.equal(rep.ok, true);
  assert.equal(rep.best.record.w >= r.record.w, true);
  assert.equal(rep.best.lineup.length, 5);
  assert.deepEqual(h.db.all('runs')[0].best, rep.best, 'cached on the run');
  const other = await h.call('getReplay', { runId: run.clientRunId }, { openid: 'userB' });
  assert.equal(other.code, 'RUN_NOT_FOUND');
  const none = await h.call('getReplay', { runId: 'doesnotexist1' }, { openid: 'userA' });
  assert.equal(none.code, 'RUN_NOT_FOUND');
  assert.equal((await h.call('getReplay', { runId: '../x' }, { openid: 'userA' })).code, 'INVALID_ACTIONS');
});

test('getReplay uses final tokens after a free re-spin (复盘 lineup is drawable from them)', async () => {
  const s = await startDaily(h, 'userA', { release: false });
  const a = bestActions(s.rounds, { respinFirst: true });
  await releaseAll(h, 'userA', s.dateKey, a);
  const sub = await h.call('submitRun', { mode: 'daily', clientRunId: runId(), dateKey: s.dateKey, actions: a }, { openid: 'userA' });
  assert.equal(sub.ok, true, JSON.stringify(sub));
  const run = h.db.all('runs')[0];
  const r0 = s.rounds[0];
  assert.equal(run.finalTokens.length, 5);
  assert.equal(run.finalTokens[0].faction, r0.altFaction[0], 'the re-spin changed round 1');
  assert.equal(run.finalTokens[0].era, r0.era);
  const rep = await h.call('getReplay', { runId: run.clientRunId }, { openid: 'userA' });
  assert.equal(rep.ok, true, JSON.stringify(rep));
  assert.ok(rep.best.record.w >= sub.record.w, 'best is at least as good as the run');
  const gens = require(require('path').join(h.root, 'getDaily', 'core', 'content.js')).getContent(CV).byId;
  for (const l of rep.best.lineup) {
    const g = gens[l.generalId];
    // content 2: a general may appear in several factions; the lineup entry names the cell it was drafted from
    const apps = g.appearances || [{ faction: g.faction, eras: g.eras }];
    const fac = l.faction || g.faction;
    assert.ok(run.finalTokens.some((t) => fac === t.faction && apps.some((a) => a.faction === t.faction && a.eras.includes(t.era))), l.generalId + ' not drawable from the final tokens');
  }
});
