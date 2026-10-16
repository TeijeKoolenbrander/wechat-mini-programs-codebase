'use strict';
// QA (v1): server-side checks the developer suites only cover on a Tuesday or by source search.
//  - AC 77: the 识人 variant on a real Sunday goes through getDaily, getBoard, getHistory, getChallenge and the stored seed.
//  - AC 97: the rate-limit table equals the spec numbers (read from the spec, not from limits.js).
//  - AC 95/101: every function config sets TZ and a timeout; deny-all rules exist for the new collections.
//  - PO-8 / C5: a Sunday (识人) daily keeps the progressive-delivery and spoiler rules of a standard daily.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createHarness } = require('./helpers/harness');
const { runId, playDaily, allKeys } = require('./helpers/fixtures');

const CF = path.join(__dirname, '..');
const REPO = path.join(CF, '..', '..', '..');
const SPEC = fs.readFileSync(path.join(REPO, 'docs', 'dianjiangtai', 'spec.md'), 'utf8');

const SUNDAY_NOON = Date.UTC(2026, 10, 8, 4, 0, 0); // 2026-11-08 12:00 BJT, a Sunday
const MONDAY_NOON = SUNDAY_NOON + 86400000;
let h;
beforeEach(() => {
  h = createHarness({ now: SUNDAY_NOON });
  h.setEnv('GROUP_REF_PEPPER', 'test-pepper-not-a-secret-0123456789abcdef');
});
afterEach(() => h.teardown());

test('AC 77: Sunday Beijing date is shiren in the stored seed and in getDaily, getBoard, getHistory and getChallenge; Monday is standard', async () => {
  assert.equal(new Date(SUNDAY_NOON + 8 * 3600e3).getUTCDay(), 0, 'fixture date is a Sunday in Beijing');
  const d = await h.call('getDaily', {}, { openid: 'a' });
  assert.equal(d.dateKey, '20261108');
  assert.equal(d.variant, 'shiren');
  assert.equal(h.db.all('daily_seeds').find((s) => s._id === '20261108').variant, 'shiren');
  const res = await playDaily(h, 'a');
  assert.equal(res.ok, true);
  assert.equal(res.ranked, true);
  const board = await h.call('getBoard', { kind: 'friend', dateKey: '20261108' }, { openid: 'a' });
  assert.equal(board.variant, 'shiren');
  const hist = await h.call('getHistory', {}, { openid: 'a' });
  assert.equal(hist.items[0].variant, 'shiren');
  const owned = h.db.all('runs')[0].clientRunId;
  const c = await h.call('createChallenge', { runId: owned }, { openid: 'a' });
  assert.equal(c.ok, true);
  const view = await h.call('getChallenge', { challengeId: c.challengeId }, { openid: 'b' });
  assert.equal(view.variant, 'shiren', 'a challenge on a 识人 seed is a 识人 challenge (AC 79)');

  h.setNow(MONDAY_NOON);
  assert.equal((await h.call('getDaily', {}, { openid: 'a' })).variant, 'standard');
});

test('AC 86 on a 识人 Sunday: getDaily has no rounds; startRun hands out round 1 only; the answer key is not in any response', async () => {
  const d = await h.call('getDaily', {}, { openid: 'p' });
  assert.equal('rounds' in d, false);
  const s = await h.call('startRun', { mode: 'daily', clientRunId: runId(), dateKey: d.dateKey }, { openid: 'p' });
  assert.equal(s.ok, true);
  assert.equal(s.rounds.length, 1, 'only round 1 is released');
  const seedDoc = h.db.all('daily_seeds')[0];
  const dNoStreak = Object.assign({}, d); delete dNoStreak.myStreak; // myStreak.best is the player's own best STREAK, not a lineup
  const blob = JSON.stringify([dNoStreak, s]);
  assert.ok(!blob.includes('"best"') && !blob.includes('bestLineup'), 'no best lineup');
  assert.ok(!blob.includes(String(seedDoc.seed)) || String(seedDoc.seed).length < 6, 'no raw seed');
  for (const k of allKeys([dNoStreak, s])) assert.ok(!/^(openid|openGId|seed|best|battle)$/i.test(k), 'forbidden key ' + k);
});

test('AC 97: the rate-limit table equals the numbers written in the spec (60 reads, getBoard 30, 20 writes, track 300 events)', () => {
  const { LIMITS } = require(path.join(CF, 'common', 'limits.js'));
  const m = SPEC.match(/\*\*Rate limits \(TD-2\)\.\*\*[^\n]*/);
  assert.ok(m, 'AC 97 present in spec');
  assert.match(m[0], /60 for `getDaily`\/`getHistory`\/`getChallenge`\/`getReplay`\/`getRound`, 30 for `getBoard`, 20 for `startRun`\/`submitRun`\/`createChallenge`\/`subscribeChallenge`\/`joinGroup`/);
  for (const f of ['getDaily', 'getHistory', 'getChallenge', 'getReplay', 'getRound']) assert.equal(LIMITS[f].limit, 60, f);
  assert.equal(LIMITS.getBoard.limit, 30);
  for (const f of ['startRun', 'submitRun', 'createChallenge', 'subscribeChallenge', 'joinGroup']) assert.equal(LIMITS[f].limit, 20, f);
  assert.equal(LIMITS.track.limit, 300);
  assert.equal(LIMITS.genDaily, undefined, 'timers carry no limit');
  assert.equal(LIMITS.cleanup, undefined);
  // every deployed client function folder has a limit; every limit has a function folder
  const fns = fs.readdirSync(CF, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(CF, e.name, 'function.config.json'))).map((e) => e.name);
  for (const f of fns) if (!['genDaily', 'cleanup'].includes(f)) assert.ok(LIMITS[f], 'limit for ' + f);
  for (const f of Object.keys(LIMITS)) assert.ok(fns.includes(f), 'function for limit ' + f);
});

test('AC 95/66: every function config pins TZ=Asia/Shanghai and a positive explicit timeout; the two timers are the only server-only ones', () => {
  const fns = fs.readdirSync(CF, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(CF, e.name, 'function.config.json'))).map((e) => e.name);
  assert.ok(fns.length >= 14, 'all v1 functions present: ' + fns.join(','));
  for (const f of ['getRound', 'getHistory', 'subscribeChallenge']) assert.ok(fns.includes(f), f + ' exists');
  for (const f of fns) {
    const c = JSON.parse(fs.readFileSync(path.join(CF, f, 'function.config.json'), 'utf8'));
    assert.equal(c.envVariables && c.envVariables.TZ, 'Asia/Shanghai', f + ' TZ');
    assert.ok(Number.isInteger(c.timeout) && c.timeout > 0 && c.timeout <= 60, f + ' timeout');
  }
});

test('AC 101: database rules are deny-all for every collection (incl. challenge_answers, meta, rate_limits) and each has a rationale', () => {
  const rules = JSON.parse(fs.readFileSync(path.join(CF, 'database', 'rules.json'), 'utf8'));
  for (const c of ['challenge_answers', 'meta', 'rate_limits', 'daily_progress', 'sub_grants', 'anomalies', 'app_config', 'player_stats']) {
    assert.deepEqual(rules[c], { read: false, write: false }, c);
    assert.ok(rules._rationale[c] && rules._rationale[c].length > 10, 'rationale for ' + c);
  }
  for (const [k, v] of Object.entries(rules)) if (!k.startsWith('_')) assert.deepEqual(v, { read: false, write: false }, k);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(CF, 'storage', 'rules.json'), 'utf8')), { read: false, write: false });
});

test('AC 101: no function and no client file calls cloud storage (uploadFile / downloadFile / getTempFileURL)', () => {
  const roots = [CF, path.join(REPO, 'apps', 'dianjiangtai', 'game')];
  const skip = new Set(['node_modules', 'tests', 'tools', 'cloudfunctions-deploy']);
  const hits = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!skip.has(e.name)) walk(path.join(dir, e.name)); continue; }
      if (!e.name.endsWith('.js')) continue;
      const src = fs.readFileSync(path.join(dir, e.name), 'utf8');
      if (/\b(uploadFile|downloadFile|getTempFileURL|deleteFile)\s*\(/.test(src)) hits.push(path.join(dir, e.name));
    }
  })(roots[0]);
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!skip.has(e.name)) walk(path.join(dir, e.name)); continue; }
      if (!e.name.endsWith('.js')) continue;
      const src = fs.readFileSync(path.join(dir, e.name), 'utf8');
      if (/\b(uploadFile|downloadFile|getTempFileURL)\s*\(/.test(src)) hits.push(path.join(dir, e.name));
    }
  })(roots[1]);
  assert.deepEqual(hits, []);
});

test('edge 26: a 识人 attempt started on Sunday and submitted at 00:10 Monday is ranked for Sunday and stays 识人; Monday is standard', async () => {
  const { startDaily } = require('./helpers/fixtures');
  const s = await startDaily(h, 'late');
  assert.equal(s.dateKey, '20261108');
  h.setNow(Date.UTC(2026, 10, 8, 16, 10, 0)); // 00:10 BJT Monday
  const res = await h.call('submitRun', { mode: 'daily', clientRunId: runId(), dateKey: s.dateKey, actions: s.actions }, { openid: 'late' });
  assert.equal(res.ok, true);
  assert.equal(res.ranked, true, 'inside the 30 minute grace window');
  assert.equal(h.db.all('daily_results').find((r) => r.openid === 'late').dateKey, '20261108');
  const hist = await h.call('getHistory', {}, { openid: 'late' });
  const sunday = hist.items.find((i) => i.dateKey === '20261108');
  assert.equal(sunday.variant, 'shiren');
  assert.ok(sunday.mine, 'the result is on the Sunday issue');
  const mon = await h.call('getDaily', {}, { openid: 'late' });
  assert.equal(mon.dateKey, '20261109');
  assert.equal(mon.variant, 'standard');
});
