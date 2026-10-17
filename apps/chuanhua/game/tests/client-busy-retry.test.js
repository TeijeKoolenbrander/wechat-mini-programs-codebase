'use strict';
// BUSY_RETRY (the backend's "the transaction ran out of attempts, nothing was committed" answer) and, for sends, INTERNAL: the client
// repeats with short jittered waits and never shows either code to a player (QA-R2-2, client side). The server is a mock that
// answers the code on demand; the rest is the real mock server.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { world } = require('./harness');
const { G, startChain, openCard, openRoom } = require('./flows');
const { createApi, BUSY_CODE } = require('../js/api');

const FAST = { tries: 3, baseMs: 1, jitterMs: 2 };

/** make the next `n` calls of `fn` on the world's server answer `code` (n = Infinity: until restored); resolves a restore handle */
function busy(w, fn, n, code) {
  const orig = w.srv.call;
  const h = { count: 0, restore: () => (w.srv.call = orig) };
  w.srv.call = function (name, data, user) {
    if (name === fn && h.count < n) {
      h.count++;
      return { ok: false, code: code || BUSY_CODE, message: 'x' };
    }
    return orig.call(this, name, data, user);
  };
  return h;
}

test('api: BUSY_RETRY is repeated with jittered waits until it clears; the caller only sees the final answer', async () => {
  let calls = 0;
  const waits = [];
  const mockServer = { call: () => (++calls < 3 ? { ok: false, code: BUSY_CODE } : { ok: true, n: calls }) };
  const api = createApi({ mockServer, busyRetry: { ...FAST, baseMs: 100, jitterMs: 100, random: () => 0.5 }, setTimeout: (f, ms) => (waits.push(ms), setTimeout(f, 0)) });
  const r = await api.getRoom({ roomId: 'x' });
  assert.deepEqual(r, { ok: true, n: 3 });
  assert.deepEqual(waits, [150, 250], 'short, growing, jittered waits');
});

test('api: a call that stays BUSY_RETRY gives up after the budget and returns the code (the controller treats it as a network error)', async () => {
  let calls = 0;
  const api = createApi({ mockServer: { call: () => (++calls, { ok: false, code: BUSY_CODE }) }, busyRetry: FAST });
  const r = await api.claimStep({ chainId: 'c' });
  assert.equal(r.code, BUSY_CODE);
  assert.equal(calls, 4, '1 call + 3 repeats');
});

test('api: INTERNAL is repeated for the two sends only (documented fallback until BUSY_RETRY is everywhere); other calls return it at once', async () => {
  const seen = {};
  const mockServer = { call: (name) => ((seen[name] = (seen[name] || 0) + 1), { ok: false, code: 'INTERNAL' }) };
  const api = createApi({ mockServer, busyRetry: FAST });
  assert.equal((await api.submitRoomStep({})).code, 'INTERNAL');
  assert.equal((await api.submitStep({})).code, 'INTERNAL');
  assert.equal((await api.getHome({})).code, 'INTERNAL');
  assert.equal(seen.submitRoomStep, 4);
  assert.equal(seen.submitStep, 4);
  assert.equal(seen.getHome, 1);
});

test('api: a real failure code is never repeated', async () => {
  let calls = 0;
  const api = createApi({ mockServer: { call: () => (++calls, { ok: false, code: 'TAKEN' }) }, busyRetry: FAST });
  assert.equal((await api.claimStep({})).code, 'TAKEN');
  assert.equal(calls, 1);
});

test('慢慢传: a send that meets BUSY_RETRY twice goes through on its own; the player lands on 已传出 without an error', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const h = busy(w, 'submitStep', 2);
  await a.tap(a.has('home:slow') ? 'home:slow' : 'home:primary');
  await a.tap('pick:start');
  a.scribble(3);
  await a.tap('draw:submit');
  for (let i = 0; i < 60 && a.screen() !== 'sent'; i++) await new Promise((r) => setTimeout(r, 20)).then(() => a.settle());
  assert.equal(a.screen(), 'sent');
  assert.equal(h.count, 2);
  h.restore();
});

test('慢慢传: a claim that meets BUSY_RETRY is repeated and succeeds', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const b = await w.player('B', { rules: true, ...G });
  const id = await startChain(a);
  await openCard(w, b, id);
  const h = busy(w, 'claimStep', 2);
  await b.tap('entry:claim');
  for (let i = 0; i < 60 && b.screen() !== 'describe'; i++) await new Promise((r) => setTimeout(r, 20)).then(() => b.settle());
  assert.equal(b.screen(), 'describe');
  assert.equal(h.count, 2);
  h.restore();
});

test('慢慢传: a send that stays busy shows 没传出去 (no INTERNAL / BUSY_RETRY text), keeps the work, and a later tap sends it', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const h = busy(w, 'submitStep', Infinity, BUSY_CODE);
  await a.tap(a.has('home:slow') ? 'home:slow' : 'home:primary');
  await a.tap('pick:start');
  a.scribble(3);
  await a.tap('draw:submit');
  for (let i = 0; i < 80 && a.ctl.state.turn && a.ctl.state.turn.sending !== false && a.ctl.state.turn.status !== 'error'; i++) await new Promise((r) => setTimeout(r, 20)).then(() => a.settle());
  assert.equal(a.screen(), 'draw', 'still on the drawing, work kept');
  const text = a.frame();
  assert.ok(!/BUSY_RETRY|INTERNAL|出了点小问题/.test(text), text);
  assert.match(text, /没传出去/);
  h.restore();
  await a.tap('draw:submit');
  assert.equal(a.screen(), 'sent');
});

test('live room: a forced send that meets BUSY_RETRY / INTERNAL keeps retrying every second and the drawing gets through', async () => {
  const w = world();
  const ps = [];
  for (const n of 'ABC') ps.push(await w.player(n, { rules: true, ...G }));
  const roomId = await openRoom(w, ps[0], ps.slice(1));
  assert.ok(roomId);
  const { startRoom, pickAll, until } = require('./flows');
  await startRoom(w, ps[0], ps);
  await pickAll(w, ps);
  for (const p of ps) await until(w, p, 'draw', 15000);
  // A scribbles, never taps send; every submitRoomStep of A answers BUSY_RETRY for the first 3 tries, then INTERNAL once
  const orig = w.srv.call;
  let n = 0;
  w.srv.call = function (name, data, user) {
    if (name === 'submitRoomStep' && user === ps[0].openid && ++n <= 4) return { ok: false, code: n <= 3 ? BUSY_CODE : 'INTERNAL', message: 'x' };
    return orig.call(this, name, data, user);
  };
  ps[0].scribble(2);
  for (const p of ps.slice(1)) {
    p.scribble(2);
    await p.tap('draw:submit');
  }
  for (let i = 0; i < 200 && (n < 5 || ps[0].screen() === 'draw'); i++) {
    await w.run(1000, 500); // virtual seconds; the api waits between repeats in real (short) time
    await new Promise((r) => setTimeout(r, 30));
  }
  w.srv.call = orig;
  assert.ok(n >= 5, 'the forced send was repeated: ' + n);
  const text = ps[0].frame();
  assert.ok(!/BUSY_RETRY|INTERNAL|出了点小问题/.test(text), text);
  assert.notEqual(ps[0].screen(), 'draw', 'A moved on: the drawing was accepted');
});
