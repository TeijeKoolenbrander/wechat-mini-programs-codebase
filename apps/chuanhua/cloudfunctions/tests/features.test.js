'use strict';
// Updatable invite card (spec 9.4, V7), reveal notices (10.3, V8), joinGroup (9.2, V6), identity, launch date, pagination.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createHarness, cid } = require('./helpers/harness');
const sync = require('../scripts/sync-core');
const { sha256hex } = require(path.join(sync.CF_ROOT, 'common', 'util'));

const P = 'chuanhua_';
const DAY = 86400e3;
const drawing = (k) => ({ v: 1, s: Array.from({ length: k || 3 }, (_, i) => [i % 6, 1, 100 + i * 10, 100, 20, 30, 15, -10]) });
// the client sends the RAW cloudID string; the fake platform decrypts cid-<chat>-<openGId> (M1)
const GD = (g, chat) => ({ cloudID: cid(g, chat) });

async function boot(names, env) {
  const h = createHarness({ env: Object.assign({ ENV_KIND: 'prod', MODERATION_MODE: 'live' }, env || {}) });
  const quiet = console.error;
  console.error = () => {};
  const old = h.teardown;
  h.teardown = () => { console.error = quiet; old(); };
  const us = {};
  for (const n of names) {
    us[n] = { openid: 'openid-' + n };
    await h.call('agreeRules', { version: 2 }, us[n]);
    us[n].ref = (await h.call('joinGroup', GD('group-1'), us[n])).groupRef;
  }
  h.push = async (trace, suggest) => h.call('onMediaCheck', { trace_id: trace, result: { suggest } });
  return { h, us };
}
const apiCalls = (h, api) => h.calls.filter((c) => c.api === api);

test('V7: the activity id is created lazily for participants only, kept for 24 h, recreated after; the feature flag gates it', async () => {
  const { h, us } = await boot(['A', 'B', 'C']);
  try {
    const c = await h.call('createChain', { promptId: 'A01', groupRef: us.A.ref }, us.A);
    assert.equal((await h.call('getChain', { chainId: c.chainId, wantActivity: true }, us.A)).activityId, undefined, 'off by default');
    assert.equal(apiCalls(h, 'updatableMessage.createActivityId').length, 0);
    h.db.put(P + 'app_config', { _id: 'live', features: { updatableCard: true } });
    h.resetCaches();
    const a1 = await h.call('getChain', { chainId: c.chainId, wantActivity: true }, us.A);
    assert.equal(a1.activityId, 'act-1');
    assert.equal((await h.call('getChain', { chainId: c.chainId, wantActivity: true }, us.A)).activityId, 'act-1', 'reused');
    assert.equal(apiCalls(h, 'updatableMessage.createActivityId').length, 1);
    assert.equal((await h.call('getChain', { chainId: c.chainId, groupRef: us.B.ref, wantActivity: true }, us.B)).activityId, undefined, 'not a participant');
    h.advance(25 * 3600e3);
    assert.equal((await h.call('getChain', { chainId: c.chainId, wantActivity: true }, us.A)).activityId, 'act-2', 'recreated after 24 h');
    // a failing platform never breaks the entry
    h.handle('updatableMessage.createActivityId', async () => { throw new Error('down'); });
    h.advance(25 * 3600e3);
    const r = await h.call('getChain', { chainId: c.chainId, wantActivity: true }, us.A);
    assert.equal(r.ok, true);
    assert.equal(r.activityId, undefined);
  } finally { h.teardown(); }
});

test('V7: every pass updates "成员正在加入 n/6" (target_state 0), the reveal sets the final state; a failed update is retried by the sweeper and never blocks', async () => {
  const { h, us } = await boot(['A', 'B', 'C']);
  try {
    h.db.put(P + 'app_config', { _id: 'live', features: { updatableCard: true } });
    h.resetCaches();
    const c = await h.call('createChain', { promptId: 'A01', groupRef: us.A.ref }, us.A);
    await h.call('getChain', { chainId: c.chainId, wantActivity: true }, us.A);
    await h.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: drawing(3) }, us.A);
    assert.equal(apiCalls(h, 'updatableMessage.setUpdatableMsg').length, 0, 'pending: nothing to show yet');
    await h.push('trace-1', 'pass');
    let u = apiCalls(h, 'updatableMessage.setUpdatableMsg');
    assert.equal(u.length, 1);
    assert.deepEqual(u[0].params, { activityId: 'act-1', targetState: 0, templateInfo: { parameterList: [{ name: 'member_count', value: '1' }, { name: 'room_limit', value: '6' }] } });
    // a text pass, with the platform failing: the submit still succeeds
    h.handle('updatableMessage.setUpdatableMsg', async () => { throw new Error('down'); });
    const k = await h.call('claimStep', { chainId: c.chainId, groupRef: us.B.ref }, us.B);
    const s = await h.call('submitStep', { chainId: c.chainId, claimId: k.claimId, text: '一个大饼在天上' }, us.B);
    assert.equal(s.state, 'passed');
    assert.equal(h.db.get(P + 'chains', c.chainId).cardDirty, true);
    assert.ok(h.db.all(P + 'events').some((e) => e.name === 'share_update' && e.props.result === 'error'));
    // the sweeper retries; success clears the flag
    h.handle('updatableMessage.setUpdatableMsg', async () => ({ errCode: 0 }));
    h.advance(5 * 60e3);
    await h.call('modSweeper', {});
    assert.equal(h.db.get(P + 'chains', c.chainId).cardDirty, false);
    u = apiCalls(h, 'updatableMessage.setUpdatableMsg');
    assert.equal(u[u.length - 1].params.templateInfo.parameterList[0].value, '2');
    // reveal: final state, then a removed chain is never updated again
    await h.call('claimStep', { chainId: c.chainId, groupRef: us.C.ref }, us.C);
    const before = apiCalls(h, 'updatableMessage.setUpdatableMsg').length;
    h.db.put(P + 'chains', Object.assign(h.db.get(P + 'chains', c.chainId), { state: 'removed' }));
    h.advance(5 * 60e3);
    await h.call('modSweeper', {});
    assert.equal(apiCalls(h, 'updatableMessage.setUpdatableMsg').length, before, 'AC 64: no updates for a removed chain');
  } finally { h.teardown(); }
});

test('V8: reveal notices use the configured template and field map, one message per grant, sendErrCode on failure, dead chains skipped; running chains wait', async () => {
  const { h, us } = await boot(['A', 'B', 'C', 'D']);
  try {
    h.db.put(P + 'app_config', { _id: 'live', subscribe: { tmplId: 'TPL-1', fields: { title: 'thing9', prompt: 'thing8', time: 'time7' } } });
    h.resetCaches();
    const mk = async (u, prompt) => {
      const c = await h.call('createChain', { promptId: prompt, groupRef: us.A.ref }, u);
      await h.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: drawing(3) }, u);
      h.advance(2 * 60e3);
      await h.call('modSweeper', {});
      const t = apiCalls(h, 'security.mediaCheckAsync').length;
      await h.push('trace-' + t, 'pass');
      return c.chainId;
    };
    const run = await mk(us.A, 'A01'); // keeps running
    const done = await mk(us.A, 'A02');
    const dead = await mk(us.A, 'A03');
    for (const id of [run, done, dead]) {
      await h.call('subscribeReveal', { chainId: id }, us.A);
    }
    await h.call('subscribeReveal', { chainId: done }, us.A); // a second tap is not a second grant
    // finish "done" early: needs 4 passed; do it through the sweeper's expiry instead
    h.db.put(P + 'chains', Object.assign(h.db.get(P + 'chains', done), { passed: 4, expiresAt: h.now() - 1, state: 'open', nextStep: 5 }));
    h.db.put(P + 'chains', Object.assign(h.db.get(P + 'chains', dead), { state: 'removed' }));
    h.advance(5 * 60e3);
    await h.call('modSweeper', {});
    const sent = apiCalls(h, 'subscribeMessage.send');
    assert.equal(sent.length, 1, 'only the revealed chain; the running one waits, the removed one is skipped');
    assert.deepEqual(Object.keys(sent[0].params).sort(), ['data', 'page', 'templateId', 'touser']);
    assert.deepEqual([sent[0].params.templateId, sent[0].params.touser, sent[0].params.page], ['TPL-1', 'openid-A', 'index?r=' + done]);
    assert.deepEqual(Object.keys(sent[0].params.data).sort(), ['thing8', 'thing9', 'time7']);
    assert.equal(sent[0].params.data.thing9.value, '你参与的接龙揭晓了');
    assert.match(sent[0].params.data.time7.value, /^2026年11月0[34]日 \d\d:\d\d$/);
    assert.equal(h.db.get(P + 'sub_grants', done + '_openid-A').used, true);
    assert.equal(h.db.get(P + 'sub_grants', dead + '_openid-A').skipped, 'closed');
    await h.call('modSweeper', {});
    assert.equal(apiCalls(h, 'subscribeMessage.send').length, 1, 'at most one message per grant');
    // a failing send is recorded, not retried (the grant is spent)
    h.db.put(P + 'chains', Object.assign(h.db.get(P + 'chains', run), { passed: 4, expiresAt: h.now() - 1, state: 'open', nextStep: 5 }));
    h.handle('subscribeMessage.send', async () => { throw Object.assign(new Error('43101 user refused'), { errCode: 43101 }); });
    h.advance(5 * 60e3);
    await h.call('modSweeper', {});
    assert.equal(h.db.get(P + 'sub_grants', run + '_openid-A').sendErrCode, 43101);
    await h.call('modSweeper', {});
    assert.equal(apiCalls(h, 'subscribeMessage.send').length, 2, 'not retried');
  } finally { h.teardown(); }
});

test('V6 / M1 joinGroup: the openGId is only ever the server-decrypted value (cloud.getOpenData), never client-chosen; groupRef is the opaque pepper hash; non-groups and bad payloads are refused', async () => {
  const PEPPER = 'pepper-1-0123456789-0123456789-abcdef';
  const { h, us } = await boot(['A'], { GROUP_REF_PEPPER: PEPPER });
  try {
    const A = us.A;
    const r = await h.call('joinGroup', GD('g-open-1'), A);
    assert.equal(r.groupRef, sha256hex(PEPPER + 'g-open-1').slice(0, 16));
    assert.deepEqual(Object.keys(r).sort(), ['groupRef', 'ok']);
    assert.deepEqual(h.state.openDataCalls.slice(-1), [[cid('g-open-1')]], 'one getOpenData call with the raw cloudID');
    const m = h.db.get(P + 'group_members', 'g-open-1_openid-A');
    assert.deepEqual([m.openGId, m.openid, m.groupRef], ['g-open-1', 'openid-A', r.groupRef]);
    const first = m.firstSeen;
    h.advance(5 * DAY);
    await h.call('joinGroup', GD('g-open-1'), A);
    const m2 = h.db.get(P + 'group_members', 'g-open-1_openid-A');
    assert.equal(m2.firstSeen, first);
    assert.equal(m2.lastSeen, h.now());
    assert.equal(h.db.all(P + 'group_members').filter((x) => x.openGId === 'g-open-1').length, 1, 'one row per member');
    // malformed requests never reach the platform
    const calls = h.state.openDataCalls.length;
    for (const bad of [{}, { groupData: 'g1' }, { cloudID: null }, { cloudID: 5 }, { cloudID: '' }, { cloudID: 'short' }, { cloudID: 'has space in it' }, { cloudID: 'x'.repeat(600) }, { cloudID: ['cid-3-g1'] }]) {
      h.advance(61e3); // fresh rate-limit window each time
      assert.equal((await h.call('joinGroup', bad, A)).code, 'BAD_CLOUDID', JSON.stringify(bad));
    }
    assert.equal(h.state.openDataCalls.length, calls, 'no getOpenData call for a malformed request');
    // the platform cannot decrypt it (expired / foreign / errCode item / throws)
    for (const id of ['cid-bad-0000000', 'cid-throw-000000', 'not-a-cid-at-all']) {
      h.advance(61e3);
      assert.equal((await h.call('joinGroup', { cloudID: id }, A)).code, 'BAD_CLOUDID', id);
    }
    // not a group: single chat, unknown chat type, no chat_type at all, over-long openGId
    for (const bad of [GD('grp', 1), GD('grp', 2), GD('grp', 5), GD('x'.repeat(200))]) {
      h.advance(61e3);
      assert.equal((await h.call('joinGroup', bad, A)).code, 'NOT_GROUP', JSON.stringify(bad).slice(0, 80));
    }
    // studio ruling: a payload WITHOUT chat_type is accepted when it carries an opengid; open_single_roomid alone (no opengid) is refused
    h.advance(61e3);
    assert.equal((await h.call('joinGroup', GD('grp', null), A)).ok, true, 'chat_type absent + opengid');
    h.advance(61e3);
    h.state.openData.set('cid-single-room', { cloudID: 'cid-single-room', data: { open_single_roomid: 'room-1' } });
    assert.equal((await h.call('joinGroup', { cloudID: 'cid-single-room' }, A)).code, 'NOT_GROUP', 'open_single_roomid without opengid');
    h.advance(61e3);
    h.state.openData.set('cid-single-room2', { cloudID: 'cid-single-room2', data: { open_single_roomid: 'room-1', chat_type: 1 } });
    assert.equal((await h.call('joinGroup', { cloudID: 'cid-single-room2' }, A)).code, 'NOT_GROUP', 'a single chat');
    h.advance(61e3);
    h.state.openData.set('cid-empty-gid-0', { cloudID: 'cid-empty-gid-0', data: { opengid: '', chat_type: 3 } });
    assert.equal((await h.call('joinGroup', { cloudID: 'cid-empty-gid-0' }, A)).code, 'NOT_GROUP');
    h.state.openData.set('cid-nodata-000', { cloudID: 'cid-nodata-000' });
    assert.equal((await h.call('joinGroup', { cloudID: 'cid-nodata-000' }, A)).code, 'BAD_CLOUDID');
    h.advance(61e3);
    h.state.openData.set('cid-err-0000000', { cloudID: 'cid-err-0000000', errCode: 87009, data: { opengid: 'g-err', chat_type: 3 } });
    assert.equal((await h.call('joinGroup', { cloudID: 'cid-err-0000000' }, A)).code, 'BAD_CLOUDID', 'a truthy errCode is refused even with data');
    assert.equal(h.db.all(P + 'group_members').filter((x) => x.openGId === 'g-err').length, 0);
    assert.equal((await h.call('joinGroup', GD('grp', 4), A)).ok, true, 'WeCom-interop groups count');
    h.advance(61e3);
    h.setEnv('GROUP_REF_PEPPER', undefined);
    assert.equal((await h.call('joinGroup', GD('grp3'), A)).code, 'SERVER_CONFIG', 'no pepper: refuse rather than hash with nothing');
  } finally { h.teardown(); }
});

test('M1 forged payload: a modified client that sends a plain object (event.groupData.data.opengid, or an object as cloudID) cannot join any group, and nothing is written', async () => {
  const { h, us } = await boot(['A']);
  try {
    const A = us.A;
    const before = h.db.all(P + 'group_members').length;
    const callsBefore = h.state.openDataCalls.length;
    const forged = [
      { groupData: { cloudID: 'c', data: { opengid: 'victim-group', chat_type: 3 } } },
      { groupData: { data: { opengid: 'victim-group', chat_type: 3 } } },
      { cloudID: { cloudID: 'cid-3-victim-group', data: { opengid: 'victim-group', chat_type: 3 } } },
      { data: { opengid: 'victim-group', chat_type: 3 } },
      { opengid: 'victim-group', chat_type: 3 },
    ];
    for (const ev of forged) {
      assert.equal((await h.call('joinGroup', ev, A)).code, 'BAD_CLOUDID', JSON.stringify(ev));
    }
    assert.equal(h.db.all(P + 'group_members').length, before, 'nothing was written');
    assert.equal(h.state.openDataCalls.length, callsBefore, 'a forged object never reaches getOpenData');
    // a valid cloudID next to a forged groupData: the forged part is ignored, only the decrypted group counts
    const r = await h.call('joinGroup', { cloudID: cid('real-group'), groupData: { data: { opengid: 'other-group', chat_type: 3 } } }, A);
    assert.equal(r.ok, true);
    assert.equal(h.db.all(P + 'group_members').filter((x) => x.openGId === 'other-group').length, 0);
    assert.equal(h.db.all(P + 'group_members').filter((x) => x.openGId === 'real-group').length, 1, 'the group in the real cloudID');
    assert.equal(h.db.all(P + 'group_members').length, before + 1);
  } finally { h.teardown(); }
});

test('L5 GROUP_REF_PEPPER shorter than 32 characters is refused (SERVER_CONFIG) and 32 is accepted', async () => {
  const { h, us } = await boot(['A'], { GROUP_REF_PEPPER: 'p'.repeat(31) });
  try {
    assert.equal((await h.call('joinGroup', GD('grp1'), us.A)).code, 'SERVER_CONFIG');
    h.setEnv('GROUP_REF_PEPPER', 'p'.repeat(32));
    assert.equal((await h.call('joinGroup', GD('grp1'), us.A)).ok, true);
  } finally { h.teardown(); }
});

test('identity comes only from the context: client functions without an OPENID are UNAUTHENTICATED; an event openid is ignored', async () => {
  const h = createHarness();
  try {
    const schema = require(path.join(sync.DEFAULT_CORE, 'schema'));
    for (const fn of schema.CLIENT_FUNCTIONS) {
      const r = await h.call(fn, { chainId: 'AAAAAAAAAA', openid: 'openid-A' }, {});
      assert.equal(r.code, 'UNAUTHENTICATED', fn);
    }
    await h.call('agreeRules', { version: 2, openid: 'openid-EVIL' }, { openid: 'openid-A' });
    assert.ok(h.db.get(P + 'players', 'openid-A'));
    assert.equal(h.db.get(P + 'players', 'openid-EVIL'), null);
  } finally { h.teardown(); }
});

test('getHome carries no daily prompts, launch key or national counts (F-2, AC 121); there is no meta collection', async () => {
  const h = createHarness();
  try {
    const r = await h.call('getHome', {}, { openid: 'openid-A' });
    assert.equal(r.ok, true);
    for (const k of ['daily', 'launchKey', 'countText']) assert.equal(k in r, false, k);
    assert.equal(h.db.all(P + 'meta').length, 0);
  } finally { h.teardown(); }
});

test('getMyChains pages 20 per page, newest activity first, with a cursor', async () => {
  const { h, us } = await boot(['A']);
  try {
    const A = us.A;
    const ids = [];
    for (let i = 0; i < 25; i++) {
      const c = await h.call('createChain', { promptId: 'A01', groupRef: A.ref }, A);
      await h.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: drawing(3) }, A);
      const p = h.db.get(P + 'players', 'openid-A');
      p.day.starts = 0;
      p.day.steps = 0;
      h.db.put(P + 'players', p);
      ids.push(c.chainId);
      h.advance(61e3);
    }
    const p1 = await h.call('getMyChains', {}, A);
    assert.equal(p1.items.length, 20);
    assert.equal(p1.items[0].chainId, ids[24], 'newest first');
    assert.equal(typeof p1.cursor, 'string');
    const p2 = await h.call('getMyChains', { cursor: p1.cursor }, A);
    assert.equal(p2.items.length, 5);
    assert.equal(p2.cursor, null);
    assert.equal(new Set([...p1.items, ...p2.items].map((x) => x.chainId)).size, 25);
    assert.equal((await h.call('getMyChains', { cursor: 'garbage' }, A)).items.length, 20);
  } finally { h.teardown(); }
});
