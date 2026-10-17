/**
 * 已传出 (spec 8.6, 慢慢传 only). States pending | passed | marker | blocked | void. `marker`: time ran out with nothing sent, so the
 * system marker went on ("时间到，已自动交出（没来得及画）"); `blocked` at a forced send: "这一棒没通过内容审核，没有传出去". pending / void exist only in
 * the async fallback mode. Shows the player's own just-passed 棒 (a drawing or a
 * sentence), its moderation status (text AND icon, never colour alone), what happens next, and the voluntary share /
 * subscribe / next actions. Content and actions share one scroll body (`sent:scroll`); when everything fits the actions
 * sit at the bottom.
 * Hit ids: sent:home, sent:share, sent:subscribe, sent:group, sent:again, sent:reveal, sent:scroll.
 */

const T = require('./theme');
const W = require('./widgets');
const S = require('./screen');
const Strokes = require('./strokes');
const MARKERS = require('./describe').MARKER_TEXT;
const C = T.COLORS;

function draw(ctx, vm, L) {
  const hits = S.begin(ctx, vm, L);
  const mod = vm.modState || 'pending';
  const bad = mod === 'blocked' || mod === 'void';
  let y0 = S.header(ctx, L, hits, { back: '首页', backId: 'sent:home', title: bad ? '第 ' + vm.step + ' 棒没有传出去' : '第 ' + vm.step + ' 棒已传出' });
  y0 += L.u(4);
  const bw = L.contentW;
  const lh = Math.round(T.FS.bodyL * 1.45);
  const slh = Math.round(T.FS.body * 1.5);

  // ---- content blocks
  const thumb = Math.min(L.u(T.isLarge() ? 150 : 140), bw * 0.46);
  const marker = vm.mine && vm.mine.marker;
  const isDraw = vm.kind === 'draw' && !marker;
  const textW = bw - thumb - L.u(14) - L.u(24);
  const sentLines = !isDraw ? W.wrap(ctx, marker ? MARKERS[marker] || '' : (vm.mine && vm.mine.text) || '', bw - 2 * L.u(14), T.FS.title, 800) : [];
  const stLabel = vm.modText || '';
  const stLines = W.wrap(ctx, stLabel, isDraw ? textW : bw - 2 * L.u(14), T.FS.bodyL, 800);
  const stH = stLines.length * lh;
  const heroH = isDraw ? Math.max(thumb, stH + L.u(10)) : sentLines.length * Math.round(T.FS.title * 1.4) + L.u(14) * 2 + L.u(12) + stH;
  const notes = [];
  if (vm.nextText) notes.push({ t: vm.nextText, w: 700, c: C.ink });
  if (vm.autoUpdateNote && !bad) notes.push({ t: '之前发到群里的卡片会自动更新进度', w: 500, c: C.sub });
  if (vm.firstTimeExplainer) notes.push({ t: '你只能看到上一棒，下一位也只能看到你这一棒。全部传完后，参与的人一起看揭晓。', w: 500, c: C.sub });
  const noteLines = notes.map((n) => W.wrap(ctx, n.t, bw - L.u(8), T.FS.body, n.w));
  const notesH = noteLines.reduce((a, l) => a + l.length * slh + L.u(6), 0);
  const contentH = heroH + L.u(14) + notesH;

  // ---- actions
  const ag = L.compact ? 5 : L.u(8); // tighter on a short window so the share button stays in the bottom 40%
  const bh = T.btn(L, 56);
  const sh = T.btn(L, 48);
  const sub = (vm.subscribe && vm.subscribe.state) || 'hidden';
  const canShare = !bad;
  const rows = [];
  if (vm.revealed) rows.push('reveal');
  if (canShare) rows.push('share');
  if (sub === 'offer' || sub === 'requesting' || sub === 'granted') rows.push('sub');
  rows.push('pair');
  const stackPair = T.isLarge() || L.W < 340;
  const actionsH = rows.reduce((a, r) => a + (r === 'share' || r === 'reveal' ? bh : r === 'pair' ? (stackPair ? 2 * sh + ag : sh) : sh) + ag, -ag);
  const area = S.area(L, y0);

  S.page(ctx, L, hits, {
    area, contentH, actionsH, scroll: vm.scrollY, id: 'sent:scroll',
    drawContent(y) {
      if (isDraw) {
        const tx = L.x0;
        if (!T.isHC()) W.fillRR(ctx, tx + 2, y + 3, thumb, thumb, 4, C.shadow);
        Strokes.drawStrokes(ctx, (vm.mine && vm.mine.strokes) || { v: 1, s: [] }, { x: tx, y, w: thumb, h: thumb }, {
          cacheKey: 'sent:' + vm.chainId + ':' + vm.step, rev: vm.chainId + vm.step, dpr: L.dpr, frame: true, frameWidth: T.isHC() ? 2.5 : 1.5,
        });
        const sx = L.x0 + thumb + L.u(14);
        const kind = (mod === 'passed' || mod === 'marker') ? 'ok' : bad ? 'bad' : 'wait';
        const col = kind === 'ok' ? C.greenText : kind === 'bad' ? C.vermText : C.orangeDeep;
        const top = y + (heroH - stH) / 2;
        W.iconStatus(ctx, sx + ag, top + lh / 2, L.u(18), kind, col);
        stLines.forEach((ln, i) => W.text(ctx, ln, sx + L.u(24), top + i * lh + lh / 2, { size: T.FS.bodyL, weight: 800, color: col }));
      } else {
        const ch = heroH - stH - L.u(12);
        W.card(ctx, L.x0, y, bw, ch, { r: L.u(14) });
        W.tape(ctx, L.x0 + bw / 2, y, L.u(60), 0.04);
        sentLines.forEach((ln, i) => W.text(ctx, ln, L.x0 + bw / 2, y + L.u(14) + i * Math.round(T.FS.title * 1.4) + Math.round(T.FS.title * 0.7), { size: T.FS.title, weight: 800, align: 'center' }));
        const kind = (mod === 'passed' || mod === 'marker') ? 'ok' : bad ? 'bad' : 'wait';
        const col = kind === 'ok' ? C.greenText : kind === 'bad' ? C.vermText : C.orangeDeep;
        const top = y + ch + L.u(12);
        const iw = L.u(24);
        W.iconStatus(ctx, L.x0 + L.u(12), top + lh / 2, L.u(18), kind, col);
        stLines.forEach((ln, i) => W.text(ctx, ln, L.x0 + iw + L.u(4), top + i * lh + lh / 2, { size: T.FS.bodyL, weight: 800, color: col }));
      }
      let ny = y + heroH + L.u(14);
      notes.forEach((n, i) => {
        noteLines[i].forEach((ln, k) => W.text(ctx, ln, L.x0 + L.u(4), ny + k * slh + slh / 2, { size: T.FS.body, weight: n.w, color: n.c }));
        ny += noteLines[i].length * slh + L.u(6);
      });
    },
    drawActions(y) {
      let ay = y;
      rows.forEach((r) => {
        if (r === 'reveal') {
          W.button(ctx, L, hits, { id: 'sent:reveal', x: L.x0, y: ay, w: bw, h: bh, label: '看揭晓', kind: 'primary' });
          ay += bh + ag;
        } else if (r === 'share') {
          W.button(ctx, L, hits, { id: 'sent:share', x: L.x0, y: ay, w: bw, h: bh, label: '发到群里接龙', kind: vm.revealed ? 'secondary' : 'primary' });
          ay += bh + ag;
        } else if (r === 'sub') {
          if (sub === 'granted') {
            W.iconCheck(ctx, L.x0 + L.u(14), ay + sh / 2, L.u(14), C.greenText);
            W.text(ctx, '揭晓时会提醒你', L.x0 + L.u(32), ay + sh / 2, { size: T.FS.body, weight: 700, color: C.greenText });
          } else W.button(ctx, L, hits, { id: 'sent:subscribe', x: L.x0, y: ay, w: bw, h: sh, label: sub === 'requesting' ? '请求中…' : '揭晓时提醒我', kind: 'secondary', disabled: sub === 'requesting' });
          ay += sh + ag;
        } else {
          const gap = ag;
          if (stackPair) {
            W.button(ctx, L, hits, { id: 'sent:group', x: L.x0, y: ay, w: bw, h: sh, label: '看看本群其他接龙', kind: 'secondary', size: T.FS.body });
            W.button(ctx, L, hits, { id: 'sent:again', x: L.x0, y: ay + sh + gap, w: bw, h: sh, label: '再开一条', kind: bad ? 'primary' : 'secondary', size: T.FS.body });
          } else {
            const w1 = (bw - gap) * 0.6;
            W.button(ctx, L, hits, { id: 'sent:group', x: L.x0, y: ay, w: w1, h: sh, label: '看看本群其他接龙', kind: 'secondary', size: T.FS.body });
            W.button(ctx, L, hits, { id: 'sent:again', x: L.x0 + w1 + gap, y: ay, w: bw - w1 - gap, h: sh, label: '再开一条', kind: bad ? 'primary' : 'secondary', size: T.FS.body });
          }
        }
      });
    },
  });
  return hits.result();
}

module.exports = { draw };
