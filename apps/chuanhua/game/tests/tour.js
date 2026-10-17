'use strict';
// The live tour shared by tests/client-contract.test.js and tests/client-integration.test.js: drives the real controller on the REAL
// renderer through every screen and state a player can reach (a live room of 3 with the faults, a 慢慢传 chain, the lists, the sheets,
// the entry states) and records, per screen and state, the view model the renderer received, the hit areas it returned, and every
// property it read that the vm did not carry.
const assert = require('node:assert/strict');
const { world } = require('./harness');
const { openCard, openRoom, startRoom, pickAll } = require('./flows');
const { CONFIG } = require('../core/config');

const G = { group: 'g1' };

// ---------------------------------------------------------------------------------------------------- structure compare

/** keys a vm may carry beyond the sample (documented additions) or omit (optional per CONTRACT.md) */
const OPTIONAL = /\.(strokes|text|playT|strokesRev|rules|stub|canvas|errCode|adState|scrollY|sheetScroll|keyboardH|drawingNow|timer|chainId|claimId|step|roomId|round|rounds|chainNo|chainCount|newRoomId|otherRoomId|passed|marker|hint|loaded|placeholder|restrictionText|reminderText|warningText|settings|earlyText|mineStarted|heading|important)$/;

function compare(actual, expected, p, problems) {
  if (expected === null || expected === undefined) return;
  if (actual === null || actual === undefined) return; // nullable strings/objects differ by case
  if (/\.strokes$/.test(p) && Array.isArray(actual)) return; // the draw screen gets the recorder's absolute strokes
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return problems.push(p + ' should be an array');
    if (expected.length && actual.length && typeof expected[0] === 'object') for (const el of actual.slice(0, 3)) compare(el, expected[0], p + '[]', problems);
    return undefined;
  }
  if (typeof expected !== typeof actual) return problems.push(`${p}: ${typeof actual} vs ${typeof expected}`);
  if (typeof expected !== 'object') return undefined;
  for (const k of Object.keys(expected)) {
    if (!(k in actual)) {
      if (!OPTIONAL.test(p + '.' + k)) problems.push(`${p}.${k} is missing`);
      continue;
    }
    compare(actual[k], expected[k], p + '.' + k, problems);
  }
  for (const k of Object.keys(actual)) if (!(k in expected) && !OPTIONAL.test(p + '.' + k)) problems.push(`${p}.${k} is not in the contract sample`);
  return undefined;
}

const SKIP_PROPS = new Set(['toJSON', 'then', 'constructor', 'inspect', 'asymmetricMatch', '$$typeof']);
/** deep proxy: records reads of properties the target does not have */
function watch(value, p, sink) {
  if (value === null || typeof value !== 'object') return value;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== Array.prototype) return value;
  return new Proxy(value, {
    get(t, k, r) {
      if (typeof k === 'symbol') return Reflect.get(t, k, r);
      if (!(k in t)) {
        if (!SKIP_PROPS.has(k) && !Array.isArray(t)) sink.add(p + '.' + k);
        return undefined;
      }
      const v = t[k];
      return v !== null && typeof v === 'object' ? watch(v, p + (Array.isArray(t) ? '[]' : '.' + k), sink) : v;
    },
  });
}

/** the state key of a screen's vm */
function key(screen, vm) {
  if (screen === 'draw' || screen === 'describe') return vm.status;
  if (screen === 'sent') return vm.modState;
  if (screen === 'rules' || screen === 'warning' || screen === 'howto') return 'open';
  if (screen === 'roundWait') return vm.offlineText ? 'offline' : vm.passing ? 'passing' : 'ready';
  if (screen === 'report') return vm.state;
  if (screen === 'settings') return 'idle';
  if (screen === 'terms') return 'ready';
  return vm.state;
}

const BAD_TEXT = /undefined|NaN|\[object|\bnull\b/;

/** attach a recorder to a player's renderer: remembers the first vm seen per screen/state, and watches reads */
function attach(p, seen, missing, hitsSeen, problems) {
  const R = p.app.renderer;
  const draw = R.draw;
  const drawOverlay = R.drawOverlay;
  const snapOf = (v) => JSON.parse(JSON.stringify(v));
  R.draw = (screen, ctx, vm, layout) => {
    const snap = snapOf(vm);
    const k = key(screen, vm);
    if (k !== undefined && !seen[screen + '/' + k]) seen[screen + '/' + k] = snap;
    if (screen === 'home' && vm.sheet) {
      if (vm.sheet === 'rules' && vm.rules) seen['rules/open'] = seen['rules/open'] || snapOf(vm.rules);
      if (vm.sheet === 'warning') seen['warning/open'] = seen['warning/open'] || { text: vm.warningText, display: vm.display, muted: vm.muted, features: vm.features, ugc: vm.ugc, t: vm.t };
      if (vm.sheet === 'howto') seen['howto/open'] = seen['howto/open'] || { display: vm.display, muted: vm.muted, features: vm.features, ugc: vm.ugc, t: vm.t };
      if (vm.sheet === 'settings') seen['settings/idle'] = seen['settings/idle'] || snapOf(vm.settings);
      if (vm.sheet === 'startLimit') seen['startLimit/' + (vm.chainStart.adLeft > 0 ? 'ad' : 'none')] = seen['startLimit/' + (vm.chainStart.adLeft > 0 ? 'ad' : 'none')] || { chainStart: snapOf(vm.chainStart), display: vm.display, muted: vm.muted, features: vm.features, ugc: vm.ugc, t: vm.t };
    }
    p.log.text = [];
    const res = draw(screen, ctx, watch(vm, screen, missing), layout);
    if (problems) {
      const txt = p.log.text.join('');
      if (BAD_TEXT.test(txt)) problems.push(screen + '/' + k + ': ' + (txt.match(/.{0,12}(undefined|NaN|\[object|\bnull\b).{0,12}/) || [''])[0]);
    }
    if (k !== undefined && hitsSeen && !hitsSeen[screen + '/' + k]) hitsSeen[screen + '/' + k] = (res || []).map((h) => ({ id: h.id, x: h.x, y: h.y, w: h.w, h: h.h }));
    return res;
  };
  R.drawOverlay = (ctx, ov, layout) => {
    for (const k of ['dialog', 'toast', 'adStub']) if (ov[k] && !seen['overlay/' + k]) seen['overlay/' + k] = snapOf(ov);
    return drawOverlay(ctx, watch(ov, 'overlay', missing), layout);
  };
}

// ------------------------------------------------------------------------------------------------------ the live tour

async function runTour() {
  const seen = {};
  const missing = new Set();
  const hitsSeen = {};
  const problems = [];
  const w = world();
  const mk = async (name, o) => {
    const p = await w.player(name, Object.assign({ rules: true, ...G }, o || {}));
    attach(p, seen, missing, hitsSeen, problems);
    return p;
  };
  const frames = (...ps) => ps.forEach((p) => p.frame());

  // ---- A: first launch, nothing agreed yet: home loading / ready, sheets, the 公约
  const a = await w.player('A', { howto: false, ...G, noWait: true });
  attach(a, seen, missing, hitsSeen, problems);
  a.frame(); // home: loading
  await a.started;
  await a.settle();
  a.frame();
  assert.equal(a.vm().state, 'ready');
  await a.tap('sheet:close'); // 玩法
  await a.tap('home:howto');
  await a.tap('sheet:close');
  await a.tap('home:settings');
  await a.tap('settings:deleteAll');
  a.frame(); // dialog
  await a.tap('dialog:cancel');
  await a.tap('sheet:close');
  await a.tap('home:primary'); // rules sheet over home
  a.frame();
  await a.tap('rules:agree'); // continues: createRoom -> lobby
  assert.equal(a.screen(), 'lobby');
  a.frame(); // lobby with 1 player
  const roomId = a.ctl.state.room.roomId;

  // ---- B, C: room entry then the lobby
  const b = await mk('B');
  const c = await mk('C');
  w.advance(4000);
  b.app.onShow({ scene: 1044, query: { m: roomId }, shareTicket: 'tk-b' });
  b.frame(); // room entry: loading
  await b.settle();
  b.frame(); // joinable
  await b.tap('roomEntry:join');
  await w.run(500, 250);
  frames(a, b); // lobby with 2: the 2-player copy and the link
  w.advance(4000);
  await c.show({ scene: 1044, query: { m: roomId }, shareTicket: 'tk-c' });
  c.frame();
  await c.tap('roomEntry:join');
  await w.run(1000, 250);
  frames(a, b, c); // ready, host and non-host
  a.ctl.onHit('lobby:start');
  a.frame(); // starting
  await a.settle();
  await w.run(2500, 250);
  frames(a, b, c); // pick (live)
  await b.tap('pick:reroll');
  await a.tap('pick:custom');
  a.frame(); // custom open
  a.type('测试繁忙');
  await a.tap('pick:customOk');
  a.frame(); // error: moderation busy
  await a.tap('pick:customCancel');
  c.ctl.onHit('pick:start');
  c.frame(); // sending
  await c.settle();
  c.frame(); // round wait (ready)
  w.advance(CONFIG.room.promptSec * 1000); // the pick time-up for A and B
  a.frame(); // timeUp
  await w.run(2500, 250);
  frames(a, b, c); // draw
  assert.equal(a.screen(), 'draw');
  a.scribble(3);
  frames(a);
  a.ctl.onHit('draw:submit');
  a.frame(); // sending
  await a.settle();
  a.frame(); // round wait
  w.srv.offline = true;
  await w.run(11000, 500); // the 10 s safety poll fails: the screen reconnects by itself
  a.frame(); // round wait: offline
  w.srv.offline = false;
  await w.run(500, 250);
  b.scribble(13); // risky in the mock
  await b.tap('draw:submit');
  b.frame(); // blocked
  w.srv.offline = true;
  c.scribble(2);
  await c.tap('draw:submit');
  c.frame(); // error
  w.srv.offline = false;
  b.ctl.onHit('draw:undo');
  await b.tap('draw:submit').catch(() => {});
  await c.tap('draw:retry');
  frames(a, b, c);
  await w.run(2500, 250); // everyone sent: round 2
  frames(a, b, c);
  assert.equal(a.screen(), 'describe');
  a.type('一只猫在开出租车');
  frames(a);
  a.ctl.onHit('describe:submit');
  a.frame(); // sending
  await a.settle();
  b.type('测试违规二');
  await b.tap('describe:submit');
  b.frame(); // blocked
  b.type('测试繁忙二');
  await b.tap('describe:submit');
  b.frame(); // busy
  w.srv.offline = true;
  b.type('外星人在吃披萨');
  await b.tap('describe:submit');
  b.frame(); // error
  w.srv.offline = false;
  await b.tap('describe:retry');
  c.type('猫');
  w.advance(CONFIG.room.describeSec * 1000); // C times out: the empty marker
  c.frame(); // timeUp
  await w.run(4000, 250);
  assert.equal(a.screen(), 'overview');
  a.frame(); // overview (ready)
  const ov = a.vm();
  await a.tap('overview:chain:' + ov.cards[0].chainId);
  a.frame(); // step-through ready (replaying)
  w.advance(3000);
  await a.tap('stepthrough:prevHalf');
  await a.tap('stepthrough:dot:0');
  a.frame();
  await a.tap('stepthrough:nextChain');
  await a.tap('stepthrough:dot:0');
  await a.tap('stepthrough:nextChain');
  await a.tap('stepthrough:dot:0');
  await a.tap('stepthrough:done');
  frames(a, b, c);
  // a report in the step-through
  await b.tap('overview:chain:' + b.vm().cards[0].chainId);
  await b.tap('stepthrough:dot:1');
  if (b.has('stepthrough:report')) {
    await b.tap('stepthrough:report');
    b.frame(); // report idle
    await b.tap('report:reason:abuse');
    w.srv.offline = true;
    await b.tap('report:submit');
    b.frame(); // report error
    w.srv.offline = false;
    await b.tap('report:retry');
    b.frame(); // done
    w.advance(2000);
  }
  await b.tap('stepthrough:back');
  // rematch banner
  await a.tap('overview:rematch');
  await w.run(1500, 250);
  b.frame(); // overview with the banner
  // ---- loading / offline states of the reveal screens
  w.srv.offline = true;
  c.ctl.onHit('overview:retry');
  c.frame(); // overview: loading
  await c.settle();
  c.frame(); // overview: offline
  w.srv.offline = false;
  await c.tap('overview:retry');
  const origRoomReveal = c.app.api.getRoomReveal;
  c.app.api.getRoomReveal = async () => ({ ok: false, code: 'INTERNAL' });
  c.ctl.onHit('overview:retry');
  await c.settle();
  c.frame(); // overview: error
  c.app.api.getRoomReveal = origRoomReveal;
  await c.tap('overview:retry');
  // the step-through: offline and error
  const origGetReveal = c.app.api.getReveal;
  c.app.api.getReveal = async () => ({ ok: false, code: 'NETWORK' });
  c.ctl.state.reveal;
  c.ctl.X.reveal.openChain('ABCDEFGHJK', { from: 'home' });
  await c.settle();
  c.frame(); // step-through: offline
  c.app.api.getReveal = async () => ({ ok: false, code: 'INTERNAL' });
  await c.tap('stepthrough:retry');
  c.frame(); // step-through: error
  c.app.api.getReveal = origGetReveal;
  await c.tap('stepthrough:back');

  // ---- a lone player: lobby states closed / removed, room entry states
  const d = await mk('D');
  await d.tap('home:primary');
  const dRoom = d.ctl.state.room.roomId;
  w.srv.db.rooms[dRoom].state = 'closed';
  w.srv.db.rooms[dRoom].version += 1;
  await d.ctl.X.room.refresh();
  await d.settle();
  d.frame(); // lobby closed
  await d.tap('lobby:home');
  const e = await mk('E');
  await e.tap('home:primary');
  const eRoom = e.ctl.state.room.roomId;
  w.srv.db.rooms[eRoom].state = 'removed';
  w.srv.db.rooms[eRoom].version += 1;
  await e.ctl.X.room.refresh();
  await e.settle();
  e.frame(); // lobby removed
  await e.tap('lobby:home');
  // lobby offline
  const f = await mk('F');
  await f.tap('home:primary');
  w.srv.offline = true;
  await w.run(11000, 500);
  f.frame(); // lobby offline
  w.srv.offline = false;
  await f.ctl.X.room.refresh();
  await f.settle();
  const x = await mk('X', { group: 'g9' });
  const fRoom = f.ctl.state.room.roomId;
  f.ctl.state.group = { status: 'ok', groupRef: w.srv.call('joinGroup', { cloudID: 'cloud-g1' }, f.openid).groupRef, shareTicket: null, home: null };
  await f.tap('lobby:back');
  await f.tap('dialog:confirm');
  await f.tap('home:primary');
  const gRoom = f.ctl.state.room.roomId;
  w.advance(4000);
  await x.show({ scene: 1044, query: { m: gRoom }, shareTicket: 'tk-x' });
  x.frame(); // wrongGroup
  await x.tap('roomEntry:home');
  w.advance(4000);
  await x.show({ scene: 1044, query: { m: 'ZZZZZZZZZZ' }, shareTicket: 'tk-x2' });
  x.frame(); // notFound
  await x.tap('roomEntry:home');
  w.srv.offline = true;
  w.advance(4000);
  await x.show({ scene: 1044, query: { m: gRoom }, shareTicket: 'tk-x3' });
  x.frame(); // offline
  w.srv.offline = false;
  await x.tap('roomEntry:retry');
  await x.tap('roomEntry:home');
  // started / full / closed / teaser entries
  const guests = [];
  for (let i = 0; i < 9; i++) guests.push(await mk('H' + i));
  for (const gst of guests) {
    w.advance(4000);
    await gst.show({ scene: 1044, query: { m: gRoom }, shareTicket: 'tk-h' + w.t });
    await gst.tap('roomEntry:join');
  }
  const late = await mk('Late');
  w.advance(4000);
  await late.show({ scene: 1044, query: { m: gRoom }, shareTicket: 'tk-late' });
  late.frame(); // full
  await late.tap('roomEntry:home');
  await f.settle();
  await f.ctl.X.room.refresh();
  await f.tap('lobby:start');
  await w.run(2500, 250);
  w.advance(4000);
  const late2 = await mk('Late2');
  await late2.show({ scene: 1044, query: { m: gRoom }, shareTicket: 'tk-late2' });
  late2.frame(); // started
  // in another room
  const g = await mk('G');
  await g.tap('home:primary');
  const gOwn = g.ctl.state.room.roomId;
  void gOwn;
  const g2 = await mk('G2');
  await g2.tap('home:primary');
  const g2Room = g2.ctl.state.room.roomId;
  w.advance(4000);
  await g.show({ scene: 1044, query: { m: g2Room }, shareTicket: 'tk-g2' });
  g.frame(); // a member goes straight to the lobby of their own room
  // a finished room seen by a non-member: the teaser (the first game: room A/B/C)
  const t1 = await mk('T1');
  await t1.show({ scene: 1044, query: { m: roomId }, shareTicket: 'tk-t1' });
  t1.frame(); // teaser (room)
  await t1.tap('teaser:home');

  // ---- 慢慢传: pick, draw, sent, entry, reveal
  // home: error and the one-time warning
  const hE = await mk('HE');
  const origHome = hE.app.api.getHome;
  hE.app.api.getHome = async () => ({ ok: false, code: 'INTERNAL' });
  await hE.ctl.refreshHome();
  hE.frame(); // home: error
  hE.app.api.getHome = origHome;
  w.srv.db.players[hE.openid].warnPending = true;
  await hE.ctl.refreshHome();
  hE.frame(); // the warning sheet
  await hE.tap('warning:ok');
  const p1 = await mk('P1');
  p1.ctl.onHit('home:slow');
  p1.frame(); // pick loading
  await p1.settle();
  p1.frame(); // pick ready
  await p1.tap('pick:reroll');
  p1.ctl.onHit('pick:start');
  p1.frame(); // creating
  await p1.settle();
  p1.frame(); // draw (coach line)
  p1.scribble(3);
  await p1.tap('draw:submit');
  p1.frame(); // sent passed
  const chainId = p1.ctl.state.sent.chainId;
  const p2 = await mk('P2');
  w.advance(4000);
  p2.app.onShow({ scene: 1044, query: { k: chainId }, shareTicket: 'tk-p2' });
  p2.frame(); // entry loading
  await p2.settle();
  p2.frame(); // claimable
  await p2.tap('entry:claim');
  p2.frame();
  const p3 = await mk('P3');
  await openCard(w, p3, chainId);
  p3.frame(); // taken
  await p2.tap('describe:back');
  await p2.tap('dialog:confirm'); // the claim is released
  await p2.tap('entry:claim');
  p2.type('一个大饼在天上');
  await p2.tap('describe:submit');
  p2.frame(); // sent
  await openCard(w, p2, chainId);
  p2.frame(); // prevMine
  // marker sent: a time-up with an empty canvas
  await openCard(w, p3, chainId);
  await p3.tap('entry:claim');
  w.advance(61 * 1000);
  await p3.settle();
  p3.frame(); // sent: marker
  await p3.tap('sent:home');
  // the 6 棒 for a chain reveal
  const p4 = await mk('P4');
  const id2 = await (async () => {
    await p4.tap('home:slow');
    await p4.tap('pick:start');
    p4.scribble(2);
    await p4.tap('draw:submit');
    return p4.ctl.state.sent.chainId;
  })();
  const p5 = await mk('P5');
  const step = async (p, kind, txt) => {
    await openCard(w, p, id2);
    await p.tap('entry:claim');
    if (kind === 'draw') p.scribble(2);
    else p.type(txt);
    await p.tap(kind === 'draw' ? 'draw:submit' : 'describe:submit');
  };
  await step(p5, 'describe', '第二棒的话');
  await step(p4, 'draw');
  await step(p5, 'describe', '第四棒的话');
  await step(p4, 'draw');
  await step(p5, 'describe', '第六棒的话');
  assert.equal(p5.screen(), 'stepthrough');
  p5.frame();
  w.advance(3000);
  p5.frame();
  await p5.tap('stepthrough:back');
  await openCard(w, p4, id2); // entry revealedParticipant
  p4.frame();
  const out = await mk('Out');
  await openCard(w, out, id2); // entry revealedTeaser
  out.frame();
  await openCard(w, out, id2, 'r'); // teaser (chain)
  out.frame();
  await out.tap('teaser:report');
  out.frame(); // report sheet over the teaser
  await out.tap('report:cancel');
  // ---- lists
  await p5.tap('home:album');
  p5.frame();
  await p5.tap('album:back');
  w.srv.offline = true;
  await p5.tap('home:album');
  p5.frame(); // album: offline (cached) or error
  await p5.tap('album:back');
  await p5.ctl.refreshHome();
  p5.frame(); // home: offline
  w.srv.offline = false;
  await p5.ctl.refreshHome();
  const noGroup = await mk('NG', { group: undefined });
  await noGroup.tap('home:groupList');
  noGroup.frame(); // group: noGroup
  const gp = await mk('GP');
  await openCard(w, gp, id2, 'r');
  await gp.tap('teaser:home');
  await gp.tap('home:groupList');
  gp.frame(); // group: ready
  await gp.tap('group:back');
  w.srv.offline = true;
  await gp.tap('home:groupList');
  gp.frame(); // group: error
  w.srv.offline = false;
  await gp.tap('group:retry');
  await gp.tap('group:back');
  // mine
  await p1.ctl.X.goHome();
  await p1.settle();
  await p1.tap('home:album');
  const item = p1.vm().items.find((i) => i.kind === 'chain');
  await p1.tap('album:chain:' + item.id);
  p1.frame();
  await p1.ctl.X.openMine(item.id, 'entry');
  await p1.settle();
  p1.frame(); // mine ready
  await p1.tap('mine:back');
  // entry states
  const E = await mk('EE');
  const ER = await mk('ER', { rules: false });
  await openCard(w, E, 'ZZZZZZZZZZ');
  E.frame(); // notFound
  w.srv.offline = true;
  await openCard(w, E, id2);
  E.frame(); // offline
  w.srv.offline = false;
  const origGetChain = E.app.api.getChain;
  E.app.api.getChain = async () => ({ ok: false, code: 'INTERNAL' });
  await E.ctl.X.goHome();
  await E.settle();
  await openCard(w, E, id2);
  E.frame(); // error
  E.app.api.getChain = origGetChain;
  await E.ctl.X.goHome();
  await E.settle();
  // a chain that is open for claiming (A... P4 started id3), for restricted / rulesRequired / ugcPaused / dailyLimit
  const q = await mk('Q');
  const id3 = await (async () => {
    await q.tap('home:slow');
    await q.tap('pick:start');
    q.scribble(2);
    await q.tap('draw:submit');
    return q.ctl.state.sent.chainId;
  })();
  await openCard(w, ER, id3);
  ER.frame(); // rulesRequired
  w.srv.db.players[E.openid].restrictedUntil = w.t + 3600e3;
  w.srv.db.players[E.openid].restrictedAt = w.t;
  await E.ctl.X.goHome();
  await E.settle();
  await E.ctl.refreshHome();
  E.frame(); // home with the restriction banner
  await openCard(w, E, id3);
  E.frame(); // restricted
  w.srv.db.players[E.openid].restrictedUntil = 0;
  const lim = await mk('LIM');
  await openCard(w, lim, id3);
  w.srv.db.players[lim.openid].day.steps = CONFIG.allowances.stepsPerDay;
  await lim.tap('entry:claim');
  lim.frame(); // dailyLimit
  w.srv.appConfig = { ugc: { createEnabled: false, viewEnabled: true } };
  await q.ctl.refreshHome();
  q.frame(); // home: the paused banner
  await openCard(w, ER, id3);
  await openCard(w, E, id3);
  E.frame(); // ugcPaused
  w.srv.appConfig = { ugc: { createEnabled: true, viewEnabled: false } };
  await openCard(w, p5, id2, 'r');
  p5.frame(); // step-through: paused
  await p5.tap('stepthrough:back');
  await openCard(w, p4, id2);
  w.srv.appConfig = null;
  // removed (hidden) and expired
  w.srv.db.chains[id3].hidden = 'report';
  await openCard(w, E, id3);
  E.frame(); // removed
  await openCard(w, out, id3, 'r');
  out.frame(); // teaser: removed
  await openCard(w, out, 'ZZZZZZZZZZ', 'r');
  out.frame(); // teaser: notFound
  w.srv.offline = true;
  await openCard(w, out, id2, 'r');
  out.frame(); // teaser: offline or step-through offline
  w.srv.offline = false;
  w.sweep(49 * 60);
  await openCard(w, p2, chainId);
  p2.frame(); // expired
  // sheets and overlays
  await p1.ctl.X.goHome();
  await p1.settle();
  p1.ctl.state.me.startsLeft = 0;
  p1.ctl.state.me.adStartsLeft = 2;
  p1.app.invalidate();
  await p1.tap('home:slow');
  p1.frame(); // startLimit (ad)
  await p1.tap('startLimit:ad');
  p1.frame(); // ad stub
  p1.app.ads.stubSkip();
  await p1.tap('sheet:close');
  p1.ctl.state.me.adStartsLeft = 0;
  await p1.tap('home:slow');
  p1.frame(); // startLimit (none)
  await p1.tap('sheet:close');
  await p1.tap('home:settings');
  await p1.tap('settings:terms');
  p1.frame(); // terms
  await p1.tap('terms:back');
  await p1.tap('sheet:close');
  return { seen, missing, hitsSeen, problems, w };
}

module.exports = { runTour, compare, watch, key, attach, OPTIONAL };
