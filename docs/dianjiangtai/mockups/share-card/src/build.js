// Usage: npm i && node build.js
// FONT_DIR (default C:/Windows/Fonts) must contain NotoSerifSC-VF.ttf (SIL OFL).
const fs = require('fs'), path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const FD = process.env.FONT_DIR || 'C:/Windows/Fonts';
const fontFiles = [path.join(FD, 'NotoSerifSC-VF.ttf')];
const out = path.join(__dirname, '..');

const t = { file: 'sanguo', font: 'Noto Serif SC', bg1: '#f1e6cc', bg2: '#e3d2ab', ink: '#2a211a', sub: '#6b5a45', accent: '#b3261e', tileBg: '#fbf4e2', won: '#2a211a', lost: '#b3261e', stamp: ['大捷', '点将台'], stampInk: '#f6e9d0',
  title: '点将台 · 点将出征', record: '十一胜一负', grade: '〔霸业将成〕', tag: '12 战', tagline: '你能点出一统天下的阵容吗？',
  strip: { n: 12, lostAt: [8] },
  slots: [['主公', '刘备', '刘', '蜀', '汉末', '#2f7d4f'], ['军师', '诸葛亮', '诸', '蜀', '汉末', '#2f7d4f'], ['先锋', '赵云', '赵', '蜀', '汉末', '#2f7d4f'], ['猛将', '吕布', '吕', '群', '汉末', '#8a7a52'], ['守将', '曹仁', '曹', '魏', '汉末', '#2c5a96']] };

function svg(t) {
  const F = `font-family="${t.font}"`;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800" viewBox="0 0 1000 800">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.bg1}"/><stop offset="1" stop-color="${t.bg2}"/></linearGradient></defs>
<rect width="1000" height="800" fill="url(#g)"/>`;
  s += `<rect x="24" y="24" width="952" height="752" fill="none" stroke="${t.ink}" stroke-opacity="0.55" stroke-width="3"/><rect x="34" y="34" width="932" height="732" fill="none" stroke="${t.ink}" stroke-opacity="0.25" stroke-width="1.5"/>`;
  // corner tag
  s += `<rect x="738" y="46" width="214" height="42" rx="21" fill="${t.ink}" fill-opacity="0.12" stroke="${t.ink}" stroke-opacity="0.5" stroke-width="2"/><text x="845" y="76" ${F} font-size="22" font-weight="500" fill="${t.ink}" text-anchor="middle">概念测试 · 尚未上线</text>`;
  s += `<text x="60" y="124" ${F} font-size="48" font-weight="800" fill="${t.ink}">${t.title}</text>`;
  s += `<text x="500" y="262" ${F} font-size="116" font-weight="900" fill="${t.ink}" text-anchor="middle">${t.record}</text>`;
  s += `<text x="500" y="332" ${F} font-size="54" font-weight="800" fill="${t.accent}" text-anchor="middle" letter-spacing="6">${t.grade}</text>`;
  s += `<g transform="rotate(-8 881 251)"><rect x="826" y="196" width="110" height="110" rx="8" fill="${t.accent}"/><rect x="834" y="204" width="94" height="94" rx="0" fill="none" stroke="${t.stampInk}" stroke-width="3"/><text x="881" y="258" ${F} font-size="38" font-weight="900" fill="${t.stampInk}" text-anchor="middle">${t.stamp[0]}</text><text x="881" y="284" ${F} font-size="20" font-weight="700" fill="${t.stampInk}" text-anchor="middle">${t.stamp[1]}</text></g>`;
  const tw = 164, gap = 20, x0 = 500 - (5 * tw + 4 * gap) / 2, ty = 372;
  t.slots.forEach(([pos, name, mono, team, era, col], i) => {
    const x = x0 + i * (tw + gap), cx = x + tw / 2;
    s += `<rect x="${x}" y="${ty}" width="${tw}" height="236" rx="14" fill="${t.tileBg}" stroke="${t.ink}" stroke-opacity="0.2" stroke-width="2"/>`;
    s += `<text x="${cx}" y="${ty + 36}" ${F} font-size="26" font-weight="700" fill="${t.sub}" text-anchor="middle">${pos}</text>`;
    s += `<rect x="${cx - 52}" y="${ty + 52}" width="104" height="104" rx="10" fill="${col}"/>`;
    s += `<text x="${cx}" y="${ty + 128}" ${F} font-size="66" font-weight="900" fill="#fff" text-anchor="middle">${mono}</text>`;
    s += `<text x="${cx}" y="${ty + 196}" ${F} font-size="34" font-weight="800" fill="${t.ink}" text-anchor="middle">${name}</text>`;
    s += `<text x="${cx}" y="${ty + 224}" ${F} font-size="20" font-weight="500" fill="${t.sub}" text-anchor="middle">${team} · ${era}</text>`;
  });
  const { n, lostAt } = t.strip, sw = 880, sx = 60, sy = 650, step = sw / n;
  for (let i = 0; i < n; i++) {
    const cx = sx + step * (i + 0.5);
    s += lostAt.includes(i) ? `<circle cx="${cx}" cy="${sy}" r="14" fill="none" stroke="${t.lost}" stroke-width="4"/>` : `<circle cx="${cx}" cy="${sy}" r="14" fill="${t.won}"/>`;
  }
  s += `<text x="500" y="702" ${F} font-size="22" font-weight="500" fill="${t.sub}" text-anchor="middle">${t.tag} · ● 胜  ○ 负</text>`;
  s += `<text x="500" y="748" ${F} font-size="34" font-weight="800" fill="${t.ink}" text-anchor="middle">${t.tagline}</text>`;
  // variable-font weight is ignored by resvg: fake bold with a same-colour stroke
  s = s.replace(/font-size="(\d+)" font-weight="(\d+)" fill="([^"]+)"/g, (m, sz, w, c) => +w >= 500 ? m + ' stroke="' + c + '" stroke-width="' + (sz * ({500:0.02,700:0.03,800:0.036,900:0.045}[w]*0.8)).toFixed(1) + '" stroke-linejoin="round"' : m);
  return s + '</svg>';
}

const s = svg(t);
fs.writeFileSync(path.join(__dirname, t.file + '.svg'), s);
const r = new Resvg(s, { fitTo: { mode: 'width', value: 1000 }, font: { fontFiles, loadSystemFonts: false, defaultFontFamily: t.font } });
fs.writeFileSync(path.join(out, t.file + '.png'), r.render().asPng());
console.log('wrote', t.file + '.png');
