## Registration (do this first)

Status: ready for the founder. Date: 2026-10-15. Game: **传画接龙** (小游戏, slug `chuanhua`). Entity: the founder's Beijing company, 主体 type 企业. Nothing in this section has been done by an agent: it needs your identity, your company's documents and (for 认证) money.

Legend: **[MONEY]** you pay; **[LEGAL]** you attest or sign for the company; **[CREDENTIAL]** your passwords or keys, which never go in chat or in the repo. Every value to paste is in the code blocks; every file is under `docs/chuanhua/release/registration/`. Official references: `rules.md` next to `copy.md` (and `docs/dianjiangtai/registration/rules.md` for the long form of the account steps, which are the same for all four games).

**Time and cost, whole section:** registration 15 minutes; 认证 1-3 working days; name/avatar/intro/category 20 minutes; the later 备案 is the long pole (10-30 working days) and is **not** part of this section. **Money: 300 RMB for 认证** of this AppID (S1 register.html; annual renewal [VERIFY]), or 0 if the 公众号 quick path works (step 3, [VERIFY 2026]). 

### Before you start (5 minutes)

- [ ] A **new email address, used for this game only**: never registered on 公众平台, 开放平台 or 企业号, and not bound to a personal WeChat. It receives the activation code and all notices. (A different address per game: do not reuse the 点将台 address or the other three.)
- [ ] The company's 营业执照 (photo or scan, original, colour, all four corners visible) and the 统一社会信用代码.
- [ ] The administrator's WeChat (real-name verified) and their mobile phone and ID. The admin scans a QR code with that WeChat during registration.
- [ ] For 对公打款 (if you choose it): access to the company's corporate bank account; the transfer must be made within **10 days** or the registration fails.
- [ ] 5 minutes in the WeChat app (and on Douyin) searching the name: 传画接龙, 传话画画, 群里画画接龙 (spec H1). Informational: if an established clone is there, tell the CTO; otherwise no action.

### Step 1. Register the account  [CREDENTIAL]

Where: https://mp.weixin.qq.com → 立即注册 → account type **小程序**.

| Field | What to enter |
|---|---|
| Email | the new email from "Before you start" |
| Password | choose yours (follow the form's password rules); store it in the company password manager. **Never paste it in chat.** |
| Activation | enter the 6-digit code that arrives by email on the same page |
| **类目 / 小程序类型 (irreversible)** | choose **小游戏**, not 其他. WeChat's warning: the first-level category cannot be changed afterwards; a wrong choice means a new account and a new AppID |
| 主体类型 | **企业** (not 个人, not 个体工商户) |
| 企业名称, 统一社会信用代码 | exactly as printed on the 营业执照; upload the licence photo |
| 管理员 | the admin's real name, ID number, mobile; scan the QR code with the admin's WeChat |
| Verification route | choose **微信认证** (300 RMB, step 3) so that 备案 is possible later, or 对公打款 first and then 认证 |
| Final confirm | the page says subject information cannot be changed afterwards: check the company name character by character first |

Unblocks: the account, the AppID, the name/avatar/intro form, WeChat DevTools binding. [LEGAL]: the company information and the admin's identity are attestations about your company.

### Step 2. Get the AppID and give it to the CTO

Where: 开发管理 → 开发设置 → **AppID(小程序ID)**.
Give the CTO: the AppID and the registered name (neither is a secret). The CTO records both in `docs/chuanhua/release/APPID.md`. The real AppID goes into the **release build only** (it is never committed; `build-upload.md` section 2).
**Never copy the AppSecret anywhere** (not chat, not the repo; it stays in the cloud environment config). Unblocks: DevTools preview, the cloud environment (later), CI upload (later).

### Step 3. 微信认证  [MONEY] [LEGAL]

Where: 设置 → 微信认证 (or the prompt at the top of the console). Fee **300 RMB**; 1-3 working days. You will need the 营业执照, a 公函 (letter of application) signed by the legal representative or responsible person and stamped with the company's **公章** (not 合同章, not 财务章, not an electronic seal), the admin's identity and phone, and a verification call [VERIFY the exact 2026 list; the console shows it]. **If the company already has a verified 公众号** you may use 公众号 → 小程序管理 → 添加 → 快速注册并认证, which skips the fee, but only if it lets you choose **小游戏**; if it creates a plain 小程序, do not use it [VERIFY 2026].
Unblocks: renaming (the count resets to 2), 小程序备案 (an enterprise must be certified first), 流量主, more tester slots. Start it now: it runs in parallel with step 4.

### Step 4. 基本信息: name, short name, avatar, introduction

Where: 首页 → 小程序信息 "前往设置" (later 设置 → 基本设置 → 基本信息). Saving takes effect immediately, except protected words. If the console asks you to finish 认证 first, do step 3 and come back.

**Name (名称).** Try in this order; the first that the form accepts is the one to keep:
   1. 传画接龙
   2. 画话接龙
   3. 一笔传一笔
   4. 群里传画
   5. 越传越歪
   6. 传画画

If one is rejected as "already used" or "protected word", do not complain or fight: take the next. Write down which name was accepted and tell the CTO (it must match the in-game title; **lock it before 备案**).

**Short name (简称)**, if asked (4-10 characters, from the accepted name):
```
传画接龙  ->  传画接龙
画话接龙  ->  画话接龙
一笔传一笔  ->  一笔传一笔
群里传画  ->  群里传画
越传越歪  ->  越传越歪
传画画  ->  传画画
```

**Introduction (介绍), rev. 2.** Paste **R1** (43 characters, `copy.md` section 8.1: it names the default live game); if the form complains, use R2, R3, then I1 to I3 below. None mentions 今日起点 (removed in rev. 2).
```
群里开一局：每人选题、轮流画和猜，传给下一位，传完一起看原题变成了什么。画得丑没关系。
```
Older candidates I1 to I3 (still valid, but they describe only 慢慢传-style chains):
```
群聊传话画画：画一幅、写一句、再画一幅，每人只看上一棒，揭晓时一起看原句变成了什么。画得丑没关系。
```
```
在群里开一条接龙：你画我写，一棒传一棒，只看上一棒，揭晓时一起看原句被传成了什么。内容先审后传。
```
```
画一幅，写一句，接力传下去。群友各接一棒，只看上一棒，揭晓时看故事怎么跑偏。画得丑没关系。
```

**Avatar (头像).** Upload `docs/chuanhua/release/registration/avatar/avatar-512.jpg` (square, about 30 KB). If the uploader wants PNG: `avatar-512.png`. The 1024 files are masters; `avatar-144.*` is the minimum size.

Unblocks: the search listing, DevTools and the preview showing the real name, and the 备案 text which must use the same name.

### Step 5. 服务类目 (category)

Where: 首页 → 小程序类目 "去补充" → 添加类目 (the admin scans a QR code).

| Field | Value |
|---|---|
| 一级类目 | 游戏 (already set) |
| 二级类目 | **休闲** (locked after the first release) |
| 三级类目 | **益智 (first choice) or the closest of 其他 / 休闲其他** (if not offered: 答题, or the closest 休闲 option the console offers) |
| 资质 | scenario **情况二** (no virtual payment now or in future). Do **not** apply for any payment qualification. 版号 is not needed for this route. |

**UGC check, do this before paying for 认证 if you can (rev. 2: this is a Handoff step with a screenshot, `../HANDOFF.md` 0, step 5):** screenshot the "所需资质" list the console shows for your third-level choice. If it lists nothing beyond the IAA route, continue. If it demands any licence (网络文化经营许可证, 增值电信业务经营许可证, anything about 用户生成内容), **stop and send the screenshot to the CTO** [LEGAL, possibly MONEY]. Optionally ask 在线客服 the question in `copy.md` §4. Do **not** choose a 社交, 社区 or 内容 category. Why: copy.md §4 and rules.md §1.4.

Unblocks: version review (a level-2 category that does not match the game gets the version rejected), the qualification review (1-3 working days), and 小游戏备案.

### Step 6. Tell the CTO, then continue with the rest of the Handoff

Send the CTO (chat is fine, none of this is secret): the AppID, the accepted 名称, the accepted 简称, the final category path, and any console warnings (screenshot). The CTO will update the build and the 备案 text to match.

What this section does **not** do, and what comes next in the Handoff: 适龄提示; 小游戏备案 and 小程序备案 (they need 认证 and the final name; the MIIT SMS must be answered within 24 hours); the 用户隐私保护指引; the cloud environment; the upload key (path in `MP_UPLOAD_KEY_PATH`, never pasted); 流量主; 软著 (optional unless asked); the device pass; and submission and release, which only you do in the console.

### If something is rejected

| Symptom | Do |
|---|---|
| Name "已被使用" | next name in step 4 |
| Name "含保护词, 需补充材料" | next name unless you hold the material |
| Category rejected / asks for an extra licence | stop, send the screenshot to the CTO |
| 认证 failed | the fee is not refunded [VERIFY]; read the reason, fix the 公函 (wrong seal, mismatched name) and resubmit |
| Avatar rejected | upload `avatar-512.png` instead of the JPG, or the 300 px version; report the message |
