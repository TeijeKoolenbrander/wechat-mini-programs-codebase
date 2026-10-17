'use strict';
// Group plumbing: membership, member lists (60 s per-instance cache), members' entries, appconfig.
const store = require('./store');
const { core, CONFIG } = require('./coreapi');
const { chunk, cacheSec } = require('./util');

const MEMBER_CAP = 1000; // members read per group (WeChat groups hold <= 500 people; TD-31)

/** Fresh: does the caller hold a group_members row with this groupRef? (a forged groupRef never matches) */
async function isMember(openid, groupRef) {
  if (!groupRef) return false;
  const r = await store.coll('group_members').where({ openid, groupRef }).limit(1).get();
  return r.data.length > 0;
}

/** Openids of the group's members (cached 60 s; callers always add themselves, so their own row is fresh). */
async function memberOpenids(groupRef) {
  return store.cached('members:' + groupRef, cacheSec(CONFIG.group.cacheSec), async () => {
    const rows = await store.queryAll('group_members', { groupRef }, { field: { openid: true }, max: MEMBER_CAP });
    return Array.from(new Set(rows.map((r) => r.openid)));
  });
}

/** daily_entries of `openids` for a day: Map(openid -> entry) */
async function entriesFor(openids, dateKey) {
  const ids = openids.map((o) => `${dateKey}_${o}`);
  const docs = await store.getMany('daily_entries', ids);
  const out = new Map();
  openids.forEach((o) => {
    const d = docs.get(`${dateKey}_${o}`);
    if (d) out.set(o, d);
  });
  return out;
}

/** Group blocks (spec 3.4) for the caller's answered cards from the OTHER members' entries. */
async function groupBlocks(openid, groupRef, dateKey, callerEntry) {
  const members = (await memberOpenids(groupRef)).filter((o) => o !== openid);
  const others = Array.from((await entriesFor(members, dateKey)).values());
  return core.SV.groupBlocksFor(others, callerEntry);
}

/** COMPLETE members' entries as board inputs: [{key, pos, completeAt, streak}] (the caller is always included if complete). */
async function completeMembers(openid, groupRef, dateKey) {
  const list = await memberOpenids(groupRef);
  const all = list.indexOf(openid) >= 0 ? list : list.concat([openid]);
  const map = await entriesFor(all, dateKey);
  const out = [];
  map.forEach((e, o) => {
    if (core.SV.isComplete(e)) out.push({ key: o, pos: e.pos, completeAt: e.completeAt, streak: e.streak });
  });
  return out;
}

/** app_config/live (60 s cache; missing = everything optional is off) */
async function appConfig() {
  return store.cached('app_config', cacheSec(60), async () => (await store.getDoc('app_config', 'live')) || null);
}

/**
 * Kill switches and the text API choice (app_config.ugc / .moderation, spec 11.6), cached 10 s so an emergency stop takes
 * effect within seconds. A config that cannot be read FAILS CLOSED (no typed clue is created or shown) and is not cached.
 */
async function ugcFlags() {
  try {
    const doc = await store.cached('app_config_ugc', cacheSec(10), async () => (await store.getDoc('app_config', 'live')) || null);
    return core.U.flags(doc);
  } catch (e) {
    console.warn('[ALERT] app_config unreadable, typed clues are paused', store.errText(e));
    return { createEnabled: false, viewEnabled: false, textApi: 'game' };
  }
}

module.exports = { ugcFlags, MEMBER_CAP, isMember, memberOpenids, entriesFor, groupBlocks, completeMembers, appConfig, chunk };
