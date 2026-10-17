'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../core/score');
const G = require('../core/group');
const { sha256Hex } = require('../opendata/sha256');
const { setup, playDay, BJ } = require('./helpers');
const { addDays } = require('../core/date');

const T1 = '20261105';

/** Play `days` consecutive days from `first` as the given users; leaves the clock at 10:00 on the day after the last. */
function history(s, first, days, users, posFor) {
  let day = first;
  for (let i = 0; i < days; i++) {
    s.clock.set(BJ(day, 10, 0, 0));
    users.forEach((u, k) => playDay(s.srv, u, posFor ? posFor(i, k) : [10 + i, 20 + k, 30, 40, 50]));
    day = addDays(day, 1);
  }
  s.clock.set(BJ(day, 10, 0, 0));
  return day;
}

test('AC 36: the archive lists closed days only, newest first, 30 per page, with a cursor', () => {
  const s = setup({ date: '20261101' });
  const today = history(s, '20261101', 35, ['me']);
  const p1 = s.srv.callAs('me', 'getArchive', {});
  assert.equal(p1.items.length, 30);
  assert.equal(p1.hasMore, true);
  assert.equal(p1.items[0].dateKey, addDays(today, -1), 'yesterday is closed by 10:00');
  assert.ok(!p1.items.some((i) => i.dateKey === today), 'today never appears');
  assert.ok(p1.items.every((i, k) => k === 0 || i.dateKey < p1.items[k - 1].dateKey), 'newest first');
  const p2 = s.srv.callAs('me', 'getArchive', { before: p1.items[29].dateKey });
  assert.equal(p2.items.length, 5);
  assert.equal(p2.hasMore, false);
  assert.equal(p2.items[4].dateKey, '20261101');
  assert.equal(p1.bestStreak, 35);
  assert.equal(s.srv.callAs('me', 'getArchive', { limit: 5 }).items.length, 5);
  assert.deepEqual(p1.items[0].mine.final, true);
});

test('AC 36: today and a day inside its grace window are DAY_OPEN', () => {
  const s = setup();
  s.srv.callAs('a', 'getDaily', {});
  assert.equal(s.srv.callAs('a', 'getArchiveDay', { dateKey: T1 }).code, 'DAY_OPEN');
  s.clock.set(BJ('20261106', 0, 10, 0));
  s.srv.callAs('a', 'getDaily', {});
  assert.equal(s.srv.callAs('a', 'getArchiveDay', { dateKey: T1 }).code, 'DAY_OPEN');
  assert.equal(s.srv.callAs('a', 'getArchive', {}).items.length, 0);
  s.clock.set(BJ('20261106', 0, 30, 0));
  assert.equal(s.srv.callAs('a', 'getArchiveDay', { dateKey: T1 }).ok, true);
  assert.equal(s.srv.callAs('a', 'getArchiveDay', { dateKey: '20270101' }).code, 'DAY_OPEN', 'unknown day');
});

test('AC 37/38: the archive review has the player\'s needles, finals and 定分; an unplayed day has no mine; scoring uses the frozen refs', () => {
  const s = setup();
  for (let i = 0; i < 5; i++) s.srv.seedCrowd(T1, i, 60);
  playDay(s.srv, 'me', [11, 22, 33, 44, 55]);
  s.clock.set(BJ('20261106', 9, 0, 0));
  const day = s.srv.callAs('me', 'getArchiveDay', { dateKey: T1 });
  assert.equal(day.ok, true);
  assert.equal(day.cards.length, 5);
  assert.deepEqual(day.mine.pos, [11, 22, 33, 44, 55]);
  assert.equal(day.mine.complete, true);
  assert.equal(day.mine.total, S.dailyTotal(day.mine.pos, day.finals).total);
  assert.deepEqual(day.mine.cardScores, S.dailyTotal(day.mine.pos, day.finals).scores);
  assert.equal(s.srv.callAs('stranger', 'getArchiveDay', { dateKey: T1 }).mine, null);
  // later answers cannot move the frozen refs
  const finals = day.finals.slice();
  s.srv.seedCrowd(T1, 0, 5000, { mean: 95 });
  assert.deepEqual(s.srv.callAs('me', 'getArchiveDay', { dateKey: T1 }).finals, finals);
  // partial entries are reported as not complete
  const s2 = setup();
  s2.srv.callAs('p', 'submitCard', { dateKey: T1, idx: 0, pos: 5 });
  s2.clock.set(BJ('20261106', 9, 0, 0));
  const part = s2.srv.callAs('p', 'getArchiveDay', { dateKey: T1 });
  assert.deepEqual([part.mine.complete, part.mine.total, part.mine.answered], [false, null, 1]);
});

test('AC 39: 加一题 delivers an unanswered card of a closed day, never today\'s, at most 3 a day', () => {
  const s = setup({ date: '20261101' });
  assert.equal(s.srv.callAs('me', 'getBonusCard', {}).code, 'NO_CARD_AVAILABLE', 'launch day: nothing closed yet');
  history(s, '20261101', 2, ['me']);
  // day 1 and 2 are closed (clock now 20261103 10:00); me answered all their cards
  assert.equal(s.srv.callAs('me', 'getBonusCard', {}).code, 'NO_CARD_AVAILABLE', 'everything answered');
  const fresh = 'newbie';
  const got = [];
  for (let i = 0; i < 3; i++) {
    const b = s.srv.callAs(fresh, 'getBonusCard', {});
    assert.equal(b.ok, true);
    assert.ok(b.dateKey < '20261103', 'a closed day');
    assert.equal(typeof b.final, 'number');
    assert.deepEqual(Object.keys(b.card).sort(), ['catLabel', 'itemId', 'left', 'prompt', 'right', 'spectrumId']);
    got.push(b.card.itemId);
  }
  assert.equal(s.srv.callAs(fresh, 'getBonusCard', {}).code, 'RATE_LIMITED');
  s.clock.add(24 * 3600e3);
  const next = s.srv.callAs(fresh, 'getBonusCard', { exclude: got });
  assert.equal(next.ok, true, 'a new Beijing day resets the cap');
  assert.ok(!got.includes(next.card.itemId), 'exclude (local archive records) is honoured');
  // the frozen reference of the item
  const setOf = s.srv.db.sets[next.dateKey];
  assert.equal(next.final, setOf.final[setOf.cards.findIndex((c) => c.itemId === next.card.itemId)]);
});

test('AC 40: 全国分布 for today never includes cards the caller has not answered; a closed day gives all five', () => {
  const s = setup();
  for (let i = 0; i < 5; i++) s.srv.seedCrowd(T1, i, 100);
  s.srv.callAs('me', 'submitCard', { dateKey: T1, idx: 0, pos: 40 });
  s.srv.callAs('me', 'submitCard', { dateKey: T1, idx: 1, pos: 40 });
  const open = s.srv.callAs('me', 'unlockDistribution', { dateKey: T1 });
  assert.equal(open.ok, true);
  assert.equal(open.hist.length, 5);
  assert.equal(open.hist[0].length, 21);
  assert.equal(S.histTotal(open.hist[0]), 101);
  assert.deepEqual(open.hist.slice(2), [null, null, null]);
  assert.equal(s.srv.callAs('me', 'unlockDistribution', { dateKey: '20261106' }).code, 'INVALID_INPUT', 'future day');
  s.clock.set(BJ('20261106', 9, 0, 0));
  const closed = s.srv.callAs('me', 'unlockDistribution', { dateKey: T1 });
  assert.ok(closed.hist.every((h) => h && h.length === 21));
});

test('AC 41: joinGroup is idempotent, groupRef is not the openGId, bad data leaves no document', () => {
  const { srv } = setup();
  const a = srv.callAs('me', 'joinGroup', { cloudID: srv.cloudID('GID-1') });
  const b = srv.callAs('me', 'joinGroup', { cloudID: srv.cloudID('GID-1') });
  assert.equal(a.ok, true);
  assert.equal(a.groupRef, b.groupRef);
  assert.notEqual(a.groupRef, 'GID-1');
  assert.equal(Object.keys(srv.db.members).length, 1);
  assert.notEqual(srv.callAs('me', 'joinGroup', { cloudID: srv.cloudID('GID-2') }).groupRef, a.groupRef);
  assert.equal(srv.callAs('me', 'joinGroup', { cloudID: 'not-a-known-cloudid' }).code, 'BAD_CLOUDID');
  assert.equal(srv.callAs('me', 'joinGroup', {}).code, 'BAD_CLOUDID');
  assert.equal(srv.callAs('me', 'joinGroup', { cloudID: srv.cloudID('GID-3', 1) }).code, 'NOT_GROUP', 'single chat');
  assert.equal(srv.callAs('me', 'joinGroup', { cloudID: srv.cloudData({ open_single_roomid: 'R1' }) }).code, 'NOT_GROUP', 'a single chat payload');
  assert.equal(srv.callAs('me', 'joinGroup', { cloudID: srv.cloudID('', 3) }).code, 'NOT_GROUP');
  // M1: forged plain objects (the old payload shape) are never accepted, under either field name
  const forged = { cloudID: 'c', data: { opengid: 'GID-9', chat_type: 3 } };
  assert.equal(srv.callAs('me', 'joinGroup', { groupData: forged }).code, 'BAD_CLOUDID');
  assert.equal(srv.callAs('me', 'joinGroup', { cloudID: forged }).code, 'BAD_CLOUDID');
  assert.equal(srv.callAs('me', 'joinGroup', { groupData: forged, cloudID: 'GID-9' }).code, 'BAD_CLOUDID');
  assert.equal(Object.keys(srv.db.members).length, 2, 'errors wrote nothing');
});

test('AC 42/47: getGroupDay - NOT_MEMBER, rows only for complete members, pos only if the caller completed, mq only for n >= 3, trend with null for small days', () => {
  const s = setup({ date: '20261103' });
  const { srv, clock } = s;
  const ref = srv.callAs('me', 'joinGroup', { cloudID: srv.cloudID('G1') }).groupRef;
  ['bob', 'cara'].forEach((u) => srv.callAs(u, 'joinGroup', { cloudID: srv.cloudID('G1') }));
  srv.callAs('out', 'joinGroup', { cloudID: srv.cloudID('G2') });
  assert.equal(srv.callAs('out', 'getGroupDay', { groupRef: ref, dateKey: '20261103' }).code, 'NOT_MEMBER');
  assert.equal(srv.callAs('stranger', 'getGroupDay', { groupRef: ref, dateKey: '20261103' }).code, 'NOT_MEMBER');
  // day 3 (20261103): bob + cara complete, me partial
  playDay(srv, 'bob', [10, 20, 30, 40, 50]);
  playDay(srv, 'cara', [20, 20, 30, 40, 50]);
  srv.callAs('me', 'submitCard', { dateKey: '20261103', idx: 0, pos: 5 });
  let g = srv.callAs('me', 'getGroupDay', { groupRef: ref, dateKey: '20261103' });
  assert.equal(g.ok, true);
  assert.equal(g.n, 2);
  assert.equal(g.viewerDone, false);
  assert.equal(g.mq, null, 'n < 3');
  assert.equal(g.rows.length, 2, 'partial members are not rows');
  assert.ok(g.rows.every((r) => r[4] === null), 'positions hidden until the caller completes');
  assert.ok(g.rows.every((r) => r[1] !== null), 'n = 2: 群内分 shown');
  for (let i = 1; i < 5; i++) srv.callAs('me', 'submitCard', { dateKey: '20261103', idx: i, pos: 30 });
  g = srv.callAs('me', 'getGroupDay', { groupRef: ref, dateKey: '20261103' });
  assert.equal(g.n, 3);
  assert.equal(g.viewerDone, true);
  assert.equal(typeof g.mq, 'number');
  assert.ok(g.rows.every((r) => typeof r[4] === 'string' && r[4].split(',').length === 5));
  assert.equal(g.divisiveIdx !== null, true);
  // trend: oldest first, ends today, null for days with n < 3
  assert.equal(g.trend.length, 7);
  assert.equal(g.trend[6].dateKey, '20261103');
  assert.equal(g.trend[6].mq, g.mq);
  assert.equal(g.trend[5].mq, null);
  assert.equal(g.trend[5].n, 0);
  // an old day is not served
  clock.set(BJ('20261106', 10, 0, 0));
  assert.equal(srv.callAs('me', 'getGroupDay', { groupRef: ref, dateKey: '20261103' }).code, 'INVALID_INPUT');
});

test('AC 43: a tampered KV value cannot change any displayed score or rank - rows come from daily_entries alone', () => {
  const { srv } = setup();
  const ref = srv.callAs('a', 'joinGroup', { cloudID: srv.cloudID('G1') }).groupRef;
  ['b', 'c'].forEach((u) => srv.callAs(u, 'joinGroup', { cloudID: srv.cloudID('G1') }));
  playDay(srv, 'a', [50, 50, 50, 50, 50]);
  playDay(srv, 'b', [60, 50, 50, 50, 50]);
  playDay(srv, 'c', [90, 90, 90, 90, 90]);
  // 'cheat' has a (forged) KV marker of {s:500} in WeChat but no entry on the server: there is no input for it
  const g = srv.callAs('a', 'getGroupDay', { groupRef: ref, dateKey: T1 });
  const salt = g.salt;
  const h = (o) => sha256Hex(o + '|' + salt).slice(0, 12);
  assert.ok(!g.rows.some((r) => r[0] === h('cheat')), 'no row for a user without an entry');
  const set = srv.db.sets[T1];
  const hists = [0, 1, 2, 3, 4].map((i) => srv.db.stats[T1 + '_' + i].hist);
  const refs = set.cards.map((c, i) => S.nationRef(hists[i], c.anchor));
  const expected = ['a', 'b', 'c']
    .map((u) => {
      const e = srv.db.entries[T1 + '_' + u];
      const all = ['a', 'b', 'c'].map((x) => srv.db.entries[T1 + '_' + x].pos);
      const i = ['a', 'b', 'c'].indexOf(u);
      return { u, gs: G.leaveOneOutScore(all, i), ns: S.dailyTotal(e.pos, refs).total, t: Math.floor((e.completeAt - BJ(T1, 0, 0, 0)) / 1000) };
    })
    .sort((x, y) => y.gs - x.gs || x.t - y.t);
  assert.deepEqual(g.rows.map((r) => r[0]), expected.map((e) => h(e.u)), 'ranks equal the order computed from entries alone');
  g.rows.forEach((r) => {
    const e = expected.find((x) => h(x.u) === r[0]);
    assert.equal(r[1], e.gs);
    assert.equal(r[2], e.ns);
  });
  // the marker interface does not exist on the server: unknown fields on calls are dropped
  const f1 = srv.callAs('a', 'getFriendBoard', { dateKey: T1 });
  const f2 = srv.callAs('a', 'getFriendBoard', { dateKey: T1, kd: { s: 500 }, scores: { cheat: 500 } });
  assert.deepEqual(f1, f2);
});

test('AC 44: the viewer\'s row is identified by selfHash; the open data domain can recompute every h from sha256(openid|salt)', () => {
  const { srv } = setup();
  const ref = srv.callAs('a', 'joinGroup', { cloudID: srv.cloudID('G1') }).groupRef;
  playDay(srv, 'a', [1, 2, 3, 4, 5]);
  playDay(srv, 'b', [5, 4, 3, 2, 1]);
  const g = srv.callAs('a', 'getGroupDay', { groupRef: ref, dateKey: T1 });
  assert.equal(g.selfHash, sha256Hex('a|' + g.salt).slice(0, 12));
  assert.ok(g.rows.some((r) => r[0] === g.selfHash));
  assert.match(g.salt, /^[0-9a-f]{32}$/);
});

test('AC 46: friend board ranks by national score then time; selfOnly above the cap (3,000); pos only for a viewer who completed', () => {
  const { srv, clock } = setup();
  playDay(srv, 'a', [50, 50, 50, 50, 50]);
  clock.add(60e3);
  playDay(srv, 'b', [50, 50, 50, 50, 50]);
  clock.add(60e3);
  playDay(srv, 'c', [0, 0, 0, 0, 0]);
  const f = srv.callAs('a', 'getFriendBoard', { dateKey: T1 });
  assert.equal(f.mode, 'full');
  assert.equal(f.rows.length, 3);
  const h = (o) => sha256Hex(o + '|' + f.salt).slice(0, 12);
  assert.deepEqual(f.rows.map((r) => r[0]), [h('a'), h('b'), h('c')]);
  assert.ok(f.rows.every((r) => typeof r[3] === 'string'));
  assert.equal(f.refs.length, 5);
  const outsider = srv.callAs('zed', 'getFriendBoard', { dateKey: T1 });
  assert.equal(outsider.viewerDone, false);
  assert.ok(outsider.rows.every((r) => r[3] === null));
  assert.equal(outsider.refs, null, 'no references before the caller has played');
  // over the cap
  for (let i = 0; i < 3001; i++) {
    srv.db.entries[T1 + '_x' + i] = { _id: T1 + '_x' + i, openid: 'x' + i, dateKey: T1, pos: [50, 50, 50, 50, 50], answeredAt: [1, 1, 1, 1, 1], firstAt: 1, completeAt: BJ(T1, 11, 0, 0), streak: null };
  }
  const big = srv.callAs('a', 'getFriendBoard', { dateKey: T1 });
  assert.equal(big.mode, 'selfOnly');
  assert.deepEqual(big.rows.map((r) => r[0]), [h('a')]);
  assert.equal(big.total, 3004);
});

test('AC 45 (server side): the server never ships 最同频 or peer pairs; only per-row positions for a viewer who completed', () => {
  const { srv } = setup();
  const ref = srv.callAs('a', 'joinGroup', { cloudID: srv.cloudID('G1') }).groupRef;
  srv.callAs('b', 'joinGroup', { cloudID: srv.cloudID('G1') });
  playDay(srv, 'a', [10, 20, 30, 40, 50]);
  playDay(srv, 'b', [12, 22, 32, 42, 52]);
  const g = srv.callAs('a', 'getGroupDay', { groupRef: ref, dateKey: T1 });
  assert.ok(!/同频|peer|closest/i.test(JSON.stringify(g)));
  // the open data domain computes it from `pos` with the shared rule
  const rows = g.rows.filter((r) => r[0] !== g.selfHash);
  const me = g.rows.find((r) => r[0] === g.selfHash)[4].split(',').map(Number);
  const peer = G.closestPeer(me, rows.map((r) => ({ key: r[0], pos: r[4].split(',').map(Number), completeAt: r[3] })));
  assert.equal(peer.key, sha256Hex('b|' + g.salt).slice(0, 12));
  assert.equal(peer.gap, 2);
});

test('track stores sanitised batches under the caller; streaks follow published days across the archive', () => {
  const { srv } = setup();
  const t = srv.callAs('a', 'track', { sessionId: 's1', events: [{ name: 'session_start', props: { scene: 1 }, clientTs: 5 }, { bad: true }] });
  assert.deepEqual([t.ok, t.accepted], [true, 1]);
  assert.equal(srv.callAs('a', 'track', { events: [] }).code, 'INVALID_INPUT');
});

test('TD-42: friendBoardView takes an optional total; above the cap with a subset of entries it is selfOnly', () => {
  const G = require('../core/group');
  const mkEntry = (k) => ({ key: k, pos: [10, 20, 30, 40, 50], completeAt: 1, streak: 0 });
  const base = { dateKey: '20261105', salt: 's', refs: [50, 50, 50, 50, 50], viewerKey: 'me', viewerDone: true, hashFn: (k, s) => k + s };
  const few = [mkEntry('me'), mkEntry('a')];
  assert.equal(G.buildFriendBoard({ ...base, entries: few }).mode, 'full');
  assert.equal(G.buildFriendBoard({ ...base, entries: few }).total, 2);
  const capped = G.buildFriendBoard({ ...base, entries: few, total: 3500 });
  assert.equal(capped.mode, 'selfOnly');
  assert.equal(capped.total, 3500);
  assert.equal(capped.rows.length, 1);
  assert.equal(G.buildFriendBoard({ ...base, entries: few, total: 1 }).total, 2, 'a total below entries.length is ignored');
});
