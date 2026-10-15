'use strict';
/**
 * Fake-wx flows beyond the first daily: archive, practice, rewarded hints, interstitials,
 * share and challenge entry, offline mid-play, privacy and friend-scope refusal, boards,
 * the window closing, display modes, analytics and package hygiene.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { boot, tapAndSettle } = require('./harness');

const events = (g) => g.app.api.mock.db.events.concat(g.app.analytics.queue);
const names = (g) => events(g).map((e) => e.name);
const count = (g, n) => names(g).filter((x) => x === n).length;

async function startUp(t, opts) {
  const g = boot(t, opts);
  await g.settle();
  if (g.has('sheet:close')) g.tapId('sheet:close');
  return g;
}

async function toReveal(g) {
  g.wait(1500);
  g.frame();
  await g.settle();
  assert.equal(g.view().screen, 'reveal', 'screen ' + g.view().screen);
}

async function typeGuess(g, word) {
  g.wait(350);
  g.type(word);
  g.confirm(word);
  await g.settle();
}

/** On the play screen: type the answer (the test peeks at the dev server) and land on the reveal. */
async function solveByTyping(g) {
  const id = g.view().vm.puzzleId;
  g.tapId('key:open');
  await typeGuess(g, g.server.answerOf(id));
  await toReveal(g);
}

test('archive: list, play a past daily unranked, rewarded hint via the stub, no marker or streak (AC 47, 48, 62, 64)', async (t) => {
  const g = await startUp(t);
  await tapAndSettle(g, 'home:archive');
  let vm = g.view().vm;
  assert.equal(g.view().screen, 'archive');
  assert.equal(vm.state, 'ready');
  assert.equal(vm.items.length, 20);
  assert.equal(vm.items[0].status, 'today');
  assert.equal(vm.items[0].line, '今日 · 去猜');
  assert.equal(vm.items[1].status, 'unplayed');
  assert.equal(vm.items[1].line, '未玩  去猜');
  assert.equal(vm.items[1].title, '第19期 11月19日');
  assert.ok(vm.items.every((i) => !('answer' in i)));
  assert.equal(vm.practice.line, '练习题  已完成 0 / 3');
  assert.equal(count(g, 'archive_view'), 1);

  await tapAndSettle(g, 'archive:item:1');
  vm = g.view().vm;
  assert.equal(g.view().screen, 'play');
  assert.equal(vm.kind, 'archive');
  assert.equal(vm.ranked, false);
  assert.equal(vm.title, '往期 第19期');
  assert.equal(vm.adHint.visible, true);
  assert.equal(vm.adHint.left, 3);
  await tapAndSettle(g, 'warmup:0');

  // closing the ad early grants nothing
  g.tapId('hint:ad');
  assert.equal(g.view().overlay.adStub.kind, 'rewarded');
  g.tapId('adstub:skip');
  await g.settle();
  assert.equal(g.view().overlay.toast.text, '完整观看才能获得提示');
  assert.equal(g.view().vm.steps, 1);
  // watching it all grants the hint
  g.tapId('hint:ad');
  g.wait(3100);
  g.tapId('adstub:complete');
  await g.settle();
  vm = g.view().vm;
  assert.equal(vm.steps, 2);
  assert.equal(vm.hintsUsed, 1);
  assert.equal(vm.adHint.left, 2);
  assert.ok(vm.ladder.some((r) => r.isHint));
  assert.deepEqual(
    g.log.ads.filter((a) => a[0] === 'rewarded').map((a) => a[1].disableFallbackSharePage),
    [],
    'stub mode creates no real ad instance'
  );
  // no-fill: free once per puzzle, then blocked (AC 89)
  g.app.ads.stubSim.rewardedError = 1004;
  g.tapId('hint:ad');
  await g.settle();
  assert.equal(g.view().overlay.toast.text, '暂无广告，本次免费');
  assert.equal(g.view().vm.steps, 3);
  g.wait(3000);
  g.tapId('hint:ad');
  await g.settle();
  assert.equal(g.view().overlay.toast.text, '暂无广告，请稍后再试');
  assert.equal(g.view().vm.steps, 3);
  g.app.ads.stubSim.rewardedError = null;

  await solveByTyping(g);
  const rv = g.view().vm;
  assert.equal(rv.ranked, false);
  assert.equal(rv.title, '往期 · 第 19 期');
  assert.match(rv.summary, /用了 2 次提示/);
  assert.equal(rv.streak.show, false);
  assert.equal(g.log.cloudWrites.length, 0, 'unranked plays never write KV markers');
  assert.equal(g.server.db.player.curStreak, 0);
  assert.equal(g.server.db.boardRows['20261120'], undefined);

  g.tapId('reveal:back');
  await tapAndSettle(g, 'home:archive');
  vm = g.view().vm;
  const it = vm.items[1];
  assert.equal(it.status, 'solved');
  assert.ok(it.answer);
  assert.match(it.line, new RegExp('^' + it.answer + ' · \\d+步$'));
  assert.equal(vm.items[2].answer, undefined);
});

test('4th rewarded hint is not offered; the third was the last (AC 48)', async (t) => {
  const g = await startUp(t);
  await tapAndSettle(g, 'home:archive');
  await tapAndSettle(g, 'archive:practice');
  assert.equal(g.view().vm.kind, 'practice');
  await tapAndSettle(g, 'warmup:0');
  for (let i = 0; i < 3; i++) {
    g.tapId('hint:ad');
    g.wait(3100);
    g.tapId('adstub:complete');
    await g.settle();
  }
  assert.equal(g.view().vm.adHint.left, 0);
  assert.equal(g.view().vm.steps, 4);
  assert.ok(!g.has('hint:ad'), 'disabled at 0 left');
});

test('practice and 再来一题: newest unplayed past daily, then practice; interstitial only after the 2nd/4th puzzle from the 3rd lifetime puzzle (AC 61, 90, 91)', async (t) => {
  const g = await startUp(t);
  await tapAndSettle(g, 'home:daily');
  await solveByTyping(g); // finished 1 (the ranked daily)
  const seq = [];
  const nextAndSolve = async (expectAd) => {
    g.wait(130000);
    g.tapId('reveal:next');
    await g.settle();
    const ad = g.view().overlay.adStub;
    assert.equal(!!ad, !!expectAd, 'interstitial expected ' + expectAd + ' at ' + seq.length);
    if (ad) {
      assert.equal(ad.kind, 'interstitial');
      g.tapId('adstub:skip');
      await g.settle();
    }
    assert.equal(g.view().screen, 'play');
    seq.push(g.view().vm.puzzleId);
    await solveByTyping(g);
  };
  await nextAndSolve(false); // finished 1 -> opens the next puzzle, no ad (lifetime 1)
  await nextAndSolve(false); // finished 2 -> lifetime 2 < 3
  await nextAndSolve(false); // finished 3 -> odd
  await nextAndSolve(true); // finished 4 -> due
  assert.deepEqual(seq, ['d20261119', 'd20261118', 'd20261117', 'd20261116']);
  assert.equal(count(g, 'interstitial_show'), 1);
  // within the 120 s minimum gap nothing more is shown even at an even count
  g.tapId('reveal:next');
  await g.settle();
  assert.ok(!g.view().overlay.adStub);
  await solveByTyping(g); // finished 6
  g.tapId('reveal:next');
  await g.settle();
  assert.ok(!g.view().overlay.adStub, 'gap not elapsed');
  assert.equal(g.view().screen, 'play');
  assert.equal(count(g, 'next_puzzle'), 6);
});

test('interstitial rejections 2001-2003 are skipped silently (AC 91)', async (t) => {
  const g = await startUp(t);
  await tapAndSettle(g, 'home:daily');
  g.app.ads.stubSim.interstitialError = 2002;
  for (let i = 0; i < 4; i++) {
    await solveByTyping(g);
    g.wait(130000);
    g.tapId('reveal:next');
    await g.settle();
  }
  assert.ok(!g.view().overlay.adStub);
  assert.equal(count(g, 'interstitial_show'), 0);
  assert.ok(events(g).some((e) => e.name === 'ad_error' && e.props.placement === 'interstitial' && e.props.errCode === 2002));
  assert.equal(g.storage.yyrl_state_v1 && JSON.parse(g.storage.yyrl_state_v1).interstitial.count, 0);
});

test('practice list: 去练习 opens #1; finishing it counts in the archive (AC 62)', async (t) => {
  const g = await startUp(t);
  await tapAndSettle(g, 'home:archive');
  await tapAndSettle(g, 'archive:practice');
  assert.equal(g.view().vm.title, '练习 #1');
  assert.equal(g.view().vm.ranked, false);
  await solveByTyping(g);
  assert.equal(g.view().vm.title, '练习 #1');
  assert.equal(g.view().vm.answer, '老虎');
  assert.equal(g.view().vm.streak.show, false);
  g.tapId('reveal:back');
  await tapAndSettle(g, 'home:archive');
  assert.equal(g.view().vm.practice.line, '练习题  已完成 1 / 3');
});

test('share result: createChallenge then shareAppMessage with c=<id>, no word, nothing granted (AC 69, 70, 76)', async (t) => {
  const g = await startUp(t);
  await tapAndSettle(g, 'home:daily');
  assert.ok(!g.has('reveal:share'));
  await solveByTyping(g);
  const before = JSON.stringify([g.view().vm.summary, g.view().vm.streak, g.server.db.player, g.server.db.plays['d20261120'].hintsUsed]);
  await tapAndSettle(g, 'reveal:share');
  assert.equal(g.log.shares.length, 1);
  const s = g.log.shares[0];
  assert.match(s.query, /^c=[0-9A-Z]{8}$/);
  assert.equal(s.imageUrl, 'assets/share-fallback.png');
  assert.match(s.title, /^第20期我 \d+ 步猜中，你几步？$/);
  assert.ok(!/月亮|月球/.test(JSON.stringify(s)), 'no word in the share');
  assert.equal(JSON.stringify([g.view().vm.summary, g.view().vm.streak, g.server.db.player, g.server.db.plays['d20261120'].hintsUsed]), before);
  assert.equal(count(g, 'challenge_created'), 1);
  assert.equal(count(g, 'share_tap'), 1);
  // the capsule menu share is generic
  const m = g.handlers.shareMenu();
  assert.deepEqual([m.title, m.query], ['今天全国猜同一个词，来试试？', 's=m']);
  // createChallenge fails: the share proceeds with p=<puzzleId>
  const orig = g.server.call;
  g.server.call = (n, d) => (n === 'createChallenge' ? { ok: false, code: 'INTERNAL' } : orig(n, d));
  await tapAndSettle(g, 'reveal:share');
  assert.equal(g.log.shares[1].query, 'p=d20261120');
});

test('challenge card for a past daily: entry, accept, unranked play, comparison with their words after finishing (AC 74, 75)', async (t) => {
  const g = await startUp(t);
  const id = g.server.addForeignChallenge({ puzzleId: 'd20261119', steps: 18, hints: 1, temps: [10, 40, 100], words: ['蔬菜', '番茄'] });
  g.show({ scene: 1044, query: { c: id }, shareTicket: 'tk1' });
  await g.settle();
  let vm = g.view().vm;
  assert.equal(g.view().screen, 'challenge');
  assert.equal(vm.state, 'ready');
  assert.equal(vm.headline, '好友在第 19 期用了 18 步');
  assert.equal(vm.note, '往期题，不计入榜单');
  assert.deepEqual(vm.owner.temps, [10, 40, 100]);
  assert.ok(!JSON.stringify(vm).includes('蔬菜'), 'their words are locked before finishing');
  assert.ok(g.log.calls.includes('getGroupEnterInfo'));
  assert.equal(count(g, 'card_open'), 1);
  await tapAndSettle(g, 'challenge:accept');
  assert.equal(g.view().vm.ranked, false);
  assert.equal(g.view().vm.kind, 'archive');
  await solveByTyping(g);
  vm = g.view().vm;
  assert.ok(vm.compare, 'comparison after finishing');
  assert.match(vm.compare.line, /^你 \d+ 步 · TA 18 步$/);
  assert.deepEqual(vm.compare.theirWords, ['蔬菜', '番茄']);
  assert.equal(count(g, 'challenge_finish'), 1);
  g.tapId('reveal:theirWords');
  assert.equal(g.view().vm.sheet, 'theirWords');
  g.tapId('sheet:close');
  assert.equal(g.view().vm.sheet, null);
  // group context: the home screen shows the group line
  g.tapId('reveal:back');
  assert.equal(g.view().vm.hasGroupContext, true);
  assert.equal(g.view().vm.groupLine, '来自群聊 · 查看本群今日战况');
});

test('challenge for today\'s daily counts for the board and the play is ranked (AC 73); already finished goes straight to the comparison', async (t) => {
  const g = await startUp(t);
  const id = g.server.addForeignChallenge({ puzzleId: 'd20261120', steps: 21, words: ['aa'] });
  g.show({ scene: 1044, query: { c: id } });
  await g.settle();
  const vm = g.view().vm;
  assert.equal(vm.countsAsToday, true);
  assert.equal(vm.note, '这就是今日一词，计入今日榜单');
  await tapAndSettle(g, 'challenge:accept');
  assert.equal(g.view().vm.ranked, true);
  assert.equal(g.view().vm.kind, 'daily');
  await solveByTyping(g);
  assert.ok(g.view().vm.compare);
  // open the same card again: already finished, straight to the reveal with the comparison
  g.tapId('reveal:back');
  g.wait(4000);
  g.show({ scene: 1044, query: { c: id } });
  await g.settle();
  assert.equal(g.view().screen, 'reveal');
  assert.ok(g.view().vm.compare);
});

test('own challenge card, unknown card, malformed query, fallback share, puzzle card, menu card (spec 9.3)', async (t) => {
  const g = await startUp(t);
  await tapAndSettle(g, 'home:daily');
  await solveByTyping(g);
  await tapAndSettle(g, 'reveal:share');
  const own = g.log.shares[0].query.slice(2);
  g.tapId('reveal:back');
  g.wait(4000);
  g.show({ scene: 1007, query: { c: own } });
  await g.settle();
  let vm = g.view().vm;
  assert.equal(vm.state, 'own');
  assert.match(vm.headline, /^你在第 20 期用了 \d+ 步$/);
  assert.equal(vm.sub, '这是你分享的成绩');
  assert.equal(vm.ownLine, '还没有好友完成');
  g.tapId('challenge:home');
  // unknown card
  g.wait(4000);
  g.show({ scene: 1007, query: { c: 'ZZZZZZZZ' } });
  await g.settle();
  assert.equal(g.view().vm.state, 'notFound');
  assert.equal(g.view().vm.headline, '这道题找不到了');
  g.tapId('challenge:home');
  // malformed and fallback share: home, logged
  g.wait(4000);
  g.show({ scene: 1007, query: { c: 'bad' } });
  g.wait(4000);
  g.show({ scene: 1007, query: { wxad_fallback_share: '1' } });
  g.wait(4000);
  g.show({ scene: 1007, query: { p: 'zzz' } });
  await g.settle();
  assert.equal(g.view().screen, 'home');
  assert.equal(events(g).filter((e) => e.name === 'error' && e.props.where === 'entry').length, 3);
  // p=<past daily> opens that puzzle unranked
  g.wait(4000);
  g.show({ scene: 1007, query: { p: 'd20261118' } });
  await g.settle();
  assert.equal(g.view().screen, 'play');
  assert.equal(g.view().vm.title, '往期 第18期');
  assert.equal(g.view().vm.ranked, false);
  g.tapId('back');
  // s=m with a ticket joins the group and stays on home; nothing is granted
  g.wait(4000);
  g.show({ scene: 1044, query: { s: 'm' }, shareTicket: 'tk2' });
  await g.settle();
  assert.equal(g.view().screen, 'home');
  assert.equal(g.view().vm.hasGroupContext, true);
});

test('a card arriving while the keyboard is open waits until the player is home (edge 22)', async (t) => {
  const g = await startUp(t);
  const id = g.server.addForeignChallenge({ puzzleId: 'd20261119' });
  await tapAndSettle(g, 'home:daily');
  g.tapId('key:open');
  g.show({ scene: 1044, query: { c: id } });
  await g.settle();
  assert.equal(g.view().screen, 'play');
  assert.equal(g.view().overlay.toast.text, '收到一张新的分享卡片');
  g.tapId('back');
  await g.settle();
  assert.equal(g.view().screen, 'challenge');
});

test('offline mid-play: the ladder stays, retry resends the SAME clientGuessId (AC 39, edge 2)', async (t) => {
  const g = await startUp(t);
  await tapAndSettle(g, 'home:daily');
  await tapAndSettle(g, 'warmup:0');
  g.server.offline = true;
  await tapAndSettle(g, 'chip:0');
  let vm = g.view().vm;
  assert.equal(vm.state, 'offline');
  assert.equal(vm.pendingError, '网络开小差了');
  assert.equal(vm.steps, 1, 'ladder unchanged');
  assert.equal(vm.latest.pending, true);
  assert.ok(g.has('play:retry'));
  g.server.offline = false;
  await tapAndSettle(g, 'play:retry');
  vm = g.view().vm;
  assert.equal(vm.state, 'result');
  assert.equal(vm.steps, 2);
  const calls = g.server.calls.filter((c) => c.name === 'guess');
  assert.equal(calls.length, 3);
  assert.equal(calls[1].data.clientGuessId, calls[2].data.clientGuessId);
  assert.equal(g.server.db.plays['d20261120'].guesses.length, 2);
});

test('double tap on a chip is debounced to one guess (edge 3)', async (t) => {
  const g = await startUp(t);
  await tapAndSettle(g, 'home:daily');
  await tapAndSettle(g, 'warmup:0');
  g.wait(350);
  g.tapId('chip:0');
  g.tapId('chip:0');
  g.tapId('chip:1');
  await g.settle();
  assert.equal(g.view().vm.steps, 2);
});

test('window closes mid-play: banner once, play continues unranked, no marker (AC 59, edge 10)', async (t) => {
  const g = await startUp(t);
  await tapAndSettle(g, 'home:daily');
  await tapAndSettle(g, 'warmup:0');
  assert.equal(g.view().vm.ranked, true);
  g.wait(12 * 3600e3 + 31 * 60e3);
  await tapAndSettle(g, 'chip:0');
  let vm = g.view().vm;
  assert.equal(vm.ranked, false);
  assert.equal(vm.banner, '今日一词已结束，本局不计入榜单');
  assert.equal(vm.adHint.visible, true, 'unranked: rewarded hints become available');
  await tapAndSettle(g, 'chip:0');
  assert.equal(g.view().vm.banner, '今日一词已结束，本局不计入榜单');
  assert.equal(count(g, 'puzzle_start'), 1);
  await solveByTyping(g);
  assert.equal(g.log.cloudWrites.length, 0);
  assert.equal(g.view().vm.ranked, false);
  assert.equal(g.view().vm.streak.show, false);
});

test('privacy refused: the game stays fully playable, the board shows the denied state with the player\'s own result, no re-prompt at launch (AC 84, 105)', async (t) => {
  const g = await startUp(t, { privacy: { refuse: true, markerRefuse: true } });
  await tapAndSettle(g, 'home:daily');
  await solveByTyping(g);
  assert.equal(g.view().vm.outcome, 'solved');
  assert.equal(g.view().vm.privacyNote, true);
  assert.equal(g.log.calls.filter((c) => c === 'requirePrivacyAuthorize').length, 0, 'finishing a ranked daily never shows the popup itself here');
  g.tapId('reveal:back');
  await tapAndSettle(g, 'home:friendBoard');
  let vm = g.view().vm;
  assert.equal(g.view().screen, 'board');
  assert.equal(vm.state, 'privacyDenied');
  assert.match(vm.myLine, /^你今日 \d+ 步猜中$/);
  assert.equal(g.log.calls.filter((c) => c === 'requirePrivacyAuthorize').length, 1);
  g.tapId('board:back');
  // still playable: practice
  await tapAndSettle(g, 'home:next');
  assert.equal(g.view().screen, 'play');
  await tapAndSettle(g, 'warmup:0');
  assert.equal(g.view().vm.steps, 1);
});

test('friend scope refused: not-authorized state with 去设置开启; returning from settings re-checks (AC 85)', async (t) => {
  const g = await startUp(t, { privacy: { state: 'agreed', scope: false, settingTo: true } });
  await tapAndSettle(g, 'home:friendBoard');
  assert.equal(g.view().vm.state, 'scopeDenied');
  assert.ok(g.has('board:openSetting'));
  await tapAndSettle(g, 'board:openSetting');
  assert.ok(['empty', 'ready'].includes(g.view().vm.state), g.view().vm.state);
  assert.equal(g.log.calls.filter((c) => c === 'authorize').length, 0, 'no automatic scope prompt once refused');
});

test('boards: ready state posts only server rows to the open data domain; no group context; group via card (AC 78-81)', async (t) => {
  const g = await startUp(t, { privacy: { state: 'agreed', scope: true } });
  await tapAndSettle(g, 'home:friendBoard');
  assert.equal(g.view().vm.state, 'empty'); // nobody ranked yet
  g.tapId('board:goPlay');
  await g.settle();
  assert.equal(g.view().screen, 'play');
  await solveByTyping(g);
  g.server.addBoardRow('20261120', 'a', 1, 14, 0, 1, 3600);
  g.server.addBoardRow('20261120', 'b', 2, 9, 0, 6, 4000);
  g.tapId('reveal:board');
  await g.settle();
  const vm = g.view().vm;
  assert.equal(vm.state, 'ready');
  assert.equal(vm.title, '好友 · 今日一词 第20期');
  assert.equal(vm.footer, '已有 3 人参与 · 成绩经服务器校验');
  assert.equal(vm.bannerVisible, false);
  const msg = g.log.odc[g.log.odc.length - 1];
  assert.equal(msg.type, 'render');
  assert.equal(msg.kind, 'friend');
  assert.equal(msg.rows.length, 3);
  assert.ok(msg.salt && msg.selfHash && msg.dateKey === '20261120');
  assert.ok(!/月亮|openid/.test(JSON.stringify(msg)));
  // back goes to the reveal; the group board without a group is the explainer
  g.tapId('board:back');
  assert.equal(g.view().screen, 'reveal');
  g.tapId('reveal:back');
  await tapAndSettle(g, 'home:groupBoard');
  assert.equal(g.view().vm.state, 'noGroup');
  assert.equal(g.view().vm.explainer, '在群聊里点开本游戏的分享卡片，就能看到本群战况');
  g.tapId('board:share');
  assert.equal(g.log.shares.pop().query, 's=m');
  g.tapId('board:back');
  // with a group card the group board opens with the ticket
  g.wait(4000);
  g.show({ scene: 1044, query: { s: 'm' }, shareTicket: 'tk9' });
  await g.settle();
  await tapAndSettle(g, 'home:groupBoard');
  assert.equal(g.view().vm.state, 'ready');
  assert.equal(g.view().vm.title, '本群 · 今日一词 第20期');
  assert.equal(g.log.odc[g.log.odc.length - 1].shareTicket, 'tk9');
});

test('banner only on board ready/empty and only when configured (AC 92)', async (t) => {
  const g = await startUp(t, { privacy: { state: 'agreed', scope: true } });
  await tapAndSettle(g, 'home:friendBoard');
  assert.equal(g.view().vm.state, 'empty');
  assert.equal(g.view().vm.bannerVisible, false);
  assert.ok(!g.log.ads.some((a) => a[0] === 'banner'));
  g.app.ads.applyRemote({ banner: { enabled: true, adUnitId: 'adunit-1' } });
  g.tapId('board:back');
  await tapAndSettle(g, 'home:friendBoard');
  assert.equal(g.view().vm.bannerVisible, true);
  assert.ok(g.log.ads.some((a) => a[0] === 'banner' && a[1].adUnitId === 'adunit-1'));
});

test('display modes apply at once, persist, and the first launch follows a large system font (AC 98)', async (t) => {
  const g = await startUp(t);
  g.tapId('home:settings');
  g.tapId('settings:largeText');
  g.tapId('settings:highContrast');
  assert.deepEqual(g.view().vm.display, { largeText: true, highContrast: true });
  assert.deepEqual(g.view().vm.settings, { largeText: true, highContrast: true, friendBoardEnabled: false });
  const ev = events(g).filter((e) => e.name === 'display_setting').pop();
  assert.deepEqual([ev.props.largeText, ev.props.highContrast, ev.props.source], [true, true, 'settings']);
  const g2 = await startUp(t, { storage: g.storage });
  assert.deepEqual(g2.view().vm.display, { largeText: true, highContrast: true });
  const g3 = await startUp(t, { fontSizeSetting: 22 });
  assert.equal(g3.view().vm.display.largeText, true);
  assert.equal(g3.view().vm.display.highContrast, false);
});

test('settings: sound toggle persists; privacy contract opens', async (t) => {
  const g = await startUp(t);
  g.tapId('home:sound');
  assert.equal(g.view().vm.muted, true);
  g.tapId('home:settings');
  g.tapId('settings:privacy');
  assert.ok(g.log.calls.includes('openPrivacyContract'));
});

test('coach marks: three, once, skippable, never again (AC 100)', async (t) => {
  const g = await startUp(t);
  await tapAndSettle(g, 'home:daily');
  assert.equal(g.view().vm.coach, 1);
  await tapAndSettle(g, 'warmup:0');
  assert.equal(g.view().vm.coach, 2);
  g.tapId('coach:next');
  assert.equal(g.view().vm.coach, 3);
  g.tapId('coach:next');
  assert.equal(g.view().vm.coach, 0);
  g.tapId('back');
  await tapAndSettle(g, 'home:archive');
  await tapAndSettle(g, 'archive:item:1');
  assert.equal(g.view().vm.coach, 0, 'never again');
  const g2 = await startUp(t);
  await tapAndSettle(g2, 'home:daily');
  g2.tapId('coach:skip');
  assert.equal(g2.view().vm.coach, 0);
  g2.tapId('back');
  await tapAndSettle(g2, 'home:daily');
  assert.equal(g2.view().vm.coach, 0, 'a skip is remembered');
});

test('analytics: every event carries sessionId and common props, no typed text, flushed on hide (AC 25, 113)', async (t) => {
  const g = await startUp(t);
  await tapAndSettle(g, 'home:daily');
  await tapAndSettle(g, 'warmup:0');
  g.tapId('row:0');
  await g.settle();
  g.tapId('key:open');
  g.type('乱码');
  g.confirm('乱码');
  g.tapId('key:close');
  await solveByTyping(g);
  g.hide();
  await g.settle();
  const evs = g.server.db.events;
  assert.ok(evs.length > 8);
  const sid = evs[0].sessionId;
  for (const e of evs) {
    assert.equal(e.sessionId, sid);
    assert.ok(e.clientTs > 0);
    for (const k of ['isNewUser', 'vocabVersion', 'configVersion', 'appVersion']) assert.ok(k in e.props, e.name + ' lacks ' + k);
    for (const k of ['text', 'input', 'query']) assert.ok(!(k in e.props));
  }
  const have = new Set(evs.map((e) => e.name));
  for (const n of ['session_start', 'puzzle_open', 'puzzle_start', 'guess', 'chips_select', 'keyboard_open', 'guess_rejected', 'solve', 'streak_shown']) {
    if (n === 'streak_shown') continue; // needs a streak of 2
    assert.ok(have.has(n), 'missing ' + n + ' in ' + [...have].join());
  }
  const first = evs.find((e) => e.name === 'guess');
  assert.equal(first.props.step, 1);
  assert.equal(first.props.src, 'warmup');
  assert.ok('msSinceLast' in first.props && 'band' in first.props);
  assert.equal(evs.find((e) => e.name === 'puzzle_open').props.source, 'home');
  assert.ok(!JSON.stringify(evs).includes('乱码'));
});

test('streak shown on home and reveal only from 2 consecutive days, no reward wording (AC 65-68)', async (t) => {
  const g = await startUp(t, { now: Date.UTC(2026, 10, 18, 4, 0, 0) });
  await tapAndSettle(g, 'home:daily');
  await solveByTyping(g);
  assert.equal(g.view().vm.streak.show, false);
  g.tapId('reveal:back');
  assert.equal(g.view().vm.streak.show, false);
  g.wait(24 * 3600e3);
  g.show({ scene: 1001, query: {} });
  await g.settle();
  assert.equal(g.view().vm.daily.state, 'available');
  assert.equal(g.view().vm.streak.current, 1, 'yesterday\'s streak stays alive');
  await tapAndSettle(g, 'home:daily');
  await solveByTyping(g);
  const rv = g.view().vm;
  assert.deepEqual(rv.streak, { show: true, label: '连续猜中 2 天' });
  assert.ok(!/奖励|免费|领取|快断了/.test(JSON.stringify(rv)));
  g.tapId('reveal:back');
  assert.equal(g.view().vm.streak.label, '连续猜中 2 天');
  assert.ok(count(g, 'streak_shown') >= 1);
});

test('stats lines on the reveal only with >= 30 finishers (AC 53)', async (t) => {
  const g = await startUp(t);
  g.server.seedStats('20261120', 40, 25);
  await tapAndSettle(g, 'home:daily');
  await solveByTyping(g);
  const rv = g.view().vm;
  assert.equal(rv.stats.show, true);
  assert.equal(rv.stats.line1, '今日 41 人猜中 · 中位数 25 步');
  assert.match(rv.stats.line2, /^你比 \d+% 的人少用了步数$/);
});

test('reveal list error offers 重试 while the answer and summary stay visible (AC 54)', async (t) => {
  const g = await startUp(t);
  await tapAndSettle(g, 'home:daily');
  g.tapId('warmup:0');
  await g.settle();
  const orig = g.server.call;
  g.server.call = (n, d) => (n === 'getReveal' ? { ok: false, code: 'NETWORK' } : orig(n, d));
  g.tapId('menu:open');
  g.tapId('menu:giveup');
  g.tapId('dialog:confirm');
  await g.settle();
  let vm = g.view().vm;
  assert.equal(vm.top.state, 'error');
  assert.equal(vm.top.errorText, '列表暂时打不开');
  assert.equal(vm.answer, '月亮');
  assert.match(vm.summary, /^未猜中/);
  g.server.call = orig;
  await tapAndSettle(g, 'reveal:retryList');
  assert.equal(g.view().vm.top.state, 'ready');
});

test('no spoilers while playing: the play view model and the stored state never hold the answer (AC 14, 17)', async (t) => {
  const g = await startUp(t);
  await tapAndSettle(g, 'home:daily');
  await tapAndSettle(g, 'warmup:0');
  await tapAndSettle(g, 'chip:0');
  const vm = g.view().vm;
  assert.ok(!('answer' in vm));
  assert.ok(!('top' in vm));
  assert.equal(g.app.ctl.state.p.answer, null);
  assert.ok(!JSON.stringify(g.storage).includes('answer":"'));
  assert.ok(!JSON.stringify(g.app.api.mock ? g.ctl.state.home : {}).includes('月亮'));
});

test('release build without js/dev: the game boots, shows the offline state and does not crash (AC 17)', async (t) => {
  const g = boot(t, { hideDev: true });
  await g.settle();
  assert.equal(g.app.api.mock, null);
  assert.equal(g.view().vm.daily.state, 'offline');
  g.tapId('sheet:close');
  assert.ok(g.has('home:retry'));
});

test('package hygiene: no answers, rank data, model or HTTP calls outside js/dev (AC 12, 17)', () => {
  const root = path.join(__dirname, '..');
  const bad = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      const rel = path.relative(root, p).split(path.sep).join('/');
      if (e.isDirectory()) {
        if (!/^(tests|tools|node_modules|js\/dev)$/.test(rel)) walk(p);
        continue;
      }
      if (/\.md$/.test(e.name)) continue; // docs are excluded from the package by packOptions.ignore
      if (!/\.(js|json)$/.test(e.name)) {
        bad.push(rel + ' is not .js/.json');
        continue;
      }
      const src = fs.readFileSync(p, 'utf8');
      if (/\.(onnx|npy|bin)\b|bge-large|Qwen3|wx\.request|fetch\(|XMLHttpRequest|DAILY_BANK|PRACTICE_BANK|answerRef|answer_bank/.test(src)) bad.push(rel + ' has a forbidden token');
      if (/js\/dev|mock-fixture/.test(src) && rel !== 'js/api.js' && !/^(js\/build-config\.js|core\/README\.md|core\/vocab\.js)$/.test(rel)) bad.push(rel + ' references js/dev');
    }
  })(root);
  assert.deepEqual(bad, []);
});
