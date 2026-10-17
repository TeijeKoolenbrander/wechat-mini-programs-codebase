/**
 * Shared chrome for the timed screens (pick, draw, describe, round wait) and the reveal screens: the top bar (spec 8.4),
 * the countdown pill, status strips over a rect, and small row helpers. Pure.
 *
 * Top bar (standard mode, y = navBottom, h = 48, x from 0 to the window width; large text: h = 56):
 *   back    8, w 80 (large: 72)           "‹ 离开" / "‹ 放弃" / "‹ 首页" ...
 *   title   from back.right to the 举报 slot (or the timer, or the right button), centred, 17 pt (large 22); a title that
 *           does not fit on one line at >= 16 pt breaks at " · " into two lines
 *   举报     w 48, right edge = timer.x - 8 (only the slot of screens that can report; drawn only when show)
 *   timer   w 64 (large 72), right edge = window width - 8; a pill, outline normally, filled 朱 in the last 10 s
 * At 375 x 812: back 8,84,80,48; title 88,84,159,48; 举报 247,84,48,48; timer 303,84,64,48 (the spec rects).
 * Nothing sits in the capsule row: the bar starts at navBottom.
 */

const T = require('./theme');
const W = require('./widgets');
const C = T.COLORS;

const GAP = 8;

function barH() {
  return T.isLarge() ? 56 : 48;
}

function barSize() {
  return T.isLarge() ? 22 : 17;
}

function mmss(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
}

/** rects of the top bar parts (no drawing). o: {timer: bool, report: bool (reserve the 举报 slot), right: {w}} */
function barGeometry(L, o) {
  o = o || {};
  const h = barH();
  const y = L.navBottom;
  const large = T.isLarge();
  const back = { x: 8, y, w: large ? 72 : 80, h };
  let edge = L.W - 8;
  const out = { y, h, back };
  if (o.timer) {
    const w = large ? 72 : 64;
    out.timer = { x: edge - w, y, w, h };
    edge -= w;
  }
  if (o.right) {
    const w = o.right.w || 56;
    const x = edge - (o.timer ? GAP : 0) - w;
    out.right = { x, y, w, h };
    edge = x;
  }
  if (o.report) {
    const w = 48;
    const x = edge - (o.timer || o.right ? GAP : 0) - w;
    out.report = { x, y, w, h };
    edge = x;
  }
  // the title ends at the first thing on its right (no gap before 举报, as in the spec rects)
  const tx = back.x + back.w;
  out.title = { x: tx, y, w: Math.max(0, (o.report || !(o.timer || o.right) ? edge : edge - GAP) - tx), h };
  if (!o.report && (o.timer || o.right)) out.title.w = Math.max(0, edge - GAP - tx);
  return out;
}

/** the title as 1-2 lines that fit w at >= the minimum size; returns {lines, size} */
function fitTitle(ctx, title, w) {
  const size = barSize();
  const min = T.FS.body;
  const fits = (str, s) => W.measure(ctx, str, s, 800) <= w - 4;
  for (let s = size; s >= min; s--) if (fits(title, s)) return { lines: [title], size: s };
  const parts = String(title).split(' · ');
  if (parts.length >= 2) {
    // balance: first part(s) on line one
    const a = parts.slice(0, -1).join(' · ');
    const b = parts[parts.length - 1];
    for (let s = size; s >= min; s--) if (fits(a, s) && fits(b, s)) return { lines: [a, b], size: s };
  }
  const lines = W.wrap(ctx, title, w - 4, min, 800).slice(0, 2);
  return { lines, size: min };
}

/** the countdown pill; warn = filled 朱 with white text (shape and colour change together) */
function timerPill(ctx, rect, timer) {
  const warn = !!(timer && timer.warn);
  const size = barSize();
  const h = Math.round(size + 14);
  const w = rect.w;
  const x = rect.x;
  const y = rect.y + (rect.h - h) / 2;
  if (warn) W.fillRR(ctx, x, y, w, h, h / 2, C.vermText);
  else {
    W.fillRR(ctx, x, y, w, h, h / 2, C.card);
    W.strokeRR(ctx, x, y, w, h, h / 2, T.isHC() ? C.ink : C.lineStrong, 2);
  }
  W.text(ctx, mmss(timer ? timer.secLeft : 0), x + w / 2, rect.y + rect.h / 2 + 0.5, { size, weight: 800, color: warn ? '#FFFFFF' : C.ink, align: 'center' });
}

/**
 * Draw the top bar. o: {back: label|null, backId, title, timer: {secLeft, warn}|null, report: {id, show}|null,
 * right: {label, id, w, disabled}|null, locked (inert: drawn, no hit areas)}. Returns the geometry.
 */
function topBar(ctx, L, hits, o) {
  const g = barGeometry(L, { timer: !!o.timer, report: !!o.report, right: o.right ? { w: o.right.w } : null });
  const locked = !!o.locked;
  if (o.back) {
    const cy = g.back.y + g.back.h / 2;
    const col = locked ? C.disabledInk : C.ink;
    W.iconBack(ctx, g.back.x + 6, cy, 14, col);
    W.text(ctx, o.back, g.back.x + 26, cy, { size: barSize(), weight: 700, color: col, maxW: g.back.w - 28 });
    if (!locked && o.backId) hits.add(o.backId, g.back.x, g.back.y, g.back.w, g.back.h);
  }
  if (o.title) {
    const ft = fitTitle(ctx, o.title, g.title.w);
    const lh = Math.round(ft.size * 1.18);
    const top = g.title.y + (g.title.h - ft.lines.length * lh) / 2;
    ft.lines.forEach((ln, i) => W.text(ctx, ln, g.title.x + g.title.w / 2, top + i * lh + lh / 2, { size: ft.size, weight: 800, align: 'center' }));
  }
  if (o.report && g.report && o.report.show) {
    W.text(ctx, '举报', g.report.x + g.report.w / 2, g.report.y + g.report.h / 2, { size: T.FS.body + (T.isLarge() ? 0 : 1), weight: 700, color: locked ? C.disabledInk : C.sub, align: 'center' });
    if (!locked) hits.add(o.report.id, g.report.x, g.report.y, g.report.w, g.report.h);
  }
  if (o.right && g.right) {
    const dis = locked || o.right.disabled;
    W.text(ctx, o.right.label, g.right.x + g.right.w / 2, g.right.y + g.right.h / 2, { size: T.FS.body + (T.isLarge() ? 0 : 1), weight: 700, color: dis ? C.disabledInk : C.blueText, align: 'center' });
    if (!dis) hits.add(o.right.id, g.right.x, g.right.y, g.right.w, g.right.h);
  }
  if (o.timer && g.timer) timerPill(ctx, g.timer, o.timer);
  return g;
}

/**
 * A status strip drawn OVER a rect (the bottom of the canvas / drawing area), so nothing moves. txt wraps to <= 2 lines.
 * o: {kind: 'ok'|'bad', action: {id, label}|null}. Returns {x, y, w, h} (and registers the action's hit area).
 */
function statusStrip(ctx, L, hits, rect, txt, o) {
  o = o || {};
  const col = o.kind === 'bad' ? C.vermText : C.ink;
  const sw = rect.w - 16;
  const size = T.FS.bodyL;
  const actionW = o.action ? Math.max(T.MIN_TAP + 16, W.measure(ctx, o.action.label, T.FS.body, 800) + 28) : 0;
  const lines = W.wrapBalanced(ctx, txt, sw - 24 - (actionW ? actionW + 8 : 0), size, 700).slice(0, 2);
  const lh = Math.round(size * 1.35);
  const sh = Math.max(lines.length * lh + 16, o.action ? T.MIN_TAP + 8 : 0);
  const sx = rect.x + 8;
  const sy = rect.y + rect.h - sh - 8;
  ctx.save();
  ctx.globalAlpha = 0.97;
  W.fillRR(ctx, sx, sy, sw, sh, 10, C.card);
  ctx.restore();
  W.strokeRR(ctx, sx, sy, sw, sh, 10, col, 2);
  const tx = sx + 12 + (actionW ? 0 : (sw - 24) / 2);
  lines.forEach((ln, i) => W.text(ctx, ln, tx, sy + (sh - lines.length * lh) / 2 + i * lh + lh / 2, { size, weight: 700, color: col, align: actionW ? 'left' : 'center' }));
  if (o.action) {
    const bx = sx + sw - 8 - actionW;
    W.button(ctx, L, hits, { id: o.action.id, x: bx, y: sy + (sh - T.MIN_TAP) / 2, w: actionW, h: T.MIN_TAP, label: o.action.label, kind: 'secondary', size: T.FS.body });
  }
  return { x: sx, y: sy, w: sw, h: sh };
}

/** is the colour dark enough that a white check mark reads on it */
function darkColor(hex) {
  return T.contrast(hex, '#FFFFFF') > T.contrast(hex, '#1E1B18');
}

module.exports = { barH, barSize, barGeometry, topBar, timerPill, statusStrip, fitTitle, mmss, darkColor, GAP };
