/**
 * Host: create a round (spec 6.5). Steps: pickSpectrum, creating, pickClue,
 * sharing, error, rateLimited.
 */

const T = require('./theme');
const W = require('./widgets');
const R = require('./ruler');
const K = require('./chrome');
const C = T.C;

function centerBlock(ctx, L, y, lines, spinner, t) {
  if (spinner) {
    W.spinner(ctx, L.cx, y + L.u(24), L.u(16), t);
    y += L.u(64);
  }
  lines.forEach((ln) => {
    y += W.paragraph(ctx, ln[0], L.x0, y, L.contentW, W.fs(L, 'bodyL') * 1.5, { size: W.fs(L, ln[3] || 'bodyL'), weight: ln[1] || 500, color: ln[2] || C.ink, align: 'center' }) + L.u(6);
  });
  return y;
}

function pickSpectrum(ctx, L, hits, vm, top) {
  const bh = K.btnH(L);
  const bottom = L.bottomEdge - L.bottomPad;
  W.scrollView(ctx, L, hits, {
    x: 0,
    y: top,
    w: L.W,
    h: bottom - top,
    scroll: vm.scrollY || 0,
    id: 'host:scroll',
    draw(c, h, vh) {
      let y = top + L.u(4);
      W.text(c, '点一条，开始出题', L.x0, y + L.u(12), { size: W.fs(L, 'body'), color: C.sub });
      y += L.u(34);
      const rowH = Math.max(L.u(72), bh + L.u(12));
      const fills = [C.noteBlue, C.noteYellow, C.noteOrange];
      (vm.spectra || []).forEach((s, i) => {
        W.note(c, L.x0, y, L.contentW, rowH, { fill: fills[i % 3], rot: i % 2 ? 0.5 : -0.5, tape: i === 0 });
        W.text(c, s.left + '  ↔  ' + s.right, L.cx, y + rowH / 2, { size: W.fs(L, 'prompt') * 0.8, weight: 900, align: 'center', maxW: L.contentW - L.u(32) });
        h.add('host:spectrum:' + i, L.x0, y, L.contentW, rowH);
        y += rowH + L.u(12);
      });
      y += L.u(6);
      const half = (L.contentW - L.u(10)) / 2;
      const free = vm.freeSwapLeft > 0;
      W.button(c, L, h, { id: 'host:swapFree', x: L.x0, y, w: half, h: bh, label: free ? '换一组 (免费)' : '换一组 已用', disabled: !free });
      const ad = vm.adSwapLeft > 0;
      const adLoading = vm.adState === 'loading' || vm.adState === 'playing';
      W.button(c, L, h, {
        id: 'host:swapAd',
        x: L.x0 + half + L.u(10),
        y,
        w: half,
        h: bh,
        label: adLoading ? '广告加载中…' : '视频 换一批',
        kind: 'ad',
        disabled: !ad || free || adLoading,
      });
      y += bh + L.u(8);
      const note = !ad ? '就从这几条里选吧' : free ? '免费换一组后，可看视频再换一批' : vm.adState === 'error' ? '暂无广告，请稍后再试' : '还可换 ' + vm.adSwapLeft + ' 批';
      W.text(c, note, L.cx, y + L.u(14), { size: W.fs(L, 'body'), color: C.sub, align: 'center', maxW: L.contentW });
      return y + L.u(32);
    },
  });
}

function radio(ctx, L, hits, id, x, y, w, label, on) {
  const h = Math.max(T.MIN_TAP, L.u(52));
  W.fillRR(ctx, x, y, w, h, L.u(12), on ? C.noteYellow : C.card);
  W.strokeRR(ctx, x, y, w, h, L.u(12), on ? C.ink : T.MODE.hc ? C.ink : C.line, on ? T.MODE.outline : 1.5);
  const cx = x + L.u(20);
  ctx.beginPath();
  ctx.arc(cx, y + h / 2, L.u(9), 0, Math.PI * 2);
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (on) {
    ctx.beginPath();
    ctx.arc(cx, y + h / 2, L.u(5), 0, Math.PI * 2);
    ctx.fillStyle = C.ink;
    ctx.fill();
  }
  W.text(ctx, label, cx + L.u(18), y + h / 2, { size: W.fs(L, 'body'), weight: 800, maxW: w - L.u(52) });
  hits.add(id, x, y, w, h);
  return h;
}

function pickClue(ctx, L, hits, vm, top) {
  const bh = K.btnH(L);
  const pTop = K.pinnedTop(L, 1);
  const sharing = vm.step === 'sharing';
  W.scrollView(ctx, L, hits, {
    x: 0,
    y: top,
    w: L.W,
    h: pTop - L.u(8) - top,
    scroll: vm.scrollY || 0,
    id: 'host:scroll',
    draw(c, h) {
      let y = top + L.u(2);
      W.text(c, (vm.left || '') + ' ↔ ' + (vm.right || ''), L.x0, y + L.u(16), { size: W.fs(L, 'title'), weight: 900, maxW: L.contentW });
      y += L.u(34);
      W.text(c, '只有你能看到这个位置', L.x0, y + L.u(10), { size: W.fs(L, 'body'), weight: 700, color: C.targetText });
      y += L.u(26);
      const r = R.drawRuler(c, L, h, { y, left: vm.left, right: vm.right, band: vm.targetBand, interactive: false, lanes: 0 });
      y = r.bottom + L.u(16);
      W.text(c, '怎么给提示？', L.x0, y + L.u(12), { size: W.fs(L, 'bodyL'), weight: 800 });
      y += L.u(32);
      const half = (L.contentW - L.u(10)) / 2;
      const preset = vm.clueMode !== 'chat';
      const ow = T.MODE.large ? L.contentW : half;
      radio(c, L, h, 'host:mode:preset', L.x0, y, ow, '选一个提示词', preset);
      if (T.MODE.large) y += Math.max(T.MIN_TAP, L.u(52)) + L.u(8);
      radio(c, L, h, 'host:mode:chat', T.MODE.large ? L.x0 : L.x0 + half + L.u(10), y, ow, '我在群里说', !preset);
      y += Math.max(T.MIN_TAP, L.u(52)) + L.u(12);
      if (preset) {
        const opts = vm.clueOptions || [];
        const cw = (L.contentW - L.u(10)) / 2;
        const ch = Math.max(T.MIN_TAP, L.u(52));
        opts.forEach((o, i) => {
          const cx = L.x0 + (i % 2) * (cw + L.u(10));
          const cy = y + Math.floor(i / 2) * (ch + L.u(10));
          const on = vm.clueItemId === o.itemId;
          W.fillRR(c, cx, cy, cw, ch, L.u(10), on ? C.tape : C.card);
          W.strokeRR(c, cx, cy, cw, ch, L.u(10), on ? C.ink : T.MODE.hc ? C.ink : C.lineStrong, on ? T.MODE.outline + 0.5 : 1.5);
          W.text(c, o.text, cx + cw / 2, cy + ch / 2, { size: W.fs(L, 'body'), weight: on ? 900 : 700, align: 'center', maxW: cw - L.u(16) });
          h.add('host:clue:' + o.itemId, cx, cy, cw, ch);
        });
        y += Math.ceil(opts.length / 2) * (ch + L.u(10));
        const swap = (vm.clueSwapLeft == null ? 1 : vm.clueSwapLeft) > 0;
        W.button(c, L, h, { id: 'host:clueSwap', x: L.x0, y, w: L.contentW, h: bh, label: swap ? '换一批' : '换一批 已用', disabled: !swap, kind: 'secondary' });
        y += bh;
      } else {
        y += W.paragraph(c, '回群里用一句话或语音给提示，别直接说位置或数字哦', L.x0, y, L.contentW, W.fs(L, 'bodyL') * 1.5, { size: W.fs(L, 'bodyL'), weight: 600, color: C.sub });
      }
      return y + L.u(10);
    },
  });
  W.button(ctx, L, hits, { id: 'host:share', x: L.x0, y: pTop, w: L.contentW, h: bh, label: sharing ? '正在打开分享…' : '发到群里', kind: 'primary', disabled: !vm.canShare || sharing });
}

function draw(ctx, vm, L) {
  const hits = K.begin(ctx, vm, L);
  const step = vm.step || 'pickSpectrum';
  const top = K.header(ctx, L, hits, { title: step === 'pickSpectrum' ? '出一道题 · 选一条刻度' : '出一道题' });
  const bh = K.btnH(L);
  const bottom = L.bottomEdge - L.bottomPad;
  if (step === 'pickSpectrum') pickSpectrum(ctx, L, hits, vm, top);
  else if (step === 'pickClue' || step === 'sharing') pickClue(ctx, L, hits, vm, top);
  else if (step === 'creating') {
    centerBlock(ctx, L, top + L.u(80), [['正在生成位置…', 800, C.ink], ['只有你能看到', 500, C.sub, 'body']], true, vm.t);
  } else if (step === 'error') {
    const y = centerBlock(ctx, L, top + L.u(80), [['出题需联网', 800, C.warn, 'title'], ['检查网络后再试，什么都没有创建', 500, C.sub, 'body']]);
    void y;
    W.button(ctx, L, hits, { id: 'host:retry', x: L.x0, y: bottom - bh, w: L.contentW, h: bh, label: '重试', kind: 'primary' });
  } else if (step === 'rateLimited') {
    centerBlock(ctx, L, top + L.u(80), [['今天出的题够多啦，明天再来', 800, C.ink, 'title']]);
    W.button(ctx, L, hits, { id: 'host:home', x: L.x0, y: bottom - bh, w: L.contentW, h: bh, label: '回首页', kind: 'primary' });
  }
  return hits.result();
}

module.exports = { draw };
