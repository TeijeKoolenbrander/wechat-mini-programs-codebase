'use strict';
// getArchiveDay: one closed day for play-back / review (spec 11.2, AC 36-38). No histograms (TD-11).
const store = require('./common/store');
const { fail, now } = require('./common/util');
const { core, content, rateOf } = require('./common/coreapi');
const daily = require('./common/daily');

exports.main = store.handler(async (event, { openid }) => {
  const v = core.V.getArchiveDay(event);
  if (!v.ok) fail('INVALID_INPUT', 'invalid input');
  let set = await store.getDoc('daily_sets', v.v.dateKey);
  if (!set) fail('DAY_OPEN', 'no closed day');
  set = await daily.ensureFinal(set);
  const entry = await store.getDoc('daily_entries', `${set._id}_${openid}`);
  const out = core.SV.archiveDayView(set, entry, content(set.contentVersion), now());
  if (!out.ok) fail(out.code, out.code);
  return out;
}, { rate: rateOf('getArchiveDay') });
