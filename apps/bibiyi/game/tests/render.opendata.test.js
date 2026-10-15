/**
 * Open data domain: SHA-256, hash matching and server-only ranking with
 * shared ranks for ties (spec 8). Run: node --test apps/bibiyi/game/tests/
 */

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { sha256Hex } = require('../opendata/sha256');
const { buildModel, hashOf, parseKv } = require('../opendata/board');
const { drawBoard } = require('../opendata/draw');

test('sha256Hex matches node crypto (ascii, empty, multi-block, UTF-8)', () => {
  ['', 'abc', 'o_abc123|a1b2c3d4e5f60718', '比一比', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'x'.repeat(1000), '😀 emoji'].forEach((s) => {
    assert.strictEqual(sha256Hex(s), crypto.createHash('sha256').update(s, 'utf8').digest('hex'), JSON.stringify(s.slice(0, 20)));
  });
});

test('hashOf = first 12 hex of sha256(openid|salt), different per day', () => {
  const h = hashOf('openid1', 'saltsalt');
  assert.strictEqual(h, crypto.createHash('sha256').update('openid1|saltsalt').digest('hex').slice(0, 12));
  assert.notStrictEqual(hashOf('openid1', 'othersalt'), h);
});

const salt = 's4lt';
const kv = (n) => [{ key: 'd_20261014', value: JSON.stringify({ n }) }];
const row = (openid, name, n) => ({ openid, nickname: name, avatarUrl: '', KVDataList: n == null ? [] : kv(n) });
const srv = (openid, n, s, k) => [hashOf(openid, salt), n, s, k];
const base = { kind: 'group', dateKey: '20261014', salt, selfHash: hashOf('me', salt), mode: 'full', viewerPlayed: true, showUnverified: true };

test('a user with no server result and a big KV value is unverified, unranked, last', () => {
  const m = buildModel({ ...base, rows: [srv('a', 8, 10), srv('me', 7, 20)] }, [row('a', 'A', 8), row('cheat', 'C', 40)]);
  assert.deepStrictEqual(m.ranked.map((r) => r.name), ['A', '你']);
  assert.strictEqual(m.unverified.length, 1);
  assert.strictEqual(m.unverified[0].rank, undefined);
  assert.strictEqual(m.unverifiedLabel, '未验证');
});

test('server 8 with KV 40 shows 8 at the rank 8 earns', () => {
  const m = buildModel({ ...base, rows: [srv('a', 8, 10), srv('b', 9, 11), srv('me', 7, 20)] }, [row('a', 'A', 40), row('b', 'B', 9)]);
  const a = m.ranked.find((r) => r.name === 'A');
  assert.strictEqual(a.n, 8);
  assert.strictEqual(a.rank, 2);
});

test('rank order depends on server rows only, for any KV contents', () => {
  const rows = [srv('a', 8, 10), srv('b', 8, 5), srv('c', 11, 99), srv('me', 8, 7)];
  [[8, 8, 11], [0, 40, 0], [40, 40, 40], [null, null, null]].forEach((k) => {
    const o = buildModel({ ...base, rows }, [row('a', 'A', k[0]), row('b', 'B', k[1]), row('c', 'C', k[2])]).ranked.map((r) => r.name + ':' + r.rank);
    assert.deepStrictEqual(o, ['C:1', 'B:2', '你:2', 'A:2']);
  });
});

test('equal 连对 share one rank number (1, 2, 2, 4); earlier submit listed first within a tie', () => {
  const m = buildModel({ ...base, rows: [srv('a', 14, 500), srv('b', 14, 100), srv('c', 21, 900), srv('me', 3, 1)] }, [row('a', 'A', 14), row('b', 'B', 14), row('c', 'C', 21)]);
  assert.deepStrictEqual(m.ranked.map((r) => r.name), ['C', 'B', 'A', '你']);
  assert.deepStrictEqual(m.ranked.map((r) => r.rank), [1, 2, 2, 4]);
});

test('viewer row is added from server rows when WeChat does not list them', () => {
  const m = buildModel({ ...base, kind: 'friend', rows: [srv('me', 9, 10, 5)] }, [row('a', 'A', null)]);
  assert.strictEqual(m.ranked.length, 1);
  assert.strictEqual(m.ranked[0].self, true);
  assert.strictEqual(m.ranked[0].k, 5);
  assert.strictEqual(m.unverified.length, 0, 'a friend without marker and server row is not shown');
});

test('selfOnly mode: others are 好友自报, no rank numbers, below the viewer', () => {
  const m = buildModel({ ...base, kind: 'friend', mode: 'selfOnly', rows: [srv('me', 10, 10)] }, [row('a', 'A', 12), row('b', 'B', 3)]);
  assert.strictEqual(m.ranked.length, 1);
  assert.strictEqual(m.unverifiedLabel, '好友自报');
  assert.deepStrictEqual(m.unverified.map((r) => r.name), ['A', 'B']);
  assert.ok(m.unverified.every((r) => r.rank === undefined));
});

test('showUnverified:false hides unmatched rows; garbage or out-of-range markers are ignored; duplicates count once', () => {
  const rows = [srv('a', 8, 10)];
  assert.strictEqual(buildModel({ ...base, rows, showUnverified: false }, [row('a', 'A', 8), row('c', 'C', 12)]).unverified.length, 0);
  const bad = { openid: 'x', nickname: 'X', KVDataList: [{ key: 'd_20261014', value: 'not json' }, { key: 'd_other', value: '{"n":12}' }] };
  assert.strictEqual(buildModel({ ...base, rows }, [bad]).unverified.length, 0);
  assert.strictEqual(parseKv({ KVDataList: [{ key: 'd_1', value: '{"n":61}' }] }, 'd_1'), null);
  assert.strictEqual(parseKv({ KVDataList: [{ key: 'd_1', value: '{"n":-1}' }] }, 'd_1'), null);
  assert.strictEqual(parseKv({ KVDataList: [{ key: 'd_1', value: '{"n":3.5}' }] }, 'd_1'), null);
  assert.strictEqual(buildModel({ ...base, rows }, [row('a', 'A', 8), row('a', 'A again', 8)]).ranked.length, 1);
});

test('drawBoard reports a scroll range, shows no facts, and draws every state in both modes', () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (t, p) => (p === 'measureText' ? () => ({ width: 10 }) : p === 'fillText' ? (s) => calls.push(s) : () => {}), set: () => true });
  const rows = Array.from({ length: 20 }, (_, i) => srv('p' + i, 40 - (i % 13), i, i % 3 ? 0 : 4));
  const m = buildModel({ ...base, rows }, rows.map((r, i) => row('p' + i, 'P' + i, 5)));
  [false, true].forEach((hc) =>
    [false, true].forEach((lg) => {
      const res = drawBoard(ctx, m, { width: 335, height: 300, scroll: 99999, images: {}, highContrast: hc, largeText: lg });
      assert.ok(res.maxScroll > 0);
      drawBoard(ctx, { ranked: [], unverified: [], kind: 'group' }, { width: 335, height: 300, highContrast: hc, largeText: lg });
      drawBoard(ctx, m, { width: 335, height: 300, message: '排行榜暂时读取失败', highContrast: hc, largeText: lg });
    })
  );
  assert.ok(calls.some((s) => /成绩经服务器校验/.test(s)));
  assert.ok(calls.some((s) => /连续4天/.test(s)));
  assert.ok(!calls.some((s) => /黄河|长江|公里/.test(s)));
});

test('opendata files are WeChat-safe: relative requires only, no Node built-ins', () => {
  const dir = path.join(__dirname, '..', 'opendata');
  fs.readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .forEach((f) => {
      const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      (src.match(/require\(['"][^'"]+['"]\)/g) || []).forEach((r) => assert.ok(/require\(['"]\.\//.test(r), f + ' requires ' + r));
      assert.ok(!/\bBuffer\b|process\./.test(src), f + ' uses a Node global');
    });
});
