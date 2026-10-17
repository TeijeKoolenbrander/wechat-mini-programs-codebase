'use strict';
// reportCard: a player flags a card as unsuitable / ambiguous / a typo (spec 11.2, AC 79). Stores ids only, never text;
// grants nothing.
const store = require('./common/store');
const { fail, now } = require('./common/util');
const { core, CONFIG, content, dateKeyAt, rateOf } = require('./common/coreapi');

exports.main = store.handler(async (event, { openid }) => {
  const v = core.V.reportCard(event);
  if (!v.ok) fail('INVALID_INPUT', 'invalid input');
  if (!content().itemIndex[v.v.itemId]) fail('INVALID_INPUT', 'unknown item');
  await store.dayLimit(openid, 'report', CONFIG.limits.reportPerDay, dateKeyAt(now()));
  await store.coll('card_reports').add({ data: { openid, dateKey: v.v.dateKey, itemId: v.v.itemId, reason: v.v.reason, ts: now() } });
  return { ok: true };
}, { rate: rateOf('reportCard') });
