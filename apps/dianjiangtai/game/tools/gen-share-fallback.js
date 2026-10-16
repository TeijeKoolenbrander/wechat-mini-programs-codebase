#!/usr/bin/env node
'use strict';
/**
 * Writes assets/share-fallback.png (js/share.js FALLBACK_IMAGE): the generic share image used by the capsule menu and the
 * group invite when no result card exists. 500x400 (5:4), original, drawn here with signed-distance shapes (no fonts, no
 * third-party art): rice-paper ground, ink border, two lacquered command tokens and a cinnabar seal above five general
 * seats. It shows nothing about any daily seed or result.
 *
 *   node tools/gen-share-fallback.js          write the file
 *   node tools/gen-share-fallback.js --check  exit 1 if the committed file differs
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const W = 500;
const H = 400;
const OUT = path.join(__dirname, '..', 'assets', 'share-fallback.png');

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const PAPER_TOP = hex('#F1E6CC');
const PAPER_BOTTOM = hex('#E3D2AB');
const INK = hex('#2A211A');
const SEAL = hex('#B3261E');
const GOLD = hex('#C9973A');
const LACQUER = hex('#2F2822');
const PAPER = hex('#F3EAD7');

const px = new Float64Array(W * H * 3);
for (let y = 0; y < H; y++) {
  const t = y / (H - 1);
  for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) px[(y * W + x) * 3 + c] = PAPER_TOP[c] + (PAPER_BOTTOM[c] - PAPER_TOP[c]) * t;
}

/** paint colour where sdf(x, y) < 0 with a 1px antialiased edge. sdf is in pixels. */
function paint(x0, y0, x1, y1, sdf, color, alpha) {
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.ceil(x1)); x++) {
      const d = sdf(x + 0.5, y + 0.5);
      const a = Math.max(0, Math.min(1, 0.5 - d)) * (alpha == null ? 1 : alpha);
      if (a <= 0) continue;
      for (let c = 0; c < 3; c++) {
        const i = (y * W + x) * 3 + c;
        px[i] = px[i] * (1 - a) + color[c] * a;
      }
    }
  }
}
const rrSdf = (cx, cy, hw, hh, r) => (x, y) => {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const ringOf = (sdf, w) => (x, y) => Math.abs(sdf(x, y) + w / 2) - w / 2;

function rr(cx, cy, hw, hh, r, color, alpha) {
  paint(cx - hw - 2, cy - hh - 2, cx + hw + 2, cy + hh + 2, rrSdf(cx, cy, hw, hh, r), color, alpha);
}
function rrStroke(cx, cy, hw, hh, r, w, color, alpha) {
  paint(cx - hw - 2, cy - hh - 2, cx + hw + 2, cy + hh + 2, ringOf(rrSdf(cx, cy, hw, hh, r), w), color, alpha);
}
function circle(cx, cy, r, color, alpha) {
  paint(cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2, (x, y) => Math.hypot(x - cx, y - cy) - r, color, alpha);
}
function circleStroke(cx, cy, r, w, color, alpha) {
  paint(cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2, ringOf((x, y) => Math.hypot(x - cx, y - cy) - r, w), color, alpha);
}

// border: ink frame with a gold hairline inside
rrStroke(W / 2, H / 2, W / 2 - 14, H / 2 - 14, 10, 4, INK);
rrStroke(W / 2, H / 2, W / 2 - 24, H / 2 - 24, 6, 1.5, GOLD);

// two lacquered command tokens, slightly tilted by drawing offset rounded rectangles (flat, no rotation needed)
for (const [cx, face] of [[170, 0], [330, 1]]) {
  rr(cx + 3, 143, 56, 70, 12, INK, 0.25); // shadow
  rr(cx, 140, 56, 70, 12, LACQUER);
  rrStroke(cx, 140, 50, 64, 8, 1.5, GOLD, 0.8);
  if (face === 0) {
    // 令 stand-in: a cinnabar disc with a gold ring
    circle(cx, 140, 26, SEAL);
    circleStroke(cx, 140, 33, 2, GOLD);
  } else {
    // a gold square seal on the second token
    rr(cx, 140, 26, 26, 4, GOLD);
    rrStroke(cx, 140, 20, 20, 2, 2, LACQUER);
  }
}

// cinnabar seal in the middle, overlapping both tokens
rr(250, 150, 34, 34, 6, SEAL);
rrStroke(250, 150, 27, 27, 3, 2, PAPER, 0.9);
for (const [dx, dy] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) rr(250 + dx, 150 + dy, 7, 7, 1.5, PAPER, 0.9); // four-pane seal mark

// five general seats
for (let i = 0; i < 5; i++) {
  const cx = 90 + i * 80;
  circle(cx, 300, 30, PAPER);
  circleStroke(cx, 300, 30, 3, INK);
  circle(cx, 292, 9, INK, 0.75);
  paint(cx - 20, 300, cx + 20, 330, (x, y) => Math.max(Math.hypot(x - cx, y - 318) - 17, y - 329), INK, 0.75);
  circle(cx, 300, 36, GOLD, 0.0);
}
paint(60, 342, 440, 346, rrSdf(250, 344, 190, 1.5, 1.5), INK, 0.5);

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function generate() {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    for (let x = 0; x < W * 3; x++) raw[y * (W * 3 + 1) + 1 + x] = Math.max(0, Math.min(255, Math.round(px[y * W * 3 + x])));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

if (require.main === module) {
  const png = generate();
  if (process.argv.includes('--check')) process.exit(fs.existsSync(OUT) && fs.readFileSync(OUT).equals(png) ? 0 : 1);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, png);
  console.log('share-fallback.png ' + png.length + ' bytes');
}

module.exports = { generate, W, H };
