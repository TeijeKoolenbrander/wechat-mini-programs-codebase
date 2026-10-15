'use strict';
// TEST DOUBLE of apps/kedupan/game/core/content.js (+ content/spectra.v1.js, schedule.v1.js).
// 40 generated spectra x 10 items; a schedule for issues 1..80. Real shapes: spec section 4.1.
const CATS = ['food', 'life', 'work', 'travel', 'tech', 'feel', 'nature', 'sport', 'home', 'study', 'fun', 'city'];
const pad = (n, w) => String(n).padStart(w, '0');

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
  spectra.push({ id: `s${pad(s, 3)}`, left: `左${s}`.slice(0, 4), right: `右${s}`.slice(0, 4), cat: CATS[s % 12], items });
}

const itemIndex = new Map();
const spectrumIndex = new Map();
for (const sp of spectra) {
  spectrumIndex.set(sp.id, sp);
  for (const it of sp.items) itemIndex.set(it.id, { ...it, spectrumId: sp.id, left: sp.left, right: sp.right, cat: sp.cat });
}

const LATEST_CONTENT_VERSION = 1;

function getSpectrum(id) {
  return spectrumIndex.get(id) || null;
}
function getItem(id) {
  return itemIndex.get(id) || null;
}
function allItems() {
  return [...itemIndex.values()];
}
function allSpectra() {
  return spectra;
}
/** the 5 item ids of issue n, or null when the schedule is exhausted */
function scheduleFor(issueNo) {
  if (!Number.isInteger(issueNo) || issueNo < 1 || issueNo > 80) return null;
  const out = [];
  for (let k = 0; k < 5; k++) {
    const spec = ((5 * (issueNo - 1) + k) % 40) + 1;
    const item = Math.floor((5 * (issueNo - 1)) / 40) + 1;
    out.push(`s${pad(spec, 3)}i${pad(item, 2)}`);
  }
  return out;
}

module.exports = { LATEST_CONTENT_VERSION, getSpectrum, getItem, allItems, allSpectra, scheduleFor };
