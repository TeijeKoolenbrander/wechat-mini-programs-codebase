/**
 * Page chrome shared by every screen: start-of-draw setup, header row,
 * pinned footers, the tape-measure logo and a few small composite widgets.
 */

const T = require('./theme');
const W = require('./widgets');
const R = require('./ruler');
const { Hits } = require('./layout');
const C = T.C;

/** Every draw() starts here: display mode, desk background, empty hit list. */
function begin(ctx, vm, L) {
  T.applyDisplay(vm && vm.display);
  W.desk(ctx, L);
  return new Hits();
}

/**
 * Header: back chevron level with the capsule (nothing on its right), then a
 * title row below the capsule. Returns the y where content may start.
 * o: {back: '返回', backId: 'back', title, right}
 */
function header(ctx, L, hits, o) {
  if (o.back !== null) W.backButton(ctx, L, hits, o.back || '返回', o.backId || 'back');
  let y = L.navBottom + L.u(6);
  if (o.title) {
    const cy = y + L.u(16);
    W.text(ctx, o.title, L.x0, cy, { size: W.fs(L, 'bodyL'), weight: 800, maxW: o.right ? L.contentW * 0.66 : L.contentW });
    if (o.right) W.text(ctx, o.right, L.x0 + L.contentW, cy, { size: W.fs(L, 'bodyL'), weight: 800, align: 'right', color: C.sub });
    y += L.u(36);
  }
  return y;
}

/** Top of a single pinned primary button row (button height included). */
function pinnedTop(L, rows, buttonH) {
  const h = buttonH || Math.max(T.MIN_TAP, W.fs(L, 'buttonH'));
  const gap = L.u(10);
  return L.bottomEdge - L.bottomPad - rows * h - (rows - 1) * gap;
}

function btnH(L) {
  return Math.max(T.MIN_TAP, W.fs(L, 'buttonH'));
}

/**
 * The logo: a strip of tape with a swinging ▼ above it and the title on it.
 * Returns the bottom y.
 */
function logo(ctx, L, x, y, w, t) {
  const th = L.u(T.MODE.large ? 66 : 58);
  const head = L.u(26);
  const ty = y + head;
  // tape strip
  ctx.save();
  if (!T.MODE.hc) {
    ctx.shadowColor = 'rgba(70,50,20,0.25)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
  }
  W.fillRR(ctx, x, ty, w, th, L.u(8), C.tape);
  ctx.restore();
  W.strokeRR(ctx, x, ty, w, th, L.u(8), T.MODE.hc ? C.ink : C.tapeShade, T.MODE.hc ? 2.5 : 1.5);
  W.fillRR(ctx, x - L.u(4), ty + th * 0.2, L.u(8), th * 0.6, 2, C.tapeHook);
  // ticks along the bottom edge
  const inset = L.u(20);
  const x0 = x + inset;
  const x1 = x + w - inset;
  ctx.strokeStyle = C.ink;
  ctx.globalAlpha = 0.6;
  for (let i = 0; i <= 20; i++) {
    const tx = x0 + ((x1 - x0) * i) / 20;
    ctx.lineWidth = i % 10 === 0 ? 2.6 : 1.6;
    ctx.beginPath();
    ctx.moveTo(tx, ty + th - 3);
    ctx.lineTo(tx, ty + th - 3 - th * (i % 10 === 0 ? 0.2 : 0.11));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  W.text(ctx, '群友刻度盘', x + w / 2, ty + th * 0.43, { size: L.u(T.MODE.large ? 34 : 32), weight: 900, align: 'center', maxW: w - L.u(32) });
  // swinging pointer
  const pos = 50 + 34 * Math.sin((t || 0) / 900);
  const px = x0 + ((x1 - x0) * pos) / 100;
  R.pointer(ctx, px, ty - L.u(2), L.u(10), C.you);
  return ty + th;
}

/** Simple toggle switch with an on/off word (never colour alone). */
function toggle(ctx, L, x, cy, on) {
  const w = L.u(54);
  const h = L.u(30);
  const y = cy - h / 2;
  W.fillRR(ctx, x, y, w, h, h / 2, on ? (T.MODE.hc ? C.ink : C.primary) : C.disabledFill);
  W.strokeRR(ctx, x, y, w, h, h / 2, T.MODE.hc ? C.ink : C.lineStrong, T.MODE.hc ? 2.5 : 1.5);
  const kx = on ? x + w - h / 2 : x + h / 2;
  ctx.beginPath();
  ctx.arc(kx, cy, h / 2 - 4, 0, Math.PI * 2);
  ctx.fillStyle = on ? (T.MODE.hc ? C.card : C.card) : C.card;
  ctx.fill();
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  return w;
}

/** A line of text centred in a box, wrapping to up to maxLines. Returns height. */
function centered(ctx, L, str, y, o) {
  o = o || {};
  const size = o.size || W.fs(L, 'body');
  const lh = o.lineH || size * 1.45;
  return W.paragraph(ctx, str, o.x != null ? o.x : L.x0, y, o.w != null ? o.w : L.contentW, lh, {
    size,
    weight: o.weight,
    color: o.color,
    align: 'center',
    maxLines: o.maxLines,
  });
}

/** Reserved rect for a native banner ad above the bottom edge. */
function bannerRect(L, banner) {
  if (!banner || !banner.show) return null;
  const h = banner.reservedHeight || 0;
  return { x: L.x0, y: L.bottomEdge - L.bottomPad - h, w: L.contentW, h };
}

module.exports = { begin, header, pinnedTop, btnH, logo, toggle, centered, bannerRect };
