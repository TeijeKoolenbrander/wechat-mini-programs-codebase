/**
 * Card play (daily, archive, bonus) and the reveal on the same screen (spec 6.2, 6.3; CONTRACT "card").
 * draw(ctx, vm, layout) -> hitAreas. Hit ids: card:back, card:ruler, card:nudgeL, card:nudgeR, card:primary, card:report,
 * coach:dismiss, report:unsuitable, report:ambiguous, report:typo, report:cancel, plus card:scroll (reveal text, large text
 * on short screens only; contract change request) and sheet:body.
 *
 * vm = CardPlay (spec 10) + {hint, coach, revealT, confetti, submitNote, reportSheet, issueNo?, t, display}.
 * The renderer never computes a position: it draws vm.needle and vm.reveal.markers, and reports hitAreas.ruler.
 */

const T = require('./theme');
const W = require('./widgets');
const ruler = require('./ruler');
const play = require('./play');
const { Hits } = require('./layout');
const C = T.COLORS;

/** Wrap the prompt to at most two lines, shrinking from the prompt size (never below the body size). */
function fitPrompt(ctx, str, w, size) {
  let s = size;
  let lines = W.wrap(ctx, str, w, s, 800);
  while (lines.length > 2 && s > T.FS.body) {
    s -= 2;
    lines = W.wrap(ctx, str, w, s, 800);
  }
  if (lines.length > 2) lines = lines.slice(0, 2);
  return { lines, size: s };
}

function titleOf(vm) {
  if (vm.mode === 'bonus') return vm.tag || '加一题 · 不计分';
  if (vm.mode === 'archive') return '往期刻度';
  return vm.issueNo != null ? '每日刻度 · 第 ' + vm.issueNo + ' 期' : '每日刻度';
}

function noteBlockH(ctx, L, vm, w) {
  const p = fitPrompt(ctx, vm.card.prompt, w - L.u(32), T.FS.prompt);
  const lh = Math.round(p.size * 1.25);
  return { h: L.u(18) + T.FS.body + L.u(8) + p.lines.length * lh + L.u(18), p, lh };
}

/** The sticky note with category and prompt. */
function drawNote(ctx, L, vm, x, y, w, nb) {
  W.stickyNote(ctx, x, y, w, nb.h, { fill: C.noteYellow, angle: -0.8 });
  ctx.save();
  ctx.translate(x + w / 2, y + nb.h / 2);
  ctx.rotate((-0.8 * Math.PI) / 180);
  const top = -nb.h / 2;
  W.text(ctx, vm.card.catLabel, 0, top + L.u(18) + T.FS.body / 2, { size: T.FS.body, weight: 700, color: C.sub, align: 'center', maxW: w - L.u(24) });
  nb.p.lines.forEach((ln, i) => W.text(ctx, ln, 0, top + L.u(18) + T.FS.body + L.u(8) + nb.lh * i + nb.lh / 2, { size: nb.p.size, weight: 800, align: 'center' }));
  ctx.restore();
}

function coachBubble(ctx, L, hits, y, text, below) {
  const w = Math.min(L.contentW, L.u(300));
  const lh = Math.round(T.FS.body * 1.4);
  const lines = W.wrap(ctx, text, w - L.u(28), T.FS.body, 700);
  const h = lines.length * lh + L.u(20);
  const x = L.cx - w / 2;
  const by = below ? y + L.u(10) : y - h - L.u(8);
  W.fillRR(ctx, x, by, w, h, L.u(12), C.ink);
  ctx.beginPath();
  if (below) {
    ctx.moveTo(L.cx - L.u(9), by);
    ctx.lineTo(L.cx + L.u(9), by);
    ctx.lineTo(L.cx, by - L.u(9));
  } else {
    ctx.moveTo(L.cx - L.u(9), by + h);
    ctx.lineTo(L.cx + L.u(9), by + h);
    ctx.lineTo(L.cx, by + h + L.u(9));
  }
  ctx.closePath();
  ctx.fillStyle = C.ink;
  ctx.fill();
  lines.forEach((ln, i) => W.text(ctx, ln, L.cx, by + L.u(10) + lh * i + lh / 2, { size: T.FS.body, weight: 700, color: C.paper, align: 'center' }));
  hits.add('coach:dismiss', x, by, w, Math.max(h, T.MIN_TAP));
}

function reportSheet(ctx, L, hits) {
  const bh = T.btn(L, 50);
  const h = L.u(T.isLarge() ? 90 : 78) + 4 * (bh + L.u(10)) + L.u(6);
  const s = W.sheet(ctx, L, hits, { h, title: '这张卡有问题?', closeId: 'report:cancel' });
  let y = s.top;
  [
    ['report:unsuitable', '不合适'],
    ['report:ambiguous', '有歧义'],
    ['report:typo', '有错字'],
  ].forEach((b) => {
    W.button(ctx, L, hits, { id: b[0], x: s.x, y, w: s.w, h: bh, label: b[1] });
    y += bh + L.u(10);
  });
  W.button(ctx, L, hits, { id: 'report:cancel', x: s.x, y, w: s.w, h: bh, label: '取消', kind: 'ghost' });
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display);
  const hits = new Hits();
  const revealed = vm.phase === 'revealed' && vm.reveal;
  const right = vm.index != null && vm.total != null ? vm.index + ' / ' + vm.total : null;
  let top = W.frame(ctx, L, hits, { title: titleOf(vm), right, backId: 'card:back' });
  if (vm.tag && vm.mode !== 'bonus') {
    W.pill(ctx, L, L.x0, top + L.u(14), vm.tag, { align: 'left' });
    top += L.u(34);
  }
  const g = play.geometry(L, { keepRow: !!revealed, slim: !!revealed });
  const rulerGeom = {};
  const needle = vm.needle == null ? null : vm.needle;

  // ---- bottom stack: ruler, nudge row (or report link), primary
  const rm = ruler.metrics(L, false);
  const rg = ruler.draw(ctx, L, {
    x: 0,
    y: g.rulerY,
    w: L.W,
    left: vm.card.left,
    right: vm.card.right,
    needle,
    markers: revealed ? vm.reveal.markers : [],
    band: null,
    interactive: !revealed,
    locked: vm.phase === 'submitting',
    revealT: revealed ? (vm.revealT == null ? 1 : vm.revealT) : 0,
    t: vm.t,
    hint: !revealed && needle == null ? vm.hint : null,
    display: vm.display,
  });
  Object.assign(rulerGeom, rg);
  if (!revealed) ruler.addHit(hits, 'card:ruler', rg, L);

  const pr = play.primaryRect(L, g);
  const interactive = vm.phase === 'empty' || vm.phase === 'placing' || vm.phase === 'submitting' || vm.phase === 'pending';
  if (interactive) {
    const canNudge = needle != null && vm.phase !== 'submitting';
    play.nudges(ctx, L, hits, g, 'card', canNudge, L.x0, L.x0 + L.contentW);
  } else if (revealed) {
    W.link(ctx, L, hits, { id: 'card:report', x: L.x0, y: g.rowY + g.rowH / 2, label: '这张卡有问题?', size: T.FS.body, color: C.sub, weight: 600 });
  }
  let label = vm.primaryLabel || '就这儿';
  let disabled = false;
  if (vm.phase === 'submitting') {
    label = '提交中…';
    disabled = true;
  } else if (vm.phase === 'pending') label = '重试';
  else if (vm.phase === 'empty' || vm.phase === 'placing') {
    label = '就这儿';
    disabled = !vm.canConfirm;
  }
  W.button(ctx, L, hits, { id: 'card:primary', x: pr.x, y: g.primaryY, w: pr.w, h: g.bh, label, kind: 'primary', disabled });

  // ---- upper area
  const areaTop = top + L.u(4);
  const areaBottom = g.rulerY - L.u(6);
  const area = { x: L.x0, y: areaTop, w: L.contentW, h: Math.max(L.u(40), areaBottom - areaTop) };

  if (!revealed) {
    const nb = noteBlockH(ctx, L, vm, Math.min(L.contentW, L.u(340)));
    const nw = Math.min(L.contentW, L.u(340));
    const extra = vm.submitNote ? Math.round(T.FS.bodyL * 1.4) * W.wrap(ctx, vm.submitNote, L.contentW, T.FS.bodyL, 700).length + L.u(8) : 0;
    const total = nb.h + extra;
    const ny = area.y + Math.max(L.u(4), (area.h - total) / 2);
    drawNote(ctx, L, vm, L.cx - nw / 2, ny, nw, nb);
    if (vm.submitNote) {
      const lh = Math.round(T.FS.bodyL * 1.4);
      W.paragraph(ctx, vm.submitNote, L.x0, ny + nb.h + L.u(8), L.contentW, lh, { size: T.FS.bodyL, weight: 700, color: C.danger, align: 'center' });
    }
    if (vm.coach && vm.phase !== 'submitting') coachBubble(ctx, L, hits, g.inline ? g.rulerY + rm.noteH * 0.3 : g.rowY - L.u(6), '拖动指针，放到你觉得对的位置', !g.inline);
  } else {
    const r = vm.reveal;
    const lhS = Math.round(T.FS.bodyL * 1.4);
    const pw = L.contentW;
    const pf = fitPrompt(ctx, vm.card.prompt, pw, T.FS.prompt);
    const plh = Math.round(pf.size * 1.25);
    const scoreH = Math.round(T.FS.hero * 1.25);
    const lines = [
      [r.nationText, C.nationText, 700],
      [r.agreeText, C.sub, 600],
      [r.groupText, C.groupText, 700],
    ].filter((l) => l[0]);
    const blocks = [
      {
        h: pf.lines.length * plh,
        draw: (c, x, y, w) => pf.lines.forEach((ln, i) => W.text(c, ln, x + w / 2, y + plh * i + plh / 2, { size: pf.size, weight: 800, align: 'center' })),
      },
      {
        h: scoreH,
        draw: (c, x, y, w) => {
          const lw = W.measure(c, r.label, T.FS.title, 800);
          const sw = W.measure(c, r.scoreText, T.FS.hero, 800);
          const gap = L.u(12);
          const sx = x + (w - (lw + gap + sw)) / 2;
          W.text(c, r.label, sx, y + scoreH / 2 + 2, { size: T.FS.title, weight: 800, color: r.bullseye ? C.youText : C.ink });
          W.text(c, r.scoreText, sx + lw + gap, y + scoreH / 2, { size: T.FS.hero, weight: 800, color: C.primary });
        },
      },
    ];
    lines.forEach((l) => {
      const n = W.wrap(ctx, l[0], pw, T.FS.bodyL, l[2]).length;
      blocks.push({
        h: n * lhS,
        gap: L.u(6),
        draw: (c, x, y, w) => W.paragraph(c, l[0], x, y, w, lhS, { size: T.FS.bodyL, weight: l[2], color: l[1], align: 'center' }),
      });
    });
    // Not enough room (large text, short screen): the prompt (already on screen before the reveal) goes first, so the score and
    // the "和全国 x%" line stay in the first screenful.
    const full = blocks.reduce((n, b, i) => n + b.h + (i ? (b.gap != null ? b.gap : L.u(8)) : 0), 0);
    if (full > area.h) blocks.shift();
    W.stack(ctx, L, hits, area, blocks, vm.scrollY || 0, 'card:scroll', L.u(8));
    if (vm.confetti) W.confetti(ctx, L, L.cx, g.rulerY + rm.noteH + rm.gap + rm.laneH, vm.confetti);
  }
  if (vm.reportSheet) reportSheet(ctx, L, hits);
  return hits.result();
}

module.exports = { draw };
