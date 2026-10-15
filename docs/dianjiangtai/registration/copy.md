# 点将台: registration and listing copy

Author: product-ux. Date: 2026-10-15. Status: draft for founder sign-off (registration copy is founder-approved before submission, CLAUDE.md).
Sources: `docs/dianjiangtai/direction.md` (§1 pitch, §5 tone, §8 naming, §9 what we will NOT do), `docs/dianjiangtai/spec.md` (§0 decisions, §1 scope, §2 core loop).

Counting convention: "字数" below counts every character, **including** Chinese punctuation. A count without punctuation is given in brackets where it matters. WeChat's own form counter decides in the end; every option leaves headroom on both ends.

Copy rules applied to everything in this file (direction §8, §9, and the brief):
- Never mention or allude to 82-0, the NBA or any sport; 三国志, 三国杀, 光荣/Koei; the stat words 武力/统率/政治/魅力. No SSR or 抽卡/转盘 language.
- No "第一", "最", "官方", "极", "唯一", "顶级", "100%" or other absolute words (广告法 §9 and WeChat review).
- No prizes, cash, rewards or gambling wording. No share-for-reward wording (诱导分享). No "快来", "帮我", "转发领取".
- Plain, confident, slightly literary. Every sentence says what the player actually does.

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

## 2. Introduction (介绍), 20-120 characters

Must describe the gameplay plainly; review rejects vague marketing.

**I1 (recommended), 103 字 (88 without punctuation)**
> 三国题材选将策略小游戏。每天一道军令，所有人令牌相同：翻令五轮，每轮按翻出的势力与时代点一员武将，排入主公、军师、先锋、猛将、守将五个位置，出征十二战，按战绩评定。另有自由模式、群排行、好友排行和同局挑战。

Why: names the genre in the first sentence, then states the full loop (5 rounds, faction and era, 5 roles, 12 battles, graded) and every mode. A reviewer can tell exactly what the game is.

**I2, 82 字 (69 without punctuation)**
> 每日军令，同题对决。翻五次势力与时代，点五员三国武将，分任主公、军师、先锋、猛将、守将，出征十二战定成败。可自由练习，可看群排行与好友排行，也可向好友发起同局挑战。

Why: shorter and punchier, same facts. Use if the form displays truncated text.

**I3, 99 字 (83 without punctuation)**
> 一座点将台，五员三国大将。每天一道军令，人人令牌相同：翻令得势力与时代，点将排入主公、军师、先锋、猛将、守将，出征十二战。十二战全胜方为一统天下，并不容易。另有自由模式、群排行、好友排行与同局挑战。

Why: most literary and carries the "12-0 is hard" tension (D15) in neutral words. Slightly riskier with a strict reviewer because the opening sentence is mood, not mechanics.

---

## 3. Short tagline (≤ 16 characters)

For share titles (`shareAppMessage` title) and store use. None asks the reader to share or promises anything.

| # | Tagline | 字数 | Note |
|---|---|---|---|
| T1 (recommended) | 点五员大将，打十二场仗 | 11 | Says the whole game in one breath; works as a store line and as a neutral share title. |
| T2 | 同一道军令，看谁点将更高明 | 13 | Best for daily and group shares: it states the fair-comparison hook. "更" is comparative, not absolute. |
| T3 | 今日军令已下，点将出征 | 11 | Storyteller voice; good as the daily result-card share title. |

---

## 4. Store / listing blurb (游戏简介), about 214 字

> 点将台是一款三国题材的选将策略小游戏，一局约一分钟。每天一道军令，所有玩家拿到相同的令牌。每轮翻令得出一个势力和一个时代（黄巾、群雄、赤壁、三分），从符合条件的武将中点一员，安排到主公、军师、先锋、猛将、守将之一。五轮点满，出征十二战，战报逐场写明胜负缘由，最后给出战绩与评语。十二战全胜方为一统天下。武将以智、信、仁、勇、严五项品评。每日军令每人一次，自由模式不限局数。可查看群排行、好友排行，或把同一局发给好友比一比。本游戏无内购。

Notes: 智信仁勇严 is our own stat set from 《孙子兵法·计篇》 (spec §3.1, D2), safe to name. "一局约一分钟" matches spec §2 (40-90 s). When AI-generated portraits ship (Phase 2, D10), append the AIGC disclosure line agreed with release (spec §17 #16); Phase 1 uses seal monograms only, so none is needed now.

---

## 5. 备案 service-content description, about 113 字

> 点将台是一款休闲策略益智小游戏，题材为三国历史人物。玩家依随机翻出的势力与时代选五名武将并分配职位，程序模拟十二场战斗评定成绩。仅以广告获得收入，无内购、无虚拟货币；无用户生成内容，无聊天功能，社交仅限微信分享及好友与群排行。

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
6. **AIGC labelling** applies to the listing only from Phase 2 (D10).
