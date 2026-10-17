# 群友刻度盘: store listing text and screenshots

Author: release. Date: 2026-10-15; **revised 2026-10-16 (D-2): 适龄提示 12+, the 「不需要输入文字」 line removed, screenshots 06 and 07 re-rendered for the typed clue (09 to 11 added); the round share card still shows the preset card only.** WeChat 小游戏 has no separate store page with free-form copy: the "listing" is the account's 基本信息 (name, 简称, avatar, 介绍), the optional 宣传图 and 版本更新说明 at submission, the 搜一搜 / 更多资料 page (built from those), and the share cards. All values below are final copy; registration-time fields are the same as in `registration/copy.md`.

## 1. Fields and final text

| Field | Where | Value | Limit check |
|---|---|---|---|
| 名称 | registration (基本信息) | **群友刻度盘** (fallbacks in `registration/REGISTRATION-STEPS.md` step 4) | 10 of 30 (CJK = 2) |
| 简称 | 基本信息, if asked | 群友刻度盘 (same as the accepted name's 简称) | 10 of 10 |
| 介绍 | 基本信息 | I1: 每日五张刻度卡：把火锅、奶茶这类日常事物拖到“冷”与“热”之间，揭晓后对比大家的位置与本群的位置，看谁和你更同频。 | 57 of 60 (studio limit; official 4-120) |
| 头像 | 基本信息 | `registration/avatar/avatar-512.jpg` (PNG alternative) | under 2 MB |
| 服务类目 | 类目 | 游戏 > 休闲 > 益智 (fallback 答题) | see rules-check |
| 版本更新说明 (version 1.0.0) | 提交审核 | see 2 | |
| 宣传图 (optional) | 提交审核 | `screenshots/01..05` (1080 x 1920) | no size is published; optional |
| 适龄提示 | 基本信息 | **12+** (recommended since the typed clue, PD-39; was 8+; founder confirms) | rules-check 1.14 |
| 分享标题 (menu) | in game | from `core/entry.js`; capsule menu: "群友刻度盘：把指针放在你觉得对的位置"; group: "群友刻度盘：本群今日默契度 81"; daily: "火锅是冷还是热？我今天和全国的默契分 412，你呢"; round: "我出了一道刻度题：便宜↔贵，猜猜我心里的位置"; reveal: "刻度题揭晓：本题默契值 78" | none of them promise rewards (AC 50-53) |

## 2. 版本更新说明 (paste at submission; the console asks for it)
First submission (1.0.0):
```
首个版本：每日五张刻度卡、与全国和本群好友对比默契分、出题让群友猜、往期刻度练习。
```
Later updates: one short factual line each; never claim rewards.

## 3. Longer description (for 搜一搜 / 宣传 pages / community posts; not a console field)
```
每天五张卡，一条刻度，两头各是一种感觉。
火锅是冷还是热？一杯奶茶便宜还是贵？把指针拖到你觉得对的位置，揭晓后马上看到全国的想法在哪里、你和大家差几格，在群里玩还能看到本群的默契度，以及今天和你最同频的人。
· 每日刻度：五张卡，约一分钟，次日定分
· 出一道题：自己设定位置，让群友来猜
· 往期刻度：错过的日子随时补玩
· 大字模式、高对比度，适合所有年龄
· 出题时可以自己写一句提示，也可以选现成的提示词；提示先审核再展示，可举报
· 不需要登录，不需要付费
```
(Do not write 「不需要输入文字」 or 「无用户内容」 anywhere: both are false since D-2. Avoid in any listing: "最", "第一", "官方", "免费", "全国第一", prize or share-for-reward wording; the first four are checked in `registration/rules.md`. "不需要付费" is a statement of fact, not the banned ad-law word 免费.)

## 4. Screenshots (best screens and why)
Verified requirement: **none published for pixel size** (iaa.html, bbsh.html, nrjs.html read 2026-10-15; 备案 says only "size and version consistent"; 宣传图 is optional). Chosen: 1080 x 1920 PNG, 9:16, one renderer and one build. Files in `screenshots/` (see its README for the table):

1. `01-home` (hook: the ruler motif, 开始, group entry)
2. `02-card__placing` (the whole game in one picture: note, ruler, needle)
3. `03-card__revealed` (the reveal: the payoff)
4. `04-result__final` (the score and 定分)
5. `05-group__ready` (the social angle: 本群默契度, ranking, 最同频)
6. `06-round__revealed` and `07-create__clue_picked` (出题)
7. `08-home__howto` (explains the game in three lines)

Recommended order for 宣传图: 03, 05, 04, 02, 09 (typed clue), 07. These are renders with fixture data; the real-device set replaces them after the device pass if the founder wants.

**Typed-clue status (checked 2026-10-16):** `06`, `07`, `09`, `10` and `11` were re-rendered for the typed clue; use `09` (typed clue) and `07` in the 宣传图. `share-round-500x400` still shows the preset card only (the typed-round card 「提示在题目里，点开看看」 is not rendered yet). The full list is in `release-checklist.md`.

## 5. Naming and wording checks already done
Original IP (no 波长 / Wavelength), no brand names, no people, no "全国第一"; "全国" appears in game copy as a statistic of players ("和全国 63% 的人想法相近"), not as a name or superlative (advisory in `rules-check.md`).
