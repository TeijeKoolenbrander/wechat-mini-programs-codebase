/**
 * Archive 往期 (spec 8.10). draw(ctx, vm, layout) -> hitAreas.
 *
 * vm = spec 13 Archive model, plus extras (CONTRACT.md):
 *   scrollY: px offset of the list
 *   display, t
 * item.line is pre-formatted by logic ("今日 · 21步猜中", "番薯 · 18步",
 * "未玩 · 去猜", "进行中 · 9步"). The answer is only ever in `line`/`answer`
 * for finished issues (logic decides).
 *
 * Hit ids: archive:back, archive:item:<puzzleId>, archive:more,
 *   archive:practice, archive:retry, archive:list (drag area; scrollMax id).
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits } = require('./layout');
const C = T.COLORS;

/** Small status mark: ✓ solved, × gave up, lamp-less dot for in progress, ring for unplayed. */
function statusMark(ctx, cx, cy, r, status) {
  if (status === 'solved' || status === 'today') {
    W.fillRR(ctx, cx - r, cy - r, 2 * r, 2 * r, r, status === 'today' ? T.BAND_COLOR.hit : C.good);
    W.iconCheck(ctx, cx, cy, r * 1.1, '#FFFFFF');
  } else if (status === 'gaveup') {
    W.fillRR(ctx, cx - r, cy - r, 2 * r, 2 * r, r, T.BAND_COLOR.cold);
    W.iconClose(ctx, cx, cy, r * 0.9, '#FFFFFF');
  } else if (status === 'playing') {
    W.fillRR(ctx, cx - r, cy - r, 2 * r, 2 * r, r, T.BAND_COLOR.hot);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(cx - r * 0.45, cy - r * 0.08, r * 0.9, r * 0.16);
    ctx.fillRect(cx - r * 0.08, cy - r * 0.45, r * 0.16, r * 0.9);
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
    ctx.strokeStyle = C.lineStrong;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display);
  const hits = new Hits();
  W.paper(ctx, L);
  W.backButton(ctx, L, hits, '返回', 'archive:back');
  const cw = L.contentW;
  const x = L.x0;
  const large = T.METRICS.large;
  const btnH = L.u(T.METRICS.btn);

  // title row
  const ty = L.navBottom + L.u(large ? 26 : 22);
  W.text(ctx, '往期', x, ty, { size: T.FS.title + 2, weight: 800, serif: true });
  if (vm.bestStreak > 0 && vm.state === 'ready') {
    W.text(ctx, '最长连续猜中 ' + vm.bestStreak + ' 天', x + cw, ty, { size: T.FS.body, weight: 600, color: C.sub, align: 'right', maxW: cw * 0.62 });
  }

  const practice = vm.practice || { done: 0, total: 0 };
  const bottom = L.bottomEdge - L.bottomPad;
  const pcH = L.u(large ? 76 : 64);
  const listTop = ty + L.u(large ? 30 : 26);
  const state = vm.state || 'loading';

  const practiceCard = () => {
    const y = bottom - pcH;
    W.card(ctx, x, y, cw, pcH, { shadow: true });
    W.text(ctx, '练习题', x + L.u(16), y + pcH * 0.34, { size: T.FS.bodyL, weight: 800, serif: true });
    W.text(ctx, '已完成 ' + practice.done + ' / ' + practice.total, x + L.u(16), y + pcH * 0.72, { size: T.FS.body, color: C.sub });
    W.text(ctx, '去练习', x + cw - L.u(34), y + pcH / 2, { size: T.FS.bodyL, weight: 800, color: C.accent, align: 'right' });
    W.iconChevron(ctx, x + cw - L.u(20), y + pcH / 2, L.u(13), C.accent);
    hits.add('archive:practice', x, y, cw, pcH);
  };

  if (state === 'loading') {
    const rowH = L.u(large ? 88 : 64);
    const n = Math.max(3, Math.min(7, Math.floor((bottom - pcH - listTop) / rowH)));
    for (let i = 0; i < n; i++) {
      const y = listTop + i * rowH;
      W.skeleton(ctx, x + L.u(8), y + rowH * 0.2, L.u(30), L.u(30), vm.t, L.u(15));
      W.skeleton(ctx, x + L.u(52), y + rowH * 0.22, cw * 0.3, rowH * 0.22, vm.t, 6);
      W.skeleton(ctx, x + L.u(52), y + rowH * 0.58, cw * 0.2, rowH * 0.16, vm.t, 6);
      W.skeleton(ctx, x + cw * 0.62, y + rowH * 0.36, cw * 0.32, rowH * 0.26, vm.t, 6);
    }
    W.text(ctx, '正在取往期…', L.cx, bottom - pcH - L.u(24), { size: T.FS.body, color: C.sub, align: 'center' });
    practiceCard();
    return hits.result();
  }
  if (state === 'error') {
    W.message(ctx, L, ['往期需联网查看', '检查网络后再试一次'], listTop + L.u(40));
    W.button(ctx, L, hits, { id: 'archive:retry', x, y: bottom - btnH, w: cw, h: btnH, label: '重试', kind: 'primary' });
    return hits.result();
  }
  if (state === 'empty') {
    W.message(ctx, L, ['还没有往期，先去练习吧'], listTop + L.u(40));
    W.button(ctx, L, hits, { id: 'archive:practice', x, y: bottom - btnH, w: cw, h: btnH, label: '练习', kind: 'primary' });
    return hits.result();
  }

  // ready: scrolling list of issues, practice card pinned below
  const rowH = L.u(large ? 88 : 64);
  const items = vm.items || [];
  const view = { x, y: listTop, w: cw, h: Math.max(0, bottom - pcH - L.u(12) - listTop) };
  const moreH = vm.hasMore ? L.u(T.METRICS.tap) + L.u(12) : 0;
  const contentH = items.length * rowH + moreH;
  const maxScroll = Math.max(0, contentH - view.h);
  const off = Math.max(0, Math.min(vm.scrollY || 0, maxScroll));
  hits.scrollMax['archive:list'] = maxScroll;

  ctx.save();
  ctx.beginPath();
  ctx.rect(view.x - 2, view.y, view.w + 4, view.h);
  ctx.clip();
  ctx.translate(0, -off);
  if (maxScroll > 0) hits.add('archive:list', view.x, view.y, view.w, view.h);
  hits.beginScroll(view, -off);
  items.forEach((it, i) => {
    const y = view.y + i * rowH;
    if (y + rowH < view.y + off || y > view.y + view.h + off) return;
    const today = it.status === 'today';
    if (today) W.fillRR(ctx, x, y + 2, cw, rowH - 4, L.u(12), 'rgba(201,151,58,0.14)');
    statusMark(ctx, x + L.u(22), y + rowH / 2, L.u(13), it.status);
    const tx = x + L.u(48);
    const rightX = x + cw - L.u(28);
    W.text(ctx, '第 ' + it.issueNo + ' 期', tx, y + rowH * 0.32, { size: T.FS.bodyL, weight: 800 });
    W.text(ctx, it.dateLabel || '', rightX, y + rowH * 0.32, { size: T.FS.body, color: C.sub, align: 'right' });
    const finished = it.status === 'solved' || it.status === 'gaveup' || today;
    W.text(ctx, it.line || '', tx, y + rowH * 0.72, {
      size: T.FS.bodyL,
      weight: finished ? 700 : 600,
      color: it.status === 'unplayed' ? C.accent : C.ink,
      maxW: rightX - tx,
    });
    W.iconChevron(ctx, x + cw - L.u(12), y + rowH / 2, L.u(12), C.sub);
    ctx.fillStyle = C.line;
    ctx.fillRect(x + L.u(8), y + rowH - 0.5, cw - L.u(16), 1);
    hits.add('archive:item:' + it.puzzleId, x, y, cw, rowH);
  });
  if (vm.hasMore) {
    const my = view.y + items.length * rowH + L.u(6);
    W.button(ctx, L, hits, { id: 'archive:more', x, y: my, w: cw, h: L.u(T.METRICS.tap), label: '加载更多', kind: 'ghost', size: T.FS.bodyL });
  }
  hits.endScroll();
  ctx.restore();
  practiceCard();
  return hits.result();
}

module.exports = { draw };
