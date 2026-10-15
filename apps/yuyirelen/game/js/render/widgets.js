/**
 * Shared drawing widgets. Pure canvas 2D calls (a WeChat-safe subset: no
 * roundRect, no letterSpacing, no filter). No wx, no state, no timers.
 */

const T = require('./theme');
const C = T.COLORS;

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

/**
 * Draw one line of text. o: {size, weight, color, align, serif, baseline,
 * maxW (shrinks to fit, never below minSize), minSize, alpha}.
 * Returns the drawn width.
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

/** Height a wrapped paragraph would take (for layout before drawing). */
function paragraphHeight(ctx, str, maxW, lineH, o) {
  o = o || {};
  const n = wrap(ctx, str, maxW, o.size || T.FS.body, o.weight, o.serif).length;
  return Math.min(n, o.maxLines || n) * lineH;
}

// ------------------------------------------------------------ backgrounds

/**
 * Warm paper with a thin thermometer scale down the left edge (cold at the
 * bottom, gold at the top). Plain white in high contrast.
 */
function paper(ctx, L) {
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, L.W, L.H);
  if (T.METRICS.hc) return;
  const g = ctx.createLinearGradient(0, L.H, 0, 0);
  const stops = T.BANDS;
  stops.forEach((b, i) => g.addColorStop(i / (stops.length - 1), T.BAND_COLOR[b]));
  ctx.fillStyle = g;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(0, 0, L.u(4), L.H);
  ctx.globalAlpha = 1;
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

function iconChevron(ctx, cx, cy, size, color) {
  ctx.strokeStyle = color || C.sub;
  ctx.lineWidth = Math.max(2, size / 7);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
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

function iconDots(ctx, cx, cy, size, color) {
  ctx.fillStyle = color || C.ink;
  const r = Math.max(2.2, size / 9);
  [-1, 0, 1].forEach((k) => {
    ctx.beginPath();
    ctx.arc(cx + k * size * 0.34, cy, r, 0, Math.PI * 2);
    ctx.fill();
  });
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

/** Lamp (the hint icon): a bulb with a base and two rays. */
function iconLamp(ctx, cx, cy, size, color) {
  const r = size * 0.32;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.8, size / 11);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy - size * 0.1, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillRect(cx - r * 0.55, cy + size * 0.3, r * 1.1, Math.max(2, size / 11));
  ctx.fillRect(cx - r * 0.35, cy + size * 0.42, r * 0.7, Math.max(2, size / 11));
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.5, cy - size * 0.1);
  ctx.lineTo(cx - size * 0.42, cy - size * 0.1);
  ctx.moveTo(cx + size * 0.42, cy - size * 0.1);
  ctx.lineTo(cx + size * 0.5, cy - size * 0.1);
  ctx.stroke();
}

/**
 * The logo: a thermometer (bulb + tube) whose mercury rises through the
 * temperature palette. fill 0..1 animates it.
 */
function logoThermometer(ctx, cx, top, h, fill) {
  const f = fill == null ? 0.8 : Math.max(0, Math.min(1, fill));
  const tubeW = h * 0.2;
  const bulbR = h * 0.22;
  const tubeTop = top;
  const bulbCy = top + h - bulbR;
  const tubeBottom = bulbCy;
  // glass
  fillRR(ctx, cx - tubeW / 2, tubeTop, tubeW, tubeBottom - tubeTop, tubeW / 2, C.surface);
  ctx.beginPath();
  ctx.arc(cx, bulbCy, bulbR, 0, Math.PI * 2);
  ctx.fillStyle = C.surface;
  ctx.fill();
  strokeRR(ctx, cx - tubeW / 2, tubeTop, tubeW, tubeBottom - tubeTop + 2, tubeW / 2, C.ink, Math.max(2, h / 22));
  ctx.beginPath();
  ctx.arc(cx, bulbCy, bulbR, 0, Math.PI * 2);
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = Math.max(2, h / 22);
  ctx.stroke();
  // mercury: segmented by band colour
  const inner = tubeW * 0.46;
  const colTop = tubeTop + tubeW * 0.5;
  const colH = (tubeBottom - colTop) * f;
  const segs = T.BANDS;
  const segH = colH / segs.length;
  ctx.beginPath();
  ctx.arc(cx, bulbCy, bulbR * 0.68, 0, Math.PI * 2);
  ctx.fillStyle = T.BAND_COLOR.boil;
  ctx.fill();
  segs.forEach((b, i) => {
    ctx.fillStyle = T.BAND_COLOR[b];
    ctx.fillRect(cx - inner / 2, tubeBottom - segH * (i + 1), inner, segH + 0.5);
  });
  // tick marks on the right of the tube
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = Math.max(1.5, h / 40);
  for (let i = 0; i < 5; i++) {
    const ty = colTop + ((tubeBottom - colTop) * (i + 0.5)) / 5;
    ctx.beginPath();
    ctx.moveTo(cx + tubeW / 2 + h * 0.05, ty);
    ctx.lineTo(cx + tubeW / 2 + h * (i % 2 ? 0.12 : 0.17), ty);
    ctx.stroke();
  }
}

// --------------------------------------------------------------- buttons

/** Spectrum strip used as the signature under primary buttons. */
function spectrum(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  T.BANDS.forEach((b, i) => g.addColorStop(i / (T.BANDS.length - 1), T.BAND_COLOR[b]));
  rr(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = g;
  ctx.fill();
}

/**
 * Button. o: {id, x, y, w, h, label, kind: primary|secondary|ghost|ad|hint|hintOn,
 * disabled, sub, size, serif, icon}. Registers a hit area grown to the minimum
 * tap size around its centre. Ad buttons always show a play icon and "视频".
 */
function button(ctx, L, hits, o) {
  const { x, y, w, h } = o;
  const kind = o.kind || 'secondary';
  const r = Math.min(L.u(14), h / 2);
  ctx.save();
  let fg = C.ink;
  if (kind === 'primary') {
    if (o.disabled) {
      fillRR(ctx, x, y, w, h, r, C.disabledFill);
      strokeRR(ctx, x, y, w, h, r, C.line, 1.5);
      fg = C.disabledInk;
    } else {
      ctx.shadowColor = 'rgba(30,27,24,0.28)';
      ctx.shadowOffsetY = 3;
      ctx.shadowBlur = 8;
      fillRR(ctx, x, y, w, h, r, C.ink);
      ctx.shadowColor = 'rgba(0,0,0,0)';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      spectrum(ctx, x + h * 0.4, y + h - L.u(8), w - h * 0.8, L.u(3.5));
      fg = C.onInk;
    }
  } else if (kind === 'ad') {
    fillRR(ctx, x, y, w, h, r, C.surface);
    ctx.setLineDash([L.u(6), L.u(4)]);
    strokeRR(ctx, x + 1, y + 1, w - 2, h - 2, r, C.lineStrong, 2);
    ctx.setLineDash([]);
  } else if (kind === 'hintOn') {
    fillRR(ctx, x, y, w, h, r, C.surface);
    strokeRR(ctx, x + 1, y + 1, w - 2, h - 2, r, T.BAND_COLOR.hot, 3);
    fg = C.ink;
  } else if (kind === 'ghost') {
    strokeRR(ctx, x, y, w, h, r, C.lineStrong, 1.5);
  } else if (o.disabled) {
    fillRR(ctx, x, y, w, h, r, C.disabledFill);
    strokeRR(ctx, x, y, w, h, r, C.line, 1.5);
    fg = C.disabledInk;
  } else {
    fillRR(ctx, x, y, w, h, r, C.surface);
    strokeRR(ctx, x, y, w, h, r, C.lineStrong, 1.8);
  }
  const size = o.size || (kind === 'primary' ? T.FS.button : T.FS.bodyL);
  const serif = o.serif != null ? o.serif : false;
  const weight = kind === 'primary' ? 700 : 600;
  const icon = kind === 'ad' || o.icon === 'play' ? L.u(22) : kind === 'hint' || kind === 'hintOn' || o.icon === 'lamp' ? L.u(22) : 0;
  const iconW = icon ? icon + L.u(8) : 0;
  const maxW = w - L.u(16) - iconW;
  let tw = measure(ctx, o.label, size, weight, serif);
  const fit = tw > maxW ? Math.max(T.FS.body, size * (maxW / tw)) : size;
  tw = measure(ctx, o.label, fit, weight, serif);
  const cx0 = x + w / 2 - (tw + iconW) / 2;
  const cy = y + h / 2 - (o.sub ? L.u(9) : 0) - (kind === 'primary' && !o.disabled ? L.u(2) : 0);
  if (icon) {
    if (kind === 'ad' || o.icon === 'play') iconPlay(ctx, cx0 + icon / 2, cy, icon, fg, true);
    else iconLamp(ctx, cx0 + icon / 2, cy, icon, kind === 'hintOn' ? T.BAND_COLOR.hot : fg);
  }
  text(ctx, o.label, cx0 + iconW, cy, { size: fit, weight, serif, color: fg });
  if (o.sub) text(ctx, o.sub, x + w / 2, y + h / 2 + L.u(13), { size: T.FS.body, color: kind === 'primary' ? C.onInk : C.sub, align: 'center', maxW: w - L.u(12) });
  ctx.restore();
  if (o.id && !o.disabled) addTap(hits, L, o.id, x, y, w, h);
  return { x, y, w, h };
}

/** Add a hit area grown to at least the minimum tap size around the centre of the box. */
function addTap(hits, L, id, x, y, w, h) {
  const min = T.METRICS.tap;
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

/** Text-only link with a tap area of at least the minimum size. */
function link(ctx, L, hits, o) {
  const size = o.size || T.FS.body;
  const tw = measure(ctx, o.label, size, o.weight || 600, false);
  const iconW = o.icon ? L.u(32) : 0;
  const total = tw + iconW;
  const x = o.align === 'right' ? o.x - total : o.align === 'center' ? o.x - total / 2 : o.x;
  if (o.icon === 'speaker') iconSpeaker(ctx, x + L.u(12), o.y, L.u(20), o.color || C.ink, o.muted);
  text(ctx, o.label, x + iconW, o.y, { size, weight: o.weight || 600, color: o.color || C.ink });
  if (o.underline) {
    ctx.fillStyle = o.color || C.ink;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(x + iconW, o.y + size * 0.62, tw, 1);
    ctx.globalAlpha = 1;
  }
  if (o.id) addTap(hits, L, o.id, x - L.u(8), o.y - T.METRICS.tap / 2, total + L.u(16), T.METRICS.tap);
}

// ---------------------------------------------------------- temperature

/** Band pill: filled in the band colour, band word in the best-contrast text colour. Returns the width. */
function bandPill(ctx, x, y, band, label, o) {
  o = o || {};
  const size = o.size || T.FS.body;
  const h = o.h || size + 10;
  const tw = measure(ctx, label, size, 800, false);
  const w = Math.max(h * 1.25, tw + 16);
  const fill = T.bandColor(band);
  const ax = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
  fillRR(ctx, ax, y - h / 2, w, h, h / 2, fill);
  if (T.METRICS.hc) strokeRR(ctx, ax, y - h / 2, w, h, h / 2, C.ink, 2);
  text(ctx, label, ax + w / 2, y + 0.5, { size, weight: 800, color: T.textOn(fill), align: 'center' });
  return w;
}

/**
 * Thermometer bar: rounded track, fill to `temp` (0..100) in the band colour,
 * three scale ticks. o.pulse (ms) draws the "waiting" shimmer instead;
 * o.fillT (0..1) scales the fill for the 命中 gold fill animation.
 */
function thermoBar(ctx, x, y, w, h, temp, band, o) {
  o = o || {};
  const r = h / 2;
  fillRR(ctx, x, y, w, h, r, C.track);
  let frac = Math.max(0, Math.min(100, temp || 0)) / 100;
  let color = T.bandColor(band);
  if (o.pulse != null) {
    frac = 0.25 + 0.2 * (1 + Math.sin(o.pulse / 260));
    color = C.sub;
  }
  if (o.fillT != null) frac = frac + (1 - frac) * Math.max(0, Math.min(1, o.fillT));
  const fw = frac > 0 ? Math.max(h, w * frac) : 0;
  if (fw > 0) fillRR(ctx, x, y, Math.min(w, fw), h, r, color);
  // scale ticks
  ctx.fillStyle = 'rgba(30,27,24,0.22)';
  [0.25, 0.5, 0.75].forEach((k) => ctx.fillRect(x + w * k - 0.5, y + h * 0.62, 1, h * 0.38));
  strokeRR(ctx, x, y, w, h, r, T.METRICS.hc ? C.barOutline : C.trackEdge, T.METRICS.hc ? 2 : 1);
}

/** Bucket per-step values to at most `max` columns, each showing the column's highest temperature. */
function bucketTemps(temps, bands, max) {
  const n = temps.length;
  if (n <= max) return { temps: temps.slice(), bands: temps.map((t, i) => (bands && bands[i]) || T.bandOfTemp(t)) };
  const outT = [];
  const outB = [];
  for (let i = 0; i < max; i++) {
    const a = Math.floor((i * n) / max);
    const b = Math.max(a + 1, Math.floor(((i + 1) * n) / max));
    let best = -1;
    let bi = a;
    for (let j = a; j < b && j < n; j++) {
      if (temps[j] > best) {
        best = temps[j];
        bi = j;
      }
    }
    outT.push(best);
    outB.push(bands && bands[bi] ? bands[bi] : T.bandOfTemp(best));
  }
  return { temps: outT, bands: outB };
}

/**
 * Column chart of per-step temperature. One column per step (bucketed to 60),
 * height = T, colour = band. Rounded tops, a baseline, and an optional gold
 * flag on the last column when it solved. Returns nothing.
 */
function tempChart(ctx, x, y, w, h, temps, bands, o) {
  o = o || {};
  const bk = bucketTemps(temps || [], bands || [], 60);
  const n = Math.max(1, bk.temps.length);
  const gap = Math.max(1, Math.min(4, (w / n) * 0.22));
  const colW = (w - gap * (n - 1)) / n;
  const base = y + h;
  fillRR(ctx, x, base + 1, w, 2, 1, C.lineStrong);
  bk.temps.forEach((t, i) => {
    const ch = Math.max(3, (h * Math.max(0, Math.min(100, t))) / 100);
    const cx = x + i * (colW + gap);
    const b = bk.bands[i] || T.bandOfTemp(t);
    fillRR(ctx, cx, base - ch, colW, ch, Math.min(colW / 2, 3), T.bandColor(b));
  });
  if (o.axis) {
    text(ctx, '冷', x, base + 16, { size: T.FS.body, weight: 700, color: C.sub });
    text(ctx, '命中', x + w, base + 16, { size: T.FS.body, weight: 700, color: C.sub, align: 'right' });
  }
}

// ----------------------------------------------------------------- chips

/**
 * One tap chip: a paper tag with a thin ink outline. Returns its rect.
 * o: {id, disabled, size, active}
 */
function chip(ctx, L, hits, x, y, w, h, label, o) {
  o = o || {};
  const r = h / 2;
  ctx.save();
  if (o.disabled) {
    fillRR(ctx, x, y, w, h, r, C.disabledFill);
    strokeRR(ctx, x, y, w, h, r, C.line, 1.2);
  } else {
    fillRR(ctx, x, y + 1.5, w, h, r, 'rgba(30,27,24,0.08)'); // paper-tag shadow
    fillRR(ctx, x, y, w, h, r, o.active ? C.paperDeep : C.surface);
    strokeRR(ctx, x, y, w, h, r, C.ink, o.active ? 2.4 : 1.4);
  }
  text(ctx, label, x + w / 2, y + h / 2 + 0.5, { size: o.size || T.FS.chip, weight: 600, color: o.disabled ? C.disabledInk : C.ink, align: 'center', maxW: w - 12 });
  ctx.restore();
  if (o.id && !o.disabled) hits.add(o.id, x, y, w, Math.max(h, T.METRICS.tap));
  return { x, y, w, h };
}

/** Chip height: 48 (56 in large text); 44 drawn on short screens, the tap area stays 48. */
function chipH(L) {
  if (T.METRICS.large) return L.u(56);
  return L.compact ? 44 : L.u(48);
}

function chipGap(L) {
  return L.compact && !T.METRICS.large ? 6 : L.u(8);
}

/**
 * Flow of chips wrapping onto rows. Returns {h, rows, bottom}. o: {idPrefix,
 * disabled, size, gap, maxRows, minW, h}. Chips are never narrower than minW
 * (two characters) and never wider than the container.
 */
function chipFlow(ctx, L, hits, words, x, y, maxW, o) {
  o = o || {};
  const size = o.size || T.FS.chip;
  const h = o.h || chipH(L);
  const gap = o.gap != null ? o.gap : chipGap(L);
  const pad = L.u(16);
  const minW = o.minW || h * 1.5;
  let cx = x;
  let cy = y;
  let rows = 1;
  (words || []).forEach((wd) => {
    const w = Math.min(maxW, Math.max(minW, measure(ctx, wd, size, 600, false) + pad * 2));
    if (cx > x && cx + w > x + maxW + 0.5) {
      cx = x;
      cy += h + gap;
      rows++;
      if (o.maxRows && rows > o.maxRows) return;
    }
    if (!o.maxRows || rows <= o.maxRows) chip(ctx, L, hits, cx, cy, w, h, wd, { id: o.idPrefix ? o.idPrefix + wd : null, disabled: o.disabled, size });
    cx += w + gap;
  });
  const usedRows = o.maxRows ? Math.min(rows, o.maxRows) : rows;
  return { h: usedRows * h + (usedRows - 1) * gap, rows: usedRows, bottom: y + usedRows * h + (usedRows - 1) * gap };
}

/** Height chipFlow would use (no drawing). */
function chipFlowHeight(ctx, L, words, maxW, o) {
  o = o || {};
  const size = o.size || T.FS.chip;
  const h = o.h || chipH(L);
  const gap = o.gap != null ? o.gap : chipGap(L);
  const pad = L.u(16);
  const minW = o.minW || h * 1.5;
  let cx = 0;
  let rows = 1;
  (words || []).forEach((wd) => {
    const w = Math.min(maxW, Math.max(minW, measure(ctx, wd, size, 600, false) + pad * 2));
    if (cx > 0 && cx + w > maxW + 0.5) {
      cx = 0;
      rows++;
    }
    cx += w + gap;
  });
  if (o.maxRows) rows = Math.min(rows, o.maxRows);
  return words && words.length ? rows * h + (rows - 1) * gap : 0;
}

// ----------------------------------------------------------------- misc

/** Skeleton block with a gentle pulse (t = ms from the logic, optional). */
function skeleton(ctx, x, y, w, h, t, r) {
  const pulse = 0.75 + 0.25 * Math.sin((t || 0) / 380);
  ctx.save();
  ctx.globalAlpha = pulse;
  fillRR(ctx, x, y, w, h, r != null ? r : Math.min(8, h / 2), C.skeleton);
  ctx.restore();
}

/** Card surface. */
function card(ctx, x, y, w, h, o) {
  o = o || {};
  const r = o.r != null ? o.r : 14;
  if (o.shadow) {
    ctx.save();
    ctx.shadowColor = 'rgba(60,40,20,0.16)';
    ctx.shadowOffsetY = 3;
    ctx.shadowBlur = 10;
    fillRR(ctx, x, y, w, h, r, o.fill || C.surface);
    ctx.restore();
  } else fillRR(ctx, x, y, w, h, r, o.fill || C.surface);
  strokeRR(ctx, x, y, w, h, r, o.stroke || C.line, o.lw || 1.5);
}

// ---------------------------------------------------------------- sheets

/**
 * Bottom sheet over a scrim. Registers 'sheet:close' (full screen, closes on
 * outside tap), 'sheet:body' (swallows taps) and the X. Returns inner geometry.
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
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = -2;
  rr(ctx, x, y, w, h + 20, L.u(22));
  ctx.fillStyle = C.sheet;
  ctx.fill();
  ctx.restore();
  strokeRR(ctx, x, y, w, h + 20, L.u(22), C.line, 1.5);
  hits.add('sheet:body', x, y, w, h);
  fillRR(ctx, L.cx - L.u(20), y + L.u(8), L.u(40), 4, 2, 'rgba(30,27,24,0.25)');
  const inner = { x: x + L.pad, y: y + L.u(20), w: w - 2 * L.pad, h: h - L.u(20), sheetX: x, sheetY: y, sheetW: w, sheetH: h };
  if (o.title) text(ctx, o.title, inner.x, y + L.u(38), { size: T.FS.title, weight: 800, serif: true });
  iconClose(ctx, x + w - L.pad - L.u(12), y + L.u(38), L.u(16), C.sub);
  hits.add(closeId, x + w - L.u(64), y + L.u(10), L.u(64), T.METRICS.tap);
  inner.top = y + L.u(64);
  inner.bottom = L.bottomEdge - L.bottomPad;
  return inner;
}

/** Back button level with the capsule. */
function backButton(ctx, L, hits, label, id) {
  const cy = L.back.y + L.back.h / 2;
  iconBack(ctx, L.x0, cy, L.u(14), C.ink);
  text(ctx, label || '返回', L.x0 + L.u(20), cy, { size: T.FS.bodyL, weight: 700, color: C.ink });
  hits.add(id || 'back', L.back.x, L.back.y, L.back.w, L.back.h);
}

/** Message block (centred title + sub lines). Returns the new y. */
function message(ctx, L, lines, top, o) {
  o = o || {};
  let y = top;
  lines.forEach((ln, i) => {
    const big = i === 0;
    y +=
      paragraph(ctx, ln, L.x0 + L.u(8), y, L.contentW - L.u(16), L.u(big ? 32 : 27), {
        size: big ? T.FS.title : T.FS.bodyL,
        weight: big ? 800 : 500,
        serif: big,
        color: big ? C.ink : C.sub,
        align: 'center',
      }) + L.u(8);
  });
  void o;
  return y;
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
  paragraph,
  paragraphHeight,
  paper,
  iconBack,
  iconChevron,
  iconPlay,
  iconClose,
  iconDots,
  iconSpeaker,
  iconCheck,
  iconLamp,
  logoThermometer,
  spectrum,
  button,
  addTap,
  link,
  bandPill,
  thermoBar,
  bucketTemps,
  tempChart,
  chip,
  chipFlow,
  chipFlowHeight,
  chipH,
  chipGap,
  skeleton,
  card,
  sheet,
  backButton,
  message,
};
