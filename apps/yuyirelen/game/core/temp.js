/**
 * Rank -> temperature and band (spec 4.3). Pure.
 *   T = round(100 * (1 - ln r / ln V)); T(1) = 100, T(V) = 0.
 * Bands are by rank; the word is always shown next to the colour.
 */

const BANDS = [
  { key: 'hit', label: '命中', max: 1, color: '#C9973A' },
  { key: 'boil', label: '沸', max: 10, color: '#A3222B' },
  { key: 'scald', label: '烫', max: 100, color: '#D2492A' },
  { key: 'hot', label: '热', max: 500, color: '#E08A2E' },
  { key: 'warm', label: '温', max: 2000, color: '#C9B27A' },
  { key: 'cold', label: '冷', max: Infinity, color: '#5E7FA3' },
];

function temperature(rank, V) {
  if (!(V > 1) || rank <= 1) return 100;
  if (rank >= V) return 0;
  return Math.round(100 * (1 - Math.log(rank) / Math.log(V)));
}

function bandOf(rank) {
  for (let i = 0; i < BANDS.length; i++) if (rank <= BANDS[i].max) return BANDS[i];
  return BANDS[BANDS.length - 1];
}

function bandByKey(key) {
  for (let i = 0; i < BANDS.length; i++) if (BANDS[i].key === key) return BANDS[i];
  return BANDS[BANDS.length - 1];
}

/** 1284 -> "1,284" */
function formatCount(n) {
  const s = String(Math.max(0, Math.floor(n)));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return out;
}

/** 1284 -> "第 1,284 名" */
function rankLabel(rank) {
  return '第 ' + formatCount(rank) + ' 名';
}

module.exports = { BANDS, temperature, bandOf, bandByKey, formatCount, rankLabel };
