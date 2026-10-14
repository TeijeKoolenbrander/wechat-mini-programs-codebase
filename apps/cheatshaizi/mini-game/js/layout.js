/**
 * Screen geometry for both scenes, in canvas (CSS) pixels. Pure, so it can be
 * checked without a device.
 *
 * Every number is the mini-program's rpx value from its .wxss, scaled the way
 * WeChat scales rpx: the screen is 750rpx wide. `top` stands in for the
 * navigation bar the mini-program had. Content starts below it, so the
 * lifted cup stays clear of the capsule menu, and the layout keeps the same
 * proportions as the mini-program.
 */

/** CSS `line-height: normal`, near enough for the system fonts. */
const LINE = 1.4;

function makeLayout(screen) {
  const W = screen.width;
  const H = screen.height;
  const top = screen.top;
  const r = W / 750;
  const cx = W / 2;

  // The area the mini-program's pages filled, below the navigation bar.
  const stage = { x: 0, y: top, w: W, h: H - top };

  // --- launch screen: a centred column (home.wxss) ---
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
      padX: 70 * r,
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
    howto: {
      cx: cx,
      y: y0 + titleH + 90 * r + 280 * r + 70 * r,
      h: howtoH,
      padX: 60 * r,
      font: howtoFont,
      spacing: 4 * r,
    },
    credits: {
      cx: cx,
      bottom: H - 40 * r - screen.bottomInset,
      font: 22 * r,
      spacing: 2 * r,
    },
  };

  // --- cup screen (cup.wxss) ---
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
    // The cheat grid covers the same area as on the mini-program page.
    grid: { top: top, w: W, h: H - top },
  };

  return { r: r, width: W, height: H, stage: stage, home: home, cup: cup, line: LINE };
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
