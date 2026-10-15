/**
 * Bottom sheets that open over any screen: 接龙公约 (rules / strike warning),
 * 玩法 (how to play) and 举报 (report). Every screen calls drawSheet() last;
 * it draws nothing unless vm.sheet names one.
 *
 *   vm.sheet   null | 'rules' | 'strike' | 'howto' | 'report'
 *   vm.sheetScroll   scroll offset inside the sheet body (px)
 *   vm.rules   { version, pendingAction: 'start'|'claim'|null }       (spec 12 Rules sheet)
 *   vm.report  { target:{chainId, step}, reason: key|null, state }    (spec 12 Report sheet)
 *   vm.warningText   optional override of the strike line
 *
 * Hit ids: sheet:close (scrim, X), sheet:body (swallows taps), sheet:scroll
 * (drag area; scrollMax id), rules:agree, rules:later, rules:terms,
 * rules:privacy, strike:ok, howto:ok, report:reason:<porn|politics|abuse|ad|other>,
 * report:submit, report:cancel.
 */

const T = require('./theme');
const W = require('./widgets');
const { Hits } = require('./layout');
const C = T.COLORS;

const RULES = ['画和字都会先审核，通过后才传给下一位', '不画、不写色情低俗、政治、辱骂、广告和联系方式', '违规内容会被隐藏，多次违规会被限制', '看到不合适的内容，请点「举报」'];
const STRIKE_LINE = '你有内容没通过审核。请遵守接龙公约，多次违规将被限制参与。';
const HOWTO = ['开一条接龙：选个题目，画出来。', '发到群里，群友只能看到上一棒：是画就猜一句，是字就画出来。', '传完 6 棒，参与的人一起看它变成了什么。'];
const REASONS = [
  ['porn', '色情低俗'],
  ['politics', '政治敏感'],
  ['abuse', '辱骂攻击'],
  ['ad', '广告引流'],
  ['other', '其他不适'],
];

/** Sheet with a scrolling body and pinned buttons. */
function scrollSheet(ctx, L, hits, vm, o) {
  const dry = W.dryCtx(ctx);
  const innerW = Math.min(L.W, 560) - 2 * L.pad;
  const bodyH = o.body(dry, new Hits(), 0, 0, innerW);
  const footerH = o.footerH;
  const want = L.u(64) + bodyH + L.u(10) + footerH + L.bottomPad + L.safeBottom + L.u(4);
  const h = Math.min(want, L.H - L.navBottom - L.u(8));
  const s = W.sheet(ctx, L, hits, { h, title: o.title });
  const fTop = s.sheetY + s.sheetH - L.bottomPad - footerH - L.safeBottom;
  const clip = { x: s.sheetX, y: s.top, w: s.sheetW, h: Math.max(0, fTop - L.u(8) - s.top) };
  W.scrollView(ctx, hits, 'sheet:scroll', clip, vm.sheetScroll, (c, hh, y0) => o.body(c, hh, y0, s.x, s.w));
  o.footer(ctx, hits, { x: s.x, y: fTop, w: s.w, h: footerH });
}

function bullet(ctx, x, y, color) {
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fillStyle = color || C.orange;
  ctx.fill();
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function rulesBody(vm, strike) {
  return (ctx, hits, y0, x, w) => {
    const size = T.FS.body;
    const lh = Math.round(size * 1.5);
    let y = y0 + 4;
    if (strike) {
      const t = vm.warningText || STRIKE_LINE;
      const hh = W.paragraphH(ctx, t, w - 28, lh, { size, weight: 700 });
      W.fillRR(ctx, x, y, w, hh + 20, 12, C.zhuSoft);
      W.strokeRR(ctx, x, y, w, hh + 20, 12, C.zhuText, 2);
      W.paragraph(ctx, t, x + 14, y + 10, w - 28, lh, { size, weight: 700, color: C.zhuText });
      y += hh + 32;
    }
    RULES.forEach((t) => {
      const hh = W.paragraphH(ctx, t, w - 24, lh, { size });
      bullet(ctx, x + 6, y + lh / 2);
      W.paragraph(ctx, t, x + 24, y, w - 24, lh, { size });
      y += hh + 6;
    });
    y += 4;
    W.link(ctx, hits, { id: 'rules:terms', x, y: y + 14, label: '《用户协议》', size });
    const tw = W.measure(ctx, '《用户协议》', size, 700) + 16;
    W.link(ctx, hits, { id: 'rules:privacy', x: x + tw + 8, y: y + 14, label: '《用户隐私保护指引》', size });
    return y + 28 - y0;
  };
}

function drawRules(ctx, L, hits, vm, strike) {
  const bh = W.btnH(L);
  scrollSheet(ctx, L, hits, vm, {
    title: '接龙公约',
    body: rulesBody(vm, strike),
    footerH: bh,
    footer: (c, h, r) => {
      if (strike) {
        W.button(c, L, h, { id: 'strike:ok', x: r.x, y: r.y, w: r.w, h: r.h, label: '我知道了', kind: 'primary' });
        return;
      }
      const gap = L.u(10);
      const lw = (r.w - gap) * 0.4;
      W.button(c, L, h, { id: 'rules:later', x: r.x, y: r.y, w: lw, h: r.h, label: '先看看', kind: 'secondary' });
      W.button(c, L, h, { id: 'rules:agree', x: r.x + lw + gap, y: r.y, w: r.w - lw - gap, h: r.h, label: '同意并开始', kind: 'primary' });
    },
  });
}

/** Mini three-panel chain illustration for the 玩法 sheet. */
function miniChain(ctx, x, y, w, h) {
  const gap = 22;
  const pw = (w - gap * 2) / 3;
  const ph = h;
  const panels = [0, 1, 2];
  panels.forEach((i) => {
    const px = x + i * (pw + gap);
    W.sticker(ctx, px, y, pw, ph, 10, { off: 2 });
    const cx = px + pw / 2;
    const cy = y + ph / 2;
    if (i === 0) {
      // a doodled sun
      ctx.beginPath();
      ctx.arc(cx, cy, ph * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = '#F2D13C';
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineCap = 'round';
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * ph * 0.3, cy + Math.sin(a) * ph * 0.3);
        ctx.lineTo(cx + Math.cos(a) * ph * 0.4, cy + Math.sin(a) * ph * 0.4);
        ctx.stroke();
      }
    } else if (i === 1) {
      W.text(ctx, '小太阳', cx, cy, { size: T.FS.small, weight: 700, align: 'center', maxW: pw - 10 });
    } else {
      // a wobbly orange
      ctx.beginPath();
      ctx.arc(cx, cy, ph * 0.26, 0, Math.PI * 2);
      ctx.fillStyle = C.orange;
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - ph * 0.26);
      ctx.quadraticCurveTo(cx + 8, cy - ph * 0.42, cx + 14, cy - ph * 0.34);
      ctx.stroke();
    }
    if (i < 2) {
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px + pw + 4, cy);
      ctx.quadraticCurveTo(px + pw + gap / 2, cy - 4, px + pw + gap - 4, cy);
      ctx.moveTo(px + pw + gap - 11, cy - 6);
      ctx.lineTo(px + pw + gap - 4, cy);
      ctx.lineTo(px + pw + gap - 11, cy + 6);
      ctx.stroke();
    }
  });
}

function drawHowto(ctx, L, hits, vm) {
  const bh = W.btnH(L);
  scrollSheet(ctx, L, hits, vm, {
    title: '玩法',
    body: (c, h, y0, x, w) => {
      const size = T.FS.body;
      const lh = Math.round(size * 1.5);
      let y = y0 + 2;
      miniChain(c, x + 4, y, w - 8, L.u(64));
      y += L.u(64) + 16;
      HOWTO.forEach((t, i) => {
        const hh = W.paragraphH(c, t, w - 34, lh, { size });
        W.fillRR(c, x, y + 2, 24, 24, 12, i % 2 ? C.blue : C.zhu);
        W.text(c, String(i + 1), x + 12, y + 14, { size: T.FS.small, weight: 800, color: C.onZhu, align: 'center' });
        W.paragraph(c, t, x + 34, y, w - 34, lh, { size });
        y += hh + 8;
      });
      const note = '所有画和字都会先审核再传给下一位。';
      const nh = W.paragraphH(c, note, w, lh, { size, weight: 700 });
      W.paragraph(c, note, x, y + 2, w, lh, { size, weight: 700, color: C.sub });
      return y + nh + 6 - y0;
    },
    footerH: bh,
    footer: (c, h, r) => W.button(c, L, h, { id: 'howto:ok', x: r.x, y: r.y, w: r.w, h: r.h, label: '知道了', kind: 'primary' }),
  });
}

function drawReport(ctx, L, hits, vm) {
  const rp = vm.report || {};
  const state = rp.state || 'idle';
  const bh = W.btnH(L);
  const msg = { done: '已举报，该内容已隐藏，我们会尽快核实', limit: '今天举报次数已达上限', dup: '你已举报过这条内容', error: '没提交成功，请重试', submitting: '正在提交…' }[state];
  const showReasons = state === 'idle' || state === 'error' || state === 'submitting';
  scrollSheet(ctx, L, hits, vm, {
    title: '举报',
    body: (c, h, y0, x, w) => {
      let y = y0;
      const size = T.FS.body;
      const lh = Math.round(size * 1.5);
      if (showReasons) {
        W.text(c, '选择原因，点一下即可', x, y + lh / 2, { size, color: C.sub });
        y += lh + 6;
        const rowH = Math.max(T.MIN_TAP, W.btnH(L, true));
        REASONS.forEach(([key, label]) => {
          const on = rp.reason === key;
          W.fillRR(c, x, y, w, rowH, 12, on ? C.zhuSoft : C.card);
          W.strokeRR(c, x, y, w, rowH, 12, on ? C.zhuText : C.line, on ? 3 : 1.5);
          // radio
          c.beginPath();
          c.arc(x + 24, y + rowH / 2, 10, 0, Math.PI * 2);
          c.strokeStyle = on ? C.zhuText : C.ink;
          c.lineWidth = 2;
          c.stroke();
          if (on) {
            c.beginPath();
            c.arc(x + 24, y + rowH / 2, 5.5, 0, Math.PI * 2);
            c.fillStyle = C.zhuText;
            c.fill();
          }
          W.text(c, label, x + 46, y + rowH / 2, { size: T.FS.bodyL, weight: on ? 800 : 600 });
          if (on) W.text(c, '已选', x + w - 14, y + rowH / 2, { size: T.FS.small, weight: 700, color: C.zhuText, align: 'right' });
          if (state !== 'submitting') h.add('report:reason:' + key, x, y, w, rowH);
          y += rowH + 6;
        });
        if (msg && state !== 'idle') {
          W.text(c, msg, x, y + lh / 2, { size, weight: 700, color: state === 'error' ? C.zhuText : C.sub });
          y += lh;
        }
      } else {
        const ok = state === 'done';
        W.iconStatus(c, x + 18, y + 22, 34, ok ? 'passed' : 'void');
        const hh = W.paragraph(c, msg, x + 46, y + 4, w - 46, Math.round(T.FS.bodyL * 1.5), { size: T.FS.bodyL, weight: 700 });
        y += Math.max(44, hh + 8);
      }
      return y - y0 + 4;
    },
    footerH: bh,
    footer: (c, h, r) => {
      const gap = L.u(10);
      if (showReasons) {
        const lw = (r.w - gap) * 0.4;
        W.button(c, L, h, { id: 'report:cancel', x: r.x, y: r.y, w: lw, h: r.h, label: '取消', kind: 'secondary' });
        W.button(c, L, h, { id: 'report:submit', x: r.x + lw + gap, y: r.y, w: r.w - lw - gap, h: r.h, label: state === 'submitting' ? '提交中…' : state === 'error' ? '重试' : '提交举报', kind: 'primary', disabled: !rp.reason || state === 'submitting' });
      } else {
        W.button(c, L, h, { id: 'report:cancel', x: r.x, y: r.y, w: r.w, h: r.h, label: '知道了', kind: 'primary' });
      }
    },
  });
}

/** Draws the sheet named by vm.sheet over everything (no-op when none). Appends hits. */
function drawSheet(ctx, vm, L, hits) {
  const which = vm.sheet;
  if (!which) return;
  if (which === 'rules') drawRules(ctx, L, hits, vm, false);
  else if (which === 'strike') drawRules(ctx, L, hits, vm, true);
  else if (which === 'howto') drawHowto(ctx, L, hits, vm);
  else if (which === 'report') drawReport(ctx, L, hits, vm);
}

module.exports = { drawSheet, RULES, HOWTO, REASONS, STRIKE_LINE };
