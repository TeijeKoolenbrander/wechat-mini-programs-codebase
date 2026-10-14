/**
 * Seeded randomness (spec 5.1). Pure JS, no wx, no DOM: this file is copied
 * into the cloud functions, so client and server draw identical streams.
 *
 *   sub(seed, name) = mulberry32(hash32(seed + ":" + name))
 */

/** mulberry32: same seed, same sequence, forever. Returns () => float in [0,1). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over UTF-16 code units, then a murmur3 finaliser. Returns uint32. */
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

/** A named sub-stream of a run seed. */
function sub(seed, name) {
  return mulberry32(hash32(seed + ':' + name));
}

/** Integer in [0, maxExclusive). */
function int(rng, maxExclusive) {
  return Math.floor(rng() * maxExclusive);
}

/** A uniformly random element of `arr`. */
function pick(rng, arr) {
  return arr[int(rng, arr.length)];
}

/** Fisher-Yates, in place. Returns the same array. */
function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = int(rng, i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/** A fresh random uint32 from Math.random (client-side free-play seeds only). */
function randomSeed() {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

module.exports = { mulberry32, hash32, sub, int, pick, shuffle, randomSeed };
