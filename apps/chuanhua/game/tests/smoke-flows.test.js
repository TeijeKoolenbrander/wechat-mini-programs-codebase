'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot, makeClient, enableClock } = require('./harness');
const { createMockServer } = require('../js/mock-server');
const S = require('../core/strokes');
const { FORBIDDEN_APIS } = require('../js/privacy');
const { FORBIDDEN_PROPS } = require('../js/analytics');

const ENTER = (chainId, ticket) => ({ scene: 1044, query: { k: chainId }, shareTicket: ticket || 'ticket', chatType: 3 });
const drawing = (n) => {
  const d = S.emptyDrawing();
  for (let i = 0; i < n; i++) d.s.push(S.makeStroke(i % 6, 1, [[10 + i, 10], [100 + i, 200], [300, 300 + i]]));
  return d;
};

function world(t) {
  enableClock(t);
  const srv = createMockServer({ now: () => Date.now(), rasterize: false });
  const adv = (ms) => {
    t.mock.timers.tick(ms);
    srv.sweep();
  };
  return { srv, adv };
}

function agree(srv, id) {
  srv.call('agreeRules', { version: 1 }, id);
}

/** a chain started by 'S' in group G1 with 棒 1 passed */
function seedChain(w, strokes) {
  agree(w.srv, 'S');
  const ref = w.srv.call('joinGroup', { groupData: { mockData: { opengid: 'G1', chat_type: 3 } } }, 'S').groupRef;
  const cr = w.srv.call('createChain', { promptId: 'A01', groupRef: ref }, 'S');
  assert.equal(cr.ok, true);
  w.srv.call('submitStep', { chainId: cr.chainId, claimId: cr.claim.claimId, strokes: drawing(strokes || 3) }, 'S');
  w.adv(61e3);
  return { chainId: cr.chainId, ref };
}

async function member(w, t, id, chainId, opts) {
  agree(w.srv, id);
  const c = makeClient(t, w.srv, id, opts);
  await c.ctl.start(ENTER(chainId, 'ticket-' + id));
  await c.settle();
  return c;
}

test('lock collision: the second claimant gets "被群友抢先一步" and the taken state with a way out', async (t) => {
  const w = world(t);
  const { chainId } = seedChain(w);
  const X = await member(w, t, 'X', chainId);
  const Y = await member(w, t, 'Y', chainId);
  assert.equal(X.screen(), 'entry');
  assert.equal(X.view().vm.state, 'claimable');
  assert.equal(Y.view().vm.state, 'claimable');
  X.tapId('entry:claim');
  await X.settle();
  assert.equal(X.screen(), 'describe');
  Y.tapId('entry:claim');
  await Y.settle();
  const y = Y.view();
  assert.equal(y.screen, 'entry');
  assert.equal(y.vm.state, 'taken');
  assert.equal(y.vm.headline, '有群友正在接第 2 棒（约 2 分钟内）');
  assert.equal(y.overlay.toast.text, '被群友抢先一步');
  assert.deepEqual(['entry:others', 'entry:new'].map((id) => Y.ids().includes(id)), [true, true]);
  assert.ok(!Y.ids().includes('entry:claim'));
  // X gives the 棒 back: Y can take it after a refresh
  X.tapId('back');
  X.tapId('dialog:confirm');
  await X.settle();
  Y.tapId('entry:others');
  await Y.settle();
  assert.equal(Y.screen(), 'group');
  assert.equal(Y.view().vm.waiting.length, 1);
  assert.equal(Y.view().vm.waiting[0].line, '第 2 棒 · 猜一句 · 已传 1/6');
});

test('timeout: a describe turn at 45 s auto-submits; a late submit after losing the claim is discarded (CLAIM_LOST)', async (t) => {
  const w = world(t);
  const { chainId } = seedChain(w);
  const X = await member(w, t, 'X', chainId);
  X.tapId('entry:claim');
  await X.settle();
  assert.equal(X.view().vm.timer.secLeft, 45);
  X.type('一只猫在睡觉');
  assert.equal(X.view().vm.canSubmit, true);
  t.mock.timers.tick(46e3);
  X.view(); // the frame tick sees the timer end and auto-submits
  await X.settle();
  assert.equal(X.screen(), 'sent');
  assert.equal(X.view().vm.modState, 'passed');
});

test('claim lost: the app is frozen for 160 s, somebody else takes the 棒; the late submit is discarded with the message', async (t) => {
  const w = world(t);
  const { chainId } = seedChain(w);
  const X = await member(w, t, 'X', chainId);
  X.tapId('entry:claim');
  await X.settle();
  X.type('一只猫在睡觉');
  // frozen in the background: no frames, no ticks, for 160 s of wall clock
  t.mock.timers.tick(160e3);
  const ref = w.srv.call('joinGroup', { groupData: { mockData: { opengid: 'G1', chat_type: 3 } } }, 'Y').groupRef;
  agree(w.srv, 'Y');
  const cl = w.srv.call('claimStep', { chainId, groupRef: ref }, 'Y');
  assert.equal(cl.ok, true);
  X.view(); // back in the foreground: time is up, auto-submit is attempted, the claim is gone
  await X.settle();
  const v = X.view();
  assert.equal(v.screen, 'entry');
  assert.equal(v.overlay.toast.text, '超时了，这一棒已被群友接走');
  assert.equal(v.vm.state, 'taken');
  assert.equal(w.srv.db.steps[chainId + '_2_1'], undefined);
});

test('kill and relaunch during a turn: the claim is resumed with the saved strokes and the remaining time', async (t) => {
  const w = world(t);
  const { chainId } = seedChain(w);
  agree(w.srv, 'X');
  const storage = {};
  const X = makeClient(t, w.srv, 'X', { storage });
  await X.ctl.start(ENTER(chainId, 't1'));
  await X.settle();
  X.tapId('entry:claim');
  await X.settle();
  X.type('一只猫');
  X.ctl.onHide();
  t.mock.timers.tick(20e3);
  // new process, same storage and account
  const X2 = makeClient(t, w.srv, 'X', { storage });
  await X2.ctl.start({ scene: 1001, query: {} });
  await X2.settle();
  const v = X2.view();
  assert.equal(v.screen, 'describe');
  assert.equal(v.vm.text, '一只猫');
  assert.equal(v.vm.timer.secLeft, 25); // 45 - 20
  X2.tapId('describe:submit');
  await X2.settle();
  assert.equal(X2.screen(), 'sent');
  assert.equal(storage.chuanhua_state_v1.indexOf('"turn":null') > 0, true, 'the saved turn is deleted after submit');
});

test('a drawing turn survives a restart too: strokes are stored compactly and restored', async (t) => {
  const w = world(t);
  agree(w.srv, 'D');
  const storage = {};
  const D = makeClient(t, w.srv, 'D', { storage });
  await D.ctl.start({ scene: 1001, query: {} });
  await D.settle();
  D.tapId("sheet:close");
  await D.settle();
  D.tapId('home:start');
  await D.settle();
  D.tapId('picker:start');
  await D.settle();
  D.strokes(3);
  const saved = D.view().vm.strokes;
  assert.equal(saved.s.length, 3);
  D.ctl.onHide();
  t.mock.timers.tick(10e3);
  const D2 = makeClient(t, w.srv, 'D', { storage });
  await D2.ctl.start({ scene: 1001, query: {} });
  await D2.settle();
  assert.equal(D2.screen(), 'draw');
  assert.deepEqual(D2.view().vm.strokes, saved);
  assert.equal(D2.view().vm.timer.secLeft, 50);
});

test('describe: local rejection costs no API call; blocked and busy keep the text; retyping passes', async (t) => {
  const w = world(t);
  const { chainId } = seedChain(w);
  const X = await member(w, t, 'X', chainId);
  X.tapId('entry:claim');
  await X.settle();
  const before = w.srv.calls.filter((n) => n === 'submitStep').length;
  X.type('加我微信吧');
  t.mock.timers.tick(300);
  X.tapId('describe:submit');
  await X.settle();
  assert.equal(X.view().vm.status, 'blocked');
  assert.equal(X.view().vm.errorText, '换个说法吧');
  assert.equal(w.srv.calls.filter((n) => n === 'submitStep').length, before, 'AC 34: no API call for a local rejection');
  X.type('测试复审');
  t.mock.timers.tick(300);
  X.tapId('describe:submit');
  await X.settle();
  assert.equal(X.view().vm.status, 'blocked');
  assert.equal(X.view().vm.errorText, '这句话没通过审核，换个说法吧');
  assert.equal(X.view().vm.text, '测试复审'); // kept for editing
  X.type('测试繁忙');
  t.mock.timers.tick(300);
  X.tapId('describe:submit');
  await X.settle();
  assert.equal(X.view().vm.status, 'busy');
  assert.equal(X.view().vm.errorText, '审核服务繁忙，请稍后再试');
  X.type('一只小猫');
  assert.equal(X.view().vm.status, 'typing');
  assert.equal(X.view().vm.count, '4/16');
  X.type('一只小猫😀');
  assert.equal(X.view().vm.text, '一只小猫'); // emoji dropped on input (AC 33)
  t.mock.timers.tick(300);
  X.tapId('describe:submit');
  await X.settle();
  assert.equal(X.screen(), 'sent');
  assert.equal(X.view().vm.modState, 'passed');
});

test('moderation block of a drawing: sent screen flips to blocked, my 接龙 shows it, the next time home shows the warning sheet', async (t) => {
  const g = boot(t);
  await g.settle();
  g.tapId('sheet:close');
  g.tapId('home:start');
  await g.settle();
  g.tapId('rules:agree');
  await g.settle();
  g.tapId('picker:start');
  await g.settle();
  g.strokes(13); // the mock rule: exactly 13 strokes -> risky
  g.tapId('draw:done');
  await g.settle();
  assert.equal(g.view().vm.modState, 'pending');
  g.wait(61e3);
  g.wait(16e3);
  g.frame();
  await g.settle();
  assert.equal(g.view().vm.modState, 'blocked');
  assert.equal(g.view().vm.modText, '这一棒没通过内容审核，没有传出去');
  assert.equal(g.view().vm.nextText, null);
  assert.ok(!g.ids().includes('sent:share'));
  g.tapId('back');
  await g.settle();
  assert.equal(g.view().overlay.sheet.kind, 'warn');
  assert.ok(g.view().overlay.sheet.vm.text.includes('请遵守接龙公约'));
  g.tapId('sheet:ack');
  await g.settle();
  assert.equal(g.view().overlay.sheet, undefined);
  g.tapId('home:album');
  await g.settle();
  const a = g.view();
  assert.equal(a.screen, 'album');
  assert.equal(a.vm.items[0].status, 'blocked');
  assert.equal(a.vm.items[0].line, '这一棒没通过审核 · 第 1 棒');
  // the starter may redraw: the start was spent, but the chain is theirs again
  const h = await g.app.api.getHome({});
  assert.equal(h.me.startsLeft, 2);
});

test('a pending drawing that never gets a verdict is voided; the album detail shows 审核超时', async (t) => {
  const g = boot(t);
  await g.settle();
  g.tapId('sheet:close');
  g.tapId('home:start');
  await g.settle();
  g.tapId('rules:agree');
  await g.settle();
  g.tapId('picker:start');
  await g.settle();
  g.strokes(15);
  g.tapId('draw:done');
  await g.settle();
  g.wait(72 * 60e3);
  g.srv.sweep();
  const chainId = Object.keys(g.srv.db.chains)[0];
  const r = await g.app.api.getMyChains({ chainId });
  assert.equal(r.items[0].mine[0].modState, 'void');
  const vm = require('../js/vm').detailVm(r.items[0]);
  assert.equal(vm.mine[0].modText, '审核超时，这一棒没有传出去，不算你的次数');
  assert.equal((await g.app.api.getHome({})).me.startsLeft, 3);
});

test('report from the claim screen hides the previous 棒, cancels my claim and reopens it', async (t) => {
  const w = world(t);
  const { chainId } = seedChain(w);
  const X = await member(w, t, 'X', chainId);
  X.tapId('entry:claim');
  await X.settle();
  assert.equal(X.screen(), 'describe');
  assert.equal(X.view().vm.canReport, true);
  X.tapId('describe:report');
  const sheet = X.view().overlay.sheet;
  assert.equal(sheet.kind, 'report');
  assert.deepEqual(sheet.vm.reasons, ['porn', 'politics', 'abuse', 'ad', 'other']);
  assert.equal(sheet.vm.reasonLabels.porn, '色情低俗');
  X.tapId('report:submit'); // no reason yet: nothing happens
  assert.equal(X.view().overlay.sheet.vm.state, 'idle');
  X.tapId('report:reason:ad');
  X.tapId('report:submit');
  await X.settle();
  const v = X.view();
  assert.equal(v.overlay.sheet, undefined);
  assert.equal(v.overlay.toast.text, '已举报，该内容已隐藏，我们会尽快核实');
  assert.equal(v.screen, 'entry');
  assert.equal(v.vm.nextStep, 1);
  assert.equal(w.srv.db.steps[chainId + '_1_1'].state, 'hidden');
  // a second report by the same player is refused
  assert.equal((await X.api.report({ chainId, step: 1, reason: 'ad' })).ok, false);
});

test('teaser for a non-participant: text only, 同题再传 preselects the prompt and binds the same group', async (t) => {
  const w = world(t);
  const { chainId } = seedChain(w);
  // finish the chain quickly with S and B so it reveals
  agree(w.srv, 'B');
  const refB = w.srv.call('joinGroup', { groupData: { mockData: { opengid: 'G1', chat_type: 3 } } }, 'B').groupRef;
  const play = (who, ref, n) => {
    const cl = w.srv.call('claimStep', { chainId, groupRef: ref }, who);
    assert.equal(cl.ok, true, who + ' ' + cl.code);
    const r = w.srv.call('submitStep', n % 2 === 0 ? { chainId, claimId: cl.claimId, text: '第几句' + n } : { chainId, claimId: cl.claimId, strokes: drawing(2) }, who);
    assert.equal(r.ok, true);
    w.adv(61e3);
  };
  const refS = w.srv.call('joinGroup', { groupData: { mockData: { opengid: 'G1', chat_type: 3 } } }, 'S').groupRef;
  play('B', refB, 2);
  play('S', refS, 3);
  play('B', refB, 4);
  play('S', refS, 5);
  play('B', refB, 6);
  agree(w.srv, 'Z');
  const Z = makeClient(t, w.srv, 'Z');
  await Z.ctl.start({ scene: 1044, query: { r: chainId }, shareTicket: 'tz', chatType: 3 });
  await Z.settle();
  const tv = Z.view();
  assert.equal(tv.screen, 'teaser');
  assert.equal(tv.vm.state, 'ready');
  assert.equal(tv.vm.promptText, '小猫吃面条');
  assert.equal(tv.vm.finalText, '第几句6');
  assert.equal(tv.vm.passed, 6);
  assert.equal(tv.vm.canSameAgain, true);
  assert.ok(!JSON.stringify(tv).includes('strokes'));
  Z.tapId('teaser:same');
  await Z.settle();
  const pk = Z.view();
  assert.equal(pk.screen, 'picker');
  assert.equal(pk.vm.prompts[0].text, '小猫吃面条');
  assert.equal(pk.vm.selectedId, pk.vm.prompts[0].id);
  Z.tapId('picker:start');
  await Z.settle();
  assert.equal(Z.screen(), 'draw');
  const mine = Object.values(w.srv.db.chains).filter((c) => c.starter === 'Z')[0];
  assert.equal(mine.openGId, 'G1'); // bound to the same group (AC 85)
  assert.equal(mine.promptId, 'A01');
});

test('card entry: no ticket / wrong group / malformed / fallback share (AC 94-97)', async (t) => {
  const w = world(t);
  const { chainId } = seedChain(w);
  // opened from a single chat (no ticket): no group context, so the claim is refused
  agree(w.srv, 'N');
  const N = makeClient(t, w.srv, 'N');
  await N.ctl.start({ scene: 1007, query: { k: chainId } });
  await N.settle();
  assert.equal(N.view().vm.state, 'wrongGroup');
  assert.equal(N.view().vm.headline, '接龙只能在发起的群里接力');
  assert.ok(N.ids().includes('entry:new'));
  assert.ok(!N.ids().includes('entry:claim'));
  assert.ok(!N.log.calls.includes('getGroupEnterInfo'));
  // opened from another group
  agree(w.srv, 'W');
  const W = makeClient(t, w.srv, 'W', { groupData: { opengid: 'G2', chat_type: 3 } });
  await W.ctl.start(ENTER(chainId, 'tw'));
  await W.settle();
  assert.equal(W.view().vm.state, 'wrongGroup');
  // the join failed (40097): same result, group_join logged with the error code
  agree(w.srv, 'F');
  const F = makeClient(t, w.srv, 'F', { groupEnterFail: 40097 });
  await F.ctl.start(ENTER(chainId, 'tf'));
  await F.settle();
  assert.equal(F.view().vm.state, 'wrongGroup');
  assert.ok(F.analytics.queue.some((e) => e.name === 'group_join' && e.props.result === 'wrongScene'));
  // malformed and fallback entries go nowhere and grant nothing
  const M = makeClient(t, w.srv, 'M');
  await M.ctl.start({ scene: 1001, query: { k: '!!' } });
  await M.settle();
  assert.equal(M.screen(), 'home');
  await M.ctl.start({ scene: 1001, query: { wxad_fallback_share: '1' } });
  await M.settle();
  assert.equal(M.screen(), 'home');
  assert.ok(M.analytics.queue.some((e) => e.name === 'error' && e.props.where === 'card_entry'));
  assert.equal((await M.api.getHome({})).me.startsLeft, 3);
  // wx.getShareInfo is never used
  assert.ok(![N, W, F, M].some((c) => c.log.calls.some((x) => x.indexOf('getShareInfo') >= 0)));
});

test('AC 97: a card opened during a turn does not interrupt it; it routes after the turn with the toast', async (t) => {
  const w = world(t);
  const { chainId } = seedChain(w);
  const X = await member(w, t, 'X', chainId);
  X.tapId('entry:claim');
  await X.settle();
  X.type('一只小猫');
  // another card arrives
  const other = 'zzzzzzzzzz';
  X.ctl.onShow({ scene: 1044, query: { k: other }, shareTicket: 'new', chatType: 3 });
  await X.settle();
  const v = X.view();
  assert.equal(v.screen, 'describe');
  assert.equal(v.overlay.toast.text, '群里有新接龙，传完这一棒再看');
  assert.equal(v.vm.text, '一只小猫');
  t.mock.timers.tick(300);
  X.tapId('describe:submit');
  await X.settle();
  assert.equal(X.screen(), 'sent');
  X.tapId('back'); // leaving the 已传出 screen routes the waiting card
  await X.settle();
  assert.equal(X.screen(), 'entry');
  assert.equal(X.view().vm.state, 'notFound');
});

test('offline: home shows 需联网才能接龙 with a disabled start and 重试; submit offline keeps the strokes and retries', async (t) => {
  const w = world(t);
  enableClock(t);
  const c = makeClient(t, w.srv, 'O');
  w.srv.offline = true;
  await c.ctl.start({ scene: 1001, query: {} });
  await c.settle();
  let v = c.view();
  assert.equal(v.vm.state, 'offline');
  assert.equal(v.vm.start.enabled, false);
  assert.equal(v.vm.offlineText, '需联网才能接龙');
  assert.equal(v.vm.daily.prompts.length, 3, '今日起点 is computed locally offline');
  assert.ok(c.ids().includes("home:retry"));
  c.tapId("sheet:close");
  w.srv.offline = false;
  c.tapId('home:retry');
  await c.settle();
  assert.equal(c.view().vm.state, 'ready');
  // a turn: go offline at submit
  c.tapId('home:start');
  c.tapId('rules:agree');
  await c.settle();
  c.tapId('picker:start');
  await c.settle();
  c.strokes(2);
  w.srv.offline = true;
  c.tapId('draw:done');
  await c.settle();
  v = c.view();
  assert.equal(v.screen, 'draw');
  assert.equal(v.vm.status, 'error');
  assert.equal(v.vm.errorText, '没传出去');
  assert.equal(v.vm.strokes.s.length, 2);
  assert.ok(c.ids().includes('draw:retry'));
  w.srv.offline = false;
  t.mock.timers.tick(300);
  c.tapId('draw:retry');
  await c.settle();
  assert.equal(c.screen(), 'sent');
});

test('picker: 换一批 shows 3 non-daily prompts; 自己出题 is moderated before anything exists', async (t) => {
  const w = world(t);
  const c = makeClient(t, w.srv, 'P');
  await c.ctl.start({ scene: 1001, query: {} });
  c.tapId("sheet:close");
  await c.settle();
  // the rules sheet comes first (the server has no agreement from this player yet)
  c.tapId('home:start');
  c.tapId('rules:agree');
  await c.settle();
  assert.equal(c.screen(), 'picker');
  const daily = c.view().vm.prompts.map((p) => p.id);
  assert.equal(daily.length, 3);
  assert.ok(c.view().vm.prompts.every((p) => p.isDaily));
  c.tapId('picker:batch');
  const batch = c.view().vm.prompts;
  assert.equal(batch.length, 3);
  assert.ok(batch.every((p) => !daily.includes(p.id)));
  c.tapId('picker:custom');
  assert.equal(c.view().vm.custom.open, true);
  assert.equal(c.view().vm.canStart, false);
  c.type('一');
  assert.equal(c.view().vm.canStart, false);
  c.type('加我微信哦');
  c.tapId('picker:start');
  await c.settle();
  assert.equal(c.view().vm.custom.error, '换个说法吧');
  c.type('测试违规');
  c.tapId('picker:start');
  await c.settle();
  assert.equal(c.view().vm.custom.error, '这个题目不太合适，换一个吧');
  c.type('测试繁忙');
  c.tapId('picker:start');
  await c.settle();
  assert.equal(c.view().vm.errorText, '审核服务繁忙，请稍后再试，或先选一个现成的题目');
  assert.equal(Object.keys(w.srv.db.chains).length, 0, 'AC 40: a blocked custom prompt creates no chain');
  c.type('我家的小猫');
  assert.equal(c.view().vm.custom.count, '5/12');
  c.tapId('picker:start');
  await c.settle();
  assert.equal(c.screen(), 'draw');
  assert.equal(c.view().vm.sourceLabel, '题目：「我家的小猫」');
});

