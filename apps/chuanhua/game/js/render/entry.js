/**
 * Chain entry (spec 8.7): what a player sees after tapping an invite card or a list row. It NEVER shows the prompt or
 * any 棒 content (AC 10): only the progress dots, the step number and the kind of 棒. All 18 states; the wording of
 * headline / subline comes from the vm (core/copy.entryCopy), the renderer only decides layout and which actions each
 * state offers.
 * Rev. 2: 同题再传 is gone (expired offers 看我的那一棒 and 开一局); new state `inRoom` ("你正在一局里，先玩完再来接" + 回到这一局).
 * Hit ids: entry:claim, entry:group, entry:newRoom, entry:room, entry:refresh, entry:reveal, entry:viewReveal, entry:mine,
 * entry:subscribe, entry:share, entry:home, entry:retry, entry:scroll.
 */

const T = require('./theme');
const W = require('./widgets');
const S = require('./screen');
const Art = require('./art');
const C = T.COLORS;

const NO_DOTS = ['loading', 'notFound', 'offline', 'error', 'removed', 'wrongGroup', 'inRoom'];

function draw(ctx, vm, L) {
  const hits = S.begin(ctx, vm, L);
  const st = vm.state || 'claimable';
  W.backButton(ctx, L, hits, '首页', 'entry:home');
  const bw = L.contentW;
  const lh = Math.round(T.FS.title * 1.4);
  const slh = Math.round(T.FS.bodyL * 1.5);
  const hasKind = !!vm.nextKind;
  const showDots = !NO_DOTS.includes(st) && st !== 'revealedParticipant';
  const area = S.area(L, L.navBottom + L.u(4));

  // ---- which actions this state offers
  const acts = [];
  const claimLabel = vm.claiming ? '接龙中…' : '接这一棒';
  const part = !!vm.isParticipant;
  const subOffer = vm.subscribe && (vm.subscribe.state === 'offer' || vm.subscribe.state === 'requesting' || vm.subscribe.state === 'granted');
  switch (st) {
    case 'claimable': case 'rulesRequired':
      acts.push({ id: 'entry:claim', label: claimLabel, kind: 'primary', disabled: !!vm.claiming, big: true });
      if (vm.canRevealNow) acts.push({ id: 'entry:reveal', label: '现在揭晓', kind: 'secondary' });
      acts.push({ id: 'entry:group', label: '看看本群其他接龙', kind: 'secondary' });
      if (part) acts.push({ id: 'entry:share', label: '发到群里接龙', kind: 'ghost' });
      break;
    case 'restricted': case 'ugcPaused': case 'dailyLimit':
      acts.push({ id: 'entry:claim', label: '接这一棒', kind: 'primary', disabled: true, big: true });
      acts.push({ id: 'entry:group', label: '看看本群其他接龙', kind: 'secondary' });
      break;
    case 'taken':
      acts.push({ id: 'entry:refresh', label: '刷新', kind: 'primary', big: true });
      acts.push({ id: 'entry:group', label: '看看本群其他接龙', kind: 'secondary' });
      acts.push({ id: 'entry:newRoom', label: '开一局', kind: 'secondary' });
      break;
    case 'inRoom':
      acts.push({ id: 'entry:room', label: '回到这一局', kind: 'primary', big: true });
      acts.push({ id: 'entry:group', label: '看看本群其他接龙', kind: 'secondary' });
      break;
    case 'pending': case 'prevMine': case 'capReached':
      if (part && subOffer) acts.push({ id: 'entry:subscribe', label: '揭晓时提醒我', kind: 'primary', big: true, sub: vm.subscribe.state });
      acts.push({ id: 'entry:group', label: '看看本群其他接龙', kind: part && subOffer ? 'secondary' : 'primary', big: !(part && subOffer) });
      if (vm.canRevealNow) acts.push({ id: 'entry:reveal', label: '现在揭晓', kind: 'secondary' });
      acts.push({ id: 'entry:refresh', label: '刷新', kind: 'secondary' });
      if (part) acts.push({ id: 'entry:mine', label: '看我的那一棒', kind: 'secondary' }); // TD-44: own 棒 detail from an open chain
      if (part) acts.push({ id: 'entry:share', label: '发到群里接龙', kind: 'ghost' });
      break;
    case 'wrongGroup':
      acts.push({ id: 'entry:newRoom', label: '开一局', kind: 'primary', big: true });
      break;
    case 'revealedParticipant':
      acts.push({ id: 'entry:viewReveal', label: '看揭晓', kind: 'primary', big: true });
      break;
    case 'revealedTeaser':
      acts.push({ id: 'entry:newRoom', label: '开一局', kind: 'primary', big: true });
      acts.push({ id: 'entry:group', label: '看看本群其他接龙', kind: 'secondary' });
      break;
    case 'expired':
      if (part) acts.push({ id: 'entry:mine', label: '看我的那一棒', kind: 'primary', big: true });
      acts.push({ id: 'entry:newRoom', label: '开一局', kind: part ? 'secondary' : 'primary', big: !part });
      break;
    case 'removed': case 'notFound':
      acts.push({ id: 'entry:home', label: '首页', kind: 'primary', big: true });
      break;
    case 'offline': case 'error':
      acts.push({ id: 'entry:retry', label: '重试', kind: 'primary', big: true });
      break;
    default:
      break;
  }

  // ---- measurements
  const headline = vm.headline || '';
  const hl = W.wrapBalanced(ctx, headline, bw - L.u(16), T.FS.title, 800);
  const subl = vm.subline ? W.wrapBalanced(ctx, vm.subline, bw - L.u(16), T.FS.bodyL, 500) : [];
  const note = st === 'restricted' && vm.restrictionText ? vm.restrictionText : st === 'ugcPaused' ? '接龙维护中，可以先看看已揭晓的接龙' : null;
  const noteLines = note ? W.wrap(ctx, note, bw - 2 * L.u(14) - L.u(26), T.FS.body, 600) : [];
  const noteH = noteLines.length ? noteLines.length * Math.round(T.FS.body * 1.5) + 2 * L.u(10) : 0;
  const eta = st === 'taken' && vm.takenEtaText ? vm.takenEtaText : null;
  const timeLine0 = vm.timeLeftText && ['claimable', 'rulesRequired', 'taken', 'pending', 'prevMine', 'capReached', 'restricted', 'ugcPaused', 'dailyLimit'].includes(st) ? '48 小时内传完 · ' + vm.timeLeftText : null;
  const tl = !timeLine0 ? [] : W.measure(ctx, timeLine0, T.FS.body, 600) <= bw - L.u(40) ? [timeLine0] : ['48 小时内传完', vm.timeLeftText];
  const timeLine = timeLine0;
  const mascot = L.u(L.compact ? 60 : 84);
  const dotsH = showDots ? L.u(L.compact ? 56 : 66) : 0;
  const stateArt = st === 'offline' ? 'offline' : st === 'error' ? 'error' : st === 'notFound' || st === 'removed' ? 'empty' : null;
  const topH = (stateArt ? L.u(84) : mascot) + L.u(8) + Math.round(T.FS.bodyL * 1.5) + L.u(12);
  const contentH = topH + dotsH + (st === 'loading' ? 0 : hl.length * lh) + subl.length * slh + (subl.length ? L.u(6) : 0) + (noteH ? noteH + L.u(10) : 0) + (tl.length ? tl.length * Math.round(T.FS.body * 1.5) + L.u(8) : 0) + (st === 'loading' ? L.u(150) : 0);

  const bh = T.btn(L, 56);
  const sh = T.btn(L, 48);
  const actionsH = acts.reduce((a, x) => a + (x.big ? bh : x.kind === 'ghost' ? T.MIN_TAP : sh) + L.u(8), -L.u(8));

  S.page(ctx, L, hits, {
    area, contentH, actionsH: acts.length ? actionsH : 0, scroll: vm.scrollY, id: 'entry:scroll',
    drawContent(y0) {
      let y = y0 + L.u(2);
      if (stateArt) {
        Art.stateArt(ctx, L.cx, y + L.u(42), L.u(84), stateArt);
        y += L.u(84);
      } else {
        Art.mascot(ctx, L.cx, y + mascot / 2, mascot);
        y += mascot;
      }
      y += L.u(8);
      W.text(ctx, '传画接龙', L.cx, y + Math.round(T.FS.bodyL * 0.75), { size: T.FS.bodyL, weight: 800, color: C.orangeDeep, align: 'center' });
      y += Math.round(T.FS.bodyL * 1.5) + L.u(12);
      if (showDots) {
        W.progressDots(ctx, L.cx, y + L.u(10), vm.passed || 0, vm.length || 6, L.u(L.compact ? 10 : 12));
        W.text(ctx, '已传 ' + (vm.passed || 0) + '/' + (vm.length || 6) + ' 棒', L.cx, y + L.u(L.compact ? 38 : 44), { size: T.FS.bodyL, weight: 700, color: C.sub, align: 'center' });
        y += dotsH;
      }
      if (st === 'loading') {
        W.text(ctx, '展开接龙…', L.cx, y + L.u(10), { size: T.FS.bodyL, weight: 700, color: C.sub, align: 'center' });
        W.skeleton(ctx, L.x0 + bw * 0.15, y + L.u(36), bw * 0.7, L.u(24), vm.t || 0, 12);
        W.skeleton(ctx, L.x0 + bw * 0.25, y + L.u(74), bw * 0.5, L.u(18), (vm.t || 0) + 300, 9);
        return;
      }
      hl.forEach((ln, i) => W.text(ctx, ln, L.cx, y + i * lh + lh / 2, { size: T.FS.title, weight: 800, align: 'center' }));
      y += hl.length * lh;
      if (subl.length) {
        y += L.u(6);
        subl.forEach((ln, i) => W.text(ctx, ln, L.cx, y + i * slh + slh / 2, { size: T.FS.bodyL, weight: 500, color: C.sub, align: 'center' }));
        y += subl.length * slh;
      }
      void eta;
      if (noteH) {
        y += L.u(10);
        W.fillRR(ctx, L.x0, y, bw, noteH, L.u(12), C.vermSoft);
        W.strokeRR(ctx, L.x0, y, bw, noteH, L.u(12), C.vermText, T.isHC() ? 2 : 1.5);
        W.iconStatus(ctx, L.x0 + L.u(18), y + noteH / 2, L.u(16), 'bad', C.vermText);
        noteLines.forEach((ln, i) => W.text(ctx, ln, L.x0 + L.u(34), y + L.u(10) + i * Math.round(T.FS.body * 1.5) + Math.round(T.FS.body * 0.75), { size: T.FS.body, weight: 600, color: C.vermText }));
        y += noteH;
      }
      if (tl.length) {
        y += L.u(8);
        const tlh = Math.round(T.FS.body * 1.5);
        W.iconClock(ctx, L.cx - W.measure(ctx, tl[0], T.FS.body, 600) / 2 - L.u(16), y + tlh / 2, L.u(14), C.sub);
        tl.forEach((ln, i) => W.text(ctx, ln, L.cx, y + i * tlh + tlh / 2, { size: T.FS.body, weight: 600, color: C.sub, align: 'center' }));
      }
    },
    drawActions(y0) {
      let y = y0;
      acts.forEach((a) => {
        const h = a.big ? bh : a.kind === 'ghost' ? T.MIN_TAP : sh;
        let label = a.label;
        let dis = a.disabled;
        if (a.id === 'entry:subscribe') {
          if (a.sub === 'requesting') { label = '请求中…'; dis = true; }
          if (a.sub === 'granted') {
            W.iconCheck(ctx, L.cx - L.u(60), y + h / 2, L.u(14), C.greenText);
            W.text(ctx, '揭晓时会提醒你', L.cx - L.u(40), y + h / 2, { size: T.FS.bodyL, weight: 700, color: C.greenText });
            y += h + L.u(8);
            return;
          }
        }
        if (a.kind === 'ghost') {
          W.link(ctx, L, hits, { id: a.id, x: L.cx, y: y + h / 2, label, align: 'center', size: T.FS.body });
        } else W.button(ctx, L, hits, { id: a.id, x: L.x0, y, w: bw, h, label, kind: a.kind, disabled: dis, size: a.big ? undefined : T.FS.body + 1 });
        y += h + L.u(8);
      });
    },
  });
  return hits.result();
}

module.exports = { draw };
