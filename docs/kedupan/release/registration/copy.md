# 群友刻度盘: registration copy

Author: release. Date: 2026-10-15; **revised 2026-10-16 for the typed clue (D-2): I3 no longer says 「无需输入文字」 (false now), the UGC statements in section 4 and 7 are rewritten.** Status: ready for the founder to paste (registration copy is founder-approved before submission, CLAUDE.md).
Sources: `docs/kedupan/direction.md`, `docs/kedupan/spec.md` (§1, §16 H1), `docs/kedupan/decisions.md`, rules in `rules.md` next to this file, and the format of `docs/dianjiangtai/registration/copy.md`.

Counting convention: every character including Chinese punctuation. WeChat counts a Chinese character as 2 against the 名称 limit of 4-30 (so 2-15 Chinese characters). Intros follow the studio's ≤ 60 characters limit (as in 点将台 commit 6f5576e). The official page lists 4-120 for the 介绍, which I could not re-read today, so the stricter 60 stands [VERIFY, see rules.md].

Hard rule for everything below: no "最", "第一", "官方", "免费", "唯一", prize or reward wording, no share-for-reward wording (诱导分享), no other product's name. The names and intros were scanned for the banned-term list shown in rules.md §2.1: no hits.

---

## 1. Name (名称) and fallbacks

Uniqueness cannot be checked offline: the console's name check (名称检测) at registration is the only real test, so every row below is an estimate. The order is **the order to try them**: the product name first, then by likely availability (distinctive coined strings before generic ones). Same-主体 accounts may share a name, so our other apps are no obstacle.

| # | Name (名称) | CJK chars | Count (CJK = 2) | Short name 简称 (count) | Rationale | Uniqueness / genericness risk | Note |
|---|---|---|---|---|---|---|---|
| N1 | **群友刻度盘** | 5 | 10 | 群友刻度盘 (10) | The working title and first choice (PD-23): group friends + scale dial. | Low | Coined 5-character string (10 in the count, exactly at the short-name ceiling too). Likely free. |
| N2 | **群友刻度尺** | 5 | 10 | 群友刻度尺 (10) | Spec fallback 2; 尺 (ruler) matches the tape-measure art better than 盘 (dial). | Low | Distinctive. Possibly confused with a measuring-tool app name, which is not a conflict. |
| N3 | **刻度默契** | 4 | 8 | 刻度默契 (8) | Spec fallback 1; the 默契 headline stat in two words. | Medium | Short; 默契 is a common word in game names (默契 games are a known category). |
| N4 | **同频刻度** | 4 | 8 | 同频刻度 (8) | Spec fallback 3; 同频 is the everyday word for "on the same wavelength", used without any translation of Wavelength. | Medium | 同频 appears in many names. Fine as a last resort. |
| N5 | **默契刻度尺** | 5 | 10 | 默契刻度尺 (10) | Our addition: 默契 + 刻度尺. | Medium | Plausibly free; slightly generic. |
| N6 | **今日刻度盘** | 5 | 10 | 今日刻度盘 (10) | Our addition: the daily angle (everyone gets the same five cards). | Medium | Generic "今日" prefix; may exist. |

**Order to try:** Primary 群友刻度盘; then 群友刻度尺, 默契刻度尺, 刻度默契, 同频刻度, last 今日刻度盘. (Spec order was 刻度默契, 群友刻度尺, 同频刻度; reordered by likely availability: longer coined strings first.)

Rules applied (details and sources in rules.md): length (all candidates are 3-7 Chinese characters, count 6-16, inside 4-30); only Chinese characters, plus a middle dot only in rows that show one; no infringing, trademark-like, celebrity, political or misleading terms; not a generic-only name (each combines a stem with a qualifier or is a coined phrase); name matches the content and icon (direction §8); no "微信", "腾讯" or look-alikes.

**What to do with a rejection.** If the name is "already used" the form shows the other account; do **not** file an infringement complaint for this (7 working days plus a 7-day wait): just take the next name. If it asks for extra materials (a protected word), stop and use the next name, unless it asks for something you already hold. The name is locked before 备案 (changing it later forces a filing update, rules.md S3 5.35).

## 2. Introduction (介绍 / 简介), ≤ 60 characters

Must describe the real gameplay; review rejects vague marketing. Paste I1 unless the form shows a smaller limit.

**I1 (recommended), 57 字 (48 without punctuation)**
> 每日五张刻度卡：把火锅、奶茶这类日常事物拖到“冷”与“热”之间，揭晓后对比大家的位置与本群的位置，看谁和你更同频。

Why: Concrete: five cards, drag a needle between two ends, two reveals (everyone, the group). Names no person, only things. Recommended. (57 characters, the tightest; use I2 if the form counts differently.)

**I2, 48 字 (42 without punctuation)**
> 拖动指针，给今天的日常事物定个位置：冷还是热，便宜还是贵？揭晓后看大家和本群有多默契。约一分钟。

Why: Question-led, two example axes, states the duration.

**I3, 48 字 (42 without punctuation)**
> 每天五张卡，一条刻度，两头各是一种感觉。放好指针，看你和群友的想法有多接近；也能自己写提示出题。

Why: Keeps the daily hook and, truthfully, tells the reviewer that the player can write a hint when setting a question (the one user text, moderated: `beian.md` §3). **Replaces the old I3, whose closing 「无需输入文字」 is false since D-2 (typed clues) and must not be used.** Length check: 48 characters with punctuation (42 without), inside the studio limit of 60 and the official 4-120; the old I3 was 45, so the new one is 3 characters longer and still 12 under the limit. I1 (57) and I2 (48) say nothing about text input and stay valid.


## 3. Short name (简称)

Optional; 4-10 characters (Chinese = 2), must be taken in order from the full name; it need not be unique. Use the value in the table's "Short name" column for the name that was accepted. If the form does not ask, skip it. For the primary name: **群友刻度盘** (10).

## 4. Service category (服务类目)

- **Level 1: 游戏** (fixed when the account was registered as 小游戏; cannot change).
- **Level 2: 休闲** (editable until the first release, locked after).
- **Level 3 first choice:** 益智 (first choice). **Fallback:** 答题, or the closest 休闲 option the console offers. Level 3 can be changed later in 资质管理 but needs a new review and a new released version.
- Why: A casual opinion-placement game with a reveal, no progression; its only user text is a short moderated clue (see the UGC check below). 休闲 is the only sensible level 2. The third level is a loose fit whichever is chosen (it is not a puzzle or a quiz), so pick the closest the console offers and keep 益智 / 答题 as the two candidates [VERIFY].
- Qualification route: IAA route "情况二" (no virtual payment now or later): no 版号, no payment qualification; 软著 only if the name contains English or the word 软件, or the game involves brands or public figures (none here). Choose 情况二, no payment qualification (never apply for one: this game has no virtual payment, Constitution Art. 3.3).

### Qualification check

IAA route "情况二" (no virtual payment now or later): no 版号, no payment qualification; 软著 only if the name contains English or the word 软件, or the game involves brands or public figures (none here).

**UGC check, re-done 2026-10-16 (D-2).** Before D-2 the game had no user text (PD-7). **Now it has one UGC surface: the host's typed clue (1-12 Chinese characters), pre-moderated, reportable, with strikes** (spec §6.12, §11.6-11.8). Does the 服务类目 need a UGC qualification? Result: **no such requirement found.** Re-read 2026-10-16: type.html (service categories), zzsh-iaa.html (IAA qualification review), xcxba.html and nrjs.html (filings), slts.html (age rating): none mentions UGC, user-published content, a 社区/社交 category or any extra licence for 游戏 > 休闲 (the only extra material named is 软著, when the name has English or 软件, or brands/public figures are involved: not our case). 运营规范 treats UGC as a duty (2.7.1, 5.18, 10.x), not as a licence; the duties are met by the moderation design (`../rules-check.md` 1.7a-1.7h). So: keep 游戏 > 休闲 > 益智 (fallback 答题), 情况二, no payment qualification, and **do not choose a 社交, 社区, 论坛 or 内容 category**. The authority is still the console: when you add the category (REGISTRATION-STEPS step 5), screenshot the "所需资质" list for the chosen third level and send it to the CTO. If it lists anything beyond the IAA route, stop. Optional certainty: ask 在线客服 (mp.weixin.qq.com, 帮助 -> 联系客服): "游戏 > 休闲 类目的小游戏，出题玩家可输入不超过12个汉字的短提示，提示经「小游戏文本内容安全识别」审核通过后才展示给打开题目的人，设有举报、隐藏、违规限制和后台下架，无公开广场、聊天和陌生人匹配，是否需要额外的类目资质或材料？" and keep the reply.

## 5. Keywords / tags (8)

刻度 · 默契 · 同频 · 群友 · 每日挑战 · 冷热 · 日常 · 休闲

The registration form has no keyword field that I could confirm; these are for later 搜一搜 / listing use [VERIFY]. Excluded on purpose: Wavelength, 波长, 心灵波长, 通灵 (direction §8), any word suggesting rating people (排名 of 群友 is by agreement, not judgement), 测试/算命 (reads as a personality test, a different review category).

## 6. Compliance flags for release [COMPLIANCE]

1. Original IP: no 波长 / Wavelength wording; ruler not dial; no coloured scoring wedge (direction §6).
2. No claim about people: the intro talks about "日常事物" and "想法", never about rating friends (direction §9).
3. "大家" and "本群" are used instead of "全国" in the intro to avoid a 国家级 reading.
4. **Cross-app name check** (点将台, 比一比, 传画接龙, 群友刻度盘, 语义热冷): the five names share no stem, suffix or tagline pattern, so they do not look like a series. The only shared word-part is the generic 刻度 / 比 / 传 / 热冷 inside different strings. Avatars use five different colour families (点将台 parchment and red seal, 比一比 teal, 传画接龙 orange, 群友刻度盘 purple, 语义热冷 blue-to-amber gradient). 比一比 and 点将台 both carry a cinnabar seal motif (the seal is specified in 比一比 direction §6); it is a round badge on a teal field there and a tilted square 白文 seal on parchment in 点将台, and it is not intended as a family look.
5. **Same company** (Beijing, 企业) registers all of them: same-主体 duplicates of a name are allowed, but each account needs its **own new email** (REGISTRATION-STEPS.md, step 1).

## 7. [VERIFY] items for this app

- [VERIFY] Third-level category (益智 / 答题) availability; both are loose fits.
- [VERIFY] That 群友 in the name does not read as a social / community product to the category reviewer (the game has no chat, DMs or public feed; its only user text is a 12-character moderated clue).
- [VERIFY] The in-app search result for 刻度 / 同频 / 默契 (spec H11); name availability.
