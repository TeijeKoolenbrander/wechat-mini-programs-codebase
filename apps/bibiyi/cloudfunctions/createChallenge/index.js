'use strict';
// createChallenge: one challenge per own, finished run (spec 5.4, 11.2). The id is a keyed hash of the run, so
// repeated calls return the same id (add with a fixed _id; duplicate -> existing). The card carries only `c=<id>`.
const core = require('./common/coreapi');
const store = require('./common/store');
const input = require('./common/input');
const daily = require('./common/daily');
const { fail, now, hmacHex, base32From, DAY_MS } = require('./common/util');

const EXPIRY_DAYS = 7;
const ID_TRIES = 4;

function key() {
  const k = process.env.GROUP_REF_PEPPER; // single secret, domain-separated below
  if (!k) fail('SERVER_CONFIG', 'GROUP_REF_PEPPER not configured');
  return k;
}

/** the caller's own finished run -> challenge fields. Daily-deck runs: run_progress; free runs: runs. */
async function resolveRun(openid, runId) {
  const free = await store.getDoc('runs', `${openid}_${runId}`);
  if (free) {
    if (!(core.isKnownContentVersion(free.contentVersion) && core.isKnownConfigVersion(free.configVersion))) {
      fail('INVALID_ACTIONS', 'run is on a retired content version');
    }
    return {
      src: 'runs', kind: 'free', seed: free.seed, group: free.group, dateKey: null, contentVersion: free.contentVersion,
      configVersion: free.configVersion, ownerStreak: free.serverStreak, ownerLifeUsed: !!free.lifeUsed,
    };
  }
  const r = await store.db().collection('run_progress').where({ openid, clientRunId: runId }).limit(1).get();
  const run = r.data[0];
  if (!run || run.status !== 'ended') fail('RUN_NOT_FOUND', 'only your own finished run can be challenged');
  const deck = await daily.getDeck(run.dateKey);
  return {
    src: 'run_progress', kind: 'daily', seed: null, group: null, dateKey: run.dateKey, contentVersion: run.contentVersion,
    configVersion: deck ? deck.configVersion : core.currentVersions().configVersion, ownerStreak: run.streak, ownerLifeUsed: false,
  };
}

exports.main = store.handler(async (event, { openid }) => {
  const runId = input.clientRunId(event.runId);
  await store.rateLimit(openid, 'challenge', 1, 20);
  const k = key();
  const src = await resolveRun(openid, runId);
  const nowMs = now();

  for (let n = 0; n < ID_TRIES; n++) {
    const id = base32From(hmacHex(k, `challenge:${openid}:${src.src}:${runId}#${n}`));
    const doc = {
      _id: id, ownerOpenid: openid, runId, kind: src.kind, dateKey: src.dateKey, seed: src.seed, group: src.group,
      contentVersion: src.contentVersion, configVersion: src.configVersion, ownerStreak: src.ownerStreak,
      ownerLifeUsed: src.ownerLifeUsed, createdAt: nowMs, expiresAt: nowMs + EXPIRY_DAYS * DAY_MS, answerCount: 0, bestAnswer: null,
    };
    if (await store.addIfAbsent('challenges', doc)) return { ok: true, challengeId: id };
    const ex = await store.getDoc('challenges', id);
    if (ex && ex.ownerOpenid === openid && ex.runId === runId) return { ok: true, challengeId: id };
    // hash collision with a different run: try the next derivation
  }
  fail('INTERNAL', 'could not allocate challenge id');
});
