// 群友刻度盘 account avatar generator. Usage: npm i && node build.js
// Code-drawn SVG rendered by resvg (no third-party art, no AI art).
// Font is used only if USE_FONT (Noto Serif SC variable font, SIL OFL 1.1; FONT_DIR defaults to C:/Windows/Fonts).
const fs = require('fs'), path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const jpeg = require('jpeg-js');
const USE_FONT = false;
const FD = process.env.FONT_DIR || 'C:/Windows/Fonts';
const font = USE_FONT ? { fontFiles: [path.join(FD, 'NotoSerifSC-VF.ttf')], loadSystemFonts: false, defaultFontFamily: 'Noto Serif SC' } : { loadSystemFonts: false };
const out = __dirname;
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">` + `<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8A5A9A"/><stop offset="1" stop-color="#5A3069"/></linearGradient>
</defs>
<rect width="1024" height="1024" fill="url(#bg)"/><g transform="translate(512 512) scale(1.1) translate(-512 -512)">
<!-- paper tape measure -->
<rect x="142" y="500" width="760" height="190" rx="22" fill="#2C1536" opacity="0.4"/>
<rect x="134" y="486" width="760" height="190" rx="22" fill="#F2C94C"/>
<g stroke="#24211E" stroke-width="10" stroke-linecap="round">
<line x1="182" y1="486" x2="182" y2="550"/>
<line x1="222.5" y1="486" x2="222.5" y2="526"/>
<line x1="263" y1="486" x2="263" y2="526"/>
<line x1="303.5" y1="486" x2="303.5" y2="526"/>
<line x1="344" y1="486" x2="344" y2="550"/>
<line x1="384.5" y1="486" x2="384.5" y2="526"/>
<line x1="425" y1="486" x2="425" y2="526"/>
<line x1="465.5" y1="486" x2="465.5" y2="526"/>
<line x1="506" y1="486" x2="506" y2="582"/>
<line x1="546.5" y1="486" x2="546.5" y2="526"/>
<line x1="587" y1="486" x2="587" y2="526"/>
<line x1="627.5" y1="486" x2="627.5" y2="526"/>
<line x1="668" y1="486" x2="668" y2="550"/>
<line x1="708.5" y1="486" x2="708.5" y2="526"/>
<line x1="749" y1="486" x2="749" y2="526"/>
<line x1="789.5" y1="486" x2="789.5" y2="526"/>
<line x1="830" y1="486" x2="830" y2="550"/>
</g>
<!-- end notes: cold (blue) and hot (orange) -->
<rect x="190" y="710" width="150" height="104" rx="12" fill="#CFE3F5" transform="rotate(-5 265 762)"/>
<rect x="684" y="710" width="150" height="104" rx="12" fill="#FFD3A8" transform="rotate(5 760 762)"/>
<!-- three markers: you (tangerine pointer), nation (teal diamond), group (plum dot) -->
<path d="M388 290 L522 290 L455 424 Z" fill="#F07B2C" stroke="#FBF6EC" stroke-width="18" stroke-linejoin="round"/>
<path d="M662 530 L714 581 L662 632 L610 581 Z" fill="#2A8C8C" stroke="#FBF6EC" stroke-width="14" stroke-linejoin="round"/>
<circle cx="300" cy="581" r="48" fill="#7D4E8C" stroke="#FBF6EC" stroke-width="14"/></g>` + `</svg>`;
const render = (s, w) => new Resvg(s, { fitTo: { mode: 'width', value: w }, font }).render();
const sizes = [1024, 512, 300, 144];
fs.writeFileSync(path.join(out, 'avatar.svg'), SVG);
for (const w of sizes) {
  const r = render(SVG, w);
  fs.writeFileSync(path.join(out, `avatar-${w}.png`), r.asPng());
  // JPG: flatten any alpha onto white (the artwork is fully opaque, so this is a safety net)
  const px = Buffer.from(r.pixels);
  for (let i = 0; i < px.length; i += 4) { const a = px[i + 3] / 255; if (a < 1) { for (let c = 0; c < 3; c++) px[i + c] = px[i + c] * a + 255 * (1 - a); px[i + 3] = 255; } }
  fs.writeFileSync(path.join(out, `avatar-${w}.jpg`), jpeg.encode({ data: px, width: r.width, height: r.height }, 92).data);
}
// Preview sheet: 360 px square, circle crop, then 40 px and 100 px on light and dark backgrounds.
const uri = b => 'data:image/png;base64,' + Buffer.from(b).toString('base64');
const big = uri(render(SVG, 360).asPng()), mid = uri(render(SVG, 100).asPng()), sm = uri(render(SVG, 40).asPng());
const circ = (u, x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><image href="${u}" width="1" height="1" clip-path="url(#c)"/></g>`;
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="470" viewBox="0 0 1000 470"><defs><clipPath id="c" clipPathUnits="objectBoundingBox"><circle cx="0.5" cy="0.5" r="0.5"/></clipPath></defs>
<rect width="1000" height="470" fill="#ffffff"/>
<image href="${big}" x="30" y="30" width="360" height="360"/>
<g transform="translate(420 30) scale(360)"><image href="${big}" width="1" height="1" clip-path="url(#c)"/></g>
<rect x="810" y="30" width="160" height="360" fill="#ededed"/><rect x="810" y="210" width="160" height="180" fill="#2b2b2b"/>
<image href="${sm}" x="825" y="46" width="40" height="40"/>${circ(sm, 885, 46, 40)}
<image href="${mid}" x="825" y="100" width="100" height="100"/>
<image href="${sm}" x="825" y="226" width="40" height="40"/>${circ(sm, 885, 226, 40)}
<image href="${mid}" x="825" y="280" width="100" height="100"/>
</svg>`;
fs.writeFileSync(path.join(out, 'preview.png'), new Resvg(sheet, { fitTo: { mode: 'width', value: 1000 } }).render().asPng());
console.log('done');
