'use strict';
// Server-only daily fact pool (collection `daily_facts`, loaded by scripts/import-daily-facts.js) and the
// ops-edited overrides. The daily pool NEVER ships in the game package and is only ever read here.
// Doc id = `v<contentVersion>_<factId>` so the last 2 content versions live side by side (spec 3.9).
const store = require('./store');
const { now } = require('./util');

const TTL_MS = 10 * 60 * 1000;
const factCache = new Map(); // docId -> {at, fact|null}
const poolCache = new Map(); // contentVersion -> {at, facts}

function docId(contentVersion, factId) {
  return `v${contentVersion}_${factId}`;
}
function clearCaches() {
  factCache.clear();
  poolCache.clear();
}

/** One daily fact (pinned content version) or null. Cached: facts are immutable per version. */
async function getDailyFact(contentVersion, factId) {
  const id = docId(contentVersion, factId);
  const hit = factCache.get(id);
  const t = now();
  if (hit && t - hit.at < TTL_MS) return hit.fact;
  const fact = await store.getDoc('daily_facts', id);
  if (factCache.size > 2000) factCache.clear();
  factCache.set(id, { at: t, fact });
  return fact;
}

/** Many facts of one version in few reads (history deck view); fills the cache. Missing ids are absent from the map. */
async function getDailyFacts(contentVersion, factIds) {
  const out = new Map();
  const missing = [];
  const t = now();
  for (const id of new Set(factIds)) {
    const hit = factCache.get(docId(contentVersion, id));
    if (hit && t - hit.at < TTL_MS && hit.fact) out.set(id, hit.fact);
    else missing.push(id);
  }
  const _ = store._();
  for (let i = 0; i < missing.length; i += 50) {
    const ids = missing.slice(i, i + 50).map((id) => docId(contentVersion, id));
    const r = await store.db().collection('daily_facts').where({ _id: _.in(ids) }).limit(50).get();
    for (const f of r.data) {
      out.set(f.id, f);
      factCache.set(docId(contentVersion, f.id), { at: t, fact: f });
    }
  }
  return out;
}

/** All daily-pool facts of a content version (genDaily only). */
async function loadDailyPool(contentVersion) {
  const hit = poolCache.get(contentVersion);
  if (hit && now() - hit.at < 60 * 1000) return hit.facts;
  const facts = await store.queryAll('daily_facts', { contentVersion }, { max: 5000 });
  poolCache.set(contentVersion, { at: now(), facts });
  return facts;
}

const EMPTY_OVERRIDES = { suspended: [], errata: {} };
async function getOverrides() {
  const o = await store.getDoc('fact_overrides', 'live');
  return o ? { suspended: o.suspended || [], errata: o.errata || {} } : { ...EMPTY_OVERRIDES, suspended: [], errata: {} };
}

module.exports = { docId, getDailyFact, getDailyFacts, loadDailyPool, getOverrides, clearCaches };
