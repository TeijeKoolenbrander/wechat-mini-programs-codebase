/**
 * Shared drawing widgets. Pure canvas 2D calls (a WeChat-safe subset: no
 * roundRect, no letterSpacing, no filter, no ellipse). No wx, no state, no
 * timers. Colours and sizes come from theme.COLORS / theme.FS at call time so
 * the display modes (large text, high contrast) apply everywhere.
 */

const T = require('./theme');
const { Hits, clamp } = require('./layout');
const C = T.COLORS;

// ---------------------------------------------------------------- basics

function font(size, weight, round) {
  return (weight || 400) + ' ' + Math.round(size * 10) / 10 + 'px ' + (round ? T.ROUND : T.SANS);
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

function measure(ctx, str, size, weight, round) {
  ctx.font = font(size, weight, round);
  return ctx.measureText(String(str)).width;
}

/**
 * One line of text. o: {size, weight, color, align, round (display face),
 * baseline, maxW (shrinks to fit down to minSize, then truncates with …),
 * minSize (default FS.small), alpha}. Returns the drawn width.
 */
function text(ctx, str, x, y, o) {
  o = o || {};
  str = str == null ? '' : String(str);
  let size = o.size || T.FS.body;
  const min = o.minSize || T.FS.small;
  ctx.font = font(size, o.weight, o.round);
  let w = ctx.measureText(str).width;
  if (o.maxW && w > o.maxW) {
    size = Math.max(min, size * (o.maxW / w));
    ctx.font = font(size, o.weight, o.round);
    w = ctx.measureText(str).width;
    if (w > o.maxW) {
      let chars = Array.from(str);
      while (chars.length > 1 && ctx.measureText(chars.join('') + '…').width > o.maxW) chars.pop();
      str = chars.join('') + '…';
      w = ctx.measureText(str).width;
    }
  }
  ctx.fillStyle = o.color || C.ink;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.baseline || 'middle';
  if (o.alpha != null) ctx.globalAlpha = o.alpha;
  ctx.fillText(str, x, y);
  if (o.alpha != null) ctx.globalAlpha = 1;
  return w;
}

/** Break text into lines no wider than maxW (CJK breaks anywhere). */
function wrap(ctx, str, maxW, size, weight, round) {
  ctx.font = font(size, weight, round);
  const lines = [];
  let line = '';
  const noStart = '，。！？、；：）】」』”’》…,.!?;:)~';
  // units: runs of ASCII letters/digits/slashes stay together (never "3" / "/6"), CJK breaks anywhere
  const units = String(str == null ? '' : str).match(/[A-Za-z0-9\/:.%'-]+|[\s\S]/g) || [];
  units.forEach((ch) => {
    if (ch === '\n') {
      lines.push(line);
      line = '';
      return;
    }
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line) {
      if (ch.length === 1 && noStart.indexOf(ch) >= 0) {
        line = test;
        return;
      }
      lines.push(line);
      line = ch === ' ' ? '' : ch;
    } else line = test;
  });
  if (line || !lines.length) lines.push(line);
  return lines;
}

/** Wrapped paragraph; returns its height. maxLines truncates with an ellipsis. */
function paragraph(ctx, str, x, y, maxW, lineH, o) {
  o = o || {};
  const size = o.size || T.FS.body;
  let lines = wrap(ctx, str, maxW, size, o.weight, o.round);
  if (o.maxLines && lines.length > o.maxLines) {
    lines = lines.slice(0, o.maxLines);
    let last = Array.from(lines[o.maxLines - 1]);
    while (last.length > 1 && measure(ctx, last.join('') + '…', size, o.weight, o.round) > maxW) last.pop();
    lines[o.maxLines - 1] = last.join('') + '…';
  }
  lines.forEach((ln, i) => {
    text(ctx, ln, o.align === 'center' ? x + maxW / 2 : x, y + lineH * i + lineH / 2, { size, weight: o.weight, round: o.round, color: o.color, align: o.align || 'left' });
  });
  return lines.length * lineH;
}

/** Height a paragraph would take (no drawing). */
function paragraphH(ctx, str, maxW, lineH, o) {
  o = o || {};
  const n = wrap(ctx, str, maxW, o.size || T.FS.body, o.weight, o.round).length;
  return Math.min(n, o.maxLines || n) * lineH;
}

function lineHeight(L, size) {
  return Math.round(size * 1.45);
}

/** Border width: heavier in high contrast. */
function bw() {
  return T.MODE.highContrast ? 3 : 2;
}

// ------------------------------------------------------------ backgrounds

/** Paper: off-white, a faint dot grid and a notebook margin line. High contrast: plain white. */
function paper(ctx, L) {
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, L.W, L.H);
  if (T.MODE.highContrast) return;
  const step = L.u(22);
  ctx.fillStyle = C.dot;
  ctx.beginPath();
  for (let yy = L.navBottom + step / 2; yy < L.H; yy += step) {
    for (let xx = step / 2; xx < L.W; xx += step) ctx.rect(xx, yy, 2, 2);
  }
  ctx.fill();
}

/** Sticker surface: offset ink shadow, fill, ink border. o: {fill, off, border, lw, noShadow, dashed} */
function sticker(ctx, x, y, w, h, r, o) {
  o = o || {};
  const off = o.noShadow ? 0 : o.off != null ? o.off : 3;
  if (off) fillRR(ctx, x, y + off, w, h, r, o.shadow || C.lineStrong);
  fillRR(ctx, x, y, w, h, r, o.fill || C.card);
  if (o.dashed) ctx.setLineDash([6, 4]);
  strokeRR(ctx, x, y, w, h, r, o.border || C.lineStrong, o.lw || bw());
  if (o.dashed) ctx.setLineDash([]);
}

/** A white card on the wall. */
function card(ctx, x, y, w, h, o) {
  o = o || {};
  sticker(ctx, x, y, w, h, o.r != null ? o.r : 14, o);
}

// --------------------------------------------------------------- icons

function iconBack(ctx, x, y, size, color) {
  ctx.strokeStyle = color || C.ink;
  ctx.lineWidth = Math.max(2.5, size / 6);
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
    ctx.lineWidth = Math.max(1.8, size / 11);
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
  ctx.lineWidth = Math.max(2.4, size / 8);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - size / 2, cy - size / 2);
  ctx.lineTo(cx + size / 2, cy + size / 2);
  ctx.moveTo(cx + size / 2, cy - size / 2);
  ctx.lineTo(cx - size / 2, cy + size / 2);
  ctx.stroke();
}

function iconCheck(ctx, cx, cy, size, color, lw) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw || Math.max(2.4, size / 5);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.4, cy);
  ctx.lineTo(cx - size * 0.1, cy + size * 0.32);
  ctx.lineTo(cx + size * 0.45, cy - size * 0.32);
  ctx.stroke();
}

function iconClock(ctx, cx, cy, size, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, size / 8);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - size * 0.28);
  ctx.lineTo(cx, cy);
  ctx.lineTo(cx + size * 0.2, cy + size * 0.12);
  ctx.stroke();
}

function iconUndo(ctx, cx, cy, size, color) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2.2, size / 8);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx + size * 0.05, cy + size * 0.05, size * 0.34, Math.PI * 1.1, Math.PI * 2.15);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.42, cy - size * 0.22);
  ctx.lineTo(cx - size * 0.12, cy - size * 0.24);
  ctx.lineTo(cx - size * 0.3, cy + size * 0.08);
  ctx.closePath();
  ctx.fill();
}

function iconTrash(ctx, cx, cy, size, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, size / 9);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const w = size * 0.56;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy - size * 0.2);
  ctx.lineTo(cx - w / 2 + size * 0.05, cy + size * 0.42);
  ctx.lineTo(cx + w / 2 - size * 0.05, cy + size * 0.42);
  ctx.lineTo(cx + w / 2, cy - size * 0.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.42, cy - size * 0.2);
  ctx.lineTo(cx + size * 0.42, cy - size * 0.2);
  ctx.moveTo(cx - size * 0.14, cy - size * 0.2);
  ctx.lineTo(cx - size * 0.1, cy - size * 0.42);
  ctx.lineTo(cx + size * 0.1, cy - size * 0.42);
  ctx.lineTo(cx + size * 0.14, cy - size * 0.2);
  ctx.stroke();
}

function iconFlag(ctx, cx, cy, size, color) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, size / 8);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.3, cy + size * 0.5);
  ctx.lineTo(cx - size * 0.3, cy - size * 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.3, cy - size * 0.5);
  ctx.lineTo(cx + size * 0.45, cy - size * 0.3);
  ctx.lineTo(cx - size * 0.3, cy - size * 0.02);
  ctx.closePath();
  ctx.fill();
}

/** Laugh stamp face: a round smile. on = filled yellow (toggled), else outline. */
function iconLaugh(ctx, cx, cy, size, on) {
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = on ? C.orange : C.card;
  ctx.fill();
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = Math.max(1.8, size / 11);
  ctx.stroke();
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(cx - size * 0.17, cy - size * 0.1, size * 0.07, 0, Math.PI * 2);
  ctx.arc(cx + size * 0.17, cy - size * 0.1, size * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.24, cy + size * 0.06);
  ctx.quadraticCurveTo(cx, cy + size * 0.4, cx + size * 0.24, cy + size * 0.06);
  ctx.closePath();
  ctx.fillStyle = C.ink;
  ctx.fill();
}

/** Round status icon for moderation states: pending (clock), passed (check), blocked (cross), void (dash). */
function iconStatus(ctx, cx, cy, size, kind) {
  const col = kind === 'passed' ? C.good : kind === 'pending' ? C.orangeText : kind === 'blocked' ? C.zhuText : C.sub;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = C.card;
  ctx.fill();
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(2, size / 9);
  ctx.stroke();
  if (kind === 'passed') iconCheck(ctx, cx, cy, size * 0.5, col, Math.max(2.2, size / 8));
  else if (kind === 'blocked') iconClose(ctx, cx, cy, size * 0.36, col);
  else if (kind === 'pending') {
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(2, size / 9);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy - size * 0.24);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + size * 0.16, cy + size * 0.1);
    ctx.stroke();
  } else {
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(2, size / 9);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.22, cy);
    ctx.lineTo(cx + size * 0.22, cy);
    ctx.stroke();
  }
}

// --------------------------------------------------------------- doodles

function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * The mascot: a paintbrush that is also a relay baton. Drawn along its axis
 * at `angle` (radians, 0 = pointing right), centred on (cx, cy), `len` long.
 * Bristle tip 朱, ferrule blue, handle orange with a band.
 */
function brushBaton(ctx, cx, cy, len, angle) {
  const th = len * 0.16; // handle thickness
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  const lw = Math.max(1.6, Math.min(3, len / 40));
  // handle
  fillRR(ctx, -len / 2, -th / 2, len * 0.62, th, th / 2, C.orange);
  strokeRR(ctx, -len / 2, -th / 2, len * 0.62, th, th / 2, C.ink, lw);
  // band (the baton stripe)
  ctx.fillStyle = C.card;
  ctx.fillRect(-len / 2 + len * 0.16, -th / 2 + lw * 0.6, len * 0.07, th - lw * 1.2);
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = lw * 0.8;
  ctx.strokeRect(-len / 2 + len * 0.16, -th / 2 + lw * 0.6, len * 0.07, th - lw * 1.2);
  // ferrule
  const fx = len * 0.12;
  fillRR(ctx, fx, -th * 0.62, len * 0.14, th * 1.24, th * 0.2, C.blue);
  strokeRR(ctx, fx, -th * 0.62, len * 0.14, th * 1.24, th * 0.2, C.ink, lw);
  // bristles: a teardrop
  const bx = fx + len * 0.14;
  ctx.beginPath();
  ctx.moveTo(bx, -th * 0.6);
  ctx.quadraticCurveTo(bx + len * 0.16, -th * 0.7, bx + len * 0.24, 0);
  ctx.quadraticCurveTo(bx + len * 0.16, th * 0.7, bx, th * 0.6);
  ctx.closePath();
  ctx.fillStyle = C.zhu;
  ctx.fill();
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

/** A hand-drawn wobbly arrow pointing down from (cx, y1) to (cx, y2). */
function arrowDown(ctx, cx, y1, y2, color, seed) {
  const h = y2 - y1;
  const j = (hash((seed || 1) * 3) - 0.5) * 10;
  ctx.strokeStyle = color || C.ink;
  ctx.lineWidth = Math.max(2.4, bw());
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - j * 0.2, y1);
  ctx.bezierCurveTo(cx + j, y1 + h * 0.3, cx - j, y1 + h * 0.6, cx, y2 - 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 8, y2 - 11);
  ctx.lineTo(cx, y2);
  ctx.lineTo(cx + 8, y2 - 11);
  ctx.stroke();
}

/** A wavy underline under a title. */
function squiggle(ctx, x, y, w, color) {
  const n = Math.max(2, Math.round(w / 14));
  const step = w / n;
  ctx.strokeStyle = color || C.zhu;
  ctx.lineWidth = Math.max(3, bw() + 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 0; i < n; i++) ctx.quadraticCurveTo(x + step * (i + 0.5), y + (i % 2 ? 5 : -5), x + step * (i + 1), y);
  ctx.stroke();
}

/** Piece of washi tape across the top of a card (rotated slightly). */
function tape(ctx, cx, y, w, h, angle) {
  ctx.save();
  ctx.translate(cx, y);
  ctx.rotate(angle || 0);
  ctx.fillStyle = C.tape;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  if (T.MODE.highContrast) {
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
  }
  ctx.restore();
}

/** Progress dots for a chain: n of `total` filled; filled dots carry a tick so it is not colour alone. */
function chainDots(ctx, cx, cy, passed, total, size) {
  const gap = size * 0.55;
  const w = total * size + (total - 1) * gap;
  let x = cx - w / 2 + size / 2;
  for (let i = 0; i < total; i++) {
    const done = i < passed;
    ctx.beginPath();
    ctx.arc(x, cy, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = done ? (i % 2 === 0 ? C.zhu : C.blue) : C.card;
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = bw();
    ctx.stroke();
    if (done) iconCheck(ctx, x, cy, size * 0.5, C.onZhu, Math.max(2, size / 9));
    x += size + gap;
  }
}

// --------------------------------------------------------------- buttons

/** Standard button height (pt): large text mode raises it to 60. */
function btnH(L, small) {
  const base = L.u(L.compact ? 50 : 54);
  const h = T.MODE.largeText ? Math.max(base, 60) : base;
  return small ? Math.max(T.MIN_TAP, h - 6) : h;
}

/**
 * Button. o: {id, x, y, w, h, label, kind: primary|secondary|ghost|ad|danger,
 * disabled, sub (second line inside the button), size, icon: 'play'}.
 * Registers a hit area of at least 48 x 48 around its centre (not for disabled
 * buttons). Ad buttons always show a play icon and the word 视频 or ▶.
 */
function button(ctx, L, hits, o) {
  const { x, y, w, h } = o;
  const kind = o.kind || 'secondary';
  const r = Math.min(L.u(14), h / 2);
  let fg = C.ink;
  const dis = !!o.disabled;
  if (dis) {
    fillRR(ctx, x, y, w, h, r, C.disabledFill);
    if (T.MODE.highContrast) strokeRR(ctx, x, y, w, h, r, C.disabledInk, 2);
    else {
      ctx.setLineDash([5, 4]);
      strokeRR(ctx, x, y, w, h, r, C.disabledInk, 1.5);
      ctx.setLineDash([]);
    }
    fg = C.disabledInk;
  } else if (kind === 'primary') {
    sticker(ctx, x, y, w, h, r, { fill: C.zhu });
    fg = C.onZhu;
  } else if (kind === 'danger') {
    sticker(ctx, x, y, w, h, r, { fill: C.card, border: C.zhuText });
    fg = C.zhuText;
  } else if (kind === 'ad') {
    sticker(ctx, x, y, w, h, r, { fill: C.orangeSoft === '#FFFFFF' ? C.card : C.card, off: 2 });
    fillRR(ctx, x + 3, y + 3, w - 6, h - 6, Math.max(2, r - 3), C.orangeSoft);
    strokeRR(ctx, x, y, w, h, r, C.ink, bw());
    fg = C.ink;
  } else if (kind === 'ghost') {
    strokeRR(ctx, x, y, w, h, r, C.lineStrong, 1.5);
  } else {
    sticker(ctx, x, y, w, h, r, { fill: C.card });
  }
  const size = o.size || (kind === 'primary' ? T.FS.button : T.FS.bodyL);
  const weight = kind === 'primary' ? 800 : 700;
  const round = kind === 'primary';
  const icon = kind === 'ad' || o.icon === 'play' ? Math.round(size * 1.15) : 0;
  const iconW = icon ? icon + L.u(8) : 0;
  const maxW = w - L.u(20) - iconW;
  let tw = measure(ctx, o.label, size, weight, round);
  const fit = tw > maxW ? Math.max(T.FS.small, size * (maxW / tw)) : size;
  tw = measure(ctx, o.label, fit, weight, round);
  const cy = o.sub ? y + h * 0.37 : y + h / 2 + (dis ? 0 : -1);
  const cx0 = x + w / 2 - (tw + iconW) / 2;
  if (icon) iconPlay(ctx, cx0 + icon / 2, cy, icon, dis ? C.disabledInk : kind === 'ad' ? C.orangeText : fg, true);
  text(ctx, o.label, cx0 + iconW, cy, { size: fit, weight, round, color: fg, maxW: maxW - iconW + 2 });
  if (o.sub) text(ctx, o.sub, x + w / 2, y + h * 0.75, { size: T.FS.small, weight: 600, color: dis ? C.disabledInk : kind === 'primary' ? C.onZhu : C.sub, align: 'center', maxW: w - L.u(16) });
  if (o.id && !dis) addTap(hits, o.id, x, y, w, h);
  return { x, y, w, h };
}

/** Add a hit area grown to at least 48 x 48 around the centre of the box. */
function addTap(hits, id, x, y, w, h) {
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

/** Text link with a 48pt tap area. o: {id, x, y(centre), label, align, color, size, underline, icon} */
function link(ctx, hits, o) {
  const size = o.size || T.FS.body;
  const tw = measure(ctx, o.label, size, 700, false);
  const iconW = o.icon ? size + 6 : 0;
  const total = tw + iconW;
  const x = o.align === 'right' ? o.x - total : o.align === 'center' ? o.x - total / 2 : o.x;
  const col = o.color || C.blueText;
  if (o.icon === 'flag') iconFlag(ctx, x + size * 0.45, o.y, size * 0.9, col);
  text(ctx, o.label, x + iconW, o.y, { size, weight: 700, color: col });
  if (o.underline !== false) {
    ctx.fillStyle = col;
    ctx.fillRect(x + iconW, o.y + size * 0.62, tw, 1.5);
  }
  if (o.id) addTap(hits, o.id, x - 8, o.minTop != null ? Math.max(o.y - T.MIN_TAP / 2, o.minTop) : o.y - T.MIN_TAP / 2, total + 16, T.MIN_TAP);
  return { x, w: total };
}

/** Small tag/chip. Returns its width. o: {fill, color, border, size, h} */
function chip(ctx, x, y, label, o) {
  o = o || {};
  const size = o.size || T.FS.small;
  const h = o.h || Math.round(size * 1.65);
  const tw = measure(ctx, label, size, 700, false);
  const w = tw + 18;
  fillRR(ctx, x, y, w, h, h / 2, o.fill || C.orangeSoft);
  strokeRR(ctx, x, y, w, h, h / 2, o.border || o.color || C.ink, 1.5);
  text(ctx, label, x + w / 2, y + h / 2 + 0.5, { size, weight: 700, color: o.color || C.ink, align: 'center' });
  return w;
}

/** On/off switch drawn with a text state so it is never colour alone. */
function toggle(ctx, x, y, w, h, on) {
  fillRR(ctx, x, y, w, h, h / 2, on ? C.good : C.disabledFill);
  strokeRR(ctx, x, y, w, h, h / 2, C.ink, bw());
  ctx.beginPath();
  ctx.arc(on ? x + w - h / 2 : x + h / 2, y + h / 2, h / 2 - 5, 0, Math.PI * 2);
  ctx.fillStyle = on ? C.card : C.card;
  ctx.fill();
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** Skeleton block with a gentle pulse (t = ms from the logic, optional). */
function skeleton(ctx, x, y, w, h, t, r) {
  const pulse = 0.7 + 0.3 * Math.sin((t || 0) / 380);
  ctx.save();
  ctx.globalAlpha = pulse;
  fillRR(ctx, x, y, w, h, r != null ? r : Math.min(8, h / 2), C.skeleton);
  ctx.restore();
}

/** Status stamp (rotated). kind: pending|passed|blocked|void; label from the logic. Icon + text, never colour alone. */
function stamp(ctx, cx, cy, kind, label, rot) {
  const size = T.FS.bodyL;
  const tw = measure(ctx, label, size, 800, true);
  const w = tw + size * 2.1;
  const h = size * 2;
  const col = kind === 'passed' ? C.good : kind === 'pending' ? C.orangeText : kind === 'blocked' ? C.zhuText : C.sub;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(((rot == null ? -4 : rot) * Math.PI) / 180);
  fillRR(ctx, -w / 2, -h / 2, w, h, h * 0.3, C.card);
  strokeRR(ctx, -w / 2, -h / 2, w, h, h * 0.3, col, 3);
  iconStatus(ctx, -w / 2 + size * 1.0, 0, size * 1.1, kind);
  text(ctx, label, -w / 2 + size * 1.75, 1, { size, weight: 800, round: true, color: col });
  ctx.restore();
  return { w, h };
}

// ---------------------------------------------------------------- sheets

/**
 * Bottom sheet over a scrim. Registers 'sheet:close' (outside tap and the X)
 * and 'sheet:body'. Returns inner geometry {x,y,w,h, top, bottom}.
 * o: {h (px), title}
 */
function sheet(ctx, L, hits, o) {
  ctx.fillStyle = C.scrim;
  ctx.fillRect(0, 0, L.W, L.H);
  hits.add('sheet:close', 0, 0, L.W, L.H);
  const w = Math.min(L.W, 560);
  const x = (L.W - w) / 2;
  const h = Math.min(o.h, L.H - L.navBottom);
  const y = L.H - h;
  rr(ctx, x, y, w, h + 24, L.u(22));
  ctx.fillStyle = C.sheet;
  ctx.fill();
  strokeRR(ctx, x, y, w, h + 24, L.u(22), C.ink, bw());
  hits.add('sheet:body', x, y, w, h);
  fillRR(ctx, L.cx - L.u(20), y + L.u(8), L.u(40), 5, 2.5, C.line === '#000000' ? '#000000' : 'rgba(30,27,24,0.3)');
  const inner = { x: x + L.pad, y: y + L.u(20), w: w - 2 * L.pad, h: h - L.u(20), sheetX: x, sheetY: y, sheetW: w, sheetH: h };
  if (o.title) text(ctx, o.title, inner.x, y + L.u(38), { size: T.FS.title, weight: 800, round: true, maxW: inner.w - L.u(56) });
  iconClose(ctx, x + w - L.pad - L.u(12), y + L.u(38), L.u(16), C.sub);
  hits.add('sheet:close', x + w - L.u(64), y + L.u(12), L.u(64), T.MIN_TAP);
  inner.top = y + L.u(62);
  inner.bottom = L.bottomEdge - L.bottomPad;
  return inner;
}

/** "‹ 返回" level with the capsule; tap area at least 48 tall. */
function backButton(ctx, L, hits, label, id) {
  const cy = L.navMidY;
  iconBack(ctx, L.x0, cy, L.u(14), C.ink);
  text(ctx, label || '返回', L.x0 + L.u(22), cy, { size: T.FS.bodyL, weight: 700, color: C.ink });
  hits.add(id || 'back', L.back.x, L.back.y, L.back.w, L.back.h);
}

// ------------------------------------------------------------- scrolling

const NOOPS = ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'arcTo', 'arc', 'closePath', 'fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'translate', 'scale', 'rotate', 'clip', 'rect', 'setLineDash', 'drawImage', 'quadraticCurveTo', 'bezierCurveTo', 'setTransform', 'transform', 'strokeText'];

/** A context that measures text like `real` but draws nothing (for measuring content height). */
function dryCtx(real) {
  const d = { globalAlpha: 1, textAlign: 'left', textBaseline: 'middle', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter' };
  NOOPS.forEach((n) => (d[n] = function () {}));
  d.createLinearGradient = () => ({ addColorStop() {} });
  d.measureText = (s) => real.measureText(s);
  Object.defineProperty(d, 'font', {
    get() {
      return real.font;
    },
    set(v) {
      real.font = v;
    },
  });
  return d;
}

/**
 * Scrollable region. content(ctx, hits, y0) draws from y0 and returns its
 * height. clip = {x,y,w,h} (use the full width so card shadows are not cut).
 * Records hits.scrollMax[id]. opts.center vertically centres short content.
 * Returns {contentH, max, offset}.
 */
function scrollView(ctx, hits, id, clip, scrollY, content, opts) {
  opts = opts || {};
  const dry = new Hits();
  const contentH = content(dryCtx(ctx), dry, clip.y);
  const max = Math.max(0, Math.ceil(contentH - clip.h));
  hits.scrollMax[id] = max;
  const off = clamp(scrollY || 0, 0, max);
  const y0 = clip.y + (opts.center && max === 0 ? Math.max(0, (clip.h - contentH) / 2) : 0);
  ctx.save();
  ctx.beginPath();
  ctx.rect(clip.x, clip.y, clip.w, clip.h);
  ctx.clip();
  ctx.translate(0, -off);
  hits.beginScroll(clip, -off);
  content(ctx, hits, y0);
  hits.endScroll();
  ctx.restore();
  if (max > 0) {
    // scroll thumb
    const trackH = clip.h - 12;
    const th = Math.max(28, (clip.h / contentH) * trackH);
    const ty = clip.y + 6 + (off / max) * (trackH - th);
    fillRR(ctx, clip.x + clip.w - 6, ty, 4, th, 2, 'rgba(30,27,24,0.35)');
  }
  return { contentH, max, offset: off };
}

module.exports = {
  font,
  rr,
  fillRR,
  strokeRR,
  measure,
  text,
  wrap,
  paragraph,
  paragraphH,
  lineHeight,
  bw,
  paper,
  sticker,
  card,
  iconBack,
  iconPlay,
  iconClose,
  iconCheck,
  iconClock,
  iconUndo,
  iconTrash,
  iconFlag,
  iconLaugh,
  iconStatus,
  hash,
  brushBaton,
  arrowDown,
  squiggle,
  tape,
  chainDots,
  btnH,
  button,
  addTap,
  link,
  chip,
  toggle,
  skeleton,
  stamp,
  sheet,
  backButton,
  dryCtx,
  scrollView,
};
