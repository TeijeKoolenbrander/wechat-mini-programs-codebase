'use strict';
// cleanup: 180-day retention (AC 69, 70), idempotent, storage files deleted with their docs.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./helpers/harness');

let h;
beforeEach(() => { h = createHarness(); });
afterEach(() => h.teardown());

const DAY = 86400000;
function seedAll(oldTs, newTs, oldKey, newKey) {
  const both = (col, mk) => { h.db.put(col, { _id: `old_${col}`, ...mk(oldTs) }); h.db.put(col, { _id: `new_${col}`, ...mk(newTs) }); };
  both('chains', (t) => ({ createdAt: t, lastActivityAt: t, state: 'revealed' }));
  both('steps', (t) => ({ createdAt: t, chainId: 'x', hasFile: true, fileID: `cloud://test-env/${t}.png` }));
  both('mod_traces', (t) => ({ submittedAt: t }));
  both('mod_log', (t) => ({ ts: t, hasFile: true, fileID: `cloud://test-env/${t}.png` }));
  both('reports', (t) => ({ createdAt: t }));
  both('reactions', (t) => ({ createdAt: t }));
  both('sub_grants', (t) => ({ grantedAt: t }));
  both('audit_log', (t) => ({ ts: t }));
  both('events', (t) => ({ ts: t }));
  both('players', (t) => ({ lastActiveAt: t }));
  both('group_stats', (t) => ({ lastActivityAt: t }));
  h.db.put('group_members', { _id: 'old_gm', lastSeen: oldKey });
  h.db.put('group_members', { _id: 'new_gm', lastSeen: newKey });
  h.db.put('rate_limits', { _id: 'old_rl', expireAt: h.now() - 1000 });
  h.db.put('rate_limits', { _id: 'new_rl', expireAt: h.now() + 1000 });
  h.db.put('daily_stats', { _id: '20240101', started: 5 });
  h.db.put('mod_quota', { _id: '20240101', image: 5 });
  h.sdk.files.set(`cloud://test-env/${oldTs}.png`, Buffer.from('old'));
  h.sdk.files.set(`cloud://test-env/${newTs}.png`, Buffer.from('new'));
}

test('cleanup deletes everything older than 180 days (incl. PNGs) and nothing newer; aggregates stay; re-run deletes nothing (AC 69)', async () => {
  const oldTs = h.now() - 181 * DAY;
  const newTs = h.now() - 10 * DAY;
  seedAll(oldTs, newTs, '20260101', '20261020');
  const r = await h.call('cleanup', {});
  assert.equal(r.ok, true);
  for (const col of ['chains', 'steps', 'mod_traces', 'mod_log', 'reports', 'reactions', 'sub_grants', 'audit_log', 'events', 'players', 'group_stats', 'group_members', 'rate_limits']) {
    const id = col === 'group_members' ? 'gm' : col === 'rate_limits' ? 'rl' : col;
    const key = col === 'group_members' ? 'gm' : col === 'rate_limits' ? 'rl' : col;
    assert.equal(h.db.get(col, `old_${key}`), null, `${col} old removed`);
    assert.ok(h.db.get(col, `new_${key}`), `${col} new kept`);
    void id;
  }
  assert.ok(h.db.get('daily_stats', '20240101'), 'aggregates kept');
  assert.ok(h.db.get('mod_quota', '20240101'));
  assert.ok(!h.sdk.files.has(`cloud://test-env/${oldTs}.png`), 'old PNG deleted from storage');
  assert.ok(h.sdk.files.has(`cloud://test-env/${newTs}.png`), 'new PNG kept');
  const again = await h.call('cleanup', {});
  assert.ok(Object.values(again.removed).every((n) => n === 0), JSON.stringify(again.removed));
  assert.ok(Object.values(again.filesDeleted).every((n) => n === 0));
});

test('cleanup deletes files in batches of 50', async () => {
  const oldTs = h.now() - 200 * DAY;
  for (let i = 0; i < 130; i++) {
    const fileID = `cloud://test-env/bulk${i}.png`;
    h.sdk.files.set(fileID, Buffer.from('x'));
    h.db.put('steps', { _id: `bulk${i}`, createdAt: oldTs, chainId: 'x', hasFile: true, fileID });
  }
  await h.call('cleanup', {});
  assert.equal(h.db.all('steps').length, 0);
  assert.equal(h.sdk.files.size, 0);
  assert.ok(h.sdk.calls.deleteFile.every((c) => c.fileList.length <= 50));
  assert.ok(h.sdk.calls.deleteFile.length >= 3);
});

test('cleanup keeps a doc (and its reference) when storage deletion fails, instead of orphaning the file', async () => {
  const oldTs = h.now() - 200 * DAY;
  h.sdk.files.set('cloud://test-env/stuck.png', Buffer.from('x'));
  h.db.put('steps', { _id: 'stuck', createdAt: oldTs, chainId: 'x', hasFile: true, fileID: 'cloud://test-env/stuck.png' });
  h.db.put('steps', { _id: 'nofile', createdAt: oldTs, chainId: 'x' });
  h.sdk.on('deleteFile', async ({ fileList }) => ({ fileList: fileList.map((id) => ({ fileID: id, status: -1, errMsg: 'permission denied' })) }));
  await h.call('cleanup', {});
  assert.ok(h.db.get('steps', 'stuck'), 'kept for the next run');
  assert.equal(h.db.get('steps', 'nofile'), null);
  h.sdk.on('deleteFile', async ({ fileList }) => ({ fileList: fileList.map((id) => { h.sdk.files.delete(id); return { fileID: id, status: 0 }; }) }));
  await h.call('cleanup', {});
  assert.equal(h.db.get('steps', 'stuck'), null);
  assert.equal(h.sdk.files.size, 0);
});

test('abandoned chains (never submitted) are deleted after 1 day (AC 70)', async () => {
  h.db.put('chains', { _id: 'ab_old', state: 'abandoned', createdAt: h.now() - 3 * DAY, lastActivityAt: h.now() - 2 * DAY });
  h.db.put('chains', { _id: 'ab_new', state: 'abandoned', createdAt: h.now() - 3600e3, lastActivityAt: h.now() - 3600e3 });
  h.db.put('chains', { _id: 'open_old', state: 'open', createdAt: h.now() - 3 * DAY, lastActivityAt: h.now() - 2 * DAY });
  await h.call('cleanup', {});
  assert.equal(h.db.get('chains', 'ab_old'), null);
  assert.ok(h.db.get('chains', 'ab_new'));
  assert.ok(h.db.get('chains', 'open_old'));
});

test('cleanup and modSweeper are server-only: a call that carries an OPENID is FORBIDDEN', async () => {
  assert.equal((await h.call('cleanup', {}, { openid: 'oSomeone' })).code, 'FORBIDDEN');
  assert.equal((await h.call('modSweeper', {}, { openid: 'oSomeone' })).code, 'FORBIDDEN');
});

test('author-deleted content: steps lose text/strokes now; the evidence copy lives until day 180 (AC 71)', async () => {
  const oldTs = h.now() - 100 * DAY;
  h.db.put('steps', { _id: 'del', createdAt: oldTs, chainId: 'x', state: 'deleted', strokes: null, text: null, hasFile: true, fileID: 'cloud://test-env/del.png' });
  h.db.put('mod_log', { _id: 'del_1', stepId: 'del', ts: oldTs, kind: 'text', textCopy: '证据', hasFile: false });
  await h.call('cleanup', {});
  assert.ok(h.db.get('mod_log', 'del_1'), 'evidence kept at day 100');
  h.advance(81 * DAY);
  await h.call('cleanup', {});
  assert.equal(h.db.get('mod_log', 'del_1'), null, 'gone after 180 days');
});
