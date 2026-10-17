/**
 * Our own artwork, drawn in code (original; no images, no fonts): the brush-baton mascot of direction 6 / the account
 * avatar (a taped paper note, a blue doodle, a brush relay baton), the 3-panel how-to illustration, and small
 * empty/offline/error pictures. Pure canvas calls. Colours are the fixed brand colours (art does not follow high
 * contrast, but every use sits on a plain card).
 */

const T = require('./theme');

const BRAND = { orange1: '#F7B04B', orange2: '#EE8A1F', paper: '#FFFDF8', blue: '#3C78C8', verm: '#D8433B', ink: '#1E1B18', tape: '#F2C94C', ferrule: '#C9CED6', ferruleDark: '#9AA1AB' };

function rrPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/** the brush relay baton, pointing right at (0,0) = bristle tip, in a 1024 design box scale s */
function baton(ctx) {
  ctx.fillStyle = BRAND.ink;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(22, -26, 64, -34, 96, -30);
  ctx.lineTo(96, 30);
  ctx.bezierCurveTo(64, 34, 22, 26, 0, 0);
  ctx.closePath();
  ctx.fill();
  rrPath(ctx, 96, -32, 54, 64, 8);
  ctx.fillStyle = BRAND.ferrule;
  ctx.fill();
  ctx.fillStyle = BRAND.ferruleDark;
  ctx.fillRect(110, -32, 8, 64);
  ctx.fillStyle = BRAND.verm;
  ctx.beginPath();
  ctx.moveTo(150, -30);
  ctx.lineTo(350, -18);
  ctx.quadraticCurveTo(372, 0, 350, 18);
  ctx.lineTo(150, 30);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(250,247,240,0.85)';
  ctx.fillRect(196, -25, 18, 50);
}

/**
 * The mascot: tilted paper note with tape, a wobbling blue doodle ending in the brush baton.
 * o: {field: true to paint the orange field behind it (share card, splash)}.
 */
function mascot(ctx, cx, cy, size, o) {
  o = o || {};
  const s = size / 1024;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(s, s);
  if (o.field) {
    const g = ctx.createLinearGradient(0, 0, 1024, 1024);
    g.addColorStop(0, BRAND.orange1);
    g.addColorStop(1, BRAND.orange2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 1024);
  }
  ctx.save();
  ctx.translate(512, 520);
  ctx.rotate((-7 * Math.PI) / 180);
  ctx.translate(-512, -520);
  rrPath(ctx, 258, 270, 520, 520, 40);
  ctx.fillStyle = 'rgba(168,87,12,0.28)';
  ctx.fill();
  rrPath(ctx, 244, 252, 520, 520, 40);
  ctx.fillStyle = BRAND.paper;
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,27,24,0.55)';
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.save();
  ctx.translate(505, 248);
  ctx.rotate((3 * Math.PI) / 180);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = BRAND.tape;
  ctx.fillRect(-85, -26, 170, 52);
  ctx.restore();
  ctx.restore();
  ctx.strokeStyle = BRAND.blue;
  ctx.lineWidth = 46;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(300, 650);
  ctx.bezierCurveTo(330, 520, 420, 520, 430, 610);
  ctx.bezierCurveTo(440, 700, 520, 760, 560, 640);
  ctx.bezierCurveTo(600, 520, 640, 520, 676, 580);
  ctx.stroke();
  ctx.save();
  ctx.translate(676, 580);
  ctx.rotate((-52 * Math.PI) / 180);
  baton(ctx);
  ctx.restore();
  ctx.restore();
}

/** hand-drawn down arrow (reveal strip, how-to). */
function arrow(ctx, x1, y1, x2, y2, color, lw) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw || 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const mx = (x1 + x2) / 2 + (y2 > y1 ? 3 : 0);
  const my = (y1 + y2) / 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(mx, my, x2, y2);
  ctx.stroke();
  const a = Math.atan2(y2 - my, x2 - mx);
  const h = 8;
  ctx.beginPath();
  ctx.moveTo(x2 - h * Math.cos(a - 0.5), y2 - h * Math.sin(a - 0.5));
  ctx.lineTo(x2, y2);
  ctx.lineTo(x2 - h * Math.cos(a + 0.5), y2 - h * Math.sin(a + 0.5));
  ctx.stroke();
}

/** the three-panel mini chain of the 玩法 sheet: a drawing, a sentence, a drawing */
function howtoPanels(ctx, x, y, w, h) {
  const gap = w * 0.12;
  const pw = (w - 2 * gap) / 3;
  const ink = T.isHC() ? '#000000' : BRAND.ink;
  for (let i = 0; i < 3; i++) {
    const px = x + i * (pw + gap);
    rrPath(ctx, px, y, pw, h, 8);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = T.isHC() ? 2 : 1.5;
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, h * 0.06);
    if (i === 0) {
      // a crescent moon
      ctx.strokeStyle = BRAND.blue;
      ctx.beginPath();
      ctx.arc(px + pw * 0.5, y + h * 0.5, h * 0.24, 0.7, 5.6);
      ctx.stroke();
    } else if (i === 1) {
      // a sentence: three bars
      ctx.strokeStyle = ink;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(px + pw * 0.2, y + h * (0.32 + k * 0.18));
        ctx.lineTo(px + pw * (k === 2 ? 0.55 : 0.8), y + h * (0.32 + k * 0.18));
        ctx.stroke();
      }
    } else {
      // a wobbly pie
      ctx.strokeStyle = BRAND.verm;
      ctx.beginPath();
      ctx.moveTo(px + pw * 0.22, y + h * 0.7);
      ctx.lineTo(px + pw * 0.5, y + h * 0.26);
      ctx.lineTo(px + pw * 0.78, y + h * 0.7);
      ctx.closePath();
      ctx.stroke();
    }
    if (i < 2) arrow(ctx, px + pw + gap * 0.12, y + h / 2, px + pw + gap * 0.88, y + h / 2, ink, 2);
  }
}

/** small pictures for empty / offline / error / lock states, centred at (cx, cy) in a size x size box */
function stateArt(ctx, cx, cy, size, kind) {
  const s = size;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.07);
  rrPath(ctx, -s * 0.36, -s * 0.4, s * 0.72, s * 0.8, s * 0.08);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = T.isHC() ? '#000000' : 'rgba(30,27,24,0.75)';
  ctx.lineWidth = T.isHC() ? 2.5 : 2;
  ctx.stroke();
  if (!T.isHC()) {
    ctx.fillStyle = BRAND.tape;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(-s * 0.16, -s * 0.46, s * 0.32, s * 0.1);
    ctx.globalAlpha = 1;
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, s * 0.05);
  ctx.strokeStyle = kind === 'error' ? BRAND.verm : BRAND.blue;
  ctx.beginPath();
  if (kind === 'offline') {
    ctx.moveTo(-s * 0.22, s * 0.05);
    ctx.quadraticCurveTo(0, -s * 0.2, s * 0.22, s * 0.05);
    ctx.moveTo(-s * 0.1, s * 0.16);
    ctx.quadraticCurveTo(0, s * 0.06, s * 0.1, s * 0.16);
    ctx.moveTo(-s * 0.26, -s * 0.18);
    ctx.lineTo(s * 0.26, s * 0.26);
  } else if (kind === 'error') {
    ctx.moveTo(-s * 0.16, -s * 0.16);
    ctx.lineTo(s * 0.16, s * 0.16);
    ctx.moveTo(s * 0.16, -s * 0.16);
    ctx.lineTo(-s * 0.16, s * 0.16);
  } else if (kind === 'lock') {
    ctx.arc(0, -s * 0.05, s * 0.13, Math.PI, 0);
    ctx.moveTo(-s * 0.2, 0);
    ctx.lineTo(s * 0.2, 0);
    ctx.lineTo(s * 0.2, s * 0.24);
    ctx.lineTo(-s * 0.2, s * 0.24);
    ctx.closePath();
  } else {
    ctx.moveTo(-s * 0.22, s * 0.12);
    ctx.bezierCurveTo(-s * 0.15, -s * 0.2, -s * 0.05, -s * 0.2, 0, s * 0.02);
    ctx.bezierCurveTo(s * 0.05, s * 0.2, s * 0.15, s * 0.2, s * 0.22, -s * 0.05);
  }
  ctx.stroke();
  ctx.restore();
}

module.exports = { BRAND, mascot, baton, arrow, howtoPanels, stateArt, rrPath };
