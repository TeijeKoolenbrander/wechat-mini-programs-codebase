'use strict';
/**
 * Stroke data (spec 5, PO-10/11/39, AC 21-27, 30, 31, 122-126). Shared by the drawing tool, the renderers, the mock server and
 * the cloud functions. Pure JS, no wx.
 *
 * WIRE FORMAT v2 (what clients upload and servers store; `Strokes` in spec 12):
 *   { v: 2, h: 1363, s: [ [c, w, x0, y0, dx1, dy1, dx2, dy2, ...], ... ] }
 *   c = colour index 0-11, w = size index 0-2, (x0, y0) absolute grid point, then integer deltas. The logical grid is always
 *   1024 wide and `h` high (768-2048): h = round(1024 * canvasH / canvasW), clamped (F-3, PO-39).
 *   v1 compatibility: { v: 1, s } (no h) decodes as h = 1024 (square). Stored v1 drawings stay valid and a v1 upload is still
 *   accepted. The delta form is the "compression": typical drawings are 4-15 KB of JSON.
 *
 * ABSOLUTE FORM (in memory, easier to draw): [{ c, w, p: [x0, y0, x1, y1, ...] }]. fromAbsolute/toAbsolute convert
 * exactly (AC 24 round trip, including h).
 *
 * CANONICAL GEOMETRY: toPolylines()/absToPolylines() is the one description of what a drawing looks like. The client
 * renderer (render/strokes.js), the server rasteriser (core/raster.js) and the reveal replay all consume it, so the
 * moderated PNG and the on-screen drawing agree (AC 27, 30). The output space is `size` px wide and size * h / 1024 high (the
 * same scale on both axes). Every consumer must draw each polyline with round caps and round joins and `width` px; a
 * one-point stroke is a filled circle. No smoothing for stored content (smoothing is allowed only on the stroke still being
 * drawn).
 *
 * LAYOUT HELPERS (pure, so renderer and tests share them): gridHeight, canvasFit (the canvas rect inside the free space,
 * clamped to the 0.75-2.0 aspect and centred, 5.1) and containFit (a drawing in any rect, 5.7).
 */

const { CONFIG } = require('./config');

const L = CONFIG.strokes;

/** 12 colours: 0-5 base (墨 朱 橙 绿 蓝 紫), 6-11 今日彩笔 (粉 黄 天青 棕 灰 草), spec 5.2 */
const COLORS = ['#1E1B18', '#D8433B', '#F29B30', '#3E9B5A', '#3C78C8', '#7B4FB3', '#F28DB2', '#F2D13C', '#6CC3E0', '#8A5A3B', '#9A9A9A', '#9CCB4A'];
const COLOR_NAMES = ['墨', '朱', '橙', '绿', '蓝', '紫', '粉', '黄', '天青', '棕', '灰', '草'];
const BASE_COLORS = 6;
/** brush widths in grid units: 细 中 粗 */
const SIZES = [8, 18, 36];
const REPLAY_MS = 2500;

/** total polyline length of a wire-format drawing in grid units, straight from the deltas (no allocation) */
function pathLength(d) {
  let sum = 0;
  for (const st of d.s) for (let i = 4; i < st.length; i += 2) sum += Math.sqrt(st[i] * st[i] + st[i + 1] * st[i + 1]);
  return sum;
}

/** length of one absolute stroke {p:[x,y,...]} */
function absLength(st) {
  let sum = 0;
  for (let i = 2; i < st.p.length; i += 2) sum += Math.hypot(st.p[i] - st.p[i - 2], st.p[i + 1] - st.p[i - 1]);
  return sum;
}

function isInt(n) {
  return typeof n === 'number' && Number.isInteger(n);
}

/** the logical height of a drawing: `h` for v2, 1024 for v1 */
function heightOf(d) {
  return d && d.v === 2 && isInt(d.h) ? d.h : L.grid;
}

/** an empty v2 drawing of height `h` (default square) */
function empty(h) {
  return { v: L.version, h: h === undefined ? L.grid : h, s: [] };
}

/** h = round(1024 * canvasH / canvasW) clamped to 768-2048 (5.1, AC 124) */
function gridHeight(canvasW, canvasH) {
  if (!(canvasW > 0) || !(canvasH > 0)) return L.grid;
  return Math.min(L.maxH, Math.max(L.minH, Math.round((L.grid * canvasH) / canvasW)));
}

/**
 * The canvas rect inside the free rect {x, y, w, h} (5.1, AC 124): the full free rect when its aspect (h / w) is inside 0.75-2.0,
 * else reduced to the clamped aspect and centred. Returns {x, y, w, h, gridH}; the rect and gridH are fixed for the turn.
 */
function canvasFit(free) {
  const lo = L.minH / L.grid;
  const hi = L.maxH / L.grid;
  let { x, y, w, h } = free;
  if (h / w < lo) {
    const nw = h / lo;
    x += (w - nw) / 2;
    w = nw;
  } else if (h / w > hi) {
    const nh = w * hi;
    y += (h - nh) / 2;
    h = nh;
  }
  return { x, y, w, h, gridH: gridHeight(w, h) };
}

/**
 * A drawing of logical height `gridH` shown contain-fitted and centred in a rect (5.7, AC 125): never cropped or stretched.
 * Returns {scale, x, y, w, h} = the drawing's paper rect; the rest of the rect is the margin tone.
 */
function containFit(rect, gridH) {
  const hh = gridH || L.grid;
  const scale = Math.min(rect.w / L.grid, rect.h / hh);
  const w = L.grid * scale;
  const h = hh * scale;
  return { scale, x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.h - h) / 2, w, h };
}

/**
 * Validate a wire-format drawing (server authority, client enforces the same).
 * @param {*} d
 * @param {{requireStroke?: boolean}} [opts] requireStroke (default true): a submitted drawing needs >= 1 stroke
 * @returns {{ok:true, strokes:number, points:number, bytes:number, h:number} | {ok:false, reason:string}}
 *   reason: shape version height empty strokes points perStroke range color size bytes pathLength
 */
function validate(d, opts) {
  const requireStroke = !opts || opts.requireStroke !== false;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, reason: 'shape' };
  const keys = Object.keys(d);
  if (d.v !== 1 && d.v !== 2) return { ok: false, reason: keys.includes('v') ? 'version' : 'shape' };
  const want = d.v === 2 ? 3 : 2;
  if (keys.length !== want || !keys.includes('s') || (d.v === 2 && !keys.includes('h'))) return { ok: false, reason: 'shape' };
  let h = L.grid;
  if (d.v === 2) {
    if (!isInt(d.h) || d.h < L.minH || d.h > L.maxH) return { ok: false, reason: 'height' };
    h = d.h;
  }
  if (!Array.isArray(d.s)) return { ok: false, reason: 'shape' };
  if (d.s.length > L.maxStrokes) return { ok: false, reason: 'strokes' };
  if (requireStroke && d.s.length === 0) return { ok: false, reason: 'empty' };
  let points = 0;
  for (const st of d.s) {
    if (!Array.isArray(st) || st.length < 4) return { ok: false, reason: 'shape' };
    if ((st.length - 2) % 2 !== 0) return { ok: false, reason: 'shape' };
    const n = (st.length - 2) / 2;
    if (n > L.maxPointsPerStroke) return { ok: false, reason: 'perStroke' };
    points += n;
    if (points > L.maxPoints) return { ok: false, reason: 'points' };
    for (let i = 0; i < st.length; i++) if (!isInt(st[i])) return { ok: false, reason: 'shape' };
    if (st[0] < 0 || st[0] >= L.colors) return { ok: false, reason: 'color' };
    if (st[1] < 0 || st[1] >= L.sizes) return { ok: false, reason: 'size' };
    let x = st[2];
    let y = st[3];
    if (x < 0 || x >= L.grid || y < 0 || y >= h) return { ok: false, reason: 'range' };
    for (let i = 4; i < st.length; i += 2) {
      x += st[i];
      y += st[i + 1];
      if (x < 0 || x >= L.grid || y < 0 || y >= h) return { ok: false, reason: 'range' };
    }
  }
  const bytes = JSON.stringify(d).length; // digits, '-', ',', '[' ']' only: ASCII, so length == bytes
  if (bytes > L.maxBytes) return { ok: false, reason: 'bytes' };
  if (pathLength(d) > L.maxPathUnits) return { ok: false, reason: 'pathLength' };
  return { ok: true, strokes: d.s.length, points, bytes, h };
}

/** absolute strokes [{c,w,p:[x0,y0,x1,y1..]}] -> wire format v2 with height `h` (default 1024). Points are rounded to integers. */
function fromAbsolute(abs, h) {
  const s = abs.map((st) => {
    const out = [st.c, st.w];
    let px = 0;
    let py = 0;
    for (let i = 0; i < st.p.length; i += 2) {
      const x = Math.round(st.p[i]);
      const y = Math.round(st.p[i + 1]);
      if (i === 0) out.push(x, y);
      else out.push(x - px, y - py);
      px = x;
      py = y;
    }
    return out;
  });
  return { v: L.version, h: h === undefined ? L.grid : h, s };
}

/** wire format -> absolute strokes (assumes a valid drawing; run validate first for untrusted input) */
function toAbsolute(d) {
  return d.s.map((st) => {
    const p = [st[2], st[3]];
    let x = st[2];
    let y = st[3];
    for (let i = 4; i < st.length; i += 2) {
      x += st[i];
      y += st[i + 1];
      p.push(x, y);
    }
    return { c: st[0], w: st[1], p };
  });
}

function pointCount(d) {
  let n = 0;
  for (const st of d.s) n += (st.length - 2) / 2;
  return n;
}

/** distinct colours used (analytics `colorsUsed`) */
function colorsUsed(d) {
  return new Set(d.s.map((st) => st[0])).size;
}

/** true when the drawing uses a colour from the 今日彩笔 set (analytics `palette`) */
function usesPaletteColor(d) {
  return d.s.some((st) => st[0] >= BASE_COLORS);
}

// ---- canonical geometry -----------------------------------------------------------------------------------

/**
 * Absolute strokes -> polylines in an output space `size` px wide (and size * h / 1024 high: one scale for both axes).
 * Grid cell i is drawn centred at (i + 0.5) * scale.
 * @returns {{c:number, color:string, width:number, dot:boolean, pts:number[]}[]}
 */
function absToPolylines(abs, size) {
  const scale = (size || L.grid) / L.grid;
  return abs.map((st) => {
    const pts = new Array(st.p.length);
    for (let i = 0; i < st.p.length; i++) pts[i] = (st.p[i] + 0.5) * scale;
    return { c: st.c, color: COLORS[st.c], width: SIZES[st.w] * scale, dot: st.p.length <= 2, pts };
  });
}

/** Wire format -> polylines (see absToPolylines). Works for v1 and v2. */
function toPolylines(d, size) {
  return absToPolylines(toAbsolute(d), size);
}

function polyLength(pts) {
  let len = 0;
  for (let i = 2; i < pts.length; i += 2) len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return len;
}

/**
 * Reveal replay (8.9, AC 31): the first `frac` (0..1) of the drawing in drawing order, by path length with a minimum
 * weight per stroke so dots and short strokes still take time. frac = min(1, elapsedMs / REPLAY_MS) whatever the size,
 * which is what makes every drawing replay in 2.5 s. Returns new polylines; the last one may be cut part-way.
 */
function replayPolylines(polys, frac) {
  if (frac >= 1) return polys;
  if (frac <= 0) return [];
  const weights = polys.map((p) => Math.max(polyLength(p.pts), p.width * 3)); // a dot or tiny stroke still takes a beat
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
    // partial stroke: keep the leading part of the path
    const part = budget / weights[i];
    const want = polyLength(p.pts) * part;
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

// ---- recorder: the drawing tool's state machine (client) -----------------------------------------------------

/**
 * Records touches into strokes with the rules of 5.1-5.3. Pure state, no timers, no canvas: the controller feeds it
 * grid coordinates (already mapped from touch positions), the renderer reads `strokes` (absolute) and `rev`.
 * `opts.h` is the stored height of this turn's canvas (768-2048, default 1024); it is fixed for the recorder's life (5.1).
 *
 *   begin(x, y, colorIdx, sizeIdx) -> boolean   false if a limit blocks a new stroke (then `blocked` is set)
 *   move(x, y)                     -> boolean   true if a point was kept (>= minPointDist from the last kept point)
 *   end()                           finish the stroke (a tap becomes a one-point dot)
 *   undo() -> boolean               remove the last stroke (unlimited)
 *   clear()                         remove everything (undo cannot restore; the UI asks first)
 *   drawing() -> wire format v2     what submitStep / submitRoomStep send
 */
function createRecorder(opts) {
  const o = Object.assign({}, L, opts || {});
  const gridH = isInt(o.h) ? Math.min(L.maxH, Math.max(L.minH, o.h)) : L.grid;
  const strokes = []; // absolute
  let cur = null;
  let points = 0;
  let rev = 0;
  let undoCount = 0;
  let pathUsed = 0;
  let pathFull = false; // a move was refused because the ink budget is spent
  const pathCap = o.maxPathUnits - o.pathMargin;
  const r = {
    get strokes() { return strokes; },
    get rev() { return rev; },
    /** the stored height of this turn's drawing */
    get h() { return gridH; },
    get pointsUsed() { return points; },
    get undoCount() { return undoCount; },
    get strokeCount() { return strokes.length; },
    get pathUsed() { return pathUsed; },
    /** the ink budget is spent: no more strokes (the player is told to submit) */
    get pathFull() { return pathFull; },
    get drawingNow() { return cur !== null; },
    /** a limit has been hit: stroke count, total points, (the per-stroke cap only stops that stroke) */
    get blocked() { return strokes.length >= o.maxStrokes || points >= o.maxPoints || pathFull; },
    get canUndo() { return strokes.length > 0 && cur === null; },
    get canSubmit() { return strokes.length > 0 && cur === null; },
  };
  const clampX = (v) => Math.max(0, Math.min(o.grid - 1, Math.round(v)));
  const clampY = (v) => Math.max(0, Math.min(gridH - 1, Math.round(v)));

  r.begin = function begin(x, y, colorIdx, sizeIdx) {
    if (cur || r.blocked) return false;
    if (!isInt(colorIdx) || colorIdx < 0 || colorIdx >= o.colors || !isInt(sizeIdx) || sizeIdx < 0 || sizeIdx >= o.sizes) return false;
    cur = { c: colorIdx, w: sizeIdx, p: [clampX(x), clampY(y)] };
    strokes.push(cur);
    points += 1;
    rev++;
    return true;
  };
  r.move = function move(x, y) {
    if (!cur) return false;
    if (points >= o.maxPoints || cur.p.length / 2 >= o.maxPointsPerStroke) return false;
    const gx = clampX(x);
    const gy = clampY(y);
    const lx = cur.p[cur.p.length - 2];
    const ly = cur.p[cur.p.length - 1];
    const dx = gx - lx;
    const dy = gy - ly;
    if (dx * dx + dy * dy < o.minPointDist * o.minPointDist) return false;
    const seg = Math.sqrt(dx * dx + dy * dy);
    if (pathUsed + seg > pathCap) {
      pathFull = true;
      return false;
    }
    pathUsed += seg;
    cur.p.push(gx, gy);
    points += 1;
    rev++;
    return true;
  };
  r.end = function end() {
    cur = null;
  };
  r.undo = function undo() {
    if (cur || !strokes.length) return false;
    const st = strokes.pop();
    points -= st.p.length / 2;
    pathUsed = Math.max(0, pathUsed - absLength(st));
    pathFull = false;
    undoCount++;
    rev++;
    return true;
  };
  r.clear = function clear() {
    cur = null;
    strokes.length = 0;
    points = 0;
    pathUsed = 0;
    pathFull = false;
    rev++;
  };
  r.drawing = function drawing() {
    return fromAbsolute(strokes, gridH);
  };
  /** restore from a saved wire-format drawing (app killed mid-turn, 17.21). A drawing of another height is refused. */
  r.load = function load(d) {
    const v = validate(d, { requireStroke: false });
    if (!v.ok || v.h !== gridH) return false;
    r.clear();
    for (const st of toAbsolute(d)) strokes.push(st);
    points = v.points;
    pathUsed = pathLength(d);
    pathFull = pathUsed >= pathCap;
    rev++;
    return true;
  };
  return r;
}

module.exports = {
  COLORS, COLOR_NAMES, BASE_COLORS, SIZES, REPLAY_MS,
  empty, heightOf, gridHeight, canvasFit, containFit, validate, pathLength, fromAbsolute, toAbsolute, pointCount, colorsUsed, usesPaletteColor,
  absToPolylines, toPolylines, replayPolylines, createRecorder,
};
