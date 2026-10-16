'use strict';
// track: batched analytics (spec §15). <= 50 events per call, rate limited per openid (300 events a minute).
// Identity is the context OPENID. Unknown event names are dropped (the batch never fails).
// L2: props are an ALLOWLIST per event: only the keys core/events.js CATALOGUE[name] lists (plus COMMON), each checked for
// its type or enum; every other key is dropped, so a modified client cannot store free text, identifiers or oversized
// values (AC 60: events never contain an openGId or groupRef). The event itself is still stored without the rejected keys.
const store = require('./common/store');
const limits = require('./common/limits');
const { fail, now, isPlainObject, isInt } = require('./common/util');
const events = require('./core/events');

const MAX_BATCH = 50;
const MAX_PROPS_BYTES = 1024;
const SESSION_RE = /^[A-Za-z0-9_-]{1,64}$/;

exports.main = store.handler(async (event, { openid }) => {
  const list = event.events;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_BATCH) fail('INVALID_ACTIONS', `events must be 1-${MAX_BATCH}`);

  const ts = now();
  const docs = [];
  for (const e of list) {
    if (!isPlainObject(e) || typeof e.name !== 'string') continue; // drop unknown, never fail the batch
    const raw = isPlainObject(e.props) ? e.props : {};
    const props = events.cleanProps(e.name, raw);
    if (!props) continue; // not a client-sendable event (server-only names included)
    // the client sends sessionId inside props; accept the top-level field first, store it top-level only
    const rawSession = e.sessionId !== undefined ? e.sessionId : raw.sessionId;
    if (JSON.stringify(props).length > MAX_PROPS_BYTES) continue;
    docs.push({
      openid, sessionId: typeof rawSession === 'string' && SESSION_RE.test(rawSession) ? rawSession : null, name: e.name, props, ts,
      clientTs: isInt(e.clientTs, 0, 4102444800000) ? e.clientTs : null,
    });
  }
  await Promise.all(docs.map((data) => store.db().collection('events').add({ data })));
  return { ok: true, accepted: docs.length };
}, { rate: limits.rateOf('track') });
