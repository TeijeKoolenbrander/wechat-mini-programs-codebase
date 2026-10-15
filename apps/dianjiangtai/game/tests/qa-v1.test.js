'use strict';
// QA v1 additions (game side). Independent of the dev tests: own forbidden list (AC 7 + AC 50 in full), own
// roster diff against the v1 file, own display-mode and package checks.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const GAME = path.join(__dirname, '..');
const v1 = require('../core/content/generals.v1.js');
const v2 = require('../core/content/generals.v2.js');

// AC 7 + AC 50 complete list (the dev qa-content scan omits 传说 and 稀有)
const FORBIDDEN = ['82-0', '82胜', 'NBA', '武力', '统率', '政治', '魅力', 'SSR', '抽卡', '传说', '稀有', '三国志', '三国杀', '光荣', 'Koei'];

function leaves(v, key, out, skip) {
  if (typeof v === 'string') { if (!skip.includes(key)) out.push({ key, s: v }); }
  else if (Array.isArray(v)) v.forEach((x) => leaves(x, key, out, skip));
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) leaves(v[k], k, out, skip);
  return out;
}

function walkFiles(dir, re, skipDirs, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, re, skipDirs, out);
    else if (re.test(e.name)) out.push(p);
  }
  return out;
}

test('AC 7/50: no forbidden term in ANY user-visible string of the 120-general roster, statNotes and appearance notes included', () => {
  const strs = leaves(v2, '', [], ['source']); // source is internal provenance, never rendered
  assert.ok(strs.length > 120 * 5, 'scan covers the roster, got ' + strs.length);
  const hits = [];
  for (const { key, s } of strs) for (const t of FORBIDDEN) if (s.toUpperCase().includes(t.toUpperCase())) hits.push(`${key}: ${s} has ${t}`);
  assert.deepEqual(hits, []);
  assert.equal(v2.generals.filter((g) => typeof g.statNote === 'string' && g.statNote.length > 0).length, 120);
});

test('AC 7/50: same list over v1 content and every shipped game file outside the validator', () => {
  const hits = [];
  for (const { key, s } of leaves(v1, '', [], ['source'])) for (const t of FORBIDDEN) if (s.toUpperCase().includes(t.toUpperCase())) hits.push(`v1 ${key}: ${s}`);
  for (const f of walkFiles(GAME, /\.(js|json|wxss|wxml)$/, ['node_modules', 'tests', 'tools', 'out'])) {
    const rel = path.relative(GAME, f).replace(/\\/g, '/');
    if (/^core\/content\/generals\.v[12]\.js$/.test(rel)) continue; // scanned structurally above (source exempt)
    // these files hold the checker word lists themselves (inspected by hand: no other hit in them)
    if (['core/validate.js', 'core/content.js', 'js/render/widgets.js'].includes(rel)) continue;
    const text = fs.readFileSync(f, 'utf8');
    for (const t of FORBIDDEN) if (text.toUpperCase().includes(t.toUpperCase())) hits.push(`${rel} has ${t}`);
  }
  assert.deepEqual(hits, []);
});

test('D1/AC 69/74: the 32 original generals are unchanged in v2 (own diff against the v1 file)', () => {
  const byId = new Map(v2.generals.map((g) => [g.id, g]));
  assert.equal(v2.generals.length, 120);
  assert.equal(byId.size, 120);
  assert.equal(v1.generals.length, 32);
  const diffs = [];
  for (const o of v1.generals) {
    const n = byId.get(o.id);
    if (!n) { diffs.push('missing ' + o.id); continue; }
    for (const k of ['name', 'stats', 'tier', 'primaryRole', 'faction']) {
      if (o[k] !== undefined && JSON.stringify(o[k]) !== JSON.stringify(n[k])) diffs.push(`${o.id}.${k}: ${JSON.stringify(o[k])} -> ${JSON.stringify(n[k])}`);
    }
  }
  assert.deepEqual(diffs, []);
});

test('AC 69: roster shape recomputed independently (faction counts, portraitId null, blurb <= 14, stats 1-10)', () => {
  const c = {};
  for (const g of v2.generals) c[g.faction] = (c[g.faction] || 0) + 1;
  assert.deepEqual(Object.values(c).sort((a, b) => a - b), [18, 25, 25, 26, 26]);
  for (const g of v2.generals) {
    assert.equal(g.portraitId, null, g.id);
    assert.ok([...g.blurb].length <= 14, g.id + ' blurb');
    assert.ok(g.source && g.statNote, g.id);
    const vals = Object.values(g.stats);
    assert.equal(vals.length, 5);
    for (const v of vals) assert.ok(Number.isInteger(v) && v >= 1 && v <= 10, g.id);
  }
});

test('AC 58: no image or font files anywhere under apps/dianjiangtai (code-drawn seals only)', () => {
  const root = path.join(GAME, '..');
  const bad = walkFiles(root, /\.(png|jpe?g|webp|gif|svg|ttf|otf|woff2?)$/i, ['node_modules', 'out']).map((p) => path.relative(root, p));
  assert.deepEqual(bad, []);
});

test('AC 48: the main package (game dir minus packOptions.ignore) is <= 4 MB and the dev/test folders are excluded', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(GAME, 'project.config.json'), 'utf8'));
  const ign = cfg.packOptions.ignore.filter((i) => i.type === 'folder').map((i) => i.value);
  for (const must of ['tests', 'tools', 'node_modules']) assert.ok(ign.includes(must), `${must} must be ignored`);
  const fileIgn = cfg.packOptions.ignore.filter((i) => i.type !== 'folder');
  let bytes = 0;
  (function walk(d, rel) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { if (!ign.includes(r) && !ign.includes(e.name)) walk(path.join(d, e.name), r); }
      else if (!fileIgn.some((f) => (f.type === 'suffix' ? e.name.endsWith(f.value) : f.type === 'file' ? r === f.value : false))) bytes += fs.statSync(path.join(d, e.name)).size;
    }
  })(GAME, '');
  console.log('QA main package bytes:', bytes);
  assert.ok(bytes <= 4 * 1024 * 1024, 'size ' + bytes);
});

test('AC 64/68 code search: every createRewardedVideoAd file sets disableFallbackSharePage:true; reportEvent and getShareInfo never called', () => {
  let creates = 0;
  for (const f of walkFiles(GAME, /\.js$/, ['node_modules', 'tests', 'tools', 'out'])) {
    const code = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/wx\.reportEvent\s*\(/.test(code), f + ' reportEvent');
    assert.ok(!/\.getShareInfo\s*\(/.test(code), f + ' getShareInfo');
    const m = code.match(/createRewardedVideoAd\s*\(/g);
    if (m) { creates += m.length; assert.ok(/disableFallbackSharePage\s*:\s*true/.test(code), f + ' lacks disableFallbackSharePage'); }
  }
  assert.ok(creates >= 1);
});
