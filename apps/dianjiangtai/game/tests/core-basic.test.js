const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rng = require('../core/rng');
const date = require('../core/date');
const C = require('../core/content');
const { buildSheet } = require('../core/sheet');

const ROOT = path.join(__dirname, '..');
const content = C.getContent(1);

// --- rng ------------------------------------------------------------------

test('mulberry32 and sub are deterministic and named streams are independent', () => {
  const a = rng.mulberry32(123);
  const b = rng.mulberry32(123);
  for (let i = 0; i < 100; i++) assert.strictEqual(a(), b());
  const s1 = rng.sub(99, 'sheet');
  const s2 = rng.sub(99, 'sheet');
  const s3 = rng.sub(99, 'battle');
  assert.strictEqual(s1(), s2());
  assert.notStrictEqual(rng.sub(99, 'sheet')(), s3());
  assert.strictEqual(rng.sub(7, 'x')(), rng.mulberry32(rng.hash32('7:x'))());
});

test('hash32 is stable (pinned values) and returns uint32', () => {
  assert.strictEqual(rng.hash32(''), rng.hash32(''));
  assert.notStrictEqual(rng.hash32('a'), rng.hash32('b'));
  for (const s of ['', 'a', '点将台', '20261101:sheet']) {
    const h = rng.hash32(s);
    assert.ok(Number.isInteger(h) && h >= 0 && h < 2 ** 32);
  }
  // pin so client and server can never silently diverge
  assert.strictEqual(rng.hash32('dianjiangtai'), 1949306285);
  assert.strictEqual(rng.hash32('123:sheet'), 2445720799);
  assert.strictEqual(rng.sub(5, 'battle')(), 0.5660943135153502);
});

test('mulberry32 output is in [0,1)', () => {
  const r = rng.mulberry32(5);
  for (let i = 0; i < 10000; i++) {
    const x = r();
    assert.ok(x >= 0 && x < 1);
  }
});

// --- date (AC 66) -----------------------------------------------------------

test('Beijing date key boundary at 16:00:00 UTC (AC 66)', () => {
  const d = Date.UTC(2026, 9, 14, 15, 59, 59); // 2026-10-14 15:59:59 UTC = 23:59:59 BJT
  assert.strictEqual(date.beijingDateKey(d), '20261014');
  assert.strictEqual(date.beijingDateKey(d + 1000), '20261015'); // 16:00:00 UTC
  assert.strictEqual(date.beijingDateKey(Date.UTC(2026, 11, 31, 16, 0, 0)), '20270101');
  assert.strictEqual(date.beijingDateKey(Date.UTC(2028, 1, 28, 16, 0, 0)), '20280229');
});

test('date key is independent of the process TZ (TZ=UTC, TZ unset, TZ=America/Los_Angeles)', () => {
  const script =
    "const d=require(" +
    JSON.stringify(path.join(ROOT, 'core', 'date.js')) +
    ");const t=Date.UTC(2026,9,14,15,59,59);console.log(d.beijingDateKey(t)+','+d.beijingDateKey(t+1000));";
  const envs = [{ TZ: 'UTC' }, { TZ: 'America/Los_Angeles' }, { TZ: 'Asia/Tokyo' }, {}];
  for (const e of envs) {
    const env = Object.assign({}, process.env);
    delete env.TZ;
    Object.assign(env, e);
    const r = spawnSync(process.execPath, ['-e', script], { env, encoding: 'utf8' });
    assert.strictEqual(r.stdout.trim(), '20261014,20261015', JSON.stringify(e) + ' ' + r.stderr);
  }
});

test('date helpers: midnight, seconds, addDays, issue numbers', () => {
  const t = Date.UTC(2026, 9, 14, 16, 0, 30); // 00:00:30 BJT on 15th
  assert.strictEqual(date.secondsSinceBeijingMidnight(t), 30);
  assert.strictEqual(date.beijingDateKey(date.beijingMidnightMs(t)), '20261015');
  assert.strictEqual(date.addDays('20261231', 1), '20270101');
  assert.strictEqual(date.addDays('20260301', -1), '20260228');
  assert.strictEqual(date.daysBetween('20261101', '20261112'), 11);
  assert.strictEqual(date.issueNo('20261112', '20261101'), 12);
  assert.strictEqual(date.msUntilBeijingMidnight(date.beijingMidnightMs(t) + 3600e3), 23 * 3600e3);
});

// --- content (AC 7) ---------------------------------------------------------

test('content passes validation (AC 7)', () => {
  assert.deepStrictEqual(C.validateContent(content), []);
});

test('Appendix B facts: cell sizes, tiers, event and bond coverage', () => {
  const size = (f, e) => content.cells[C.cellKey(f, e)].length;
  const eras = ['huangjin', 'qunxiong', 'chibi', 'sanfen'];
  assert.deepStrictEqual(eras.map((e) => size('shu', e)), [3, 5, 7, 8]);
  assert.deepStrictEqual(eras.map((e) => size('wei', e)), [2, 7, 6, 6]);
  assert.deepStrictEqual(eras.map((e) => size('wu', e)), [3, 7, 5, 3]);
  assert.deepStrictEqual(eras.map((e) => size('qun', e)), [5, 6, 2, 2]);
  const tiers = { jia: 0, yi: 0, bing: 0 };
  content.generals.forEach((g) => tiers[g.tier]++);
  assert.deepStrictEqual(tiers, { jia: 10, yi: 15, bing: 7 });
  const names = (f) => content.generals.filter(f).map((g) => g.name).sort();
  assert.deepStrictEqual(names((g) => g.stats.xin <= 3), ['吕布', '董卓', '韩遂'].sort());
  assert.deepStrictEqual(names((g) => g.stats.zhi >= 9), ['诸葛亮', '曹操', '荀彧', '郭嘉', '司马懿', '周瑜', '陆逊'].sort());
  assert.deepStrictEqual(names((g) => g.stats.yong === 10), ['关羽', '张飞', '马超', '许褚', '吕布'].sort());
  assert.deepStrictEqual(content.bonds.map((b) => b.members.length), [3, 2]);
});

test('role scores match the spec worked example (赵云)', () => {
  const s = (slot) => C.roleScore(content, 'g_zhaoyun', slot);
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' vs ' + b);
  close(s('zhugong'), 8.15);
  close(s('junshi'), 7.0);
  close(s('xianfeng'), 8.45);
  close(s('mengjiang'), 9.0);
  close(s('shoujiang'), 8.2);
});

test('fit chips follow the 7.5 / 5.5 thresholds', () => {
  assert.strictEqual(C.fitOf(7.5), 'good');
  assert.strictEqual(C.fitOf(7.49), 'ok');
  assert.strictEqual(C.fitOf(5.5), 'ok');
  assert.strictEqual(C.fitOf(5.49), 'bad');
});

test('content validation catches forbidden terms, bad stats and wrong counts', () => {
  const clone = JSON.parse(JSON.stringify({ generals: content.generals, texts: content.texts }));
  const bad = Object.assign({}, content, { generals: clone.generals, texts: clone.texts });
  for (const term of C.FORBIDDEN_TERMS) {
    const g = JSON.parse(JSON.stringify(content.generals));
    g[0].blurb = '含' + term;
    const errs = C.validateContent(Object.assign({}, content, { generals: g }));
    assert.ok(errs.some((e) => e.indexOf('forbidden term "' + term + '"') >= 0), term);
  }
  const g2 = JSON.parse(JSON.stringify(content.generals));
  g2[3].stats.zhi = 11;
  assert.ok(C.validateContent(Object.assign({}, content, { generals: g2 })).some((e) => /stat zhi/.test(e)));
  assert.ok(C.validateContent(Object.assign({}, bad, { generals: clone.generals.slice(1) })).some((e) => /expected 32/.test(e)));
});

test('getContent: unknown version is null; known version is cached', () => {
  assert.strictEqual(C.getContent(99), null);
  assert.strictEqual(C.getContent(1), C.getContent('1'));
});

test('texts contain no insulting wavering lines and every template has {name}', () => {
  for (const t of content.texts.wavering) assert.ok(t.indexOf('{name}') >= 0);
  const bad = ['废物', '懦夫', '蠢', '无能', '垃圾'];
  for (const t of content.texts.wavering) for (const b of bad) assert.ok(t.indexOf(b) < 0);
});

// --- sheet --------------------------------------------------------------------

test('buildSheet is deterministic and well-formed', () => {
  for (let seed = 0; seed < 200; seed++) {
    const a = buildSheet(seed, 1);
    assert.deepStrictEqual(a, buildSheet(seed, 1));
    assert.strictEqual(a.length, 5);
    for (const r of a) {
      assert.ok(content.cells[C.cellKey(r.faction, r.era)].length >= 2);
      assert.strictEqual(new Set(r.altFaction).size, r.altFaction.length);
      assert.ok(!r.altFaction.includes(r.faction));
      assert.ok(!r.altEra.includes(r.era));
      for (const f of r.altFaction) assert.ok(content.cells[C.cellKey(f, r.era)].length >= 2);
      for (const e of r.altEra) assert.ok(content.cells[C.cellKey(r.faction, e)].length >= 2);
      assert.strictEqual(r.altFaction.length, 3);
      assert.strictEqual(r.altEra.length, 3);
      assert.strictEqual(r.fallback.length, 4);
      const last = r.fallback[3];
      assert.ok(content.cells[C.cellKey(last.faction, last.era)].length >= 5, 'last fallback cannot be emptied');
    }
  }
});

test('buildSheet carries no battle or event randomness', () => {
  const sheet = JSON.stringify(buildSheet(42, 1));
  for (const k of ['battle', 'event', 'luck', 'best', 'lineup']) assert.ok(sheet.indexOf('"' + k) < 0);
});

test('sheet cells are uniform over the 16 cells and independent of tier (AC 6)', () => {
  const count = {};
  const N = 20000;
  for (let seed = 0; seed < N; seed++) {
    for (const r of buildSheet(rng.hash32('u' + seed), 1)) count[r.faction + r.era] = (count[r.faction + r.era] || 0) + 1;
  }
  const exp = (N * 5) / 16;
  assert.strictEqual(Object.keys(count).length, 16);
  for (const k of Object.keys(count)) assert.ok(Math.abs(count[k] - exp) / exp < 0.06, k + ' ' + count[k]);
});

// --- purity --------------------------------------------------------------------

test('core/ is pure: no wx, no DOM, relative requires only', () => {
  const dir = path.join(ROOT, 'core');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 10);
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/\bwx\./.test(src), f + ' uses wx');
    assert.ok(!/\b(document|window|localStorage|requestAnimationFrame)\b/.test(src), f + ' uses DOM');
    for (const m of src.matchAll(/require\(['"]([^'"]+)['"]\)/g)) assert.ok(m[1].startsWith('./'), f + ' requires ' + m[1]);
  }
});

test('no portrait image files in the app (AC 58)', () => {
  const appRoot = path.join(ROOT, '..');
  const bad = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'cloudfunctions-deploy') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(png|jpe?g|webp|gif)$/i.test(e.name) && /portrait|(^|[\\/_])p_/i.test(e.name)) bad.push(p);
    }
  })(appRoot);
  assert.deepStrictEqual(bad, []);
});
