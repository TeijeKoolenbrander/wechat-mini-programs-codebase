'use strict';
// Units for the js/ modules that do not need the whole game: ads, share, privacy, analytics, api, mock server rules.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAds } = require('../js/ads');
const { createAnalytics, EVENTS } = require('../js/analytics');
const { createPrivacy } = require('../js/privacy');
const { createApi } = require('../js/api');
const { createStore } = require('../js/store');
const { parseEnter, parseQuery, dailyTitle, freeTitle, challengeTitle, resultQuery, challengeQuery } = require('../js/share');
const { createMockServer } = require('../js/mock-server');
const { getConfig } = require('../core/config');
const { beijingDateKey, addDays, dateKeyToMs, DAY_MS } = require('../core/date');
const { findForbidden } = require('../core/forbidden');
const V = require('../js/vm');

const config = getConfig(1);

function fakeAnalytics() {
  const log = [];
  return { log, track: (n, p) => log.push([n, p]), names: () => log.map((x) => x[0]) };
}

function mkStore() {
  return createStore({ getStorageSync: () => null, setStorageSync() {} });
}

function realAds(t, over) {
  const created = [];
  let clock = Date.UTC(2026, 10, 20, 4, 0, 0);
  const handlers = {};
  const wx = {
    createRewardedVideoAd: (o) => {
      created.push(['rewarded', o]);
      return {
        onClose: (f) => (handlers.close = f),
        onError: (f) => (handlers.error = f),
        onLoad: (f) => (handlers.load = f),
        show: () => (over && over.showFails ? Promise.reject({ errCode: 1004 }) : Promise.resolve()),
        load: () => (over && over.loadFails ? Promise.reject({ errCode: 1004 }) : Promise.resolve()),
      };
    },
    createInterstitialAd: (o) => {
      created.push(['interstitial', o]);
      return { show: () => (over && over.interstitialError ? Promise.reject({ errCode: over.interstitialError }) : Promise.resolve()) };
    },
    createBannerAd: (o) => {
      created.push(['banner', o]);
      return { show() {}, hide() {}, destroy() {}, onError() {} };
    },
  };
  const an = fakeAnalytics();
  const store = mkStore();
  const ads = createAds({ wx, config, store, analytics: an, adUnits: { rewarded: 'r1', interstitial: 'i1', banner: 'b1' }, stub: { enabled: false }, now: () => clock });
  return { ads, created, handlers, an, store, tick: (ms) => (clock += ms) };
}

test('rewarded: created with disableFallbackSharePage, reward only on isEnded (AC 44)', async () => {
  const { ads, created, handlers } = realAds();
  let p = ads.rewarded('continue', 'run1');
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(created[0], ['rewarded', { adUnitId: 'r1', disableFallbackSharePage: true }]);
  handlers.close({ isEnded: true });
  let out = await p;
  assert.equal(out.granted, true);
  assert.equal(out.reason, 'ended');
  p = ads.rewarded('continue', 'run2');
  await new Promise((r) => setImmediate(r));
  handlers.close({ isEnded: false });
  out = await p;
  assert.equal(out.granted, false);
  assert.equal(out.toast, '完整观看才能继续');
  assert.equal(created.filter((c) => c[0] === 'rewarded').length, 1, 'the instance is reused');
});

test('rewarded: a fallback share page load counts as no-fill, grant once per run (AC 42, 44)', async () => {
  const { ads, handlers, an } = realAds();
  let p = ads.rewarded('continue', 'runA');
  await new Promise((r) => setImmediate(r));
  handlers.load({ useFallbackSharePage: true });
  let out = await p;
  assert.equal(out.granted, true);
  assert.equal(out.reason, 'noFillGrant');
  assert.equal(out.toast, '暂无广告，本次免费');
  p = ads.rewarded('continue', 'runA');
  await new Promise((r) => setImmediate(r));
  handlers.error({ errCode: 1004 });
  out = await p;
  assert.equal(out.granted, false, 'a second failure in the same run grants nothing');
  p = ads.rewarded('continue', 'runB');
  await new Promise((r) => setImmediate(r));
  handlers.error({ errCode: 1000 });
  out = await p;
  assert.equal(out.granted, true, 'a new run gets its own single grant');
  assert.ok(an.names().includes('ad_error'));
});

test('rewarded: show and load both failing is a no-fill (AC 42)', async () => {
  const { ads } = realAds(null, { showFails: true, loadFails: true });
  const out = await ads.rewarded('continue', 'r');
  assert.equal(out.reason, 'noFillGrant');
});

test('interstitial: caps, free-only, 2001-2003 are skipped silently (AC 71)', async () => {
  const r = realAds();
  const { ads, an, store, tick } = r;
  const ctx = (o) => Object.assign({ mode: 'free', sessionFreeRuns: 3, lifetimeRuns: 4 }, o);
  assert.equal(ads.interstitialDue(ctx()), true);
  assert.equal(ads.interstitialDue(ctx({ lifetimeRuns: 3 })), false, 'not before the 4th lifetime run');
  assert.equal(ads.interstitialDue(ctx({ sessionFreeRuns: 2 })), false, 'every 3rd free run');
  assert.equal(ads.interstitialDue(ctx({ sessionFreeRuns: 6 })), true);
  assert.equal(ads.interstitialDue(ctx({ mode: 'daily' })), false);
  assert.equal(ads.interstitialDue(ctx({ mode: 'challenge' })), false);
  assert.equal(ads.interstitialDue(ctx({ fromCardFirstRun: true })), false);
  assert.equal(await ads.interstitial(ctx()), true);
  assert.equal(store.state.interstitial.count, 1);
  assert.equal(ads.interstitialDue(ctx({ sessionFreeRuns: 6 })), false, 'at least 120 s apart');
  tick(121000);
  assert.equal(ads.interstitialDue(ctx({ sessionFreeRuns: 6 })), true);
  for (let i = 0; i < 4; i++) {
    tick(121000);
    await ads.interstitial(ctx({ sessionFreeRuns: 6 }));
  }
  assert.equal(store.state.interstitial.count, 5);
  tick(121000);
  assert.equal(ads.interstitialDue(ctx({ sessionFreeRuns: 6 })), false, 'at most 5 per day');
  assert.equal(an.names().filter((n) => n === 'interstitial_show').length, 5);
  // rejections are skipped silently: logged as ad_error, never counted
  const rej = realAds(null, { interstitialError: 2002 });
  assert.equal(await rej.ads.interstitial(ctx()), false);
  assert.equal(rej.store.state.interstitial.count, 0);
  assert.ok(rej.an.names().includes('ad_error'));
  assert.ok(!rej.an.names().includes('ad_show'));
});

test('interstitial caps follow the remote config on next launch, clamped, defaults when missing (AC 72)', () => {
  const { ads } = realAds();
  ads.setRemote({ interstitial: { everyNRuns: 2, minLifetimeRuns: 2, minGapSec: 60, maxPerDay: 8 } });
  assert.deepEqual(ads.caps, { enabled: true, everyNRuns: 2, minLifetimeRuns: 2, minGapSec: 60, maxPerDay: 8 });
  ads.setRemote({ interstitial: { everyNRuns: 0, minLifetimeRuns: 0, minGapSec: 1, maxPerDay: 1000 } });
  assert.deepEqual(ads.caps, { enabled: true, everyNRuns: 2, minLifetimeRuns: 2, minGapSec: 60, maxPerDay: 8 });
  ads.setRemote(null);
  assert.deepEqual(ads.caps, { enabled: true, everyNRuns: 3, minLifetimeRuns: 4, minGapSec: 120, maxPerDay: 5 });
  ads.setRemote({ interstitial: { enabled: false } });
  assert.equal(ads.interstitialDue({ mode: 'free', sessionFreeRuns: 3, lifetimeRuns: 9 }), false);
});

test('banner: never created by default; created only with the switch on and an ad unit (AC 73)', () => {
  const r = realAds();
  assert.equal(r.ads.bannerAllowed(), false);
  assert.equal(r.ads.showBanner({ left: 16, top: 600, width: 343 }), false);
  assert.ok(!r.created.some((c) => c[0] === 'banner'));
  r.ads.setRemote({ banner: { enabled: true, adUnitId: 'bb' } });
  assert.equal(r.ads.bannerAllowed(), true);
  assert.equal(r.ads.showBanner({ left: 16, top: 600, width: 343 }), true);
  assert.deepEqual(r.created.find((c) => c[0] === 'banner')[1].adIntervals, 30);
  r.ads.destroyBanner();
  assert.equal(r.ads.hasBanner(), false);
});

test('ads in stub mode: every placement shows the test overlay and logs stub=true (AC 74)', async () => {
  const an = fakeAnalytics();
  const store = mkStore();
  let clock = 1;
  const ads = createAds({ wx: {}, config, store, analytics: an, adUnits: {}, stub: { enabled: true }, now: () => clock });
  assert.equal(ads.stub, true);
  const p = ads.rewarded('continue', 'r');
  assert.ok(ads.overlay && ads.overlay.label === '广告位（测试）');
  clock += 3100;
  ads.stubComplete();
  const out = await p;
  assert.equal(out.granted, true);
  assert.ok(an.log.every(([, props]) => props.stub === true));
  assert.equal(ads.bannerAllowed(), false);
});

test('share: titles, queries, entry routing (AC 50, 51, 53, 58)', () => {
  assert.equal(dailyTitle(14), '今日一比我连对 14 个，你能比我多吗？');
  assert.equal(freeTitle(3, { bottomLabel: '黄河', topLabel: '长江', hi: '更长' }), '黄河和长江谁更长？我栽在这题了');
  assert.equal(challengeTitle(14), '同一套题，我连对 14，你来试试？');
  for (const s of [dailyTitle(1), freeTitle(1, null), challengeTitle(1)]) assert.equal(findForbidden(s), null);
  assert.equal(resultQuery('daily', '20261120'), 's=r&m=daily&d=20261120');
  assert.equal(challengeQuery('ABCD1234'), 'c=ABCD1234');
  assert.deepEqual(parseQuery('a=1&b=%E6%AF%94'), { a: '1', b: '比' });
  assert.equal(parseEnter({ query: { c: 'ABCD1234' } }).kind, 'challenge');
  assert.equal(parseEnter({ query: { c: 'ABCD1234' }, shareTicket: 't' }).join, true);
  assert.equal(parseEnter({ query: { c: 'bad' } }).kind, 'malformed');
  assert.equal(parseEnter({ query: 's=r&m=free&d=' }).kind, 'result');
  assert.equal(parseEnter({ query: 's=r', shareTicket: 'x' }).join, true);
  assert.equal(parseEnter({ query: {} }).kind, 'none');
  assert.equal(parseEnter({ query: { wxad_fallback_share: '1', c: 'ABCD1234' } }).kind, 'fallbackShare');
  assert.equal(parseEnter({ query: { zzz: '1' } }).kind, 'malformed');
  assert.equal(parseEnter(undefined).kind, 'none');
});

test('privacy: marker value is exactly {n}, refusal keeps it pending, old keys removed (AC 59)', async () => {
  const store = mkStore();
  const an = fakeAnalytics();
  const written = [];
  const removed = [];
  let refuse = true;
  const wx = {
    setUserCloudStorage: (o) => (refuse ? o.fail({ errno: 104 }) : (written.push(o.KVDataList), o.success({}))),
    removeUserCloudStorage: (o) => (removed.push(o.keyList), o.success({})),
  };
  const p = createPrivacy({ wx, store, analytics: an });
  assert.equal(await p.writeMarker('20261120', 14), 'privacyDenied');
  assert.deepEqual(store.state.privacy.markerPending, [{ dateKey: '20261120', n: 14 }]);
  assert.equal(p.status().markerPending, true);
  // no second prompt-style call after a refusal until the player agrees
  assert.equal(await p.writeMarker('20261121', 3), 'privacyDenied');
  refuse = false;
  store.state.privacy.privacy = 'agreed';
  await p.flushPending();
  assert.deepEqual(written.map((w) => w[0]), [{ key: 'd_20261120', value: '{"n":14}' }, { key: 'd_20261121', value: '{"n":3}' }]);
  for (const w of written) assert.deepEqual(Object.keys(JSON.parse(w[0].value)), ['n']);
  // keys older than 7 days are removed
  store.state.markerKeys = ['20261101', '20261110', '20261120'];
  await p.writeMarker('20261121', 1);
  assert.deepEqual(removed[0], ['d_20261101', 'd_20261110']);
  assert.ok(store.state.markerKeys.every((k) => k >= '20261114'));
});

test('analytics: whitelisted events, sessionId top-level and in props, no openid props, batches of 50 (AC 62, 91, 92)', async () => {
  const store = mkStore();
  const sent = [];
  const api = { track: (d) => (sent.push(d.events), Promise.resolve({ ok: true })) };
  let n = 0;
  const a = createAnalytics({ wx: {}, api, store, config, contentVersion: 1, appVersion: '9.9.9', platform: 'ios', now: () => 1000 + n++ });
  a.startSession({ scene: 1001 });
  assert.equal(a.track('not_an_event'), false);
  a.track('run_start', { runId: 'r1', openid: 'LEAK', groupRef: 'LEAK', groupid: 'LEAK', mode: 'free', skip: undefined });
  for (let i = 0; i < 120; i++) a.track('q_fetch', { k: i });
  await a.flush();
  assert.deepEqual(sent.map((b) => b.length), [50, 50, 22]);
  const first = sent[0][1];
  assert.equal(first.name, 'run_start');
  assert.ok(first.sessionId && first.props.sessionId === first.sessionId);
  assert.ok(first.clientTs > 0);
  assert.equal(first.props.contentVersion, 1);
  assert.equal(first.props.appVersion, '9.9.9');
  assert.ok(!('openid' in first.props) && !('groupRef' in first.props) && !('groupid' in first.props) && !('skip' in first.props));
  // a failed batch goes back to the queue
  const bad = createAnalytics({ wx: {}, api: { track: () => Promise.resolve({ ok: false }) }, store, config, contentVersion: 1, now: () => 5 });
  bad.track('error', { where: 'x', code: 1 });
  await bad.flush();
  assert.equal(bad.queue.length, 1);
  // every event of spec 12 that the client emits is whitelisted
  for (const e of ['session_start', 'card_open', 'run_start', 'q_fetch', 'run_complete', 'run_abandon', 'continue_offer', 'continue_result', 'fact_report', 'source_view', 'category_select',
    'share_tap', 'challenge_created', 'challenge_answered', 'board_view', 'group_join', 'privacy_result', 'friend_scope_result', 'board_write', 'history_view', 'history_issue_view',
    'day_streak_shown', 'save_image', 'subscribe_offer', 'subscribe_result', 'display_setting', 'ad_request', 'ad_show', 'ad_reward', 'ad_close_early', 'ad_error', 'interstitial_show', 'error']) {
    assert.ok(EVENTS.includes(e), e);
  }
  // a new session after > 30 minutes in the background
  let t = 1000;
  const s = createAnalytics({ wx: {}, api, store, config, contentVersion: 1, now: () => t });
  s.startSession({});
  const id1 = s.sessionId();
  s.onHide();
  t += 31 * 60 * 1000;
  assert.equal(s.onShow({}), true);
  assert.notEqual(s.sessionId(), id1);
});

test('api: cloud mode never rejects, times out, and sends no identity (spec 11)', async () => {
  const calls = [];
  const wx = {
    cloud: {
      init() {},
      callFunction: (o) => {
        calls.push(o);
        if (o.name === 'getDaily') return o.success({ result: { ok: true, dateKey: '20261120' } });
        if (o.name === 'answer') return o.fail({ errMsg: 'cloud.callFunction:fail' });
        // getBoard: never answers
      },
    },
  };
  let timeout = null;
  const api = createApi({ wx, mode: 'cloud', env: 'env1', setTimeout: (f) => (timeout = f), clearTimeout() {} });
  assert.deepEqual(await api.getDaily({}), { ok: true, dateKey: '20261120' });
  assert.deepEqual(await api.answer({ k: 1 }), { ok: false, code: 'NETWORK', msg: 'cloud.callFunction:fail' });
  const pending = api.getBoard({});
  timeout();
  assert.equal((await pending).code, 'TIMEOUT');
  assert.ok(calls.every((c) => !/openid/i.test(JSON.stringify(c.data))));
  assert.deepEqual(api.NAMES, ['getDaily', 'startRun', 'answer', 'submitRun', 'createChallenge', 'getChallenge', 'subscribeChallenge', 'joinGroup', 'getBoard', 'getHistory', 'reportFact', 'track']);
});

test('mock server: free runs are replayed, tampered clientStreak is flagged and changes nothing (AC 38, 39)', () => {
  const mock = createMockServer({ now: () => Date.UTC(2026, 10, 20, 4) });
  const { buildFreeDeck } = require('../core/deck');
  const { getContent } = require('../core/content');
  const J = require('../core/judge');
  const FREE = getContent(1);
  const deck = buildFreeDeck(31, 1, 1, 'all', FREE);
  const answers = [];
  for (let k = 1; k <= 4; k++) answers.push({ k, c: J.correctChoice(FREE.byId[deck.questions[k - 1].a], FREE.byId[deck.questions[k - 1].b]) });
  const q5 = deck.questions[4];
  const r5 = J.correctChoice(FREE.byId[q5.a], FREE.byId[q5.b]);
  answers.push({ k: 5, c: r5 === 'hi' ? 'lo' : 'hi' });
  const base = { clientRunId: 'x1', seed: 31, group: 'all', contentVersion: 1, configVersion: 1, answers, lifeAtK: null };
  const ok = mock.call('submitRun', Object.assign({}, base, { clientStreak: 99 }));
  assert.equal(ok.streak, 4);
  assert.equal(ok.mismatch, true);
  assert.ok(mock.db.anomalies.some((a) => a.kind === 'mismatch'));
  assert.equal(mock.call('submitRun', Object.assign({}, base, { clientStreak: 4 })).streak, 4, 'idempotent per clientRunId');
  assert.equal(mock.db.players[mock.ME].bestFree, 4);
  // an unknown version, extra answers and a bogus life are refused
  assert.equal(mock.call('submitRun', Object.assign({}, base, { clientRunId: 'x2', contentVersion: 9 })).code, 'INVALID_ACTIONS');
  assert.equal(mock.call('submitRun', Object.assign({}, base, { clientRunId: 'x3', answers: answers.concat([{ k: 6, c: 'hi' }]) })).code, 'INVALID_ACTIONS');
  assert.equal(mock.call('submitRun', Object.assign({}, base, { clientRunId: 'x4', lifeAtK: 2 })).code, 'INVALID_ACTIONS');
  assert.equal(mock.call('createChallenge', { runId: 'nope' }).code, 'RUN_NOT_FOUND');
});

test('mock server: day streaks count published days, skip unpublished, reset on a miss, no double count (AC 67, 68)', () => {
  let now = Date.UTC(2026, 10, 20, 4);
  const mock = createMockServer({ now: () => now, launchDateKey: '20261118' });
  const byId = mock.allIndex.byId;
  const playDay = (who, wrongAt) => {
    mock.call('getDaily', {}, who);
    const id = 'run-' + who + '-' + beijingDateKey(now);
    let x = mock.call('startRun', { mode: 'daily', clientRunId: id }, who);
    for (let i = 1; i <= wrongAt; i++) {
      const right = byId[x.question.bottom.factId].value > byId[x.question.top.factId].value ? 'hi' : 'lo';
      const choice = i === wrongAt ? (right === 'hi' ? 'lo' : 'hi') : right;
      x = mock.call('answer', { clientRunId: id, k: i, choice }, who);
      if (x.ended) break;
      x = { question: x.next };
    }
  };
  const nextDay = () => (now += DAY_MS);
  const days = () => mock.call('getDaily', {}, 'u').myDays;
  assert.deepEqual(days(), { current: 0, best: 0 });
  playDay('u', 3); // 20 Nov
  assert.deepEqual(days(), { current: 1, best: 1 });
  nextDay();
  assert.deepEqual(mock.call('getDaily', {}, 'u').myDays, { current: 1, best: 1 }, "yesterday's streak shows all through today until today's result exists");
  playDay('u', 5); // 21 Nov
  assert.deepEqual(days(), { current: 2, best: 2 });
  assert.equal(mock.db.players.u.bestDaily, 4);
  nextDay();
  mock.call('getDaily', {}, 'other'); // 22 Nov is published but u skips it
  nextDay();
  playDay('u', 2); // 23 Nov: a published day was missed, resets to 1
  assert.deepEqual(days(), { current: 1, best: 2 });
  // an unpublished date is skipped: delete 24 Nov's deck, play 25 Nov
  nextDay();
  mock.call('getDaily', {}, 'other');
  delete mock.db.decks[beijingDateKey(now)];
  nextDay();
  playDay('u', 2);
  assert.deepEqual(days(), { current: 2, best: 2 }, 'a date with no daily_decks document is skipped');
  // duplicates never double count
  assert.equal(mock.call('startRun', { mode: 'daily', clientRunId: 'again' }, 'u').code, 'ALREADY_PLAYED');
  assert.deepEqual(days(), { current: 2, best: 2 });
});

test('mock server: board rows rank by server streak, ties keep earlier end first, rows carry no openid (AC 61, 62)', () => {
  let now = Date.UTC(2026, 10, 20, 4);
  const mock = createMockServer({ now: () => now });
  const byId = mock.allIndex.byId;
  const finish = (who, rights) => {
    mock.call('getDaily', {}, who);
    let x = mock.call('startRun', { mode: 'daily', clientRunId: 'c-' + who }, who);
    for (let i = 1; i <= rights + 1; i++) {
      const right = byId[x.question.bottom.factId].value > byId[x.question.top.factId].value ? 'hi' : 'lo';
      x = mock.call('answer', { clientRunId: 'c-' + who, k: i, choice: i > rights ? (right === 'hi' ? 'lo' : 'hi') : right }, who);
      if (x.ended) break;
      x = { question: x.next };
    }
    now += 1000;
  };
  finish('a', 3);
  finish('b', 5);
  finish('c', 3);
  mock.call('joinGroup', { groupData: { mockData: { opengid: 'GG', chat_type: 3 } } }, 'a');
  const dk = beijingDateKey(now);
  const board = mock.call('getBoard', { kind: 'friend', dateKey: dk }, 'a');
  assert.deepEqual(board.rows.map((r) => r[1]), [5, 3, 3]);
  assert.ok(board.rows[1][2] <= board.rows[2][2], 'earlier finish listed first within a tie');
  assert.ok(!/"a"|"b"|openid/.test(JSON.stringify(board.rows)));
  assert.ok(board.rows.every((r) => /^[0-9a-f]{12}$/.test(r[0])));
  const board2 = mock.call('getBoard', { kind: 'friend', dateKey: dk }, 'b');
  assert.notEqual(board.selfHash, board2.selfHash);
  assert.equal(mock.call('getBoard', { kind: 'group', dateKey: dk, groupRef: 'forged' }, 'a').code, 'NOT_MEMBER');
  // the salt differs per day, so the same user's hash differs between dates
  const tomorrow = beijingDateKey(now + DAY_MS);
  assert.notEqual(mock.call('getBoard', { kind: 'friend', dateKey: tomorrow }, 'a').selfHash, board.selfHash);
});

test('joinGroup: one member per group and user, the openGId never comes back, errors write nothing (AC 64)', () => {
  const mock = createMockServer({ now: () => Date.UTC(2026, 10, 20, 4) });
  const r1 = mock.call('joinGroup', { groupData: { mockData: { opengid: 'GG1', chat_type: 3 } } });
  const r2 = mock.call('joinGroup', { groupData: { mockData: { opengid: 'GG1', chat_type: 3 } } });
  assert.equal(r1.groupRef, r2.groupRef);
  assert.ok(!r1.groupRef.includes('GG1'));
  assert.equal(Object.keys(mock.db.members).length, 1);
  assert.equal(mock.call('joinGroup', { groupData: { mockData: { opengid: 'G', chat_type: 1 } } }).code, 'NOT_GROUP');
  assert.equal(mock.call('joinGroup', { groupData: { mockData: { code: 40097 } } }).code, 40097);
  assert.equal(mock.call('joinGroup', {}).ok, false);
  assert.equal(Object.keys(mock.db.members).length, 1);
});

test('getDaily and every function return {ok:false, code} instead of throwing (AC 86)', () => {
  const mock = createMockServer({ now: () => Date.UTC(2026, 10, 20, 4) });
  for (const n of ['startRun', 'answer', 'submitRun', 'createChallenge', 'getChallenge', 'subscribeChallenge', 'joinGroup', 'getBoard', 'getHistory', 'reportFact']) {
    const r = mock.call(n, { weird: true, k: 'x', reasons: 5, answers: 'q', groupData: 3 });
    assert.equal(typeof r.ok, 'boolean', n);
    if (!r.ok) assert.ok(r.code, n);
  }
  assert.equal(mock.call('nope', {}).code, 'NO_SUCH_FUNCTION');
  assert.equal(mock.call('getChallenge', { challengeId: 'x' }).code, 'CHALLENGE_EXPIRED');
  assert.equal(mock.call('startRun', { mode: 'daily', clientRunId: 'a', dateKey: '20000101' }).code, 'DECK_NOT_FOUND');
  assert.equal(mock.call('startRun', { mode: 'challenge', clientRunId: 'a', challengeId: 'zzzz' }).code, 'CHALLENGE_EXPIRED');
  assert.equal(mock.call('answer', { clientRunId: 'none', k: 1, choice: 'hi' }).code, 'RUN_NOT_FOUND');
  assert.equal(mock.call('getHistory', { dateKey: '20250101' }).code, 'DECK_NOT_FOUND');
});

test('vm: home daily card states, history and issue models, display palette (spec 6.2, 6.11, 6.19)', () => {
  const disp = V.displayVm({ largeText: false, highContrast: false });
  assert.deepEqual(disp, { largeText: false, highContrast: false, scale: 1, palette: 'standard' });
  const free = { categoryKey: 'all', categoryLabel: '全部', bestText: null, resumeText: null };
  const done = V.homeVm({ state: 'done', issueNo: 12, dateKey: '20261120', themeLabel: '山河', streak: 14, rarityShare: 0.82, dayCurrent: 5 }, { free, display: disp });
  assert.equal(done.daily.resultText, '今日连对 14 · 超过 82% 的玩家');
  assert.equal(done.daily.subline, '明日 0:00 换新题');
  assert.equal(done.daily.dayStreak.text, '连续 5 天');
  const early = V.homeVm({ state: 'done', issueNo: 1, dateKey: '20261120', themeLabel: '山河', streak: 3, rarityShare: null, dayCurrent: 1 }, { free, display: disp });
  assert.equal(early.daily.resultText, '今日连对 3', 'no rarity under 30 results');
  assert.equal(early.daily.dayStreak.text, null);
  const h = V.historyVm({ state: 'ready', bestDays: 12, bestDaily: 23, items: [{ dateKey: '20261114', issueNo: 11, themeLabel: '山河', mine: { n: 9 }, isToday: false }, { dateKey: '20261115', issueNo: 12, themeLabel: '城市', mine: null, isToday: false }] }, disp);
  assert.equal(h.headerText, '最长连续 12 天 · 今日一比最佳 23');
  assert.deepEqual(h.items.map((i) => [i.dateText, i.mineText]), [['11月14日', '连对 9'], ['11月15日', '未参加']]);
  assert.equal(V.historyVm({ state: 'empty', items: [] }, disp).emptyText, '还没有往期');
  assert.equal(V.historyVm({ state: 'offline' }, disp).errorText, '往期需联网查看');
  const hist = new Array(41).fill(0);
  hist[3] = 20;
  hist[12] = 10;
  const face = { factId: 'f', measure: 'river', label: '长江', valueText: '6,300', unitText: '公里', approx: false, sourceText: '来源：水利部 · 2013' };
  const iv = V.issueVm({ state: 'ready', dateKey: '20261114', data: { issue: { issueNo: 11, themeLabel: '山河' }, mine: { streak: 9, missK: 10 }, stats: { total: 30, hist }, deck: [{ k: 1, a: face, b: face, answerLabel: '更短', mine: 'correct' }], errata: [{ k: 17, text: '已更正' }] } }, disp);
  assert.equal(iv.mineText, '连对 9（倒在第 10 题）');
  assert.equal(iv.stats.totalText, '本期 30 人参加');
  assert.deepEqual(iv.stats.buckets.map((b) => b.shareText), ['67%', '0%', '33%', '0%', '0%']);
  assert.equal(iv.deck[0].answerLabel, '更短');
  assert.equal(iv.errata[0].k, 17);
  const locked = V.issueVm({ state: 'ready', dateKey: '20261114', data: { issue: { issueNo: 11, themeLabel: '山河' }, mine: null, stats: null, deck: null, errata: [] } }, disp);
  assert.equal(locked.deckLockedText, '今日一比结束后公布题目');
  assert.equal(locked.stats, null);
  // sources text and howto
  assert.equal(V.howtoVm().lines.length, 3);
  assert.ok(V.sourcesVm().sources.every((s) => s.attribution));
  void addDays;
  void dateKeyToMs;
});
