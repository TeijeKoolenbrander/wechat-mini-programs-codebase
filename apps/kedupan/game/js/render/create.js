/**
 * Host: create a round (spec 6.5, 6.12; CONTRACT "create"). draw(ctx, vm, layout) -> hitAreas.
 * vm = CreateRound (spec 10) + {display, adState, clueSwapLeft, chosen?: {left,right}, caret, t, scrollY}.
 *
 * Clue step (D-2): two tabs, 自己写 (default) and 选一个提示词. Tab 1 draws the spectrum line with the host-only note, the target band
 * (display only), the tabs, the input box (placeholder, counter, caret), the always-visible rule line, a reserved hint slot and the
 * link 「想不出来？试试选一个提示词 ›」; 发到群里 is pinned at the bottom. With the system keyboard open (vm.keyboardH > 0, or absent =
 * unknown) the compact layout of TD-75 applies: the band shrinks to 24 pt, the rule line (or the hint in its place) sits above the
 * input row, and the input (left) and 发到群里 (right) sit above the keyboard; tabs, link and chips are hidden.
 *
 * Hit ids: create:back, create:spectrum:<id>, create:swapFree, create:swapAd, create:tab:text, create:tab:preset, create:input,
 * create:toPreset, create:busyRetry, create:busyPreset, create:clue:<itemId>, create:clueSwap, create:share, create:retry,
 * create:block (keyboard open: a tap outside the input row closes the keyboard), create:scroll (the clue step body on short screens),
 * plus the sheets' ids (clueSheets.js: rules:*, warn:*).
 * The only text input in the game is the clue input (AC 29); it is drawn here and typed through the system keyboard (logic).
 */

const T = require('./theme');
const W = require('./widgets');
const ruler = require('./ruler');
const CS = require('./clueSheets');
const { Hits } = require('./layout');
const C = T.COLORS;

/** Renderer-owned strings (spec 6.5 wireframe and states). */
const TXT = {
  note: '只有你能看到这个位置',
  heading: '怎么给提示？',
  headingPreset: '选一个提示词',
  placeholder: '写个东西或场景，让大家猜位置',
  link: '想不出来？试试选一个提示词 ›',
  busy: '提示暂时没法检查，还没有发出去',
  spent: '就从这几个里选吧',
};

function spinner(ctx, L, cx, cy, t) {
  const r = L.u(22);
  ctx.lineCap = 'round';
  ctx.lineWidth = L.u(5);
  ctx.strokeStyle = C.line;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = C.primary;
  const a = ((t || 0) / 500) % (Math.PI * 2);
  ctx.beginPath();
  ctx.arc(cx, cy, r, a, a + Math.PI * 0.6);
  ctx.stroke();
}

function pickSpectrum(ctx, L, hits, vm, top) {
  const gap = L.u(12);
  const sh = T.btn(L, 64);
  const bh = T.btn(L, 52);
  const w = L.contentW;
  // bottom-anchored stack: three spectra and the swap row
  let y = L.bottomEdge - L.bottomPad - bh;
  const swapY = y;
  const spectra = (vm.spectra || []).slice(0, 3);
  const errH = vm.adState === 'error' && !(vm.freeSwapLeft > 0) && vm.adSwapLeft > 0 ? Math.round(T.FS.body * 1.5) : 0;
  const yS = swapY - gap - errH - spectra.length * (sh + gap) + gap;
  W.text(ctx, '选一条你想考大家的刻度', L.x0, Math.max(top + L.u(14), yS - L.u(30)), { size: T.FS.bodyL, weight: 700, color: C.sub, maxW: w });
  spectra.forEach((s, i) => {
    const sy = yS + i * (sh + gap);
    W.button(ctx, L, hits, { id: 'create:spectrum:' + s.id, x: L.x0, y: sy, w, h: sh, label: s.left + ' ↔ ' + s.right, size: T.FS.title, kind: 'secondary' });
  });
  y = swapY;
  if (vm.freeSwapLeft > 0) W.button(ctx, L, hits, { id: 'create:swapFree', x: L.x0, y, w, h: bh, label: '换一组 (免费)', kind: 'ghost' });
  else if (vm.adSwapLeft > 0) {
    const busy = vm.adState === 'loading' || vm.adState === 'playing';
    W.button(ctx, L, hits, { id: 'create:swapAd', x: L.x0, y, w, h: bh, label: busy ? '加载中…' : '视频 换一批', kind: 'ad', disabled: busy });
    if (vm.adState === 'error') W.text(ctx, '暂无广告，请稍后再试', L.cx, y - L.u(6) - Math.round(T.FS.body * 0.5), { size: T.FS.body, weight: 600, color: C.danger, align: 'center', maxW: w });
  } else W.button(ctx, L, hits, { x: L.x0, y, w, h: bh, label: '就从这几条里选吧', kind: 'ghost', disabled: true });
}

// ------------------------------------------------------------------------------------------------------ clue step pieces

const TEXT_TAB = { state: 'ready', text: '', countText: '0/12', hint: null, reason: null, ruleLine: '', restrictionText: null, sending: false, busyBox: false };
const tabOf = (vm) => Object.assign({}, TEXT_TAB, vm.textTab || {});
const kbOpenOf = (vm) => vm.tab !== 'preset' && vm.keyboardH !== 0 && vm.step === 'pickClue' && (vm.textTab ? vm.textTab.state !== 'restricted' && vm.textTab.state !== 'paused' : true);

const inputH = () => (T.isLarge() ? 72 : 56);
const lineH = (size) => Math.round(size * 1.5);

/** Small ⚠ drawn as a path (no glyph dependence). */
function iconWarn(ctx, x, cy, s, color) {
  ctx.beginPath();
  ctx.moveTo(x + s / 2, cy - s / 2);
  ctx.lineTo(x + s, cy + s / 2);
  ctx.lineTo(x, cy + s / 2);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = T.isHC() ? '#FFFFFF' : C.paper;
  ctx.fillRect(x + s / 2 - s * 0.06, cy - s * 0.18, s * 0.12, s * 0.34);
  ctx.fillRect(x + s / 2 - s * 0.06, cy + s * 0.24, s * 0.12, s * 0.1);
}

/** Spectrum line + the host-only note: one line when it fits, else the note under it. Returns {h, draw}. */
function specBlock(ctx, L, vm, w, kb) {
  const sp = vm.chosen || { left: '', right: '' };
  const label = sp.left + ' ↔ ' + sp.right;
  const nw = W.measure(ctx, TXT.note, T.FS.body, 700);
  const gapX = L.u(14);
  let size = T.FS.title;
  let lw = W.measure(ctx, label, size, 800);
  if (lw + gapX + nw > w) {
    // narrow screens (320): the label steps down one size so the note still fits beside it (wireframe: one 20 pt row)
    size = T.FS.bodyL;
    lw = W.measure(ctx, label, size, 800);
  }
  const one = lw + gapX + nw <= w;
  if (!one) size = T.FS.title;
  if (!one) lw = W.measure(ctx, label, size, 800);
  const lh1 = Math.round(size * (L.compact ? 1.1 : 1.1));
  const nlh = Math.round(T.FS.bodyL * 1.4);
  const h = one || kb ? lh1 : lh1 + L.u(2) + nlh;
  return {
    h,
    draw: (c, x, y, ww) => {
      W.text(c, label, x, y + lh1 / 2, { size, weight: 800, maxW: ww });
      if (one) W.text(c, TXT.note, x + lw + gapX, y + lh1 / 2, { size: T.FS.body, weight: 700, color: C.youText, maxW: ww - lw - gapX });
      else if (!kb) W.text(c, TXT.note, x, y + lh1 + L.u(2) + nlh / 2, { size: T.FS.body, weight: 700, color: C.youText, maxW: ww });
    },
  };
}

/** The input box: placeholder, text (one line, shrunk, else two), counter, caret. Registers create:input when live. */
function inputBox(ctx, L, hits, r, tt, vm, live) {
  const bad = !!tt.hint && tt.reason !== 'busy';
  W.card(ctx, r.x, r.y, r.w, r.h, { r: 14, shadow: false, stroke: bad ? C.danger : C.ink, lw: bad ? 2.5 : 2, fill: live ? C.card || C.tile : C.tile });
  const text = tt.text || '';
  const count = tt.countText || '';
  const countSize = T.FS.body;
  const countW = W.measure(ctx, count, countSize, 800) + L.u(10);
  const innerW = r.w - L.u(24) - countW;
  const tsize = T.FS.bodyL;
  let lines;
  let fsz = tsize;
  let color = C.ink;
  if (r.oneLine) {
    // keyboard open: ONE line, always (the row is short). Shrink to body size first; a placeholder that still does not fit ends in …;
    // a typed clue that still does not fit scrolls, so the end (the caret) stays visible and the start is cut with …
    const weight = text ? 700 : 600;
    let s = text ? tsize : T.FS.body;
    const floor = T.FS.body; // never below the 16 pt body floor (AC 70)
    const cands = text ? [text] : [TXT.placeholder, '写个东西或场景', '写个提示', '写提示'];
    let str = cands[0];
    for (let i = 0; i < cands.length; i++) {
      str = cands[i];
      let t = s;
      while (t > floor && W.measure(ctx, str, t, weight) > innerW) t--;
      if (W.measure(ctx, str, t, weight) <= innerW) {
        s = t;
        break;
      }
      if (i === cands.length - 1) s = t;
    }
    fsz = s;
    color = text ? C.ink : C.sub;
    let shown = str;
    const cs = Array.from(str);
    if (text && W.measure(ctx, shown, s, weight) > innerW) {
      let n = cs.length;
      while (n > 1 && W.measure(ctx, '…' + cs.slice(cs.length - n).join(''), s, weight) > innerW) n--;
      shown = '…' + cs.slice(cs.length - n).join('');
    }
    lines = [shown];
  } else if (!text) {
    color = C.sub;
    lines = W.wrap(ctx, TXT.placeholder, innerW, T.FS.body, 600).slice(0, 2);
    fsz = T.FS.body;
  } else {
    lines = [text];
    let s = tsize;
    while (s > T.FS.body && W.measure(ctx, text, s, 700) > innerW) s--;
    fsz = s;
    if (W.measure(ctx, text, s, 700) > innerW) lines = W.wrap(ctx, text, innerW, s, 700).slice(0, 2);
  }
  const lh = lines.length > 1 ? Math.round(fsz * 1.2) : Math.round(fsz * 1.35);
  const top = r.y + (r.h - lines.length * lh) / 2;
  lines.forEach((ln, i) => W.text(ctx, ln, r.x + L.u(12), top + i * lh + lh / 2, { size: fsz, weight: text ? 700 : 600, color }));
  if (text && vm.caret) {
    const last = lines[lines.length - 1];
    const cx = Math.min(r.x + L.u(12) + W.measure(ctx, last, fsz, 700) + 2, r.x + r.w - countW - L.u(14));
    ctx.fillStyle = C.ink;
    ctx.fillRect(cx, top + (lines.length - 1) * lh + lh * 0.12, 2, lh * 0.76);
  } else if (!text && vm.caret) {
    ctx.fillStyle = C.ink;
    ctx.fillRect(r.x + L.u(12), r.y + r.h / 2 - lh * 0.38, 2, lh * 0.76);
  }
  const full = /^1[2-9]\//.test(count) && Number(count.split('/')[0]) >= 12;
  W.text(ctx, count, r.x + r.w - L.u(12), r.y + r.h / 2, { size: countSize, weight: 800, color: full ? C.youText : C.sub, align: 'right' });
  if (live) hits.add('create:input', r.x, r.y, r.w, r.h);
}

/** Rule line / hint text lines. Returns {lines, hint:boolean, h} for a given width. */
function msgLines(ctx, L, tt, w) {
  const hinted = !!tt.hint || tt.busyBox;
  const str = tt.busyBox ? TXT.busy : tt.hint || tt.ruleLine || '';
  const iconW = hinted ? L.u(22) : 0;
  const lines = W.wrap(ctx, str, w - iconW, T.FS.body, hinted ? 700 : 500);
  return { lines, hinted, iconW, lh: lineH(T.FS.body) };
}

function drawMsg(ctx, L, m, x, y) {
  m.lines.forEach((ln, i) => {
    if (m.hinted) W.text(ctx, ln, x + m.iconW, y + i * m.lh + m.lh / 2, { size: T.FS.body, weight: 700, color: C.danger });
    else W.text(ctx, ln, x, y + i * m.lh + m.lh / 2, { size: T.FS.body, weight: 500, color: C.sub });
  });
  if (m.hinted) iconWarn(ctx, x, y + m.lh / 2, L.u(15), C.danger);
}

function sendLabel(vm, tt, kb) {
  if (tt.sending && vm.tab !== 'preset') return '检查中…';
  if (vm.shareConfirm && !kb) return '提示已通过 · 发到群里';
  return '发到群里';
}

/** Rects of the keyboard-open layout (pt). Also used by tests. */
function kbGeometry(ctx, L, vm, top) {
  const tt = tabOf(vm);
  const w = L.contentW;
  const gap = L.u(8);
  const ih = inputH();
  const known = typeof vm.keyboardH === 'number' && vm.keyboardH > 0;
  // keyboard height unknown (TD-75): keep the input row's bottom within 60% of the window so a keyboard cannot cover it
  const bottom = known ? Math.min(L.bottomEdge - gap, L.H - vm.keyboardH - gap) : Math.min(L.bottomEdge - gap, L.H * 0.6);
  const label = sendLabel(vm, tt, true);
  const sw = Math.max(L.u(88), Math.ceil(W.measure(ctx, label, T.FS.body, 800) + L.u(24)));
  const input = { x: L.x0, y: bottom - ih, w: w - sw - gap, h: ih };
  const send = { x: input.x + input.w + gap, y: input.y, w: sw, h: ih };
  const m = msgLines(ctx, L, tt, w);
  const msgH = Math.max(1, m.lines.length) * m.lh;
  const msg = { x: L.x0, y: input.y - L.u(L.compact ? 8 : 14) - msgH, w, h: msgH };
  const sp = specBlock(ctx, L, vm, w, true);
  const spec = { x: L.x0, y: top + L.u(2), w, h: sp.h };
  const bandH = L.u(24);
  const band = { y: spec.y + spec.h + L.u(4), h: bandH };
  return { input, send, msg, spec, band, m, sp, known };
}

function drawKb(ctx, L, hits, vm, top) {
  const tt = tabOf(vm);
  const g = kbGeometry(ctx, L, vm, top);
  g.sp.draw(ctx, g.spec.x, g.spec.y, g.spec.w);
  ruler.drawBand(ctx, L, { x: 0, y: g.band.y, w: L.W, h: g.band.h, band: vm.targetBand || null });
  drawMsg(ctx, L, g.m, g.msg.x, g.msg.y);
  inputBox(ctx, L, hits, Object.assign({ oneLine: true }, g.input), tt, vm, !tt.sending);
  const label = sendLabel(vm, tt, true);
  W.button(ctx, L, hits, { id: 'create:share', x: g.send.x, y: g.send.y, w: g.send.w, h: g.send.h, label, kind: 'primary', size: T.FS.body, disabled: !vm.canShare || tt.sending });
}

function tabsBlock(ctx, L, hits, vm, tt) {
  const h = T.minBtn();
  return {
    h,
    draw: (c, x, y, w) => {
      const gap = L.u(8);
      const tw = (w - gap) / 2;
      [['text', '自己写'], ['preset', '选一个提示词']].forEach(([id, label], i) => {
        const on = vm.tab === id;
        const tx = x + i * (tw + gap);
        W.fillRR(c, tx, y, tw, h, L.u(14), on ? C.primary : C.tile);
        W.strokeRR(c, tx, y, tw, h, L.u(14), on ? C.primary : C.lineStrong, T.isHC() ? 2 : 1.5);
        W.text(c, label, tx + tw / 2, y + h / 2, { size: T.FS.bodyL, weight: on ? 800 : 700, color: on ? C.primaryInk : C.ink, align: 'center', maxW: tw - L.u(12) });
        if (!tt.sending) hits.add('create:tab:' + id, tx, y, tw, h);
      });
    },
  };
}

function textBlocks(ctx, L, hits, vm, tt, blocks, w) {
  const ih = inputH();
  const usable = tt.state !== 'restricted' && tt.state !== 'paused';
  if (!usable) {
    const str = tt.restrictionText || '';
    const lh = Math.round(T.FS.bodyL * 1.5);
    const n = W.wrap(ctx, str, w - L.u(24), T.FS.bodyL, 600).length;
    const h = n * lh + L.u(20);
    blocks.push({
      h,
      draw: (c, x, y, ww) => {
        W.fillRR(c, x, y, ww, h, L.u(12), C.tintYou);
        W.strokeRR(c, x, y, ww, h, L.u(12), C.youText, T.isHC() ? 2 : 1);
        W.paragraph(c, str, x + L.u(12), y + L.u(10), ww - L.u(24), lh, { size: T.FS.bodyL, weight: 600 });
      },
    });
    blocks.push(linkBlock(ctx, L, hits, '去选一个提示词 ›', 8));
    return;
  }
  const live = !tt.sending;
  blocks.push({ gap: L.u(L.compact ? 8 : 16), h: ih, draw: (c, x, y, ww) => inputBox(c, L, hits, { x, y, w: ww, h: ih }, tt, vm, live) });
  const rule = msgLines(ctx, L, Object.assign({}, tt, { hint: null, busyBox: false }), w);
  blocks.push({ gap: L.u(L.compact ? 4 : 8), h: rule.lines.length * rule.lh, draw: (c, x, y) => drawMsg(c, L, rule, x, y) });
  if (tt.busyBox) {
    const inner = w - L.u(24);
    const lines = W.wrap(ctx, TXT.busy, inner - L.u(22), T.FS.body, 700);
    const lh = lineH(T.FS.body);
    const bh = T.minBtn();
    const h = L.u(10) + lines.length * lh + L.u(8) + bh + L.u(10);
    blocks.push({
      gap: L.u(4),
      h,
      draw: (c, x, y, ww) => {
        W.fillRR(c, x, y, ww, h, L.u(12), C.tintYou);
        W.strokeRR(c, x, y, ww, h, L.u(12), C.danger, T.isHC() ? 2 : 1.5);
        iconWarn(c, x + L.u(12), y + L.u(10) + lh / 2, L.u(15), C.danger);
        lines.forEach((ln, i) => W.text(c, ln, x + L.u(12) + L.u(22), y + L.u(10) + i * lh + lh / 2, { size: T.FS.body, weight: 700, color: C.danger }));
        const by = y + h - L.u(10) - bh;
        const gapB = L.u(8);
        const bw = (ww - L.u(24) - gapB) / 2;
        W.button(c, L, hits, { id: 'create:busyRetry', x: x + L.u(12), y: by, w: bw, h: bh, label: '重试', kind: 'secondary', size: T.FS.body });
        W.button(c, L, hits, { id: 'create:busyPreset', x: x + L.u(12) + bw + gapB, y: by, w: bw, h: bh, label: '改用提示词', kind: 'secondary', size: T.FS.body });
      },
    });
  } else {
    const hm = msgLines(ctx, L, Object.assign({}, tt, { busyBox: false }), w);
    const slotH = (tt.hint ? Math.max(1, hm.lines.length) : 1) * hm.lh;
    blocks.push({ gap: L.u(L.compact ? 2 : 4), h: slotH, draw: (c, x, y) => (tt.hint ? drawMsg(c, L, hm, x, y) : undefined) }); // the slot is reserved even when empty
  }
  // the busy box already offers 改用提示词: the link would only compete with it
  if (!tt.busyBox) blocks.push(linkBlock(ctx, L, hits, TXT.link, L.compact ? 4 : 8));
}

function linkBlock(ctx, L, hits, label, gap) {
  return {
    gap: L.u(gap),
    h: T.MIN_TAP,
    draw: (c, x, y) => {
      W.link(c, L, hits, { id: 'create:toPreset', x, y: y + T.MIN_TAP / 2, label, size: T.FS.bodyL });
    },
  };
}

function presetBlocks(ctx, L, hits, vm, blocks, w) {
  const gap = L.u(8);
  const opts = (vm.clueOptions || []).slice(0, 6);
  // two columns (spec 6.5); one column only when the longest preset would not fit on a chip line (a chip label is never ellipsised)
  const longest = opts.reduce((m, o) => Math.max(m, W.measure(ctx, o.text, T.FS.bodyL, 700)), 0);
  let cols = 2;
  if (longest > (w - gap) / 2 - L.u(14)) cols = 1;
  const ch = T.minBtn();
  const rowsN = Math.ceil(opts.length / cols);
  blocks.push({
    gap: L.u(L.compact ? 8 : 16),
    h: rowsN * ch + (rowsN - 1) * gap,
    draw: (c, x, y, ww) => {
      const cw = (ww - (cols - 1) * gap) / cols;
      opts.forEach((o, i) => W.chip(c, L, hits, { id: 'create:clue:' + o.itemId, x: x + (i % cols) * (cw + gap), y: y + Math.floor(i / cols) * (ch + gap), w: cw, h: ch, label: o.text, on: vm.clueItemId === o.itemId }));
    },
  });
  const left = vm.clueSwapLeft > 0;
  blocks.push({
    gap: L.u(12),
    h: ch,
    draw: (c, x, y, ww) => {
      const cw = (ww - gap) / 2;
      if (left) W.button(c, L, hits, { id: 'create:clueSwap', x, y, w: cw, h: ch, label: '换一批', kind: 'ghost' });
      else W.button(c, L, hits, { x, y, w: ww, h: ch, label: TXT.spent, kind: 'ghost', disabled: true });
    },
  });
}

function pickClue(ctx, L, hits, vm, top) {
  const tt = tabOf(vm);
  if (kbOpenOf(vm)) return drawKb(ctx, L, hits, vm, top);
  const w = L.contentW;
  const bh = T.btn(L, 56);
  const py = L.bottomEdge - Math.max(L.bottomPad, L.u(16)) - bh;
  W.button(ctx, L, hits, {
    id: 'create:share',
    x: L.x0,
    y: py,
    w,
    h: bh,
    label: sendLabel(vm, tt, false),
    kind: 'primary',
    disabled: !vm.canShare || (tt.sending && vm.tab !== 'preset'),
  });

  const tabs = vm.tabs && vm.tabs.length ? vm.tabs : ['text', 'preset'];
  const bandH = T.isLarge() ? L.u(52) : L.compact ? L.u(40) : L.u(48);
  const headLh = Math.round(T.FS.bodyL * (L.compact ? 1.1 : 1.35));
  const cg = (roomy, tight) => L.u(L.compact ? tight : roomy); // 320 x 568 wireframe gaps are tighter
  const blocks = [];
  const sp = specBlock(ctx, L, vm, w, false);
  blocks.push(sp);
  blocks.push({
    gap: cg(8, 6),
    h: bandH,
    draw: (c, x, y) => ruler.drawBand(c, L, { x: 0, y, w: L.W, h: bandH, band: vm.targetBand || null }),
  });
  blocks.push({
    gap: cg(16, 6),
    h: headLh,
    draw: (c, x, y, ww) => W.text(c, tabs.length > 1 ? TXT.heading : TXT.headingPreset, x, y + headLh / 2, { size: T.FS.bodyL, weight: 800, maxW: ww }),
  });
  if (tabs.length > 1) blocks.push(Object.assign({ gap: cg(8, 6) }, tabsBlock(ctx, L, hits, vm, tt)));
  if (vm.tab === 'preset' || tabs.length === 1) presetBlocks(ctx, L, hits, vm, blocks, w);
  else textBlocks(ctx, L, hits, vm, tt, blocks, w);

  const top2 = top + (L.compact ? 0 : L.u(2));
  const area = { x: L.x0, y: top2, w, h: py - L.u(10) - top2 };
  W.stack(ctx, L, hits, area, blocks, vm.scrollY || 0, 'create:scroll', L.u(8));
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display);
  const hits = new Hits();
  const kbMode = vm.step === 'pickClue' && kbOpenOf(vm);
  // keyboard open: a tap outside the input row closes the keyboard. First in the list so 返回 and the input row (later) still win.
  if (kbMode) hits.add('create:block', 0, 0, L.W, L.H);
  const titles = { pickSpectrum: '出一道题 · 选一条刻度', creating: '出一道题', sharing: '出一道题', error: '出一道题', rateLimited: '出一道题' };
  const top = W.frame(ctx, L, hits, { title: vm.step === 'pickClue' ? null : titles[vm.step] || '出一道题', backId: 'create:back' });
  const mid = L.navBottom + (L.bottomEdge - L.navBottom) * 0.38;
  switch (vm.step) {
    case 'pickSpectrum':
      pickSpectrum(ctx, L, hits, vm, top);
      break;
    case 'creating':
      spinner(ctx, L, L.cx, mid, vm.t);
      W.text(ctx, '正在生成位置…', L.cx, mid + L.u(48), { size: T.FS.bodyL, weight: 700, color: C.sub, align: 'center' });
      break;
    case 'pickClue':
      pickClue(ctx, L, hits, vm, top);
      if (vm.sheet === 'rules' || vm.sheet === 'rulesReadOnly') CS.rules(ctx, L, hits, { readOnly: vm.sheet === 'rulesReadOnly', agreeing: !!vm.agreeing, sheetScroll: vm.sheetScroll });
      else if (vm.sheet === 'warn') CS.warn(ctx, L, hits, { sheetScroll: vm.sheetScroll });
      break;
    case 'sharing':
      spinner(ctx, L, L.cx, mid, vm.t);
      W.text(ctx, '打开分享…', L.cx, mid + L.u(48), { size: T.FS.bodyL, weight: 700, color: C.sub, align: 'center' });
      break;
    case 'error':
      W.stateMessage(ctx, L, hits, { y: mid - L.u(30), title: '出题需联网', text: '连上网络后再试一次', buttons: [{ id: 'create:retry', label: '重试', kind: 'primary' }] });
      break;
    case 'rateLimited':
      W.stateMessage(ctx, L, hits, { y: mid - L.u(30), text: '今天出的题够多啦，明天再来' });
      break;
    default:
      break;
  }
  return hits.result();
}

module.exports = { draw, kbGeometry, TXT };
