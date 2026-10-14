/**
 * Boots the whole game against a fake `wx` and canvas, then drives it with
 * touches, the way a player would. Catches wiring mistakes that the unit
 * tests cannot: a scene that throws while drawing, a tap that lands on the
 * wrong target, a cheat that never applies.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const C = require('../core/config');
const { makeLayout } = require('../js/layout');
const { effectiveCount } = require('../core/hands');

const ROOT = path.join(__dirname, '..');
const SCREEN = { windowWidth: 375, windowHeight: 812, pixelRatio: 3, statusBarHeight: 44 };
const CAPSULE = { top: 48, bottom: 80 }; // nav bar ends at 80 + (48 - 44) = 84
const L = makeLayout({ width: 375, height: 812, top: 84, bottomInset: 34 });

/** A 2D context that accepts every call and records the text it draws. */
function fakeContext(log) {
  const target = {
    measureText: (s) => ({ width: Array.from(s).length * 10 }),
    createRadialGradient: () => ({ addColorStop() {} }),
    fillText: (s) => log.text.push(s),
    drawImage: (img) => log.images.push(img && img.src),
  };
  return new Proxy(target, {
    get: (t, k) => (k in t ? t[k] : () => {}),
    set: (t, k, v) => ((t[k] = v), true),
  });
}

function boot(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });

  const log = { text: [], images: [], buzz: 0, played: 0, console: [] };
  const handlers = {};
  let rafCallback = null;
  let nextId = 1;

  global.requestAnimationFrame = (cb) => (rafCallback = cb);
  global.wx = {
    getWindowInfo: () => ({ ...SCREEN, safeArea: { bottom: 778 } }),
    getMenuButtonBoundingClientRect: () => CAPSULE,
    createCanvas: () => ({ width: 0, height: 0, getContext: () => fakeContext(log) }),
    createImage() {
      const img = {};
      Object.defineProperty(img, 'src', {
        get: () => img._src,
        set: (v) => {
          img._src = v;
          img.onload();
        },
      });
      return img;
    },
    createInnerAudioContext: () => ({ play: () => log.played++, stop() {} }),
    vibrateShort: () => log.buzz++,
    onTouchStart: (f) => (handlers.start = f),
    onTouchEnd: (f) => (handlers.end = f),
    onTouchCancel: (f) => (handlers.cancel = f),
    onShow: (f) => (handlers.show = f),
  };
  t.mock.method(console, 'log', (...args) => log.console.push(args.join(' ')));

  for (const k of Object.keys(require.cache)) if (k.startsWith(path.join(ROOT, 'js'))) delete require.cache[k];
  require('../js/main');

  t.after(() => {
    delete global.wx;
    delete global.requestAnimationFrame;
  });

  const g = {
    log,
    /** Render one frame and return the text it drew. */
    frame() {
      log.text = [];
      log.images = [];
      const cb = rafCallback;
      cb();
      // Spaced text is drawn a glyph at a time, so join without a separator.
      return log.text.join('');
    },
    down(x, y) {
      const id = nextId++;
      const touch = { identifier: id, clientX: x, clientY: y };
      handlers.start({ touches: [touch], changedTouches: [touch] });
      return id;
    },
    up(id, x, y) {
      handlers.end({ touches: [], changedTouches: [{ identifier: id, clientX: x, clientY: y }] });
    },
    tap(x, y) {
      g.up(g.down(x, y), x, y);
    },
    swipe(x, y, dy) {
      g.up(g.down(x, y), x, y + dy);
    },
    wait(ms) {
      t.mock.timers.tick(ms);
    },
    /** Tap the middle of a cheat-grid zone, 0..5. */
    zone(z) {
      const g2 = L.cup.grid;
      const col = z % 2;
      const row = Math.floor(z / 2);
      g.tap((col + 0.5) * (g2.w / 2), g2.top + (row + 0.5) * (g2.h / 3));
    },
  };
  return g;
}

const H = L.home;
const CUP = L.cup;
const titleCentre = () => [H.title.cx, H.title.y + H.title.h / 2];
const howtoCentre = () => [H.howto.cx, H.howto.y + H.howto.h / 2];

test('boots to the launch screen', (t) => {
  const g = boot(t);
  const drawn = g.frame();
  assert.match(drawn, /PLAY/);
  assert.match(drawn, /TK/);
});

test('PLAY opens a Lucky cup that shakes, settles and reveals', (t) => {
  const g = boot(t);
  g.frame();
  g.tap(H.play.cx, H.play.cy);
  assert.strictEqual(g.log.played, 1, 'shake sound');

  // Shaking: the 摇 button is hidden.
  g.frame();
  assert.ok(!g.log.text.includes('摇'));
  g.wait(C.SHAKE_DURATION_MS);
  const settled = g.frame();
  assert.match(settled, /摇/);
  assert.ok(g.log.images.some((s) => /die\d\.png$/.test(s)), 'dice drawn');

  // Swipe up, then down: no crash, and the frame loop keeps going.
  g.swipe(187, 500, -100);
  g.wait(200);
  g.frame();
  g.swipe(187, 400, 100);
  g.wait(500);
  g.frame();

  // ⚙ goes home.
  g.tap(CUP.right.cx, CUP.right.cy);
  assert.match(g.frame(), /PLAY/);
});

test('the title opens Insane: every roll reads four or five of a kind', (t) => {
  const g = boot(t);
  g.frame();
  g.tap(...titleCentre());
  g.wait(C.SHAKE_DURATION_MS);
  assert.match(g.frame(), /摇/);
  // Roll a few more times through the button.
  for (let i = 0; i < 5; i++) {
    g.tap(CUP.shake.cx, CUP.shake.cy);
    g.wait(C.SHAKE_DURATION_MS);
    g.frame();
  }
  assert.strictEqual(g.log.played, 6);
});

test('the mute control silences the next roll', (t) => {
  const g = boot(t);
  g.tap(H.play.cx, H.play.cy);
  g.wait(C.SHAKE_DURATION_MS);
  assert.match(g.frame(), /🔊/);
  g.tap(CUP.left.cx, CUP.left.cy);
  assert.match(g.frame(), /🔇/);
  g.tap(CUP.shake.cx, CUP.shake.cy);
  assert.strictEqual(g.log.played, 1, 'only the first roll made a sound');
});

test('cheat: long-press arms, two zone taps set the hand', (t) => {
  const g = boot(t);
  g.tap(...howtoCentre());
  g.wait(C.SHAKE_DURATION_MS);
  assert.match(g.frame(), /🍶/, 'cheat shows the no-wilds toggle');

  // Long-press 摇: a double buzz, and no roll on release.
  const id = g.down(CUP.shake.cx, CUP.shake.cy);
  g.wait(C.CHEAT_LONGPRESS_MS);
  g.wait(C.DOUBLE_TICK_GAP_MS);
  g.up(id, CUP.shake.cx, CUP.shake.cy);
  assert.strictEqual(g.log.buzz, 2, 'double tick');
  assert.strictEqual(g.log.played, 1, 'release after a long press does not roll');

  // "Three 1s": mid-left, then top-left.
  g.zone(2);
  g.zone(0);
  assert.strictEqual(g.log.buzz, 4, 'one tick per zone tap');

  const line = g.log.console.find((s) => s.startsWith('[cheat] set'));
  assert.ok(line, 'cheat applied');
  const hand = line.split('->')[1].split('—')[0].trim().split(' ').map(Number);
  assert.strictEqual(hand.length, 5);
  assert.strictEqual(effectiveCount(hand, 1), 3);

  // Disarmed: another tap does nothing.
  g.zone(1);
  assert.strictEqual(g.log.buzz, 4);
});

test('cheat: a tap on a control is not also a grid tap', (t) => {
  const g = boot(t);
  g.tap(...howtoCentre());
  g.wait(C.SHAKE_DURATION_MS);
  const id = g.down(CUP.shake.cx, CUP.shake.cy);
  g.wait(C.CHEAT_LONGPRESS_MS);
  g.wait(C.DOUBLE_TICK_GAP_MS);
  g.up(id, CUP.shake.cx, CUP.shake.cy);

  g.tap(CUP.left.cx, CUP.left.cy); // no-wilds on
  assert.strictEqual(g.log.buzz, 2, 'the toggle is silent and not a zone');
  assert.ok(g.log.console.includes('[cheat] no-wilds = on'));

  g.zone(3); // quantity 4
  g.zone(2); // face 3
  const line = g.log.console.find((s) => s.startsWith('[cheat] set'));
  const hand = line.split('->')[1].split('—')[0].trim().split(' ').map(Number);
  assert.strictEqual(hand.filter((v) => v === 3).length, 4, 'four literal 3s with no-wilds on');
  assert.strictEqual(hand.filter((v) => v === 1).length, 0);
});

test('Lucky ignores the cheat gesture', (t) => {
  const g = boot(t);
  g.tap(H.play.cx, H.play.cy);
  g.wait(C.SHAKE_DURATION_MS);
  const id = g.down(CUP.shake.cx, CUP.shake.cy);
  g.wait(C.CHEAT_LONGPRESS_MS);
  g.wait(C.DOUBLE_TICK_GAP_MS);
  g.up(id, CUP.shake.cx, CUP.shake.cy);
  g.zone(0);
  g.zone(0);
  assert.strictEqual(g.log.buzz, 0);
});
