# 点将台 account avatar

Three original seal (印章) concepts on 宣纸 parchment, palette from direction.md §6 / share-card (parchment #f3eadb-#e3d2ab, seal red #b23a2b-family #b3261e, paper #f6e9d0).

- A: 白文 seal, 点 over 将, red block with paper characters
- B: 白文 seal, single bold 将 (**recommended**: largest glyph, clearest at 40 px and in circle crop)
- C: 朱文 seal, 点将 in red outline on paper (thinnest, weakest at 40 px)

Files: `avatar-{A,B,C}-{1024,512,300,144}.png` (all under 200 KB), `avatar-*.svg`, `preview.png` (square, circle crop, 40 px and 100 px).
Safe area: seal sits within ~0.83 of the circle radius, so the circle crop loses nothing.

Font: Noto Serif SC (NotoSerifSC-VF.ttf), SIL Open Font License 1.1; text is converted at render time by resvg, only the characters 点 将. No portraits, third-party marks, QR codes or other text.

JPG (WeChat upload accepts bmp/jpeg/jpg/gif): `avatar-B-{1024,512,300,144}.jpg`, quality 92, opaque (needs jpeg-js).

Rebuild: `npm i && node build.js` (FONT_DIR defaults to C:/Windows/Fonts). node_modules is gitignored.
