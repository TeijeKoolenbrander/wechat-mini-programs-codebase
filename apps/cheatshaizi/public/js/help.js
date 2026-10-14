/**
 * The help screen (玩法说明): what the game is, the controls, every mode and
 * how Controlled mode works, then the notices. Scrolls by dragging when it is
 * taller than the screen.
 */

const { inCircle } = require('./layout');
const { font, sparkles, backdropCanvas, wrapText, roundControl } = require('./draw');
const { HELP } = require('./text');

const HEADING = '玩法说明';

module.exports = function createHelp(app) {
  const L = app.layout;
  const P = L.help;

  let bg = null;
  let rows = []; // { text, font, bold, color, h }
  let contentH = 0;
  let scroll = 0;
  let drag = null; // { y, scroll } while a finger is down on the text
  let pressed = null;

  /** Wrap every section once, so drawing and scrolling share the same rows. */
  function build(ctx) {
    rows = [];
    const add = (text, size, bold, color, h) => rows.push({ text, size, bold, color, h });

    add(HEADING, P.headFont, true, '#eaf1ff', P.headFont * 1.6);
    for (const section of HELP) {
      add('', 0, false, '', P.gap);
      add(section.head, P.sectionFont, true, '#ffffff', P.sectionFont * 1.6);
      ctx.font = font(P.font, false);
      for (const line of section.lines) {
        for (const part of wrapText(ctx, line, P.w)) {
          add(part, P.font, false, 'rgba(234, 241, 255, 0.72)', P.lineH);
        }
      }
    }
    contentH = rows.reduce((sum, r) => sum + r.h, 0);
  }

  function maxScroll() {
    return Math.max(0, contentH - (P.bottom - P.top));
  }

  return {
    enter() {
      bg = backdropCanvas(L, app.dpr, sparkles(26));
      scroll = 0;
      drag = null;
      pressed = null;
      build(app.ctx);
    },

    exit() {
      drag = null;
      pressed = null;
    },

    animating() {
      return false;
    },

    draw(ctx) {
      ctx.drawImage(bg, 0, 0, L.width, L.height);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, P.top, L.width, P.bottom - P.top);
      ctx.clip();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      let y = P.top - scroll;
      for (const r of rows) {
        if (r.text && y + r.h > P.top && y < P.bottom) {
          ctx.font = font(r.size, r.bold);
          ctx.fillStyle = r.color;
          ctx.fillText(r.text, P.x, y + r.h / 2);
        }
        y += r.h;
      }
      ctx.restore();

      roundControl(ctx, P.back, '←', pressed === 'back' ? 0.7 : 1);
    },

    touchStart(x, y) {
      if (inCircle(P.back, P.back.r, x, y)) {
        pressed = 'back';
        return;
      }
      drag = { y: y, scroll: scroll };
    },

    touchMove(x, y) {
      if (!drag) return;
      scroll = Math.min(maxScroll(), Math.max(0, drag.scroll - (y - drag.y)));
    },

    touchEnd(x, y) {
      const target = pressed;
      pressed = null;
      drag = null;
      if (target === 'back' && inCircle(P.back, P.back.r, x, y)) app.go('home');
    },

    touchCancel() {
      pressed = null;
      drag = null;
    },
  };
};
