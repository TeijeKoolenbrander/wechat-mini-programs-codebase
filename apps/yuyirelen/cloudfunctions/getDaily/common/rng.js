'use strict';
// Seeded randomness, copied from apps/dianjiangtai/game/core/rng.js (never imported across apps).
// sub(seed, name) = mulberry32(hash32(seed + ":" + name)). Used only for warm-up words (spec 4.2).

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash32(str) {
  const s = String(str);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
function sub(seed, name) {
  return mulberry32(hash32(seed + ':' + name));
}

/** n distinct elements of arr, deterministic for (key, name). Never looks at any answer. */
function drawDistinct(arr, n, key, name) {
  const rng = sub(key, name);
  const pool = arr.slice();
  const out = [];
  while (out.length < n && pool.length) {
    const i = Math.floor(rng() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

module.exports = { mulberry32, hash32, sub, drawDistinct };
