'use strict';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { createHarness } = require('./helpers/harness');

const T0 = Date.UTC(2026, 10, 3, 4, 0, 0);
const PEPPER = 'test-pepper-not-a-secret';
let h;
beforeEach(() => {
  h = createHarness({ now: T0 });
  h.setEnv('GROUP_REF_PEPPER', PEPPER);
  h.setEnv('JOINGROUP_RETURN_OPENGID', undefined);
});
afterEach(() => h.teardown());

const join = (openid, data, extra = {}) => h.call('joinGroup', { groupData: { cloudID: 'cid', data }, ...extra }, { openid });

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

test('single chat, wrong chat_type, malformed or undecrypted data are rejected and leave no document (AC 62)', async () => {
  const cases = [
    [{ open_single_roomid: 'ROOM', chat_type: 1 }, 'NOT_GROUP'],
    [{ opengid: 'OG1', chat_type: 1 }, 'NOT_GROUP'],
    [{ opengid: 'OG1', chat_type: 2 }, 'NOT_GROUP'],
    [{ opengid: '', chat_type: 3 }, 'NOT_GROUP'],
    [{ opengid: 123, chat_type: 3 }, 'NOT_GROUP'],
    [{ opengid: 'x'.repeat(200), chat_type: 3 }, 'NOT_GROUP'],
  ];
  for (const [data, code] of cases) {
    const r = await join('userA', data);
    assert.equal(r.ok, false, JSON.stringify(data));
    assert.equal(r.code, code, JSON.stringify(data));
  }
  for (const groupData of [undefined, 'cloudid-string-not-decrypted', { cloudID: 'only' }, { cloudID: 'c', data: 'str' }, null, [1]]) {
    const r = await h.call('joinGroup', { groupData }, { openid: 'userA' });
    assert.equal(r.code, 'BAD_CLOUDID', JSON.stringify(groupData));
  }
  assert.equal(h.db.all('group_members').length, 0);
});

test('identity from the context only; unauthenticated call rejected; pepper must be configured', async () => {
  const r = await join('realUser', { opengid: 'OG1', chat_type: 3 }, { openid: 'forged' });
  assert.equal(r.ok, true);
  assert.equal(h.db.all('group_members')[0].openid, 'realUser');
  assert.equal((await h.call('joinGroup', { groupData: { data: { opengid: 'OG1', chat_type: 3 } } }, {})).code, 'UNAUTHENTICATED');
  h.setEnv('GROUP_REF_PEPPER', undefined);
  const noPepper = await join('u2', { opengid: 'OG2', chat_type: 3 });
  assert.equal(noPepper.code, 'SERVER_CONFIG');
  assert.equal(h.db.all('group_members').filter((d) => d.openid === 'u2').length, 0);
});

test('the groupid route (spike fallback) is off by default and flag-controlled', async () => {
  assert.equal((await join('u', { opengid: 'OG1', chat_type: 3 })).groupid, undefined);
  h.setEnv('JOINGROUP_RETURN_OPENGID', '1');
  assert.equal((await join('u', { opengid: 'OG1', chat_type: 3 })).groupid, 'OG1');
});
