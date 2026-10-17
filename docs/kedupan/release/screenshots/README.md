# 群友刻度盘 screenshots

**Typed-clue status (D-2, completed 2026-10-16):** the set is complete for the typed-clue build: `06`, `07`, `09`, `10`, `11` were re-rendered for the typed clue, and `12` to `16` plus `share-round-typed-500x400.png` were added for the 备案 (发言规则 sheet, 举报 sheet, hidden-clue placeholder, 设置 with 发言规则 and 《用户协议》, the 《用户协议》 reader, the typed-round share card). Only the real launch splash remains device-only. QA's 375 x 812 previews are in `docs/kedupan/qa/typed-clue/`.

Rendered 2026-10-15 (01-05, 08, share cards) and 2026-10-16 (06, 07, 09-16, typed share card) from the game's own renderer (`apps/kedupan/game/tools/preview`) with fixture data, on commit a1f46d6. Default look, no capsule overlay. Re-render with `render-store-screens.sh` (works in a scratch copy; nothing is installed in the repo).

| File | Size | Screen | Use |
|---|---|---|---|
| `01-home__available_group.png` | 1080 x 1920 | home, with the group entry line | listing, 备案, manual |
| `02-card__placing.png` | 1080 x 1920 | a card, needle placed, 就这儿 enabled | listing, 备案, manual |
| `03-card__revealed.png` | 1080 x 1920 | reveal: label, score, nation and group lines, member dots | listing, 备案, manual |
| `04-result__final.png` | 1080 x 1920 | day result, 定分 | listing, 备案, manual |
| `05-group__ready.png` | 1080 x 1920 | 本群 page with open-data ranking | listing, 备案, manual |
| `06-round__revealed.png` | 1080 x 1920 | 出题 reveal with 本题默契值 | listing, manual |
| `07-create__clue_picked.png` | 1080 x 1920 | 出题, tab 选一个提示词: hidden target band and clue chips (D-2: the second tab) | listing, manual |
| `08-home__howto.png` | 1080 x 1920 | 玩法 sheet | 备案, manual |
| `09-create__clue_text_typed.png` | 1080 x 1920 | 出题, tab 自己写 (the default): input with a typed clue, rule line, link to the presets (D-2) | 备案 (must show the typed clue), manual |
| `10-create__clue_kb_typed.png` | 1080 x 1920 | 出题 with the system keyboard open: compact layout, input and 发到群里 side by side | manual |
| `11-round__clue_typed.png` | 1080 x 1920 | a guesser sees the typed clue with 举报 (D-2) | 备案 (UGC report entry), manual |
| `12-create__clue_rules_end.png` | 1080 x 1920 | 发言规则 sheet over 出题 (scrolled to the end; 同意并写提示 enabled, links to 《用户协议》 and 《用户隐私保护指引》) | 备案 (item 9), manual |
| `13-round__report_sheet.png` | 1080 x 1920 | 举报 sheet 「举报这个提示」 with the five reasons (色情低俗, 政治敏感, 辱骂攻击, 广告引流, 其他不适), one selected | 备案 (item 10), manual |
| `14-round__clue_hidden.png` | 1080 x 1920 | a guesser's round with the placeholder 「提示已被举报隐藏」 | 备案, manual |
| `15-home__settings_scrolled.png` | 1080 x 1920 | 设置 sheet scrolled to the end: 发言规则 and 《用户协议》 rows | 备案, manual |
| `16-terms__top.png` | 1080 x 1920 | the 《用户协议》 reader page (top; the draft text still has 【】 placeholders, H15) | 备案, manual |
| `share-daily-500x400.png`, `share-round-500x400.png`, `share-reveal-500x400.png` | 500 x 400 (5:4) | the three preset-era share cards (`share-round` shows the preset clue) | listing, share review |
| `share-round-typed-500x400.png` | 500 x 400 (5:4) | the typed-round share card: 「提示在题目里，点开看看」, no clue text (the clue never goes on a card) | listing, share review, manual |

Size rationale: WeChat publishes **no pixel size** for 小游戏 listing screenshots. Optional 宣传图 at submission (bbsh.html) and the 备案 screenshots (nrjs.html: "size and version consistent") have no stated dimensions; 1080 x 1920 (9:16) is the common phone portrait size and matches the game's portrait-only layout. If the console form shows another size when you upload, tell the CTO the size and it is re-rendered (the tool takes any window size). Share images follow the platform's 5:4 ratio.

Known gaps: fixture data (issue 12, nicknames 张三 / 你, dates) is not real; the real launch splash (健康游戏忠告 + 适龄提示 + name) cannot be rendered here and is a real-device screenshot (see `../beian.md` section 4).
