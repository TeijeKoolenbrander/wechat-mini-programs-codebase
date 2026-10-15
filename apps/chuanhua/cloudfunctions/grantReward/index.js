'use strict';
// grantReward (spec 11, AC 101-102): cosmetic/allowance rewards for a completed rewarded video, under
// hard daily caps (2 extra starts, 1 palette). The server cannot verify video completion, so the caps
// are the control (nothing competitive is at stake). A no-fill grant is allowed once per day per kind.
const store = require('./common/store');
const players = require('./common/players');
const lifecycle = require('./common/lifecycle');
const { LIMITS } = require('./common/config');
const { AppError, fail, now, dateKeyAt } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const kind = event.kind;
  if (kind !== 'start' && kind !== 'palette') fail('BAD_INPUT', 'bad kind');
  const noFill = event.noFill === true;
  const nowMs = now();
  const dateKey = dateKeyAt(nowMs);
  let out = null;
  await store.txn(async (t) => {
    const pc = lifecycle.makePlayerCache(t, nowMs);
    const p = await pc.get(openid);
    const d = players.dayOf(p, dateKey);
    if (kind === 'start' && d.adStarts >= LIMITS.adStartsMax) throw new AppError('REWARD_LIMIT', 'daily limit');
    if (kind === 'palette' && d.palette) throw new AppError('REWARD_LIMIT', 'daily limit');
    if (noFill) {
      if (d.noFill[kind]) throw new AppError('REWARD_LIMIT', 'no-fill grant already used today');
      d.noFill[kind] = true;
    }
    if (kind === 'start') d.adStarts += 1; else d.palette = true;
    p.lastActiveAt = nowMs;
    await pc.flush();
    out = { startsLeft: players.startsLeft(p, dateKey), adStartsLeft: players.adStartsLeft(p, dateKey), paletteToday: !!d.palette };
  });
  return { ok: true, ...out };
});
