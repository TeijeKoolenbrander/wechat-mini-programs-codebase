/**
 * The mode screen: four labelled buttons, one per mode, and a back control.
 * Every mode the game has is listed here, with what it does.
 */

const { inCircle, inRect } = require('./layout');
const { font, sparkles, backdropCanvas, spacedText, panelButton, roundControl } = require('./draw');
const { MODES } = require('./text');

const HEADING = '选择模式';
const NOTE = '选好的模式会被记住，以后点 PLAY 直接进入';

module.exports = function createModes(app) {
  const L = app.layout;
  const M = L.modes;

  let bg = null;
  let pressed = null; // a mode id, 'back', or null

  function hit(x, y) {
    for (let i = 0; i < MODES.length; i++) {
      if (inRect(M.buttons[i], x, y)) return MODES[i].id;
    }
    if (inCircle(M.back, M.back.r, x, y)) return 'back';
    return null;
  }

  return {
    enter() {
      bg = backdropCanvas(L, app.dpr, sparkles(26));
      pressed = null;
    },

    exit() {
      pressed = null;
    },

    animating() {
      return false;
    },

    draw(ctx) {
      ctx.drawImage(bg, 0, 0, L.width, L.height);

      ctx.font = font(M.head.font, true);
      ctx.fillStyle = '#eaf1ff';
      ctx.textBaseline = 'middle';
      spacedText(ctx, HEADING, M.head.cx, M.head.y + (M.head.font * L.line) / 2, M.head.spacing);

      ctx.font = font(M.note.font, false);
      ctx.fillStyle = 'rgba(234, 241, 255, 0.55)';
      ctx.textAlign = 'center';
      ctx.fillText(NOTE, M.note.cx, M.note.y + (M.note.font * L.line) / 2);

      MODES.forEach((mode, i) => {
        const b = M.buttons[i];
        panelButton(ctx, b, pressed === mode.id);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = font(M.nameFont, true);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(mode.name, b.x + b.w / 2, b.y + b.h * 0.38);
        ctx.font = font(M.descFont, false);
        ctx.fillStyle = 'rgba(234, 241, 255, 0.6)';
        ctx.fillText(mode.desc, b.x + b.w / 2, b.y + b.h * 0.7);
      });

      roundControl(ctx, M.back, '←', pressed === 'back' ? 0.7 : 1);
    },

    touchStart(x, y) {
      pressed = hit(x, y);
    },

    touchEnd(x, y) {
      const target = pressed;
      pressed = null;
      if (!target || hit(x, y) !== target) return;
      if (target === 'back') app.go('home');
      else app.go('cup', target);
    },

    touchCancel() {
      pressed = null;
    },
  };
};
