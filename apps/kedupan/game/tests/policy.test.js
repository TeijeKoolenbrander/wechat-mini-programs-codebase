'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const AD = require('../core/adpolicy');
const E = require('../core/entry');
const { V, isDateKey } = require('../core/input');
const errors = require('../core/errors');
const events = require('../core/events');

// ---- ads (AC 56-60) --------------------------------------------------------------------------------------------------

test('AC 56: rewards only on isEnded; an early close grants nothing and says why', () => {
  assert.deepEqual(AD.rewardDecision({ event: 'ended', noFillGrantedToday: false }), { grant: true, message: null, markNoFill: false });
  assert.deepEqual(AD.rewardDecision({ event: 'closedEarly', noFillGrantedToday: false }), { grant: false, message: '完整观看才能获得', markNoFill: false });
});

test('AC 57: no-fill / error grants once per placement per day, then blocks', () => {
  ['noFill', 'error'].forEach((event) => {
    assert.deepEqual(AD.rewardDecision({ event, noFillGrantedToday: false }), { grant: true, message: '暂无广告，本次免费', markNoFill: true });
    assert.deepEqual(AD.rewardDecision({ event, noFillGrantedToday: true }), { grant: false, message: '暂无广告，请稍后再试', markNoFill: false });
  });
});

test('AC 58: the fallback share page counts as no-fill; a fallback launch grants nothing', () => {
  assert.equal(AD.rewardDecision({ event: 'fallbackShare', noFillGrantedToday: false }).message, '暂无广告，本次免费');
  assert.equal(AD.rewardDecision({ event: 'fallbackShare', noFillGrantedToday: true }).grant, false);
  assert.equal(AD.fallbackLaunchGrants(), false);
});

test('AC 59: interstitial caps - every 2nd set, not before 3 lifetime sets, >= 120 s apart, <= 6 a day', () => {
  const cfg = AD.clampInterstitial({});
  assert.deepEqual(cfg, { enabled: true, everyNSets: 2, minLifetimeSets: 3, minGapSec: 120, maxPerDay: 6 });
  const st = { setsThisSession: 2, lifetimeSets: 3, lastShownMs: null, shownToday: 0 };
  assert.equal(AD.interstitialDecision(st, cfg, 1e6).show, true);
  assert.equal(AD.interstitialDecision({ ...st, setsThisSession: 1 }, cfg, 1e6).reason, 'cadence');
  assert.equal(AD.interstitialDecision({ ...st, setsThisSession: 3 }, cfg, 1e6).reason, 'cadence');
  assert.equal(AD.interstitialDecision({ ...st, setsThisSession: 4 }, cfg, 1e6).show, true);
  assert.equal(AD.interstitialDecision({ ...st, lifetimeSets: 2 }, cfg, 1e6).reason, 'lifetime');
  assert.equal(AD.interstitialDecision({ ...st, lastShownMs: 1e6 - 119000 }, cfg, 1e6).reason, 'gap');
  assert.equal(AD.interstitialDecision({ ...st, lastShownMs: 1e6 - 120000 }, cfg, 1e6).show, true);
  assert.equal(AD.interstitialDecision({ ...st, shownToday: 6 }, cfg, 1e6).reason, 'daily');
  assert.equal(AD.interstitialDecision({ ...st }, { ...cfg, enabled: false }, 1e6).reason, 'disabled');
  assert.equal(AD.interstitialDecision({ ...st, setsThisSession: 0 }, cfg, 1e6).show, false);
});

test('AC 59: remote config is clamped (everyNSets >= 2, minLifetimeSets >= 2, minGapSec >= 60, maxPerDay <= 8)', () => {
  assert.deepEqual(AD.clampInterstitial({ everyNSets: 1, minLifetimeSets: 0, minGapSec: 5, maxPerDay: 99, enabled: true }), { enabled: true, everyNSets: 2, minLifetimeSets: 2, minGapSec: 60, maxPerDay: 8 });
  assert.deepEqual(AD.clampInterstitial({ everyNSets: 5, minLifetimeSets: 6, minGapSec: 300, maxPerDay: 3, enabled: false }), { enabled: false, everyNSets: 5, minLifetimeSets: 6, minGapSec: 300, maxPerDay: 3 });
  assert.equal(AD.clampInterstitial({ everyNSets: 'x' }).everyNSets, 2);
  assert.equal(AD.clampInterstitial(null).maxPerDay, 6);
});

test('AC 59: interstitial errors 2001-2003 are skipped silently', () => {
  [2001, 2002, 2003].forEach((c) => assert.equal(AD.interstitialErrorSilent(c), true));
  assert.equal(AD.interstitialErrorSilent(2004), false);
});

test('AC 60 / 62: banner defaults off and needs a unit id; subscribe needs a template id', () => {
  assert.deepEqual(AD.buildFeatures(null), { subscribe: null, banner: { enabled: false, adUnitId: null }, interstitial: AD.clampInterstitial({}) });
  assert.equal(AD.buildFeatures({ ads: { banner: { enabled: true } } }).banner.enabled, false, 'enabled without a unit id stays off');
  assert.deepEqual(AD.buildFeatures({ ads: { banner: { enabled: true, adUnitId: 'adunit-x' } } }).banner, { enabled: true, adUnitId: 'adunit-x' });
  assert.equal(AD.buildFeatures({ ads: { banner: { enabled: false, adUnitId: 'adunit-x' } } }).banner.enabled, false);
  assert.equal(AD.buildFeatures({ subscribe: {} }).subscribe, null);
  assert.deepEqual(AD.buildFeatures({ subscribe: { tmplId: 'T1' } }).subscribe, { tmplId: 'T1' });
});

// ---- entry routing and share content (AC 52-54) -------------------------------------------------------------------

test('AC 54: card entries route per spec 7.5', () => {
  assert.deepEqual(E.parseEntryQuery({}), { kind: 'none' });
  assert.deepEqual(E.parseEntryQuery(undefined), { kind: 'none' });
  assert.deepEqual(E.parseEntryQuery({ s: 'd', d: '20261101' }), { kind: 'daily', dateKey: '20261101' });
  assert.deepEqual(E.parseEntryQuery({ s: 'd' }), { kind: 'daily' });
  assert.deepEqual(E.parseEntryQuery({ s: 'd', d: 'zz' }), { kind: 'daily' });
  assert.deepEqual(E.parseEntryQuery({ s: 'g' }), { kind: 'group' });
  assert.deepEqual(E.parseEntryQuery({ r: 'ABCD2345' }), { kind: 'round', roundId: 'ABCD2345' });
  assert.deepEqual(E.parseEntryQuery({ wxad_fallback_share: '1' }), { kind: 'fallback' });
  assert.deepEqual(E.parseEntryQuery({ r: 'abc' }), { kind: 'malformed' });
  assert.deepEqual(E.parseEntryQuery({ s: 'x' }), { kind: 'malformed' });
  assert.deepEqual(E.parseEntryQuery({ foo: 'bar' }), { kind: 'malformed' });
});

test('AC 28 / 52 / 53: share queries carry ids only; the daily image model has no positions', () => {
  const d = E.dailyShare({ dateKey: '20261101', card1: { prompt: '火锅', left: '冷', right: '热' }, total: 412 });
  assert.equal(d.title, '火锅是冷还是热？我今天和全国的默契分 412，你呢');
  assert.equal(d.query, 's=d&d=20261101');
  assert.equal(E.roundShare({ roundId: 'ABCD2345', left: '便宜', right: '贵' }).query, 'r=ABCD2345');
  assert.equal(E.roundShare({ roundId: 'ABCD2345', left: '便宜', right: '贵' }).title, '我出了一道刻度题：便宜↔贵，猜猜我心里的位置');
  assert.equal(E.revealShare({ roundId: 'ABCD2345', mq: 78 }).title, '刻度题揭晓：本题默契值 78');
  assert.equal(E.groupShare({ mq: 81 }).query, 's=g');
  assert.equal(E.groupShare({ mq: null }).title, '群友刻度盘：本群今日刻度');
  [d.title, E.roundShare({ roundId: 'ABCD2345', left: '便宜', right: '贵' }).title, E.revealShare({ roundId: 'ABCD2345', mq: 1 }).title, E.groupShare({ mq: 1 }).title, E.menuShare().title].forEach((t) => assert.ok(E.titleOk(t), t));
  const model = E.dailyShareImageModel({ issueNo: 12, cards: [{ prompt: '火锅', left: '冷', right: '热' }], labels: ['很同频'], total: 412, band: '默契十足' });
  assert.deepEqual(Object.keys(model.rows[0]).sort(), ['label', 'left', 'prompt', 'right']);
  assert.ok(!/pos|ref|median|you|nation/i.test(JSON.stringify(Object.keys(model))));
  const rm = E.roundImageModel({ left: '便宜', right: '贵', clueText: null });
  assert.equal(rm.clueLine, '提示在群聊里');
  assert.ok(!('target' in rm), 'round card before the reveal never has the target');
});

test('share titles: induced-sharing wording is rejected', () => {
  ['不转不是中国人', '@所有人 快来', '转发领红包', '系统通知：请转发', ''].forEach((t) => assert.equal(E.titleOk(t), false, t));
});

// ---- input validation (AC 15, 28, 79) -----------------------------------------------------------------------------------

test('AC 15: submitCard input - integer 0..100, idx 0..4, valid date, optional groupRef', () => {
  const ok = V.submitCard({ dateKey: '20261101', idx: 2, pos: 40, groupRef: 'abcdef0123456789' });
  assert.ok(ok.ok);
  assert.deepEqual(ok.v, { dateKey: '20261101', idx: 2, pos: 40, groupRef: 'abcdef0123456789' });
  [{ pos: 40.5 }, { pos: -1 }, { pos: 101 }, { pos: '40' }, { pos: NaN }, { pos: null }, { idx: 5 }, { idx: -1 }, { idx: 1.5 }, { dateKey: '2026110' }, { dateKey: '20261301' }, { groupRef: 'nothex' }].forEach((bad) => {
    const r = V.submitCard({ dateKey: '20261101', idx: 0, pos: 40, ...bad });
    assert.deepEqual(r, { ok: false, code: 'INVALID_INPUT' }, JSON.stringify(bad));
  });
  assert.equal(V.submitCard(null).ok, false);
  assert.equal(V.submitCard({ dateKey: '20261101', idx: 0, pos: 0 }).ok, true);
  assert.equal(V.submitCard({ dateKey: '20261101', idx: 4, pos: 100 }).ok, true);
  assert.ok(!('evil' in V.submitCard({ dateKey: '20261101', idx: 0, pos: 1, evil: 1 }).v), 'unknown fields are dropped');
});

test('input: date keys must be real calendar dates', () => {
  assert.equal(isDateKey('20260229'), false);
  assert.equal(isDateKey('20280229'), true);
  assert.equal(isDateKey('2026-11-01'), false);
});

test('AC 28 / 79: setClue and reportCard whitelists', () => {
  assert.ok(V.setClue({ roundId: 'ABCD2345', clueMode: 'preset', clueItemId: 's001i03' }).ok);
  assert.equal(V.setClue({ roundId: 'ABCD2345', clueMode: 'chat' }).ok, false, 'D-2: 我在群里说 is removed');
  assert.equal(V.setClue({ roundId: 'ABCD2345', clueMode: 'preset' }).ok, false);
  assert.ok(V.setClue({ roundId: 'ABCD2345', clueMode: 'text', clueText: '冬天的被窝' }).ok, 'D-2: a typed clue is a mode');
  assert.equal(V.setClue({ roundId: 'ABCD2345', clueMode: 'text' }).ok, false, 'the text is required');
  assert.equal(V.setClue({ roundId: 'bad', clueMode: 'preset', clueItemId: 's001i03' }).ok, false);
  ['unsuitable', 'ambiguous', 'typo'].forEach((reason) => assert.ok(V.reportCard({ itemId: 's001i03', reason }).ok));
  assert.equal(V.reportCard({ itemId: 's001i03', reason: 'other' }).ok, false);
  assert.equal(V.reportCard({ itemId: 's001i03', reason: 'typo', text: 'hello' }).ok && 'text' in V.reportCard({ itemId: 's001i03', reason: 'typo', text: 'hello' }).v, false, 'no free text');
});

test('input: remaining validators', () => {
  assert.equal(V.getArchive({ limit: 100 }).v.limit, 30);
  assert.equal(V.getArchive({}).v.limit, 30);
  assert.equal(V.getArchive({ limit: 0 }).ok, false);
  assert.equal(V.getArchive({ before: 'x' }).ok, false);
  assert.equal(V.getGroupDay({ dateKey: '20261101' }).ok, false, 'groupRef is required');
  assert.ok(V.getGroupDay({ dateKey: '20261101', groupRef: 'abcdef0123456789' }).ok);
  assert.equal(V.createRound({ spectrumId: 's001' }).ok, true);
  assert.equal(V.createRound({ spectrumId: 'x' }).ok, false);
  assert.equal(V.submitGuess({ roundId: 'ABCD2345', pos: 50.5 }).ok, false);
  assert.equal(V.getBonusCard({ exclude: ['s001i01'] }).ok, true);
  assert.equal(V.getBonusCard({ exclude: ['junk'] }).ok, false);
  assert.equal(V.track({ events: [] }).ok, false);
  assert.equal(V.track({ events: new Array(51).fill({}) }).ok, false);
  assert.equal(V.track({ events: [{ name: 'error' }] }).ok, true);
  assert.equal(V.getDaily({}).ok, true);
  assert.equal(V.getDaily({ dateKey: 'nope' }).ok, false);
});

// ---- errors and events --------------------------------------------------------------------------------------------------

test('every server error code has client copy or an explicit null; where-specific copy wins', () => {
  errors.SERVER_CODES.forEach((c) => assert.ok(Object.prototype.hasOwnProperty.call(errors.COPY, c), c));
  assert.equal(errors.copyFor('RATE_LIMITED', 'createRound'), '今天出的题够多啦，明天再来');
  assert.equal(errors.copyFor('RATE_LIMITED', 'getBonusCard'), '今天的加一题用完了');
  assert.equal(errors.copyFor('TIMEOUT', 'submitCard'), '网络不稳，答案还没送达');
  assert.equal(errors.copyFor('SOMETHING_NEW', 'x'), errors.COPY.INTERNAL);
  assert.equal(errors.isNetworkError('TIMEOUT'), true);
  assert.equal(errors.isNetworkError('CARD_DONE'), false);
});

test('AC 77: every spec 12 event is listed; required props are checkable; server-side events are not client-sendable', () => {
  const spec = ['session_start', 'card_open', 'howto_view', 'daily_card_place', 'daily_card_reveal', 'daily_complete', 'daily_result_view', 'share_tap', 'round_create', 'round_clue', 'clue_tab', 'clue_result', 'clue_check', 'rules_view', 'rules_agree', 'clue_report', 'strike', 'restrict', 'ugc_pause', 'round_guess', 'round_reveal', 'round_view', 'group_join', 'group_view', 'friend_board_view', 'archive_view', 'archive_set_complete', 'bonus_card', 'distribution_unlock', 'card_report', 'privacy_result', 'friend_scope_result', 'marker_write', 'ad_request', 'ad_show', 'ad_reward', 'ad_close_early', 'ad_error', 'interstitial_show', 'subscribe_offer', 'subscribe_result', 'subscribe_send', 'display_setting', 'daily_gen', 'finalize_day', 'board_list', 'error'];
  spec.forEach((n) => assert.ok(events.EVENTS[n], n));
  assert.equal(Object.keys(events.EVENTS).length, spec.length);
  assert.deepEqual(events.missingProps('daily_card_place', { dateKey: 'x', idx: 0, touches: 1, nudges: 0 }), ['ms']);
  assert.deepEqual(events.missingProps('card_open', { cardKind: 'daily', hasShareTicket: false }), []);
  assert.deepEqual(events.missingProps('nope', {}), ['unknown event nope']);
  events.SERVER_SIDE.forEach((n) => assert.ok(!events.CLIENT_EVENT_NAMES.includes(n)));
  assert.ok(events.CLIENT_EVENT_NAMES.includes('share_tap'));
});
