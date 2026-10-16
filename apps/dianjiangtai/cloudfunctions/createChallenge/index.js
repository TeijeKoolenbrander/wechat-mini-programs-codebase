'use strict';
// createChallenge: one challenge per validated run. The id is a keyed hash of the run, so repeated
// calls return the same id (add with a fixed _id; duplicate -> existing).
const core = require('./common/coreapi');
const store = require('./common/store');
const limits = require('./common/limits');
const secrets = require('./common/secrets');
const input = require('./common/input');
const { fail, now, hmacHex, base32From, DAY_MS } = require('./common/util');

const EXPIRY_DAYS = 7;
const ID_TRIES = 4;

exports.main = store.handler(async (event, { openid }) => {
  const runId = input.clientRunId(event.runId);
  const run = await store.getDoc('runs', `${openid}_${runId}`);
  if (!run) fail('RUN_NOT_FOUND', 'only your own validated run can be challenged');
  const k = secrets.pepper(); // single secret, domain-separated below; SERVER_CONFIG when missing or < 32 chars
  const nowMs = now();
  // If the run was on a daily seed (daily, or a challenge on a daily seed) the challenge is 'daily' mode.
  const daily = !!run.dateKey;
  const rounds = daily ? (await store.getDoc('daily_seeds', run.dateKey) || {}).rounds : null;
  const sheet = rounds || core.buildSheet(run.seed, run.contentVersion);

  for (let n = 0; n < ID_TRIES; n++) {
    const id = base32From(hmacHex(k, `challenge:${run._id}#${n}`));
    const doc = {
      _id: id, ownerOpenid: openid, runId, mode: daily ? 'daily' : 'free', seed: run.seed,
      dateKey: run.dateKey || null, rounds: sheet, record: run.serverRecord, lineup: run.lineup,
      contentVersion: run.contentVersion, configVersion: run.configVersion,
      createdAt: nowMs, expiresAt: nowMs + EXPIRY_DAYS * DAY_MS, answerCount: 0, bestAnswer: null,
    };
    if (await store.addIfAbsent('challenges', doc)) return { ok: true, challengeId: id };
    const ex = await store.getDoc('challenges', id);
    if (ex && ex.ownerOpenid === openid && ex.runId === runId) return { ok: true, challengeId: id };
    // hash collision with a different run: try the next derivation
  }
  fail('INTERNAL', 'could not allocate challenge id');
}, { rate: limits.rateOf('createChallenge') });
