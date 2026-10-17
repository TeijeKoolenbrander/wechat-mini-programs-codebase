# 群友刻度盘: 软件著作权登记材料 (1/3) 软件说明

Author: release. Date: 2026-10-15; **revised 2026-10-16 for the typed clue (D-2): function 3 and function 6 below; the source counts in section 3 and `source-excerpt.txt` were regenerated from the D-2 build (84c6881) on 2026-10-16.** **Submitting a 软著 is a legal filing: founder only, optional (constitution Art. 5.4).** Is it needed? Not for this game on the WeChat IAA route (zzsh-iaa.html: only if the name has English or 软件, or brands / public figures are involved). Reasons to do it anyway: proof of authorship for a game that is easy to clone; a store or platform that later asks. Registration is at 中国版权保护中心 (www.ccopyright.cn); typical lead time about 30 working days (about 3 for the expedited route, paid) [VERIFY, not an official WeChat page].

Placeholders marked 【FOUNDER】 are the company's own data.

## 1. Basic information (登记表)

| Field | Value |
|---|---|
| 软件全称 | 群友刻度盘游戏软件 (the name on the 软著 may add 软件; keep the registered game name 群友刻度盘 inside it) |
| 软件简称 | 群友刻度盘 |
| 版本号 | V1.0.0 (the client's `appVersion` in `js/build-config.js` is `1.0.0`) |
| 软件分类 | 应用软件 |
| 开发完成日期 | `【2026-10-15 or the founder's date; the build is code-complete as of this pack】` |
| 首次发表日期 | `【FOUNDER: the release date, or 未发表 if filing before release】` |
| 发表状态 | 未发表 / 已发表 (match the date above) |
| 开发方式 | 原创 (all code and all content written by the studio; no third-party game assets, no Wavelength or other games' content) |
| 著作权人 | `【FOUNDER: 企业全称 (the Beijing company)】`, 统一社会信用代码 `【FOUNDER】` |
| 权利取得方式 | 原始取得 |
| 权利范围 | 全部权利 |
| 联系人、电话、地址 | `【FOUNDER】` |

## 2. Technical description (软件说明书 summary: paste into the "软件功能与特点" fields)

**开发的硬件环境:** 通用 PC (Windows 11 / macOS), 内存 8 GB 以上, 硬盘 10 GB 以上。
**运行的硬件环境:** 运行微信 App 的智能手机 (iOS / Android), 内存 2 GB 以上; 也可在 PC 版、Mac 版微信运行。服务端运行在腾讯云微信云开发 (云函数 + 云数据库)。
**开发该软件的操作系统:** Windows 11。
**软件开发环境 / 开发工具:** 微信开发者工具 (小游戏项目, 基础库 3.8.8 及以上), Node.js 24, Visual Studio Code, node:test 测试框架。
**该软件的运行平台 / 操作系统:** 微信 (iOS 与 Android 客户端, 小游戏运行环境); 服务端 Node.js 云函数运行环境 (微信云开发)。
**软件运行支撑环境 / 支持软件:** 微信小游戏运行时 (Canvas 2D、开放数据域、云开发 SDK `wx-server-sdk`)。
**编程语言:** JavaScript (ECMAScript 2020, CommonJS 模块)。
**源程序量:** about 17,300 physical lines of source code, see the table below (excluding the 9,547 lines of content data and 12,765 lines of automated tests).
**开发目的:** 为大众提供一款每日约一分钟的休闲小游戏: 通过日常事物的“刻度”观点对比, 让玩家与全国玩家和同群好友比较想法的接近程度, 增进群聊互动。
**面向领域 / 行业:** 休闲游戏、社交娱乐。
**软件的主要功能:**
1. 每日刻度: 每天五张卡, 玩家拖动指针选择位置并确认, 服务器记录并即时揭晓全国参考位置、得分和评语, 汇总为当日默契分和档位; 次日 00:30 定分并给出超过全国玩家的百分比。
2. 本群与好友榜: 从群聊卡片进入后统计本群默契度、群内排名、近 7 天走势和“最同频”好友; 好友榜按全国默契分排序; 昵称头像仅在微信开放数据域内显示。
3. 出题: 玩家设定隐藏位置并给出提示 (默认自己写不超过 12 个汉字的短提示, 经本地规则检查、服务端复核和微信内容安全服务审核后才展示; 也可从六个预设提示词中选一个), 发出题目, 群友猜测, 满足条件时揭晓并计算本题默契值与“最懂你”; 群友可举报提示 (立即隐藏), 多次违规的玩家被暂时限制写提示。
4. 往期刻度: 回看和练习任意已结束的日期, 不计入排名。
5. 附加功能: 加一题、全国分布 (激励视频广告); 往期练习间插屏广告; 连续天数; 大字模式与高对比度; “刻度题揭晓了”订阅消息; 题目问题反馈。
6. 服务端: 云函数 (每日出题、提交答案、定分、群与好友榜、出题与揭晓、订阅消息发送、提示审核与举报处理、管理后台、数据清理等), 数据集合, 4 个定时触发器; 所有集合仅云函数可读写。数量: 改版前为 21 个云函数 / 17 个集合 (此前文档写作 16 个集合, 为笔误); 改版后 (已按代码核对, 2026-10-16) 为 24 个云函数 (含 `agreeRules`、`reportClue`、`admin`) / 21 个集合。
**技术特点:** 客户端与服务端共用同一套纯 JavaScript 计分与规则代码, 包括提示文字规则模块 (一致性测试覆盖); 用户输入的提示先审后展示, 无法确认即不展示 (接入微信小游戏文本内容安全识别); 服务端为所有竞争性结果的唯一依据; 时区与窗口以服务器时间为准; 全部界面由代码在 Canvas 上绘制, 无第三方图片素材; 数百项自动化测试（客户端 439 项通过、云函数 223 项通过）。

## 3. Source size (real counts, 2026-10-16, commit 84c68819a0e55c013bdeec5c2c00596d98277acb; the pre-D-2 counts at c49019f were 13,463 program lines)

Physical lines (`wc -l`), tests, generated and content data excluded unless stated:

| Part | Path | Lines |
|---|---|---|
| Entry | `apps/kedupan/game/game.js` | 1 |
| Core logic (scoring, windows, groups, rounds, schedule, service, typed-clue rules, moderation, strikes) | `game/core/*.js` | 3,455 |
| Client logic (controller, flows, api, share, privacy, ads, analytics, store, vm) | `game/js/*.js`, `game/js/flows/*.js` (includes 1,439 lines of dev-only mock server and stub renderer) | 6,759 |
| Renderers (canvas drawing) | `game/js/render/*.js` | 3,966 |
| Open data domain | `game/opendata/*.js` | 711 |
| Cloud functions: shared | `cloudfunctions/common/*.js` | 1,093 |
| Cloud functions: 24 function entry files | `cloudfunctions/*/index.js` | 1,274 |
| **Subtotal: program source** | | **17,259** |
| Content data (304 spectra, 4,142 items; answer key; schedule; forbidden list; typed-clue blocklist and clue words) | `game/core/content/*.js` | 9,547 |
| Automated tests | `game/tests`, `cloudfunctions/tests` | 12,765 |
| Build tools | `game/tools/*.js`, `cloudfunctions/scripts/*.js` | 437 |

Basis of the excerpt in `source-excerpt.txt`: 104 files, 15,456 non-blank lines after wrapping at 100 columns, 310 full pages at 50 lines (60 printed: the first 30 and the last 30).

## 4. Declarations the founder makes (legal)
- The work is original and was written for the company (employer/commissioned work: `【FOUNDER: confirm the studio's agents' output is assigned to the company; legal review recommended, since the code and text were produced with AI assistance. The 中国版权保护中心 asks the applicant to attest authorship】`).
- Provenance note for the registrar if asked: the question bank text is AI-assisted and human-reviewed (see `docs/kedupan/content-review.md`; the human review is HANDOFF section 1).

## 5. Files to submit
1. This description (fields above), 2. `user-manual.md` converted to PDF, 3. `source-excerpt.txt` converted to PDF (60 pages: first 30 and last 30 pages, 50 lines per page, header on every page), 4. the company's 营业执照 and the 申请人 identity documents `【FOUNDER】`.

How to regenerate the excerpt (read-only on the source): `node docs/kedupan/release/softcopyright/tools/gen-source-excerpt.js --stats`. Convert to PDF: paste into Word/WPS, font 宋体 or Consolas 9 pt, A4, one page per 50 lines (the file already contains a form feed between pages), header as printed on each page.
