'use strict';
// createChallenge / getChallenge / startRun(challenge) / subscribe: the spoiler lock and the counting rules.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, oracle, playDaily, runId, allStrings, allKeys } = require('./helpers/harness');

let h;
beforeEach(() => { h = createHarness(); h.loadDailyFacts(); });
afterEach(() => h.teardown());

const OWNER = 'openid-owner-0001';
const FRIEND = 'openid-friend-002';
const THIRD = 'openid-third-0003';
const at = (d, hr = 4) => h.setNow(Date.UTC(2026, 9, d, hr, 0, 0));

async function ownerChallenge(right = 9) {
  const run = await playDaily(h, OWNER, { right });
  const c = await h.call('createChallenge', { runId: run.start.clientRunId }, { openid: OWNER });
  assert.equal(c.ok, true, JSON.stringify(c));
  return { run, id: c.challengeId };
}

test('createChallenge: own finished run only, 8-char id, deterministic per run', async () => {
  await h.call('getDaily', {}, { openid: OWNER });
  const open = await h.call('startRun', { mode: 'daily', clientRunId: runId() }, { openid: OWNER });
  const early = await h.call('createChallenge', { runId: open.clientRunId }, { openid: OWNER });
  assert.equal(early.code, 'RUN_NOT_FOUND', 'unfinished run');
  const o = oracle(h, open.dateKey);
  await h.call('answer', { clientRunId: open.clientRunId, k: 1, choice: o.wrong(1), ms: 2000 }, { openid: OWNER });
  const a = await h.call('createChallenge', { runId: open.clientRunId }, { openid: OWNER });
  const b = await h.call('createChallenge', { runId: open.clientRunId }, { openid: OWNER });
  assert.match(a.challengeId, /^[A-Z2-7]{8}$/);
  assert.equal(a.challengeId, b.challengeId);
  assert.equal(h.db.all('challenges').length, 1);
  assert.equal((await h.call('createChallenge', { runId: open.clientRunId }, { openid: FRIEND })).code, 'RUN_NOT_FOUND', "not someone else's run");
  assert.equal((await h.call('createChallenge', { runId: 'x' }, { openid: OWNER })).code, 'INVALID_ACTIONS');
  const ch = h.db.all('challenges')[0];
  assert.equal(ch.kind, 'daily');
  assert.equal(ch.ownerStreak, 0);
  assert.equal(ch.expiresAt - ch.createdAt, 7 * 86400e3);
});

test('createChallenge needs GROUP_REF_PEPPER (SERVER_CONFIG) and is rate limited', async () => {
  const run = await playDaily(h, OWNER, { right: 2 });
  h.setEnv('GROUP_REF_PEPPER', undefined);
  assert.equal((await h.call('createChallenge', { runId: run.start.clientRunId }, { openid: OWNER })).code, 'SERVER_CONFIG');
  h.setEnv('GROUP_REF_PEPPER', 'another-test-pepper-0123456789abcdef');
  let limited = null;
  for (let i = 0; i < 25 && !limited; i++) {
    const r = await h.call('createChallenge', { runId: run.start.clientRunId }, { openid: OWNER });
    if (!r.ok) limited = r;
  }
  assert.equal(limited && limited.code, 'RATE_LIMITED');
});

test('SPOILER LOCK: getChallenge returns the owner\'s 连对 and the rule, never answers or any fact', async () => {
  const { run, id } = await ownerChallenge(9);
  const r = await h.call('getChallenge', { challengeId: id }, { openid: FRIEND });
  assert.equal(r.ok, true);
  assert.equal(r.status, 'ready');
  assert.equal(r.ownerStreak, 9);
  assert.equal(r.kind, 'daily');
  assert.equal(r.countsAsDaily, true);
  assert.equal(r.isFriendly, false);
  assert.equal(r.issueNo, 1);
  const o = oracle(h, run.start.dateKey);
  const json = JSON.stringify(r);
  for (const f of Object.values(o.facts)) {
    assert.equal(json.includes(`"${f.id}"`), false);
    assert.equal(json.includes(`"${f.label}"`), false);
  }
  const keys = allKeys(r);
  for (const bad of ['answers', 'answer', 'choice', 'questions', 'deck', 'seed', 'top', 'bottom', 'openid', 'ownerOpenid', 'lineup']) assert.equal(keys.includes(bad), false, bad);
  assert.equal(allStrings(r).some((s) => s.includes(OWNER)), false);
});

test('challenge on today\'s deck, recipient has not played: the run IS their ranked daily and reaches the board', async () => {
  const { id } = await ownerChallenge(5);
  await h.call('getDaily', {}, { openid: FRIEND });
  const s = await h.call('startRun', { mode: 'challenge', challengeId: id, clientRunId: runId() }, { openid: FRIEND });
  assert.equal(s.ok, true, JSON.stringify(s));
  assert.equal(s.ranked, true);
  assert.equal(s.kind, 'challengeDaily');
  assert.equal(s.challenge.ownerStreak, 5);
  const o = oracle(h, s.dateKey);
  let last;
  for (let k = 1; k <= 8; k++) last = await h.call('answer', { clientRunId: s.clientRunId, k, choice: k <= 7 ? o.correct(k) : o.wrong(k), ms: 2500 }, { openid: FRIEND });
  assert.equal(last.ended, true);
  assert.equal(last.result.n, 7);
  assert.deepEqual(last.result.compare, { ownerStreak: 5, myStreak: 7 });
  const board = await h.call('getBoard', { kind: 'friend', dateKey: s.dateKey }, { openid: FRIEND });
  assert.equal(board.rows.length, 2);
  assert.equal(board.rows[0][1], 7);
  assert.equal(h.db.all('daily_results').length, 2);
  const g = await h.call('getChallenge', { challengeId: id }, { openid: FRIEND });
  assert.equal(g.status, 'answered');
  assert.equal(g.myStreak, 7);
  const again = await h.call('startRun', { mode: 'challenge', challengeId: id, clientRunId: runId() }, { openid: FRIEND });
  assert.equal(again.code, 'ALREADY_PLAYED');
});

test('recipient who already played today gets a FRIENDLY on the same deck: stepped, never ranked, no board row', async () => {
  const { id } = await ownerChallenge(5);
  await playDaily(h, FRIEND, { right: 2 });
  const g = await h.call('getChallenge', { challengeId: id }, { openid: FRIEND });
  assert.equal(g.countsAsDaily, false);
  assert.equal(g.isFriendly, true);
  const cid = runId();
  const s = await h.call('startRun', { mode: 'challenge', challengeId: id, clientRunId: cid }, { openid: FRIEND });
  assert.equal(s.ok, true);
  assert.equal(s.ranked, false);
  assert.equal(s.friendly, true);
  assert.equal(s.kind, 'dailyFriendly');
  const o = oracle(h, s.dateKey);
  let last;
  for (let k = 1; k <= 12; k++) last = await h.call('answer', { clientRunId: cid, k, choice: k <= 11 ? o.correct(k) : o.wrong(k), ms: 2500 }, { openid: FRIEND });
  assert.equal(last.result.n, 11);
  assert.equal(last.result.dayStreak, null);
  assert.equal(last.result.rarity, null);
  assert.equal(h.db.all('daily_results').filter((r) => r.openid === FRIEND).length, 1, 'only the ranked result');
  assert.equal(h.db.all('daily_results').find((r) => r.openid === FRIEND).n, 2);
  assert.equal(h.db.all('daily_stats')[0].total, 2);
  assert.equal(h.db.all('player_stats').find((p) => p._id === FRIEND).totalDailies, 1);
  // friendly runs resume by their own clientRunId too
  assert.equal(h.db.all('run_progress').find((r) => r._id === `${FRIEND}_${cid}`).status, 'ended');
});

test('a challenge on a past deck is a friendly, server-stepped on that deck', async () => {
  at(15); const { id } = await ownerChallenge(4);
  at(17);
  const g = await h.call('getChallenge', { challengeId: id }, { openid: FRIEND });
  assert.equal(g.status, 'ready');
  assert.equal(g.countsAsDaily, false);
  assert.equal(g.dateKey, '20261015');
  const s = await h.call('startRun', { mode: 'challenge', challengeId: id, clientRunId: runId() }, { openid: FRIEND });
  assert.equal(s.ok, true);
  assert.equal(s.ranked, false);
  assert.equal(s.dateKey, '20261015');
  const o = oracle(h, '20261015');
  const r = await h.call('answer', { clientRunId: s.clientRunId, k: 1, choice: o.wrong(1), ms: 2000 }, { openid: FRIEND });
  assert.equal(r.ok, true);
  assert.equal(r.ended, true);
  assert.equal(h.db.all('daily_results').filter((x) => x.openid === FRIEND).length, 0);
  assert.equal(h.db.all('daily_stats').find((x) => x._id === '20261015').total, 1);
});

test('own challenge, expired challenge and bad ids', async () => {
  const { id } = await ownerChallenge(3);
  const own = await h.call('getChallenge', { challengeId: id }, { openid: OWNER });
  assert.equal(own.status, 'own');
  assert.equal(own.answerCount, 0);
  assert.equal(own.isFriendly, true);
  assert.equal((await h.call('startRun', { mode: 'challenge', challengeId: id, clientRunId: runId() }, { openid: OWNER })).code, 'OWN_CHALLENGE');
  assert.equal((await h.call('getChallenge', { challengeId: 'ABCDEFGH' }, { openid: FRIEND })).code, 'CHALLENGE_EXPIRED');
  assert.equal((await h.call('getChallenge', { challengeId: 'abc' }, { openid: FRIEND })).code, 'INVALID_ACTIONS');
  h.advance(8 * 86400e3);
  const exp = await h.call('getChallenge', { challengeId: id }, { openid: FRIEND });
  assert.equal(exp.code, 'CHALLENGE_EXPIRED');
  assert.equal(exp.status, 'expired');
  assert.equal((await h.call('startRun', { mode: 'challenge', challengeId: id, clientRunId: runId() }, { openid: FRIEND })).code, 'CHALLENGE_EXPIRED');
});

test('answers are counted once per player and the owner\'s view shows count and best', async () => {
  const { id } = await ownerChallenge(3);
  for (const [who, right] of [[FRIEND, 6], [THIRD, 2]]) {
    const run = await playDaily(h, who, { right, startEvent: { mode: 'challenge', challengeId: id, clientRunId: runId() } });
    assert.equal(run.last.result.n, right);
  }
  const own = await h.call('getChallenge', { challengeId: id }, { openid: OWNER });
  assert.equal(own.answerCount, 2);
  assert.equal(own.bestAnswer, 6);
  assert.equal(h.db.all('challenges')[0].answerCount, 2);
});

test('subscribe: NO_TEMPLATE without config, owner only, exactly one message even with parallel answers, no names or openids inside', async () => {
  const { id } = await ownerChallenge(3);
  assert.equal((await h.call('subscribeChallenge', { challengeId: id }, { openid: OWNER })).code, 'NO_TEMPLATE');
  h.db.put('app_config', { _id: 'live', subscribe: { tmplId: 'tmpl-abc', fields: { thing1: { value: '好友接受了挑战' }, number2: { value: 8 } } } });
  assert.equal((await h.call('subscribeChallenge', { challengeId: id }, { openid: FRIEND })).code, 'NOT_OWNER');
  assert.equal((await h.call('subscribeChallenge', { challengeId: 'ABCDEFGH' }, { openid: OWNER })).code, 'CHALLENGE_EXPIRED');
  const ok = await h.call('subscribeChallenge', { challengeId: id }, { openid: OWNER });
  assert.deepEqual([ok.ok, ok.granted], [true, true]);
  await h.call('subscribeChallenge', { challengeId: id }, { openid: OWNER });
  assert.equal(h.db.all('sub_grants').length, 1, 'one grant per challenge');

  // two friends finish at the same time
  const start = async (who) => (await h.call('getDaily', {}, { openid: who }), h.call('startRun', { mode: 'challenge', challengeId: id, clientRunId: runId() }, { openid: who }));
  const [s1, s2] = [await start(FRIEND), await start(THIRD)];
  const o = oracle(h, s1.dateKey);
  await Promise.all([
    h.call('answer', { clientRunId: s1.clientRunId, k: 1, choice: o.wrong(1), ms: 2000 }, { openid: FRIEND }),
    h.call('answer', { clientRunId: s2.clientRunId, k: 1, choice: o.wrong(1), ms: 2000 }, { openid: THIRD }),
  ]);
  assert.equal(h.sent.length, 1, 'exactly one message');
  const m = h.sent[0];
  assert.equal(m.touser, OWNER);
  assert.equal(m.templateId, 'tmpl-abc');
  assert.equal(JSON.stringify(m.data).includes(FRIEND), false);
  assert.equal(JSON.stringify(m.data).includes(THIRD), false);
  assert.equal(h.db.all('sub_grants')[0].used, true);
});

test('subscribe send failure is recorded and never breaks the answering player', async () => {
  const { id } = await ownerChallenge(3);
  h.db.put('app_config', { _id: 'live', subscribe: { tmplId: 'tmpl-abc', fields: {} } });
  await h.call('subscribeChallenge', { challengeId: id }, { openid: OWNER });
  h.failSends(true);
  const run = await playDaily(h, FRIEND, { right: 1, startEvent: { mode: 'challenge', challengeId: id, clientRunId: runId() } });
  h.failSends(false);
  assert.equal(run.last.ok, true);
  assert.equal(run.last.ended, true);
  assert.equal(h.db.all('sub_grants')[0].sendErrCode, 43101);
  assert.equal(h.sent.length, 0);
});

test('free-seed challenge: replay info for the recipient, same-deck comparison, life flag shown', async () => {
  const free = require('./helpers/free');
  const seed = 987654;
  const run = free.makeRun(h, { seed, group: 'all', right: 7 });
  const sub = await h.call('submitRun', { clientRunId: runId(), ...run.event }, { openid: OWNER });
  assert.equal(sub.ok, true);
  assert.equal(sub.streak, 7);
  const c = await h.call('createChallenge', { runId: sub.clientRunId }, { openid: OWNER });
  assert.equal(c.ok, true);
  const g = await h.call('getChallenge', { challengeId: c.challengeId }, { openid: FRIEND });
  assert.equal(g.status, 'ready');
  assert.equal(g.kind, 'free');
  assert.equal(g.seed, seed);
  assert.equal(g.group, 'all');
  assert.deepEqual([g.contentVersion, g.configVersion], [1, 1]);
  assert.equal(g.ownerStreak, 7);
  assert.equal(g.countsAsDaily, false);
  assert.equal('answers' in g, false);
  assert.equal((await h.call('startRun', { mode: 'challenge', challengeId: c.challengeId, clientRunId: runId() }, { openid: FRIEND })).code, 'INVALID_ACTIONS', 'free challenges are played on the client');
  const mine = free.makeRun(h, { seed, group: 'all', right: 9 });
  const sub2 = await h.call('submitRun', { clientRunId: runId(), challengeId: c.challengeId, ...mine.event }, { openid: FRIEND });
  assert.equal(sub2.ok, true);
  assert.deepEqual(sub2.challengeCompare, { ownerStreak: 7, ownerLifeUsed: false, myStreak: 9 });
  assert.equal(h.db.all('challenges')[0].answerCount, 1);
  // not the same deck -> rejected
  const other = free.makeRun(h, { seed: seed + 1, group: 'all', right: 3 });
  assert.equal((await h.call('submitRun', { clientRunId: runId(), challengeId: c.challengeId, ...other.event }, { openid: THIRD })).code, 'INVALID_ACTIONS');
  // owner cannot answer own challenge
  assert.equal((await h.call('submitRun', { clientRunId: runId(), challengeId: c.challengeId, ...mine.event }, { openid: OWNER })).code, 'OWN_CHALLENGE');
  const own = await h.call('getChallenge', { challengeId: c.challengeId }, { openid: OWNER });
  assert.deepEqual([own.answerCount, own.bestAnswer], [1, 9]);
});
