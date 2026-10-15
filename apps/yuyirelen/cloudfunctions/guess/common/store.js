'use strict';
// Database, identity and handler helpers shared by every function.
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

/**
 * Per-openid fixed-window (1 minute) limiter. Transactional get+set on one deterministic doc.
 * Throws RATE_LIMITED. `cost` = units consumed by this call.
 */
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
 * auth:false for timer functions; serverOnly:true additionally rejects any call that carries an
 * OPENID (i.e. a client-originated call), so timers cannot be triggered from the mini game.
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
      return await fn(event && typeof event === 'object' ? event : {}, { openid, startedAt });
    } catch (e) {
      if (e instanceof AppError || (e && e.code && e.extra !== undefined)) {
        return { ok: false, code: e.code, message: e.message, msg: e.message, ...(e.extra || {}) };
      }
      console.error('unhandled', errText(e), e && e.stack);
      return { ok: false, code: 'INTERNAL', message: 'internal error', msg: 'internal error' };
    }
  };
}

module.exports = {
  cloud, db, _, isDup, isNotFound, getDoc, getDocT, addIfAbsent, queryAll,
  writeEvent, rateLimit, handler, errText,
};
