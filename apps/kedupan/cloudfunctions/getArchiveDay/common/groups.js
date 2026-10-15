'use strict';
// Group membership and group-day computation (PD-5, PD-6, spec 3.4, 8.4). Server-side only; raw openids
// never leave this module's callers (they hash with the day salt before responding).
const core = require('./coreapi');
const store = require('./store');
const { fail, now, sha256hex, secondsIntoDay, CARDS } = require('./util');

const CACHE_MS = 60 * 1000;
const memberCache = new Map(); // groupRef -> {at, openids}

/** the caller must have a group_members row carrying this groupRef (written only by joinGroup) */
async function requireMember(openid, groupRef) {
  const r = await store.db().collection('group_members').where({ openid, groupRef }).limit(1).get();
  if (!r.data.length) fail('NOT_MEMBER', 'not a member of this group');
}
async function isMember(openid, groupRef) {
  const r = await store.db().collection('group_members').where({ openid, groupRef }).limit(1).get();
  return r.data.length > 0;
}

async function memberOpenids(groupRef, nowMs = now()) {
  const hit = memberCache.get(groupRef);
  if (hit && nowMs - hit.at < CACHE_MS) return hit.openids;
  const rows = await store.queryAll('group_members', { groupRef }, { field: { openid: true }, max: core.cfg().boardListCap });
  const openids = [...new Set(rows.map((r) => r.openid))];
  if (memberCache.size > 200) memberCache.clear();
  memberCache.set(groupRef, { at: nowMs, openids });
  return openids;
}
function clearCache() { memberCache.clear(); }

/** daily_entries of dateKey for the given openids (chunked point lookups by deterministic _id) */
async function loadEntries(dateKey, openids) {
  const _ = store._();
  const out = [];
  for (let i = 0; i < openids.length; i += 100) {
    const ids = openids.slice(i, i + 100).map((o) => `${dateKey}_${o}`);
    const r = await store.db().collection('daily_entries').where({ _id: _.in(ids) }).limit(100).get();
    out.push(...r.data);
  }
  return out;
}

const hashOf = (openid, salt) => sha256hex(`${openid}|${salt}`).slice(0, 12);

/**
 * Group numbers for one day from COMPLETE entries only.
 * -> {n, mq, members:[{openid, gs, entry}]} with gs/mq per core.groupScores.
 */
function computeGroup(completeEntries) {
  const members = completeEntries.slice().sort((a, b) => (a.completeAt - b.completeAt) || (a._id < b._id ? -1 : 1));
  const { gs, mq } = core.groupScores(members.map((e) => ({ pos: e.pos })));
  return { n: members.length, mq, members: members.map((e, i) => ({ openid: e.openid, gs: gs[i], entry: e })) };
}

/** card with the widest national spread (MAD around R_c), ties -> lower index; null when no data */
function divisiveIdx(stats, refs) {
  let best = null;
  let bestMad = -1;
  for (let c = 0; c < CARDS; c++) {
    const mad = core.madFromHist(stats[c].hist, stats[c].n, refs[c]);
    if (mad !== null && mad > bestMad) { bestMad = mad; best = c; }
  }
  return best;
}

/** the other members' positions for one card, excluding `exceptOpenid` (unnamed, sorted: no id leakage) */
async function othersOnCard(groupRef, dateKey, idx, exceptOpenid) {
  const openids = (await memberOpenids(groupRef)).filter((o) => o !== exceptOpenid);
  const entries = await loadEntries(dateKey, openids);
  const dots = entries.map((e) => e.pos[idx]).filter((p) => p != null).sort((a, b) => a - b);
  return { median: dots.length ? core.medianOfValues(dots) : null, n: dots.length, dots };
}

module.exports = {
  requireMember, isMember, memberOpenids, clearCache, loadEntries, hashOf, computeGroup, divisiveIdx, othersOnCard, secondsIntoDay,
};
