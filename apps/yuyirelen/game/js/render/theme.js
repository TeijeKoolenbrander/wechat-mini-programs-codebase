/**
 * Design tokens for 语义热冷: "a clean thermometer on warm paper".
 * Warm off-white paper, ink text, and a six-step temperature palette
 * (cold slate blue -> gold). Band words are always printed next to the colour.
 *
 * System fonts only (no bundled font files, the main package stays small).
 *
 * Display modes (spec 8.11): applyDisplay({largeText, highContrast}) rewrites
 * COLORS / FS / METRICS IN PLACE, so every module that holds a reference to
 * them sees the change on the next frame. Every screen's draw() calls
 * applyDisplay(vm.display) first; a missing display means "default".
 * The share card never reads these tokens (it has its own fixed palette).
 */

const BASE = {
  paper: '#F6F1E7',
  paperDeep: '#EDE5D4',
  surface: '#FFFDF8', // raised cards
  sheet: '#FBF7EE',
  ink: '#1E1B18',
  sub: '#5F574D', // 6.3:1 on paper
  line: 'rgba(30,27,24,0.16)',
  lineStrong: 'rgba(30,27,24,0.55)',
  scrim: 'rgba(30,27,24,0.52)',
  track: '#E4DBC8', // thermometer bar track
  trackEdge: 'rgba(30,27,24,0.30)',
  skeleton: 'rgba(30,27,24,0.08)',
  accent: '#C43D1C', // links and emphasis text (same hue as 烫)
  good: '#2F7A4D',
  onInk: '#F6F1E7', // text on the ink-filled primary button
  barOutline: 'rgba(0,0,0,0)', // bars get a 2pt outline in high contrast
  disabledFill: 'rgba(30,27,24,0.06)',
  disabledInk: 'rgba(30,27,24,0.45)',
};

/** Band fills (hot = close). Keys follow the view model's Row.band. */
const BAND_BASE = {
  cold: '#4F7196',
  warm: '#C9B27A',
  hot: '#E08A2E',
  scald: '#C43D1C',
  boil: '#A3222B',
  hit: '#C9973A',
};

const HC = {
  paper: '#FFFFFF',
  paperDeep: '#F0F0F0',
  surface: '#FFFFFF',
  sheet: '#FFFFFF',
  ink: '#000000',
  sub: '#2B2B2B',
  line: 'rgba(0,0,0,0.55)',
  lineStrong: '#000000',
  scrim: 'rgba(0,0,0,0.65)',
  track: '#E6E6E6',
  trackEdge: '#000000',
  skeleton: 'rgba(0,0,0,0.12)',
  accent: '#96260A',
  good: '#1E5C36',
  onInk: '#FFFFFF',
  barOutline: '#000000',
  disabledFill: 'rgba(0,0,0,0.06)',
  disabledInk: 'rgba(0,0,0,0.62)',
};
const BAND_HC = {
  cold: '#2B4A6F',
  warm: '#5C480C',
  hot: '#7A3F00',
  scald: '#96260A',
  boil: '#8A1220',
  hit: '#5E4500',
};

const COLORS = Object.assign({}, BASE);
const BAND_COLOR = Object.assign({}, BAND_BASE);

/** Band metadata: word shown next to the bar, rank range text for the how-to picture. */
const BANDS = ['cold', 'warm', 'hot', 'scald', 'boil', 'hit'];
const BAND_LABEL = { cold: '冷', warm: '温', hot: '热', scald: '烫', boil: '沸', hit: '命中' };

/** Band from a rank (spec 4.3); used when the vm only supplies a number. */
function bandOfRank(r) {
  if (r <= 1) return 'hit';
  if (r <= 10) return 'boil';
  if (r <= 100) return 'scald';
  if (r <= 500) return 'hot';
  if (r <= 2000) return 'warm';
  return 'cold';
}

/** Band from a 0..100 temperature (inverse of T = 100 * (1 - ln r / ln V), V = 30,000). */
function bandOfTemp(t) {
  if (t >= 100) return 'hit';
  const r = Math.exp((1 - Math.max(0, t) / 100) * Math.log(30000));
  return bandOfRank(Math.round(r));
}

const SERIF = '"Songti SC","STSong","Noto Serif CJK SC","Source Han Serif SC",serif';
const SANS = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif';

/** Type scale in pt at design scale 1. Nothing informational goes below `body`. */
const FS_BASE = { body: 16, bodyL: 18, chip: 20, title: 22, hero: 30, answer: 56, button: 20, word: 22 };
const FS_LARGE = { body: 20, bodyL: 22, chip: 24, title: 26, hero: 34, answer: 60, button: 24, word: 26 };
const FS = Object.assign({}, FS_BASE);

/** Minimum touch target (pt) and the standard control height. */
const MIN_TAP = 48;
const METRICS = { tap: 48, btn: 52, chipH: 48, rowH: 60, large: false, hc: false };

function applyDisplay(d) {
  const large = !!(d && d.largeText);
  const hc = !!(d && d.highContrast);
  Object.assign(COLORS, hc ? HC : BASE);
  Object.assign(BAND_COLOR, hc ? BAND_HC : BAND_BASE);
  Object.assign(FS, large ? FS_LARGE : FS_BASE);
  METRICS.large = large;
  METRICS.hc = hc;
  METRICS.tap = large ? 56 : 48;
  METRICS.btn = large ? 60 : 52;
  METRICS.chipH = large ? 56 : 48;
  METRICS.rowH = large ? 84 : 60;
  return { large, hc };
}

// ------------------------------------------------------------ contrast

function parseColor(c) {
  c = String(c);
  let m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  m = /^#([0-9a-f]{3})$/i.exec(c);
  if (m) return m[1].split('').map((h) => parseInt(h + h, 16));
  m = /^rgba?\(([^)]+)\)$/.exec(c);
  if (m) return m[1].split(',').slice(0, 3).map((v) => Number(v));
  return [0, 0, 0];
}

function luminance(c) {
  const [r, g, b] = parseColor(c).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two opaque colours. */
function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Whichever of white / ink reads better on `bg`. */
function textOn(bg) {
  return contrast(bg, '#FFFFFF') >= contrast(bg, '#1E1B18') ? '#FFFFFF' : '#1E1B18';
}

function bandColor(band) {
  return BAND_COLOR[band] || BAND_COLOR.cold;
}

/** The base (default-mode) token sets, for the contrast test and the docs. */
const PALETTES = {
  default: { colors: BASE, bands: BAND_BASE },
  highContrast: { colors: HC, bands: BAND_HC },
};

module.exports = {
  COLORS,
  BAND_COLOR,
  BANDS,
  BAND_LABEL,
  bandOfRank,
  bandOfTemp,
  bandColor,
  SERIF,
  SANS,
  FS,
  MIN_TAP,
  METRICS,
  PALETTES,
  applyDisplay,
  contrast,
  textOn,
  luminance,
  parseColor,
};
