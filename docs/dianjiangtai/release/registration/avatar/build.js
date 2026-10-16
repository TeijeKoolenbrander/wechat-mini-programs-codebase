// Usage: npm i && node build.js   (FONT_DIR default C:/Windows/Fonts must hold NotoSerifSC-VF.ttf, SIL OFL)
const fs = require('fs'), path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const FD = process.env.FONT_DIR || 'C:/Windows/Fonts';
const fontFiles = [path.join(FD, 'NotoSerifSC-VF.ttf')];
const out = __dirname;
const P = { bg1: '#f3eadb', bg2: '#e3d2ab', ink: '#2a211a', red: '#b3261e', paper: '#f6e9d0' };
const F = 'font-family="Noto Serif SC"';
const defs = `<defs>
<radialGradient id="g" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="${P.bg1}"/><stop offset="1" stop-color="${P.bg2}"/></radialGradient>
<filter id="rough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="9"/></filter>
</defs>`;
const bold = (c, w) => `fill="${c}" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"`;
// all seal content within a 560 box centred (half-diagonal 396 < circle safe radius ~410)
const S = 560, X = 232, Y = 232;
const variants = {
  // A: 白文 (paper characters on solid red), 点 over 将
  A: `<g transform="translate(512 512) scale(1.07) rotate(-6) translate(-512 -512)" filter="url(#rough)"><rect x="${X}" y="${Y}" width="${S}" height="${S}" rx="14" fill="${P.red}"/>
<rect x="${X + 22}" y="${Y + 22}" width="${S - 44}" height="${S - 44}" fill="none" stroke="${P.paper}" stroke-width="10"/>
<text x="512" y="${Y + 250}" ${F} font-size="230" font-weight="900" ${bold(P.paper, 8)} text-anchor="middle">点</text>
<text x="512" y="${Y + 485}" ${F} font-size="230" font-weight="900" ${bold(P.paper, 8)} text-anchor="middle">将</text></g>`,
  // B: one bold 将 as 白文 seal
  B: `<g transform="translate(512 512) scale(1.07) rotate(-6) translate(-512 -512)" filter="url(#rough)"><rect x="${X}" y="${Y}" width="${S}" height="${S}" rx="14" fill="${P.red}"/>
<rect x="${X + 22}" y="${Y + 22}" width="${S - 44}" height="${S - 44}" fill="none" stroke="${P.paper}" stroke-width="10"/>
<text x="512" y="${Y + 430}" ${F} font-size="400" font-weight="900" ${bold(P.paper, 12)} text-anchor="middle">将</text></g>`,
  // C: 朱文 (red characters and frame on paper), 点将 side by side as a wide-set pair stacked 2x1 inside a bordered seal
  C: `<g transform="translate(512 512) scale(1.07) rotate(-6) translate(-512 -512)" filter="url(#rough)"><rect x="${X}" y="${Y}" width="${S}" height="${S}" rx="14" fill="${P.paper}" fill-opacity="0.35" stroke="${P.red}" stroke-width="30"/>
<text x="512" y="${Y + 250}" ${F} font-size="235" font-weight="900" ${bold(P.red, 8)} text-anchor="middle">点</text>
<text x="512" y="${Y + 490}" ${F} font-size="235" font-weight="900" ${bold(P.red, 8)} text-anchor="middle">将</text></g>`,
};
const svg = (k, circ) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${defs}<rect width="1024" height="1024" fill="url(#g)"/>${variants[k]}</svg>`;
const render = (s, w) => new Resvg(s, { fitTo: { mode: 'width', value: w }, font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Noto Serif SC' } }).render().asPng();
const sizes = [1024, 512, 300, 144];
for (const k of Object.keys(variants)) {
  fs.writeFileSync(path.join(out, `avatar-${k}.svg`), svg(k));
  for (const w of sizes) fs.writeFileSync(path.join(out, `avatar-${k}-${w}.png`), render(svg(k), w));
}
// preview sheet: square, circle crop, 40px (square + circle, shown at 1x and 3x)
const uri = b => 'data:image/png;base64,' + b.toString('base64');
let sh = `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="560" viewBox="0 0 1500 560"><rect width="1500" height="560" fill="#ffffff"/>
<defs><clipPath id="c"><circle cx="0.5" cy="0.5" r="0.5"/></clipPath></defs>`;
const rows = Object.keys(variants);
rows.forEach((k, i) => {
  const x0 = 30 + i * 490, big = uri(render(svg(k), 360)), sm = uri(render(svg(k), 40)), mid = uri(render(svg(k), 120));
  sh += `<text x="${x0}" y="36" font-size="26" font-family="Noto Serif SC" fill="#222">Variant ${k}</text>`;
  sh += `<image href="${big}" x="${x0}" y="50" width="200" height="200"/>`;
  sh += `<g transform="translate(${x0 + 230} 50) scale(200)"><image href="${big}" width="1" height="1" clip-path="url(#c)"/></g>`;
  sh += `<rect x="${x0}" y="290" width="440" height="110" fill="#ededed"/>`;
  sh += `<image href="${sm}" x="${x0 + 20}" y="325" width="40" height="40"/><g transform="translate(${x0 + 90} 325) scale(40)"><image href="${sm}" width="1" height="1" clip-path="url(#c)"/></g>`;
  sh += `<image href="${mid}" x="${x0 + 170}" y="295" width="100" height="100"/><g transform="translate(${x0 + 300} 295) scale(100)"><image href="${mid}" width="1" height="1" clip-path="url(#c)"/></g>`;
  sh += `<text x="${x0}" y="440" font-size="20" font-family="Noto Serif SC" fill="#555">square, circle, 40px, 100px</text>`;
});
sh += `</svg>`;
fs.writeFileSync(path.join(out, 'preview.png'), render(sh, 1500));

// JPG export of Variant B (WeChat avatar upload accepts bmp/jpeg/jpg/gif). Needs jpeg-js.
const jpeg = require('jpeg-js');
for (const w of sizes) {
  const r = new Resvg(svg('B'), { fitTo: { mode: 'width', value: w }, font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Noto Serif SC' } }).render();
  const px = Buffer.from(r.pixels); // RGBA; flatten onto opaque parchment (#e3d2ab) in case of any alpha
  for (let i = 0; i < px.length; i += 4) { const a = px[i + 3] / 255; if (a < 1) { px[i] = px[i] * a + 0xe3 * (1 - a); px[i + 1] = px[i + 1] * a + 0xd2 * (1 - a); px[i + 2] = px[i + 2] * a + 0xab * (1 - a); px[i + 3] = 255; } }
  fs.writeFileSync(path.join(out, `avatar-B-${w}.jpg`), jpeg.encode({ data: px, width: r.width, height: r.height }, 92).data);
}
