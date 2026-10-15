/**
 * Bottom sheets shared by several screens: 玩法 (howto), 设置 (settings),
 * 这张卡有问题? (report) and 全国分布 (distribution). Each draws a scrim, so
 * draw it last (after the screen's own content).
 */

const T = require('./theme');
const W = require('./widgets');
const R = require('./ruler');
const K = require('./chrome');
const C = T.C;

// ---------------------------------------------------------------- howto

const HOWTO_LINES = [
  ['1', '看卡片', '一条刻度，两头是反义词，中间放一样东西。'],
  ['2', '拖指针', '手指按在刻度尺上，想放哪儿就拖到哪儿，松手就定。'],
  ['3', '看揭晓', '全国、群友怎么放的？看看你们有多同频。'],
];

function drawHowto(ctx, L, hits, vm) {
  const bh = K.btnH(L);
  const sh = Math.min(L.H - L.navBottom, L.u(600));
  const s = W.sheet(ctx, L, hits, { h: sh, title: '玩法' });
  const footTop = s.bottom - bh;
  W.scrollView(ctx, L, hits, {
    x: s.sheetX,
    y: s.top,
    w: s.sheetW,
    h: footTop - L.u(8) - s.top,
    scroll: vm.sheetScroll || 0,
    id: 'sheet:list',
    draw(c, h) {
      let y = s.top + L.u(4);
      const t = vm.t || 0;
      const needle = 50 + 30 * Math.sin(t / 800);
      const r = R.drawRuler(c, L, h, { y, x: s.x, w: s.w, left: '冷', right: '热', needle: Math.round(needle), lift: 0.4, interactive: false });
      y = r.bottom + L.u(12);
      HOWTO_LINES.forEach((ln) => {
        const dia = L.u(30);
        W.fillRR(c, s.x, y, dia, dia, dia / 2, C.primary);
        W.text(c, ln[0], s.x + dia / 2, y + dia / 2 + 1, { size: W.fs(L, 'bodyL'), weight: 800, color: C.primaryInk, align: 'center' });
        W.text(c, ln[1], s.x + dia + L.u(10), y + dia / 2, { size: W.fs(L, 'bodyL'), weight: 800 });
        const ph = W.paragraph(c, ln[2], s.x + dia + L.u(10), y + dia + L.u(2), s.w - dia - L.u(10), W.fs(L, 'body') * 1.45, { size: W.fs(L, 'body') });
        y += Math.max(dia, dia + L.u(2) + ph) + L.u(12);
      });
      return y;
    },
  });
  W.button(ctx, L, hits, { id: 'sheet:close', x: s.x, y: footTop, w: s.w, h: bh, label: '知道了', kind: 'primary' });
}

// ------------------------------------------------------------- settings

function row(ctx, L, hits, s, y, id, label, state, o) {
  o = o || {};
  const rh = o.sub ? L.u(T.MODE.large ? 88 : 74) : Math.max(L.u(60), T.MIN_TAP + L.u(8));
  const h = rh;
  W.fillRR(ctx, s.x, y, s.w, h - L.u(8), L.u(12), C.card);
  W.strokeRR(ctx, s.x, y, s.w, h - L.u(8), L.u(12), T.MODE.hc ? C.ink : C.line, T.MODE.hc ? 2 : 1.5);
  const inner = h - L.u(8);
  const ty = o.sub ? y + inner * 0.3 : y + inner / 2;
  W.text(ctx, label, s.x + L.u(14), ty, { size: W.fs(L, 'bodyL'), weight: 700, maxW: s.w - L.u(14) - L.u(110) });
  if (o.sub) W.text(ctx, o.sub, s.x + L.u(14), y + inner * 0.72, { size: W.fs(L, 'body'), color: C.sub, maxW: s.w - L.u(28) });
  if (o.toggle != null) {
    const tx = s.x + s.w - L.u(14) - L.u(54);
    K.toggle(ctx, L, tx, ty, o.toggle);
    W.text(ctx, o.toggle ? '开' : '关', tx - L.u(8), ty, { size: W.fs(L, 'body'), weight: 700, align: 'right', color: C.sub });
  } else if (o.action) {
    W.text(ctx, o.action, s.x + s.w - L.u(14), ty, { size: W.fs(L, 'body'), weight: 800, align: 'right', color: C.youText });
  } else W.iconChevron(ctx, s.x + s.w - L.u(20), ty, L.u(14), C.sub, 'right');
  if (id) hits.add(id, s.x, y, s.w, Math.max(T.MIN_TAP, inner));
  return y + h;
}

function drawSettings(ctx, L, hits, vm) {
  const st = vm.settings || {};
  const s = W.sheet(ctx, L, hits, { h: L.H - L.navBottom, title: '设置' });
  W.scrollView(ctx, L, hits, {
    x: s.sheetX,
    y: s.top,
    w: s.sheetW,
    h: s.bottom - s.top,
    scroll: vm.sheetScroll || 0,
    id: 'sheet:list',
    draw(c, h) {
      let y = s.top + L.u(4);
      y = row(c, L, h, s, y, 'settings:sound', '声音', null, { toggle: !st.muted });
      y = row(c, L, h, s, y, 'settings:largeText', '大字模式', null, { toggle: !!st.largeText, sub: '文字和按钮更大' });
      y = row(c, L, h, s, y, 'settings:highContrast', '高对比度', null, { toggle: !!st.highContrast, sub: '白底黑字，标记更深' });
      const on = st.friendScope === 'granted';
      y = row(c, L, h, s, y, on ? null : 'settings:openSetting', '好友排行：' + (on ? '已开启' : '未开启'), null, { action: on ? null : '去设置', sub: on ? '可显示好友和群友昵称' : '开启后可显示昵称' });
      y = row(c, L, h, s, y, 'settings:privacy', '用户隐私保护指引', null, { sub: st.privacy === 'agreed' ? '已同意' : st.privacy === 'denied' ? '未同意' : null });
      y = row(c, L, h, s, y, 'settings:feedback', '联系我们 / 反馈', null, {});
      return y + L.u(8);
    },
  });
}

// --------------------------------------------------------------- report

function drawReport(ctx, L, hits) {
  const bh = K.btnH(L);
  const s = W.sheet(ctx, L, hits, { h: L.u(60) + bh * 4 + L.u(10) * 4 + L.u(60), title: '这张卡有问题？' });
  let y = s.top;
  [
    ['report:inappropriate', '不合适'],
    ['report:ambiguous', '有歧义'],
    ['report:typo', '有错字'],
  ].forEach((b) => {
    W.button(ctx, L, hits, { id: b[0], x: s.x, y, w: s.w, h: bh, label: b[1] });
    y += bh + L.u(10);
  });
  W.button(ctx, L, hits, { id: 'sheet:close', x: s.x, y, w: s.w, h: bh, label: '取消', kind: 'ghost' });
}

// ---------------------------------------------------------- distribution

function histBlock(ctx, L, x, y, w, row, hist) {
  const ps = W.fs(L, 'body');
  W.text(ctx, row.prompt, x, y + ps * 0.8, { size: ps, weight: 800, maxW: w * 0.6 });
  W.text(ctx, row.left + ' ↔ ' + row.right, x + w, y + ps * 0.8, { size: ps, color: C.sub, align: 'right', maxW: w * 0.4 });
  const top = y + ps * 1.7 + L.u(14);
  const bh = L.u(44);
  const bins = hist && hist.length ? hist : new Array(21).fill(0);
  const max = Math.max(1, Math.max.apply(null, bins));
  const gap = L.u(2);
  const bw = (w - gap * 20) / 21;
  const youBin = Math.min(20, Math.round(row.you / 5));
  for (let i = 0; i < 21; i++) {
    const hh = Math.max(L.u(3), (bins[i] / max) * bh);
    ctx.fillStyle = C.nation;
    ctx.fillRect(x + i * (bw + gap), top + bh - hh, bw, hh);
    if (T.MODE.hc) {
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + i * (bw + gap), top + bh - hh, bw, hh);
    }
  }
  const yx = x + youBin * (bw + gap) + bw / 2;
  R.pointer(ctx, yx, top - L.u(1), L.u(7), C.you);
  ctx.fillStyle = C.ink;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(x, top + bh, w, 1.5);
  ctx.globalAlpha = 1;
  return top + bh + L.u(14);
}

function drawDistribution(ctx, L, hits, vm) {
  const s = W.sheet(ctx, L, hits, { h: L.H - L.navBottom, title: '全国分布 · 实时' });
  const rows = vm.rows || [];
  const hist = (vm.distribution && vm.distribution.hist) || [];
  W.scrollView(ctx, L, hits, {
    x: s.sheetX,
    y: s.top,
    w: s.sheetW,
    h: s.bottom - s.top,
    scroll: vm.sheetScroll || 0,
    id: 'sheet:list',
    draw(c) {
      let y = s.top + L.u(2);
      W.text(c, '▼ 是你放的位置', s.x, y + L.u(10), { size: W.fs(L, 'body'), color: C.sub });
      y += L.u(30);
      rows.forEach((r, i) => {
        y = histBlock(c, L, s.x, y, s.w, r, hist[i]);
      });
      return y + L.u(8);
    },
  });
}

module.exports = { drawHowto, drawSettings, drawReport, drawDistribution };
