'use strict';
// Database, identity and handler helpers shared by every function.
// Identity: cloud.getWXContext() is called HERE and nowhere else (a test enforces this).
const cloud = require('wx-server-sdk');
const { AppError, fail, now } = require('./util');

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
function sdk() {
  init();
  return cloud;
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
/** transaction write conflict / lost race on the real DB */
function isConflict(e) {
  return /conflict|aborted|transaction.*(fail|abort)|rollback/i.test(errText(e));
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
/** whole-document write inside (or outside) a transaction; _id lives in the path, never in data */
async function putT(t, col, doc) {
  const { _id, ...data } = doc;
  await t.collection(col).doc(_id).set({ data });
}
async function put(col, doc) {
  const { _id, ...data } = doc;
  await db().collection(col).doc(_id).set({ data });
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

/** Page through a query (cloud functions return <= 100 by default, <= 1000 max per call). */
async function queryAll(col, where, { field, max = 100000 } = {}) {
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

/** Run a transaction; on a platform write-conflict retry once (the retry re-reads fresh state). */
async function txn(fn) {
  try {
    return await db().runTransaction(fn);
  } catch (e) {
    if (e instanceof AppError || !isConflict(e)) throw e;
    return db().runTransaction(fn);
  }
}

function alert(msg, extra) {
  console.error('[ALERT]', msg, extra === undefined ? '' : JSON.stringify(extra));
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

/** Per-openid fixed-window (1 minute) limiter. Throws RATE_LIMITED. */
async function rateLimit(openid, bucket, cost, limitPerMin) {
  const minute = Math.floor(now() / 60000);
  const id = `${bucket}_${openid}_${minute}`;
  await db().runTransaction(async (t) => {
    const cur = await getDocT(t, 'rate_limits', id);
    const count = cur ? cur.count : 0;
    if (count + cost > limitPerMin) throw new AppError('RATE_LIMITED', 'rate limited');
    await t.collection('rate_limits').doc(id).set({ data: { bucket, openid, count: count + cost, expireAt: now() + 3600e3 } });
  });
}

/**
 * Wrap a handler: identity comes ONLY from the trusted context OPENID.
 * auth:false for timers/admin/push; serverOnly:true additionally rejects any call that carries an
 * OPENID (a client-originated call). The context object is passed to the handler as `ctx.wx` for
 * the few server-side functions that need SOURCE (never for identity decisions on clients).
 */
function handler(fn, { auth = true, serverOnly = false } = {}) {
  return async (event) => {
    const startedAt = now();
    try {
      init();
      const wx = cloud.getWXContext() || {};
      const openid = wx.OPENID || null;
      if (auth && !openid) fail('UNAUTHENTICATED', 'no openid in context');
      if (serverOnly && openid) fail('FORBIDDEN', 'server-only function');
      return await fn(event && typeof event === 'object' ? event : {}, { openid, startedAt, source: wx.SOURCE || null });
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
  cloud, sdk, db, _, isDup, isNotFound, isConflict, getDoc, getDocT, putT, put, addIfAbsent, queryAll, txn,
  writeEvent, rateLimit, handler, errText, alert,
};
