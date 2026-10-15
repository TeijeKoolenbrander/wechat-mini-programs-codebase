# Fresh sweep: new short-session social game candidates (2026-10-15)

Author: market-researcher. Angle: candidates NOT in `research/2026-10-14-social-minigames/` (that report already covers 82-0-style drafts, Wordle/Connections dailies, flick duels, blind ranking, Pips/Strands/Immaculate Grid, Smash Fest, Block Blast). Other researchers cover the 末日生存 and life-sim themes.

Labels: FACT has a source URL. INFERENCE is my judgement. "not found" means I searched and found nothing. Search quality note: the search tool returned thin and SEO-heavy results. Most "traction" figures below are developer claims or app-store/mirror data, and several titles have no traction figure at all. China checks are web searches only, which is weak evidence of absence. A human must still search WeChat in-app before any spec.

## 1. Key findings

- The 2025-26 Western "social casual" signal is mostly **chat-native micro-games and daily-seed games**, not new genres. Platforms are embedding duel games in chat: TikTok DM alligator game (Apr 2026), Threads basketball prototype (Jan 2026), Instagram DM emoji paddle game (2025). This validates "game lives inside the chat thread", which is WeChat's native shape, but it overlaps with the 擂台 flick-duel idea already in the shortlist.
- **Five formats look both new to WeChat and viable**: semantic hot/cold word guessing (Contexto/Semantle), attribute-compare daily guessing (Loldle/Pokedle), photo-year guessing (Which Year, Vestige), a spectrum-dial group-consensus game (Wavelength), and stat Higher/Lower streaks. None showed up as a WeChat title in my searches.
- **Saturated in China, skip**: drawing-guess (你画我猜), 谁是卧底/Imposter, 默契 Q&A tests, 成语 word-link puzzles, tap-count rankings with group boards (放鞭炮).
- **Hard no on compliance grounds**: anonymous rate-your-friends (Gas model; WeChat suspended 匿名聊聊 in 2017 and ran a 2021 crackdown on ranking/voting mini programs), Telegram-style tap-to-earn (Hamster Kombat lost about 86% of users), and AI-generated combination games (Infinite Craft; generative AI filing burden, INFERENCE).
- Strongest synergy find: a **Loldle-style daily "猜将" (guess the general by attribute feedback)** can reuse the 120-160 general database already planned for 点将台. It shares art, data and the daily-seed backend. INFERENCE.
- Contexto-style games give **unlimited guesses per puzzle**, so they create far more ad slots per session than Wordle's six guesses. INFERENCE from mechanics, but important for IAA.
- Weak evidence overall: there is no hard 2026 traffic figure for any new candidate except Peak (10M+ copies, but it is a PC game), Wavelength (5M+ downloads) and Clues by Sam (developer claim of 50K DAU). Treat all candidates as unvalidated hypotheses.

## 2. Evidence: the 15 candidates

Format per entry: core loop; session; social mechanic; traction; IP owner; China check; verdict.

### A. Daily and guessing formats

**1. Contexto / Semantle (semantic hot-cold word guess)**
- Loop: guess any word, and the game returns a similarity rank to a hidden daily word (Contexto) or a cosine-similarity score (Semantle). Unlimited guesses; hints; daily puzzle plus unlimited mode.
- Session: roughly 3-10 min (INFERENCE; the creator expects dozens of tries).
- Social: everyone gets the same word; compare guess counts; leaderboards and stats in the app.
- Traction: Semantle launched January 2022 by David Turner and has spawned multi-language versions (https://en.wikipedia.org/wiki/Semantle). The Contexto Android listing showed about 86.5K downloads and iOS 4.6 stars from 73 ratings (mirror pages, approximate; https://apps.apple.com/app/id6445911965). No player-count figures found. Both date from 2022, so the traction is STALE (older than 12 months).
- IP owner: Semantle by David Turner; Contexto by its own indie team. Mechanics are free to reuse, but avoid the names.
- China: no Chinese daily WeChat title found. WordRank has a Chinese version as a web/app product with no daily limit (https://www.moddb.com/games/wordrank/articles, surfaced via search; not a mini program as far as I found). 汉兜 and 词影 are Wordle-style, not semantic (https://sspai.com/post/78897).
- Verdict: **unique on WeChat** (partial web precedent). Needs a Chinese word-embedding model and a precomputed top-1000 ranking per answer word, which is cheap server-side.

**2. Loldle / Pokedle (attribute-compare daily guess)**
- Loop: guess a character; the game colours each attribute (green/orange/red) against the secret character. Several modes (classic, silhouette, description, card art).
- Session: 2-5 min.
- Social: shared daily answer, Wordle-style spoiler-free results.
- Traction: Loldle started as a Reddit project by a single developer and Pokedle is by the same creator (https://afkgaming.com/esports/news/league-of-legends-loldle-what-is-it-and-how-to-play, https://www.gfinityesports.com/article/pokedle-answers-today). No usage statistics found. Dozens of "-dle" sites exist (not quantified).
- IP owner: fan games on Riot (League) and Nintendo/Game Freak (Pokemon) IP. Takedown risk. A live example of fan-IP risk is Daily Red (offline 2026-10-11, covered in the earlier report).
- China: no Chinese version found for 王者荣耀 or similar (search returned nothing relevant). INFERENCE: using game IP such as 王者荣耀 is a copyright and Tencent-competition risk; use public-domain 三国/水浒/西游 characters, 唐宋诗人 or 中国城市.
- Verdict: **unique** as a daily format with original or public-domain content. It pairs with the 点将台 database.

**3. Which Year / Vestige / Throwbacks (photo-year guessing)**
- Loop: five photos per day, guess the year; the closer, the more points; a hint reveals a digit. Vestige gives three images in a minute.
- Session: 2-4 min.
- Social: shared score, nostalgia arguments; "你们猜这是哪年".
- Traction: PetaPixel covered the web game in April 2025 (https://petapixel.com/2025/04/17/this-game-challenges-you-to-guess-which-year-a-photo-was-taken; page blocked for me, used the search summary). Vestige and Throwbacks are iOS apps with no rank data (https://apps.apple.com/us/app/-/id6755485286). An arXiv study found users are more accurate on relative comparisons (65.9%) than on exact years (25.6%) (https://arxiv.org/html/2505.22031v1). Hard traction figures: not found.
- IP owner: indie creators; photo rights vary.
- China: no WeChat equivalent found (the only 2017-era hit was an old-photo recovery mini program, https://www.ifanr.com/minapp/879351).
- Verdict: **unique**. Concern: photo licensing, and 老照片 content must pass content review. INFERENCE: it should skew toward the over-40 audience, which is about 40% of WeChat mini game users (https://www.ithome.com/0/956/526.htm, 2026-05-28).

**4. The Higher Lower Game (stat comparison streak)**
- Loop: two items with a stat (search volume, price, population); pick the higher; one wrong answer ends the streak.
- Session: 30-90 s.
- Social: beat the friend's streak; one-thumb.
- Traction: 2016 viral hit, #1 on the App Store, 4.8M plays in its first month, and a developer claim of 500M+ plays later (https://www.codecomputerlove.com/blog/the-higher-lower-game-goes-viral; STALE, developer figure). Nothing newer found.
- IP owner: Code Computerlove (Manchester agency). The mechanic is generic.
- China: no dedicated title found in my search; the search returned nothing. Common in short video as a format (INFERENCE, unverified).
- Verdict: **partially present / not verified**. The streak-then-ad loop suits IAA; the risk is that it is trivial to clone.

**5. Clues by Sam (non-guessing deduction daily)**
- Loop: a 4x5 grid of 20 suspects; deduce innocent or criminal from clues; guessing is not allowed.
- Session: 5-10 min (INFERENCE).
- Social: shared daily puzzle (a share grid is not confirmed).
- Traction: launched May 2025; the designer claims 50,000+ DAU (self-reported; https://en.wikipedia.org/wiki/Clues_By_Sam; the Wikipedia article is nominated for deletion).
- IP owner: Johannes Ahvenniemi / Ad Artis Oy.
- China: no daily WeChat title found. Chinese grid-deduction apps exist but are level-based (e.g. 脑洞解谜王者 on Xiaomi, https://game.xiaomi.com/game/62440510).
- Verdict: **partially present**. The session is long for a one-thumb game and it needs hand-made puzzles.

**6. Daily Games rooms (playdaily.org) and Songless / Logo Game**
- Press-release-level evidence only (2026-10-12; https://www.globenewswire.com/news-release/2026/10/12/3379127/0/en/daily-games-introduces-free-live-multiplayer-puzzle-platform-with-no-daily-limits-or-sign-up.html). It offers live rooms with six-digit codes. Treat as a paid-promotion signal, not traction. Verdict: not assessed.

### B. Party, async and chat-native

**7. Wavelength (spectrum-dial co-op guessing)**
- Loop: one player sees a hidden target on a spectrum (for example "hot-cold") and gives a clue; the team places a dial; the closer, the higher the score. 100% cooperative, 2-10 players.
- Session: 5-15 min as a board game (INFERENCE). A WeChat adaptation could shrink to 60 seconds.
- Social: group consensus is the game.
- Traction: mobile app since February 2022, 5M+ downloads, 4.8 rating from 60K reviews, Apple Editors' Choice; free with $0.99-4.99 content packs (https://toucharcade.com/games/wavelength, https://www.wargamer.com/wavelength/free-app; download count undated, older than 12 months possible).
- IP owner: Wavelength LLC (the original designers). Do not use the name.
- China: 默契 Q&A mini programs exist (2017 era, https://www.ifanr.com/364968, https://www.ifanr.com/minapp/892528), and they are question-based, not dial-based. No dial version found.
- Verdict: **partially present** (the "默契" territory is occupied; the dial mechanic is not seen). Adaptation idea: curated spectra only, and the clue goes out as a normal WeChat voice or text message in the group, so there is no user-generated text inside the game.

**8. Gartic Phone / Skribbl / Drawing Phone (telephone drawing)**
- Loop: write a prompt, the next person draws it, the next guesses the drawing, and so on; the full chain reveals at the end.
- Session: 5-15 min, needs 4+ players at once (2 to 30 players).
- Social: the funny reveal is the product.
- Traction: Gartic Phone iOS app first released 2026-07-23, outside the US top 30 (https://mwm.ai/apps/gartic-phone/6788498566). Ahrefs estimates are unreliable. Pixelary on Reddit reached up to 60,000 DAU (Reddit Eng, Dec 2024; https://pol1.lr.ggtyler.dev/r/RedditEng/comments/1h5yc05/lessons_from_making_rpixelary; STALE-ish).
- IP owner: Gartic (Brazil); Pixelary by Reddit/u/Oppdager.
- China: 你画我猜 is a popular, saturated mini program class (https://www.233leyuan.com/a/13817810731, promotional aggregator). The telephone chain variant was not found.
- Verdict: **saturated for the base, partially present for the chain variant**. UGC drawings need moderation, and drawings are hard to review in real time. Not recommended for launch.

**9. Imposter / Undercover word games**
- Loop: pass the phone, one player lacks the word, discuss and vote.
- Traction: dozens of App Store clones; one listing claims "as seen on TikTok", no download figures (https://apps.apple.com/us/app/-/id6747424464).
- China: 谁是卧底 is already an established category. Mini programs, group bots, and QQ bots exist (https://www.233leyuan.com/a/11305385306, https://pypi.org/project/nonebot-plugin-who-is-spy/).
- Verdict: **saturated**.

**10. In-chat micro-games: TikTok DM, Threads, Instagram**
- TikTok: send one emoji, tap it, and cross a stream by bouncing off alligators; low-stakes competition in the same chat; global rollout reported 2026-04-02 (https://www.mediapost.com/publications/article/414047/tiktok-gamifies-dms-with-emojis-pixelated-alligat.html). Threads: basketball flick prototype found 2026-01-04, not public (https://techcrunch.com/2026/01/06/threads-is-developing-in-message-games). Instagram: bouncing emoji paddle game in DMs in 2025 (same TechCrunch/MediaPost summaries). Traction numbers: not found.
- IP owner: ByteDance, Meta.
- China: the format is a one-thumb duel, which overlaps the 擂台 flick duel in the 2026-10-14 shortlist. WeChat's group-chat card is the equivalent entry point.
- Verdict: **not a new idea, a confirmation** that chat-embedded duels are where the platforms are heading.

**11. GamePigeon Word Hunt (timed letter-grid duel)**
- Loop: both players race on the same letter grid for about 80 seconds, finding as many words as possible.
- Traction: one blog calls it the most popular GamePigeon game; no usage data (https://www.lilachbullock.com/gamepigeon-imessage-every-game-explained/; weak source). GamePigeon remains iPhone-only.
- IP owner: GamePigeon (Vitalii Zlotskii) per general knowledge, not verified in my sources.
- China: Chinese 成语 grid games exist, but they are level-based single-player (成语连连看, 成语消消消; https://apps.apple.com/ch/app/%E6%88%90%E8%AF%AD%E8%BF%9E%E8%BF%9E%E7%9C%8B-%E5%8D%95%E8%AF%8D%E6%B6%88%E5%8E%BB%E8%BF%B7%E5%AE%AB/id6745440039). A same-board timed duel was not found.
- Verdict: **partially present**. Runner-up: a 60-90 s 成语 swipe duel on a shared daily board.

**12. Netflix TV party games (phone as controller)**
- Launched 2025-10-09 with LEGO Party, Boggle Party, Pictionary: Game Night, Tetris Time Warp, Party Crashers; GIFTED meme party game in 2026 (https://techcrunch.com/2025/10/09/netflix-is-letting-users-play-games-on-their-tv-screens, https://www.whats-on-netflix.com/news/netflix-games/netflix-launches-new-meme-party-game-gifted/). No player counts.
- China: not applicable for a mini game (needs TV casting). Verdict: not feasible for us now.

### C. Co-op, clicker and AI formats

**13. Peak (co-op climbing, friend-slop)**
- 1M copies in 6 days, 5M in under a month, 10M+ sold, 170K+ concurrent players; map rotates every 24 hours; 4 friends (https://www.gosugamers.net/entertainment/news/75783-co-op-climbing-indie-hit-peak-sells-one-million-copies-in-just-six-days-on-steam, https://www.tweaktown.com/news/107179/peak-confirmed-to-have-sold-more-than-10-million-copies/index.html). IP: Aggro Crab / Landfall.
- Sessions are long (INFERENCE) and PC. For WeChat only an async "relay" adaptation makes sense, which is a speculative idea. Verdict: **not assessed in China**; real-time sync is expensive.

**14. Pop Cat style country/region click race**
- popcat.click launched 2020-12-11; Taiwan, Thailand and Malaysia fought for first in August 2021 (https://amp.knowyourmeme.com/memes/sites/popcatclick, https://www.taiwannews.com.tw/en/news/4271778). STALE (2021).
- China: click-count mini programs with group and national boards exist (放鞭炮啦, https://www.ifanr.com/minapp/983541). A province/dialect version was not found.
- Verdict: **partially present**; seasonal and click-farmable. INFERENCE: a short regional PK could work as a festival event, not a year-round game.

**15. Infinite Craft (AI combine-anything)**
- Launched January 2024 on neal.fun, 15M+ views on the launch post in a week (https://en.wikipedia.org/wiki/Infinite_Craft, https://knowyourmeme.com/memes/sites/infinite-craft). STALE. Revenue: not found.
- China: word-combination tower defense (赵云与阿斗, 文造兵器) is already the July 2026 trend (https://www.36kr.com/p/3923287949176195, from the earlier report). Generative-AI filing burden in China (INFERENCE).
- Verdict: **partially present, high compliance cost**. Skip.

### Rejected on compliance or fad grounds
- **Gas-style rate-your-friends**: Gas hit 1M DAU in two months, then Discord shut it down in November 2023 (https://techcrunch.com/2023/10/19/discord-kills-gas-anonymous-compliments-app-bought-nine-months-ago). In China, WeChat suspended 匿名聊聊 in 2017 for suspected induced sharing (https://www.ifanr.com/minapp/838502 and search summary), and in 2021 inspected 85 mini programs in the 饭圈 ranking/voting crackdown (https://www.guancha.cn/culture/2021_08_25_604424.shtml). Verdict: avoid.
- **Telegram tap-to-earn (Hamster Kombat)**: players fell from 300M to about 41M, reportedly inflated by farming for an airdrop (https://thedefiant.io/news/nfts-and-web3/hamster-kombat-loses-259-million-players-amid-86-drop-blockchain-gaming-01e15538). Crypto/earning mechanics are out of scope.
- **Roblox brainrot / Steal a Brainrot**: already covered (fad decay) in the 2026-10-14 report.

## 3. Verdict table

| # | Candidate | China status | Verdict |
|---|---|---|---|
| 1 | Contexto-style semantic hot/cold | Web-only precedent (WordRank), no WeChat title found | Unique |
| 2 | Loldle-style attribute daily | None found | Unique (original content) |
| 3 | Which Year photo-year guess | None found | Unique |
| 4 | Higher/Lower streak | Not found, likely exists as a short-video format | Partially present (unverified) |
| 5 | Clues by Sam deduction | Level-based apps only | Partially present |
| 7 | Wavelength dial | 默契 Q&A exists, dial not found | Partially present |
| 8 | Telephone drawing | 你画我猜 saturated | Saturated (base), partial (chain) |
| 9 | Imposter / 谁是卧底 | Many | Saturated |
| 10 | In-chat duel micro-games | Overlaps shortlist #3 (擂台) | Already covered |
| 11 | Word Hunt duel | Level-based 成语 grids | Partially present |
| 13 | Peak co-op | Not assessed | Unclear |
| 14 | Region click race | 放鞭炮-type | Partially present |
| 15 | AI combine | 文造兵器 trend | Partially present, compliance heavy |

## 4. Opportunities: the top 5 for WeChat

All five are INFERENCE-based ranking; the sourced facts are above. All need a mainland entity, 备案 and 软著 as in the earlier shortlist (`research/2026-10-14-social-minigames/04-legal-compliance.md`, not re-read here).

**1. 语义热冷 (Contexto-style) - best IAA fit**
- Group-chat dynamic: a whole group attacks one shared daily word and posts their hot/cold ladder. "群里谁最快逼近" is a natural thread. Cooperative, so no losers.
- Compliance: curated answer list, no UGC, and blocklisted words in guesses (guess input is free text, so run a sensitive-word filter on input; this is the main risk). No gambling elements.
- IAA: unlimited guesses allow a rewarded hint ("reveal a nearer word") and interstitials between puzzles. This is the highest ad-slot count per session of the five.
- Cost: low. The cost is a Chinese embedding model and precomputation.
- Signal: Semantle/Contexto prove retention for hard-core players, but there are no mass-market figures. The risk is difficulty: Semantle is described as punishingly hard (https://www.techradar.com/news/semantle-is-the-wordle-clone-that-will-have-you-pulling-your-hair-out). Needs a hint ladder.

**2. 猜将 (Loldle-style attribute guess with 三国 characters) - best synergy**
- Group-chat dynamic: same daily answer; the colour-grid result card; arguments about "怎么会是蜀国". Group leaderboard by guess count.
- Compliance: public-domain characters. No UGC. Use our own stat model, not Koei ratings.
- IAA: rewarded hint (reveal one attribute), streak protection.
- Cost: lowest of the five if 点将台 data exists. It also feeds players into 点将台 via cross-promotion. A daily-seed backend is shared.
- Signal: format proven by Loldle/Pokedle (no usage figures), but the IP was fan IP. Risk: it is a thin format that can be cloned in days.

**3. 老照片猜年份 - best for the 40+ majority**
- Group-chat dynamic: nostalgia ("这是哪年?") draws comments from parents and older relatives. Easy to play together by shouting out guesses.
- Compliance: the main risk is image rights and content review. Use self-shot, commissioned, AI-generated-and-labelled, or licensed images, and avoid political-event photos. VERIFY AIGC labelling rules.
- IAA: five rounds per session, with a rewarded hint (reveal a digit) as in Which Year.
- Signal: a 2025 web hit and iOS apps, with no figures. Over-40 users are about 40% of WeChat mini game users (https://www.ithome.com/0/956/526.htm).
- Risk: content cost (about 5 images a day) and a high nostalgia-skew that may not travel to under-30s.

**4. 群友刻度盘 (Wavelength-style dial) - best pure group dynamic**
- Group-chat dynamic: one person sets the target and sends a voice or text clue in the chat (outside the game); everyone else sets a dial, and the card shows the group average and who was closest. The group chat itself is the lobby.
- Compliance: no UGC inside the game. Spectra are curated ("冷-热", "土-潮", "便宜-贵"). No gambling elements.
- IAA: weaker (one setup per round), so use rewarded video for unlocking extra spectra and a bonus round.
- Signal: Wavelength has 5M+ downloads and Apple Editors' Choice. Risk: the sync between the clue-giver and group needs good async design, and 默契 Q&A mini programs occupy part of the territory.

**5. 比一比 (Higher/Lower streaks with Chinese stats) - best raw session loop**
- Group-chat dynamic: "我连对 14 个，你呢" challenge cards; the group streak board. One-thumb, 30-60 s.
- Compliance: use data we own or can cite (city stats, public-domain data). Avoid celebrity and brand comparisons that could be defamatory or ad-like.
- IAA: every failed run is a natural interstitial/rewarded "continue" point; the highest session count of the five.
- Signal: the original is a proven mass hit (500M+ plays developer claim, 2016, STALE), but it has no new traction data. Risk: easiest to clone; low uniqueness.

Runners-up: 成语 Word Hunt duel (#11), Clues by Sam-style deduction in Chinese (#5).

## 5. Risks, saturation, policy

- **Weak traction evidence**: only Peak, Wavelength and Clues by Sam have numbers, and each of those is a developer or secondhand claim. The daily "-dle" family has no published usage data. We would be building on format logic, not on measured demand. INFERENCE: validate each with a one-week group-chat test before art or content spend.
- **Clone speed in China**: new mechanics are cloned within weeks (word-combo tower defense example in the earlier report). Thin formats (Higher/Lower, 猜将) have no moat except content and the daily group loop.
- **Share rules**: WeChat penalizes forced sharing and sharing for rewards; the credit score applies to the whole developer entity (woshipm, 2019, STALE; current rule text not found: https://www.woshipm.com/pd/3613313.html). All five concepts use result cards and group boards and do not gate rewards on sharing.
- **Free-text input** (Contexto-style) needs a sensitive-word filter; drawing UGC (Gartic) needs image moderation, so it is not suited to launch.
- **Voting/ranking sensitivity**: the 2021 饭圈 crackdown targeted voting and ranking mini programs. Avoid ranking real people and celebrity content.
- **Fan IP**: Loldle-style games on Riot or Pokemon content are takedown-prone. Use public-domain content.
- **Daily-puzzle monetization**: low ad volume per user for one-puzzle-a-day formats (the earlier report's point). Only unlimited-guess (Contexto) and streak (Higher/Lower) formats create many ad slots.

## 6. Open questions

1. Does any WeChat or Douyin mini game already do Contexto, Loldle or Which Year style play? A human should search in-app for 语义猜词, 猜年份, 每日猜 and 热冷 (my web searches cannot see mini program stores).
2. Which Chinese embedding model and licence can we use for the semantic ranking (open-source, size, accuracy on idioms)? A sourced benchmark was not researched.
3. Image licensing options for 老照片 content (public archives, commissioned, AI-generated and labelled).
4. Does the group leaderboard API (`getGroupCloudStorage` or equivalent) still work in 2026? Carried over from the earlier report; still unverified.
5. Real traffic figures for Loldle, Contexto and Which Year (SimilarWeb or similar), since I found none.
6. Is the founder open to 猜将 as a companion to 点将台, or should it be a standalone launch?
