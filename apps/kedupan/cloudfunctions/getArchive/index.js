'use strict';
// getArchive: closed days, newest first, with the caller's frozen total for completed ones (spec 11.2, AC 36).
const store = require('./common/store');
const { fail, now } = require('./common/util');
const { core, rateOf } = require('./common/coreapi');
const daily = require('./common/daily');

exports.main = store.handler(async (event, { openid }) => {
  const v = core.V.getArchive(event);
  if (!v.ok) fail('INVALID_INPUT', 'invalid input');
  const nowMs = now();
  const _ = store._();
  const newest = core.W.newestClosedKey(nowMs);
  const { before, limit } = v.v;
  const cond = before && before <= newest ? _.lt(before) : _.lte(newest);
  const r = await store.coll('daily_sets').where({ _id: cond }).orderBy('_id', 'desc').limit(limit + 1).get();
  const { page, hasMore } = core.SV.archivePage(r.data, before, limit, nowMs);
  const sets = [];
  for (const s of page) sets.push(await daily.ensureFinal(s));
  const entries = await store.getMany('daily_entries', sets.map((s) => `${s._id}_${openid}`));
  const items = sets.map((s) => core.SV.archiveItem(s, entries.get(`${s._id}_${openid}`) || null));
  const ps = await store.getDoc('player_stats', openid);
  return { ok: true, items, hasMore, bestStreak: ps ? ps.bestStreak || 0 : 0 };
}, { rate: rateOf('getArchive') });
