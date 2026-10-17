/**
 * Content access (spec 4). The library is TWO modules (TD-62):
 *   `content/spectra.v1.js`  client-safe text (ships in the game package; no anchors, no tags)
 *   `content/anchors.v1.js`  SERVER-ONLY answer key: per item the anchor (prior of the live median) and the tags
 * This module indexes them and derives the card shapes the rest of the code uses. Pure JS; relative `.js` requires
 * only (WeChat cannot require .json).
 *
 *   getContent(2)          -> CLIENT content for contentVersion 2 (text only, hasAnchors false), or null if absent
 *   getServerContent(2)    -> the library merged with the answer key (hasAnchors true), or null when either module
 *                             is absent. Cloud functions, the mock server, the schedule tool and the content tests
 *                             use this; the client never calls it (the answer key is not in its package).
 *   serverLibrary(2)       -> the merged RAW library (tests)
 *   createContent(raw)     -> index any raw library object (tests use a small fixture)
 *   registerContent(raw)   -> make getContent / getServerContent(raw.contentVersion) return that library (tests, tools)
 */

const LATEST_CONTENT_VERSION = 2;

const SPECTRUM_ID = /^s\d{3}$/;
const ITEM_ID = /^s\d{3}i\d{2}$/;

const overrides = Object.create(null);
const cache = Object.create(null);
const serverCache = Object.create(null);
const TAG = /^(easy|split|season:(spring|summer|autumn|winter)|festival:[a-z]+)$/;

/** Structural problems of a raw library (empty = fine). The full quota/forbidden-term validation is the content writer's test. */
function shapeErrors(raw) {
  const errs = [];
  if (!raw || typeof raw !== 'object') return ['library is not an object'];
  if (!Number.isInteger(raw.contentVersion)) errs.push('contentVersion must be an integer');
  const cats = new Set();
  (raw.categories || []).forEach((c) => {
    if (!c || !c.key || !c.label) errs.push('bad category ' + JSON.stringify(c));
    else cats.add(c.key);
  });
  const sIds = new Set();
  const iIds = new Set();
  (raw.spectra || []).forEach((s) => {
    if (!s || !SPECTRUM_ID.test(s.id)) return errs.push('bad spectrum id ' + (s && s.id));
    if (sIds.has(s.id)) errs.push('duplicate spectrum id ' + s.id);
    sIds.add(s.id);
    if (!s.left || !s.right) errs.push(s.id + ': left/right missing');
    if (!cats.has(s.cat)) errs.push(s.id + ': unknown cat ' + s.cat);
    if (!Array.isArray(s.items) || s.items.length === 0) errs.push(s.id + ': no items');
    (s.items || []).forEach((it) => {
      if (!it || !ITEM_ID.test(it.id) || it.id.slice(0, 4) !== s.id) return errs.push(s.id + ': bad item id ' + (it && it.id));
      if (iIds.has(it.id)) errs.push('duplicate item id ' + it.id);
      iIds.add(it.id);
      if (!it.text) errs.push(it.id + ': text missing');
      // the client library has no anchors; when an item carries one (merged server library, test fixtures) it must be valid
      if (it.anchor !== undefined && (!Number.isInteger(it.anchor) || it.anchor < 5 || it.anchor > 95)) errs.push(it.id + ': anchor must be an integer 5..95');
      if (it.tags !== undefined && (!Array.isArray(it.tags) || !it.tags.every((t) => typeof t === 'string'))) errs.push(it.id + ': tags must be a string array');
    });
  });
  return errs;
}

/** Index a raw library. Throws on structural errors so a bad library never half-loads. */
function createContent(raw) {
  const errs = shapeErrors(raw);
  if (errs.length) throw new Error('invalid content: ' + errs.slice(0, 5).join('; '));
  const catLabel = Object.create(null);
  raw.categories.forEach((c) => {
    catLabel[c.key] = c.label;
  });
  const spectrumById = Object.create(null);
  const itemIndex = Object.create(null);
  const itemIds = [];
  raw.spectra.forEach((s) => {
    spectrumById[s.id] = s;
    s.items.forEach((it) => {
      itemIndex[it.id] = { spectrum: s, item: it };
      itemIds.push(it.id);
    });
  });
  const hasAnchors = itemIds.length > 0 && itemIds.every((id) => Number.isInteger(itemIndex[id].item.anchor));
  return { contentVersion: raw.contentVersion, categories: raw.categories, catLabel, spectra: raw.spectra, spectrumById, itemIndex, itemIds, hasAnchors };
}

/**
 * Merge the server-only answer key into a client library. Returns {raw, errors}: any disagreement between the two
 * modules (an item without a key, a key without an item, a bad anchor or tag, another contentVersion) is an error.
 */
function mergeAnswerKey(raw, key) {
  const errs = [];
  if (!key || typeof key !== 'object' || !key.items || typeof key.items !== 'object') return { raw: null, errors: ['answer key malformed'] };
  if (key.contentVersion !== raw.contentVersion) errs.push('answer key contentVersion ' + key.contentVersion + ' != library ' + raw.contentVersion);
  const seen = new Set();
  const spectra = (raw.spectra || []).map((s) => ({
    ...s,
    items: (s.items || []).map((it) => {
      seen.add(it.id);
      const k = key.items[it.id];
      if (!k) {
        errs.push(it.id + ': no entry in the answer key');
        return it;
      }
      if (!Number.isInteger(k.anchor) || k.anchor < 5 || k.anchor > 95) errs.push(it.id + ': anchor must be an integer 5..95');
      if (!Array.isArray(k.tags) || !k.tags.every((t) => typeof t === 'string' && TAG.test(t))) errs.push(it.id + ': bad tags');
      return { ...it, anchor: k.anchor, tags: Array.isArray(k.tags) ? k.tags.slice() : [] };
    }),
  }));
  Object.keys(key.items).forEach((id) => {
    if (!seen.has(id)) errs.push(id + ': answer key entry without a library item');
  });
  return { raw: { ...raw, spectra }, errors: errs };
}

const LOADERS = {
  // static string so the WeChat packer sees it; absent until the content writer's file lands
  // contentVersion 2 lives in the file still named spectra.v1.js (the name is the format generation, not the content version)
  2: () => require('./content/spectra.v1'),
};

// the answer key: server only, listed in packOptions.ignore, so on a device this require fails and getServerContent says null
const KEY_LOADERS = {
  2: () => require('./content/anchors.v1'),
};

/** A require that failed because the module is not in the package (Node: MODULE_NOT_FOUND; WeChat: "module ... is not defined"). */
function isMissingModule(e) {
  return !!e && (e.code === 'MODULE_NOT_FOUND' || /is not defined|Cannot find module/i.test(String(e.message)));
}
function load(loader) {
  try {
    return loader();
  } catch (e) {
    if (isMissingModule(e)) return null;
    throw e;
  }
}

/** Indexed CLIENT content for a version (no answer key), or null when unknown / the module is missing. */
function getContent(version) {
  const v = version === undefined ? LATEST_CONTENT_VERSION : Number(version);
  if (cache[v]) return cache[v];
  const raw = overrides[v] || (LOADERS[v] ? load(LOADERS[v]) : null);
  if (!raw) return null;
  cache[v] = createContent(raw);
  return cache[v];
}

/** The merged RAW library (text + anchors + tags) for a version, or null when either module is missing. Throws on disagreement. */
function serverLibrary(version) {
  const v = version === undefined ? LATEST_CONTENT_VERSION : Number(version);
  if (overrides[v]) return overrides[v];
  const base = LOADERS[v] ? load(LOADERS[v]) : null;
  const key = KEY_LOADERS[v] ? load(KEY_LOADERS[v]) : null;
  if (!base || !key) return null;
  const m = mergeAnswerKey(base, key);
  if (m.errors.length) throw new Error('invalid content: ' + m.errors.slice(0, 5).join('; '));
  return m.raw;
}

/** Indexed SERVER content (anchors and tags merged in), or null when the library or the answer key is missing. */
function getServerContent(version) {
  const v = version === undefined ? LATEST_CONTENT_VERSION : Number(version);
  if (serverCache[v]) return serverCache[v];
  const raw = serverLibrary(v);
  if (!raw) return null;
  const c = createContent(raw);
  if (!c.hasAnchors) return null;
  serverCache[v] = c;
  return c;
}

/** Test/tool hook: serve `raw` for raw.contentVersion. Pass null with a version to clear. */
function registerContent(raw, version) {
  const v = raw ? raw.contentVersion : version;
  if (raw) overrides[v] = raw;
  else delete overrides[v];
  delete cache[v];
  delete serverCache[v];
}

/** The server-side card of an item (spec 11.1 daily_sets.cards[i]); includes the anchor (server content only), never sent to clients for open days. */
function cardOf(content, itemId) {
  const e = content.itemIndex[itemId];
  if (!e) return null;
  return { itemId, spectrumId: e.spectrum.id, left: e.spectrum.left, right: e.spectrum.right, prompt: e.item.text, anchor: e.item.anchor, cat: e.spectrum.cat };
}

/** The client-safe card (spec 10 CardText): no anchor, with the category label. Works on a server card or an item id. */
function cardText(content, cardOrItemId) {
  const card = typeof cardOrItemId === 'string' ? cardOf(content, cardOrItemId) : cardOrItemId;
  if (!card) return null;
  return {
    itemId: card.itemId,
    spectrumId: card.spectrumId,
    left: card.left,
    right: card.right,
    prompt: card.prompt,
    catLabel: (content && content.catLabel[card.cat]) || card.catLabel || '',
  };
}

/** Client-safe text of a stored card with no content module at hand (uses the label table of a content, if any). */
function itemTags(content, itemId) {
  const e = content.itemIndex[itemId];
  return e ? e.item.tags || [] : [];
}

module.exports = { LATEST_CONTENT_VERSION, shapeErrors, createContent, mergeAnswerKey, getContent, getServerContent, serverLibrary, registerContent, cardOf, cardText, itemTags, isMissingModule };
