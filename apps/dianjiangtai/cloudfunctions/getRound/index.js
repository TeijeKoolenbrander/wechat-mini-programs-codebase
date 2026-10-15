'use strict';
// getRound: progressive daily token delivery (spec 5.2, 14.2, AC 86). Returns round n+1 only for actions
// that are a valid partial run ending exactly at round n's pick AND extend the frozen daily_progress prefix.
//  - never returns a round >= released+1, never the seed or the best lineup;
//  - idempotent: the same prefix returns the same round, and a stale (shorter) prefix returns an already
//    released round;
//  - clients cannot skip: round n+1 needs round n to have been released (released >= n) and n valid picks.
const core = require('./common/coreapi');
const store = require('./common/store');
const input = require('./common/input');
const rules = require('./common/rules');
const progress = require('./common/progress');
const anomaly = require('./common/anomaly');
const { now, fail } = require('./common/util');

const ROUNDS_PER_MIN = 60;

exports.main = store.handler(async (event, { openid }) => {
  const clientRunId = input.clientRunId(event.clientRunId);
  const dateKey = input.optDateKey(event.dateKey);
  if (!dateKey) fail('INVALID_ACTIONS', 'dateKey required');
  const actions = input.actions(event.actions);
  const nowMs = now();

  const ws = rules.windowState(dateKey, nowMs);
  if (ws === 'future') fail('INVALID_ACTIONS', 'date in the future');
  if (ws === 'late') fail('LATE_SUBMIT', 'daily expired');
  await store.rateLimit(openid, 'round', 1, ROUNDS_PER_MIN);

  const pid = progress.progressId(dateKey, openid);
  const p = await store.getDoc('daily_progress', pid);
  if (!p) fail('NOT_STARTED', 'call startRun first');
  if (await store.getDoc('daily_results', `${dateKey}_${openid}`)) fail('ALREADY_PLAYED', 'daily already played');

  // the sheet and versions of the attempt (challenge counting as the daily uses its own pinned copy)
  let seedDoc = await store.getDoc('daily_seeds', dateKey);
  if (!seedDoc) fail('SEED_NOT_FOUND', 'no seed for date');
  let { seed, contentVersion, configVersion, rounds } = seedDoc;
  const mode = p.mode === 'challenge' ? 'challenge' : 'daily';
  if (p.mode === 'challenge' && p.challengeId) {
    const ch = await store.getDoc('challenges', p.challengeId);
    if (ch && ch.seed === seed) ({ contentVersion, configVersion, rounds } = ch);
  }

  const rp = core.replayPartial(seed, contentVersion, actions, mode, rounds, configVersion);
  if (!rp.ok) fail('INVALID_ACTIONS', String(rp.error).slice(0, 120));
  const n = rp.picks; // 1..4: the round whose pick the actions end with
  const next = n + 1;

  const stored = p.actions || [];
  if (progress.isPrefix(stored, actions)) {
    // extends (or equals) the frozen prefix
    if (p.released < n) fail('INVALID_ACTIONS', 'rounds out of order'); // cannot skip a round
    if (p.released >= next && stored.length === actions.length) {
      return { ok: true, round: next, data: rounds[n], released: p.released };
    }
    let released = p.released;
    await store.db().runTransaction(async (t) => {
      const cur = await store.getDocT(t, 'daily_progress', pid);
      if (!cur) fail('NOT_STARTED', 'call startRun first');
      if (!progress.isPrefix(cur.actions || [], actions) || cur.released < n) fail('INVALID_ACTIONS', 'prefix changed');
      released = Math.max(cur.released, next);
      await t.collection('daily_progress').doc(pid).update({ data: { actions, released, updatedAt: nowMs } });
    });
    return { ok: true, round: next, data: rounds[n], released };
  }
  if (progress.isPrefix(actions, stored) && next <= p.released) {
    // stale retry of an earlier call: same answer as then (rounds before `released` are already the client's)
    return { ok: true, round: next, data: rounds[n], released: p.released };
  }
  await anomaly.flag(openid, clientRunId, dateKey, 'prefix', { where: 'getRound', picks: n });
  return fail('INVALID_ACTIONS', 'actions do not extend the stored prefix');
});
