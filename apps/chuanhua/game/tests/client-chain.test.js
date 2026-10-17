'use strict';
// 慢慢传 (the async chain, spec 3, 5.8, 8.6, 8.7) on the real renderer and the mock server: full chains, the forced send at 0 (draw and
// describe, markers, retries, a blocked forced send reopening the 棒), claims, early reveal, expiry, the async-fallback image mode,
// moderation states, reports, the teaser and the resume of an unsent turn. Names carry the spec 19 AC numbers they cover.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { world } = require('./harness');
const { G, startChain, openCard, describeStep, drawStep } = require('./flows');

const MIN = 60e3;

test('AC 1/2/6/15/74: two players alternate (A 1/3/5, B 2/4/6), the 6th text reveals at once in the step-through, labels are 第 N 棒 and (你) only', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const id = await startChain(a);
  assert.equal(a.vm().modState, 'passed', 'drawings are checked synchronously (6.3): no pending state');
  assert.equal(a.vm().modText, '已通过');
  assert.equal(a.vm().nextText, '群友现在可以接第 2 棒');
  await describeStep(w, b, id, '一个大饼在天上');
  assert.equal(b.screen(), 'sent');
  assert.equal(b.vm().modState, 'passed');
  await drawStep(w, a, id);
  await describeStep(w, b, id, '外星人在吃披萨');
  await drawStep(w, a, id);
  await describeStep(w, b, id, '企鹅在沙漠晒太阳');
  assert.equal(b.screen(), 'stepthrough', 'the last player lands in the reveal');
  const st = b.vm();
  assert.equal(st.state, 'ready');
  assert.equal(st.mode, 'chain');
  assert.equal(st.steps.length, 7, '起点 + 6 棒');
  assert.deepEqual(st.steps.map((s) => s.kind), ['prompt', 'draw', 'describe', 'draw', 'describe', 'draw', 'describe']);
  assert.deepEqual(st.steps.map((s) => s.mine), [false, false, true, false, true, false, true]);
  assert.equal(st.index, 6);
  assert.equal(st.earlyText, null);
  assert.match(b.frame(), /\(你\)/);
  assert.doesNotMatch(b.frame(), /openid|nick|头像|昵称/);
  await b.tap('stepthrough:back');
  assert.equal(b.screen(), 'home');
  await a.tap('sent:home');
  assert.equal(a.vm().album.unseenReveals, 1);
  await a.tap('home:album');
  assert.equal(a.vm().items[0].status, 'revealed');
  assert.equal(a.vm().items[0].kind, 'chain');
  assert.equal(a.vm().items[0].unseen, true);
  await a.tap('album:chain:' + id);
  assert.equal(a.screen(), 'stepthrough');
  assert.deepEqual(a.vm().steps.map((s) => s.mine), [true, true, false, true, false, true, false]);
  await a.tap('stepthrough:back');
  assert.equal(a.screen(), 'album', 'the reveal opened from a list goes back where it came from');
});

test('AC 6: three players (A 1/4, B 2/5, C 3/6) complete a chain and all three see the reveal', async () => {
  const w = world();
  const [a, b, c] = [await w.player('A', { rules: true, ...G }), await w.player('B', { rules: true, ...G }), await w.player('C', { rules: true, ...G })];
  const id = await startChain(a);
  await describeStep(w, b, id, '第二棒的话');
  await drawStep(w, c, id);
  await describeStep(w, a, id, '第四棒的话');
  await drawStep(w, b, id);
  await describeStep(w, c, id, '第六棒的话');
  assert.equal(c.screen(), 'stepthrough');
  assert.equal(c.vm().header, '接龙揭晓 · 3 位群友');
  for (const p of [a, b]) {
    await openCard(w, p, id, 'r');
    assert.equal(p.screen(), 'stepthrough', p.name);
    assert.equal(p.vm().state, 'ready');
  }
});

// ----------------------------------------------------------------------------------------------- forced send (5.8)

test('AC 14/128: the draw timer is 60 s; at 0 a drawing with >= 1 stroke is sent as it is (auto: true) and the screen is inert from 0', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  await a.tap('home:slow');
  await a.tap('pick:start');
  assert.equal(a.vm().timer.secLeft, 60);
  assert.equal(a.vm().backLabel, '放弃');
  a.scribble(2);
  w.advance(50 * 1000);
  assert.equal(a.vm().timer.secLeft, 10);
  assert.equal(a.vm().timer.warn, true);
  assert.equal(a.screen(), 'draw');
  const r = a.hit('draw:canvas');
  const finger = a.down(r.x + 20, r.y + 20);
  a.move(finger, r.x + 120, r.y + 90);
  w.advance(10 * 1000);
  assert.equal(a.vm().status === 'timeUp' || a.vm().status === 'sending' || a.screen() === 'sent', true);
  a.up(finger, r.x + 130, r.y + 100);
  await a.settle();
  assert.equal(a.screen(), 'sent', 'auto-sent at 0');
  assert.equal(a.vm().modState, 'passed');
  const step = Object.values(w.srv.db.steps)[0];
  assert.equal(step.auto, true);
  assert.equal(step.strokes.s.length, 3, 'the stroke in progress at 0 is included');
  const ev = a.app.analytics.queue.filter((e) => e.name === 'step_submit');
  assert.equal(ev[ev.length - 1].props.auto, true);
  assert.equal(ev[ev.length - 1].props.empty, false);
  assert.equal(ev[ev.length - 1].props.mode, 'chain');
});

test('AC 14/130: an empty canvas at 0 is sent as a marker step (emptyDraw, no check): 第 1 棒 passes, the next player sees 「（没来得及画）」 with the free-play line', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  await a.tap('home:slow');
  await a.tap('pick:start');
  const id = a.vm().chainId;
  w.advance(61 * 1000);
  await a.settle();
  assert.equal(a.screen(), 'sent');
  assert.equal(a.vm().modState, 'marker');
  assert.equal(a.vm().modText, '时间到，已自动交出（没来得及画）');
  assert.deepEqual(a.vm().mine, { marker: 'emptyDraw' });
  assert.match(a.frame(), /没来得及画/);
  assert.equal(w.srv.db.chains[id].passed, 1, 'a marker counts as a passed 棒');
  const b = await w.player('B', { rules: true, ...G });
  await openCard(w, b, id);
  await b.tap('entry:claim');
  assert.equal(b.screen(), 'describe');
  const src = b.vm().source;
  assert.equal(src.kind, 'marker');
  assert.equal(src.marker, 'emptyDraw');
  assert.equal(src.hint, '上一棒没来得及画，你随便写一句吧');
  assert.match(b.frame(), /（没来得及画）/);
  assert.equal(b.vm().canReport, false, 'a marker cannot be reported');
});

test('AC 14/129/130: a description with >= 2 valid characters is sent at 0; fewer is the emptyText marker; the keyboard closes and the box is inert', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const id = await startChain(a);
  const b = await w.player('B', { rules: true, ...G });
  const c = await w.player('C', { rules: true, ...G });
  await openCard(w, b, id);
  await b.tap('entry:claim');
  assert.equal(b.vm().timer.secLeft, 45);
  b.type('一只猫');
  w.advance(46 * 1000);
  assert.equal(b.log.kb[b.log.kb.length - 1][0], 'hide', 'the keyboard closed at 0');
  await b.settle();
  assert.equal(b.screen(), 'sent');
  assert.equal(b.vm().modState, 'passed');
  assert.deepEqual(b.vm().mine, { text: '一只猫' });
  // the next 棒 (a drawing): C takes it and lets time run out with nothing
  await openCard(w, c, id);
  await c.tap('entry:claim');
  w.advance(61 * 1000);
  await c.settle();
  assert.equal(c.vm().modState, 'marker');
  // the 棒 after that is a describe whose source is the emptyDraw marker; one character is not a send
  await openCard(w, b, id);
  await b.tap('entry:claim');
  assert.equal(b.vm().source.kind, 'marker');
  b.type('猫');
  w.advance(46 * 1000);
  await b.settle();
  assert.equal(b.vm().modState, 'marker');
  assert.deepEqual(b.vm().mine, { marker: 'emptyText' });
  assert.equal(w.srv.db.players[w.id('B')].strikes.length, 0);
});

test('AC 14/133: nothing responds after 0: a tap on 画好了, 撤销 or 放弃 is inert (draw:block) while the send is being retried; the retry goes on every second until the claim is lost', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const id = await startChain(a);
  const b = await w.player('B', { rules: true, ...G });
  await openCard(w, b, id);
  await b.tap('entry:claim');
  b.type('慢吞吞的句子');
  w.srv.offline = true;
  w.advance(46 * 1000); // time is up and the network is gone
  await b.settle();
  assert.equal(b.screen(), 'describe');
  assert.equal(b.vm().status, 'timeUp');
  assert.equal(b.vm().inputLocked, true);
  assert.ok(b.ids().includes('describe:block'));
  const calls0 = w.srv.calls.filter((n) => n === 'submitStep').length;
  w.srv.offline = false;
  w.advance(1100); // the 1 s retry
  await b.settle();
  assert.equal(b.screen(), 'sent', 'the draft was kept and went out with the retry');
  assert.ok(w.srv.calls.filter((n) => n === 'submitStep').length > calls0);
  assert.equal(b.vm().modState, 'passed');
});

test('AC 12: a claim lasts 150 s; a retry after another player claimed is CLAIM_LOST and the work is discarded', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const id = await startChain(a);
  const b = await w.player('B', { rules: true, ...G });
  const c = await w.player('C', { rules: true, ...G });
  await openCard(w, b, id);
  await b.tap('entry:claim');
  b.type('慢吞吞的句子');
  w.srv.rateLimited = ['submitStep']; // every retry of B is refused
  w.advance(46 * 1000);
  await b.settle();
  assert.equal(b.vm().status, 'timeUp');
  w.advance(110 * 1000); // 150 s since the claim: the lock is gone
  await openCard(w, c, id); // C takes the 棒 while B is still retrying
  await c.tap('entry:claim');
  assert.equal(c.screen(), 'describe');
  w.srv.rateLimited = null;
  w.advance(1200);
  await b.settle();
  assert.equal(b.toast(), '超时了，这一棒已被群友接走');
  assert.notEqual(b.screen(), 'describe');
  assert.equal(JSON.parse(b.storage.chuanhua_state_v1).turn, null, 'the discarded work is not kept');
});

test('AC 12: a late send is accepted when nobody else claimed since (lazy expiry)', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const id = await startChain(a);
  const b = await w.player('B', { rules: true, ...G });
  await openCard(w, b, id);
  await b.tap('entry:claim');
  b.type('迟到但没人抢');
  w.srv.offline = true;
  w.advance(120 * 1000);
  await b.settle();
  w.srv.offline = false;
  w.advance(1100);
  await b.settle();
  assert.equal(b.screen(), 'sent');
  assert.equal(b.vm().modState, 'passed');
});

test('AC 132/133: a drawing that is blocked BEFORE time-up stays on the canvas and may be fixed and resent; blocked at the forced send it is not delivered and the 棒 reopens (no second strike)', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  await a.tap('home:slow');
  await a.tap('pick:start');
  a.scribble(13); // the mock: exactly 13 strokes is `risky`
  await a.tap('draw:submit');
  assert.equal(a.screen(), 'draw');
  assert.equal(a.vm().status, 'blocked');
  assert.equal(a.vm().statusText, '这幅画没通过审核，改一改再交');
  assert.equal(a.vm().strokes.length, 13);
  assert.equal(a.vm().inputLocked, false);
  assert.equal(w.srv.db.players[w.id('A')].strikes.length, 1);
  w.advance(61 * 1000); // time is up with the same blocked work on the canvas: it is not sent as content again
  await a.settle();
  assert.equal(w.srv.db.players[w.id('A')].strikes.length, 1, 'no second strike');
  assert.equal(a.screen(), 'sent');
  assert.equal(a.vm().modState, 'marker', 'sent as an empty marker instead');
  // a fresh player whose forced 13-stroke drawing is blocked at the forced send: the 棒 reopens
  const b = await w.player('B', { rules: true, ...G });
  await b.tap('home:slow');
  await b.tap('pick:start');
  const id = b.vm().chainId;
  b.scribble(13);
  w.advance(61 * 1000);
  await b.settle();
  assert.equal(b.screen(), 'sent');
  assert.equal(b.vm().modState, 'blocked');
  assert.equal(b.vm().modText, '这一棒没通过内容审核，没有传出去');
  assert.equal(w.srv.db.chains[id].passed, 0, 'the 棒 reopened');
  assert.equal(b.has('sent:share'), false, 'nothing to share');
});

// -------------------------------------------------------------------------------------------- early reveal, expiry

test('AC 16: the starter reveals early at >= 4 passed 棒 after a confirm; others cannot', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const id = await startChain(a);
  await describeStep(w, b, id, '一个大饼在天上');
  await drawStep(w, a, id);
  await openCard(w, a, id);
  assert.equal(a.vm().canRevealNow, false, '3 passed: no 现在揭晓 yet');
  await describeStep(w, b, id, '外星人在吃披萨');
  await openCard(w, a, id);
  assert.equal(a.vm().state, 'claimable');
  assert.equal(a.vm().canRevealNow, true, 'the starter, 4 passed, nothing active');
  await openCard(w, b, id);
  assert.equal(b.vm().canRevealNow, false, 'not the starter');
  await a.tap('entry:reveal');
  assert.equal(a.view().overlay.dialog.text, '现在揭晓？之后就不能再接了');
  await a.tap('dialog:confirm');
  assert.equal(a.screen(), 'stepthrough');
  assert.equal(a.vm().earlyText, '提前揭晓 · 传了 4/6 棒');
  assert.equal(a.vm().steps.length, 5);
});

test('AC 17/84/86: at 48 h a chain with >= 4 passed reveals ("提前揭晓"), one with fewer ends as 没传完 and shows only own 棒', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const id = await startChain(a);
  await describeStep(w, b, id, '只传了两棒');
  const id2 = await startChain(a);
  await describeStep(w, b, id2, '一个大饼在天上');
  await drawStep(w, a, id2);
  await describeStep(w, b, id2, '外星人在吃披萨');
  await drawStep(w, a, id2);
  w.sweep(49 * 60);
  await openCard(w, a, id2, 'r');
  assert.equal(a.screen(), 'stepthrough');
  assert.equal(a.vm().earlyText, '提前揭晓 · 传了 5/6 棒');
  await openCard(w, b, id);
  assert.equal(b.vm().state, 'expired');
  assert.equal(b.vm().headline, '这条接龙没传完');
  assert.ok(b.has('entry:mine') && b.has('entry:newRoom'), '看我的那一棒 and 开一局 (no 同题再传)');
  assert.ok(!b.ids().some((i) => /sameAgain/.test(i)));
  await b.tap('entry:mine');
  assert.equal(b.screen(), 'mine');
  assert.deepEqual(b.vm().mine.map((m) => m.n), [2]);
});

// ------------------------------------------------------------------------- the async fallback image mode (6.10)

test('AC 13/49/154: with imageMode async (live rooms off) a drawing is pending (审核中) for its author, others see "第 N 棒审核中", the label flips when the verdict arrives (poll every 15 s)', async () => {
  const w = world();
  w.srv.appConfig = { moderation: { imageMode: 'async' } };
  const a = await w.player('A', { rules: true, ...G });
  assert.equal(a.vm().primary.kind, 'chain', 'async forces live rooms off (AC 154)');
  const id = await startChain(a);
  assert.equal(a.vm().modState, 'pending');
  assert.equal(a.vm().modText, '审核中');
  assert.equal(a.vm().nextText, '通过后，群友就能接第 2 棒');
  const b = await w.player('B', { rules: true, ...G });
  await openCard(w, b, id);
  assert.equal(b.vm().state, 'pending');
  assert.match(b.frame(), /第 1 棒审核中/);
  assert.equal(b.has('entry:claim'), false);
  w.srv.server.modSweeper();
  w.advance(61 * 1000);
  w.srv.server.modSweeper();
  w.advance(16 * 1000);
  await a.settle();
  assert.equal(a.vm().modState, 'passed');
  await openCard(w, b, id);
  assert.equal(b.vm().state, 'claimable');
});

test('AC 44/49/46: async mode: a blocked drawing (review) says so to its author only and the 棒 reopens; a drawing without a verdict voids after one re-check with no strike', async () => {
  const w = world();
  w.srv.appConfig = { moderation: { imageMode: 'async' } };
  const a = await w.player('A', { rules: true, ...G });
  const id = await startChain(a, 14); // the mock: 14 strokes -> review
  w.sweep(2);
  w.advance(16 * 1000);
  await a.settle();
  assert.equal(a.vm().modState, 'blocked');
  assert.equal(a.vm().modText, '这一棒没通过内容审核，没有传出去');
  assert.equal(a.has('sent:share'), false, 'nothing to share');
  const b = await w.player('B', { rules: true, ...G });
  await openCard(w, b, id);
  assert.equal(b.vm().state, 'claimable', 'nobody learns of the block: the 棒 simply reopens');
  const c = await w.player('C', { rules: true, ...G });
  await startChain(c, 15); // 15 strokes: no verdict ever
  w.sweep(36);
  w.sweep(36);
  assert.equal(c.vm().modState, 'pending', 'the poll window (10 min) is over: the screen does not know yet');
  await c.show({ scene: 1001, query: {} });
  assert.equal(c.vm().modState, 'void');
  assert.equal(c.vm().modText, '审核超时，这一棒没有传出去，不算你的次数');
  assert.equal(c.ctl.state.me.restriction, null);
});

// ------------------------------------------------------------------------------------------------- moderation states

test('AC 38/39: a blocked text keeps the claim and the text; a busy check shows the busy line; review is busy on the game API and blocked without a strike on the general one (TD-112)', async () => {
  const w = world();
  w.srv.appConfig = { moderation: { textApi: 'general' } };
  const a = await w.player('A', { rules: true, ...G });
  const id = await startChain(a);
  const b = await w.player('B', { rules: true, ...G });
  await openCard(w, b, id);
  await b.tap('entry:claim');
  b.type('测试复审的句子');
  await b.tap('describe:submit');
  assert.equal(b.vm().status, 'blocked');
  assert.equal(b.vm().errorText, '这句话没通过审核，换个说法吧');
  assert.equal(b.vm().text, '测试复审的句子', 'the text is kept for editing');
  await b.tap('describe:input');
  b.type('测试繁忙的句子');
  assert.equal(b.vm().status, 'typing');
  await b.tap('describe:submit');
  assert.equal(b.vm().status, 'busy');
  assert.equal(b.vm().errorText, '审核服务繁忙，请稍后再试');
  assert.equal(b.vm().text, '测试繁忙的句子');
  await b.tap('describe:input');
  b.type('一只猫在开出租车');
  await b.tap('describe:submit');
  assert.equal(b.screen(), 'sent', 'still the same claim');
  assert.equal(b.app.ctl.state.me.restriction, null);
});

test('AC 65/66: two risky verdicts restrict the player (24 h): home shows the copy with the end time, both start buttons are off, 我的接龙 still works', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const id = await startChain(a);
  const b = await w.player('B', { rules: true, ...G });
  await openCard(w, b, id);
  await b.tap('entry:claim');
  b.type('测试违规一');
  await b.tap('describe:submit');
  assert.equal(b.vm().status, 'blocked');
  await b.tap('describe:input');
  b.type('测试违规二');
  await b.tap('describe:submit');
  await b.tap('describe:back');
  await b.tap('dialog:confirm');
  await b.tap('entry:home');
  await b.settle();
  assert.equal(b.vm().sheet, 'warning');
  await b.tap('warning:ok');
  await b.ctl.refreshHome({ quiet: true });
  const home = b.vm();
  assert.ok(home.restriction, 'restriction banner');
  assert.match(home.restriction.text, /^你暂时不能参与接龙（至 \d+月\d+日 \d\d:\d\d）/);
  assert.equal(home.primary.enabled, false);
  assert.equal(b.has('home:primary'), false);
  await b.tap('home:album');
  assert.equal(b.screen(), 'album');
  assert.ok(['ready', 'empty'].includes(b.vm().state));
});

test('AC 65: the first risky verdict shows the one-time 公约 warning sheet on the next open', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const id = await startChain(a);
  const b = await w.player('B', { rules: true, ...G });
  await openCard(w, b, id);
  await b.tap('entry:claim');
  b.type('测试违规');
  await b.tap('describe:submit');
  await b.tap('describe:back');
  await b.tap('dialog:confirm');
  await b.tap('entry:home');
  await b.settle();
  assert.equal(b.vm().sheet, 'warning');
  assert.equal(b.vm().showRulesWarning, true);
  assert.ok(b.vm().warningText.length > 0);
  await b.tap('warning:ok');
  assert.equal(b.vm().sheet, null);
  await b.ctl.refreshHome();
  assert.equal(b.vm().sheet, null, 'read once (TD-13)');
});

test('AC 51: with mock moderation in production the server fails closed and the pick shows an error with 重试', async () => {
  const w = world({ server: { envKind: 'prod', moderationMode: 'mock' } });
  const a = await w.player('A', { rules: true, ...G });
  await a.tap('home:slow');
  assert.equal(a.screen(), 'pick');
  if (a.vm().state === 'ready') await a.tap('pick:start');
  assert.ok(['error', 'offline'].includes(a.vm().state), 'state ' + a.vm().state);
  assert.ok(a.has('pick:retry'), 'every network error state offers 重试 (AC 109)');
  assert.ok(w.srv.alerts.some((x) => /ALERT/.test(x)));
});

// ------------------------------------------------------------------------------------------------------------- reports

test('AC 58-60/74: reporting the previous 棒 during a claim hides it for everyone, releases the claim and reopens the 棒', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const id = await startChain(a);
  await describeStep(w, b, id, '一个大饼在天上');
  const c = await w.player('C', { rules: true, ...G });
  await openCard(w, c, id);
  await c.tap('entry:claim');
  assert.equal(c.screen(), 'draw');
  assert.equal(c.vm().canReport, true);
  await c.tap('draw:report');
  assert.equal(c.view().layers[0].screen, 'report');
  await c.tap('report:reason:abuse');
  await c.tap('report:submit');
  assert.equal(c.screen(), 'entry');
  assert.equal(c.toast(), '上一棒已隐藏，你可以接这一棒');
  assert.equal(c.vm().state, 'claimable');
  assert.equal(c.vm().nextStep, 2, 'the 棒 reopened');
});

test('AC 58/59/82: a reveal 棒 can be reported (not your own, not a marker); the placeholder replaces it for the reporter and others', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const id = await startChain(a);
  await describeStep(w, b, id, '一个大饼在天上');
  await drawStep(w, a, id);
  await describeStep(w, b, id, '外星人在吃披萨');
  await drawStep(w, a, id);
  await describeStep(w, b, id, '企鹅在沙漠晒太阳');
  const steps = b.vm().steps;
  assert.deepEqual(steps.map((s) => s.canReport), [false, true, false, true, false, true, false], 'not on own 棒; the rolled 起点 is not reportable');
  await b.tap('stepthrough:dot:3');
  await b.tap('stepthrough:report');
  await b.tap('report:reason:ad');
  await b.tap('report:submit');
  assert.equal(b.vm().steps[3].placeholder, 'reported');
  await openCard(w, a, id, 'r');
  assert.equal(a.vm().steps[3].placeholder, 'reported');
});

test('AC 80/98: a non-participant who opens the reveal card gets the teaser (passed text only) with 开一局 and 看看本群其他接龙', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const id = await startChain(a, 3);
  await describeStep(w, b, id, '一个大饼在天上');
  await drawStep(w, a, id);
  await describeStep(w, b, id, '外星人在吃披萨');
  await drawStep(w, a, id);
  await describeStep(w, b, id, '企鹅在沙漠晒太阳');
  const d = await w.player('D', { rules: true, ...G });
  await openCard(w, d, id, 'r');
  assert.equal(d.screen(), 'teaser');
  assert.equal(d.vm().lines[0].to, '企鹅在沙漠晒太阳');
  assert.match(d.frame(), /完整接龙仅参与的群友可见/);
  assert.doesNotMatch(d.frame(), /\[画/);
  assert.ok(d.has('teaser:newRoom'));
  await d.tap('teaser:newRoom');
  assert.equal(d.screen(), 'lobby', '开一局 from the teaser starts a room');
});

// --------------------------------------------------------------------------------------------------- resume (edge 21)

test('edge 21: relaunch mid-draw resumes the same claim with the saved strokes and the remaining server time', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  await a.tap('home:slow');
  await a.tap('pick:start');
  a.scribble(3);
  w.advance(20 * 1000);
  const { claimId, chainId } = a.vm();
  a.app.onHide();
  a.kill();
  const a2 = await w.player('A2', { rules: true, as: 'A', storage: a.storage, ...G });
  assert.equal(a2.screen(), 'draw', 'back in the turn');
  assert.equal(a2.vm().claimId, claimId, 'the same claim');
  assert.equal(a2.vm().chainId, chainId);
  assert.equal(a2.vm().strokes.length, 3, 'the strokes survived');
  assert.equal(a2.vm().timer.secLeft, 40, 'the remaining server time');
  assert.equal(a2.vm().gridH, a.vm().gridH);
  await a2.tap('draw:submit');
  assert.equal(a2.screen(), 'sent');
  assert.equal(JSON.parse(a2.storage.chuanhua_state_v1).turn, null, 'saved turn deleted after submit');
});

test('edge 21: relaunch after the claim went to someone else drops the saved work with the CLAIM_LOST message', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const id = await startChain(a);
  const b = await w.player('B', { rules: true, ...G });
  await openCard(w, b, id);
  await b.tap('entry:claim');
  b.type('写到一半的句子');
  b.app.onHide();
  b.kill();
  const c = await w.player('C', { rules: true, ...G });
  w.advance(200 * 1000);
  await openCard(w, c, id);
  await c.tap('entry:claim');
  const b2 = await w.player('B2', { rules: true, as: 'B', storage: b.storage, ...G });
  assert.equal(b2.screen(), 'home');
  assert.equal(b2.toast(), '超时了，这一棒已被群友接走');
  assert.equal(JSON.parse(b2.storage.chuanhua_state_v1).turn, null);
});

test('edge 21: relaunch after an unclaimed expiry carries the saved text to a fresh claim', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const id = await startChain(a);
  const b = await w.player('B', { rules: true, ...G });
  await openCard(w, b, id);
  await b.tap('entry:claim');
  b.type('写到一半的句子');
  const oldClaim = b.vm().claimId;
  b.app.onHide();
  b.kill();
  w.advance(200 * 1000);
  const b2 = await w.player('B2', { rules: true, as: 'B', storage: b.storage, ...G });
  assert.equal(b2.screen(), 'describe');
  assert.equal(b2.vm().text, '写到一半的句子');
  assert.notEqual(b2.vm().claimId, oldClaim, 'a new claim, nobody else had taken the 棒');
});

test('AC 113/edge 20: the Beijing day rolls on the server clock: the allowances refresh on onShow and 今日彩笔 locks again', async () => {
  const w = world({ t: Date.UTC(2026, 10, 3, 15, 50, 0) }); // 23:50 BJT
  const a = await w.player('A', { rules: true, ...G });
  await a.tap('home:settings');
  await a.tap('settings:palette');
  a.app.ads.stubComplete(true);
  await a.settle();
  assert.equal(a.vm().settings.paletteUnlockedToday, true);
  await a.tap('sheet:close');
  for (let i = 0; i < 3; i++) await startChain(a);
  await a.tap('sent:home');
  assert.equal(a.vm().chainStart.freeLeft, 0);
  w.advance(20 * MIN);
  await a.show({ scene: 1001, query: {} });
  await a.settle();
  assert.equal(a.vm().chainStart.freeLeft, 3, 'a new day, 3 free starts again');
  await a.tap('home:settings');
  assert.equal(a.vm().settings.paletteUnlockedToday, false);
});
