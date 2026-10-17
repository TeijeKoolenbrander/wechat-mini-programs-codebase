/**
 * TEST FIXTURE ONLY (not the real library; the real one is core/content/spectra.v1.js, written by the content owner).
 * Same format as spec 4.1: 120 synthetic spectra in the 12 categories, 10 items each, deterministic. Text is placeholder
 * (no real content). Anchors cycle so every spectrum has 5 `easy` and 3 `split` items; a few items carry season and
 * festival tags so the schedule rules can be exercised.
 */

const CATS = ['food', 'life', 'home', 'animal', 'nature', 'senses', 'leisure', 'travel', 'study', 'tech', 'feel', 'memory'];
const ANCHORS = [10, 88, 50, 25, 75, 15, 85, 55, 45, 92];

function pad(n, w) {
  return String(n).padStart(w, '0');
}

function build() {
  const spectra = [];
  for (let i = 1; i <= 120; i++) {
    const id = 's' + pad(i, 3);
    const items = [];
    for (let j = 1; j <= 10; j++) {
      const anchor = ANCHORS[(j - 1 + i) % 10];
      const tags = [];
      if (anchor <= 20 || anchor >= 80) tags.push('easy');
      if (anchor >= 40 && anchor <= 60) tags.push('split');
      items.push({ id: id + 'i' + pad(j, 2), text: '物' + i + '-' + j, anchor, tags });
    }
    spectra.push({ id, left: '左' + i, right: '右' + i, cat: CATS[(i - 1) % 12], items });
  }
  // season / festival tagged extras on a few items (all easy so they can be card 1)
  spectra[0].items[0].tags = ['easy', 'season:winter'];
  spectra[0].items[0].anchor = 10;
  spectra[1].items[1].tags = ['easy', 'festival:midautumn'];
  spectra[1].items[1].anchor = 88;
  spectra[2].items[1].tags = ['easy', 'season:summer'];
  spectra[2].items[1].anchor = 88;
  return { contentVersion: 1, categories: CATS.map((k) => ({ key: k, label: '类' + k })), spectra };
}

module.exports = build();
