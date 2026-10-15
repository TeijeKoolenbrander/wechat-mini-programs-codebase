/**
 * Chain entry (spec 8.7): from an invite card, 我的接龙 or 本群接龙.
 * draw(ctx, vm, layout) -> hitAreas.
 *
 * PRIVACY: this screen never shows the prompt or any 棒 content, whatever the
 * vm carries. It reads only counts, kinds and pre-formatted status lines.
 * Missing headline/subline fall back to renderer-owned copy per state.
 *
 * vm = spec 12 Chain entry model plus extras: display, sheet, scrollY, t.
 *   `claimBusy` (bool): the 接这一棒 tap is in flight (button reads 正在接棒…).
 *   timerSecText (e.g. '限时 45 秒') is appended to the claimable subline only
 *   if the logic's subline is missing.
 * Hit ids: back (首页), entry:claim, entry:group, entry:revealNow, entry:new,
 *   entry:refresh, entry:subscribe, entry:share, entry:reveal, entry:teaser,
 *   entry:mine, entry:sameAgain, entry:home, entry:retry, plus sheet ids.
 */

const T = require('./theme');
const W = require('./widgets');
const { page } = require('./page');
const C = T.COLORS;

const SHOW_DOTS = { claimable: 1, taken: 1, pending: 1, prevMine: 1, capReached: 1, revealedParticipant: 1, revealedTeaser: 1, expired: 1, restricted: 1, rulesRequired: 1, ugcPaused: 1 };

function headlineFor(vm) {
  const n = vm.nextStep;
  const p = vm.passed == null ? 0 : vm.passed;
  switch (vm.state) {
    case 'claimable':
    case 'rulesRequired':
      return n ? '第 ' + n + ' 棒等你接' : '等你接';
    case 'taken':
      return '有群友正在接第 ' + (n || p + 1) + ' 棒（约 2 分钟内）';
    case 'pending':
      return '第 ' + p + ' 棒审核中，通常几分钟';
    case 'prevMine':
      return '上一棒是你传的，等别人接下一棒吧';
    case 'capReached':
      return '这条接龙你已经接了 3 棒，留给群友吧';
    case 'wrongGroup':
      return '接龙只能在发起的群里接力';
    case 'revealedParticipant':
      return '接龙揭晓了！';
    case 'revealedTeaser':
      return '一条接龙揭晓了';
    case 'expired':
      return '这条接龙没传完';
    case 'removed':
      return '该接龙已被移除';
    case 'notFound':
      return '找不到这条接龙';
    case 'restricted':
      return '你暂时不能参与接龙';
    case 'ugcPaused':
      return '接龙维护中，可以先看看已揭晓的接龙';
    case 'offline':
      return '需联网才能接龙';
    case 'error':
      return '没能打开这条接龙';
    default:
      return '展开接龙…';
  }
}

function sublineFor(vm) {
  if (vm.subline) return vm.subline;
  if (vm.state === 'claimable' || vm.state === 'rulesRequired') {
    const kind = vm.nextKind === 'describe' ? '上一棒是一幅画，你来猜一句' : vm.nextKind === 'draw' ? '上一棒是一句话，你来画出来' : null;
    return kind ? kind + (vm.timerSecText ? '（' + vm.timerSecText + '）' : '') : null;
  }
  if (vm.state === 'rulesRequired') return '开始前先看一下接龙公约';
  return null;
}

/** Buttons for a state: [{id, label, kind, disabled}], first one is the primary. */
function actionsFor(vm) {
  const sub = (vm.subscribe && vm.subscribe.state) || 'hidden';
  const subBtn = sub === 'offer' || sub === 'requesting' ? { id: 'entry:subscribe', label: sub === 'requesting' ? '请求中…' : '揭晓时提醒我', disabled: sub === 'requesting' } : null;
  const group = { id: 'entry:group', label: '看看本群其他接龙' };
  const part = !!vm.isParticipant;
  const share = part ? { id: 'entry:share', label: '发到群里接龙' } : null;
  const list = [];
  switch (vm.state) {
    case 'claimable':
      list.push({ id: 'entry:claim', label: vm.claimBusy ? '正在接棒…' : '接这一棒', disabled: !!vm.claimBusy }, group);
      if (vm.canRevealNow) list.push({ id: 'entry:revealNow', label: '现在揭晓' });
      break;
    case 'rulesRequired':
      list.push({ id: 'entry:claim', label: '接这一棒' }, group);
      break;
    case 'restricted':
    case 'ugcPaused':
      list.push({ id: 'entry:claim', label: '接这一棒', disabled: true }, group);
      break;
    case 'taken':
      list.push(group, { id: 'entry:new', label: '开一条新的' }, { id: 'entry:refresh', label: '刷新' });
      break;
    case 'pending':
    case 'prevMine':
    case 'capReached':
      if (subBtn) list.push(subBtn);
      if (share) list.push(share);
      list.push(group);
      if (vm.canRevealNow) list.push({ id: 'entry:revealNow', label: '现在揭晓' });
      break;
    case 'wrongGroup':
      list.push({ id: 'entry:new', label: '开一条新的' });
      break;
    case 'revealedParticipant':
      list.push({ id: 'entry:reveal', label: '看揭晓' }, group);
      break;
    case 'revealedTeaser':
      list.push({ id: 'entry:teaser', label: '看看结果' }, group);
      break;
    case 'expired':
      if (part) list.push({ id: 'entry:mine', label: '看我的那一棒' });
      if (vm.canSameAgain) list.push({ id: 'entry:sameAgain', label: '同题再传' });
      if (!list.length) list.push({ id: 'entry:home', label: '回首页' });
      break;
    case 'removed':
    case 'notFound':
      list.push({ id: 'entry:home', label: '回首页' });
      break;
    case 'offline':
    case 'error':
      list.push({ id: 'entry:retry', label: '重试' });
      break;
    default:
      break;
  }
  return list;
}

function draw(ctx, vm, L) {
  T.applyDisplay(vm.display); // sizes below depend on the mode
  const state = vm.state || 'loading';
  const v = Object.assign({}, vm, { state });
  const acts = actionsFor(v);
  const bh = W.btnH(L);
  const smallH = W.btnH(L, true);
  const gap = L.u(8);
  const footerH = acts.length ? bh + (acts.length - 1) * (smallH + gap) : 0;
  const total = vm.length || 6;
  const passed = Math.max(0, Math.min(total, vm.passed || 0));

  return page(ctx, vm, L, {
    back: { label: '首页', id: 'back' },
    footerH,
    center: true,
    footer: (c, h, r) => {
      let y = r.y;
      acts.forEach((a, i) => {
        const primary = i === 0 && !(state === 'taken');
        const hh = i === 0 ? bh : smallH;
        W.button(c, L, h, { id: a.id, x: r.x, y, w: r.w, h: hh, label: a.label, kind: i === 0 ? 'primary' : 'secondary', size: i === 0 ? T.FS.button : T.FS.body, disabled: a.disabled });
        y += hh + gap;
        void primary;
      });
    },
    body: (c, h, y0, x, w) => {
      let y = y0 + L.u(6);
      const cx = x + w / 2;
      // brand
      const small = L.compact || T.MODE.largeText;
      W.brushBaton(c, cx, y + 20, small ? 56 : 76, -0.5);
      y += small ? 44 : 56;
      W.text(c, '传画接龙', cx, y + 14, { size: T.FS.bodyL, weight: 800, round: true, align: 'center', color: C.sub });
      y += 36;
      if (state === 'loading') {
        W.skeleton(c, cx - w * 0.3, y, w * 0.6, 26, vm.t, 13);
        W.skeleton(c, cx - w * 0.22, y + 38, w * 0.44, 20, vm.t, 10);
        W.text(c, '展开接龙…', cx, y + 90, { size: T.FS.bodyL, weight: 700, color: C.sub, align: 'center' });
        return y + 110 - y0;
      }
      if (SHOW_DOTS[state]) {
        const ds = Math.min(L.u(30), (w - 20) / (total * 1.55));
        W.chainDots(c, cx, y + ds / 2, passed, total, ds);
        y += ds + 10;
        W.text(c, '已传 ' + passed + '/' + total + ' 棒', cx, y + 12, { size: T.FS.body, weight: 700, color: C.sub, align: 'center' });
        y += 34;
      }
      const hs = T.FS.hero - (T.MODE.largeText ? 2 : 4);
      const hl = Math.round(hs * 1.35);
      const headline = vm.headline || headlineFor(v);
      y += W.paragraph(c, headline, x + 4, y, w - 8, hl, { size: hs, weight: 900, round: true, align: 'center', maxLines: 4 }) + 8;
      const subline = sublineFor(v);
      if (subline) y += W.paragraph(c, subline, x + 4, y, w - 8, Math.round(T.FS.bodyL * 1.5), { size: T.FS.bodyL, weight: 600, color: C.sub, align: 'center', maxLines: 4 }) + 6;
      if (vm.takenEtaText && state === 'taken') y += W.paragraph(c, vm.takenEtaText, x + 4, y, w - 8, Math.round(T.FS.body * 1.5), { size: T.FS.body, color: C.sub, align: 'center' }) + 4;
      if (vm.timeLeftText && (state === 'claimable' || state === 'taken' || state === 'pending' || state === 'prevMine' || state === 'capReached')) {
        y += 6;
        W.text(c, '48 小时内传完 · ' + vm.timeLeftText, cx, y + 12, { size: T.FS.body, weight: 600, color: C.sub, align: 'center', maxW: w });
        y += 30;
      }
      return y - y0;
    },
  });
}

module.exports = { draw, headlineFor, actionsFor };
