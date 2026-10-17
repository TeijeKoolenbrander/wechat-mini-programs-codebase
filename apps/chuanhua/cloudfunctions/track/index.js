'use strict';
// track: batched analytics (spec 14, AC 75). core/analytics.js#sanitizeEvents allowlists event names AND, per event, the prop keys,
// types and enum values from the spec 14 catalogue (L2); everything else (unknown keys, wrong types, out-of-enum strings, anything
// that could be content or identity such as text, strokes, openids, group ids) is dropped, whatever a modified client sends.
const { sanitizeEvents } = require('./core/analytics');
const store = require('./common/store');
const { now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  await store.rateLimit(openid, 'track', 1, 20); // before parsing: a flood of junk batches costs the sender, not us
  const clean = sanitizeEvents(event.events);
  if (!clean.length) return { ok: true };
  await Promise.all(clean.map((e) => store.coll('events').add({ data: { openid, sessionId: e.sessionId, name: e.name, props: e.props, ts: now(), clientTs: e.clientTs } }).catch((err) => console.warn('track add failed', store.errText(err)))));
  return { ok: true };
});
