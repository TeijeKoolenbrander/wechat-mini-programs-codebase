/**
 * Design tokens for 传画接龙: a sunny classroom doodle wall (direction.md 6). Off-white paper, white note cards with an
 * ink outline and a hard offset shadow, orange primary buttons, vermilion for warnings, doodle blue for links.
 *
 * Display modes (spec 8.13, PO-31): COLORS, FS and friends are LIVE objects. Every screen's draw() starts with
 * applyDisplay(vm.display), which rewrites them in place for standard / large text / high contrast, so
 * `const C = T.COLORS` stays valid in every module. Share cards always use the standard look.
 * The 12 stroke colours (core/strokes.COLORS) are content and are never remapped.
 *
 * System fonts only: no font files in the package (TD-71).
 */

const STANDARD = {
  paper: '#FAF7F0',
  card: '#FFFFFF',
  sheet: '#FFFDF8',
  ink: '#1E1B18',
  sub: '#5C554C', // secondary text, 6.9:1 on paper
  orange: '#F29B30', // primary fill (text on it is ink, 8:1)
  orangeSoft: '#FDEBD0',
  orangeDeep: '#8A4B00', // orange as text on paper (6.2:1)
  verm: '#D8433B', // 朱, fills and the timer warning
  vermText: '#B02B25', // 朱 as text on paper/white (6.4:1)
  vermSoft: 'rgba(216,67,59,0.10)',
  blue: '#3C78C8', // doodle blue, fills
  blueText: '#2459A3', // links and text (6.6:1)
  blueSoft: '#E4EDF9',
  green: '#2E7D4F',
  greenText: '#1F6B3F',
  greenSoft: 'rgba(46,125,79,0.12)',
  tape: '#F2C94C',
  line: 'rgba(30,27,24,0.20)',
  lineStrong: 'rgba(30,27,24,0.75)',
  shadow: 'rgba(30,27,24,0.16)',
  scrim: 'rgba(30,27,24,0.52)',
  skeleton: 'rgba(30,27,24,0.08)',
  disabledFill: '#E9E4D9',
  disabledInk: '#645C52',
  dotOff: 'rgba(30,27,24,0.16)',
  margin: '#EFEAE0', // spare part of a rect around a contain-fitted drawing (spec 5.7)
};

// High contrast (spec 8.13): plain white, pure ink, 2 pt outlines, text >= 7:1, non-text >= 3:1.
const HC = {
  paper: '#FFFFFF',
  card: '#FFFFFF',
  sheet: '#FFFFFF',
  ink: '#000000',
  sub: '#2B2B2B',
  orange: '#F29B30',
  orangeSoft: '#FFFFFF',
  orangeDeep: '#5C3200',
  verm: '#B0160E',
  vermText: '#A0160E',
  vermSoft: '#FFFFFF',
  blue: '#1E4F96',
  blueText: '#18437F',
  blueSoft: '#FFFFFF',
  green: '#0B5A2A',
  greenText: '#0B5A2A',
  greenSoft: '#FFFFFF',
  tape: '#F2C94C',
  line: '#000000',
  lineStrong: '#000000',
  shadow: 'rgba(0,0,0,0)',
  scrim: 'rgba(0,0,0,0.72)',
  skeleton: 'rgba(0,0,0,0.14)',
  disabledFill: '#FFFFFF',
  disabledInk: '#4A4A4A',
  dotOff: 'rgba(0,0,0,0.25)',
  margin: '#DDDDDD',
};

const SANS = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC","Noto Sans SC",sans-serif';

/** Type scale in pt at design scale 1. Nothing informational goes below `body` (16). */
const FS_STD = { body: 16, bodyL: 18, title: 22, hero: 32, button: 20, timer: 20 };
// Large text: body >= 20, buttons >= 56 tall.
const FS_LARGE = { body: 20, bodyL: 22, title: 27, hero: 36, button: 24, timer: 24 };

/** Minimum touch target (pt). */
const MIN_TAP = 48;

// ---- live objects (rewritten in place by setMode)
const COLORS = Object.assign({}, STANDARD);
const FS = Object.assign({}, FS_STD);
const mode = { large: false, hc: false };

function setMode(m) {
  mode.large = !!(m && m.large);
  mode.hc = !!(m && m.hc);
  Object.assign(COLORS, mode.hc ? HC : STANDARD);
  Object.assign(FS, mode.large ? FS_LARGE : FS_STD);
}

/** Read vm.display ({largeText, highContrast}); null/undefined = standard look. */
function applyDisplay(display) {
  const d = display || {};
  setMode({ large: !!d.largeText, hc: !!d.highContrast });
}

/** Snapshot of the current mode, to restore after an excursion (share card). */
function getMode() {
  return { large: mode.large, hc: mode.hc };
}

const isLarge = () => mode.large;
const isHC = () => mode.hc;

/** Vertical spacing multiplier for row heights (1 or 1.25). */
function K() {
  return mode.large ? 1.25 : 1;
}

/** Minimum button height (pt): 56 in large-text mode, else the 48 tap size. */
function minBtn() {
  return mode.large ? 56 : MIN_TAP;
}

/** Button height: the design height, raised to the mode's minimum. */
function btn(L, n) {
  return Math.max(L.u(n), minBtn());
}

/** Outline width: 2 in high contrast, else 1.5 (cards) */
function lw(n) {
  return mode.hc ? Math.max(2, n || 2) : n || 1.5;
}

// ---- contrast helpers (used by tests)
function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(a, b) {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

module.exports = {
  COLORS, STANDARD, HC, SANS, FS, FS_STD, FS_LARGE, MIN_TAP,
  setMode, applyDisplay, getMode, isLarge, isHC, K, minBtn, btn, lw, contrast,
};
