'use strict';
// v1 remote config (AC 91-94), subscribe message (AC 84-85), anomaly flags (AC 88), cleanup roll-up (AC 57, 88).
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, bestActions } = require('./helpers/harness');
const { runId, playDaily, startDaily, releaseAll, sheetOf, allKeys, allStrings } = require('./helpers/fixtures');

const T0 = Date.UTC(2026, 10, 3, 4, 0, 0);
const DAY = 86400000;
let h;
beforeEach(() => {
  h = createHarness({ now: T0 });
  h.setEnv('GROUP_REF_PEPPER', 'test-pepper-not-a-secret-0123456789abcdef');
  h.setEnv('SUBSCRIBE_TEMPLATE_ID', undefined);
  h.setEnv('SUBSCRIBE_MP_STATE', undefined);
});
afterEach(() => { delete h.sdk.openapi; h.teardown(); });

const features = async (o = 'u') => (await h.call('getDaily', {}, { openid: o })).features;
const TMPL = 'tmpl_ABCDEFGHIJKLMNOP';

// ---------------- app_config ----------------
test('app_config missing: subscribe hidden, banner off, interstitial defaults, no error (AC 94)', async () => {
  const f = await features();
  assert.equal(f.subscribe, undefined);
  assert.deepEqual(f.ads.banner, { enabled: false, adUnitId: '' });
  assert.deepEqual(f.ads.interstitial, { enabled: true, everyNRuns: 3, minLifetimeRuns: 4, minGapSec: 120, maxPerDay: 5 });
});

test('app_config unreadable: getDaily still works with defaults (AC 94)', async () => {
  const orig = h.db.collection.bind(h.db);
  h.db.collection = (name) => {
    if (name === 'app_config') throw new Error('database unavailable');
    return orig(name);
  };
  const d = await h.call('getDaily', {}, { openid: 'u' });
  assert.equal(d.ok, true);
  assert.equal(d.features.subscribe, undefined);
  assert.equal(d.features.ads.banner.enabled, false);
});

test('app_config values are read, validated and clamped (AC 91, 92); the field map is never sent to clients', async () => {
  h.db.put('app_config', {
    _id: 'live',
    subscribe: { tmplId: TMPL, fields: { title: 'thing9', time: 'time2' } },
    ads: {
      banner: { enabled: true, adUnitId: 'adunit-abc123' },
      interstitial: { enabled: true, everyNRuns: 1, minLifetimeRuns: 0, minGapSec: 5, maxPerDay: 99 },
    },
  });
  const f = await features();
  assert.deepEqual(f.subscribe, { tmplId: TMPL });
  assert.deepEqual(f.ads.banner, { enabled: true, adUnitId: 'adunit-abc123' });
  assert.deepEqual(f.ads.interstitial, { enabled: true, everyNRuns: 2, minLifetimeRuns: 2, minGapSec: 60, maxPerDay: 8 });
  assert.doesNotMatch(JSON.stringify(f), /thing9/);
});

test('app_config garbage falls back to defaults: banner needs enabled === true AND a sane unit id', async () => {
  h.db.put('app_config', {
    _id: 'live',
    subscribe: { tmplId: 'x y' },
    ads: { banner: { enabled: 'yes', adUnitId: 5 }, interstitial: { everyNRuns: 'three', maxPerDay: -1, enabled: 'no' } },
  });
  const f = await features();
  assert.equal(f.subscribe, undefined);
  assert.deepEqual(f.ads.banner, { enabled: false, adUnitId: '' });
  assert.deepEqual(f.ads.interstitial, { enabled: true, everyNRuns: 3, minLifetimeRuns: 4, minGapSec: 120, maxPerDay: 0 });
  h.db.put('app_config', { _id: 'live', ads: { banner: { enabled: true, adUnitId: '' } } });
  await new Promise((r) => setTimeout(r, 0));
  h.advance(61000); // past the 60 s cache
  assert.equal((await features()).ads.banner.enabled, false, 'enabled without an ad unit id stays off');
});

test('app_config is cached for 60 s; the SUBSCRIBE_TEMPLATE_ID env var is the fallback template id', async () => {
  assert.equal((await features()).subscribe, undefined);
  h.db.put('app_config', { _id: 'live', subscribe: { tmplId: TMPL } });
  h.advance(30000);
  assert.equal((await features()).subscribe, undefined, 'cached');
  h.advance(31000);
  assert.deepEqual((await features()).subscribe, { tmplId: TMPL });
  h.db.put('app_config', { _id: 'live' });
  h.setEnv('SUBSCRIBE_TEMPLATE_ID', 'env_template_id_123');
  h.advance(61000);
  assert.deepEqual((await features()).subscribe, { tmplId: 'env_template_id_123' });
});

// ---------------- subscribe message ----------------
async function ownerChallenge() {
  const r = await playDaily(h, 'owner');
  assert.equal(r.ok, true);
  const c = await h.call('createChallenge', { runId: h.db.all('runs')[0].clientRunId }, { openid: 'owner' });
  return c.challengeId;
}
function mockSend() {
  const sent = [];
  h.sdk.openapi = { subscribeMessage: { send: async (m) => { sent.push(m); return { errCode: 0 }; } } };
  return sent;
}
const answer = (challengeId, openid, rank = 1) => {
  const acts = bestActions(h.db.all('challenges')[0].rounds, { rank });
  return h.call('submitRun', { mode: 'challenge', clientRunId: runId(), challengeId, actions: acts }, { openid });
};

test('subscribeChallenge: NO_TEMPLATE without config; NOT_OWNER for others; idempotent; template comes from the server', async () => {
  const id = await ownerChallenge();
  assert.equal((await h.call('subscribeChallenge', { challengeId: id }, { openid: 'owner' })).code, 'NO_TEMPLATE');
  assert.equal(h.db.all('sub_grants').length, 0);
  h.setEnv('SUBSCRIBE_TEMPLATE_ID', TMPL);
  assert.equal((await h.call('subscribeChallenge', { challengeId: id }, { openid: 'friend' })).code, 'NOT_OWNER');
  const a = await h.call('subscribeChallenge', { challengeId: id, tmplId: 'evil_template_id_1' }, { openid: 'owner' });
  assert.deepEqual(a, { ok: true, granted: true });
  const b = await h.call('subscribeChallenge', { challengeId: id }, { openid: 'owner' });
  assert.deepEqual(b, { ok: true, granted: true });
  const g = h.db.all('sub_grants');
  assert.equal(g.length, 1);
  assert.deepEqual([g[0]._id, g[0].ownerOpenid, g[0].tmplId, g[0].used], [id, 'owner', TMPL, false]);
  assert.equal((await h.call('subscribeChallenge', { challengeId: 'AAAAAAAA' }, { openid: 'owner' })).code, 'CHALLENGE_EXPIRED');
  assert.equal((await h.call('subscribeChallenge', { challengeId: 'bad' }, { openid: 'owner' })).code, 'INVALID_ACTIONS');
  assert.equal((await h.call('subscribeChallenge', { challengeId: id }, {})).code, 'UNAUTHENTICATED');
  const own = await h.call('getChallenge', { challengeId: id }, { openid: 'owner' });
  assert.deepEqual(own.subscribe, { granted: true });
});

test('first answer sends exactly one subscribe message; later answers send nothing; no identity in it (AC 85)', async () => {
  h.setEnv('SUBSCRIBE_TEMPLATE_ID', TMPL);
  h.setEnv('SUBSCRIBE_MP_STATE', 'trial');
  const sent = mockSend();
  const id = await ownerChallenge();
  await h.call('subscribeChallenge', { challengeId: id }, { openid: 'owner' });
  const res = await answer(id, 'friend');
  assert.equal(res.ok, true);
  assert.equal(sent.length, 1);
  const m = sent[0];
  assert.equal(m.touser, 'owner');
  assert.equal(m.templateId, TMPL);
  assert.equal(m.page, `index?c=${id}`);
  assert.equal(m.miniprogramState, 'trial');
  const vals = Object.values(m.data).map((x) => x.value);
  assert.ok(vals.includes('好友接下了你的战书'));
  assert.ok(vals.includes(`${res.record.w}胜${res.record.l}负`));
  assert.ok(vals.some((v) => /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(v)), 'time field');
  assert.deepEqual(Object.keys(m.data).sort(), ['thing1', 'thing2', 'thing3', 'time4']);
  assert.doesNotMatch(JSON.stringify(m.data), /friend|owner/);
  const g = h.db.all('sub_grants')[0];
  assert.equal(g.used, true);
  assert.ok(g.sentAt);
  await answer(id, 'friend2', 2);
  await answer(id, 'friend', 3); // same answerer again
  assert.equal(sent.length, 1);
  assert.equal(h.db.all('events').filter((e) => e.name === 'subscribe_send').length, 1);
});

test('two parallel first answers send at most one message (transactional claim)', async () => {
  h.setEnv('SUBSCRIBE_TEMPLATE_ID', TMPL);
  const sent = mockSend();
  const id = await ownerChallenge();
  await h.call('subscribeChallenge', { challengeId: id }, { openid: 'owner' });
  const rs = await Promise.all([answer(id, 'f1', 1), answer(id, 'f2', 2), answer(id, 'f3', 3)]);
  assert.ok(rs.every((r) => r.ok));
  assert.equal(sent.length, 1);
});

test('no grant, or no template configured: nothing is sent, nothing errors (degrades silently)', async () => {
  const sent = mockSend();
  const id = await ownerChallenge();
  const r = await answer(id, 'friend');
  assert.equal(r.ok, true);
  assert.equal(sent.length, 0);
  assert.equal(h.db.all('sub_grants').length, 0);
});

test('openapi missing/failing: sendErrCode is stored, the submitRun response is unchanged (edge 29)', async () => {
  h.setEnv('SUBSCRIBE_TEMPLATE_ID', TMPL);
  const id = await ownerChallenge();
  await h.call('subscribeChallenge', { challengeId: id }, { openid: 'owner' });
  h.setEnv('SUBSCRIBE_TEMPLATE_ID', undefined); // template removed from config before the answer
  h.sdk.openapi = { subscribeMessage: { send: async () => { const e = new Error('invalid template'); e.errCode = 43101; throw e; } } };
  const res = await answer(id, 'friend');
  assert.equal(res.ok, true);
  assert.equal(res.ranked, false);
  const g = h.db.all('sub_grants')[0];
  assert.equal(g.used, true);
  assert.equal(g.sendErrCode, '43101');
  assert.equal(g.sentAt, undefined);
  assert.doesNotMatch(JSON.stringify(res), /43101|sub_grants|tmpl/);
});

test('a hanging send is cut off after 2 s and does not block the response beyond that', async () => {
  h.setEnv('SUBSCRIBE_TEMPLATE_ID', TMPL);
  const id = await ownerChallenge();
  await h.call('subscribeChallenge', { challengeId: id }, { openid: 'owner' });
  h.sdk.openapi = { subscribeMessage: { send: () => new Promise(() => {}) } };
  const t = Date.now;
  const t0 = process.hrtime.bigint();
  const res = await answer(id, 'friend');
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(res.ok, true);
  assert.ok(ms < 6000, `took ${ms} ms`);
  assert.equal(h.db.all('sub_grants')[0].sendErrCode, 'TIMEOUT');
  assert.equal(Date.now, t);
});

// ---------------- anomalies ----------------
test('mismatch / fast / invalid_ranked flags: one document per (run, kind), deterministic _id, observe-only (AC 88)', async () => {
  const s = await startDaily(h, 'u');
  const id = runId();
  const r = await h.call('submitRun', { mode: 'daily', clientRunId: id, dateKey: s.dateKey, actions: s.actions, clientRecord: { w: 12, l: 0 } }, { openid: 'u' });
  assert.equal(r.ok, true);
  const kinds = h.db.all('anomalies').map((a) => a.kind).sort();
  assert.deepEqual(kinds, r.record.w === 12 ? ['fast'] : ['fast', 'mismatch']);
  const fast = h.db.all('anomalies').find((a) => a.kind === 'fast');
  assert.equal(fast._id, `u_${id}_fast`);
  assert.equal(fast.openid, 'u');
  // the same run with and without flags has an identical response (idempotent resubmission)
  const again = await h.call('submitRun', { mode: 'daily', clientRunId: id, dateKey: s.dateKey, actions: s.actions }, { openid: 'u' });
  assert.deepEqual(again, r);
  assert.equal(h.db.all('anomalies').length, kinds.length, 'no duplicate flags');
  // a slow run raises no fast flag
  const s2 = await startDaily(h, 'slow');
  h.advance(60000);
  await h.call('submitRun', { mode: 'daily', clientRunId: runId(), dateKey: s2.dateKey, actions: s2.actions }, { openid: 'slow' });
  assert.equal(h.db.all('anomalies').filter((a) => a.openid === 'slow').length, 0);
});

test('mismatch: a tampered clientRecord is flagged and changes nothing else', async () => {
  const s = await startDaily(h, 'u');
  const claimed = { w: 12, l: 0 };
  const probe = await playDaily(h, 'probe');
  const wrong = probe.record.w === 12 ? { w: 0, l: 12 } : claimed;
  const r = await h.call('submitRun', { mode: 'daily', clientRunId: runId(), dateKey: s.dateKey, actions: s.actions, clientRecord: wrong }, { openid: 'u' });
  assert.equal(r.ok, true);
  const f = h.db.all('anomalies').find((a) => a.kind === 'mismatch' && a.openid === 'u');
  if (r.record.w !== wrong.w) {
    assert.ok(f);
    assert.deepEqual(f.detail, { client: wrong, server: r.record });
    assert.equal(h.db.all('runs').find((x) => x.openid === 'u').mismatch, true);
  }
  assert.equal(h.db.all('daily_results').find((x) => x.openid === 'u').w, r.record.w, 'server record is authoritative');
});

test('player_stats.suspect turns true at >= 5 flags within 7 days and never changes a response (manual review only)', async () => {
  const { flag } = require(require('path').join(h.root, 'getDaily', 'common', 'anomaly.js'));
  await h.call('getDaily', {}, { openid: 'u' }); // binds the fake db context
  const { sheetOf: _s } = require('./helpers/fixtures');
  assert.ok(_s);
  const { call } = h;
  assert.ok(call);
  for (let i = 0; i < 4; i++) await flag('u', `r${i}`, '20261103', 'mismatch', {});
  assert.equal(h.db.all('player_stats')[0].suspect, false);
  assert.equal(h.db.all('player_stats')[0].flags7d, 4);
  await flag('u', 'r4', '20261103', 'fast', {});
  assert.equal(h.db.all('player_stats')[0].suspect, true);
  assert.equal(h.db.all('player_stats')[0].flags7d, 5);
  // a suspect player still plays normally, ranks normally and keeps the streak
  const r = await playDaily(h, 'u');
  assert.equal(r.ok, true);
  assert.equal(r.ranked, true);
  assert.equal(h.db.all('daily_results').length, 1);
  assert.equal(h.db.all('player_stats')[0].suspect, true);
});

test('flags older than 7 days leave the rolling window', async () => {
  const { flag } = require(require('path').join(h.root, 'getDaily', 'common', 'anomaly.js'));
  await h.call('getDaily', {}, { openid: 'u' }); // binds the fake db context
  for (let i = 0; i < 4; i++) await flag('u', `old${i}`, '20261103', 'mismatch', {});
  h.advance(8 * DAY);
  await flag('u', 'new1', '20261111', 'mismatch', {});
  assert.equal(h.db.all('player_stats')[0].flags7d, 1);
  assert.equal(h.db.all('player_stats')[0].suspect, false);
});

// ---------------- cleanup: roll-up and retention ----------------
test('cleanup roll-up: yesterday\'s runs and flags by kind -> one anomaly_daily event; [ALERT] when mismatch > 0.5%', async () => {
  const errs = [];
  const orig = console.error;
  console.error = (...a) => errs.push(a.join(' '));
  try {
    h.setNow(Date.UTC(2026, 10, 3, 16, 0, 1)); // 00:00:01 BJT on the 4th; yesterday = the 3rd
    const y0 = Date.UTC(2026, 10, 3, 4, 0, 0);
    for (let i = 0; i < 100; i++) h.db.put('runs', { _id: `r${i}`, submittedAt: y0 + i });
    h.db.put('runs', { _id: 'rOld', submittedAt: y0 - 2 * DAY });
    h.db.put('anomalies', { _id: 'a1', kind: 'mismatch', ts: y0 });
    h.db.put('anomalies', { _id: 'a2', kind: 'mismatch', ts: y0 + 5 });
    h.db.put('anomalies', { _id: 'a3', kind: 'prefix', ts: y0 + 5 });
    h.db.put('anomalies', { _id: 'a4', kind: 'fast', ts: y0 - 2 * DAY });
    const r = await h.call('cleanup', {}, {});
    assert.equal(r.ok, true);
    const ev = h.db.all('events').filter((e) => e.name === 'anomaly_daily');
    assert.equal(ev.length, 1);
    assert.deepEqual(
      { d: ev[0].props.dateKey, runs: ev[0].props.runs, m: ev[0].props.mismatch, p: ev[0].props.prefix, f: ev[0].props.fast, i: ev[0].props.invalid_ranked, alert: ev[0].props.alert },
      { d: '20261103', runs: 100, m: 2, p: 1, f: 0, i: 0, alert: true },
    );
    assert.ok(errs.some((e) => /\[ALERT\].*mismatch/.test(e)));
    await h.call('cleanup', {}, {});
    assert.equal(h.db.all('events').filter((e) => e.name === 'anomaly_daily').length, 1, 'idempotent per date');
  } finally { console.error = orig; }
});

test('cleanup roll-up: at or below 0.5% mismatch there is no alert', async () => {
  h.setNow(Date.UTC(2026, 10, 3, 16, 0, 1));
  const y0 = Date.UTC(2026, 10, 3, 4, 0, 0);
  for (let i = 0; i < 200; i++) h.db.put('runs', { _id: `r${i}`, submittedAt: y0 + i });
  h.db.put('anomalies', { _id: 'a1', kind: 'mismatch', ts: y0 });
  await h.call('cleanup', {}, {});
  const ev = h.db.all('events').find((e) => e.name === 'anomaly_daily');
  assert.equal(ev.props.alert, false);
  assert.equal(ev.props.mismatchRate, 0.005);
});

test('180-day retention covers the v1 collections', async () => {
  const old = T0 - 181 * DAY;
  const fresh = T0 - 10 * DAY;
  h.db.put('daily_progress', { _id: 'old_p', updatedAt: old });
  h.db.put('daily_progress', { _id: 'new_p', updatedAt: fresh });
  h.db.put('sub_grants', { _id: 'old_g', grantedAt: old });
  h.db.put('sub_grants', { _id: 'new_g', grantedAt: fresh });
  h.db.put('anomalies', { _id: 'old_a', kind: 'fast', ts: old });
  h.db.put('anomalies', { _id: 'new_a', kind: 'fast', ts: fresh });
  h.db.put('player_stats', { _id: 'old_s', updatedAt: old });
  h.db.put('player_stats', { _id: 'new_s', updatedAt: fresh });
  h.db.put('app_config', { _id: 'live' });
  const r = await h.call('cleanup', {}, {});
  const ids = (c) => h.db.all(c).map((d) => d._id);
  assert.deepEqual(ids('daily_progress'), ['new_p']);
  assert.deepEqual(ids('sub_grants'), ['new_g']);
  assert.deepEqual(ids('anomalies'), ['new_a']);
  assert.deepEqual(ids('player_stats'), ['new_s']);
  assert.deepEqual(ids('app_config'), ['live'], 'config is never purged');
  assert.equal(r.removed.daily_progress + r.removed.sub_grants + r.removed.anomalies + r.removed.player_stats, 4);
});

test('rules: every new collection is deny-all', () => {
  const rules = require('../database/rules.json');
  for (const c of ['player_stats', 'daily_progress', 'sub_grants', 'anomalies', 'app_config']) {
    assert.deepEqual(rules[c], { read: false, write: false }, c);
  }
});

test('function configs for the new functions pin TZ and an explicit timeout; submitRun may send subscribe messages', () => {
  const fs = require('fs');
  const path = require('path');
  const CF = path.join(__dirname, '..');
  for (const fn of ['getRound', 'getHistory', 'subscribeChallenge']) {
    const c = JSON.parse(fs.readFileSync(path.join(CF, fn, 'function.config.json'), 'utf8'));
    assert.equal(c.envVariables.TZ, 'Asia/Shanghai');
    assert.ok(c.timeout >= 5);
  }
  const perm = JSON.parse(fs.readFileSync(path.join(CF, 'submitRun', 'config.json'), 'utf8'));
  assert.deepEqual(perm.permissions.openapi, ['subscribeMessage.send']);
});

test('responses of the new functions never contain openids', async () => {
  h.setEnv('SUBSCRIBE_TEMPLATE_ID', TMPL);
  const OID = 'oWho_SECRET';
  const s = await startDaily(h, OID);
  const res = await h.call('submitRun', { mode: 'daily', clientRunId: runId(), dateKey: s.dateKey, actions: s.actions }, { openid: OID });
  const c = await h.call('createChallenge', { runId: h.db.all('runs')[0].clientRunId }, { openid: OID });
  const out = [res, c,
    await h.call('getHistory', {}, { openid: OID }),
    await h.call('getDaily', {}, { openid: OID }),
    await h.call('subscribeChallenge', { challengeId: c.challengeId }, { openid: OID }),
    await h.call('getChallenge', { challengeId: c.challengeId }, { openid: OID }),
    await h.call('getBoard', { kind: 'friend', dateKey: s.dateKey }, { openid: OID })];
  for (const o of out) {
    assert.equal(JSON.stringify(o).includes(OID), false);
    assert.equal(allKeys(o).some((k) => /openid/i.test(k)), false);
    assert.equal(allStrings(o).includes(OID), false);
  }
  assert.ok(releaseAll && sheetOf);
});
