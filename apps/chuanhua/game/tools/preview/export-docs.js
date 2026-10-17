/**
 * Copies the contact sheets of a few size/mode combinations from out/ into docs/chuanhua/preview/ as small JPEGs for
 * the CTO and the founder (the full out/ folder is gitignored).
 *
 *   SIZES=375x667 MODES=default CONTACT_ONLY=1 node render.js   (and the other combinations)
 *   node export-docs.js
 */

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const OUT = path.join(__dirname, 'out');
const DEST = path.join(__dirname, '..', '..', '..', '..', '..', 'docs', 'chuanhua', 'preview');
// [size, mode, screens (null = all)]
const KEY = ['draw', 'describe', 'pick', 'home', 'lobby', 'overview', 'stepthrough', 'roundWait'];
const COMBOS = [
  ['375x812', 'default', null],
  ['320x568', 'large', null],
  ['375x667', 'default', null],
  ['414x896', 'hc', null],
  ['430x932', 'default', KEY],
  ['768x1024', 'default', KEY],
];

async function main() {
  let n = 0;
  fs.mkdirSync(DEST, { recursive: true });
  for (const [size, mode, only] of COMBOS) {
    const dir = path.join(OUT, size, mode);
    if (!fs.existsSync(dir)) continue;
    const to = path.join(DEST, size + '-' + mode);
    fs.mkdirSync(to, { recursive: true });
    for (const f of fs.readdirSync(dir).filter((x) => x.startsWith('_contact_') && (!only || only.some((o) => x.startsWith('_contact_' + o + '_'))))) {
      const img = await loadImage(path.join(dir, f));
      // the sheets are rendered at 2x; the docs copy is 1x (one canvas pixel per layout point)
      const c = createCanvas(Math.round(img.width / 2), Math.round(img.height / 2));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      fs.writeFileSync(path.join(to, f.replace('_contact_', '').replace('.png', '.jpg')), c.toBuffer('image/jpeg', 70));
      n++;
    }
  }
  const sc = path.join(OUT, 'shareCard');
  if (fs.existsSync(sc)) {
    fs.mkdirSync(path.join(DEST, 'shareCard'), { recursive: true });
    for (const f of fs.readdirSync(sc)) {
      const img = await loadImage(path.join(sc, f));
      const c = createCanvas(img.width, img.height);
      c.getContext('2d').drawImage(img, 0, 0);
      fs.writeFileSync(path.join(DEST, 'shareCard', f.replace('.png', '.jpg')), c.toBuffer('image/jpeg', 85));
      n++;
    }
  }
  console.log('exported ' + n + ' images to ' + DEST);
}

main();
