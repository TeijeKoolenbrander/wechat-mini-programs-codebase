'use strict';
// Client contract: the real game (controller + real renderer, booted by the game's own test harness) talks to the REAL
// cloud functions (this package's handlers over an in-memory db) instead of the in-memory mock. Every response shape the
// controller reads is therefore checked against what the backend really sends, and the mock-server is checked against
// the same shapes (tests below), so the two cannot drift apart again.
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, NOON, DAILY_FACTS } = require('./helpers/harness');
const contract = require('./helpers/contract');
const gh = require('../../game/tests/helpers');
const { correctFrom } = require('../../game/tests/harness');

const DAILY_BY_ID = Object.fromEntries(DAILY_FACTS.map((f) => [f.id, f]));
const dailyLookup = correctFrom(DAILY_BY_ID);

let h = null;
afterEach(() => {
  if (h) h.teardown();
  h = null;
});

const wire = (who) => contract.wire(h, who);
const { assertCleanText } = contract;

test('daily against the real backend: start, answer to a miss, result, resume, server-side truth', async (t) => {
  h = createHarness({ now: NOON });
  h.loadDailyFacts();
  // forty earlier results today, so that the rarity line ("超过今日 X% 的玩家") exists
  const hist = new Array(41).fill(0);
  [2, 4, 6, 8].forEach((n) => { hist[n] = 10; });
  h.db.put('daily_stats', { _id: '20261015', hist, total: 40 });
  const who = { id: 'player-one' };
  const w = wire(who);
  const g = await gh.startUp(t, { cloud: w.cloud, now: NOON, privacy: { state: 'agreed', scope: true } });
  await gh.closeHowto(g);
  assertCleanText(g, 'home');
  let v = g.view();
  assert.equal(v.screen, 'home');
  assert.equal(v.vm.daily.state, 'available', JSON.stringify(v.vm.daily));
  assert.equal(v.vm.daily.issueNo, 1);
  assert.equal(v.vm.daily.themeLabel, '');
  assert.equal(w.calls.filter((c) => c.name === 'getDaily').length, 1);

  g.tapId('home:daily');
  await g.settle();
  v = g.view();
  assert.equal(v.screen, 'play', JSON.stringify(v.vm).slice(0, 300));
  assert.equal(v.vm.mode, 'daily');
  assert.equal(v.vm.phase, 'awaitAnswer');
  assert.equal(v.vm.bottom.valueText, null);
  assert.ok(v.vm.top.valueText && v.vm.top.unitText && v.vm.top.sourceText);
  assertCleanText(g, 'first question');
  const start = w.calls.find((c) => c.name === 'startRun');
  assert.ok(start && start.res.ok, JSON.stringify(start && start.res).slice(0, 300));

  await gh.rights(g, 6, dailyLookup);
  assert.equal(g.view().vm.streak, 6);
  assertCleanText(g, 'after six answers');
  await gh.miss(g, dailyLookup);
  v = g.view();
  assert.equal(v.screen, 'result', 'a daily run has no 再答一次: the result follows the miss');
  assert.equal(v.vm.streak, 6);
  assert.equal(v.vm.status, 'done');
  assert.equal(v.vm.rarityText, '超过今日 48% 的玩家', 'the server sends {pct,total}; the client turns it into the line');
  assertCleanText(g, 'result');
  // the server, not the client, holds the truth
  const res = h.db.all('daily_results');
  assert.equal(res.length, 1);
  assert.equal(res[0].n, 6);
  assert.ok(g.has('result:share') && g.has('result:again') && g.has('result:questions'));
  // all the questions of the run are listed with both values
  assert.equal(v.vm.questions.length, 7);
  v.vm.questions.forEach((q) => assert.ok(q.top.valueText && q.bottom.valueText, 'values known for answered pairs'));

  // relaunch: the home shows today's finished result from the server
  const g2 = await gh.startUp(t, { cloud: w.cloud, now: NOON, storage: g.storage });
  const hv = g2.view().vm;
  assert.equal(hv.daily.state, 'done');
  assert.equal(hv.daily.streak, 6);
  assertCleanText(g2, 'home after relaunch');
});
