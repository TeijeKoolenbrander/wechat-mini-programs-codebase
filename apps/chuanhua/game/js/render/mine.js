/**
 * Own-棒 detail of an open or expired chain (spec 8.11): only the player's own 棒, each with its status line and, when
 * allowed, 删除这一棒 (the confirmation is an overlay dialog). States loading | ready | error.
 * Hit ids: mine:back, mine:delete:<n>, mine:retry, mine:scroll.
 */

const T = require('./theme');
const W = require('./widgets');
const S = require('./screen');
const Strokes = require('./strokes');
const MARKERS = require('./describe').MARKER_TEXT;
const C = T.COLORS;

const PLACEHOLDER = { hidden: '该内容已被举报隐藏', deleted: '已删除这一棒' };
// a marker step (time ran out with nothing sent, spec 5.8) shows its fixed text on a plain note; it cannot be deleted

function draw(ctx, vm, L) {
  const hits = S.begin(ctx, vm, L);
  const st = vm.state || 'ready';
  W.backButton(ctx, L, hits, '返回', 'mine:back');
  const y = S.header(ctx, L, hits, { title: '我传出的棒' });
  const bw = L.contentW;
  if (st === 'loading') {
    S.statePanel(ctx, L, hits, { y: y + L.u(10), skeleton: true, rows: 3, t: vm.t });
    return hits.result();
  }
  if (st === 'error') {
    S.statePanel(ctx, L, hits, { y: y + L.u(24), art: 'error', headline: '加载失败了', retryId: 'mine:retry' });
    return hits.result();
  }
  const pad = L.u(14);
  const lh = Math.round(T.FS.bodyL * 1.45);
  const gap = L.u(12);
  const thumb = Math.min(bw - 2 * pad, L.u(T.isLarge() ? 200 : 180));
  const delH = T.btn(L, 44);
  const tlh = Math.round(T.FS.title * 1.4);
  const items = (vm.mine || []).map((m) => {
    const ph = PLACEHOLDER[m.modState];
    const lines = W.wrap(ctx, m.line || '', bw - 2 * pad - L.u(26), T.FS.bodyL, 800);
    const tl = (m.kind === 'describe' || m.marker) && !ph ? W.wrap(ctx, m.marker ? MARKERS[m.marker] || '' : m.text || '', bw - 2 * pad, T.FS.title, 800) : [];
    const bodyH = ph ? lh + L.u(8) : m.kind === 'draw' && !m.marker ? thumb : tl.length * tlh + L.u(6);
    const h = pad + lines.length * lh + L.u(8) + bodyH + (m.canDelete ? L.u(10) + delH : 0) + pad;
    return { m, lines, tl, ph, bodyH, h };
  });
  const area = { x: L.x0, y: y + L.u(2), w: bw, h: L.bottomEdge - L.bottomPad - y - L.u(2) };
  const contentH = items.reduce((a, e) => a + e.h + gap, 0);
  W.scrollBody(ctx, hits, area, contentH, vm.scrollY, 'mine:scroll', () => {
    let cy = area.y;
    items.forEach((e) => {
      const kind = e.m.modState === 'passed' || e.m.modState === 'marker' ? 'ok' : e.m.modState === 'pending' ? 'wait' : 'bad';
      const col = kind === 'ok' ? C.greenText : kind === 'wait' ? C.orangeDeep : C.vermText;
      W.card(ctx, L.x0, cy, bw, e.h, { r: L.u(14) });
      let iy = cy + pad;
      W.iconStatus(ctx, L.x0 + pad + L.u(8), iy + lh / 2, L.u(18), kind, col);
      e.lines.forEach((ln, i) => W.text(ctx, ln, L.x0 + pad + L.u(26), iy + i * lh + lh / 2, { size: T.FS.bodyL, weight: 800, color: col }));
      iy += e.lines.length * lh + L.u(8);
      if (e.ph) W.text(ctx, e.ph, L.x0 + pad, iy + lh / 2, { size: T.FS.bodyL, weight: 600, color: C.sub });
      else if (e.m.kind === 'draw' && !e.m.marker) {
        Strokes.drawStrokes(ctx, e.m.strokes || { v: 1, s: [] }, { x: L.x0 + pad, y: iy, w: thumb, h: thumb }, { cacheKey: 'mine:' + vm.chainId + ':' + e.m.n, rev: e.m.n + ':' + (vm.chainId || ''), dpr: L.dpr, frame: true, frameWidth: T.isHC() ? 2.5 : 1.5 });
      } else e.tl.forEach((ln, i) => W.text(ctx, ln, L.x0 + pad, iy + i * tlh + tlh / 2, { size: T.FS.title, weight: 800, color: e.m.marker ? C.sub : C.ink }));
      iy += e.bodyH;
      if (e.m.canDelete) {
        iy += L.u(10);
        W.button(ctx, L, hits, { id: 'mine:delete:' + e.m.n, x: L.x0 + pad, y: iy, w: bw - 2 * pad, h: delH, label: '删除这一棒', kind: 'danger', size: T.FS.body });
      }
      cy += e.h + gap;
    });
  });
  return hits.result();
}

module.exports = { draw };
