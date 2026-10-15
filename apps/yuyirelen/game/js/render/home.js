/**
 * Home (spec 8.1). draw(ctx, vm, layout) -> hitAreas.
 *
 * vm = spec 13 Home model, plus optional extras (see CONTRACT.md):
 *   sheet: null | 'howto' | 'settings'   which sheet is open
 *   sheetScroll: px offset of the open sheet's body
 *   display: {largeText, highContrast}   (applyDisplay)
 *   t: ms clock (skeleton pulse)
 * Hit ids: home:daily (开始猜 / 继续猜 / 查看答案, by daily.state), home:retry,
 *   home:practice, home:again, home:groupBanner, home:groupBoard,
 *   home:friendBoard, home:archive, home:howto, home:sound, home:settings,
 *   plus sheet ids.
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits } = require('./layout');
const howto = require('./howto');
const settings = require('./settings');
const C = T.COLORS;

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display);
  const hits = new Hits();
  const d = vm.daily || { state: 'loading' };
  const large = T.METRICS.large;
  W.paper(ctx, L);

  const gap = L.u(L.compact ? 8 : 12);
  const cw = L.contentW;
  const x = L.x0;
  const tapH = L.u(T.METRICS.tap);
  const btnH = L.u(T.METRICS.btn);

  // ---- bottom-anchored stack (thumb zone) ----
  let y = L.bottomEdge - L.bottomPad;

  // footer: sound (left), settings (right)
  y -= tapH;
  const fy = y + tapH / 2;
  W.link(ctx, L, hits, { id: 'home:sound', x: x, y: fy, label: '声音 ' + (vm.muted ? '关' : '开'), icon: 'speaker', muted: vm.muted, color: C.sub, size: T.FS.bodyL });
  W.link(ctx, L, hits, { id: 'home:settings', x: x + cw, y: fy, label: '设置', align: 'right', color: C.sub, size: T.FS.bodyL });
  y -= L.u(2);

  // 群榜 / 好友榜 / 往期 / 玩法
  const items = [
    ['home:groupBoard', '群榜'],
    ['home:friendBoard', '好友榜'],
    ['home:archive', '往期'],
    ['home:howto', '玩法'],
  ];
  const cols = large ? 2 : 4;
  const rows = items.length / cols;
  const bw = (cw - (cols - 1) * L.u(8)) / cols;
  const gridH = rows * tapH + (rows - 1) * L.u(8);
  y -= gridH;
  items.forEach((b, i) => {
    const cx = x + (i % cols) * (bw + L.u(8));
    const cy = y + Math.floor(i / cols) * (tapH + L.u(8));
    W.button(ctx, L, hits, { id: b[0], x: cx, y: cy, w: bw, h: tapH, label: b[1], size: T.FS.bodyL });
  });
  y -= gap;

  // daily card
  const card = dailyCardLayout(ctx, vm, L, d, cw);
  y -= card.h;
  drawDailyCard(ctx, vm, L, hits, d, x, y, cw, card, btnH);
  y -= gap;

  // group line
  if (vm.hasGroupContext) {
    const bh = tapH;
    y -= bh;
    W.fillRR(ctx, x, y, cw, bh, L.u(12), 'rgba(196,61,28,0.10)');
    W.strokeRR(ctx, x, y, cw, bh, L.u(12), C.accent, 1.5);
    W.text(ctx, '来自群聊 · 查看本群今日战况', x + L.u(14), y + bh / 2, { size: T.FS.body, weight: 700, color: C.accent, maxW: cw - L.u(48) });
    W.iconChevron(ctx, x + cw - L.u(18), y + bh / 2, L.u(13), C.accent);
    hits.add('home:groupBanner', x, y, cw, bh);
    y -= gap;
  }

  // ---- title block fills what is left above (never overlaps the stack) ----
  const top = L.navBottom + L.u(4);
  const avail = y - top;
  const fill = d.state === 'solved' ? 1 : d.state === 'inProgress' ? 0.65 : 0.8;
  const ts = Math.max(0.55, Math.min(1.25, avail / L.u(170)));
  const fullH = L.u(60) * ts + L.u(10) * ts + L.u(40) * ts + L.u(10) * ts + Math.max(T.FS.body, L.u(17) * ts);
  if (avail >= fullH) {
    const logoH = L.u(60) * ts;
    const tSize = L.u(40) * ts;
    const tagSize = Math.max(T.FS.body, L.u(17) * ts);
    let by = top + Math.max(0, (avail - fullH) / 2);
    W.logoThermometer(ctx, L.cx, by, logoH, fill);
    by += logoH + L.u(10) * ts;
    W.spaced(ctx, '语 义 热 冷', L.cx, by + tSize / 2, { size: tSize, weight: 800, serif: true, color: C.ink, align: 'center', spacing: tSize * 0.12 });
    by += tSize + L.u(10) * ts;
    W.text(ctx, '猜秘密词，越猜越热', L.cx, by + tagSize / 2, { size: tagSize, color: C.sub, align: 'center', maxW: cw });
  } else if (avail >= L.u(44)) {
    // short screens (large text): the name alone
    const tSize = Math.min(L.u(34), avail * 0.7);
    W.spaced(ctx, '语 义 热 冷', L.cx, top + avail / 2, { size: tSize, weight: 800, serif: true, color: C.ink, align: 'center', spacing: tSize * 0.12 });
  }

  if (vm.sheet === 'howto') howto.drawInto(ctx, vm, L, hits);
  else if (vm.sheet === 'settings') settings.drawInto(ctx, vm, L, hits);
  return hits.result();
}

/** What the daily card shows for a state, and how tall it needs to be. */
function dailyCardModel(d) {
  const m = { line: null, sub: null, label: '开始猜', id: 'home:daily', kind: 'primary', second: null, disabled: false, warn: false };
  switch (d.state) {
    case 'loading':
      m.disabled = true;
      m.label = '开始猜';
      m.kind = 'secondary';
      break;
    case 'inProgress':
      m.line = '已猜 ' + (d.steps != null ? d.steps : 0) + ' 步' + (d.bestLabel ? ' · ' + d.bestLabel : '');
      m.label = '继续猜';
      break;
    case 'solved':
      m.line = '今日 ' + d.steps + ' 步猜中';
      m.sub = '明日 0:00 换新词';
      m.label = '查看答案';
      m.second = { id: 'home:again', label: '再来一题' };
      break;
    case 'gaveup':
      m.line = '今日未猜中';
      m.sub = '明日 0:00 换新词';
      m.label = '查看答案';
      m.second = { id: 'home:again', label: '再来一题' };
      break;
    case 'unavailable':
      m.line = '今日一词暂未发布';
      m.sub = '先练习一题吧';
      m.label = '练习一题';
      m.id = 'home:practice';
      break;
    case 'offline':
    case 'error':
      m.line = '今日一词需联网获取';
      m.sub = '检查网络后再试';
      m.label = '重试';
      m.id = 'home:retry';
      m.warn = true;
      break;
    default:
      m.sub = '全国同一个词，第 1 名就是答案';
      break;
  }
  return m;
}

function dailyCardLayout(ctx, vm, L, d, cw) {
  const m = dailyCardModel(d);
  const pad = L.u(14);
  const showStreak = !!(vm.streak && vm.streak.show) && d.state !== 'loading' && d.state !== 'offline' && d.state !== 'error' && d.state !== 'unavailable';
  const lineH = L.u(T.METRICS.large ? 34 : 28);
  const subH = L.u(T.METRICS.large ? 30 : 24);
  let h = pad + L.u(30); // title
  if (d.state === 'loading') h += L.u(T.METRICS.large ? 80 : 64);
  else {
    if (m.line) h += lineH;
    if (m.sub) {
      const n = W.paragraphHeight(ctx, m.sub, cw - 2 * pad, subH, { size: T.FS.body });
      h += n + L.u(4);
    }
    if (showStreak) h += subH + L.u(4);
    if (!m.line && !m.sub) h += L.u(8);
  }
  h += L.u(10) + L.u(T.METRICS.btn) + pad;
  return { h, m, showStreak, pad, lineH, subH };
}

function drawDailyCard(ctx, vm, L, hits, d, x, y, w, cl, btnH) {
  const { m, pad } = cl;
  W.card(ctx, x, y, w, cl.h, { shadow: true });
  const ix = x + pad;
  const iw = w - 2 * pad;
  const mx = ix + iw / 2;
  const issue = d.issueNo != null ? '今日一词 · 第 ' + d.issueNo + ' 期' : '今日一词';
  let cy = y + pad + L.u(15);
  W.text(ctx, issue, mx, cy, { size: T.FS.title, weight: 800, serif: true, maxW: iw, align: 'center' });
  cy += L.u(15);

  if (d.state === 'loading') {
    W.skeleton(ctx, ix + iw * 0.15, cy + L.u(10), iw * 0.7, L.u(18), vm.t, 6);
    W.text(ctx, '正在取今日一词…', mx, cy + L.u(T.METRICS.large ? 56 : 46), { align: 'center', size: T.FS.body, color: C.sub });
  } else {
    if (m.line) {
      W.text(ctx, m.line, mx, cy + cl.lineH / 2, { size: T.FS.bodyL + 2, weight: 800, color: m.warn ? C.accent : C.ink, serif: true, maxW: iw, align: 'center' });
      cy += cl.lineH;
    }
    if (cl.showStreak) {
      W.text(ctx, '连续猜中 ' + vm.streak.current + ' 天', mx, cy + cl.subH / 2, { size: T.FS.body, weight: 700, color: C.accent, align: 'center', maxW: iw });
      cy += cl.subH + L.u(4);
    }
    if (m.sub) {
      cy += W.paragraph(ctx, m.sub, ix, cy, iw, cl.subH, { size: T.FS.body, color: C.sub, align: 'center' }) + L.u(4);
    }
  }
  const by = y + cl.h - pad - btnH;
  if (m.second) {
    const gw = L.u(8);
    const w1 = Math.round((iw - gw) * 0.56);
    W.button(ctx, L, hits, { id: m.id, x: ix, y: by, w: w1, h: btnH, label: m.label, kind: m.kind, disabled: m.disabled });
    W.button(ctx, L, hits, { id: m.second.id, x: ix + w1 + gw, y: by, w: iw - w1 - gw, h: btnH, label: m.second.label, kind: 'secondary' });
  } else {
    W.button(ctx, L, hits, { id: m.id, x: ix, y: by, w: iw, h: btnH, label: m.label, kind: m.kind, disabled: m.disabled });
  }
}

module.exports = { draw };
