'use strict';
// getBonusCard (加一题): one unanswered card of a closed day (spec 11.2, TD-10). The per-day limit is consumed only
// when a card is actually served. The "complete today's daily first" gate is UI-only.
const store = require('./common/store');
const { fail, now, randomFloat } = require('./common/util');
const { core, CONFIG, content, dateKeyAt, rateOf } = require('./common/coreapi');
const daily = require('./common/daily');

const CLOSED_DAYS_SCANNED = 60; // newest closed days considered (TD-31)

exports.main = store.handler(async (event, { openid }) => {
  const v = core.V.getBonusCard(event);
  if (!v.ok) fail('INVALID_INPUT', 'invalid input');
  const nowMs = now();
  const _ = store._();
  const r = await store.coll('daily_sets').where({ _id: _.lte(core.W.newestClosedKey(nowMs)) }).orderBy('_id', 'desc').limit(CLOSED_DAYS_SCANNED).get();
  const closed = [];
  for (const s of r.data) if (core.W.dayClosed(s._id, nowMs)) closed.push(await daily.ensureFinal(s));
  const docs = await store.getMany('daily_entries', closed.map((s) => `${s._id}_${openid}`));
  const byDate = {};
  closed.forEach((s) => {
    byDate[s._id] = docs.get(`${s._id}_${openid}`) || null;
  });
  const pick = core.SV.pickBonusCard(closed, byDate, new Set(v.v.exclude), randomFloat, content());
  if (!pick) fail('NO_CARD_AVAILABLE', 'NO_CARD_AVAILABLE');
  await store.dayLimit(openid, 'bonus', CONFIG.limits.bonusPerDay, dateKeyAt(nowMs));
  return { ok: true, card: pick.card, final: pick.final, dateKey: pick.dateKey, issueNo: pick.issueNo };
}, { rate: rateOf('getBonusCard') });
