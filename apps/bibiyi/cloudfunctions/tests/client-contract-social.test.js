'use strict';
// Client contract, part 2: free play, challenges, boards, history and reports. The real game against the real cloud
// functions (see client-contract.test.js for the idea).
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, NOON, DAILY_FACTS } = require('./helpers/harness');
const contract = require('./helpers/contract');
const gh = require('../../game/tests/helpers');
const { correctFrom } = require('../../game/tests/harness');

const dailyLookup = correctFrom(Object.fromEntries(DAILY_FACTS.map((f) => [f.id, f])));
const { assertCleanText } = contract;

let h = null;
afterEach(() => {
  if (h) h.teardown();
  h = null;
});

test('free play and a free challenge: submitRun replay, createChallenge, getChallenge, comparison', async (t) => {
  h = createHarness({ now: NOON });
  h.loadDailyFacts();
  const w1 = contract.wire(h, { id: 'player-one' });
  const w2 = contract.wire(h, { id: 'player-two' });
  const g1 = await gh.startUp(t, { cloud: w1.cloud, now: NOON });
  await gh.closeHowto(g1);
  g1.tapId('home:free');
  await gh.rights(g1, 3);
  await gh.miss(g1);
  assert.equal(g1.view().vm.sheet, 'continue');
  g1.tapId('continue:result');
  await g1.settle();
  assertCleanText(g1, 'free result');
  assert.equal(g1.view().screen, 'result');
  assert.equal(g1.view().vm.streak, 3);
  // the run was replayed by the server and its streak is the truth
  const stored = h.db.all('runs');
  assert.equal(stored.length, 1);
  assert.equal(stored[0].serverStreak, 3);
  assert.equal(stored[0].mismatch, false);
  assert.ok(w1.calls.some((c) => c.name === 'submitRun' && c.res.ok && c.res.streak === 3 && c.res.clientRunId));

  g1.tapId('result:challenge');
  await g1.settle();
  assert.equal(g1.log.shares.length, 1);
  const query = g1.log.shares[0].query;
  assert.match(query, /^c=[A-Z2-7]{8}$/);
  const id = query.slice(2);
  assert.ok(w1.calls.some((c) => c.name === 'createChallenge' && c.res.ok));

  // player two opens the card
  const g2 = await gh.startUp(t, { cloud: w2.cloud, now: NOON, enter: { scene: 1007, query: { c: id } } });
  await g2.settle();
  let v = g2.view();
  assert.equal(v.screen, 'challenge');
  assert.equal(v.vm.status, 'ready', JSON.stringify(v.vm).slice(0, 300));
  assert.equal(v.vm.kind, 'free');
  assert.equal(v.vm.ownerStreak, 3);
  assert.ok(v.vm.categoryLabel);
  assertCleanText(g2, 'challenge entry');
  g2.tapId('challenge:accept');
  assert.equal(g2.view().screen, 'play');
  await gh.rights(g2, 4);
  assert.equal(g2.view().vm.challenge.passedText, '已超过 TA 的 3 ✓');
  await gh.miss(g2);
  g2.tapId('continue:result');
  await g2.settle();
  v = g2.view();
  assert.equal(v.screen, 'result');
  assert.equal(v.vm.streak, 4);
  assert.equal(v.vm.challenge.compareText, '你 4 · TA 3 · 同一套题');
  assertCleanText(g2, 'challenge result');
  const ch = h.db.all('challenges')[0];
  assert.equal(ch.answerCount, 1);
  assert.equal(ch.bestAnswer, 4);
  // the owner opens his own card
  g1.tapId('result:back');
  g1.show({ scene: 1007, query: { c: id } });
  await g1.settle();
  v = g1.view();
  assert.equal(v.vm.status, 'own', JSON.stringify(v.vm).slice(0, 300));
  assert.equal(v.vm.answerCount, 1);
  assert.equal(v.vm.bestAnswer, 4);
  assertCleanText(g1, 'own challenge');
});

test('daily challenge, report, boards, group, history and the open deck', async (t) => {
  h = createHarness({ now: NOON });
  h.loadDailyFacts();
  const w1 = contract.wire(h, { id: 'player-one' });
  const w2 = contract.wire(h, { id: 'player-two' });
  const g1 = await gh.startUp(t, { cloud: w1.cloud, now: NOON, privacy: { state: 'agreed', scope: true } });
  await gh.closeHowto(g1);
  g1.tapId('home:daily');
  await g1.settle();
  await gh.rights(g1, 3, dailyLookup);
  await gh.miss(g1, dailyLookup);
  assert.equal(g1.view().screen, 'result');
  g1.tapId('result:challenge');
  await g1.settle();
  const id = g1.log.shares[0].query.slice(2);

  // player two accepts: it counts as his ranked daily
  const g2 = await gh.startUp(t, { cloud: w2.cloud, now: NOON, privacy: { state: 'agreed', scope: true }, enter: { scene: 1007, query: { c: id } } });
  await g2.settle();
  let v = g2.view();
  assert.equal(v.vm.status, 'ready');
  assert.equal(v.vm.countsAsDaily, true);
  assert.equal(v.vm.issueText, '今日一比 · 第1期', 'no theme, no dangling dot');
  assertCleanText(g2, 'daily challenge entry');
  g2.tapId('challenge:accept');
  await g2.settle();
  await gh.rights(g2, 5, dailyLookup);
  assert.equal(g2.view().vm.challenge.passedText, '已超过 TA 的 3 ✓');
  await gh.miss(g2, dailyLookup);
  v = g2.view();
  assert.equal(v.screen, 'result');
  assert.equal(v.vm.ranked, true);
  assert.equal(v.vm.streak, 5);
  assert.equal(v.vm.challenge.compareText, '你 5 · TA 3 · 同一套题');
  assert.equal(h.db.all('daily_results').length, 2);
  assertCleanText(g2, 'ranked challenge result');

  // report the missed fact from the result screen
  g2.tapId('report:miss:bottom');
  assert.equal(g2.view().vm.sheet, 'report');
  g2.tapId('report:reason:value');
  g2.tapId('report:submit');
  await g2.settle();
  assert.equal(g2.view().vm.sheet, null);
  assert.equal(h.db.all('fact_reports').length, 1);
  assert.deepEqual(h.db.all('fact_reports')[0].reasons, ['value']);

  // friend board of player two: both results, hashed rows only
  g2.tapId('result:back');
  g2.tapId('home:friendBoard');
  await g2.settle();
  v = g2.view();
  assert.equal(v.screen, 'board');
  assert.equal(v.vm.state, 'ready', JSON.stringify(v.vm).slice(0, 200));
  const msg = g2.log.odc[g2.log.odc.length - 1];
  assert.equal(msg.rows.length, 2);
  assert.deepEqual(msg.rows.map((r) => r[1]).sort(), [3, 5]);
  assert.ok(!JSON.stringify(msg).includes('player-'), 'no openid reaches the open data domain');
  assertCleanText(g2, 'board');

  // a group card: joinGroup, then the group board
  g2.tapId('board:back');
  const g3 = await gh.startUp(t, { cloud: w2.cloud, now: NOON, privacy: { state: 'agreed', scope: true }, storage: g2.storage, enter: { scene: 1044, query: 's=r&m=daily&d=x', shareTicket: 'tk', chatType: 1 } });
  await g3.settle();
  await gh.closeHowto(g3);
  assert.equal(g3.app.ctl.state.group.status, 'ok');
  assert.ok(w2.calls.some((c) => c.name === 'joinGroup' && c.res.ok && c.res.groupRef));
  g3.tapId('home:groupBoard');
  await g3.settle();
  assert.equal(g3.view().vm.state, 'ready', JSON.stringify(g3.view().vm).slice(0, 200));
  assert.equal(h.db.all('group_members').length, 1);

  // history: the list, then the issue (locked), then the next morning with the deck open
  g3.tapId('board:back');
  g3.tapId('home:history');
  await g3.settle();
  v = g3.view();
  assert.equal(v.vm.state, 'ready');
  assert.equal(v.vm.items.length, 1);
  assert.equal(v.vm.items[0].mineText, '连对 5');
  assertCleanText(g3, 'history');
  g3.tapId('history:item:' + v.vm.items[0].dateKey);
  await g3.settle();
  v = g3.view();
  assert.equal(v.screen, 'issue');
  assert.equal(v.vm.deck, null, 'locked while the window is open');
  assert.equal(v.vm.deckLockedText, '今日一比结束后公布题目');
  assert.equal(v.vm.mineText, '连对 5（倒在第 6 题）');
  g3.tapId('issue:back');
  g3.tapId('history:back');
  g3.setTime(Date.UTC(2026, 9, 16, 5, 0, 0)); // the next morning, 13:00 BJT
  g3.tapId('home:history');
  await g3.settle();
  v = g3.view();
  g3.tapId('history:item:' + v.vm.items[v.vm.items.length - 1].dateKey);
  await g3.settle();
  v = g3.view();
  assert.equal(v.screen, 'issue');
  assert.equal(v.vm.deck.length, 40, JSON.stringify(v.vm).slice(0, 200));
  assert.ok(v.vm.deck.every((r) => r.top.valueText && r.bottom.valueText && r.answerLabel));
  assertCleanText(g3, 'issue with the open deck');
  g3.tapId('source:issue:1:top');
  assert.equal(g3.view().vm.sheet, 'source');
  assertCleanText(g3, 'source sheet');

  const names = new Set([...w1.calls, ...w2.calls].map((c) => c.name));
  for (const n of ['getDaily', 'startRun', 'answer', 'createChallenge', 'getChallenge', 'joinGroup', 'getBoard', 'getHistory', 'reportFact']) assert.ok(names.has(n), n);
});
