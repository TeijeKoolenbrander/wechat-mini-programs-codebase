'use strict';
// Client platform tests: analytics (AC 77), raw openids never reach the client (AC 49), content feedback (AC 79), the
// guarded store, remote features, and the view-model shapes of spec 10.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const EV = require('../core/events');
const { installClueServer, core: clueCore } = require('./clue-fake');
const { getServerContent: getContent } = require('../core/content');
const { sanitize, fresh, KEY, createStore } = require('../js/store');
const { normalizeFeatures } = require('../js/features');
const { createAnalytics } = require('../js/analytics');
const { CONFIG } = require('../core/config');
const { boot, BJ } = require('./harness');

const content = getContent();
const D1 = BJ(2026, 11, 1, 10, 0, 0);
const ADS = { adUnits: { rewarded: 'rw-1', interstitial: 'in-1' } };
const GROUP_ENTRY = { scene: 1044, query: { s: 'd' }, shareTicket: 'TICKET-77' };
const MIN = 60e3;

async function ready(t, opts) {
  const h = await boot(t, opts);
  if (h.has('sheet:close')) await h.tap('sheet:close');
  return h;
}

// ---- AC 77 ----------------------------------------------------------------------------------------------------------------------

test('AC 77: every client event of spec 12 fires with its required props, a top-level sessionId and clientTs; wx.reportEvent is never used', async (t) => {
  const rw = { mode: 'end' };
  const h = await ready(t, { now: D1, enter: GROUP_ENTRY, build: ADS, rewarded: rw, privacy: {}, interstitial: {} });
  h.srv.appConfig = { subscribe: { tmplId: 'TPL' }, ads: { banner: { enabled: true, adUnitId: 'bn-1' } } };
  const fake = installClueServer(h);
  await h.seedDays(10, 0);
  for (const m of ['m0', 'm1']) {
    h.joinOther(m);
    h.otherDaily(m, [20, 30, 40, 50, 60]);
  }
  await h.playDaily([25, 35, 45, 55, 65]); // daily_card_place/reveal/complete, daily_result_view, marker_write
  await h.tap('result:share'); // share_tap
  await h.tap('result:group'); // group_view, privacy_result, friend_scope_result
  await h.tap('board:back');
  await h.tap('result:friends'); // friend_board_view
  await h.tap('board:back');
  await h.tap('result:bonus'); // ad_request/show/reward, bonus_card
  await h.answer(50);
  await h.tap('card:report');
  await h.tap('report:typo'); // card_report
  await h.tap('card:primary');
  rw.mode = 'early';
  await h.tap('result:bonus'); // ad_close_early
  rw.mode = 'end';
  await h.tap('result:distribution'); // distribution_unlock
  await h.tap('sheet:close');
  await h.tap('result:back');
  await h.tap('home:settings');
  await h.tap('settings:largeText'); // display_setting
  await h.tap('settings:largeText');
  await h.tap('sheet:close');
  await h.tap('home:howto'); // howto_view (manual)
  await h.tap('sheet:close');
  await h.tap('home:archive'); // archive_view (+ banner ad_request)
  for (const d of ['20261110', '20261109', '20261108', '20261107']) {
    await h.archiveSet(d, [10, 30, 50, 70, 90]); // archive_set_complete
    await h.tap('archive:backList'); // interstitial_show on the 2nd set (lifetime >= 3)
  }
  await h.tap('archive:back');
  await h.tap('home:host');
  await h.tap('create:spectrum:' + h.view().vm.spectra[0].id); // round_create
  // the typed clue (D-2): the 发言规则 sheet, one local rejection, one mock risky, one pass; tab events
  await h.tap('create:input'); // rules_view
  await h.tap('rules:agree'); // rules_agree
  await h.kb.type('70');
  h.ctl.K.handlers['create:share'](); // clue_result rejected (the button is disabled; the handler checks locally)
  await h.settle();
  await h.tap('create:toPreset'); // clue_tab
  await h.tap('create:tab:text'); // clue_tab
  await h.tap('create:input');
  await h.kb.type('测试违规');
  await h.tap('create:share'); // clue_result blocked
  const { left: kl, right: kr } = h.view().vm.chosen;
  const okClue = ['冬天的被窝', '一杯奶茶', '外婆家的饭', '千层饼'].find((x) => clueCore.checkClue(x, { leftLabel: kl, rightLabel: kr }).ok);
  await h.tap('create:input');
  await h.kb.type(okClue);
  await h.tap('create:share'); // clue_result pass, round_clue, share_tap
  await h.tap('round:subscribe'); // subscribe_offer, subscribe_result
  const rid = h.st.round.roundId;
  const other = content.spectra[9];
  const r = h.srv.callAs('bob', 'createRound', { spectrumId: other.id });
  h.legacyChat('bob', r.roundId);
  await h.show({ scene: 1007, query: { r: r.roundId } }); // card_open, round_view
  await h.place(40);
  await h.tap('round:primary'); // round_guess
  const tr = h.srv.callAs('cat', 'createRound', { spectrumId: other.id });
  fake.state.rulesVersion = 1;
  assert.equal(fake.callAs('cat', 'setClue', { roundId: tr.roundId, clueMode: 'text', clueText: '千层饼' }).ok, true);
  await h.show({ scene: 1007, query: { r: tr.roundId } });
  await h.tap('round:report');
  await h.tap('clueReport:reason:ads');
  await h.tap('clueReport:submit'); // clue_report
  rw.mode = 'error';
  h.srv.offline = true;
  await h.tap('round:home'); // error (getDaily offline)
  h.srv.offline = false;
  assert.ok(rid);

  const all = h.app.analytics.sent.concat(h.app.analytics.queue); // the 20 s timer has flushed part of them already
  const names = new Set(all.map((e) => e.name));
  const missing = EV.CLIENT_EVENT_NAMES.filter((n) => !names.has(n) && n !== 'ad_error');
  assert.deepEqual(missing, [], 'every client event fired');
  // ad_error: a rewarded no-fill
  await h.tap('result:back').catch(() => {});
  assert.deepEqual(h.app.analytics.invalid, [], 'required props present on every event');

  // fires once per trigger
  const q = all;
  const count = (n, f) => q.filter((e) => e.name === n && (!f || f(e.props))).length;
  assert.equal(count('session_start'), 1);
  assert.equal(count('daily_complete'), 1);
  assert.equal(count('daily_card_reveal', (p) => p.dateKey === '20261111'), 5);
  assert.equal(count('daily_card_place', (p) => p.dateKey === '20261111'), 5);
  assert.equal(count('daily_result_view'), 1);
  assert.equal(count('archive_set_complete'), 4);
  assert.equal(count('interstitial_show'), 1);
  assert.equal(count('howto_view', (p) => p.auto === true), 1);
  assert.equal(count('howto_view', (p) => p.auto === false), 1);
  assert.equal(count('round_create'), 1);
  assert.equal(count('bonus_card'), 1);
  assert.equal(count('card_report'), 1);
  assert.equal(count('display_setting'), 2);
  const complete = q.find((e) => e.name === 'daily_complete').props;
  assert.equal(complete.hasGroup, true);
  assert.equal(typeof complete.total, 'number');
  assert.equal(typeof complete.durationMs, 'number');
  // common props
  q.forEach((e) => {
    assert.equal(typeof e.props.isNewUser, 'boolean');
    assert.equal(e.props.contentVersion, content.contentVersion);
    assert.equal(typeof e.props.appVersion, 'string');
  });

  // through the track function: a top-level sessionId and clientTs on every stored event
  await h.flush();
  await h.flush();
  const stored = h.srv.db.events;
  assert.equal(stored.length, q.length, 'every event reached the server exactly once');
  assert.ok(stored.every((e) => typeof e.sessionId === 'string' && e.sessionId.length > 0 && typeof e.clientTs === 'number'));
  assert.ok(stored.every((e) => EV.CLIENT_EVENT_NAMES.includes(e.name)));
  assert.equal(new Set(stored.map((e) => e.sessionId)).size, 1);
  const flat = JSON.stringify(stored.map((e) => e.props));
  assert.ok(!/TICKET-77|mock-group|groupRef|openid|openGId/i.test(flat), 'events never carry a group id, groupRef, ticket or openid');
  // wx.reportEvent is not used anywhere
  assert.equal(typeof h.wx.reportEvent, 'undefined');
});

test('AC 77: a failed track batch is kept and retried; batches hold at most 50 events', async () => {
  const sent = [];
  let fail = true;
  const api = { track: (b) => { sent.push(b); return Promise.resolve(fail ? { ok: false, code: 'NETWORK' } : { ok: true }); } };
  const store = { state: fresh(), save() {} };
  const a = createAnalytics({ api, store, config: CONFIG, contentVersion: 1, now: () => 5 });
  for (let i = 0; i < 120; i++) a.track('howto_view', { auto: false });
  assert.equal(a.track('not_an_event', {}), false);
  assert.ok(a.invalid.length === 1);
  await a.flush();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].events.length, 50);
  assert.equal(a.queue.length, 120, 'nothing lost on failure');
  fail = false;
  await a.flush();
  assert.equal(a.queue.length, 0);
  assert.ok(sent.every((b) => b.events.length <= 50));
  assert.ok(sent.every((b) => b.events.every((e) => typeof e.clientTs === 'number')));
  assert.equal(a.track('group_join', { result: 'ok', scene: 1, groupRef: 'abc', groupid: 'x', openid: 'y', shareTicket: 'z' }), true);
  assert.deepEqual(Object.keys(a.queue[0].props).sort(), ['appVersion', 'contentVersion', 'isNewUser', 'result', 'scene']);
});

// ---- AC 49 ----------------------------------------------------------------------------------------------------------------------

test('AC 49: raw openids and group ids never reach the client in a scripted session; hashes differ between dates and rounds', async (t) => {
  const h = await ready(t, { now: D1, enter: GROUP_ENTRY, privacy: {} });
  const ME = h.srv.ME;
  const seen = [];
  const orig = h.srv.callAs;
  h.srv.callAs = (o, n, d) => {
    const r = orig(o, n, d);
    if (o === ME) seen.push({ name: n, json: JSON.stringify(r) });
    return r;
  };
  await h.seedDays(2, 0);
  for (const m of ['oid-zzz-bob', 'oid-zzz-cat', 'oid-zzz-dan']) {
    h.joinOther(m);
    h.otherDaily(m, [20, 30, 40, 50, 60]);
  }
  await h.playDaily([25, 35, 45, 55, 65]);
  await h.tap('result:group');
  await h.tap('board:back');
  await h.tap('result:friends');
  await h.tap('board:back');
  await h.tap('result:host');
  await h.tap('create:spectrum:' + h.view().vm.spectra[0].id);
  await h.pickPreset();
  const rid = h.st.round.roundId;
  h.srv.callAs('oid-zzz-bob', 'submitGuess', { roundId: rid, pos: 30 });
  h.srv.callAs('oid-zzz-cat', 'submitGuess', { roundId: rid, pos: 50 });
  h.ctl.K.handlers['round:retry']();
  await h.settle();
  await h.tap('round:reveal');
  const sp = content.spectra[5];
  const r2 = h.srv.callAs('oid-zzz-dan', 'createRound', { spectrumId: sp.id });
  h.legacyChat('oid-zzz-dan', r2.roundId);
  await h.show({ scene: 1007, query: { r: r2.roundId } });
  await h.place(70);
  await h.tap('round:primary');
  h.srv.callAs('oid-zzz-dan', 'submitGuess', { roundId: r2.roundId, pos: 1 }); // (rejected: own round) harmless
  h.srv.callAs('oid-zzz-bob', 'submitGuess', { roundId: r2.roundId, pos: 20 });
  h.srv.callAs('oid-zzz-dan', 'revealRound', { roundId: r2.roundId });
  const g1 = h.srv.callAs(ME, 'getRound', { roundId: rid }).reveal;
  const g2 = h.srv.callAs(ME, 'getRound', { roundId: r2.roundId }).reveal;
  assert.notEqual(g1.selfHash, g2.selfHash, 'a different hash in a different round');
  const day1 = h.srv.callAs(ME, 'getFriendBoard', { dateKey: '20261103' }).selfHash;
  h.advance(24 * 3600e3);
  await h.show();
  const day2 = h.srv.callAs(ME, 'getFriendBoard', { dateKey: '20261104' }).selfHash;
  assert.notEqual(day1, day2, 'a different hash on a different date');

  const all = seen.map((s) => s.json).join('\n');
  assert.ok(seen.length > 15);
  assert.ok(!/oid-zzz|mock-openid|mock-group|cloud-id/.test(all), 'no openid or group id in any response');
  assert.ok(!/"(openid|openGId|opengid|openGid)"/i.test(all), 'no openid / openGId field in any response');
  const posted = JSON.stringify(h.log.posted);
  assert.ok(!/oid-zzz|mock-openid|mock-group|TICKET-77.*opengid|"openid"/.test(posted.replace(/"shareTicket":"TICKET-77"/g, '')), 'no openid in any postMessage');
  const evs = JSON.stringify(h.app.analytics.queue.map((e) => e.props));
  assert.ok(!/oid-zzz|mock-openid|mock-group|TICKET-77|groupRef/i.test(evs));
  const gd = seen.find((s) => s.name === 'getGroupDay');
  assert.ok(gd && !/"groupRef"/.test(gd.json.replace(/"groupRef":"[0-9a-f]{16}"/, '')), 'a response never echoes the group id');
});

// ---- AC 79 ----------------------------------------------------------------------------------------------------------------------

test('AC 79: 这张卡有问题 offers exactly three reasons and no text field, stores a card_reports row, is limited to 10 a day, and grants nothing', async (t) => {
  const h = await ready(t);
  await h.tap('home:daily');
  await h.answer(40);
  assert.ok(h.has('card:report'));
  await h.tap('card:report');
  const ids = h.ids().filter((x) => /^report:/.test(x)).sort();
  assert.deepEqual(ids, ['report:ambiguous', 'report:cancel', 'report:typo', 'report:unsuitable']);
  assert.ok(!h.ids().some((x) => /input|text|keyboard/i.test(x)));
  await h.tap('report:cancel');
  assert.equal(h.srv.db.reports.length, 0);
  const before = JSON.stringify({ s: JSON.parse(h.storage.kd_state_v1), r: h.srv.db.entries });
  await h.tap('card:report');
  await h.tap('report:ambiguous');
  assert.equal(h.srv.db.reports.length, 1);
  assert.equal(h.srv.db.reports[0].reason, 'ambiguous');
  assert.equal(h.srv.db.reports[0].itemId, h.view().vm.card.itemId);
  assert.deepEqual(Object.keys(h.srv.db.reports[0]).sort(), ['dateKey', 'itemId', 'openid', 'reason', 'ts'], 'no text field is stored');
  assert.match(h.lastText(), /谢谢，我们会尽快查看/);
  assert.equal(JSON.stringify({ s: JSON.parse(h.storage.kd_state_v1), r: h.srv.db.entries }), before, 'grants nothing');
  for (let i = 0; i < 9; i++) {
    await h.tap('card:report');
    await h.tap('report:typo');
  }
  assert.equal(h.srv.db.reports.length, 10);
  await h.tap('card:report');
  await h.tap('report:typo');
  assert.equal(h.srv.db.reports.length, 10, 'the 11th is refused');
  assert.match(h.lastText(), /操作太频繁，请稍后再试/);
});

// ---- the store ------------------------------------------------------------------------------------------------------------------

test('store: corrupt, truncated or hand-edited storage never throws and falls back field by field', () => {
  const mk = (raw) => {
    const wx = { getStorageSync: () => raw, setStorageSync() {} };
    return createStore(wx).state;
  };
  assert.deepEqual(mk('{not json'), fresh());
  assert.deepEqual(mk(12345), fresh());
  assert.deepEqual(mk(null), fresh());
  assert.deepEqual(mk('[]'), fresh());
  assert.deepEqual(mk(JSON.stringify({ v: 2, muted: true })), fresh(), 'an unknown version is ignored');
  const hostile = {
    v: 1, muted: 'yes', howtoSeen: 1, firstDate: 'tomorrow', lifetimeSets: -5, display: { largeText: 'x' },
    pending: { dateKey: '20261105', idx: 9, pos: 50 }, viewing: { dateKey: 5, idx: 1 },
    archivePlays: { '20261103': { total: 9999, positions: [1, 2, 3, 4, 5], at: 1 }, bad: {}, '20261104': { total: 100, positions: [1, 2, 3, 4, 500], at: 1 }, '20261105': { total: 321, positions: [1, 2, 3, 4, 5], at: 'x' } },
    playedItems: ['s001i01', 'nope', 42, 's002i03'],
    interstitial: { day: 7, count: 'many', lastAt: -1 },
    privacy: { privacy: 'maybe', friendScope: 'granted', markerPending: { d: '20261105', s: 9999 } },
    subscribe: { banned: 'true', granted: { ABCDEFGH: true, bad: true }, declined: [] },
    unlocks: { day: '20261105', keys: { '20261105': true, x: true } },
    archiveCache: { items: [{ dateKey: '20261104', issueNo: 4 }, { dateKey: 'x' }, null], bestStreak: 'a', hasMore: 1, at: 1 },
  };
  const s = mk(JSON.stringify(hostile));
  assert.equal(s.muted, false);
  assert.equal(s.howtoSeen, false);
  assert.equal(s.firstDate, null);
  assert.equal(s.lifetimeSets, 0);
  assert.deepEqual(s.display, { largeText: false, highContrast: false });
  assert.equal(s.pending, null, 'idx out of range');
  assert.equal(s.viewing, null);
  assert.deepEqual(Object.keys(s.archivePlays), ['20261105'], 'invalid plays dropped: total > 500, bad shape, position > 100 (a bad timestamp only resets to 0)');
  assert.equal(s.playedItems.length, 2);
  assert.deepEqual(s.interstitial, { day: '', count: 0, lastAt: 0 });
  assert.equal(s.privacy.privacy, 'unknown');
  assert.equal(s.privacy.friendScope, 'granted');
  assert.equal(s.privacy.markerPending, null);
  assert.equal(s.subscribe.banned, false);
  assert.deepEqual(s.subscribe.granted, { ABCDEFGH: true });
  assert.deepEqual(s.unlocks.keys, { '20261105': true });
  assert.equal(s.archiveCache.items.length, 1);
  assert.equal(s.archiveCache.bestStreak, 0);
  // a valid state round-trips
  const good = fresh();
  good.muted = true;
  good.pending = { dateKey: '20261105', idx: 2, pos: 40 };
  good.archivePlays['20261103'] = { total: 250, positions: [1, 2, 3, 4, 5], at: 5 };
  assert.deepEqual(sanitize(JSON.parse(JSON.stringify(good))), good);
  assert.equal(KEY, 'kd_state_v1');
});

test('store: a corrupt save at boot does not stop the game (guarded parse in main.js)', async (t) => {
  const h = await boot(t, { storage: { kd_state_v1: '{"v":1,"pending":{"dateKey":"zz"},"muted":' } });
  assert.equal(h.screen(), 'home');
  assert.equal(h.view().vm.daily.state, 'available');
});

// ---- remote features --------------------------------------------------------------------------------------------------------------

test('features: remote config is normalised and clamped; anything missing is safe (subscribe hidden, banner off)', () => {
  const none = normalizeFeatures(undefined);
  assert.equal(none.subscribe, null);
  assert.deepEqual(none.banner, { enabled: false, adUnitId: null });
  assert.deepEqual(none.interstitial, { enabled: true, everyNSets: 2, minLifetimeSets: 3, minGapSec: 120, maxPerDay: 6 });
  const f = normalizeFeatures({ subscribe: { tmplId: 'T' }, banner: { enabled: true, adUnitId: 'B' }, interstitial: { everyNSets: 0, minGapSec: 5, maxPerDay: 50, enabled: true } });
  assert.deepEqual(f.subscribe, { tmplId: 'T' });
  assert.deepEqual(f.banner, { enabled: true, adUnitId: 'B' });
  assert.deepEqual(f.interstitial, { enabled: true, everyNSets: 2, minLifetimeSets: 3, minGapSec: 60, maxPerDay: 8 });
  assert.equal(normalizeFeatures({ banner: { enabled: true } }).banner.enabled, false, 'no unit id, no banner');
  assert.equal(normalizeFeatures({ ads: { banner: { enabled: 'yes', adUnitId: 'B' } } }).banner.enabled, false);
  assert.equal(normalizeFeatures({ subscribe: { tmplId: '' } }).subscribe, null);
});

// ---- spec 10 shapes -------------------------------------------------------------------------------------------------------------------

const KEYS = {
  home: ['daily', 'group', 'muted', 'showHowToOnce', 'display', 'features'],
  homeDaily: ['state', 'issueNo', 'dateKey', 'answered', 'scoreText', 'yesterdayText', 'streakText'],
  card: ['mode', 'index', 'total', 'tag', 'card', 'phase', 'needle', 'canConfirm', 'reveal', 'primaryLabel'],
  reveal: ['markers', 'label', 'scoreText', 'nationText', 'agreeText', 'groupText', 'bullseye'],
  result: ['issueNo', 'final', 'totalText', 'bandLabel', 'statusTag', 'percentileText', 'rows', 'divisiveText', 'streakText', 'groupText', 'bonus', 'distribution'],
  row: ['prompt', 'left', 'right', 'you', 'nation', 'label', 'scoreText'],
  create: ['step', 'spectra', 'freeSwapLeft', 'adSwapLeft', 'roundId', 'targetBand', 'clueMode', 'clueOptions', 'clueItemId', 'canShare'],
  round: ['status', 'isHost', 'left', 'right', 'clueText', 'guessCountText', 'canReveal', 'revealHint', 'myGuess', 'late', 'reveal', 'subscribe'],
  group: ['state', 'issueNo', 'mqText', 'countText', 'divisiveText', 'trend', 'rounds', 'banner'],
  friend: ['state', 'mode', 'issueNo', 'selfText', 'banner'],
  list: ['state', 'bestStreakText', 'hasMore', 'items'],
  review: ['state', 'dateKey', 'issueNo', 'kind', 'cards', 'finals', 'mine'],
};
const has = (o, keys, label) => keys.forEach((k) => assert.ok(k in o, label + ' lacks ' + k));

test('spec 10: the view models carry exactly the fields of the contract (home, card, result, create, round, group, friend, archive)', async (t) => {
  const h = await ready(t, { now: D1, enter: GROUP_ENTRY });
  await h.seedDays(3, 0);
  h.joinOther('a');
  h.joinOther('b');
  has(h.view().vm, KEYS.home, 'home');
  has(h.view().vm.daily, KEYS.homeDaily, 'home.daily');
  assert.equal(typeof h.view().vm.muted, 'boolean');
  await h.tap('home:daily');
  has(h.view().vm, KEYS.card, 'card');
  assert.equal(h.view().vm.issueNo, 4);
  await h.answer(50);
  has(h.view().vm.reveal, KEYS.reveal, 'reveal');
  assert.match(h.view().vm.reveal.markers[0].kind, /nation|group|member|you/);
  await h.tap('card:primary');
  for (let i = 1; i < 5; i++) {
    await h.answer(20 + i * 10);
    await h.tap('card:primary');
  }
  has(h.view().vm, KEYS.result, 'result');
  h.view().vm.rows.forEach((r) => has(r, KEYS.row, 'row'));
  assert.deepEqual(Object.keys(h.view().vm.bonus).sort(), ['adState', 'left']);
  await h.tap('result:host');
  has(h.view().vm, KEYS.create, 'create');
  assert.equal(h.view().vm.spectra.length, 3);
  assert.deepEqual(Object.keys(h.view().vm.chosen), ['left', 'right']);
  await h.tap('create:back');
  await h.tap('home:group');
  has(h.view().vm, KEYS.group, 'group');
  assert.equal(h.view().vm.kind, 'group');
  await h.tap('board:back');
  await h.tap('home:friends');
  has(h.view().vm, KEYS.friend, 'friend');
  assert.equal(h.view().vm.kind, 'friend');
  await h.tap('board:back');
  await h.tap('home:archive');
  has(h.view().vm, KEYS.list, 'archive list');
  assert.equal(h.view().vm.kind, 'list');
  const id = hostedBy(h, 'bob');
  await h.show({ scene: 1007, query: { r: id } });
  has(h.view().vm, KEYS.round, 'round');
  assert.deepEqual(Object.keys(h.view().vm.subscribe), ['state']);
});

function hostedBy(h, openid) {
  const sp = content.spectra[0];
  const r = h.srv.callAs(openid, 'createRound', { spectrumId: sp.id });
  h.srv.callAs(openid, 'setClue', { roundId: r.roundId, clueMode: 'preset', clueItemId: sp.items[0].id });
  return r.roundId;
}

test('spec 10: the archive review vm carries kind, cards, finals and mine', async (t) => {
  const h = await ready(t, { now: D1 });
  await h.seedDays(2, 0);
  await h.playDaily([10, 20, 30, 40, 50]);
  await h.tap('result:back');
  h.advance(24 * 3600e3 - 10 * 3600e3 + 31 * MIN);
  await h.show();
  await h.tap('home:archive');
  await h.tap('archive:item:20261103');
  has(h.view().vm, KEYS.review, 'review');
  assert.equal(h.view().vm.kind, 'review');
});

// ---- render contract (stub renderer) ------------------------------------------------------------------------------------------------

test('contract: the stub renderer emits only hit ids listed in js/render/CONTRACT.md or agreed since (scroll ids)', async (t) => {
  const contract = fs.readFileSync(path.join(__dirname, '..', 'js', 'render', 'CONTRACT.md'), 'utf8');
  const ok = (id) =>
    /:block$|^sheet:(body|scrim)$|^coach:block$/.test(id) ||
    ['card:scroll', 'create:scroll', 'board:scroll'].includes(id) ||
    contract.includes('`' + id + '`') ||
    /^(create:spectrum:|create:clue:|archive:item:|board:round:)/.test(id);
  const h = await ready(t, { now: D1 });
  await h.seedDays(3, 0);
  const bad = new Set();
  const look = () => h.ids().forEach((id) => ok(id) || bad.add(id));
  look();
  await h.tap('home:daily');
  look();
  await h.place(50);
  look();
  await h.tap('card:primary');
  look();
  await h.tap('card:report');
  look();
  await h.tap('report:cancel');
  await h.tap('card:back');
  await h.tap('home:host');
  look();
  await h.tap('create:spectrum:' + h.view().vm.spectra[0].id);
  look();
  await h.pickPreset();
  look();
  await h.tap('round:back');
  await h.tap('home:archive');
  look();
  await h.tap('archive:item:20261103');
  look();
  assert.deepEqual([...bad], []);
});
