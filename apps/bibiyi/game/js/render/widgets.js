/**
 * Shared drawing widgets. Pure canvas 2D calls (a WeChat-safe subset: no
 * roundRect, no letterSpacing, no filter). No wx, no state, no timers.
 */

const T = require('./theme');
const { Hits, clamp } = require('./layout');
const icons = require('./icons');
const C = T.COLORS;

/** Apply the layout's display mode and return a fresh hit collector. Call first in every draw(). */
function start(L) {
  T.applyDisplay(L.display);
  return new Hits();
}

// ---------------------------------------------------------------- basics

function font(size, weight, serif) {
  return (weight || 400) + ' ' + Math.round(size * 10) / 10 + 'px ' + (serif ? T.SERIF : T.SANS);
}

function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
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

function fillRR(ctx, x, y, w, h, r, fill) {
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

function strokeRR(ctx, x, y, w, h, r, stroke, lw) {
  rr(ctx, x, y, w, h, r);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw || 1;
  ctx.stroke();
}

function measure(ctx, str, size, weight, serif) {
  ctx.font = font(size, weight, serif);
  return ctx.measureText(String(str)).width;
}

/**
 * Shrink then truncate so `str` fits maxW. Returns {str, size}. Size never
 * goes below minSize (default FS.body); the rest is cut with an ellipsis.
 */
function fit(ctx, str, maxW, size, weight, serif, minSize) {
  str = str == null ? '' : String(str);
  if (!maxW) return { str, size };
  let w = measure(ctx, str, size, weight, serif);
  if (w <= maxW) return { str, size };
  const min = minSize || T.FS.body;
  const s2 = Math.max(min, size * (maxW / w));
  w = measure(ctx, str, s2, weight, serif);
  if (w <= maxW) return { str, size: s2 };
  let chars = Array.from(str);
  while (chars.length > 1 && measure(ctx, chars.join('') + '…', s2, weight, serif) > maxW) chars.pop();
  return { str: chars.join('') + '…', size: s2 };
}

/**
 * Draw one line of text. o: {size, weight, color, align, serif, baseline,
 * maxW (shrinks to fit, then truncates), minSize, alpha}. Returns the drawn width.
 */
function text(ctx, str, x, y, o) {
  o = o || {};
  str = str == null ? '' : String(str);
  const f = fit(ctx, str, o.maxW, o.size || T.FS.body, o.weight, o.serif, o.minSize);
  ctx.font = font(f.size, o.weight, o.serif);
  const w = ctx.measureText(f.str).width;
  ctx.fillStyle = o.color || C.ink;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.baseline || 'middle';
  if (o.alpha != null) ctx.globalAlpha = o.alpha;
  ctx.fillText(f.str, x, y);
  if (o.alpha != null) ctx.globalAlpha = 1;
  return w;
}

/** Break text into lines no wider than maxW (CJK breaks anywhere). */
function wrap(ctx, str, maxW, size, weight, serif) {
  ctx.font = font(size, weight, serif);
  const lines = [];
  let line = '';
  const punctNoStart = '，。！？、；：）】」』”’》…,.!?;:)';
  Array.from(String(str || '')).forEach((ch) => {
    if (ch === '\n') {
      lines.push(line);
      line = '';
      return;
    }
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line) {
      if (punctNoStart.indexOf(ch) >= 0) {
        line = test;
        return;
      }
      lines.push(line);
      line = ch === ' ' ? '' : ch;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);
  return lines;
}

/** Wrapped paragraph; returns its height. maxLines truncates with an ellipsis. */
function paragraph(ctx, str, x, y, maxW, lineH, o) {
  o = o || {};
  const size = o.size || T.FS.body;
  let lines = wrap(ctx, str, maxW, size, o.weight, o.serif);
  if (o.maxLines && lines.length > o.maxLines) {
    lines = lines.slice(0, o.maxLines);
    let last = lines[o.maxLines - 1];
    while (last.length > 1 && measure(ctx, last + '…', size, o.weight, o.serif) > maxW) last = last.slice(0, -1);
    lines[o.maxLines - 1] = last + '…';
  }
  lines.forEach((ln, i) => {
    text(ctx, ln, o.align === 'center' ? x + maxW / 2 : x, y + lineH * i + lineH / 2, {
      size,
      weight: o.weight,
      serif: o.serif,
      color: o.color,
      align: o.align || 'left',
    });
  });
  return lines.length * lineH;
}

/** Lines a paragraph would take (for layout before drawing). */
function lineCount(ctx, str, maxW, size, weight, serif, maxLines) {
  const n = wrap(ctx, str, maxW, size, weight, serif).length;
  return maxLines ? Math.min(n, maxLines) : n;
}

// ------------------------------------------------------------ backgrounds

/** Newsprint: flat paper, nothing else (the cards carry the design). */
function paper(ctx, L) {
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, L.W, L.H);
}

/** Masthead double rule (thick over thin), the 知识小报 signature. */
function rule(ctx, x, y, w) {
  ctx.fillStyle = C.rule;
  ctx.fillRect(x, y, w, 2.5);
  ctx.fillRect(x, y + 5, w, 1);
}

// --------------------------------------------------------------- icons

function iconBack(ctx, x, y, size, color) {
  ctx.strokeStyle = color || C.ink;
  ctx.lineWidth = Math.max(2, size / 8);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x + size * 0.6, y - size / 2);
  ctx.lineTo(x + size * 0.1, y);
  ctx.lineTo(x + size * 0.6, y + size / 2);
  ctx.stroke();
}

function iconPlay(ctx, cx, cy, size, color, ring) {
  if (ring) {
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, size / 12);
    ctx.stroke();
  }
  const r = size * (ring ? 0.22 : 0.34);
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.7, cy - r * 1.1);
  ctx.lineTo(cx + r * 1.2, cy);
  ctx.lineTo(cx - r * 0.7, cy + r * 1.1);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function iconClose(ctx, cx, cy, size, color) {
  ctx.strokeStyle = color || C.ink;
  ctx.lineWidth = Math.max(2, size / 9);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - size / 2, cy - size / 2);
  ctx.lineTo(cx + size / 2, cy + size / 2);
  ctx.moveTo(cx + size / 2, cy - size / 2);
  ctx.lineTo(cx - size / 2, cy + size / 2);
  ctx.stroke();
}

function iconSpeaker(ctx, cx, cy, size, color, muted) {
  const h = size / 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - h, cy - h * 0.35);
  ctx.lineTo(cx - h * 0.45, cy - h * 0.35);
  ctx.lineTo(cx + h * 0.1, cy - h * 0.85);
  ctx.lineTo(cx + h * 0.1, cy + h * 0.85);
  ctx.lineTo(cx - h * 0.45, cy + h * 0.35);
  ctx.lineTo(cx - h, cy + h * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.8, size / 12);
  ctx.lineCap = 'round';
  if (muted) {
    ctx.beginPath();
    ctx.moveTo(cx + h * 0.4, cy - h * 0.45);
    ctx.lineTo(cx + h * 1.05, cy + h * 0.45);
    ctx.moveTo(cx + h * 1.05, cy - h * 0.45);
    ctx.lineTo(cx + h * 0.4, cy + h * 0.45);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(cx + h * 0.1, cy, h * 0.75, -0.9, 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + h * 0.1, cy, h * 1.2, -0.8, 0.8);
    ctx.stroke();
  }
}

function iconCheck(ctx, cx, cy, size, color, lw) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw || Math.max(2, size / 6);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.4, cy);
  ctx.lineTo(cx - size * 0.1, cy + size * 0.32);
  ctx.lineTo(cx + size * 0.45, cy - size * 0.32);
  ctx.stroke();
}

function iconCross(ctx, cx, cy, size, color, lw) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw || Math.max(2, size / 6);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.34, cy - size * 0.34);
  ctx.lineTo(cx + size * 0.34, cy + size * 0.34);
  ctx.moveTo(cx + size * 0.34, cy - size * 0.34);
  ctx.lineTo(cx - size * 0.34, cy + size * 0.34);
  ctx.stroke();
}

/** Solid triangle: dir 'up' or 'down'. */
function iconTri(ctx, cx, cy, size, color, dir) {
  const h = size / 2;
  const s = dir === 'down' ? 1 : -1;
  ctx.beginPath();
  ctx.moveTo(cx - h, cy + s * -h * 0.55);
  ctx.lineTo(cx + h, cy + s * -h * 0.55);
  ctx.lineTo(cx, cy + s * h * 0.65);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// --------------------------------------------------------------- buttons

/** Add a hit area grown to at least 48 x 48 around the centre of the box. */
function addTap(hits, L, id, x, y, w, h) {
  const min = T.MIN_TAP;
  if (w < min) {
    x -= (min - w) / 2;
    w = min;
  }
  if (h < min) {
    y -= (min - h) / 2;
    h = min;
  }
  hits.add(id, x, y, w, h);
}

/**
 * Button. o: {id, x, y, w, h, label, kind: primary|secondary|ghost|ad|danger,
 * disabled, sub, size, serif, icon:'play'}. Registers a hit area (grown to the
 * 48pt minimum). Ad buttons always show a play icon and the word 视频.
 */
function button(ctx, L, hits, o) {
  const { x, y, w, h } = o;
  const kind = o.kind || 'secondary';
  const r = Math.min(L.u(12), h / 2);
  ctx.save();
  if (o.disabled) ctx.globalAlpha = 0.5;
  let fg = C.ink;
  if (kind === 'primary') {
    ctx.shadowColor = 'rgba(80,30,20,0.28)';
    ctx.shadowOffsetY = L.hc ? 0 : 2;
    ctx.shadowBlur = L.hc ? 0 : 6;
    fillRR(ctx, x, y, w, h, r, C.seal);
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    fg = C.sealInk;
  } else if (kind === 'danger') {
    fillRR(ctx, x, y, w, h, r, C.card);
    strokeRR(ctx, x, y, w, h, r, C.seal, 2);
    fg = C.seal;
  } else if (kind === 'ad') {
    fillRR(ctx, x, y, w, h, r, C.card);
    ctx.setLineDash([L.u(6), L.u(4)]);
    strokeRR(ctx, x + 1, y + 1, w - 2, h - 2, r, C.adLine, 2);
    ctx.setLineDash([]);
    fg = C.ink;
  } else if (kind === 'ghost') {
    strokeRR(ctx, x, y, w, h, r, C.lineStrong, 1.5);
  } else {
    fillRR(ctx, x, y, w, h, r, C.card);
    strokeRR(ctx, x, y, w, h, r, C.lineStrong, 2);
  }
  const size = o.size || (kind === 'primary' ? T.FS.button : T.FS.bodyL);
  const serif = o.serif != null ? o.serif : kind === 'primary';
  const weight = kind === 'primary' ? 700 : 600;
  const icon = kind === 'ad' || o.icon === 'play' ? L.u(22) * L.k : 0;
  const iconW = icon ? icon + L.u(8) : 0;
  const maxW = w - L.u(16) - iconW;
  const f = fit(ctx, o.label, maxW, size, weight, serif);
  const tw = measure(ctx, f.str, f.size, weight, serif);
  const cx0 = x + w / 2 - (tw + iconW) / 2;
  const cy = y + h / 2 - (o.sub ? f.size * 0.45 : 0);
  if (icon) iconPlay(ctx, cx0 + icon / 2, cy, icon, kind === 'ad' ? C.adLine : fg, true);
  text(ctx, f.str, cx0 + iconW, cy, { size: f.size, weight, serif, color: fg });
  if (o.sub) text(ctx, o.sub, x + w / 2, y + h / 2 + f.size * 0.7, { size: T.FS.body, color: kind === 'primary' ? C.sealInk : C.sub, align: 'center', maxW: w - L.u(12) });
  ctx.restore();
  if (o.id && !o.disabled) addTap(hits, L, o.id, x, y, w, h);
  return { x, y, w, h };
}

/** Text-only link with a 48pt tap area. */
function link(ctx, L, hits, o) {
  const size = o.size || T.FS.body;
  const tw = measure(ctx, o.label, size, o.weight || 600, false);
  const iconW = o.icon ? L.u(24) * L.k : 0;
  const total = tw + iconW;
  const x = o.align === 'right' ? o.x - total : o.align === 'center' ? o.x - total / 2 : o.x;
  if (o.icon === 'speaker') iconSpeaker(ctx, x + L.u(10), o.y, L.u(20) * L.k, o.color || C.ink, o.muted);
  text(ctx, o.label, x + iconW, o.y, { size, weight: o.weight || 600, color: o.color || C.ink });
  if (o.underline) {
    ctx.fillStyle = o.color || C.ink;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(x + iconW, o.y + size * 0.62, tw, 1);
    ctx.globalAlpha = 1;
  }
  if (o.id) addTap(hits, L, o.id, x - L.u(8), o.y - T.MIN_TAP / 2, total + L.u(16), T.MIN_TAP);
  return { x, w: total };
}

// ----------------------------------------------------------------- marks

/** Card surface. */
function card(ctx, x, y, w, h, o) {
  o = o || {};
  const r = o.r != null ? o.r : 12;
  if (o.shadow && !T.MODE.highContrast) {
    ctx.save();
    ctx.shadowColor = 'rgba(40,36,28,0.14)';
    ctx.shadowOffsetY = 2;
    ctx.shadowBlur = 8;
    fillRR(ctx, x, y, w, h, r, o.fill || C.card);
    ctx.restore();
  } else fillRR(ctx, x, y, w, h, r, o.fill || C.card);
  strokeRR(ctx, x, y, w, h, r, o.stroke || (T.MODE.highContrast ? C.ink : C.line), o.lw || (T.MODE.highContrast ? 2 : 1.5));
}

/**
 * The 「比」 seal: a cinnabar disc with a paper-coloured 比. size = diameter.
 * wobble (-1..1) rotates it a little for the settle animation.
 */
function seal(ctx, cx, cy, size, o) {
  o = o || {};
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(((o.rotate == null ? -6 : o.rotate) * Math.PI) / 180);
  if (o.scale) ctx.scale(o.scale, o.scale);
  ctx.shadowColor = 'rgba(80,30,20,0.25)';
  ctx.shadowBlur = T.MODE.highContrast ? 0 : size * 0.12;
  ctx.shadowOffsetY = T.MODE.highContrast ? 0 : size * 0.04;
  fillRR(ctx, -size / 2, -size / 2, size, size, size * 0.2, C.seal);
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  strokeRR(ctx, -size * 0.43, -size * 0.43, size * 0.86, size * 0.86, size * 0.13, C.sealInk, Math.max(1.2, size / 30));
  text(ctx, o.char || '比', 0, size * 0.02, { size: size * 0.56, weight: 900, serif: true, color: C.sealInk, align: 'center' });
  ctx.restore();
}

/** Big square stamp (全部答对), calm: no flash. progress 0..1 settles it in. */
function stamp(ctx, cx, cy, w, h, label, o) {
  o = o || {};
  const p = o.progress == null ? 1 : Math.max(0, Math.min(1, o.progress));
  if (p <= 0) return;
  const k = p < 0.7 ? 1.12 - 0.12 * (p / 0.7) : 1;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(((o.rotate == null ? -5 : o.rotate) * Math.PI) / 180);
  ctx.scale(k, k);
  ctx.globalAlpha = Math.min(1, p / 0.4);
  strokeRR(ctx, -w / 2, -h / 2, w, h, h * 0.12, C.seal, Math.max(3, h / 14));
  strokeRR(ctx, -w / 2 + h * 0.1, -h / 2 + h * 0.1, w - h * 0.2, h - h * 0.2, h * 0.06, C.seal, 1.5);
  text(ctx, label, 0, 0, { size: h * 0.42, weight: 900, serif: true, color: C.seal, align: 'center', maxW: w - h * 0.4 });
  ctx.restore();
}

/**
 * Verdict pill: icon + text, never colour alone. Returns its width.
 * o: {h, size}. Text is 对 or 错 (spec 6.3).
 */
function verdictWidth(ctx, correct, o) {
  o = o || {};
  const h = o.h || 30 * T.MODE.k;
  const size = o.size || T.FS.bodyL;
  return h * 0.5 + measure(ctx, correct ? '对' : '错', size, 800, true) + h * 0.9;
}

function verdict(ctx, x, y, correct, o) {
  o = o || {};
  const h = o.h || 30 * T.MODE.k;
  const size = o.size || T.FS.bodyL;
  const label = correct ? '对' : '错';
  const color = correct ? C.good : C.bad;
  const w = verdictWidth(ctx, correct, o);
  const lw = T.MODE.highContrast ? 3 : 2;
  fillRR(ctx, x, y, w, h, h / 2, correct ? C.goodSoft : C.badSoft);
  strokeRR(ctx, x, y, w, h, h / 2, color, lw);
  const ic = h * 0.5;
  if (correct) iconCheck(ctx, x + h * 0.55, y + h / 2, ic, color, T.MODE.highContrast ? 3.2 : 2.4);
  else iconCross(ctx, x + h * 0.55, y + h / 2, ic, color, T.MODE.highContrast ? 3.2 : 2.4);
  text(ctx, label, x + h * 0.95, y + h / 2 + 1, { size, weight: 800, serif: true, color });
  return w;
}

/** Selectable chip (report reasons, category picker). Registers its hit area. */
function chip(ctx, L, hits, o) {
  const { x, y, w, h, label, selected } = o;
  const r = h / 2;
  if (selected) {
    fillRR(ctx, x, y, w, h, r, C.ink);
  } else {
    fillRR(ctx, x, y, w, h, r, C.card);
    strokeRR(ctx, x, y, w, h, r, C.lineStrong, 1.5);
  }
  const fg = selected ? C.paper : C.ink;
  let lx = x + w / 2;
  const f = fit(ctx, label, w - L.u(16) - (selected ? L.u(22) : 0), o.size || T.FS.bodyL, 600, false);
  const tw = measure(ctx, f.str, f.size, 600, false);
  if (selected) {
    lx += L.u(10);
    iconCheck(ctx, lx - tw / 2 - L.u(12), y + h / 2, L.u(14), fg, 2.2);
  }
  text(ctx, f.str, lx, y + h / 2 + 1, { size: f.size, weight: 600, color: fg, align: 'center' });
  if (o.id) addTap(hits, L, o.id, x, y, w, h);
}

function toggle(ctx, x, y, w, h, on) {
  fillRR(ctx, x, y, w, h, h / 2, on ? C.good : 'rgba(31,35,40,0.30)');
  if (T.MODE.highContrast) strokeRR(ctx, x, y, w, h, h / 2, C.ink, 2);
  ctx.beginPath();
  ctx.arc(on ? x + w - h / 2 : x + h / 2, y + h / 2, h / 2 - 3, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
}

/** Skeleton block with a gentle pulse (t = ms from the logic, optional). */
function skeleton(ctx, x, y, w, h, t, r) {
  const pulse = 0.75 + 0.25 * Math.sin((t || 0) / 380);
  ctx.save();
  ctx.globalAlpha = pulse;
  fillRR(ctx, x, y, w, h, r != null ? r : Math.min(8, h / 2), C.skeleton);
  ctx.restore();
}

/** Thin scroll indicator on the right edge of a viewport. */
function scrollbar(ctx, x, y, h, scroll, max) {
  if (!(max > 0)) return;
  const total = h + max;
  const bh = Math.max(24, h * (h / total));
  ctx.fillStyle = 'rgba(31,35,40,0.30)';
  ctx.fillRect(x - 3, y + (h - bh) * Math.min(1, Math.max(0, scroll / max)), 3, bh);
}

// ---------------------------------------------------------------- sheets

/**
 * Bottom sheet over a scrim. Registers 'sheet:close' (full screen: tap
 * outside) then 'sheet:body' (swallows taps) and a 48pt X. Returns geometry.
 * o: {h (px), title, closeId}
 */
function sheet(ctx, L, hits, o) {
  const closeId = o.closeId || 'sheet:close';
  ctx.fillStyle = C.scrim;
  ctx.fillRect(0, 0, L.W, L.H);
  hits.add(closeId, 0, 0, L.W, L.H);
  const w = Math.min(L.W, 560);
  const x = (L.W - w) / 2;
  const h = Math.min(o.h, L.H - L.navBottom);
  const y = L.H - h;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = T.MODE.highContrast ? 0 : 16;
  ctx.shadowOffsetY = -2;
  rr(ctx, x, y, w, h + 20, L.u(20));
  ctx.fillStyle = C.sheet;
  ctx.fill();
  ctx.restore();
  strokeRR(ctx, x, y, w, h + 20, L.u(20), T.MODE.highContrast ? C.ink : C.line, T.MODE.highContrast ? 2 : 1.5);
  hits.add('sheet:body', x, y, w, h);
  fillRR(ctx, L.cx - L.u(20), y + L.u(8), L.u(40), 4, 2, 'rgba(31,35,40,0.25)');
  const inner = { x: x + L.pad, y: y + L.u(20), w: w - 2 * L.pad, h: h - L.u(20), sheetX: x, sheetY: y, sheetW: w, sheetH: h };
  const titleY = y + L.u(36) + (L.large ? L.u(4) : 0);
  if (o.title) text(ctx, o.title, inner.x, titleY, { size: T.FS.title, weight: 800, serif: true, maxW: inner.w - L.u(56) });
  iconClose(ctx, x + w - L.pad - L.u(12), titleY, L.u(16), C.sub);
  hits.add(closeId, x + w - L.u(64), y + L.u(10), L.u(64), T.MIN_TAP + L.u(8));
  inner.top = y + L.u(60) + (L.large ? L.u(8) : 0);
  inner.bottom = L.bottomEdge - L.bottomPad;
  return inner;
}

/** A context that only measures text (for sizing content before drawing it). */
function measureCtx(ctx) {
  const noop = function () {};
  return new Proxy(
    {},
    {
      get(t, p) {
        if (p === 'measureText') return (s) => ctx.measureText(s);
        if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop: noop });
        if (p === 'font') return ctx.font;
        return noop;
      },
      set(t, p, v) {
        if (p === 'font') ctx.font = v;
        return true;
      },
    }
  );
}

/**
 * Scrollable region. drawFn(ctx, hits, y0) draws the content starting at y0
 * and returns its height. Registers `id` over the rect when it overflows,
 * clips tap areas to the rect, and records hits.scrollMax[id].
 */
function scrollRegion(ctx, hits, id, rect, scrollY, drawFn) {
  const natural = drawFn(measureCtx(ctx), new Hits(), rect.y);
  const max = Math.max(0, Math.ceil(natural - rect.h));
  const sy = clamp(typeof scrollY === 'number' ? scrollY : 0, 0, max);
  hits.scrollMax[id] = max;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  if (max > 0) hits.add(id, rect.x, rect.y, rect.w, rect.h);
  hits.beginScroll(rect, -sy);
  ctx.translate(0, -sy);
  drawFn(ctx, hits, rect.y);
  hits.endScroll();
  ctx.restore();
  scrollbar(ctx, rect.x + rect.w, rect.y, rect.h, sy, max);
  return { natural, max, sy };
}

/** Back button level with the capsule. */
function backButton(ctx, L, hits, label, id) {
  const cy = L.back.y + L.back.h / 2;
  iconBack(ctx, L.x0, cy, L.u(14), C.ink);
  text(ctx, label || '返回', L.x0 + L.u(20), cy, { size: T.FS.bodyL, weight: 700, color: C.ink });
  hits.add(id || 'back', L.back.x, L.back.y, L.back.w, L.back.h);
}

module.exports = {
  start,
  font,
  rr,
  fillRR,
  strokeRR,
  measure,
  fit,
  text,
  wrap,
  paragraph,
  lineCount,
  paper,
  rule,
  iconBack,
  iconPlay,
  iconClose,
  iconSpeaker,
  iconCheck,
  iconCross,
  iconTri,
  icons,
  button,
  addTap,
  link,
  card,
  seal,
  stamp,
  verdict,
  verdictWidth,
  chip,
  toggle,
  skeleton,
  scrollbar,
  measureCtx,
  scrollRegion,
  sheet,
  backButton,
};
