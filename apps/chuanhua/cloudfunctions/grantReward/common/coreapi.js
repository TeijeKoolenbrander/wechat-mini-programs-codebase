'use strict';
// The ONLY place that touches the game core (copied into ./core by sync-core.js; source
// apps/chuanhua/game/core, contract in its README). Security-relevant logic (stroke limits, text rules,
// date keys, claim rules) is implemented in common/ so the server never depends on a client-owned
// module for its decisions; from the core we use:
//   core/content/prompts.v1.js    {prompts:[{id,text,cat,retired?}]} (an array or {PROMPTS} also accepted)
//   core/content/blocklist.v1.js  {categories:{<name>: string[]}}    (an array or {BLOCKLIST} also accepted)
//   core/daily.js                 dailyIds(dateKey[, launchKey]) -> 3 ids (preferred; keeps client and server in step)
//   core/text.js                  check(str, 'prompt'|'desc')        (applied IN ADDITION to common/text.js)
//   core/raster.js + core/png.js  rasterize / encodePng              (pixel parity with the client renderer, AC 27)
const zlib = require('zlib');
const { fail, daysBetween } = require('./util');

function tryRequire(p) {
  try {
    return require(p);
  } catch (e) {
    if (e && e.code === 'MODULE_NOT_FOUND' && String(e.message).includes(p)) return null;
    throw e;
  }
}
function asArray(mod, ...names) {
  if (Array.isArray(mod)) return mod;
  if (mod) for (const n of names) if (Array.isArray(mod[n])) return mod[n];
  return null;
}
function flattenBlocklist(mod) {
  const arr = asArray(mod, 'BLOCKLIST', 'blocklist');
  if (arr) return arr;
  if (mod && mod.categories && typeof mod.categories === 'object') return Object.values(mod.categories).flat().filter((x) => typeof x === 'string');
  return [];
}

let cache = null;
function load(overrides) {
  if (cache && !overrides) return cache;
  const o = overrides || {};
  const promptsMod = 'prompts' in o ? o.prompts : tryRequire('../core/content/prompts.v1');
  const prompts = asArray(promptsMod, 'prompts', 'PROMPTS', 'default');
  cache = {
    prompts,
    byId: prompts ? new Map(prompts.map((p) => [p.id, p])) : new Map(),
    blocklist: flattenBlocklist('blocklist' in o ? o.blocklist : tryRequire('../core/content/blocklist.v1')),
    daily: 'daily' in o ? o.daily : tryRequire('../core/daily'),
    text: 'text' in o ? o.text : tryRequire('../core/text'),
    raster: 'raster' in o ? o.raster : tryRequire('../core/raster'),
    png: 'png' in o ? o.png : tryRequire('../core/png'),
  };
  return cache;
}
/** tests: drop the cache, optionally injecting core modules ({prompts, blocklist, daily, text, raster, png}) */
function resetForTests(overrides) {
  cache = null;
  if (overrides) load(overrides);
}

function prompts() {
  const c = load();
  if (!c.prompts) fail('SERVER_CONFIG', 'prompt bank missing (core not synced)');
  return c.prompts;
}
function promptById(id) {
  prompts();
  const p = load().byId.get(id);
  return p && !p.retired ? p : null;
}
function blocklist() {
  return load().blocklist;
}

/**
 * Extra local text check from the game core (same rules the client applied), run in addition to
 * common/text.js. Returns {ok:true} or {ok:false, reason}. A missing core module means no extra check.
 */
function coreTextCheck(str, kind) {
  const t = load().text;
  if (!t || typeof t.check !== 'function') return { ok: true };
  const r = t.check(str, kind);
  return r && r.ok ? { ok: true } : { ok: false, reason: (r && r.reason) || 'core' };
}

function hasCoreDaily() {
  const d = load().daily;
  return !!(d && typeof d.dailyIds === 'function');
}

// mulberry32 + FNV-1a: only used when core/daily.js is unavailable (tests, early deploys).
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 今日起点: 3 prompt ids for a Beijing date key (spec 4.1). Prefers the game's core/daily.js. */
function dailyPromptIds(dateKey, launchKey) {
  const c = load();
  if (hasCoreDaily()) return c.daily.dailyIds(dateKey, launchKey);
  const ids = prompts().filter((p) => !p.retired).map((p) => p.id);
  const order = ids.slice();
  const rng = mulberry32(hash32('chuanhua-daily-v1'));
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const day = Math.max(0, daysBetween(launchKey, dateKey));
  return [0, 1, 2].map((k) => order[(day * 3 + k) % order.length]);
}

/**
 * Moderation PNG from validated strokes: the core rasteriser when present (pixel parity with what the
 * client shows), else null (the caller falls back to common/raster.js).
 */
function renderPngFromCore(strokes) {
  const c = load();
  if (!c.raster || !c.png || typeof c.raster.rasterize !== 'function' || typeof c.png.encodePng !== 'function') return null;
  return Buffer.from(c.png.encodePng(c.raster.rasterize(strokes), { deflate: (b) => zlib.deflateSync(Buffer.from(b)) }));
}

module.exports = { prompts, promptById, blocklist, dailyPromptIds, hasCoreDaily, coreTextCheck, renderPngFromCore, resetForTests };
