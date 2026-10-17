/**
 * Home (spec 6.1; CONTRACT "home"). draw(ctx, vm, layout) -> hitAreas.
 * vm = Home (spec 10) + {display, features, settings, sheet: null|'howto'|'settings'|'rules', sheetScroll, scrollY, t, muted}.
 * Hit ids: home:daily (开始 / 继续 / 看结果 by daily.state), home:retry, home:host, home:archive, home:group, home:friends,
 * home:howto, home:sound, home:settings, home:groupBanner, home:scroll, plus the sheets' ids.
 *
 * Layout: the footer (声音 / 设置) is pinned to the bottom; above it a bottom-anchored stack: title, daily card, group banner,
 * 出一道题 / 往期刻度, 本群 / 好友榜 / 玩法. If the stack does not fit (large text, short screen) the title is dropped and the
 * stack scrolls under home:scroll with the daily card first.
 */

const T = require('./theme');
const W = require('./widgets');
const ruler = require('./ruler');
const howto = require('./howto');
const settings = require('./settings');
const { Hits } = require('./layout');
const C = T.COLORS;

/** Brand motif: a tape-measure strip with the ▼ you, ◆ nation and ● group markers, and the title. */
function titleBlock(ctx, L, x, y, w, h) {
  const stripW = Math.min(w * 0.72, L.u(260));
  const stripH = L.u(26);
  const sx = L.cx - stripW / 2;
  const syTop = y + Math.max(0, (h - (L.u(34) + stripH + L.u(14) + L.u(40))) / 2) + L.u(34);
  const m = ruler;
  // tape
  W.fillRR(ctx, sx, syTop, stripW, stripH, 6, C.tape);
  W.strokeRR(ctx, sx, syTop, stripW, stripH, 6, T.isHC() ? C.ink : C.tapeEdge, T.isHC() ? 2.5 : 1);
  ctx.strokeStyle = C.tick;
  for (let i = 0; i <= 20; i++) {
    const tx = sx + L.u(6) + ((stripW - L.u(12)) * i) / 20;
    ctx.lineWidth = i === 10 ? 2.5 : 1.3;
    ctx.beginPath();
    ctx.moveTo(tx, syTop + 1);
    ctx.lineTo(tx, syTop + stripH * (i === 10 ? 0.55 : i % 2 === 0 ? 0.36 : 0.22));
    ctx.stroke();
  }
  const px = (p) => sx + L.u(6) + ((stripW - L.u(12)) * p) / 100;
  m.drawGroup(ctx, px(26), syTop + stripH * 0.68, L.u(6));
  m.drawNation(ctx, px(70), syTop + stripH * 0.62, L.u(8));
  m.drawYou(ctx, px(58), syTop, L.u(22), {});
  const ty = syTop + stripH + L.u(14) + L.u(20);
  const size = L.u(34);
  const label = '群友刻度盘';
  const chars = Array.from(label);
  ctx.font = W.font(size, 800);
  const sp = size * 0.22;
  let total = -sp;
  const ws = chars.map((ch) => ctx.measureText(ch).width);
  ws.forEach((cw) => (total += cw + sp));
  let cx = L.cx - total / 2;
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  chars.forEach((ch, i) => {
    ctx.fillText(ch, cx, ty);
    cx += ws[i] + sp;
  });
}

/** Lines and primary action of the daily card by state. */
function dailyContent(vm) {
  const d = vm.daily || { state: 'loading' };
  const head = d.issueNo != null ? '每日刻度 · 第 ' + d.issueNo + ' 期' : '每日刻度';
  const extras = [];
  if (d.yesterdayText) extras.push(d.yesterdayText);
  if (d.streakText) extras.push(d.streakText);
  switch (d.state) {
    case 'available':
      return { head: head + ' · 5 张卡', extras, action: { id: 'home:daily', label: '开始' } };
    case 'inProgress':
      return { head, lines: ['已答 ' + (d.answered || 0) + '/5'], extras, action: { id: 'home:daily', label: '继续' } };
    case 'done':
      return { head, lines: d.scoreText ? [d.scoreText] : [], big: true, sub: '明日 0:00 换新卡 · 0:30 定分', extras, action: { id: 'home:daily', label: '看结果' } };
    case 'pendingSubmit':
      return { head, lines: ['答案待发送'], action: { id: 'home:retry', label: '重试' } };
    case 'error':
    case 'offline':
    case 'unavailable':
      return { head: '每日刻度', lines: ['今日卡片需联网获取'], action: { id: 'home:retry', label: '重试' } };
    default:
      return { head: '每日刻度', loading: true };
  }
}

function dailyCard(ctx, L, hits, vm, w) {
  const c = dailyContent(vm);
  const pad = L.u(16);
  const inner = w - 2 * pad;
  const lh = Math.round(T.FS.bodyL * 1.4);
  const bodyLh = Math.round(T.FS.body * 1.45);
  const bigSize = T.FS.title;
  const rows = [];
  rows.push({ kind: 'head', h: Math.round(T.FS.bodyL * 1.4) * W.wrap(ctx, c.head, inner, T.FS.bodyL, 800).length, t: c.head });
  if (c.loading) {
    rows.push({ kind: 'skel', h: L.u(18) });
    rows.push({ kind: 'loadText', h: lh, t: '正在取今日卡片…' });
  }
  (c.lines || []).forEach((s) => {
    const size = c.big ? bigSize : T.FS.bodyL;
    const n = W.wrap(ctx, s, inner, size, 800).length;
    rows.push({ kind: 'line', h: n * Math.round(size * 1.35), t: s, size });
  });
  if (c.sub) rows.push({ kind: 'sub', h: Math.round(T.FS.body * 1.45) * W.wrap(ctx, c.sub, inner, T.FS.body, 500).length, t: c.sub });
  (c.extras || []).forEach((s) => rows.push({ kind: 'extra', h: bodyLh * W.wrap(ctx, s, inner, T.FS.body, 600).length, t: s }));
  const bh = T.btn(L, 52);
  let h = pad * 2;
  rows.forEach((r) => (h += r.h + L.u(6)));
  if (c.action) h += bh + L.u(6);
  /**
   * The card as line-sized slices (for the scrolling layout, which may only cut between lines). The action goes right after
   * the primary lines, before the secondary extras, so the primary button is always in the first screenful.
   */
  function parts(x0) {
    const gp = L.u(6);
    const units = [];
    const wl = (t, size, weight, color, lineH) => {
      const lines = W.wrap(ctx, t, inner, size, weight);
      lines.forEach((ln, i) => units.push({ h: lineH + (i === lines.length - 1 ? gp : 0), draw: (x, y) => W.text(ctx, ln, x + pad, y + lineH / 2, { size, weight, color }) }));
    };
    units.push({ h: pad, draw: (x, y) => W.card(ctx, x, y, w, h, { fill: C.tile }) });
    rows.forEach((r) => {
      if (r.kind === 'head') wl(r.t, T.FS.bodyL, 800, C.primary, Math.round(T.FS.bodyL * 1.4));
      else if (r.kind === 'skel') units.push({ h: r.h + gp, draw: (x, y) => W.skeleton(ctx, x + pad, y, inner * 0.7, r.h, vm.t) });
      else if (r.kind === 'loadText') wl(r.t, T.FS.bodyL, 600, C.sub, r.h);
      else if (r.kind === 'line') wl(r.t, r.size, 800, C.ink, Math.round(r.size * 1.35));
      else if (r.kind === 'sub') wl(r.t, T.FS.body, 500, C.sub, Math.round(T.FS.body * 1.45));
    });
    if (c.action) units.push({ h: bh + gp, draw: (x, y) => W.button(ctx, L, hits, { id: c.action.id, x: x + pad, y, w: inner, h: bh, label: c.action.label, kind: 'primary' }) });
    rows.forEach((r) => {
      if (r.kind === 'extra') wl(r.t, T.FS.body, 600, C.sub, bodyLh);
    });
    units.push({ h: pad, draw: () => {} });
    void x0;
    return units;
  }
  return {
    h,
    parts,
    draw(x, y) {
      W.card(ctx, x, y, w, h, { fill: C.tile });
      let cy = y + pad;
      rows.forEach((r) => {
        if (r.kind === 'head') W.paragraph(ctx, r.t, x + pad, cy, inner, Math.round(T.FS.bodyL * 1.4), { size: T.FS.bodyL, weight: 800, color: C.primary });
        else if (r.kind === 'skel') W.skeleton(ctx, x + pad, cy, inner * 0.7, r.h, vm.t);
        else if (r.kind === 'loadText') W.text(ctx, r.t, x + pad, cy + r.h / 2, { size: T.FS.bodyL, weight: 600, color: C.sub });
        else if (r.kind === 'line') W.paragraph(ctx, r.t, x + pad, cy, inner, Math.round(r.size * 1.35), { size: r.size, weight: 800 });
        else if (r.kind === 'sub') W.paragraph(ctx, r.t, x + pad, cy, inner, Math.round(T.FS.body * 1.45), { size: T.FS.body, weight: 500, color: C.sub });
        else W.paragraph(ctx, r.t, x + pad, cy, inner, bodyLh, { size: T.FS.body, weight: 600, color: C.sub });
        cy += r.h + L.u(6);
      });
      if (c.action) W.button(ctx, L, hits, { id: c.action.id, x: x + pad, y: cy, w: inner, h: bh, label: c.action.label, kind: 'primary' });
    },
  };
}

function bannerBlock(ctx, L, hits, vm, w) {
  const txt = vm.group.bannerText || '来自群聊 · 查看本群今日默契';
  const lines = W.wrap(ctx, txt, w - L.u(44), T.FS.body, 700);
  const h = Math.max(T.btn(L, 46), lines.length * Math.round(T.FS.body * 1.4) + L.u(16));
  return {
    h,
    draw(x, y) {
      W.fillRR(ctx, x, y, w, h, L.u(12), C.tintGroup);
      W.strokeRR(ctx, x, y, w, h, L.u(12), C.group, T.isHC() ? 2.5 : 1.5);
      lines.forEach((ln, i) => W.text(ctx, ln, x + L.u(14), y + h / 2 + (i - (lines.length - 1) / 2) * Math.round(T.FS.body * 1.4), { size: T.FS.body, weight: 700, color: C.groupText }));
      W.text(ctx, '›', x + w - L.u(18), y + h / 2, { size: T.FS.title, weight: 700, color: C.groupText, align: 'center' });
      hits.add('home:groupBanner', x, y, w, h);
    },
  };
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display);
  const hits = new Hits();
  W.paper(ctx, L);

  // pinned footer: 声音 and 设置
  const fh = Math.max(T.MIN_TAP, T.minBtn());
  const fy = L.bottomEdge - L.bottomPad - fh + L.u(4);
  const muted = !!(vm.muted != null ? vm.muted : vm.settings && vm.settings.muted);
  W.iconSpeaker(ctx, L.x0 + L.u(14), fy + fh / 2, L.u(22), C.ink, muted);
  W.text(ctx, muted ? '声音 关' : '声音 开', L.x0 + L.u(34), fy + fh / 2, { size: T.FS.bodyL, weight: 700 });
  hits.add('home:sound', L.x0 - L.u(6), fy, L.u(130), fh);
  W.text(ctx, '设置', L.x0 + L.contentW - L.u(8), fy + fh / 2, { size: T.FS.bodyL, weight: 700, align: 'right' });
  hits.add('home:settings', L.x0 + L.contentW - L.u(96), fy, L.u(104), fh);

  const w = L.contentW;
  const gap = L.u(10);
  const bh = T.btn(L, 52);
  const area = { x: L.x0, y: L.navBottom + L.u(8), w, h: fy - L.u(8) - (L.navBottom + L.u(8)) };

  const card = dailyCard(ctx, L, hits, vm, w);
  const blocks = [];
  const titleMin = L.u(T.isLarge() ? 100 : 108);
  const showBanner = vm.group && vm.group.status === 'ok';
  const row3H = bh;
  const row2H = bh;
  let fixed = card.h + row2H + row3H + gap * 3;
  let banner = null;
  if (showBanner) {
    banner = bannerBlock(ctx, L, hits, vm, w);
    fixed += banner.h + gap;
  }
  const leftover = area.h - fixed;
  const withTitle = leftover >= titleMin;
  const titleH = Math.min(L.u(160), leftover);
  if (withTitle) blocks.push({ h: titleH, draw: (c, x, y, ww) => titleBlock(ctx, L, x, y, ww, titleH) });
  blocks.push({ h: card.h, draw: (c, x, y) => card.draw(x, y) });
  if (banner) blocks.push({ h: banner.h, draw: (c, x, y) => banner.draw(x, y) });
  blocks.push({
    h: row2H,
    draw: (c, x, y, ww) => {
      const bw = (ww - gap) / 2;
      W.button(ctx, L, hits, { id: 'home:host', x, y, w: bw, h: row2H, label: '出一道题' });
      W.button(ctx, L, hits, { id: 'home:archive', x: x + bw + gap, y, w: bw, h: row2H, label: '往期刻度' });
    },
  });
  blocks.push({
    h: row3H,
    draw: (c, x, y, ww) => {
      const bw = (ww - 2 * gap) / 3;
      [['home:group', '本群'], ['home:friends', '好友榜'], ['home:howto', '玩法']].forEach((b, i) =>
        W.button(ctx, L, hits, { id: b[0], x: x + i * (bw + gap), y, w: bw, h: row3H, label: b[1], size: T.FS.bodyL })
      );
    },
  });
  // bottom-anchored when it fits (thumb zone), scrolling when it does not
  const total = blocks.reduce((s, b, i) => s + b.h + (i ? gap : 0), 0);
  if (total <= area.h) {
    W.stack(ctx, L, hits, { x: area.x, y: area.y + area.h - total, w: area.w, h: total }, blocks, 0, 'home:scroll', gap);
  } else {
    // Does not fit (large text, short screen): the two button rows stay pinned at the bottom, the card and the group banner scroll
    // above them. The viewport is cut at a line boundary, so nothing is ever half visible at scroll 0; the card's action comes
    // before its secondary lines so it is always in the first screenful.
    const navH = row2H + gap + row3H + gap;
    const navTop = area.y + area.h - navH + gap;
    const units = card.parts();
    units[units.length - 1].h += banner ? gap : 0;
    if (banner) units.push({ h: banner.h, draw: (x, y) => banner.draw(x, y) });
    const contentH = units.reduce((n, u) => n + u.h, 0);
    const regionH = navTop - gap - area.y;
    let vpH = 0;
    for (let i = 0, acc = 0; i < units.length; i++) {
      acc += units[i].h;
      if (acc <= regionH) vpH = acc;
    }
    // a card whose first line is taller than the region cannot happen at the supported sizes; fall back to the full region
    if (vpH <= 0) vpH = regionH;
    if (contentH <= regionH) vpH = contentH;
    const vp = { x: area.x, y: navTop - gap - vpH, w: area.w, h: vpH };
    W.scrollBody(ctx, hits, vp, contentH, vm.scrollY || 0, 'home:scroll', () => {
      let y = vp.y;
      units.forEach((u) => {
        u.draw(vp.x, y);
        y += u.h;
      });
    });
    blocks[blocks.length - 2].draw(ctx, area.x, navTop, area.w);
    blocks[blocks.length - 1].draw(ctx, area.x, navTop + row2H + gap, area.w);
  }

  if (vm.sheet === 'howto') howto.draw(ctx, L, hits, vm);
  else if (vm.sheet === 'settings') settings.draw(ctx, L, hits, vm);
  else if (vm.sheet === 'rules') require('./clueSheets').rules(ctx, L, hits, { readOnly: true, sheetScroll: vm.sheetScroll }); // 发言规则, read-only (spec 6.12)
  return hits.result();
}

module.exports = { draw };
