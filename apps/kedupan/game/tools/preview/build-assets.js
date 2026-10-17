/**
 * Generates the two image assets of 群友刻度盘 into apps/kedupan/game/assets/ (spec 1: "the icon and one static share fallback"):
 *   assets/share-fallback.png  500 x 400 (5:4, the WeChat share image ratio); the path js/share.js FALLBACK_IMAGE points at
 *   assets/icon.png            144 x 144 (square game icon, same artwork as the account avatar)
 * Original code-drawn art, no third-party images and no fonts (the share title comes from the share message itself).
 * Same look as docs/kedupan/release/registration/avatar/build.js: purple field, yellow paper tape, tangerine pointer, teal diamond,
 * plum dot, blue "cold" and orange "hot" notes.
 *
 *   cd apps/kedupan/game/tools/preview && npm install && node build-assets.js
 */

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');

const OUT = path.join(__dirname, '..', '..', 'assets');

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The artwork on a w x h canvas; k scales the motif (1 = the 500 px share image), cy is the tape's vertical centre. */
function art(ctx, w, h, k, cy) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#8A5A9A');
  g.addColorStop(1, '#5A3069');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const tw = w * 0.84;
  const th = 96 * k;
  const tx = (w - tw) / 2;
  const ty = cy - th / 2;
  // tape with a soft shadow
  ctx.fillStyle = 'rgba(44,21,54,0.4)';
  rr(ctx, tx + 4, ty + 7 * k, tw, th, 12 * k);
  ctx.fill();
  ctx.fillStyle = '#F2C94C';
  rr(ctx, tx, ty, tw, th, 12 * k);
  ctx.fill();
  ctx.strokeStyle = '#24211E';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, 4.5 * k);
  for (let i = 0; i <= 16; i++) {
    const x = tx + (tw * (i + 0.5)) / 17;
    const len = i === 8 ? 0.55 : i % 4 === 0 ? 0.36 : 0.2;
    ctx.beginPath();
    ctx.moveTo(x, ty);
    ctx.lineTo(x, ty + th * len);
    ctx.stroke();
  }
  // cold / hot notes
  const nw = 76 * k;
  const nh = 52 * k;
  [[tx + 34 * k, '#CFE3F5', -5], [tx + tw - 34 * k - nw, '#FFD3A8', 5]].forEach(([nx, col, deg]) => {
    ctx.save();
    ctx.translate(nx + nw / 2, ty + th + 14 * k + nh / 2);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.fillStyle = col;
    rr(ctx, -nw / 2, -nh / 2, nw, nh, 6 * k);
    ctx.fill();
    ctx.restore();
  });
  // markers: plum dot (group), teal diamond (nation), tangerine pointer (you)
  const my = ty + th * 0.68;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6 * k;
  ctx.strokeStyle = '#FBF6EC';
  ctx.fillStyle = '#7D4E8C';
  ctx.beginPath();
  ctx.arc(tx + tw * 0.26, my, 24 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const dx = tx + tw * 0.7;
  const dy = ty + th * 0.62;
  ctx.fillStyle = '#2A8C8C';
  ctx.beginPath();
  ctx.moveTo(dx, dy - 26 * k);
  ctx.lineTo(dx + 26 * k, dy);
  ctx.lineTo(dx, dy + 26 * k);
  ctx.lineTo(dx - 26 * k, dy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const px = tx + tw * 0.58;
  const py = ty - 8 * k;
  ctx.fillStyle = '#F07B2C';
  ctx.beginPath();
  ctx.moveTo(px - 34 * k, py - 62 * k);
  ctx.lineTo(px + 34 * k, py - 62 * k);
  ctx.lineTo(px, py);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function write(name, w, h, k, cy) {
  const c = createCanvas(w, h);
  art(c.getContext('2d'), w, h, k, cy);
  const buf = c.toBuffer('image/png');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log(name, w + 'x' + h, buf.length + ' bytes');
}

write('share-fallback.png', 500, 400, 1, 215);
write('icon.png', 144, 144, 0.3, 78);
