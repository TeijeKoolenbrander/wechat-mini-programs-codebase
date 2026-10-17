/**
 * Design tokens for 群友刻度盘: a sunny desk with a paper tape measure and sticky notes (docs/kedupan/direction.md section 6).
 * Colours follow the avatar: purple field, yellow tape, tangerine pointer, teal diamond, plum dot.
 *
 * Display modes (spec 6.11, PD-16): COLORS and FS are LIVE objects. Every screen's draw() starts with
 * applyDisplay(vm.display), which rewrites them in place for standard / large text / high contrast, so
 * `const C = T.COLORS` stays valid in every module. Share cards always use the standard look.
 * System fonts only (no font files; the main package stays small).
 */

const STANDARD = {
  paper: '#FBF6EC',
  paperTop: '#FFF9EC',
  paperBottom: '#F4EAD3',
  tile: '#FFFDF8',
  sheet: '#FFFBF2',
  ink: '#24211E',
  sub: '#5C5348', // 6.9:1 on paper
  line: 'rgba(36,33,30,0.20)',
  lineStrong: 'rgba(36,33,30,0.55)',
  scrim: 'rgba(36,24,44,0.55)',
  tape: '#F2C94C',
  tapeEdge: '#B8901C',
  tapeShadow: 'rgba(90,60,10,0.22)',
  tick: '#24211E',
  // markers (shape AND colour; PD-16)
  you: '#F07B2C',
  nation: '#2A8C8C',
  group: '#7D4E8C',
  markerOutline: '#FBF6EC',
  // marker colours for text on paper (>= 4.5:1)
  youText: '#A8470A',
  nationText: '#1D6666',
  groupText: '#6D3F7C',
  // buttons
  primary: '#6A3C7C',
  primaryInk: '#FFFFFF',
  primaryShadow: 'rgba(60,24,76,0.35)',
  noteBlue: '#CFE3F5',
  noteOrange: '#FFD3A8',
  noteYellow: '#FFF0B3',
  noteShadow: 'rgba(60,40,20,0.18)',
  band: 'rgba(240,123,44,0.55)',
  bandEdge: '#C8571A',
  good: '#1F6B3A',
  danger: '#B3261E',
  disabled: 'rgba(36,33,30,0.42)',
  skeleton: 'rgba(36,33,30,0.09)',
  tintPrimary: 'rgba(106,60,124,0.10)',
  tintYou: 'rgba(240,123,44,0.14)',
  tintNation: 'rgba(42,140,140,0.14)',
  tintGroup: 'rgba(125,78,140,0.14)',
};

const HC = {
  paper: '#FFFFFF',
  paperTop: '#FFFFFF',
  paperBottom: '#FFFFFF',
  tile: '#FFFFFF',
  sheet: '#FFFFFF',
  ink: '#000000',
  sub: '#1F1F1F',
  line: '#5A5A5A',
  lineStrong: '#000000',
  scrim: 'rgba(0,0,0,0.72)',
  tape: '#FFFFFF',
  tapeEdge: '#000000',
  tapeShadow: 'rgba(0,0,0,0)',
  tick: '#000000',
  you: '#B04A00',
  nation: '#145F5F',
  group: '#4E2A5C',
  markerOutline: '#000000',
  youText: '#8A3A00',
  nationText: '#0F4C4C',
  groupText: '#4E2A5C',
  primary: '#000000',
  primaryInk: '#FFFFFF',
  primaryShadow: 'rgba(0,0,0,0)',
  noteBlue: '#FFFFFF',
  noteOrange: '#FFFFFF',
  noteYellow: '#FFFFFF',
  noteShadow: 'rgba(0,0,0,0)',
  band: 'rgba(176,74,0,0.35)',
  bandEdge: '#B04A00',
  good: '#0B5A2A',
  danger: '#9C1008',
  disabled: 'rgba(0,0,0,0.5)',
  skeleton: 'rgba(0,0,0,0.14)',
  tintPrimary: 'rgba(0,0,0,0.06)',
  tintYou: 'rgba(176,74,0,0.10)',
  tintNation: 'rgba(20,95,95,0.10)',
  tintGroup: 'rgba(78,42,92,0.10)',
};

const SANS = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif';

/** Type scale in px at design scale 1. Nothing informational goes below `body` (spec 6: body >= 16, prompt >= 28, scores >= 40). */
const FS_STD = { body: 16, bodyL: 18, title: 22, prompt: 28, hero: 40, button: 20, end: 20 };
// Large text: body >= 20, prompt >= 34, scores >= 48, buttons >= 56 tall.
const FS_LARGE = { body: 20, bodyL: 22, title: 27, prompt: 34, hero: 48, button: 24, end: 22 };

const MIN_TAP = 48;

const COLORS = Object.assign({}, STANDARD);
const FS = Object.assign({}, FS_STD);
const mode = { large: false, hc: false };

function setMode(m) {
  mode.large = !!(m && m.large);
  mode.hc = !!(m && m.hc);
  Object.assign(COLORS, mode.hc ? HC : STANDARD);
  Object.assign(FS, mode.large ? FS_LARGE : FS_STD);
}

/** Read vm.display ({largeText, highContrast, scale?, palette?}); null/undefined = standard look. */
function applyDisplay(display) {
  const d = display || {};
  setMode({
    large: d.largeText != null ? !!d.largeText : d.scale > 1,
    hc: d.highContrast != null ? !!d.highContrast : d.palette === 'highContrast',
  });
}

function getMode() {
  return { large: mode.large, hc: mode.hc };
}
const isLarge = () => mode.large;
const isHC = () => mode.hc;

/** Vertical spacing multiplier for row heights. */
function K() {
  return mode.large ? 1.25 : 1;
}
function minBtn() {
  return mode.large ? 56 : MIN_TAP;
}
/** Button height: the design height raised to the mode's minimum. */
function btn(L, n) {
  return Math.max(L.u(n), minBtn());
}

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

module.exports = { COLORS, STANDARD, HC, SANS, FS, FS_STD, FS_LARGE, MIN_TAP, setMode, applyDisplay, getMode, isLarge, isHC, K, minBtn, btn, contrast };
