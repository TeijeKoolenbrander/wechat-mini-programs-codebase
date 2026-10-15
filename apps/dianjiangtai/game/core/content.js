/**
 * Content tables (spec 3, Appendix B). Pure JS; copied into cloud functions.
 *
 *   getContent(contentVersion) -> content | null
 *
 * Content ships as core/content/generals.v<N>.js. The sim and server
 * validation pin to the contentVersion; the server keeps the last 2 versions.
 */

const V1 = require('./content/generals.v1.js');

const STAT_KEYS = ['zhi', 'xin', 'ren', 'yong', 'yan'];

/** Slot order is fixed everywhere (lineup arrays, event stream indexes). */
const SLOTS = ['zhugong', 'junshi', 'xianfeng', 'mengjiang', 'shoujiang'];

const FACTIONS = [
  { key: 'wei', label: '魏', color: '#B8862B', phase: 1 },
  { key: 'shu', label: '蜀', color: '#C0392B', phase: 1 },
  { key: 'wu', label: '吴', color: '#2E7D7A', phase: 1 },
  { key: 'qun', label: '群', color: '#7A5230', phase: 1 },
];

const ERAS = [
  { key: 'huangjin', label: '黄巾', span: '184-189', phase: 1 },
  { key: 'qunxiong', label: '群雄', span: '190-207', phase: 1 },
  { key: 'chibi', label: '赤壁', span: '208-214', phase: 1 },
  { key: 'sanfen', label: '三分', span: '215-234', phase: 1 },
];

/** Role weights over (zhi xin ren yong yan), spec 3.4. */
const ROLES = [
  { key: 'zhugong', label: '主公', blurb: '定人心、聚众志', weights: { zhi: 0.15, xin: 0.2, ren: 0.4, yong: 0.05, yan: 0.2 } },
  { key: 'junshi', label: '军师', blurb: '运筹帷幄', weights: { zhi: 0.65, xin: 0.15, ren: 0.05, yong: 0.0, yan: 0.15 } },
  { key: 'xianfeng', label: '先锋', blurb: '冲阵破敌', weights: { zhi: 0.1, xin: 0.05, ren: 0.0, yong: 0.55, yan: 0.3 } },
  { key: 'mengjiang', label: '猛将', blurb: '万军之中取上将首级', weights: { zhi: 0.0, xin: 0.1, ren: 0.0, yong: 0.8, yan: 0.1 } },
  { key: 'shoujiang', label: '守将', blurb: '坚守城池、稳住后方', weights: { zhi: 0.2, xin: 0.25, ren: 0.05, yong: 0.1, yan: 0.4 } },
];

const BONDS = [
  { key: 'taoyuan', label: '桃园', members: ['g_liubei', 'g_guanyu', 'g_zhangfei'], bonus: 0.04 },
  { key: 'jiangdong', label: '江东', members: ['g_sunce', 'g_zhouyu'], bonus: 0.04 },
];

/** Terms that must never appear in user-visible content (AC 7, AC 50). */
const FORBIDDEN_TERMS = ['82-0', 'NBA', '武力', '统率', '政治', '魅力', 'SSR', '抽卡', '三国志', '三国杀', '光荣', 'Koei'];

const RAW = { 1: V1 };
const cache = {};

function cellKey(faction, era) {
  return faction + '|' + era;
}

function build(raw) {
  const generals = raw.generals;
  const byId = {};
  const indexOf = {};
  generals.forEach((g, i) => {
    byId[g.id] = g;
    indexOf[g.id] = i;
  });
  const roleByKey = {};
  ROLES.forEach((r) => (roleByKey[r.key] = r));
  const factionByKey = {};
  FACTIONS.forEach((f) => (factionByKey[f.key] = f));
  const eraByKey = {};
  ERAS.forEach((e) => (eraByKey[e.key] = e));

  // cells[faction|era] = roster indexes, in roster order
  const cells = {};
  for (const f of FACTIONS) for (const e of ERAS) cells[cellKey(f.key, e.key)] = [];
  generals.forEach((g, i) => {
    for (const e of g.eras) cells[cellKey(g.faction, e)].push(i);
  });

  const MIN_CELL = 2;
  const validCells = [];
  for (const f of FACTIONS) {
    for (const e of ERAS) if (cells[cellKey(f.key, e.key)].length >= MIN_CELL) validCells.push({ faction: f.key, era: e.key });
  }

  // role scores, precomputed: roleScores[generalIndex][slotIndex]
  const roleScores = generals.map((g) =>
    SLOTS.map((s) => {
      const w = roleByKey[s].weights;
      let sum = 0;
      for (const k of STAT_KEYS) sum += w[k] * g.stats[k];
      return Math.round(sum * 1e6) / 1e6;
    })
  );

  return {
    contentVersion: raw.contentVersion,
    generals,
    byId,
    indexOf,
    roster: generals.map((g) => g.id),
    factions: FACTIONS,
    eras: ERAS,
    roles: ROLES,
    roleByKey,
    factionByKey,
    eraByKey,
    slots: SLOTS,
    bonds: BONDS,
    cells,
    validCells,
    minCell: MIN_CELL,
    roleScores,
    texts: raw.texts,
    forbiddenTerms: FORBIDDEN_TERMS,
  };
}

function getContent(contentVersion) {
  const v = Number(contentVersion);
  if (!RAW[v]) return null;
  if (!cache[v]) cache[v] = build(RAW[v]);
  return cache[v];
}

const LATEST_CONTENT_VERSION = 1;

/** roleScore(g, r) = sum of weight[r][s] * g.stats[s] (spec 3.4), 1-10. */
function roleScore(content, generalId, slot) {
  return content.roleScores[content.indexOf[generalId]][SLOTS.indexOf(slot)];
}

/** Derived display tier from the stat total (spec 3.5). */
function tierOf(stats) {
  const t = STAT_KEYS.reduce((a, k) => a + stats[k], 0);
  return t >= 38 ? 'jia' : t >= 30 ? 'yi' : 'bing';
}

/** Fit chip for a role score (spec 3.4). */
function fitOf(score) {
  return score >= 7.5 ? 'good' : score >= 5.5 ? 'ok' : 'bad';
}

/** Collect every string value in an object tree. */
function collectStrings(x, out) {
  if (typeof x === 'string') out.push(x);
  else if (Array.isArray(x)) x.forEach((y) => collectStrings(y, out));
  else if (x && typeof x === 'object') Object.keys(x).forEach((k) => collectStrings(x[k], out));
  return out;
}

/**
 * Content validation (AC 7). Returns a list of problems; empty means valid.
 * Used by the unit tests and by tools; the Phase 1 roster must have exactly
 * 32 generals, 8 per faction, stats 1-10, every cell >= 2.
 */
function validateContent(content) {
  const errs = [];
  const g = content.generals;
  const REQUIRED = ['id', 'name', 'courtesy', 'faction', 'eras', 'primaryRole', 'stats', 'tier', 'bonds', 'portraitId', 'monogram', 'blurb', 'statNote', 'source', 'contentVersion'];
  if (g.length !== 32) errs.push('expected 32 generals, got ' + g.length);
  const perFaction = {};
  const ids = {};
  for (const x of g) {
    for (const f of REQUIRED) if (x[f] === undefined || x[f] === null) errs.push(x.id + ': missing ' + f);
    if (ids[x.id]) errs.push('duplicate id ' + x.id);
    ids[x.id] = true;
    perFaction[x.faction] = (perFaction[x.faction] || 0) + 1;
    if (!content.factionByKey[x.faction]) errs.push(x.id + ': bad faction');
    if (!x.eras || x.eras.length < 1) errs.push(x.id + ': no eras');
    for (const e of x.eras || []) if (!content.eraByKey[e]) errs.push(x.id + ': bad era ' + e);
    if (!content.roleByKey[x.primaryRole]) errs.push(x.id + ': bad primaryRole');
    for (const k of STAT_KEYS) {
      const v = x.stats && x.stats[k];
      if (!Number.isInteger(v) || v < 1 || v > 10) errs.push(x.id + ': stat ' + k + ' not an integer 1-10');
    }
    if (x.stats && x.tier !== tierOf(x.stats)) errs.push(x.id + ': tier does not match stat total');
    if ([...(x.monogram || '')].length !== 1) errs.push(x.id + ': monogram must be 1 char');
    if ([...(x.blurb || '')].length > 14) errs.push(x.id + ': blurb longer than 14 chars');
    if (x.contentVersion !== content.contentVersion) errs.push(x.id + ': contentVersion mismatch');
    for (const b of x.bonds || []) if (!content.bonds.some((bb) => bb.key === b)) errs.push(x.id + ': unknown bond ' + b);
  }
  for (const f of FACTIONS) if (perFaction[f.key] !== 8) errs.push('faction ' + f.key + ' has ' + (perFaction[f.key] || 0) + ' generals, expected 8');
  let entries = 0;
  for (const f of FACTIONS) {
    for (const e of ERAS) {
      const n = content.cells[cellKey(f.key, e.key)].length;
      entries += n;
      if (n < 2) errs.push('cell ' + f.key + '/' + e.key + ' has ' + n + ' generals');
    }
  }
  if (entries !== 77) errs.push('expected 77 general-cell entries, got ' + entries);
  for (const b of content.bonds) for (const m of b.members) if (!content.byId[m]) errs.push('bond ' + b.key + ' member missing ' + m);
  // forbidden terms over every user-visible string
  // `source` is provenance, never shown (it cites the historical book by name).
  const visibleGenerals = g.map((x) => Object.assign({}, x, { source: '' }));
  const strings = collectStrings({ generals: visibleGenerals, texts: content.texts, factions: FACTIONS, eras: ERAS, roles: ROLES, bonds: BONDS }, []);
  for (const s of strings) for (const t of FORBIDDEN_TERMS) if (s.indexOf(t) >= 0) errs.push('forbidden term "' + t + '" in "' + s + '"');
  return errs;
}

module.exports = {
  getContent,
  LATEST_CONTENT_VERSION,
  STAT_KEYS,
  SLOTS,
  FACTIONS,
  ERAS,
  ROLES,
  BONDS,
  FORBIDDEN_TERMS,
  cellKey,
  roleScore,
  tierOf,
  fitOf,
  collectStrings,
  validateContent,
};
