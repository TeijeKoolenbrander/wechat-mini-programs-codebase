'use strict';
// Shared player flows for the headless tests: each acts only through taps on hit areas and touches on the canvas, on the REAL
// renderer (the hit ids the screens return), against the in-memory mock server (the real core rules).
const assert = require('node:assert/strict');

const G = { group: 'g1' };

// ------------------------------------------------------------------------------------------------------ 慢慢传

/** A starts a chain from home (慢慢传 -> pick -> draw 第 1 棒): 3 strokes, submit. Returns the chain id. */
async function startChain(a, strokes) {
  if (a.screen() === 'sent') await a.tap('sent:home');
  await a.tap(a.has('home:slow') ? 'home:slow' : 'home:primary'); // live rooms off: 开一条接龙 is the primary
  await a.tap('pick:start');
  assert.equal(a.screen(), 'draw');
  a.scribble(strokes || 3);
  await a.tap('draw:submit');
  assert.equal(a.screen(), 'sent');
  return a.ctl.state.sent.chainId;
}

/** a player opens a card of the chain from the group (warm start with a share ticket) */
async function openCard(w, p, chainId, kind) {
  w.advance(4000); // a new card is a new entry (the same one within 3 s counts once)
  await p.show({ scene: 1044, query: { [kind || 'k']: chainId }, shareTicket: 'tk' + w.t });
}

async function describeStep(w, p, chainId, text) {
  await openCard(w, p, chainId);
  assert.equal(p.vm().state, 'claimable', 'entry state for ' + p.name);
  await p.tap('entry:claim');
  assert.equal(p.screen(), 'describe');
  p.type(text);
  await p.tap('describe:submit');
}

async function drawStep(w, p, chainId, strokes) {
  await openCard(w, p, chainId);
  assert.equal(p.vm().state, 'claimable', 'entry state for ' + p.name);
  await p.tap('entry:claim');
  assert.equal(p.screen(), 'draw');
  p.scribble(strokes || 3);
  await p.tap('draw:submit');
}

/** a complete chain, A on 1/3/5 and B on 2/4/6; resolves the chain id (B ends on the step-through) */
async function fullChain(w, a, b) {
  const id = await startChain(a);
  await describeStep(w, b, id, '一个大饼在天上');
  await drawStep(w, a, id);
  await describeStep(w, b, id, '外星人在吃披萨');
  await drawStep(w, a, id);
  await describeStep(w, b, id, '企鹅在沙漠晒太阳');
  return id;
}

// ------------------------------------------------------------------------------------------------------ live rooms

/** the host taps 开一局; each guest opens the room card from the group and taps 加入这一局. Resolves the room id. */
async function openRoom(w, host, guests) {
  if (host.screen() !== 'home') await host.tap('sent:home');
  await host.tap('home:primary');
  assert.equal(host.screen(), 'lobby');
  const roomId = host.ctl.state.room.roomId;
  for (const g of guests) {
    w.advance(4000);
    await g.show({ scene: 1044, query: { m: roomId }, shareTicket: 'tk' + w.t });
    assert.equal(g.screen(), 'roomEntry', g.name + ' sees the room entry');
    await g.tap('roomEntry:join');
    assert.equal(g.screen(), 'lobby', g.name + ' is in the lobby');
  }
  await w.run(1000, 250);
  return roomId;
}

/** the host starts; everyone ends on the round-0 pick screen */
async function startRoom(w, host, players) {
  await host.tap('lobby:start');
  await w.run(2500, 250);
  for (const p of players) assert.equal(p.screen(), 'pick', p.name + ' picks a prompt');
}

/** everyone picks the preselected prompt (就这个) */
async function pickAll(w, players) {
  for (const p of players) await p.tap('pick:start');
  await w.run(2500, 250);
}

/** wait (virtual time) until the player is on `screen` */
async function until(w, p, screen, maxMs) {
  const limit = maxMs || 20000;
  for (let t = 0; t < limit && p.screen() !== screen; t += 250) await w.run(250, 250);
  assert.equal(p.screen(), screen, p.name + ' expected ' + screen + ' within ' + limit + ' ms');
}

module.exports = { G, startChain, openCard, describeStep, drawStep, fullChain, openRoom, startRoom, pickAll, until };
