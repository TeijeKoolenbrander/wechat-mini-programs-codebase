# 末日生存 (doomsday survival): saturation, Western refs, gaps, compliance
Date: 2026-10-15. Researcher: market-researcher. Confidence: MEDIUM-LOW. Web search returned thin results; chart data covers Dec 2025 and Jan 2026 only (about 9-10 months old, possibly stale). No Sep/Oct 2026 charts found.

## 1. Key findings
- Survival and zombie titles dominate the top of the WeChat grossing chart. In Jan 2026 the top 5 was 三国：冰河时代, 生存33天, 向僵尸开炮, 无尽冬日, 道友来挖宝. Three of the five carry cold-wave, survival or zombie themes (ice-age and winter are inferred from the names).
- 向僵尸开炮 was #2 on the WeChat grossing chart in Dec 2025 and #4 on the WeChat ad-spend (买量) top 100.
- 生存33天 is the 2025-26 breakout of this theme. It was #13 in Dec 2025 (+64 places, fastest riser in the top 30) and #25 on Douyin (+38). By Jan 2026 it was #2.
- Mechanics for these titles are not stated in my sources. I infer from the genre that they are IAA+IAP hybrid, SLG or idle-defense with heavy ad buying. Treat this as inference.
- The saturated lanes are: (a) zombie shooters and tower defense, (b) 寒潮/冰河 city-building SLG, (c) generic base-survival and crafting. All are heavy-ad-spend, long-session, numbers-driven games.
- Not found in the sources: a short-session, social, daily-shared-scenario survival game on WeChat. I did not find one in this search, but the search was shallow. Verify in-app before committing.
- Compliance: the zombie genre was reported in 2021 as targeted by regulators for being "too terrifying". Specific WeChat mini game review clauses on horror, disaster and pandemic content were NOT found. Verify against the current 《小游戏审核规范》 and the operations rules at developers.weixin.qq.com.

## 2. Evidence
### 2.1 China saturation (facts)
| Title | Platform and chart | Rank | Date | Source |
|---|---|---|---|---|
| 三国：冰河时代 | WeChat grossing | #1 | Jan 2026 | https://c.m.163.com/news/a/KMN73CL505466ZM9.html (published 2026-02-26) |
| 生存33天 | WeChat grossing | #2 (up 11) | Jan 2026 | same |
| 向僵尸开炮 | WeChat grossing | #3 | Jan 2026 | same |
| 无尽冬日 | WeChat grossing | #4 | Jan 2026 | same |
| 向僵尸开炮 | WeChat grossing / ad-spend | #2 / #4 | Dec 2025 | https://www.taptap.cn/moment/762648499756994209 (data: 引力引擎, Insightrackr) |
| 生存33天 | WeChat #13 (+64), Douyin #25 (+38) | | Dec 2025 | same |
| 疯狂水世界 | Douyin grossing, new entry | n/a | Dec 2025 | same |
| 遗弃之地 | WeChat #17 (+18), also on ad-spend list; Douyin new entry (genre not labelled) | | Dec 2025 | same |

- A July 2026 18183 roundup lists several WeChat survival mini games, but it contradicts itself on 生存33天 and has no chart data. Low reliability: https://www.18183.com/zhxz/8968007.html
- Background (stale, 2021): apocalypse-survival mobile games grossed over US$1.1B globally in H1 2021, and long-running titles such as 明日之后 and State of Survival ran ads for 900+ days. https://www.36kr.com/p/1379928534072706
- Monetization: the sources do not state monetization for these titles. Not found.
- Overcrowded (inference): zombie shooters, ice-age or winter SLG, and base-building survival. All depend on heavy user acquisition, with ad-spend rankings showing established players. A new entrant cannot win by buying traffic.

### 2.2 Western short-session survival references
- Reigns (Nerial / Devolver Digital): swipe left or right on a card, adjust four meters (church, people, army, treasury), die and restart as a new heir. A run takes a few minutes. Social mechanic: none native. About 1.8M copies sold, of which about 400k+ on Steam. https://www.pcgamer.com/au/how-reigns-and-its-forthcoming-sequel-make-their-tinderocracy-work (date not shown, stale). Reigns: The Witcher is slated for Feb 2026 on mobile and PC, which shows the format is still licensable. https://iphonesoft.fr/2026/02/03/reigns-the-witcher-geralt-swipe-destinee-mobile
- itch.io daily-loop prototypes show the format exists but has no mass traction: The Prepper (7-day prep, then random daily events; leaderboard not working): https://rubymoongames.itch.io/the-prepper. Day 32 (every action costs time, score is days survived; HTML5): https://winnermango.itch.io/day-32. Daily Wild Hunt Simulator (fixed daily deadline, rising demand): https://moxinat.itch.io/daily-wild-hunt-simulator. No traction figures found.
- You Will Not Survive (browser game, AI-generated scenarios, typed actions): https://aiindigo.com/blog/survival-of-the-smartest-a-2026-review-of-you-will-not-survive. Traction not found. Typed input is not one-thumb.
- 60 Seconds! (commercial, nuclear countdown, 60s scavenge round then decision days): the closest known fit for a 1-3 minute loop. Not verified in this search, so treat as background knowledge only. IP owner: Robot Gentleman.
- Not found: any Western hit with async raid/defend among friends in a short-session survival format, with sourced traction. This is an open question.

## 3. Opportunities (all my inference, not sourced)
Rated 1-5 (5 best).

### A. 同一场末日，你活了几天？ (shared daily scenario run). TOP PICK
- Everyone in the group gets the same seed per day (same events, same supplies). Choose among 2-3 cards per day with one thumb (swipe, Reigns-style). Result: "活了 N 天", with a death cause card.
- Simple 5, daily hook 5 (new seed daily, Wordle-style), shareability 5 (the group compares days survived, with a ranking inside the group), WeChat API fit 5 (group ranking via friend/group cloud storage or open data context, share card with the death cause, wx.getShareInfo for group identity).
- IAA: rewarded video for a revive or extra supply item, interstitial after death. Keep a hard limit of one revive per run so it is not a dark pattern.
- Signal: Wordle-style daily seed model plus Reigns' proven swipe loop; survival-themed charts are strong in China but only in long-session SLG form.

### B. Group-chat co-op shelter (friends' choices affect each other)
- One shelter per group chat. Each member makes one daily choice (ration, scout, repair). The group outcome resolves overnight and posts a summary card.
- Simple 4, daily hook 5, shareability 5 (the group is the game), API fit 4. Risk: needs enough active members, otherwise it feels dead. Needs a cloud function or backend, so more cost than A.
- Risk of induced sharing: do not gate play on invites.

### C. Async supply raids among friends
- Each player has a stash. Friends raid or defend it asynchronously, and others see the result.
- Simple 3, daily hook 4, shareability 4, API fit 3. Social pressure from raiding friends can feel hostile. Potentially close to "induced sharing" if the game punishes inactivity. Also it is closest to existing SLG mechanics, so more competition.

### D. 末日生存人格卡 (survival-style personality card)
- 5-8 questions in under 30s produce a "what role would you be in a doomsday" card.
- Simple 5, daily hook 1 (one-off), shareability 4, API fit 5. Good as a viral onboarding layer for A (the role you picked gives a starting perk), weak alone.

Recommendation: A as the core, D as the share-card or onboarding layer, B as a later phase.

## 4. Risks and compliance
- Compliance (facts with limits): a 2021 report states regulators targeted zombie-themed games as "too terrifying" (version-number level, not necessarily mini game review): https://cyprus-mail.com/2021/09/21/china-slows-game-approvals-to-enforce-tough-new-rules (stale). For WeChat mini games, versions-numbers (版号) are needed only for card/board games or payment-enabled games, per a qualification guide cited in reports: https://developers.weixin.qq.com/minigame/introduction/guide/ (verify). This supports the IAA-only launch.
- Compliance flags (my inference, to verify with the official 审核规范): avoid gore, dismemberment, blood and realistic death imagery; avoid real-world disasters, real pandemics, named cities, and real events (e.g. COVID, earthquakes, wars); avoid religious or cult-like framing of the apocalypse; avoid "zombie" horror aesthetics, use stylized cartoon art; prefer "废土 / 寒潮 / 洪水 / 停电" over "丧尸" and "瘟疫"; no cannibalism, suicide or self-harm in death texts; no resource-hoarding or "kill other survivors" text that glorifies violence among real players. Show the anti-addiction and age notice. Do not rely on "survival" mechanics that look like gambling (loot boxes).
- Known rejection causes: not found with sources. Ask the CTO to check the WeChat developer community and the official audit specification.
- Saturation: the theme is crowded in long-session SLG and shooters, so differentiate on format (short, daily, social), not on setting.
- Platform risk: group ranking and share APIs have changed before; verify current group-share APIs and that group IDs are still available.
- Induced-sharing policy risk: WeChat penalises forced share-to-continue mechanics. Keep sharing optional.

## 5. Open questions
- What are the Sep/Oct 2026 chart positions for 生存33天, 向僵尸开炮, 无尽冬日? (Check 引力引擎 and DataEye.)
- Monetization split (IAA vs IAP) and ad eCPM for these survival titles: not found.
- Does a daily-seed survival game already exist on WeChat or Douyin? Search in-app for 每日挑战 and 生存天数 titles.
- Current WeChat group-ranking and share APIs: what is possible without user prompts?
- Exact review wording for horror, disaster and pandemic content in the current 《小游戏审核规范》.
- Western traction numbers for daily survival games: not found.
