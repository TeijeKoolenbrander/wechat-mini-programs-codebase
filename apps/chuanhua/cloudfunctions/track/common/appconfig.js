'use strict';
// Remote config (app_config/live, edited in the console): kill switches, subscribe template, features, timers.
// Cached per function instance: 10 s for the UGC gates (AC 53, 54), 60 s for getHome. Unreadable or missing = defaults
// (UGC on, optional features off, spec edge 31); a read ERROR after a successful read keeps the last good value, so an
// emergency stop (viewEnabled:false) is not undone by a database hiccup (TD-23).
const { CONFIG, applyRemote, ugcCreateAllowed } = require('../core/config');
const store = require('./store');
const { now, isPlainObject } = require('./util');

let cache = null; // {at, doc}

async function loadDoc(maxAgeMs) {
  const t = now();
  if (cache && t - cache.at < maxAgeMs) return cache.doc;
  try {
    const doc = await store.getDoc('app_config', 'live');
    cache = { at: t, doc: isPlainObject(doc) ? doc : null };
  } catch (e) {
    console.warn('[app_config] unreadable', store.errText(e));
    cache = { at: t, doc: cache ? cache.doc : null };
  }
  return cache.doc;
}
function reset() {
  cache = null;
}

/** applyRemote() view {config, ugc, subscribe, banner, features} + the subscribe field map */
async function get(maxAgeMs) {
  const doc = await loadDoc(maxAgeMs === undefined ? CONFIG.cache.appConfigGateMs : maxAgeMs);
  const c = applyRemote(doc);
  const f = doc && isPlainObject(doc.subscribe) && isPlainObject(doc.subscribe.fields) ? doc.subscribe.fields : {};
  c.subscribeFields = { title: 'thing1', prompt: 'thing2', time: 'time3' };
  for (const k of Object.keys(c.subscribeFields)) if (typeof f[k] === 'string' && /^[a-z]+\d{1,3}$/.test(f[k])) c.subscribeFields[k] = f[k];
  return c;
}
const forHome = () => get(CONFIG.cache.appConfigHomeMs);

/** can creation (new chains, claims, submissions) proceed right now? */
function createAllowed(c) {
  return ugcCreateAllowed(c.ugc, now());
}

module.exports = { get, forHome, reset, createAllowed };
