/**
 * The launch screen: the title, PLAY, and links to switch mode and to help.
 * The disclaimer and healthy-gaming notice are in 玩法说明.
 *
 * PLAY goes straight into the last mode played, or to the mode screen the
 * first time. 切换模式 always opens the mode screen. 玩法说明 opens help.
 * The title is only text.
 */

const { inCircle, inRect } = require('./layout');
const { font, sparkles, backdropCanvas, spacedWidth, spacedText, redButton } = require('./draw');
const { lastMode } = require('./storage');

const TITLE = '摇骰子';
const SWITCH = '切换模式';
const HOWTO = '玩法说明';
const CREDITS = 'TK · EW';

module.exports = function createHome(app) {
  const L = app.layout;
  const H = L.home;

  let bg = null;
  let pressed = null; // the target the finger went down on
  let switchRect = null;
  let howtoRect = null;

  /** A link's tap box follows its text, so measure it. */
  function textBox(ctx, item, text, bold) {
    ctx.font = font(item.font, bold);
    const w = spacedWidth(ctx, text, item.spacing) + item.padX * 2;
    return { x: item.cx - w / 2, y: item.y, w: w, h: item.h };
  }

  function hit(x, y) {
    if (inCircle(H.play, H.play.outer, x, y)) return 'play';
    if (inRect(switchRect, x, y)) return 'switch';
    if (inRect(howtoRect, x, y)) return 'howto';
    return null;
  }

  function label(ctx, item, text, bold, color, middle) {
    ctx.font = font(item.font, bold);
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    spacedText(ctx, text, item.cx, middle, item.spacing);
  }

  function link(ctx, item, text, target) {
    const alpha = pressed === target ? 0.8 : 0.5;
    label(ctx, item, text, false, 'rgba(234, 241, 255, ' + alpha + ')', item.y + item.h / 2);
  }

  function open(target) {
    if (target === 'switch') return app.go('modes');
    if (target === 'howto') return app.go('help');
    const mode = lastMode();
    if (mode) app.go('cup', mode);
    else app.go('modes');
  }

  return {
    enter() {
      bg = backdropCanvas(L, app.dpr, sparkles(26));
      pressed = null;
      switchRect = textBox(app.ctx, H.switchMode, SWITCH, false);
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

      link(ctx, H.switchMode, SWITCH, 'switch');
      link(ctx, H.howto, HOWTO, 'howto');
      ctx.font = font(H.linkDot.font, false);
      ctx.fillStyle = 'rgba(234, 241, 255, 0.3)';
      ctx.textAlign = 'center';
      ctx.fillText('·', H.linkDot.cx, H.howto.y + H.howto.h / 2);

      const c = H.credits;
      label(ctx, c, CREDITS, false, 'rgba(234, 241, 255, 0.28)', c.bottom - (c.font * L.line) / 2);
    },

    touchStart(x, y) {
      pressed = hit(x, y);
    },

    touchEnd(x, y) {
      const target = pressed;
      pressed = null;
      if (target && hit(x, y) === target) open(target);
    },

    touchCancel() {
      pressed = null;
    },
  };
};
