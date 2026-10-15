/**
 * Shared pieces of the group page, the friend board and the round reveal:
 * the open-data-domain window, notices, the 群默契度 gauge, the 7-day trend.
 */

const T = require('./theme');
const W = require('./widgets');
const C = T.C;

const VISIBLE_ROWS = 5;

/** Row height the open data domain must use (px). */
function rowH(L) {
  return L.u(T.MODE.large ? 72 : 60);
}

/** Footer inside the open data canvas (最同频 line, note). */
function footH(L) {
  return L.u(T.MODE.large ? 74 : 58);
}

/** Height of the window for `rows` server rows (cap VISIBLE_ROWS). */
function boxHeight(L, rows) {
  const n = Math.max(1, Math.min(VISIBLE_ROWS, rows == null ? VISIBLE_ROWS : rows));
  return n * rowH(L) + footH(L);
}

/**
 * The window the open data canvas is drawn into. Registers `board:list` (drag
 * area, forward to the open data domain as {type:'scroll', offset}) and
 * hitAreas.board = {x, y, w, h} for sizing the shared canvas. When
 * `vm.sharedCanvas` is given, it is blitted; otherwise a skeleton.
 */
function box(ctx, L, hits, vm, y, rows) {
  const h = boxHeight(L, rows != null ? rows : vm.boardRows);
  const x = L.x0;
  const w = L.contentW;
  W.card(ctx, x, y, w, h, { r: L.u(14), shadow: true });
  if (vm.sharedCanvas) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    try {
      ctx.drawImage(vm.sharedCanvas, x, y, w, h);
    } catch (e) {
      /* the open data canvas is not ready yet: leave the card empty */
    }
    ctx.restore();
  } else {
    const rh = rowH(L);
    for (let i = 0; i < Math.min(VISIBLE_ROWS, rows || VISIBLE_ROWS); i++) {
      W.skeleton(ctx, x + L.u(12), y + i * rh + L.u(12), w - L.u(24), rh - L.u(20), vm.t, L.u(10));
    }
  }
  hits.add('board:list', x, y, w, h);
  hits.meta.board = { x, y, w, h, rowH: rowH(L), footH: footH(L) };
  return h;
}

/** A card with a title, body lines and up to two buttons. Returns its height. */
function notice(ctx, L, hits, o) {
  const x = L.x0;
  const w = L.contentW;
  const pad = L.u(16);
  const bh = K_btnH(L);
  const bs = W.fs(L, 'bodyL');
  const lh = bs * 1.5;
  const title = o.title ? W.paragraphHeight(ctx, o.title, w - pad * 2, W.fs(L, 'title') * 1.4, { size: W.fs(L, 'title'), weight: 900 }) : 0;
  const body = o.text ? W.paragraphHeight(ctx, o.text, w - pad * 2, lh, { size: bs }) : 0;
  const buttons = o.buttons || [];
  const h = pad + title + (title ? L.u(6) : 0) + body + (buttons.length ? L.u(14) + buttons.length * (bh + L.u(10)) - L.u(10) : 0) + pad;
  W.note(ctx, x, o.y, w, h, { fill: o.fill || C.noteYellow, rot: o.rot == null ? -0.4 : o.rot, tape: o.tape !== false });
  let y = o.y + pad;
  if (title) y += W.paragraph(ctx, o.title, x + pad, y, w - pad * 2, W.fs(L, 'title') * 1.4, { size: W.fs(L, 'title'), weight: 900, align: o.align }) + L.u(6);
  if (body) y += W.paragraph(ctx, o.text, x + pad, y, w - pad * 2, lh, { size: bs, weight: 600, align: o.align });
  if (buttons.length) {
    y += L.u(14);
    buttons.forEach((b) => {
      W.button(ctx, L, hits, { id: b.id, x: x + pad, y, w: w - pad * 2, h: bh, label: b.label, kind: b.kind || 'secondary', disabled: b.disabled });
      y += bh + L.u(10);
    });
  }
  return h;
}

function K_btnH(L) {
  return Math.max(T.MIN_TAP, W.fs(L, 'buttonH'));
}

/** Big number with a tape gauge: the 群默契度. mq: 0-100. */
function gauge(ctx, L, y, label, valueText, mq) {
  const x = L.x0;
  const w = L.contentW;
  W.text(ctx, label, L.cx, y + L.u(12), { size: W.fs(L, 'bodyL'), weight: 700, color: C.sub, align: 'center' });
  y += L.u(32);
  const hs = W.fs(L, 'hero');
  W.text(ctx, valueText || '--', L.cx, y + hs * 0.55, { size: hs, weight: 900, color: C.ink, align: 'center' });
  y += hs * 1.15;
  if (mq != null) {
    const th = L.u(26);
    const inset = L.u(4);
    W.fillRR(ctx, x, y, w, th, L.u(6), C.tape);
    const fw = Math.max(th, ((w - inset * 2) * Math.max(0, Math.min(100, mq))) / 100);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, fw, th);
    ctx.clip();
    W.fillRR(ctx, x, y, w, th, L.u(6), C.primary);
    ctx.restore();
    // ticks
    ctx.strokeStyle = C.ink;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.6;
    for (let i = 0; i <= 20; i++) {
      const tx = x + L.u(12) + ((w - L.u(24)) * i) / 20;
      ctx.beginPath();
      ctx.moveTo(tx, y + th - 2);
      ctx.lineTo(tx, y + th - 2 - (i % 10 === 0 ? th * 0.45 : th * 0.25));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    W.strokeRR(ctx, x, y, w, th, L.u(6), T.MODE.hc ? C.ink : C.tapeShade, T.MODE.hc ? 2.5 : 1.5);
    y += th + L.u(6);
    W.text(ctx, '各有想法', x, y + L.u(11), { size: W.fs(L, 'body'), color: C.sub });
    W.text(ctx, '灵魂同频', x + w, y + L.u(11), { size: W.fs(L, 'body'), color: C.sub, align: 'right' });
    y += W.fs(L, 'body') * 1.4;
  }
  return y;
}

/** Seven-day trend. items: [{label:'10/14', value:number|null}]. */
function trend(ctx, L, y, items) {
  const x = L.x0;
  const w = L.contentW;
  const bs = W.fs(L, 'body');
  W.text(ctx, '近 7 天默契度', x, y + L.u(12), { size: W.fs(L, 'bodyL'), weight: 800 });
  y += L.u(32);
  const colW = w / 7;
  const barMax = L.u(54);
  const top = y + bs * 1.3;
  items.slice(0, 7).forEach((it, i) => {
    const cx = x + colW * i + colW / 2;
    const v = it.value;
    if (v == null) {
      W.text(ctx, '—', cx, top + barMax - L.u(8), { size: bs, color: C.sub, align: 'center' });
    } else {
      const bh = Math.max(L.u(6), (barMax * v) / 100);
      const bw = Math.min(L.u(22), colW - L.u(8));
      W.fillRR(ctx, cx - bw / 2, top + barMax - bh, bw, bh, L.u(4), i === items.length - 1 ? C.primary : C.tape);
      W.strokeRR(ctx, cx - bw / 2, top + barMax - bh, bw, bh, L.u(4), T.MODE.hc ? C.ink : C.tapeShade, T.MODE.hc ? 2 : 1.2);
      W.text(ctx, String(v), cx, top + barMax - bh - bs * 0.7, { size: bs, weight: 800, align: 'center' });
    }
    const full = String(it.label || '').replace(/(^|\/)0(\d)/g, '$1$2');
    const lab = W.measure(ctx, full, bs, 400) + L.u(4) > colW ? full.split('/').pop() : full;
    W.text(ctx, lab, cx, top + barMax + L.u(14), { size: bs, color: C.sub, align: 'center', maxW: colW });
  });
  ctx.fillStyle = C.line;
  ctx.fillRect(x, top + barMax + 1, w, 1.5);
  return top + barMax + L.u(30);
}

module.exports = { VISIBLE_ROWS, rowH, footH, boxHeight, box, notice, gauge, trend };
