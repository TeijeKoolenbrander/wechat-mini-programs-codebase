'use strict';
// Database, identity and handler helpers shared by every function.
// Collection names passed to these helpers are UNPREFIXED ('rounds'); the app prefix (kedupan_) is added here, once.
const cloud = require('wx-server-sdk');
const { AppError, fail, now, col: prefixed } = require('./util');

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
    return unwrapDoc(await db().collection(prefixed(col)).doc(id).get());
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}
async function getDocT(t, col, id) {
  try {
    return unwrapDoc(await t.collection(prefixed(col)).doc(id).get());
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}
/** add with a fixed _id; returns false if it already existed */
async function addIfAbsent(col, data) {
  try {
    await db().collection(prefixed(col)).add({ data });
    return true;
  } catch (e) {
    if (isDup(e)) return false;
    throw e;
  }
}

/** collection handle for an UNPREFIXED name (the only way function code reaches the SDK) */
function coll(name) {
  return db().collection(prefixed(name));
}
/** collection handle inside a transaction */
function collT(t, name) {
  return t.collection(prefixed(name));
}
async function updateDoc(name, id, data) {
  return coll(name).doc(id).update({ data });
}
async function removeDoc(name, id) {
  return coll(name).doc(id).remove();
}
/** documents by _id, chunked 100 per query; returns a Map(_id -> doc) (missing ids absent) */
async function getMany(name, ids) {
  const out = new Map();
  const uniq = Array.from(new Set(ids));
  for (const part of chunkArr(uniq, 100)) {
    const r = await coll(name).where({ _id: _().in(part) }).limit(100).get();
    r.data.forEach((d) => out.set(d._id, d));
  }
  return out;
}
function chunkArr(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** tiny per-instance TTL cache (group member lists, friend lists, app_config). ttlSec 0 disables it. */
const cacheMap = new Map();
async function cached(key, ttlSec, loader) {
  if (!(ttlSec > 0)) return loader();
  const hit = cacheMap.get(key);
  const t = now();
  if (hit && t - hit.at < ttlSec * 1000) return hit.v;
  const v = await loader();
  cacheMap.set(key, { at: t, v });
  if (cacheMap.size > 500) cacheMap.delete(cacheMap.keys().next().value);
  return v;
}
function clearCache() {
  cacheMap.clear();
}

/** Page through a query (cloud functions return <= 100 by default, <= 1000 max per call). */
async function queryAll(col, where, { field, max = 100000 } = {}) {
  const PAGE = 1000;
  const out = [];
  for (let skip = 0; out.length < max; skip += PAGE) {
    let q = db().collection(prefixed(col)).where(where).orderBy('_id', 'asc').skip(skip).limit(PAGE);
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
    await db().collection(prefixed('events')).add({
      data: { openid: openid || 'server', sessionId: sessionId || null, name, props: props || {}, ts: now(), clientTs: null },
    });
  } catch (e) {
    console.warn('writeEvent failed', name, errText(e));
  }
}

/**
 * A server event written for one request in `every` (M3: board_list was one write per board response). The kept event
 * carries `every` so a report multiplies the count back. Env KD_EVENT_SAMPLE_EVERY overrides `every` (tests set 1).
 */
async function writeSampled(name, props, every) {
  const env = process.env.KD_EVENT_SAMPLE_EVERY;
  const n = env !== undefined && env !== '' && Number.isInteger(+env) && +env >= 1 ? +env : every;
  if (n > 1 && Math.random() * n >= 1) return false;
  await writeEvent('server', name, { ...props, every: n });
  return true;
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
    if (count + cost > limitPerMin) throw new AppError('RATE_LIMITED', 'rate limited', { scope: 'minute' });
    await t.collection(prefixed('rate_limits')).doc(id).set({ data: { bucket, openid, count: count + cost, expireAt: now() + 3600e3 } });
  });
}

/**
 * Per-openid per-Beijing-day counter (createRound 20, getBonusCard 3, unlockDistribution, reportCard 10; spec 11.2).
 * Doc `_id: <bucket>_<openid>_<dateKey>` in `rate_limits`; transactional get+set. Throws RATE_LIMITED (or `code`, e.g. REPORT_LIMIT).
 */
async function dayLimit(openid, bucket, limit, dateKey, code) {
  const id = `${bucket}_${openid}_${dateKey}`;
  await db().runTransaction(async (t) => {
    const cur = await getDocT(t, 'rate_limits', id);
    const count = cur ? cur.count : 0;
    if (count + 1 > limit) throw new AppError(code || 'RATE_LIMITED', code || 'rate limited', { scope: 'day' });
    await t.collection(prefixed('rate_limits')).doc(id).set({ data: { bucket, openid, count: count + 1, expireAt: now() + 3 * 86400e3 } });
  });
}

/**
 * Atomic counter bump on a deterministic doc, created on first use (mod_quota/<dateKey>). `fields` = {path: delta};
 * `base` seeds a new document. Never throws: a counter must not break a request (a lost count only loosens a dev budget
 * or an alert).
 */
async function bump(name, id, fields, base) {
  try {
    const inc = {};
    Object.keys(fields).forEach((k) => {
      inc[k] = _().inc(fields[k]);
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      let updated = 0;
      try {
        const r = await coll(name).doc(id).update({ data: inc });
        updated = r && r.stats && r.stats.updated !== undefined ? r.stats.updated : 1;
      } catch (e) {
        if (!isNotFound(e)) throw e;
      }
      if (updated > 0) return true;
      await addIfAbsent(name, { _id: id, ...(base || {}) }); // missing: create it (a concurrent creator is fine), then increment
    }
    return false;
  } catch (e) {
    console.warn('bump failed', name, errText(e));
    return false;
  }
}

/** Does the event carry the platform's timer trigger marker? ({Type:'Timer', TriggerName, Time, Message}) */
function isTimerEvent(event) {
  // the studio standard (点将台 isTimerEvent): BOTH markers, the trigger name 1..128 characters
  return !!event && typeof event === 'object' && !Array.isArray(event) && event.Type === 'Timer' && typeof event.TriggerName === 'string' && event.TriggerName.length > 0 && event.TriggerName.length <= 128;
}

/**
 * Wrap a handler: identity comes ONLY from the trusted context OPENID.
 *  - auth:false for timer functions.
 *  - serverOnly:true (timers) additionally rejects any call that carries an OPENID (a client-originated call) AND
 *    any call that lacks the timer trigger marker (event.Type === 'Timer' AND a non-empty event.TriggerName, which the platform
 *    puts on every timer firing). Console test runs must send {"Type":"Timer","TriggerName":"manual"} (README).
 *    The marker is defence in depth only: the real controls are the console settings (anonymous/web login and HTTP
 *    access disabled, README).
 *  - rate: { name, limit } charges one unit of the per-openid fixed-window (1 minute) limiter BEFORE any work, so
 *    refused calls cost one transaction and nothing else; RATE_LIMITED comes back as the normal error envelope.
 */
function handler(fn, { auth = true, serverOnly = false, rate = null } = {}) {
  return async (event) => {
    const startedAt = now();
    try {
      init();
      const wx = cloud.getWXContext() || {};
      const openid = wx.OPENID || null;
      if (auth && !openid) fail('UNAUTHENTICATED', 'no openid in context');
      if (serverOnly) {
        if (openid) fail('FORBIDDEN', 'server-only function');
        if (!isTimerEvent(event)) fail('FORBIDDEN', 'not a timer trigger');
      }
      if (rate) await rateLimit(openid, 'fn_' + rate.name, 1, rate.limit);
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
  cloud, db, _, isDup, isNotFound, getDoc, getDocT, addIfAbsent, queryAll, coll, collT, updateDoc, removeDoc, getMany, cached, clearCache,
  writeEvent, writeSampled, rateLimit, dayLimit, bump, handler, isTimerEvent, errText,
};
