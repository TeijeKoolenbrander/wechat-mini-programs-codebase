'use strict';
// getDaily: status only (spec 5.2, 11.2). NEVER returns a question, a fact or a deck (AC 18).
// Lazily creates the deck if genDaily missed; finalizes the caller's expired open ranked runs (window).
const core = require('./common/coreapi');
const store = require('./common/store');
const daily = require('./common/daily');
const runs = require('./common/runs');
const features = require('./common/features');
const { now, configuredTimeoutMs, addDaysKey } = require('./common/util');

exports.main = store.handler(async (event, { openid, startedAt }) => {
  const serverNow = now();
  const dateKey = core.dateKeyAt(serverNow);

  // finalize runs whose D+1 00:30 window closed (independent of today's deck)
  const finalized = await runs.finalizeExpiredFor(openid, serverNow);

  const { doc: deck } = await daily.ensureDaily(dateKey, { startedAt, timeoutMs: configuredTimeoutMs() });

  let myStatus = 'none';
  let myRun;
  let myResult;
  const run = await store.getDoc('run_progress', runs.rankedId(dateKey, openid));
  if (run && run.status === 'ended') {
    myStatus = 'done';
    myResult = {
      n: run.result.n, endReason: run.result.endReason, rarity: await runs.rarityFor(dateKey, run.result.n),
      dayStreak: run.result.dayStreak === undefined ? null : run.result.dayStreak,
    };
  } else if (run) {
    myStatus = 'open';
    myRun = { k: run.k, streak: run.streak };
  }

  // a run started yesterday may still be inside its grace window (until 00:30)
  let graceRun;
  const yKey = addDaysKey(dateKey, -1);
  const yRun = await store.getDoc('run_progress', runs.rankedId(yKey, openid));
  if (yRun && yRun.status === 'open' && !runs.windowClosed(yRun, serverNow)) graceRun = { dateKey: yKey, k: yRun.k, streak: yRun.streak };

  const stats = await store.getDoc('player_stats', openid);
  const out = {
    ok: true, dateKey, issueNo: deck.issueNo, theme: deck.theme, themeLabel: deck.themeLabel, serverNow, myStatus,
    myDays: { current: await runs.shownDayStreak(stats, dateKey), best: stats ? stats.bestDays : 0 },
    bests: { daily: stats ? stats.bestDaily : 0, free: stats ? stats.bestFree : 0 },
    features: await features.getFeatures(),
  };
  if (myRun) out.myRun = myRun;
  if (myResult) out.myResult = myResult;
  if (graceRun) out.graceRun = graceRun;
  if (finalized.length) out.finalized = finalized;
  return out;
});
