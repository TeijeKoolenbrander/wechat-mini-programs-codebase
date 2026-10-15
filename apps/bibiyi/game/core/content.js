/**
 * Fact content: indexing, the bundled free pool and the validator (spec 3.2,
 * 3.4, 3.5, 3.7). Pure JS, no wx. The same validator runs in the build tool
 * (tools/build-content.js), in CI and, on the server side, over the daily pool.
 *
 * The bundled pool is core/content/facts.free.js (generated, free pool only,
 * AC 22). Daily-pool facts never exist in the game package.
 */

const { MEASURES, BY_KEY, THEME_GROUPS } = require('./measures');
const { findForbidden } = require('./forbidden');

const LICENCES = ['CN-GOV-STAT', 'CN-GOV-GEO', 'CN-GOV-OTHER', 'US-PD', 'CC0', 'CC-BY-4.0', 'FACT-CITED'];
const POOLS = ['free', 'daily'];
const STATUSES = ['active', 'suspended', 'retired'];
const MAX_FACT_CITED_PER_SOURCE = 25;

/** Hosts that may never be a source (spec 3.4 banned sources). Matched on the URL host suffix. */
const BANNED_HOSTS = [
  'wikipedia.org', 'wikimedia.org', 'baike.baidu.com', 'baike.com', 'baidu.com', 'zhihu.com', 'weibo.com', 'weibo.cn',
  'douyin.com', 'xiaohongshu.com', 'taobao.com', 'tmall.com', 'jd.com', 'pinduoduo.com', 'qq.com', 'sogou.com',
];

/** Tags that exclude a fact (spec 3.5). `border-feature` is allowed (extra review), not excluded. */
const EXCLUSION_TAGS = ['politics', 'person', 'ethnicity', 'religion', 'quality-ranking', 'disaster', 'military', 'territory', 'border', 'country', 'map', 'brand', 'company', 'money', 'dam', 'health', 'disputed', 'region-area', 'taiwan', 'hongkong', 'macau'];

/** City items are 地级市 / 副省级市 / 直辖市 only (spec 3.5.3). */
const CITY_EXCLUDED_SUFFIX = ['自治州', '自治县', '盟', '地区'];

/** Launch counts (spec 3.3), checked in strict mode. total / free / daily. */
const LAUNCH_COUNTS = {
  city_pop: [131, 87, 44], prov_pop: [31, 21, 10], mountain: [50, 34, 16], river: [40, 26, 14], lake: [30, 20, 10],
  year: [90, 50, 40], animal_weight: [50, 32, 18], animal_life: [30, 18, 12], space_diameter: [40, 26, 14],
  structure_len: [30, 20, 10], structure_height: [30, 20, 10], food_kcal: [70, 46, 24], distance: [60, 40, 20],
};
const MIN_DAILY_PER_THEME_GROUP = 30;

function hostOf(url) {
  const m = /^https:\/\/([^/:?#]+)/i.exec(String(url || ''));
  return m ? m[1].toLowerCase() : null;
}

function isBannedHost(host) {
  return BANNED_HOSTS.some((b) => host === b || host.endsWith('.' + b));
}

function rolesOf(verifiedBy) {
  const roles = [];
  (verifiedBy || []).forEach((v) => {
    const r = String(v).split(':')[0];
    if (r && roles.indexOf(r) < 0) roles.push(r);
  });
  return roles;
}

/** True if the fact is usable in decks (not suspended / retired). */
function isActive(fact) {
  return !fact.status || fact.status === 'active';
}

/**
 * Validate a list of facts. opts.strict also checks the launch counts of spec
 * 3.3 (only for the real content set, never for fixtures).
 * Returns { ok, errors: string[], counts: {measure: {total, free, daily}}, cited: {source: n} }.
 */
function validateContent(facts, opts) {
  const o = opts || {};
  const errors = [];
  const err = (f, msg) => errors.push((f && f.id ? f.id : '?') + ': ' + msg);
  const ids = {};
  const labels = {};
  const counts = {};
  const cited = {};
  MEASURES.forEach((m) => {
    counts[m.key] = { total: 0, free: 0, daily: 0 };
  });

  (facts || []).forEach((f) => {
    const m = BY_KEY[f.measure];
    if (!f.id || typeof f.id !== 'string') return err(f, 'missing id');
    if (ids[f.id]) err(f, 'duplicate id');
    ids[f.id] = true;
    if (!m) return err(f, 'unknown measure ' + f.measure);
    ['label', 'source', 'publisher', 'url', 'licence', 'retrievedAt'].forEach((k) => {
      if (typeof f[k] !== 'string' || !f[k]) err(f, 'missing ' + k);
    });
    if (POOLS.indexOf(f.pool) < 0) err(f, 'bad pool ' + f.pool);
    if (STATUSES.indexOf(f.status || 'active') < 0) err(f, 'bad status ' + f.status);
    if (!Number.isFinite(f.year)) err(f, 'missing data year');
    if (f.since !== undefined && !Number.isInteger(f.since)) err(f, 'bad since');
    if (typeof f.label === 'string') {
      if (Array.from(f.label).length > 10) err(f, 'label longer than 10 characters');
      const lk = m.key + '|' + f.label;
      if (labels[lk]) err(f, 'duplicate label within measure: ' + f.label);
      labels[lk] = true;
    }
    if (f.sub !== null && f.sub !== undefined && Array.from(String(f.sub)).length > 4) err(f, 'sub longer than 4 characters');
    if (f.note !== null && f.note !== undefined && Array.from(String(f.note)).length > 24) err(f, 'note longer than 24 characters');
    if (LICENCES.indexOf(f.licence) < 0) err(f, 'unknown licence ' + f.licence);
    const host = hostOf(f.url);
    if (!host) err(f, 'url must be https');
    else if (isBannedHost(host)) err(f, 'banned source host ' + host);
    if (rolesOf(f.verifiedBy).length < 2) err(f, 'verifiedBy needs two distinct roles');
    if (typeof f.value !== 'number' || !Number.isFinite(f.value)) err(f, 'value not finite');
    else if (m.kind === 'ratio' && f.value <= 0) err(f, 'ratio value must be > 0');
    else if (m.kind === 'year' && !Number.isInteger(f.value)) err(f, 'year value must be an integer');
    if (m.kind === 'year' && f.uncertainty !== undefined && !(f.uncertainty >= 0)) err(f, 'bad uncertainty');
    (f.tags || []).forEach((t) => {
      if (EXCLUSION_TAGS.indexOf(t) >= 0) err(f, 'carries exclusion tag ' + t);
    });
    if (f.measure === 'city_pop' && typeof f.label === 'string' && CITY_EXCLUDED_SUFFIX.some((s) => f.label.endsWith(s))) err(f, 'city item must be a prefecture-level or higher city');
    if (f.measure === 'prov_pop' && !/普查|七普/.test(f.note || '')) err(f, 'province facts carry the census-scope note');
    ['label', 'sub', 'note', 'source', 'publisher'].forEach((k) => {
      const hit = f[k] ? findForbidden(f[k]) : null;
      if (hit) err(f, 'forbidden term "' + hit + '" in ' + k);
    });
    if (f.licence === 'FACT-CITED') cited[f.source] = (cited[f.source] || 0) + 1;
    counts[m.key].total++;
    if (counts[m.key][f.pool] !== undefined) counts[m.key][f.pool]++;
  });
  Object.keys(cited).forEach((s) => {
    if (cited[s] > MAX_FACT_CITED_PER_SOURCE) errors.push('source "' + s + '": ' + cited[s] + ' FACT-CITED facts (max ' + MAX_FACT_CITED_PER_SOURCE + ')');
  });

  if (o.strict) {
    Object.keys(LAUNCH_COUNTS).forEach((k) => {
      const want = LAUNCH_COUNTS[k];
      const got = counts[k];
      if (got.total !== want[0] || got.free !== want[1] || got.daily !== want[2]) errors.push('measure ' + k + ': counts ' + got.total + '/' + got.free + '/' + got.daily + ' expected ' + want.join('/'));
    });
    THEME_GROUPS.forEach((g) => {
      const n = (facts || []).filter((f) => f.pool === 'daily' && g.categories.indexOf(BY_KEY[f.measure] && BY_KEY[f.measure].category) >= 0).length;
      if (n < MIN_DAILY_PER_THEME_GROUP) errors.push('theme group ' + g.label + ': ' + n + ' daily facts (min ' + MIN_DAILY_PER_THEME_GROUP + ')');
    });
  }
  return { ok: errors.length === 0, errors, counts, cited };
}

/** { facts, byId, byMeasure } over a fact list; suspended / retired facts stay in byId but not in byMeasure. */
function indexFacts(facts, contentVersion) {
  const byId = {};
  const byMeasure = {};
  MEASURES.forEach((m) => {
    byMeasure[m.key] = [];
  });
  facts.forEach((f) => {
    byId[f.id] = f;
    if (isActive(f) && byMeasure[f.measure]) byMeasure[f.measure].push(f);
  });
  return { contentVersion: contentVersion || 0, facts, byId, byMeasure };
}

// -- the bundled free pool ------------------------------------------------------------------

const BUNDLES = {};

function registerBundle(contentVersion, facts) {
  BUNDLES[contentVersion] = indexFacts(facts, contentVersion);
  return BUNDLES[contentVersion];
}

let LATEST_CONTENT_VERSION = 0;

try {
  const free = require('./content/facts.free');
  registerBundle(free.contentVersion, free.facts);
  LATEST_CONTENT_VERSION = free.contentVersion;
} catch (e) {
  // not generated yet (run tools/build-content.js); the server registers its own bundles
}

/** The bundled free-pool index for a content version, or null (client uses this; the server registers its own). */
function getContent(version) {
  return BUNDLES[version === undefined ? LATEST_CONTENT_VERSION : version] || null;
}

/** Facts of a free-play category group ('all' or a category key), usable in decks. */
function groupMeasures(group) {
  return MEASURES.filter((m) => group === 'all' || !group || m.category === group).map((m) => m.key);
}

function countByGroup(index) {
  const out = { all: 0 };
  MEASURES.forEach((m) => {
    const n = index.byMeasure[m.key].length;
    out.all += n;
    out[m.category] = (out[m.category] || 0) + n;
  });
  return out;
}

module.exports = {
  LICENCES, POOLS, BANNED_HOSTS, EXCLUSION_TAGS, LAUNCH_COUNTS, MAX_FACT_CITED_PER_SOURCE,
  validateContent, indexFacts, registerBundle, getContent, isActive, groupMeasures, countByGroup, hostOf, isBannedHost,
  get LATEST_CONTENT_VERSION() {
    return LATEST_CONTENT_VERSION;
  },
};
