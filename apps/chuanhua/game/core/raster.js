/**
 * Deterministic stroke -> raster renderer (spec 5.4, PO-10). Pure JS, no native deps, no Node built-ins,
 * so the backend can run it in a cloud function to produce the 512 x 512 moderation PNG (see png.js)
 * and tests can pin its output.
 *
 *   rasterize(drawing, { size = 512 }) -> { width, height, data: Uint8Array(width*height*3) }   (RGB, row-major)
 *   hashRaster(raster) -> uint32   (FNV-1a over the bytes; golden-image tests)
 *   coverageStats(raster) -> { ink, total }
 *
 * Geometry: grid 1024 -> pixels by size/1024; widths scale the same way (512 px => x0.5);
 * round caps and joins (every stroke is the union of capsules around its segments; a one-point
 * stroke is a disc); white background; strokes composite in order.
 * Anti-aliasing: per stroke a coverage mask with cov = clamp(r + 0.5 - distance(pixelCentre, polyline), 0, 1),
 * quantised to 0..255, so overlapping segments of one stroke never double-blend.
 * Determinism: only + - * / and Math.sqrt (correctly rounded in IEEE-754), integer compositing,
 * so output is bit-identical on every JS engine. Cost is about O(sum of segment bounding boxes):
 * 4,000 points at 512 px take tens of milliseconds in Node.
 */

const { CONFIG } = require('./config');
const { validate, strokePoints } = require('./strokes');

function hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

const PALETTE_RGB = CONFIG.palette.map(hexRgb);

function rasterize(drawing, opts) {
  const size = (opts && opts.size) || CONFIG.raster.size;
  const v = validate(drawing);
  if (!v.ok) throw new Error('rasterize: ' + v.reason);
  const bg = CONFIG.raster.background;
  const data = new Uint8Array(size * size * 3);
  for (let i = 0; i < data.length; i += 3) {
    data[i] = bg[0];
    data[i + 1] = bg[1];
    data[i + 2] = bg[2];
  }
  const k = size / CONFIG.strokes.grid;
  const cov = new Uint8Array(size * size);

  for (const st of drawing.s) {
    const rgb = PALETTE_RGB[st[0]];
    const r = (CONFIG.brushSizes[st[1]] * k) / 2;
    const pts = strokePoints(st).map((p) => [p[0] * k, p[1] * k]);
    // stroke bounding box
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    }
    const bx0 = Math.max(0, Math.floor(minX - r - 1));
    const by0 = Math.max(0, Math.floor(minY - r - 1));
    const bx1 = Math.min(size - 1, Math.ceil(maxX + r + 1));
    const by1 = Math.min(size - 1, Math.ceil(maxY + r + 1));
    for (let y = by0; y <= by1; y++) cov.fill(0, y * size + bx0, y * size + bx1 + 1);

    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1] || a;
      const sx0 = Math.max(bx0, Math.floor(Math.min(a[0], b[0]) - r - 1));
      const sy0 = Math.max(by0, Math.floor(Math.min(a[1], b[1]) - r - 1));
      const sx1 = Math.min(bx1, Math.ceil(Math.max(a[0], b[0]) + r + 1));
      const sy1 = Math.min(by1, Math.ceil(Math.max(a[1], b[1]) + r + 1));
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len2 = dx * dx + dy * dy;
      for (let y = sy0; y <= sy1; y++) {
        const py = y + 0.5;
        for (let x = sx0; x <= sx1; x++) {
          const px = x + 0.5;
          let t = len2 === 0 ? 0 : ((px - a[0]) * dx + (py - a[1]) * dy) / len2;
          if (t < 0) t = 0;
          else if (t > 1) t = 1;
          const ex = px - (a[0] + dx * t);
          const ey = py - (a[1] + dy * t);
          const c = r + 0.5 - Math.sqrt(ex * ex + ey * ey);
          if (c <= 0) continue;
          const q = c >= 1 ? 255 : Math.round(c * 255);
          const idx = y * size + x;
          if (q > cov[idx]) cov[idx] = q;
        }
      }
    }
    for (let y = by0; y <= by1; y++) {
      for (let x = bx0; x <= bx1; x++) {
        const a = cov[y * size + x];
        if (a === 0) continue;
        const o = (y * size + x) * 3;
        data[o] = ((data[o] * (255 - a) + rgb[0] * a + 127) / 255) | 0;
        data[o + 1] = ((data[o + 1] * (255 - a) + rgb[1] * a + 127) / 255) | 0;
        data[o + 2] = ((data[o + 2] * (255 - a) + rgb[2] * a + 127) / 255) | 0;
      }
    }
  }
  return { width: size, height: size, data };
}

function hashRaster(r) {
  let h = 0x811c9dc5;
  const d = r.data;
  for (let i = 0; i < d.length; i++) {
    h ^= d[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Pixels that are not background. */
function coverageStats(r) {
  const bg = CONFIG.raster.background;
  let ink = 0;
  for (let i = 0; i < r.data.length; i += 3) if (r.data[i] !== bg[0] || r.data[i + 1] !== bg[1] || r.data[i + 2] !== bg[2]) ink++;
  return { ink, total: r.width * r.height };
}

module.exports = { rasterize, hashRaster, coverageStats };
