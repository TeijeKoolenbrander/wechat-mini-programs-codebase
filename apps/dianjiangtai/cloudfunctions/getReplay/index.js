'use strict';
// getReplay: best lineup for the caller's own completed run (复盘). Own runs only; for the daily
// this is therefore only reachable after the daily result exists (a run row is written on submit).
const core = require('./common/coreapi');
const store = require('./common/store');
const input = require('./common/input');
const { fail } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const runId = input.clientRunId(event.runId);
  const run = await store.getDoc('runs', `${openid}_${runId}`); // id is derived from the context openid
  if (!run) fail('RUN_NOT_FOUND', 'no such run');
  let best = run.best;
  if (!best) {
    const r = core.bestLineup(run.seed, run.contentVersion, run.finalTokens);
    best = { lineup: core.normaliseLineup(r.lineup) || r.lineup, record: r.record };
    await store.db().collection('runs').doc(run._id).update({ data: { best } });
  }
  return { ok: true, best };
});
