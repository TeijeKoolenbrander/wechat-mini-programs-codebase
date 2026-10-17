'use strict';
// QA-R2-9 / AC 107 / AC 108 (frontend-ui): no primary action is ever off-screen, at all six window sizes x four display modes, for every fixture
// of every screen. A primary action must be in the hit list (not scrolled out), not clipped by a scroll viewport, and above the safe area.
// Secondary controls in a scroll body may scroll, but never sit under a pinned element (their hit areas are clipped to the scroll area, which
// ends above the pinned block) and the body shows a "more below" affordance while it is not at its end.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { eachFixture, SIZES, MODES } = require('./render-mock');

const PRIMARY = new Set([
  'home:primary', 'lobby:start', 'pick:start', 'pick:customOk', 'overview:rematch', 'roomEntry:join', 'roomEntry:newRoom', 'roomEntry:backToRoom',
  'entry:claim', 'entry:room', 'entry:newRoom', 'entry:viewReveal', 'sent:reveal', 'teaser:newRoom', 'group:newRoom', 'draw:submit', 'rules:agree',
  'report:submit', 'warning:ok',
]);
const PINNED_ID = (id) => /^(sheet:|adstub:)/.test(id);

test('AC 108: every primary action is fully on screen at rest (6 sizes x 4 modes x every fixture)', () => {
  const bad = [];
  let checked = 0;
  eachFixture(({ f, L, sz, mode, hits }) => {
    for (const r of hits.raw || []) {
      if (!PRIMARY.has(r.id)) continue;
      checked++;
      const h = hits.find((x) => x.id === r.id && Math.abs(x.y - r.y) < 0.6 && Math.abs(x.h - r.h) < 0.6);
      const tag = sz.name + ' ' + mode + ' ' + f.screen + '/' + (f.name || (f.vm && f.vm.state) || '') + ' ' + r.id;
      if (!h) bad.push(tag + ' is clipped or scrolled out');
      else if (r.y < 0 || r.y + r.h > L.bottomEdge + 0.5) bad.push(tag + ' lies outside the window (y ' + r.y.toFixed(1) + '..' + (r.y + r.h).toFixed(1) + ', edge ' + L.bottomEdge + ')');
    }
  });
  assert.ok(checked > 200, 'the check saw the primary actions (' + checked + ')');
  assert.deepEqual(bad.slice(0, 20), [], bad.length + ' primary actions are not reachable at rest');
});

test('AC 107: a scroll body that is not at its end shows the "more below" chevron; at its end it does not', () => {
  const { mockCtx, layoutFor } = require('./render-mock');
  const W = require('../js/render/widgets');
  const { Hits } = require('../js/render/layout');
  const ctx = mockCtx();
  const area = { x: 16, y: 100, w: 288, h: 200 };
  const hits = new Hits();
  W.scrollBody(ctx, hits, area, 500, 0, 't:scroll', () => {});
  const withMore = ctx.__counts.stroke || 0;
  const ctx2 = mockCtx();
  W.scrollBody(ctx2, new Hits(), area, 500, 300, 't:scroll', () => {});
  const atEnd = ctx2.__counts.stroke || 0;
  W.scrollBody(ctx2, new Hits(), area, 100, 0, 't:scroll', () => {});
  assert.ok(withMore > atEnd, 'strokes at the top (' + withMore + ') exceed strokes at the end (' + atEnd + ')');
  void layoutFor; void SIZES; void MODES; void PINNED_ID;
});

test('AC 107: nothing tappable sits under a primary action (scroll bodies end above the pinned block)', () => {
  const bad = [];
  eachFixture(({ f, sz, mode, hits }) => {
    const prim = hits.filter((h) => PRIMARY.has(h.id));
    for (const p of prim) {
      for (const h of hits) {
        if (h === p || PRIMARY.has(h.id) || /:scroll$|^pick:block$/.test(h.id) || PINNED_ID(h.id)) continue;
        const ox = Math.min(p.x + p.w, h.x + h.w) - Math.max(p.x, h.x);
        const oy = Math.min(p.y + p.h, h.y + h.h) - Math.max(p.y, h.y);
        if (ox > 1 && oy > 1) bad.push(sz.name + ' ' + mode + ' ' + f.screen + '/' + ((f.vm && f.vm.state) || '') + ' ' + h.id + ' under ' + p.id);
      }
    }
  });
  assert.deepEqual(bad.slice(0, 20), []);
});

test('AC 107: at 320 x 568 in large text the first overview card is whole at rest (its label is not under the buttons), and the home tiles end above 开一局', () => {
  const R = require('../js/render');
  const T = require('../js/render/theme');
  const { sample } = require('../js/render/samples.js');
  const { prepare } = require('../tools/preview/fixtures.js');
  const { mockCtx, layoutFor } = require('./render-mock');
  const L = layoutFor(SIZES[0]);
  T.applyDisplay(MODES.large);
  const run = (screen) => {
    const ctx = mockCtx();
    const vm = prepare(screen, Object.assign(sample(screen, 'ready'), { display: MODES.large }), L, ctx, MODES.large);
    return R.screens[screen].draw(ctx, vm, L);
  };
  const ov = run('overview');
  const rawCard = ov.raw.find((h) => /^overview:chain:/.test(h.id));
  const card = ov.find((h) => h.id === rawCard.id);
  assert.ok(card && Math.abs(card.h - rawCard.h) < 0.6, 'the first card is not clipped');
  const rematch = ov.find((h) => h.id === 'overview:rematch');
  assert.ok(card.y + card.h <= rematch.y, 'the first card ends above 再来一局');
  const home = run('home');
  const primary = home.find((h) => h.id === 'home:primary');
  for (const h of home) if (/^home:(album|groupList|howto|settings|groupLine)$/.test(h.id)) assert.ok(h.y + h.h <= primary.y, h.id + ' ends above 开一局');
});

test('QA-R3-1: an error / status banner with an action (*:retry, overview:joinNew) is whole at rest and never under the chevron or fade (6 sizes x 4 modes x every error fixture)', () => {
  const BANNER = /:retry$|^overview:joinNew$/;
  const bad = [];
  let checked = 0;
  const ids = new Set();
  eachFixture(({ f, L, sz, mode, hits }) => {
    for (const r of hits.raw || []) {
      if (!BANNER.test(r.id)) continue;
      checked++;
      ids.add(r.id);
      const tag = sz.name + ' ' + mode + ' ' + f.screen + '/' + ((f.vm && f.vm.state) || f.name || '') + ' ' + r.id;
      const h = hits.find((x) => x.id === r.id && Math.abs(x.y - r.y) < 0.6 && Math.abs(x.h - r.h) < 0.6);
      if (!h) bad.push(tag + ' is clipped or scrolled out');
      if (r.y < 0 || r.y + r.h > L.bottomEdge + 0.5) bad.push(tag + ' lies outside the window');
      // inside a scroll area that scrolls: it must end above the fade / chevron (the bottom min(30, 35%) of the area)
      for (const a of hits.filter((x) => /:scroll$/.test(x.id) && r.y < x.y + x.h && r.y + r.h > x.y)) {
        const fade = hits.scrollMax[a.id] > 0 ? Math.min(30, a.h * 0.35) : 0;
        if (r.y + r.h > a.y + a.h - fade + 0.5) bad.push(tag + ' sits under the chevron / fade of ' + a.id);
      }
    }
  });
  assert.ok(checked >= 400 && ids.has('pick:retry') && ids.has('home:retry'), 'the check saw the banners (' + checked + ')');
  assert.deepEqual(bad.slice(0, 20), [], bad.length + ' banner actions are not whole at rest');
});

test('QA-R3-1: pick at 320 x 568 large keeps a prompt tappable and the pinned retry right above 就这个', () => {
  const R = require('../js/render');
  const T = require('../js/render/theme');
  const { sample } = require('../js/render/samples.js');
  const { prepare } = require('../tools/preview/fixtures.js');
  const { mockCtx, layoutFor } = require('./render-mock');
  const L = layoutFor(SIZES[0]);
  T.applyDisplay(MODES.large);
  const ctx = mockCtx();
  const vm = prepare('pick', Object.assign(sample('pick', 'error'), { display: MODES.large }), L, ctx, MODES.large);
  const hits = R.screens.pick.draw(ctx, vm, L);
  const start = hits.find((h) => h.id === 'pick:start');
  const retry = hits.find((h) => h.id === 'pick:retry');
  assert.ok(hits.find((h) => h.id === 'pick:item:' + vm.prompts[0].id), 'the first prompt is tappable at rest');
  assert.ok(retry.y + retry.h < start.y && start.y - (retry.y + retry.h) < 24, 'retry sits right above 就这个');
});
