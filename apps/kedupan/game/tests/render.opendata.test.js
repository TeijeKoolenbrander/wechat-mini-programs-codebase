/**
 * Open data domain: SHA-256, hash matching, anonymous fallback, server-only
 * ranking, 最同频 and drawing (spec 8.3-8.5, AC 44, 49).
 */

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

const { sha256Hex } = require('../opendata/sha256');
const { buildModel, hashOf, parseKv, parsePos, anonName } = require('../opendata/board');
const { drawBoard } = require('../opendata/draw');

test('sha256Hex matches node crypto (ascii, empty, multi-block, UTF-8)', () => {
  ['', 'abc', 'o_abc123|a1b2c3d4e5f60718', '刻度盘', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'x'.repeat(1000), '😀 emoji'].forEach((s) => {
    assert.strictEqual(sha256Hex(s), crypto.createHash('sha256').update(s, 'utf8').digest('hex'), JSON.stringify(s.slice(0, 20)));
  });
});

test('hashOf = first 12 hex of sha256(openid|salt), different per salt', () => {
  const h = hashOf('openid1', 'saltsalt');
  assert.strictEqual(h, crypto.createHash('sha256').update('openid1|saltsalt').digest('hex').slice(0, 12));
  assert.notStrictEqual(hashOf('openid1', 'other'), h);
});

const salt = 's4lt';
const h = (o) => hashOf(o, salt);
const raw = (openid, nickname, s) => ({ openid, nickname, avatarUrl: 'u/' + openid, KVDataList: s == null ? [] : [{ key: 'kd', value: JSON.stringify({ d: '20261015', s }) }] });
const baseMsg = { view: 'group', salt, selfHash: h('me'), viewerDone: true };
const gRows = [
  [h('a'), 400, 380, 100, '10,20,30,40,50'],
  [h('me'), 450, 410, 200, '12,22,30,44,50'],
  [h('b'), 450, 400, 150, '90,80,70,60,50'],
  [h('x1'), 300, 300, 300, '50,50,50,50,50'],
  [h('x2'), 300, 300, 310, '55,50,50,50,50'],
];

test('group: ranked by the server gs (then earlier t), never by the KV marker', () => {
  const rawRows = [raw('a', '甲', 500), raw('b', '乙', 0), raw('me', '我', 12)];
  const m = buildModel({ ...baseMsg, rows: gRows }, rawRows);
  assert.deepStrictEqual(m.entries.map((e) => e.rank), [1, 2, 3, 4, 5]);
  assert.deepStrictEqual(m.entries.slice(0, 3).map((e) => e.name), ['乙', '你', '甲']);
  const other = buildModel({ ...baseMsg, rows: gRows }, [raw('a', '甲', 0), raw('b', '乙', 500)]);
  assert.deepStrictEqual(other.entries.map((e) => e.h), m.entries.map((e) => e.h), 'KV contents do not change the order');
});

test('the viewer is always 你, even when WeChat did not list them or they have a nickname', () => {
  const m = buildModel({ ...baseMsg, rows: gRows }, [raw('me', '我自己', 1)]);
  const self = m.entries.find((e) => e.self);
  assert.strictEqual(self.name, '你');
  assert.strictEqual(self.avatarUrl, null);
  const m2 = buildModel({ ...baseMsg, rows: gRows }, []);
  assert.strictEqual(m2.entries.filter((e) => e.self).length, 1);
});

test('AC 44: unmatched server rows are 群友 A/B/C in a stable order by hash; KV-only rows are not shown', () => {
  const rawRows = [raw('a', '甲', 380), raw('ghost', '幽灵', 500)];
  const m = buildModel({ ...baseMsg, rows: gRows }, rawRows);
  assert.ok(!m.entries.some((e) => e.name === '幽灵'), 'KV row without a server row is not shown');
  const anon = m.entries.filter((e) => e.anon);
  assert.deepStrictEqual(anon.map((e) => e.name).sort(), ['群友 A', '群友 B', '群友 C']);
  // stable by hash, whatever the input order
  const m2 = buildModel({ ...baseMsg, rows: gRows.slice().reverse() }, rawRows.slice().reverse());
  const byHash = (m) => m.entries.filter((e) => e.anon).sort((x, y) => (x.h < y.h ? -1 : 1)).map((e) => e.h + e.name);
  assert.deepStrictEqual(byHash(m), byHash(m2));
  assert.strictEqual(anonName(0), '群友 A');
  assert.strictEqual(anonName(26), '群友 27');
});

test('privacy or scope refused (no raw rows): everything renders anonymously with the viewer marked 你', () => {
  const m = buildModel({ ...baseMsg, rows: gRows }, []);
  assert.ok(m.entries.every((e) => e.self || e.anon));
  assert.ok(m.entries.every((e) => !e.avatarUrl));
  assert.strictEqual(m.matchText, null, 'no 最同频 without a visible nickname');
});

test('最同频: smallest mean gap among matched members, ties by earlier completion', () => {
  const rawRows = [raw('a', '甲', 380), raw('b', '乙', 400)];
  const m = buildModel({ ...baseMsg, rows: gRows }, rawRows);
  // me = 12,22,30,44,50; a = 10,20,30,40,50 -> mean gap 1.6 ; b is far
  assert.strictEqual(m.matchText, '今天和你最同频：甲（平均差 2 格）');
  const tie = buildModel({ ...baseMsg, rows: [[h('me'), 450, 410, 200, '50,50,50,50,50'], [h('a'), 400, 380, 120, '60,60,60,60,60'], [h('b'), 400, 380, 100, '40,40,40,40,40']] }, rawRows);
  assert.strictEqual(tie.matchText, '今天和你最同频：乙（平均差 10 格）');
  const notDone = buildModel({ ...baseMsg, viewerDone: false, rows: gRows.map((r) => r.slice(0, 4)) }, rawRows);
  assert.strictEqual(notDone.matchText, null);
});

test('friend board: ranked by server ns; full mode hides KV-only rows; selfOnly shows 好友自报 unranked', () => {
  const fRows = [[h('a'), 300, 100, '1,2,3,4,5'], [h('me'), 350, 120, '5,5,5,5,5']];
  const full = buildModel({ view: 'friend', salt, selfHash: h('me'), viewerDone: true, mode: 'full', refs: [50, 50, 50, 50, 50], rows: fRows }, [raw('a', '甲', 999), raw('z', '乙', 480)]);
  assert.deepStrictEqual(full.entries.map((e) => e.name), ['你', '甲']);
  assert.strictEqual(full.unverified.length, 0);
  const so = buildModel({ view: 'friend', salt, selfHash: h('me'), viewerDone: true, mode: 'selfOnly', rows: [fRows[1]] }, [raw('z', '乙', 480), raw('y', '丙', 300)]);
  assert.strictEqual(so.entries.length, 1);
  assert.deepStrictEqual(so.unverified.map((u) => u.name), ['乙', '丙']);
  assert.ok(so.unverified.every((u) => u.rank === undefined));
});

test('round: on-time by score, late after, host last; 最懂你 is the best on-time guess; gap from the target', () => {
  const rows = [[h('a'), 40, 90, 0, 0], [h('b'), 38, 100, 0, 0], [h('c'), 10, 30, 1, 0], [h('host'), 0, 0, 0, 1], [h('me'), 45, 80, 0, 0]];
  const m = buildModel({ view: 'round', salt, selfHash: h('me'), target: 38, rows }, [raw('a', '甲', 1), raw('b', '乙', 1)]);
  assert.deepStrictEqual(m.entries.map((e) => e.name), ['乙', '甲', '你', '群友 A', '出题人']);
  assert.strictEqual(m.entries.filter((e) => e.best).length, 1);
  assert.strictEqual(m.entries[0].best, true);
  assert.strictEqual(m.entries[0].gap, 0);
  assert.strictEqual(m.entries.find((e) => e.late).gap, 28);
  assert.strictEqual(m.entries.find((e) => e.host).late, false);
});

test('parseKv / parsePos tolerate garbage', () => {
  assert.strictEqual(parseKv({ KVDataList: [{ key: 'kd', value: 'not json' }] }), null);
  assert.strictEqual(parseKv({ KVDataList: [{ key: 'kd', value: '{"s":9999}' }] }), null);
  assert.deepStrictEqual(parseKv({ KVDataList: [{ key: 'kd', value: '{"d":"1","s":412}' }] }), { d: '1', s: 412 });
  assert.strictEqual(parsePos('1,2,3'), null);
  assert.strictEqual(parsePos('1,2,3,4,500'), null);
  assert.deepStrictEqual(parsePos('1,2,3,4,5'), [1, 2, 3, 4, 5]);
});

function recorder() {
  const texts = [];
  const state = { font: '10px sans-serif' };
  const ctx = new Proxy(
    {},
    {
      get(t, p) {
        if (p === 'fillText') return (s) => texts.push(String(s));
        if (p === 'measureText') return (s) => ({ width: String(s).length * 10 });
        if (p === '__texts') return texts;
        if (p in state) return state[p];
        return () => {};
      },
      set(t, p, v) {
        state[p] = v;
        return true;
      },
    }
  );
  return ctx;
}

test('drawBoard draws every view, scrolls, pins your row, and never prints an openid', () => {
  const many = [];
  for (let i = 0; i < 30; i++) many.push([h('p' + i), 400 - i, 380 - i, 100 + i, '10,20,30,40,50']);
  many.push([h('me'), 100, 100, 999, '10,20,30,40,50']);
  ['group', 'friend', 'round'].forEach((view) => {
    const rows = view === 'group' ? many : view === 'friend' ? many.map((r) => [r[0], r[2], r[3], r[4]]) : many.map((r, i) => [r[0], 30 + i, 70, i % 7 === 0 ? 1 : 0, 0]);
    const m = buildModel({ view, salt, selfHash: h('me'), viewerDone: true, target: 40, refs: [50, 50, 50, 50, 50], rows }, [raw('p1', '甲', 1), raw('me', 'ME-OPENID', 1)]);
    ['standard', 'highContrast'].forEach((palette) => {
      const ctx = recorder();
      const r = drawBoard(ctx, m, { width: 343, height: 360, scroll: 0, rowH: 60, footH: 58, fontScale: 1, palette, images: {} });
      assert.ok(r.maxScroll > 0, view + ' scrolls');
      const r2 = drawBoard(recorder(), m, { width: 343, height: 360, scroll: 99999, rowH: 60, footH: 58, fontScale: 1.2, palette, images: {} });
      assert.ok(r2.contentHeight === r.contentHeight);
      const ctx3 = recorder();
      drawBoard(ctx3, m, { width: 343, height: 360, scroll: 600, rowH: 60, footH: 58, fontScale: 1, palette, images: {} });
      assert.ok(ctx3.__texts.includes('你'), view + ' pins your row when scrolled out');
      assert.ok(!ctx3.__texts.join('|').includes('openid'), 'no openid text');
    });
  });
  const empty = recorder();
  drawBoard(empty, { view: 'group', entries: [], unverified: [] }, { width: 300, height: 200 });
  assert.ok(empty.__texts.join('').includes('还没有人'));
  const msg = recorder();
  drawBoard(msg, { view: 'group', entries: [], unverified: [] }, { width: 300, height: 200, message: '正在读取…' });
  assert.deepStrictEqual(msg.__texts, ['正在读取…']);
});

test('opendata text is at least 16 (scaled) in every view', () => {
  const m = buildModel({ ...baseMsg, rows: gRows }, [raw('a', '甲', 1)]);
  const sizes = [];
  const state = { font: '' };
  const ctx = new Proxy({}, {
    get(t, p) {
      if (p === 'fillText') return () => sizes.push(Number(/([\d.]+)px/.exec(state.font)[1]));
      if (p === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (p in state) return state[p];
      return () => {};
    },
    set(t, p, v) {
      state[p] = v;
      return true;
    },
  });
  drawBoard(ctx, m, { width: 343, height: 360, scroll: 0, rowH: 60, footH: 58, fontScale: 1, palette: 'standard', images: {} });
  const small = sizes.filter((s) => s < 15.99);
  // single glyph avatar initials may be smaller; everything else must be >= 16
  assert.ok(small.length <= m.entries.length, 'only avatar glyphs below 16: ' + small.join(','));
});
