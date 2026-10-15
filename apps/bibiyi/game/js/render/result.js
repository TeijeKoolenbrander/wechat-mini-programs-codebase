/**
 * Result (spec 6.5). draw(ctx, vm, layout) -> hitAreas.
 *
 * vm = spec 10 Result model plus the optional extras in CONTRACT.md:
 *   scrollY, t, stampT, boardLabel, streakCount (0..1 count-up of the number)
 * Hit ids: result:back, result:retry, result:again, result:share,
 *   result:challenge, result:save, result:questions, result:board,
 *   result:subscribe, result:reportTop, result:reportBottom,
 *   result:sourceTop, result:sourceBottom, result:scroll.
 * hitAreas.scrollMax = {'result:scroll': n}.
 */

const T = require('./theme');
const W = require('./widgets');
const P = require('./pairs');
const { clamp, Hits } = require('./layout');
const C = T.COLORS;

function saveLabel(vm) {
  const s = (vm.saveImage && vm.saveImage.state) || 'idle';
  if (s === 'rendering' || s === 'saving') return { label: '保存中…', disabled: true };
  if (s === 'saved') return { label: '已保存', disabled: false };
  if (s === 'error') return { label: '重试保存', disabled: false };
  return { label: '保存图片', disabled: false };
}

function notice(ctx, L, x, y, w, str, color, fill) {
  const lines = W.wrap(ctx, str, w - L.u(28), T.FS.body, 700, false);
  const lh = L.u(24) * (L.large ? 1.2 : 1);
  const h = lines.length * lh + L.u(20);
  W.fillRR(ctx, x, y, w, h, L.u(10), fill);
  W.strokeRR(ctx, x, y, w, h, L.u(10), color, 1.5);
  lines.forEach((ln, i) => W.text(ctx, ln, x + w / 2, y + L.u(10) + lh * i + lh / 2, { size: T.FS.body, weight: 700, color, align: 'center' }));
  return h;
}

/** The scrolling body. Returns its height. */
function body(ctx, vm, L, hits, x, y0, w) {
  let y = y0;
  const status = vm.status || 'done';
  const centre = x + w / 2;
  const lh = L.u(26) * (L.large ? 1.15 : 1);

  W.text(ctx, vm.headerText || '', centre, y + lh / 2, { size: T.FS.body, weight: 600, color: C.sub, align: 'center', maxW: w });
  y += lh + L.u(6);
  W.text(ctx, '连对', centre, y + lh / 2, { size: T.FS.bodyL, weight: 800, serif: true, align: 'center' });
  y += lh;

  // the streak number
  const bigH = T.FS.streak * 1.2;
  if (status === 'finalizing') {
    W.skeleton(ctx, centre - L.u(46), y + bigH * 0.15, L.u(92), bigH * 0.7, vm.t, 12);
    y += bigH;
    W.text(ctx, '正在记分…', centre, y + lh / 2, { size: T.FS.bodyL, color: C.sub, align: 'center' });
    y += lh + L.u(10);
    return y - y0;
  }
  const sc = vm.streakCount;
  let numStr = String(vm.streak != null ? vm.streak : 0);
  if (typeof sc === 'number' && sc < 1) numStr = String(Math.round((vm.streak || 0) * (1 - Math.pow(1 - clamp(sc, 0, 1), 3))));
  W.text(ctx, numStr, centre, y + bigH / 2, { size: T.FS.streak, weight: 900, serif: true, color: (vm.streak || 0) >= 10 ? C.seal : C.ink, align: 'center' });
  y += bigH;
  const note = vm.streakText && vm.streakText.indexOf('（') >= 0 ? vm.streakText.slice(vm.streakText.indexOf('（')) : '';
  if (note) {
    W.text(ctx, note.replace(/[（）]/g, ''), centre, y + lh / 2 - L.u(4), { size: T.FS.body, weight: 600, color: C.sub, align: 'center' });
    y += lh - L.u(2);
  }
  y += L.u(2);
  if (vm.commentText) {
    y += W.paragraph(ctx, vm.commentText, x, y, w, lh, { size: T.FS.bodyL, weight: 700, serif: true, align: 'center', maxLines: 2 });
  }
  const sub = [vm.rarityText, vm.dayStreakText].filter(Boolean).join(' · ');
  if (sub) y += W.paragraph(ctx, sub, x, y + L.u(2), w, lh, { size: T.FS.body, color: C.sub, align: 'center', maxLines: 2 }) + L.u(2);
  y += L.u(10);

  if (status === 'pendingNetwork') {
    y += notice(ctx, L, x, y, w, '网络不太好，成绩还没记入，请点重试', C.bad, C.badSoft) + L.u(10);
  } else if (status === 'error') {
    y += notice(ctx, L, x, y, w, '成绩暂时没能记入，请重试', C.bad, C.badSoft) + L.u(10);
  }

  // challenge comparison
  if (vm.challenge && vm.challenge.compareText) {
    const ch = L.u(48) * (L.large ? 1.2 : 1);
    W.card(ctx, x, y, w, ch + (vm.friendly ? L.u(28) : 0), { fill: C.card });
    W.text(ctx, vm.challenge.compareText, centre, y + ch / 2, { size: T.FS.bodyL, weight: 800, serif: true, align: 'center', maxW: w - L.u(20) });
    if (vm.friendly) W.text(ctx, '友谊赛，不计入榜单', centre, y + ch + L.u(2), { size: T.FS.body, color: C.sub, align: 'center', maxW: w - L.u(20) });
    y += ch + (vm.friendly ? L.u(28) : 0) + L.u(10);
  } else if (vm.friendly) {
    W.text(ctx, '友谊赛，不计入榜单', centre, y + lh / 2, { size: T.FS.body, weight: 700, color: C.sub, align: 'center' });
    y += lh + L.u(6);
  }

  // missed pair or 全部答对 stamp
  if (vm.cleared) {
    const sh = L.u(76) * (L.large ? 1.2 : 1);
    const sw = Math.min(w, L.u(260));
    W.stamp(ctx, centre, y + sh / 2 + L.u(6), sw, sh, '全部答对 ' + (vm.questions ? vm.questions.length || '' : '') + (vm.questions && vm.questions.length ? ' 题' : ''), { progress: vm.stampT == null ? 1 : vm.stampT });
    y += sh + L.u(18);
  } else if (vm.miss) {
    const m = vm.miss;
    const pad = L.u(14);
    const headH = L.u(34) * (L.large ? 1.15 : 1);
    const tall = headH + P.factLineH(L) * 2 + L.u(34) * (L.large ? 1.2 : 1) + pad;
    W.card(ctx, x, y, w, tall, { fill: C.card, shadow: true });
    W.fillRR(ctx, x + pad, y + L.u(8), L.u(4), headH - L.u(8), 2, C.bad);
    W.text(ctx, '倒在第 ' + m.k + ' 题', x + pad + L.u(12), y + headH / 2 + L.u(4), { size: T.FS.bodyL, weight: 800, serif: true, color: C.bad });
    let cy = y + headH;
    // the missed fact first (bottom card), with the pick under it
    cy += P.factLine(ctx, L, hits, x + pad, cy, w - 2 * pad, m.bottom, { idBase: 'result:bottom', showReport: m.bottom.canReport !== false });
    const pickH = L.u(34) * (L.large ? 1.2 : 1);
    const vw = W.verdictWidth(ctx, false, { h: L.u(28) * L.k });
    W.verdict(ctx, x + pad, cy + (pickH - L.u(28) * L.k) / 2, false, { h: L.u(28) * L.k });
    W.text(ctx, m.chosenLabel || '', x + pad + vw + L.u(10), cy + pickH / 2 + 1, { size: T.FS.body, weight: 700, color: C.ink, maxW: w - 2 * pad - vw - L.u(10) });
    cy += pickH;
    P.factLine(ctx, L, hits, x + pad, cy, w - 2 * pad, m.top, { idBase: 'result:top', showReport: m.top.canReport !== false });
    y += tall + L.u(14);
  }

  // subscribe offer (only when a template exists)
  const sub2 = vm.subscribe && vm.subscribe.state;
  if (sub2 === 'offer' || sub2 === 'requesting' || sub2 === 'granted') {
    const bh = L.btnH2;
    const label = sub2 === 'granted' ? '好，有人接受挑战会提醒你' : '好友接受挑战时提醒我';
    W.card(ctx, x, y, w, bh + L.u(12), { fill: C.card });
    W.text(ctx, label, x + L.u(14), y + (bh + L.u(12)) / 2, { size: T.FS.body, weight: 600, maxW: w - L.u(14) - (sub2 === 'granted' ? L.u(14) : L.u(110)) });
    if (sub2 !== 'granted') {
      W.button(ctx, L, hits, { id: 'result:subscribe', x: x + w - L.u(98), y: y + L.u(6), w: L.u(90), h: bh, label: sub2 === 'requesting' ? '请求中' : '提醒我', size: T.FS.body, disabled: sub2 === 'requesting' });
    }
    y += bh + L.u(12) + L.u(10);
  }
  if (vm.privacyNote) {
    y += W.paragraph(ctx, vm.privacyNote, x, y, w, L.u(22) * (L.large ? 1.2 : 1), { size: T.FS.body, color: C.sub, align: 'center', maxLines: 2 }) + L.u(6);
  }
  return y - y0;
}

function draw(ctx, vm, L) {
  const hits = W.start(L);
  W.paper(ctx, L);
  W.backButton(ctx, L, hits, '首页', 'result:back');
  const x = L.x0;
  const cw = L.contentW;
  const status = vm.status || 'done';
  const gap = L.u(L.compact ? 8 : 10);

  // ---- pinned actions (thumb zone)
  let y = L.bottomEdge - L.bottomPad;
  const pb = L.btnH;
  y -= pb;
  const canPlay = status !== 'finalizing';
  if (status === 'pendingNetwork' || status === 'error') {
    W.button(ctx, L, hits, { id: 'result:retry', x, y, w: cw, h: pb, label: '重 试', kind: 'primary' });
  } else if (status === 'finalizing') {
    W.button(ctx, L, hits, { x, y, w: cw, h: pb, label: '正在记分…', kind: 'secondary', disabled: true });
  } else {
    W.button(ctx, L, hits, { id: 'result:again', x, y, w: cw, h: pb, label: '再来一局（随便比比）', kind: 'primary' });
  }
  y -= gap;
  const sh = L.btnH2;
  const live = canPlay && status !== 'error';
  // row 2: 本局题目 / 看群榜/好友榜 (+ 再来一局 stays reachable on retry states)
  y -= sh;
  const half = (cw - gap) / 2;
  W.button(ctx, L, hits, { id: 'result:questions', x, y, w: half, h: sh, label: '本局题目', size: T.FS.bodyL, disabled: !live && status === 'finalizing' });
  W.button(ctx, L, hits, { id: 'result:board', x: x + half + gap, y, w: half, h: sh, label: vm.boardLabel || '看群榜/好友榜', size: T.FS.bodyL, disabled: status === 'finalizing' });
  y -= gap;
  // row 1: 分享 / 发起挑战 / 保存图片
  y -= sh;
  const third = (cw - 2 * gap) / 3;
  const sv = saveLabel(vm);
  const dis = status === 'finalizing';
  W.button(ctx, L, hits, { id: 'result:share', x, y, w: third, h: sh, label: '分享', size: T.FS.bodyL, disabled: dis });
  W.button(ctx, L, hits, { id: 'result:challenge', x: x + third + gap, y, w: third, h: sh, label: '发起挑战', size: T.FS.bodyL, disabled: dis });
  W.button(ctx, L, hits, { id: 'result:save', x: x + 2 * (third + gap), y, w: third, h: sh, label: sv.label, size: T.FS.bodyL, disabled: dis || sv.disabled });
  y -= gap;
  const actionsTop = y;

  // ---- scrolling body between the capsule row and the actions
  const top = L.navBottom + L.u(4);
  const vpH = actionsTop - top;
  const natural = body(mockOf(ctx), vm, L, new Hits(), x, 0, cw);
  const scrollMax = Math.max(0, Math.ceil(natural + L.u(8) - vpH));
  const scrollY = clamp(typeof vm.scrollY === 'number' ? vm.scrollY : 0, 0, scrollMax);
  hits.scrollMax['result:scroll'] = scrollMax;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, L.W, vpH);
  ctx.clip();
  if (scrollMax > 0) hits.add('result:scroll', 0, top, L.W, vpH);
  hits.beginScroll({ x: 0, y: top, w: L.W, h: vpH }, -scrollY);
  // centre short content vertically when there is room
  const offset = scrollMax === 0 ? Math.max(0, (vpH - natural) * 0.3) : 0;
  ctx.translate(0, -scrollY);
  body(ctx, vm, L, hits, x, top + offset, cw);
  hits.endScroll();
  ctx.restore();
  W.scrollbar(ctx, L.x0 + cw + L.u(8), top, vpH, scrollY, scrollMax);
  return hits.result();
}

/** A drawing-free context for measuring: reuses measureText only. */
function mockOf(ctx) {
  const noop = function () {};
  return new Proxy(
    {},
    {
      get(t, p) {
        if (p === 'measureText') return (s) => ctx.measureText(s);
        if (p === 'createLinearGradient') return () => ({ addColorStop: noop });
        if (p === 'font') return ctx.font;
        return noop;
      },
      set(t, p, v) {
        if (p === 'font') ctx.font = v;
        return true;
      },
    }
  );
}

module.exports = { draw, body };
