'use strict';
// The ONLY place that touches the game core (copied into ./core by sync-core.js; source
// apps/chuanhua/game/core). Everything security-relevant (stroke limits, text rules, rasteriser,
// date keys) is implemented in common/ so the server never depends on a client-owned module.
// From the core we need content only:
//   core/content/prompts.v1.js   -> array of {id, text, cat, retired?}  (or {PROMPTS:[...]})
//   core/content/blocklist.v1.js -> array of strings                    (or {BLOCKLIST:[...]})
//   core/daily.js (optional)     -> dailyPromptIds(dateKey, ids, launchKey) -> [id,id,id]
const { fail, utcMidnight, daysBetween } = require('./util');

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

let cache = null;
function load() {
  if (cache) return cache;
  const prompts = asArray(tryRequire('../core/content/prompts.v1'), 'PROMPTS', 'prompts', 'default');
  const blocklist = asArray(tryRequire('../core/content/blocklist.v1'), 'BLOCKLIST', 'blocklist', 'default') || [];
  cache = {
    prompts,
    byId: prompts ? new Map(prompts.map((p) => [p.id, p])) : new Map(),
    blocklist,
    daily: tryRequire('../core/daily'),
  };
  return cache;
}
function resetForTests() {
  cache = null;
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

// mulberry32 + FNV-1a: same family as the DJT rng; used only if core/daily.js is unavailable.
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
  const ids = prompts().filter((p) => !p.retired).map((p) => p.id);
  if (c.daily && typeof c.daily.dailyPromptIds === 'function') return c.daily.dailyPromptIds(dateKey, ids, launchKey);
  const order = ids.slice();
  const rng = mulberry32(hash32('chuanhua-daily-v1'));
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const day = Math.max(0, daysBetween(launchKey, dateKey));
  return [0, 1, 2].map((k) => order[(day * 3 + k) % order.length]);
}

module.exports = { prompts, promptById, blocklist, dailyPromptIds, resetForTests, utcMidnight };
