'use strict';
// TEST DOUBLE of core/content.js: measures (spec 3.1) and a small SYNTHETIC free pool. Not real facts.
const M = (key, category, subLabel, unit, decimals, hi, lo, kind, minGap, scale, extra) => ({
  key, category, subLabel, unit, base: unit, scale: scale || 1, decimals, hi, lo, kind, minGap, icon: category,
  knowledgeScale: 0.3, ...(extra || {}),
});
const MEASURES = {
  city_pop: M('city_pop', 'city', '常住人口（2020）', '万人', 1, '更多', '更少', 'ratio', 1.1, 1e-4),
  prov_pop: M('prov_pop', 'city', '常住人口（2020）', '万人', 0, '更多', '更少', 'ratio', 1.1, 1e-4),
  mountain: M('mountain', 'geo', '海拔', '米', 0, '更高', '更低', 'ratio', 1.05),
  river: M('river', 'geo', '全长', '公里', 0, '更长', '更短', 'ratio', 1.1),
  lake: M('lake', 'geo', '面积', '平方公里', 0, '更大', '更小', 'ratio', 1.25),
  year: M('year', 'era', '始建', '年', 0, '更晚', '更早', 'year', 30),
  animal_weight: M('animal_weight', 'animal', '成年体重（约）', '千克', 0, '更重', '更轻', 'ratio', 1.5),
  animal_life: M('animal_life', 'animal', '寿命（约）', '年', 0, '更长', '更短', 'ratio', 1.5),
  space_diameter: M('space_diameter', 'space', '直径', '公里', 0, '更大', '更小', 'ratio', 1.05),
  structure_len: M('structure_len', 'build', '全长', '米', 0, '更长', '更短', 'ratio', 1.1),
  structure_height: M('structure_height', 'build', '高度', '米', 0, '更高', '更低', 'ratio', 1.1),
  food_kcal: M('food_kcal', 'food', '每100克热量（约）', '千卡', 0, '更高', '更低', 'ratio', 1.3),
  distance: M('distance', 'dist', '两地直线距离', '公里', 0, '更远', '更近', 'ratio', 1.05),
};
const CATEGORIES = ['city', 'geo', 'era', 'animal', 'space', 'build', 'food', 'dist'];

/** deterministic synthetic fact set: n facts per measure, values spread over ~3 orders of magnitude */
function synth(pool, perMeasure, tag) {
  const out = [];
  for (const m of Object.values(MEASURES)) {
    for (let i = 0; i < perMeasure; i++) {
      const id = `f_${m.key}_${tag}${i}`;
      const jitter = 1 + ((i * 7919) % 13) / 100; // 1.00..1.12, deterministic
      const value = m.kind === 'year' ? -1500 + i * 190 + (i % 3) * 11 : Math.round(100 * Math.pow(1.42, i) * jitter) * (m.scale === 1e-4 ? 1000 : 1);
      out.push({
        id, measure: m.key, pool, label: `${tag}${m.key.slice(0, 4)}${i}`, sub: null, value, approx: false, uncertainty: 0,
        year: 2020, source: '测试来源', publisher: '测试机构', url: 'https://example.cn/x', licence: 'CN-GOV-OTHER',
        retrievedAt: '2026-10-20', verifiedBy: ['author:product-ux', 'verifier:qa'], note: null, tags: [], status: 'active', since: 1,
      });
    }
  }
  return out;
}
const FREE = synth('free', 14, 'F');
const BY_ID = Object.fromEntries(FREE.map((f) => [f.id, f]));

function getContent(v) {
  return v === 1 ? { version: 1, measures: MEASURES, freeFacts: FREE, byId: BY_ID } : null;
}
module.exports = {
  LATEST_CONTENT_VERSION: 1,
  MEASURES, CATEGORIES, synth,
  getContent,
  getMeasures: () => MEASURES,
  getFreeFacts: (v) => (v === 1 ? FREE : null),
  getFreeFact: (v, id) => (v === 1 ? BY_ID[id] || null : null),
};
