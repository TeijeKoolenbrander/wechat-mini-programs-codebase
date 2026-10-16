# 点将台 screenshots

Rendered 2026-10-15 from the game's own renderer (`apps/dianjiangtai/game/tools/preview`) with fixture view models, on `kept-ideas/v1` @ 3df1b89333d8d05b1d008ce57bfd29b2d1f46452 (the code is identical to 6582873). The set was re-rendered at this build with `render-store-screens.sh` and came out byte for byte identical to the earlier set, so the shipped sound, the share fallback image and the TD-15 scroll pill change none of these frames. Default look unless the name says otherwise, no capsule overlay. Re-render with `render-store-screens.sh` (works in a scratch copy: `npm install` of `@napi-rs/canvas` happens there and the scratch `node_modules` is deleted at the end, so nothing is installed in the repo and `apps/dianjiangtai/game/tools/preview` stays as committed).

| File | Size | Screen | Use |
|---|---|---|---|
| `01-home__available_streak.png` | 1080 x 1920 | home: seal, 今日军令 card with streak line, 出征, 自由点将, 群榜 / 好友榜 / 往期 / 玩法, 声音, 隐私与设置 | listing, 备案, manual |
| `02-draft__flipped.png` | 1080 x 1920 | round 3: faction + era tokens, 换势力 / 换时代, 可点之将 (8), the lineup so far | listing, 备案, manual |
| `03-draft__selecting.png` | 1080 x 1920 | general detail sheet: seal, tier, blurb, 五德 pips, statNote, per-slot score and fit | listing, 备案, manual |
| `04-draft__readyToMarch.png` | 1080 x 1920 | round 5 done: full lineup with fit chips, 撤回 + 出征 | listing, manual |
| `05-result__done_streak.png` | 1080 x 1920 | verdict: 十胜二负 〔霸业将成〕, 评语, rarity line, streak, 12 battle dots, lineup scores, 复盘, 再来一局 | listing, 备案, manual |
| `06-result__done_12_0.png` | 1080 x 1920 | 十二胜零负 with the 一统天下 stamp | listing, manual |
| `07-result__shiren_reveal2.png` | 1080 x 1920 | 识人 Sunday verdict with the 五德揭晓 step | listing, manual |
| `08-draft__hidden_flipped.png` | 1080 x 1920 | 识人 draft: stats, tier and fit hidden ("五德出征后揭晓") | listing, manual |
| `09-board__group_ready.png` | 1080 x 1920 | 本群 board (open-data-domain look: fixture nicknames 张三 / 李四 / 你), streaks, lineup tiles, 分享到本群 | listing, 备案, manual |
| `10-challenge__ready_daily.png` | 1080 x 1920 | 战书 entry that counts as today's daily | listing, 备案, manual |
| `11-history__ready.png` | 1080 x 1920 | 往期军令 list with 识人 tags and best streak | listing, manual |
| `12-historyIssue__ready.png` | 1080 x 1920 | one past issue: your lineup, distribution | manual |
| `13-home__howto.png` | 1080 x 1920 | 玩法 sheet | 备案, manual |
| `14-home__settings_on.png` | 1080 x 1920 | 隐私与设置: sound, 大字模式, 高对比度, 好友排行 status, 用户隐私保护指引, 联系我们 / 反馈 | 备案, manual |
| `15-home__available_streak_large.png` | 1080 x 1920 | 大字模式 home at 360 x 640 | manual (device item E12 re-checks on a phone) |
| `16-draft__flipped_highcontrast.png` | 1080 x 1920 | 高对比度 draft | manual |
| `share-daily-500x400.png`, `share-shiren-500x400.png`, `share-free-500x400.png` | 500 x 400 (5:4) | the three share cards (daily hides names, D4; free shows them) | listing, share review |
| `saved-daily-1000x800.png` | 1000 x 800 | the album variant of the card (保存图片, 2x) | manual |

Size rationale: WeChat publishes **no pixel size** for 小游戏 listing screenshots. Optional 宣传图 at submission (bbsh.html) and the 备案 screenshots (nrjs.html: "size and version consistent") have no stated dimensions; 1080 x 1920 (9:16) is the common phone portrait size and matches the game's portrait-only layout. If the console form shows another size when you upload, tell the CTO the size and it is re-rendered (the tool takes any window size). Share images follow the platform's 5:4 ratio.

Known gaps and honest limits:
- Fixture data (issue 12, nicknames 张三 / 李四, dates, the 2,315-player histogram) is not real; the open-data-domain board is drawn by the preview's own fake rows.
- The reveal animation renders (`result__revealing_*`) are **not included**: their fixture battle lines come from a fixed list and do not match the win/loss marks (a fixture shortcut, not a game bug), so they would mislead a reviewer.
- The real launch splash (健康游戏忠告 + 适龄提示 + name) cannot be rendered here and is a real-device screenshot (see `../beian.md` section 4).
- Font: the renders use Noto Serif SC (OFL) as the device-font stand-in; the game uses the device's own serif at run time and an open-licence display font only if one is added later (none ships in v1).
- Image 15 (大字模式 at 360 x 640) and the same render at 320 x 568 (checked, not shipped here) show the home screen **without the seal and the 点将台 title**: the top band is empty and the four buttons sit above the daily card. That looks like an intentional space-saving layout for large text, but nothing in the spec says the title may disappear, so it is a device-pass item (E12) and a CTO note, not a defect claim.
- Sound: the build ships four WAV cues and `assets/share-fallback.png` (`rules-check.md` 1.19); a still image cannot show sound, so nothing here implies it.
