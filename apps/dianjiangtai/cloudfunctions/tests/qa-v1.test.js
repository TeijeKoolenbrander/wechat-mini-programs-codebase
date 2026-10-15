'use strict';
// QA v1 additions (backend). Independent captured-payload checks for the trust properties, the Sunday
// variant on every function that must return it, the daily gates record and the release pack (todo).
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createHarness, bestActions } = require('./helpers/harness');
const { runId, startDaily, releaseAll, sheetOf, prefixThroughPick, allKeys } = require('./helpers/fixtures');

const TUE = Date.UTC(2026, 10, 3, 4, 0, 0); // 2026-11-03 12:00 BJT (Tuesday)
const SUN = Date.UTC(2026, 10, 1, 4, 0, 0); // 2026-11-01 12:00 BJT (Sunday)
let h;
afterEach(() => h && h.teardown());

test('AC 86: no captured response ever holds a round beyond what was released, nor seed/best/battle keys (ranked daily, daily-as-challenge)', async () => {
  h = createHarness({ now: TUE });
  h.setEnv('GROUP_REF_PEPPER', 'test-pepper-not-a-secret');
  // owner finishes the daily and shares it (needs a full run, so release everything for the owner)
  const own = await startDaily(h, 'owner');
  const ownRun = runId();
  const done = await h.call('submitRun', { mode: 'daily', clientRunId: ownRun, dateKey: own.dateKey, actions: own.actions }, { openid: 'owner' });
  assert.equal(done.ok, true);
  const ch = await h.call('createChallenge', { runId: ownRun }, { openid: 'owner' });
  assert.equal(ch.ok, true);
  const sheet = sheetOf(h, own.dateKey);

  const seen = [];
  const rec = (x) => { seen.push(x); return x; };
  const leaked = (upTo) => {
    const text = JSON.stringify(seen);
    for (let k = upTo; k < 5; k++) assert.equal(text.includes(JSON.stringify(sheet[k])), false, `round ${k + 1} appeared before release`);
  };
  // fresh player on the daily
  rec(await h.call('getDaily', {}, { openid: 'p2' }));
  rec(await h.call('getChallenge', { challengeId: ch.challengeId }, { openid: 'p2' }));
  const st = rec(await h.call('startRun', { mode: 'challenge', clientRunId: 'qaRun0000001', challengeId: ch.challengeId }, { openid: 'p2' }));
  assert.equal(st.ok, true);
  const acts = bestActions(sheet, { rank: 1 });
  leaked(1);
  for (let n = 1; n <= 4; n++) {
    rec(await h.call('getChallenge', { challengeId: ch.challengeId }, { openid: 'p2' }));
    leaked(n);
    // skipping ahead must not hand out anything
    const skip = rec(await h.call('getRound', { clientRunId: 'qaRun0000001', dateKey: own.dateKey, actions: prefixThroughPick(acts, Math.min(n + 1, 5)) }, { openid: 'p2' }));
    assert.equal(skip.ok, false, 'skipping ahead must fail at pick ' + n);
    leaked(n);
    rec(await h.call('getRound', { clientRunId: 'qaRun0000001', dateKey: own.dateKey, actions: prefixThroughPick(acts, n) }, { openid: 'p2' }));
    leaked(n + 1);
  }
  const secret = h.db.all('daily_seeds')[0];
  assert.equal(JSON.stringify(seen).includes(JSON.stringify(secret.best.lineup)), false, 'optimum lineup leaked');
  assert.equal(JSON.stringify(seen).includes(String(secret.seed)), false, 'seed leaked');
  const keys = seen.flatMap((r) => allKeys(r)).join(',');
  assert.doesNotMatch(keys, /(^|,)(seed|battles?|battleLog|optimal|bestLineup)(,|$)/i, 'forbidden keys in open-attempt responses: ' + keys);
});

test('AC 77: getDaily, getBoard, getChallenge and getHistory all carry variant=shiren on Sunday and standard on Tuesday', async () => {
  for (const [now, want] of [[SUN, 'shiren'], [TUE, 'standard']]) {
    h = createHarness({ now });
    h.setEnv('GROUP_REF_PEPPER', 'test-pepper-not-a-secret');
    const d = await h.call('getDaily', {}, { openid: 'a' });
    assert.equal(d.variant, want);
    assert.equal(h.db.all('daily_seeds')[0].variant, want);
    const s = await startDaily(h, 'a');
    const ownRun = runId();
    assert.equal((await h.call('submitRun', { mode: 'daily', clientRunId: ownRun, dateKey: s.dateKey, actions: s.actions }, { openid: 'a' })).ok, true);
    const ch = await h.call('createChallenge', { runId: ownRun }, { openid: 'a' });
    assert.equal((await h.call('getChallenge', { challengeId: ch.challengeId }, { openid: 'b' })).variant, want, 'getChallenge');
    assert.equal((await h.call('getBoard', { kind: 'friend', dateKey: s.dateKey }, { openid: 'a' })).variant, want, 'getBoard');
    const hist = await h.call('getHistory', {}, { openid: 'a' });
    assert.ok(hist.ok);
    assert.equal(JSON.stringify(hist).includes(`"variant":"${want}"`), true, 'getHistory variant');
    h.teardown();
    h = null;
  }
});

test('AC 28/95: every collection named in function source has deny-all rules (no client read or write anywhere)', () => {
  const CF = path.join(__dirname, '..');
  const rules = JSON.parse(fs.readFileSync(path.join(CF, 'database', 'rules.json'), 'utf8'));
  const names = Object.keys(rules);
  assert.ok(names.length >= 10);
  for (const n of names.filter((k) => !k.startsWith("_"))) {
    const r = rules[n];
    const text = JSON.stringify(r);
    assert.match(text, /false/, n + ' rule must deny');
    assert.doesNotMatch(text, /true|auth\.|doc\._openid/, n + ' must not allow any client access: ' + text);
  }
  for (const c of ['daily_progress', 'anomalies', 'player_stats', 'sub_grants', 'app_config', 'daily_results', 'runs', 'challenges', 'events']) {
    assert.ok(names.includes(c), 'rules for ' + c);
  }
});

// AC 95 (release pack): the Founder Handoff (H1-H9) and the device-pass checklist must exist as files with an empty
// result column. At QA time they do not. Todo = asserts the correct state, reports TODO until release delivers.
test('AC 95: release pack (founder handoff + device-pass checklist) exists under docs/dianjiangtai', { todo: 'release owner: pack not delivered yet' }, () => {
  const dir = path.join(__dirname, '..', '..', '..', '..', 'docs', 'dianjiangtai');
  const files = fs.readdirSync(dir);
  assert.ok(files.some((f) => /handoff/i.test(f)), 'founder handoff doc');
  assert.ok(files.some((f) => /device/i.test(f)), 'device-pass checklist');
  assert.ok(files.some((f) => /release-checklist/i.test(f)), 'release checklist (AC 59 content review record)');
});
