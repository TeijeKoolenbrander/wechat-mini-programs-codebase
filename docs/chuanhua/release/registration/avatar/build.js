// 传画接龙 account avatar generator. Usage: npm i && node build.js
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
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7B04B"/><stop offset="1" stop-color="#EE8A1F"/></linearGradient>
</defs>
<rect width="1024" height="1024" fill="url(#bg)"/><g transform="translate(512 512) scale(1.15) translate(-512 -512)">
<!-- paper note, slight tilt, hard offset shadow, tape -->
<g transform="rotate(-7 512 520)">
<rect x="258" y="270" width="520" height="520" rx="40" fill="#A8570C" opacity="0.28"/>
<rect x="244" y="252" width="520" height="520" rx="40" fill="#FFFDF8"/>
<rect x="420" y="222" width="170" height="52" rx="8" fill="#F2C94C" opacity="0.9" transform="rotate(3 505 248)"/>
</g>
<!-- a doodle line that drifts and wobbles, ending at the brush tip -->
<path d="M300 650 C 330 520, 420 520, 430 610 S 520 760, 560 640 S 640 520, 676 580" fill="none" stroke="#3C78C8" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/>
<!-- brush-shaped relay baton: bristles, ferrule, handle -->
<g transform="translate(676 580) rotate(-52)">
<path d="M0 0 C 22 -26, 64 -34, 96 -30 L 96 30 C 64 34, 22 26, 0 0 Z" fill="#1E1B18"/>
<rect x="96" y="-32" width="54" height="64" rx="8" fill="#C9CED6"/>
<rect x="110" y="-32" width="8" height="64" fill="#9AA1AB"/>
<path d="M150 -30 L 350 -18 Q 372 0 350 18 L 150 30 Z" fill="#D8433B"/>
<rect x="196" y="-25" width="18" height="50" fill="#FAF7F0" opacity="0.85"/>
</g></g>` + `</svg>`;
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
