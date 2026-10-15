/**
 * Categories, measures and weekday themes (spec 3.1, 4.3). Pure data.
 *
 * A measure is one comparable dimension with one unit. Pairs are only ever
 * made inside one measure. `hi` always means "the bottom value is numerically
 * greater than the top value" (for years: later).
 *
 *   key           measure key (facts reference it)
 *   category      category key
 *   subLabel      card sub-label ("全长"); a fact may override it with `sub`
 *   unit, scale   shown value = raw / scale, with `decimals`; year kind has no scale
 *   hi, lo        the two button verbs, never a bare big/small word (PO-1)
 *   kind          'ratio' (gap = max/min) or 'year' (gap = |delta years|)
 *   minGap        ratio kind: smallest legal max/min; year kind: smallest legal |delta|
 *   knowledgeScale  feeds the typical-player model (spec 4.4)
 */

const CATEGORIES = [
  { key: 'city', label: '城市', accent: '#B5483A' },
  { key: 'geo', label: '山河', accent: '#2F6F8F' },
  { key: 'era', label: '古今', accent: '#8A6A2E' },
  { key: 'animal', label: '动物', accent: '#5B7F3A' },
  { key: 'space', label: '天文', accent: '#4B4A8F' },
  { key: 'build', label: '工程', accent: '#6B6B6B' },
  { key: 'food', label: '吃喝', accent: '#C0762B' },
  { key: 'dist', label: '距离', accent: '#2F8F7F' },
];

const MEASURES = [
  { key: 'city_pop', category: 'city', subLabel: '常住人口（2020）', unit: '万人', scale: 1e4, decimals: 1, hi: '更多', lo: '更少', kind: 'ratio', minGap: 1.1, icon: 'city', knowledgeScale: 0.35 },
  { key: 'prov_pop', category: 'city', subLabel: '常住人口（2020）', unit: '万人', scale: 1e4, decimals: 1, hi: '更多', lo: '更少', kind: 'ratio', minGap: 1.1, icon: 'province', knowledgeScale: 0.35 },
  { key: 'mountain', category: 'geo', subLabel: '海拔', unit: '米', scale: 1, decimals: 2, hi: '更高', lo: '更低', kind: 'ratio', minGap: 1.05, icon: 'mountain', knowledgeScale: 0.2 },
  { key: 'river', category: 'geo', subLabel: '全长', unit: '公里', scale: 1, decimals: 0, hi: '更长', lo: '更短', kind: 'ratio', minGap: 1.1, icon: 'river', knowledgeScale: 0.3 },
  { key: 'lake', category: 'geo', subLabel: '面积', unit: '平方公里', scale: 1, decimals: 0, hi: '更大', lo: '更小', kind: 'ratio', minGap: 1.25, icon: 'lake', knowledgeScale: 0.45 },
  { key: 'year', category: 'era', subLabel: '年代', unit: '年', scale: 1, decimals: 0, hi: '更晚', lo: '更早', kind: 'year', minGap: 30, icon: 'year', knowledgeScale: 1.5 },
  { key: 'animal_weight', category: 'animal', subLabel: '成年体重（约）', unit: '千克', scale: 1, decimals: 1, hi: '更重', lo: '更轻', kind: 'ratio', minGap: 1.5, icon: 'animal', knowledgeScale: 0.6 },
  { key: 'animal_life', category: 'animal', subLabel: '寿命（约）', unit: '年', scale: 1, decimals: 0, hi: '更长', lo: '更短', kind: 'ratio', minGap: 1.5, icon: 'animal', knowledgeScale: 0.6 },
  { key: 'space_diameter', category: 'space', subLabel: '直径', unit: '公里', scale: 1, decimals: 0, hi: '更大', lo: '更小', kind: 'ratio', minGap: 1.05, icon: 'planet', knowledgeScale: 0.5 },
  { key: 'structure_len', category: 'build', subLabel: '全长', unit: '米', scale: 1, decimals: 0, hi: '更长', lo: '更短', kind: 'ratio', minGap: 1.1, icon: 'bridge', knowledgeScale: 0.4 },
  { key: 'structure_height', category: 'build', subLabel: '高度', unit: '米', scale: 1, decimals: 0, hi: '更高', lo: '更低', kind: 'ratio', minGap: 1.1, icon: 'tower', knowledgeScale: 0.4 },
  { key: 'food_kcal', category: 'food', subLabel: '每100克热量（约）', unit: '千卡', scale: 1, decimals: 0, hi: '更高', lo: '更低', kind: 'ratio', minGap: 1.3, icon: 'food', knowledgeScale: 0.5 },
  { key: 'distance', category: 'dist', subLabel: '两地直线距离', unit: '公里', scale: 1, decimals: 0, hi: '更远', lo: '更近', kind: 'ratio', minGap: 1.05, icon: 'distance', knowledgeScale: 0.25 },
];

const BY_KEY = {};
MEASURES.forEach((m) => {
  BY_KEY[m.key] = m;
});
const CAT_BY_KEY = {};
CATEGORIES.forEach((c) => {
  CAT_BY_KEY[c.key] = c;
});

/**
 * Weekday themes (spec 4.3), keyed by Beijing weekday 0 = Sunday. Questions
 * 1-20 come from `categories` (null = mixed), 21-40 are always mixed.
 */
const THEMES = {
  1: { key: 'city', label: '城市', categories: ['city'] },
  2: { key: 'geo', label: '山河', categories: ['geo'] },
  3: { key: 'era', label: '古今', categories: ['era'] },
  4: { key: 'animal', label: '动物', categories: ['animal'] },
  5: { key: 'spacebuild', label: '天文与工程', categories: ['space', 'build'] },
  6: { key: 'foodist', label: '吃喝与距离', categories: ['food', 'dist'] },
  0: { key: 'mix', label: '大杂烩', categories: null },
};

/** Daily theme groups used by the validator's per-group minimum (spec 3.3). */
const THEME_GROUPS = [
  { key: 'city', label: '城市', categories: ['city'] },
  { key: 'geo', label: '山河', categories: ['geo'] },
  { key: 'era', label: '古今', categories: ['era'] },
  { key: 'animal', label: '动物', categories: ['animal'] },
  { key: 'spacebuild', label: '天文与工程', categories: ['space', 'build'] },
  { key: 'foodist', label: '吃喝与距离', categories: ['food', 'dist'] },
];

/** Free-play category filter options (spec 6.14). */
const FREE_GROUPS = [{ key: 'all', label: '全部' }].concat(CATEGORIES.map((c) => ({ key: c.key, label: c.label })));

function getMeasure(key) {
  return BY_KEY[key] || null;
}

function measuresOfCategories(cats) {
  return MEASURES.filter((m) => !cats || cats.indexOf(m.category) >= 0);
}

module.exports = { CATEGORIES, MEASURES, THEMES, THEME_GROUPS, FREE_GROUPS, getMeasure, measuresOfCategories, BY_KEY, CAT_BY_KEY };
