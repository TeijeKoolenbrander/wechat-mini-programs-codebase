'use strict';
// getBoard: server-authoritative board rows for a ranked daily (spec 11, 14.2; pattern from apps/dianjiangtai).
// Row: [h, st, n, hi, b, s, k?]   h = sha256(openid|salt)[0..12)  st 1 solved / 2 playing / 3 gave up
//      n steps, hi hints used, b best rank so far, s seconds after 00:00 BJT (finish time, or last guess while playing),
//      k streak when >= 2.
// No openid, no word, no lineup is ever in a row, so there is nothing to spoil and no spoiler lock.
const coreapi = require('./common/coreapi');
const store = require('./common/store');
const input = require('./common/input');
const { fail, now, sha256hex, addDaysKey, bjtDayStartMs } = require('./common/util');

const CACHE_MS = 30 * 1000;
const BOARD_CAP = 3000; // boardListCap (spec 11): above it group boards use members only, friend boards selfOnly
const cache = new Map(); // per function instance, server memory only

function cacheGet(key, nowMs) {
  const c = cache.get(key);
  return c && nowMs - c.at < CACHE_MS ? c.value : null;
}
function cacheSet(key, value, nowMs) {
  if (cache.size > 200) cache.clear();
  cache.set(key, { at: nowMs, value });
}

const FIELDS = { openid: true, status: true, steps: true, hintsUsed: true, adHints: true, best: true, finishedAt: true, lastAt: true, streakAt: true };
const ST = { solved: 1, playing: 2, gaveup: 3 };

async function loadAll(dateKey, nowMs) {
  const k = `all:${dateKey}`;
  const hit = cacheGet(k, nowMs);
  if (hit) return { ...hit, cached: true };
  const where = { puzzleId: 'd' + dateKey, ranked: true };
  const total = (await store.db().collection('plays').where(where).count()).total;
  const value = { total, rows: total <= BOARD_CAP ? await store.queryAll('plays', where, { field: FIELDS, max: BOARD_CAP + 1 }) : null };
  cacheSet(k, value, nowMs);
  return { ...value, cached: false };
}

async function loadGroup(dateKey, groupRef, nowMs) {
  const k = `g:${dateKey}:${groupRef}`;
  const hit = cacheGet(k, nowMs);
  if (hit) return { rows: hit, cached: true };
  const members = await store.queryAll('group_members', { groupRef }, { field: { openid: true }, max: BOARD_CAP });
  const ids = [...new Set(members.map((m) => `d${dateKey}_${m.openid}`))];
  const _ = store._();
  const rows = [];
  for (let i = 0; i < ids.length && rows.length < BOARD_CAP; i += 50) {
    const r = await store.db().collection('plays').where({ _id: _.in(ids.slice(i, i + 50)), ranked: true }).field(FIELDS).limit(50).get();
    rows.push(...r.data);
  }
  cacheSet(k, rows, nowMs);
  return { rows, cached: false };
}

exports.main = store.handler(async (event, { openid }) => {
  const kind = event.kind;
  if (kind !== 'group' && kind !== 'friend') fail('INVALID_INPUT', 'bad kind');
  const dateKey = input.dateKey(event.dateKey);
  const nowMs = now();
  const today = coreapi.dateKeyAt(nowMs);
  if (dateKey > today || dateKey < addDaysKey(today, -1)) fail('PUZZLE_NOT_FOUND', 'board date out of range');

  let groupRef = null;
  if (kind === 'group') {
    groupRef = input.groupRef(event.groupRef);
    // membership: the caller must have a group_members row carrying this groupRef
    const m = await store.db().collection('group_members').where({ openid, groupRef }).limit(1).get();
    if (!m.data.length) fail('NOT_MEMBER', 'not a member of this group');
  }

  const day = await store.getDoc('daily_puzzles', dateKey);
  if (!day) fail('PUZZLE_NOT_FOUND', 'no puzzle for date');
  const salt = day.boardSalt;
  const hashOf = (id) => sha256hex(`${id}|${salt}`).slice(0, 12);

  const self = await store.getDoc('plays', `d${dateKey}_${openid}`);
  const selfRow = self && self.ranked ? self : null;

  const all = await loadAll(dateKey, nowMs);
  let mode;
  let raw;
  let cached = all.cached;
  if (all.total <= BOARD_CAP) {
    mode = 'full';
    raw = all.rows.slice();
  } else if (kind === 'group') {
    mode = 'group';
    const g = await loadGroup(dateKey, groupRef, nowMs);
    raw = g.rows.slice();
    cached = g.cached;
  } else {
    mode = 'selfOnly';
    raw = [];
  }
  // the cache must never hide or stale the caller's own row
  raw = raw.filter((r) => r.openid !== openid);
  if (selfRow) raw.push(selfRow);

  const dayStart = bjtDayStartMs(dateKey);
  const secs = (ms) => Math.max(0, Math.floor(((ms || 0) - dayStart) / 1000));
  const rows = raw
    .map((p) => {
      const st = ST[p.status] || 2;
      const row = [
        hashOf(p.openid), st, p.steps, (p.hintsUsed || []).length + (p.adHints || 0),
        p.best == null ? 0 : p.best, secs(st === 2 ? p.lastAt : p.finishedAt),
      ];
      if (st === 1 && p.streakAt >= 2) row.push(p.streakAt);
      return row;
    })
    .sort((a, b) => {
      if (a[1] !== b[1]) return a[1] === 1 ? -1 : b[1] === 1 ? 1 : a[1] - b[1]; // solved, playing, gave up
      if (a[1] === 1) return a[2] - b[2] || a[3] - b[3] || a[5] - b[5] || (a[0] < b[0] ? -1 : 1);
      return a[4] - b[4] || (a[0] < b[0] ? -1 : 1);
    })
    .slice(0, BOARD_CAP);

  const out = { ok: true, dateKey, issueNo: day.issueNo, salt, selfHash: hashOf(openid), mode, rows };
  await store.writeEvent(openid, 'board_list', { dateKey, kind, mode, rows: rows.length, bytes: JSON.stringify(rows).length, cached });
  return out;
});
