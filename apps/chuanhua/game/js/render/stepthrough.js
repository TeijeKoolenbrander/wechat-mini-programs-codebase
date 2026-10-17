/**
 * Step-through (spec 8.9, F-5, PO-45): ONE chain at a time, final step first, for both modes (a 慢慢传 reveal is the same
 * screen with one chain). Opens on the final step (vm.index = steps.length - 1) and goes back toward the 起点.
 *
 *   top bar     ‹ 全部 (live) / ‹ 返回 (慢慢传), the header ("第 2 条 · 你起的"), 分享 when canShare
 *   note        ONE sticky note filling the space: a drawing (contain-fitted, margin tone, replays stroke by stroke in 2.5 s
 *               when shown), a sentence, a marker, a placeholder or the 起点 prompt
 *   label       "第 4 棒 · 画 · 最后一棒" (+ " (你)" on the viewer's own step)
 *   row         [笑 3] (toggle)                         [举报]
 *   dots        ○ ● ● ● ◉  one 48 pt target per step plus the 起点; "4/5" text instead when they do not fit
 *   nav         [‹ 往前一棒] [往后一棒 ›]; at the 起点 also [下一条 ›] / [看完了]
 *
 * Navigation is never automatic. Tap the LEFT half of the note = earlier (stepthrough:prevHalf), the RIGHT half = later
 * (stepthrough:nextHalf); a horizontal move of >= 48 pt that starts on the note area is a swipe (right = earlier, left =
 * later; vertical moves are ignored): hitAreas.swipe is that region and logic does the touch tracking. A drawing replays when
 * shown (logic drives vm.playT 0..1 over 2.5 s); the 重播 button (stepthrough:replay) replays it, and while it plays the
 * whole note is stepthrough:skip (a tap completes it at once, so the half-taps never navigate mid-replay).
 *
 * States loading | ready | notParticipant | paused | offline | error.
 * Hit ids: stepthrough:back, stepthrough:share, stepthrough:prevHalf, stepthrough:nextHalf, stepthrough:skip,
 * stepthrough:replay, stepthrough:laugh, stepthrough:report, stepthrough:dot:<i>, stepthrough:prev, stepthrough:next,
 * stepthrough:nextChain, stepthrough:done, stepthrough:retry.
 */

const T = require('./theme');
const W = require('./widgets');
const S = require('./screen');
const Strokes = require('./strokes');
const Ch = require('./chrome');
const MARKERS = require('./describe').MARKER_TEXT;
const C = T.COLORS;

const PH_TEXT = { reported: '该内容已被举报隐藏', deleted: '作者已删除这一棒', paused: '内容维护中' };
const GAP = 4;

function draw(ctx, vm, L) {
  const hits = S.begin(ctx, vm, L);
  const st = vm.state || 'ready';
  const live = vm.mode === 'live';
  const shareOn = !!vm.canShare && st === 'ready';
  const g = Ch.topBar(ctx, L, hits, {
    back: vm.backLabel || (live ? '全部' : '返回'), backId: 'stepthrough:back',
    title: st === 'ready' || st === 'paused' ? vm.header || '' : '', right: shareOn ? { label: '分享', id: 'stepthrough:share', w: 56 } : null,
  });
  const bw = L.W - 16;
  let top = g.y + g.h + GAP;

  if (st === 'loading') {
    const rh = Math.max(120, L.bottomEdge - 16 - top);
    W.skeleton(ctx, 8, top, bw, rh, vm.t || 0, 16);
    W.text(ctx, '正在展开…', L.W / 2, top + rh / 2, { size: T.FS.bodyL, weight: 700, color: C.sub, align: 'center' });
    return hits.result();
  }
  if (st === 'notParticipant') {
    S.statePanel(ctx, L, hits, { y: top + 24, art: 'lock', headline: '只有参与的群友能看完整揭晓' });
    return hits.result();
  }
  if (st === 'offline' || st === 'error') {
    S.statePanel(ctx, L, hits, { y: top + 24, art: st === 'offline' ? 'offline' : 'error', headline: st === 'offline' ? '揭晓需联网查看' : '出了点小问题，请重试', retryId: 'stepthrough:retry' });
    return hits.result();
  }

  if (vm.earlyText) {
    W.chip(ctx, L, L.W / 2, top + 14, vm.earlyText, { kind: 'wait', size: T.FS.body, align: 'center' });
    top += 32;
  }

  const steps = vm.steps || [];
  const n = steps.length;
  const idx = Math.max(0, Math.min(n - 1, vm.index == null ? n - 1 : vm.index));
  const s = steps[idx] || { kind: 'prompt', label: '', mine: false, placeholder: st === 'paused' ? 'paused' : null, laughs: 0, myLaugh: false, canLaugh: false, canReport: false };
  const rh = Ch.barH();

  // ---- bottom stack (computed bottom-up)
  const bottom = L.bottomEdge - 8;
  const atStart = idx === 0;
  const endBtn = vm.endAction === 'nextChain' ? '下一条 ›' : vm.endAction === 'done' ? '看完了' : null;
  const navLabels = [{ id: 'stepthrough:prev', label: '‹ 往前一棒', on: !!vm.canPrev && idx > 0 }, { id: 'stepthrough:next', label: '往后一棒 ›', on: !!vm.canNext && idx < n - 1 }];
  if (endBtn && atStart) navLabels.push({ id: vm.endAction === 'nextChain' ? 'stepthrough:nextChain' : 'stepthrough:done', label: endBtn, on: true, primary: true });
  const navSize = T.FS.body + (T.isLarge() ? 0 : 1);
  const need = Math.max.apply(null, navLabels.map((b) => W.measure(ctx, b.label, navSize, 700))) + 24;
  const perRow = Math.max(1, Math.min(navLabels.length, Math.floor((bw + 8) / (Math.max(need, T.MIN_TAP) + 8))));
  const navRows = Math.ceil(navLabels.length / perRow);
  const navH = navRows * rh + (navRows - 1) * 8;
  const navY = bottom - navH;
  const dotsFit = n * T.MIN_TAP <= bw && !(vm.dots && vm.dots.show === false);
  const dotsY = navY - GAP - rh;
  const rowY = dotsY - GAP - rh;
  const labelSize = T.isLarge() ? T.FS.body : T.FS.bodyL;
  const labelTxt = (s.label || '') + (s.mine ? ' (你)' : '');
  const labelLines = W.wrapBalanced(ctx, labelTxt, bw - 8, labelSize, 800).slice(0, 2);
  const llh = Math.round(labelSize * 1.35);
  const labelH = Math.max(1, labelLines.length) * llh + 2;
  const labelY = rowY - GAP - labelH;
  const noteH = Math.max(100, labelY - GAP - top);
  const note = { x: 8, y: top, w: bw, h: noteH };

  // ---- the note
  W.card(ctx, note.x, note.y, note.w, note.h, { r: 16 });
  W.tape(ctx, note.x + note.w * 0.5, note.y, 56, -0.04);
  const inner = { x: note.x + 10, y: note.y + 14, w: note.w - 20, h: note.h - 24 };
  const replayable = s.kind === 'draw' && !s.placeholder && st === 'ready';
  const playing = replayable && typeof vm.playT === 'number' && vm.playT < 1;
  const replayH = replayable ? rh : 0;
  const body = { x: inner.x, y: inner.y, w: inner.w, h: inner.h - (replayable ? replayH + 6 : 0) };
  if (s.placeholder || st === 'paused') {
    const ph = PH_TEXT[s.placeholder || 'paused'] || '内容维护中';
    W.fillRR(ctx, inner.x, inner.y, inner.w, inner.h, 10, C.disabledFill);
    W.text(ctx, ph, inner.x + inner.w / 2, inner.y + inner.h / 2, { size: T.FS.title, weight: 700, color: C.disabledInk, align: 'center', maxW: inner.w - 24 });
  } else if (s.kind === 'draw') {
    Strokes.drawStrokes(ctx, s.strokes || { v: 2, h: 1024, s: [] }, body, {
      cacheKey: 'st:' + (vm.chainId || '') + ':' + (s.n == null ? idx : s.n), rev: (vm.chainId || '') + ':' + idx, dpr: L.dpr, frame: true,
      playT: playing ? vm.playT : undefined,
    });
  } else {
    const isMarker = s.kind === 'marker';
    const isPrompt = s.kind === 'prompt';
    const txt = isMarker ? MARKERS[s.marker] || '' : '「' + (s.text || '') + '」';
    const size = T.isLarge() ? 32 : 28;
    const lh = Math.round(size * 1.4);
    const lines = W.wrapBalanced(ctx, txt, inner.w - 24, size, 800).slice(0, 6);
    const tag = isPrompt ? '起点' : null;
    const block = lines.length * lh + (tag ? Math.round(T.FS.bodyL * 1.8) : 0);
    let y = inner.y + (inner.h - block) / 2;
    if (tag) {
      W.chip(ctx, L, L.W / 2, y + Math.round(T.FS.bodyL * 0.9), tag, { kind: 'wait', size: T.FS.bodyL, align: 'center' });
      y += Math.round(T.FS.bodyL * 1.8);
    }
    lines.forEach((ln, i) => W.text(ctx, ln, L.W / 2, y + i * lh + lh / 2, { size, weight: 800, color: isMarker ? C.sub : C.ink, align: 'center' }));
  }

  // navigation halves, swipe region, replay
  hits.swipe = { x: note.x, y: note.y, w: note.w, h: note.h };
  if (playing) hits.add('stepthrough:skip', note.x, note.y, note.w, note.h);
  else {
    const halfH = replayable ? note.h - replayH - 12 : note.h;
    hits.add('stepthrough:prevHalf', note.x, note.y, note.w / 2, halfH);
    hits.add('stepthrough:nextHalf', note.x + note.w / 2, note.y, note.w / 2, halfH);
    if (replayable) {
      const bw2 = Math.min(note.w - 20, Math.max(120, W.measure(ctx, '重播', navSize, 700) + 80));
      const bx = note.x + (note.w - bw2) / 2;
      const by = note.y + note.h - 10 - replayH;
      W.button(ctx, L, hits, { id: 'stepthrough:replay', x: bx, y: by, w: bw2, h: replayH, label: '重播', icon: 'replay', kind: 'secondary', size: navSize });
      // the halves above stop at the replay row, so nothing overlaps
    }
  }
  if (playing) {
    const by = note.y + note.h - 10 - replayH;
    W.text(ctx, '点一下直接看完', L.W / 2, by + replayH / 2, { size: T.FS.body, color: C.sub, align: 'center' });
  }

  // ---- label
  labelLines.forEach((ln, i) => W.text(ctx, ln, L.W / 2, labelY + i * llh + llh / 2 + 1, { size: labelSize, weight: 800, color: s.mine ? C.orangeDeep : C.ink, align: 'center' }));

  // ---- 笑 + 举报
  if (s.canLaugh) {
    const on = !!s.myLaugh;
    const lbl = '笑 ' + (s.laughs || 0);
    const tw = W.measure(ctx, lbl, T.FS.bodyL, 800);
    const lw = tw + 56 + (on ? 20 : 0);
    W.fillRR(ctx, 8, rowY, lw, rh, rh / 2, on ? C.tape : C.card);
    W.strokeRR(ctx, 8, rowY, lw, rh, rh / 2, T.isHC() ? C.ink : C.lineStrong, on ? 2.5 : 1.5);
    W.iconLaugh(ctx, 8 + 24, rowY + rh / 2, 24, C.ink, false);
    W.text(ctx, lbl, 8 + 44, rowY + rh / 2, { size: T.FS.bodyL, weight: 800 });
    if (on) W.iconCheck(ctx, 8 + 44 + tw + 12, rowY + rh / 2, 14, C.ink);
    hits.add('stepthrough:laugh', 8, rowY, lw, rh);
  } else if (s.laughs > 0) {
    W.text(ctx, '笑 ' + s.laughs, 16, rowY + rh / 2, { size: T.FS.bodyL, weight: 700, color: C.sub });
  }
  if (s.canReport) W.link(ctx, L, hits, { id: 'stepthrough:report', x: L.W - 12, y: rowY + rh / 2, label: '举报', align: 'right', color: C.sub, size: T.FS.body });

  // ---- dots
  if (dotsFit) {
    const cell = Math.min(T.MIN_TAP + 8, bw / n);
    const x0 = (L.W - n * cell) / 2;
    for (let i = 0; i < n; i++) {
      const cx = x0 + i * cell + cell / 2;
      const cy = dotsY + rh / 2;
      const cur = i === idx;
      ctx.beginPath();
      ctx.arc(cx, cy, cur ? 9 : 7, 0, Math.PI * 2);
      if (i === 0) {
        ctx.fillStyle = C.card;
        ctx.fill();
      } else {
        ctx.fillStyle = cur ? C.orange : C.ink;
        ctx.fill();
      }
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = cur ? 3 : 2;
      ctx.stroke();
      if (cur) {
        ctx.beginPath();
        ctx.arc(cx, cy, 13, 0, Math.PI * 2);
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      hits.add('stepthrough:dot:' + i, x0 + i * cell, dotsY, cell, rh);
    }
  } else {
    W.text(ctx, (vm.dots && vm.dots.text) || idx + 1 + '/' + n, L.W / 2, dotsY + rh / 2, { size: T.FS.bodyL, weight: 800, color: C.sub, align: 'center' });
  }

  // ---- nav buttons
  const cw = (bw - (perRow - 1) * 8) / perRow;
  navLabels.forEach((b, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    // last row may have fewer buttons: they still use the common width
    W.button(ctx, L, hits, { id: b.id, x: 8 + col * (cw + 8), y: navY + row * (rh + 8), w: cw, h: rh, label: b.label, kind: b.primary ? 'primary' : 'secondary', size: navSize, disabled: !b.on });
  });
  const out = hits.result();
  out.swipe = hits.swipe;
  out.note = note;
  return out;
}

module.exports = { draw, PH_TEXT };
