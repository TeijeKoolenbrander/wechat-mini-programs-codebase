/**
 * Renders every screen x state from fixture view models to PNG, at several
 * window sizes and in the four display modes, without WeChat.
 *
 *   cd apps/dianjiangtai/game/tools/preview && npm install && node render.js
 *
 * Options (env): DPR (default 2), HITS=1 (outline tap areas), ONLY=home,draft
 *   (screens), SIZES=375x667 (comma list), MODES=default,large,hc,large_hc.
 * Output: out/<WxH>/<mode>/<screen>__<state>.png and
 *   out/<WxH>/<mode>/_contact_<screen>_<page>.png (4-5 states per page),
 *   out/seals/<mode>.png (seal gallery: factions x tiers x name lengths).
 * Fonts: registers Noto Serif SC from the system fonts folder (FONT_DIR) as
 * a stand-in for the device serif; falls back to whatever the OS has.
 */

const fs = require('fs');
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const root = path.join(__dirname, '..', '..', 'js', 'render');
const { makeLayout } = require(path.join(root, 'layout.js'));
const overlay = require(path.join(root, 'overlay.js'));
const T = require(path.join(root, 'theme.js'));
const SealMod = require(path.join(root, 'seal.js'));
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

const MODES = {
  default: { largeText: false, highContrast: false },
  large: { largeText: true, highContrast: false },
  hc: { largeText: false, highContrast: true },
  large_hc: { largeText: true, highContrast: true },
};

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
const modesOnly = process.env.MODES ? process.env.MODES.split(',') : Object.keys(MODES);

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

function contactSheets(dir, screen, rendered, L) {
  const perPage = L.W >= 400 ? 4 : 5;
  const pages = Math.ceil(rendered.length / perPage);
  for (let p = 0; p < pages; p++) {
    const part = rendered.slice(p * perPage, (p + 1) * perPage);
    const tw = L.W;
    const th = L.H + 22;
    const sheet = createCanvas(part.length * tw + (part.length + 1) * 8, th + 16);
    const sc = sheet.getContext('2d');
    sc.fillStyle = '#444';
    sc.fillRect(0, 0, sheet.width, sheet.height);
    part.forEach((r, i) => {
      const cx = 8 + i * (tw + 8);
      sc.drawImage(r.canvas, cx, 30, tw, L.H);
      sc.fillStyle = '#fff';
      sc.font = '14px sans-serif';
      sc.fillText(screen + ' / ' + r.name, cx + 2, 20);
    });
    fs.writeFileSync(path.join(dir, '_contact_' + screen + '_' + (p + 1) + '.png'), sheet.toBuffer('image/png'));
  }
}

/** Seal gallery: factions x tiers x name lengths, at 48 / 72 / 24 pt. */
function sealGallery(out, modeName, display) {
  T.applyDisplay(display);
  const names = ['云', '关羽', '诸葛亮', '公孙述龙', '司马懿', '夏侯渊'];
  const factions = ['wei', 'shu', 'wu', 'qun', 'jin'];
  const tiers = ['jia', 'yi', 'bing', 'plain'];
  const cell = 84;
  const W = 40 + factions.length * 4 * cell + 20;
  const H = 40 + names.length * (cell + 6) + 150;
  const c = createCanvas(W * DPR, H * DPR);
  const ctx = c.getContext('2d');
  ctx.scale(DPR, DPR);
  ctx.fillStyle = T.COLORS.paper;
  ctx.fillRect(0, 0, W, H);
  names.forEach((nm, r) => {
    factions.forEach((f, fi) => {
      tiers.forEach((t, ti) => {
        const x = 20 + (fi * 4 + ti) * cell;
        const y = 20 + r * (cell + 6);
        SealMod.draw(ctx, x + 8, y + 8, 68, { text: nm, name: nm, monogram: nm.slice(-1), factionKey: f, frame: t, tier: t === 'plain' ? null : t }, { full: true });
      });
    });
  });
  // small sizes and dimmed
  let y = 40 + names.length * (cell + 6);
  [48, 36, 24].forEach((s, si) => {
    factions.forEach((f, fi) => {
      SealMod.draw(ctx, 20 + fi * 130, y + si * 60, s, { text: '赵云', name: '赵云', monogram: '云', factionKey: f, frame: 'jia' });
      SealMod.draw(ctx, 20 + fi * 130 + 62, y + si * 60, s, { text: '诸葛亮', name: '诸葛亮', monogram: '亮', factionKey: f, frame: 'bing' }, { dim: true });
    });
  });
  fs.mkdirSync(path.join(out, 'seals'), { recursive: true });
  fs.writeFileSync(path.join(out, 'seals', modeName + '.png'), c.toBuffer('image/png'));
}

function main() {
  const out = path.join(__dirname, 'out');
  let count = 0;
  for (const modeName of modesOnly) {
    const display = MODES[modeName];
    if (!display) continue;
    if (!only || only.includes('seals')) sealGallery(out, modeName, display);
    for (const sz of SIZES) {
      const key = sz.w + 'x' + sz.h;
      if (sizesOnly && !sizesOnly.includes(key)) continue;
      const dir = path.join(out, key, modeName);
      fs.mkdirSync(dir, { recursive: true });
      const L = makeLayout(sysFor(sz));
      const fx = buildFixtures({ createCanvas, L, display });
      for (const screen of Object.keys(fx)) {
        if (only && !only.includes(screen)) continue;
        if (screen === 'shareCard') {
          if (sz !== SIZES[0] || modeName !== 'default') continue; // size- and mode-independent: render once
          const sdir = path.join(out, 'shareCard');
          fs.mkdirSync(sdir, { recursive: true });
          const sc = require(path.join(root, 'shareCard.js'));
          for (const name of Object.keys(fx[screen])) {
            const c = createCanvas(500 * DPR, 400 * DPR);
            sc.render(c, fx[screen][name].vm, { pixelScale: DPR });
            fs.writeFileSync(path.join(sdir, name + '.png'), c.toBuffer('image/png'));
            count++;
          }
          // the saved (album) variant, 2x
          const c2 = createCanvas(1000, 800);
          sc.render(c2, fx[screen].daily_shiren.vm, { pixelScale: 2, saved: true });
          fs.writeFileSync(path.join(sdir, 'saved_daily_shiren.png'), c2.toBuffer('image/png'));
          continue;
        }
        const rendered = [];
        for (const name of Object.keys(fx[screen])) {
          const st = fx[screen][name];
          const r = renderState(screen, name, st.vm !== undefined ? st : { vm: st }, L);
          fs.writeFileSync(path.join(dir, screen + '__' + name + '.png'), r.canvas.toBuffer('image/png'));
          rendered.push({ name, canvas: r.canvas });
          count++;
        }
        contactSheets(dir, screen, rendered, L);
      }
    }
  }
  console.log('rendered ' + count + ' PNGs into ' + out);
}

main();
