/**
 * The 刻度尺: a straight paper tape measure, ticks every 5 steps, longer ticks
 * at 0 / 50 / 100, no numbers. Deliberately NOT a dial. Markers differ by
 * shape as well as colour:
 *   ▼ you (tangerine, above the tape, pinned through it)
 *   ◆ nation (teal, lane 1 under the tape)
 *   ● group median (plum, lane 2 under the tape)
 *   ○ group members / guesses (hollow plum, on the tape)
 *   ▮ target (vermilion bar through the tape)
 *   dashed ○ late guess
 * Pure drawing; the touch mapping is `posFromX(hitAreas.ruler, x)`.
 */

const T = require('./theme');
const W = require('./widgets');
const C = T.C;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Map a touch x to a 0-100 integer position. `track` = hitAreas.ruler. */
function posFromX(track, x) {
  if (!track || track.x1 <= track.x0) return 0;
  return clamp(Math.round(((x - track.x0) / (track.x1 - track.x0)) * 100), 0, 100);
}

// ------------------------------------------------------------ marker shapes

function outline() {
  return T.MODE.hc ? 2.5 : 1.5;
}

/** Downward pointer, tip at (x, tipY). */
function pointer(ctx, x, tipY, size, color) {
  const hw = size * 0.78;
  ctx.beginPath();
  ctx.moveTo(x, tipY);
  ctx.lineTo(x - hw, tipY - size * 1.25);
  ctx.lineTo(x + hw, tipY - size * 1.25);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = outline();
  ctx.stroke();
}

function diamond(ctx, x, y, size, color) {
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size * 0.85, y);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size * 0.85, y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = outline();
  ctx.stroke();
}

function dot(ctx, x, y, r, color, o) {
  o = o || {};
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (o.hollow) {
    ctx.fillStyle = C.card;
    ctx.fill();
    if (o.dashed) ctx.setLineDash([3, 3]);
    ctx.strokeStyle = color;
    ctx.lineWidth = T.MODE.hc ? 2.5 : 2.2;
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = outline();
    ctx.stroke();
  }
}

// ------------------------------------------------------------- big ruler

function tapeBody(ctx, L, x, y, w, h) {
  ctx.save();
  if (!T.MODE.hc) {
    ctx.shadowColor = 'rgba(70,50,20,0.28)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
  }
  W.fillRR(ctx, x, y, w, h, L.u(6), C.tape);
  ctx.restore();
  if (!T.MODE.hc) {
    // paper highlight and a darker lower edge
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(x + 3, y + 3, w - 6, h * 0.16);
    ctx.fillStyle = 'rgba(150,110,0,0.18)';
    ctx.fillRect(x + 3, y + h - h * 0.12, w - 6, h * 0.12 - 3);
  }
  W.strokeRR(ctx, x, y, w, h, L.u(6), T.MODE.hc ? C.ink : C.tapeShade, T.MODE.hc ? 2.5 : 1.5);
  // the hook tab at the zero end
  W.fillRR(ctx, x - L.u(4), y + h * 0.18, L.u(8), h * 0.64, 2, C.tapeHook);
}

function ticks(ctx, L, x0, x1, ty, th) {
  ctx.strokeStyle = C.ink;
  ctx.lineCap = 'butt';
  for (let i = 0; i <= 20; i++) {
    const tx = x0 + ((x1 - x0) * i) / 20;
    const long = i % 10 === 0;
    ctx.lineWidth = long ? (T.MODE.hc ? 3.5 : 2.6) : T.MODE.hc ? 2.5 : 1.8;
    ctx.globalAlpha = long ? 0.9 : 0.62;
    ctx.beginPath();
    ctx.moveTo(tx, ty + 3);
    ctx.lineTo(tx, ty + 3 + th * (long ? 0.5 : 0.27));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/**
 * Draw the ruler block (end notes, needle zone, tape, lanes, nudge row).
 * o: {y, x?, w?, left, right, needle: number|null, lift: 0..1,
 *     markers: [{pos, kind}], revealT: 0..1, lanes: 0..2, nudge: bool,
 *     nudgeLeft/nudgeRight: bool (enabled, default true), interactive: bool,
 *     empty: bool (draw the hint), hint: string, t: ms, youLabel: bool,
 *     band: {from, to}|null (the host's target band), id: string}
 * Returns {bottom, tape:{x,y,w,h}, track:{x0,x1}, hit:{x,y,w,h}}.
 */
function drawRuler(ctx, L, hits, o) {
  const x = o.x != null ? o.x : L.x0;
  const w = o.w != null ? o.w : L.contentW;
  const fsEnd = W.fs(L, 'endLabel');
  const noteH = fsEnd + L.u(18);
  const nz = L.u(T.MODE.large ? 40 : 36); // needle zone above the tape
  const th = Math.round(W.fs(L, 'band') * 0.8);
  const inset = L.u(20);
  const tx = x;
  const y0 = o.y;
  const tapeTop = y0 + noteH + L.u(6) + nz;
  const x0 = tx + inset;
  const x1 = tx + w - inset;
  const px = (pos) => x0 + (clamp(pos, 0, 100) / 100) * (x1 - x0);
  const midY = tapeTop + th / 2;
  const markers = o.markers || [];
  const reveal = o.revealT == null ? 1 : o.revealT;
  const e = W.easeOut(reveal);

  // end labels on sticky notes
  const lw = Math.max(L.u(60), W.measure(ctx, o.left || '', fsEnd, 800) + L.u(28));
  const rw = Math.max(L.u(60), W.measure(ctx, o.right || '', fsEnd, 800) + L.u(28));
  W.note(ctx, tx, y0 + L.u(2), lw, noteH, { fill: C.noteBlue, rot: -2, fold: false });
  W.text(ctx, o.left || '', tx + lw / 2, y0 + L.u(2) + noteH / 2, { size: fsEnd, weight: 800, align: 'center' });
  W.note(ctx, tx + w - rw, y0 + L.u(2), rw, noteH, { fill: C.noteOrange, rot: 2, fold: false });
  W.text(ctx, o.right || '', tx + w - rw / 2, y0 + L.u(2) + noteH / 2, { size: fsEnd, weight: 800, align: 'center' });

  tapeBody(ctx, L, tx, tapeTop, w, th);
  ticks(ctx, L, x0, x1, tapeTop, th);

  // the host's target band
  if (o.band) {
    const bx0 = px(o.band.from);
    const bx1 = px(o.band.to);
    ctx.fillStyle = T.MODE.hc ? 'rgba(138,47,0,0.35)' : 'rgba(217,72,15,0.34)';
    ctx.fillRect(bx0, tapeTop - L.u(6), Math.max(L.u(10), bx1 - bx0), th + L.u(12));
    ctx.strokeStyle = C.target;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(bx0, tapeTop - L.u(6), Math.max(L.u(10), bx1 - bx0), th + L.u(12));
  }

  // members, target, late guesses on the tape
  const r = L.u(T.MODE.large ? 8.5 : 7);
  const placed = [];
  markers.forEach((m) => {
    if (m.kind !== 'member' && m.kind !== 'late') return;
    const mx = px(m.pos);
    let level = 0;
    placed.forEach((p) => {
      if (Math.abs(p.x - mx) < r * 2.1 && p.level === level) level++;
    });
    placed.push({ x: mx, level });
    const lv = level % 5;
    const dy = (lv % 2 ? 1 : -1) * Math.ceil(lv / 2) * r * 1.6;
    const a = clamp(reveal * 2.5, 0, 1);
    ctx.globalAlpha = a;
    dot(ctx, mx, midY + dy + L.u(3), r, C.group, { hollow: true, dashed: m.kind === 'late' });
    ctx.globalAlpha = 1;
  });
  markers.forEach((m) => {
    if (m.kind !== 'target') return;
    const mx = px(m.pos);
    const bw = L.u(T.MODE.large ? 13 : 11);
    ctx.fillStyle = C.target;
    ctx.fillRect(mx - bw / 2, tapeTop - L.u(8), bw, th + L.u(16));
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = outline();
    ctx.strokeRect(mx - bw / 2, tapeTop - L.u(8), bw, th + L.u(16));
  });

  // lanes under the tape: ◆ nation, ● group
  const laneH = L.u(T.MODE.large ? 34 : 30);
  const laneTop = tapeTop + th + L.u(4);
  const lane = (n, kind, label, color, textColor) => {
    const m = markers.find((k) => k.kind === kind);
    if (!m) return;
    const mx = px(50 + (m.pos - 50) * e);
    const cy = laneTop + n * laneH + laneH / 2;
    ctx.globalAlpha = clamp(reveal * 3, 0, 1);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(mx, tapeTop + th);
    ctx.lineTo(mx, cy - r);
    ctx.stroke();
    if (kind === 'nation') diamond(ctx, mx, cy, r * 1.15, color);
    else dot(ctx, mx, cy, r * 1.05, color);
    const right = mx < x0 + (x1 - x0) * 0.62;
    W.text(ctx, label, mx + (right ? 1 : -1) * (r * 1.8), cy, { size: T.FS.body, weight: 700, color: textColor, align: right ? 'left' : 'right' });
    ctx.globalAlpha = 1;
  };
  lane(0, 'nation', '全国', C.nation, C.nationText);
  lane(1, 'group', '本群', C.group, C.groupText);
  const lanes = o.lanes || 0;
  let bottom = laneTop + lanes * laneH;

  // the needle
  const empty = o.needle == null;
  if (!empty) {
    const nx = px(o.needle);
    const lift = clamp(o.lift || 0, 0, 1);
    const size = L.u(T.MODE.large ? 13 : 11) * (1 + 0.3 * lift);
    // pin through the tape
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(nx, tapeTop - L.u(4) - lift * 6);
    ctx.lineTo(nx, tapeTop + th + L.u(5));
    ctx.stroke();
    ctx.strokeStyle = C.you;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(nx, tapeTop - L.u(4) - lift * 6);
    ctx.lineTo(nx, tapeTop + th + L.u(5));
    ctx.stroke();
    if (lift > 0 && !T.MODE.hc) {
      ctx.save();
      ctx.shadowColor = 'rgba(70,50,20,0.35)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 5;
      pointer(ctx, nx, tapeTop - L.u(3) - lift * 6, size, C.you);
      ctx.restore();
    }
    pointer(ctx, nx, tapeTop - L.u(3) - lift * 6, size, C.you);
    if (o.youLabel) {
      const right = nx < x0 + (x1 - x0) * 0.62;
      W.text(ctx, '你', nx + (right ? 1 : -1) * (size * 1.1), tapeTop - nz * 0.55 - lift * 6, { size: T.FS.body, weight: 800, color: C.youText, align: right ? 'left' : 'right' });
    }
  } else if (o.empty) {
    // ghost needle that wiggles along the tape: "drag me"
    const gp = 50 + 22 * Math.sin((o.t || 0) / 700);
    const nx = px(gp);
    ctx.globalAlpha = 0.38;
    pointer(ctx, nx, tapeTop - L.u(3), L.u(11), C.you);
    ctx.globalAlpha = 1;
    if (o.hint) {
      const hs = T.FS.body * L.s;
      const hw = W.measure(ctx, o.hint, hs, 700) + L.u(26);
      const hy = midY + L.u(2);
      W.note(ctx, L.cx - hw / 2, hy - hs, hw, hs * 2, { fill: C.noteYellow, fold: false });
      W.text(ctx, o.hint, L.cx, hy, { size: hs, weight: 700, align: 'center' });
    }
  }

  // touch band: needle zone + tape (>= 64, large >= 80)
  const hitY = tapeTop - nz;
  const hitH = nz + th + L.u(12);
  const hit = { x: Math.max(0, tx - L.u(8)), y: hitY, w: Math.min(L.W, w + L.u(16)), h: hitH };
  if (o.interactive !== false) {
    hits.add(o.id || 'ruler', hit.x, hit.y, hit.w, hit.h);
    hits.meta.ruler = { x0, x1, y: hitY, h: hitH };
  }

  // nudge row
  if (o.nudge) {
    const ns = Math.max(T.MIN_TAP, L.u(T.MODE.large ? 58 : 52));
    const ny = bottom + L.u(8);
    const btn = (id, dir, enabled, bx) => {
      const hc = T.MODE.hc;
      W.fillRR(ctx, bx, ny, ns, ns, ns / 2, enabled ? C.card : C.disabledFill);
      W.strokeRR(ctx, bx, ny, ns, ns, ns / 2, enabled ? (hc ? C.ink : C.lineStrong) : C.line, hc ? 2.5 : 1.5);
      W.iconChevron(ctx, bx + ns / 2, ny + ns / 2, L.u(18), enabled ? C.ink : C.disabledInk, dir);
      if (enabled) hits.add(id, bx, ny, ns, ns);
    };
    btn('nudge:left', 'left', o.nudgeLeft !== false, tx);
    btn('nudge:right', 'right', o.nudgeRight !== false, tx + w - ns);
    bottom = ny + ns;
  }

  return { bottom, tape: { x: tx, y: tapeTop, w, h: th }, track: { x0, x1 }, hit };
}

// ------------------------------------------------------------ mini ruler

/**
 * Compact tape for lists. o: {markers:[{pos, kind}], h, pins}. Draws ▼ above
 * and ◆ ● on the tape. Height used: head + tape = `miniHeight(L)`.
 */
function miniHeight(L) {
  return L.u(T.MODE.large ? 38 : 32);
}

function miniRuler(ctx, L, x, y, w, o) {
  o = o || {};
  const th = L.u(T.MODE.large ? 16 : 14);
  const head = miniHeight(L) - th;
  const ty = y + head;
  const inset = L.u(8);
  const x0 = x + inset;
  const x1 = x + w - inset;
  const px = (pos) => x0 + (clamp(pos, 0, 100) / 100) * (x1 - x0);
  W.fillRR(ctx, x, ty, w, th, th / 2.5, C.tape);
  W.strokeRR(ctx, x, ty, w, th, th / 2.5, T.MODE.hc ? C.ink : C.tapeShade, T.MODE.hc ? 2 : 1.2);
  ctx.strokeStyle = C.ink;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = T.MODE.hc ? 2 : 1.4;
  for (let i = 0; i <= 10; i++) {
    const tx = x0 + ((x1 - x0) * i) / 10;
    ctx.beginPath();
    ctx.moveTo(tx, ty + 2);
    ctx.lineTo(tx, ty + (i % 5 === 0 ? th * 0.6 : th * 0.34));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const sz = L.u(T.MODE.large ? 8 : 7);
  (o.markers || []).forEach((m) => {
    const mx = px(m.pos);
    if (m.kind === 'nation') diamond(ctx, mx, ty + th / 2, sz * 0.95, C.nation);
    else if (m.kind === 'group') dot(ctx, mx, ty + th / 2, sz * 0.85, C.group);
    else if (m.kind === 'member') dot(ctx, mx, ty + th / 2, sz * 0.7, C.group, { hollow: true });
  });
  (o.markers || []).forEach((m) => {
    if (m.kind === 'you') {
      const mx = px(m.pos);
      ctx.strokeStyle = C.you;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(mx, ty);
      ctx.lineTo(mx, ty + th);
      ctx.stroke();
      pointer(ctx, mx, ty + 1, sz * 0.95, C.you);
    }
  });
  return { bottom: y + miniHeight(L), x0, x1 };
}

module.exports = { posFromX, drawRuler, miniRuler, miniHeight, pointer, diamond, dot };
