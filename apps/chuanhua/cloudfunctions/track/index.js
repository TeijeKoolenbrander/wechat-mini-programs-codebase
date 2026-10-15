'use strict';
// track: batched analytics (spec 14). <= 50 events per call, rate limited per openid.
// Identity is the context OPENID. Props are sanitised: no identifiers, user text or strokes are
// ever stored (AC 75).
const store = require('./common/store');
const { fail, now, isPlainObject, isInt } = require('./common/util');

const MAX_BATCH = 50;
const EVENTS_PER_MIN = 300;
const MAX_PROPS_BYTES = 1024;
const MAX_DEPTH = 4;

// Client-sendable event names (spec 14). Server-side names (mod_*, chain_reveal, ...) are NOT accepted here.
const CLIENT_EVENTS = new Set([
  'session_start', 'card_open', 'group_join', 'rules_view', 'rules_agree', 'picker_view', 'prompt_pick',
  'custom_prompt_result', 'chain_create', 'claim_attempt', 'step_view', 'step_submit', 'step_release',
  'step_result', 'reveal_view', 'laugh', 'report_submit', 'share_tap', 'subscribe_offer', 'subscribe_result',
  'same_again', 'group_list_view', 'album_view', 'delete_step', 'restriction_shown', 'ad_request', 'ad_show',
  'ad_reward', 'ad_close_early', 'ad_error', 'interstitial_show', 'error',
]);
const FORBIDDEN_KEY = /^(openid|opengid|groupRef|groupid|shareTicket|ticket|cloudID|unionid|text|strokes|content|prompt|promptText|desc|description|sentence|nickname)$/i;

function clean(v, depth) {
  if (depth > MAX_DEPTH) return undefined;
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') return v.slice(0, 64); // short codes only; free text has no place in analytics
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
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_BATCH) fail('BAD_INPUT', `events must be 1-${MAX_BATCH}`);
  await store.rateLimit(openid, 'track', list.length, EVENTS_PER_MIN);

  const ts = now();
  const docs = [];
  for (const e of list) {
    if (!isPlainObject(e) || !CLIENT_EVENTS.has(e.name)) continue; // drop unknown, never fail the batch
    const props = clean(isPlainObject(e.props) ? e.props : {}, 0) || {};
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
