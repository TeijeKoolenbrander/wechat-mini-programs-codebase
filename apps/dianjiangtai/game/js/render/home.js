/**
 * Home (spec 8.1). draw(ctx, vm, layout) -> hitAreas.
 *
 * vm = spec 13 Home model (+ v1 additions), plus optional extras (see CONTRACT.md):
 *   daily.variantLabel ('识人' on Sunday), daily.streak {current, text}
 *   nav.historyEnabled (default true)
 *   display {largeText, highContrast}
 *   sheet: null | 'howto' | 'settings'   which sheet is open
 *   scrollY: scroll offset of the upper area (large-text mode only)
 *   sheetScroll: scroll offset inside the settings sheet
 *   t: ms clock (skeleton pulse)
 * Hit ids: home:daily (出征 / 继续出征 / 查看战报, logic decides by state),
 *   home:retry, home:free, home:groupBoard, home:friendBoard, home:history,
 *   home:howto, home:sound, home:settings, home:groupBanner, home:scroll,
 *   plus sheet ids.
 *
 * Standard layout: bottom-anchored stack (thumb zone). Large text: the daily
 * card, 自由点将 and the footer stay pinned at the bottom; the group banner
 * and the board buttons (two rows of two) sit above and scroll if they do not
 * fit. The daily card text is centred in every state and mode.
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits, clamp } = require('./layout');
const howto = require('./howto');
const settings = require('./settings');
const { recordDigits } = require('./fmt');
const C = T.COLORS;

function variantOf(d) {
  return d.variantLabel || (d.variant === 'shiren' ? '识人' : null);
}

function boardButtons(ctx, L, hits, vm, x, y, cw) {
  const showHistory = !(vm.nav && vm.nav.historyEnabled === false);
  const items = [
    ['home:groupBoard', '群 榜'],
    ['home:friendBoard', '好友榜'],
  ];
  if (showHistory) items.push(['home:history', '往 期']);
  items.push(['home:howto', '玩 法']);
  const large = T.isLarge();
  const gap = L.u(large ? 10 : 6);
  const h = T.btn(L, 48);
  if (!large) {
    const bw = (cw - (items.length - 1) * gap) / items.length;
    items.forEach((b, i) => W.button(ctx, L, hits, { id: b[0], x: x + i * (bw + gap), y, w: bw, h, label: b[1], size: T.FS.bodyL }));
    return h;
  }
  const bw = (cw - gap) / 2;
  items.forEach((b, i) => W.button(ctx, L, hits, { id: b[0], x: x + (i % 2) * (bw + gap), y: y + Math.floor(i / 2) * (h + gap), w: bw, h, label: b[1], size: T.FS.bodyL }));
  return Math.ceil(items.length / 2) * h + (Math.ceil(items.length / 2) - 1) * gap;
}

function groupBanner(ctx, L, hits, x, y, cw, measureOnly) {
  const large = T.isLarge();
  const label = '来自群聊 · 查看本群今日排行';
  const lines = large ? W.wrap(ctx, label, cw - L.u(44), T.FS.body, 700, false).slice(0, 2) : [label];
  const bh = large ? Math.max(T.btn(L, 48), lines.length * L.u(28) + L.u(18)) : L.u(46);
  if (measureOnly) return bh;
  W.fillRR(ctx, x, y, cw, bh, L.u(10), C.tintSeal);
  W.strokeRR(ctx, x, y, cw, bh, L.u(10), C.seal, T.isHC() ? 2.5 : 1.5);
  lines.forEach((ln, i) => W.text(ctx, ln, x + L.u(14), y + bh / 2 + (i - (lines.length - 1) / 2) * L.u(28), { size: T.FS.body, weight: 700, color: C.seal, maxW: cw - L.u(44) }));
  W.text(ctx, '›', x + cw - L.u(18), y + bh / 2, { size: T.FS.title, weight: 700, color: C.seal, align: 'center' });
  hits.add('home:groupBanner', x, y - (L.u(48) - bh) / 2, cw, Math.max(bh, L.u(48)));
  return bh;
}

function titleBlock(ctx, L, top, avail) {
  const titleScale = Math.max(0.62, Math.min(1.25, avail / L.u(150)));
  const seal = L.u(58) * titleScale;
  const tSize = L.u(38) * titleScale;
  const blockH = seal + L.u(10) * titleScale + tSize;
  let by = top + Math.max(0, (avail - blockH) / 2);
  W.sealStamp(ctx, L.cx, by + seal / 2, seal, '点将', '', { rotate: -6 });
  by += seal + L.u(10) * titleScale;
  W.spaced(ctx, '点 将 台', L.cx, by + tSize / 2, { size: tSize, weight: 800, serif: true, color: C.ink, align: 'center', spacing: tSize * 0.28 });
}

/** Pinned to the very bottom of the page (L.footer, see layout.js). */
function footer(ctx, L, hits, vm, x, cw) {
  const fy = L.footer.textY;
  const tapY = L.footer.tapY;
  W.link(ctx, L, hits, { id: 'home:sound', x, y: fy, tapY, label: '声音 ' + (vm.muted ? '关' : '开'), icon: 'speaker', muted: vm.muted, color: C.sub, size: T.FS.body });
  W.link(ctx, L, hits, { id: 'home:settings', x: x + cw, y: fy, tapY, label: '隐私与设置', align: 'right', color: C.sub, size: T.FS.body });
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display);
  const hits = new Hits();
  const d = vm.daily || { state: 'loading' };
  W.paper(ctx, L);
  if (T.isLarge()) drawLarge(ctx, vm, L, hits, d);
  else drawStandard(ctx, vm, L, hits, d);

  if (vm.sheet === 'howto') howto.drawInto(ctx, L, hits, vm.sheetScroll);
  else if (vm.sheet === 'settings') settings.drawInto(ctx, vm, L, hits);
  return hits.result();
}

function drawStandard(ctx, vm, L, hits, d) {
  const gap = L.u(L.compact ? 8 : 12);
  const cw = L.contentW;
  const x = L.x0;

  // ---- bottom-anchored stack (thumb zone) ----
  footer(ctx, L, hits, vm, x, cw);
  let y = L.footer.top - L.u(4);

  // 群榜 / 好友榜 / 往期 / 玩法
  const rowH = boardButtons(ctx, L, hits, vm, x, y - T.btn(L, 48), cw);
  y -= rowH;
  y -= gap;

  // 自由点将
  const freeH = L.u(L.compact ? 50 : 54);
  y -= freeH;
  W.button(ctx, L, hits, { id: 'home:free', x, y, w: cw, h: freeH, label: '自由点将 · 不限次', size: T.FS.bodyL + 1 });
  y -= gap;

  // daily card
  const cardH = dailyCardHeight(ctx, L, d);
  y -= cardH;
  drawDailyCard(ctx, vm, L, hits, d, x, y, cw, cardH);
  y -= gap;

  // group banner
  if (vm.hasGroupContext) {
    const bh = groupBanner(ctx, L, hits, x, y - L.u(46), cw, false);
    y -= bh + gap;
  }

  // ---- title block fills what is left above ----
  const top = L.navBottom + L.u(8);
  titleBlock(ctx, L, top, y - top);
}

function drawLarge(ctx, vm, L, hits, d) {
  const gap = L.u(L.compact ? 8 : 12);
  const cw = L.contentW;
  const x = L.x0;
  footer(ctx, L, hits, vm, x, cw);
  let y = L.footer.top - L.u(4);

  const freeH = T.btn(L, 54);
  y -= freeH;
  W.button(ctx, L, hits, { id: 'home:free', x, y, w: cw, h: freeH, label: '自由点将 · 不限次', size: T.FS.bodyL });
  y -= gap;

  const cardH = dailyCardHeight(ctx, L, d);
  y -= cardH;
  drawDailyCard(ctx, vm, L, hits, d, x, y, cw, cardH);
  y -= gap;

  // upper area: [title] [group banner] [board buttons], scrolls when it does not fit
  const top = L.navBottom + L.u(6);
  const areaH = y - top;
  const btnRows = Math.ceil((vm.nav && vm.nav.historyEnabled === false ? 3 : 4) / 2);
  const bh = T.btn(L, 48);
  const rowsH = btnRows * bh + (btnRows - 1) * L.u(10);
  const banH = vm.hasGroupContext ? groupBanner(ctx, L, hits, x, 0, cw, true) + gap : 0;
  const bodyH = banH + rowsH;
  const titleH = L.u(112);
  const withTitle = bodyH + titleH + gap <= areaH;
  const contentH = bodyH + (withTitle ? titleH + gap : 0);
  const area = { x: 0, y: top, w: L.W, h: areaH };
  if (contentH <= areaH) {
    // everything fits: bottom-align it just above the pinned part
    let cy = y - bodyH;
    if (withTitle) titleBlock(ctx, L, top, cy - top - gap);
    if (vm.hasGroupContext) {
      groupBanner(ctx, L, hits, x, cy, cw, false);
      cy += banH;
    }
    boardButtons(ctx, L, hits, vm, x, cy, cw);
  } else {
    W.scrollBody(ctx, hits, area, bodyH, vm.scrollY, 'home:scroll', () => {
      let cy = top;
      if (vm.hasGroupContext) {
        groupBanner(ctx, L, hits, x, cy, cw, false);
        cy += banH;
      }
      boardButtons(ctx, L, hits, vm, x, cy, cw);
    });
  }
}

function statusFor(d) {
  let sub = '全服同一手令牌，每日一战';
  let label = '出 征';
  let id = 'home:daily';
  let kind = 'primary';
  let disabled = false;
  let line = null; // emphasised middle line
  switch (d.state) {
    case 'loading':
      sub = null;
      disabled = true;
      kind = 'secondary';
      break;
    case 'inProgress':
      line = '第 ' + (d.round || 1) + ' / 5 轮';
      label = '继续出征';
      break;
    case 'done':
      line = '今日 ' + recordDigits(d.record) + (d.bandLabel ? ' · ' + d.bandLabel : '');
      sub = '明日 0:00 换新令';
      label = '查看战报';
      break;
    case 'pendingSubmit':
      line = '战报待发送';
      sub = '网络不通，稍后会自动重试';
      label = '重 试';
      id = 'home:retry';
      break;
    case 'error':
    case 'offline':
      line = '今日军令需联网获取';
      sub = '自由点将不受影响';
      label = '重 试';
      id = 'home:retry';
      break;
    default:
      break;
  }
  return { sub, label, id, kind, disabled, line };
}

function cardMetrics(ctx, L, d) {
  const large = T.isLarge();
  const compact = L.compact;
  const streak = d.streak && d.streak.text && d.streak.current >= 2;
  const pad = L.u(compact && !large ? 12 : 14);
  const issue = d.issueNo != null ? '今日军令 · 第 ' + d.issueNo + ' 期' : '今日军令';
  const variant = variantOf(d);
  const need = variant ? W.measure(ctx, issue, T.FS.title, 800, true) + W.measure(ctx, variant, T.FS.body, 800, true) + L.u(24) : 0;
  const badgeRow = variant && (large || need > L.contentW - 2 * pad) ? 1 : 0;
  const rowH = L.u(large ? 32 : compact ? 22 : 26);
  const slots = 2 + (streak ? 1 : 0) + badgeRow;
  return {
    pad,
    titleH: L.u(large ? 40 : compact ? 28 : 30),
    rowH,
    slots,
    gap: L.u(large ? 10 : compact ? 6 : 8),
    btnH: T.btn(L, compact ? 52 : 56),
    streak: !!streak,
    badgeRow,
  };
}

function dailyCardHeight(ctx, L, d) {
  const m = cardMetrics(ctx, L, d);
  return m.pad + m.titleH + m.slots * m.rowH + m.gap + m.btnH + m.pad;
}

function drawDailyCard(ctx, vm, L, hits, d, x, y, w, h) {
  const m = cardMetrics(ctx, L, d);
  W.card(ctx, x, y, w, h, { shadow: true });
  const ix = x + m.pad;
  const iw = w - 2 * m.pad;
  const mx = ix + iw / 2;
  const issue = d.issueNo != null ? '今日军令 · 第 ' + d.issueNo + ' 期' : '今日军令';
  const variant = variantOf(d);
  const ty = y + m.pad + m.titleH / 2;
  const tsize = T.FS.title;
  const tw = W.measure(ctx, issue, tsize, 800, true);
  const pillW = variant ? W.measure(ctx, variant, T.FS.body, 800, true) + L.u(16) : 0;
  if (variant && !m.badgeRow) {
    const total = tw + L.u(8) + pillW;
    const sx = mx - total / 2;
    W.text(ctx, issue, sx, ty, { size: tsize, weight: 800, serif: true });
    W.pill(ctx, L, sx + tw + L.u(8), ty, variant, { size: T.FS.body });
  } else {
    W.text(ctx, issue, mx, ty, { size: tsize, weight: 800, serif: true, maxW: iw, align: 'center', minSize: T.FS.body });
  }

  const st = statusFor(d);
  let ry = y + m.pad + m.titleH;
  const rowC = () => ry + m.rowH / 2;
  if (m.badgeRow) {
    W.pill(ctx, L, mx, rowC(), variant, { size: T.FS.body, align: 'center' });
    ry += m.rowH;
  }

  if (d.state === 'loading') {
    W.skeleton(ctx, ix + iw * 0.15, ry + m.rowH * 0.1, iw * 0.7, m.rowH * 0.7, vm.t, 6);
    ry += m.rowH;
    W.text(ctx, '正在取今日军令…', mx, ry + m.rowH / 2, { align: 'center', size: T.FS.body, color: C.sub, maxW: iw });
    ry += m.rowH;
  } else {
    const warn = d.state === 'pendingSubmit' || d.state === 'error' || d.state === 'offline';
    if (st.line) {
      W.text(ctx, st.line, mx, rowC(), { size: T.FS.bodyL + 2, weight: 800, color: warn ? C.seal : C.ink, serif: true, maxW: iw, align: 'center' });
      ry += m.rowH;
    }
    if (st.sub) {
      W.text(ctx, st.sub, mx, rowC(), { size: T.FS.body, color: C.sub, maxW: iw, align: 'center' });
      ry += m.rowH;
    }
  }
  if (m.streak) {
    W.text(ctx, d.streak.text, mx, rowC(), { size: T.FS.body, weight: 700, color: C.seal, maxW: iw, align: 'center' });
  }
  W.button(ctx, L, hits, { id: st.id, x: ix, y: y + h - m.pad - m.btnH, w: iw, h: m.btnH, label: st.label, kind: st.kind, disabled: st.disabled });
}

module.exports = { draw, clamp };
