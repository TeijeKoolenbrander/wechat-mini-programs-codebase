'use strict';
// submitRun: FREE runs only (spec 5.3, 11.2, 11.3). Rebuilds the deck from (seed, group, versions), replays the
// answers; the server streak is authoritative (bests, challenges). Daily-deck runs never come here (see `answer`).
const core = require('./common/coreapi');
const store = require('./common/store');
const input = require('./common/input');
const freeplay = require('./common/freeplay');
const challenges = require('./common/challenges');
const anomalies = require('./common/anomalies');
const runs = require('./common/runs');
const { fail, now } = require('./common/util');

const SUBMITS_PER_MIN = 30;

async function respond(run) {
  const out = { ok: true, clientRunId: run.clientRunId, streak: run.serverStreak, mismatch: !!run.mismatch, lifeUsed: !!run.lifeUsed };
  if (run.challengeId) {
    const ch = await store.getDoc('challenges', run.challengeId);
    if (ch) out.challengeCompare = { ownerStreak: ch.ownerStreak, ownerLifeUsed: !!ch.ownerLifeUsed, myStreak: run.serverStreak };
  }
  return out;
}

async function bumpBestFree(openid, streak, nowMs) {
  try {
    await store.addIfAbsent('player_stats', { ...runs.defaultStats(openid), updatedAt: nowMs });
    await store.db().runTransaction(async (t) => {
      const s = await store.getDocT(t, 'player_stats', openid);
      if (s && (s.bestFree || 0) < streak) await t.collection('player_stats').doc(openid).update({ data: { bestFree: streak, updatedAt: nowMs } });
    });
  } catch (e) {
    console.warn('bestFree update failed', store.errText(e));
  }
}

exports.main = store.handler(async (event, { openid }) => {
  // ---- 1. input validation (identity is NEVER read from input) ----
  const clientRunId = input.clientRunId(event.clientRunId);
  const seed = input.seedU32(event.seed);
  const group = event.group;
  if (typeof group !== 'string' || !core.isGroup(group)) fail('INVALID_ACTIONS', 'bad group');
  const contentVersion = input.versionInt(event.contentVersion, 'contentVersion');
  const configVersion = input.versionInt(event.configVersion, 'configVersion');
  const answers = input.freeAnswers(event.answers);
  const lifeAtK = input.optLifeAtK(event.lifeAtK);
  const clientStreak = input.optClientStreak(event.clientStreak);
  const challengeId = input.optChallengeId(event.challengeId);
  const runDocId = `${openid}_${clientRunId}`;
  const nowMs = now();

  // ---- 2. idempotency: the same clientRunId returns the stored result ----
  const existing = await store.getDoc('runs', runDocId);
  if (existing) return respond(existing);
  await store.rateLimit(openid, 'submit', 1, SUBMITS_PER_MIN);

  // ---- 3. versions, deck, replay ----
  if (!core.isKnownContentVersion(contentVersion) || !core.isKnownConfigVersion(configVersion)) fail('INVALID_ACTIONS', 'unknown version');
  const deck = core.buildFreeDeck(seed, contentVersion, configVersion, group);
  if (!deck || deck.length === 0) fail('INVALID_ACTIONS', 'cannot rebuild deck');
  const rp = freeplay.replayFree(deck, answers, lifeAtK);

  // ---- 4. challenge: must be a free challenge on the same seed/group/versions ----
  let challenge = null;
  let firstAnswer = false;
  if (challengeId) {
    challenge = await challenges.loadAnswerable(challengeId, openid, nowMs);
    if (challenge.kind !== 'free' || challenge.seed !== seed || challenge.group !== group
      || challenge.contentVersion !== contentVersion || challenge.configVersion !== configVersion) {
      fail('INVALID_ACTIONS', 'run does not match the challenge');
    }
    firstAnswer = !(await challenges.priorAnswer(openid, challengeId));
  }

  // ---- 5. persist ----
  const mismatch = clientStreak !== null && clientStreak !== rp.streak;
  const run = {
    _id: runDocId, openid, clientRunId, seed, group, contentVersion, configVersion, answers, lifeAtK, lifeUsed: rp.lifeUsed,
    serverStreak: rp.streak, clientStreak, mismatch, ended: rp.ended, cleared: rp.cleared, challengeId, submittedAt: nowMs,
  };
  const created = await store.addIfAbsent('runs', run);
  if (!created) return respond(await store.getDoc('runs', runDocId));

  await bumpBestFree(openid, rp.streak, nowMs);
  if (mismatch) await anomalies.record(openid, clientRunId, 'mismatch', null, { client: clientStreak, server: rp.streak });
  if (challenge && firstAnswer) await challenges.recordAnswer(challengeId, rp.streak);
  return respond(run);
});
