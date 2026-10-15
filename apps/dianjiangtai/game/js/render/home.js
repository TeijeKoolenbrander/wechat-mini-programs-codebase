/**
 * Home (spec 8.1). draw(ctx, vm, layout) -> hitAreas.
 *
 * vm = spec 13 Home model, plus optional extras (see CONTRACT.md):
 *   sheet: null | 'howto' | 'settings'   which sheet is open
 *   t: ms clock (skeleton pulse)
 * Hit ids: home:daily (出征 / 继续出征 / 查看战报, logic decides by state),
 *   home:retry, home:free, home:groupBoard, home:friendBoard, home:howto,
 *   home:sound, home:settings, home:groupBanner, plus sheet ids.
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits } = require('./layout');
const howto = require('./howto');
const settings = require('./settings');
const { recordDigits } = require('./fmt');
const C = T.COLORS;

function draw(ctx, vm, L) {
  const hits = new Hits();
  const d = vm.daily || { state: 'loading' };
  W.paper(ctx, L);

  const gap = L.u(L.compact ? 8 : 12);
  const cw = L.contentW;
  const x = L.x0;

  // ---- bottom-anchored stack (thumb zone) ----
  let y = L.bottomEdge - L.bottomPad;

  // footer: sound (left), privacy and settings (right)
  const footH = L.u(48);
  y -= footH;
  const fy = y + footH / 2;
  W.link(ctx, L, hits, { id: 'home:sound', x: x, y: fy, label: '声音 ' + (vm.muted ? '关' : '开'), icon: 'speaker', muted: vm.muted, color: C.sub });
  W.link(ctx, L, hits, { id: 'home:settings', x: x + cw, y: fy, label: '隐私与设置', align: 'right', color: C.sub });
  y -= L.u(4);

  // 群榜 / 好友榜 / 玩法
  const rowH = L.u(48);
  y -= rowH;
  const bw = (cw - 2 * L.u(8)) / 3;
  [
    ['home:groupBoard', '群 榜'],
    ['home:friendBoard', '好友榜'],
    ['home:howto', '玩 法'],
  ].forEach((b, i) => W.button(ctx, L, hits, { id: b[0], x: x + i * (bw + L.u(8)), y, w: bw, h: rowH, label: b[1], size: T.FS.bodyL }));
  y -= gap;

  // 自由点将
  const freeH = L.u(L.compact ? 50 : 54);
  y -= freeH;
  W.button(ctx, L, hits, { id: 'home:free', x, y, w: cw, h: freeH, label: '自由点将 · 不限次', size: T.FS.bodyL + 1 });
  y -= gap;

  // daily card
  const btnH = L.u(L.compact ? 52 : 56);
  const cardPad = L.u(14);
  const cardH = L.u(L.compact ? 160 : 168);
  y -= cardH;
  drawDailyCard(ctx, vm, L, hits, d, x, y, cw, cardH, cardPad, btnH);
  const cardTop = y;
  y -= gap;

  // group banner
  if (vm.hasGroupContext) {
    const bh = L.u(46);
    y -= bh;
    W.fillRR(ctx, x, y, cw, bh, L.u(10), 'rgba(179,38,30,0.10)');
    W.strokeRR(ctx, x, y, cw, bh, L.u(10), C.seal, 1.5);
    W.text(ctx, '来自群聊 · 查看本群今日排行', x + L.u(14), y + bh / 2, { size: T.FS.body, weight: 700, color: C.seal, maxW: cw - L.u(48) });
    W.text(ctx, '›', x + cw - L.u(18), y + bh / 2, { size: T.FS.title, weight: 700, color: C.seal, align: 'center' });
    hits.add('home:groupBanner', x, y - (L.u(48) - bh) / 2, cw, Math.max(bh, L.u(48)));
    y -= gap;
  }

  // ---- title block fills what is left above ----
  const top = L.navBottom + L.u(8);
  const avail = y - top;
  const titleScale = Math.max(0.62, Math.min(1.25, avail / L.u(150)));
  const seal = L.u(58) * titleScale;
  const tSize = L.u(38) * titleScale;
  const blockH = seal + L.u(10) * titleScale + tSize;
  let by = top + Math.max(0, (avail - blockH) / 2);
  W.sealStamp(ctx, L.cx, by + seal / 2, seal, '点将', '', { rotate: -6 });
  by += seal + L.u(10) * titleScale;
  W.spaced(ctx, '点 将 台', L.cx, by + tSize / 2, { size: tSize, weight: 800, serif: true, color: C.ink, align: 'center', spacing: tSize * 0.28 });
  void cardTop;

  if (vm.sheet === 'howto') howto.drawInto(ctx, L, hits);
  else if (vm.sheet === 'settings') settings.drawInto(ctx, vm, L, hits);
  return hits.result();
}

function drawDailyCard(ctx, vm, L, hits, d, x, y, w, h, pad, btnH) {
  W.card(ctx, x, y, w, h, { shadow: true });
  const ix = x + pad;
  const iw = w - 2 * pad;
  const mx = ix + iw / 2;
  const issue = d.issueNo != null ? '今日军令 · 第 ' + d.issueNo + ' 期' : '今日军令';
  W.text(ctx, issue, mx, y + L.u(24), { size: T.FS.title, weight: 800, serif: true, maxW: iw, align: 'center' });

  let sub = '全服同一手令牌，每日一战';
  let subColor = C.sub;
  let label = '出 征';
  let id = 'home:daily';
  let kind = 'primary';
  let disabled = false;
  let line = null; // emphasised middle line

  switch (d.state) {
    case 'loading':
      sub = null;
      disabled = true;
      label = '出 征';
      kind = 'secondary';
      break;
    case 'inProgress':
      line = '第 ' + (d.round || 1) + ' / 5 轮';
      label = '继续出征';
      break;
    case 'done':
      line = '今日 ' + recordDigits(d.record) + (d.bandLabel ? ' · ' + d.bandLabel : '');
      sub = '明日 0:00 换新令';
      label = '查看战报';
      break;
    case 'pendingSubmit':
      line = '战报待发送';
      sub = '网络不通，稍后会自动重试';
      label = '重 试';
      id = 'home:retry';
      break;
    case 'error':
    case 'offline':
      line = '今日军令需联网获取';
      sub = '自由点将不受影响';
      label = '重 试';
      id = 'home:retry';
      kind = 'primary';
      break;
    default:
      break;
  }

  if (d.state === 'loading') {
    W.skeleton(ctx, ix + iw * 0.15, y + L.u(40), iw * 0.7, L.u(18), vm.t, 6);
    W.text(ctx, '正在取今日军令…', mx, y + L.u(76), { align: 'center', size: T.FS.body, color: C.sub });
  } else if (line) {
    W.text(ctx, line, mx, y + L.u(L.compact ? 48 : 54), { size: T.FS.bodyL + 2, weight: 800, color: d.state === 'pendingSubmit' || d.state === 'error' || d.state === 'offline' ? C.seal : C.ink, serif: true, maxW: iw, align: 'center' });
    if (sub) W.text(ctx, sub, mx, y + L.u(L.compact ? 69 : 78), { size: T.FS.body, color: subColor, maxW: iw, align: 'center' });
  } else if (sub) {
    W.text(ctx, sub, mx, y + L.u(52), { size: T.FS.body, color: subColor, maxW: iw, align: 'center' });
  }
  W.button(ctx, L, hits, { id, x: ix, y: y + h - pad - btnH, w: iw, h: btnH, label, kind, disabled });
}

module.exports = { draw };
