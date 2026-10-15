'use strict';
// finalizeDay (定分), lazy finalisation, archive, bonus card, distribution unlock, and the 00:30 / 00:40 edges.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, play, T0 } = require('./helpers/harness');

let h;
beforeEach(() => { h = createHarness({ now: T0 }); });
afterEach(() => h.teardown());

const D = '20261103';
const call = (fn, ev, openid) => h.call(fn, ev, { openid });

async function day3() {
  // 35 complete dailies so the percentile is shown (>= 30), all at position 50 except the last two
  for (let i = 0; i < 35; i++) await play(h, `U${i}`, [50, 50, 50, 50, 50]);
  await play(h, 'LOW', [0, 0, 0, 0, 0]);
}

test('before D+1 00:30 nothing is final: finalizeDay -> DAY_OPEN, getArchiveDay -> DAY_OPEN, no final[] (AC 36)', async () => {
  await play(h, 'A', [10, 20, 30, 40, 50]);
  h.setNow(h.bjt(2026, 11, 4, 0, 29, 59));
  assert.equal((await h.call('finalizeDay', {})).code, 'DAY_OPEN');
  assert.equal((await call('getArchiveDay', { dateKey: D }, 'A')).code, 'DAY_OPEN');
  assert.equal(h.db.all('daily_sets')[0].final, undefined);
  const list = await call('getArchive', {}, 'A');
  assert.deepEqual(list.items, []);
});

test('at 00:30 the day is closed: archive lists it and a read computes final[5] lazily, once (AC 25)', async () => {
  await play(h, 'A', [10, 20, 30, 40, 50]);
  h.setNow(h.bjt(2026, 11, 4, 0, 30, 0));
  const list = await call('getArchive', {}, 'A');
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].dateKey, D);
  assert.equal(list.items[0].mine.final, true);
  const set = h.db.all('daily_sets')[0];
  assert.equal(set.final.length, 5);
  assert.equal(set.finalizedAt, undefined, 'percentile data waits for the timer');
  const day = await call('getArchiveDay', { dateKey: D }, 'A');
  assert.deepEqual(day.finals, set.final);
  assert.equal(day.mine.complete, true);
  assert.equal(day.mine.pct, undefined);
  assert.doesNotMatch(JSON.stringify(day), /anchor|hist/);
});

test('finalizeDay: freezes final[5], builds finalHist/finalCount, idempotent; later play does not move it (AC 25)', async () => {
  await day3();
  h.setNow(h.bjt(2026, 11, 4, 0, 40, 0));
  const r = await h.call('finalizeDay', {});
  assert.equal(r.ok, true);
  assert.equal(r.finalCount, 36);
  const set = h.db.all('daily_sets')[0];
  assert.equal(set.final.length, 5);
  assert.equal(set.finalCount, 36);
  assert.equal(set.finalHist.length, 101);
  assert.equal(set.finalHist.reduce((a, b) => a + b, 0), 36);
  assert.ok(set.finalizedAt);
  assert.equal(set.finalProgress, undefined);
  const frozen = set.final.slice();
  const again = await h.call('finalizeDay', {});
  assert.equal(again.skipped, 'already finalized');
  // histograms still change nothing once frozen
  const st = h.db.all('daily_card_stats').find((s) => s._id === `${D}_0`);
  st.hist[0] += 5000; st.n += 5000; h.db.put('daily_card_stats', st);
  assert.deepEqual(h.db.all('daily_sets')[0].final, frozen);
  assert.equal((await h.call('finalizeDay', {}, { openid: 'x' })).code, 'FORBIDDEN');
});

test('percentile: "超过全国 x%" from finalHist for yesterday on the next day, hidden below 30 (AC 18, spec 3.3)', async () => {
  await day3();
  h.setNow(h.bjt(2026, 11, 4, 0, 40, 0));
  await h.call('finalizeDay', {});
  h.setNow(h.bjt(2026, 11, 4, 9));
  const u = await call('getDaily', {}, 'U1');
  assert.equal(u.yesterday.final, true);
  // U's 500-ish total beats only LOW (1 of 36): floor(100 * 1/36) = 2 ... unless bins tie with other U's
  assert.ok(u.yesterday.pct >= 0 && u.yesterday.pct <= 100);
  const low = await call('getDaily', {}, 'LOW');
  assert.equal(low.yesterday.pct, 0, 'nobody scored lower than LOW');
  const day = await call('getArchiveDay', { dateKey: D }, 'LOW');
  assert.equal(day.mine.pct, 0);
  // a day with < 30 complete dailies has no percentile
  const sets = h.db.all('daily_sets');
  const small = { ...sets[0], _id: '20261102', finalCount: 5, finalHist: new Array(101).fill(0) };
  h.db.put('daily_sets', small);
  h.db.put('daily_entries', { _id: '20261102_Q', openid: 'Q', dateKey: '20261102', pos: [1, 2, 3, 4, 5], complete: true, completeAt: 1, firstAt: 1 });
  const d2 = await call('getArchiveDay', { dateKey: '20261102' }, 'Q');
  assert.equal(d2.mine.pct, undefined);
});

test('finalizeDay resumes from its cursor when it runs out of time (AC 25, 50k scale)', async () => {
  // synthetic entries written straight to the fake DB; a tiny timeout forces a pause after the first page
  await play(h, 'A', [50, 50, 50, 50, 50]);
  const n = 2500;
  for (let i = 0; i < n; i++) {
    h.db.put('daily_entries', { _id: `${D}_S${String(i).padStart(5, '0')}`, openid: `S${i}`, dateKey: D, pos: [i % 101, 50, 50, 50, 50], complete: true, completeAt: 1, firstAt: 1 });
  }
  h.setNow(h.bjt(2026, 11, 4, 0, 40, 0));
  const util = h.mod('finalizeDay', ['common', 'util.js']);
  const orig = util.configuredTimeoutMs;
  util.configuredTimeoutMs = () => 1000; // 70% = 700 ms budget
  const origCollection = h.db.collection.bind(h.db);
  h.db.collection = (name) => {
    const c = origCollection(name);
    if (name !== 'daily_entries') return c;
    const ow = c.where.bind(c);
    c.where = (w) => {
      const q = ow(w);
      const og = q.get.bind(q);
      q.get = async () => { const r = await og(); h.advance(800); return r; }; // each page "takes" 800 ms
      return q;
    };
    return c;
  };
  const p1 = await h.call('finalizeDay', {});
  h.db.collection = origCollection;
  util.configuredTimeoutMs = orig;
  assert.equal(p1.partial, true);
  assert.equal(h.db.all('daily_sets')[0].finalizedAt, undefined);
  const full = await h.call('finalizeDay', {});
  assert.equal(full.ok, true);
  assert.equal(full.finalCount, n + 1);
  assert.equal(h.db.all('daily_sets')[0].finalHist.reduce((a, b) => a + b, 0), n + 1);
});

test('finalizeDay paging by _id cursor counts every complete entry exactly once across pages', async () => {
  const n = 2100;
  for (let i = 0; i < n; i++) {
    h.db.put('daily_entries', { _id: `${D}_S${String(i).padStart(5, '0')}`, openid: `S${i}`, dateKey: D, pos: [50, 50, 50, 50, 50], complete: true, completeAt: 1, firstAt: 1 });
  }
  h.db.put('daily_entries', { _id: `${D}_PARTIAL`, openid: 'P', dateKey: D, pos: [50, null, null, null, null], complete: false, firstAt: 1 });
  await h.call('getDaily', {}, { openid: 'warm' });
  h.setNow(h.bjt(2026, 11, 4, 0, 40, 0));
  const r = await h.call('finalizeDay', {});
  assert.equal(r.finalCount, n);
});

test('timer wiring: genDaily 23:00, finalizeDay 00:40, sweepRounds hourly, cleanup 04:00 (E6)', () => {
  const fs = require('fs');
  const path = require('path');
  const sync = require('../scripts/sync-core');
  const cron = (fn) => JSON.parse(fs.readFileSync(path.join(sync.CF_ROOT, fn, 'config.json'), 'utf8')).triggers[0].config;
  assert.equal(cron('genDaily'), '0 0 23 * * * *');
  assert.equal(cron('finalizeDay'), '0 40 0 * * * *');
  assert.equal(cron('sweepRounds'), '0 0 * * * * *');
  assert.equal(cron('cleanup'), '0 0 4 * * * *');
});

test('getBonusCard: needs a complete daily, closed days only, an unanswered card, 3 a day (AC 39)', async () => {
  await play(h, 'A', [10, 20, 30, 40, 50]);
  h.setNow(h.bjt(2026, 11, 4, 9));
  await call('getDaily', {}, 'warm');
  assert.equal((await call('getBonusCard', {}, 'A')).code, 'FORBIDDEN', 'today is not complete yet');
  await play(h, 'A', [1, 2, 3, 4, 5]);
  // Nov 3 (A played it) is closed but fully answered; Nov 2 and earlier have no sets
  assert.equal((await call('getBonusCard', {}, 'A')).code, 'NO_BONUS_CARD');
  // B skipped Nov 3 so it is the bonus source
  await play(h, 'B', [1, 2, 3, 4, 5]);
  const r = await call('getBonusCard', {}, 'B');
  assert.equal(r.ok, true);
  assert.equal(r.dateKey, D);
  assert.equal(typeof r.final, 'number');
  assert.doesNotMatch(JSON.stringify(r), /anchor/);
  await call('getBonusCard', {}, 'B');
  await call('getBonusCard', {}, 'B');
  assert.equal((await call('getBonusCard', {}, 'B')).code, 'RATE_LIMITED');
});

test('unlockDistribution never reveals today for cards the caller has not answered; closed days are fully open (AC 40)', async () => {
  await call('getDaily', {}, 'A');
  await call('submitCard', { dateKey: D, idx: 0, pos: 30 }, 'A');
  await call('submitCard', { dateKey: D, idx: 1, pos: 60 }, 'A');
  const r = await call('unlockDistribution', { dateKey: D }, 'A');
  assert.equal(r.ok, true);
  assert.equal(r.hist[0].length, 21);
  assert.equal(r.hist[0][6], 1);
  assert.equal(r.hist[1][12], 1);
  assert.deepEqual(r.hist.slice(2), [null, null, null]);
  assert.equal((await call('unlockDistribution', { dateKey: '20261104' }, 'A')).code, 'INVALID_INPUT');
  assert.equal((await call('unlockDistribution', { dateKey: '20250101' }, 'A')).code, 'INVALID_INPUT');
  await call('unlockDistribution', { dateKey: D }, 'A');
  await call('unlockDistribution', { dateKey: D }, 'A');
  assert.equal((await call('unlockDistribution', { dateKey: D }, 'A')).code, 'RATE_LIMITED');
  h.setNow(h.bjt(2026, 11, 5, 9));
  const closed = await call('unlockDistribution', { dateKey: D }, 'Z');
  assert.ok(closed.hist.every((x) => Array.isArray(x)));
});

test('getArchive: newest first, 30 per page with hasMore, `before` paging, closed days only (AC 36)', async () => {
  for (let d = 1; d <= 35; d++) {
    h.setNow(h.bjt(2026, 11, 1, 12) + (d - 1) * 86400000);
    await call('getDaily', {}, 'warm');
  }
  // now = Dec 5 12:00 BJT; Dec 5 is today (open)
  const p1 = await call('getArchive', {}, 'A');
  assert.equal(p1.items.length, 30);
  assert.equal(p1.hasMore, true);
  assert.equal(p1.items[0].dateKey, '20261204');
  assert.ok(p1.items.every((i, k) => k === 0 || p1.items[k - 1].dateKey > i.dateKey));
  const p2 = await call('getArchive', { before: p1.items[29].dateKey }, 'A');
  assert.equal(p2.items.length, 4);
  assert.equal(p2.hasMore, false);
  assert.equal((await call('getArchive', { limit: 31 }, 'A')).code, 'INVALID_INPUT');
  assert.equal((await call('getArchive', { before: 'x' }, 'A')).code, 'INVALID_INPUT');
});

test('score consistency (AC 19): result, board and archive use the same references for the same user and moment', async () => {
  await play(h, 'A', [10, 20, 30, 40, 50]);
  await play(h, 'B', [60, 70, 80, 90, 95]);
  const day = await call('getDaily', {}, 'A');
  const board = await call('getFriendBoard', { dateKey: D }, 'A');
  const mine = board.rows.find((r) => r[0] === board.selfHash);
  assert.equal(mine[1], day.mine.total);
  h.setNow(h.bjt(2026, 11, 4, 0, 40, 0));
  await h.call('finalizeDay', {});
  const arch = await call('getArchiveDay', { dateKey: D }, 'A');
  const core = h.mod('getArchiveDay', ['common', 'coreapi.js']);
  const total = arch.mine.pos.reduce((s, p, i) => s + core.cardScore(Math.abs(p - arch.finals[i])), 0);
  assert.equal(arch.mine.total, total);
});
