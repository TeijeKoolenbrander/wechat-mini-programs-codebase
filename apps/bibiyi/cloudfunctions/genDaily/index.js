'use strict';
// genDaily: timer trigger (config.json, 23:00 BJT) that builds the NEXT day's deck (spec 5.2, 4.4).
// Idempotent: fixed _id per date; a double-fired trigger or a racing lazy getDaily creates one document.
// A deck that fails the analytic difficulty gate is discarded; if none passes -> DAILY_UNAVAILABLE, [ALERT],
// and nothing is published (no relaxed deck, ever). Server-only: a call carrying an OPENID is rejected.
const core = require('./common/coreapi');
const store = require('./common/store');
const daily = require('./common/daily');
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
  const r = await daily.ensureDaily(dateKey, { startedAt, timeoutMs: configuredTimeoutMs() });
  if (r.created) {
    const d = r.doc;
    await store.writeEvent('server', 'daily_gen', {
      dateKey, attempts: d.attempts, genMs: d.genMs, median: d.gates.median, p20: d.gates.p20, p40: d.gates.p40,
    });
  }
  return { ok: true, dateKey, created: r.created };
}, { auth: false, serverOnly: true });
