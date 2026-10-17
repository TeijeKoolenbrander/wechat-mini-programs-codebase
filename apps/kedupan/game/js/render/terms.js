/**
 * 《用户协议》 full-screen reader (D-2; copied from 传画接龙's terms screen): a long, scrollable text with headings and paragraphs, opened
 * from the 发言规则 sheet and from 设置. vm: {title, paragraphs:[{text, important?:bool, heading?:bool}], scrollY, display}.
 * Hit ids: terms:back, terms:scroll.
 *
 * - heading: bold, larger, with a short rule under it. important (the 【重要】 clauses): bold text on a highlighted note with a left bar
 *   (never colour alone; in high contrast the band is white with an ink outline). Text is never truncated; the last line can always be
 *   scrolled into view. A 5,000 character agreement is wrapped once per (paragraphs array, width, display mode) and cached on the
 *   array (WeakMap); only paragraphs inside the viewport are drawn. Logic passes the SAME paragraphs array every frame.
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits } = require('./layout');
const C = T.COLORS;

const cache = typeof WeakMap === 'function' ? new WeakMap() : null;

function metrics(L) {
  const size = T.FS.body;
  return { size, lh: Math.round(size * (T.isLarge() ? 1.55 : 1.62)), hsize: T.FS.bodyL + (T.isLarge() ? 2 : 3), gap: L.u(12), pad: L.u(12), bar: L.u(5) };
}

function layoutParas(ctx, L, paras) {
  const m = metrics(L);
  const sig = [L.contentW, m.size, T.isHC() ? 1 : 0, T.isLarge() ? 1 : 0, L.s].join('|');
  if (cache && paras && typeof paras === 'object') {
    const hit = cache.get(paras);
    if (hit && hit.sig === sig) return hit.out;
  }
  const items = [];
  let y = L.u(4);
  (paras || []).forEach((p, i) => {
    const text = String((p && p.text) || '');
    if (p && p.heading) {
      const lh = Math.round(m.hsize * 1.4);
      const lines = W.wrapBalanced(ctx, text, L.contentW, m.hsize, 800);
      const top = i === 0 ? L.u(2) : L.u(14);
      const h = top + lines.length * lh + L.u(10);
      items.push({ kind: 'heading', lines, y, h, top, lh, size: m.hsize });
      y += h;
    } else if (p && p.important) {
      const lines = W.wrap(ctx, text, L.contentW - m.bar - 2 * m.pad, m.size, 800);
      const h = lines.length * m.lh + 2 * L.u(10);
      items.push({ kind: 'important', lines, y, h, lh: m.lh, size: m.size });
      y += h + m.gap;
    } else {
      const lines = W.wrap(ctx, text, L.contentW, m.size, 500);
      const h = lines.length * m.lh;
      items.push({ kind: 'para', lines, y, h, lh: m.lh, size: m.size });
      y += h + m.gap;
    }
  });
  const out = { items, contentH: y + L.u(24) };
  if (cache && paras && typeof paras === 'object') cache.set(paras, { sig, out });
  return out;
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display);
  const hits = new Hits();
  const y = W.frame(ctx, L, hits, { title: vm.title || '用户协议', backId: 'terms:back' });
  const area = { x: L.x0, y: y + L.u(4), w: L.contentW, h: L.bottomEdge - L.bottomPad - y - L.u(4) };
  const lay = layoutParas(ctx, L, vm.paragraphs);
  const hc = T.isHC();
  W.scrollBody(ctx, hits, area, lay.contentH, vm.scrollY, 'terms:scroll', (sc) => {
    const lo = sc - L.u(8);
    const hi = sc + area.h + L.u(8);
    for (const it of lay.items) {
      if (it.y + it.h < lo || it.y > hi) continue;
      const top = area.y + it.y;
      if (it.kind === 'heading') {
        it.lines.forEach((ln, i) => W.text(ctx, ln, L.x0, top + it.top + i * it.lh + it.lh / 2, { size: it.size, weight: 800 }));
        W.fillRR(ctx, L.x0, top + it.top + it.lines.length * it.lh + L.u(3), L.u(36), 3, 1.5, hc ? C.ink : C.you);
      } else if (it.kind === 'important') {
        const m = metrics(L);
        W.fillRR(ctx, L.x0, top, L.contentW, it.h, L.u(8), hc ? '#FFFFFF' : '#FFF1C9');
        if (hc) W.strokeRR(ctx, L.x0, top, L.contentW, it.h, L.u(8), C.ink, 2);
        W.fillRR(ctx, L.x0, top, m.bar, it.h, 2, hc ? C.ink : C.youText);
        it.lines.forEach((ln, i) => W.text(ctx, ln, L.x0 + m.bar + m.pad, top + L.u(10) + i * it.lh + it.lh / 2, { size: it.size, weight: 800 }));
      } else {
        it.lines.forEach((ln, i) => W.text(ctx, ln, L.x0, top + i * it.lh + it.lh / 2, { size: it.size, weight: 500 }));
      }
    }
  });
  return hits.result();
}

module.exports = { draw, layoutParas };
