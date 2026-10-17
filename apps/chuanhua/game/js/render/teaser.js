/**
 * Reveal teaser for non-participants (spec 8.10): only the passed start and final TEXT of each chain, never a drawing and never
 * a 棒 in between. kind 'chain': 「起点」 -> 传了 N 棒 -> 「终点」 (终点 null = a drawing: "（一幅画）"). kind 'room': "一局传画揭晓了 ·
 * 5 条接龙" and one line per chain, 「起点」→「终点」 or 「起点」→（一幅画）. Then the fixed notice and 开一局 / 看看本群其他接龙.
 * 同题再传 is gone (rev. 2). States loading | ready | removed | notFound | offline (+ vm.paused: 内容维护中).
 * Hit ids: teaser:newRoom, teaser:group, teaser:report (small), teaser:home, teaser:retry, teaser:scroll.
 */

const T = require('./theme');
const W = require('./widgets');
const S = require('./screen');
const Art = require('./art');
const C = T.COLORS;

function draw(ctx, vm, L) {
  const hits = S.begin(ctx, vm, L);
  const st = vm.state || 'ready';
  const room = vm.kind === 'room';
  W.backButton(ctx, L, hits, '首页', 'teaser:home');
  const bw = L.contentW;
  let y = S.header(ctx, L, hits, { title: st === 'ready' ? vm.title || (room ? '一局传画揭晓了' : '一条接龙揭晓了') : '' });
  y += L.u(6);
  const area = S.area(L, y);

  if (st === 'loading') {
    S.statePanel(ctx, L, hits, { y: area.y + L.u(8), skeleton: true, rows: 3, headline: '正在展开…', t: vm.t });
    return hits.result();
  }
  if (st === 'removed' || st === 'notFound' || st === 'offline') {
    const msg = st === 'removed' ? (room ? '这一局已被移除' : '该接龙已被移除') : st === 'notFound' ? (room ? '找不到这一局' : '找不到这条接龙') : '需联网才能查看';
    S.statePanel(ctx, L, hits, {
      y: area.y + L.u(24), art: st === 'offline' ? 'offline' : 'empty', headline: msg,
      retryId: st === 'offline' ? 'teaser:retry' : 'teaser:home', retryLabel: st === 'offline' ? '重试' : '首页',
    });
    return hits.result();
  }

  // ready
  const paused = !!vm.paused;
  const lines = vm.lines || [];
  const pad = L.u(16);
  const tsize = room ? T.FS.bodyL + (T.isLarge() ? 0 : 1) : T.FS.title + (T.isLarge() ? 0 : 2);
  const tlh = Math.round(tsize * 1.4);
  const fixed = room ? '完整内容仅这一局的群友可见' : '完整接龙仅参与的群友可见';
  const fixedH = Math.round(T.FS.bodyL * 1.5);
  const bh = T.btn(L, 56);
  const sh = T.btn(L, 48);
  const stack = T.isLarge() || L.W < 360;
  const arrowH = L.u(64);
  let body;
  let contentH;
  const txt = (l) => ({
    a: l.from ? '「' + l.from + '」' : null,
    b: l.to === null ? '（一幅画）' : l.to ? '「' + l.to + '」' : null,
  });

  if (paused || !lines.length) {
    const fb = paused ? '内容维护中' : '传了 ' + (vm.passed || 6) + ' 棒，看看变成了什么';
    const fl = W.wrapBalanced(ctx, fb, bw - 2 * pad, tsize, 800);
    contentH = fl.length * tlh + 2 * L.u(14) + L.u(16);
    body = (y0) => {
      const h = fl.length * tlh + 2 * L.u(14);
      W.card(ctx, L.x0, y0, bw, h, { r: L.u(14) });
      W.tape(ctx, L.x0 + bw * 0.3, y0, L.u(56), -0.05);
      fl.forEach((ln, i) => W.text(ctx, ln, L.cx, y0 + L.u(14) + i * tlh + tlh / 2, { size: tsize, weight: 800, align: 'center' }));
      return y0 + h + L.u(14);
    };
  } else if (!room) {
    const t0 = txt(lines[0]);
    const sl = t0.a ? W.wrapBalanced(ctx, t0.a, bw - 2 * pad, tsize, 800) : [];
    const el = t0.b ? W.wrapBalanced(ctx, t0.b, bw - 2 * pad, tsize, 800) : [];
    const cardH1 = (k) => k * tlh + 2 * L.u(14);
    contentH = cardH1(sl.length) + arrowH + cardH1(el.length) + L.u(16);
    body = (y0) => {
      let cy = y0;
      const tc = (ls, which) => {
        const h = cardH1(ls.length);
        W.card(ctx, L.x0, cy, bw, h, { r: L.u(14) });
        W.tape(ctx, L.x0 + bw * (which === 'a' ? 0.3 : 0.7), cy, L.u(56), which === 'a' ? -0.05 : 0.05);
        ls.forEach((ln, i) => W.text(ctx, ln, L.cx, cy + L.u(14) + i * tlh + tlh / 2, { size: tsize, weight: 800, align: 'center' }));
        cy += h;
      };
      tc(sl, 'a');
      Art.arrow(ctx, L.cx - L.u(4), cy + L.u(8), L.cx + L.u(2), cy + arrowH - L.u(24), T.isHC() ? '#000' : C.blueText, 3);
      W.text(ctx, '传了 ' + (vm.passed || 6) + ' 棒', L.cx + L.u(20), cy + arrowH / 2 - L.u(2), { size: T.FS.bodyL, weight: 700, color: C.sub });
      cy += arrowH;
      tc(el, 'b');
      return cy + L.u(14);
    };
  } else {
    // one compact note per chain: 「起点」 and 「终点」 on two lines, an arrow between
    const rows = lines.map((l) => {
      const t = txt(l);
      return { a: W.wrap(ctx, t.a || '', bw - 2 * pad - L.u(24), tsize, 700).slice(0, 2), b: W.wrap(ctx, t.b || '', bw - 2 * pad - L.u(24), tsize, 700).slice(0, 2) };
    });
    const rowH = (r) => L.u(10) + (r.a.length + r.b.length) * tlh + L.u(10) + L.u(8);
    contentH = rows.reduce((a, r) => a + rowH(r) + L.u(8), 0) + L.u(8);
    body = (y0) => {
      let cy = y0;
      rows.forEach((r) => {
        const h = rowH(r);
        W.card(ctx, L.x0, cy, bw, h, { r: L.u(12), shadow: false });
        let ty = cy + L.u(10);
        r.a.forEach((ln, i) => W.text(ctx, ln, L.x0 + pad, ty + i * tlh + tlh / 2, { size: tsize, weight: 700 }));
        ty += r.a.length * tlh;
        r.b.forEach((ln, i) => W.text(ctx, (i === 0 ? '→ ' : '') + ln, L.x0 + pad, ty + i * tlh + tlh / 2, { size: tsize, weight: 700, color: C.blueText }));
        cy += h + L.u(8);
      });
      return cy + L.u(6);
    };
  }

  const actionsH = stack ? bh + sh + L.u(8) : bh;
  S.page(ctx, L, hits, {
    area, contentH: contentH + fixedH + L.u(10) + sh, actionsH, scroll: vm.scrollY, id: 'teaser:scroll',
    drawContent(y0) {
      let cy = body(y0);
      W.iconLock(ctx, L.cx - W.measure(ctx, fixed, T.FS.body, 600) / 2 - L.u(14), cy + fixedH / 2, L.u(14), C.sub);
      W.text(ctx, fixed, L.cx + L.u(4), cy + fixedH / 2, { size: T.FS.body, weight: 600, color: C.sub, align: 'center' });
      cy += fixedH + L.u(2);
      W.link(ctx, L, hits, { id: 'teaser:report', x: L.cx, y: cy + sh / 2, label: '举报', align: 'center', color: C.sub, size: T.FS.body });
    },
    drawActions(y0) {
      const gap = L.u(8);
      if (!stack) {
        const w1 = (bw - gap) * 0.45;
        W.button(ctx, L, hits, { id: 'teaser:newRoom', x: L.x0, y: y0, w: w1, h: bh, label: '开一局', kind: 'primary' });
        W.button(ctx, L, hits, { id: 'teaser:group', x: L.x0 + w1 + gap, y: y0, w: bw - w1 - gap, h: bh, label: '看看本群其他接龙', kind: 'secondary' });
      } else {
        W.button(ctx, L, hits, { id: 'teaser:newRoom', x: L.x0, y: y0, w: bw, h: bh, label: '开一局', kind: 'primary' });
        W.button(ctx, L, hits, { id: 'teaser:group', x: L.x0, y: y0 + bh + gap, w: bw, h: sh, label: '看看本群其他接龙', kind: 'secondary', size: T.FS.body + 1 });
      }
    },
  });
  return hits.result();
}

module.exports = { draw };
