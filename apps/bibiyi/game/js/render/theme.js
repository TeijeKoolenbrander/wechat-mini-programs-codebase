/**
 * Design tokens for 比一比: a clean printed quiz card (docs/bibiyi/direction.md
 * section 6). Off-white newsprint, ink type, a cinnabar 「比」 seal, one muted
 * accent colour per category. System fonts only (no bundled font files).
 *
 * Display modes (spec 6.19): call applyDisplay(display) once per frame (every
 * screen's draw() does it through W.begin(ctx, L)). It rewrites COLORS and FS
 * IN PLACE, so modules that captured `const C = T.COLORS` stay current.
 *   largeText:   all type x1.25 (body 20, value >= 48), taller buttons
 *   highContrast: white background, pure ink, darker accents, outlined marks
 * Share cards never use this module's mutable palette (see shareCard.js).
 */

const STANDARD = {
  paper: '#FAF7F0',
  paperEdge: '#E8E1D1',
  card: '#FFFFFF',
  sheet: '#FFFDF8',
  ink: '#1F2328',
  sub: '#58606A', // 5.9:1 on paper
  seal: '#B8432F', // cinnabar, 5.0:1 on paper
  sealInk: '#FFF6E8',
  good: '#1F7A6D', // correct teal
  goodSoft: 'rgba(31,122,109,0.12)',
  bad: '#C0392B', // miss vermilion
  badSoft: 'rgba(192,57,43,0.10)',
  line: 'rgba(31,35,40,0.16)',
  lineStrong: 'rgba(31,35,40,0.62)',
  rule: 'rgba(31,35,40,0.80)',
  scrim: 'rgba(24,26,30,0.52)',
  disabled: 'rgba(31,35,40,0.38)',
  skeleton: 'rgba(31,35,40,0.08)',
  toastBg: 'rgba(31,35,40,0.94)',
  adLine: '#7A5A14',
  markOutline: 'rgba(0,0,0,0)',
};

const HIGH_CONTRAST = {
  paper: '#FFFFFF',
  paperEdge: '#000000',
  card: '#FFFFFF',
  sheet: '#FFFFFF',
  ink: '#000000',
  sub: '#262B31', // >= 12:1
  seal: '#8E1F10', // 8.9:1
  sealInk: '#FFFFFF',
  good: '#0B5A4F',
  goodSoft: 'rgba(11,90,79,0.14)',
  bad: '#9B1C10',
  badSoft: 'rgba(155,28,16,0.12)',
  line: 'rgba(0,0,0,0.45)',
  lineStrong: '#000000',
  rule: '#000000',
  scrim: 'rgba(0,0,0,0.62)',
  disabled: 'rgba(0,0,0,0.55)',
  skeleton: 'rgba(0,0,0,0.14)',
  toastBg: '#000000',
  adLine: '#5A3F00',
  markOutline: '#000000',
};

/** Muted category accents (direction 6). Logic puts one in CardFace.accent. */
const ACCENTS = {
  city: '#4C6A88', // 城市 slate blue
  geo: '#2F7F76', // 山河 teal
  era: '#A97A1F', // 古今 ochre
  animal: '#6B7B2C', // 动物 olive
  space: '#4B4F9A', // 天文 indigo
  build: '#7B6250', // 工程 grey-brown
  food: '#C0662B', // 吃喝 persimmon
  dist: '#2F7DA6', // 距离 sea blue
};
const CATEGORY_LABEL = { city: '城市', geo: '山河', era: '古今', animal: '动物', space: '天文', build: '工程', food: '吃喝', dist: '距离' };
const CATEGORY_ORDER = ['city', 'geo', 'era', 'animal', 'space', 'build', 'food', 'dist'];

const SERIF = '"Songti SC","STSong","Noto Serif CJK SC","Source Han Serif SC","Noto Serif SC",serif';
const SANS = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC","Noto Sans SC",sans-serif';

/** Type scale in pt at standard size. Nothing informational goes below `body`. */
const FS_BASE = {
  body: 16,
  bodyL: 18,
  title: 22,
  hero: 30,
  button: 20,
  value: 40, // revealed value (>= 40pt, spec 6.1)
  streak: 64, // result streak (>= 56pt)
  streakHead: 28,
};

const COLORS = Object.assign({}, STANDARD);
const FS = Object.assign({}, FS_BASE);
const MODE = { largeText: false, highContrast: false, k: 1 };

/** Minimum touch target (pt). */
const MIN_TAP = 48;

function applyDisplay(display) {
  const d = display || {};
  const large = !!d.largeText || d.scale === 1.25;
  const hc = !!d.highContrast || d.palette === 'highContrast';
  const k = large ? 1.25 : 1;
  Object.assign(COLORS, hc ? HIGH_CONTRAST : STANDARD);
  Object.keys(FS_BASE).forEach((key) => {
    FS[key] = FS_BASE[key] * k;
  });
  MODE.largeText = large;
  MODE.highContrast = hc;
  MODE.k = k;
}

// ---------------------------------------------------------------- colour maths

function parseHex(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length === 3) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  if (h.length === 6) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  return [88, 96, 106];
}

function toHex(rgb) {
  return '#' + rgb.map((v) => ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2)).join('');
}

function lum(rgb) {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}

/** WCAG contrast ratio of two hex colours. */
function contrast(a, b) {
  const la = lum(parseHex(a));
  const lb = lum(parseHex(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Darken `hex` toward black until it reaches `min`:1 against `bg`. */
function ensureContrast(hex, bg, min) {
  let rgb = parseHex(hex);
  let guard = 0;
  while (contrast(toHex(rgb), bg) < min && guard++ < 40) rgb = rgb.map((v) => v * 0.93);
  return toHex(rgb);
}

/** Accent as a fill behind white marks (3:1 standard, 7:1 high contrast). */
function accentFill(hex) {
  const base = hex || ACCENTS.geo;
  return MODE.highContrast ? ensureContrast(base, '#FFFFFF', 7) : ensureContrast(base, '#FFFFFF', 3.2);
}

/** Accent as text on the card (4.5:1 standard, 7:1 high contrast). */
function accentText(hex) {
  const base = hex || ACCENTS.geo;
  return ensureContrast(base, COLORS.card, MODE.highContrast ? 7 : 4.5);
}

module.exports = {
  COLORS,
  STANDARD,
  HIGH_CONTRAST,
  ACCENTS,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  SERIF,
  SANS,
  FS,
  FS_BASE,
  MODE,
  MIN_TAP,
  applyDisplay,
  contrast,
  ensureContrast,
  accentFill,
  accentText,
};
