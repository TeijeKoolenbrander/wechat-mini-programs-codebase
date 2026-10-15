/**
 * Shared drawing widgets. Pure canvas 2D calls (a WeChat-safe subset: no
 * roundRect, no letterSpacing, no filter). No wx, no state, no timers.
 */

const T = require('./theme');
const { Hits, clamp } = require('./layout');
const C = T.C;

// ---------------------------------------------------------------- basics

function font(size, weight) {
  return (weight || 400) + ' ' + Math.round(size * 10) / 10 + 'px ' + T.SANS;
}

/** Type size in px for a scale key (e.g. 'body') at this layout's scale. */
function fs(L, key) {
  return T.FS[key] * L.s;
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
 * One line of text. o: {size, weight, color, align, baseline, maxW (shrinks to
 * fit, never below minSize, default 16), minSize, alpha}. Returns drawn width.
 */
function text(ctx, str, x, y, o) {
  o = o || {};
  str = str == null ? '' : String(str);
  let size = o.size || T.FS.body;
  ctx.font = font(size, o.weight);
  let w = ctx.measureText(str).width;
  if (o.maxW && w > o.maxW) {
    const min = o.minSize || 16;
    size = Math.max(min, size * (o.maxW / w));
    ctx.font = font(size, o.weight);
    w = ctx.measureText(str).width;
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

/** Break text into lines no wider than maxW (CJK breaks anywhere). */
function wrap(ctx, str, maxW, size, weight) {
  ctx.font = font(size, weight);
  const lines = [];
  let line = '';
  const noStart = '，。！？、；：）】」』”’》…,.!?;:)';
  Array.from(String(str || '')).forEach((ch) => {
    if (ch === '\n') {
      lines.push(line);
      line = '';
      return;
    }
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line) {
      if (noStart.indexOf(ch) >= 0) {
        line = test;
        return;
      }
      lines.push(line);
      line = ch === ' ' ? '' : ch;
    } else line = test;
  });
  if (line) lines.push(line);
  return lines;
}

/** Wrapped paragraph; returns its height. maxLines truncates with an ellipsis. */
function paragraph(ctx, str, x, y, maxW, lineH, o) {
  o = o || {};
  const size = o.size || T.FS.body;
  let lines = wrap(ctx, str, maxW, size, o.weight);
  if (o.maxLines && lines.length > o.maxLines) {
    lines = lines.slice(0, o.maxLines);
    let last = lines[o.maxLines - 1];
    while (last.length > 1 && measure(ctx, last + '…', size, o.weight) > maxW) last = last.slice(0, -1);
    lines[o.maxLines - 1] = last + '…';
  }
  lines.forEach((ln, i) => {
    text(ctx, ln, o.align === 'center' ? x + maxW / 2 : o.align === 'right' ? x + maxW : x, y + lineH * i + lineH / 2, {
      size,
      weight: o.weight,
      color: o.color,
      align: o.align || 'left',
    });
  });
  return lines.length * lineH;
}

/** Height a paragraph would take (no drawing). */
function paragraphHeight(ctx, str, maxW, lineH, o) {
  o = o || {};
  const n = wrap(ctx, str, maxW, o.size || T.FS.body, o.weight).length;
  return Math.min(n, o.maxLines || n) * lineH;
}

// ------------------------------------------------------------ background

/** The desk: cream paper with faint cutting-mat lines and a washi strip at the top edge. */
function desk(ctx, L) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, L.W, L.H);
  if (T.MODE.hc) return;
  const g = L.u(28);
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = g / 2; x < L.W; x += g) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, L.H);
  }
  for (let y = g / 2; y < L.H; y += g) {
    ctx.moveTo(0, y);
    ctx.lineTo(L.W, y);
  }
  ctx.stroke();
}

// --------------------------------------------------------------- icons

function iconBack(ctx, x, y, size, color) {
  ctx.strokeStyle = color || C.ink;
  ctx.lineWidth = Math.max(2.5, size / 7);
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
  ctx.lineWidth = Math.max(2.5, size / 8);
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
  ctx.beginPath();
  if (muted) {
    ctx.moveTo(cx + h * 0.4, cy - h * 0.45);
    ctx.lineTo(cx + h * 1.05, cy + h * 0.45);
    ctx.moveTo(cx + h * 1.05, cy - h * 0.45);
    ctx.lineTo(cx + h * 0.4, cy + h * 0.45);
    ctx.stroke();
  } else {
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

function iconChevron(ctx, cx, cy, size, color, dir) {
  const d = dir === 'left' ? -1 : 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2.5, size / 6);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - (d * size) / 4, cy - size / 2);
  ctx.lineTo(cx + (d * size) / 4, cy);
  ctx.lineTo(cx - (d * size) / 4, cy + size / 2);
  ctx.stroke();
}

// --------------------------------------------------------------- notes

/**
 * Sticky note: tinted square with a soft shadow, a folded lower-right corner
 * and (optionally) a strip of tape. rot in degrees (small), pivoting on the
 * centre. Drawing only; place text yourself inside the returned rect.
 */
function note(ctx, x, y, w, h, o) {
  o = o || {};
  ctx.save();
  if (o.rot) {
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((o.rot * Math.PI) / 180);
    ctx.translate(-(x + w / 2), -(y + h / 2));
  }
  const fill = o.fill || C.noteYellow;
  if (!T.MODE.hc) {
    ctx.shadowColor = 'rgba(70,50,20,0.22)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
  }
  fillRR(ctx, x, y, w, h, 3, fill);
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  strokeRR(ctx, x, y, w, h, 3, T.MODE.hc ? C.ink : 'rgba(36,33,30,0.16)', T.MODE.hc ? 2 : 1);
  if (o.fold !== false) {
    const f = Math.min(w, h) * 0.16;
    ctx.beginPath();
    ctx.moveTo(x + w, y + h - f);
    ctx.lineTo(x + w - f, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(36,33,30,0.12)';
    ctx.fill();
  }
  if (o.tape) {
    const tw = Math.min(w * 0.4, 64);
    const th = Math.min(16, h * 0.3);
    ctx.save();
    ctx.translate(x + w / 2, y);
    ctx.rotate(-0.04);
    ctx.fillStyle = T.MODE.hc ? C.tape : 'rgba(242,201,76,0.82)';
    ctx.fillRect(-tw / 2, -th / 2, tw, th);
    if (T.MODE.hc) {
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-tw / 2, -th / 2, tw, th);
    }
    ctx.restore();
  }
  ctx.restore();
  return { x, y, w, h };
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
 * Button. o: {id, x, y, w, h, label, kind: primary|secondary|ghost|ad|danger,
 * disabled, size, sub}. Primary is a tangerine sticker with a hard ink offset
 * shadow. Ad buttons always show a play icon (label should say 视频).
 */
function button(ctx, L, hits, o) {
  const { x, y, w } = o;
  const h = o.h || Math.max(T.MIN_TAP, fs(L, 'buttonH'));
  const kind = o.kind || 'secondary';
  const r = Math.min(L.u(14), h / 2);
  const hc = T.MODE.hc;
  const ol = T.MODE.outline;
  let fg = C.ink;
  ctx.save();
  if (o.disabled) {
    fillRR(ctx, x, y, w, h, r, C.disabledFill);
    strokeRR(ctx, x, y, w, h, r, hc ? C.disabledInk : C.line, hc ? 2 : 1.5);
    fg = C.disabledInk;
  } else if (kind === 'primary') {
    fillRR(ctx, x + 2, y + 4, w, h, r, hc ? C.ink : 'rgba(36,33,30,0.85)');
    fillRR(ctx, x, y, w, h, r, C.primary);
    strokeRR(ctx, x, y, w, h, r, C.ink, ol);
    fg = C.primaryInk;
  } else if (kind === 'danger') {
    fillRR(ctx, x, y, w, h, r, C.card);
    strokeRR(ctx, x, y, w, h, r, C.danger, 2);
    fg = C.danger;
  } else if (kind === 'ad') {
    fillRR(ctx, x, y, w, h, r, C.card);
    ctx.setLineDash([L.u(6), L.u(4)]);
    strokeRR(ctx, x + 1, y + 1, w - 2, h - 2, r, C.warn, 2);
    ctx.setLineDash([]);
  } else if (kind === 'ghost') {
    strokeRR(ctx, x, y, w, h, r, C.lineStrong, 1.5);
  } else {
    fillRR(ctx, x, y, w, h, r, C.card);
    strokeRR(ctx, x, y, w, h, r, hc ? C.ink : C.lineStrong, hc ? 2 : 1.5);
  }
  const size = o.size || (kind === 'primary' ? fs(L, 'button') + L.u(2) : fs(L, 'bodyL'));
  const weight = kind === 'primary' ? 800 : 700;
  const icon = kind === 'ad' ? L.u(22) : 0;
  const iconW = icon ? icon + L.u(8) : 0;
  const maxW = w - L.u(16) - iconW;
  let tw = measure(ctx, o.label, size, weight);
  const fit = tw > maxW ? Math.max(16, size * (maxW / tw)) : size;
  tw = measure(ctx, o.label, fit, weight);
  const cx0 = x + w / 2 - (tw + iconW) / 2;
  const cy = y + h / 2 - (o.sub ? L.u(9) : 0);
  if (icon) iconPlay(ctx, cx0 + icon / 2, cy, icon, o.disabled ? fg : C.warn, true);
  text(ctx, o.label, cx0 + iconW, cy, { size: fit, weight, color: fg });
  if (o.sub) text(ctx, o.sub, x + w / 2, y + h / 2 + L.u(14), { size: T.FS.body, color: o.disabled ? fg : C.sub, align: 'center', maxW: w - L.u(12) });
  ctx.restore();
  if (o.id && !o.disabled) addTap(hits, o.id, x, y, w, h);
  return { x, y, w, h };
}

/** Text-only link with a 48pt tap area. */
function link(ctx, L, hits, o) {
  const size = o.size || T.FS.body;
  const tw = measure(ctx, o.label, size, o.weight || 600);
  const iconW = o.icon ? L.u(26) : 0;
  const total = tw + iconW;
  const x = o.align === 'right' ? o.x - total : o.align === 'center' ? o.x - total / 2 : o.x;
  if (o.icon === 'speaker') iconSpeaker(ctx, x + L.u(10), o.y, L.u(20), o.color || C.ink, o.muted);
  text(ctx, o.label, x + iconW, o.y, { size, weight: o.weight || 600, color: o.color || C.ink });
  if (o.underline) {
    ctx.fillStyle = o.color || C.ink;
    ctx.fillRect(x + iconW, o.y + size * 0.62, tw, 1.5);
  }
  if (o.id) addTap(hits, o.id, x - L.u(8), o.y - T.MIN_TAP / 2, total + L.u(16), T.MIN_TAP);
  return { x, w: total };
}

/** Small rounded label (band names, status tags). Returns its width. */
function pill(ctx, x, y, label, o) {
  o = o || {};
  const size = o.size || T.FS.body;
  const color = o.color || C.ink;
  const tw = measure(ctx, label, size, 700);
  const h = o.h || size + 12;
  const w = tw + (o.padX || 20);
  const px = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
  fillRR(ctx, px, y - h / 2, w, h, h / 2, o.fill || 'rgba(36,33,30,0.06)');
  strokeRR(ctx, px, y - h / 2, w, h, h / 2, color, T.MODE.hc ? 2 : 1.5);
  text(ctx, label, px + w / 2, y + 1, { size, weight: 700, color, align: 'center' });
  return w;
}

/** Card surface. */
function card(ctx, x, y, w, h, o) {
  o = o || {};
  const r = o.r != null ? o.r : 14;
  if (o.shadow && !T.MODE.hc) {
    ctx.save();
    ctx.shadowColor = 'rgba(70,50,20,0.16)';
    ctx.shadowOffsetY = 2;
    ctx.shadowBlur = 8;
    fillRR(ctx, x, y, w, h, r, o.fill || C.card);
    ctx.restore();
  } else fillRR(ctx, x, y, w, h, r, o.fill || C.card);
  strokeRR(ctx, x, y, w, h, r, o.stroke || (T.MODE.hc ? C.ink : C.line), o.lw || (T.MODE.hc ? 2 : 1.5));
}

/** Skeleton block with a gentle pulse (t = ms from the logic, optional). */
function skeleton(ctx, x, y, w, h, t, r) {
  const pulse = 0.75 + 0.25 * Math.sin((t || 0) / 380);
  ctx.save();
  ctx.globalAlpha = pulse;
  fillRR(ctx, x, y, w, h, r != null ? r : Math.min(8, h / 2), C.skeleton);
  ctx.restore();
}

/** Spinner arc (t = ms from the logic). */
function spinner(ctx, cx, cy, r, t) {
  const a = ((t || 0) / 500) * Math.PI;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(3, r / 4);
  ctx.strokeStyle = C.line;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = C.primary === '#000000' ? C.ink : C.primary;
  ctx.beginPath();
  ctx.arc(cx, cy, r, a, a + Math.PI * 0.6);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- sheets

/**
 * Bottom sheet over a scrim. Registers 'sheet:close' (outside tap and the X)
 * and 'sheet:body' (swallows taps). o: {h, title, closeId}. Returns the inner
 * geometry: {x, y, w, h, top, bottom}.
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
  if (!T.MODE.hc) {
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = -2;
  }
  rr(ctx, x, y, w, h + 24, L.u(22));
  ctx.fillStyle = C.bg;
  ctx.fill();
  ctx.restore();
  strokeRR(ctx, x, y, w, h + 24, L.u(22), T.MODE.hc ? C.ink : C.line, T.MODE.hc ? 2.5 : 1.5);
  hits.add('sheet:body', x, y, w, h);
  fillRR(ctx, L.cx - L.u(20), y + L.u(8), L.u(40), 4, 2, C.line);
  if (o.title) text(ctx, o.title, x + L.pad, y + L.u(38), { size: fs(L, 'title'), weight: 800, maxW: w - L.pad * 2 - L.u(60) });
  iconClose(ctx, x + w - L.pad - L.u(12), y + L.u(38), L.u(16), C.sub);
  hits.add(closeId, x + w - L.u(64), y + L.u(14), L.u(64), T.MIN_TAP);
  return { x: x + L.pad, y: y + L.u(64), w: w - 2 * L.pad, h: h - L.u(64), top: y + L.u(64), bottom: L.bottomEdge - L.bottomPad, sheetX: x, sheetY: y, sheetW: w, sheetH: h };
}

/** Header row: back chevron level with the capsule. */
function backButton(ctx, L, hits, label, id) {
  const cy = L.back.y + L.back.h / 2;
  iconBack(ctx, L.x0, cy, L.u(14), C.ink);
  text(ctx, label || '返回', L.x0 + L.u(22), cy, { size: fs(L, 'bodyL'), weight: 700 });
  hits.add(id || 'back', L.back.x, L.back.y, L.back.w, L.back.h);
}

// ---------------------------------------------------------------- scroll

/** A ctx stand-in that measures text but draws nothing (for height passes). */
function dryCtx(ctx) {
  const noop = () => {};
  return new Proxy(ctx, {
    get(t, p) {
      if (p === 'measureText') return t.measureText.bind(t);
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (p === 'font') return t.font;
      return noop;
    },
    set(t, p, v) {
      if (p === 'font') t.font = v;
      return true;
    },
  });
}

/**
 * Scrolling region. o: {x, y, w, h, scroll, id, draw(ctx, hits, viewportH)}
 * where draw() paints from y = o.y downward in absolute coordinates and
 * returns the content's bottom y. Taps are shifted and clipped. The drag
 * area `id` is registered first so inner buttons win. Returns the clamped
 * scroll offset.
 */
function scrollView(ctx, L, hits, o) {
  const dry = new Hits();
  const bottom = o.draw(dryCtx(ctx), dry, o.h);
  const contentH = Math.max(o.h, bottom - o.y);
  const max = Math.max(0, Math.round(contentH - o.h));
  const sc = clamp(o.scroll == null ? (o.startAtEnd ? max : 0) : o.scroll, 0, max);
  hits.scrollMax[o.id] = max;
  hits.add(o.id, o.x, o.y, o.w, o.h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(o.x, o.y, o.w, o.h);
  ctx.clip();
  ctx.translate(0, -sc);
  hits.beginScroll({ x: o.x, y: o.y, w: o.w, h: o.h }, -sc);
  o.draw(ctx, hits, o.h);
  hits.endScroll();
  ctx.restore();
  if (max > 0) {
    const bh = Math.max(24, o.h * (o.h / contentH));
    fillRR(ctx, o.x + o.w - 4, o.y + (o.h - bh) * (sc / max), 3, bh, 1.5, C.line);
  }
  return sc;
}

// ---------------------------------------------------------- misc helpers

function easeOut(t) {
  const k = clamp(t == null ? 1 : t, 0, 1);
  return 1 - Math.pow(1 - k, 3);
}

module.exports = {
  font,
  fs,
  rr,
  fillRR,
  strokeRR,
  text,
  measure,
  wrap,
  paragraph,
  paragraphHeight,
  desk,
  iconBack,
  iconPlay,
  iconClose,
  iconSpeaker,
  iconCheck,
  iconChevron,
  note,
  addTap,
  button,
  link,
  pill,
  card,
  skeleton,
  spinner,
  sheet,
  backButton,
  dryCtx,
  scrollView,
  easeOut,
};
