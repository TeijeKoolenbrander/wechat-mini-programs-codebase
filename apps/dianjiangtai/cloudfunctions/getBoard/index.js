'use strict';
// getBoard: server-authoritative leaderboard rows (spec §11.4, §11.5, C3).
// Rows are [h, w, s, x?] with h = sha256(openid|salt)[0..12); raw openids never leave the server.
// Lineups (x) only for a caller with a ranked result for the date. groupRef only for members.
const core = require('./common/coreapi');
const store = require('./common/store');
const limits = require('./common/limits');
const input = require('./common/input');
const { fail, now, sha256hex, addDaysKey, bjtDayStartMs } = require('./common/util');

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

const FIELDS = { openid: true, w: true, submittedAt: true, lineupIdx: true, streak: true };

/** all of the date's results (only called when total <= cap) */
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

  const seedDoc = await store.getDoc('daily_seeds', dateKey);
  if (!seedDoc) fail('SEED_NOT_FOUND', 'no seed for date');
  const salt = seedDoc.boardSalt;
  const hashOf = (id) => sha256hex(`${id}|${salt}`).slice(0, 12);

  const self = await store.getDoc('daily_results', `${dateKey}_${openid}`);
  const viewerPlayed = !!self;

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

  const dayStart = bjtDayStartMs(dateKey);
  const rows = raw
    .map((r) => {
      const row = [hashOf(r.openid), r.w, Math.max(0, Math.floor((r.submittedAt - dayStart) / 1000))];
      row.push(viewerPlayed && Array.isArray(r.lineupIdx) ? r.lineupIdx.join(',') : null);
      if (Number.isInteger(r.streak) && r.streak >= 2) row.push(r.streak); // k: only when >= 2
      else if (row[3] === null) row.pop(); // keep [h, w, s] when there is nothing to send
      return row;
    })
    .sort((a, b) => b[1] - a[1] || a[2] - b[2] || (a[0] < b[0] ? -1 : 1))
    .slice(0, core.boardListCap());

  const out = {
    ok: true, dateKey, issueNo: seedDoc.issueNo, contentVersion: seedDoc.contentVersion, salt,
    variant: seedDoc.variant || core.variantFor(dateKey), selfHash: hashOf(openid), mode, viewerPlayed, rows,
  };
  // sampled (M3): one server event per date, kind and mode per minute per instance, not one database write per board response
  await store.writeEventSampled(`board_list:${dateKey}:${kind}:${mode}`, 60 * 1000, 'board_list', {
    dateKey, kind, mode, rows: rows.length, bytes: JSON.stringify(rows).length, cached,
  });
  return out;
}, { rate: limits.rateOf('getBoard') });
