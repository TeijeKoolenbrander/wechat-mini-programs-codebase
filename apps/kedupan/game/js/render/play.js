/**
 * Card play and card reveal (spec 6.2, 6.3): daily, archive and bonus cards.
 * (The host-round guess screen is in round.js.)
 *
 * Layout: header, a sticky note with the prompt, then the ruler block which
 * is anchored to the thumb zone (bottom) when there is room and scrolls with
 * the note when there is not. The primary button is pinned above the inset.
 * The block under the ruler has a fixed height (nudge row while placing, the
 * reveal lines after), so the tape never jumps when the reveal arrives.
 */

const T = require('./theme');
const W = require('./widgets');
const R = require('./ruler');
const K = require('./chrome');
const S = require('./sheets');
const Fx = require('./effects');
const C = T.C;

function title(vm) {
  if (vm.title) return vm.title;
  if (vm.mode === 'archive') return '往期练习' + (vm.issueNo ? ' · 第 ' + vm.issueNo + ' 期' : '');
  if (vm.mode === 'bonus') return '加一题';
  return '每日刻度' + (vm.issueNo ? ' · 第 ' + vm.issueNo + ' 期' : '');
}

/** The sticky note with category and prompt. Returns its height. */
function promptNote(ctx, L, x, y, w, card) {
  const ps = W.fs(L, 'prompt');
  const cs = W.fs(L, 'body');
  const lines = W.wrap(ctx, card.prompt, w - L.u(40), ps, 900).slice(0, 2);
  const h = L.u(14) + cs * 1.3 + lines.length * ps * 1.3 + L.u(12);
  W.note(ctx, x, y, w, h, { fill: C.noteYellow, rot: -0.8, tape: true });
  W.text(ctx, card.catLabel || '', x + w / 2, y + L.u(14) + cs * 0.6, { size: cs, weight: 700, color: C.sub, align: 'center' });
  lines.forEach((ln, i) => {
    W.text(ctx, ln, x + w / 2, y + L.u(14) + cs * 1.3 + ps * 1.3 * (i + 0.5), { size: ps, weight: 900, align: 'center' });
  });
  return h;
}

function revealBlockHeight(ctx, L) {
  const lh = W.fs(L, 'body') * 1.5;
  return W.fs(L, 'score') * 1.15 + lh * 3 + L.u(10) + T.MIN_TAP;
}

/** The reveal lines; returns nothing. y = top of the block. */
function revealBlock(ctx, L, hits, vm, y, withReport) {
  const rv = vm.reveal;
  const lh = W.fs(L, 'body') * 1.5;
  const sh = W.fs(L, 'score') * 1.15;
  const label = rv.label || '';
  const ls = W.fs(L, 'title');
  const sc = W.fs(L, 'score');
  const lw = W.measure(ctx, label, ls, 900);
  const cw = W.measure(ctx, rv.scoreText || '', sc, 900);
  const gap = L.u(12);
  const total = lw + gap + cw;
  const sx = L.cx - total / 2;
  const slide = W.easeOut(vm.textT == null ? 1 : vm.textT);
  ctx.globalAlpha = slide;
  W.text(ctx, label, sx, y + sh * 0.55 + (1 - slide) * 8, { size: ls, weight: 900, color: T.labelColor(label), maxW: L.contentW * 0.5 });
  W.text(ctx, rv.scoreText || '', sx + lw + gap, y + sh * 0.5 + (1 - slide) * 8, { size: sc, weight: 900, color: C.ink });
  ctx.globalAlpha = 1;
  let cy = y + sh + L.u(4);
  [
    [rv.nationText, C.ink, 700],
    [rv.agreeText, C.sub, 500],
    [rv.groupText, C.groupText, 700],
  ].forEach((ln) => {
    if (ln[0]) W.paragraph(ctx, ln[0], L.x0, cy, L.contentW, lh, { size: W.fs(L, 'body'), weight: ln[2], color: ln[1], align: 'center', maxLines: 1 });
    cy += lh;
  });
  if (rv.bullseye) Fx.confetti(ctx, L, L.cx, y + sh * 0.5, vm.confettiT);
  if (withReport) {
    W.link(ctx, L, hits, { id: 'play:report', x: L.x0, y: cy + T.MIN_TAP / 2 - L.u(2), label: '这张卡有问题?', size: W.fs(L, 'body'), color: C.sub, underline: true });
  }
}

function draw(ctx, vm, L) {
  const hits = K.begin(ctx, vm, L);
  const total = vm.total || 5;
  const showCount = vm.index != null && vm.mode !== 'bonus';
  let y = K.header(ctx, L, hits, { title: title(vm), right: showCount ? vm.index + ' / ' + total : null });
  if (vm.tag) {
    const pw = W.measure(ctx, vm.tag, W.fs(L, 'body'), 700) + L.u(20);
    W.pill(ctx, L.x0 + L.contentW, L.navBottom + L.u(22), vm.tag, { size: W.fs(L, 'body'), color: C.warn, fill: C.noteYellow, align: 'right' });
    void pw;
  }
  const bh = K.btnH(L);
  const pTop = K.pinnedTop(L, 1);
  const phase = vm.phase || 'empty';
  const revealed = phase === 'revealed' && vm.reveal;
  const locked = phase === 'submitting' || phase === 'pending' || phase === 'revealed';
  const placing = !locked;
  const card = vm.card || { left: '', right: '', prompt: '', catLabel: '' };
  const viewTop = y + L.u(2);
  const viewBottom = pTop - L.u(8);
  const lanes = vm.mode === 'daily' ? 2 : 1;
  const markers = revealed ? vm.reveal.markers || [] : [];
  const youMarker = markers.find((m) => m.kind === 'you');
  const needle = vm.needle != null ? vm.needle : youMarker ? youMarker.pos : null;
  const rv = vm.revealT == null ? 1 : vm.revealT;

  W.scrollView(ctx, L, hits, {
    x: 0,
    y: viewTop,
    w: L.W,
    h: viewBottom - viewTop,
    scroll: vm.scrollY || 0,
    id: 'play:scroll',
    draw(c, h, vh) {
      const noteH = promptNote(c, L, L.x0, viewTop + L.u(8), L.contentW, card);
      const naturalY = viewTop + L.u(8) + noteH + L.u(16);
      // dry-measure the ruler without the nudge row
      const base = R.drawRuler(W.dryCtx(c), L, new (require('./layout').Hits)(), { y: 0, left: card.left, right: card.right, lanes, nudge: false });
      const nudgeH = Math.max(T.MIN_TAP, L.u(T.MODE.large ? 58 : 52)) + L.u(8);
      const below = Math.max(nudgeH, revealBlockHeight(c, L));
      const blockH = base.bottom + below;
      const ry = Math.max(naturalY, viewTop + vh - blockH - L.u(4));
      const r = R.drawRuler(c, L, h, {
        y: ry,
        left: card.left,
        right: card.right,
        needle,
        lift: vm.dragging ? 1 : 0,
        markers,
        revealT: revealed ? rv : 1,
        lanes,
        nudge: placing,
        nudgeLeft: needle != null && needle > 0,
        nudgeRight: needle != null && needle < 100,
        interactive: placing,
        empty: placing && needle == null,
        hint: '点一下或拖动，放上指针',
        t: vm.t,
        youLabel: revealed,
      });
      const belowY = ry + base.bottom + L.u(8);
      if (revealed) revealBlock(c, L, h, vm, belowY, true);
      else if (vm.notice) {
        W.paragraph(c, vm.notice, L.x0 + L.u(64), belowY, L.contentW - L.u(128), W.fs(L, 'body') * 1.4, { size: W.fs(L, 'body'), weight: 700, color: C.warn, align: 'center', maxLines: 2 });
      } else if (phase === 'submitting') {
        W.spinner(c, L.cx, belowY + L.u(24), L.u(11), vm.t);
      }
      void r;
      return ry + blockH + L.u(4);
    },
  });

  // primary button, pinned in the thumb zone
  const disabled = phase === 'submitting' || ((phase === 'empty' || phase === 'placing') && !vm.canConfirm);
  const label = phase === 'submitting' ? '提交中…' : vm.primaryLabel || '就这儿';
  W.button(ctx, L, hits, { id: 'play:primary', x: L.x0, y: pTop, w: L.contentW, h: bh, label, kind: 'primary', disabled });

  if (vm.sheet === 'report') S.drawReport(ctx, L, hits);
  if (vm.coach && placing && needle == null) drawCoach(ctx, L, hits);
  return hits.result();
}

function drawCoach(ctx, L, hits) {
  hits.add('coach:block', 0, 0, L.W, L.H);
  ctx.fillStyle = 'rgba(36,33,30,0.45)';
  ctx.fillRect(0, 0, L.W, L.navBottom + L.u(70));
  const w = Math.min(L.contentW, L.u(320));
  const bh = K.btnH(L);
  const h = L.u(24) + W.fs(L, 'bodyL') * 1.5 * 3 + L.u(12) + bh;
  const y = L.navBottom + L.u(76);
  const x = L.cx - w / 2;
  W.note(ctx, x, y, w, h, { fill: C.noteYellow, tape: true, rot: 0.6 });
  W.paragraph(ctx, '按住刻度尺，拖到你觉得对的位置。松手就定，再点「就这儿」。', x + L.u(16), y + L.u(18), w - L.u(32), W.fs(L, 'bodyL') * 1.5, { size: W.fs(L, 'bodyL'), weight: 700, maxLines: 3 });
  W.button(ctx, L, hits, { id: 'coach:dismiss', x: x + L.u(16), y: y + h - bh - L.u(10), w: w - L.u(32), h: bh, label: '知道了', kind: 'secondary' });
}

module.exports = { draw, promptNote, revealBlock, revealBlockHeight, title };
