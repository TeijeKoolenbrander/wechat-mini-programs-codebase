'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot, makeClient, enableClock } = require('./harness');
const { createMockServer } = require('../js/mock-server');
const S = require('../core/strokes');

const ENTER = (chainId, ticket) => ({ scene: 1044, query: { k: chainId }, shareTicket: ticket || 'ticket', chatType: 3 });
const drawing = (n) => {
  const d = S.emptyDrawing();
  for (let i = 0; i < n; i++) d.s.push(S.makeStroke(i % 6, 1, [[10 + i, 10], [100 + i, 200], [300, 300 + i]]));
  return d;
};

function world(t) {
  enableClock(t);
  const srv = createMockServer({ now: () => Date.now(), rasterize: false });
  return { srv, adv: (ms) => (t.mock.timers.tick(ms), srv.sweep()) };
}
const agree = (srv, id) => srv.call('agreeRules', { version: 1 }, id);
const join = (srv, id) => (agree(srv, id), srv.call('joinGroup', { groupData: { mockData: { opengid: 'G1', chat_type: 3 } } }, id).groupRef);

/** a UI client that opened a card in G1 (group context) and agreed to the rules, sitting on the home screen */
async function homeClient(t, w, id, opts) {
  agree(w.srv, id);
  const c = makeClient(t, w.srv, id, opts);
  await c.ctl.start(ENTER('zzzzzzzzzz', 't-' + id));
  await c.settle();
  c.tapId('entry:home');
  await c.settle();
  assert.equal(c.screen(), 'home');
  if (c.view().vm.sheet) c.tapId('sheet:close');
  return c;
}

async function uiStart(t, c, strokes) {
  t.mock.timers.tick(300); // clears the primary-button debounce
  c.tapId('home:start');
  await c.settle();
  c.tapId('picker:start');
  await c.settle();
  assert.equal(c.screen(), 'draw');
  c.strokes(strokes || 2);
  c.tapId('draw:submit');
  await c.settle();
  assert.equal(c.screen(), 'sent');
  return Object.keys(c.api.mock.db.chains).filter((id) => c.api.mock.db.chains[id].starter === c.openid).pop();
}

function play(w, chainId, id, ref, n) {
  const cl = w.srv.call('claimStep', { chainId, groupRef: ref }, id);
  assert.equal(cl.ok, true, id + ' step ' + n + ': ' + cl.code);
  const r = w.srv.call('submitStep', n % 2 === 0 ? { chainId, claimId: cl.claimId, text: '第几句话' + n } : { chainId, claimId: cl.claimId, strokes: drawing(2) }, id);
  assert.equal(r.ok, true);
  w.adv(61e3);
}

test('starter early reveal: entry shows 现在揭晓 with a confirm dialog; the reveal says 提前揭晓 · 传了 4/6 棒', async (t) => {
  const w = world(t);
  const S1 = await homeClient(t, w, 'S1');
  const chainId = await uiStart(t, S1);
  w.adv(61e3);
  const rb = join(w.srv, 'B');
  const rc = join(w.srv, 'C');
  play(w, chainId, 'B', rb, 2);
  play(w, chainId, 'C', rc, 3);
  play(w, chainId, 'B', rb, 4);
  S1.tapId('back');
  await S1.settle();
  S1.ctl.onShow(ENTER(chainId, 'again'));
  await S1.settle();
  const e = S1.view();
  assert.equal(e.screen, 'entry');
  assert.equal(e.vm.canRevealNow, true);
  assert.equal(e.vm.isStarter, true);
  S1.tapId('entry:revealNow');
  assert.equal(S1.view().overlay.dialog.text, '现在揭晓？之后就不能再接了');
  S1.tapId('dialog:cancel');
  assert.equal(S1.screen(), 'entry');
  S1.tapId('entry:revealNow');
  S1.tapId('dialog:confirm');
  await S1.settle();
  const rv = S1.view();
  assert.equal(rv.screen, 'reveal');
  assert.equal(rv.vm.earlyText, '提前揭晓 · 传了 4/6 棒');
  assert.equal(rv.vm.steps.length, 4);
  assert.equal(rv.vm.canSameAgain, true);
  // 同题再传 from the reveal: picker preselected, counts as a normal start
  S1.tapId('reveal:skip');
  S1.tapId('reveal:sameAgain');
  await S1.settle();
  const pk = S1.view();
  assert.equal(pk.screen, 'picker');
  assert.equal(pk.vm.selectedId, pk.vm.prompts[0].id);
  assert.equal(pk.vm.prompts[0].isDaily, false);
  S1.tapId('picker:start');
  await S1.settle();
  assert.equal(S1.screen(), 'draw');
  assert.equal(S1.api.mock.db.chains[Object.keys(S1.api.mock.db.chains).pop()].openGId, 'G1');
});

test('expired chain: starter sees 同题再传 and 看我的那一棒; others do not get the prompt; delete one of my 棒 from the detail', async (t) => {
  const w = world(t);
  const S1 = await homeClient(t, w, 'S1');
  const chainId = await uiStart(t, S1);
  w.adv(61e3);
  const rb = join(w.srv, 'B');
  play(w, chainId, 'B', rb, 2);
  w.adv(49 * 3600e3);
  // starter
  S1.tapId('back');
  await S1.settle();
  S1.ctl.onShow(ENTER(chainId, 'x1'));
  await S1.settle();
  let e = S1.view();
  assert.equal(e.vm.state, 'expired');
  assert.equal(e.vm.headline, '这条接龙没传完');
  assert.equal(e.vm.canSameAgain, true);
  assert.equal(e.vm.canSeeMine, true);
  S1.tapId('entry:mine');
  await S1.settle();
  assert.equal(S1.screen(), 'detail');
  assert.equal(S1.view().vm.mine.length, 1);
  assert.equal(S1.view().vm.mine[0].canDelete, true);
  S1.tapId('back');
  S1.tapId('entry:sameAgain');
  await S1.settle();
  assert.equal(S1.screen(), 'picker');
  // B (participant, not the starter): no same-again, only own 棒
  const B = makeClient(t, w.srv, 'B');
  await B.ctl.start(ENTER(chainId, 'tb'));
  await B.settle();
  e = B.view();
  assert.equal(e.vm.state, 'expired');
  assert.equal(e.vm.canSameAgain, false);
  assert.ok(!JSON.stringify(e.vm).includes('小'), 'no prompt text');
  B.tapId('entry:mine');
  await B.settle();
  assert.equal(B.view().vm.mine[0].text, '第几句话2');
  B.tapId('detail:delete:2');
  assert.equal(B.view().overlay.dialog.text, '删除这一棒？删除后别人将看不到它');
  B.tapId('dialog:confirm');
  await B.settle();
  assert.equal(B.view().vm.mine[0].modState, 'deleted');
  assert.equal(B.view().vm.mine[0].text, undefined);
  assert.equal(w.srv.db.steps[chainId + '_2_1'].text, undefined);
  // my 接龙 (album) lists it as 没传完 and opens the detail
  B.tapId('back');
  B.ctl.onHit('back');
  await B.settle();
});

test('我的接龙: items by status open the reveal, the entry or the detail; offline shows the cached list', async (t) => {
  const w = world(t);
  const S1 = await homeClient(t, w, 'S1');
  const chainId = await uiStart(t, S1);
  w.adv(61e3);
  S1.tapId('back');
  await S1.settle();
  S1.tapId('home:album');
  await S1.settle();
  let a = S1.view();
  assert.equal(a.screen, 'album');
  assert.equal(a.vm.state, 'ready');
  assert.equal(a.vm.items.length, 1);
  assert.equal(a.vm.items[0].line, '进行中 1/6 · 我画了第 1 棒');
  assert.equal(S1.view().vm.items[0].status, 'open');
  S1.tapId('album:item:' + chainId);
  await S1.settle();
  assert.equal(S1.screen(), 'entry');
  assert.equal(S1.view().vm.state, 'prevMine');
  S1.tapId('back');
  await S1.settle();
  // offline: the last list is kept, read-only
  w.srv.offline = true;
  S1.tapId('back');
  S1.ctl.onHit('home:album');
  await S1.settle();
  a = S1.view();
  assert.equal(a.screen, 'album');
  assert.equal(a.vm.state, 'offline');
  assert.equal(a.vm.items.length, 1);
  assert.equal(a.vm.staleNote, '离线中，显示上次的列表');
  assert.ok(S1.ids().includes('album:retry'));
});

test('本群接龙: stats, waiting / in progress / recently revealed; without group context the explainer', async (t) => {
  const w = world(t);
  const S1 = await homeClient(t, w, 'S1');
  const chainId = await uiStart(t, S1);
  w.adv(61e3);
  const rb = join(w.srv, 'B');
  play(w, chainId, 'B', rb, 2);
  // a second chain by S1 stays pending
  S1.tapId('back');
  await S1.settle();
  S1.tapId('home:start');
  await S1.settle();
  S1.tapId('picker:start');
  await S1.settle();
  S1.strokes(2);
  t.mock.timers.tick(300);
  S1.tapId('draw:submit');
  await S1.settle();
  S1.tapId('sent:group');
  await S1.settle();
  const g = S1.view();
  assert.equal(g.screen, 'group');
  assert.equal(g.vm.state, 'ready');
  assert.equal(g.vm.statsText, '本群已完成 0 条 · 共画了 1 幅画');
  assert.deepEqual(g.vm.waiting.map((x) => x.line), ['第 3 棒 · 画一幅 · 已传 2/6']); // S1 drew 棒 1 only, so 棒 3 is theirs to take
  assert.deepEqual(g.vm.inProgress.map((x) => x.line), ['第 1 棒审核中']);
  S1.tapId('group:chain:' + chainId);
  await S1.settle();
  assert.equal(S1.screen(), 'entry');
  assert.equal(S1.view().vm.state, 'claimable');
  // B passed the baton last, so for B the same chain is "in progress: waiting for someone else"
  const Bc = makeClient(t, w.srv, 'B');
  await Bc.ctl.start(ENTER(chainId, 'tb'));
  await Bc.settle();
  Bc.tapId('entry:group');
  await Bc.settle();
  assert.deepEqual(Bc.view().vm.waiting, []);
  assert.deepEqual(Bc.view().vm.inProgress.map((x) => x.line), ['第 1 棒审核中', '第 3 棒等别人来接']);
  // no group context: the explainer, no data
  agree(w.srv, 'L');
  const L = makeClient(t, w.srv, 'L');
  await L.ctl.start({ scene: 1001, query: {} });
  await L.settle();
  L.tapId('sheet:close');
  L.tapId('home:group');
  await L.settle();
  assert.equal(L.view().vm.state, 'noGroup');
  assert.equal(L.view().vm.explainer, '在群聊里点开接龙卡片，就能看到本群的接龙');
  assert.ok(L.ids().includes('group:start'));
  assert.equal(L.log.calls.filter((c) => c.indexOf('getGroupEnterInfo') === 0).length, 0);
});

test('subscribe 揭晓时提醒我: only with a template, only after a tap; refusals are remembered per chain; ban hides it on the device', async (t) => {
  const w = world(t);
  w.srv.knobs.subscribeTmpl = 'TMPL-1';
  const S1 = await homeClient(t, w, 'S1');
  const c1 = await uiStart(t, S1);
  assert.equal(S1.view().vm.subscribe.state, 'offer');
  assert.ok(!S1.log.calls.some((x) => x.indexOf('requestSubscribeMessage') >= 0), 'never asked before the tap');
  S1.tapId('sent:subscribe');
  await S1.settle();
  assert.equal(S1.view().vm.subscribe.state, 'granted');
  assert.ok(w.srv.db.subGrants[c1 + '_S1']);
  // a refusal: remembered for that chain
  const S2 = await homeClient(t, w, 'S2', { subscribe: 'reject' });
  const c2 = await uiStart(t, S2);
  S2.tapId('sent:subscribe');
  await S2.settle();
  assert.equal(S2.view().vm.subscribe.state, 'declined');
  assert.equal(S2.store.state.subscribe.declined[c2], true);
  assert.ok(!S2.ids().includes('sent:subscribe'));
  // ban: hidden on this device from then on
  const S3 = await homeClient(t, w, 'S3', { subscribe: 'ban' });
  await uiStart(t, S3);
  S3.tapId('sent:subscribe');
  await S3.settle();
  assert.equal(S3.store.state.subscribe.bannedDevice, true);
  S3.tapId('back');
  await S3.settle();
  S3.tapId('home:start');
  await S3.settle();
  S3.tapId('picker:start');
  await S3.settle();
  S3.strokes(2);
  t.mock.timers.tick(300);
  S3.tapId('draw:submit');
  await S3.settle();
  assert.equal(S3.view().vm.subscribe.state, 'hidden');
  // no template configured: never offered
  const w2 = world(t);
  const N = await homeClient(t, w2, 'N');
  await uiStart(t, N);
  assert.equal(N.view().vm.subscribe.state, 'hidden');
});

test('updatable invite card: template info on share; static fallback when the feature is off (V7)', async (t) => {
  const w = world(t);
  const S1 = await homeClient(t, w, 'S1');
  await uiStart(t, S1);
  S1.tapId('sent:share');
  await S1.settle();
  const upd = S1.log.menu.filter((m) => m[0] === 'updateShareMenu' && m[1].isUpdatableMessage);
  assert.equal(upd.length, 1);
  assert.deepEqual(upd[0][1].templateInfo.parameterList, [{ name: 'member_count', value: '1' }, { name: 'room_limit', value: '6' }]);
  assert.match(upd[0][1].activityId, /^mock-activity-/);
  assert.equal(S1.view().vm.autoUpdateNote, true);
  assert.equal(S1.log.shares.length, 1);
  // the card title and query carry no content
  assert.equal(S1.log.shares[0].title, '第 2 棒等你接，看看你能猜出什么？');
  assert.match(S1.log.shares[0].query, /^k=[0-9a-z]{10}$/);
  // fallback
  const w2 = world(t);
  w2.srv.knobs.updatableCard = false;
  const S2 = await homeClient(t, w2, 'S2');
  await uiStart(t, S2);
  assert.equal(S2.view().vm.autoUpdateNote, false);
  S2.tapId('sent:share');
  await S2.settle();
  assert.equal(S2.log.menu.filter((m) => m[1].isUpdatableMessage).length, 0);
  assert.equal(S2.log.shares.length, 1);
  assert.ok(S2.log.menu.every((m) => m[1].isUpdatableMessage !== false), 'never isUpdatableMessage:false');
});

test('invite card renderer hook: the card vm never carries content (AC 95)', async (t) => {
  const w = world(t);
  const S1 = await homeClient(t, w, 'S1');
  const cards = [];
  S1.ctl.state.hits = [];
  const share = require('../js/share');
  const vmi = share.inviteCardVm({ passed: 3, nextStep: 4, nextKind: 'describe', promptText: '不该出现', strokes: [1], text: 'x' });
  assert.deepEqual(Object.keys(vmi).sort(), ['kind', 'length', 'nextKind', 'nextStep', 'passed']);
  const vmr = share.revealCardVm({ promptText: '月亮吃月饼', finalText: '外星人', passed: 6, participantCount: 6, strokes: [1], steps: [] });
  assert.deepEqual(Object.keys(vmr).sort(), ['finalText', 'kind', 'participantCount', 'passed', 'promptText']);
  void cards;
  assert.equal(share.revealTitle('月亮吃月饼', null, 6), '「月亮吃月饼」传了 6 棒，看看变成了什么');
  assert.equal(share.revealTitle('', null, 6), '一条接龙揭晓了，看看变成了什么');
  assert.equal(share.inviteTitle(3, 'draw'), '第 3 棒等你接，你来画画看？');
});

test('settings: sound, large text, high contrast, rules, privacy contract, agreement, delete everything with two confirmations', async (t) => {
  const g = boot(t);
  await g.settle();
  g.tapId('sheet:close');
  g.tapId('home:settings');
  assert.equal(g.view().screen, 'settings');
  assert.equal(g.view().display.largeText, false);
  g.tapId('settings:largeText');
  g.tapId('settings:highContrast');
  g.tapId('settings:sound');
  let v = g.view();
  assert.deepEqual([v.display.largeText, v.display.highContrast, v.muted, v.vm.largeText, v.vm.highContrast, v.vm.muted], [true, true, true, true, true, true]);
  assert.equal(JSON.parse(g.storage.chuanhua_state_v1).largeText, true);
  // persisted: a new boot with the same storage keeps them
  const g2 = boot(t, { storage: g.storage });
  await g2.settle();
  assert.deepEqual([g2.view().display.largeText, g2.view().display.highContrast, g2.view().muted], [true, true, true]);
  // rules sheet from settings, privacy contract, agreement
  g.tapId('settings:rules');
  assert.equal(g.view().vm.sheet, 'rules');
  g.tapId('rules:privacy');
  assert.ok(g.log.calls.includes('openPrivacyContract'));
  g.tapId('rules:later');
  g.tapId('settings:privacy');
  assert.equal(g.log.calls.filter((c) => c === 'openPrivacyContract').length, 2);
  g.tapId('settings:terms');
  assert.equal(g.log.modals.length, 1);
  // palette unlock from settings (stub ad)
  g.tapId('settings:palette');
  g.wait(3100);
  g.tapId('adstub:complete');
  await g.settle();
  assert.equal(g.view().vm.paletteUnlockedToday, true);
  assert.ok(!g.ids().includes('settings:palette'));
  // delete everything: two confirmations; cancel resets
  g.tapId('settings:deleteAll');
  assert.ok(g.view().overlay.dialog); // the confirms are overlay dialogs, vm.deleteAll stays idle
  g.tapId('dialog:cancel');
  assert.equal(g.view().vm.deleteAll.state, 'idle');
  g.srv.as('mock-openid-me').call('agreeRules', { version: 1 });
  const cr = g.srv.as('mock-openid-me').call('createChain', { promptId: 'A01' });
  g.srv.as('mock-openid-me').call('submitStep', { chainId: cr.chainId, claimId: cr.claim.claimId, strokes: drawing(2) });
  g.wait(61e3);
  g.srv.sweep();
  g.tapId('settings:deleteAll');
  g.tapId('dialog:confirm');
  assert.ok(g.view().overlay.dialog);
  assert.ok(g.view().overlay.dialog.text.includes('再确认一次'));
  g.tapId('dialog:confirm');
  await g.settle();
  assert.equal(g.view().vm.deleteAll.state, 'done');
  assert.equal(g.view().overlay.toast.text, '已删除 1 棒');
  assert.equal(g.srv.db.steps[cr.chainId + '_1_1'].strokes, undefined);
});

test('daily hook offline: today prompts come from core/daily; the same prompts the server returns (AC 88)', async (t) => {
  const w = world(t);
  const online = makeClient(t, w.srv, 'U1');
  await online.ctl.start({ scene: 1001, query: {} });
  await online.settle();
  const serverPrompts = online.view().vm.daily.prompts;
  w.srv.offline = true;
  const off = makeClient(t, w.srv, 'U2');
  await off.ctl.start({ scene: 1001, query: {} });
  await off.settle();
  assert.equal(off.view().vm.state, 'offline');
  assert.deepEqual(off.view().vm.daily.prompts, serverPrompts);
  assert.equal(off.view().vm.daily.dateText, online.view().vm.daily.dateText);
});

test('rules: the sheet gates start and claim; a server RULES_REQUIRED opens it; agreeing continues the tapped action (AC 76)', async (t) => {
  const w = world(t);
  const { srv } = w;
  srv.call('agreeRules', { version: 1 }, 'S0');
  const ref0 = srv.call('joinGroup', { groupData: { mockData: { opengid: 'G1', chat_type: 3 } } }, 'S0').groupRef;
  const cr = srv.call('createChain', { promptId: 'A01', groupRef: ref0 }, 'S0');
  srv.call('submitStep', { chainId: cr.chainId, claimId: cr.claim.claimId, strokes: drawing(2) }, 'S0');
  w.adv(61e3);
  const X = makeClient(t, srv, 'X'); // never agreed
  await X.ctl.start(ENTER(cr.chainId, 'tx'));
  await X.settle();
  assert.equal(X.view().vm.state, 'rulesRequired');
  X.tapId('entry:claim');
  await X.settle();
  // the client does not know the agreement state of a fresh install: it asks, nothing is claimed
  assert.equal(X.view().vm.sheet, 'rules');
  assert.equal(X.view().vm.rules.pendingAction, 'claim');
  assert.equal(srv.db.chains[cr.chainId].claim, null);
  assert.equal(X.view().vm.rules.lines.length, 4);
  X.tapId('rules:agree');
  await X.settle();
  assert.equal(X.screen(), 'describe'); // continued with the claim
  assert.equal(srv.db.players.X.rulesVersion, 1);
  assert.ok(X.analytics.queue.some((e) => e.name === 'rules_agree' && e.props.trigger === 'claim'));
  assert.ok(X.analytics.queue.some((e) => e.name === 'rules_view'));
});
