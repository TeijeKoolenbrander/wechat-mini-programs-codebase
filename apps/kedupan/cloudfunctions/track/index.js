'use strict';
// track: batched analytics (spec 12, AC 77). <= 50 events per call, rate limited per openid (30 calls and 300 events a
// minute). Identity is the context OPENID. Unknown event names are dropped (the batch never fails).
// L2: props are an ALLOWLIST per event: only the keys core/events.js EVENTS[name] lists (plus COMMON), each checked for
// its type or enum (core/events.js sanitizeProps); every other key is dropped, so a modified client cannot store free
// text, identifiers or oversized values. The event itself is still stored without the rejected keys.
const store = require('./common/store');
const { fail, now, isPlainObject, isInt } = require('./common/util');
const { core, rateOf } = require('./common/coreapi');

const EVENTS_PER_MIN = 300;
const MAX_PROPS_BYTES = 1024;
const CLIENT_EVENTS = new Set(core.EV.CLIENT_EVENT_NAMES);

exports.main = store.handler(async (event, { openid }) => {
  const v = core.V.track(event);
  if (!v.ok) fail('INVALID_INPUT', 'invalid input');
  const list = v.v.events;
  await store.rateLimit(openid, 'track', list.length, EVENTS_PER_MIN);
  const ts = now();
  const docs = [];
  for (const e of list) {
    if (!isPlainObject(e) || typeof e.name !== 'string' || !CLIENT_EVENTS.has(e.name)) continue;
    const raw = isPlainObject(e.props) ? e.props : {};
    const props = core.EV.sanitizeProps(e.name, raw);
    const rawSession = e.sessionId !== undefined ? e.sessionId : v.v.sessionId !== null ? v.v.sessionId : raw.sessionId;
    if (JSON.stringify(props).length > MAX_PROPS_BYTES) continue;
    const sessionId = typeof rawSession === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(rawSession) ? rawSession : null;
    docs.push({ openid, sessionId, name: e.name, props, ts, clientTs: isInt(e.clientTs, 0, 4102444800000) ? e.clientTs : null });
  }
  await Promise.all(docs.map((data) => store.coll('events').add({ data })));
  return { ok: true, accepted: docs.length };
}, { rate: rateOf('track') });
