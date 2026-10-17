'use strict';
/**
 * Text matching helpers for typed clues (spec 6.12 rule 6). Copied from 传画接龙 core/text.js (matching half only: the
 * prompt/description length rules and the input filter are not needed here; core/clue.js owns the clue rules).
 * Pure JS, no wx. Shared by the client (button state) and the cloud functions (the authority).
 *
 *   nfkcLower(raw)    NFKC, lower-case, "。" read as "." (so dotted domains written with Chinese full stops are caught)
 *   flat(s)           ASCII letters/digits and CJK only; everything else dropped (the form the blocklist is matched on)
 *   blocklistHit(raw) {category, term} | null   (content/blocklist.v1.js, with its exceptions)
 *   containsAny(raw, terms)  first term of `terms` found in the flat form of `raw`, or null (contact words)
 */

const blocklist = require('./content/blocklist.v1');

/** NFKC, lower-case, and "。" read as "." so dotted domains written with Chinese full stops are caught. */
function nfkcLower(raw) {
  let s = String(raw === undefined || raw === null ? '' : raw);
  try {
    s = s.normalize('NFKC');
  } catch (e) {
    /* very old runtimes: keep as is */
  }
  return s.toLowerCase().replace(/[。．｡]/g, '.');
}

/** ASCII letters/digits and CJK only, everything else dropped: the form the blocklist is matched on (no \p{} escapes: older JavaScriptCore) */
function flat(s) {
  return s.replace(/[^0-9a-z㐀-䶿一-鿿〇豈-﫿]/g, '');
}

/**
 * Latin letter-runs with their start/end offsets, plus every run sequence of 2 to 6 consecutive runs separated only by
 * punctuation or spaces, joined ("w x" -> "wx", "s.b" -> "sb"). A digit or CJK character between two runs breaks the
 * sequence. Used for whole-word Latin matching so spacing cannot split a token.
 */
function latinWords(s) {
  const re = /[a-z]+/g;
  const runs = [];
  let m;
  while ((m = re.exec(s))) runs.push({ t: m[0], a: m.index, b: m.index + m[0].length });
  const words = runs.map((r) => r.t);
  for (let i = 0; i < runs.length; i++) {
    let joined = runs[i].t;
    for (let j = i + 1; j < runs.length && j <= i + 5; j++) {
      if (!/^[^a-z0-9㐀-䶿一-鿿〇豈-﫿]+$/.test(s.slice(runs[j - 1].b, runs[j].a))) break;
      joined += runs[j].t;
      words.push(joined);
    }
  }
  return words;
}

/** Blocklist (content/blocklist.v1.js). Returns {category, term} or null. */
function blocklistHit(raw) {
  const s = nfkcLower(raw);
  let f = flat(s);
  for (const e of blocklist.exceptions || []) if (f.includes(e)) f = f.split(e).join(' ');
  for (const cat of Object.keys(blocklist.zh)) {
    for (const term of blocklist.zh[cat]) if (f.includes(term)) return { category: cat, term };
  }
  const runs = latinWords(s);
  const letters = s.replace(/[^a-z]/g, '');
  for (const cat of Object.keys(blocklist.latin.token)) {
    for (const t of blocklist.latin.token[cat]) if (runs.includes(t)) return { category: cat, term: t };
  }
  for (const cat of Object.keys(blocklist.latin.contains)) {
    for (const t of blocklist.latin.contains[cat]) if (letters.includes(t)) return { category: cat, term: t };
  }
  return null;
}

/** First of `terms` contained in the flat form of `raw` (punctuation and spaces between characters do not hide a word), else null. */
function containsAny(raw, terms) {
  const f = flat(nfkcLower(raw));
  for (const t of terms) if (f.includes(t)) return t;
  return null;
}

module.exports = { nfkcLower, flat, latinWords, blocklistHit, containsAny };
