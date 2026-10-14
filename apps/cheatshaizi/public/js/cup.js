/**
 * The cup screen: shake, peek, and in Controlled mode, set the hand.
 *
 * One screen serves all four modes; only the roll generator differs, plus
 * Controlled mode's grid and its introduction. State lives in plain
 * variables, and touches are hit-tested by hand.
 */

const C = require('../core/config');
const { fairRng } = require('../core/rng');
const { rollFair } = require('../core/hands');
const { rollLucky } = require('../core/lucky');
const { rollCrazy } = require('../core/crazy');
const { applyControlled, zoneAt, zoneToQuantity, zoneToFace } = require('../core/controlled');
const { inCircle, inRect } = require('./layout');
const { positioned, keepPlaces, paintOrder } = require('./dice');
const { tween, wobble, CUP_MS, CUP_EASE, HINT_MS, HINT_EASE } = require('./anim');
const {
  font,
  sparkles,
  backdropCanvas,
  spacedText,
  redButton,
  roundControl,
  roundRectPath,
  wrapText,
  checkbox,
} = require('./draw');
const { CONTROLLED_STEPS, CONTROLLED_WILDS } = require('./text');
const { rememberMode, introSeen, rememberIntroSeen } = require('./storage');

const DEG = Math.PI / 180;

module.exports = function createCup(app) {
  const L = app.layout.cup;

  // Eased 0..1: how far the cup is lifted, and how visible the hint is.
  const lift = tween(0, CUP_MS, CUP_EASE);
  const hint = tween(0, HINT_MS, HINT_EASE);

  let bg = null;
  let s = null; // screen state
  let hand = [];
  let armed = false; // Controlled grid active, until the hand is set or rerolled
  let pendingQty = null; // first of the two grid taps
  let intro = null; // the Controlled-mode introduction, while it is showing
  let longFired = false;
  let longTimer = 0;
  let settleTimer = 0;
  let shakeStart = 0;
  let touch = null; // { target, x, y } for the finger that is down

  function setRevealed(revealed) {
    s.revealed = revealed;
    lift.set(revealed ? 1 : 0, Date.now());
  }

  function setHint(show) {
    s.showHint = show;
    hint.set(show ? 1 : 0, Date.now());
  }

  // --- rolling ------------------------------------------------------------

  function generate() {
    switch (s.mode) {
      case 'lucky':
        return rollLucky(fairRng);
      case 'crazy':
        return rollCrazy(fairRng);
      case 'controlled':
      case 'regular':
      default:
        return rollFair(fairRng);
    }
  }

  function roll() {
    if (s.shaking) return;

    hand = generate();
    armed = false;
    pendingQty = null;

    s.dice = positioned(hand, fairRng);
    // The wobble takes over the cup at once, so there is no closing
    // transition to wait for.
    s.revealed = false;
    lift.snap(0);
    s.shaking = true;
    shakeStart = Date.now();
    setHint(false);

    play();

    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      s.shaking = false;
      setHint(true);
      app.invalidate();
    }, C.SHAKE_DURATION_MS);
  }

  // --- the roll button: tap rolls, long press turns on the grid ------------

  function onBtnStart() {
    longFired = false;
    s.pressed = true;

    clearTimeout(longTimer);
    longTimer = setTimeout(() => {
      longFired = true;
      if (s.mode !== 'controlled' || s.shaking) return;
      armed = true;
      pendingQty = null;
      buzz(true);
    }, C.CONTROLLED_LONGPRESS_MS);
  }

  function onBtnEnd() {
    clearTimeout(longTimer);
    s.pressed = false;
    if (!longFired) roll();
  }

  // --- stage gestures: swipe reveals, tap feeds the Controlled grid --------

  function onZoneTap(zone) {
    if (s.mode !== 'controlled') return;
    if (!armed || s.shaking) return;

    buzz(false);

    if (pendingQty === null) {
      pendingQty = zoneToQuantity(zone);
      return;
    }

    const face = zoneToFace(zone);
    const qty = pendingQty;
    pendingQty = null;
    // One hand per long-press. Long-press 摇 again to set another, so a
    // stray tap afterwards cannot touch the dice.
    armed = false;

    hand = applyControlled(fairRng, qty, face, s.noWilds ? 'uniform' : undefined);

    const view = positioned(hand, fairRng);
    s.dice = s.revealed ? keepPlaces(view, s.dice) : view;
  }

  function reveal() {
    if (s.shaking || s.revealed) return;
    // The hand is not frozen here: Controlled mode still works with the cup
    // up, so a hand can be set after seeing it.
    setRevealed(true);
    setHint(false);
  }

  function hide() {
    if (!s.revealed) return;
    setRevealed(false);
  }

  /**
   * Haptic feedback for Controlled mode: a double tick when the grid turns
   * on, a single tick per grid tap.
   *
   * `wx.vibrateShort` is driven by the Taptic Engine on iOS, and it is
   * dropped when System Haptics is off or Low Power Mode is on.
   */
  function buzz(double) {
    const tick = () => wx.vibrateShort({ type: 'heavy', fail: () => {} });
    tick();
    if (double) setTimeout(tick, C.DOUBLE_TICK_GAP_MS);
  }

  // --- controls -----------------------------------------------------------

  /**
   * Controlled mode only. On, the chosen dice are all the chosen face: ask
   * for four 3s and you get four 3s, never a mix of 3s and wilds.
   */
  function toggleNoWilds() {
    s.noWilds = !s.noWilds;
  }

  function toggleMute() {
    app.muted = !app.muted;
    if (app.muted) app.shakeAudio.stop();
  }

  function play() {
    const audio = app.shakeAudio;
    if (app.muted || !audio) return;
    audio.stop();
    audio.play();
  }

  // --- Controlled-mode introduction ---------------------------------------

  /**
   * Lay out the introduction: zone labels in the outer columns, and a card in
   * the middle with the steps, a 不再显示 checkbox and a 确定 button.
   * Wrapping needs the font metrics, so this runs once on entry.
   */
  function buildIntro(ctx) {
    const I = L.intro;
    const g = L.grid;
    const k = I.card;
    const inner = k.w - k.pad * 2;

    ctx.font = font(I.font, false);
    const lines = [];
    for (const step of CONTROLLED_STEPS.concat(CONTROLLED_WILDS)) {
      for (const part of wrapText(ctx, step, inner)) lines.push(part);
    }

    const headH = I.headFont * 1.6;
    const gap = I.lineH * 0.6;
    const cardH = k.pad + headH + lines.length * I.lineH + gap + I.check + gap + I.button.h + k.pad;
    const y = g.top + Math.max(0, (g.h - cardH) / 2);
    const checkY = y + k.pad + headH + lines.length * I.lineH + gap;

    return {
      dontShow: false,
      pressed: null,
      lines: lines,
      card: { x: k.x, y: y, w: k.w, h: cardH },
      headY: y + k.pad + headH / 2,
      linesY: y + k.pad + headH,
      check: { x: k.x + k.pad, y: checkY, w: inner, h: I.check },
      button: { x: k.x + k.pad, y: checkY + I.check + gap, w: inner, h: I.button.h },
    };
  }

  function introHit(x, y) {
    if (inRect(intro.check, x, y)) return 'check';
    if (inRect(intro.button, x, y)) return 'confirm';
    return null;
  }

  function closeIntro() {
    if (intro.dontShow) rememberIntroSeen();
    intro = null;
    roll();
  }

  function drawIntro(ctx) {
    const I = L.intro;
    const g = L.grid;
    const W = app.layout.width;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
    ctx.fillRect(0, 0, W, app.layout.height);

    // The grid, exactly where the real one will be.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = Math.max(1, I.labelFont / 13);
    ctx.beginPath();
    ctx.moveTo(W / 2, g.top);
    ctx.lineTo(W / 2, g.top + g.h);
    for (let row = 1; row < 3; row++) {
      ctx.moveTo(0, g.top + (row * g.h) / 3);
      ctx.lineTo(W, g.top + (row * g.h) / 3);
    }
    ctx.stroke();

    // Each zone's two readings: quantity on the first tap, face on the second.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pair = I.labelFont * 1.2 + I.numberFont * 1.05;
    for (let zone = 0; zone < 6; zone++) {
      const x = I.labelX[zone % 2];
      const top = g.top + (Math.floor(zone / 2) + 0.5) * (g.h / 3) - pair;
      ctx.font = font(I.labelFont, false);
      ctx.fillStyle = 'rgba(234, 241, 255, 0.7)';
      ctx.fillText('数量', x, top + I.labelFont * 0.6);
      ctx.fillText('点数', x, top + pair + I.labelFont * 0.6);
      ctx.font = font(I.numberFont, true);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(zoneToQuantity(zone)), x, top + I.labelFont * 1.2 + I.numberFont * 0.5);
      ctx.fillStyle = '#ff6a5e';
      ctx.fillText(String(zoneToFace(zone)), x, top + pair + I.labelFont * 1.2 + I.numberFont * 0.5);
    }

    // The card.
    const c = intro.card;
    roundRectPath(ctx, c.x, c.y, c.w, c.h, I.card.radius);
    ctx.fillStyle = 'rgba(16, 26, 64, 0.96)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.stroke();

    ctx.font = font(I.headFont, true);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('自定义模式', c.x + c.w / 2, intro.headY);

    ctx.textAlign = 'left';
    ctx.font = font(I.font, false);
    ctx.fillStyle = 'rgba(234, 241, 255, 0.85)';
    intro.lines.forEach((line, i) => {
      ctx.fillText(line, c.x + I.card.pad, intro.linesY + (i + 0.5) * I.lineH);
    });

    const ck = intro.check;
    checkbox(ctx, ck.x, ck.y, I.check, intro.dontShow);
    ctx.fillText('不再显示', ck.x + I.check * 1.4, ck.y + I.check / 2);

    const b = intro.button;
    roundRectPath(ctx, b.x, b.y, b.w, b.h, I.button.radius);
    ctx.fillStyle = intro.pressed === 'confirm' ? '#a81109' : '#e0251c';
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.font = font(I.button.font, true);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('确定', b.x + b.w / 2, b.y + b.h / 2);
  }

  // --- drawing ------------------------------------------------------------

  function drawDice(ctx) {
    const t = L.tray;
    const d = L.die;
    for (const die of paintOrder(s.dice)) {
      const img = app.image(die.src);
      if (!img.loaded) continue;
      const x = t.x + (die.x / 100) * t.w;
      const y = t.y + (die.y / 100) * t.h;
      ctx.save();
      ctx.translate(x + d.w / 2, y + d.h / 2);
      ctx.rotate(die.rot * DEG);
      // Shadow sizes are in device pixels: canvas transforms do not apply.
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowOffsetY = d.shadowDy * app.dpr;
      ctx.shadowBlur = d.shadowBlur * app.dpr;
      ctx.drawImage(img, -d.w / 2, -d.h / 2, d.w, d.h);
      ctx.restore();
    }
  }

  function drawCup(ctx, now) {
    const img = app.image('assets/images/cup.png');
    if (!img.loaded) return;
    const c = L.cup;
    let dy = -c.lift * lift.value(now);
    let rot = 0;
    if (s.shaking) {
      const w = wobble(now - shakeStart);
      dy = w.hop * c.hop;
      rot = w.rot;
    }
    ctx.save();
    ctx.translate(c.cx, c.bottom + dy);
    ctx.rotate(rot * DEG);
    ctx.drawImage(img, -c.w / 2, -c.h, c.w, c.h);
    ctx.restore();
  }

  function drawControls(ctx) {
    // In Controlled mode this slot becomes the no-wilds toggle instead of
    // mute. Normal brightness is the default, where the chosen dice mix in
    // wilds; dimmed means only the chosen face appears.
    if (s.mode === 'controlled') {
      roundControl(ctx, L.left, '🍶', s.noWilds ? 0.7 : 1);
    } else {
      roundControl(ctx, L.left, app.muted ? '🔇' : '🔊', app.muted ? 0.7 : 1);
    }

    if (!s.shaking) {
      redButton(ctx, L.shake, s.pressed ? 0.94 : 1, app.dpr);
      ctx.font = font(L.shake.font, true);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('摇', L.shake.cx, L.shake.cy);
    }

    roundControl(ctx, L.right, '⚙', 1);
  }

  return {
    enter(mode) {
      s = {
        mode: mode || 'regular',
        dice: [],
        revealed: false,
        shaking: false,
        showHint: false,
        pressed: false,
        /** Controlled mode only: chosen dice use the chosen face and no wilds. */
        noWilds: false,
      };
      hand = [];
      armed = false;
      pendingQty = null;
      touch = null;
      lift.snap(0);
      hint.snap(0);
      bg = backdropCanvas(app.layout, app.dpr, sparkles(26));
      // PLAY on the launch screen comes straight back to this mode next time.
      rememberMode(s.mode);

      // Controlled mode explains itself first; the first roll waits for 确定.
      intro = s.mode === 'controlled' && !introSeen() ? buildIntro(app.ctx) : null;
      if (!intro) roll();
    },

    exit() {
      clearTimeout(longTimer);
      clearTimeout(settleTimer);
      if (app.shakeAudio) app.shakeAudio.stop();
      touch = null;
      intro = null;
    },

    animating(now) {
      return s.shaking || lift.busy(now) || hint.busy(now);
    },

    draw(ctx, now) {
      const t = L.tray;
      ctx.drawImage(bg, 0, 0, app.layout.width, app.layout.height);

      const tray = app.image('assets/images/tray.png');
      if (tray.loaded) ctx.drawImage(tray, t.x, t.y, t.w, t.h);
      drawDice(ctx);
      drawCup(ctx, now);

      const h = L.hint;
      ctx.font = font(h.font, false);
      ctx.fillStyle = 'rgba(234, 241, 255, ' + (0.34 * hint.value(now)).toFixed(3) + ')';
      ctx.textBaseline = 'middle';
      spacedText(ctx, '上滑开盅', h.cx, h.y + (h.font * app.layout.line) / 2, h.spacing);

      drawControls(ctx);
      if (intro) drawIntro(ctx);
    },

    touchStart(x, y) {
      // While the introduction is up, it takes every touch.
      if (intro) {
        intro.pressed = introHit(x, y);
        return;
      }
      // While shaking the button is not drawn, and touches go to the stage.
      if (!s.shaking && inCircle(L.shake, L.shake.outer, x, y)) {
        touch = { target: 'btn' };
        onBtnStart();
        return;
      }
      let target = 'stage';
      if (inCircle(L.left, L.left.r, x, y)) target = 'left';
      else if (inCircle(L.right, L.right.r, x, y)) target = 'right';
      touch = { target: target, x: x, y: y };
    },

    touchEnd(x, y) {
      if (intro) {
        const target = intro.pressed;
        intro.pressed = null;
        if (!target || introHit(x, y) !== target) return;
        if (target === 'check') intro.dontShow = !intro.dontShow;
        else closeIntro();
        return;
      }

      const t = touch;
      touch = null;
      if (!t) return;
      if (t.target === 'btn') {
        onBtnEnd();
        return;
      }

      const dy = y - t.y;
      if (Math.abs(dy) > C.SWIPE_THRESHOLD_PX) {
        if (dy < 0) reveal();
        else hide();
        return;
      }

      // A tap on a control is only that, never a grid tap as well.
      if (t.target === 'left' && inCircle(L.left, L.left.r, x, y)) {
        if (s.mode === 'controlled') toggleNoWilds();
        else toggleMute();
        return;
      }
      if (t.target === 'right' && inCircle(L.right, L.right.r, x, y)) {
        app.go('home');
        return;
      }

      const g = L.grid;
      onZoneTap(zoneAt(x, y - g.top, g.w, g.h));
    },

    touchCancel() {
      if (intro) intro.pressed = null;
      const t = touch;
      touch = null;
      if (t && t.target === 'btn') onBtnEnd();
    },
  };
};
