#!/usr/bin/env bash
# Re-renders the store/备案 screenshots (1080 x 1920 = 360 x 640 @ 3x) from the game's own preview tool WITHOUT touching the repo.
# It works on a scratch copy: adds a 360x640 size and removes the red capsule outline (a dev aid), installs @napi-rs/canvas in the
# scratch copy (so no node_modules appear in the repo), renders, and copies the chosen screens here.
# Usage: bash render-store-screens.sh [scratch-dir]
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../../../.." && pwd)"
S="${1:-$(mktemp -d)}"
mkdir -p "$S/g"
cd "$REPO/apps/kedupan/game" && cp -r core js opendata tools assets "$S/g/"
cd "$S/g/tools/preview"
sed -i "s|^const SIZES = \[|const SIZES = [\n  { w: 360, h: 640, sb: 24, menu: { top: 30, bottom: 62, left: 266, right: 353 }, inset: 0 },|" render.js
sed -i "/ctx.strokeStyle = 'rgba(255,0,0,0.5)';/,/ctx.setLineDash(\[\]);/d" render.js
npm install --no-audit --no-fund
DPR=3 SIZES=360x640 MODES=default node render.js
OUT="$REPO/docs/kedupan/release/screenshots"; i=1
for p in home__available_group card__placing card__revealed result__final group__ready round__revealed create__clue_picked home__howto create__clue_text_typed create__clue_kb_typed round__clue_typed create__clue_rules_end round__report_sheet round__clue_hidden home__settings_scrolled terms__top; do
  cp "out/360x640/default/$p.png" "$OUT/$(printf '%02d' $i)-$p.png"; i=$((i+1))
done
cp out/share/daily.png "$OUT/share-daily-500x400.png"; cp out/share/round.png "$OUT/share-round-500x400.png"; cp out/share/round_typed.png "$OUT/share-round-typed-500x400.png"; cp out/share/reveal.png "$OUT/share-reveal-500x400.png"
echo "done; scratch copy at $S (delete it when finished)"
