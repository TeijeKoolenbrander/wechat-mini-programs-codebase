/**
 * Writes the static fallback image for the ROOM share cards (spec 9.1, 9.4: "if card rendering fails: the static fallback
 * image + the text title"): our art (the room invite card: a taped note, ten seat stickers, "一起传画 / 一局约 3 分钟 /
 * 3–10 人"). No prompt, no user drawing (PO-24). 500 x 400 at 1x.
 *
 *   cd apps/chuanhua/game/tools/preview && npm install && node export-assets.js
 *
 * Output: ../../assets/share-fallback-room.png (shipped; logic uses it when js/render/shareCard.js cannot render).
 * Fonts: registers Noto Sans SC from FONT_DIR (default the Windows fonts folder) so the baked text is legible.
 */

const fs = require('fs');
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const R = require('../../js/render');

const FONT_DIR = process.env.FONT_DIR || 'C:/Windows/Fonts';
const font = path.join(FONT_DIR, 'NotoSansSC-VF.ttf');
if (fs.existsSync(font)) GlobalFonts.registerFromPath(font, 'Noto Sans CJK SC');

const out = path.join(__dirname, '..', '..', 'assets', 'share-fallback-room.png');
const c = createCanvas(500, 400);
R.shareCard.render(c, { kind: 'roomInvite' }, { pixelScale: 1 });
fs.writeFileSync(out, c.toBuffer('image/png'));
console.log('wrote ' + out + ' (' + fs.statSync(out).size + ' bytes)');
