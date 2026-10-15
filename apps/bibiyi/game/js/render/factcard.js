/**
 * One fact card (CardFace, spec 10): accent edge, category icon chip, label,
 * sub-label, the big value with its unit, and the source line. Used by the
 * play screen and (compact) by result, report, source and history views.
 *
 * Pure. Never formats data: every string comes from the view model. The only
 * thing computed here is the count-up text while the value is being revealed.
 */

const T = require('./theme');
const W = require('./widgets');
const { countUp } = require('./fmt');
const C = T.COLORS;

/** Pick a label layout: one line (shrunk down to 80%), else two lines. */
function labelLines(ctx, label, maxW, size) {
  const str = String(label == null ? '' : label);
  if (W.measure(ctx, str, size, 800, true) <= maxW) return { lines: [str], size };
  const small = Math.max(T.FS.body, size * 0.82);
  if (W.measure(ctx, str, small, 800, true) <= maxW) return { lines: [str], size: small };
  const lines = W.wrap(ctx, str, maxW, small, 800, true);
  if (lines.length <= 2) return { lines, size: small };
  let last = lines[1];
  while (last.length > 1 && W.measure(ctx, last + '…', small, 800, true) > maxW) last = last.slice(0, -1);
  return { lines: [lines[0], last + '…'], size: small };
}

function geometry(L) {
  const k = L.k;
  return {
    padX: L.u(14),
    padTop: L.u(14),
    padBottom: L.u(20),
    chip: L.u(38) * Math.min(k, 1.15),
    gap: L.u(4),
    valueH: T.FS.value * 1.3,
    srcH: T.FS.body * 1.5,
  };
}

/** Width available to the label beside the chip. */
function labelWidth(L, w, g) {
  return w - 2 * g.padX - g.chip - L.u(10);
}

/** Height of the header block (chip + label lines + sub-label) for a face. */
function headHeight(ctx, L, face, w) {
  const g = geometry(L);
  const ll = labelLines(ctx, face && face.label, labelWidth(L, w, g), T.FS.title);
  const textH = ll.lines.length * ll.size * 1.18 + (face && face.subLabel ? T.FS.body * 1.2 : 0);
  return Math.max(g.chip, textH);
}

/** Natural height of a card for these faces (the taller one wins). */
function cardHeight(ctx, L, faces, w) {
  const g = geometry(L);
  let head = g.chip;
  faces.forEach((f) => {
    if (f) head = Math.max(head, headHeight(ctx, L, f, w));
  });
  return g.padTop + head + g.gap + g.valueH + g.gap + g.srcH + g.padBottom;
}

/**
 * Draw a card into rect r = {x,y,w,h}.
 * o: {
 *   slot: 'top'|'bottom'         hit id suffix: play:source<Slot>, play:report<Slot>
 *   idPrefix: 'play'             hit id prefix (default 'play')
 *   hidden: bool                 value not shown (draws "？")
 *   countP: 0..1                 count-up progress for the value (1 = final)
 *   pill: null|true|false        verdict pill: correct / miss / none
 *   shimmerT: ms|null            moving highlight (waiting for the server)
 *   noHits: bool                 do not register hit areas (animating)
 *   alpha: 0..1
 * }
 */
function draw(ctx, L, hits, face, r, o) {
  o = o || {};
  const g = geometry(L);
  const { x, y, w, h } = r;
  const slot = o.slot || 'top';
  const prefix = o.idPrefix || 'play';
  const Slot = slot.charAt(0).toUpperCase() + slot.slice(1);
  const hc = T.MODE.highContrast;
  const accent = T.accentFill(face && face.accent);
  const accentTxt = T.accentText(face && face.accent);

  ctx.save();
  if (o.alpha != null) ctx.globalAlpha = o.alpha;
  W.card(ctx, x, y, w, h, { r: L.u(14), shadow: true, lw: hc ? 2.5 : 1.5 });
  // accent edge on the left, clipped to the card shape
  ctx.save();
  W.rr(ctx, x, y, w, h, L.u(14));
  ctx.clip();
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, L.u(6), h);
  ctx.restore();

  if (!face) {
    // skeleton shell (loading)
    W.skeleton(ctx, x + g.padX + L.u(6), y + g.padTop, g.chip, g.chip, o.t, g.chip / 2);
    W.skeleton(ctx, x + g.padX + L.u(6) + g.chip + L.u(10), y + g.padTop + L.u(4), w * 0.4, L.u(20), o.t, 6);
    W.skeleton(ctx, x + w * 0.25, y + g.padTop + g.chip + L.u(14), w * 0.5, L.u(40) * T.MODE.k, o.t, 8);
    ctx.restore();
    return;
  }

  const left = x + g.padX + L.u(4); // after the accent edge
  // ---- header: icon chip, label, sub-label
  const tx = left + g.chip + L.u(10);
  const tw = x + w - g.padX - tx;
  const ll = labelLines(ctx, face.label, tw, T.FS.title);
  const lh = ll.size * 1.18;
  const subH = face.subLabel ? T.FS.body * 1.2 : 0;
  const blockH = ll.lines.length * lh + subH;
  const cyHead = y + g.padTop + Math.max(g.chip, blockH) / 2;
  W.icons.iconChip(ctx, face.icon, left + g.chip / 2, cyHead, g.chip, accent, hc ? C.ink : null);
  let ty = cyHead - blockH / 2;
  ll.lines.forEach((ln, i) => {
    W.text(ctx, ln, tx, ty + lh * i + lh / 2, { size: ll.size, weight: 800, serif: true, color: C.ink, maxW: tw, minSize: T.FS.body });
  });
  ty += ll.lines.length * lh;
  if (face.subLabel) W.text(ctx, face.subLabel, tx, ty + subH / 2, { size: T.FS.body, weight: 600, color: accentTxt, maxW: tw });

  // ---- value row (centred value + unit on one baseline group)
  const head = Math.max(g.chip, blockH);
  const vTop = y + g.padTop + head + g.gap;
  const vcy = vTop + g.valueH / 2;
  const unit = face.unitText || '';
  const unitSize = T.FS.bodyL + 2 * (T.MODE.k - 1) * 4;
  const unitW = unit ? W.measure(ctx, unit, unitSize, 600, false) + L.u(8) : 0;
  const approxLead = face.approx && face.valueText && face.valueText.charAt(0) !== '约' && !o.hidden;
  const approxW = approxLead ? W.measure(ctx, '约', unitSize, 600, false) + L.u(4) : 0;
  const availW = w - 2 * g.padX - L.u(8) - unitW - approxW;
  const hidden = o.hidden || face.valueText == null;
  const finalText = hidden ? '？' : face.valueText;
  const vf = W.fit(ctx, finalText, availW, T.FS.value, 800, true, T.FS.value * 0.8);
  const finalW = W.measure(ctx, vf.str, vf.size, 800, true);
  const totalW = approxW + finalW + unitW;
  let vx = x + w / 2 - totalW / 2 + L.u(3);
  if (approxLead) {
    W.text(ctx, '约', vx, vcy + L.u(5), { size: unitSize, weight: 600, color: C.sub });
    vx += approxW;
  }
  const shown = !hidden && o.countP != null && o.countP < 1 ? countUp(vf.str, o.countP) : vf.str;
  // right-align the counting digits to the final text's right edge (odometer feel)
  W.text(ctx, shown, vx + finalW, vcy, { size: vf.size, weight: 800, serif: true, color: hidden ? C.sub : C.ink, align: 'right' });
  if (unit) W.text(ctx, unit, vx + finalW + L.u(8), vcy + vf.size * 0.12, { size: unitSize, weight: 600, color: C.sub });

  // ---- source row
  const sTop = vTop + g.valueH + g.gap;
  const scy = sTop + g.srcH / 2;
  const showSource = !hidden && face.sourceText && (o.countP == null || o.countP >= 1);
  if (showSource) {
    const reportW = face.canReport ? W.measure(ctx, '数据有误？', T.FS.body, 600, false) + L.u(4) : 0;
    const srcMax = w - 2 * g.padX - L.u(4) - reportW - (reportW ? L.u(10) : 0);
    const used = W.text(ctx, face.sourceText, left, scy, { size: T.FS.body, color: C.sub, maxW: srcMax });
    if (!o.noHits) W.addTap(hits, L, prefix + ':source' + Slot, left - L.u(4), scy - T.MIN_TAP / 2, Math.min(srcMax, used) + L.u(8), T.MIN_TAP);
    if (face.canReport) {
      const rx = x + w - g.padX;
      W.text(ctx, '数据有误？', rx, scy, { size: T.FS.body, weight: 600, color: C.seal, align: 'right' });
      ctx.fillStyle = C.seal;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(rx - reportW + L.u(4), scy + T.FS.body * 0.6, reportW - L.u(4), 1);
      ctx.globalAlpha = o.alpha != null ? o.alpha : 1;
      if (!o.noHits) W.addTap(hits, L, prefix + ':report' + Slot, rx - reportW - L.u(8), scy - T.MIN_TAP / 2, reportW + L.u(16), T.MIN_TAP);
    }
  } else if (hidden && o.shimmerT == null && face.sourceText == null && o.placeholder) {
    W.text(ctx, o.placeholder, x + w / 2, scy, { size: T.FS.body, color: C.sub, align: 'center' });
  }

  // ---- shimmer while waiting for the answer
  if (o.shimmerT != null) {
    ctx.save();
    W.rr(ctx, x, y, w, h, L.u(14));
    ctx.clip();
    const phase = (o.shimmerT % 1100) / 1100;
    const bx = x - w * 0.3 + phase * w * 1.6;
    const gr = ctx.createLinearGradient(bx, 0, bx + w * 0.3, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, hc ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.7)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(bx, y, w * 0.3, h);
    ctx.restore();
  }

  // ---- verdict pill hanging on the top edge, right side (never beside the label)
  if (o.pill === true || o.pill === false) {
    const ph = 30 * T.MODE.k;
    const pw = W.verdictWidth(ctx, o.pill, { h: ph });
    W.verdict(ctx, x + w - g.padX - pw, y - ph * 0.5, o.pill, { h: ph });
  }
  ctx.restore();
}

module.exports = { draw, cardHeight, headHeight, labelLines, geometry };
