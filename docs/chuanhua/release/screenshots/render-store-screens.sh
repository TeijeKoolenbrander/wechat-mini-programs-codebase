#!/usr/bin/env bash
# Re-renders the store / 备案 / manual screenshots (360 x 780 at 3x = 1080 x 2340) and the four share cards (500 x 400)
# from the game's own preview tool (apps/chuanhua/game/tools/preview: real renderer code, fixture data) WITHOUT leaving
# anything in the repo. It works on a scratch copy: adds a 360x780 size, removes the blue capsule outline (a dev aid), swaps one
# fixture sentence that echoes a retired prompt idea, adds the two room share cards to the preview loop, installs
# @napi-rs/canvas in the scratch copy only (npm ci from the tool's own lockfile), renders, and copies the chosen screens here.
# Font: Noto Sans SC from C:/Windows/Fonts (FONT_DIR) as a stand-in for the phone's system font.
# Usage: bash render-store-screens.sh [scratch-dir]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../../.." && pwd)"
S="${1:-$(mktemp -d)}"
mkdir -p "$S/g/tools"
cd "$REPO/apps/chuanhua/game" && cp -r core js assets "$S/g/" && cp -r tools/preview "$S/g/tools/"
rm -rf "$S/g/tools/preview/node_modules" "$S/g/tools/preview/out"
cd "$S/g/tools/preview"
sed -i "s|^const SIZES = \[|const SIZES = [\n  { w: 360, h: 780, sb: 44, menu: { top: 50, bottom: 82, left: 266, right: 353 }, bottomInset: 20 },|" render.js
sed -i "/ctx.strokeStyle = 'rgba(0,120,255,0.55)';/,/ctx.strokeRect(L.capsule.x/d" render.js
sed -i "s|for (const name of \['invite', 'reveal'\])|for (const name of ['invite', 'reveal', 'roomInvite', 'roomReveal'])|" render.js
sed -i "s|企鹅在沙漠晒太阳|企鹅在沙漠里撑伞|g" "$S/g/js/render/samples.js"
npm ci --no-audit --no-fund
ONLY=home,pick,lobby,draw,describe,roundWait,overview,stepthrough,report,rules,howto,settings,roomEntry,entry,teaser,group SIZES=360x780 MODES=default DPR=3 node render.js
DPR=1 ONLY=shareCard SIZES=none node render.js
P="$S/g/tools/preview/out/360x780/default"; D="$HERE"; i=1
for p in home__ready pick__ready lobby__ready draw__drawing describe__typing roundWait__ready overview__ready stepthrough__ready stepthrough__x_middleDraw report__idle rules__open howto__open settings__idle roomEntry__joinable entry__claimable teaser__x_room; do
  cp "$P/$p.png" "$D/$(printf %02d $i)-$p.png"; i=$((i+1))
done
SC="$S/g/tools/preview/out/shareCard"
cp "$SC/roomInvite.png" "$D/share-roomInvite-500x400.png"
cp "$SC/roomReveal.png" "$D/share-roomReveal-500x400.png"
cp "$SC/invite.png" "$D/share-chainInvite-500x400.png"
cp "$SC/reveal.png" "$D/share-chainReveal-500x400.png"
rm -rf "$S/g/tools/preview/node_modules"
echo "done; scratch copy at $S (delete it when finished); node_modules already removed"
