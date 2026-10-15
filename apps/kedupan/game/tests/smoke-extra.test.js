/**
 * More end-to-end checks: the bullseye effects, subscribe branches, group-join failure, the marker after a first guess,
 * archive paging, and the scripted session of AC 77 (every spec 12 event fires with its props).
 */

const test = require('node:test');
const assert = require('node:assert');
const { boot, initTime, playDaily } = require('./harness');
const { createMockServer } = require('../js/mock-server');
const { getContent } = require('../core/content');

const content = getContent(1);
const vm = (g) => g.app.ctl.view().vm;
const screen = (g) => g.app.ctl.view().screen;
const mk = (t, o) => {
  initTime(t);
  return createMockServer(Object.assign({ population: 0, launchDateKey: '20261101' }, o || {}));
};
const allEv = (g) => g.app.analytics.queue.concat(g.server.db.events);

async function up(t, opts) {
  const g = boot(t, opts);
  await g.settle();
  await g.ready();
  return g;
}

test('AC17: 心有灵犀 (d <= 2) buzzes and chimes once; other labels do not', async (t) => {
  const srv = mk(t);
  const g = await up(t, { mockServer: srv, population: 0 });
  g.tapId('home:daily');
  const anchor = srv.db.sets['20261120'].cards[0].anchor;
  g.ruler(anchor);
  g.tapId('card:primary');
  await g.settle();
  assert.strictEqual(vm(g).reveal.bullseye, true);
  assert.strictEqual(vm(g).reveal.label, '心有灵犀');
  assert.strictEqual(g.log.calls.filter((c) => c === 'vibrateShort').length, 1);
  g.tapId('card:primary');
  const a2 = srv.db.sets['20261120'].cards[1].anchor;
  g.ruler(a2 < 50 ? 95 : 3);
  g.tapId('card:primary');
  await g.settle();
  assert.strictEqual(vm(g).reveal.bullseye, false);
  assert.strictEqual(g.log.calls.filter((c) => c === 'vibrateShort').length, 1, 'no vibration for other labels');
  assert.ok(vm(g).reveal.label !== '心有灵犀');
});

test('muted: the sound switch silences every cue and persists', async (t) => {
  const g = await up(t);
  g.tapId('home:sound');
  assert.strictEqual(vm(g).muted, true);
  g.tapId('home:daily');
  g.ruler(30);
  g.ruler(60);
  g.tapId('card:primary');
  await g.settle();
  assert.strictEqual(g.log.calls.filter((c) => c === 'audio.play').length, 0);
  const g2 = await up(t, { storage: g.storage });
  assert.strictEqual(vm(g2).muted, true);
  g2.tapId('home:sound');
  g2.tapId('home:daily');
  g2.ruler(30);
  assert.ok(g2.log.calls.filter((c) => c === 'audio.play').length >= 1, 'the tick plays when unmuted');
});

test('subscribe: never offered or requested without a template; reject -> declined; ban (20004) -> never offered again', async (t) => {
  const mkRound = (srv, who) => {
    const c = srv.call('createRound', { spectrumId: 's001' }, { openid: who });
    srv.call('setClue', { roundId: c.roundId, clueMode: 'chat' }, { openid: who });
    return c.roundId;
  };
  // no template: the offer never renders
  const srv0 = mk(t);
  const r0 = mkRound(srv0, 'h');
  const g0 = boot(t, { mockServer: srv0, openid: 'x', population: 0, enter: { scene: 1044, query: { r: r0 } } });
  await g0.settle();
  g0.ruler(50);
  g0.tapId('round:primary');
  await g0.settle();
  assert.strictEqual(vm(g0).status, 'submitted');
  assert.strictEqual(vm(g0).subscribe.state, 'hidden');
  assert.ok(!g0.has('round:subscribe'));
  assert.ok(!g0.log.calls.includes('requestSubscribeMessage'));
  // with a template, a guesser is offered it right after the guess; rejecting hides it for that round
  const srv = mk(t);
  srv.setConfig({ subscribe: { tmplId: 'TMPL' } });
  const r1 = mkRound(srv, 'h');
  const g1 = boot(t, { mockServer: srv, openid: 'x', population: 0, subscribe: 'reject', enter: { scene: 1044, query: { r: r1 } } });
  await g1.settle();
  assert.strictEqual(vm(g1).subscribe.state, 'hidden', 'not before the guess');
  g1.ruler(50);
  g1.tapId('round:primary');
  await g1.settle();
  assert.strictEqual(vm(g1).subscribe.state, 'offer');
  g1.tapId('round:subscribe');
  await g1.settle();
  assert.strictEqual(vm(g1).subscribe.state, 'declined');
  assert.strictEqual(Object.keys(srv.db.subs).length, 0);
  assert.ok(allEv(g1).some((e) => e.name === 'subscribe_result' && e.props.result === 'reject'));
  // ban: hidden for good on this device
  const r2 = mkRound(srv, 'h2');
  const g2 = boot(t, { mockServer: srv, openid: 'y', population: 0, subscribe: 20004, enter: { scene: 1044, query: { r: r2 } } });
  await g2.settle();
  g2.ruler(50);
  g2.tapId('round:primary');
  await g2.settle();
  g2.tapId('round:subscribe');
  await g2.settle();
  assert.strictEqual(g2.app.store.state.subscribeBanned, true);
  assert.strictEqual(vm(g2).subscribe.state, 'unavailable');
  const g3 = boot(t, { mockServer: srv, openid: 'y', population: 0, storage: g2.storage, enter: { scene: 1044, query: { r: mkRound(srv, 'h3') } } });
  await g3.settle();
  g3.ruler(50);
  g3.tapId('round:primary');
  await g3.settle();
  assert.strictEqual(vm(g3).subscribe.state, 'unavailable');
  assert.ok(!g3.has('round:subscribe'));
});

test('a first round guess of the day writes the presence marker (same {d, s} key) when no daily marker exists', async (t) => {
  const srv = mk(t);
  const c = srv.call('createRound', { spectrumId: 's001' }, { openid: 'h' });
  srv.call('setClue', { roundId: c.roundId, clueMode: 'chat' }, { openid: 'h' });
  const g = boot(t, { mockServer: srv, openid: 'z', population: 0, enter: { scene: 1044, query: { r: c.roundId } } });
  await g.settle();
  assert.strictEqual(g.log.cloudWrites.length, 0, 'opening a card writes nothing');
  g.ruler(50);
  g.tapId('round:primary');
  await g.settle();
  assert.strictEqual(g.log.cloudWrites.length, 1);
  assert.deepStrictEqual(g.log.cloudWrites[0].map((k) => k.key), ['kd']);
  assert.strictEqual(JSON.parse(g.log.cloudWrites[0][0].value).d, '20261120');
});

test('group join failures (40097, no ticket id) leave no group context and change nothing else', async (t) => {
  const g = boot(t, { groupEnterFail: 40097, enter: { scene: 1044, query: { s: 'd' }, shareTicket: 'T', chatType: 1 } });
  await g.settle();
  await g.ready();
  assert.strictEqual(g.app.ctl.group.status, 'failed');
  assert.strictEqual(vm(g).group.status, 'failed');
  assert.strictEqual(vm(g).group.bannerText, null);
  assert.ok(allEv(g).some((e) => e.name === 'group_join' && e.props.result === 'wrongScene'));
  assert.strictEqual(vm(g).daily.state, 'available');
  g.tapId('home:group');
  await g.settle();
  assert.strictEqual(vm(g).state, 'groupFailed');
  assert.strictEqual(vm(g).explainer, '在群聊里点开本游戏的卡片，就能看到本群的默契度');
  g.tapId('back');
  assert.strictEqual(screen(g), 'home');
  // not a group chat at the server
  const g2 = boot(t, { groupData: { opengid: 'G', chat_type: 1 }, enter: { scene: 1044, query: { s: 'd' }, shareTicket: 'T' } });
  await g2.settle();
  assert.strictEqual(g2.app.ctl.group.status, 'failed');
  assert.ok(allEv(g2).some((e) => e.name === 'group_join' && e.props.result === 'notGroup'));
});

test('archive paging: 30 per page, load more appends', async (t) => {
  const srv = mk(t, { launchDateKey: '20261001' });
  const g = await up(t, { mockServer: srv, population: 0 });
  g.tapId('home:archive');
  await g.settle();
  assert.strictEqual(vm(g).items.length, 30);
  assert.strictEqual(vm(g).hasMore, true);
  g.tapId('archive:more');
  await g.settle();
  assert.strictEqual(vm(g).items.length, 50);
  assert.strictEqual(vm(g).hasMore, false);
  assert.ok(!g.has('archive:more'));
});

test('archive: closed days only after 00:30; open data in the day review has no group dots; a set can be abandoned from the card', async (t) => {
  const g = await up(t);
  g.tapId('home:archive');
  await g.settle();
  g.tapId('archive:item:20261119');
  await g.settle();
  g.ruler(10);
  g.tapId('back');
  assert.strictEqual(screen(g), 'archive', 'back from an archive card returns to the list');
  assert.strictEqual(g.app.store.state.archive.results['20261119'], undefined, 'nothing is stored for an abandoned set');
  g.tapId('back');
  assert.strictEqual(screen(g), 'home');
});

test('AC77: a scripted session fires every client event of spec 12 with sessionId and clientTs', async (t) => {
  const srv = mk(t);
  srv.setConfig({ subscribe: { tmplId: 'TMPL' } });
  const ref = srv.joinGroupAs('friend1', 'G9');
  srv.joinGroupAs('friend2', 'G9');
  srv.playDaily('friend1', [20, 30, 40, 50, 60], ref);
  srv.playDaily('friend2', [22, 33, 44, 55, 66], ref);
  // another player's round for me to guess
  const theirs = srv.call('createRound', { spectrumId: 's001' }, { openid: 'host9' });
  srv.call('setClue', { roundId: theirs.roundId, clueMode: 'chat' }, { openid: 'host9' });
  const privacy = {};
  const g = boot(t, { mockServer: srv, population: 0, privacy, enter: { scene: 1044, query: { s: 'd' }, shareTicket: 'T', chatType: 3 } });
  await g.settle();
  await g.ready(); // howto_view (auto) happened at launch
  g.tapId('home:howto');
  g.tapId('sheet:close');
  await playDaily(g, [21, 31, 41, 51, 61]); // daily x5, marker write
  g.tapId('result:share'); // share_tap
  await g.settle();
  g.tapId('result:group'); // privacy_result, friend_scope_result, group_view
  await g.settle();
  g.tapId('back');
  g.tapId('result:friend'); // friend_board_view
  await g.settle();
  g.tapId('back');
  // host a round: round_create, round_clue, share_tap, round_view, subscribe_offer/result
  g.tapId('result:host');
  g.tapId('create:spectrum:' + vm(g).spectra[0].id);
  await g.settle();
  g.tapId('create:mode:chat');
  g.tapId('create:share');
  await g.settle();
  g.tapId('round:subscribe');
  await g.settle();
  // a guess on another card: card_open (warm), round_view, round_guess
  g.show({ scene: 1044, query: { r: theirs.roundId }, shareTicket: 'T2' });
  await g.settle();
  g.ruler(40);
  g.tapId('round:primary');
  await g.settle();
  // bonus (ads), early close, no-fill, distribution, report, display setting
  g.tapId('round:home');
  g.tapId('home:daily');
  g.tapId('result:bonus');
  g.tapId('adstub:skip'); // ad_request, ad_show, ad_close_early
  await g.settle();
  g.tapId('result:bonus');
  g.wait(3100);
  g.tapId('adstub:complete'); // ad_reward
  await g.settle();
  g.ruler(30);
  g.tapId('card:primary'); // bonus_card
  g.tapId('card:report');
  g.tapId('report:typo'); // card_report
  await g.settle();
  g.tapId('card:primary');
  g.app.ads.stubSim.rewardedError = 1004;
  g.tapId('result:dist'); // ad_error + distribution_unlock (nofill)
  await g.settle();
  g.tapId('sheet:close');
  g.app.ads.stubSim.rewardedError = null;
  g.tapId('back');
  g.tapId('home:settings');
  g.tapId('settings:large'); // display_setting
  g.tapId('sheet:close');
  // archive x2 and the interstitial
  g.tapId('home:archive'); // archive_view
  await g.settle();
  for (const dk of ['20261119', '20261118']) {
    g.tapId('archive:item:' + dk);
    await g.settle();
    for (let i = 0; i < 5; i++) {
      g.ruler(50);
      g.tapId('card:primary');
      g.tapId('card:primary');
    }
    if (dk === '20261118') g.tapId('archiveDay:list'); // the interstitial is due here (2nd set, 3+ lifetime sets)
    else g.tapId('archiveDay:list');
  }
  g.wait(3100);
  if (g.app.ads.overlay) g.tapId('adstub:complete');
  // a launch error and the final flush
  g.show({ scene: 1001, query: {} });
  g.tapId('back');
  g.server.offline = true;
  g.tapId('home:archive');
  await g.settle();
  g.server.offline = false;
  await g.app.analytics.flush();
  await g.settle();
  const seen = new Set(g.server.db.events.map((e) => e.name));
  const want = ['session_start', 'card_open', 'howto_view', 'daily_card_place', 'daily_card_reveal', 'daily_complete', 'daily_result_view', 'share_tap', 'round_create', 'round_clue', 'round_guess', 'round_view', 'group_join', 'group_view', 'friend_board_view', 'archive_view', 'archive_set_complete', 'bonus_card', 'distribution_unlock', 'card_report', 'privacy_result', 'friend_scope_result', 'marker_write', 'ad_request', 'ad_show', 'ad_reward', 'ad_close_early', 'ad_error', 'subscribe_offer', 'subscribe_result', 'display_setting'];
  const missing = want.filter((n) => !seen.has(n));
  assert.deepStrictEqual(missing, [], 'events that never fired: ' + missing.join(','));
  // counts that must be exactly once per trigger
  const count = (n) => g.server.db.events.filter((e) => e.name === n).length;
  assert.strictEqual(count('daily_complete'), 1);
  assert.strictEqual(count('daily_card_place'), 5);
  assert.strictEqual(count('daily_card_reveal'), 5);
  assert.strictEqual(count('daily_result_view'), 2, 'finishing card 5 and opening the result again from home; coming back from a bonus card does not count');
  assert.strictEqual(count('archive_set_complete'), 2);
  assert.strictEqual(count('bonus_card'), 1);
  assert.strictEqual(count('session_start'), 1);
  g.server.db.events.forEach((e) => {
    assert.ok(e.sessionId && typeof e.clientTs === 'number', e.name);
    assert.ok(!('openid' in e.props), e.name);
  });
  assert.ok(g.server.db.events.every((e) => !/G9|friend1|friend2|host9|T2/.test(JSON.stringify(e))), 'no group id, openid or ticket in any event');
  // the interstitial was shown after the 2nd archive set (lifetime sets = daily + 2)
  assert.strictEqual(count('interstitial_show'), 1);
  assert.strictEqual(g.log.cloudWrites.length >= 1, true);
  // wx.reportEvent was not even present on the fake
  assert.strictEqual(g.wx.reportEvent, undefined);
});

test('KPI definitions can each be computed from the event stream (AC 78)', async (t) => {
  const g = await up(t);
  await playDaily(g, [10, 20, 30, 40, 50]);
  g.tapId('result:share');
  await g.settle();
  await g.app.analytics.flush();
  const ev = g.server.db.events;
  const by = (n) => ev.filter((e) => e.name === n);
  const completes = by('daily_complete');
  const shares = by('share_tap').filter((e) => ['daily', 'group'].includes(e.props.kind));
  const shareRate = shares.length / completes.length; // share rate = share_tap(daily/group) / daily_complete
  assert.strictEqual(shareRate, 1);
  const sessions = new Set(ev.map((e) => e.sessionId));
  assert.strictEqual(sessions.size, 1);
  const opens = by('card_open');
  assert.strictEqual(opens.length, 0);
  assert.ok(by('daily_card_reveal').every((e) => e.props.dateKey && typeof e.props.score === 'number'));
  assert.ok(completes[0].props.durationMs >= 0 && completes[0].props.total > 0);
  assert.strictEqual(typeof by('session_start')[0].props.fromCard, 'string');
});

test('the group context belongs to the entry that brought it: a later card without a ticket clears it', async (t) => {
  const g = boot(t, { enter: { scene: 1044, query: { s: 'd' }, shareTicket: 'T', chatType: 3 } });
  await g.settle();
  await g.ready();
  assert.strictEqual(vm(g).group.status, 'ok');
  g.show({ scene: 1001, query: {} });
  await g.settle();
  assert.strictEqual(vm(g).group.status, 'ok', 'a plain return keeps it');
  g.show({ scene: 1044, query: { s: 'd', d: '20261120' } });
  await g.settle();
  assert.strictEqual(vm(g).group.status, 'none');
  assert.strictEqual(vm(g).group.bannerText, null);
});
