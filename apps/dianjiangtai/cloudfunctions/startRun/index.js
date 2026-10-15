'use strict';
// startRun: anchors the one daily attempt (daily_starts, deterministic _id) for ranked runs.
// v1: for a ranked daily (or a challenge that counts as today's daily) also creates daily_progress
// (released 1) and returns exactly the rounds released so far (spec 5.2, AC 86). A resumed attempt
// (reinstall, second device) gets every released round plus the frozen action prefix.
const core = require('./common/coreapi');
const store = require('./common/store');
const input = require('./common/input');
const rules = require('./common/rules');
const progress = require('./common/progress');
const { now, fail } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  input.clientRunId(event.clientRunId); // validated; the run row itself is created by submitRun
  const mode = input.mode(event.mode);
  const nowMs = now();
  const today = core.dateKeyAt(nowMs);

  if (mode === 'free') return { ok: true, resumed: false };

  let dateKey;
  let challenge = null;
  let countsAsDaily = true;
  let seedDoc;
  if (mode === 'daily') {
    dateKey = input.optDateKey(event.dateKey) || today;
    if (dateKey !== today) fail('INVALID_ACTIONS', 'daily can only be started for today');
    seedDoc = await store.getDoc('daily_seeds', dateKey);
    if (!seedDoc) fail('SEED_NOT_FOUND', 'no seed for today');
  } else {
    const ch = await rules.loadAnswerableChallenge(input.challengeId(event.challengeId), openid, nowMs);
    countsAsDaily = await rules.challengeCountsAsDaily(ch, openid, nowMs);
    if (!countsAsDaily) return { ok: true, resumed: false, countsAsDaily: false };
    dateKey = ch.dateKey;
    challenge = ch;
    seedDoc = await store.getDoc('daily_seeds', dateKey);
    if (!seedDoc) fail('SEED_NOT_FOUND', 'no seed for today');
  }

  if (await store.getDoc('daily_results', `${dateKey}_${openid}`)) {
    return { ok: true, resumed: true, countsAsDaily: mode === 'daily' ? true : false };
  }
  const created = await store.addIfAbsent('daily_starts', {
    _id: `${dateKey}_${openid}`, openid, dateKey, startedAt: nowMs, clientRunId: event.clientRunId,
  });
  // daily_progress: add of the deterministic id; an existing row (resume, or a daily and a challenge start
  // racing) is returned as is. The first start decides the progress mode.
  const pid = progress.progressId(dateKey, openid);
  await store.addIfAbsent('daily_progress', {
    _id: pid, openid, dateKey, clientRunId: event.clientRunId, mode: challenge ? 'challenge' : 'daily',
    challengeId: challenge ? challenge._id : null, actions: [], released: 1, updatedAt: nowMs,
  });
  const p = await store.getDoc('daily_progress', pid);
  const sheet = challenge && p.mode === 'challenge' && p.challengeId === challenge._id ? challenge.rounds : seedDoc.rounds;
  const out = {
    ok: true, resumed: !created || p.released > 1 || p.actions.length > 0, countsAsDaily,
    released: p.released, rounds: progress.releasedRounds(sheet, p.released),
  };
  if (out.resumed) {
    out.actions = p.actions;
    out.clientRunId = p.clientRunId; // the attempt's original run id (a second device adopts it)
  }
  return out;
});
