/**
 * Renders every screen x state x display mode from fixture view models to
 * PNG, at several window sizes, without WeChat.
 *
 *   cd apps/kedupan/game/tools/preview && npm install && node render.js
 *
 * Options (env): DPR (default 2), HITS=1 (outline tap areas), ONLY=home,play
 *   (screens), SIZES=375x667 (comma list), MODES=standard,large,hc,
 *   FULL=1 (also write one PNG per state; default is contact sheets only).
 * Output: out/<WxH>/_contact_<screen>__<mode>.png (+ out/<WxH>/<screen>__<state>__<mode>.png),
 *   out/shareCard/<name>.png
 * Fonts: registers Noto Sans SC from the system fonts folder (FONT_DIR) as a
 * stand-in for the device font; falls back to whatever the OS has.
 */

const fs = require('fs');
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const root = path.join(__dirname, '..', '..', 'js', 'render');
const { makeLayout } = require(path.join(root, 'layout.js'));
const overlay = require(path.join(root, 'overlay.js'));
const { buildFixtures, MODES, SIZES } = require('./fixtures.js');

const FONT_DIR = process.env.FONT_DIR || 'C:/Windows/Fonts';
[['NotoSansSC-VF.ttf', 'Noto Sans CJK SC']].forEach(([f, fam]) => {
  const p = path.join(FONT_DIR, f);
  if (fs.existsSync(p)) GlobalFonts.registerFromPath(p, fam);
});

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
const FULL = process.env.FULL === '1';
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const sizesOnly = process.env.SIZES ? process.env.SIZES.split(',') : null;
const modesOnly = process.env.MODES ? process.env.MODES.split(',') : null;

function renderState(screen, st, L) {
  const c = createCanvas(Math.round(L.W * DPR), Math.round(L.H * DPR));
  const ctx = c.getContext('2d');
  ctx.scale(DPR, DPR);
  const mod = require(path.join(root, screen + '.js'));
  let hits = mod.draw(ctx, st.vm, L) || [];
  if (st.overlay) hits = hits.concat(overlay.draw(ctx, st.overlay, L));
  ctx.strokeStyle = 'rgba(0,120,255,0.6)'; // capsule outline so overlaps are visible
  ctx.lineWidth = 1;
  ctx.strokeRect(L.capsule.x, L.capsule.y, L.capsule.w, L.capsule.h);
  if (SHOW_HITS) {
    hits.forEach((h) => {
      if (h.w >= L.W - 1 && h.h >= L.H - 1) return;
      ctx.strokeStyle = 'rgba(0,160,60,0.85)';
      ctx.strokeRect(h.x, h.y, h.w, h.h);
    });
  }
  return c;
}

function contact(items, L, cols, label) {
  const rows = Math.ceil(items.length / cols);
  const tw = L.W;
  const th = L.H + 22;
  const sheet = createCanvas(cols * tw + (cols + 1) * 8, rows * th + (rows + 1) * 8);
  const sc = sheet.getContext('2d');
  sc.fillStyle = '#444';
  sc.fillRect(0, 0, sheet.width, sheet.height);
  items.forEach((r, i) => {
    const cx = 8 + (i % cols) * (tw + 8);
    const cy = 8 + Math.floor(i / cols) * (th + 8);
    sc.drawImage(r.canvas, cx, cy + 22, tw, L.H);
    sc.fillStyle = '#fff';
    sc.font = '14px sans-serif';
    sc.fillText(label + ' / ' + r.name, cx + 2, cy + 15);
  });
  return sheet;
}

function main() {
  const out = path.join(__dirname, 'out');
  let count = 0;
  for (const sz of SIZES) {
    const key = sz.w + 'x' + sz.h;
    if (sizesOnly ? !sizesOnly.includes(key) : SIZES.indexOf(sz) > 2) continue; // default: 375x667, 320x568, 430x932
    const dir = path.join(out, key);
    fs.mkdirSync(dir, { recursive: true });
    const L = makeLayout(sysFor(sz));
    for (const mode of Object.keys(MODES)) {
      if (modesOnly && !modesOnly.includes(mode)) continue;
      const fx = buildFixtures({ createCanvas, L, display: MODES[mode] });
      for (const screen of Object.keys(fx)) {
        if (only && !only.includes(screen)) continue;
        if (screen === 'shareCard') {
          if (sz !== SIZES[0] || mode !== 'standard') continue; // share cards: one standard look
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
        const rendered = [];
        for (const name of Object.keys(fx[screen])) {
          const c = renderState(screen, fx[screen][name], L);
          if (FULL) fs.writeFileSync(path.join(dir, screen + '__' + name + '__' + mode + '.png'), c.toBuffer('image/png'));
          rendered.push({ name, canvas: c });
          count++;
        }
        const cols = Math.min(rendered.length, sz.w >= 430 ? 4 : 5);
        const sheet = contact(rendered, L, cols, screen + ' ' + mode);
        fs.writeFileSync(path.join(dir, '_contact_' + screen + '__' + mode + '.png'), sheet.toBuffer('image/png'));
      }
    }
  }
  console.log('rendered ' + count + ' states into ' + out);
}

main();
