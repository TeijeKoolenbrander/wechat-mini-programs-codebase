/**
 * Stroke data format, validation and compact encoding (spec 5.3, PO-10/PO-11).
 * Pure CommonJS; shared by the client, the mock server and the cloud functions.
 *
 *   drawing = { v: 1, s: [ [c, w, x0, y0, dx1, dy1, dx2, dy2, ...], ... ] }
 *     c = colour index 0-11, w = size index 0-2, (x0,y0) absolute on the 1024 grid,
 *     then integer deltas. A stroke with only (x0,y0) is a dot.
 *
 * Compact string encoding (`encode`/`decode`): URL-safe, 6 bits per char. Integers are
 * little-endian varints with 5 data bits per char and bit 5 (value 32) as "more follows";
 * signed values are zigzagged. Layout: version, strokeCount, then per stroke
 * [c*3+w, pointCount, x0, y0, (dx, dy) * (pointCount - 1)].
 */

const { CONFIG } = require('./config');

const L = CONFIG.strokes;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const REV = {};
for (let i = 0; i < ALPHABET.length; i++) REV[ALPHABET[i]] = i;

function emptyDrawing() {
  return { v: L.version, s: [] };
}

function strokePointCount(stroke) {
  return stroke.length >= 4 ? (stroke.length - 4) / 2 + 1 : 0;
}

function pointCount(drawing) {
  let n = 0;
  const s = (drawing && drawing.s) || [];
  for (let i = 0; i < s.length; i++) n += strokePointCount(s[i]);
  return n;
}

/** Build a stroke array from absolute points [[x,y],...] (ints). */
function makeStroke(c, w, points) {
  const out = [c, w, points[0][0], points[0][1]];
  for (let i = 1; i < points.length; i++) out.push(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return out;
}

/** Absolute points [[x,y],...] of a stroke array. */
function strokePoints(stroke) {
  const pts = [[stroke[2], stroke[3]]];
  let x = stroke[2];
  let y = stroke[3];
  for (let i = 4; i + 1 < stroke.length; i += 2) {
    x += stroke[i];
    y += stroke[i + 1];
    pts.push([x, y]);
  }
  return pts;
}

function isInt(n) {
  return typeof n === 'number' && Number.isInteger(n);
}

/**
 * Validate against all server limits. Returns { ok: true, points, strokes } or
 * { ok: false, code: 'INVALID_STROKES', reason }.
 * reasons: shape version stroke_count point_count stroke_short stroke_odd stroke_points colour size int range bytes
 */
function validate(drawing) {
  const bad = (reason) => ({ ok: false, code: 'INVALID_STROKES', reason });
  if (!drawing || typeof drawing !== 'object' || Array.isArray(drawing)) return bad('shape');
  if (drawing.v !== L.version) return bad('version');
  const s = drawing.s;
  if (!Array.isArray(s)) return bad('shape');
  if (s.length > L.maxStrokes) return bad('stroke_count');
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const st = s[i];
    if (!Array.isArray(st)) return bad('shape');
    if (st.length < 4) return bad('stroke_short');
    if (st.length % 2 !== 0) return bad('stroke_odd');
    for (let k = 0; k < st.length; k++) if (!isInt(st[k])) return bad('int');
    if (st[0] < 0 || st[0] >= L.colorCount) return bad('colour');
    if (st[1] < 0 || st[1] >= L.sizeCount) return bad('size');
    const n = strokePointCount(st);
    if (n > L.maxPointsPerStroke) return bad('stroke_points');
    total += n;
    if (total > L.maxPoints) return bad('point_count');
    let x = st[2];
    let y = st[3];
    if (x < 0 || x >= L.grid || y < 0 || y >= L.grid) return bad('range');
    for (let k = 4; k + 1 < st.length; k += 2) {
      x += st[k];
      y += st[k + 1];
      if (x < 0 || x >= L.grid || y < 0 || y >= L.grid) return bad('range');
    }
  }
  if (jsonBytes(drawing) > L.maxJsonBytes) return bad('bytes');
  return { ok: true, points: total, strokes: s.length };
}

/** UTF-8 size of the serialized JSON (strokes are pure ASCII, so length). */
function jsonBytes(drawing) {
  return JSON.stringify(drawing).length;
}

// ---------------------------------------------------------------- compact encoding

function putVar(out, n) {
  while (n >= 32) {
    out.push(ALPHABET[(n & 31) | 32]);
    n = Math.floor(n / 32);
  }
  out.push(ALPHABET[n]);
}

function zig(n) {
  return n >= 0 ? n * 2 : -n * 2 - 1;
}

function unzig(n) {
  return n % 2 === 0 ? n / 2 : -(n + 1) / 2;
}

/** Encode a (valid) drawing to a compact string. Throws on a malformed drawing. */
function encode(drawing) {
  const v = validate(drawing);
  if (!v.ok) throw new Error('encode: ' + v.reason);
  const out = [];
  putVar(out, drawing.v);
  putVar(out, drawing.s.length);
  for (const st of drawing.s) {
    putVar(out, st[0] * L.sizeCount + st[1]);
    putVar(out, strokePointCount(st));
    putVar(out, st[2]);
    putVar(out, st[3]);
    for (let k = 4; k < st.length; k++) putVar(out, zig(st[k]));
  }
  return out.join('');
}

/** Decode a compact string. Returns the drawing, or null if malformed/over the limits. */
function decode(str) {
  if (typeof str !== 'string' || str.length === 0 || str.length > 200000) return null;
  let pos = 0;
  let failed = false;
  function getVar() {
    let n = 0;
    let mul = 1;
    for (let i = 0; i < 8; i++) {
      if (pos >= str.length) {
        failed = true;
        return 0;
      }
      const d = REV[str[pos++]];
      if (d === undefined) {
        failed = true;
        return 0;
      }
      n += (d & 31) * mul;
      if ((d & 32) === 0) return n;
      mul *= 32;
    }
    failed = true;
    return 0;
  }
  const version = getVar();
  const count = getVar();
  if (failed || version !== L.version || count > L.maxStrokes) return null;
  const s = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    const cw = getVar();
    const n = getVar();
    if (failed || n < 1 || n > L.maxPointsPerStroke) return null;
    total += n;
    if (total > L.maxPoints) return null;
    const st = [Math.floor(cw / L.sizeCount), cw % L.sizeCount, getVar(), getVar()];
    for (let k = 1; k < n; k++) st.push(unzig(getVar()), unzig(getVar()));
    if (failed) return null;
    s.push(st);
  }
  if (pos !== str.length) return null;
  const d = { v: version, s };
  return validate(d).ok ? d : null;
}

/** Deep equality of two drawings. */
function equal(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

module.exports = { emptyDrawing, pointCount, strokePointCount, makeStroke, strokePoints, validate, jsonBytes, encode, decode, equal, ALPHABET };
