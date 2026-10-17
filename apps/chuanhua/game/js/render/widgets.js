/**
 * Shared drawing widgets (patterns copied from 点将台, restyled as the 传画接龙 doodle wall). Pure canvas 2D calls, a
 * WeChat-safe subset: no roundRect, no letterSpacing, no filter. No wx, no state, no timers. Colours and sizes come
 * from the live tokens in theme.js, so every widget follows the large-text and high-contrast modes.
 */

const T = require('./theme');
const C = T.COLORS;

// ---------------------------------------------------------------- basics

function font(size, weight) {
  return (weight || 400) + ' ' + Math.round(size * 10) / 10 + 'px ' + T.SANS;
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

/**
 * One line of text. o: {size, weight, color, align, baseline, maxW (shrinks to fit, never below minSize; truncates with
 * an ellipsis if it still does not fit), minSize, alpha}. Returns the drawn width.
 */
function text(ctx, str, x, y, o) {
  o = o || {};
  str = str == null ? '' : String(str);
  let size = o.size || T.FS.body;
  ctx.font = font(size, o.weight);
  let w = ctx.measureText(str).width;
  if (o.maxW && w > o.maxW) {
    const min = o.minSize || T.FS.body;
    size = Math.max(min, size * (o.maxW / w));
    ctx.font = font(size, o.weight);
    w = ctx.measureText(str).width;
    if (w > o.maxW) {
      const chars = Array.from(str);
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

function measure(ctx, str, size, weight) {
  ctx.font = font(size, weight);
  return ctx.measureText(String(str)).width;
}

/**
 * Break text into lines no wider than maxW (CJK breaks anywhere; a run of ASCII letters, digits and : . / % + - _ such as
 * "20:14" or "3/6" is never split unless it alone is wider than the line; closing punctuation never starts a line).
 */
function wrap(ctx, str, maxW, size, weight) {
  ctx.font = font(size, weight);
  const lines = [];
  let line = '';
  const noStart = '，。！？、；：）】」』”’》…,.!?;:)';
  const tokens = [];
  let word = '';
  Array.from(String(str || '')).forEach((ch) => {
    if (/[A-Za-z0-9:./%+\-_]/.test(ch)) {
      word += ch;
      return;
    }
    if (word) tokens.push(word);
    word = '';
    tokens.push(ch);
  });
  if (word) tokens.push(word);
  // a token wider than a whole line is broken by character
  const units = [];
  tokens.forEach((t) => {
    if (t.length > 1 && ctx.measureText(t).width > maxW) Array.from(t).forEach((c) => units.push(c));
    else units.push(t);
  });
  units.forEach((tok) => {
    if (tok === '\n') {
      lines.push(line);
      line = '';
      return;
    }
    const t = line + tok;
    if (ctx.measureText(t).width > maxW && line) {
      if (noStart.indexOf(tok) >= 0 && Array.from(line).length > 1) {
        const chars = Array.from(line);
        let carry = '';
        while (chars.length > 1 && noStart.indexOf(chars[chars.length - 1]) >= 0) carry = chars.pop() + carry;
        carry = chars.pop() + carry;
        lines.push(chars.join(''));
        line = carry + tok;
        return;
      }
      lines.push(line);
      line = tok === ' ' ? '' : tok;
    } else {
      line = t;
    }
  });
  if (line) lines.push(line);
  return lines;
}

/** wrap() for centred text: the narrowest width that keeps the same line count, so no one-character last line. */
function wrapBalanced(ctx, str, maxW, size, weight) {
  const base = wrap(ctx, str, maxW, size, weight);
  if (base.length < 2) return base;
  let lo = maxW * 0.5;
  let hi = maxW;
  for (let i = 0; i < 9; i++) {
    const mid = (lo + hi) / 2;
    if (wrap(ctx, str, mid, size, weight).length <= base.length) hi = mid;
    else lo = mid;
  }
  return wrap(ctx, str, hi, size, weight);
}

/** Wrapped paragraph; returns its height. maxLines truncates with an ellipsis. */
function paragraph(ctx, str, x, y, maxW, lineH, o) {
  o = o || {};
  const size = o.size || T.FS.body;
  let lines = wrap(ctx, str, maxW, size, o.weight);
  if (o.maxLines && lines.length > o.maxLines) {
    lines = lines.slice(0, o.maxLines);
    const chars = Array.from(lines[o.maxLines - 1]);
    while (chars.length > 1 && measure(ctx, chars.join('') + '…', size, o.weight) > maxW) chars.pop();
    lines[o.maxLines - 1] = chars.join('') + '…';
  }
  lines.forEach((ln, i) => {
    text(ctx, ln, o.align === 'center' ? x + maxW / 2 : x, y + lineH * i + lineH / 2, { size, weight: o.weight, color: o.color, align: o.align || 'left' });
  });
  return lines.length * lineH;
}

/** Height a wrapped paragraph will take. */
function paragraphH(ctx, str, maxW, lineH, o) {
  o = o || {};
  const n = wrap(ctx, str, maxW, o.size || T.FS.body, o.weight).length;
  return (o.maxLines ? Math.min(n, o.maxLines) : n) * lineH;
}

// ------------------------------------------------------------ backgrounds

/** Paper background; high contrast is plain white. */
function paper(ctx, L) {
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, L.W, L.H);
  if (T.isHC()) return;
  // a faint dotted margin line, like a notebook page, kept out of the content column
  ctx.fillStyle = 'rgba(30,27,24,0.05)';
  for (let y = L.navBottom + 10; y < L.H - 6; y += 22) ctx.fillRect(4, y, 2, 2);
}

// --------------------------------------------------------------- icons

function stroked(ctx, color, w) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function iconBack(ctx, x, y, size, color) {
  stroked(ctx, color || C.ink, Math.max(2.4, size / 7));
  ctx.beginPath();
  ctx.moveTo(x + size * 0.6, y - size / 2);
  ctx.lineTo(x + size * 0.1, y);
  ctx.lineTo(x + size * 0.6, y + size / 2);
  ctx.stroke();
}

function iconChevron(ctx, cx, cy, size, color) {
  stroked(ctx, color || C.sub, Math.max(2, size / 6));
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.25, cy - size / 2);
  ctx.lineTo(cx + size * 0.25, cy);
  ctx.lineTo(cx - size * 0.25, cy + size / 2);
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
  stroked(ctx, color || C.ink, Math.max(2.4, size / 8));
  ctx.beginPath();
  ctx.moveTo(cx - size / 2, cy - size / 2);
  ctx.lineTo(cx + size / 2, cy + size / 2);
  ctx.moveTo(cx + size / 2, cy - size / 2);
  ctx.lineTo(cx - size / 2, cy + size / 2);
  ctx.stroke();
}

function iconCheck(ctx, cx, cy, size, color) {
  stroked(ctx, color, Math.max(2.4, size / 5));
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.4, cy);
  ctx.lineTo(cx - size * 0.1, cy + size * 0.32);
  ctx.lineTo(cx + size * 0.45, cy - size * 0.32);
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
  stroked(ctx, color, Math.max(1.8, size / 12));
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
  }
}

/** a circular arrow (重播): an open ring with an arrow head, drawn so no font glyph is needed */
function iconReplay(ctx, cx, cy, size, color) {
  const r = size * 0.36;
  stroked(ctx, color, Math.max(2, size / 9));
  ctx.beginPath();
  ctx.arc(cx, cy, r, -0.35 * Math.PI, 1.55 * Math.PI);
  ctx.stroke();
  const a = -0.35 * Math.PI;
  const tx = cx + r * Math.cos(a);
  const ty = cy + r * Math.sin(a);
  ctx.beginPath();
  ctx.moveTo(tx + size * 0.22, ty - size * 0.02);
  ctx.lineTo(tx, ty);
  ctx.lineTo(tx + size * 0.04, ty - size * 0.24);
  ctx.stroke();
}

/** padlock, for the locked 今日彩笔 swatches */
function iconLock(ctx, cx, cy, size, color) {
  const w = size * 0.7;
  const h = size * 0.5;
  stroked(ctx, color, Math.max(1.8, size / 9));
  ctx.beginPath();
  ctx.arc(cx, cy - h * 0.25, w * 0.3, Math.PI, 0);
  ctx.stroke();
  fillRR(ctx, cx - w / 2, cy - h * 0.2, w, h, 2, color);
}

function iconUndo(ctx, cx, cy, size, color) {
  stroked(ctx, color, Math.max(2, size / 8));
  ctx.beginPath();
  ctx.arc(cx, cy + size * 0.05, size * 0.34, Math.PI * 1.1, Math.PI * 2.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.42, cy - size * 0.28);
  ctx.lineTo(cx - size * 0.32, cy + size * 0.02);
  ctx.lineTo(cx - size * 0.05, cy - size * 0.12);
  ctx.stroke();
}

function iconTrash(ctx, cx, cy, size, color) {
  stroked(ctx, color, Math.max(2, size / 9));
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.38, cy - size * 0.28);
  ctx.lineTo(cx + size * 0.38, cy - size * 0.28);
  ctx.moveTo(cx - size * 0.14, cy - size * 0.28);
  ctx.lineTo(cx - size * 0.14, cy - size * 0.42);
  ctx.lineTo(cx + size * 0.14, cy - size * 0.42);
  ctx.lineTo(cx + size * 0.14, cy - size * 0.28);
  ctx.moveTo(cx - size * 0.28, cy - size * 0.18);
  ctx.lineTo(cx - size * 0.22, cy + size * 0.42);
  ctx.lineTo(cx + size * 0.22, cy + size * 0.42);
  ctx.lineTo(cx + size * 0.28, cy - size * 0.18);
  ctx.stroke();
}

function iconClock(ctx, cx, cy, size, color) {
  stroked(ctx, color, Math.max(1.8, size / 10));
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2);
  ctx.moveTo(cx, cy - size * 0.24);
  ctx.lineTo(cx, cy);
  ctx.lineTo(cx + size * 0.18, cy + size * 0.1);
  ctx.stroke();
}

/** a laughing face (笑 stamp). filled = the viewer has stamped it */
function iconLaugh(ctx, cx, cy, size, color, filled) {
  const r = size * 0.46;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  if (filled) {
    ctx.fillStyle = C.tape;
    ctx.fill();
  }
  stroked(ctx, color, Math.max(1.8, size / 11));
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx - r * 0.38, cy - r * 0.25, Math.max(1.3, size / 18), 0, Math.PI * 2);
  ctx.arc(cx + r * 0.38, cy - r * 0.25, Math.max(1.3, size / 18), 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.05, r * 0.52, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
}

/** status glyph next to status text (never colour alone): kind = ok | wait | bad */
function iconStatus(ctx, cx, cy, size, kind, color) {
  if (kind === 'ok') iconCheck(ctx, cx, cy, size * 0.8, color);
  else if (kind === 'bad') iconClose(ctx, cx, cy, size * 0.6, color);
  else iconClock(ctx, cx, cy, size, color);
}

// --------------------------------------------------------------- surfaces

/** Note card: white, ink outline, a hard offset shadow (the doodle-wall look). */
function card(ctx, x, y, w, h, o) {
  o = o || {};
  const r = o.r != null ? o.r : 14;
  if (!T.isHC() && o.shadow !== false) fillRR(ctx, x + 2, y + 3, w, h, r, C.shadow);
  fillRR(ctx, x, y, w, h, r, o.fill || C.card);
  strokeRR(ctx, x, y, w, h, r, o.stroke || (T.isHC() ? C.ink : C.lineStrong), o.lw || (T.isHC() ? 2 : 1.5));
}

/** Small tape strip across the top of a note */
function tape(ctx, cx, y, w, rot) {
  if (T.isHC()) return;
  ctx.save();
  ctx.translate(cx, y);
  ctx.rotate(rot == null ? 0.05 : rot);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = C.tape;
  ctx.fillRect(-w / 2, -7, w, 14);
  ctx.restore();
}

/** Outlined pill (chip) with optional status icon. Returns its width. kind: ok | wait | bad | info */
function chip(ctx, L, x, y, label, o) {
  o = o || {};
  const size = o.size || T.FS.body;
  const kind = o.kind || 'info';
  const col = kind === 'ok' ? C.greenText : kind === 'bad' ? C.vermText : kind === 'wait' ? C.orangeDeep : C.blueText;
  const soft = kind === 'ok' ? C.greenSoft : kind === 'bad' ? C.vermSoft : kind === 'wait' ? C.orangeSoft : C.blueSoft;
  const iconW = o.icon ? size + L.u(4) : 0;
  const tw = measure(ctx, label, size, 700);
  const w = tw + iconW + L.u(20);
  const h = size + L.u(12);
  const px = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
  fillRR(ctx, px, y - h / 2, w, h, h / 2, soft);
  strokeRR(ctx, px, y - h / 2, w, h, h / 2, col, T.isHC() ? 2 : 1.5);
  if (o.icon) iconStatus(ctx, px + L.u(10) + size / 2, y, size * 0.8, kind === 'info' ? 'ok' : kind, col);
  text(ctx, label, px + L.u(10) + iconW, y + 0.5, { size, weight: 700, color: col });
  return w;
}

// --------------------------------------------------------------- buttons

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

/**
 * Button. o: {id, x, y, w, h, label, kind: primary|secondary|ad|danger|ghost, disabled, sub (second line), size,
 * icon: 'play'}. Registers a hit area (not for disabled). Ad buttons always show a play icon. `sub` wraps to 2 lines when it
 * does not fit; sublineCount() tells a caller how many lines it will take.
 */
function button(ctx, L, hits, o) {
  const { x, y, w } = o;
  const h = Math.max(o.h, T.minBtn());
  const kind = o.kind || 'secondary';
  const r = Math.min(L.u(14), h / 2);
  const hc = T.isHC();
  ctx.save();
  let fg = C.ink;
  if (o.disabled) {
    fillRR(ctx, x, y, w, h, r, C.disabledFill);
    ctx.setLineDash([L.u(5), L.u(4)]);
    strokeRR(ctx, x + 1, y + 1, w - 2, h - 2, r, hc ? C.ink : C.line, 2);
    ctx.setLineDash([]);
    fg = C.disabledInk;
  } else if (kind === 'primary') {
    if (!hc) fillRR(ctx, x, y + 3, w, h, r, C.ink);
    fillRR(ctx, x, y, w, h, r, C.orange);
    strokeRR(ctx, x, y, w, h, r, C.ink, 2);
  } else if (kind === 'danger') {
    fillRR(ctx, x, y, w, h, r, C.card);
    strokeRR(ctx, x, y, w, h, r, C.vermText, 2);
    fg = C.vermText;
  } else if (kind === 'ad') {
    fillRR(ctx, x, y, w, h, r, C.blueSoft);
    ctx.setLineDash([L.u(6), L.u(4)]);
    strokeRR(ctx, x + 1, y + 1, w - 2, h - 2, r, C.blueText, 2);
    ctx.setLineDash([]);
    fg = C.blueText;
  } else if (kind === 'ghost') {
    fg = C.blueText;
  } else {
    fillRR(ctx, x, y, w, h, r, C.card);
    strokeRR(ctx, x, y, w, h, r, hc ? C.ink : C.lineStrong, 2);
  }
  const size = o.size || (kind === 'primary' ? T.FS.button : T.FS.bodyL);
  const weight = kind === 'primary' ? 800 : 700;
  const icon = (kind === 'ad' || o.icon === 'play' || o.icon === 'replay') && !o.disabled ? L.u(T.isLarge() ? 26 : 22) : 0;
  const iconW = icon ? icon + L.u(8) : 0;
  const maxW = w - L.u(16) - iconW;
  let tw = measure(ctx, o.label, size, weight);
  const fit = tw > maxW ? Math.max(T.FS.body, size * (maxW / tw)) : size;
  tw = Math.min(measure(ctx, o.label, fit, weight), maxW);
  const cx0 = x + w / 2 - (tw + iconW) / 2;
  const subLines = o.sub ? sublines(ctx, o.sub, w - L.u(12)) : [];
  const lhS = Math.round(T.FS.body * 1.3);
  const blockH = subLines.length ? Math.round(fit * 1.2) + subLines.length * lhS : 0;
  const cy = subLines.length ? y + (h - blockH) / 2 + Math.round(fit * 0.6) : y + h / 2;
  if (icon && o.icon === 'replay') iconReplay(ctx, cx0 + icon / 2, cy, icon, fg);
  else if (icon) iconPlay(ctx, cx0 + icon / 2, cy, icon, fg, true);
  text(ctx, o.label, cx0 + iconW, cy + 0.5, { size: fit, weight, color: fg, maxW: w - L.u(10) - iconW });
  subLines.forEach((ln, i) => text(ctx, ln, x + w / 2, cy - Math.round(fit * 0.6) + Math.round(fit * 1.2) + i * lhS + lhS / 2, { size: T.FS.body, color: o.disabled ? C.disabledInk : kind === 'primary' ? C.ink : C.sub, align: 'center' }));
  ctx.restore();
  if (o.id && !o.disabled) hits.add(o.id, x, y, w, h);
  return { x, y, w, h };
}

/** the lines a button's `sub` text takes inside a width (1 when it fits, else up to 2 wrapped lines) */
function sublines(ctx, str, maxW) {
  if (measure(ctx, str, T.FS.body, 400) <= maxW) return [str];
  return wrap(ctx, str, maxW, T.FS.body, 400).slice(0, 2);
}

/** Text-only link with a 48pt tap area. */
function link(ctx, L, hits, o) {
  const size = o.size || T.FS.body;
  const tw = measure(ctx, o.label, size, 700);
  const x = o.align === 'right' ? o.x - tw : o.align === 'center' ? o.x - tw / 2 : o.x;
  text(ctx, o.label, x, o.y, { size, weight: 700, color: o.color || C.blueText });
  if (o.underline !== false) {
    ctx.fillStyle = o.color || C.blueText;
    ctx.fillRect(x, o.y + size * 0.62, tw, T.isHC() ? 2 : 1);
  }
  if (o.id) addTap(hits, o.id, x - L.u(8), o.y - T.MIN_TAP / 2, tw + L.u(16), T.MIN_TAP);
  return { x, w: tw };
}

/** Back button level with the capsule: chevron plus a text label. */
function backButton(ctx, L, hits, label, id) {
  const cy = L.back.y + L.back.h / 2;
  iconBack(ctx, L.x0, cy, L.u(14), C.ink);
  text(ctx, label || '返回', L.x0 + L.u(20), cy, { size: T.FS.bodyL, weight: 700, color: C.ink });
  hits.add(id || 'back', L.back.x, L.back.y, L.back.w, L.back.h);
}

// ------------------------------------------------------------ progress, skeleton

/** ●●●○○○ (our own shapes, never user content) centred at cx. Returns total width. */
function progressDots(ctx, cx, y, passed, length, r) {
  const n = length || 6;
  const gap = r * 1.7;
  const total = n * 2 * r + (n - 1) * gap;
  let x = cx - total / 2 + r;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (i < passed) {
      ctx.fillStyle = C.orange;
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = T.isHC() ? 2.5 : 2;
      ctx.stroke();
    } else {
      ctx.strokeStyle = T.isHC() ? C.ink : C.lineStrong;
      ctx.lineWidth = T.isHC() ? 2.5 : 2;
      ctx.stroke();
    }
    x += 2 * r + gap;
  }
  return total;
}

/** Skeleton block with a gentle pulse (t = ms from the logic). */
function skeleton(ctx, x, y, w, h, t, r) {
  const pulse = 0.7 + 0.3 * Math.sin((t || 0) / 380);
  ctx.save();
  ctx.globalAlpha = pulse;
  fillRR(ctx, x, y, w, h, r != null ? r : Math.min(8, h / 2), C.skeleton);
  ctx.restore();
}

// ---------------------------------------------------------------- scrolling

function clampN(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * "There is more below" affordance for a scroll body that is not at its end: a short fade into the page colour along the
 * bottom edge and a small down chevron on a pill. Drawn over the body, under anything pinned below it.
 */
function scrollMore(ctx, area, fade) {
  const fh = Math.min(30, area.h * 0.35);
  const y0 = area.y + area.h - fh;
  const g = ctx.createLinearGradient(0, y0, 0, y0 + fh);
  g.addColorStop(0, alpha0(fade));
  g.addColorStop(1, fade);
  ctx.fillStyle = g;
  ctx.fillRect(area.x - 6, y0, area.w + 12, fh);
  const cx = area.x + area.w / 2;
  const cy = area.y + area.h - 9;
  fillRR(ctx, cx - 15, cy - 7, 30, 14, 7, fade);
  strokeRR(ctx, cx - 15, cy - 7, 30, 14, 7, T.isHC() ? C.ink : C.lineStrong, T.isHC() ? 1.5 : 1);
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy - 2);
  ctx.lineTo(cx, cy + 3);
  ctx.lineTo(cx + 5, cy - 2);
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** the same colour fully transparent (hex #rrggbb in, rgba out) so the fade does not go grey */
function alpha0(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  return m ? 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',0)' : 'rgba(255,255,255,0)';
}

/**
 * Vertical scroll region. area {x,y,w,h}, contentH in px, scroll = current offset, id = scroll hit id (also the
 * scrollMax key). drawFn(scrollOffset) draws in content coordinates starting at area.y. Registers the drag area first
 * (so later areas win), clips drawing and tap areas, draws a scrollbar. Returns {scroll, maxScroll}.
 */
function scrollBody(ctx, hits, area, contentH, scroll, id, drawFn, opts) {
  const maxScroll = Math.max(0, contentH - area.h);
  hits.scrollMax[id] = maxScroll;
  const sc = clampN(scroll || 0, 0, maxScroll);
  hits.add(id, area.x, area.y, area.w, area.h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x - 6, area.y, area.w + 12, area.h + 2);
  ctx.clip();
  hits.beginScroll(area, -sc);
  ctx.translate(0, -sc);
  drawFn(sc);
  hits.endScroll();
  ctx.restore();
  if (maxScroll > 0 && sc < maxScroll - 1) scrollMore(ctx, area, (opts && opts.fade) || C.paper);
  if (maxScroll > 0) {
    const bh = Math.max(24, area.h * (area.h / contentH));
    const by = area.y + (area.h - bh) * (sc / maxScroll);
    fillRR(ctx, area.x + area.w + 3, by, 3, bh, 1.5, T.isHC() ? C.ink : 'rgba(30,27,24,0.35)');
  }
  return { scroll: sc, maxScroll };
}

// ---------------------------------------------------------------- sheets

/**
 * Bottom sheet over a scrim. Registers 'sheet:close' for the scrim (tap outside closes), the X, and 'sheet:body'
 * (swallows taps on the sheet). Returns the inner geometry. o: {h (px), title, closeId, noScrimClose}
 */
function sheet(ctx, L, hits, o) {
  const closeId = o.closeId || 'sheet:close';
  ctx.fillStyle = C.scrim;
  ctx.fillRect(0, 0, L.W, L.H);
  hits.add(o.noScrimClose ? 'sheet:scrim' : closeId, 0, 0, L.W, L.H);
  const w = Math.min(L.W, 560);
  const x = (L.W - w) / 2;
  const h = Math.min(o.h, L.H - L.navBottom);
  const y = L.H - h;
  fillRR(ctx, x, y, w, h + 24, L.u(22), C.sheet);
  strokeRR(ctx, x, y, w, h + 24, L.u(22), T.isHC() ? C.ink : C.lineStrong, T.isHC() ? 2.5 : 1.5);
  hits.add('sheet:body', x, y, w, h);
  fillRR(ctx, L.cx - L.u(20), y + L.u(8), L.u(40), 4, 2, T.isHC() ? C.ink : 'rgba(30,27,24,0.25)');
  const inner = { x: x + L.pad, y: y + L.u(20), w: w - 2 * L.pad, h: h - L.u(20), sheetX: x, sheetY: y, sheetW: w, sheetH: h };
  if (o.title) text(ctx, o.title, inner.x, y + L.u(38), { size: T.FS.title, weight: 800, maxW: w - 2 * L.pad - L.u(60) });
  if (o.close !== false) {
    iconClose(ctx, x + w - L.pad - L.u(12), y + L.u(38), L.u(16), C.sub);
    hits.add(closeId, x + w - L.u(64), y + L.u(14), L.u(64), T.MIN_TAP);
  }
  inner.top = y + L.u(T.isLarge() ? 70 : 62);
  inner.bottom = L.bottomEdge - L.bottomPad;
  return inner;
}

/**
 * Banner slot (spec 11). The real banner is a native view placed by logic at L.bannerRect(); this only draws the grey
 * QA bar when the ad module runs in stub mode (banner.stub). Draws nothing otherwise.
 */
function bannerSlot(ctx, L, rect, stub) {
  if (!stub || !rect) return;
  fillRR(ctx, rect.x, rect.y, rect.w, rect.h, L.u(6), 'rgba(120,120,120,0.35)');
  strokeRR(ctx, rect.x, rect.y, rect.w, rect.h, L.u(6), C.lineStrong, 1);
  text(ctx, '广告位（测试）', rect.x + rect.w / 2, rect.y + rect.h / 2, { size: T.FS.body, color: C.ink, align: 'center' });
}

module.exports = {
  font, rr, fillRR, strokeRR, text, measure, wrap, wrapBalanced, paragraph, paragraphH, paper, clampN,
  iconBack, iconChevron, iconPlay, iconReplay, iconClose, iconCheck, iconSpeaker, iconLock, iconUndo, iconTrash, iconClock, iconLaugh, iconStatus,
  card, tape, chip, button, sublines, addTap, link, backButton, progressDots, skeleton, scrollBody, sheet, bannerSlot,
};
