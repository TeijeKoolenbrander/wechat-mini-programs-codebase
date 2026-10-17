'use strict';
// Studio security audit fixes: M3 rate limits, L2 track allowlist (through the real function), L3 timers / storage / README,
// L5 pepper length. joinGroup (M1) is in features.test.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createHarness } = require('./helpers/harness');
const sync = require('../scripts/sync-core');
const schema = require(path.join(sync.DEFAULT_CORE, 'schema'));

const CF = sync.CF_ROOT;
const read = (...p) => fs.readFileSync(path.join(CF, ...p), 'utf8');
const P = 'chuanhua_';

// ---- M3 -----------------------------------------------------------------------------------------------------------------------

/** the documented ceilings (CONTRACT.md "Rate limits"); a function may be tighter, never looser */
const CEILING = {
  getHome: 60, getChain: 60, getReveal: 60, getMyChains: 60, getGroupChains: 60,
  claimStep: 20, releaseClaim: 20, joinGroup: 20, laugh: 20, agreeRules: 20, subscribeReveal: 20, track: 20,
  createChain: 5, submitStep: 30, deleteMyStep: 10, report: 10, revealNow: 10, grantReward: 10,
  // rooms (spec 13.2): reads 60, the turn / tick 30-40, lobby writes tight
  getRoom: 60, getRoomReveal: 60, submitRoomStep: 30, roomTick: 40, rollPrompts: 20, createRoom: 5, joinRoom: 10, leaveRoom: 10, startRoom: 5, rematch: 5,
};

test('M3: every client-callable function takes a per-openid rate limit within the documented ceiling', () => {
  const clientFns = schema.CLIENT_FUNCTIONS;
  assert.ok(clientFns.length >= 18);
  for (const fn of clientFns) {
    const src = read(fn, 'index.js');
    const m = /store\.rateLimit\(openid, '([a-z]+)', 1, (\d+)\)/.exec(src);
    assert.ok(m, fn + ' has no rateLimit(openid, bucket, 1, perMinute)');
    assert.ok(CEILING[fn], fn + ' has no documented ceiling');
    assert.ok(Number(m[2]) <= CEILING[fn], `${fn}: ${m[2]}/min exceeds ${CEILING[fn]}`);
    if (['getHome', 'getChain', 'getReveal', 'getMyChains', 'getGroupChains', 'getRoom', 'getRoomReveal'].includes(fn)) assert.ok(Number(m[2]) <= 60, fn + ' read limit');
    else if (['submitRoomStep', 'submitStep', 'roomTick'].includes(fn)) assert.ok(Number(m[2]) <= 40, fn + ' turn limit');
    else assert.ok(Number(m[2]) <= 20, fn + ' write limit');
  }
  for (const fn of Object.keys(CEILING)) assert.ok(clientFns.includes(fn), fn + ' is documented but not a client function');
});

test('M3: the limiter answers RATE_LIMITED after the window budget, per openid, and resets next minute (real functions)', async () => {
  const h = createHarness();
  try {
    const call = (fn, ev, u) => h.call(fn, ev, { openid: u });
    // a read: 60 per minute
    let limited = 0;
    for (let i = 0; i < 61; i++) if ((await call('getChain', { chainId: 'nope' }, 'u-lim')).code === 'RATE_LIMITED') limited++;
    assert.equal(limited, 1, 'the 61st read in the minute is refused');
    assert.notEqual((await call('getChain', { chainId: 'nope' }, 'u-other')).code, 'RATE_LIMITED', 'another openid is independent');
    h.advance(61e3);
    assert.notEqual((await call('getChain', { chainId: 'nope' }, 'u-lim')).code, 'RATE_LIMITED', 'the next window starts fresh');
    // a UGC submit: 30 per minute (the call itself fails for lack of a claim; the limiter runs first)
    const codes = [];
    for (let i = 0; i < 32; i++) codes.push((await call('submitStep', { chainId: 'AAAAAAAAAA', claimId: 'x', strokes: { v: 1, s: [] } }, 'u-sub')).code);
    assert.equal(codes.filter((c) => c === 'RATE_LIMITED').length, 2);
    // a write: 20 per minute
    const joins = [];
    for (let i = 0; i < 22; i++) joins.push((await call('joinGroup', { cloudID: 'cid-3-grp-rate' }, 'u-join')).code);
    assert.equal(joins.filter((c) => c === 'RATE_LIMITED').length, 2);
    const resp = await call('joinGroup', { cloudID: 'cid-3-grp-rate' }, 'u-join');
    assert.deepEqual(Object.keys(resp).sort(), ['code', 'message', 'ok']);
    assert.equal(resp.ok, false);
  } finally { h.teardown(); }
});

test('M3: track is limited before it parses (a junk flood is cheap) and admin limits an allow-listed openid but not the console', async () => {
  const h = createHarness({ env: { ADMIN_OPENIDS: 'admin-openid-1' } });
  try {
    let limited = 0;
    for (let i = 0; i < 25; i++) if ((await h.call('track', { events: [] }, { openid: 'u-t' })).code === 'RATE_LIMITED') limited++;
    assert.equal(limited, 5);
    for (let i = 0; i < 65; i++) await h.call('admin', { op: 'listReports' }, { openid: 'admin-openid-1' });
    assert.equal((await h.call('admin', { op: 'listReports' }, { openid: 'admin-openid-1' })).code, 'RATE_LIMITED');
    assert.equal((await h.call('admin', { op: 'listReports' }, {})).ok, true, 'the console carries no OPENID and has no limiter');
  } finally { h.teardown(); }
});

// ---- L2 -----------------------------------------------------------------------------------------------------------------------

test('L2: the track function stores only catalogue props, with types and enums checked', async () => {
  const h = createHarness();
  try {
    const r = await h.call('track', {
      events: [
        { name: 'claim_attempt', sessionId: 'sess1', clientTs: 1, props: { chainId: 'ABCDEFGHJK', step: 2, result: 'ok', text: '秘密', evil: 'x', openid: 'o'.repeat(28), appVersion: '1.0.0' } },
        { name: 'claim_attempt', props: { chainId: 'ABCDEFGHJK', step: 'two', result: 'pwned' } },
        { name: 'not_an_event', props: { a: 1 } },
        { name: 'step_submit', props: { strokes: { v: 1, s: [[1]] }, chars: 'x'.repeat(40) } },
      ],
    }, { openid: 'u-track' });
    assert.equal(r.ok, true);
    const rows = h.db.all(P + 'events');
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0].props, { chainId: 'ABCDEFGHJK', step: 2, result: 'ok', appVersion: '1.0.0' });
    assert.deepEqual(rows[1].props, { chainId: 'ABCDEFGHJK' });
    assert.deepEqual(rows[2].props, {});
  } finally { h.teardown(); }
});

// ---- L3 -----------------------------------------------------------------------------------------------------------------------

test('L3: timer functions require the timer trigger marker; a client call, an unmarked call and a wrong marker are FORBIDDEN', async () => {
  const h = createHarness();
  try {
    for (const fn of ['modSweeper', 'roomSweeper', 'cleanup']) {
      assert.equal((await h.call(fn, {}, { raw: true })).code, 'FORBIDDEN', fn + ' without marker');
      assert.equal((await h.call(fn, { Type: 'Other' })).code, 'FORBIDDEN', fn + ' wrong marker');
      assert.equal((await h.call(fn, { Type: 'timer' })).code, 'FORBIDDEN', fn + ' marker is case-sensitive');
      assert.equal((await h.call(fn, { Type: 'Timer' }, { openid: 'u1' })).code, 'FORBIDDEN', fn + ' client with marker');
      assert.equal((await h.call(fn, {}, {})).ok, true, fn + ' with the marker (harness adds it)');
    }
    assert.equal((await h.call('modSweeper', { Type: 'Timer', TriggerName: 'chuanhua_modSweeper_timer', Time: '2026-11-03T12:00:00Z' }, {})).ok, true);
    // the push handler is server-only too, but not a timer
    assert.notEqual((await h.call('onMediaCheck', { Event: 'other' }, {})).ok, false);
  } finally { h.teardown(); }
});

test('L3: the timer functions are declared with the marker option in code (source guard)', () => {
  for (const fn of Object.keys(schema.FUNCTIONS).filter((f) => schema.FUNCTIONS[f].timer)) {
    assert.match(read(fn, 'index.js'), /timer: true/, fn);
  }
});

test('L3: database and storage rules deny all client access; the README documents anonymous/web login and HTTP access', () => {
  const st = JSON.parse(read('storage.rules.json'));
  assert.deepEqual([st.read, st.write], [false, false]);
  const db = JSON.parse(read('database', 'rules.json'));
  for (const [k, v] of Object.entries(db)) if (!k.startsWith('_')) assert.deepEqual(v, k === 'chuanhua_room_signals' ? { read: 'doc._openid == auth.openid', write: false } : { read: false, write: false }, k);
  const md = read('README.md');
  assert.match(md, /anonymous login and any web \(Web SDK\) login stay disabled/);
  assert.match(md, /HTTP access service\*\* \| \*\*Off for every function except `chuanhua_onMediaCheck`/);
  assert.match(md, /valid `PUSH_TOKEN` signature/);
  assert.match(md, /\{"Type":"Timer"\}/);
  assert.match(md, /at least 32 characters/);
  // no function folder enables an HTTP trigger / path in its config
  for (const fn of Object.keys(schema.FUNCTIONS)) {
    const cfg = JSON.parse(read(fn, 'config.json'));
    assert.ok(!('httpPath' in cfg) && !('http' in cfg), fn + ' config enables HTTP');
  }
});

// ---- L5 -----------------------------------------------------------------------------------------------------------------------

test('L5: GROUP_REF_PEPPER is enforced at 32 characters in the one place that reads it', () => {
  const src = read('common', 'groups.js');
  assert.match(src, /MIN_PEPPER_LEN = 32/);
  assert.equal((read('joinGroup', 'index.js').match(/GROUP_REF_PEPPER/g) || []).length, 0);
});

// ---- query / body parsing -----------------------------------------------------------------------------------------------------

test('parsing: no decodeURIComponent or JSON.parse of client input without a try/catch in the cloud functions', () => {
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'tests' || e.name === 'scripts') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'core') walk(p); } else if (e.name.endsWith('.js') && !p.includes(path.sep + 'common' + path.sep + 'core')) files.push(p);
    }
  };
  walk(CF);
  for (const f of files.filter((x) => !/[\\/]common[\\/]/.test(x) || /push\.js$/.test(x))) {
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(!/decodeURIComponent/.test(src), f + ' decodes a URI component');
  }
  // the one JSON.parse of a request body (push) is called inside try/catch
  const push = read('common', 'push.js');
  assert.match(push, /try \{\s*body = parseBody\(raw\);\s*\} catch/);
  assert.match(push, /try \{\s*body = parseBody\(decrypt\(/);
});
