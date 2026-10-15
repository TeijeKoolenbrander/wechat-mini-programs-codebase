'use strict';
// QA additions (trust and security). Tests marked { todo } document confirmed bugs: they assert the
// SECURE behaviour, are reported as TODO (not failures) while the bug exists, and become real
// regressions the moment the owner fixes it (remove the todo flag then).
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createHarness, bestActions } = require('./helpers/harness');
const { runId, playDaily, startDaily, releaseAll, sheetOf, prefixThroughPick, allStrings, allKeys } = require('./helpers/fixtures');

const T0 = Date.UTC(2026, 10, 3, 4, 0, 0); // 2026-11-03 12:00 BJT
const CF = path.join(__dirname, '..');
let h;
beforeEach(() => {
  h = createHarness({ now: T0 });
  h.setEnv('GROUP_REF_PEPPER', 'test-pepper-not-a-secret');
});
afterEach(() => h.teardown());

async function dailyChallenge() {
  await playDaily(h, 'owner');
  const owned = h.db.all('runs')[0].clientRunId;
  const c = await h.call('createChallenge', { runId: owned }, { openid: 'owner' });
  assert.equal(c.ok, true);
  return c.challengeId;
}

// ---- BUG: the daily optimum leaks through a friendly challenge run + getReplay (AC 19, 38 intent, spec 5.2) ----
test('daily best lineup is never obtainable before the caller has a ranked daily result (challenge + getReplay)',
  async () => {
    const challengeId = await dailyChallenge();
    const view = await h.call('getChallenge', { challengeId }, { openid: 'cheat' });
    assert.equal(view.countsAsDaily, true);
    const clientRunId = runId();
    // never calls startRun, so the run is a friendly match and the daily stays unplayed
    const res = await h.call('submitRun', { mode: 'challenge', clientRunId, challengeId, actions: bestActions(h.db.all('challenges')[0].rounds) }, { openid: 'cheat' });
    assert.equal(res.ok, true);
    assert.equal(res.ranked, false);
    assert.equal(h.db.all('daily_results').filter((r) => r.openid === 'cheat').length, 0);
    const rep = await h.call('getReplay', { runId: clientRunId }, { openid: 'cheat' });
    const secret = h.db.all('daily_seeds')[0].best;
    // secure behaviour: refused, or at least not the stored optimum
    assert.ok(rep.ok === false || JSON.stringify(rep.best.lineup) !== JSON.stringify(secret.lineup), 'getReplay returned the daily optimum before the daily was played');
  });

test('ONE ranked daily per openid even when the first one came through a challenge', async () => {
  const challengeId = await dailyChallenge();
  await h.call('startRun', { mode: 'challenge', clientRunId: runId(), challengeId }, { openid: 'friend' });
  const acts = bestActions(h.db.all('challenges')[0].rounds, { rank: 2 });
  await releaseAll(h, 'friend', '20261103', acts);
  const first = await h.call('submitRun', { mode: 'challenge', clientRunId: runId(), challengeId, actions: acts }, { openid: 'friend' });
  assert.equal(first.ranked, true);
  const d = await h.call('getDaily', {}, { openid: 'friend' });
  const again = await h.call('submitRun', { mode: 'daily', clientRunId: runId(), dateKey: d.dateKey, actions: bestActions(sheetOf(h, d.dateKey), { rank: 0 }) }, { openid: 'friend' });
  assert.equal(again.code, 'ALREADY_PLAYED');
  assert.deepEqual(again.result.record, first.record);
  assert.equal(h.db.all('daily_results').filter((r) => r.openid === 'friend').length, 1);
});

test('midnight grace boundary is exact: 00:29:59.999 ranks for D, 00:30:00.000 is LATE_SUBMIT (AC 23)', async () => {
  const D2330 = Date.UTC(2026, 10, 3, 15, 30, 0); // 23:30 BJT on 20261103
  for (const [offsetAfterMidnightMs, expectOk] of [[30 * 60e3 - 1, true], [30 * 60e3, false]]) {
    const hh = createHarness({ now: D2330 });
    hh.setEnv('GROUP_REF_PEPPER', 'p');
    try {
      const d = await hh.call('getDaily', {}, { openid: 'u' });
      assert.equal(d.dateKey, '20261103');
      await hh.call('startRun', { mode: 'daily', clientRunId: runId() }, { openid: 'u' });
      const acts = bestActions(sheetOf(hh, d.dateKey));
      await releaseAll(hh, 'u', d.dateKey, acts);
      hh.setNow(Date.UTC(2026, 10, 3, 16, 0, 0) + offsetAfterMidnightMs);
      const r = await hh.call('submitRun', { mode: 'daily', clientRunId: runId(), dateKey: '20261103', actions: acts }, { openid: 'u' });
      if (expectOk) { assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.ranked, true); } else assert.equal(r.code, 'LATE_SUBMIT');
    } finally { hh.teardown(); }
  }
});

test('startRun for a different day (yesterday or tomorrow) is refused: the attempt only starts for today', async () => {
  await h.call('getDaily', {}, { openid: 'u' });
  for (const dateKey of ['20261102', '20261104']) {
    const r = await h.call('startRun', { mode: 'daily', clientRunId: runId(), dateKey }, { openid: 'u' });
    assert.equal(r.ok, false, dateKey);
  }
});

test('AC 60 sweep: no function response in a scripted session holds an openid or openGId; h differs per date', async () => {
  const OPENIDS = ['oAlice_SECRET', 'oBob_SECRET', 'oCara_SECRET'];
  const GID = 'OPENGID_QA_SECRET';
  const seen = [];
  const rec = (x) => { seen.push(x); return x; };
  for (const u of OPENIDS) {
    rec(await h.call('getDaily', {}, { openid: u }));
    rec(await h.call('joinGroup', { groupData: { cloudID: 'c', data: { opengid: GID, chat_type: 3 } } }, { openid: u }));
  }
  const g = rec(await h.call('joinGroup', { groupData: { cloudID: 'c', data: { opengid: GID, chat_type: 3 } } }, { openid: OPENIDS[0] }));
  let n = 0;
  for (const u of OPENIDS) {
    rec(await h.call('startRun', { mode: 'daily', clientRunId: runId() }, { openid: u }));
    const d = await h.call('getDaily', {}, { openid: u });
    const acts = bestActions(sheetOf(h, d.dateKey), { rank: n++ });
    for (let k = 1; k <= 4; k++) rec(await h.call('getRound', { clientRunId: runId(), dateKey: d.dateKey, actions: prefixThroughPick(acts, k) }, { openid: u }));
    rec(await h.call('submitRun', { mode: 'daily', clientRunId: runId(), dateKey: d.dateKey, actions: acts }, { openid: u }));
    rec(await h.call('getHistory', {}, { openid: u }));
    h.advance(1000);
  }
  const owned = h.db.all('runs')[0].clientRunId;
  const ch = rec(await h.call('createChallenge', { runId: owned }, { openid: OPENIDS[0] }));
  rec(await h.call('getChallenge', { challengeId: ch.challengeId }, { openid: OPENIDS[0] }));
  rec(await h.call('getChallenge', { challengeId: ch.challengeId }, { openid: OPENIDS[1] }));
  rec(await h.call('getReplay', { runId: owned }, { openid: OPENIDS[0] }));
  const b1 = rec(await h.call('getBoard', { kind: 'friend', dateKey: '20261103' }, { openid: OPENIDS[1] }));
  rec(await h.call('getBoard', { kind: 'group', groupRef: g.groupRef, dateKey: '20261103' }, { openid: OPENIDS[1] }));
  rec(await h.call('track', { events: [{ name: 'board_view', props: { x: 1 } }] }, { openid: OPENIDS[0] }));
  for (const r of seen) {
    const text = JSON.stringify(r);
    for (const s of [...OPENIDS, GID]) assert.equal(text.includes(s), false, `leaked ${s} in ${text.slice(0, 120)}`);
    assert.doesNotMatch(allKeys(r).join(','), /openid|openGId|opengid|session_key|appsecret/i);
    assert.equal(allStrings(r).some((s) => /^o[A-Z][a-z]+_SECRET$/.test(s)), false);
  }
  // hashes are per-day: the next day the same user has a different h
  h.setNow(T0 + 86400000);
  await h.call('getDaily', {}, { openid: OPENIDS[1] });
  const b2 = await h.call('getBoard', { kind: 'friend', dateKey: '20261104' }, { openid: OPENIDS[1] });
  assert.notEqual(b1.selfHash, b2.selfHash);
  assert.notEqual(b1.salt, b2.salt);
  // events never hold a group id or groupRef
  assert.doesNotMatch(JSON.stringify(h.db.all('events')), new RegExp(`${GID}|${g.groupRef}`));
});

test('getBoard group: a non-member, a made-up groupRef and a member of ANOTHER group get an error and no rows (AC 61)', async () => {
  await playDaily(h, 'alice');
  const ga = (await h.call('joinGroup', { groupData: { cloudID: 'c', data: { opengid: 'GA', chat_type: 3 } } }, { openid: 'alice' })).groupRef;
  const gb = (await h.call('joinGroup', { groupData: { cloudID: 'c', data: { opengid: 'GB', chat_type: 3 } } }, { openid: 'bob' })).groupRef;
  for (const [who, ref] of [['bob', ga], ['alice', gb], ['alice', '0123456789abcdef'], ['nobody', ga]]) {
    const r = await h.call('getBoard', { kind: 'group', groupRef: ref, dateKey: '20261103' }, { openid: who });
    assert.equal(r.ok, false, `${who} ${ref}`);
    assert.equal(r.rows, undefined);
  }
});

test('board lineups (x) are absent for a caller whose only run is a friendly challenge run (needs a RANKED result)', async () => {
  const challengeId = await dailyChallenge();
  await playDaily(h, 'other');
  const view = await h.call('getChallenge', { challengeId }, { openid: 'cheat' });
  await h.call('submitRun', { mode: 'challenge', clientRunId: runId(), challengeId, actions: bestActions(h.db.all('challenges')[0].rounds) }, { openid: 'cheat' });
  const b = await h.call('getBoard', { kind: 'friend', dateKey: '20261103' }, { openid: 'cheat' });
  assert.equal(b.viewerPlayed, false);
  for (const r of b.rows) assert.equal(r.length, 3);
});

test('no AppSecret, session_key or access_token anywhere in app source (AC: no AppSecret) and no seed-bank file is committed (AC 54)', () => {
  const root = path.join(CF, '..');
  const bad = [];
  const isTracked = (f) => {
    try { return require('child_process').execFileSync('git', ['ls-files', '--', f], { cwd: path.dirname(f) }).toString().trim() !== ''; } catch (_) { return true; }
  };
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (/bank/i.test(e.name) && /\.(json|jsonl|ndjson)$/i.test(e.name)) bad.push('bank file: ' + p);
      if (e.name === 'project.private.config.json') {
        // untracked DevTools-local file: skipped; a tracked one is a leak
        if (isTracked(p)) bad.push('tracked private config: ' + p);
        continue;
      }
      if (!/\.(js|json|md|wxss|wxml)$/.test(e.name) || /\.test\.js$/.test(e.name)) continue;
      let src = fs.readFileSync(p, 'utf8');
      // the public AppID is required in project.config.json ("appid" field only)
      if (e.name === 'project.config.json') src = src.replace(/("appid"\s*:\s*)"wx[0-9a-f]{16}"/g, '$1"<public-appid>"');
      if (/app_?secret\s*[:=]\s*['"][0-9a-f]{16,}|secret\s*[:=]\s*['"][0-9a-f]{32}['"]|access_token\s*[:=]\s*['"]/i.test(src)) bad.push('secret-like: ' + p);
      if (/\bwx[0-9a-f]{16}\b/.test(src) && !/test|touristappid/i.test(p)) bad.push('appid literal: ' + p);
    }
  })(root);
  assert.deepEqual(bad, []);
});

test('every collection a function writes has deny-all rules AND every function config pins TZ and a timeout (AC 28, 66)', () => {
  const rules = JSON.parse(fs.readFileSync(path.join(CF, 'database', 'rules.json'), 'utf8'));
  for (const [k, v] of Object.entries(rules)) if (!k.startsWith('_')) assert.deepEqual(v, { read: false, write: false }, k);
  for (const fn of fs.readdirSync(CF, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(CF, e.name, 'function.config.json')))) {
    const c = JSON.parse(fs.readFileSync(path.join(CF, fn.name, 'function.config.json'), 'utf8'));
    assert.equal(c.envVariables.TZ, 'Asia/Shanghai', fn.name);
    assert.ok(c.timeout >= 5, `${fn.name} timeout ${c.timeout} must be explicit and not the 3 s default`);
  }
});

test('regression BUG-1 chain: nothing before the caller has a ranked daily carries the daily optimum or the sharer lineup', async () => {
  const challengeId = await dailyChallenge();
  const secret = h.db.all('daily_seeds')[0].best.lineup.map((l) => l.generalId);
  const owner = h.db.all('challenges')[0].lineup.map((l) => l.generalId);
  const view = await h.call('getChallenge', { challengeId }, { openid: 'cheat' });
  const clientRunId = runId();
  const res = await h.call('submitRun', { mode: 'challenge', clientRunId, challengeId, actions: bestActions(h.db.all('challenges')[0].rounds) }, { openid: 'cheat' });
  const rep = await h.call('getReplay', { runId: clientRunId }, { openid: 'cheat' });
  const again = await h.call('getChallenge', { challengeId }, { openid: 'cheat' });
  for (const r of [view, res, rep, again]) {
    const text = JSON.stringify(r);
    for (const id of secret) if (!owner.includes(id)) assert.equal(text.includes(id), false, `${id} leaked`);
  }
  assert.equal(rep.ok, false);
  assert.equal(rep.code, 'REPLAY_LOCKED');
  assert.ok(!(res.challengeCompare && res.challengeCompare.theirLineup && res.challengeCompare.theirLineup.length), 'sharer lineup sealed');
  await playDaily(h, 'cheat');
  const open = await h.call('getReplay', { runId: clientRunId }, { openid: 'cheat' });
  assert.equal(open.ok, true, JSON.stringify(open));
});
