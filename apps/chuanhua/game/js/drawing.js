/**
 * Drawing tool: one-finger input capture on the square canvas, recording strokes in core's format
 * (spec 5, PO-11). No wx, no rendering: the controller feeds it pointer events in screen px and the
 * canvas rect, a renderer draws `strokesForRender()`.
 *
 *   const tool = createDrawingTool({ palette?: unlocked 0|1 })
 *   tool.setRect({x,y,w,h})                      the square canvas on screen (from the renderer's `draw:canvas` hit)
 *   tool.pointerDown(id, x, y) -> boolean        false if a finger is already drawing, the touch starts outside, or a limit is hit
 *   tool.pointerMove(id, x, y) / pointerUp(id) / pointerCancel(id)
 *   tool.setColor(i) -> boolean (6-11 only when unlocked)   tool.setSize(i)   tool.unlockPalette()
 *   tool.undo() / tool.clear()                   undo removes exactly the last stroke; unlimited
 *   tool.drawing() -> {v:1,s:[...]}              finished strokes (deep copy), valid per core/strokes
 *   tool.strokesForRender() -> same shape incl. the stroke being drawn
 *   tool.load(drawing)                           resume a saved turn
 *   tool.info() -> { strokes, points, pointsMax, canUndo, limit, colorIdx, sizeIdx, undoCount, colorsUsed, drawing: boolean }
 *   smoothPath(points) -> segments for quadratic display smoothing (grid units)
 *
 * Capture: coordinates map to the 1024 grid (ints, clamped 0-1023); a point is kept only when >= 3 grid
 * units from the last kept one; the final finger position is always kept so lines end where the finger did;
 * a tap makes a dot. Limits: 200 strokes, 600 points per stroke (extra points of a long stroke are dropped),
 * 4,000 points in total (then new strokes are refused and `limit` is true: "画得太细啦，先交吧").
 */

const { CONFIG } = require('../core/config');
const St = require('../core/strokes');

const L = CONFIG.strokes;
const GRID_MAX = L.grid - 1;

function createDrawingTool(opts) {
  opts = opts || {};
  let rect = { x: 0, y: 0, w: L.grid, h: L.grid };
  let strokes = []; // finished stroke arrays
  let cur = null; // { c, w, pts: [[x,y]], finger }
  let colorIdx = 0;
  let sizeIdx = 1;
  let paletteUnlocked = !!opts.palette;
  let undoCount = 0;
  let points = 0; // points in finished strokes
  const used = {};
  const tool = {};

  const inRect = (x, y) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  // grid mapping writes into two scratch variables: no allocation per pointer event
  let gx = 0;
  let gy = 0;
  const toGrid = (x, y) => {
    gx = Math.max(0, Math.min(GRID_MAX, Math.round(((x - rect.x) / rect.w) * GRID_MAX)));
    gy = Math.max(0, Math.min(GRID_MAX, Math.round(((y - rect.y) / rect.h) * GRID_MAX)));
  };
  const liveCount = () => points + (cur ? cur.n : 0);
  // the render object is rebuilt only when the stroke list changes; the stroke in progress is appended in place
  let renderObj = { v: L.version, s: [] };
  let renderDirty = true;

  tool.setRect = (r) => {
    if (r && r.w > 0 && r.h > 0) rect = { x: r.x, y: r.y, w: r.w, h: r.h };
  };

  tool.pointerDown = (id, x, y) => {
    if (cur) return false; // single finger
    if (!inRect(x, y)) return false; // touches that start outside never draw
    if (strokes.length >= L.maxStrokes || points >= L.maxPoints) return false;
    toGrid(x, y);
    // cur.arr is the stroke in core's format, built incrementally (first point absolute, then deltas)
    cur = { arr: [colorIdx, sizeIdx, gx, gy], n: 1, lx: gx, ly: gy, finger: id };
    renderDirty = true;
    return true;
  };

  tool.pointerMove = (id, x, y) => {
    if (!cur || cur.finger !== id) return false;
    toGrid(x, y);
    const dx = gx - cur.lx;
    const dy = gy - cur.ly;
    if (dx * dx + dy * dy < L.minPointDist * L.minPointDist) return false;
    if (cur.n >= L.maxPointsPerStroke || liveCount() >= L.maxPoints) return false;
    cur.arr.push(dx, dy);
    cur.n++;
    cur.lx = gx;
    cur.ly = gy;
    return true;
  };

  function finish() {
    const s = cur;
    cur = null;
    strokes.push(s.arr);
    points += s.n;
    used[s.arr[0]] = true;
    renderDirty = true;
    return true;
  }

  tool.pointerUp = (id, x, y) => {
    if (!cur || cur.finger !== id) return false;
    if (x !== undefined) {
      toGrid(x, y);
      if ((gx !== cur.lx || gy !== cur.ly) && cur.n < L.maxPointsPerStroke && liveCount() < L.maxPoints) {
        cur.arr.push(gx - cur.lx, gy - cur.ly);
        cur.n++;
      }
    }
    return finish();
  };

  tool.pointerCancel = (id) => {
    if (!cur || cur.finger !== id) return false;
    return finish(); // keep what was drawn (a cancelled touch is usually a system gesture)
  };

  tool.setColor = (i) => {
    if (!Number.isInteger(i) || i < 0 || i >= L.colorCount) return false;
    if (i >= CONFIG.baseColors && !paletteUnlocked) return false;
    colorIdx = i;
    return true;
  };
  tool.setSize = (i) => {
    if (!Number.isInteger(i) || i < 0 || i >= L.sizeCount) return false;
    sizeIdx = i;
    return true;
  };
  tool.unlockPalette = () => {
    paletteUnlocked = true;
  };
  tool.paletteUnlocked = () => paletteUnlocked;

  tool.undo = () => {
    if (cur || strokes.length === 0) return false;
    const s = strokes.pop();
    points -= St.strokePointCount(s);
    undoCount++;
    renderDirty = true;
    return true;
  };

  tool.clear = () => {
    if (cur) return false;
    strokes = [];
    points = 0;
    renderDirty = true;
    return true;
  };

  tool.drawing = () => ({ v: L.version, s: strokes.map((s) => s.slice()) });

  tool.strokesForRender = () => {
    if (renderDirty) {
      renderObj = { v: L.version, s: strokes.slice() };
      if (cur) renderObj.s.push(cur.arr);
      renderDirty = false;
    }
    return renderObj;
  };

  tool.load = (drawing) => {
    if (!drawing || !St.validate(drawing).ok) return false;
    strokes = drawing.s.map((s) => s.slice());
    points = St.pointCount(drawing);
    cur = null;
    renderDirty = true;
    strokes.forEach((s) => (used[s[0]] = true));
    return true;
  };

  tool.info = () => ({
    strokes: strokes.length + (cur ? 1 : 0),
    points: liveCount(),
    pointsMax: L.maxPoints,
    canUndo: !cur && strokes.length > 0,
    limit: points >= L.maxPoints || strokes.length >= L.maxStrokes || (!!cur && liveCount() >= L.maxPoints),
    colorIdx,
    sizeIdx,
    undoCount,
    colorsUsed: Object.keys(used).length,
    drawing: !!cur,
    palette: paletteUnlocked,
  });

  return tool;
}

/**
 * Quadratic smoothing for display: from p0, for each interior point use it as the control point and the
 * midpoint to the next as the end; finish with a line to the last point.
 * Returns [{ type: 'move', x, y }, { type: 'quad', cx, cy, x, y }..., { type: 'line', x, y }].
 * A one-point stroke is a dot: [{ type: 'dot', x, y }].
 */
function smoothPath(pts) {
  if (!pts || pts.length === 0) return [];
  if (pts.length === 1) return [{ type: 'dot', x: pts[0][0], y: pts[0][1] }];
  const out = [{ type: 'move', x: pts[0][0], y: pts[0][1] }];
  if (pts.length === 2) {
    out.push({ type: 'line', x: pts[1][0], y: pts[1][1] });
    return out;
  }
  for (let i = 1; i < pts.length - 1; i++) {
    out.push({ type: 'quad', cx: pts[i][0], cy: pts[i][1], x: (pts[i][0] + pts[i + 1][0]) / 2, y: (pts[i][1] + pts[i + 1][1]) / 2 });
  }
  const last = pts[pts.length - 1];
  out.push({ type: 'line', x: last[0], y: last[1] });
  return out;
}

module.exports = { createDrawingTool, smoothPath };
