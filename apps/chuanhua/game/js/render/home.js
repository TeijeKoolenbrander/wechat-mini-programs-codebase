/**
 * Home (spec 8.1). draw(ctx, vm, layout) -> hitAreas.
 *
 * vm = spec 12 Home model plus extras (CONTRACT.md):
 *   display, sheet (null|'howto'|'rules'|'strike'; when omitted it follows
 *   showHowToOnce / showRulesWarning), t (ms clock for the skeleton pulse),
 *   scrollY.
 * Hit ids: home:start, home:adStart, home:retry, home:groupLine, home:album,
 *   home:group, home:howto, home:settings, plus sheet ids.
 */

const T = require('./theme');
const W = require('./widgets');
const { page } = require('./page');
const C = T.COLORS;

function titleBlock(ctx, L, x, y, w) {
  const compact = L.compact || T.MODE.largeText;
  const brush = compact ? 56 : 104;
  const tSize = (compact ? 32 : 42) * (T.MODE.largeText ? 0.9 : 1);
  const cx = x + w / 2;
  if (compact) {
    const ty0 = y + tSize * 0.6;
    W.text(ctx, '传画接龙', cx - 14, ty0, { size: tSize, weight: 900, round: true, align: 'center', maxW: w - 80, color: C.ink, minSize: 26 });
    const tw0 = W.measure(ctx, '传画接龙', tSize, 900, true);
    W.brushBaton(ctx, cx - 14 + tw0 / 2 + 36, ty0 - 4, brush, -0.62);
    W.squiggle(ctx, cx - 14 - tw0 / 2, ty0 + tSize * 0.62, tw0, C.zhu);
    W.text(ctx, '看上一棒，画出来或猜出来', cx, ty0 + tSize * 0.62 + 24, { size: T.FS.body, weight: 600, color: C.sub, align: 'center', maxW: w });
    return tSize * 0.6 + tSize * 0.62 + 24 + 16;
  }
  W.brushBaton(ctx, cx + 96, y + brush * 0.38, brush, -0.62);
  // a few doodle sparks around the brush tip
  ctx.strokeStyle = C.orangeText;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  const sx = cx + (compact ? 106 : 142);
  const sy = y + (compact ? 6 : 12);
  [[0, -9, 0, -3], [8, -6, 4, -2], [10, 2, 4, 2]].forEach((p) => {
    ctx.beginPath();
    ctx.moveTo(sx + p[0], sy + p[1]);
    ctx.lineTo(sx + p[2], sy + p[3]);
    ctx.stroke();
  });
  const ty = y + brush * 0.62 + tSize * 0.55;
  W.text(ctx, '传画接龙', cx, ty, { size: tSize, weight: 900, round: true, align: 'center', maxW: w, color: C.ink, minSize: 28 });
  const tw = W.measure(ctx, '传画接龙', tSize, 900, true);
  W.squiggle(ctx, cx - Math.min(tw, w) / 2, ty + tSize * 0.62, Math.min(tw, w), C.zhu);
  const sub = '看上一棒，画出来或猜出来';
  W.text(ctx, sub, cx, ty + tSize * 0.62 + 24, { size: T.FS.body, weight: 600, color: C.sub, align: 'center', maxW: w });
  return brush * 0.62 + tSize * 0.55 + tSize * 0.62 + 24 + 16;
}

function noticeCard(ctx, L, x, y, w, text, kind) {
  const size = T.FS.body;
  const lh = Math.round(size * 1.45);
  const h = W.paragraphH(ctx, text, w - 56, lh, { size, weight: 700 }) + 24;
  W.fillRR(ctx, x, y, w, h, 14, kind === 'warn' ? C.orangeSoft : C.zhuSoft);
  W.strokeRR(ctx, x, y, w, h, 14, kind === 'warn' ? C.orangeText : C.zhuText, W.bw());
  W.iconStatus(ctx, x + 24, y + h / 2, 26, kind === 'warn' ? 'pending' : 'blocked');
  W.paragraph(ctx, text, x + 46, y + 12, w - 56, lh, { size, weight: 700, color: C.ink });
  return h;
}

function dailyCard(ctx, hits, vm, L, x, y, w) {
  const d = vm.daily || {};
  const state = vm.state || 'loading';
  const pad = L.u(14);
  const iw = w - 2 * pad;
  const size = T.FS.body;
  const dry = ctx; // same ctx; layout pass is only measuring because we draw in a second step
  void dry;
  // measure
  const prompts = (d.prompts || []).map((p) => p.text);
  const chipH = Math.round(T.FS.bodyL * 1.7);
  const rows = [];
  let cur = [];
  let cw = 0;
  prompts.forEach((t) => {
    const tw = W.measure(ctx, t, T.FS.bodyL, 700) + 20;
    if (cur.length && cw + tw + 8 > iw) {
      rows.push(cur);
      cur = [];
      cw = 0;
    }
    cur.push({ t, tw });
    cw += tw + 8;
  });
  if (cur.length) rows.push(cur);

  const head = Math.round(T.FS.bodyL * 1.7);
  let h = pad + head + 8;
  if (state === 'offline' || state === 'error') {
    h += Math.round(size * 1.5) + 8 + Math.round(W.btnH(L, true)) + pad;
  } else if (state === 'loading' && !prompts.length) {
    h += 22 + 12 + 22 + 12 + Math.round(size * 1.5) + pad;
  } else {
    h += rows.length * (chipH + 8);
    if (d.countText) h += Math.round(size * 1.5) + 2;
    if (vm.streakText) h += Math.round(size * 1.7) + 6;
    h += pad - 4;
  }

  W.card(ctx, x, y, w, h, { r: 16 });
  let cy = y + pad;
  W.text(ctx, '今日起点' + (d.dateText ? ' · ' + d.dateText : ''), x + pad, cy + head / 2, { size: T.FS.bodyL, weight: 800, round: true, maxW: iw });
  // sticky-tape accent
  W.tape(ctx, x + w - L.u(46), y + 2, L.u(54), 14, 0.12);
  cy += head + 8;

  if (state === 'offline' || state === 'error') {
    W.text(ctx, '需联网才能接龙', x + pad, cy + size * 0.75, { size, weight: 700, color: C.zhuText, maxW: iw });
    cy += Math.round(size * 1.5) + 8;
    W.button(ctx, L, hits, { id: 'home:retry', x: x + pad, y: cy, w: iw, h: W.btnH(L, true), label: '重试', kind: 'secondary' });
  } else if (state === 'loading' && !prompts.length) {
    W.skeleton(ctx, x + pad, cy, iw * 0.8, 22, vm.t, 11);
    W.skeleton(ctx, x + pad, cy + 34, iw * 0.55, 22, vm.t, 11);
    W.text(ctx, '正在取今日起点…', x + pad, cy + 34 + 34 + size * 0.75, { size, color: C.sub, maxW: iw });
  } else {
    rows.forEach((row) => {
      let cx = x + pad;
      row.forEach((c, i) => {
        W.chip(ctx, cx, cy, c.t, { size: T.FS.bodyL, h: chipH, fill: [C.orangeSoft, C.blueSoft, C.zhuSoft][i % 3], color: C.ink });
        cx += c.tw + 8;
      });
      cy += chipH + 8;
    });
    if (d.countText) {
      W.text(ctx, d.countText, x + pad, cy + size * 0.75, { size, weight: 600, color: C.sub, maxW: iw });
      cy += Math.round(size * 1.5) + 2;
    }
    if (vm.streakText) {
      const sh = Math.round(size * 1.7);
      W.chip(ctx, x + pad, cy + 2, vm.streakText, { size, h: sh, fill: C.blueSoft, color: C.blueText, border: C.blueText });
    }
  }
  return h;
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display); // sizes below depend on the mode
  const state = vm.state || 'loading';
  const start = vm.start || { label: '开一条接龙', sublabel: null, enabled: false, freeLeft: 0, adLeft: 0 };
  const unseen = (vm.album && vm.album.unseenReveals) || 0;
  const bh = W.btnH(L);
  const smallH = W.btnH(L, true);
  const rowH = unseen > 0 ? smallH + 8 : smallH;
  const gap = L.u(8);
  const showAd = state === 'ready' && start.freeLeft === 0 && start.adLeft > 0;
  const primaryH = start.sublabel ? Math.max(bh + L.u(12), 64) : bh;
  const footerH = primaryH + (showAd ? gap + smallH : 0) + gap + rowH + gap + smallH;

  const sheet = vm.sheet !== undefined ? vm.sheet : vm.showRulesWarning ? 'strike' : vm.showHowToOnce ? 'howto' : null;
  const v2 = Object.assign({}, vm, { sheet });

  return page(ctx, v2, L, {
    footerH,
    center: true,
    body: (c, h, y0, x, w) => {
      let y = y0 + L.u(4);
      y += titleBlock(c, L, x, y, w);
      y += L.u(6);
      if (vm.restriction && vm.restriction.text) y += noticeCard(c, L, x, y, w, vm.restriction.text, 'bad') + gap;
      if (vm.ugcPausedText) y += noticeCard(c, L, x, y, w, vm.ugcPausedText, 'warn') + gap;
      y += dailyCard(c, h, vm, L, x, y, w) + L.u(12);
      if (vm.groupLine && vm.groupLine.show) {
        const gh = Math.max(T.MIN_TAP, Math.round(T.FS.body * 2.6));
        W.fillRR(c, x, y, w, gh, 14, C.zhuSoft);
        W.strokeRR(c, x, y, w, gh, 14, C.zhuText, W.bw());
        W.text(c, vm.groupLine.text || '来自群聊', x + 14, y + gh / 2, { size: T.FS.body, weight: 800, color: C.zhuText, maxW: w - 52 });
        W.text(c, '›', x + w - 20, y + gh / 2 - 1, { size: T.FS.title, weight: 800, color: C.zhuText, align: 'center' });
        h.add('home:groupLine', x, y, w, gh);
        y += gh + 4;
      }
      return y - y0;
    },
    footer: (c, h, r) => {
      let y = r.y;
      W.button(c, L, h, { id: 'home:start', x: r.x, y, w: r.w, h: primaryH, label: start.label || '开一条接龙', sub: start.sublabel || null, kind: 'primary', disabled: !start.enabled || state !== 'ready' });
      y += primaryH;
      if (showAd) {
        y += gap;
        W.button(c, L, h, { id: 'home:adStart', x: r.x, y, w: r.w, h: smallH, label: '看视频再开一条 (剩 ' + start.adLeft + ')', kind: 'ad', size: T.FS.body });
        y += smallH;
      }
      y += gap;
      const bw2 = (r.w - gap) / 2;
      W.button(c, L, h, { id: 'home:album', x: r.x, y, w: bw2, h: rowH, label: '我的接龙', sub: unseen > 0 ? unseen + ' 条揭晓' : null, kind: 'secondary', size: T.FS.body });
      if (unseen > 0) {
        c.beginPath();
        c.arc(r.x + bw2 - 6, y + 4, 8, 0, Math.PI * 2);
        c.fillStyle = C.zhu;
        c.fill();
        c.strokeStyle = C.ink;
        c.lineWidth = 2;
        c.stroke();
      }
      W.button(c, L, h, { id: 'home:group', x: r.x + bw2 + gap, y, w: bw2, h: rowH, label: '本群接龙', kind: 'secondary', size: T.FS.body });
      y += rowH + gap;
      W.button(c, L, h, { id: 'home:howto', x: r.x, y, w: bw2, h: smallH, label: '玩法', kind: 'ghost', size: T.FS.body });
      W.button(c, L, h, { id: 'home:settings', x: r.x + bw2 + gap, y, w: bw2, h: smallH, label: '设置', kind: 'ghost', size: T.FS.body });
    },
  });
}

module.exports = { draw };
