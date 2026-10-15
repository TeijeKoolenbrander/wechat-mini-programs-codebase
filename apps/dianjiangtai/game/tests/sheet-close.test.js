/**
 * Regression: the X of every bottom sheet closes it. Real controller + real renderers (tests/harness.js),
 * standard and large text, 320x568 / 375x812 / 414x896, scrolled and not.
 * Root cause of the founder bug: the sheet's scroll/drag area (sheet:list) was registered after the X and overlapped
 * it, so the tap at the X's centre hit sheet:list (a no-op). Later hit areas win.
 */
const test = require('node:test');
const assert = require('node:assert');
const { boot, playDraft, SCREEN } = require('./harness');

const SIZES = [
  { w: 320, h: 568 },
  { w: 375, h: 812 },
  { w: 414, h: 896 },
];
const FRIDAY = Date.UTC(2026, 10, 20, 4, 0, 0);
const ctlOf = (g) => g.app.ctl;

function useSize(sz) {
  SCREEN.windowWidth = sz.w;
  SCREEN.windowHeight = sz.h;
}

/** The X: the sheet:close area that is not the full-screen scrim. */
function xArea(g) {
  g.frame();
  const W = g.app.layout.W;
  // the X is the small one: the scrim is full screen and the howto 知道了 button is a wide button
  const xs = g.app.hits.filter((h) => h.id === 'sheet:close' && h.w < W / 2);
  assert.ok(xs.length >= 1, 'an X hit area is drawn');
  return xs[xs.length - 1];
}

function assertXCloses(g, isOpen, label) {
  const a = xArea(g);
  assert.ok(a.w >= 48 && a.h >= 48, label + ': tap target >= 48, got ' + a.w + 'x' + a.h);
  const cx = a.x + a.w / 2;
  const cy = a.y + a.h / 2;
  const L = g.app.layout;
  assert.ok(cx > L.W / 2 && cy < L.H, label + ': X is top-right of the sheet');
  assert.strictEqual(g.app.renderer.hitTest(g.app.hits, cx, cy), 'sheet:close', label + ': the X centre hits sheet:close');
  for (const [dx, dy] of [[2, 2], [a.w - 2, 2], [2, a.h - 2], [a.w - 2, a.h - 2]]) {
    assert.strictEqual(g.app.renderer.hitTest(g.app.hits, a.x + dx, a.y + dy), 'sheet:close', label + ': corner');
  }
  assert.ok(isOpen(), label + ': open before tap');
  g.tap(cx, cy);
  assert.ok(!isOpen(), label + ': closed by the X');
}

function scrollSheet(g) {
  ctlOf(g).onDrag('sheet:list', -400);
  g.frame();
}

async function toResult(g) {
  g.tapId('home:free');
  await playDraft(g);
  g.tapId('result:skip');
  await g.settle();
  g.wait(5000);
}

/** Each opener leaves one sheet open and returns an isOpen() probe. */
const OPENERS = {
  async draft(g) {
    g.tapId('home:free');
    g.tapId('primary');
    await g.settle();
    g.wait(1300);
    await g.settle();
    g.tapId((h) => h.id.indexOf('pool:') === 0 && h.id !== 'pool:list');
    return () => ctlOf(g).state.ui.selectedId != null;
  },
  async howto(g) {
    ctlOf(g).onHit('home:howto');
    return () => ctlOf(g).state.home.sheet === 'howto';
  },
  async settings(g) {
    ctlOf(g).onHit('home:settings');
    return () => ctlOf(g).state.home.sheet === 'settings';
  },
  async breakdown(g) {
    await toResult(g);
    ctlOf(g).onHit('result:breakdown');
    return () => ctlOf(g).state.ui.sheet === 'breakdown';
  },
  async replay(g) {
    await toResult(g);
    const res = ctlOf(g).state.res;
    const slots = ['先锋', '中军', '左翼', '右翼', '后卫'];
    res.replay = { unlocked: true, best: { record: '12-0', lineup: slots.map((slot, i) => ({ slot, name: '将' + i, score: 80 + i })) } };
    ctlOf(g).state.ui.sheet = 'replay';
    return () => ctlOf(g).state.ui.sheet === 'replay';
  },
};

for (const sz of SIZES) {
  for (const large of [false, true]) {
    for (const name of Object.keys(OPENERS)) {
      for (const scrolled of [false, true]) {
        test(`sheet X closes: ${name}, ${sz.w}x${sz.h}, ${large ? 'large' : 'standard'} text${scrolled ? ', scrolled' : ''}`, async (t) => {
          const saved = { w: SCREEN.windowWidth, h: SCREEN.windowHeight };
          t.after(() => useSize({ w: saved.w, h: saved.h }));
          useSize(sz);
          const g = boot(t, { now: FRIDAY, fontSize: large ? 20 : 16 });
          await g.settle();
          if (ctlOf(g).state.home.sheet === 'howto') g.tapId('sheet:close'); // first-run how-to
          const isOpen = await OPENERS[name](g);
          g.frame();
          assert.ok(isOpen(), 'sheet opened');
          if (scrolled) scrollSheet(g);
          assertXCloses(g, isOpen, name);
        });
      }
    }
  }
}

test('scrim tap still closes the sheet and the sheet body swallows taps', async (t) => {
  const g = boot(t, { now: FRIDAY });
  await g.settle();
  if (ctlOf(g).state.home.sheet === 'howto') g.tapId('sheet:close');
  ctlOf(g).onHit('home:settings');
  g.frame();
  const body = g.app.hits.find((h) => h.id === 'sheet:body');
  g.tap(body.x + 3, body.y + body.h - 3);
  assert.strictEqual(ctlOf(g).state.home.sheet, 'settings', 'body tap does not close');
  g.tap(5, 5);
  assert.strictEqual(ctlOf(g).state.home.sheet, null, 'scrim closes');
});
