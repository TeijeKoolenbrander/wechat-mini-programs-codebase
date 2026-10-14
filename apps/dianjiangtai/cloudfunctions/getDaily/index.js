'use strict';
// getDaily: today's token sheet + the caller's status. Creates the seed lazily if genDaily missed.
// Never returns the seed, the best lineup or any battle data (spec §5.2, AC 19).
const core = require('./common/coreapi');
const store = require('./common/store');
const { ensureDaily } = require('./common/daily');
const { now, configuredTimeoutMs } = require('./common/util');

exports.main = store.handler(async (event, { openid, startedAt }) => {
  const serverNow = now();
  const dateKey = core.dateKeyAt(serverNow);
  const { doc } = await ensureDaily(dateKey, { startedAt, timeoutMs: configuredTimeoutMs() });

  let myStatus = 'none';
  let myRecord;
  const result = await store.getDoc('daily_results', `${dateKey}_${openid}`);
  if (result) {
    myStatus = 'done';
    myRecord = { w: result.w, l: result.l };
  } else if (await store.getDoc('daily_starts', `${dateKey}_${openid}`)) {
    myStatus = 'started';
  }
  const out = { ok: true, dateKey, issueNo: doc.issueNo, rounds: doc.rounds, serverNow, myStatus };
  if (myRecord) out.myRecord = myRecord;
  return out;
});
