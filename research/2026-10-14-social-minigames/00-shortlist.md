# Social mini game shortlist (2026-10-14)

Author: opportunity-analyst. For: CTO, then founder (the founder must approve what we build).

Inputs:
- [SRC] `research/2026-10-14-social-minigames/01-us-source-games.md`
- [SAT] `research/2026-10-14-social-minigames/02-china-saturation.md`
- [LEG] `research/2026-10-14-social-minigames/04-legal-compliance.md`
- [SOC] `research/2026-10-14-social-minigames/03-social-mechanics-monetization.md`
- Three gap-filling searches I ran today (see section 7).
- A quick look at `apps/cheatshaizi/` to judge reuse.

Brief constraints applied: 30 s to 3 min sessions, addictive, social through WeChat-native features, unique in China, IAA only at launch, no third-party IP or real athletes, no gambling-like mechanics, no share-gated rewards, MVP in 4-8 weeks, main package of 4 MB or less.

Labels: **INFERENCE** marks my own judgement. **VERIFY** marks anything that needs official confirmation before a spec.

---

## 1. Summary

- **Build first: 「点将台」 (working title).** It is an original 三国 draft-and-grade game that uses the 82-0 loop, plus a daily shared seed and group leaderboards. It scored highest (4.00 of 5). It keeps the part of 82-0 that makes it work, which is drafting legends that everyone already has opinions about. It also avoids the part we can't legally use, which is real NBA players.
- **Runner-up: 「今日四组」.** This is a Connections-style daily Chinese puzzle with group leaderboards (3.80). It is the cheapest to build and the most durable, but it monetizes worst under IAA alone.
- **82-0 verdict:** don't port it, and don't license it now. Build an original game inspired by the mechanic. Fictional basketball is the weakest form of that, because a draft of made-up players loses the knowledge-and-debate hook that made 82-0 spread.
- **Rejected outright:** sports prediction or "hot take" betting (gambling-adjacent, [LEG] 2.6). An idol draft (fan-ranking content is a regulatory target; INFERENCE, VERIFY). A real-name NBA port ([LEG] 2.4). All sort, match, arrow, merge, idle, 割草 and word tower defense reskins ([SAT] 3).

---

## 2. Candidates (9 after merging duplicates)

1. **点将台: 三国 draft-and-grade.** You spin a faction (魏/蜀/吴/群/晋) and an era (黄巾, 官渡, 赤壁, 三分, 北伐), then draft one general into each of five slots (主公, 军师, 先锋, 猛将, 守将). A simulated campaign grades the lineup from 0-12 to a perfect "12-0 一统天下". There is one free re-spin each for faction and era. A daily seed gives everyone the same spins. A hidden-stats "识人模式" mirrors 82-0's HoopIQ mode.
   - Later expansion packs: 水浒 and 西游, then a cross-era "关公战秦琼" mode. These are classical novels and public domain. I merged the "mix of themes" option here as content expansion, not as a separate game.
2. **梦之队: fictional basketball draft.** This is the literal 82-0 loop with invented players and teams.
3. **Fictional football draft.** The Ultimate 11 / 38-0-0 loop with invented clubs and players.
4. **今日四组: daily Connections-style puzzle in Chinese.** Each day there are 16 tiles (characters, words or 成语) to sort into 4 hidden groups. Everyone gets the same puzzle, you have 4 mistakes allowed, and the result is a colour-block grid. There are group leaderboards by solve time and mistakes.
5. **成语 Wordle (汉兜-style) mini game.** Guess a four-character idiom from per-character hints.
6. **擂台 flick duel.** A one-tap skill shot (flick, throw) with async ghost challenges, built on the 社交擂台赛 component.
7. **盲排: blind-ranking party game.** Ten items are revealed one at a time, and you must slot each into ranks 1-10 without seeing what comes next. A group consensus view shows how your ranking matches your friends'.
8. **Physics smash for 视频号 clips.** A Smash Fest!-style cannon-smash game ([SRC] #13).
9. **九宫格: Immaculate Grid in Chinese.** A daily 3x3 grid where you name a 三国 figure or 唐诗 poet who fits both the row and the column ([SRC] #3).

---

## 3. Scoring

Weights, chosen to match the founder's brief:

| Criterion | Weight | Why |
|---|---|---|
| China uniqueness | 20% | This is the founder's main filter, and clone speed in China is high ([SAT] 5) |
| Social/viral on WeChat | 20% | Social-channel users make up 30-50% of registrations market-wide ([SAT] 2), and we can't win paid UA ([SOC] 4) |
| Addictiveness/retention | 15% | |
| IAA monetization fit | 15% | IAA only at launch |
| Build effort (5 = easiest) | 10% | |
| Legal/compliance (5 = safest) | 10% | Weighted lower only because the rejected ideas were already filtered out |
| Fad risk (5 = most durable) | 10% | |

| # | Concept | Unique | Social | Addict. | IAA | Effort | Legal | Durable | **Weighted** |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 点将台 (三国 draft) | 4 | 5 | 4 | 4 | 3 | 4 | 3 | **4.00** |
| 4 | 今日四组 (daily puzzle) | 4 | 4 | 4 | 2 | 5 | 4 | 4 | **3.80** |
| 6 | 擂台 flick duel | 2 | 4 | 4 | 4 | 4 | 5 | 2 | **3.50** |
| 7 | 盲排 blind ranking | 4 | 4 | 2 | 2 | 5 | 4 | 2 | **3.30** |
| 5 | 成语 Wordle | 2 | 4 | 3 | 2 | 5 | 5 | 3 | **3.25** |
| 2 | 梦之队 fictional basketball | 4 | 3 | 2 | 3 | 3 | 4 | 2 | **3.05** |
| 9 | 九宫格 grid trivia | 4 | 3 | 3 | 2 | 2 | 4 | 3 | **3.05** |
| 8 | Physics smash | 2 | 2 | 4 | 4 | 3 | 5 | 1 | **2.90** |
| 3 | Fictional football draft | 3 | 3 | 2 | 3 | 3 | 4 | 2 | **2.85** |

### Reasoning behind the contested scores

**The theme for the 82-0 loop (1 vs 2 vs 3) is the most important call in this document.**
- 82-0's hook is not the slot machine. It is *knowledge plus argument*: "LeBron/Kobe/Jordan only went 77-5?!" Haliburton's post is the evidence ([SRC] 2.1).
- With fictional players, nobody has priors. The game turns into reading stats, and the shared card means nothing to the friends who receive it. That is why I scored 2 and 3 at 2 for addictiveness and 3 for social.
- 三国 generals are the Chinese equivalent of all-time NBA legends. Everyone knows them, the 关羽-vs-吕布 arguments are endless, and the figures are public domain ([LEG] 3 lists 三国 heroes as a lower-risk domain).
- The theme also reaches the real WeChat mini game audience: 50% are aged 24-40 and 40% are over 40 ([SAT] 1). Basketball skews young and male.
- Football also suffers because the 2026 World Cup moment has passed, and 38-0-0 shows the format is already cloned in the West ([LEG] 2.1).
- **Counterpoint:** 三国 is a crowded *theme* in SLG (三国：冰河时代 is top-grossing; [SAT] 1). That is why concept 1 gets 4 for uniqueness, not 5. The *format* still looks open. I found no 三国 random-draft-and-grade product, only 抽卡/idle/SLG titles (search 2).

**今日四组 (4) scores only 2 for IAA.**
- One puzzle a day means one short session and very few ad impressions.
- Rewarded hints and an archive/practice mode help, but the format is built for habit, not for ad volume. NYT uses dailies as a subscription funnel ([SRC] 5, "Daily-puzzle monetization").
- Uniqueness is 4, not 5. 成语 puzzle apps are plentiful, but they are level-based, not daily and shared (search 3; [SAT] 2 "Wordle-likes in China"). Absence from search is weak evidence ([SAT] 1).

**成语 Wordle (5) is not unique.**
- 汉兜 and 成语 Wordle clones have existed since 2022 ([SAT] 2). This is the "obvious" localization, and someone has already done it.
- 今日四组 is the better daily format because grouping by category is newer in China, and it supports themed days such as 节气, 地方菜 and 网络热梗.

**擂台 flick duel (6).**
- It has the strongest platform tailwind: WeChat claims 5x share fission for 社交擂台赛 ([SAT] 2, a platform claim). 狙击外星人's "你狙我躲" also shows the hook ([SAT] 2).
- Its uniqueness is weak, though. Skill-shot duels are everywhere, and anyone can copy the mechanic in a week.
- Treat 擂台赛 as a *feature to bolt onto* concept 1 or 4, not as a game of its own.

**盲排 (7).**
- **There is no evidence for it in our research.** The idea comes from the TikTok "blind ranking" trend, from my general knowledge (INFERENCE, unverified).
- It is cheap to build and naturally social. But it has no skill progression, so retention will be poor, and it would need a steady flow of curated topics.
- It stays on the list as a possible *mode* inside 点将台, not as a standalone game.

**Physics smash (8).** This is a clone wave waiting to happen. Smash Fest! itself fell about 18% in a month and left Google Play ([SRC] 5). It has no share loop ([SRC] #13). Fad risk is 1.

---

## 4. Top 4 in detail

I stopped at four. The fifth-placed idea (成语 Wordle) fails the uniqueness filter, and two of the top four should really be features inside the others.

### #1 点将台: 三国 draft-and-grade (4.00)

**Pitch.**
Spin a faction and an era, draft five legendary generals, and see whether your army goes 12-0 and unites the realm. Then post the lineup in your group and argue about why 诸葛亮 + 吕布 only went 9-3.

**Core loop (60-120 s per run).**
1. Spin and pick, five times, with one free re-spin each for faction and era.
2. A campaign simulation plays as a 10-second animated battle log with a narrator's 评语.
3. You get a grade from 0-12 to 12-0, with a rarity line such as "only 0.8% of players reached 12-0 today".
4. Play again. Free mode is unlimited. The daily seed allows one attempt per day, which keeps group leaderboards fair; 82-0 also has this mode, where everyone gets the same draws and one try per day (search 1).

**Social mechanics (all WeChat-native, none gating rewards).**
- **Result card.** A canvas-rendered lineup with the record, shared through `wx.shareAppMessage` ([SOC] 2.1).
- **Group leaderboard.** Today's daily seed is ranked within the group via `withShareTicket` and `wx.getGroupCloudStorage` (the API is UNVERIFIED for 2026, [SOC] 2.1).
- **Friend leaderboard.** A friend ranking with streaks, rendered in the open data domain.
- **Async challenge card.** "Draft on my seed and beat my 10-2." The friend plays the same spins, and both cards update through `updatableMessage` ([SOC] 2.1).
- **擂台赛.** The user posts their lineup as 擂主 and friends try to beat it.
- **视频号 clips.** The battle-log reveal is a natural 10-second clip.

**Monetization (IAA only).**
- Rewarded video for an extra re-spin in free mode (not in the daily, so the leaderboard stays fair).
- Rewarded video for a "复盘": today's best possible lineup, revealed after your run.
- An interstitial every 3rd free run, and a banner on the result screen.
- Re-spins have no cash value and are not sold, which avoids paid-randomness rules ([LEG] 2.6).

**Evidence.**
- 82-0 went viral in June 2026 and spawned an app within three weeks, plus dozens of clones ([SRC] 2.1).
- Chinese basketball circles shared 82-0 lineups, but there is no dedicated WeChat mini game ([SAT] 1, 2; search 1 found none).
- I found no 三国 draft-and-grade product (search 2).
- DataEye forecasts social and group play as the growth direction ([SAT] 2).
- **Contrary evidence:** 82-0's own app has only about 45K MAU (AppGoblin, [SRC] 2.1). The Western traction was largely one viral moment.

**Effort: about 6-8 weeks.**
- Team: 1 dev, 1 artist, plus part-time design for balancing.
- Code is small. We can reuse the native-canvas loop and the fake-`wx` test harness from `apps/cheatshaizi/mini-game/` (no engine, no build step). The backend is WeChat cloud for seeds and leaderboards.
- The real cost is **content and balance**:
  - About 120-160 generals, each with an original portrait and our own stat model. Koei's 三国志 numeric ratings and 三国杀 card art are their expression; don't copy them ([LEG] 2.2).
  - A simulator that feels fair but still produces arguments.
- Portraits must live in a subpackage or remote CDN to keep the main package at 4 MB or less ([SOC] 2.5).

**Compliance hurdles.**
- Standard items: 小程序备案, 软著, a privacy guide, and anti-addiction/real-name checks (VERIFY for IAA-only).
- A mainland entity is needed for the game category and for 流量主 ([LEG] 1.7, 1.8).
- We need original art and names. Register our own mark in CNIPA classes 9, 41 and 28 ([LEG] 3).
- If we use AI-generated portraits, China's AIGC labelling rules may apply. INFERENCE from general knowledge; VERIFY with counsel.
- Avoid portraying historical figures in a demeaning way. The risk is low, but content review is subjective.

**Key risks.**
1. The format is a fad and clones arrive in weeks ([LEG] 4). Our moat is content quality, balance and the daily group loop, not the mechanic.
2. The simulator feels arbitrary and players stop believing the grade.
3. 三国 ad creatives are saturated by SLG titles, which hurts paid UA. We plan to grow organically anyway.

**Cheapest validation (about 2 weeks, before commissioning art).**
- **Week 0, theme test (2-3 days).**
  - Mock three static result cards: 三国, fictional basketball, fictional football.
  - Post them in 15-20 real WeChat groups through the founder's network, using a simple H5 or a trial-build link.
  - Metric: tap-through and replies per card.
  - This settles the theme with data instead of opinion.
- **Weeks 1-2, prototype.**
  - Text plus placeholder portraits, 60 generals, daily seed, share card and group leaderboard, using the cheatshaizi canvas skeleton.
  - **Go if:** share rate ≥ 10% of completed runs, card-open-to-play ≥ 25%, ≥ 3 runs per session, and D1 ≥ 35%.
  - **Kill if:** share rate < 4% or runs per session < 2.
  - These thresholds are INFERENCE. We have no published WeChat benchmarks ([SOC] 2.3).

### #2 今日四组: daily category puzzle (3.80)

**Pitch.**
Each day everyone gets the same 16 tiles. Find the four hidden groups with four mistakes allowed, then paste your colour grid into the family chat and see who in the group solved it fastest.

**Core loop.**
- The daily puzzle takes 1-3 minutes.
- Streaks count up across days.
- An archive or practice mode holds past puzzles.
- Topics can rotate by theme: 节气, 方言, 地方菜, 诗词, 网络热梗.

**Social mechanics.**
- The result grid card, which is the Wordle mechanic ([SRC] 3).
- A group leaderboard via shareTicket for "today in this group".
- A friend streak board in the open data domain.
- A dynamic card showing "已有 7 位群友完成".
- 擂台赛 as an optional "speed run" mode.

**Monetization.**
- Rewarded video for a hint (reveal one tile), extra archive puzzles, and streak protection by watching an ad ([SRC] 3).
- A banner on the result screen.
- Revenue per user will be low. Plan for it to be a cheap retention asset, not the cash engine.

**Evidence.**
- Connections had 1.6B solves in 2025, and Wordle 4.2B ([SRC] 1).
- No Wordle- or Connections-style title appears in the WeChat charts ([SAT] 1).
- DataEye predicts "group puzzle-solving" ([SAT] 2).
- LinkedIn Games is a precedent for a daily game inside a closed social graph ([SRC] #8).

**Effort: about 4 weeks.**
- The package is tiny and has almost no art.
- Ongoing content is the cost: one good puzzle a day. An AI-assisted generator with human QA is needed, at roughly 30 minutes per day.

**Compliance.**
- The same standard filings as #1.
- Word lists need sensitivity review, because 网络热梗 can be politically or commercially loaded.

**Key risks.**
1. IAA revenue may never cover content costs.
2. A Chinese category puzzle is hard to make "fair". Ambiguous groups cause anger rather than shares.
3. The 40+ audience may find it too wordy. This is INFERENCE.

**Cheapest validation.**
- Hand-make 14 puzzles and ship a bare prototype in about 1.5 weeks.
- Run it daily in 10 groups for 14 days.
- **Go if:** D7 ≥ 25%, ≥ 15% of solvers share their grid, and group-card installs per sharer ≥ 0.3.

### #3 擂台 flick duel, recommended as a feature rather than a game (3.50)

**Pitch.** A 30-second one-thumb skill shot, where your friend's best attempt is the "擂主" you have to beat.

**Core loop and social.**
- You attempt the shot, see the ghost of the current 擂主, and either take the 擂台 or lose.
- It uses the 社交擂台赛 component, which WeChat claims gives 5x fission ([SAT] 2), plus friend boards.

**Monetization.** A rewarded retry and interstitials. This fits IAA well.

**Effort.** About 3-4 weeks.

**Compliance.** Low risk.

**Key risks.**
- Anyone can clone it in days, so there is no uniqueness.
- The 擂台赛 component's access rules and current API are unverified.

**Validation.**
- Zero cost: read the official 擂台赛 and 运营规范 docs first.
- If they are accessible, prototype it as a *mode* of 点将台 ("my lineup holds the 擂台; draft today's seed and beat it") rather than as a separate flick game.

### #4 盲排 blind ranking (3.30)

**Pitch.** Rank ten things you can't see in advance, then find out how much your group chat agrees with you.

**Core loop.**
- Ten reveals and ten placements, in about 60 seconds.
- A consensus view compares your ranking with your group's.

**Social.** A group "合拍度" score via shareTicket.

**Monetization.** Weak: a rewarded "peek next item" and interstitials.

**Effort.** About 3 weeks, plus a continuous flow of curated topics.

**Compliance.** Topics must be curated, with no user-generated topics at launch, to avoid content-review issues.

**Key risks.**
- There is no evidence in our research; it comes from general knowledge of a TikTok trend.
- Retention is shallow and it monetizes weakly.

**Validation.** Run it as a week-long side mode inside the 点将台 prototype, using "blind-rank five generals", and measure replay rate and share rate.

---

## 5. Recommendation

**Build 点将台 first**, with the daily seed and group leaderboard in the MVP and 擂台赛 as the first post-launch feature.

Why it beats 今日四组, the runner-up:
1. It has the only proven *viral* moment in our source pool ([SRC] 2.1).
2. It monetizes far better under IAA, because unlimited free runs create natural rewarded-video slots for re-spins and 复盘.
3. The 三国 theme reaches the 24-40 and 40+ majority of the WeChat audience ([SAT] 1).
4. It has the clearest open gap in China ([SAT] 1; searches 1 and 2).

今日四组 is the strongest second title. Its daily-seed and group-leaderboard backend is the same one we would build for 点将台, so building 点将台 first makes the second game cheaper.

Conditions: we commission art only after the theme test and the two-week prototype meet the go thresholds in section 4, #1.

---

## 6. 82-0 verdict: port vs license vs original-inspired

- **Port: no.**
  - Real NBA names, likenesses and marks need licences in China. The Jordan Chinese-name ruling shows courts enforce athletes' name rights ([LEG] 2.4).
  - Copying 82-0's UI, flow and name raises copyright and unfair-competition risk. A complaint-based takedown would hit the credit score of our whole entity ([LEG] 2.2, 2.3).
- **License: not now.**
  - What PlayVault/Vaulty could license is (a) a brand with no recognition in China and (b) a mechanic that is a thin, already-cloned idea we can use freely ([LEG] 2.2: rules are treated as ideas; 38-0-0 and dozens of clones exist).
  - A PlayVault licence would almost certainly *not* include NBA or player rights. Those sit with the league and players (Tencent's China NBA rights are UNVERIFIED, [SAT] 5).
  - It is worth one low-cost email only if the founder wants a goodwill and partnership angle. Don't wait on a reply.
- **Original-inspired: yes, but not fictional basketball.**
  - Keep the loop (spin, draft, grade, share) and the daily-seed mode.
  - Change the content to 三国, so players get the recognisable-legends hook without likeness rights.
  - Avoid "82-0" in the name and marketing ([LEG] 2.3).
  - If the founder still prefers basketball, the theme test in section 4, #1 will show whether fictional-player cards can compete. I expect them to lose.

---

## 7. Gap-filling searches run for this shortlist (2026-10-14)

1. "82-0 阵容 小游戏 微信 选秀 打分 2026": no WeChat version found. It confirmed that 82-0 has a daily challenge with the same draws for everyone and one attempt per day. Sources: https://82-0-challenge.com/ , https://www.taptap.cn/moment/813721498547126504 , https://appgoblin.info/apps/6780195090
2. "三国武将 随机抽 组阵容 评分 小游戏": no draft-and-grade product found. Results were 三国 idle, SLG and 抽卡 games (e.g. 极简三国志, 国战三国志). Sources: https://apps.apple.com/cn/app/id6444323871 , https://apps.apple.com/cn/app/%E5%9B%BD%E6%88%98%E4%B8%89%E5%9B%BD%E5%BF%97-%E5%8D%95%E6%9C%BA%E7%89%88mud%E6%96%87%E5%AD%97%E6%8C%82%E6%9C%BA%E5%85%BB%E8%80%81%E6%B8%B8%E6%88%8F/id1591154412
3. "每日一题 成语 猜词 微信小游戏 群排行 汉兜 2026": only level-based 成语 apps were found (成语玩命猜, 成语接龙大闯关), with no daily shared format. Source: https://apps.apple.com/au/app/%E6%88%90%E8%AF%AD%E7%8E%A9%E5%91%BD%E7%8C%9C-%E6%88%90%E8%AF%AD%E7%8C%9C%E7%8C%9C%E7%8C%9C%E7%9B%8A%E6%99%BA/id622333898

All three are web searches and are weak evidence of absence. A human should still search WeChat in-app for 点将, 三国阵容, 82胜, 每日 成语 and 四组 ([SAT] 6).

---

## 8. Open questions for the founder

1. **Entity:** do we have, or will we partner with, a mainland entity that can register the game category and receive 流量主 revenue ([LEG] 1.7, 1.8)? This blocks release of every concept.
2. **Theme:** are you open to 三国 instead of basketball? Will you run the 3-card theme test in your WeChat groups?
3. **Art budget:** for about 120-160 original portraits. Are AI-assisted portraits acceptable given the labelling and copyright uncertainty?
4. **PlayVault:** send one courtesy email, or skip it?
5. **Seeding network:** can you get the prototype into 15-20 real groups for the 2-week test?
6. **Verify before the spec (minigame-dev and counsel):** the current 运营规范 text, 擂台赛 access, `getGroupCloudStorage` status, and IAA-only 版号 exemption.
