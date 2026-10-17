'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../core/group');
const S = require('../core/score');
const { dateKeyToMs } = require('../core/date');

const T0 = dateKeyToMs('20261101');

const hashFn = (k, salt) => 'h' + k + salt; // opaque stand-in; real one is sha256

const same = (v) => [v, v, v, v, v];

test('AC 5: leave-one-out reference for {10, 20, 90} is the median of the other two', () => {
  const list = [same(10), same(20), same(90)];
  // member 1 (10): others {20, 90} -> median 55 -> |10-55| = 45 -> 0 per card
  assert.equal(G.leaveOneOutScore(list, 0), 0);
  // member 2 (20): others {10, 90} -> 50 -> d 30 -> 25 per card
  assert.equal(G.leaveOneOutScore(list, 1), 125);
  // member 3 (90): others {10, 20} -> 15 -> d 75 -> 0
  assert.equal(G.leaveOneOutScore(list, 2), 0);
  assert.equal(S.medianOf([20, 90]), 55);
});

test('AC 5: 群默契度 matches the hand-computed fixture; null for n = 2, computed for n = 3', () => {
  const three = [same(10), same(20), same(90)];
  // m = 20, MAD = (10 + 0 + 70) / 3 = 26.667; ceil(2.5 * 26.667) = 67; 100 - 67 = 33 on every card
  assert.equal(G.groupMq(three), 33);
  assert.equal(G.groupMq([same(10), same(20)]), null);
  assert.equal(G.groupMq([same(50)]), null);
  // identical members: MAD 0 -> 100
  assert.equal(G.groupMq([same(40), same(40), same(40)]), 100);
  // mixed cards: card scores 100, 100, 100, 100, 33 -> mean 86.6 -> 87
  const mixed = [[40, 40, 40, 40, 10], [40, 40, 40, 40, 20], [40, 40, 40, 40, 90]];
  assert.equal(G.groupMq(mixed), Math.round((400 + 33) / 5));
});

test('leave-one-out needs two members; group medians', () => {
  assert.equal(G.leaveOneOutScore([same(50)], 0), null);
  assert.equal(G.leaveOneOutScore([same(50), same(50)], 0), 500);
  assert.deepEqual(G.groupMedians([[10, 20, 30, 40, 50], [30, 40, 50, 60, 70]]), [20, 30, 40, 50, 60]);
});

test('group divisive card: highest MAD, n >= 3, ties lower index', () => {
  assert.equal(G.groupDivisiveIdx([same(1), same(2)]), null);
  const list = [[10, 10, 10, 10, 10], [10, 10, 10, 10, 90], [10, 10, 10, 10, 10]];
  assert.equal(G.groupDivisiveIdx(list), 4);
  assert.equal(G.groupDivisiveIdx([same(5), same(5), same(5)]), 0);
});

test('card group block: other members only, sorted dots, down-sampled, none -> null median', () => {
  assert.deepEqual(G.cardGroupBlock([]), { median: null, n: 0, dots: [] });
  assert.deepEqual(G.cardGroupBlock([70, 30, 50]), { median: 50, n: 3, dots: [30, 50, 70] });
  const many = [];
  for (let i = 0; i < 200; i++) many.push(i % 101);
  const b = G.cardGroupBlock(many);
  assert.equal(b.n, 200);
  assert.equal(b.dots.length, 60);
  assert.deepEqual(b.dots.slice().sort((x, y) => x - y), b.dots);
});

test('AC 45: 最同频 picks the smallest mean gap; ties go to the earlier completion', () => {
  const me = [10, 20, 30, 40, 50];
  const peers = [
    { key: 'a', pos: [14, 24, 34, 44, 54], completeAt: 500 }, // gap 4
    { key: 'b', pos: [12, 22, 28, 38, 52], completeAt: 400 }, // gap 2
    { key: 'c', pos: [8, 18, 32, 42, 48], completeAt: 100 }, // gap 2, earlier
  ];
  const r = G.closestPeer(me, peers);
  assert.equal(r.key, 'c');
  assert.equal(r.gap, 2);
  assert.equal(G.closestPeer(me, []), null);
});

function members(n, base) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ key: 'u' + i, pos: same(base + i), completeAt: T0 + 1000 + i * 1000, streak: i === 1 ? 3 : 1 });
  return out;
}

test('AC 42: group day rows, pos only for a viewer who completed, mq only for n >= 3, no keys leak', () => {
  const o = { dateKey: '20261101', salt: 'S', refs: same(50), members: members(3, 40), viewerKey: 'u0', viewerDone: true, hashFn };
  const b = G.buildGroupDay(o);
  assert.equal(b.n, 3);
  assert.equal(b.mq, G.groupMq(o.members.map((m) => m.pos)));
  assert.equal(b.rows.length, 3);
  b.rows.forEach((r) => assert.equal(r.length, 6));
  assert.ok(b.rows.every((r) => typeof r[4] === 'string'));
  const row1 = b.rows.find((r) => r[0] === 'hu1S');
  assert.equal(row1[5], 3, 'streak >= 2 is shown');
  assert.equal(b.rows.find((r) => r[0] === 'hu0S')[5], null, 'streak 1 is not');
  assert.equal(b.selfHash, 'hu0S');
  // viewer not done: positions withheld
  const b2 = G.buildGroupDay({ ...o, viewerDone: false });
  assert.ok(b2.rows.every((r) => r[4] === null));
  // n = 2: no mq, gs present
  const b3 = G.buildGroupDay({ ...o, members: members(2, 40) });
  assert.equal(b3.mq, null);
  assert.ok(b3.rows.every((r) => r[1] !== null));
  // n = 1: gs null
  const b4 = G.buildGroupDay({ ...o, members: members(1, 40) });
  assert.equal(b4.rows[0][1], null);
  assert.ok(!JSON.stringify(b).includes('"u0"'), 'raw key never appears');
});

test('AC 19: national score on a row equals the daily total at the same refs', () => {
  const refs = [50, 40, 60, 30, 70];
  const m = { key: 'x', pos: [52, 40, 70, 10, 70], completeAt: 5000, streak: null };
  const b = G.buildGroupDay({ dateKey: '20261101', salt: 'S', refs, members: [m, ...members(2, 45)], viewerKey: 'x', viewerDone: true, hashFn });
  const row = b.rows.find((r) => r[0] === 'hxS');
  assert.equal(row[2], S.dailyTotal(m.pos, refs).total);
});

test('group rows rank by 群内默契分 then completion time; cap keeps the caller (spec 8.4)', () => {
  const ms = [];
  for (let i = 0; i < 10; i++) ms.push({ key: 'u' + i, pos: same(50), completeAt: T0 + 20000 - i * 1000, streak: null });
  ms.push({ key: 'odd', pos: same(0), completeAt: T0 + 99999, streak: null });
  const b = G.buildGroupDay({ dateKey: '20261101', salt: 'S', refs: same(50), members: ms, viewerKey: 'odd', viewerDone: true, hashFn, rowCap: 5 });
  assert.equal(b.n, 11);
  assert.equal(b.rows.length, 6, 'top 5 plus the caller');
  assert.equal(b.rows[0][0], 'hu9S', 'equal scores: earliest completion first');
  assert.equal(b.rows[b.rows.length - 1][0], 'hoddS');
});

test('AC 46: friend board ranks by national score then completion time; selfOnly above the cap; pos only if viewerDone', () => {
  const refs = same(50);
  const es = [
    { key: 'a', pos: same(50), completeAt: T0 + 9000, streak: null },
    { key: 'b', pos: same(50), completeAt: T0 + 3000, streak: null },
    { key: 'c', pos: same(60), completeAt: T0 + 1000, streak: 4 },
  ];
  const full = G.buildFriendBoard({ dateKey: '20261101', salt: 'S', refs, entries: es, viewerKey: 'a', viewerDone: true, hashFn });
  assert.equal(full.mode, 'full');
  assert.deepEqual(full.rows.map((r) => r[0]), ['hbS', 'haS', 'hcS']);
  assert.equal(full.rows[2][4], 4);
  assert.ok(full.rows.every((r) => r.length === 5 && typeof r[3] === 'string'));
  const hidden = G.buildFriendBoard({ dateKey: '20261101', salt: 'S', refs, entries: es, viewerKey: 'a', viewerDone: false, hashFn });
  assert.ok(hidden.rows.every((r) => r[3] === null));
  const capped = G.buildFriendBoard({ dateKey: '20261101', salt: 'S', refs, entries: es, viewerKey: 'a', viewerDone: true, hashFn, listCap: 2 });
  assert.equal(capped.mode, 'selfOnly');
  assert.deepEqual(capped.rows.map((r) => r[0]), ['haS']);
  const cappedNone = G.buildFriendBoard({ dateKey: '20261101', salt: 'S', refs, entries: es, viewerKey: 'zzz', viewerDone: false, hashFn, listCap: 2 });
  assert.deepEqual(cappedNone.rows, []);
});

test('AC 47: 7-day trend is oldest first and shows null for days with n < 3', () => {
  assert.deepEqual(G.trendDates('20261103', 3), ['20261101', '20261102', '20261103']);
  const t = G.buildTrend('20261107', (dk) => (dk === '20261107' ? { mq: 81, n: 6 } : dk === '20261106' ? { mq: 70, n: 2 } : dk === '20261105' ? { mq: 75, n: 3 } : null));
  assert.equal(t.length, 7);
  assert.equal(t[0].dateKey, '20261101');
  assert.deepEqual(t[6], { dateKey: '20261107', mq: 81, n: 6 });
  assert.deepEqual(t[5], { dateKey: '20261106', mq: null, n: 2 });
  assert.equal(t[4].mq, 75);
  assert.equal(t[0].mq, null);
});

test('completion seconds count from 00:00 BJT of the day, past midnight for grace completions', () => {
  const d0 = dateKeyToMs('20261101');
  assert.equal(G.secondsInDay(d0 + 90 * 1000, '20261101'), 90);
  assert.equal(G.secondsInDay(d0 + 86400e3 + 600e3, '20261101'), 87000);
});
