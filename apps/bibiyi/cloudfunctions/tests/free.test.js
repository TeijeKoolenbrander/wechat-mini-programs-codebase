'use strict';
// submitRun (free runs): deck rebuilt on the server, answers replayed, server streak authoritative.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, runId } = require('./helpers/harness');
const { makeRun } = require('./helpers/free');

let h;
beforeEach(() => { h = createHarness(); });
afterEach(() => h.teardown());

const P = 'openid-free-player1';

test('a valid free run: server rebuilds the deck and recomputes the streak; bests follow the server', async () => {
  const run = makeRun(h, { seed: 424242, right: 12 });
  const r = await h.call('submitRun', { clientRunId: runId(), ...run.event }, { openid: P });
  assert.equal(r.ok, true);
  assert.equal(r.streak, 12);
  assert.equal(r.mismatch, false);
  assert.equal(r.lifeUsed, false);
  assert.equal(h.db.all('player_stats')[0].bestFree, 12);
  const run2 = makeRun(h, { seed: 7, right: 5 });
  await h.call('submitRun', { clientRunId: runId(), ...run2.event }, { openid: P });
  assert.equal(h.db.all('player_stats')[0].bestFree, 12, 'best is a maximum');
  const g = await h.call('getDaily', {}, { openid: P }).catch(() => null);
  assert.ok(g === null || g.ok === false || g.bests.free === 12);
});

test('tampered clientStreak: mismatch flagged, no effect on bests or challenges', async () => {
  const run = makeRun(h, { seed: 99, right: 4 });
  const cid = runId();
  const r = await h.call('submitRun', { clientRunId: cid, ...run.event, clientStreak: 59 }, { openid: P });
  assert.equal(r.ok, true);
  assert.equal(r.streak, 4);
  assert.equal(r.mismatch, true);
  assert.equal(h.db.all('runs')[0].serverStreak, 4);
  assert.equal(h.db.all('player_stats')[0].bestFree, 4);
  assert.deepEqual(h.db.all('anomalies').map((a) => a.kind), ['mismatch']);
  const c = await h.call('createChallenge', { runId: cid }, { openid: P });
  assert.equal(h.db.all('challenges')[0].ownerStreak, 4);
  assert.ok(c.ok);
});

test('再答一次: the first miss is forgiven, it does not add a streak point, a second miss ends the run', async () => {
  const run = makeRun(h, { seed: 31337, right: 6, life: true, afterLife: 5 });
  const r = await h.call('submitRun', { clientRunId: runId(), ...run.event }, { openid: P });
  assert.equal(r.ok, true);
  assert.equal(r.streak, 11);
  assert.equal(r.lifeUsed, true);
  assert.equal(run.event.answers.length, 6 + 1 + 5 + 1);
});

test('INVALID_ACTIONS: answers after the end, a life not at a miss, a life after a hard miss, non-sequential k, unknown version/group', async () => {
  const base = makeRun(h, { seed: 5, right: 3 });
  const send = (patch, openid = P) => h.call('submitRun', { clientRunId: runId(), ...base.event, ...patch }, { openid });
  // an answer after the run ended (the miss at k=4 ends it)
  const extra = [...base.event.answers, { k: 5, c: 'hi', ms: 1 }];
  assert.equal((await send({ answers: extra })).code, 'INVALID_ACTIONS');
  // life on a correct answer
  assert.equal((await send({ lifeAtK: 2 })).code, 'INVALID_ACTIONS');
  // life beyond the answers
  assert.equal((await send({ lifeAtK: 9 })).code, 'INVALID_ACTIONS');
  // second miss after a life: a run that continues past the second miss
  const lifeRun = makeRun(h, { seed: 5, right: 3, life: true, afterLife: 2 });
  const tooLong = [...lifeRun.event.answers, { k: lifeRun.event.answers.length + 1, c: 'hi', ms: 1 }];
  assert.equal((await send({ ...lifeRun.event, answers: tooLong })).code, 'INVALID_ACTIONS');
  // a hard miss (no life) followed by more answers
  const hard = [...base.event.answers.slice(0, 3), { k: 4, c: base.wrong(4), ms: 1 }, { k: 5, c: base.correct(5), ms: 1 }];
  assert.equal((await send({ answers: hard, lifeAtK: null })).code, 'INVALID_ACTIONS');
  // k not sequential / not integers / bad choice
  assert.equal((await send({ answers: [{ k: 2, c: 'hi' }] })).code, 'INVALID_ACTIONS');
  assert.equal((await send({ answers: [{ k: 1, c: 'big' }] })).code, 'INVALID_ACTIONS');
  assert.equal((await send({ answers: [] })).code, 'INVALID_ACTIONS');
  assert.equal((await send({ answers: new Array(61).fill({ k: 1, c: 'hi' }) })).code, 'INVALID_ACTIONS');
  // unknown content/config version, bad group, bad seed
  assert.equal((await send({ contentVersion: 7 })).code, 'INVALID_ACTIONS');
  assert.equal((await send({ configVersion: 7 })).code, 'INVALID_ACTIONS');
  assert.equal((await send({ group: 'politics' })).code, 'INVALID_ACTIONS');
  assert.equal((await send({ seed: -1 })).code, 'INVALID_ACTIONS');
  assert.equal((await send({ seed: 1.5 })).code, 'INVALID_ACTIONS');
  assert.equal(h.db.all('runs').length, 0, 'nothing stored for rejected runs');
});

test('wrong answers cannot be dressed up as right ones: the server judges its own deck', async () => {
  const run = makeRun(h, { seed: 2024, right: 0 });
  const forged = [{ k: 1, c: run.wrong(1), ms: 1 }];
  const r = await h.call('submitRun', { clientRunId: runId(), seed: 2024, group: 'all', contentVersion: 1, configVersion: 1, answers: forged, clientStreak: 10 }, { openid: P });
  assert.equal(r.streak, 0);
  assert.equal(r.mismatch, true);
});

test('submitRun is idempotent per clientRunId and rate limited', async () => {
  const run = makeRun(h, { seed: 11, right: 3 });
  const cid = runId();
  const a = await h.call('submitRun', { clientRunId: cid, ...run.event }, { openid: P });
  const b = await h.call('submitRun', { clientRunId: cid, ...run.event, clientStreak: 0 }, { openid: P });
  assert.deepEqual(a, b);
  assert.equal(h.db.all('runs').length, 1);
  const [x, y] = await Promise.all([
    h.call('submitRun', { clientRunId: runId(), ...makeRun(h, { seed: 12, right: 2 }).event }, { openid: P }),
    h.call('submitRun', { clientRunId: 'same-run-id-1', ...makeRun(h, { seed: 12, right: 2 }).event }, { openid: P }),
  ]);
  assert.ok(x.ok && y.ok);
  let limited = null;
  for (let i = 0; i < 40 && !limited; i++) {
    const r = await h.call('submitRun', { clientRunId: runId(), ...makeRun(h, { seed: 100 + i, right: 1 }).event }, { openid: P });
    if (!r.ok) limited = r;
  }
  assert.equal(limited && limited.code, 'RATE_LIMITED');
});

test('free decks: only the chosen category\'s measures, deterministic, no fact within 10 questions', () => {
  const core = h.core('deck');
  const content = h.core('content');
  const measures = content.getMeasures();
  for (const group of ['all', 'city', 'geo', 'era', 'animal', 'space', 'build', 'food', 'dist']) {
    for (let seed = 1; seed <= 40; seed++) {
      const a = core.buildFreeDeck(seed * 7919, 1, 1, group);
      const b = core.buildFreeDeck(seed * 7919, 1, 1, group);
      assert.equal(JSON.stringify(a), JSON.stringify(b));
      assert.equal(a.length, 60);
      for (const q of a) if (group !== 'all') assert.equal(measures[q.a.measure].category, group);
      for (let i = 0; i < a.length; i++) {
        for (let j = i + 1; j < Math.min(a.length, i + 10); j++) assert.notEqual(a[i].a.id, a[j].b.id);
      }
    }
  }
});

test('submitRun requires an authenticated caller and never trusts an openid in the body', async () => {
  const run = makeRun(h, { seed: 3, right: 2 });
  assert.equal((await h.call('submitRun', { clientRunId: runId(), ...run.event })).code, 'UNAUTHENTICATED');
  await h.call('submitRun', { clientRunId: runId(), ...run.event, openid: 'someone-else', ownerOpenid: 'x' }, { openid: P });
  assert.equal(h.db.all('runs')[0].openid, P);
});
