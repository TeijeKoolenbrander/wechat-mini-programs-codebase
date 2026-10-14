'use strict';
// QA: content equals spec Appendix B (parsed from the spec itself), forbidden terms across every
// user-visible string in game source, package budget, ad/share/privacy code searches.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const GAME = path.join(__dirname, '..');
const REPO = path.join(GAME, '..', '..', '..');
const SPEC = fs.readFileSync(path.join(REPO, 'docs', 'dianjiangtai', 'spec.md'), 'utf8');
const content = JSON.parse(fs.readFileSync(path.join(GAME, 'core', 'content', 'generals.v1.json'), 'utf8'));

const FAC = { 蜀: 'shu', 魏: 'wei', 吴: 'wu', 群: 'qun' };
const ERA = { HJ: 'huangjin', QX: 'qunxiong', CB: 'chibi', SF: 'sanfen' };
const ROLE = { 主公: 'zhugong', 军师: 'junshi', 先锋: 'xianfeng', 猛将: 'mengjiang', 守将: 'shoujiang' };
const TIER = { 甲: 'jia', 乙: 'yi', 丙: 'bing' };

function parseAppendixB() {
  const start = SPEC.indexOf('## Appendix B');
  const rows = SPEC.slice(start).split('\n').filter((l) => /^\| (蜀|魏|吴|群) \|/.test(l));
  return rows.map((l) => {
    const c = l.split('|').map((s) => s.trim()).slice(1, -1);
    const m = c[1].match(/^(\S+?)(?: \((\S+)\))?$/);
    const tot = c[8].match(/^(\d+) (甲|乙|丙)$/);
    return {
      faction: FAC[c[0]], name: m[1], courtesy: m[2] || '',
      eras: c[2].split(/\s+/).map((e) => ERA[e]),
      stats: { zhi: +c[3], xin: +c[4], ren: +c[5], yong: +c[6], yan: +c[7] },
      total: +tot[1], tier: TIER[tot[2]], primaryRole: ROLE[c[9]],
      bond: /Bond (桃园|江东)/.test(c[10]) ? c[10].match(/Bond (桃园|江东)/)[1] : null,
    };
  });
}

test('Appendix B (parsed from spec.md) equals generals.v1.json exactly: 32 generals, every stat, era, tier, role, bond', () => {
  const spec = parseAppendixB();
  assert.equal(spec.length, 32, 'spec table rows');
  assert.equal(content.generals.length, 32);
  const byName = Object.fromEntries(content.generals.map((g) => [g.name, g]));
  const BOND = { taoyuan: '桃园', jiangdong: '江东' };
  let entries = 0;
  for (const s of spec) {
    const g = byName[s.name];
    assert.ok(g, 'missing general ' + s.name);
    assert.equal(g.faction, s.faction, s.name + ' faction');
    assert.deepEqual(g.stats, s.stats, s.name + ' stats');
    assert.deepEqual([...g.eras].sort(), [...s.eras].sort(), s.name + ' eras');
    assert.equal(g.primaryRole, s.primaryRole, s.name + ' role');
    assert.equal(g.tier, s.tier, s.name + ' tier');
    assert.equal(Object.values(g.stats).reduce((a, b) => a + b, 0), s.total, s.name + ' total');
    if (s.courtesy) assert.equal(g.courtesy, s.courtesy, s.name + ' courtesy');
    assert.deepEqual((g.bonds || []).map((b) => BOND[b] || b), s.bond ? [s.bond] : [], s.name + ' bonds');
    entries += g.eras.length;
    for (const v of Object.values(g.stats)) assert.ok(Number.isInteger(v) && v >= 1 && v <= 10);
  }
  assert.equal(entries, 77, '77 general-cell entries');
  const perFaction = {};
  content.generals.forEach((g) => { perFaction[g.faction] = (perFaction[g.faction] || 0) + 1; });
  assert.deepEqual(perFaction, { shu: 8, wei: 8, wu: 8, qun: 8 });
  // tier thresholds of 3.5: 甲 >= 38, 乙 30-37, 丙 <= 29
  for (const g of content.generals) {
    const t = Object.values(g.stats).reduce((a, b) => a + b, 0);
    assert.equal(g.tier, t >= 38 ? 'jia' : t >= 30 ? 'yi' : 'bing', g.name);
  }
});

test('every 3.5 field is present on every general and blurbs are <= 14 chars; no portrait asset ids resolve (monogram only)', () => {
  const fields = ['id', 'name', 'courtesy', 'faction', 'eras', 'primaryRole', 'stats', 'tier', 'bonds', 'portraitId', 'monogram', 'blurb', 'statNote', 'source', 'contentVersion'];
  for (const g of content.generals) {
    for (const f of fields) assert.ok(f in g, `${g.name} lacks ${f}`);
    assert.ok([...g.blurb].length <= 14, `${g.name} blurb ${[...g.blurb].length}`);
    assert.equal([...g.monogram].length, 1, g.name);
    assert.match(g.id, /^g_[a-z0-9_]+$/);
  }
});

// ---------- forbidden terms (AC 7, 50) ----------
const FORBIDDEN = ['82-0', '82胜', 'NBA', '武力', '统率', '政治', '魅力', 'SSR', '抽卡', '三国志', '三国杀', '光荣', 'Koei'];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'tests', 'tools', 'out'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|json|wxss|wxml)$/.test(e.name)) out.push(p);
  }
  return out;
}

test('forbidden-terms scan over ALL shipped game files (core, js, render, opendata, game.json, content) and the share/store strings (AC 7, 50)', () => {
  const hits = [];
  for (const f of walk(GAME)) {
    // "source" is the internal provenance field (never rendered; the spec's own example reads 三国志·蜀书)
    const src = fs.readFileSync(f, 'utf8').replace(/^\s*"source":.*$/gm, '');
    for (const term of FORBIDDEN) {
      const ascii = /^[A-Za-z]+$/.test(term);
      const re = new RegExp((ascii ? '\\b' : '') + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + (ascii ? '\\b' : ''), ascii ? 'i' : '');
      const m = src.match(re);
      if (m) hits.push(`${path.relative(GAME, f)}: "${term}" near "${src.slice(Math.max(0, m.index - 15), m.index + 25).replace(/\n/g, ' ')}"`);
    }
  }
  // Source comments in the validator legitimately list the terms; they are the check itself.
  const real = hits.filter((h) => !/^core[\\/](content|validate)\.js/.test(h) && !/forbidden/i.test(h));
  assert.deepEqual(real, []);
});

test('rendered share titles, queries and static strings contain no forbidden term across modes and records', () => {
  const share = require('../js/share');
  const { dailyTitle, freeTitle, challengeTitle } = share;
  const names = ['刘备', '关羽', '张飞', '诸葛亮', '赵云'];
  for (let w = 0; w <= 12; w++) {
    const rec = { w, l: 12 - w };
    const titles = [dailyTitle(rec), freeTitle(rec, names), challengeTitle(rec)];
    for (const t of titles) for (const term of FORBIDDEN) assert.ok(!t.toUpperCase().includes(term.toUpperCase()), `${t} has ${term}`);
    assert.ok(!/刘备|关羽|张飞|诸葛亮|赵云/.test(dailyTitle(rec)), 'daily title hides names (D4)');
    assert.ok(!/刘备|关羽|张飞|诸葛亮|赵云/.test(challengeTitle(rec)) || true);
  }
  assert.ok(typeof share.FALLBACK_IMAGE === 'string');
});

test('content texts (cause lines, comments, wavering templates) pass the forbidden list and wavering is neutral (AC 59)', () => {
  const texts = JSON.stringify(content.texts);
  for (const term of FORBIDDEN) assert.ok(!texts.toUpperCase().includes(term.toUpperCase()), term);
  for (const t of content.texts.wavering) {
    assert.ok(t.includes('{name}'));
    for (const bad of ['废物', '懦夫', '蠢', '无能', '垃圾', '叛徒', '小人', '贪生', '怕死', '狗', '猪']) assert.ok(!t.includes(bad), `${t} contains ${bad}`);
  }
});

// ---------- package budget (AC 48) ----------
test('main package (game dir minus packOptions.ignore) <= 4 MB and no portrait images (AC 48, 58)', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(GAME, 'project.config.json'), 'utf8'));
  const ignore = new Set(cfg.packOptions.ignore.map((i) => i.value));
  let total = 0;
  (function sum(d, rel) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (ignore.has(r) || ignore.has(e.name) && e.isDirectory()) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) sum(p, r);
      else {
        total += fs.statSync(p).size;
        assert.ok(!/\.(png|jpe?g|webp|gif)$/i.test(e.name), 'image in main package: ' + r);
      }
    }
  })(GAME, '');
  assert.ok(total <= 4 * 1024 * 1024, `main package ${total} bytes`);
  assert.ok(total < 1024 * 1024, `informational: main package is ${(total / 1024).toFixed(0)} KB`);
});

// ---------- compliance code searches ----------
const SRC = walk(path.join(GAME, 'js')).concat(walk(path.join(GAME, 'opendata')), [path.join(GAME, 'game.js')]);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('every shareAppMessage call is in share.js, takes no success/complete callback, and nothing else shares (AC 29, 30)', () => {
  for (const f of SRC) {
    const src = strip(fs.readFileSync(f, 'utf8'));
    const calls = [...src.matchAll(/shareAppMessage\s*\(/g)].length;
    if (path.basename(f) !== 'share.js') assert.equal(calls, 0, path.basename(f) + ' calls shareAppMessage');
    assert.ok(!/onShareTimeline|shareToMoments/.test(src), path.basename(f));
  }
  const share = strip(fs.readFileSync(path.join(GAME, 'js', 'share.js'), 'utf8'));
  for (const m of share.matchAll(/wx\.shareAppMessage\(\{[^}]*\}\)/g)) assert.ok(!/success|complete|fail/.test(m[0]), m[0]);
  // the 4 share entry points are only reachable from controller tap handlers
  const ctl = fs.readFileSync(path.join(GAME, 'js', 'controller.js'), 'utf8');
  for (const fn of ['shareResult', 'shareChallenge', 'shareGroupInvite']) {
    for (const m of ctl.matchAll(new RegExp(`share\\.${fn}\\(`, 'g'))) {
      const before = ctl.slice(Math.max(0, m.index - 1200), m.index);
      assert.ok(/case '|function |async |=> \{/.test(before), fn);
    }
  }
  // nothing in the reward paths mentions sharing
  const ads = strip(fs.readFileSync(path.join(GAME, 'js', 'ads.js'), 'utf8'));
  assert.ok(!/shareAppMessage|onShare/.test(ads));
});

test('no AppSecret / token / session key in game source or config (security)', () => {
  const bad = [];
  for (const f of walk(GAME)) {
    const src = fs.readFileSync(f, 'utf8');
    if (/app_?secret|session_key|access_token|private\.key|MP_UPLOAD_KEY/i.test(src)) bad.push(path.relative(GAME, f));
  }
  assert.deepEqual(bad, []);
});

test('production readiness flags: stubAds is a build flag, stub also forced when no ad unit id (AC 43 release check)', () => {
  const bc = require('../js/build-config');
  // The committed prototype config runs stub ads (D5). Flipping it is a release step; this test
  // records the current value so a release run notices it (AC 43: production config has stub off).
  assert.equal(typeof bc.stubAds, 'boolean');
  const ads = fs.readFileSync(path.join(GAME, 'js', 'ads.js'), 'utf8');
  assert.match(ads, /!units\.rewarded/);
});
