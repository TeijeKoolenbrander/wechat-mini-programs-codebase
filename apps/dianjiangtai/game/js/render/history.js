/**
 * History list 往期军令 (spec 8.9). draw(ctx, vm, layout) -> hitAreas.
 *
 * vm = spec 13 History list model:
 *   { state:'loading'|'ready'|'empty'|'error'|'offline', bestStreakText,
 *     items:[{dateKey, issueNo, dateText, variantLabel, mine:{record,bandLabel}|null,
 *             isToday, statusText}] }
 *   + extras: scrollY (px), display, t
 * Hit ids: history:back, history:retry, history:item:<dateKey>,
 *   history:list (scroll area; hitAreas.scrollMax['history:list']).
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits } = require('./layout');
const { recordDigits } = require('./fmt');
const C = T.COLORS;

function mineText(it) {
  if (!it.mine) return '未出征';
  return recordDigits(it.mine.record) + (it.mine.bandLabel ? ' · ' + it.mine.bandLabel : '');
}

function rowHeight(ctx, L, it, w) {
  const large = T.isLarge();
  if (!large) return L.u(70);
  const lines = W.lineCount(ctx, mineText(it), w - L.u(56), T.FS.body, 600, false, 2);
  return L.u(10 + 30 + lines * 28 + (it.statusText ? 28 : 0) + 8);
}

function drawRow(ctx, L, hits, it, x, y, w) {
  const large = T.isLarge();
  const h = rowHeight(ctx, L, it, w);
  W.card(ctx, x, y, w, h, { fill: C.tile, r: L.u(10), stroke: it.isToday ? C.seal : C.line, lw: it.isToday ? 2.5 : T.isHC() ? 2 : 1.5 });
  const tx = x + L.u(14);
  const head = '第' + it.issueNo + '期  ' + (it.dateText || '');
  const hw = W.text(ctx, head, tx, y + L.u(large ? 25 : 22), { size: T.FS.bodyL, weight: 800, serif: true, maxW: w - L.u(40) });
  if (it.variantLabel) W.pill(ctx, L, tx + hw + L.u(10), y + L.u(large ? 25 : 22), it.variantLabel, { size: T.FS.body });
  const mine = mineText(it);
  const mcol = it.mine ? C.ink : C.sub;
  if (large) {
    let ly = y + L.u(10 + 30);
    ly += W.paragraph(ctx, mine, tx, ly, w - L.u(56), L.u(28), { size: T.FS.body, weight: 600, color: mcol, maxLines: 2 });
    if (it.statusText) W.text(ctx, it.statusText, tx, ly + L.u(14), { size: T.FS.body, weight: 700, color: C.seal });
  } else {
    const mw = W.text(ctx, mine, tx, y + L.u(48), { size: T.FS.body, weight: 600, color: mcol, maxW: w - L.u(60) - (it.statusText ? L.u(70) : 0) });
    if (it.statusText) W.text(ctx, it.statusText, tx + mw + L.u(12), y + L.u(48), { size: T.FS.body, weight: 700, color: C.seal });
  }
  if (!it.isToday || it.mine) W.text(ctx, '›', x + w - L.u(18), y + h / 2, { size: T.FS.title, color: C.sub, align: 'center' });
  hits.add('history:item:' + it.dateKey, x, y, w, h);
  return h;
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display);
  const hits = new Hits();
  W.paper(ctx, L);
  W.backButton(ctx, L, hits, '返回', 'history:back');
  const large = T.isLarge();
  const x = L.x0;
  const cw = L.contentW;
  let y = L.navBottom + L.u(2);
  const tw = W.text(ctx, '往期军令', x, y + L.u(16), { size: T.FS.title, weight: 800, serif: true });
  if (vm.bestStreakText) {
    const sw = W.measure(ctx, vm.bestStreakText, T.FS.body, 600, false);
    if (tw + L.u(16) + sw <= cw) {
      W.text(ctx, vm.bestStreakText, x + cw, y + L.u(16), { size: T.FS.body, color: C.sub, align: 'right', weight: 600 });
      y += L.u(40);
    } else {
      W.text(ctx, vm.bestStreakText, x, y + L.u(16) + L.u(large ? 36 : 30), { size: T.FS.body, color: C.sub, weight: 600, maxW: cw });
      y += L.u(large ? 76 : 66);
    }
  } else y += L.u(40);

  const area = { x, y, w: cw, h: L.bottomEdge - L.bottomPad - y };
  const state = vm.state;
  if (state === 'loading') {
    const rh = L.u(large ? 92 : 70);
    for (let i = 0; i < 5 && (i + 1) * rh < area.h + rh; i++) {
      W.card(ctx, x, y + i * rh, cw, rh - L.u(6), { r: L.u(10) });
      W.skeleton(ctx, x + L.u(14), y + i * rh + L.u(14), cw * 0.45, L.u(18), vm.t, 6);
      W.skeleton(ctx, x + L.u(14), y + i * rh + L.u(40), cw * 0.3, L.u(16), vm.t, 6);
    }
  } else if (state === 'empty') {
    W.text(ctx, '还没有往期军令', L.cx, y + L.u(70), { size: T.FS.bodyL, color: C.sub, align: 'center', maxW: cw });
  } else if (state === 'error' || state === 'offline') {
    W.text(ctx, '往期需联网查看', L.cx, y + L.u(60), { size: T.FS.title, weight: 800, serif: true, align: 'center', maxW: cw });
    W.text(ctx, '自由点将不受影响', L.cx, y + L.u(100), { size: T.FS.body, color: C.sub, align: 'center', maxW: cw });
    const bh = T.btn(L, 56);
    W.button(ctx, L, hits, { id: 'history:retry', x, y: L.bottomEdge - L.bottomPad - bh, w: cw, h: bh, label: '重 试', kind: 'primary' });
  } else {
    const items = vm.items || [];
    const step = L.u(8);
    const heights = items.map((it) => rowHeight(ctx, L, it, cw));
    const contentH = heights.reduce((a, b) => a + b + step, 0);
    W.scrollBody(ctx, hits, area, contentH, vm.scrollY, 'history:list', () => {
      let ry = area.y;
      items.forEach((it, i) => {
        drawRow(ctx, L, hits, it, x, ry, cw - L.u(6));
        ry += heights[i] + step;
      });
    });
  }
  return hits.result();
}

module.exports = { draw };
