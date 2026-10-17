'use strict';
// player_stats/<openid>, the UGC half (spec 11.1, 11.8): the 发言规则 agreement, strikes, restriction, warning, the
// per-day check counter. Created on first need; streak fields are zeroed so the streak code reads it like any other.
// All pure transitions come from core/ugc.js and core/strikes.js; this module only loads and stores. Every mutation is a
// transaction (get, transform, set), so counters never lose updates. submitCard UPDATES the streak fields of the same
// document (never replaces it), so the two halves never overwrite each other.
const { core } = require('./coreapi');
const store = require('./store');
const { now } = require('./util');

/** a doc without _id, as set()/update() require */
function body(doc) {
  const d = Object.assign({}, doc);
  delete d._id;
  return d;
}

async function read(openid) {
  return store.getDoc('player_stats', openid);
}

/**
 * Transform a player in a transaction. fn(player) returns the NEW player, or {player, result}. The function may run more
 * than once (conflict retry) and must be pure.
 */
async function mutate(openid, fn) {
  let out;
  await store.db().runTransaction(async (t) => {
    const cur = (await store.getDocT(t, 'player_stats', openid)) || core.U.newPlayerStats(openid, now());
    const r = fn(cur);
    const next = r && r.player ? r.player : r;
    await store.collT(t, 'player_stats').doc(openid).set({ data: body(next) });
    out = r && r.player ? r.result : undefined;
  });
  return out;
}

/** add a strike inside an open transaction (reads and writes player_stats); returns core/strikes.applyStrike's result */
async function strikeT(t, openid) {
  const cur = (await store.getDocT(t, 'player_stats', openid)) || core.U.newPlayerStats(openid, now());
  const r = core.STK.applyStrike(cur, now());
  await store.collT(t, 'player_stats').doc(openid).set({ data: body(r.player) });
  return r;
}

/** add a strike (own transaction) and write the server events strike / restrict (cause: 'risky' | 'upheld'; no openid in the props) */
async function strike(openid, cause) {
  let r;
  await store.db().runTransaction(async (t) => {
    r = await strikeT(t, openid);
  });
  await emitStrike(cause, r);
  return r;
}

async function emitStrike(cause, r) {
  await store.writeEvent('server', 'strike', { cause, strikes30d: r.count });
  if (r.restrictMs > 0) await store.writeEvent('server', 'restrict', { cause, strikes30d: r.count, days: Math.round(r.restrictMs / 86400e3) });
}

module.exports = { body, read, mutate, strikeT, strike, emitStrike };
