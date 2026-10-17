'use strict';
// Group binding helpers (spec 3.3, 9.2, PO-6). The client only ever sees groupRef = first 16 hex of
// sha256(GROUP_REF_PEPPER + openGId); the openGId never leaves the server.
const { CONFIG, ugcCreateAllowed } = require('../core/config');
const strikes = require('../core/strikes');
const store = require('./store');
const { sha256hex, now } = require('./util');
const { bad } = require('./errors');

const MIN_PEPPER_LEN = 32; // L5: a short salt makes groupRef guessable offline from a known openGId
function pepper() {
  const p = process.env.GROUP_REF_PEPPER;
  if (typeof p !== 'string' || !p) bad('SERVER_CONFIG');
  if (p.length < MIN_PEPPER_LEN) {
    console.error('[ALERT] GROUP_REF_PEPPER is shorter than ' + MIN_PEPPER_LEN + ' characters: refusing (SERVER_CONFIG)');
    bad('SERVER_CONFIG');
  }
  return p;
}
function refFor(openGId) {
  return sha256hex(pepper() + openGId).slice(0, 16);
}

const REF_RE = /^[0-9a-f]{16}$/;
const fresh = (m) => !!m && now() - m.lastSeen <= CONFIG.chain.membershipFreshMs;

/** the openGId of this call's group context, only if the caller has a fresh membership row for it; else null */
async function groupContext(openid, groupRef) {
  if (typeof groupRef !== 'string' || !REF_RE.test(groupRef)) return null;
  const r = await store.coll('group_members').where({ openid, groupRef }).limit(10).get();
  const m = (r.data || []).find(fresh);
  return m ? m.openGId : null;
}
async function isMember(openid, openGId) {
  if (!openGId) return false;
  return fresh(await store.getDoc('group_members', openGId + '_' + openid));
}

/** the context object core/chain.js#canClaim and core/views.js#entryView expect */
async function claimCtx(chain, openid, groupRef, player, cfg, opts) {
  opts = opts || {};
  const r = strikes.restrictionOf(player, now());
  const [groupOpenGId, memberOfChainGroup] = await Promise.all([groupContext(openid, groupRef), isMember(openid, chain.openGId)]);
  return {
    openid,
    now: now(),
    rulesOk: player.rulesVersion >= CONFIG.rulesVersion,
    restrictedUntil: r ? r.until : 0,
    ugcOk: ugcCreateAllowed(cfg.ugc, now()).ok,
    inRoom: !!opts.inRoom,
    groupOpenGId,
    memberOfChainGroup,
    stepsToday: player.day.steps,
    claimsOnChainToday: player.day.claims[chain._id] || 0,
  };
}

module.exports = { refFor, groupContext, isMember, claimCtx, fresh };
