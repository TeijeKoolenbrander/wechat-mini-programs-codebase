'use strict';
// getDaily: today's 5 cards, the caller's answers and reveals, group blocks, yesterday, streak, features (spec 11.2).
// Authenticate, validate (core/input), read, call core/service dailyView, return. No rules live here.
const store = require('./common/store');
const { fail, now } = require('./common/util');
const { core, dateKeyAt, content, rateOf } = require('./common/coreapi');
const daily = require('./common/daily');
const groups = require('./common/groups');

exports.main = store.handler(async (event, { openid }) => {
  const v = core.V.getDaily(event);
  if (!v.ok) fail('INVALID_INPUT', 'invalid input');
  const nowMs = now();
  const today = dateKeyAt(nowMs);
  const dateKey = v.v.dateKey || today;
  if (!core.W.liveDay(dateKey, nowMs)) fail('INVALID_INPUT', 'day is closed; use getArchiveDay');
  const set = await daily.ensureSet(dateKey);
  if (!set) fail('DAILY_UNAVAILABLE', 'no set for this day');

  const [entry, hists, stats, prev, cfg] = await Promise.all([
    store.getDoc('daily_entries', `${dateKey}_${openid}`),
    daily.loadHists(dateKey),
    store.getDoc('player_stats', openid),
    daily.prevPublished(today),
    groups.appConfig(),
  ]);

  let blocks = null;
  if (v.v.groupRef && (await groups.isMember(openid, v.v.groupRef))) {
    blocks = await groups.groupBlocks(openid, v.v.groupRef, dateKey, entry);
  }

  let yesterday = null;
  if (prev) {
    const prevEntry = await store.getDoc('daily_entries', `${prev._id}_${openid}`);
    if (prevEntry && core.SV.isComplete(prevEntry)) {
      const prevSet = await daily.ensureFinal(prev);
      yesterday = core.SV.yesterdayInfo(prevSet, prevEntry, nowMs);
    }
  }

  return core.SV.dailyView({
    set,
    entry,
    hists,
    content: content(set.contentVersion),
    groupBlocks: blocks,
    streak: core.ST.display(stats, today, prev ? prev._id : null),
    yesterday,
    features: core.AD.buildFeatures(cfg),
    nowMs,
  });
}, { rate: rateOf('getDaily') });
