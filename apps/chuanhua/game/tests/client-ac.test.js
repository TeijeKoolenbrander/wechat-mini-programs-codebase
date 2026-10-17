'use strict';
// Client-side acceptance criteria of spec 19 (rev. 2), one test per AC (the AC number is in the test name), on the real renderer: the drawing
// tool (21-26, 30, 31, 122-126), text input (33-35), rules sheet (76, 77), the pick (114-120), sharing and group (92-98, 151), subscribe (100),
// ads (101-106, 163), states and retry (109), server-time days (113). The live-room ACs are in client-room.test.js; the server side is in
// mock-server.test.js and the cloud tests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { world } = require('./harness');
const { G, startChain, openCard, describeStep, drawStep, fullChain, openRoom, startRoom, pickAll } = require('./flows');
const R = require('../js/render');
const strokesLib = require('../core/strokes');
const text = require('../core/text');
const blocklist = require('../core/content/blocklist.v1');
const { CONFIG } = require('../core/config');

const MIN = 60e3;

/** 慢慢传 first draw turn */
async function toDraw(a) {
  await a.tap('home:slow');
  await a.tap('pick:start');
  assert.equal(a.screen(), 'draw');
}

// ------------------------------------------------------------------------------------------------ drawing tool

test('AC 21/122-124: the canvas fills the free space (h = round(1024 x canvasH / canvasW), clamped), draws with one finger; a second finger and a touch that starts outside never draw', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  await toDraw(a);
  const r = a.hit('draw:canvas');
  const vm = a.vm();
  const g = R.canvasRectFor(a.app.ctx, a.app.layout, { largeText: false, highContrast: false }, vm.source, false);
  assert.deepEqual([r.x, r.y, r.w, r.h].map(Math.round), [g.x, g.y, g.w, g.h].map(Math.round), 'the canvas is the renderer geometry');
  assert.equal(r.x, 8);
  assert.equal(r.w, 375 - 16, 'the full width minus the 8 pt margins');
  assert.ok(r.h / r.w >= 0.75 && r.h / r.w <= 2, 'inside the clamped aspect');
  assert.equal(vm.gridH, Math.min(2048, Math.max(768, Math.round((1024 * r.h) / r.w))));
  assert.equal(a.ctl.state.turn.rec.h, vm.gridH, 'the recorder (strokes v2) stores h from the frozen geometry');
  const rec = a.ctl.state.turn.rec;
  const f1 = a.down(r.x + r.w * 0.2, r.y + r.h * 0.2);
  a.move(f1, r.x + r.w * 0.4, r.y + r.h * 0.3);
  assert.equal(rec.strokeCount, 1);
  const pts = rec.pointsUsed;
  const t1 = { identifier: f1, clientX: r.x + r.w * 0.4, clientY: r.y + r.h * 0.3 };
  const t2 = { identifier: 99, clientX: r.x + r.w * 0.8, clientY: r.y + r.h * 0.8 };
  a.app.input.touchStart({ touches: [t1, t2], changedTouches: [t2] });
  a.app.input.touchMove({ touches: [t1, t2], changedTouches: [{ ...t2, clientX: r.x + r.w * 0.9 }] });
  a.app.input.touchEnd({ touches: [t1], changedTouches: [{ ...t2 }] });
  assert.equal(rec.strokeCount, 1, 'no stroke from the second finger');
  assert.equal(rec.pointsUsed, pts);
  a.up(f1, r.x + r.w * 0.4, r.y + r.h * 0.3);
  const out = a.down(r.x + r.w / 2, r.y - 30);
  a.move(out, r.x + r.w / 2, r.y + r.h / 2);
  a.move(out, r.x + r.w / 2, r.y + r.h - 5);
  a.up(out, r.x + r.w / 2, r.y + r.h - 5);
  assert.equal(rec.strokeCount, 1, 'started outside: never draws');
  const f3 = a.down(r.x + r.w * 0.5, r.y + r.h * 0.5);
  a.move(f3, r.x + r.w + 80, r.y + r.h * 0.5);
  a.up(f3, r.x + r.w + 80, r.y + r.h * 0.5);
  const last = rec.strokes[rec.strokes.length - 1];
  assert.equal(last.p[last.p.length - 2], 1023, 'clamped to the right edge of the 1024 grid');
});

test('AC 21/30: touch pixels map to the 1024 x h grid through the paper rect the renderer returned (gx = (px - paper.x) / paper.scale); the strokes sent are exactly what was drawn, in strokes v2', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  await toDraw(a);
  a.frame();
  const paper = a.app.hits.paper;
  assert.ok(paper && paper.scale > 0, 'the renderer returns the exact paper rect');
  const h = a.vm().gridH;
  a.stroke([[0, 0], [0.5, 0.5], [1, 1]]);
  const abs = a.ctl.state.turn.rec.strokes[0];
  assert.deepEqual([abs.p[0], abs.p[1]], [0, 0]);
  const mid = abs.p.slice(2, 4);
  assert.ok(Math.abs(mid[0] - 512) <= 3 && Math.abs(mid[1] - h / 2) <= 3, 'the middle of the canvas is the middle of the grid: ' + mid);
  assert.deepEqual(abs.p.slice(-2), [1023, h - 1]);
  await a.tap('draw:submit');
  const step = Object.values(w.srv.db.steps)[0];
  assert.equal(step.strokes.v, 2);
  assert.equal(step.strokes.h, h);
  assert.deepEqual(step.strokes, strokesLib.fromAbsolute(abs ? a.ctl.state.sent.mine.strokes && strokesLib.toAbsolute(a.ctl.state.sent.mine.strokes) : [], h), 'the server holds what the client drew');
  assert.equal(strokesLib.validate(step.strokes).ok, true);
});

test('AC 22: six base colours and one size toggle cycling 细 -> 中 -> 粗; the six 彩笔 colours are locked, there is NO unlock pill on the draw screen, the unlock is in 设置 only and ends at 24:00 BJT (PO-49)', async () => {
  const w = world({ t: Date.UTC(2026, 10, 3, 15, 55, 0) }); // 23:55 BJT
  const a = await w.player('A', { rules: true, ...G });
  await toDraw(a);
  let vm = a.vm();
  assert.equal(vm.palette.length, 12);
  assert.deepEqual(vm.palette.map((p) => p.locked), [false, false, false, false, false, false, true, true, true, true, true, true]);
  for (let i = 0; i < 6; i++) assert.ok(a.has('draw:color:' + i));
  for (let i = 6; i < 12; i++) assert.equal(a.has('draw:color:' + i), false, 'locked swatches are not drawn or tappable');
  assert.deepEqual(a.ids().filter((i) => /palette|Ad$/i.test(i)), []);
  assert.doesNotMatch(a.frame(), /彩笔|看视频/);
  assert.equal(vm.sizeIdx, 1, 'default 中');
  await a.tap('draw:size');
  assert.equal(a.vm().sizeIdx, 2);
  await a.tap('draw:size');
  assert.equal(a.vm().sizeIdx, 0);
  await a.tap('draw:size');
  assert.equal(a.vm().sizeIdx, 1);
  a.ctl.onHit('draw:color:9'); // a forced tap on a locked colour changes nothing
  assert.equal(a.vm().colorIdx, 0);
  await a.tap('draw:back');
  await a.tap('dialog:confirm');
  assert.equal(a.screen(), 'home');
  // unlock: settings -> rewarded video (stub) -> grantReward
  await a.tap('home:settings');
  assert.equal(a.vm().settings.canUnlockPalette, true);
  await a.tap('settings:palette');
  assert.ok(a.app.ads.overlay, 'ad stub overlay');
  w.advance(3000);
  await a.tap('adstub:complete');
  assert.equal(a.vm().settings.paletteUnlockedToday, true);
  await a.tap('sheet:close');
  await toDraw(a);
  vm = a.vm();
  assert.ok(vm.palette.every((p) => !p.locked));
  for (let i = 6; i < 12; i++) assert.ok(a.has('draw:color:' + i), 'the second colour row is drawn once unlocked');
  const canvasUnlocked = a.hit('draw:canvas');
  assert.ok(canvasUnlocked.h < 478, 'the canvas gives 56 pt to the second row (AC 122)');
  await a.tap('draw:color:8');
  a.scribble(1);
  assert.equal(a.ctl.state.turn.rec.strokes[0].c, 8);
  // the unlock survives a relaunch the same day...
  a.app.onHide();
  a.kill();
  const a2 = await w.player('A2', { rules: true, as: 'A', storage: a.storage, ...G });
  assert.equal(a2.screen(), 'draw');
  assert.ok(a2.vm().palette.every((p) => !p.locked));
  await a2.tap('draw:submit');
  await a2.tap('sent:home');
  assert.equal(a2.ctl.state.me.paletteToday, true);
  // ...and is gone after 24:00 BJT (server time)
  w.advance(10 * MIN);
  await a2.show({ scene: 1001, query: {} });
  assert.equal(a2.ctl.state.todayKey(), '20261104');
  await a2.tap('home:settings');
  assert.equal(a2.vm().settings.paletteUnlockedToday, false);
  await a2.tap('sheet:close');
  await toDraw(a2);
  assert.equal(a2.vm().palette.filter((p) => p.locked).length, 6, 'locked again after the Beijing day rolled');
});

test('AC 23: 撤销 removes exactly the last stroke, 清空 asks first, 画好了 is disabled with 0 strokes', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  await toDraw(a);
  assert.equal(a.vm().canSubmit, false);
  assert.equal(a.has('draw:submit'), false, 'the 画好了 button has no hit area with 0 strokes');
  assert.equal(a.vm().canUndo, false);
  a.ctl.onHit('draw:submit'); // forced: ignored
  await a.settle();
  assert.equal(a.screen(), 'draw');
  a.scribble(3);
  assert.equal(a.vm().canSubmit, true);
  const before = a.ctl.state.turn.rec.strokes.map((s) => s.p.slice());
  await a.tap('draw:undo');
  assert.deepEqual(a.ctl.state.turn.rec.strokes.map((s) => s.p), before.slice(0, 2), 'exactly the last stroke is gone');
  assert.equal(a.ctl.state.turn.rec.undoCount, 1);
  await a.tap('draw:clear');
  assert.equal(a.view().overlay.dialog.text, '清空画布？');
  assert.equal(a.ctl.state.turn.rec.strokeCount, 2, 'nothing happens before the confirm');
  await a.tap('dialog:cancel');
  assert.equal(a.ctl.state.turn.rec.strokeCount, 2);
  await a.tap('draw:clear');
  await a.tap('dialog:confirm');
  assert.equal(a.ctl.state.turn.rec.strokeCount, 0);
  assert.equal(a.vm().canSubmit, false);
});

test('AC 26: at 4,000 points new strokes are blocked and the status strip says "画得太细啦，先交吧"; the drawing can still be submitted', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  await toDraw(a);
  const rec = a.ctl.state.turn.rec;
  const dense = (row) => {
    const pts = [];
    let x = 0;
    let dir = 1;
    let y = row * 0.1;
    for (let i = 0; i < 700; i++) {
      pts.push([x, y]);
      x += dir * 0.0045;
      if (x > 1 || x < 0) {
        dir = -dir;
        x = Math.max(0, Math.min(1, x));
        y = Math.min(1, y + 0.006);
      }
    }
    return pts;
  };
  let guard = 0;
  while (rec.pointsUsed < 4000 && guard++ < 24) a.stroke(dense(guard % 8));
  assert.equal(rec.pointsUsed, 4000);
  const vm = a.vm();
  assert.equal(vm.pointsUsed, 4000);
  assert.equal(vm.pointsMax, 4000);
  assert.equal(vm.limitText, '画得太细啦，先交吧');
  assert.match(a.frame(), /画得太细啦，先交吧/);
  const n = rec.strokeCount;
  a.stroke([[0.1, 0.1], [0.5, 0.5]]);
  assert.equal(rec.strokeCount, n, 'no new stroke after the cap');
  assert.equal(vm.canSubmit, true);
  await a.tap('draw:submit');
  assert.equal(a.screen(), 'sent');
});

test('TD-56: the ink budget stops the player on the device (own copy) and a conforming drawing always validates; core and mock agree', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  await toDraw(a);
  const rec = a.ctl.state.turn.rec;
  let n = 0;
  while (!rec.pathFull && n++ < 400) a.stroke(n % 2 ? [[0, 0], [1, 1]] : [[1, 0], [0, 1]]);
  assert.equal(rec.pathFull, true);
  assert.ok(rec.pathUsed <= CONFIG.strokes.maxPathUnits - CONFIG.strokes.pathMargin + 1);
  assert.equal(a.vm().limitText, '线条太多啦，先交吧');
  const before = rec.strokeCount;
  a.stroke([[0.2, 0.2], [0.8, 0.2]]);
  assert.equal(rec.strokeCount, before, 'no new stroke');
  assert.equal(strokesLib.validate(rec.drawing()).ok, true, 'what the device allowed always passes the shared check');
  await a.tap('draw:undo');
  assert.equal(rec.pathFull, false, 'undo gives ink back');
  const hostile = { v: 1, s: Array.from({ length: 200 }, () => [0, 0, 0, 0, 1023, 1023, -1023, -1023]) };
  assert.equal(strokesLib.validate(hostile).reason, 'pathLength');
  await a.tap('draw:submit');
  w.srv.call('agreeRules', { version: CONFIG.rulesVersion }, w.id('Z'));
  const roll = w.srv.call('rollPrompts', {}, w.id('Z'));
  const c = w.srv.call('createChain', { rollId: roll.rollId, promptId: roll.prompts[0].id }, w.id('Z'));
  assert.equal(w.srv.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: hostile }, w.id('Z')).reason, 'pathLength');
});

test('AC 30/125: drawings reach the next player as the same strokes that were passed (the client never redraws or edits them)', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const id = await startChain(a, 4);
  const mine = a.ctl.state.sent.mine.strokes;
  await openCard(w, b, id);
  await b.tap('entry:claim');
  assert.deepEqual(b.vm().source, { kind: 'draw', strokes: mine }, 'describe screen: the previous drawing, exactly');
  assert.equal(b.vm().source.strokes.v, 2);
});

// ---------------------------------------------------------------------------------------------------- text input

test('AC 33: descriptions take 2-16 code points and custom prompts 2-12; emoji and disallowed symbols are dropped on input', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const id = await startChain(a);
  await openCard(w, b, id);
  await b.tap('entry:claim');
  b.type('一只猫😀🎉@#$%');
  assert.equal(b.vm().text, '一只猫', 'emoji and symbols dropped');
  assert.equal(b.vm().shake, true, 'the counter shakes on a dropped character');
  assert.equal(b.vm().count, '3/16');
  b.type('一二三四五六七八九十甲乙丙丁戊己庚辛');
  assert.equal(text.count(b.vm().text), 16, 'clipped at 16');
  assert.equal(b.vm().count, '16/16');
  b.type('猫');
  assert.equal(b.vm().canSubmit, false, '1 character is too short');
  assert.equal(b.has('describe:submit'), false);
  b.type('小猫');
  assert.equal(b.vm().canSubmit, true);
  await b.tap('describe:back');
  await b.tap('dialog:confirm');
  const c = await w.player('C', { rules: true, ...G });
  await c.tap('home:slow');
  await c.tap('pick:custom');
  c.type('一二三四五六七八九十甲乙丙丁😀');
  assert.equal(text.count(c.vm().custom.text), 12);
  assert.equal(c.vm().custom.count, '12/12');
  c.type('哈');
  assert.equal(c.vm().canStart, false);
});

test('AC 34: digits (5+, full-width and 一二三 forms), URLs and contact words are rejected locally with "换个说法吧" and NO API call', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const id = await startChain(a);
  await openCard(w, b, id);
  await b.tap('entry:claim');
  const submits = () => w.srv.calls.filter((n) => n === 'submitStep').length;
  const n0 = submits();
  for (const bad of ['打12345给我', '一二三四五六', '１２３４５', 'www.abc.com', '加我微信聊', 'qq号在这', '来电话吧', 'vx聊聊']) {
    await b.tap('describe:input');
    b.type(bad);
    await b.tap('describe:submit');
    assert.equal(b.vm().status, 'blocked', bad);
    assert.equal(b.vm().errorText, '换个说法吧', bad);
  }
  assert.equal(submits(), n0, 'no API call for any of them');
  const c = await w.player('C', { rules: true, ...G });
  await c.tap('home:slow');
  await c.tap('pick:custom');
  c.type('加我微信');
  const created = () => w.srv.calls.filter((n) => n === 'createChain').length;
  const c0 = created();
  await c.tap('pick:customOk');
  assert.equal(c.vm().custom.error, '换个说法吧');
  assert.equal(created(), c0);
});

test('AC 35: text on the local blocklist is rejected locally: no API call, no strike', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const id = await startChain(a);
  const term = blocklist.zh.insult[0];
  assert.ok(text.blocklistHit(term));
  await openCard(w, b, id);
  await b.tap('entry:claim');
  b.type('你这个' + term);
  const before = w.srv.calls.filter((n) => n === 'submitStep').length;
  await b.tap('describe:submit');
  assert.equal(b.vm().status, 'blocked');
  assert.equal(b.vm().errorText, '换个说法吧');
  assert.equal(w.srv.calls.filter((n) => n === 'submitStep').length, before);
  assert.deepEqual(w.srv.db.players[w.id('B')].strikes || [], []);
});

// ------------------------------------------------------------------------------------------------------ the pick

test('AC 114-117, 121: 慢慢传 pick: 3 rolled prompts from 3 categories, up to five 换一批 (3 new each, none from an earlier set; AC 116, 164-167) and then a greyed-out button, 自己出题; the client has no bank and no daily prompts', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  assert.equal(a.vm().groupLine.show, false);
  assert.equal(JSON.stringify(a.vm()).includes('daily'), false, 'home carries no 今日起点 or national count');
  await a.tap('home:slow');
  let vm = a.vm();
  assert.equal(vm.mode, 'chain');
  assert.equal(vm.subtitle, '你来画第 1 棒');
  assert.equal(vm.startLabel, '开始画 (60 秒)');
  assert.equal(vm.timer, undefined, 'no timer in 慢慢传');
  assert.equal(vm.canBack, true);
  assert.ok(a.has('pick:back'));
  assert.equal(vm.prompts.length, 3);
  assert.equal(new Set(vm.prompts.map((p) => p.id[0])).size, 3, '3 different categories');
  assert.equal(vm.selectedId, vm.prompts[0].id);
  const shown = [vm.prompts.map((p) => p.id)];
  const rectNow = () => (a.frame(), a.app.hits.rects.reroll);
  const rect0 = JSON.stringify(rectNow());
  assert.equal(vm.rerollLeft, 5);
  assert.equal(vm.rerollLabel, '换一批（剩5次）');
  assert.equal(vm.rerollTappable, true);
  // AC 164: 5 rerolls succeed, each with a new rollId, 3 categories and no prompt from any earlier set of this pick
  const rollIds = new Set([vm.rollId]);
  for (let n = 1; n <= 5; n++) {
    await a.tap('pick:reroll');
    vm = a.vm();
    assert.equal(vm.state, 'ready');
    assert.equal(vm.prompts.length, 3);
    assert.equal(new Set(vm.prompts.map((p) => p.id[0])).size, 3, '3 different categories (AC 116)');
    const earlier = shown.flat();
    assert.equal(vm.prompts.filter((p) => earlier.includes(p.id)).length, 0, 'none from an earlier set of this pick (AC 116)');
    shown.push(vm.prompts.map((p) => p.id));
    assert.ok(!rollIds.has(vm.rollId), 'a new rollId each time');
    rollIds.add(vm.rollId);
    assert.equal(vm.rerollLeft, 5 - n);
    assert.equal(vm.rerollDisabled, n === 5);
    assert.equal(vm.rerollLabel, n === 5 ? '换一批机会已用完' : '换一批（剩' + (5 - n) + '次）');
    assert.equal(a.has('pick:reroll'), n < 5, 'a hit id only while chances are left');
    assert.equal(JSON.stringify(rectNow()), rect0, 'the button never moves or resizes (AC 166)');
  }
  assert.equal(shown.flat().length, 18);
  assert.equal(new Set(shown.flat()).size, 18, '18 distinct prompts over the 6 sets (AC 164)');
  assert.equal(vm.rerollTappable, false);
  assert.ok(a.has('pick:custom') && a.has('pick:start'), 'the rest of the screen keeps working');
  // AC 167: a tap on the greyed button sends no request, no event and changes nothing
  const calls = [];
  const real = a.app.api.rollPrompts;
  a.app.api.rollPrompts = (d) => (calls.push(d), real(d));
  const still = () => JSON.stringify(Object.assign({}, a.vm(), { t: 0 }));
  await a.app.analytics.flush();
  const nEvents = () => w.srv.db.events.filter((e) => e.openid !== 'server').length;
  const events0 = nEvents();
  const before = still();
  const r0 = rectNow();
  const roll0 = JSON.stringify(w.srv.db.players[w.id('A')].roll);
  for (let i = 0; i < 10; i++) {
    a.tapAt(r0.x + r0.w / 2, r0.y + r0.h / 2);
    a.ctl.onHit('pick:reroll');
  }
  await a.settle();
  await a.app.analytics.flush();
  assert.equal(nEvents(), events0, 'no analytics event');
  assert.equal(calls.length, 0, 'no rollPrompts request');
  assert.equal(still(), before, 'no state change');
  assert.equal(JSON.stringify(w.srv.db.players[w.id('A')].roll), roll0);
  const rolls = w.srv.db.events.filter((e) => e.name === 'prompt_roll' && e.props.reroll === true);
  assert.deepEqual(rolls.map((e) => e.props.rerollNo), [1, 2, 3, 4, 5], 'one event per reroll, numbered');
  a.app.api.rollPrompts = real;
  // AC 165: the server refuses a 6th with REROLL_LIMIT, rollId and rerollLeft 0, and changes nothing
  const snap = JSON.stringify(w.srv.db.players[w.id('A')]);
  const six = w.srv.call('rollPrompts', { reroll: true, rollId: vm.rollId }, w.id('A'));
  assert.deepEqual([six.ok, six.code, six.rollId, six.rerollLeft], [false, 'REROLL_LIMIT', vm.rollId, 0]);
  assert.equal(JSON.stringify(w.srv.db.players[w.id('A')]), snap, 'nothing written');
  assert.equal(w.srv.call('rollPrompts', { reroll: true, rollId: 'stale' }, w.id('A')).code, 'BAD_REQUEST', 'a stale rollId');
  assert.equal(w.srv.call('rollPrompts', {}, w.id('A')).rerollLeft, 0, 'reopening shows the count as it is');
  // back returns to home; a prompt that is not in the current roll is refused by the server (AC 119)
  assert.equal(w.srv.call('createChain', { rollId: vm.rollId, promptId: 'A0001' }, w.id('A')).code, 'BAD_REQUEST');
  await a.tap('pick:back');
  assert.equal(a.screen(), 'home');
  // no client file contains the bank
  const fs = require('node:fs');
  const path = require('node:path');
  const v2 = require('../core/content/prompts.v2');
  const sample = v2.prompts.filter((_, i) => i % 200 === 0).map((p) => p.text).filter((t) => t.length >= 5);
  for (const f of ['controller.js', 'vm.js', 'ctl-pick.js', 'app.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
    assert.equal(sample.filter((t) => src.includes(t)).length, 0, f);
    assert.doesNotMatch(src, /core\/(daily|prompts)/, f);
  }
});

test('AC 76: the 公约 appears before the first start and the first claim, has no pre-ticked box, 先看看 leaves the game browsable, agreeing stores the version', async () => {
  const w = world();
  const a = await w.player('A', { ...G }); // rules NOT agreed
  await a.tap('home:slow');
  assert.equal(a.vm().sheet, 'rules');
  assert.deepEqual(Object.keys(a.vm().rules).filter((k) => /agree|check|ticked|selected/i.test(k)), [], 'no pre-ticked box in the view model');
  assert.equal(a.vm().rules.pendingAction, 'start');
  await a.tap('rules:decline');
  assert.equal(a.vm().sheet, null);
  assert.equal(a.screen(), 'home');
  await a.tap('home:album');
  assert.equal(a.screen(), 'album');
  await a.tap('album:back');
  await a.tap('home:groupList');
  assert.equal(a.screen(), 'group');
  await a.tap('group:back');
  assert.equal(w.srv.db.players[w.id('A')].rulesVersion, 0, 'declining stores nothing');
  await a.tap('home:slow');
  await a.tap('rules:agree');
  assert.equal(w.srv.db.players[w.id('A')].rulesVersion, CONFIG.rulesVersion, 'rulesVersion 2 (rev. 2 is a material change)');
  assert.equal(a.screen(), 'pick', 'agreeing continues the tapped action');
  await a.tap('pick:back');
  const id = await startChain(a);
  const b = await w.player('B', { ...G });
  await openCard(w, b, id);
  assert.equal(b.vm().state, 'rulesRequired');
  await b.tap('entry:claim');
  assert.equal(b.view().layers[0].screen, 'rules');
  assert.equal(b.view().layers[0].vm.pendingAction, 'claim');
  await b.tap('rules:agree');
  assert.equal(b.screen(), 'describe', 'agreed: the claim goes on');
});

test('AC 77: there is no public list, search, feed or stranger matching: 本群接龙 needs a group context and asks only for that group', async () => {
  const w = world();
  const a = await w.player('A', { rules: true });
  await a.tap('home:groupList');
  assert.equal(a.vm().state, 'noGroup');
  assert.equal(w.srv.calls.includes('getGroupChains'), false, 'no group, no list call');
  assert.match(a.frame(), /点开接龙卡片/);
  const names = a.app.api.NAMES.join(',');
  assert.doesNotMatch(names, /search|feed|public|match|nearby/i);
});

// ---------------------------------------------------------------------------------------------- reveal (慢慢传)

test('AC 31/157-159: a 慢慢传 reveal is the step-through of ONE chain (final step first); each drawing replays in 2.5 s (+-0.2) whatever its stroke count, first when shown and on 重播, a tap completes it; sentences appear at once', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const id = await startChain(a, 1);
  await describeStep(w, b, id, '一个点');
  await drawStep(w, a, id, 30);
  await describeStep(w, b, id, '很多线');
  await drawStep(w, a, id, 60);
  await describeStep(w, b, id, '最后一句');
  assert.equal(b.screen(), 'stepthrough', 'the 6th text reveals at once');
  let vm = b.vm();
  assert.equal(vm.mode, 'chain');
  assert.equal(vm.header, '接龙揭晓 · 2 位群友');
  assert.equal(vm.steps.length, 7);
  assert.equal(vm.index, 6, 'opens on the final step: a sentence, at once');
  assert.equal(vm.playT, 1);
  assert.equal(vm.backLabel, '返回');
  assert.equal(vm.canShare, true);
  assert.equal(vm.steps[6].text, '最后一句');
  assert.match(vm.steps[6].label, /第 6 棒 · 猜 · 最后一棒/);
  assert.equal(vm.steps[6].mine, true, 'B wrote the 6th');
  const dur = async (idx) => {
    await b.tap('stepthrough:dot:' + idx);
    assert.equal(b.vm().index, idx);
    let first = null;
    let done = null;
    for (let ms = 0; ms < 30000; ms += 50) {
      const p = b.vm().playT;
      if (first === null && p > 0) first = ms;
      if (done === null && p >= 1) done = ms;
      if (done !== null) break;
      w.advance(50);
    }
    return { first: first === null ? 0 : first, done };
  };
  const d1 = await dur(1);
  assert.ok(Math.abs(d1.done - d1.first - 2500) <= 200 || Math.abs(d1.done - 2500) <= 200, '1 stroke: ' + JSON.stringify(d1));
  const d3 = await dur(3);
  assert.ok(Math.abs(d3.done - 2500) <= 200, '30 strokes: ' + JSON.stringify(d3));
  const d5 = await dur(5);
  assert.ok(Math.abs(d5.done - 2500) <= 200, '60 strokes: ' + JSON.stringify(d5));
  // half way a heavy drawing shows some, not all, of its strokes (stroke by stroke)
  const polys = strokesLib.toPolylines(b.vm().steps[5].strokes, 300);
  const half = strokesLib.replayPolylines(polys, 0.5);
  assert.ok(half.length > 0 && half.length < polys.length);
  // 重播 starts over, a tap completes it at once and does not navigate (the whole note is stepthrough:skip while it plays)
  assert.equal(b.vm().playT, 1);
  await b.tap('stepthrough:replay');
  assert.ok(b.vm().playT < 1);
  assert.ok(b.has('stepthrough:skip') && !b.has('stepthrough:prevHalf'));
  await b.tap('stepthrough:skip');
  assert.equal(b.vm().playT, 1);
  assert.equal(b.vm().index, 5);
  // going back to a drawing already shown does not replay it on its own
  await b.tap('stepthrough:next');
  await b.tap('stepthrough:prev');
  assert.equal(b.vm().playT, 1);
  // 笑: one per participant per 棒, toggles, nothing is ranked; the order never depends on it
  await b.tap('stepthrough:dot:2');
  assert.equal(b.vm().steps[2].canLaugh, true);
  await b.tap('stepthrough:laugh');
  assert.deepEqual([b.vm().steps[2].laughs, b.vm().steps[2].myLaugh], [1, true]);
  await b.tap('stepthrough:laugh');
  assert.deepEqual([b.vm().steps[2].laughs, b.vm().steps[2].myLaugh], [0, false]);
  await b.tap('stepthrough:laugh');
  await openCard(w, a, id, 'r');
  await a.tap('stepthrough:dot:2');
  await a.tap('stepthrough:laugh');
  assert.equal(a.vm().steps[2].laughs, 2, 'a second participant adds one');
  assert.deepEqual(a.vm().steps.map((s) => s.n), [0, 1, 2, 3, 4, 5, 6]);
  assert.doesNotMatch(JSON.stringify(a.vm()), /best|rank|最佳|排名|award/i);
  // at the 起点 a single chain ends with 看完了 (no next chain)
  await a.tap('stepthrough:dot:0');
  assert.equal(a.vm().endAction, 'done');
  assert.equal(a.vm().steps[0].text, w.srv.db.chains[id].promptText);
  await a.tap('stepthrough:done');
  assert.equal(a.screen(), 'home');
});

test('AC 82: hidden and deleted 棒 are placeholders in the step-through and cannot be laughed at or reported again', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const id = await fullChain(w, a, b);
  w.srv.call('report', { chainId: id, step: 3, reason: 'abuse' }, w.id('B'));
  await openCard(w, a, id, 'r');
  const vm = a.vm();
  assert.equal(vm.steps[3].placeholder, 'reported');
  assert.equal(vm.steps[3].canLaugh, false);
  assert.equal(vm.steps[3].canReport, false);
  await a.tap('stepthrough:dot:3');
  assert.match(a.frame(), /该内容已被举报隐藏/);
  assert.ok(!a.has('stepthrough:laugh') && !a.has('stepthrough:report'));
  // the author deletes a 棒
  w.srv.call('deleteMyStep', { chainId: id, step: 4 }, w.id('B'));
  await a.tap('stepthrough:back');
  await openCard(w, a, id, 'r');
  assert.equal(a.vm().steps[4].placeholder, 'deleted');
  await a.tap('stepthrough:dot:4');
  assert.match(a.frame(), /作者已删除这一棒/);
});

test('TD-57: a repeat teaser report is DUP_REPORT (one report per player per chain teaser); the report sheet reflects it', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const id = await fullChain(w, a, b);
  const d = await w.player('D', { rules: true, ...G });
  await openCard(w, d, id, 'r'); // joins the group, sees the teaser
  assert.equal(d.screen(), 'teaser');
  assert.equal(d.vm().kind, 'chain');
  assert.equal(d.vm().title, '一条接龙揭晓了');
  assert.deepEqual(d.vm().lines, [{ from: w.srv.db.chains[id].promptText, to: '企鹅在沙漠晒太阳' }]);
  assert.ok(d.has('teaser:newRoom') && d.has('teaser:group'));
  assert.ok(!d.ids().some((i) => /sameAgain/.test(i)), '同题再传 is gone (AC 121)');
  await d.tap('teaser:report');
  assert.ok(d.view().layers.some((l) => l.screen === 'report'));
  await d.tap('report:reason:abuse');
  await d.tap('report:submit');
  assert.equal(d.vm().state, 'ready');
  w.advance(1500);
  d.app.ctl.tick(d.now());
  assert.equal(d.view().layers.length, 0, 'the sheet closes after the toast');
  await d.tap('teaser:report');
  await d.tap('report:reason:abuse');
  await d.tap('report:submit');
  assert.equal(d.view().layers.find((l) => l.screen === 'report').vm.state, 'dup');
});

test('AC 90: the streak shows only from 2 days, and grants nothing (no hit area, no allowance)', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  await startChain(a);
  await a.tap('sent:home');
  assert.equal(a.vm().streakText, null, 'a streak of 1 is not shown');
  const p = w.srv.db.players[w.id('A')];
  p.curStreak = 4;
  p.lastStepDate = a.ctl.state.dayKey;
  const free = a.vm().chainStart.freeLeft;
  await a.ctl.refreshHome({ quiet: true });
  assert.equal(a.vm().streakText, '连续接龙 4 天');
  assert.equal(a.vm().chainStart.freeLeft, free, 'nothing granted');
  assert.equal(a.ids().filter((i) => /streak/i.test(i)).length, 0);
});

// -------------------------------------------------------------------------------------------- sharing and group

test('AC 92/93/94: every share starts from a tap or the capsule menu; nothing is shared by the flows; queries are m=/k=/r= ids only; sharing grants nothing', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const id = await fullChain(w, a, b);
  assert.equal(a.log.shares.length + b.log.shares.length, 0, 'a whole chain was played and nothing was shared automatically');
  const id2 = await startChain(a);
  assert.equal(a.log.shares.length, 0);
  await a.tap('sent:share');
  assert.equal(a.log.shares.length, 1);
  assert.equal(a.log.shares[0].query, 'k=' + id2);
  assert.equal(a.log.shares[0].title, '第 2 棒等你接，看看你能猜出什么？');
  assert.match(a.log.shares[0].imageUrl, /^tmp:\/\/|^assets\//);
  assert.equal(a.menuShare().query, 'k=' + id2);
  // a 慢慢传 reveal share from the step-through
  await openCard(w, b, id, 'r');
  await b.tap('stepthrough:share');
  const s = b.log.shares[b.log.shares.length - 1];
  assert.equal(s.query, 'r=' + id);
  assert.equal(s.title, '「' + w.srv.db.chains[id].promptText + '」传了 6 棒，变成了「企鹅在沙漠晒太阳」');
  assert.equal(b.menuShare().query, 'r=' + id);
  // a room invite from the lobby, and the capsule menu in a lobby
  const c = await w.player('C', { rules: true, ...G });
  await c.tap('home:primary');
  assert.equal(c.log.shares.length, 0);
  const roomId = c.ctl.state.room.roomId;
  await c.tap('lobby:invite');
  assert.equal(c.log.shares.length, 1);
  assert.equal(c.log.shares[0].query, 'm=' + roomId);
  assert.equal(c.log.shares[0].title, '来一局传画接龙吗？画得丑没关系');
  assert.equal(c.menuShare().query, 'm=' + roomId);
  // nothing was granted by sharing
  await a.tap('sent:home');
  const day = w.srv.db.players[w.id('A')].day;
  assert.deepEqual([day.starts, day.adStarts, day.palette], [2, 0, false]);
  assert.equal(a.vm().chainStart.freeLeft, 1);
  for (const sh of [...a.log.shares, ...b.log.shares, ...c.log.shares]) assert.match(sh.query, /^[mkr]=[A-Za-z0-9]{10}$/);
});

test('AC 95: the share card render input has no drawing; the invite cards have no prompt or 棒 text (the render hook receives ids/counts only)', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const cards = [];
  a.app.share.cardRenderer = async (card) => (cards.push(card), 'tmp://x.png');
  await startChain(a);
  await a.tap('sent:share');
  assert.deepEqual(Object.keys(cards[0]).sort(), ['kind', 'length', 'passed']);
  assert.equal(cards[0].kind, 'invite');
  await a.tap('sent:home');
  await a.tap('home:primary');
  await a.tap('lobby:invite');
  assert.deepEqual(cards[1], { kind: 'roomInvite' });
});

test('AC 96: a card with a shareTicket joins the group (getGroupEnterInfo + joinGroup) and enables the claim; without a ticket there is no group context and the claim is refused', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const id = await startChain(a);
  const c = await w.player('C', { rules: true, ...G });
  w.advance(4000);
  await c.show({ scene: 1044, query: { k: id } }); // no shareTicket
  assert.equal(c.log.calls.includes('getGroupEnterInfo'), false, 'no ticket: the group API is not called');
  assert.equal(c.vm().state, 'wrongGroup');
  assert.match(c.frame(), /接龙只能在发起的群里接力/);
  assert.equal(c.has('entry:claim'), false);
  c.ctl.onHit('entry:claim');
  await c.settle();
  assert.equal(c.screen(), 'entry', 'a forced claim is refused too');
  w.advance(4000);
  await c.show({ scene: 1044, query: { k: id }, shareTicket: 'T1' });
  assert.ok(c.log.calls.includes('getGroupEnterInfo'));
  assert.ok(w.srv.calls.includes('joinGroup'));
  assert.equal(c.vm().state, 'claimable');
  assert.equal(c.log.calls.some((x) => /getShareInfo/.test(x)), false);
  const d = await w.player('D', { rules: true, group: 'g1', groupEnterFail: 65206 });
  w.advance(4000);
  await d.show({ scene: 1044, query: { k: id }, shareTicket: 'T2' });
  assert.equal(d.ctl.state.group.status, 'failed');
  assert.equal(d.vm().state, 'wrongGroup');
});

test('AC 97: a card opened during a 慢慢传 turn does not interrupt it: a toast now, the entry after the turn', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const id1 = await startChain(a);
  const id2 = await startChain(b);
  await openCard(w, a, id2);
  await a.tap('entry:claim');
  assert.equal(a.screen(), 'describe');
  a.type('正在写的句子');
  await openCard(w, a, id1);
  assert.equal(a.screen(), 'describe', 'the turn goes on');
  assert.equal(a.vm().text, '正在写的句子');
  assert.equal(a.toast(), '群里有新消息，交完这一棒再看');
  await a.tap('describe:submit');
  assert.equal(a.screen(), 'sent');
  await a.tap('sent:home');
  assert.equal(a.screen(), 'entry', 'routed after the turn');
  assert.equal(a.ctl.state.entry.chainId, id1);
});

test('AC 98: 本群接龙 shows rooms, waiting and revealed chains of this group with aggregate stats and no per-person data; rooms open the room entry', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  await fullChain(w, a, b);
  const open = await startChain(a);
  const other = await w.player('Z', { rules: true, group: 'g2' });
  await openCard(w, b, open);
  const c = await w.player('C', { rules: true, ...G });
  await openCard(w, c, open); // C joins the group context first
  // a lobby in the group
  const host = await w.player('H', { rules: true, ...G });
  await openCard(w, host, open);
  await host.tap('entry:home');
  await host.tap('home:primary');
  const roomId = host.ctl.state.room.roomId;
  await b.tap('entry:group');
  const vm = b.vm();
  assert.equal(vm.state, 'ready');
  assert.equal(vm.statsText, '本群一共玩了 1 局 · 画了 3 幅画');
  assert.equal(vm.waiting.length, 1);
  assert.equal(vm.revealed.length, 1);
  assert.equal(vm.revealed[0].kind, 'chain');
  assert.equal(vm.revealed[0].member, true);
  assert.deepEqual(vm.rooms, [{ roomId, line: '1 人已加入 · 等待开始', joinable: true }]);
  assert.match(vm.waiting[0].line, /^第 2 棒 · 猜一句 · 已传 1\/6$/);
  assert.doesNotMatch(JSON.stringify(vm), /openid|author|starter|nick|userId|选手|第一名/i);
  await other.show({ scene: 1044, query: { k: open }, shareTicket: 'z' });
  await other.tap('entry:home').catch(() => {});
  await other.tap('home:groupList');
  assert.equal(other.vm().state, 'empty');
  assert.ok(b.has('group:room:' + roomId));
  await b.tap('group:room:' + roomId);
  assert.equal(b.screen(), 'roomEntry');
  assert.equal(b.vm().state, 'joinable');
  await b.tap('roomEntry:home');
  await b.tap('home:groupList');
  await b.tap('group:item:' + open);
  assert.equal(b.screen(), 'entry');
});

// ------------------------------------------------------------------------------------------------- subscribe

test('AC 100: the subscribe offer appears only with a configured template, only on a participant screen, only asks on the tap, and never again for that chain after a refusal', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  await startChain(a);
  assert.equal(a.has('sent:subscribe'), false);
  w.srv.appConfig = { subscribe: { tmplId: 'TMPL-1' } };
  await a.tap('sent:home');
  await a.ctl.refreshHome({ quiet: true });
  const id = await startChain(a);
  assert.equal(a.vm().subscribe.state, 'offer');
  assert.equal(a.log.calls.filter((x) => x.startsWith('requestSubscribeMessage')).length, 0, 'never at launch or on screen entry');
  a.wx.requestSubscribeMessage = (o) => (a.log.calls.push('requestSubscribeMessage'), o.success({ [o.tmplIds[0]]: 'reject' }));
  await a.tap('sent:subscribe');
  assert.equal(a.log.calls.filter((x) => x === 'requestSubscribeMessage').length, 1);
  assert.equal(a.vm().subscribe.state, 'declined');
  assert.equal(a.has('sent:subscribe'), false, 'not offered again for this chain');
  await openCard(w, a, id);
  assert.notEqual(a.vm().subscribe.state, 'offer');
  assert.equal(Object.keys(w.srv.db.subGrants).length, 0);
});

test('AC 100: accepting stores exactly one grant and the reveal notice is sent once (held at night)', async () => {
  const w = world();
  w.srv.appConfig = { subscribe: { tmplId: 'TMPL-1' } };
  const a = await w.player('A', { rules: true, ...G });
  const id = await startChain(a);
  assert.equal(a.vm().subscribe.state, 'offer');
  await a.tap('sent:subscribe');
  assert.equal(a.vm().subscribe.state, 'granted');
  await a.tap('sent:subscribe').catch(() => {});
  assert.equal(Object.keys(w.srv.db.subGrants).length, 1);
  assert.ok(w.srv.db.subGrants[id + '_' + w.id('A')]);
  await a.tap('sent:home');
  await a.tap('home:settings');
  assert.match(a.frame(), /揭晓提醒/);
});

// ------------------------------------------------------------------------------------------------------- ads

test('AC 101: 再开一条 is offered only after the 3 free starts (the 慢慢传 start sheet), grants only on a completed video, and stops at 2 a day', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  for (let i = 0; i < 3; i++) await startChain(a);
  await a.tap('sent:home');
  assert.equal(a.vm().chainStart.freeLeft, 0);
  assert.equal(a.vm().chainStart.adLeft, 2);
  assert.equal(a.has('startLimit:ad'), false, 'not before the tap');
  await a.tap('home:slow');
  assert.equal(a.vm().sheet, 'startLimit');
  assert.equal(a.vm().chainStart.sheet, 'limit');
  assert.ok(a.has('startLimit:ad'));
  assert.match(a.frame(), /今天的 3 条已开完/);
  await a.tap('startLimit:ad');
  assert.ok(a.app.ads.overlay);
  await a.tap('adstub:skip');
  assert.equal(a.vm().chainStart.freeLeft, 0);
  assert.equal(a.toast(), '完整观看才能获得');
  await a.tap('startLimit:ad');
  w.advance(3000);
  await a.tap('adstub:complete');
  assert.equal(a.vm().chainStart.freeLeft, 1);
  assert.equal(a.vm().chainStart.adLeft, 1);
  assert.equal(a.vm().sheet, null, 'the sheet closes once the start is granted');
  await startChain(a);
  await a.tap('sent:home');
  await a.tap('home:slow');
  await a.tap('startLimit:ad');
  w.advance(3000);
  await a.tap('adstub:complete');
  assert.equal(a.vm().chainStart.adLeft, 0);
  await startChain(a);
  await a.tap('sent:home');
  await a.tap('home:slow');
  assert.equal(a.has('startLimit:ad'), false, 'the daily cap of 2 is reached');
  assert.match(a.frame(), /明天再来开新的吧/);
  await a.tap('sheet:close');
  assert.equal(a.vm().sheet, null);
});

test('AC 102: with no ad available the reward is granted once per day per placement ("暂无广告，本次免费"), a second failure grants nothing', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  a.app.ads.stubSim.rewardedError = 1004;
  for (let i = 0; i < 3; i++) await startChain(a);
  await a.tap('sent:home');
  await a.tap('home:slow');
  await a.tap('startLimit:ad');
  assert.equal(a.toast(), '暂无广告，本次免费');
  assert.equal(a.vm().chainStart.freeLeft, 1);
  await startChain(a);
  await a.tap('sent:home');
  await a.tap('home:slow');
  await a.tap('startLimit:ad');
  assert.equal(a.toast(), '暂无广告，请稍后再试');
  assert.equal(a.vm().chainStart.freeLeft, 0, 'the second failure grants nothing');
  await a.tap('sheet:close');
  await a.tap('home:settings');
  await a.tap('settings:palette');
  assert.equal(a.toast(), '暂无广告，本次免费');
  assert.equal(a.vm().settings.paletteUnlockedToday, true);
});

test('AC 103: a real rewarded instance (not the stub) is created with disableFallbackSharePage: true', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G, build: { stubAds: false, adUnits: { rewarded: 'adunit-r', interstitial: 'adunit-i', banner: '' } } });
  for (let i = 0; i < 3; i++) await startChain(a);
  await a.tap('sent:home');
  await a.tap('home:slow');
  a.ctl.onHit('startLimit:ad');
  await a.settle();
  const made = a.log.ads.filter((x) => x[0] === 'rewarded');
  assert.equal(made.length, 1);
  assert.equal(made[0][1].disableFallbackSharePage, true);
  assert.equal(made[0][1].adUnitId, 'adunit-r');
});

test('AC 104: an interstitial shows only when leaving a reveal (the overview or a 慢慢传 step-through), from the 3rd lifetime reveal, 180 s apart, 3 a day; never on pick, draw, describe, entry, lobby, round wait or between steps', async () => {
  const w = world();
  const b = await w.player('B', { rules: true, ...G });
  const overlays = [];
  const watch = (p) => (p.app.ads.overlay ? overlays.push([p.name, p.screen(), p.app.ads.overlay.kind]) : null);
  for (let i = 0; i < 4; i++) {
    const starter = await w.player('S' + i, { rules: true, ...G });
    await fullChain(w, starter, b);
    watch(b);
    await b.tap('stepthrough:dot:2'); // moving between the steps never shows an ad
    watch(b);
    await b.tap('stepthrough:next');
    watch(b);
    const lifetime = b.app.store.state.lifetimeReveals;
    assert.equal(b.vm().interstitialDue, lifetime >= 3 && i >= 2, 'due flag ' + lifetime);
    await b.tap('stepthrough:back');
    if (lifetime < 3) assert.equal(b.app.ads.overlay, null, 'not before the 3rd reveal: ' + lifetime);
    else if (lifetime === 3) {
      assert.ok(b.app.ads.overlay, 'the 3rd reveal');
      assert.equal(b.app.ads.overlay.kind, 'interstitial');
      await b.tap('adstub:skip');
    }
    w.advance(61 * MIN);
  }
  assert.deepEqual(overlays, [], 'no ad on any other screen: ' + JSON.stringify(overlays));
  // a room's overview counts as a reveal and leaving it triggers the same rule
  const w2 = world();
  const [x, y, z] = [await w2.player('X', { rules: true, ...G }), await w2.player('Y', { rules: true, ...G }), await w2.player('Z', { rules: true, ...G })];
  x.app.store.state.lifetimeReveals = 3;
  await openRoom(w2, x, [y, z]);
  await startRoom(w2, x, [x, y, z]);
  await pickAll(w2, [x, y, z]);
  assert.equal(x.app.ads.overlay, null, 'no ad in the lobby, the pick or the round');
  for (const p of [x, y, z]) {
    p.scribble(1);
    await p.tap('draw:submit');
  }
  await w2.run(3000, 250);
  for (const p of [x, y, z]) {
    p.type('一只猫');
    await p.tap('describe:submit');
  }
  await w2.run(3000, 250);
  assert.equal(x.screen(), 'overview');
  assert.equal(x.vm().interstitialDue, true);
  assert.equal(x.app.ads.overlay, null, 'not while the overview is open');
  await x.tap('overview:back');
  assert.equal(x.screen(), 'home');
  assert.ok(x.app.ads.overlay && x.app.ads.overlay.kind === 'interstitial', 'leaving the overview shows it');
});

test('AC 105: the banner is off by default and appears only on 本群接龙/我的接龙 in ready/empty with the config on', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  await a.tap('home:album');
  assert.equal(a.vm().state, 'empty');
  assert.equal(a.vm().banner.show, false, 'default off');
  await a.tap('album:back');
  w.srv.appConfig = { ads: { banner: { enabled: true, adUnitId: 'adunit-b' } } };
  await a.ctl.refreshHome({ quiet: true });
  await a.tap('home:album');
  assert.equal(a.vm().banner.show, true);
  assert.ok(a.vm().banner.reservedHeight > 0);
  await a.tap('album:back');
  assert.equal('banner' in a.vm(), false);
  w.srv.offline = true;
  await a.tap('home:album');
  assert.equal(a.vm().banner.show, false, 'offline list state: no banner');
  w.srv.offline = false;
  await a.tap('album:back');
  await a.tap('home:groupList');
  assert.equal(a.vm().state, 'noGroup');
  assert.equal(a.vm().banner.show, false, 'noGroup explainer: no banner');
});

// ------------------------------------------------------------------------------------------ states and time

test('AC 109: every network error state offers 重试 (or reconnects by itself in a live room)', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const retry = (p, id) => assert.ok(p.has(id), `${p.screen()} offers ${id}`);
  w.srv.offline = true;
  await a.ctl.refreshHome();
  assert.equal(a.vm().state, 'offline');
  retry(a, 'home:retry');
  assert.equal(a.vm().primary.enabled, false);
  assert.equal(a.has('home:primary'), false, 'both start buttons are off');
  await a.tap('home:album');
  assert.equal(a.vm().state, 'error', 'no cached list to show: the error state, which offers 重试');
  retry(a, 'album:retry');
  await a.tap('album:back');
  w.srv.offline = false;
  await a.ctl.refreshHome();
  const id = await startChain(a);
  w.srv.offline = true;
  await openCard(w, a, id);
  assert.equal(a.vm().state, 'offline');
  retry(a, 'entry:retry');
  w.srv.offline = false;
  const b = await w.player('B', { rules: true, ...G });
  const done = await fullChain(w, await w.player('Q', { rules: true, ...G }), b);
  await b.tap('stepthrough:back');
  w.srv.offline = true;
  await openCard(w, b, done, 'r');
  assert.equal(b.vm().state, 'offline');
  retry(b, 'stepthrough:retry');
  w.srv.offline = false;
  await b.tap('stepthrough:retry');
  assert.equal(b.vm().state, 'ready');
  await b.tap('stepthrough:back');
  // pick offline
  await b.tap('home:slow');
  w.srv.offline = true;
  await b.tap('pick:start');
  assert.equal(b.vm().state, 'offline');
  retry(b, 'pick:retry');
  w.srv.offline = false;
  // room entry offline
  const c = await w.player('C', { rules: true, ...G });
  w.srv.offline = true;
  w.advance(4000);
  await c.show({ scene: 1044, query: { m: 'ABCDEFGHJK' }, shareTicket: 'tk' });
  assert.equal(c.vm().state, 'offline');
  retry(c, 'roomEntry:retry');
  w.srv.offline = false;
  await c.tap('roomEntry:retry');
  assert.equal(c.vm().state, 'notFound');
});

test('AC 113: the day roll follows the SERVER clock, not the device clock', async () => {
  const w = world({ t: Date.UTC(2026, 10, 3, 15, 50, 0) }); // server: 23:50 BJT on 11-03
  const skewed = await w.player('S', { rules: true, ...G, skew: 5 * 3600e3 }); // the device thinks it is 04:50 on 11-04
  assert.equal(skewed.ctl.state.todayKey(), '20261103', 'server date, not the device date');
  w.advance(20 * MIN);
  await skewed.show({ scene: 1001, query: {} });
  assert.equal(skewed.ctl.state.dayKey, '20261104');
  const back = await w.player('R', { rules: true, ...G, skew: -30 * 3600e3 });
  assert.equal(back.ctl.state.todayKey(), '20261104');
});

test('AC 10 (client): the entry screen never shows the prompt or any 棒 content, in every state', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const id = await startChain(a);
  const promptText = w.srv.db.chains[id].promptText;
  for (let i = 0; i < 2; i++) {
    await openCard(w, b, id);
    const vm = b.vm();
    const json = JSON.stringify(vm);
    assert.doesNotMatch(json, /"strokes"|"text"|"promptText"/);
    assert.equal(json.includes(promptText), false);
    assert.doesNotMatch(b.frame(), new RegExp(promptText));
  }
  const inRoom = await w.player('C', { rules: true, ...G });
  await openCard(w, inRoom, id);
  assert.equal(inRoom.vm().state, 'claimable');
});

test('AC 119-120 / 3A.9: a player seated in a playing room cannot take a 慢慢传 棒 ("你正在一局里，先玩完再来接" + 回到这一局), and a claim holder cannot create a room', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const x = await w.player('X', { rules: true, ...G });
  const y = await w.player('Y', { rules: true, ...G });
  const z = await w.player('Z', { rules: true, ...G });
  const chain = await startChain(x);
  await openCard(w, a, chain); // A is in the group of the chain
  await a.tap('entry:home');
  const roomId = await openRoom(w, a, [y, z]);
  await startRoom(w, a, [a, y, z]);
  // a card of the chain opened by A (seated): the card is deferred (a live round is never interrupted)
  w.advance(4000);
  await a.show({ scene: 1044, query: { k: chain }, shareTicket: 'tkq' });
  assert.equal(a.toast(), '群里有新消息，交完这一棒再看');
  assert.equal(a.screen(), 'pick');
  // the server answers inRoom to a claim; the chain entry says so and offers 回到这一局 (the entry opened by hand, as after the game)
  const ref = a.ctl.state.group.groupRef;
  assert.equal(w.srv.call('claimStep', { chainId: chain, groupRef: ref }, w.id('A')).code, 'IN_ROOM');
  await a.ctl.X.chain.openEntry(chain, { from: 'home' });
  assert.equal(a.vm().state, 'inRoom');
  assert.equal(a.vm().headline, '你正在一局里，先玩完再来接');
  assert.ok(a.has('entry:room') && !a.has('entry:claim'));
  await a.tap('entry:room');
  assert.equal(a.screen(), 'pick', 'back in the room');
  assert.equal(a.ctl.state.room.roomId, roomId);
  // and the other way: a claim holder cannot start a room (IN_CLAIM)
  const k = await w.player('K', { rules: true, ...G });
  await openCard(w, k, chain);
  await k.tap('entry:claim').catch(() => {});
  assert.equal(w.srv.call('createRoom', {}, w.id('K')).code, 'IN_CLAIM');
});
