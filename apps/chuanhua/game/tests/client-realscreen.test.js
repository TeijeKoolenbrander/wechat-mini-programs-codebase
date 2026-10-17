'use strict';
// Real screens end to end: js/main.js's wiring (createApp) with the REAL renderer (js/render/index.js) on the in-memory mock server.
//   1. A full live room of 3 players: lobby, pick, draw and describe rounds with a FORCED send and an EMPTY marker, the overview, the
//      step-through, the rematch. One player's watch fails twice (srv.realtime.failNext) and the client falls back to polling.
//   2. A 慢慢传 chain with 2 players to its reveal, then the lists and the sheets.
// At every screen they reach, EVERY hit id the renderer returns is tapped and the logic must handle it (the screen, the view model, a
// dialog, a toast, a share, an ad, the keyboard, storage or a server call changed). Ids that only swallow taps or scroll are checked
// for what they are.
//
// Two phases keep the checkpoints intact. Benign ids (they keep the player on the same screen after a dialog / sheet is closed) are
// tapped one after another on the live state. Leaving ids (back, start, submit, ...) are tapped by re-playing the scenario in a fresh
// world up to that checkpoint, so each one starts from the exact same state.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { world } = require('./harness');
const { openCard, describeStep, drawStep } = require('./flows');
const { CONFIG } = require('../core/config');

const G = { group: 'g1' };

/** ids that go somewhere else, or change what is under the player for good: tapped in their own re-run */
const LEAVING = new RegExp(
  '^(' +
    [
      'home:(primary|slow|groupLine|groupList|album|retry|activeRoom)',
      'lobby:(start|slow|home)',
      'roomEntry:.*',
      'pick:(back|start|retry|custom|customInput|customOk|customCancel|reroll)',
      'draw:(back|submit|retry|report|undo|clear)',
      'describe:(back|submit|retry|report)',
      'roundWait:back',
      'overview:(back|chain:.*|rematch|joinNew|retry)',
      'stepthrough:.*',
      'sent:(home|group|again|reveal|share|subscribe)',
      'entry:(claim|group|newRoom|room|reveal|viewReveal|mine|home|retry|refresh|subscribe|share)',
      'teaser:.*',
      'group:(back|item:.*|room:.*|revealedRoom:.*|revealedChain:.*|newRoom|retry)',
      'album:(back|chain:.*|room:.*|more|retry)',
      'mine:(back|delete:.*|retry)',
      'settings:(deleteAll|rules|terms|privacy|palette|sound|largeText|highContrast)',
      'rules:(agree|terms|privacy)',
      'warning:ok',
      'sheet:close',
      'rules:decline',
      'report:.*',
      'startLimit:ad',
      'terms:back',
    ].join('|') +
    ')$'
);
/** ids that legitimately do nothing by themselves */
const INERT = /(:block|:card|:scrim|:body)(:|$)|^sheet:(body|scrim)$|:scroll$|^sheet:list$|^draw:canvas$|^settings:feedback$/; // feedback: the native wx.createFeedbackButton sits over it

class Stop extends Error {}

/** a half-tap at the end of the chain (nextHalf on the final step, prevHalf on the 起点) and a tap on the current dot are handled by doing nothing */
const boundary = (p, id) => p.screen() === 'stepthrough' && ((id === 'stepthrough:nextHalf' && !p.vm().canNext) || (id === 'stepthrough:prevHalf' && !p.vm().canPrev) || (id === 'stepthrough:dot:' + p.vm().index));

/** the id sits under an open sheet / dialog (home sheets are part of the home vm, the others are layers) */
function underSheet(p, id, top) {
  const v = p.app.ctl.view(p.now());
  const sheet = v.layers.length > 0 || (v.screen === 'home' && !!v.vm.sheet);
  return sheet && id.split(':')[0] !== top.split(':')[0] ? true : /^(sheet:|dialog:)/.test(top);
}

function snap(p, counters) {
  const v = p.app.ctl.view(p.now());
  return JSON.stringify({ screen: v.screen, vm: v.vm, layers: v.layers, overlay: v.overlay }) + '|' + counters();
}

function counters(w, p) {
  return () => [p.log.calls.length, p.log.shares.length, p.log.ads.length, p.log.kb.length, p.log.modals.length, p.log.storageWrites, w.srvCalls, p.app.ctl.state.ui.toast ? p.app.ctl.state.ui.toast.text : ''].join(',');
}

/** close whatever a tap opened: dialogs, ad stub, sheets */
async function reset(p) {
  for (let i = 0; i < 6; i++) {
    const v = p.app.ctl.view(p.now());
    p.frame();
    const ids = p.app.hits.map((h) => h.id);
    if (v.overlay.dialog) await p.tap('dialog:cancel');
    else if (v.overlay.adStub) await p.tap('adstub:skip');
    else if (v.layers.some((l) => l.screen === 'report')) await p.tap(ids.includes('report:cancel') ? 'report:cancel' : 'sheet:close');
    else if (v.layers.some((l) => l.screen === 'rules')) await p.tap('rules:decline');
    else if (v.screen === 'home' && v.vm.sheet) await p.tap(ids.includes('sheet:close') ? 'sheet:close' : 'warning:ok');
    else return;
  }
}

/** a sub-world with call counting, virtual timers and the real renderer on every player */
function newWorld() {
  const w = world();
  w.srvCalls = 0;
  const callOrig = w.srv.call.bind(w.srv);
  w.srv.call = (...args) => {
    w.srvCalls++;
    return callOrig(...args);
  };
  return w;
}

/** the whole story. cp(player, label) is called at every checkpoint. */
async function scenario(w, cp) {
  // ================================================================ the live room: A (host), B, C (polling only)
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const c = await w.player('C', { rules: true, ...G });
  c.failWatch(2); // watch() fails twice for C: the client polls getRoom every 2 s
  await cp(a, 'home');
  await a.tap('home:primary');
  assert.equal(a.screen(), 'lobby');
  await cp(a, 'lobby-1');
  const roomId = a.ctl.state.room.roomId;
  for (const p of [b, c]) {
    w.advance(4000);
    await p.show({ scene: 1044, query: { m: roomId }, shareTicket: 'tk' + w.t });
    if (p === b) await cp(b, 'roomEntry');
    await p.tap('roomEntry:join');
  }
  await w.run(1500, 250);
  assert.equal(c.ctl.X.room.rt().mode, 'poll', 'C fell back to polling after two watch errors');
  await cp(a, 'lobby-host');
  await cp(b, 'lobby-guest');
  await a.tap('lobby:start');
  await w.run(2500, 250);
  await cp(a, 'pick');
  await cp(b, 'pick-2');
  await a.tap('pick:start');
  await b.tap('pick:start');
  await c.tap('pick:start');
  await cp(a, 'roundWait-0');
  await w.run(2500, 250);
  assert.equal(a.screen(), 'draw');
  await cp(a, 'draw-coach'); // first draw turn: the coach line is up
  a.scribble(3);
  await cp(a, 'draw');
  await a.tap('draw:submit');
  await cp(a, 'roundWait-1');
  b.scribble(2);
  await b.tap('draw:submit');
  // C draws with a finger that is still down at 0: the stroke in progress is kept, the screen is inert
  c.scribble(1);
  const r = c.hit('draw:canvas');
  const touch = c.down(r.x + 30, r.y + 30);
  c.move(touch, r.x + 90, r.y + 80);
  w.advance(CONFIG.room.drawSec * 1000);
  await cp(c, 'draw-timeUp');
  c.up(touch, r.x + 90, r.y + 80);
  await w.run(5000, 250);
  assert.equal(a.screen(), 'describe');
  await cp(a, 'describe-empty');
  a.type('一只猫在开出租车');
  await cp(a, 'describe');
  await a.tap('describe:submit');
  b.type('外星人在吃披萨');
  await b.tap('describe:submit');
  // C writes nothing: the empty marker
  w.advance(CONFIG.room.describeSec * 1000);
  await cp(c, 'describe-timeUp');
  await w.run(6000, 250);
  assert.equal(a.screen(), 'overview');
  assert.equal(c.screen(), 'overview');
  await cp(a, 'overview');
  await cp(c, 'overview-C');
  const cards = a.vm().cards;
  const markerCard = c.vm().cards.find((x) => x.final.kind === 'marker');
  assert.ok(markerCard, 'the empty marker is a final step');
  await a.tap('overview:chain:' + cards[0].chainId);
  await cp(a, 'step-final'); // replaying
  w.advance(3000);
  await cp(a, 'step-final-played');
  await a.tap('stepthrough:prevHalf');
  await cp(a, 'step-prev');
  await a.tap('stepthrough:dot:0');
  await cp(a, 'step-start');
  await a.tap('stepthrough:back');
  await c.tap('overview:chain:' + markerCard.chainId);
  await cp(c, 'step-marker');
  await c.tap('stepthrough:back');
  await a.tap('overview:rematch');
  await cp(a, 'lobby-new');
  await w.run(1500, 250);
  await cp(b, 'overview-banner');
  await a.tap('lobby:back');
  await a.tap('dialog:confirm');
  await b.tap('overview:back');
  await c.tap('overview:back');

  // ================================================================ 慢慢传: D starts, E describes, ... to the reveal
  const d = await w.player('D', { rules: true, ...G });
  const e = await w.player('E', { rules: true, ...G });
  await cp(d, 'home-d');
  await d.tap('home:slow');
  await cp(d, 'pick-chain');
  await d.tap('pick:start');
  assert.equal(d.screen(), 'draw');
  await cp(d, 'draw-chain');
  d.scribble(3);
  await d.tap('draw:submit');
  await cp(d, 'sent');
  const id = d.ctl.state.sent.chainId;
  await openCard(w, e, id);
  await cp(e, 'entry-claimable');
  await e.tap('entry:claim');
  await cp(e, 'describe-chain');
  e.type('一个大饼在天上');
  await e.tap('describe:submit');
  await cp(e, 'sent-text');
  await drawStep(w, d, id);
  await describeStep(w, e, id, '外星人在吃披萨');
  await drawStep(w, d, id);
  await describeStep(w, e, id, '企鹅在沙漠晒太阳');
  assert.equal(e.screen(), 'stepthrough');
  await cp(e, 'step-chain');
  await e.tap('stepthrough:back');
  await openCard(w, d, id, 'r');
  await cp(d, 'step-chain-d');
  await d.tap('stepthrough:back');
  await d.tap('home:album');
  await cp(d, 'album');
  await d.tap('album:back');
  await d.tap('home:groupList');
  await cp(d, 'group');
  await d.tap('group:back');
  await d.tap('home:howto');
  await cp(d, 'home-howto');
  await d.tap('sheet:close');
  await d.tap('home:settings');
  await cp(d, 'home-settings');
}

test('real screens: a live room of 3 (forced send, empty marker, watch failure -> polling, rematch) and a 慢慢传 chain; every hit id each screen returns is handled by the logic', async () => {
  // ---- pass 1: record the checkpoints and tap every benign id on the live state
  const plan = []; // {label, key, leaving:[ids]}
  const handledLog = [];
  const w1 = newWorld();
  await scenario(w1, async (p, label) => {
    assert.equal(p.app.renderer.kind, 'real', 'the real renderer is in use');
    p.frame();
    const ids = [...new Set(p.app.hits.map((h) => h.id))];
    const leaving = [];
    for (const id of ids) {
      if (INERT.test(id)) continue;
      if (LEAVING.test(id)) {
        leaving.push(id);
        continue;
      }
      p.frame();
      const area = p.app.hits.slice().reverse().find((h) => h.id === id);
      assert.ok(area, `${label}: ${id} vanished after an earlier tap (state-changing id? add it to LEAVING)`);
      const top = p.app.renderer.hitTest(p.app.hits, area.x + area.w / 2, area.y + area.h / 2);
      if (top !== id && underSheet(p, id, top)) continue; // under an open sheet: the sheet swallows the tap, by design
      assert.equal(top, id, `${label}: ${id} is covered by ${top} at its centre`);
      const count = counters(w1, p);
      const before = snap(p, count);
      const screen0 = p.app.ctl.view(p.now()).screen;
      await p.tap(id);
      const after = snap(p, count);
      const vmNow = p.vm();
      const reselect =
        (id.startsWith('pick:item:') && vmNow.selectedId === id.slice('pick:item:'.length)) ||
        (id.startsWith('draw:color:') && vmNow.colorIdx === Number(id.slice('draw:color:'.length)));
      if (!reselect) assert.notEqual(after, before, `${label}: tapping ${id} did nothing`); // choosing the chosen prompt / colour again is a no-op
      handledLog.push(`${label}: ${id}`);
      await reset(p);
      p.frame();
      assert.equal(p.app.ctl.view(p.now()).screen, screen0, `${label}: ${id} left the screen; add it to LEAVING`);
    }
    plan.push({ label, screen: p.screen(), state: JSON.stringify([p.vm().state, p.vm().status, p.vm().modState]), leaving, count: plan.length });
    // wrong id sanity: an id nobody routes must be inert
    const c0 = snap(p, counters(w1, p));
    p.app.ctl.onHit('nope:nothing');
    assert.equal(snap(p, counters(w1, p)), c0, 'unknown ids are ignored');
  });
  assert.ok(plan.length >= 35, 'checkpoints: ' + plan.length);
  const screens = new Set(plan.map((x) => x.screen));
  for (const s of ['home', 'lobby', 'roomEntry', 'pick', 'roundWait', 'draw', 'describe', 'overview', 'stepthrough', 'sent', 'entry', 'album', 'group']) assert.ok(screens.has(s), 'a checkpoint on ' + s);

  // ---- pass 2: each leaving id from the same state, in a re-run that stops at the checkpoint
  let leavingTapped = 0;
  const done = new Set(); // (screen/state/id) already tapped at an earlier checkpoint in the same state
  for (let k = 0; k < plan.length; k++) {
    for (const id of plan[k].leaving) {
      const dedupe = plan[k].screen + '/' + plan[k].state + '/' + id;
      if (done.has(dedupe)) continue;
      done.add(dedupe);
      const w = newWorld();
      let n = 0;
      let handled = false;
      try {
        await scenario(w, async (p, label) => {
          if (n++ !== k) return;
          assert.equal(label, plan[k].label);
          p.frame();
          const area = p.app.hits.slice().reverse().find((h) => h.id === id);
          assert.ok(area, `${label}: ${id} is no longer offered (re-run differs)`);
          const top = p.app.renderer.hitTest(p.app.hits, area.x + area.w / 2, area.y + area.h / 2);
          if (top !== id && underSheet(p, id, top)) {
            handled = true;
            throw new Stop();
          }
          assert.equal(top, id, `${label}: ${id} is covered by ${top} at its centre`);
          const count = counters(w, p);
          const before = snap(p, count);
          const edge = boundary(p, id);
          await p.tap(id);
          const after = snap(p, count);
          if (edge) assert.equal(after, before, `${label}: ${id} at the end of the chain is inert`);
          else assert.notEqual(after, before, `${label}: tapping ${id} did nothing`);
          handled = true;
          throw new Stop();
        });
      } catch (err) {
        if (!(err instanceof Stop)) throw err;
      }
      assert.ok(handled, `${plan[k].label}: ${id} was not tapped`);
      leavingTapped++;
    }
  }
  assert.ok(leavingTapped >= 60, 'leaving ids tapped: ' + leavingTapped);
  assert.ok(handledLog.length >= 25, 'benign ids tapped: ' + handledLog.length);
  console.log(`[realscreen] ${plan.length} checkpoints, ${handledLog.length} ids tapped in place, ${leavingTapped} ids tapped in re-runs`);
});

test('real screens: a watch that keeps failing falls back to polling and the whole game still plays out; rt_mode is reported', async () => {
  const w = newWorld();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const c = await w.player('C', { rules: true, ...G });
  for (const p of [a, b, c]) p.failWatch(2);
  await a.tap('home:primary');
  const roomId = a.ctl.state.room.roomId;
  for (const p of [b, c]) {
    w.advance(4000);
    await p.show({ scene: 1044, query: { m: roomId }, shareTicket: 'tk' + w.t });
    await p.tap('roomEntry:join');
  }
  await w.run(2500, 250);
  for (const p of [a, b, c]) assert.equal(p.ctl.X.room.rt().mode, 'poll');
  await a.tap('lobby:start');
  await w.run(2500, 250);
  for (const p of [a, b, c]) await p.tap('pick:start');
  await w.run(2500, 250);
  for (const p of [a, b, c]) {
    p.scribble(1);
    await p.tap('draw:submit');
  }
  await w.run(2500, 250);
  for (const p of [a, b, c]) {
    p.type('一只猫');
    await p.tap('describe:submit');
  }
  await w.run(3000, 250);
  for (const p of [a, b, c]) assert.equal(p.screen(), 'overview');
  for (const p of [a, b, c]) await p.app.analytics.flush();
  const modes = w.srv.db.events.filter((x) => x.name === 'rt_mode');
  assert.ok(modes.length >= 3 && modes.every((x) => x.props.mode === 'poll'), 'rt_mode events: ' + JSON.stringify(modes.map((x) => x.props)));
});

test('real screens: the pathLength limit shows 线条太多啦，先交吧 on the draw screen and blocks new strokes', async () => {
  const w = newWorld();
  const a = await w.player('A', { rules: true, ...G });
  await a.tap('home:slow');
  await a.tap('pick:start');
  assert.equal(a.screen(), 'draw');
  let guard = 0;
  while (!a.vm().limitText && guard++ < 400) {
    a.stroke([[0.02, 0.02], [0.98, 0.98], [0.02, 0.98], [0.98, 0.02], [0.02, 0.02], [0.98, 0.5]]);
    a.frame();
  }
  assert.equal(a.vm().limitText, '线条太多啦，先交吧', 'after ' + guard + ' strokes of ' + CONFIG.strokes.maxPathUnits + ' units');
  assert.match(a.frame(), /线条太多啦，先交吧/, 'the notice is drawn');
  const n = a.vm().strokes.length;
  a.stroke([[0.1, 0.1], [0.5, 0.5]]);
  assert.equal(a.vm().strokes.length, n, 'no new stroke starts');
  assert.ok(a.ids().includes('draw:submit'), 'the player can still submit');
  await a.tap('draw:submit');
  assert.equal(a.screen(), 'sent');
});

test('real screens: the draw vm hands the renderer the recorder strokes (absolute) and drawingNow; describe gets keyboardH', async () => {
  const w = newWorld();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  await a.tap('home:slow');
  await a.tap('pick:start');
  const id = a.ctl.state.turn.chainId;
  const r = a.hit('draw:canvas');
  const t = a.down(r.x + 20, r.y + 20);
  a.move(t, r.x + 80, r.y + 90);
  a.frame();
  assert.equal(a.vm().drawingNow, true, 'a finger is down');
  assert.ok(Array.isArray(a.vm().strokes) && a.vm().strokes[0].p, 'absolute [{c,w,p}] strokes');
  a.up(t, r.x + 80, r.y + 90);
  assert.equal(a.vm().drawingNow, false);
  await a.tap('draw:submit');
  await openCard(w, b, id);
  await b.tap('entry:claim');
  assert.equal(b.vm().keyboardH, undefined, 'the keyboard is up but its height is not known yet');
  b.kb.height({ height: 291 });
  assert.equal(b.vm().keyboardH, 291, 'the renderer lays out above the keyboard');
  b.kb.complete();
  assert.equal(b.vm().keyboardH, 0, 'keyboard closed');
});

test('main.js boot (game.js under WeChat loading rules, the touch handlers and the frame loop it registers): the host plays a whole live room of 3 against two remote players on the same mock server', async (t) => {
  const { bootGame } = require('./harness');
  const g = bootGame(t, { enter: { scene: 1001, query: {} } });
  const srv = g.app.api.mock;
  assert.ok(srv, 'the in-memory mock answers (cloudEnv is empty)');
  assert.equal(g.app.renderer.kind, 'real');
  const settle = async () => {
    for (let i = 0; i < 4; i++) await g.settle();
  };
  const at = (id) => g.app.hits.slice().reverse().find((h) => h.id === id);
  const tap = async (id) => {
    g.frame();
    const h = at(id);
    assert.ok(h, 'no hit ' + id + ' among ' + g.app.hits.map((x) => x.id).join(','));
    const touch = { identifier: 1, clientX: h.x + h.w / 2, clientY: h.y + h.h / 2 };
    g.touch.start({ touches: [touch], changedTouches: [touch] });
    g.touch.end({ touches: [], changedTouches: [touch] });
    await settle();
    g.frame();
  };
  /** move the virtual clock (Date and the timers main.js and js/realtime.js use) and run the frame loop */
  const run = async (ms, step) => {
    for (let done = 0; done < ms; done += step || 500) {
      t.mock.timers.tick(Math.min(step || 500, ms - done));
      await settle();
      g.frame();
    }
  };
  const view = () => g.app.ctl.view(Date.now());
  const screen = () => view().screen;
  const stroke = (a, b) => {
    g.frame();
    const r = at('draw:canvas');
    const f = { identifier: 5, clientX: r.x + r.w * a[0], clientY: r.y + r.h * a[1] };
    g.touch.start({ touches: [f], changedTouches: [f] });
    const m = { identifier: 5, clientX: r.x + r.w * b[0], clientY: r.y + r.h * b[1] };
    g.touch.move({ touches: [m], changedTouches: [m] });
    g.touch.end({ touches: [], changedTouches: [m] });
  };

  // ---- the host: first launch, the 玩法 sheet, 开一局, the 公约
  await settle();
  g.frame();
  if (view().vm.sheet === 'howto') await tap('sheet:close');
  await tap('home:primary');
  assert.equal(view().vm.sheet, 'rules');
  await tap('rules:agree');
  assert.equal(screen(), 'lobby');
  const roomId = g.app.ctl.state.room.roomId;

  // ---- two remote players (API calls as another device would make them)
  const remote = {};
  for (const name of ['bot-B', 'bot-C']) {
    assert.equal(srv.call('agreeRules', { version: CONFIG.rulesVersion }, name).ok, true);
    const ref = srv.call('joinGroup', { cloudID: 'cid-3-bootgroup' }, name).groupRef;
    assert.equal(srv.call('joinRoom', { roomId, groupRef: ref }, name).ok, true);
    remote[name] = ref;
  }
  await run(2500);
  assert.match(g.frame(), /3 人已加入/);
  await tap('lobby:start');
  await run(2500);
  assert.equal(screen(), 'pick', 'the start reached the host through the signal / poll');
  // the remote players pick their first rolled prompt; the host taps 就这个
  const room = () => srv.db.rooms[roomId];
  const assignment = (name) => srv.call('getRoom', { roomId }, name).assignment;
  for (const name of ['bot-B', 'bot-C']) {
    const roll = assignment(name).roll;
    assert.equal(srv.call('submitRoomStep', { roomId, round: 0, rollId: roll.rollId, promptId: roll.prompts[0].id, auto: false, empty: false, clientMs: 1 }, name).ok, true);
  }
  await tap('pick:start');
  await run(2500);
  assert.equal(screen(), 'draw');
  // ---- round 1: the host draws with touches and sends; the bots send a drawing through the API
  stroke([0.1, 0.1], [0.8, 0.7]);
  stroke([0.2, 0.6], [0.9, 0.2]);
  await tap('draw:submit');
  assert.equal(screen(), 'roundWait');
  const botDrawing = { v: 2, h: 1363, s: [[0, 1, 100, 100, 200, 100, 200, -50]] };
  for (const name of ['bot-B', 'bot-C']) assert.equal(srv.call('submitRoomStep', { roomId, round: 1, strokes: botDrawing, auto: false, empty: false, clientMs: 1 }, name).ok, true);
  await run(3000);
  assert.equal(screen(), 'describe');
  // ---- round 2: the host types nothing: the forced send at 0 is the empty marker (the keyboard events main.js registered)
  assert.ok(g.kb.input, 'the keyboard handlers were registered by the boot');
  g.kb.input({ value: '猫' });
  assert.equal(view().vm.canSubmit, false);
  for (const name of ['bot-B', 'bot-C']) assert.equal(srv.call('submitRoomStep', { roomId, round: 2, text: '一只猫在开出租车', auto: false, empty: false, clientMs: 1 }, name).ok, true);
  await run(CONFIG.room.describeSec * 1000 + 1500);
  assert.equal(room().slots['2'][0].marker, 'emptyText', 'the host sent the empty marker at 0');
  await run(4000);
  assert.equal(screen(), 'overview');
  assert.equal(view().vm.cards.length, 3);
  // ---- the step-through: final step first, then back, then 再来一局
  const first = view().vm.cards[0];
  await tap('overview:chain:' + first.chainId);
  assert.equal(screen(), 'stepthrough');
  assert.equal(view().vm.index, view().vm.steps.length - 1);
  await tap('stepthrough:prevHalf');
  assert.equal(view().vm.index, view().vm.steps.length - 2);
  await tap('stepthrough:back');
  assert.equal(screen(), 'overview');
  await tap('overview:rematch');
  assert.equal(screen(), 'lobby');
  assert.notEqual(g.app.ctl.state.room.roomId, roomId);
  assert.equal(srv.db.rooms[roomId].rematchRoomId, g.app.ctl.state.room.roomId);
  assert.equal(g.log.shares.length, 0, 'nothing was shared on its own');
});
