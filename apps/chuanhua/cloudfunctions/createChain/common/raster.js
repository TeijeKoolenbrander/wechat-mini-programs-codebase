'use strict';
// Server-side rasteriser (spec 5.4): strokes -> 512x512 RGB PNG for moderation. Pure JS + zlib.
// White background, round caps and joins, brush widths scaled x0.5 from the 1024 grid.
// This PNG is what mediaCheckAsync sees; it never leaves the server (PO-10).
const { decodeStroke, validateStrokes } = require('./strokes');
const { encodePng } = require('./png');

const SIZE = 512;
const SCALE = 0.5;
const COLORS = ['1E1B18', 'D8433B', 'F29B30', '3E9B5A', '3C78C8', '7B4FB3',
  'F28DB2', 'F2D13C', '6CC3E0', '8A5A3B', '9A9A9A', '9CCB4A'].map((h) => [
  parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);
const WIDTHS = [8, 18, 36]; // grid units

/** Rasterise validated strokes into an RGB buffer (SIZE*SIZE*3). */
function rasterize(strokes) {
  const rgb = new Uint8Array(SIZE * SIZE * 3).fill(255);
  const cover = new Uint8Array(SIZE * SIZE);
  for (const row of strokes.s) {
    const st = decodeStroke(row);
    const R = (WIDTHS[st.w] * SCALE) / 2;
    const pts = st.pts.map(([x, y]) => [x * SCALE, y * SCALE]);
    let minX = SIZE; let maxX = -1; let minY = SIZE; let maxY = -1;
    const mark = (x, y, a) => {
      const i = y * SIZE + x;
      if (a > cover[i]) cover[i] = a;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    };
    const segs = pts.length === 1 ? [[pts[0], pts[0]]] : pts.slice(1).map((p, i) => [pts[i], p]);
    const reach = R + 1;
    for (const [p, q] of segs) {
      const y0 = Math.max(0, Math.floor(Math.min(p[1], q[1]) - reach));
      const y1 = Math.min(SIZE - 1, Math.ceil(Math.max(p[1], q[1]) + reach));
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const len2 = dx * dx + dy * dy;
      for (let y = y0; y <= y1; y++) {
        // x-extent of the segment part that can reach this row (conservative), expanded by reach
        let xa; let xb;
        const ylo = y - reach; const yhi = y + 1 + reach;
        if (dy === 0) { xa = Math.min(p[0], q[0]); xb = Math.max(p[0], q[0]); } else {
          const t1 = (ylo - p[1]) / dy; const t2 = (yhi - p[1]) / dy;
          const ta = Math.max(0, Math.min(t1, t2)); const tb = Math.min(1, Math.max(t1, t2));
          const xs1 = p[0] + dx * ta; const xs2 = p[0] + dx * tb;
          xa = Math.min(xs1, xs2); xb = Math.max(xs1, xs2);
        }
        const x0 = Math.max(0, Math.floor(xa - reach));
        const x1 = Math.min(SIZE - 1, Math.ceil(xb + reach));
        const cy = y + 0.5;
        for (let x = x0; x <= x1; x++) {
          const cx = x + 0.5;
          let t = len2 === 0 ? 0 : ((cx - p[0]) * dx + (cy - p[1]) * dy) / len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = p[0] + dx * t - cx;
          const ey = p[1] + dy * t - cy;
          const d = Math.sqrt(ex * ex + ey * ey);
          const a = R + 0.5 - d;
          if (a > 0) mark(x, y, a >= 1 ? 255 : Math.round(a * 255));
        }
      }
    }
    if (maxX >= 0) {
      const [cr, cg, cb] = COLORS[st.c];
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const i = y * SIZE + x;
          const a = cover[i];
          if (!a) continue;
          cover[i] = 0;
          const o = i * 3;
          rgb[o] = Math.round((rgb[o] * (255 - a) + cr * a) / 255);
          rgb[o + 1] = Math.round((rgb[o + 1] * (255 - a) + cg * a) / 255);
          rgb[o + 2] = Math.round((rgb[o + 2] * (255 - a) + cb * a) / 255);
        }
      }
    }
  }
  return rgb;
}

/** Validate then render to a PNG buffer. Throws INVALID_STROKES for bad input. */
function renderPng(strokes) {
  const v = validateStrokes(strokes);
  return encodePng(SIZE, SIZE, rasterize(v));
}

module.exports = { SIZE, COLORS, WIDTHS, rasterize, renderPng };
