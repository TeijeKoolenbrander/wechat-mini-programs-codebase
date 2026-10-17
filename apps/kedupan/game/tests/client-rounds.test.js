'use strict';
// Client tests for host rounds: create, guess, host waiting, reveal, subscribe (spec 2.2, 6.5-6.7, 7.2-7.4,
// AC 26-35, 62, 63). Driven through main.js against the mock server; other players use srv.callAs.
const test = require('node:test');
const assert = require('node:assert/strict');
const { getServerContent: getContent } = require('../core/content');
const { boot } = require('./harness');

const content = getContent();
const ADS = { adUnits: { rewarded: 'rw-1', interstitial: 'in-1' } };
const HOUR = 3600e3;

async function ready(t, opts) {
  const h = await boot(t, opts);
  if (h.has('sheet:close')) await h.tap('sheet:close');
  return h;
}

/** a round hosted by `openid` on the first spectrum with a preset clue; returns the id */
function hostedBy(h, openid, spectrumIdx, mode) {
  const sp = content.spectra[spectrumIdx || 0];
  const r = h.srv.callAs(openid, 'createRound', { spectrumId: sp.id });
  assert.equal(r.ok, true);
  if (mode === 'chat') return h.legacyChat(openid, r.roundId); // a round stored before D-2: setClue can no longer create one
  const clue = { roundId: r.roundId, clueMode: 'preset', clueItemId: sp.items[0].id };
  assert.equal(h.srv.callAs(openid, 'setClue', clue).ok, true);
  return r.roundId;
}

const enter = (roundId, extra) => Object.assign({ scene: 1007, query: { r: roundId } }, extra || {});

test('AC 27/28 (D-2): create offers 3 spectra, one free 换一组, then at most 3 rewarded 换一批; the clue step opens on 自己写; 6 presets from the chosen spectrum on tab 2; the share query is r=<id> only', async (t) => {
  const h = await ready(t, { build: ADS });
  await h.tap('home:host');
  let vm = h.view().vm;
  assert.equal(vm.step, 'pickSpectrum');
  assert.equal(vm.spectra.length, 3);
  assert.equal(new Set(vm.spectra.map((s) => s.id)).size, 3);
  assert.equal(vm.freeSwapLeft, 1);
  assert.equal(vm.adSwapLeft, 3);
  assert.ok(h.has('create:swapFree') && !h.has('create:swapAd'));
  const first = vm.spectra.map((s) => s.id);

  await h.tap('create:swapFree');
  vm = h.view().vm;
  assert.equal(vm.freeSwapLeft, 0);
  assert.notDeepEqual(vm.spectra.map((s) => s.id), first);
  assert.ok(!h.has('create:swapFree') && h.has('create:swapAd'), 'after the free swap only the rewarded one is offered');
  for (let i = 0; i < 3; i++) {
    await h.tap('create:swapAd');
    assert.equal(h.view().vm.adSwapLeft, 2 - i);
  }
  assert.ok(!h.has('create:swapAd'), 'at most 3 rewarded swaps');
  assert.equal(h.log.rewarded.length, 1, 'one rewarded instance (singleton)');
  assert.equal(h.log.rewarded[0].disableFallbackSharePage, true);

  const chosen = h.view().vm.spectra[1];
  await h.tap('create:spectrum:' + chosen.id);
  vm = h.view().vm;
  assert.equal(vm.step, 'pickClue');
  assert.equal(vm.tab, 'text', '自己写 is the default tab');
  assert.deepEqual(vm.tabs, ['text', 'preset']);
  assert.match(vm.roundId, /^[A-Z2-7]{8}$/);
  assert.ok(vm.targetBand.to - vm.targetBand.from <= 4 && vm.targetBand.from >= 0 && vm.targetBand.to <= 100);
  assert.equal(vm.canShare, false);
  assert.ok(!h.has('create:share'), '发到群里 is disabled while the input is empty');
  await h.tap('create:tab:preset');
  vm = h.view().vm;
  assert.equal(vm.tab, 'preset');
  assert.equal(vm.clueOptions.length, 6);
  assert.ok(vm.clueOptions.every((o) => o.itemId.slice(0, 4) === chosen.id), 'every preset belongs to the chosen spectrum');
  assert.equal(vm.canShare, false);
  assert.ok(!h.has('create:share'), '发到群里 is disabled until an item is chosen');
  await h.tap('create:clue:' + vm.clueOptions[2].itemId);
  assert.equal(h.view().vm.clueItemId, vm.clueOptions[2].itemId);
  assert.equal(h.view().vm.canShare, true);
  await h.tap('create:clueSwap');
  assert.equal(h.view().vm.clueItemId, null);
  assert.equal(h.view().vm.canShare, false);
  assert.ok(!h.has('create:clueSwap'), 'one free 换一批 of the clue presets');
  assert.equal(h.view().vm.clueOptions.length, 6);
  assert.ok(!h.ids().some((id) => /modeChat|modePreset/.test(id)), 'no 我在群里说 anywhere');
  await h.tap('create:clue:' + h.view().vm.clueOptions[0].itemId);

  const target = h.srv.db.rounds[vm.roundId].target;
  await h.tap('create:share');
  assert.equal(h.log.shares.length, 1);
  assert.equal(h.log.shares[0].query, 'r=' + vm.roundId, 'the query is the round id only');
  assert.match(h.log.shares[0].title, new RegExp('^我出了一道刻度题：' + chosen.left + '↔' + chosen.right + '，猜猜我心里的位置$'));
  assert.ok(!JSON.stringify(h.log.shares[0]).includes('"target"'));
  assert.equal(h.srv.db.rounds[vm.roundId].status, 'open');
  assert.equal(h.srv.db.rounds[vm.roundId].clueMode, 'preset');
  assert.equal(h.screen(), 'round');
  assert.equal(h.view().vm.status, 'hostWaiting');
  assert.ok(Number.isInteger(target));
  const shown = h.lastText();
  assert.ok(shown.includes('只有你能看到这个位置'));
  assert.ok(!h.has('round:primary'), 'the host never sees guess controls (OWN_ROUND)');
});

test('AC 35: a rate-limited host sees the friendly copy and is never trapped', async (t) => {
  const h = await ready(t);
  await h.tap('home:host');
  const sp = h.view().vm.spectra[0];
  for (let i = 0; i < 20; i++) h.srv.callAs(h.srv.ME, 'createRound', { spectrumId: sp.id }); // 20 per day
  await h.tap('create:spectrum:' + h.view().vm.spectra[0].id);
  assert.equal(h.view().vm.step, 'rateLimited');
  assert.match(h.lastText(), /今天出的题够多啦，明天再来/);
  assert.ok(h.has('create:back'), 'never trapped');
});

test('spec 6.5: createRound offline shows 出题需联网 with 重试 and creates nothing', async (t) => {
  const h = await ready(t);
  await h.tap('home:host');
  const sp = h.view().vm.spectra[0];
  h.srv.offline = true;
  await h.tap('create:spectrum:' + sp.id);
  assert.equal(h.view().vm.step, 'error');
  assert.match(h.lastText(), /出题需联网/);
  assert.equal(Object.keys(h.srv.db.rounds).length, 0);
  h.srv.offline = false;
  await h.tap('create:retry');
  assert.equal(h.view().vm.step, 'pickClue');
});

test('AC 30/31: a guesser sees the spectrum, the clue and the count, never the target; one guess; then 已提交 and waiting', async (t) => {
  const h = await ready(t);
  const id = hostedBy(h, 'bob');
  h.srv.callAs('cat', 'submitGuess', { roundId: id, pos: 20 });
  await h.show(enter(id));
  assert.equal(h.screen(), 'round');
  let vm = h.view().vm;
  assert.equal(vm.status, 'open');
  assert.equal(vm.isHost, false);
  assert.match(vm.clueText, /^提示：/);
  assert.equal(vm.guessCountText, '已有 1 人作答');
  assert.ok(!JSON.stringify(vm).includes('target'), 'no target anywhere in the guess view model');
  assert.equal(vm.reveal, null);
  assert.equal(vm.canConfirm, false);
  assert.equal(h.has('round:primary'), false);
  await h.place(66);
  assert.equal(h.view().vm.canConfirm, true);
  assert.equal(h.view().vm.needle, 66);
  await h.tap('round:primary');
  vm = h.view().vm;
  assert.equal(vm.status, 'submitted');
  assert.equal(vm.guessCountText, '已提交 · 已有 2 人作答 · 等待揭晓');
  assert.equal(vm.myGuess, 66);
  assert.equal(vm.reveal, null);
  assert.ok(!h.has('round:primary'));
  assert.equal(vm.subscribe.state, 'hidden', 'no template id: never offered');
  assert.equal(h.srv.db.guesses[id + '_' + h.srv.ME].pos, 66);
  assert.ok(h.has('round:home'));
});

test('AC 30: a chat-clue round shows "提示在群聊里，看看 TA 怎么说"; a missing or malformed round shows 找不到这道题 with a way home', async (t) => {
  const h = await ready(t);
  const id = hostedBy(h, 'bob', 3, 'chat');
  await h.show(enter(id));
  assert.equal(h.view().vm.clueText, '提示在群聊里，看看 TA 怎么说');
  await h.tap('round:home');
  assert.equal(h.screen(), 'home');
  await h.show(enter('ABCDEFGH'));
  assert.equal(h.view().vm.status, 'notFound');
  assert.match(h.lastText(), /找不到这道题/);
  await h.tap('round:home');
  assert.equal(h.screen(), 'home');
});

test('spec 6.6: a round entry offline shows 题目需联网展开 and 重试 works', async (t) => {
  const h = await ready(t);
  const id = hostedBy(h, 'bob');
  h.srv.offline = true;
  await h.show(enter(id));
  assert.equal(h.view().vm.status, 'offline');
  assert.match(h.lastText(), /题目需联网展开/);
  h.srv.offline = false;
  await h.tap('round:retry');
  assert.equal(h.view().vm.status, 'open');
});

test('AC 32/33: the host reveals at >= 2 guesses; the reveal shows target, guesses, 本题默契值, nobody else\'s names; the host row is 出题人', async (t) => {
  const h = await ready(t);
  await h.tap('home:host');
  await h.tap('create:spectrum:' + h.view().vm.spectra[0].id);
  await h.pickPreset();
  const id = h.st.round.roundId;
  const target = h.srv.db.rounds[id].target;
  assert.equal(h.view().vm.canReveal, false);
  assert.equal(h.has('round:reveal'), false);
  assert.match(h.view().vm.revealHint, /至少 2 人作答后可揭晓/);
  h.srv.callAs('bob', 'submitGuess', { roundId: id, pos: Math.max(0, target - 3) });
  await h.show();
  h.ctl.K.handlers['round:retry']();
  await h.settle();
  assert.equal(h.view().vm.canReveal, false, 'one guess is not enough');
  h.srv.callAs('cat', 'submitGuess', { roundId: id, pos: Math.min(100, target + 20) });
  h.ctl.K.handlers['round:retry']();
  await h.settle();
  const vm0 = h.view().vm;
  assert.equal(vm0.canReveal, true);
  assert.equal(vm0.guessCountText, '已有 2 人作答');
  assert.deepEqual(vm0.hostBand, { from: Math.max(0, target - 2), to: Math.min(100, target + 2) });

  await h.tap('round:reveal');
  const vm = h.view().vm;
  assert.equal(vm.status, 'revealed');
  assert.equal(vm.reveal.target, target);
  assert.match(vm.reveal.mqText, /^本题默契值 \d+$/);
  const kinds = vm.reveal.markers.map((m) => m.kind);
  assert.equal(kinds.filter((k) => k === 'target').length, 1);
  assert.equal(kinds.filter((k) => k === 'member').length, 2);
  assert.equal(kinds.includes('you'), false, 'the host has no guess');
  const msg = h.log.posted[h.log.posted.length - 1];
  assert.equal(msg.view, 'round');
  assert.equal(msg.rows.length, 3, 'two guesses and the host row');
  assert.equal(msg.rows.filter((r) => r[4] === 1).length, 1, 'the host row is flagged (出题人), without a score');
  assert.deepEqual(msg.rows.find((r) => r[4] === 1).slice(1, 4), [null, null, 0]);
  assert.ok(msg.closestH && msg.salt && msg.selfHash);
  assert.ok(!JSON.stringify(msg).match(/openid|openGId/i));

  await h.tap('round:shareReveal');
  const sh = h.log.shares[h.log.shares.length - 1];
  assert.equal(sh.query, 'r=' + id);
  assert.match(sh.title, /^刻度题揭晓：本题默契值 \d+$/);
  assert.equal(h.srv.db.rounds[id].revealBy, 'host');
});

test('AC 32: the 8th guess reveals automatically; a latecomer can 先猜再看 with a late (dashed) marker, or view the answer directly', async (t) => {
  const h = await ready(t);
  const id = hostedBy(h, 'bob');
  for (let i = 0; i < 8; i++) h.srv.callAs('g' + i, 'submitGuess', { roundId: id, pos: 10 + i * 10 });
  await h.show(enter(id));
  let vm = h.view().vm;
  assert.equal(vm.status, 'revealedUnplayed');
  assert.ok(h.has('round:late') && h.has('round:view'));
  assert.match(h.lastText(), /已揭晓/);
  await h.tap('round:late');
  vm = h.view().vm;
  assert.equal(vm.status, 'open');
  assert.equal(vm.late, true);
  await h.place(50);
  await h.tap('round:primary');
  vm = h.view().vm;
  assert.equal(vm.status, 'revealed');
  assert.equal(vm.late, true);
  assert.equal(vm.myGuess, 50);
  assert.equal(vm.reveal.markers.filter((m) => m.kind === 'you').length, 1);
  assert.equal(vm.reveal.markers.filter((m) => m.kind === 'member').length, 8);
  const rv = h.srv.callAs('g0', 'getRound', { roundId: id }).reveal;
  assert.equal(rv.rows.filter((r) => r[3] === 1).length, 1, 'the late guess is stored late');
  assert.equal(rv.mq, h.srv.db.rounds[id].mq, 'a late guess never changes 本题默契值');

  const h2 = await ready(t);
  const id2 = hostedBy(h2, 'bob');
  for (let i = 0; i < 8; i++) h2.srv.callAs('g' + i, 'submitGuess', { roundId: id2, pos: 10 + i * 10 });
  await h2.show(enter(id2));
  await h2.tap('round:view');
  assert.equal(h2.view().vm.status, 'revealed');
  assert.equal(h2.view().vm.myGuess, null);
  assert.equal(h2.view().vm.reveal.markers.some((m) => m.kind === 'you'), false);
  assert.ok(h2.log.posted.length >= 1);
});

test('spec 6.6/6.7: a round older than 7 days that was revealed shows the reveal only (no 先猜再看); 24 h with no guesses is 无人作答 for the host and 已结束 for others', async (t) => {
  const h = await ready(t);
  const id = hostedBy(h, 'bob');
  h.srv.callAs('g1', 'submitGuess', { roundId: id, pos: 30 });
  h.srv.callAs('g2', 'submitGuess', { roundId: id, pos: 60 });
  h.srv.callAs('bob', 'revealRound', { roundId: id });
  h.advance(8 * 24 * HOUR);
  await h.show(enter(id));
  assert.equal(h.view().vm.status, 'revealed');
  assert.ok(!h.has('round:late'));

  const none = hostedBy(h, 'bob', 5);
  h.advance(25 * HOUR);
  await h.show(enter(none));
  assert.equal(h.view().vm.status, 'expired');
  assert.match(h.lastText(), /这道题已经结束了/);
  assert.ok(h.has('round:daily'));

  await h.tap('home:host').catch(() => {});
  const mine = h.srv.callAs(h.srv.ME, 'createRound', { spectrumId: content.spectra[7].id });
  h.legacyChat(h.srv.ME, mine.roundId);
  h.advance(25 * HOUR);
  await h.show(enter(mine.roundId));
  assert.equal(h.view().vm.status, 'noGuesses');
  assert.match(h.lastText(), /没有人作答，这道题结束了/);
  assert.ok(h.has('round:hostAgain'));
  await h.tap('round:hostAgain');
  assert.equal(h.screen(), 'create');
});

test('AC 62: without a template id the offer never renders and requestSubscribeMessage is never called', async (t) => {
  const h = await ready(t);
  await h.tap('home:host');
  await h.tap('create:spectrum:' + h.view().vm.spectra[0].id);
  await h.pickPreset();
  assert.equal(h.view().vm.status, 'hostWaiting');
  assert.equal(h.view().vm.subscribe.state, 'hidden');
  assert.ok(!h.has('round:subscribe'));
  const id = hostedBy(h, 'bob');
  await h.show(enter(id));
  await h.place(40);
  await h.tap('round:primary');
  assert.equal(h.view().vm.subscribe.state, 'hidden');
  assert.equal(h.log.subscribe.length, 0);
  assert.equal(h.app.analytics.queue.filter((e) => e.name === 'subscribe_offer').length, 0);
});

test('AC 63: with a template id the offer shows on the host view and after a guess, is requested only from the tap, stores one grant, and ban hides it on this device', async (t) => {
  const h = await ready(t);
  h.srv.appConfig = { subscribe: { tmplId: 'TPL-1' } };
  await h.ctl.K.loadDaily();
  // host view
  await h.tap('home:host');
  await h.tap('create:spectrum:' + h.view().vm.spectra[0].id);
  await h.pickPreset();
  const hid = h.st.round.roundId;
  assert.equal(h.view().vm.subscribe.state, 'offer');
  assert.equal(h.log.subscribe.length, 0, 'nothing requested before the tap');
  await h.tap('round:subscribe');
  assert.deepEqual(h.log.subscribe, [['TPL-1']]);
  assert.equal(h.view().vm.subscribe.state, 'granted');
  assert.equal(h.srv.db.grants[hid + '_' + h.srv.ME].used, false);
  assert.equal(Object.keys(h.srv.db.grants).length, 1);

  // guesser view: only after the guess
  const gid = hostedBy(h, 'bob');
  await h.show(enter(gid));
  assert.equal(h.view().vm.subscribe.state, 'hidden', 'not offered before guessing');
  await h.place(40);
  await h.tap('round:primary');
  assert.equal(h.view().vm.subscribe.state, 'offer');
  assert.equal(h.app.analytics.queue.filter((e) => e.name === 'subscribe_offer' && e.props.where === 'guess').length, 1);
  await h.tap('round:subscribe');
  assert.equal(h.srv.db.grants[gid + '_' + h.srv.ME].roundId, gid);
  // at the reveal exactly one message per grant
  h.srv.callAs('cat', 'submitGuess', { roundId: gid, pos: 55 });
  h.srv.callAs('bob', 'revealRound', { roundId: gid });
  assert.equal(h.srv.sent.filter((m) => m.roundId === gid).length, 1);
  assert.deepEqual(Object.keys(h.srv.sent[0]).sort(), ['left', 'mq', 'right', 'roundId', 'to'], 'the message carries the spectrum and 本题默契值 only, no names');

  // reject: hidden for that round; ban: never again on this device
  const r2 = hostedBy(h, 'bob', 2);
  const r3 = hostedBy(h, 'bob', 4);
  h.wx.requestSubscribeMessage = (o) => o.success({ [o.tmplIds[0]]: 'reject' });
  await h.show(enter(r2));
  await h.place(10);
  await h.tap('round:primary');
  await h.tap('round:subscribe');
  assert.equal(h.view().vm.subscribe.state, 'declined');
  assert.ok(!h.has('round:subscribe'));
  h.wx.requestSubscribeMessage = (o) => o.fail({ errCode: 20004, errMsg: 'ban' });
  await h.show(enter(r3));
  await h.place(10);
  await h.tap('round:primary');
  await h.tap('round:subscribe');
  const r4 = hostedBy(h, 'bob', 6);
  await h.show(enter(r4));
  await h.place(10);
  await h.tap('round:primary');
  assert.equal(h.view().vm.subscribe.state, 'hidden', 'banned: never offered again');
  assert.equal(JSON.parse(h.storage.kd_state_v1).subscribe.banned, true);
});

test('spec 6.7 / AC 29: no round screen takes typed text or shows user-authored text', async (t) => {
  const h = await ready(t);
  const id = hostedBy(h, 'bob');
  await h.show(enter(id));
  const text = h.lastText();
  for (const line of text.split('\n')) assert.ok(!/请输入|输入框|键盘/.test(line));
  assert.equal(h.kb.shown(), 0, 'the round screen never opens the keyboard (only the clue input does)');
  assert.ok(!h.ids().some((id) => /input/.test(id)));
});
