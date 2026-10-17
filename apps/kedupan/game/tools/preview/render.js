/**
 * Renders every screen x state from the fixture view models to PNG, at several window sizes and in the four display modes,
 * without WeChat. Dev tool, not shipped (packOptions.ignore excludes tools/).
 *
 *   cd apps/kedupan/game/tools/preview && npm install && node render.js
 *
 * Env: DPR (default 2), HITS=1 (outline tap areas), ONLY=home,card (screens), SIZES=375x667,320x568, MODES=default,large,hc,large_hc,
 *      OUT=<dir> (default ./out, gitignored), SHEETS=1 (only the contact sheets).
 * Output: out/<WxH>/<mode>/<screen>__<state>.png, out/<WxH>/<mode>/_sheet_<screen>.png (all states of a screen side by side),
 *         out/opendata/<view>__<mode>.png, out/share/<model>.png.
 * Fonts: registers Noto Sans SC from the system fonts folder (FONT_DIR) as a stand-in for the device system font.
 */

const fs = require('fs');
const path = require('path');
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');

const game = path.join(__dirname, '..', '..');
const root = path.join(game, 'js', 'render');
const render = require(root);
const overlay = require(path.join(root, 'overlay.js'));
const shareCard = require(path.join(root, 'shareCard.js'));
const { drawView } = require(path.join(game, 'opendata', 'draw.js'));
const { buildModel } = require(path.join(game, 'opendata', 'match.js'));
const { buildFixtures, opendataFixtures } = require('./fixtures.js');

const FONT_DIR = process.env.FONT_DIR || 'C:/Windows/Fonts';
[
  ['NotoSansSC-VF.ttf', 'Noto Sans CJK SC'],
  ['NotoSansSC-Regular.ttf', 'Noto Sans CJK SC'],
].forEach(([f, fam]) => {
  const p = path.join(FONT_DIR, f);
  if (fs.existsSync(p)) GlobalFonts.registerFromPath(p, fam);
});

const SIZES = [
  { w: 375, h: 667, sb: 20, menu: { top: 26, bottom: 58, left: 281, right: 368 }, inset: 0 },
  { w: 320, h: 568, sb: 20, menu: { top: 26, bottom: 58, left: 226, right: 313 }, inset: 0 },
  { w: 414, h: 896, sb: 44, menu: { top: 50, bottom: 82, left: 320, right: 407 }, inset: 34 },
  { w: 375, h: 812, sb: 47, menu: { top: 53, bottom: 85, left: 281, right: 368 }, inset: 34 },
  { w: 430, h: 932, sb: 54, menu: { top: 60, bottom: 92, left: 336, right: 423 }, inset: 34 },
  { w: 768, h: 1024, sb: 24, menu: { top: 30, bottom: 62, left: 674, right: 761 }, inset: 20 },
];
const MODES = {
  default: { largeText: false, highContrast: false },
  large: { largeText: true, highContrast: false },
  hc: { largeText: false, highContrast: true },
  large_hc: { largeText: true, highContrast: true },
};

const DPR = Number(process.env.DPR || 2);
const SHOW_HITS = process.env.HITS === '1';
const OUT = process.env.OUT || path.join(__dirname, 'out');
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const sizesOnly = process.env.SIZES ? process.env.SIZES.split(',') : null;
const modesOnly = process.env.MODES ? process.env.MODES.split(',') : Object.keys(MODES);
const sheetsOnly = process.env.SHEETS === '1';

function layoutFor(sz) {
  return render.makeLayout({
    windowWidth: sz.w,
    windowHeight: sz.h,
    pixelRatio: DPR,
    statusBarHeight: sz.sb,
    safeArea: { top: sz.sb, bottom: sz.h - sz.inset },
    menuRect: { ...sz.menu, width: sz.menu.right - sz.menu.left, height: sz.menu.bottom - sz.menu.top },
  });
}

/** A real shared canvas for the open data list, drawn with draw.js from the 'group' fixture. */
function sharedFor(name, view, rect, mode) {
  const c = createCanvas(Math.round(rect.w * DPR), Math.round(rect.h * DPR));
  const ctx = c.getContext('2d');
  ctx.scale(DPR, DPR);
  const fx = opendataFixtures().find((f) => f.name === name);
  const model = buildModel({ view, serverRows: fx.msg.rows, salt: fx.msg.salt, selfHash: fx.msg.selfHash, kvList: fx.kv, viewerDone: true, mode: fx.msg.mode, dateKey: fx.msg.dateKey });
  drawView(ctx, model, { view, width: rect.w, height: rect.h, scroll: 0, palette: MODES[mode].highContrast ? 'highContrast' : 'standard', scale: MODES[mode].largeText ? 1.25 : 1, refs: fx.msg.refs, target: fx.msg.target, closestH: fx.msg.closestH });
  return c;
}

function mkdir(p) {
  fs.mkdirSync(p, { recursive: true });
}

async function main() {
  mkdir(OUT);
  let count = 0;
  for (const sz of SIZES) {
    const key = sz.w + 'x' + sz.h;
    if (sizesOnly && !sizesOnly.includes(key)) continue;
    const L = layoutFor(sz);
    for (const mode of modesOnly) {
      const dir = path.join(OUT, key, mode);
      mkdir(dir);
      const rectG = render.boardRect(L, null, MODES[mode]);
      const rectR = render.listRect(L, MODES[mode]);
      const display = Object.assign({ scale: MODES[mode].largeText ? 1.25 : 1, palette: MODES[mode].highContrast ? 'highContrast' : 'standard' }, MODES[mode]);
      const { fx } = buildFixtures({ L, display, sharedCanvas: null });
      for (const screen of Object.keys(fx)) {
        if (only && !only.includes(screen)) continue;
        const names = Object.keys(fx[screen]);
        const images = [];
        for (const name of names) {
          const canvasShared = screen === 'round' ? sharedFor('round', 'round', rectR, mode) : screen === 'group' ? sharedFor(name.indexOf('friend') === 0 ? 'friend' : 'group', name.indexOf('friend') === 0 ? 'friend' : 'group', rectG, mode) : null;
          const built = buildFixtures({ L, display, sharedCanvas: canvasShared }).fx[screen][name];
          const c = createCanvas(Math.round(L.W * DPR), Math.round(L.H * DPR));
          const ctx = c.getContext('2d');
          ctx.scale(DPR, DPR);
          if (screen === 'overlay') {
            ctx.fillStyle = '#FBF6EC';
            ctx.fillRect(0, 0, L.W, L.H);
            render.screens.home.draw(ctx, buildFixtures({ L, display }).fx.home.available.vm, L);
          }
          let hits = screen === 'overlay' ? [] : render.screens[screen].draw(ctx, built.vm, L);
          if (built.overlay) hits = hits.concat(overlay.draw(ctx, built.overlay, L));
          ctx.strokeStyle = 'rgba(255,0,0,0.5)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(L.capsule.x, L.capsule.y, L.capsule.w, L.capsule.h);
          ctx.setLineDash([]);
          if (SHOW_HITS) {
            ctx.lineWidth = 1;
            hits.forEach((h) => {
              ctx.strokeStyle = /scroll|list|block|body|close$/.test(h.id) && h.w > L.W * 0.8 && h.h > 120 ? 'rgba(0,120,255,0.25)' : 'rgba(0,160,0,0.9)';
              ctx.strokeRect(h.x, h.y, h.w, h.h);
            });
            if (hits.ruler) {
              ctx.strokeStyle = 'rgba(200,0,200,0.9)';
              ctx.strokeRect(hits.ruler.x0, hits.ruler.y, hits.ruler.x1 - hits.ruler.x0, hits.ruler.h);
            }
          }
          if (!sheetsOnly) fs.writeFileSync(path.join(dir, screen + '__' + name + '.png'), c.toBuffer('image/png'));
          images.push({ name, c });
          count++;
        }
        // contact sheet: every state of the screen side by side (wraps after 6)
        const perRow = Math.min(6, images.length);
        const rows = Math.ceil(images.length / perRow);
        const cw = Math.round(L.W * DPR);
        const chh = Math.round(L.H * DPR);
        const sheet = createCanvas(perRow * (cw + 16) + 16, rows * (chh + 16) + 16);
        const sctx = sheet.getContext('2d');
        sctx.fillStyle = '#888';
        sctx.fillRect(0, 0, sheet.width, sheet.height);
        images.forEach((im, i) => sctx.drawImage(im.c, 16 + (i % perRow) * (cw + 16), 16 + Math.floor(i / perRow) * (chh + 16)));
        fs.writeFileSync(path.join(dir, '_sheet_' + screen + '.png'), sheet.toBuffer('image/png'));
      }
    }
  }

  // open data lists
  if (!only || only.includes('opendata')) {
    mkdir(path.join(OUT, 'opendata'));
    for (const mode of modesOnly) {
      const sz = 343;
      for (const fx of opendataFixtures()) {
        for (const h of [420, 220]) {
          const c = createCanvas(Math.round(sz * DPR), Math.round(h * DPR));
          const ctx = c.getContext('2d');
          ctx.scale(DPR, DPR);
          ctx.fillStyle = '#FBF6EC';
          ctx.fillRect(0, 0, sz, h);
          const model = buildModel({ view: fx.msg.view, serverRows: fx.msg.rows, salt: fx.msg.salt, selfHash: fx.msg.selfHash, kvList: fx.kv, viewerDone: true, mode: fx.msg.mode, dateKey: fx.msg.dateKey });
          drawView(ctx, model, { view: fx.msg.view, width: sz, height: h, scroll: 0, palette: MODES[mode].highContrast ? 'highContrast' : 'standard', scale: MODES[mode].largeText ? 1.25 : 1, refs: fx.msg.refs, target: fx.msg.target, closestH: fx.msg.closestH });
          fs.writeFileSync(path.join(OUT, 'opendata', fx.name + '__' + mode + '__h' + h + '.png'), c.toBuffer('image/png'));
          count++;
        }
      }
    }
  }

  // share cards
  if (!only || only.includes('share')) {
    mkdir(path.join(OUT, 'share'));
    const { shareCard: models } = buildFixtures({ L: layoutFor(SIZES[0]), display: MODES.default });
    for (const name of Object.keys(models)) {
      const c = createCanvas(500, 400);
      shareCard.render(c, models[name], { pixelScale: 1 });
      fs.writeFileSync(path.join(OUT, 'share', name + '.png'), c.toBuffer('image/png'));
      count++;
    }
  }
  console.log('rendered ' + count + ' images into ' + OUT);
}

void loadImage;
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
