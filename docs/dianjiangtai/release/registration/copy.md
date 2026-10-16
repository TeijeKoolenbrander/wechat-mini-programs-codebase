# 点将台: registration and listing copy

Author: product-ux; updated by release 2026-10-15 for the v1 build (`kept-ideas/v1` @ 3df1b89333d8d05b1d008ce57bfd29b2d1f46452, the code is identical to 6582873). **The AppID `wx172906d7bfd6036f` is already registered** (founder, before this pack), so this file is now a verification sheet as much as a copy sheet: section 0 below says what was checked against the current build and what the founder confirms in the console. Copied from `docs/dianjiangtai/registration/copy.md` (the old folder stays); sections 4 and flags 7.6-7.8 are updated for v1.
Sources: `docs/dianjiangtai/direction.md` (§1 pitch, §5 tone, §8 naming, §9 what we will NOT do), `docs/dianjiangtai/spec.md` (§0 decisions, §1 scope, §2 core loop).

Counting convention: "字数" below counts every character, **including** Chinese punctuation. A count without punctuation is given in brackets where it matters. WeChat's own form counter decides in the end; every option leaves headroom on both ends.

Copy rules applied to everything in this file (direction §8, §9, and the brief):
- Never mention or allude to 82-0, the NBA or any sport; 三国志, 三国杀, 光荣/Koei; the stat words 武力/统率/政治/魅力. No SSR or 抽卡/转盘 language.
- No "第一", "最", "官方", "极", "唯一", "顶级", "100%" or other absolute words (广告法 §9 and WeChat review).
- No prizes, cash, rewards or gambling wording. No share-for-reward wording (诱导分享). No "快来", "帮我", "转发领取".
- Plain, confident, slightly literary. Every sentence says what the player actually does.

---

## 0. Release check of the registered fields (2026-10-15, against the v1 build)

The founder registered the account and AppID before this pack. Whatever name, introduction, avatar and category the founder entered, the console is the authority: confirm each row below in the console (首页 -> 小程序信息, 设置 -> 基本设置) and tell the CTO the **accepted name** (it goes into `../APPID.md` and the 备案 forms; lock it before 备案).

| Field | In this pack | Against the current build | Result |
|---|---|---|---|
| 名称 | primary N2 `点将台·三国`, fallbacks N3 `三国点将台`, N4 `点将台·每日军令`, N1 `点将台` (all 3-8 Chinese characters, so 6-16 of the 30-character budget, CJK = 2) | the in-game title is `点将台` (home screen, share titles "点将台：…"). The registered name only has to be consistent with the 备案 name and the content; a suffix such as `·三国` is allowed (a qualifier is not prohibited, `rules.md` 2.1). No forbidden word (微信/腾讯/第一/最/官方/免费, any other game's name). | NEEDS-FOUNDER: confirm which name was accepted; if it is not N1-N4, send it to the CTO for a wording check |
| 简称 | same as the accepted name (4-10 characters, CJK = 2) | n/a | NEEDS-FOUNDER (only if the form asked) |
| 介绍 (<= 60 characters) | I1, 56 characters, see section 2 | I1 describes the real loop (daily shared 军令, flip faction and era, five roles, twelve battles, graded). v1 added 晋/归晋, 识人 Sundays, streaks, 往期, group and friend boards; none contradicts I1. I4 (section 2) is a v1 variant that mentions 识人 and the boards, 49 characters. No ad, prize, price or superlative wording in either. | PASS; keep I1, or switch to I4 (founder's choice) |
| 头像 | `avatar/avatar-B-512.jpg` (PNG alternative `avatar-B-512.png`; 1024 masters; 144 minimum; all under 200 KB; opaque 宣纸 background; no portrait, mark or text other than the character 将) | the in-game seal on the home screen reads 点将 (white characters on a tilted red block): that is avatar A. B (the single 将) is the recommended legibility variant (readable at 40 px and in the circle crop); A is the exact in-game stamp (`avatar-A-512.png`, no JPG made; WeChat's uploader takes PNG [VERIFY]). Both are original, drawn in code from the OFL font Noto Serif SC; no likeness of any person, no other game's art (direction §8). | PASS; founder confirms what is uploaded |
| 服务类目 | 游戏 > 休闲 > third level as the console offers it (see `REGISTRATION-STEPS.md`) | the game is a one-minute casual draft-and-grade game, no payment, no chat: 休闲 fits ([SLTS]/type.html: a level-2 that does not match the content gets the version rejected; level 2 is locked after the first release, level 3 can change later) | NEEDS-FOUNDER: screenshot 所需资质 and the category path |
| 适龄提示 | see `../rules-check.md` 1.14 and `../HANDOFF.md` section 0 | the official table makes **12+** the fit (history-based content: "部分基于历史和现实事件的改编") | NEEDS-FOUNDER: choose; recommendation 12+ |

---

## 1. Name options (名称)

WeChat counts a Chinese character as 2 characters against its 4-30 limit, so 3 Chinese characters (点将台) are 6 in that count and are valid. All options below are 3-8 Chinese characters.

| # | Name | Chinese chars | Rationale | Uniqueness / genericness risk |
|---|---|---|---|---|
| N1 | 点将台 | 3 | The cleared trademark (D11), shortest and most brandable; matches the 点将 seal icon. | **High.** 点将台 is a common historical noun and a frequent name for in-game features, venues and other apps; likely already taken or rejected as too generic for a unique name. Also 3 chars, below the brief's own 4-char floor. |
| N2 | 点将台·三国 | 5 + dot | Brand first, genre second: search for 三国 finds it, and the name still reads as ours. | **Low-medium.** The 点将台 + 三国 pair is specific. Verify the middle dot is accepted in the MP name field (it usually is; fall back to N3 if not). |
| N3 | 三国点将台 | 5 | Natural spoken phrase, no punctuation, strongest for 三国 search. | **Medium.** Reads like a descriptive phrase, so a similarly named game may exist; reviewers may also view it as more generic than N2. |
| N4 | 点将台·每日军令 | 7 + dot | Names the daily hook (everyone gets the same 军令), which is the group-chat reason to play. | **Low.** Distinctive. Slightly long on small screens; 军令 needs the 三国 context from the icon and intro. |
| N5 | 点将台·十二战 | 6 + dot | Points to the verdict (the 12-battle campaign) and the 12-0 goal without stating it. | **Low.** Distinctive but less self-explanatory; a first-time searcher may not know what 十二战 means. |
| N6 | 三国点将台·军令 | 7 + dot | Keeps the 三国 search term and the daily hook. Useful if N2 and N3 are both taken. | **Low.** Clunky stacking of terms. Last resort. |

**Recommendation**
- **Primary: N2 点将台·三国.** Brand-led, searchable, unlikely to clash.
- **Fallback 1: N3 三国点将台** (if the middle dot is rejected or N2 is taken).
- **Fallback 2: N4 点将台·每日军令** (if both 三国 combinations are taken).

N1 alone is worth one try only if the founder wants the bare brand; expect a clash. Before submission, release checks every candidate in the MP name search (名称检测) and confirms that the registered company's trademark (D11) covers the exact string used.

---

## 2. Introduction (介绍), ≤ 60 characters

Must describe the gameplay plainly; review rejects vague marketing. Founder limit: ≤ 60 characters including punctuation, aim ≥ 30. Counts below are every character (with punctuation) and CJK characters only (without).

**I1 (recommended), 56 字 (47 without punctuation)**
> 三国选将策略游戏。每日军令人人相同：翻令定势力与时代，点五将任主公、军师、先锋、猛将、守将，出征十二战评定战绩。

Why: genre first, then the full loop in order (daily shared 军令, faction/era, 5 roles, 12 battles, graded), with 4 characters of headroom.

**I2, 46 字 (40 without punctuation)**
> 三国选将游戏：每日同一道军令，翻令点五员武将，排兵出征十二战评定战绩；另有群排行与好友挑战。

Why: drops the role names to fit the social features (group ranking, friend challenge); use if the founder wants those in the listing.

**I3, 54 字 (44 without punctuation)**
> 一道军令，人人相同。翻令得势力与时代，点五员三国武将任主公、军师、先锋、猛将、守将，出征十二战，按战绩评定。

Why: leads with the fair daily hook in a more literary voice; all facts still mechanical, but 三国 comes later than in I1.

**I4 (v1 variant, added by release), 49 字**
> 三国选将小游戏：每日同一道军令，翻令点五员武将，出征十二战评战绩。周日识人，另有群排行与好友挑战。

Why: same facts as I2, shorter, and names the two v1 hooks a searcher can act on (识人 Sundays, group ranking). Counted programmatically on 2026-10-15: I1 56, I2 46, I3 54, I4 49 characters including punctuation; the founder limit is 60 (the official range is 4-120, `rules.md` 2.3).

---

## 3. Short tagline (≤ 16 characters)

For share titles (`shareAppMessage` title) and store use. None asks the reader to share or promises anything.

| # | Tagline | 字数 | Note |
|---|---|---|---|
| T1 (recommended) | 点五员大将，打十二场仗 | 11 | Says the whole game in one breath; works as a store line and as a neutral share title. |
| T2 | 同一道军令，看谁点将更高明 | 13 | Best for daily and group shares: it states the fair-comparison hook. "更" is comparative, not absolute. |
| T3 | 今日军令已下，点将出征 | 11 | Storyteller voice; good as the daily result-card share title. |

---

## 4. Store / listing blurb (游戏简介), 265 字 (v1 text, updated by release)

> 点将台是一款三国题材的选将策略小游戏，一局约一分钟。每天一道军令，所有玩家拿到相同的令牌；每逢周日是“识人”军令，五项品评出征后才揭晓。每轮翻令得出一个势力和一个时代（黄巾、群雄、赤壁、三分、归晋），从符合条件的武将中点一员，安排到主公、军师、先锋、猛将、守将之一。五轮点满，出征十二战，战报逐场写明胜负缘由，最后给出战绩与评语。十二战全胜方为一统天下。武将以智、信、仁、勇、严五项品评。每日军令每人一次，自由模式不限局数；可回看近三十期军令，查看群排行、好友排行，或把同一局发给好友比一比。本游戏无内购，部分功能可选择观看广告。

Notes: 智信仁勇严 is our own stat set from 《孙子兵法·计篇》 (spec §3.1, D2), safe to name. "一局约一分钟" matches spec §2 (40-90 s). v1 additions (归晋, 识人, 往期) are in the text; "近三十期" is the 30-issue archive (PO-7). v1 ships code-drawn seal portraits and no AI-generated content (CTO-D1), so **no AIGC disclosure line is needed** (it returns with the post-launch AI-portrait update, D10).

---

## 5. 备案 service-content description, about 113 字

> 点将台是一款休闲策略益智小游戏，题材为三国历史人物。玩家依随机翻出的势力与时代选五名武将并分配职位，程序模拟十二场战斗评定成绩。仅以广告获得收入，无内购、无虚拟货币；无用户生成内容，无聊天功能，社交仅限微信分享及好友与群排行。

(Still accurate for v1; the longer 备案 text with the v1 features is in `../beian.md` section 3.)

---

## 6. Keywords (8)

三国 · 点将 · 武将 · 选将 · 策略 · 益智 · 排兵布阵 · 每日挑战

Excluded on purpose: any other game's name or terms, 抽卡, 卡牌 (implies a card-collection game), 第一/最强, and sports words.

---

## 7. Compliance flags for release [COMPLIANCE]

1. **Name availability and trademark match:** the cleared trademark is 点将台 (D11). Confirm it covers the composite name chosen (N2/N3/N4) before submission.
2. **Ads:** the game is IAA-funded. The intro does not mention ads, and the 备案 text states it. If the listing form has an "contains ads" field, tick it.
3. **No virtual currency, no IAP, no prizes:** none of the copy mentions rewards. Do not add "奖励" wording to share titles later.
4. **Friend and group boards** use 微信朋友关系 data (spec §11.6); the privacy guide must declare it before release (D9 step 4). The 备案 text names the boards so it matches.
5. **一统天下** is the in-game name for a 12-0 result, not a claim about the product. No map or territorial imagery accompanies it (direction §6).
6. **AIGC labelling** applies to the listing only from the post-launch AI-portrait update (D10, CTO-D1). v1 has no AI-generated image. (The roster texts and commentary were drafted with AI assistance; the founder cleared AIGC labelling in D14, see `../rules-check.md` 1.18.)
7. **(release, v1) Privacy guide scope grew:** 相册（仅写入）, the subscribe message, `challenge_answers`, `rate_limits` and the group id flow are all in `../privacy-guide.md`. The old list in `rules.md` 5.1 (Phase 1, "do NOT declare 相册") is superseded.
8. **(release) 适龄提示:** `rules.md` 5.6 already said 12+ fits (history-based content). The official table (slts.html, read 2026-10-15) lists "部分基于历史和现实事件的改编" under 12+, which is what a 三国 game is. Recommendation 12+. Founder decides in the console.
