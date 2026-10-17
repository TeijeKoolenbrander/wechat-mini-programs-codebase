# 传画接龙 screenshots

Rendered 2026-10-16 (02-pick re-rendered for spec rev. 2.1: 「换一批（剩5次）」; the other screens are byte-identical to the 2026-10-15 render) from the game's own renderer (`apps/chuanhua/game/tools/preview`, `@napi-rs/canvas`) on `kept-ideas/v1` (a8a86d3; apart from the pick screen, the ready-state renders are unchanged since the 2026-10-15 build 461b427), default display mode, no capsule overlay. Re-render with `render-store-screens.sh` (works in a scratch copy; nothing is installed in the repo: `node_modules` is created only in the scratch folder and deleted at the end; the repo got only the files in this folder).

| File | Size | Screen | Use |
|---|---|---|---|
| `01-home__ready.png` | 1080 x 2340 | home: 开一局 primary, 慢慢传 link, group line, 我的接龙 / 本群接龙 / 玩法 / 设置 | listing, 备案, manual |
| `02-pick__ready.png` | 1080 x 2340 | roll 3, pick 1, 30 s timer, 换一批, 自己出题 | listing, 备案, manual |
| `03-lobby__ready.png` | 1080 x 2340 | lobby: numbered seats, 邀请群友, 开始 | listing, 备案, manual |
| `04-draw__drawing.png` | 1080 x 2340 | draw turn: source strip, full-height canvas, colours, tools, timer, 举报 | listing, 备案, manual |
| `05-describe__typing.png` | 1080 x 2340 | describe turn: the previous drawing, the sentence box, timer | 备案, manual |
| `06-roundWait__ready.png` | 1080 x 2340 | round wait: my sent turn, progress | 备案, manual |
| `07-overview__ready.png` | 1080 x 2340 | reveal overview (final steps of every chain, 再来一局) | listing, 备案, manual |
| `08-stepthrough__ready.png` | 1080 x 2340 | step-through (final step first), 笑, 举报 | listing, 备案, manual |
| `09-stepthrough__x_middleDraw.png` | 1080 x 2340 | step-through on a drawing step | manual |
| `10-report__idle.png` | 1080 x 2340 | report sheet with the five fixed reasons | 备案 (UGC evidence), manual |
| `11-rules__open.png` | 1080 x 2340 | 接龙公约 sheet | 备案 (UGC evidence), manual |
| `12-howto__open.png` | 1080 x 2340 | 玩法 sheet | manual |
| `13-settings__idle.png` | 1080 x 2340 | settings incl. 删除我的全部接龙内容 | manual |
| `14-roomEntry__joinable.png` | 1080 x 2340 | entering from a room card in the group | manual |
| `15-entry__claimable.png` | 1080 x 2340 | 慢慢传 chain entry (content never shown) | manual |
| `16-teaser__x_room.png` | 1080 x 2340 | text teaser for non-participants | manual |
| `share-roomInvite-500x400.png`, `share-roomReveal-500x400.png`, `share-chainInvite-500x400.png`, `share-chainReveal-500x400.png` | 500 x 400 (5:4) | the four share cards: **our art and passed text only, no user drawing** | share review |

Size rationale: WeChat publishes **no pixel size** for 小游戏 listing screenshots (宣传图 is optional; 备案 says only "size and version consistent"). 1080 x 2340 is a current portrait phone ratio and matches the game's portrait-only layout. If the console form shows another size when you upload, tell the CTO: the tool takes any window size. Share images follow the platform's 5:4 ratio.

**What is real and what is fixture.** Everything is a view-model fixture drawn through the real renderer: the doodles (a house, a tree, a sun) are code-made strokes, **not user drawings**; the sentences are samples. One fixture sentence is swapped in the scratch copy only (企鹅在沙漠晒太阳 -> 企鹅在沙漠里撑伞) so no screenshot echoes a prompt idea retired in content review. The 《用户协议》 screen is **not** included: the fixture shows an old slice of the v1 agreement (not the real text).

**Known gaps:** (1) the real launch splash (健康游戏忠告 + 适龄提示 + name) cannot be rendered and is a real-device screenshot (`../beian.md` section 5). (2) Fonts are a stand-in (Noto Sans SC); the phone's system font differs slightly. (3) Small-phone large-text layouts are in `docs/chuanhua/preview/320x568-large` (not part of the store set).
