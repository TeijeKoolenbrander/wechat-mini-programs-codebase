'use strict';
// unlockDistribution: centred 21-bin national histograms of a day (spec 11.2, AC 40). The unlock itself is client
// state; the server stores only the rate counter. Limit 20 per Beijing day (TD-8).
const store = require('./common/store');
const { fail, now } = require('./common/util');
const { core, CONFIG, dateKeyAt, rateOf } = require('./common/coreapi');
const daily = require('./common/daily');

exports.main = store.handler(async (event, { openid }) => {
  const v = core.V.unlockDistribution(event);
  if (!v.ok) fail('INVALID_INPUT', 'invalid input');
  const nowMs = now();
  const today = dateKeyAt(nowMs);
  const set = await store.getDoc('daily_sets', v.v.dateKey);
  if (!set || v.v.dateKey > today) fail('INVALID_INPUT', 'unknown day');
  await store.dayLimit(openid, 'dist', CONFIG.limits.distributionPerDay, today);
  const [entry, hists] = await Promise.all([store.getDoc('daily_entries', `${set._id}_${openid}`), daily.loadHists(set._id)]);
  return { ok: true, dateKey: set._id, hist: core.SV.distributionView(set, entry, hists, nowMs) };
}, { rate: rateOf('unlockDistribution') });
