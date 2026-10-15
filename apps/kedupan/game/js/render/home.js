/**
 * Home (spec 6.1). The logo sits at the top; the daily card and menu are
 * anchored to the thumb zone when the screen is tall, and scroll when not.
 */

const T = require('./theme');
const W = require('./widgets');
const K = require('./chrome');
const S = require('./sheets');
const C = T.C;

function progressTicks(ctx, L, x, y, w, answered) {
  const n = 5;
  const gap = L.u(8);
  const sw = (w - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const done = i < answered;
    W.fillRR(ctx, x + i * (sw + gap), y, sw, L.u(10), L.u(5), done ? C.primary : C.skeleton);
    if (T.MODE.hc || done) W.strokeRR(ctx, x + i * (sw + gap), y, sw, L.u(10), L.u(5), done ? C.ink : C.lineStrong, T.MODE.hc ? 2 : 1.2);
  }
}

/** The daily card; returns its height. */
function dailyCard(ctx, L, hits, vm, x, y, w) {
  const d = vm.daily || { state: 'loading' };
  const pad = L.u(16);
  const iw = w - pad * 2;
  const bh = K.btnH(L);
  const bodyS = W.fs(L, 'body');
  const lines = [];
  let button = null; // {id, label, kind}
  let skeleton = false;
  let ticks = null;
  const title = '每日刻度 · 第 ' + (d.issueNo || '-') + ' 期 · 5 张卡';
  switch (d.state) {
    case 'loading':
      skeleton = true;
      break;
    case 'available':
      if (d.yesterdayText) lines.push({ t: d.yesterdayText, c: C.sub });
      if (d.streakText) lines.push({ t: d.streakText, c: C.youText, w: 800 });
      button = { id: 'home:daily', label: '开始', kind: 'primary' };
      ticks = 0;
      break;
    case 'inProgress':
      lines.push({ t: '已答 ' + d.answered + '/5', c: C.ink, w: 800 });
      if (d.streakText) lines.push({ t: d.streakText, c: C.youText, w: 800 });
      button = { id: 'home:daily', label: '继续', kind: 'primary' };
      ticks = d.answered;
      break;
    case 'done':
      lines.push({ t: d.scoreText || '', c: C.ink, w: 800 });
      lines.push({ t: '明日 0:00 换新卡 · 0:30 定分', c: C.sub });
      if (d.streakText) lines.push({ t: d.streakText, c: C.youText, w: 800 });
      button = { id: 'home:daily', label: '看结果', kind: 'primary' };
      ticks = 5;
      break;
    case 'pendingSubmit':
      lines.push({ t: '答案待发送', c: C.warn, w: 800 });
      lines.push({ t: '网络恢复后点重试', c: C.sub });
      button = { id: 'home:retry', label: '重试', kind: 'primary' };
      ticks = d.answered;
      break;
    default: // error, offline, unavailable
      lines.push({ t: '今日卡片需联网获取', c: C.warn, w: 800 });
      lines.push({ t: '往期刻度可以继续玩', c: C.sub });
      button = { id: 'home:retry', label: '重试', kind: 'primary' };
  }
  const lh = bodyS * 1.5;
  const titleH = W.fs(L, 'bodyL') * 1.6;
  let h = pad + titleH + L.u(6);
  lines.forEach((ln) => {
    h += W.paragraphHeight(ctx, ln.t, iw, lh, { size: bodyS, weight: ln.w }) + L.u(2);
  });
  if (skeleton) h += L.u(70);
  if (ticks != null) h += L.u(24);
  h += L.u(10) + bh + pad;
  W.card(ctx, x, y, w, h, { shadow: true, r: L.u(18) });
  // tape corner decoration
  W.note(ctx, x + w - L.u(78), y - L.u(8), L.u(54), L.u(16), { fill: 'rgba(242,201,76,0.85)', fold: false, rot: 3 });
  let cy = y + pad;
  W.text(ctx, title, x + pad, cy + titleH / 2, { size: W.fs(L, 'bodyL'), weight: 800, maxW: iw });
  cy += titleH + L.u(6);
  if (skeleton) {
    W.text(ctx, '正在取今日卡片…', x + pad, cy + lh / 2, { size: bodyS, color: C.sub });
    W.skeleton(ctx, x + pad, cy + lh + L.u(6), iw * 0.8, L.u(16), vm.t);
    W.skeleton(ctx, x + pad, cy + lh + L.u(34), iw * 0.55, L.u(16), vm.t);
    cy += L.u(70);
  }
  lines.forEach((ln) => {
    const lhh = W.paragraph(ctx, ln.t, x + pad, cy, iw, lh, { size: bodyS, weight: ln.w, color: ln.c });
    cy += lhh + L.u(2);
  });
  if (ticks != null) {
    progressTicks(ctx, L, x + pad, cy + L.u(8), iw, ticks);
    cy += L.u(24);
  }
  cy += L.u(10);
  if (button) W.button(ctx, L, hits, { id: button.id, x: x + pad, y: cy, w: iw, h: bh, label: button.label, kind: button.kind });
  else W.button(ctx, L, hits, { x: x + pad, y: cy, w: iw, h: bh, label: '请稍候…', kind: 'primary', disabled: true });
  return h;
}

function groupBanner(ctx, L, hits, vm, x, y, w) {
  const g = vm.group || { status: 'none' };
  const h = Math.max(T.MIN_TAP, L.u(52));
  if (g.status === 'checking') {
    W.card(ctx, x, y, w, h, { r: L.u(12) });
    W.text(ctx, '正在确认群聊…', x + L.u(16), y + h / 2, { size: W.fs(L, 'body'), color: C.sub });
    W.skeleton(ctx, x + w - L.u(90), y + h / 2 - L.u(8), L.u(74), L.u(16), vm.t);
    return h;
  }
  if (g.status !== 'ok' || !g.bannerText) return 0;
  W.note(ctx, x, y, w, h, { fill: C.noteYellow, rot: -0.6, fold: false });
  W.text(ctx, '来自群聊 · ' + g.bannerText, x + L.u(14), y + h / 2, { size: W.fs(L, 'body'), weight: 700, maxW: w - L.u(48) });
  W.iconChevron(ctx, x + w - L.u(18), y + h / 2, L.u(14), C.ink, 'right');
  hits.add('home:groupBanner', x, y, w, h);
  return h;
}

function menu(ctx, L, hits, vm, x, y, w) {
  const bh = K.btnH(L);
  const gap = L.u(10);
  let cy = y;
  const half = (w - gap) / 2;
  W.button(ctx, L, hits, { id: 'home:host', x, y: cy, w: half, h: bh, label: '出一道题' });
  W.button(ctx, L, hits, { id: 'home:archive', x: x + half + gap, y: cy, w: half, h: bh, label: '往期刻度' });
  cy += bh + gap;
  const third = (w - gap * 2) / 3;
  [['home:group', '本群'], ['home:friend', '好友榜'], ['home:howto', '玩法']].forEach((b, i) => {
    W.button(ctx, L, hits, { id: b[0], x: x + i * (third + gap), y: cy, w: third, h: bh, label: b[1], size: W.fs(L, 'bodyL') });
  });
  cy += bh + gap;
  // sound and settings: text links with 48pt tap areas
  const ly = cy + T.MIN_TAP / 2;
  W.link(ctx, L, hits, { id: 'home:sound', x, y: ly, label: vm.muted ? '声音 关' : '声音 开', icon: 'speaker', muted: !!vm.muted, size: W.fs(L, 'bodyL'), color: C.ink });
  W.link(ctx, L, hits, { id: 'home:settings', x: x + w, y: ly, align: 'right', label: '设置', size: W.fs(L, 'bodyL') });
  return cy + T.MIN_TAP - y;
}

function draw(ctx, vm, L) {
  const hits = K.begin(ctx, vm, L);
  const top = L.navBottom + L.u(4);
  const bottom = L.bottomEdge - L.bottomPad;
  W.scrollView(ctx, L, hits, {
    x: 0,
    y: top,
    w: L.W,
    h: bottom - top,
    scroll: vm.scrollY || 0,
    id: 'home:scroll',
    draw(c, h, vh) {
      let y = top + L.u(6);
      const logoBottom = K.logo(c, L, L.x0, y, L.contentW, vm.t);
      const gap = L.u(14);
      // measure the lower stack (dry), then anchor it to the bottom if there is room
      const stackH = stack(c, L, dryHits(h), vm, 0, true);
      const wanted = logoBottom + gap + L.u(10);
      const anchored = top + vh - stackH;
      y = Math.max(wanted, anchored);
      const used = stack(c, L, h, vm, y, false);
      return y + used + L.u(4);
    },
  });
  // sheets (drawn last, they own a scrim)
  if (vm.sheet === 'howto') S.drawHowto(ctx, L, hits, vm);
  else if (vm.sheet === 'settings') S.drawSettings(ctx, L, hits, vm);
  return hits.result();
}

function dryHits(h) {
  // a throwaway hit collector with the same interface
  const { Hits } = require('./layout');
  void h;
  return new Hits();
}

/** Draws (or, when dry, only measures) the lower stack; returns its height. */
function stack(ctx, L, hits, vm, y0, dry) {
  const c = dry ? W.dryCtx(ctx) : ctx;
  let y = y0;
  const gap = L.u(14);
  const ch = dailyCard(c, L, hits, vm, L.x0, y, L.contentW);
  y += ch + gap;
  const gh = groupBanner(c, L, hits, vm, L.x0, y, L.contentW);
  if (gh) y += gh + gap;
  y += menu(c, L, hits, vm, L.x0, y, L.contentW);
  return y - y0;
}

module.exports = { draw };
