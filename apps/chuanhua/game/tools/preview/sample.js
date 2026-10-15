/** Sample drawings in the spec 5.3 stroke format, for fixtures and tests. */

/** [c, w, x0, y0, dx1, dy1, ...] from absolute points. */
function enc(c, w, pts) {
  const out = [c, w, Math.round(pts[0][0]), Math.round(pts[0][1])];
  let px = Math.round(pts[0][0]);
  let py = Math.round(pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const x = Math.round(pts[i][0]);
    const y = Math.round(pts[i][1]);
    out.push(x - px, y - py);
    px = x;
    py = y;
  }
  return out;
}

function circle(cx, cy, r, n, a0, a1) {
  const pts = [];
  const s = a0 == null ? 0 : a0;
  const e = a1 == null ? Math.PI * 2 : a1;
  for (let i = 0; i <= n; i++) {
    const a = s + ((e - s) * i) / n;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

function line(x0, y0, x1, y1, n) {
  const pts = [];
  const k = n || 8;
  for (let i = 0; i <= k; i++) pts.push([x0 + ((x1 - x0) * i) / k, y0 + ((y1 - y0) * i) / k]);
  return pts;
}

/** Sun with rays and a smile. */
function sun() {
  const s = [enc(7, 2, circle(512, 480, 190, 40)), enc(0, 1, circle(512, 480, 190, 40))];
  for (let k = 0; k < 10; k++) {
    const a = (k * Math.PI * 2) / 10;
    s.push(enc(2, 1, line(512 + Math.cos(a) * 250, 480 + Math.sin(a) * 250, 512 + Math.cos(a) * 360, 480 + Math.sin(a) * 360, 4)));
  }
  s.push(enc(0, 0, circle(440, 440, 6, 6)), enc(0, 0, circle(584, 440, 6, 6)));
  s.push(enc(1, 1, circle(512, 500, 100, 20, 0.25, Math.PI - 0.25)));
  return { v: 1, s };
}

/** House with a tree. */
function house() {
  const s = [];
  s.push(enc(9, 2, [[220, 520], [220, 820], [620, 820], [620, 520], [220, 520]]));
  s.push(enc(1, 2, [[190, 530], [420, 330], [650, 530], [190, 530]]));
  s.push(enc(4, 1, [[380, 820], [380, 660], [470, 660], [470, 820]]));
  s.push(enc(3, 2, circle(800, 440, 110, 24)));
  s.push(enc(9, 2, line(800, 550, 800, 820, 6)));
  s.push(enc(2, 1, circle(150, 170, 60, 20)));
  return { v: 1, s };
}

/** Scribbly pizza-eating alien. */
function alien() {
  const s = [];
  s.push(enc(3, 2, circle(512, 400, 230, 40)));
  s.push(enc(0, 1, circle(430, 380, 40, 14)));
  s.push(enc(0, 1, circle(600, 380, 40, 14)));
  s.push(enc(0, 1, line(380, 250, 330, 140, 4)));
  s.push(enc(0, 1, line(640, 250, 700, 140, 4)));
  s.push(enc(2, 2, [[300, 700], [720, 700], [512, 960], [300, 700]]));
  s.push(enc(1, 1, circle(460, 760, 30, 10)));
  s.push(enc(1, 1, circle(570, 790, 30, 10)));
  return { v: 1, s };
}

/** A long squiggle with many points, for stress and replay-speed tests. */
function scribble(strokes, pointsPer) {
  const s = [];
  for (let i = 0; i < strokes; i++) {
    const pts = [];
    for (let k = 0; k < pointsPer; k++) {
      const t = k / pointsPer;
      const x = 512 + Math.cos(t * 12 + i) * (80 + i * 18) + Math.sin(t * 40) * 20;
      const y = 512 + Math.sin(t * 12 + i) * (80 + i * 18);
      pts.push([Math.max(0, Math.min(1023, x)), Math.max(0, Math.min(1023, y))]);
    }
    s.push(enc(i % 12, i % 3, pts));
  }
  return { v: 1, s };
}

module.exports = { enc, circle, line, sun, house, alien, scribble, EMPTY: { v: 1, s: [] } };
