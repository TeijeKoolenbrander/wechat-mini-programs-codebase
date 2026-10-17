'use strict';
// js/realtime.js against the mock server's realtime simulation (spec 3A.7, AC 147, 149; V17, V18): watch + safety poll, the 2 s polling fallback after two
// onErrors or without watch, the roomTick at deadline + grace + 1 s with no signal at all, server-offset timers, late answers, fatal codes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMockServer } = require('../js/mock-server');
const { createRealtime, wxWatch } = require('../js/realtime');
const { CONFIG } = require('../core/config');

const T0 = Date.UTC(2026, 10, 3, 4, 0, 0);
const flush = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
};

/** a fake clock + scheduler shared by the mock server (server time) and the client (device time = server time + skew) */
function world(skew) {
  const clock = { t: T0, timers: [], seq: 0 };
  const srv = createMockServer({ now: () => clock.t, seed: 9 });
  const timers = {
    setTimeout(fn, ms) {
      const id = ++clock.seq;
      clock.timers.push({ id, at: clock.t + ms, fn });
      return id;
    },
    clearTimeout(id) {
      clock.timers = clock.timers.filter((x) => x.id !== id);
    },
  };
  clock.advance = async (ms) => {
    const end = clock.t + ms;
    for (;;) {
      clock.timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = clock.timers[0];
      if (!next || next.at > end) break;
      clock.timers.shift();
      clock.t = Math.max(clock.t, next.at);
      next.fn();
      await flush();
    }
    clock.t = end;
    await flush();
  };
  const ids = ['A', 'B', 'C'].map((u) => 'openid-' + u);
  const refs = {};
  for (const id of ids) {
    srv.call('agreeRules', { version: CONFIG.rulesVersion }, id);
    refs[id] = srv.call('joinGroup', { cloudID: 'cid-3-group-1' }, id).groupRef;
  }
  const lobby = srv.call('createRoom', { groupRef: refs[ids[0]] }, ids[0]);
  for (const id of ids.slice(1)) srv.call('joinRoom', { roomId: lobby.roomId, groupRef: refs[id] }, id);
  return { clock, srv, timers, ids, roomId: lobby.roomId, refs, skew: skew || 0 };
}

function client(w, who, o) {
  const events = { rooms: [], modes: [], status: [], gone: [], signals: [] };
  const openid = w.ids[who];
  const rt = createRealtime(Object.assign({
    call: (name, data) => Promise.resolve(w.srv.call(name, data, openid)),
    watch: (id, roomId, h) => w.srv.realtime.watch(id, roomId, h),
    openid,
    now: () => w.clock.t + w.skew,
    timers: w.timers,
    config: { watch: true, pollSec: 2, safetyPollSec: 10 },
    onRoom: (r, info) => events.rooms.push([r, info]),
    onMode: (m) => events.modes.push(m),
    onStatus: (s) => events.status.push(s),
    onGone: (c) => events.gone.push(c),
    onSignal: (s, latency) => events.signals.push([s, latency]),
  }, o || {}));
  return { rt, events, openid };
}

test('AC 147: with watch, a signal triggers getRoom within the same tick; the mode is `watch`; a safety poll every 10 s still runs', async () => {
  const w = world();
  const a = client(w, 0);
  await a.rt.start(w.roomId);
  await flush();
  assert.equal(a.rt.mode, 'watch');
  assert.equal(a.events.rooms.length, 1, 'the first getRoom');
  assert.equal(a.events.rooms[0][0].state, 'lobby');
  // B joins elsewhere... (already seated); the host's own change: start the game from A's side through the server
  const before = a.events.rooms.length;
  w.srv.call('startRoom', { roomId: w.roomId }, w.ids[0]);
  await flush();
  assert.equal(a.events.rooms.length, before + 1, 'one signal -> one getRoom');
  assert.equal(a.events.rooms[a.events.rooms.length - 1][0].state, 'playing');
  assert.equal(a.events.signals.length >= 1, true);
  assert.equal(typeof a.events.signals[a.events.signals.length - 1][1], 'number');
  assert.deepEqual(a.events.modes.map((m) => m.mode), ['watch']);
  // nothing happens for 9 s, then the safety poll fires at 10 s
  const n = a.events.rooms.length;
  await w.clock.advance(9000);
  assert.equal(a.events.rooms.length, n);
  await w.clock.advance(1500);
  assert.equal(a.events.rooms.length, n + 1, 'safety poll after 10 s');
  a.rt.stop();
  await w.clock.advance(60000);
  assert.equal(a.events.rooms.length, n + 1, 'stopped: no more calls');
});

test('AC 147: after two onErrors the client falls back to polling getRoom every 2 s (mode poll, reason error); a missing watch means poll / unsupported', async () => {
  const w = world();
  w.srv.realtime.failNext = 2;
  const a = client(w, 0);
  await a.rt.start(w.roomId);
  await flush();
  // the first watch() failed once (onError #1): still trying; the sim fails the next call too
  assert.ok(['watch', 'poll', 'idle'].includes(a.rt.mode));
  const b = client(w, 1, { watch: (id, roomId, h) => { h.onError(new Error('x')); h.onError(new Error('y')); return { close() {} }; } });
  await b.rt.start(w.roomId);
  await flush();
  assert.equal(b.rt.mode, 'poll');
  assert.deepEqual(b.events.modes[b.events.modes.length - 1], { mode: 'poll', reason: 'error', latencyMs: undefined });
  const n = b.events.rooms.length;
  await w.clock.advance(2100);
  assert.equal(b.events.rooms.length, n + 1);
  await w.clock.advance(4000);
  assert.equal(b.events.rooms.length, n + 3, 'every 2 s');
  // no watch at all (PC WeChat)
  w.srv.realtime.unsupported = true;
  const c = client(w, 2, { watch: undefined });
  await c.rt.start(w.roomId);
  await flush();
  assert.deepEqual([c.rt.mode, c.events.modes[0].reason], ['poll', 'unsupported']);
  // config switch rt.watch false behaves the same
  const d = client(w, 2, { config: { watch: false, pollSec: 2, safetyPollSec: 10 }, watch: (id, r, h) => w.srv.realtime.watch(id, r, h) });
  await d.rt.start(w.roomId);
  assert.equal(d.rt.mode, 'poll');
  [a, b, c, d].forEach((x) => x.rt.stop());
});

test('AC 147: roomTick at deadline + grace + 1 s advances the room with NO signal at all (watch dropped, polling slow): and keeps ticking every 2 s until the round changes', async () => {
  const w = world();
  w.srv.call('startRoom', { roomId: w.roomId }, w.ids[0]);
  const a = client(w, 0);
  const b = client(w, 1);
  w.srv.realtime.paused = true; // a dropped connection: signals are written but never delivered
  await a.rt.start(w.roomId);
  await b.rt.start(w.roomId);
  await flush();
  const r0 = w.srv.db.rooms[w.roomId];
  assert.equal(r0.round, 0);
  // nobody sends; time passes; only the tick plan runs (the safety poll alone would take up to 10 s)
  const at = r0.deadline + 5000 + 1000;
  await w.clock.advance(at - w.clock.t - 1);
  assert.equal(w.srv.db.rooms[w.roomId].round, 0, 'not before deadline + grace + 1 s');
  await w.clock.advance(2);
  assert.equal(w.srv.db.rooms[w.roomId].round, 1, 'the tick advanced the round');
  const last = a.events.rooms[a.events.rooms.length - 1];
  assert.equal(last[0].round, 1);
  assert.equal(last[1].viaTick, true);
  assert.equal(b.events.rooms[b.events.rooms.length - 1][0].round, 1, 'every client ticked; exactly one advance happened on the server');
  assert.equal(w.srv.db.events.filter((e) => e.name === 'room_round').length, 1);
  // the next round: the plan re-arms itself for the new deadline
  const r1 = w.srv.db.rooms[w.roomId];
  await w.clock.advance(r1.deadline + 6000 - w.clock.t + 50);
  assert.equal(w.srv.db.rooms[w.roomId].round, 2);
  a.rt.stop();
  b.rt.stop();
});

test('AC 149: timers use the server offset: a device clock an hour off still shows the right remaining time (within 1 s) after the next getRoom', async () => {
  for (const skew of [3600e3, -7200e3, 0]) {
    const w = world(skew);
    w.srv.call('startRoom', { roomId: w.roomId }, w.ids[0]);
    const a = client(w, 0);
    await a.rt.start(w.roomId);
    await flush();
    await w.clock.advance(12000);
    await a.rt.refresh();
    await flush();
    const r = w.srv.db.rooms[w.roomId];
    const real = r.deadline - w.clock.t;
    assert.ok(Math.abs(a.rt.msLeft() - real) <= 1000, `skew ${skew}: shows ${a.rt.msLeft()} but the server says ${real}`);
    assert.ok(Math.abs(a.rt.offset + a.rt.serverNow() - a.rt.serverNow() - (-skew)) <= 1, 'offset = serverNow - device now');
    // the tick still fires at the SERVER deadline + grace + 1 s whatever the device clock says
    await w.clock.advance(r.deadline + 6000 - w.clock.t + 20);
    assert.equal(w.srv.db.rooms[w.roomId].round, 1, 'skew ' + skew);
    a.rt.stop();
  }
});

test('answers that arrive late or out of order are ignored (version), a network failure is reported once and recovers, fatal codes stop the client', async () => {
  const w = world();
  w.srv.call('startRoom', { roomId: w.roomId }, w.ids[0]);
  const a = client(w, 0);
  await a.rt.start(w.roomId);
  await flush();
  const v = a.rt.last.version;
  a.rt.accept(Object.assign({}, a.rt.last, { version: v - 1, round: 99 }));
  assert.equal(a.rt.last.round, 0, 'an older answer is ignored');
  const n = a.events.rooms.length;
  w.srv.offline = true;
  await a.rt.refresh();
  await a.rt.refresh();
  assert.deepEqual(a.events.status, [{ online: false, code: 'NETWORK' }], 'reported once');
  assert.equal(a.events.rooms.length, n);
  w.srv.offline = false;
  await a.rt.refresh();
  assert.deepEqual(a.events.status[1], { online: true });
  assert.equal(a.events.rooms.length, n + 1);
  // fatal: the room is gone for this player
  w.srv.call('leaveRoom', { roomId: w.roomId }, w.ids[2]);
  const d = client(w, 2);
  await d.rt.start('ZZZZZZZZZZ');
  await flush();
  assert.deepEqual(d.events.gone, ['ROOM_NOT_FOUND']);
  assert.equal(d.rt.running, false);
  a.rt.stop();
});

test('a reveal state keeps the signal listener (rematch banner) but ends the tick plan and polling of rounds', async () => {
  const w = world();
  w.srv.call('startRoom', { roomId: w.roomId }, w.ids[0]);
  w.srv.admin.setModeration({ imageMode: 'async' }); // finishes the game at once
  const a = client(w, 0);
  await a.rt.start(w.roomId);
  await flush();
  assert.equal(a.rt.last.state, 'reveal');
  assert.equal(w.clock.timers.filter((t) => t.at - w.clock.t <= 3000).length, 0, 'no tick is armed for a finished room');
  a.rt.stop();
});

test('wxWatch builds the documented query: where({_openid: <placeholder>, roomId}).watch(); returns undefined when the SDK has no watch', () => {
  const calls = [];
  const db = { collection: (name) => ({ where: (q) => ({ watch: (h) => { calls.push([name, q, Object.keys(h)]); return { close() {} }; } }) }) };
  const w = wxWatch(db)('{openid}', 'ROOM1', { onChange() {}, onError() {} });
  assert.ok(w && typeof w.close === 'function');
  assert.deepEqual(calls, [['chuanhua_room_signals', { _openid: '{openid}', roomId: 'ROOM1' }, ['onChange', 'onError']]]);
  assert.equal(wxWatch({ collection: () => ({ where: () => ({}) }) })('{openid}', 'R', {}), undefined);
  assert.equal(wxWatch({ collection: () => ({}) })('{openid}', 'R', {}), undefined);
});

test('the mock realtime simulation: paused signals are written but not delivered until flush; unsupported hides watch; failNext fails watch() calls', () => {
  const w = world();
  const got = [];
  w.srv.realtime.watch(w.ids[1], w.roomId, { onChange: (s) => got.push(s.docs[0].seq) });
  assert.equal(got.length, 1, 'the init snapshot');
  w.srv.realtime.paused = true;
  w.srv.call('startRoom', { roomId: w.roomId }, w.ids[0]);
  assert.equal(got.length, 1);
  const docs = Object.values(w.srv.db.signals).filter((d) => d._openid === w.ids[1]);
  assert.equal(docs.length, 1);
  assert.equal(Object.keys(docs[0]).filter((k) => k !== '_id').sort().join(','), ['_openid', 'active', 'deadline', 'kind', 'phase', 'roomId', 'round', 'sent', 'seq', 'serverNow', 'state'].join(','));
  w.srv.realtime.paused = false;
  w.srv.realtime.flush();
  assert.equal(got.length, 2);
  assert.ok(got[1] > got[0]);
  w.srv.realtime.unsupported = true;
  assert.throws(() => w.srv.realtime.watch(w.ids[1], w.roomId, {}));
  w.srv.realtime.unsupported = false;
  w.srv.realtime.failNext = 1;
  let err = 0;
  w.srv.realtime.watch(w.ids[1], w.roomId, { onError: () => err++ });
  assert.equal(err, 1);
});
