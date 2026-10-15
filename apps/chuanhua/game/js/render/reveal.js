/**
 * Reveal (spec 8.8): the doodle wall for participants, with a replay
 * animation driven entirely by vm progress fields. draw(ctx, vm, layout).
 *
 * PRIVACY / MODERATION: content is drawn only when vm.state === 'ready' and a
 * step has no placeholder AND carries its own strokes/text. Anything else
 * (missing fields included) draws a placeholder, never content. State
 * 'notParticipant' delegates to the teaser and never reads vm.steps.
 *
 * vm = spec 12 Reveal model plus extras:
 *   display, sheet, scrollY (px),
 *   autoplay.progress   0..1 progress of the panel autoplay.panel
 *   replay: {n, progress}  replay of ONE drawing (tap on it), progress 0..1
 *   teaser: {promptText, finalText, passed, canSameAgain}  data for state
 *       'notParticipant' (falls back to prompt.text / last step text)
 *   t
 * Panels: index 0 = the prompt, then every step that can play (placeholders
 * are skipped by autoplay). While autoplay.playing the strip only shows
 * panels up to autoplay.panel, follows the newest panel, and the whole body
 * is the tap target `reveal:skip`.
 * timeline(steps, elapsedMs) -> {panel, progress, done, total} turns a clock
 * into those fields (prompt 0.8 s, drawing 2.5 s whatever its length,
 * sentence 0.6 s, 0.4 s between panels).
 * Hit ids: back, reveal:skip, reveal:drawing:<n> (replay one), reveal:laugh:<n>,
 *   reveal:report:<n>, reveal:share, reveal:sameAgain, reveal:replayAll,
 *   reveal:retry, plus sheet ids.
 */

const T = require('./theme');
const W = require('./widgets');
const S = require('./strokes');
const teaser = require('./teaser');
const { page } = require('./page');
const C = T.COLORS;

const DUR = { prompt: 800, draw: 2500, text: 600, gap: 400 };

const PLACEHOLDER_TEXT = { reported: '该内容已被举报隐藏', deleted: '作者已删除这一棒', paused: '内容维护中' };

function hasContent(s) {
  if (!s || s.placeholder) return false;
  if (s.kind === 'draw') return !!(s.strokes && Array.isArray(s.strokes.s));
  return typeof s.text === 'string' && s.text.length > 0;
}

/** Playable = shown by autoplay (not a placeholder, has its own content). */
function playable(steps) {
  return (steps || []).filter(hasContent);
}

/** Clock -> autoplay fields. steps = vm.steps. elapsedMs since autoplay start. */
function timeline(steps, elapsedMs) {
  const list = playable(steps);
  const durs = [DUR.prompt].concat(list.map((s) => (s.kind === 'draw' ? DUR.draw : DUR.text)));
  let t = Math.max(0, elapsedMs || 0);
  for (let i = 0; i < durs.length; i++) {
    const slot = durs[i] + DUR.gap;
    if (t < slot) return { panel: i, progress: Math.min(1, t / durs[i]), done: false, total: durs.length };
    t -= slot;
  }
  return { panel: durs.length - 1, progress: 1, done: true, total: durs.length };
}

function totalMs(steps) {
  const list = playable(steps);
  let t = DUR.prompt + DUR.gap;
  list.forEach((s) => (t += (s.kind === 'draw' ? DUR.draw : DUR.text) + DUR.gap));
  return t;
}

function noteCard(ctx, x, y, w, msg, icon) {
  const size = T.FS.body;
  const lh = Math.round(size * 1.5);
  const ph = W.paragraphH(ctx, msg, w - 64, lh, { size, weight: 700 });
  const h = Math.max(56, ph + 28);
  W.fillRR(ctx, x, y, w, h, 14, C.disabledFill);
  ctx.setLineDash([6, 4]);
  W.strokeRR(ctx, x, y, w, h, 14, C.disabledInk, 2);
  ctx.setLineDash([]);
  W.iconStatus(ctx, x + 28, y + h / 2, 28, icon || 'void');
  W.paragraph(ctx, msg, x + 52, y + (h - ph) / 2, w - 64, lh, { size, weight: 700, color: C.disabledInk });
  return h;
}

function badgeMine(ctx, x, y) {
  return W.chip(ctx, x, y, '你', { fill: C.zhuSoft, color: C.zhuText, border: C.zhuText });
}

function stepCard(ctx, hits, vm, L, x, y, w, s, prog, tilt, idx) {
  const pad = 14;
  const iw = w - 2 * pad;
  const headH = Math.round(T.FS.body * 1.7);
  const label = '第' + s.n + '棒 · ' + (s.kind === 'draw' ? '画' : '猜');
  if (!hasContent(s)) {
    const msg = PLACEHOLDER_TEXT[s.placeholder] || '内容暂不可见';
    const lh = Math.round(T.FS.body * 1.5);
    const ph = W.paragraphH(ctx, msg, iw - 44, lh, { size: T.FS.body, weight: 700 });
    const h = pad + headH + Math.max(44, ph + 8) + pad;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(tilt);
    ctx.translate(-w / 2, -h / 2);
    W.fillRR(ctx, 0, 0, w, h, 14, C.disabledFill);
    ctx.setLineDash([6, 4]);
    W.strokeRR(ctx, 0, 0, w, h, 14, C.disabledInk, 2);
    ctx.setLineDash([]);
    W.text(ctx, label, pad, pad + headH / 2, { size: T.FS.body, weight: 800, round: true, color: C.disabledInk });
    W.iconStatus(ctx, pad + 16, pad + headH + 24, 28, 'void');
    W.paragraph(ctx, msg, pad + 40, pad + headH + 4, iw - 44, lh, { size: T.FS.body, weight: 700, color: C.disabledInk });
    ctx.restore();
    return h;
  }
  const isDraw = s.kind === 'draw';
  const dsize = Math.min(iw, L.u(300));
  let bodyH;
  let lines = [];
  const tsize = T.FS.bodyL + 4;
  const tl = Math.round(tsize * 1.4);
  if (isDraw) bodyH = dsize;
  else {
    lines = W.wrap(ctx, '「' + s.text + '」', iw, tsize, 800, true);
    bodyH = lines.length * tl;
  }
  const actH = Math.max(T.MIN_TAP, 48);
  const showAct = true;
  const h = pad + headH + 6 + bodyH + 6 + (showAct ? actH : 0) + 6;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(tilt);
  ctx.translate(-w / 2, -h / 2);
  W.card(ctx, 0, 0, w, h, { r: 14 });
  W.tape(ctx, w / 2, 2, 56, 15, 0.05);
  W.text(ctx, label, pad, pad + headH / 2, { size: T.FS.body, weight: 800, round: true, color: C.zhuText });
  if (s.mine) badgeMine(ctx, w - pad - (W.measure(ctx, '你', T.FS.small, 700) + 18), pad + (headH - Math.round(T.FS.small * 1.65)) / 2);
  const by = pad + headH + 6;
  if (isDraw) {
    S.draw(ctx, s.strokes, { x: pad + (iw - dsize) / 2, y: by, w: dsize, h: dsize }, { bg: '#FFFFFF', radius: 6, border: C.line === '#000000' ? '#000000' : 'rgba(30,27,24,0.35)', borderWidth: 1.5, progress: prog });
  } else {
    const total = Array.from(s.text).length + 2; // quotes included
    const shown = Math.ceil(total * prog);
    let used = 0;
    lines.forEach((ln, i) => {
      const chars = Array.from(ln);
      const take = Math.max(0, Math.min(chars.length, shown - used));
      used += chars.length;
      if (take > 0) W.text(ctx, chars.slice(0, take).join(''), pad, by + tl * i + tl / 2, { size: tsize, weight: 800, round: true });
    });
  }
  ctx.restore();
  // hit areas in unrotated coordinates (tilt is under 1 degree)
  const ay = y + pad + headH + 6 + bodyH + 6;
  if (isDraw) hits.add('reveal:drawing:' + s.n, x + pad + (iw - dsize) / 2, y + by, dsize, dsize);
  // action row (drawn upright so taps match the pixels)
  const lx = x + pad;
  const lw = Math.max(96, W.measure(ctx, '笑 ' + (s.laughs || 0), T.FS.body, 800) + 56);
  W.sticker(ctx, lx, ay + (actH - 44) / 2 + 1, lw, 40, 20, { fill: s.myLaugh ? '#FFE3B0' : C.card, off: s.myLaugh ? 0 : 2 });
  W.iconLaugh(ctx, lx + 22, ay + actH / 2 + 1, 26, !!s.myLaugh);
  W.text(ctx, '笑 ' + (s.laughs || 0), lx + 42, ay + actH / 2 + 1, { size: T.FS.body, weight: 800 });
  hits.add('reveal:laugh:' + s.n, lx, ay, lw, actH);
  if (s.canReport) W.link(ctx, hits, { id: 'reveal:report:' + s.n, x: x + w - pad, y: ay + actH / 2, label: '举报', icon: 'flag', align: 'right', color: C.sub, size: T.FS.small });
  void idx;
  return h;
}

function promptCard(ctx, x, y, w, vm, tilt) {
  const size = T.FS.hero - 2;
  const lh = Math.round(size * 1.35);
  const text = vm.prompt && vm.prompt.text ? vm.prompt.text : '';
  const lines = W.wrap(ctx, text, w - 40, size, 900, true).slice(0, 3);
  const h = 20 + Math.round(T.FS.body * 1.6) + 6 + lines.length * lh + 18;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(tilt);
  ctx.translate(-w / 2, -h / 2);
  W.card(ctx, 0, 0, w, h, { r: 14, fill: C.card });
  ctx.fillStyle = C.orangeSoft;
  W.fillRR(ctx, 6, 6, w - 12, h - 12, 10, C.orangeSoft);
  W.tape(ctx, w / 2, 2, 56, 15, -0.05);
  W.text(ctx, '起点', 20, 20 + Math.round(T.FS.body * 1.6) / 2, { size: T.FS.body, weight: 800, round: true, color: C.orangeText });
  lines.forEach((ln, i) => W.text(ctx, ln, w / 2, 20 + Math.round(T.FS.body * 1.6) + 6 + lh * i + lh / 2, { size, weight: 900, round: true, align: 'center', maxW: w - 40, minSize: 22 }));
  ctx.restore();
  return h;
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display); // sizes below depend on the mode
  const state = vm.state || 'loading';
  if (state === 'notParticipant') {
    const t = vm.teaser || {};
    // Never read vm.steps here: a non-participant must not get any 棒.
    return teaser.draw(ctx, Object.assign({}, { display: vm.display, sheet: vm.sheet, report: vm.report, state: 'ready', promptText: t.promptText || (vm.prompt && vm.prompt.text) || '', finalText: t.finalText || null, passed: t.passed || 0, canSameAgain: t.canSameAgain != null ? t.canSameAgain : vm.canSameAgain }), L);
  }
  const ap = vm.autoplay || {};
  const playing = state === 'ready' && !!ap.playing;
  const bh = W.btnH(L);
  const smallH = W.btnH(L, true);
  const gap = L.u(8);
  const showFooter = state === 'ready';
  const footerH = showFooter ? bh + gap + smallH : state === 'offline' || state === 'error' ? bh : 0;
  const steps = vm.steps || [];
  const v2 = playing ? Object.assign({}, vm, { scrollY: 1e9 }) : vm;

  return page(ctx, v2, L, {
    back: { label: '返回', id: 'back' },
    footerH,
    scrollId: 'reveal:scroll',
    center: state !== 'ready',
    footer: (c, h, r) => {
      if (state === 'offline' || state === 'error') {
        W.button(c, L, h, { id: 'reveal:retry', x: r.x, y: r.y, w: r.w, h: r.h, label: '重试', kind: 'primary' });
        return;
      }
      W.button(c, L, h, { id: 'reveal:share', x: r.x, y: r.y, w: r.w, h: bh, label: '分享揭晓卡', kind: 'primary', disabled: playing });
      const y = r.y + bh + gap;
      if (vm.canSameAgain) {
        const half = (r.w - gap) / 2;
        W.button(c, L, h, { id: 'reveal:sameAgain', x: r.x, y, w: half, h: smallH, label: '同题再传', kind: 'secondary', size: T.FS.body, disabled: playing });
        W.button(c, L, h, { id: 'reveal:replayAll', x: r.x + half + gap, y, w: half, h: smallH, label: '重播', kind: 'secondary', size: T.FS.body, disabled: playing });
      } else {
        W.button(c, L, h, { id: 'reveal:replayAll', x: r.x, y, w: r.w, h: smallH, label: '重播', kind: 'secondary', size: T.FS.body, disabled: playing });
      }
    },
    body: (c, h, y0, x, w) => {
      const cx = x + w / 2;
      let y = y0 + 4;
      if (state === 'loading') {
        W.text(c, '正在展开…', cx, y + 14, { size: T.FS.bodyL, weight: 700, color: C.sub, align: 'center' });
        y += 40;
        [0.9, 0.7, 0.9].forEach((k, i) => {
          W.skeleton(c, x + 4, y, w - 8, L.u(i === 1 ? 90 : 70), vm.t, 14);
          y += L.u(i === 1 ? 90 : 70) + 14;
        });
        return y - y0;
      }
      if (state === 'paused') return noteCard(c, x, y + 20, w, '内容维护中，请稍后再来看', 'pending') + 40;
      if (state === 'offline' || state === 'error') return noteCard(c, x, y + 20, w, '揭晓需联网查看', 'void') + 40;

      // header
      if (vm.header) y += W.paragraph(c, vm.header, x + 2, y, w - 4, Math.round(T.FS.bodyL * 1.45), { size: T.FS.bodyL, weight: 800, round: true, maxLines: 2 }) + 2;
      if (vm.early && vm.earlyText) {
        W.chip(c, x + 2, y + 2, vm.earlyText, { fill: C.blueSoft, color: C.blueText, border: C.blueText });
        y += Math.round(T.FS.small * 1.65) + 8;
      }
      y += 8;
      const cw = w - 8;
      const cardX = x + 4;
      const items = steps;
      let pi = 0; // playable index of the next playable item
      const arrowH = 34;
      const panel = ap.panel || 0;
      const promptVisible = !playing || panel >= 0;
      if (promptVisible) {
        y += promptCard(c, cardX, y, cw, vm, -0.012);
      }
      items.forEach((s, i) => {
        const can = hasContent(s);
        let visible = true;
        let prog = 1;
        if (playing) {
          if (can) {
            visible = pi + 1 <= panel;
            if (pi + 1 === panel) prog = ap.progress == null ? 1 : ap.progress;
            else prog = 1;
            pi += 1;
          } else visible = panel > pi; // a placeholder appears once the next sentence/drawing starts
        } else if (vm.replay && vm.replay.n === s.n && can) prog = Math.max(0, Math.min(1, vm.replay.progress == null ? 1 : vm.replay.progress));
        if (!visible) return;
        W.arrowDown(c, cx, y + 4, y + arrowH - 4, C.ink, i + 1);
        y += arrowH;
        y += stepCard(c, h, vm, L, cardX, y, cw, s, prog, i % 2 ? 0.012 : -0.012, i);
      });
      if (!playing) {
        y += 14;
        if (vm.summaryText) {
          const lh = Math.round(T.FS.bodyL * 1.5);
          const ph = W.paragraphH(c, vm.summaryText, w - 32, lh, { size: T.FS.bodyL, weight: 800, round: true });
          W.fillRR(c, x, y, w, ph + 24, 14, C.zhuSoft);
          W.strokeRR(c, x, y, w, ph + 24, 14, C.zhuText, W.bw());
          W.paragraph(c, vm.summaryText, x + 16, y + 12, w - 32, lh, { size: T.FS.bodyL, weight: 800, round: true, color: C.ink, align: 'center' });
          y += ph + 24 + 8;
        }
        if (vm.nationalText) y += W.paragraph(c, vm.nationalText, x + 2, y, w - 4, Math.round(T.FS.body * 1.5), { size: T.FS.body, color: C.sub, align: 'center' }) + 4;
      } else {
        h.add('reveal:skip', 0, y0, L.W, 3000);
      }
      return y - y0 + 8;
    },
  });
}

module.exports = { draw, timeline, totalMs, hasContent, playable, DUR, PLACEHOLDER_TEXT };
