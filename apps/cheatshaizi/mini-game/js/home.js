/**
 * The launch screen (pages/home in the mini-program).
 *
 * Three ways in, and only PLAY looks like a button: the title opens Insane
 * and the help link opens Cheat. Neither reacts to a press. Nothing may hint
 * that it is tappable.
 */

const { inCircle, inRect } = require('./layout');
const { font, sparkles, backdropCanvas, spacedWidth, spacedText, redButton } = require('./draw');

const TITLE = '摇骰子';
const HOWTO = '玩法说明';
const CREDITS = 'TK · EW';

const MODE_OF = { play: 'lucky', title: 'insane', howto: 'cheat' };

module.exports = function createHome(app) {
  const L = app.layout;
  const H = L.home;

  let bg = null;
  let pressed = null; // the target the finger went down on
  let titleRect = null;
  let howtoRect = null;

  /**
   * The title and help link have generous padding, so they can be hit
   * without aiming. Their boxes depend on the text, so measure it.
   */
  function textBox(ctx, item, text, bold) {
    ctx.font = font(item.font, bold);
    const w = spacedWidth(ctx, text, item.spacing) + item.padX * 2;
    return { x: item.cx - w / 2, y: item.y, w: w, h: item.h };
  }

  function hit(x, y) {
    if (inCircle(H.play, H.play.outer, x, y)) return 'play';
    if (inRect(titleRect, x, y)) return 'title';
    if (inRect(howtoRect, x, y)) return 'howto';
    return null;
  }

  function label(ctx, item, text, bold, color, middle) {
    ctx.font = font(item.font, bold);
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    spacedText(ctx, text, item.cx, middle, item.spacing);
  }

  return {
    enter() {
      bg = backdropCanvas(L, app.dpr, sparkles(26));
      pressed = null;
      titleRect = textBox(app.ctx, H.title, TITLE, true);
      howtoRect = textBox(app.ctx, H.howto, HOWTO, false);
    },

    exit() {
      pressed = null;
    },

    animating() {
      return false;
    },

    draw(ctx) {
      ctx.drawImage(bg, 0, 0, L.width, L.height);

      label(ctx, H.title, TITLE, true, '#eaf1ff', H.title.y + H.title.h / 2);

      redButton(ctx, H.play, pressed === 'play' ? 0.95 : 1, app.dpr);
      label(ctx, H.play, 'PLAY', true, '#ffffff', H.play.cy);

      label(ctx, H.howto, HOWTO, false, 'rgba(234, 241, 255, 0.42)', H.howto.y + H.howto.h / 2);

      const c = H.credits;
      label(ctx, c, CREDITS, false, 'rgba(234, 241, 255, 0.28)', c.bottom - (c.font * L.line) / 2);
    },

    touchStart(x, y) {
      pressed = hit(x, y);
    },

    touchEnd(x, y) {
      const target = pressed;
      pressed = null;
      if (target && hit(x, y) === target) app.go('cup', MODE_OF[target]);
    },

    touchCancel() {
      pressed = null;
    },
  };
};
