/**
 * Renders every screen x state (render/samples.js plus stress extras) to PNG at several window sizes and in the four
 * display modes, without WeChat.
 *
 *   cd apps/chuanhua/game/tools/preview && npm install && node render.js
 *
 * Options (env): DPR (default 2), HITS=1 (outline tap areas in green, capsule in blue), ONLY=home,draw (screens),
 * SIZES=375x667 (comma list), MODES=default,large,hc,large_hc, CONTACT_ONLY=1 (only write the contact sheets).
 * Output (gitignored): out/<WxH>/<mode>/<screen>__<state>.png and out/<WxH>/<mode>/_contact_<screen>_<page>.png,
 *   out/shareCard/*.png, out/strokes/ac27.png.
 * Fonts: registers Noto Sans SC from the system fonts folder (FONT_DIR) as a stand-in for the device font.
 */

const fs = require('fs');
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const root = path.join(__dirname, '..', '..', 'js', 'render');
const R = require(path.join(root, 'index.js'));
const Strokes = require(path.join(root, 'strokes.js'));
const { build, prepare } = require('./fixtures.js');

const FONT_DIR = process.env.FONT_DIR || 'C:/Windows/Fonts';
[['NotoSansSC-VF.ttf', 'Noto Sans CJK SC']].forEach(([f, fam]) => {
  const p = path.join(FONT_DIR, f);
  if (fs.existsSync(p)) GlobalFonts.registerFromPath(p, fam);
});

const SIZES = [
  { w: 375, h: 667, sb: 20, menu: { top: 26, bottom: 58, left: 281, right: 368 }, bottomInset: 0 },
  { w: 320, h: 568, sb: 20, menu: { top: 26, bottom: 58, left: 226, right: 313 }, bottomInset: 0 },
  { w: 375, h: 812, sb: 44, menu: { top: 48, bottom: 80, left: 281, right: 368 }, bottomInset: 34 },
  { w: 414, h: 896, sb: 44, menu: { top: 50, bottom: 82, left: 320, right: 407 }, bottomInset: 34 },
  { w: 430, h: 932, sb: 54, menu: { top: 60, bottom: 92, left: 336, right: 423 }, bottomInset: 34 },
  { w: 768, h: 1024, sb: 24, menu: { top: 30, bottom: 62, left: 674, right: 761 }, bottomInset: 20 },
];
const MODES = {
  default: { largeText: false, highContrast: false },
  large: { largeText: true, highContrast: false },
  hc: { largeText: false, highContrast: true },
  large_hc: { largeText: true, highContrast: true },
};

function sysFor(sz, dpr) {
  return {
    windowWidth: sz.w, windowHeight: sz.h, pixelRatio: dpr, statusBarHeight: sz.sb,
    safeArea: { top: sz.sb, bottom: sz.h - sz.bottomInset },
    menuRect: { ...sz.menu, width: sz.menu.right - sz.menu.left, height: sz.menu.bottom - sz.menu.top },
  };
}

const DPR = Number(process.env.DPR || 2);
const SHOW_HITS = process.env.HITS === '1';
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const sizesOnly = process.env.SIZES ? process.env.SIZES.split(',') : null;
const modesOnly = process.env.MODES ? process.env.MODES.split(',') : Object.keys(MODES);

Strokes.setCanvasFactory((w, h) => createCanvas(w, h));

function withDisplay(vm, display) {
  return Object.assign({}, vm, { display });
}

function renderFixture(f, L, display) {
  const c = createCanvas(Math.round(L.W * DPR), Math.round(L.H * DPR));
  const ctx = c.getContext('2d');
  ctx.scale(DPR, DPR);
  let hits = [];
  if (f.under) {
    const { sample } = require(path.join(root, 'samples.js'));
    const uvm = prepare(f.under.screen, withDisplay(f.under.vm || sample(f.under.screen, f.under.state), display), L, ctx, display);
    R.screens[f.under.screen].draw(ctx, uvm, L);
  }
  const vm = prepare(f.screen, f.vm.display === undefined || f.screen !== 'overlay' ? withDisplay(f.vm, display) : f.vm, L, ctx, display);
  if (f.screen === 'overlay') vm.display = display;
  hits = R.screens[f.screen].draw(ctx, vm, L) || [];
  ctx.strokeStyle = 'rgba(0,120,255,0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(L.capsule.x, L.capsule.y, L.capsule.w, L.capsule.h);
  if (SHOW_HITS) {
    hits.forEach((h) => {
      if (h.w >= L.W - 1 && h.h >= L.H - 1) return;
      ctx.strokeStyle = 'rgba(0,160,60,0.9)';
      ctx.strokeRect(h.x, h.y, h.w, h.h);
    });
  }
  return { canvas: c, hits };
}

function contactSheets(dir, screen, rendered, L) {
  const perPage = L.W >= 600 ? 3 : L.W >= 400 ? 4 : 5;
  const pages = Math.ceil(rendered.length / perPage);
  for (let p = 0; p < pages; p++) {
    const part = rendered.slice(p * perPage, (p + 1) * perPage);
    const sheet = createCanvas(part.length * L.W + (part.length + 1) * 8, L.H + 46);
    const sc = sheet.getContext('2d');
    sc.fillStyle = '#444';
    sc.fillRect(0, 0, sheet.width, sheet.height);
    part.forEach((r, i) => {
      const cx = 8 + i * (L.W + 8);
      sc.drawImage(r.canvas, cx, 30, L.W, L.H);
      sc.fillStyle = '#fff';
      sc.font = '14px sans-serif';
      sc.fillText(screen + ' / ' + r.name, cx + 2, 20);
    });
    fs.writeFileSync(path.join(dir, '_contact_' + screen + '_' + (p + 1) + '.png'), sheet.toBuffer('image/png'));
  }
}

function main() {
  const out = path.join(__dirname, 'out');
  const all = build();
  let count = 0;
  for (const modeName of modesOnly) {
    const display = MODES[modeName];
    if (!display) continue;
    for (const sz of SIZES) {
      const key = sz.w + 'x' + sz.h;
      if (sizesOnly && !sizesOnly.includes(key)) continue;
      const dir = path.join(out, key, modeName);
      fs.mkdirSync(dir, { recursive: true });
      const L = R.makeLayout(sysFor(sz, DPR));
      const byScreen = {};
      for (const f of all) {
        if (only && !only.includes(f.screen)) continue;
        (byScreen[f.screen] = byScreen[f.screen] || []).push(f);
      }
      for (const screen of Object.keys(byScreen)) {
        const rendered = [];
        for (const f of byScreen[screen]) {
          const r = renderFixture(f, L, display);
          if (!process.env.CONTACT_ONLY) fs.writeFileSync(path.join(dir, screen + '__' + f.state + '.png'), r.canvas.toBuffer('image/png'));
          rendered.push({ name: f.state, canvas: r.canvas });
          count++;
        }
        contactSheets(dir, screen, rendered, L);
      }
    }
  }
  // share cards (size- and mode-independent)
  if (!only || only.includes('shareCard')) {
    const sdir = path.join(out, 'shareCard');
    fs.mkdirSync(sdir, { recursive: true });
    const { sample } = require(path.join(root, 'samples.js'));
    for (const name of ['invite', 'reveal']) {
      const c = createCanvas(500 * DPR, 400 * DPR);
      R.shareCard.render(c, sample('shareCard', name), { pixelScale: DPR });
      fs.writeFileSync(path.join(sdir, name + '.png'), c.toBuffer('image/png'));
      count++;
    }
  }
  console.log('rendered ' + count + ' PNGs into ' + out);
}

main();
