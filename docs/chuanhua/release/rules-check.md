# 传画接龙: release rules check

Author: release. Date: 2026-10-16 (refreshed for spec rev. 2.1; first written 2026-10-15). Build: `kept-ideas/v1` at commit `a8a86d3e534015a364d5263d21be20685318bef7` (CTO final review and sign-off DONE 2026-10-15 (rev. 2) and 2026-10-16 (rev. 2.1, TD-153)), spec rev. 2.1 (up to 5 换一批 per pick; QA `qa/rev2.1-report.md`: all AC pass). **QA status: QA rev. 3 gate passed: 0 FAIL, 148 PASS, 7 DEVICE (AC 32, 36, 50, 68, 99, 148, 155), 8 REMOVED-verified; QA-R3-1 fixed after the gate (TD-148)** (`docs/chuanhua/qa/ac-matrix.md`). Read-only check; nothing uploaded, filed or deployed.
Legend: **PASS** = satisfied, evidence given. **ACTION** = something must still be done (owner given). **NEEDS-FOUNDER** = only the founder / counsel can provide it.

Source keys: **[OP]** 运营规范 https://developers.weixin.qq.com/minigame/product/ ; **[IAA]** .../minigame/introduction/guide/iaa.html ; **[ZZ]** .../guide/zzsh-iaa.html ; **[NRJS]** .../guide/nrjs.html ; **[XCXBA]** .../guide/xcxba.html ; **[PRIV]** .../guide/privacy.html ; **[SLTS]** .../guide/slts.html ; **[ZXB]** .../guide/zxbsm.html ; **[PKG]** https://developers.weixin.qq.com/minigame/dev/guide/base-ability/code-package.html ; **[MC]** https://developers.weixin.qq.com/minigame/dev/api-backend/wxa-sec-check/api_gamesecurity.mediacheck.html ; **[MNB]** 《未成年人网络保护条例》 https://www.gov.cn/zhengce/content/202310/content_6911288.htm ; **[CAC18]** https://www.cac.gov.cn/2018-11/15/c_1123716072.htm ; **[SPEC]** `docs/chuanhua/spec.md` ; **[TD]** `docs/chuanhua/decisions.md`. All WeChat pages fetched 2026-10-15; the 运营规范 page has no version date.

## Summary

| Area | Result |
|---|---|
| WeChat UGC rules (content security, reports, takedown, minors) | PASS by design (sync pre-moderation, fail closed, reports, takedown, kill switches); ACTION: **V16 / 750031 device proof**, named ops owner (H9), H13 prompt review |
| Category and qualifications | NEEDS-FOUNDER: console 所需资质 screenshot (UGC check) |
| 版号 | PASS (not needed: IAA, no IAP); 小游戏备案 replaces it |
| 适龄提示 | ACTION: founder sets **12+** (recommendation, section 2.1) |
| 健康游戏忠告 | NEEDS-FOUNDER (device D21 check of the platform splash) |
| 防沉迷 / 实名 | PASS (platform-integrated for no-payment games) |
| 诱导分享 | PASS (one note on 5.1.8, 3.3) |
| Ads | PASS (design); ACTION: ad units after 流量主, device D12 |
| Virtual payment / iOS | PASS (none) |
| Privacy | PASS (text ready, 4 wording gaps, no code mismatch); NEEDS-FOUNDER: enter guide, enable popup |
| Package size | PASS: **831,193 bytes = 0.793 MiB of 4 MB (81 files)** |
| Licences (fonts, assets, prompts) | PASS; AIGC and counsel items NEEDS-FOUNDER (H10) |
| 用户协议 | **DRAFT, not approved**: 8 placeholders and the draft line; NEEDS-FOUNDER |
| Secrets | PASS |
| Release build | PASS with PASS; the 3 ACTION items A1-A3 are closed (section 11) |

## 1. WeChat UGC rules and moderation

All checks cite [OP] numbers from the page read today.

| # | Item | Result | Evidence and source |
|---|---|---|---|
| 1.1 | **Content security API on all user text and images** ([OP] 5.18: "必须调用内容安全检测接口校验文本/图片是否含有敏感内容"; 5.18.1 a UGC product with no filter is a violation; 小游戏 2.7.1 "需具备内容安全管控机制"; 10.2 filter mechanism) | PASS by design; ACTION (device) | Every drawing is rasterised server-side and checked with the **game** `mediaCheckSync` ([MC]: sync, usually ≤ 3 s, 5 s timeout, 2,000/min and 200,000/day per AppID) and every sentence / custom prompt with the game `msgSecCheck`, **before anyone else sees it**; error, timeout, quota, upload failure or unknown verdict = not delivered (fail closed) (spec §6.1-6.3, `moderation-sync.test.js`, QA matrix "No user content before a pass"). Local blocklist + text rules run first. **Not yet proven against the real platform:** V16 (cloud-call name `wxa.game.contentSpam.mediaCheckSync`, error **750031** "该游戏不支持，需联系小游戏侧配置", pre-publish quota, latency) is device item **D1**. If 750031 appears the code switches itself to `imageMode: async` (live rooms off) and logs `[ALERT]`; the founder asks WeChat to enable the interface ([MC]: the doc says only "需联系小游戏侧配置", no self-service step), then `setModeration sync`. |
| 1.2 | **Pre-publish quota** | NEEDS-FOUNDER (device) | Not stated by [MC] for unpublished AppIDs. Dev budgets `MOD_TEXT_DAILY_BUDGET` 80 / `MOD_IMAGE_DAILY_BUDGET` 200 apply only in dev + live; beyond them fail closed. Record the real limit at D1. |
| 1.3 | **Report / complaint channel** ([OP] 10.3 "需提供及时回应的机制"; 小游戏 4.1 "便捷、有效的用户服务和投诉渠道"; 3.10 infringement complaints; [MNB] art. 7 "建立便捷、合理、有效的投诉、举报渠道") | PASS | In-game 举报 on every user-content surface with five fixed reasons (no free text, so reports create no new UGC); **hides for everyone at once**; limits 10/day, one per item, never reveals the reporter (spec §7.1; TD-119, TD-139, TD-140 live-round `reportRef`; QA "Live-round reporting" PASS). Also 设置 -> 反馈 (WeChat feedback component) and the agreement §十四 contact; the capsule's WeChat 投诉 is referenced by the agreement §五.6 (device check D21). Room teaser (non-members) reports via WeChat 投诉 only (TD-139(2)). |
| 1.4 | **Takedown ability and response** ([OP] 10.4 "对小程序内容安全承担主要责任"; 10.5 routine self-inspection) | PASS by design; NEEDS-FOUNDER (H9) | Console-only `admin` function: `listReports`, `getStep`, `sample`, `upholdReport`, `dismissReport`, `hideStep`, `restoreStep`, `removeChain`, `removeRoom`, `restrict`, `liftRestriction`, `setUgc`, `setModeration`, all audited. `modSweeper` logs `[ALERT]` for an open report older than 48 h. **A named human must run `listReports` and `sample 20` daily for the first 4 weeks** (HANDOFF 7; WeChat's own content-security page says the API does not replace human spot checks and recommends sampling passes: https://developers.weixin.qq.com/miniprogram/en/security/content/security.html). No ops owner = reported content is still hidden at once but restores and strikes lag. |
| 1.5 | **Repeat offenders** | PASS | Strikes per `risky` verdict and upheld report (30-day window): 1 warning sheet, 2 -> 24 h, 3 -> 7 d, ≥ 4 -> 30 d + admin review; restricted players cannot create, join, claim or send but can open reveals, 我的接龙, 设置 (spec §7.3; agreement §六). |
| 1.6 | **Kill switches** | PASS | `createEnabled` / `viewEnabled` (take effect within 10 s), circuit breaker (≥ 50% of ≥ 20 calls over 5 min pauses creation 15 min), image quota alert 70% and `UGC_BUSY` at 95% (spec §6.7-6.8). |
| 1.7 | **Service category matches the features; qualifications** | NEEDS-FOUNDER | 游戏 > 休闲 > 益智 (fallback 答题 / closest), **情况二** (no payment now or later), no payment qualification ([ZZ]). [ZZ] and the 备案 pages say **nothing** about UGC, 社交 or 社区 categories; the console's 添加类目 screen shows the real 所需资质 list. **Founder screenshots it (HANDOFF 0, step 5)**; if it asks for anything beyond the IAA route (e.g. 网络文化经营许可证, 增值电信业务经营许可证), stop and send it to the CTO. Do not choose a 社交/社区/内容 category. |
| 1.8 | **Minors, UGC side** ([MNB] art. 22 harmful content to minors prohibited; art. 26 cyberbullying: providers must have early-warning, identification and handling mechanisms and protective options such as "屏蔽陌生用户、限制可见范围"; art. 29 manage user-published information, stop transmission, warn / restrict) | PASS by design; counsel H10 | No contact surface: no names, avatars, chat, DMs, friend requests, public feed or stranger matching; lobbies show numbered seats; text cannot carry ≥ 5-digit numbers, URLs or contact words; group-only reach and participant-only reveals; share images carry no UGC; no night-time pushes (spec §7.6). Counsel question H10: whether the 防沉迷 / 未成年人模式 duties of [MNB] arts. 42-43 apply to a no-payment IAA game beyond what the platform integrates (see 2.3). |
| 1.9 | **Safe-by-default prompt bank** (content of the 2,042 active prompts) | **ACTION: H13** | AI-drafted and independently AI-reviewed (368 FIX/DROP applied, `content-fixes-v2.md`); **no human has reviewed it** (`content-review.md` §5.4 "NOT DONE"). The release must not ship before the founder or a delegate reads **every** prompt and signs §5.5; the agreement's §一.12 placeholder depends on it (section 10). |
| 1.10 | **Safety (CAC 2018 assessment)** | NEEDS-FOUNDER (counsel) | [CAC18] Art. 2 names "论坛、…通讯群组、…小程序等…或者附设相应功能"; Art. 3 requires a self-assessment when such a service goes live; Art. 7 the report goes to the city-level cyberspace and public-security authorities before launch. It names neither games nor UGC; applicability to a group-bound drawing game with no public surface is a legal judgement. Facts for counsel: this section, spec §6-§7, `beian.md` section 4 (U3). |
| 1.11 | **AIGC** (constitution Art. 9.2; 《人工智能生成合成内容标识办法》, in force 2025-09-01, https://www.cac.gov.cn/2025-03/14/c_1743654685899683.htm ) | NEEDS-FOUNDER (counsel H10) | Players get **no** generative feature; the preset prompts are static text, AI-drafted, human-approved after H13. The Measures bind providers of generation/synthesis services and ask for labels when generated content can be downloaded, copied or exported; our working view (INFERENCE) is that a fixed, human-approved list is not caught. The agreement states the AI-assisted drafting honestly (§一.12). Counsel confirms. The 软著 authorship attestation (HANDOFF 8) is a separate legal item. |
| 1.12 | **No inducing / misleading UI and content** ([OP] 2.1.x, 6.1.x) | PASS | Name, intro, avatar and listing describe the real game; no "最", "第一", "官方", "免费", "唯一", prizes or rewards-for-sharing in name, intro, listing, share titles or agreement (`registration/rules.md` §2.1 scan plus `store-listing.md`). No 今日起点 anywhere in registration or listing. |
| 1.13 | **Originality and no clone** ([OP] 1.3, 2.8.1) | PASS | The mechanic is folk (the telephone game); UI, name, lobby, reveal (final step first, one note at a time) and prompts are original; art drawn in code; no Gartic Phone / Telestrations names or look (direction §7). H10 search in WeChat and Douyin for clones is informational (HANDOFF 0). |

## 2. Age rating, 健康游戏忠告, 防沉迷

### 2.1 适龄提示: recommendation **12+**

Where: MP -> 设置 -> 基础设置 -> 基本信息 -> 适龄提示, then submit for review; once approved the icon appears on the startup page at the right of the 健康游戏忠告 [SLTS]. [NRJS] Q2 lists "适龄提示未设置或者未通过" as a 小游戏备案 rejection reason, and [IAA] puts it before 资质审核, so **do it first**.

What [SLTS] says (verbatim, fetched 2026-10-15; the page does not mention UGC, drawing or group chat by name):
- **8+:** "游戏画面简约，以卡通和手绘风格为主"; no adaptation of historical or real events; simple, non-realistic competition; social: "游戏中不存在基于文字、语音、图片等自由交流的陌生人社交系统，可存在简单的好友系统。"
- **12+:** visuals cartoon / anime / hand-drawn, not realistic; social: "游戏中可存在基于文字、语音、图片等自由交流的陌生人社交系统，但社交系统的管理应遵循相关法律法规。"
- **16+:** 3D realistic visuals, large-scale adaptation, etc.

Decision (release, for the founder to confirm):
- **Visuals** (flat hand-drawn UI, player doodles), **content** (everyday absurd prompts, nothing historical or real) and **competition** (none: no scores, ranks or winners) are inside **8+**.
- The deciding point is **social**. 传画接龙 lets up to 10 members of one WeChat group exchange **free-form images (drawings) and free text (a sentence of up to 16 characters, plus custom prompts)**. It is not a stranger-matching system, but a WeChat group is not a "simple friend system": its members can be acquaintances of acquaintances, and the 8+ sentence excludes free image/text exchange with anyone who is not a friend. The 12+ wording is the first level that explicitly allows free text/image exchange "but the management of the social system must follow the laws", which is exactly where this game's pre-moderation, reports, strikes and takedown sit (section 1).
- Therefore: **recommend 12+**. 16+ is not justified (no realistic visuals, no stranger matching). **8+ is arguable** if the founder holds that a closed group is a friend system, but it is the riskier statement: a mismatch between the declared age and the product's free image/text exchange can be challenged in 备案 or review. The founder confirms the band; review follows. 12+ costs nothing in features: the rating is a notice, not an access block, and the game already treats every player as a possible minor (spec §7.6).
- Also relevant: [MNB] art. 47 requires game providers to implement 适龄提示 (displayed on the download/register/login interface; for a mini game the platform's startup page does it).

### 2.2 健康游戏忠告 ([OP] 2.6.2: "在游戏开始前，必须在画面的显著位置全文登载《健康游戏忠告》")

NEEDS-FOUNDER (device). The text is "抵制不良游戏，拒绝盗版游戏。注意自我保护，谨防受骗上当。适度游戏益脑，沉迷游戏伤身。合理安排时间，享受健康生活。" For 小游戏 the platform shows it on the splash and, after 适龄提示 is approved, the age icon to its right [SLTS]. The game draws no such screen and needs none [VERIFY]. Check on the device pass (D21); that screenshot is the first 备案 screenshot. If it is not shown, tell the CTO. [OP] 2.6.1 (the approval-number page) applies to games with 版号 / publisher approval: n/a.

### 2.3 防沉迷 / 实名 ([OP] 6.1; [ZXB])

PASS. [ZXB]: "不开通虚拟支付，平台已统一协助接入中宣实名系统，无需开发者操作"; only games with virtual payment register in the 中宣部 system themselves. No payment, no account; a game lasts about 2.5-4.5 minutes and is capped at 20; allowances: 10 rooms created, 30 joined, 80 turns a day (spec §3.9) and no streak rewards; no night-time pushes. Residual: whether [MNB] arts. 42-43 (anti-addiction system, 未成年人模式) need anything more from a no-payment IAA game is counsel item H10 (V13).

## 3. 诱导分享 and sharing

| # | Item | Result | Evidence and source |
|---|---|---|---|
| 3.1 | **Forced sharing** ([OP] 5.1.1 "分享后才能继续下一步操作") | PASS | No feature depends on a share; joining a room never requires sharing (spec §9; QA "Sharing, ads": all shipped strings and every share tap checked, allowances unchanged). |
| 3.2 | **Implied sharing, red dots, rewards for sharing** (5.1.2, 5.1.3, 5.1.4, 5.28) | PASS | Nothing is granted for sharing, inviting or group size; `wxad_fallback_share=1` grants nothing; the red dot on 我的接龙 marks an unseen reveal, not a share prompt; the 分享 buttons are static; rewarded ads use `disableFallbackSharePage: true`. |
| 3.3 | **Team sharing capped at 5** ([OP] 5.1.8 "组队分享的参与总人数须限制在5人内") | PASS with note | The rule sits in the 诱导分享 list and concerns sharing that yields a benefit; 传画接龙 rooms hold 3-10 players but **no benefit attaches to sharing or group size** (agreement §十一, spec §9). Note for the device pass: if a reviewer reads 5.1.8 literally as a cap on any team-up share, the answer is the absence of any reward; lowering `room.maxPlayers` to 5 is a config change if ever required. |
| 3.4 | **Share card content relates to the game** ([OP] 2.9.1) | PASS | Cards are our art + "一起传画 · 一局约 3 分钟" / progress dots / one passed text line; **no user drawing, no prompt on the invite card**; titles are factual (`screenshots/share-*.png`). A reveal card may carry a passed prompt and final sentence; TD-141 re-fetches and falls back to a text-free title if the sentence is hidden or in doubt (QA-R2-6 fixed, pending re-verification). |

## 4. 版号 [NRJS, ZZ, IAA, OP 3.1]

| # | Item | Result | Source |
|---|---|---|---|
| 4.1 | **版号 not needed** (IAA, no IAP, no virtual payment) | PASS | [NRJS] Q8: 情况二 is "小游戏当前及未来均不需要开通虚拟支付"; submitting 情况一 without a 版号 "就可能因为缺少必要的版号材料" triggers a new qualification review, so 情况一 is the 版号 route and 情况二 the no-版号 route; Q5: a game that already holds a 版号 "暂无需提交小游戏备案". [ZZ]: IAA chooses 情况二, "do not apply for a payment qualification"; the page never mentions 版号. [OP] 3.1: only games approved for online publishing may offer virtual-item payment, which we never do. **The route replaces the 版号 with 小游戏备案** ([NRJS]: "是IAA游戏备案前置审批中的一个环节"). The pages do not state "no 版号" in one sentence; if the platform ever asks, 开发者助手 confirms. |
| 4.2 | 小游戏备案 + 小程序备案 | ACTION (founder) | HANDOFF 4, `beian.md`: 10-20 + 10-30 working days. Release needs the 备案号. |
| 4.3 | 软著 | PASS (not required) | [ZZ]: only if the name contains English or "软件", or brands / public figures are involved. None. Materials ready (`softcopyright/`), optional. |
| 4.4 | 认证 | ACTION (founder) | 300 RMB; needed for 备案 and 流量主. |

## 5. Ads

| # | Item | Result | Evidence and source |
|---|---|---|---|
| 5.1 | **Ads do not cover or interrupt play** ([OP] 2.10.1, 2.10.2, 5.34) | PASS (design); device D12 | No ad in the lobby, room entry, pick, draw, describe, round wait, chain entry, or between steps of a step-through (spec §11, AC 106/163; QA ran a whole live game on stub ads). Interstitial only on leaving a reveal: not before the player's 3rd lifetime reveal, ≥ 180 s apart, ≤ 3 per day (client floors TD-143 and core clamps TD-146); banner only on 本群接龙 / 我的接龙, **default off**, ≥ 24 pt gap; 今日彩笔 reward only in 设置; 再开一条 reward only on the 慢慢传 start-limit sheet (≤ 2/day). No ad button sits beside 画好了, 传出去, 接这一棒, 加入这一局, 开始 or 举报. |
| 5.2 | **No misleading clicks, reward on completion only** | PASS | Reward only on `isEnded`; one no-fill grant per placement per day; ad buttons labelled ▶ / 视频; `disableFallbackSharePage: true`; ad errors 2001-2003 skipped silently. |
| 5.3 | **Ad units** | ACTION | `adUnits` empty in `js/build-config.js` (no-fill behaviour, no stub in a release). 流量主 opens when any one of: cumulative UV > 500 (no fake traffic); game circle + 5 posts; a same-company mini program earning continuously for a quarter (ad docs read by the sister packs; re-check in the console). Founder: HANDOFF 10. |
| 5.4 | **Do not click your own ads** | note | 流量主 violation; view only during D12. |

## 6. Virtual goods / payment / iOS

PASS (none). No IAP, no currency, no paid randomness, no payment API; rewards are cosmetic (今日彩笔) or an extra daily 慢慢传 start and have no cash value (agreement §十一). [OP] 3.1-3.3 and the iOS restriction apply to games that sell virtual items; n/a.

## 7. Privacy

| # | Item | Result | Evidence |
|---|---|---|---|
| 7.1 | Guide covers every privacy API used | PASS (text ready) | `privacy-guide.md`: audit of every `wx` call; **no Table 1 standard item is used**; 12 custom items (OpenID, group id, drawings, text, room presence, roll history, moderation/strikes, reports, game records, subscribe, feedback, usage log). |
| 7.2 | Guide entered, official popup enabled | NEEDS-FOUNDER | HANDOFF 3. Without it the in-game guide link has nothing to open. |
| 7.3 | No forced authorization (OP 5.12.x) | PASS; device D16 | No popup at launch or in a turn; `requirePrivacy` only from a tap after a 104 on the group-entry call; refusal never blocks play. |
| 7.4 | Data minimal | PASS | No nickname, avatar, phone, location, album, clipboard; `installId` never leaves the device. |
| 7.5 | Retention 180 days in text and code | PASS | `cleanup` covers rooms, chains, steps, PNGs, mod logs, reports, players, groups, events; signals 1 day. |
| 7.6 | Mismatches | informational | 4 wording gaps, no code mismatch (`privacy-guide.md` section 4). |

## 8. Package size (measured)

Method: `git archive` of `apps/chuanhua` and `docs/chuanhua` at a8a86d3e534015a364d5263d21be20685318bef7 into a scratch folder outside the repo, the agreement replaced by a **final-agreement stub** (draft line removed, all placeholders filled with dummy values; same text and length as the real one apart from those values), `node tools/build-terms.js --release` (passed: 149 paragraphs), `node tools/release-config.js --env chuanhua-prod --appid wx0123456789abcdef --prefixed-functions` (release mode; `cloudEnv`, `fnPrefix = 'chuanhua_'`, `stubAds = false`; ignore list gains `js/mock-server.js`, `js/stub-render.js`, `core/prompts.js`, `core/content/prompts.v1.js`, `core/content/prompts.v2.js`), then summed every file not matched by `packOptions.ignore`. `project.private.config.json` is git-ignored and absent from the copy. Limits [PKG]: main package **4 MB**, each subpackage unlimited, total **30 MB**. The game uses **no subpackage**.

| Measure | Bytes | MiB |
|---|---|---|
| **Release package (main package, 81 files)** | **831,193** | **0.793** (19.8% of 4 MiB) |
| of which `js/` (client logic incl. `terms-text.js` 26,323; without `js/render/`) | 306,322 | 0.292 |
| of which `js/render/` | 229,659 | 0.219 |
| of which `core/` (no prompt bank) | 184,662 | 0.176 |
| of which `assets/` (2 share fallback PNGs, `tick.mp3`) | 108,365 | 0.103 |
| Dev-only files removed by the switch | mock 90,567 + stub 3,705 | |

Prompt bank check: 1,680 active prompts of 4+ characters, **0 hits** in the 81 shipped files (the bank is server-only, TD-103). **Result: PASS.** Cloud functions are not part of the package. QA's figure (773.9 KB, 81 files, rev. 3) used a smaller stub agreement; the same 81 files.

Tests (final build, a8a86d3): `npm test` in `apps/chuanhua/game` in the real tree (dev mode): **542 tests, 532 pass, 0 fail, 10 skipped, 0 todo**; `npm test` in `apps/chuanhua/cloudfunctions`: **402 tests, 402 pass, 0 fail, 0 skipped, 0 todo**; `npm test` in `game` on the release-mode scratch copy above (real AppID switch applied, stub agreement): **542 tests, 529 pass, 0 fail, 13 skipped (dev-only assertions), 0 todo** (the copy needs `apps/kedupan/game/project.config.json` and the root `.gitignore` for two tests that read them; without them 1 test fails as a copy artefact).

## 9. Licences: fonts, assets, prompts

| Item | Verdict | Evidence |
|---|---|---|
| Fonts | PASS | **No font file ships**; all text uses the phone's system font. The avatar contains no text. Noto Sans SC (SIL OFL) is used only by the dev preview renderer on this machine for screenshots and is not redistributed. |
| Images | PASS | `assets/share-fallback.png`, `share-fallback-room.png`, the avatar and all UI art are generated by the studio's own code (`tools/assets/build-assets.js`, resvg/canvas); no third-party art, no AI art. |
| Sound | PASS | `assets/tick.mp3` is synthesized by `build-assets.js` (a 1,320 Hz tone, 0.12 s); no samples. |
| Prompt bank (2,042 active) | PASS for originality; **ACTION: H13** for review | Wording is original (no Gartic Phone / Telestrations / web lists consulted; `content-review.md` §5.6), fairy tales from public-domain sources, no brands or copyrighted characters (17 look-alikes retired). |
| Third-party code | PASS | Game and cloud functions use only the platform SDKs (`wx`, `wx-server-sdk`); dev tools (`@napi-rs/canvas`, `lamejs`) are not shipped. |

## 10. 用户协议 (agreement) status

**DRAFT, rev. 3, not approved.** `user-agreement.txt` still begins with the 【草稿…】 line and has these placeholders (all fixed by the founder or counsel, `user-agreement.md` "Placeholders"):

| Placeholder | Where | Fill with |
|---|---|---|
| 【生效日期】 (twice) | version line | the date the approved text takes effect (also "updated") |
| 【运营主体名称】 (twice) | preamble, §十四 | the full legal name of the company that owns the AppID |
| 【联系邮箱】 (twice) | §十 item 4, §十四 | a monitored email (same as the privacy guide's contact) |
| 【运营主体注册地址】 | §十四 | its registered address |
| 【运营主体所在地】 | §十五 item 2 | the district whose court has jurisdiction, e.g. 北京市某区 |
| 【H13 审核完成后填入：并经人工逐条审核修改】 | §一.12 | **only after H13 is signed**, replace with 并经人工逐条审核修改 (otherwise the AI-drafting sentence must stay without it: the claim would be false) |

`build-terms.js --release` and `release-config.js --env` both **refuse** while the draft line or any 【…】 (other than the style marker 【重要】) remains; verified (exit 1, 9 problems listed). Approval is the founder's or counsel's legal act (constitution Art. 5.4); the release engineer does not change the text. After any wording change that alters rights, duties, retention, the violation ladder or the dispute clause: bump `rulesVersion` in `core/config.js` (RELEASE.md). A contact detail or date is not a material change. Nothing was published yet, so rev. 3 needs no further bump.

## 11. Release-build ACTION items (found by running the release switch on a temp copy)

| ID | Owner | Finding |
|---|---|---|
| **A1** | CTO | **CLOSED.** `tools/release-config.js --appid <wx...>` validates `wx` + 16 lowercase hex, writes it in release mode only, warns while the test AppID is kept, and `--dev` restores `wxcd03c1b62d7eb0e0` byte for byte. The two tests that asserted the test AppID (`wechat-compat.test.js`, 2 assertions) are mode-aware through `checkAppId` in `tests/mode.js`. Evidence: `tests/release-flags.test.js`; temp-copy run with `--appid wx0123456789abcdef` then `--dev`: both files identical to the committed bytes (`cmp`), release-mode suite 530 tests, 516 pass, 0 fail, 13 skipped, 1 todo (TD-149). |
| **A2** | CTO | **CLOSED.** `--ad-rewarded` / `--ad-interstitial` (validated `adunit-...`) write `adUnits.rewarded` / `adUnits.interstitial` in `js/build-config.js` (the banner entry is left alone); `--dev` resets them. The banner id stays remote (`app_config.ads.banner.adUnitId`). Evidence: `tests/release-flags.test.js`, same temp-copy run. |
| **A3** | CTO | **CLOSED.** `--prefixed-functions` is the clear name; `--shared-test-env` is a deprecated alias (prints a note). Release mode always sets `fnPrefix = 'chuanhua_'`, because `npm run pack` always names functions `chuanhua_<name>`. `qa-release.test.js` now expects the prefix without any flag. |
| A4 | CTO | **CLOSED.** `game/RELEASE.md` now points at `apps/chuanhua/game/project.config.json` (and `REGISTRATION-STEPS.md` was fixed earlier). |
| A5 | CTO / QA | **CLOSED.** The QA matrix was re-verified at the rev. 3 gate (0 FAIL; QA-R2-1 to -10 closed or ruled, `qa/bugs.md`); QA-R3-1 was fixed after the gate (TD-148). |
| A6 | Founder | Everything marked NEEDS-FOUNDER above and in `release-checklist.md`. |

## 12. Secrets

**PASS.** Grep over `apps/chuanhua` and `docs/chuanhua` for `AppSecret`, `session_key`, `code2Session`, private-key headers, `MP_UPLOAD_KEY` finds only tests that assert absence and documentation text. The only `wx<16 hex>` AppID is the shared test AppID `wxcd03c1b62d7eb0e0`. No `.key`, `.pem` or `.env` file is tracked. `.gitignore` covers `project.private.config.json`, `cloudfunctions-deploy/`, `node_modules/`. Cloud functions read `GROUP_REF_PEPPER`, `PUSH_TOKEN`, `PUSH_AES_KEY`, `ADMIN_OPENIDS` from the environment only (`GROUP_REF_PEPPER` ≥ 32 characters enforced); the repo holds no values. There is no AppSecret anywhere (the HTTPS fallback of V16 would need one in the cloud console, never in the repo).

## 13. Device-only items (from QA, repeated in HANDOFF 6)

D1 to D20 of `qa/ac-matrix.md` (V16 first), plus **D21 (added by this pack): the launch splash shows 健康游戏忠告 and the 适龄提示 icon with the game name, and the capsule menu offers 投诉** (the QA list's own D17 is the 320-wide large-text check).
