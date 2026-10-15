/**
 * 我的接龙 (spec 8.11) and the own-棒 detail. draw(ctx, vm, layout).
 *
 * album vm = spec 12 我的接龙 model plus extras: display, sheet, scrollY, t,
 *   offlineNote (bool: showing the cached list read-only).
 *   items[].status -> icon: revealed=check, open/pending=clock, expired=dash,
 *   blocked=cross (author-only line), removed=dash; unseen adds the dot and the
 *   text 新揭晓.
 * Hit ids: back, album:item:<chainId>, album:more, album:start, album:retry,
 *   banner:slot, plus sheet ids.
 *
 * detail (draw via album.drawDetail) vm = spec 12 own-棒 detail:
 *   {chainId, mine:[{n, kind, strokes?, text?, modState, canDelete}], display,
 *    sheet}. Shows ONLY the viewer's own 棒.
 *   Hit ids: back, detail:delete:<n>.
 */

const T = require('./theme');
const W = require('./widgets');
const R = require('./rows');
const S = require('./strokes');
const { page } = require('./page');
const C = T.COLORS;

const ICON = { revealed: 'passed', open: 'pending', pending: 'pending', expired: 'void', blocked: 'blocked', removed: 'void' };

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display); // sizes below depend on the mode
  const state = vm.state || 'loading';
  const bh = W.btnH(L);
  const banner = vm.banner && vm.banner.show && (state === 'ready' || state === 'empty') ? vm.banner : null;
  const bannerH = banner ? Math.max(0, banner.reservedHeight || 50) : 0;
  const needBtn = state === 'empty' || state === 'error' || state === 'offline';
  const footerH = (needBtn ? bh : 0) + (banner ? bannerH + (needBtn ? 24 : 0) : 0);

  return page(ctx, vm, L, {
    back: { label: '返回', id: 'back' },
    title: '我的接龙',
    footerH,
    footer: (c, h, r) => {
      let y = r.y;
      if (banner) {
        c.setLineDash([6, 4]);
        W.strokeRR(c, r.x, y, r.w, bannerH, 8, C.line, 1.5);
        c.setLineDash([]);
        h.add('banner:slot', r.x, y, r.w, bannerH);
        y += bannerH + 24;
      }
      if (state === 'empty') W.button(c, L, h, { id: 'album:start', x: r.x, y, w: r.w, h: bh, label: '去开一条', kind: 'primary' });
      else if (state === 'error' || state === 'offline') W.button(c, L, h, { id: 'album:retry', x: r.x, y, w: r.w, h: bh, label: '重试', kind: 'primary' });
    },
    body: (c, h, y0, x, w) => {
      let y = y0 + 2;
      if (vm.streakText) {
        W.chip(c, x + 2, y, vm.streakText, { size: T.FS.body, h: Math.round(T.FS.body * 1.7), fill: C.blueSoft, color: C.blueText, border: C.blueText });
        y += Math.round(T.FS.body * 1.7) + 10;
      }
      const lh = Math.round(T.FS.bodyL * 1.5);
      if (state === 'loading') {
        W.text(c, '正在加载…', x + 4, y + 14, { size: T.FS.bodyL, weight: 700, color: C.sub });
        y += 36;
        for (let i = 0; i < 4; i++) {
          W.skeleton(c, x, y, w, L.u(58), vm.t, 14);
          y += L.u(58) + 10;
        }
        return y - y0;
      }
      if (state === 'empty' || (state === 'error' && !(vm.items || []).length) || (state === 'offline' && !(vm.items || []).length)) {
        const msg = state === 'empty' ? '还没有接龙，去开一条吧' : state === 'offline' ? '需联网才能查看' : '没能打开列表';
        const ph = W.paragraphH(c, msg, w - 32, lh, { size: T.FS.bodyL, weight: 800, round: true });
        W.card(c, x, y, w, ph + 32, { r: 16 });
        W.paragraph(c, msg, x + 16, y + 16, w - 32, lh, { size: T.FS.bodyL, weight: 800, round: true });
        return y + ph + 36 - y0;
      }
      if (state === 'offline' || vm.offlineNote) {
        const msg = '离线中，下面是上次的列表，只能查看';
        const ph = W.paragraphH(c, msg, w - 28, Math.round(T.FS.body * 1.45), { size: T.FS.body, weight: 700 });
        W.fillRR(c, x, y, w, ph + 20, 14, C.orangeSoft);
        W.strokeRR(c, x, y, w, ph + 20, 14, C.orangeText, W.bw());
        W.paragraph(c, msg, x + 14, y + 10, w - 28, Math.round(T.FS.body * 1.45), { size: T.FS.body, weight: 700 });
        y += ph + 30;
      }
      const items = vm.items || [];
      y += R.cardRows(c, h, x, y, w, items.map((it) => ({
        id: 'album:item:' + it.chainId,
        marker: it.unseen ? 'dot' : 'status:' + (ICON[it.status] || 'void'),
        line: it.line,
        sub: (it.unseen ? '新揭晓 · ' : '') + (it.timeText || ''),
        subColor: it.status === 'blocked' ? C.zhuText : C.sub,
        chevron: it.status !== 'blocked',
      }))) + 8;
      if (vm.cursor) {
        W.button(c, L, h, { id: 'album:more', x, y, w, h: W.btnH(L, true), label: '加载更多', kind: 'secondary', size: T.FS.body });
        y += W.btnH(L, true) + 8;
      }
      return y - y0;
    },
  });
}

function drawDetail(ctx, vm, L) {
  T.applyDisplay(vm.display);
  const mine = vm.mine || [];
  return page(ctx, vm, L, {
    back: { label: '返回', id: 'back' },
    title: '我的那几棒',
    body: (c, h, y0, x, w) => {
      let y = y0 + 2;
      const lh = Math.round(T.FS.body * 1.5);
      const note = '这里只显示你自己传的棒，别人的内容要等揭晓。';
      y += W.paragraph(c, note, x + 2, y, w - 4, lh, { size: T.FS.body, color: C.sub }) + 8;
      // vm.state (extra, from the controller): the list is empty while loading and when the fetch failed
      const status = { loading: '正在打开…', offline: '需联网才能查看', error: '没打开，请返回再试' }[vm.state];
      if (status && !mine.length) y += W.paragraph(c, status, x + 2, y + 8, w - 4, Math.round(T.FS.bodyL * 1.5), { size: T.FS.bodyL, weight: 700, color: C.sub, align: 'center' }) + 24;
      const STAMP = { pending: '审核中', passed: '已通过', blocked: '没通过', void: '已超时' };
      mine.forEach((m) => {
        const mod = STAMP[m.modState] ? m.modState : 'pending';
        const pad = 14;
        const iw = w - 2 * pad;
        const isDraw = m.kind === 'draw';
        const dsize = Math.min(iw, L.u(220));
        const tl = Math.round((T.FS.bodyL + 2) * 1.4);
        const th = isDraw ? dsize : W.paragraphH(c, '「' + (m.text || '') + '」', iw, tl, { size: T.FS.bodyL + 2, weight: 800, round: true });
        const headH = 40;
        const delH = m.canDelete ? W.btnH(L, true) + 10 : 0;
        const ch = pad + headH + th + 12 + delH + pad - 4;
        W.card(c, x, y, w, ch, { r: 16 });
        W.text(c, '第' + m.n + '棒 · ' + (isDraw ? '画' : '猜'), x + pad, y + pad + 16, { size: T.FS.body, weight: 800, round: true, color: C.zhuText });
        W.stamp(c, x + w - pad - 60, y + pad + 16, mod, STAMP[mod]);
        const cy = y + pad + headH;
        if (isDraw) S.draw(c, m.strokes && m.strokes.s ? m.strokes : null, { x: x + pad + (iw - dsize) / 2, y: cy, w: dsize, h: dsize }, { bg: '#FFFFFF', radius: 6, border: C.ink, borderWidth: 2 });
        else W.paragraph(c, '「' + (m.text || '') + '」', x + pad, cy, iw, tl, { size: T.FS.bodyL + 2, weight: 800, round: true });
        if (m.canDelete) W.button(c, L, h, { id: 'detail:delete:' + m.n, x: x + pad, y: cy + th + 12, w: iw, h: W.btnH(L, true), label: '删除这一棒', kind: 'danger', size: T.FS.body });
        y += ch + 12;
      });
      return y - y0;
    },
  });
}

module.exports = { draw, drawDetail };
