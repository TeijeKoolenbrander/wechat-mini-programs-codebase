'use strict';
// The game's in-memory mock server (js/mock-server.js, used until a cloud environment exists and by the game's own tests)
// must answer with exactly the shapes of the real cloud functions. The same scripted session is run against both; every
// response is reduced to its key paths and value types, and the two sets must be equal. Values may differ (the decks differ);
// the shape may not. When a backend response changes, this test fails until the mock (and the client) follow.
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, DAILY_FACTS } = require('./helpers/harness');
const { createMockServer } = require('../../game/js/mock-server');
const { correctFrom } = require('../../game/tests/harness');

const DAILY_BY_ID = Object.fromEntries(DAILY_FACTS.map((f) => [f.id, f]));
const correct = correctFrom(DAILY_BY_ID);

let h = null;
afterEach(() => {
  if (h) h.teardown();
  h = null;
});

/**
 * path -> Set of types. Arrays collapse to "[]" (the union of their elements). A path that depends on the data of a
 * particular fact (a card's `note`) is not part of the shape.
 */
function shapeOf(v, prefix = '', out = new Map()) {
  const put = (path, type) => {
    if (!out.has(path)) out.set(path, new Set());
    out.get(path).add(type);
  };
  if (v === null) put(prefix, 'null');
  else if (Array.isArray(v)) {
    put(prefix, 'array');
    v.forEach((x) => shapeOf(x, prefix + '[]', out));
  } else if (typeof v === 'object') {
    put(prefix, 'object');
    Object.keys(v).forEach((k) => {
      if (k === 'note') return; // present only on facts that have a note
      shapeOf(v[k], prefix + '.' + k, out);
    });
  } else put(prefix, typeof v);
  return out;
}

/** differences: a path on one side only, or types with nothing in common (null matches anything: "nullable") */
function diffShapes(a, b) {
  const out = [];
  for (const [path, ta] of a) {
    const tb = b.get(path);
    if (!tb) out.push(`backend only ${path}`);
    else {
      const x = [...ta].filter((t) => t !== 'null');
      const y = [...tb].filter((t) => t !== 'null');
      if (x.length && y.length && !x.some((t) => y.includes(t))) out.push(`type of ${path}: backend ${x} mock ${y}`);
    }
  }
  for (const path of b.keys()) if (!a.has(path)) out.push(`mock only ${path}`);
  return out;
}

const NOON = Date.UTC(2026, 10, 20, 4, 0, 0); // 2026-11-20 12:00 BJT
const A = 'player-a';
const B = 'player-b';

/** the scripted session; `call(name, data, who)` is async; `setNow(ms)` moves the shared clock */
async function session(call, setNow) {
  const r = {};
  const run = async (key, name, data, who) => {
    r[key] = await call(name, data, who || A);
    return r[key];
  };
  setNow(NOON);
  await run('getDaily.fresh', 'getDaily', {});
  const s = await run('startRun.daily', 'startRun', { mode: 'daily', clientRunId: 'runaaaa000001' });
  assert.equal(s.ok, true, JSON.stringify(s).slice(0, 200));
  const a1 = await run('answer.right', 'answer', { clientRunId: 'runaaaa000001', k: 1, choice: correct(s.question), ms: 2100 });
  assert.equal(a1.ok, true);
  const wrong = correct(a1.next) === 'hi' ? 'lo' : 'hi';
  await run('getDaily.open', 'getDaily', {});
  await run('startRun.resume', 'startRun', { mode: 'daily', clientRunId: 'runaaaa000001' });
  await run('answer.miss', 'answer', { clientRunId: 'runaaaa000001', k: 2, choice: wrong, ms: 2300 });
  await run('answer.repeat', 'answer', { clientRunId: 'runaaaa000001', k: 2, choice: wrong, ms: 2300 });
  await run('startRun.alreadyPlayed', 'startRun', { mode: 'daily', clientRunId: 'runaaaa000002' });
  await run('getDaily.done', 'getDaily', {});
  const ch = await run('createChallenge.daily', 'createChallenge', { runId: 'runaaaa000001' });
  await run('getChallenge.ready', 'getChallenge', { challengeId: ch.challengeId }, B);
  await run('getChallenge.own', 'getChallenge', { challengeId: ch.challengeId }, A);
  const bs = await run('startRun.challenge', 'startRun', { mode: 'challenge', challengeId: ch.challengeId, clientRunId: 'runbbbb000001' }, B);
  assert.equal(bs.ok, true, JSON.stringify(bs).slice(0, 200));
  await run('answer.challengeMiss', 'answer', { clientRunId: 'runbbbb000001', k: 1, choice: correct(bs.question) === 'hi' ? 'lo' : 'hi', ms: 2000 }, B);
  await run('getChallenge.answered', 'getChallenge', { challengeId: ch.challengeId }, B);
  await run('getBoard.friend', 'getBoard', { kind: 'friend', dateKey: '20261120' });
  await run('getHistory.list', 'getHistory', {});
  await run('getHistory.locked', 'getHistory', { dateKey: '20261120' });
  await run('reportFact.ok', 'reportFact', { factId: s.question.top.factId, reasons: ['value', 'unit'], where: 'reveal', dateKey: '20261120' });
  await run('track.ok', 'track', { events: [{ name: 'session_start', sessionId: 's1', props: {}, clientTs: NOON }] });
  // a free run, a free challenge
  const free = await run('submitRun.free', 'submitRun', { clientRunId: 'runfree0000001', seed: 12345, group: 'all', contentVersion: 1, configVersion: 1, answers: [{ k: 1, c: 'hi', ms: 1500 }], lifeAtK: null, clientStreak: 0 });
  assert.equal(free.ok, true, JSON.stringify(free).slice(0, 200));
  const fch = await run('createChallenge.free', 'createChallenge', { runId: 'runfree0000001' });
  await run('getChallenge.freeReady', 'getChallenge', { challengeId: fch.challengeId }, B);
  await run('subscribeChallenge.noTemplate', 'subscribeChallenge', { challengeId: ch.challengeId });
  const jg = await run('joinGroup.ok', 'joinGroup', { groupData: { cloudID: 'c1', data: { opengid: 'G-test-1', chat_type: 3 } } });
  await run('getBoard.group', 'getBoard', { kind: 'group', groupRef: jg.groupRef, dateKey: '20261120' });
  await run('joinGroup.notGroup', 'joinGroup', { groupData: { cloudID: 'c2', data: { opengid: 'G-test-1', chat_type: 1 } } });
  // errors every client branches on
  await run('answer.badOrder', 'answer', { clientRunId: 'runbbbb000001', k: 9, choice: 'hi' }, B);
  await run('startRun.expiredChallenge', 'startRun', { mode: 'challenge', challengeId: 'ZZZZZZZZ', clientRunId: 'runbbbb000002' }, B);
  await run('getChallenge.unknown', 'getChallenge', { challengeId: 'ZZZZZZZZ' }, B);
  // the next morning: the history deck is open
  setNow(Date.UTC(2026, 10, 21, 5, 0, 0));
  await run('getHistory.open', 'getHistory', { dateKey: '20261120' });
  return r;
}

test('the mock server answers with the same shapes as the cloud functions, for a whole scripted session', async () => {
  const clock = { t: NOON };
  h = createHarness({ now: NOON });
  h.loadDailyFacts();
  h.setEnv('LAUNCH_DATE_KEY', '20261101');
  const real = await session((name, data, who) => h.call(name, data, { openid: who }), (t) => { clock.t = t; h.setNow(t); });

  const mock = createMockServer({ now: () => clock.t, dailyFacts: DAILY_FACTS });
  const mocked = await session(async (name, data, who) => mock.call(name, JSON.parse(JSON.stringify(data)), who), (t) => { clock.t = t; });

  const problems = [];
  Object.keys(real).forEach((key) => {
    const d = diffShapes(shapeOf(JSON.parse(JSON.stringify(real[key]))), shapeOf(JSON.parse(JSON.stringify(mocked[key]))));
    if (d.length) problems.push(`${key}: ${d.join('; ')}`);
  });
  assert.deepEqual(problems, []);
});
