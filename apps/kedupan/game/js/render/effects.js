/**
 * Small decorative effects. Deterministic (no Math.random): progress `t`
 * (0..1) comes from the logic. No flashing; paper confetti only.
 */

const T = require('./theme');

const PIECES = 26;

/** Paper-confetti burst for 心有灵犀. t = 0..1 (1 or null = settled, nothing drawn). */
function confetti(ctx, L, cx, cy, t) {
  if (t == null || t >= 1 || t <= 0) return;
  const colors = T.MODE.hc ? ['#B04A00', '#145F5F', '#4E2A5C', '#000000'] : ['#F07B2C', '#2A8C8C', '#7D4E8C', '#F2C94C'];
  ctx.save();
  for (let i = 0; i < PIECES; i++) {
    const a = ((i * 137.5) % 360) * (Math.PI / 180);
    const speed = (0.45 + ((i * 53) % 100) / 160) * L.u(150);
    const k = 1 - Math.pow(1 - t, 2.2);
    const x = cx + Math.cos(a) * speed * k;
    const y = cy + Math.sin(a) * speed * k * 0.8 + t * t * L.u(70) - L.u(26) * k;
    const w = L.u(7 + (i % 3) * 2);
    const h = L.u(11 + (i % 2) * 3);
    ctx.globalAlpha = Math.max(0, 1 - t * t);
    ctx.translate(x, y);
    ctx.rotate(a + t * (3 + (i % 4)));
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.rotate(-(a + t * (3 + (i % 4))));
    ctx.translate(-x, -y);
  }
  ctx.restore();
}

module.exports = { confetti };
