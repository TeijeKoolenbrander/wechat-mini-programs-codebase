/**
 * Round screens (spec 6.6, 6.7): guess entry, submitted/waiting, host waiting
 * view and the reveal view. One module, switched on vm.status.
 */

const T = require('./theme');
const W = require('./widgets');
const R = require('./ruler');
const K = require('./chrome');
const B = require('./board');
const { Hits } = require('./layout');
const C = T.C;

function spectrumLine(ctx, L, y, vm) {
  const s = W.fs(L, 'title');
  W.text(ctx, (vm.left || '') + '  ↔  ' + (vm.right || ''), L.cx, y + s * 0.7, { size: s * 1.15, weight: 900, align: 'center', maxW: L.contentW });
  return y + s * 1.5;
}

function clueNote(ctx, L, y, vm) {
  if (!vm.clueText) return y;
  const bs = W.fs(L, 'bodyL');
  const lines = W.wrap(ctx, vm.clueText, L.contentW - L.u(36), bs, 800).slice(0, 2);
  const h = lines.length * bs * 1.45 + L.u(22);
  W.note(ctx, L.x0, y, L.contentW, h, { fill: C.noteYellow, rot: -0.5, tape: true });
  lines.forEach((ln, i) => W.text(ctx, ln, L.cx, y + L.u(12) + bs * 1.45 * (i + 0.5), { size: bs, weight: 800, align: 'center' }));
  return y + h + L.u(10);
}

function countLine(ctx, L, y, text, color) {
  if (!text) return y;
  y += W.paragraph(ctx, text, L.x0, y, L.contentW, W.fs(L, 'body') * 1.5, { size: W.fs(L, 'body'), weight: 700, color: color || C.sub, align: 'center' });
  return y + L.u(4);
}

/** Legend with the actual marker shapes. */
function legend(ctx, L, y, items) {
  const bs = W.fs(L, 'body');
  const sh = L.u(14);
  const gap = L.u(14);
  const widths = items.map((it) => sh + L.u(6) + W.measure(ctx, it.label, bs, 700));
  const total = widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
  let x = L.cx - total / 2;
  const cy = y + bs * 0.8;
  items.forEach((it, i) => {
    const mx = x + sh / 2;
    if (it.kind === 'target') {
      ctx.fillStyle = C.target;
      ctx.fillRect(mx - L.u(4), cy - sh / 2 - 2, L.u(8), sh + 4);
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = T.MODE.outline;
      ctx.strokeRect(mx - L.u(4), cy - sh / 2 - 2, L.u(8), sh + 4);
    } else if (it.kind === 'you') R.pointer(ctx, mx, cy + sh * 0.5, sh * 0.62, C.you);
    else if (it.kind === 'late') R.dot(ctx, mx, cy, sh * 0.42, C.group, { hollow: true, dashed: true });
    else R.dot(ctx, mx, cy, sh * 0.42, C.group, { hollow: true });
    W.text(ctx, it.label, x + sh + L.u(6), cy, { size: bs, weight: 700, color: C.ink });
    x += widths[i] + gap;
  });
  return y + bs * 1.7;
}

function mqBlock(ctx, L, y, mqText) {
  const m = /^(.*?)(\d+)$/.exec(mqText || '');
  if (!m) {
    W.text(ctx, mqText || '', L.cx, y + L.u(16), { size: W.fs(L, 'title'), weight: 900, align: 'center' });
    return y + L.u(36);
  }
  const ls = W.fs(L, 'bodyL');
  const ss = W.fs(L, 'score');
  const lw = W.measure(ctx, m[1], ls, 800);
  const nw = W.measure(ctx, m[2], ss, 900);
  const gap = L.u(8);
  const x = L.cx - (lw + gap + nw) / 2;
  W.text(ctx, m[1].trim(), x, y + ss * 0.62, { size: ls, weight: 800, color: C.sub });
  W.text(ctx, m[2], x + lw + gap, y + ss * 0.55, { size: ss, weight: 900 });
  return y + ss * 1.2;
}

function subscribeCard(ctx, L, hits, sub, y) {
  if (!sub) return y;
  const bs = W.fs(L, 'bodyL');
  if (sub.state === 'offer' || sub.state === 'requesting') {
    const h = Math.max(L.u(64), T.MIN_TAP + L.u(16));
    W.card(ctx, L.x0, y, L.contentW, h, { r: L.u(14) });
    const bw = Math.max(L.u(104), W.measure(ctx, '提醒我', bs, 800) + L.u(32));
    W.text(ctx, '揭晓时提醒我', L.x0 + L.u(16), y + h / 2, { size: bs, weight: 800, maxW: L.contentW - bw - L.u(40) });
    W.button(ctx, L, hits, { id: 'round:subscribe', x: L.x0 + L.contentW - bw - L.u(10), y: y + (h - T.MIN_TAP) / 2, w: bw, h: T.MIN_TAP, label: sub.state === 'requesting' ? '请求中…' : '提醒我', kind: 'secondary', disabled: sub.state === 'requesting', size: bs });
    return y + h + L.u(10);
  }
  if (sub.state === 'granted') {
    W.text(ctx, '已开启：揭晓时会提醒你', L.cx, y + L.u(16), { size: W.fs(L, 'body'), weight: 700, color: C.good, align: 'center' });
    return y + L.u(36);
  }
  return y;
}

/** One or two pinned buttons. specs: [{id,label,kind,disabled}] */
function pinned(ctx, L, hits, specs, stacked) {
  const bh = K.btnH(L);
  if (stacked || specs.length === 1) {
    let y = L.bottomEdge - L.bottomPad - specs.length * bh - (specs.length - 1) * L.u(10);
    specs.forEach((s) => {
      W.button(ctx, L, hits, Object.assign({ x: L.x0, y, w: L.contentW, h: bh }, s));
      y += bh + L.u(10);
    });
    return L.bottomEdge - L.bottomPad - specs.length * bh - (specs.length - 1) * L.u(10);
  }
  const y = L.bottomEdge - L.bottomPad - bh;
  const gap = L.u(10);
  const w1 = (L.contentW - gap) * 0.56;
  W.button(ctx, L, hits, Object.assign({ x: L.x0, y, w: w1, h: bh }, specs[0]));
  W.button(ctx, L, hits, Object.assign({ x: L.x0 + w1 + gap, y, w: L.contentW - w1 - gap, h: bh }, specs[1]));
  return y;
}

function pinnedHeight(L, n) {
  const bh = K.btnH(L);
  return n * bh + (n - 1) * L.u(10);
}

// ------------------------------------------------------------------ views

function messageView(ctx, L, hits, vm, top, o) {
  let y = top + L.u(70);
  if (o.spinner) {
    W.spinner(ctx, L.cx, y + L.u(16), L.u(16), vm.t);
    y += L.u(56);
  }
  if (o.skeleton) {
    W.text(ctx, o.title, L.cx, y + L.u(14), { size: W.fs(L, 'bodyL'), weight: 700, color: C.sub, align: 'center' });
    W.skeleton(ctx, L.x0, y + L.u(40), L.contentW, L.u(70), vm.t, L.u(12));
    W.skeleton(ctx, L.x0, y + L.u(124), L.contentW, L.u(44), vm.t, L.u(12));
  } else {
    y += W.paragraph(ctx, o.title, L.x0, y, L.contentW, W.fs(L, 'title') * 1.4, { size: W.fs(L, 'title'), weight: 900, align: 'center', color: o.color }) + L.u(8);
    if (o.text) W.paragraph(ctx, o.text, L.x0, y, L.contentW, W.fs(L, 'bodyL') * 1.5, { size: W.fs(L, 'bodyL'), color: C.sub, align: 'center' });
  }
  if (o.buttons) pinned(ctx, L, hits, o.buttons, true);
}

/** Guess / submitted. */
function guessView(ctx, L, hits, vm, top) {
  const submitted = vm.status === 'submitted';
  const isOpen = vm.status === 'open';
  const bh = K.btnH(L);
  let specs;
  if (submitted) specs = [{ id: 'round:home', label: '回首页', kind: 'secondary' }];
  else {
    specs = [
      { id: 'round:confirm', label: vm.submitting ? '提交中…' : '就这儿', kind: 'primary', disabled: !vm.canConfirm || vm.submitting },
      { id: 'round:home', label: '先去首页看看', kind: 'ghost' },
    ];
  }
  const pTop = L.bottomEdge - L.bottomPad - pinnedHeight(L, specs.length);
  W.scrollView(ctx, L, hits, {
    x: 0,
    y: top,
    w: L.W,
    h: pTop - L.u(8) - top,
    scroll: vm.scrollY || 0,
    id: 'round:scroll',
    draw(c, h, vh) {
      let y = top + L.u(4);
      W.text(c, vm.late ? '已揭晓 · 先猜再看' : '群友出了一道刻度题', L.cx, y + L.u(14), { size: W.fs(L, 'bodyL'), weight: 800, color: vm.late ? C.warn : C.sub, align: 'center' });
      y += L.u(34);
      y = spectrumLine(c, L, y, vm);
      y = clueNote(c, L, y, vm);
      if (vm.late) y = countLine(c, L, y, '揭晓后作答，不计入本题默契值', C.warn);
      else y = countLine(c, L, y, vm.guessCountText);
      const baseH = 0;
      void baseH;
      // ruler anchored low
      const dry = R.drawRuler(W.dryCtx(c), L, new Hits(), { y: 0, left: vm.left, right: vm.right, nudge: isOpen });
      const ry = submitted ? y + L.u(8) : Math.max(y + L.u(8), top + vh - dry.bottom - L.u(4));
      const needle = submitted ? vm.myGuess : vm.needle;
      R.drawRuler(c, L, h, {
        y: ry,
        left: vm.left,
        right: vm.right,
        needle,
        lift: vm.dragging ? 1 : 0,
        nudge: isOpen,
        nudgeLeft: needle != null && needle > 0,
        nudgeRight: needle != null && needle < 100,
        interactive: isOpen && !vm.submitting,
        empty: isOpen && needle == null,
        hint: '点一下或拖动，放上指针',
        t: vm.t,
      });
      let by = ry + dry.bottom + L.u(10);
      if (submitted) {
        by += W.paragraph(c, '已提交 · ' + (vm.guessCountText || '') + ' · 等待揭晓', L.x0, by, L.contentW, W.fs(L, 'bodyL') * 1.5, { size: W.fs(L, 'bodyL'), weight: 800, align: 'center' });
        if (vm.revealHint) by += W.paragraph(c, vm.revealHint, L.x0, by, L.contentW, W.fs(L, 'body') * 1.5, { size: W.fs(L, 'body'), color: C.sub, align: 'center' });
        by = subscribeCard(c, L, h, vm.subscribe, by + L.u(8));
      }
      return Math.max(by, ry + dry.bottom) + L.u(6);
    },
  });
  pinned(ctx, L, hits, specs, true);
  void bh;
}

/** Host waiting. */
function hostView(ctx, L, hits, vm, top) {
  const specs = [
    { id: 'round:reveal', label: vm.revealing ? '正在揭晓…' : '揭晓', kind: 'primary', disabled: !vm.canReveal || vm.revealing },
    { id: 'round:reshare', label: '再发到群里', kind: 'secondary' },
  ];
  const pTop = L.bottomEdge - L.bottomPad - pinnedHeight(L, 2);
  W.scrollView(ctx, L, hits, {
    x: 0,
    y: top,
    w: L.W,
    h: pTop - L.u(8) - top,
    scroll: vm.scrollY || 0,
    id: 'round:scroll',
    draw(c, h, vh) {
      let y = top + L.u(4);
      W.text(c, '你的题 · 只有你能看到位置', L.cx, y + L.u(14), { size: W.fs(L, 'bodyL'), weight: 800, color: C.targetText, align: 'center' });
      y += L.u(34);
      y = spectrumLine(c, L, y, vm);
      y = clueNote(c, L, y, vm);
      const t = vm.hostTarget;
      const dry = R.drawRuler(W.dryCtx(c), L, new Hits(), { y: 0, left: vm.left, right: vm.right });
      const ry = Math.max(y + L.u(8), top + vh - dry.bottom - L.u(150));
      R.drawRuler(c, L, h, { y: ry, left: vm.left, right: vm.right, band: t != null ? { from: Math.max(0, t - 2), to: Math.min(100, t + 2) } : null, interactive: false });
      let by = ry + dry.bottom + L.u(12);
      by += W.paragraph(c, vm.guessCountText || '', L.x0, by, L.contentW, W.fs(L, 'bodyL') * 1.5, { size: W.fs(L, 'bodyL'), weight: 900, align: 'center' });
      by += W.paragraph(c, vm.canReveal ? vm.revealHint || '' : vm.revealHint || '至少 2 人作答后可揭晓', L.x0, by, L.contentW, W.fs(L, 'body') * 1.5, { size: W.fs(L, 'body'), color: C.sub, align: 'center' });
      by = subscribeCard(c, L, h, vm.subscribe, by + L.u(8));
      return by + L.u(6);
    },
  });
  pinned(ctx, L, hits, specs, true);
}

/** Reveal (everyone). */
function revealView(ctx, L, hits, vm, top) {
  const rv = vm.reveal || { markers: [], mqText: '' };
  const specs = [
    { id: 'round:share', label: '分享揭晓', kind: 'primary' },
    { id: 'round:host', label: '我也出一道', kind: 'secondary' },
  ];
  const fitsRow = W.measure(ctx, '我也出一道', W.fs(L, 'bodyL'), 700) + L.u(16) <= (L.contentW - L.u(10)) * 0.44;
  const pTop = L.bottomEdge - L.bottomPad - pinnedHeight(L, fitsRow ? 1 : 2);
  const markers = (rv.markers || []).slice();
  const you = markers.find((m) => m.kind === 'you');
  W.scrollView(ctx, L, hits, {
    x: 0,
    y: top,
    w: L.W,
    h: pTop - L.u(8) - top,
    scroll: vm.scrollY || 0,
    id: 'round:scroll',
    draw(c, h) {
      let y = top + L.u(2);
      W.text(c, vm.clueText ? (vm.left || '') + ' ↔ ' + (vm.right || '') + ' · ' + vm.clueText.replace(/^提示[：:]/, '提示：') : (vm.left || '') + ' ↔ ' + (vm.right || ''), L.x0, y + L.u(14), { size: W.fs(L, 'body'), weight: 800, maxW: L.contentW });
      y += L.u(30);
      const r = R.drawRuler(c, L, h, { y, left: vm.left, right: vm.right, needle: you ? you.pos : vm.myGuess, markers, interactive: false, lanes: 0, youLabel: !!(you || vm.myGuess != null), revealT: vm.revealT });
      y = r.bottom + L.u(6);
      const kinds = [{ kind: 'target', label: '答案' }, { kind: 'member', label: '大家' }];
      if (markers.some((m) => m.kind === 'late')) kinds.push({ kind: 'late', label: '揭晓后' });
      if (you || vm.myGuess != null) kinds.push({ kind: 'you', label: '你' });
      y = legend(c, L, y, kinds) + L.u(2);
      y = mqBlock(c, L, y, rv.mqText) + L.u(4);
      y += B.box(c, L, h, vm, y) + L.u(8);
      if (vm.namesState === 'unauthorized') {
        W.text(c, '开启「微信朋友关系」可显示好友昵称', L.x0, y + L.u(14), { size: W.fs(L, 'body'), color: C.sub, maxW: L.contentW });
        y += L.u(28);
        W.button(c, L, h, { id: 'round:openSetting', x: L.x0, y, w: L.contentW, h: K.btnH(L), label: '去设置开启', kind: 'secondary' });
        y += K.btnH(L) + L.u(8);
      } else if (vm.namesState === 'privacyDenied') {
        W.paragraph(c, '查看昵称需要同意《用户隐私保护指引》', L.x0, y, L.contentW, W.fs(L, 'body') * 1.5, { size: W.fs(L, 'body'), color: C.sub });
        y += W.fs(L, 'body') * 3 + L.u(4);
        const hw = (L.contentW - L.u(10)) / 2;
        W.button(c, L, h, { id: 'round:contract', x: L.x0, y, w: hw, h: K.btnH(L), label: '查看指引', kind: 'secondary' });
        W.button(c, L, h, { id: 'round:agree', x: L.x0 + hw + L.u(10), y, w: hw, h: K.btnH(L), label: '同意并查看', kind: 'primary' });
        y += K.btnH(L) + L.u(8);
      }
      y = subscribeCard(c, L, h, vm.subscribe, y);
      return y + L.u(6);
    },
  });
  if (fitsRow) pinned(ctx, L, hits, specs, false);
  else pinned(ctx, L, hits, specs, true);
}

function draw(ctx, vm, L) {
  const hits = K.begin(ctx, vm, L);
  const status = vm.status || 'loading';
  const top = K.header(ctx, L, hits, { title: status === 'hostWaiting' ? '出的题' : status === 'revealed' || status === 'expired' ? '刻度题揭晓' : '刻度题' });
  switch (status) {
    case 'loading':
      messageView(ctx, L, hits, vm, top, { title: '展开题目…', skeleton: true });
      break;
    case 'open':
    case 'submitted':
      guessView(ctx, L, hits, vm, top);
      break;
    case 'revealedUnplayed':
      messageView(ctx, L, hits, vm, top, {
        title: '已揭晓',
        text: (vm.left || '') + ' ↔ ' + (vm.right || '') + '，想先猜一下，再看大家怎么放的吗？',
        buttons: [{ id: 'round:late', label: '先猜再看', kind: 'primary' }, { id: 'round:view', label: '直接看答案', kind: 'secondary' }],
      });
      break;
    case 'hostWaiting':
      hostView(ctx, L, hits, vm, top);
      break;
    case 'revealed':
      revealView(ctx, L, hits, vm, top);
      break;
    case 'expired':
      if (vm.reveal) revealView(ctx, L, hits, vm, top);
      else messageView(ctx, L, hits, vm, top, { title: '这道题已过期', text: '超过 7 天的题只能看揭晓。', buttons: [{ id: 'round:home', label: '回首页', kind: 'primary' }] });
      break;
    case 'noGuesses':
      if (vm.isHost) messageView(ctx, L, hits, vm, top, { title: '没有人作答，这道题结束了', buttons: [{ id: 'round:host', label: '再出一道', kind: 'primary' }, { id: 'round:home', label: '回首页', kind: 'secondary' }] });
      else messageView(ctx, L, hits, vm, top, { title: '这道题已经结束了', buttons: [{ id: 'round:daily', label: '去每日刻度', kind: 'primary' }, { id: 'round:home', label: '回首页', kind: 'secondary' }] });
      break;
    case 'notFound':
      messageView(ctx, L, hits, vm, top, { title: '找不到这道题', text: '链接可能已失效。', buttons: [{ id: 'round:home', label: '去首页', kind: 'primary' }] });
      break;
    case 'offline':
    default:
      messageView(ctx, L, hits, vm, top, { title: '题目需联网展开', text: '检查网络后点重试。', color: C.warn, buttons: [{ id: 'round:retry', label: '重试', kind: 'primary' }, { id: 'round:home', label: '先去首页看看', kind: 'secondary' }] });
  }
  return hits.result();
}

module.exports = { draw };
