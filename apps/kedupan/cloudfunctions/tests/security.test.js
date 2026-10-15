'use strict';
// Static checks (rules, secrets, identity, drift) plus track and cleanup behaviour.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sync = require('../scripts/sync-core');
const { createHarness, play, T0, DAY } = require('./helpers/harness');

const CF = sync.CF_ROOT;
const read = (p) => fs.readFileSync(p, 'utf8');
const sources = () => [
  ...sync.listFunctions().map((fn) => [`${fn}/index.js`, read(path.join(CF, fn, 'index.js'))]),
  ...fs.readdirSync(path.join(CF, 'common')).map((f) => [`common/${f}`, read(path.join(CF, 'common', f))]),
];
const SERVER_ONLY = ['genDaily', 'finalizeDay', 'sweepRounds', 'cleanup'];
const EXPECTED_FUNCTIONS = [
  'cleanup', 'createRound', 'finalizeDay', 'genDaily', 'getArchive', 'getArchiveDay', 'getBonusCard', 'getDaily',
  'getFriendBoard', 'getGroupDay', 'getRound', 'joinGroup', 'reportCard', 'revealRound', 'setClue', 'submitCard',
  'submitGuess', 'subscribeRound', 'sweepRounds', 'track', 'unlockDistribution',
];

test('every function listed in spec 11.2 exists, with package.json and function.config.json', () => {
  assert.deepEqual(sync.listFunctions(), EXPECTED_FUNCTIONS);
  for (const fn of EXPECTED_FUNCTIONS) {
    assert.ok(fs.existsSync(path.join(CF, fn, 'package.json')), fn);
    assert.ok(fs.existsSync(path.join(CF, fn, 'function.config.json')), fn);
  }
});

test('security rules: every collection the code touches is deny-all, and no rule exists for an unused one (AC 68)', () => {
  const rules = JSON.parse(read(path.join(CF, 'database', 'rules.json')));
  const used = new Set();
  for (const [, src] of sources()) {
    for (const m of src.matchAll(/(?:collection|getDoc|getDocT|addIfAbsent|queryAll|purge)\(\s*(?:t,\s*)?'([a-z_]+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/\[\s*'([a-z_]+)',\s*'[A-Za-z]+',\s*'(?:ms|key)'\s*\]/g)) used.add(m[1]);
  }
  assert.ok(used.size >= 14, 'sanity: found the collections: ' + [...used]);
  for (const c of used) assert.ok(rules[c], `no security rule for collection ${c}`);
  for (const [c, r] of Object.entries(rules)) {
    if (c.startsWith('_')) continue;
    assert.deepEqual(r, { read: false, write: false }, `${c} must be deny-all`);
    assert.ok(used.has(c), `rule for unused collection ${c}`);
  }
  // the spec 11.1 collections that are written by the code are all covered
  for (const c of ['daily_sets', 'daily_card_stats', 'daily_entries', 'player_stats', 'group_members', 'group_daily', 'rounds', 'guesses', 'sub_grants', 'card_reports', 'item_usage', 'anomalies', 'events', 'rate_limits', 'app_config', 'meta']) {
    assert.ok(rules[c], c);
  }
});

test('identity: no function reads OPENID/openid from client input; getWXContext only in common/store.js (AC 68)', () => {
  for (const [file, src] of sources()) {
    assert.doesNotMatch(src, /event\.(openid|OPENID|openId|userId|hostOpenid)/, file);
    assert.doesNotMatch(src, /event\[['"]open/i, file);
    if (file !== 'common/store.js') assert.doesNotMatch(src, /getWXContext/, file);
  }
});

test('secrets: env vars only; no AppSecret/session_key/code2Session; no secret in committed configs (AC 68)', () => {
  const allowedEnv = new Set(['GROUP_REF_PEPPER', 'JOINGROUP_RETURN_OPENGID', 'LAUNCH_DATE_KEY', 'TZ']);
  for (const [file, src] of sources()) {
    assert.doesNotMatch(src, /appsecret|session_key|code2session|jscode2session/i, file);
    for (const m of src.matchAll(/process\.env\.([A-Z_]+)/g)) assert.ok(allowedEnv.has(m[1]), `${file} reads undocumented env ${m[1]}`);
  }
  for (const fn of sync.listFunctions()) {
    const c = JSON.parse(read(path.join(CF, fn, 'function.config.json')));
    assert.deepEqual(Object.keys(c.envVariables), ['TZ'], 'no secrets in committed function config');
  }
  const readme = read(path.join(CF, 'README.md'));
  for (const v of allowedEnv) assert.ok(readme.includes(v), `README documents ${v}`);
});

test('every function uses the handler wrapper; timers are server-only', () => {
  for (const fn of sync.listFunctions()) assert.match(read(path.join(CF, fn, 'index.js')), /store\.handler\(/, fn);
  for (const fn of SERVER_ONLY) assert.match(read(path.join(CF, fn, 'index.js')), /serverOnly:\s*true/, fn);
  for (const fn of sync.listFunctions().filter((f) => !SERVER_ONLY.includes(f))) {
    assert.doesNotMatch(read(path.join(CF, fn, 'index.js')), /serverOnly|auth:\s*false/, `${fn} must authenticate`);
  }
});

test('no function accepts free text from the client (PD-7, AC 29): no msgSecCheck, no text fields stored', () => {
  for (const [file, src] of sources()) assert.doesNotMatch(src, /msgSecCheck|event\.(text|clueText|content|nickname|message)\b/, file);
});

test('drift: common/ copies in every function equal the source', () => {
  assert.deepEqual(sync.checkDrift({ commonOnly: true }), []);
});

test('drift: core copies equal the core source (real game/core, or the test double until it exists)', () => {
  assert.deepEqual(sync.checkDrift({ coreSrc: sync.DEFAULT_CORE }), [], 'run: npm run sync');
});

test('drift detector catches missing, changed and stale files', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kd-drift-'));
  fs.mkdirSync(path.join(tmp, 'common'));
  fs.mkdirSync(path.join(tmp, 'fnA'));
  fs.writeFileSync(path.join(tmp, 'fnA', 'index.js'), '');
  fs.writeFileSync(path.join(tmp, 'common', 'x.js'), 'a');
  sync.syncAll({ root: tmp, coreSrc: sync.FAKE_CORE });
  assert.deepEqual(sync.checkDrift({ root: tmp, coreSrc: sync.FAKE_CORE }), []);
  fs.writeFileSync(path.join(tmp, 'fnA', 'common', 'x.js'), 'changed');
  fs.writeFileSync(path.join(tmp, 'fnA', 'common', 'extra.js'), 'x');
  fs.rmSync(path.join(tmp, 'fnA', 'core', 'score.js'));
  const problems = sync.checkDrift({ root: tmp, coreSrc: sync.FAKE_CORE }).join('\n');
  assert.match(problems, /differs.*x\.js/);
  assert.match(problems, /stale.*extra\.js/);
  assert.match(problems, /missing.*score\.js/);
});

test('all client functions are rate-limited or read-only-cheap: submitCard/submitGuess/track/boards call a limiter', () => {
  for (const fn of ['submitCard', 'submitGuess', 'track', 'getGroupDay', 'getFriendBoard', 'createRound', 'getBonusCard', 'unlockDistribution', 'reportCard']) {
    assert.match(read(path.join(CF, fn, 'index.js')), /rateLimit(Day)?\(/, fn);
  }
});

let h;
beforeEach(() => { h = createHarness({ now: T0 }); });
afterEach(() => h.teardown());

test('track: batch <= 50, whitelisted names, identity from context, sanitised props, no groupRef/openGId (AC 49, 77)', async () => {
  const ok = await h.call('track', {
    events: [
      { name: 'daily_card_reveal', sessionId: 's-1', clientTs: 1700000000000, props: { dateKey: '20261103', idx: 0, groupRef: 'aaaaaaaaaaaaaaaa', openGId: 'OG', nested: { opengid: 'x', ok: 1 } } },
      { name: 'round_reveal', props: {} }, // server-only name
      { name: 'daily_gen', props: {} },
      { name: 'nope', props: {} },
      { name: 'share_tap', props: { openid: 'forged', kind: 'daily', sessionId: 's-2' } },
    ],
  }, { openid: 'U' });
  assert.equal(ok.ok, true);
  assert.equal(ok.accepted, 2);
  const ev = h.db.all('events');
  assert.equal(ev.length, 2);
  assert.ok(ev.every((e) => e.openid === 'U'));
  assert.equal(ev[0].sessionId, 's-1');
  assert.equal(ev[0].clientTs, 1700000000000);
  assert.equal(ev[1].sessionId, 's-2');
  const s = JSON.stringify(ev);
  assert.doesNotMatch(s, /groupRef|openGId|opengid|forged|aaaaaaaaaaaaaaaa/);
  assert.equal((await h.call('track', { events: [] }, { openid: 'U' })).code, 'INVALID_INPUT');
  assert.equal((await h.call('track', { events: new Array(51).fill({ name: 'error' }) }, { openid: 'U' })).code, 'INVALID_INPUT');
  assert.equal((await h.call('track', { events: [{ name: 'error' }] })).code, 'UNAUTHENTICATED');
});

test('cleanup: deletes personal data past 180 days, keeps daily_sets and daily_card_stats, idempotent (AC 67)', async () => {
  await play(h, 'A', [10, 20, 30, 40, 50]);
  await h.call('track', { events: [{ name: 'error', props: {} }] }, { openid: 'A' });
  const old = T0 - 181 * DAY;
  const fresh = T0 - 10 * DAY;
  const oldKey = '20260501';
  const put = (col, doc) => h.db.put(col, doc);
  put('daily_entries', { _id: 'OLD_e', openid: 'o', firstAt: old });
  put('player_stats', { _id: 'o', updatedAt: old });
  put('player_stats', { _id: 'fresh', updatedAt: fresh });
  put('group_members', { _id: 'og_o', lastSeen: oldKey });
  put('group_members', { _id: 'og_f', lastSeen: '20261101' });
  put('group_daily', { _id: 'g_old', computedAt: old });
  put('rounds', { _id: 'ROUNDOLD', createdAt: old });
  put('rounds', { _id: 'ROUNDNEW', createdAt: fresh });
  put('guesses', { _id: 'ROUNDOLD_o', ts: old });
  put('sub_grants', { _id: 'ROUNDOLD_o', grantedAt: old });
  put('card_reports', { _id: 'r1', ts: old });
  put('anomalies', { _id: 'an1', ts: old });
  put('events', { _id: 'ev_old', ts: old });
  put('rate_limits', { _id: 'rl_old', expireAt: T0 - 1000 });
  put('daily_sets', { _id: '20250101', cards: [], createdAt: old });
  put('daily_card_stats', { _id: '20250101_0', hist: [], n: 0 });
  const r = await h.call('cleanup', {});
  assert.equal(r.ok, true);
  const ids = (c) => h.db.all(c).map((d) => d._id);
  assert.ok(!ids('daily_entries').includes('OLD_e'));
  assert.ok(ids('daily_entries').includes(`20261103_A`));
  assert.deepEqual(ids('player_stats').sort(), ['A', 'fresh']);
  assert.deepEqual(ids('group_members'), ['og_f']);
  assert.equal(ids('group_daily').length, 0);
  assert.deepEqual(ids('rounds'), ['ROUNDNEW']);
  assert.equal(ids('guesses').length, 0);
  assert.equal(ids('sub_grants').length, 0);
  assert.equal(ids('card_reports').length, 0);
  assert.equal(ids('anomalies').filter((x) => x === 'an1').length, 0);
  assert.equal(ids('events').filter((x) => x === 'ev_old').length, 0);
  assert.ok(ids('events').length >= 1, 'fresh events are kept');
  assert.equal(ids('rate_limits').filter((x) => x === 'rl_old').length, 0);
  assert.ok(ids('daily_sets').includes('20250101'));
  assert.ok(ids('daily_card_stats').includes('20250101_0'));
  const again = await h.call('cleanup', {});
  assert.deepEqual(Object.values(again.removed).reduce((a, b) => a + b, 0), 0);
  assert.equal((await h.call('cleanup', {}, { openid: 'A' })).code, 'FORBIDDEN');
});
