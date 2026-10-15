'use strict';
// getBoard: server-authoritative leaderboard rows (spec 8, C3). Rows are [h, n, s, k?] with
// h = sha256(openid|boardSalt)[0..12); raw openids/openGIds never leave the server (AC 62).
// n = server 连对, s = run end time in seconds after 00:00 BJT, k = day streak when >= 2.
// Rows carry no answers and no facts (nothing to spoil). groupRef is accepted only from a member.
const core = require('./common/coreapi');
const store = require('./common/store');
const input = require('./common/input');
const daily = require('./common/daily');
const { fail, now, sha256hex, addDaysKey } = require('./common/util');

const CACHE_MS = 60 * 1000;
const cache = new Map(); // key -> {at, value}; per function instance, server memory only

function cacheGet(key, nowMs) {
  const c = cache.get(key);
  return c && nowMs - c.at < CACHE_MS ? c.value : null;
}
function cacheSet(key, value, nowMs) {
  if (cache.size > 200) cache.clear();
  cache.set(key, { at: nowMs, value });
}

const FIELDS = { openid: true, n: true, endS: true, dayStreak: true };

/** all of the date's results (only returned when total <= cap) */
async function loadAll(dateKey, nowMs) {
  const k = `all:${dateKey}`;
  const hit = cacheGet(k, nowMs);
  if (hit) return { ...hit, cached: true };
  const cap = core.boardListCap();
  const total = (await store.db().collection('daily_results').where({ dateKey }).count()).total;
  const value = { total, rows: total <= cap ? await store.queryAll('daily_results', { dateKey }, { field: FIELDS, max: cap + 1 }) : null };
  cacheSet(k, value, nowMs);
  return { ...value, cached: false };
}

/** results of a group's members (group mode, over the cap) */
async function loadGroup(dateKey, groupRef, nowMs) {
  const k = `g:${dateKey}:${groupRef}`;
  const hit = cacheGet(k, nowMs);
  if (hit) return { rows: hit, cached: true };
  const cap = core.boardListCap();
  const members = await store.queryAll('group_members', { groupRef }, { field: { openid: true }, max: cap });
  const ids = [...new Set(members.map((m) => `${dateKey}_${m.openid}`))];
  const _ = store._();
  const rows = [];
  for (let i = 0; i < ids.length && rows.length < cap; i += 50) {
    const r = await store.db().collection('daily_results').where({ _id: _.in(ids.slice(i, i + 50)) }).field(FIELDS).limit(50).get();
    rows.push(...r.data);
  }
  cacheSet(k, rows, nowMs);
  return { rows, cached: false };
}

exports.main = store.handler(async (event, { openid }) => {
  const kind = event.kind;
  if (kind !== 'group' && kind !== 'friend') fail('INVALID_ACTIONS', 'bad kind');
  const dateKey = input.optDateKey(event.dateKey);
  if (!dateKey) fail('INVALID_ACTIONS', 'dateKey required');
  const nowMs = now();
  const today = core.dateKeyAt(nowMs);
  if (dateKey > today || dateKey < addDaysKey(today, -1)) fail('INVALID_ACTIONS', 'board date out of range');

  let groupRef = null;
  if (kind === 'group') {
    groupRef = input.groupRef(event.groupRef);
    // membership: the caller must have a group_members row carrying this groupRef
    const m = await store.db().collection('group_members').where({ openid, groupRef }).limit(1).get();
    if (!m.data.length) fail('NOT_MEMBER', 'not a member of this group');
  }

  const deck = await daily.getDeck(dateKey);
  if (!deck) fail('DECK_NOT_FOUND', 'no deck for date');
  const salt = deck.boardSalt;
  const hashOf = (id) => sha256hex(`${id}|${salt}`).slice(0, 12);

  const self = await store.getDoc('daily_results', `${dateKey}_${openid}`);
  const all = await loadAll(dateKey, nowMs);
  let mode;
  let raw;
  let cached = all.cached;
  if (all.total <= core.boardListCap()) {
    mode = 'full';
    raw = all.rows.slice();
    if (self && !raw.some((r) => r.openid === openid)) raw.push(self); // 60 s cache must never hide the caller
  } else if (kind === 'group') {
    mode = 'group';
    const g = await loadGroup(dateKey, groupRef, nowMs);
    raw = g.rows.slice();
    cached = g.cached;
    if (self && !raw.some((r) => r.openid === openid)) raw.push(self);
  } else {
    mode = 'selfOnly';
    raw = self ? [self] : [];
  }

  // ranking is the client's job from these rows: n desc, equal n share a rank (PO-15), earlier s first inside a tie
  const rows = raw
    .map((r) => {
      const row = [hashOf(r.openid), r.n, r.endS];
      if (r.dayStreak >= 2) row.push(r.dayStreak);
      return row;
    })
    .sort((a, b) => b[1] - a[1] || a[2] - b[2] || (a[0] < b[0] ? -1 : 1))
    .slice(0, core.boardListCap());

  const out = {
    ok: true, dateKey, issueNo: deck.issueNo, theme: deck.theme, themeLabel: deck.themeLabel, contentVersion: deck.contentVersion,
    salt, selfHash: hashOf(openid), mode, rows,
  };
  await store.writeEvent(openid, 'board_list', {
    dateKey, kind, mode, rows: rows.length, bytes: JSON.stringify(rows).length, cached,
  });
  return out;
});
