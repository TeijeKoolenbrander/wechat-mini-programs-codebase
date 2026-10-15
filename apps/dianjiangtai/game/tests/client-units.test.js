/**
 * Unit tests for the v1 client modules: features, ads banner and interstitial
 * config, the mock server's v1 functions (streaks, history, progressive
 * delivery, subscribe grants), view-model builders and the core adapter.
 */

const test = require('node:test');
const assert = require('node:assert');
const { normalizeFeatures } = require('../js/features');
const { createAds } = require('../js/ads');
const { createStore } = require('../js/store');
const { createMockServer } = require('../js/mock-server');
const { createSubscribe } = require('../js/subscribe');
const { createAlbum } = require('../js/album');
const A = require('../js/core-adapter');
const V = require('../js/vm');
const { driveProgressive } = require('./harness');
const { getContent, LATEST_CONTENT_VERSION } = require('../core/content');
const { getConfig, LATEST_CONFIG_VERSION } = require('../core/config');
const { beijingDateKey, addDays } = require('../core/date');
const draft = require('../core/draft');

const config = getConfig(LATEST_CONFIG_VERSION);
const content = getContent(LATEST_CONTENT_VERSION);
const FRI = Date.UTC(2026, 10, 20, 4, 0, 0);
const DAY = 86400e3;

test('features: defaults when missing, clamped interstitial values, template from remote or build-config (spec 12, PO-11)', () => {
  const d = normalizeFeatures(undefined, config, {});
  assert.strictEqual(d.subscribe, null);
  assert.deepStrictEqual(d.banner, { enabled: false, adUnitId: null });
  assert.deepStrictEqual(d.interstitial, { enabled: true, everyNRuns: 3, minLifetimeRuns: 4, minGapSec: 120, maxPerDay: 5 });
  assert.deepStrictEqual(normalizeFeatures('garbage', config, {}), d);
  const c = normalizeFeatures({ interstitial: { everyNRuns: 1, minLifetimeRuns: 0, minGapSec: 5, maxPerDay: 99, enabled: false }, banner: { enabled: 'yes', adUnitId: 'x' } }, config, {});
  assert.deepStrictEqual(c.interstitial, { enabled: false, everyNRuns: 2, minLifetimeRuns: 2, minGapSec: 60, maxPerDay: 8 });
  assert.strictEqual(c.banner.enabled, false, 'only a literal true switches the banner on');
  assert.strictEqual(normalizeFeatures({ interstitial: { everyNRuns: 'x', maxPerDay: NaN } }, config, {}).interstitial.everyNRuns, 3);
  assert.deepStrictEqual(normalizeFeatures({ subscribe: { tmplId: 'R' } }, config, { subscribeTmplId: 'B' }).subscribe, { tmplId: 'R' });
  assert.deepStrictEqual(normalizeFeatures({}, config, { subscribeTmplId: 'B' }).subscribe, { tmplId: 'B' });
  assert.strictEqual(normalizeFeatures({ subscribe: { tmplId: '' } }, config, { subscribeTmplId: '' }).subscribe, null);
});

function mkAds(wx) {
  const store = createStore(null);
  const events = [];
  let clock = Date.UTC(2026, 10, 20, 4, 0, 0);
  const ads = createAds({ wx, config, store, analytics: { track: (n, p) => events.push([n, p]) }, now: () => clock, adUnits: { rewarded: 'r1', interstitial: 'i1' } });
  return { ads, store, events, tick: (ms) => (clock += ms) };
}

test('interstitial config from the remote document changes the caps without a code change; the never-in rules stay (AC 92)', () => {
  const { ads, store } = mkAds({});
  store.state.lifetimeRuns = 10;
  assert.strictEqual(ads.interstitialDue({ mode: 'free', sessionFreeRuns: 3, lifetimeRuns: 10 }), true);
  ads.setInterstitialConfig(normalizeFeatures({ interstitial: { everyNRuns: 4 } }, config, {}).interstitial);
  assert.strictEqual(ads.interstitialDue({ mode: 'free', sessionFreeRuns: 3, lifetimeRuns: 10 }), false);
  assert.strictEqual(ads.interstitialDue({ mode: 'free', sessionFreeRuns: 4, lifetimeRuns: 10 }), true);
  for (const mode of ['daily', 'challenge']) assert.strictEqual(ads.interstitialDue({ mode, sessionFreeRuns: 4, lifetimeRuns: 10 }), false, mode + ' is never configurable');
  ads.setInterstitialConfig(normalizeFeatures({ interstitial: { enabled: false } }, config, {}).interstitial);
  assert.strictEqual(ads.interstitialDue({ mode: 'free', sessionFreeRuns: 3, lifetimeRuns: 10 }), false);
  ads.setInterstitialConfig(null);
  assert.strictEqual(ads.interstitialDue({ mode: 'free', sessionFreeRuns: 3, lifetimeRuns: 10 }), true, 'null -> core defaults');
  // maxPerDay 3 from config
  ads.setInterstitialConfig(normalizeFeatures({ interstitial: { maxPerDay: 3 } }, config, {}).interstitial);
  store.state.interstitial = { day: beijingDateKey(Date.UTC(2026, 10, 20, 4, 0, 0)), count: 3, lastAt: 0 };
  assert.strictEqual(ads.interstitialDue({ mode: 'free', sessionFreeRuns: 3, lifetimeRuns: 10 }), false);
});

test('banner (real ad mode): created once with adIntervals 30 and the right width, hidden, destroyed; errors are silent ad_error with placement banner (AC 91)', () => {
  const made = [];
  const handlers = {};
  const wx = {
    createBannerAd: (o) => {
      made.push(o);
      return {
        style: {},
        onError: (f) => (handlers.error = f),
        onLoad: (f) => (handlers.load = f),
        onResize: (f) => (handlers.resize = f),
        show: () => Promise.resolve(),
        hide: () => (made.hidden = (made.hidden || 0) + 1),
        destroy: () => (made.destroyed = (made.destroyed || 0) + 1),
      };
    },
  };
  const { ads, events } = mkAds(wx);
  assert.strictEqual(ads.stub, false);
  assert.strictEqual(made.length, 0, 'nothing is created until a board asks');
  assert.strictEqual(ads.bannerShow({ unitId: 'b1', left: 16, width: 343, bottomEdge: 780 }), true);
  ads.bannerShow({ unitId: 'b1', left: 16, width: 343, bottomEdge: 780 });
  assert.strictEqual(made.length, 1, 'one instance');
  assert.strictEqual(made[0].adUnitId, 'b1');
  assert.strictEqual(made[0].adIntervals, 30);
  assert.strictEqual(made[0].style.width, 343);
  handlers.resize({ height: 90 });
  assert.strictEqual(ads.bannerHeight, 90);
  handlers.load();
  handlers.error({ errCode: 1004 });
  assert.deepStrictEqual(events.filter((e) => e[0] === 'ad_error').map((e) => e[1]), [{ placement: 'banner', stub: false, errCode: 1004 }]);
  ads.bannerHide();
  assert.strictEqual(ads.bannerActive, false);
  assert.strictEqual(made.hidden, 1);
  ads.bannerDestroy();
  assert.strictEqual(made.destroyed, 1);
  assert.deepStrictEqual(events.filter((e) => e[0] === 'ad_request').map((e) => e[1].placement), ['banner']);
  // stub mode never creates a native banner
  const stubbed = createAds({ wx, config, store: createStore(null), analytics: { track() {} }, adUnits: {}, stub: { enabled: true } });
  assert.strictEqual(stubbed.bannerShow({ unitId: 'b1', left: 16, width: 343, bottomEdge: 780 }), false);
  assert.strictEqual(made.length, 1);
});

test('subscribe module: template hidden/offer/granted/declined states; ban hides everywhere (AC 84)', async () => {
  const store = createStore(null);
  const events = [];
  const granted = [];
  const wx = { requestSubscribeMessage: (o) => o.success({ [o.tmplIds[0]]: wx.answer }) };
  const sub = createSubscribe({ wx, store, analytics: { track: (n, p) => events.push([n, p]) }, api: { subscribeChallenge: async (d) => (granted.push(d.challengeId), { ok: true, granted: true }) } });
  const f = { subscribe: { tmplId: 'T' } };
  assert.strictEqual(sub.stateFor(null, 'C1'), 'hidden');
  assert.strictEqual(sub.stateFor({ subscribe: null }, 'C1'), 'hidden');
  assert.strictEqual(sub.stateFor(f, 'C1'), 'offer');
  assert.strictEqual(sub.stateFor(f, null), 'hidden');
  assert.strictEqual(await sub.request({ subscribe: null }, 'C1'), 'unavailable', 'no template: nothing requested');
  wx.answer = 'accept';
  assert.strictEqual(await sub.request(f, 'C1'), 'granted');
  assert.deepStrictEqual(granted, ['C1']);
  assert.strictEqual(sub.stateFor(f, 'C1'), 'granted');
  wx.answer = 'reject';
  assert.strictEqual(await sub.request(f, 'C2'), 'declined');
  assert.strictEqual(sub.stateFor(f, 'C2'), 'declined');
  assert.strictEqual(sub.stateFor(f, 'C3'), 'offer', 'a reject is per challenge');
  wx.answer = 'ban';
  assert.strictEqual(await sub.request(f, 'C4'), 'declined');
  assert.strictEqual(sub.stateFor(f, 'C3'), 'hidden', 'ban hides the offer on this device');
  assert.deepStrictEqual(events.filter((e) => e[0] === 'subscribe_result').map((e) => e[1].result), ['accept', 'reject', 'ban']);
});

test('album module: scope already refused -> needSettings without a save attempt; other failures are plain errors', async () => {
  let scope;
  let saveErr = null;
  const saves = [];
  const wx = {
    getSetting: (o) => o.success({ authSetting: scope === undefined ? {} : { 'scope.writePhotosAlbum': scope } }),
    saveImageToPhotosAlbum: (o) => (saves.push(o.filePath), saveErr ? o.fail(saveErr) : o.success({})),
  };
  const events = [];
  const share = { cardFile: async (card, opts) => ({ path: 'f' + (opts && opts.pixelScale), fallback: !!card.fail }) };
  const album = createAlbum({ wx, share, analytics: { track: (n, p) => events.push([n, p]) } });
  scope = false;
  let r = await album.save({}, 'daily');
  assert.deepStrictEqual([r.result, r.needSettings, saves.length], ['scopeDenied', true, 0]);
  scope = undefined;
  r = await album.save({}, 'free');
  assert.deepStrictEqual([r.result, saves[0]], ['saved', 'f2']); // 2x
  r = await album.save({ fail: true }, 'free');
  assert.strictEqual(r.result, 'renderFallback');
  saveErr = { errMsg: 'saveImageToPhotosAlbum:fail cancel' };
  r = await album.save({}, 'free');
  assert.deepStrictEqual([r.result, r.needSettings], ['error', false]);
  saveErr = { errno: 104 };
  assert.strictEqual((await album.save({}, 'free')).result, 'privacyDenied');
  assert.ok(events.every((e) => e[0] === 'save_image'));
});

async function playMock(srv, id) {
  const d = srv.call('getDaily', {});
  const api = { startRun: async (x) => srv.call('startRun', x), getRound: async (x) => srv.call('getRound', x) };
  const played = await driveProgressive(api, { clientRunId: id, dateKey: d.dateKey });
  assert.ok(!played.error, JSON.stringify(played.error));
  return srv.call('submitRun', { clientRunId: id, mode: 'daily', dateKey: d.dateKey, actions: played.actions });
}

test('mock streak (PO-6): +1 per consecutive published day, an unpublished day is skipped, a missed published day resets', async () => {
  let now = FRI;
  const srv = createMockServer({ now: () => now });
  const k0 = beijingDateKey(now);
  assert.deepStrictEqual(srv.call('getDaily', {}).myStreak, { current: 0, best: 0 });
  let r = await playMock(srv, 'd1');
  assert.strictEqual(r.streak.current, 1);
  // next day is unpublished (DAILY_UNAVAILABLE): skipped, the day after continues the streak
  now += DAY;
  srv.db.unpublished[beijingDateKey(now)] = true;
  assert.strictEqual(srv.call('getDaily', {}).myStreak.current, 1, 'yesterday-alive rule: unpublished days are skipped');
  now += DAY;
  assert.strictEqual(srv.call('getDaily', {}).myStreak.current, 1);
  r = await playMock(srv, 'd3');
  assert.strictEqual(r.streak.current, 2);
  assert.strictEqual(r.streak.best, 2);
  // a published day missed: the streak resets to 1 on the next play, best stays
  now += 2 * DAY;
  assert.strictEqual(srv.call('getDaily', {}).myStreak.current, 0);
  r = await playMock(srv, 'd5');
  assert.deepStrictEqual(r.streak, { current: 1, best: 2 });
  void k0;
});

test('mock board rows carry the server streak k for streaks of 2 or more, never from the client (AC 81)', async () => {
  let now = FRI;
  const srv = createMockServer({ now: () => now });
  await playMock(srv, 'a');
  let b = srv.call('getBoard', { kind: 'friend', dateKey: beijingDateKey(now) });
  assert.strictEqual(b.rows[0].length, 4);
  now += DAY;
  await playMock(srv, 'b');
  b = srv.call('getBoard', { kind: 'friend', dateKey: beijingDateKey(now) });
  assert.strictEqual(b.rows[0][4], 2);
  assert.ok(b.variant === 'standard' || b.variant === 'shiren');
});

test('mock progressive delivery: round n+1 only after the prefix through pick n; prefix and release rules enforce submitRun (AC 86)', async () => {
  const srv = createMockServer({ now: () => FRI });
  const d = srv.call('getDaily', {});
  assert.ok(!('rounds' in d));
  const s1 = srv.call('startRun', { mode: 'daily', clientRunId: 'x', dateKey: d.dateKey });
  assert.strictEqual(s1.rounds.length, 1);
  // a submit before all rounds are released is refused and flagged
  const early = srv.call('submitRun', { clientRunId: 'x', mode: 'daily', dateKey: d.dateKey, actions: [] });
  assert.strictEqual(early.ok, false);
  const played = await driveProgressive({ startRun: async (x) => srv.call('startRun', x), getRound: async (x) => srv.call('getRound', x) }, { clientRunId: 'x', dateKey: d.dateKey });
  assert.ok(!played.error);
  // getRound is idempotent for the same prefix: ask for round 5 again
  const run = draft.createRun({ seed: 0, contentVersion: LATEST_CONTENT_VERSION, mode: 'daily', rounds: played.rounds });
  const acts = played.actions;
  let n = 0;
  let cut = acts.length;
  for (let i = 0; i < acts.length; i++) if (acts[i].type === 'pick' && ++n === 4) cut = i + 1;
  const again = srv.call('getRound', { clientRunId: 'x', dateKey: d.dateKey, actions: acts.slice(0, cut) });
  assert.ok(again.ok && again.round === 5);
  assert.deepStrictEqual(again.data, played.rounds[4]);
  // a diverging prefix is rejected and flagged
  const bad = acts.slice(0, cut).map((a) => (a.type === 'pick' && a.round === 1 ? Object.assign({}, a, { slot: 'shoujiang' }) : a));
  assert.strictEqual(srv.call('getRound', { clientRunId: 'x', dateKey: d.dateKey, actions: bad }).code, 'INVALID_ACTIONS');
  assert.ok(srv.db.anomalies.length >= 1);
  // diverging final actions: INVALID_ACTIONS, nothing ranked
  const swapped = acts.map((a) => (a.type === 'pick' && a.round === 1 ? Object.assign({}, a, { slot: a.slot === 'zhugong' ? 'junshi' : 'zhugong' }) : a));
  const r = srv.call('submitRun', { clientRunId: 'y', mode: 'daily', dateKey: d.dateKey, actions: swapped });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(Object.keys(srv.db.results).length, 0);
  assert.strictEqual(srv.call('submitRun', { clientRunId: 'x', mode: 'daily', dateKey: d.dateKey, actions: acts }).ranked, true);
  void run;
});

test('mock getHistory: <= 30 newest first, mine from my results, best only after D+1 00:30 (AC 82)', async () => {
  let now = Date.UTC(2026, 11, 28, 4, 0, 0); // well past launch: more than 30 published days
  const srv = createMockServer({ now: () => now });
  await playMock(srv, 'h1');
  const today = beijingDateKey(now);
  let h = srv.call('getHistory', { limit: 99 });
  assert.strictEqual(h.items.length, 30);
  assert.strictEqual(h.items[0].dateKey, today);
  assert.ok(h.items[0].mine && !h.items[0].best, 'no best for an open date');
  assert.ok(h.items[1].dateKey < h.items[0].dateKey);
  assert.ok(!('seed' in h.items[0]) && !JSON.stringify(h).includes('rounds'));
  // boundary: 00:29 and 00:31 on D+1 (Beijing)
  now = Date.UTC(2026, 11, 28, 16, 29, 0); // 00:29 BJT on the 29th
  h = srv.call('getHistory', {});
  assert.ok(!h.items.find((i) => i.dateKey === today).best, 'window still open at 00:29');
  now = Date.UTC(2026, 11, 28, 16, 31, 0);
  h = srv.call('getHistory', {});
  const t = h.items.find((i) => i.dateKey === today);
  assert.ok(t.best && t.best.lineupIdx.length === 5 && t.best.record.w >= t.mine.w, 'best appears at 00:31');
  assert.strictEqual(h.bestStreak, 1);
});

test('mock subscribeChallenge: NO_TEMPLATE without app_config, owner only, idempotent', async () => {
  const srv = createMockServer({ now: () => FRI });
  srv.db.challenges.CH000001 = { owner: srv.ME, mode: 'free', seed: 1, dateKey: '20261120', rounds: [], record: { w: 1, l: 11 }, lineup: [], expiresAt: FRI + DAY, answers: [] };
  srv.db.challenges.CH000002 = Object.assign({}, srv.db.challenges.CH000001, { owner: 'x' });
  assert.strictEqual(srv.call('subscribeChallenge', { challengeId: 'CH000001' }).code, 'NO_TEMPLATE');
  srv.appConfig = { subscribe: { tmplId: 'T' } };
  assert.strictEqual(srv.call('getDaily', {}).features.subscribe.tmplId, 'T');
  assert.strictEqual(srv.call('subscribeChallenge', { challengeId: 'CH000002' }).code, 'NOT_OWNER');
  assert.ok(srv.call('subscribeChallenge', { challengeId: 'CH000001' }).ok);
  assert.ok(srv.call('subscribeChallenge', { challengeId: 'CH000001' }).ok);
  assert.strictEqual(Object.keys(srv.db.grants).length, 1);
  assert.strictEqual(srv.call('getChallenge', { challengeId: 'CH000001' }).subscribe.granted, true);
});

test('core adapter: variant is shiren exactly on Sunday Beijing dates over three years (AC 77)', () => {
  const cfg = { shiren: { weekday: 0 } };
  let k = '20260101';
  let sundays = 0;
  for (let i = 0; i < 3 * 365; i++) {
    const wd = new Date(Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8))).getUTCDay();
    assert.strictEqual(A.variantFor(cfg, k), wd === 0 ? 'shiren' : 'standard', k);
    if (wd === 0) sundays++;
    k = addDays(k, 1);
  }
  assert.ok(sundays >= 156);
  assert.strictEqual(A.variantFor({ shiren: { weekday: 3 } }, '20261125'), 'shiren', 'the weekday comes from config');
  assert.strictEqual(A.variantFor({}, '20261122'), 'shiren', 'default Sunday');
});

test('seal descriptors: full name, faction colour, plain frame when hidden, 晋 uses ink text (spec 13, PO-13)', () => {
  const g = content.generals[0];
  const s = A.sealOf(content, g.id, { factionKey: g.faction });
  assert.deepStrictEqual([s.text, s.monogram, s.factionKey, s.frame, s.inkText], [g.name, g.monogram, g.faction, g.tier, false]);
  assert.ok(/^#[0-9A-Fa-f]{6}$/.test(s.color));
  assert.strictEqual(A.sealOf(content, g.id, { factionKey: g.faction, hidden: true }).frame, 'plain');
  const jin = A.sealOf(content, g.id, { factionKey: 'jin' });
  assert.strictEqual(jin.inkText, true);
  assert.ok(jin.color);
});

test('view models: history issue shows the distribution only with >= 30 runs and the best lineup only when the window closed (spec 8.9)', () => {
  const idx = [0, 1, 2, 3, 4];
  const item = { dateKey: '20261120', issueNo: 20, variant: 'shiren', mine: { w: 9, l: 3, lineupIdx: idx, lineupFac: null }, total: 2315, hist: [0, 1, 2, 3, 5, 8, 10, 12, 15, 20, 9, 5, 2], best: { lineupIdx: idx, record: { w: 12, l: 0 } } };
  const open = V.historyIssueVm(Object.assign({}, item, { best: undefined }), { content, config, windowClosed: false });
  assert.strictEqual(open.best, null);
  assert.strictEqual(open.bestLockedText, '今日军令结束后公布');
  assert.strictEqual(open.variantLabel, '识人');
  assert.strictEqual(open.stats.totalText, '共 2,315 人出征');
  assert.strictEqual(open.stats.bands.length, config.bands.length);
  assert.ok(open.mine.lineup.every((e) => e.seal && e.stats && e.label));
  const closed = V.historyIssueVm(item, { content, config, windowClosed: true });
  assert.ok(closed.best && closed.best.lineup.length === 5 && closed.bestLockedText === null);
  const few = V.historyIssueVm(Object.assign({}, item, { total: 29 }), { content, config, windowClosed: true });
  assert.strictEqual(few.stats, null);
  const none = V.historyIssueVm(Object.assign({}, item, { mine: undefined }), { content, config, windowClosed: true });
  assert.strictEqual(none.mine, null);
  const list = V.historyVm({ state: 'ready', items: [item, { dateKey: '20261119', issueNo: 19, variant: 'standard' }], bestStreak: 12 }, { config, todayKey: '20261120' });
  assert.strictEqual(list.bestStreakText, '最长连续出征 12 天');
  assert.deepStrictEqual([list.items[0].isToday, list.items[0].statusText, list.items[0].dateText, list.items[1].mine, list.items[1].variantLabel], [true, '进行中', '11月20日', null, null]);
});

test('view models: streak text only from 2, no reward words; home and board carry the new fields', () => {
  assert.deepStrictEqual(V.streakVm({ current: 1 }), { current: 1, text: null });
  assert.deepStrictEqual(V.streakVm({ current: 5 }), { current: 5, text: '连续出征 5 天' });
  assert.deepStrictEqual(V.streakVm(null), { current: 0, text: null });
  const home = V.homeVm({ state: 'available', issueNo: 3, dateKey: '20261122', variant: 'shiren', streak: { current: 3 } }, { display: { largeText: true } });
  assert.strictEqual(home.daily.variantLabel, '识人');
  assert.strictEqual(home.daily.streak.text, '连续出征 3 天');
  assert.deepStrictEqual(home.nav, { historyEnabled: true });
  assert.strictEqual(home.settings.largeText, true);
  const board = V.boardVm({ kind: 'group', state: 'ready', variant: 'shiren', banner: { show: true, reservedHeight: 90 } });
  assert.deepStrictEqual([board.variantLabel, board.banner.show, board.banner.reservedHeight], ['识人', true, 90]);
  assert.strictEqual(V.boardVm({ kind: 'group', state: 'privacyDenied', banner: { show: false, reservedHeight: 90 } }).banner.reservedHeight, 0);
  assert.strictEqual(V.displayVm({ largeText: true, highContrast: true }).palette, 'highContrast');
  const msg = V.boardMessage('friend', { dateKey: 'd', issueNo: 1, variant: 'shiren', contentVersion: 1, salt: 's', selfHash: 'h', mode: 'full', viewerPlayed: true, rows: [['h', 1, 2, null, 3]] }, { content, board: { w: 1, h: 1 } });
  assert.strictEqual(msg.variant, 'shiren');
  assert.strictEqual(msg.rows[0][4], 3);
});

test('draft vm: drafted people from another cell show dimmed after the pool, hidden mode strips every 五德 field', () => {
  const run = draft.createRun({ seed: 11, contentVersion: LATEST_CONTENT_VERSION, mode: 'daily' });
  draft.apply(run, { round: 1, type: 'flip' });
  const first = V.draftVm(run, {}).pool[0];
  assert.ok(first.seal && first.seal.text === first.name && 'appearanceNote' in first && 'courtesy' in first);
  assert.strictEqual(typeof V.draftVm(run, {}).poolTotal, 'number');
  const hid = V.draftVm(run, { hidden: true, selectedId: first.id, shirenCoach: true });
  assert.strictEqual(hid.hidden, true);
  assert.ok(hid.pool.every((p) => p.stats === null && p.tier === null && p.seal.frame === 'plain'));
  assert.ok(hid.selected.slotOptions.every((o) => o.score === null && o.fit === null) && hid.selected.statNote === null);
  assert.ok(/识人军令/.test(hid.shirenCoach));
  const text = JSON.stringify(hid);
  assert.ok(!/"zhi"|"statNote":"/.test(text), 'no stat key or note text anywhere in the hidden vm');
  // load: primary disabled while a round is being fetched
  const loading = V.draftVm(run, { roundFetch: 'loading' });
  assert.deepStrictEqual([loading.primaryLabel, loading.primaryDisabled], ['翻令中…', true]);
  assert.strictEqual(V.draftVm(run, { roundFetch: 'failed' }).roundFetchText, '令牌传递中断');
});
