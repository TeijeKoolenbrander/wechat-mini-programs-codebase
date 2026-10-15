'use strict';
// reportCard: no-text content feedback (spec 6.3, AC 79). Reason whitelist, <= 10 per day per openid.
const core = require('./common/coreapi');
const store = require('./common/store');
const input = require('./common/input');
const { fail, now } = require('./common/util');


exports.main = store.handler(async (event, { openid }) => {
  const itemId = input.itemId(event.itemId);
  const reason = input.reportReason(event.reason);
  const dateKey = input.optDateKey(event.dateKey);
  if (!core.getItem(itemId)) fail('INVALID_INPUT', 'unknown item');
  const nowMs = now();
  await store.rateLimitDay(openid, 'report', core.dateKeyAt(nowMs), core.cfg().reportsPerDay);
  await store.db().collection('card_reports').add({ data: { openid, dateKey, itemId, reason, ts: nowMs } });
  return { ok: true };
});
