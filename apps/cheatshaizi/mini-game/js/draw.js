/**
 * Canvas drawing helpers shared by both scenes: the backdrop, text with
 * letter-spacing, and the big red button. These stand in for app.wxss.
 */

const FONT_FAMILY = 'sans-serif';

function font(size, bold) {
  return (bold ? 'bold ' : '') + Math.round(size) + 'px ' + FONT_FAMILY;
}

/** Scattered starfield dots for the background, positioned like the CSS. */
function sparkles(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      left: Math.random(), // fraction of the stage width
      top: Math.random() * 0.92, // fraction of the stage height
      size: 3 + Math.random() * 5, // rpx
      opacity: 0.18 + Math.random() * 0.5,
    });
  }
  return out;
}

/**
 * Black stage with the blue glow from the renders in visuals/.
 *
 * The CSS is `radial-gradient(ellipse at 50% 42%, ...)`, whose default size
 * is farthest-corner: an ellipse with the closest-side aspect ratio, grown
 * until it reaches the farthest corner. Canvas only does circles, so the
 * circle is drawn in a vertically squashed space.
 *
 * The glow is placed against the stage (the old page area) but fills the
 * whole screen, so the strip above the stage is painted too.
 */
function paintBackdrop(ctx, L, dots) {
  const s = L.stage;
  const cx = s.x + s.w * 0.5;
  const cy = s.y + s.h * 0.42;
  const k = (s.h * 0.42) / (s.w * 0.5); // closest-side ry / rx
  const dx = s.w * 0.5;
  const dy = s.h * 0.58;
  const rx = Math.sqrt(dx * dx + (dy / k) * (dy / k));

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, L.width, L.height);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, k);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, '#0b2f9e');
  g.addColorStop(0.28, '#071d6b');
  g.addColorStop(0.58, '#030a2a');
  g.addColorStop(0.85, '#000000');
  ctx.fillStyle = g;
  ctx.fillRect(-cx, -cy / k, L.width, L.height / k);
  ctx.restore();

  ctx.fillStyle = '#ffffff';
  for (const d of dots) {
    const size = d.size * L.r;
    ctx.globalAlpha = d.opacity;
    ctx.beginPath();
    ctx.arc(s.x + d.left * s.w + size / 2, s.y + d.top * s.h + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/**
 * Pre-render the backdrop once per scene, so each frame is a single blit.
 * In a mini-game every wx.createCanvas() after the first is off-screen.
 */
function backdropCanvas(L, dpr, dots) {
  const c = wx.createCanvas();
  c.width = Math.round(L.width * dpr);
  c.height = Math.round(L.height * dpr);
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  paintBackdrop(ctx, L, dots);
  return c;
}

/** Width of `text` as CSS lays it out: every glyph plus `spacing` after it. */
function spacedWidth(ctx, text, spacing) {
  let w = 0;
  for (const ch of Array.from(text)) w += ctx.measureText(ch).width + spacing;
  return w;
}

/**
 * Centred text with CSS letter-spacing, which canvas lacks. Set the font,
 * colour and baseline first. CSS adds the gap after the last glyph too, so
 * that is kept in the width to centre the same way the page did.
 */
function spacedText(ctx, text, cx, y, spacing) {
  const chars = Array.from(text);
  let x = cx - spacedWidth(ctx, text, spacing) / 2;
  ctx.textAlign = 'left';
  for (const ch of chars) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + spacing;
  }
}

/**
 * The big red button: a #cfd6e4 ring around
 * `radial-gradient(circle at 38% 30%, #ff6a5e, #e0251c 55%, #a81109)`,
 * with a drop shadow. `scale` is the pressed state. Shadow sizes are in
 * device pixels, since canvas transforms do not apply to them.
 */
function redButton(ctx, b, scale, dpr) {
  ctx.save();
  ctx.translate(b.cx, b.cy);
  ctx.scale(scale, scale);

  ctx.shadowColor = 'rgba(0, 0, 0, ' + b.shadow.alpha + ')';
  ctx.shadowOffsetY = b.shadow.dy * dpr;
  ctx.shadowBlur = b.shadow.blur * dpr;
  ctx.fillStyle = '#cfd6e4';
  ctx.beginPath();
  ctx.arc(0, 0, b.outer, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'rgba(0, 0, 0, 0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  const d = b.inner * 2;
  const gx = -b.inner + d * 0.38;
  const gy = -b.inner + d * 0.3;
  const reach = Math.hypot(d * 0.62, d * 0.7); // to the farthest corner
  const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, reach);
  g.addColorStop(0, '#ff6a5e');
  g.addColorStop(0.55, '#e0251c');
  g.addColorStop(1, '#a81109');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, b.inner, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * How far to shift a glyph so its ink, not its em box, is centred on the
 * drawing point. `textBaseline: 'middle'` centres the em box, and symbols
 * like ⚙ sit well off-centre in it, by an amount that depends on the
 * device's font. So render the glyph once, find its inked pixels, and cache
 * the offset as a fraction of the font size.
 */
const INK_SIZE = 100;
const inkCache = {};
let inkCanvas = null;

function inkOffset(glyph) {
  if (inkCache[glyph]) return inkCache[glyph];
  let off = { dx: 0, dy: 0 };
  try {
    const side = INK_SIZE * 3;
    if (!inkCanvas) {
      inkCanvas = wx.createCanvas();
      inkCanvas.width = side;
      inkCanvas.height = side;
    }
    const ctx = inkCanvas.getContext('2d');
    ctx.clearRect(0, 0, side, side);
    ctx.font = font(INK_SIZE, false);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, side / 2, side / 2);

    const data = ctx.getImageData(0, 0, side, side).data;
    let minX = side;
    let minY = side;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        if (data[(y * side + x) * 4 + 3] > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX >= 0) {
      off = {
        dx: (side / 2 - (minX + maxX + 1) / 2) / INK_SIZE,
        dy: (side / 2 - (minY + maxY + 1) / 2) / INK_SIZE,
      };
    }
  } catch (e) {
    console.log('[draw] could not measure', glyph, e && e.message);
  }
  inkCache[glyph] = off;
  return off;
}

/** A small round control: faint fill, faint ring, a symbol in the middle. */
function roundControl(ctx, c, glyph, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(c.cx, c.cy, c.r - c.border / 2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.fill();
  ctx.lineWidth = c.border;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.stroke();

  ctx.font = font(c.font, false);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const off = inkOffset(glyph);
  ctx.fillText(glyph, c.cx + off.dx * c.font, c.cy + off.dy * c.font);
  ctx.restore();
}

module.exports = {
  font,
  sparkles,
  backdropCanvas,
  spacedWidth,
  spacedText,
  redButton,
  roundControl,
};
