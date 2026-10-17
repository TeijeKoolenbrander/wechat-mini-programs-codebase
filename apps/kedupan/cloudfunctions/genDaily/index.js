'use strict';
// genDaily (timer, nightly 23:00 Beijing): create tomorrow's set. Idempotent by the fixed _id (a second fire, or a
// lazy getDaily that got there first, returns created:false). Not callable by a client (FORBIDDEN).
const store = require('./common/store');
const { fail, now, addDaysKey } = require('./common/util');
const { dateKeyAt } = require('./common/coreapi');
const daily = require('./common/daily');

exports.main = store.handler(async () => {
  const t0 = now();
  const dateKey = addDaysKey(dateKeyAt(t0), 1);
  const existing = await store.getDoc('daily_sets', dateKey);
  if (existing) return { ok: true, dateKey, created: false };
  const r = await daily.createSet(dateKey);
  if (!r) {
    console.error(`[ALERT] genDaily: no set could be created for ${dateKey} (before launch or content/schedule problem)`);
    await store.writeEvent('server', 'daily_gen', { dateKey, source: 'none', ms: now() - t0, failed: true });
    fail('DAILY_UNAVAILABLE', 'no set could be created');
  }
  if (r.created && r.set.source === 'auto') console.error(`[ALERT] schedule exhausted: ${dateKey} was built by the auto path`);
  await store.writeEvent('server', 'daily_gen', { dateKey, source: r.set.source, ms: now() - t0 });
  return r.created ? { ok: true, dateKey, created: true, source: r.set.source } : { ok: true, dateKey, created: false };
}, { auth: false, serverOnly: true });
