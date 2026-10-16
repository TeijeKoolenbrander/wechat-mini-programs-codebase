'use strict';
// joinGroup (spec 9.2, 11.3) after the M1 hardening: the client sends the RAW cloudID string and the server resolves it with
// cloud.getOpenData. L5: the pepper must be >= 32 characters.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createHarness } = require('./helpers/harness');

const T0 = Date.UTC(2026, 10, 3, 4, 0, 0);
const PEPPER = 'test-pepper-not-a-secret-0123456789abcdef';
let h;
beforeEach(() => {
  h = createHarness({ now: T0 });
  h.setEnv('GROUP_REF_PEPPER', PEPPER);
  h.setEnv('JOINGROUP_RETURN_OPENGID', undefined);
});
afterEach(() => h.teardown());

/** register `data` as the decrypted payload of a fresh cloudID and join with it */
let seq = 0;
const join = (openid, data, extra = {}) => {
  const cloudID = 'cid-payload-' + (seq += 1);
  h.openData[cloudID] = data;
  return h.call('joinGroup', { cloudID, ...extra }, { openid });
};

test('valid group data: one group_members doc _id <openGId>_<openid>, opaque groupRef (AC 62)', async () => {
  const r = await join('userA', { opengid: 'OG123', chat_type: 3, group_openid: 'x' });
  assert.equal(r.ok, true);
  assert.equal(r.groupRef, crypto.createHash('sha256').update('OG123' + PEPPER).digest('hex').slice(0, 16));
  assert.notEqual(r.groupRef, 'OG123');
  assert.deepEqual(Object.keys(r).sort(), ['groupRef', 'ok']);
  const docs = h.db.all('group_members');
  assert.equal(docs.length, 1);
  assert.equal(docs[0]._id, 'OG123_userA');
  assert.equal(docs[0].openGId, 'OG123');
  assert.equal(docs[0].openid, 'userA');
  assert.equal(docs[0].groupRef, r.groupRef);
  assert.equal(docs[0].firstSeen, '20261103');
});

test('repeat entries are idempotent and refresh lastSeen only', async () => {
  const a = await join('userA', { opengid: 'OG123', chat_type: 3 });
  h.setNow(T0 + 2 * 86400000);
  const b = await join('userA', { opengid: 'OG123', chat_type: 3 });
  assert.equal(a.groupRef, b.groupRef);
  const docs = h.db.all('group_members');
  assert.equal(docs.length, 1);
  assert.equal(docs[0].firstSeen, '20261103');
  assert.equal(docs[0].lastSeen, '20261105');
  await join('userB', { opengid: 'OG123', chat_type: 3 });
  assert.equal(h.db.all('group_members').length, 2);
  // concurrent first entries still make one document
  await Promise.all([1, 2, 3].map(() => join('userC', { opengid: 'OG9', chat_type: 4 })));
  assert.equal(h.db.all('group_members').filter((d) => d.openid === 'userC').length, 1);
});

test('M1: the server resolves the RAW cloudID with cloud.getOpenData({list:[cloudID]}) and uses only what it returns', async () => {
  const cid = h.groupCloudID('real-group-1');
  // event.groupData / any extra field the client adds is never read
  const forgedExtra = { groupData: { cloudID: 'x', data: { opengid: 'someone-elses-group', chat_type: 3 } }, opengid: 'someone-elses-group' };
  const ok = await h.call('joinGroup', { cloudID: cid, ...forgedExtra }, { openid: 'member' });
  assert.equal(ok.ok, true);
  assert.deepEqual(h.openDataCalls, [[cid]], 'exactly one lookup, the cloudID as a list of one');
  assert.deepEqual(h.db.all('group_members').map((m) => m._id), ['real-group-1_member']);
});

test('M1: forged objects (the shape the OLD server trusted) are rejected with BAD_CLOUDID and nothing is written or looked up', async () => {
  const forged = { cloudID: 'whatever', data: { opengid: 'real-group-1', chat_type: 3 } };
  const payloads = [
    { groupData: forged },
    { cloudID: forged },
    { groupData: forged, cloudID: forged },
    { cloudID: ['cid-aaaaaaaa'], groupData: forged },
    { cloudID: { toString: () => 'cid-aaaaaaaa' } },
    { cloudID: 12345678 },
    { cloudID: null },
    { cloudID: '' },
    { cloudID: 'short' }, // < 8 chars
    { cloudID: 'x'.repeat(513) }, // > 512
    { cloudID: 'has spaces in it 12345' },
    { cloudID: 'cid-with-<script>-12345' },
    { cloudID: '{"data":{"opengid":"g"}}' },
    { groupData: 'cid-real-group-1' },
    {},
  ];
  for (const payload of payloads) {
    const r = await h.call('joinGroup', payload, { openid: 'attacker' });
    assert.deepEqual([r.ok, r.code], [false, 'BAD_CLOUDID'], JSON.stringify(payload).slice(0, 80));
  }
  assert.equal(h.db.all('group_members').length, 0);
  assert.deepEqual(h.openDataCalls, [], 'a malformed cloudID never reaches the platform');
});

test('M1: a made-up or expired cloudID (the platform answers errCode) is BAD_CLOUDID; a thrown platform error too', async () => {
  const fake = await h.call('joinGroup', { cloudID: 'cid-made-up-by-attacker' }, { openid: 'attacker' });
  assert.equal(fake.code, 'BAD_CLOUDID');
  assert.deepEqual(h.openDataCalls, [['cid-made-up-by-attacker']]);
  assert.equal(h.db.all('group_members').length, 0);
  const real = h.sdk.getOpenData;
  try {
    h.sdk.getOpenData = async () => { throw new Error('platform down'); };
    assert.equal((await h.call('joinGroup', { cloudID: 'cid-any-valid' }, { openid: 'u' })).code, 'BAD_CLOUDID');
    h.sdk.getOpenData = async () => ({ list: [] });
    assert.equal((await h.call('joinGroup', { cloudID: 'cid-any-valid' }, { openid: 'u' })).code, 'BAD_CLOUDID');
    h.sdk.getOpenData = async () => ({ list: [{ data: { opengid: 'g' } }, { data: { opengid: 'g2' } }] });
    assert.equal((await h.call('joinGroup', { cloudID: 'cid-any-valid' }, { openid: 'u' })).code, 'BAD_CLOUDID', 'wrong list size');
    h.sdk.getOpenData = undefined;
    assert.equal((await h.call('joinGroup', { cloudID: 'cid-any-valid' }, { openid: 'u' })).code, 'SERVER_CONFIG');
  } finally { h.sdk.getOpenData = real; }
  assert.equal(h.db.all('group_members').length, 0);
});

test('M1: payload cases. data must be a plain object with a falsy errCode; opengid 1-128 chars; chat_type absent/null or 3/4', async () => {
  const rawItem = (item) => {
    const real = h.sdk.getOpenData;
    h.sdk.getOpenData = async ({ list }) => ({ list: [typeof item === 'function' ? item(list[0]) : item] });
    return () => { h.sdk.getOpenData = real; };
  };
  const cases = [
    ['errCode on the entry, data present', (id) => ({ cloudID: id, errCode: -601006, data: { opengid: 'g', chat_type: 3 } }), 'BAD_CLOUDID'],
    ['errcode (lower case) on the entry', (id) => ({ cloudID: id, errcode: 1, data: { opengid: 'g', chat_type: 3 } }), 'BAD_CLOUDID'],
    ['a foreign cloudID in the entry', () => ({ cloudID: 'cid-someone-else', data: { opengid: 'g', chat_type: 3 } }), 'BAD_CLOUDID'],
    ['data is a string', (id) => ({ cloudID: id, data: '{"opengid":"g"}' }), 'BAD_CLOUDID'],
    ['data is an array', (id) => ({ cloudID: id, data: [{ opengid: 'g' }] }), 'BAD_CLOUDID'],
    ['data is null', (id) => ({ cloudID: id, data: null }), 'BAD_CLOUDID'],
    ['no data', (id) => ({ cloudID: id }), 'BAD_CLOUDID'],
    ['the entry is not an object', () => 'cid', 'BAD_CLOUDID'],
  ];
  for (const [name, item, code] of cases) {
    const restore = rawItem(item);
    try {
      const r = await h.call('joinGroup', { cloudID: 'cid-case-valid-1' }, { openid: 'u' });
      assert.deepEqual([name, r.ok, r.code], [name, false, code]);
    } finally { restore(); }
  }
  const data = [
    ['single chat (chat_type 1)', { opengid: 'g1', chat_type: 1 }, 'NOT_GROUP'],
    ['single room only (open_single_roomid, no opengid)', { open_single_roomid: 'room-1' }, 'NOT_GROUP'],
    ['single room and chat_type 1', { open_single_roomid: 'room-1', chat_type: 1 }, 'NOT_GROUP'],
    ['single room with a group chat_type but no opengid', { open_single_roomid: 'room-1', chat_type: 3 }, 'NOT_GROUP'],
    ['chat_type 0', { opengid: 'g1', chat_type: 0 }, 'NOT_GROUP'],
    ['chat_type 2', { opengid: 'g1', chat_type: 2 }, 'NOT_GROUP'],
    ['chat_type 5', { opengid: 'g1', chat_type: 5 }, 'NOT_GROUP'],
    ['chat_type a word', { opengid: 'g1', chat_type: 'group' }, 'NOT_GROUP'],
    ['chat_type 3.5', { opengid: 'g1', chat_type: 3.5 }, 'NOT_GROUP'],
    ['no opengid', { chat_type: 3 }, 'NOT_GROUP'],
    ['empty opengid', { opengid: '', chat_type: 3 }, 'NOT_GROUP'],
    ['opengid not a string', { opengid: { a: 1 }, chat_type: 3 }, 'NOT_GROUP'],
    ['opengid a number', { opengid: 123, chat_type: 3 }, 'NOT_GROUP'],
    ['opengid 129 chars', { opengid: 'x'.repeat(129), chat_type: 3 }, 'NOT_GROUP'],
    ['empty payload', {}, 'NOT_GROUP'],
  ];
  for (const [name, d, code] of data) {
    const r = await join('u', d);
    assert.deepEqual([name, r.ok, r.code], [name, false, code]);
  }
  assert.equal(h.db.all('group_members').length, 0);
  const good = [
    ['group', { opengid: 'g-3', chat_type: 3 }],
    ['wecom group', { opengid: 'g-4', chat_type: 4 }],
    ['chat_type as a numeric string', { opengid: 'g-s', chat_type: '3' }],
    ['chat_type absent', { opengid: 'g-absent' }],
    ['chat_type null', { opengid: 'g-null', chat_type: null }],
    ['opengid 1 char', { opengid: 'g' }],
    ['opengid 128 chars', { opengid: 'y'.repeat(128), chat_type: 3 }],
    ['opengid with a single-room key too', { opengid: 'g-both', open_single_roomid: 'r' }],
  ];
  for (const [name, d] of good) assert.equal((await join('u', d)).ok, true, name);
  assert.equal(h.db.all('group_members').length, good.length);
});

test('M1: the source of joinGroup never reads event.groupData', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'joinGroup', 'index.js'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/groupData/.test(code));
  assert.ok(/getOpenData/.test(code));
});

test('identity from the context only; unauthenticated call rejected', async () => {
  const cid = h.groupCloudID('OG1');
  const r = await h.call('joinGroup', { cloudID: cid, openid: 'forged', OPENID: 'forged' }, { openid: 'realUser' });
  assert.equal(r.ok, true);
  assert.equal(h.db.all('group_members')[0].openid, 'realUser');
  const un = await h.callRaw('joinGroup', { cloudID: cid }, {});
  assert.equal(un.code, 'UNAUTHENTICATED');
  assert.equal(h.db.all('group_members').length, 1);
});

test('L5: the pepper must be configured and at least 32 characters', async () => {
  const cid = h.groupCloudID('OG2');
  for (const bad of [undefined, '', 'short', 'x'.repeat(31), 'test-pepper-not-a-secret']) {
    h.setEnv('GROUP_REF_PEPPER', bad);
    const r = await h.call('joinGroup', { cloudID: cid }, { openid: 'u2' });
    assert.deepEqual([bad, r.code], [bad, 'SERVER_CONFIG']);
  }
  assert.equal(h.db.all('group_members').filter((d) => d.openid === 'u2').length, 0);
  h.setEnv('GROUP_REF_PEPPER', 'x'.repeat(32));
  assert.equal((await h.call('joinGroup', { cloudID: cid }, { openid: 'u2' })).ok, true);
});

test('the groupid route (spike fallback) is off by default and flag-controlled', async () => {
  assert.equal((await join('u', { opengid: 'OG1', chat_type: 3 })).groupid, undefined);
  h.setEnv('JOINGROUP_RETURN_OPENGID', '1');
  assert.equal((await join('u', { opengid: 'OG1', chat_type: 3 })).groupid, 'OG1');
});
