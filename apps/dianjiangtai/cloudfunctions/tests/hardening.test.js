'use strict';
// Security hardening (audit of the sister app): M3 rate limits, capped reads, sampled server events, L3 timer marker and storage
// rule, L5 pepper, transactional challenge bookkeeping and roll-up claim, mock parity. (M1 is in group.test.js, L2 in track.test.js.)
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sync = require('../scripts/sync-core');
const { createHarness, bestActions, CV } = require('./helpers/harness');
const { runId } = require('./helpers/fixtures');
const limitsLib = require('../common/limits');
const mockLib = require('../../game/js/mock-server');

const CF = sync.CF_ROOT;
const T0 = Date.UTC(2026, 10, 3, 4, 0, 0); // 2026-11-03 12:00 BJT
const PEPPER = 'test-pepper-not-a-secret-0123456789abcdef';
const CLIENT_FNS = sync.listFunctions().filter((f) => f !== 'genDaily' && f !== 'cleanup');
const TIMER = { Type: 'Timer', TriggerName: 'manual' };

let h;
beforeEach(() => {
  h = createHarness({ now: T0 });
  h.setEnv('GROUP_REF_PEPPER', PEPPER);
});
afterEach(() => h.teardown());

const sheet = (seed) => require(path.join(h.root, 'getDaily', 'core', 'sheet.js')).buildSheet(seed, CV);

// ------------------------------------------------------------------------------------------------ M3 rate limits

test('M3: every client-callable function has a limit in common/limits.js, applies it through the handler, and the mock server agrees', () => {
  assert.deepEqual(Object.keys(limitsLib.LIMITS).sort(), CLIENT_FNS.slice().sort());
  CLIENT_FNS.forEach((fn) => {
    assert.equal(mockLib.RATE_LIMITS[fn], limitsLib.LIMITS[fn].limit, 'mock limit of ' + fn);
    const src = fs.readFileSync(path.join(CF, fn, 'index.js'), 'utf8');
    assert.ok(src.includes(`limits.rateOf('${fn}')`), fn + ' applies its limit');
    assert.ok(!/store\.rateLimit\(/.test(src), fn + ' charges the limit in store.handler only (before any work)');
  });
  assert.deepEqual(Object.keys(mockLib.RATE_LIMITS).sort(), CLIENT_FNS.slice().sort());
  // reads about 60/min, writes about 20/min
  ['getDaily', 'getHistory', 'getChallenge', 'getReplay'].forEach((fn) => assert.equal(limitsLib.LIMITS[fn].limit, 60));
  ['startRun', 'submitRun', 'createChallenge', 'subscribeChallenge', 'joinGroup'].forEach((fn) => assert.equal(limitsLib.LIMITS[fn].limit, 20));
  assert.equal(limitsLib.LIMITS.track.limit, 300);
  assert.throws(() => limitsLib.rateOf('nope'));
});

test('M3: past its limit a function returns RATE_LIMITED before it reads anything; the window rolls; openids are independent', async () => {
  h.limits = true;
  const sample = {
    getDaily: {}, getHistory: {}, getChallenge: { challengeId: 'AAAAAAAA' }, getReplay: { runId: 'run-000001' },
    getBoard: { kind: 'friend', dateKey: '20261103' }, getRound: {}, startRun: { mode: 'free', clientRunId: 'run-000001' },
    submitRun: {}, createChallenge: { runId: 'run-000001' }, subscribeChallenge: { challengeId: 'AAAAAAAA' },
    joinGroup: { cloudID: 'cid-sample-1' }, track: { events: [{ name: 'error', props: { where: 'x' } }] },
  };
  for (const fn of CLIENT_FNS) {
    const limit = limitsLib.LIMITS[fn].limit;
    h.advance(61e3); // a fresh minute for every function
    const who = 'rl-' + fn;
    for (let i = 0; i < limit; i++) {
      const r = await h.call(fn, sample[fn], { openid: who });
      assert.notEqual(r.code, 'RATE_LIMITED', `${fn} call ${i + 1} of ${limit}`);
    }
    // over the limit: refused, and not a single database access outside rate_limits happens
    const touched = [];
    h.db.failOn = (c, op) => { if (c !== 'rate_limits') touched.push(c + ':' + op); return null; };
    const over = await h.call(fn, sample[fn], { openid: who });
    h.db.failOn = null;
    assert.deepEqual([fn, over.ok, over.code], [fn, false, 'RATE_LIMITED']);
    assert.deepEqual(touched, [], fn + ' touched ' + touched.join(','));
    // another player is not affected
    assert.notEqual((await h.call(fn, sample[fn], { openid: 'other-' + fn })).code, 'RATE_LIMITED', fn + ' other openid');
    // the next minute is open again
    h.advance(60e3);
    assert.notEqual((await h.call(fn, sample[fn], { openid: who })).code, 'RATE_LIMITED', fn + ' next window');
  }
});

test('M3: a refused call is cheap and identity is checked first (no openid is UNAUTHENTICATED, never a counter row)', async () => {
  h.limits = true;
  const r = await h.callRaw('getDaily', {}, {});
  assert.equal(r.code, 'UNAUTHENTICATED');
  assert.equal(h.db.all('rate_limits').length, 0);
  await h.call('getHistory', {}, { openid: 'u' });
  const rows = h.db.all('rate_limits');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]._id, `getHistory_u_${Math.floor(T0 / 60000)}`);
  assert.equal(rows[0].count, 1);
  assert.ok(rows[0].expireAt > T0, 'cleanup trims it by expireAt');
});

test('M3: track costs one unit per event (300 events a minute); a batch that would cross the limit is refused whole', async () => {
  h.limits = true;
  const batch = (n) => ({ events: new Array(n).fill({ name: 'error', props: { where: 'x' } }) });
  for (let i = 0; i < 5; i++) assert.equal((await h.call('track', batch(50), { openid: 'u' })).ok, true);
  assert.equal((await h.call('track', batch(49), { openid: 'u' })).ok, true);
  const refused = await h.call('track', batch(2), { openid: 'u' });
  assert.equal(refused.code, 'RATE_LIMITED');
  assert.equal(h.db.all('events').length, 299, 'nothing of the refused batch is stored');
  assert.equal(limitsLib.LIMITS.track.cost({ events: new Array(80) }), 50, 'cost is clamped to the batch cap');
  assert.equal(limitsLib.LIMITS.track.cost({}), 1);
});

test('M3: a burst that loses the counter transaction is a RATE_LIMITED verdict, not an INTERNAL error', async () => {
  h.limits = true;
  const realErr = console.error;
  console.error = () => {};
  try {
    h.db.failOn = (c, op) => (c === 'rate_limits' && op === 'set' ? Object.assign(new Error('transaction write conflict, please retry'), { errCode: -1 }) : null);
    const r = await h.call('getDaily', {}, { openid: 'u' });
    assert.deepEqual([r.ok, r.code], [false, 'RATE_LIMITED']);
    h.db.failOn = (c, op) => (c === 'rate_limits' && op === 'set' ? new Error('disk on fire') : null);
    assert.equal((await h.call('getDaily', {}, { openid: 'u' })).code, 'INTERNAL');
  } finally { console.error = realErr; h.db.failOn = null; }
});

test('M3: rate_limits documents are purged by cleanup once expired', async () => {
  h.limits = true;
  await h.call('getHistory', {}, { openid: 'u' });
  assert.equal(h.db.all('rate_limits').length, 1);
  h.advance(2 * 3600e3);
  const r = await h.call('cleanup', { ...TIMER });
  assert.equal(r.ok, true);
  assert.equal(r.removed.rate_limits, 1);
});

// ------------------------------------------------------------------------------------------------ capped reads, sampled events

test('capped reads: queryAll pages through the collection and honours max; its default is the hard cap', async () => {
  h.bind('u');
  const store = require(path.join(h.root, 'getBoard', 'common', 'store.js'));
  assert.equal(store.MAX_QUERY_ROWS, 20000);
  for (let i = 0; i < 2500; i++) h.db.put('meta', { _id: 'm' + String(i).padStart(5, '0'), g: 1 });
  assert.equal((await store.queryAll('meta', { g: 1 })).length, 2500);
  assert.equal((await store.queryAll('meta', { g: 1 }, { max: 1200 })).length, 1200);
  // every queryAll call site in the functions passes an explicit max or relies on the cap
  for (const fn of sync.listFunctions()) {
    const src = fs.readFileSync(path.join(CF, fn, 'index.js'), 'utf8');
    for (const m of src.matchAll(/queryAll\([^;]*;/g)) assert.ok(/max:/.test(m[0]), 'queryAll without an explicit max: ' + m[0]);
  }
});

test('sampled server events: a hot getBoard writes at most one board_list event per date, kind and mode per minute', async () => {
  for (let i = 0; i < 12; i++) {
    const r = await h.call('getBoard', { kind: 'friend', dateKey: '20261103' }, { openid: 'v' + (i % 3) });
    if (i === 0) assert.equal(r.code, 'SEED_NOT_FOUND');
    if (i === 0) await h.call('getDaily', {}, { openid: 'v0' });
  }
  const evs = () => h.db.all('events').filter((e) => e.name === 'board_list');
  assert.equal(evs().length, 1);
  assert.equal(evs()[0].props.mode, 'full');
  h.advance(61e3);
  await h.call('getBoard', { kind: 'friend', dateKey: '20261103' }, { openid: 'v0' });
  assert.equal(evs().length, 2);
});

// ------------------------------------------------------------------------------------------------ L3 timers, storage, console

test('L3: genDaily and cleanup run only for a timer event (Type Timer + TriggerName) with no OPENID', async () => {
  const refused = [
    ['a client call with a valid marker', TIMER, { openid: 'someClient' }],
    ['no event body', {}, {}],
    ['Type only', { Type: 'Timer' }, {}],
    ['TriggerName only', { TriggerName: 'manual' }, {}],
    ['lower-case type', { Type: 'timer', TriggerName: 'manual' }, {}],
    ['wrong type', { Type: 'Event', TriggerName: 'manual' }, {}],
    ['empty TriggerName', { Type: 'Timer', TriggerName: '' }, {}],
    ['non-string TriggerName', { Type: 'Timer', TriggerName: 7 }, {}],
    ['TriggerName over 128 chars', { Type: 'Timer', TriggerName: 'x'.repeat(129) }, {}],
    ['a dateKey without the marker', { dateKey: '20261104' }, {}],
    ['array event', [TIMER], {}],
    ['null event', null, {}],
  ];
  for (const fn of ['genDaily', 'cleanup']) {
    for (const [name, ev, who] of refused) {
      const r = await h.callRaw(fn, ev, who);
      assert.deepEqual([fn, name, r.ok, r.code], [fn, name, false, 'FORBIDDEN']);
    }
  }
  assert.equal(h.db.all('daily_seeds').length, 0, 'nothing was generated');
  assert.equal(h.db.all('events').length, 0);
  // the marker the console test sends works, with an explicit dateKey for genDaily
  const g = await h.callRaw('genDaily', { Type: 'Timer', TriggerName: 'manual', dateKey: '20261105' }, {});
  assert.deepEqual([g.ok, g.dateKey], [true, '20261105']);
  assert.equal((await h.callRaw('genDaily', { Type: 'Timer', TriggerName: 'manual', dateKey: '2026-11-06' }, {})).code, 'INVALID_ACTIONS');
  assert.equal((await h.callRaw('cleanup', { Type: 'Timer', TriggerName: 'manual', Time: '2026-11-03T20:00:00Z', Message: '' }, {})).ok, true);
});

test('L3: the storage rule is deny-all and is not a function folder; the README documents the console steps', () => {
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(CF, 'storage', 'rules.json'), 'utf8')), { read: false, write: false });
  assert.ok(!sync.listFunctions().includes('storage'), 'storage/ is not a function folder');
  const readme = fs.readFileSync(path.join(CF, 'README.md'), 'utf8');
  for (const needle of [/storage\/rules\.json/, /anonymous/i, /HTTP access/i, /\{"Type":"Timer","TriggerName":"manual"\}/, /Console hardening/, />= 32 characters/, /RATE_LIMITED/]) assert.match(readme, needle);
  const rules = JSON.parse(fs.readFileSync(path.join(CF, 'database', 'rules.json'), 'utf8'));
  const cols = Object.keys(rules).filter((k) => !k.startsWith('_'));
  assert.deepEqual(Object.keys(rules._rationale).sort(), cols.sort(), 'every collection rule has a documented reason');
  assert.ok(cols.includes('challenge_answers'));
  // no function carries an HTTP trigger
  for (const fn of sync.listFunctions()) {
    const cfgPath = path.join(CF, fn, 'config.json');
    if (!fs.existsSync(cfgPath)) continue;
    const c = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    for (const t of c.triggers || []) assert.equal(t.type, 'timer', fn);
  }
});

// ------------------------------------------------------------------------------------------------ L5 pepper

test('L5: createChallenge needs a pepper of at least 32 characters', async () => {
  const seed = 777;
  const id = runId();
  const run = await h.call('submitRun', { mode: 'free', clientRunId: id, seed, actions: bestActions(sheet(seed)) }, { openid: 'owner' });
  assert.equal(run.ok, true);
  for (const bad of [undefined, '', 'short', 'x'.repeat(31), 'test-pepper-not-a-secret']) {
    h.setEnv('GROUP_REF_PEPPER', bad);
    const r = await h.call('createChallenge', { runId: id }, { openid: 'owner' });
    assert.deepEqual([bad, r.code], [bad, 'SERVER_CONFIG']);
  }
  assert.equal(h.db.all('challenges').length, 0);
  h.setEnv('GROUP_REF_PEPPER', 'y'.repeat(32));
  assert.equal((await h.call('createChallenge', { runId: id }, { openid: 'owner' })).ok, true);
});

// ------------------------------------------------------------------------------------------------ concurrency

async function freeChallenge(owner, seed = 777) {
  const id = runId();
  const a = bestActions(sheet(seed));
  const run = await h.call('submitRun', { mode: 'free', clientRunId: id, seed, actions: a }, { openid: owner });
  assert.equal(run.ok, true);
  const c = await h.call('createChallenge', { runId: id }, { openid: owner });
  assert.equal(c.ok, true, JSON.stringify(c));
  return { challengeId: c.challengeId, rounds: sheet(seed) };
}

test('concurrency: parallel and repeated answers of one player count once; the best answer is never lowered', async () => {
  const c = await freeChallenge('owner');
  const act = (rank) => bestActions(c.rounds, { rank });
  const submit = (openid, rank) => h.call('submitRun', { mode: 'challenge', clientRunId: runId(), challengeId: c.challengeId, actions: act(rank) }, { openid });
  // the same friend answers 4 times at once with different run ids: one counted answer
  const same = await Promise.all([0, 1, 2, 3].map((rank) => submit('friend', rank)));
  assert.ok(same.every((r) => r.ok), JSON.stringify(same));
  let ch = h.db.all('challenges')[0];
  assert.equal(ch.answerCount, 1);
  assert.equal(h.db.all('challenge_answers').length, 1);
  assert.equal(h.db.all('challenge_answers')[0]._id, `${c.challengeId}_friend`);
  assert.equal(h.db.all('runs').filter((r) => r.challengeId === c.challengeId).length, 4, 'every run is stored');
  // two other friends race; the better record wins whatever the order
  const [hi, lo] = await Promise.all([submit('hi', 0), submit('lo', 3)]);
  ch = h.db.all('challenges')[0];
  assert.equal(ch.answerCount, 3);
  assert.equal(ch.bestAnswer.w, Math.max(ch.bestAnswer.w, hi.record.w, lo.record.w));
  assert.ok(ch.bestAnswer.w >= hi.record.w && ch.bestAnswer.w >= lo.record.w);
  // a later, worse answer never lowers it
  const best = ch.bestAnswer.w;
  await submit('late', 3);
  assert.equal(h.db.all('challenges')[0].bestAnswer.w >= best, true);
  assert.equal(h.db.all('challenges')[0].answerCount, 4);
});

test('concurrency: the run and its challenge bookkeeping are one transaction (a failure leaves neither, the retry counts once)', async () => {
  const c = await freeChallenge('owner');
  const id = runId();
  const ev = { mode: 'challenge', clientRunId: id, challengeId: c.challengeId, actions: bestActions(c.rounds) };
  const realErr = console.error;
  console.error = () => {};
  try {
    h.db.failOn = (col, op) => (col === 'challenges' && op === 'update' ? new Error('disk on fire') : null);
    const failed = await h.call('submitRun', ev, { openid: 'friend' });
    assert.equal(failed.code, 'INTERNAL');
  } finally { console.error = realErr; h.db.failOn = null; }
  assert.equal(h.db.all('runs').filter((r) => r.openid === 'friend').length, 0, 'rolled back');
  assert.equal(h.db.all('challenge_answers').length, 0);
  assert.equal(h.db.all('challenges')[0].answerCount, 0);
  const ok = await h.call('submitRun', ev, { openid: 'friend' });
  assert.equal(ok.ok, true);
  assert.equal(h.db.all('challenges')[0].answerCount, 1);
  // the retry of the very same call is idempotent
  assert.equal((await h.call('submitRun', ev, { openid: 'friend' })).ok, true);
  assert.equal(h.db.all('challenges')[0].answerCount, 1);
});

test('concurrency: the daily anomaly roll-up is claimed once, even when the timer fires twice at the same time', async () => {
  const rollups = () => h.db.all('events').filter((e) => e.name === 'anomaly_daily');
  const r = await Promise.all([h.call('cleanup', { ...TIMER }), h.call('cleanup', { ...TIMER }), h.call('cleanup', { ...TIMER })]);
  assert.ok(r.every((x) => x.ok), JSON.stringify(r));
  assert.equal(rollups().length, 1);
  assert.equal(r.filter((x) => x.anomalyDaily && x.anomalyDaily.skipped).length, 2);
  assert.ok(h.db.all('meta').some((m) => m._id === 'rollup_20261102'));
  assert.equal((await h.call('cleanup', { ...TIMER })).anomalyDaily.skipped, true);
  assert.equal(rollups().length, 1);
});

test('concurrency: a roll-up that fails after the claim releases it, so the next timer retries the day', async () => {
  const realWarn = console.warn;
  console.warn = () => {};
  try {
    h.db.failOn = (col, op) => (col === 'runs' && op === 'count' ? new Error('db hiccup') : null);
    const r = await h.call('cleanup', { ...TIMER });
    assert.equal(r.ok, true);
    assert.equal(r.anomalyDaily, null);
  } finally { console.warn = realWarn; h.db.failOn = null; }
  assert.equal(h.db.all('meta').filter((m) => m._id.startsWith('rollup_')).length, 0, 'claim released');
  const again = await h.call('cleanup', { ...TIMER });
  assert.equal(again.anomalyDaily.dateKey, '20261102');
  assert.equal(h.db.all('events').filter((e) => e.name === 'anomaly_daily').length, 1);
});

// ------------------------------------------------------------------------------------------------ answer key

test('item 8: the client-facing responses carry no seed, sheet or best lineup before the caller has a ranked daily', async () => {
  const d = await h.call('getDaily', {}, { openid: 'fresh' });
  assert.equal(d.ok, true);
  const json = JSON.stringify(d);
  assert.doesNotMatch(json, /"seed"|"rounds"|boardSalt|lineup|"best":[{[]/);
  const hist = await h.call('getHistory', {}, { openid: 'fresh' });
  assert.doesNotMatch(JSON.stringify(hist), /"seed"|"rounds"|"best":[{[]/, 'today is still open: no best lineup');
});
