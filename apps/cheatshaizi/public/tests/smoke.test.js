/**
 * Boots the whole game against a fake `wx` and canvas, then drives it with
 * touches, the way a player would. Catches wiring mistakes that the unit
 * tests cannot: a scene that throws while drawing, a tap that lands on the
 * wrong target, a Controlled hand that never applies.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const C = require('../core/config');
const { makeLayout } = require('../js/layout');
const { effectiveCount, bestEffective } = require('../core/hands');
const { CONTROLLED_STEPS, CONTROLLED_WILDS } = require('../js/text');

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

  const log = { text: [], images: [], buzz: 0, played: 0 };
  const storage = {};
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
    onTouchMove: (f) => (handlers.move = f),
    onShow: (f) => (handlers.show = f),
    getStorageSync: (k) => storage[k],
    setStorageSync: (k, v) => (storage[k] = v),
  };

  for (const k of Object.keys(require.cache)) if (k.startsWith(path.join(ROOT, 'js'))) delete require.cache[k];
  require('../js/main');

  t.after(() => {
    delete global.wx;
    delete global.requestAnimationFrame;
  });

  const g = {
    log,
    storage,
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
    drag(x, y, dy) {
      const id = g.down(x, y);
      handlers.move({ touches: [], changedTouches: [{ identifier: id, clientX: x, clientY: y + dy }] });
      g.up(id, x, y + dy);
    },
    /** The hand on the tray, read from the die sprites the next frame draws. */
    hand() {
      g.frame();
      return g.log.images
        .map((src) => /die(\d)\.png$/.exec(src || ''))
        .filter(Boolean)
        .map((m) => Number(m[1]));
    },
    wait(ms) {
      t.mock.timers.tick(ms);
    },
    /** Tap the middle of a Controlled-grid zone, 0..5. */
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
const M = L.modes;
const CUP = L.cup;
const howtoCentre = () => [H.howto.cx, H.howto.y + H.howto.h / 2];
const switchCentre = () => [H.switchMode.cx, H.switchMode.y + H.switchMode.h / 2];
const titleCentre = () => [H.title.cx, H.title.y + H.title.h / 2];
const modeButton = (i) => [M.buttons[i].x + M.buttons[i].w / 2, M.buttons[i].y + M.buttons[i].h / 2];
const REGULAR = 0;
const LUCKY = 1;
const CRAZY = 2;
const CONTROLLED = 3;

/** From launch, through 切换模式 and the mode screen, into a settled cup. */
function openMode(g, i) {
  g.frame();
  g.tap(...switchCentre());
  g.tap(...modeButton(i));
  g.wait(C.SHAKE_DURATION_MS);
}

/**
 * Where the checkbox and 确定 land, computed the same way cup.js does, with
 * the fake context's metrics (10px per character).
 */
function introPositions() {
  const I = CUP.intro;
  const grid = CUP.grid;
  const inner = I.card.w - I.card.pad * 2;
  let lines = 0;
  for (const step of CONTROLLED_STEPS.concat(CONTROLLED_WILDS)) {
    lines += Math.max(1, Math.ceil((Array.from(step).length * 10) / inner));
  }
  const headH = I.headFont * 1.6;
  const gap = I.lineH * 0.6;
  const cardH = I.card.pad + headH + lines * I.lineH + gap + I.check + gap + I.button.h + I.card.pad;
  const y = grid.top + Math.max(0, (grid.h - cardH) / 2);
  const checkY = y + I.card.pad + headH + lines * I.lineH + gap;
  return {
    check: { x: I.card.x + I.card.pad + I.check / 2, y: checkY + I.check / 2 },
    confirm: { x: I.card.x + I.card.w / 2, y: checkY + I.check + gap + I.button.h / 2 },
  };
}

/** Tap 确定 on the introduction, optionally ticking 不再显示 first. */
function confirmIntro(g, dontShow) {
  assert.match(g.frame(), /确定/, 'introduction is showing');
  const pos = introPositions();
  if (dontShow) g.tap(pos.check.x, pos.check.y);
  g.tap(pos.confirm.x, pos.confirm.y);
}

/** Controlled mode with the introduction confirmed and the first roll settled. */
function openControlled(g) {
  openMode(g, CONTROLLED);
  confirmIntro(g, false);
  g.wait(C.SHAKE_DURATION_MS);
}

function longPressShake(g) {
  const id = g.down(CUP.shake.cx, CUP.shake.cy);
  g.wait(C.CONTROLLED_LONGPRESS_MS);
  g.wait(C.DOUBLE_TICK_GAP_MS);
  g.up(id, CUP.shake.cx, CUP.shake.cy);
}

test('boots to the launch screen, with the notices left to 玩法说明', (t) => {
  const g = boot(t);
  const drawn = g.frame();
  assert.match(drawn, /PLAY/);
  assert.match(drawn, /TK/);
  assert.match(drawn, /玩法说明/);
  assert.match(drawn, /切换模式/);
  assert.doesNotMatch(drawn, /禁止用于赌博/, 'the disclaimer lives in 玩法说明');
  assert.doesNotMatch(drawn, /适度游戏益脑/, 'so does the healthy-gaming notice');
});

test('the title is only text', (t) => {
  const g = boot(t);
  g.frame();
  g.tap(...titleCentre());
  assert.strictEqual(g.log.played, 0, 'no roll');
  assert.match(g.frame(), /PLAY/, 'still on the launch screen');
});

test('玩法说明 opens help, which explains every mode, and back returns', (t) => {
  const g = boot(t);
  g.frame();
  g.tap(...howtoCentre());
  const drawn = g.frame();
  assert.strictEqual(g.log.played, 0, 'help never rolls');
  assert.match(drawn, /玩法说明/);
  for (const name of ['普通模式', '好运模式', '豹子模式', '自定义模式']) assert.match(drawn, new RegExp(name));

  // Drag all the way up: the disclaimer is at the end.
  g.drag(187, 600, -3000);
  const end = g.frame();
  assert.match(end, /禁止用于赌博/);
  assert.match(end, /未成年人禁止饮酒/);
  assert.match(end, /抵制不良游戏/);
  assert.match(end, /适度游戏益脑/);

  g.tap(L.help.back.cx, L.help.back.cy);
  assert.match(g.frame(), /PLAY/);
});

test('PLAY opens the mode screen on first launch, with four labelled modes', (t) => {
  const g = boot(t);
  g.frame();
  g.tap(H.play.cx, H.play.cy);
  const drawn = g.frame();
  assert.strictEqual(g.log.played, 0, 'choosing a mode does not roll yet');
  assert.match(drawn, /以后点 PLAY 直接进入/, 'says the choice is remembered');
  for (const name of ['选择模式', '普通模式', '好运模式', '豹子模式', '自定义模式']) {
    assert.match(drawn, new RegExp(name));
  }
  g.tap(M.back.cx, M.back.cy);
  assert.match(g.frame(), /PLAY/, 'back returns to launch');
});

test('Regular: shakes, settles, reveals, and ⚙ returns to the launch screen', (t) => {
  const g = boot(t);
  openMode(g, REGULAR);
  assert.strictEqual(g.log.played, 1, 'shake sound');
  assert.match(g.frame(), /摇/);
  assert.strictEqual(g.hand().length, 5, 'five dice drawn');

  g.swipe(187, 500, -100);
  g.wait(200);
  g.frame();
  g.swipe(187, 400, 100);
  g.wait(500);
  g.frame();

  g.tap(CUP.right.cx, CUP.right.cy);
  const home = g.frame();
  assert.match(home, /PLAY/);
  assert.doesNotMatch(home, /选择模式/, 'the mode list is not shown');
});

test('PLAY goes straight back into the last mode played', (t) => {
  const g = boot(t);
  openMode(g, CRAZY);
  assert.strictEqual(g.storage.lastMode, 'crazy');
  g.tap(CUP.right.cx, CUP.right.cy);
  g.frame();

  g.tap(H.play.cx, H.play.cy);
  const drawn = g.frame();
  assert.doesNotMatch(drawn, /选择模式/, 'skips the mode screen');
  assert.strictEqual(g.log.played, 2, 'rolled at once');
  g.wait(C.SHAKE_DURATION_MS);
  assert.ok(bestEffective(g.hand()) >= 4, 'still Crazy');
});

test('切换模式 always opens the mode screen', (t) => {
  const g = boot(t);
  openMode(g, LUCKY);
  g.tap(CUP.right.cx, CUP.right.cy);
  g.frame();
  g.tap(...switchCentre());
  assert.match(g.frame(), /选择模式/);
  assert.strictEqual(g.log.played, 1, 'switching does not roll');
});

test('PLAY goes straight into Controlled, without the introduction once dismissed', (t) => {
  const g = boot(t);
  openMode(g, CONTROLLED);
  confirmIntro(g, true);
  g.wait(C.SHAKE_DURATION_MS);
  g.tap(CUP.right.cx, CUP.right.cy);
  g.frame();

  g.tap(H.play.cx, H.play.cy);
  const drawn = g.frame();
  assert.doesNotMatch(drawn, /选择模式/);
  assert.doesNotMatch(drawn, /确定/);
  assert.match(drawn, /🍶/, 'in Controlled mode');
});

test('Crazy: every roll reads four or five of a kind', (t) => {
  const g = boot(t);
  openMode(g, CRAZY);
  for (let i = 0; i < 10; i++) {
    assert.ok(bestEffective(g.hand()) >= 4);
    g.tap(CUP.shake.cx, CUP.shake.cy);
    g.wait(C.SHAKE_DURATION_MS);
  }
});

test('Lucky rolls, and ignores the grid gesture', (t) => {
  const g = boot(t);
  openMode(g, LUCKY);
  assert.strictEqual(g.hand().length, 5);
  longPressShake(g);
  g.zone(0);
  g.zone(0);
  assert.strictEqual(g.log.buzz, 0);
});

test('the mute control silences the next roll', (t) => {
  const g = boot(t);
  openMode(g, REGULAR);
  assert.match(g.frame(), /🔊/);
  g.tap(CUP.left.cx, CUP.left.cy);
  assert.match(g.frame(), /🔇/);
  g.tap(CUP.shake.cx, CUP.shake.cy);
  assert.strictEqual(g.log.played, 1, 'only the first roll made a sound');
});

test('Controlled: the introduction shows first and blocks all play', (t) => {
  const g = boot(t);
  openMode(g, CONTROLLED);
  const drawn = g.frame();
  assert.match(drawn, /确定/);
  assert.match(drawn, /不再显示/);
  assert.match(drawn, /数量/);
  assert.strictEqual(g.log.played, 0, 'no roll until confirmed');

  // 摇, a long press and the grid all do nothing while it is up.
  g.tap(CUP.shake.cx, CUP.shake.cy);
  longPressShake(g);
  g.zone(2);
  assert.strictEqual(g.log.played, 0);
  assert.strictEqual(g.log.buzz, 0);

  confirmIntro(g, false);
  assert.strictEqual(g.log.played, 1, 'confirming rolls');
  g.wait(C.SHAKE_DURATION_MS);
  assert.doesNotMatch(g.frame(), /确定/, 'introduction gone');
});

test('Controlled: the introduction returns unless 不再显示 was ticked', (t) => {
  const g = boot(t);
  openMode(g, CONTROLLED);
  confirmIntro(g, false);
  assert.notStrictEqual(g.storage.controlledIntroSeen, true);

  g.wait(C.SHAKE_DURATION_MS);
  g.tap(CUP.right.cx, CUP.right.cy);
  g.tap(...switchCentre());
  g.tap(...modeButton(CONTROLLED));
  confirmIntro(g, true);
  assert.strictEqual(g.storage.controlledIntroSeen, true);

  g.wait(C.SHAKE_DURATION_MS);
  g.tap(CUP.right.cx, CUP.right.cy);
  g.tap(...switchCentre());
  g.tap(...modeButton(CONTROLLED));
  assert.doesNotMatch(g.frame(), /确定/, 'skipped once 不再显示 is saved');
  assert.strictEqual(g.log.played, 3, 'and the roll starts at once');
});

test('Controlled: long-press turns on the grid, two taps set the hand', (t) => {
  const g = boot(t);
  openControlled(g);
  assert.match(g.frame(), /🍶/, 'shows the no-wilds toggle');

  longPressShake(g);
  assert.strictEqual(g.log.buzz, 2, 'double tick');
  assert.strictEqual(g.log.played, 1, 'release after a long press does not roll');

  // "Three 1s": mid-left, then top-left.
  g.zone(2);
  g.zone(0);
  assert.strictEqual(g.log.buzz, 4, 'one tick per zone tap');
  const hand = g.hand();
  assert.strictEqual(hand.length, 5);
  assert.strictEqual(effectiveCount(hand, 1), 3);

  // One hand per long-press: another tap does nothing.
  g.zone(1);
  assert.strictEqual(g.log.buzz, 4);
});

test('Controlled: a tap on a control is not also a grid tap', (t) => {
  const g = boot(t);
  openControlled(g);
  longPressShake(g);

  g.tap(CUP.left.cx, CUP.left.cy); // no-wilds on
  assert.strictEqual(g.log.buzz, 2, 'the toggle is silent and not a zone');

  g.zone(3); // quantity 4
  g.zone(2); // face 3
  const hand = g.hand();
  assert.strictEqual(hand.filter((v) => v === 3).length, 4, 'four literal 3s with no-wilds on');
  assert.strictEqual(hand.filter((v) => v === 1).length, 0);
});
