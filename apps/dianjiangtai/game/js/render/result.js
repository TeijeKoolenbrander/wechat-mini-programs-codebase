/**
 * Result: battle reveal plus verdict (spec 8.3). draw(ctx, vm, layout) -> hitAreas.
 *
 * vm = spec 13 Result model (+ v1 additions), plus optional extras (CONTRACT.md):
 *   revealCount: 0..12 (fractional; the integer part is how many rows are in,
 *     the fraction animates the newest row). Only read while status='revealing'.
 *   stampT: 0..1 slam-in progress of the 12-0 seal (default 1)
 *   scrollY: scroll offset of the verdict content (status 'done')
 *   sheet: null|'breakdown'|'replay'; sheetScroll: px offset inside it
 *   privacyNote: boolean (refused privacy at the first ranked write)
 *   boardLabel: string (default "看群榜/好友榜")
 *   variantLabel '识人'|null; reveal {pending, step 0..5}; streak {current,text}
 *   saveImage {state}; subscribe {state, challengeId}
 *   lineup[] may carry seal-related extras: tier, stats, factionKey, monogram
 *   display, t
 *
 * Hit ids: result:back, result:skip (whole screen while revealing),
 *   result:revealSkip (verdict area while the 识人 五德揭晓 plays),
 *   result:retry, result:again, result:share, result:challenge, result:save,
 *   result:subscribe, result:replay, result:board, result:breakdown,
 *   sheet:close, sheet:list (scroll area of an open sheet).
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
    W.fillRR(ctx, x, y, size, size, size * 0.2, C.tintSeal);
    W.strokeRR(ctx, x, y, size, size, size * 0.2, C.seal, 2);
    W.text(ctx, '负', x + size / 2, y + size / 2 + 1, { size: T.FS.bodyL, weight: 800, serif: true, color: C.seal, align: 'center' });
  }
}

/** Geometry of one battle row. Standard: one 58pt row. Large text: head / odds / event / cause lines. */
function battleGeom(ctx, L, w, b) {
  const large = T.isLarge();
  const bs = L.u(large ? 40 : 34);
  const maxW = w - bs - L.u(34);
  if (!large) return { h: L.u(58), bs, maxW, causeLines: null };
  const lines = W.wrap(ctx, b.cause || '', maxW, T.FS.body, 400, false).slice(0, 2);
  const extra = [b.chanceText, b.luckText].filter(Boolean).join('  ');
  const h = L.u(10) + L.u(30) + (extra ? L.u(26) : 0) + (b.event ? L.u(26) : 0) + lines.length * L.u(26) + L.u(8);
  return { h, bs, maxW, causeLines: lines, extra };
}

/** One battle row. Returns its height. paint=false only measures. */
function battleRow(ctx, L, x, y, w, b, alpha, slide, paint) {
  const g = battleGeom(ctx, L, w, b);
  const h = g.h;
  if (paint === false) return h;
  ctx.save();
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.translate(slide || 0, 0);
  W.card(ctx, x, y, w, h, { fill: b.event ? C.tintSeal : C.tile, stroke: b.event ? C.seal : C.line, r: L.u(10) });
  badge(ctx, x + w - g.bs - L.u(10), y + (T.isLarge() ? L.u(10) : (h - g.bs) / 2), g.bs, b.win);
  const tx = x + L.u(12);
  const maxW = g.maxW;
  const head = '第' + b.i + '战 ' + b.typeLabel;
  if (!T.isLarge()) {
    const hw = W.text(ctx, head, tx, y + L.u(19), { size: T.FS.bodyL, weight: 800, serif: true });
    // chance + luck, only if they fit on the line
    const extra = [b.chanceText, b.luckText].filter(Boolean).join('  ');
    if (extra && hw + L.u(16) + W.measure(ctx, extra, T.FS.body, 500, false) <= maxW) W.text(ctx, extra, tx + hw + L.u(14), y + L.u(19), { size: T.FS.body, color: C.sub });
    let cx = tx;
    if (b.event) cx += W.text(ctx, b.event, tx, y + L.u(41), { size: T.FS.body, weight: 800, color: C.seal }) + L.u(8);
    W.text(ctx, b.cause || '', cx, y + L.u(41), { size: T.FS.body, color: b.event ? C.ink : C.sub, maxW: maxW - (cx - tx) });
  } else {
    let ly = y + L.u(10);
    W.text(ctx, head, tx, ly + L.u(15), { size: T.FS.bodyL, weight: 800, serif: true, maxW });
    ly += L.u(30);
    if (g.extra) {
      W.text(ctx, g.extra, tx, ly + L.u(13), { size: T.FS.body, color: C.sub, maxW });
      ly += L.u(26);
    }
    if (b.event) {
      W.text(ctx, b.event, tx, ly + L.u(13), { size: T.FS.body, weight: 800, color: C.seal, maxW });
      ly += L.u(26);
    }
    g.causeLines.forEach((ln, i) => W.text(ctx, ln, tx, ly + L.u(13) + i * L.u(26), { size: T.FS.body, color: b.event ? C.ink : C.sub, maxW }));
  }
  ctx.restore();
  return h;
}

function header(ctx, L, hits, vm, backLabel) {
  W.backButton(ctx, L, hits, backLabel || '首页', 'result:back');
  const y = L.navBottom + L.u(2);
  const label = MODE_LABEL[vm.mode] || '';
  const lw = W.text(ctx, label, L.x0, y + L.u(14), { size: T.FS.bodyL + 2, weight: 800, serif: true });
  if (vm.variantLabel) W.pill(ctx, L, L.x0 + lw + L.u(10), y + L.u(14), vm.variantLabel, { size: T.FS.body });
  return y + L.u(T.isLarge() ? 40 : 34);
}

function drawWaiting(ctx, vm, L, hits, title, sub, retry) {
  const y = header(ctx, L, hits, vm);
  const cy = Math.max(y + L.u(60), L.H * 0.4);
  if (!retry) {
    const n = Math.floor(((vm.t || 0) / 350) % 4);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(L.cx + (i - 1) * L.u(22), cy - L.u(44), L.u(6), 0, Math.PI * 2);
      ctx.fillStyle = i < n ? C.seal : C.pipOff;
      ctx.fill();
    }
  } else {
    W.sealStamp(ctx, L.cx, cy - L.u(52), L.u(56), '待发', '', { rotate: -6 });
  }
  W.text(ctx, title, L.cx, cy, { size: T.FS.title + 4, weight: 800, serif: true, align: 'center', maxW: L.contentW });
  const subLines = W.wrap(ctx, sub, L.contentW, T.FS.bodyL, 400, false);
  subLines.forEach((ln, i) => W.text(ctx, ln, L.cx, cy + L.u(36) + i * L.u(T.isLarge() ? 30 : 26), { size: T.FS.bodyL, color: C.sub, align: 'center', maxW: L.contentW }));
  if (retry) {
    const bh = T.btn(L, 56);
    W.button(ctx, L, hits, { id: 'result:retry', x: L.x0, y: L.bottomEdge - L.bottomPad - bh, w: L.contentW, h: bh, label: '重 试', kind: 'primary' });
  }
}

function drawReveal(ctx, vm, L, hits) {
  const top = header(ctx, L, hits, vm);
  const battles = vm.battles || [];
  const rc = clamp(vm.revealCount || 0, 0, battles.length);
  const n = Math.floor(rc);
  const frac = rc - n;
  const footH = L.u(T.isLarge() ? 72 : 44);
  const areaBottom = L.bottomEdge - L.bottomPad - footH;
  const shown = Math.min(n + (frac > 0 && n < battles.length ? 1 : 0), battles.length);
  // show the newest rows that fit above the footer
  const w = L.contentW;
  const step = L.u(6);
  let used = 0;
  let first = shown;
  while (first > 0) {
    const h = battleRow(ctx, L, 0, 0, w, battles[first - 1], 1, 0, false) + step;
    if (used + h > areaBottom - top && shown - first >= 1) break;
    used += h;
    first--;
  }
  let y = top;
  for (let i = first; i < shown; i++) {
    const isNew = i === n && frac > 0;
    const h = battleRow(ctx, L, L.x0, y, w, battles[i], isNew ? frac : 1, isNew ? (1 - frac) * L.u(24) : 0, true);
    y += h + step;
  }
  W.text(ctx, '已战 ' + Math.min(n, battles.length) + ' / ' + battles.length, L.x0, areaBottom + L.u(22), { size: T.FS.bodyL, weight: 800, serif: true });
  if (T.isLarge()) W.text(ctx, '轻点任意处，直接看结果', L.x0, areaBottom + L.u(52), { size: T.FS.body, color: C.sub, maxW: L.contentW });
  else W.text(ctx, '轻点任意处，直接看结果', L.x0 + L.contentW, areaBottom + L.u(22), { size: T.FS.body, color: C.sub, align: 'right', maxW: L.contentW - L.u(100) });
  hits.add('result:skip', 0, L.navBottom, L.W, L.H - L.navBottom);
}

// ------------------------------------------------------------ lineup rows

function revealed(vm, i) {
  const r = vm.reveal;
  if (!r || !r.pending) return true;
  return i < (r.step || 0);
}

function lineupSeal(e, hide) {
  const key = e.factionKey || (e.seal && e.seal.factionKey) || 'qun';
  const s = e.seal || {};
  return {
    text: s.text || e.name,
    name: e.name,
    monogram: s.monogram || e.monogram || (e.name ? e.name.slice(-1) : '?'),
    factionKey: key,
    inkText: s.inkText,
    tier: hide ? null : e.tier,
    frame: hide ? 'plain' : s.frame && s.frame !== 'plain' ? s.frame : e.tier,
  };
}

function statsLine(e) {
  const s = e.stats;
  if (!s) return null;
  return T.STAT_KEYS.map((k) => T.STAT_LABEL[k] + s[k]);
}

function lineupRowH(L, e, vm, i) {
  const large = T.isLarge();
  const show = revealed(vm, i);
  const hasStats = !!e.stats || !!(vm.reveal && vm.reveal.pending);
  if (large) return L.u(8 + 48 + 8 + (hasStats ? 30 : 0) + 36 + 8);
  return L.u(hasStats ? 92 : 60);
}

/** Standard runs: five compact chips (seal, slot, name, score + fit icon). Large text and 识人 reveals use the taller rows. */
function useRows(vm) {
  return T.isLarge() || !!vm.reveal;
}

function chipsH(L) {
  return L.u(112);
}

function drawLineupChips(ctx, L, x, y, w, lineup) {
  const g = L.u(6);
  const lw = (w - g * 4) / 5;
  const lh = chipsH(L);
  lineup.forEach((e, i) => {
    const lx = x + i * (lw + g);
    const col = T.FIT_COLOR[e.fit] || C.lineStrong;
    W.fillRR(ctx, lx, y, lw, lh, L.u(8), C.tile);
    W.strokeRR(ctx, lx, y, lw, lh, L.u(8), col, T.isHC() ? 3 : 2);
    W.text(ctx, T.SLOT_LABEL[e.slot] || e.label || '', lx + lw / 2, y + L.u(14), { size: T.FS.body, color: C.sub, align: 'center', weight: 600 });
    const ss = Math.min(lw - L.u(10), L.u(38));
    W.seal(ctx, lx + (lw - ss) / 2, y + L.u(26), ss, lineupSeal(e, false), { dpr: L.dpr });
    W.text(ctx, e.name, lx + lw / 2, y + L.u(26) + ss + L.u(12), { size: T.FS.body, weight: 800, serif: true, align: 'center', maxW: lw - L.u(4) });
    const sc = Number(e.score).toFixed(1);
    const sw = W.measure(ctx, sc, T.FS.bodyL, 800, false);
    const iy = y + lh - L.u(15);
    const total = sw + L.u(14);
    const sx = lx + lw / 2 - total / 2;
    if (e.fit === 'good') W.iconCheck(ctx, sx + L.u(5), iy, L.u(9), col);
    else if (e.fit === 'bad') {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(sx + L.u(5), iy - L.u(5));
      ctx.lineTo(sx + L.u(10), iy + L.u(4));
      ctx.lineTo(sx, iy + L.u(4));
      ctx.closePath();
      ctx.fill();
    } else ctx.fillRect(sx + L.u(1), iy - 1, L.u(8), 2);
    W.text(ctx, sc, sx + L.u(14), iy, { size: T.FS.bodyL, weight: 800, color: col });
  });
}

function drawLineupRow(ctx, L, x, y, w, e, vm, i) {
  const large = T.isLarge();
  const show = revealed(vm, i);
  const h = lineupRowH(L, e, vm, i);
  const col = show ? T.FIT_COLOR[e.fit] || C.lineStrong : C.lineStrong;
  W.fillRR(ctx, x, y, w, h, L.u(10), C.tile);
  W.strokeRR(ctx, x, y, w, h, L.u(10), col, T.isHC() ? 3 : 2);
  const seal = L.u(48);
  const sy = large ? y + L.u(8) : y + (h - seal) / 2;
  W.seal(ctx, x + L.u(8), sy, seal, lineupSeal(e, !show), { dpr: L.dpr });
  const tx = x + L.u(8) + seal + L.u(10);
  const slot = T.SLOT_LABEL[e.slot] || e.label || '';
  const sline = statsLine(e);
  const hasStats = !!e.stats || !!(vm.reveal && vm.reveal.pending);
  const statStr = hasStats ? (show && sline ? sline.join(' ') : '智？ 信？ 仁？ 勇？ 严？') : null;

  const scoreStr = show && e.score != null ? Number(e.score).toFixed(1) : '？';
  if (large) {
    const ny = y + L.u(8) + L.u(14);
    const nw = W.text(ctx, e.name, tx, ny, { size: T.FS.bodyL, weight: 800, serif: true, maxW: x + w - tx - L.u(70) });
    if (show && e.tier) W.tierBadge(ctx, tx + nw + L.u(8), ny - L.u(11), L.u(22), e.tier);
    W.text(ctx, slot, tx, ny + L.u(28), { size: T.FS.body, color: C.sub, weight: 600 });
    let ly = y + L.u(8 + 48 + 8);
    if (statStr) {
      const items = (show && sline ? sline : ['智？', '信？', '仁？', '勇？', '严？']);
      const widths = items.map((s) => W.measure(ctx, s, T.FS.body, 500, false));
      const sum = widths.reduce((a, b2) => a + b2, 0);
      const gap = Math.max(L.u(4), Math.min(L.u(14), (w - L.u(16) - sum) / 4));
      let sx = x + L.u(8);
      items.forEach((s, k) => {
        W.text(ctx, s, sx, ly + L.u(15), { size: T.FS.body, color: C.sub });
        sx += widths[k] + gap;
      });
      ly += L.u(30);
    }
    W.text(ctx, scoreStr, x + L.u(12), ly + L.u(15), { size: T.FS.bodyL, weight: 800, color: show ? col : C.sub });
    if (show && e.fit) W.fitChip(ctx, x + L.u(70), ly + L.u(2), e.fit);
  } else {
    const cy = statStr ? y + L.u(21) : y + h / 2 - L.u(9);
    const rightW = L.u(statStr ? 48 : 72);
    const maxW = x + w - rightW - tx - L.u(4);
    const sw = W.text(ctx, slot, tx, cy, { size: T.FS.body, color: C.sub, weight: 600 });
    const nw = W.text(ctx, e.name, tx + sw + L.u(6), cy, { size: T.FS.bodyL, weight: 800, serif: true, maxW: maxW - sw - L.u(6) - (show && e.tier ? L.u(26) : 0) });
    if (show && e.tier) W.tierBadge(ctx, tx + sw + L.u(6) + nw + L.u(4), cy - L.u(11), L.u(22), e.tier);
    if (statStr) W.text(ctx, statStr, tx, y + L.u(46), { size: T.FS.body, color: C.sub, maxW: x + w - tx - L.u(8), minSize: T.FS.body });
    W.text(ctx, scoreStr, x + w - rightW / 2 - L.u(6), y + L.u(statStr ? 21 : 16), { size: T.FS.bodyL, weight: 800, color: show ? col : C.sub, align: 'center' });
    if (show && e.fit) {
      if (statStr) W.fitChip(ctx, tx, y + h - L.u(32), e.fit);
      else {
        const cw2 = W.fitChipSize(ctx, e.fit).w;
        W.fitChip(ctx, x + w - rightW / 2 - L.u(6) - cw2 / 2, y + h - L.u(32), e.fit);
      }
    }
  }
  return h;
}

// ------------------------------------------------------------------- done

function actionButtonsLayout(L, cw) {
  const large = T.isLarge();
  return { large, bh: T.btn(L, 52), gap: L.u(12), cw };
}

function saveLabel(vm) {
  const st = (vm.saveImage && vm.saveImage.state) || 'idle';
  switch (st) {
    case 'rendering':
      return { label: '生成中…', disabled: true };
    case 'saving':
      return { label: '保存中…', disabled: true };
    case 'saved':
      return { label: '已保存', disabled: false, icon: 'check' };
    case 'error':
      return { label: '保存失败', disabled: false };
    default:
      return { label: '保存图片', disabled: false };
  }
}

function subscribeBlock(vm) {
  const st = vm.subscribe && vm.subscribe.state;
  if (st === 'offer' || st === 'requesting' || st === 'granted') return st;
  return null;
}

function challengeBlockH(ctx, L, vm) {
  const ch = vm.challenge;
  if (!ch) return 0;
  const cw = L.contentW;
  let h = L.u(T.isLarge() ? 140 : 82);
  if (ch.theirLineup) {
    const names = ch.theirLineup.map((e) => e.name).join('  ');
    h += L.u(T.isLarge() ? 34 : 28) + W.lineCount(ctx, names, cw - L.u(28), T.FS.body, 400, false, 3) * L.u(T.isLarge() ? 28 : 24) + L.u(8);
  } else {
    h += L.u(T.isLarge() ? 40 : 30);
  }
  return h;
}

function drawChallengeBlock(ctx, L, vm, x, y, cw) {
  const ch = vm.challenge;
  const large = T.isLarge();
  const h = challengeBlockH(ctx, L, vm);
  W.card(ctx, x, y, cw, h, { fill: C.tile, stroke: C.lineStrong, lw: 2 });
  W.text(ctx, '同一手令牌', L.cx, y + L.u(16), { size: T.FS.body, color: C.sub, align: 'center' });
  const mine = vm.record || { w: 0, l: 0 };
  const theirs = ch.theirRecord || { w: 0, l: 0 };
  const ry = y + L.u(large ? 54 : 48);
  const rs = large ? 26 : 24;
  const mineCol = mine.w >= theirs.w ? C.seal : C.ink;
  const theirCol = theirs.w > mine.w ? C.seal : C.ink;
  if (large) {
    // stacked: two lines at the large size, no 'vs' between them
    W.text(ctx, '你 ' + recordDash(mine), L.cx, ry, { size: L.u(rs), weight: 900, serif: true, align: 'center', color: mineCol, maxW: cw - L.u(20) });
    W.text(ctx, '好友 ' + recordDash(theirs), L.cx, ry + L.u(40), { size: L.u(rs), weight: 900, serif: true, align: 'center', color: theirCol, maxW: cw - L.u(20) });
  } else {
    W.text(ctx, '你 ' + recordDash(mine), x + cw * 0.26, ry, { size: L.u(rs), weight: 900, serif: true, align: 'center', color: mineCol, maxW: cw * 0.42 });
    W.text(ctx, 'vs', L.cx, ry, { size: T.FS.bodyL, color: C.sub, align: 'center' });
    W.text(ctx, '好友 ' + recordDash(theirs), x + cw * 0.74, ry, { size: L.u(rs), weight: 900, serif: true, align: 'center', color: theirCol, maxW: cw * 0.42 });
  }
  const dy = large ? L.u(40) : 0;
  if (ch.theirLineup) {
    const names = ch.theirLineup.map((e) => e.name).join('  ');
    W.text(ctx, '对方阵容', x + L.u(14), y + L.u(large ? 94 : 80) + dy, { size: T.FS.body, weight: 700, color: C.sub });
    W.paragraph(ctx, names, x + L.u(14), y + L.u(large ? 110 : 92) + dy, cw - L.u(28), L.u(large ? 28 : 24), { size: T.FS.body, color: C.ink, maxLines: 3 });
  } else {
    const t = ch.lineupLocked ? '对方阵容 · 完成今日军令后可见' : '对方阵容暂不可见';
    W.paragraph(ctx, t, x + L.u(14), y + L.u(large ? 80 : 66) + dy, cw - L.u(28), L.u(large ? 30 : 24), { size: T.FS.body, color: C.sub, align: 'center', maxLines: 2 });
  }
  return h;
}

function doneLayout(ctx, vm, L) {
  const cw = L.contentW;
  const large = T.isLarge();
  const lines = vm.comment ? Math.min(2, W.wrap(ctx, '“' + vm.comment + '”', cw, T.FS.bodyL, 600, true).length) : 0;
  const pending = !!(vm.reveal && vm.reveal.pending);
  const a = actionButtonsLayout(L, cw);
  const lineup = vm.lineup || [];
  let lineupH = useRows(vm) ? lineup.reduce((s, e, i) => s + lineupRowH(L, e, vm, i) + L.u(6), 0) : chipsH(L) + L.u(6);
  if (vm.reveal) lineupH += L.u(34);
  let h = L.u(4) + L.u(large ? 76 : 70) + (large && vm.record && vm.record.w === 12 ? L.u(80) : 0) + L.u(40) + L.u(large ? 32 : 26) * lines + L.u(6);
  if (vm.rarityText) h += L.u(large ? 32 : 26);
  if (vm.streak && vm.streak.text) h += L.u(large ? 32 : 26);
  if (vm.privacyNote) h += L.u(large ? 56 : 26);
  h += L.u(6);
  if (vm.challenge) h += challengeBlockH(ctx, L, vm) + L.u(12);
  h += L.u(58) + lineupH + L.u(8);
  if (!pending) {
    h += a.bh + a.gap; // replay
    h += a.bh + a.gap; // board
    h += large ? 3 * (a.bh + a.gap) : a.bh + a.gap; // share / challenge / save
    if (subscribeBlock(vm)) h += subscribeH(L) + a.gap;
  }
  return h;
}

function subscribeH(L) {
  return T.btn(L, 52) + L.u(T.isLarge() ? 72 : 52);
}

function drawDone(ctx, vm, L, hits) {
  const top = header(ctx, L, hits, vm);
  const large = T.isLarge();
  const pending = !!(vm.reveal && vm.reveal.pending);
  const barH = T.btn(L, 56);
  const barTop = L.bottomEdge - L.bottomPad - barH;
  const view = { x: 0, y: top, w: L.W, h: barTop - L.u(10) - top };
  const x = L.x0;
  const cw = L.contentW;
  const contentH = doneLayout(ctx, vm, L);
  const maxScroll = Math.max(0, contentH - view.h);
  hits.scrollMax['result:scroll'] = maxScroll;
  const scroll = clamp(vm.scrollY || 0, 0, maxScroll);

  ctx.save();
  ctx.beginPath();
  ctx.rect(view.x, view.y, view.w, view.h);
  ctx.clip();
  hits.beginScroll(view, -scroll);
  ctx.translate(0, -scroll);
  let y = view.y + L.u(4);

  // record + band
  const perfect = vm.record && vm.record.w === 12;
  const recSize = L.u(perfect && !large ? 44 : T.FS.record);
  const stampRow = perfect && large;
  const recW = cw - (perfect && !large ? L.u(84) : 0);
  W.text(ctx, recordCn(vm.record), x + recW / 2, y + L.u(36), { size: recSize, weight: 900, serif: true, align: 'center', maxW: recW, minSize: large ? 48 : 40 });
  y += L.u(large ? 76 : 70);
  if (stampRow) {
    W.sealStamp(ctx, L.cx, y + L.u(36), L.u(66), '一统天下', '', { progress: vm.stampT == null ? 1 : vm.stampT, rotate: -6 });
    y += L.u(80);
  } else if (perfect) {
    W.sealStamp(ctx, x + cw - L.u(34), y - L.u(36), L.u(74), '一统天下', '', { progress: vm.stampT == null ? 1 : vm.stampT, rotate: -8 });
  }
  W.spaced(ctx, '〔' + (vm.band ? vm.band.label : '') + '〕', L.cx, y + L.u(10), { size: L.u(28), weight: 800, serif: true, color: C.seal, align: 'center', spacing: L.u(4) });
  y += L.u(40);
  y += W.paragraph(ctx, vm.comment ? '“' + vm.comment + '”' : '', x, y, cw, L.u(large ? 32 : 26), { size: T.FS.bodyL, serif: true, weight: 600, align: 'center', maxLines: 2 }) + L.u(6);
  const lh = L.u(large ? 32 : 26);
  if (vm.rarityText) {
    W.text(ctx, vm.rarityText, L.cx, y + lh / 2, { size: T.FS.body, color: C.sub, align: 'center', maxW: cw });
    y += lh;
  }
  if (vm.streak && vm.streak.text) {
    W.text(ctx, vm.streak.text, L.cx, y + lh / 2, { size: T.FS.body, weight: 700, color: C.ink, align: 'center', maxW: cw });
    y += lh;
  }
  if (vm.privacyNote) {
    const nh = large ? L.u(56) : L.u(26);
    W.paragraph(ctx, '未同意隐私指引，好友暂看不到你的战绩', x, y, cw, large ? L.u(28) : L.u(26), { size: T.FS.body, color: C.bad, align: 'center', maxLines: 2 });
    y += nh;
  }
  y += L.u(6);

  if (vm.challenge) y += drawChallengeBlock(ctx, L, vm, x, y, cw) + L.u(12);

  // dots strip (tap = breakdown)
  const bs = vm.battles || [];
  const step = cw / Math.max(12, bs.length);
  bs.forEach((b, i) => {
    const cx = step * (i + 0.5) + x;
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
  W.text(ctx, pending ? '十二战' : '十二战 · 轻点看明细 ›', L.cx, y + L.u(38), { size: T.FS.body, color: C.sub, align: 'center' });
  if (!pending) hits.add('result:breakdown', x, y - L.u(6), cw, L.u(56));
  y += L.u(58);

  // lineup (tap = breakdown)
  const lineup = vm.lineup || [];
  const lineupTop = y;
  if (vm.reveal) {
    W.text(ctx, '五德揭晓', x, y + L.u(14), { size: T.FS.bodyL, weight: 800, serif: true, color: C.seal });
    if (pending) W.text(ctx, '轻点跳过', x + cw, y + L.u(14), { size: T.FS.body, color: C.sub, align: 'right' });
    y += L.u(34);
  }
  if (useRows(vm)) {
    lineup.forEach((e, i) => {
      y += drawLineupRow(ctx, L, x, y, cw, e, vm, i) + L.u(6);
    });
  } else {
    drawLineupChips(ctx, L, x, y, cw, lineup);
    y += chipsH(L) + L.u(6);
  }
  if (!pending) hits.add('result:breakdown', x, lineupTop, cw, y - lineupTop);
  y += L.u(2);

  if (!pending) {
    const a = actionButtonsLayout(L, cw);
    // replay (rewarded video) - kept away from the save button and the primary
    const rp = vm.replay || {};
    const rbusy = rp.adState === 'loading' || rp.adState === 'playing';
    const locked = rp.locked;
    W.button(ctx, L, hits, {
      id: locked ? null : 'result:replay',
      x,
      y,
      w: cw,
      h: a.bh,
      label: locked ? rp.lockedText || '今日军令完成后可复盘' : rp.unlocked ? '复盘 · 最佳阵容' : rp.adState === 'loading' ? '加载中…' : rp.adState === 'playing' ? '观看中…' : '复盘·最佳阵容（看视频）',
      kind: rp.unlocked || locked ? 'secondary' : 'ad',
      disabled: rbusy || locked,
      size: T.FS.bodyL,
    });
    if (locked) hits.add('result:replay', x, y, cw, a.bh);
    y += a.bh + a.gap;

    W.button(ctx, L, hits, { id: 'result:board', x, y, w: cw, h: a.bh, label: vm.boardLabel || '看群榜/好友榜', size: T.FS.bodyL });
    y += a.bh + a.gap;

    // share / challenge / save
    const sv = saveLabel(vm);
    const btns = [
      { id: 'result:share', label: '分享战报' },
      { id: 'result:challenge', label: '发起挑战' },
      { id: 'result:save', label: sv.label, disabled: sv.disabled, icon: sv.icon },
    ];
    if (large) {
      btns.forEach((b) => {
        W.button(ctx, L, hits, Object.assign({ x, y, w: cw, h: a.bh, size: T.FS.bodyL }, b));
        y += a.bh + a.gap;
      });
    } else {
      const g3 = L.u(8);
      const bw = (cw - 2 * g3) / 3;
      btns.forEach((b, i) => W.button(ctx, L, hits, Object.assign({ x: x + i * (bw + g3), y, w: bw, h: a.bh, size: T.FS.bodyL }, b)));
      y += a.bh + a.gap;
    }

    // subscribe offer (only after a challenge was created here and only with a template)
    const sub = subscribeBlock(vm);
    if (sub) {
      const sh = subscribeH(L);
      W.card(ctx, x, y, cw, sh, { fill: C.tile, stroke: C.lineStrong });
      if (sub === 'granted') {
        W.text(ctx, '已开启应战提醒', L.cx, y + sh / 2, { size: T.FS.bodyL, weight: 700, color: C.good, align: 'center', maxW: cw - L.u(20) });
      } else {
        W.text(ctx, '好友应战时提醒我', x + L.u(14), y + L.u(T.isLarge() ? 22 : 18), { size: T.FS.bodyL, weight: 700, maxW: cw - L.u(28) });
        W.button(ctx, L, hits, { id: 'result:subscribe', x: x + L.u(14), y: y + L.u(T.isLarge() ? 44 : 36), w: cw - L.u(28), h: T.btn(L, 44), label: sub === 'requesting' ? '请求中…' : '提醒我', kind: 'secondary', disabled: sub === 'requesting', size: T.FS.body });
      }
      y += sh + a.gap;
    }
  } else {
    hits.add('result:revealSkip', 0, view.y + scroll, L.W, view.h);
  }

  hits.endScroll();
  ctx.restore();

  // fade under the bar and the pinned primary
  const faded = T.isHC() ? 'rgba(255,255,255,0)' : 'rgba(236,222,190,0)';
  const solid = T.isHC() ? '#FFFFFF' : 'rgba(232,217,185,0.96)';
  const g = ctx.createLinearGradient(0, barTop - L.u(26), 0, barTop - L.u(4));
  g.addColorStop(0, faded);
  g.addColorStop(1, solid);
  ctx.fillStyle = g;
  ctx.fillRect(0, barTop - L.u(26), L.W, L.u(22));
  ctx.fillStyle = solid;
  ctx.fillRect(0, barTop - L.u(4), L.W, L.H - barTop + L.u(4));
  W.button(ctx, L, hits, { id: 'result:again', x, y: barTop, w: cw, h: barH, label: '再来一局', kind: 'primary', disabled: pending });
  if (maxScroll > 0) {
    const bh = Math.max(L.u(24), view.h * (view.h / contentH));
    const by = view.y + (view.h - bh) * (scroll / maxScroll);
    W.fillRR(ctx, L.W - 5, by, 3, bh, 1.5, T.isHC() ? C.ink : 'rgba(42,33,26,0.35)');
  }
}

// ------------------------------------------------------------------ sheets

function sheetFrame(ctx, L, hits, title) {
  const h = Math.min(L.H - L.navBottom - L.u(10), L.u(560));
  const s = W.sheet(ctx, L, hits, { h, title });
  const area = { x: s.x, y: s.top - L.u(6), w: s.w, h: s.bottom - (s.top - L.u(6)) };
  return { s, area };
}

function drawBreakdown(ctx, vm, L, hits) {
  const { area } = sheetFrame(ctx, L, hits, '战报明细');
  const rowsL = vm.lineup || [];
  const bs = vm.battles || [];
  const m = vm.morale || {};
  const large = T.isLarge();
  const fmt = (n) => (typeof n === 'number' ? n.toFixed(2) : String(n == null ? '' : n));
  const bondText = m.bonds && m.bonds.length ? m.bonds.join('、') : '无';
  const rowW = area.w - L.u(6);
  const bondLines = W.lineCount(ctx, '羁绊：' + bondText, area.w, T.FS.body, 400, false, 3);
  const lineRow = L.u(large ? 70 : 42);
  const bHeights = bs.map((b) => battleRow(ctx, L, 0, 0, rowW, b, 1, 0, false) + L.u(6));
  const moraleLines = large ? 2 : 1;
  const contentH = L.u(28) + rowsL.length * lineRow + L.u(20) + L.u(28) + moraleLines * L.u(large ? 30 : 26) + bondLines * L.u(large ? 28 : 24) + L.u(14) + L.u(28) + bHeights.reduce((a, b) => a + b, 0);

  W.scrollBody(ctx, hits, area, contentH, vm.sheetScroll, 'sheet:list', () => {
    let y = area.y;
    W.text(ctx, '我的阵容 · 各位置得分', area.x, y + L.u(12), { size: T.FS.bodyL, weight: 800, serif: true, maxW: area.w });
    y += L.u(28);
    rowsL.forEach((e) => {
      if (large) {
        W.text(ctx, (T.SLOT_LABEL[e.slot] || e.label) + ' ' + e.name, area.x, y + L.u(16), { size: T.FS.bodyL, weight: 800, serif: true, maxW: area.w });
        W.text(ctx, Number(e.score).toFixed(1), area.x, y + L.u(48), { size: T.FS.bodyL, weight: 800 });
        W.fitChip(ctx, area.x + L.u(64), y + L.u(35), e.fit);
      } else {
        W.text(ctx, T.SLOT_LABEL[e.slot] || e.label, area.x, y + L.u(20), { size: T.FS.body, color: C.sub, weight: 600 });
        W.text(ctx, e.name, area.x + L.u(58), y + L.u(20), { size: T.FS.bodyL, weight: 800, serif: true, maxW: area.w * 0.3 });
        W.text(ctx, Number(e.score).toFixed(1), area.x + area.w * 0.58, y + L.u(20), { size: T.FS.bodyL, weight: 800, align: 'right' });
        W.fitChip(ctx, area.x + area.w - L.u(70), y + L.u(7), e.fit);
      }
      y += lineRow;
    });
    y += L.u(20);
    W.text(ctx, '士气 ×' + fmt(m.total), area.x, y + L.u(12), { size: T.FS.bodyL, weight: 800, serif: true });
    y += L.u(28);
    if (large) {
      W.text(ctx, '主公 +' + fmt(m.lord), area.x, y + L.u(12), { size: T.FS.body, color: C.sub });
      W.text(ctx, '同乡 +' + fmt(m.cohesion), area.x, y + L.u(42), { size: T.FS.body, color: C.sub });
      y += L.u(60);
    } else {
      W.text(ctx, '主公 +' + fmt(m.lord) + '    同乡 +' + fmt(m.cohesion), area.x, y + L.u(12), { size: T.FS.body, color: C.sub });
      y += L.u(26);
    }
    y += W.paragraph(ctx, '羁绊：' + bondText, area.x, y, area.w, L.u(large ? 28 : 24), { size: T.FS.body, color: C.sub, maxLines: 3 });
    y += L.u(14);
    W.text(ctx, '十二战明细', area.x, y + L.u(12), { size: T.FS.bodyL, weight: 800, serif: true });
    y += L.u(28);
    bs.forEach((b, i) => {
      battleRow(ctx, L, area.x, y, rowW, b, 1, 0, true);
      y += bHeights[i];
    });
  });
}

function drawReplay(ctx, vm, L, hits) {
  const large = T.isLarge();
  const rp = vm.replay || {};
  const best = rp.best;
  const rowH = L.u(large ? 104 : 48);
  const contentH = L.u(32) + 5 * rowH + L.u(10) + L.u(large ? 90 : 40);
  const wanted = L.u(60) + contentH + L.u(20) + L.safeBottom;
  const s = W.sheet(ctx, L, hits, { h: Math.min(wanted, L.H - L.navBottom), title: '复盘 · 最佳阵容' });
  if (!best) {
    W.text(ctx, '正在计算最佳阵容…', L.cx, s.top + L.u(54), { size: T.FS.bodyL, color: C.sub, align: 'center' });
    return;
  }
  const area = { x: s.x, y: s.top - L.u(6), w: s.w, h: s.bottom - (s.top - L.u(6)) };
  const mine = {};
  (vm.lineup || []).forEach((e) => (mine[e.slot] = e));
  const bestBy = {};
  (best.lineup || []).forEach((e) => (bestBy[e.slot] = e));
  const fmt = (e) => (e.name || '—') + (e.score != null ? ' ' + Number(e.score).toFixed(1) : '');
  W.scrollBody(ctx, hits, area, contentH, vm.sheetScroll, 'sheet:list', () => {
    let y = area.y;
    const c1 = s.x + s.w * 0.30;
    const c2 = s.x + s.w * 0.70;
    if (!large) {
      W.text(ctx, '位置', s.x, y + L.u(14), { size: T.FS.body, color: C.sub, weight: 700 });
      W.text(ctx, '你的阵容', c1, y + L.u(14), { size: T.FS.body, color: C.sub, weight: 700, align: 'center' });
      W.text(ctx, '最佳阵容', c2 + L.u(18), y + L.u(14), { size: T.FS.body, color: C.seal, weight: 700, align: 'center' });
    }
    y += L.u(32);
    T.SLOT_ORDER.forEach((k) => {
      const a = mine[k] || {};
      const b = bestBy[k] || {};
      const diff = a.name !== b.name;
      if (diff) W.fillRR(ctx, s.x - 4, y + L.u(2), s.w + 8, rowH - L.u(4), L.u(8), C.tintSeal);
      if (large) {
        W.text(ctx, T.SLOT_LABEL[k], s.x + L.u(4), y + L.u(16), { size: T.FS.body, color: C.sub, weight: 700 });
        W.text(ctx, '你  ' + fmt(a), s.x + L.u(4), y + L.u(46), { size: T.FS.bodyL, weight: 700, maxW: s.w - L.u(8) });
        W.text(ctx, '最佳  ' + fmt(b), s.x + L.u(4), y + L.u(78), { size: T.FS.bodyL, weight: 800, color: diff ? C.seal : C.ink, maxW: s.w - L.u(8) });
      } else {
        W.text(ctx, T.SLOT_LABEL[k], s.x, y + L.u(24), { size: T.FS.body, color: C.sub, weight: 600 });
        W.text(ctx, fmt(a), c1, y + L.u(24), { size: T.FS.bodyL, align: 'center', weight: 700, maxW: s.w * 0.36 });
        W.text(ctx, fmt(b), c2 + L.u(18), y + L.u(24), { size: T.FS.bodyL, align: 'center', weight: 800, color: diff ? C.seal : C.ink, maxW: s.w * 0.36 });
      }
      y += rowH;
    });
    y += L.u(10);
    if (large) {
      W.text(ctx, '你 ' + recordDash(vm.record) + ' → 最佳 ' + recordDash(best.record), L.cx, y + L.u(20), { size: T.FS.title, weight: 900, serif: true, align: 'center', maxW: s.w });
    } else {
      W.text(ctx, '你 ' + recordDash(vm.record) + '   →   最佳 ' + recordDash(best.record), L.cx, y + L.u(16), { size: T.FS.title, weight: 900, serif: true, align: 'center', maxW: s.w });
    }
  });
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display);
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
