'use strict';
// Unit tests for the client modules: store (guarded parsing), api (one name table, never rejects), features, analytics (AC 75),
// share (AC 92-96), ads (AC 101-104), subscribe (AC 100), keyboard, privacy.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const build = require('../js/build-config');
const { parseState, fresh, createStore, KEY } = require('../js/store');
const { createApi, NAMES, FN } = require('../js/api');
const { normalizeFeatures } = require('../js/features');
const { createAnalytics } = require('../js/analytics');
const { createShare, parseEnter, inviteQuery, revealQuery, FALLBACK_IMAGE } = require('../js/share');
const { createAds } = require('../js/ads');
const { createSubscribe } = require('../js/subscribe');
const { createKeyboard } = require('../js/keyboard');
const { createPrivacy } = require('../js/privacy');
const { createMockServer } = require('../js/mock-server');
const schema = require('../core/schema');
const strokesLib = require('../core/strokes');

// ------------------------------------------------------------------------------------------------------------ store

test('store: garbage in storage never throws and yields a complete default state', () => {
  const junk = [null, undefined, '', 'not json', '{"v":', 42, true, [], {}, { v: 2 }, { v: 1, turn: 'x', display: 5, revealsSeen: [1, 2], lifetimeReveals: -9, muted: 'yes' }, 'x'.repeat(500 * 1024)];
  for (const j of junk) {
    const s = parseState(j);
    assert.deepEqual(Object.keys(s).sort(), Object.keys(fresh()).sort());
    assert.equal(s.turn, null);
    assert.equal(s.muted, false);
    assert.equal(s.lifetimeReveals >= 0, true);
  }
});

test('store: each field is checked on its own; one bad field does not lose the others', () => {
  const s = parseState(JSON.stringify({ v: 1, muted: true, howtoSeen: true, display: { largeText: true, highContrast: 'maybe' }, lifetimeReveals: 3.5, firstDate: '2026-11-03', revealsSeen: { ABCDEFGHJK: true, 'bad key!': true, ZZZZZZZZZZ: 'yes' } }));
  assert.equal(s.muted, true);
  assert.equal(s.howtoSeen, true);
  assert.deepEqual(s.display, { largeText: true, highContrast: false });
  assert.equal(s.lifetimeReveals, 0, 'a fractional count is rejected');
  assert.equal(s.firstDate, null);
  assert.deepEqual(s.revealsSeen, { ABCDEFGHJK: true });
});

test('store: the unsent turn is kept only if it is a valid turn (kind matches the 棒, strokes pass core validation)', () => {
  const good = { chainId: 'ABCDEFGHJK', claimId: 'c123', step: 3, kind: 'draw', colorIdx: 2, sizeIdx: 1, undoCount: 1, startedAt: 1, savedAt: 2, strokes: { v: 1, s: [[0, 1, 10, 10, 5, 5]] } };
  assert.equal(parseState({ v: 1, turn: good }).turn.strokes.s.length, 1);
  const bad = [
    { ...good, kind: 'describe' }, // 棒 3 is a drawing
    { ...good, step: 7 },
    { ...good, chainId: 'x' },
    { ...good, claimId: '' },
    { ...good, strokes: { v: 1, s: [[99, 1, 10, 10, 5, 5]] } }, // colour out of range
    { ...good, strokes: { v: 1, s: [[0, 1, 5000, 10, 5, 5]] } }, // coordinate out of range
    { ...good, strokes: 'x' },
  ];
  for (const t of bad) assert.equal(parseState({ v: 1, turn: t }).turn, null, JSON.stringify(t).slice(0, 80));
  const d = parseState({ v: 1, turn: { chainId: 'ABCDEFGHJK', claimId: 'c1', step: 4, kind: 'describe', text: '一只猫😀😀' } }).turn;
  assert.equal(d.text, '一只猫', 'emoji are dropped on the way in');
});

test('store: a live turn is keyed by room and round; a chain turn by its claim (a draft with no mode is a chain turn)', () => {
  const live = { mode: 'live', roomId: 'ROOMAAAAAA', round: 1, kind: 'draw', gridH: 1363, colorIdx: 0, sizeIdx: 1, undoCount: 0, startedAt: 1, savedAt: 2, strokes: { v: 2, h: 1363, s: [[0, 1, 10, 10, 5, 5]] } };
  const t = parseState({ v: 1, turn: live }).turn;
  assert.equal(t.mode, 'live');
  assert.equal(t.roomId, 'ROOMAAAAAA');
  assert.equal(t.round, 1);
  assert.equal(t.gridH, 1363);
  for (const bad of [{ ...live, round: 2 }, { ...live, round: 0 }, { ...live, roomId: 'x' }, { ...live, kind: 'describe' }, { ...live, strokes: { v: 2, h: 5000, s: [] } }]) assert.equal(parseState({ v: 1, turn: bad }).turn, null, JSON.stringify(bad).slice(0, 60));
  assert.equal(parseState({ v: 1, turn: { chainId: 'ABCDEFGHJK', claimId: 'c1', step: 1, kind: 'draw' } }).turn.mode, 'chain');
});

test('store: the cached 我的接龙 list (rooms and chains) drops malformed items and v1 rows', () => {
  const s = parseState({ v: 1, albumCache: { at: 5, items: [{ kind: 'chain', id: 'ABCDEFGHJK', status: 'revealed', line: 'x', timeText: 't', unseen: true }, { kind: 'room', id: 'ROOMAAAAAA', status: 'playing', line: '一局' }, { kind: 'chain', id: 'short', status: 'revealed' }, { kind: 'chain', id: 'ABCDEFGHJL', status: 'bogus' }, { chainId: 'ABCDEFGHJK', status: 'revealed' }, { kind: 'x', id: 'ABCDEFGHJK', status: 'open' }, 7] } });
  assert.equal(s.albumCache.items.length, 2);
  assert.equal(s.albumCache.items[0].unseen, true);
  assert.equal(s.albumCache.items[1].kind, 'room');
});

test('store: save/load round trip through a fake wx storage; reset clears in place', () => {
  const mem = {};
  const wx = { getStorageSync: (k) => mem[k], setStorageSync: (k, v) => (mem[k] = v) };
  const st = createStore(wx);
  const ref = st.state;
  st.state.muted = true;
  st.state.revealsSeen.ABCDEFGHJK = true;
  st.save();
  assert.equal(createStore(wx).state.muted, true);
  assert.equal(createStore(wx).state.revealsSeen.ABCDEFGHJK, true);
  mem[KEY] = '{{{{';
  assert.equal(createStore(wx).state.muted, false);
  st.reset();
  assert.equal(ref.muted, false, 'same object, reset in place');
  const broken = createStore({ getStorageSync: () => { throw new Error('boom'); }, setStorageSync: () => { throw new Error('full'); } });
  assert.doesNotThrow(() => broken.save());
});

// -------------------------------------------------------------------------------------------------------------- api

test('api: one name table covers every client function of core/schema.js (no function is missing, none is invented)', () => {
  assert.deepEqual([...NAMES].sort(), schema.CLIENT_FUNCTIONS.slice().sort());
  assert.equal(NAMES.length, 28, 'all 28 client functions of the schema (rev. 2: rooms and rolls included)');
  for (const n of ['rollPrompts', 'createRoom', 'joinRoom', 'leaveRoom', 'startRoom', 'getRoom', 'submitRoomStep', 'roomTick', 'getRoomReveal', 'rematch']) assert.equal(FN[n], n, n);
  for (const n of NAMES) assert.equal(typeof createApi({ mode: 'mock', mockServer: createMockServer() })[n], 'function', n);
  assert.equal(FN.getHome, 'getHome');
});

test('api (TD-35): callFunction names resolve as fnPrefix + name; the prefix is empty by default and chuanhua_ for the shared test env', async () => {
  const calls = [];
  const wx = { cloud: { init: () => {}, callFunction: (o) => (calls.push(o.name), o.success({ result: { ok: true } })) } };
  const plain = createApi({ wx, cloudEnv: 'env-x', fnPrefix: '' });
  const shared = createApi({ wx, cloudEnv: 'env-shared', fnPrefix: 'chuanhua_' });
  for (const n of NAMES) {
    await plain[n]({});
    await shared[n]({});
  }
  assert.deepEqual(calls.filter((_, i) => i % 2 === 0), NAMES);
  assert.deepEqual(calls.filter((_, i) => i % 2 === 1), NAMES.map((n) => 'chuanhua_' + n));
  assert.equal(shared.deployedName('submitStep'), 'chuanhua_submitStep');
  if (!require('./mode').RELEASE) {
    assert.equal(build.fnPrefix, '', 'default build: no prefix');
    assert.equal(build.cloudEnv, '', 'default build: mock server');
  }
  assert.equal(build.resolveFnPrefix('env-shared', 'env-shared'), 'chuanhua_');
  assert.equal(build.resolveFnPrefix('env-own', 'env-shared'), '');
  assert.equal(build.resolveFnPrefix('', ''), '');
});

test('api: never rejects: network failure, odd results, a throw and a timeout all resolve to {ok:false, code}', async () => {
  const mk = (cf, timers) => createApi({ wx: { cloud: { init() {}, callFunction: cf } }, cloudEnv: 'e', setTimeout: timers && timers.set, clearTimeout: timers && timers.clear });
  assert.deepEqual((await mk((o) => o.fail({ errMsg: 'x' })).getHome()).code, 'NETWORK');
  assert.equal((await mk((o) => o.success({ result: 'str' })).getHome()).code, 'BAD_RESPONSE');
  assert.equal((await mk((o) => o.success({})).getHome()).code, 'BAD_RESPONSE');
  assert.equal((await mk(() => { throw new Error('boom'); }).getHome()).code, 'NETWORK');
  assert.equal((await createApi({ wx: {}, cloudEnv: 'e' }).getHome()).code, 'NETWORK');
  let fire = null;
  const pending = mk(() => {}, { set: (f) => ((fire = f), 1), clear() {} }).submitStep({});
  fire();
  assert.equal((await pending).code, 'TIMEOUT');
  // the timeout is the per-function client wait from core/schema.js
  const seen = [];
  const a = mk(() => {}, { set: (f, ms) => (seen.push(ms), 1), clear() {} });
  a.submitStep({});
  a.getHome({});
  assert.deepEqual(seen, [schema.FUNCTIONS.submitStep.clientMs, schema.FUNCTIONS.getHome.clientMs]);
});

test('api: identity is never sent, and the client never offers server-only functions', async () => {
  const sent = [];
  const wx = { cloud: { init() {}, callFunction: (o) => (sent.push(o), o.success({ result: { ok: true } })) } };
  const api = createApi({ wx, cloudEnv: 'e' });
  await api.claimStep({ chainId: 'ABCDEFGHJK', groupRef: 'g' });
  assert.deepEqual(Object.keys(sent[0].data), ['chainId', 'groupRef']);
  for (const n of ['onMediaCheck', 'modSweeper', 'cleanup', 'admin']) assert.equal(api[n], undefined);
});

test('api: realtimeEnv: the database watch with the {openid} placeholder in the cloud, srv.realtime for the mock (unsupported = no watch)', () => {
  const queries = [];
  const db = { collection: (n) => ({ where: (q) => ({ watch: (h) => (queries.push([n, q]), { close() {}, h }) }) }) };
  const cloud = createApi({ wx: { cloud: { init() {}, database: () => db } }, cloudEnv: 'e' }).realtimeEnv();
  assert.equal(cloud.openid, '{openid}');
  cloud.watch('{openid}', 'ROOM1', { onChange() {}, onError() {} });
  assert.deepEqual(queries, [['chuanhua_room_signals', { _openid: '{openid}', roomId: 'ROOM1' }]]);
  assert.equal(createApi({ wx: {}, cloudEnv: 'e' }).realtimeEnv().watch, undefined, 'no database: polling');
  const srv = createMockServer();
  const mock = createApi({ mockServer: srv, user: 'u9' }).realtimeEnv();
  assert.equal(mock.openid, 'u9');
  assert.equal(typeof mock.watch('u9', 'R', { onChange() {}, onError() {} }).close, 'function');
  srv.realtime.unsupported = true;
  assert.equal(mock.watch('u9', 'R', {}), undefined);
});

test('api (PO-14): a PROD build never constructs the mock server: every call fails with SERVER_CONFIG', async () => {
  const api = createApi({ cloudEnv: '', envKind: 'prod' });
  assert.equal(api.mock, null);
  assert.equal((await api.getHome()).code, 'SERVER_CONFIG');
  const dev = createApi({ cloudEnv: '', envKind: 'dev' });
  assert.ok(dev.mock);
  assert.equal((await dev.getHome()).ok, true);
});

// ---------------------------------------------------------------------------------------------------------- features

test('features: remote app_config is clamped; unreadable config falls back to safe defaults (edge 31)', () => {
  const d = normalizeFeatures(null, build);
  assert.equal(d.subscribe, null);
  assert.equal(d.banner.enabled, false);
  assert.equal(d.updatableCard, false);
  assert.deepEqual(d.ugc, { createEnabled: true, viewEnabled: true });
  assert.equal(d.timers.drawSec, 60);
  assert.equal(d.interstitial.minGapSec, 180);
  const x = normalizeFeatures({ features: { interstitial: { enabled: true, minLifetimeReveals: 3, minGapSec: 5, maxPerDay: 99 }, banner: { enabled: true, adUnitId: 'u1' }, subscribe: { tmplId: 'T' }, updatableCard: true }, timers: { drawSec: 1, describeSec: 9999 }, ugc: { createEnabled: false } }, build);
  assert.equal(x.interstitial.minGapSec, 180, 'minGapSec >= 180 (AC 104)');
  assert.equal(x.interstitial.maxPerDay, 3, 'maxPerDay <= 3 (AC 104)');
  assert.equal(x.timers.drawSec, 15);
  assert.equal(x.timers.describeSec, 180);
  assert.deepEqual(x.banner, { enabled: true, adUnitId: 'u1' });
  assert.deepEqual(x.subscribe, { tmplId: 'T' });
  assert.equal(x.ugc.createEnabled, false);
  assert.equal(normalizeFeatures({ features: { banner: { enabled: 'yes' } } }, build).banner.enabled, false);
  assert.deepEqual(normalizeFeatures({}, { subscribeTmplId: 'LOCAL', adUnits: {} }).subscribe, { tmplId: 'LOCAL' }, 'build-config fallback template');
  // rev. 2: live rooms are the default, the realtime config and the room timers are clamped
  assert.equal(d.liveRooms, true);
  assert.deepEqual(d.rt, { watch: true, pollSec: 2, safetyPollSec: 10 });
  assert.equal(d.room.promptSec, 30);
  assert.equal(normalizeFeatures({ features: { liveRooms: false } }, build).liveRooms, false);
  const r = normalizeFeatures({ features: { rt: { watch: false, pollSec: 99, safetyPollSec: 1 } }, room: { promptSec: 1, graceSec: 99, minPlayers: 1 } }, build);
  assert.deepEqual(r.rt, { watch: false, pollSec: 10, safetyPollSec: 5 });
  assert.equal(r.room.promptSec, 10);
  assert.equal(r.room.graceSec, 15);
  assert.equal(r.room.minPlayers, 3);
});

// --------------------------------------------------------------------------------------------------------- analytics

function analyticsRig(extra) {
  const sent = [];
  const api = { track: async (d) => (sent.push(d), (extra && extra.fail ? { ok: false } : { ok: true })) };
  const store = { state: { firstDate: '20261103' } };
  const a = createAnalytics({ wx: {}, api, store, now: () => Date.UTC(2026, 10, 3, 4), appVersion: '1.0.0' });
  return { a, sent };
}

test('AC 75: analytics events carry no text, strokes, openids, group ids or tickets; non-scalars are dropped', async () => {
  const { a, sent } = analyticsRig();
  a.track('step_submit', {
    chainId: 'ABCDEFGHJK', step: 3, text: '用户写的话', strokes: { v: 1, s: [] }, openid: 'oXXXXXXXXXXXXXXXXXXXXXXXXXXXX', groupRef: 'abcd', shareTicket: 't', promptText: '月亮吃月饼',
    nested: { a: 1 }, list: [1], long: 'x'.repeat(300), nan: NaN, ok: true,
  });
  await a.flush();
  const e = sent[0].events[0];
  assert.equal(e.name, 'step_submit');
  assert.deepEqual(Object.keys(e.props).sort(), ['appVersion', 'chainId', 'isNewUser', 'ok', 'promptsVersion', 'step'].sort());
  assert.equal(e.sessionId.length, 24);
  assert.equal(typeof e.clientTs, 'number');
  // and the server side rejects anything that slipped through
  const srv = createMockServer({ now: () => Date.UTC(2026, 10, 3, 4) });
  srv.call('track', { events: [{ name: 'step_submit', props: { text: 'x', openid: 'o'.repeat(28), step: 3, promptText: 'x' }, sessionId: 's', clientTs: 1 }] });
  const stored = srv.db.events.filter((x) => x.name === 'step_submit');
  assert.deepEqual(stored[0].props, { step: 3 });
});

test('TD-36: the step_submit "strokes" prop is a number (a count) and survives; a strokes value that could carry a drawing is still dropped', () => {
  const { sanitizeEvents } = require('../core/analytics');
  const [e] = sanitizeEvents([{ name: 'step_submit', props: { strokes: 7, points: 120 }, sessionId: 's', clientTs: 1 }]);
  assert.deepEqual(e.props, { strokes: 7, points: 120 });
  for (const bad of [{ v: 1, s: [] }, [[1, 2]], '[[0,1,2,3]]']) assert.deepEqual(sanitizeEvents([{ name: 'step_submit', props: { strokes: bad }, sessionId: 's', clientTs: 1 }])[0].props, {});
});

test('analytics: unknown events are dropped; batches are 50; a failed flush is re-queued; hide flushes; a new session after 30 min', async () => {
  const { a, sent } = analyticsRig();
  assert.equal(a.track('not_an_event', {}), false);
  assert.equal(a.track('wx_report_event', {}), false);
  for (let i = 0; i < 120; i++) a.track('laugh', { step: 1, on: true });
  await a.flush();
  assert.deepEqual(sent.map((s) => s.events.length), [50, 50, 20]);
  const f = analyticsRig({ fail: true });
  f.a.track('laugh', { step: 1 });
  await f.a.flush();
  assert.equal(f.a.queue.length, 1, 're-queued');
  const s1 = a.sessionId();
  let now = 0;
  const b = createAnalytics({ wx: {}, api: { track: async () => ({ ok: true }) }, store: { state: { firstDate: '20261103' } }, now: () => now });
  const first = b.sessionId();
  b.onHide();
  now = 29 * 60e3;
  assert.equal(b.onShow({}), false);
  b.onHide();
  now += 31 * 60e3;
  assert.equal(b.onShow({ scene: 1001, fromCard: 'none', hasShareTicket: false }), true);
  assert.notEqual(b.sessionId(), first);
  assert.ok(s1);
});

// ------------------------------------------------------------------------------------------------------------ share

test('AC 94: card queries are exactly k=<chainId> or r=<chainId>; an id is all they carry', () => {
  assert.equal(inviteQuery('ABCDEFGHJK'), 'k=ABCDEFGHJK');
  assert.equal(revealQuery('ABCDEFGHJK'), 'r=ABCDEFGHJK');
  const rig = shareRig();
  const inv = rig.share.descriptorFor({ kind: 'invite', chainId: 'ABCDEFGHJK', passed: 3, nextStep: 4, nextKind: 'describe' });
  assert.equal(inv.query, 'k=ABCDEFGHJK');
  assert.equal(inv.title, '第 4 棒等你接，看看你能猜出什么？');
  assert.deepEqual(inv.card, { kind: 'invite', passed: 3, length: 6 });
  const inv2 = rig.share.descriptorFor({ kind: 'invite', chainId: 'ABCDEFGHJK', passed: 2, nextStep: 3, nextKind: 'draw' });
  assert.equal(inv2.title, '第 3 棒等你接，你来画画看？');
  const rev = rig.share.descriptorFor({ kind: 'reveal', chainId: 'ABCDEFGHJK', promptText: '月亮吃月饼', finalText: '企鹅在沙漠晒太阳', passed: 6, participantCount: 4 });
  assert.equal(rev.query, 'r=ABCDEFGHJK');
  assert.equal(rev.title, '「月亮吃月饼」传了 6 棒，变成了「企鹅在沙漠晒太阳」');
  assert.deepEqual(rev.card, { kind: 'reveal', promptText: '月亮吃月饼', finalText: '企鹅在沙漠晒太阳', participantCount: 4 });
  // no chain: a generic card with no query at all
  assert.equal(rig.share.descriptorFor(null).query, '');
});

test('AC 95: share cards are built from our art and passed text only: the invite card has no prompt or 棒 text, none has strokes', async () => {
  const rig = shareRig();
  const cards = [];
  rig.share.cardRenderer = async (card) => (cards.push(card), 'tmp://c.png');
  await rig.share.shareInvite({ chainId: 'ABCDEFGHJK', passed: 3, nextStep: 4, nextKind: 'describe', promptText: '月亮吃月饼', text: '不该出现', strokes: { v: 1, s: [[0, 0, 1, 1, 1, 1]] } });
  await rig.share.shareReveal({ chainId: 'ABCDEFGHJK', promptText: '月亮吃月饼', finalText: '企鹅', passed: 6, participantCount: 3, strokes: { v: 1, s: [] } });
  assert.deepEqual(Object.keys(cards[0]).sort(), ['kind', 'length', 'passed']);
  assert.deepEqual(Object.keys(cards[1]).sort(), ['finalText', 'kind', 'participantCount', 'promptText']);
  assert.doesNotMatch(JSON.stringify(cards), /strokes|不该出现/);
  // the image path is the rendered temp file; on a render failure the static fallback from the main package
  assert.equal(rig.wx.shared[0].imageUrl, 'tmp://c.png');
  rig.share.cardRenderer = async () => {
    throw new Error('canvas gone');
  };
  await rig.share.shareReveal({ chainId: 'ABCDEFGHJK', promptText: 'a', finalText: 'b', passed: 6, participantCount: 2 });
  assert.equal(rig.wx.shared[2].imageUrl, FALLBACK_IMAGE);
  assert.equal(FALLBACK_IMAGE, 'assets/share-fallback.png');
});

test('AC 92/93: sharing happens only when a share function is called (tap) or the capsule menu asks; it grants nothing and has no callbacks', async () => {
  const rig = shareRig();
  rig.share.register(() => ({ kind: 'invite', chainId: 'ABCDEFGHJK', passed: 1, nextStep: 2, nextKind: 'describe' }));
  assert.equal(rig.wx.shared.length, 0, 'registering the menu shares nothing');
  assert.deepEqual(rig.wx.menu.map((m) => m[0]), ['showShareMenu', 'updateShareMenu']);
  assert.deepEqual(rig.wx.menu[0][1], { menus: ['shareAppMessage'] });
  assert.equal(rig.wx.menu[1][1].withShareTicket, true);
  assert.equal('isUpdatableMessage' in rig.wx.menu[1][1], false, 'never isUpdatableMessage:false (iOS bug)');
  const m = rig.wx.menuHandler();
  assert.deepEqual(Object.keys(m).sort(), ['imageUrl', 'query', 'title']);
  assert.equal(m.query, 'k=ABCDEFGHJK');
  await rig.share.shareInvite({ chainId: 'ABCDEFGHJK', passed: 1, nextStep: 2, nextKind: 'describe' });
  const arg = rig.wx.shared[0];
  assert.equal(arg.success, undefined);
  assert.equal(arg.fail, undefined);
  assert.equal(arg.complete, undefined, 'the UI never depends on whether a share succeeded');
});

test('9.4: the updatable invite card is set up only when the activity id is known; the share still works without it', async () => {
  const rig = shareRig();
  await rig.share.shareInvite({ chainId: 'ABCDEFGHJK', passed: 3, nextStep: 4, nextKind: 'describe', activityId: 'act-1' });
  const upd = rig.wx.menu.filter((m) => m[1].isUpdatableMessage);
  assert.equal(upd.length, 1);
  assert.deepEqual(upd[0][1].templateInfo.parameterList, [{ name: 'member_count', value: '3' }, { name: 'room_limit', value: '6' }]);
  assert.equal(upd[0][1].withShareTicket, true);
  const before = rig.wx.menu.length;
  await rig.share.shareInvite({ chainId: 'ABCDEFGHJK', passed: 3, nextStep: 4, nextKind: 'describe', activityId: null });
  assert.equal(rig.wx.menu.length, before, 'static card: no updateShareMenu');
  assert.equal(rig.wx.shared.length, 2);
});

test('AC 96: a card with a shareTicket calls getGroupEnterInfo then joinGroup; failures leave no group context; getShareInfo only as the old-client fallback', async () => {
  const joins = [];
  const mk = (wxx) => {
    const rig = shareRig(wxx);
    rig.api.joinGroup = async (d) => (joins.push(d), { ok: true, groupRef: 'gref1' });
    return rig;
  };
  const ok = mk({ getGroupEnterInfo: (o) => o.success({ cloudID: 'CID' }) });
  const r = await ok.share.enterGroup({ scene: 1044, chatType: 2 });
  assert.deepEqual(r, { status: 'ok', groupRef: 'gref1', errCode: undefined });
  assert.equal(joins.length, 1);
  // M1: the request is exactly {cloudID: <raw string>}: no wx.cloud.CloudID wrapper, no decrypted-looking object, no groupData
  assert.deepEqual(joins[0], { cloudID: 'CID' });
  assert.equal(typeof joins[0].cloudID, 'string');
  const nonString = mk({ getGroupEnterInfo: (o) => o.success({ cloudID: { data: { opengid: 'x' } } }) });
  assert.equal((await nonString.share.enterGroup({})).status, 'failed', 'a non-string cloudID is never sent');
  assert.equal(joins.length, 1);
  const rejects = shareRig({ getGroupEnterInfo: (o) => o.success({ cloudID: 'CID' }) });
  rejects.api.joinGroup = async () => { throw new Error('network'); };
  assert.equal((await rejects.share.enterGroup({})).status, 'failed', 'a rejected call fails closed instead of hanging');
  const limited = shareRig({ getGroupEnterInfo: (o) => o.success({ cloudID: 'CID' }) });
  limited.api.joinGroup = async () => ({ ok: false, code: 'RATE_LIMITED' });
  assert.equal((await limited.share.enterGroup({})).errCode, 'RATE_LIMITED');
  assert.equal(ok.wx.getShareInfo, undefined);
  const e = parseEnter({ scene: 1044, query: 'k=ABCDEFGHJK', shareTicket: 'T' });
  assert.equal(e.join, true, 'a ticket on a card means joinGroup');
  assert.equal(parseEnter({ scene: 1044, query: 'k=ABCDEFGHJK' }).join, false, 'no ticket: no group call');
  for (const failCode of [40097, 65206, 'x']) {
    const bad = mk({ getGroupEnterInfo: (o) => o.fail({ errno: failCode }) });
    assert.equal((await bad.share.enterGroup({})).status, 'failed');
  }
  assert.equal((await mk({}).share.enterGroup({})).status, 'failed', 'API missing');
  // very old base library (no getGroupEnterInfo): the deprecated getShareInfo with the ticket is the only fallback (TD-80)
  let used = null;
  const old = mk({ getShareInfo: (o) => ((used = o.shareTicket), o.success({ cloudID: 'CID2' })) });
  assert.equal((await old.share.enterGroup({ shareTicket: 'TK' })).status, 'ok');
  assert.equal(used, 'TK');
  assert.equal((await mk({ getShareInfo: (o) => o.success({ cloudID: 'C' }) }).share.enterGroup({})).status, 'failed', 'no ticket: no fallback');
  const both = mk({ getGroupEnterInfo: (o) => o.success({ cloudID: 'CID' }), getShareInfo: () => { throw new Error('must not be called'); } });
  assert.equal((await both.share.enterGroup({ shareTicket: 'TK' })).status, 'ok', 'the documented API wins when both exist');
  const noCid = mk({ getGroupEnterInfo: (o) => o.success({}) });
  assert.equal((await noCid.share.enterGroup({})).status, 'failed');
  const notGroup = shareRig({ getGroupEnterInfo: (o) => o.success({ cloudID: 'C' }) });
  notGroup.api.joinGroup = async () => ({ ok: false, code: 'NOT_GROUP' });
  assert.equal((await notGroup.share.enterGroup({})).errCode, 'NOT_GROUP');
});

test('privacy popup: a "not agreed" (104) from the group API asks once through the official popup, then retries', async () => {
  let n = 0;
  const rig = shareRig({ getGroupEnterInfo: (o) => (n++ === 0 ? o.fail({ errno: 104 }) : o.success({ cloudID: 'CID' })) });
  rig.api.joinGroup = async () => ({ ok: true, groupRef: 'g' });
  const privacy = createPrivacy({ wx: { getPrivacySetting: (o) => o.success({ needAuthorization: true }), requirePrivacyAuthorize: (o) => o.success({}) }, analytics: rig.analytics });
  assert.equal((await rig.share.enterGroup({}, { privacy })).status, 'ok');
  const refused = createPrivacy({ wx: { requirePrivacyAuthorize: (o) => o.fail({}) }, analytics: rig.analytics });
  n = 0;
  assert.equal((await rig.share.enterGroup({}, { privacy: refused })).status, 'failed');
  assert.equal(refused.state, 'denied');
});

test('parseEnter: k=/r= cards, fallback share, malformed and empty entries (spec 9.5)', () => {
  assert.equal(parseEnter({ query: { k: 'ABCDEFGHJK' } }).kind, 'invite');
  assert.equal(parseEnter({ query: 'r=ABCDEFGHJK', scene: 1014 }).fromCard, 'notice');
  assert.equal(parseEnter({ query: 'r=ABCDEFGHJK', scene: 1044 }).fromCard, 'reveal');
  assert.equal(parseEnter({ query: 'wxad_fallback_share=1' }).kind, 'fallbackShare');
  assert.equal(parseEnter({ query: 'k=short' }).kind, 'malformed');
  assert.equal(parseEnter({ query: 'k=ABCDEFGHJK&junk=1' }).kind, 'invite');
  assert.equal(parseEnter({ query: 'zzz=1' }).kind, 'malformed');
  assert.equal(parseEnter({ query: 'k=%E0%A4%A' }).kind, 'malformed');
  assert.equal(parseEnter({}).kind, 'none');
  assert.equal(parseEnter(undefined).kind, 'none');
});

function shareRig(wxExtra) {
  const shared = [];
  const menu = [];
  let menuHandler = null;
  const wx = Object.assign(
    {
      shared, menu,
      showShareMenu: (o) => menu.push(['showShareMenu', o]),
      updateShareMenu: (o) => (menu.push(['updateShareMenu', { ...o }]), o.success && o.success()),
      onShareAppMessage: (f) => (menuHandler = f),
      shareAppMessage: (o) => shared.push(o),
      get menuHandler() {
        return menuHandler;
      },
    },
    wxExtra || {}
  );
  const events = [];
  const analytics = { track: (n, p) => events.push([n, p]), events };
  const api = { mode: 'cloud', joinGroup: async () => ({ ok: true, groupRef: 'g' }) };
  return { share: createShare({ wx, api, analytics }), wx, api, analytics };
}

// -------------------------------------------------------------------------------------------------------------- ads

function adsRig(o) {
  o = o || {};
  const clock = { t: Date.UTC(2026, 10, 3, 4) };
  const events = [];
  const handlers = {};
  const instances = [];
  const wx = {
    createRewardedVideoAd: (opts) => {
      instances.push(opts);
      return {
        onClose: (f) => (handlers.close = f), onError: (f) => (handlers.error = f), onLoad: (f) => (handlers.load = f),
        show: () => (o.showFails ? Promise.reject({ errCode: 1004 }) : Promise.resolve()), load: () => (o.loadFails ? Promise.reject({ errCode: 1004 }) : Promise.resolve()),
      };
    },
    createInterstitialAd: () => ({ show: () => (o.interstitialErr ? Promise.reject({ errCode: o.interstitialErr }) : Promise.resolve()) }),
  };
  const store = { state: { noFill: { day: '', start: false, palette: false }, interstitial: { day: '', count: 0, lastAt: 0 } }, save() {} };
  const ads = createAds({ wx, store, analytics: { track: (n, p) => events.push([n, p]) }, now: () => clock.t, adUnits: o.units === undefined ? { rewarded: 'R', interstitial: 'I', banner: 'B' } : o.units, stub: { enabled: !!o.stub, ...(o.sim || {}) } });
  return { ads, clock, events, handlers, instances, store };
}

test('AC 101/103: a rewarded reward only on isEnded === true; closing early grants nothing; the fallback share page is always disabled', async () => {
  const r = adsRig();
  let p = r.ads.rewarded('start');
  await new Promise((s) => setImmediate(s));
  r.handlers.close({ isEnded: false });
  let out = await p;
  assert.deepEqual([out.granted, out.reason, out.toast], [false, 'closedEarly', '完整观看才能获得']);
  p = r.ads.rewarded('start');
  await new Promise((s) => setImmediate(s));
  r.handlers.close({ isEnded: true });
  out = await p;
  assert.deepEqual([out.granted, out.reason], [true, 'ended']);
  assert.equal(r.instances.length, 1, 'one instance');
  assert.equal(r.instances[0].disableFallbackSharePage, true);
  // a load that reports the platform fallback share page is no-fill, never a reward
  p = r.ads.rewarded('palette');
  await new Promise((s) => setImmediate(s));
  r.handlers.load({ useFallbackSharePage: true });
  out = await p;
  assert.equal(out.reason, 'noFillGrant');
});

test('AC 102: on no-fill the reward is granted once per day per placement; the second failure grants nothing; a new Beijing day resets', async () => {
  const r = adsRig({ showFails: true, loadFails: true });
  let out = await r.ads.rewarded('start');
  assert.deepEqual([out.granted, out.reason, out.noFill, out.toast], [true, 'noFillGrant', true, '暂无广告，本次免费']);
  out = await r.ads.rewarded('start');
  assert.deepEqual([out.granted, out.reason, out.toast], [false, 'noFillBlocked', '暂无广告，请稍后再试']);
  out = await r.ads.rewarded('palette');
  assert.equal(out.granted, true, 'a different placement has its own once');
  r.clock.t += 24 * 3600e3;
  out = await r.ads.rewarded('start');
  assert.equal(out.granted, true, 'next day');
  // before 流量主: no unit -> no-fill, nothing is faked
  const none = adsRig({ units: {} });
  assert.equal((await none.ads.rewarded('start')).reason, 'noFillGrant');
  assert.equal((await none.ads.rewarded('start')).reason, 'noFillBlocked');
  assert.equal(none.ads.interstitialDue({ lifetimeReveals: 99 }), false);
});

test('AC 104: interstitial caps: not before the 3rd lifetime reveal, >= 180 s apart, <= 3 a day; 2001-2003 are skipped silently and not counted', async () => {
  const r = adsRig();
  r.ads.setInterstitialConfig({ enabled: true, minLifetimeReveals: 3, minGapSec: 180, maxPerDay: 3 });
  assert.equal(r.ads.interstitialDue({ lifetimeReveals: 2 }), false, 'before the 3rd reveal');
  assert.equal(await r.ads.interstitial({ lifetimeReveals: 2 }), false);
  assert.equal(await r.ads.interstitial({ lifetimeReveals: 3 }), true);
  assert.equal(r.ads.interstitialDue({ lifetimeReveals: 4 }), false, 'gap');
  r.clock.t += 179e3;
  assert.equal(r.ads.interstitialDue({ lifetimeReveals: 4 }), false);
  r.clock.t += 2e3;
  assert.equal(await r.ads.interstitial({ lifetimeReveals: 4 }), true);
  r.clock.t += 200e3;
  assert.equal(await r.ads.interstitial({ lifetimeReveals: 5 }), true);
  r.clock.t += 200e3;
  assert.equal(r.ads.interstitialDue({ lifetimeReveals: 6 }), false, 'the 4th today');
  r.clock.t += 24 * 3600e3;
  assert.equal(r.ads.interstitialDue({ lifetimeReveals: 6 }), true, 'next day');
  const e = adsRig({ interstitialErr: 2002 });
  assert.equal(await e.ads.interstitial({ lifetimeReveals: 5 }), false);
  assert.equal(e.store.state.interstitial.count, 0, 'not counted');
  assert.equal(e.events.some(([n]) => n === 'ad_show' || n === 'interstitial_show'), false);
  assert.ok(e.events.some(([n, p]) => n === 'ad_error' && p.errCode === 2002));
  // remote config can switch it off
  r.ads.setInterstitialConfig({ enabled: false, minLifetimeReveals: 0, minGapSec: 120, maxPerDay: 4 });
  assert.equal(r.ads.interstitialDue({ lifetimeReveals: 99 }), false);
});

test('ads stub mode: a 3 s test overlay; complete grants, skip does not; QA can simulate errors', async () => {
  const r = adsRig({ stub: true, units: {} });
  const p = r.ads.rewarded('start');
  assert.equal(r.ads.overlay.kind, 'rewarded');
  assert.equal(r.ads.stubComplete(), false, 'not before 3 s');
  r.clock.t += 3000;
  assert.equal(r.ads.stubComplete(), true);
  assert.equal((await p).granted, true);
  const q = r.ads.rewarded('palette');
  r.ads.stubSkip();
  assert.equal((await q).granted, false);
  const s = adsRig({ stub: true, units: {}, sim: { rewardedError: 1004 } });
  assert.equal((await s.ads.rewarded('start')).reason, 'noFillGrant');
});

test('ads banner: only through bannerShow with a unit; hidden/destroyed on request; never in stub mode', () => {
  const made = [];
  const wx = { createBannerAd: (o) => (made.push(o), { onError() {}, onLoad() {}, onResize() {}, show: () => Promise.resolve(), hide() {}, destroy() {}, style: {} }) };
  const store = { state: { noFill: {}, interstitial: {} }, save() {} };
  const ads = createAds({ wx, store, analytics: { track() {} }, adUnits: {}, stub: { enabled: false } });
  assert.equal(ads.bannerShow({ unitId: null, left: 16, width: 343, bottomEdge: 600 }), false);
  assert.equal(ads.bannerShow({ unitId: 'B', left: 16, width: 343, bottomEdge: 600 }), true);
  assert.equal(made.length, 1);
  ads.bannerHide();
  assert.equal(ads.bannerActive, false);
  ads.bannerDestroy();
  const stub = createAds({ wx, store, analytics: { track() {} }, adUnits: {}, stub: { enabled: true } });
  assert.equal(stub.bannerShow({ unitId: 'B', left: 16, width: 343, bottomEdge: 600 }), false);
});

// ---------------------------------------------------------------------------------------------------------- subscribe

test('AC 100: the subscribe offer needs a template, a tap, and is never offered again for a chain after a refusal', async () => {
  const mem = { state: { subscribe: { banned: false, granted: {}, declined: {} } }, save() {} };
  const calls = [];
  let result = 'accept';
  const wx = { requestSubscribeMessage: (o) => (calls.push(o.tmplIds), o.success({ [o.tmplIds[0]]: result })) };
  const api = { subscribeReveal: async (d) => (calls.push(d), { ok: true }) };
  const sub = createSubscribe({ wx, api, store: mem, analytics: { track() {} } });
  assert.equal(sub.stateFor({ subscribe: null }, 'ABCDEFGHJK'), 'hidden', 'no template: the button never shows');
  assert.equal(sub.stateFor({ subscribe: { tmplId: 'T' } }, 'ABCDEFGHJK'), 'offer');
  assert.equal(calls.length, 0, 'nothing is requested until the tap');
  result = 'reject';
  assert.equal(await sub.request({ subscribe: { tmplId: 'T' } }, 'ABCDEFGHJK'), 'declined');
  assert.equal(sub.stateFor({ subscribe: { tmplId: 'T' } }, 'ABCDEFGHJK'), 'declined', 'never again for that chain');
  assert.equal(sub.stateFor({ subscribe: { tmplId: 'T' } }, 'ABCDEFGHJL'), 'offer', 'other chains still offer');
  result = 'accept';
  assert.equal(await sub.request({ subscribe: { tmplId: 'T' } }, 'ABCDEFGHJL'), 'granted');
  assert.deepEqual(calls[calls.length - 1], { chainId: 'ABCDEFGHJL' }, 'one grant per chain');
  assert.equal(sub.stateFor({ subscribe: { tmplId: 'T' } }, 'ABCDEFGHJL'), 'granted');
  // ban hides it for good on this device
  result = 'ban';
  assert.equal(await sub.request({ subscribe: { tmplId: 'T' } }, 'ABCDEFGHJM'), 'declined');
  assert.equal(sub.stateFor({ subscribe: { tmplId: 'T' } }, 'ABCDEFGHJN'), 'hidden');
  // a platform failure stores nothing
  const wx2 = { requestSubscribeMessage: (o) => o.fail({ errCode: 10001 }) };
  const sub2 = createSubscribe({ wx: wx2, api, store: { state: { subscribe: { banned: false, granted: {}, declined: {} } }, save() {} }, analytics: { track() {} } });
  assert.equal(await sub2.request({ subscribe: { tmplId: 'T' } }, 'ABCDEFGHJK'), 'unavailable');
  assert.equal(sub2.stateFor({ subscribe: { tmplId: 'T' } }, 'ABCDEFGHJK'), 'offer');
});

// ---------------------------------------------------------------------------------------------------------- keyboard

test('keyboard: the system keyboard when available; wx.showModal({editable}) when the keyboard API is missing (V4 fallback)', () => {
  const log = [];
  let onInput = null;
  const kb = createKeyboard({ showKeyboard: (o) => log.push(['show', o.defaultValue]), hideKeyboard: () => log.push(['hide']), onKeyboardInput: (f) => (onInput = f), onKeyboardConfirm() {}, onKeyboardComplete() {} });
  const got = [];
  assert.equal(kb.open({ value: 'ab', onInput: (v) => got.push(v) }), 'keyboard');
  onInput({ value: 'abc' });
  assert.deepEqual(got, ['abc']);
  kb.close();
  assert.deepEqual(log, [['show', 'ab'], ['hide']]);
  const modal = [];
  const kb2 = createKeyboard({ showModal: (o) => (modal.push(o), o.success({ confirm: true, content: '猫' })) });
  const got2 = [];
  assert.equal(kb2.open({ value: '', placeholder: '你觉得这画的是什么？', onInput: (v) => got2.push(v), onConfirm: (v) => got2.push('ok:' + v) }), 'modal');
  assert.equal(modal[0].editable, true);
  assert.deepEqual(got2, ['猫', 'ok:猫']);
  assert.equal(createKeyboard({}).open({ onInput() {} }), 'unavailable');
  const thrower = createKeyboard({ showKeyboard: () => { throw new Error('no'); }, showModal: () => {} });
  assert.equal(thrower.open({ onInput() {} }), 'modal');
});

test('privacy: the 隐私保护指引 opens on a tap; a missing API reports unavailable', async () => {
  const p = createPrivacy({ wx: { openPrivacyContract: (o) => o.success({}) }, analytics: { track() {} } });
  assert.equal(await p.openContract(), 'opened');
  assert.equal(await createPrivacy({ wx: {}, analytics: { track() {} } }).openContract(), 'unavailable');
  assert.equal(await createPrivacy({ wx: { openPrivacyContract: (o) => o.fail({}) }, analytics: { track() {} } }).openContract(), 'unavailable');
  assert.equal(p.isPrivacyError({ errno: 104 }), true);
  assert.equal(strokesLib.REPLAY_MS, 2500);
});
