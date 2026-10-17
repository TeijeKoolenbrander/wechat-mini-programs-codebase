/**
 * Drawing helper used by draw / describe / round wait / sent / overview / step-through / mine (CONTRACT.md "strokes").
 * Pure: no wx, no timers. Strokes v2 (spec 5.1, 5.3, 5.7).
 *
 * LOGICAL GRID: 1024 wide, `h` high (768-2048; a v1 drawing has h = 1024). A drawing is shown CONTAIN-FITTED and CENTRED in
 * any rect: scale = min(rect.w / 1024, rect.h / h). It is never cropped or stretched. The white paper is 1024*scale by
 * h*scale; the unused part of the rect is filled with the margin tone (theme `margin`, #EFEAE0 / #DDDDDD in high
 * contrast), so the edge of the drawing is visible.
 *
 * CANONICAL GEOMETRY (spec 5.4, AC 27, TD-18): every stroke is a polyline through ((p + 0.5) * scale), drawn with round
 * caps and round joins, lineWidth = SIZES[w] * scale, colour COLORS[c]; a one-point stroke is a filled circle of diameter
 * `width`. No smoothing and no extra effects, so the picture the next player sees is the picture the server rasterised
 * and moderated. Only the stroke still under the finger may be smoothed (opts.live). The same scale applies to both
 * axes. This module holds its own copy of the palette, brush widths and the decoder, so it does not depend on the
 * core codec's version; tests/render.strokes.test.js keeps it equal to core/strokes.js.
 *
 *   drawStrokes(ctx, strokes, rect, opts?) -> { x, y, w, h, scale, h: gridH }   (the paper rect in ctx pixels)
 *     strokes : wire Strokes {v:2,h,s} | {v:1,s} | absolute strokes [{c, w, p}] (recorder.strokes; needs opts.gridH)
 *     rect    : {x, y, w, h}
 *     opts    : { gridH?: number (absolute form, or to override), playT?: 0..1 (replay fraction), margin?: false (do not
 *                 paint the margin tone), frame?: true, frameColor?, frameWidth?, cacheKey?: string (+ opts.dpr, opts.rev)
 *                 offscreen cache of the finished strokes, live?: true (smooth the last stroke for display) }
 *
 * Cache (60 fps on mid-range Android, AC 32): with an offscreen canvas factory (setCanvasFactory) the finished strokes are
 * drawn once into a canvas of the paper's size, keyed by cacheKey; per frame only the live stroke is drawn on top. For
 * absolute strokes the cache grows incrementally and is rebuilt on undo/clear. For wire Strokes the whole drawing is cached
 * and rebuilt when `opts.rev` changes (or the paper size changes).
 */

const T = require('./theme');

const GRID_W = 1024;
const H_MIN = 768;
const H_MAX = 2048;
/** 12 stroke colours: 0-5 base (墨 朱 橙 绿 蓝 紫), 6-11 今日彩笔 (spec 5.2). Content: never remapped by display modes. */
const COLORS = ['#1E1B18', '#D8433B', '#F29B30', '#3E9B5A', '#3C78C8', '#7B4FB3', '#F28DB2', '#F2D13C', '#6CC3E0', '#8A5A3B', '#9A9A9A', '#9CCB4A'];
const BASE_COLORS = 6;
/** brush widths in grid units: 细 中 粗 */
const SIZES = [8, 18, 36];
const REPLAY_MS = 2500;

let factory = null;
const cache = new Map(); // key -> {canvas, ctx, pw, ph, dpr, n, last, lastLen, rev, painted}
const CACHE_MAX = 12;

/** factory(w, h) -> offscreen canvas (wx.createCanvas() with width/height set). null = draw directly. */
function setCanvasFactory(f) {
  factory = f;
  cache.clear();
}

function clearCache() {
  cache.clear();
}

// ---------------------------------------------------------------- decoding

/** logical height of a drawing: wire v2 -> its h, v1 / absolute -> opts.gridH or 1024 */
function gridHOf(strokes, opts) {
  if (opts && opts.gridH > 0) return opts.gridH;
  if (strokes && !Array.isArray(strokes) && strokes.v === 2 && strokes.h > 0) return strokes.h;
  return GRID_W;
}

/** wire format -> absolute strokes [{c, w, p}] (first point absolute, then integer deltas) */
function toAbsolute(d) {
  const out = [];
  const s = (d && d.s) || [];
  for (let k = 0; k < s.length; k++) {
    const st = s[k];
    if (!st || st.length < 4) continue;
    const p = [st[2], st[3]];
    let x = st[2];
    let y = st[3];
    for (let i = 4; i + 1 < st.length; i += 2) {
      x += st[i];
      y += st[i + 1];
      p.push(x, y);
    }
    out.push({ c: st[0], w: st[1], p });
  }
  return out;
}

function isAbsolute(s) {
  return Array.isArray(s) && (s.length === 0 || (s[0] && 'p' in s[0]));
}

function absOf(strokes) {
  if (!strokes) return [];
  if (Array.isArray(strokes)) return isAbsolute(strokes) ? strokes : [];
  return strokes.s ? toAbsolute(strokes) : [];
}

/** contain-fit of a 1024 x h drawing into w x h_rect: {scale, pw, ph, ox, oy} (offsets inside the rect) */
function fit(rectW, rectH, gridH) {
  const h = gridH || GRID_W;
  const scale = Math.min(rectW / GRID_W, rectH / h);
  const pw = GRID_W * scale;
  const ph = h * scale;
  // a leftover under 1 px is rounding (the canvas h is round(1024 * canvasH / canvasW)): keep the paper on the rect's corner so it lines up with the server raster
  const ox = (rectW - pw) / 2;
  const oy = (rectH - ph) / 2;
  return { scale, pw, ph, ox: ox < 1 ? 0 : ox, oy: oy < 1 ? 0 : oy, gridH: h };
}

/** canonical polylines for a scale (px per grid unit) */
function absToPolylines(abs, scale) {
  const out = new Array(abs.length);
  for (let k = 0; k < abs.length; k++) {
    const st = abs[k];
    const pts = new Array(st.p.length);
    for (let i = 0; i < st.p.length; i++) pts[i] = (st.p[i] + 0.5) * scale;
    out[k] = { c: st.c, color: COLORS[st.c] || COLORS[0], width: (SIZES[st.w] || SIZES[1]) * scale, dot: st.p.length <= 2, pts };
  }
  return out;
}

function polyLength(pts) {
  let len = 0;
  for (let i = 2; i < pts.length; i += 2) len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return len;
}

/**
 * Reveal replay (spec 8.9, AC 31): the first `frac` (0..1) of the drawing in drawing order, by path length with a minimum
 * weight per stroke so dots and short strokes still take time. frac = min(1, elapsedMs / REPLAY_MS) whatever the size,
 * which makes every drawing replay in 2.5 s. The last polyline may be cut part-way.
 */
function replayPolylines(polys, frac) {
  if (frac >= 1) return polys;
  if (!(frac > 0)) return [];
  const weights = polys.map((p) => Math.max(polyLength(p.pts), p.width * 3));
  const total = weights.reduce((a, b) => a + b, 0);
  let budget = frac * total;
  const out = [];
  for (let i = 0; i < polys.length && budget > 0; i++) {
    const p = polys[i];
    if (budget >= weights[i]) {
      out.push(p);
      budget -= weights[i];
      continue;
    }
    const want = polyLength(p.pts) * (budget / weights[i]);
    const pts = [p.pts[0], p.pts[1]];
    let acc = 0;
    for (let k = 2; k < p.pts.length; k += 2) {
      const seg = Math.hypot(p.pts[k] - p.pts[k - 2], p.pts[k + 1] - p.pts[k - 1]);
      if (acc + seg >= want) {
        const t = seg === 0 ? 0 : (want - acc) / seg;
        pts.push(p.pts[k - 2] + (p.pts[k] - p.pts[k - 2]) * t, p.pts[k - 1] + (p.pts[k + 1] - p.pts[k - 1]) * t);
        break;
      }
      pts.push(p.pts[k], p.pts[k + 1]);
      acc += seg;
    }
    out.push({ c: p.c, color: p.color, width: p.width, dot: pts.length <= 2, pts });
    budget = 0;
  }
  return out;
}

// ---------------------------------------------------------------- drawing

function dotLike(p) {
  if (p.dot || p.pts.length <= 2) return true;
  const x = p.pts[0];
  const y = p.pts[1];
  for (let i = 2; i < p.pts.length; i += 2) if (p.pts[i] !== x || p.pts[i + 1] !== y) return false;
  return true;
}

/** Draw ready polylines at the current origin. Canonical: round caps and joins, no smoothing. */
function drawPolylines(ctx, polys) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let k = 0; k < polys.length; k++) {
    const p = polys[k];
    const pts = p.pts;
    if (!pts.length) continue;
    if (dotLike(p)) {
      ctx.beginPath();
      ctx.arc(pts[0], pts[1], p.width / 2, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = p.width;
    ctx.stroke();
  }
}

/** Display-only smoothing for the stroke under the finger (quadratic through midpoints). */
function drawLivePolyline(ctx, p) {
  const pts = p.pts;
  if (dotLike(p) || pts.length < 6) return drawPolylines(ctx, [p]);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length - 2; i += 2) {
    const mx = (pts[i] + pts[i + 2]) / 2;
    const my = (pts[i + 1] + pts[i + 3]) / 2;
    ctx.quadraticCurveTo(pts[i], pts[i + 1], mx, my);
  }
  ctx.lineTo(pts[pts.length - 2], pts[pts.length - 1]);
  ctx.strokeStyle = p.color;
  ctx.lineWidth = p.width;
  ctx.stroke();
}

function getCache(key, pw, ph, dpr) {
  let e = cache.get(key);
  if (e && (Math.abs(e.pw - pw) > 0.01 || Math.abs(e.ph - ph) > 0.01 || e.dpr !== dpr)) e = null;
  if (!e) {
    // the bitmap is whole device pixels (rounded up) and is drawn back 1:1, so the cached picture is not resampled
    const cw = Math.max(1, Math.ceil(pw * dpr));
    const chh = Math.max(1, Math.ceil(ph * dpr));
    const cv = factory(cw, chh);
    const cx = cv.getContext('2d');
    if (cx.scale) cx.scale(dpr, dpr);
    e = { canvas: cv, ctx: cx, pw, ph, dpr, cw: cw / dpr, ch: chh / dpr, n: 0, last: null, lastLen: 0, rev: null, painted: false };
    cache.delete(key);
    cache.set(key, e);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  }
  return e;
}

function resetCache(e) {
  e.ctx.clearRect(0, 0, e.cw, e.ch);
  e.ctx.fillStyle = '#FFFFFF';
  e.ctx.fillRect(0, 0, e.cw, e.ch);
  e.n = 0;
  e.last = null;
  e.lastLen = 0;
  e.painted = true;
}

function drawStrokes(ctx, strokes, rect, opts) {
  const o = opts || {};
  const gh = gridHOf(strokes, o);
  const f = fit(rect.w, rect.h, gh);
  const px = rect.x + f.ox;
  const py = rect.y + f.oy;
  // margin tone around the paper, only where the paper does not fill the rect
  if (o.margin !== false && (f.ox > 0.5 || f.oy > 0.5)) {
    ctx.fillStyle = T.COLORS.margin;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
  ctx.save();
  ctx.translate(px, py);
  ctx.beginPath();
  ctx.rect(0, 0, f.pw, f.ph);
  ctx.clip();
  const replaying = typeof o.playT === 'number' && o.playT < 1;
  const useCache = !!(factory && o.cacheKey && !replaying);
  const abs = absOf(strokes);

  if (useCache && isAbsolute(strokes)) {
    // incremental cache: everything but the last stroke is finished
    const dpr = o.dpr || 1;
    const e = getCache(o.cacheKey, f.pw, f.ph, dpr);
    const len = abs.length;
    const finished = Math.max(0, len - 1); // the last stroke may still be growing: never cached
    const prefixOk = e.n === 0 || (e.n <= finished && abs[e.n - 1] === e.last && abs[e.n - 1].p.length === e.lastLen);
    if (!e.painted || !prefixOk) resetCache(e);
    if (finished > e.n) {
      drawPolylines(e.ctx, absToPolylines(abs.slice(e.n, finished), f.scale));
      e.n = finished;
      e.last = abs[finished - 1];
      e.lastLen = e.last.p.length;
    }
    ctx.drawImage(e.canvas, 0, 0, e.cw, e.ch);
    if (len > finished) {
      const last = absToPolylines([abs[len - 1]], f.scale);
      if (o.live) drawLivePolyline(ctx, last[0]);
      else drawPolylines(ctx, last);
    }
  } else if (useCache) {
    const dpr = o.dpr || 1;
    const e = getCache(o.cacheKey, f.pw, f.ph, dpr);
    const rev = o.rev == null ? abs.length : o.rev;
    if (e.rev !== rev || !e.painted) {
      resetCache(e);
      drawPolylines(e.ctx, absToPolylines(abs, f.scale));
      e.rev = rev;
    }
    ctx.drawImage(e.canvas, 0, 0, e.cw, e.ch);
  } else {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, f.pw, f.ph);
    let polys = absToPolylines(abs, f.scale);
    if (replaying) polys = replayPolylines(polys, o.playT);
    if (o.live && polys.length && !replaying) {
      drawPolylines(ctx, polys.slice(0, -1));
      drawLivePolyline(ctx, polys[polys.length - 1]);
    } else drawPolylines(ctx, polys);
  }
  ctx.restore();
  if (o.frame) {
    ctx.strokeStyle = o.frameColor || (T.isHC() ? '#000000' : 'rgba(30,27,24,0.75)');
    ctx.lineWidth = o.frameWidth || (T.isHC() ? 2.5 : 1.5);
    ctx.strokeRect(px, py, f.pw, f.ph);
  }
  return { x: px, y: py, w: f.pw, h: f.ph, scale: f.scale, gridH: gh };
}

/**
 * The canvas rect and logical height for a free area (spec 5.1, AC 124): h = round(1024 * freeH / freeW) clamped to
 * 768-2048; outside the clamp the rect is reduced to the clamped aspect and centred. Pure arithmetic.
 * @param {{x:number,y:number,w:number,h:number}} free
 * @returns {{x:number,y:number,w:number,h:number,gridH:number}}
 */
function canvasFor(free) {
  const raw = Math.round((GRID_W * free.h) / free.w);
  const gridH = Math.max(H_MIN, Math.min(H_MAX, raw));
  if (raw >= H_MIN && raw <= H_MAX) return { x: free.x, y: free.y, w: free.w, h: free.h, gridH };
  if (raw < H_MIN) {
    // too wide: reduce the width to the aspect 768 / 1024
    const w = Math.round((free.h * GRID_W) / H_MIN);
    return { x: free.x + (free.w - w) / 2, y: free.y, w, h: free.h, gridH };
  }
  // too tall: reduce the height to the aspect 2048 / 1024
  const h = Math.round((free.w * H_MAX) / GRID_W);
  return { x: free.x, y: free.y + (free.h - h) / 2, w: free.w, h, gridH };
}

module.exports = {
  GRID_W, H_MIN, H_MAX, COLORS, BASE_COLORS, SIZES, REPLAY_MS,
  drawStrokes, drawPolylines, drawLivePolyline, setCanvasFactory, clearCache,
  toAbsolute, absToPolylines, replayPolylines, gridHOf, fit, canvasFor,
};
