## Registration (already done: verify it, do not redo it)

Status: **the account is registered and the AppID is `wx172906d7bfd6036f`** (the founder did this before the release pack; an AppID is public, not a secret). Date: 2026-10-15, written by release for the v1 build (`kept-ideas/v1` @ 3df1b89333d8d05b1d008ce57bfd29b2d1f46452, the code is identical to 6582873). This file replaces the "register from scratch" steps of the other studio packs with a **verification pass**: 15 minutes in the MP console, no new registration. Nothing here was done by an agent, and nothing can be verified from the repo: the console is the authority.

Legend: **[MONEY]** you pay; **[LEGAL]** you attest or sign for the company; **[CREDENTIAL]** your passwords or keys, which never go in chat or in the repo. Files: `copy.md` (every text, with the v1 release check in its section 0), `rules.md` (long-form platform rules, annotated 2026-10-15), `avatar/` (final files). The account steps for a from-scratch registration are in `rules.md` Step 1-3 and in `docs/kedupan/release/registration/REGISTRATION-STEPS.md` (same for every studio game); you do not need them again.

### Step 0. Confirm the AppID and who owns it

Where: https://mp.weixin.qq.com -> 开发管理 -> 开发设置 -> AppID(小程序ID).
- It must read `wx172906d7bfd6036f` and the account type must be **小游戏** (the first-level category 游戏 cannot be changed afterwards).
- Note the account's 主体 (the Beijing company) and that it is the same company that will file the 备案 and sign the 流量主 agreement.
- **Do not copy the AppSecret anywhere** (not chat, not the repo; the cloud functions never use it). Do not copy the upload key either (`MP_UPLOAD_KEY_PATH`, section 7 of the Handoff).

### Step 1. 基本信息: name, short name, avatar, introduction

Where: 设置 -> 基本设置 -> 基本信息 (or 首页 -> 小程序信息). Compare what is saved with this table; change only what differs.

| Field | Expected value | Notes |
|---|---|---|
| 名称 | the name you registered: one of `点将台·三国` (primary), `三国点将台`, `点将台·每日军令`, `点将台` (copy.md section 1) | **Tell the CTO the accepted name.** It must equal the name on the 小游戏备案 and 小程序备案 forms. Lock it before 备案: no name change while a filing is in review (nrjs.html). 2 name changes per year |
| 简称 | the same as the name, if the form asked | 4-10 characters, CJK = 2 |
| 介绍 | I1, 56 characters: `三国选将策略游戏。每日军令人人相同：翻令定势力与时代，点五将任主公、军师、先锋、猛将、守将，出征十二战评定战绩。` (alternatives I2-I4 in copy.md) | limit 60 for this studio, official range 4-120 |
| 头像 | `avatar/avatar-B-512.jpg` (JPG) or `avatar/avatar-B-512.png` (PNG); masters `avatar-B-1024.*`; 144 px is the minimum | the cinnabar seal 将 on 宣纸; original, no person, no mark. `avatar-A-512.png` is the exact in-game 点将 stamp (PNG only) |

The introduction and name were checked against the v1 build on 2026-10-15 (`copy.md` section 0): no contradiction, no forbidden or absolute wording.

### Step 2. 服务类目

Where: 首页 -> 小程序类目 -> 添加类目 (the admin scans a QR code); later 设置 -> 基本设置 -> 服务类目.

| Field | Value |
|---|---|
| 一级类目 | 游戏 (fixed) |
| 二级类目 | **休闲** (locked after the first release; if the console also offers 策略 and you prefer it, pick before release and tell the CTO) |
| 三级类目 | the closest option the console lists under 休闲: first choice a strategy or casual-draft style entry (策略 if offered), else **益智** (the choice made for the sister game 群友刻度盘), else 答题. Level 3 can be changed later with a re-review and a new version |
| 资质 | scenario **情况二** (no virtual payment now or in future). **Do not apply for any payment qualification.** 版号 is not part of this route |

Take a screenshot of the category path and of the 所需资质 list and send both to the CTO. If the list asks for anything beyond the IAA route (a 版号, a 软著 requirement other than the optional one, a licence), stop and send it: the cause is usually a name-protection hit (`rules.md` 2.1) and the answer is a different name, not a document.

### Step 3. 微信认证 [MONEY] [LEGAL]

Where: 设置 -> 微信认证. **Check whether it is already done.** If not, start it now: 300 RMB, 1-3 working days, needs the 营业执照, a 公函 signed by the legal representative and stamped with the **公章**, the admin's identity and a verification call [VERIFY the 2026 list in the console]. It unblocks 小程序备案 (an enterprise needs it first), 流量主 and more tester slots, and the 备案 clock (10-30 working days) cannot start without it.

### Step 4. 适龄提示 [LEGAL]

Where: 设置 -> 基础设置 -> 基本信息 -> 适龄提示 -> edit -> submit. **Required before the 小游戏备案 is processed** (nrjs.html Q2 lists "适龄提示未设置或者未通过" as a delay) and before version review. **Recommendation: 12+.** The official table (slts.html, read 2026-10-15): 12+ allows "部分基于历史和现实事件的改编，但不会与现实生活相混淆" and "清晰完整的适量故事背景和人物关系"; art style cartoon/hand-drawn (our code-drawn seals) fits both; no stranger social system fits both. A 三国 game is a history-based adaptation, so 12+ is the honest band; a band that does not match the content can make the platform re-mark it and delay the filing and review. You confirm the band; the platform then shows the icon next to 健康游戏忠告 on the launch screen.

### Step 5. Tell the CTO

Send (none of this is secret): the AppID check ("wx172906d7bfd6036f confirmed"), the **accepted 名称 and 简称**, the category path (and the screenshots), the 认证 status, the 适龄提示 band you submitted, and the **launch date** you are aiming for (the 备案 pair takes 4-10 weeks). The CTO records the name in `../APPID.md`.

### If something is rejected

| Symptom | Do |
|---|---|
| Name "已被使用" or "含保护词, 需补充材料" | next name in `copy.md` section 1; do not file a complaint (your trademark clearance D11 is the evidence if you ever need one) |
| Category rejected or an extra licence is asked | stop, send the screenshot to the CTO |
| 认证 failed | the fee is not refunded [VERIFY]; read the reason, fix the 公函 (wrong seal, mismatched name) and resubmit |
| Avatar rejected | upload `avatar-B-512.png` instead of the JPG, or `avatar-B-300.*`; report the message |
