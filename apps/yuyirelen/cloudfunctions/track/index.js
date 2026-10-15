'use strict';
// track: batched analytics (spec 15; pattern copied from apps/dianjiangtai). <= 50 events per call, rate limited.
// Identity is the context OPENID. Props are sanitised:
//  - an event carrying a prop named text / input / query (at any depth) is REJECTED whole (PO-23, AC 25):
//    typed text must never reach analytics;
//  - identifier-like keys (openid, groupRef, cloudID, ...) are dropped.
const store = require('./common/store');
const { fail, now, isPlainObject, isInt } = require('./common/util');

const MAX_BATCH = 50;
const EVENTS_PER_MIN = 300;
const MAX_PROPS_BYTES = 1024;
const MAX_DEPTH = 4;

// Client-sendable event names (spec 15). Server-side names (daily_gen, board_list, anomaly_daily) are NOT accepted.
const CLIENT_EVENTS = new Set([
  'session_start', 'card_open', 'puzzle_open', 'puzzle_start', 'guess', 'guess_rejected', 'keyboard_open',
  'chips_select', 'hint_unlock', 'hint_use', 'give_up', 'solve', 'reveal_view', 'share_tap', 'challenge_created',
  'challenge_open', 'challenge_finish', 'board_view', 'group_join', 'privacy_result', 'friend_scope_result',
  'board_write', 'archive_view', 'next_puzzle', 'ad_request', 'ad_show', 'ad_reward', 'ad_close_early', 'ad_error',
  'interstitial_show', 'streak_shown', 'display_setting', 'error',
]);
const TEXT_KEY = /^(text|input|query)$/i;
const FORBIDDEN_KEY = /^(openid|opengid|openGId|group_openid|groupRef|groupid|shareTicket|ticket|cloudID|unionid)$/i;

function hasTextProp(v, depth) {
  if (depth > MAX_DEPTH + 2) return false;
  if (Array.isArray(v)) return v.some((x) => hasTextProp(x, depth + 1));
  if (isPlainObject(v)) return Object.keys(v).some((k) => TEXT_KEY.test(k) || hasTextProp(v[k], depth + 1));
  return false;
}

function clean(v, depth) {
  if (depth > MAX_DEPTH) return undefined;
  if (v === null || typeof v === 'number' || typeof v === 'boolean') return typeof v === 'number' && !Number.isFinite(v) ? undefined : v;
  if (typeof v === 'string') return v.slice(0, 200);
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => clean(x, depth + 1)).filter((x) => x !== undefined);
  if (isPlainObject(v)) {
    const o = {};
    for (const k of Object.keys(v).slice(0, 30)) {
      if (FORBIDDEN_KEY.test(k) || k.startsWith('$') || k.includes('.')) continue;
      const c = clean(v[k], depth + 1);
      if (c !== undefined) o[k] = c;
    }
    return o;
  }
  return undefined;
}

exports.main = store.handler(async (event, { openid }) => {
  const list = event.events;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_BATCH) fail('INVALID_INPUT', `events must be 1-${MAX_BATCH}`);
  await store.rateLimit(openid, 'track', list.length, EVENTS_PER_MIN);

  const ts = now();
  const docs = [];
  let rejected = 0;
  for (const e of list) {
    if (!isPlainObject(e) || !CLIENT_EVENTS.has(e.name)) { rejected++; continue; }
    if (hasTextProp(e.props, 0) || hasTextProp(e, 1)) { rejected++; continue; }
    const props = clean(isPlainObject(e.props) ? e.props : {}, 0) || {};
    const rawSession = e.sessionId !== undefined ? e.sessionId : props.sessionId;
    delete props.sessionId;
    if (JSON.stringify(props).length > MAX_PROPS_BYTES) { rejected++; continue; }
    const sessionId = typeof rawSession === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(rawSession) ? rawSession : null;
    docs.push({
      openid, sessionId, name: e.name, props, ts,
      clientTs: isInt(e.clientTs, 0, 4102444800000) ? e.clientTs : null,
    });
  }
  await Promise.all(docs.map((data) => store.db().collection('events').add({ data })));
  return { ok: true, accepted: docs.length, rejected };
});
