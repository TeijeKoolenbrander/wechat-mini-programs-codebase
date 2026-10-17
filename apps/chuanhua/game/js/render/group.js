/**
 * 本群接龙 (spec 8.11, rev. 2): one aggregate stats line (no per-person data, AC 98) and the sections 正在开的局 (open lobbies,
 * joinable rows are tappable; a game in progress is not), 慢慢传 · 等你接 (rows you may claim), 慢慢传 · 进行中 and 最近揭晓
 * (a room or a chain). 开一局 is pinned at the bottom; the optional list banner sits below it with a >= 24 pt gap (only in
 * ready/empty).
 * States noGroup | checkingGroup | loading | ready | empty | error.
 * Hit ids: group:back, group:room:<roomId>, group:item:<chainId>, group:revealedRoom:<id>, group:revealedChain:<id>,
 * group:newRoom, group:retry, group:scroll.
 */

const T = require('./theme');
const W = require('./widgets');
const S = require('./screen');
const Art = require('./art');
const C = T.COLORS;

function draw(ctx, vm, L) {
  const hits = S.begin(ctx, vm, L);
  const st = vm.state || 'ready';
  W.backButton(ctx, L, hits, '返回', 'group:back');
  let y = S.header(ctx, L, hits, { title: '本群接龙' });
  const bw = L.contentW;
  const bh = T.btn(L, 56);
  const showBanner = (st === 'ready' || st === 'empty') && vm.banner && vm.banner.show;
  const limit = showBanner ? S.bannerReserve(ctx, L, vm.banner) : L.bottomEdge - L.bottomPad;
  const startY = limit - bh;

  const start = () => W.button(ctx, L, hits, { id: 'group:newRoom', x: L.x0, y: startY, w: bw, h: bh, label: '开一局', kind: 'primary' });

  if (st === 'noGroup') {
    const yy = S.statePanel(ctx, L, hits, { y: y + L.u(24), art: 'empty', headline: '在群聊里点开接龙卡片，就能看到本群的接龙' });
    void yy;
    start();
    return hits.result();
  }
  if (st === 'checkingGroup' || st === 'loading') {
    S.statePanel(ctx, L, hits, { y: y + L.u(10), skeleton: true, rows: st === 'loading' ? 4 : 2, headline: st === 'checkingGroup' ? '正在确认群聊…' : '正在加载…', t: vm.t });
    return hits.result();
  }
  if (st === 'error') {
    S.statePanel(ctx, L, hits, { y: y + L.u(24), art: 'error', headline: '本群接龙暂时打不开', retryId: 'group:retry' });
    return hits.result();
  }
  if (st === 'empty') {
    S.statePanel(ctx, L, hits, { y: y + L.u(24), art: 'empty', headline: '本群还没有接龙，开第一局吧' });
    start();
    return hits.result();
  }

  // ready
  const area = { x: L.x0, y: y + L.u(2), w: bw, h: startY - L.u(10) - y - L.u(2) };
  const rowH = Math.max(L.u(60), T.minBtn() + L.u(12));
  const gap = L.u(8);
  const lh = Math.round(T.FS.bodyL * 1.4);
  const slh = Math.round(T.FS.body * 1.5);
  const statsLines = vm.statsText ? W.wrap(ctx, vm.statsText, bw - L.u(8), T.FS.body, 700) : [];
  const statsH = statsLines.length ? statsLines.length * slh + L.u(8) : 0;
  const rows = (arr, wrapW, size) => arr.map((r) => ({ r, lines: W.wrap(ctx, r.line, wrapW, size, 700).slice(0, 2) }));
  const textW = bw - L.u(16) - L.u(44) - L.u(26);
  const w0 = rows((vm.rooms || []).map((r) => ({ key: r.roomId, line: r.line, joinable: r.joinable })), textW, T.FS.bodyL);
  const w1 = rows((vm.waiting || []).map((r) => ({ key: r.chainId, line: r.line })), textW, T.FS.bodyL);
  const w2 = rows((vm.inProgress || []).map((r) => ({ key: r.chainId, line: r.line })), textW, T.FS.bodyL);
  const w3 = rows((vm.revealed || []).map((r) => ({ key: r.id, kind: r.kind, line: r.line, participant: r.member })), textW - L.u(40), T.FS.bodyL);
  const secs = [
    { label: '正在开的局', items: w0, dot: 'room', id: 'group:room:' },
    { label: '慢慢传 · 等你接', items: w1, dot: 'on', id: 'group:item:' },
    { label: '慢慢传 · 进行中', items: w2, dot: 'off', id: 'group:item:' },
    { label: '最近揭晓', items: w3, dot: 'rev', id: null },
  ].filter((s) => s.items.length);
  const itemH = (it) => Math.max(rowH, it.lines.length * lh + L.u(20));
  const contentH = statsH + secs.reduce((a, s) => a + L.u(30) + s.items.reduce((b, it) => b + itemH(it) + gap, 0), 0) + L.u(8);

  W.scrollBody(ctx, hits, area, contentH, vm.scrollY, 'group:scroll', () => {
    let cy = area.y;
    if (statsLines.length) {
      statsLines.forEach((ln, i) => W.text(ctx, ln, L.x0 + L.u(4), cy + i * slh + slh / 2, { size: T.FS.body, weight: 700, color: C.orangeDeep }));
      cy += statsH;
    }
    secs.forEach((s) => {
      W.text(ctx, s.label, L.x0 + L.u(4), cy + L.u(14), { size: T.FS.body, weight: 800, color: C.sub });
      cy += L.u(30);
      s.items.forEach((it) => {
        const h = itemH(it);
        const tappable = s.dot !== 'room' || it.r.joinable;
        W.card(ctx, L.x0, cy, bw, h, { r: L.u(14), shadow: s.dot === 'on' || (s.dot === 'room' && it.r.joinable) });
        const dx = L.x0 + L.u(22);
        ctx.beginPath();
        ctx.arc(dx, cy + h / 2, L.u(7), 0, Math.PI * 2);
        if (s.dot === 'on' || (s.dot === 'room' && it.r.joinable)) {
          ctx.fillStyle = C.orange;
          ctx.fill();
        }
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 2;
        if (s.dot !== 'rev') ctx.stroke();
        else W.iconCheck(ctx, dx, cy + h / 2, L.u(12), C.greenText);
        it.lines.forEach((ln, i) => W.text(ctx, ln, L.x0 + L.u(44), cy + h / 2 + (i - (it.lines.length - 1) / 2) * lh, { size: T.FS.bodyL, weight: s.dot === 'on' || tappable && s.dot === 'room' ? 800 : 600, color: tappable ? C.ink : C.sub }));
        if (s.dot === 'rev' && it.r.participant) W.chip(ctx, L, L.x0 + bw - L.u(40), cy + h / 2, '你', { kind: 'info', size: T.FS.body, align: 'right' });
        if (tappable) {
          W.iconChevron(ctx, L.x0 + bw - L.u(18), cy + h / 2, L.u(14), C.sub);
          hits.add(s.dot === 'rev' ? 'group:revealed' + (it.r.kind === 'room' ? 'Room:' : 'Chain:') + it.r.key : s.id + it.r.key, L.x0, cy, bw, h);
        }
        cy += h + gap;
      });
    });
  });
  start();
  return hits.result();
}

module.exports = { draw };
