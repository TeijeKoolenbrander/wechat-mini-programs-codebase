/**
 * Unit tests for the client modules that carry rules: ads (real-ad path), share, view models, analytics, api, privacy, store.
 * They run on plain node with small fakes; the fake-wx smoke tests cover the same rules end to end.
 */

const test = require('node:test');
const assert = require('node:assert');
const { createAds } = require('../js/ads');
const { createAnalytics, EVENTS } = require('../js/analytics');
const { createApi } = require('../js/api');
const { createPrivacy } = require('../js/privacy');
const { createStore, KEY } = require('../js/store');
const Sh = require('../js/share');
const V = require('../js/vm');
const { getConfig, normalizeFeatures } = require('../core/config');

const config = getConfig(1);
const log = () => {
  const events = [];
  return { events, track: (n, p) => events.push({ name: n, props: p }) };
};
const memStore = () => createStore({ getStorageSync: () => null, setStorageSync: () => {} });
const sleep = () => new Promise((r) => setImmediate(r));

// ------------------------------------------------------------------ ads (the real-ad code path, no stub)

function fakeAdWx(script) {
  const made = [];
  const wx = {
    made,
    createRewardedVideoAd(o) {
      const ad = { opts: o, handlers: {} };
      made.push(ad);
      ad.onClose = (f) => (ad.handlers.close = f);
      ad.onError = (f) => (ad.handlers.error = f);
      ad.onLoad = (f) => (ad.handlers.load = f);
      ad.show = () => (script.showFails ? Promise.reject({ errCode: script.showFails }) : Promise.resolve().then(() => script.onShow && script.onShow(ad)));
      ad.load = () => (script.loadFails ? Promise.reject({ errCode: script.loadFails }) : Promise.resolve());
      return ad;
    },
    createInterstitialAd(o) {
      made.push({ interstitial: o });
      return { show: () => (script.interstitialFails ? Promise.reject({ errCode: script.interstitialFails }) : Promise.resolve()) };
    },
  };
  return wx;
}

function realAds(script, extra) {
  const l = log();
  const store = memStore();
  const wx = fakeAdWx(script || {});
  let t = Date.UTC(2026, 10, 20, 4, 0, 0);
  const ads = createAds(Object.assign({ wx, config, store, analytics: l, adUnits: { rewarded: 'R1', interstitial: 'I1', banner: 'B1' }, stub: { enabled: false }, now: () => t, getFeatures: () => normalizeFeatures(null) }, extra || {}));
  return { ads, l, store, wx, advance: (ms) => (t += ms), at: () => t };
}

test('AC56/58: every rewarded instance disables the fallback share page; only isEnded === true pays', async () => {
  const k = realAds({ onShow: (ad) => setTimeout(() => ad.handlers.close({ isEnded: true }), 0) });
  assert.strictEqual(k.ads.stub, false);
  const out = await k.ads.rewarded('bonus');
  assert.strictEqual(out.granted, true);
  assert.strictEqual(out.reason, 'ended');
  assert.strictEqual(k.wx.made[0].opts.disableFallbackSharePage, true);
  assert.strictEqual(k.wx.made[0].opts.adUnitId, 'R1');
  // closed early: nothing and the message
  const k2 = realAds({ onShow: (ad) => setTimeout(() => ad.handlers.close({ isEnded: false }), 0) });
  const o2 = await k2.ads.rewarded('bonus');
  assert.strictEqual(o2.granted, false);
  assert.strictEqual(o2.toast, '完整观看才能获得');
  assert.ok(k2.l.events.some((e) => e.name === 'ad_close_early' && e.props.stub === false));
  // a close without the flag is not a reward either
  const k3 = realAds({ onShow: (ad) => setTimeout(() => ad.handlers.close({}), 0) });
  assert.strictEqual((await k3.ads.rewarded('distribution')).granted, false);
});

test('AC57/58: no fill or a load error grants once per placement per day; the fallback share page counts as no fill', async () => {
  const k = realAds({ showFails: 1004, loadFails: 1004 });
  const a = await k.ads.rewarded('bonus');
  assert.strictEqual(a.granted, true);
  assert.strictEqual(a.reason, 'noFillGrant');
  assert.strictEqual(a.toast, '暂无广告，本次免费');
  const b = await k.ads.rewarded('bonus');
  assert.strictEqual(b.granted, false);
  assert.strictEqual(b.toast, '暂无广告，请稍后再试');
  assert.strictEqual((await k.ads.rewarded('swap')).granted, true, 'another placement has its own grant');
  assert.strictEqual(k.l.events.filter((e) => e.name === 'ad_error').length, 3);
  // a new Beijing day, a new grant
  k.advance(86400e3);
  assert.strictEqual((await k.ads.rewarded('bonus')).granted, true);
  // useFallbackSharePage = no fill, never shown as a share page
  const k2 = realAds({ onShow: (ad) => ad.handlers.load({ useFallbackSharePage: true }) });
  const o = await k2.ads.rewarded('distribution');
  assert.strictEqual(o.reason, 'noFillGrant');
  // a rewarded error event after show also resolves once
  const k3 = realAds({ onShow: (ad) => setTimeout(() => ad.handlers.error({ errCode: 1000 }), 0) });
  assert.strictEqual((await k3.ads.rewarded('swap')).reason, 'noFillGrant');
  // one video at a time
  const k4 = realAds({ onShow: () => {} });
  const p1 = k4.ads.rewarded('bonus');
  assert.strictEqual((await k4.ads.rewarded('swap')).reason, 'busy');
  void p1;
});

test('AC59: interstitial caps (every 2nd set, not before 3 lifetime sets, 120 s apart, 6 a day) and 2001-2003 are silent', async () => {
  const k = realAds({});
  const due = (s, l) => k.ads.interstitialDue({ setsThisSession: s, lifetimeSets: l });
  assert.strictEqual(due(1, 1), false);
  assert.strictEqual(due(2, 2), false, 'not before 3 lifetime sets');
  assert.strictEqual(due(2, 3), true);
  assert.strictEqual(due(3, 4), false, 'every 2nd');
  assert.strictEqual(due(4, 5), true);
  assert.strictEqual(await k.ads.interstitial({ setsThisSession: 2, lifetimeSets: 3 }), true);
  assert.strictEqual(k.l.events.filter((e) => e.name === 'interstitial_show').length, 1);
  assert.strictEqual(due(4, 5), false, 'under 120 s apart');
  k.advance(119000);
  assert.strictEqual(due(4, 5), false);
  k.advance(2000);
  assert.strictEqual(due(4, 5), true);
  // daily cap of 6
  for (let i = 0; i < 5; i++) {
    k.advance(121000);
    assert.strictEqual(await k.ads.interstitial({ setsThisSession: 4, lifetimeSets: 9 }), true);
  }
  assert.strictEqual(k.store.state.interstitial.count, 6);
  k.advance(121000);
  assert.strictEqual(due(4, 9), false, '6 a day');
  k.advance(86400e3);
  assert.strictEqual(due(4, 9), true, 'the next day');
  // 2001-2003 are skipped silently: not counted, not shown, only an ad_error
  for (const code of [2001, 2002, 2003]) {
    const e = realAds({ interstitialFails: code });
    assert.strictEqual(await e.ads.interstitial({ setsThisSession: 2, lifetimeSets: 3 }), false);
    assert.strictEqual(e.store.state.interstitial.count, 0);
    assert.deepStrictEqual(e.l.events.map((x) => x.name), ['ad_request', 'ad_error']);
  }
  // remote config is honoured with the clamps (everyNSets 1 -> 2)
  const r = realAds({}, { getFeatures: () => normalizeFeatures({ interstitial: { everyNSets: 1, minLifetimeSets: 0 } }) });
  assert.strictEqual(r.ads.interstitialDue({ setsThisSession: 1, lifetimeSets: 2 }), false);
  assert.strictEqual(r.ads.interstitialDue({ setsThisSession: 2, lifetimeSets: 2 }), true);
  const off = realAds({}, { getFeatures: () => normalizeFeatures({ interstitial: { enabled: false } }) });
  assert.strictEqual(off.ads.interstitialDue({ setsThisSession: 2, lifetimeSets: 3 }), false);
});

test('AC61: stub mode logs stub:true and runs without ad units', async () => {
  const l = log();
  const ads = createAds({ wx: {}, config, store: memStore(), analytics: l, adUnits: {}, stub: { enabled: false }, getFeatures: () => null });
  assert.strictEqual(ads.stub, true, 'no ad unit means stub');
  const p = ads.rewarded('bonus');
  assert.ok(ads.overlay && ads.overlay.kind === 'rewarded');
  ads.stubSkip();
  assert.strictEqual((await p).granted, false);
  assert.ok(l.events.every((e) => e.props.stub === true));
});

test('banner: only on group, friend and archive screens in ready/empty-like states, with a unit id and the switch on', () => {
  const l = log();
  let feat = normalizeFeatures({ banner: { enabled: true, adUnitId: 'B1' } });
  const ads = createAds({ wx: {}, config, store: memStore(), analytics: l, adUnits: {}, stub: { enabled: true }, getFeatures: () => feat });
  assert.strictEqual(ads.syncBanner({ screen: 'group', state: 'ready' }, { left: 16, top: 600, width: 340 }), true);
  assert.strictEqual(ads.banner.screen, 'group');
  assert.strictEqual(ads.syncBanner({ screen: 'group', state: 'serverError' }), false);
  assert.strictEqual(ads.syncBanner({ screen: 'home', state: 'ready' }), false);
  assert.strictEqual(ads.syncBanner({ screen: 'friend', state: 'privacyDenied' }), false);
  assert.strictEqual(ads.syncBanner({ screen: 'archive', state: 'empty' }), true);
  assert.strictEqual(ads.syncBanner(null), false);
  feat = normalizeFeatures({ banner: { enabled: true } });
  assert.strictEqual(ads.syncBanner({ screen: 'group', state: 'ready' }), false, 'no unit id, no banner');
  feat = normalizeFeatures(null);
  assert.strictEqual(ads.syncBanner({ screen: 'group', state: 'ready' }), false, 'default off');
});

// ------------------------------------------------------------------ share

test('share titles and queries; no spoilers in the daily card; the round card carries no target', () => {
  assert.strictEqual(Sh.dailyTitle({ prompt: '火锅', left: '冷', right: '热' }, 412), '火锅是冷还是热？我今天和全国的默契分 412，你呢');
  assert.strictEqual(Sh.roundTitle('便宜', '贵'), '我出了一道刻度题：便宜↔贵，猜猜我心里的位置');
  assert.strictEqual(Sh.revealTitle(78), '刻度题揭晓：本题默契值 78');
  assert.strictEqual(Sh.dailyQuery('20261120'), 's=d&d=20261120');
  assert.strictEqual(Sh.roundQuery('ABCD2345'), 'r=ABCD2345');
  assert.strictEqual(Sh.groupQuery(), 's=g');
  const daily = Sh.dailyCardVm(12, [{ prompt: '火锅', left: '冷', right: '热', label: '很同频' }, { prompt: '一杯奶茶', left: '便宜', right: '贵', label: '有点偏' }], 412, '默契十足');
  const dump = JSON.stringify(daily);
  assert.ok(!/pos|median|nation|group|ref/i.test(Object.keys(daily).join() + Object.keys(daily.rows[0]).join()), 'no position fields');
  assert.strictEqual(daily.header, '群友刻度盘 · 每日刻度 第12期');
  assert.strictEqual(daily.footer, '今日默契分 412 · 默契十足');
  assert.strictEqual(daily.cta, '你会把指针放在哪？');
  assert.ok(!/\d/.test(JSON.stringify(daily.rows)), 'prompts and label blocks only');
  void dump;
  const round = Sh.roundCardVm('便宜', '贵', '一张电影票');
  assert.deepStrictEqual(Object.keys(round).sort(), ['clue', 'header', 'kind', 'left', 'right', 'ruler']);
  assert.strictEqual(Sh.roundCardVm('便宜', '贵', null).clue, '提示在群聊里');
  const reveal = Sh.revealCardVm('便宜', '贵', 63, [60, 70], 78);
  assert.strictEqual(reveal.mqText, '本题默契值 78 · 2 人作答');
  assert.ok(!/name|nick|openid/i.test(JSON.stringify(reveal)));
  assert.strictEqual(Sh.groupCardVm(81).mqText, '本群今日默契度 81');
  assert.strictEqual(Sh.groupCardVm(null).mqText, '本群今日刻度');
});

test('AC54: entry parsing per 7.5', () => {
  const e = (query, extra) => Sh.parseEnter(Object.assign({ scene: 1001, query }, extra || {}));
  assert.strictEqual(e({}).kind, 'none');
  assert.strictEqual(e('s=d&d=20261120').kind, 'daily');
  assert.strictEqual(e('s=d&d=20261120').dateKey, '20261120');
  assert.strictEqual(e({ s: 'd' }, { shareTicket: 'T' }).join, true);
  assert.strictEqual(e({ s: 'd' }).join, false);
  assert.strictEqual(e({ s: 'g' }, { shareTicket: 'T' }).kind, 'group');
  assert.strictEqual(e({ r: 'ABCD2345' }, { shareTicket: 'T' }).roundId, 'ABCD2345');
  assert.strictEqual(e({ r: 'short' }).kind, 'malformed');
  assert.strictEqual(e({ r: 'ABCD2345', x: '1' }).kind, 'round');
  assert.strictEqual(e({ wxad_fallback_share: '1' }).kind, 'fallbackShare');
  assert.strictEqual(e({ foo: 'bar' }).kind, 'malformed');
  assert.strictEqual(e('s=%E0%A4%A').kind, 'malformed');
  assert.strictEqual(Sh.parseEnter({ scene: 1107, query: { r: 'ABCD2345' } }).notice, true);
  assert.strictEqual(Sh.parseEnter(undefined).kind, 'none');
});

test('AC50/51: shares only happen from explicit calls; the capsule menu gives titles, never rewards', async () => {
  const shares = [];
  let menuHandler;
  const wx = {
    showShareMenu: () => {},
    updateShareMenu: () => {},
    onShareAppMessage: (f) => (menuHandler = f),
    shareAppMessage: (o) => shares.push(o),
  };
  const l = log();
  const share = Sh.createShare({ wx, api: {}, analytics: l });
  let ctx = null;
  share.register(() => ctx);
  assert.strictEqual(shares.length, 0, 'nothing is shared at startup');
  assert.strictEqual(menuHandler().title, Sh.DEFAULT_TITLE);
  ctx = { kind: 'daily', dateKey: '20261120', card1: { prompt: '火锅', left: '冷', right: '热' }, total: 400, card: {} };
  assert.strictEqual(menuHandler().query, 's=d&d=20261120');
  ctx = { kind: 'round', roundId: 'ABCD2345', left: '便宜', right: '贵', card: {} };
  assert.strictEqual(menuHandler().query, 'r=ABCD2345');
  assert.strictEqual(shares.length, 0, 'the menu never calls shareAppMessage by itself');
  await share.shareRound({ roundId: 'ABCD2345', left: '便宜', right: '贵', card: {} });
  assert.strictEqual(shares.length, 1);
  assert.strictEqual(shares[0].imageUrl, Sh.FALLBACK_IMAGE, 'no renderer: the static fallback');
  share.cardRenderer = () => Promise.reject(new Error('x'));
  await share.shareReveal({ roundId: 'ABCD2345', mq: 70, card: {} });
  assert.strictEqual(shares[1].imageUrl, Sh.FALLBACK_IMAGE);
  assert.ok(l.events.some((e) => e.name === 'error' && e.props.where === 'share_card'));
  share.cardRenderer = () => Promise.resolve('tmp://c.png');
  await share.shareGroup({ mq: null, card: {} });
  assert.strictEqual(shares[2].imageUrl, 'tmp://c.png');
  assert.strictEqual(shares[2].query, 's=g');
  assert.strictEqual(l.events.filter((e) => e.name === 'share_tap' && e.props.kind !== 'menu').length, 3, 'one share_tap per explicit share');
  assert.strictEqual(l.events.filter((e) => e.name === 'share_tap' && e.props.kind === 'menu').length, 3);
});

test('group entry: errors mean no group context and are classified', async () => {
  const mk = (info) => ({ getGroupEnterInfo: (o) => (info.fail ? o.fail({ errno: info.fail }) : o.success({ cloudID: 'c' })) });
  const run = async (info, joinResult) => {
    const l = log();
    const share = Sh.createShare({ wx: mk(info), api: { joinGroup: async () => joinResult }, analytics: l });
    const r = await share.enterGroup({ scene: 1044, chatType: 1 });
    return { r, ev: l.events[0] };
  };
  assert.strictEqual((await run({}, { ok: true, groupRef: 'ref' })).r.status, 'ok');
  assert.strictEqual((await run({ fail: 40097 })).ev.props.result, 'wrongScene');
  assert.strictEqual((await run({ fail: 65206 })).ev.props.result, 'leftGroup');
  assert.strictEqual((await run({}, { ok: false, code: 'NOT_GROUP' })).ev.props.result, 'notGroup');
  const x = await run({}, { ok: false, code: 'NETWORK' });
  assert.strictEqual(x.r.status, 'failed');
  assert.strictEqual(x.r.groupRef, null);
  const noApi = Sh.createShare({ wx: {}, api: {}, analytics: log() });
  assert.strictEqual((await noApi.enterGroup({})).status, 'failed');
});

// ------------------------------------------------------------------ view models (spec 10 strings)

test('reveal view model: lines, markers, group rule, bullseye boundary, small sample label', () => {
  let r = V.revealVm({ pos: 40, ref: 37, n: 100, agreePct: 63, group: null, mode: 'daily', live: true });
  assert.strictEqual(r.label, '很同频');
  assert.strictEqual(r.scoreText, '+' + (100 - Math.ceil(7.5)));
  assert.strictEqual(r.nationText, '全国 ◆ 在你左边 3 格 · 实时');
  assert.strictEqual(r.agreeText, '和全国 63% 的人想法相近');
  assert.strictEqual(r.groupText, null);
  assert.strictEqual(r.bullseye, false);
  assert.deepStrictEqual(r.markers.map((m) => m.kind), ['nation', 'you']);
  r = V.revealVm({ pos: 40, ref: 42, n: 5, agreePct: null, group: { median: 41, n: 4, dots: [30, 50] }, mode: 'daily', live: true });
  assert.strictEqual(r.bullseye, true, 'd = 2 is still 心有灵犀');
  assert.strictEqual(r.label, '心有灵犀');
  assert.strictEqual(r.scoreText, '+95');
  assert.strictEqual(r.nationText, '全国（样本少） ◆ 在你右边 2 格 · 实时');
  assert.strictEqual(r.agreeText, null);
  assert.strictEqual(r.groupText, '本群 4 人 ● 和你一样');
  assert.deepStrictEqual(r.markers.map((m) => m.kind), ['member', 'member', 'group', 'nation', 'you']);
  r = V.revealVm({ pos: 40, ref: 42.5, n: 100, agreePct: 50, group: { median: 60, n: 2, dots: [] }, mode: 'daily', live: true });
  assert.strictEqual(r.bullseye, false);
  assert.strictEqual(r.groupText, '本群 2 人 ● 在你右边 20 格');
  assert.strictEqual(V.revealVm({ pos: 50, ref: 50, n: 100, agreePct: 80, group: null, mode: 'daily', live: true }).nationText, '全国 ◆ 和你在同一格 · 实时');
  assert.strictEqual(V.revealVm({ pos: 50, ref: 10, n: 0, agreePct: null, group: null, mode: 'archive', live: false }).nationText, '全国 ◆ 在你左边 40 格 · 定分');
  assert.strictEqual(V.revealVm({ pos: 50, ref: 10, n: 0, agreePct: null, group: null, mode: 'archive', live: false }).label, '想法独特');
});

test('home view model strings', () => {
  const d = V.displayVm({});
  const f = V.featuresVm(null);
  const home = (o) => V.homeVm(Object.assign({ state: 'available', issueNo: 12, dateKey: '20261120', answered: 0, group: { status: 'none' }, muted: false, streak: { current: 0 } }, o), d, f);
  assert.strictEqual(home({}).daily.primaryLabel, '开始');
  assert.strictEqual(home({ state: 'inProgress', answered: 2 }).daily.statusText, '已答 2/5');
  assert.strictEqual(home({ state: 'inProgress', answered: 2 }).daily.primaryLabel, '继续');
  const done = home({ state: 'done', total: 412, final: false });
  assert.strictEqual(done.daily.scoreText, '今日默契分 412 · 默契十足 (实时)');
  assert.strictEqual(done.daily.subline, '明日 0:00 换新卡 · 0:30 定分');
  assert.strictEqual(home({ yesterday: { total: 421, pct: 68 } }).daily.yesterdayText, '昨日定分 421 · 超过全国 68%');
  assert.strictEqual(home({ yesterday: { total: 421, pct: null } }).daily.yesterdayText, '昨日定分 421');
  assert.strictEqual(home({ streak: { current: 5 } }).daily.streakText, '连续 5 天');
  assert.strictEqual(home({ streak: { current: 1 } }).daily.streakText, null);
  assert.strictEqual(home({ state: 'pendingSubmit' }).daily.statusText, '答案待发送');
  assert.strictEqual(home({ state: 'offline' }).daily.statusText, '今日卡片需联网获取');
  assert.strictEqual(home({ group: { status: 'ok' } }).group.bannerText, '来自群聊 · 查看本群今日默契 ›');
  assert.strictEqual(V.displayVm({ largeText: true, highContrast: true }).scale, 1.25);
  assert.strictEqual(V.displayVm({ highContrast: true }).palette, 'highContrast');
});

test('result view model: totals, percentile only when final, streak and group lines', () => {
  const cards = [0, 1, 2, 3, 4].map((i) => ({ itemId: 'x' + i, spectrumId: 's', left: '冷', right: '热', prompt: '卡' + i, catLabel: '吃喝' }));
  const base = { issueNo: 12, final: false, cards, pos: [10, 20, 30, 40, 50], refs: [10, 22, 30, 60, 50], pct: 68, divisiveIdx: 3, streak: { current: 5 }, group: null };
  let r = V.resultVm(base, V.displayVm({}), V.featuresVm(null));
  assert.strictEqual(r.totalText, String(100 + 95 + 100 + 50 + 100));
  assert.strictEqual(r.bandLabel, '默契十足');
  assert.strictEqual(r.statusTag, '实时');
  assert.strictEqual(r.percentileText, null);
  assert.strictEqual(r.streakText, '连续 5 天 · 0:30 定分');
  assert.strictEqual(r.divisiveText, '今日最有争议：卡3 (冷↔热)');
  assert.strictEqual(r.groupText, null);
  assert.deepStrictEqual(r.rows.map((x) => x.scoreText), ['+100', '+95', '+100', '+50', '+100']);
  assert.strictEqual(r.rows[3].label, '有点偏' === S_label(20) ? '有点偏' : '?');
  r = V.resultVm(Object.assign({}, base, { final: true, group: { gs: 388, mq: 81 } }), V.displayVm({}), V.featuresVm(null));
  assert.strictEqual(r.statusTag, '定分');
  assert.strictEqual(r.percentileText, '超过全国 68%');
  assert.strictEqual(r.streakText, '连续 5 天');
  assert.strictEqual(r.groupText, '本群群内默契分 388 · 本群默契度 81');
  assert.strictEqual(V.resultVm(Object.assign({}, base, { group: { gs: 388, mq: null } }), V.displayVm({}), V.featuresVm(null)).groupText, '本群群内默契分 388 · 本群完成满 3 人后计算默契度');
  assert.strictEqual(V.resultVm(Object.assign({}, base, { streak: { current: 1 }, final: true }), V.displayVm({}), V.featuresVm(null)).streakText, null);
});

function S_label(d) {
  return require('../core/score').labelFor(d).label;
}

test('round and group view models', () => {
  const d = V.displayVm({});
  const f = V.featuresVm(null);
  const rv = (o) => V.roundVm(Object.assign({ status: 'open', left: '便宜', right: '贵', clueText: '一张电影票', guessCount: 3 }, o), d, f);
  assert.strictEqual(rv({}).clueText, '提示：一张电影票');
  assert.strictEqual(rv({ clueText: null }).clueText, '提示在群聊里，看看 TA 怎么说');
  assert.strictEqual(rv({}).guessCountText, '已有 3 人作答');
  assert.strictEqual(rv({ status: 'submitted', guessCount: 5 }).guessCountText, '已提交 · 已有 5 人作答 · 等待揭晓');
  assert.strictEqual(rv({ status: 'hostWaiting', guessCount: 1 }).revealHint, '至少 2 人作答后可揭晓');
  assert.strictEqual(rv({ status: 'hostWaiting', guessCount: 5 }).revealHint, '第 8 人作答或 24 小时后自动揭晓');
  assert.strictEqual(rv({ status: 'noGuesses' }).guessCountText, '没有人作答，这道题结束了');
  assert.strictEqual(rv({ status: 'revealed', reveal: { target: 63, mq: 78, markers: [], rows: [] } }).reveal.mqText, '本题默契值 78');
  const markers = V.roundMarkers(63, [['a', 60, 90, 0, 0], ['me', 70, 80, 0, 0], ['c', 20, 0, 1, 0], ['h', null, null, 0, 1]], 'me');
  assert.deepStrictEqual(markers.map((m) => m.kind + m.pos), ['target63', 'member60', 'you70', 'late20']);
  const gv = (o) => V.groupVm(Object.assign({ state: 'ready', issueNo: 12, n: 6, mq: 81, viewerDone: true, divisiveIdx: 1, cards: [{ prompt: '火锅' }, { prompt: '一杯奶茶' }], trend: [], rounds: [] }, o), d, f);
  assert.strictEqual(gv({}).mqText, '本群今日默契度 81');
  assert.strictEqual(gv({}).countText, '已完成 6 人');
  assert.strictEqual(gv({}).divisiveText, '今日最有争议：一杯奶茶');
  assert.strictEqual(gv({ mq: null, n: 0 }).countText, '本群今天还没有人完成');
  const trend = [{ dateKey: '20261114', mq: 72 }, { dateKey: '20261115', mq: null }];
  assert.deepStrictEqual(gv({ trend }).trend.slice(-2), [{ label: '11/14', value: 72 }, { label: '11/15', value: null }]);
  assert.strictEqual(gv({ trend }).trend.length, 7);
  assert.strictEqual(gv({ rounds: [{ roundId: 'R', left: '便宜', right: '贵', mq: 78, status: 'revealed', guesses: 6 }] }).rounds[0].statusText, '已揭晓 · 6 人作答');
  assert.strictEqual(V.bannerVm({ banner: { enabled: true, adUnitId: 'B' } }, true).show, true);
  assert.strictEqual(V.bannerVm({ banner: { enabled: true, adUnitId: 'B' } }, false).show, false);
  assert.strictEqual(V.bannerVm(null, true).show, false);
});

test('archive view models', () => {
  const d = V.displayVm({});
  const f = V.featuresVm(null);
  const list = V.archiveListVm({ state: 'ready', bestStreak: 12, hasMore: true, items: [{ dateKey: '20261114', issueNo: 11, mine: { total: 421 } }, { dateKey: '20261113', issueNo: 10 }, { dateKey: '20261112', issueNo: 9, local: { total: 380 } }] }, d, f);
  assert.strictEqual(list.bestStreakText, '最长连续 12 天');
  assert.deepStrictEqual(list.items.map((i) => i.statusText), ['已玩 · 定分 421', '未玩 · 5 张卡', '往期练习 380']);
  assert.strictEqual(list.items[0].dateText, '11月14日');
  assert.strictEqual(V.archiveListVm({ state: 'empty', items: [] }, d, f).emptyText, '还没有往期，明天再来');
  assert.strictEqual(V.archiveListVm({ state: 'offline', items: [] }, d, f).errorText, '往期需联网查看');
  const day = V.archiveDayVm({ state: 'ready', dateKey: '20261114', issueNo: 11, kind: 'review', cards: [], finals: [], mine: { positions: [1, 2, 3, 4, 5], total: 421, pct: 68 } }, d, f);
  assert.strictEqual(day.mine.totalText, '421');
  assert.strictEqual(day.mine.percentileText, '超过全国 68%');
});

// ------------------------------------------------------------------ analytics

test('analytics: allowed events only, forbidden props stripped, batches of <= 50, retry, sessions', async () => {
  const sent = [];
  let fail = false;
  const api = { track: async (d) => (fail ? { ok: false } : (sent.push(d.events), { ok: true })) };
  const store = memStore();
  let t = 1000;
  const a = createAnalytics({ api, store, config, contentVersion: 1, appVersion: '0.1.0', now: () => t });
  assert.strictEqual(a.track('not_an_event', {}), false);
  a.track('card_open', { cardKind: 'daily', openid: 'secret', opengid: 'g', groupRef: 'r', groupid: 'x', shareTicket: 'T', roundId: 'ABC' });
  const ev = a.queue[0];
  assert.deepStrictEqual(Object.keys(ev.props).sort(), ['appVersion', 'cardKind', 'contentVersion', 'isNewUser', 'roundId']);
  assert.ok(typeof ev.sessionId === 'string' && ev.clientTs === 1000);
  assert.ok(!('sessionId' in ev.props), 'sessionId is top level');
  for (let i = 0; i < 120; i++) a.track('daily_card_place', { idx: i % 5 });
  await a.flush();
  assert.deepStrictEqual(sent.map((b) => b.length), [50, 50, 21]);
  assert.strictEqual(a.queue.length, 0);
  a.track('error', { where: 'x', code: 1 });
  fail = true;
  await a.flush();
  assert.strictEqual(a.queue.length, 1, 'a failed batch is kept');
  fail = false;
  await a.flush();
  assert.strictEqual(a.queue.length, 0);
  // sessions: a new one after > 30 minutes in the background
  const s1 = a.sessionId();
  a.onHide();
  t += 29 * 60 * 1000;
  assert.strictEqual(a.onShow({}), false);
  assert.strictEqual(a.sessionId(), s1);
  a.onHide();
  t += 31 * 60 * 1000;
  assert.strictEqual(a.onShow({ scene: 1 }), true);
  assert.notStrictEqual(a.sessionId(), s1);
  assert.strictEqual(a.queue.filter((e) => e.name === 'session_start').length, 1);
  // every spec 12 client event is allowed (and wx.reportEvent is not an option)
  ['session_start', 'card_open', 'howto_view', 'daily_card_place', 'daily_card_reveal', 'daily_complete', 'daily_result_view', 'share_tap', 'round_create', 'round_clue', 'round_guess', 'round_view', 'group_join', 'group_view', 'friend_board_view', 'archive_view', 'archive_set_complete', 'bonus_card', 'distribution_unlock', 'card_report', 'privacy_result', 'friend_scope_result', 'marker_write', 'ad_request', 'ad_show', 'ad_reward', 'ad_close_early', 'ad_error', 'interstitial_show', 'subscribe_offer', 'subscribe_result', 'display_setting', 'error'].forEach((n) => assert.ok(EVENTS.includes(n), n));
});

// ------------------------------------------------------------------ api wrapper in cloud mode

test('api (cloud mode): resolves, never rejects, 5 s submitCard timeout, bad responses and network errors become codes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let behaviour = 'ok';
  const calls = [];
  const wx = {
    cloud: {
      init: (o) => calls.push(['init', o]),
      callFunction: (o) => {
        calls.push([o.name, o.data]);
        if (behaviour === 'ok') o.success({ result: { ok: true, hello: o.name } });
        else if (behaviour === 'fail') o.fail({ errMsg: 'cloud.callFunction:fail' });
        else if (behaviour === 'junk') o.success({ result: 'nope' });
        else if (behaviour === 'throw') throw new Error('sync boom');
        /* 'hang': never answers */
      },
    },
  };
  const api = createApi({ wx, mode: 'cloud', env: 'ENV-1' });
  assert.deepStrictEqual(calls[0], ['init', { env: 'ENV-1', traceUser: false }]);
  assert.deepStrictEqual(await api.getDaily({ groupRef: 'g' }), { ok: true, hello: 'getDaily' });
  assert.deepStrictEqual(calls[1], ['getDaily', { groupRef: 'g' }]);
  behaviour = 'fail';
  assert.deepStrictEqual(await api.submitCard({}), { ok: false, code: 'NETWORK', message: 'cloud.callFunction:fail' });
  behaviour = 'junk';
  assert.strictEqual((await api.getArchive()).code, 'BAD_RESPONSE');
  behaviour = 'throw';
  assert.strictEqual((await api.getRound({ roundId: 'x' })).code, 'NETWORK');
  behaviour = 'hang';
  const p = api.submitCard({ dateKey: '20261120', idx: 0, pos: 5 });
  t.mock.timers.tick(4999);
  let settled = false;
  p.then(() => (settled = true));
  await sleep();
  assert.strictEqual(settled, false);
  t.mock.timers.tick(2);
  assert.deepStrictEqual(await p, { ok: false, code: 'TIMEOUT', message: 'timeout' });
  // getDaily has its own, longer budget
  const q = api.getDaily({});
  t.mock.timers.tick(9999);
  await sleep();
  t.mock.timers.tick(2);
  assert.strictEqual((await q).code, 'TIMEOUT');
  assert.ok(api.NAMES.indexOf('genDaily') < 0 && api.NAMES.indexOf('finalizeDay') < 0, 'timer functions are not client calls');
  assert.strictEqual(api.NAMES.length, 17);
  const mock = createApi({ mode: 'mock', openid: 'a' });
  assert.ok((await mock.getDaily({})).ok);
  assert.strictEqual(mock.as('b').openid, 'b');
});

// ------------------------------------------------------------------ privacy and store

test('privacy: the gate, the marker write (one key {d,s}), refusal 104 and the later flush', async () => {
  const l = log();
  const store = memStore();
  const writes = [];
  let mode = 'ok';
  const wx = {
    getPrivacySetting: (o) => o.success({ needAuthorization: true }),
    requirePrivacyAuthorize: (o) => (mode === 'refuse' ? o.fail({ errno: 104 }) : o.success({})),
    getSetting: (o) => o.success({ authSetting: {} }),
    authorize: (o) => o.success({}),
    setUserCloudStorage: (o) => (mode === 'refuse' ? o.fail({ errno: 104 }) : (writes.push(o.KVDataList), o.success({}))),
  };
  const p = createPrivacy({ wx, store, analytics: l });
  assert.deepStrictEqual(p.status(), { privacy: 'unknown', friendScope: 'unknown', markerPending: false });
  assert.strictEqual(p.friendDataEnabled(), false);
  mode = 'refuse';
  assert.strictEqual(await p.writeMarker('20261120', 412), 'privacyDenied');
  assert.deepStrictEqual(store.state.privacy.markerPending, { dateKey: '20261120', total: 412 });
  assert.strictEqual((await p.ensureForNames('t')).state, 'privacyDenied');
  assert.strictEqual(writes.length, 0);
  mode = 'ok';
  const g = await p.ensureForNames('t');
  assert.strictEqual(g.state, 'ok');
  assert.strictEqual(p.friendDataEnabled(), true);
  assert.strictEqual(writes.length, 1, 'the held marker was written after the agreement');
  assert.deepStrictEqual(writes[0], [{ key: 'kd', value: JSON.stringify({ d: '20261120', s: 412 }) }]);
  assert.strictEqual(store.state.privacy.markerPending, null);
  assert.strictEqual(l.events.filter((e) => e.name === 'privacy_result').length >= 2, true);
  // no wx.getSetting -> unknown, no crash
  const q = createPrivacy({ wx: {}, store: memStore(), analytics: l });
  assert.strictEqual(await q.readScope(), 'unknown');
  assert.strictEqual(await q.writeMarker('20261120', 1), 'error');
});

test('store: round trip, corrupt storage ignored, defaults', () => {
  const mem = {};
  const wx = { getStorageSync: (k) => mem[k], setStorageSync: (k, v) => (mem[k] = v) };
  const a = createStore(wx);
  assert.strictEqual(a.state.muted, false);
  assert.strictEqual(a.state.lifetimeSets, 0);
  a.state.muted = true;
  a.state.archive.results['20261119'] = { total: 300 };
  a.save();
  const b = createStore(wx);
  assert.strictEqual(b.state.muted, true);
  assert.strictEqual(b.state.archive.results['20261119'].total, 300);
  mem[KEY] = '{not json';
  assert.strictEqual(createStore(wx).state.muted, false);
  mem[KEY] = JSON.stringify({ v: 99, muted: true });
  assert.strictEqual(createStore(wx).state.muted, false, 'unknown versions are ignored');
  assert.strictEqual(createStore(null).state.v, 1);
});
