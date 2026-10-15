/**
 * Content tables (spec 3, Appendix B). Pure JS; copied into cloud functions.
 *
 *   getContent(contentVersion) -> content | null
 *
 * Content ships as core/content/generals.v<N>.js. The sim and server
 * validation pin to the contentVersion; the server keeps the last 2 versions.
 */

const V1 = require('./content/generals.v1.js');
const V2 = require('./content/generals.v2.js');

const STAT_KEYS = ['zhi', 'xin', 'ren', 'yong', 'yan'];

/** Slot order is fixed everywhere (lineup arrays, event stream indexes). */
const SLOTS = ['zhugong', 'junshi', 'xianfeng', 'mengjiang', 'shoujiang'];

const FACTIONS = [
  { key: 'wei', label: '魏', color: '#B8862B', phase: 1 },
  { key: 'shu', label: '蜀', color: '#C0392B', phase: 1 },
  { key: 'wu', label: '吴', color: '#2E7D7A', phase: 1 },
  { key: 'qun', label: '群', color: '#7A5230', phase: 1 },
  { key: 'jin', label: '晋', color: '#C9D3DD', phase: 2, light: true },
];

const ERAS = [
  { key: 'huangjin', label: '黄巾', span: '184-189', phase: 1 },
  { key: 'qunxiong', label: '群雄', span: '190-207', phase: 1 },
  { key: 'chibi', label: '赤壁', span: '208-214', phase: 1 },
  { key: 'sanfen', label: '三分', span: '215-234', phase: 1 },
  { key: 'guijin', label: '归晋', span: '235-280', phase: 2 },
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

/** Per content version: which factions/eras exist and the min generals per drawable cell. */
const RAW = { 1: V1, 2: V2 };
const META = {
  1: { factions: ['wei', 'shu', 'wu', 'qun'], eras: ['huangjin', 'qunxiong', 'chibi', 'sanfen'], minCell: 2 },
  2: { factions: ['wei', 'shu', 'wu', 'qun', 'jin'], eras: ['huangjin', 'qunxiong', 'chibi', 'sanfen', 'guijin'], minCell: 4 },
};
const cache = {};

function cellKey(faction, era) {
  return faction + '|' + era;
}

function build(raw) {
  const meta = META[raw.contentVersion];
  const factions = FACTIONS.filter((f) => meta.factions.indexOf(f.key) >= 0);
  const eras = ERAS.filter((e) => meta.eras.indexOf(e.key) >= 0);
  const bonds = raw.bonds || BONDS;
  // v1 content is read as one appearance {faction, eras} per general (spec 3.5)
  const generals = raw.generals.map((g) => (g.appearances ? g : Object.assign({}, g, { appearances: [{ faction: g.faction, eras: g.eras.slice() }] })));
  const byId = {};
  const indexOf = {};
  generals.forEach((g, i) => {
    byId[g.id] = g;
    indexOf[g.id] = i;
  });
  const roleByKey = {};
  ROLES.forEach((r) => (roleByKey[r.key] = r));
  const factionByKey = {};
  factions.forEach((f) => (factionByKey[f.key] = f));
  const eraByKey = {};
  eras.forEach((e) => (eraByKey[e.key] = e));

  // cells[faction|era] = roster indexes, in roster order (built from appearances)
  const cells = {};
  for (const f of factions) for (const e of eras) cells[cellKey(f.key, e.key)] = [];
  generals.forEach((g, i) => {
    for (const a of g.appearances) for (const e of a.eras) cells[cellKey(a.faction, e)].push(i);
  });

  const MIN_CELL = meta.minCell;
  const validCells = [];
  for (const f of factions) {
    for (const e of eras) if (cells[cellKey(f.key, e.key)].length >= MIN_CELL) validCells.push({ faction: f.key, era: e.key });
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
    factions,
    eras,
    roles: ROLES,
    roleByKey,
    factionByKey,
    eraByKey,
    slots: SLOTS,
    bonds,
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

const LATEST_CONTENT_VERSION = 2;

/** The appearance note of a general under a faction ('' when none), shown under the name in that cell's pool. */
function appearanceNote(content, generalId, faction) {
  const g = content.byId[generalId];
  if (!g) return '';
  for (const a of g.appearances) if (a.faction === faction) return a.note || '';
  return '';
}

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
  if (content.contentVersion === 2) return validateV2(content);
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
  for (const f of content.factions) if (perFaction[f.key] !== 8) errs.push('faction ' + f.key + ' has ' + (perFaction[f.key] || 0) + ' generals, expected 8');
  let entries = 0;
  for (const f of content.factions) {
    for (const e of content.eras) {
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
  const strings = collectStrings({ generals: visibleGenerals, texts: content.texts, factions: content.factions, eras: content.eras, roles: ROLES, bonds: content.bonds }, []);
  for (const s of strings) for (const t of FORBIDDEN_TERMS) if (s.indexOf(t) >= 0) errs.push('forbidden term "' + t + '" in "' + s + '"');
  return errs;
}

/** Extra user-visible-term bans for v1 content (AC 7 lists 传说 and 稀有 too). */
const EXTRA_FORBIDDEN_V2 = ['传说', '稀有'];

/**
 * contentVersion 2 validation (AC 69): 120 generals, primary counts, appearances,
 * 21 used cells >= 4 (273 entries), 16 bonds, stats, tiers, forbidden terms.
 */
function validateV2(content) {
  const errs = [];
  const g = content.generals;
  const REQUIRED = ['id', 'name', 'courtesy', 'faction', 'appearances', 'eras', 'primaryRole', 'stats', 'tier', 'bonds', 'portraitId', 'monogram', 'blurb', 'statNote', 'source', 'contentVersion'];
  if (g.length !== 120) errs.push('expected 120 generals, got ' + g.length);
  const perFaction = {};
  const ids = {};
  for (const x of g) {
    for (const f of REQUIRED) if (x[f] === undefined || x[f] === null) if (!(f === 'portraitId' && x[f] === null)) errs.push(x.id + ': missing ' + f);
    if (ids[x.id]) errs.push('duplicate id ' + x.id);
    ids[x.id] = true;
    perFaction[x.faction] = (perFaction[x.faction] || 0) + 1;
    if (!content.factionByKey[x.faction]) errs.push(x.id + ': bad faction');
    if (x.portraitId !== null) errs.push(x.id + ': portraitId must be null in v1');
    if (!x.appearances || x.appearances.length < 1) errs.push(x.id + ': no appearances');
    const seenF = {};
    const union = [];
    for (const a of x.appearances || []) {
      if (!content.factionByKey[a.faction]) errs.push(x.id + ': bad appearance faction ' + a.faction);
      if (seenF[a.faction]) errs.push(x.id + ': two appearances for ' + a.faction);
      seenF[a.faction] = true;
      if (!a.eras || a.eras.length < 1) errs.push(x.id + ': appearance without eras');
      for (const e of a.eras || []) {
        if (!content.eraByKey[e]) errs.push(x.id + ': bad era ' + e);
        if (a.faction === 'jin' && e !== 'guijin') errs.push(x.id + ': 晋 appearance outside guijin');
        if (union.indexOf(e) < 0) union.push(e);
      }
      if (a.note !== undefined && [...a.note].length > 6) errs.push(x.id + ': appearance note longer than 6 chars');
    }
    if (!seenF[x.faction]) errs.push(x.id + ': primary faction has no appearance');
    if ([...(x.eras || [])].sort().join() !== union.slice().sort().join()) errs.push(x.id + ': eras is not the union of appearance eras');
    if (!content.roleByKey[x.primaryRole]) errs.push(x.id + ': bad primaryRole');
    for (const k of STAT_KEYS) {
      const v = x.stats && x.stats[k];
      if (!Number.isInteger(v) || v < 1 || v > 10) errs.push(x.id + ': stat ' + k + ' not an integer 1-10');
    }
    if (x.stats && x.tier !== tierOf(x.stats)) errs.push(x.id + ': tier does not match stat total');
    if ([...(x.monogram || '')].length !== 1) errs.push(x.id + ': monogram must be 1 char');
    if ([...(x.blurb || '')].length > 14) errs.push(x.id + ': blurb longer than 14 chars');
    if (!x.statNote || !x.source) errs.push(x.id + ': empty statNote or source');
    if (x.contentVersion !== content.contentVersion) errs.push(x.id + ': contentVersion mismatch');
    for (const b of x.bonds || []) if (!content.bonds.some((bb) => bb.key === b)) errs.push(x.id + ': unknown bond ' + b);
  }
  const want = { shu: 26, wei: 26, wu: 25, qun: 25, jin: 18 };
  for (const k of Object.keys(want)) if (perFaction[k] !== want[k]) errs.push('faction ' + k + ' has ' + (perFaction[k] || 0) + ' generals, expected ' + want[k]);
  let entries = 0;
  let used = 0;
  for (const f of content.factions) {
    for (const e of content.eras) {
      const n = content.cells[cellKey(f.key, e.key)].length;
      entries += n;
      const unusedJin = f.key === 'jin' && e.key !== 'guijin';
      if (unusedJin) {
        if (n !== 0) errs.push('unused cell ' + f.key + '/' + e.key + ' has ' + n + ' generals');
      } else {
        used++;
        if (n < 4) errs.push('cell ' + f.key + '/' + e.key + ' has ' + n + ' generals, expected >= 4');
      }
    }
  }
  if (used !== 21) errs.push('expected 21 used cells, got ' + used);
  if (entries !== 273) errs.push('expected 273 general-cell entries, got ' + entries);
  if (content.bonds.length !== 16) errs.push('expected 16 bonds, got ' + content.bonds.length);
  for (const b of content.bonds) for (const m of b.members) if (!content.byId[m]) errs.push('bond ' + b.key + ' member missing ' + m);
  const visibleGenerals = g.map((x) => Object.assign({}, x, { source: '' }));
  const strings = collectStrings({ generals: visibleGenerals, texts: content.texts, factions: content.factions, eras: content.eras, roles: ROLES, bonds: content.bonds }, []);
  for (const s of strings) for (const t of FORBIDDEN_TERMS.concat(EXTRA_FORBIDDEN_V2)) if (s.indexOf(t) >= 0) errs.push('forbidden term "' + t + '" in "' + s + '"');
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
  appearanceNote,
  collectStrings,
  validateContent,
};
