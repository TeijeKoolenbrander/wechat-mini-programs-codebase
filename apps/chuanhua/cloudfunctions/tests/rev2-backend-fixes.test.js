'use strict';
// Rev. 2 QA backend fixes (TD-145..147): retryable BUSY_RETRY, bank in joinRoom, startRoom rolls only new seats, ad clamp 3 / 180.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { roomWorld } = require('./helpers/roomworld');
const sync = require('../scripts/sync-core');
const { applyRemote } = require(path.join(sync.DEFAULT_CORE, 'config'));

const conflict = () => Object.assign(new Error('database.transaction:fail -503000 transaction write conflict'), { errCode: -503000 });

test('store.txn: >= 16 attempts with exponential full-jitter backoff; exhaustion is the retryable BUSY_RETRY, never INTERNAL', async () => {
  const w = await roomWorld({ n: 3 });
  try {
    const db = w.h.db;
    const orig = db.runTransaction.bind(db);
    let calls = 0;
    db.runTransaction = () => {
      calls++;
      return Promise.reject(conflict());
    };
    const realRandom = Math.random;
    Math.random = () => 0; // no waiting: only the count matters here
    let r;
    try {
      r = await w.u.A.call('createRoom', { groupRef: w.u.A.ref });
    } finally {
      Math.random = realRandom;
      db.runTransaction = orig;
    }
    assert.equal(r.ok, false);
    assert.equal(r.code, 'BUSY_RETRY');
    assert.ok(calls >= 16, 'attempts: ' + calls);
    assert.equal(w.rows('rooms').length, 0, 'nothing was written');
    assert.equal((await w.u.A.call('createRoom', { groupRef: w.u.A.ref })).ok, true, 'and the next call works');
  } finally {
    w.teardown();
  }
});

test('QA-R2-4: joinRoom is a bank function: sync-core puts the prompt bank into its folder, lobby-only functions stay bank-free', () => {
  const schema = require(path.join(sync.DEFAULT_CORE, 'schema'));
  assert.equal(schema.FUNCTIONS.joinRoom.bank, true);
  assert.ok(fs.existsSync(path.join(sync.CF_ROOT, 'joinRoom', 'core', 'prompts.js')));
  assert.ok(!fs.existsSync(path.join(sync.CF_ROOT, 'createRoom', 'core', 'prompts.js')));
});

test('startRoom: joins keep landing (4 in a row): the start still succeeds, rolls are 3 each and pairwise disjoint', async () => {
  const w = await roomWorld({ n: 8 });
  try {
    const c = await w.u.A.call('createRoom', { groupRef: w.u.A.ref });
    for (const nm of ['B', 'C', 'D']) await w.u[nm].call('joinRoom', { roomId: c.roomId, groupRef: w.u[nm].ref });
    const db = w.h.db;
    const orig = db.runTransaction.bind(db);
    const later = ['E', 'F', 'G', 'H'];
    let k = 0;
    let busy = false;
    db.runTransaction = async (fn, times) => {
      if (String(fn).includes('newLiveChain') && !busy && k < later.length) {
        busy = true;
        const nm = later[k++];
        await w.u[nm].call('joinRoom', { roomId: c.roomId, groupRef: w.u[nm].ref });
        busy = false;
      }
      return orig(fn, times);
    };
    const out = await w.u.A.call('startRoom', { roomId: c.roomId });
    assert.equal(out.ok, true, JSON.stringify(out));
    const room = w.room(c.roomId);
    assert.equal(room.n, 8);
    const all = [].concat(...room.rolls.map((r) => r.ids));
    assert.equal(new Set(all).size, all.length, 'no prompt twice in the room');
    assert.ok(room.rolls.every((r) => r.ids.length === 3));
  } finally {
    w.teardown();
  }
});

test('QA-R2-10 / AC 104: the remote config can never exceed 3 interstitials a day or go below 180 s apart', () => {
  const r = applyRemote({ ads: { interstitial: { minGapSec: 5, maxPerDay: 99, minLifetimeReveals: 3 } } });
  assert.equal(r.config.ads.interstitial.maxPerDay, 3);
  assert.equal(r.config.ads.interstitial.minGapSec, 180);
  const ok = applyRemote({ ads: { interstitial: { minGapSec: 600, maxPerDay: 2, minLifetimeReveals: 3 } } });
  assert.equal(ok.config.ads.interstitial.maxPerDay, 2);
  assert.equal(ok.config.ads.interstitial.minGapSec, 600);
});

test('QA-R2-10: no 今日起点 leftovers in core', () => {
  for (const f of ['date.js', 'views.js', 'config.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(sync.DEFAULT_CORE, f), 'utf8'), /issueNo|nationalCount/, f);
  }
});
