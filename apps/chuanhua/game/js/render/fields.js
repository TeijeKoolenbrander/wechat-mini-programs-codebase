/**
 * Input field and timer widgets used by the picker, describe and draw screens.
 * Pure drawing; the native keyboard is owned by logic (wx.showKeyboard).
 */

const T = require('./theme');
const W = require('./widgets');
const C = T.COLORS;

/** Height of an input box for `text` (2 lines of text plus the counter row). */
function inputHeight(ctx, text, w, o) {
  o = o || {};
  const size = o.size || T.FS.bodyL;
  const lh = Math.round(size * 1.4);
  const lines = text ? Math.min(3, W.wrap(ctx, text, w - 28, size, 700).length) : 1;
  return lines * lh + 18 + Math.round(T.FS.small * 1.5) + 4;
}

/**
 * Canvas-drawn text box with placeholder, caret and counter.
 * o: {text, placeholder, count ('7/16'), focused, t (ms), error (string), size}
 * Returns the height used.
 */
function inputBox(ctx, x, y, w, o) {
  const size = o.size || T.FS.bodyL;
  const lh = Math.round(size * 1.4);
  const text = o.text || '';
  const lines = text ? W.wrap(ctx, text, w - 28, size, 700).slice(0, 3) : [];
  const h = inputHeight(ctx, text, w, o);
  W.sticker(ctx, x, y, w, h, 14, { fill: C.card, border: o.error ? C.zhuText : o.focused ? C.blueText : C.lineStrong, lw: o.focused ? W.bw() + 1 : W.bw() });
  if (!text) {
    W.text(ctx, o.placeholder || '', x + 14, y + 9 + lh / 2, { size, weight: 500, color: C.sub, maxW: w - 28 });
  } else {
    lines.forEach((ln, i) => W.text(ctx, ln, x + 14, y + 9 + lh * i + lh / 2, { size, weight: 700, color: C.ink }));
  }
  if (o.focused && Math.floor((o.t || 0) / 500) % 2 === 0) {
    const last = lines.length ? lines[lines.length - 1] : '';
    const cx = x + 14 + (last ? W.measure(ctx, last, size, 700) : 0) + 2;
    const cyy = y + 9 + lh * Math.max(0, lines.length - 1);
    ctx.fillStyle = C.blueText;
    ctx.fillRect(cx, cyy + 3, 2.5, lh - 6);
  }
  if (o.count) W.text(ctx, o.count, x + w - 14, y + h - 9 - T.FS.small * 0.75, { size: T.FS.small, weight: 700, color: o.error ? C.zhuText : C.sub, align: 'right' });
  return h;
}

/** Pill with a clock and m:ss. warn = last 10 s: filled 朱, white bold text. Returns width. */
function timerPill(ctx, cx, cy, secLeft, warn, maxW) {
  const s = Math.max(0, Math.round(secLeft));
  const label = Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  let size = T.FS.timer;
  let tw = W.measure(ctx, label, size, 800, true);
  let icon = size * 0.85;
  if (maxW && tw + icon + 34 > maxW) {
    size = Math.max(T.FS.small, size * (maxW / (tw + icon + 34)));
    tw = W.measure(ctx, label, size, 800, true);
    icon = size * 0.85;
  }
  const w = tw + icon + 34;
  const h = Math.round(size * 1.55);
  const x = cx - w / 2;
  const y = cy - h / 2;
  W.sticker(ctx, x, y, w, h, h / 2, { fill: warn ? C.zhu : C.card, off: 2 });
  W.iconClock(ctx, x + 14 + icon / 2, cy, icon, warn ? C.onZhu : C.ink);
  W.text(ctx, label, x + 22 + icon, cy + 1, { size, weight: 800, round: true, color: warn ? C.onZhu : C.ink });
  return { w, h };
}

module.exports = { inputBox, inputHeight, timerPill };
