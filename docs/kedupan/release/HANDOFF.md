# 群友刻度盘 (kedupan): Founder Handoff

Author: release, for the CTO. Date: 2026-10-15; **revised 2026-10-16 for the founder's typed-clue change (D-2, PD-31 to PD-40, spec rev. 984896c): hosts now type their own clue by default, presets are the second tab, 我在群里说 is removed, and the game gains 举报, strikes, console admin, 180-day retention, a 发言规则 sheet and a 《用户协议》; the age rating moves from 8+ to 12+.** The 2026-10-15 CTO sign-off covered the build before typed clues (`kept-ideas/v1` at commit `c49019f2e154b742aef1561665a5e5775ddef0df`); **D-2 reopened that build (TD-69). It was rebuilt, QA-passed and signed off again by the CTO on 2026-10-16: `kept-ideas/v1` at commit `84c68819a0e55c013bdeec5c2c00596d98277acb` (decision rows TD-93 and TD-94). Every figure below is this build's.** One ordered checklist of everything only you can do (constitution Art. 5, 6). For each step: values to paste, files, and what it unblocks. Agents have done none of it: no registration, filing, upload, deployment, payment or release.

> **AppIDs.** During development the game uses the **shared test AppID `wxcd03c1b62d7eb0e0`** (in `apps/kedupan/game/project.config.json`, per CLAUDE.md). The **release build switches to the game's own AppID**, which you create in section 0 and give to the CTO; it is recorded in `docs/kedupan/release/APPID.md` and written into the build with `--appid` (section 7). It is never committed into `project.config.json`. An AppID is public; **the AppSecret, the upload key and `GROUP_REF_PEPPER` are never pasted into chat or the repo.**

## Read this first: what is done, what blocks, how long it takes

- **Done and verified (D-2 build `84c6881`, CTO run 2026-10-16):** every acceptance criterion including the typed-clue ones (AC 83-101; QA report `docs/kedupan/qa/typed-clue-report.md`: all pass, fixes B1-B4 in) except the device-only ones (AC 41, 60, 65, E12, E13 and the keyboard items in section 5) and AC 10 (your content review; AC 67 is closed by this pack's privacy guide); `npm test` green: game **439 pass, 0 fail, 3 skipped** (442 tests; the same in release mode with the test-only switch, and `--dev` restores both files with no diff), cloud functions **223 pass, 0 fail**, `npm run sync && npm run check`: 24 functions, no drift; release package **832,349 bytes = 0.79 MiB of the 4 MB limit** (83 files); no secrets in the repo; release pack complete (`docs/kedupan/release/`).
- **Blocks release (only you can clear):** section 1 (content human review), section 0 (registration + 认证), section 3 (备案, the long pole), section 5 (device pass, now including E12 and E13), section 2 (privacy guide), 适龄提示 (**now 12+**), and the three typed-clue items: **H14** (section 4b: live moderation check), **H15** (section 2b: sign-off of the 发言规则 and 《用户协议》 wording, and the rewritten 备案 text) and **H16** (section 8b: who runs the report queue). The typed-clue build itself is finished, QA-passed (AC 83-101) and CTO-signed-off (2026-10-16); what stands between it and section 7 is only the founder items above. In particular **H15**: the build ships the DRAFT 《用户协议》 and `tools/release-config.js` refuses to make a release build until the final text (no DRAFT marker, no 【…】 placeholder) is in `user-agreement.txt`.
- **New with the typed clue (D-2), in one paragraph:** the clue step has two tabs, 自己写 (default; up to 12 Chinese characters, no digits, no position words, no end labels) and 选一个提示词. A typed clue is checked locally, re-checked on the server and then by WeChat's game text check; only an explicit pass is stored and shown (fail closed). Anyone can report a shown clue (it hides at once); strikes 1 warning / 2 -> 24 h / 3 -> 7 d / 4 or more -> 30 d restrict only the typed clue; you or a delegate run a console routine (`admin`); data is kept 180 days; the clue never appears on a share card. This makes the game a UGC product with a 12+ age rating, new privacy items, a 《用户协议》 and a new 备案 text.
- **Timeline (important):** 备案 is two sequential filings: 小游戏备案 10-20 working days, then 小程序备案 10-30 working days (about 4-10 weeks in total, official figures). The daily schedule inside the game assumes launch on **2026-11-01**. If you start now, launch will be later. Tell the CTO the real launch date as early as you can: the CTO regenerates the schedule (`post-release.md` §9), which is cheap before the build and costly after.
- **Order that saves time:** 0 -> start 认证 immediately -> **2b (approve the rules text and the 备案 service description: the 备案 text must now state the typed clue, so 备案 waits for it)** -> 备案 (3) as early as 2b allows (it runs in parallel with everything else) -> 1 (content review) in parallel -> 2, 4, **4b** -> 5 (incl. E12, E13) -> 6 (optional) -> 7 -> 8, **8b before launch**.

Files: all under `docs/kedupan/release/`: `registration/` (REGISTRATION-STEPS.md, copy.md, rules.md, avatar/), `privacy-guide.md`, `user-agreement.md` and `user-agreement.txt` (DRAFT, new), `beian.md`, `softcopyright/`, `store-listing.md`, `screenshots/` (re-rendered 2026-10-16 for the typed clue: 06, 07, 09, 10, 11, plus 12 to 16 and `share-round-typed-500x400.png`: 发言规则 sheet, 举报 sheet, hidden-clue screen, 设置, 《用户协议》 reader, typed-round share card; only the real launch splash is device-only, see `release-checklist.md`), `rules-check.md`, `build-upload.md`, `post-release.md`, `release-checklist.md`, `APPID.md`.

**Spec §16 items in this handoff:** H1, H2 -> 0; H3 -> 3; H4 -> 6; H5 -> 2; H6 -> 4; H7 -> 8; H8 -> 8; H9 -> 1; H10 -> 5; H11 -> 0; H12 -> 0b; H13 -> 7; **H14 -> 4b; H15 -> 2b (and 3); H16 -> 8b.**

---

## 0. Registration (copied from `registration/REGISTRATION-STEPS.md`; the long form is in that file)

Status: ready. Cost: **300 RMB for 微信认证** [MONEY], or 0 via the 公众号 quick path if it lets you choose 小游戏 [VERIFY]. Time: registration 15 min, 认证 1-3 working days, name/avatar/intro/category 20 min. 备案 (section 3) is separate.

**Before you start:** a **new email address used for this game only** (not registered on 公众平台/开放平台/企业号, not bound to a personal WeChat; do not reuse another game's address); the company's 营业执照 (colour original) and 统一社会信用代码; the administrator's real-name WeChat, phone and ID; for 对公打款 (if chosen) access to the corporate bank account (transfer within 10 days). Optionally search the name in WeChat/Douyin (spec H11).

**Step 1. Register the account** [CREDENTIAL, LEGAL]: https://mp.weixin.qq.com -> 立即注册.
| Field | Enter |
|---|---|
| 账号类型 | **小程序**, then **小游戏** (not 其他; **irreversible**) |
| 邮箱 / 密码 | the new email; your own password (never in chat) |
| 主体类型 | **企业** |
| 企业名称, 统一社会信用代码 | exactly as on the 营业执照 (check character by character; cannot be changed later) |
| 管理员 | the admin's real name, ID, phone; scan the QR code with the admin's WeChat |
| 验证方式 | **微信认证** (300 RMB) |

**Step 2. Get the AppID, give it to the CTO.** 开发管理 -> 开发设置 -> AppID. Send the CTO the AppID and the accepted name (not secrets). The CTO records it in `docs/kedupan/release/APPID.md`. **Never copy the AppSecret anywhere.**

**Step 3. 微信认证** [MONEY, LEGAL]: 设置 -> 微信认证; 300 RMB; 1-3 working days. Needs 营业执照, a 公函 signed by the legal representative and stamped with the **公章** (not 合同章/财务章/电子章), admin identity and a verification call. Unblocks: renaming, **both 备案 filings**, **流量主**, tester slots. Start today.

**Step 4. 基本信息** (首页 -> 小程序信息 -> 前往设置):
- 名称, try in order, keep the first accepted: `群友刻度盘` -> `群友刻度尺` -> `刻度默契` -> `同频刻度` -> `默契刻度尺` -> `今日刻度盘`. Tell the CTO which was accepted (it must match the in-game title; **lock it before 备案**).
- 简称 if asked: same as the accepted name.
- 介绍 (57 characters):
```
每日五张刻度卡：把火锅、奶茶这类日常事物拖到“冷”与“热”之间，揭晓后对比大家的位置与本群的位置，看谁和你更同频。
```
Fallbacks if the form complains: `拖动指针，给今天的日常事物定个位置：冷还是热，便宜还是贵？揭晓后看大家和本群有多默契。约一分钟。` then `每天五张卡，一条刻度，两头各是一种感觉。放好指针，看你和群友的想法有多接近；也能自己写提示出题。` (48 characters, inside the 60 limit). **The earlier third fallback ended 「无需输入文字」; that is false since the typed clue and must not be pasted.**
- 头像: upload `docs/kedupan/release/registration/avatar/avatar-512.jpg` (PNG alternative `avatar-512.png`; 1024 masters, 144 minimum).

**Step 5. 服务类目** (首页 -> 小程序类目 -> 添加类目): 一级 游戏 (set); 二级 **休闲**; 三级 **益智** (fallback 答题 or the closest 休闲 option); 资质 scenario **情况二** (no virtual payment now or later). **Do not apply for any payment qualification.** Screenshot the 所需资质 list; if it lists anything beyond the IAA route, stop and send it to the CTO. (Qualification review 1-3 natural days.) **UGC re-check (2026-10-16): no UGC qualification is required on any official page read (`rules-check.md` 1.7i); the console list is still the authority. Do not choose any 社交, 社区, 论坛 or 内容 category.** If the list mentions UGC, a licence or 社区, stop and send it to the CTO before paying for 认证.

**Step 6. Tell the CTO:** AppID, accepted 名称 and 简称, final category path, any console warning (screenshot), and **your intended launch date**.

### 0b. 适龄提示 (H12; required before version review) [changed 2026-10-16: 12+, not 8+]
MP -> 设置 -> 基础设置 -> 基本信息 -> 适龄提示 -> edit and submit. **Recommended: 12+.** Why it changed: the 8+ row of the platform's rule says 「游戏中不存在基于文字、语音、图片等自由交流的陌生人社交系统，可存在简单的好友系统」; a typed clue is free text shown to whoever opens a round card, and a card can be forwarded beyond one group, so it is not limited to friends. The 12+ row allows 「基于文字、语音、图片等自由交流的陌生人社交系统，但社交系统的管理应遵循相关法律法规」, which is what the moderation, reports, strikes and takedown provide. Visuals (cartoon/hand-drawn), content (no real-event content) and competition (non-realistic) stay inside 8+, so 16+ is not justified. The rating is a notice, not an access block. You confirm the age band; review follows; **do not submit 8+** (a mismatch with free-text exchange can be challenged in 备案 or review). Unblocks version review (and puts the icon beside 健康游戏忠告 on the launch screen). Source: https://developers.weixin.qq.com/minigame/introduction/guide/slts.html (read 2026-10-16); reasoning in `rules-check.md` 1.14. Also confirm the 实名/防沉迷 settings in MP (no virtual payment: the platform integrates, `rules-check.md` 1.15). Counsel question for the UGC surface under 《未成年人网络保护条例》: see 2b.

---

## 1. Content human review (AC 10, spec §4.4, H9): **blocks release**

**Why only you:** the 304 spectra / 4,142 items were drafted by AI. Spec 4.4 says no AI-generated text ships without a human review. The settings sheet shows the line "题库内容由 AI 辅助编写，并经人工审核"; that sentence is **only true after a person has read the questions**. Until then the release must not go out (or the sentence must be reworded, a code change by the CTO).

**What to read:** `docs/kedupan/content-review.md` (the review sheet: every spectrum with left/right labels, items and author) against the rules in `docs/kedupan/spec.md` §4.5 (no people, politics, regions, ethnicity/religion, brands, alcohol/tobacco/gambling/drugs/violence/disaster/medical claims, sexual or vulgar content, money-flaunting, sad tone, "tests" of someone, advice). AI reviews already done and applied: product-ux (`docs/kedupan/content-fixes.md`) and QA (`docs/kedupan/qa/content-check.md`: no violation in v2). About 4,100 short items: plan 2-3 hours, or split between people.

**Do:**
1. Read the sheet; mark each spectrum OK / FIX / DROP in the human-review column. Pay special attention to the four low advisories QA left to you: **s310 守岁** (a New Year custom), **s152 黏人** (a personality word, used for animals), **s089 解腻** (a dietary claim in tone), **s102 买得值** (shopping advice tone).
2. Give the CTO the list. The CTO applies edits and bumps `contentVersion`. **Warning: nine categories sit exactly at their minimum** (home, animal, nature, senses, leisure, study, tech, feel, memory), so every dropped spectrum needs a new one written (next id s315) before the next build.
3. Tell the CTO "content review signed by <name>, <date>"; the CTO records it in `content-review.md` (and AC 10 closes).
**Unblocks:** version submission; makes the AIGC line true.

---

## 2. Privacy guide entry (用户隐私保护指引)

File: `docs/kedupan/release/privacy-guide.md` (audit of every `wx` call, items to declare, full text to paste, spec cross-check; **revised for the typed clue**). **Do not enter the guide until 2b is done**: its body names the 《发言规则》 and the 《用户协议》, and the three texts must agree. The earlier text (「游戏内没有任何输入文字的地方」, 「没有用户发布内容」) is false and has been replaced.
1. MP -> 设置 -> 服务内容声明 -> 用户隐私保护指引 -> 更新.
2. Declare **微信朋友关系** with the purpose and retention texts in the guide (item 1), then add custom items 2-13 (OpenID, 群聊标识, 答题数据, 出题与猜测数据, 订阅消息授权, 使用日志, 反馈信息, **and, new with the typed clue: 你自己写的提示, 内容审核与管理记录, 向微信内容安全服务提供提示文字, 举报记录, 违规与限制和发言规则同意记录**) exactly as in the table. The typed clue uses no privacy interface (it is a canvas keyboard input), so there is no new 隐私接口 to tick; check whether the MP form has a free-text section where the clue belongs and screenshot it [VERIFY form]. If the console also lists 昵称、头像, declare it with the item-1 text; if it lists anything else, stop and tell the CTO.
3. Paste the full body text from the guide's code block (items 1-15 in the body; 9-13 are the typed clue). Fill the three placeholders: **更新日期** (launch date), **企业全称**, **联系方式** (monitored email or phone). Retention is **180 days**.
4. Submit the guide for review.
5. MP -> 设置 -> 基本设置 -> **隐私授权弹窗** -> enable the official popup (cannot be switched off afterwards; intended).
**Unblocks:** names and avatars on boards (without the declaration `setUserCloudStorage` fails with 112 and boards render "群友 A/B"), version review, device item E4. **A truthful guide for the typed clue is also a precondition of shipping it** (spec H5).

---

## 2b. Rules text sign-off (H15) [LEGAL]

Files: `docs/kedupan/release/user-agreement.md` (notes, traceability, counsel points) and `user-agreement.txt` (the text), plus the 发言规则 wording in spec §6.12. Nothing is approved or published. Why you: it is the company's own legal text and a legal attestation (Art. 5.4).
1. Read the **发言规则** sheet wording (spec §6.12; six lines) and the **《用户协议》 draft**. They must agree on: **最多 12 个字**; the strike ladder **1 warning / 2 -> 24 h / 3 -> 7 d / 4 or more -> 30 d** (rolling 30 days, typed clue only); **180 days** retention; the report hides at once; the clue never on a share card. The agreement's traceability table lists the spec source of every number.
2. Replace every 【…】 placeholder in `user-agreement.txt`: 【运营主体名称】, 【运营主体注册地址】, 【联系邮箱】 (the same as the privacy guide's 联系方式), 【生效日期】, 【运营主体所在地】. Delete the DRAFT first line. Keep 【重要】 as it is; it is a style marker, not a placeholder.
3. Recommended (costs money [MONEY]): a short counsel review. Points: keeping the text of blocked or hidden clues as evidence for 180 days; sending text and OpenID to WeChat's content-security service; minors under 14; the 12+ statement; 《未成年人网络保护条例》 duties for a UGC surface; jurisdiction. If you skip it, proceed with the draft as written and accept the residual risk.
4. Approve the **备案 service description** (`beian.md` §3, rewritten to state the typed clue and its moderation, 12 characters, review before display, reports, strikes, 180 days). It must be what you file in section 3, and the game must do what it says.
5. Tell the CTO "rules text approved by <name>, <date>" (or send your edits). The CTO puts the final text into the build (a 设置 -> 《用户协议》 page and the link on the sheet) and bumps nothing, because nothing has been published yet.
**Unblocks:** entering the privacy guide, the 备案 filing, the upload, version review.

---

## 3. 备案 (filing) [LEGAL, long pole]

File: `docs/kedupan/release/beian.md` (both filings, every field, the service description to paste, screenshots).
Prerequisites: 认证 finished, name accepted and locked, 适龄提示 submitted (**12+**), **2b done (the service description is approved)**. Route: **情况二 (IAA, no virtual payment). No 版号 and no 软著 are required.**
1. **小游戏备案:** MP -> 设置 -> 小程序备案 -> 去完善 -> 小游戏备案 -> 前往提交. Paste the service description (`beian.md` §3, **rewritten 2026-10-16: it now states the user-typed short clue and its moderation; the old 「无聊天、无用户发布内容」 and 「游戏内没有任何输入文字的位置」 are false and must not be filed**), upload screenshots (real-device shots, **same size and the same build**; the first gameplay shot should show 健康游戏忠告 + 适龄提示 + game name, which needs a real phone: see section 5). **The set must include the typed-clue step, the 发言规则 sheet and the 举报 sheet** (`beian.md` §4). The renders in `docs/kedupan/release/screenshots/` were re-rendered for the typed clue on 2026-10-16 (06, 07, 09, 10, 11), but the 发言规则 sheet, 举报 sheet and hidden-clue screen are not among them (`release-checklist.md`), so they are not a complete fallback for the filing set. If the console asks whether the service includes user-published or interactive content, answer yes, limited to a 12-character moderated clue, and send the CTO a screenshot of any licence it then demands (`beian.md` §3, [VERIFY console]). Wait 1-2 working days (platform) + 10-20 working days (主管部门). **Do not change the name or company meanwhile.**
2. **小程序备案:** same menu, 去完善, choose **情况二**. Fill the entity fields (营业执照, 统一社会信用代码, address, 负责人 and 小程序负责人 with ID, phone, email, an 应急联系人 with a **different phone**), face check (plain light background, no hat/mask/headphones), confirm the 互联网信息服务承诺书. No domain to declare (the game uses cloud functions only).
3. **Answer the SMS from 12381 within 24 hours** (beian.miit.gov.cn): a missed window rejects the filing automatically.
4. When the 备案号 is issued, tell the CTO. It appears on the game's 更多资料 page after release.
**Unblocks:** release (version review can run in parallel, but **publishing needs the 备案号**).

---

## 4. Cloud environment and deploy [MONEY: your billing choice]

File: `docs/kedupan/release/post-release.md` §1-5 and §11 (full detail), `apps/kedupan/cloudfunctions/README.md`. **D-2 adds three functions, four collections, three environment variables and one cloud-call permission; the steps below are updated. Function names and counts were confirmed against the code at final sign-off (2026-10-16): 24 function folders and 21 collections.**
1. 开通云开发 for the **real AppID**; create environment **`kedupan-prod`**; give the CTO the environment ID (`kedupan-prod-xxxx`).
2. The CTO runs `cd apps/kedupan/cloudfunctions && npm test && npm run pack -- --prefix ""` (**24 function folders** in `apps/kedupan/game/cloudfunctions-deploy/`: the 21 before the typed clue plus `agreeRules`, `reportClue` and `admin`).
3. In WeChat DevTools, for each of the 24 folders: 上传并部署：云端安装依赖; for the 4 timer folders (`genDaily`, `finalizeDay`, `sweepRounds`, `cleanup`) also 上传触发器.
4. Console -> 数据库: create the **21 collections** (the 17 below plus the four new ones listed after them) (`kedupan_daily_sets`, `kedupan_daily_card_stats`, `kedupan_daily_entries`, `kedupan_player_stats`, `kedupan_group_members`, `kedupan_group_daily`, `kedupan_rounds`, `kedupan_guesses`, `kedupan_sub_grants`, `kedupan_card_reports`, `kedupan_item_usage`, `kedupan_anomalies`, `kedupan_events`, `kedupan_rate_limits`, `kedupan_reveal_views`, `kedupan_app_config`, `kedupan_meta`) **and, new with D-2: `kedupan_mod_log` (every WeChat text check; the blocked text as admin evidence), `kedupan_mod_quota` (daily counts), `kedupan_clue_reports` (reports), `kedupan_audit_log` (admin operations)**; set rule `{"read": false, "write": false}` on **each of the 21** (deny-all); create the indexes from `post-release.md` §2 (31 indexes on 16 collections in all, matching `database/indexes.json`; D-2 adds `rounds.clueMode_clueMod.ts`, three on `mod_log`, `mod_quota.ts`, three on `clue_reports` and `audit_log.ts`; for `kedupan_reveal_views`: one index named `ts` on field `ts`, ascending). All four new collections are deleted by `cleanup` after 180 days.
5. Environment variables: on `joinGroup` set **`GROUP_REF_PEPPER`** = a random value of **at least 32 characters** that you generate (a shorter value makes `joinGroup` fail with `SERVER_CONFIG`) (e.g. `openssl rand -hex 24`); store it in the company password manager; never paste it in chat. On `getDaily` **and** `genDaily` set **`LAUNCH_DATE_KEY`** = the launch date `YYYYMMDD`. Confirm `TZ=Asia/Shanghai` and the timeouts on each function. **New with D-2, on `setClue`:** `MODERATION_MODE` = **`live`** and `ENV_KIND` = **`prod`** (with `prod` a mock mode makes every typed clue fail with `SERVER_CONFIG`, so a wrong value fails closed but takes typed clues offline). On `admin`: optional **`ADMIN_OPENIDS`** (comma-separated openids allowed to call `admin` from a client; leave empty if you run `admin` only from the console test invocation, which carries no OPENID; never paste openids in chat). Dev-only variables (`MOD_TEXT_DAILY_BUDGET`, `MOCK_SYNC_DELAY_MS`) stay unset. **Cloud-call permission:** `setClue` needs the openapi permission **`wxa.game.contentSpam.msgSecCheck`** (game text check; `security.msgSecCheck` is the fallback), declared in its `config.json` and visible in the console after upload; without it every typed clue answers `MODERATION_BUSY` (fail closed). Function list for D-2: `agreeRules` (stores the 发言规则 agreement), `reportClue` (举报, hides at once), `admin` (console-only moderation; HTTP access stays off and a call with an OPENID is FORBIDDEN unless it is in `ADMIN_OPENIDS`).
6. Create `kedupan_app_config` record `_id: "live"` with the JSON in `post-release.md` §4 (subscribe and banner empty/off for now; **`ugc: {createEnabled: true, viewEnabled: true}` and `moderation: {textApi: "game"}` are new with D-2**: they are the kill switches and the fallback selector, editable without a release).
7. **Console hardening (one time, `post-release.md` §2).** Cloud Storage -> Permissions -> Custom rules: paste exactly `{"read": false, "write": false}` (the contents of `apps/kedupan/cloudfunctions/storage/rules.json`). Cloud Development -> Settings: keep **anonymous / web (Web SDK) login DISABLED** and **HTTP access (HTTP 访问服务) DISABLED** for every function; never add an HTTP trigger. These are the only ways to call a function without a WeChat OPENID.
8. **Evening before launch (so day 1 is not empty):** Cloud Functions -> `genDaily` -> 云端测试, with the test event `{"Type":"Timer","TriggerName":"manual"}`. Any timer function (`genDaily`, `finalizeDay`, `sweepRounds`, `cleanup`) tested without that `Type`/`TriggerName` returns `FORBIDDEN`. (Alternative: open the game once that evening.)
**Unblocks:** everything online (daily, boards, rounds); device pass items E1-E3, E6, E11, and E12/E13 (4b).

---

## 4b. Typed-clue moderation live check (H14) [CREDENTIAL-adjacent: your cloud console]

Files: `post-release.md` §3 and §11, spec §11.6 and §14 (E12). Needs: section 4 steps 1-6 done, `setClue` deployed with its permission, the 体验版 (or DevTools preview) on a real phone, two test accounts.
1. Confirm in the console: `setClue` shows the permission `wxa.game.contentSpam.msgSecCheck`; `MODERATION_MODE=live`, `ENV_KIND=prod`; `app_config.live.ugc` both `true`.
2. **E12, the check itself:** write a normal clue (for example 冬天的被窝) -> it passes and the round opens; write one obviously abusive test clue -> it is refused (「这个提示没通过审核，换个说法吧」) and the guesser's account sees nothing; do about 20 normal checks and read `latencyMs` in `kedupan_mod_log` (target p95 under 2 s); note any "not enabled", quota or error code. Your own accounts only; one short abusive test clue is enough.
3. If WeChat says the game text interface must be enabled for the AppID, that request is yours (MP 在线客服); the game stays safe meanwhile (typed clues answer "暂时没法检查", presets work).
4. Outcomes: both pass and risky seen and p95 under 2 s -> done, tell the CTO. Game interface fails -> the CTO sets `moderation.textApi: general` (the general interface has a pre-publish limit; note it). Neither works -> `ugc.createEnabled: false`: **presets only, the game still ships**, and the CTO escalates. **Never accept unchecked text.**
5. Rehearse the stop: `admin` `{"op":"setUgc","createEnabled":false}` shows presets only; set it back to true.
**Unblocks:** typed clues in the shipped game (spec H14); without it ship with `ugc.createEnabled: false`.

---

## 5. Device pass (spec §14; before submitting for review)

Needs: one **iOS and one Android** phone (WeChat base library >= 3.8.8), **three mutual-friend WeChat accounts** and a test group containing them, the privacy guide and 微信朋友关系 declared (section 2), the cloud deployed (section 4, with the `setClue` permission for E12), PC WeChat for E8/E9/E13. How: 真机预览 from DevTools, or the 体验版 after the upload in section 7. Items marked (real AppID) need the real AppID's 体验版 / guide / ad units / template; the rest can run earlier on the test AppID with the shared test environment. Send the CTO a dated note of results (spec §14: the CTO updates the table). With the CTO and backend on call.

| # | Check | **Pass criterion** | If it fails (fallback already built) |
|---|---|---|---|
| E1 (= AC 41) | Share the game card to the test group, open it from the group on iOS and Android; also open it from a single chat | Group page banner appears for the group entry on **both** platforms (decrypted `opengid`); from a single chat there is **no** group context | no group page (explainer only); daily, friend board and rounds unaffected |
| E2 | Friend and group rows carry `openid`; whether friends with no key are returned | nicknames/avatars matched on 本群 and 好友榜 | rows show "群友 A"; boards stay server-ranked |
| E3 | Hash join of a large board in the open data domain | 500 rows < 50 ms on Android; >= 1,000 friend rows pass | lower `boardListCap`; `selfOnly` above it |
| E4 (= AC 65) (real AppID) | First privacy popup and friend-scope prompt; refusal; settings recovery | no prompt at launch or during a daily; the popup appears only after a tap (看结果, 本群, 好友榜, a reveal); **refuse**: group page, friend board, reveal show "群友 A/B", **no re-prompt**; enable 微信朋友关系 in settings, return: names appear | own dialog via `onNeedPrivacyAuthorization` |
| E5 (real AppID, ad units) | Rewarded video with no fill; interstitial errors | no share page appears on a rewarded no-fill (`disableFallbackSharePage`); the second no-fill in a day shows "暂无广告，请稍后再试" and grants nothing; interstitial 2001/2002 skipped silently, navigation never delayed | stub path already verified |
| E6 | Timers: `genDaily` 23:00, `finalizeDay` 00:40, `sweepRounds` hourly, `cleanup` 04:00 | each fires **once** (event/log), double fire is a no-op; `finalizeDay` finishes within 300 s (or resumes) | raise timeout; lazy finalize covers refs |
| E7 (real AppID, template) | Subscribe: accept -> exactly one notice at the reveal, opens `r=<id>`; with no template, no offer | one notice per grant, opens the round reveal | feature hidden |
| E8 | Ruler feel on the smallest and largest phone and PC WeChat | positions 0 and 100 reachable by drag and nudge; no missed touches; one-thumb use | layout fix (must-fix) |
| E9 | 大字模式 and 高对比度 at 320 x 568 (smallest phone) and PC WeChat | nothing clipped; reveal text and buttons fully visible (known nit: the last line of the home "done" card scrolls) | layout fix (must-fix) |
| E10 (= AC 60) (real AppID, banner unit) | Banner once a 流量主 unit exists | banner only on group page, friend board, archive list (`ready`/`empty`); >= 24 pt gap; no overlap with rows or buttons; default off | banner stays off |
| **E12 (new, D-2)** (real AppID) | Game text check from our AppID: the cloud call `wxa.game.contentSpam.msgSecCheck` works from `setClue`; a normal clue passes, an obviously abusive test clue returns `risky`; p95 latency over 20 calls; behaviour before publish (a pre-publish quota or "not enabled" code). Same as section 4b | pass and risky both seen; **p95 < 2 s** on the live environment | `moderation.textApi: general`; if neither works `ugc.createEnabled: false` (presets only) and the CTO escalates. Never show unchecked text |
| **E13 (new, D-2)** | Typed clue input on **iOS, Android and PC WeChat**: tapping the input opens the keyboard; Chinese IME input arrives; the 12-character limit holds; 完成/confirm closes the keyboard without sending; the input stays visible above the keyboard; the share sheet still opens after the async check (up to 2 s); the first tap shows the 发言规则 sheet and 同意并写提示 (enabled once the text is scrolled to its end) opens the keyboard | input visible above the keyboard on all three; share sheet opens after 发到群里 | second-tap share (button becomes "提示已通过 · 发到群里"); a layout fix is a must-fix |
| E11 (new, security audit M1) | Does a real `getGroupEnterInfo` payload carry `chat_type`, and is a forged group object rejected? (a) open a real group card, then tell the CTO whether the decrypted payload carries `chat_type` (the server accepts it absent, or 3/4) and that the cloudID matches `[A-Za-z0-9_-]{8,512}`; open a single-chat card (`open_single_roomid`): no group. (b) With a modified client or a console call to `joinGroup`, send `{groupData:{cloudID,data:{opengid:"X",chat_type:3}}}` and `{cloudID:{...same object}}`. | (a) a real group card joins; a single chat gives no group. (b) both forged calls return `BAD_CLOUDID` and `kedupan_group_members` gets no row | CTO adjusts the `chat_type` rule; group page stays off until fixed |
| **AC 41** | see E1 | share a group card on iOS and Android, open it, group banner appears; single chat: no banner | |
| **AC 60** | see E10 | as E10 | |
| **AC 65** | see E4 | as E4 | |
| Extra 1 (new) | Launch splash | the splash shows **健康游戏忠告** and the 适龄提示 icon after 适龄提示 is approved; **take a screenshot**: it is the first 备案 screenshot | tell the CTO (`rules-check.md` 1.16) |
| Extra 2 (new) | Real-device screenshots for 备案 | same phone, same size, in the order of `beian.md` §4, **including the typed-clue step, the 发言规则 sheet and the 举报 sheet (D-2)** | n/a |
| Extra 3 (new, D-2) | Report and hide with two accounts **on two different phones (B is not on the host's phone)**: A writes a typed clue and shares; B opens it and taps 举报 and picks a reason | B sees 「提示已被举报隐藏」; A sees 「你的提示被举报隐藏了，群友仍可继续猜」; both can still guess; no 举报 on A's own clue; the round card never shows the clue text | tell the CTO |
| **Extra 4 (new, D-2, QA)** | **Keyboard / IME on real iOS and Android:** type with **Pinyin** composition: the 12-character limit (`maxLength: 12`) holds while a candidate is still being composed and after it is committed (QA could only simulate code points vs composing text); emoji and symbols typed are removed at once and the text in the keyboard is corrected; the confirm key (完成) closes the keyboard and does not send; `onKeyboardHeightChange` lifts the input row above the keyboard at the smallest phone and with 大字模式; the draft survives opening the 发言规则 sheet and coming back | all of it as described; the counter reads x/12 and never shows 13 | a layout fix or a filter fix is a must-fix (tell the CTO the phone and base library) |
| **Extra 5 (new, D-2, QA)** | **Android back key** (system back or swipe): press it with the keyboard open, on the 发言规则 sheet, in the 《用户协议》 reader and on the 举报 sheet, and write down what happens (QA could not simulate it): the keyboard should close and keep the draft, and no press should throw you out of the game by accident or lose the typed draft while the keyboard or a sheet is open (leaving the create screen drops the draft by design: memory only) | no accidental exit, no lost draft | tell the CTO what the back key did; a fix is a must-fix if it exits the game or loses the draft |
| **Extra 6 (new, D-2, QA)** | **发言规则 sheet on a real phone:** the finger-scroll gesture (the bullets scroll; the two links 《用户协议》 and 《用户隐私保护指引》 stay pinned above the buttons and open the agreement reader and `wx.openPrivacyContract`); 同意并写提示 stays disabled until you scroll to the end (or the text fits, as on a tall phone) and 先用提示词 always works; also 设置 -> 发言规则 and 设置 -> 《用户协议》 (read only). Try the smallest phone with 大字模式 | scrolls with one finger, links work, button enables at the end | the sheet scrolling is a must-fix |
| **Extra 7 (new, D-2, QA)** | **Admin takedown from the cloud console** (a call with no OPENID): `admin` `{"op":"listReports","state":"open"}` shows the Extra 3 report; `{"op":"hideClue","roundId":"<id>"}` and `restoreClue` change what the guesser sees on the next open; `{"op":"upholdReport","roundId":"<id>"}` adds one strike (check the host sees the warning once); then `admin` called from the **game client** (any test call carrying an OPENID, not in `ADMIN_OPENIDS`) returns `FORBIDDEN`; `audit_log` has one row per write op; in the deployed environment `ENV_KIND=prod` and `MODERATION_MODE` is `live` or unset | takedown works without an OPENID, the client call is refused, the audit rows exist | the CTO checks the function config and the console version |
| **Residual (accepted, not a check)** | At 320 x 568 with 大字模式 the keyboard-open input box shows only the tail of a long clue (for example 「…的被窝」); the full text shows after the keyboard closes. Looking at it on the smallest phone is enough | the tail shows while typing, the full clue after 完成 | none; accepted by the CTO (TD-94) |

Do NOT test E5/E7/E10 against the live ad units by clicking your own ads (risk of a 流量主 violation): view, do not click.

---

## 6. 软著 submission (optional, your choice) [LEGAL]

Not required for this game (only if the name has English or 软件, or brands/public figures are involved; none). Do it if you want proof of authorship. Files (all prepared): `softcopyright/software-description.md` (fields: name, V1.0.0, environment, JavaScript, 17.3k source lines), `softcopyright/user-manual.md` (with 8 screenshots, convert to PDF; **the manual text is updated for the typed clue and the 60-page source excerpt was regenerated from the D-2 build on 2026-10-16; the manual's pictures use screenshots 06 and 07 (now re-rendered)**), `softcopyright/source-excerpt.txt` (60 pages: first 30 + last 30, 50 lines per page, header on every page; regenerate with `node docs/kedupan/release/softcopyright/tools/gen-source-excerpt.js`; convert to PDF). Register at 中国版权保护中心 (ccopyright.cn): company name, 营业执照, applicant identity, owner attestation (the work was produced with AI assistance: a short legal check is advised). Fees and lead time are the registry's [VERIFY]. Unblocks: nothing required; protection and any later platform request.

---

## 7. Release build and upload (after you approve this specific version)

File: `docs/kedupan/release/build-upload.md` (exact commands). **State your approval in writing: "I approve uploading kedupan version 1.0.0"** (the typed-clue build `84c6881`, rebuilt, QA-passed and CTO-signed-off; nothing has been uploaded yet, so the first upload is 1.0.0); the CTO/release engineer then does nothing until that sentence exists.

Preconditions: sections 0, 1, 2, **2b, 4b** and 4 (including steps 7-8) done, 适龄提示 submitted as **12+**; real AppID in `APPID.md`; launch date known and the schedule regenerated if it is not 20261101; section 5 completed or its open items accepted by you.
Commands (CTO, on a release branch, never `main`): cloud functions `npm test && npm run pack -- --prefix ""`; game `node tools/release-config.js --env <envId>`, `npm test` (expect 0 fail; the D-2 build has 439 pass and 3 skipped in dev state, and the same after the switch), `node tools/release-config.js --env <envId> --appid <REAL_APPID>`, then **check that `project.config.json` `packOptions.ignore` contains `core/content/anchors.v1.js` and `core/content/schedule.v1.js`**, then upload. **The release switch must run first:** the committed dev state packs the server-only answer key and the 365-day schedule, and only release mode excludes them; an upload from the dev state would ship both to players (`build-upload.md` §2).
Upload: **DevTools** (open `apps/kedupan/game`, version 1.0.0, remark "首个版本：每日五张刻度卡、与全国和本群好友对比默契分、出题让群友猜（可自己写提示，先审后发，可举报）、往期刻度练习。"), or `miniprogram-ci` with the key at `MP_UPLOAD_KEY_PATH` (you generate the key in MP 开发设置, store it outside the repo, **whitelist the uploading machine's IP** in the same page, never paste the key). Result: a **development version**.
**Then you, in mp.weixin.qq.com:** 版本管理 -> 开发版本 -> 提交审核: choose the 开发引擎 (self-developed / native JavaScript on Canvas [VERIFY option]), confirm the privacy guide and 适龄提示 (**12+**), run the pre-submit checks in `build-upload.md` §3b, paste the 版本更新说明, optional 宣传图 (`screenshots/`), **开发者信息** (the console requires an Apple developer account entry; an email address is accepted [VERIFY]), submit. Review takes about 1 natural day. After approval **and the 备案号**, you click 发布. **Agents never submit or publish.**
Unblocks: the live game.

---

## 8. Post-release

File: `docs/kedupan/release/post-release.md` §5-10.
1. **流量主:** eligible when any one of: cumulative UV > 500 (no fake traffic); game circle + 5 posts; a same-company mini program earning for a quarter. MP -> 流量主 -> 开通 (signing and settlement details are yours). Create three ad units: **激励视频, 插屏, Banner**. Give the CTO the unit IDs (not secret): rewarded and interstitial go into the client (`adUnits`, one more build and upload, e.g. 1.0.1); the banner ID and `enabled: true` go into `kedupan_app_config.live.ads.banner` (you can edit it live). Then device items E5 and E10.
2. **Subscribe template:** MP -> 订阅消息 -> 公共模板库: one-time template with a text keyword (spectrum), a number keyword (默契值) and a time keyword; put its **模板 ID** and the keyword keys in `kedupan_app_config.live.subscribe` (JSON in `post-release.md` §4). No rebuild needed. Then device item E7.
3. **KPIs to watch** (healthy / watch): share rate >= 8% / < 3%; card-open-to-play >= 30% / < 15%; host rounds revealed with >= 2 guesses >= 40% / < 20%; archive sets per session >= 2 / < 1.2; D1 >= 35% / < 25%; D7 >= 15% / < 8%; groups with >= 3 same-day completers >= 25% / < 10% of active groups. First-week checks: the 4 timers fired once each; `[ALERT] schedule exhausted` never appears (365 days); `card_reports` reviewed weekly; anchors compared with observed medians. **Moderation KPIs (typed share, local rejection by reason, block rate, busy rate and latency, report rate, tab-2 fallback) are in `post-release.md` §11.**
4. **Retire the shared test state:** if the real environment was used for testing before launch, do the "Reset after a test run" in `post-release.md` §8 (irreversible deletion: your decision) so launch day is issue 1.

---

## 8b. Report queue routine (H16) [YOUR TIME or a named delegate]

Files: `post-release.md` §11 (the console calls), spec §11.7. A report hides a typed clue at once, so a slow queue never keeps bad text visible; the routine decides restores and strikes and finds what nobody reported (the platform expects patrols and self-audits, 运营规范 10.5).
1. **Name the owner** (you or a delegate) and, if the delegate calls `admin` from a client, put their openid in `ADMIN_OPENIDS` (section 4). Tell the CTO the name.
2. **Daily for the first 4 weeks after launch, then at least every 2 days:** in the cloud console run `admin` `{"op":"listReports","state":"open","limit":50}` and `{"op":"sample","n":20}`; for each report choose `upholdReport` (one strike to the host; the clue stays hidden) or `dismissReport` with `restore` true or false; `hideClue` / `restrict` for a bad sampled clue. Every op is written to `audit_log`.
3. Watch the logs for `[ALERT] clue report open > 48 h` and `[ALERT] moderation busy`.
4. Deletion requests arrive through 设置 -> 联系我们/反馈 (WeChat's feedback component, visible in the MP console): `admin` `deleteClue` for the named round.
5. Emergency: `setUgc` `{"createEnabled":false}` stops new typed clues; `{"viewEnabled":false}` hides every typed clue.
**If nobody owns this:** reports still hide clues at once, but restores and strikes wait, and a bad clue nobody reported stays up. Do not ship typed clues without an owner (spec H16).
