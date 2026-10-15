/**
 * Vocabulary dictionary (spec 3.2, 4.2). `text` is the committed word list (one word per
 * line, frequency order: the line number is vocabIdx). Pure; no wx.
 *
 *   const d = createDict(text)
 *   d.size, d.words[idx], d.has(w), d.idxOf(w) (-1 if absent)
 *   d.suggest(normalized, max) -> exact match first, then prefix matches by frequency (<= max)
 */

function createDict(text) {
  const words = String(text)
    .split('\n')
    .map((w) => w.trim())
    .filter(Boolean);
  const index = new Map();
  words.forEach((w, i) => {
    if (!index.has(w)) index.set(w, i);
  });
  return {
    words,
    size: words.length,
    has: (w) => index.has(w),
    idxOf: (w) => (index.has(w) ? index.get(w) : -1),
    suggest(norm, max) {
      const limit = max === undefined ? 6 : max;
      const out = [];
      if (!norm) return out;
      if (index.has(norm)) out.push(norm);
      for (let i = 0; i < words.length && out.length < limit; i++) {
        const w = words[i];
        if (w !== norm && w.length > norm.length && w.startsWith(norm)) out.push(w);
      }
      return out;
    },
  };
}

module.exports = { createDict };
