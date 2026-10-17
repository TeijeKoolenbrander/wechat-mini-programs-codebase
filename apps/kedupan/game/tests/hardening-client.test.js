'use strict';
// Client side of the security-audit fixes: M1 (raw cloudID), M3 (RATE_LIMITED handled gracefully), L4 (answer withheld
// until asked), I3 (hostile query strings), M1/L4 in the mock (parity with the cloud functions).
const test = require('node:test');
const assert = require('node:assert/strict');
const { getServerContent: getContent } = require('../core/content');
const { boot } = require('./harness');
const { V } = require('../core/input');
const { createMockServer, encodeMockCloudID, decodeMockCloudID } = require('../js/mock-server');
const { CONFIG } = require('../core/config');

const content = getContent();
const enter = (id) => ({ scene: 1007, query: { r: id } });

async function ready(t, opts) {
  const h = await boot(t, opts);
  if (h.has('sheet:close')) await h.tap('sheet:close');
  return h;
}
function hostedBy(h, openid) {
  const sp = content.spectra[0];
  const r = h.srv.callAs(openid, 'createRound', { spectrumId: sp.id });
  h.srv.callAs(openid, 'setClue', { roundId: r.roundId, clueMode: 'preset', clueItemId: sp.items[0].id });
  return r.roundId;
}

// ---- M1 ---------------------------------------------------------------------------------------------------------------

test('M1: V.joinGroup accepts only a raw cloudID string; objects and groupData are refused', () => {
  assert.deepEqual(V.joinGroup({ cloudID: 'abc_DEF-123' }), { ok: true, v: { cloudID: 'abc_DEF-123' } });
  for (const bad of [{}, { groupData: { cloudID: 'c', data: { opengid: 'G', chat_type: 3 } } }, { cloudID: { cloudID: 'c', data: { opengid: 'G', chat_type: 3 } } }, { cloudID: '' }, { cloudID: 5 }, { cloudID: 'has space' }, { cloudID: 'abcdefg' }, { cloudID: 'x'.repeat(513) }, { cloudID: 'bad.char/ok12' }, null, 'str']) {
    assert.equal(V.joinGroup(bad).ok, false, JSON.stringify(bad));
  }
  assert.deepEqual(Object.keys(V.joinGroup({ cloudID: 'abcdefgh', groupData: { data: {} } }).v), ['cloudID'], 'unknown fields are dropped');
});

test('M1: the client sends the raw cloudID string to joinGroup (never a CloudID wrapper or a decrypted-looking object)', async (t) => {
  const h = await ready(t, { enter: { scene: 1044, query: { s: 'd' }, shareTicket: 'TICKET-1' } });
  const call = h.srv.calls.find((c) => c.name === 'joinGroup');
  assert.ok(call);
  assert.deepEqual(Object.keys(call.data), ['cloudID']);
  assert.equal(typeof call.data.cloudID, 'string');
  assert.ok(decodeMockCloudID(call.data.cloudID), 'the mock decodes its synthetic cloudID');
  assert.equal(h.view().vm.group.status, 'ok');
});

test('M1: the mock refuses forged objects and unknown strings, and needs a chat_type of 3 or 4 when present (parity with the cloud function)', () => {
  const srv = createMockServer({ now: () => 0, content });
  const forged = { cloudID: 'c', data: { opengid: 'G', chat_type: 3 } };
  assert.equal(srv.callAs('m', 'joinGroup', { groupData: forged }).code, 'BAD_CLOUDID');
  assert.equal(srv.callAs('m', 'joinGroup', { cloudID: forged }).code, 'BAD_CLOUDID');
  assert.equal(srv.callAs('m', 'joinGroup', { cloudID: 'G' }).code, 'BAD_CLOUDID');
  assert.equal(srv.callAs('m', 'joinGroup', { cloudID: srv.cloudData({ open_single_roomid: 'R1' }) }).code, 'NOT_GROUP');
  assert.equal(srv.callAs('m', 'joinGroup', { cloudID: srv.cloudData({ open_single_roomid: 'R1', chat_type: 3 }) }).code, 'NOT_GROUP', 'no opengid');
  assert.equal(srv.callAs('m', 'joinGroup', { cloudID: encodeMockCloudID('G0', null) }).ok, true, 'chat_type absent is accepted (CTO ruling)');
  assert.equal(srv.callAs('m', 'joinGroup', { cloudID: encodeMockCloudID('G', 2) }).code, 'NOT_GROUP');
  assert.equal(Object.keys(srv.db.members).length, 1, 'only the G0 join wrote a row');
  assert.equal(srv.callAs('m', 'joinGroup', { cloudID: encodeMockCloudID('G', 4) }).ok, true);
});

// ---- M3 ---------------------------------------------------------------------------------------------------------------

test('M3: the mock enforces the same per-minute table, as RATE_LIMITED scope minute, per openid, resetting each minute', () => {
  let t = 1e12;
  const srv = createMockServer({ now: () => t, content, rateLimits: true });
  const limit = CONFIG.limits.perMinute.getRound;
  for (let i = 0; i < limit; i++) assert.notEqual(srv.callAs('u', 'getRound', {}).code, 'RATE_LIMITED');
  const over = srv.callAs('u', 'getRound', {});
  assert.deepEqual([over.code, over.scope], ['RATE_LIMITED', 'minute']);
  assert.notEqual(srv.callAs('v', 'getRound', {}).code, 'RATE_LIMITED');
  t += 60000;
  assert.notEqual(srv.callAs('u', 'getRound', {}).code, 'RATE_LIMITED');
});

test('M3: a per-minute RATE_LIMITED on createRound is a retryable error, not "enough rounds today"', async (t) => {
  const h = await ready(t);
  const orig = h.srv.callAs;
  h.srv.callAs = (openid, name, data) => (name === 'createRound' ? { ok: false, code: 'RATE_LIMITED', message: 'rate limited', scope: 'minute' } : orig(openid, name, data));
  await h.tap('home:host');
  await h.tap('create:spectrum:' + h.view().vm.spectra[0].id);
  assert.equal(h.view().vm.step, 'error');
  assert.ok(h.has('create:back'), 'never trapped');
  h.srv.callAs = orig;
});

test('M3: a per-minute RATE_LIMITED on getDaily leaves the home retryable (error state), and the retry works afterwards', async (t) => {
  const h = await ready(t);
  const orig = h.srv.callAs;
  h.srv.callAs = (openid, name, data) => (name === 'getDaily' ? { ok: false, code: 'RATE_LIMITED', message: 'rate limited', scope: 'minute' } : orig(openid, name, data));
  h.app.ctl.K.st.daily = null;
  await h.app.ctl.K.loadDaily();
  assert.equal(h.app.ctl.K.st.dailyStatus, 'error');
  assert.ok(h.has('home:retry'));
  h.srv.callAs = orig;
  await h.tap('home:retry');
  assert.equal(h.app.ctl.K.st.dailyStatus, 'ok');
});

test('M3: the analytics queue survives a RATE_LIMITED track call (batch goes back, nothing thrown)', async (t) => {
  const h = await ready(t);
  const orig = h.srv.callAs;
  h.srv.callAs = (openid, name, data) => (name === 'track' ? { ok: false, code: 'RATE_LIMITED', message: 'rate limited', scope: 'minute' } : orig(openid, name, data));
  h.app.analytics.track('howto_view', { auto: true });
  const before = h.app.analytics.queue.length;
  await h.app.analytics.flush();
  assert.equal(h.app.analytics.queue.length, before, 'requeued');
  h.srv.callAs = orig;
});

// ---- L4 ---------------------------------------------------------------------------------------------------------------

test('L4: 直接看答案 asks the server for the answer (showAnswer), which records it and closes the late guess', async (t) => {
  const h = await ready(t);
  const id = hostedBy(h, 'bob');
  for (let i = 0; i < 8; i++) h.srv.callAs('g' + i, 'submitGuess', { roundId: id, pos: 10 + i * 10 });
  await h.show(enter(id));
  const first = h.srv.calls.filter((c) => c.name === 'getRound').pop();
  assert.ok(!first.data.showAnswer, 'opening the round does not ask for the answer');
  assert.equal(h.app.ctl.K.st.round.data.answerHidden, true);
  assert.ok(!h.app.ctl.K.st.round.data.reveal);
  assert.equal(h.view().vm.status, 'revealedUnplayed');
  await h.tap('round:view');
  assert.ok(h.srv.calls.some((c) => c.name === 'getRound' && c.data.showAnswer === true));
  assert.equal(h.view().vm.status, 'revealed');
  assert.ok(h.view().vm.reveal);
  assert.equal(Object.keys(h.srv.db.revealViews).length, 1);
  // after being served the answer a late guess is refused
  assert.equal(h.srv.callAs(h.srv.ME, 'submitGuess', { roundId: id, pos: 50 }).code, 'ROUND_EXPIRED');
});

test('L4: the mock withholds the answer by default and a late row has no score', () => {
  const srv = createMockServer({ now: () => 1e12, content, rateLimits: false });
  const r = srv.callAs('host', 'createRound', { spectrumId: content.spectra[0].id });
  srv.callAs('host', 'setClue', { roundId: r.roundId, clueMode: 'preset', clueItemId: content.spectra[0].items[0].id });
  for (let i = 0; i < 8; i++) srv.callAs('g' + i, 'submitGuess', { roundId: r.roundId, pos: 10 + i * 10 });
  const v = srv.callAs('stranger', 'getRound', { roundId: r.roundId });
  assert.equal(v.answerHidden, true);
  assert.ok(!('reveal' in v));
  const g = srv.callAs('stranger', 'submitGuess', { roundId: r.roundId, pos: 50 });
  assert.equal(g.late, true);
  assert.equal(g.reveal.rows.find((row) => row[3] === 1)[2], null);
});

// ---- I3 ---------------------------------------------------------------------------------------------------------------

test('I3: a query string that makes decodeURIComponent throw is treated as malformed (logged, no crash, home shown)', async (t) => {
  for (const q of ['r=%E0%A4%A', 's=%', '%=1', 'r=%ZZ&s=d']) {
    const h = await ready(t, { enter: { scene: 1001, query: q } });
    assert.equal(h.view().vm.screen || h.app.ctl.K.st.screen, 'home', q);
    assert.ok(h.app.analytics.queue.some((e) => e.name === 'error' && e.props.where === 'entry' && e.props.code === 'malformed'), q);
  }
});
