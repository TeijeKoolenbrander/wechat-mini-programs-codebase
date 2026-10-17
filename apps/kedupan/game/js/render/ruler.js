/**
 * The ruler (刻度尺): a paper tape measure with sticky-note end labels (CONTRACT "Shared widget: ruler").
 *
 *   ruler.draw(ctx, L, spec) -> geometry {x0, x1, bandY, bandH, tapeY, tapeH, y, h}
 *   spec = {x, y, w, h?, left, right, needle: int|null, markers: Marker[], band: {from,to}|null, interactive, locked,
 *           revealT, t, hint, display, mini}
 *   ruler.height(L, mini?) -> total drawn height (notes + marker lane + tape) for the current display mode
 *   ruler.addHit(hits, id, geom, L) registers `<id>` (full width touch band) and sets hits.ruler = {x0, x1, y, h}
 *
 * The renderer never turns touches into positions: it draws `needle` as given (null = no needle, AC 14) and reports the
 * track span (x0..x1 = spec.x+16 .. spec.x+spec.w-16, the same numbers as core/ruler.makeTrack) and the touch band.
 * Shapes differ in every mode (AC 71): you ▼, nation ◆, group ●, member ○ hollow, target ▮, late dashed ○.
 */

const T = require('./theme');
const W = require('./widgets');
const C = T.COLORS;

const MARGIN = 16;

function metrics(L, mini) {
  const large = T.isLarge();
  if (mini) {
    const tapeH = L.u(large ? 22 : 18);
    const lane = L.u(large ? 21 : 18);
    return { noteH: 0, laneH: lane, tapeH, total: lane + tapeH + L.u(4) };
  }
  const noteH = L.u(large ? 50 : 42);
  const laneH = L.u(large ? 28 : 26);
  const tapeH = L.u(large ? 56 : 46);
  return { noteH, laneH, tapeH, gap: L.u(6), total: noteH + L.u(6) + laneH + tapeH + L.u(8) };
}

function height(L, mini) {
  return metrics(L, mini).total;
}

function ease(p) {
  p = Math.max(0, Math.min(1, p));
  return 1 - Math.pow(1 - p, 3);
}

// ------------------------------------------------------------- markers

function outline(ctx, color) {
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = T.isHC() ? 2.5 : 2;
}

/** ▼ you: tip at (x, y). size = width. */
function drawYou(ctx, x, y, size, o) {
  const hgt = size * 0.95;
  ctx.beginPath();
  ctx.moveTo(x - size / 2, y - hgt);
  ctx.lineTo(x + size / 2, y - hgt);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fillStyle = o && o.locked ? C.sub : C.you;
  ctx.fill();
  outline(ctx, T.isHC() ? C.ink : C.ink);
  ctx.lineWidth = T.isHC() ? 2.5 : 1.5;
  ctx.stroke();
  if (o && o.locked) {
    ctx.beginPath();
    ctx.arc(x, y - hgt * 0.62, size * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = C.paper;
    ctx.fill();
  }
}
/** ◆ nation: centred. r = half width. */
function drawNation(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fillStyle = C.nation;
  ctx.fill();
  outline(ctx, C.markerOutline);
  ctx.stroke();
}
/** ● group. */
function drawGroup(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = C.group;
  ctx.fill();
  outline(ctx, C.markerOutline);
  ctx.stroke();
}
/** ○ group member (hollow) and late guess (dashed hollow). */
function drawMember(ctx, x, y, r, late) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = T.isHC() ? '#FFFFFF' : 'rgba(255,253,248,0.85)';
  ctx.fill();
  ctx.strokeStyle = C.group;
  ctx.lineWidth = T.isHC() ? 2.5 : 2;
  if (late) ctx.setLineDash([3, 3]);
  ctx.stroke();
  ctx.setLineDash([]);
}
/** ▮ target: a bar through the tape. */
function drawTarget(ctx, x, y, hgt, wid) {
  W.fillRR(ctx, x - wid / 2, y - hgt / 2, wid, hgt, wid / 3, C.ink);
  W.strokeRR(ctx, x - wid / 2, y - hgt / 2, wid, hgt, wid / 3, T.isHC() ? '#FFFFFF' : C.markerOutline, 1.5);
}

// ---------------------------------------------------------------- draw

function tape(ctx, x, y, w, h) {
  if (!T.isHC()) {
    ctx.save();
    ctx.shadowColor = C.tapeShadow;
    ctx.shadowOffsetY = 3;
    ctx.shadowBlur = 5;
    W.fillRR(ctx, x, y, w, h, 8, C.tape);
    ctx.restore();
    W.strokeRR(ctx, x, y, w, h, 8, C.tapeEdge, 1);
  } else {
    W.fillRR(ctx, x, y, w, h, 8, C.tape);
    W.strokeRR(ctx, x, y, w, h, 8, C.ink, 2.5);
  }
}

function ticks(ctx, x0, x1, ty, th, mini) {
  ctx.strokeStyle = C.tick;
  ctx.lineCap = 'butt';
  for (let i = 0; i <= 20; i++) {
    const pos = i * 5;
    const x = x0 + ((x1 - x0) * pos) / 100;
    let f = 0.2;
    if (pos % 10 === 0) f = 0.32;
    if (pos === 50) f = 0.55;
    if (mini && pos % 10 !== 0) continue;
    ctx.lineWidth = pos === 50 ? 2.5 : pos % 10 === 0 ? 1.8 : 1.3;
    ctx.beginPath();
    ctx.moveTo(x, ty + 1);
    ctx.lineTo(x, ty + th * f);
    ctx.stroke();
  }
}

function endNote(ctx, L, label, side, x0, x1, y, h, fill) {
  const size = T.FS.end;
  const tw = W.measure(ctx, label, size, 800);
  const w = Math.min(L.u(130), Math.max(L.u(64), tw + L.u(22)));
  const x = side === 'left' ? x0 - L.u(6) : x1 + L.u(6) - w;
  W.stickyNote(ctx, x, y, w, h, { fill, angle: side === 'left' ? -2.5 : 2.5 });
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(((side === 'left' ? -2.5 : 2.5) * Math.PI) / 180);
  W.text(ctx, label, 0, 1, { size, weight: 800, align: 'center', maxW: w - L.u(8), minSize: T.FS.body });
  ctx.restore();
}

/** Regular ruler. */
function drawFull(ctx, L, s) {
  const m = metrics(L, false);
  const x0 = s.x + MARGIN;
  const x1 = s.x + s.w - MARGIN;
  const span = x1 - x0;
  const px = (pos) => x0 + (span * pos) / 100;
  const noteY = s.y;
  const laneY = s.y + m.noteH + m.gap;
  const tapeY = laneY + m.laneH;
  const cy = tapeY + m.tapeH / 2;

  endNote(ctx, L, s.left, 'left', x0, x1, noteY, m.noteH, C.noteBlue);
  endNote(ctx, L, s.right, 'right', x0, x1, noteY, m.noteH, C.noteOrange);

  tape(ctx, x0 - L.u(8), tapeY, span + L.u(16), m.tapeH);
  ticks(ctx, x0, x1, tapeY, m.tapeH, false);

  if (s.band) {
    const a = px(Math.max(0, s.band.from));
    const b = px(Math.min(100, s.band.to));
    ctx.fillStyle = C.band;
    ctx.fillRect(a, tapeY + 2, Math.max(4, b - a), m.tapeH - 4);
    ctx.strokeStyle = C.bandEdge;
    ctx.lineWidth = T.isHC() ? 3 : 2;
    ctx.strokeRect(a, tapeY + 2, Math.max(4, b - a), m.tapeH - 4);
  }

  const markers = s.markers || [];
  const you = markers.find((k) => k.kind === 'you');
  const youPos = you ? you.pos : s.needle != null ? s.needle : 50;
  const rt = s.revealT == null ? 1 : s.revealT;
  const e = ease(rt);
  const at = (pos) => px(youPos + (pos - youPos) * e);
  const rN = L.u(T.isLarge() ? 13 : 11);
  const rG = L.u(T.isLarge() ? 11 : 9);
  const rM = L.u(T.isLarge() ? 8 : 6.5);
  if (rt > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, rt * 3);
    const draw = (kind, fn) => markers.forEach((k) => k.kind === kind && fn(k));
    draw('nation', (k) => drawNation(ctx, at(k.pos), cy - m.tapeH * 0.12, rN));
    draw('group', (k) => drawGroup(ctx, at(k.pos), cy + m.tapeH * 0.2, rG));
    draw('member', (k) => drawMember(ctx, at(k.pos), cy + m.tapeH * 0.2, rM, false));
    draw('late', (k) => drawMember(ctx, at(k.pos), cy + m.tapeH * 0.2, rM, true));
    draw('target', (k) => drawTarget(ctx, at(k.pos), cy, m.tapeH + L.u(8), L.u(T.isLarge() ? 10 : 8)));
    ctx.restore();
  }
  // needle: only what the vm gave (AC 14)
  const needle = you ? you.pos : s.needle;
  if (needle != null) {
    const nx = px(needle);
    ctx.strokeStyle = s.locked ? C.sub : C.you;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(nx, tapeY);
    ctx.lineTo(nx, tapeY + m.tapeH);
    ctx.stroke();
    drawYou(ctx, nx, tapeY, L.u(T.isLarge() ? 32 : 28), { locked: s.locked });
  } else if (s.hint) {
    W.text(ctx, s.hint, L.W / 2, cy, { size: T.FS.bodyL, weight: 700, color: C.ink, align: 'center', maxW: span - L.u(8) });
  }
  return { x0, x1, y: s.y, h: m.total, bandY: laneY, bandH: m.laneH + m.tapeH + L.u(8), tapeY, tapeH: m.tapeH };
}

/** Mini ruler for result rows / reviews: labels left and right of a thin tape, ▼ you and ◆ nation. */
function drawMini(ctx, L, s) {
  const m = metrics(L, true);
  const size = T.FS.body;
  const lw = Math.min(L.u(72), Math.max(W.measure(ctx, s.left, size, 700), 0) + L.u(6));
  const rw = Math.min(L.u(72), Math.max(W.measure(ctx, s.right, size, 700), 0) + L.u(6));
  const x0 = s.x + lw;
  const x1 = s.x + s.w - rw;
  const span = x1 - x0;
  const px = (pos) => x0 + (span * pos) / 100;
  const tapeY = s.y + m.laneH;
  const cy = tapeY + m.tapeH / 2;
  W.text(ctx, s.left, s.x, cy, { size, weight: 700, color: C.sub, maxW: lw - L.u(4) });
  W.text(ctx, s.right, s.x + s.w, cy, { size, weight: 700, color: C.sub, align: 'right', maxW: rw - L.u(4) });
  tape(ctx, x0 - 4, tapeY, span + 8, m.tapeH);
  ticks(ctx, x0, x1, tapeY, m.tapeH, true);
  const markers = s.markers || [];
  const rt = s.revealT == null ? 1 : s.revealT;
  const you = markers.find((k) => k.kind === 'you');
  const youPos = you ? you.pos : 50;
  const e = ease(rt);
  const at = (pos) => px(youPos + (pos - youPos) * e);
  markers.forEach((k) => {
    if (k.kind === 'nation') drawNation(ctx, at(k.pos), cy, L.u(T.isLarge() ? 9 : 7.5));
    if (k.kind === 'group') drawGroup(ctx, at(k.pos), cy, L.u(6.5));
  });
  if (you) drawYou(ctx, px(you.pos), tapeY + 2, L.u(T.isLarge() ? 18 : 15), {});
  return { x0, x1, y: s.y, h: m.total, tapeY, tapeH: m.tapeH };
}

/**
 * Band-only strip (the host's clue step, spec 6.5): the tape with its ticks and the tangerine target band, no end notes, no
 * marker lane, no touch band. Display only; the end labels are in the header line. s = {x, y, w, h, band: {from, to}|null}.
 */
function drawBand(ctx, L, s) {
  const x0 = s.x + MARGIN;
  const x1 = s.x + s.w - MARGIN;
  const span = x1 - x0;
  tape(ctx, x0 - L.u(8), s.y, span + L.u(16), s.h);
  ticks(ctx, x0, x1, s.y, s.h, s.h < L.u(34));
  if (s.band) {
    const a = x0 + (span * Math.max(0, s.band.from)) / 100;
    const b = x0 + (span * Math.min(100, s.band.to)) / 100;
    ctx.fillStyle = C.band;
    ctx.fillRect(a, s.y + 2, Math.max(4, b - a), s.h - 4);
    ctx.strokeStyle = C.bandEdge;
    ctx.lineWidth = T.isHC() ? 3 : 2;
    ctx.strokeRect(a, s.y + 2, Math.max(4, b - a), s.h - 4);
  }
  return { x0, x1, y: s.y, h: s.h };
}

function draw(ctx, L, spec) {
  return spec.mini ? drawMini(ctx, L, spec) : drawFull(ctx, L, spec);
}

/**
 * Register the live ruler's touch band: `id` spans the FULL width (margins clamp to 0 / 100), height >= 64pt (80 in large text).
 * Also sets hits.ruler = {x0, x1, y, h} (CONTRACT "Ruler input contract").
 */
function addHit(hits, id, g, L) {
  const minH = T.isLarge() ? 80 : 64;
  const h = Math.max(g.bandH, minH);
  const y = g.bandY - (h - g.bandH) / 2;
  hits.add(id, 0, y, L.W, h);
  hits.ruler = { x0: g.x0, x1: g.x1, y, h };
}

module.exports = { draw, drawBand, height, metrics, addHit, drawYou, drawNation, drawGroup, drawMember, drawTarget, MARGIN };
