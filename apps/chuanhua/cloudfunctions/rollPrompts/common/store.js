'use strict';
// Database, identity and handler helpers shared by every function (copied from apps/dianjiangtai, adapted: every
// collection name passed in here is LOGICAL ('chains'); the physical name gets the `chuanhua_` prefix in one place).
const cloud = require('wx-server-sdk');
const { AppError, now, col, sleep } = require('./util');
const { bad } = require('./errors');
const { textFor } = require('../core/codes');

let inited = false;
function init() {
  if (!inited) {
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    inited = true;
  }
}
function db() {
  init();
  return cloud.database();
}
function _() {
  return db().command;
}
/** collection by logical name */
function coll(name) {
  return db().collection(col(name));
}
/** collection inside a transaction */
function collT(t, name) {
  return t.collection(col(name));
}

function errText(e) {
  return `${e && e.errCode !== undefined ? e.errCode : ''} ${(e && (e.errMsg || e.message)) || ''}`;
}
/** duplicate _id on add */
function isDup(e) {
  return /duplicate|already exist|-502001|E11000|unique/i.test(errText(e));
}
function isNotFound(e) {
  return /not exist|not found|-502002|does not exist/i.test(errText(e));
}
/** a transaction lost a write conflict (another writer committed first) */
function isConflict(e) {
  return /conflict|-503000|transaction.*(abort|fail)|tx.*lock/i.test(errText(e));
}

function unwrapDoc(r) {
  if (!r) return null;
  const d = r.data;
  if (Array.isArray(d)) return d[0] || null;
  return d || null;
}
async function getDoc(name, id) {
  try {
    return unwrapDoc(await coll(name).doc(id).get());
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}
async function getDocT(t, name, id) {
  try {
    return unwrapDoc(await collT(t, name).doc(id).get());
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}
/** add with a fixed _id; returns false if it already existed */
async function addIfAbsent(name, data) {
  try {
    await coll(name).add({ data });
    return true;
  } catch (e) {
    if (isDup(e)) return false;
    throw e;
  }
}

/** attempts of one transaction under write contention (QA-R2-2): ten seats can write one room document at the same second */
const TXN_ATTEMPTS = 24;
const TXN_BACKOFF_CAP_MS = 200;
/** full-jitter exponential backoff: random 0..min(cap, 10 ms * 2^i) */
function backoffMs(i, rnd) {
  return Math.floor((rnd === undefined ? Math.random() : rnd) * Math.min(TXN_BACKOFF_CAP_MS, 10 * Math.pow(2, i)));
}

/**
 * Run `fn(t)` in a database transaction. The callback may run more than once (write conflicts are retried here with
 * exponential backoff and full jitter), so it must only read and write through `t` and must not have other side effects. A callback
 * that throws aborts the transaction (nothing is written) and the error propagates unchanged. When every attempt lost a write conflict the
 * call fails with the RETRYABLE code BUSY_RETRY (never INTERNAL): nothing was written, the client simply tries again.
 */
async function txn(fn, { attempts = TXN_ATTEMPTS } = {}) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await db().runTransaction(fn, 1);
    } catch (e) {
      if (!isConflict(e)) throw e;
      if (i === attempts - 1) {
        console.warn('txn exhausted', errText(e));
        throw new AppError('BUSY_RETRY', textFor('BUSY_RETRY'));
      }
      await sleep(backoffMs(i));
    }
  }
  throw new AppError('BUSY_RETRY', textFor('BUSY_RETRY'));
}

/** Page through a query (cloud functions return <= 100 by default, <= 1000 max per call). */
async function queryAll(name, where, { field, max = 100000, orderBy = '_id' } = {}) {
  const PAGE = 1000;
  const out = [];
  for (let skip = 0; out.length < max; skip += PAGE) {
    let q = coll(name).where(where).orderBy(orderBy, 'asc').skip(skip).limit(PAGE);
    if (field) q = q.field(field);
    const r = await q.get();
    out.push(...r.data);
    if (r.data.length < PAGE) break;
  }
  return out.slice(0, max);
}

/** atomic counter bump on a deterministic doc, created on first use. `fields` = {path: delta}. */
async function bump(name, id, fields, base, setFields) {
  const _c = _();
  const data = Object.assign({}, setFields || {});
  for (const k of Object.keys(fields)) data[k] = _c.inc(fields[k]);
  const r = await coll(name).doc(id).update({ data });
  if (r && r.stats && r.stats.updated === 0) {
    await addIfAbsent(name, Object.assign({ _id: id }, base || {}));
    await coll(name).doc(id).update({ data });
  }
}

/** Analytics must never break a game function. */
async function writeEvent(openid, name, props, sessionId, clientTs) {
  try {
    await coll('events').add({
      data: { openid: openid || 'server', sessionId: sessionId || null, name, props: props || {}, ts: now(), clientTs: clientTs === undefined ? null : clientTs },
    });
  } catch (e) {
    console.warn('writeEvent failed', name, errText(e));
  }
}

/**
 * Per-openid fixed-window (1 minute) limiter. Transactional get+set on one deterministic doc.
 * Throws RATE_LIMITED. `cost` = units consumed by this call.
 */
async function rateLimit(openid, bucket, cost, limitPerMin) {
  const minute = Math.floor(now() / 60000);
  const id = `${bucket}_${openid}_${minute}`;
  await txn(async (t) => {
    const cur = await getDocT(t, 'rate_limits', id);
    const count = cur ? cur.count : 0;
    if (count + cost > limitPerMin) throw new AppError('RATE_LIMITED', 'rate limited');
    await collT(t, 'rate_limits').doc(id).set({ data: { bucket, openid, count: count + cost, expireAt: now() + 3600e3 } });
  });
}

/**
 * Wrap a handler: identity comes ONLY from the trusted context OPENID.
 * auth:false for timer/push/console functions; serverOnly:true additionally rejects any call that carries an
 * OPENID (i.e. a client-originated call), so timers and the push handler cannot be triggered from the mini game.
 * `gate(openid)` (optional) may throw AppError to reject a call that carries an OPENID (admin allow-list).
 */
function handler(fn, { auth = true, serverOnly = false, timer = false, gate = null } = {}) {
  return async (event) => {
    const startedAt = now();
    try {
      init();
      const wx = cloud.getWXContext() || {};
      const openid = wx.OPENID || null;
      if (auth && !openid) bad('UNAUTHENTICATED');
      if (serverOnly && openid) bad('FORBIDDEN');
      // L3: a timer function runs only for the platform's timer trigger event ({Type:'Timer', TriggerName, Time}); a console test
      // invocation must send {"Type":"Timer"}. Anything else (another function's callFunction, a stray HTTP route) is refused.
      if (timer && !(event && typeof event === 'object' && event.Type === 'Timer')) bad('FORBIDDEN');
      if (gate) gate(openid);
      return await fn(event && typeof event === 'object' && !Array.isArray(event) ? event : {}, { openid, startedAt });
    } catch (e) {
      if (e instanceof AppError || (e && e.code && e.extra !== undefined)) {
        return { ok: false, code: e.code, message: e.message, ...(e.extra || {}) };
      }
      console.error('unhandled', errText(e), e && e.stack);
      return { ok: false, code: 'INTERNAL', message: textFor('INTERNAL') };
    }
  };
}

module.exports = {
  cloud, db, _, coll, collT, isDup, isNotFound, isConflict, getDoc, getDocT, addIfAbsent, txn, queryAll, bump,
  writeEvent, rateLimit, handler, errText,
};
