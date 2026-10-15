'use strict';
// contentVersion 2 (AC 69, AC 74 diff check, AC 7): the 120-general roster equals spec Appendix C (parsed from the
// spec itself), the 32 Phase 1 generals keep their exact Appendix B stats, coverage, bonds, forbidden terms.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const C = require('../core/content');

const GAME = path.join(__dirname, '..');
const SPEC = fs.readFileSync(path.join(GAME, '..', '..', '..', 'docs', 'dianjiangtai', 'spec.md'), 'utf8');
const v1 = require('../core/content/generals.v1.js');
const content = C.getContent(2);

const FAC = { 蜀: 'shu', 魏: 'wei', 吴: 'wu', 群: 'qun', 晋: 'jin' };
const ERA = { HJ: 'huangjin', QX: 'qunxiong', CB: 'chibi', SF: 'sanfen', GJ: 'guijin' };
const ROLE = { 主公: 'zhugong', 军师: 'junshi', 先锋: 'xianfeng', 猛将: 'mengjiang', 守将: 'shoujiang' };
const TIER = { 甲: 'jia', 乙: 'yi', 丙: 'bing' };

function parseAppendixC() {
  const sec = SPEC.slice(SPEC.indexOf('## Appendix C'));
  let primary = null;
  const rows = [];
  for (const l of sec.split('\n')) {
    const h = l.match(/^### (蜀|魏|吴|群|晋) \(primary/);
    if (h) primary = FAC[h[1]];
    if (!/^\| \d+ \|/.test(l)) continue;
    const c = l.split('|').map((s) => s.trim()).slice(1, -1);
    const m = c[1].replace('◆ ', '').match(/^(\S+?)(?: \((\S+)\))?$/);
    const tot = c[8].match(/^(\d+) (甲|乙|丙)$/);
    rows.push({
      n: +c[0], old: c[1].startsWith('◆'), name: m[1], courtesy: m[2] || '', primary,
      apps: c[2].split(';').map((s) => {
        const [f, es] = s.split(':').map((x) => x.trim());
        return { faction: FAC[f], eras: es.split(/\s+/).map((e) => ERA[e]) };
      }),
      stats: { zhi: +c[3], xin: +c[4], ren: +c[5], yong: +c[6], yan: +c[7] },
      total: +tot[1], tier: TIER[tot[2]], role: ROLE[c[9]],
    });
  }
  return rows;
}

function parseAppendixB() {
  const start = SPEC.indexOf('## Appendix B');
  const end = SPEC.indexOf('## Appendix C');
  return SPEC.slice(start, end).split('\n').filter((l) => /^\| (蜀|魏|吴|群) \|/.test(l)).map((l) => {
    const c = l.split('|').map((s) => s.trim()).slice(1, -1);
    const m = c[1].match(/^(\S+?)(?: \((\S+)\))?$/);
    return { name: m[1], stats: { zhi: +c[3], xin: +c[4], ren: +c[5], yong: +c[6], yan: +c[7] } };
  });
}

const ROWS = parseAppendixC();

test('Appendix C parses to 120 rows with the section primary counts 26/26/25/25/18', () => {
  assert.equal(ROWS.length, 120);
  const per = {};
  ROWS.forEach((r) => (per[r.primary] = (per[r.primary] || 0) + 1));
  assert.deepEqual(per, { shu: 26, wei: 26, wu: 25, qun: 25, jin: 18 });
});

test('generals.v2.js equals Appendix C: name, courtesy, primary faction, appearances, stats, tier, role (AC 69)', () => {
  assert.equal(content.generals.length, 120);
  assert.equal(new Set(content.generals.map((g) => g.id)).size, 120);
  const byName = Object.fromEntries(content.generals.map((g) => [g.name, g]));
  for (const r of ROWS) {
    const g = byName[r.name];
    assert.ok(g, 'missing ' + r.name);
    assert.equal(g.faction, r.primary, r.name + ' primary faction');
    assert.equal(g.courtesy, r.courtesy, r.name + ' courtesy');
    assert.deepEqual(g.stats, r.stats, r.name + ' stats');
    assert.equal(Object.values(g.stats).reduce((a, b) => a + b, 0), r.total, r.name + ' total');
    assert.equal(g.tier, r.tier, r.name + ' tier');
    assert.equal(g.primaryRole, r.role, r.name + ' role');
    const got = g.appearances.map((a) => ({ faction: a.faction, eras: a.eras }));
    assert.deepEqual(got.sort((a, b) => a.faction.localeCompare(b.faction)), r.apps.slice().sort((a, b) => a.faction.localeCompare(b.faction)), r.name + ' appearances');
    const union = [...new Set(r.apps.flatMap((a) => a.eras))];
    assert.deepEqual([...g.eras].sort(), union.sort(), r.name + ' eras are the union');
    assert.ok(g.appearances.some((a) => a.faction === g.faction), r.name + ' primary faction has an appearance');
    assert.equal(g.contentVersion, 2);
    assert.equal(g.portraitId, null);
    assert.ok(g.statNote.length > 0 && g.source.length > 0);
    assert.ok([...g.blurb].length <= 14 && [...g.blurb].length >= 4, r.name + ' blurb');
    assert.equal([...g.monogram].length, 1);
    assert.match(g.id, /^g_[a-z]+$/);
  }
});

test('the 32 Phase 1 generals keep their exact Appendix B stats (AC 69, AC 74 diff check)', () => {
  const b = parseAppendixB();
  assert.equal(b.length, 32);
  const v2 = Object.fromEntries(content.generals.map((g) => [g.name, g]));
  const old = Object.fromEntries(v1.generals.map((g) => [g.name, g]));
  for (const r of b) {
    assert.deepEqual(v2[r.name].stats, r.stats, r.name + ' vs Appendix B');
    assert.deepEqual(v2[r.name].stats, old[r.name].stats, r.name + ' vs generals.v1.js');
    assert.equal(v2[r.name].id, old[r.name].id, r.name + ' id is stable');
    assert.equal(v2[r.name].blurb, old[r.name].blurb);
  }
  assert.equal(ROWS.filter((r) => r.old).length, 32);
});

test('validateContent(v2) is clean and catches the AC 69 violations', () => {
  assert.deepEqual(C.validateContent(content), []);
  const mutate = (fn) => {
    const raw = JSON.parse(JSON.stringify({ generals: content.generals, texts: content.texts }));
    fn(raw);
    return C.validateContent(Object.assign({}, content, raw));
  };
  assert.ok(mutate((r) => r.generals.pop()).some((e) => /expected 120/.test(e)));
  assert.ok(mutate((r) => (r.generals[3].stats.zhi = 11)).some((e) => /stat zhi/.test(e)));
  assert.ok(mutate((r) => (r.generals[3].tier = 'bing')).some((e) => /tier/.test(e)));
  assert.ok(mutate((r) => (r.generals[3].eras = ['sanfen'])).some((e) => /union/.test(e)));
  assert.ok(mutate((r) => (r.generals[3].portraitId = 'p')).some((e) => /portraitId/.test(e)));
  assert.ok(mutate((r) => r.generals[3].appearances.push(r.generals[3].appearances[0])).some((e) => /two appearances/.test(e)));
  const jin = content.generals.findIndex((g) => g.faction === 'jin');
  assert.ok(mutate((r) => (r.generals[jin].appearances[0].eras = ['sanfen'])).some((e) => /晋 appearance outside guijin/.test(e)));
  assert.ok(mutate((r) => (r.generals[3].blurb = '一二三四五六七八九十一二三四五')).some((e) => /blurb/.test(e)));
  for (const term of C.FORBIDDEN_TERMS.concat(['传说', '稀有'])) {
    assert.ok(mutate((r) => (r.generals[5].statNote = '含' + term)).some((e) => e.includes('forbidden term "' + term + '"')), term);
  }
});

test('cells: 21 used cells with >= 4 generals, the 4 unused 晋 cells are empty, sizes equal the spec table, 273 entries (AC 69)', () => {
  const eras = ['huangjin', 'qunxiong', 'chibi', 'sanfen', 'guijin'];
  const expect = { shu: [4, 7, 17, 22, 9], wei: [4, 18, 17, 23, 9], wu: [5, 16, 14, 15, 13], qun: [11, 27, 12, 4, 4], jin: [0, 0, 0, 0, 22] };
  let total = 0;
  for (const f of Object.keys(expect)) {
    expect[f].forEach((n, i) => {
      const got = content.cells[C.cellKey(f, eras[i])].length;
      assert.equal(got, n, `${f}/${eras[i]}`);
      total += got;
    });
  }
  assert.equal(total, 273);
  assert.equal(content.validCells.length, 21);
  for (const c of content.validCells) assert.ok(content.cells[C.cellKey(c.faction, c.era)].length >= 4);
  assert.equal(content.minCell, 4);
  assert.equal(content.factions.length, 5);
  assert.equal(content.eras.length, 5);
});

test('counts from Appendix C: tiers, faction membership, multi-appearance, event coverage', () => {
  const tiers = { jia: 0, yi: 0, bing: 0 };
  content.generals.forEach((g) => tiers[g.tier]++);
  assert.deepEqual(tiers, { jia: 18, yi: 67, bing: 35 });
  const member = {};
  content.generals.forEach((g) => g.appearances.forEach((a) => (member[a.faction] = (member[a.faction] || 0) + 1)));
  assert.deepEqual(member, { shu: 28, wei: 34, wu: 28, qun: 38, jin: 22 });
  assert.equal(content.generals.filter((g) => g.appearances.length > 1).length, 26);
  const names = (f) => content.generals.filter(f).map((g) => g.name);
  assert.equal(names((g) => g.stats.xin <= 3).length, 11);
  assert.equal(names((g) => g.stats.zhi >= 9).length, 21);
  assert.equal(names((g) => g.stats.yong === 10).length, 8);
  assert.deepEqual(names((g) => g.stats.xin <= 2).sort(), ['公孙渊', '吕布', '董卓', '糜芳', '孟达', '钟会'].sort());
  // era counts
  const perEra = {};
  content.generals.forEach((g) => g.eras.forEach((e) => (perEra[e] = (perEra[e] || 0) + 1)));
  assert.deepEqual(perEra, { huangjin: 24, qunxiong: 60, chibi: 56, sanfen: 59, guijin: 48 });
});

test('16 bonds with the spec members; each is achievable (all members exist and none sits in the same pool slot twice)', () => {
  const spec = {
    taoyuan: ['刘备', '关羽', '张飞'], jiangdong: ['孙策', '周瑜'], longfeng: ['诸葛亮', '庞统'], suwei: ['许褚', '典韦'],
    xiliang: ['马超', '马岱', '庞德'], shiyuan: ['甘宁', '凌统'], shenting: ['孙策', '太史慈'], xiapi: ['吕布', '陈宫', '高顺'],
    hebei: ['袁绍', '沮授', '颜良'], pingluan: ['皇甫嵩', '朱儁', '卢植'], ershi: ['邓艾', '钟会'], pingwu: ['羊祜', '杜预', '王濬'],
    henei: ['司马懿', '司马师', '司马昭'], fuzi_guan: ['关羽', '关平'], fuzi_lu: ['陆逊', '陆抗'], houji: ['蒋琬', '费祎', '姜维'],
  };
  assert.equal(content.bonds.length, 16);
  for (const b of content.bonds) {
    assert.deepEqual(b.members.map((id) => content.byId[id].name), spec[b.key], b.key);
    assert.equal(b.bonus, 0.04);
    // every member lists the bond, and only members do
    for (const g of content.generals) assert.equal(g.bonds.includes(b.key), b.members.includes(g.id), `${g.name} ${b.key}`);
    // achievable in one run: members can be matched to 5 distinct rounds' cells (any cells, any appearances)
    assert.ok(b.members.length <= 5);
  }
  assert.equal(content.bonds.filter((b) => b.label === '父子同袍').length, 2);
});

test('forbidden terms (AC 7, 50) over every user-visible v2 string, appearance notes included', () => {
  const visible = content.generals.map((g) => Object.assign({}, g, { source: '' }));
  const strings = C.collectStrings({ visible, texts: content.texts, bonds: content.bonds, factions: content.factions, eras: content.eras }, []);
  const terms = ['82-0', '82胜', 'NBA', '武力', '统率', '政治', '魅力', 'SSR', '抽卡', '三国志', '三国杀', '光荣', 'Koei', '传说', '稀有'];
  for (const s of strings) for (const t of terms) assert.ok(!s.toUpperCase().includes(t.toUpperCase()), `"${t}" in "${s}"`);
  for (const g of content.generals) for (const a of g.appearances) if (a.note) assert.ok([...a.note].length <= 6, g.name);
});

test('wavering templates stay neutral for the 11 qualifying generals (AC 59)', () => {
  for (const t of content.texts.wavering) {
    assert.ok(t.includes('{name}'));
    for (const bad of ['废物', '懦夫', '蠢', '无能', '垃圾', '叛徒', '小人', '贪生', '怕死', '狗', '猪']) assert.ok(!t.includes(bad));
  }
});

test('v1 content is intact: 32 generals, 16 cells, 2 bonds, validates as before', () => {
  const c1 = C.getContent(1);
  assert.equal(c1.generals.length, 32);
  assert.equal(c1.validCells.length, 16);
  assert.equal(c1.bonds.length, 2);
  assert.equal(c1.minCell, 2);
  assert.equal(c1.factions.length, 4);
  assert.deepEqual(C.validateContent(c1), []);
  assert.ok(c1.generals.every((g) => g.appearances.length === 1));
});
