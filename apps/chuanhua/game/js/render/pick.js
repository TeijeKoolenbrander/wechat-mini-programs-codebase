/**
 * Pick screen (spec 8.3, F-2, PO-34/35), both modes: three rolled prompts (up to five 换一批, then it is greyed out), a small 自己出题
 * button, and a pinned start button. States loading | ready | sending | error | offline | timeUp.
 *
 * Live (mode 'live'): no back button; the countdown pill sits in the top bar (30 s, round 0). 慢慢传 (mode 'chain'): "‹ 返回"
 * and no timer. The custom-prompt input is canvas-drawn (logic owns the keyboard); while it is open the list is replaced by
 * the input so the keyboard never hides it. Time up: every hit area is gone except pick:block.
 * Hit ids: pick:back, pick:item:<promptId>, pick:reroll, pick:custom, pick:customInput, pick:customOk, pick:customCancel,
 * pick:start, pick:retry, pick:scroll, pick:block.
 */

const T = require('./theme');
const W = require('./widgets');
const S = require('./screen');
const Ch = require('./chrome');
const C = T.COLORS;

function errorBlock(ctx, L, hits, x, y, w, text, retryId) {
  const pad = 12;
  const lh = Math.round(T.FS.body * 1.45);
  const lines = W.wrap(ctx, text, w - 2 * pad - 26, T.FS.body, 600);
  const bh = retryId ? T.btn(L, 44) : 0;
  const h = lines.length * lh + 20 + (retryId ? bh + 6 : 0);
  W.fillRR(ctx, x, y, w, h, 12, C.vermSoft);
  W.strokeRR(ctx, x, y, w, h, 12, C.vermText, T.isHC() ? 2 : 1.5);
  W.iconStatus(ctx, x + 18, y + 10 + lh / 2, 16, 'bad', C.vermText);
  lines.forEach((ln, i) => W.text(ctx, ln, x + 34, y + 10 + i * lh + lh / 2, { size: T.FS.body, weight: 600, color: C.vermText }));
  if (retryId) W.button(ctx, L, hits, { id: retryId, x: x + pad, y: y + h - bh - 8, w: w - 2 * pad, h: bh, label: '重试', kind: 'secondary', size: T.FS.body });
  return h;
}

function errorHeight(ctx, L, w, text, withRetry) {
  const lh = Math.round(T.FS.body * 1.45);
  const lines = W.wrap(ctx, text, w - 24 - 26, T.FS.body, 600);
  return lines.length * lh + 20 + (withRetry ? T.btn(L, 44) + 6 : 0);
}

function draw(ctx, vm, L) {
  const hits = S.begin(ctx, vm, L);
  const state = vm.state || 'ready';
  const live = vm.mode === 'live';
  const timeUp = state === 'timeUp';
  const sending = state === 'sending';
  const custom = vm.custom || { open: false, text: '', count: '0/12', error: null, passed: false };
  const g = Ch.topBar(ctx, L, hits, {
    back: !live && vm.canBack !== false ? '返回' : null, backId: 'pick:back',
    timer: live ? vm.timer || { secLeft: 0, warn: false } : null, locked: timeUp,
  });
  const x0 = 16;
  const bw = L.W - 32 > 520 ? 520 : L.W - 32;
  const bx = Math.round((L.W - bw) / 2);
  let y = g.y + g.h + 4;

  // heading
  const hs = T.isLarge() ? T.FS.title : 24;
  W.text(ctx, vm.title || '选一个题目', bx + 2, y + hs * 0.7, { size: hs, weight: 900, maxW: bw });
  y += Math.round(hs * 1.4);
  if (vm.subtitle) {
    W.text(ctx, vm.subtitle, bx + 2, y + 12, { size: T.FS.body, color: C.sub, maxW: bw });
    y += Math.round(T.FS.body * 1.5) + 4;
  }
  y += 6;

  // ---- pinned start button
  const bh = T.btn(L, 56);
  const startY = L.bottomEdge - 8 - bh;
  const startLabel = timeUp ? '时间到，正在交出…' : sending ? vm.startLabel || '准备中…' : vm.startLabel || (live ? '就这个' : '开始画 (60 秒)');
  const startDisabled = !vm.canStart || state === 'rerolling' || sending || timeUp || state === 'offline' || state === 'loading' || custom.open;
  void x0;

  if (custom.open && !timeUp) {
    W.text(ctx, '自己出题', bx + 4, y + 14, { size: T.FS.body, weight: 800, color: C.sub });
    y += 30;
    const boxH = Math.max(60, T.minBtn() + 12);
    W.card(ctx, bx, y, bw, boxH, { r: 14, shadow: false, stroke: C.ink, lw: 2.5 });
    const has = !!custom.text;
    const cw = W.measure(ctx, custom.count || '', T.FS.body, 700);
    W.text(ctx, has ? custom.text : '输入题目 (2-12 个字)', bx + 14, y + boxH / 2, { size: T.FS.bodyL + 2, weight: has ? 700 : 400, color: has ? C.ink : C.sub, maxW: bw - 40 - cw });
    W.text(ctx, custom.count || '', bx + bw - 14, y + boxH / 2, { size: T.FS.body, weight: 700, color: C.sub, align: 'right' });
    hits.add('pick:customInput', bx, y, bw, boxH);
    y += boxH + 8;
    if (custom.error) {
      y += errorBlock(ctx, L, hits, bx, y, bw, custom.error, null) + 8;
    } else if (vm.errorText) {
      y += errorBlock(ctx, L, hits, bx, y, bw, vm.errorText, null) + 8;
    }
    const bh2 = T.btn(L, 52);
    const w1 = (bw - 12) * 0.4;
    W.button(ctx, L, hits, { id: 'pick:customCancel', x: bx, y, w: w1, h: bh2, label: '取消', kind: 'secondary' });
    W.button(ctx, L, hits, { id: 'pick:customOk', x: bx + w1 + 12, y, w: bw - w1 - 12, h: bh2, label: sending ? '准备中…' : '确定', kind: 'primary', disabled: sending || Array.from(custom.text || '').length < 2 });
    return hits.result();
  }

  if (state === 'loading') {
    const rowH = T.isLarge() ? 72 : 64;
    for (let i = 0; i < 3; i++) W.skeleton(ctx, bx, y + i * (rowH + 8), bw, rowH, (vm.t || 0) + i * 160, 14);
    W.text(ctx, '正在抽题…', L.W / 2, y + 3 * (rowH + 8) + 14, { size: T.FS.body, color: C.sub, align: 'center' });
    W.button(ctx, L, hits, { id: 'pick:start', x: bx, y: startY, w: bw, h: bh, label: startLabel, kind: 'primary', disabled: true });
    return hits.result();
  }

  // ---- list + tools (scrolls when large text or a small window needs it)
  const prompts = vm.prompts || [];
  const rowGap = 8;
  const toolsH = T.btn(L, 48);
  // 换一批 is never hidden (TD-151). Its rect depends on window and mode only: sized for the longest label at the smallest text size
  const rerollOff = vm.rerollDisabled === true;
  const rerollLabel = vm.rerollLabel;
  const rerollTap = vm.rerollTappable === true;
  const lblW = Math.max(W.measure(ctx, '换一批（剩5次）', T.FS.body, 700), W.measure(ctx, '换一批机会已用完', T.FS.body, 700)) + L.u(16) + 2;
  const customW = W.measure(ctx, '自己出题', T.FS.body, 700) + L.u(16) + 2;
  const spare = bw - 10 - lblW - customW;
  const stackTools = spare < 0; // both fit on one row, else 换一批 gets its own row (window and mode decide, never the state)
  const rects = {};
  const toolsBlockH = stackTools ? 2 * toolsH + 8 : toolsH;
  const err = vm.errorText && !timeUp ? vm.errorText : null;
  // QA-R3-1: the banner (and its 重试) is pinned directly above 就这个, outside the scroll area, so it is whole at rest and never under the chevron
  const errH = err ? errorHeight(ctx, L, bw, err, state === 'offline' || state === 'error') : 0;
  const errY = startY - 8 - errH;
  const area = { x: bx, y, w: bw, h: (err ? errY - 8 : startY - 10) - y };
  // all three prompts and the tools row fit at rest: on a short window the rows shrink (never below the tap size)
  const rowH0 = T.isLarge() ? 72 : 64;
  const fixedH = 4 + toolsBlockH + 12;
  const rowH = Math.max(T.btn(L, 48), Math.min(rowH0, Math.floor((area.h - fixedH) / Math.max(1, prompts.length)) - rowGap));
  const contentH = prompts.length * (rowH + rowGap) + 4 + toolsBlockH + 12;
  W.scrollBody(ctx, hits, area, contentH, vm.scrollY, 'pick:scroll', () => {
    let cy = area.y;
    prompts.forEach((p) => {
      const on = vm.selectedId === p.id;
      W.card(ctx, bx, cy, bw, rowH, { r: 14, shadow: !on, fill: on ? C.orangeSoft : C.card, stroke: on ? C.ink : undefined, lw: on ? 2.5 : undefined });
      W.text(ctx, p.text, bx + 16, cy + rowH / 2, { size: T.FS.title, weight: 800, maxW: bw - 16 - 56 });
      const rx = bx + bw - 28;
      const ry = cy + rowH / 2;
      ctx.beginPath();
      ctx.arc(rx, ry, 12, 0, Math.PI * 2);
      ctx.fillStyle = on ? C.orange : C.card;
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2;
      ctx.stroke();
      if (on) W.iconCheck(ctx, rx, ry, 14, C.ink);
      if (!sending && !timeUp && state !== 'rerolling') hits.add('pick:item:' + p.id, bx, cy, bw, rowH);
      cy += rowH + rowGap;
    });
    cy += 4;
    const dis = sending || timeUp;
    const rerollBtn = (x, w) => {
      rects.reroll = W.button(ctx, L, hits, { id: rerollTap && !dis ? 'pick:reroll' : undefined, x, y: cy, w, h: toolsH, label: rerollLabel, kind: 'secondary', disabled: dis || rerollOff });
    };
    if (stackTools) {
      rerollBtn(bx, bw);
      W.button(ctx, L, hits, { id: 'pick:custom', x: bx, y: cy + toolsH + 8, w: bw, h: toolsH, label: '自己出题', kind: 'secondary', disabled: dis });
    } else {
      const rw = Math.round(lblW + spare / 2);
      rerollBtn(bx, rw);
      W.button(ctx, L, hits, { id: 'pick:custom', x: bx + rw + 10, y: cy, w: bw - 10 - rw, h: toolsH, label: '自己出题', kind: 'secondary', disabled: dis });
    }
  });
  if (err) errorBlock(ctx, L, hits, bx, errY, bw, err, state === 'offline' || state === 'error' ? 'pick:retry' : null);

  W.button(ctx, L, hits, { id: 'pick:start', x: bx, y: startY, w: bw, h: bh, label: startLabel, kind: 'primary', disabled: startDisabled });
  if (timeUp) hits.add('pick:block', 0, 0, L.W, L.H);
  const out = hits.result();
  out.rects = rects; // { reroll: {x,y,w,h} } at scrollY 0
  return out;
}

module.exports = { draw };
