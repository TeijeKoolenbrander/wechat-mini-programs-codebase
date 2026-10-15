/**
 * 再答一次 sheet (spec 6.4, 5.5): free runs only, once per run, after the first
 * miss. Drawn over the play screen (both values stay visible behind it).
 *
 * vm = spec 10 sheet model {visible, missText, adState:'idle'|'loading'|'playing'|'error',
 *   canOffer}. Draws nothing (no hit areas) unless visible && canOffer.
 * Hit ids: rewarded:watch (the ad button, always with a play icon and the
 *   word 视频), rewarded:skip (看结果), sheet:close (dismiss = 看结果).
 * The ad button and 看结果 are >= 24pt apart; the ad button is never adjacent
 * to a primary button.
 */

const T = require('./theme');
const W = require('./widgets');
const C = T.COLORS;

function draw(ctx, vm, L) {
  const hits = W.start(L);
  if (!vm || !vm.visible || vm.canOffer === false) return hits.result();
  const btnH = L.btnH;
  const lh = L.u(26) * (L.large ? 1.2 : 1);
  const innerW = Math.min(L.W, 560) - 2 * L.pad;
  const missLines = W.lineCount(ctx, vm.missText || '', innerW, T.FS.bodyL, 800, true, 3);
  const h = Math.min(L.H - L.navBottom, L.u(60) + missLines * lh + L.u(10) + lh + L.u(18) + btnH + L.u(28) + L.btnH2 + L.u(16) + L.safeBottom);
  const s = W.sheet(ctx, L, hits, { h, title: '再答一次？' });
  let y = s.top - L.u(8);
  y += W.paragraph(ctx, vm.missText || '', s.x, y, s.w, lh, { size: T.FS.bodyL, weight: 800, serif: true, color: C.ink, maxLines: 3 }) + L.u(6);
  y += W.paragraph(ctx, '看完一段视频，接着往下答', s.x, y, s.w, lh, { size: T.FS.body, color: C.sub, maxLines: 2 }) + L.u(12);
  const loading = vm.adState === 'loading';
  const playing = vm.adState === 'playing';
  const label = loading ? '视频加载中…' : playing ? '正在播放…' : '视频 · 再答一次';
  W.button(ctx, L, hits, { id: 'rewarded:watch', x: s.x, y, w: s.w, h: btnH, label, kind: 'ad', disabled: loading || playing });
  y += btnH + L.u(28); // >= 24pt between the ad button and 看结果
  W.button(ctx, L, hits, { id: 'rewarded:skip', x: s.x, y, w: s.w, h: L.btnH2, label: '看结果', kind: 'secondary', size: T.FS.bodyL });
  return hits.result();
}

module.exports = { draw };
