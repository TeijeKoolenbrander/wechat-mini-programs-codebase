/**
 * Content access (spec 4). Pure CommonJS. Loads core/content/spectra.v1.js and
 * builds the lookups the client, the mock server and the cloud functions share.
 *
 *   getContent(version) -> {
 *     contentVersion, categories, catLabel{key: label}, spectra[], spectrumById{}, itemById{},
 *     cardText(itemId) -> CardText, spectrumCardTexts... }
 *
 * CardText = { itemId, spectrumId, left, right, prompt, catLabel }  (spec 10)
 */

const { sub, shuffle, int } = require('./rng');

const LATEST_CONTENT_VERSION = 1;
const cache = {};

function build(raw) {
  const catLabel = {};
  raw.categories.forEach((c) => (catLabel[c.key] = c.label));
  const spectrumById = {};
  const itemById = {};
  const byCat = {};
  raw.categories.forEach((c) => (byCat[c.key] = []));
  raw.spectra.forEach((s) => {
    spectrumById[s.id] = s;
    byCat[s.cat].push(s);
    s.items.forEach((it) => {
      itemById[it.id] = { id: it.id, text: it.text, anchor: it.anchor, tags: it.tags || [], spectrumId: s.id, cat: s.cat, left: s.left, right: s.right };
    });
  });
  const content = {
    contentVersion: raw.contentVersion,
    categories: raw.categories,
    catLabel,
    spectra: raw.spectra,
    spectrumById,
    itemById,
    byCat,
    /** The public text of an item (what a client may show): never the anchor. */
    cardText(itemId) {
      const it = itemById[itemId];
      if (!it) return null;
      return { itemId: it.id, spectrumId: it.spectrumId, left: it.left, right: it.right, prompt: it.text, catLabel: catLabel[it.cat] };
    },
  };
  return content;
}

/** getContent(version) -> content | null. The server keeps the last 2 versions; v1 only for now. */
function getContent(version) {
  const v = Number(version);
  if (v !== 1) return null;
  if (!cache[v]) cache[v] = build(require('./content/spectra.v1'));
  return cache[v];
}

/**
 * Host mode: `count` spectra drawn at random (seeded) from the library, none from `exclude`.
 * Same seed gives the same draw, so a "换一组" is `pickSpectra(content, sub-seed with a batch counter, ...)`.
 */
function pickSpectra(content, seed, count, exclude) {
  const skip = {};
  (exclude || []).forEach((id) => (skip[id] = true));
  const ids = content.spectra.map((s) => s.id).filter((id) => !skip[id]);
  shuffle(sub(seed, 'spectra'), ids);
  return ids.slice(0, count).map((id) => content.spectrumById[id]);
}

/**
 * Host mode clue presets for a spectrum: `batch` 0 gives 6 items, batch 1 the next 6 (wrapping), stable per seed.
 * Returns [{ itemId, text }].
 */
function clueOptions(content, spectrumId, seed, batch, count) {
  const n = count || 6;
  const s = content.spectrumById[spectrumId];
  if (!s) return [];
  const order = shuffle(sub(seed, 'clues:' + spectrumId), s.items.map((it) => it.id));
  const out = [];
  for (let i = 0; i < n && i < order.length; i++) {
    const id = order[((batch || 0) * n + i) % order.length];
    out.push({ itemId: id, text: content.itemById[id].text });
  }
  return out;
}

/** A single random spectrum id helper for tests and the mock. */
function randomSpectrumId(content, rng) {
  return content.spectra[int(rng, content.spectra.length)].id;
}

module.exports = { getContent, pickSpectra, clueOptions, randomSpectrumId, LATEST_CONTENT_VERSION };
