# 点将台 (dianjiangtai): Founder Handoff

Author: release, for the CTO. Date: 2026-10-15. Build: `kept-ideas/v1` at commit `3df1b89333d8d05b1d008ce57bfd29b2d1f46452` (v1: contentVersion 2, configVersion 3, 120 generals; the code is identical to 6582873). **QA status: QA re-check passed at 3df1b89333d8d05b1d008ce57bfd29b2d1f46452: 0 FAIL, 2 device items (AC 16, AC 75)** (`docs/dianjiangtai/qa/ac-matrix.md`). **CTO final review and sign-off: DONE (2026-10-15, `decisions.md` TD-16).** One ordered checklist of everything only you can do (constitution Art. 5, 6). For each step: values to paste, files, and what it unblocks. Agents have done none of it: no registration, filing, upload, deployment, payment or release.

> **AppIDs.** During development, QA and the test harness use the **shared test AppID `wxcd03c1b62d7eb0e0`** (committed in `apps/dianjiangtai/game/project.config.json`, per CLAUDE.md). The **release build uses the game's own AppID `wx172906d7bfd6036f`**, which is **already registered**; it is written into the build only with `node tools/release-config.js --env <envId> --appid wx172906d7bfd6036f` (section 7) and is never committed. An AppID is public; **the AppSecret, the upload key and `GROUP_REF_PEPPER` are never pasted into chat or the repo.** Open **`apps/dianjiangtai/game`** in DevTools, never `apps/dianjiangtai` (`APPID.md`).

## Read this first: what is done, what blocks, how long it takes

- **Done and verified (release, at 3df1b89):** `npm test` in the game: 379 tests, **dev state (real tree) 378 pass, 0 fail, 1 skipped; release state (scratch copy, real AppID, with and without ad flags) 377 pass, 0 fail, 2 skipped**; cloud functions **182 tests, 182 pass, 0 fail**; release package **609,642 bytes = 0.58 MiB of the 4 MB limit** (62 files, no subpackage; includes the four WAV sound cues and `share-fallback.png`); the release switch and `--dev` restore rehearsed; the seed-bank commands rehearsed (60 accepted seeds in 347 s, `prepare-bank.js` 60 written, 0 skipped, configVersion 3); no secrets in the repo; the content statNotes and the sound are finished; release pack complete (`docs/dianjiangtai/release/`). The 16 store screenshots, 4 share images and the 软著 excerpt (60 pages) are generated.
- **Blocks release (only you can clear):** section 0 (confirm the name, category, 认证, **适龄提示**), section 2 (privacy guide), section 3 (备案, the long pole), section 4 (cloud environment, console hardening, seed bank), section 5 (device pass), section 1 (content sign-off).
- **Ads need nothing from you for the first upload.** With no 流量主 ad unit ids the release build runs no-fill ("暂无广告，本次免费" once per run, never a test overlay), because the release switch forces `stubAds` to `false`. Real ads come later, with both ad unit ids on a later build (section 8). Device-only, not blocking: the 复盘 wall-clock checks (AC 16, AC 75) are judged on a real phone or a quiet machine (section 5).
- **Timeline (important):** 备案 is two sequential filings: 小游戏备案 10-20 working days (plus 1-2 platform), then 小程序备案 10-30 working days (about 4-10 weeks in total, official figures), and **适龄提示 and 认证 must be done before they start**. There is **no date in the build**: the daily seeds come from the bank in order and issue 1 is the `LAUNCH_DATE_KEY` you set, so a late launch date costs nothing to change. Tell the CTO the real launch date when you know it.
- **Order that saves time:** 0 -> start 认证 (if not done), 适龄提示 and 备案 immediately (they run in parallel with everything else) -> 1 (content sign-off) in parallel -> 2, 4 -> 5 -> 6 (optional) -> 7 (after your written approval) -> 8.

Files: all under `docs/dianjiangtai/release/`: `registration/` (REGISTRATION-STEPS.md, copy.md, rules.md, avatar/), `privacy-guide.md`, `beian.md`, `softcopyright/`, `store-listing.md`, `screenshots/`, `rules-check.md`, `content-review.md`, `build-upload.md`, `post-release.md`, `release-checklist.md`, `APPID.md`, `tools/`.

---

## 0. Registration: already done. Verify it (15 minutes) [no new registration]

Status: **the account and the AppID `wx172906d7bfd6036f` exist** (you registered them). Nothing to register. The long form is `registration/REGISTRATION-STEPS.md`; every text is in `registration/copy.md`. Cost: 0 RMB now (300 RMB for 认证 only if it is not done yet [MONEY]). Time: 15 minutes in the console.

**0a. AppID.** MP -> 开发管理 -> 开发设置: it must read `wx172906d7bfd6036f`, account type 小游戏. **Never copy the AppSecret anywhere.**

**0b. 基本信息** (设置 -> 基本设置 -> 基本信息): compare with this and change only what differs.
- 名称: the one you registered (primary `点将台·三国`; fallbacks `三国点将台`, `点将台·每日军令`, `点将台`). **Tell the CTO which one was accepted**; it goes into `APPID.md` and must be the name on both 备案 forms. Lock it before 备案 (2 changes a year; none while a filing is in review).
- 简称: the same as the name, if asked.
- 介绍 (56 characters, limit 60): `三国选将策略游戏。每日军令人人相同：翻令定势力与时代，点五将任主公、军师、先锋、猛将、守将，出征十二战评定战绩。` (alternative I4, 49 characters, mentions 识人 and the boards: `三国选将小游戏：每日同一道军令，翻令点五员武将，出征十二战评战绩。周日识人，另有群排行与好友挑战。`)
- 头像: `docs/dianjiangtai/release/registration/avatar/avatar-B-512.jpg` (PNG alternative `avatar-B-512.png`; masters `avatar-B-1024.*`; `avatar-A-512.png` is the exact in-game stamp).

**0c. 服务类目** (首页 -> 小程序类目): 一级 游戏; 二级 **休闲** (locked after the first release); 三级 the closest option the console lists under 休闲 (first choice 策略 if offered, else **益智**, else 答题); 资质 scenario **情况二** (no virtual payment now or later). **Do not apply for any payment qualification.** Screenshot the category path and the 所需资质 list and send both to the CTO. If the list asks for anything beyond the IAA route, stop and send it: the cause is usually a name-protection hit, and the answer is a different name.

**0d. 微信认证** (设置 -> 微信认证): check whether it is done. If not: 300 RMB, 1-3 working days; 营业执照, a 公函 signed by the legal representative and stamped with the **公章**, the admin's identity and a verification call. It unblocks both 备案 filings, 流量主 and more tester slots.

**0e. 适龄提示 (MP -> 设置 -> 基础设置 -> 基本信息 -> 适龄提示 -> edit and submit).** Required before the 小游戏备案 is processed and before version review ([NRJS] Q2). **I recommend 12+.** Reason, from the official criteria table (https://developers.weixin.qq.com/minigame/introduction/guide/slts.html, read 2026-10-15): the 12+ column describes a game like this one ("部分基于历史和现实事件的改编，但不会与现实生活相混淆"; "清晰完整的适量故事背景和人物关系"): 点将台 is a 三国 history-based game with a five-camp cast of 120 real people. The rest of the game fits the band: cartoon/hand-drawn art (code-drawn seals), no stranger chat, only a simple friend/group ranking, non-realistic competition. The page says the table is for reference and you set the band from the real content; a band that does not match the content can make the platform re-mark it, which can delay the filing. You confirm the band; the platform then shows the icon next to 健康游戏忠告 on the launch screen.

**0f. Tell the CTO:** the accepted 名称 and 简称, the category path (with the screenshots), the 认证 status, the 适龄提示 band you submitted, and the launch date you are aiming for.
**Unblocks:** both 备案 filings, the privacy guide's contact fields, version review (a level-2 category that does not match is rejected), 流量主 later.

---

## 1. Content sign-off (spec H8, AC 59, D8): blocks release

**What the spec requires, exactly.** Spec §19 H8 and AC 59 require that the **临阵生变 template list and the v1 roster's `statNote`s are reviewed in release's content review, and that the review is recorded before any submission**. That review is done (release, this pack): `content-review.md` is generated from the shipped content, the hard checks pass, the four 临阵生变 lines are neutral, and the findings are listed. The spec does **not** require a human historian to audit the 120 characters' stats: the five numbers are the studio's own judgement (INFERENCE, each with a one-line `statNote` and a `source`), and the founder cleared historical content and AIGC labelling in D14. **What I ask of you is a sign-off, not an audit.**

**Do:**
1. Read `docs/dianjiangtai/release/content-review.md` sections 1-4 (about 20 minutes): the automated checks, the narrative strings players see, the 11 generals who can trigger 临阵生变, and the 15 advisories.
2. **Recommended, optional (1-2 hours, or split between people):** skim section 5 (all 120 rows) for historical errors or tone you dislike; mark OK / FIX / DROP in the empty 人工复核 column. Pay attention to the generals with stat 1 (刘禅 勇1, 董卓 仁1, 孙皓 仁1) and the turncoat labels (孟达, 糜芳, 吕布).
3. **Already done (TD-10):** the ten `statNote`s that carried developer shorthand (赵云, 马超, 黄忠, 姜维, 张郃, 夏侯惇, 张辽, 司马懿, 邓艾, 吕布) are rewritten as short neutral historical notes, and 孟获 now reads 南中各族所服. `content-review.md` is regenerated from the final text, so you sign off the text that ships. Stats are unchanged and **`contentVersion` was not bumped** (a bump would make the seed bank unusable). Any later content edit needs a fresh look at the changed rows.
4. Tell the CTO "content signed by <name>, <date>"; the CTO records it in `release-checklist.md` (AC 59 closes).
**Unblocks:** version submission.

---

## 2. Privacy guide entry (用户隐私保护指引)

File: `docs/dianjiangtai/release/privacy-guide.md` (audit of every `wx` call, items to declare, full text to paste, spec cross-check; no code mismatch).
1. MP -> 设置 -> 服务内容声明 -> 用户隐私保护指引 -> 更新.
2. Declare **微信朋友关系** (item 1) and **相册（仅写入）** (item 2) with the purpose and retention texts in the guide, then add custom items 3-10 (OpenID, 群聊标识, 游戏记录, 挑战数据, 订阅消息授权记录, 使用日志, 安全与防作弊记录, 反馈信息) exactly as in the table. If the console also lists 昵称、头像, declare it with the item-1 text; if it lists anything else, stop and tell the CTO.
3. Paste the full body text from the guide's code block. Fill the three placeholders: **更新日期** (launch date), **企业全称**, **联系方式** (a monitored email or phone). Retention is **180 days** (rate counters about one day).
4. Submit the guide for review.
5. MP -> 设置 -> 基本设置 -> **隐私授权弹窗** -> enable the official popup (cannot be switched off afterwards; intended).
**Unblocks:** friend and group names on the boards (without the 微信朋友关系 declaration `setUserCloudStorage` fails with 112 and the boards show the privacy state), saving the result card (without 相册（仅写入）, 112), version review, device items E4 and E9.

---

## 3. 备案 (filing) [LEGAL, long pole]

File: `docs/dianjiangtai/release/beian.md` (both filings, every field, the service description to paste, screenshots).
Prerequisites: 认证 finished, name accepted and locked, **适龄提示 submitted** (section 0). Route: **情况二 (IAA, no virtual payment). No 版号 and no 软著 are required.**
1. **小游戏备案:** MP -> 设置 -> 小程序备案 -> 去完善 -> 小游戏备案 -> 前往提交. Paste the service description (`beian.md` section 3), upload screenshots (`docs/dianjiangtai/release/screenshots/01..16`, or real-device shots, **same size**; the first gameplay shot should show 健康游戏忠告 + 适龄提示 + game name, which needs a real phone: section 5). Wait 1-2 working days (platform) + 10-20 working days (主管部门). **Do not change the name or company meanwhile.**
2. **小程序备案:** same menu, 去完善, choose **情况二**. Fill the entity fields (营业执照, 统一社会信用代码, address, 负责人 and 小程序负责人 with ID, phone, email, an 应急联系人 with a **different phone**), face check (plain light background, no hat/mask/headphones), confirm the 互联网信息服务承诺书. **No domain to declare** (the game calls cloud functions only, no `wx.request`).
3. **Answer the SMS from 12381 within 24 hours** (beian.miit.gov.cn): a missed window rejects the filing automatically.
4. When the 备案号 is issued, tell the CTO. It appears on the game's 更多资料 page after release.
**Unblocks:** release (version review can run in parallel, but **publishing needs the 备案号**).

---

## 4. Cloud environment, deploy, console hardening (H6a) and the seed bank [MONEY: your billing choice]

File: `docs/dianjiangtai/release/post-release.md` sections 1-5 (full detail), `apps/dianjiangtai/cloudfunctions/README.md`.

**Collections note (read once).** 点将台's collections are **not prefixed** (`runs`, `events`, `meta`, ...). That is fine for the release: the real AppID has **its own cloud environment**, nothing else lives there. The other four studio apps all prefix theirs (`kedupan_`, `bibiyi_`, `yuyirelen_`, `chuanhua_`), so **there is no actual clash even on the shared test environment today**. The warning is only for testing 点将台 on the **shared test environment** (test AppID): its generic names sit beside the other apps' prefixed ones, a later unprefixed app would collide, and a test run leaves data (an old `meta/launch`, used seeds) that must be reset before launch (`post-release.md` section 8). Do that only on purpose.

1. 开通云开发 for the **real AppID**; create environment **`dianjiangtai-prod`**; give the CTO the environment ID (`dianjiangtai-prod-xxxx`).
2. The CTO runs `cd apps/dianjiangtai/cloudfunctions && npm test && npm run pack` (**14 function folders** named `dianjiangtai_<name>` in `apps/dianjiangtai/game/cloudfunctions-deploy/`; 182 tests, about 2 minutes).
3. In WeChat DevTools, for each of the 14 folders: 上传并部署：云端安装依赖; for the 2 timer folders (`dianjiangtai_genDaily`, `dianjiangtai_cleanup`) also 上传触发器. Then set each function's **timeout** and **TZ** by hand (`post-release.md` section 3: `getDaily` 20 s, `submitRun` and `getReplay` 10 s, `genDaily` and `cleanup` 60 s, all others 5 s; `TZ=Asia/Shanghai` on every function). Approve the `subscribeMessage.send` cloud-call permission for `dianjiangtai_submitRun`.
4. Console -> 数据库: create the **17 collections** `daily_seeds`, `daily_seed_bank`, `runs`, `daily_starts`, `daily_results`, `group_members`, `challenges`, **`challenge_answers`**, `daily_stats`, `events`, `rate_limits`, **`meta`**, `player_stats`, `daily_progress`, `sub_grants`, `anomalies`, `app_config`; set the rule `{"read": false, "write": false}` on each; create the indexes from `post-release.md` section 2.
5. Environment variables: `GROUP_REF_PEPPER` on **`dianjiangtai_joinGroup` and `dianjiangtai_createChallenge`** (the same value): a random value of **at least 32 characters** that you generate (e.g. `openssl rand -hex 24`); a shorter value makes both functions return `SERVER_CONFIG`; store it in the company password manager; never paste it in chat. `LAUNCH_DATE_KEY` = the launch date `YYYYMMDD` on `dianjiangtai_getDaily` **and** `dianjiangtai_genDaily`.
6. Create the `app_config` record `_id: "live"` with the JSON in `post-release.md` section 4 (subscribe left out, banner off, interstitial defaults).
7. **Console hardening, H6a (one time).** Cloud Storage -> Permissions -> Custom rules: paste exactly `{"read": false, "write": false}` (the contents of `apps/dianjiangtai/cloudfunctions/storage/rules.json`). Cloud Development -> Settings: keep **anonymous / web (Web SDK) login DISABLED** and **HTTP access (HTTP 访问服务) DISABLED** for every function; never add an HTTP trigger. These are the only ways to call a function without a WeChat OPENID. Re-check after any console change. **Launch blocker if skipped.**
8. **The seed bank (PO-17: at least 60 days, contentVersion 2, configVersion 3; effectively a launch blocker for the daily).** V1-2 is settled (configVersion 3 is final), so generate the bank now. **Any bank generated before this build (configVersion 2) is unusable: do not import one.** On a PC with Node >= 20 and the repo on the release branch, **outside the repo folder**:
   ```
   export BANKDIR="$(mktemp -d)"
   node apps/dianjiangtai/game/tools/simstats.js --bank 60 --bank-only --bank-file "$BANKDIR/bank-cv2-60d.json"
   node apps/dianjiangtai/cloudfunctions/scripts/prepare-bank.js "$BANKDIR/bank-cv2-60d.json" "$BANKDIR/bank.import.jsonl"
   ```
   (about 6 minutes on 8 cores, longer on fewer; expect "wrote 60 entries ... (0 skipped)"; the CTO or backend can run it for you). Console -> `daily_seed_bank` -> 导入 `$BANKDIR/bank.import.jsonl`, file type JSON Lines, conflict mode **insert/skip, not overwrite**. Check: 60 documents, `used:false`, contentVersion 2, configVersion 3, gateVersion 1. **Delete both local files** (they list future daily seeds: spoilers; never commit them). Do 90 instead of 60 if you will test on the real environment first (each test day consumes an entry; top-up command in `post-release.md` section 4).
9. **Evening before launch (so day 1 is not empty):** Cloud Functions -> `dianjiangtai_genDaily` -> 云端测试, with the test event `{"Type":"Timer","TriggerName":"manual"}`. Any timer function tested without that `Type`/`TriggerName` returns `FORBIDDEN` (correct). Alternatively open the game once that evening.
**Unblocks:** everything online (daily, boards, challenges, history); device items E1-E3, E6, E11.

---

## 5. Device pass (spec §17.1; before submitting for review)

Needs: one **iOS and one Android** phone (WeChat base library >= 3.8.8), **three mutual-friend WeChat accounts** and a test group containing them, PC WeChat for E12, the privacy guide and 微信朋友关系 / 相册（仅写入） declared (section 2), the cloud deployed with the seed bank imported (section 4), the CTO and backend on call. **Two ways to run it:** (A) on the **test AppID** with a test cloud environment: `node tools/release-config.js --env <testEnvId>` (no `--appid`), 真机预览 from DevTools, then `--dev` afterwards: this needs no upload, but the guide, the template and the ad units belong to the real AppID, so the items marked (real AppID) cannot pass this way, and on the shared test environment the collections are unprefixed (section 4 note); (B) on the real AppID's **体验版** after the upload in section 7 (requires your written approval of that upload): this is the only way to finish the (real AppID) items, and you do it before you submit for review. Send the CTO a dated note of results (spec E7); the CTO updates spec §17. **The result column is yours.**

| # | Check (spec §17.1) | **Pass criterion** | If it fails (fallback already built) | Result |
|---|---|---|---|---|
| E1 (also AC 35, 62, 96) | Share the game card to the test group; open it from the group on iOS and Android; also from a single chat; repeat on a warm start | the raw cloudID is resolved **on the server** (`cloud.getOpenData`): a `groupRef` comes back on **both** platforms and the home banner "来自群聊 · 查看本群今日排行" shows; from a single chat there is **no** group context (`NOT_GROUP` or 40097) and no `group_members` document | no group board (explainer only); daily, friend board and challenges unaffected | |
| E2 | Friend and group rows carry `openid` (and which friends are returned) | nicknames/avatars matched on 群榜 and 好友榜 on both platforms | §11.8 fallback: Ed25519-signed values, then B-lite (CTO) | |
| E3 | Hash join of a large board in the open data domain | 500 rows < 50 ms on Android; a `getBoard` payload of >= 1,000 rows passes `callFunction` and `postMessage` | lower `boardListCap` (>= 300 rows work), or §11.8 | |
| E4 (real AppID) | First privacy popup and friend-scope prompt; refusal; settings recovery | no prompt at launch or during a free run; the popup appears only after a tap (a ranked daily result, 群榜/好友榜) or 保存图片; **refuse**: boards show the privacy-not-agreed state with your own result, no re-prompt, play unaffected; enable 微信朋友关系 in settings, return: the board renders | own dialog via `onNeedPrivacyAuthorization` | |
| E5 (real AppID, ad units) | Rewarded video with no fill; interstitial errors | no platform share page on a rewarded no-fill (`disableFallbackSharePage`); a second no-fill for the same placement in a run shows "暂无广告，请稍后再试" and grants nothing; interstitial 2001/2002/2003 skipped silently, 再来一局 never delayed. **With no ad units the build is no-fill (TD-11): see Extra 7** | stub path already exercised in the harness | |
| E6 | `genDaily` timeout and timer: 23:00 `genDaily`, 04:00 `cleanup` | each fires **once** (event/log), a double fire is a no-op; the date key is right at 15:59:59 / 16:00:00 UTC; `genDaily` takes a bank entry (`source: bank`) | bank is mandatory (already); raise timeout | |
| E7 | Results note | a dated device-pass note sent to the CTO (items, phones, outcomes) | n/a | |
| E8 (real AppID, template) | Subscribe: create a challenge, tap 提醒我, accept; answer it from a second account | exactly **one** service notice at the first answer, opening the challenge's own view; refuse once: no re-prompt; remove the template id: the offer disappears | `features.subscribe` stays null (hidden) | |
| E9 | Save to album, first time on a fresh account | privacy popup then the album prompt; refuse: the 去设置 sheet only; enable: save works; the daily card has **no general names** | 保存图片 hidden | |
| E10 (real AppID, banner unit) | Banner once a 流量主 unit exists | banner only on 群榜/好友榜 ready or empty states; >= 24 pt gap; never covers a row or button; default off | banner stays off | |
| E11 | Progressive daily on mobile data on both phones; airplane mode before a flip | `round_fetch` p95 <= 1.5 s (the flip animation covers 1.2 s); airplane mode shows "令牌传递中断" + 重试 and resumes the same round | backend tunes `getRound`; up to 3 s p95 acceptable; the CTO decides beyond | |
| E12 | 大字模式 and 高对比度 on the smallest phone (about 320 x 568) and on PC WeChat | nothing clipped or overlapping, the content scrolls; **at 320 x 568 in large text with the group banner, the home list scrolls behind the pinned daily card and a pill "下滑查看更多" (TD-15) shows while more content is below and hides at the end: confirm the pill appears, never covers an entry, and 往期 / 玩法 are reachable**; **note:** the renders show the home screen without the seal and title in large-text mode (`screenshots/README.md`): confirm it looks intended | layout fix before submission (must-fix, no fallback) | |
| Extra 1 | Launch splash | shows **健康游戏忠告** and the 适龄提示 icon after the band is approved; **take a screenshot**: it is the first 备案 screenshot | tell the CTO (`rules-check.md` 1.16) | |
| Extra 2 | Real-device screenshots for 备案 | same phone, same size, in the order of `beian.md` section 4 | n/a | |
| Extra 3 (security, spec §17.1 item 1, AC 96, 100) | (a) With a console call to `dianjiangtai_joinGroup`, send `{groupData:{cloudID:"x",data:{opengid:"X",chat_type:3}}}` and a malformed `{cloudID:"!!"}`; (b) test `dianjiangtai_genDaily` with `{}` and then with `{"Type":"Timer","TriggerName":"manual"}` | (a) both return `BAD_CLOUDID` and `group_members` gets no row; (b) `{}` returns `FORBIDDEN`, the marker event runs | CTO fixes before submission | |
| Extra 4 (spec §17 #18) | PC / Mac WeChat layout of home, draft and result | no clipping, portrait letterbox acceptable | layout fix | |
| Extra 5 (spec §17 #25-27) | The three "not checked in P0" APIs: banner (E10), subscribe (E8), album (E9) | as above | each hides itself | |
| Extra 6 (QA D-13) | Sound: play a free run on iOS (with the silent switch on and off) and on Android; turn 声音 off on the home screen and in settings | four cues are heard (flip, pick, win, loss) with acceptable loudness and latency; the toggle mutes them and the choice survives a restart | tell the CTO (the toggle is the founder-requested control; cues are generated files) | |
| Extra 7 (QA D-14) | A **release build both with and without ad unit ids**: (a) as uploaded, with no `--ad-rewarded` / `--ad-interstitial`; (b) later, with both ids | (a) no "广告位（测试）" overlay anywhere; ▶ 视频再换 and 复盘 behave as no-fill, "暂无广告，本次免费" once per run and a second failure in the run grants nothing; the interstitial never shows; (b) the real ad loads and plays, a no-fill follows E5 | stop; tell the CTO | |
| Extra 8 (QA D-8; AC 16, AC 75) | 复盘 timing: light sets under 300 ms p99 on the reference mid-range Android; `getReplay` p99 on mobile data; the offline fallback on a heavy set must not freeze the UI. **Judge the 复盘 wall-clock checks on a real phone or a quiet machine**: the automated wall-clock test (AC 16 / 75) is load-sensitive and failed once on a busy machine, so a slow result on a loaded PC is not a verdict | as stated, on the phone | the CTO tunes `getReplay` or the client threshold | |

Do NOT test E5/E8/E10 against live ad units by clicking your own ads (risk of a 流量主 violation): view, do not click.

---

## 6. 软著 submission (optional, your choice) [LEGAL]

Not required for this game (only if the name has English or 软件, or brands/public figures are involved; none, though the historical-figure theme is the one place a reviewer could ask). Do it if you want proof of authorship for a game whose loop is easy to clone. Files (all prepared): `softcopyright/software-description.md` (fields: 点将台游戏软件, V1.0.0, environment, JavaScript, about 12,970 source lines in 80 files), `softcopyright/user-manual.md` (with 16 screenshots, convert to PDF), `softcopyright/source-excerpt.txt` (60 pages: first 30 + last 30, 50 lines per page, header on every page; regenerate with `node docs/dianjiangtai/release/softcopyright/tools/gen-source-excerpt.js --stats` after any code change; convert to PDF). Register at 中国版权保护中心 (ccopyright.cn): company name, 营业执照, applicant identity, owner attestation (the code and the roster text were produced with AI assistance: a short legal check is advised). Fees and lead time are the registry's [VERIFY]. Unblocks: nothing required; protection and any later platform request.

---

## 7. Release build and upload (only after you approve this specific version in writing)

File: `docs/dianjiangtai/release/build-upload.md` (exact commands). **State your approval in writing: "I approve uploading dianjiangtai version 1.0.0"**; the CTO/release engineer then does nothing until that sentence exists. Submitting for review and publishing are yours alone (Art. 5.2); an agent never does either.

**Preconditions:** sections 0, 1, 2, 4 done (incl. steps 7-9); the real AppID `wx172906d7bfd6036f` in `APPID.md`; the seed bank (configVersion 3) imported; section 5 run on the test AppID (way A) or its open items accepted by you in writing. **No ad unit ids are needed**: the first build runs no-fill (TD-11), and 流量主 cannot give you ad units before the game has traffic. The (real AppID) items of section 5 are finished on the 体验版 after this upload and before you submit for review.
**Commands** (CTO, on a release branch, never `main`): cloud functions `npm test && npm run pack`; game `node tools/release-config.js --env <envId> --appid wx172906d7bfd6036f [--ad-rewarded adunit-... --ad-interstitial adunit-...]` (the ad flags only once the units exist), `npm test` (expect 0 fail; 377 pass, 2 skipped in release), `node tools/release-config.js --status`, then check that the ignore list holds `js/mock-server.js` and `js/stub-render.js` and that `node docs/dianjiangtai/release/tools/package-size.js .` prints `files 62 bytes 609642` (609,688 with two ad unit ids; 0.581 MiB) and no finding, then upload. **The release switch must run first**: the committed dev state ships the mock server and uses the test AppID with an empty cloud environment.
**Upload:** **DevTools** (open `apps/dianjiangtai/game`, AppID shown must be `wx172906d7bfd6036f`, version 1.0.0, remark "首个版本：每日军令、自由点将、十二战战报与复盘、周日识人、连续出征与往期、群榜与好友榜、同签挑战。"), or `miniprogram-ci` with the upload key at the path in the `MP_UPLOAD_KEY_PATH` environment variable (you generate the key in MP 开发设置, store it **outside the repo**, never paste it; **whitelist the uploading machine's IP** in the same page or the upload fails). Result: a **development version**. Afterwards the CTO runs `--dev` and `git status` shows no change.
**Then you, in mp.weixin.qq.com:** 版本管理 -> 开发版本 -> 提交审核: choose the 开发引擎 (self-developed / native JavaScript on Canvas [VERIFY option]), confirm the privacy guide and 适龄提示, paste the 版本更新说明 (`store-listing.md` section 2), optional 宣传图 (`screenshots/`), **开发者信息** (the console requires an Apple developer account entry; an email address is accepted [VERIFY]), submit. Review takes about 1 natural day. After approval **and the 备案号**, you click 发布. **Agents never submit or publish.**
Unblocks: the live game.

---

## 8. Post-release

File: `docs/dianjiangtai/release/post-release.md` sections 4-9.
1. **流量主:** eligible when any one of: cumulative UV > 500 (no fake traffic); game circle + 5 posts; a same-company mini program earning for a quarter. MP -> 流量主 -> 开通 (signing and settlement details are yours). Create three ad units: **激励视频, 插屏, Banner**. Give the CTO the unit IDs (not secret): rewarded and interstitial go into the client (`--ad-rewarded`, `--ad-interstitial`, one more build and upload, e.g. 1.0.1); the banner ID and `enabled: true` go into `app_config.live.ads.banner` (you can edit it live). Then device items E5 and E10.
2. **Subscribe template:** MP -> 订阅消息 -> 公共模板库: a one-time template with three text keywords and one time keyword; put its **模板 ID** and the keyword keys in `app_config.live.subscribe` (JSON in `post-release.md` section 4). No rebuild needed. Then device item E8.
3. **KPIs to watch** (spec §15; healthy / watch): share rate >= 10% / < 4%; card-open-to-play >= 25%; completed runs per session >= 3 / < 2; D1 >= 35% (launch target 40%); D7 >= 15%. First-week checks: the 2 timers fired once each; the bank count falls by one a day (top up at fewer than 10, `post-release.md` section 4); no `[ALERT]` lines; the anomaly roll-up near 0.
4. **Retire the test state:** if the real environment or the shared test environment was used for testing before launch, do the "Reset after a test run" in `post-release.md` section 8 (irreversible deletion: your decision) so launch day is issue 1.

---

## Spec §19 mapping (AC 95)

| Spec item | Where in this Handoff |
|---|---|
| H1 game-category access, 认证 | section 0 (0c, 0d) |
| H2 privacy guide: 微信朋友关系, 相册（仅写入), official popup | section 2 |
| H3 subscribe template | section 8 step 2; `post-release.md` section 6 |
| H4 流量主 and ad units, banner switch | section 8 step 1; no precondition: the first build runs no-fill without ad unit ids |
| H5 seed bank (>= 60 days, contentVersion 2) | section 4 step 8 |
| H6 environment variables (`GROUP_REF_PEPPER` >= 32, `TZ`, `LAUNCH_DATE_KEY`) and the `subscribeMessage.send` permission | section 4 steps 3, 5 |
| H6a console hardening (storage deny-all, anonymous/web login OFF, HTTP access OFF, database rules, timer test event) | section 4 steps 4, 7, 9 |
| H7 device pass E1-E12 | section 5 |
| H8 content review (临阵生变 templates, `statNote`s) | section 1 |
| H9 approve upload and release | section 7 |
