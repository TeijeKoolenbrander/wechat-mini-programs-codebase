/**
 * The spectrum library, content version 1 (spec 4.1). A CommonJS module (mini games can only
 * require .js files, PD-19). The text is written in compact form under ./src/<category>.js and
 * expanded here into the model of spec 4.1. Ids are assigned in category order then file order,
 * so NEVER reorder or delete entries in src/*.js: only append (a removed entry is replaced by a
 * `null` so later ids do not shift).
 *
 * Source form of one spectrum:  [left, right, 'item|item|...']
 * Source form of one item:      text + anchor [+ '~'] [+ '#' + tag]
 *   - text: Chinese characters only, no digits (the anchor follows it directly)
 *   - anchor: the editor's honest guess of the national median, integer 5..95
 *   - '~'  : tag `split` (expected to divide people)
 *   - tag  : '#p' '#u' '#a' '#w' -> season:spring/summer/autumn/winter,
 *            '#f.<key>' -> festival:<key> (see calendar.v1.js)
 *   - `easy` is derived: anchor <= 20 or >= 80
 */

const CATEGORIES = [
  { key: 'food', label: '吃喝' },
  { key: 'life', label: '日常' },
  { key: 'home', label: '居家物件' },
  { key: 'animal', label: '动物' },
  { key: 'nature', label: '天气自然' },
  { key: 'senses', label: '感官' },
  { key: 'leisure', label: '休闲爱好' },
  { key: 'travel', label: '出行' },
  { key: 'study', label: '学习工作' },
  { key: 'tech', label: '物件科技' },
  { key: 'feel', label: '心情感受' },
  { key: 'memory', label: '童年回忆' },
];

const SEASON = { p: 'spring', u: 'summer', a: 'autumn', w: 'winter' };

function pad(n, w) {
  let s = String(n);
  while (s.length < w) s = '0' + s;
  return s;
}

function parseItem(src, spectrumId, k) {
  const m = /^([^0-9~#]+)(\d{1,2})(~)?(?:#(.+))?$/.exec(src);
  if (!m) throw new Error('bad item "' + src + '" in ' + spectrumId);
  const anchor = Number(m[2]);
  const tags = [];
  if (anchor <= 20 || anchor >= 80) tags.push('easy');
  if (m[3]) tags.push('split');
  if (m[4]) {
    if (m[4].indexOf('f.') === 0) tags.push('festival:' + m[4].slice(2));
    else if (SEASON[m[4]]) tags.push('season:' + SEASON[m[4]]);
    else throw new Error('bad tag "' + m[4] + '" in ' + spectrumId);
  }
  return { id: spectrumId + 'i' + pad(k, 2), text: m[1], anchor, tags };
}

const SOURCES = [
  ['food', require('./src/food')],
  ['life', require('./src/life')],
  ['home', require('./src/home')],
  ['animal', require('./src/animal')],
  ['nature', require('./src/nature')],
  ['senses', require('./src/senses')],
  ['leisure', require('./src/leisure')],
  ['travel', require('./src/travel')],
  ['study', require('./src/study')],
  ['tech', require('./src/tech')],
  ['feel', require('./src/feel')],
  ['memory', require('./src/memory')],
];

const spectra = [];
let counter = 0;
SOURCES.forEach((pair) => {
  const cat = pair[0];
  pair[1].forEach((entry) => {
    counter++;
    if (entry === null) return; // retired entry: its id is never reused
    const id = 's' + pad(counter, 3);
    const items = entry[2].split('|').map((s, k) => parseItem(s.trim(), id, k + 1));
    spectra.push({ id, left: entry[0], right: entry[1], cat, items });
  });
});

module.exports = { contentVersion: 1, categories: CATEGORIES, spectra };
