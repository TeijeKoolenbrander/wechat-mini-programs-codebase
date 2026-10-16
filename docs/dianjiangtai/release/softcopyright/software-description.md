# 点将台: 软件著作权登记材料 (1/3) 软件说明

Author: release. Date: 2026-10-15. **Submitting a 软著 is a legal filing: founder only, optional (constitution Art. 5.4).** Is it needed? Not for this game on the WeChat IAA route (zzsh-iaa.html: only if the name has English or 软件, or brands / public figures are involved). The one soft spot: 点将台 uses historical figures of the 三国 period (public domain, no brand, no cooperation, no likeness); `registration/rules.md` 2.4 (D14) already notes that a reviewer who reads "公众人物" broadly may ask, so keep these materials ready. Reasons to do it anyway: proof of authorship for a game whose loop is easy to clone (direction §11 risk 1); a platform that later asks. Registration is at 中国版权保护中心 (www.ccopyright.cn); typical lead time about 30 working days (about 3 for the expedited, paid route) [VERIFY, not an official WeChat page].

Placeholders marked 【FOUNDER】 are the company's own data.

## 1. Basic information (登记表)

| Field | Value |
|---|---|
| 软件全称 | 点将台游戏软件 (the name on the 软著 may add 软件; keep the registered game name 点将台 inside it; if the accepted 名称 is a variant such as `点将台·三国`, ask the registry or the platform reviewer whether the 软著 name must match it exactly [VERIFY]) |
| 软件简称 | 点将台 |
| 版本号 | V1.0.0 (the client's `appVersion` in `js/build-config.js` is `1.0.0`) |
| 软件分类 | 应用软件 |
| 开发完成日期 | `【2026-10-15 or the founder's date; the v1 build is code-complete as of this pack】` |
| 首次发表日期 | `【FOUNDER: the release date, or 未发表 if filing before release】` |
| 发表状态 | 未发表 / 已发表 (match the date above) |
| 开发方式 | 原创 (all code written by the studio; no third-party game assets; no code or content copied from another game; the historical names and events are public-domain facts, the 智信仁勇严 stat values, the scoring formulas, the seal drawing code and all text are the studio's own) |
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
**源程序量:** about 13,070 physical lines of program source (see the table below), excluding 5,678 lines of roster content data, 10,928 lines of automated tests and 780 lines of dev-only mock and stub code.
**开发目的:** 为大众提供一款每日约一分钟的三国题材休闲策略小游戏: 玩家逐轮翻出势力与时代, 从对应历史武将中点选五员并安排职位, 由程序模拟十二场战斗评定战绩, 与好友、群友比较, 增进群聊互动。
**面向领域 / 行业:** 休闲游戏、社交娱乐。
**软件的主要功能:**
1. 每日军令与自由点将: 每日全体玩家令牌相同、每人一次 (服务器按轮发放令牌并校验); 自由点将不限局数, 可使用激励视频获得额外换令。每轮翻出势力 (魏、蜀、吴、群、晋) 与时代 (黄巾、群雄、赤壁、三分、归晋), 从 120 员历史武将中点选一员放入主公、军师、先锋、猛将、守将之一。
2. 战斗模拟与评定: 按智信仁勇严五项品评、职位适配、羁绊、阵营同心和随机事件 (奇谋、万夫莫敌、临阵生变) 模拟十二场战斗, 输出战绩、评级、逐场战报与评语; 复盘功能给出最佳阵容 (激励视频)。
3. 周日识人军令: 每周日的每日军令在出征前隐藏武将五德, 出征后“五德揭晓”。
4. 连续出征与往期: 服务器计算连续出征天数 (无任何奖励); 往期军令回看近 30 期。
5. 好友榜与群榜: 从群聊卡片进入后显示本群榜, 名次由服务器校验的战绩计算; 昵称头像仅在微信开放数据域内显示。
6. 同签挑战与分享: 把同一手令牌的战绩发给好友应战, 对比双方战绩与阵容; 可选的“好友接下了你的战书”订阅消息; 保存战报图片到相册 (点击后才请求权限)。
7. 大字模式与高对比度显示; 声音开关。
8. 服务端: 14 个云函数 (每日出题、开始与取令牌、提交与校验战绩、往期、复盘、挑战、群与好友榜、订阅消息、数据清理等), 17 个数据集合, 2 个定时触发器; 所有集合仅云函数可读写。
**技术特点:** 客户端与服务端共用同一套纯 JavaScript 规则与模拟代码 (一致性测试覆盖); 服务端为所有竞争性结果的唯一依据 (重放校验, 榜单不信任客户端上报); 种子化随机数使同一手令牌对所有玩家完全一致; 每日种子由离线生成并经门槛校验的种子库提供; 所有界面和印章头像由代码在 Canvas 上绘制, 无图片素材 (仅随包 4 个原创合成音效与 1 张分享兜底图); 379 项客户端自动化测试和 182 项云函数测试。

## 3. Source size (real counts, 2026-10-15, commit 3df1b89333d8d05b1d008ce57bfd29b2d1f46452)

Physical lines (`wc -l`), tests, generated files and content data excluded unless stated:

| Part | Path | Files | Lines |
|---|---|---|---|
| Entry | `apps/dianjiangtai/game/game.js` | 1 | 1 |
| Core logic (config, dates, seeded RNG, content access, draft rules, scoring, simulator, search, gates, validation, event catalogue) | `game/core/*.js` | 13 | 2,265 |
| Client logic (controller, view models, api, share, privacy, album, subscribe, ads, analytics, store) | `game/js/*.js` (the dev-only `mock-server.js` and `stub-render.js`, 780 lines, are not counted) | 18 | 3,919 |
| Renderers (canvas drawing, seal portraits, share card) | `game/js/render/*.js` | 17 | 4,267 |
| Open data domain | `game/opendata/*.js` | 4 | 566 |
| Cloud functions: shared helpers | `cloudfunctions/common/*.js` | 13 | 1,095 |
| Cloud functions: 14 function entry files | `cloudfunctions/*/index.js` | 14 | 961 |
| **Subtotal: program source** | | 80 | **13,074** |
| Content data (120 generals, texts; contentVersion 1 and 2) | `game/core/content/*.js` | 2 | 5,678 |
| Automated tests | `game/tests`, `cloudfunctions/tests` | 51 | 10,928 |
| Build tools | `game/tools/*.js`, `cloudfunctions/scripts/*.js` (preview tool another 688) | 8 | 1,216 |

Basis of the excerpt in `source-excerpt.txt`: 80 files, 13,037 non-blank lines after wrapping at 100 columns, 261 full pages at 50 lines, of which the first 30 and the last 30 pages are printed.

## 4. Declarations the founder makes (legal)
- The work is original and was written for the company (employer/commissioned work: `【FOUNDER: confirm the studio's agents' output is assigned to the company; legal review recommended, since the code and the roster text were produced with AI assistance. The 中国版权保护中心 asks the applicant to attest authorship】`).
- Provenance note for the registrar if asked: the roster text (blurbs, notes) is AI-assisted and was reviewed by the release agent (`../content-review.md`); a human reading is recommended (HANDOFF section 1). v1 contains no AI-generated image: the portraits are seals drawn by code (CTO-D1).
- The historical figures and events are public-domain facts from 《三国志》 and its commentary, 《后汉书》, 《晋书》, 《华阳国志》 and 《三国演义》 (all public domain); the registrar may ask how historical material is separated from original expression: the answer is in `core/content/generals.v2.js` (our own stat values, our own one-line notes, our own bond and narrative texts).

## 5. Files to submit
1. This description (fields above), 2. `user-manual.md` converted to PDF, 3. `source-excerpt.txt` converted to PDF (60 pages: first 30 + last 30, 50 lines per page, header on every page), 4. the company's 营业执照 and the 申请人 identity documents `【FOUNDER】`.

How to regenerate the excerpt (read-only on the source): `node docs/dianjiangtai/release/softcopyright/tools/gen-source-excerpt.js --stats`. Convert to PDF: paste into Word/WPS, font 宋体 or Consolas 9 pt, A4, one page per 50 lines (the file already contains a form feed between pages), header as printed on each page. Regenerate after any code change that lands before submission (the page count and the files listed change).
