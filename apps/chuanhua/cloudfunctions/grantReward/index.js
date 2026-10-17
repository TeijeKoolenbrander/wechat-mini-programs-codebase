'use strict';
// grantReward: daily-capped rewards after a rewarded video (spec 11, AC 101, 102). Cosmetic or a small start allowance, so
// the client's completion signal is trusted within the caps (2 extra starts/day, 1 palette/day, one no-fill grant per day).
const allowance = require('./core/allowance');
const store = require('./common/store');
const players = require('./common/players');
const { bad } = require('./common/errors');

exports.main = store.handler(async (event, { openid }) => {
  await store.rateLimit(openid, 'reward', 1, 10);
  return store.txn(async (t) => {
    const p = await players.getT(t, openid);
    const r = allowance.grantReward(p, event.kind, event.noFill === true, players.dateKey());
    if (!r.ok) bad(r.code);
    await players.putPlayerT(t, r.player);
    const out = { ok: true };
    if (r.startsLeft !== undefined) out.startsLeft = r.startsLeft;
    if (r.adStartsLeft !== undefined) out.adStartsLeft = r.adStartsLeft;
    if (r.paletteToday !== undefined) out.paletteToday = r.paletteToday;
    return out;
  });
});
