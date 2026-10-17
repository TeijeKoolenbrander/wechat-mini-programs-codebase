/**
 * Room entry (spec 8.16): what a non-member sees after tapping a room card, home's group line or a 本群接龙 row. It never
 * shows anything a player has made. The wording (headline, subline, joinedText) comes from the vm; the renderer decides the
 * layout and which actions each state offers.
 *
 * States loading | joinable | full | started | teaser | wrongGroup | closed | removed | notFound | inOtherRoom | restricted |
 * rulesRequired | ugcPaused | capReached | offline | error. (`teaser` is drawn as `started`; logic normally switches to the
 * teaser screen.)
 * Hit ids: roomEntry:home, roomEntry:join, roomEntry:newRoom, roomEntry:group, roomEntry:backToRoom, roomEntry:leaveOther,
 * roomEntry:retry, roomEntry:scroll.
 */

const T = require('./theme');
const W = require('./widgets');
const S = require('./screen');
const Art = require('./art');
const C = T.COLORS;

function draw(ctx, vm, L) {
  const hits = S.begin(ctx, vm, L);
  const st = vm.state || 'joinable';
  W.backButton(ctx, L, hits, '首页', 'roomEntry:home');
  const bw = L.contentW;
  const area = S.area(L, L.navBottom + 4);
  if (st === 'loading') {
    S.statePanel(ctx, L, hits, { y: area.y + 16, skeleton: true, rows: 3, headline: '正在进入…', t: vm.t });
    return hits.result();
  }

  const acts = [];
  const joinLabel = vm.joining ? '加入中…' : '加入这一局';
  switch (st) {
    case 'joinable': case 'rulesRequired':
      acts.push({ id: 'roomEntry:join', label: joinLabel, kind: 'primary', big: true, disabled: !!vm.joining });
      break;
    case 'restricted': case 'ugcPaused': case 'capReached':
      acts.push({ id: 'roomEntry:join', label: '加入这一局', kind: 'primary', big: true, disabled: true });
      break;
    case 'full': case 'started': case 'teaser':
      acts.push({ id: 'roomEntry:newRoom', label: '开一局', kind: 'primary', big: true });
      acts.push({ id: 'roomEntry:group', label: '本群接龙', kind: 'secondary' });
      break;
    case 'wrongGroup': case 'closed':
      acts.push({ id: 'roomEntry:newRoom', label: '开一局', kind: 'primary', big: true });
      break;
    case 'removed': case 'notFound':
      acts.push({ id: 'roomEntry:home', label: '首页', kind: 'primary', big: true });
      break;
    case 'inOtherRoom':
      acts.push({ id: 'roomEntry:backToRoom', label: '回到那一局', kind: 'primary', big: true });
      acts.push({ id: 'roomEntry:leaveOther', label: '离开那一局', kind: 'secondary' });
      break;
    case 'offline': case 'error':
      acts.push({ id: 'roomEntry:retry', label: '重试', kind: 'primary', big: true });
      break;
    default:
      break;
  }

  const lh = Math.round(T.FS.title * 1.4);
  const slh = Math.round(T.FS.bodyL * 1.5);
  const hl = W.wrapBalanced(ctx, vm.headline || '', bw - 16, T.FS.title, 800);
  const subl = vm.subline ? W.wrapBalanced(ctx, vm.subline, bw - 16, T.FS.bodyL, 500) : [];
  const stateArt = st === 'offline' ? 'offline' : st === 'error' ? 'error' : st === 'removed' || st === 'notFound' || st === 'closed' || st === 'wrongGroup' ? 'empty' : null;
  const mascot = L.u(L.compact ? 60 : 84);
  const artH = stateArt ? L.u(84) : mascot;
  const joinedH = vm.joinedText ? Math.round(T.FS.bodyL * 1.6) + 10 : 0;
  const note = vm.restrictionText || null;
  const noteLines = note ? W.wrap(ctx, note, bw - 28 - 26, T.FS.body, 600) : [];
  const noteH = noteLines.length ? noteLines.length * Math.round(T.FS.body * 1.5) + 20 : 0;
  const contentH = artH + 8 + Math.round(T.FS.bodyL * 1.5) + 12 + hl.length * lh + (subl.length ? 6 + subl.length * slh : 0) + joinedH + (noteH ? noteH + 10 : 0);
  const bh = T.btn(L, 56);
  const sh = T.btn(L, 48);
  const actionsH = acts.reduce((a, x) => a + (x.big ? bh : sh) + 8, -8);

  S.page(ctx, L, hits, {
    area, contentH, actionsH: acts.length ? actionsH : 0, scroll: vm.scrollY, id: 'roomEntry:scroll',
    drawContent(y0) {
      let y = y0 + 2;
      if (stateArt) Art.stateArt(ctx, L.cx, y + L.u(42), L.u(84), stateArt);
      else Art.mascot(ctx, L.cx, y + mascot / 2, mascot);
      y += artH + 8;
      W.text(ctx, '传画接龙', L.cx, y + Math.round(T.FS.bodyL * 0.75), { size: T.FS.bodyL, weight: 800, color: C.orangeDeep, align: 'center' });
      y += Math.round(T.FS.bodyL * 1.5) + 12;
      hl.forEach((ln, i) => W.text(ctx, ln, L.cx, y + i * lh + lh / 2, { size: T.FS.title, weight: 800, align: 'center' }));
      y += hl.length * lh;
      if (subl.length) {
        y += 6;
        subl.forEach((ln, i) => W.text(ctx, ln, L.cx, y + i * slh + slh / 2, { size: T.FS.bodyL, weight: 500, color: C.sub, align: 'center' }));
        y += subl.length * slh;
      }
      if (vm.joinedText) {
        W.chip(ctx, L, L.cx, y + joinedH / 2 + 4, vm.joinedText, { kind: 'wait', size: T.FS.bodyL, align: 'center' });
        y += joinedH;
      }
      if (noteH) {
        y += 10;
        W.fillRR(ctx, L.x0, y, bw, noteH, 12, C.vermSoft);
        W.strokeRR(ctx, L.x0, y, bw, noteH, 12, C.vermText, T.isHC() ? 2 : 1.5);
        W.iconStatus(ctx, L.x0 + 18, y + noteH / 2, 16, 'bad', C.vermText);
        noteLines.forEach((ln, i) => W.text(ctx, ln, L.x0 + 34, y + 10 + i * Math.round(T.FS.body * 1.5) + Math.round(T.FS.body * 0.75), { size: T.FS.body, weight: 600, color: C.vermText }));
      }
    },
    drawActions(y0) {
      let y = y0;
      acts.forEach((a) => {
        const h = a.big ? bh : sh;
        W.button(ctx, L, hits, { id: a.id, x: L.x0, y, w: bw, h, label: a.label, kind: a.kind, disabled: a.disabled, size: a.big ? undefined : T.FS.body + 1 });
        y += h + 8;
      });
    },
  });
  return hits.result();
}

module.exports = { draw };
