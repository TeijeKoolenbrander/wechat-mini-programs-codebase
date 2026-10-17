'use strict';
// QA for spec rev. 2.1 (founder 2026-10-16): up to 5 换一批 per pick. Gaps the dev tests leave: the count across a kill/relaunch and a re-entry, rapid taps while a
// reroll is in flight, taps in every non-ready state, and a request that is refused by the server while the client still shows a count (out of sync).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { world } = require('./harness');
const { G } = require('./flows');
const { CONFIG } = require('../core/config');

const label = (a) => a.vm().rerollLabel;

test('QA rev 2.1: the count survives leaving the pick, a kill and a relaunch (慢慢传); a used-up pick stays greyed after relaunch', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  await a.tap('home:slow');
  assert.equal(label(a), '换一批（剩5次）');
  await a.tap('pick:reroll');
  await a.tap('pick:reroll');
  assert.equal(label(a), '换一批（剩3次）');
  const ids3 = a.vm().prompts.map((p) => p.id);
  // back out and in again: same set, same count (no reset)
  await a.tap('pick:back');
  await a.tap('home:slow');
  assert.equal(label(a), '换一批（剩3次）', 're-entry keeps the count');
  assert.deepEqual(a.vm().prompts.map((p) => p.id), ids3, 're-entry shows the current set');
  // kill and relaunch with the same storage
  a.app.onHide();
  a.kill();
  const a2 = await w.player('A2', { rules: true, as: 'A', storage: a.storage, ...G });
  await a2.tap('home:slow');
  assert.equal(label(a2), '换一批（剩3次）', 'relaunch keeps the count');
  assert.deepEqual(a2.vm().prompts.map((p) => p.id), ids3);
  for (let i = 0; i < 3; i++) await a2.tap('pick:reroll');
  assert.equal(label(a2), '换一批机会已用完');
  assert.equal(a2.has('pick:reroll'), false);
  a2.app.onHide();
  a2.kill();
  const a3 = await w.player('A3', { rules: true, as: 'A', storage: a2.storage, ...G });
  await a3.tap('home:slow');
  assert.equal(label(a3), '换一批机会已用完', 'used-up survives a relaunch');
  assert.equal(a3.vm().rerollDisabled, true);
  assert.equal(a3.has('pick:reroll'), false, 'no hit id on the greyed button');
  assert.ok(a3.has('pick:custom') && a3.has('pick:start'));
  // a pick that is started consumes the roll: the next pick has 5 again
  await a3.tap('pick:start');
  assert.equal(a3.screen(), 'draw');
});

test('QA rev 2.1: rapid taps on 换一批 while a reroll is in flight send exactly one request; a second device cannot exceed 5', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  await a.tap('home:slow');
  const calls = [];
  const real = a.app.api.rollPrompts;
  let release;
  const gate = new Promise((r) => (release = r));
  a.app.api.rollPrompts = async (d) => {
    calls.push(d);
    await gate;
    return real(d);
  };
  const h = a.hit('pick:reroll');
  for (let i = 0; i < 12; i++) a.tapAt(h.x + h.w / 2, h.y + h.h / 2);
  for (let i = 0; i < 5; i++) a.ctl.onHit('pick:reroll');
  await a.settle();
  assert.equal(calls.length, 1, 'one request in flight, the other 16 taps do nothing');
  assert.equal(a.vm().state, 'rerolling');
  assert.equal(a.has('pick:reroll'), false, 'not tappable while in flight');
  release();
  await a.settle();
  a.app.api.rollPrompts = real;
  assert.equal(a.vm().rerollLeft, 4, 'exactly one reroll was spent');
  // 12 server-side rerolls in a row from a stale-free client id (a crafted loop): 4 succeed, the rest REROLL_LIMIT, count never below 0
  const id = w.id('A');
  let ok = 0;
  let lim = 0;
  for (let i = 0; i < 12; i++) {
    const cur = w.srv.call('rollPrompts', {}, id);
    const r = w.srv.call('rollPrompts', { reroll: true, rollId: cur.rollId }, id);
    if (r.ok) ok++;
    else if (r.code === 'REROLL_LIMIT') lim++;
  }
  assert.deepEqual([ok, lim], [CONFIG.roll.rerollsPerPick - 1, 12 - (CONFIG.roll.rerollsPerPick - 1)]);
  // the client, still showing "剩4次", taps again: the server says REROLL_LIMIT, the button greys, the cards stay
  const shownBefore = a.vm().prompts.map((p) => p.id);
  const stale = a.vm().rollId;
  assert.notEqual(stale, w.srv.call('rollPrompts', {}, id).rollId, 'the client is out of sync now');
  await a.tap('pick:reroll'); // stale rollId -> BAD_REQUEST -> reload of the current roll
  assert.equal(a.vm().rerollLeft, 0, 'the client adopts the server count');
  assert.equal(a.vm().rerollLabel, '换一批机会已用完');
  assert.notDeepEqual(a.vm().prompts.map((p) => p.id), shownBefore);
  assert.equal(a.has('pick:reroll'), false);
});

test('QA rev 2.1: 换一批 does nothing outside the ready state (loading, error, offline, sending), and nothing is sent', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  await a.tap('home:slow');
  const calls = [];
  const real = a.app.api.rollPrompts;
  a.app.api.rollPrompts = (d) => (calls.push(d), real(d));
  const p = a.ctl.state.pick;
  for (const st of ['loading', 'error', 'offline', 'sending', 'timeUp', 'rerolling']) {
    p.state = st;
    a.ctl.onHit('pick:reroll');
    await a.settle();
    assert.equal(calls.length, 0, 'no request in state ' + st);
    assert.equal(p.rerollLeft, 5, 'count unchanged in state ' + st);
  }
  p.state = 'ready';
  p.forced = true;
  a.ctl.onHit('pick:reroll');
  await a.settle();
  assert.equal(calls.length, 0, 'no request once the pick is forced');
  p.forced = false;
  await a.tap('pick:reroll');
  assert.equal(calls.length, 1, 'ready: the tap works');
  a.app.api.rollPrompts = real;
});

test('QA rev 2.1: no network on a reroll keeps the cards and the count and shows a toast; the next tap works', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  await a.tap('home:slow');
  const ids = a.vm().prompts.map((p) => p.id);
  const real = a.app.api.rollPrompts;
  a.app.api.rollPrompts = async () => ({ ok: false, code: 'NETWORK' });
  await a.tap('pick:reroll');
  assert.equal(a.vm().state, 'ready');
  assert.equal(a.vm().rerollLeft, 5, 'a failed reroll costs nothing');
  assert.deepEqual(a.vm().prompts.map((p) => p.id), ids);
  assert.ok(a.toast(), 'a toast tells the player');
  a.app.api.rollPrompts = real;
  await a.tap('pick:reroll');
  assert.equal(a.vm().rerollLeft, 4);
});
