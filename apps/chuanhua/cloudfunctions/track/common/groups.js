'use strict';
// Group membership lookups (group_members is written only by joinGroup).
const store = require('./store');
const { LIMITS } = require('./config');
const { daysBetween } = require('./util');

function fresh(row, dateKey) {
  return !!row && daysBetween(row.lastSeen, dateKey) <= LIMITS.groupFreshDays;
}

/** Does `openid` have a fresh membership row for `openGId`? */
async function isFreshMember(openid, openGId, dateKey) {
  if (!openGId) return false;
  const row = await store.getDoc('group_members', `${openGId}_${openid}`);
  return fresh(row, dateKey);
}

/** Resolve the caller's group context from an opaque groupRef: the openGId, only if they are a fresh member. */
async function resolveGroupRef(openid, groupRef, dateKey) {
  if (!groupRef) return null;
  const r = await store.db().collection('group_members').where({ groupRef, openid }).limit(5).get();
  const row = r.data.find((x) => fresh(x, dateKey));
  return row ? row.openGId : null;
}

module.exports = { isFreshMember, resolveGroupRef, fresh };
