/**
 * Typed-clue sheets (spec 6.12; D-2, PD-36): the 发言规则 sheet, the one-time strike warning and the 举报 reason sheet. Copied in shape
 * from 传画接龙's rules / warning / report layers and drawn in this game's sheet look (W.sheet). Drawn over the create screen (rules,
 * warn), the home screen (rules, read-only from 设置) and the round screen (report); the caller draws the screen below first.
 *
 * Hit ids: rules:agree, rules:decline, rules:privacy, rules:terms, rules:ok, warn:rules, warn:ok, clueReport:reason:<porn|politics|abuse|ads|other>,
 * clueReport:submit, clueReport:cancel, plus sheet:close / sheet:list / sheet:body (structural).
 * No pre-ticked box: agreeing is the explicit tap on 同意并写提示. The report sheet has no text field (no new UGC).
 */

const T = require('./theme');
const W = require('./widgets');
const C = T.COLORS;

/** 发言规则 bullets (spec 6.12; the signed-off wording is release's check, AC 100) */
const RULES_BULLETS = [
  '你写的提示会先经过内容安全审核，通过后才给群友看',
  '不写数字、位置，也不写刻度两头的词',
  '不写色情低俗、政治、辱骂、广告和联系方式',
  '违规提示会被隐藏，多次违规将暂时不能自己写提示',
  '看到不合适的提示，请点「举报」',
];
const REPORT_LABELS = { porn: '色情低俗', politics: '政治敏感', abuse: '辱骂攻击', ads: '广告引流', other: '其他不适' };
const WARN_TEXT = '你写的提示没有通过审核。请遵守发言规则，多次违规将暂时不能自己写提示。';

/** Two buttons side by side (40 / 60) or stacked (large text, narrow phones). Returns the pinned height. */
const stackedButtons = () => T.isLarge();
function pinnedHeight(L) {
  const bh = T.btn(L, 52);
  return stackedButtons(L) ? 2 * bh + L.u(10) : bh;
}
function drawPair(ctx, L, hits, x, y, w, secondary, primary) {
  const bh = T.btn(L, 52);
  if (stackedButtons(L)) {
    W.button(ctx, L, hits, Object.assign({ x, y, w, h: bh, kind: 'primary' }, primary));
    W.button(ctx, L, hits, Object.assign({ x, y: y + bh + L.u(10), w, h: bh, kind: 'secondary' }, secondary));
    return;
  }
  const gap = L.u(12);
  const w1 = (w - gap) * 0.4;
  W.button(ctx, L, hits, Object.assign({ x, y, w: w1, h: bh, kind: 'secondary' }, secondary));
  W.button(ctx, L, hits, Object.assign({ x: x + w1 + gap, y, w: w - w1 - gap, h: bh, kind: 'primary' }, primary));
}

/** Scroll affordance: a fade over the bottom of the scroll area with a hint, while more content is below. */
function fade(ctx, L, vp, sc, maxScroll, areaBottom) {
  if (sc >= maxScroll - 2) return;
  const fh = L.u(30);
  const y = vp.y + vp.h - fh;
  const g = ctx.createLinearGradient(0, y, 0, y + fh);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, C.sheet);
  ctx.fillStyle = g;
  ctx.fillRect(vp.x - 4, y, vp.w + 8, fh);
  // the hint sits in the strip between the cut line and the links (never over a text line); the scrollbar and the fade stay either way
  const strip = areaBottom - (vp.y + vp.h);
  const hh = Math.round(T.FS.body * 1.3);
  if (strip >= hh) W.text(ctx, '下滑看完规则 ↓', vp.x + vp.w / 2, vp.y + vp.h + strip / 2, { size: T.FS.body, weight: 700, color: C.sub, align: 'center' });
  else W.text(ctx, '↓', vp.x + vp.w - L.u(14), vp.y + vp.h - L.u(10), { size: T.FS.body, weight: 800, color: C.sub, align: 'center' });
}

/** The sheet shell: scrim, title, a scrolling block list and a pinned button area. */
function shell(ctx, L, hits, o) {
  const sheetW = Math.min(L.W, 560);
  const pinnedH = o.pinnedH;
  const total = L.u(T.isLarge() ? 78 : 70) + o.blocks.reduce((n, b, i) => n + b.h + (i ? L.u(10) : 0), 0) + pinnedH + L.u(16) + L.bottomPad + (L.H - L.bottomEdge);
  const s = W.sheet(ctx, L, hits, { h: Math.min(total, L.H - L.navBottom), title: o.title, closeId: o.closeId });
  const area = { x: s.x, y: s.top, w: s.w, h: s.bottom - s.top - pinnedH - L.u(10) };
  const info = W.stack(ctx, L, hits, area, o.blocks, o.scroll || 0, 'sheet:list', L.u(10));
  const maxScroll = Math.max(0, info.total - info.vp.h);
  const sc = Math.max(0, Math.min(o.scroll || 0, maxScroll));
  if (o.fade && maxScroll > 0) fade(ctx, L, info.vp, sc, maxScroll, area.y + area.h);
  o.drawPinned(s.x, s.bottom - pinnedH, s.w, { maxScroll, atEnd: sc >= maxScroll - 2, vp: info.vp });
  void sheetW;
  return s;
}

/** 发言规则. vm: {readOnly?, agreeing?, sheetScroll?} */
function rules(ctx, L, hits, vm) {
  const lh = Math.round(T.FS.bodyL * 1.5);
  const sheetW = Math.min(L.W, 560);
  const textW = sheetW - 2 * L.pad - L.u(20);
  // one block per wrapped LINE: the scroll area is cut at a line boundary (no half-visible line), so it ends less than one line above
  // the links and there is no dead gap (B3)
  const blocks = [];
  RULES_BULLETS.forEach((b, bi) => {
    const lines = W.wrap(ctx, b, textW, T.FS.bodyL, 500);
    lines.forEach((ln, i) => {
      blocks.push({
        h: lh,
        gap: i ? 0 : undefined,
        draw: (c, x, y, w) => {
          if (!i) W.text(c, '·', x + L.u(6), y + lh / 2, { size: T.FS.bodyL, weight: 800, color: C.primary });
          W.text(c, ln, x + L.u(20), y + lh / 2, { size: T.FS.bodyL, weight: 500, maxW: w - L.u(20) });
        },
      });
    });
    void bi;
  });
  // 《用户协议》 and 《用户隐私保护指引》 side by side, stacked when they do not fit (each link keeps a 48 pt tap band)
  const sideBySide = W.measure(ctx, '《用户协议》', T.FS.body, 700) + W.measure(ctx, '《用户隐私保护指引》', T.FS.body, 700) + L.u(40) <= sheetW - 2 * L.pad;
  const linksH = sideBySide ? T.MIN_TAP : 2 * T.MIN_TAP;
  const drawLinks = (x, y) => {
    const a = W.link(ctx, L, hits, { id: 'rules:terms', x, y: y + T.MIN_TAP / 2, label: '《用户协议》', size: T.FS.body });
    if (sideBySide) W.link(ctx, L, hits, { id: 'rules:privacy', x: x + a + L.u(24), y: y + T.MIN_TAP / 2, label: '《用户隐私保护指引》', size: T.FS.body });
    else W.link(ctx, L, hits, { id: 'rules:privacy', x, y: y + T.MIN_TAP * 1.5, label: '《用户隐私保护指引》', size: T.FS.body });
  };
  const bh = T.btn(L, 52);
  const readOnly = !!vm.readOnly;
  return shell(ctx, L, hits, {
    title: '发言规则',
    blocks,
    scroll: vm.sheetScroll,
    fade: true,
    pinnedH: linksH + (readOnly ? bh : pinnedHeight(L)),
    drawPinned: (x, y, w, info) => {
      // the links sit next to the buttons, outside the scroll area, so they are always visible
      drawLinks(x, y);
      y += linksH;
      if (readOnly) W.button(ctx, L, hits, { id: 'rules:ok', x, y, w, h: bh, label: '知道了', kind: 'primary' });
      else {
        // 同意并写提示 is enabled once the whole text has been scrolled to the end (or it fits): the agreement is read, not just tapped
        drawPair(ctx, L, hits, x, y, w, { id: 'rules:decline', label: '先用提示词' }, { id: 'rules:agree', label: vm.agreeing ? '请稍等…' : '同意并写提示', disabled: !!vm.agreeing || !info.atEnd });
      }
    },
  });
}

/** One-time strike warning. vm: {sheetScroll?} */
function warn(ctx, L, hits, vm) {
  const lh = Math.round(T.FS.bodyL * 1.55);
  const sheetW = Math.min(L.W, 560);
  const lines = W.wrap(ctx, WARN_TEXT, sheetW - 2 * L.pad, T.FS.bodyL, 500);
  const blocks = [{ h: lines.length * lh, draw: (c, x, y, w) => W.paragraph(c, WARN_TEXT, x, y, w, lh, { size: T.FS.bodyL, weight: 500 }) }];
  return shell(ctx, L, hits, {
    title: '友情提醒',
    blocks,
    scroll: vm.sheetScroll,
    pinnedH: pinnedHeight(L),
    drawPinned: (x, y, w) => drawPair(ctx, L, hits, x, y, w, { id: 'warn:rules', label: '查看发言规则' }, { id: 'warn:ok', label: '知道了' }),
  });
}

/** 举报这个提示. rs: {reasons, sending, selected} */
function report(ctx, L, hits, rs, vm) {
  const reasons = rs.reasons && rs.reasons.length ? rs.reasons : Object.keys(REPORT_LABELS);
  const rowH = Math.max(L.u(52), T.minBtn());
  const introH = Math.round(T.FS.body * 1.5);
  const blocks = [{ h: introH, draw: (c, x, y) => W.text(c, '选一个原因，不用写别的。', x, y + introH / 2, { size: T.FS.body, color: C.sub }) }];
  reasons.forEach((r) => {
    blocks.push({
      h: rowH,
      draw: (c, x, y, w) => {
        const on = rs.selected === r;
        W.fillRR(c, x, y, w, rowH, L.u(12), on ? C.tintPrimary : C.tile);
        W.strokeRR(c, x, y, w, rowH, L.u(12), on ? C.primary : T.isHC() ? C.ink : C.line, on ? 2.5 : T.isHC() ? 2 : 1.5);
        const rx = x + L.u(24);
        const ry = y + rowH / 2;
        c.beginPath();
        c.arc(rx, ry, L.u(11), 0, Math.PI * 2);
        c.fillStyle = on ? C.primary : C.tile;
        c.fill();
        c.strokeStyle = C.ink;
        c.lineWidth = 2;
        c.stroke();
        if (on) W.iconCheck(c, rx, ry, L.u(13), C.primaryInk);
        W.text(c, REPORT_LABELS[r] || r, x + L.u(48), ry, { size: T.FS.bodyL, weight: on ? 800 : 600, maxW: w - L.u(60) });
        if (!rs.sending) hits.add('clueReport:reason:' + r, x, y, w, rowH);
      },
    });
  });
  const sending = !!rs.sending;
  const can = !!rs.selected && !sending;
  return shell(ctx, L, hits, {
    title: '举报这个提示',
    closeId: 'clueReport:cancel',
    blocks,
    scroll: vm.sheetScroll,
    pinnedH: pinnedHeight(L),
    drawPinned: (x, y, w) =>
      drawPair(ctx, L, hits, x, y, w, { id: 'clueReport:cancel', label: '取消', disabled: sending }, { id: 'clueReport:submit', label: sending ? '提交中…' : '提交举报', disabled: !can }),
  });
}

module.exports = { rules, warn, report, RULES_BULLETS, REPORT_LABELS, WARN_TEXT };
