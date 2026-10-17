'use strict';
// Client tests for the archive, bonus cards, the national distribution and the interstitial (spec 2.3, 6.4, 6.9, 9;
// AC 36-40, 55-60). Driven through main.js against the mock server.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../core/score');
const { boot, BJ } = require('./harness');

const D1 = BJ(2026, 11, 1, 10, 0, 0);
const ADS = { adUnits: { rewarded: 'rw-1', interstitial: 'in-1' } };
const MIN = 60e3;

async function ready(t, opts) {
  const h = await boot(t, opts);
  if (h.has('sheet:close')) await h.tap('sheet:close');
  return h;
}
// the list shows the 8 newest days; sets cycle over 8 closed days (a day can be replayed)
const keyOfDay = (n) => '202611' + String(3 + ((n - 1) % 8)).padStart(2, '0');

test('AC 36: the list shows closed days only, newest first, 30 per page; today appears only after D+1 00:30', async (t) => {
  const h = await ready(t, { now: D1 });
  await h.seedDays(34, 0); // days 1..34 exist and are closed; today is day 35 (5 Dec)
  await h.tap('home:archive');
  let vm = h.view().vm;
  assert.equal(vm.kind, 'list');
  assert.equal(vm.state, 'ready');
  assert.equal(vm.items.length, 30);
  assert.equal(vm.items[0].dateKey, '20261204', 'newest first, never today');
  assert.deepEqual(vm.items.map((x) => x.dateKey), vm.items.map((x) => x.dateKey).slice().sort().reverse());
  assert.ok(vm.items.every((x) => x.dateKey < '20261205'));
  assert.equal(vm.hasMore, true);
  assert.match(vm.items[0].dateText, /^12月4日$/);
  assert.equal(vm.items[0].statusText, '未玩 · 5 张卡');
  await h.tap('archive:more');
  vm = h.view().vm;
  assert.equal(vm.items.length, 34);
  assert.equal(vm.hasMore, false);
  assert.equal(vm.items[33].dateKey, '20261101');

  // today (5 Dec) closes at 6 Dec 00:30
  await h.tap('archive:back');
  h.advance(14 * 3600e3 + 10 * MIN); // 6 Dec 00:10
  await h.show();
  await h.tap('home:archive');
  assert.ok(!h.view().vm.items.some((x) => x.dateKey === '20261205'), 'still open at 00:10');
  await h.tap('archive:back');
  h.advance(25 * MIN); // 00:35
  await h.tap('home:archive');
  assert.equal(h.view().vm.items[0].dateKey, '20261205');
});

test('spec 6.9: on the launch day the list is empty with its message; offline shows a cached page with 离线, or 往期需联网查看 with 重试', async (t) => {
  const h = await ready(t, { now: D1 });
  await h.tap('home:archive');
  assert.equal(h.view().vm.state, 'empty');
  assert.match(h.lastText(), /还没有往期，明天再来/);
  assert.ok(h.has('archive:back'));
  await h.tap('archive:back');

  await h.seedDays(3, 0);
  h.srv.offline = true;
  await h.tap('home:archive');
  assert.equal(h.view().vm.state, 'offline', 'no cached page yet');
  assert.match(h.lastText(), /往期需联网查看/);
  h.srv.offline = false;
  await h.tap('archive:retry');
  assert.equal(h.view().vm.state, 'ready');
  assert.equal(h.view().vm.offlineTag, false);
  await h.tap('archive:back');
  h.srv.offline = true;
  await h.tap('home:archive');
  const vm = h.view().vm;
  assert.equal(vm.state, 'ready', 'the cached page still shows');
  assert.equal(vm.offlineTag, true);
  assert.equal(vm.items.length, 3);
  assert.match(h.lastText(), /离线/);
});

test('AC 37: archive play scores against the frozen finals, shows no group dots, is unranked, stored locally, and never touches boards or streaks', async (t) => {
  const h = await ready(t, { now: D1, enter: { scene: 1044, query: { s: 'd' }, shareTicket: 'T-1' } });
  await h.seedDays(3, 5);
  assert.equal(h.st.group.status, 'ok', 'group context is present');
  await h.tap('home:archive');
  const day = '20261103';
  assert.equal(h.view().vm.items.find((x) => x.dateKey === day).statusText, '未玩 · 5 张卡');
  await h.tap('archive:item:' + day);
  let vm = h.view().vm;
  assert.equal(vm.mode, 'archive');
  assert.equal(vm.tag, null);
  const finals = h.srv.db.sets[day].final;
  const positions = [12, 34, 56, 78, 90];
  for (let i = 0; i < 5; i++) {
    assert.equal(h.view().vm.index, i + 1);
    await h.answer(positions[i]);
    vm = h.view().vm;
    assert.equal(vm.phase, 'revealed');
    assert.deepEqual(vm.reveal.markers, [{ pos: finals[i], kind: 'nation' }, { pos: positions[i], kind: 'you' }], 'the frozen final reference, no group dots');
    assert.match(vm.reveal.nationText, / · 定分$/);
    assert.equal(vm.reveal.groupText, null);
    assert.equal(vm.reveal.agreeText, null);
    assert.equal(vm.reveal.scoreText, '+' + S.scoreAt(positions[i], finals[i]).score);
    await h.tap('card:primary');
  }
  vm = h.view().vm;
  assert.equal(vm.kind, 'end');
  const total = S.dailyTotal(positions, finals).total;
  assert.equal(vm.totalText, String(total));
  assert.equal(vm.bandLabel, S.dayBand(total));
  assert.match(h.lastText(), new RegExp('往期练习 ' + total + ' · 不计入排行'));
  assert.equal(JSON.parse(h.storage.kd_state_v1).archivePlays[day].total, total);
  assert.equal(h.srv.db.entries[day + '_' + h.srv.ME], undefined, 'nothing was sent to the server');
  assert.equal(h.srv.db.players[h.srv.ME], undefined, 'no streak');
  assert.ok(!h.srv.calls.some((c) => c.name === 'submitCard' && c.data.dateKey === day && c.openid === h.srv.ME));
  await h.tap('archive:backList');
  assert.equal(h.view().vm.items.find((x) => x.dateKey === day).statusText, '往期练习 ' + total);
});

test('AC 38: a day played as the daily opens as a read-only review with positions, finals, 定分 and the percentile', async (t) => {
  const h = await ready(t, { now: D1 });
  await h.seedDays(3, 35); // 35 others a day, now day 4
  const positions = [11, 22, 33, 44, 55];
  for (let i = 0; i < 35; i++) h.otherDaily('q' + i, [5 + i, 15 + i, 25 + i, 35 + i, 45 + i]);
  await h.playDaily(positions);
  const played = h.view().vm.totalText;
  await h.tap('result:back');
  h.advance(24 * 3600e3 - 10 * 3600e3 + 31 * MIN); // day 5 00:31
  h.srv.runTimer('finalizeDay');
  await h.show();
  await h.tap('home:archive');
  const item = h.view().vm.items[0];
  assert.equal(item.dateKey, '20261104');
  assert.match(item.statusText, /^已玩 · 定分 \d+$/);
  await h.tap('archive:item:20261104');
  const vm = h.view().vm;
  assert.equal(vm.kind, 'review');
  assert.equal(vm.state, 'ready');
  assert.deepEqual(vm.mine.positions, positions);
  assert.deepEqual(vm.finals, h.srv.db.sets['20261104'].final);
  assert.match(vm.mine.percentileText, /^超过全国 \d+%$/);
  assert.equal(vm.rows.length, 5);
  assert.equal(vm.mine.totalText, String(S.dailyTotal(positions, vm.finals).total));
  assert.ok(Number(vm.mine.totalText) > 0 && played !== undefined);
  assert.ok(!h.has('card:primary') && !h.has('review:ruler'), 'read-only');
  assert.ok(h.has('review:back') && h.has('review:distribution'));
  await h.tap('review:back');
  assert.equal(h.view().vm.kind, 'list');
});

test('AC 39: 加一题 is a closed-day card the player has not answered, tagged 加一题 · 不计分, scored on the frozen final, limited to 3 a day, and changes nothing else', async (t) => {
  const h = await ready(t, { now: D1, build: ADS });
  await h.seedDays(3, 0);
  await h.playDaily([20, 40, 60, 80, 50]);
  const entries = JSON.stringify(h.srv.db.entries);
  const players = JSON.stringify(h.srv.db.players);
  assert.equal(h.view().vm.bonus.left, 3);
  const seen = new Set();
  for (let i = 0; i < 3; i++) {
    await h.tap('result:bonus');
    let vm = h.view().vm;
    assert.equal(h.screen(), 'card');
    assert.equal(vm.mode, 'bonus');
    assert.equal(vm.tag, '加一题 · 不计分');
    assert.equal(vm.index, null);
    assert.equal(vm.total, null);
    const item = vm.card.itemId;
    assert.ok(!seen.has(item), 'a card the player has not played');
    seen.add(item);
    const day = Object.keys(h.srv.db.sets).find((k) => h.srv.db.sets[k].cards.some((c) => c.itemId === item));
    assert.ok(day < '20261104', 'from a closed day');
    const idx = h.srv.db.sets[day].cards.findIndex((c) => c.itemId === item);
    await h.answer(45);
    vm = h.view().vm;
    assert.deepEqual(vm.reveal.markers[0], { pos: h.srv.db.sets[day].final[idx], kind: 'nation' });
    assert.match(vm.reveal.nationText, / · 定分$/);
    assert.equal(vm.primaryLabel, '看结果');
    await h.tap('card:primary');
    assert.equal(h.screen(), 'result');
    assert.equal(h.view().vm.bonus.left, 2 - i);
  }
  assert.equal(h.has('result:bonus'), false, 'the button is disabled when spent');
  assert.match(h.lastText(), /今天的加一题用完了/);
  assert.equal(JSON.stringify(h.srv.db.entries), entries, 'no board data changed');
  assert.equal(JSON.stringify(h.srv.db.players), players, 'no streak changed');
  assert.equal(h.app.analytics.queue.filter((e) => e.name === 'bonus_card').length, 3);

  await h.tap('result:back');
  h.advance(24 * 3600e3);
  await h.show();
  await h.playDaily([1, 2, 3, 4, 5]);
  assert.equal(h.view().vm.bonus.left, 3, 'a new day, three more');
});

test('AC 39/56/57: 加一题 follows the rewarded rules: early close grants nothing; no-fill grants once a day; the next failure grants nothing', async (t) => {
  const h = await ready(t, { now: D1, build: ADS, rewarded: { mode: 'early' } });
  await h.seedDays(2, 0);
  await h.playDaily([20, 40, 60, 80, 50]);
  await h.tap('result:bonus');
  assert.equal(h.screen(), 'result');
  assert.match(h.lastText(), /完整观看才能获得/);
  assert.equal(h.view().vm.bonus.left, 3);
  assert.equal(h.app.analytics.queue.filter((e) => e.name === 'ad_close_early').length, 1);

});

test('AC 57: 加一题 no-fill grants once a day; the next failure the same day grants nothing', async (t) => {
  const g = await ready(t, { now: D1, build: ADS, rewarded: { mode: 'error', code: 1004 } });
  await g.seedDays(3, 0);
  await g.playDaily([20, 40, 60, 80, 50]);
  await g.tap('result:bonus');
  assert.equal(g.screen(), 'card', 'no fill: free once');
  assert.match(g.lastText(), /加一题/);
  assert.equal(g.app.analytics.queue.filter((e) => e.name === 'ad_error').length, 1);
  await g.answer(40);
  await g.tap('card:primary');
  await g.tap('result:bonus');
  assert.equal(g.screen(), 'result', 'the second failure the same day grants nothing');
  assert.match(g.lastText(), /暂无广告，请稍后再试/);
  assert.equal(g.view().vm.bonus.adState, 'error');
});

test('AC 40: 全国分布 unlocks only after isEnded (or the no-fill grant), once per set; unlocked sets reopen without an ad', async (t) => {
  const early = await ready(t, { build: ADS, rewarded: { mode: 'early' } });
  await early.playDaily([20, 40, 60, 80, 50]);
  await early.tap('result:distribution');
  assert.equal(early.view().vm.distribution.unlocked, false);
  assert.equal(early.view().vm.sheet, null);
  assert.match(early.lastText(), /完整观看才能获得/);

  const h = await ready(t, { build: ADS });
  await h.playDaily([20, 40, 60, 80, 50]);
  assert.equal(h.view().vm.distribution.unlocked, false);
  await h.tap('result:distribution');
  let vm = h.view().vm;
  assert.equal(vm.distribution.unlocked, true);
  assert.equal(vm.sheet, 'distribution');
  assert.equal(vm.distribution.hist.length, 5);
  assert.ok(vm.distribution.hist.every((x) => x.length === 21));
  const asks = h.log.rewarded.length;
  const reqs = h.app.analytics.queue.filter((e) => e.name === 'ad_request').length;
  await h.tap('sheet:close');
  await h.tap('result:distribution');
  assert.equal(h.view().vm.sheet, 'distribution');
  assert.equal(h.app.analytics.queue.filter((e) => e.name === 'ad_request').length, reqs, 'no second ad for the same set');
  assert.equal(h.log.rewarded.length, asks);
  assert.equal(h.app.analytics.queue.filter((e) => e.name === 'distribution_unlock').length, 1);
  assert.equal(JSON.parse(h.storage.kd_state_v1).unlocks.keys['20261105'], true);
});

test('AC 57: no-fill on 全国分布 unlocks once a day with 暂无广告，本次免费; the next set that day gets 暂无广告，请稍后再试 and stays locked', async (t) => {
  const h = await ready(t, { now: D1, build: ADS, rewarded: { mode: 'error', code: 1004 } });
  await h.seedDays(3, 0);
  await h.playDaily([20, 40, 60, 80, 50]);
  await h.tap('result:distribution');
  assert.equal(h.view().vm.distribution.unlocked, true);
  assert.match(h.lastText(), /暂无广告，本次免费/);
  assert.equal(h.app.analytics.queue.filter((e) => e.name === 'distribution_unlock' && e.props.via === 'nofill').length, 1);
  await h.tap('sheet:close');
  await h.tap('result:archive');
  await h.tap('archive:item:20261103');
  for (let i = 0; i < 5; i++) {
    await h.answer(50);
    await h.tap('card:primary');
  }
  assert.equal(h.view().vm.kind, 'end');
  await h.tap('archive:distribution');
  assert.equal(h.view().vm.distribution.unlocked, false);
  assert.match(h.lastText(), /暂无广告，请稍后再试/);
  assert.equal(h.view().vm.sheet, null);
});

async function setup59(t, extra) {
  const h = await ready(t, Object.assign({ now: D1, build: ADS }, extra || {}));
  await h.seedDays(10, 0);
  await h.playDaily([20, 40, 60, 80, 50]); // lifetime 1
  await h.tap('result:archive');
  return h;
}

async function finishSet(h, dayNo) {
  await h.archiveSet(keyOfDay(dayNo), [10, 30, 50, 70, 90]);
  assert.equal(h.view().vm.kind, 'end');
}

test('AC 59: interstitials appear only on 再来一期 / 返回列表 after a completed archive set: every 2nd set, not before 3 lifetime sets, >= 120 s apart', async (t) => {
  const h = await setup59(t);
  const shown = () => h.log.interstitial.length;
  assert.equal(shown(), 0, 'not in the daily flow, not on the result');
  await finishSet(h, 1); // lifetime 2, session 1
  await h.tap('archive:backList');
  assert.equal(shown(), 0);
  await finishSet(h, 2); // lifetime 3, session 2: every 2nd, lifetime ok
  await h.tap('archive:backList');
  assert.equal(shown(), 1);
  assert.equal(h.app.analytics.queue.filter((e) => e.name === 'interstitial_show').length, 1);
  assert.deepEqual(h.app.analytics.queue.filter((e) => e.name === 'interstitial_show')[0].props.setsThisSession, 2);
  await finishSet(h, 3); // session 3: not every 2nd
  await h.tap('archive:backList');
  assert.equal(shown(), 1);
  await finishSet(h, 4); // session 4: due, but < 120 s since the last one
  await h.tap('archive:backList');
  assert.equal(shown(), 1, 'the 120 s gap holds');
  await finishSet(h, 5);
  await h.tap('archive:backList');
  h.advance(3 * MIN);
  await finishSet(h, 6); // session 6, > 120 s
  await h.tap('archive:again');
  assert.equal(shown(), 2, '再来一期 counts too');
  assert.equal(h.screen(), 'card', 'the next set starts at once: the ad never delays navigation');
});

test('AC 59: remote caps are clamped to the allowed ranges (everyNSets >= 2, minLifetimeSets >= 2, minGapSec >= 60, maxPerDay <= 8)', async (t) => {
  const h = await setup59(t);
  h.srv.appConfig = { ads: { interstitial: { everyNSets: 1, minLifetimeSets: 0, minGapSec: 1, maxPerDay: 99 } } };
  await h.tap('archive:back');
  await h.show();
  assert.deepEqual(h.ctl.K.ads.interstitialConfig(), { enabled: true, everyNSets: 2, minLifetimeSets: 2, minGapSec: 60, maxPerDay: 8 });
});

test('AC 59: at most 6 interstitials a day by default', async (t) => {
  const h = await setup59(t);
  for (let n = 1; n <= 16; n++) {
    h.advance(3 * MIN);
    await finishSet(h, n);
    await h.tap('archive:backList');
  }
  assert.equal(h.log.interstitial.length, 6, 'every 2nd of 16 sets would be 8; the daily cap stops at 6');
});

test('AC 59: remote config can switch interstitials off', async (t) => {
  const off = await setup59(t);
  off.srv.appConfig = { ads: { interstitial: { enabled: false } } };
  await off.tap('archive:back');
  await off.show();
  await off.tap('home:archive');
  for (let n = 1; n <= 4; n++) {
    off.advance(3 * MIN);
    await finishSet(off, n);
    await off.tap('archive:backList');
  }
  assert.equal(off.log.interstitial.length, 0);
});

test('AC 59: 2001-2003 errors are skipped silently, never counted, and never delay navigation', async (t) => {
  const h = await setup59(t, { interstitial: { error: 2001 } });
  await finishSet(h, 1);
  await h.tap('archive:backList');
  await finishSet(h, 2);
  await h.tap('archive:backList');
  assert.equal(h.screen(), 'archive', 'navigation continues');
  assert.equal(h.app.analytics.queue.filter((e) => e.name === 'interstitial_show').length, 0);
  assert.equal(h.app.analytics.queue.filter((e) => e.name === 'ad_show' && e.props.placement === 'interstitial').length, 0);
  assert.ok(h.app.analytics.queue.some((e) => e.name === 'ad_error' && e.props.placement === 'interstitial' && e.props.errCode === 2001));
  assert.equal(JSON.parse(h.storage.kd_state_v1).interstitial.count, 0, 'not counted toward the caps');
});

test('AC 55: no ad of any kind in the daily flow, on reveals, on the result as an interstitial, or in the host-round flow except the rewarded 换一批', async (t) => {
  const h = await ready(t, { build: ADS });
  await h.playDaily([20, 40, 60, 80, 50]);
  assert.deepEqual(h.ctl.K.ads.calls, []);
  await h.tap('result:host');
  await h.tap('create:spectrum:' + h.view().vm.spectra[0].id);
  await h.pickPreset();
  await h.tap('round:back');
  assert.deepEqual(h.ctl.K.ads.calls, [], 'creating, sharing and waiting show nothing');
  await h.tap('home:host');
  await h.tap('create:swapFree');
  await h.tap('create:swapAd');
  assert.deepEqual(h.ctl.K.ads.calls, [{ kind: 'rewarded', placement: 'swap' }]);
  assert.equal(h.log.interstitial.length, 0);
  assert.equal(h.log.banners.length, 0);
});

test('AC 60: the banner is off by default', async (t) => {
  const off = await setup59(t);
  await off.tap('archive:back');
  assert.equal(off.log.banners.length, 0, 'default off');
});

test('AC 60: with config and a unit id the banner shows only on the group page, friend board and archive list (ready/empty)', async (t) => {
  const h = await ready(t, { now: D1 });
  h.srv.appConfig = { ads: { banner: { enabled: true, adUnitId: 'bn-1' } } };
  await h.seedDays(3, 0);
  assert.equal(h.log.banners.length, 0, 'not on home');
  await h.tap('home:archive');
  assert.equal(h.log.banners.length, 1);
  assert.equal(h.log.banners[0].adUnitId, 'bn-1');
  assert.equal(h.ctl.K.ads.bannerActive, true);
  await h.tap('archive:item:20261102'); // a card: no banner
  assert.equal(h.ctl.K.ads.bannerActive, false);
  await h.tap('card:back');
  assert.equal(h.ctl.K.ads.bannerActive, true);
  await h.tap('archive:back');
  assert.equal(h.ctl.K.ads.bannerActive, false, 'gone with the screen');
});

test('AC 60: banner enabled without a unit id stays off', async (t) => {
  const u = await ready(t, { build: ADS });
  u.srv.appConfig = { ads: { banner: { enabled: true } } };
  await u.ctl.K.loadDaily();
  await u.tap('home:archive');
  assert.equal(u.log.banners.length, 0);
});
