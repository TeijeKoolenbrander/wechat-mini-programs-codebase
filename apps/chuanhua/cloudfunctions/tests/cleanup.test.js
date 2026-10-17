'use strict';
// cleanup (spec 7.5, AC 69, 70, PO-19): 180-day retention including cloud-storage PNGs, 1-day removal of abandoned chains,
// author deletion keeps evidence until day 180, idempotent, server-only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./helpers/harness');

const P = 'chuanhua_';
const DAY = 86400e3;
const drawing = { v: 1, s: [[0, 1, 100, 100, 50, 50, 20, 20]] };

function seedOld(h, ageDays, tag) {
  const t = h.now() - ageDays * DAY;
  const cid = 'CHAIN' + tag;
  const fid = 'cloud://test-env.bucket/chuanhua/mod/202601/' + cid + '/1_1.png';
  const fid2 = 'cloud://test-env.bucket/chuanhua/mod/202601/' + cid + '/3_1.png';
  h.files.set(fid, Buffer.from('png1'));
  h.files.set(fid2, Buffer.from('png2'));
  h.db.put(P + 'chains', { _id: cid, state: 'revealed', createdAt: t, lastActivityAt: t, expiresAt: t + 2 * DAY, participants: ['p'], stepIds: [null, cid + '_1_1', null, cid + '_3_1'], revealViewed: [] });
  h.db.put(P + 'steps', { _id: cid + '_1_1', chainId: cid, n: 1, state: 'passed', fileID: fid, createdAt: t, mod: { submittedAt: t } });
  h.db.put(P + 'steps', { _id: cid + '_3_1', chainId: cid, n: 3, state: 'deleted', fileID: fid2, createdAt: t, mod: { submittedAt: t } });
  h.db.put(P + 'mod_traces', { _id: 'tr-' + tag, stepId: cid + '_1_1', fileID: fid, submittedAt: t, mock: false, done: true });
  h.db.put(P + 'mod_log', { _id: cid + '_1_1_0', stepId: cid + '_1_1', ts: t, suggest: 'pass' });
  h.db.put(P + 'reports', { _id: 'rep-' + tag, createdAt: t, state: 'open' });
  h.db.put(P + 'reactions', { _id: 'rx-' + tag, createdAt: t });
  h.db.put(P + 'sub_grants', { _id: 'sg-' + tag, grantedAt: t, used: true });
  h.db.put(P + 'audit_log', { _id: 'au-' + tag, ts: t });
  h.db.put(P + 'events', { _id: 'ev-' + tag, ts: t });
  return { cid, files: [fid, fid2] };
}
const count = (h) => Object.fromEntries(['chains', 'steps', 'mod_traces', 'mod_log', 'reports', 'reactions', 'sub_grants', 'audit_log', 'events', 'players', 'group_members', 'group_stats', 'rate_limits', 'daily_stats', 'mod_quota'].map((c) => [c, h.db.all(P + c).length]));

test('AC 69: deletes chains, steps, PNG files, traces, logs, reports, reactions, grants, audit entries and events older than 180 days; keeps newer data and daily_stats; re-running deletes nothing new', async () => {
  const h = createHarness({ env: { ENV_KIND: 'prod', MODERATION_MODE: 'live' } });
  try {
    const old = seedOld(h, 181, 'OLD');
    const edge = seedOld(h, 179, 'NEW');
    const t = h.now();
    h.db.put(P + 'players', { _id: 'p-old', lastActiveAt: t - 181 * DAY });
    h.db.put(P + 'players', { _id: 'p-new', lastActiveAt: t - 179 * DAY });
    h.db.put(P + 'group_members', { _id: 'g_old', lastSeen: t - 181 * DAY });
    h.db.put(P + 'group_members', { _id: 'g_new', lastSeen: t - 10 * DAY });
    h.db.put(P + 'group_stats', { _id: 'gs-old', lastActivityAt: t - 181 * DAY });
    h.db.put(P + 'group_stats', { _id: 'gs-new', lastActivityAt: t - 1 * DAY });
    h.db.put(P + 'rate_limits', { _id: 'rl-old', expireAt: t - 1000 });
    h.db.put(P + 'rate_limits', { _id: 'rl-new', expireAt: t + 3600e3 });
    h.db.put(P + 'daily_stats', { _id: '20250101', started: 5, revealed: 2, byPrompt: {} });
    h.db.put(P + 'mod_quota', { _id: '20250101', text: 1, image: 2, errors: 0, calls: {} });
    h.db.put(P + 'mod_quota', { _id: '20261101', text: 1, image: 2, errors: 0, calls: {} });
    const before = count(h);
    const r = await h.call('cleanup', {});
    assert.equal(r.ok, true, JSON.stringify(r));
    const after = count(h);
    assert.deepEqual(h.db.all(P + 'chains').map((c) => c._id), [edge.cid]);
    assert.deepEqual(h.db.all(P + 'steps').map((c) => c._id).sort(), [edge.cid + '_1_1', edge.cid + '_3_1']);
    for (const f of old.files) assert.equal(h.files.has(f), false, 'PNG deleted ' + f);
    for (const f of edge.files) assert.equal(h.files.has(f), true, 'newer PNG kept');
    for (const c of ['mod_traces', 'mod_log', 'reports', 'reactions', 'sub_grants', 'audit_log', 'events']) assert.equal(after[c], 1, c);
    assert.deepEqual(h.db.all(P + 'players').map((p) => p._id), ['p-new']);
    assert.deepEqual(h.db.all(P + 'group_members').map((p) => p._id), ['g_new']);
    assert.deepEqual(h.db.all(P + 'group_stats').map((p) => p._id), ['gs-new']);
    assert.deepEqual(h.db.all(P + 'rate_limits').map((p) => p._id), ['rl-new']);
    assert.equal(after.daily_stats, 1, 'aggregate daily_stats is kept');
    assert.deepEqual(h.db.all(P + 'mod_quota').map((p) => p._id), ['20261101']);
    assert.ok(before.chains > after.chains);
    assert.equal(r.removed.chains, 1);
    assert.equal(r.removed.steps, 2);
    assert.equal(r.removed.files, 2);
    // idempotent
    const r2 = await h.call('cleanup', {});
    assert.deepEqual(count(h), after);
    assert.ok(Object.values(r2.removed).every((n) => n === 0), JSON.stringify(r2.removed));
    // 180 days later the "new" data goes too, with its PNG files
    h.advance(2 * DAY);
    await h.call('cleanup', {});
    assert.equal(h.db.all(P + 'chains').length, 0);
    assert.equal(h.files.size, 0);
  } finally { h.teardown(); }
});

test('AC 70: abandoned chains are deleted after 1 day, not before; running chains are never touched', async () => {
  const h = createHarness({ env: { ENV_KIND: 'dev', MODERATION_MODE: 'mock' } });
  try {
    const A = { openid: 'openid-A' };
    await h.call('agreeRules', { version: 2 }, A);
    const c1 = await h.call('createChain', { promptId: 'A01' }, A);
    await h.call('releaseClaim', { chainId: c1.chainId, claimId: c1.claim.claimId }, A); // abandoned now
    const c2 = await h.call('createChain', { promptId: 'A02' }, A);
    await h.call('submitStep', { chainId: c2.chainId, claimId: c2.claim.claimId, strokes: drawing }, A); // a live chain
    assert.equal(h.db.get(P + 'chains', c1.chainId).state, 'abandoned');
    await h.call('cleanup', {});
    assert.ok(h.db.get(P + 'chains', c1.chainId), 'younger than a day: kept');
    h.advance(DAY - 1000 * 60);
    await h.call('cleanup', {});
    assert.ok(h.db.get(P + 'chains', c1.chainId));
    h.advance(2 * 60e3);
    await h.call('cleanup', {});
    assert.equal(h.db.get(P + 'chains', c1.chainId), null, 'abandoned for more than a day: deleted');
    assert.ok(h.db.get(P + 'chains', c2.chainId), 'a running chain is untouched');
    assert.equal(h.db.get(P + 'steps', c2.chainId + '_1_1').state, 'pending');
  } finally { h.teardown(); }
});

test('AC 71: author deletion removes strokes/text now but the mod_log evidence and the PNG stay until day 180', async () => {
  const h = createHarness({ env: { ENV_KIND: 'dev', MODERATION_MODE: 'mock' } });
  try {
    const A = { openid: 'openid-A' };
    await h.call('agreeRules', { version: 2 }, A);
    const c = await h.call('createChain', { promptId: 'A01' }, A);
    await h.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: drawing }, A);
    h.advance(2 * 60e3);
    await h.call('modSweeper', {});
    const sid = c.chainId + '_1_1';
    const file = h.db.get(P + 'steps', sid).fileID;
    assert.equal((await h.call('deleteMyStep', { chainId: c.chainId, step: 1 }, A)).count, 1);
    const st = h.db.get(P + 'steps', sid);
    assert.deepEqual([st.state, st.strokes, st.text], ['deleted', undefined, undefined]);
    assert.ok(h.files.has(file), 'the evidence PNG stays');
    assert.ok(h.db.all(P + 'mod_log').some((m) => m.stepId === sid), 'the evidence log stays');
    h.advance(179 * DAY);
    await h.call('cleanup', {});
    assert.ok(h.files.has(file), 'still inside 180 days');
    h.advance(2 * DAY);
    await h.call('cleanup', {});
    assert.equal(h.files.has(file), false);
    assert.equal(h.db.get(P + 'steps', sid), null);
    assert.equal(h.db.all(P + 'mod_log').length, 0);
  } finally { h.teardown(); }
});

test('a failing storage delete keeps the documents that reference the files (retried tomorrow); an upload whose step never committed is cleaned through its trace', async () => {
  const h = createHarness({ env: { ENV_KIND: 'prod', MODERATION_MODE: 'live' } });
  const quiet = console.error;
  console.error = () => {};
  try {
    const old = seedOld(h, 200, 'X');
    h.files.set('cloud://test-env.bucket/orphan.png', Buffer.from('x'));
    h.db.put(P + 'mod_traces', { _id: 'tr-orphan', stepId: 'gone_1_1', fileID: 'cloud://test-env.bucket/orphan.png', submittedAt: h.now() - 200 * DAY, mock: false, done: false });
    h.state.failDelete = true;
    const r = await h.call('cleanup', {});
    assert.equal(r.ok, false);
    assert.ok(h.db.get(P + 'chains', old.cid), 'nothing is removed while its PNGs cannot be');
    assert.equal(h.db.all(P + 'steps').length, 2);
    h.state.failDelete = false;
    const r2 = await h.call('cleanup', {});
    assert.equal(r2.ok, true);
    assert.equal(h.db.all(P + 'chains').length, 0);
    assert.equal(h.files.size, 0, 'including the orphan upload');
  } finally { console.error = quiet; h.teardown(); }
});

test('cleanup is server-only: a client call is FORBIDDEN and deletes nothing', async () => {
  const h = createHarness();
  try {
    seedOld(h, 200, 'Y');
    const r = await h.call('cleanup', {}, { openid: 'openid-A' });
    assert.equal(r.code, 'FORBIDDEN');
    assert.equal(h.db.all(P + 'chains').length, 1);
  } finally { h.teardown(); }
});
