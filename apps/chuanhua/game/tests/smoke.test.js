'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot, makeClient } = require('./harness');
const { createMockServer } = require('../js/mock-server');
const St = require('../core/strokes');

const MIN = 60e3;

/** boot the game, dismiss the how-to, agree to the rules, and arrive at the draw screen of a fresh chain */
async function toFirstDraw(t, opts) {
  const g = boot(t, opts);
  await g.settle();
  return g;
}

async function startChain(g, promptIdx) {
  g.tapId('home:start');
  await g.settle();
  assert.ok(g.has('rules:agree'), 'rules sheet on first start');
  g.tapId('rules:agree');
  await g.settle();
  assert.equal(g.view().screen, 'picker');
  if (promptIdx) g.tapId('picker:select:' + g.view().vm.prompts[promptIdx].id);
  g.tapId('picker:start');
  await g.settle();
  assert.equal(g.view().screen, 'draw');
}

/** the other phone: an eligible member taking the open 棒 in the same group */
function other(g, id, ref) {
  const u = g.srv.as(id);
  u.call('agreeRules', { version: 1 });
  u.ref = ref || u.call('joinGroup', { groupData: { mockData: { opengid: 'G1', chat_type: 3 } } }).groupRef;
  return u;
}

test('first launch: how-to sheet once, home shows today prompts and the start button', async (t) => {
  const g = await toFirstDraw(t);
  const v = g.view();
  assert.equal(v.screen, 'home');
  assert.equal(v.vm.sheet, 'howto');
  assert.ok(g.frame().includes('开一条接龙：'));
  g.tapId('sheet:close');
  assert.equal(g.view().vm.sheet, null);
  assert.equal(g.view().vm.state, 'ready');
  assert.equal(g.view().vm.daily.prompts.length, 3);
  assert.equal(g.view().vm.start.sublabel, '今天还能开 3 条');
  assert.equal(g.view().vm.start.enabled, true);
  // the how-to never returns
  const g2 = boot(t, { storage: g.storage });
  await g2.settle();
  assert.equal(g2.view().vm.sheet, null);
});

test('start a chain: rules sheet, picker, one-thumb drawing, submit, 已传出 pending, then passed by polling', async (t) => {
  const g = await toFirstDraw(t);
  g.tapId('sheet:close');
  g.tapId('home:start');
  await g.settle();
  // AC 76: the sheet has no pre-ticked box, 先看看 leaves the game browsable
  assert.equal(g.view().vm.sheet, 'rules');
  g.tapId('rules:later');
  assert.equal(g.view().screen, 'home');
  assert.equal(g.view().vm.sheet, null);
  g.tapId('home:start');
  g.tapId('rules:agree');
  await g.settle();
  assert.equal(g.view().screen, 'picker');
  assert.equal(g.view().vm.canStart, true);
  g.tapId('picker:start');
  await g.settle();
  const d = g.view();
  assert.equal(d.screen, 'draw');
  assert.equal(d.vm.step, 1);
  assert.equal(d.vm.title, '第 1 棒 · 画出来');
  assert.equal(d.vm.canReport, false);
  assert.equal(d.vm.timer.secLeft, 60);
  assert.equal(d.vm.canSubmit, false);
  assert.ok(d.vm.coach);
  assert.equal(d.vm.palette.filter((p) => p.locked).length, 6);
  // draw
  g.stroke(0.2, 0.2, 0.8, 0.3);
  g.tapId('draw:color:1');
  g.tapId('draw:size:2');
  g.stroke(0.2, 0.8, 0.8, 0.7);
  assert.equal(g.view().vm.canSubmit, true);
  assert.equal(g.view().vm.strokes.s.length, 2);
  assert.deepEqual([g.view().vm.strokes.s[1][0], g.view().vm.strokes.s[1][1]], [1, 2]);
  g.tapId('draw:undo');
  assert.equal(g.view().vm.strokes.s.length, 1);
  g.stroke(0.2, 0.8, 0.8, 0.7);
  // AC 23: clear asks for confirmation
  g.tapId('draw:clear');
  assert.ok(g.view().overlay.dialog);
  g.tapId('dialog:cancel');
  assert.equal(g.view().vm.strokes.s.length, 2);
  g.tapId('draw:submit');
  assert.equal(g.view().vm.status, 'submitting');
  await g.settle();
  const s = g.view();
  assert.equal(s.screen, 'sent');
  assert.equal(s.vm.modState, 'pending');
  assert.equal(s.vm.modText, '审核中，通过后传给下一位');
  assert.equal(s.vm.nextText, '通过后，群友就能接第 2 棒');
  assert.equal(s.vm.firstTimeExplainer, true);
  assert.equal(s.vm.step, 1);
  // AC 3: the start is counted now
  const home = await g.app.api.getHome({});
  assert.equal(home.me.startsLeft, 2);
  // the label flips live by polling (every 15 s)
  g.wait(MIN + 1000);
  await g.settle();
  g.frame();
  await g.settle();
  assert.equal(g.view().vm.modState, 'passed');
  assert.equal(g.view().vm.modText, '已通过');
  // AC 28: no client path uploads an image
  assert.ok(!g.log.calls.some((c) => /uploadFile|saveImage/.test(c)));
  // the server received strokes and rasterised them itself
  const step = Object.values(g.srv.db.steps)[0];
  assert.ok(step.pngBytes > 1000);
  assert.equal(step.strokes.s.length, 2);
});

test('AC 14: timer 60 s; time up with a stroke auto-submits; with an empty canvas the claim is released', async (t) => {
  const g = await toFirstDraw(t);
  g.tapId('sheet:close');
  await startChain(g);
  g.stroke(0.2, 0.2, 0.8, 0.8);
  g.wait(30e3);
  assert.equal(g.view().vm.timer.secLeft, 30);
  g.wait(21e3);
  assert.equal(g.view().vm.timer.warn, true);
  g.wait(10e3);
  g.view();
  await g.settle();
  assert.equal(g.view().screen, 'sent'); // auto-submitted
  assert.equal(Object.keys(g.srv.db.steps).length, 1);
  // second chain, empty canvas
  g.tapId('back');
  await g.settle();
  g.tapId('home:start');
  await g.settle();
  g.tapId('picker:start');
  await g.settle();
  assert.equal(g.view().screen, 'draw');
  g.wait(61e3);
  g.view();
  await g.settle();
  assert.equal(g.view().screen, 'draw');
  assert.equal(g.view().vm.status, 'timeUp'); // the 时间到 modal; the claim is already released
  assert.ok(g.has('draw:timeUpOk') && g.has('draw:lock'));
  g.tapId('draw:timeUpOk');
  await g.settle();
  assert.equal(g.view().screen, 'home');
  // nothing was consumed and the chain was abandoned
  const h = await g.app.api.getHome({});
  assert.equal(h.me.startsLeft, 2);
});

test('放弃 asks for confirmation and releases the claim', async (t) => {
  const g = await toFirstDraw(t);
  g.tapId('sheet:close');
  await startChain(g);
  g.tapId('back');
  assert.equal(g.view().overlay.dialog.text, '放弃这一棒？群友可以接着画');
  g.tapId('dialog:cancel');
  assert.equal(g.view().screen, 'draw');
  g.tapId('back');
  g.tapId('dialog:confirm');
  await g.settle();
  assert.equal(g.view().screen, 'home');
  assert.equal(Object.values(g.srv.db.chains)[0].state, 'abandoned');
});

test('2-player chain to completion through the cards: invite share, group entry, claims, reveal, share, laugh', async (t) => {
  const g = await toFirstDraw(t);
  g.tapId('sheet:close');
  // A (the UI player) is opened from a card in the group so the chain is bound to it
  g.show({ scene: 1044, query: { wxad_fallback_share: '1' } }); // fallback share grants nothing, goes nowhere
  await g.settle();
  assert.equal(g.view().screen, 'home');
  await startChain(g);
  g.strokes(3);
  g.tapId('draw:submit');
  await g.settle();
  const chainId = Object.keys(g.srv.db.chains)[0];
  // the chain is unbound (no group context yet): share the invite card, voluntary
  g.tapId('sent:share');
  await g.settle();
  const inv = g.log.shares[0];
  assert.equal(inv.query, 'k=' + chainId);
  assert.equal(inv.title, '第 2 棒等你接，看看你能猜出什么？');
  assert.ok(g.log.menu.some((m) => m[0] === 'updateShareMenu' && m[1].isUpdatableMessage === true && m[1].templateInfo.parameterList[0].value === '0' || m[1].isUpdatableMessage === true));
  const upd = g.log.menu.filter((m) => m[1].isUpdatableMessage)[0][1];
  assert.equal(upd.withShareTicket, true);
  assert.deepEqual(upd.templateInfo.parameterList.map((p) => p.name), ['member_count', 'room_limit']);
  // B opens the card in the group and takes 棒 2 (B's phone)
  g.wait(61e3);
  g.srv.sweep();
  const B = other(g, 'B');
  const cl2 = B.call('claimStep', { chainId, groupRef: B.ref });
  assert.equal(cl2.ok, true, cl2.code);
  assert.equal(B.call('submitStep', { chainId, claimId: cl2.claimId, text: '一个大饼在天上' }).state, 'passed');
  // A taps the card back in the group (shareTicket): group context, then the entry screen
  g.show({ scene: 1044, query: { k: chainId }, shareTicket: 'ticket-1', chatType: 3 });
  await g.settle();
  assert.ok(g.log.calls.includes('getGroupEnterInfo'));
  let e = g.view();
  assert.equal(e.screen, 'entry');
  assert.equal(e.vm.state, 'claimable');
  assert.equal(e.vm.headline, '第 3 棒等你接');
  assert.equal(e.vm.limitText, '（限时 60 秒）');
  assert.ok(!JSON.stringify(e.vm).includes('一个大饼'), 'the entry never shows content');
  g.tapId('entry:claim');
  await g.settle();
  let d = g.view();
  assert.equal(d.screen, 'draw');
  assert.equal(d.vm.step, 3);
  assert.equal(d.vm.sourceLabel, '上一棒说：「一个大饼在天上」');
  assert.equal(d.vm.canReport, true);
  g.strokes(2);
  g.tapId('draw:submit');
  await g.settle();
  assert.equal(g.view().screen, 'sent');
  g.wait(61e3);
  g.srv.sweep();
  // B: 棒 4 (describe), A: 棒 5 via the entry screen again, B: 棒 6
  let cl = B.call('claimStep', { chainId, groupRef: B.ref });
  assert.equal(cl.step, 4);
  assert.equal(cl.prev.kind, 'draw');
  B.call('submitStep', { chainId, claimId: cl.claimId, text: '月亮上有只兔子' });
  g.tapId('back');
  g.show({ scene: 1044, query: { k: chainId }, shareTicket: 'ticket-2', chatType: 3 });
  await g.settle();
  g.tapId('entry:claim');
  await g.settle();
  assert.equal(g.view().vm.step, 5);
  g.strokes(4);
  g.tapId('draw:submit');
  await g.settle();
  g.wait(61e3);
  g.srv.sweep();
  cl = B.call('claimStep', { chainId, groupRef: B.ref });
  assert.equal(cl.step, 6);
  const fin = B.call('submitStep', { chainId, claimId: cl.claimId, text: '外星人在吃披萨' });
  assert.equal(fin.revealed, true);
  // A opens the reveal from the notice-style card r=<id>
  g.tapId('back');
  g.show({ scene: 1044, query: { r: chainId }, shareTicket: 'ticket-3', chatType: 3 });
  await g.settle();
  const rv = g.view();
  assert.equal(rv.screen, 'reveal');
  assert.equal(rv.vm.state, 'ready');
  assert.equal(rv.vm.steps.length, 6);
  assert.deepEqual(rv.vm.steps.map((s) => s.mine), [true, false, true, false, true, false]);
  assert.equal(rv.vm.header, '接龙揭晓 · 2 位群友 · 用时 ' + rv.vm.header.split('用时 ')[1]);
  assert.equal(rv.vm.summaryText, '从「' + Object.values(g.srv.db.chains)[0].promptText + '」传成了「外星人在吃披萨」');
  assert.equal(rv.vm.autoplay.enabled, true);
  assert.equal(rv.vm.autoplay.playing, true);
  assert.ok(g.has('reveal:skip'));
  // AC 31: each drawing replays in 2.5 s whatever its stroke count
  const tl = rv.vm.timeline;
  const drawPanels = tl.panels.filter((p) => p.kind === 'draw');
  assert.ok(drawPanels.every((p) => p.end - p.start === 2500));
  g.wait(16e3);
  g.frame();
  assert.equal(g.view().vm.autoplay.playing, false); // finished after ~13 s
  // laugh toggles, report hides, share the reveal card
  g.tapId('reveal:laugh:2');
  await g.settle();
  assert.equal(g.view().vm.steps[1].laughs, 1);
  assert.equal(g.view().vm.steps[1].myLaugh, true);
  g.tapId('reveal:share');
  await g.settle();
  const rs = g.log.shares[g.log.shares.length - 1];
  assert.equal(rs.query, 'r=' + chainId);
  assert.equal(rs.title, '「' + Object.values(g.srv.db.chains)[0].promptText + '」传了 6 棒，变成了「外星人在吃披萨」');
  // replay restarts the sequence; any tap while playing skips
  g.tapId('reveal:replayAll');
  assert.equal(g.view().vm.autoplay.playing, true);
  g.tapId('reveal:skip');
  assert.equal(g.view().vm.autoplay.playing, false);
  // the strip is shown in full on later opens
  g.tapId('back');
  await g.settle();
  assert.equal(g.view().screen, 'home');
  g.show({ scene: 1044, query: { r: chainId }, shareTicket: 'ticket-4' });
  await g.settle();
  assert.equal(g.view().vm.autoplay.playing, false);
  assert.equal(g.view().vm.autoplay.enabled, false);
});

