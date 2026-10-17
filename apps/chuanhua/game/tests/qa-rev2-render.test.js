'use strict';
// QA rev. 2 (independent): screen geometry at the smallest supported window (320 x 568) in large-text mode, from the hit areas the real renderer returns.
// Spec 8 ("primary actions sit above the safe area, in the bottom 40%"), AC 107 / 108. A test marked `todo` is an OPEN BUG (docs/chuanhua/qa/bugs.md QA-R2-9).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/render');
const T = require('../js/render/theme');
const { sample } = require('../js/render/samples.js');
const { mockCtx, SIZES, MODES, layoutFor, eachFixture } = require('./render-mock');
const { prepare } = require('../tools/preview/fixtures.js');

const S = (name) => SIZES.find((s) => s.name === name);

function hitsOf(screen, state, size, mode) {
  const L = layoutFor(S(size));
  T.applyDisplay(mode);
  const ctx = mockCtx();
  const vm = prepare(screen, Object.assign(sample(screen, state), { display: mode }), L, ctx, mode);
  const hits = R.screens[screen].draw(ctx, vm, L);
  return { hits, L };
}
/** a hit area counts as visible at rest when its centre is inside the window above the safe-area bottom */
const visible = (h, L) => h.y + h.h / 2 <= L.bottomEdge + 0.5 && h.y >= 0;

test('QA-R2-9 / AC 108: at 320 x 568 in large text the lobby host can see 开始 and 邀请群友 without scrolling', () => {
  const { hits, L } = hitsOf('lobby', 'ready', '320x568', MODES.large);
  const start = hits.find((h) => h.id === 'lobby:start');
  const invite = hits.find((h) => h.id === 'lobby:invite');
  // the renderer returns hit areas only for what the scroll viewport shows, so a missing hit means the control is scrolled out of reach at rest
  assert.ok(invite && visible(invite, L), 'the invite button is on screen');
  assert.ok(start && visible(start, L), 'the start button of the host is not reachable at rest (hit areas: ' + hits.map((h) => h.id).join(',') + ')');
});

test('QA-R2-9 / AC 107: at 320 x 568 in large text the pick screen shows 换一批, 自己出题 and 就这个 on screen, none under another', () => {
  const { hits, L } = hitsOf('pick', 'ready', '320x568', MODES.large);
  const byId = (id) => hits.find((h) => h.id === id);
  const reroll = byId('pick:reroll');
  const custom = byId('pick:custom');
  const go = byId('pick:start');
  assert.ok(go, 'the primary is on screen');
  assert.ok(reroll && custom && visible(reroll, L) && visible(custom, L), 'both secondary actions must be on screen at rest (hit areas: ' + hits.map((h) => h.id).join(',') + ')');
  const overlap = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;
  assert.ok(!overlap(reroll, go) && !overlap(custom, go), 'no secondary action sits under 就这个');
});

test('AC 108 control: at 375 x 812 (standard) and 414 x 896 (high contrast) the same primary actions are on screen, so the failure above is specific to the smallest window in large text', () => {
  for (const [size, mode] of [['375x812', MODES.default], ['414x896', MODES.hc], ['375x667', MODES.default]]) {
    const lob = hitsOf('lobby', 'ready', size, mode);
    assert.ok(visible(lob.hits.find((h) => h.id === 'lobby:start'), lob.L), size + ' lobby 开始');
    const pick = hitsOf('pick', 'ready', size, mode);
    assert.ok(visible(pick.hits.find((h) => h.id === 'pick:reroll'), pick.L) && visible(pick.hits.find((h) => h.id === 'pick:custom'), pick.L), size + ' pick secondary actions');
  }
});
