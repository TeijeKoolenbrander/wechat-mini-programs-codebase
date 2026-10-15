/**
 * Writes assets/share-fallback.png: the static, content-free share image (render/shareCard.js, kind 'fallback').
 * It is the imageUrl whenever the card canvas cannot be exported. It must exist: when a share has no usable image,
 * WeChat falls back to a screenshot of the game canvas, which could show a player's drawing (PO-24, AC 95).
 *
 *   cd tools/preview && npm install && cd .. && node make-share-fallback.js
 */
const fs = require('fs');
const path = require('path');
const { createCanvas, GlobalFonts } = require(path.join(__dirname, 'preview', 'node_modules', '@napi-rs', 'canvas'));
const shareCard = require('../js/render/shareCard');

const FONT_DIR = process.env.FONT_DIR || 'C:/Windows/Fonts';
['NotoSansSC-VF.ttf', 'NotoSerifSC-VF.ttf'].forEach((f) => {
  const p = path.join(FONT_DIR, f);
  if (fs.existsSync(p)) GlobalFonts.registerFromPath(p, f.indexOf('Serif') >= 0 ? 'Noto Serif CJK SC' : 'Noto Sans CJK SC');
});

const c = createCanvas(shareCard.WIDTH, shareCard.HEIGHT);
shareCard.render(c, { kind: 'fallback' }, { pixelScale: 1 });
const out = path.join(__dirname, '..', 'assets', 'share-fallback.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, c.toBuffer('image/png'));
console.log('wrote', out, fs.statSync(out).size, 'bytes');
