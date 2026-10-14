'use strict';
// track: batched analytics (spec §15). <= 50 events per call, rate limited per openid.
// Identity is the context OPENID. Props are sanitised: no identifier-like keys are stored
// (AC 60: events never contain an openGId or groupRef).
const store = require('./common/store');
const { fail, now, isPlainObject, isInt } = require('./common/util');

const MAX_BATCH = 50;
const EVENTS_PER_MIN = 300;
const MAX_PROPS_BYTES = 1024;
const MAX_DEPTH = 4;

// Client-sendable event names (§15). Server-side names (board_list, daily_gen) are NOT accepted here.
const CLIENT_EVENTS = new Set([
  'session_start', 'card_open', 'run_start', 'respin', 'draft_pick', 'draft_undo', 'run_complete',
  'run_abandon', 'reveal_skip', 'share_tap', 'challenge_created', 'challenge_answered', 'board_view',
  'group_join', 'privacy_result', 'friend_scope_result', 'ad_request', 'ad_show', 'ad_reward',
  'ad_close_early', 'ad_error', 'interstitial_show', 'board_write', 'error',
]);
const FORBIDDEN_KEY = /^(openid|opengid|openGId|group_openid|groupRef|groupid|shareTicket|ticket|cloudID|unionid)$/i;

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
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_BATCH) fail('INVALID_ACTIONS', `events must be 1-${MAX_BATCH}`);
  await store.rateLimit(openid, 'track', list.length, EVENTS_PER_MIN);

  const ts = now();
  const docs = [];
  for (const e of list) {
    if (!isPlainObject(e) || !CLIENT_EVENTS.has(e.name)) continue; // drop unknown, never fail the batch
    const props = clean(isPlainObject(e.props) ? e.props : {}, 0) || {};
    // the client sends sessionId inside props; accept the top-level field first, store it top-level, strip from props
    const rawSession = e.sessionId !== undefined ? e.sessionId : props.sessionId;
    delete props.sessionId;
    if (JSON.stringify(props).length > MAX_PROPS_BYTES) continue;
    const sessionId = typeof rawSession === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(rawSession) ? rawSession : null;
    docs.push({
      openid, sessionId, name: e.name, props, ts,
      clientTs: isInt(e.clientTs, 0, 4102444800000) ? e.clientTs : null,
    });
  }
  await Promise.all(docs.map((data) => store.db().collection('events').add({ data })));
  return { ok: true, accepted: docs.length };
});
