'use strict';
// getDaily: today's puzzle header + the caller's status (spec 14.2). Lazily publishes today's puzzle
// if the 23:00 timer missed (bank only, same idempotent path as genDaily). Never returns answerRef.
const store = require('./common/store');
const coreapi = require('./common/coreapi');
const puzzles = require('./common/puzzles');
const plays = require('./common/plays');
const rules = require('./common/rules');
const { now } = require('./common/util');

const DEFAULT_ADS = Object.freeze({ interstitial: { enabled: false }, banner: { enabled: false } });

async function features() {
  const cfg = await store.getDoc('app_config', 'live');
  const ads = cfg && cfg.ads && typeof cfg.ads === 'object' ? cfg.ads : DEFAULT_ADS;
  return { ads };
}

exports.main = store.handler(async (event, { openid }) => {
  const nowMs = now();
  const dateKey = coreapi.dateKeyAt(nowMs);
  const { doc } = await puzzles.ensureDaily(dateKey); // DAILY_UNAVAILABLE when the bank is empty
  const puzzleId = 'd' + dateKey;

  const [play, stats, prevKey, feat] = await Promise.all([
    store.getDoc('plays', plays.playId(puzzleId, openid)),
    store.getDoc('player_stats', openid),
    puzzles.prevPublished(dateKey),
    features(),
  ]);
  return {
    ok: true,
    dateKey,
    issueNo: doc.issueNo,
    puzzleId,
    serverNow: nowMs,
    warmups: doc.warmups,
    vocabVersion: doc.vocabVersion,
    configVersion: doc.configVersion,
    my: play
      ? { status: play.status, steps: play.steps, best: play.best, hints: play.hintsUsed.length }
      : { status: 'new', steps: 0, best: null, hints: 0 },
    myStreak: rules.effectiveStreak(stats, dateKey, prevKey),
    features: feat,
  };
});
