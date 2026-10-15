/**
 * Renders every screen x state x display mode from fixture view models to
 * PNG, at several window sizes, without WeChat.
 *
 *   cd apps/bibiyi/game/tools/preview && npm install && node render.js
 *
 * Options (env): DPR (default 2), HITS=1 (outline tap areas), ONLY=home,play
 *   (groups), SIZES=375x667,320x568 (comma list), MODES=standard,largeText,highContrast.
 * Output: out/<mode>/<WxH>/<group>__<state>.png and out/<mode>/<WxH>/_contact_<group>.png;
 *   share cards in out/<mode>/shareCard/ (identical in every mode, rendered once).
 * Fonts: registers Noto Serif/Sans SC from the system fonts folder (FONT_DIR)
 * as a stand-in for the device fonts; falls back to whatever the OS has.
 */

const fs = require('fs');
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const root = path.join(__dirname, '..', '..', 'js', 'render');
const R = require(path.join(root, 'index.js'));
const { buildFixtures } = require('./fixtures.js');

const FONT_DIR = process.env.FONT_DIR || 'C:/Windows/Fonts';
[
  ['NotoSerifSC-VF.ttf', 'Noto Serif CJK SC'],
  ['NotoSansSC-VF.ttf', 'Noto Sans CJK SC'],
].forEach((pair) => {
  const p = path.join(FONT_DIR, pair[0]);
  if (fs.existsSync(p)) GlobalFonts.registerFromPath(p, pair[1]);
});

const SIZES = [
  { w: 375, h: 667, sb: 20, menu: { top: 26, bottom: 58, left: 281, right: 368 }, bottomInset: 0 },
  { w: 320, h: 568, sb: 20, menu: { top: 26, bottom: 58, left: 226, right: 313 }, bottomInset: 0 },
  { w: 430, h: 932, sb: 54, menu: { top: 60, bottom: 92, left: 336, right: 423 }, bottomInset: 34 },
  { w: 375, h: 812, sb: 47, menu: { top: 53, bottom: 85, left: 281, right: 368 }, bottomInset: 34 },
  { w: 768, h: 1024, sb: 24, menu: { top: 30, bottom: 62, left: 674, right: 761 }, bottomInset: 20 },
];
const MODES = {
  standard: { largeText: false, highContrast: false },
  largeText: { largeText: true, highContrast: false },
  highContrast: { largeText: false, highContrast: true },
};

function sysFor(sz, display) {
  return {
    windowWidth: sz.w,
    windowHeight: sz.h,
    pixelRatio: 2,
    statusBarHeight: sz.sb,
    safeArea: { top: sz.sb, bottom: sz.h - sz.bottomInset },
    menuRect: Object.assign({}, sz.menu, { width: sz.menu.right - sz.menu.left, height: sz.menu.bottom - sz.menu.top }),
    display,
  };
}

const DPR = Number(process.env.DPR || 2);
const SHOW_HITS = process.env.HITS === '1';
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const sizesOnly = process.env.SIZES ? process.env.SIZES.split(',') : null;
const modesOnly = process.env.MODES ? process.env.MODES.split(',') : ['standard'];

function resolve(mod) {
  if (mod.indexOf('sheet:') === 0) return R.sheets[mod.slice(6)];
  return R.screens[mod];
}

function drawEntry(ctx, st, L) {
  let hits = [];
  if (st.under) hits = hits.concat(resolve(st.under.mod).draw(ctx, st.under.vm, L));
  hits = hits.concat(resolve(st.mod).draw(ctx, st.vm, L));
  if (st.overlay) hits = hits.concat(R.overlay.draw(ctx, st.overlay, L));
  return hits;
}

function renderState(st, L) {
  const c = createCanvas(Math.round(L.W * DPR), Math.round(L.H * DPR));
  const ctx = c.getContext('2d');
  ctx.scale(DPR, DPR);
  const hits = drawEntry(ctx, st, L);
  ctx.strokeStyle = 'rgba(0,120,255,0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(L.capsule.x, L.capsule.y, L.capsule.w, L.capsule.h);
  if (SHOW_HITS) {
    hits.forEach((h) => {
      if (h.w >= L.W - 1 && h.h >= L.H - 1) return;
      ctx.strokeStyle = 'rgba(0,160,60,0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(h.x, h.y, h.w, h.h);
    });
  }
  return { canvas: c, hits };
}

function contactSheet(rendered, group, L, key, dir) {
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
    sc.fillText(group + ' / ' + r.name, cx + 2, cy + 15);
  });
  fs.writeFileSync(path.join(dir, '_contact_' + group + '.png'), sheet.toBuffer('image/png'));
}

function main() {
  const out = path.join(__dirname, 'out');
  let count = 0;
  let shareDone = false;
  for (const modeName of modesOnly) {
    const display = MODES[modeName];
    if (!display) continue;
    for (const sz of SIZES) {
      const key = sz.w + 'x' + sz.h;
      if (sizesOnly && !sizesOnly.includes(key)) continue;
      const dir = path.join(out, modeName, key);
      fs.mkdirSync(dir, { recursive: true });
      const L = R.makeLayout(sysFor(sz, display));
      const fx = buildFixtures({ createCanvas, L });
      for (const group of Object.keys(fx)) {
        if (only && !only.includes(group)) continue;
        if (group === 'shareCard') {
          if (shareDone) continue;
          const sdir = path.join(out, 'shareCard');
          fs.mkdirSync(sdir, { recursive: true });
          for (const name of Object.keys(fx[group])) {
            const e = fx[group][name];
            const c = createCanvas(500 * DPR, 400 * DPR);
            R.shareCard.render(c, e.vm, Object.assign({ pixelScale: DPR }, e.opts || {}));
            fs.writeFileSync(path.join(sdir, name + '.png'), c.toBuffer('image/png'));
            count++;
          }
          continue;
        }
        const rendered = [];
        for (const name of Object.keys(fx[group])) {
          const r = renderState(fx[group][name], L);
          fs.writeFileSync(path.join(dir, group + '__' + name + '.png'), r.canvas.toBuffer('image/png'));
          rendered.push({ name, canvas: r.canvas });
          count++;
        }
        contactSheet(rendered, group, L, key, dir);
      }
      if (fx.shareCard) shareDone = true;
    }
  }
  console.log('rendered ' + count + ' PNGs into ' + out);
}

main();
