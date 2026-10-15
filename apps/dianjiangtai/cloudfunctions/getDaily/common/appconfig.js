'use strict';
// Remote feature config (app_config/live, edited in the cloud console). Spec 12, 14.1, PO-11.
// Everything is optional: a missing/unreadable document or field means feature off / defaults (AC 94).
const core = require('./coreapi');
const store = require('./store');
const { isPlainObject, now } = require('./util');

const CACHE_MS = 60 * 1000;
const TMPL_RE = /^[A-Za-z0-9_-]{10,80}$/;
const AD_UNIT_RE = /^[A-Za-z0-9_-]{4,64}$/;
const DEFAULT_FIELDS = { title: 'thing1', theirRecord: 'thing2', myRecord: 'thing3', time: 'time4' };

let cache = null; // {at, doc} per function instance

/** the raw document, or null. Never throws. */
async function loadDoc() {
  const t = now();
  if (cache && t - cache.at < CACHE_MS) return cache.doc;
  let doc = null;
  try {
    doc = await store.getDoc('app_config', 'live');
  } catch (e) {
    console.warn('[app_config] unreadable, using defaults', store.errText(e));
  }
  cache = { at: t, doc: isPlainObject(doc) ? doc : null };
  return cache.doc;
}
function reset() { cache = null; }

function clampInt(v, min, max, dflt) {
  if (!Number.isInteger(v)) return dflt;
  return Math.min(max, Math.max(min, v));
}

/** Template id and field map. The env var SUBSCRIBE_TEMPLATE_ID is the fallback when app_config has none. */
function subscribeOf(doc) {
  const s = doc && isPlainObject(doc.subscribe) ? doc.subscribe : {};
  const cand = typeof s.tmplId === 'string' && s.tmplId ? s.tmplId : process.env.SUBSCRIBE_TEMPLATE_ID;
  const tmplId = typeof cand === 'string' && TMPL_RE.test(cand) ? cand : null;
  const fields = { ...DEFAULT_FIELDS };
  if (isPlainObject(s.fields)) {
    for (const k of Object.keys(DEFAULT_FIELDS)) if (typeof s.fields[k] === 'string' && /^[a-z]+\d{1,3}$/.test(s.fields[k])) fields[k] = s.fields[k];
  }
  return { tmplId, fields };
}

function adsOf(doc) {
  const a = doc && isPlainObject(doc.ads) ? doc.ads : {};
  const b = isPlainObject(a.banner) ? a.banner : {};
  const banner = b.enabled === true && typeof b.adUnitId === 'string' && AD_UNIT_RE.test(b.adUnitId)
    ? { enabled: true, adUnitId: b.adUnitId } : { enabled: false, adUnitId: '' };
  const d = core.interstitialDefaults();
  const i = isPlainObject(a.interstitial) ? a.interstitial : {};
  const interstitial = {
    enabled: typeof i.enabled === 'boolean' ? i.enabled : d.enabled,
    everyNRuns: clampInt(i.everyNRuns, 2, 1000, d.everyNRuns),
    minLifetimeRuns: clampInt(i.minLifetimeRuns, 2, 1000, d.minLifetimeRuns),
    minGapSec: clampInt(i.minGapSec, 60, 86400, d.minGapSec),
    maxPerDay: clampInt(i.maxPerDay, 0, 8, d.maxPerDay),
  };
  return { banner, interstitial };
}

/** client-facing `features` for getDaily. Holds no secret and no field map. */
async function features() {
  const doc = await loadDoc();
  const f = { ads: adsOf(doc) };
  const sub = subscribeOf(doc);
  if (sub.tmplId) f.subscribe = { tmplId: sub.tmplId };
  return f;
}
async function subscribeConfig() {
  return subscribeOf(await loadDoc());
}

module.exports = { features, subscribeConfig, loadDoc, reset, DEFAULT_FIELDS };
