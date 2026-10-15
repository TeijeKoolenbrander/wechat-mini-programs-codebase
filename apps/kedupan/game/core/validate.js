/**
 * Content validation (spec 4.1, 4.3, 4.5, AC 8). Pure CommonJS. Used by tests, tools/validate-content.js
 * and (copy) by CI. Every function returns an array of violation strings; [] means clean.
 */

const forbidden = require('./content/forbidden.v1.js');

const QUOTAS = { food: 40, life: 40, home: 25, animal: 25, nature: 25, senses: 25, leisure: 25, travel: 20, study: 20, tech: 20, feel: 20, memory: 15 };
const MIN_SPECTRA = 300;
const MIN_ITEMS = 10;
const CJK = /^[一-鿿]+$/;

/** Every forbidden term as { term, group }. */
function allTerms() {
  const out = [];
  Object.keys(forbidden.groups).forEach((g) => forbidden.groups[g].forEach((t) => out.push({ term: t, group: g })));
  return out;
}

/** Forbidden terms found in one string (substring match). */
function termsIn(str) {
  const hits = [];
  const s = String(str);
  allTerms().forEach((x) => {
    if (s.indexOf(x.term) >= 0) hits.push(x);
  });
  return hits;
}

/** Every user-visible string of the library with its location. */
function visibleStrings(raw) {
  const out = [];
  raw.categories.forEach((c) => out.push({ where: 'category ' + c.key, text: c.label }));
  raw.spectra.forEach((s) => {
    out.push({ where: s.id + '.left', text: s.left });
    out.push({ where: s.id + '.right', text: s.right });
    s.items.forEach((it) => out.push({ where: it.id, text: it.text }));
  });
  return out;
}

/** Structure, id, length, anchor, quota rules (spec 4.1, 4.3). */
function validateStructure(raw, opts) {
  const o = opts || {};
  const bad = [];
  const cats = new Set(raw.categories.map((c) => c.key));
  if (raw.categories.length !== 12) bad.push('expected 12 categories, got ' + raw.categories.length);
  if (raw.spectra.length < (o.minSpectra || MIN_SPECTRA)) bad.push('only ' + raw.spectra.length + ' spectra');
  const ids = new Set();
  const itemIds = new Set();
  const perCat = {};
  raw.spectra.forEach((s) => {
    if (!/^s\d{3}$/.test(s.id)) bad.push('bad spectrum id ' + s.id);
    if (ids.has(s.id)) bad.push('duplicate spectrum id ' + s.id);
    ids.add(s.id);
    if (!cats.has(s.cat)) bad.push(s.id + ': unknown category ' + s.cat);
    perCat[s.cat] = (perCat[s.cat] || 0) + 1;
    [['left', s.left], ['right', s.right]].forEach((p) => {
      if (!CJK.test(p[1]) || p[1].length < 1 || p[1].length > 4) bad.push(s.id + '.' + p[0] + ' "' + p[1] + '" must be 1-4 Chinese characters, no punctuation');
    });
    if (s.left === s.right) bad.push(s.id + ': ends are equal');
    if (s.items.length < MIN_ITEMS) bad.push(s.id + ': only ' + s.items.length + ' items');
    const texts = new Set();
    s.items.forEach((it, k) => {
      if (it.id !== s.id + 'i' + String(k + 1).padStart(2, '0')) bad.push('bad item id ' + it.id + ' in ' + s.id);
      if (itemIds.has(it.id)) bad.push('duplicate item id ' + it.id);
      itemIds.add(it.id);
      if (!CJK.test(it.text) || it.text.length < 1 || it.text.length > 10) bad.push(it.id + ' "' + it.text + '" must be 1-10 Chinese characters');
      if (texts.has(it.text)) bad.push(it.id + ': duplicate text "' + it.text + '" in ' + s.id);
      texts.add(it.text);
      if (!Number.isInteger(it.anchor) || it.anchor < 5 || it.anchor > 95) bad.push(it.id + ': anchor ' + it.anchor + ' not an integer 5-95');
      const easy = it.tags.indexOf('easy') >= 0;
      if (easy !== (it.anchor <= 20 || it.anchor >= 80)) bad.push(it.id + ': easy tag does not match anchor ' + it.anchor);
      if (it.text === s.left || it.text === s.right) bad.push(it.id + ': item equals a spectrum end');
    });
  });
  Object.keys(QUOTAS).forEach((k) => {
    if ((perCat[k] || 0) < (o.quotas ? o.quotas[k] : QUOTAS[k])) bad.push('category ' + k + ' has ' + (perCat[k] || 0) + ' spectra, quota ' + QUOTAS[k]);
  });
  return bad;
}

/** Forbidden-term scan over the visible strings plus any extra strings (share titles, store copy). */
function validateForbidden(raw, extraStrings) {
  const bad = [];
  visibleStrings(raw)
    .concat((extraStrings || []).map((t, i) => ({ where: 'extra#' + i, text: t })))
    .forEach((v) => {
      termsIn(v.text).forEach((h) => bad.push(v.where + ' "' + v.text + '" contains forbidden ' + h.group + ' term "' + h.term + '"'));
    });
  return bad;
}

/** The pair-level checks: a spectrum's own ends and items must not reuse a banned name within a pair either. */
function validateAll(raw, extraStrings, opts) {
  return validateStructure(raw, opts).concat(validateForbidden(raw, extraStrings));
}

module.exports = { QUOTAS, MIN_SPECTRA, MIN_ITEMS, termsIn, allTerms, visibleStrings, validateStructure, validateForbidden, validateAll };
