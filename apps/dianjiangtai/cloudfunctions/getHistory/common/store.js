'use strict';
// Database, identity and handler helpers shared by every function.
const cloud = require('wx-server-sdk');
const { AppError, fail, now, isPlainObject } = require('./util');

/** hard cap of any paged read (queryAll): a runaway collection cannot exhaust memory or the function timeout */
const MAX_QUERY_ROWS = 20000;

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

function unwrapDoc(r) {
  if (!r) return null;
  const d = r.data;
  if (Array.isArray(d)) return d[0] || null;
  return d || null;
}
async function getDoc(col, id) {
  try {
    return unwrapDoc(await db().collection(col).doc(id).get());
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}
async function getDocT(t, col, id) {
  try {
    return unwrapDoc(await t.collection(col).doc(id).get());
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}
/** add with a fixed _id; returns false if it already existed */
async function addIfAbsent(col, data) {
  try {
    await db().collection(col).add({ data });
    return true;
  } catch (e) {
    if (isDup(e)) return false;
    throw e;
  }
}

/** Page through a query (cloud functions return <= 100 by default, <= 1000 max per call). Capped at MAX_QUERY_ROWS. */
async function queryAll(col, where, { field, max = MAX_QUERY_ROWS } = {}) {
  const PAGE = 1000;
  const out = [];
  for (let skip = 0; out.length < max; skip += PAGE) {
    let q = db().collection(col).where(where).orderBy('_id', 'asc').skip(skip).limit(PAGE);
    if (field) q = q.field(field);
    const r = await q.get();
    out.push(...r.data);
    if (r.data.length < PAGE) break;
  }
  return out.slice(0, max);
}

/** Analytics must never break a game function. */
async function writeEvent(openid, name, props, sessionId) {
  try {
    await db().collection('events').add({
      data: { openid: openid || 'server', sessionId: sessionId || null, name, props: props || {}, ts: now(), clientTs: null },
    });
  } catch (e) {
    console.warn('writeEvent failed', name, errText(e));
  }
}

const sampled = new Map(); // key -> last write ms (per function instance)
/**
 * Server-side analytics event for a per-CALL code path (board_list ...): at most one per `key` per `everyMs` per
 * instance, so a hot function cannot turn every request into a database write. Never throws.
 */
async function writeEventSampled(key, everyMs, name, props) {
  const t = now();
  const last = sampled.get(key);
  if (last !== undefined && t - last < everyMs) return false;
  if (sampled.size > 500) sampled.clear();
  sampled.set(key, t);
  await writeEvent('server', name, props);
  return true;
}

/** a transaction that lost a write conflict (the real database aborts the loser; callers under a burst see this) */
function isConflict(e) {
  return /conflict|aborted|retry/i.test(errText(e));
}

/**
 * Per-openid fixed-window (1 minute) limiter. Transactional get+set on one deterministic doc.
 * Throws RATE_LIMITED. `cost` = units consumed by this call. A transaction that keeps conflicting means a burst on this
 * very counter, which is also a rate-limit verdict (fail closed), never an INTERNAL error.
 */
async function rateLimit(openid, bucket, cost, limitPerMin) {
  const minute = Math.floor(now() / 60000);
  const id = `${bucket}_${openid}_${minute}`;
  try {
    await db().runTransaction(async (t) => {
      const cur = await getDocT(t, 'rate_limits', id);
      const count = cur ? cur.count : 0;
      if (count + cost > limitPerMin) throw new AppError('RATE_LIMITED', 'rate limited');
      await t.collection('rate_limits').doc(id).set({ data: { bucket, openid, count: count + cost, expireAt: now() + 3600e3 } });
    });
  } catch (e) {
    if (!(e instanceof AppError) && isConflict(e)) throw new AppError('RATE_LIMITED', 'rate limited (contended)');
    throw e;
  }
}

/** a timer trigger delivers {Type:'Timer', TriggerName, Time, Message}; a client call carries an OPENID and is refused first */
function isTimerEvent(event) {
  return isPlainObject(event) && event.Type === 'Timer' && typeof event.TriggerName === 'string' && event.TriggerName.length > 0 && event.TriggerName.length <= 128;
}

/**
 * Wrap a handler: identity comes ONLY from the trusted context OPENID.
 *  auth:false      timer functions (no OPENID expected)
 *  serverOnly:true the call must have NO OPENID (a client call carries one) AND carry the timer marker
 *                  (event.Type === 'Timer' with a TriggerName). A console test invocation must send it explicitly (README).
 *  rate:{bucket, limit, cost?}  per-openid fixed-window limit (common/limits.js), checked FIRST, before any read in the function
 */
function handler(fn, { auth = true, serverOnly = false, rate = null } = {}) {
  return async (event) => {
    const startedAt = now();
    try {
      init();
      const wx = cloud.getWXContext() || {};
      const openid = wx.OPENID || null;
      if (auth && !openid) fail('UNAUTHENTICATED', 'no openid in context');
      if (serverOnly && (openid || !isTimerEvent(event))) fail('FORBIDDEN', 'server-only function');
      if (rate && openid) {
        const cost = typeof rate.cost === 'function' ? rate.cost(event) : rate.cost || 1;
        await rateLimit(openid, rate.bucket, cost, rate.limit);
      }
      return await fn(event && typeof event === 'object' ? event : {}, { openid, startedAt });
    } catch (e) {
      if (e instanceof AppError || (e && e.code && e.extra !== undefined)) {
        return { ok: false, code: e.code, message: e.message, ...(e.extra || {}) };
      }
      console.error('unhandled', errText(e), e && e.stack);
      return { ok: false, code: 'INTERNAL', message: 'internal error' };
    }
  };
}

module.exports = {
  cloud, db, _, isDup, isNotFound, getDoc, getDocT, addIfAbsent, queryAll,
  writeEvent, writeEventSampled, rateLimit, handler, isTimerEvent, errText, MAX_QUERY_ROWS,
};
