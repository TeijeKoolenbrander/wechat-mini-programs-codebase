/**
 * Design tokens for the in-game look. Matches the approved share-card mockup
 * (docs/dianjiangtai/mockups/share-card): rice paper, ink, cinnabar seal.
 * Faction colours follow spec 3.2 / direction 6 (the spec table is the source
 * of truth).
 *
 * Display modes (spec 8.10, PO-12): COLORS, FACTION_COLOR, FS and friends are
 * LIVE objects. Every screen's draw() starts with applyDisplay(vm.display),
 * which rewrites them in place for standard / large text / high contrast, so
 * `const C = T.COLORS` stays valid in every module. Share and saved cards
 * always use the standard look (shareCard.js saves and restores the mode).
 *
 * System fonts only (no bundled font files, main package stays small).
 */

const STANDARD = {
  paper: '#F3EAD7',
  paperTop: '#F1E6CC',
  paperBottom: '#E3D2AB',
  tile: '#FBF4E2',
  sheet: '#F7EEDA',
  ink: '#2A211A',
  sub: '#6B5A45', // 5.5:1 on paper
  seal: '#B3261E', // cinnabar
  sealInk: '#F6E9D0',
  gold: '#C9973A',
  goldDeep: '#7A5614', // gold for text/borders on paper (5.5:1)
  line: 'rgba(42,33,26,0.22)',
  lineStrong: 'rgba(42,33,26,0.55)',
  scrim: 'rgba(30,22,16,0.55)',
  lacquer: '#2F2822',
  lacquerGold: '#E9C46A',
  good: '#2A7348', // 4.5:1+ on tile
  ok: '#5A5046',
  bad: '#8F5410', // amber, dark enough for text on paper
  disabled: 'rgba(42,33,26,0.40)',
  skeleton: 'rgba(42,33,26,0.08)',
  pipOff: 'rgba(42,33,26,0.15)',
  tintSeal: 'rgba(179,38,30,0.09)',
  tintGood: 'rgba(47,125,79,0.14)',
  tintBad: 'rgba(154,90,18,0.16)',
  tintOk: 'rgba(90,80,70,0.10)',
  frame1: 'rgba(42,33,26,0.30)',
  frame2: 'rgba(42,33,26,0.14)',
  poolBg: 'rgba(251,244,226,0.55)',
  btnShadow: 'rgba(80,16,10,0.35)',
};

// High contrast (spec 8.10): plain white, pure ink, dark faction set with
// white text. Text >= 7:1, non-text >= 3:1 (checked by tests/render.a11y).
const HC = {
  paper: '#FFFFFF',
  paperTop: '#FFFFFF',
  paperBottom: '#FFFFFF',
  tile: '#FFFFFF',
  sheet: '#FFFFFF',
  ink: '#000000',
  sub: '#2B2B2B',
  seal: '#A0160E',
  sealInk: '#FFFFFF',
  gold: '#6B4A00',
  goldDeep: '#5C3F00',
  line: '#5A5A5A',
  lineStrong: '#000000',
  scrim: 'rgba(0,0,0,0.70)',
  lacquer: '#000000',
  lacquerGold: '#FFE08A',
  good: '#0B5A2A',
  ok: '#2B2B2B',
  bad: '#7A3A00',
  disabled: 'rgba(0,0,0,0.45)',
  skeleton: 'rgba(0,0,0,0.12)',
  pipOff: 'rgba(0,0,0,0.20)',
  tintSeal: 'rgba(160,22,14,0.08)',
  tintGood: 'rgba(11,90,42,0.10)',
  tintBad: 'rgba(122,58,0,0.10)',
  tintOk: 'rgba(43,43,43,0.08)',
  frame1: '#000000',
  frame2: '#000000',
  poolBg: '#FFFFFF',
  btnShadow: 'rgba(0,0,0,0)',
};

const FACTION_STD = {
  wei: '#B8862B',
  shu: '#C0392B',
  wu: '#2E7D7A',
  qun: '#7A5230',
  jin: '#C9D3DD', // 月白: always ink text
};
const FACTION_HC = {
  wei: '#6E4B0D',
  shu: '#9E2A1E',
  wu: '#1D5552',
  qun: '#4F3420',
  jin: '#3E5568',
};
const FACTION_LABEL = { wei: '魏', shu: '蜀', wu: '吴', qun: '群', jin: '晋' };

const SLOT_LABEL = { zhugong: '主公', junshi: '军师', xianfeng: '先锋', mengjiang: '猛将', shoujiang: '守将' };
const SLOT_ORDER = ['zhugong', 'junshi', 'xianfeng', 'mengjiang', 'shoujiang'];
const FIT_LABEL = { good: '适任', ok: '可用', bad: '错位' };
const TIER_LABEL = { jia: '甲', yi: '乙', bing: '丙' };
const STAT_KEYS = ['zhi', 'xin', 'ren', 'yong', 'yan'];
const STAT_LABEL = { zhi: '智', xin: '信', ren: '仁', yong: '勇', yan: '严' };

const SERIF = '"Songti SC","STSong","Noto Serif CJK SC","Source Han Serif SC",serif';
const SANS = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif';

/** Type scale in pt at design scale 1. Nothing informational goes below `body`. */
const FS_STD = { body: 16, bodyL: 18, title: 22, hero: 30, record: 52, button: 20, mono: 0.6 };
// Large text (spec 8.10): body >= 20, secondary >= 18 (everything here is >= 20), record >= 48, buttons >= 56 tall.
const FS_LARGE = { body: 20, bodyL: 22, title: 27, hero: 34, record: 56, button: 24, mono: 0.6 };

/** Minimum touch target (pt). */
const MIN_TAP = 48;

// ---- live objects (rewritten in place by setMode)
const COLORS = Object.assign({}, STANDARD);
const FACTION_COLOR = Object.assign({}, FACTION_STD);
const FIT_COLOR = { good: STANDARD.good, ok: STANDARD.ok, bad: STANDARD.bad };
const FS = Object.assign({}, FS_STD);

const mode = { large: false, hc: false };

function setMode(m) {
  mode.large = !!(m && m.large);
  mode.hc = !!(m && m.hc);
  Object.assign(COLORS, mode.hc ? HC : STANDARD);
  Object.assign(FACTION_COLOR, mode.hc ? FACTION_HC : FACTION_STD);
  Object.assign(FS, mode.large ? FS_LARGE : FS_STD);
  FIT_COLOR.good = COLORS.good;
  FIT_COLOR.ok = COLORS.ok;
  FIT_COLOR.bad = COLORS.bad;
}

/** Read vm.display ({largeText, highContrast, scale?, palette?}); null/undefined = standard look. */
function applyDisplay(display) {
  const d = display || {};
  setMode({
    large: d.largeText != null ? !!d.largeText : d.scale > 1,
    hc: d.highContrast != null ? !!d.highContrast : d.palette === 'highContrast',
  });
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

/** Minimum button height (pt): 56 in large-text mode (spec 8.10), else the 48 tap size. */
function minBtn() {
  return mode.large ? 56 : MIN_TAP;
}

/** Button height: the design height, raised to the mode's minimum. */
function btn(L, n) {
  return Math.max(L.u(n), minBtn());
}

function factionColor(key, fallback) {
  return FACTION_COLOR[key] || fallback || COLORS.sub;
}

/** Colour of characters drawn on a faction fill: ink on 月白, paper elsewhere (white in HC). */
function factionInk(key) {
  if (key === 'jin' && !mode.hc) return STANDARD.ink;
  if (key === 'wei' && !mode.hc) return '#FFFFFF'; // 3.2:1 on ochre; paper-coloured text would be lower
  return mode.hc ? '#FFFFFF' : STANDARD.sealInk;
}

// ---- contrast helpers (used by tests and by the palette check)
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
  COLORS,
  STANDARD,
  HC,
  FACTION_COLOR,
  FACTION_STD,
  FACTION_HC,
  FACTION_LABEL,
  SLOT_LABEL,
  SLOT_ORDER,
  FIT_LABEL,
  FIT_COLOR,
  TIER_LABEL,
  STAT_KEYS,
  STAT_LABEL,
  SERIF,
  SANS,
  FS,
  FS_STD,
  FS_LARGE,
  MIN_TAP,
  setMode,
  applyDisplay,
  getMode,
  isLarge,
  isHC,
  K,
  minBtn,
  btn,
  factionColor,
  factionInk,
  contrast,
};
