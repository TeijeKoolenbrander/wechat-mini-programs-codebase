'use strict';
/**
 * Stroke -> raster, pure JS (spec 5.4, PO-10, AC 27, V10). The server calls this to make the 512 x 512 image that
 * is moderated (cloudfunctions/common/png.js wraps it into a PNG). It lives in core/ so the same code can serve as the
 * reference renderer in tests and as an offscreen fallback on the client.
 *
 * WHY A HAND-WRITTEN RASTERISER (decision TD-6): cloud functions have no canvas. node-canvas, sharp and skia
 * need native binaries that must be built for the cloud runtime (extra deploy risk, size and cold-start cost) for a
 * picture that is only strokes of three widths and twelve flat colours. A capsule coverage rasteriser is ~120
 * lines, has no dependencies, runs in the same Node/JS as the rest, is deterministic (the same strokes always give
 * the same bytes, so a moderation re-check is the identical image) and can be tested exactly. Cost: anti-aliasing
 * differs a little from a browser canvas, so AC 27 allows 2% of pixels to differ.
 *
 * Geometry comes from strokes.toPolylines (round caps, round joins, widths scaled by size / 1024, white
 * background). Each stroke is a union of capsules: per stroke we keep the MAX coverage per pixel (so overlapping
 * capsules of one stroke do not double-darken the edges), then composite the flat colour over the image.
 */

const strokes = require('./strokes');
const { CONFIG } = require('./config');

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const RGB = strokes.COLORS.map(hexToRgb);

/**
 * @param {{v:1|2, h?:number, s:number[][]}} drawing a VALIDATED wire-format drawing (v1 square, v2 with height h)
 * @param {{size?:number, background?:number[]}} [opts] size default 512
 * @returns {{width:number, height:number, data:Uint8Array}} RGB, 3 bytes per pixel, row-major
 */
function rasterize(drawing, opts) {
  const size = (opts && opts.size) || CONFIG.raster.size;
  const bg = (opts && opts.background) || [255, 255, 255];
  const W = size;
  const H = Math.round((size * strokes.heightOf(drawing)) / CONFIG.strokes.grid);
  const data = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    data[i * 3] = bg[0];
    data[i * 3 + 1] = bg[1];
    data[i * 3 + 2] = bg[2];
  }
  const cov = new Uint8Array(W * H);
  const polys = strokes.toPolylines(drawing, size);

  for (const poly of polys) {
    const R = poly.width / 2;
    const pad = R + 0.5;
    const inner = Math.max(0, R - 0.5);
    const inner2 = inner * inner;
    let minY = H;
    let maxY = -1;
    let minX = W;
    let maxX = -1;
    const pts = poly.pts;
    const nseg = poly.dot ? 1 : pts.length / 2 - 1;
    for (let s = 0; s < nseg; s++) {
      const ax = pts[s * 2];
      const ay = pts[s * 2 + 1];
      const bx = poly.dot ? ax : pts[s * 2 + 2];
      const by = poly.dot ? ay : pts[s * 2 + 3];
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const len = Math.sqrt(len2);
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - pad));
      const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + pad));
      let ux = 1;
      let uy = 0;
      if (len > 1e-9) {
        ux = dx / len;
        uy = dy / len;
      }
      for (let j = y0; j <= y1; j++) {
        const yc = j + 0.5;
        // oriented rectangle  u in [-pad, len + pad], v in [-pad, pad]  intersected with this row
        let xl = -Infinity;
        let xr = Infinity;
        const ry = yc - ay;
        // u = (x - ax) * ux + ry * uy
        if (Math.abs(ux) > 1e-9) {
          const a = (-pad - ry * uy) / ux + ax;
          const b = (len + pad - ry * uy) / ux + ax;
          xl = Math.max(xl, Math.min(a, b));
          xr = Math.min(xr, Math.max(a, b));
        } else {
          const u = ry * uy;
          if (u < -pad || u > len + pad) continue;
        }
        // v = -(x - ax) * uy + ry * ux
        if (Math.abs(uy) > 1e-9) {
          const a = (-pad - ry * ux) / -uy + ax;
          const b = (pad - ry * ux) / -uy + ax;
          xl = Math.max(xl, Math.min(a, b));
          xr = Math.min(xr, Math.max(a, b));
        } else {
          const v = ry * ux;
          if (v < -pad || v > pad) continue;
        }
        if (!(xl <= xr)) continue;
        const i0 = Math.max(0, Math.ceil(xl - 0.5));
        const i1 = Math.min(W - 1, Math.floor(xr - 0.5));
        if (i0 > i1) continue;
        if (j < minY) minY = j;
        if (j > maxY) maxY = j;
        if (i0 < minX) minX = i0;
        if (i1 > maxX) maxX = i1;
        const row = j * W;
        for (let i = i0; i <= i1; i++) {
          const px = i + 0.5 - ax;
          const py = yc - ay;
          let t = len2 > 0 ? (px * dx + py * dy) / len2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = px - t * dx;
          const ey = py - t * dy;
          const e2 = ex * ex + ey * ey;
          let c8;
          if (e2 <= inner2) c8 = 255; // fully inside: no sqrt
          else {
            const c = R + 0.5 - Math.sqrt(e2);
            if (c <= 0) continue;
            c8 = (c * 255 + 0.5) | 0;
          }
          if (c8 > cov[row + i]) cov[row + i] = c8;
        }
      }
    }
    if (maxY < 0) continue;
    const rgb = RGB[poly.c];
    for (let j = minY; j <= maxY; j++) {
      const row = j * W;
      for (let i = minX; i <= maxX; i++) {
        const c8 = cov[row + i];
        if (!c8) continue;
        cov[row + i] = 0;
        const o = (row + i) * 3;
        if (c8 === 255) {
          data[o] = rgb[0];
          data[o + 1] = rgb[1];
          data[o + 2] = rgb[2];
        } else {
          const a = c8 / 255;
          data[o] = (data[o] + (rgb[0] - data[o]) * a + 0.5) | 0;
          data[o + 1] = (data[o + 1] + (rgb[1] - data[o + 1]) * a + 0.5) | 0;
          data[o + 2] = (data[o + 2] + (rgb[2] - data[o + 2]) * a + 0.5) | 0;
        }
      }
    }
  }
  return { width: W, height: H, data };
}

/**
 * Fraction of pixels that differ by more than `tol` in any channel (AC 27 uses 0.02 at 512 x 512).
 * Both images must have the same size.
 */
function diffRatio(a, b, tol) {
  if (a.width !== b.width || a.height !== b.height) throw new Error('size mismatch');
  const t = tol === undefined ? 24 : tol;
  let diff = 0;
  const n = a.width * a.height;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    if (Math.abs(a.data[o] - b.data[o]) > t || Math.abs(a.data[o + 1] - b.data[o + 1]) > t || Math.abs(a.data[o + 2] - b.data[o + 2]) > t) diff++;
  }
  return diff / n;
}

module.exports = { rasterize, diffRatio };
