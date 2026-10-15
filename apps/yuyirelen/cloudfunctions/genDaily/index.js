'use strict';
// genDaily: timer (config.json, 23:00 BJT) that publishes the NEXT day's puzzle from the reviewed bank (spec 5.1).
// Idempotent: fixed _id per date; a double-fired trigger or a racing lazy getDaily creates one document and
// consumes at most one bank entry. No live generation: an empty bank publishes nothing (DAILY_UNAVAILABLE).
// Server-only: a call carrying an OPENID (i.e. from the mini game) is rejected with FORBIDDEN.
const coreapi = require('./common/coreapi');
const store = require('./common/store');
const puzzles = require('./common/puzzles');
const { now, addDaysKey, isDateKey, fail } = require('./common/util');

exports.main = store.handler(async (event) => {
  let dateKey;
  if (event && event.dateKey !== undefined) {
    // console/manual invocation: {dateKey}; the timer passes nothing useful
    if (!isDateKey(event.dateKey)) fail('INVALID_INPUT', 'bad dateKey');
    dateKey = event.dateKey;
  } else dateKey = addDaysKey(coreapi.dateKeyAt(now()), 1);
  const r = await puzzles.ensureDaily(dateKey);
  if (r.created) await store.writeEvent('server', 'daily_gen', { dateKey, bankLeft: r.bankLeft });
  return { ok: true, dateKey, created: r.created };
}, { auth: false, serverOnly: true });
