/**
 * Card entries, group context and boards, the archive, rewarded extras and interstitials, privacy refusal, offline,
 * midnight, settings and the renderer fallback, all through the fake wx.
 */

const test = require('node:test');
const assert = require('node:assert');
const { boot, initTime, playDaily } = require('./harness');
const { createMockServer } = require('../js/mock-server');
const S = require('../core/score');

const vm = (g) => g.app.ctl.view().vm;
const screen = (g) => g.app.ctl.view().screen;
const ev = (g, name) => g.app.analytics.queue.concat(g.app.api.mock.db.events).filter((e) => e.name === name);

function makeServer(t, o) {
  initTime(t);
  return createMockServer(Object.assign({ population: 0, launchDateKey: '20261101' }, o || {}));
}

async function up(t, opts) {
  const g = boot(t, opts);
  await g.settle();
  await g.ready();
  return g;
}

/** Finish today's daily from home with the given positions (default all 50). Ends on the day result. */
async function finishDaily(g, positions) {
  await playDaily(g, positions || [50, 50, 50, 50, 50]);
  assert.strictEqual(screen(g), 'result');
}

// ------------------------------------------------------------------ entries (7.5)

test('entry s=d with a group ticket: home with the group banner; the group id never reaches an event', async (t) => {
  const g = boot(t, { enter: { scene: 1044, query: { s: 'd', d: '20261120' }, shareTicket: 'T-SECRET', chatType: 3 } });
  await g.settle();
  assert.ok(g.log.calls.includes('getGroupEnterInfo'));
  await g.ready();
  assert.strictEqual(screen(g), 'home');
  assert.strictEqual(vm(g).group.status, 'ok');
  assert.strictEqual(vm(g).group.bannerText, '来自群聊 · 查看本群今日默契 ›');
  assert.ok(g.has('home:groupBanner'));
  const co = ev(g, 'card_open');
  assert.strictEqual(co.length, 1);
  assert.strictEqual(co[0].props.cardKind, 'daily');
  assert.strictEqual(co[0].props.hasShareTicket, true);
  const gj = ev(g, 'group_join');
  assert.strictEqual(gj.length, 1);
  assert.strictEqual(gj[0].props.result, 'ok');
  const dump = JSON.stringify(g.app.analytics.queue);
  assert.ok(!/G1|T-SECRET|groupRef|opengid/i.test(dump));
});

test('entry s=g: with a ticket the group page opens (no automatic prompt); without one the explainer shows', async (t) => {
  const g = boot(t, { enter: { scene: 1044, query: { s: 'g' }, shareTicket: 'T', chatType: 3 } });
  await g.settle();
  assert.strictEqual(screen(g), 'group');
  assert.ok(!g.log.calls.includes('requirePrivacyAuthorize'), 'a card entry never prompts by itself');
  assert.strictEqual(vm(g).state, 'privacyDenied', 'names need the agreement; the stats still show');
  assert.strictEqual(vm(g).notice, '查看群友昵称需要同意《用户隐私保护指引》');
  assert.strictEqual(vm(g).base, 'notPlayed');
  const g2 = boot(t, { enter: { scene: 1044, query: { s: 'g' } } });
  await g2.settle();
  assert.strictEqual(screen(g2), 'group');
  assert.strictEqual(vm(g2).state, 'noGroup');
  assert.strictEqual(vm(g2).explainer, '在群聊里点开本游戏的卡片，就能看到本群的默契度');
  g2.tapId('back');
  assert.strictEqual(screen(g2), 'home');
});

test('entry wxad_fallback_share and malformed queries land on home and grant nothing', async (t) => {
  const g = boot(t, { enter: { scene: 1001, query: { wxad_fallback_share: '1' } } });
  await g.settle();
  assert.strictEqual(screen(g), 'home');
  assert.ok(ev(g, 'error').some((e) => e.props.code === 'wxad_fallback_share'));
  assert.strictEqual(g.app.store.state.bonus.used, 0);
  assert.strictEqual(g.app.ads.overlay, null);
  assert.strictEqual(g.log.ads.length, 0);
  const g2 = boot(t, { enter: { scene: 1001, query: { r: 'bad' } } });
  await g2.settle();
  assert.strictEqual(screen(g2), 'home');
  assert.ok(ev(g2, 'error').some((e) => e.props.code === 'malformed'));
  const g3 = boot(t, { enter: { scene: 1001, query: { foo: 'bar' } } });
  await g3.settle();
  assert.strictEqual(screen(g3), 'home');
});

test('a launch and its first onShow with the same entry count once', async (t) => {
  const srv = makeServer(t);
  const c = srv.call('createRound', { spectrumId: 's001' }, { openid: 'h' });
  srv.call('setClue', { roundId: c.roundId, clueMode: 'chat' }, { openid: 'h' });
  const enter = { scene: 1044, query: { r: c.roundId } };
  const g = boot(t, { mockServer: srv, openid: 'x', population: 0, enter });
  await g.settle();
  g.show(enter);
  await g.settle();
  assert.strictEqual(ev(g, 'card_open').length, 1);
});

test('warm start with a new card while mid-card waits (6.10): toast after the confirm, route on the way home', async (t) => {
  const srv = makeServer(t);
  const c = srv.call('createRound', { spectrumId: 's001' }, { openid: 'h' });
  srv.call('setClue', { roundId: c.roundId, clueMode: 'chat' }, { openid: 'h' });
  const g = await up(t, { mockServer: srv, population: 0 });
  g.tapId('home:daily');
  g.ruler(40);
  g.show({ scene: 1044, query: { r: c.roundId } });
  await g.settle();
  assert.strictEqual(screen(g), 'card', 'the player is mid-card: nothing interrupts');
  assert.strictEqual(vm(g).needle, 40);
  g.tapId('card:primary');
  await g.settle();
  assert.strictEqual(g.app.ctl.ui.toast.text, '你有一道新刻度题');
  g.tapId('back');
  await g.settle();
  assert.strictEqual(screen(g), 'round');
  assert.strictEqual(vm(g).status, 'open');
});

// ------------------------------------------------------------------ group daily, group page, friend board, privacy

function groupFixture(t) {
  const srv = makeServer(t);
  const ref = srv.joinGroupAs('u1', 'G1');
  srv.joinGroupAs('u2', 'G1');
  srv.playDaily('u1', [10, 20, 30, 40, 50], ref);
  srv.playDaily('u2', [12, 24, 36, 48, 60], ref);
  return { srv, ref };
}

test('group daily: dots and the group line on each reveal, then the group page and the friend board from hashed server rows', async (t) => {
  const { srv } = groupFixture(t);
  const g = await up(t, { mockServer: srv, population: 0, enter: { scene: 1044, query: { s: 'd' }, shareTicket: 'T', chatType: 3 } });
  g.tapId('home:daily');
  const mine = [11, 22, 33, 44, 55];
  for (let i = 0; i < 5; i++) {
    g.ruler(mine[i]);
    g.tapId('card:primary');
    await g.settle();
    const r = vm(g).reveal;
    assert.strictEqual(r.markers.filter((m) => m.kind === 'member').length, 2, 'both members as unnamed dots');
    assert.strictEqual(r.markers.filter((m) => m.kind === 'group').length, 1);
    assert.match(r.groupText, /^本群 2 人 ● /);
    if (i === 0) assert.strictEqual(r.groupText, '本群 2 人 ● 和你一样', 'median 11 vs you 11');
    g.tapId('card:primary');
    await g.settle();
  }
  const res = vm(g);
  const cards = [0, 1, 2, 3, 4].map((c) => [[10, 20, 30, 40, 50][c], [12, 24, 36, 48, 60][c], mine[c]]);
  const gsMe = S.groupScore(cards, 2);
  const mq = S.groupMq(cards);
  assert.strictEqual(res.groupText, '本群群内默契分 ' + gsMe + ' · 本群默契度 ' + mq);
  // group page: opened by a tap, so the privacy and friend-scope prompts may appear now
  g.tapId('result:group');
  await g.settle();
  assert.ok(g.log.calls.some((c) => c.indexOf('authorize:"scope.WxFriendInteraction"') === 0), 'the friend scope is asked from the tap');
  let v = vm(g);
  assert.strictEqual(screen(g), 'group');
  assert.strictEqual(v.state, 'ready');
  assert.strictEqual(v.mqText, '本群今日默契度 ' + mq);
  assert.strictEqual(v.countText, '已完成 3 人');
  assert.match(v.divisiveText, /^今日最有争议：/);
  assert.strictEqual(v.trend.length, 7);
  assert.strictEqual(v.trend[6].value, mq);
  const msg = g.log.odc[g.log.odc.length - 1];
  assert.strictEqual(msg.view, 'group');
  assert.strictEqual(msg.type, 'render');
  assert.strictEqual(msg.anon, false);
  assert.strictEqual(msg.viewerDone, true);
  assert.strictEqual(msg.rows.length, 3);
  assert.strictEqual(msg.selfHash, srv.rowHash('mock-openid-me', msg.salt));
  assert.ok(msg.rows.some((r) => r[0] === msg.selfHash), 'my row is findable by the hash');
  const scores = msg.rows.map((r) => r[1]);
  assert.deepStrictEqual(scores, scores.slice().sort((a, b) => b - a), 'ranked by 群内默契分, computed on the server');
  assert.ok(msg.rows.every((r) => typeof r[4] === 'string' && r[4].split(',').length === 5), 'positions only because I completed the day');
  // AC 49: no openid, openGId or group ref in anything the client sent to the open data domain or logged
  const dump = JSON.stringify(g.log.odc) + JSON.stringify(g.app.analytics.queue);
  ['mock-openid-me', 'u1', 'u2', 'G1', 'openid', 'openGId', 'groupRef'].forEach((s) => assert.ok(!dump.includes(s), 'leaked ' + s));
  assert.ok(g.log.cloudWrites.length >= 1);
  // a round whose guess carried this group's ref shows up in the list
  const c = srv.call('createRound', { spectrumId: 's001' }, { openid: 'u1' });
  srv.call('setClue', { roundId: c.roundId, clueMode: 'chat' }, { openid: 'u1' });
  srv.call('submitGuess', { roundId: c.roundId, pos: 30, groupRef: srv.joinGroupAs('u2', 'G1') }, { openid: 'u2' });
  g.tapId('back');
  g.tapId('result:group');
  await g.settle();
  v = vm(g);
  assert.strictEqual(v.rounds.length, 1);
  assert.match(v.rounds[0].title, /↔/);
  assert.strictEqual(v.rounds[0].statusText, '进行中 · 1 人作答');
  g.tapId('group:round:' + c.roundId);
  await g.settle();
  assert.strictEqual(screen(g), 'round');
  assert.strictEqual(vm(g).status, 'open');
  // friend board: server-ranked by the national score
  g.tapId('back');
  g.tapId('back');
  g.tapId('back');
  assert.strictEqual(screen(g), 'home');
  g.tapId('home:friend');
  await g.settle();
  v = vm(g);
  assert.strictEqual(v.state, 'ready');
  assert.strictEqual(v.mode, 'full');
  const fm = g.log.odc[g.log.odc.length - 1];
  assert.strictEqual(fm.view, 'friend');
  assert.strictEqual(fm.rows.length, 3);
  const ns = fm.rows.map((r) => r[1]);
  assert.deepStrictEqual(ns, ns.slice().sort((a, b) => b - a));
  assert.ok(Array.isArray(fm.refs) && fm.refs.length === 5);
});

test('group page before playing: stats only, no member positions or scores', async (t) => {
  const { srv } = groupFixture(t);
  const g = await up(t, { mockServer: srv, population: 0, enter: { scene: 1044, query: { s: 'g' }, shareTicket: 'T', chatType: 3 } });
  g.tapId('back');
  g.tapId('home:group');
  await g.settle();
  const v = vm(g);
  assert.strictEqual(v.state, 'notPlayed');
  assert.strictEqual(v.countText, '已完成 2 人');
  assert.strictEqual(v.mqText, null);
  assert.strictEqual(v.stateText, '完成今日刻度后查看本群默契');
  assert.strictEqual(v.trend.length, 7);
  assert.ok(g.has('group:play'));
  assert.strictEqual(g.log.odc, undefined, 'no rows are drawn');
});

test('group page states: small, empty, server error with retry', async (t) => {
  const srv = makeServer(t);
  const ref = srv.joinGroupAs('u1', 'G1');
  const g = await up(t, { mockServer: srv, population: 0, enter: { scene: 1044, query: { s: 'd' }, shareTicket: 'T', chatType: 3 } });
  await finishDaily(g);
  g.tapId('result:group');
  await g.settle();
  assert.strictEqual(vm(g).state, 'small');
  assert.strictEqual(vm(g).smallText, '完成人数满 3 人后计算本群默契度');
  assert.strictEqual(vm(g).countText, '已完成 1 人');
  srv.playDaily('u1', [10, 10, 10, 10, 10], ref);
  g.tapId('back');
  srv.fail.getGroupDay = { code: 'INTERNAL', times: 1 };
  g.tapId('result:group');
  await g.settle();
  assert.strictEqual(vm(g).state, 'serverError');
  assert.strictEqual(vm(g).stateText, '本群数据暂时打不开');
  g.tapId('group:retry');
  await g.settle();
  assert.strictEqual(vm(g).state, 'small');
  assert.strictEqual(vm(g).countText, '已完成 2 人');
});

test('privacy refused: the group page, friend board and round reveal still render the server rows anonymously; nothing re-prompts by itself', async (t) => {
  const { srv } = groupFixture(t);
  const privacy = { refuse: true, markerRefuse: true };
  const g = await up(t, { mockServer: srv, population: 0, privacy, enter: { scene: 1044, query: { s: 'd' }, shareTicket: 'T', chatType: 3 } });
  await finishDaily(g);
  // the marker write after a completed daily went through the refused popup path (104): held, play unaffected
  assert.ok(g.app.store.state.privacy.markerPending);
  assert.strictEqual(g.log.cloudWrites.length, 0);
  const prompts0 = g.log.calls.filter((c) => c === 'requirePrivacyAuthorize').length;
  g.tapId('result:group');
  await g.settle();
  assert.strictEqual(vm(g).state, 'privacyDenied');
  assert.ok(vm(g).mqText, 'the stats lines still show');
  assert.ok(vm(g).countText.includes('3'));
  const msg = g.log.odc[g.log.odc.length - 1];
  assert.strictEqual(msg.anon, true);
  assert.strictEqual(msg.rows.length, 3, 'the server rows still go out, hashed');
  assert.ok(g.has('group:contract') && g.has('group:agree'));
  assert.strictEqual(g.log.calls.filter((c) => c === 'requirePrivacyAuthorize').length, prompts0 + 1, 'one prompt, from my tap');
  g.tapId('group:contract');
  assert.ok(g.log.calls.includes('openPrivacyContract'));
  // the friend board is the same
  g.tapId('back');
  g.tapId('back');
  g.tapId('home:friend');
  await g.settle();
  assert.strictEqual(vm(g).state, 'privacyDenied');
  assert.strictEqual(g.log.odc[g.log.odc.length - 1].anon, true);
  // agreeing later re-renders with names and releases the held marker write
  privacy.refuse = false;
  privacy.markerRefuse = false;
  g.tapId('friend:agree');
  await g.settle();
  assert.strictEqual(vm(g).state, 'ready');
  assert.strictEqual(g.log.odc[g.log.odc.length - 1].anon, false);
  assert.strictEqual(g.log.cloudWrites.length, 1);
  assert.strictEqual(g.app.store.state.privacy.markerPending, null);
  assert.ok(ev(g, 'privacy_result').length >= 2);
});

test('friend scope refused: unauthorized state with a passive 去设置开启, which recovers through openSetting', async (t) => {
  const { srv } = groupFixture(t);
  const privacy = { state: 'agreed', scope: false };
  const g = await up(t, { mockServer: srv, population: 0, privacy, enter: { scene: 1044, query: { s: 'd' }, shareTicket: 'T', chatType: 3 } });
  await finishDaily(g);
  g.tapId('result:group');
  await g.settle();
  assert.strictEqual(vm(g).state, 'unauthorized');
  assert.strictEqual(vm(g).notice, '开启「微信朋友关系」可显示群友昵称');
  assert.strictEqual(g.log.odc[g.log.odc.length - 1].anon, true);
  g.tapId('group:openSetting');
  await g.settle();
  assert.strictEqual(vm(g).state, 'ready');
  assert.strictEqual(g.log.odc[g.log.odc.length - 1].anon, false);
});

test('friend board above the list cap switches to selfOnly; empty and error states', async (t) => {
  const srv = makeServer(t, { population: 5, boardListCap: 3 });
  const g = await up(t, { mockServer: srv, population: 5 });
  g.tapId('home:friend');
  await g.settle();
  assert.strictEqual(vm(g).state, 'empty', 'I have not played and nobody in selfOnly');
  const srv2 = makeServer(t, { population: 0 });
  const g2 = await up(t, { mockServer: srv2, population: 0 });
  g2.tapId('home:friend');
  await g2.settle();
  assert.strictEqual(vm(g2).state, 'empty');
  assert.strictEqual(vm(g2).stateText, '还没有好友完成今日刻度');
  g2.tapId('back');
  srv2.fail.getFriendBoard = { code: 'INTERNAL', times: 1 };
  g2.tapId('home:friend');
  await g2.settle();
  assert.strictEqual(vm(g2).state, 'serverError');
  g2.tapId('friend:retry');
  await g2.settle();
  assert.strictEqual(vm(g2).state, 'empty');
  // selfOnly once I have played
  g.tapId('back');
  await finishDaily(g);
  g.tapId('back');
  g.tapId('home:friend');
  await g.settle();
  assert.strictEqual(vm(g).mode, 'selfOnly');
  assert.strictEqual(vm(g).selfText, '你的成绩已校验，好友成绩为自报');
  assert.strictEqual(g.log.odc[g.log.odc.length - 1].rows.length, 1);
});

// ------------------------------------------------------------------ archive and interstitial

test('archive: closed days only, play a set scored locally against the finals, stored on the device, never touches boards or streaks; interstitial on the 2nd set only', async (t) => {
  const g = await up(t);
  await finishDaily(g);
  const submitsAfterDaily = g.server.calls.filter((c) => c === 'submitCard').length;
  assert.strictEqual(submitsAfterDaily, 5);
  assert.strictEqual(ev(g, 'ad_request').length, 0, 'no ad in the daily flow (AC 55)');
  g.tapId('back');
  g.tapId('home:archive');
  await g.settle();
  let v = vm(g);
  assert.strictEqual(screen(g), 'archive');
  assert.strictEqual(v.state, 'ready');
  assert.strictEqual(v.items.length, 19, 'days 20261101-20261119');
  assert.strictEqual(v.items[0].dateKey, '20261119', 'newest first');
  assert.ok(!v.items.some((i) => i.dateKey === '20261120'), 'today never appears');
  assert.strictEqual(v.items[0].statusText, '未玩 · 5 张卡');
  assert.strictEqual(v.items[0].dateText, '11月19日');
  assert.strictEqual(v.hasMore, false);
  const streakBefore = g.server.call('getDaily', {}, { openid: 'mock-openid-me' }).myStreak;
  // first set
  g.tapId('archive:item:20261119');
  await g.settle();
  assert.strictEqual(screen(g), 'card');
  v = vm(g);
  assert.strictEqual(v.mode, 'archive');
  assert.strictEqual(v.index, 1);
  assert.strictEqual(v.total, 5);
  assert.strictEqual(v.tag, null);
  const finals = g.server.db.sets['20261119'].final;
  let total = 0;
  for (let i = 0; i < 5; i++) {
    g.ruler(50);
    g.tapId('card:primary');
    v = vm(g);
    assert.strictEqual(v.phase, 'revealed', 'archive reveals instantly, no server');
    assert.match(v.reveal.nationText, / · 定分$/);
    assert.strictEqual(v.reveal.agreeText, null);
    assert.strictEqual(v.reveal.groupText, null);
    assert.ok(!v.reveal.markers.some((m) => m.kind === 'member' || m.kind === 'group'));
    assert.strictEqual(v.reveal.markers.find((m) => m.kind === 'nation').pos, finals[i]);
    total += S.scoreAt(50, finals[i]);
    g.tapId('card:primary');
  }
  assert.strictEqual(screen(g), 'archiveDay');
  v = vm(g);
  assert.strictEqual(v.done, true);
  assert.strictEqual(v.practiceText, '往期练习 ' + total + ' · 不计入排行');
  assert.deepStrictEqual(g.app.store.state.archive.results['20261119'].positions, [50, 50, 50, 50, 50]);
  assert.strictEqual(g.server.calls.filter((c) => c === 'submitCard').length, 5, 'archive never submits');
  assert.deepStrictEqual(g.server.call('getDaily', {}, { openid: 'mock-openid-me' }).myStreak, streakBefore);
  assert.strictEqual(ev(g, 'archive_set_complete').length, 1);
  // back to the list: the local result shows, no interstitial after the 1st set
  g.tapId('archiveDay:list');
  assert.strictEqual(g.app.ads.overlay, null);
  assert.strictEqual(vm(g).items[0].statusText, '往期练习 ' + total);
  // second set: lifetime sets = 1 daily + 2 archive = 3, 2nd of the session -> an interstitial may follow
  g.tapId('archive:item:20261118');
  await g.settle();
  for (let i = 0; i < 5; i++) {
    g.ruler(20);
    g.tapId('card:primary');
    g.tapId('card:primary');
  }
  assert.strictEqual(screen(g), 'archiveDay');
  g.tapId('archiveDay:next'); // 再来一期
  assert.ok(g.app.ads.overlay && g.app.ads.overlay.kind === 'interstitial', 'the interstitial is up after the 2nd set');
  await g.settle();
  assert.strictEqual(screen(g), 'card', 'navigation was not delayed by the ad: the next set is already open under it');
  g.wait(3100);
  g.tapId('adstub:complete');
  assert.strictEqual(g.app.ads.overlay, null);
  assert.strictEqual(ev(g, 'interstitial_show').length, 1);
  assert.strictEqual(g.app.store.state.interstitial.count, 1);
  // and not again right away (>= 120 s apart): a 3rd and 4th set within the gap
  assert.strictEqual(g.app.ads.interstitialDue({ setsThisSession: 4, lifetimeSets: 5 }), false);
  g.wait(121000);
  assert.strictEqual(g.app.ads.interstitialDue({ setsThisSession: 4, lifetimeSets: 5 }), true);
});

test('archive: a day played as the daily opens as a read-only review with the final and the percentile; home shows 昨日定分', async (t) => {
  initTime(t, Date.UTC(2026, 10, 19, 4, 0, 0)); // 2026-11-19
  const g = await up(t, { now: Date.UTC(2026, 10, 19, 4, 0, 0), population: 40 });
  await finishDaily(g, [10, 20, 30, 40, 50]);
  g.tapId('back');
  // the day closes at 00:30, the timer finalises at 00:40
  g.wait(12 * 3600e3 + 45 * 60 * 1000);
  g.server.call('finalizeDay', {}, {});
  g.show({ scene: 1001, query: {} });
  await g.settle();
  let v = vm(g);
  assert.strictEqual(v.daily.issueNo, 20);
  assert.strictEqual(v.daily.state, 'available', 'a new day, a new set');
  assert.match(v.daily.yesterdayText, /^昨日定分 \d+ · 超过全国 \d+%$/);
  g.tapId('home:archive');
  await g.settle();
  v = vm(g);
  assert.strictEqual(v.items[0].dateKey, '20261119');
  assert.match(v.items[0].statusText, /^已玩 · 定分 \d+$/);
  g.tapId('archive:item:20261119');
  await g.settle();
  assert.strictEqual(screen(g), 'archiveDay');
  v = vm(g);
  assert.strictEqual(v.kind, 'review');
  assert.deepStrictEqual(v.mine.positions, [10, 20, 30, 40, 50]);
  assert.match(v.mine.percentileText, /^超过全国 \d+%$/);
  assert.strictEqual(v.finals.length, 5);
  assert.strictEqual(v.rows.length, 5);
  assert.ok(!g.has('card:primary'), 'read-only');
});

test('archive offline: cached page with the 离线 note; never cached: 往期需联网查看 with retry', async (t) => {
  const g = await up(t);
  g.tapId('home:archive');
  await g.settle();
  assert.strictEqual(vm(g).state, 'ready');
  g.tapId('back');
  g.server.offline = true;
  g.tapId('home:archive');
  await g.settle();
  assert.strictEqual(vm(g).state, 'ready');
  assert.strictEqual(vm(g).offlineNote, '离线');
  g.tapId('archive:item:20261119');
  await g.settle();
  assert.strictEqual(screen(g), 'archive', 'a day needs the network');
  const g2 = boot(t, { mockServer: createMockServer({ population: 0, launchDateKey: '20261101' }), population: 0 });
  await g2.settle();
  await g2.ready();
  g2.server.offline = true;
  g2.tapId('home:archive');
  await g2.settle();
  assert.strictEqual(vm(g2).state, 'offline');
  assert.strictEqual(vm(g2).errorText, '往期需联网查看');
  g2.server.offline = false;
  g2.tapId('archive:retry');
  await g2.settle();
  assert.strictEqual(vm(g2).state, 'ready');
});

test('archive on the launch day is empty', async (t) => {
  const srv = makeServer(t, { launchDateKey: '20261120' });
  const g = await up(t, { mockServer: srv, population: 0, launchDateKey: '20261120' });
  g.tapId('home:archive');
  await g.settle();
  assert.strictEqual(vm(g).state, 'empty');
  assert.strictEqual(vm(g).emptyText, '还没有往期，明天再来');
});

// ------------------------------------------------------------------ rewarded extras (9)

test('加一题: needs a complete daily, only a full watch pays, unscored, 3 a day', async (t) => {
  const g = await up(t);
  await finishDaily(g);
  const entriesBefore = Object.keys(g.server.db.entries).length;
  const streak = g.server.call('getDaily', {}, { openid: 'mock-openid-me' }).myStreak;
  // closed early: nothing
  g.tapId('result:bonus');
  assert.ok(g.app.ads.overlay);
  g.tapId('adstub:skip');
  await g.settle();
  assert.strictEqual(g.app.ctl.ui.toast.text, '完整观看才能获得');
  assert.strictEqual(screen(g), 'result');
  assert.strictEqual(vm(g).bonus.left, 3);
  for (let n = 1; n <= 3; n++) {
    g.tapId('result:bonus');
    g.wait(3100);
    g.tapId('adstub:complete');
    await g.settle();
    assert.strictEqual(screen(g), 'card');
    let v = vm(g);
    assert.strictEqual(v.mode, 'bonus');
    assert.strictEqual(v.tag, '加一题 · 不计分');
    assert.strictEqual(v.index, null);
    assert.strictEqual(v.total, null);
    g.ruler(30);
    g.tapId('card:primary');
    v = vm(g);
    assert.strictEqual(v.phase, 'revealed');
    assert.strictEqual(v.primaryLabel, '看结果');
    assert.match(v.reveal.nationText, / · 定分$/);
    g.tapId('card:primary');
    assert.strictEqual(screen(g), 'result');
    assert.strictEqual(vm(g).bonus.left, 3 - n);
  }
  assert.strictEqual(vm(g).bonusText, '今天的加一题用完了');
  g.tapId('result:bonus');
  assert.strictEqual(g.app.ads.overlay, null, 'no ad when the day is spent');
  assert.strictEqual(g.app.ctl.ui.toast.text, '今天的加一题用完了');
  assert.strictEqual(ev(g, 'bonus_card').length, 3);
  assert.strictEqual(Object.keys(g.server.db.entries).length, entriesBefore, 'bonus cards touch no entry');
  assert.deepStrictEqual(g.server.call('getDaily', {}, { openid: 'mock-openid-me' }).myStreak, streak);
});

test('no-fill: one free grant per placement per day, then "请稍后再试"; the reward still needs isEnded otherwise', async (t) => {
  const g = await up(t);
  await finishDaily(g);
  g.app.ads.stubSim.rewardedError = 1004;
  g.tapId('result:bonus');
  await g.settle();
  assert.strictEqual(g.app.ctl.ui.toast.text, '暂无广告，本次免费');
  assert.strictEqual(screen(g), 'card', 'the free grant delivered the card');
  g.ruler(10);
  g.tapId('card:primary');
  g.tapId('card:primary');
  assert.strictEqual(vm(g).bonus.left, 2);
  g.tapId('result:bonus');
  await g.settle();
  assert.strictEqual(g.app.ctl.ui.toast.text, '暂无广告，请稍后再试');
  assert.strictEqual(screen(g), 'result');
  assert.strictEqual(vm(g).bonus.left, 2, 'the 2nd failure that day grants nothing');
  // a different placement has its own free grant
  g.tapId('result:dist');
  await g.settle();
  assert.strictEqual(g.app.ctl.ui.toast.text, '暂无广告，本次免费');
  assert.strictEqual(vm(g).sheet, 'distribution');
  const errs = ev(g, 'ad_error');
  assert.strictEqual(errs.length, 3);
  assert.ok(errs.every((e) => e.props.stub === true && e.props.errCode === 1004));
  // the next Beijing day the free grant is back
  g.wait(24 * 3600e3);
  assert.strictEqual(g.app.store.state.adFail.day, '20261120');
});

test('全国分布: unlocked by a full watch for the set; histograms of 21 bins for each card; reopening is free', async (t) => {
  const g = await up(t);
  await finishDaily(g, [10, 30, 50, 70, 90]);
  g.tapId('result:dist');
  g.wait(3100);
  g.tapId('adstub:complete');
  await g.settle();
  let v = vm(g);
  assert.strictEqual(v.sheet, 'distribution');
  assert.strictEqual(v.distribution.unlocked, true);
  assert.strictEqual(v.distribution.hist.length, 5);
  v.distribution.hist.forEach((h) => assert.strictEqual(h.length, 21));
  assert.strictEqual(v.distribution.hist[0].reduce((a, b) => a + b, 0) >= 1, true);
  assert.strictEqual(ev(g, 'distribution_unlock')[0].props.via, 'ad');
  g.tapId('sheet:close');
  assert.strictEqual(vm(g).sheet, null);
  g.tapId('result:dist');
  assert.strictEqual(g.app.ads.overlay, null, 'no second ad for the same set');
  assert.strictEqual(vm(g).sheet, 'distribution');
  assert.strictEqual(ev(g, 'ad_request').length, 1);
});

test('banner: default off; with the remote switch and a unit it shows only on the allowed screens and states', async (t) => {
  const srv = makeServer(t);
  const ref = srv.joinGroupAs('u1', 'G1');
  srv.joinGroupAs('u2', 'G1');
  srv.playDaily('u1', [1, 2, 3, 4, 5], ref);
  srv.playDaily('u2', [5, 4, 3, 2, 1], ref);
  const g = await up(t, { mockServer: srv, population: 0, enter: { scene: 1044, query: { s: 'd' }, shareTicket: 'T', chatType: 3 } });
  await finishDaily(g);
  g.tapId('result:group');
  await g.settle();
  assert.strictEqual(vm(g).banner.show, false, 'default off');
  assert.strictEqual(g.app.ads.banner, null);
  srv.setConfig({ banner: { enabled: true, adUnitId: 'BANNER-1' } });
  g.show({ scene: 1001, query: {} });
  g.tapId('back');
  g.frame();
  assert.strictEqual(g.app.ads.banner, null, 'never on the day result');
  g.tapId('back');
  await g.settle();
  await g.app.ctl.flows.home.refreshDaily(true);
  g.tapId('home:group');
  await g.settle();
  assert.strictEqual(vm(g).state, 'ready');
  assert.strictEqual(vm(g).banner.show, true);
  assert.strictEqual(vm(g).banner.reservedHeight > 24, true);
  assert.ok(g.app.ads.banner && g.app.ads.banner.screen === 'group');
  g.tapId('back');
  g.frame();
  assert.strictEqual(g.app.ads.banner, null, 'gone on home');
});

// ------------------------------------------------------------------ offline, midnight, settings, renderer fallback

test('offline at launch: 今日卡片需联网获取 with retry; the howto and the archive still work', async (t) => {
  const srv = makeServer(t);
  srv.offline = true;
  const g = await up(t, { mockServer: srv, population: 0 });
  assert.strictEqual(vm(g).daily.state, 'offline');
  assert.strictEqual(vm(g).daily.statusText, '今日卡片需联网获取');
  assert.strictEqual(vm(g).daily.primaryLabel, '重试');
  g.tapId('home:howto');
  assert.strictEqual(vm(g).sheet, 'howto');
  g.tapId('sheet:close');
  srv.offline = false;
  g.tapId('home:daily');
  await g.settle();
  assert.strictEqual(vm(g).daily.state, 'available');
  assert.ok(ev(g, 'error').some((e) => e.props.where === 'getDaily'));
});

test('DAILY_UNAVAILABLE shows the same retry state', async (t) => {
  const srv = makeServer(t, { failDaily: true });
  const g = await up(t, { mockServer: srv, population: 0 });
  assert.strictEqual(vm(g).daily.state, 'unavailable');
  assert.ok(g.has('home:daily'));
  assert.ok(g.has('home:archive') && g.has('home:host'));
});

test('offline at confirm: the position is kept as pending, the card is not revealed, retry works; the server wins on a conflict', async (t) => {
  const g = await up(t);
  g.tapId('home:daily');
  g.ruler(90);
  g.server.offline = true;
  g.tapId('card:primary');
  await g.settle();
  let v = vm(g);
  assert.strictEqual(v.phase, 'pending');
  assert.strictEqual(v.reveal, null, 'no reveal without the server');
  assert.strictEqual(v.primaryLabel, '重试');
  assert.strictEqual(v.pendingText, '网络不稳，答案还没送达');
  assert.deepStrictEqual(g.app.store.state.pending, { dateKey: '20261120', idx: 0, pos: 90 });
  // back is allowed; home says 答案待发送
  g.tapId('back');
  assert.strictEqual(vm(g).daily.state, 'pendingSubmit');
  assert.strictEqual(vm(g).daily.statusText, '答案待发送');
  // another device answered card 1 with a different position meanwhile
  g.server.offline = false;
  g.server.call('submitCard', { dateKey: '20261120', idx: 0, pos: 10 }, { openid: 'mock-openid-me' });
  g.tapId('home:daily');
  assert.strictEqual(vm(g).phase, 'pending');
  g.tapId('card:primary');
  await g.settle();
  v = vm(g);
  assert.strictEqual(v.phase, 'revealed');
  assert.strictEqual(v.needle, 10, 'the stored position wins (CARD_DONE)');
  assert.strictEqual(g.app.store.state.pending, null);
  assert.strictEqual(g.server.db.stats['20261120_0'].n, 41, 'counted once (40 synthetic players plus me)');
});

test('a pending card is retried by itself on the next show; the home card follows', async (t) => {
  const g = await up(t);
  g.tapId('home:daily');
  g.ruler(33);
  g.server.offline = true;
  g.tapId('card:primary');
  await g.settle();
  g.tapId('back');
  assert.strictEqual(vm(g).daily.state, 'pendingSubmit');
  g.server.offline = false;
  g.show({ scene: 1001, query: {} });
  await g.settle();
  assert.strictEqual(vm(g).daily.state, 'inProgress');
  assert.strictEqual(vm(g).daily.answered, 1);
  assert.strictEqual(g.app.store.state.pending, null);
});

test('in-progress dailies resume at the first unanswered card after a relaunch (same storage) and on a second device', async (t) => {
  const g = await up(t);
  g.tapId('home:daily');
  for (let i = 0; i < 2; i++) {
    g.ruler(40 + i);
    g.tapId('card:primary');
    await g.settle();
    g.tapId('card:primary');
  }
  const g2 = await up(t, { mockServer: g.server, population: 0, storage: g.storage });
  assert.strictEqual(vm(g2).daily.state, 'inProgress');
  assert.strictEqual(vm(g2).daily.statusText, '已答 2/5');
  g2.tapId('home:daily');
  assert.strictEqual(vm(g2).index, 3);
  const g3 = await up(t, { mockServer: g.server, population: 0, storage: {} });
  assert.strictEqual(vm(g3).daily.answered, 2, 'a fresh device restores progress from the server');
  g3.tapId('home:daily');
  assert.strictEqual(vm(g3).index, 3);
});

test('midnight: onShow after 00:00 moves home to the new issue; a card started on D finishes in the grace window, then LATE_SUBMIT', async (t) => {
  const t2359 = Date.UTC(2026, 10, 20, 15, 59, 0); // 23:59 Beijing
  initTime(t, t2359);
  const srv = createMockServer({ population: 0, launchDateKey: '20261101' });
  const g = await up(t, { now: t2359, mockServer: srv, population: 0 });
  assert.strictEqual(vm(g).daily.issueNo, 20);
  g.tapId('home:daily');
  g.ruler(50);
  g.tapId('card:primary');
  await g.settle();
  g.tapId('card:primary'); // card 2 open at 23:59
  g.wait(20 * 60 * 1000); // 00:19 on the next day, inside the 00:30 grace
  g.ruler(50);
  g.tapId('card:primary');
  await g.settle();
  assert.strictEqual(vm(g).phase, 'revealed', 'the daily may finish until D+1 00:30');
  g.tapId('card:primary');
  g.wait(12 * 60 * 1000); // 00:31
  g.ruler(50);
  g.tapId('card:primary');
  await g.settle();
  assert.strictEqual(screen(g), 'home');
  assert.strictEqual(g.app.ctl.ui.toast.text, '这一期已经结束，可以去往期里玩');
  g.show({ scene: 1001, query: {} });
  await g.settle();
  assert.strictEqual(vm(g).daily.issueNo, 21);
  assert.strictEqual(vm(g).daily.state, 'available');
});

test('settings: sound, large text, high contrast persist and switch the display model; privacy line and contract link', async (t) => {
  const g = await up(t);
  g.tapId('home:settings');
  let v = vm(g);
  assert.strictEqual(v.sheet, 'settings');
  assert.strictEqual(v.settings.friendLine, '好友排行：未开启');
  assert.strictEqual(v.display.scale, 1);
  g.tapId('settings:large');
  g.tapId('settings:contrast');
  g.tapId('settings:sound');
  v = vm(g);
  assert.strictEqual(v.display.largeText, true);
  assert.strictEqual(v.display.scale, 1.25);
  assert.strictEqual(v.display.palette, 'highContrast');
  assert.strictEqual(v.muted, true);
  assert.strictEqual(ev(g, 'display_setting').length, 2);
  g.tapId('settings:privacy');
  assert.ok(g.log.calls.includes('openPrivacyContract'));
  const g2 = await up(t, { storage: g.storage });
  assert.strictEqual(vm(g2).display.largeText, true);
  assert.strictEqual(vm(g2).muted, true);
  g2.tapId('home:daily');
  assert.strictEqual(vm(g2).display.palette, 'highContrast');
});

test('first card of the first daily shows one coach bubble, never again', async (t) => {
  const g = await up(t);
  g.tapId('home:daily');
  assert.strictEqual(vm(g).coach, true);
  g.tapId('coach:ok');
  assert.strictEqual(vm(g).coach, false);
  const g2 = await up(t, { mockServer: g.server, population: 0, storage: g.storage });
  g2.tapId('home:daily');
  assert.strictEqual(vm(g2).coach, false);
});

test('report a card: exactly three reasons, no text, a stored row, a thanks toast', async (t) => {
  const g = await up(t);
  g.tapId('home:daily');
  g.ruler(50);
  assert.ok(!g.has('card:report'), 'only after the reveal');
  g.tapId('card:primary');
  await g.settle();
  g.tapId('card:report');
  assert.strictEqual(vm(g).sheet, 'report');
  assert.deepStrictEqual(g.ids().filter((i) => i.indexOf('report:') === 0).sort(), ['report:ambiguous', 'report:cancel', 'report:typo', 'report:unsuitable']);
  g.tapId('report:cancel');
  assert.strictEqual(vm(g).sheet, null);
  g.tapId('card:report');
  g.tapId('report:ambiguous');
  await g.settle();
  assert.strictEqual(g.server.db.reports.length, 1);
  assert.strictEqual(g.server.db.reports[0].reason, 'ambiguous');
  assert.strictEqual(g.app.ctl.ui.toast.text, '谢谢，我们会尽快查看');
  assert.strictEqual(ev(g, 'card_report').length, 1);
});

test('renderer fallback: a real renderer that throws is replaced by the stub for the session and reported; missing renderer = stub', async (t) => {
  const boom = { screens: { home: { draw() { throw new Error('boom'); } } }, makeLayout: () => ({ W: 375, H: 812 }), overlay: { draw: () => [] } };
  const g = boot(t, { forceStub: false, realRenderer: boom });
  await g.settle();
  assert.strictEqual(g.app.renderer.kind, 'real');
  const text = g.frame();
  assert.strictEqual(g.app.renderer.kind, 'stub');
  assert.match(g.app.renderer.fallbackReason, /^draw:home: boom/);
  assert.ok(g.frame().indexOf('群友刻度盘') >= 0 || text.indexOf('群友刻度盘') >= 0, 'the stub drew the screen');
  await g.ready();
  assert.ok(g.has('home:host'), 'and it is playable');
  assert.ok(g.app.analytics.queue.some((e) => e.name === 'error' && e.props.where === 'render'));
  g.tapId('home:daily');
  assert.strictEqual(screen(g), 'card');
  const m = boot(t, { forceStub: false });
  await m.settle();
  assert.strictEqual(m.app.renderer.kind, 'stub');
  assert.strictEqual(m.app.renderer.fallbackReason, 'missing');
  const bad = boot(t, { forceStub: false, realRenderer: { screens: {} } });
  await bad.settle();
  assert.strictEqual(bad.app.renderer.kind, 'stub');
  assert.strictEqual(bad.app.renderer.fallbackReason, 'malformed');
  const good = { screens: new Proxy({}, { get: () => ({ draw: () => [{ id: 'home:host', x: 0, y: 0, w: 100, h: 100 }] }) }), makeLayout: () => ({ W: 375, H: 812 }), overlay: { draw: () => [] } };
  const ok = boot(t, { forceStub: false, realRenderer: good });
  await ok.settle();
  ok.frame();
  assert.strictEqual(ok.app.renderer.kind, 'real');
  assert.ok(ok.has('home:host'));
});

test('wx.reportEvent is never called; events carry a top-level sessionId and clientTs, no openid or group id', async (t) => {
  const g = await up(t, { enter: { scene: 1044, query: { s: 'd' }, shareTicket: 'T', chatType: 3 } });
  g.wx.reportEvent = () => assert.fail('wx.reportEvent must not be used');
  await finishDaily(g);
  await g.app.analytics.flush();
  const stored = g.server.db.events;
  assert.ok(stored.length > 5);
  stored.forEach((e) => {
    assert.ok(typeof e.sessionId === 'string' && e.sessionId.length > 8, e.name);
    assert.ok(typeof e.clientTs === 'number', e.name);
    assert.ok(!('openid' in e.props) && !('groupRef' in e.props));
    assert.strictEqual(e.props.contentVersion, 1);
    assert.ok('isNewUser' in e.props && 'appVersion' in e.props);
  });
  assert.ok(!/mock-openid-me|G1/.test(JSON.stringify(stored)));
});
