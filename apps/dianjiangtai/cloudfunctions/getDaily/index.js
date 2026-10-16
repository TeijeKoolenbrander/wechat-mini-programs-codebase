'use strict';
// getDaily: today's status for the caller. Creates the seed lazily if genDaily missed.
// v1 (PO-8): NO rounds. Tokens come only from startRun (round 1) and getRound (round by round), so a client
// never holds a future round. Never returns the seed, the best lineup or any battle data (spec 5.2, AC 19, 86).
const core = require('./common/coreapi');
const store = require('./common/store');
const limits = require('./common/limits');
const streak = require('./common/streak');
const appconfig = require('./common/appconfig');
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
  const ps = await store.getDoc('player_stats', openid);
  const myStreak = await streak.currentFor(ps, dateKey, serverNow);
  let features;
  try {
    features = await appconfig.features();
  } catch (e) {
    features = { ads: { banner: { enabled: false, adUnitId: '' }, interstitial: core.interstitialDefaults() } };
  }
  const out = {
    ok: true, dateKey, issueNo: doc.issueNo, variant: doc.variant || core.variantFor(dateKey), serverNow, myStatus,
    myStreak, features,
  };
  if (myRecord) out.myRecord = myRecord;
  return out;
}, { rate: limits.rateOf('getDaily') });
