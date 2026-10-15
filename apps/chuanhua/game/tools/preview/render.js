/**
 * Renders every screen x state x display mode from fixture view models to PNG,
 * at several window sizes, without WeChat.
 *
 *   cd apps/chuanhua/game/tools/preview && npm install && node render.js
 *
 * REAL_DIR=<dir>: render the REAL view models the controller produced (tests/integration.test.js with DUMP_VIEWS=<dir>)
 *   instead of the hand-written fixtures; output goes to out/real/<WxH>/<mode>/:
 *     DUMP_VIEWS=/tmp/views node --test ../../tests/integration.test.js && REAL_DIR=/tmp/views node render.js
 * Env: DPR (default 2), HITS=1 (outline tap areas), ONLY=home,draw (screens),
 *   SIZES=320x568,430x932 (comma list; default 320x568,375x667,430x932),
 *   MODES=standard,large,hc (default all three), FONT_DIR for Noto fonts.
 * Output: out/<WxH>/<mode>/<screen>__<state>.png, a contact sheet per screen
 *   (out/<WxH>/<mode>/_contact_<screen>.png) and share cards in out/shareCard/.
 */

const fs = require('fs');
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const root = path.join(__dirname, '..', '..', 'js', 'render');
const { makeLayout } = require(path.join(root, 'layout.js'));
const render = require(path.join(root, 'index.js'));
const { buildFixtures, MODES, SIZES } = require('./fixtures.js');

const FONT_DIR = process.env.FONT_DIR || 'C:/Windows/Fonts';
['NotoSansSC-VF.ttf', 'NotoSerifSC-VF.ttf'].forEach((f) => {
  const p = path.join(FONT_DIR, f);
  if (fs.existsSync(p)) GlobalFonts.registerFromPath(p, f.indexOf('Serif') >= 0 ? 'Noto Serif CJK SC' : 'Noto Sans CJK SC');
});

const DPR = Number(process.env.DPR || 2);
const REAL_DIR = process.env.REAL_DIR || null;
// preview mode name -> the display mode the integration tour ran in
const REAL_MODE = { standard: 'default', large: 'large', hc: 'hc' };
function realFixtures(mode) {
  const f = path.join(REAL_DIR, 'real_' + REAL_MODE[mode] + '.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
}
const SHOW_HITS = process.env.HITS === '1';
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const sizesOnly = process.env.SIZES ? process.env.SIZES.split(',') : ['320x568', '375x667', '430x932'];
const modesOnly = process.env.MODES ? process.env.MODES.split(',') : Object.keys(MODES);

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

function renderState(screen, st, L, mode) {
  const c = createCanvas(Math.round(L.W * DPR), Math.round(L.H * DPR));
  const ctx = c.getContext('2d');
  ctx.scale(DPR, DPR);
  const vm = Object.assign({}, st.vm, { display: MODES[mode] });
  // the "overlay" fixtures draw a base screen (group) and then the overlay on top
  let hits = render.screens[screen === 'overlay' ? 'group' : screen].draw(ctx, vm, L) || [];
  if (st.overlay) hits = hits.concat(render.overlay.draw(ctx, Object.assign({}, st.overlay, { display: MODES[mode] }), L));
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

function main() {
  const out = path.join(__dirname, 'out', REAL_DIR ? 'real' : '');
  let count = 0;
  for (const sz of SIZES) {
    const key = sz.w + 'x' + sz.h;
    if (!sizesOnly.includes(key)) continue;
    const L = makeLayout(sysFor(sz));
    for (const mode of modesOnly) {
      const dir = path.join(out, key, mode);
      fs.mkdirSync(dir, { recursive: true });
      const fx = REAL_DIR ? realFixtures(mode) : buildFixtures({ L, mode });
      for (const screen of Object.keys(fx)) {
        if (screen === 'shareCard' || (only && !only.includes(screen))) continue;
        const rendered = [];
        for (const name of Object.keys(fx[screen])) {
          const raw = fx[screen][name];
          const st = raw && raw.vm !== undefined ? raw : { vm: raw };
          const r = renderState(screen, st, L, mode);
          fs.writeFileSync(path.join(dir, screen + '__' + name + '.png'), r.canvas.toBuffer('image/png'));
          rendered.push({ name, canvas: r.canvas });
          count++;
        }
        const cols = Math.min(rendered.length, L.W > 400 ? 4 : 5);
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
  }
  // share cards (size independent, always the standard look)
  if (!REAL_DIR && (!only || only.includes('shareCard'))) {
    const sdir = path.join(out, 'shareCard');
    fs.mkdirSync(sdir, { recursive: true });
    const cards = buildFixtures({ L: makeLayout(sysFor(SIZES[0])), mode: 'standard' }).shareCard || {};
    for (const name of Object.keys(cards)) {
      const c = createCanvas(500 * DPR, 400 * DPR);
      render.shareCard.render(c, cards[name].vm || cards[name], { pixelScale: DPR });
      fs.writeFileSync(path.join(sdir, name + '.png'), c.toBuffer('image/png'));
      count++;
    }
  }
  console.log('rendered ' + count + ' PNGs into ' + out);
}

main();
