/**
 * Challenge entry from a share card (spec 8.6). draw(ctx, vm, layout) -> hitAreas.
 *
 * vm = spec 13 Challenge model (+ display, t). The screen shows the sharer's
 * temperature chart and step count, never a word. No back button (entry
 * screen); the capsule row stays empty.
 *
 * Hit ids: challenge:accept (我来猜), challenge:home, challenge:retry,
 *   challenge:compare (only when alreadyFinished; logic normally routes
 *   straight to the comparison).
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits } = require('./layout');
const C = T.COLORS;

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display);
  const hits = new Hits();
  W.paper(ctx, L);
  const cw = L.contentW;
  const x = L.x0;
  const btnH = L.u(T.METRICS.btn);
  const gap = L.u(10);
  const large = T.METRICS.large;
  const lh = L.u(large ? 32 : 28);
  const bottom = L.bottomEdge - L.bottomPad;
  const top = L.navBottom + L.u(20);

  const primary = (id, label) => W.button(ctx, L, hits, { id, x, y: bottom - btnH, w: cw, h: btnH, label, kind: 'primary' });
  const secondary = (id, label, y) => W.button(ctx, L, hits, { id, x, y, w: cw, h: btnH, label, kind: 'secondary' });

  const state = vm.state || 'loading';

  if (state === 'loading') {
    W.card(ctx, x, top, cw, L.u(150), {});
    W.skeleton(ctx, x + L.u(20), top + L.u(24), cw * 0.6, L.u(22), vm.t, 8);
    W.skeleton(ctx, x + L.u(20), top + L.u(70), cw - L.u(40), L.u(50), vm.t, 8);
    W.text(ctx, '正在展开…', L.cx, top + L.u(190), { size: T.FS.bodyL, color: C.sub, align: 'center' });
    return hits.result();
  }
  if (state === 'notFound') {
    W.message(ctx, L, ['这道题找不到了', '可能已经过期，去首页看看今天的题吧'], top + L.u(40));
    primary('challenge:home', '去首页');
    return hits.result();
  }
  if (state === 'offline') {
    W.message(ctx, L, ['需联网展开', '检查网络后再试一次'], top + L.u(40));
    primary('challenge:retry', '重试');
    return hits.result();
  }

  // ready / own
  const o = vm.owner || { status: 'solved', steps: 0, hints: 0, temps: [] };
  let y = top;
  let head;
  if (state === 'own') head = '这是你分享的成绩';
  else if (o.status === 'gaveup') head = '好友在' + (vm.issueLabel || '') + '没猜中';
  else head = '好友在' + (vm.issueLabel || '') + '用了 ' + o.steps + ' 步';
  y += W.paragraph(ctx, head, x, y, cw, lh + L.u(6), { size: T.FS.title + 2, weight: 800, serif: true, align: 'center' }) + L.u(8);
  if (state === 'own' && vm.own) {
    const fin = vm.own.finishers || 0;
    const line = fin > 0 ? '已有 ' + fin + ' 位好友完成' + (vm.own.bestSteps != null ? ' · 最少 ' + vm.own.bestSteps + ' 步' : '') : '还没有好友完成';
    y += W.paragraph(ctx, line, x, y, cw, lh, { size: T.FS.bodyL, color: C.sub, align: 'center' }) + L.u(8);
  } else if (o.status !== 'gaveup') {
    const hl = o.hints > 0 ? '用了 ' + o.hints + ' 次提示' : '没有用提示';
    y += W.paragraph(ctx, hl, x, y, cw, lh, { size: T.FS.bodyL, color: C.sub, align: 'center' }) + L.u(8);
  }

  // their chart: no words
  const chartH = L.u(large ? 96 : 84);
  W.card(ctx, x, y, cw, chartH + L.u(44), { fill: C.surface, shadow: true });
  W.tempChart(ctx, x + L.u(14), y + L.u(12), cw - L.u(28), chartH, o.temps || [], o.bands || [], { axis: true });
  y += chartH + L.u(44) + L.u(16);

  if (state !== 'own') {
    y += W.paragraph(ctx, 'TA 的猜词路线在你完成后可见', x, y, cw, lh, { size: T.FS.bodyL, color: C.sub, align: 'center' }) + L.u(4);
    const note = vm.countsAsToday ? '这就是今日一词，计入今日榜单' : '往期题，不计入榜单';
    y += W.paragraph(ctx, note, x, y, cw, lh, { size: T.FS.bodyL, weight: 700, color: vm.countsAsToday ? C.accent : C.sub, align: 'center' });
  }

  if (vm.alreadyFinished) {
    primary('challenge:compare', '查看对比');
    secondary('challenge:home', '先去首页看看', bottom - btnH * 2 - gap);
  } else if (state === 'own') {
    primary('challenge:home', '去首页');
  } else {
    primary('challenge:accept', '我来猜');
    secondary('challenge:home', '先去首页看看', bottom - btnH * 2 - gap);
  }
  return hits.result();
}

module.exports = { draw };
