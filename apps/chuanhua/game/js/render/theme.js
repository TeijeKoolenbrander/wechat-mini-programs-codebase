/**
 * Design tokens for 传画接龙: "a sunny classroom doodle wall".
 * Off-white paper with a dot grid, bold ink outlines, hard offset shadows
 * (like stickers on a wall), a paintbrush-baton mascot, warm accents.
 *
 * Display modes (spec 8.13, copied idea from 点将台 8.10): applyDisplay()
 * switches the shared COLORS / FS objects IN PLACE, so every widget that reads
 * T.COLORS / T.FS at draw time follows. Every screen's draw() calls
 * applyDisplay(vm.display) first, so a frame never depends on the previous one.
 * Share cards ignore the modes (one consistent card for the whole group).
 *
 * System fonts only (no bundled font files).
 */

const STANDARD = {
  paper: '#FAF7F0',
  paperDeep: '#F1EBDD',
  dot: 'rgba(30,27,24,0.09)',
  card: '#FFFFFF',
  ink: '#1E1B18',
  sub: '#5E574F', // 6.6:1 on paper
  zhu: '#D8433B', // 朱, fills and big shapes
  zhuText: '#B8302A', // 朱 for text on paper (5.5:1)
  zhuSoft: 'rgba(216,67,59,0.12)',
  orange: '#F29B30', // 橙
  orangeText: '#8A5200', // 6.0:1 on paper
  orangeSoft: 'rgba(242,155,48,0.22)',
  blue: '#3C78C8', // 蓝
  blueText: '#2D62A8', // 5.8:1
  blueSoft: 'rgba(60,120,200,0.14)',
  good: '#2F7D4F',
  goodSoft: 'rgba(47,125,79,0.14)',
  line: 'rgba(30,27,24,0.20)',
  lineStrong: '#1E1B18',
  scrim: 'rgba(30,27,24,0.55)',
  sheet: '#FFFDF8',
  disabledFill: '#E7E1D5',
  disabledInk: '#6A6258', // 4.6:1 on disabledFill
  skeleton: 'rgba(30,27,24,0.08)',
  onZhu: '#FFFFFF',
  tape: 'rgba(242,155,48,0.55)',
};

const HIGH_CONTRAST = {
  paper: '#FFFFFF',
  paperDeep: '#FFFFFF',
  dot: 'rgba(0,0,0,0)',
  card: '#FFFFFF',
  ink: '#000000',
  sub: '#222222',
  zhu: '#A8160E', // white on it 8.4:1
  zhuText: '#A8160E',
  zhuSoft: '#FFFFFF',
  orange: '#7A4200',
  orangeText: '#6B3A00',
  orangeSoft: '#FFFFFF',
  blue: '#1B4F9C',
  blueText: '#1B4F9C',
  blueSoft: '#FFFFFF',
  good: '#14602F',
  goodSoft: '#FFFFFF',
  line: '#000000',
  lineStrong: '#000000',
  scrim: 'rgba(0,0,0,0.75)',
  sheet: '#FFFFFF',
  disabledFill: '#FFFFFF',
  disabledInk: '#444444',
  skeleton: 'rgba(0,0,0,0.14)',
  onZhu: '#FFFFFF',
  tape: '#7A4200',
};

const FS_STANDARD = { small: 16, body: 16, bodyL: 18, title: 22, hero: 30, button: 20, timer: 24, display: 40 };
const FS_LARGE = { small: 18, body: 20, bodyL: 22, title: 26, hero: 34, button: 22, timer: 28, display: 44 };

/** Live tokens. Mutated in place by applyDisplay. */
const COLORS = Object.assign({}, STANDARD);
const FS = Object.assign({}, FS_STANDARD);
const MODE = { largeText: false, highContrast: false };

/** The 12 drawing colours, indexed by the stroke format's colour index (spec 5.2). */
const PALETTE = [
  '#1E1B18', // 0 墨
  '#D8433B', // 1 朱
  '#F29B30', // 2 橙
  '#3E9B5A', // 3 绿
  '#3C78C8', // 4 蓝
  '#7B4FB3', // 5 紫
  '#F28DB2', // 6 粉  (今日彩笔)
  '#F2D13C', // 7 黄
  '#6CC3E0', // 8 天青
  '#8A5A3B', // 9 棕
  '#9A9A9A', // 10 灰
  '#9CCB4A', // 11 草
];
const PALETTE_NAME = ['墨', '朱', '橙', '绿', '蓝', '紫', '粉', '黄', '天青', '棕', '灰', '草'];
/** Brush widths in the 1024 grid (spec 5.2). */
const BRUSH = [8, 18, 36];
const GRID = 1024;

const SANS = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif';
const ROUND = '"Yuanti SC","YouYuan","PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif';

/** Minimum touch target (pt). Large text raises buttons to 56. */
const MIN_TAP = 48;

function applyDisplay(display) {
  const d = display || {};
  MODE.largeText = !!d.largeText;
  MODE.highContrast = !!d.highContrast;
  Object.assign(COLORS, MODE.highContrast ? HIGH_CONTRAST : STANDARD);
  Object.assign(FS, MODE.largeText ? FS_LARGE : FS_STANDARD);
  return MODE;
}

/** Reset to the standard look (share cards, tests). */
function resetDisplay() {
  return applyDisplay(null);
}

module.exports = {
  STANDARD,
  HIGH_CONTRAST,
  FS_STANDARD,
  FS_LARGE,
  COLORS,
  FS,
  MODE,
  PALETTE,
  PALETTE_NAME,
  BRUSH,
  GRID,
  SANS,
  ROUND,
  MIN_TAP,
  applyDisplay,
  resetDisplay,
};
