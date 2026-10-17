/**
 * Home (spec 8.1, rev. 2). States loading | ready | offline | error. Title and tagline, the streak line ("连续接龙 4 天", only
 * when >= 2), the "回到这一局" card (while seated in a lobby / playing room), the group line ("本群有一局正在等人 ›"), then
 * pinned in the bottom 40%: the primary 开一局 (or 开一条接龙 when live rooms are off), the secondary link 慢慢传（不用同时在线）
 * and the four tiles 我的接龙 / 本群接龙 / 玩法 / 设置 (in large text the tiles move into the scrolling part). NO 今日起点
 * card, no national count, no 今日 chips (rev. 2).
 *
 * Sheets over home (vm.sheet): 'howto' (no data), 'rules' (vm.rules), 'warning' (vm.warningText, default the standard text),
 * 'settings' (vm.settings), 'startLimit' (vm.chainStart: the 慢慢传 starts used up, with the rewarded 再开一条).
 *
 * Hit ids: home:primary, home:slow, home:activeRoom, home:groupLine, home:album, home:groupList, home:howto, home:settings,
 * home:retry, home:scroll (+ the sheets' ids).
 */

const T = require('./theme');
const W = require('./widgets');
const S = require('./screen');
const Art = require('./art');
const C = T.COLORS;

function drawSheets(ctx, vm, L, hits) {
  const add = (arr) => {
    arr.forEach((a) => hits.add(a.id, a.x, a.y, a.w, a.h));
    Object.assign(hits.scrollMax, arr.scrollMax || {});
  };
  const display = vm.display;
  if (vm.sheet === 'howto') add(require('./howto').draw(ctx, { display, sheetScroll: vm.sheetScroll }, L));
  else if (vm.sheet === 'rules') add(require('./rules').draw(ctx, Object.assign({}, vm.rules || { version: 1, open: true, pendingAction: null }, { display, sheetScroll: vm.sheetScroll }), L));
  else if (vm.sheet === 'warning') add(require('./warning').draw(ctx, { text: vm.warningText || require('../../core/strikes').WARNING_TEXT, display, sheetScroll: vm.sheetScroll }, L));
  else if (vm.sheet === 'settings' && vm.settings) add(require('./settings').draw(ctx, Object.assign({}, vm.settings, { display, sheetScroll: vm.sheetScroll }), L));
  else if (vm.sheet === 'startLimit') add(require('./startLimit').draw(ctx, { chainStart: vm.chainStart, display, sheetScroll: vm.sheetScroll }, L));
}

function draw(ctx, vm, L) {
  const hits = S.begin(ctx, vm, L);
  const state = vm.state || 'ready';
  const compact = L.compact;
  const bw = L.contentW;
  const large = T.isLarge();
  const primary = vm.primary || { kind: 'room', label: '开一局', sublabel: null, enabled: false };
  const slow = vm.slowLink || { show: false, label: '慢慢传（不用同时在线）' };
  const navSize = T.FS.body + (large ? 0 : 1);

  // ---- pinned stack, bottom up: tiles (not in large text), link, primary
  const tiles = [
    { id: 'home:album', label: '我的接龙' },
    { id: 'home:groupList', label: '本群接龙' },
    { id: 'home:howto', label: '玩法' },
    { id: 'home:settings', label: '设置' },
  ];
  const gap = 8;
  const th = T.btn(L, 48);
  const unseen = (vm.album && vm.album.unseenReveals) || 0;
  const pinTiles = !large;
  const tileCols = (bw - 3 * 6) / 4 >= 88 ? 4 : 2;
  const tileRows = 4 / tileCols;
  const tilesH = pinTiles ? tileRows * th + (tileRows - 1) * 6 : 0;
  const linkH = slow.show ? Math.max(T.MIN_TAP, T.minBtn()) : 0;
  const subLines = primary.sublabel ? W.sublines(ctx, primary.sublabel, bw - 12).length : 0;
  const pH = Math.max(T.btn(L, 60), subLines ? Math.round(T.FS.button * 1.2) + subLines * Math.round(T.FS.body * 1.3) + 22 : 0);
  const stackH = pH + (linkH ? gap + linkH : 0) + (tilesH ? gap + tilesH : 0);
  const stackY = L.bottomEdge - 8 - stackH;
  const pY = stackY;
  const linkY = pY + pH + gap;
  const tilesY = (linkH ? linkY + linkH : pY + pH) + gap;

  // ---- scrolling part above the stack
  const area = { x: L.x0, y: L.navBottom, w: bw, h: stackY - 10 - L.navBottom };
  const blocks = [];
  // a small window in large text: the tagline goes and the mascot shrinks, so the cards and the first tile row stay in view at rest
  const tight = compact && (large || state === 'offline' || state === 'error');
  const heroMascot = tight ? 40 : compact ? 52 : 68;
  const heroH = tight ? heroMascot + 48 : heroMascot + (compact ? 40 : 54) + Math.round(T.FS.body * 1.5) + 6;
  blocks.push({ h: heroH, draw(y) {
    Art.mascot(ctx, L.cx, y + heroMascot / 2, heroMascot);
    W.text(ctx, '传 画 接 龙', L.cx, y + heroMascot + (tight ? 24 : compact ? 18 : 24), { size: T.FS.hero, weight: 900, align: 'center', maxW: bw });
    if (!tight) W.text(ctx, '群里一起画，传完一起笑', L.cx, y + heroMascot + (compact ? 18 : 24) + Math.round(T.FS.hero * 0.9), { size: T.FS.body, color: C.sub, align: 'center', maxW: bw });
  } });
  if (state === 'ready' && vm.streakText) {
    const sh = Math.round(T.FS.bodyL * 1.6);
    blocks.push({ h: sh + 8, draw(y) {
      W.text(ctx, vm.streakText, L.cx, y + sh / 2, { size: T.FS.bodyL, weight: 800, color: C.orangeDeep, align: 'center', maxW: bw });
    } });
  }

  const card = (id, text, fill, stroke, textColor, weight, arrow) => {
    const lh = Math.round(T.FS.body * 1.45);
    const lines = W.wrap(ctx, text, bw - 28 - 28, T.FS.bodyL, weight);
    const h = Math.max(T.MIN_TAP + 8, T.minBtn() + 8, lines.length * Math.round(T.FS.bodyL * 1.4) + 20);
    void lh;
    blocks.push({ h: h + 10, draw(y) {
      W.fillRR(ctx, L.x0, y, bw, h, 14, fill);
      W.strokeRR(ctx, L.x0, y, bw, h, 14, stroke, T.isHC() ? 2 : 2);
      const llh = Math.round(T.FS.bodyL * 1.4);
      lines.forEach((ln, i) => W.text(ctx, ln, L.x0 + 14, y + h / 2 + (i - (lines.length - 1) / 2) * llh, { size: T.FS.bodyL, weight, color: textColor }));
      if (arrow !== false) W.iconChevron(ctx, L.x0 + bw - 18, y + h / 2, 14, textColor);
      if (id) hits.add(id, L.x0, y, bw, h);
    } });
  };

  if (state === 'ready') {
    if (vm.activeRoom) card('home:activeRoom', vm.activeRoom.line, C.orangeSoft, C.ink, C.ink, 800);
    if (vm.groupLine && vm.groupLine.show) card('home:groupLine', vm.groupLine.text, C.blueSoft, C.blueText, C.blueText, 700);
  } else if (state === 'loading') {
    blocks.push({ h: 70 + 10, draw(y) {
      W.skeleton(ctx, L.x0, y, bw, 56, vm.t || 0, 14);
      W.skeleton(ctx, L.x0 + bw * 0.2, y + 64 - 4, bw * 0.6, 14, (vm.t || 0) + 300, 7);
    } });
  } else {
    const msg = state === 'offline' ? '需联网才能接龙' : '出了点小问题，请重试';
    const sub = state === 'offline' ? '我的接龙里还能看之前的记录' : null;
    const bh2 = T.btn(L, 48);
    const lh = Math.round(T.FS.bodyL * 1.45);
    const mh = 14 + lh + (sub ? Math.round(T.FS.body * 1.5) : 0) + 10 + bh2 + 14;
    blocks.push({ h: mh + 10, draw(y) {
      W.card(ctx, L.x0, y, bw, mh);
      W.text(ctx, msg, L.cx, y + 14 + lh / 2, { size: T.FS.bodyL, weight: 800, align: 'center' });
      let cy = y + 14 + lh;
      if (sub) { W.text(ctx, sub, L.cx, cy + Math.round(T.FS.body * 0.75), { size: T.FS.body, color: C.sub, align: 'center', maxW: bw - 28 }); cy += Math.round(T.FS.body * 1.5); }
      W.button(ctx, L, hits, { id: 'home:retry', x: L.cx - 70, y: cy + 10, w: 140, h: bh2, label: '重试', kind: 'secondary' });
    } });
  }

  const bannerText = (vm.restriction && vm.restriction.text) || vm.ugcPausedText;
  if (bannerText) {
    const bl = W.wrap(ctx, bannerText, bw - 28 - 26, T.FS.body, 600);
    const slh = Math.round(T.FS.body * 1.5);
    const hh = bl.length * slh + 20;
    blocks.push({ h: hh + 10, draw(y) {
      W.fillRR(ctx, L.x0, y, bw, hh, 12, C.vermSoft);
      W.strokeRR(ctx, L.x0, y, bw, hh, 12, C.vermText, T.isHC() ? 2 : 1.5);
      W.iconStatus(ctx, L.x0 + 18, y + hh / 2, 16, 'bad', C.vermText);
      bl.forEach((ln, i) => W.text(ctx, ln, L.x0 + 34, y + 10 + i * slh + slh / 2, { size: T.FS.body, weight: 600, color: C.vermText }));
    } });
  }

  // tiles inside the scroll in large text (2 x 2)
  if (!pinTiles) {
    const half = (bw - gap) / 2;
    blocks.push({ h: 2 * (th + gap) + 4, draw(y) {
      tiles.forEach((t, i) => {
        const x = L.x0 + (i % 2) * (half + gap);
        const yy = y + Math.floor(i / 2) * (th + gap);
        W.button(ctx, L, hits, { id: t.id, x, y: yy, w: half, h: th, label: t.label + (t.id === 'home:album' && unseen > 0 ? ' (' + unseen + ')' : ''), kind: 'secondary', size: navSize });
      });
    } });
  }

  const used = blocks.reduce((a, b) => a + b.h, 0);
  const slack = area.h - used - 4;
  if (slack > 0) blocks.unshift({ h: Math.min(slack * 0.4, 120), draw() {} });
  const contentH = blocks.reduce((a, b) => a + b.h, 0);
  W.scrollBody(ctx, hits, area, contentH, vm.scrollY, 'home:scroll', () => {
    let y = area.y + 2;
    blocks.forEach((b) => {
      b.draw(y);
      y += b.h;
    });
  });

  // ---- pinned stack
  const enabled = !!primary.enabled && state === 'ready';
  W.button(ctx, L, hits, {
    id: 'home:primary', x: L.x0, y: pY, w: bw, h: pH, label: primary.label || '开一局', sub: primary.sublabel || null, kind: 'primary', disabled: !enabled,
  });
  if (slow.show) {
    const dis = state !== 'ready';
    W.text(ctx, slow.label, L.cx - 8, linkY + linkH / 2, { size: T.FS.bodyL, weight: 700, color: dis ? C.disabledInk : C.blueText, align: 'center', maxW: bw - 40 });
    W.iconChevron(ctx, L.cx - 8 + W.measure(ctx, slow.label, T.FS.bodyL, 700) / 2 + 10, linkY + linkH / 2, 14, dis ? C.disabledInk : C.blueText);
    if (!dis) hits.add('home:slow', L.x0, linkY, bw, linkH);
  }
  if (pinTiles) {
    const cw = (bw - (tileCols - 1) * 6) / tileCols;
    tiles.forEach((t, i) => {
      const x = L.x0 + (i % tileCols) * (cw + 6);
      const y = tilesY + Math.floor(i / tileCols) * (th + 6);
      const isAlbum = t.id === 'home:album';
      W.button(ctx, L, hits, { id: t.id, x, y, w: cw, h: th, label: t.label + (isAlbum && unseen > 0 && tileCols === 2 ? ' (' + unseen + ')' : ''), kind: 'secondary', size: navSize });
      if (isAlbum && unseen > 0) {
        ctx.beginPath();
        ctx.arc(x + cw - 6, y + 6, 7, 0, Math.PI * 2);
        ctx.fillStyle = C.verm;
        ctx.fill();
        ctx.strokeStyle = C.card;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  }

  drawSheets(ctx, vm, L, hits);
  return hits.result();
}

module.exports = { draw };
