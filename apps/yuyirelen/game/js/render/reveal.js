/**
 * Reveal (spec 8.4) with the comparison (8.7). draw(ctx, vm, layout) -> hitAreas.
 *
 * vm = spec 13 Reveal model, plus optional extras (see CONTRACT.md):
 *   scrollY: px offset of the scrolling body
 *   showTheirs: boolean   expands the sharer's words (compare.theirWords)
 *   display, t
 * Everything between the back row and the pinned bottom bar scrolls as one
 * column (answer, summary, chart, comparison, stats, board link, top-100);
 * 分享成绩 and 再来一题 are pinned in the thumb zone.
 *
 * Hit ids: reveal:back, reveal:share, reveal:again, reveal:board,
 *   reveal:retryTop, reveal:theirWords, reveal:scroll (scroll area).
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits } = require('./layout');
const C = T.COLORS;

function lineH(L, base) {
  return L.u(T.METRICS.large ? base + 6 : base);
}

/** Build the list of blocks {h, draw(y)} for this vm. */
function buildBlocks(ctx, L, vm, hits) {
  const x = L.x0;
  const cw = L.contentW;
  const large = T.METRICS.large;
  const blocks = [];
  const gapS = L.u(8);
  const gapM = L.u(14);

  // title
  blocks.push({
    h: lineH(L, 30),
    draw(y) {
      W.text(ctx, vm.title || '', L.cx, y + lineH(L, 30) / 2, { size: T.FS.bodyL, weight: 700, color: C.sub, align: 'center', maxW: cw });
    },
  });

  // answer
  const gaveUp = vm.outcome === 'gaveup';
  const aSize = Math.max(40, L.u(T.FS.answer));
  const aH = aSize * 1.25;
  blocks.push({
    h: aH + L.u(gaveUp ? 26 : 10),
    draw(y) {
      let yy = y;
      if (gaveUp) {
        W.text(ctx, '答案', L.cx, yy + L.u(12), { size: T.FS.bodyL, weight: 700, color: C.sub, align: 'center' });
        yy += L.u(26);
      }
      const ans = Array.from(vm.answer || '').join(Array.from(vm.answer || '').length <= 3 ? ' ' : '');
      W.text(ctx, ans, L.cx, yy + aH / 2, { size: aSize, weight: 900, serif: true, align: 'center', maxW: cw, minSize: 40 });
      if (!gaveUp) {
        // gold underline: the 命中 colour
        const tw = Math.min(cw, W.measure(ctx, ans, aSize, 900, true));
        W.fillRR(ctx, L.cx - tw / 2, yy + aH - L.u(2), tw, L.u(5), L.u(2.5), T.BAND_COLOR.hit);
      }
    },
  });

  // summary
  const sumH = Math.max(lineH(L, 28), W.paragraphHeight(ctx, vm.summary || '', cw, lineH(L, 28), { size: T.FS.title - 2, weight: 700 }));
  blocks.push({
    h: sumH + gapM,
    draw(y) {
      W.paragraph(ctx, vm.summary || '', x, y, cw, lineH(L, 28), { size: T.FS.title - 2, weight: 700, align: 'center' });
    },
  });

  // chart
  const chartH = L.u(large ? 84 : 68);
  blocks.push({
    h: chartH + L.u(30) + gapM,
    draw(y) {
      W.card(ctx, x, y - L.u(6), cw, chartH + L.u(40), { fill: C.surface });
      W.tempChart(ctx, x + L.u(12), y + L.u(6), cw - L.u(24), chartH - L.u(8), vm.temps || [], vm.bands || [], { axis: true });
    },
  });
  // (card above is drawn behind the chart block's own height; account for its padding)

  // comparison (8.7)
  const cmp = vm.compare;
  if (cmp) {
    const ch = L.u(large ? 56 : 46);
    const cardH = ch + L.u(14) + L.u(28);
    const showWords = vm.showTheirs && cmp.theirWords && cmp.theirWords.length;
    const wordsH = showWords ? W.chipFlowHeight(ctx, L, cmp.theirWords, cw, { h: L.u(40), size: T.FS.body, gap: L.u(8) }) + gapM : 0;
    const total = lineH(L, 34) + cardH + gapS + L.u(T.METRICS.tap) + gapS + wordsH + gapM;
    blocks.push({
      h: total,
      draw(y) {
        let yy = y;
        W.text(ctx, '你 ' + cmp.mySteps + ' 步 · TA ' + cmp.theirSteps + ' 步', L.cx, yy + lineH(L, 34) / 2, { size: T.FS.title, weight: 800, serif: true, align: 'center', maxW: cw });
        yy += lineH(L, 34);
        const half = (cw - gapM) / 2;
        const sides = [
          { x0: x, temps: vm.temps || [], bands: vm.bands || [], label: '你' },
          { x0: x + half + gapM, temps: cmp.theirTemps || [], bands: cmp.theirBands || [], label: cmp.theirStatus === 'gaveup' ? 'TA · 未猜中' : 'TA' },
        ];
        sides.forEach((sd) => {
          W.card(ctx, sd.x0, yy, half, cardH, { fill: C.surface });
          W.tempChart(ctx, sd.x0 + L.u(8), yy + L.u(8), half - L.u(16), ch, sd.temps, sd.bands);
          W.text(ctx, sd.label, sd.x0 + half / 2, yy + L.u(8) + ch + L.u(17), { size: T.FS.body, weight: 700, color: C.sub, align: 'center', maxW: half - L.u(8) });
        });
        yy += cardH + gapS;
        const bh = L.u(T.METRICS.tap);
        const open = !!vm.showTheirs;
        W.button(ctx, L, hits, { id: 'reveal:theirWords', x: x, y: yy, w: cw, h: bh, label: open ? '收起 TA 的猜词' : '看 TA 的猜词', kind: 'secondary', size: T.FS.bodyL });
        yy += bh + gapS;
        if (showWords) {
          W.chipFlow(ctx, L, hits, cmp.theirWords, x, yy, cw, { h: L.u(40), size: T.FS.body, disabled: true, minW: L.u(60), gap: L.u(8) });
        }
      },
    });
  }

  // stats
  if (vm.stats && vm.stats.show) {
    [vm.stats.line1, vm.stats.line2].filter(Boolean).forEach((ln) => {
      const h = Math.max(lineH(L, 26), W.paragraphHeight(ctx, ln, cw, lineH(L, 26), { size: T.FS.bodyL }));
      blocks.push({
        h: h + L.u(4),
        draw(y) {
          W.paragraph(ctx, ln, x, y, cw, lineH(L, 26), { size: T.FS.bodyL, color: C.ink, align: 'center', weight: 500 });
        },
      });
    });
  }
  if (vm.streak && vm.streak.show) {
    blocks.push({
      h: lineH(L, 30),
      draw(y) {
        W.text(ctx, vm.streak.label || '', L.cx, y + lineH(L, 30) / 2, { size: T.FS.bodyL, weight: 800, color: C.accent, align: 'center', maxW: cw });
      },
    });
  }

  // board link
  blocks.push({
    h: L.u(T.METRICS.tap) + gapM * 1.5,
    draw(y) {
      W.button(ctx, L, hits, { id: 'reveal:board', x, y: y + gapS, w: cw, h: L.u(T.METRICS.tap), label: '群榜 / 好友榜', kind: 'secondary', size: T.FS.bodyL });
    },
  });

  // top-100 list
  const top = vm.top || { state: 'loading', items: [] };
  blocks.push({
    h: lineH(L, 36),
    draw(y) {
      ctx.fillStyle = C.lineStrong;
      ctx.fillRect(x, y, cw, 1);
      W.text(ctx, '最接近的 100 个词', x, y + lineH(L, 36) / 2 + L.u(2), { size: T.FS.title - 2, weight: 800, serif: true });
    },
  });
  if (top.state === 'loading') {
    const n = 5;
    const rh = L.u(large ? 56 : 44);
    blocks.push({
      h: n * rh,
      draw(y) {
        for (let i = 0; i < n; i++) {
          W.skeleton(ctx, x + L.u(4), y + i * rh + rh * 0.28, L.u(30), rh * 0.44, vm.t, 6);
          W.skeleton(ctx, x + L.u(48), y + i * rh + rh * 0.28, cw * (0.3 + 0.08 * (i % 3)), rh * 0.44, vm.t, 6);
        }
      },
    });
  } else if (top.state === 'error') {
    blocks.push({
      h: lineH(L, 34) + L.u(T.METRICS.tap) + gapM * 2,
      draw(y) {
        W.text(ctx, '列表暂时打不开', L.cx, y + lineH(L, 34) / 2 + gapS, { size: T.FS.bodyL, weight: 700, color: C.sub, align: 'center' });
        W.button(ctx, L, hits, { id: 'reveal:retryTop', x: L.cx - L.u(70), y: y + lineH(L, 34) + gapS, w: L.u(140), h: L.u(T.METRICS.tap), label: '重试', kind: 'secondary', size: T.FS.bodyL });
      },
    });
  } else {
    const rh = L.u(large ? 56 : 44);
    (top.items || []).forEach((it) => {
      blocks.push({
        h: rh,
        row: true,
        draw(y) {
          if (it.mine) {
            W.fillRR(ctx, x, y + 2, cw, rh - 4, L.u(10), 'rgba(224,138,46,0.20)');
            W.fillRR(ctx, x, y + L.u(8), L.u(4), rh - L.u(16), 2, T.BAND_COLOR.hot);
          }
          const band = T.bandOfRank(it.rank);
          // small heat dot keeps the colour language in the list
          ctx.beginPath();
          ctx.arc(x + L.u(16), y + rh / 2, L.u(5), 0, Math.PI * 2);
          ctx.fillStyle = T.bandColor(band);
          ctx.fill();
          W.text(ctx, String(it.rank), x + L.u(34), y + rh / 2, { size: T.FS.bodyL, weight: 700, color: C.sub });
          const wx = x + L.u(large ? 84 : 76);
          const tw = W.text(ctx, it.word, wx, y + rh / 2, { size: T.FS.chip, weight: it.mine ? 800 : 600, maxW: cw - (wx - x) - L.u(90) });
          if (it.synonym) W.text(ctx, '同义', wx + tw + L.u(10), y + rh / 2, { size: T.FS.body, weight: 700, color: C.accent });
          if (it.mine) W.text(ctx, '你猜过', x + cw - L.u(8), y + rh / 2, { size: T.FS.body, weight: 700, color: C.sub, align: 'right' });
          ctx.fillStyle = C.line;
          ctx.fillRect(x + L.u(6), y + rh - 0.5, cw - L.u(12), 1);
        },
      });
    });
  }
  return blocks;
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display);
  const hits = new Hits();
  W.paper(ctx, L);
  W.backButton(ctx, L, hits, '首页', 'reveal:back');

  const btnH = L.u(T.METRICS.btn);
  const gap = L.u(10);
  const barY = L.bottomEdge - L.bottomPad - btnH;
  const view = { x: 0, y: L.navBottom, w: L.W, h: barY - gap - L.navBottom };

  // scroll area first so the buttons inside it win the taps
  hits.add('reveal:scroll', view.x, view.y, view.w, view.h);
  const blocks = buildBlocks(ctx, L, vm, hits);
  let total = L.u(4);
  blocks.forEach((b) => (total += b.h));
  const maxScroll = Math.max(0, total - view.h + L.u(8));
  hits.scrollMax['reveal:scroll'] = maxScroll;
  const off = Math.max(0, Math.min(vm.scrollY || 0, maxScroll));

  ctx.save();
  ctx.beginPath();
  ctx.rect(view.x, view.y, view.w, view.h);
  ctx.clip();
  ctx.translate(0, -off);
  hits.beginScroll(view, -off);
  let y = view.y + L.u(4);
  blocks.forEach((b) => {
    const vis = y + b.h >= view.y + off && y <= view.y + view.h + off;
    if (vis) b.draw(y);
    y += b.h;
  });
  hits.endScroll();
  ctx.restore();

  // pinned bottom bar: 分享成绩 (primary) | 再来一题
  const cw = L.contentW;
  const g = L.u(10);
  const w1 = Math.round((cw - g) * 0.5);
  W.button(ctx, L, hits, { id: 'reveal:share', x: L.x0, y: barY, w: w1, h: btnH, label: '分享成绩', kind: 'primary', disabled: vm.canShare === false });
  W.button(ctx, L, hits, { id: 'reveal:again', x: L.x0 + w1 + g, y: barY, w: cw - w1 - g, h: btnH, label: vm.nextLabel || '再来一题', kind: 'secondary' });
  return hits.result();
}

module.exports = { draw };
