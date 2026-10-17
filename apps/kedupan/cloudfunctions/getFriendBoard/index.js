'use strict';
// getFriendBoard: every complete daily of the day, hashed and ranked by national live score (spec 8.4, AC 46).
// Above CONFIG.board.listCap the board degrades to selfOnly. The listing is cached 60 s per instance; the caller's own
// row is always read fresh and spliced in.
const store = require('./common/store');
const { fail, now, rowHash, cacheSec } = require('./common/util');
const { core, CONFIG, rateOf } = require('./common/coreapi');
const daily = require('./common/daily');

const PAGE = 1000;

/** {count, entries|null}: entries only when count <= listCap */
async function listDay(dateKey) {
  const _ = store._();
  const where = { dateKey, completeAt: _.gt(0) };
  const count = (await store.coll('daily_entries').where(where).count()).total;
  if (count > CONFIG.board.listCap) return { count, entries: null };
  const rows = await store.queryAll('daily_entries', where, { field: { openid: true, pos: true, completeAt: true, streak: true } });
  return { count, entries: rows.filter((e) => core.SV.isComplete(e)).map((e) => ({ key: e.openid, pos: e.pos, completeAt: e.completeAt, streak: e.streak })) };
}

exports.main = store.handler(async (event, { openid }) => {
  const started = now();
  const v = core.V.getFriendBoard(event);
  if (!v.ok) fail('INVALID_INPUT', 'invalid input');
  const { dateKey } = v.v;
  const nowMs = now();
  if (!core.SV.boardDayOk(dateKey, nowMs)) fail('INVALID_INPUT', 'INVALID_INPUT');
  let set = await daily.ensureSet(dateKey);
  if (!set) fail('DAILY_UNAVAILABLE', 'DAILY_UNAVAILABLE');
  const hists = await daily.loadHists(dateKey);
  if (core.W.dayClosed(dateKey, nowMs)) set = await daily.ensureFinal(set, hists);

  const mineDoc = await store.getDoc('daily_entries', `${dateKey}_${openid}`);
  const viewerDone = core.SV.isComplete(mineDoc);
  const mine = viewerDone ? { key: openid, pos: mineDoc.pos, completeAt: mineDoc.completeAt, streak: mineDoc.streak } : null;
  const listing = await store.cached('friends:' + dateKey, cacheSec(CONFIG.board.cacheSec), () => listDay(dateKey));

  // over the cap the core needs only the caller's row plus the true total (selfOnly keeps just the caller's key)
  const over = listing.entries === null;
  const entries = over ? (mine ? [mine] : []) : listing.entries.filter((e) => e.key !== openid).concat(mine ? [mine] : []);
  const out = core.SV.friendBoardView({ set, hists, entries, total: listing.count, viewerOpenid: openid, viewerDone, hashFn: rowHash, nowMs });
  await store.writeSampled('board_list', { view: 'friend', mode: out.mode, rows: out.rows.length, bytes: JSON.stringify(out).length, ms: now() - started }, CONFIG.caps.boardEventEvery);
  return out;
}, { rate: rateOf('getFriendBoard') });
