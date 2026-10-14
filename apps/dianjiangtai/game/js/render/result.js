/**
 * Result: battle reveal plus verdict (spec 8.3). draw(ctx, vm, layout) -> hitAreas.
 *
 * vm = spec 13 Result model plus optional extras (CONTRACT.md):
 *   revealCount: 0..12 (fractional; the integer part is how many rows are in,
 *     the fraction animates the newest row). Only read while status='revealing'.
 *   stampT: 0..1 slam-in progress of the 12-0 seal (default 1)
 *   scrollY: scroll offset of the verdict content (status 'done')
 *   sheet: null|'breakdown'|'replay'; sheetScroll: px offset inside it
 *   privacyNote: boolean (refused privacy at the first ranked write)
 *   boardLabel: string (default "看群榜/好友榜")
 *   t: ms clock (waiting dots)
 *
 * Hit ids: result:back, result:skip (whole screen while revealing),
 *   result:retry, result:again, result:share, result:challenge,
 *   result:replay, result:board, result:breakdown, sheet:close,
 *   sheet:list (scroll area of an open sheet).
 * hitAreas.scrollMax = {'result:scroll': n, 'sheet:list': n}.
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits, clamp } = require('./layout');
const { recordCn, recordDash } = require('./fmt');
const C = T.COLORS;

const MODE_LABEL = { daily: '今日军令', free: '自由点将', challenge: '同签挑战' };

function badge(ctx, x, y, size, win) {
  if (win) {
    W.fillRR(ctx, x, y, size, size, size * 0.2, C.ink);
    W.text(ctx, '胜', x + size / 2, y + size / 2 + 1, { size: T.FS.bodyL, weight: 800, serif: true, color: C.sealInk, align: 'center' });
  } else {
    W.fillRR(ctx, x, y, size, size, size * 0.2, 'rgba(179,38,30,0.10)');
    W.strokeRR(ctx, x, y, size, size, size * 0.2, C.seal, 2);
    W.text(ctx, '负', x + size / 2, y + size / 2 + 1, { size: T.FS.bodyL, weight: 800, serif: true, color: C.seal, align: 'center' });
  }
}

/** One battle row (height u(58)). */
function battleRow(ctx, L, x, y, w, b, alpha, slide) {
  const h = L.u(58);
  ctx.save();
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.translate(slide || 0, 0);
  W.card(ctx, x, y, w, h, { fill: b.event ? 'rgba(179,38,30,0.06)' : C.tile, stroke: b.event ? 'rgba(179,38,30,0.45)' : C.line, r: L.u(10) });
  const bs = L.u(34);
  badge(ctx, x + w - bs - L.u(10), y + (h - bs) / 2, bs, b.win);
  const tx = x + L.u(12);
  const maxW = w - bs - L.u(34);
  const head = '第' + b.i + '战 ' + b.typeLabel;
  const hw = W.text(ctx, head, tx, y + L.u(19), { size: T.FS.bodyL, weight: 800, serif: true });
  // chance + luck, only if they fit on the line
  const extra = [b.chanceText, b.luckText].filter(Boolean).join('  ');
  if (extra && hw + L.u(16) + W.measure(ctx, extra, T.FS.body, 500, false) <= maxW) W.text(ctx, extra, tx + hw + L.u(14), y + L.u(19), { size: T.FS.body, color: C.sub });
  let cx = tx;
  if (b.event) {
    cx += W.text(ctx, b.event, tx, y + L.u(41), { size: T.FS.body, weight: 800, color: C.seal }) + L.u(8);
  }
  W.text(ctx, b.cause || '', cx, y + L.u(41), { size: T.FS.body, color: b.event ? C.ink : C.sub, maxW: maxW - (cx - tx) });
  ctx.restore();
  return h;
}

function header(ctx, L, hits, vm, backLabel) {
  W.backButton(ctx, L, hits, backLabel || '首页', 'result:back');
  const y = L.navBottom + L.u(2);
  W.text(ctx, MODE_LABEL[vm.mode] || '', L.x0, y + L.u(14), { size: T.FS.bodyL + 2, weight: 800, serif: true });
  return y + L.u(34);
}

function drawWaiting(ctx, vm, L, hits, title, sub, retry) {
  const y = header(ctx, L, hits, vm);
  const cy = Math.max(y + L.u(60), L.H * 0.4);
  if (!retry) {
    const n = Math.floor(((vm.t || 0) / 350) % 4);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(L.cx + (i - 1) * L.u(22), cy - L.u(44), L.u(6), 0, Math.PI * 2);
      ctx.fillStyle = i < n ? C.seal : 'rgba(42,33,26,0.2)';
      ctx.fill();
    }
  } else {
    W.sealStamp(ctx, L.cx, cy - L.u(52), L.u(56), '待发', '', { rotate: -6 });
  }
  W.text(ctx, title, L.cx, cy, { size: L.u(26), weight: 800, serif: true, align: 'center', maxW: L.contentW });
  W.text(ctx, sub, L.cx, cy + L.u(36), { size: T.FS.bodyL, color: C.sub, align: 'center', maxW: L.contentW });
  if (retry) {
    const bh = L.u(56);
    W.button(ctx, L, hits, { id: 'result:retry', x: L.x0, y: L.bottomEdge - L.bottomPad - bh, w: L.contentW, h: bh, label: '重 试', kind: 'primary' });
  }
}

function drawReveal(ctx, vm, L, hits) {
  const top = header(ctx, L, hits, vm);
  const battles = vm.battles || [];
  const rc = clamp(vm.revealCount || 0, 0, battles.length);
  const n = Math.floor(rc);
  const frac = rc - n;
  const rowH = L.u(58);
  const step = rowH + L.u(6);
  const footH = L.u(44);
  const areaBottom = L.bottomEdge - L.bottomPad - footH;
  const maxRows = Math.max(3, Math.floor((areaBottom - top) / step));
  const shown = Math.min(n + (frac > 0 && n < battles.length ? 1 : 0), battles.length);
  const first = Math.max(0, shown - maxRows);
  for (let i = first; i < shown; i++) {
    const isNew = i === n && frac > 0;
    const y = top + (i - first) * step;
    battleRow(ctx, L, L.x0, y, L.contentW, battles[i], isNew ? frac : 1, isNew ? (1 - frac) * L.u(24) : 0);
  }
  W.text(ctx, '已战 ' + Math.min(n, battles.length) + ' / ' + battles.length, L.x0, areaBottom + L.u(22), { size: T.FS.bodyL, weight: 800, serif: true });
  W.text(ctx, '轻点任意处，直接看结果', L.x0 + L.contentW, areaBottom + L.u(22), { size: T.FS.body, color: C.sub, align: 'right' });
  hits.add('result:skip', 0, L.navBottom, L.W, L.H - L.navBottom);
}

function drawDone(ctx, vm, L, hits) {
  const top = header(ctx, L, hits, vm);
  const barH = L.u(56);
  const barTop = L.bottomEdge - L.bottomPad - barH;
  const view = { x: 0, y: top, w: L.W, h: barTop - L.u(10) - top };
  const x = L.x0;
  const cw = L.contentW;
  const scrollY0 = vm.scrollY || 0;

  // ---- measure/draw content in one pass; first pass with a null context for height is skipped:
  // content height is deterministic from the layout, so compute it directly.
  const contentH = doneContentHeight(ctx, vm, L);
  const maxScroll = Math.max(0, contentH - view.h);
  hits.scrollMax['result:scroll'] = maxScroll;
  const scroll = clamp(scrollY0, 0, maxScroll);

  ctx.save();
  ctx.beginPath();
  ctx.rect(view.x, view.y, view.w, view.h);
  ctx.clip();
  hits.beginScroll(view, -scroll);
  ctx.translate(0, -scroll);
  let y = view.y + L.u(4);

  // record + band
  const perfect = vm.record && vm.record.w === 12;
  const recSize = L.u(perfect ? 44 : 52);
  const recW = cw - (perfect ? L.u(84) : 0);
  W.text(ctx, recordCn(vm.record), x + recW / 2, y + L.u(34), { size: recSize, weight: 900, serif: true, align: 'center', maxW: recW, minSize: 40 });
  y += L.u(70);
  if (vm.record && vm.record.w === 12) {
    W.sealStamp(ctx, x + cw - L.u(34), y - L.u(34), L.u(74), '一统天下', '', { progress: vm.stampT == null ? 1 : vm.stampT, rotate: -8 });
  }
  W.spaced(ctx, '〔' + (vm.band ? vm.band.label : '') + '〕', L.cx, y + L.u(10), { size: L.u(28), weight: 800, serif: true, color: C.seal, align: 'center', spacing: L.u(4) });
  y += L.u(40);
  y += W.paragraph(ctx, vm.comment ? '“' + vm.comment + '”' : '', x, y, cw, L.u(26), { size: T.FS.bodyL, serif: true, weight: 600, align: 'center', maxLines: 2 }) + L.u(6);
  if (vm.rarityText) {
    W.text(ctx, vm.rarityText, L.cx, y + L.u(12), { size: T.FS.body, color: C.sub, align: 'center', maxW: cw });
    y += L.u(26);
  }
  if (vm.privacyNote) {
    W.text(ctx, '未同意隐私指引，好友暂看不到你的战绩', L.cx, y + L.u(12), { size: T.FS.body, color: C.bad, align: 'center', maxW: cw });
    y += L.u(26);
  }
  y += L.u(6);

  // challenge comparison
  if (vm.challenge) {
    const ch = L.u(vm.challenge.theirLineup ? 118 : 88);
    W.card(ctx, x, y, cw, ch, { fill: C.tile, stroke: C.lineStrong, lw: 2 });
    W.text(ctx, '同一手令牌', L.cx, y + L.u(16), { size: T.FS.body, color: C.sub, align: 'center' });
    const mine = vm.record || { w: 0, l: 0 };
    const theirs = vm.challenge.theirRecord || { w: 0, l: 0 };
    W.text(ctx, '你 ' + recordDash(mine), x + cw * 0.27, y + L.u(48), { size: L.u(24), weight: 900, serif: true, align: 'center', color: mine.w >= theirs.w ? C.seal : C.ink });
    W.text(ctx, 'vs', L.cx, y + L.u(48), { size: T.FS.bodyL, color: C.sub, align: 'center' });
    W.text(ctx, '好友 ' + recordDash(theirs), x + cw * 0.73, y + L.u(48), { size: L.u(24), weight: 900, serif: true, align: 'center', color: theirs.w > mine.w ? C.seal : C.ink });
    if (vm.challenge.theirLineup) {
      const names = vm.challenge.theirLineup.map((e) => e.name).join('  ');
      W.text(ctx, '对方阵容', x + L.u(14), y + L.u(80), { size: T.FS.body, weight: 700, color: C.sub });
      W.text(ctx, names, x + L.u(14), y + L.u(104), { size: T.FS.body, color: C.ink, maxW: cw - L.u(28) });
    } else {
      W.text(ctx, '对方阵容暂不可见', L.cx, y + L.u(76), { size: T.FS.body, color: C.sub, align: 'center' });
    }
    y += ch + L.u(12);
  }

  // dots strip (tap = breakdown)
  const bs = vm.battles || [];
  const step = cw / Math.max(12, bs.length);
  bs.forEach((b, i) => {
    const cx = x + step * (i + 0.5);
    if (b.win) {
      ctx.beginPath();
      ctx.arc(cx, y + L.u(12), L.u(8), 0, Math.PI * 2);
      ctx.fillStyle = C.ink;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(cx, y + L.u(12), L.u(7), 0, Math.PI * 2);
      ctx.strokeStyle = C.seal;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  });
  W.text(ctx, '十二战 · 轻点看明细 ›', L.cx, y + L.u(38), { size: T.FS.body, color: C.sub, align: 'center' });
  hits.add('result:breakdown', x, y - L.u(6), cw, L.u(56));
  y += L.u(58);

  // lineup chips (tap = breakdown)
  const lg = L.u(6);
  const lw = (cw - lg * 4) / 5;
  const lh = L.u(70);
  (vm.lineup || []).forEach((e, i) => {
    const lx = x + i * (lw + lg);
    const col = T.FIT_COLOR[e.fit] || C.lineStrong;
    W.fillRR(ctx, lx, y, lw, lh, L.u(8), C.tile);
    W.strokeRR(ctx, lx, y, lw, lh, L.u(8), col, 2);
    W.text(ctx, T.SLOT_LABEL[e.slot] || e.label || '', lx + lw / 2, y + L.u(14), { size: T.FS.body, color: C.sub, align: 'center', weight: 600 });
    W.text(ctx, e.name, lx + lw / 2, y + L.u(36), { size: T.FS.body, weight: 800, serif: true, align: 'center', maxW: lw - L.u(4) });
    W.text(ctx, Number(e.score).toFixed(1), lx + lw / 2, y + L.u(57), { size: T.FS.bodyL, weight: 800, color: col, align: 'center' });
  });
  hits.add('result:breakdown', x, y, cw, lh);
  y += lh + L.u(14);

  // replay (rewarded video) - kept away from the primary button
  const rp = vm.replay || {};
  const rbusy = rp.adState === 'loading' || rp.adState === 'playing';
  W.button(ctx, L, hits, {
    id: 'result:replay',
    x,
    y,
    w: cw,
    h: L.u(52),
    label: rp.unlocked ? '复盘 · 最佳阵容' : rp.adState === 'loading' ? '加载中…' : rp.adState === 'playing' ? '观看中…' : '复盘·最佳阵容（看视频）',
    kind: rp.unlocked ? 'secondary' : 'ad',
    disabled: rbusy,
    size: T.FS.bodyL,
  });
  y += L.u(52) + L.u(12);

  // share + challenge
  const hw = (cw - L.u(10)) / 2;
  W.button(ctx, L, hits, { id: 'result:share', x, y, w: hw, h: L.u(52), label: '分享战报', size: T.FS.bodyL });
  W.button(ctx, L, hits, { id: 'result:challenge', x: x + hw + L.u(10), y, w: hw, h: L.u(52), label: '发起挑战', size: T.FS.bodyL });
  y += L.u(52) + L.u(12);
  W.button(ctx, L, hits, { id: 'result:board', x, y, w: cw, h: L.u(52), label: vm.boardLabel || '看群榜/好友榜', size: T.FS.bodyL });
  y += L.u(52);

  hits.endScroll();
  ctx.restore();

  // fade under the bar and the pinned primary
  const g = ctx.createLinearGradient(0, barTop - L.u(26), 0, barTop - L.u(4));
  g.addColorStop(0, 'rgba(236,222,190,0)');
  g.addColorStop(1, 'rgba(232,217,185,0.96)');
  ctx.fillStyle = g;
  ctx.fillRect(0, barTop - L.u(26), L.W, L.u(22));
  ctx.fillStyle = 'rgba(232,217,185,0.96)';
  ctx.fillRect(0, barTop - L.u(4), L.W, L.H - barTop + L.u(4));
  W.button(ctx, L, hits, { id: 'result:again', x, y: barTop, w: cw, h: barH, label: '再来一局', kind: 'primary' });
  if (maxScroll > 0) {
    const bh = Math.max(L.u(24), view.h * (view.h / contentH));
    const by = view.y + (view.h - bh) * (scroll / maxScroll);
    W.fillRR(ctx, L.W - 5, by, 3, bh, 1.5, 'rgba(42,33,26,0.35)');
  }
  void y;
}

function doneContentHeight(ctx, vm, L) {
  const nLines = vm.comment ? Math.min(2, W.wrap(ctx, '“' + vm.comment + '”', L.contentW, T.FS.bodyL, 600, true).length) : 0;
  let h = L.u(4) + L.u(70) + L.u(40) + L.u(26) * nLines + L.u(6);
  if (vm.rarityText) h += L.u(26);
  if (vm.privacyNote) h += L.u(26);
  h += L.u(6);
  if (vm.challenge) h += L.u(vm.challenge.theirLineup ? 118 : 88) + L.u(12);
  h += L.u(58) + L.u(70) + L.u(14) + L.u(52) + L.u(12) + L.u(52) + L.u(12) + L.u(52);
  return h;
}

// ------------------------------------------------------------------ sheets

function sheetFrame(ctx, L, hits, title, vm) {
  const h = Math.min(L.H - L.navBottom - L.u(10), L.u(560));
  const s = W.sheet(ctx, L, hits, { h, title });
  const area = { x: s.x, y: s.top - L.u(6), w: s.w, h: s.bottom - (s.top - L.u(6)) };
  return { s, area };
}

function drawBreakdown(ctx, vm, L, hits) {
  const { area } = sheetFrame(ctx, L, hits, '战报明细', vm);
  const rowsL = vm.lineup || [];
  const bs = vm.battles || [];
  const m = vm.morale || {};
  const fmt = (n) => (typeof n === 'number' ? n.toFixed(2) : String(n == null ? '' : n));
  const bondText = m.bonds && m.bonds.length ? m.bonds.join('、') : '无';
  const contentH = L.u(28) + rowsL.length * L.u(42) + L.u(20) + L.u(28) + L.u(26) * 2 + L.u(14) + L.u(28) + bs.length * L.u(64);
  const maxScroll = Math.max(0, contentH - area.h);
  hits.scrollMax['sheet:list'] = maxScroll;
  const scroll = clamp(vm.sheetScroll || 0, 0, maxScroll);
  hits.add('sheet:list', area.x, area.y, area.w, area.h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x - 4, area.y, area.w + 8, area.h);
  ctx.clip();
  hits.beginScroll(area, -scroll);
  ctx.translate(0, -scroll);
  let y = area.y;
  W.text(ctx, '我的阵容 · 各位置得分', area.x, y + L.u(12), { size: T.FS.bodyL, weight: 800, serif: true });
  y += L.u(28);
  rowsL.forEach((e) => {
    W.text(ctx, T.SLOT_LABEL[e.slot] || e.label, area.x, y + L.u(20), { size: T.FS.body, color: C.sub, weight: 600 });
    W.text(ctx, e.name, area.x + L.u(58), y + L.u(20), { size: T.FS.bodyL, weight: 800, serif: true });
    W.text(ctx, Number(e.score).toFixed(1), area.x + area.w * 0.58, y + L.u(20), { size: T.FS.bodyL, weight: 800, align: 'right' });
    W.fitChip(ctx, area.x + area.w - L.u(70), y + L.u(7), e.fit);
    y += L.u(42);
  });
  y += L.u(20);
  W.text(ctx, '士气 ×' + fmt(m.total), area.x, y + L.u(12), { size: T.FS.bodyL, weight: 800, serif: true });
  y += L.u(28);
  W.text(ctx, '主公 +' + fmt(m.lord) + '    同乡 +' + fmt(m.cohesion), area.x, y + L.u(12), { size: T.FS.body, color: C.sub });
  W.text(ctx, '羁绊：' + bondText, area.x, y + L.u(38), { size: T.FS.body, color: C.sub, maxW: area.w });
  y += L.u(26) * 2 + L.u(14);
  W.text(ctx, '十二战明细', area.x, y + L.u(12), { size: T.FS.bodyL, weight: 800, serif: true });
  y += L.u(28);
  bs.forEach((b) => {
    battleRow(ctx, L, area.x, y, area.w - L.u(6), b, 1, 0);
    y += L.u(64);
  });
  hits.endScroll();
  ctx.restore();
}

function drawReplay(ctx, vm, L, hits) {
  const h = L.u(60) + L.u(54) + 5 * L.u(48) + L.u(80) + L.safeBottom;
  const s = W.sheet(ctx, L, hits, { h, title: '复盘 · 最佳阵容' });
  const rp = vm.replay || {};
  const best = rp.best;
  let y = s.top - L.u(6);
  if (!best) {
    W.text(ctx, '正在计算最佳阵容…', L.cx, y + L.u(60), { size: T.FS.bodyL, color: C.sub, align: 'center' });
    return;
  }
  const c1 = s.x + s.w * 0.30;
  const c2 = s.x + s.w * 0.70;
  W.text(ctx, '位置', s.x, y + L.u(14), { size: T.FS.body, color: C.sub, weight: 700 });
  W.text(ctx, '你的阵容', c1, y + L.u(14), { size: T.FS.body, color: C.sub, weight: 700, align: 'center' });
  W.text(ctx, '最佳阵容', c2 + L.u(18), y + L.u(14), { size: T.FS.body, color: C.seal, weight: 700, align: 'center' });
  y += L.u(32);
  const mine = {};
  (vm.lineup || []).forEach((e) => (mine[e.slot] = e));
  const bestBy = {};
  (best.lineup || []).forEach((e) => (bestBy[e.slot] = e));
  T.SLOT_ORDER.forEach((k) => {
    const a = mine[k] || {};
    const b = bestBy[k] || {};
    const diff = a.name !== b.name;
    if (diff) W.fillRR(ctx, s.x - 4, y + L.u(2), s.w + 8, L.u(44), L.u(8), 'rgba(179,38,30,0.07)');
    W.text(ctx, T.SLOT_LABEL[k], s.x, y + L.u(24), { size: T.FS.body, color: C.sub, weight: 600 });
    W.text(ctx, (a.name || '—') + ' ' + (a.score != null ? Number(a.score).toFixed(1) : ''), c1, y + L.u(24), { size: T.FS.bodyL, align: 'center', weight: 700, maxW: s.w * 0.36 });
    W.text(ctx, (b.name || '—') + ' ' + (b.score != null ? Number(b.score).toFixed(1) : ''), c2 + L.u(18), y + L.u(24), { size: T.FS.bodyL, align: 'center', weight: 800, color: diff ? C.seal : C.ink, maxW: s.w * 0.36 });
    y += L.u(48);
  });
  y += L.u(10);
  W.text(ctx, '你 ' + recordDash(vm.record) + '   →   最佳 ' + recordDash(best.record), L.cx, y + L.u(16), { size: T.FS.title, weight: 900, serif: true, align: 'center', maxW: s.w });
}

function draw(ctx, vm, L) {
  const hits = new Hits();
  W.paper(ctx, L);
  switch (vm.status) {
    case 'waitingServer':
      drawWaiting(ctx, vm, L, hits, '军报传递中…', '战鼓已响，请稍候', false);
      break;
    case 'pendingSubmit':
      drawWaiting(ctx, vm, L, hits, '战报待发送', '网络不通，阵容已保存，联网后自动重试', true);
      break;
    case 'error':
      drawWaiting(ctx, vm, L, hits, '军报传递失败', '阵容已保存，请再试一次', true);
      break;
    case 'revealing':
      drawReveal(ctx, vm, L, hits);
      break;
    default:
      drawDone(ctx, vm, L, hits);
  }
  if (vm.status === 'done') {
    if (vm.sheet === 'breakdown') drawBreakdown(ctx, vm, L, hits);
    else if (vm.sheet === 'replay' && vm.replay && vm.replay.unlocked) drawReplay(ctx, vm, L, hits);
  }
  return hits.result();
}

module.exports = { draw, battleRow };
