'use strict';
// genDaily: timer trigger (config.json, 23:00 BJT) that writes the NEXT day's daily set from the schedule
// (or the auto path). Idempotent: fixed _id per date; a double-fired trigger or a racing lazy getDaily
// creates one document. Server-only: a call carrying an OPENID (the mini game) is rejected with FORBIDDEN.
const core = require('./common/coreapi');
const store = require('./common/store');
const daily = require('./common/daily');
const { now, addDaysKey, isDateKey, fail } = require('./common/util');

exports.main = store.handler(async (event) => {
  let dateKey;
  if (event && event.dateKey !== undefined) {
    // console / manual invocation only (a client call never gets here: serverOnly)
    if (!isDateKey(event.dateKey)) fail('INVALID_INPUT', 'bad dateKey');
    dateKey = event.dateKey;
  } else {
    dateKey = addDaysKey(core.dateKeyAt(now()), 1);
  }
  const r = await daily.ensureDaily(dateKey);
  if (r.created) await store.writeEvent('server', 'daily_gen', { dateKey, source: r.doc.source });
  return { ok: true, dateKey, created: r.created, source: r.doc.source };
}, { auth: false, serverOnly: true });
