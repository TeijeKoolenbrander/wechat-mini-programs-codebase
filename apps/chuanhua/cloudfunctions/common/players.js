'use strict';
// players/<openid>: allowances, strikes, restrictions, streak. All pure transitions come from core/allowance.js and
// core/strikes.js; this module only loads and stores. Every mutation is a transaction (get, transform, set), so
// counters never lose updates.
const allowance = require('../core/allowance');
const strikes = require('../core/strikes');
const { beijingDateKey } = require('../core/date');
const store = require('./store');
const { now } = require('./util');

const dateKey = () => beijingDateKey(now());

/** a doc without _id, as set()/update() require */
function body(doc) {
  const d = Object.assign({}, doc);
  delete d._id;
  return d;
}
/** transactional set of a whole document under a known id */
async function putT(t, name, id, doc) {
  await store.collT(t, name).doc(id).set({ data: body(doc) });
}

/** the player as of today (new players are in memory only until their first write) */
async function read(openid) {
  const doc = await store.getDoc('players', openid);
  return allowance.rollDay(doc || allowance.newPlayer(openid, now()), dateKey());
}

/** read + make sure the doc exists and lastActiveAt is fresh (<= 1 h old); used by calls that do not otherwise write */
async function touch(openid) {
  const doc = await store.getDoc('players', openid);
  const t = now();
  if (!doc) {
    const fresh = allowance.rollDay(allowance.newPlayer(openid, t), dateKey());
    await store.addIfAbsent('players', fresh);
    return fresh;
  }
  if (!(doc.lastActiveAt > t - 3600e3)) {
    try {
      await store.coll('players').doc(openid).update({ data: { lastActiveAt: t } });
    } catch (e) {
      console.warn('touch failed', store.errText(e));
    }
  }
  return allowance.rollDay(doc, dateKey());
}

async function getT(t, openid) {
  const doc = await store.getDocT(t, 'players', openid);
  return allowance.rollDay(doc || allowance.newPlayer(openid, now()), dateKey());
}
async function putPlayerT(t, p) {
  p.lastActiveAt = now();
  await putT(t, 'players', p._id, p);
}

/**
 * Transform a player in a transaction. fn(player) returns the NEW player, or {player, result}. The function may run
 * more than once (conflict retry) and must be pure.
 */
async function mutate(openid, fn) {
  return store.txn(async (t) => {
    const p = await getT(t, openid);
    const r = fn(p);
    const next = r && r.player ? r.player : r;
    await putPlayerT(t, next);
    return r && r.player ? r.result : undefined;
  });
}

/** add a strike inside an open transaction; returns strikes.applyStrike's result */
async function strikeT(t, openid, stepId, src) {
  const p = await getT(t, openid);
  const r = strikes.applyStrike(p, { stepId: stepId || null, src }, now());
  await putPlayerT(t, r.player);
  return r;
}
/** add a strike (own transaction) and record the analytics events */
async function strike(openid, stepId, src) {
  const r = await store.txn((t) => strikeT(t, openid, stepId, src));
  await store.writeEvent(openid, 'strike', { src, level: r.count });
  if (r.restrictMs > 0) await store.writeEvent(openid, 'restrict', { src, level: r.count });
  return r;
}

module.exports = { dateKey, body, putT, read, touch, getT, putPlayerT, mutate, strikeT, strike };
