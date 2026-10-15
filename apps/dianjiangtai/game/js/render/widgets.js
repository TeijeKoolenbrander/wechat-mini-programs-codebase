/**
 * Shared drawing widgets. Pure canvas 2D calls (a WeChat-safe subset: no
 * roundRect, no letterSpacing, no filter). No wx, no state, no timers.
 * Colours and type sizes come from the live tokens in theme.js, so every
 * widget follows the large-text and high-contrast modes.
 */

const T = require('./theme');
const SealMod = require('./seal');
const C = T.COLORS;

// ---------------------------------------------------------------- basics

function font(size, weight, serif) {
  return (weight || 400) + ' ' + Math.round(size * 10) / 10 + 'px ' + (serif ? T.SERIF : T.SANS);
}

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
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
 * Draw one line of text. o: {size, weight, color, align, serif, baseline,
 * maxW (shrinks to fit, never below minSize; truncates with an ellipsis if it
 * still does not fit), minSize, alpha}. Returns the drawn width.
 */
function text(ctx, str, x, y, o) {
  o = o || {};
  str = str == null ? '' : String(str);
  let size = o.size || T.FS.body;
  ctx.font = font(size, o.weight, o.serif);
  let w = ctx.measureText(str).width;
  if (o.maxW && w > o.maxW) {
    const min = o.minSize || T.FS.body;
    size = Math.max(min, size * (o.maxW / w));
    ctx.font = font(size, o.weight, o.serif);
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

function measure(ctx, str, size, weight, serif) {
  ctx.font = font(size, weight, serif);
  return ctx.measureText(String(str)).width;
}

/** Text with CSS-like letter spacing, centred or left. */
function spaced(ctx, str, x, y, o) {
  o = o || {};
  const chars = Array.from(String(str));
  const sp = o.spacing || 0;
  ctx.font = font(o.size || T.FS.body, o.weight, o.serif);
  let total = 0;
  const ws = chars.map((c) => ctx.measureText(c).width);
  ws.forEach((w) => (total += w + sp));
  total -= sp;
  let cx = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
  ctx.fillStyle = o.color || C.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = o.baseline || 'middle';
  chars.forEach((c, i) => {
    ctx.fillText(c, cx, y);
    cx += ws[i] + sp;
  });
  return total;
}

/** Break text into lines no wider than maxW (CJK breaks anywhere, Latin on spaces). */
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
      if (punctNoStart.indexOf(ch) >= 0 && line.length > 1) {
        // closing punctuation may not start a line: carry the last character down with it
        const chars = Array.from(line);
        let carry = '';
        // carry trailing no-start punctuation plus one ordinary character down with it
        while (chars.length > 1 && punctNoStart.indexOf(chars[chars.length - 1]) >= 0) carry = chars.pop() + carry;
        carry = chars.pop() + carry;
        lines.push(chars.join(''));
        line = carry + ch;
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

/** Number of lines a paragraph needs (capped at maxLines). */
function lineCount(ctx, str, maxW, size, weight, serif, maxLines) {
  const n = wrap(ctx, str, maxW, size, weight, serif).length;
  return maxLines ? Math.min(n, maxLines) : n;
}

/** Wrapped paragraph; returns its height. maxLines truncates with an ellipsis. */
function paragraph(ctx, str, x, y, maxW, lineH, o) {
  o = o || {};
  let lines = wrap(ctx, str, maxW, o.size || T.FS.body, o.weight, o.serif);
  if (o.maxLines && lines.length > o.maxLines) {
    lines = lines.slice(0, o.maxLines);
    let last = lines[o.maxLines - 1];
    while (last.length > 1 && measure(ctx, last + '…', o.size || T.FS.body, o.weight, o.serif) > maxW) last = last.slice(0, -1);
    lines[o.maxLines - 1] = last + '…';
  }
  lines.forEach((ln, i) => {
    text(ctx, ln, o.align === 'center' ? x + maxW / 2 : x, y + lineH * i + lineH / 2, {
      size: o.size,
      weight: o.weight,
      serif: o.serif,
      color: o.color,
      align: o.align || 'left',
    });
  });
  return lines.length * lineH;
}

// ------------------------------------------------------------ backgrounds

/** Rice paper: gradient and thin inset frame. High contrast: plain white and one black rule. */
function paper(ctx, L) {
  if (T.isHC()) {
    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, L.W, L.H);
    ctx.strokeStyle = C.frame1;
    ctx.lineWidth = 2;
    ctx.strokeRect(L.u(5), L.u(5), L.W - L.u(10), L.H - L.u(10));
    return;
  }
  const g = ctx.createLinearGradient(0, 0, 0, L.H);
  g.addColorStop(0, C.paperTop);
  g.addColorStop(1, C.paperBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L.W, L.H);
  // frame (like the share card's double rule), kept off the safe area content
  ctx.strokeStyle = C.frame1;
  ctx.lineWidth = 2;
  ctx.strokeRect(L.u(5), L.u(5), L.W - L.u(10), L.H - L.u(10));
  ctx.strokeStyle = C.frame2;
  ctx.lineWidth = 1;
  ctx.strokeRect(L.u(9), L.u(9), L.W - L.u(18), L.H - L.u(18));
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

function iconCheck(ctx, cx, cy, size, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, size / 6);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.4, cy);
  ctx.lineTo(cx - size * 0.1, cy + size * 0.32);
  ctx.lineTo(cx + size * 0.45, cy - size * 0.32);
  ctx.stroke();
}

// --------------------------------------------------------------- buttons

/**
 * Button. o: {id, x, y, w, h, label, kind: primary|secondary|ghost|ad|danger,
 * disabled, sub (second line), size, serif, icon: 'play'|'check'}. Registers a
 * hit area (grown to the 48pt minimum around its centre). Ad buttons always
 * show a play icon.
 */
function button(ctx, L, hits, o) {
  const { x, y, w } = o;
  const h = Math.max(o.h, T.minBtn());
  const kind = o.kind || 'secondary';
  const r = Math.min(L.u(12), h / 2);
  ctx.save();
  if (o.disabled) ctx.globalAlpha = 0.5;
  let fg = C.ink;
  if (kind === 'primary') {
    // soft drop shadow, cinnabar face, paper-gold inner rule
    if (!T.isHC()) {
      ctx.shadowColor = C.btnShadow;
      ctx.shadowOffsetY = 3;
      ctx.shadowBlur = 8;
    }
    fillRR(ctx, x, y, w, h, r, C.seal);
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    strokeRR(ctx, x + 3, y + 3, w - 6, h - 6, Math.max(2, r - 3), T.isHC() ? '#FFFFFF' : 'rgba(246,233,208,0.45)', T.isHC() ? 2 : 1.5);
    fg = C.sealInk;
  } else if (kind === 'danger') {
    fillRR(ctx, x, y, w, h, r, C.tile);
    strokeRR(ctx, x, y, w, h, r, C.seal, 2);
    fg = C.seal;
  } else if (kind === 'ad') {
    fillRR(ctx, x, y, w, h, r, C.tile);
    ctx.setLineDash([L.u(6), L.u(4)]);
    strokeRR(ctx, x + 1, y + 1, w - 2, h - 2, r, C.goldDeep, 2);
    ctx.setLineDash([]);
    fg = C.ink;
  } else if (kind === 'ghost') {
    strokeRR(ctx, x, y, w, h, r, C.lineStrong, 1.5);
  } else {
    fillRR(ctx, x, y, w, h, r, C.tile);
    strokeRR(ctx, x, y, w, h, r, C.lineStrong, 2);
  }
  const size = o.size || (kind === 'primary' ? T.FS.button + 2 : T.FS.bodyL);
  const serif = o.serif != null ? o.serif : kind === 'primary';
  const weight = kind === 'primary' ? 700 : 600;
  let iconW = 0;
  const icon = kind === 'ad' || o.icon === 'play' ? L.u(T.isLarge() ? 26 : 22) : 0;
  if (icon) iconW = icon + L.u(8);
  const maxW = w - L.u(16) - iconW;
  let tw = measure(ctx, o.label, size, weight, serif);
  const fit = tw > maxW ? Math.max(T.FS.body, size * (maxW / tw)) : size;
  tw = measure(ctx, o.label, fit, weight, serif);
  const cx0 = x + w / 2 - (tw + iconW) / 2;
  const cy = y + h / 2 - (o.sub ? L.u(9) * T.K() : 0);
  if (icon) iconPlay(ctx, cx0 + icon / 2, cy, icon, kind === 'ad' ? C.goldDeep : fg, true);
  if (o.icon === 'check') iconCheck(ctx, cx0 - L.u(12), cy, L.u(14), fg);
  text(ctx, o.label, cx0 + iconW, cy, { size: fit, weight, serif, color: fg, maxW: w - L.u(10) - iconW });
  if (o.sub) text(ctx, o.sub, x + w / 2, y + h / 2 + L.u(13) * T.K(), { size: T.FS.body, color: kind === 'primary' ? C.sealInk : C.sub, align: 'center', maxW: w - L.u(12) });
  ctx.restore();
  if (o.id && !o.disabled) addTap(hits, L, o.id, x, y, w, h);
  return { x, y, w, h };
}

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

/** Text-only link with a 48pt tap area. */
function link(ctx, L, hits, o) {
  const size = o.size || T.FS.body;
  const tw = measure(ctx, o.label, size, o.weight || 600, false);
  const iconW = o.icon ? L.u(24) : 0;
  const total = tw + iconW;
  const x = o.align === 'right' ? o.x - total : o.align === 'center' ? o.x - total / 2 : o.x;
  if (o.icon === 'speaker') iconSpeaker(ctx, x + L.u(10), o.y, L.u(20), o.color || C.ink, o.muted);
  text(ctx, o.label, x + iconW, o.y, { size, weight: o.weight || 600, color: o.color || C.ink });
  if (o.underline) {
    ctx.fillStyle = o.color || C.ink;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(x + iconW, o.y + size * 0.62, tw, 1);
    ctx.globalAlpha = 1;
  }
  if (o.id) addTap(hits, L, o.id, x - L.u(8), (o.tapY != null ? o.tapY : o.y) - T.MIN_TAP / 2, total + L.u(16), T.MIN_TAP);
}

/** Small outlined pill label (e.g. the 识人 badge). Returns its width. align: left (default) | center | right. */
function pill(ctx, L, x, y, label, o) {
  o = o || {};
  const size = o.size || T.FS.body;
  const color = o.color || C.seal;
  const tw = measure(ctx, label, size, 800, true);
  const w = tw + L.u(16);
  const h = size + L.u(10);
  const px = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
  fillRR(ctx, px, y - h / 2, w, h, h / 2, o.fill || C.tintSeal);
  strokeRR(ctx, px, y - h / 2, w, h, h / 2, color, T.isHC() ? 2 : 1.5);
  text(ctx, label, px + w / 2, y + 1, { size, weight: 800, serif: true, color, align: 'center' });
  return w;
}

// ----------------------------------------------------------------- tiles

/**
 * Seal portrait (CTO-D1): see seal.js. spec = {name|text, monogram, factionKey,
 * tier, frame, inkText}; opts = {dim, full, dpr}.
 */
function seal(ctx, x, y, size, spec, opts) {
  SealMod.draw(ctx, x, y, size, spec, opts);
}

/** Box size of the tier stamp for a requested size (grows with the text size). */
function tierBox(size) {
  return Math.max(size, Math.round(T.FS.body * 1.4));
}

/** Small tier stamp: 甲 / 乙 / 丙 in an outlined square. Returns its size. */
function tierBadge(ctx, x, y, size, tier) {
  const label = T.TIER_LABEL[tier] || '';
  if (!label) return 0;
  const b = tierBox(size);
  strokeRR(ctx, x, y - (b - size) / 2, b, b, b * 0.2, C.seal, T.isHC() ? 2.5 : 1.5);
  text(ctx, label, x + b / 2, y - (b - size) / 2 + b / 2 + 1, { size: T.FS.body, weight: 700, serif: true, color: C.seal, align: 'center' });
  return b;
}

/** Chip box for a fit label. */
function fitChipSize(ctx, fit, o) {
  o = o || {};
  const label = T.FIT_LABEL[fit] || '';
  const k = T.K();
  const h = o.h || Math.round(26 * k);
  const tw = measure(ctx, label, T.FS.body, 700, false);
  return { w: tw + Math.round(30 * k), h };
}

/** Role-fit chip with text and an icon (never colour alone; 2pt outline in high contrast). Returns its width. */
function fitChip(ctx, x, y, fit, o) {
  o = o || {};
  const label = T.FIT_LABEL[fit] || '';
  const color = T.FIT_COLOR[fit] || C.ok;
  const k = T.K();
  const { w, h } = fitChipSize(ctx, fit, o);
  fillRR(ctx, x, y, w, h, h / 2, fit === 'good' ? C.tintGood : fit === 'bad' ? C.tintBad : C.tintOk);
  strokeRR(ctx, x, y, w, h, h / 2, color, T.isHC() ? 2.5 : 1.5);
  const ix = x + 12 * k;
  const iy = y + h / 2;
  if (fit === 'good') iconCheck(ctx, ix, iy, 10 * k, color);
  else if (fit === 'bad') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(ix, iy - 5 * k);
    ctx.lineTo(ix + 5.5 * k, iy + 4.5 * k);
    ctx.lineTo(ix - 5.5 * k, iy + 4.5 * k);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(ix - 4 * k, iy - 1, 8 * k, 2);
  }
  text(ctx, label, x + 20 * k, y + h / 2 + 1, { size: T.FS.body, weight: 700, color });
  return w;
}

/** Ten-segment pip bar for a 1-10 stat. hidden = all empty (识人). Returns its height. */
function pips(ctx, x, y, w, value, color, hidden) {
  const n = 10;
  const gap = 2;
  const ph = Math.round(6 * T.K());
  const pw = (w - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = !hidden && i < value ? color || C.ink : C.pipOff;
    ctx.fillRect(x + i * (pw + gap), y, pw, ph);
  }
  return ph;
}

/** A cinnabar seal stamp (rotated square). progress 0..1 animates the slam. */
function sealStamp(ctx, cx, cy, size, big, small, o) {
  o = o || {};
  const p = o.progress == null ? 1 : Math.max(0, Math.min(1, o.progress));
  if (p <= 0) return;
  // slams in from 1.9x to 1x over the first 60%
  const scale = p < 0.6 ? 1 + (1 - p / 0.6) * 0.9 : 1;
  const rot = ((o.rotate == null ? -8 : o.rotate) * Math.PI) / 180;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.globalAlpha = Math.min(1, p / 0.35) * (o.alpha == null ? 1 : o.alpha);
  fillRR(ctx, -size / 2, -size / 2, size, size, size * 0.07, C.seal);
  strokeRR(ctx, -size / 2 + size * 0.075, -size / 2 + size * 0.075, size * 0.85, size * 0.85, 0, C.sealInk, Math.max(1.5, size / 36));
  // carved-seal glyphs are drawn one character at a time (decoration, like the seal portraits)
  const chars = Array.from(big);
  const glyph = (ch, gx, gy, fs) => text(ctx, ch, gx, gy, { size: fs, weight: 900, serif: true, color: C.sealInk, align: 'center', minSize: 8 });
  if (chars.length <= 2) {
    const fs = Math.max(16, size * 0.36);
    const gy = small ? -size * 0.08 : 0;
    if (chars.length === 1) glyph(chars[0], 0, gy, fs);
    else {
      glyph(chars[0], -fs * 0.52, gy, fs);
      glyph(chars[1], fs * 0.52, gy, fs);
    }
  } else {
    // four characters: two rows of two (一统 / 天下), like a carved seal
    const fs = Math.max(16, size * 0.27);
    glyph(chars[0], -fs * 0.52, -size * 0.16, fs);
    glyph(chars[1], fs * 0.52, -size * 0.16, fs);
    glyph(chars[2], -fs * 0.52, size * 0.14, fs);
    glyph(chars[3], fs * 0.52, size * 0.14, fs);
  }
  if (small) text(ctx, small, 0, size * 0.28, { size: Math.max(T.FS.body, size * 0.18), weight: 700, serif: true, color: C.sealInk, align: 'center' });
  ctx.restore();
}

/** Skeleton block with a gentle pulse (t = ms from the logic, optional). */
function skeleton(ctx, x, y, w, h, t, r) {
  const pulse = 0.75 + 0.25 * Math.sin((t || 0) / 380);
  ctx.save();
  ctx.globalAlpha = pulse;
  fillRR(ctx, x, y, w, h, r != null ? r : Math.min(8, h / 2), C.skeleton);
  ctx.restore();
}

/** Lacquered command token. face: {label, color, textColor?} or null for the back. flip 0..1 = how far it has flipped. */
function token(ctx, x, y, w, h, face, flip, o) {
  o = o || {};
  const f = flip == null ? 1 : Math.max(0, Math.min(1, flip));
  const sx = Math.max(0.04, Math.abs(Math.cos(Math.PI * (1 - f))));
  const showFace = f >= 0.5 && face;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.scale(sx, 1);
  if (!T.isHC()) {
    ctx.shadowColor = 'rgba(30,20,10,0.30)';
    ctx.shadowOffsetY = 3;
    ctx.shadowBlur = 6;
  }
  fillRR(ctx, -w / 2, -h / 2, w, h, 10, showFace ? face.color || C.lacquer : C.lacquer);
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  strokeRR(ctx, -w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 7, showFace ? 'rgba(255,255,255,0.45)' : 'rgba(233,196,106,0.7)', 1.5);
  if (showFace) {
    text(ctx, face.label, 0, 2, { size: Math.min(h * 0.55, 34), weight: 800, serif: true, color: face.textColor || '#FFFFFF', align: 'center' });
  } else {
    text(ctx, '令', 0, 2, { size: Math.min(h * 0.5, 30), weight: 800, serif: true, color: C.lacquerGold, align: 'center' });
  }
  ctx.restore();
  void o;
}

/** Card surface. */
function card(ctx, x, y, w, h, o) {
  o = o || {};
  const r = o.r != null ? o.r : 12;
  if (o.shadow && !T.isHC()) {
    ctx.save();
    ctx.shadowColor = 'rgba(60,40,20,0.18)';
    ctx.shadowOffsetY = 2;
    ctx.shadowBlur = 8;
    fillRR(ctx, x, y, w, h, r, o.fill || C.tile);
    ctx.restore();
  } else fillRR(ctx, x, y, w, h, r, o.fill || C.tile);
  strokeRR(ctx, x, y, w, h, r, o.stroke || C.line, o.lw || (T.isHC() ? 2 : 1.5));
}

// ---------------------------------------------------------------- scrolling

function clampN(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Vertical scroll region. area {x,y,w,h}, contentH in px, scroll = current
 * offset, id = scroll hit id (also the scrollMax key). drawFn(scrollOffset)
 * draws in content coordinates starting at area.y. Registers the drag area
 * first (so later areas win), clips drawing and tap areas, draws a scrollbar.
 * Returns {scroll, maxScroll}.
 */
function scrollBody(ctx, hits, area, contentH, scroll, id, drawFn) {
  const maxScroll = Math.max(0, contentH - area.h);
  hits.scrollMax[id] = maxScroll;
  const sc = clampN(scroll || 0, 0, maxScroll);
  hits.add(id, area.x, area.y, area.w, area.h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x - 4, area.y, area.w + 8, area.h);
  ctx.clip();
  hits.beginScroll(area, -sc);
  ctx.translate(0, -sc);
  drawFn(sc);
  hits.endScroll();
  ctx.restore();
  if (maxScroll > 0) {
    const bh = Math.max(24, area.h * (area.h / contentH));
    const by = area.y + (area.h - bh) * (sc / maxScroll);
    fillRR(ctx, area.x + area.w + 2, by, 3, bh, 1.5, T.isHC() ? C.ink : 'rgba(42,33,26,0.35)');
  }
  return { scroll: sc, maxScroll };
}

// ---------------------------------------------------------------- sheets

/**
 * Bottom sheet over a scrim. Registers 'sheet:scrim' (full screen, swallows
 * taps) and 'sheet:close' (the X). Returns the inner geometry.
 * o: {h (px), title, closeId}
 */
function sheet(ctx, L, hits, o) {
  const closeId = o.closeId || 'sheet:close';
  ctx.fillStyle = C.scrim;
  ctx.fillRect(0, 0, L.W, L.H);
  hits.add(closeId, 0, 0, L.W, L.H); // tap outside closes
  const w = Math.min(L.W, 560);
  const x = (L.W - w) / 2;
  const h = Math.min(o.h, L.H - L.navBottom);
  const y = L.H - h;
  ctx.save();
  if (!T.isHC()) {
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = -2;
  }
  rr(ctx, x, y, w, h + 20, L.u(20));
  ctx.fillStyle = C.sheet;
  ctx.fill();
  ctx.restore();
  strokeRR(ctx, x, y, w, h + 20, L.u(20), T.isHC() ? C.ink : C.line, T.isHC() ? 2.5 : 1.5);
  // swallow taps on the sheet body so they do not close it
  hits.add('sheet:body', x, y, w, h);
  // grabber
  fillRR(ctx, L.cx - L.u(20), y + L.u(8), L.u(40), 4, 2, T.isHC() ? C.ink : 'rgba(42,33,26,0.25)');
  const inner = { x: x + L.pad, y: y + L.u(20), w: w - 2 * L.pad, h: h - L.u(20), sheetX: x, sheetY: y, sheetW: w, sheetH: h };
  if (o.title) {
    text(ctx, o.title, inner.x, y + L.u(36), { size: T.FS.title, weight: 800, serif: true, maxW: w - 2 * L.pad - L.u(56) });
  }
  iconClose(ctx, x + w - L.pad - L.u(12), y + L.u(36), L.u(16), C.sub);
  hits.add(closeId, x + w - L.u(60), y + L.u(10), L.u(60), T.MIN_TAP);
  inner.top = y + L.u(T.isLarge() ? 68 : 60);
  inner.bottom = L.bottomEdge - L.bottomPad;
  return inner;
}

/** Header row: back button level with the capsule, and an optional title line below. */
function backButton(ctx, L, hits, label, id) {
  const cy = L.back.y + L.back.h / 2;
  iconBack(ctx, L.x0, cy, L.u(14), C.ink);
  text(ctx, label || '返回', L.x0 + L.u(20), cy, { size: T.FS.bodyL, weight: 700, color: C.ink });
  hits.add(id || 'back', L.back.x, L.back.y, L.back.w, L.back.h);
}

/**
 * Banner slot (spec 12). The real banner is a native view placed by logic at
 * L.bannerRect(); this only draws the grey QA bar when the ad module runs in
 * stub mode (vm.banner.stub). Draws nothing otherwise.
 */
function bannerSlot(ctx, L, rect, stub) {
  if (!stub || !rect) return;
  fillRR(ctx, rect.x, rect.y, rect.w, rect.h, L.u(6), 'rgba(120,120,120,0.35)');
  strokeRR(ctx, rect.x, rect.y, rect.w, rect.h, L.u(6), C.lineStrong, 1);
  text(ctx, '广告位（测试）', rect.x + rect.w / 2, rect.y + rect.h / 2, { size: T.FS.body, color: C.ink, align: 'center' });
}

module.exports = {
  font,
  rr,
  fillRR,
  strokeRR,
  text,
  measure,
  spaced,
  wrap,
  lineCount,
  paragraph,
  paper,
  iconBack,
  iconPlay,
  iconClose,
  iconSpeaker,
  iconCheck,
  button,
  addTap,
  link,
  pill,
  seal,
  tierBox,
  tierBadge,
  fitChipSize,
  fitChip,
  pips,
  sealStamp,
  skeleton,
  token,
  card,
  scrollBody,
  sheet,
  backButton,
  bannerSlot,
};
