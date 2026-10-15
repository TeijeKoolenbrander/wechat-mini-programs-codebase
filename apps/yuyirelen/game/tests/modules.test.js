'use strict';
/** Unit tests of the client modules that do not need the whole app: view models, ads, share entry, analytics, api, store, keyboard. */
const test = require('node:test');
const assert = require('node:assert');
const V = require('../js/vm');
const P = require('../core/play');
const { getConfig } = require('../core/config');
const { createAds } = require('../js/ads');
const { parseEnter, parseQuery } = require('../js/share');
const { createAnalytics } = require('../js/analytics');
const { createApi } = require('../js/api');
const { createStore, KEY } = require('../js/store');
const { createKeyboard } = require('../js/keyboard');
const { boot, tapAndSettle } = require('./harness');

const cfg = getConfig(1);
const D = { largeText: false, highContrast: false };
const entries = (list) => list.map(([word, r, src, extra]) => P.toEntry(Object.assign({ word, r, t: Math.max(0, 100 - Math.round(Math.log(r) * 9)), src: src || 'chip' }, extra || {}), 30000));

// ---------------------------------------------------------------- home

test('home view model: every daily state has its copy and primary action (spec 8.1, AC 94)', () => {
  const home = (daily, extra) => V.homeVm(daily, Object.assign({ streak: { current: 0, best: 0 }, display: D }, extra || {}));
  const base = { issueNo: 128, dateKey: '20261120', puzzleId: 'd20261120' };
  let d = home(Object.assign({ state: 'loading' }, base)).daily;
  assert.deepEqual([d.sub, d.primary.disabled], ['正在取今日一词…', true]);
  d = home(Object.assign({ state: 'available' }, base)).daily;
  assert.deepEqual([d.title, d.sub, d.primary.label, d.primary.id], ['今日一词 · 第 128 期', '全国同一个词，第 1 名就是答案', '开始猜', 'home:daily']);
  d = home(Object.assign({ state: 'inProgress', steps: 12, best: 37 }, base)).daily;
  assert.deepEqual([d.sub, d.primary.label, d.bestLabel], ['已猜 12 步 · 最近第 37 名', '继续猜', '最近第 37 名']);
  d = home(Object.assign({ state: 'solved', steps: 21 }, base)).daily;
  assert.deepEqual([d.sub, d.primary.label, d.secondary.label, d.secondary.id, d.footnote], ['今日 21 步猜中', '查看答案', '再来一题', 'home:next', '明日 0:00 换新词']);
  d = home(Object.assign({ state: 'gaveup' }, base)).daily;
  assert.deepEqual([d.sub, d.primary.label, d.secondary.label], ['今日未猜中', '查看答案', '再来一题']);
  d = home(Object.assign({ state: 'unavailable' }, base)).daily;
  assert.deepEqual([d.sub, d.primary.label, d.primary.id], ['今日一词暂未发布', '练习一题', 'home:practice']);
  for (const st of ['offline', 'error']) {
    d = home(Object.assign({ state: st }, base)).daily;
    assert.deepEqual([d.sub, d.primary.label, d.primary.id], ['今日一词需联网获取', '重试', 'home:retry']);
  }
  const vm = home(Object.assign({ state: 'available' }, base), { streak: { current: 5, best: 12 }, hasGroupContext: true, muted: true });
  assert.deepEqual(vm.streak, { current: 5, best: 12, show: true, label: '连续猜中 5 天' });
  assert.equal(vm.groupLine, '来自群聊 · 查看本群今日战况');
  assert.equal(home(Object.assign({ state: 'available' }, base), { streak: { current: 1, best: 3 } }).streak.show, false);
  assert.equal(vm.howto.lines.length, 3);
});

// ---------------------------------------------------------------- play

function play(over) {
  return V.playVm(
    Object.assign(
      { cfg, puzzleId: 'd20261120', kind: 'daily', ranked: true, issueNo: 128, practiceNo: null, state: 'ready', status: 'playing', guesses: [], hintsUsed: [], adHints: 0, firstChar: null, warmups: ['天气', '美食', '工作', '动物', '旅行', '家', '多余'], latestWord: null, selectedWord: null, chips: [], pending: null, kb: { open: false, text: '', suggestions: [], heightPx: null }, toast: null, banner: null, coach: 0, flashWord: null, sheet: null, adBusy: false, display: D, t: 0 },
      over || {}
    )
  );
}

test('play view model: ready shows exactly 6 热身词 and nothing else (AC 27)', () => {
  const vm = play();
  assert.deepEqual(vm.warmups, ['天气', '美食', '工作', '动物', '旅行', '家']);
  assert.equal(vm.latest, null);
  assert.deepEqual(vm.ladder, []);
  assert.equal(vm.title, '今日一词 第128期');
  assert.equal(vm.stepsLabel, '已猜 0 步');
  assert.equal(vm.hint.label, '第 10 步后可用提示');
  assert.equal(vm.adHint.visible, false);
});

test('play view model: result shows 刚猜, chips for the selected word, the ladder closest first (AC 29, 32, 33)', () => {
  const g = entries([['动物', 9812, 'warmup'], ['蔬菜', 37], ['火锅', 152], ['厨房', 410]]);
  let vm = play({ state: 'result', guesses: g, latestWord: '厨房', selectedWord: '厨房', chips: ['a', 'b', 'c', 'd', 'e', 'f'] });
  assert.deepEqual(vm.ladder.map((r) => r.word), ['蔬菜', '火锅', '厨房', '动物']);
  assert.deepEqual([vm.latest.word, vm.latest.rankLabel, vm.latest.bandLabel, vm.latest.isLatest], ['厨房', '第 410 名', '热', true]);
  assert.equal(vm.chips.length, 5);
  assert.equal(vm.chipsTitle, '顺着「厨房」想：');
  assert.equal(vm.warmups.length, 0);
  assert.equal(vm.ladder[3].rankLabel, '第 9,812 名');
  assert.equal(vm.ladder[3].bandLabel, '冷');
  vm = play({ state: 'result', guesses: g, latestWord: '厨房', selectedWord: '火锅', chips: ['x'] });
  assert.equal(vm.chipsTitle, '顺着「火锅」想：');
  assert.equal(vm.latest.word, '厨房');
  // every row carries the band as a word, not just a colour (AC 31)
  assert.ok(vm.ladder.every((r) => r.bandLabel.length >= 1 && r.band));
});

test('play view model: waiting shows the pending word with a pulsing bar and offline shows the retry text (spec 8.2)', () => {
  const vm = play({ state: 'waiting', pending: { word: '火锅', src: 'chip', clientGuessId: 'x' }, guesses: entries([['蔬菜', 37]]), latestWord: '蔬菜' });
  assert.equal(vm.latest.pending, true);
  assert.equal(vm.latest.word, '火锅');
  assert.equal(play({ state: 'offline' }).pendingError, '网络开小差了');
});

test('play view model: hint states locked / available / exhausted / atBest (AC 42, 46)', () => {
  const many = (n, best) => entries(Array.from({ length: n }, (_, i) => ['w' + i, i === 0 ? best : 5000 + i]));
  assert.deepEqual(play({ guesses: many(9, 900) }).hint, { next: 1, state: 'locked', label: '第 10 步后可用提示' });
  assert.deepEqual(play({ guesses: many(10, 900) }).hint, { next: 1, state: 'available', label: '提示 1 可用' });
  assert.deepEqual(play({ guesses: many(10, 2) }).hint, { next: 1, state: 'atBest', label: '已经只差一步了' });
  assert.deepEqual(play({ guesses: many(30, 900), hintsUsed: [1, 2] }).hint, { next: 3, state: 'available', label: '提示 3 可用' });
  assert.equal(play({ guesses: many(30, 2), hintsUsed: [1, 2] }).hint.state, 'available', 'the first-character hint is not blocked by atBest');
  assert.deepEqual(play({ guesses: many(41, 900), hintsUsed: [1, 2, 3, 4] }).hint, { next: null, state: 'exhausted', label: '提示已用完' });
});

test('play view model: rewarded button only in unranked plays, 3 per puzzle (AC 47, 48)', () => {
  assert.equal(play({ ranked: true }).adHint.visible, false);
  const vm = play({ ranked: false, kind: 'practice', practiceNo: 12, adHints: 1 });
  assert.deepEqual(vm.adHint, { visible: true, left: 2, busy: false });
  assert.equal(vm.title, '练习 #12');
  assert.equal(play({ ranked: false, kind: 'archive', issueNo: 97 }).title, '往期 第97期');
  assert.equal(play({ ranked: false, status: 'solved', state: 'solvedAnim' }).adHint.visible, false);
});

test('play view model: first character label, banner, coach, keyboard, menu and how-to sheets (spec 8.2)', () => {
  const vm = play({ firstChar: '番', banner: '今日一词已结束，本局不计入榜单', coach: 2, kb: { open: true, text: '番', suggestions: ['番茄', '番茄酱', '番薯', 'a', 'b', 'c', 'd'], heightPx: 300 } });
  assert.equal(vm.firstCharLabel, '首字：番');
  assert.equal(vm.banner, '今日一词已结束，本局不计入榜单');
  assert.equal(vm.coach, 2);
  assert.equal(vm.keyboard.suggestions.length, 6);
  assert.equal(vm.keyboard.heightPx, 300);
  const m = play({ sheet: 'menu' });
  assert.deepEqual(m.menu.items.map((i) => i.id), ['menu:giveup', 'menu:howto']);
  assert.equal(play({ sheet: 'howto' }).howto.lines.length, 3);
  // hints count includes the rewarded ones
  assert.equal(play({ hintsUsed: [1], adHints: 2 }).hintsUsed, 3);
});

// ---------------------------------------------------------------- reveal

function reveal(over) {
  return V.revealVm(
    Object.assign(
      { puzzleId: 'd1', kind: 'daily', ranked: true, issueNo: 128, practiceNo: null, answer: '番茄', outcome: 'solved', guesses: entries([['动物', 9812, 'warmup'], ['蔬菜', 37], ['番茄', 1]]), hintsUsed: [1], adHints: 0, stats: null, streak: null, top: { state: 'ready', items: [] }, compare: null, sheet: null, scrollY: 0, nextBusy: false, display: D, t: 0 },
      over || {}
    )
  );
}

test('reveal view model: summary, chart, stats and streak lines (spec 8.4, AC 53)', () => {
  let vm = reveal({});
  assert.equal(vm.title, '今日一词 · 第 128 期');
  assert.equal(vm.summary, '3 步猜中 · 用了 1 次提示');
  assert.equal(vm.temps.length, 3);
  assert.equal(vm.temps[2], 100);
  assert.equal(vm.bands[2], 'hit');
  assert.equal(vm.stats.show, false);
  assert.deepEqual(vm.streak, { show: false, label: '' });
  vm = reveal({ stats: { finishers: 2315, medianSteps: 21, pctBetter: 64 }, streak: { current: 5, best: 5 } });
  assert.equal(vm.stats.line1, '今日 2,315 人猜中 · 中位数 21 步');
  assert.equal(vm.stats.line2, '你比 64% 的人少用了步数');
  assert.equal(vm.streak.label, '连续猜中 5 天');
  assert.equal(reveal({ stats: { finishers: 29, medianSteps: 21, pctBetter: 64 } }).stats.show, false);
  // unranked: no percentile or streak
  vm = reveal({ ranked: false, kind: 'archive', issueNo: 97, stats: { finishers: 100, medianSteps: 20, pctBetter: 50 }, streak: { current: 5 } });
  assert.equal(vm.title, '往期 · 第 97 期');
  assert.equal(vm.stats.line2, undefined);
  assert.equal(vm.streak.show, false);
  assert.equal(reveal({ ranked: false, kind: 'practice', practiceNo: 12 }).title, '练习 #12');
  // gave up
  vm = reveal({ outcome: 'gaveup', guesses: entries([['动物', 9812], ['蔬菜', 37]]), hintsUsed: [] });
  assert.equal(vm.summary, '未猜中 · 最近第 37 名');
  assert.equal(vm.answerLabel, '答案');
  assert.equal(vm.streak.show, false);
  assert.equal(vm.nextLabel, '再来一题');
});

test('reveal view model: comparison and list states (spec 8.7)', () => {
  const vm = reveal({ compare: { theirSteps: 21, theirStatus: 'solved', theirTemps: [1, 2], theirWords: ['a'] } });
  assert.equal(vm.compare.line, '你 3 步 · TA 21 步');
  assert.deepEqual(vm.compare.theirWords, ['a']);
  const noWords = reveal({ compare: { theirSteps: 21, theirStatus: 'solved', theirTemps: [] } });
  assert.ok(!('theirWords' in noWords.compare));
  assert.equal(reveal({ top: { state: 'error', items: [] } }).top.errorText, '列表暂时打不开');
  assert.equal(reveal({ top: { state: 'loading', items: [] } }).top.state, 'loading');
});

// ---------------------------------------------------------------- other screens

test('challenge, board and archive view models carry their copy', () => {
  let c = V.challengeVm({ status: 'ready', puzzleId: 'd1', kind: 'daily', issueNo: 128, owner: { status: 'solved', steps: 21, hints: 1, temps: [1] }, countsAsToday: true, alreadyFinished: false }, D, 0);
  assert.deepEqual([c.headline, c.note, c.primaryLabel, c.secondaryLabel], ['好友在第 128 期用了 21 步', '这就是今日一词，计入今日榜单', '我来猜', '先去首页看看']);
  c = V.challengeVm({ status: 'ready', puzzleId: 'p12', kind: 'practice', practiceNo: 12, owner: { status: 'gaveup', steps: 30, hints: 0, temps: [] }, countsAsToday: false }, D, 0);
  assert.deepEqual([c.headline, c.note], ['好友在练习 #12没有猜中', '往期题，不计入榜单']);
  c = V.challengeVm({ status: 'own', puzzleId: 'd1', kind: 'daily', issueNo: 5, owner: { status: 'solved', steps: 9, hints: 0, temps: [] }, own: { finishers: 3, bestSteps: 11 } }, D, 0);
  assert.deepEqual([c.sub, c.ownLine], ['这是你分享的成绩', '已有 3 位好友完成 · 最少 11 步']);
  assert.equal(V.challengeVm({ status: 'notFound' }, D, 0).headline, '这道题找不到了');
  assert.equal(V.challengeVm({ status: 'offline' }, D, 0).primaryLabel, '重试');

  const b = (state, extra) => V.boardVm(Object.assign({ kind: 'group', state, issueNo: 128, rowCount: 7, self: { status: 'solved', steps: 21 } }, extra || {}), { bannerEnabled: true, display: D, t: 0 });
  assert.equal(b('ready').title, '本群 · 今日一词 第128期');
  assert.equal(b('ready').footer, '已有 7 人参与 · 成绩经服务器校验');
  assert.equal(b('ready', { kind: 'friend' }).title, '好友 · 今日一词 第128期');
  assert.equal(b('privacyDenied').myLine, '你今日 21 步猜中');
  assert.equal(b('scopeDenied', { self: { status: 'gaveup', steps: 30 } }).myLine, '你今日未猜中');
  assert.equal(b('ready', { self: { status: 'none', steps: 0 } }).viewerPlayed, false);
  for (const st of ['ready', 'empty']) assert.equal(b(st).bannerVisible, true, st);
  for (const st of ['loading', 'error', 'noGroup', 'checkingGroup', 'privacyDenied', 'scopeDenied']) assert.equal(b(st).bannerVisible, false, st);
  assert.equal(V.boardVm({ kind: 'group', state: 'ready', rowCount: 1, self: null }, { bannerEnabled: false, display: D }).bannerVisible, false);

  const a = V.archiveVm(
    {
      state: 'ready',
      bestStreak: 12,
      items: [
        { puzzleId: 'd5', issueNo: 128, dateKey: '20261015', today: true, my: { status: 'solved', steps: 21 } },
        { puzzleId: 'd4', issueNo: 127, dateKey: '20261014', my: { status: 'solved', steps: 18 }, answer: '番薯' },
        { puzzleId: 'd3', issueNo: 126, dateKey: '20261013' },
        { puzzleId: 'd2', issueNo: 125, dateKey: '20261012', my: { status: 'playing', steps: 9 } },
        { puzzleId: 'd1', issueNo: 124, dateKey: '20261011', my: { status: 'gaveup', steps: 30 }, answer: '土豆' },
      ],
      hasMore: true,
      practice: { done: 3, total: 300 },
    },
    D,
    0
  );
  assert.equal(a.bestStreakLabel, '最长连续猜中 12 天');
  assert.deepEqual(a.items.map((i) => i.line), ['今日 · 21步猜中', '番薯 · 18步', '未玩  去猜', '进行中 9步', '土豆 · 未猜中']);
  assert.deepEqual(a.items.map((i) => i.status), ['today', 'solved', 'unplayed', 'playing', 'gaveup']);
  assert.equal(a.items[1].title, '第127期 10月14日');
  assert.equal(a.items[2].answer, undefined);
  assert.equal(a.practice.line, '练习题  已完成 3 / 300');
  assert.equal(a.hasMore, true);
  assert.equal(V.archiveVm({ state: 'empty', items: [], practice: { done: 0, total: 3 } }, D, 0).emptyText, '还没有往期，先去练习吧');
  assert.equal(V.archiveVm({ state: 'error', items: [], practice: { done: 0, total: 0 } }, D, 0).errorText, '往期需联网查看');
});

test('board message for the open data domain: server rows only, group via ticket (AC 81)', () => {
  const payload = { dateKey: '20261120', issueNo: 20, salt: 's', selfHash: 'h', mode: 'full', rows: [['abc', 1, 14, 0, 1, 3600]] };
  const m = V.boardMessage('group', payload, { shareTicket: 'tk', board: { w: 343, h: 400 }, dpr: 3 });
  assert.deepEqual([m.type, m.kind, m.width, m.height, m.dpr, m.shareTicket], ['render', 'group', 343, 400, 3, 'tk']);
  assert.deepEqual(m.rows, payload.rows);
  assert.equal(V.boardMessage('friend', payload, { shareTicket: 'tk', board: { w: 1, h: 1 } }).shareTicket, undefined);
  assert.equal(V.boardMessage('group', payload, { groupid: 'g', shareTicket: 'tk', board: { w: 1, h: 1 } }).groupid, 'g');
});

// ---------------------------------------------------------------- entry parsing

test('entry routing table (spec 9.3)', () => {
  const k = (o) => parseEnter(o).kind;
  assert.equal(k({ query: { c: 'AbC12345' } }), 'challenge');
  assert.equal(parseEnter({ query: { c: 'AbC12345' }, shareTicket: 't' }).join, true);
  assert.equal(parseEnter({ query: { c: 'AbC12345' } }).join, false);
  assert.equal(k({ query: 'c=AbC12345' }), 'challenge');
  assert.equal(k({ query: { c: 'short' } }), 'malformed');
  assert.equal(k({ query: { p: 'd20261120' } }), 'puzzle');
  assert.equal(parseEnter({ query: { p: 'p12' } }).puzzleId, 'p12');
  assert.equal(k({ query: { p: 'zzz' } }), 'malformed');
  assert.equal(k({ query: { s: 'm' } }), 'menu');
  assert.equal(k({ query: {}, shareTicket: 't' }), 'menu');
  assert.equal(parseEnter({ query: {}, shareTicket: 't' }).join, true);
  assert.equal(k({ query: {} }), 'none');
  assert.equal(k({}), 'none');
  assert.equal(k(undefined), 'none');
  assert.equal(k({ query: { wxad_fallback_share: '1' } }), 'fallbackShare');
  assert.equal(k({ query: { x: '1' } }), 'malformed');
  assert.equal(k({ query: 'c=%E0%A4%A' }), 'malformed');
  assert.deepEqual(parseQuery('a=1&b=%E6%9C%88'), { a: '1', b: '月' });
});

// ---------------------------------------------------------------- ads

function adsEnv(over) {
  const events = [];
  const store = { state: { interstitial: { day: '', count: 0, lastAt: 0 } }, save() {} };
  let t = Date.UTC(2026, 10, 20, 4);
  const o = Object.assign({ wx: {}, config: cfg, store, analytics: { track: (n, p) => events.push([n, p]) }, adUnits: {}, stub: { enabled: true }, now: () => t }, over || {});
  const ads = createAds(o);
  return { ads, events, store, tick: (ms) => (t += ms), wx: o.wx };
}

test('interstitialDue: session even count, lifetime >= 3, gap and daily caps, card entry (AC 90)', () => {
  const e = adsEnv();
  const due = (s, l, x) => e.ads.interstitialDue(Object.assign({ sessionFinished: s, lifetimeFinished: l }, x || {}));
  assert.equal(due(2, 2), false, 'before the 3rd lifetime puzzle');
  assert.equal(due(2, 3), true);
  assert.equal(due(3, 3), false);
  assert.equal(due(4, 10), true);
  assert.equal(due(0, 10), false);
  assert.equal(due(2, 10, { blocked: true }), false, 'a sheet or the keyboard is open');
  assert.equal(due(2, 10, { firstFromCard: true }), true, 'the card puzzle was not the one that just finished');
  assert.equal(due(1, 10, { firstFromCard: true }), false);
  e.store.state.interstitial = { day: '20261120', count: 5, lastAt: 0 };
  assert.equal(due(2, 10), false, 'max 5 per day');
  e.store.state.interstitial = { day: '20261119', count: 5, lastAt: 0 };
  assert.equal(due(2, 10), true, 'a new day resets');
  e.store.state.interstitial = { day: '20261120', count: 1, lastAt: Date.UTC(2026, 10, 20, 4) - 60000 };
  assert.equal(due(2, 10), false, 'minimum gap 120 s');
  e.tick(61000);
  assert.equal(due(2, 10), true);
});

test('ads remote config is clamped (spec 12)', () => {
  const e = adsEnv();
  e.ads.applyRemote({ interstitial: { everyNPuzzles: 1, minLifetime: 0, minGapSec: 1, maxPerDay: 99 }, banner: { enabled: true, adUnitId: 'b' } });
  assert.deepEqual(e.ads.config().interstitial, { everyNPuzzles: 2, minLifetime: 2, minGapSec: 60, maxPerDay: 8 });
  assert.equal(e.ads.bannerEnabled(), true);
  e.ads.applyRemote(null);
  assert.equal(e.ads.bannerEnabled(), false);
});

test('rewarded video (real mode): disableFallbackSharePage, isEnded, fallback share page as no-fill, errors (AC 87-89)', async () => {
  const created = [];
  let handlers = {};
  const wx = {
    createRewardedVideoAd: (o) => {
      created.push(o);
      return {
        onClose: (f) => (handlers.close = f),
        onError: (f) => (handlers.error = f),
        onLoad: (f) => (handlers.load = f),
        show: () => Promise.resolve(),
        load: () => Promise.resolve(),
      };
    },
  };
  const e = adsEnv({ wx, adUnits: { rewarded: 'adunit-r', interstitial: 'adunit-i' }, stub: { enabled: false } });
  assert.equal(e.ads.stub, false);
  // watched to the end
  let p = e.ads.rewarded('hint', 'pz1');
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(created, [{ adUnitId: 'adunit-r', disableFallbackSharePage: true }]);
  handlers.close({ isEnded: true });
  assert.equal((await p).granted, true);
  // closed early
  p = e.ads.rewarded('hint', 'pz1');
  await new Promise((r) => setImmediate(r));
  handlers.close({ isEnded: false });
  const early = await p;
  assert.deepEqual([early.granted, early.toast], [false, '完整观看才能获得提示']);
  // the platform fallback share page is no-fill: free once per puzzle, then blocked
  p = e.ads.rewarded('hint', 'pz1');
  await new Promise((r) => setImmediate(r));
  handlers.load({ useFallbackSharePage: true });
  let out = await p;
  assert.deepEqual([out.granted, out.reason, out.toast], [true, 'noFillGrant', '暂无广告，本次免费']);
  p = e.ads.rewarded('hint', 'pz1');
  await new Promise((r) => setImmediate(r));
  handlers.error({ errCode: 1004 });
  out = await p;
  assert.deepEqual([out.granted, out.reason, out.toast], [false, 'noFillBlocked', '暂无广告，请稍后再试']);
  // a different puzzle gets its own free grant
  p = e.ads.rewarded('hint', 'pz2');
  await new Promise((r) => setImmediate(r));
  handlers.error({ errCode: 1000 });
  assert.equal((await p).granted, true);
  assert.ok(e.events.some((x) => x[0] === 'ad_close_early'));
  assert.ok(e.events.filter((x) => x[0] === 'ad_error').length === 3);
});

test('interstitial (real mode): rejections 2001-2003 are silent and uncounted (AC 91)', async () => {
  const wx = { createInterstitialAd: () => ({ show: () => Promise.reject({ errCode: 2002 }) }) };
  const e = adsEnv({ wx, adUnits: { rewarded: 'r', interstitial: 'i' }, stub: { enabled: false } });
  assert.equal(await e.ads.interstitial({ sessionFinished: 2, lifetimeFinished: 5 }), false);
  assert.equal(e.store.state.interstitial.count, 0);
  assert.ok(e.events.some((x) => x[0] === 'ad_error' && x[1].errCode === 2002));
  assert.ok(!e.events.some((x) => x[0] === 'interstitial_show' || x[0] === 'ad_show'));
  const ok = adsEnv({ wx: { createInterstitialAd: () => ({ show: () => Promise.resolve() }) }, adUnits: { rewarded: 'r', interstitial: 'i' }, stub: { enabled: false } });
  assert.equal(await ok.ads.interstitial({ sessionFinished: 2, lifetimeFinished: 5 }), true);
  assert.equal(ok.store.state.interstitial.count, 1);
  assert.equal(ok.events.find((x) => x[0] === 'interstitial_show')[1].finishedThisSession, 2);
});

// ---------------------------------------------------------------- analytics, api, store, keyboard

test('analytics: unknown events and typed-text props are dropped, failed batches are kept or dropped sensibly', async () => {
  const sent = [];
  let reply = { ok: true };
  const api = { track: (d) => (sent.push(d), Promise.resolve(reply)) };
  const store = { state: { firstDate: '20261120' } };
  const a = createAnalytics({ api, store, config: cfg, now: () => Date.UTC(2026, 10, 20, 4) });
  assert.equal(a.track('not_an_event', {}), false);
  a.track('guess_rejected', { reason: 'oov', len: 3, text: 'abc', input: 'x', query: 'y', openid: 'o', groupRef: 'g' });
  assert.deepEqual(Object.keys(a.queue[0].props).filter((k) => ['text', 'input', 'query', 'openid', 'groupRef'].includes(k)), []);
  assert.equal(a.queue[0].props.len, 3);
  reply = { ok: false, code: 'NETWORK' };
  await a.flush();
  assert.equal(a.queue.length, 1, 'network failure keeps the batch');
  reply = { ok: false, code: 'BAD_EVENT' };
  await a.flush();
  assert.equal(a.queue.length, 0, 'a rejected batch is dropped, not retried forever');
  for (let i = 0; i < 120; i++) a.track('guess', { step: i });
  reply = { ok: true };
  await a.flush();
  assert.deepEqual(sent.slice(-3).map((s) => s.events.length), [50, 50, 20]);
});

test('api cloud mode: success, failure and timeout all resolve to {ok,code} (never reject)', async () => {
  const timers = [];
  const mk = (cloud) => createApi({ wx: { cloud: Object.assign({ init() {} }, cloud) }, mode: 'cloud', env: 'e', setTimeout: (f, ms) => (timers.push([f, ms]), timers.length), clearTimeout() {} });
  const ok = mk({ callFunction: (o) => o.success({ result: { ok: true, x: 1 } }) });
  assert.deepEqual(await ok.guess({ word: 'a' }), { ok: true, x: 1 });
  const fail = mk({ callFunction: (o) => o.fail({ errMsg: 'boom' }) });
  assert.deepEqual(await fail.getDaily(), { ok: false, code: 'NETWORK', msg: 'boom' });
  const bad = mk({ callFunction: (o) => o.success({}) });
  assert.equal((await bad.getDaily()).code, 'BAD_RESPONSE');
  const throws = mk({ callFunction: () => { throw new Error('x'); } });
  assert.equal((await throws.near({})).code, 'NETWORK');
  const hang = mk({ callFunction: () => {} });
  const pending = hang.guess({ word: 'a' });
  const [fire, ms] = timers[timers.length - 1];
  assert.equal(ms, 5000);
  fire();
  assert.equal((await pending).code, 'TIMEOUT');
  assert.ok(hang.NAMES.includes('startPuzzle') && hang.NAMES.includes('getReveal'));
});

test('store: round trip, bad data falls back, finished cache is capped', () => {
  const mem = {};
  const wx = { getStorageSync: (k) => mem[k], setStorageSync: (k, v) => (mem[k] = v) };
  const s = createStore(wx);
  s.state.muted = true;
  s.state.display.largeText = true;
  for (let i = 0; i < 100; i++) s.state.finished['d' + i] = { outcome: 'solved' };
  s.save();
  const s2 = createStore(wx);
  assert.equal(s2.state.muted, true);
  assert.equal(s2.state.display.largeText, true);
  assert.equal(s2.state.display.highContrast, false);
  assert.equal(Object.keys(s2.state.finished).length, 80);
  mem[KEY] = '{not json';
  assert.equal(createStore(wx).state.muted, false);
  assert.equal(createStore({}).state.v, 1);
});

test('keyboard wrapper: events only while open; missing APIs degrade to unavailable (spec 4.2, 17)', () => {
  const calls = [];
  const h = {};
  const wx = {
    showKeyboard: (o) => calls.push(['show', o]),
    hideKeyboard: () => calls.push(['hide']),
    updateKeyboard: (o) => calls.push(['update', o]),
    onKeyboardInput: (f) => (h.input = f),
    onKeyboardConfirm: (f) => (h.confirm = f),
    onKeyboardComplete: (f) => (h.complete = f),
    onKeyboardHeightChange: (f) => (h.height = f),
  };
  const log = [];
  const kb = createKeyboard(wx, { onInput: (v) => log.push(['in', v]), onConfirm: (v) => log.push(['ok', v]), onComplete: () => log.push(['done']), onHeight: (v) => log.push(['h', v]) }, 8);
  h.input({ value: 'ignored' });
  assert.deepEqual(log, []);
  assert.equal(kb.open(), true);
  assert.equal(calls[0][1].maxLength, 8);
  h.input({ value: '月' });
  h.confirm({ value: '月亮' });
  h.height({ height: 280 });
  kb.clear();
  h.complete({});
  assert.deepEqual(log, [['in', '月'], ['ok', '月亮'], ['h', 280], ['done']]);
  assert.deepEqual(calls[1], ['update', { value: '' }]);
  assert.equal(kb.isOpen, false);
  const none = createKeyboard({}, { onInput() {}, onConfirm() {}, onComplete() {}, onHeight() {} }, 8);
  assert.equal(none.available, false);
  assert.equal(none.open(), false);
});

// ---------------------------------------------------------------- controller: server error codes

test('controller: server errors become the spec toasts (RATE_LIMITED, GUESS_LIMIT, NOT_IN_VOCAB), nothing is added to the ladder (spec 4.2, 8.2)', async (t) => {
  const g = boot(t);
  await g.settle();
  g.tapId('sheet:close');
  await tapAndSettle(g, 'home:daily');
  const orig = g.server.call;
  for (const [code, text, reason] of [
    ['RATE_LIMITED', '猜得太快了，歇一下', 'rate'],
    ['GUESS_LIMIT', '这一题猜得够多了，试试提示或看答案', 'limit'],
    ['NOT_IN_VOCAB', '词库里没有「天气」，换个常用词试试', 'server_oov'],
  ]) {
    g.server.call = (n, d) => (n === 'guess' ? { ok: false, code } : orig(n, d));
    const word = g.view().vm.warmups[0];
    await tapAndSettle(g, 'warmup:0');
    assert.equal(g.view().vm.steps, 0);
    assert.equal(g.view().vm.state, 'ready');
    assert.ok(g.view().overlay.toast.text.length > 0);
    if (code !== 'NOT_IN_VOCAB') assert.equal(g.view().overlay.toast.text, text);
    else assert.equal(g.view().overlay.toast.text, '词库里没有「' + word + '」，换个常用词试试');
    const ev = g.app.analytics.queue.filter((e) => e.name === 'guess_rejected').pop();
    assert.equal(ev.props.reason, reason);
    g.wait(3000);
  }
  g.server.call = orig;
  await tapAndSettle(g, 'warmup:0');
  assert.equal(g.view().vm.steps, 1);
});

test('controller: archive error and empty states, with 重试 (AC 102)', async (t) => {
  const g = boot(t, { now: Date.UTC(2026, 10, 1, 4, 0, 0) }); // launch day: no past dailies yet
  await g.settle();
  g.tapId('sheet:close');
  g.server.offline = true;
  await tapAndSettle(g, 'home:archive');
  assert.equal(g.view().vm.state, 'error');
  assert.equal(g.view().vm.errorText, '往期需联网查看');
  g.server.offline = false;
  await tapAndSettle(g, 'archive:retry');
  const vm = g.view().vm;
  assert.equal(vm.state, 'empty');
  assert.equal(vm.emptyText, '还没有往期，先去练习吧');
  assert.equal(vm.items.length, 1);
  assert.equal(vm.items[0].status, 'today');
  await tapAndSettle(g, 'archive:practice');
  assert.equal(g.view().vm.kind, 'practice');
});

test('controller: board error state offers 重试 (AC 102)', async (t) => {
  const g = boot(t, { privacy: { state: 'agreed', scope: true } });
  await g.settle();
  g.tapId('sheet:close');
  const orig = g.server.call;
  g.server.call = (n, d) => (n === 'getBoard' ? { ok: false, code: 'INTERNAL' } : orig(n, d));
  await tapAndSettle(g, 'home:friendBoard');
  assert.equal(g.view().vm.state, 'error');
  g.server.call = orig;
  await tapAndSettle(g, 'board:retry');
  assert.equal(g.view().vm.state, 'empty');
});

test('controller: reveal and challenge offline states (spec 8.4, 8.6)', async (t) => {
  const g = boot(t);
  await g.settle();
  g.tapId('sheet:close');
  g.server.offline = true;
  g.show({ scene: 1044, query: { c: 'ABCDEFGH' } });
  await g.settle();
  assert.equal(g.view().vm.state, 'offline');
  assert.equal(g.view().vm.headline, '需联网展开');
  g.server.offline = false;
  await tapAndSettle(g, 'challenge:retry');
  assert.equal(g.view().vm.state, 'notFound');
});
