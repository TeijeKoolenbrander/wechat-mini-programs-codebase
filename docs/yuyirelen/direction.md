# 语义热冷 (working title): direction

Status: founder approved building this game (2026-10-15, YR-D0). One complete v1 release under constitution Article 4: no phases and no validation gate. Author: product-ux.
Companions: `docs/yuyirelen/spec.md` (the "what") and `docs/yuyirelen/decisions.md` (every product decision, PO-n).
Sources: `research/2026-10-15-new-ideas/kept-ideas.md` §0, §1, §5-6; `kept-ideas-alt.md` §1 (the Simple-score risk); `03-fresh-sweep.md` §1, §4.1 (Contexto/Semantle evidence). Reference implementation: `docs/dianjiangtai/` and `apps/dianjiangtai/`.

Labels: **INFERENCE** = our judgement; **UNVERIFIED** = not confirmed from a primary source; **[COMPLIANCE]** = compliance-sensitive.

---

## 1. Vision

**Pitch:** 今天全国猜同一个秘密词。每猜一个词，告诉你离答案第几近。群里谁步数最少？
(Everyone in China hunts the same secret word today. Every guess tells you how close it is in meaning. Who in the group gets there in the fewest steps?)

Contexto and Semantle proved that "warmer, colder" on *meaning* is a deep, sticky daily habit: both still have daily answer sites in September 2026 (kept-ideas K6), and they give unlimited guesses, so they carry far more ad moments per session than Wordle-style games ([SWEEP] §1, §4.1). No Chinese daily version exists on WeChat as far as web search can tell (UNVERIFIED in-app; the founder's search is H10). They are also known as **punishingly hard** (TechRadar via [SWEEP]), and they need typing. Our job is to keep the "第 2 名！差一点！" thrill and remove the wall: a tap-first, hint-capped, three-minute daily built for WeChat groups.

## 2. Target player

- WeChat users aged 24-40 and 40+ (about 40% of mini game players are 40+, [SWEEP] §3), many casual.
- They type Chinese in WeChat every day, so the native keyboard is familiar; but on a mini game it is still more effort than a tap. So **typing must be optional**.
- They play in short gaps and often arrive from a group card. They want to be clever in front of the group, and they want a fair, short daily.
- Design consequences: portrait, one thumb, large text, no timers, one main decision per screen, every word explained in one line.

## 3. Design pillars

1. **一词一天，三分钟 (one word a day, about three minutes).** The hint ladder caps a stuck session, and every step is a single tap.
2. **点着也能猜 (you can play by tapping).** 热身词 for the first move, 联想词 for every next move, autocomplete when typing. A player who never opens the keyboard can still solve every daily (spec AC 104).
3. **同一个词，比步数 (same word, compare steps).** One number, the step count, is comparable across the group. Boards are server-true. Hints count as steps, and ads never touch ranked play.
4. **只有常用词 (only common words).** A closed, reviewed vocabulary: nothing anyone types outside it leaves the phone, and nothing offensive can ever appear on a list. [COMPLIANCE]
5. **自愿分享，不剧透 (voluntary sharing, no spoilers).** The card shows a temperature chart and a step count, never a word. Nothing is rewarded for sharing. [COMPLIANCE]

## 4. Article 3 check (simple, addictive, social)

`kept-ideas-alt.md` flagged that this idea **failed Simple (2) as originally specified** and reached only a borderline 3 with a rework, because typing Chinese breaks one-thumb play. Article 3.5 makes the CTO reject any design that fails a principle. Here is how the v1 design answers that:

| Principle | Score (INFERENCE) | Why |
|---|---|---|
| **Simple** | **4** | **One sentence:** "猜秘密词，第 1 名就是答案". **First move is a tap** (6 热身词), so a new player is playing within seconds, with no login or permission prompt. **Every later move can be a tap:** 5 联想词 under each guess (the guessed word's own neighbours, answer-independent), and hints offered as one button. Typing is optional and assisted (native IME + dictionary suggestions; a non-dictionary word gets an instant local "词库里没有"). How-to = 3 lines + 1 picture; 3 coach bubbles on the first play. It is not a 5 because the core concept (semantic rank) is less obvious than "pick the bigger one". |
| **Addictive** | **4** | The near-miss pull ("第 2 名!") is the strongest hook in the genre. Daily word at 00:00, a streak (solved days), an unlimited archive and practice pool for "one more now", and a reveal list of the nearest 100 words that triggers "oh, *that's* why" ([kept-ideas §1]). The hint ladder (steps 10/20/30/40) keeps sessions near 3 minutes and stops rage-quits. |
| **Social** | **4** | Everyone in the group races the same word. The group board shows solvers by steps **and** the live race ("李四 · 已猜 9 步 · 最近第 6 名"), all spoiler-free. Every share is a challenge on the same puzzle with a comparison after you finish ("你 18 步 · TA 21 步", then TA's route). The reveal list sparks "怎么会是这个词" chats. Weaker than a game where the group *is* the game, hence 4. |

**Measured after launch** (spec §15.1): ≥ 50% of guesses by tap and ≥ 90% of new players making a first guess within 30 s confirm Simple; median 15-30 steps and 2-4 minutes confirm the session length.

## 5. Tone

- **Voice:** warm, light, a little playful. "差一点！", "意思一样！", "已经只差一步了". Never mocking.
- **Plain language.** "名" for rank, "步" for a guess. No jargon (no "cosine", no "语义向量" in the UI).
- **Calm.** No countdowns, no flashing, no "最后机会". The 命中 moment is a short gold fill and a soft chime.
- **No pressure copy** around streaks: no "别断了", no reminders. [COMPLIANCE]

## 6. Art direction

Mood: **a clean thermometer on warm paper.** Readable at arm's length, calm, and nothing like Contexto's or Semantle's screens.

- **Background:** warm off-white paper `#F6F1E7`; ink text `#1E1B18`.
- **Temperature palette** (hot = close): 冷 slate blue `#5E7FA3`, 温 sand `#C9B27A`, 热 amber `#E08A2E`, 烫 vermilion `#D2492A`, 沸 crimson `#A3222B`, 命中 gold `#C9973A`. The band word (冷/温/热/烫/沸/命中) is always printed next to the bar, so colour is never the only signal (colour-blind safe). frontend-ui confirms contrast; high-contrast mode uses a darker set with white text.
- **Ladder row:** word (large), a thermometer bar (rounded, filled to the temperature), the band word, and "第 N 名". The latest guess sits in a raised card at the top.
- **Chips:** rounded paper tags with a thin ink outline; 热身词 and 联想词 share the style.
- **Share card:** a column chart rising from blue to gold, issue label, step count. No words.
- **Typography:** an open-licence display face (for example 思源宋体 or 霞鹜文楷, OFL) for the title and the revealed answer, subset and loaded from a subpackage; the system font everywhere else. Large sizes throughout.
- **No images** beyond small code-drawn icons (lamp for hints, thermometer for the logo). No AI art.
- **Sound:** a soft tick per guess (pitch rises with temperature), a short chime on 命中. Off switch on home.

## 7. Original IP: what we must not copy [COMPLIANCE]

The mechanic (ranking guesses by similarity of meaning) is free to use. The expression is not ([kept-ideas §1], [kept-ideas-alt §1]):
- **Names:** not "Semantle", "Contexto", "Contextle", or direct translations used as a title.
- **Semantle:** not its −100..100 similarity score or the "/1000" phrasing. We show rank and a 0-100 temperature bar derived from rank by our own formula.
- **Contexto:** not its green/yellow/red bars, its layout or its colour logic. Ours is a thermometer, red = close, blue = far, with band words.
- **Their word lists, hint wording and copy.** Our vocabulary comes from our pipeline; every string is ours.
- Our hint ladder (fixed step thresholds, a first-character hint, hints counted as steps) is our own design.

## 8. Naming

Working title **语义热冷** (slug `yuyirelen`). Registration fallbacks: **词语温度计**, **热冷猜词**, **猜词温度** (spec H1). "语义" may read as technical to the 40+ audience; if the founder's name check (H10) shows 词语温度计 free, it is the friendlier store name (INFERENCE). The in-game title follows whichever name is registered.

## 9. Monetization stance (IAA only) [COMPLIANCE]

- **Ranked daily: no ads that change anything.** No rewarded hints in the ranked daily (PO-4); no interstitial during or right before it.
- **Unranked play is the ad inventory:** rewarded 视频提示 (≤ 3 per puzzle) and interstitials between puzzles (from the 2nd finished puzzle of a session, ≥ 120 s apart, ≤ 5 a day).
- **Banner** only on boards, off until 流量主 exists.
- No IAP, no virtual currency, no gambling vocabulary, no rewards for sharing, no share-for-reward fallback page.

## 10. Risks and mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Too hard for the mass audience** (Semantle is "punishingly hard") | Everyday 2-character answers; bot gate (chip-walker median 10-30); hint ladder; synonyms count; live KPI 15-30 median steps with a retune rule (spec §3.6) |
| 2 | **"Unfair" ranks from Chinese embeddings** (character overlap, polysemy, idioms) | Idioms and proper nouns excluded; single characters never answers; model bake-off on rated neighbour lists; per-answer top-100 review; reject answers we can't defend |
| 3 | **Typing friction (Simple)** | Tap-first design (pillar 2); typing optional; keyboard behaviour in the device pass with a suggestion-only fallback |
| 4 | **Offensive neighbours on public lists** | Four-layer vocabulary filter; identity-word watchlist; top-100 review per answer; founder spot-check (H8); retire-an-answer procedure (spec §18 #25) |
| 5 | **Embedding licence** | Primary model's MIT licence confirmed on the official model card (2026-10-15); fallback Apache-2.0 confirmed; Tencent vectors rejected (no licence published); notices kept |
| 6 | **Answer leaks** (client inspection, brute force) | No answer data on the client; server-side ranks; rate limits and a 600-guess cap; observe-only anomaly flags. One player posting the answer in a group is accepted as social |
| 7 | **Cloud cost** (~30 calls per player per day) | Warm-instance caching of the day's rank array; cheap lookups; plan sized in the device pass (H6) |
| 8 | **Content pipeline is the long pole** (≥ 90 daily + ≥ 300 practice reviewed answers) | Pipeline starts first, in parallel with code; monthly top-ups; low-bank warning at 30 days |
| 9 | **Clone risk** once live | Our moat is the reviewed vocabulary and answer bank, the tap-first UX and the group race. Ship complete and polished |

## 11. Release plan (Article 4)

v1 build (pipeline + game + functions in parallel) → QA (all spec ACs) → CTO review → release pack (`docs/yuyirelen/release/`) → Founder Handoff (spec §19) → founder device pass (spec §17.1) → founder approves upload → founder submits. No interim approvals.
