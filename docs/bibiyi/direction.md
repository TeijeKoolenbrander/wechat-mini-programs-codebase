# 比一比: direction

Status: **v1 complete-release direction (2026-10-15).** The founder approved building this game (relayed by the CTO, logged as F-1 in `decisions.md`). Under constitution Art. 4 there are no interim approvals: product-ux decides and logs. Author: product-ux.
Type: WeChat 小游戏 (mini game). Slug: `bibiyi`. Companions: `docs/bibiyi/spec.md` (the "what": the complete v1) and `docs/bibiyi/decisions.md` (dated decision log).
Sources: `research/2026-10-15-new-ideas/kept-ideas.md` §0, §4-6 ([KEPT]); `kept-ideas-alt.md` §4 ([ALT]); `00-shortlist.md` ([SL]); `03-fresh-sweep.md` ([SWEEP]); the 点将台 reference build `docs/dianjiangtai/spec.md` ([DJT]) and `docs/dianjiangtai/phase0-platform.md` ([P0]).

Labels used in both docs:
- **[COMPLIANCE]**: compliance-sensitive (user data, sharing rules, ads, content accuracy, sensitive topics).
- **[VERIFY]**: not checked against an official source or a real device yet. Each has a default and a fallback.
- **INFERENCE**: our own judgement, with no published benchmark behind it.

---

## 1. Vision

**One-line pitch:** 两张卡，选一个：更多还是更少？连对越多越厉害，全国今天同一套题。
(Two cards, one question: more or less? Keep the streak going. Everyone in China gets the same deck today.)

**The one sentence (Art. 3.2):** 看上面那张卡的数字，猜下面那张比它多还是少，错一次就结束。

Everyone has a gut feeling about their own country: is 重庆 bigger than 成都? Is 黄河 longer than 长江? Did 赵州桥 come before 应县木塔? 比一比 turns that gut feeling into a 60-second streak, and the streak into a number the group chat can compare. Every reveal is a small surprise ("成都比重庆少？!"), and every miss gives a reason to try again.

## 2. Target player

- **Primary:** WeChat users aged 24-40 and 40+ (the 40+ group is about 40% of WeChat mini game users, [SWEEP] 3). Many are not "gamers". They know geography and history from school, travel and TV.
- **When they play:** short gaps (commute, queue, after dinner), usually arriving from a card in a family, work or alumni group.
- **What they want:** to feel clever, to learn one surprising thing, and to beat the cousin who always knows everything.
- **Design consequences:** one thumb, portrait, big type, **no timers**, no reflex skill, one decision per screen, every number shown with its unit and source.

## 3. Design pillars

1. **一眼就会 (learn it at a glance).** Two cards and two buttons. No tutorial wall: the first question *is* the tutorial (Art. 3.2).
2. **再来一局 (one more go).** A run takes 30-90 s. A miss leads straight to 再来一局, and the reveal of the missed number is the hook ([KEPT] §4).
3. **同一天，同一套题 (same day, same deck).** The daily deck is identical for everyone and delivered one card at a time by the server, so group comparisons are fair and nobody can look ahead.
4. **有出处，不吵架 (every number has a source).** Every value shows its source and year. Near-ties are never asked. A "数据有误？" button sits on every reveal. Trust is our only moat against clones ([SL] #3).
5. **自愿分享 (sharing is voluntary).** Nothing is ever rewarded for sharing. The streak and the surprise are worth showing on their own. [COMPLIANCE]

## 4. What makes it talkable

- **Surprise facts.** "成都常住人口比重庆少一千多万" starts a chat on its own. The deck generator favours pairs where intuition is often wrong (measured after launch from answer data, spec §4.4).
- **One clean number.** "今日连对 14" is directly comparable: same deck, same rules, no ads that change it.
- **The near miss.** "倒在第 15 题" invites "which one?". The history archive answers it once the day is over, so it can't spoil anyone's daily.
- **Challenges.** "我连对 14，你能超过吗？" on the same deck.

## 5. Tone and vocabulary

- **Voice:** a friendly 知识小报 (quiz page in a newspaper). Short, plain, a little playful: "差一点！黄河比你想的短。" / "连对 20，你是活地图吧？"
- **Neutral facts.** Labels are official names, no adjectives, no judgement of places or things (spec §3.6).
- **No gambling framing, ever.** [COMPLIANCE] The game is **never** called or described as 猜大小 or 比大小 (the 骰宝 dice phrase, [ALT] §4.1). The banned vocabulary list is in spec §3.6 (押, 下注, 赌, 翻倍, 筹码, 金币, 倍率, 赔率, 梭哈, 骰, 中奖, 运气...). No dice, playing cards, chips, coins, slot reels, roulettes, flashing lights or coin sounds. A streak is called **连对** (answers in a row), never a stake or a win.
- **Buttons say what they compare**, using the measure's own verbs (更多/更少, 更高/更低, 更长/更短, 更早/更晚...). Never bare 大/小.
- **No pressure copy.** No "别断了", no "快来", no countdowns, no fake urgency.

## 6. Art direction

Mood: **a clean printed quiz card.** Off-white paper, ink type, one calm accent colour per category, generous whitespace. It must read at arm's length on a cheap Android phone, and look nothing like the original's split-screen photo layout with a VS roundel ([ALT] §4.2, must-not-copy list).

- **Layout:** two cards **stacked vertically** (portrait), the known card on top and the unknown card below, joined by a small cinnabar seal reading 「比」. The answer buttons sit in the thumb zone under the lower card.
- **No photos and no image files for content.** Each category has a simple **icon drawn in code** (canvas paths: mountain, wave, building blocks, pagoda, bridge, planet, bowl, paw, compass line). No likeness of any real building, no maps, no logos, nothing to license. This also keeps the package tiny and works offline.
- **Palette** (frontend-ui owns the final tokens and the contrast check): paper `#FAF7F0`, ink `#1F2328`, seal cinnabar `#B8432F`, correct teal `#1F7A6D`, miss vermilion `#C0392B`. Category accents are muted (城市 slate blue, 山河 teal, 古今 ochre, 动物 olive, 天文 indigo, 工程 grey-brown, 吃喝 persimmon, 距离 sea blue). **Correct/miss are never shown by colour alone:** always ✓ 对 / ✗ 错 text as well.
- **Numbers** are the hero: tabular digits, at least 40 pt for the revealed value, with the unit beside it and the source line below in 13-14 pt (16 pt in large-text mode).
- **Motion:** the lower card turns over (about 0.4 s) and the number counts up (about 0.6 s, tap to skip). On a correct answer the lower card slides up to become the new top card. On a miss the card gives a short shake and a soft "嗒". No confetti storms, no casino sounds.
- **Fonts:** system font for UI; an open-licence display face (OFL, e.g. 思源宋体 subset) for the title and the big streak number, loaded from a subpackage with system-font fallback (same pattern as 点将台).
- **Accessibility:** large-text and high-contrast modes, reused from 点将台 (spec §6.19).

## 7. Content strategy (summary; the rules are in spec §3)

- **682 facts at launch** in 8 categories and 13 measures, every one with value, unit, year, source, URL, licence class, retrieval date and two independent verifiers.
- **Public, licensable sources only:** 国家统计局 and provincial statistics bureaus (第七次全国人口普查, attribution and accuracy required by their terms), officially published geographic data (自然资源部 重要地理信息数据, 水利部), 国家文物局 publications, NASA (US public domain), USDA FoodData Central (CC0), GeoNames coordinates (CC BY 4.0) for distances we compute ourselves, and single cited facts from published references under a strict per-source cap. **No** scraped platform data (百度指数, 微信指数, e-commerce, app ranks), **no** Wikipedia/Baike copying, **no** AI-generated values.
- **Two pools:** a free-play pool bundled in the game (440 facts) and a **daily pool held only on the server** (242 facts), so the daily answer key is not in the package.
- **Never compared:** politics, people, ethnic groups, religion, regional "quality" (GDP, income, crime, education), disasters and casualties, war or military, territory, borders or areas of regions, Taiwan/HK/Macau, brands, companies, prices, salaries, stocks. No maps.
- **Rotation:** monthly content releases add daily facts and move well-used daily facts into free play.

## 8. Moat and clone risk

The format is generic and easy to clone ([SL] #3, uniqueness 2). Our defences:
1. **Data quality and trust:** sourced, verified, neutral facts with a visible error-report loop. A clone with scraped or careless data will lose arguments in group chats.
2. **The daily group loop:** same deck, server-authoritative group and friend boards, challenges and day streaks, already proven in the 点将台 stack.
3. **Speed:** about 85% of the stack is reused from 点将台 ([KEPT] §5), so we can ship first and keep the content fresh monthly.

## 9. Compliance posture (summary)

- No UGC at all: the only user input is two buttons and a fixed list of report reasons. No moderation pipeline is needed.
- IAA only; no payments, no virtual currency, no prizes.
- Ads never change a ranked result; nothing is rewarded for sharing; the platform's share-for-reward fallback page is disabled.
- Privacy: OpenID-based, no nickname or avatar to our servers, friend data only inside the open data domain, declared 微信朋友关系 and 相册（仅写入）.
- Data accuracy and attribution are treated as compliance items (国家统计局 terms; officially published geographic values). [VERIFY] Commercial use of 国家统计局 data is not addressed by its terms; default is to proceed with attribution and accuracy, with a ready source-swap path (spec §3.4, decisions PO-20).

## 10. Release plan and success measures

Per constitution Art. 4 and the 点将台 precedent: **complete v1 build → QA → release pack → Founder Handoff → founder device pass → submission.** No validation gate. The research go/kill thresholds become **post-launch KPIs** (spec §12): runs per session ≥ 3, card-open-to-play ≥ 25%, D1 ≥ 35% (launch target 40%), D7 ≥ 15%, share rate ≥ 8%, and a **data-dispute report rate below 1% of reveals** ([KEPT] §4).

## 11. Top risks

| Risk | Mitigation |
|---|---|
| A clone already exists or appears fast | Ship fast on the reused stack; out-compete on trust and the group loop. The founder's in-app search is listed in the Handoff as information, not a gate |
| Data disputes ("成都人口不对!") | Official sources only, the min-gap rule, source line on every reveal, the report flow, two-person verification, versioned corrections |
| Repetition (players memorise facts) | 682 facts, two pools, monthly releases, a 3-day repeat window for daily facts, pairs that change with position |
| Lookups in the daily (no timer) | Accepted: no prizes, and a lookup costs more time than the game is worth. Observe-only anomaly flags (spec §11.5) |
| Accidental sensitive pair | Category allow-lists, exclusion tags, pair rules within one measure, human review of the content file |
| Licence uncertainty for 国家统计局 data | Attribution and accuracy as required; per-fact licence class lets us swap a whole source in one content version |
