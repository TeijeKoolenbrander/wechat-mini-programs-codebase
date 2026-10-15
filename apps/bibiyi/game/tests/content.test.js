'use strict';
// Content validator (spec 3.7, AC 11-15) and the build pipeline.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateContent, getContent, indexFacts, BANNED_HOSTS, V1_MEASURES, NOT_IN_V1 } = require('../core/content');
const B = require('../tools/build-content');

function good(over) {
  return Object.assign(
    {
      id: 'f_river_x', measure: 'river', pool: 'free', label: '甲河', sub: null, value: 100, approx: false, year: 2013, source: '测试公报', publisher: '测试部', url: 'https://example.com/a',
      licence: 'CC0', retrievedAt: '2026-10-15', verifiedBy: ['author:a', 'verifier:b'], note: null, tags: [], status: 'active', since: 1,
    },
    over || {}
  );
}
const errs = (facts, o) => validateContent(Array.isArray(facts) ? facts : [facts], o).errors;

test('validator accepts a complete fact', () => {
  assert.deepEqual(errs(good()), []);
});

test('validator rejects missing fields, bad licence, non-https and banned hosts, one reviewer (AC 12)', () => {
  assert.ok(errs(good({ source: '' })).some((e) => /missing source/.test(e)));
  assert.ok(errs(good({ publisher: undefined })).some((e) => /missing publisher/.test(e)));
  assert.ok(errs(good({ licence: 'CC-BY-NC-4.0' })).some((e) => /unknown licence/.test(e)));
  assert.ok(errs(good({ url: 'http://example.com/a' })).some((e) => /https/.test(e)));
  assert.ok(errs(good({ url: 'https://zh.wikipedia.org/wiki/x' })).some((e) => /banned source host/.test(e)));
  assert.ok(errs(good({ url: 'https://baike.baidu.com/item/x' })).some((e) => /banned source host/.test(e)));
  assert.ok(errs(good({ verifiedBy: ['author:a', 'author:b'] })).some((e) => /two distinct roles/.test(e)));
  assert.ok(errs(good({ verifiedBy: [] })).some((e) => /two distinct roles/.test(e)));
  assert.ok(errs(good({ retrievedAt: undefined })).some((e) => /retrievedAt/.test(e)));
  assert.ok(errs(good({ measure: 'prov_area' })).some((e) => /unknown measure/.test(e)));
  assert.ok(BANNED_HOSTS.includes('wikipedia.org'));
});

test('validator enforces lengths, value rules, duplicates (AC 11, 14)', () => {
  assert.ok(errs(good({ label: '一二三四五六七八九十一' })).some((e) => /label longer/.test(e)));
  assert.ok(errs(good({ note: '一二三四五六七八九十一二三四五六七八九十一二三四五' })).some((e) => /note longer/.test(e)));
  assert.ok(errs(good({ value: 0 })).some((e) => /ratio value/.test(e)));
  assert.ok(errs(good({ value: -5 })).some((e) => /ratio value/.test(e)));
  assert.ok(errs(good({ value: NaN })).some((e) => /not finite/.test(e)));
  assert.ok(errs(good({ measure: 'year', value: 1420.5 })).some((e) => /integer/.test(e)));
  assert.deepEqual(errs(good({ measure: 'year', value: -221, sub: '建成' })), []);
  const dupId = [good(), good({ label: '乙河' })];
  assert.ok(errs(dupId).some((e) => /duplicate id/.test(e)));
  const dupLabel = [good(), good({ id: 'f_2' })];
  assert.ok(errs(dupLabel).some((e) => /duplicate label/.test(e)));
});

test('validator rejects forbidden terms, exclusion tags, non-city items, province facts without the census note (AC 9, 13)', () => {
  const bad = '猜' + '大小';
  assert.ok(errs(good({ label: bad })).some((e) => /forbidden term/.test(e)));
  assert.ok(errs(good({ note: '运' + '气' })).some((e) => /forbidden term/.test(e)));
  assert.ok(errs(good({ tags: ['politics'] })).some((e) => /exclusion tag/.test(e)));
  assert.ok(errs(good({ tags: ['border-feature'] })).length === 0, 'border-feature is allowed (extra review)');
  assert.ok(errs(good({ measure: 'city_pop', label: '某某自治州' })).some((e) => /prefecture-level/.test(e)));
  assert.ok(errs(good({ measure: 'prov_pop', note: null })).some((e) => /census/.test(e)));
  assert.deepEqual(errs(good({ measure: 'prov_pop', note: '七普口径' })), []);
});

test('validator caps FACT-CITED at 25 per source (AC 12)', () => {
  const many = [];
  for (let i = 0; i < 26; i++) many.push(good({ id: 'f' + i, label: '河' + i, licence: 'FACT-CITED', source: '某工具书' }));
  assert.ok(errs(many).some((e) => /FACT-CITED/.test(e)));
  assert.deepEqual(errs(many.slice(0, 25)), []);
});

test('strict mode checks the v1 minimums and that dropped measures hold nothing (AC 11)', () => {
  const r = validateContent([good()], { strict: true });
  assert.ok(r.errors.some((e) => /measure city_pop: counts 0\/0\/0 below the v1 minimum/.test(e)));
  assert.ok(r.errors.some((e) => /measure river is not in v1 but has 1 facts/.test(e)));
  assert.ok(!r.errors.some((e) => /theme group/.test(e)), 'no weekday themes, no per-theme minimum');
});

test('the real content validates (strict) and the bundled game pool holds no daily fact (AC 15, 22)', () => {
  const r = B.build({ strict: true });
  assert.deepEqual(r.problems, []);
  assert.equal(r.info.placeholder, false);
  const bundled = getContent(1);
  assert.equal(bundled.facts.length, r.info.facts.length);
  const daily = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'out', 'daily-facts.json'), 'utf8'));
  assert.ok(daily.facts.length > 150);
  const freeIds = new Set(bundled.facts.map((f) => f.id));
  const freeLabels = new Set(bundled.facts.map((f) => f.measure + '|' + f.label));
  daily.facts.forEach((f) => {
    assert.ok(!freeIds.has(f.id), f.id);
    assert.ok(!freeLabels.has(f.measure + '|' + f.label), f.label);
  });
  assert.equal(daily.placeholder, false);
  // the on-disk bundle is what the tool would write now
  const onDisk = fs.readFileSync(path.join(__dirname, '..', 'core', 'content', 'facts.free.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(onDisk, r.freeText);
});

test('build tool: fails when a daily fact would reach the game output', () => {
  const free = good({ id: 'f_a', label: '甲河' });
  const daily = good({ id: 'f_b', label: '乙河', pool: 'daily' });
  const text = 'x "id":"f_b" y';
  assert.ok(B.leaks([daily], text, [free]).some((l) => /daily id/.test(l)));
  assert.ok(B.leaks([good({ id: 'f_c', label: '甲河', pool: 'daily' })], 'x', [free]).some((l) => /daily label/.test(l)));
  assert.deepEqual(B.leaks([daily], 'nothing here', [free]), []);
});

test('build tool: reads jsonl and csv, skips excluded measures, keeps client fields only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bby-src-'));
  const row = good({ id: undefined, pool: 'daily', label: '丙河' });
  fs.writeFileSync(path.join(dir, 'river.jsonl'), '# comment\n' + JSON.stringify(row) + '\n\n' + JSON.stringify(good({ id: 'f_z', label: '丁河' })) + '\n');
  fs.writeFileSync(path.join(dir, 'prov_area.jsonl'), JSON.stringify(good({ measure: 'prov_area', label: '某省面积' })) + '\n');
  const csv = 'label,pool,value,approx,year,source,publisher,url,licence,retrievedAt,verifiedBy,tags,note\n' + '"戊,湖",free,640,true,2020,"公报, 第二号",测试部,https://example.com/l,CC0,2026-10-15,author:a|verifier:b,,\n';
  fs.writeFileSync(path.join(dir, 'lake.csv'), csv);
  const r = B.readSource(dir, 1);
  assert.equal(r.facts.length, 3);
  assert.ok(r.warnings.some((w) => /prov_area/.test(w)));
  const lake = r.facts.find((f) => f.measure === 'lake');
  assert.equal(lake.label, '戊,湖');
  assert.equal(lake.value, 640);
  assert.equal(lake.approx, true);
  assert.deepEqual(lake.verifiedBy, ['author:a', 'verifier:b']);
  assert.match(lake.id, /^f_lake_/);
  assert.match(r.facts.find((f) => f.label === '丙河').id, /^f_river_/);
  const client = B.clientFact(Object.assign({}, lake, { tags: ['x'] }));
  assert.equal(client.verifiedBy, undefined);
  assert.equal(client.tags, undefined);
  assert.equal(client.label, '戊,湖');
  assert.deepEqual(B.parseCsv('a,b\n1,"x ""q"" y"\n'), [{ a: '1', b: 'x "q" y' }]);
});

test('every bundled and server-side fact passes the validator and indexes by measure (AC 14)', () => {
  const bundled = getContent(1);
  assert.deepEqual(validateContent(bundled.facts).errors.filter((e) => !/verifiedBy/.test(e)), []);
  const idx = indexFacts(bundled.facts, 1);
  Object.keys(V1_MEASURES).forEach((k) => assert.ok(idx.byMeasure[k].length > 0, k));
  NOT_IN_V1.forEach((k) => assert.equal(idx.byMeasure[k].length, 0, k + ' is not in v1'));
});

test('content decisions of 2026-10-15 hold in the shipped data (a, b, c, e)', () => {
  const free = getContent(1).facts;
  const daily = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'out', 'daily-facts.json'), 'utf8')).facts;
  const all = free.concat(daily);
  // (a) the anecdotal 177-year tortoise is gone; the domestic donkey is not labelled as a wild ass
  assert.ok(!all.some((f) => /象龟/.test(f.label)), 'no giant tortoise record');
  assert.ok(!all.some((f) => /野驴/.test(f.label)), 'no 非洲野驴');
  assert.ok(all.some((f) => f.measure === 'animal_weight' && f.label === '驴'));
  // (c) rivers, lakes and the unsourced measures are not shipped; the empty river file is gone
  ['river', 'lake', 'year', 'structure_len', 'structure_height'].forEach((k) => assert.ok(!all.some((f) => f.measure === k), k));
  assert.ok(!fs.existsSync(path.join(__dirname, '..', '..', 'content-src', 'river.jsonl')));
  // (e) distances: computed, attributed, neutral
  const dist = all.filter((f) => f.measure === 'distance');
  assert.ok(dist.length >= 100, 'distance facts: ' + dist.length);
  dist.forEach((f) => {
    assert.equal(f.method, 'computed');
    assert.equal(f.licence, 'CC-BY-4.0');
    assert.match(f.label, /^.+—.+$/);
    assert.match(f.attribution, /GeoNames/);
    assert.equal(f.value % 10, 0, 'rounded to 10 km: ' + f.label);
  });
  // AnAge facts carry their CC BY 3.0 credit
  all.filter((f) => f.licence === 'CC-BY-3.0').forEach((f) => assert.match(f.attribution, /AnAge/));
});
