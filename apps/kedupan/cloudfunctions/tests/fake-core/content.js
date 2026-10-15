'use strict';
// TEST DOUBLE of apps/kedupan/game/core/content.js: getContent(1) with the real lookups (spectrumById, itemById).
// 40 generated spectra x 10 items. Ids follow the real scheme (s001, s001i03).
const CATS = ['food', 'life', 'work', 'travel', 'tech', 'feel', 'nature', 'sport', 'home', 'study', 'fun', 'city'];
const pad = (n, w) => String(n).padStart(w, '0');
const LATEST_CONTENT_VERSION = 1;
let cache = null;

function build() {
  const spectra = [];
  for (let s = 1; s <= 40; s++) {
    const items = [];
    for (let i = 1; i <= 10; i++) {
      const anchor = 5 + ((s * 7 + i * 13) % 91);
      const tags = [];
      if (anchor <= 20 || anchor >= 80) tags.push('easy');
      if (i % 4 === 0) tags.push('split');
      items.push({ id: `s${pad(s, 3)}i${pad(i, 2)}`, text: `物${s}-${i}`, anchor, tags });
    }
    spectra.push({ id: `s${pad(s, 3)}`, left: `左${s}`, right: `右${s}`, cat: CATS[s % 12], items });
  }
  const spectrumById = {};
  const itemById = {};
  for (const sp of spectra) {
    spectrumById[sp.id] = sp;
    for (const it of sp.items) itemById[it.id] = { ...it, spectrumId: sp.id, cat: sp.cat, left: sp.left, right: sp.right };
  }
  return { contentVersion: 1, categories: CATS.map((k) => ({ key: k, label: k })), catLabel: Object.fromEntries(CATS.map((k) => [k, k])), spectra, spectrumById, itemById };
}
function getContent(version) {
  if (Number(version) !== 1) return null;
  if (!cache) cache = build();
  return cache;
}
module.exports = { getContent, LATEST_CONTENT_VERSION };
