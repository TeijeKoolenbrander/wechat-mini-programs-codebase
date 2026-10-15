# 点将台 free-play share card (reference mockup)

`sanguo.png` (1000x800, 5:4) is the reference mockup of the 三国 free-play result share card (spec section 8.4). The 概念测试 · 尚未上线 tag in the corner is a placeholder and is still on the card. Names are public-domain historical figures; all art is original shapes and type.

## Rebuild

`cd src && npm install && node build.js`

The SVG source is written to `src/sanguo.svg` and the PNG to this folder. Renderer: @resvg/resvg-js. Delete `src/node_modules` afterwards (it is git-ignored).

## Fonts

Noto Serif SC (SIL Open Font License), file `NotoSerifSC-VF.ttf`. `build.js` looks in `C:/Windows/Fonts`; set `FONT_DIR` to point elsewhere.

## Faked bold

Noto Serif SC is a variable font and resvg ignores the weight axis, so every text with `font-weight` of 500 or more gets a same-colour stroke scaled to its font size. If the weights in `build.js` change, check the stroke table at the end of `svg()`.
