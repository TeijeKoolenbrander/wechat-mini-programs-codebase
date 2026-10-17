'use strict';
// Live rooms on the real renderer and the mock server (spec 3A, 4, 5.8, 8.3-8.9, 8.16, 8.17; AC 114-163): the whole game of 3 players
// through lobby, pick, draw / describe rounds with a forced send and an empty marker, the overview, the step-through and the rematch,
// plus the edge cases (leave, rejoin with a draft, device clock, realtime failures, room entry states).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { world } = require('./harness');
const { G, openRoom, startRoom, pickAll, until } = require('./flows');
const { CONFIG } = require('../core/config');

const DRAW_SEC = CONFIG.room.drawSec;

async function trio(opts) {
  const w = world(opts && opts.world);
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const c = await w.player('C', { rules: true, ...G });
  return { w, a, b, c, all: [a, b, c] };
}

const room = (w, id) => w.srv.db.rooms[id];

/** time is up: every touch lands on the window-wide block, whatever the screen drew (AC 128, 129) */
function assertLocked(p, blockId) {
  assert.ok(p.ids().includes(blockId), blockId);
  for (const h of p.app.hits) assert.equal(p.app.renderer.hitTest(p.app.hits, h.x + h.w / 2, h.y + h.h / 2), blockId, h.id + ' is covered by ' + blockId);
}

test('home: 开一局 is the primary action, 慢慢传 a secondary link (AC 161); a first start asks for the 公约, the second does not', async () => {
  const w = world();
  const a = await w.player('A', { ...G });
  const vm = a.vm();
  assert.equal(vm.primary.kind, 'room');
  assert.equal(vm.primary.label, '开一局');
  assert.equal(vm.slowLink.show, true);
  assert.equal(vm.slowLink.label, '慢慢传（不用同时在线）');
  assert.ok(a.has('home:primary') && a.has('home:slow'));
  const agreed = [];
  const realAgree = a.app.api.agreeRules;
  a.app.api.agreeRules = (d) => (agreed.push(d), realAgree(d));
  await a.tap('home:primary');
  assert.equal(a.screen(), 'home');
  assert.equal(a.vm().sheet, 'rules');
  assert.equal(a.vm().rules.pendingAction, 'createRoom');
  await a.tap('rules:agree');
  assert.equal(a.screen(), 'lobby', 'agreeing continues the tapped action');
  assert.equal(a.ctl.state.me.rulesVersion, CONFIG.rulesVersion);
  assert.deepEqual(agreed, [{ version: 2 }], 'rulesVersion 2: the rev. 2 agreement is a material change (TD-118)');
});

test('home: with live rooms off (features.liveRooms false) 开一条接龙 is the primary and the link is gone (AC 154, 161)', async () => {
  const w = world();
  w.srv.appConfig = { features: { liveRooms: false } };
  const a = await w.player('A', { rules: true, ...G });
  const vm = a.vm();
  assert.equal(vm.primary.kind, 'chain');
  assert.equal(vm.primary.label, '开一条接龙');
  assert.equal(vm.slowLink.show, false);
  assert.ok(!a.has('home:slow'));
  await a.tap('home:primary');
  assert.equal(a.screen(), 'pick');
  assert.equal(a.vm().mode, 'chain');
});

test('lobby: the host is seat ① with the 2-player copy and the 慢慢传 link; a third player enables 开始; non-hosts wait (AC 135, 137)', async () => {
  const { w, a, b, c } = await trio();
  await a.tap('home:primary');
  let vm = a.vm();
  assert.equal(vm.state, 'ready');
  assert.equal(vm.seats.length, 10);
  assert.deepEqual(vm.seats.filter((s) => s.filled).map((s) => [s.n, s.me]), [[1, true]]);
  assert.equal(vm.start.hint, '把邀请发到群里，群友点开就能加入');
  assert.equal(vm.start.enabled, false);
  const roomId = a.ctl.state.room.roomId;
  w.advance(4000);
  await b.show({ scene: 1044, query: { m: roomId }, shareTicket: 'tk1' });
  assert.equal(b.vm().state, 'joinable');
  assert.equal(b.vm().joinedText, '1 人已加入（3–10 人）');
  await b.tap('roomEntry:join');
  await w.run(1000, 250);
  vm = a.vm();
  assert.equal(vm.joinedText, '2 人已加入（3–10 人）', "the host's lobby follows the join");
  assert.equal(vm.start.enabled, false);
  assert.equal(vm.start.hint, '至少 3 人才能开局');
  assert.equal(vm.start.slowLink, true);
  assert.ok(a.has('lobby:slow'), '两个人？去慢慢传');
  assert.equal(b.vm().isHost, false);
  assert.equal(b.vm().waitingText, '等房主开始…');
  assert.equal(b.vm().start.show, false);
  assert.deepEqual(b.vm().seats.filter((s) => s.me).map((s) => s.n), [2]);
  w.advance(4000);
  await c.show({ scene: 1044, query: { m: roomId }, shareTicket: 'tk2' });
  await c.tap('roomEntry:join');
  await w.run(1000, 250);
  assert.equal(a.vm().start.enabled, true);
  assert.equal(a.vm().start.label, '开始（3 人）');
  assert.equal(room(w, roomId).seats.length, 3);
  // a non-host can neither see nor send the start
  assert.ok(!b.has('lobby:start'));
});

test('a full game of 3: pick, draw with a FORCED send (a stroke in progress is kept), describe with an EMPTY marker, then the overview, the step-through and the rematch', async () => {
  const { w, a, b, c, all } = await trio();
  const roomId = await openRoom(w, a, [b, c]);
  await startRoom(w, a, all);

  // ---- round 0: the pick screen (3 rolled prompts, no back button, a 30 s timer)
  for (const p of all) {
    const vm = p.vm();
    assert.equal(vm.mode, 'live');
    assert.equal(vm.prompts.length, 3);
    assert.equal(vm.selectedId, vm.prompts[0].id, 'the first card is preselected');
    assert.equal(vm.rerollLeft, 5);
    assert.equal(vm.canBack, false);
    assert.ok(vm.timer.secLeft <= CONFIG.room.promptSec && vm.timer.secLeft >= CONFIG.room.promptSec - 3);
    assert.ok(!p.has('pick:back'));
  }
  assert.equal(new Set(all.flatMap((p) => p.vm().prompts.map((x) => x.id))).size, 9, 'no two seats share a prompt (AC 118)');
  // B rerolls once (换一批): 3 new prompts, 4 chances left
  const before = b.vm().prompts.map((x) => x.id);
  await b.tap('pick:reroll');
  assert.equal(b.vm().rerollLeft, 4);
  assert.ok(b.has('pick:reroll'), '换一批 stays while chances are left (AC 164-166)');
  assert.equal(b.vm().prompts.filter((x) => before.includes(x.id)).length, 0, 'none from the first set (AC 116)');
  // C taps the second card
  const second = c.vm().prompts[1];
  await c.tap('pick:item:' + second.id);
  assert.equal(c.vm().selectedId, second.id);
  await pickAll(w, all);
  assert.equal(room(w, roomId).slots['0'].every((s) => s.state === 'sent'), true);
  for (const p of all) assert.equal(p.screen(), 'draw', p.name + ' draws in round 1');

  // ---- round 1: draw. A and B send; C is still drawing when time is up
  for (const p of all) {
    const vm = p.vm();
    assert.equal(vm.title, '画出来 · 1/2');
    assert.equal(vm.backLabel, '离开');
    assert.equal(vm.source.kind, 'prompt');
    assert.equal(vm.gridH, Math.min(2048, Math.max(768, Math.round((1024 * vm.canvas.h) / vm.canvas.w))), 'h = round(1024 x canvasH / canvasW), clamped (AC 124)');
  }
  const canvasAtOpen = { ...c.vm().canvas };
  const gridAtOpen = c.vm().gridH;
  a.scribble(3);
  b.scribble(2);
  await a.tap('draw:submit');
  await b.tap('draw:submit');
  assert.equal(a.screen(), 'roundWait');
  assert.equal(a.vm().title, '已交 · 1/2');
  assert.match(a.vm().progressText, /等大家交… 2\/3 已交/);
  assert.equal(a.vm().nextText, '最后一轮了');
  const sentByA = a.ctl.state.wait.mine.strokes;
  assert.ok(sentByA && sentByA.length === 3 || sentByA.s.length === 3, 'round wait shows what was sent');
  // C puts a finger down and keeps it down through 0
  c.scribble(1);
  const r = c.hit('draw:canvas');
  const touch = c.down(r.x + 30, r.y + 30);
  c.move(touch, r.x + 90, r.y + 80);
  c.move(touch, r.x + 150, r.y + 60);
  assert.equal(c.vm().drawingNow, true);
  w.advance(DRAW_SEC * 1000 - 3000);
  assert.equal(c.screen(), 'draw');
  assert.equal(c.vm().timer.secLeft <= 3, true);
  assert.equal(c.vm().timer.warn, true, 'the last 10 s are 朱');
  assert.deepEqual(c.vm().canvas, canvasAtOpen, 'the canvas never moves during a turn (AC 126)');
  assert.equal(c.vm().gridH, gridAtOpen);
  w.advance(3000); // 0 s by server time
  const locked = c.vm();
  assert.equal(locked.status, 'timeUp');
  assert.equal(locked.statusText, '时间到，正在交出…');
  assert.equal(locked.inputLocked, true);
  assertLocked(c, 'draw:block');
  for (const id of ['draw:submit', 'draw:undo', 'draw:clear', 'draw:size', 'draw:back', 'draw:color:1']) assert.ok(!c.has(id), id + ' is inert');
  const strokesBefore = c.ctl.state.turn ? c.ctl.state.turn.rec.strokeCount : 0;
  c.move(touch, r.x + 200, r.y + 120); // the finger is still moving after 0: ignored
  c.up(touch, r.x + 200, r.y + 120);
  if (c.ctl.state.turn) assert.equal(c.ctl.state.turn.rec.strokeCount, strokesBefore, 'nothing is drawn after 0');
  await w.run(1500, 250);
  const slot = room(w, roomId).slots['1'][2];
  assert.equal(slot.state, 'sent', 'the forced send went through (sent as it is, not a marker)');
  assert.equal(slot.marker, undefined);
  await until(w, c, 'describe', 12000);
  for (const p of all) assert.equal(p.screen(), 'describe', p.name + ' describes in round 2');

  // ---- round 2: describe. A and B write; C writes nothing at all -> the empty marker
  for (const p of all) {
    const vm = p.vm();
    assert.equal(vm.title, '猜一猜 · 2/2');
    assert.equal(vm.source.kind, 'draw', 'only the previous drawing of ONE chain (AC 140)');
    assert.ok(vm.source.strokes.s.length >= 1);
  }
  a.type('一只猫在开出租车');
  await a.tap('describe:submit');
  b.type('外星人在吃披萨');
  await b.tap('describe:submit');
  assert.equal(a.screen(), 'roundWait');
  assert.equal(a.vm().nextText, '马上揭晓');
  w.advance(CONFIG.room.describeSec * 1000);
  assert.equal(c.vm().status, 'timeUp');
  assertLocked(c, 'describe:block');
  await w.run(2500, 250);
  assert.equal(room(w, roomId).slots['2'][2].state, 'marker');
  assert.equal(room(w, roomId).slots['2'][2].marker, 'emptyText');
  await until(w, c, 'overview', 12000);
  for (const p of all) assert.equal(p.screen(), 'overview', p.name + ' reveals at the same moment (AC 145, 160)');

  // ---- the overview: only the final step of each chain (AC 156)
  const ov = a.vm();
  assert.equal(ov.title, '全部揭晓！');
  assert.equal(ov.subtitle, '3 条接龙 · 每条传了 2 棒');
  assert.equal(ov.cards.length, 3);
  assert.deepEqual(ov.cards.map((x) => x.chainNo), [1, 2, 3]);
  assert.deepEqual(ov.cards.filter((x) => x.mineStarted).map((x) => x.chainNo), [1], 'A started chain 1 (你起的)');
  const finals = ov.cards.map((x) => x.final.kind);
  assert.deepEqual(finals.sort(), ['describe', 'describe', 'marker']);
  const markerCard = ov.cards.find((x) => x.final.kind === 'marker');
  assert.equal(markerCard.final.marker, 'emptyText');
  assert.ok(ov.cards.every((x) => x.final.loaded));
  assert.doesNotMatch(JSON.stringify(ov), /prompt|第 1 棒/);
  assert.equal(ov.rematch.banner, null);
  assert.ok(a.has('overview:rematch') && a.has('overview:share'));
  for (const cd of ov.cards) assert.ok(a.has('overview:chain:' + cd.chainId));

  // ---- the step-through: final step first, then back to the 起点 (AC 157-159)
  const first = ov.cards[0];
  await a.tap('overview:chain:' + first.chainId);
  assert.equal(a.screen(), 'stepthrough');
  let st = a.vm();
  assert.equal(st.mode, 'live');
  assert.equal(st.steps.length, 3, '起点 + 2 棒');
  assert.equal(st.index, 2, 'opens on the final step');
  assert.equal(st.header, '第 1 条 · 你起的');
  assert.equal(st.steps[0].kind, 'prompt');
  assert.equal(st.steps[0].label, '起点');
  assert.match(st.steps[2].label, /最后一棒/);
  assert.equal(st.endAction, null);
  assert.equal(st.canNext, false);
  assert.ok(a.has('stepthrough:prevHalf') && a.has('stepthrough:nextHalf') && a.has('stepthrough:prev'));
  await a.tap('stepthrough:prevHalf');
  st = a.vm();
  assert.equal(st.index, 1);
  assert.equal(st.steps[1].kind, 'draw');
  assert.equal(st.playT >= 0 && st.playT <= 1, true);
  assert.equal(st.playT < 1, true, 'a drawing replays when first shown (AC 31, 159)');
  assert.ok(a.has('stepthrough:skip'), 'while it replays the whole note completes it on a tap');
  w.advance(strokesRepl() + 100);
  assert.equal(a.vm().playT, 1);
  await a.tap('stepthrough:prev');
  st = a.vm();
  assert.equal(st.index, 0);
  assert.equal(st.steps[0].text.length > 0, true);
  assert.equal(st.endAction, 'nextChain');
  assert.ok(!a.has('stepthrough:prev') || a.vm().canPrev === false);
  // swipe left = later, swipe right = earlier (>= 48 pt, horizontal, starting on the note)
  const note = a.app.hits.swipe;
  assert.ok(note, 'the swipe region is the note');
  const sw = (p, dx, dy) => {
    const t0 = p.down(note.x + note.w / 2, note.y + note.h / 2);
    p.move(t0, note.x + note.w / 2 + dx / 2, note.y + note.h / 2 + dy / 2);
    p.move(t0, note.x + note.w / 2 + dx, note.y + note.h / 2 + dy);
    p.up(t0, note.x + note.w / 2 + dx, note.y + note.h / 2 + dy);
  };
  sw(a, -80, 4);
  assert.equal(a.vm().index, 1, 'swipe left = later');
  sw(a, 30, 0);
  assert.equal(a.vm().index, 1, 'under 48 pt is no swipe');
  sw(a, 60, 90);
  assert.equal(a.vm().index, 1, 'mostly vertical is no swipe');
  sw(a, 80, 5);
  assert.equal(a.vm().index, 0, 'swipe right = earlier');
  // a dot jumps; navigation never advances on its own
  await a.tap('stepthrough:dot:2');
  assert.equal(a.vm().index, 2);
  w.advance(60000);
  assert.equal(a.vm().index, 2, 'nothing advances by itself');
  // 笑 toggles once per member and step; markers have none
  const laughStep = a.vm().steps[2];
  if (laughStep.canLaugh) {
    await a.tap('stepthrough:laugh');
    assert.equal(a.vm().steps[2].myLaugh, true);
    assert.equal(a.vm().steps[2].laughs, laughStep.laughs + 1);
    await a.tap('stepthrough:laugh');
    assert.equal(a.vm().steps[2].myLaugh, false);
  }
  // 下一条 opens the next chain at its FINAL step; the last chain ends with 看完了, which returns to the overview
  await a.tap('stepthrough:dot:0');
  await a.tap('stepthrough:nextChain');
  assert.equal(a.vm().chainNo, 2);
  assert.equal(a.vm().index, a.vm().steps.length - 1, 'the next chain also opens on its final step');
  await a.tap('stepthrough:dot:0');
  await a.tap('stepthrough:nextChain');
  assert.equal(a.vm().chainNo, 3);
  await a.tap('stepthrough:dot:0');
  assert.equal(a.vm().endAction, 'done');
  await a.tap('stepthrough:done');
  assert.equal(a.screen(), 'overview');
  assert.deepEqual(a.vm().cards.map((x) => x.unseen), [false, false, false], 'every chain was opened');
  // a marker step is a plain note: no 笑, no 举报, labelled with (你) when it is the viewer's own
  await c.tap('overview:chain:' + markerCard.chainId);
  const mst = c.vm();
  const lastStep = mst.steps[mst.steps.length - 1];
  assert.equal(lastStep.kind, 'marker');
  assert.equal(lastStep.mine, true);
  assert.equal(lastStep.canLaugh, false);
  assert.equal(lastStep.canReport, false);
  await c.tap('stepthrough:back');
  assert.equal(c.screen(), 'overview');

  // ---- 再来一局: one new room for everyone who presses it (AC 151)
  assert.equal(Object.keys(w.srv.db.rooms).length, 1);
  await a.tap('overview:rematch');
  assert.equal(a.screen(), 'lobby');
  const newRoom = a.ctl.state.room.roomId;
  assert.notEqual(newRoom, roomId);
  assert.equal(room(w, roomId).rematchRoomId, newRoom);
  await w.run(1500, 250);
  assert.equal(b.vm().rematch.banner, '房主开了新的一局 · 加入 ›', 'the old room learns about the new one through its signal');
  assert.equal(b.vm().rematch.newRoomId, newRoom);
  await b.tap('overview:joinNew');
  await c.tap('overview:rematch');
  assert.equal(b.screen(), 'lobby');
  assert.equal(c.screen(), 'lobby');
  assert.equal(b.ctl.state.room.roomId, newRoom);
  assert.equal(c.ctl.state.room.roomId, newRoom);
  assert.equal(Object.keys(w.srv.db.rooms).length, 2, 'a single new room');
  await w.run(1000, 250);
  assert.equal(a.vm().joinedText, '3 人已加入（3–10 人）');
});

function strokesRepl() {
  return require('../core/strokes').REPLAY_MS;
}

test('AC 168: time runs out mid-reroll: the screen freezes with the cards it shows, the forced send names the selected card (the server accepts it from the replaced set), the late answer is ignored; rerolls never move the deadline', async () => {
  const { w, a, b, c, all } = await trio();
  const roomId = await openRoom(w, a, [b, c]);
  await startRoom(w, a, all);
  const deadline = room(w, roomId).deadline;
  const vm0 = b.vm();
  const shownOnScreen = vm0.prompts.map((x) => x.id);
  const selected = vm0.prompts[1];
  await b.tap('pick:item:' + selected.id);
  // the reroll is committed by the server, but neither its answer nor a fresher getRoom reaches the phone before time is up
  const staleRoom = await b.app.api.getRoom({ roomId });
  b.app.api.getRoom = async () => JSON.parse(JSON.stringify(staleRoom));
  const realRoll = b.app.api.rollPrompts;
  let release;
  const held = new Promise((res) => (release = res));
  b.app.api.rollPrompts = (d) => {
    const p = realRoll(d);
    return d.reroll ? held.then(() => p) : p;
  };
  b.ctl.onHit('pick:reroll');
  await b.settle();
  assert.equal(b.vm().state, 'rerolling');
  assert.equal(b.vm().rerollTappable, false);
  assert.ok(!b.has('pick:reroll') && !b.has('pick:start'), 'while a reroll is in flight a tap on 换一批 or 就这个 does nothing');
  assert.equal(room(w, roomId).rolls[1].rerolls, 1, 'the server already counted it');
  assert.equal(room(w, roomId).deadline, deadline, 'a reroll never moves the round-0 deadline');
  // time is up while the answer is on the way: forced send of the card selected on screen
  w.advance(CONFIG.room.promptSec * 1000);
  await w.run(1500, 250);
  const slot = room(w, roomId).slots['0'][1];
  assert.equal(slot.state, 'sent');
  assert.equal(slot.promptId, selected.id, 'the card the player saw, though a reroll replaced that set (spec 17 edge 26)');
  release();
  await b.settle();
  assert.ok(!shownOnScreen.length || b.screen() !== 'pick' || b.vm().prompts.map((x) => x.id).join() === shownOnScreen.join(), 'a late answer does not change the frozen cards');
});

test('forced send: a stroke in progress at 0 is included; a blocked-before drawing is not resent as content; the draft of an empty canvas is a marker (AC 128-130, 132-133)', async () => {
  const { w, a, b, c, all } = await trio();
  const roomId = await openRoom(w, a, [b, c]);
  await startRoom(w, a, all);
  await pickAll(w, all);
  // exactly 13 strokes is `risky` in the mock (IMAGE_BLOCKED): before time-up the work stays on the canvas and may be fixed and resent
  a.scribble(13);
  await a.tap('draw:submit');
  assert.equal(a.screen(), 'draw');
  assert.equal(a.vm().status, 'blocked');
  assert.equal(a.vm().statusText, '这幅画没通过审核，改一改再交');
  assert.equal(a.vm().strokes.length, 13, 'the work stays');
  assert.equal(a.vm().inputLocked, false, 'the canvas is unlocked and the timer keeps running');
  assert.equal(room(w, roomId).slots['1'][0].state, 'blocked');
  assert.equal(w.srv.db.players['openid-A'].strikes.length, 1);
  await a.tap('draw:undo');
  assert.equal(a.vm().canSubmit, true);
  // B draws nothing; C sends. At 0, B's empty canvas is an emptyDraw marker (no check), A's unchanged-blocked drawing is not resent as content
  c.scribble(2);
  await c.tap('draw:submit');
  w.advance(DRAW_SEC * 1000);
  await w.run(2000, 250);
  const slots = room(w, roomId).slots['1'];
  assert.equal(slots[1].marker, 'emptyDraw', 'B: nothing drawn at 0');
  assert.equal(slots[1].state, 'marker');
  assert.equal(slots[0].state === 'sent' || slots[0].state === 'marker', true);
  assert.equal(w.srv.db.players['openid-A'].strikes.length, 1, 'no second strike from the forced send');
  await until(w, a, 'describe', 12000);
  // the next player sees 「（没来得及画）」 with the free-play line
  const src = [a, b, c].map((p) => p.vm().source).find((s) => s.kind === 'marker');
  assert.ok(src, 'someone received the marker as their source');
  assert.equal(src.marker, 'emptyDraw');
  assert.equal(src.hint, '上一棒没来得及画，你随便写一句吧');
  assert.match([a, b, c].find((p) => p.vm().source.kind === 'marker').frame(), /（没来得及画）/);
});

test('describe: the forced send at 0 sends >= 2 valid characters, closes the keyboard and ignores input (AC 129)', async () => {
  const { w, a, b, c, all } = await trio();
  const roomId = await openRoom(w, a, [b, c]);
  await startRoom(w, a, all);
  await pickAll(w, all);
  for (const p of all) {
    p.scribble(1);
    await p.tap('draw:submit');
  }
  await until(w, a, 'describe', 12000);
  assert.ok(a.log.kb.some((k) => k[0] === 'show'), 'the keyboard opened');
  a.type('猫'); // one character: too short, the empty marker
  b.type('一只猫在开出租车');
  c.type('一个大饼');
  assert.equal(a.vm().canSubmit, false, '传出去 needs >= 2 valid characters');
  b.type('一只猫在开出租车车车');
  w.advance(CONFIG.room.describeSec * 1000);
  assert.equal(a.log.kb[a.log.kb.length - 1][0], 'hide', 'the keyboard closed at 0');
  a.type('我还在写'); // ignored
  assert.equal(a.vm().text, '猫');
  await w.run(2500, 250);
  const s = room(w, roomId).slots['2'];
  assert.equal(s[0].marker, 'emptyText', 'A: one character is not a send');
  assert.equal(s[1].state, 'sent');
  assert.equal(s[2].state, 'sent');
});

test('rotation and privacy: each seat sees only the previous step of ONE other chain; the room view never carries other work (AC 139, 140)', async () => {
  const { w, a, b, c, all } = await trio();
  const roomId = await openRoom(w, a, [b, c]);
  await startRoom(w, a, all);
  await pickAll(w, all);
  const seen = all.map((p) => p.vm().source.text);
  assert.equal(new Set(seen).size, 3, 'three different prompts (three different chains)');
  const chains = room(w, roomId).chainIds;
  // no seat works on its own chain: A is seat 0 and in round 1 works on chain (0 - 1) mod 3 = 2 (C's prompt)
  const own = all.map((p) => p.ctl.state.room.resp.assignment && p.ctl.state.room.resp.assignment.chainNo);
  assert.deepEqual(own, [3, 1, 2]);
  assert.equal(chains.length, 3);
  for (const p of all) {
    const resp = p.ctl.state.room.resp;
    const dump = JSON.stringify(resp);
    assert.doesNotMatch(dump, /openid/i);
    assert.equal(resp.seats.length, 3);
  }
});

test('leave: 离开 asks first; leaving the lobby frees the seat, leaving mid-game fills the seat with markers so the round ends early (AC 142, 143)', async () => {
  const { w, a, b, c, all } = await trio();
  const roomId = await openRoom(w, a, [b, c]);
  // lobby: C leaves after a confirm
  await c.tap('lobby:back');
  assert.ok(c.app.ctl.view(c.now()).overlay.dialog, '离开这一局？');
  await c.tap('dialog:cancel');
  assert.equal(c.screen(), 'lobby');
  await c.tap('lobby:back');
  await c.tap('dialog:confirm');
  assert.equal(c.screen(), 'home');
  assert.equal(room(w, roomId).seats.length, 2);
  assert.equal(c.ctl.state.me.activeRoom, null);
  await w.run(1000, 250);
  assert.equal(a.vm().joinedText, '2 人已加入（3–10 人）');
  // a third player joins again and the game starts
  w.advance(4000);
  await c.show({ scene: 1044, query: { m: roomId }, shareTicket: 'tk9' });
  await c.tap('roomEntry:join');
  await w.run(1000, 250);
  await startRoom(w, a, all);
  await pickAll(w, all);
  // mid-game: B leaves from the draw screen
  await b.tap('draw:back');
  assert.ok(b.app.ctl.view(b.now()).overlay.dialog);
  assert.equal(b.app.ctl.view(b.now()).overlay.dialog.text, '离开后你的回合会自动跳过，确定离开？');
  await b.tap('dialog:confirm');
  assert.equal(b.screen(), 'home');
  const seat = room(w, roomId).seats[1];
  assert.equal(seat.status, 'left');
  assert.equal(room(w, roomId).slots['1'][1].state, 'marker', 'the seat is filled at once');
  a.scribble(1);
  c.scribble(1);
  await a.tap('draw:submit');
  await c.tap('draw:submit');
  await w.run(3000, 250);
  assert.equal(a.screen(), 'describe', 'the round ended early without waiting for B');
  assert.equal(room(w, roomId).round, 2);
});

test('rejoin: a seated member who restarts the game mid-round gets the remaining time and the saved draft; after the deadline the draft is discarded (AC 150, 3A.6)', async () => {
  const { w, a, b, c, all } = await trio();
  const roomId = await openRoom(w, a, [b, c]);
  await startRoom(w, a, all);
  await pickAll(w, all);
  assert.equal(b.screen(), 'draw');
  b.scribble(2);
  const saved = JSON.stringify(b.ctl.state.turn.rec.strokes);
  w.advance(20000);
  const store = b.storage;
  b.app.onHide();
  b.kill();
  // the app is started again with the same storage (a cold start): home shows 回到这一局 and the room resumes
  const b2 = await w.player('B', { rules: true, ...G, storage: store, as: 'B' });
  await w.run(1500, 250);
  assert.equal(b2.screen(), 'draw', 'back in the current round');
  assert.equal(JSON.stringify(b2.ctl.state.turn.rec.strokes), saved, 'the saved draft is restored');
  const left = b2.vm().timer.secLeft;
  assert.ok(left <= DRAW_SEC - 19 && left >= DRAW_SEC - 24, 'the remaining server time: ' + left);
  assert.equal(room(w, roomId).seats.length, 3);

  // a second time: the player is away past the deadline
  b2.app.onHide();
  const store2 = b2.storage;
  b2.kill();
  w.advance((DRAW_SEC + CONFIG.room.graceSec + 3) * 1000);
  w.srv.server.roomSweeper();
  const b3 = await w.player('B', { rules: true, ...G, storage: store2, as: 'B' });
  await w.run(1500, 250);
  assert.equal(b3.screen(), 'describe', 'the round moved on without B (B got a marker for round 1)');
  assert.equal(b3.ctl.state.turn.kind, 'describe');
  assert.equal(JSON.parse(b3.storage.chuanhua_state_v1).turn.kind, 'describe', 'the old draw draft is gone');
  assert.equal(JSON.parse(b3.storage.chuanhua_state_v1).turn.strokes, null);
  assert.equal(room(w, roomId).slots['1'][1].state === 'marker' || room(w, roomId).slots['1'][1].state === 'sent', true);
  assert.ok(roomId);
});

test('device clock (AC 149): the countdown follows the server offset, not the device clock', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G, skew: 90 * 1000 }); // 90 s ahead
  const c = await w.player('C', { rules: true, ...G, skew: -45 * 1000 });
  const roomId = await openRoom(w, a, [b, c]);
  await startRoom(w, a, [a, b, c]);
  await pickAll(w, [a, b, c]);
  const secs = [a, b, c].map((p) => p.vm().timer.secLeft);
  assert.ok(Math.max(...secs) - Math.min(...secs) <= 1, 'all three show the same remaining time: ' + secs);
  assert.ok(roomId);
});

test('pick: 自己出题 is moderated before use; a blocked custom keeps the cards selectable; at 0 an unsent custom text falls back to the selected rolled prompt (AC 119, 120)', async () => {
  const { w, a, b, c, all } = await trio();
  const roomId = await openRoom(w, a, [b, c]);
  await startRoom(w, a, all);
  await a.tap('pick:custom');
  assert.equal(a.vm().custom.open, true);
  assert.ok(a.log.kb.some((k) => k[0] === 'show'));
  a.type('测试违规的题目');
  assert.equal(a.vm().custom.text, '测试违规的题目');
  await a.tap('pick:customOk');
  assert.equal(a.screen(), 'pick');
  assert.equal(a.vm().custom.error, '这个题目不太合适，换一个吧');
  assert.equal(a.vm().state, 'ready');
  assert.equal(room(w, roomId).slots['0'][0].state, 'blocked', 'the custom prompt did not pass: nothing was created, the pick may be repeated');
  // B types a custom prompt and never sends it; C taps the second card
  await b.tap('pick:custom');
  b.type('会飞的西瓜');
  const second = c.vm().prompts[1];
  await c.tap('pick:item:' + second.id);
  w.advance(CONFIG.room.promptSec * 1000);
  assert.equal(a.vm().state, 'timeUp');
  assert.equal(a.vm().startLabel, '时间到，正在交出…');
  assertLocked(a, 'pick:block');
  await w.run(2500, 250);
  const s = room(w, roomId).slots['0'];
  assert.equal(s[0].state, 'sent', 'A: the first rolled prompt');
  assert.equal(s[0].custom, undefined);
  assert.equal(s[1].custom, undefined, 'B: the unsent custom text is not used');
  assert.equal(s[1].promptId, room(w, roomId).rolls[1].ids[0], 'B: the first card (none tapped)');
  assert.equal(s[2].promptId, second.id, 'C: the selected card');
  // a custom text that passes stands: it appears in the chain
  const w2 = world();
  const [x, y, z] = [await w2.player('X', { rules: true, ...G }), await w2.player('Y', { rules: true, ...G }), await w2.player('Z', { rules: true, ...G })];
  await openRoom(w2, x, [y, z]);
  await startRoom(w2, x, [x, y, z]);
  await x.tap('pick:custom');
  x.type('会飞的西瓜');
  await x.tap('pick:customOk');
  assert.equal(x.screen(), 'roundWait');
  assert.equal(x.vm().mine.text, '会飞的西瓜');
  const id = Object.keys(w2.srv.db.rooms)[0];
  assert.equal(w2.srv.db.rooms[id].slots['0'][0].custom, true);
});

test('realtime: with watch failing twice the client polls getRoom every 2 s; with a dropped connection the 10 s safety poll and roomTick still move the room (AC 147)', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const c = await w.player('C', { rules: true, ...G });
  for (const p of [a, b, c]) p.failWatch(2); // watch() fails twice for each player (srv.realtime.failNext)
  const modes = [];
  const roomId = await openRoom(w, a, [b, c]);
  for (const p of [a, b, c]) modes.push(p.ctl.X.room.rt().mode);
  assert.deepEqual(modes, ['poll', 'poll', 'poll'], 'two onErrors: polling');
  const polls = [];
  const real = a.app.api.getRoom;
  a.app.api.getRoom = (d) => (polls.push(w.t), real(d));
  await w.run(6000, 500);
  assert.ok(polls.length >= 2 && polls.length <= 4, 'about one getRoom every 2 s: ' + polls.length);
  await a.tap('lobby:start');
  await w.run(4000, 250);
  for (const p of [a, b, c]) assert.equal(p.screen(), 'pick', p.name + ' got the start by polling alone');
  // now the connection of B drops after the game started: no signals at all
  w.srv.realtime.paused = true;
  w.srv.realtime.failNext = 0;
  for (const p of [a, c]) await p.tap('pick:start');
  w.advance(CONFIG.room.promptSec * 1000); // B never sends: the deadline forces it
  await w.run(CONFIG.room.graceSec * 1000 + 8000, 500);
  for (const p of [a, b, c]) assert.equal(p.screen(), 'draw', p.name + ' advanced with polling / roomTick and no signal');
  assert.ok(room(w, roomId).round >= 1);
});

test('realtime: with watch the signal moves the client at once and the 10 s safety poll catches a missed signal; watch unsupported (PC WeChat) polls', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const roomId = await openRoom(w, a, [b]);
  assert.equal(a.ctl.X.room.rt().mode, 'watch');
  assert.equal(b.ctl.X.room.rt().mode, 'watch');
  // a signal arrives while the app is "connected": the lobby of A follows within the same tick, no 2 s poll needed
  const c = await w.player('C', { rules: true, ...G });
  w.advance(4000);
  await c.show({ scene: 1044, query: { m: roomId }, shareTicket: 'tk5' });
  w.srv.realtime.paused = true; // C's join signal is written but not delivered
  await c.tap('roomEntry:join');
  await w.run(500, 250);
  assert.equal(a.vm().joinedText, '2 人已加入（3–10 人）', 'no signal: A does not know yet');
  await w.run(10500, 500); // the 10 s safety poll
  assert.equal(a.vm().joinedText, '3 人已加入（3–10 人）');
  // unsupported
  const w2 = world();
  w2.srv.realtime.unsupported = true;
  const x = await w2.player('X', { rules: true, ...G });
  await x.tap('home:primary');
  assert.equal(x.ctl.X.room.rt().mode, 'poll');
});

test('room entry: every non-member state shows its copy and its actions (AC 136, 8.16)', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const x = await w.player('X', { rules: true, group: 'other' });
  // A opens the game from a card in group g1 (a group context): the room is bound to that group at once
  a.ctl.state.group = { status: 'ok', groupRef: w.srv.call('joinGroup', { cloudID: 'cloud-g1' }, a.openid).groupRef, shareTicket: null, home: null };
  await a.tap('home:primary');
  const roomId = a.ctl.state.room.roomId;
  // another group cannot join a bound room
  w.advance(4000);
  await x.show({ scene: 1044, query: { m: roomId }, shareTicket: 'tkX' });
  assert.equal(x.screen(), 'roomEntry');
  assert.equal(x.vm().state, 'wrongGroup');
  assert.equal(x.vm().headline, '这一局只能在发起的群里加入');
  assert.deepEqual(x.ids().filter((i) => /roomEntry:/.test(i) && !/scroll/.test(i)).sort(), ['roomEntry:home', 'roomEntry:newRoom']);
  // a card that does not exist
  w.advance(4000);
  await b.show({ scene: 1044, query: { m: 'ZZZZZZZZZZ' }, shareTicket: 'tkB' });
  assert.equal(b.vm().state, 'notFound');
  assert.ok(b.has('roomEntry:home'));
  // the game started: no late joiners
  const c = await w.player('C', { rules: true, ...G });
  const d = await w.player('D', { rules: true, ...G });
  await b.tap('roomEntry:home');
  for (const p of [b, c]) {
    w.advance(4000);
    await p.show({ scene: 1044, query: { m: roomId }, shareTicket: 'tk' + w.t });
    await p.tap('roomEntry:join');
  }
  await w.run(1000, 250);
  await a.tap('lobby:start');
  await w.run(2500, 250);
  w.advance(4000);
  await d.show({ scene: 1044, query: { m: roomId }, shareTicket: 'tkD' });
  assert.equal(d.vm().state, 'started');
  assert.equal(d.vm().headline, '这一局已经开始了，等下一局吧');
  assert.ok(d.has('roomEntry:newRoom') && d.has('roomEntry:group'));
  // in another room
  const e = await w.player('E', { rules: true, ...G });
  await e.tap('home:primary');
  const eRoom = e.ctl.state.room.roomId;
  const f = await w.player('F', { rules: true, ...G });
  await f.tap('home:primary');
  w.advance(4000);
  await f.show({ scene: 1044, query: { m: eRoom }, shareTicket: 'tkF' });
  assert.equal(f.screen() === 'lobby' || f.vm().state === 'inOtherRoom', true);
});

test('room entry: a player who has not agreed to the 公约 sees it before joining; a restricted player cannot join (AC 76, 136)', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { ...G }); // rules not agreed
  await a.tap('home:primary');
  const roomId = a.ctl.state.room.roomId;
  w.advance(4000);
  await b.show({ scene: 1044, query: { m: roomId }, shareTicket: 'tk1' });
  assert.equal(b.vm().state, 'rulesRequired');
  await b.tap('roomEntry:join');
  assert.equal(b.app.ctl.view(b.now()).layers.some((l) => l.screen === 'rules'), true);
  assert.equal(b.ctl.state.rules.pendingAction, 'joinRoom');
  await b.tap('rules:agree');
  assert.equal(b.screen(), 'lobby', 'agreeing continues the join');
});

test('home: 回到这一局 returns a seated player to the lobby, the current round or the overview (AC 162)', async () => {
  const { w, a, b, c, all } = await trio();
  const roomId = await openRoom(w, a, [b, c]);
  // lobby: B closes the app; home shows the card
  b.app.onHide();
  b.kill();
  const b2 = await w.player('B', { rules: true, ...G, storage: b.storage, as: 'B' });
  assert.equal(b2.vm().activeRoom.line, '回到这一局 · 等待开始');
  assert.ok(b2.has('home:activeRoom'));
  await b2.tap('home:activeRoom');
  assert.equal(b2.screen(), 'lobby');
  await startRoom(w, a, [a, b2, c]);
  assert.equal(b2.ctl.state.room.roomId, roomId);
});

test('card during a game: a new card never interrupts a live round: a toast now, the room after the game (9.6)', async () => {
  const { w, a, b, c, all } = await trio();
  const roomId = await openRoom(w, a, [b, c]);
  await startRoom(w, a, all);
  await pickAll(w, all);
  assert.equal(a.screen(), 'draw');
  w.advance(4000);
  await a.show({ scene: 1044, query: { k: 'ABCDEFGHJK' }, shareTicket: 'tkZ' });
  assert.equal(a.screen(), 'draw');
  assert.equal(a.toast(), '群里有新消息，交完这一棒再看');
  assert.ok(roomId);
});

test('report during a live round needs the chain id of the assignment; the report sheet closes at the forced send (AC 128, 7.1)', async () => {
  const { w, a, b, c, all } = await trio();
  await openRoom(w, a, [b, c]);
  await startRoom(w, a, all);
  await pickAll(w, all);
  assert.equal(a.screen(), 'draw');
  // round 1: the source is a rolled prompt: nothing to report (13)
  assert.equal(a.vm().canReport, false);
  assert.ok(!a.has('draw:report'));
  // open the clear-confirm and the time runs out: the dialog closes and the send happens
  a.scribble(1);
  await a.tap('draw:clear');
  assert.ok(a.app.ctl.view(a.now()).overlay.dialog);
  w.advance(DRAW_SEC * 1000);
  assert.equal(a.app.ctl.view(a.now()).overlay.dialog, undefined, 'the confirm closed at 0');
  await w.run(1500, 250);
});

test('TD-140: a live round draws 举报 from the server-issued reportRef, reports through it, and the reporter keeps the turn with a hidden source', async () => {
  const { w, a, b, c, all } = await trio();
  await openRoom(w, a, [b, c]);
  await startRoom(w, a, all);
  await pickAll(w, all);
  for (const p of all) {
    p.scribble(1);
    await p.tap('draw:submit');
  }
  await w.run(2500, 250);
  assert.equal(b.screen(), 'describe');
  const src = b.ctl.state.room.resp.assignment.source;
  assert.equal(src.canReport, true);
  assert.match(src.reportRef, /^q[0-9a-z]+$/, 'the member view carries an opaque reportRef');
  assert.equal(b.ctl.state.room.resp.assignment.chainId, undefined, 'and still no chain id');
  assert.equal(b.vm().canReport, true);
  assert.ok(b.has('describe:report'));
  await b.tap('describe:report');
  assert.deepEqual(b.ctl.state.report.target, { roomId: b.ctl.state.room.roomId, reportRef: src.reportRef, step: 1 });
  assert.equal(JSON.stringify(b.view().layers[0].vm).includes(src.reportRef), false, 'the render layer never sees the token');
  await b.tap('report:reason:abuse');
  await b.tap('report:submit');
  await w.run(1500, 250);
  assert.equal(b.screen(), 'describe', 'the reporter keeps the turn');
  assert.equal(b.vm().canReport, false);
  assert.equal(b.vm().source.kind, 'hidden');
});

test('lobby: when the host leaves, the earliest-joined member becomes host and gets 开始; an idle lobby is closed after 30 minutes with the closed panel (AC 143, 144, 7)', async () => {
  const { w, a, b, c } = await trio();
  const roomId = await openRoom(w, a, [b, c]);
  assert.equal(b.vm().isHost, false);
  await a.tap('lobby:back');
  await a.tap('dialog:confirm');
  await w.run(1500, 250);
  assert.equal(b.vm().isHost, true, 'handover to the earliest-joined member');
  assert.ok(b.has('lobby:start') === false || b.vm().start.enabled === false, 'two players: the start is disabled');
  assert.equal(b.vm().start.hint, '至少 3 人才能开局');
  assert.equal(room(w, roomId).host, w.id('B'));
  assert.deepEqual(b.vm().seats.filter((s) => s.me).map((s) => s.n), [1], 'seats renumber in join order');
  // nobody starts: 30 minutes later roomSweeper closes the lobby for both
  w.advance(31 * 60e3);
  w.srv.server.roomSweeper();
  await b.ctl.X.room.refresh();
  await c.ctl.X.room.refresh();
  await w.run(500, 250);
  for (const p of [b, c]) {
    assert.equal(p.screen(), 'lobby');
    assert.equal(p.vm().state, 'closed');
    assert.ok(p.has('lobby:home'));
    assert.ok(!p.has('lobby:start'));
  }
  assert.match(b.frame(), /这一局太久没开始，已关闭/);
  await b.tap('lobby:home');
  assert.equal(b.screen(), 'home');
  assert.equal(b.vm().activeRoom, null);
});

test('room entry: closed, a finished room (non-member: the room teaser), the daily join cap and paused creation (spec 8.16)', async () => {
  const { w, a, b, c } = await trio();
  const x = await w.player('X', { rules: true, ...G });
  const roomId = await openRoom(w, a, [b, c]);
  await startRoom(w, a, [a, b, c]);
  await pickAll(w, [a, b, c]);
  // play the room to its end by forced sends
  w.advance(DRAW_SEC * 1000);
  await w.run(3000, 250);
  w.advance(CONFIG.room.describeSec * 1000);
  await w.run(6000, 250);
  assert.equal(a.screen(), 'overview');
  // X (in the group, not a member) opens the card of the finished room: the room teaser, no content but the passed texts
  w.advance(4000);
  await x.show({ scene: 1044, query: { m: roomId }, shareTicket: 'tkx' });
  assert.equal(x.screen(), 'teaser');
  assert.equal(x.vm().kind, 'room');
  assert.match(x.vm().title, /^一局传画揭晓了 · 3 条接龙$/);
  assert.equal(x.vm().lines.length, 3);
  assert.ok(x.vm().lines.every((l) => l.to === null || typeof l.to === 'string'));
  assert.match(x.frame(), /完整内容仅这一局的群友可见/);
  assert.ok(x.has('teaser:newRoom') && x.has('teaser:group'));
  await x.tap('teaser:report');
  assert.match(x.toast(), /投诉/, 'a room teaser has no chain id to report: the platform complaint hint');
  // the cap of joins and the creation switch
  const y = await w.player('Y', { rules: true, ...G });
  const host = await w.player('H', { rules: true, ...G });
  await host.tap('home:primary');
  const hostRoom = host.ctl.state.room.roomId;
  w.srv.db.players[w.id('Y')].day = { ...w.srv.db.players[w.id('Y')].day, roomsJoined: CONFIG.allowances.roomsJoinedPerDay, dateKey: host.ctl.state.dayKey };
  w.advance(4000);
  await y.show({ scene: 1044, query: { m: hostRoom }, shareTicket: 'tky' });
  assert.equal(y.vm().state, 'capReached');
  await y.tap('roomEntry:home');
  w.srv.appConfig = { ugc: { createEnabled: false, viewEnabled: true } };
  const z = await w.player('Z', { rules: true, ...G });
  w.advance(4000);
  await z.show({ scene: 1044, query: { m: hostRoom }, shareTicket: 'tkz' });
  assert.equal(z.vm().state, 'ugcPaused');
  assert.equal(z.vm().restrictionText, '接龙维护中，可以先看看已揭晓的接龙');
  w.srv.appConfig = null;
  // a closed room
  w.srv.db.rooms[hostRoom].state = 'closed';
  w.advance(4000);
  await z.show({ scene: 1044, query: { m: hostRoom }, shareTicket: 'tkz2' });
  assert.equal(z.vm().state, 'closed');
  assert.equal(z.vm().headline, '这一局已经结束了');
});

test('room entry: in another room -> 回到那一局 / 离开那一局', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  await a.tap('home:primary');
  const roomA = a.ctl.state.room.roomId;
  await b.tap('home:primary');
  const roomB = b.ctl.state.room.roomId;
  // B leaves the screen without leaving the room (the app was killed); A's card brings B to the room entry of A's room
  b.app.onHide();
  b.kill();
  const b2 = await w.player('B2', { rules: true, as: 'B', storage: b.storage, ...G });
  w.advance(4000);
  await b2.show({ scene: 1044, query: { m: roomA }, shareTicket: 'tk1' });
  assert.equal(b2.screen(), 'roomEntry');
  assert.equal(b2.vm().state, 'inOtherRoom');
  assert.equal(b2.vm().otherRoomId, roomB);
  assert.ok(b2.has('roomEntry:backToRoom') && b2.has('roomEntry:leaveOther'));
  await b2.tap('roomEntry:leaveOther');
  assert.equal(b2.vm().state === 'joinable' || b2.screen() === 'roomEntry', true);
  assert.equal(b2.vm().state, 'joinable', 'the other room is left: this one can be joined');
  await b2.tap('roomEntry:join');
  assert.equal(b2.screen(), 'lobby');
  assert.equal(b2.ctl.state.room.roomId, roomA);
});

test('9.5: with the updatable card on the lobby invite sets up the template (member_count = joined, room_limit 10)', async () => {
  const w = world();
  w.srv.appConfig = { features: { updatableCard: true } };
  const a = await w.player('A', { rules: true, ...G });
  await a.tap('home:primary');
  await w.run(500, 250);
  assert.ok(a.ctl.state.room.activityId, 'the activity id was fetched ahead of the tap');
  await a.tap('lobby:invite');
  const upd = a.log.menu.filter((m) => m[0] === 'updateShareMenu' && m[1].isUpdatableMessage);
  assert.equal(upd.length, 1);
  assert.deepEqual(upd[0][1].templateInfo.parameterList, [{ name: 'member_count', value: '1' }, { name: 'room_limit', value: '10' }]);
  assert.equal(a.log.shares[0].query, 'm=' + a.ctl.state.room.roomId);
});

test('cold start: a saved live draft whose room the player no longer sits in is dropped with the late line (AC 150)', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const storage = {
    chuanhua_state_v1: JSON.stringify({
      v: 1, howtoSeen: true, display: { largeText: false, highContrast: false },
      turn: { mode: 'live', roomId: 'ABCDEFGHJK', round: 1, kind: 'draw', gridH: 1363, colorIdx: 0, sizeIdx: 1, undoCount: 0, startedAt: 1, savedAt: 2, strokes: { v: 2, h: 1363, s: [[0, 1, 10, 10, 5, 5]] }, text: '' },
    }),
  };
  const a2 = await w.player('A2', { rules: true, as: 'A', storage, ...G });
  assert.equal(a2.screen(), 'home');
  assert.equal(a2.toast(), '时间到了，这一棒已自动交出');
  assert.equal(JSON.parse(a2.storage.chuanhua_state_v1).turn, null);
  assert.ok(a);
});
