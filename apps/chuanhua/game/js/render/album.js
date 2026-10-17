/**
 * 我的接龙 (spec 8.11). Newest activity first, paginated (album:more when `cursor`). Each row has a status glyph AND
 * the status words (from `line`), never colour alone. Offline shows the cached list read-only with a notice.
 * States loading | ready | empty | error | offline.
 * Rev. 2: rooms and chains share the list (item.kind 'room' | 'chain'; room statuses revealed | playing | lobby).
 * Hit ids: album:back, album:room:<roomId>, album:chain:<chainId>, album:more, album:retry, album:scroll.
 */

const T = require('./theme');
const W = require('./widgets');
const S = require('./screen');
const C = T.COLORS;

/** glyph for a row status: revealed (filled orange, ring), open (ring), pending (clock), expired (dash), blocked/removed (cross) */
function glyph(ctx, L, cx, cy, status, unseen) {
  const r = L.u(9);
  if (status === 'revealed') {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = unseen ? C.verm : C.orange;
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (!unseen) W.iconCheck(ctx, cx, cy, r * 1.1, C.ink);
  } else if (status === 'pending') W.iconClock(ctx, cx, cy, r * 2.2, C.orangeDeep);
  else if (status === 'blocked' || status === 'removed') W.iconClose(ctx, cx, cy, r * 1.2, C.vermText);
  else if (status === 'expired') {
    ctx.fillStyle = C.sub;
    ctx.fillRect(cx - r * 0.7, cy - 1.5, r * 1.4, 3);
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function draw(ctx, vm, L) {
  const hits = S.begin(ctx, vm, L);
  const st = vm.state || 'ready';
  W.backButton(ctx, L, hits, '返回', 'album:back');
  const y = S.header(ctx, L, hits, { title: '我的接龙', right: vm.streakText || null });
  const bw = L.contentW;

  if (st === 'loading') {
    S.statePanel(ctx, L, hits, { y: y + L.u(10), skeleton: true, rows: 5, t: vm.t });
    return hits.result();
  }
  if (st === 'error') {
    S.statePanel(ctx, L, hits, { y: y + L.u(24), art: 'error', headline: '加载失败了', retryId: 'album:retry' });
    return hits.result();
  }
  if (st === 'empty') {
    S.statePanel(ctx, L, hits, { y: y + L.u(24), art: 'empty', headline: '还没有接龙，去开一局吧' });
    return hits.result();
  }

  const showBanner = (st === 'ready') && vm.banner && vm.banner.show;
  const limit = showBanner ? S.bannerReserve(ctx, L, vm.banner) : L.bottomEdge - L.bottomPad;
  const lh = Math.round(T.FS.bodyL * 1.4);
  const slh = Math.round(T.FS.body * 1.4);
  const gap = L.u(8);
  const textW = bw - L.u(44) - L.u(30);
  const items = (vm.items || []).map((it) => ({ it, lines: W.wrap(ctx, it.line, textW, T.FS.bodyL, it.unseen ? 800 : 600).slice(0, 2) }));
  const rowH = (e) => Math.max(L.u(64), e.lines.length * lh + slh + L.u(22));
  const offLines = st === 'offline' ? W.wrap(ctx, '没有网络，显示的是上次的列表', bw - L.u(24), T.FS.body, 600) : [];
  const offlineH = st === 'offline' ? offLines.length * slh + L.u(16) + gap : 0;
  const moreH = vm.cursor ? T.btn(L, 48) + L.u(8) : 0;
  const contentH = offlineH + items.reduce((a, e) => a + rowH(e) + gap, 0) + moreH + L.u(4);
  const area = { x: L.x0, y: y + L.u(2), w: bw, h: limit - y - L.u(2) };

  W.scrollBody(ctx, hits, area, contentH, vm.scrollY, 'album:scroll', () => {
    let cy = area.y;
    if (st === 'offline') {
      const h = offLines.length * slh + L.u(16);
      W.fillRR(ctx, L.x0, cy, bw, h, L.u(10), C.orangeSoft);
      W.strokeRR(ctx, L.x0, cy, bw, h, L.u(10), C.orangeDeep, T.isHC() ? 2 : 1.5);
      offLines.forEach((ln, i) => W.text(ctx, ln, L.x0 + L.u(12), cy + L.u(8) + i * slh + slh / 2, { size: T.FS.body, weight: 600, color: C.orangeDeep }));
      cy += h + gap;
    }
    items.forEach((e) => {
      const h = rowH(e);
      W.card(ctx, L.x0, cy, bw, h, { r: L.u(14), shadow: e.it.unseen });
      glyph(ctx, L, L.x0 + L.u(24), cy + h / 2, e.it.status, e.it.unseen);
      const total = e.lines.length * lh + slh;
      const top = cy + (h - total) / 2;
      e.lines.forEach((ln, i) => W.text(ctx, ln, L.x0 + L.u(46), top + i * lh + lh / 2, { size: T.FS.bodyL, weight: e.it.unseen ? 800 : 600 }));
      W.text(ctx, e.it.timeText, L.x0 + L.u(46), top + e.lines.length * lh + slh / 2, { size: T.FS.body, color: C.sub, maxW: textW });
      W.iconChevron(ctx, L.x0 + bw - L.u(18), cy + h / 2, L.u(14), C.sub);
      hits.add('album:' + (e.it.kind === 'room' ? 'room:' : 'chain:') + e.it.id, L.x0, cy, bw, h);
      cy += h + gap;
    });
    if (vm.cursor) W.button(ctx, L, hits, { id: 'album:more', x: L.x0, y: cy, w: bw, h: T.btn(L, 48), label: '加载更多', kind: 'secondary' });
  });
  return hits.result();
}

module.exports = { draw };
