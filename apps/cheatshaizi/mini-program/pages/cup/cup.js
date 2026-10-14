const C = require('../../core/config');
const { fairRng } = require('../../core/rng');
const { rollFair } = require('../../core/hands');
const { rollLucky } = require('../../core/lucky');
const { rollInsane } = require('../../core/insane');
const {
  applyCheat,
  zoneAt,
  zoneToQuantity,
  zoneToFace,
} = require('../../core/cheat');
const { sparkles, toDice } = require('../../utils/ui');

const app = getApp();

/**
 * Resting places for the five dice, as percentages of the tray: the cluster
 * from visuals/oc2.png, two behind, one to the right, two in front.
 *
 * Checked against the sprites: with the cup down, every die stays inside its
 * silhouette, and with the cup up its base clears the whole cluster.
 */
const SLOTS = [
  { x: 23.4, y: 19.0 },
  { x: 43.7, y: 12.3 },
  { x: 61.0, y: 24.5 },
  { x: 27.7, y: 43.0 },
  { x: 47.8, y: 42.2 },
];

/** Scatter the dice a little so a re-roll does not look like a redraw. */
function positioned(hand, rng) {
  return toDice(hand).map(function (die, i) {
    const slot = SLOTS[i];
    // Kept small: the dice are 3D renders, so a large in-plane rotation would
    // look wrong, and loose dice could poke out from under the cup.
    const jx = (rng() - 0.5) * 2.4;
    const jy = (rng() - 0.5) * 2.4;
    const rot = (rng() - 0.5) * 10;
    const top = slot.y + jy;
    // Depth order: the lower a die sits on screen the nearer it is, so it
    // paints over the ones behind it. The offset keeps the z-index positive
    // even if a slot sits at the very top of the tray, since a negative one
    // sinks the die behind the tray. Tops out near 46, well under the cup's
    // own z-index, which must stay above every die.
    die.pos =
      'left:' + (slot.x + jx).toFixed(1) + '%;' +
      'top:' + top.toFixed(1) + '%;' +
      'z-index:' + (2 + Math.round(top)) + ';' +
      'transform:rotate(' + rot.toFixed(1) + 'deg);';
    return die;
  });
}

function windowSize() {
  if (typeof wx.getWindowInfo === 'function') {
    const w = wx.getWindowInfo();
    return { width: w.windowWidth, height: w.windowHeight };
  }
  const s = wx.getSystemInfoSync();
  return { width: s.windowWidth, height: s.windowHeight };
}

Page({
  data: {
    mode: 'lucky',
    dice: [],
    sparkles: [],
    revealed: false,
    shaking: false,
    showHint: false,
    muted: false,
    pressed: false,
    /** Cheat mode only: declared dice use the chosen face and no wilds. */
    pureCheat: false,
  },

  onLoad(query) {
    const mode = query && query.mode ? query.mode : 'lucky';

    this.hand = [];
    this.armed = false; // cheat override active, until the next roll
    this.pendingQty = null; // first of the two cheat taps
    this.win = windowSize();

    this.shakeAudio = wx.createInnerAudioContext();
    this.shakeAudio.src = '/assets/sounds/shake.mp3';

    this.setData({
      mode: mode,
      muted: app.globalData.muted,
      sparkles: sparkles(26),
    });

    this.roll();
  },

  onUnload() {
    clearTimeout(this.longTimer);
    clearTimeout(this.settleTimer);
    if (this.shakeAudio) this.shakeAudio.destroy();
  },

  // --- rolling ------------------------------------------------------------

  generate() {
    switch (this.data.mode) {
      case 'insane':
        return rollInsane(fairRng);
      case 'cheat':
        return rollFair(fairRng);
      case 'lucky':
      default:
        return rollLucky(fairRng);
    }
  },

  roll() {
    if (this.data.shaking) return;

    this.hand = this.generate();
    this.armed = false;
    this.pendingQty = null;

    this.setData({
      dice: positioned(this.hand, fairRng),
      revealed: false,
      shaking: true,
      showHint: false,
    });

    this.play(this.shakeAudio);

    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.setData({ shaking: false, showHint: true });
    }, C.SHAKE_DURATION_MS);
  },

  // --- the roll button: tap rolls, long press arms the cheat ---------------

  onBtnStart() {
    this.longFired = false;
    this.setData({ pressed: true });

    clearTimeout(this.longTimer);
    this.longTimer = setTimeout(() => {
      this.longFired = true;
      if (this.data.mode !== 'cheat' || this.data.shaking) return;
      this.armed = true;
      this.pendingQty = null;
      this.buzz(true);
      console.log('[cheat] armed — tap quantity, then face');
    }, C.CHEAT_LONGPRESS_MS);
  },

  onBtnEnd() {
    clearTimeout(this.longTimer);
    this.setData({ pressed: false });
    if (!this.longFired) this.roll();
  },

  // --- stage gestures: swipe reveals, tap feeds the cheat grid -------------

  onTouchStart(e) {
    const t = e.touches[0];
    this.startX = t.clientX;
    this.startY = t.clientY;
  },

  onTouchEnd(e) {
    const t = e.changedTouches[0];
    const dy = t.clientY - this.startY;

    if (Math.abs(dy) > C.SWIPE_THRESHOLD_PX) {
      if (dy < 0) this.reveal();
      else this.hide();
      return;
    }
    this.onZoneTap(zoneAt(t.clientX, t.clientY, this.win.width, this.win.height));
  },

  onZoneTap(zone) {
    if (this.data.mode !== 'cheat') return;
    if (!this.armed || this.data.shaking) return;

    this.buzz(false);

    if (this.pendingQty === null) {
      this.pendingQty = zoneToQuantity(zone);
      console.log('[cheat] quantity =', this.pendingQty);
      return;
    }

    const face = zoneToFace(zone);
    const qty = this.pendingQty;
    this.pendingQty = null;
    // One alteration per arming. Long-press 摇 again to set another hand —
    // this way a stray tap afterwards cannot touch the dice.
    this.armed = false;

    this.hand = applyCheat(
      fairRng,
      qty,
      face,
      this.data.pureCheat ? 'uniform' : undefined
    );

    const view = positioned(this.hand, fairRng);
    if (this.data.revealed) {
      // With the cup up the change is in plain sight, so leave every die
      // exactly where it already lies: only the faces turn over, rather than
      // the whole pile visibly jumping to new positions.
      const prev = this.data.dice;
      for (let i = 0; i < view.length; i++) {
        if (prev[i]) view[i].pos = prev[i].pos;
      }
    }
    this.setData({ dice: view });
    console.log(
      '[cheat] set', qty, 'x', face, '->', this.hand.join(' '),
      '— disarmed, long-press to arm again'
    );
  },

  reveal() {
    if (this.data.shaking || this.data.revealed) return;
    // The hand is NOT frozen here — the override still works with the cup up,
    // so a hand can be fixed after seeing it.
    this.setData({ revealed: true, showHint: false });
  },

  hide() {
    if (!this.data.revealed) return;
    this.setData({ revealed: false });
  },

  /**
   * Haptic feedback — the only signal the cheat path gives you, so it has to
   * actually land.
   *
   * Arming is a double tick, a zone tap a single tick. `wx.vibrateLong` is
   * avoided on purpose: its 400ms buzz is audible when the phone lies on a
   * table.
   *
   * `wx.vibrateShort` is driven by the Taptic Engine on iOS, and it is
   * silently dropped when System Haptics is off or Low Power Mode is on.
   *
   * Failures are logged rather than swallowed, so 真机调试 shows the reason.
   */
  buzz(double) {
    const fail = (e) => console.log('[haptics] failed:', e && e.errMsg);
    const tick = () => wx.vibrateShort({ type: 'heavy', fail: fail });
    tick();
    if (double) setTimeout(tick, C.DOUBLE_TICK_GAP_MS);
  },

  // --- controls -----------------------------------------------------------

  /**
   * Cheat mode only. On, the declared dice are all the chosen face — ask for
   * four 3s and you get four 3s, never a mix of 3s and wilds. Deliberately
   * silent: the only buzzes are arming and the two cheat taps, so there is
   * nothing to miscount.
   */
  togglePure() {
    const pureCheat = !this.data.pureCheat;
    this.setData({ pureCheat: pureCheat });
    console.log('[cheat] no-wilds =', pureCheat ? 'on' : 'off');
  },

  toggleMute() {
    const muted = !this.data.muted;
    app.globalData.muted = muted;
    this.setData({ muted: muted });
    if (muted) {
      this.shakeAudio.stop();
    }
  },

  play(audio) {
    if (this.data.muted || !audio) return;
    audio.stop();
    audio.play();
  },

  goBack() {
    wx.navigateBack();
  },
});
