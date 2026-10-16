'use strict';
// track: batched analytics. L2: props are an allowlist per event with type / enum checks (game/core/events.js).
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./helpers/harness');
const events = require('../../game/core/events');
const analytics = require('../../game/js/analytics');

const T0 = Date.UTC(2026, 10, 3, 4, 0, 0);
let h;
beforeEach(() => { h = createHarness({ now: T0 }); });
afterEach(() => h.teardown());

const ev = (name = 'run_start', props = {}) => ({ name, props, sessionId: 'sess-1', clientTs: T0 - 5 });
const track = (list, openid = 'u1', extra = {}) => h.call('track', { events: list, ...extra }, { openid });

test('stores events with the context openid and server timestamp', async () => {
  const r = await track([ev('run_start', { runId: 'run-00001', mode: 'free' }), ev('run_complete', { wins: 9 })], 'u1', { openid: 'forged' });
  assert.deepEqual(r, { ok: true, accepted: 2 });
  const docs = h.db.all('events');
  assert.equal(docs.length, 2);
  assert.ok(docs.every((d) => d.openid === 'u1' && d.ts === T0 && d.sessionId === 'sess-1' && d.clientTs === T0 - 5));
  assert.deepEqual(docs[0].props, { runId: 'run-00001', mode: 'free' });
  assert.equal((await track([ev()], 'u1').then(() => h.callRaw('track', { events: [ev()] }, {}))).code, 'UNAUTHENTICATED');
});

test('batch limit: 1..50 events per call', async () => {
  assert.equal((await track(new Array(50).fill(ev()))).accepted, 50);
  assert.equal((await track(new Array(51).fill(ev()))).code, 'INVALID_ACTIONS');
  assert.equal((await track([])).code, 'INVALID_ACTIONS');
  assert.equal((await track('x')).code, 'INVALID_ACTIONS');
});

test('unknown and server-only event names are dropped; the rest of the batch is kept', async () => {
  const r = await track([ev('board_list'), ev('daily_gen'), ev('anomaly_daily'), ev('made_up'), ev('__proto__'), ev('constructor'), { nope: 1 }, 'str', ev('share_tap', { kind: 'result' })]);
  assert.equal(r.accepted, 1);
  assert.deepEqual(h.db.all('events').map((e) => e.name), ['share_tap']);
});

test('L2: only the keys the catalogue lists survive; unknown keys, identifiers and free text are dropped', async () => {
  await track([ev('group_join', {
    result: 'ok', scene: 1044, openGId: 'OG-SECRET', groupRef: 'abcdef0123456789', openid: 'o-x', shareTicket: 'tk',
    nested: { groupRef: 'zzz', keep: 1 }, 'bad.key': 1, $set: 1, freeText: 'hello', cloudID: 'cid-secret-123456',
  })]);
  const props = h.db.all('events')[0].props;
  assert.deepEqual(props, { result: 'ok', scene: 1044 });
  assert.doesNotMatch(JSON.stringify(h.db.all('events')), /OG-SECRET|abcdef0123456789|o-x|shareTicket|cid-secret/);
});

test('L2: wrong types and enum values are dropped one by one, the event is still stored', async () => {
  await track([
    ev('run_start', { runId: 12, mode: 'hacked', source: { a: 1 }, variant: 'x'.repeat(500) }),
    ev('run_complete', { runId: 'run-00001', mode: 'daily', wins: 13, durationMs: -1, respinsFree: 1.5, events: 'str', variant: 'shiren' }),
    ev('draft_pick', { runId: 'run-00001', round: 6, generalId: 'g_zhaoyun', slot: 'zhugong', fit: 'great', poolSize: '8' }),
    ev('error', { where: 'y'.repeat(500), code: { nested: 1 } }),
    ev('error', { where: 'ctl\u0000x', code: 40097 }),
  ]);
  const d = h.db.all('events');
  assert.deepEqual(d[0].props, {});
  assert.deepEqual(d[1].props, { runId: 'run-00001', mode: 'daily', variant: 'shiren' });
  assert.deepEqual(d[2].props, { runId: 'run-00001', generalId: 'g_zhaoyun', slot: 'zhugong' });
  assert.equal(d[3].props.where.length, 80);
  assert.equal(d[3].props.code, undefined);
  assert.deepEqual(d[4].props, { where: 'ctlx', code: 40097 });
});

test('L2: prototype-pollution shaped props do nothing', async () => {
  const polluted = JSON.parse('{"__proto__": {"x": 1}, "constructor": {"y": 2}, "where": "sheet", "result": "ok"}');
  await track([ev('save_image', polluted), ev('error', 'str'), ev('error', [1, 2])]);
  assert.equal(({}).x, undefined);
  assert.deepEqual(h.db.all('events').map((e) => e.props), [{ result: 'ok' }, {}, {}]);
});

test('events whose cleaned props are still > 1 KB are dropped; bad sessionId and clientTs nulled', async () => {
  const r = await track([
    ev('run_complete', { events: Array.from({ length: 30 }, () => 'y'.repeat(200)), runId: 'run-00001' }),
    { name: 'error', props: { where: 'x'.repeat(500) }, sessionId: 'bad session!', clientTs: 'soon' },
  ]);
  assert.equal(r.accepted, 1, 'the 12 x 80 char events array exceeds 1 KB: dropped');
  const [b] = h.db.all('events');
  assert.equal(b.props.where.length, 80);
  assert.equal(b.sessionId, null);
  assert.equal(b.clientTs, null);
});

test('the sessionId the shipped client puts inside props is stored top-level and stripped from props', async () => {
  await track([{ name: 'card_open', props: { sessionId: 'sess-inside', cardKind: 'result', hasShareTicket: true } }]);
  const d = h.db.all('events')[0];
  assert.equal(d.sessionId, 'sess-inside');
  assert.deepEqual(d.props, { cardKind: 'result', hasShareTicket: true });
});

test('L2: every event the shipped client can send is in the catalogue, and its props survive', () => {
  assert.deepEqual(events.EVENT_NAMES.slice().sort(), analytics.EVENTS.slice().sort(), 'client and catalogue name the same events');
  const c = events.cleanProps;
  const common = { isNewUser: false, contentVersion: 2, appVersion: '0.1.0', platform: 'ios' };
  const samples = [
    ['session_start', { scene: 1044, fromCard: 'result', hasShareTicket: true, challengeId: 'ABCDEFGH' }],
    ['card_open', { cardKind: 'challenge', hasShareTicket: false, challengeId: 'ABCDEFGH' }],
    ['run_start', { runId: 'run-000001', mode: 'daily', source: 'home', variant: 'standard' }],
    ['round_fetch', { runId: 'run-000001', round: 2, result: 'ok', ms: 120 }],
    ['respin', { runId: 'run-000001', round: 1, dim: 'faction', src: 'ad' }],
    ['draft_pick', { runId: 'run-000001', round: 3, generalId: 'g_zhaoyun', slot: 'xianfeng', fit: 'good', pickFaction: '蜀', poolSize: 8, poolTotal: 27 }],
    ['draft_undo', { runId: 'run-000001', round: 2 }],
    ['run_complete', { runId: 'run-000001', mode: 'free', wins: 7, durationMs: 90000, respinsFree: 1, respinsAd: 0, events: ['火攻', '连环'], variant: 'shiren', multiAppearancePicks: 2 }],
    ['run_abandon', { runId: 'run-000001', mode: 'free', round: 3 }],
    ['reveal_skip', { runId: 'run-000001', atBattle: 5 }],
    ['shiren_reveal', { runId: 'run-000001', skipped: true }],
    ['share_tap', { runId: 'run-000001', kind: 'challenge', mode: 'daily', wins: 12 }],
    ['challenge_created', { challengeId: 'ABCDEFGH', mode: 'daily', wins: 9 }],
    ['challenge_answered', { challengeId: 'ABCDEFGH', myWins: 8, theirWins: 9, countsAsDaily: true }],
    ['board_view', { kind: 'group', state: 'ready', mode: 'selfOnly' }],
    ['group_join', { result: 'wrongScene', errCode: 40097, scene: 1044, chatType: 1 }],
    ['group_join', { result: 'error', errCode: 'BAD_CLOUDID', scene: 1044 }],
    ['privacy_result', { trigger: 'board', result: 'agreed' }],
    ['friend_scope_result', { result: 'granted', via: 'authorize' }],
    ['board_write', { dateKey: '20261110', result: 'ok', w: 9 }],
    ['streak_shown', { current: 7, where: 'result' }],
    ['history_view', { items: 12, state: 'ready' }],
    ['history_issue_view', { dateKey: '20261110', hasMine: true, bestShown: false }],
    ['save_image', { mode: 'daily', result: 'saved', errCode: 'unsupported' }],
    ['subscribe_offer', { where: 'result' }],
    ['subscribe_result', { result: 'accept', errCode: 20004 }],
    ['display_setting', { largeText: true, highContrast: false, source: 'auto_first_launch' }],
    ['ad_request', { placement: 'respin', stub: true }],
    ['ad_show', { placement: 'replay', stub: false }],
    ['ad_reward', { placement: 'interstitial', stub: true }],
    ['ad_close_early', { placement: 'respin', stub: true }],
    ['ad_error', { placement: 'banner', stub: false, errCode: 1004 }],
    ['interstitial_show', { runsThisSession: 3 }],
    ['error', { where: 'getDaily', code: 'RATE_LIMITED' }],
  ];
  samples.forEach(([name, props]) => {
    const out = c(name, { ...props, ...common });
    const want = { ...props, ...common };
    const lost = Object.keys(want).filter((k) => JSON.stringify(out[k]) !== JSON.stringify(want[k]));
    assert.deepEqual(lost, [], name + ' lost ' + lost.join(','));
  });
  assert.deepEqual(samples.map((s) => s[0]).filter((v, i, a) => a.indexOf(v) === i).sort(), events.EVENT_NAMES.slice().sort(), 'every catalogue event has a sample');
});

test('rate limited per openid (300 events/min), window resets, other users unaffected', async () => {
  h.limits = true;
  for (let i = 0; i < 6; i++) assert.equal((await track(new Array(50).fill(ev()))).ok, true);
  const limited = await track([ev()]);
  assert.equal(limited.ok, false);
  assert.equal(limited.code, 'RATE_LIMITED');
  assert.equal(h.db.all('events').length, 300);
  assert.equal((await track([ev()], 'u2')).ok, true);
  h.advance(60000);
  assert.equal((await track([ev()])).ok, true);
});
