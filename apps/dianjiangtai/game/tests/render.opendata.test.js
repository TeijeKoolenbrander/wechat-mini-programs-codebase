/**
 * Open data domain: SHA-256, hash matching and server-only ranking
 * (spec 11.4, AC 56, 60).
 */

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

const { sha256Hex } = require('../opendata/sha256');
const { buildModel, hashOf, parseKv } = require('../opendata/board');

test('sha256Hex matches node crypto (ascii, empty, multi-block, UTF-8)', () => {
  ['', 'abc', 'o_abc123|a1b2c3d4e5f60718', '点将台', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'x'.repeat(1000), '😀 emoji'].forEach((s) => {
    assert.strictEqual(sha256Hex(s), crypto.createHash('sha256').update(s, 'utf8').digest('hex'), JSON.stringify(s.slice(0, 20)));
  });
});

test('hashOf = first 12 hex of sha256(openid|salt)', () => {
  const h = hashOf('openid1', 'saltsalt');
  assert.strictEqual(h, crypto.createHash('sha256').update('openid1|saltsalt').digest('hex').slice(0, 12));
  assert.strictEqual(h.length, 12);
  assert.notStrictEqual(hashOf('openid1', 'othersalt'), h, 'hash differs per day');
});

const salt = 's4lt';
const kv = (w) => [{ key: 'd_20261014', value: JSON.stringify({ w, l: 12 - w }) }];
const row = (openid, name, w) => ({ openid, nickname: name, avatarUrl: '', KVDataList: w == null ? [] : kv(w) });
const srv = (openid, w, s, x) => [hashOf(openid, salt), w, s, x];
const base = { kind: 'group', dateKey: '20261014', salt, selfHash: hashOf('me', salt), mode: 'full', viewerPlayed: true, showUnverified: true };

test('AC 56a: a user with no server result and KV w:12 is unverified, unranked, last', () => {
  const m = buildModel({ ...base, rows: [srv('a', 8, 10), srv('me', 7, 20)] }, [row('a', 'A', 8), row('cheat', 'C', 12)]);
  assert.deepStrictEqual(m.ranked.map((r) => r.name), ['A', '你']);
  assert.strictEqual(m.unverified.length, 1);
  assert.strictEqual(m.unverified[0].name, 'C');
  assert.strictEqual(m.unverified[0].rank, undefined);
  assert.strictEqual(m.unverifiedLabel, '未验证');
});

test('AC 56b: server 8-4 with KV 12-0 shows 8-4 at the rank 8-4 earns', () => {
  const m = buildModel({ ...base, rows: [srv('a', 8, 10), srv('b', 9, 11), srv('me', 7, 20)] }, [row('a', 'A', 12), row('b', 'B', 9)]);
  const a = m.ranked.find((r) => r.name === 'A');
  assert.strictEqual(a.w, 8);
  assert.strictEqual(a.l, 4);
  assert.strictEqual(a.rank, 2);
  assert.strictEqual(m.unverified.length, 0);
});

test('AC 56c: rank order depends on server rows only, for any KV contents', () => {
  const rows = [srv('a', 8, 10), srv('b', 8, 5), srv('c', 11, 99), srv('me', 8, 7)];
  const kvSets = [[8, 8, 11], [0, 12, 0], [12, 12, 12], [null, null, null]];
  const orders = kvSets.map((k) => buildModel({ ...base, rows }, [row('a', 'A', k[0]), row('b', 'B', k[1]), row('c', 'C', k[2])]).ranked.map((r) => r.name + ':' + r.rank));
  orders.forEach((o) => assert.deepStrictEqual(o, ['C:1', 'B:2', '你:3', 'A:4']));
});

test('ranking: wins desc, then earlier server submit time; ranks are 1..n over matched rows only', () => {
  const m = buildModel({ ...base, rows: [srv('a', 10, 500), srv('b', 10, 100), srv('me', 12, 900)] }, [row('a', 'A', 10), row('b', 'B', 10), row('zz', 'Z', 12)]);
  assert.deepStrictEqual(m.ranked.map((r) => r.name), ['你', 'B', 'A']);
  assert.deepStrictEqual(m.ranked.map((r) => r.rank), [1, 2, 3]);
  assert.deepStrictEqual(m.unverified.map((r) => r.name), ['Z']);
});

test('viewer row is added from server rows when WeChat does not list them (friend board)', () => {
  const m = buildModel({ ...base, kind: 'friend', rows: [srv('me', 9, 10)] }, [row('a', 'A', null)]);
  assert.strictEqual(m.ranked.length, 1);
  assert.strictEqual(m.ranked[0].self, true);
  assert.strictEqual(m.ranked[0].name, '你');
  assert.strictEqual(m.unverified.length, 0, 'a friend without a marker and without a server row is not shown');
});

test('selfOnly mode: other rows are labelled 好友自报, no rank numbers, below the viewer', () => {
  const m = buildModel({ ...base, kind: 'friend', mode: 'selfOnly', rows: [srv('me', 10, 10)] }, [row('a', 'A', 12), row('b', 'B', 3)]);
  assert.strictEqual(m.ranked.length, 1);
  assert.strictEqual(m.ranked[0].self, true);
  assert.strictEqual(m.unverifiedLabel, '好友自报');
  assert.deepStrictEqual(m.unverified.map((r) => r.name), ['A', 'B']);
  assert.ok(m.unverified.every((r) => r.rank === undefined));
});

test('lineups only when the server sent them and the viewer has played', () => {
  const rows = [srv('a', 8, 10, '1,2,3,4,5'), srv('me', 7, 20, '5,4,3,2,1')];
  const played = buildModel({ ...base, rows, viewerPlayed: true }, [row('a', 'A', 8)]);
  assert.deepStrictEqual(played.ranked[0].lineup, [1, 2, 3, 4, 5]);
  const notPlayed = buildModel({ ...base, rows, viewerPlayed: false }, [row('a', 'A', 8)]);
  assert.ok(notPlayed.ranked.every((r) => r.lineup === null));
  const none = buildModel({ ...base, rows: [srv('a', 8, 10)], viewerPlayed: true }, [row('a', 'A', 8)]);
  assert.strictEqual(none.ranked[0].lineup, null);
});

test('showUnverified:false hides unmatched rows; garbage markers are ignored; duplicate rows count once', () => {
  const rows = [srv('a', 8, 10)];
  assert.strictEqual(buildModel({ ...base, rows, showUnverified: false }, [row('a', 'A', 8), row('c', 'C', 12)]).unverified.length, 0);
  const bad = { openid: 'x', nickname: 'X', KVDataList: [{ key: 'd_20261014', value: 'not json' }, { key: 'd_other', value: '{"w":12}' }] };
  assert.strictEqual(buildModel({ ...base, rows }, [bad]).unverified.length, 0);
  assert.strictEqual(parseKv({ KVDataList: [{ key: 'd_1', value: '{"w":13}' }] }, 'd_1'), null);
  assert.strictEqual(buildModel({ ...base, rows }, [row('a', 'A', 8), row('a', 'A again', 8)]).ranked.length, 1);
});

test('drawBoard reports a scroll range and draws every layout state without throwing', () => {
  const { drawBoard, bandLabel } = require('../opendata/draw');
  const calls = [];
  const ctx = new Proxy({}, { get: (t, p) => (p === 'measureText' ? () => ({ width: 10 }) : p === 'fillText' ? (s) => calls.push(s) : () => {}), set: () => true });
  const rows = Array.from({ length: 20 }, (_, i) => srv('p' + i, 12 - (i % 13), i));
  const m = buildModel({ ...base, rows }, rows.map((r, i) => row('p' + i, 'P' + i, 5)));
  const res = drawBoard(ctx, m, { width: 335, height: 300, scroll: 99999, roster: [], images: {} });
  assert.ok(res.maxScroll > 0);
  assert.ok(calls.some((s) => /服务器校验/.test(s)));
  drawBoard(ctx, { ranked: [], unverified: [], kind: 'group' }, { width: 335, height: 300 });
  drawBoard(ctx, m, { width: 335, height: 300, message: '排行榜暂时读取失败' });
  assert.strictEqual(bandLabel(12), '一统天下');
  assert.strictEqual(bandLabel(0), '一败涂地');
  assert.strictEqual(bandLabel(7), '三分鼎立');
});
