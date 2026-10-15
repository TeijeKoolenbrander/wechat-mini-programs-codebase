/**
 * Small formatting helpers the renderers share. Pure.
 *
 * Display formatting of facts (thousands separators, 万 scaling, decimals,
 * 约, 公元前) belongs to core/format.js; the renderer only receives finished
 * strings. These helpers exist for (a) the count-up animation, which has to
 * re-format a number while it grows, and (b) preview fixtures and share
 * titles. formatNumber/formatCompact mirror the spec's rules.
 */

function clamp01(p) {
  return Math.max(0, Math.min(1, p));
}

/** 6300 -> "6,300"; 2093.78 with decimals 1 -> "2,093.8". */
function formatNumber(n, decimals) {
  const d = decimals || 0;
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(d);
  const parts = fixed.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + parts.join('.');
}

/** 20937757 -> "2,093.8 万"; 1411778724 -> "14.12 亿"; small numbers stay plain. */
function formatCompact(n) {
  const a = Math.abs(n);
  if (a >= 1e8) return formatNumber(n / 1e8, 2) + ' 亿';
  if (a >= 1e4) return formatNumber(n / 1e4, a >= 1e7 ? 1 : 2) + ' 万';
  return formatNumber(n, 0);
}

/** Years as the cards show them: -221 -> "公元前 221 年", 1056 -> "1056 年". */
function formatYear(y, approx) {
  const base = y < 0 ? '公元前 ' + Math.abs(y) + ' 年' : y + ' 年';
  return (approx ? '约 ' : '') + base;
}

/**
 * Re-format valueText while counting up: the first run of digits (with commas
 * and an optional decimal part) is scaled by an ease-out curve; every other
 * character stays. Same thousands grouping and decimals as the final text.
 * Returns the text unchanged for p >= 1 or when there are no digits.
 */
function countUp(text, p) {
  if (text == null) return text;
  const q = clamp01(p);
  if (q >= 1) return text;
  const m = /(\d[\d,]*)(\.(\d+))?/.exec(text);
  if (!m) return text;
  const dec = m[3] ? m[3].length : 0;
  const target = Number(m[1].replace(/,/g, '') + (m[3] ? '.' + m[3] : ''));
  const e = 1 - Math.pow(1 - q, 3);
  const v = target * e;
  const grouped = m[1].indexOf(',') >= 0;
  const s = grouped ? formatNumber(v, dec) : dec ? v.toFixed(dec) : String(Math.round(v));
  return text.slice(0, m.index) + s + text.slice(m.index + m[0].length);
}

/** "连对 14" style helper for tests and fixtures. */
function streakLine(n) {
  return '连对 ' + n;
}

/** Marks for the share card: boolean[] -> the shown subset (max 60). */
function clampMarks(marks) {
  return (marks || []).slice(0, 60);
}

module.exports = { formatNumber, formatCompact, formatYear, countUp, streakLine, clampMarks, clamp01 };
