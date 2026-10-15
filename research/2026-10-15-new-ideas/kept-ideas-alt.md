# Kept ideas: the founder's 4 (2026-10-15)

Author: opportunity-analyst, for the CTO and the founder. This doc expands the four ideas the founder chose to keep. It does not re-score the ideas already scored in `00-shortlist.md`. Those scores are reused as they are. Only Gartic Phone is scored new here, on the same rubric.

**Rules for all four:** IAA only (no IAP, no 版号), original IP, no gambling-like mechanics, no induced sharing (诱导分享), no runtime generative AI at launch, and the bar in constitution Article 3 (simple, addictive, social).

## Inputs and citation keys

| Key | Source |
|---|---|
| [CON] | `docs/constitution.md`, Article 3 |
| [SL] | `research/2026-10-15-new-ideas/00-shortlist.md` (weights in §3.1, scores in §3.2) |
| [SWEEP] | `research/2026-10-15-new-ideas/03-fresh-sweep.md` |
| [SOC] | `research/2026-10-14-social-minigames/03-social-mechanics-monetization.md` |
| [LEG] | `research/2026-10-14-social-minigames/04-legal-compliance.md` |
| [P0] | `docs/dianjiangtai/phase0-platform.md` (official WeChat API checks, 2026-10-14) |
| [CF] | `apps/dianjiangtai/cloudfunctions/README.md` (the 点将台 backend) |
| G1-G14 | New searches and fetches today (section 7) |

**Labels:**
- **UNVERIFIED** means I could not confirm it from a source.
- **INFERENCE** means it is my own judgement.
- Every "not found on WeChat/Douyin" comes from web search only. Mini game stores are not indexed, so the in-app searches listed for each idea are the real check.

**The 点将台 stack these ideas reuse** ([CF], `apps/dianjiangtai/game/js/`):
- **Backend (11 cloud functions):**
  - daily seed: `genDaily`, `getDaily`, plus a seed bank imported from the console;
  - runs: `startRun` (anchors the one daily attempt), `submitRun` (server-authoritative replay with idempotency and rate limits), `getReplay` (with a spoiler lock);
  - challenges: `createChallenge` and `getChallenge` (the challenger's answer is withheld until the recipient has answered);
  - groups and boards: `joinGroup` (cloudID-decrypted `opengid` turned into an opaque `groupRef`) and `getBoard` (hashed, server-ranked rows);
  - housekeeping: `track` and `cleanup` (180-day retention).
- **Client:** `ads.js`, `share.js`, `privacy.js`, `odc.js` (open data domain), `api.js`, `mock-server.js`, `vm.js`/`controller.js`, and the canvas kit in `render/` (`board`, `shareCard`, `challenge`, `result`, `home`, `howto`, `overlay`, `widgets`, `theme`, `layout`).
- **Not in the stack:** text input, drawing input and content-security checks. No `msgSecCheck` or `mediaCheckAsync` call exists anywhere in the repo (checked by grep). These are new work wherever an idea needs them.

---

## 1. 语义热冷 (Contexto/Semantle-style)

**Pitch.**
今天全国猜同一个秘密词。随便猜，每个词都告诉你离答案有多"热"。
Guess today's secret word; every guess gets a closeness rank, so you get warmer until you hit it.

**Core loop.**
1. Open the game to today's puzzle (第 N 期). Six tappable 热身词 are shown so the first move needs no typing.
2. Type any word with the native keyboard (`wx.showKeyboard`; it exists for mini games, but it is unused in our repo, so this is UNVERIFIED for us).
3. The server returns the word's rank among the 1,000 words nearest the answer (for example "#37 🔥"), or "冷" if it is outside the top 1,000, or "词库里没有这个词" if it is not in our vocabulary.
4. The guess ladder re-sorts with the hottest guess on top. Repeat until rank #1, which is the answer.
5. **Stuck?** A hint ladder:
   - one free hint after 15 guesses;
   - a rewarded-video hint that reveals a word nearer than your current best;
   - a final "give up" that shows the answer.
6. The result: "第 N 期，23 次猜中，用了 1 个提示".

**Session length.**
- Contexto/Semantle sessions run about 3-10 minutes, and Semantle is described as punishingly hard ([SWEEP] 1; https://www.techradar.com/news/semantle-is-the-wordle-clone-that-will-have-you-pulling-your-hair-out).
- The target is a median of 3-4 minutes. That needs:
  - easy answer words (common two-character nouns);
  - the free hint at 15 guesses;
  - a difficulty gate when the answer bank is built: reject an answer word if the bot solver needs more than about 40 guesses.
- Even so, this sits at the top edge of [CON] 3.3 ("about 30 s to 3 min"). INFERENCE.

**How it plays in a WeChat group.**
- **Solo, async:** everyone solves the same daily word alone, then posts their result card in the group.
- **Group co-op mode (群共猜):** opened from a group card. All members' guesses go into one shared ladder for that group's puzzle, so the group hunts the word together and the card credits whoever finished it.
- The shared ladder only ever shows words from our closed, filtered vocabulary, so no user text can appear to other people.
- Not real-time; no lobby.

**Daily and replay hook.**
- A new word at 00:00 BJT and a streak counter.
- The past puzzles (往期) archive is the "play again now" loop and the main ad inventory.
- Yesterday's answer and its top-10 neighbours unlock after the daily window. This reuses the 点将台 spoiler lock ([CF], "Daily spoiler lock").

**Social mechanics and the share card.**
- **Share card (500x400, [P0] 4):** a spoiler-free "temperature strip" of coloured bars, one per guess (cold to hot), plus "23 次 · 1 提示 · 第 N 期". It never shows words.
- **Boards:** a group board and a friend board ranked by guess count (fewer is better), using the hashed rows from `getBoard`.
- **Challenge:** "我 23 次猜中，你呢". The recipient plays the same word, and the challenger's guess path stays hidden until the recipient finishes (the existing challenge lock).
- No share is ever rewarded ([CON] 3.4). Rewarded video uses `disableFallbackSharePage:true` ([P0] 7.1).

**Monetization (IAA).** This has the most ad slots of the four, because guesses are unlimited ([SWEEP] 4.1; [SL] gave IAA 5).
- **Rewarded:** a nearer-word hint, at most 3 per puzzle. In the ranked daily, each hint counts as +5 guesses on the board so ads never buy rank.
- **Interstitial:** between archive puzzles, with the 点将台 caps (≥ 120 s apart, ≤ 5 a day) and silent handling of errors 2001-2003 ([P0] 7.2).
- **Banner:** on the result screen.

**Article 3 check.**

| Principle | Score | Reasoning |
|---|---|---|
| Simple | **2 in [SL]; 3 with the rework above (my view)** | The one-sentence rule passes ("猜秘密词，越猜越热"). It fails "one-thumb", because typing Chinese is needed after the 热身词. [SL] rejected the idea on this point. The rework (热身词 taps, easy answer words, hint ladder) brings it to a borderline 3, but it remains the weakest Simple of the four. The CTO must accept that before a spec, per [CON] 3.5. |
| Addictive | 4 ([SL]) | The "almost there" pull is strong and the archive gives play-now replay. Only one ranked daily. |
| Social | 4 ([SL]) | Guess count is one comparable number. 群共猜 makes the group itself the team. |

**China uniqueness verdict: probably unique (4 in [SL]).**
- No Chinese daily semantic-guess title was found on WeChat.
- There is a partial web precedent: WordRank has a Chinese web/app version with no daily limit ([SWEEP] 1).
- 汉兜 and 词影 are Wordle-style, not semantic (https://sspai.com/post/78897).
- My search for a Chinese Semantle or Contexto found nothing (G8). UNVERIFIED in-app.

**Source-game IP owners and what we must NOT copy.**
- **Owners:**
  - Semantle: David Turner, January 2022 (https://en.wikipedia.org/wiki/Semantle).
  - Contexto: an indie team ([SWEEP] 1; the specific developer is UNVERIFIED).
- **Mechanics are free to reuse; expression is not** ([LEG] 2.2). Do not copy:
  - the names "Semantle" and "Contexto";
  - Semantle's −100 to 100 similarity scale and its "/1000" phrasing;
  - Contexto's green/yellow/red bar visuals and layout;
  - their word lists or hint wording.
- Our rank presentation and temperature strip must be our own design.

**Compliance hurdles.**
- **Free-text input** ([SWEEP] 5):
  - Accept only words in our own vocabulary of about 50-100k common words. The vocabulary is filtered offline against a sensitive-word list and reviewed by a person.
  - Anything outside the vocabulary returns "词库里没有这个词". It is never stored or echoed to other users.
  - A user's typed word appears only on that user's own screen. Share cards carry no words.
  - So no UGC is ever published. INFERENCE: `msgSecCheck` is not needed for v1. Adding it costs little if review asks: it exists as a cloud call `security.msgSecCheck` with version 2, a scene value and an openid, up to 2,500 characters, 4,000 calls/min and 2M calls/day (G6).
- **Embedding neighbours** can surface offensive or political words in hints and in yesterday's top-10 reveal. Filter the vocabulary *before* computing ranks, and review each answer word's top-50 neighbours by hand.
- **Not generative AI.** Ranks are precomputed offline with a word-embedding model, and no content is generated at runtime. INFERENCE: no AIGC label or generative-AI filing is needed. Confirm with counsel.
- **Model licence: UNVERIFIED.**
  - Candidates are the Tencent AI Lab Chinese word embeddings (licence not checked), BAAI bge-zh models (MIT, UNVERIFIED) and fastText cc.zh (CC BY-SA, UNVERIFIED; share-alike may reach the derived rank tables).
  - Pick one with a licence that clearly allows commercial use of derived data.
- **Standard items:** 备案, 软著, 用户隐私保护指引 declaring 微信朋友关系 ([P0] 11), 防沉迷 and an age notice, and a mainland entity ([LEG] 1).

**Reuse of the 点将台 stack.**

| Piece | Reuse | New work |
|---|---|---|
| Daily answer, seed bank, `genDaily`/`getDaily` | Direct. The bank holds the precomputed answer words | Bank entries are answer words plus a pointer to the rank table |
| Run anchor, server-authoritative result | `startRun` direct. `submitRun` becomes a per-guess `guess` function holding server state | **New:** `guess` (rank lookup, guess log, solve detection). The client never receives the rank table |
| Boards, challenge, `joinGroup`, share card, ads, privacy, `track`, `cleanup` | Direct | Board value is the guess count. Add a 群共猜 shared-ladder collection keyed by `groupRef` |
| Canvas UI kit | Direct | **New:** keyboard input, the guess ladder and the temperature strip |
| Offline tools | Pattern only (like `simstats`) | **New:** vocabulary build, embedding precompute, a bot solver for the difficulty gate, and the import script |

**Build effort:** about **4-5 weeks** to release-ready (Art. 4 scope). The critical path is the vocabulary, the embedding precompute and curation of about 120 answer words with reviewed neighbours.

**Key risks.**
1. **Too hard for the mass market.** The WeChat audience is broad and about 40% are over 40 ([SOC] 1). Semantle-style difficulty would lose them. Mitigation: the difficulty gate and the hint ladder.
2. **The Simple principle.** Typing may be judged a fail under [CON] 3.5.
3. **Embedding quality on Chinese.** Nonsense neighbours ("why is 苹果 near 手机?") feel unfair. Polysemy needs a manual pass.
4. **Cloud cost.** About 30 function calls per player per day. Quotas are UNVERIFIED ([P0] 9).
5. **Spoilers in groups.** One person posts the answer. That is accepted as social, as for 点将台.

**Cheapest validation (optional; Art. 4 has no validation pauses unless the founder asks).**
- About 1 week: an H5 or DevTools prototype with 10 answer words and one open model, played by 20 people.
- **Go if:** median solve ≤ 35 guesses and ≤ 5 minutes, ≥ 70% solve without giving up, and ≥ 50% play a second (archive) puzzle in the same session.
- **Kill if:** median > 60 guesses, or most testers quit before the first hint.

**In-app WeChat searches for the founder** (小游戏 tab and 小程序 search): 语义猜词, 热冷猜词, 猜词 热度, 每日猜词, 猜秘密词, 词语温度, 越猜越近, Semantle, Contexto. For any hit, note whether it is a daily, whether it ranks by meaning, and whether it has group boards.

---

## 2. 群友刻度盘 (Wavelength-style dial)

**Pitch.**
一个人看到刻度上的隐藏位置，给一句提示；全群拖指针，看谁和他最有默契。
One player sees a hidden spot on a spectrum like 冷↔热 and gives a clue; the group drags the needle, and the card shows who is most in sync.

**Core loop (a group round, async).**
1. **Set the round.** The setter taps 出题 and picks one of 3 curated spectra (for example 冷↔热, 土↔潮, 小众↔大众). The server draws a hidden target from 0 to 100 and shows it only to the setter.
2. **Give the clue.** The setter sends it as a normal WeChat voice or text message in the group, outside the game ([SWEEP] 7). The setter then shares the round card into the group.
3. **Guess.** Members open the card, see the spectrum, drag the needle with one thumb and submit. Nobody sees other guesses before submitting.
4. **Reveal.** The setter taps 揭晓, or the round reveals automatically after 24 h once at least 2 members have guessed. Everyone sees the target, each guess, the closest member and a group 默契值 (the average closeness).

**Core loop (the daily, solo).**
- **今日刻度:** an editor-set round with our own clue (for example "火锅" on 冷↔热) and an editor-set target.
- You get one guess, scored by closeness, on a group board.
- This exists so the game still has a daily reason to open when the group is quiet.

**Session length.**
- About 20-40 s per action (set or guess); the daily round is about 15 s.
- Spread across a group, a round lasts minutes to hours.

**How it plays in a WeChat group.**
- Async; the group chat is the lobby.
- Group-first: a round only exists inside a group, identified by `opengid` via `getGroupEnterInfo` ([P0] 2.4).
- Solo only for the daily round.

**Daily and replay hook.**
- The daily official round and a streak.
- The pull to "出一道题" right after a reveal (a role swap).
- A group 默契 history ("本群默契值 第 12 轮 82").

**Social mechanics and the share card.**
- **Round card:** "群友出了一道刻度题：冷 ↔ 热", showing the spectrum. It contains no user text.
- **Reveal card:** the target and the group 默契值 ("本群默契值 82"), plus the closest guess with no name on the card. Names appear only in-game, through the open data domain.
- **Boards:** a group 默契 board over time, and a daily-round group board.
- No rewards for sharing. Nothing in the game depends on group size, so nobody is pushed to recruit or to nag others to play ([SL] 7).

**Monetization (IAA): weak, 2 in [SL].**
- **Rewarded:** the setter gets 3 more spectra to choose from; the daily round gets a bonus 再来一题 from the archive.
- **Interstitial:** after viewing a reveal, capped as for 点将台.
- **Banner:** on the waiting screen ("等待 3 位群友作答").

**Article 3 check** (scores from [SL]).

| Principle | Score | Reasoning |
|---|---|---|
| Simple | 3 | Dragging one needle is trivial. But the setter role and an outside-the-game clue take one sentence of explanation, and new users are confused about "where is the clue?" A 15-second first-round walkthrough is needed. |
| Addictive | 3 | Reveals pull people back, but the loop depends on others acting. The daily round adds a solo reason to return. |
| Social | 5 | The group consensus is the game. 默契 is a native WeChat-group word. |

**China uniqueness verdict: partially present (3 in [SL]).**
- 默契 Q&A mini programs exist from 2017 on (https://www.ifanr.com/364968, https://www.ifanr.com/minapp/892528). They are question-based, not dial-based.
- No dial version was found ([SWEEP] 7), and no Chinese Wavelength or WeChat equivalent turned up today (G10). UNVERIFIED in-app.

**Source-game IP owner and what we must NOT copy.**
- **Owner:** Wavelength was designed by Alex Hague, Justin Vickers and Wolfgang Warsch. It was published in 2019 by Palm Court (later renamed CMYK) after a Kickstarter of about $300K. CMYK claims over 1M copies sold (https://en.wikipedia.org/wiki/Wavelength_(game), https://www.cmyk.games/pages/about-cmyk).
- **Traction:** the mobile app has 5M+ downloads and Apple Editors' Choice ([SWEEP] 7; undated).
- **Do not copy:**
  - the name "Wavelength" or "心灵波长"-style direct translations;
  - the semicircular dial with the coloured 2/3/4-point wedge and the screen-cover art;
  - their spectrum card list (the card text is their expression);
  - the "psychic" role name.
- Use our own linear thermometer or slider, our own scoring bands and about 300 spectra we write ourselves.

**Compliance hurdles.**
- **No in-game UGC in v1.** The clue lives in the WeChat chat, which is WeChat's own surface.
- **If an in-game typed clue is added later:**
  - limit it to 12 characters and check it with `security.msgSecCheck` (version 2, scene 2) before the round becomes playable;
  - reject `risky` results, and treat `review` as a reject because a small team cannot staff a human queue;
  - the API needs the user to have visited within the last 2 hours (error 61010), which is always true at set time (G6).
- **Curated spectra:** no people, regions, ethnic groups, religions, politics or celebrities. The 2021 crackdown on ranking and voting mini programs targeted these ([SWEEP] 5).
- **Guesses are not "rating friends."** Players rate a concept, never a person. That keeps clear of the anonymous rate-your-friends ban ([SWEEP], rejected list).
- **Privacy:** group membership and the friend scope are privacy interfaces; declare 微信朋友关系 ([P0] 11).

**Reuse of the 点将台 stack.**

| Piece | Reuse | New work |
|---|---|---|
| `createChallenge`/`getChallenge` and the "answer withheld until you answer" lock | **Very strong.** A round is a challenge whose hidden target is the withheld answer | The round has a setter, a reveal state and an auto-reveal timer |
| `joinGroup`, `groupRef`, hashed rows, `getBoard`, open data domain (`odc.js`) | Direct | The reveal list rendered in the open data domain (names) |
| Daily seed and bank | Direct for 今日刻度 | Bank entries are a spectrum, clue and target |
| Share card, ads, privacy, `track`, `cleanup`, canvas UI kit | Direct | The dial widget and new card layouts |
| Timer | `cleanup` pattern | Auto-reveal sweep (one timer per function, [P0] 9) |

**Build effort:** about **4-5 weeks**. Content is about 300 spectra and about 90 daily clue/target sets, written in parallel with the code.

**Key risks.**
1. **Dead rounds.** Groups ignore the card and the round never reveals. Mitigation: reveal with 2 guesses, the 24 h auto-reveal, and the daily round as a fallback.
2. **Clue lives outside the game.** Late openers can't find it in a busy chat. Mitigation: the round card says "看群里 TA 的提示". The in-game clue is the v2 fix, at the cost of UGC moderation.
3. **Weak IAA.** Low ad volume per user.
4. **默契 territory.** Players may see it as "another 默契测试".

**Cheapest validation (optional).**
- About 3 days at near-zero cost: the founder runs 10 rounds by hand in 5 real groups, using a static picture of a spectrum and "reply with a number from 0 to 100".
- **Go if:** median replies per round ≥ 3 and someone volunteers to set the next round in ≥ 50% of groups.
- Then a 1-week prototype on the challenge flow. **Go if** ≥ 40% of rounds reach a reveal with ≥ 3 guessers.

**In-app WeChat searches for the founder:** 刻度, 默契刻度, 心有灵犀 刻度, 波长, 猜位置, 默契值, 指针 默契, 冷热 刻度, Wavelength. Also play the top 2 默契 mini games for 5 minutes each, to judge how players will read our game.

---

## 3. Gartic Phone (drawing/writing telephone), working title 「画话接龙」

**Pitch.**
一句话传到画，画再传成一句话……传完一圈，全群看看"熊猫吃火锅"最后变成了什么。
Write, draw, describe, draw: the group passes one prompt round the chat, and the funny distortion at the reveal is the payoff.

### 3.1 New research (this idea was not covered before)

**Traction.**
- **Gartic Phone:** by Onrizon Social Games (Brazil; the iOS listing names Gartic Publicidade Digital). It launched on the web in October-December 2020; sources differ on the date (https://amp.knowyourmeme.com/memes/subcultures/gartic-phone, G1).
- It was released as a free Discord activity in 2023 (G1). A fan wiki reports about 707.6K Twitch followers, and one TikTok clip had 10.2M plays (G1; fan sources, indicative only).
- Native iOS/Android apps came out in July 2026. The first iOS release was 2026-07-23 (free, ad-supported), outside the US top 30, with no download counts found (https://mwm.ai/apps/gartic-phone/6788498566, https://appgoblin.info/apps/6788498566, G4; [SWEEP] 8).
- **No MAU or player figures were found.** UNVERIFIED.
- **Async precedent:**
  - Broken Picture Telephone (2009);
  - **Drawception** (March 2012, by Jeremiah Freyholtz, now Blue Flame Labs). It plays chains of 12-24 random strangers asynchronously and notifies players when the chain completes. Wikipedia says it was only partly working as of 2022 (https://en.wikipedia.org/wiki/Drawception, G3).
  - These prove the async chain works as a format, but at niche scale.
  - Reddit's Pixelary (drawing-guess, not a chain) reached up to 60K DAU (Dec 2024; [SWEEP] 8).

**China check.**
- 你画我猜 (one person draws, others race to guess) is a saturated mini program category ([SWEEP] 8, 11).
- Searches for 传话画画, 你画我传, 画图接龙, 画画接龙 and 传画 turned up no WeChat or Douyin chain-telephone title (G2, G9).
- The App Store has 「你画我猜 - 你比我猜画画接龙」 (id1665034767, 2023). It uses "接龙" in its subtitle but is described as a party drawing game, and whether it is a chain mechanic is UNVERIFIED (https://apps.apple.com/us/app/id1665034767).
- 「画了个画」 is a 你演我猜-style party app (https://apps.apple.com/hk/app/id6470613424).
- Net: the base is saturated, and the chain variant was not found on WeChat or Douyin. UNVERIFIED in-app.

**How it differs from 你画我猜.**

| | 你画我猜 | Telephone chain |
|---|---|---|
| Goal | Guess fast; points; a winner | No winner. The fun is the distortion |
| Timing | Real-time room; everyone online at once | Each step is independent, so it works **async** |
| Drawing skill | Bad drawers lose | Bad drawings are the comedy |
| Payoff | The score | The reveal of the whole chain, which is very shareable |

**How it runs async in a WeChat group** (Gartic uses real-time lobbies):
1. A group member starts a chain by picking one of 3 **curated** starting prompts. There is no free text at step 1.
2. The game shares a card into the group: "接龙进行中 1/8 · 轮到下一位".
3. The next member to open the card **claims** the next step (a 5-minute lock). They see **only the previous step**.
4. Steps alternate: draw (60 s, 6 colours, 2 brush sizes, undo, one finger) and describe (at most 20 characters).
5. **One person cannot take two consecutive steps,** and each person takes at most 2 steps per chain.
6. Each step is **released to the next player only after it passes content checks** (3.2).
7. The chain completes at 8 steps, or after 48 h with at least 4 steps. Then the **reveal** plays step by step for everyone in the group.

**Moderation.** Verified from the official docs today (G6, G7):
- **`msgSecCheck` (text):** a server or cloud call (`security.msgSecCheck`). It takes version 2, a scene (1 profile, 2 comment, 3 forum, 4 social log) and an openid of a user who visited within 2 hours. Content is up to 2,500 characters.
  - Results: `suggest` is risky, pass or review; labels include 20001 politics, 20002 porn, 20003 abuse, 20006 illegal, 20008 fraud, 20012 vulgar.
  - Limits: 4,000 calls/min and 2M calls/day. **Unpublished apps get 100 calls/day.**
  - Source: https://developers.weixin.qq.com/miniprogram/dev/server/API/sec-center/sec-check/api_msgseccheck
- **`mediaCheckAsync` (images and audio):** a cloud call `security.mediaCheckAsync`, and it **applies to mini games**. It takes a `media_url` the checker can download, of at most 10 MB.
  - Limits: 2,000 calls/min and 200K calls/day.
  - It returns a `trace_id`. The verdict is **pushed within 30 minutes** as a `wxa_media_check` event to the message-receiving endpoint. Image labels include 20001 politics, 20002 porn and 20006 illegal.
  - Source: https://developers.weixin.qq.com/miniprogram/dev/server/API/sec-center/sec-check/api_mediacheckasync
- **Fit with async:** the up-to-30-minute delay is acceptable *because* the chain is async. The next player sees "上一步审核中" if they arrive early. Typical latency is UNVERIFIED.
- **Push setup:** setting up the message push for a cloud environment (routing the `wxa_media_check` event to a cloud function) is UNVERIFIED for mini games.
- **Weak spots** (community reports, UNVERIFIED):
  - some sensitive text gets through `msgSecCheck`;
  - image checks reportedly "always pass" for some developers (G5).
  - Crude doodles (genitals, caricatures of real leaders) are exactly what classifiers miss. INFERENCE.

**Minors and UGC rules.**
- The 未成年人网络保护条例 (in force 2024-01-01 per my background knowledge; UNVERIFIED) requires visible reporting channels and prominent warnings for content that may harm minors.
- I did not retrieve the final text (G11, https://www.chinalawtranslate.com/regulations-on-the-protection-of-minors-online-draft-for-deliberation/). Counsel must confirm the duties for a group-only UGC game.

### 3.2 The idea section

**Core loop (per player).**
- Open the card → see one step → draw it in 60 s, or describe it in ≤ 20 characters → submit → done.
- Later: get the reveal (in the group, or by an opt-in subscribe message "你参与的接龙揭晓了").

**Session length:** about 60-90 s per step, and about 60 s to watch a reveal.

**How it plays in a WeChat group.**
- Async and group-only. A chain belongs to one `opengid`.
- **No stranger matching and no public gallery at launch.** This limits moderation exposure and contact with minors.
- A solo "practice" mode is not offered. It would have no payoff.

**Daily and replay hook.**
- **今日起点:** 3 new curated starting prompts each day.
- Reveals arrive hours after you played, which is a natural return trigger.
- 我的接龙 (my chains) history.
- Weak "play again now": you can start a new chain, but it needs others.

**Social mechanics and the share card.**
- **Reveal card:** "从『熊猫吃火锅』传到了『外星人在洗澡』 · 8 人接龙".
  - Text only: the curated start plus the final description, both already checked.
  - Optionally one drawing thumbnail, only if it passed `mediaCheckAsync` with `pass`.
- **Progress card:** "接龙 5/8 · 轮到你了吗？" There is no updatable custom text; the only updatable-message form is the fixed "当前 x/N 人" template ([P0] 5).
- No boards: there is no score, by design.
- No reward for sharing, and nothing gates on how many people join.

**Monetization (IAA): weak.**
- **Rewarded:** extra palette colours or brush styles for one chain. These are cosmetic, not randomness.
- **Interstitial:** after a reveal finishes, capped.
- **Banner:** on the "审核中 / 等待下一位" screens.
- **IAA fit: 2.** One step is about 60 s and there is no failure moment, so retry slots are few.

**Article 3 check** (new scores, my own).

| Principle | Score | Reasoning |
|---|---|---|
| Simple | 3 | Each step is one simple action, and drawing with a finger is one-thumb. But the chain rules ("you only see the previous step"), claiming a step and waiting for review take more than one sentence for a first-timer. Some users have drawing anxiety. |
| Addictive | 3 | The reveal is a strong, funny payoff with a natural return trigger. But there is no solo replay and no streak, and a chain dies without others. |
| Social | 5 | The reveal is the product and is made to be shared ([SWEEP] 8). It is built around the group. |

**China uniqueness verdict: 3 (partially present).** The base genre (drawing-guess) is saturated. The chain or telephone variant was not found on WeChat or Douyin (G2, G9). The App Store title with "接龙" in its name is unconfirmed. UNVERIFIED in-app.

**Source-game IP owner and what we must NOT copy.**
- **Owner:** Onrizon Social Games / Gartic Publicidade Digital (Brazil).
- **The mechanic is folk:** the party game known as Telephone Pictionary, which predates Broken Picture Telephone (2009) and Drawception (2012). So the loop itself is low-risk ([LEG] 2.2).
- **Do not copy:**
  - the "Gartic" name;
  - their mode names (Knock-Off, Animation, Secret and others; https://mobygames.com/game/gartic-phone);
  - the album-style reveal layout, the UI, the characters, sounds and colour scheme;
  - their prompt lists.
- Write our own prompts and our own reveal presentation.

**Compliance hurdles: the heaviest of the four.**
- **Text UGC** (descriptions, ≤ 20 characters):
  - `msgSecCheck` (version 2, scene 2) runs synchronously on submit, plus our own local blocklist first;
  - `risky` or `review`: reject and ask for "换个说法".
- **Drawing UGC:**
  - rasterize on the client (`canvas.toTempFilePath`) → upload to cloud storage → `mediaCheckAsync` with a temp URL;
  - hold the step as `pending` until the push says `pass`;
  - `risky` or `review` hides the step and reopens it for someone else;
  - store strokes plus the PNG.
- **Reporting:**
  - a 举报 button on every step and on the reveal;
  - hide the step at once for the reporter, auto-hide it for everyone at 2 reports;
  - an entity-level block list of openids;
  - a review log retained 180 days (`cleanup` pattern);
  - a 用户协议 with content rules shown before the first step.
- **Minors:** group-only scope, no strangers, no private messaging and no public feed. Standard 防沉迷. Confirm the minors-regulation duties (above).
- **Review risk:** a WeChat reviewer may test-draw rude images. Our launch build must show the moderation flow working. INFERENCE.
- **Quota trap:** unpublished apps get **100 `msgSecCheck` calls a day** (G6), which constrains QA before launch.
- **Privacy:** declare the collection of user-generated drawings and text, and group-relationship data ([P0] 11).

**Reuse of the 点将台 stack.**

| Piece | Reuse | New work |
|---|---|---|
| `joinGroup`, `groupRef`, share card, ads, privacy, `track`, `cleanup`, canvas UI kit | Direct | — |
| Challenge flow (withhold until answered) | Partial: "see only the previous step" is a withholding rule | A **new chain state machine**: claim, lock, submit, pending, release, reveal; plus 48 h expiry |
| Daily seed and bank | Thin (今日起点 prompts) | — |
| Boards | Not used | — |
| **New, no precedent in the repo** | — | Drawing canvas input; image upload to cloud storage; `msgSecCheck` and `mediaCheckAsync` integration; the message-push receiver; the report and block system; a reveal player |

**Build effort:** about **6-8 weeks**. That is the most of the four, driven by the moderation pipeline and the chain state.

**Key risks.**
1. **Moderation miss.** An obscene or political doodle slips through and the entity's credit score suffers ([LEG] 2.3).
2. **Dead chains.** Group members don't take the next step, so there is no reveal and no payoff.
3. **Read as 你画我猜.** Players file it under a saturated category at first glance.
4. **Weak IAA** and no ranked number, so there is no competitive pull.
5. **Async review latency** of up to 30 minutes per drawing step can stall a lively group.

**Cheapest validation (optional).**
- About 3 days at near-zero cost: the founder runs 5 chains by hand in 3-5 real groups. Members draw on paper or in WeChat's photo editor and post the picture; the next person describes it; the founder assembles the reveal.
- **Go if:** ≥ 4 of 5 chains reach 6 steps within 24 h and the reveal gets ≥ 5 replies.
- **Kill if:** most chains stall before step 4.

**In-app WeChat searches for the founder:** 传话画画, 你画我传, 画图接龙, 画画接龙, 传画, 画话接龙, 灵魂画手 接龙, 传话筒, 画了个画, 你画我猜 接力, Gartic. Do the same on Douyin's 小游戏 search. For each hit, note whether it is a chain (telephone) or a guess race, real-time or async, and whether chains are group-scoped.

---

## 4. 比一比 (Higher/Lower streaks)

**Pitch.**
重庆和成都谁人口多？珠峰和乔戈里峰差多少？两张卡选一张，连对多少个？
Two cards and one question: which number is bigger? One miss ends the streak, so beat your group's best.

### 4.1 New research

**The source game.**
- **The Higher Lower Game** by **Code Computerlove**, a Manchester digital agency.
- The idea came from the agency's daily Google-search-trend analysis. Gareth Evans, Tristan Ashley and Charles Burdett launched it as an MVP "back in December" (2015, per a June 2016 blog post).
- Players guess which term has more average monthly Google searches.
- More than 50M plays in 200+ countries by July 2016 (https://www.thedrum.com/news/2016/07/12/code-computerlove-s-higher-or-lower-search-game-app-goes-viral, https://www.codecomputerlove.com/blog/the-higher-lower-game-goes-viral). A later 500M+ plays claim is from the developer ([SWEEP] 4).
- It became an app and was a 2017 Webby honoree (https://winners.webbyawards.com/2017/websites-and-mobile-sites/general-desktop-mobile-sites/games-games-related/22104/the-higher-lower-game).
- All of this data is STALE (2016-17). No current traction was found.

**China.**
- No WeChat or Douyin Higher/Lower title was found (G12). The search returned only general market data: WeChat mini games had 654M MAU in May 2026 per QuestMobile, via 36Kr (https://www.36kr.com/p/3934427496184960).
- [SWEEP] 3 suspects it exists as a short-video format. UNVERIFIED.
- The [SL] rule stands: **if the founder's in-app search finds a live clone, the idea is dead.**

**Data sourcing and licensing.**
- **国家统计局 terms** (fetched today, https://www.stats.gov.cn/wzgl/202302/t20230217_1912857.html):
  - users "可以在本网站下载和使用国家统计局发布的统计数据", and must use the data lawfully and **accurately**;
  - reuse must credit the source prominently (国家统计局网站 plus the URL), and must not distort or alter the original meaning;
  - commercial use is **not explicitly addressed. UNVERIFIED; ask counsel.**
  - Facts themselves are generally not copyrightable, but compiled databases and books can be. INFERENCE.
- **Recommended sources:**
  - government statistics: 统计年鉴, 第七次人口普查 (2020) city populations, province areas;
  - government geography figures (mountain heights, river lengths);
  - public-domain historical dates before 1840;
  - animal facts from public reference works, rewritten as single numbers.
- **Avoid:**
  - scraped data: search indices (Baidu 指数, as the original used Google), e-commerce prices, app rankings. Scraping carries ToS and 反不正当竞争 risk, and the data is volatile;
  - copyrighted compilations such as a specific 食物成分表 edition (UNVERIFIED status).
- **Accuracy and disputes:** every card shows a source line ("来源：国家统计局 2020"). There is a "数据有误？" report button, versioned content, and a rule that pairs within ±5% of each other are never used (ambiguity). Wrong data is a reputational risk more than a review risk ([SL] #3).

**No gambling framing.**
- Never call it **猜大小**. That is the 骰宝 dice-gambling phrase (INFERENCE, but obvious to Chinese players).
- No 押, 下注, 赌, 翻倍, chips, coins, dice, slot visuals or double-or-nothing.
- A streak is a count, not a stake. The ranked daily has no ad continue. Free mode has 1 rewarded continue per run, never sold ([SL] 7; [LEG] 2.6).

**No sensitive or political comparisons.**
- No people: no celebrities or athletes (name and portrait rights, [LEG] 2.4; the 饭圈 crackdown, [SWEEP] 5).
- No brands, prices, salaries, house prices or company revenue.
- No crime, religion or ethnic-group figures.
- **No territory, border, Taiwan/HK/Macau or disputed-area figures, and no maps at all.** INFERENCE: published maps of China need approval (审图号), so we show none.
- No province GDP or income league tables (regional rivalry; disputed statistics).
- No modern political history.

### 4.2 The idea section

**Core loop.**
1. The left card shows its value; the right card's value is hidden.
2. Tap 更多 or 更少 (or tap the bigger card).
3. If correct, the right card's value reveals, it slides left, and a new card appears.
4. One miss ends the run with "连对 14 个".
- Daily ranked deck: one attempt. Free themed decks: unlimited.

**Session length:** 30-90 s per run ([SWEEP] 4).

**How it plays in a WeChat group.**
- Solo, async runs.
- **Daily shared deck:** everyone gets the same sequence today, so streaks are directly comparable on a group board.
- **Challenge a friend's streak:** the recipient plays the same deck, with the target "超过 TA 的 14".

**Daily and replay hook.**
- A new themed daily deck (地理, 动物, 自然, 历史年代, 太空, 城市) and a play streak.
- Free mode gives instant retry.
- A weekly theme rotation.

**Social mechanics and the share card.**
- **Card:** "今日比一比 连对 14 个 · 本群第 2". No values shown, so no spoilers.
- **Boards:** group and friend boards by streak, via hashed rows.
- **Challenge:** existing flow; the deck path stays hidden until the recipient plays.
- No reward for sharing.

**Monetization (IAA): the best fit of the four (5 in [SL]).**
- **Interstitial:** after a failed free run, with caps.
- **Rewarded:** 1 continue per free run; a "看看差了多少" breakdown after a ranked daily.
- **Banner:** on the result screen.

**Article 3 check** (scores from [SL]).

| Principle | Score | Reasoning |
|---|---|---|
| Simple | 5 | Two cards, one tap. Learnable in 5 seconds. |
| Addictive | 5 | 30-90 s runs, instant retry and "one more" near-misses. The daily deck adds the return. |
| Social | 4 | The streak is a single comparable number, with group boards and challenges. It is less conversational than 刻度盘 or the chain. |

**China uniqueness verdict: 2 (weak).** It was not found on WeChat or Douyin (G12), but it is likely a short-video format ([SWEEP] 3) and it is the easiest of all to clone ([SL] #3). Its only moat is curated, cited content and the daily group loop. UNVERIFIED in-app.

**Source-game IP owner and what we must NOT copy.**
- **Owner:** Code Computerlove (Manchester).
- **Do not copy:**
  - the name "Higher Lower Game", or a "更高更低" direct translation as the title;
  - the search-volume data concept and the Google framing;
  - the split-screen photo layout with a "VS" roundel;
  - their copy and button styling;
  - their item list.
- The comparison mechanic itself is generic ([LEG] 2.2).

**Compliance hurdles.**
- The data licence and attribution above.
- The banned-category list above.
- No gambling vocabulary or visuals.
- No UGC.
- Card photos must be self-made, commissioned or licensed. Prefer icon-style illustrations, which are cheaper and safer.
- Standard 备案, 软著, privacy guide and 防沉迷.

**Reuse of the 点将台 stack: the best reuse of the four.**

| Piece | Reuse | New work |
|---|---|---|
| Daily seed, seed bank, `genDaily`/`getDaily` | Direct. The seed picks today's deck from the item pool | The deck-builder gate (no pair within ±5%; difficulty curve) |
| `startRun`, progressive `getRound`-style release, `submitRun` | Direct. The next card's value is released only after the answer commits, so the client can't read ahead and the streak is server-authoritative | Answers per step, not a lineup |
| Boards, challenge, `joinGroup`, share card, ads, privacy, `track`, `cleanup`, canvas UI kit | Direct | Board value is the streak; card layouts |

**Content:** about 400-600 items across 8 categories, each with one value, unit, source and year. Pairs are generated within a category (so 400 items give thousands of pairs), with a person reviewing the sources.

**Build effort:** about **3-4 weeks** ([SL] #3). The engine is trivial; the work is the cited data.

**Key risks.**
1. **A clone already exists, or arrives in weeks** (Unique 2, Durable 2).
2. **Data disputes** ("成都人口不对!"). Mitigated by sources and the report button.
3. **Thin novelty** wears off after about 2 weeks. Mitigated by the theme rotation.
4. **Accidental sensitive pairs** from automated pairing. Mitigated by category allow-lists and human review.

**Cheapest validation (optional).**
- First, the founder's in-app search, which costs nothing (below).
- If clear, a 1-week prototype on the 点将台 mock server with 300 items ([SL] #3).
- **Go if:** runs per session ≥ 3 and challenge-card open-to-play ≥ 25%.

**In-app WeChat searches for the founder** (and on Douyin): 比一比, 哪个更多, 谁更大, 谁更多, 更高更低, 高低 挑战, 连对, 猜哪个大, 数据 对比 游戏, higher lower. **A live daily or streak version kills the idea.**

---

## 5. Comparison

Weights are from [SL] §3.1: Simple 10%, Addictive 15%, Social 15%, Unique 20%, IAA 10%, Effort 10%, Legal 10%, Durable 10%. A score below 3 on Simple, Addictive or Social fails the idea under [CON] 3.5. Scores for the first three rows come from [SL]. Gartic Phone is new.

| Idea | Simple | Addict. | Social | Unique | IAA | Effort (5 = easy) | Legal (5 = safe) | Durable | **Weighted** | Weeks | Biggest risk |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 比一比 | 5 | 5 | 4 | 2 | 5 | 4 | 4 | 2 | **3.75** | 3-4 | Already exists, or is cloned fast |
| 语义热冷 | **2** (3 reworked) | 4 | 4 | 4 | 5 | 3 | 3 | 3 | **3.60** (3.70 reworked) | 4-5 | Too hard; typing fails Simple |
| 群友刻度盘 | 3 | 3 | 5 | 3 | 2 | 3 | 4 | 3 | **3.30** | 4-5 | Dead rounds; weak IAA |
| 画话接龙 (Gartic Phone) | 3 | 3 | 5 | 3 | 2 | 2 | 2 | 3 | **3.00** | 6-8 | A moderation miss on drawings |

Arithmetic for Gartic: 0.3 + 0.45 + 0.75 + 0.6 + 0.2 + 0.2 + 0.2 + 0.3 = 3.00. The reworked 语义热冷 adds +0.1 for Simple 3. That is my judgement and has not been accepted by the CTO.

## 6. Recommended build order

1. **比一比 first, provided the founder's in-app search finds no live clone.**
   - It has the highest score (3.75) and is the only one of the four that passes all three [CON] principles at 4-5.
   - It is the cheapest (3-4 weeks) and has the best IAA fit.
   - It has the closest reuse of the 点将台 stack (daily seed → daily deck, progressive release → streak anti-cheat), with no UGC at all.
   - It earns while the others are built.
   - **If a clone is found, skip it and start with 语义热冷.**
2. **语义热冷 second.**
   - It is the most *unique* of the four (4) and has the strongest ad inventory.
   - It needs two things first: the CTO accepting the Simple rework, and the one-week difficulty prototype (median ≤ 35 guesses).
   - It is still UGC-free thanks to the closed vocabulary.
   - The offline pipeline (embeddings, answer curation) is the long pole, so it can start in parallel with 比一比's code.
3. **群友刻度盘 third.**
   - It has the best pure group dynamic (Social 5) and strong reuse of the challenge-withholding flow, with no UGC in v1.
   - Its IAA is weak, so it is better as the studio's social flagship once there are two earners.
   - It also builds the **async group-round infrastructure** (group-scoped rounds, reveal, auto-reveal timer) that the chain game needs.
4. **画话接龙 (Gartic Phone) last.**
   - It has the lowest score (3.00), the most effort (6-8 weeks) and the heaviest compliance burden: text and drawing UGC, `mediaCheckAsync` with up to 30-minute async verdicts, reporting, minors.
   - A moderation miss hits the whole entity's credit score ([LEG] 2.3).
   - Build it on top of 刻度盘's round infrastructure, only after the moderation pipeline has been tested on a published app (unpublished apps get 100 `msgSecCheck` calls a day).
   - Validate first with the paper-chain test.

**Before any spec:** the founder runs the in-app searches in each section. The 比一比 search decides step 1.

---

## 7. Searches and fetches run today (2026-10-15)

| # | Query or URL | Finding |
|---|---|---|
| G1 | Gartic Phone Onrizon players traction | Launched Oct-Dec 2020; Discord activity 2023; fan-wiki Twitch and TikTok reach; **no MAU found**. https://amp.knowyourmeme.com/memes/subcultures/gartic-phone , https://namu.wiki/w/Gartic%20Phone |
| G2 | 传话画画 你画我传 画图接龙 小游戏 微信 抖音 | Only the App Store 「你画我猜 - 你比我猜画画接龙」 (id1665034767); no WeChat or Douyin chain title. https://apps.apple.com/us/app/id1665034767 |
| G3 | Drawception async | Async telephone chains of 12-24 strangers since 2012; partly broken as of 2022. https://en.wikipedia.org/wiki/Drawception |
| G4 | Gartic Phone app 2026 | iOS first release 2026-07-23, free and ad-supported; no download counts. https://appgoblin.info/apps/6788498566 , https://mwm.ai/apps/gartic-phone/6788498566 |
| G5 | 小游戏 msgSecCheck mediaCheckAsync | Community reports of misses and "always pass" image checks (UNVERIFIED). https://developers.weixin.qq.com/community/develop/doc/000260a19d49706418532cdbb6b400 |
| G6 | Fetch: msgSecCheck doc | Parameters, labels, limits; 100/day for unpublished apps; cloud call supported. https://developers.weixin.qq.com/miniprogram/dev/server/API/sec-center/sec-check/api_msgseccheck |
| G7 | Fetch: mediaCheckAsync doc | Applies to mini games; push within 30 min; 10 MB; 2,000/min and 200K/day; cloud call supported. https://developers.weixin.qq.com/miniprogram/dev/server/API/sec-center/sec-check/api_mediacheckasync |
| G8 | Semantle 中文版 Contexto 中文 | No Chinese version found. https://semantle.com , https://www.techradar.com/news/semantle-is-the-wordle-clone-that-will-have-you-pulling-your-hair-out |
| G9 | 画画接龙 / 传画 / 灵魂画手 接龙 | Only party drawing apps, e.g. 「画了个画」. https://apps.apple.com/hk/app/id6470613424 |
| G10 | Wavelength 中文 刻度 小程序; designers | No Chinese version found. Designers Hague, Vickers, Warsch; Palm Court → CMYK. https://en.wikipedia.org/wiki/Wavelength_(game) , https://www.cmyk.games/pages/about-cmyk |
| G11 | 未成年人网络保护条例 UGC 举报 | Only draft-stage text and commentary found; final duties UNVERIFIED. https://www.chinalawtranslate.com/regulations-on-the-protection-of-minors-online-draft-for-deliberation/ |
| G12 | 比大小 哪个更多 高低猜 小游戏 | No Chinese Higher/Lower title found; WeChat mini games had 654M MAU in May 2026 (QuestMobile via 36Kr). https://www.36kr.com/p/3934427496184960 |
| G13 | The Higher Lower Game origin | Code Computerlove; MVP December (2015); 50M plays by July 2016; Webby 2017. https://www.codecomputerlove.com/blog/the-higher-lower-game-goes-viral , https://www.thedrum.com/news/2016/07/12/code-computerlove-s-higher-or-lower-search-game-app-goes-viral |
| G14 | Fetch: 国家统计局 terms | Data may be downloaded and used, lawfully and accurately; credit the source; do not distort; commercial use not addressed. https://www.stats.gov.cn/wzgl/202302/t20230217_1912857.html |

## 8. Caveats

- Every "not found" is web search only. The in-app searches are the real check.
- There are no WeChat retention, eCPM or K-factor benchmarks, so all go/kill thresholds are INFERENCE ([SOC] 2.3).
- Gartic Phone's traction is reach data (Twitch, TikTok), not player counts.
- Typical `mediaCheckAsync` latency, the setup for the message-push receiver, the embedding-model licences and the 国家统计局 commercial-use position are all UNVERIFIED.
- Effort figures assume Art. 4 scope (release-ready) and that 点将台 v1 ships with the stack as specified.
- This is not legal advice.
