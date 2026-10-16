#!/usr/bin/env bash
# Re-renders the store/备案 screenshots (1080 x 1920 = 360 x 640 @ 3x) from the game's own preview tool WITHOUT touching the repo.
# The preview tool is apps/dianjiangtai/game/tools/preview. This script works on a scratch copy: it adds a 360x640 size, removes the
# blue capsule outline (a dev aid), installs @napi-rs/canvas in the scratch copy (so no node_modules appear in the repo), renders,
# copies the chosen screens here, and deletes the scratch node_modules at the end.
# Usage: bash render-store-screens.sh [scratch-dir]      (needs Node >= 20 and the Noto Serif SC / Noto Sans SC fonts in FONT_DIR,
#        default C:/Windows/Fonts; without them the tool falls back to whatever font the OS has)
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../../../.." && pwd)"
S="${1:-$(mktemp -d)}"
mkdir -p "$S/g/tools"
cd "$REPO/apps/dianjiangtai/game" && cp -r core js opendata "$S/g/" && cp -r tools/preview "$S/g/tools/"
cd "$S/g/tools/preview"
rm -rf out node_modules
# add a 360x640 window size (field names as in render.js SIZES) and drop the capsule outline
sed -i "s|^const SIZES = \[|const SIZES = [\n  { w: 360, h: 640, sb: 24, menu: { top: 30, bottom: 62, left: 266, right: 353 }, bottomInset: 0 },|" render.js
sed -i "/capsule outline so overlaps are visible/,/ctx.strokeRect(L.capsule.x, L.capsule.y, L.capsule.w, L.capsule.h);/d" render.js
npm install --no-audit --no-fund
# screens at 3x (1080 x 1920): default look, then large text and high contrast for the accessibility pair
DPR=3 SIZES=360x640 MODES=default node render.js
DPR=3 SIZES=360x640 MODES=large,hc ONLY=home,draft node render.js
mkdir -p out3 && cp -r out/360x640 out3/
# share cards at 1x (exact 500 x 400; the saved album variant is 1000 x 800)
DPR=1 SIZES=360x640 MODES=default ONLY=shareCard node render.js
OUT="$REPO/docs/dianjiangtai/release/screenshots"; i=1
for p in home__available_streak draft__flipped draft__selecting draft__readyToMarch result__done_streak result__done_12_0 \
         result__shiren_reveal2 draft__hidden_flipped board__group_ready challenge__ready_daily history__ready \
         historyIssue__ready home__howto home__settings_on; do
  cp "out3/360x640/default/$p.png" "$OUT/$(printf '%02d' $i)-$p.png"; i=$((i+1))
done
cp out3/360x640/large/home__available_streak.png "$OUT/15-home__available_streak_large.png"
cp out3/360x640/hc/draft__flipped.png "$OUT/16-draft__flipped_highcontrast.png"
cp out/shareCard/daily_10_2.png "$OUT/share-daily-500x400.png"
cp out/shareCard/daily_shiren.png "$OUT/share-shiren-500x400.png"
cp out/shareCard/free_10_2.png "$OUT/share-free-500x400.png"
cp out/shareCard/saved_daily_shiren.png "$OUT/saved-daily-1000x800.png"
rm -rf "$S/g/tools/preview/node_modules"
echo "done; scratch copy at $S (node_modules removed; delete the folder when finished)"
