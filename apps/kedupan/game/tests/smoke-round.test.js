/**
 * Host rounds (group-clue mode) played through the real screens: the host creates, clues and shares; guessers
 * enter from the card (with a group ticket), place and wait; the host reveals; a latecomer plays 先猜再看.
 */

const test = require('node:test');
const assert = require('node:assert');
const { boot, initTime } = require('./harness');
const { createMockServer } = require('../js/mock-server');
const { getContent } = require('../core/content');

const CHEAP = getContent(1).spectra.find((s) => s.left === '便宜');

const vm = (g) => g.app.ctl.view().vm;
const screen = (g) => g.app.ctl.view().screen;

function makeServer(t) {
  initTime(t);
  const srv = createMockServer({ population: 0, launchDateKey: '20261101' });
  srv.setConfig({ subscribe: { tmplId: 'TMPL_REVEAL' } });
  return srv;
}

async function hostCreatesRound(t, srv, opts) {
  const g = boot(t, Object.assign({ mockServer: srv, population: 0 }, opts || {}));
  await g.settle();
  await g.ready();
  return g;
}

test('host: pick a spectrum, a hidden target, a preset clue, share the card with the id only, land on the waiting view', async (t) => {
  const srv = makeServer(t);
  const g = await hostCreatesRound(t, srv);
  g.tapId('home:host');
  assert.strictEqual(screen(g), 'create');
  let v = vm(g);
  assert.strictEqual(v.step, 'pickSpectrum');
  assert.strictEqual(v.spectra.length, 3);
  assert.strictEqual(v.freeSwapLeft, 1);
  assert.strictEqual(v.adSwapLeft, 3);
  // one free 换一组, then only the rewarded 换一批 is offered
  const first = v.spectra.map((s) => s.id);
  g.tapId('create:swapFree');
  v = vm(g);
  assert.strictEqual(v.freeSwapLeft, 0);
  assert.strictEqual(v.spectra.length, 3);
  v.spectra.forEach((s) => assert.ok(!first.includes(s.id), 'a swap deals new spectra'));
  assert.ok(!g.has('create:swapFree'), 'the free swap is gone');
  assert.ok(g.has('create:swapAd'));
  assert.strictEqual(v.targetBand, null, 'no target before a spectrum is chosen');
  // choose one: the server draws the target, the host sees only a band
  const pick = v.spectra[0];
  g.tapId('create:spectrum:' + pick.id);
  await g.settle();
  v = vm(g);
  assert.strictEqual(v.step, 'pickClue');
  assert.ok(v.roundId && /^[0-9A-Z]{8}$/.test(v.roundId));
  const rid0 = v.roundId;
  assert.strictEqual(v.targetBand.to - v.targetBand.from, 4, 'band of +-2');
  assert.ok(v.targetBand.from >= 3 && v.targetBand.to <= 97);
  assert.strictEqual(v.secretNote, '只有你能看到这个位置');
  assert.strictEqual(v.clueMode, 'preset');
  assert.strictEqual(v.clueOptions.length, 6);
  v.clueOptions.forEach((o) => assert.ok(o.itemId.startsWith(pick.id)));
  assert.strictEqual(v.canShare, false, 'preset mode: 发到群里 stays disabled until an item is chosen');
  assert.ok(!g.has('create:share'));
  g.tapId('create:clueSwap');
  v = vm(g);
  assert.strictEqual(v.clueOptions.length, 6);
  assert.ok(!g.has('create:clueSwap'), 'one free clue swap');
  const clue = v.clueOptions[2];
  g.tapId('create:clue:' + clue.itemId);
  assert.strictEqual(vm(g).canShare, true);
  // chat mode needs no item
  g.tapId('create:mode:chat');
  assert.strictEqual(vm(g).canShare, true);
  assert.match(vm(g).chatHint, /别直接说位置或数字/);
  g.tapId('create:mode:preset');
  g.tapId('create:share');
  await g.settle();
  assert.strictEqual(g.log.shares.length, 1);
  const shared = g.log.shares[0];
  assert.strictEqual(shared.query, 'r=' + rid0, 'the query is the id only (AC 28)');
  assert.ok(shared.title.startsWith('我出了一道刻度题：' + pick.left + '↔' + pick.right));
  const target = srv.db.rounds[rid0].target;
  assert.ok(!/target/.test(JSON.stringify(shared)));
  assert.strictEqual(srv.db.rounds[rid0].clueItemId, clue.itemId);
  assert.strictEqual(srv.db.rounds[rid0].status, 'open');
  // host waiting view
  assert.strictEqual(screen(g), 'round');
  v = vm(g);
  assert.strictEqual(v.status, 'hostWaiting');
  assert.strictEqual(v.isHost, true);
  assert.strictEqual(v.canReveal, false);
  assert.strictEqual(v.revealHint, '至少 2 人作答后可揭晓');
  assert.strictEqual(v.clueText, '提示：' + clue.text);
  assert.ok(!g.has('round:primary') || vm(g).canReveal === false);
  assert.strictEqual(v.subscribe.state, 'offer');
  assert.deepStrictEqual(
    g.app.analytics.queue.filter((e) => /^round_/.test(e.name) || e.name === 'share_tap').map((e) => e.name),
    ['round_create', 'round_clue', 'share_tap', 'round_view']
  );
  // two guessers answer; the host refreshes and may reveal
  const roundId = rid0;
  srv.call('submitGuess', { roundId, pos: target + 3 }, { openid: 'u1' });
  assert.strictEqual(vm(g).canReveal, false);
  srv.call('submitGuess', { roundId, pos: Math.max(0, target - 20) }, { openid: 'u2' });
  g.tapId('round:refresh');
  await g.settle();
  v = vm(g);
  assert.strictEqual(v.guessCountText, '已有 2 人作答');
  assert.strictEqual(v.canReveal, true);
  // subscribe: one tap, one request, one grant
  g.tapId('round:subscribe');
  await g.settle();
  assert.strictEqual(g.log.subscribe.length, 1);
  assert.deepStrictEqual(g.log.subscribe[0], ['TMPL_REVEAL']);
  assert.strictEqual(vm(g).subscribe.state, 'granted');
  assert.strictEqual(Object.keys(srv.db.subs).length, 1);
  g.tapId('round:primary'); // 揭晓
  await g.settle();
  v = vm(g);
  assert.strictEqual(v.status, 'revealed');
  assert.strictEqual(v.reveal.target, target);
  assert.match(v.reveal.mqText, /^本题默契值 \d+$/);
  assert.ok(v.reveal.markers.some((m) => m.kind === 'target' && m.pos === target));
  assert.strictEqual(v.reveal.markers.filter((m) => m.kind === 'member').length + v.reveal.markers.filter((m) => m.kind === 'you').length, 2);
  assert.strictEqual(srv.db.sentMessages.length, 1, 'exactly one subscribe message per grant');
  assert.ok(!JSON.stringify(srv.db.sentMessages).includes('u1'));
  // the reveal's rows go to the open data domain as hashes, anonymous until the friend data is allowed
  const msg = g.log.odc[g.log.odc.length - 1];
  assert.strictEqual(msg.view, 'round');
  assert.strictEqual(msg.anon, false, 'the host tapped 揭晓: the in-game tap may ask for privacy and the friend scope');
  assert.ok(g.log.calls.includes('requirePrivacyAuthorize'));
  assert.ok(msg.rows.every((r) => r[0].length === 12));
  assert.strictEqual(msg.rows.filter((r) => r[4] === 1).length, 1, 'the host row is flagged');
  // the reveal share card is a reveal, not a round
  g.tapId('round:share');
  await g.settle();
  assert.strictEqual(g.log.shares[1].query, 'r=' + roundId);
  assert.match(g.log.shares[1].title, /^刻度题揭晓：本题默契值 \d+$/);
  assert.ok(g.has('round:host'), '我也出一道');
  // 20 rounds a day, then the polite message
  assert.strictEqual(g.app.api.mock.db.rate['createRound_mock-openid-me_20261120'], 1);
});

test('guesser: card entry with a group ticket, place, submit, wait; never sees the target; reveal arrives on refresh', async (t) => {
  const srv = makeServer(t);
  const created = srv.call('createRound', { spectrumId: CHEAP.id }, { openid: 'host' });
  srv.call('setClue', { roundId: created.roundId, clueMode: 'preset', clueItemId: CHEAP.items[1].id }, { openid: 'host' });
  const rid = created.roundId;
  srv.call('submitGuess', { roundId: rid, pos: 40 }, { openid: 'u1' });
  const g = boot(t, { mockServer: srv, openid: 'guest', population: 0, enter: { scene: 1044, query: { r: rid }, shareTicket: 'TICKET', chatType: 3 } });
  await g.settle();
  assert.ok(g.log.calls.includes('getGroupEnterInfo'), 'a ticket triggers the group join');
  assert.strictEqual(g.app.ctl.group.status, 'ok');
  assert.strictEqual(screen(g), 'round');
  let v = vm(g);
  assert.strictEqual(v.status, 'open');
  assert.strictEqual(v.isHost, false);
  assert.strictEqual(v.left, '便宜');
  assert.strictEqual(v.right, '贵');
  assert.strictEqual(v.clueText, '提示：' + CHEAP.items[1].text);
  assert.strictEqual(v.guessCountText, '已有 1 人作答');
  assert.strictEqual(v.reveal, null);
  const raw = srv.call('getRound', { roundId: rid }, { openid: 'guest' });
  assert.strictEqual(raw.target, undefined, 'a guesser never gets the target (AC 30)');
  assert.strictEqual(raw.rows, undefined);
  // no needle until the first touch, confirm disabled
  assert.strictEqual(v.needle, null);
  assert.strictEqual(v.canConfirm, false);
  assert.ok(!g.has('round:primary'));
  g.ruler(62);
  assert.strictEqual(vm(g).needle, 62);
  g.tapId('round:primary');
  await g.settle();
  v = vm(g);
  assert.strictEqual(v.status, 'submitted');
  assert.strictEqual(v.guessCountText, '已提交 · 已有 2 人作答 · 等待揭晓');
  assert.strictEqual(v.revealHint, '主持人揭晓，或第 8 人作答、24 小时后自动揭晓');
  assert.strictEqual(v.subscribe.state, 'offer');
  assert.strictEqual(v.myGuess, 62);
  assert.strictEqual(srv.db.guesses[rid + '_guest'].groupRef !== null, true, 'the group ref travels with the guess');
  // the host reveals; the guesser's app learns on its next show
  srv.call('revealRound', { roundId: rid }, { openid: 'host' });
  g.show({ scene: 1001, query: {} });
  await g.settle();
  v = vm(g);
  assert.strictEqual(v.status, 'revealed');
  assert.strictEqual(v.reveal.target, srv.db.rounds[rid].target);
  assert.ok(v.reveal.markers.some((m) => m.kind === 'you' && m.pos === 62));
  assert.strictEqual(v.late, false);
  assert.strictEqual(g.app.analytics.queue.filter((e) => e.name === 'round_guess').length, 1);
  // card_open fires once with the right kind; the group id never reaches an event
  const cardOpen = g.app.analytics.queue.filter((e) => e.name === 'card_open');
  assert.strictEqual(cardOpen.length, 1);
  assert.strictEqual(cardOpen[0].props.cardKind, 'round');
  assert.strictEqual(cardOpen[0].props.hasShareTicket, true);
  assert.ok(!JSON.stringify(g.app.analytics.queue).includes('TICKET'));
});

test('latecomer: 先猜再看 places a late guess that is marked and not counted; 直接看答案 shows the reveal', async (t) => {
  const srv = makeServer(t);
  const created = srv.call('createRound', { spectrumId: CHEAP.id }, { openid: 'host' });
  const rid = created.roundId;
  srv.call('setClue', { roundId: rid, clueMode: 'chat' }, { openid: 'host' });
  srv.call('submitGuess', { roundId: rid, pos: 40 }, { openid: 'u1' });
  srv.call('submitGuess', { roundId: rid, pos: 50 }, { openid: 'u2' });
  srv.call('revealRound', { roundId: rid }, { openid: 'host' });
  const mqBefore = srv.db.rounds[rid].mq;
  const g = boot(t, { mockServer: srv, openid: 'late1', population: 0, enter: { scene: 1044, query: { r: rid } } });
  await g.settle();
  let v = vm(g);
  assert.strictEqual(v.status, 'revealedUnplayed');
  assert.strictEqual(v.clueText, '提示在群聊里，看看 TA 怎么说');
  assert.strictEqual(v.canLate, true);
  assert.strictEqual(v.reveal, null, 'nothing is shown before the choice');
  g.tapId('round:late');
  assert.ok(g.has('ruler'));
  g.ruler(77);
  g.tapId('round:primary');
  await g.settle();
  v = vm(g);
  assert.strictEqual(v.status, 'revealed');
  assert.strictEqual(v.late, true);
  assert.ok(v.reveal.markers.some((m) => m.kind === 'you' && m.pos === 77));
  assert.strictEqual(srv.db.rounds[rid].mq, mqBefore, 'a late guess does not change 本题默契值');
  assert.strictEqual(srv.db.guesses[rid + '_late1'].late, true);
  // a second latecomer who just wants to see
  const g2 = boot(t, { mockServer: srv, openid: 'late2', population: 0, enter: { scene: 1044, query: { r: rid } } });
  await g2.settle();
  assert.strictEqual(vm(g2).status, 'revealedUnplayed');
  g2.tapId('round:view');
  await g2.settle();
  assert.strictEqual(vm(g2).status, 'revealed');
  assert.strictEqual(vm(g2).reveal.target, srv.db.rounds[rid].target);
  assert.strictEqual(vm(g2).late, false);
});

test('round entry states: not found, offline with retry, own round goes to the host view, no guesses, old reveal has no 先猜再看', async (t) => {
  const srv = makeServer(t);
  const g = boot(t, { mockServer: srv, openid: 'x1', population: 0, enter: { scene: 1044, query: { r: 'ZZZZZZZZ' } } });
  await g.settle();
  assert.strictEqual(vm(g).status, 'notFound');
  assert.strictEqual(vm(g).errorText, '找不到这道题');
  assert.ok(g.has('round:home'));
  g.tapId('round:home');
  assert.strictEqual(screen(g), 'home');
  // offline
  const created = srv.call('createRound', { spectrumId: 's001' }, { openid: 'hostA' });
  srv.call('setClue', { roundId: created.roundId, clueMode: 'chat' }, { openid: 'hostA' });
  srv.offline = true;
  g.show({ scene: 1044, query: { r: created.roundId } });
  await g.settle();
  assert.strictEqual(vm(g).status, 'offline');
  assert.strictEqual(vm(g).errorText, '题目需联网展开');
  srv.offline = false;
  g.tapId('round:retry');
  await g.settle();
  assert.strictEqual(vm(g).status, 'open');
  // the host opening their own card gets the host view
  const own = boot(t, { mockServer: srv, openid: 'hostA', population: 0, enter: { scene: 1044, query: { r: created.roundId } } });
  await own.settle();
  assert.strictEqual(vm(own).status, 'hostWaiting');
  assert.strictEqual(vm(own).isHost, true);
  // no guesses for 24 h
  own.wait(25 * 3600e3);
  own.show({ scene: 1001, query: {} });
  await own.settle();
  assert.strictEqual(vm(own).status, 'noGuesses');
  assert.strictEqual(vm(own).guessCountText, '没有人作答，这道题结束了');
  // a revealed round older than 7 days offers no late guess
  const c2 = srv.call('createRound', { spectrumId: 's002' }, { openid: 'hostB' });
  srv.call('setClue', { roundId: c2.roundId, clueMode: 'chat' }, { openid: 'hostB' });
  srv.call('submitGuess', { roundId: c2.roundId, pos: 10 }, { openid: 'u1' });
  srv.call('submitGuess', { roundId: c2.roundId, pos: 20 }, { openid: 'u2' });
  srv.call('revealRound', { roundId: c2.roundId }, { openid: 'hostB' });
  own.wait(8 * 86400e3);
  own.show({ scene: 1044, query: { r: c2.roundId } });
  await own.settle();
  assert.strictEqual(vm(own).status, 'revealedUnplayed');
  assert.strictEqual(vm(own).canLate, false);
});

test('rate limit: the 21st round of the day shows the polite message and creates nothing', async (t) => {
  const srv = makeServer(t);
  for (let i = 0; i < 20; i++) srv.call('createRound', { spectrumId: 's001' }, { openid: 'mock-openid-me' });
  const g = await hostCreatesRound(t, srv);
  g.tapId('home:host');
  const sp = vm(g).spectra[0];
  g.tapId('create:spectrum:' + sp.id);
  await g.settle();
  assert.strictEqual(vm(g).step, 'rateLimited');
  assert.strictEqual(vm(g).rateLimitedText, '今天出的题够多啦，明天再来');
  assert.strictEqual(Object.keys(srv.db.rounds).length, 20);
});

test('create round offline: 出题需联网 with retry, nothing created', async (t) => {
  const srv = makeServer(t);
  const g = await hostCreatesRound(t, srv);
  g.tapId('home:host');
  srv.offline = true;
  g.tapId('create:spectrum:' + vm(g).spectra[0].id);
  await g.settle();
  assert.strictEqual(vm(g).step, 'error');
  assert.strictEqual(vm(g).errorText, '出题需联网');
  assert.strictEqual(Object.keys(srv.db.rounds).length, 0);
  srv.offline = false;
  g.tapId('create:retry');
  await g.settle();
  assert.strictEqual(vm(g).step, 'pickClue');
});

test('host rewarded 换一批: ad -> new spectra; at most 3 per round; early close grants nothing', async (t) => {
  const srv = makeServer(t);
  const g = await hostCreatesRound(t, srv);
  g.tapId('home:host');
  g.tapId('create:swapFree');
  const seen = new Set(vm(g).spectra.map((s) => s.id));
  // early close first
  g.tapId('create:swapAd');
  assert.ok(g.app.ads.overlay, 'stub ad is up');
  g.tapId('adstub:skip');
  await g.settle();
  assert.strictEqual(vm(g).adSwapLeft, 3, 'closing early grants nothing');
  for (let i = 0; i < 3; i++) {
    g.tapId('create:swapAd');
    g.wait(3100);
    g.tapId('adstub:complete');
    await g.settle();
    assert.strictEqual(vm(g).adSwapLeft, 2 - i);
    vm(g).spectra.forEach((s) => assert.ok(!seen.has(s.id)));
    vm(g).spectra.forEach((s) => seen.add(s.id));
  }
  assert.ok(!g.has('create:swapAd'), 'no 4th swap');
  assert.strictEqual(vm(g).swapHint, '就从这几条里选吧');
  assert.ok(g.app.analytics.queue.filter((e) => e.name === 'ad_reward').length === 3);
  assert.ok(g.app.analytics.queue.filter((e) => e.name === 'ad_request').every((e) => e.props.placement === 'swap'));
});
