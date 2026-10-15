/**
 * Code-drawn seal portraits (CTO-D1, PO-13, spec 3.5). No image files, no
 * network. A pure function of {name, faction, tier, size} (plus the display
 * mode): an ink-seal block in the faction colour with the general's name in
 * seal layout, and a per-tier frame.
 *
 *   draw(ctx, x, y, size, spec, opts)
 *     spec: { name | text, monogram?, factionKey | faction, tier?, frame?, inkText? }
 *       text/name  full name (1-4 characters; longer falls back to the monogram)
 *       factionKey 'wei'|'shu'|'wu'|'qun'|'jin' (colour comes from the live
 *                  palette, so high contrast swaps it automatically)
 *       tier       'jia'|'yi'|'bing'|null  -> frame
 *       frame      'jia'|'yi'|'bing'|'plain' overrides tier ('plain' = the 乙
 *                  style for everyone, used in 识人 drafts so tier does not leak)
 *     opts: { dim, full (force the full name below 48pt), dpr }
 *
 * Layout (PO-13): 1 char centred; 2 chars side by side, read right to left;
 * 3 chars = a right column of 1 large char + a left column of 2; 4 chars = 2 x 2
 * (right column first). Below 48pt only the monogram is drawn, unless opts.full.
 * Frames: 甲 double border with gold corner marks, 乙 single border,
 * 丙 thin worn (broken) border. The tier character is drawn as text by the
 * caller (widgets.tierBadge), never by frame alone.
 *
 * Optional cache: setCanvasFactory(fn) with fn(w, h) -> canvas (wx.createCanvas
 * or OffscreenCanvas) renders each distinct seal once. Without it every call
 * draws directly (about 30 canvas calls), which is fine for an 8-row pool.
 */

const T = require('./theme');

const FULL_MIN = 48; // pt: below this only the monogram is drawn

let factory = null;
const cache = {};
let cacheCount = 0;

function setCanvasFactory(fn) {
  factory = fn || null;
  clearCache();
}

function clearCache() {
  Object.keys(cache).forEach((k) => delete cache[k]);
  cacheCount = 0;
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic 0..1 stream from a seed. */
function rng(seed) {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s % 100000) / 100000;
  };
}

function fontStr(px) {
  return '900 ' + Math.round(px * 10) / 10 + 'px ' + T.SERIF;
}

function rrPath(ctx, x, y, w, h, r) {
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

/** One glyph centred at (cx, cy), stretched vertically by sy (seal glyphs are tall). */
function glyph(ctx, ch, cx, cy, size, sy, color) {
  ctx.save();
  ctx.translate(cx, cy + size * 0.04 * sy);
  if (sy !== 1) ctx.scale(1, sy);
  ctx.font = fontStr(size);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, 0, 0);
  ctx.restore();
}

function frameKind(spec) {
  const f = spec.frame || spec.tier;
  if (f === 'jia' || f === 'bing') return f;
  return 'yi'; // yi, plain, null, unknown
}

/** Which characters will be drawn at this size. */
function glyphsFor(spec, size, full) {
  const name = Array.from(String(spec.text || spec.name || ''));
  const mono = spec.monogram || (name.length ? name[name.length - 1] : '?');
  if ((size >= FULL_MIN || full) && name.length >= 1 && name.length <= 4) return name;
  return [mono];
}

function frameColor(key) {
  // The 月白 fill is too pale to carry a frame line on paper: use a slate line.
  if (key === 'jin' && !T.isHC()) return '#6B7F93';
  return T.factionColor(key, T.COLORS.sub);
}

function drawFrame(ctx, x, y, S, kind, key, rnd) {
  const C = T.COLORS;
  const col = frameColor(key);
  const lw = Math.max(1, S * 0.032);
  ctx.save();
  ctx.lineCap = 'butt';
  if (kind === 'jia') {
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    rrPath(ctx, x + lw / 2, y + lw / 2, S - lw, S - lw, S * 0.1);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, lw * 0.7);
    const i2 = S * 0.062;
    rrPath(ctx, x + i2, y + i2, S - 2 * i2, S - 2 * i2, S * 0.07);
    ctx.stroke();
    // four gold corner marks (L brackets) on the outer ring
    const mk = S * 0.2;
    const t = Math.max(1.6, S * 0.05);
    ctx.fillStyle = T.isHC() ? C.ink : C.gold;
    [
      [x, y, 1, 1],
      [x + S, y, -1, 1],
      [x, y + S, 1, -1],
      [x + S, y + S, -1, -1],
    ].forEach(([cx, cy, dx, dy]) => {
      ctx.fillRect(dx > 0 ? cx : cx - mk, dy > 0 ? cy : cy - t, mk, t);
      ctx.fillRect(dx > 0 ? cx : cx - t, dy > 0 ? cy : cy - mk, t, mk);
    });
  } else if (kind === 'yi') {
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    rrPath(ctx, x + lw / 2 + S * 0.01, y + lw / 2 + S * 0.01, S - lw - S * 0.02, S - lw - S * 0.02, S * 0.1);
    ctx.stroke();
  } else {
    // 丙: thin border, worn: each side loses a stretch (deterministic)
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(1, lw * 0.7);
    const p = S * 0.03;
    const a = S - 2 * p;
    for (let side = 0; side < 4; side++) {
      const gapAt = 0.15 + rnd() * 0.55;
      const gapLen = 0.14 + rnd() * 0.14;
      const segs = [
        [0, gapAt],
        [Math.min(1, gapAt + gapLen), 1],
      ];
      segs.forEach(([s0, s1]) => {
        if (s1 - s0 <= 0.02) return;
        ctx.beginPath();
        const pt = (t) => {
          if (side === 0) return [x + p + a * t, y + p];
          if (side === 1) return [x + p + a, y + p + a * t];
          if (side === 2) return [x + p + a * (1 - t), y + p + a];
          return [x + p, y + p + a * (1 - t)];
        };
        const q0 = pt(s0);
        const q1 = pt(s1);
        ctx.moveTo(q0[0], q0[1]);
        ctx.lineTo(q1[0], q1[1]);
        ctx.stroke();
      });
    }
  }
  ctx.restore();
}

function drawNow(ctx, x, y, S, spec, opts) {
  const key = spec.factionKey || spec.faction || 'qun';
  const fill = T.factionColor(key, spec.color);
  const ink = spec.inkText && key !== 'jin' && !T.isHC() ? T.COLORS.ink : T.factionInk(key);
  const kind = frameKind(spec);
  const chars = glyphsFor(spec, S, opts.full);
  const seed = hash((spec.text || spec.name || '') + '|' + key);
  const rnd = rng(seed);

  ctx.save();
  if (opts.dim) ctx.globalAlpha = (ctx.globalAlpha == null ? 1 : ctx.globalAlpha) * 0.45;

  drawFrame(ctx, x, y, S, kind, key, rnd);

  const m = S * 0.115;
  const bx = x + m;
  const by = y + m;
  const B = S - 2 * m;
  // ink bleed: a soft second edge, then the solid block
  ctx.globalAlpha = (ctx.globalAlpha == null ? 1 : ctx.globalAlpha) * 1;
  const base = ctx.globalAlpha;
  ctx.globalAlpha = base * 0.35;
  rrPath(ctx, bx - S * 0.012, by - S * 0.01, B + S * 0.024, B + S * 0.02, B * 0.1);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.globalAlpha = base;
  rrPath(ctx, bx, by, B, B, B * 0.08);
  ctx.fillStyle = fill;
  ctx.fill();
  if (key === 'jin' && !T.isHC()) {
    rrPath(ctx, bx, by, B, B, B * 0.08);
    ctx.strokeStyle = 'rgba(70,90,110,0.55)';
    ctx.lineWidth = Math.max(1, S * 0.02);
    ctx.stroke();
  }

  // worn-ink speckles (no texture in high contrast)
  if (!T.isHC() && S >= 30) {
    const paperDot = key === 'jin' ? 'rgba(255,255,255,0.55)' : 'rgba(246,233,208,0.28)';
    ctx.fillStyle = paperDot;
    const n = 5 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const px = bx + B * (0.06 + rnd() * 0.88);
      const py = by + B * (0.06 + rnd() * 0.88);
      const r = S * (0.008 + rnd() * 0.016);
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // characters
  const pad = B * 0.09;
  const ia = B - 2 * pad;
  const cx = bx + B / 2;
  const cy = by + B / 2;
  const n = chars.length;
  if (n === 1) {
    glyph(ctx, chars[0], cx, cy, ia * 0.86, 1, ink);
  } else if (n === 2) {
    const sz = (ia / 2) * 1.02;
    glyph(ctx, chars[0], cx + ia / 4, cy, sz, 1.22, ink);
    glyph(ctx, chars[1], cx - ia / 4, cy, sz, 1.22, ink);
  } else if (n === 3) {
    const rw = ia * 0.54;
    const lw2 = ia * 0.46;
    glyph(ctx, chars[0], cx + ia / 2 - rw / 2, cy, rw * 0.98, 1.3, ink);
    const sz = Math.min(lw2 * 0.98, ia / 2.05);
    glyph(ctx, chars[1], cx - ia / 2 + lw2 / 2, cy - ia / 4, sz, 1, ink);
    glyph(ctx, chars[2], cx - ia / 2 + lw2 / 2, cy + ia / 4, sz, 1, ink);
  } else {
    const sz = (ia / 2) * 0.98;
    glyph(ctx, chars[0], cx + ia / 4, cy - ia / 4, sz, 1, ink);
    glyph(ctx, chars[1], cx + ia / 4, cy + ia / 4, sz, 1, ink);
    glyph(ctx, chars[2], cx - ia / 4, cy - ia / 4, sz, 1, ink);
    glyph(ctx, chars[3], cx - ia / 4, cy + ia / 4, sz, 1, ink);
  }
  ctx.restore();
}

function cacheKey(S, spec, opts) {
  const key = spec.factionKey || spec.faction || 'qun';
  return [spec.text || spec.name || '', spec.monogram || '', key, frameKind(spec), Math.round(S * 100), opts.dpr || 1, T.isHC() ? 1 : 0, opts.full ? 1 : 0, spec.inkText ? 1 : 0].join('|');
}

function draw(ctx, x, y, size, spec, opts) {
  spec = spec || {};
  opts = opts || {};
  if (factory && size >= 24 && !opts.noCache) {
    const k = cacheKey(size, spec, opts);
    let c = cache[k];
    if (!c) {
      try {
        const dpr = opts.dpr || 1;
        const pad = 2;
        const cv = factory(Math.ceil((size + 2 * pad) * dpr), Math.ceil((size + 2 * pad) * dpr));
        const cctx = cv.getContext('2d');
        cctx.scale(dpr, dpr);
        drawNow(cctx, pad, pad, size, spec, Object.assign({}, opts, { dim: false }));
        if (cacheCount > 200) clearCache();
        c = cache[k] = { cv, pad };
        cacheCount++;
      } catch (e) {
        c = null;
      }
    }
    if (c) {
      ctx.save();
      if (opts.dim) ctx.globalAlpha = 0.45;
      ctx.drawImage(c.cv, x - c.pad, y - c.pad, size + 2 * c.pad, size + 2 * c.pad);
      ctx.restore();
      return;
    }
  }
  drawNow(ctx, x, y, size, spec, opts);
}

module.exports = { draw, setCanvasFactory, clearCache, glyphsFor, frameKind, hash, FULL_MIN };
