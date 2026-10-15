'use strict';
// getHome / daily prompts, joinGroup, track, rewards, album, rules, strokes upload limits through the API.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./helpers/harness');
const F = require('./helpers/flow');

let h;
const [A, B, C] = F.PEOPLE;
beforeEach(() => { h = createHarness(); });
afterEach(() => h.teardown());

// ------------------------------------------------------------------ getHome and the daily hook

test('two users on the same Beijing date get the same 3 prompts; none repeats within the bank cycle (AC 88)', async () => {
  const a = await h.call('getHome', {}, { openid: A });
  const b = await h.call('getHome', {}, { openid: B });
  assert.equal(a.ok, true);
  assert.deepEqual(a.daily.prompts.map((p) => p.id), b.daily.prompts.map((p) => p.id));
  assert.equal(a.daily.prompts.length, 3);
  assert.equal(a.dateKey, '20261103');
  const seen = new Set();
  for (let d = 0; d < 20; d++) {
    h.setNow(Date.UTC(2026, 10, 3 + d, 4, 0, 0));
    const r = await h.call('getHome', {}, { openid: A });
    for (const p of r.daily.prompts) { assert.ok(!seen.has(p.id), `repeat ${p.id} on day ${d}`); seen.add(p.id); }
  }
  assert.equal(seen.size, 60, 'all 60 non-retired prompts used once in 20 days');
  assert.ok(!seen.has('Z01'), 'retired prompts are never daily');
  // same on the next call (deterministic) and independent of the user
  h.setNow(Date.UTC(2026, 10, 3, 4, 0, 0));
  assert.deepEqual((await h.call('getHome', {}, { openid: C })).daily.prompts.map((p) => p.id), a.daily.prompts.map((p) => p.id));
});

test('the national count shows only at >= 30 and is aggregate (AC 89)', async () => {
  const first = await h.call('getHome', {}, { openid: A });
  const pid = first.daily.prompts[0].id;
  assert.equal(first.daily.prompts[0].count, null);
  h.db.put('daily_stats', { _id: '20261103', started: 40, revealed: 1, byPrompt: { [pid]: 29 } });
  assert.equal((await h.call('getHome', {}, { openid: A })).daily.prompts[0].count, null);
  h.db.put('daily_stats', { _id: '20261103', started: 40, revealed: 1, byPrompt: { [pid]: 30 } });
  assert.equal((await h.call('getHome', {}, { openid: A })).daily.prompts[0].count, 30);
});

test('daily_stats counts a start when 第 1 棒 passes, by preset prompt only', async () => {
  const gref = await F.player(h, A);
  const c = await F.create(h, A, { groupRef: gref, promptId: 'A09' });
  await F.submit(h, A, c.chainId, c.claim.claimId, { strokes: F.strokes() });
  assert.equal(h.db.get('daily_stats', '20261103'), null, 'nothing counted while the drawing is pending');
  await F.sweep(h);
  const st = h.db.get('daily_stats', '20261103');
  assert.equal(st.started, 1);
  assert.equal(st.byPrompt.A09, 1);
  assert.equal(h.db.get('group_stats', F.GROUP_A).started, 1);
  assert.equal(h.db.get('group_stats', F.GROUP_A).drawings, 1);
});

test('getHome: defaults when app_config is missing or unreadable; features, ads clamps, no secrets (edge 31)', async () => {
  const r = await h.call('getHome', {}, { openid: A });
  assert.deepEqual(r.ugc, { createEnabled: true, viewEnabled: true });
  assert.equal(r.features.subscribe, null);
  assert.equal(r.features.updatableCard, false);
  assert.equal(r.features.banner.enabled, false);
  assert.equal(r.timers.drawSec, 60);
  assert.equal(r.timers.describeSec, 45);
  assert.deepEqual([r.me.startsLeft, r.me.adStartsLeft, r.me.paletteToday, r.me.streak], [3, 2, false, 0]);
  // unreadable config
  const real = h.db.collection.bind(h.db);
  h.db.collection = (name) => { if (name === 'app_config') throw new Error('db down'); return real(name); };
  h.advance(11000);
  const r2 = await h.call('getHome', {}, { openid: B });
  assert.equal(r2.ok, true);
  assert.equal(r2.ugc.createEnabled, true);
  h.db.collection = real;
  // configured
  h.db.put('app_config', { _id: 'live', subscribe: { tmplId: 'T1', fields: {} }, features: { updatableCard: true }, ads: { banner: { enabled: true, adUnitId: 'adunit-1' }, interstitial: { enabled: true, minGapSec: 5, maxPerDay: 99 } }, timers: { drawSec: 50 } });
  h.advance(11000);
  const r3 = await h.call('getHome', {}, { openid: A });
  assert.equal(r3.features.subscribe.tmplId, 'T1');
  assert.equal(r3.features.updatableCard, true);
  assert.equal(r3.features.banner.adUnitId, 'adunit-1');
  assert.equal(r3.features.interstitial.minGapSec, 120, 'clamped');
  assert.equal(r3.features.interstitial.maxPerDay, 4, 'clamped');
  assert.equal(r3.timers.drawSec, 50);
  assert.ok(!JSON.stringify(r3).includes('autoPausedUntil'));
});

test('streak: consecutive Beijing days with a passed 棒; grants nothing; broken after a gap (AC 90)', async () => {
  const gref = await F.player(h, A);
  await F.player(h, B);
  for (let d = 0; d < 3; d++) {
    h.setNow(Date.UTC(2026, 10, 3 + d, 4, 0, 0));
    const id = F.seedChain(h, { authors: [B], openGId: F.GROUP_A });
    const cl = await F.claim(h, A, id, gref);
    await F.submit(h, A, id, cl.claimId, { text: `连续的第${d}天` });
    assert.equal((await h.call('getHome', {}, { openid: A })).me.streak, d + 1);
  }
  h.setNow(Date.UTC(2026, 10, 6, 4, 0, 0));
  assert.equal((await h.call('getHome', {}, { openid: A })).me.streak, 3, 'still alive the day after');
  h.setNow(Date.UTC(2026, 10, 7, 4, 0, 0));
  assert.equal((await h.call('getHome', {}, { openid: A })).me.streak, 0, 'broken after a missed day');
});

test('custom and preset prompts: unknown / retired ids and bad combinations are rejected', async () => {
  await F.player(h, A);
  assert.equal((await h.call('createChain', { promptId: 'NOPE1' }, { openid: A })).code, 'BAD_INPUT');
  assert.equal((await h.call('createChain', { promptId: 'Z01' }, { openid: A })).code, 'BAD_INPUT', 'retired');
  assert.equal((await h.call('createChain', {}, { openid: A })).code, 'BAD_INPUT');
  assert.equal((await h.call('createChain', { promptId: 'A01', customText: '同时给两个' }, { openid: A })).code, 'BAD_INPUT');
  assert.equal((await h.call('createChain', { promptId: 'A01', groupRef: 'not-a-ref' }, { openid: A })).code, 'BAD_INPUT');
  assert.equal((await h.call('createChain', { customText: '加我微信' }, { openid: A })).code, 'TEXT_REJECTED');
});

// ------------------------------------------------------------------ rules, rewards

test('agreeRules stores the version; 先看看 changes nothing (AC 76)', async () => {
  assert.equal((await h.call('agreeRules', { version: 0 }, { openid: A })).code, 'BAD_INPUT');
  assert.equal((await h.call('agreeRules', { version: 2 }, { openid: A })).code, 'BAD_INPUT', 'cannot agree to a version that does not exist');
  assert.equal((await h.call('agreeRules', {}, { openid: A })).code, 'BAD_INPUT');
  assert.equal((await h.call('getHome', {}, { openid: A })).me.rulesVersion, 0);
  assert.equal((await h.call('agreeRules', { version: 1 }, { openid: A })).ok, true);
  assert.equal(h.db.get('players', A).rulesVersion, 1);
  assert.equal((await h.call('getHome', {}, { openid: A })).me.rulesVersion, 1);
});

test('grantReward: caps and the once-per-day no-fill rule (AC 101, 102)', async () => {
  const r1 = await h.call('grantReward', { kind: 'palette', noFill: false }, { openid: A });
  assert.equal(r1.paletteToday, true);
  assert.equal((await h.call('grantReward', { kind: 'palette', noFill: false }, { openid: A })).code, 'REWARD_LIMIT');
  assert.equal((await h.call('grantReward', { kind: 'start', noFill: true }, { openid: A })).startsLeft, 4);
  assert.equal((await h.call('grantReward', { kind: 'start', noFill: true }, { openid: A })).code, 'REWARD_LIMIT', 'second no-fill grants nothing');
  assert.equal((await h.call('grantReward', { kind: 'start', noFill: false }, { openid: A })).startsLeft, 5);
  assert.equal((await h.call('grantReward', { kind: 'start', noFill: false }, { openid: A })).code, 'REWARD_LIMIT', 'max 2 extra starts');
  assert.equal((await h.call('grantReward', { kind: 'bogus' }, { openid: A })).code, 'BAD_INPUT');
  h.setNow(Date.UTC(2026, 10, 4, 4, 0, 0));
  const next = await h.call('grantReward', { kind: 'palette', noFill: false }, { openid: A });
  assert.equal(next.ok, true, 'resets the next Beijing day');
  assert.equal((await h.call('getHome', {}, { openid: B })).me.paletteToday, false, 'per player');
});

// ------------------------------------------------------------------ groups

test('joinGroup: cloudID-decrypted group data only; groupRef is opaque and stable; membership refreshes', async () => {
  const bad = await h.call('joinGroup', { groupData: 'cloudid-not-decrypted' }, { openid: A });
  assert.equal(bad.code, 'BAD_CLOUDID');
  assert.equal((await h.call('joinGroup', {}, { openid: A })).code, 'BAD_CLOUDID');
  assert.equal((await h.call('joinGroup', { groupData: { data: { chat_type: 1, opengid: 'g' } } }, { openid: A })).code, 'NOT_GROUP');
  assert.equal((await h.call('joinGroup', { groupData: { data: { chat_type: 3 } } }, { openid: A })).code, 'NOT_GROUP');
  assert.equal((await h.call('joinGroup', { groupData: { data: { chat_type: 3, opengid: '' } } }, { openid: A })).code, 'NOT_GROUP');
  const r = await h.call('joinGroup', { groupData: { cloudID: 'x', data: { opengid: F.GROUP_A, chat_type: 3 } } }, { openid: A });
  assert.match(r.groupRef, /^[0-9a-f]{16}$/);
  assert.ok(!JSON.stringify(r).includes(F.GROUP_A));
  const again = await h.call('joinGroup', { groupData: { cloudID: 'x', data: { opengid: F.GROUP_A, chat_type: 4 } } }, { openid: B });
  assert.equal(again.groupRef, r.groupRef, 'same group, same ref for every member');
  const other = await h.call('joinGroup', { groupData: { data: { opengid: F.GROUP_B } } }, { openid: A });
  assert.notEqual(other.groupRef, r.groupRef);
  h.advance(86400000 * 2);
  await h.call('joinGroup', { groupData: { data: { opengid: F.GROUP_A, chat_type: 3 } } }, { openid: A });
  assert.equal(h.db.get('group_members', `${F.GROUP_A}_${A}`).lastSeen, '20261105');
  assert.equal(h.db.get('group_members', `${F.GROUP_A}_${A}`).firstSeen, '20261103');
  // the ref depends on the secret pepper
  h.setEnv('GROUP_REF_PEPPER', 'a-completely-different-pepper-value');
  assert.notEqual((await h.call('joinGroup', { groupData: { data: { opengid: F.GROUP_A } } }, { openid: C })).groupRef, r.groupRef);
  h.setEnv('GROUP_REF_PEPPER', undefined);
  assert.equal((await h.call('joinGroup', { groupData: { data: { opengid: F.GROUP_A } } }, { openid: C })).code, 'SERVER_CONFIG');
  assert.equal((await h.call('joinGroup', { groupData: { data: { opengid: F.GROUP_A } } }, {})).code, 'UNAUTHENTICATED');
});

// ------------------------------------------------------------------ album

test('getMyChains: list statuses, paging, own 棒 detail only, no foreign content (spec 8.11)', async () => {
  const gref = await F.player(h, A);
  await F.player(h, B);
  const open = F.seedChain(h, { authors: [A, B], openGId: F.GROUP_A });
  const rev = F.seedChain(h, { authors: [A, B, A, B, A, B], openGId: F.GROUP_A, patch: { state: 'revealed', revealedAt: h.now() } });
  const exp = F.seedChain(h, { authors: [A, B], openGId: F.GROUP_A, patch: { state: 'expired' } });
  const c = await F.create(h, A, { groupRef: gref });
  await F.submit(h, A, c.chainId, c.claim.claimId, { strokes: F.strokes() }); // pending
  const list = await h.call('getMyChains', {}, { openid: A });
  const by = Object.fromEntries(list.items.map((i) => [i.chainId, i]));
  assert.equal(by[open].status, 'open');
  assert.equal(by[rev].status, 'revealed');
  assert.equal(by[rev].unseen, true);
  assert.equal(by[rev].promptText, '题目1号');
  assert.equal(by[exp].status, 'expired');
  assert.equal(by[exp].promptText, '题目1号', 'the starter sees the prompt of an unfinished chain');
  assert.equal(by[c.chainId].status, 'pending');
  assert.equal(by[open].promptText, null, 'no prompt on open chains');
  assert.deepEqual(by[open].myNs, [1]);
  await h.call('getReveal', { chainId: rev }, { openid: A });
  assert.equal((await h.call('getMyChains', {}, { openid: A })).items.find((i) => i.chainId === rev).unseen, false);
  const bList = await h.call('getMyChains', {}, { openid: B });
  assert.equal(bList.items.find((i) => i.chainId === exp).promptText, null, 'a non-starter does not get the prompt of an unfinished chain');
  // detail: only my own 棒
  const d = await h.call('getMyChains', { chainId: open }, { openid: A });
  assert.deepEqual(d.mine.map((m) => m.n), [1]);
  assert.ok(!JSON.stringify(d).includes('猜测2号'));
  assert.equal((await h.call('getMyChains', { chainId: open }, { openid: C })).code, 'CHAIN_NOT_FOUND');
  // paging
  for (let i = 0; i < 25; i++) { h.advance(1000); F.seedChain(h, { authors: [A, B], openGId: F.GROUP_A }); }
  const p1 = await h.call('getMyChains', {}, { openid: A });
  assert.equal(p1.items.length, 20);
  assert.equal(p1.cursor, 20);
  const p2 = await h.call('getMyChains', { cursor: p1.cursor }, { openid: A });
  assert.ok(p2.items.length >= 5);
  assert.ok(!p2.items.some((i) => p1.items.find((x) => x.chainId === i.chainId)));
});

// ------------------------------------------------------------------ analytics

test('track: whitelisted client events only; identifiers, text and strokes never stored (AC 75)', async () => {
  const r = await h.call('track', {
    events: [
      { name: 'session_start', sessionId: 'sess_1', clientTs: 1700000000000, props: { scene: 1001, openid: 'oX', groupRef: 'abc', nested: { text: '用户写的话', strokes: [[1]], ok: 'fine' }, promptText: '题目' } },
      { name: 'mod_verdict', props: { suggest: 'pass' } }, // server-only name: dropped
      { name: 'step_submit', props: { chars: 7, content: '不该存', long: 'x'.repeat(500) } },
      'garbage', null, { name: 5 },
    ],
  }, { openid: A });
  assert.equal(r.accepted, 2);
  const ev = h.db.all('events');
  assert.equal(ev.length, 2);
  assert.equal(ev[0].openid, A);
  assert.equal(ev[0].sessionId, 'sess_1');
  assert.deepEqual(ev[0].props, { scene: 1001, nested: { ok: 'fine' } });
  assert.equal(ev[1].props.long.length, 64);
  assert.ok(!('content' in ev[1].props));
  assert.ok(!JSON.stringify(ev).includes('用户写的话'));
  assert.equal((await h.call('track', { events: [] }, { openid: A })).code, 'BAD_INPUT');
  assert.equal((await h.call('track', { events: new Array(51).fill({ name: 'error' }) }, { openid: A })).code, 'BAD_INPUT');
  assert.equal((await h.call('track', { events: [{ name: 'error' }] })).code, 'UNAUTHENTICATED');
});

test('track is rate limited per player', async () => {
  const batch = { events: Array.from({ length: 50 }, () => ({ name: 'error', props: {} })) };
  let limited = 0;
  for (let i = 0; i < 8; i++) if ((await h.call('track', batch, { openid: A })).code === 'RATE_LIMITED') limited += 1;
  assert.ok(limited >= 2);
  assert.equal((await h.call('track', batch, { openid: B })).ok, true, 'another player is unaffected');
});

test('server events carry no user text, strokes, openids or group ids', async () => {
  const gref = await F.player(h, A);
  await F.player(h, B);
  await F.completeChain(h, A, B, gref);
  const names = new Set(h.db.all('events').map((e) => e.name));
  for (const n of ['chain_create', 'step_result', 'mod_verdict', 'chain_reveal']) assert.ok(names.has(n), `event ${n}`);
  for (const e of h.db.all('events')) {
    const s = JSON.stringify(e.props);
    for (const sec of [A, B, F.GROUP_A, gref]) assert.ok(!s.includes(sec), `${e.name} props leak ${sec}`);
    assert.ok(!/猜测|题目|strokes/.test(s), `${e.name} props carry content`);
  }
});

test('invalid strokes through the API are rejected before anything is stored (AC 25)', async () => {
  const gref = await F.player(h, A);
  const c = await F.create(h, A, { groupRef: gref });
  h.advance(1000);
  const bad = [
    { v: 1, s: [[12, 0, 5, 5]] },
    { v: 1, s: [[0, 0, 5000, 5]] },
    { v: 2, s: [[0, 0, 5, 5]] },
    'strokes',
    { v: 1, s: Array.from({ length: 201 }, () => [0, 0, 1, 1]) },
  ];
  for (const strokes of bad) assert.equal((await F.submit(h, A, c.chainId, c.claim.claimId, { strokes })).code, strokes === 'strokes' ? 'INVALID_STROKES' : 'INVALID_STROKES');
  assert.equal(h.db.all('steps').length, 0);
  assert.equal(h.sdk.count('uploadFile'), 0);
  assert.equal(h.db.get('chains', c.chainId).state, 'starting');
});
