const test = require('node:test');
const assert = require('node:assert');

const fs = require('node:fs');
const path = require('node:path');

const { makeLayout, inCircle, inRect } = require('../js/layout');
const { cubicBezier, tween, wobble, CUP_EASE, WOBBLE_MS } = require('../js/anim');
const { SLOTS, dieSrc, positioned, keepPlaces, paintOrder } = require('../js/dice');
const { seededRng } = require('../core/rng');

const ROOT = path.join(__dirname, '..');
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

// --- core/ is shared with the mini-program --------------------------------

test('core/ is identical to the mini-program copy', () => {
  const ours = path.join(ROOT, 'core');
  const theirs = path.join(ROOT, '..', 'mini-program', 'core');
  if (!fs.existsSync(theirs)) return; // shipped on its own
  const files = fs.readdirSync(theirs).sort();
  assert.deepStrictEqual(fs.readdirSync(ours).sort(), files);
  for (const f of files) {
    assert.strictEqual(
      fs.readFileSync(path.join(ours, f), 'utf8'),
      fs.readFileSync(path.join(theirs, f), 'utf8'),
      `core/${f} has drifted — copy it across`
    );
  }
});

// --- assets ---------------------------------------------------------------

test('every sprite and sound the game loads exists on disk', () => {
  const files = ['assets/images/cup.png', 'assets/images/tray.png', 'assets/sounds/shake.mp3'];
  for (let v = 1; v <= 6; v++) files.push(dieSrc(v));
  for (const f of files) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
});

test('asset paths are relative, as mini-games require', () => {
  assert.strictEqual(dieSrc(4), 'assets/images/die4.png');
});

// --- layout ---------------------------------------------------------------

const SCREEN = { width: 375, height: 812, top: 88, bottomInset: 34 };
const L = makeLayout(SCREEN);

test('rpx scales so the screen is 750rpx wide', () => {
  close(L.r, 0.5, 'r');
  close(makeLayout({ ...SCREEN, width: 750 }).r, 1, 'r at 750');
});

test('cup screen matches cup.wxss', () => {
  const c = L.cup;
  const tableBottom = 88 + 15 + 500; // nav + 30rpx margin + 1000rpx table
  close(c.tray.y + c.tray.h, tableBottom, 'tray sits on the table bottom');
  close(c.tray.x, 187.5 - 130, 'tray centred');
  close(c.cup.bottom, tableBottom - 39.5, 'closed cup base 79rpx up');
  close(c.cup.lift, 144, 'cup lifts 288rpx');
  close(c.shake.cy, 812 - 90, 'controls 90rpx from the bottom, 180rpx tall');
  close(c.left.cx, 187.5 - 118, 'left control');
  close(c.right.cx, 187.5 + 118, 'right control');
});

test('the cheat grid is the old page area, below the nav bar', () => {
  assert.deepStrictEqual(L.cup.grid, { top: 88, w: 375, h: 724 });
});

test('the three cup-screen controls do not overlap', () => {
  const c = L.cup;
  assert.ok(c.left.cx + c.left.r < c.shake.cx - c.shake.outer);
  assert.ok(c.shake.cx + c.shake.outer < c.right.cx - c.right.r);
});

test('launch column is centred in the old page area', () => {
  const h = L.home;
  const top = h.title.y;
  const bottom = h.howto.y + h.howto.h;
  close((top + bottom) / 2, 88 + (812 - 88) / 2, 'column centre');
  assert.ok(h.play.cy - h.play.outer > top + h.title.h, 'PLAY below title');
  assert.ok(h.play.cy + h.play.outer < h.howto.y, 'PLAY above help link');
});

test('hit tests', () => {
  assert.ok(inCircle({ cx: 0, cy: 0 }, 10, 6, 8));
  assert.ok(!inCircle({ cx: 0, cy: 0 }, 10, 8, 8));
  assert.ok(inRect({ x: 0, y: 0, w: 10, h: 5 }, 10, 5));
  assert.ok(!inRect({ x: 0, y: 0, w: 10, h: 5 }, 10, 6));
});

// --- animation ------------------------------------------------------------

test('cubic-bezier hits its endpoints and matches the linear curve', () => {
  close(CUP_EASE(0), 0, 'start');
  close(CUP_EASE(1), 1, 'end');
  const lin = cubicBezier(1 / 3, 1 / 3, 2 / 3, 2 / 3);
  for (const t of [0.1, 0.5, 0.9]) assert.ok(Math.abs(lin(t) - t) < 1e-4, `t=${t}`);
});

test('the cup ease front-loads its motion', () => {
  assert.ok(CUP_EASE(0.3) > 0.6);
});

test('a tween eases to its target and can be redirected mid-way', () => {
  const tw = tween(0, 100, (t) => t);
  tw.set(1, 0);
  assert.ok(tw.busy(50));
  close(tw.value(50), 0.5, 'half-way');
  tw.set(0, 50); // turn back from 0.5
  close(tw.value(50), 0.5, 'no jump on redirect');
  close(tw.value(150), 0, 'arrives');
  assert.ok(!tw.busy(150));
  tw.snap(1);
  close(tw.value(150), 1, 'snap');
});

test('wobble follows the keyframes', () => {
  assert.deepStrictEqual(wobble(0), { hop: 0, rot: 0 });
  const q = wobble(WOBBLE_MS / 4);
  close(q.hop, -1, 'hop at 25%');
  close(q.rot, -7, 'tilt at 25%');
  close(wobble((WOBBLE_MS * 3) / 4).rot, 7, 'tilt at 75%');
  close(wobble(WOBBLE_MS / 2).hop, 0, 'down at 50%');
  close(wobble(WOBBLE_MS * 5 + WOBBLE_MS / 4).rot, -7, 'loops');
});

// --- dice -----------------------------------------------------------------

test('positioned keeps the hand order and values', () => {
  const dice = positioned([6, 1, 3, 3, 2], seededRng(1));
  assert.deepStrictEqual(dice.map((d) => d.value), [6, 1, 3, 3, 2]);
  assert.deepStrictEqual(dice.map((d) => d.src), [6, 1, 3, 3, 2].map(dieSrc));
});

test('dice stay near their slots and paint back to front', () => {
  const rng = seededRng(7);
  for (let n = 0; n < 500; n++) {
    const dice = positioned([1, 2, 3, 4, 5], rng);
    dice.forEach((d, i) => {
      assert.ok(Math.abs(d.x - SLOTS[i].x) <= 1.2);
      assert.ok(Math.abs(d.y - SLOTS[i].y) <= 1.2);
      assert.ok(Math.abs(d.rot) <= 5);
      assert.ok(d.z > 0);
    });
    const order = paintOrder(dice);
    for (let i = 1; i < order.length; i++) assert.ok(order[i - 1].z <= order[i].z);
  }
});

test('keepPlaces turns faces over without moving the dice', () => {
  const rng = seededRng(3);
  const before = positioned([2, 2, 2, 2, 2], rng);
  const after = keepPlaces(positioned([5, 5, 5, 5, 5], rng), before);
  after.forEach((d, i) => {
    assert.strictEqual(d.value, 5);
    assert.strictEqual(d.src, dieSrc(5));
    assert.deepStrictEqual([d.x, d.y, d.rot, d.z], [before[i].x, before[i].y, before[i].rot, before[i].z]);
  });
});
