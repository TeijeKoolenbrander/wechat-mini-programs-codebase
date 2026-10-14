/**
 * Boot: the on-screen canvas, the render loop, touch routing, and the two
 * scenes that stand in for the mini-program's pages.
 *
 * The loop only repaints when something changed or is moving, so a dice cup
 * lying on the table does not burn the battery at 60fps.
 */

const { makeLayout } = require('./layout');
const createHome = require('./home');
const createCup = require('./cup');

function windowInfo() {
  if (typeof wx.getWindowInfo === 'function') return wx.getWindowInfo();
  return wx.getSystemInfoSync();
}

/**
 * Where the mini-program's navigation bar would have ended: the capsule menu
 * plus the same gap again below it. Content starts here.
 */
function navBottom(info) {
  const status = info.statusBarHeight || 0;
  try {
    const m = wx.getMenuButtonBoundingClientRect();
    if (m && m.bottom > 0) return m.bottom + (m.top - status);
  } catch (e) {
    console.log('[layout] no capsule rect:', e && e.errMsg);
  }
  return status + 44;
}

const info = windowInfo();
const dpr = info.pixelRatio || 1;
const safe = info.safeArea;

// The first wx.createCanvas() is the screen.
const canvas = wx.createCanvas();
canvas.width = Math.round(info.windowWidth * dpr);
canvas.height = Math.round(info.windowHeight * dpr);
const ctx = canvas.getContext('2d');
ctx.scale(dpr, dpr);

const layout = makeLayout({
  width: info.windowWidth,
  height: info.windowHeight,
  top: navBottom(info),
  bottomInset: safe ? Math.max(0, info.windowHeight - safe.bottom) : 0,
});

let dirty = true;
let wasAnimating = false;
const images = {};

const shakeAudio = wx.createInnerAudioContext();
shakeAudio.src = 'assets/sounds/shake.mp3';

const app = {
  ctx: ctx,
  dpr: dpr,
  layout: layout,
  /** Sound preference, shared across scenes. */
  muted: false,
  shakeAudio: shakeAudio,

  /** A cached image. Check `.loaded` before drawing it. */
  image(src) {
    let img = images[src];
    if (!img) {
      img = wx.createImage();
      img.loaded = false;
      img.onload = () => {
        img.loaded = true;
        app.invalidate();
      };
      img.onerror = (e) => console.log('[image] failed:', src, e && e.errMsg);
      img.src = src;
      images[src] = img;
    }
    return img;
  },

  invalidate() {
    dirty = true;
  },

  go(name, arg) {
    if (scene) scene.exit();
    scene = scenes[name];
    scene.enter(arg);
    app.invalidate();
  },
};

// Start loading every sprite now, so the cup screen never opens half-drawn.
['cup', 'tray', 'die1', 'die2', 'die3', 'die4', 'die5', 'die6'].forEach((n) =>
  app.image('assets/images/' + n + '.png')
);

const scenes = { home: createHome(app), cup: createCup(app) };
let scene = null;
app.go('home');

function frame() {
  const now = Date.now();
  const animating = scene.animating(now);
  // One extra frame after an animation ends, to paint its final position.
  if (dirty || animating || wasAnimating) {
    dirty = false;
    scene.draw(ctx, now);
  }
  wasAnimating = animating;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- touches: one finger at a time, routed to the current scene ------------

let finger = null;

function own(e) {
  const list = e.changedTouches || [];
  for (let i = 0; i < list.length; i++) if (list[i].identifier === finger) return list[i];
  return null;
}

wx.onTouchStart((e) => {
  if (finger !== null) {
    // A second finger is ignored. If this is the only finger down, though,
    // the old one's end was lost, so drop it rather than lock up.
    if (e.touches && e.touches.length > 1) return;
    scene.touchCancel();
  }
  const t = e.changedTouches[0];
  finger = t.identifier;
  scene.touchStart(t.clientX, t.clientY);
  app.invalidate();
});

wx.onTouchEnd((e) => {
  const t = own(e);
  if (!t) return;
  finger = null;
  scene.touchEnd(t.clientX, t.clientY);
  app.invalidate();
});

wx.onTouchCancel((e) => {
  if (!own(e)) return;
  finger = null;
  scene.touchCancel();
  app.invalidate();
});

// The canvas can come back blank after the game was in the background.
wx.onShow(() => app.invalidate());
