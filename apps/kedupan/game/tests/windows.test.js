'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const W = require('../core/windows');
const D = require('../core/date');

const BJ = (key, h, m, s) => D.dateKeyToMs(key) + ((h * 60 + m) * 60 + (s || 0)) * 1000;

test('AC 22: the Beijing date key flips at 16:00:00 UTC', () => {
  assert.equal(D.beijingDateKey(Date.UTC(2026, 10, 1, 15, 59, 59)), '20261101');
  assert.equal(D.beijingDateKey(Date.UTC(2026, 10, 1, 16, 0, 0)), '20261102');
  assert.equal(D.beijingDateKey(Date.UTC(2026, 11, 31, 16, 0, 0)), '20270101');
});

test('AC 22: the date key is right under TZ=UTC, TZ=America/Los_Angeles and TZ unset (child processes)', () => {
  const code =
    "const D=require('./core/date');" +
    "process.stdout.write([Date.UTC(2026,10,1,15,59,59),Date.UTC(2026,10,1,16,0,0)].map(D.beijingDateKey).join(','))";
  const cwd = path.resolve(__dirname, '..');
  const run = (tz) => {
    const env = { ...process.env };
    if (tz === null) delete env.TZ;
    else env.TZ = tz;
    return execFileSync(process.execPath, ['-e', code], { cwd, env }).toString();
  };
  assert.equal(run('UTC'), '20261101,20261102');
  assert.equal(run('America/Los_Angeles'), '20261101,20261102');
  assert.equal(run(null), '20261101,20261102');
});

test('issue number counts from the launch day = 1', () => {
  assert.equal(W.issueOf('20261101', '20261101'), 1);
  assert.equal(W.issueOf('20261112', '20261101'), 12);
});

test('close is D+1 00:30 BJT', () => {
  assert.equal(W.closeMs('20261101'), BJ('20261102', 0, 30, 0));
  assert.equal(W.dayClosed('20261101', BJ('20261102', 0, 29, 59)), false);
  assert.equal(W.dayClosed('20261101', BJ('20261102', 0, 30, 0)), true);
});

test('AC 20: a daily started at 23:59 on D accepts cards until D+1 00:30 and returns LATE_SUBMIT at 00:31', () => {
  const entry = { firstAt: BJ('20261101', 23, 59, 0) };
  assert.deepEqual(W.submitWindow({ dateKey: '20261101', nowMs: BJ('20261101', 23, 59, 30), entry }), { ok: true, grace: false });
  assert.deepEqual(W.submitWindow({ dateKey: '20261101', nowMs: BJ('20261102', 0, 10, 0), entry }), { ok: true, grace: true });
  assert.deepEqual(W.submitWindow({ dateKey: '20261101', nowMs: BJ('20261102', 0, 29, 59), entry }), { ok: true, grace: true });
  assert.equal(W.submitWindow({ dateKey: '20261101', nowMs: BJ('20261102', 0, 31, 0), entry }).code, 'LATE_SUBMIT');
});

test('AC 20: yesterday without a first card on D is LATE_SUBMIT even in the grace window; the future is INVALID_INPUT', () => {
  const now = BJ('20261102', 0, 10, 0);
  assert.equal(W.submitWindow({ dateKey: '20261101', nowMs: now, entry: null }).code, 'LATE_SUBMIT');
  assert.equal(W.submitWindow({ dateKey: '20261101', nowMs: now, entry: { firstAt: null } }).code, 'LATE_SUBMIT');
  assert.equal(W.submitWindow({ dateKey: '20261103', nowMs: now, entry: null }).code, 'INVALID_INPUT');
  assert.equal(W.submitWindow({ dateKey: '20261031', nowMs: now, entry: { firstAt: BJ('20261031', 12, 0, 0) } }).code, 'LATE_SUBMIT');
});

test('live day: today, or yesterday until it closes', () => {
  assert.equal(W.liveDay('20261102', BJ('20261102', 12, 0, 0)), true);
  assert.equal(W.liveDay('20261101', BJ('20261102', 0, 10, 0)), true);
  assert.equal(W.liveDay('20261101', BJ('20261102', 0, 30, 0)), false);
  assert.equal(W.liveDay('20261103', BJ('20261102', 12, 0, 0)), false);
});

test('AC 36: the newest closed day is never today, and yesterday only after 00:30', () => {
  assert.equal(W.newestClosedKey(BJ('20261102', 0, 10, 0)), '20261031');
  assert.equal(W.newestClosedKey(BJ('20261102', 0, 30, 0)), '20261101');
  assert.equal(W.newestClosedKey(BJ('20261102', 15, 0, 0)), '20261101');
});
