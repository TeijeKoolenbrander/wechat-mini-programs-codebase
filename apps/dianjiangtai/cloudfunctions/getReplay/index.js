'use strict';
// getReplay: best lineup for the caller's own completed run (复盘). Own runs only; for the daily
// this is therefore only reachable after the daily result exists (a run row is written on submit).
const core = require('./common/coreapi');
const store = require('./common/store');
const limits = require('./common/limits');
const input = require('./common/input');
const rules = require('./common/rules');
const { fail, now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const runId = input.clientRunId(event.runId);
  const run = await store.getDoc('runs', `${openid}_${runId}`); // id is derived from the context openid
  if (!run) fail('RUN_NOT_FOUND', 'no such run');
  // The best lineup of a daily seed is the daily optimum: locked until the caller's ranked daily exists or the date is over.
  if (await rules.dailyLocked(await rules.dailyDateOfRun(run), openid, now())) fail('REPLAY_LOCKED', 'finish the daily first');
  let best = run.best;
  if (!best) {
    const r = core.bestLineup(run.seed, run.contentVersion, run.finalTokens, run.configVersion);
    if (!r) return { ok: true, best: null }; // five distinct generals cannot be drafted from these tokens
    best = { lineup: core.normaliseLineup(r.lineup) || r.lineup, record: r.record };
    await store.db().collection('runs').doc(run._id).update({ data: { best } });
  }
  return { ok: true, best };
}, { rate: limits.rateOf('getReplay') });
