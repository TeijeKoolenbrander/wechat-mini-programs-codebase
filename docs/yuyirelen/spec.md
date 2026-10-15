# 语义热冷 (working title): spec, v1 complete release

Status: **v1 complete-release scope, 2026-10-15.** The founder approved building this game (YR-D0). Under constitution Article 4 there are no phases, MVP cut-offs or interim approvals. The flow is: v1 build → QA → CTO review → release pack → Founder Handoff (§19) → founder device pass (§17.1) → submission.
Type: WeChat 小游戏 (mini game). Slug: `yuyirelen`. Author: product-ux.
Companions: `docs/yuyirelen/direction.md` (vision, pillars, art, Article 3 check, risks) and **`docs/yuyirelen/decisions.md`** (every product decision, with date, reason and alternatives; cited here as **PO-n**).
Reference implementation: `docs/dianjiangtai/spec.md` (cited as **[DJT §n]**) and `apps/dianjiangtai/`. This game **copies** patterns and code from there into `apps/yuyirelen/`. It never `require`s across apps (§14.6).

Labels:
- **[SPIKE]**: documented but not yet run on a real phone. It must pass the founder's device pass before submission (§17.1). Each one has a specified fallback.
- **[COMPLIANCE]**: compliance-sensitive (user data, sharing rules, ads, content safety).
- **UNVERIFIED**: I could not confirm it from an official or primary source.
- **INFERENCE**: our own judgement.

Scope: everything in §1-§20 is v1. §21 is the post-launch backlog and is out of scope.

---

## 0. Summary of key decisions

Full rationale is in `decisions.md`.

| ID | Decision |
|---|---|
| PO-1 | **One daily secret word for everyone** (Beijing date). Unlimited guesses. Each guess returns its **rank** (1 = the answer) and a temperature. |
| PO-2 | **Dictionary-only input.** Guesses must come from our curated vocabulary (about 30,000 words). Out-of-vocabulary text is rejected **on the device**, is never sent, and is never stored. So no free-text UGC exists. |
| PO-3 | **Simple-score fix (answers the kept-ideas-alt Simple risk):** the first move is a tap (6 热身词); every guess shows 5 tappable **联想词** (the guessed word's own neighbours, which are answer-independent); typing uses the native keyboard with dictionary autocomplete; hints are offered automatically. The whole game can be played with taps alone. |
| PO-4 | **Free hint ladder** at steps 10/20/30/40. **Every hint counts as one step.** No rewarded hints in the ranked daily; rewarded hints only in unranked play. |
| PO-5 | **Score = 步数 (steps).** Group and friend boards rank solvers by steps, then hints, then finish time. In-progress players appear as a live "race" row (best rank so far, no words). |
| PO-6 | **No runtime AI.** Similarity ranks are precomputed offline. **Embedding model: BAAI `bge-large-zh-v1.5` (MIT, licence confirmed on the official model card on 2026-10-15).** Fallback: `Qwen3-Embedding-0.6B` (Apache-2.0, model card checked the same day). |
| PO-7 | **Vocabulary source: jieba `dict.txt` (MIT)**, filtered by POS, frequency and character set, then a sensitive-word filter and a reviewed blocklist. No person, place, organisation or brand names. |
| PO-8 | **Rank lists stay server-side.** The client never holds the answer, its rank list or the answer bank. The `guess` cloud function checks every guess. |
| PO-9 | **Answers:** common, neutral, unambiguous words, each passing a bot difficulty gate and a reviewed top-100 neighbour list. Per-answer **synonyms** also count as solving. |
| PO-10 | **Every share is a challenge** on the same puzzle. The card shows the step count and a temperature chart, **never a word**. Nothing is rewarded for sharing. |
| PO-11 | **Archive (往期) plus practice pool (练习)** give unlimited unranked play, which is the main ad inventory (rewarded hints, capped interstitials). |
| PO-12 | **Streak = consecutive published days with a solved daily.** No rewards, no freezes, no reminders. |

---

## 1. Goal, target user, scope

**Goal.** Launch a complete, polished daily word game for WeChat: everyone hunts the same hidden word, each guess says how close it is in meaning, and groups compare how many steps each member took. It is the first Contexto/Semantle-style **daily** on WeChat that we know of (UNVERIFIED in-app: the founder's search, H10). Success is measured after launch by KPIs (§15.1); there is no validation gate (Article 4).

**One-sentence rule (shown on the how-to sheet):**
> 猜今天的秘密词：每猜一个词，告诉你它离答案第几近，**第 1 名就是答案**。

**Target user.** WeChat users aged 24-40 and 40+, many of them casual. They play in short gaps, often arriving from a group card. They know everyday Chinese words, type Chinese every day in WeChat, and don't know game jargon. Portrait, one thumb, large text, no timers.

**Session target.** Daily puzzle: **2-4 minutes median**, held there by the hint ladder (§4.4). Archive and practice: unlimited, each about 2-4 minutes.

**Package budget** ([DJT §1]): main package ≤ 4 MB, including the open data domain folder; total ≤ 30 MB. v1 ships the vocabulary (about 240 KB as a `.js` module), a traditional-to-simplified character map (about 15 KB) and code. No images beyond UI icons, no remote images and no CDN.

**Feature scope (all v1)**

| Feature | v1 | Notes |
|---|---|---|
| Daily puzzle (今日一词), one per Beijing date, ranked | Yes | §4, §5 |
| Guess by tap: 热身词, 联想词, autocomplete | Yes | §4.2, PO-3 |
| Guess by typing (native keyboard, dictionary-only) | Yes | §4.2, PO-2 |
| Guess ladder sorted by closeness, temperature bands | Yes | §4.3 |
| Free hint ladder (4 hints) | Yes | §4.4 |
| Synonyms count as solving | Yes | §4.5 |
| Give up (shows the answer) | Yes | §4.6 |
| Reveal: answer, nearest 100 words, day stats | Yes | §8.4 |
| Share card / challenge (spoiler-free temperature chart) | Yes | §8.5, §9 |
| Group board (race) and friend board, server-authoritative | Yes | §11 |
| Streaks | Yes | §8.12 |
| Archive (all past dailies) and practice pool, unranked | Yes | §5.3 |
| Rewarded hint (unranked only), interstitial (capped), banner (boards, off by default) | Yes | §12 |
| Large-text and high-contrast modes | Yes | §8.11 |
| Anomaly flags (observe-only), rate limits | Yes | §14.5 |
| Save card to album, subscribe messages, group co-op ladder, 朋友圈 share | **No** | PO-19; backlog §21 |

---

## 2. Core loop, step by step

1. **Open** → home shows 今日一词 · 第 N 期 and a big 开始猜 button (or 继续猜 / 已猜中).
2. **First guess by tap.** The play screen shows 6 **热身词** chips (for example 天气 · 美食 · 工作 · 动物 · 旅行 · 家). Tap one. That is guess 1.
3. **See the result.** The word appears pinned at the top as "刚猜" with its rank ("第 1,284 名"), a temperature bar and a band word (冷/温/热/烫/沸). It also drops into the **ladder**, sorted with the closest word at the top.
4. **Next guess, three ways (all one thumb):**
   - tap one of the 5 **联想词** chips under the latest guess (words near *that guess*; tap any ladder row to see its chips instead);
   - tap 输入 to open the native keyboard; type; tap a dictionary suggestion (or press 完成 on an exact match);
   - tap a hint when one is offered.
5. **Repeat** until a guess is rank 1 (or a listed synonym). That's 猜中: a short gold "命中" animation, then the reveal.
6. **Stuck?** Hints unlock at steps 10, 20, 30 and 40 (§4.4). 放弃 is always available and shows the answer.
7. **Reveal:** the answer, your step count, your temperature chart, "最接近的 100 个词" (your guesses highlighted), and day stats ("今日 2,315 人猜中 · 中位数 21 步 · 你比 64% 的人少用了步数").
8. **Next actions (all optional):** 分享成绩 · 看群榜/好友榜 · 再来一题 (archive or practice, unranked).

A daily session is about 15-30 steps, at roughly 5-8 seconds per step, so about 2-4 minutes (INFERENCE; verified after launch by `solve.durationMs`, §15).

---

## 3. Similarity data (offline, precomputed) [COMPLIANCE]

### 3.1 Principles
- **No generative AI and no runtime model calls.** No model runs on the client or in cloud functions. Rankings are computed **offline** by our pipeline (§3.7) and imported as data. Cloud functions only look numbers up.
- For **each answer word**, the pipeline produces its **full rank list over the fixed vocabulary**: `ranks[vocabIdx] = rank of that word for this answer` (1 = the answer itself).
- **Rank lists, the answer bank and answer words never reach the client** (§3.8).
- **Input is in-vocabulary only.** Nothing a user types that isn't a vocabulary word ever leaves the device. Only vocabulary words are shown to anyone, so there is no UGC to moderate (PO-2).

### 3.2 Vocabulary (about 30,000 words)

**Source (PO-7):** **jieba `dict.txt`**, from the jieba repository (`github.com/fxsjy/jieba`), which states "MIT License" (checked 2026-10-15). It gives a word, a frequency count and a POS tag per line. A word list with counts is factual data; the MIT licence covers its redistribution. We keep the MIT notice in `apps/yuyirelen/THIRD_PARTY_NOTICES.md` (§3.9).
**Optional supplement:** THUOCL (Tsinghua) category lists 食物 and 动物, which the repo describes as MIT and "可用于研究与商业" (checked 2026-10-15). They are used only if the coverage check (step 7) finds everyday nouns missing, and only through the same filters.
**Rejected sources:** CC-CEDICT (CC BY-SA, share-alike), wordfreq data (CC BY-SA), SUBTLEX-CH (academic terms), HSK lists (copyright unclear). See decisions PO-7.

**Build rules (in order, all scripted in `tools/pipeline/build_vocab.py`):**
1. **Length:** 1-4 characters.
2. **Characters:** every character is in the 通用规范汉字表 一级字表 (3,500 common characters). No Latin letters, digits or symbols.
3. **POS keep:** `n` (common noun), `v`, `vn`, `a`, `an`, `ad`, `d` (only if 2+ characters), `t` (time words such as 早上, 春天), `s` (place words such as 门口; not place *names*). **POS drop:** `nr`, `nrt`, `nrfg` (person names), `ns` (place names), `nt` (organisations), `nz` (other proper nouns), `m`, `mq`, `q` (numerals and measure words), `r` (pronouns), `p`, `c`, `u`, `e`, `y`, `o`, `x`, `eng`, `i` and `l` (idioms and set phrases: 成语 give "unfair" ranks, research risk 2).
4. **Frequency:** keep the most frequent words that survive steps 1-3, up to 40,000 candidates.
5. **Sensitive filter (§3.3).**
6. **Human-style review pass** (§3.3, step 4).
7. **Coverage check:** a reviewer list of 500 everyday words (foods, animals, household items, weather, jobs, emotions, school, sports, transport, nature) must be ≥ 98% present. Missing ones are added from THUOCL 食物/动物 or a reviewed manual add-list, through steps 1-6.
8. **Size gate:** final **V between 20,000 and 40,000** (target 30,000 ± 5,000). The hard upper bound is 65,535 (ranks are stored as uint16).
9. **Output:** `vocab.v<N>.txt`, one word per line, sorted by frequency (descending). The line number is `vocabIdx`. The file is committed (it is public data, not a spoiler) and shipped to the client and to the functions as a `.js` module (§14.6). `vocabVersion` = N (v1 ships `vocabVersion` 1).

### 3.3 Sensitive-word filter [COMPLIANCE]
Four layers. The filter lists are **build inputs only**: they are never shipped in the client or the functions.
1. **Public blocklist:** `konsheng/Sensitive-lexicon` (GitHub). Third-party write-ups describe it as MIT; **licence UNVERIFIED** against the repo's LICENSE file (PO-8a). Because the list is only a private build input (we don't distribute it), the licence exposure is low. If its LICENSE turns out not to permit this, drop it; layers 2-4 still apply.
2. **Our own category blocklist** (`tools/pipeline/blocklist/*.txt`, written by product-ux, reviewed by QA): politics and the state (leaders, organs, movements, territorial terms, historical political events), sex and body-explicit terms, violence, weapons, drugs, gambling (赌, 押, 下注, 彩票 and similar), crime methods, mass death and disasters, discrimination and insults, religion, cults and superstition, ethnic, regional and nationality identity terms, disease stigma, brands, companies and products, celebrities, vulgar internet slang and homophone evasions, and death/funeral terms. Match is **exact word or contains a blocked substring** (substring list kept short to avoid over-blocking, for example a single 死 is not a substring rule).
3. **Identity-adjacent watchlist:** about 200 basic people words that stay in the vocabulary (妈妈, 女孩, 老人, 医生…). Their 联想词 (top-5 neighbours, §4.2) are reviewed by hand, because they are shown to everyone.
4. **Review pass:** two reviewers read the full surviving list (about 30,000 words; INFERENCE ≈ 20 hours each at 1,500 words per hour) and strike anything sensitive, vulgar, ambiguous with a sensitive second meaning (for example 小姐), or a brand. Reviewers are the studio's product-ux and QA agents working to a written rubric (`tools/pipeline/REVIEW.md`), plus the **founder's spot-check** of a random sample (H8). Struck words go to the blocklist so a rebuild keeps them out.
5. **Post-launch hardening (optional, §21):** once published (2,000,000 `msgSecCheck` calls per day, versus 100 per day before publishing, kept-ideas §0), run the full vocabulary through `security.msgSecCheck` v2 once from an ops cloud function and remove anything not `pass`.

### 3.4 Embedding model (PO-6)

| Candidate | Licence | Status | Verdict |
|---|---|---|---|
| **BAAI `bge-large-zh-v1.5`** (1024 dims, Chinese) | **MIT**; model card: "The released models can be used for commercial purposes free of charge." | **Confirmed** on the official Hugging Face model card, 2026-10-15 | **Primary** |
| BAAI `bge-small-zh-v1.5` (512 dims) | MIT (same family) | Third-party listings only; same project licence. UNVERIFIED on its own card | Not needed (offline compute cost is trivial) |
| **Alibaba `Qwen3-Embedding-0.6B`** (1024 dims, multilingual) | **Apache-2.0** | **Confirmed** on the official model card, 2026-10-15 (C-MTEB mean 66.33) | **Fallback**, and the bake-off rival |
| Tencent AI Lab Chinese word embeddings (static word vectors, 12M words) | Not stated on the official page | **UNVERIFIED** (page checked 2026-10-15: no licence text) | Rejected until a licence is published |
| fastText `cc.zh.300` | CC BY-SA 3.0 | Background knowledge, UNVERIFIED | Rejected: share-alike may reach our derived rank tables |
| `shibing624/text2vec-base-chinese` | Apache-2.0 per its card | UNVERIFIED (not fetched) | Not needed |
| Chinese-Word-Vectors (Li et al.) | unknown | UNVERIFIED | Rejected |

**How the primary is used.** Each vocabulary word is embedded as the bare word (no instruction prefix) and L2-normalised. Similarity is the cosine (dot product). For an answer `a`, every vocabulary word is ranked by cosine to `a`, descending. Ties break by `vocabIdx` (lower wins). The answer is rank 1.

**Model bake-off (pipeline step, decides primary vs fallback):** on 40 candidate answers, build the top-20 neighbour lists with both models. Three reviewers rate each list blind, 1-5, for "do these feel related in meaning?". We also measure the **character-overlap ratio** (the share of the top-20 sharing a character with the answer). **Keep bge-large-zh-v1.5 unless Qwen3-Embedding-0.6B scores ≥ 0.3 higher on the mean rating**, or ties within 0.3 with a ≥ 10-point lower overlap ratio. The choice and the scores are recorded in `decisions.md` before the answer bank is built. A model switch later means rebuilding every unused bank entry.

**Licence obligations:** MIT and Apache-2.0 both allow commercial use. We keep both notices in `THIRD_PARTY_NOTICES.md` and in the 软著 materials. The rank data we ship to cloud functions is derived output, not the model; we include the notice anyway (INFERENCE: conservative).

**Not AIGC (INFERENCE).** The model is used offline to compute numbers. It generates no text, images or audio, and nothing it outputs is presented as generated content. No AIGC label or generative-AI filing applies. The algorithm is not a recommendation service (it doesn't select content for users), so INFERENCE: 算法推荐备案 does not apply. Release records this in its rules check; the founder may confirm with counsel (H13).

### 3.5 Answer rules (PO-9)
An answer word must be:
- in the vocabulary, **2 characters** (≥ 85% of answers) or 3 characters; no single characters (too polysemous) and no 4-character words;
- **common:** frequency rank ≤ 8,000 in the vocabulary;
- **concrete or everyday:** nouns preferred (≥ 70%), with some verbs and adjectives; categories rotate (food, animals, home, nature, weather, school, work, sport, transport, feelings, seasons, tools);
- **neutral:** none of the §3.3 categories; nothing about illness, death, disaster, money-making, alcohol, tobacco; no political or historical anniversaries;
- **unambiguous:** one dominant meaning (no 东西 thing/east-west, no 意思);
- **fair:** passes the difficulty gate (§3.6) and the neighbour review.

**Neighbour review (per answer).** The **top-100 list is shown publicly** on the reveal (§8.4), so a reviewer reads all 100 and rejects the answer if any neighbour or juxtaposition is embarrassing, stereotyping or suggestive, or if fewer than 3 of the top 10 are "obviously related". We cannot edit a rank list; we reject the answer instead.

**Synonyms (per answer).** The reviewer may list **up to 3 exact synonyms** from the vocabulary (番茄 ↔ 西红柿, 母亲 ↔ 妈妈). Guessing one counts as solving (§4.5). A word is a synonym only if it can replace the answer in almost every sentence.

### 3.6 Difficulty gate (bots, offline) and targets
The pipeline's `bot_gate.py` simulates two players per candidate answer, with the real hint ladder (§4.4) and the real 联想词 rule (§4.2):
- **Chip-walker bot** (a model of an engaged tap-player): starts from one of the day's 6 热身词, then each step guesses one of the 5 联想词 of its current best word (uniformly random among the 5), taking each hint as soon as it unlocks. 200 runs per answer.
- **Typist bot** (a model of a poor player): guesses random words weighted by frequency from the top 5,000, taking hints as soon as they unlock; after hint 4 it switches to chip-walking. 200 runs.

**Gate (all must hold, PO-9):**

| Metric | Window |
|---|---|
| Chip-walker median steps | **10-30** |
| Chip-walker p90 steps | ≤ 45 |
| Typist median steps | ≤ 60 |
| Both bots: share of runs solved within 80 steps | ≥ 95% |

Each answer is tagged `easy` (chip median 10-17), `medium` (18-24) or `hard` (25-30). **The daily schedule** never puts two `hard` days in a row, puts at most 2 `hard` per week, and never repeats a category on consecutive days.

**Human difficulty targets (post-launch KPIs, §15.1):** median steps to solve the daily **15-30**; **≥ 80%** of daily starters solve; **≤ 10%** give up; median daily session **2-4 minutes**. If the live median drifts outside 15-30 for 7 days in a row, the CTO retunes the gate window or the hint thresholds (a `configVersion` bump, applied from the next day).

### 3.7 Offline build pipeline
Lives in `apps/yuyirelen/tools/pipeline/` (Python 3.11, pinned `requirements.txt`: `sentence-transformers`, `numpy`; run with `python -I`). Model weights are downloaded into a local cache outside the repo and are **never committed**.

```
1 build_vocab.py      jieba dict.txt + 通用规范汉字表 + blocklists  -> vocab.v1.txt (+ report: counts per filter)
2 embed.py            vocab.v1.txt + model                         -> emb.v1.npy  (V x 1024 float32, ~123 MB; local only)
3 bakeoff.py          40 candidates, both models                   -> bakeoff sheet for reviewers (local only)
4 near.py             emb                                          -> near.v1.bin  (V x 20 uint16, nearest neighbours of every word; committed)
5 candidates.py       vocab + answer rules (§3.5)                  -> candidate list with category tags (local only)
6 ranks.py            emb + candidates                             -> per-answer ranks (V uint16 each)
7 bot_gate.py         ranks + near + config                        -> gate report per answer
8 review_sheet.py     ranks                                        -> top-100 lists for the neighbour review + synonym fields
9 build_bank.py       accepted answers + review results            -> bank.import.jsonl (answer_bank import; local only, then deleted)
10 schedule.py        bank + rules (§3.6)                          -> the order daily entries are consumed (stored as `seq` in the bank)
```

- **Spoiler rule:** steps 5-10 outputs contain answers. They are **never committed**, are stored only on the machine running the build, and are deleted after the founder imports them (H7). Only aggregate reports (counts, gate pass rates, no words) are committed under `docs/yuyirelen/pipeline-reports/`.
- **Determinism:** fixed model revision hash, fixed vocabulary, fixed seeds in the bots. Rebuilding gives byte-identical `near.bin` and ranks. The pipeline writes a manifest (`vocabVersion`, model id and revision, `configVersion`, SHA-256 of each output).
- **Compute (INFERENCE):** embedding 30k short words on a laptop CPU takes minutes; the 30k × 30k neighbour table is one chunked matrix multiply (about 10^12 FLOPs, minutes); ranks for 1,000 answers take seconds.
- **Re-check of the server data:** `cloudfunctions/scripts/verify-bank.js` re-reads the import file and checks every entry: `ranks` is a permutation of 1..V, `ranks[wordIdx] == 1`, synonyms are in the vocabulary, the `vocabVersion` matches, gate fields are within the windows. It refuses to write the final import file otherwise ([DJT §5.2] prepare-bank pattern).

### 3.8 Serving (server-side only) and size estimate

| Item | Where | Size (V = 30,000) |
|---|---|---|
| Vocabulary `vocab.v1` | client main package (`.js` module) and every function that needs it | ~240 KB (30k × ~2.3 chars × 3 bytes + newlines) |
| Traditional → simplified map (characters of the 3,500 list only) | client | ~15 KB |
| Neighbour table `near.v1.bin` (top 20 per word, uint16) | functions `guess`, `near`, `useHint` (bundled); **not** in the client | V × 20 × 2 B = **1.2 MB** |
| One answer's rank array (uint16 per vocab word) | `answer_bank.ranks`, base64 | 60 KB raw, **~80 KB** per document |
| Answer bank at launch: ≥ 90 daily + ≥ 300 practice (target 365 + 600) | cloud DB `answer_bank` | 390 × 80 KB ≈ **31 MB** (target 965 entries ≈ 77 MB) |
| Embeddings | offline only, never shipped | ~123 MB float32 |
| Per guess, request / response | network | ~100 B / ~400 B |

- **Lookup:** `guess` maps the word to `vocabIdx` with the puzzle's vocabulary, loads the answer's `ranks` (one document read, then **cached in function memory** per warm instance, an LRU of 32 answers ≈ 2 MB), and returns `ranks[vocabIdx]`. The daily answer is read once per instance per day.
- **The client never receives** `answerRef`, the answer word (until the player finishes), `ranks`, `top100` (until finished), or `near.bin` as a whole.
- **Calls per player per daily:** about 20-35 (`guess` ≈ 25, hints, start, board, track). At 10,000 daily players that is about 300,000 function calls per day. Cloud Development quotas for our plan are **UNVERIFIED** ([DJT §17] #20); backend measures in the device pass (§17.1, item 6) and the founder picks the plan (H6, money).
- Database document size limit and total capacity: UNVERIFIED for our plan; an 80 KB document is far below common limits (INFERENCE). If documents must be smaller, the fallback is storing each rank array as a cloud-storage file (`cloud://`) referenced by the bank entry, downloaded once per warm instance.

### 3.9 Licences and notices
`apps/yuyirelen/THIRD_PARTY_NOTICES.md` lists: jieba (MIT), BAAI bge-large-zh-v1.5 (MIT) or Qwen3-Embedding-0.6B (Apache-2.0) as chosen by the bake-off, THUOCL (MIT) if used, the 通用规范汉字表 (state standard, a character list), OpenCC-derived character map if used (Apache-2.0, UNVERIFIED; otherwise our own map built from the Unicode Unihan `kSimplifiedVariant` field, Unicode licence). The release pack copies it into the 软著 materials.

---

## 4. Rules

### 4.1 Puzzles
- **Kinds:** `daily` (id `d<YYYYMMDD>`, ranked on its date), `archive` (a past daily, played after its window closed, unranked) and `practice` (id `p<n>`, from the practice pool, unranked).
- **One play per puzzle per player.** A play holds the ordered guesses, steps, hints, best rank and status `playing | solved | gaveup`. A finished puzzle can be viewed but not replayed.
- **Daily window:** from 00:00 BJT on date D until **D+1 00:30 BJT** (midnight grace, [DJT §5.2]). Guesses on the daily after the window still work but the play becomes **unranked** (`ranked: false` from then on), with the notice "今日一词已结束，本局不计入榜单". The date key always comes from **server time** via `core/date.js` (explicit UTC+8 arithmetic; functions also set `TZ=Asia/Shanghai`).

### 4.2 Making a guess
Three input paths, all ending in the same `guess` call with a **vocabulary word**:
1. **热身词 (warm-ups):** 6 chips, shown only before the first guess. They are drawn deterministically per date from a fixed, reviewed **starter list** of 120 broad words (`core/starters.js`) with `sub(dateKey, "warmups")` (mulberry32, copied from [DJT §5.1]). They are **never chosen with knowledge of the answer** (no leak). Practice puzzles use `sub("p"+n, "warmups")`.
2. **联想词 (association chips):** after each guess, up to **5 chips** show the guessed word's own nearest neighbours from `near.bin`, skipping words already in the ladder (first 5 unguessed of the top 20). They do **not** depend on the answer, so they leak nothing. Tapping any ladder row selects that word and shows its chips ("顺着「火锅」想："). If the answer happens to be a neighbour, tapping it solves the puzzle; the bot gate (§3.6) includes this.
3. **Typing:** 输入 opens the native keyboard (`wx.showKeyboard({defaultValue:'', maxLength: 8, multiple:false, confirmHold:true, confirmType:'done'})`). The system IME handles pinyin. `wx.onKeyboardInput` gives the current text. The client normalises it (trim, remove spaces and punctuation, full-width to half-width, traditional to simplified per character) and shows up to **6 dictionary suggestions**: an exact match first, then words that start with the text, by frequency. Tapping a suggestion submits it. Pressing 完成 submits only on an exact vocabulary match; otherwise a local toast "词库里没有「xx」，换个常用词试试" appears and **nothing is sent** (PO-2). After a submit the keyboard stays open and the text is cleared (`wx.updateKeyboard`) for rapid typing; 收起 closes it. [SPIKE: keyboard APIs on device, §17.1 item 2]

**Duplicates:** a word already in the ladder is not sent again. The row flashes and the toast reads "已经猜过「火锅」了 · 第 152 名". No step is counted.

**Steps:** each accepted guess = 1 step. Each hint = 1 step (§4.4). `steps` is computed by the server.

**Limits [COMPLIANCE: anti-abuse] (PO-14):** at most **40 guesses per minute** per player (`RATE_LIMITED`, toast "猜得太快了，歇一下") and **600 guesses per puzzle** (`GUESS_LIMIT`, "这一题猜得够多了，试试提示或看答案"). 600 is effectively unlimited for humans (the typist bot's p99 is far lower) but stops scripts from walking the whole vocabulary.

### 4.3 Rank, temperature and bands
- **Rank** `r` ∈ 1..V. Shown exactly, with thousands separators ("第 1,284 名").
- **Temperature** `T = round(100 × (1 − ln r / ln V))`: rank 1 = 100, rank V = 0. For V = 30,000: rank 10 ≈ 78, rank 100 ≈ 55, rank 1,000 ≈ 33. It sets the bar fill and the chart height. No number is shown next to the bar (keeps rows simple); the share chart uses it as height.
- **Bands** (by rank, shown as a word **and** a colour, never colour alone):

| Band | Rank | Word | Colour (default; frontend-ui confirms contrast) |
|---|---|---|---|
| 命中 | 1 | 命中 | gold `#C9973A` |
| 沸 | 2-10 | 沸 | crimson `#A3222B` |
| 烫 | 11-100 | 烫 | vermilion `#D2492A` |
| 热 | 101-500 | 热 | amber `#E08A2E` |
| 温 | 501-2,000 | 温 | sand `#C9B27A` |
| 冷 | 2,001+ | 冷 | slate blue `#5E7FA3` |

This is a **thermometer** metaphor, hot = close, with our own palette and wording. It does not copy Semantle's −100..100 similarity score or Contexto's green/yellow/red bars and layout (direction §7).

### 4.4 Hint ladder (PO-4)
Four free hints, each unlocking once `steps` reaches its threshold. Unlocking only makes the hint *available*; the player taps to use it. **Each used hint adds 1 step.**

| Hint | Unlocks at step | Gives | Cap |
|---|---|---|---|
| 提示 1 | 10 | a word | rank ≤ 300 |
| 提示 2 | 20 | a word | rank ≤ 50 |
| 提示 3 | 30 | **the answer's first character** ("首字：番") | — |
| 提示 4 | 40 | a word | rank ≤ 10 |

**Hint word rule** (server, `useHint`): target rank `t = min(cap, max(2, floor(best / 2)))`, where `best` is the player's best rank so far (V if no guess). Return the word at rank `t`. If it is already in the ladder or is a listed synonym, step to the next *closer* rank (t−1, …, 2) that is free; if none is free, step outward (t+1, …). **Never rank 1.** If `best` is already 2, word hints are not consumed: the button reads "已经只差一步了" and nothing changes. A hint word enters the ladder marked "提示" with its rank, and its 联想词 show like any guess.
**提示 3** shows the first character in the header ("首字：番") for the rest of the puzzle.
Thresholds and caps live in `core/config.js` (`configVersion`), identical on client and server.

**Rewarded hints (PO-4, §12):** only in **unranked** plays (archive and practice; also a daily played after its window). "▶ 视频提示" is available at any step, at most **3 per puzzle**, and uses the same rule with cap = none (pure halfway: `max(2, floor(best/2))`). It also counts as 1 step. **Never in a ranked daily**, so ads never buy rank.

### 4.5 Solving and synonyms
- A guess (or hint) with rank 1 solves the puzzle: status `solved`, and the response includes the answer word.
- A guess of a **listed synonym** (§3.5) also solves it: the row shows the synonym with "意思一样！", the answer is revealed ("答案是「番茄」"), and the step counts like a solve. Synonyms keep their real rank in the stored ladder; `solvedBy: 'synonym'` is recorded.

### 4.6 Give up
放弃 is in the play screen's top-right menu (next to 玩法, below the capsule row). Confirm dialog: "放弃后会显示答案。今日一词将记为未猜中，连续猜中天数会中断。" [放弃并看答案] [再想想]. In unranked play the dialog omits the streak line. Status becomes `gaveup`, and the reveal opens.

---

## 5. Modes and puzzle sources

### 5.1 Daily (今日一词)
- **Publishing:** the timer function `genDaily` runs at 23:00 BJT (`0 0 23 * * * *`) and creates tomorrow's `daily_puzzles` document with fixed `_id = YYYYMMDD`. It takes the unused `answer_bank` entry of pool `daily` with the lowest `seq` whose `vocabVersion` and `gateVersion` match the live ones, and marks it used in the **same transaction** ([DJT §5.2] idempotency pattern: a duplicate `add` of the fixed `_id` fails and rolls back). A lazy path in `getDaily` does the same if the timer missed. Issue number 第 N 期 = days since launch.
- **No live generation.** Answers can only come from the reviewed bank. If no entry is left, **no daily is published**: `DAILY_UNAVAILABLE`, an `[ALERT]` log and a `daily_gen` event with `failed: true`. Clients show "今日一词暂未发布" and practice still works.
- **Low-bank warning:** fewer than **30** matching daily entries left logs a warning, so the founder imports more in time (H7; the build team prepares a batch monthly).
- Each daily document holds `answerRef`, `issueNo`, `warmups`, `boardSalt` (16 random bytes for board hashes, [DJT §11.4]), `vocabVersion`, `configVersion`.

### 5.2 Ranked rules
A play on `d<D>` is **ranked** if it was started (first guess) within D's window. It stays ranked while guesses arrive inside the window; after D+1 00:30 BJT it turns unranked (§4.1). A ranked play feeds `daily_stats`, the boards and the streak when it finishes. One ranked play per openid per date (deterministic `_id`).

### 5.3 Archive (往期) and practice (练习)
- **Archive:** every published past daily, playable after its window closes, unranked. Answers are shown in the list only for issues the player has finished.
- **Practice:** a pool of ≥ 300 reviewed answers (`pool: practice`, public numbers 练习 #1, #2, …), unranked. It exists so new players (and launch day, when the archive is empty) always have more to play.
- **再来一题** (on the reveal and on home after the daily is done): opens the newest unplayed past daily; if none, the lowest-numbered unplayed practice puzzle. The archive screen lets players pick any issue.
- An unfinished archive or practice play resumes where it was left.

---

## 6. (Reserved)

## 7. (Reserved)

---

## 8. Screens and flows

General layout rules (copied from [DJT §8]):
- All content starts below the capsule: `navBottom = capsule.bottom + (capsule.top − statusBarHeight)`. Nothing is drawn or tappable in the capsule's row on the right. The in-game back is "‹ 返回" at the top left, level with the capsule.
- Primary actions sit in the bottom 40% of the screen (thumb zone), above the bottom safe-area inset, **except while the keyboard is open** (§8.2).
- Touch targets ≥ 48 × 48 pt. Body text ≥ 16 pt. The answer on the reveal ≥ 40 pt.
- Every network-backed area has loading, empty and error states. Errors always offer 重试. Practice stays available whenever the network is.
- Design width 375; must work from 320 to 430 wide and 568 to 932 tall.

### 8.1 Home

```
┌───────────────────────────────────┐
│ 9:41                    [ ··· ◎ ] │ ← capsule row: nothing on the right
│                                   │
│            语 义 热 冷              │
│        猜秘密词，越猜越热            │
│                                   │
│  ┌─────────────────────────────┐  │
│  │ 今日一词 · 第 128 期          │  │
│  │ 全国同一个词，第 1 名就是答案   │  │
│  │ 连续猜中 5 天                 │  │ ← only when streak ≥ 2
│  │      [    开 始 猜    ]       │  │ ← primary
│  └─────────────────────────────┘  │
│                                   │
│   [ 群榜 ] [ 好友榜 ] [ 往期 ] [ 玩法 ] │
│                                   │
│   声音 开/关                 设置    │
└───────────────────────────────────┘
```

| State | Daily card |
|---|---|
| Loading | skeleton, "正在取今日一词…" |
| Available (not started) | 开始猜 |
| In progress | "已猜 12 步 · 最近第 37 名" + 继续猜 |
| Solved | "今日 21 步猜中" + 查看答案; secondary 再来一题; subline "明日 0:00 换新词" |
| Gave up | "今日未猜中" + 查看答案; secondary 再来一题 |
| Unavailable (`DAILY_UNAVAILABLE`) | "今日一词暂未发布" + 练习一题 |
| Offline / error | "今日一词需联网获取" + 重试 |

- **First launch:** no login, no consent screen. The 玩法 sheet (§8.9) auto-opens once.
- **From a group card:** a line "来自群聊 · 查看本群今日战况" opens the group board ([DJT §9.2]).
- **设置:** sound, 显示 (大字模式 / 高对比度, §8.11), 用户隐私保护指引 (`wx.openPrivacyContract`), friend-data status line, 联系我们/反馈 (`wx.createFeedbackButton`).

### 8.2 Play

Keyboard closed (default):
```
┌───────────────────────────────────┐
│ ‹ 返回                   [ ··· ◎ ] │
│ 今日一词 第128期   已猜 12 步  玩法 ⋯ │ ← ⋯ = 放弃 / 玩法
│ 首字：番                            │ ← only after 提示 3
│ ┌ 刚猜 ─────────────────────────┐ │
│ │ 火锅   ■■■■■■■□□□  热  第 152 名 │ │
│ └───────────────────────────────┘ │
│ 顺着「火锅」想：                     │
│ [麻辣] [涮肉] [烧烤] [串串] [锅底]   │ ← 联想词 chips (tap = guess)
│ ─────────────────────────────────  │
│ 蔬菜   ■■■■■■■■□□  烫   第 37 名    │ ← ladder, closest first
│ 火锅   ■■■■■■■□□□  热   第 152 名   │   (tap a row = its chips)
│ 厨房   ■■■■■■□□□□  热   第 410 名   │
│ 提示·土豆 ■■■■■■□□□  热  第 300 名   │
│ 动物   ■■□□□□□□□□  冷   第 9,812 名 │
│   …(scrolls)                        │
│ ─────────────────────────────────  │
│ [ 提示 1 可用 ]     [   输 入   ]    │ ← primary row (thumb zone)
└───────────────────────────────────┘
```
The hint button carries a code-drawn lamp icon (no emoji).

Before the first guess, the 刚猜 card and chips are replaced by:
```
│ 先点一个词试试：                      │
│ [天气] [美食] [工作] [动物] [旅行] [家] │ ← 热身词
│ 或者 [ 输入 ] 你想到的词               │
```

Keyboard open:
```
┌───────────────────────────────────┐
│ ‹ 返回                   [ ··· ◎ ] │
│ 今日一词 第128期   已猜 12 步   收起  │
│ [番茄] [番茄酱] [番薯]               │ ← autocomplete (dictionary only)
│ ┌ 刚猜 ─────────────────────────┐ │
│ │ 蔬菜   ■■■■■■■■□□  烫  第 37 名  │ │
│ └───────────────────────────────┘ │
│ ─── native input bar (WeChat) ───  │
│ ┌────── system keyboard ────────┐ │
│ └───────────────────────────────┘ │
└───────────────────────────────────┘
```
The keyboard height comes from `wx.onKeyboardHeightChange` [SPIKE]. If unavailable, the client assumes the keyboard covers the bottom 50% and draws the strip and the 刚猜 card in the top 45%.

| State | Behaviour |
|---|---|
| Starting (`startPuzzle` / resume) | skeleton ladder, "正在展开题目…" |
| Ready, no guesses | 热身词 + 输入 |
| Waiting for `guess` | the submitted word shows in the 刚猜 card with a pulsing bar; chips and suggestions are disabled (≤ 5 s, then the error state) |
| Result | 刚猜 card updates; the row slides into place in the ladder; chips refresh |
| Duplicate | row flash + toast (§4.2); no call |
| Not in vocabulary (typed) | local toast; no call |
| `NOT_IN_VOCAB` from the server (version skew) | the same toast; logged as `guess_rejected{reason:'server_oov'}` |
| Hint locked | button "第 10 步后可用提示" (disabled style, still readable) |
| Hint available | "提示 1 可用" (highlighted); tap → `useHint` → word enters the ladder (marked 提示) |
| All hints used (ranked daily) | button "提示已用完" + menu still offers 放弃 |
| Unranked play | an extra "▶ 视频提示" button (≤ 3 per puzzle; §12) |
| Offline / timeout | "网络开小差了" + 重试 over the action row; the ladder stays visible; the pending word is retried with the same `clientGuessId` (idempotent) |
| `RATE_LIMITED` / `GUESS_LIMIT` | toast (§4.2) |
| Window closed mid-play (daily) | one-time banner "今日一词已结束，本局不计入榜单"; play continues unranked |
| Solved | 命中 animation (gold bar fills, short chime, `vibrateShort`), 1.2 s, then the reveal |
| Background / kill | state is server-side; on return `startPuzzle` resumes the same ladder |

**First play coach marks** (once, skippable): (1) on 热身词: "点一个词开始猜"; (2) on the first result: "名次越小越接近，第 1 名就是答案"; (3) on chips: "点联想词或自己输入，接着猜". Each ≤ 14 characters per line.

### 8.3 Give-up dialog
Native-style modal (§4.6). The 放弃 option sits in the ⋯ menu, never next to 输入 or a hint button.

### 8.4 Reveal (solved or gave up)

```
┌───────────────────────────────────┐
│ ‹ 首页                   [ ··· ◎ ] │
│ 今日一词 · 第 128 期                 │
│            番  茄                   │ ← ≥ 40 pt
│        21 步猜中 · 用了 1 次提示     │  (or "未猜中 · 最近第 3 名")
│  ▁▂▁▃▄▃▅▆▅▇▆▇█  (temperature chart)  │
│  今日 2,315 人猜中 · 中位数 21 步     │ ← ≥ 30 finishers
│  你比 64% 的人少用了步数              │
│  连续猜中 5 天                        │ ← daily, streak ≥ 2
│ [ 分享成绩 ]   [ 群榜/好友榜 ]        │
│ ─────────────────────────────────  │
│ 最接近的 100 个词                     │
│  2 西红柿 (同义)  3 土豆  4 黄瓜 …    │ ← your guesses highlighted
│   …(scrolls)                        │
│        [      再来一题      ]        │
└───────────────────────────────────┘
```

| State | Behaviour |
|---|---|
| Loading (`getReveal`) | the answer and your summary show at once (from the solve response); the list area shows a skeleton |
| Stats below 30 finishers | stats lines hidden |
| Reveal list error | "列表暂时打不开" + 重试; everything else works |
| Unranked play | header "往期 · 第 97 期" or "练习 #12"; no streak or percentile lines; stats shown for archive dailies |
| Gave up | the answer in the same size, label "答案"; summary "未猜中 · 最近第 N 名" |

### 8.5 Share card (canvas, 500 × 400, 5:4, [DJT §8.4])

```
┌──────────────────────────────┐
│ 语义热冷 · 今日一词 第128期     │
│                              │
│        21 步猜中               │  (or "未猜中 · 最近第 3 名")
│      用了 1 次提示              │
│  ▁▂▁▃▄▃▅▆▅▇▆▇█               │ ← one bar per step, height = T, colour = band
│  冷 ────────────────── 命中     │
│     同一个词，你几步能猜中？       │
└──────────────────────────────┘
```
- **Never any word** (guesses, hints, chips, the answer or the first-character hint): it is spoiler-free, so posting it in a group spoils nothing (PO-10).
- More than 60 steps: the chart buckets steps into 60 columns, each showing the column's highest temperature.
- Unranked: "往期 第97期" / "练习 #12".
- Render failure: a static fallback image from the package plus the text title.
- **Share title** (≤ 2 lines): "第128期我 21 步猜中，你几步？" or "第128期没猜中，你来试试？". No fake system text, no "@所有人", no exaggeration. [COMPLIANCE]

### 8.6 Challenge entry (from a card)

```
┌───────────────────────────────────┐
│                          [ ··· ◎ ] │
│        好友在第 128 期用了 21 步       │
│  ▁▂▁▃▄▃▅▆▅▇▆▇█                     │ ← their chart, no words
│   TA 的猜词路线在你完成后可见           │
│   (today's daily, not played:)       │
│   这就是今日一词，计入今日榜单          │
│        [     我来猜     ]            │
│        [   先去首页看看   ]           │
└───────────────────────────────────┘
```

| State | Behaviour |
|---|---|
| Loading | "正在展开…" skeleton |
| Not found | "这道题找不到了" + 去首页 |
| Own challenge | "这是你分享的成绩" + count of friends who finished it and their best steps |
| Already finished this puzzle | goes straight to the comparison (§8.7) |
| Today's daily, not yet started | "这就是今日一词，计入今日榜单" (it *is* the same daily puzzle; no special run type) |
| Past daily or practice | "往期题，不计入榜单" |
| Offline | "需联网展开" + 重试 |

### 8.7 Comparison (after finishing a challenged puzzle)
On the reveal, above the 100-word list: "你 18 步 · TA 21 步" with both charts side by side, and [看 TA 的猜词]: the sharer's ladder words in guess order. It is shown only because **the viewer has finished the puzzle** (server-enforced, §14.2). No names: we never collect any.

### 8.8 Group board (群榜) and friend board (好友榜)

```
┌───────────────────────────────────┐
│ ‹ 返回                   [ ··· ◎ ] │
│ 本群 · 今日一词 第128期               │
│ ┌───────────────────────────────┐ │
│ │ 1 (头像) 张三  14 步 · 提示0  连5 │ │ ← open data domain canvas
│ │ 2 (头像) 你    21 步 · 提示1      │ │   ranks from server values
│ │ ─ 正在猜 ─                       │ │
│ │ · (头像) 李四  已猜 9 步 · 最近第 6 名 │ │ ← the race: no words
│ │ ─ 未猜中 ─                       │ │
│ │ · (头像) 王五  最近第 41 名        │ │
│ │ ─ 未验证 ─                       │ │
│ │ · (头像) 赵六  未验证             │ │
│ └───────────────────────────────┘ │
│ 已有 7 人参与 · 成绩经服务器校验        │
│ [ 分享到本群 ] (voluntary)            │
│ ┌ banner (config, default off) ┐    │ ← ≥ 24 pt gap
└───────────────────────────────────┘
```
- **Server-authoritative ranks** ([DJT C3, §11]): rank numbers come only from `getBoard` rows. KV markers only make a player appear in WeChat's lists.
- **Order:** solved rows (steps ↑, then hints ↑, then finish time ↑) with rank numbers; then **正在猜** rows (best rank ↑) without numbers; then **未猜中** rows (best rank ↑); then **未验证** rows (KV marker with no server match). "连N" for streak ≥ 2.
- **No spoilers:** rows never contain words. A viewer who hasn't finished sees exactly the same rows (steps and ranks spoil nothing).
- The friend board is the same, titled "好友 · 今日一词", with your own row pinned at the bottom if it is off-screen.

States (copied from [DJT §8.6-8.7]): no group context (explainer "在群聊里点开本游戏的分享卡片，就能看到本群战况" + optional [分享到群]), group check in progress, group check failed, loading, ready, empty ("本群今天还没人开始猜" + 去猜), you haven't played ("未开始" + 去猜), server list unavailable ("榜单暂时打不开" + 重试; never fall back to ranking KV values), privacy not agreed, friend scope not granted, over the list cap (friend board `selfOnly`). Copy for the last three follows [DJT §8.6-8.7] with "战绩" replaced by "成绩".

### 8.9 How-to sheet (玩法)
Auto-opens once on first launch; reachable from home and the play menu. **Three lines and one picture**, dismissible:
1. 今天全国猜同一个秘密词。
2. 每猜一个词，告诉你它离答案第几近：**第 1 名就是答案**。越红越近，越蓝越远。
3. 点联想词或自己输入；卡住了就用提示。

Picture: a three-row mini ladder (冷 blue, 热 amber, 命中 gold). A second line under the picture: "每个提示也算一步。只能猜常用词，人名地名不算。"

### 8.10 Archive (往期)

```
┌───────────────────────────────────┐
│ ‹ 返回                   [ ··· ◎ ] │
│ 往期            最长连续猜中 12 天     │
│ ┌───────────────────────────────┐ │
│ │ 第128期 10月15日  今日 · 21步猜中  │ │
│ │ 第127期 10月14日  番薯 · 18步  ›  │ │ ← answer shown: finished
│ │ 第126期 10月13日  未玩  去猜 ›    │ │ ← no answer: not finished
│ │ 第125期 10月12日  进行中 9步 ›    │ │
│ │ …(30 per page, 加载更多)           │ │
│ │ 练习题  已完成 3 / 300   去练习 ›  │ │
│ └───────────────────────────────┘ │
└───────────────────────────────────┘
```
States: loading, ready, empty (launch day: "还没有往期，先去练习吧" + 练习), error ("往期需联网查看" + 重试). Tapping a finished issue opens its reveal; an unfinished one opens play.

### 8.11 Settings and display modes
Copied from [DJT §8.10]: **大字模式** (body ≥ 20 pt, ladder rows two lines high, chips wrap to two rows, buttons ≥ 56 pt) and **高对比度** (white background, black text, band colours switch to a darker set with white text, bars get a 2 pt outline; text ≥ 7:1, indicators ≥ 3:1). The default look meets 4.5:1 for body text. Neither mode changes the share card. First launch pre-selects 大字模式 if the system font setting is large and readable [SPIKE].

### 8.12 Streaks (PO-12)
- **Current streak** = consecutive *published* daily dates, ending today or yesterday, with a **solved ranked** daily. Yesterday's streak stays alive all of today.
- A ranked give-up resets it to 0. An unranked solve (after the window) does not count. Dates with no published daily are skipped.
- Computed only on the server (§14.3); the client only displays it.
- Shown on home and the reveal ("连续猜中 N 天", N ≥ 2), on boards ("连N") and in the archive header (best streak).
- **No rewards, no streak freeze or repair, no "快断了" copy, no notifications.** [COMPLIANCE]

### 8.13 Navigation map

```
 launch → Home ─开始猜/继续猜→ Play ─solve/give up→ Reveal ─┬─分享成绩→ native share sheet
            │                   ▲                          ├─群榜/好友榜
            ├─往期 → Archive ────┘ (unranked)               └─再来一题 → (interstitial?) → Play
            ├─群榜 / 好友榜 → Board (+banner?)
            └─玩法 / 设置
 card (c=<id>) → Challenge entry ─我来猜→ Play → Reveal (+comparison)
 card with shareTicket → joinGroup → Home (group line) → Group board
```

---

## 9. Share flows [COMPLIANCE: 诱导分享]

Rules (copied from [DJT §9]): every share starts from a user tap or the capsule menu; **no share ever grants anything** (no hints, no steps, no streak help, nothing); the UI never depends on share success; nothing is shared automatically; the rewarded-video fallback share page is disabled (§12). `wx.showShareMenu({menus:['shareAppMessage']})`, `wx.onShareAppMessage` and `wx.updateShareMenu({withShareTicket:true})` are set at startup. `isUpdatableMessage: false` is never passed in the same call.

### 9.1 Share = challenge (PO-10)
Tap 分享成绩 (only available after finishing) → `createChallenge({puzzleId})` → `shareAppMessage({title, imageUrl: card, query: "c=<challengeId>"})`. The query carries the id only. If `createChallenge` fails, share anyway with `query: "p=<puzzleId>"` and no comparison (toast-free; the recipient lands on that puzzle).
**Capsule-menu share** at any time: title "今天全国猜同一个词，来试试？", default card (logo, no result), query `s=m`.

### 9.2 Group detection
Exactly as [DJT §9.2] and [DJT §11.3]: `shareTicket` presence is the group signal; `wx.getGroupEnterInfo` → `joinGroup` (cloudID decryption server-side) → opaque `groupRef`. [SPIKE]

### 9.3 Entry routing

| Query | Destination |
|---|---|
| `c=<id>` | challenge entry (§8.6); with a ticket, `joinGroup` runs in the background |
| `p=<puzzleId>` | that puzzle (today's daily → play; past → archive play; practice → practice play) |
| `s=m` or none, with ticket | `joinGroup`; home with the group line on success |
| `wxad_fallback_share=1` | home; logged; grants nothing |
| malformed | home; logged |

A warm start with a new card while the keyboard is open or a guess is pending waits until the player returns home, then shows the toast "收到一张新的分享卡片".

---

## 10. (Reserved)

---

## 11. Leaderboards

**Server-authoritative**, copying [DJT §11] (decision C3 there) with these changes:
- **KV display marker:** after a ranked daily **finishes**, the client writes `d_<YYYYMMDD> = {"s":21,"h":1,"st":"solved"}` (or `"st":"gaveup"`) with `wx.setUserCloudStorage`. It is never trusted for ranking. In-progress players have no marker; they appear only through server rows (group `mode: group`/`full`, see below). Keys older than 7 days are removed.
- **`getBoard` payload:** `{dateKey, issueNo, salt, selfHash, mode, rows: [[h, st, n, hi, b, s, k?], …]}` where `h` = `hex(sha256(openid + "|" + salt)).slice(0,12)`, `st` = 1 solved / 2 playing / 3 gave up, `n` = steps, `hi` = hints used, `b` = best rank, `s` = finish time (or last-guess time for playing) in seconds after 00:00 BJT, `k` = streak if ≥ 2. Only **ranked** plays of `dateKey` are included. Rows carry no words and no lineups, so there is no spoiler lock on the board.
- **Matching** in the open data domain: as [DJT §11.4] (bundled pure-JS SHA-256 over each friend/group row's `openid` + salt). Playing rows from the server for members who have no KV marker are still matched: the open data domain gets `openid` for every friend/group row *if* WeChat returns rows without the key [SPIKE, DJT §11.2]; otherwise playing rows are shown only for members with a marker from a previous day. Fallback: the "正在猜" section shows a count only ("另有 3 人正在猜").
- **Cap and modes:** `boardListCap` 3,000 rows; above it the group board uses `mode: group` (members in `group_members`), the friend board `selfOnly` ([DJT §11.5]).
- **Privacy and friend scope flow:** exactly [DJT §11.6]: official privacy popup on the first privacy-interface call (the marker write after the first finished ranked daily, or the first board open); `scope.WxFriendInteraction` only from the board-open tap; refusal leaves the whole game playable; no re-prompting. [COMPLIANCE]
- **Fallbacks** if the device pass fails E1-E3: [DJT §11.8] (Ed25519-signed KV values, then B-lite).

---

## 12. Ads (IAA only) [COMPLIANCE]

| Placement | Format | Where | Trigger | Caps |
|---|---|---|---|---|
| 视频提示 | rewarded video | **unranked plays only** (archive, practice, a daily after its window) | tap "▶ 视频提示" | ≤ 3 per puzzle |
| Between puzzles | interstitial | 再来一题 from a reveal | after the 2nd, 4th, 6th… finished puzzle **of the session** | not before the player's 3rd lifetime finished puzzle; ≥ 120 s apart; ≤ 5 per day; never on the daily's play or reveal entry, never on a card-entry first puzzle, never mid-play |
| Board footer | banner | group and friend boards, `ready`/`empty` states only | — | config, **default off** |

- Caps live in `app_config.ads` with defaults in `core/config.js` and clamps (`everyNPuzzles ≥ 2`, `minLifetime ≥ 2`, `minGapSec ≥ 60`, `maxPerDay ≤ 8`) ([DJT §12]).
- Reward only on `onClose` with `isEnded === true`; closing early shows "完整观看才能获得提示".
- **No fill / load error:** grant the hint anyway, **once per puzzle**, with "暂无广告，本次免费"; a second failure on the same puzzle shows "暂无广告，请稍后再试" and grants nothing ([DJT D6] pattern).
- Every rewarded instance uses `wx.createRewardedVideoAd({adUnitId, disableFallbackSharePage: true})`. If `onLoad` reports `useFallbackSharePage: true`, treat it as no-fill.
- Interstitial `show()` rejections 2001-2003 are skipped silently (not counted, logged as `ad_error`).
- Ad buttons always show ▶ and the word 视频; no ad sits next to 输入, a free-hint button or 分享.
- Server trust: the server cannot verify a rewarded view. `useHint({source:'ad'})` is accepted only for unranked plays and only ≤ 3 per puzzle, so a forged call gains nothing ranked.
- **Stub mode** for QA ([DJT §12]): a 3-second "广告位（测试）" overlay; simulates 1004/1000 and 2001-2003. Off in production builds.

---

## 13. Client view models

All strings are pre-formatted by logic, not by rendering code. TypeScript-style notation; the code is plain JS.

```ts
// Home
{ daily: { state: 'loading'|'available'|'inProgress'|'solved'|'gaveup'|'unavailable'|'offline'|'error',
           issueNo: number, dateKey: string, puzzleId: string,
           steps?: number, best?: number, bestLabel?: string /* "最近第 37 名" */ },
  streak: { current: number, best: number, show: boolean /* current >= 2 */ },
  hasGroupContext: boolean, muted: boolean, showHowToOnce: boolean,
  settings: { largeText: boolean, highContrast: boolean, friendBoardEnabled: boolean } }

// Play
{ puzzleId: string, kind: 'daily'|'archive'|'practice', ranked: boolean,
  title: string /* "今日一词 第128期" | "往期 第97期" | "练习 #12" */,
  state: 'starting'|'ready'|'waiting'|'result'|'offline'|'error'|'solvedAnim',
  steps: number, hintsUsed: number, firstChar: string|null,
  warmups: string[] /* 6, only when steps == 0 */,
  latest: Row|null, ladder: Row[] /* sorted by rank asc */,
  selectedWord: string|null, chips: string[] /* <= 5 */,
  keyboard: { open: boolean, text: string, suggestions: string[] /* <= 6 */, heightPx: number|null },
  hint: { next: 1|2|3|4|null, state: 'locked'|'available'|'exhausted'|'atBest',
          label: string /* "第 10 步后可用提示" | "提示 1 可用" | "提示已用完" */ },
  adHint: { visible: boolean, left: number /* 0..3 */ },
  toast: string|null, banner: string|null /* "今日一词已结束，本局不计入榜单" */,
  coach: 0|1|2|3 /* 0 = none */ }
type Row = { word: string, rank: number, rankLabel: string /* "第 1,284 名" */,
             temp: number /* 0..100 */, band: 'hit'|'boil'|'scald'|'hot'|'warm'|'cold',
             bandLabel: string, isHint: boolean, isSynonym: boolean, isLatest: boolean }

// Reveal
{ puzzleId, kind, ranked: boolean, title: string, answer: string,
  outcome: 'solved'|'gaveup', summary: string /* "21 步猜中 · 用了 1 次提示" */,
  temps: number[] /* per step, in order */, bands: string[],
  stats: { show: boolean, line1?: string, line2?: string },
  streak: { show: boolean, label?: string },
  top: { state: 'loading'|'ready'|'error', items: { rank: number, word: string, mine: boolean, synonym: boolean }[] },
  compare: null | { mySteps: number, theirSteps: number, theirStatus: 'solved'|'gaveup',
                    theirTemps: number[], theirWords?: string[] },
  canShare: true, nextLabel: '再来一题' }

// Share card input
{ title: string, headline: string, subline: string, temps: number[], bands: string[], footer: string }

// Challenge entry
{ state: 'loading'|'ready'|'notFound'|'own'|'offline',
  puzzleId: string, kind: 'daily'|'archive'|'practice', issueLabel: string,
  owner: { status: 'solved'|'gaveup', steps: number, hints: number, temps: number[] },
  countsAsToday: boolean, alreadyFinished: boolean, own?: { finishers: number, bestSteps: number|null } }

// Board (main domain; rows are drawn by the open data domain)
{ kind: 'group'|'friend', state: 'noGroup'|'checkingGroup'|'loading'|'ready'|'empty'|'error'
       |'privacyDenied'|'scopeDenied',
  title: string, footer: string /* "已有 7 人参与 · 成绩经服务器校验" */, mode?: 'full'|'group'|'selfOnly',
  myLine?: string /* shown in denied states: "你今日 21 步猜中" */, bannerVisible: boolean }

// Archive
{ state: 'loading'|'ready'|'empty'|'error', bestStreak: number,
  items: { puzzleId: string, issueNo: number, dateLabel: string,
           status: 'today'|'solved'|'gaveup'|'playing'|'unplayed',
           answer?: string /* only when finished */, line: string }[],
  hasMore: boolean, practice: { done: number, total: number } }
```

---

## 14. Backend (WeChat Cloud Development)

Identity is always `OPENID` from `cloud.getWXContext()`, never from input ([DJT §14]). No user-info calls. **Every collection is deny-all** for client reads and writes (`database/rules.json`); all access goes through functions. Every function returns `{ok:true,…}` or `{ok:false, code, message}` and never throws to the client. Every function sets `TZ=Asia/Shanghai` and an explicit timeout. Uniqueness is enforced by deterministic `_id`s created with `add`; multi-document writes use `db.runTransaction`; counters use `db.command.inc` ([DJT §14] runtime rules). Secrets only in environment variables: `GROUP_REF_PEPPER`.

### 14.1 Collections

| Collection | Key fields | Notes |
|---|---|---|
| `answer_bank` | `_id` (random 16 hex; never derived from the word), `pool: daily/practice`, `seq` (daily order) or `practiceNo`, `vocabVersion`, `gateVersion`, `wordIdx`, `word`, `synonyms: [idx]`, `ranks` (base64 Uint16Array, length V), `difficulty`, `category`, `gate: {chipMedian, chipP90, typistMedian, solve80}`, `reviewedBy`, `used`, `usedFor?`, `importedAt` | **spoiler data**: imported in the console by the founder (H7) from the pipeline's file; never committed; never returned to clients except the word and top-100 after finishing |
| `daily_puzzles` | `_id: YYYYMMDD`, `issueNo`, `answerRef`, `warmups[6]`, `boardSalt`, `vocabVersion`, `configVersion`, `createdAt`, `source: 'bank'` | fixed `_id` makes `genDaily` idempotent |
| `plays` | `_id: <puzzleId>_<openid>`, `openid`, `puzzleId`, `kind`, `ranked`, `dateKey?`, `guesses: [{w: idx, r, t, src: warmup/chip/suggest/typed/hint/adhint, cg: clientGuessId}]`, `steps`, `hintsUsed: [1..4]`, `adHints`, `best`, `status`, `solvedBy?: answer/synonym`, `startedAt`, `lastAt`, `finishedAt?`, `vocabVersion`, `configVersion` | one play per player per puzzle; source for boards (index `puzzleId + ranked`) |
| `player_stats` | `_id: openid`, `curStreak`, `bestStreak`, `lastSolvedDate`, `dailiesSolved`, `dailiesGaveUp`, `finishedTotal` (all kinds; used for interstitial gating), `flags7d`, `suspect`, `updatedAt` | streak per §8.12 rules |
| `daily_stats` | `_id: YYYYMMDD`, `solved`, `gaveUp`, `stepsHist[81]` (0-79, 80+), `started` | atomic `inc` at finish |
| `challenges` | `_id: challengeId` (8-char base32, keyed hash of `puzzleId + openid`), `ownerOpenid`, `puzzleId`, `status`, `steps`, `hints`, `temps[]`, `createdAt`, `finishers` (count), `bestSteps` | one per owner per puzzle (repeat calls return the same id) |
| `group_members` | as [DJT §14.1] | |
| `events` | as [DJT §14.1] | |
| `anomalies` | `_id: <openid>_<puzzleId>_<kind>`, `kind: fast_solve/burst/scripted/limit`, `detail`, `ts` | observe-only (§14.5) |
| `app_config` | `_id: 'live'`, `ads: {interstitial:{…}, banner:{enabled, adUnitId}, rewardedUnitId, interstitialUnitId}`, `updatedAt` | edited in the console; missing → defaults/off |
| `rate_limits`, `meta` | as `apps/dianjiangtai/cloudfunctions/README.md` | |

### 14.2 Cloud functions

| Function | In | Out | Notes |
|---|---|---|---|
| `getDaily` | `{}` | `{dateKey, issueNo, puzzleId, serverNow, warmups, my:{status, steps, best, hints}, myStreak:{current,best}, features}` | lazily publishes today's puzzle if the timer missed (bank only); `DAILY_UNAVAILABLE` if none. Never returns `answerRef`. Timeout 10 s |
| `genDaily` (timer `0 0 23 * * * *`) | | | next day's puzzle from the bank (§5.1); idempotent; low-bank warning < 30; `FORBIDDEN` if called with an OPENID. Timeout 20 s |
| `startPuzzle` | `{puzzleId}` or `{next:true}` | `{puzzleId, kind, ranked, title fields, warmups, vocabVersion, configVersion, play:{guesses:[{word, r, t, src}], steps, hintsUsed, adHints, best, status, firstChar?}}` | creates the play on the first guess, not here (opening without guessing doesn't count as playing). `{next:true}` resolves 再来一题 (§5.3). For a finished play also returns `answer`. Timeout 5 s |
| `guess` | `{puzzleId, word, clientGuessId, src}` | `{r, t, band, steps, best, dup, solved, solvedBy?, answer?, near:[≤5], hintUnlocked?:k, ranked}` | normalises and maps `word` with the puzzle's vocabulary (`NOT_IN_VOCAB`, text **not stored or logged**); creates the play on the first guess (ranked if inside the window); idempotent on `clientGuessId`; a duplicate word returns the existing row with `dup:true` and no step; transaction appends the guess; on solve: status, `finishedAt`, `daily_stats`, `player_stats`, streak, and the answer word. Rate limits (§4.2). Timeout 5 s |
| `near` | `{puzzleId, word}` | `{near:[≤5]}` | the word's top unguessed neighbours from `near.bin` (answer-independent). Timeout 3 s |
| `useHint` | `{puzzleId, k?: 1-4, source: 'ladder'/'ad'}` | `{kind:'word'/'firstChar', word?, r?, t?, ch?, steps, near?}` or `{ok:false, code}` | ladder: `k` must be the next hint and `steps ≥ threshold`; ad: only unranked plays, ≤ 3; never rank 1 (§4.4). Codes `HINT_LOCKED`, `HINT_LIMIT`, `AT_BEST`, `RANKED_NO_AD`. Timeout 5 s |
| `giveUp` | `{puzzleId}` | `{answer, steps, best}` | needs ≥ 1 step; idempotent |
| `getReveal` | `{puzzleId}` | `{answer, top:[[word, rank, isSyn]×100], stats?:{finishers, medianSteps, pctBetter}}` | **only if the caller finished this puzzle** (else `REVEAL_LOCKED`); stats only if ≥ 30 finishers. Top-100 is computed from `ranks` and cached per answer. Timeout 5 s |
| `getHistory` | `{cursor?}` | `{items:[{puzzleId, issueNo, dateKey, my?:{status, steps}, answer?}], nextCursor, bestStreak, practice:{done,total}}` | 30 per page; `answer` only for the caller's finished puzzles |
| `createChallenge` | `{puzzleId}` | `{challengeId}` | caller must have finished the puzzle; deterministic id |
| `getChallenge` | `{challengeId}` | `{puzzleId, kind, issueNo?, practiceNo?, owner:{status, steps, hints, temps}, own, countsAsToday, alreadyFinished, ownerWords?}` | `ownerWords` only if the caller has finished that puzzle (and is not the owner) |
| `joinGroup` | as [DJT §14.2] | | copied |
| `getBoard` | `{kind, dateKey, groupRef?}` | §11 payload | ranked plays of `d<dateKey>`; date must be today or yesterday; 30 s in-memory cache |
| `track` | as [DJT §14.2] | | copied; rejects any prop named `text`, `input` or `query` (no typed text in analytics) |
| `cleanup` (timer `0 0 4 * * * *`) | | | 180-day retention: `plays`, `challenges`, `events`, `anomalies`, `rate_limits`, `group_members` (by `lastSeen`), `player_stats` (by `updatedAt`); keeps `daily_stats`, `daily_puzzles`, `answer_bank`; daily anomaly roll-up |

**Error codes:** `UNAUTHENTICATED`, `FORBIDDEN`, `PUZZLE_NOT_FOUND`, `NOT_IN_VOCAB`, `FINISHED` (guess on a finished play), `RATE_LIMITED`, `GUESS_LIMIT`, `HINT_LOCKED`, `HINT_LIMIT`, `AT_BEST`, `RANKED_NO_AD`, `REVEAL_LOCKED`, `DAILY_UNAVAILABLE`, `NOT_FINISHED` (createChallenge), `CHALLENGE_NOT_FOUND`, `NOT_MEMBER`, `NOT_GROUP`, `BAD_CLOUDID`, `SERVER_CONFIG`, `INTERNAL`.

### 14.3 Server validation summary
- The server computes every rank, step, hint and status. The client sends only a word string, a client guess id and an input-source tag.
- A guess on a puzzle that isn't published or isn't in the past/practice → `PUZZLE_NOT_FOUND` (no future dailies).
- `ranked` is decided by server time at the first guess and turns false after the window.
- Streak update (inside the solve transaction): let `prev` = the latest `daily_puzzles._id` before `dateKey`. If `lastSolvedDate == prev`, `curStreak + 1`, else 1; `bestStreak = max`. A ranked give-up sets `curStreak = 0`. Unpublished dates have no document, so they are skipped.

### 14.4 Spoiler rules (server-enforced)
1. `answer`, `top`, `synonyms` and `ownerWords` are returned only to a caller whose play on that puzzle is finished.
2. `answerRef` and `ranks` are never returned.
3. `getHistory` returns `answer` only for the caller's finished puzzles.
4. Boards and share cards contain no words.

### 14.5 Anomaly flags (observe-only, [DJT §14.5] pattern)
| Kind | When |
|---|---|
| `fast_solve` | ranked daily solved in ≤ 3 steps with no hints |
| `burst` | a `RATE_LIMITED` response |
| `scripted` | ≥ 100 guesses within 120 s on one puzzle |
| `limit` | `GUESS_LIMIT` reached |
Flags never change a result, rank or streak. ≥ 5 flags in 7 days sets `suspect` for manual review only. The 04:00 roll-up writes `anomaly_daily`.

### 14.6 Code layout (copy, never import across apps)
```
apps/yuyirelen/
  game/
    game.js, game.json, project.config.json
    core/      config.js, date.js, rng.js, temp.js (T, bands), normalize.js, vocab.js (generated: module.exports = "…"),
               t2s.js (char map), starters.js, hints.js (thresholds, target-rank rule)   ← shared with functions by copy
    js/        main.js, controller.js, vm.js, api.js, mock-server.js, keyboard.js (new), suggest.js (new),
               ads.js, share.js, privacy.js, odc.js, analytics.js, store.js, audio.js, util.js
    js/render/ layout.js, theme.js, widgets.js, overlay.js, home.js, play.js, reveal.js, shareCard.js,
               challenge.js, board.js, archive.js, howto.js, settings.js, fmt.js
    openDataContext/ (copied from 点将台, row format changed)
  cloudfunctions/ common/, data/ (near.v1.bin), <fn>/…, scripts/ (sync-core.js, verify-bank.js), tests/, database/rules.json
  tools/pipeline/ (Python, §3.7), THIRD_PARTY_NOTICES.md
```
- **Copied from `apps/dianjiangtai/`** (then adapted): `core/date.js`, `core/rng.js`, `js/ads.js`, `share.js`, `privacy.js`, `odc.js`, `api.js`, `mock-server.js` pattern, `analytics.js`, `store.js`, `vm.js`/`controller.js` pattern, `render/layout.js`, `theme.js`, `widgets.js`, `overlay.js`, `board.js`, `settings.js`, `howto.js`; cloud functions `joinGroup`, `track`, `getBoard` (rows changed), `cleanup`, `common/store.js`, `scripts/sync-core.js` and the test harness.
- **WeChat mini games can only `require` `.js` files.** Data files the game needs at runtime (vocabulary, character map, starters) are generated as `.js` modules (`module.exports = …`). `near.bin` is read by functions with `fs` (Node), not by the game.
- A drift test (as in 点将台) fails if a function's `core/` copy differs from `game/core/`.

---

## 15. Analytics events

Sent through our `track` function (batched; flushed on reveal, on hide and every 20 s), copied from [DJT §15]. Every event has a top-level `sessionId`, `clientTs`, and common props `isNewUser`, `vocabVersion`, `configVersion`, `appVersion`. **No event ever contains typed text** (out-of-vocabulary input is counted, never recorded).

| Event | Props | When |
|---|---|---|
| `session_start` | `scene`, `fromCard: none/challenge/puzzle/menu`, `hasShareTicket` | cold start or new session |
| `card_open` | `cardKind`, `hasShareTicket`, `challengeId?` | entry with share query (once) |
| `puzzle_open` | `puzzleId`, `kind`, `ranked`, `source: home/archive/next/card` | play screen shown |
| `puzzle_start` | `puzzleId`, `kind`, `ranked` | first accepted guess |
| `guess` | `puzzleId`, `step`, `band`, `src: warmup/chip/suggest/typed`, `msSinceLast` | accepted guess result shown |
| `guess_rejected` | `reason: oov/duplicate/server_oov/rate/limit`, `len` (characters typed, number only) | rejected input |
| `keyboard_open` | `puzzleId`, `step` | 输入 tapped |
| `chips_select` | `puzzleId`, `fromRow: latest/older` | ladder row tapped to show its chips |
| `hint_unlock` | `puzzleId`, `k` | a hint becomes available |
| `hint_use` | `puzzleId`, `k?`, `source: ladder/ad`, `step`, `rank?` | hint shown |
| `give_up` | `puzzleId`, `kind`, `steps`, `best` | confirmed |
| `solve` | `puzzleId`, `kind`, `ranked`, `steps`, `hints`, `adHints`, `durationMs`, `solvedBy`, `srcMix: {warmup, chip, suggest, typed}` | solve shown |
| `reveal_view` | `puzzleId`, `maxListRank` | reveal closed (how far the list was scrolled) |
| `share_tap` | `kind: result/menu/group_invite`, `puzzleKind?`, `steps?` | share API called |
| `challenge_created` / `challenge_open` / `challenge_finish` | `challengeId`, `puzzleKind`, `countsAsToday?`, `mySteps?`, `theirSteps?` | |
| `board_view` | `kind`, `state`, `mode?` | |
| `group_join`, `privacy_result`, `friend_scope_result`, `board_write` | as [DJT §15] | |
| `archive_view` | `items`, `state` | |
| `next_puzzle` | `fromKind`, `toKind` | 再来一题 |
| `ad_request` / `ad_show` / `ad_reward` / `ad_close_early` / `ad_error` | `placement: hint/interstitial/banner`, `stub`, `errCode?` | |
| `interstitial_show` | `finishedThisSession` | |
| `streak_shown` | `current`, `where` | |
| `display_setting` | `largeText`, `highContrast`, `source` | |
| `error` | `where`, `code` | |
| Server: `daily_gen` | `dateKey`, `bankLeft`, `failed?` | `genDaily` |
| Server: `board_list` | `dateKey`, `kind`, `mode`, `rows`, `bytes` | `getBoard` |
| Server: `anomaly_daily` | counts per kind | `cleanup` |

### 15.1 KPIs (post-launch, no gate)
- **Difficulty:** median `solve.steps` on ranked dailies **15-30**; solve rate (`solve` ÷ `puzzle_start`, ranked) **≥ 80%**; give-up rate ≤ 10%; median `solve.durationMs` **2-4 min**.
- **Simple:** share of guesses by tap (`src` warmup/chip/suggest) ≥ 50%; ≥ 90% of new users make a first guess within 30 s of `puzzle_open` (from `clientTs`).
- **Addictive:** D1 ≥ 35% (launch target 40%), D7 ≥ 15%; finishers who play ≥ 1 more puzzle in the session ≥ 40%; median streak among D7 retainers ≥ 3.
- **Social:** share rate (`share_tap` result ÷ `solve` + `give_up`) ≥ 10%; card-open-to-start ≥ 30%; board views per daily finisher ≥ 0.3.
- **Ads:** rewarded completion rate; interstitials per DAU ≤ 1.5.

---

## 16. Privacy data inventory [COMPLIANCE]

| Data | Purpose | Source | Stored | Retention |
|---|---|---|---|---|
| OpenID | identify plays, one ranked daily, boards, challenges | cloud function context | `plays`, `player_stats`, `challenges`, `group_members`, `events`, `anomalies` | 180 days, then deleted by `cleanup` |
| Game records: the vocabulary words you guessed, ranks, steps, hints, times | scoring, resume, boards, reveal highlights, comparison | gameplay | `plays`, `challenges` (temperatures only), `daily_stats` (aggregate) | 180 days; aggregates kept |
| Typed text that is not a vocabulary word | none | keyboard | **never leaves the device**; not stored, not logged | n/a |
| Result marker `{s,h,st}` | appear on friend/group boards | `setUserCloudStorage` (微信朋友关系) | WeChat | 7 days |
| Friend/group nickname, avatar, openid, marker | render boards | open data domain (微信朋友关系 + `scope.WxFriendInteraction`) | **not received by us** | n/a |
| openGId and membership | group board | `getGroupEnterInfo` → `joinGroup` (cloudID) | `group_members` (client sees `groupRef` only) | 180 days after last seen |
| Hashed daily rows | board ranking | derived | sent to clients per day (new salt daily) | per day |
| Streak stats | home, reveal, boards | derived | `player_stats` | 180 days after last update |
| Anomaly flags | abuse and bug detection | server | `anomalies` | 180 days |
| Analytics events (no typed text) | KPIs, bugs | client | `events` | 180 days |
| Display settings | accessibility | user | device storage only | until changed |
| Device platform | layout, debugging | `getDeviceInfo` | `events` | 180 days |
| Ad data | ad delivery | WeChat ad SDK | not by us | per WeChat |

**Not collected:** nickname or avatar to our servers, phone, location, album, camera, microphone, clipboard, contacts, ID number, payment data, free text of any kind.
**用户隐私保护指引 declarations:** **微信朋友关系** only (purpose: "用于在好友榜、群榜中展示你和好友的今日成绩"). No album declaration (v1 has no save-to-album, PO-19). The guide text also describes game records and the 180-day retention. Data stays in mainland WeChat Cloud.
**Minors and 防沉迷:** no UGC, no chat, no strangers' content, no payments; platform anti-addiction applies to the game category; no notifications. [COMPLIANCE]

---

## 17. Platform items and the device pass

| # | Item | Status | Fallback |
|---|---|---|---|
| 1 | `wx.showKeyboard` / `onKeyboardInput` / `onKeyboardConfirm` / `updateKeyboard` / `hideKeyboard` in a mini game | official docs list `showKeyboard` with `defaultValue`, `maxLength`, `multiple`, `confirmHold`, `confirmType` (fetched via search 2026-10-15); confirm/complete callbacks and behaviour UNVERIFIED; reported not to render fully in DevTools | **[SPIKE]**. If confirm events are unreliable: submit only by tapping a suggestion (exact match is always suggestion #1) |
| 2 | `wx.onKeyboardHeightChange` in a mini game | UNVERIFIED | fixed-layout assumption (§8.2) |
| 3 | Group entry, open data domain, boards, privacy popup, ads | as [DJT §17] (#1-#5, #8, #11, #21, #24) | as [DJT §11.8] |
| 4 | Friend/group rows returned without the day's key (for "正在猜" rows) | UNVERIFIED ([DJT §11.2]) | count-only "正在猜" line (§11) |
| 5 | Cloud quota for ~30 calls per player per day; function cold-start latency for `guess` | UNVERIFIED | warm-instance caching; plan choice (H6) |
| 6 | Cloud DB document size for 80 KB rank documents; total capacity | UNVERIFIED | rank arrays as cloud-storage files (§3.8) |
| 7 | Bundled 1.2 MB binary + 240 KB vocab in a cloud function package | UNVERIFIED (expected fine) | split `near.bin` into a DB collection keyed by word index |
| 8 | System font size readable for first-launch 大字 default | UNVERIFIED ([DJT §17] #28) | manual switch only |

### 17.1 Founder's device pass (before submission)
Run on the release-candidate 体验版 on one iOS and one Android phone (current WeChat), with two more accounts in a test group, all mutual friends ([DJT §17.1] setup). Items:
1. Group card entry → `joinGroup` → group board (as [DJT] E1-E4).
2. **Keyboard:** open 输入, type with the system pinyin IME, see suggestions update per committed character, submit by suggestion and by 完成, confirm the keyboard stays open after a submit and the text clears; measure the keyboard height callback; check the layout on a 320-wide phone with large text.
3. **Guess latency:** p50/p95 of `guess` on mobile data (target p95 ≤ 800 ms warm, ≤ 2.5 s cold).
4. Rewarded hint in an archive puzzle (stub, then real units when available) with `disableFallbackSharePage: true`.
5. Boards with in-progress rows (one account mid-puzzle).
6. Cloud usage of one full daily session (function calls, DB reads/writes) to size the plan.
7. Display modes on the smallest phone and on PC WeChat.

**Exit criteria:** E1 group entry; E2 rows carry `openid`; E3 hash join and payload (as [DJT]); **E4 keyboard input works end to end on both platforms** (else the suggestion-only submit fallback, re-verified by QA); **E5 `guess` p95 ≤ 800 ms warm**; E6 rewarded no-fill shows no share page; E7 display modes hold with no clipped text. Results are recorded in a dated note under `docs/yuyirelen/`.

---

## 18. Edge cases

1. **Offline at launch:** home shows the offline state; nothing is playable (every guess needs the server). The how-to sheet still opens.
2. **Offline mid-play:** the ladder stays; the pending guess retries with the same `clientGuessId`, so it never double-counts.
3. **Double tap on a chip or suggestion:** a 300 ms debounce, plus server idempotency on `clientGuessId` and duplicate-word handling.
4. **Same word via two paths** (typed and chip): the second is a duplicate (no step).
5. **Traditional characters typed** (蕃茄 → 番茄 if mapped): normalised before lookup; if the normalised word isn't in the vocabulary, the local toast.
6. **Word typed with spaces, punctuation or full-width letters:** stripped; letters and digits make it out-of-vocabulary.
7. **Synonym guessed:** solves (§4.5); the reveal marks it "同义".
8. **Hint when best is already rank 2:** `AT_BEST`; the button reads "已经只差一步了"; no step is added.
9. **Hint word already guessed:** the next closer free rank (§4.4).
10. **Midnight during a ranked daily:** guesses up to D+1 00:30 stay ranked; after that the play continues unranked with a one-time banner. Home rolls to the new day on `onShow` (server date).
11. **Daily started on one device, continued on another:** state is server-side; `startPuzzle` returns the same ladder.
12. **Second ranked play attempt** (reinstall): impossible; the play `_id` is per puzzle per openid.
13. **Card for today's daily opened by someone who already finished it:** goes straight to the comparison.
14. **Card for a future puzzle id or a malformed id:** `PUZZLE_NOT_FOUND` → home.
15. **Bank empty:** `DAILY_UNAVAILABLE`; no new daily; streaks skip the day; practice works.
16. **`vocabVersion` mismatch** (old client, new puzzle): the client sends the word string; the server maps it with the puzzle's vocabulary; a word missing there returns `NOT_IN_VOCAB` and the toast.
17. **600-guess limit reached:** `GUESS_LIMIT`; hints and give-up still work.
18. **Board viewed by someone who hasn't started:** rows visible (no spoilers); own row "未开始".
19. **Privacy refused at the first finished daily:** the reveal is unaffected; the marker write is pending until a later agreement ([DJT §11.2]).
20. **Group board over the cap:** `mode: group`; friend board `selfOnly`.
21. **Interstitial due while a sheet or the keyboard is open:** skipped (never shown mid-play).
22. **Warm start with a new card mid-guess:** deferred toast (§9.3).
23. **Answer word appears as a 联想词 chip:** tapping it solves (allowed by design).
24. **Very long play (> 60 steps):** the chart buckets to 60 columns; the ladder scrolls; the reveal list still highlights all of the player's words in the top 100.
25. **Content fix after launch** (a neighbour list found offensive): the CTO marks the answer `retired` in `answer_bank`; if it is today's, the reveal list for it is hidden ("列表维护中") but play and scoring continue; future entries are re-reviewed. Vocabulary removals ship in the next `vocabVersion`.

---

## 19. Founder Handoff (Article 6)

None of these block the build. Release compiles them into `docs/yuyirelen/release/HANDOFF.md` with exact values.

| # | Founder item | Needed for | If not done |
|---|---|---|---|
| H1 | **Register a new mini game AppID** under the company entity: name (语义热冷; fallbacks 词语温度计, 热冷猜词, 猜词温度), service category (休闲/益智), introduction and avatar from the release pack | everything on device | no device pass |
| H2 | **WeChat 认证** for the new AppID (fee: money) | submission, 流量主 | submission waits |
| H3 | **备案** for the mini game (service description and form fields from the release pack) | submission | submission waits |
| H4 | **软著** submission with the release pack's materials (incl. third-party notices) | category qualification as needed | as the release rules check says |
| H5 | **用户隐私保护指引**: declare 微信朋友关系; enable the official privacy popup | boards | board calls fail with 112 (error state) |
| H6 | **Create the cloud environment** (choose the plan: money), deploy functions, set `GROUP_REF_PEPPER`, `TZ=Asia/Shanghai`, timeouts, timers, collections, indexes and deny-all rules | all play | nothing works |
| H7 | **Import the answer bank** (≥ 90 daily + ≥ 300 practice) from the build team's file in the cloud console, then delete the local file; repeat monthly when the low-bank warning fires | daily and practice | no daily (`DAILY_UNAVAILABLE`) |
| H8 | **Spot-check content:** read 20 random answers' top-100 lists and 500 random vocabulary words, and approve or flag (this spoils those 20 answers for you) | content safety | release notes it as not done |
| H9 | **流量主** activation, then ad unit IDs into `app_config`; switch the banner on when wanted | §12 | hints in unranked play are free (no-fill rule); no interstitials; no banner |
| H10 | **In-app search** (WeChat 小游戏 and 小程序, and Douyin 小游戏) for: 语义猜词, 热冷猜词, 猜词 热度, 每日猜词, 猜秘密词, 词语温度, 越猜越近, Semantle, Contexto; plus name availability | name and uniqueness | name fallback |
| H11 | **Device pass** (§17.1) | submission | submission waits |
| H12 | Approve the upload, then submit for review and release | launch | — |
| H13 | Optional: counsel confirmation that offline embeddings need no AIGC label or algorithm filing (INFERENCE §3.4), and of the jieba/BGE licence reading | comfort | release notes it as INFERENCE |

---

## 20. Acceptance criteria (v1)

QA tests these against this spec. Tests may use the fake-`wx` harness, the mock server, a test vocabulary and a test bank. "Daily" means today's ranked puzzle.

**Similarity data and pipeline**
1. `vocab.v1.txt` has between 20,000 and 40,000 lines, no duplicates, every word 1-4 characters, every character in the 3,500-character 一级字表, and no Latin letters, digits or punctuation.
2. No word in `vocab.v1.txt` matches any entry in the build blocklists (exact match or listed substring); the pipeline's filter report is committed and shows counts per filter.
3. Every word in the 500-word coverage list is present, or the pipeline report lists it as deliberately excluded with a reason (≥ 98% present).
4. The vocabulary contains no word tagged `nr`, `nrt`, `nrfg`, `ns`, `nt`, `nz`, `i` or `l` in the source dictionary.
5. `near.v1.bin` has exactly V × 20 uint16 entries; no word lists itself; every entry is < V.
6. `verify-bank.js` rejects an entry whose `ranks` is not a permutation of 1..V, whose `ranks[wordIdx] ≠ 1`, whose synonyms are out of the vocabulary, whose `vocabVersion` mismatches, or whose gate fields are outside §3.6; it accepts a valid entry.
7. For every entry in the import file: chip-walker median steps in [10, 30], chip-walker p90 ≤ 45, typist median ≤ 60, solve-within-80 ≥ 95% for both bots (from the gate report).
8. Every answer is 2-3 characters, has frequency rank ≤ 8,000, and is not in the blocklists; ≥ 85% of daily answers are 2 characters.
9. Running the pipeline twice with the same inputs produces byte-identical `near.v1.bin` and identical ranks (manifest hashes match).
10. No file containing answer words (candidates, ranks, review sheets, bank import) is tracked in git (checked by a test that greps tracked files for the bank's `word` values in a test bank and by a `.gitignore` rule for the pipeline output folder).
11. `THIRD_PARTY_NOTICES.md` exists and names the vocabulary source and the embedding model chosen by the bake-off, with their licences.
12. No client file and no cloud function contains an HTTP call to any model or embedding endpoint, an embedding vector, or a model file (grep test for model ids, `.onnx`, `.bin` other than `near`, `.npy`).

**Serving and spoiler safety**
13. No client-reachable response from any function contains `answerRef`, `ranks`, or an `answer_bank` `_id` (contract test over all function outputs).
14. `guess`, `startPuzzle` and `getChallenge` never return the answer word, `top`, or synonyms for a puzzle the caller hasn't finished.
15. `getReveal` returns `REVEAL_LOCKED` for a caller who hasn't finished; after the caller solves or gives up it returns the answer and exactly 100 `[word, rank]` items with ranks 1..100 in order (rank 1 = the answer).
16. `getHistory` includes `answer` only for issues the caller finished.
17. The client package contains the vocabulary but no answer list, no rank data and no `near.bin` (package inspection).
18. `database/rules.json` sets every collection used by the code to deny-all read and write.
19. `getChallenge` returns `ownerWords` only to a non-owner caller who has finished that puzzle.

**Input (dictionary-only)**
20. Typing text that normalises to a vocabulary word shows it as suggestion #1 and submits it on tap.
21. Typing text that is not in the vocabulary and pressing 完成 shows "词库里没有「xx」，换个常用词试试" and makes **no** network call (harness counts calls).
22. Suggestions show at most 6 words, all from the vocabulary, exact match first, then prefix matches by frequency.
23. Traditional characters are converted (for example typing a traditional form of a vocabulary word finds it); spaces and punctuation are stripped.
24. A `guess` call with a non-vocabulary word returns `NOT_IN_VOCAB`, writes nothing to `plays`, and no log line or event contains the submitted text.
25. `track` rejects events carrying a prop named `text`, `input` or `query`; no client event schema contains typed text.
26. After a submit the keyboard stays open and its text is cleared; 收起 closes it.

**Core loop**
27. Before the first guess the play screen shows exactly 6 热身词; tapping one sends a guess with `src: 'warmup'` and counts as step 1.
28. The 6 热身词 for a date are identical for all players and are determined only by the date and the starter list (unit test with two different answers on the same date gives the same warm-ups).
29. Each accepted guess returns its rank; the 刚猜 card and the ladder update; the ladder is sorted by rank ascending.
30. Temperature `T` equals `round(100 × (1 − ln r / ln V))` for sampled ranks, with T(1) = 100 and T(V) = 0.
31. Bands follow §4.3 at the boundaries (ranks 1, 2, 10, 11, 100, 101, 500, 501, 2000, 2001), and every row shows the band word as text, not colour alone.
32. After each guess up to 5 联想词 show, all from the guessed word's top-20 neighbours, none already in the ladder; tapping one sends a guess with `src: 'chip'`.
33. Tapping an older ladder row switches the chip strip to that word's neighbours ("顺着「x」想：").
34. 联想词 for a word are the same on two puzzles with different answers (answer-independence test).
35. A duplicate word is not sent, adds no step, and shows the "已经猜过" toast with its rank.
36. A guess of rank 1 sets status `solved`, shows the 命中 animation and then the reveal with the answer.
37. A guess of a listed synonym solves the puzzle, shows "意思一样！" and the answer, and records `solvedBy: 'synonym'`.
38. The server computes `steps`; a client-sent step count is ignored.
39. Retrying a guess with the same `clientGuessId` returns the same result and adds no step.
40. A guess on a finished play returns `FINISHED`.
41. More than 40 guesses in one minute returns `RATE_LIMITED` with the toast; guess 601 on one puzzle returns `GUESS_LIMIT`.

**Hints**
42. Hint 1 is unavailable before step 10 (button "第 10 步后可用提示") and available at step 10; hints 2, 3 and 4 unlock at 20, 30 and 40.
43. Each used hint adds exactly 1 step.
44. A word hint returns the word at rank `min(cap, max(2, floor(best/2)))`, moving to the next closer free rank if taken, and never rank 1 (property test over random ladders).
45. Hint 3 returns the answer's first character and the header shows "首字：X" for the rest of the puzzle.
46. With best rank 2, a word hint returns `AT_BEST`, the button reads "已经只差一步了", and steps don't change.
47. `useHint({source:'ad'})` on a ranked daily returns `RANKED_NO_AD`; the client never shows "▶ 视频提示" on a ranked daily.
48. In unranked plays "▶ 视频提示" gives a hint after a completed rewarded video, at most 3 per puzzle; the 4th returns `HINT_LIMIT`.
49. A hint word appears in the ladder marked "提示" with its rank, and its 联想词 show.

**Give up and reveal**
50. 放弃 is reachable only through the ⋯ menu and asks for confirmation; on a ranked daily the dialog states that the streak will break.
51. After giving up, the reveal shows the answer, "未猜中 · 最近第 N 名", and the top-100 list.
52. The reveal highlights every top-100 word the player guessed and marks synonyms "同义".
53. Day stats ("今日 N 人猜中 · 中位数 M 步" and the percentile line) appear only with ≥ 30 finishers and only on dailies.
54. The reveal's list error state shows "列表暂时打不开" + 重试 while the answer and summary stay visible.

**Daily, ranked rules, archive and practice**
55. `getDaily` returns the same `puzzleId` and warm-ups for all callers on a Beijing date, computed from server time (unit test with `TZ=UTC` at 15:59:59 and 16:00:00 UTC).
56. `genDaily` run twice for the same date creates one `daily_puzzles` document and marks exactly one bank entry used (double-fire and lazy-race tests).
57. `genDaily` picks the unused daily entry with the lowest `seq` and matching versions; with none it publishes nothing, returns `DAILY_UNAVAILABLE`, logs `[ALERT]`, and writes `daily_gen` with `failed: true`.
58. With fewer than 30 matching daily entries left, `genDaily` logs a low-bank warning.
59. A play started on D within the window is `ranked`; guesses after D+1 00:30 BJT keep working but the play becomes unranked and the banner shows once.
60. A player has at most one play per puzzle (deterministic `_id`); a reinstall resumes the same play.
61. 再来一题 opens the newest unplayed past daily, else the lowest-numbered unplayed practice puzzle.
62. Archive items show the answer only for finished issues; unfinished ones show 未玩/进行中; the practice line shows done/total.
63. Opening a puzzle id that is in the future or doesn't exist returns `PUZZLE_NOT_FOUND` and routes home.
64. Archive and practice plays never appear on boards, never change streaks and never write KV markers.

**Streaks**
65. Solving ranked dailies on consecutive published dates increments the streak; a skipped published date resets it to 1 on the next solve.
66. A date with no published daily neither extends nor breaks the streak.
67. A ranked give-up sets the current streak to 0.
68. The streak line shows only when the current streak is ≥ 2, with no reward wording, and no notification or reminder exists anywhere.

**Share and challenge** [COMPLIANCE]
69. 分享成绩 exists only after finishing; it calls `createChallenge` then `shareAppMessage` with `query` `c=<id>` only.
70. The share card (500 × 400) contains no word of any kind (render test: the card's text draw calls contain only the fixed strings, numbers and the issue label).
71. The share card shows one chart bar per step (bucketed to 60 above 60 steps) with height = T and colour = band.
72. If `createChallenge` fails, the share proceeds with `p=<puzzleId>`.
73. Opening `c=<id>` for today's daily that the recipient hasn't played shows "这就是今日一词，计入今日榜单", and the resulting play is ranked.
74. Opening `c=<id>` for a past daily or practice puzzle shows "往期题，不计入榜单" and the play is unranked.
75. After the recipient finishes, the reveal shows "你 X 步 · TA Y 步", both charts, and [看 TA 的猜词]; before finishing, the sharer's words are never shown.
76. No share, card open or challenge grants any hint, step, streak or other benefit (code review plus harness test of state before and after).
77. The capsule-menu share is enabled at startup with `withShareTicket` and never passes `isUpdatableMessage: false` in the same call.

**Boards** [COMPLIANCE]
78. Board rows come only from `getBoard`; a KV marker with no server match shows "未验证" without a rank number, below all other sections.
79. Solved rows are ordered by steps, then hints, then finish time; only solved rows carry rank numbers.
80. In-progress ranked players appear under "正在猜" with steps and best rank and no words; given-up players under "未猜中".
81. `getBoard` rows contain no openid, no words and no answer; `h` uses the day's salt.
82. `getBoard` rejects a `groupRef` the caller is not a member of (`NOT_MEMBER`).
83. Above `boardListCap`, the group board uses `mode: group` and the friend board `selfOnly`.
84. With the privacy popup refused, the game remains fully playable and the board shows the privacy-not-agreed state with the player's own result; no automatic re-prompt.
85. With `scope.WxFriendInteraction` refused, the board shows the not-authorized state with [去设置开启]; no automatic re-prompt; returning from settings re-checks without restarting.
86. The KV marker is written only after a ranked daily finishes and contains only `{s, h, st}`; markers older than 7 days are removed.

**Ads** [COMPLIANCE]
87. Every rewarded instance is created with `disableFallbackSharePage: true`; `useFallbackSharePage: true` on `onLoad` is treated as no-fill.
88. A rewarded hint is granted only on `isEnded === true`; closing early shows "完整观看才能获得提示".
89. On no-fill or load error the hint is granted once per puzzle with "暂无广告，本次免费"; a second failure on the same puzzle grants nothing.
90. Interstitials show only on 再来一题 after the 2nd, 4th… finished puzzle of the session, never before the 3rd lifetime finished puzzle, ≥ 120 s apart, ≤ 5 per day, and never during play, on the daily's entry or on a card-entry first puzzle.
91. Interstitial rejections 2001-2003 are skipped silently and don't count toward caps.
92. The banner appears only on board `ready`/`empty` states, only when `app_config.ads.banner.enabled` is true with a unit id, with a ≥ 24 pt gap, and never covers rows or buttons.
93. Ad buttons show ▶ and 视频 and are never adjacent to 输入, a free-hint button or 分享.

**Screens, states and accessibility**
94. Home shows each daily state in §8.1 with the listed copy (harness drives each state).
95. The play screen shows each state in §8.2 (starting, ready, waiting, result, duplicate, not-in-vocabulary, hint locked/available/exhausted, offline, rate limited, window closed, solved).
96. Nothing is drawn or tappable in the capsule's row on the right at 320, 375 and 430 widths.
97. All touch targets are ≥ 48 × 48 pt; body text ≥ 16 pt (≥ 20 pt in 大字模式); the answer on the reveal ≥ 40 pt.
98. 大字模式 and 高对比度 apply immediately without restart, persist on the device, don't change the share card, and meet the contrast ratios in §8.11 (automated contrast check on the theme tokens).
99. With the keyboard open, the suggestion strip and the 刚猜 card are drawn above the keyboard using the reported height, or in the top 45% when no height is reported.
100. The first play shows the 3 coach marks once; they are skippable and never shown again.
101. The how-to sheet auto-opens once on first launch, has exactly the 3 rule lines and the picture, and is reachable from home and the play menu.
102. The archive and board screens show loading, empty and error states with 重试.

**Simplicity and difficulty (Article 3)**
103. A first-time player can make a valid first guess with a single tap on the first play screen (no typing, no permission prompt, no login).
104. A full daily can be solved using taps only (warm-ups, chips, hints), demonstrated by the chip-walker bot on every bank entry (AC 7) and by a harness run on a test puzzle.
105. No permission or privacy prompt appears at launch, during play, or before the player opens a board or finishes a ranked daily.

**Backend hygiene**
106. Every function takes identity only from `cloud.getWXContext().OPENID` (test asserts no function reads an openid from input).
107. `genDaily` and `cleanup` return `FORBIDDEN` when called with an OPENID.
108. `cleanup` deletes `plays`, `challenges`, `events`, `anomalies` older than 180 days, `group_members` by `lastSeen`, `player_stats` by `updatedAt`, keeps `daily_stats`, `daily_puzzles` and `answer_bank`, and a second run deletes nothing new.
109. Anomaly flags (`fast_solve`, `burst`, `scripted`, `limit`) are written as specified and never change a result, rank or streak.
110. No AppSecret, `session_key` or `code2Session` appears anywhere in the code; `GROUP_REF_PEPPER` is read only from the environment (`SERVER_CONFIG` if missing).
111. The drift test fails when any function's `core/` copy differs from `game/core/`; no file in `apps/yuyirelen/` `require`s a path outside `apps/yuyirelen/`; every runtime `require` in the game targets a `.js` file.
112. The main package (including the open data domain) is ≤ 4 MB and the total ≤ 30 MB.

**Analytics**
113. Every event in §15 fires at its trigger with the listed props and a top-level `sessionId` (harness log).
114. `solve` carries `srcMix` counts that add up to the non-hint steps.

---

## 21. Post-launch backlog (out of v1)
- `msgSecCheck` sweep of the full vocabulary after publishing (§3.3 layer 5).
- Group co-op ladder (群共猜), a shared ladder per group (PO-18).
- Save card to album; 朋友圈 sharing (PO-19).
- Opt-in subscribe message for a new word each day (PO-19).
- Weekly themed puzzles; a harder "高手" daily.
- Reporting a neighbour list from the reveal ("这个排名不合理？").
- Logging out-of-vocabulary attempts as counts per word (would need a privacy review; not in v1).
