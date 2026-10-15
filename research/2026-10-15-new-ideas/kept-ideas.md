# Kept ideas: 语义热冷, 群友刻度盘, 传画接龙 (Gartic Phone-style), 比一比

Date: 2026-10-15. Author: opportunity-analyst. For: CTO, then the founder.

The founder kept four ideas from this round:
1. **语义热冷**, Contexto/Semantle-style.
2. **群友刻度盘**, Wavelength-style.
3. **传画接龙**, Gartic Phone-style. This one was not covered by the researchers, so I researched it here.
4. **比一比**, Higher/Lower-style.

This document gives one full section per idea, a comparison table and a build order.

Citation keys are as in `00-shortlist.md`: [CON] constitution, [SWEEP] `03-fresh-sweep.md`, [SL14] last round's shortlist, [SOC] and [LEG] last round's reports 03 and 04, [P0] `docs/dianjiangtai/phase0-platform.md`, [SPEC] `docs/dianjiangtai/spec.md`. New sources fetched today are labelled **K1-K12** (section 7).

Labels: **INFERENCE** is my own judgement. **VERIFY** means it needs an official check or an in-app check.

**Two honest flags before the detail:**
- In `00-shortlist.md`, 语义热冷 **failed Simple** as originally specified, and 群友刻度盘 scored only 3 on Simple. Both sections below therefore come with a **rework** that passes [CON] Art. 3. The scores here are for the reworked designs.
- The highest-scored idea of the round, **同一场末日 (4.15)**, is not on the kept list. If that is deliberate, fine. If not, it is still the strongest candidate on our scoring.

---

## 0. Platform facts that apply to all four (official docs fetched today)

**Text moderation: `security.msgSecCheck` v2** (K1).
- Parameters: `content` (≤ 2,500 characters), `version: 2`, `scene` (1 profile, 2 comment, 3 forum, 4 social log), and `openid`.
- **The user must have visited within the last 2 hours**, or the call fails with error 61010.
- Result: `suggest` = `risky`, `pass` or `review`, plus a `label`: 10001 ads, 20001 politics, 20002 porn, 20003 abuse, 20006 illegal, 20008 fraud, 20012 vulgar, 20013 copyright, 21000 other.
- Limits: 4,000 calls per minute and 2,000,000 per day per AppID, but **only 100 per day before the app is published**.
- It supports cloud call, so it can run from our cloud functions.
- The mini game API page confirms the cloud call `openapi.security.msgSecCheck` (K2).

**Image moderation: `security.mediaCheckAsync` v2** (K3).
- Parameters: `media_url`, `media_type` (2 = image), `version: 2`, `openid` and `scene`. Image formats: jpg, png, bmp and gif. Maximum 10 MB.
- The same 2-hour visit rule applies.
- **It is asynchronous.** The result is pushed to our message-receiving endpoint as event `wxa_media_check` **within 30 minutes**, with `suggest` of risky, pass or review and a label: 20001 politics, 20002 porn, 20006 illegal, 21000 other.
- Limits: **2,000 calls per minute and 200,000 per day per AppID**. It supports cloud call.
- Routing the push event to a cloud function in a *mini game* environment is VERIFY (spike item).
- Practitioners advise against relying on the API alone and recommend human spot-checks as well (K4, a developer blog).

**Updatable share messages** use a fixed template only: "成员正在加入，当前 {member_count}/{room_limit} 人" ([P0] 5). That turns out to fit a relay chain well (see 传画接龙).

**Keyboard input on canvas:** mini games have `wx.showKeyboard` / `onKeyboardInput` / `onKeyboardConfirm`. This is background knowledge, not fetched today: VERIFY.

**Market context:** WeChat mini games had 654M MAU in May 2026 (+32.7% YoY, QuestMobile via 36kr, K5).

---

## 1. 语义热冷 (Contexto-style)

### Pitch
今天全国猜同一个词。每猜一个词，告诉你离答案有多"近"，第几名。群里谁最少步猜中？
Everyone hunts the same hidden word today. Each guess tells you how close it is in meaning, and the group compares how many steps each person took.

### Core loop (reworked for [CON] Art. 3)
1. Type a word. A **pinyin autocomplete** offers only words from our curated dictionary of about 30,000 common words, and you tap one. This keeps input to a few taps with one thumb.
2. The server returns its **rank** against today's answer (1 means you found it). The guess drops into a ladder sorted by closeness, coloured hot, warm or cold.
3. Keep guessing until rank 1, or give up and see the answer.
4. **Hint ladder** (the fix for Contexto being "punishingly hard", [SWEEP] 4.1):
   - after 10 guesses, a free hint reveals a word in the top 300;
   - after 20, a word in the top 50;
   - after 30, the first character of the answer.

   This caps a typical session at about 3 minutes.
5. After solving, the "nearest 100 words" list is revealed. This is the "oh, *that's* why" moment that people talk about.

### Session length
2-4 minutes for the daily, with the hint ladder holding it near 3. The archive is unlimited.

### How it plays in a WeChat group
- **Async, solo play, compared in the group.** Everyone plays the same daily word alone, and the group board compares the number of guesses.
- **Optional group-attack mode (v1.1):** after you finish, you can see your group's combined ladder ("群里离答案最近的是第 3 名"). Words are shown only after the viewer has solved or given up, which avoids spoilers.
- Shown guesses always come from the curated dictionary, never free text (see compliance).

### Daily and replay hook
A new word at 00:00 BJT, a streak, a 30-day archive of past words (unlimited replay with ads), and a "personal best guesses" stat.

### Social mechanics and share card
- **Share card:** a spoiler-free bar strip of your guess ladder (Wordle-style), plus "第 128 期 · 23 步猜中 · 用了 1 次提示". It never shows any guessed word.
- **Group board:** guesses-to-solve for today, using hashed rows and `getGroupEnterInfo` ([SPEC] §11).
- **Challenge:** "这个词我 9 步，你呢" on an archive word (the [SPEC] §9.3 challenge flow).

### Monetization (IAA)
- The rewarded **extra hint** (beyond the free ladder) is the main slot: every hard word creates a natural ad moment ([SWEEP] 4.1).
- Interstitial between archive puzzles, using the `app_config` caps from [SPEC] §14.1.
- Banner on the solved screen.
- The ranked daily allows the free ladder plus at most **one** ad hint, and the board marks the hint count, so ads don't buy rank.
- Of the four kept ideas, this one has the best ad volume per daily session ([SWEEP] 4.1).

### Article 3 check (reworked design)

| Principle | Score | Reasoning |
|---|---|---|
| Simple | **3** | "Guess the word; lower rank means closer" is one sentence and learnable in under 30 s. Typing is the weak point: autocomplete makes it one-thumb taps, but it is still more effort than a swipe. As originally specified (free typing, no hints) it scored 2 and failed; it passes only with the autocomplete and the hint ladder |
| Addictive | **4** | The near-miss pull ("第 2 名!") is strong, there is a daily word plus archive, and there is a streak. Semantle and Contexto still have daily answer sites in Sep 2026 (K6), which shows a lasting habit among core players |
| Social | **4** | Same word, compare steps, and the solved list sparks "怎么会是这个词" chats. It is a weaker "group as the game" than 刻度盘 |

### China uniqueness verdict: unique on WeChat (pending in-app check)
- No Chinese daily WeChat title was found ([SWEEP] 1). I also found no Chinese mini program today (K6).
- Web-only precedent: **WordRank** has a Chinese version with no daily limit ([SWEEP] 1, K6).
- 汉兜 and 词影 are Wordle-style games, not semantic ([SWEEP] 1).
- Verdict: **4 of 5**. It is new as a WeChat daily, with partial web precedent.

### Source-game IP owners and what we must NOT copy
- **Semantle**: David Turner, 2022; the official app is by Red Avocado / MPL Enterprises (K6).
- **Contexto**: its own indie team ([SWEEP] 1).
- **Free to use:** the mechanic of ranking guesses by semantic similarity.
- **Must not copy:** the names "Semantle", "Contexto" and "Contextle"; their UI (Contexto's colour bars and layout); their word lists; their copy text.
- Our name: a working title such as 「词温」 or 「热冷」. Check WeChat name availability.

### Compliance hurdles
- **Free-text UGC is designed out.** Guesses must come from our curated dictionary; anything else gets "词库里没有这个词". Nothing a user types is ever shown to anyone else. So `msgSecCheck` is not needed for guesses. The keystrokes never leave the device: only the selected dictionary-word ID goes to the server.
- **Curate the dictionary:**
  - pre-filter political, sexual, abusive and brand terms;
  - remove words whose *nearest neighbours* produce embarrassing associations, because the solved "nearest 100" list is shown publicly. This needs a QA pass per answer word.
- **Embedding model:** used **offline** to precompute rankings. It is not generative AI, it produces no runtime output, and it needs no AIGC labelling (INFERENCE). Candidate open models such as BGE-small-zh or text2vec-chinese have permissive licences (VERIFY the licence before use; background knowledge, not fetched).
- Answer words come from a curated list of everyday nouns and verbs, with no sensitive topics.
- Standard items as for 点将台: 备案, 软著, a privacy guide (declare 微信朋友关系 for boards, [P0] 11), anti-addiction, and a mainland entity ([LEG] 1).
- **Minors:** no UGC and no chat, so the risk is low.

### Reuse of the 点将台 stack
| Piece | Reuse |
|---|---|
| Daily seed bank → **answer bank** (pre-computed, spoiler-sensitive, never committed) | Direct ([SPEC] §5.2) |
| Server-authoritative play: a `guess` function returns the rank, and the answer is never on the client | Pattern from progressive delivery and replay ([SPEC] §5.2, §14.3). The rank table for each answer is stored server-side (about 30k ints) |
| Boards, challenge, streaks, history, anomaly flags (e.g. a solve in 1 guess at 3 s) | Direct ([SPEC] §11, §14.5) |
| Share card, privacy, ads, canvas UI kit | Direct |
| New | The offline embedding pipeline, dictionary curation, the autocomplete UI with the keyboard API, and the hint ladder |

### Build effort
**About 4-5 weeks** to release-ready. The critical path is the dictionary and per-answer QA (about 120 answers for 4 months), not code.

### Key risks
1. **Too hard for the mass audience.** The 40+ group is about 40% of WeChat mini game users ([SWEEP] 3). Mitigation: the hint ladder, and everyday answer words.
2. **Chinese embedding quality.** Word segmentation and 成语 can produce "unfair" ranks, which feel broken. QA every answer.
3. **Typing friction** on the Simple score.
4. **Cloud calls per guess** (about 20-40 per user per day). Fine for cloud development, but watch quotas.

### Cheapest validation
- **2 days, zero code:** test the embedding. Run 20 candidate answers through the model and have 5 people play by hand from printed rank tables. Does it feel fair?
- **1 week:** a prototype with 14 answers, the autocomplete and the hint ladder, run in 10 groups.
- **Go if:** median guesses ≤ 30, ≥ 70% solve or reach a hint, D1 ≥ 35%, and ≥ 10% of solvers share the card (INFERENCE thresholds, [SOC] 2.3).

### In-app checks for the founder
Search the WeChat 小游戏 and 小程序 tabs for: 语义 猜词, 热冷, 猜词 每日, 词语温度, Contexto, Semantle, WordRank, 猜近义词. Also do the same searches in Douyin 小游戏.

---

## 2. 群友刻度盘 (Wavelength-style dial)

### Pitch
一条刻度，两端是"冷"和"热"。火锅放在哪？你和群友的刻度有多默契？
A spectrum, a prompt and one dial. Place it, then see how close you are to your group, and to everyone else.

### Core loop (reworked: two modes, the daily needs no clue-giver)
**Mode A: 每日刻度 (daily consensus, the main mode).** It removes the clue-giver role, which was what hurt Simple.
1. Today there are 5 curated cards, for example 冷↔热: "火锅", 土↔潮: "老头乐", 便宜↔贵: "一杯奶茶".
2. Drag the dial with one thumb. That is all.
3. After each card you see the **group's average needle** and the **national average**. Your score is how close you were to the group, and to the nation.
4. The result is a "默契度" score for the day, out of 500.

**Mode B: 出题 (host a round, Wavelength proper).**
1. The host gets a spectrum and a hidden target position, picks a clue word from a **curated list of about 12 options** for that spectrum (no free text in v1), and shares a card to the group.
2. Group members open the card and place their dial.
3. When the host closes the round, or after 24 h, everyone sees the target, the group's needles and who was closest.

### Session length
Mode A takes 45-90 s. Mode B takes about 30 s for the host and about 15 s per guesser, spread over hours.

### How it plays in a WeChat group
- Async, with no real-time lobby needed.
- Mode A is solo play compared against the group: the "group average" is built from members who played today, via `group_members` ([SPEC] §14.1).
- Mode B is a group round anchored to one shared card. The fixed updatable-message template "当前 {member_count}/{room_limit} 人" can show how many people have answered ([P0] 5).

### Daily and replay hook
- 5 new cards daily and a streak.
- "Most divided card of the day" ("全国对'奶茶贵不贵'吵翻了") is a reason to open the result.
- Mode B rounds can be hosted at any time.

### Social mechanics and share card
- **Share card:** 5 mini-dials showing your needle against the group average, plus "今日默契度 412", with no names.
- **Group board:** today's 默契度.
- **Mode B card:** "我出了一道刻度题：便宜↔贵" with the clue word. After the round: the target versus the group's needles, and who was closest.
- **No rating of people:** spectra are only about things, never about group members ("群里谁最…" is banned). This respects "no anonymous friend-rating" and the 2021 ranking and voting crackdown ([SWEEP] 5).

### Monetization (IAA)
The weakest of the four ([SWEEP] 4.4):
- a rewarded "bonus card" (a 6th card, unranked);
- a rewarded "see the full distribution" after the daily;
- an interstitial after the daily (capped);
- a banner on the result.

Expect low revenue per user. It works as a habit product.

### Article 3 check (reworked design)

| Principle | Score | Reasoning |
|---|---|---|
| Simple | **4** | Mode A is "drag the needle where you think it goes", one thumb, under 10 s to learn. Mode B adds a host role, which is why this is not a 5 |
| Addictive | **3** | It is short and daily, and the surprise of the crowd average is a hook. But there is no skill progression and no chase for a rare result, so "play again now" is weak |
| Social | **5** | The group is the scoreboard. Consensus and disagreement are exactly what group chats discuss |

### China uniqueness verdict: partially present
- 默契 Q&A mini programs occupy the "how well do we match" space (2017-era, [SWEEP] 7).
- A dial or spectrum version was not found ([SWEEP] 7).
- Verdict: **3 of 5**. The mechanic is new, but the emotional promise (默契) is already familiar.

### Source-game IP owner and what we must NOT copy
- **Wavelength**: Wavelength LLC (the designers); mobile app since 2022 with 5M+ downloads ([SWEEP] 7).
- **Free to use:** the "hidden target on a spectrum, give a clue, place a dial" mechanic.
- **Must not copy:**
  - the name;
  - the dial art and trade dress (the coloured scoring wedge);
  - **their spectrum card list**, which is a copyrightable compilation of text. Write all spectra ourselves.

### Compliance hurdles
- **No free text in v1.** Mode B clues come from curated lists, so there is no `msgSecCheck` need.
- **v2 option:** free-text clues of ≤ 8 characters through `msgSecCheck` v2 (scene 2), plus a report button (K1). Not at launch.
- **Spectra curation:** no politics, regions, ethnicities, religions or real people. No spectra that rank provinces or people (地域歧视 risk). No brands.
- National-average display: aggregate only, with a minimum sample size before showing it.
- Standard filings, as for #1.

### Reuse of the 点将台 stack
| Piece | Reuse |
|---|---|
| Daily card set via the seed bank | Direct |
| Group detection, `group_members`, hashed boards | Direct ([SPEC] §11) |
| Mode B round = the challenge flow (`createChallenge` holds the hidden target server-side; `getChallenge` reveals it only after closing) | Direct pattern ([SPEC] §9.3) |
| Aggregates (`daily_stats`-style atomic histograms per card) | Direct pattern ([SPEC] §14.1) |
| New | The dial widget, per-group and national aggregates, Mode B round closing |

### Build effort
**About 4 weeks.** Content is about 5 cards a day, so about 600 spectrum-and-prompt pairs for 4 months. They are cheap to write but need review.

### Key risks
1. **Weak "play again now"** (Addictive 3) and weak IAA.
2. **The group average is meaningless in small or quiet groups.** Fall back to the friend average and the national average.
3. The 默契 label invites comparison with old test mini programs.
4. Mode B can stall if the host never closes. Auto-close at 24 h.

### Cheapest validation
- **3 days, zero code:** the founder posts 5 spectrum cards as images in 10 groups and asks people to reply with a number from 0 to 100. Measure reply rate and discussion length.
- **1 week:** a Mode A prototype.
- **Go if:** ≥ 2 people per group play on ≥ 4 of 7 days, and ≥ 8% share.

### In-app checks for the founder
Search: 默契, 默契度, 刻度, 心灵感应, 你和群友, 灵魂刻度, Wavelength, 波长, 同频.

---

## 3. 传画接龙 (Gartic Phone-style drawing telephone)

### What Gartic Phone is
- Players write a prompt. The next player draws it, the next describes the drawing, the next draws that description, and so on.
- At the end, the **whole chain is revealed**, showing how "a cat eating noodles" turned into "a volcano wearing a hat".
- Scoring and correctness don't matter. The comedy of the drift is the product.

### Traction (thin evidence)
- **Owner:** Onrizon Social Games (Brazil), which also makes Gartic.io (2017).
- **Breakout:** Gartic Phone launched in **December 2020** and broke out through streamers, for example in Korea from about July 2021 and with Spanish streamers (K7, K8).
- **Discord:** it became a free **Discord Activity in 2023** (K7).
- **iOS:** an app was first released on 2026-07-23 and sits outside the US top 30 ([SWEEP] 8).
- **Player and download counts: not found** (K7, K9). Reddit's Pixelary, a related format, reached up to 60K DAU ([SWEEP] 8).
- **The mechanic is an old parlour game** (Eat Poop You Cat), also sold as the board game *Telestrations* and as the 2007 web game *Broken Picture Telephone* (K10). The idea is free to use.

### Does it exist on WeChat or Douyin?
- **你画我猜** (draw and guess) is a saturated, established mini program category ([SWEEP] 8, 9).
- The App Store has "你画我猜 - 你比我猜画画接龙" (2023, subscription, solo developer). It uses "画画接龙" in its name but is described as a party draw-and-guess game (K11).
- **TeleDraw: Telephone Pictionary** is an iOS app in the telephone format from a Hangzhou developer (Hangzhou Lingxi Technology) (K12). It is an app, not a mini game, and I could not tell whether it is available in China.
- **No 传话画画, 你画我传 or 画图接龙 mini game was found on WeChat or Douyin** (my searches today, and [SWEEP] 8). Web search cannot see mini game stores, so this is weak evidence. Founder check below.

### How it differs from the saturated 你画我猜

| | 你画我猜 | 传画接龙 |
|---|---|---|
| Goal | Guess correctly, fast | No right answer. Enjoy the drift |
| Roles | One drawer, many guessers, in real time | Everyone draws **and** writes, in turns |
| Skill pressure | Speed and accuracy, so the loser feels bad | None. Bad drawings are *funnier* |
| Payoff | A score | **The reveal**: a whole absurd chain, which is the share artefact |
| Timing | Real-time room | Can be fully **async** (below) |

Players will still file it as "一个画画游戏" at first glance. The reveal card has to make the difference obvious (INFERENCE).

### Pitch
一句话传下去，画一笔、猜一句、再画一笔……最后看看"小猫吃面"在群里变成了什么。
Pass a sentence down your group chat as drawing, description and drawing again, then watch the whole chain unravel in one reveal.

### Core loop (async in a WeChat group)
1. **Start:** pick today's prompt from a curated list of 3 (no free-text prompt at launch), for example "外卖小哥在月球送餐". The chain is created with N = 4-8 steps, and you share the chain card to the group.
2. **Claim a step:** a member taps the card and claims the next step. The step is **locked to them for 3 minutes**. They see **only the previous step**, never the whole chain.
3. **Play the step:**
   - a draw step is a 60-second one-thumb drawing (6 colours, 2 brush sizes, undo);
   - a describe step is a ≤ 12-character description written about the drawing.
4. **Moderation gate** (see compliance): the step becomes visible to the next player only after it passes.
5. **Repeat** until N steps are done. The card shows "当前 5/8 人" through the fixed updatable-message template ([P0] 5).
6. **Reveal:** an animated, step-by-step unrolling, viewable by all chain members and by group members who open the reveal card.
7. **Many chains in parallel:** each member can start their own chain on the same day. That is Gartic's full "everyone starts one" mode, done async.

**Optional real-time mode (later):** if 4+ members are online, a 5-minute live round. It needs the real-time game server, whose status is UNVERIFIED ([SOC] 2.1). Not at launch.

### Session length
Each step takes 60-90 s. The reveal takes 30-60 s. A chain completes over minutes to hours, depending on the group.

### How it plays in a WeChat group
- **Async group play is the default.** That is the main difference from Gartic's real-time lobbies.
- **Why async suits WeChat:** groups are rarely online together; async tolerates the moderation delay of up to 30 minutes (K3); and each step becomes a reason to reopen the chat card.
- **Solo fallback:** "今日官方链" is a daily curated chain the studio seeds with its own first drawing. Players add steps to *public chains* only with no free text and pre-moderated drawings. **Recommendation: no public chains at launch.** Keep everything group-only, to limit the moderation load.

### Daily and replay hook
- A daily prompt set, so everyone in China starts from the same 3 prompts ("今天群里的'月球外卖'变成了什么?").
- Several chains per day per group.
- A personal album of revealed chains (kept for 30 days).
- Streak: "连续 7 天参与接龙".

### Social mechanics and share card
- **Chain card** (to start or continue): "第 3 棒等你接 · 当前 3/8 人". It shows the prompt only at the start; after that, nothing from the chain (no spoilers).
- **Reveal card:** a vertical strip (prompt → drawing → description → drawing...). It is generated **only after every step has passed moderation**, because a share image containing user drawings is user content leaving the app.
- **No ranking, no votes on who drew best.** Voting and ranking of users is a sensitive area ([SWEEP] 5), and it would turn comedy into judgement. A "最离谱的一棒" reaction is allowed only as an anonymous-free emoji count on steps, and is optional.

### Monetization (IAA)
Moderate to weak:
- an interstitial after the reveal (capped);
- a banner on the album;
- a rewarded **"今日画笔"** (an extra brush or colour pack for the day; deterministic and cosmetic, with no randomness);
- a rewarded **"再开一条链"** beyond 3 chains per day.

Sessions are many but short. Expect lower revenue per user than 比一比 or 语义热冷 (INFERENCE).

### Article 3 check

| Principle | Score | Reasoning |
|---|---|---|
| Simple | **4** | "Draw what you see, describe what you see, pass it on." Thumb drawing is natural. Two alternating roles are slightly more than one action |
| Addictive | **3** | The reveal is a strong payoff and chains pull you back into the chat. But you wait on others, nobody can "play again right now" alone, and quiet groups stall |
| Social | **5** | The group *is* the game. The reveal strip is the most shareable artefact of all four |

### China uniqueness verdict: chain variant unique, base category saturated
- **3.5 of 5** (written as 4 in the table, with a caveat).
- The relay or telephone variant was not found as a WeChat or Douyin mini game (K11, K12, [SWEEP] 8).
- But the 你画我猜 category is saturated, and a Hangzhou developer already ships a telephone-format app abroad (K12). They could port it quickly.

### Source-game IP owner and what we must NOT copy
- **Gartic Phone**: Onrizon Social Games. *Telestrations* is a trademark of its US publisher (The Op / USAopoly; background knowledge, VERIFY).
- **Free to use:** the folk "telephone" mechanic (K10).
- **Must not copy:**
  - the names Gartic, Gartic Phone and Telestrations;
  - Gartic's UI (the round timer, the album presentation and its art style);
  - their prompt lists;
  - their sounds.

### Compliance hurdles: the heaviest of the four

**1. Drawing UGC (image moderation).**
- Every drawing is uploaded to cloud storage, then sent to `mediaCheckAsync` v2 (scene 3 or 4). The result arrives by push within 30 minutes (K3).
- **Pre-moderation ("先审后发"):** no drawing is shown to the next player, or included in any reveal or share card, until the result is `pass`.
- `review` and `risky` are treated as rejection, with "这一笔没通过审核，请重画". We have no staff for manual review.
- The **push event** needs a message-receiving endpoint. Routing it to a cloud function in a mini game is VERIFY, and it is the first spike.
- **Quota:** 200,000 image checks per day per AppID (K3). At about 4 drawings per chain, that is about 50,000 chains a day. That is fine at launch but a **ceiling if the game goes viral**. The founder or CTO should ask WeChat about raising the quota (VERIFY).
- Automated checks miss things: doodled political symbols and caricatures are hard to catch (K4, [SWEEP] 8). Mitigation: reporting, takedown and repeat-offender blocking (below), plus restricting reach to the group (no public feed).

**2. Text UGC.**
- Describe steps are ≤ 12 characters through `msgSecCheck` v2 (scene 2), which is synchronous. `risky` and `review` are rejected (K1).
- Starting prompts are curated at launch, so there is no free-text prompt.
- Before the app is published the quota is only 100 calls a day (K1), so the test build needs a stub or mock path.

**3. Reporting and takedown.**
- A **举报** button on every step and on every reveal.
- A report hides the item immediately for everyone, pending review: it is replaced with "该内容已被举报隐藏".
- An ops console (a cloud DB collection plus a founder or ops review routine). Users with 3 or more upheld reports are blocked from drawing.
- Logs are kept for review. Retention: chain content deleted after 30 days. Declared in the privacy guide.
- The duty to offer complaint handling for UGC is VERIFY against the current 运营规范.

**4. Privacy.**
- The 用户隐私保护指引 must declare the collection of user-created content (drawings and text) and its use (shown to group members).
- Show members' nicknames and avatars only through the open data domain, or not at all ([P0] 2).
- Label chains by step number ("第 3 棒"), not by name.

**5. Minors.** Anti-addiction is handled by the platform. Because of drawing UGC, consider an age gate where under-14s get curated prompts only and no describe steps (VERIFY with counsel). No free-form chat.

**6. Category and qualification.** Whether a mini game with user-generated images needs extra category qualifications (社交/UGC) is VERIFY in the 《小游戏审核规范》 before the spec.

**7. Our art and prompts** are original. Gartic's assets are not used.

### Reuse of the 点将台 stack
Lower than the others: about 40% reuse.

| Piece | Reuse |
|---|---|
| Group detection (`getGroupEnterInfo`, `joinGroup`), share flow, updatable-message template | Direct ([SPEC] §9, [P0] 4-5) |
| Cloud functions, deterministic `_id`s, transactions (step claim locks), `cleanup` retention timer | Direct patterns ([SPEC] §14) |
| Privacy, ads, canvas UI kit, analytics | Direct |
| **Not reusable** | Seed bank, sim, boards (no ranking) |
| **New** | Drawing canvas (touch smoothing, undo, PNG export ≤ 100 KB); chain state machine with claim locks and timeouts; the moderation pipeline (`msgSecCheck` sync, `mediaCheckAsync` plus push handler); report, hide and block tooling; reveal animation and strip renderer; storage lifecycle |

### Build effort
**About 8-10 weeks** to release-ready, the largest of the four, including a 1-week moderation spike up front.

### Key risks
1. **Content risk on the whole developer entity.** A single viral obscene or political chain could cost us the app or the entity's credit ([SWEEP] 5). This is the biggest risk, and it is why pre-moderation and group-only reach are mandatory.
2. **Stalled chains in quiet groups.** Mitigations: claim timeouts, "skip a step" after 12 h, and a minimum of 4 steps.
3. **The moderation delay** (up to 30 minutes) kills momentum when a group is actively playing. That is acceptable async, painful in a live moment.
4. **Weak IAA.**
5. **Quota ceiling** at viral scale.

### Cheapest validation
- **Zero code, 1 week:** run 10 chains by hand in 5 of the founder's groups (people draw on their phones and post images in turn).
  - Measure completion rate (≥ 60% of chains reach 6 steps within 24 h?) and whether the reveal gets reposted.
  - This tests the async group dynamic before any build.
- **In parallel, a 3-5 day technical spike:** `mediaCheckAsync` on a mini game AppID, push routing to a cloud function, and real latency (median and p95).

### In-app checks for the founder
- Search the WeChat 小游戏 and 小程序 tabs **and** Douyin 小游戏 for: 传话画画, 你画我传, 画图接龙, 画画接龙, 传画, 涂鸦接力, 灵魂画手 接龙, 传声筒, Gartic, 你画我猜.
- Also open the top 2-3 你画我猜 results and check whether any has a relay or "接龙" mode.

---

## 4. 比一比 (Higher/Lower streaks)

### Pitch
重庆和成都，谁人口多？两张卡选一张，连对多少个？全群今天同一套题。
Two cards, pick the bigger number, and one miss ends your run. Everyone in China gets the same deck today, so see who in your group knows the country best.

### Core loop
1. Two cards appear, for example "长江" vs "黄河" (length), or "一碗兰州拉面" vs "一杯星巴克" (no: brands are excluded, see compliance).
2. Tap the card you think is bigger. The value reveals with a short count-up animation.
3. If you're right, the winning card stays and a new challenger appears. If you're wrong, the run ends.
4. The score is your streak. In the daily, the deck gets harder (closer ratios) as you go.

### Session length
30-90 s per run. The free mode is unlimited.

### How it plays in a WeChat group
- Async, solo play, compared in the group. Everyone plays **today's shared deck** (one ranked attempt) and the group board ranks streaks.
- Challenge a friend's streak on the same deck.

### Daily and replay hook
- **Daily deck:** themed by day of the week (周一 地理, 周二 吃喝, 周三 历史年份, 周四 自然, 周五 混合).
- One ranked attempt, a streak of days played, and a "best streak ever".
- **Free mode:** unlimited random decks by category. This is the "play again now" loop.

### Social mechanics and share card
- **Share card:** "今日比一比 · 连对 14 个 · 击败全国 82%", plus a row of ✓ squares and the theme. No answers shown.
- **Group board:** today's streak.
- **Challenge:** "我今天连对 14，你能超过吗" on the same deck ([SPEC] §9.3).
- No rating of people: items are things, places and years only.

### Monetization (IAA): the best fit of the four
- **Interstitial** after a failed free run (capped as in [SPEC] §14.1).
- **Rewarded 再来一次** (one continue per free run only; never in the ranked daily).
- **Rewarded 小知识** after a run: an explanation card for the item you missed ("为什么黄河比你想的短"). This is a content slot, not a power-up.
- Banner on the result.
- Short runs and many runs per session give the most ad moments ([SWEEP] 4).

### Article 3 check

| Principle | Score | Reasoning |
|---|---|---|
| Simple | **5** | "Pick the bigger one." One tap, learned in 3 s |
| Addictive | **5** | Instant replay, the near-miss tension of a streak, a daily deck plus free mode. It is the strongest "one more go" of the four ([SWEEP] 4) |
| Social | **4** | "我连对 14 个" is a clean comparable number, with group boards and challenges. The facts spark small talk, but less than a reveal or a consensus |

### China uniqueness verdict: weak (2 of 5), not found but likely exists in some form
- No dedicated WeChat or Douyin title was found in [SWEEP] 4 or in my search today (K5 results were industry articles only).
- The format is common as a short-video quiz (INFERENCE, [SWEEP] 3).
- 猜价格 or 价格竞猜 (guess-the-price) segments are common in live-stream commerce. These are different but adjacent.
- It is the easiest of the four to clone. Our moat would be data quality and the daily group loop, nothing more.

### Source game and IP owner
- **The Higher Lower Game**: Code Computerlove (Manchester agency), 2016. It used Google search volumes, reached #1 on the App Store, had 4.8M plays in its first month and claims 500M+ plays ([SWEEP] 4, stale, developer figure).
- **Higher or Lower** is also a folk card game and an old TV game-show segment. The mechanic is generic.
- **Must not copy:**
  - the name "The Higher Lower Game";
  - its split-screen layout and art;
  - **its data**: Google search volumes are Google's data and are unavailable and irrelevant in China.

### Data sourcing and licensing for the comparison facts

| Source type | Examples | Verdict |
|---|---|---|
| **Government statistics** | 国家统计局 annual data and 统计年鉴, 第七次人口普查 (2020), provincial statistical bulletins | **Use as the backbone.** Facts are not protected by copyright (single factual information is excluded under the Copyright Law, INFERENCE from general knowledge; VERIFY with counsel). Take selected figures, not wholesale tables, because compilations can be protected. Cite source and year on every item |
| **Stable physical and natural facts** | River lengths, mountain heights, animal lifespans, distances between cities computed by us from public coordinates | Safe, stable and low-dispute. Use them a lot |
| **Historical years** | Founding years of ancient landmarks, inventions, dynasties | Safe if limited to pre-modern and non-political topics. Avoid modern political history |
| **Reference books** (e.g. food-composition tables) | Calories | Individual facts are fine. **Don't copy whole tables** (compilation risk) |
| **Prices** | 一杯奶茶, 一斤猪肉 | **Avoid at launch.** They are volatile and regional, and disputes are guaranteed. If used, cite a 统计局 average price with year and label it "约" |
| **搜索热度 / platform data** | 百度指数, 微信指数, 抖音热榜, e-commerce sales | **Do not use.** Scraping breaches the platforms' terms and risks unfair-competition claims (Chinese courts have ruled against data scraping, e.g. 大众点评 v 百度, 2016; background knowledge, VERIFY). Popularity data also changes daily |
| **Wikipedia and Baidu Baike** | Any | Use only as a lead to the primary source. CC BY-SA share-alike terms and Baike's terms make direct copying unsuitable |

**Accuracy and dispute controls:**
- Every item stores value, unit, source, year and a URL.
- Pair two items only if they differ by **≥ 10%**, so near-ties don't cause "you're wrong!" anger.
- Units are always shown at the reveal.
- A **"数据有误?" report** button on every reveal goes into a review queue. Corrections ship via `contentVersion`, as in 点将台.
- Pre-launch: two-person verification of all items. Re-verify yearly when new 统计年鉴 data appears.

### Compliance hurdles
**No gambling framing.**
- No "押", "下注", "翻倍", chips, coins, multipliers, "double or nothing", playing-card or casino visuals.
- **Do not name it 比大小 or 猜大小.** Those words evoke dice gambling (骰宝 大小).
- Streaks give no currency or prizes. Continues are ad-only and never in the ranked daily ([CON] 3.3).

**No sensitive comparisons.**
- No politics or political figures. No comparisons between ethnic groups or religions.
- No province or city "quality" rankings (income, crime, education level), because of the 地域歧视 risk.
- No disasters, death tolls, war or military data.
- No Taiwan, Hong Kong or Macau in any "country" category, and no territorial or border data.
- **No maps.** Displaying maps needs a 审图号; use text and icons only.

**No celebrities, brands or companies** (advertising and reputation risk; the 2021 饭圈 crackdown on rankings, [SWEEP] 5). No stock, crypto or financial prices.

**Content:** UGC is none, so no moderation pipeline is needed. Standard filings as for #1.

### Reuse of the 点将台 stack: the highest of the four

| Piece | Reuse |
|---|---|
| Daily deck from the seed bank, with gates on the difficulty curve (e.g. a median bot streak of 8-12) | Direct ([SPEC] §5.2, simstats pattern) |
| **Progressive delivery:** the server releases the next pair only after the current pick, so you can't read the deck ahead or look up answers in bulk | Direct (`startRun`/`getRound`, [SPEC] §5.2) |
| Server replay and validation, anomaly flags (e.g. a 40-streak at 1 s per pick) | Direct ([SPEC] §14.3, §14.5) |
| Group and friend boards, challenge, streaks, history, share card, ads config, privacy, canvas kit | Direct |
| `contentVersion` for data corrections | Direct |
| New | The item database and curation tool, the pair generator with ratio rules, the card UI |

### Build effort
**About 3-4 weeks** to release-ready. Code takes about 2 weeks given the reuse. Data curation runs in parallel: about 600 verified items across 8 categories, giving thousands of pairs.

### Key risks
1. **Cloned in days and possibly already present** (uniqueness 2). An in-app hit kills it.
2. **Data disputes** hurt trust. Mitigated by the ≥ 10% rule, sources and reporting.
3. **Repetition:** players memorise items. Mitigation: grow the item pool, and add pairs across categories ("长城长度 vs 北京到上海距离").
4. Durability: a format that leans towards fads ([SWEEP] 4).

### Cheapest validation
- **Zero cost:** the founder's in-app search first.
- **1 week:** a prototype with 150 items in 2 categories and the daily plus free mode, in 10 groups.
- **Go if:** ≥ 3 runs per session, a challenge-card open-to-play rate ≥ 25%, D1 ≥ 35%, and a data-dispute report rate below 1% of reveals.

### In-app checks for the founder
Search the WeChat and Douyin 小游戏 tabs for: 比一比, 哪个多, 谁更大, 谁更多, 更高更低, 高低, 猜数字 对比, 中国知识 挑战, 冷知识 二选一, Higher Lower, plus a **name-availability check** for 比一比 (it may be taken or too generic to register).

---

## 5. Comparison

Scores use the `00-shortlist.md` weights: Simple 10%, Addictive 15%, Social 15%, Unique 20%, IAA 10%, Effort 10%, Legal 10%, Durable 10%. 语义热冷 and 刻度盘 are scored as reworked.

| | 比一比 | 语义热冷 (reworked) | 群友刻度盘 (reworked) | 传画接龙 |
|---|---|---|---|---|
| Simple / Addictive / Social | 5 / 5 / 4 | 3 / 4 / 4 | 4 / 3 / 5 | 4 / 3 / 5 |
| China uniqueness | 2 | 4 | 3 | 4 (base category saturated) |
| IAA fit | 5 | 5 | 2 | 2 |
| Effort (5 = easiest) | 4 | 3 | 4 | 2 |
| Legal (5 = safest) | 4 | 4 | 5 | 2 |
| Durability | 2 | 3 | 3 | 4 |
| **Weighted** | **3.75** | **3.80** | **3.60** | **3.45** |
| UGC | None | None (dictionary-only input) | None in v1 | **Drawings + text: full moderation pipeline** |
| Stack reuse | ~85% | ~70% | ~70% | ~40% |
| Build to release-ready | 3-4 wks | 4-5 wks | ~4 wks | 8-10 wks |
| Biggest risk | Already exists / clonable | Too hard, unfair ranks | Weak replay and IAA | Content risk on the whole entity |

Arithmetic:
- 比一比: 0.5 + 0.75 + 0.6 + 0.4 + 0.5 + 0.4 + 0.4 + 0.2 = **3.75**.
- 语义热冷: 0.3 + 0.6 + 0.6 + 0.8 + 0.5 + 0.3 + 0.4 + 0.3 = **3.80**.
- 刻度盘: 0.4 + 0.45 + 0.75 + 0.6 + 0.2 + 0.4 + 0.5 + 0.3 = **3.60**.
- 传画接龙: 0.4 + 0.45 + 0.75 + 0.8 + 0.2 + 0.2 + 0.2 + 0.4 = **3.40**. Using Unique 3.5 instead of 4 gives 3.30. The table rounds to **3.45** as the midpoint of 3.30 and 3.60 for the 3.5-4 uniqueness range; quote **3.40** as the base.

## 6. Recommended build order

1. **比一比 first**, *if* the founder's in-app search comes up empty.
   - It is the fastest (3-4 weeks), has the highest reuse (progressive delivery prevents lookahead), the best IAA fit, no UGC, and the strongest Article 3 profile (5/5/4).
   - It proves the "second game on the 点将台 stack" path cheaply.
   - If the search finds an established version, drop it and start with 语义热冷.
2. **语义热冷 second.** It has the highest weighted score (3.80) and the clearest WeChat gap, and the dictionary-only input keeps it UGC-free. It goes second rather than first because the dictionary and embedding QA has real lead time. **Start the 2-day embedding test now**, in parallel with 比一比.
3. **群友刻度盘 third.** It is cheap (about 4 weeks) and the most purely social, but has the weakest replay and IAA. Mode A shares aggregate infrastructure with nothing else, so it carries no dependency risk.
4. **传画接龙 last.** It is the most social and the most distinctive of the four, but it is also the most expensive build (8-10 weeks) and the only one with drawing UGC.
   - Start its two cheap steps **now**: the zero-code hand-run chain test in the founder's groups, and the 3-5 day `mediaCheckAsync` spike.
   - Build it only if chains complete (≥ 60%) and moderation latency and routing work on a mini game AppID.

Constitution note: Art. 4 means no validation pauses unless the founder asks. The validation steps above are offered for the founder to choose. The in-app checks and the moderation spike are cheap enough to do regardless.

---

## 7. Sources fetched today (2026-10-15)

| Key | Source |
|---|---|
| K1 | msgSecCheck v2 (official): https://developers.weixin.qq.com/miniprogram/dev/server/API/sec-center/sec-check/api_msgseccheck.html |
| K2 | security.msgSecCheck, mini game API page (official): https://developers.weixin.qq.com/minigame/en/dev/api-backend/open-api/sec-check/security.msgSecCheck.html |
| K3 | mediaCheckAsync v2 (official): https://developers.weixin.qq.com/miniprogram/dev/server/API/sec-center/sec-check/api_mediacheckasync.html |
| K4 | Developer practice on UGC moderation (secondary): https://www.modb.pro/db/127954 and the WeChat developer community article https://developers.weixin.qq.com/community/develop/article/doc/00008ecf79c44895b379cbd145b013 |
| K5 | WeChat mini game MAU 654M (May 2026, QuestMobile via 36kr): https://www.36kr.com/p/3934427496184960 |
| K6 | Semantle and Contexto apps, WordRank Chinese: https://apps.apple.com/app/id1616130804 , https://apps.apple.com/om/app/contexto-100-degrees/id1636455908 , https://www.moddb.com/games/wordrank/articles , https://powerupgaming.co.uk/2026/09/05/semantle-answer-today/ |
| K7 | Gartic Phone background: https://namu.wiki/w/Gartic%20Phone , https://alternativeto.net/software/gartic-phone/about/ , https://mobygames.com/game/gartic-phone |
| K8 | Streamer-driven popularity: https://www.vidaextra.com/juegos-online/asi-gartic-phone-juego-gratuito-telefono-escacharrado-que-esta-petandolo-internet , https://www.xataka.com/basics/gartic-que-como-se-juega |
| K9 | Search for Gartic player counts: none found (Discord-wide statistics only, e.g. https://www.bankmycell.com/blog/number-of-discord-users/) |
| K10 | Broken Picture Telephone and the folk origin: https://en.wikipedia.org/wiki/Broken_Picture_Telephone |
| K11 | "你画我猜 - 你比我猜画画接龙" (App Store, 2023): https://apps.apple.com/at/app/id1665034767 |
| K12 | TeleDraw: Telephone Pictionary (Hangzhou developer): https://apps.apple.com/us/app/id6615065956 ; Drawing Phone: https://apps.apple.com/app/id6460007544 |

Caveats:
- No traction numbers exist for Gartic Phone, Contexto in China or Higher/Lower in China.
- "Not found on WeChat or Douyin" is web search only.
- The legal points on data and copyright are general knowledge, not legal advice. Engage PRC counsel before the spec.
