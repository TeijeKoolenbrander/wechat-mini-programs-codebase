/**
 * Helpers every screen module shares: frame setup, headers, state panels (loading / empty / error / offline), the
 * bottom banner reserve and a small vertical flow cursor. Pure.
 */

const T = require('./theme');
const W = require('./widgets');
const Art = require('./art');
const { Hits } = require('./layout');
const C = T.COLORS;

/** Apply the display mode, start a hit collector and paint the paper. */
function begin(ctx, vm, L) {
  T.applyDisplay(vm && vm.display);
  const hits = new Hits();
  W.paper(ctx, L);
  return hits;
}

/**
 * Header: back button level with the capsule, then a title (and optional right-aligned text) below it.
 * Returns the y where content may start.
 */
function header(ctx, L, hits, o) {
  if (o.back) W.backButton(ctx, L, hits, o.back, o.backId);
  let y = L.navBottom + L.u(8);
  if (o.title) {
    const rh = L.u(T.isLarge() ? 44 : 36);
    let rightW = 0;
    if (o.right) {
      rightW = W.measure(ctx, o.right, T.FS.body, 700) + L.u(12);
      if (rightW > L.contentW * 0.5) rightW = L.contentW * 0.5;
    }
    // the title may take two lines instead of being cut
    const tsize = T.FS.title;
    const lines = W.wrapBalanced(ctx, o.title, L.contentW - rightW, tsize, 800).slice(0, 2);
    const lh = Math.round(tsize * 1.3);
    const h = Math.max(rh, lines.length * lh + L.u(6));
    lines.forEach((ln, i) => W.text(ctx, ln, L.x0, y + (h - lines.length * lh) / 2 + i * lh + lh / 2, { size: tsize, weight: 800 }));
    if (o.right) W.text(ctx, o.right, L.headerRight, y + rh / 2, { size: T.FS.body, weight: 700, color: o.rightColor || C.sub, align: 'right', maxW: L.contentW * 0.5 });
    y += h;
  }
  return y;
}

/**
 * A centred message block for loading / empty / error / offline states. Returns the bottom y.
 * o: {y, art: 'empty'|'offline'|'error'|'lock'|null, headline, sub, retryId, retryLabel, skeleton: bool, t}
 */
function statePanel(ctx, L, hits, o) {
  const w = L.contentW;
  let y = o.y;
  if (o.skeleton) {
    const n = o.rows || 3;
    for (let i = 0; i < n; i++) {
      const h = L.u(T.isLarge() ? 72 : 60);
      W.skeleton(ctx, L.x0, y, w, h, (o.t || 0) + i * 160, 12);
      y += h + L.u(10);
    }
    if (o.headline) W.text(ctx, o.headline, L.cx, y + L.u(14), { size: T.FS.body, color: C.sub, align: 'center', maxW: w });
    return y + L.u(28);
  }
  if (o.art) {
    const s = L.u(T.isLarge() ? 96 : 84);
    Art.stateArt(ctx, L.cx, y + s / 2, s, o.art);
    y += s + L.u(14);
  }
  if (o.headline) {
    const lh = Math.round(T.FS.bodyL * 1.45);
    const lines = W.wrapBalanced(ctx, o.headline, w - L.u(24), T.FS.bodyL, 700);
    lines.forEach((ln, i) => W.text(ctx, ln, L.cx, y + i * lh + lh / 2, { size: T.FS.bodyL, weight: 700, align: 'center' }));
    y += lines.length * lh;
  }
  if (o.sub) {
    const lh = Math.round(T.FS.body * 1.5);
    const lines = W.wrapBalanced(ctx, o.sub, w - L.u(24), T.FS.body, 500);
    lines.forEach((ln, i) => W.text(ctx, ln, L.cx, y + i * lh + lh / 2 + L.u(4), { size: T.FS.body, color: C.sub, align: 'center' }));
    y += lines.length * lh + L.u(4);
  }
  if (o.retryId) {
    y += L.u(14);
    const bw = Math.min(w, L.u(180));
    const bh = T.btn(L, 48);
    W.button(ctx, L, hits, { id: o.retryId, x: L.cx - bw / 2, y, w: bw, h: bh, label: o.retryLabel || '重试', kind: 'secondary' });
    y += bh;
  }
  return y;
}

/** Bottom reserve for a list banner: pins the stub bar and returns the y limit content must stay above. */
function bannerReserve(ctx, L, banner) {
  if (!banner || !banner.show || !(banner.reservedHeight > 0)) return L.bottomEdge - L.bottomPad;
  const rect = require('./layout').bannerRect(L, banner);
  W.bannerSlot(ctx, L, rect, banner.stub);
  return rect.y - L.u(24);
}

/** Section label ("等你接") */
function sectionLabel(ctx, L, y, label) {
  W.text(ctx, label, L.x0 + L.u(4), y + L.u(14), { size: T.FS.body, weight: 800, color: C.sub });
  return y + L.u(28);
}


/**
 * Bottom sheet with a scrollable body and a pinned button area. o: {title, contentH, pinnedH, scroll, scrollId,
 * drawContent(x, y, w), drawPinned(x, y, w), closeId, noScrimClose, close}. The sheet is as tall as it needs, capped
 * below the capsule row; when the content does not fit it scrolls (hits.scrollMax[scrollId]).
 * Returns the inner geometry.
 */
function sheetScroll(ctx, L, hits, o) {
  const head = L.u(T.isLarge() ? 70 : 62);
  const maxH = L.H - L.navBottom - L.u(8);
  const pinnedH = o.pinnedH || 0;
  const want = head + o.contentH + L.u(8) + pinnedH + L.u(16) + L.safeBottom + L.bottomPad - L.u(4);
  const inner = W.sheet(ctx, L, hits, { h: Math.min(maxH, want), title: o.title, closeId: o.closeId, noScrimClose: o.noScrimClose, close: o.close });
  const area = { x: inner.x, y: inner.top, w: inner.w, h: Math.max(L.u(60), inner.bottom - pinnedH - L.u(8) - inner.top) };
  W.scrollBody(ctx, hits, area, o.contentH, o.scroll, o.scrollId || 'sheet:list', () => o.drawContent(area.x, area.y, area.w), { fade: C.sheet });
  if (o.drawPinned) o.drawPinned(inner.x, inner.bottom - pinnedH, inner.w);
  inner.area = area;
  return inner;
}


/**
 * Page with a PINNED bottom action block. The actions always sit at the bottom of the area (primary actions in the bottom
 * 40%, above the safe area), never scrolled out of reach; only the content above them scrolls, in an area that ends one
 * gap above the first action, with a "more below" affordance when it does not fit. When the actions alone would leave
 * less than 80 px for the content (not at any supported size) they scroll with the content instead.
 * o: {area, contentH, actionsH, gap, scroll, id, drawContent(y), drawActions(y)}
 */
function page(ctx, L, hits, o) {
  const gap = o.gap == null ? L.u(14) : o.gap;
  const actionsH = o.actionsH || 0;
  const actionsY = o.area.y + o.area.h - actionsH;
  const bodyArea = { x: o.area.x, y: o.area.y, w: o.area.w, h: actionsY - (actionsH ? gap : 0) - o.area.y };
  if (!actionsH || bodyArea.h >= 80) {
    const r = W.scrollBody(ctx, hits, actionsH ? bodyArea : o.area, o.contentH, o.scroll, o.id, () => o.drawContent(o.area.y));
    if (o.drawActions) o.drawActions(actionsY);
    return r;
  }
  const total = o.contentH + gap + actionsH;
  const aY = Math.max(o.area.y + o.contentH + gap, actionsY);
  const bodyH = Math.max(total, aY + actionsH - o.area.y);
  return W.scrollBody(ctx, hits, o.area, bodyH, o.scroll, o.id, () => {
    o.drawContent(o.area.y);
    if (o.drawActions) o.drawActions(aY);
  });
}

/** content area below a header down to the bottom edge (minus the banner reserve when given) */
function area(L, y, bottom) {
  return { x: L.x0, y, w: L.contentW, h: (bottom == null ? L.bottomEdge - L.bottomPad : bottom) - y };
}

module.exports = { page, area, sheetScroll, begin, header, statePanel, bannerReserve, sectionLabel };
