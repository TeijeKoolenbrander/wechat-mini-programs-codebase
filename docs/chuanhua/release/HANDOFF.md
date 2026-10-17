# 传画接龙 (chuanhua): Founder Handoff

Author: release, for the CTO. Date: 2026-10-16 (refreshed for spec rev. 2.1; first written 2026-10-15). **CTO final review and sign-off: DONE 2026-10-15 (rev. 2) and 2026-10-16 (rev. 2.1, TD-153)** (decision log row in `docs/chuanhua/decisions.md`); everything that remains is founder-only or a counsel item. Build: `kept-ideas/v1` at commit `a8a86d3e534015a364d5263d21be20685318bef7` (spec rev. 2.1: live rooms, up to 5 换一批 per pick, TD-151/TD-152; QA `qa/rev2.1-report.md`: all AC pass). **QA status: QA rev. 3 gate passed: 0 FAIL, 148 PASS, 7 DEVICE (AC 32, 36, 50, 68, 99, 148, 155), 8 REMOVED-verified; QA-R3-1 fixed after the gate (TD-148)** (`docs/chuanhua/qa/ac-matrix.md`). One ordered checklist of everything only you can do (constitution Art. 5, 6). For each step: values to paste, files, and what it unblocks. Agents have done none of it: no registration, filing, upload, deployment, payment or release.

> **AppIDs: read this first.** During development the game uses the **shared test AppID `wxcd03c1b62d7eb0e0`** (committed in `apps/chuanhua/game/project.config.json`, per CLAUDE.md) and the shared test cloud environment. The **release build switches to the game's own AppID**, which you create in step 0 and give to the CTO, who records it in `docs/chuanhua/release/APPID.md`. **How the AppID gets into the build:** `tools/release-config.js --env <envId> --appid <REAL_APPID> --prefixed-functions` (plus `--ad-rewarded` / `--ad-interstitial` once the 流量主 units exist) writes it into the release build only, and `--dev` restores the test AppID byte for byte (`build-upload.md` section 3; rules-check A1-A3 closed, TD-149). Nothing is edited by hand. The real AppID is never committed. An AppID is public; **the AppSecret, the upload key and `GROUP_REF_PEPPER` are never pasted into chat or the repo.**

## Read this first: what is done, what blocks, how long it takes

- **Done:** the complete game (live rooms default, 慢慢传 secondary, pre-moderation, reports, takedown, kill switches), 33 cloud functions, the release pack. Tests at the final build (a8a86d3): game (dev, real tree) 542 tests, 532 pass, 0 fail, 10 skipped, 0 todo; cloud functions 402 tests, 402 pass, 0 fail; release-mode run on a scratch copy 542 tests, 529 pass, 0 fail, 13 skipped (dev-only), 0 todo; release package **831,193 bytes = 0.793 MiB of the 4 MB limit** (81 files); no secrets in the repo. QA rev. 3 gate passed: 0 FAIL, 148 PASS, 7 DEVICE (AC 32, 36, 50, 68, 99, 148, 155), 8 REMOVED-verified; QA-R3-1 fixed after the gate (TD-148). CTO final review and sign-off: DONE 2026-10-15 (rev. 2) and 2026-10-16 (rev. 2.1, TD-153).
- **Blocks release (only you can clear):** step 0 (registration + 认证), step 1 (the 用户协议 is a DRAFT), **step 2 (H13: a human reads every prompt)**, step 3 (privacy guide), step 4 (备案, the long pole; also 适龄提示), step 5 (cloud, including proving the **synchronous image check, error 750031**), step 6 (device pass), step 7 (a named ops owner).
- **Timeline:** 备案 is two sequential filings: 小游戏备案 10-20 working days, then 小程序备案 10-30 working days (about **4-10 weeks** total). There is no launch-date setting to change.
- **The one risk that can change the product:** the live game needs WeChat's **synchronous game image check** (`mediaCheckSync`). It exists in the docs but we have never called it from our own AppID. If it answers **750031** ("该游戏不支持，需联系小游戏侧配置"), live rooms switch themselves off and only 慢慢传 (old asynchronous check) runs until WeChat enables it for you (step 5).
- **Order that saves time:** 0 -> start 认证, 适龄提示 and 备案 immediately (they run in parallel with everything else) -> 1, 2 and the counsel questions in parallel -> 3 -> 5 -> 6 -> 7 -> 8 (optional) -> 9 -> 10.

Files, all under `docs/chuanhua/release/`: `registration/` (REGISTRATION-STEPS.md, copy.md, rules.md, avatar/), `privacy-guide.md`, `beian.md`, `softcopyright/`, `store-listing.md`, `screenshots/`, `rules-check.md`, `build-upload.md`, `post-release.md`, `release-checklist.md`, `APPID.md`, `user-agreement.md` / `.txt`.

**Spec §18 items in this handoff:** H1 -> 0; H2 -> 0; H3 -> 4 (and 0, step 5); H4 -> 5; H5 -> 5; H6 -> 1 and 3; H7 -> 10; H8 -> 10; H9 -> 7; H10 -> 1B (counsel); H11 -> 10; H12 -> 6; H13 -> 2; H14 -> 8; H15 -> 9.

---

## 0. Registration (copied from `registration/REGISTRATION-STEPS.md`; the long form is in that file)

Status: ready. Cost: **300 RMB for 微信认证** [MONEY], or 0 via the 公众号 quick path if it lets you choose 小游戏 [VERIFY]. Time: registration 15 min, 认证 1-3 working days, name/avatar/intro/category 20 min.

**Before you start:** a **new email address used for this game only** (not registered on 公众平台/开放平台/企业号, not bound to a personal WeChat; do not reuse another game's address); the company's 营业执照 (colour original) and 统一社会信用代码; the administrator's real-name WeChat, phone and ID; for 对公打款 (if chosen) access to the corporate bank account (transfer within 10 days). Informational (H1): search 传画接龙, 传话画画, 群里画画接龙 in WeChat and Douyin; if an established clone is there, tell the CTO.

**Step 1. Register the account** [CREDENTIAL, LEGAL]: https://mp.weixin.qq.com -> 立即注册.
| Field | Enter |
|---|---|
| 账号类型 | **小程序**, then **小游戏** (not 其他; **irreversible**) |
| 邮箱 / 密码 | the new email; your own password (never in chat) |
| 主体类型 | **企业** |
| 企业名称, 统一社会信用代码 | exactly as on the 营业执照 (check character by character; cannot be changed later) |
| 管理员 | the admin's real name, ID, phone; scan the QR code with the admin's WeChat |
| 验证方式 | **微信认证** (300 RMB) |

**Step 2. Get the AppID, give it to the CTO.** 开发管理 -> 开发设置 -> AppID. Send the CTO the AppID and the accepted name (not secrets). **Never copy the AppSecret anywhere.**

**Step 3. 微信认证** [MONEY, LEGAL]: 设置 -> 微信认证; 300 RMB; 1-3 working days. Needs 营业执照, a 公函 signed by the legal representative and stamped with the **公章** (not 合同章/财务章/电子章), admin identity and a verification call. Unblocks: renaming, **both 备案 filings**, **流量主**, tester slots. Start today.

**Step 4. 基本信息** (首页 -> 小程序信息 -> 前往设置):
- 名称, try in order, keep the first accepted: `传画接龙` -> `一笔传一笔` -> `画话接龙` -> `越传越歪` -> `群里传画` -> `传画画`. Tell the CTO which was accepted (it must match the in-game title; **lock it before 备案**; if it is not 传画接龙 the CTO changes the title string).
- 简称 if asked: the accepted name.
- 介绍 (**R1**, 43 characters, rev. 2: names the live default, does not mention 今日起点):
```
群里开一局：每人选题、轮流画和猜，传给下一位，传完一起看原题变成了什么。画得丑没关系。
```
Fallbacks if the form complains or the reviewer questions UGC: **R2** `3到10位群友同时在线，一人一题，轮流画和猜，传完一起揭晓。内容先审后传，不满意可举报。` then **R3** `群友同时在线玩一局，或用慢慢传分几天传完：画一幅、写一句，只看上一棒，揭晓时看原句变成了什么。` then the older I1-I3 in `registration/copy.md`.
- 头像: upload `docs/chuanhua/release/registration/avatar/avatar-512.jpg` (PNG alternative `avatar-512.png`; 1024 masters, 144 minimum).

**Step 5. 服务类目 and the UGC qualification check (do this before paying for 认证 if you can)** (首页 -> 小程序类目 -> 添加类目): 一级 游戏 (set); 二级 **休闲**; 三级 **益智** (fallback 答题, or the closest 休闲 option; **never a 社交, 社区, 论坛 or 内容 category**); 资质 scenario **情况二** (no virtual payment now or later). **Do not apply for any payment qualification.** Then:
1. **Take a screenshot of the 所需资质 list** the console shows for your choice and send it to the CTO. The official pages say nothing about UGC for 游戏 > 休闲 (zzsh-iaa.html, nrjs.html), so the console is the only authority.
2. If the list shows only the IAA route (or nothing), continue. **If it lists anything else** (网络文化经营许可证, 增值电信业务经营许可证, anything about 用户生成内容): **stop and send the screenshot to the CTO** [LEGAL, possibly MONEY].
3. Optional: ask 在线客服 the question in `registration/copy.md` section 8.2 and keep the reply (screenshot).
(Qualification review 1-3 natural days.)

**Step 6. Tell the CTO:** AppID, accepted 名称 and 简称, final category path, the 所需资质 screenshot, any console warning (screenshot).

### 0b. 适龄提示 (required before 备案 and version review): recommended **12+**
MP -> 设置 -> 基础设置 -> 基本信息 -> 适龄提示 -> edit and submit; review follows. **Why 12+, not 8+:** the platform's own wording (https://developers.weixin.qq.com/minigame/introduction/guide/slts.html) allows free text/image exchange only from 12+ ("游戏中可存在基于文字、语音、图片等自由交流的陌生人社交系统，但社交系统的管理应遵循相关法律法规"); 8+ allows only "简单的好友系统" without free text/image exchange with strangers. 传画接龙 has no stranger matching, but up to 10 members of one WeChat group exchange free drawings and 16-character sentences, which is not a simple friend system. Visuals (hand-drawn), content and competition (none) would fit 8+, and 8+ is arguable if you regard a closed group as friends; it is the riskier statement. Full reasoning: `rules-check.md` 2.1. You confirm the band. Unblocks 小游戏备案 (an unset or unapproved 适龄提示 is a rejection reason, nrjs.html Q2), version review, and puts the icon beside the 健康游戏忠告 on the launch screen.

---

## 1. Approve the 用户协议 (agreement) [LEGAL]

Status: **DRAFT (rev. 3).** Files: `docs/chuanhua/release/user-agreement.txt` (the text the game shows; plain text) and `user-agreement.md` (the same text with change notes). The release build **refuses** while the draft line or any placeholder remains (`node tools/build-terms.js --release` exits 1), so nothing can ship by accident.

**You or your counsel:**
1. Read it (15 sections: modes, content rules, moderation, reports, strikes, content licence, deletion, 180-day retention, minors, ads, liability, changes, contact, jurisdiction). Edit anything you do not accept (tell the CTO if the change affects rights, duties, retention, the violation ladder or the dispute clause: that needs a `rulesVersion` bump).
2. Fill in the placeholders in `user-agreement.txt` (keep the marker 【重要】 as it is; it is not a placeholder):
| Placeholder | Fill with |
|---|---|
| 【运营主体名称】 (2 places) | the company's full legal name, as on the 营业执照 |
| 【运营主体注册地址】 | its registered address |
| 【联系邮箱】 (2 places) | a monitored email (the same contact as in the privacy guide) |
| 【生效日期】 (2 places) | the date the approved version takes effect |
| 【运营主体所在地】 | the district whose people's court has jurisdiction, e.g. 北京市某区 |
| 【H13 审核完成后填入：并经人工逐条审核修改】 (§一.12) | **only after step 2 is signed**, replace with `并经人工逐条审核修改`. If step 2 cannot be signed, keep the sentence without it; the claim "人工逐条审核" would be false |
3. **Delete the first line** (the 【草稿：未经运营主体审定，不得发布。…】 notice) once you approve the text.
4. Tell the CTO "agreement approved <date>" (or commit the edited file); the CTO then runs `node tools/build-terms.js --release` (`build-upload.md` section 1). The agent never edits the legal wording.

### 1B. Counsel questions (H10; cost money [MONEY], recommended before launch)
1. **UGC duties** for a group-bound live drawing game: does the 2018 CAC 安全评估规定 (https://www.cac.gov.cn/2018-11/15/c_1123716072.htm, Art. 2: 小程序 / 通讯群组 and "附设相应功能") require a self-assessment and a filing before launch? Does a 网络文化经营许可证 apply to this ad-supported 休闲 game? (`beian.md` section 4.)
2. **Minors:** do 《未成年人网络保护条例》 arts. 42-43 (anti-addiction, 未成年人模式) and art. 26 (cyberbullying mechanisms) require anything beyond what the game and the platform do (`rules-check.md` 1.8, 2.3)?
3. **Retention:** 180 days, and the evidence copy (PNG, text) kept admin-only for 180 days after an author deletes.
4. **AIGC labelling** of the AI-drafted, human-approved prompt bank (`rules-check.md` 1.11).
5. 防沉迷 / 实名 for IAA without 版号 (V13): the platform page says no action for no-payment games.
**If you skip it:** the defaults apply (proceed with the design as built); you accept the residual legal risk of items 1-2.

---

## 2. H13: human review of every prompt in the bank [blocks release]

File: `docs/chuanhua/content-review.md` §5 (process, counts, sign-off table). The bank is `apps/chuanhua/game/core/content/prompts.v2.js`: **2,042 active prompts** in 12 categories (+ 210 retired, ids kept) plus the local blocklist `blocklist.v1.js`. It was drafted by an AI and reviewed by two AIs; **no human has read it** and the game must not ship before a human does. Why it matters: prompts are the only pre-written content shown to every player, in family groups too.

**You or a delegate:**
1. Read every active prompt (`prompts.v2.js`, ids `A01`... `L1xxx`; a plain-text list can be exported by the CTO on request) against `content-review.md` §5.2: drawable in 60 s by a non-artist; everyday words a 40+ player knows; kind or absurd, never mean; **none of:** politics, flags, maps, military or weapons, religion or superstition, real people or brands or copyrighted characters, regional or ethnic jokes, disasters, illness or death, alcohol, tobacco, gambling, romance, bodies, bathing, innuendo, mocking of age or jobs or bodies.
2. Mark prompts to drop or reword. **The bank must stay ≥ 2,000 active prompts and ≥ 120 per category** (smallest: F 132, E 135): you can drop up to 42 in total; beyond that, replace instead. The CTO applies your list as a content change (`retired: true` for drops; prompts are never edited after release because existing chains keep their own copy). Tools: `content-fixes-v2.md` §4 (low-risk prompts to confirm) and §5 (about 300 weak but acceptable prompts to swap first).
3. Read the blocklist too.
4. Sign `content-review.md` §5.5 (name, date, "bank v2 reviewed: every prompt", "blocklist reviewed") and tell the CTO "H13 signed by <name>, <date>".
5. Then fill the agreement's §一.12 placeholder (step 1). **Unblocks:** release; the honest 人工审核 sentence.

---

## 3. Privacy guide entry (用户隐私保护指引, H6)

File: `docs/chuanhua/release/privacy-guide.md` (audit of every `wx` call, the items to declare, the full text to paste, the spec §15 cross-check). Needs the real AppID's console.
1. MP -> 设置 -> 服务内容声明 -> 用户隐私保护指引 -> 更新.
2. **No standard-API item applies** (no 微信朋友关系, album, nickname/avatar, location ...). If the console auto-detects one, stop and tell the CTO. Add the **12 custom items** (OpenID, 群聊标识, 画, 文字, 一局的参与记录, 抽题记录, 内容审核与违规记录, 举报记录, 游戏记录, 订阅消息授权记录, 反馈, 使用日志) with the purpose and retention texts of section 2 of the guide.
3. Paste the full body text from the guide's code block. Fill the three placeholders: **更新日期** (launch date), **企业全称**, **联系方式** (a monitored email or phone; the same as 联系邮箱 in step 1). Retention is **180 days** (signals 1 day).
4. Submit the guide for review.
5. MP -> 设置 -> 基本设置 -> **隐私授权弹窗** -> enable the official popup (cannot be switched off afterwards; intended).

**Mismatches found:** no code-versus-guide mismatch. Four wording gaps in spec §15 / `privacy-notes.md` (albumCache missing from §15; `installId` described as analytics although it is never sent; feedback component text; `step_submit` statistics), all Low; the guide text covers them; the spec owner updates §15. **Unblocks:** version review, the in-game 用户隐私保护指引 link, device item D16.

---

## 4. 备案 (filing) [LEGAL, long pole]

File: `docs/chuanhua/release/beian.md` (both filings, every field, the service description to paste, the UGC section). Prerequisites: 认证 finished, name accepted and locked, **适龄提示 submitted and approved**. Route: **情况二 (IAA, no virtual payment). No 版号 and no 软著 are required** (rules-check section 4).
1. **小游戏备案 (first):** MP -> 设置 -> 小程序备案 -> 去完善 -> 小游戏备案 -> 前往提交. Paste the service description (`beian.md` section 3: it names only what v1 ships), upload screenshots (`screenshots/01..16`, 1080 x 2340 renders, or real-device shots, **same size and version**; the first gameplay shot should show 健康游戏忠告 + 适龄提示 + game name, which needs a real phone: device D21). Wait 1-2 working days (platform) + **10-20 working days** (主管部门). **Do not change the name or company meanwhile.**
2. **小程序备案 (second, only after step 1 is approved):** same menu, 去完善, choose **情况二**. Fill the entity fields (营业执照, 统一社会信用代码, address, 负责人 and 小程序负责人 with ID, phone, email, an 应急联系人 with a **different phone**), face check (plain light background, no hat/mask/headphones), confirm the 互联网信息服务承诺书. No domain to declare (cloud functions only). About **10-30 working days**.
3. **Answer the SMS from 12381 within 24 hours** (beian.miit.gov.cn): a missed window rejects the filing automatically.
4. **UGC:** none of the WeChat forms asks UGC-specific questions (`beian.md` section 4); send the CTO a screenshot of the 服务内容 options and 所需材料 the form shows; counsel questions 1B.1.
5. When the 备案号 is issued, tell the CTO. It appears on the game's profile page after release. **Unblocks:** release (version review can run in parallel, but **publishing needs the 备案号**).

---

## 5. Cloud environment, deploy and console hardening [MONEY: your billing choice] (H4, H5)

Files: `docs/chuanhua/release/post-release.md` sections 1-7, `apps/chuanhua/cloudfunctions/README.md`.
1. 开通云开发 for the **real AppID**; create environment **`chuanhua-prod`**; give the CTO the environment ID (`chuanhua-prod-xxxx`).
2. The CTO runs `cd apps/chuanhua/cloudfunctions && npm test && npm run pack` (33 folders `chuanhua_<name>` in `apps/chuanhua/game/cloudfunctions-deploy/`, git-ignored).
3. In WeChat DevTools, for each of the 33 folders: 上传并部署：云端安装依赖; then 上传触发器 for the **three timers**: `chuanhua_roomSweeper` (every minute), `chuanhua_modSweeper` (every 5 minutes), `chuanhua_cleanup` (04:00); approve permissions if asked. Verify timeouts, memory and `TZ=Asia/Shanghai` in the console.
4. Console -> 数据库: create the **18 collections** (`chuanhua_chains chuanhua_steps chuanhua_rooms chuanhua_room_signals chuanhua_mod_traces chuanhua_mod_log chuanhua_mod_quota chuanhua_reports chuanhua_players chuanhua_group_members chuanhua_group_stats chuanhua_reactions chuanhua_sub_grants chuanhua_daily_stats chuanhua_audit_log chuanhua_events chuanhua_rate_limits chuanhua_app_config`); permission **deny-all** `{ "read": false, "write": false }` on 17 of them; on **`chuanhua_room_signals`** the **watch rule** `{ "read": "doc._openid == auth.openid", "write": false }`; create the indexes of `post-release.md` section 2 (none unique); cloud storage rule `{ "read": false, "write": false }`.
5. **Environment variables** (names only; values you set, never in chat): **`GROUP_REF_PEPPER`** = a random value of at least 32 characters (e.g. `openssl rand -hex 32`) on the 12 functions listed in `post-release.md` section 3 (same value; store it in the company password manager); **`ENV_KIND=prod`** and **`MODERATION_MODE=live`** explicitly on every UGC function; **no** `MOD_*` budgets and **no** `MOCK_*` anywhere; `ADMIN_OPENIDS` only if step 7 needs it; `PUSH_TOKEN` / `PUSH_AES_KEY` only if the async-fallback route is ever used.
6. Create `chuanhua_app_config` `_id: "live"` (JSON in `post-release.md` section 4: `ugc` both true, `moderation.imageMode: "sync"`, `features.liveRooms: true`, `updatableCard: false`, ads banner off).
7. **Console hardening** (`post-release.md` section 5): 匿名登录 and web logins OFF; HTTP access OFF for every function; run `chuanhua_modSweeper`, `chuanhua_roomSweeper` and `chuanhua_cleanup` once each with `{"Type":"Timer"}` (each `{"ok":true}`).
8. **Content security (H5):** enable the **game content-security APIs** for this AppID: `mediaCheckSync` (图片内容安全识别) and the game `msgSecCheck` (文本内容安全识别); check 云调用权限 lists `wxa.game.contentSpam.*` on the UGC functions. **If error 750031 appears** (function log or an `[ALERT]` line), the game switches itself to the async fallback: **live rooms are OFF and only 慢慢传 runs** (drawings fail closed, nothing unchecked is shown). **Request activation from WeChat** (小游戏 team / 管理后台 客服, text in `post-release.md` section 6), then run `chuanhua_admin` `{ "op": "setModeration", "imageMode": "sync" }` and re-test. 750032/750033 are only minute/day limits (ask for a raise at 70% of 200,000 a day, H11). If the SDK has no cloud call at all, tell the CTO (the HTTPS route needs the AppSecret in the cloud console only, never in chat). **Unblocks:** everything online.

---

## 6. Device pass (spec §16.2; QA's final list D1-D20 from `qa/ac-matrix.md` rev. 3, plus D21, and D22-D24 from `qa/rev2.1-report.md`)

**The two that matter most: D1 (V16, the synchronous image check: if it fails, live rooms are off) and D14 (contention on the real database: the one check that shows whether the 24 retries of TD-145 are enough on the real platform).** The 7 acceptance criteria QA could not test without a phone or the real console are AC 32 (D5), 36 (D4), 50 (the async-fallback push route, V1: only if the fallback is ever used; no D item), 68 (D10), 99 (D7), 148 (D2) and 155 (D1).

Needs: **one iOS and one Android phone, a third phone or PC WeChat, four test accounts** in a test group, the cloud deployed (step 5), the privacy guide entered (step 3), a 体验版 of the release candidate (the upload of step 9 as a development version, set as 体验版, or 真机预览 from DevTools), "不校验合法域名" off. **D1 (V16, the synchronous image check) comes first; D14 (real-database contention) is the second must-do.** Send the CTO a dated note of results (the CTO files it as `docs/chuanhua/device-pass-<date>.md`, exit criteria E1-E7 of spec §16.2). Backend and minigame-dev on call; QA records. Do NOT click your own live ads. **The Result column is empty on purpose.**

| # | Check | AC / V | Pass looks like | Result |
|---|---|---|---|---|
| **D1** | **V16 first.** Dev environment (`ENV_KIND=dev`, `MODERATION_MODE=live`, budgets on): send 20 drawings and 20 texts; record `mediaCheckSync` and game `msgSecCheck` latency p50/p95 (`chuanhua_events` `mod_verdict.latencyMs`), error codes and quota behaviour; one borderline abstract drawing; the cloud-call names resolve; **no 750031**; the checker can fetch the 600 s temp URL (V11) | AC 155, V16, V19, V3, V11 | p95 ≤ 3 s and no 750031, **or** the async fallback is applied (live rooms off) and escalated | |
| D2 | Live room, 3 accounts: create from the group card, join from two phones, try to start with 2 (refused, 两个人？去慢慢传), start with 3, play to the reveal; measure the round transition on every phone and record `rt_mode` | AC 135-148, V17 | p95 ≤ 1.5 s with `watch`, ≤ 2.5 s polling; everyone sees the reveal together | |
| D3 | Live room, 4 accounts with faults: one lets time run out on a blank canvas, one goes to airplane mode mid-round (round ends at deadline + grace with a marker, the phone rejoins), one taps 离开 (later turns are markers, it can still open the reveal) | AC 130-131, 142, 150 | as described; markers shown to the next player and in the reveal | |
| D4 | Forced send: draw continuously through 0 (the stroke in progress is kept, nothing responds after 0); describe with the keyboard open at 0 (the keyboard closes, V4); the same on PC WeChat (polling) | AC 128-129, V4, V17 | the drawing / sentence arrives; no input after 0 | |
| D5 | Canvas on iPhone and Android against spec §8.4 (screenshots); a drawing from the tall phone contain-fitted on the shorter one and vice versa (uncropped, margin tone); 60 s of continuous drawing on a mid-range Android at DPR 3 (V5) | AC 122-127, 32 | rects within 1 pt; no lag | |
| D6 | Group entry (V6): the room card and a chain card opened in the group (joinable) and from a single chat (refused "只能在发起的群里"); check the real `getGroupEnterInfo` cloudID matches the server's `CLOUD_ID_RE = /^[A-Za-z0-9_-]{8,512}$/` (a longer or different real cloudID would make every group entry fail with `BAD_CLOUDID`) | AC 96, V6, E2 | group binding works on both platforms | |
| D7 | Updatable room card (V7/V21): the count rises with each join and shows "started" after 开始 | AC 99 | or keep `features.updatableCard: false` (static card) | |
| D8 | 慢慢传 full chain with 2 accounts; a forced empty send shows 「（没来得及画）」 | AC 6, 130 | as described | |
| D9 | Subscribe on 慢慢传 (V8; needs the template, step 10): one notice at the reveal (08:00 if at night) | AC 100, 78 | one notice | |
| D10 | Reports: report the source during a live round (the reporter continues, the reveal shows the placeholder) and a step in the step-through; the other phone sees it hidden on its next fetch; console `admin listReports / upholdReport` (V14: a console invocation carries no OPENID, else set `ADMIN_OPENIDS`); two upheld reports give the 24 h restriction copy | AC 58-68 | as described | |
| D11 | Kill switches: `createEnabled:false` mid-game finishes the room into the reveal; `viewEnabled:false` hides content within 10 s on both phones (also open 本群接龙: no prompt or sentence listed; the code fix is verified, QA-R2-3); `setModeration {imageMode:'async'}` switches 开一局 off | AC 53-54, 154 | as described | |
| D12 | Ads (real ad units after 流量主): the interstitial only after leaving a reveal (3rd lifetime reveal on); none in the lobby, pick, draw, describe or round wait; with empty units every reward is no-fill (once a day); the rewarded video shows **no share page** on no-fill; confirm the production remote config keeps the interstitial ≤ 3 a day and ≥ 180 s | AC 101-106, 163, H8 | as described | |
| D13 | Backend measurements: V9 custom storage rules; V10 rasterisation time of a 2,048-high drawing (≤ 800 ms warm); V15 `getReveal` payload with 3 drawings and `getRoomReveal`; **V18 the `room_signals` watch rule** (the client query with `'{openid}'` works; a direct `db.collection('chuanhua_rooms').get()`, a read of another player's signal and a PNG `downloadFile` are all denied) | AC 57, 146 | as described | |
| D14 | Contention on the real database: script 9-10 test accounts to send in the same second at 0 s, 20 games, and the host pressing 开始 while friends join; count INTERNAL answers (must be 0), `BUSY_RETRY` answers (fine, the client retries), slots stuck `received`, and the marker rate. The room document is still the single hot document, so this is the one check that shows whether the 24 retries of TD-145 are enough on the real platform | AC 141 | no INTERNAL, no stuck slot, marker rate < 10% | |
| D15 | Deployment config per function: `chuanhua_*` names, timeouts, `TZ`, openapi permissions, the three timer triggers and their cron time zone; `ENV_KIND=prod`, `MODERATION_MODE=live` explicit on every UGC function, no `MOCK_*`; anonymous login and HTTP access off; the three sweepers answer `{"ok":true}` for `{"Type":"Timer"}` | AC 51, 57, 144 | as described | |
| D16 | Privacy and agreement: the privacy guide configured in the console; a fresh install reaches home and plays without a privacy popup (except possibly on the group-entry call, then once and play continues after refusal); 设置 > 《用户协议》 shows the **final** text and 《用户隐私保护指引》 opens the real guide; the feedback button works | AC 79, V12 | as described | |
| D17 | A 320-wide phone (or the DevTools 320 x 568 simulator) in large-text and high-contrast mode: home, pick, lobby (can the host reach 开始?), overview, draw, describe; on the pick screen and on home force an error and check that the banner and 重试 can be reached (QA-R3-1, fixed by TD-148) | AC 107, 108 | nothing cut at rest except the scroll-affordance regions; the error banner and 重试 are pinned above 就这个 and reachable | |
| D18 | Background / foreground and lock screen mid-round (V20): back before the deadline resumes with the draft and the remaining time; after it "时间到了，这一棒已自动交出" | AC 150 | as described | |
| D19 | Polling cost: one full 10-player game in poll mode; no `RATE_LIMITED` for `getRoom` (60/min) or `roomTick` (40/min); record the call count per game | spec 3A.7 | no RATE_LIMITED | |
| D20 | Record results in `docs/chuanhua/device-pass-<date>.md`; exit criteria E1-E7 | spec 16.2 | filed by the CTO | |
| **D21 (new)** | Launch splash (real AppID, after 适龄提示 is approved): shows **健康游戏忠告** and the 适龄提示 icon with the game name; the capsule menu offers **投诉**; **take a screenshot** (first 备案 screenshot). Then real-device screenshots for 备案 in the order of `beian.md` section 5, same phone, same size | rules-check 2.1, 备案 | as described; if the splash or 投诉 is missing tell the CTO (the agreement §五.6 and the room teaser rely on 投诉) | |
| **D22 (rev. 2.1)** | Greyed 换一批 on a real device: on the pick screen tap 换一批 five times (the label counts 「换一批（剩5次）」 down to 「换一批（剩1次）」); after the 5th it stays in place and size, greyed with a dashed outline, reading 「换一批机会已用完」; tapping it does nothing; 自己出题 and the 3 prompts still work. One iOS and one Android phone | AC 116-118, 164-168 (`qa/rev2.1-report.md`) | the button never disappears; no press feedback; text readable | |
| **D23 (rev. 2.1)** | Label fit with the phone's system font: at the default and at the largest system text size, 「换一批（剩N次）」 and 「换一批机会已用完」 stay on one line, 换一批 and 自己出题 share one row and 自己出题 stays above the fold (the store screenshots use Noto Sans SC as a stand-in) | AC 164-168 | no clipping, wrap or overlap | |
| **D24 (rev. 2.1)** | Kill and relaunch keeps the count: reroll 2 times, kill the game from the WeChat task switcher, reopen the same pick: the label reads 「换一批（剩3次）」, not 「剩5次」; use all 5, kill, relaunch: still greyed (real cloud backend; QA's tests used the in-memory mock) | AC 116-118, spec §17 edges 25-26 | the server's count decides, not the client's | |

---

## 7. Name a moderation ops owner (H9) and set the admin openids

1. **Name one person** (you or a delegate) and a backup who will, **every day for the first 4 weeks, then at least every 2 days**, run in the console (云函数 -> `chuanhua_admin` -> 云端测试): `{ "op": "listReports", "state": "open", "limit": 50 }` and `{ "op": "sample", "n": 20 }`, and decide each report (`upholdReport` / `dismissReport`). The full runbook with every command, the kill switches (`setUgc`) and `setModeration` is `post-release.md` section 8. Reported content is hidden at once for everyone, so a slow queue never exposes content; it delays restores and strikes. `modSweeper` logs `[ALERT]` when a report is older than 48 h. WeChat's own guidance is that the safety API does not replace human spot checks.
2. Tell the CTO the owner's name (the CTO records it in `decisions.md`).
3. **Admin openids:** `chuanhua_admin` works from the console (no OPENID). If device item D10 shows the console carries an OPENID, set `ADMIN_OPENIDS` (comma-separated openids of the owner and backup) on `chuanhua_admin` only (`post-release.md` section 7). Never paste openids into chat or the repo.
**Unblocks:** operating the game responsibly; without an owner, do not launch publicly.

---

## 8. 软著 submission (optional, your choice) [LEGAL] (H14)

Not required (only if the name has English or 软件, or brands/public figures are involved; none). Do it if you want proof of authorship. Files (all prepared, `docs/chuanhua/release/softcopyright/`): `software-description.md` (fields: name 传画接龙游戏软件, V1.0.0, environment, JavaScript, about 20,000 program lines; the excerpt is 124 files, 20,732 wrapped lines, 415 full pages, 60 pages printed; regenerated with the generator at sign-off), `user-manual.md` (screenshots, convert to PDF), `source-excerpt.txt` (60 pages: first 30 + last 30, 50 lines per page, header on every page; regenerate with `node docs/chuanhua/release/softcopyright/tools/gen-source-excerpt.js --stats` after any code change; convert to PDF). Register at 中国版权保护中心 (ccopyright.cn): company name, 营业执照, applicant identity, owner attestation (the code was produced with AI assistance: a short legal check is advised). Fees and lead time are the registry's [VERIFY]. Unblocks: nothing required.

---

## 9. Release build and upload (after you approve this specific version) (H15)

File: `docs/chuanhua/release/build-upload.md` (exact commands). **State your approval in writing: "I approve uploading chuanhua version 1.0.0"**; the CTO / release engineer does nothing until that sentence exists.

Preconditions: steps 0-5 done; real AppID in `APPID.md`; **agreement final** (step 1) and `node tools/build-terms.js --release` passes; **H13 signed** (step 2); V16 proven or the async fallback accepted in writing; device pass done or its open items accepted; 适龄提示 submitted; QA rev. 3 gate passed (done; the QA status in the header).
Commands (CTO, on a release branch, never `main`): cloud functions `cd apps/chuanhua/cloudfunctions && npm test && npm run pack`; game `cd apps/chuanhua/game && node tools/build-terms.js --release && node tools/release-config.js --env <envId> --appid <REAL_APPID> --ad-rewarded <adunit-...> --ad-interstitial <adunit-...> --prefixed-functions`, `npm test`, upload, then `node tools/release-config.js --dev` (restores the test AppID and empty ad units; `git status` must be clean; never commit the release state). No file is edited by hand.
Upload: **DevTools** (open `apps/chuanhua/game`, version 1.0.0, remark in `build-upload.md` section 4), or `miniprogram-ci` with the key at `MP_UPLOAD_KEY_PATH` (you generate the key in MP 开发设置, store it outside the repo, **whitelist the uploading machine's IP** in the same page or the upload fails, never paste the key). Result: a **development version**.
**Then you, in mp.weixin.qq.com:** 版本管理 -> 开发版本 -> 提交审核: choose the 开发引擎 (native JavaScript on Canvas [VERIFY option]), confirm the privacy guide and 适龄提示, paste the 版本更新说明, optional 宣传图 (`screenshots/02, 04, 07, 08, 03`), the 开发者信息 the form requires, submit. Review takes about 1 natural day. After approval **and the 备案号**, you click 发布. **Agents never submit or publish.**

---

## 10. Post-release

File: `docs/chuanhua/release/post-release.md` sections 8-13.
1. **流量主 (H8):** eligible when any one of: cumulative UV > 500 (no fake traffic); game circle + 5 posts; a same-company mini program earning for a quarter. MP -> 流量主 -> 开通 (signing and settlement are yours). Create three ad units: **激励视频, 插屏, Banner**. Give the CTO the unit IDs (not secret): rewarded and interstitial go into `js/build-config.js` `adUnits` (one more build and upload, e.g. 1.0.1); the banner ID and `enabled: true` go into `chuanhua_app_config.live.ads.banner` (live edit). Then device item D12.
2. **Subscribe template (H7):** MP -> 订阅消息 -> 公共模板库: a **one-time** template for "接龙揭晓了" with about three keywords. Put its **模板 ID** and keyword keys in `chuanhua_app_config.live.subscribe` (JSON in `post-release.md` section 9). No rebuild. Then D9. Without it the offer stays hidden.
3. **Image-quota raise (H11):** when the log shows `[ALERT]` at 70% of 200,000 checks a day, ask WeChat to raise it; at 95% new rooms pause.
4. **Watch:** first week: the three timers fire, no `[ALERT]`, reports reviewed daily, marker rate (「（这一棒没传过来）」) and image-check p95 (≤ 3 s), `features.liveRooms` still true. KPIs in `post-release.md` section 12 (rooms started ÷ created ≥ 50%, reach-the-reveal ≥ 90%, D1 ≥ 35%).
5. **Retire the shared test state:** if the real or the shared test environment was used for testing before launch, do the "Reset after a test run" in `post-release.md` section 13 (irreversible deletion: your decision, only `chuanhua_` collections).
