/**
 * Renders every screen x state from fixture view models to PNG, at several
 * window sizes, without WeChat.
 *
 *   cd apps/dianjiangtai/game/tools/preview && npm install && node render.js
 *
 * Options (env): DPR (default 2), HITS=1 (outline tap areas), ONLY=home,draft
 *   (screens), SIZES=375x667 (comma list).
 * Output: out/<WxH>/<screen>__<state>.png and out/<WxH>/_contact_<screen>.png
 * Fonts: registers Noto Serif SC from the system fonts folder (FONT_DIR) as
 * a stand-in for the device serif; falls back to whatever the OS has.
 */

const fs = require('fs');
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const root = path.join(__dirname, '..', '..', 'js', 'render');
const { makeLayout } = require(path.join(root, 'layout.js'));
const overlay = require(path.join(root, 'overlay.js'));
const { buildFixtures } = require('./fixtures.js');

const FONT_DIR = process.env.FONT_DIR || 'C:/Windows/Fonts';
[
  ['NotoSerifSC-VF.ttf', 'Noto Serif CJK SC'],
  ['NotoSansSC-VF.ttf', 'Noto Sans CJK SC'],
].forEach(([f, fam]) => {
  const p = path.join(FONT_DIR, f);
  if (fs.existsSync(p)) GlobalFonts.registerFromPath(p, fam);
});

const SIZES = [
  { w: 375, h: 667, sb: 20, menu: { top: 26, bottom: 58, left: 281, right: 368 }, bottomInset: 0 },
  { w: 320, h: 568, sb: 20, menu: { top: 26, bottom: 58, left: 226, right: 313 }, bottomInset: 0 },
  { w: 430, h: 932, sb: 54, menu: { top: 60, bottom: 92, left: 336, right: 423 }, bottomInset: 34 },
  { w: 375, h: 812, sb: 47, menu: { top: 53, bottom: 85, left: 281, right: 368 }, bottomInset: 34 },
  { w: 768, h: 1024, sb: 24, menu: { top: 30, bottom: 62, left: 674, right: 761 }, bottomInset: 20 },
];

function sysFor(sz) {
  return {
    windowWidth: sz.w,
    windowHeight: sz.h,
    pixelRatio: 2,
    statusBarHeight: sz.sb,
    safeArea: { top: sz.sb, bottom: sz.h - sz.bottomInset },
    menuRect: { ...sz.menu, width: sz.menu.right - sz.menu.left, height: sz.menu.bottom - sz.menu.top },
  };
}

const DPR = Number(process.env.DPR || 2);
const SHOW_HITS = process.env.HITS === '1';
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const sizesOnly = process.env.SIZES ? process.env.SIZES.split(',') : null;

function renderState(screen, name, st, L) {
  const c = createCanvas(Math.round(L.W * DPR), Math.round(L.H * DPR));
  const ctx = c.getContext('2d');
  ctx.scale(DPR, DPR);
  const vm = st.vm;
  const mod = require(path.join(root, screen + '.js'));
  let hits = mod.draw(ctx, vm, L) || [];
  if (st.overlay) hits = hits.concat(overlay.draw(ctx, st.overlay, L));
  // capsule outline so overlaps are visible
  ctx.strokeStyle = 'rgba(0,120,255,0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(L.capsule.x, L.capsule.y, L.capsule.w, L.capsule.h);
  if (SHOW_HITS) {
    ctx.lineWidth = 1;
    hits.forEach((h) => {
      if (h.w >= L.W - 1 && h.h >= L.H - 1) return;
      ctx.strokeStyle = 'rgba(0,160,60,0.8)';
      ctx.strokeRect(h.x, h.y, h.w, h.h);
    });
  }
  return { canvas: c, hits };
}

function main() {
  const out = path.join(__dirname, 'out');
  let count = 0;
  const summary = [];
  for (const sz of SIZES) {
    const key = sz.w + 'x' + sz.h;
    if (sizesOnly && !sizesOnly.includes(key)) continue;
    const dir = path.join(out, key);
    fs.mkdirSync(dir, { recursive: true });
    const L = makeLayout(sysFor(sz));
    const fx = buildFixtures({ createCanvas, L });
    for (const screen of Object.keys(fx)) {
      if (only && !only.includes(screen)) continue;
      if (screen === 'shareCard') {
        if (sz !== SIZES[0]) continue; // size-independent: render once
        const sdir = path.join(out, 'shareCard');
        fs.mkdirSync(sdir, { recursive: true });
        const sc = require(path.join(root, 'shareCard.js'));
        for (const name of Object.keys(fx[screen])) {
          const c = createCanvas(500 * DPR, 400 * DPR);
          sc.render(c, fx[screen][name].vm, { pixelScale: DPR });
          fs.writeFileSync(path.join(sdir, name + '.png'), c.toBuffer('image/png'));
          count++;
        }
        continue;
      }
      const names = Object.keys(fx[screen]);
      const rendered = [];
      for (const name of names) {
        const st = fx[screen][name];
        const r = renderState(screen, name, st.vm !== undefined ? st : { vm: st }, L);
        fs.writeFileSync(path.join(dir, screen + '__' + name + '.png'), r.canvas.toBuffer('image/png'));
        rendered.push({ name, canvas: r.canvas });
        count++;
        summary.push(key + ' ' + screen + ' ' + name);
      }
      // contact sheet
      const cols = Math.min(rendered.length, key === '430x932' || key === '768x1024' ? 4 : 5);
      const rows = Math.ceil(rendered.length / cols);
      const tw = L.W;
      const th = L.H + 22;
      const sheet = createCanvas(cols * tw + (cols + 1) * 8, rows * th + (rows + 1) * 8);
      const sc = sheet.getContext('2d');
      sc.fillStyle = '#444';
      sc.fillRect(0, 0, sheet.width, sheet.height);
      rendered.forEach((r, i) => {
        const cx = 8 + (i % cols) * (tw + 8);
        const cy = 8 + Math.floor(i / cols) * (th + 8);
        sc.drawImage(r.canvas, cx, cy + 22, tw, L.H);
        sc.fillStyle = '#fff';
        sc.font = '14px sans-serif';
        sc.fillText(screen + ' / ' + r.name, cx + 2, cy + 15);
      });
      fs.writeFileSync(path.join(dir, '_contact_' + screen + '.png'), sheet.toBuffer('image/png'));
    }
  }
  console.log('rendered ' + count + ' PNGs into ' + out);
}

main();
