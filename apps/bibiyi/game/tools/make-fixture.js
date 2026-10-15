#!/usr/bin/env node
/**
 * Writes the PLACEHOLDER content fixture used until the sourced facts land in
 * apps/bibiyi/content-src/ (a researcher compiles them in parallel).
 *
 * Every fact here is invented: label "样例..." and a synthetic value drawn from
 * a seeded generator. They carry no real-world meaning, must never ship to
 * players, and are flagged `placeholder: true` in the build output. The point
 * is to exercise the pipeline, the deck engine and the tests.
 *
 *   node tools/make-fixture.js            (rewrites tools/fixtures/content-src/*.jsonl)
 */

const fs = require('node:fs');
const path = require('node:path');
const { mulberry32, hash32 } = require('../core/rng');
const { MEASURES } = require('../core/measures');

const OUT = path.join(__dirname, 'fixtures', 'content-src');
const COUNT = 80;

// [min, max, significant digits] of the synthetic values, log-uniform
const RANGES = {
  city_pop: [2e5, 3e7, 4], prov_pop: [3e5, 1.3e8, 4], mountain: [500, 8800, 5], river: [100, 6400, 3], lake: [20, 4500, 3],
  animal_weight: [0.5, 5000, 3], animal_life: [1, 150, 2], space_diameter: [100, 1.4e6, 4], structure_len: [50, 150000, 3],
  structure_height: [10, 830, 3], food_kcal: [20, 900, 3], distance: [100, 4500, 3],
};
const PREFIX = { city_pop: '样例城', prov_pop: '样例省', mountain: '样例山', river: '样例河', lake: '样例湖', year: '样例事', animal_weight: '样例兽', animal_life: '样例禽', space_diameter: '样例星', structure_len: '样例桥', structure_height: '样例塔', food_kcal: '样例菜', distance: '样例线' };

function sig(x, d) {
  const p = Math.pow(10, Math.floor(Math.log10(x)) - d + 1);
  return Math.round(x / p) * p;
}

function make(measure) {
  const m = measure;
  const rng = mulberry32(hash32('fixture:' + m.key));
  const lines = [];
  for (let i = 1; i <= COUNT; i++) {
    const num = String(i).padStart(2, '0');
    const f = {
      id: 'f_' + m.key + '_' + num,
      label: PREFIX[m.key] + num,
      pool: i % 2 === 0 ? 'free' : 'daily',
      source: '占位数据（非真实）',
      publisher: '样例出版方',
      url: 'https://example.com/placeholder/' + m.key,
      licence: 'CC0',
      year: 2020,
      retrievedAt: '2026-10-15',
      verifiedBy: ['author:placeholder', 'verifier:placeholder'],
    };
    if (m.kind === 'year') {
      f.value = Math.round(-2000 + rng() * 4020);
      if (f.value === 0) f.value = 1;
      f.sub = ['始建', '建成', '成书', '问世'][i % 4];
      f.uncertainty = i % 3 === 0 ? Math.round(5 + rng() * 15) : 0;
      f.approx = f.uncertainty > 0;
    } else {
      const r = RANGES[m.key];
      f.value = sig(Math.exp(Math.log(r[0]) + rng() * (Math.log(r[1]) - Math.log(r[0]))), r[2]);
      f.approx = m.key === 'animal_weight' || m.key === 'animal_life' || m.key === 'food_kcal';
    }
    if (m.key === 'prov_pop') f.note = '样例·七普口径';
    lines.push(JSON.stringify(f));
  }
  return lines.join('\n') + '\n';
}

fs.mkdirSync(OUT, { recursive: true });
MEASURES.forEach((m) => fs.writeFileSync(path.join(OUT, m.key + '.jsonl'), make(m), 'utf8'));
console.log('wrote ' + MEASURES.length + ' placeholder files to ' + OUT);
