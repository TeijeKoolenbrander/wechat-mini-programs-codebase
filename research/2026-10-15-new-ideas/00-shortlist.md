# New ideas shortlist (2026-10-15)

Author: opportunity-analyst. For: CTO, then the founder (the founder chooses what to build, constitution Art. 2.1).

Founder brief for this round: a new list of ideas that includes **at least one 末日生存 idea and at least one BitLife-related idea**, under the same rules as the 2026-10-14 round.

## Inputs and citation keys

| Key | Source |
|---|---|
| [CON] | `docs/constitution.md`, Article 3 (simple, addictive, social) |
| [DOOM] | `research/2026-10-15-new-ideas/01-doomsday-survival.md` |
| [LIFE] | `research/2026-10-15-new-ideas/02-life-sim.md` |
| [SWEEP] | `research/2026-10-15-new-ideas/03-fresh-sweep.md` |
| [SL14] | `research/2026-10-14-social-minigames/00-shortlist.md` (the scoring approach from last round) |
| [SOC] | `research/2026-10-14-social-minigames/03-social-mechanics-monetization.md` |
| [LEG] | `research/2026-10-14-social-minigames/04-legal-compliance.md` |
| [P0] | `docs/dianjiangtai/phase0-platform.md` (official WeChat API checks, 2026-10-14) |
| [SPEC] | `docs/dianjiangtai/spec.md` (the 点将台 v1 stack: §5 seeds, §11 boards, §14 backend) |
| S1-S7 | My gap-filling searches today (section 9) |

Rules applied: [CON] Art. 3, IAA only at launch (no IAP, no 版号), original IP only, unique in China (reskins of saturated genres are rejected), no gambling-like mechanics or paid randomness, no anonymous friend-rating, no runtime generative AI at launch, content safe for review.

Labels: **INFERENCE** is my own judgement. **VERIFY** means it needs an official check or an in-app check before a spec.

---

## 1. Summary

- **Build next: 「同一场末日」** (working title), a daily shared-seed survival game. You make one swipe per day, and your score is the number of days you survive. It scores **4.15**, the highest of 11 candidates and higher than 点将台's 4.00 last round. It is also the cheapest serious build, because almost every backend piece already exists in 点将台: the seed bank, progressive round delivery, server replay, hashed group boards, challenges, streaks and ad config.
- **The BitLife idea (「今日人生」) ranks #4 (3.60).** On its own it is weaker: the genre is saturated in China, it monetizes worse and it carries more content-review risk. As a **second app on the same choice engine**, though, it costs only about 3-4 weeks. Build it after 同一场末日, not instead of it.
- **Shared engine: yes.** 同一场末日 and 今日人生 are the same machine: a seeded deck of event cards, a small state vector, one-thumb choices, an end condition and one score. Build one "daily shared-scenario choice engine" (同签抉择引擎) and ship **two separate apps** on it, not one app with two modes. Two modes would break the one-sentence rule in [CON] 3.2.
- **#2 猜将 (3.95) should be a 点将台 mode, not a new app.** It reuses the 120-general roster and the daily backend ([SWEEP] 1), costs about 2 weeks and gives 点将台 a second daily reason to open the game.
- **Rejected:** 末日人格卡 on its own (it has no daily hook, so it becomes the onboarding for #1 instead), async supply raids (SLG-adjacent and hostile), one-decision-per-day slow life (no reason to replay right away), and Contexto-style 语义热冷 (typing is not one-thumb, and the free-text input needs moderation).

---

## 2. Candidates (11 after merging)

Merges: the "survival personality card" [DOOM] D is scored on its own to show why it fails, then reused as the onboarding layer of #1. Era skins [LIFE] 4, friends-as-NPCs [LIFE] 2, "live a friend's life" [LIFE] 5 and "ending share card" [LIFE] 6 are layers of 今日人生, not separate games. Rotating apocalypse types are the equivalent era-skin layer for 同一场末日.

| ID | Concept | Source |
|---|---|---|
| A | **同一场末日**: a daily shared-seed survival run. Everyone in China gets the same apocalypse and the same deck today. You swipe one card per in-game day, and the score is the number of days survived plus a death-cause card. | [DOOM] A + D |
| B | **今日人生**: a daily shared-seed life. Everyone gets the same birth, family and era plus about 8-12 life-stage choices, and the result is a life score and an ending card. | [LIFE] 1 + 4 + 5 + 6 |
| C | **群聊避难所**: one shelter per group chat. Each member makes one choice a day, the outcome resolves overnight and a summary card goes to the group. | [DOOM] B |
| D | **末日人格卡** (standalone): 5-8 swipes produce a "your doomsday role" card. | [DOOM] D |
| E | **搜刮突袭**: async raids on and defence of friends' stashes. | [DOOM] C |
| F | **一日一年**: one life choice per real day, one year per day, about 80 days per life. | [LIFE] 3 |
| G | **猜将**: a Loldle-style daily. Guess today's 三国 general and get green, orange or red feedback per attribute. | [SWEEP] 2 |
| H | **语义热冷**: a Contexto-style daily. Guess any word and get a semantic-closeness rank. | [SWEEP] 1 |
| I | **比一比**: Higher/Lower streaks on Chinese stats (city sizes, food prices, distances). | [SWEEP] 4 |
| J | **老照片猜年份**: 5 photos a day, guess the year. | [SWEEP] 3 |
| K | **群友刻度盘**: a Wavelength-style spectrum dial where the clue is sent in the group chat. | [SWEEP] 7 |

Already dropped by the researchers and not re-scored: drawing-guess, 谁是卧底, 默契 Q&A, 成语 word-link, tap-count races (saturated); Gas-style friend rating (no anonymous friend-rating; WeChat history); tap-to-earn; Infinite Craft (runtime AI); Peak co-op (real-time sync); Netflix TV party (no TV casting) ([SWEEP] 2, 3).

---

## 3. Scoring

### 3.1 Weights

Changed from [SL14] to put the constitution's three principles in explicitly. Any score below 3 on Simple, Addictive or Social **fails** the idea under [CON] 3.5, whatever its total.

| Criterion | Weight | Why |
|---|---|---|
| Simple | 10% | It is mostly a gate (score ≥ 3). The candidates that pass sit at 4-5, so a higher weight would mostly add noise |
| Addictive (replay now + daily return) | 15% | [CON] 3.3. It drives IAA volume as well as retention |
| Social (WeChat relationship chain) | 15% | [CON] 3.4. We can't win paid UA against survival SLG ad spend ([DOOM] 2.1, [SOC] 2.3) |
| China uniqueness | 20% | The founder's main filter. Clones arrive in weeks ([SWEEP] 5) |
| IAA monetization fit | 10% | IAA only. One-puzzle-a-day formats monetize badly ([SL14] 今日四组, [SWEEP] 5) |
| Build effort (5 = easiest) | 10% | Credit for reuse of the 点将台 stack ([SPEC] §5, §11, §14) |
| Legal and compliance (5 = safest) | 10% | Content review, privacy, AIGC, 诱导分享 |
| Durability (5 = least fad risk) | 10% | |

### 3.2 Score table (ranked)

| Rank | ID | Concept | Simple | Addict. | Social | Unique | IAA | Effort | Legal | Durable | **Weighted** | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | A | 同一场末日 (daily survival) | 5 | 4 | 5 | 4 | 4 | 4 | 3 | 4 | **4.15** | **Build next** |
| 2 | G | 猜将 (attribute-guess daily) | 5 | 3 | 4 | 4 | 3 | 5 | 5 | 3 | **3.95** | Pass, as a 点将台 mode |
| 3 | I | 比一比 (Higher/Lower streak) | 5 | 5 | 4 | 2 | 5 | 4 | 4 | 2 | **3.75** | Pass, uniqueness weak |
| 4 | B | 今日人生 (daily shared life) | 5 | 4 | 4 | 3 | 3 | 4 | 3 | 3 | **3.60** | Pass, second app on the engine |
| 5 | C | 群聊避难所 (group shelter) | 4 | 3 | 5 | 5 | 2 | 2 | 3 | 3 | **3.60** | Pass, later phase |
| - | H | 语义热冷 (Contexto) | **2** | 4 | 4 | 4 | 5 | 3 | 3 | 3 | 3.60 | **FAIL Simple** |
| 6 | J | 老照片猜年份 | 5 | 3 | 4 | 4 | 3 | 2 | 2 | 3 | **3.35** | Pass, content and rights cost |
| 7 | K | 群友刻度盘 (dial) | 3 | 3 | 5 | 3 | 2 | 3 | 4 | 3 | **3.30** | Pass, weak IAA |
| - | F | 一日一年 (slow life) | 5 | **2** | 3 | 4 | 1 | 4 | 3 | 2 | 3.05 | **FAIL Addictive** |
| - | D | 末日人格卡 (standalone) | 5 | **1** | 4 | 2 | 2 | 5 | 4 | 1 | 2.85 | **FAIL Addictive** (used as A's onboarding) |
| 8 | E | 搜刮突袭 (async raids) | 3 | 4 | 3 | 2 | 4 | 2 | 2 | 3 | **2.85** | Rejected (SLG-adjacent, hostile) |

Arithmetic, for example A: 0.5 + 0.6 + 0.75 + 0.8 + 0.4 + 0.4 + 0.3 + 0.4 = 4.15.

**Tie at 3.60 (B vs C).** B ranks above C because:
- its [CON] principles total is higher (13 vs 12);
- its effort drops further once the A engine exists (Effort 4 is scored as standalone on the 点将台 stack; on the A engine it is closer to 5, which would give 3.70).

### 3.3 Reasoning behind the contested scores

**A: why Unique is 4 and not 5.**
- The theme is the most crowded on WeChat: 3 of the Jan 2026 top-5 grossing titles carry survival, cold-wave or zombie themes ([DOOM] 1, 2.1).
- The leader, 生存33天, uses the same **day-count frame**: hold out for 33 days, and each day decide whether to scavenge or stay (S1, download-site descriptions, low reliability). Players and reviewers may read "活了几天" as a nod to it.
- The *format* looks open, though. Every survival title found is long-session SLG, idle defence, shooter or base-building ([DOOM] 1). I found no short, daily, shared-seed swipe survival game on WeChat, and no Chinese Reigns-style swipe game either (S3, S4). This is web search only, so it is weak evidence of absence (founder check, section 8).
- Net effect: the theme brings proven demand, the format brings novelty, and the shared frame is a risk. That is a 4.

**A: why Legal is 3.**
- Zombie content was a regulator target in 2021 ([DOOM] 4).
- A reported game rule bans corpses and pools of blood (S7, PC Gamer, date unclear).
- No WeChat clause on disaster or horror content was found ([DOOM] 1). Survival writing invites death, hunger and conflict text. It is manageable with the content rules in section 7, but not trivially safe.

**A: why Addictive is 4 and not 5.**
- The daily ranked run is one attempt (the same fairness rule as 点将台, [SPEC] §5.2), and one-daily formats have thin sessions ([SL14] 今日四组).
- Free mode with random seeds gives the "play again now" loop. Reigns proves the die-and-restart pull ([DOOM] 2.2), but that is a premium game with no published WeChat retention data.

**B (今日人生): why Unique is 3.**
- 人生重开模拟器 got about 200M plays in 3 days in 2021 and spawned many clones ([LIFE] 2).
- Today there are a 比特人生 BitLife-style app on the China App Store (S5), a merge-click 我的人生模拟器 on WeChat (S5), and weak 中国式人生 / 武侠人生 clones rated 2.1-2.2 (S5).
- Only the shared-seed layer is new ([LIFE] 1). Clones are weak, which suggests the plain format is not growing (INFERENCE, [LIFE] 1).

**B: why Social is 4, not 5 like A.**
- "活了 41 天" is a single comparable number. A life ending is richer but less rankable: two people with different endings argue less about who won and more about what happened.
- That is good for chat but weaker for the group board (INFERENCE).

**B: Legal 3 only with strict writing rules.**
- The content surface is bigger than survival: minors' romance, crime, gambling, drugs, suicide, class and political satire, and 价值观导向 against glorifying 躺平 ([LIFE] 4).
- Era skins (80s 下岗, 房价) add modern-history risk ([LIFE] 3.4).

**C (群聊避难所): Unique 5, but IAA 2 and Effort 2.**
- Nothing like it was found ([DOOM] B).
- The session is about 15 s a day per member, so ad slots are few.
- It needs new group-scoped shared state, an overnight resolve job and "dead group" handling. Only `joinGroup`/`group_members` reuse cleanly ([SPEC] §14.1).
- Players who skip a day hurt the group. That can tip into pressure to recruit or to play, which is close to the 诱导 line ([DOOM] 4). Score: Legal 3.

**G (猜将): pass, but not a standalone app.**
- It has the best reuse of anything here, because the 120-general roster and stat model exist ([SPEC] Appendix C, [SWEEP] 1).
- But it is a thin format that can be cloned in days ([SWEEP] 2), and it has one puzzle a day (Addictive 3, IAA 3).
- As a standalone app it would need its own filing, 软著 and growth from zero. As a 点将台 mode it feeds the existing app's daily habit and cross-sells the draft.

**I (比一比): high on session and IAA, low on uniqueness and durability.**
- The original is a proven 2016 hit (500M+ plays, developer claim; [SWEEP] 4, stale). Each failed streak is a natural ad slot.
- It is "partially present, likely exists as a short-video format" ([SWEEP] 3) and the easiest of all to clone. That makes it closest to the "reskin" line of the rules. If the founder's in-app search finds it, the idea is dead.

**H (语义热冷): fails Simple.**
- [CON] 3.2 demands one-thumb play. Contexto needs typed guesses and dozens of tries, and is described as "punishingly hard" ([SWEEP] 4.1).
- The free-text input also needs a sensitive-word filter ([SWEEP] 5).
- A rework that offers 6 suggested words to tap removes the very thing that makes the game work. Rejected.

**F and D fail Addictive.**
- F (one decision a day) gives no reason to replay right away, and its own researcher flags a retention cliff ([LIFE] 3.3).
- D (personality card) is a one-off with a daily hook of 1 ([DOOM] D). Personality-test mini programs are a 2017-era category (INFERENCE).
- **Both survive as layers:** D as A's 30-second onboarding (section 4), F as a possible seasonal event of B.

**E (搜刮突袭): rejected despite passing the gates.**
- It is the closest to the saturated SLG lane ([DOOM] 1, C).
- Raiding friends is hostile, and punishing inactivity drifts towards induced sharing ([DOOM] C).

---

## 4. Top 5 in detail

### #1 同一场末日: daily shared-seed survival (4.15)

**Pitch.**
今天全国同一场末日：同样的灾变、同样的事件。每天一张卡，左滑右滑，你活了几天？
Swipe through today's shared apocalypse one day at a time, then see who in your group held out longest, and what got them.

**Core loop (60-150 s per run; one sentence: "swipe one choice per day and survive as many days as you can").**
1. A card shows the day's event (for example "邻居敲门借水"). Swipe left or right. Four meters move: 食物, 体温/水 (depending on the apocalypse type), 体力, 人心.
2. A meter at 0 (or overflowing at 100, the Reigns double edge, [DOOM] 2.2) ends the run. A full clear is "第 60 天：救援到了".
3. The result is "活了 N 天" plus a **death-cause card** written in a neutral or prosocial tone (for example "第 27 天，把最后的柴火分给了邻居"), and a rarity line ("今天只有 4% 的人活过第 40 天").
4. **Daily ranked run:** one attempt, the same seed for everyone, and **today's apocalypse type** rotates (寒潮, 洪水, 大停电, 沙暴, 怪雾, 陨石雨). This is the era-skin layer, and it keeps days distinct.
5. **Free mode:** unlimited runs on random seeds. This is the "play again now" loop and the main ad inventory.

**Onboarding (the 末日人格卡 layer, [DOOM] D).**
- The first launch is 5 swipe questions in under 30 s. They teach the swipe and produce a shareable "你在末日里是：老好人工程师" card.
- The role is **cosmetic** in the daily (an icon on the board and the result card), so ranked fairness holds. It may give a small perk in free mode only.
- This satisfies "learnable in under 30 s, no tutorial wall": the quiz *is* the tutorial.

**Social mechanic (all from the 点将台 stack, no share-gated rewards).**
- **Group board** of today's days survived, using hashed rows, `getGroupEnterInfo` and the open data domain ([SPEC] §11, [P0] 2.3-2.4).
- **Group death-cause histogram** ("群里 3 人冻死在第 12 天"). This is the conversation starter.
- **Challenge card** "同一场末日，我活了 41 天" plays the sharer's seed ([SPEC] §9.3).
- **Friend board** with streaks.
- No share ever grants anything. Set `disableFallbackSharePage:true` on rewarded video ([P0] 7.1).

**Daily hook.** A new apocalypse at 00:00 BJT, a streak counter, a 30-day history with the "best survivor's path" unlocked after the window closes (the 点将台 spoiler lock, [SPEC] §5.2), and an optional opt-in subscribe message for "好友接下了你的挑战" ([SPEC] §8.13).

**Monetization (IAA only).**
- **Rewarded:** one 再坚持一天 revive per run, in **free mode only** (hard limit of 1, [DOOM] A). After the daily, a rewarded **复盘** shows the longest path through today's deck.
- **Interstitial:** between free runs, with the existing `app_config` caps (≥ 120 s gap, ≤ 5 per day; [SPEC] §14.1). Errors 2001-2003 are handled silently ([P0] 7.2).
- **Banner:** on the result screen.
- There is no paid randomness: revives are not sold and do not change what the deck contains.

**Evidence.**
- Theme demand: 3 of the WeChat top-5 grossing titles in Jan 2026 are survival-themed, and 生存33天 was the fastest riser (#13, +64, to #2) ([DOOM] 1, 2.1; data 9-10 months old).
- Format: Reigns sold about 1.8M copies with a swipe, die and restart loop ([DOOM] 2.2). Wordle-style shared daily seeds are proven ([SL14] 今日四组: Wordle 4.2B, Connections 1.6B solves in 2025).
- Gap: no short-session daily survival found on WeChat ([DOOM] 1, 5), and no Chinese Reigns-style mini game found (S3, S4).
- **Contrary evidence:** the only daily survival prototypes in the West (The Prepper, Day 32) have no traction ([DOOM] 2.2). We are betting on the combination, not on a proven daily-survival hit.

**Effort: about 5-6 weeks to release-ready** (Art. 4 scope: full product, not an MVP), with 1 developer plus a content writer and light art.

| Piece | Reuse from 点将台 | New work |
|---|---|---|
| Daily seed, seed bank, `genDaily`, idempotency, TZ handling | Direct ([SPEC] §5.2, §14) | Gates change from "optimum reaches 12-0" to "best path reaches day 60, median bot dies around day 15-25" |
| Progressive delivery (`startRun`/`getRound`) | Direct. A card per day maps onto the per-round release, so nobody can read tomorrow's card from the client ([SPEC] §5.2) | Rounds become chunks of days, not 5 picks |
| Server replay and validation, anomaly flags, streaks, history | Direct ([SPEC] §14.3, §14.5) | New `core/` rules: a state machine instead of draft plus sim |
| Group and friend boards (hashed rows), challenge flow, share cards, privacy flow, ads, canvas UI kit | Direct ([SPEC] §8-§12) | Board value = days. New card layouts |
| Content | none | **About 300-400 event cards** across 6 apocalypse types, about 40 death-cause texts and about 30 illustrations. This is the critical path, written in parallel with the code |

**Compliance hurdles.**
- Content rules to write into the spec ([DOOM] 4, S7):
  - no 丧尸, 瘟疫 or real pandemics; no gore, corpses or blood pools;
  - no real disasters, cities or dates;
  - no cannibalism, suicide or self-harm, and no violence against other survivors as a goal;
  - no religious "end of days" framing;
  - stylized flat art.
- Fallback name if "末日" is a problem in review: 「同一场寒潮」 (VERIFY with 《小游戏审核规范》).
- Event cards may be drafted with AI **offline**, but every card must be human-reviewed and edited. Whether human-edited offline drafts need AIGC labels: VERIFY ([LIFE] 4).
- Standard items as for 点将台: 备案, 软著, 用户隐私保护指引 declaring 微信朋友关系 ([P0] 11), anti-addiction and age notice, mainland entity ([LEG] 1).

**Key risks.**
1. **Spoilers.** A shared deterministic deck can be posted in the group. Mitigation: the card order branches on state (choices change which card comes next), the server releases cards progressively, there is one attempt, and best paths stay locked until the window closes ([SPEC] §5.2). Some spoiling is fine and is itself social.
2. **Content burn.** 6 types times daily decks need a deep card pool, or days feel the same. Mitigation: recombine cards within a type, and set a gate on pool overlap between consecutive days.
3. **Feels random.** If deaths feel arbitrary, people stop believing the score. Use bot-simulation gates (as 点将台's simstats) and show meter deltas before the swipe commits (Reigns hints).
4. **Shadow of 生存33天.** Shared framing, and its ad creatives saturate the theme. We grow through group chats, not UA.
5. **Review** of disaster content (above).

**Cheapest validation (optional: Art. 4 says no validation pauses unless the founder asks).**
- **3 days, near zero cost:** the founder posts three static result cards in 15-20 real groups: "同一场寒潮，我活了 27 天", "今日人生：我活到 83 岁……", "猜将 第 12 期：4 次猜中". Measure tap-through and replies per card. This also tests the BitLife idea head-to-head.
- **1 week, text-only prototype:** 60 cards, 1 apocalypse type, the daily seed and group board, on the 点将台 mock-server harness.
  - **Go if:** ≥ 10% of completed dailies are shared, ≥ 2.5 free runs per session, D1 ≥ 35% (the [SL14] thresholds, INFERENCE; there are no published WeChat benchmarks, [SOC] 2.3).
  - **Kill if:** share rate < 4% or < 2 runs per session.

---

### #2 猜将: Loldle-style 三国 daily, as a 点将台 mode (3.95)

**Pitch.**
今天的武将是谁？每猜一次，阵营、时代、五德逐项变色提示。
Guess today's general in as few tries as you can, then post your colour grid in the group.

**Core loop.**
- Pick a general from a searchable list (tap, not type: reuse 点将台's `search.js`).
- Each attribute (阵营, 时代, 籍贯, the 五德 bands, role) turns green, orange or red, with arrows for numbers. Solve in N tries.
- 1-3 minutes.

**Social mechanic.**
- A colour-grid share card with no spoilers.
- A group board by number of tries (same pipeline as the 点将台 daily).
- "怎么会是吴国" arguments ([SWEEP] 4.2).

**Daily hook.** One puzzle a day, a streak, and a different silhouette or 评语 mode on Sundays (like 识人, [SPEC] §8.11).

**Monetization.** A rewarded hint (reveal one attribute) and a banner. It is a retention asset for 点将台, not a revenue engine.

**Evidence.**
- Loldle and Pokedle prove the format, but on fan IP and with no usage figures ([SWEEP] 2).
- No Chinese version was found ([SWEEP] 2).
- The roster, stats and art exist ([SPEC] Appendix C).

**Effort.** About **2 weeks** as a mode inside 点将台, after v1 ships. Never during v1 (Art. 9.7: parallel work never edits the same files).

**Compliance.** Public-domain figures and our own stat model ([SWEEP] 4.2). Low risk.

**Key risks.** Clones in days ([SWEEP] 5). As a mode, the downside is limited.

**Cheapest validation.** Ship it as a Sunday-only variant for 2 weeks. Measure the change in 点将台 D7 and the share rate of the mode.

---

### #3 比一比: Higher/Lower streaks (3.75)

**Pitch.**
重庆和成都谁人口多？两张卡选一张，连对多少个？
Two cards, pick the bigger number, and one miss ends the streak. Beat your group's best.

**Core loop.** Tap one of two cards, 30-90 s per run, and one wrong answer ends it ([SWEEP] 4).

**Social mechanic.** "我连对 14 个" challenge cards on the same daily sequence, plus a group board of the daily streak.

**Daily hook.** A daily themed sequence (地理, 美食物价, 历史年代), a streak and a weekly theme rotation.

**Monetization.** The best IAA fit of the list: an interstitial after a failed run and one rewarded continue per run in free mode ([SWEEP] 4.5).

**Evidence.** The 2016 original reached #1 on the App Store, with 500M+ plays claimed by the developer ([SWEEP] 4, stale). Not found on WeChat in web search, but "likely exists as a short-video format" ([SWEEP] 3).

**Effort.** About 3-4 weeks. The engine is trivial. The work is **curated, cited data** (about 2,000 pairs) and the reuse of daily seed, board and challenge.

**Compliance.**
- Use only stats we can cite (统计局, 公开数据).
- No celebrities, brands or rankings of real people (the 2021 饭圈 crackdown, [SWEEP] 5).
- Disputed numbers are a reputational risk, not a review risk.

**Key risks.** It is the most clonable idea here (uniqueness 2), and if it already exists on WeChat it is out. Durability is 2.

**Cheapest validation.** The founder's in-app search first (zero cost, section 8). If nothing turns up, a 1-week prototype with 300 pairs. **Go if** runs per session ≥ 3 and the challenge-card open-to-play rate is ≥ 25%.

---

### #4 今日人生: daily shared-seed life (BitLife-related) (3.60)

**Pitch.**
今天全国同一个出生：同样的家庭、同样的年代、同样的机遇。十个人生路口，你活出了什么结局？
Everyone is born into the same life today. Make about 10 choices at life's crossroads, then compare endings and life scores with the group.

**Core loop (60-120 s; one sentence: "make one choice at each life stage and see how your life turns out").**
- About 10 stages (童年, 求学, 高考, 第一份工作, 成家, 中年, 退休...). Each stage is a card with 2-3 choices.
- 4 meters: 健康, 财富, 幸福, 学识.
- The ending is a **结局 card** (one of about 40 endings) plus a 人生评分.
- One ranked daily, unlimited free lives.

**Layers.**
- **Era skins** ([LIFE] 4): rotate the birth decade weekly (1960s-2000s), with neutral, nostalgic milestones. Keep it to everyday life (粮票, BP机, 高考), never policy or politics.
- **Live a friend's life** ([LIFE] 5): this is simply the existing challenge flow ([SPEC] §9.3).
- **Friends-as-NPCs** ([LIFE] 2): deferred to v2. Friend nicknames and avatars are readable **only in the open data domain**, and that domain cannot send data back to the main domain ([P0] 2). So friends cannot appear in the event text without either rendering the story inside the open data domain (heavy) or collecting user-typed names (UGC that needs `msgSecCheck`). Consent to being cast as an NPC is a privacy question too ([LIFE] 4). For v1, show friends only on the board and in challenges.

**Social mechanic.** The same as #1, but the board ranks 人生评分, and the group card shows the **ending distribution** ("群里 2 人当了老师，1 人开了面馆").

**Daily hook.** A new life daily, a weekly era, a streak, and an "ending collection" (结局图鉴): collect all 40 endings. This chase for rare results is allowed by [CON] 3.3 because no money is involved.

**Monetization.** Rewarded "换个选择" (redo one stage) in free mode only, a rewarded 复盘 of today's best life, interstitials between free lives. IAA is weaker than #1 because life runs are longer and there are fewer natural death or retry moments (INFERENCE).

**Evidence.**
- BitLife: about 1.8M ratings, a 4.8 rating, DAU of 1.2M in 2020 and a $74.4M+ acquisition ([LIFE] 1, 2).
- 人生重开模拟器: about 200M plays in 3 days, built by 2 people in about 2 weeks ([LIFE] 2).
- Saturation: weak current clones rated 2.1-2.2, and a BitLife-style app on the China App Store (S5). Shared-seed life: not found (S2).
- AI life sims have not gone viral ([LIFE] 1), which supports pre-authored content.

**Effort.**
- **About 3-4 weeks after #1**, on the shared engine. The work is content: about 400-500 stage cards and 40 endings ([LIFE] 5 estimates 300-500 events for 2+ months) and an era-skin art pass.
- About 6-7 weeks standalone.

**Compliance hurdles** ([LIFE] 4). The content rules must cover:
- no 早恋 or minor romance;
- no crime, drugs or gambling as rewards;
- no suicide, and neutral death framing;
- no glorifying 躺平 or corruption;
- no class or political satire, and no real political events in era skins;
- a prosocial-leaning ending set.

Also: no runtime AI ([LIFE] 4). Avoid BitLife and 人生重开 names, text and talent lists ([LIFE] 3).

**Key risks.**
1. It reads as "another 人生重开" (uniqueness 3).
2. Value-guidance review is subjective and the life content surface is large.
3. Endings are less rankable than days survived, which makes the board weaker.

**Cheapest validation.** It is in the same 3-card test as #1 (zero extra cost). If its card beats the survival card, swap the build order. The engine is the same, so a swap costs nothing.

---

### #5 群聊避难所: group co-op shelter (3.60)

**Pitch.**
一个群，一座避难所。每人每天做一个决定，第二天早上看全群活下来没有。
One group chat, one shelter. Each member makes one call a day, and the next morning the group learns whether it made it.

**Core loop.** Open from the group card, read last night's outcome, make one choice (ration, scout, repair) and see the group meters. About 30 s.

**Social mechanic.**
- The group *is* the game: one shelter per `opengid` ([P0] 2.4).
- A morning summary card ("第 9 天：小王外出找到了药").
- No penalty for members who don't play. The shelter just runs on the members who did, so nobody is pushed to recruit or nag.

**Daily hook.** The overnight resolve, which gives "what happened to us" curiosity.

**Monetization.** Weak: a banner and a rewarded "extra scouting" once a day. About 15-30 s per day leaves few slots.

**Evidence.** No equivalent found ([DOOM] B, S3). There is no Western traction evidence for async group survival either ([DOOM] 2.2).

**Effort.** About 6-8 weeks:
- group-scoped state;
- an overnight resolver with timer-trigger idempotency ([P0] 9);
- dead-group and new-member handling.
Only `joinGroup` and `group_members` reuse cleanly.

**Compliance.**
- Do not gate on group size or invites (induced-sharing risk, [DOOM] B).
- Do not name members in negative outcomes, since that comes close to ranking friends. The summary credits good actions only.

**Key risks.** Groups go quiet and the shelter feels dead. Revenue per user is low.

**Cheapest validation.** Later: run it as a **weekly event mode** inside #1 (a group shelter on the same apocalypse) and measure the share of groups with ≥ 3 active members on day 3.

---

## 5. Recommendation

**Build 「同一场末日」 next, right after 点将台 v1 ships.**

Why it beats the alternatives:
1. **It scores highest (4.15)** and passes all three [CON] principles at 4-5. It has a one-sentence loop, 60-150 s runs, and a single comparable number ("活了几天") that a group chat argues about by instinct.
2. **It rides the strongest theme in Chinese mini games** without competing in its saturated format ([DOOM] 1). 点将台 used the same playbook: a known theme in a new format ([SL14] 3).
3. **It is the cheapest serious build.** About 80% of the backend is the 点将台 stack ([SPEC] §5, §11, §14), and progressive delivery fits a one-card-per-day game even better than it fits the draft.
4. **It monetizes better than the daily-puzzle candidates**, because free runs end in natural death moments that support a capped revive and interstitials.
5. **It makes the engine that the BitLife idea needs.** 今日人生 then costs 3-4 weeks.

Why not the others:
- 猜将 is a cheap win for 点将台, not a new product.
- 比一比 is too clonable to be our second flagship.
- 今日人生 alone is weaker on uniqueness, legal surface and IAA.

Conditions:
- The content rules in section 7 go into the spec before writing starts.
- The founder runs the in-app checks in section 8. If a daily swipe survival game already exists on WeChat, re-rank: #1 then drops to Unique 2 (3.75, tied with 比一比), and 今日人生 or 比一比 may move up.

**Proposed sequence:** 点将台 v1 → 同一场末日 (5-6 wks) → 猜将 as a 点将台 mode (2 wks, can run in parallel with a separate developer) → 今日人生 on the engine (3-4 wks) → 群聊避难所 as a weekly event in 同一场末日.

---

## 6. Shared engine: one "daily shared-scenario choice engine" for both

**Yes, 同一场末日 and 今日人生 should share one engine (同签抉择引擎).** Both are:

```
seed + contentPack -> deck order (state-dependent) -> card -> choice -> state delta -> end condition -> score + ending card
```

| Layer | Shared | Per game |
|---|---|---|
| `core/` | Seeded RNG sub-streams, the deck/branching state machine, meter maths, end conditions, deterministic replay, bot simulator and gates | Content pack (cards, meters, endings), score formula, gate thresholds |
| Backend | Seed bank, `genDaily`, `startRun`/`getRound` progressive release, `submitRun` replay, boards, challenges, streaks, history, anomalies, `app_config`, `cleanup` (all from [SPEC] §14) | Collection names and board value field |
| Client | Swipe-card renderer, meter bar, result card, share card, board, privacy and ad wrappers, canvas UI kit | Theme, art, copy |

**Two apps, not one app with two modes.**
- One app with both modes would fail [CON] 3.2 ("a core loop that can be explained in one sentence").
- It would also muddle the share card and store listing, and dilute each daily's group board.

**Cost of two apps.** Each needs its own AppID, 备案, 软著, privacy guide and release pack (Art. 7). That is founder time, which goes in the Handoff.

**Engineering note.**
- Extract the engine into a shared package (for example `packages/choice-engine/`) **after** 点将台 v1 is released. Refactoring 点将台's live `core/` during v1 would break Art. 9.7 and add risk.
- 点将台's per-function copy of `core/` with a drift test can carry over unchanged.

---

## 7. Content and compliance rules carried into any spec from this round

- No 丧尸, 瘟疫, real pandemics, real disasters, real cities or dated real events. No corpses, blood or gore (S7, [DOOM] 4).
- No suicide or self-harm, no cannibalism, no violence against other people as a goal, no gambling or drug rewards, no minor romance ([DOOM] 4, [LIFE] 4).
- Prosocial or neutral endings. Era skins stay with everyday life and never touch policy ([LIFE] 4).
- No runtime generative AI. Offline AI drafting is allowed only with full human review; whether that output needs labels is VERIFY ([LIFE] 4).
- No share-gated rewards. `disableFallbackSharePage:true` ([P0] 7.1). No ranking of named friends on negative outcomes.
- Revives are capped at 1 per run, free mode only, never sold. Ranked dailies have no ad advantage ([SPEC] §5.3).

---

## 8. Founder in-app checks (WeChat search, before the spec)

Search in the WeChat 小游戏 tab, and also in the 小程序 search, for each term. For any hit, note its name, mechanic, whether it has a daily or shared seed, and whether it has group boards.

**For #1 同一场末日:**
1. Play **生存33天** for 10 minutes. Does it have a day-count share card, a daily challenge or a group board? This is the most important check ([DOOM] 1, S1).
2. Search: 同一场末日, 末日 每日挑战, 活了几天, 生存天数, 末日抉择, 末日 文字, 废土 选择, 寒潮 生存.
3. Search for Reigns-style games: 王权, 滑动选择, 左右滑, 国王模拟 (S4).
4. Check where the survival titles stand now on the 小游戏 畅销榜 and 热门榜 (Jan 2026 is the latest data we have, [DOOM] 5).
5. Check name availability: 同一场末日, 同一场寒潮, 末日同签.

**For #4 今日人生:**
6. Search: 人生重开, 人生模拟器, 今日人生, 每日人生, 比特人生, 中国式人生, 我的人生模拟器 (S5, [LIFE] 5).

**For #2 and #3:**
7. Search: 猜将, 猜武将, 三国 猜人物, 每日猜 ([SWEEP] 6.1).
8. Search: 比一比, 哪个更多, 谁更大, 高低 挑战. A hit kills #3.

**For the others:**
9. Search: 猜年份, 老照片 ([SWEEP] 6.1); 默契, 刻度 ([SWEEP] 7); 语义 猜词, 热冷 ([SWEEP] 6.1).

**Official text (CTO or counsel, not in-app):**
10. Check the current 《小游戏审核规范》 wording on horror, disaster and death content, and whether "末日" in a game name is acceptable ([DOOM] 4, 5).

---

## 9. Gap-filling searches run today (2026-10-15)

All are web searches and are weak evidence of absence (mini game stores are not indexed).

| # | Query | Finding |
|---|---|---|
| S1 | 生存33天 小游戏 玩法 末日 | A virus-apocalypse, zombie-wasteland base survival game with a 33-day cycle. Each day you choose to scavenge or stay, and it has 搜打撤 elements and alliances. Sources are download sites only (low reliability): https://www.18183.com/zhxz/8871603.html , https://www.18183.com/yxzt/8871887/ , https://www.18183.com/zhxz/8865440.html |
| S2 | 人生重开模拟器 微信小游戏 2026 每日 同一人生 | No daily or shared-life version found. Only the App Store 模拟人生重开器 (IAP, 13+): https://apps.apple.com/vn/app/id1229331184 |
| S3 | 文字末日生存 小游戏 选择 卡牌 左右滑 活了多少天 | No swipe or day-count text survival game found. Nearest: 最终庇护所 (management plus deck-building), 幸存黎明 (action): https://apps.apple.com/cn/app/id1581542619 , https://apps.apple.com/jp/app/id6467187103 |
| S4 | 类似王权 Reigns 左右滑动 抉择 微信小游戏 国产 | No Chinese Reigns-style mini game found. Results were Reigns itself and Lapse: https://www.ifanr.com/app/953212 , https://alternativeto.net/software/reigns |
| S5 | 人生模拟 小游戏 微信 排行榜 2026 爆款 文字 | A 比特人生 BitLife-style app on the App Store (rating about 4.6); 我的人生模拟器 on WeChat is merge-click, not text; 人生模拟器：中国式人生 rated 2.1 on Xiaomi; 武侠人生模拟器 rated 2.2. https://apps.apple.com/us/app/id6471356908 , https://game.xiaomi.com/game/62377959 , https://game.xiaomi.com/game/62354207 , https://www.233leyuan.com/a/11261803782 |
| S6 | 末日人格测试 你在末日能活几天 测试 刷屏 | No Chinese viral test found. A YouGov poll ("how long would you survive alone") shows the question itself is a common conversation hook: https://datawrapper.dwcdn.net/AirGB/1 |
| S7 | 微信小游戏 审核 恐怖 血腥 丧尸 题材 规范 2025 | No WeChat-specific clause found. Reported game rule: no corpses or blood pools, and changing the blood colour no longer gets around it: https://www.pcgamer.com/uk/china-imposes-new-regulations-on-blood-dead-bodies-and-history-in-games (date unclear) |

---

## 10. Caveats

- The chart data is from Jan 2026, 9-10 months old ([DOOM] header). No Sep or Oct 2026 charts were found.
- There are no WeChat retention, eCPM or K-factor benchmarks. All go thresholds are INFERENCE ([SOC] 2.3).
- Every "not found on WeChat" is web search only. Section 8 is the real check.
- Effort estimates assume 点将台 v1 ships with the stack as specified, and they assume Art. 4 scope (a complete, release-ready product).
- This is not legal advice. Content-review boundaries for disaster themes are unverified.
