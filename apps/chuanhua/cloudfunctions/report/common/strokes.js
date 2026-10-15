'use strict';
// Server-side stroke validation (spec 5.3, AC 25). Never trust the client: this is the authority.
// Format: { v:1, s:[ [c, w, x0, y0, dx1, dy1, ...], ... ] }  (first point absolute, then integer deltas)
const { fail, isInt, isPlainObject } = require('./util');

const LIMITS = {
  maxStrokes: 200,
  maxPoints: 4000,
  maxPointsPerStroke: 600,
  grid: 1024,
  colors: 12,
  sizes: 3,
  maxJsonBytes: 32 * 1024,
};

/** Decode a stroke row to absolute points [[x,y],...]; returns null when malformed. */
function decodeStroke(row) {
  if (!Array.isArray(row) || row.length < 4 || (row.length - 2) % 2 !== 0) return null;
  const pts = [];
  let x = row[2];
  let y = row[3];
  pts.push([x, y]);
  for (let i = 4; i < row.length; i += 2) {
    x += row[i];
    y += row[i + 1];
    pts.push([x, y]);
  }
  return { c: row[0], w: row[1], pts };
}

/**
 * Validate and return a normalised copy ({v:1, s}) or throw INVALID_STROKES.
 * Only whitelisted shape is copied; extra keys are dropped.
 */
function validateStrokes(input) {
  const bad = (why) => fail('INVALID_STROKES', `invalid strokes: ${why}`);
  if (!isPlainObject(input) || input.v !== 1 || !Array.isArray(input.s)) bad('shape');
  const s = input.s;
  if (s.length < 1) bad('empty');
  if (s.length > LIMITS.maxStrokes) bad('too many strokes');
  let total = 0;
  const out = [];
  for (const row of s) {
    if (!Array.isArray(row) || row.length < 4 || (row.length - 2) % 2 !== 0) bad('stroke shape');
    for (const n of row) if (!Number.isInteger(n)) bad('non-integer');
    if (!isInt(row[0], 0, LIMITS.colors - 1)) bad('colour');
    if (!isInt(row[1], 0, LIMITS.sizes - 1)) bad('size');
    const points = (row.length - 2) / 2;
    if (points > LIMITS.maxPointsPerStroke) bad('too many points in a stroke');
    total += points;
    if (total > LIMITS.maxPoints) bad('too many points');
    let x = row[2];
    let y = row[3];
    if (!isInt(x, 0, LIMITS.grid - 1) || !isInt(y, 0, LIMITS.grid - 1)) bad('coordinate');
    for (let i = 4; i < row.length; i += 2) {
      x += row[i];
      y += row[i + 1];
      if (x < 0 || x > LIMITS.grid - 1 || y < 0 || y > LIMITS.grid - 1) bad('coordinate');
    }
    out.push(row.slice());
  }
  const norm = { v: 1, s: out };
  if (Buffer.byteLength(JSON.stringify(norm), 'utf8') > LIMITS.maxJsonBytes) bad('too large');
  return norm;
}

function countPoints(strokes) {
  return strokes.s.reduce((a, r) => a + (r.length - 2) / 2, 0);
}

module.exports = { LIMITS, decodeStroke, validateStrokes, countPoints };
