'use strict';
// genDaily: timer trigger (config.json, 23:00 BJT) that writes the NEXT day's seed.
// Idempotent: fixed _id per date; a double-fired trigger or a racing lazy getDaily creates one
// document and consumes at most one bank entry (spec §5.2).
// Server-only: a call carrying an OPENID (i.e. from the mini game) is rejected.
const core = require('./common/coreapi');
const store = require('./common/store');
const { ensureDaily } = require('./common/daily');
const { now, addDaysKey, isDateKey, fail, configuredTimeoutMs } = require('./common/util');

exports.main = store.handler(async (event, { startedAt }) => {
  // Console/manual invocations may pass {dateKey}; the timer passes nothing useful.
  let dateKey;
  if (event && event.dateKey !== undefined) {
    if (!isDateKey(event.dateKey)) fail('INVALID_ACTIONS', 'bad dateKey');
    dateKey = event.dateKey;
  } else {
    dateKey = addDaysKey(core.dateKeyAt(now()), 1);
  }
  const r = await ensureDaily(dateKey, { startedAt, timeoutMs: configuredTimeoutMs() });
  if (r.created) {
    const d = r.doc;
    await store.writeEvent('server', 'daily_gen', {
      dateKey, source: d.source, attempts: d.attempts, genMs: d.genMs,
      relaxed: !!(d.gates && d.gates.relaxed), bankLeft: r.bankLeft == null ? null : r.bankLeft,
    });
  }
  return { ok: true, dateKey, created: r.created, source: r.doc.source };
}, { auth: false, serverOnly: true });
