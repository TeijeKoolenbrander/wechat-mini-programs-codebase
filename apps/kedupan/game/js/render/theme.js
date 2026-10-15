/**
 * Design tokens for 群友刻度盘: a sunny desk, a paper tape measure, sticky
 * notes (docs/kedupan/direction.md section 6).
 *
 * C (colours), FS (type scale, pt at design scale 1) and MODE are mutable
 * singletons. Every screen's draw() starts with applyDisplay(vm.display), so
 * the two display modes (大字模式, 高对比度) are applied before any pixel is
 * drawn. Modules must read C.x / FS.x at draw time (never copy the values at
 * load time). Share cards call applyDisplay(null): they always use the
 * standard look.
 *
 * System fonts only (no bundled font files, the main package stays small).
 */

const STANDARD = {
  bg: '#FBF6EC', // paper cream
  grid: 'rgba(36,33,30,0.055)', // cutting-mat lines on the desk
  card: '#FFFDF8',
  ink: '#24211E',
  sub: '#5C5249', // 6.6:1 on bg
  line: 'rgba(36,33,30,0.20)',
  lineStrong: 'rgba(36,33,30,0.60)',
  scrim: 'rgba(36,33,30,0.52)',
  tape: '#F2C94C', // tape yellow
  tapeShade: '#D9AE2E',
  tapeHook: '#6B645B',
  noteYellow: '#FFF0A8',
  noteBlue: '#D6E8F6',
  noteOrange: '#FFDFC2',
  noteGreen: '#DDF0D2',
  primary: '#F07B2C', // tangerine
  primaryInk: '#24211E',
  you: '#F07B2C',
  nation: '#2A8C8C',
  group: '#7D4E8C',
  target: '#D9480F',
  youText: '#A9470B',
  nationText: '#1F6F6F',
  groupText: '#7D4E8C',
  targetText: '#B23A08',
  good: '#17734A',
  warn: '#8A5A00',
  danger: '#B3261E',
  disabledFill: '#EAE2D1',
  disabledInk: '#6F675D',
  skeleton: 'rgba(36,33,30,0.08)',
  lbl1: '#17734A', // 心有灵犀
  lbl2: '#1F6F6F', // 很同频
  lbl3: '#5C5249', // 差不多
  lbl4: '#8A5A00', // 有点偏
  lbl5: '#7D4E8C', // 想法独特
};

const HIGH_CONTRAST = {
  bg: '#FFFFFF',
  grid: 'rgba(0,0,0,0)',
  card: '#FFFFFF',
  ink: '#000000',
  sub: '#262626',
  line: 'rgba(0,0,0,0.55)',
  lineStrong: '#000000',
  scrim: 'rgba(0,0,0,0.65)',
  tape: '#FFE680',
  tapeShade: '#000000',
  tapeHook: '#000000',
  noteYellow: '#FFF7C2',
  noteBlue: '#E3F0FA',
  noteOrange: '#FFE9D2',
  noteGreen: '#E5F5DC',
  primary: '#000000',
  primaryInk: '#FFFFFF',
  you: '#B04A00',
  nation: '#145F5F',
  group: '#4E2A5C',
  target: '#8A2F00',
  youText: '#8F3C00',
  nationText: '#145F5F',
  groupText: '#4E2A5C',
  targetText: '#7A2800',
  good: '#0B5A36',
  warn: '#6B4400',
  danger: '#8A1010',
  disabledFill: '#E6E6E6',
  disabledInk: '#4D4D4D',
  skeleton: 'rgba(0,0,0,0.14)',
  lbl1: '#0B5A36',
  lbl2: '#145F5F',
  lbl3: '#262626',
  lbl4: '#6B4400',
  lbl5: '#4E2A5C',
};

/** Type scale in pt at design scale 1. Nothing informational goes below 16. */
const FS_STANDARD = {
  body: 16,
  bodyL: 18,
  title: 22,
  prompt: 30, // spec: >= 28
  endLabel: 20, // spec: >= 20
  score: 42, // spec: >= 40
  hero: 56,
  button: 20,
  buttonH: 52,
  band: 64, // ruler touch band, spec: >= 64
};
const FS_LARGE = {
  body: 20,
  bodyL: 22,
  title: 26,
  prompt: 36, // spec: >= 34
  endLabel: 24,
  score: 50, // spec: >= 48
  hero: 64,
  button: 22,
  buttonH: 58, // spec: >= 56
  band: 84, // spec: >= 80
};

const C = Object.assign({}, STANDARD);
const FS = Object.assign({}, FS_STANDARD);
const MODE = { large: false, hc: false, outline: 1.5 };

/** Minimum touch target (pt). */
const MIN_TAP = 48;

/**
 * @param {object|null} display {largeText, highContrast, scale, palette}
 */
function applyDisplay(display) {
  const d = display || {};
  const hc = !!(d.highContrast || d.palette === 'highContrast');
  const large = !!(d.largeText || (d.scale && d.scale >= 1.25));
  Object.assign(C, hc ? HIGH_CONTRAST : STANDARD);
  Object.assign(FS, large ? FS_LARGE : FS_STANDARD);
  MODE.large = large;
  MODE.hc = hc;
  MODE.outline = hc ? 2.5 : 1.5;
}

const LABEL_KEYS = { 心有灵犀: 'lbl1', 很同频: 'lbl2', 差不多: 'lbl3', 有点偏: 'lbl4', 想法独特: 'lbl5' };
function labelColor(label) {
  return C[LABEL_KEYS[label] || 'lbl3'];
}

const SANS = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif';

module.exports = { C, FS, MODE, MIN_TAP, SANS, STANDARD, HIGH_CONTRAST, FS_STANDARD, FS_LARGE, applyDisplay, labelColor };
