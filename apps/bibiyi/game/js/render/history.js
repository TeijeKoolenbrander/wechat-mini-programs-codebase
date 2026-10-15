/**
 * History (往期) list (spec 6.11): the last 30 published issues, newest first.
 * draw(ctx, vm, layout) -> hitAreas.
 *
 * vm = spec 10 History list model {state, headerText, items:[{dateKey, issueNo,
 *   dateText, themeLabel, mineText, isToday, statusText}]} plus extras:
 *   scrollY, t.
 * Hit ids: history:back, history:retry, history:item:<dateKey>,
 *   history:scroll (list drag area; scrollMax id).
 */

const T = require('./theme');
const W = require('./widgets');
const C = T.COLORS;

function draw(ctx, vm, L) {
  const hits = W.start(L);
  W.paper(ctx, L);
  W.backButton(ctx, L, hits, '返回', 'history:back');
  const x = L.x0;
  const cw = L.contentW;
  W.text(ctx, '往期', x, L.navBottom + L.u(18), { size: T.FS.title + 2, weight: 800, serif: true });
  let top = L.navBottom + L.u(40);
  if (vm.headerText && vm.state === 'ready') {
    W.text(ctx, vm.headerText, x, top + L.u(10), { size: T.FS.body, color: C.sub, maxW: cw });
    top += L.u(28) * (L.large ? 1.15 : 1);
  }
  const bottom = L.bottomEdge - L.bottomPad;
  const rowH = Math.max(L.u(64), T.MIN_TAP) * (L.large ? 1.1 : 1);

  switch (vm.state) {
    case 'loading': {
      for (let i = 0; i < 6; i++) {
        const y = top + i * (rowH + L.u(8));
        if (y + rowH > bottom) break;
        W.card(ctx, x, y, cw, rowH, { r: L.u(10) });
        W.skeleton(ctx, x + L.u(14), y + L.u(14), cw * 0.5, L.u(16), vm.t, 6);
        W.skeleton(ctx, x + L.u(14), y + L.u(38), cw * 0.3, L.u(14), vm.t, 6);
      }
      break;
    }
    case 'empty':
      W.text(ctx, '还没有往期', L.cx, top + L.u(60), { size: T.FS.title, weight: 800, serif: true, align: 'center' });
      W.text(ctx, '明天这里就有第一期了', L.cx, top + L.u(96), { size: T.FS.body, color: C.sub, align: 'center' });
      break;
    case 'error':
    case 'offline':
      W.text(ctx, vm.state === 'offline' ? '往期需联网查看' : '往期暂时打不开', L.cx, top + L.u(60), { size: T.FS.title, weight: 800, serif: true, align: 'center' });
      W.button(ctx, L, hits, { id: 'history:retry', x, y: bottom - L.btnH, w: cw, h: L.btnH, label: '重 试', kind: 'primary' });
      break;
    default: {
      const items = vm.items || [];
      const rect = { x: 0, y: top, w: L.W, h: bottom - top };
      W.scrollRegion(ctx, hits, 'history:scroll', rect, vm.scrollY, (c, hh, y0) => {
        items.forEach((it, i) => {
          const y = y0 + i * (rowH + L.u(8));
          W.card(c, x, y, cw, rowH, { r: L.u(10), fill: it.isToday ? 'rgba(184,67,47,0.06)' : C.card, stroke: it.isToday ? C.seal : undefined });
          const head = '第' + it.issueNo + '期 ' + (it.dateText || '') + (it.themeLabel ? ' · ' + it.themeLabel : '');
          const right = it.mineText || '';
          const rw = W.measure(c, right + ' ›', T.FS.bodyL, 800, true);
          W.text(c, head, x + L.u(14), y + rowH * 0.36, { size: T.FS.body, weight: 700, color: C.ink, maxW: cw - L.u(28) });
          if (it.statusText) W.text(c, it.statusText, x + L.u(14), y + rowH * 0.7, { size: T.FS.body, color: C.sub, maxW: cw - rw - L.u(44) });
          W.text(c, right + ' ›', x + cw - L.u(14), y + rowH * 0.7, { size: T.FS.bodyL, weight: 800, serif: true, color: right === '未参加' ? C.sub : C.ink, align: 'right' });
          hh.add('history:item:' + it.dateKey, x, y, cw, rowH);
        });
        return items.length * (rowH + L.u(8)) + L.u(8);
      });
    }
  }
  return hits.result();
}

module.exports = { draw };
