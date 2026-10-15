/**
 * Stroke renderer (spec 5.3, 5.4): draws a drawing from the stroke format into
 * a square rect, for the live canvas, the previous-棒 view, thumbnails and the
 * reveal replay. Pure canvas calls, no state.
 *
 * Input format (core/strokes.js, shared client/server):
 *   { v: 1, s: [ [c, w, x0, y0, dx1, dy1, dx2, dy2, ...], ... ] }
 *   c = colour index 0-11 (theme.PALETTE), w = brush index 0-2 (theme.BRUSH),
 *   first point absolute (0-1023), the rest are integer deltas.
 * Anything malformed is skipped, and a missing/empty value draws only the paper.
 *
 * Geometry matches the server rasteriser: round caps and joins, widths in
 * grid units scaled by rect.w / 1024, quadratic smoothing through midpoints.
 */

const T = require('./theme');

/** Decode to [{c, w, pts: [x0,y0,x1,y1,...] absolute}] (invalid strokes dropped). */
function decode(strokes) {
  const out = [];
  const list = strokes && Array.isArray(strokes.s) ? strokes.s : [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!Array.isArray(a) || a.length < 4) continue;
    const c = a[0] | 0;
    const w = a[1] | 0;
    if (c < 0 || c >= T.PALETTE.length || w < 0 || w >= T.BRUSH.length) continue;
    let x = a[2];
    let y = a[3];
    if (!isFinite(x) || !isFinite(y)) continue;
    const pts = [x, y];
    for (let k = 4; k + 1 < a.length; k += 2) {
      x += a[k];
      y += a[k + 1];
      pts.push(x, y);
    }
    out.push({ c, w, pts });
  }
  return out;
}

/** Number of strokes and points, as the tool counts them. */
function stats(strokes) {
  const d = decode(strokes);
  let points = 0;
  d.forEach((s) => (points += s.pts.length / 2));
  return { strokes: d.length, points };
}

function strokeLength(pts) {
  let len = 0;
  for (let i = 2; i < pts.length; i += 2) len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return len;
}

/** Each stroke also "costs" a little time so dots and short strokes are visible in a replay. */
const STROKE_BASE = 48;

/** Cut a point list at `len` grid units of path length (interpolating the last point). */
function truncate(pts, len) {
  const out = [pts[0], pts[1]];
  let left = len;
  for (let i = 2; i < pts.length; i += 2) {
    const seg = Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    if (seg <= left) {
      out.push(pts[i], pts[i + 1]);
      left -= seg;
    } else {
      const f = seg > 0 ? left / seg : 0;
      out.push(pts[i - 2] + (pts[i] - pts[i - 2]) * f, pts[i - 1] + (pts[i + 1] - pts[i - 1]) * f);
      break;
    }
  }
  return out;
}

function pathOf(ctx, pts, ox, oy, k) {
  ctx.beginPath();
  const n = pts.length / 2;
  ctx.moveTo(ox + pts[0] * k, oy + pts[1] * k);
  if (n === 2) {
    ctx.lineTo(ox + pts[2] * k, oy + pts[3] * k);
  } else if (n > 2) {
    for (let i = 1; i < n - 1; i++) {
      const cx = ox + pts[i * 2] * k;
      const cy = oy + pts[i * 2 + 1] * k;
      const mx = ox + ((pts[i * 2] + pts[i * 2 + 2]) / 2) * k;
      const my = oy + ((pts[i * 2 + 1] + pts[i * 2 + 3]) / 2) * k;
      ctx.quadraticCurveTo(cx, cy, mx, my);
    }
    ctx.lineTo(ox + pts[n * 2 - 2] * k, oy + pts[n * 2 - 1] * k);
  }
}

/**
 * Draw `strokes` into rect {x,y,w,h} (square; h is ignored, w rules).
 * o: { progress: 0..1 of the whole drawing (default 1), bg: colour string |
 *      false (default white), border: colour|false, radius: number }
 * Clipped to the rect so a stroke never leaks over the UI around it.
 */
function draw(ctx, strokes, rect, o) {
  o = o || {};
  const x = rect.x;
  const y = rect.y;
  const w = rect.w;
  const h = rect.h != null ? rect.h : rect.w;
  const k = w / T.GRID;
  const p = o.progress == null ? 1 : Math.max(0, Math.min(1, o.progress));
  const r = o.radius != null ? o.radius : 0;

  ctx.save();
  if (o.bg !== false) {
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = o.bg || '#FFFFFF';
    ctx.fill();
  }
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();

  const list = decode(strokes);
  if (list.length && p > 0) {
    let total = 0;
    const weights = list.map((s) => {
      const wgt = strokeLength(s.pts) + STROKE_BASE;
      total += wgt;
      return wgt;
    });
    let budget = p >= 1 ? Infinity : p * total;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < list.length; i++) {
      if (budget <= 0) break;
      const s = list[i];
      let pts = s.pts;
      if (budget < weights[i]) pts = truncate(pts, Math.max(0, budget - STROKE_BASE * 0.5));
      budget -= weights[i];
      const lw = Math.max(1.2, T.BRUSH[s.w] * k);
      ctx.strokeStyle = T.PALETTE[s.c];
      ctx.fillStyle = T.PALETTE[s.c];
      ctx.lineWidth = lw;
      if (pts.length <= 2 || (pts.length === 4 && pts[0] === pts[2] && pts[1] === pts[3])) {
        // a dot
        ctx.beginPath();
        ctx.arc(x + pts[0] * k, y + pts[1] * k, lw / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        pathOf(ctx, pts, x, y, k);
        ctx.stroke();
      }
    }
  }
  ctx.restore();

  if (o.border) {
    roundRect(ctx, x, y, w, h, r);
    ctx.strokeStyle = o.border;
    ctx.lineWidth = o.borderWidth || 2;
    ctx.stroke();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r || 0, w / 2, h / 2);
  ctx.beginPath();
  if (!r) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

module.exports = { decode, stats, draw, truncate, STROKE_BASE };
