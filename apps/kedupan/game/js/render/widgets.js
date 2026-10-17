/**
 * Shared drawing widgets. Pure canvas 2D calls (a WeChat-safe subset: no roundRect, no letterSpacing, no filter).
 * No wx, no state, no timers. Colours and type sizes come from the live tokens in theme.js.
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
 * One line of text. o: {size, weight, color, align, baseline, maxW (shrinks to fit down to minSize, then truncates with an
 * ellipsis), minSize, alpha}. Returns the drawn width.
 */
function text(ctx, str, x, y, o) {
  o = o || {};
  str = str == null ? '' : String(str);
  let size = o.size || T.FS.body;
  ctx.font = font(size, o.weight);
  let w = ctx.measureText(str).width;
  if (o.maxW && w > o.maxW) {
    const min = o.minSize || T.FS.body;
    size = Math.max(min, Math.floor(size * (o.maxW / w) * 99) / 100); // 1% margin: font sizes round to 0.1 px
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

/** Break text into lines no wider than maxW (CJK anywhere, no closing punctuation at a line start). */
function wrap(ctx, str, maxW, size, weight) {
  ctx.font = font(size, weight);
  str = String(str == null ? '' : str).replace(/(\d) +%/g, '$1%'); // "68 %" -> "68%": the sign stays with its number
  const lines = [];
  let line = '';
  const noStart = '，。！？、；：）】」』”’》…,.!?;:)';
  Array.from(String(str == null ? '' : str)).forEach((ch) => {
    if (ch === '\n') {
      lines.push(line);
      line = '';
      return;
    }
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line) {
      // never orphan a "%" or split a number: carry the number it belongs to onto the next line
      if (ch === '%' || /[0-9]/.test(ch)) {
        const chars = Array.from(line);
        const keep = ch === '%' ? /[0-9. ]/ : /[0-9.]/;
        const carry = [];
        while (chars.length > 1 && keep.test(chars[chars.length - 1])) carry.unshift(chars.pop());
        if (carry.length) {
          while (chars.length && chars[chars.length - 1] === ' ') chars.pop();
          lines.push(chars.join(''));
          line = carry.join('').replace(/^ +/, '') + ch;
          return;
        }
      }
      if (noStart.indexOf(ch) >= 0 && Array.from(line).length > 1) {
        const chars = Array.from(line);
        const carry = chars.pop();
        lines.push(chars.join(''));
        line = carry + ch;
        return;
      }
      lines.push(line);
      line = ch === ' ' ? '' : ch;
    } else line = test;
  });
  if (line) lines.push(line);
  // no one-character last line (a widow like "置"): pull one more character down from the line above
  const n = lines.length;
  if (n >= 2 && Array.from(lines[n - 1]).length === 1 && Array.from(lines[n - 2]).length > 3 && noStart.indexOf(lines[n - 1]) < 0) {
    const prev = Array.from(lines[n - 2]);
    const last = prev.pop();
    if (last !== ' ' && !/[0-9A-Za-z.%]/.test(last) && noStart.indexOf(last) < 0) {
      lines[n - 2] = prev.join('');
      lines[n - 1] = last + lines[n - 1];
    }
  }
  return lines;
}

/** wrap(), then the narrowest width that keeps the same number of lines: balanced lines, no short last line (captions, notes). */
function wrapBalanced(ctx, str, maxW, size, weight) {
  const base = wrap(ctx, str, maxW, size, weight);
  if (base.length < 2) return base;
  let lo = maxW / base.length;
  let hi = maxW;
  for (let i = 0; i < 14; i++) {
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
    let last = Array.from(lines[o.maxLines - 1]);
    while (last.length > 1 && measure(ctx, last.join('') + '…', size, o.weight) > maxW) last.pop();
    lines[o.maxLines - 1] = last.join('') + '…';
  }
  lines.forEach((ln, i) => text(ctx, ln, o.align === 'center' ? x + maxW / 2 : x, y + lineH * i + lineH / 2, { size, weight: o.weight, color: o.color, align: o.align || 'left' }));
  return lines.length * lineH;
}

/** Height a paragraph will take (for block layout). */
function paraH(ctx, str, maxW, lineH, o) {
  o = o || {};
  const n = wrap(ctx, str, maxW, o.size || T.FS.body, o.weight).length;
  return (o.maxLines ? Math.min(n, o.maxLines) : n) * lineH;
}

// ------------------------------------------------------------ backgrounds

/** Sunny desk: warm paper with a faint grid of tape-measure ticks along the very top. High contrast: plain white. */
function paper(ctx, L) {
  if (T.isHC()) {
    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, L.W, L.H);
    return;
  }
  const g = ctx.createLinearGradient(0, 0, 0, L.H);
  g.addColorStop(0, C.paperTop);
  g.addColorStop(1, C.paperBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L.W, L.H);
}

// ----------------------------------------------------------------- icons

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
 * Button. o: {id, x, y, w, h, label, kind: primary|secondary|ghost|ad|danger, disabled, sub (second line), size, icon: 'play'}.
 * Disabled buttons register no hit area. Ad buttons always show a play icon and the word 视频 is in the label (logic).
 */
function button(ctx, L, hits, o) {
  const { x, y, w } = o;
  const h = Math.max(o.h || 0, T.minBtn());
  const kind = o.kind || 'secondary';
  const hc = T.isHC();
  const r = Math.min(L.u(14), h / 2);
  ctx.save();
  if (o.disabled) ctx.globalAlpha = 0.5;
  let fg = C.ink;
  if (kind === 'primary') {
    if (!hc) {
      ctx.shadowColor = C.primaryShadow;
      ctx.shadowOffsetY = 3;
      ctx.shadowBlur = 8;
    }
    fillRR(ctx, x, y, w, h, r, C.primary);
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    fg = C.primaryInk;
  } else if (kind === 'danger') {
    fillRR(ctx, x, y, w, h, r, C.tile);
    strokeRR(ctx, x, y, w, h, r, C.danger, 2);
    fg = C.danger;
  } else if (kind === 'ad') {
    fillRR(ctx, x, y, w, h, r, C.tile);
    ctx.setLineDash([L.u(6), L.u(4)]);
    strokeRR(ctx, x + 1, y + 1, w - 2, h - 2, r, C.lineStrong, 2);
    ctx.setLineDash([]);
  } else if (kind === 'ghost') {
    strokeRR(ctx, x, y, w, h, r, C.lineStrong, 1.5);
  } else {
    fillRR(ctx, x, y, w, h, r, C.tile);
    strokeRR(ctx, x, y, w, h, r, C.lineStrong, hc ? 2 : 1.5);
  }
  const size = o.size || (kind === 'primary' ? T.FS.button : T.FS.bodyL);
  const weight = kind === 'primary' ? 800 : 700;
  const icon = kind === 'ad' || o.icon === 'play' ? L.u(T.isLarge() ? 26 : 22) : 0;
  const iconW = icon ? icon + L.u(8) : 0;
  const maxW = w - L.u(16) - iconW;
  let tw = measure(ctx, o.label, size, weight);
  const fit = tw > maxW ? Math.max(T.FS.body, size * (maxW / tw)) : size;
  tw = measure(ctx, o.label, fit, weight);
  const cx0 = x + w / 2 - (tw + iconW) / 2;
  const cy = y + h / 2 - (o.sub ? L.u(9) * T.K() : 0);
  if (icon) iconPlay(ctx, cx0 + icon / 2, cy, icon, fg, true);
  text(ctx, o.label, cx0 + iconW, cy, { size: fit, weight, color: fg, maxW: w - L.u(10) - iconW });
  if (o.sub) text(ctx, o.sub, x + w / 2, y + h / 2 + L.u(13) * T.K(), { size: T.FS.body, color: kind === 'primary' ? C.primaryInk : C.sub, align: 'center', maxW: w - L.u(12) });
  ctx.restore();
  if (o.id && !o.disabled) addTap(hits, L, o.id, x, y, w, h);
  return { x, y, w, h };
}

/** Text-only link with a 48pt tap area. Returns the width. */
function link(ctx, L, hits, o) {
  const size = o.size || T.FS.body;
  const tw = measure(ctx, o.label, size, o.weight || 700);
  const x = o.align === 'right' ? o.x - tw : o.align === 'center' ? o.x - tw / 2 : o.x;
  text(ctx, o.label, x, o.y, { size, weight: o.weight || 700, color: o.color || C.primary });
  ctx.fillStyle = o.color || C.primary;
  ctx.globalAlpha = 0.7;
  ctx.fillRect(x, o.y + size * 0.62, tw, 1.5);
  ctx.globalAlpha = 1;
  if (o.id) addTap(hits, L, o.id, x - L.u(8), o.y - T.MIN_TAP / 2, tw + L.u(16), T.MIN_TAP);
  return tw;
}

/** Small outlined pill. Returns its width. */
function pill(ctx, L, x, y, label, o) {
  o = o || {};
  const size = o.size || T.FS.body;
  const color = o.color || C.primary;
  const tw = measure(ctx, label, size, 700);
  const w = tw + L.u(16);
  const h = size + L.u(10);
  const px = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
  fillRR(ctx, px, y - h / 2, w, h, h / 2, o.fill || C.tintPrimary);
  strokeRR(ctx, px, y - h / 2, w, h, h / 2, color, T.isHC() ? 2 : 1.5);
  text(ctx, label, px + w / 2, y + 1, { size, weight: 700, color, align: 'center' });
  return w;
}

/** Skeleton block with a gentle pulse (t = ms from logic). */
function skeleton(ctx, x, y, w, h, t, r) {
  const pulse = 0.75 + 0.25 * Math.sin((t || 0) / 380);
  ctx.save();
  ctx.globalAlpha = pulse;
  fillRR(ctx, x, y, w, h, r != null ? r : Math.min(8, h / 2), C.skeleton);
  ctx.restore();
}

/** Card surface (white-ish note on the desk). */
function card(ctx, x, y, w, h, o) {
  o = o || {};
  const r = o.r != null ? o.r : 14;
  if (o.shadow !== false && !T.isHC()) {
    ctx.save();
    ctx.shadowColor = 'rgba(60,40,20,0.16)';
    ctx.shadowOffsetY = 2;
    ctx.shadowBlur = 8;
    fillRR(ctx, x, y, w, h, r, o.fill || C.tile);
    ctx.restore();
  } else fillRR(ctx, x, y, w, h, r, o.fill || C.tile);
  strokeRR(ctx, x, y, w, h, r, o.stroke || C.line, o.lw || (T.isHC() ? 2 : 1));
}

/**
 * Sticky note: a slightly rotated square-ish paper with a soft shadow and a strip of tape at the top.
 * o: {fill, angle (deg), tape: bool}. Text is drawn by the caller inside the returned (unrotated) rect.
 */
function stickyNote(ctx, x, y, w, h, o) {
  o = o || {};
  const a = ((o.angle || 0) * Math.PI) / 180;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(a);
  if (!T.isHC()) {
    ctx.shadowColor = C.noteShadow;
    ctx.shadowOffsetY = 3;
    ctx.shadowBlur = 6;
  }
  fillRR(ctx, -w / 2, -h / 2, w, h, 6, o.fill || C.noteYellow);
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  if (T.isHC()) strokeRR(ctx, -w / 2, -h / 2, w, h, 6, C.ink, 2);
  ctx.restore();
}

// ------------------------------------------------------------ scrolling

function clampN(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Vertical scroll region. area {x,y,w,h}; contentH px; scroll = offset; id = scroll hit id (and scrollMax key).
 * drawFn(scrollOffset) draws in content coordinates starting at area.y. Registers the drag area first (later areas win),
 * clips drawing and tap areas. Returns {scroll, maxScroll}.
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
    fillRR(ctx, area.x + area.w + 2, by, 3, bh, 1.5, T.isHC() ? C.ink : 'rgba(36,33,30,0.35)');
  }
  return { scroll: sc, maxScroll };
}

/**
 * Block stack. blocks = [{h, gap?, partial?, draw(ctx, x, y, w)}]; heights are measured by the builder, so layout is decided before
 * anything is drawn. Draws top-anchored in the area. If the stack is taller it scrolls under scrollId, and at scroll 0 the viewport is
 * cut at a block boundary so no line or button is ever half visible (the viewport is shorter than the area; the rest is one scroll
 * away). A block with partial: true (a list, a canvas) may be cut anywhere. Returns {total, vp}.
 */
function stack(ctx, L, hits, area, blocks, scroll, scrollId, gap) {
  const g = gap == null ? L.u(10) : gap;
  const starts = [];
  let total = 0;
  blocks.forEach((b, i) => {
    total += i ? (b.gap != null ? b.gap : g) : 0;
    starts.push(total);
    total += b.h;
  });
  const run = () => {
    blocks.forEach((b, i) => b.draw(ctx, area.x, area.y + starts[i], area.w));
  };
  if (total <= area.h) {
    run();
    return { total, vp: { x: area.x, y: area.y, w: area.w, h: total } };
  }
  let vpH = 0;
  let free = false;
  blocks.forEach((b, i) => {
    const end = starts[i] + b.h;
    if (end <= area.h) vpH = Math.max(vpH, end);
    else if (b.partial && starts[i] < area.h) free = true;
  });
  if (free || vpH <= 0) vpH = area.h;
  const vp = { x: area.x, y: area.y, w: area.w, h: vpH };
  scrollBody(ctx, hits, vp, total, scroll, scrollId, run);
  return { total, vp };
}

const snapStack = stack;

// --------------------------------------------------------------- sheets

/**
 * Bottom sheet over a scrim. Registers 'sheet:scrim'-style swallow (tap outside = sheet:close per CONTRACT: the scrim and the X
 * share `sheet:close`) and 'sheet:body' (swallows taps). Returns the inner geometry.
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
  if (!T.isHC()) {
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = -2;
  }
  rr(ctx, x, y, w, h + 20, L.u(22));
  ctx.fillStyle = C.sheet;
  ctx.fill();
  ctx.restore();
  strokeRR(ctx, x, y, w, h + 20, L.u(22), T.isHC() ? C.ink : C.line, T.isHC() ? 2.5 : 1.5);
  hits.add('sheet:body', x, y, w, h);
  fillRR(ctx, L.cx - L.u(20), y + L.u(8), L.u(40), 4, 2, T.isHC() ? C.ink : 'rgba(36,33,30,0.25)');
  const inner = { x: x + L.pad, y: y + L.u(20), w: w - 2 * L.pad, h: h - L.u(20), sheetX: x, sheetY: y, sheetW: w, sheetH: h };
  if (o.title) text(ctx, o.title, inner.x, y + L.u(38), { size: T.FS.title, weight: 800, maxW: w - 2 * L.pad - L.u(60) });
  iconClose(ctx, x + w - L.pad - L.u(12), y + L.u(38), L.u(16), C.sub);
  hits.add(closeId, x + w - L.u(64), y + L.u(12), L.u(64), T.MIN_TAP);
  inner.top = y + L.u(T.isLarge() ? 70 : 62);
  inner.bottom = L.bottomEdge - L.bottomPad;
  return inner;
}

/** "‹ 返回" level with the capsule. */
function backButton(ctx, L, hits, label, id) {
  const cy = L.back.y + L.back.h / 2;
  iconBack(ctx, L.x0, cy, L.u(15), C.ink);
  text(ctx, label || '返回', L.x0 + L.u(22), cy, { size: T.FS.bodyL, weight: 700, color: C.ink });
  hits.add(id || 'back', L.back.x, L.back.y, L.back.w, L.back.h);
}

/** Banner placeholder drawn only in stub mode (vm.banner.stub). */
function bannerSlot(ctx, L, rect, stub) {
  if (!stub || !rect) return;
  fillRR(ctx, rect.x, rect.y, rect.w, rect.h, L.u(6), 'rgba(120,120,120,0.30)');
  strokeRR(ctx, rect.x, rect.y, rect.w, rect.h, L.u(6), C.lineStrong, 1);
  text(ctx, '广告位（测试）', rect.x + rect.w / 2, rect.y + rect.h / 2, { size: T.FS.body, color: C.ink, align: 'center' });
}

/** A radio dot + label row (create: clue mode). Returns nothing; registers the hit itself. */
function radio(ctx, L, hits, o) {
  const r = L.u(11);
  const cy = o.y + o.h / 2;
  ctx.beginPath();
  ctx.arc(o.x + r, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = o.on ? C.primary : C.lineStrong;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (o.on) {
    ctx.beginPath();
    ctx.arc(o.x + r, cy, r * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = C.primary;
    ctx.fill();
  }
  text(ctx, o.label, o.x + 2 * r + L.u(8), cy, { size: T.FS.bodyL, weight: o.on ? 800 : 600, maxW: o.w - 2 * r - L.u(8) });
  if (o.id) hits.add(o.id, o.x - L.u(4), o.y, o.w, Math.max(o.h, T.MIN_TAP));
}

/** Chip (preset clue). Returns {w,h}. */
function chip(ctx, L, hits, o) {
  const size = T.FS.bodyL;
  const w = o.w;
  const h = Math.max(o.h, T.minBtn());
  fillRR(ctx, o.x, o.y, w, h, h / 2, o.on ? C.primary : C.tile);
  strokeRR(ctx, o.x, o.y, w, h, h / 2, o.on ? C.primary : C.lineStrong, T.isHC() ? 2 : 1.5);
  text(ctx, o.label, o.x + w / 2, o.y + h / 2, { size, weight: 700, color: o.on ? C.primaryInk : C.ink, align: 'center', maxW: w - L.u(14) });
  if (o.id) hits.add(o.id, o.x, o.y, w, h);
  return { w, h };
}

/** Centered state message (empty / error / notFound) with up to two buttons. Returns the bottom y. */
function stateMessage(ctx, L, hits, o) {
  const w = L.contentW;
  const lh = Math.round(T.FS.bodyL * 1.5);
  const ln = wrap(ctx, o.text, w - L.u(16), T.FS.bodyL, 600);
  let y = o.y;
  if (o.title) {
    text(ctx, o.title, L.cx, y + L.u(16), { size: T.FS.title, weight: 800, align: 'center', maxW: w });
    y += L.u(40);
  }
  ln.forEach((s, i) => text(ctx, s, L.cx, y + lh * i + lh / 2, { size: T.FS.bodyL, weight: 600, color: C.sub, align: 'center' }));
  y += ln.length * lh + L.u(16);
  (o.buttons || []).forEach((b) => {
    const bh = T.btn(L, 52);
    button(ctx, L, hits, Object.assign({ x: L.x0 + L.u(20), w: w - L.u(40), y, h: bh }, b));
    y += bh + L.u(12);
  });
  return y;
}

/** Page frame: background, "‹ 返回" and an optional title line below the capsule row. Returns the content top y. */
function frame(ctx, L, hits, o) {
  paper(ctx, L);
  backButton(ctx, L, hits, o.backLabel, o.backId);
  let y = L.navBottom + L.u(6);
  if (o.title) {
    const tw = L.contentW - (o.right ? L.u(70) : 0);
    // a title that does not fit beside the counter wraps to a second line (never ellipsised)
    const tl = wrap(ctx, o.title, tw, T.FS.bodyL, 800);
    const tlh = Math.round(T.FS.bodyL * 1.3);
    tl.forEach((ln, i) => text(ctx, ln, L.x0, y + L.u(16) + i * tlh, { size: T.FS.bodyL, weight: 800 }));
    if (o.right) text(ctx, o.right, L.x0 + L.contentW, y + L.u(16), { size: T.FS.bodyL, weight: 700, color: C.sub, align: 'right' });
    y += L.u(T.isLarge() ? 40 : 34) + (tl.length - 1) * tlh;
  }
  return y;
}

/** Paper confetti (心有灵犀). c = {t: 0..1, seed}. Deterministic from the seed; pieces burst up from (cx, cy) and fall. */
function confetti(ctx, L, cx, cy, c) {
  if (!c || !(c.t >= 0) || c.t >= 1) return;
  let s = (c.seed | 0) || 7;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const colors = T.isHC() ? ['#B04A00', '#145F5F', '#4E2A5C', '#000000'] : ['#F07B2C', '#2A8C8C', '#7D4E8C', '#F2C94C'];
  const t = c.t;
  ctx.save();
  ctx.globalAlpha = t < 0.7 ? 1 : Math.max(0, (1 - t) / 0.3);
  for (let i = 0; i < 30; i++) {
    const ang = -Math.PI / 2 + (rnd() - 0.5) * 2.4;
    const sp = L.u(120 + rnd() * 160);
    const x = cx + Math.cos(ang) * sp * t;
    const y = cy + Math.sin(ang) * sp * t + L.u(260) * t * t;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rnd() * 6 + t * (rnd() * 8));
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(-L.u(4), -L.u(2.5), L.u(8), L.u(5));
    ctx.restore();
  }
  ctx.restore();
}

module.exports = {
  confetti,
  font,
  rr,
  fillRR,
  strokeRR,
  text,
  measure,
  wrap,
  wrapBalanced,
  paragraph,
  paraH,
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
  skeleton,
  card,
  stickyNote,
  scrollBody,
  stack,
  snapStack,
  sheet,
  backButton,
  bannerSlot,
  radio,
  chip,
  stateMessage,
  frame,
};
