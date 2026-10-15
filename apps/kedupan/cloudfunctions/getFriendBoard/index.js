'use strict';
// getFriendBoard: national-score board over every complete daily of the date, hashed (spec 8.4, PD-21).
// The server does not know the friend graph: the open data domain matches rows by re-hashing KV openids.
// Rows (and refs/positions) are withheld until the caller has completed that day (no peeking).
// Above boardListCap -> mode `selfOnly` (just the caller's own verified row).
const core = require('./common/coreapi');
const store = require('./common/store');
const input = require('./common/input');
const daily = require('./common/daily');
const groups = require('./common/groups');
const { fail, now, addDaysKey, secondsIntoDay } = require('./common/util');

const CACHE_MS = 60 * 1000;
const cache = new Map(); // dateKey -> {at, value}; per function instance

async function loadAll(dateKey, cap, nowMs) {
  const hit = cache.get(dateKey);
  if (hit && nowMs - hit.at < CACHE_MS) return hit.value;
  const total = (await store.db().collection('daily_entries').where({ dateKey, complete: true }).count()).total;
  const value = {
    total,
    rows: total <= cap
      ? await store.queryAll('daily_entries', { dateKey, complete: true }, { field: { openid: true, pos: true, completeAt: true, streak: true }, max: cap + 1 })
      : null,
  };
  if (cache.size > 20) cache.clear();
  cache.set(dateKey, { at: nowMs, value });
  return value;
}

exports.main = store.handler(async (event, { openid }) => {
  const dateKey = input.dateKey(event.dateKey);
  const nowMs = now();
  const today = core.dateKeyAt(nowMs);
  if (dateKey > today || dateKey < addDaysKey(today, -1)) fail('INVALID_INPUT', 'board date out of range');
  await store.rateLimit(openid, 'board', 1, 30);

  const set = await store.getDoc('daily_sets', dateKey);
  if (!set) fail('DAILY_UNAVAILABLE', 'no set for that date');
  const salt = set.boardSalt;
  const self = await store.getDoc('daily_entries', daily.entryId(dateKey, openid));
  const viewerDone = !!(self && self.complete);
  const out = {
    ok: true, dateKey, issueNo: set.issueNo, salt, selfHash: groups.hashOf(openid, salt), viewerDone,
    mode: 'full', refs: null, rows: [],
  };
  if (!viewerDone) return out;

  const cap = core.cfg().boardListCap;
  const all = await loadAll(dateKey, cap, nowMs);
  let raw;
  if (all.rows) {
    out.mode = 'full';
    raw = all.rows.slice();
    if (!raw.some((r) => r.openid === openid)) raw.push(self); // the 60 s cache never hides the caller
  } else {
    out.mode = 'selfOnly';
    raw = [self];
  }
  const { refs } = await daily.currentRefs(set, nowMs);
  out.refs = refs;
  out.rows = raw
    .map((e) => {
      const row = [groups.hashOf(e.openid, salt), daily.scoreEntry(e.pos, refs).total, secondsIntoDay(e.completeAt, dateKey), e.pos.join(',')];
      if (e.streak >= 2) row.push(e.streak);
      return row;
    })
    .sort((a, b) => b[1] - a[1] || a[2] - b[2] || (a[0] < b[0] ? -1 : 1))
    .slice(0, cap);
  await store.writeEvent(openid, 'board_list', { view: 'friend', mode: out.mode, rows: out.rows.length, bytes: JSON.stringify(out.rows).length });
  return out;
});
