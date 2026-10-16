/** Low UX item: at 320x568 in large text with the group banner the upper list scrolls; it now says so. */
const test = require('node:test');
const assert = require('node:assert');
const render = require('../js/render');
const { buildFixtures } = require('../tools/preview/fixtures.js');
const { mockCtx, mockCreateCanvas, SIZES, MODES, layoutFor } = require('./render-mock');

const HINT = '下滑查看更多';
const hasHint = (ctx) => ctx.__calls.some((c) => c.s === HINT);

test('home large text at 320x568 with the group banner: the list says it scrolls, the hint goes away at the end, the footer stays pinned', () => {
  const L = layoutFor(SIZES[1]);
  ['large', 'large_hc'].forEach((mode) => {
    const fx = buildFixtures({ createCanvas: mockCreateCanvas, L, display: MODES[mode] }).home;
    const vm = fx.available_group;
    const ctx0 = mockCtx();
    const hits0 = render.screens.home.draw(ctx0, Object.assign({}, vm, { scrollY: 0 }), L);
    assert.ok(hits0.scrollMax && hits0.scrollMax['home:scroll'] > 0, mode + ': this state scrolls');
    assert.ok(hasHint(ctx0), mode + ': hint shown at the top of a scrolling list');
    const ctx1 = mockCtx();
    render.screens.home.draw(ctx1, Object.assign({}, vm, { scrollY: 9999 }), L);
    assert.ok(!hasHint(ctx1), mode + ': hint hidden once scrolled to the end');
    const foot = hits0.find((a) => a.id === 'home:sound');
    assert.ok(L.H - (foot.y + foot.h) <= 0.5, mode + ': footer still pinned');
    const hint = ctx0.__calls.find((c) => c.s === HINT);
    const card = hits0.find((a) => a.id === 'home:daily');
    assert.ok(hint.y < card.y, mode + ': hint sits above the daily card');
  });
});

test('home: no scroll hint when everything fits (tall screen, large text) or in the standard layout', () => {
  const Lbig = layoutFor(SIZES[SIZES.length - 1]);
  const fxL = buildFixtures({ createCanvas: mockCreateCanvas, L: Lbig, display: MODES.large }).home;
  const c1 = mockCtx();
  const h1 = render.screens.home.draw(c1, fxL.available, Lbig);
  assert.ok(!(h1.scrollMax && h1.scrollMax['home:scroll'] > 0) && !hasHint(c1));
  const L = layoutFor(SIZES[1]);
  const fxS = buildFixtures({ createCanvas: mockCreateCanvas, L, display: MODES.default }).home;
  const c2 = mockCtx();
  render.screens.home.draw(c2, fxS.available_group, L);
  assert.ok(!hasHint(c2));
});
