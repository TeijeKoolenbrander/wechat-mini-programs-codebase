/**
 * Lobby (spec 8.16, PO-41/42): the waiting room of a live game. Ten numbered doodle-sticker seats in two rows of five (filled =
 * joined, "你" under the viewer's own, a faint "?" when a seat has been silent for 60 s), "4 人已加入（3–10 人）", one line
 * about the game, then the actions pinned at the bottom: 邀请群友 (share the room card, voluntary), the host's 开始（4 人）
 * with its hint and the link 两个人？去慢慢传, or the non-host's "等房主开始…". Seats are not tappable (no profiles, PO-8).
 * No ads, no 今日彩笔, no banner in the lobby (PO-49).
 *
 * States ready | starting | closed | removed | offline (offline keeps the screen and adds "网络不好，正在重连…").
 * Hit ids: lobby:back, lobby:invite, lobby:start, lobby:slow, lobby:home, lobby:scroll.
 */

const T = require('./theme');
const W = require('./widgets');
const S = require('./screen');
const Ch = require('./chrome');
const C = T.COLORS;

const LINE = '每人选一个题目，轮流画和猜，大约 3 分钟，最后一起揭晓';

function seat(ctx, cx, cy, d, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((((s.n * 37) % 7) - 3) * 0.02);
  ctx.beginPath();
  ctx.arc(0, 0, d / 2, 0, Math.PI * 2);
  if (s.filled) {
    ctx.fillStyle = C.orange;
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  } else {
    ctx.fillStyle = C.card;
    ctx.fill();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = T.isHC() ? C.ink : C.lineStrong;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
  W.text(ctx, String(s.n), cx, cy + 0.5, { size: T.FS.bodyL, weight: 900, color: s.filled ? C.ink : C.sub, align: 'center' });
  if (s.filled && s.quiet) {
    // faint "?" badge (可能已离开)
    ctx.beginPath();
    ctx.arc(cx + d * 0.36, cy - d * 0.36, d * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = C.card;
    ctx.fill();
    ctx.strokeStyle = C.sub;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    W.text(ctx, '?', cx + d * 0.36, cy - d * 0.36 + 0.5, { size: T.FS.body, weight: 800, color: C.sub, align: 'center' });
  }
}

function draw(ctx, vm, L) {
  const hits = S.begin(ctx, vm, L);
  const st = vm.state || 'ready';
  const g = Ch.topBar(ctx, L, hits, { back: st === 'ready' || st === 'starting' || st === 'offline' ? '离开' : '首页', backId: st === 'ready' || st === 'starting' || st === 'offline' ? 'lobby:back' : 'lobby:home' });
  const bw = L.contentW;
  const area = S.area(L, g.y + g.h + 4, L.bottomEdge - 8);

  if (st === 'closed' || st === 'removed') {
    S.statePanel(ctx, L, hits, {
      y: area.y + 24, art: 'empty', headline: st === 'closed' ? '这一局太久没开始，已关闭' : '这一局已被移除', retryId: 'lobby:home', retryLabel: '回首页',
    });
    return hits.result();
  }

  const seats = vm.seats && vm.seats.length ? vm.seats : Array.from({ length: 10 }, (v, i) => ({ n: i + 1, filled: false, me: false, quiet: false }));
  const gap = 8;
  const cell = Math.min(60, Math.floor((bw - 4 * gap) / 5));
  const d = Math.min(cell, 52) - 4;
  const labelH = Math.round(T.FS.body * 1.3);
  const rowH = cell + labelH;
  const seatsH = 2 * rowH + 6;
  const anyQuiet = seats.some((s) => s.quiet && s.filled);
  const slh = Math.round(T.FS.body * 1.5);
  const joined = vm.joinedText || '';
  const descLines = W.wrapBalanced(ctx, LINE, bw - 16, T.FS.body, 500);
  const quietLines = anyQuiet ? W.wrapBalanced(ctx, '带 ? 的座位可能已离开', bw, T.FS.body, 500) : [];
  const offLines = st === 'offline' ? W.wrap(ctx, '网络不好，正在重连…', bw - 40, T.FS.body, 700) : [];
  const titleH = Math.round(T.FS.title * 1.5);
  const joinedH = Math.round(T.FS.bodyL * 1.6);
  const contentH = (offLines.length ? offLines.length * slh + 20 + 8 : 0) + titleH + seatsH + 8 + joinedH + descLines.length * slh + (quietLines.length ? quietLines.length * slh + 4 : 0) + 8;

  // ---- actions
  const bh = T.btn(L, 56);
  const sh = T.btn(L, 48);
  const start = vm.start || { show: false };
  const acts = [];
  const hintLines = start.show && start.hint ? W.wrapBalanced(ctx, start.hint, bw, T.FS.body, 600) : [];
  if (start.show) {
    if (start.slowLink) acts.push({ k: 'slow' });
    if (hintLines.length) acts.push({ k: 'hint', h: hintLines.length * slh + 2 });
    acts.push({ k: 'start' });
  } else if (vm.waitingText) acts.push({ k: 'wait' });
  if (vm.canInvite) acts.unshift({ k: 'invite' });
  const heightOf = (a) => (a.k === 'start' ? bh : a.k === 'invite' ? sh : a.k === 'slow' ? T.MIN_TAP : a.k === 'wait' ? Math.round(T.FS.bodyL * 1.6) + 8 : a.h);
  // order top to bottom: invite, [slow], [hint], start / wait
  const order = ['invite', 'wait', 'slow', 'hint', 'start'];
  acts.sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k));
  const actionsH = acts.reduce((a, x) => a + heightOf(x) + 8, -8);

  S.page(ctx, L, hits, {
    area, contentH, actionsH, scroll: vm.scrollY, id: 'lobby:scroll', gap: 12,
    drawContent(y0) {
      let y = y0;
      if (offLines.length) {
        const h = offLines.length * slh + 20;
        W.fillRR(ctx, L.x0, y, bw, h, 10, C.orangeSoft);
        W.strokeRR(ctx, L.x0, y, bw, h, 10, C.orangeDeep, T.isHC() ? 2 : 1.5);
        offLines.forEach((ln, i) => W.text(ctx, ln, L.cx, y + 10 + i * slh + slh / 2, { size: T.FS.body, weight: 700, color: C.orangeDeep, align: 'center' }));
        y += h + 8;
      }
      W.text(ctx, '这一局', L.cx, y + titleH / 2, { size: T.FS.title + 2, weight: 900, align: 'center' });
      y += titleH;
      // two rows of five seats
      const rowW = 5 * cell + 4 * gap;
      const sx = L.cx - rowW / 2;
      for (let i = 0; i < 10; i++) {
        const s = seats[i] || { n: i + 1, filled: false, me: false, quiet: false };
        const row = Math.floor(i / 5);
        const col = i % 5;
        const cx = sx + col * (cell + gap) + cell / 2;
        const cy = y + row * (rowH + 6) + cell / 2;
        seat(ctx, cx, cy, d, s);
        if (s.me) W.text(ctx, '你', cx, cy + cell / 2 + labelH / 2, { size: T.FS.body, weight: 800, color: C.orangeDeep, align: 'center' });
      }
      y += seatsH + 8;
      W.text(ctx, joined, L.cx, y + joinedH / 2, { size: T.FS.bodyL, weight: 800, align: 'center', maxW: bw });
      y += joinedH;
      descLines.forEach((ln, i) => W.text(ctx, ln, L.cx, y + i * slh + slh / 2, { size: T.FS.body, color: C.sub, align: 'center' }));
      y += descLines.length * slh;
      quietLines.forEach((ln, i) => W.text(ctx, ln, L.cx, y + 4 + i * slh + slh / 2, { size: T.FS.body, color: C.sub, align: 'center' }));
    },
    drawActions(y0) {
      let y = y0;
      acts.forEach((a) => {
        const h = heightOf(a);
        if (a.k === 'invite') W.button(ctx, L, hits, { id: 'lobby:invite', x: L.x0, y, w: bw, h, label: '邀请群友', kind: 'secondary', size: T.FS.bodyL });
        else if (a.k === 'slow') W.link(ctx, L, hits, { id: 'lobby:slow', x: L.cx, y: y + h / 2, label: '两个人？去慢慢传', align: 'center', size: T.FS.body });
        else if (a.k === 'hint') hintLines.forEach((ln, i) => W.text(ctx, ln, L.cx, y + 1 + i * slh + slh / 2, { size: T.FS.body, weight: 600, color: C.sub, align: 'center' }));
        else if (a.k === 'wait') W.text(ctx, vm.waitingText, L.cx, y + h / 2, { size: T.FS.bodyL, weight: 700, color: C.sub, align: 'center', maxW: bw });
        else W.button(ctx, L, hits, { id: 'lobby:start', x: L.x0, y, w: bw, h, label: st === 'starting' ? '马上开始…' : start.label || '开始', kind: 'primary', disabled: !start.enabled || st === 'starting' });
        y += h + 8;
      });
    },
  });
  return hits.result();
}

module.exports = { draw, LINE };
