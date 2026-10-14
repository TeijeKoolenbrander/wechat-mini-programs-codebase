/**
 * Screen geometry for every scene, in canvas (CSS) pixels. Pure, so it can be
 * checked without a device.
 *
 * Sizes are in rpx, scaled the way WeChat scales rpx: the screen is 750rpx
 * wide. Content starts at `top`, below the capsule menu, so the lifted cup
 * stays clear of it.
 */

/** CSS `line-height: normal`, near enough for the system fonts. */
const LINE = 1.4;

function makeLayout(screen) {
  const W = screen.width;
  const H = screen.height;
  const top = screen.top;
  const r = W / 750;
  const cx = W / 2;

  // The area below the capsule menu.
  const stage = { x: 0, y: top, w: W, h: H - top };

  // --- launch screen: a centred column ---
  const titleFont = 68 * r;
  const titleH = 60 * r + LINE * titleFont;
  const howtoFont = 28 * r;
  const howtoH = 48 * r + LINE * howtoFont;
  const column = titleH + 90 * r + 280 * r + 70 * r + howtoH;
  const y0 = top + (stage.h - column) / 2;

  const home = {
    title: {
      cx: cx,
      y: y0,
      h: titleH,
      font: titleFont,
      spacing: 8 * r,
    },
    play: {
      cx: cx,
      cy: y0 + titleH + 90 * r + 140 * r,
      inner: 130 * r,
      outer: 140 * r,
      font: 56 * r,
      spacing: 4 * r,
      shadow: { dy: 14 * r, blur: 36 * r, alpha: 0.5 },
    },
    // Two links on one row under PLAY: 切换模式 on the left, 玩法说明 on the
    // right, with a dot between them.
    switchMode: {
      cx: cx - 130 * r,
      y: y0 + titleH + 90 * r + 280 * r + 70 * r,
      h: howtoH,
      padX: 60 * r,
      font: howtoFont,
      spacing: 4 * r,
    },
    howto: {
      cx: cx + 130 * r,
      y: y0 + titleH + 90 * r + 280 * r + 70 * r,
      h: howtoH,
      padX: 60 * r,
      font: howtoFont,
      spacing: 4 * r,
    },
    linkDot: { cx: cx, font: howtoFont },
    credits: {
      cx: cx,
      bottom: H - 40 * r - screen.bottomInset,
      font: 22 * r,
      spacing: 2 * r,
    },
  };

  // --- mode select: a heading, a note under it, and four stacked buttons ---
  const headFont = 40 * r;
  const noteFont = 24 * r;
  const headBlock = LINE * headFont + 12 * r + LINE * noteFont + 48 * r;
  const btnH = 150 * r;
  const btnGap = 36 * r;
  const modesColumn = headBlock + 4 * btnH + 3 * btnGap;
  const my0 = top + (stage.h - 180 * r - 40 * r - modesColumn) / 2;
  const buttons = [];
  for (let i = 0; i < 4; i++) {
    buttons.push({
      x: cx - 300 * r,
      y: my0 + headBlock + i * (btnH + btnGap),
      w: 600 * r,
      h: btnH,
      radius: 28 * r,
    });
  }

  // --- cup screen ---
  const tableTop = top + 30 * r;
  const tableBottom = tableTop + 1000 * r;
  const controlsY = H - 90 * r - 90 * r; // tallest item is the 180rpx button

  const cup = {
    tray: { x: cx - 260 * r, y: tableBottom - 352 * r, w: 520 * r, h: 352 * r },
    die: { w: 88 * r, h: 100 * r, shadowDy: 3 * r, shadowBlur: 3 * r },
    // Drawn from its bottom centre, which is also the wobble's pivot.
    cup: {
      cx: cx,
      bottom: tableBottom - 79 * r,
      w: 442 * r,
      h: 622 * r,
      lift: 288 * r,
      hop: 14 * r,
    },
    hint: { cx: cx, y: tableBottom + 10 * r, font: 26 * r, spacing: 6 * r },
    left: { cx: cx - 236 * r, cy: controlsY, r: 56 * r, border: 2 * r, font: 44 * r },
    right: { cx: cx + 236 * r, cy: controlsY, r: 56 * r, border: 2 * r, font: 44 * r },
    shake: {
      cx: cx,
      cy: controlsY,
      inner: 82 * r,
      outer: 90 * r,
      font: 54 * r,
      shadow: { dy: 10 * r, blur: 26 * r, alpha: 0.45 },
    },
    // The Controlled-mode grid: everything below the capsule menu.
    grid: { top: top, w: W, h: H - top },
    // The explanation drawn over that grid before Controlled mode starts.
    // Zone labels sit in the outer columns, the card in the middle, so the
    // card never covers a label.
    intro: {
      labelX: [W * 0.11, W * 0.89],
      labelFont: 26 * r,
      numberFont: 56 * r,
      card: { x: cx - W * 0.28, w: W * 0.56, pad: 26 * r, radius: 24 * r },
      font: 24 * r,
      headFont: 30 * r,
      lineH: 24 * r * 1.55,
      check: 30 * r,
      button: { h: 76 * r, radius: 38 * r, font: 30 * r },
    },
  };

  // Shared bottom-left back control, in the same place as the cup screen's
  // left control.
  const back = { cx: cx - 236 * r, cy: controlsY, r: 56 * r, border: 2 * r, font: 44 * r };

  const modes = {
    head: { cx: cx, y: my0, font: headFont, spacing: 6 * r },
    note: { cx: cx, y: my0 + LINE * headFont + 12 * r, font: noteFont },
    buttons: buttons,
    nameFont: 38 * r,
    descFont: 24 * r,
    back: back,
  };

  // --- help: scrolling text between the top and the back control ---
  const help = {
    x: 60 * r,
    w: W - 120 * r,
    top: top + 20 * r,
    bottom: controlsY - 56 * r - 30 * r,
    headFont: 40 * r,
    sectionFont: 30 * r,
    font: 26 * r,
    lineH: 26 * r * 1.6,
    gap: 28 * r,
    back: back,
  };

  return {
    r: r,
    width: W,
    height: H,
    stage: stage,
    home: home,
    modes: modes,
    help: help,
    cup: cup,
    line: LINE,
  };
}

function inCircle(c, radius, x, y) {
  const dx = x - c.cx;
  const dy = y - c.cy;
  return dx * dx + dy * dy <= radius * radius;
}

function inRect(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

module.exports = { makeLayout, inCircle, inRect, LINE };
