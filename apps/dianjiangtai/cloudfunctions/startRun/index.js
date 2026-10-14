'use strict';
// startRun: anchors the one daily attempt (daily_starts, deterministic _id) for ranked runs.
const core = require('./common/coreapi');
const store = require('./common/store');
const input = require('./common/input');
const rules = require('./common/rules');
const { now, fail } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  input.clientRunId(event.clientRunId); // validated; the run row itself is created by submitRun
  const mode = input.mode(event.mode);
  const nowMs = now();
  const today = core.dateKeyAt(nowMs);

  if (mode === 'free') return { ok: true, resumed: false };

  let dateKey;
  let countsAsDaily = true;
  if (mode === 'daily') {
    dateKey = input.optDateKey(event.dateKey) || today;
    if (dateKey !== today) fail('INVALID_ACTIONS', 'daily can only be started for today');
    if (!(await store.getDoc('daily_seeds', dateKey))) fail('SEED_NOT_FOUND', 'no seed for today');
  } else {
    const ch = await rules.loadAnswerableChallenge(input.challengeId(event.challengeId), openid, nowMs);
    countsAsDaily = await rules.challengeCountsAsDaily(ch, openid, nowMs);
    if (!countsAsDaily) return { ok: true, resumed: false, countsAsDaily: false };
    dateKey = ch.dateKey;
  }

  if (await store.getDoc('daily_results', `${dateKey}_${openid}`)) {
    return { ok: true, resumed: true, countsAsDaily: mode === 'daily' ? true : false };
  }
  const created = await store.addIfAbsent('daily_starts', {
    _id: `${dateKey}_${openid}`, openid, dateKey, startedAt: nowMs, clientRunId: event.clientRunId,
  });
  return { ok: true, resumed: !created, countsAsDaily };
});
