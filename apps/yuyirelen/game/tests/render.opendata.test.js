/**
 * Open data domain: SHA-256, hash matching, server-only ordering, sections,
 * no words anywhere, and drawing in both display modes (spec 8.8, 11).
 * Run: node --test apps/yuyirelen/game/tests/render.opendata.test.js
 */

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

const { sha256Hex } = require('../opendata/sha256');
const { buildModel, hashOf, parseKv } = require('../opendata/board');
const { drawBoard } = require('../opendata/draw');

test('sha256Hex matches node crypto (ascii, empty, multi-block, UTF-8)', () => {
  ['', 'abc', 'o_abc123|a1b2c3d4e5f60718', '语义热冷', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'x'.repeat(1000), '😀 emoji'].forEach((s) => {
    assert.strictEqual(sha256Hex(s), crypto.createHash('sha256').update(s, 'utf8').digest('hex'), JSON.stringify(s.slice(0, 20)));
  });
});

test('hashOf = first 12 hex of sha256(openid|salt), different every day', () => {
  const h = hashOf('openid1', 'saltsalt');
  assert.strictEqual(h, crypto.createHash('sha256').update('openid1|saltsalt').digest('hex').slice(0, 12));
  assert.strictEqual(h.length, 12);
  assert.notStrictEqual(hashOf('openid1', 'othersalt'), h);
});

const salt = 's4lt';
const H = (id) => hashOf(id, salt);
const kv = (s, h, st) => [{ key: 'd_20261015', value: JSON.stringify({ s, h, st: st || 'solved' }) }];
const row = (openid, name, marker) => ({ openid, nickname: name, avatarUrl: '', KVDataList: marker || [] });
const base = { kind: 'group', dateKey: '20261015', salt, selfHash: H('me'), mode: 'full', showUnverified: true };
const names = (list) => list.map((r) => r.name);

test('AC 78a: a KV marker with no server match is 未验证, has no rank number, and is listed last', () => {
  const rows = [[H('a'), 1, 14, 0, 1, 100], [H('me'), 1, 21, 1, 1, 200]];
  const m = buildModel({ ...base, rows }, [row('a', 'A', kv(14, 0)), row('cheat', 'C', kv(1, 0))]);
  assert.deepStrictEqual(names(m.solved), ['A', '你']);
  assert.strictEqual(m.unverified.length, 1);
  assert.strictEqual(m.unverified[0].name, 'C');
  assert.strictEqual(m.unverified[0].rank, undefined);
  assert.strictEqual(m.unverifiedLabel, '未验证');
  assert.strictEqual(buildModel({ ...base, mode: 'selfOnly', rows }, [row('cheat', 'C', kv(1, 0))]).unverifiedLabel, '好友自报');
});

test('AC 79: solved rows order by steps, then hints, then finish time; only they carry rank numbers', () => {
  const rows = [
    [H('a'), 1, 20, 2, 1, 500],
    [H('b'), 1, 20, 0, 1, 900],
    [H('c'), 1, 20, 0, 1, 100],
    [H('me'), 1, 18, 3, 1, 700],
    [H('d'), 1, 25, 0, 1, 50],
  ];
  const m = buildModel({ ...base, rows }, ['a', 'b', 'c', 'd'].map((x) => row(x, x.toUpperCase())));
  assert.deepStrictEqual(names(m.solved), ['你', 'C', 'B', 'A', 'D']);
  assert.deepStrictEqual(m.solved.map((r) => r.rank), [1, 2, 3, 4, 5]);
  assert.strictEqual(m.playing.length + m.gaveup.length, 0);
});

test('AC 80: playing and gave-up rows are separate sections, sorted by best rank, with no rank number', () => {
  const rows = [
    [H('a'), 2, 9, 0, 6, 100],
    [H('b'), 2, 12, 1, 3, 100],
    [H('c'), 3, 66, 4, 41, 100],
    [H('d'), 3, 40, 2, 8, 100],
    [H('me'), 1, 21, 1, 1, 300, 5],
  ];
  const m = buildModel({ ...base, rows }, ['a', 'b', 'c', 'd'].map((x) => row(x, x.toUpperCase())));
  assert.deepStrictEqual(names(m.playing), ['B', 'A']);
  assert.deepStrictEqual(names(m.gaveup), ['D', 'C']);
  assert.ok(m.playing.concat(m.gaveup).every((r) => r.rank === undefined));
  assert.strictEqual(m.solved[0].k, 5);
});

test('AC 78b: ordering depends on server rows only, for any KV contents', () => {
  const rows = [[H('a'), 1, 30, 0, 1, 10], [H('b'), 1, 20, 0, 1, 20], [H('me'), 1, 25, 0, 1, 30]];
  const markers = [kv(1, 0), kv(99, 9, 'gaveup'), [], kv(30, 0)];
  const orders = markers.map((mk) => names(buildModel({ ...base, rows }, [row('a', 'A', mk), row('b', 'B', mk)]).solved).join(','));
  orders.forEach((o) => assert.strictEqual(o, 'B,你,A'));
});

test('a row with no server match and no marker is not shown; the viewer is always shown', () => {
  const m = buildModel({ ...base, rows: [[H('me'), 1, 21, 1, 1, 200]] }, [row('stranger', 'S')]);
  assert.strictEqual(m.unverified.length, 0);
  assert.deepStrictEqual(names(m.solved), ['你']);
  assert.strictEqual(m.solved[0].self, true);
});

test('garbage KV markers are ignored; othersPlaying passes through only when positive', () => {
  assert.strictEqual(parseKv(row('x', 'X', [{ key: 'd_20261015', value: '{not json' }]), 'd_20261015'), null);
  assert.strictEqual(parseKv(row('x', 'X', [{ key: 'd_20261015', value: '{"s":"many"}' }]), 'd_20261015'), null);
  assert.strictEqual(buildModel({ ...base, rows: [], othersPlaying: 3 }, []).othersPlaying, 3);
  assert.strictEqual(buildModel({ ...base, rows: [], othersPlaying: -1 }, []).othersPlaying, 0);
});

test('AC 81: the model and the drawn text never contain a word beyond names and fixed labels', () => {
  const rows = [[H('a'), 1, 14, 0, 1, 100, 5], [H('b'), 2, 9, 0, 6, 100], [H('c'), 3, 66, 4, 41, 100], [H('me'), 1, 21, 1, 1, 300]];
  const m = buildModel({ ...base, rows, othersPlaying: 2 }, [row('a', '张三'), row('b', '李四'), row('c', '王五'), row('z', '赵六', kv(3, 0))]);
  const texts = [];
  const ctx = new Proxy({}, { get: (t, p) => (p === 'fillText' ? (s) => texts.push(String(s)) : p === 'measureText' ? (s) => ({ width: String(s).length * 10 }) : () => {}), set: () => true });
  drawBoard(ctx, m, { width: 335, height: 400, scroll: 0, images: {} });
  const allowed = /^(\d+|[·你张李王赵]|张三|李四|王五|赵六|\d+ 步|已猜 \d+ 步|最近第 [\d,]+ 名|提示 \d+( {2}连\d+)?|未猜中|未验证|正在猜|另有 \d+ 人正在猜)$/;
  texts.forEach((s) => assert.ok(allowed.test(s), 'unexpected text: ' + s));
  assert.ok(texts.includes('正在猜') && texts.includes('未猜中') && texts.includes('未验证'));
  assert.ok(texts.includes('提示 0  连5'));
});

test('drawBoard: sections, empty, message and scroll bounds in both display modes', () => {
  const rows = [];
  const raw = [];
  for (let i = 0; i < 30; i++) {
    rows.push([H('p' + i), 1, 10 + i, i % 3, 1, 100 + i]);
    raw.push(row('p' + i, '玩家' + i));
  }
  rows.push([H('me'), 1, 50, 2, 1, 900]);
  const m = buildModel({ ...base, rows }, raw);
  [undefined, { largeText: true }, { highContrast: true }, { largeText: true, highContrast: true }].forEach((display) => {
    const texts = [];
    const sizes = [];
    let font = '';
    const ctx = new Proxy({}, {
      get: (t, p) => (p === 'fillText' ? (s) => { texts.push(String(s)); sizes.push(+/([\d.]+)px/.exec(font)[1]); } : p === 'measureText' ? (s) => ({ width: String(s).length * 10 }) : () => {}),
      set: (t, p, v) => { if (p === 'font') font = v; return true; },
    });
    const res = drawBoard(ctx, m, { width: 335, height: 300, scroll: 0, images: {}, display });
    assert.ok(res.maxScroll > 0 && res.contentHeight > 300);
    // all text >= 16px, >= 20px for 大字模式 rows (the 16px base grows by 1.25)
    sizes.forEach((s, i) => assert.ok(s >= (display && display.largeText ? 19.9 : 15.9), (display ? JSON.stringify(display) : 'default') + ' "' + texts[i] + '" ' + s));
    // the viewer's own row is pinned when scrolled off
    const t2 = [];
    const ctx2 = new Proxy({}, { get: (t, p) => (p === 'fillText' ? (s) => t2.push(String(s)) : p === 'measureText' ? (s) => ({ width: String(s).length * 10 }) : () => {}), set: () => true });
    drawBoard(ctx2, m, { width: 335, height: 300, scroll: 0, images: {}, display });
    assert.ok(t2.includes('50 步'), 'own row (50 steps) is pinned at scroll 0');
    // scroll is clamped, never negative
    assert.strictEqual(drawBoard(ctx, m, { width: 335, height: 300, scroll: 1e6, images: {}, display }).maxScroll, res.maxScroll);
    assert.strictEqual(drawBoard(ctx, m, { width: 335, height: 300, scroll: -50, images: {}, display }).maxScroll, res.maxScroll);
  });
  const e = [];
  const ctxE = new Proxy({}, { get: (t, p) => (p === 'fillText' ? (s) => e.push(String(s)) : p === 'measureText' ? (s) => ({ width: String(s).length * 10 }) : () => {}), set: () => true });
  drawBoard(ctxE, buildModel({ ...base, rows: [] }, []), { width: 335, height: 300, images: {} });
  assert.deepStrictEqual(e, ['本群今天还没人开始猜']);
  e.length = 0;
  drawBoard(ctxE, m, { width: 335, height: 300, images: {}, message: '榜单暂时读取失败' });
  assert.deepStrictEqual(e, ['榜单暂时读取失败']);
});

test('open data folder is self-contained: only ./ requires, no wx outside index.js', () => {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '..', 'opendata');
  fs.readdirSync(dir).forEach((f) => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const reqs = [...src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    reqs.forEach((r) => assert.ok(/^\.\/[a-z0-9]+$/i.test(r), f + ' requires ' + r));
    if (f !== 'index.js') assert.ok(!/\bwx\./.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), f + ' uses wx');
  });
});
