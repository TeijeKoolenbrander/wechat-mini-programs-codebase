/**
 * Home (spec 6.2). draw(ctx, vm, layout) -> hitAreas.
 *
 * vm = spec 10 Home model plus extras (CONTRACT.md): t (ms clock for the
 * skeleton pulse), scrollY (only used when large text overflows), bannerText.
 * Sheets (howto, settings, category picker, report ...) are separate modules
 * drawn after this one; Home itself has no sheet state.
 *
 * Hit ids: home:daily (开始 / 继续 / 查看结果, logic decides by daily.state),
 *   home:retry, home:free, home:category, home:groupBoard, home:friendBoard,
 *   home:freeResume (only when vm.free.resumeText), home:history, home:howto, home:sound, home:settings, home:groupBanner,
 *   home:scroll (large text overflow only).
 */

const T = require('./theme');
const W = require('./widgets');
const { clamp } = require('./layout');
const C = T.COLORS;

function dailyCopy(d) {
  const issue = d.issueNo != null ? '今日一比 · 第 ' + d.issueNo + ' 期' + (d.themeLabel ? ' · ' + d.themeLabel : '') : '今日一比';
  const out = { title: issue, mid: null, midColor: C.ink, sub: [], label: '开 始', id: 'home:daily', kind: 'primary', disabled: false, skeleton: false };
  switch (d.state) {
    case 'loading':
      out.skeleton = true;
      out.sub = ['正在取今日题目…'];
      out.label = '开 始';
      out.kind = 'secondary';
      out.disabled = true;
      break;
    case 'inProgress':
      out.mid = d.progressText || '已连对 ' + (d.streak || 0);
      out.sub = ['全国同一套题，每天一次'];
      out.label = '继 续';
      break;
    case 'done': {
      const bits = ['今日连对 ' + (d.streak != null ? d.streak : 0)];
      if (d.rarityText) bits.push(d.rarityText);
      out.mid = bits.join(' · ');
      out.sub = ['明日 0:00 换新题'];
      if (d.finalizedByWindow) out.sub.push('（未答完，按当时连对记入）');
      out.label = '查看结果';
      break;
    }
    case 'error':
    case 'offline':
      out.mid = '今日一比需联网';
      out.midColor = C.seal;
      out.sub = ['随便比比不受影响'];
      out.label = '重 试';
      out.id = 'home:retry';
      break;
    default:
      out.sub = ['全国同一套题，每天一次'];
      break;
  }
  const ds = d.dayStreak && d.dayStreak.text;
  if (ds && d.state !== 'loading') out.sub.push(ds);
  return out;
}

/** The mid line (result, progress) breaks at its " · " into two centred lines when it does not fit, never inside a number. */
function midParts(ctx, L, c, iw) {
  if (W.measure(ctx, c.mid, T.FS.bodyL + 2, 800, true) <= iw) return [c.mid];
  return c.mid.split(' · ').slice(0, 2);
}
function midLines(ctx, L, c, iw) {
  return midParts(ctx, L, c, iw).length;
}

function dailyCardH(ctx, L, d, cw) {
  const c = dailyCopy(d);
  const pad = L.u(14);
  const inner = cw - 2 * pad;
  let h = pad + L.u(30) * (L.large ? 1.15 : 1); // title
  if (c.skeleton) h += L.u(34) * (L.large ? 1.15 : 1);
  else if (c.mid) h += midLines(ctx, L, c, inner) * L.u(34) * (L.large ? 1.15 : 1);
  c.sub.forEach((s) => (h += W.lineCount(ctx, s, inner, T.FS.body, 400, false, 2) * L.u(24) * (L.large ? 1.15 : 1)));
  h += L.u(10) + L.btnH + pad;
  return h;
}

function drawDailyCard(ctx, L, hits, d, x, y, w, h, t) {
  const c = dailyCopy(d);
  const pad = L.u(14);
  const iw = w - 2 * pad;
  const mx = x + w / 2;
  const kk = L.large ? 1.15 : 1;
  W.card(ctx, x, y, w, h, { shadow: true, r: L.u(14) });
  // accent tab on the left (the issue's theme colour is a muted ink here)
  ctx.save();
  W.rr(ctx, x, y, w, h, L.u(14));
  ctx.clip();
  ctx.fillStyle = C.seal;
  ctx.fillRect(x, y, L.u(6), h);
  ctx.restore();
  let cy = y + pad;
  W.text(ctx, c.title, mx, cy + (L.u(30) * kk) / 2, { size: T.FS.title, weight: 800, serif: true, align: 'center', maxW: iw });
  cy += L.u(30) * kk;
  if (c.skeleton) {
    W.skeleton(ctx, x + w * 0.2, cy + L.u(8), w * 0.6, L.u(18) * kk, t, 6);
    cy += L.u(34) * kk;
  } else if (c.mid) {
    const parts = midParts(ctx, L, c, iw);
    const n = parts.length;
    parts.forEach((ln, i) => W.text(ctx, ln, mx, cy + (L.u(34) * kk) * (i + 0.5), { size: T.FS.bodyL + 2, weight: 800, serif: true, color: c.midColor, align: 'center', maxW: iw }));
    cy += n * L.u(34) * kk;
  }
  c.sub.forEach((s, i) => {
    const isStreak = d.dayStreak && d.dayStreak.text === s;
    const n = W.paragraph(ctx, s, x + pad, cy, iw, L.u(24) * kk, { size: T.FS.body, color: isStreak ? C.seal : C.sub, weight: isStreak ? 700 : 400, align: 'center', maxLines: 2 });
    cy += n;
    void i;
  });
  W.button(ctx, L, hits, { id: c.id, x: x + pad, y: y + h - pad - L.btnH, w: iw, h: L.btnH, label: c.label, kind: c.kind, disabled: c.disabled });
}

function titleBlock(ctx, L, top, avail) {
  const ideal = L.u(150) * (L.large ? 1.1 : 1);
  const sc = clamp(avail / ideal, 0, 1.2);
  const cx = L.cx;
  if (avail < L.u(44)) return;
  if (avail < L.u(86)) {
    // small: title line only
    W.text(ctx, '比 一 比', cx, top + avail / 2, { size: Math.min(avail * 0.6, L.u(34)), weight: 900, serif: true, align: 'center' });
    return;
  }
  const full = avail >= L.u(132);
  const seal = L.u(58) * Math.max(0.6, full ? sc : Math.min(sc, 0.75));
  const tSize = L.u(40) * Math.max(0.7, sc);
  const subSize = T.FS.body;
  const blockH = seal + L.u(8) + tSize + (full ? L.u(6) + subSize * 1.4 : 0);
  let y = top + Math.max(0, (avail - blockH) / 2);
  W.seal(ctx, cx, y + seal / 2, seal, { rotate: -6 });
  y += seal + L.u(8);
  ctx.fillStyle = C.ink;
  // letter-spaced title
  const chars = ['比', '一', '比'];
  ctx.font = W.font(tSize, 900, true);
  const gapC = tSize * 0.4;
  const cwid = chars.map((c) => ctx.measureText(c).width);
  const total = cwid[0] + cwid[1] + cwid[2] + 2 * gapC;
  let px = cx - total / 2;
  chars.forEach((c, i) => {
    W.text(ctx, c, px, y + tSize / 2, { size: tSize, weight: 900, serif: true });
    px += cwid[i] + gapC;
  });
  y += tSize + L.u(6);
  if (full) W.text(ctx, '看上面的数，猜下面更多还是更少', cx, y + subSize * 0.7, { size: subSize, color: C.sub, align: 'center', maxW: L.contentW });
}

function draw(ctx, vm, L) {
  const hits = W.start(L);
  W.paper(ctx, L);
  const d = vm.daily || { state: 'loading' };
  const x = L.x0;
  const cw = L.contentW;
  const k = L.large ? 1.15 : 1;
  const gap = L.u(L.compact ? 8 : 12);
  const top = L.navBottom + L.u(4);
  const bottom = L.bottomEdge - L.bottomPad;
  const vpH = bottom - top;

  const showBanner = !!vm.hasGroupContext;
  const bannerH = L.u(46) * k;
  const cardH = dailyCardH(ctx, L, d, cw);
  const freeH = L.btnH2;
  const bestText = vm.free && vm.free.bestText;
  const resumeText = vm.free && vm.free.resumeText;
  const bestH = resumeText ? Math.max(T.MIN_TAP, L.u(26) * k) : bestText ? L.u(26) * k : 0;
  const rowH = L.u(48) * (L.large ? 1.25 : 1);
  const footH = L.u(48) * (L.large ? 1.25 : 1);
  const fixedH = (showBanner ? bannerH + gap : 0) + cardH + gap + freeH + bestH + gap + rowH + L.u(4) + footH;
  const titleMin = L.u(44);
  const titleH = vpH - fixedH;
  const scrollMax = titleH >= titleMin ? 0 : Math.ceil(titleMin + fixedH - vpH);
  const scrollY = scrollMax ? clamp(typeof vm.scrollY === 'number' ? vm.scrollY : 0, 0, scrollMax) : 0;
  hits.scrollMax['home:scroll'] = scrollMax;

  ctx.save();
  if (scrollMax > 0) {
    ctx.beginPath();
    ctx.rect(0, top, L.W, vpH);
    ctx.clip();
    hits.add('home:scroll', 0, top, L.W, vpH);
    hits.beginScroll({ x: 0, y: top, w: L.W, h: vpH }, -scrollY);
    ctx.translate(0, -scrollY);
  }
  const tH = scrollMax > 0 ? titleMin : titleH;
  titleBlock(ctx, L, top, tH);
  let y = top + tH;

  if (showBanner) {
    W.fillRR(ctx, x, y, cw, bannerH, L.u(10), 'rgba(184,67,47,0.10)');
    W.strokeRR(ctx, x, y, cw, bannerH, L.u(10), C.seal, 1.5);
    W.text(ctx, vm.bannerText || '来自群聊 · 查看本群今日排行', x + L.u(14), y + bannerH / 2, { size: T.FS.body, weight: 700, color: C.seal, maxW: cw - L.u(48) });
    W.text(ctx, '›', x + cw - L.u(18), y + bannerH / 2, { size: T.FS.title, weight: 700, color: C.seal, align: 'center' });
    hits.add('home:groupBanner', x, y - (T.MIN_TAP - bannerH) / 2 * (bannerH < T.MIN_TAP ? 1 : 0), cw, Math.max(bannerH, T.MIN_TAP));
    y += bannerH + gap;
  }

  drawDailyCard(ctx, L, hits, d, x, y, cw, cardH, vm.t);
  y += cardH + gap;

  // 随便比比 + category chip
  const catW = L.u(104) * (L.large ? 1.3 : 1);
  const freeW = cw - catW - L.u(8);
  W.button(ctx, L, hits, { id: 'home:free', x, y, w: freeW, h: freeH, label: L.large && L.W < 400 ? '随便比比' : '随便比比 · 不限次', size: T.FS.bodyL });
  const catLabel = (vm.free && vm.free.categoryLabel) || '全部';
  const catX = x + freeW + L.u(8);
  W.button(ctx, L, hits, { id: 'home:category', x: catX, y, w: catW, h: freeH, label: catLabel, size: T.FS.body, kind: 'ghost' });
  W.iconTri(ctx, catX + catW - L.u(16), y + freeH / 2, L.u(9), C.ink, 'down');
  y += freeH;
  if (resumeText) {
    // a text link under 随便比比: pick up the run that was left half way
    const used = W.text(ctx, resumeText, L.cx, y + bestH / 2, { size: T.FS.body, weight: 700, color: C.seal, align: 'center', maxW: cw });
    ctx.fillStyle = C.seal;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(L.cx - used / 2, y + bestH / 2 + T.FS.body * 0.6, used, 1);
    ctx.globalAlpha = 1;
    hits.add('home:freeResume', x, y, cw, bestH);
    y += bestH;
  } else if (bestText) {
    W.text(ctx, bestText, L.cx, y + bestH / 2 + L.u(2), { size: T.FS.body, color: C.sub, align: 'center', maxW: cw });
    y += bestH;
  }
  y += gap;

  // boards / history / how to play
  const bw = (cw - 3 * L.u(6)) / 4;
  [
    ['home:groupBoard', '群榜'],
    ['home:friendBoard', L.large && L.W < 400 ? '好友' : '好友榜'],
    ['home:history', '往期'],
    ['home:howto', '玩法'],
  ].forEach((b, i) => W.button(ctx, L, hits, { id: b[0], x: x + i * (bw + L.u(6)), y, w: bw, h: rowH, label: b[1], size: T.FS.body }));
  y += rowH + L.u(4);

  // footer
  const fy = y + footH / 2;
  W.link(ctx, L, hits, { id: 'home:sound', x, y: fy, label: '声音 ' + (vm.muted ? '关' : '开'), icon: 'speaker', muted: vm.muted, color: C.sub });
  W.link(ctx, L, hits, { id: 'home:settings', x: x + cw, y: fy, label: '设置', align: 'right', color: C.sub });
  hits.endScroll();
  ctx.restore();
  return hits.result();
}

module.exports = { draw, dailyCopy };
