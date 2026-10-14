/**
 * Design tokens for the in-game look. Matches the approved share-card mockup
 * (docs/dianjiangtai/mockups/share-card): rice paper, ink, cinnabar seal.
 * Faction colours follow spec 3.2 / direction 6 (the mockup's blue and green
 * tile colours were a placeholder; the spec table is the source of truth).
 *
 * System fonts only (no bundled font files, main package stays small).
 */

const COLORS = {
  paper: '#F3EAD7',
  paperTop: '#F1E6CC',
  paperBottom: '#E3D2AB',
  tile: '#FBF4E2',
  sheet: '#F7EEDA',
  ink: '#2A211A',
  sub: '#6B5A45', // 5.3:1 on paper
  seal: '#B3261E', // cinnabar
  sealInk: '#F6E9D0',
  gold: '#C9973A',
  goldDeep: '#7A5614', // gold for text/borders on paper (contrast 5:1)
  line: 'rgba(42,33,26,0.22)',
  lineStrong: 'rgba(42,33,26,0.55)',
  scrim: 'rgba(30,22,16,0.55)',
  lacquer: '#2F2822',
  lacquerGold: '#E9C46A',
  good: '#2F7D4F',
  ok: '#5A5046',
  bad: '#9A5A12', // amber, dark enough for text on paper
  disabled: 'rgba(42,33,26,0.40)',
  skeleton: 'rgba(42,33,26,0.08)',
};

const FACTION_COLOR = {
  wei: '#B8862B',
  shu: '#C0392B',
  wu: '#2E7D7A',
  qun: '#7A5230',
};
const FACTION_LABEL = { wei: '魏', shu: '蜀', wu: '吴', qun: '群' };

const SLOT_LABEL = { zhugong: '主公', junshi: '军师', xianfeng: '先锋', mengjiang: '猛将', shoujiang: '守将' };
const SLOT_ORDER = ['zhugong', 'junshi', 'xianfeng', 'mengjiang', 'shoujiang'];
const FIT_LABEL = { good: '适任', ok: '可用', bad: '错位' };
const FIT_COLOR = { good: COLORS.good, ok: COLORS.ok, bad: COLORS.bad };
const TIER_LABEL = { jia: '甲', yi: '乙', bing: '丙' };
const STAT_KEYS = ['zhi', 'xin', 'ren', 'yong', 'yan'];
const STAT_LABEL = { zhi: '智', xin: '信', ren: '仁', yong: '勇', yan: '严' };

const SERIF = '"Songti SC","STSong","Noto Serif CJK SC","Source Han Serif SC",serif';
const SANS = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif';

/** Type scale in pt at design scale 1. Nothing informational goes below `body`. */
const FS = {
  body: 16,
  bodyL: 18,
  title: 22,
  hero: 30,
  record: 52, // spec: record >= 40pt
  button: 20,
  mono: 0.6, // monogram glyph as a fraction of the tile
};

/** Minimum touch target (pt). */
const MIN_TAP = 48;

function factionColor(key, fallback) {
  return FACTION_COLOR[key] || fallback || COLORS.sub;
}

module.exports = {
  COLORS,
  FACTION_COLOR,
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
  MIN_TAP,
  factionColor,
};
