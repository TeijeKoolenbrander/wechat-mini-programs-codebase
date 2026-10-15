/**
 * Play (spec 8.2). draw(ctx, vm, layout) -> hitAreas.
 *
 * vm = spec 13 Play model, plus optional extras (see CONTRACT.md):
 *   pendingWord: string        the word being sent (state 'waiting')
 *   ladderScroll: number       px offset of the ladder
 *   menuOpen: boolean          the ⋯ menu (玩法 / 放弃) is open
 *   sheet: null|'howto', sheetScroll
 *   flashWord, flashT          duplicate flash (0..1 progress)
 *   enterWord, enterT          the row that just slid into the ladder (0..1)
 *   solvedT                    0..1 gold fill of the 命中 animation (state 'solvedAnim')
 *   errorText                  replaces "网络开小差了"
 *   display, t
 *
 * Layout, top to bottom: back row (level with the capsule), header, banner,
 * first-char line, 刚猜 card, chips (联想词 or 热身词), ladder (scrolls), then
 * the pinned action row in the thumb zone. With the keyboard open the ladder
 * and action row give way to the suggestion strip (above the keyboard).
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits } = require('./layout');
const howto = require('./howto');
const C = T.COLORS;

function bandLabelOf(r) {
  return r.bandLabel || T.BAND_LABEL[r.band] || '';
}

/** "提示 · " / "同义 · " prefix for a row's rank line. */
function prefixOf(r) {
  return r.isHint ? '提示 · ' : r.isSynonym ? '同义 · ' : '';
}

// ---------------------------------------------------------------- card

function rowHeight(L) {
  return L.u(T.METRICS.large ? T.METRICS.rowH : L.compact ? 54 : T.METRICS.rowH);
}

/** Slim 刚猜 card used above the keyboard. */
function miniCardHeight(L) {
  return L.u(T.METRICS.large ? 84 : 64);
}

function cardHeight(L) {
  const large = T.METRICS.large;
  if (L.compact) return L.u(large ? 110 : 72);
  return L.u(large ? 136 : 106);
}

/** The raised 刚猜 card: word, band pill, rank and a big thermometer bar. */
function drawLatest(ctx, L, vm, x, y, w, h, mini) {
  const waiting = vm.state === 'waiting';
  const solving = vm.state === 'solvedAnim';
  const r = vm.latest;
  const word = waiting ? vm.pendingWord || '' : r ? r.word : vm.pendingWord || '';
  const band = solving ? 'hit' : r && !waiting ? r.band : 'cold';
  const large = T.METRICS.large;
  const pad = L.u(12);
  const iw = w - 2 * pad;

  // card with a band-coloured edge (gold glow while solving)
  ctx.save();
  if (solving) {
    ctx.shadowColor = 'rgba(201,151,58,' + (0.2 + 0.5 * (vm.solvedT || 0)) + ')';
    ctx.shadowBlur = 18;
  } else {
    ctx.shadowColor = 'rgba(60,40,20,0.18)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
  }
  W.fillRR(ctx, x, y, w, h, L.u(16), C.surface);
  ctx.restore();
  W.strokeRR(ctx, x, y, w, h, L.u(16), waiting ? C.lineStrong : T.bandColor(band), waiting ? 1.5 : 3);

  const rankText = waiting ? '正在查…' : r ? r.rankLabel : '';
  const pillLabel = r && !waiting ? bandLabelOf(r) : solving ? '命中' : '';
  const barOpts = waiting ? { pulse: vm.t || 0 } : solving ? { fillT: vm.solvedT || 0 } : {};

  if (L.compact || mini) {
    const wordSize = large ? (mini ? 28 : 30) : mini ? 24 : 26;
    const rowY = y + pad + L.u(large ? 18 : 13);
    const rankSize = large ? T.FS.bodyL : T.FS.bodyL;
    const rt = r && !waiting ? prefixOf(r) + rankText : rankText;
    const rw = W.measure(ctx, rt, rankSize, 700, false);
    W.text(ctx, word, x + pad, rowY, { size: wordSize, weight: 800, maxW: iw - rw - L.u(12), minSize: T.FS.bodyL });
    W.text(ctx, rt, x + w - pad, rowY, { size: rankSize, weight: 700, align: 'right' });
    const by = y + h - pad - L.u(large ? 13 : 9);
    const pw = pillLabel ? W.measure(ctx, pillLabel, T.FS.body, 800, false) + 16 : 0;
    const barW = iw - (pw ? Math.max(pw, (T.FS.body + 10) * 1.25) + L.u(10) : 0);
    W.thermoBar(ctx, x + pad, by - L.u(7), barW, L.u(14), r ? r.temp : 0, band, barOpts);
    if (pillLabel) W.bandPill(ctx, x + w - pad, by, band, pillLabel, { align: 'right' });
    return;
  }

  // label row
  const tag = waiting ? '刚猜' : r && r.isHint ? '提示词' : r && r.isSynonym ? '意思一样！' : '刚猜';
  const labelY = y + pad + L.u(large ? 12 : 10);
  W.text(ctx, tag, x + pad, labelY, { size: T.FS.body, weight: 700, color: r && r.isSynonym ? C.accent : C.sub });
  W.text(ctx, rankText, x + w - pad, labelY, { size: T.FS.title - 2, weight: 800, align: 'right', maxW: iw * 0.6 });
  // word row
  const wordY = labelY + L.u(large ? 36 : 32);
  const wordSize = large ? 38 : 32;
  const pillH = T.FS.bodyL + 12;
  const pw = pillLabel ? Math.max(pillH * 1.25, W.measure(ctx, pillLabel, T.FS.bodyL, 800, false) + 18) : 0;
  W.text(ctx, word, x + pad, wordY, { size: wordSize, weight: 800, maxW: iw - pw - L.u(10), minSize: T.FS.title });
  if (pillLabel) W.bandPill(ctx, x + w - pad, wordY, band, pillLabel, { align: 'right', size: T.FS.bodyL, h: pillH });
  // bar
  const barH = L.u(large ? 18 : 15);
  W.thermoBar(ctx, x + pad, y + h - pad - barH, iw, barH, r ? r.temp : 0, band, barOpts);
}

// -------------------------------------------------------------- ladder

function ladderRowWidths(ctx, L, rows, cw) {
  let lw = 0;
  rows.forEach((r) => {
    const a = W.measure(ctx, r.word, T.FS.word, 800, false);
    const b = W.measure(ctx, prefixOf(r) + r.rankLabel, T.FS.body, 600, false);
    lw = Math.max(lw, a, b);
  });
  return Math.min(Math.max(lw + L.u(4), cw * 0.3), cw * 0.5);
}

function drawRow(ctx, L, r, x, y, w, h, o) {
  const large = T.METRICS.large;
  const sel = o.selected;
  const pad = L.u(8);
  ctx.save();
  if (o.enterT != null && o.enterT < 1) {
    ctx.globalAlpha = Math.max(0, o.enterT);
    ctx.translate((1 - o.enterT) * L.u(36), 0);
  }
  if (sel || r.isLatest) {
    W.fillRR(ctx, x, y + 2, w, h - 4, L.u(12), sel ? C.paperDeep : 'rgba(30,27,24,0.04)');
    if (sel) W.fillRR(ctx, x, y + L.u(8), L.u(4), h - L.u(16), 2, C.ink);
  }
  if (o.flashT != null && o.flashT < 1) {
    ctx.globalAlpha = 0.35 * (1 - o.flashT);
    W.fillRR(ctx, x, y + 2, w, h - 4, L.u(12), T.bandColor(r.band));
    ctx.globalAlpha = Math.max(0, o.enterT != null ? o.enterT : 1);
  }
  const label = bandLabelOf(r);
  const pillH = T.FS.body + 10;
  const pw = Math.max(pillH * 1.25, W.measure(ctx, label, T.FS.body, 800, false) + 16);
  const ix = x + pad + L.u(6);
  const right = x + w - pad;
  if (!large) {
    const lw = o.leftW;
    W.text(ctx, r.word, ix, y + h * 0.36, { size: T.FS.word, weight: 800, maxW: lw });
    W.text(ctx, prefixOf(r) + r.rankLabel, ix, y + h * 0.74, { size: T.FS.body, color: r.isHint || r.isSynonym ? C.accent : C.sub, weight: r.isHint || r.isSynonym ? 700 : 500, maxW: lw });
    W.bandPill(ctx, right, y + h / 2, r.band, label, { align: 'right' });
    const bx = ix + lw + L.u(10);
    const bw = right - pw - L.u(10) - bx;
    W.thermoBar(ctx, bx, y + h / 2 - L.u(6), Math.max(L.u(30), bw), L.u(12), r.temp, r.band);
  } else {
    // two lines: word + pill, then bar + rank
    const y1 = y + h * 0.3;
    const y2 = y + h * 0.72;
    const tw = W.text(ctx, r.word, ix, y1, { size: T.FS.word, weight: 800, maxW: w - pw - L.u(40) });
    if (r.isHint || r.isSynonym) W.text(ctx, r.isHint ? '提示' : '同义', ix + tw + L.u(10), y1, { size: T.FS.body, weight: 700, color: C.accent });
    W.bandPill(ctx, right, y1, r.band, label, { align: 'right', size: T.FS.body });
    const rw = W.measure(ctx, r.rankLabel, T.FS.body, 600, false);
    W.text(ctx, r.rankLabel, right, y2, { size: T.FS.body, weight: 600, color: C.sub, align: 'right' });
    W.thermoBar(ctx, ix, y2 - L.u(7), Math.max(L.u(40), right - rw - L.u(14) - ix), L.u(14), r.temp, r.band);
  }
  ctx.restore();
  // hairline
  ctx.fillStyle = C.line;
  ctx.fillRect(x + L.u(6), y + h - 0.5, w - L.u(12), 1);
}

function drawLadder(ctx, L, hits, vm, view) {
  const rows = vm.ladder || [];
  const rowH = rowHeight(L);
  const contentH = rows.length * rowH;
  const maxScroll = Math.max(0, contentH - view.h);
  const off = Math.max(0, Math.min(vm.ladderScroll || 0, maxScroll));
  hits.scrollMax['ladder:list'] = maxScroll;
  if (view.h <= 0) return;
  const leftW = ladderRowWidths(ctx, L, rows, view.w);

  ctx.save();
  ctx.beginPath();
  ctx.rect(view.x - 2, view.y, view.w + 4, view.h);
  ctx.clip();
  ctx.translate(0, -off);
  if (maxScroll > 0) hits.add('ladder:list', view.x, view.y, view.w, view.h);
  hits.beginScroll(view, -off);
  rows.forEach((r, i) => {
    const y = view.y + i * rowH;
    if (y + rowH < view.y + off || y > view.y + off + view.h) return;
    drawRow(ctx, L, r, view.x, y, view.w, rowH, {
      leftW,
      selected: vm.selectedWord === r.word,
      enterT: vm.enterWord === r.word ? vm.enterT : null,
      flashT: vm.flashWord === r.word ? vm.flashT : null,
    });
    hits.add('row:' + r.word, view.x, y, view.w, rowH);
  });
  hits.endScroll();
  ctx.restore();

  // scroll cue: thin thumb at the right edge, and a fade where more rows hide
  if (maxScroll > 0) {
    const th = Math.max(L.u(24), view.h * (view.h / contentH));
    W.fillRR(ctx, view.x + view.w + L.u(2), view.y + (view.h - th) * (off / maxScroll), L.u(3), th, 1.5, 'rgba(30,27,24,0.28)');
  }
}

function drawLadderSkeleton(ctx, L, vm, view) {
  const rowH = rowHeight(L);
  const n = Math.max(0, Math.min(6, Math.floor(view.h / rowH)));
  for (let i = 0; i < n; i++) {
    const y = view.y + i * rowH;
    W.skeleton(ctx, view.x + L.u(10), y + rowH * 0.2, view.w * 0.2, rowH * 0.26, vm.t, 6);
    W.skeleton(ctx, view.x + L.u(10), y + rowH * 0.6, view.w * 0.16, rowH * 0.16, vm.t, 6);
    W.skeleton(ctx, view.x + view.w * 0.38, y + rowH * 0.38, view.w * 0.4, rowH * 0.24, vm.t, 8);
  }
}

// -------------------------------------------------------------- header

function drawHeader(ctx, L, hits, vm, kbOpen) {
  W.backButton(ctx, L, hits, '返回', 'play:back');
  const tap = L.u(T.METRICS.tap);
  const hdrH = L.compact && !T.METRICS.large ? L.u(42) : tap;
  const y = L.navBottom + L.u(2);
  const midY = y + hdrH / 2;
  const right = L.x0 + L.contentW;
  let rightEdge = right;
  // menu (⋯) or 收起
  if (kbOpen) {
    const lw = W.measure(ctx, '收起', T.FS.bodyL, 700, false);
    W.text(ctx, '收起', right, midY, { size: T.FS.bodyL, weight: 700, align: 'right', color: C.accent });
    W.addTap(hits, L, 'play:collapse', right - lw - L.u(10), midY - tap / 2, lw + L.u(20), tap);
    rightEdge = right - lw - L.u(18);
  } else {
    W.iconDots(ctx, right - L.u(20), midY, L.u(24), C.ink);
    hits.add('play:menu', right - L.u(56), midY - tap / 2, L.u(56), tap);
    rightEdge = right - L.u(58);
  }
  const steps = '已猜 ' + (vm.steps || 0) + ' 步';
  const stw = W.measure(ctx, steps, T.FS.bodyL, 700, false);
  const twoLine = T.METRICS.large;
  if (twoLine) {
    // large text: title on the first line, steps on the second
    W.text(ctx, vm.title || '', L.x0, midY - tap * 0.18, { size: T.FS.bodyL, weight: 800, serif: true, maxW: rightEdge - L.x0 });
    W.text(ctx, steps, L.x0, midY + tap * 0.28, { size: T.FS.body, weight: 700, color: C.sub });
    return y + tap + L.u(2);
  }
  W.text(ctx, steps, rightEdge, midY, { size: T.FS.bodyL, weight: 700, color: C.sub, align: 'right' });
  W.text(ctx, vm.title || '', L.x0, midY, { size: T.FS.bodyL, weight: 800, serif: true, maxW: rightEdge - stw - L.u(12) - L.x0 });
  return y + hdrH;
}

function drawMenu(ctx, L, hits) {
  const tap = L.u(T.METRICS.tap);
  hits.add('play:menu:close', 0, 0, L.W, L.H);
  const w = L.u(T.METRICS.large ? 200 : 170);
  const itemH = Math.max(tap, L.u(56));
  const x = L.x0 + L.contentW - w;
  const y = L.navBottom + tap + L.u(4);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  W.fillRR(ctx, x, y, w, itemH * 2, L.u(14), C.sheet);
  ctx.restore();
  W.strokeRR(ctx, x, y, w, itemH * 2, L.u(14), C.lineStrong, 1.5);
  W.text(ctx, '玩法', x + L.u(18), y + itemH / 2, { size: T.FS.bodyL, weight: 600 });
  hits.add('play:menu:howto', x, y, w, itemH);
  ctx.fillStyle = C.line;
  ctx.fillRect(x + L.u(12), y + itemH, w - L.u(24), 1);
  W.text(ctx, '放弃', x + L.u(18), y + itemH * 1.5, { size: T.FS.bodyL, weight: 600, color: C.accent });
  W.text(ctx, '看答案', x + w - L.u(18), y + itemH * 1.5, { size: T.FS.body, color: C.sub, align: 'right' });
  hits.add('play:menu:giveup', x, y + itemH, w, itemH);
}

// --------------------------------------------------------- action row

function hintKind(h) {
  if (!h) return 'locked';
  return h.state;
}

/** The pinned bottom row: hint button (left) and 输入 (right). */
function drawActionRow(ctx, L, hits, vm, y, btnH) {
  const gap = L.u(10);
  const cw = L.contentW;
  const x = L.x0;
  const disabled = vm.state === 'waiting' || vm.state === 'starting' || vm.state === 'solvedAnim';
  const h = vm.hint || { state: 'locked', label: '' };
  const kind = hintKind(h);
  const hw = Math.round((cw - gap) * 0.56);
  const iw = cw - gap - hw;
  const usable = (kind === 'available' || kind === 'atBest') && !disabled;
  drawHintButton(ctx, L, hits, x, y, hw, btnH, h.label || '', kind, usable);
  W.button(ctx, L, hits, { id: 'play:input', x: x + hw + gap, y, w: iw, h: btnH, label: '输入', kind: 'primary', disabled });
}

function drawHintButton(ctx, L, hits, x, y, w, h, label, kind, usable) {
  const r = Math.min(L.u(14), h / 2);
  const on = kind === 'available' && usable;
  if (on) {
    W.fillRR(ctx, x, y, w, h, r, C.surface);
    W.strokeRR(ctx, x + 1, y + 1, w - 2, h - 2, r, T.BAND_COLOR.hot, 3);
  } else if (kind === 'atBest' && usable) {
    W.fillRR(ctx, x, y, w, h, r, C.surface);
    W.strokeRR(ctx, x, y, w, h, r, C.lineStrong, 1.8);
  } else {
    W.fillRR(ctx, x, y, w, h, r, C.disabledFill);
    W.strokeRR(ctx, x, y, w, h, r, C.line, 1.5);
  }
  const fg = on ? C.ink : usable ? C.ink : C.sub;
  const size = T.FS.body + (T.METRICS.large ? 0 : 1);
  const icon = L.u(20);
  const innerW = w - L.u(12) - icon - L.u(4);
  let lines = [label];
  if (W.measure(ctx, label, size, 700, false) > innerW) {
    const cut = label.indexOf('后');
    if (cut > 0 && cut < label.length - 1) lines = [label.slice(0, cut + 1), label.slice(cut + 1)];
    else lines = W.wrap(ctx, label, innerW, size, 700, false).slice(0, 2);
  }
  const lineH = size + L.u(3);
  let tw = 0;
  lines.forEach((ln) => (tw = Math.max(tw, W.measure(ctx, ln, size, 700, false))));
  const total = icon + L.u(4) + tw;
  const cx0 = x + w / 2 - total / 2;
  const cy = y + h / 2;
  W.iconLamp(ctx, cx0 + icon / 2, cy, icon, on ? T.BAND_COLOR.hot : usable ? C.ink : C.sub);
  lines.forEach((ln, i) => W.text(ctx, ln, cx0 + icon + L.u(4), cy + (i - (lines.length - 1) / 2) * lineH, { size, weight: 700, color: fg }));
  if (usable) W.addTap(hits, L, 'play:hint', x, y, w, h);
}

// -------------------------------------------------------------- coach

/** First-play coach marks (spec 8.2): each line at most 14 characters. */
const COACH = { 1: ['点一个词开始猜'], 2: ['名次越小越接近，', '第 1 名就是答案'], 3: ['点联想词或自己输入，', '接着猜'] };

function drawCoach(ctx, L, hits, vm, target) {
  const n = vm.coach;
  if (!n || !target) return;
  const lines = COACH[n] || [];
  const lineH = L.u(T.METRICS.large ? 30 : 25);
  const tap = L.u(T.METRICS.tap);
  const w = Math.min(L.contentW, L.u(300));
  const h = L.u(14) + lines.length * lineH + tap + L.u(4);
  let x = Math.max(L.x0, Math.min(target.x + target.w / 2 - w / 2, L.x0 + L.contentW - w));
  let below = target.y + target.h + L.u(10);
  let y = below;
  let up = false;
  if (y + h > L.bottomEdge - L.u(70)) {
    y = target.y - L.u(10) - h;
    up = true;
  }
  y = Math.max(L.navBottom, y);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 3;
  W.fillRR(ctx, x, y, w, h, L.u(16), C.ink);
  // pointer
  const px = Math.max(x + L.u(24), Math.min(target.x + target.w / 2, x + w - L.u(24)));
  ctx.beginPath();
  if (up) {
    ctx.moveTo(px - L.u(9), y + h - 1);
    ctx.lineTo(px + L.u(9), y + h - 1);
    ctx.lineTo(px, y + h + L.u(9));
  } else {
    ctx.moveTo(px - L.u(9), y + 1);
    ctx.lineTo(px + L.u(9), y + 1);
    ctx.lineTo(px, y - L.u(9));
  }
  ctx.closePath();
  ctx.fillStyle = C.ink;
  ctx.fill();
  ctx.restore();
  lines.forEach((ln, i) => W.text(ctx, ln, x + L.u(16), y + L.u(14) + lineH * i + lineH / 2, { size: T.FS.bodyL, weight: 700, color: C.onInk }));
  const by = y + h - tap;
  const label = n === 3 ? '知道了' : '下一步';
  const lw = W.measure(ctx, label, T.FS.bodyL, 700, false);
  W.text(ctx, label, x + w - L.u(16), by + tap / 2, { size: T.FS.bodyL, weight: 800, color: '#F0C877', align: 'right' });
  W.addTap(hits, L, 'coach:next', x + w - lw - L.u(32), by, lw + L.u(32), tap);
  const sw = W.measure(ctx, '跳过', T.FS.body, 600, false);
  W.text(ctx, '跳过', x + L.u(16), by + tap / 2, { size: T.FS.body, weight: 600, color: 'rgba(246,241,231,0.85)' });
  W.addTap(hits, L, 'coach:skip', x, by, sw + L.u(32), tap);
}

// ---------------------------------------------------------------- draw

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display);
  const hits = new Hits();
  W.paper(ctx, L);
  const kb = vm.keyboard || {};
  const kbOpen = !!kb.open && vm.state !== 'starting';
  const large = T.METRICS.large;
  const gap = L.u(L.compact ? 8 : 10);
  const x = L.x0;
  const cw = L.contentW;
  const btnH = L.u(T.METRICS.btn);
  const starting = vm.state === 'starting';
  const hasGuesses = vm.steps > 0 || !!vm.latest;
  const showWarm = !starting && !hasGuesses && vm.warmups && vm.warmups.length > 0;

  let y = drawHeader(ctx, L, hits, vm, kbOpen);

  // banner (window closed) and first-character line
  if (vm.banner) {
    const bh = Math.max(L.u(36), L.u(large ? 44 : 36));
    const lines = W.wrap(ctx, vm.banner, cw - L.u(24), T.FS.body, 600, false);
    const h = Math.max(bh, lines.length * L.u(large ? 26 : 22) + L.u(12));
    W.fillRR(ctx, x, y, cw, h, L.u(10), 'rgba(224,138,46,0.18)');
    W.strokeRR(ctx, x, y, cw, h, L.u(10), T.BAND_COLOR.hot, 1.5);
    lines.forEach((ln, i) => W.text(ctx, ln, x + cw / 2, y + h / 2 + (i - (lines.length - 1) / 2) * L.u(large ? 26 : 22), { size: T.FS.body, weight: 600, align: 'center' }));
    y += h + L.u(6);
  }
  if (vm.firstChar) {
    const h = L.u(large ? 36 : 30);
    W.text(ctx, '首字：' + vm.firstChar, x, y + h / 2, { size: T.FS.bodyL, weight: 800, color: C.accent });
    y += h;
  }
  y += L.u(4);

  let coachTarget = null;

  if (kbOpen) {
    drawKeyboardMode(ctx, L, hits, vm, y, kb);
    if (vm.menuOpen) drawMenu(ctx, L, hits);
    return hits.result();
  }

  // ---- pinned bottom ----
  const errored = vm.state === 'offline' || vm.state === 'error';
  const actionY = L.bottomEdge - L.bottomPad - btnH;
  let bottomTop = actionY;
  if (errored) {
    drawErrorRow(ctx, L, hits, vm, actionY, btnH);
  } else {
    // ad hint row sits above, separated from the free-hint and 输入 buttons
    if (vm.adHint && vm.adHint.visible) {
      const ah = L.u(T.METRICS.tap);
      const ay = actionY - L.u(16) - ah;
      const aw = Math.min(cw, L.u(240));
      const adLabel = '视频提示 · 剩 ' + vm.adHint.left + ' 次';
      W.button(ctx, L, hits, { id: 'play:adHint', x: x + (cw - aw) / 2, y: ay, w: aw, h: ah, label: adLabel, kind: 'ad', size: T.FS.body, disabled: vm.adHint.left <= 0 || vm.state === 'waiting' });
      bottomTop = ay;
    }
    drawActionRow(ctx, L, hits, vm, actionY, btnH);
  }
  bottomTop -= gap;

  // ---- middle ----
  if (starting) {
    const ch = cardHeight(L);
    W.card(ctx, x, y, cw, ch, { shadow: true });
    W.skeleton(ctx, x + L.u(14), y + L.u(16), cw * 0.3, L.u(26), vm.t, 8);
    W.skeleton(ctx, x + L.u(14), y + ch - L.u(28), cw - L.u(28), L.u(14), vm.t, 7);
    y += ch + gap;
    W.text(ctx, '正在展开题目…', L.cx, y + L.u(14), { size: T.FS.body, color: C.sub, align: 'center' });
    y += L.u(34);
    drawLadderSkeleton(ctx, L, vm, { x, y, w: cw, h: bottomTop - y });
  } else if (showWarm) {
    W.text(ctx, '先点一个词试试：', x, y + L.u(16), { size: T.FS.title - 2, weight: 800, serif: true });
    y += L.u(40);
    const warmTop = y;
    const fl = W.chipFlow(ctx, L, hits, vm.warmups, x, y, cw, { idPrefix: 'warm:', disabled: vm.state === 'waiting' });
    y += fl.h + gap;
    if (vm.coach === 1) coachTarget = { x, y: warmTop, w: cw, h: fl.h };
    // fallback line: type instead
    const lines = W.wrap(ctx, '或者点「输入」，打出你想到的词', cw, T.FS.bodyL, 500, false);
    lines.forEach((ln, i) => W.text(ctx, ln, x, y + L.u(14) + i * L.u(large ? 30 : 26), { size: T.FS.bodyL, color: C.sub, weight: 500 }));
    // hot-to-cold legend so the colours mean something before the first guess
    const ly = Math.min(bottomTop - L.u(40), y + lines.length * L.u(large ? 30 : 26) + L.u(24));
    if (ly > y + L.u(10) && !L.compact) drawLegend(ctx, L, x, ly, cw);
  } else {
    const ch = cardHeight(L);
    const cardTop = y;
    drawLatest(ctx, L, vm, x, y, cw, ch);
    if (vm.coach === 2) coachTarget = { x, y: cardTop, w: cw, h: ch };
    y += ch + gap;
    if (vm.state !== 'solvedAnim') {
      const word = vm.selectedWord || (vm.latest && vm.latest.word) || '';
      if (vm.chips && vm.chips.length) {
        const label = '顺着「' + word + '」想：';
        const lh = L.compact && !large ? 24 : 28;
        W.text(ctx, label, x, y + L.u(lh / 2), { size: T.FS.bodyL, weight: 700, color: C.sub, maxW: cw });
        y += L.u(lh);
        const chipsTop = y;
        const fl = W.chipFlow(ctx, L, hits, vm.chips, x, y, cw, { idPrefix: 'chip:', disabled: vm.state === 'waiting' });
        if (vm.coach === 3) coachTarget = { x, y: chipsTop, w: cw, h: fl.h };
        y += fl.h + gap;
      }
    }
    // thin rule, then the ladder
    ctx.fillStyle = C.lineStrong;
    ctx.fillRect(x, y - L.u(4), cw, 1);
    const view = { x, y, w: cw, h: Math.max(0, bottomTop - y) };
    drawLadder(ctx, L, hits, vm, view);
  }

  if (vm.menuOpen) drawMenu(ctx, L, hits);
  if (vm.sheet === 'howto') howto.drawInto(ctx, vm, L, hits);
  else if (vm.coach && coachTarget && !vm.menuOpen) drawCoach(ctx, L, hits, vm, coachTarget);
  return hits.result();
}

/** Mini scale: 冷 ... 命中, so the colours are explained at the very start. */
function drawLegend(ctx, L, x, y, w) {
  const n = T.BANDS.length;
  const gap = L.u(6);
  const cw = (w - gap * (n - 1)) / n;
  T.BANDS.forEach((b, i) => {
    const cx = x + i * (cw + gap);
    W.bandPill(ctx, cx + cw / 2, y, b, T.BAND_LABEL[b], { size: T.FS.body, h: T.FS.body + 12 });
  });
  W.text(ctx, '越红越近，越蓝越远', x + w / 2, y + L.u(28), { size: T.FS.body, color: C.sub, align: 'center' });
}

function drawErrorRow(ctx, L, hits, vm, y, btnH) {
  const x = L.x0;
  const cw = L.contentW;
  const bw = Math.round(cw * 0.34);
  W.fillRR(ctx, x, y, cw, btnH, L.u(14), 'rgba(196,61,28,0.10)');
  W.strokeRR(ctx, x, y, cw, btnH, L.u(14), C.accent, 1.5);
  W.text(ctx, vm.errorText || '网络开小差了', x + L.u(14), y + btnH / 2, { size: T.FS.bodyL, weight: 700, maxW: cw - bw - L.u(30) });
  W.button(ctx, L, hits, { id: 'play:retry', x: x + cw - bw - L.u(4), y: y + L.u(4), w: bw, h: btnH - L.u(8), label: '重试', kind: 'primary', size: T.FS.bodyL });
}

function drawKeyboardMode(ctx, L, hits, vm, top, kb) {
  const x = L.x0;
  const cw = L.contentW;
  const gap = L.u(8);
  const chipH = L.u(T.METRICS.chipH);
  // content must end above the native input bar (reported height), or in the top 45%
  const limit = kb.heightPx ? L.H - kb.heightPx - L.u(52) : L.H * 0.45;
  const waiting = vm.state === 'waiting';
  const sug = kb.suggestions || [];
  const cardH = miniCardHeight(L);
  const hasCard = !!(vm.latest || vm.pendingWord);
  let y = top;

  // suggestion strip: as many rows as fit, keeping room for the card when possible
  const reserve = hasCard ? cardH + gap : 0;
  let maxRows = Math.floor((limit - y - reserve + gap) / (chipH + gap));
  if (maxRows < 1) maxRows = Math.max(1, Math.floor((limit - y + gap) / (chipH + gap)));
  maxRows = Math.max(1, Math.min(3, maxRows));
  if (sug.length) {
    const fl = W.chipFlow(ctx, L, hits, sug, x, y, cw, { idPrefix: 'sugg:', disabled: waiting, maxRows });
    y += fl.h + gap;
  } else {
    W.text(ctx, kb.text ? '词库里没有匹配的词' : '输入后这里会出现候选词', x, y + chipH / 2, { size: T.FS.bodyL, color: C.sub, maxW: cw });
    y += chipH + gap;
  }
  if (hasCard && y + cardH <= limit + 1) {
    drawLatest(ctx, L, vm, x, y, cw, cardH, true);
  }
}

module.exports = { draw, cardHeight, COACH };
