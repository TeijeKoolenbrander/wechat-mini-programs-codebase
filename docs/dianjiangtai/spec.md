# 点将台 (working title): spec, Phase 1 prototype

Status: **approved by the founder as the Phase 1 scope (2026-10-14)**, revised the same day with the founder decisions and CTO review changes below. Author: product-ux.
Type: WeChat 小游戏 (mini game). Slug: `dianjiangtai`. Companion: `docs/dianjiangtai/direction.md` (vision, pillars, art, phased plan, risks).

Labels:
- **[VERIFY-P0]**: the research marked this API or policy detail as UNVERIFIED, or it rests on stale or second-hand sources. It **needs verification in Phase 0**. Every such item is collected in §17, each with a fallback.
- **[COMPLIANCE]**: compliance-sensitive.
- **INFERENCE**: our own judgement.

Scope: everything above §21 is **Phase 1 (two-week prototype)**. §21 is **Phase 2 (later)** and is out of scope for the prototype.

---

## 0. Decisions log

Founder decisions, 2026-10-14. These are closed; do not reopen them without the founder.

| # | Decision | Where it applies |
|---|---|---|
| D1 | This spec is **approved as the Phase 1 scope**. | whole doc |
| D2 | The **五德** stat set (智信仁勇严, integers 1-10) is approved. | §3.1 |
| D3 | Phase 1 roster is **32** historically grounded generals (8 蜀, 8 魏, 8 吴, 8 群) with monogram portraits. All 16 faction-era cells have ≥ 2 generals (cell sizes 2-8, 77 general-cell entries). | §3.5, §4, §7.4, App. B, AC 7, 16 |
| D4 | Daily share cards **hide** general names; free-play cards **show** them. | §8.4, AC 31 |
| D5 | **Stub ads** are acceptable for the prototype if 流量主 ad units are not available. | §12, AC 43 |
| D6 | On ad **load error or no fill**, grant the reward, **at most once per run per placement**. | §12, AC 41 |
| D7 | Data retention is **180 days** for run records and analytics events. | §16, AC 57 |
| D8 | Keep the **临阵生变** event. Release checks it in content review before submission. | §7.2, AC 59 |
| D9 | The founder's company registers the game. Whether it is a mainland-China entity with game-category access is **still open** (Phase 0; §19 Q1, §17 #10). | §17, §19 |
| D10 | Portraits will be **AI-generated** (Phase 2): a style guide, a prompt/seed log per asset (provenance), human review for historical plausibility and against resemblance to other games' art, compliance with 《人工智能生成合成内容标识办法》 [VERIFY-P0], a kept human-edit trail, and hosting on CDN/cloud storage rather than in git (direction §6). **Phase 1 still ships monograms only.** | direction §6, §3.5, §17 #16, AC 58 |
| D11 | Trademark: the founder has **cleared the name 点将台**. Resolved. | direction §8 |
| D12 | Distribution: the founder posts the **Phase 1 prototype** into **15-20 WeChat groups** for ≥ 7 days. | §1, direction §10 |
| D13 | Scope: the game is **三国 only**. Phase 0 is platform-API verification plus a compliance/legal check (about 3-5 days, before any code). Concept validation rests entirely on the Phase 1 prototype and the §1 go/kill thresholds. | §1, §17, direction §10 |

CTO review changes, 2026-10-14 (also applied):

| # | Change | Where |
|---|---|---|
| C1 | **Leaderboard trust.** Open-data-domain boards are written by the client and can be tampered with. Phase 0 checks for a server-side write path; if none, the risk is accepted for Phase 1, documented, and made detectable. | §11.4, §14.3, §17 #19, #21, AC 56 |
| C2 | **Daily seed generation cost.** `genDaily` gets a measured time budget, a 30-day offline seed bank fallback, and a precise definition of per-seed gate rates. | §5.2, §7.5.1, §14, §17 #20, AC 53-55 |

---

## 1. Goal, target user, scope

**Validation goal.** Find out whether an original 三国 draft-and-grade loop with a daily shared seed spreads through WeChat groups. Go/kill thresholds (INFERENCE): ≥ 10% of completed runs shared, ≥ 25% of card opens lead to a started run, ≥ 3 completed runs per session, D1 ≥ 35%. Kill if share < 4% or runs per session < 2. Metric definitions are in §15.

The game is **三国 only** (D13). There is no pre-build concept test: the Phase 1 prototype, posted by the founder into 15-20 WeChat groups for ≥ 7 days (D12), is the whole validation. Phase 0 (about 3-5 days, before any code) only verifies platform APIs and does the compliance/legal check (§17).

**Target user.** WeChat players aged 24-40 and 40+, many of them new to mobile games. Portrait, one thumb, large text, no timers. See direction §2.

**Feature scope**

| Feature | Phase 1 | Phase 2 |
|---|---|---|
| Free play (unlimited runs) | Yes | |
| Daily 军令 (shared seed, one attempt) | Yes | |
| 5 roles, 4 factions (魏 蜀 吴 群), 4 eras | Yes | + 晋 faction, + 归晋 era |
| Generals | 32 (8 per faction, Appendix B), monogram portraits | 120-160, final AI-generated portraits (D10) |
| Grading simulator, battle log, 复盘 | Yes | Tuned with live data |
| Result share card (`shareAppMessage`) | Yes | + updatable message, + save to album |
| Challenge card (同签挑战) | Yes | + 擂台 mode, + "好友已应战" subscribe message |
| Group board (shareTicket) and friend board | Yes, today's daily only | + streaks, + history |
| Rewarded video: free-play re-spin, 复盘 | Yes (stubbed if no ad units, see §12) | |
| Interstitial | Yes, conservative caps | Tuned |
| Banner | No | A/B test |
| 识人模式 (hidden stats), expansions | No | Yes |
| Analytics for go/kill | Yes | |

**Tech reuse from `apps/cheatshaizi/mini-game/`.** See Appendix A. In short: we reuse the native-canvas scene loop, capsule-aware layout, single-finger touch routing, the mulberry32 seeded RNG, the fake-`wx` smoke-test harness, the `core/` vs `js/` split with its drift test, and the `tools/stats.js` distribution-tool pattern. We do not reuse the content, and explicitly not its rigged-roll logic.

---

## 2. Core loop, step by step

A run takes about 40-90 s (draft 30-60 s, reveal about 9 s, result 10-30 s).

1. **Choose a mode** on home: 今日军令 (daily, one attempt) or 自由点将 (free, unlimited). Or arrive from a challenge card (§9.3).
2. **Round n of 5: flip the token.** Tap 翻令. Two tokens flip: a **faction** (魏/蜀/吴/群) and an **era** (黄巾/群雄/赤壁/三分). The faction-era pair defines the candidate pool.
3. **Optional re-spin.** Before picking, the player may use 换势力 (re-roll faction only) or 换时代 (re-roll era only). Each is free once per run. In free play, rewarded video gives extra re-spins (§4).
4. **Pick a general.** The pool shows every undrafted general who served that faction in that era, with stats and a role-fit chip for each open slot.
5. **Place the general.** Tap an open role slot (主公/军师/先锋/猛将/守将). 撤回 (undo) is allowed until the next 翻令.
6. Repeat steps 2-5 until all five slots are filled (five rounds, one general per round, one general per slot).
7. **Campaign.** Tap 出征. The simulator runs 12 battles (§7). The reveal animates one battle row at a time (about 0.7 s each, tap to skip), each with a one-line cause.
8. **Verdict.** The record (for example 10胜2负), the grade band (for example 霸业将成), the 说书人 评语 and a rarity line ("今日仅 0.8% 的主公一统天下").
9. **Next actions** (all optional): 分享战报 · 发起挑战 · 复盘 (rewarded video) · 看群榜/好友榜 · 再来一局 (goes to free play).

Interstitials appear only on 再来一局 in free play, under the caps in §12.

---

## 3. Content model

### 3.1 Stat set: 五德 (original to this game)

We do **not** use 武力/智力/统率/政治(/魅力) or a 1-100 scale. That combination is the signature expression of Koei's 三国志 series. Instead we use the five qualities of a general from 《孙子兵法·计篇》 ("将者，智、信、仁、勇、严也"), which is public domain, on a simple **1-10** scale.

| Stat | Key | Meaning in game | Drives |
|---|---|---|---|
| 智 | `zhi` | strategy, foresight | 军师, 奇谋 events, 水战/奇袭 |
| 信 | `xin` | trustworthiness, loyalty | 主公, 守将, the 临阵生变 risk when low |
| 仁 | `ren` | benevolence, popular support | 主公 morale, 安民 battles |
| 勇 | `yong` | personal valour | 猛将, 先锋, 野战 |
| 严 | `yan` | discipline, command | 先锋, 守将, 守城 |

Approved by the founder (D2). Why this set: it is instantly familiar to the audience, it creates arguments (吕布: 勇10 信2), and its numbers can't be mistaken for any existing game's ratings. All values are our own judgement, written with a one-line rationale (`statNote`) for content review and provenance.

### 3.2 Factions

| Key | Label | Colour (direction §6) | Phase |
|---|---|---|---|
| `wei` | 魏 | ochre `#B8862B` | 1 |
| `shu` | 蜀 | vermilion `#C0392B` | 1 |
| `wu` | 吴 | teal `#2E7D7A` | 1 |
| `qun` | 群 (群雄: Han court, warlords, rebels) | umber `#7A5230` | 1 |
| `jin` | 晋 | 月白 `#C9D3DD` | 2 |

Phase 1 rule: **each general has exactly one faction**, the camp they are best remembered with (for example 赵云 = 蜀). Generals who switched sides get multiple appearances in Phase 2.

### 3.3 Eras

| Key | Label | Span (approx.) | Phase |
|---|---|---|---|
| `huangjin` | 黄巾 | 184-189 | 1 |
| `qunxiong` | 群雄 | 190-207 (incl. 官渡) | 1 |
| `chibi` | 赤壁 | 208-214 | 1 |
| `sanfen` | 三分 | 215-234 (荆州, 夷陵, 北伐) | 1 |
| `guijin` | 归晋 | 235-280 | 2 |

A general lists every era in which they had notable recorded activity (in any camp), so one general can appear in several cells. Their single Phase 1 faction is still the camp they are best remembered with, so a few early-career cells are a deliberate simplification (for example 张郃 in 魏-黄巾, from his service under 韩馥 against the 黄巾). Each such case is noted in Appendix B.

### 3.4 Roles (slots)

| Key | Label | One-line explanation shown to players | Role weights (智 信 仁 勇 严) |
|---|---|---|---|
| `zhugong` | 主公 | 定人心、聚众志 | .15 .20 .40 .05 .20 |
| `junshi` | 军师 | 运筹帷幄 | .65 .15 .05 .00 .15 |
| `xianfeng` | 先锋 | 冲阵破敌 | .10 .05 .00 .55 .30 |
| `mengjiang` | 猛将 | 万军之中取上将首级 | .00 .10 .00 .80 .10 |
| `shoujiang` | 守将 | 坚守城池、稳住后方 | .20 .25 .05 .10 .40 |

`roleScore(g, r) = Σ weight[r][s] × g.stats[s]`, which falls in 1-10.
Role-fit chip: ≥ 7.5 **适任** (green check), 5.5 to < 7.5 **可用** (neutral), < 5.5 **错位** (amber). Chips always show text as well as colour.

### 3.5 General data model

```json
{
  "id": "g_zhaoyun",
  "name": "赵云",
  "courtesy": "子龙",
  "faction": "shu",
  "eras": ["qunxiong", "chibi", "sanfen"],
  "primaryRole": "mengjiang",
  "stats": { "zhi": 6, "xin": 10, "ren": 8, "yong": 9, "yan": 8 },
  "tier": "jia",
  "bonds": [],
  "portraitId": "p_zhaoyun_v1",
  "monogram": "云",
  "blurb": "一身是胆，忠勇无双。",
  "statNote": "信10：终身无二主；智6：以勇略见长而非谋主。",
  "source": "三国志·蜀书 / 三国演义（公有领域）",
  "contentVersion": 1
}
```

Worked role scores for this entry: 主公 8.15 · 军师 7.0 · 先锋 8.45 · 猛将 9.0 · 守将 8.2.

| Field | Type | Notes |
|---|---|---|
| `id` | string | stable, `g_` + pinyin |
| `name`, `courtesy` | string | public-domain historical names |
| `faction` | enum §3.2 | one per general in Phase 1 |
| `eras` | enum[] §3.3 | ≥ 1 |
| `primaryRole` | enum §3.4 | display only (the "natural" slot); not used by the sim |
| `stats` | 5 × int 1-10 | §3.1 |
| `tier` | `jia` / `yi` / `bing` (甲/乙/丙) | **display only**. Derived from the stat total (甲 ≥ 38, 乙 30-37, 丙 ≤ 29; tunable). Never affects draw odds. We do not use rarity words like SSR, 传说 or 稀有 |
| `bonds` | string[] | bond keys (§7.3) |
| `portraitId` | string | resolves to a subpackage or CDN image. **Phase 1: always unresolved, so the `monogram` renders** (D10: AI-generated portraits arrive in Phase 2, hosted on CDN/cloud storage with their provenance log, see direction §6) |
| `monogram` | 1 char | rendered as a seal in the faction colour |
| `blurb` | string ≤ 14 chars | our own words |
| `statNote` | string | rationale, internal plus shown in the detail sheet |
| `source` | string | provenance |
| `contentVersion` | int | the sim and server validation pin to this |

**Target counts:** Phase 1 has **32** generals with monogram portraits (D3; Appendix B: 8 蜀, 8 魏, 8 吴, 8 群). All **16** faction-era cells have ≥ 2 generals (cell sizes 2-8, 77 general-cell entries). The full game has **120-160** (about 25-35 per faction, ≥ 4 per faction-era cell, plus 晋). Content ships as `content/generals.v<N>.json`, about 16 KB for 32 or about 70 KB for 160, so it fits in the main package. Portraits never go in the main package.

---

## 4. Spin (翻令) and re-spin rules

**Token sheet.** Each run uses a *token sheet* generated deterministically from the run seed by `core/sheet.js`:
`rounds[5] = { faction, era, altFaction[3], altEra[3] }`.

Generation rules:
1. Each primary cell (faction, era) must contain ≥ 2 generals. With the 32-general roster all 16 Phase 1 cells qualify, so the cell is uniformly random among the 16. **No rarity weighting.** (The ≥ 2 check stays in code for future content versions.)
2. `altFaction[k]` differs from the current faction and makes a valid cell with the current era. The same holds for `altEra[k]` with the current faction. Index k = the number of re-spins of that dimension already used in this round.
3. If a re-spin has no valid alternative, its button is disabled with the hint "此令无可换".

**Pool.** Pool = generals in (faction, era) **minus those already drafted**. If a pool is empty because of earlier picks, the token reflips automatically from a deterministic fallback stream. This does not use a re-spin, and the log says "此路无将，重新翻令".

**Re-spin allowance per run**

| | Free play | Daily 军令 | Challenge run |
|---|---|---|---|
| Free 换势力 | 1 | 1 | 1 |
| Free 换时代 | 1 | 1 | 1 |
| Rewarded-video extra re-spin (either dimension) | up to 2 | **none** | none |

- A re-spin is only allowed after the tokens have flipped and **before** a general is picked in that round.
- Using a re-spin in round n reads `alt…[k]` of round n, so in the daily everyone who re-spins the same dimension in the same round gets the same result.
- Ad re-spins never exist in any mode that feeds a leaderboard or challenge. This keeps competition fair and keeps ads away from anything that could look like buying randomness. [COMPLIANCE] (That a rewarded *free-play* re-spin is not "paid randomness" needs counsel confirmation, [VERIFY-P0].)

**Presentation.** Two lacquered command tokens flip over (about 1.2 s, wood-click sound). There are no reels, spinning wheels, lights, near-miss teasing or casino sounds. [COMPLIANCE]

---

## 5. Modes and seeds

### 5.1 Determinism

A run is fully defined by `(seed, contentVersion, actions[])`, where `actions` is the ordered list of `{round, type: flip|respinFaction|respinEra|pick|undo, generalId?, slot?, source?: free|ad}`. All randomness comes from `seededRng` (mulberry32, reused from cheatshaizi) on named sub-streams: `sub(seed, "sheet")`, `sub(seed, "battle")`, `sub(seed, "event")`, `sub(seed, "fallback")`, where `sub = mulberry32(hash32(seed + ":" + name))`. Battle randomness never depends on the player's choices (§7.2). The same `core/` code runs on the client and in cloud functions.

### 5.2 Daily 军令

- **Date key:** the Beijing date (UTC+8) `YYYYMMDD`, taken from **server time**, never the device clock (players abroad, or wrong clocks).
- **Seed:** generated by a scheduled cloud function at 23:00 BJT for the next day (with a fallback of generating lazily on the first `getDaily` request). It is stored in `daily_seeds`. The same seed applies to all players. Issue number 第 N 期 = days since launch.
- **Seed acceptance:** a daily seed is accepted only if it passes the daily gates in §7.5 (the best lineup for the primary tokens reaches 12-0, and the greedy and random 12-0 rates, computed as defined in §7.5.1, are inside their bands).
- **Where accepted seeds come from (C2).** Running the gates live can be expensive (up to 50 candidate seeds, each needing an exhaustive optimal search plus 800 simulated players), and may exceed the cloud function timeout [VERIFY-P0, §17 #20]. So there are two sources, tried in order:
  1. **Seed bank (primary).** `tools/simstats.js --bank 30` generates and gate-checks seeds offline, writing up to 30 days of accepted seeds with their `gates` record. The file is imported into the `daily_seed_bank` collection (client access denied) through the cloud console, by whoever holds console access. `genDaily` takes the next unused bank entry whose `contentVersion` and `configVersion` match the live ones, re-runs only the cheap check (rebuilds `rounds` and verifies that the stored best lineup still scores 12-0), marks the entry used and writes `daily_seeds`. The bank file contains future daily seeds, so it is a spoiler: **it is never committed to the repo** and is deleted locally after import.
  2. **Live generation (fallback).** If the bank has no matching entry (empty, or a content/config version bump), `genDaily` runs the gates live in a loop that stops at 50 candidates **or** at 70% of the function timeout, whichever comes first. If no candidate passes, it stores the best candidate that at least reaches optimal 12-0, sets `gates.relaxed = true`, and logs an `error` alert so the bank gets refilled. If no candidate even reaches 12-0, it keeps the last one and also sets `relaxed`; the daily still opens (a missing daily is worse than a slightly easy or hard one).
  - `genDaily` records `source: bank|live`, `attempts` and `genMs` on the `daily_seeds` document. A bank with < 7 entries left logs a warning so it is refilled in time.
- **One attempt:** the attempt starts at the first `flip` (the server logs `startRun`). One official result per openid per date. An in-progress daily is saved locally and resumes on relaunch.
- **Authoritative result:** the client receives only the token sheet (`rounds`), never the battle stream or the best lineup. On 出征, the client sends `actions[]`. The server replays, simulates and returns the record and battle log. This prevents precomputing the optimum from the seed.
- **复盘** for the daily is only returned after the player's daily result exists.

### 5.3 Free play

- Seed = a random uint32 on the client, simulated **on the client** (works offline).
- Unlimited runs. Ad re-spins are allowed. Results never feed a leaderboard.
- Free runs are submitted to the server best-effort (for analytics and as the base for challenges). The server replays them to validate before creating any challenge.

### 5.4 Challenge run

Plays the sharer's seed and token sheet (daily or free), with 1+1 free re-spins and no ad re-spins. See §9.3 for counting rules.

---

## 6. (Reserved: merged into §5)

---

## 7. Grading simulator (`core/sim.js`)

### 7.1 Inputs
- `lineup`: 5 × `{slot, generalId}`, with all slots filled
- `contentVersion` (the stats table)
- `battleStream` from `sub(seed, "battle")` and `eventStream` from `sub(seed, "event")`
- `config` (all weights, curve and τ in `core/config.js`, versioned)

### 7.2 Formula sketch

1. **Role scores.** `S_r = roleScore(general in slot r, r)` (§3.4).
2. **Morale multiplier.**
   `M = 0.85 + 0.03 × S_zhugong + 0.04 × (active bonds) + cohesion`
   cohesion = +0.03 if 4 drafted generals share a faction, +0.05 if all 5 do. M is capped at 1.25.
3. **The campaign: 12 battles.** For battle i, the battle stream draws a type `T_i` from {野战, 攻城, 守城, 水战, 奇袭, 安民}, with ≥ 1 of each guaranteed and the rest random. It also draws a **shared luck roll** `u_i ∈ [0,1)` (天时) and an opponent jitter `j_i ∈ [-0.3, 0.3]`.
4. **Team power.** `P_i = M × Σ_r b[T_i][r] × S_r`

   | Type | 主公 | 军师 | 先锋 | 猛将 | 守将 |
   |---|---|---|---|---|---|
   | 野战 | .15 | .15 | .30 | .30 | .10 |
   | 攻城 | .15 | .25 | .25 | .20 | .15 |
   | 守城 | .15 | .20 | .05 | .15 | .45 |
   | 水战 | .15 | .40 | .15 | .15 | .15 |
   | 奇袭 | .10 | .30 | .35 | .20 | .05 |
   | 安民 | .45 | .25 | .05 | .05 | .20 |

5. **Opponent.** `D_i = curve[i] + j_i`. Starting curve (tune with §7.5): `[4.8, 5.2, 5.6, 6.0, 6.3, 6.6, 6.9, 7.2, 7.5, 7.8, 8.1, 8.5]`.
6. **Win chance.** `p_i = 1 / (1 + exp(-(P_i - D_i) / τ))`, with τ = 0.5 to start.
7. **Outcome.** The battle is won if `u_i < p_i`. Because `u_i` is the same for every lineup on the same seed, a stronger lineup never does worse in any battle than a weaker one, before events. That is what makes daily comparisons fair.
8. **Events** (deterministic from the event stream; at most one of each kind per run; each one logged by name):
   - **临阵生变 (wavering):** each drafted general with 信 ≤ 3 has a `(4 − 信) × 10%` chance to turn one won battle into a loss. If several qualify, only the first triggered event applies. Kept by founder decision D8. [COMPLIANCE: content review] Its log lines come only from a fixed, reviewed template list (neutral wording such as "吕布临阵生变，阵脚动摇", never insults), and release reviews that list before submission (AC 59). In the 32-general roster the qualifying generals are 吕布 (信2), 董卓 (信2) and 韩遂 (信3).
   - **奇谋 (stratagem):** if the 军师 has 智 ≥ 9, the first lost 水战 or 奇袭 battle with `p_i ≥ 0.35` becomes a win.
   - **万夫莫敌 (unstoppable):** if the 猛将 has 勇 = 10, the first lost 野战 with `p_i ≥ 0.35` becomes a win.
9. **Record** = wins − losses out of 12.

### 7.3 Bonds (羁绊), Phase 1 set
Bonds apply only when all members are drafted, in any slots: 桃园 (刘备, 关羽, 张飞), 江东 (孙策, 周瑜). Each adds +0.04 to M. Bond names are our own and generic; they don't copy any game's skill names.

### 7.4 Battle log and "fair but arguable" rules
- Each row shows: `第i战 · <type> · 胜/负 · 胜算<p_i in 成, e.g. 七成> · 天时<吉/平/凶 from u_i> · <cause line>`.
- The cause line is templated by type and the top-contributing slot, for example "水战：周瑜运筹，火攻得手" or "守城：守将调度失当，城门失守". Event rows name the event.
- After the reveal, the player can see: their lineup with `S_r` per slot and fit chips, M with its parts (主公, bonds, cohesion), and per-battle `p_i` and 天时.
- **复盘** shows the best lineup for *the player's own final tokens* (after re-spins), its record, and the per-slot difference. It is computed by exhaustive search over pool picks × slot permutations. **Size with the 32-general roster:** cells hold 2-8 generals (77 general-cell entries over 16 cells, mean about 4.8 before removing drafted ones; Appendix B), so the pick combinations per run are at most 8^5 = 32,768 and typically about 1,500-2,500 (4.8^5 ≈ 2,550, less after drafted generals are removed); times 120 slot permutations, that is typically about 180k-300k lineup evaluations and **about 3.9M in the theoretical worst case** (five rounds all on the 8-general 蜀-三分 cell). The target stays < 300 ms on a mid-range Android, so the search must:
  - prune dominated picks within a round: drop general B if another general A in the same pool has every role score ≥ B's, 信 ≥ B's (or both > 3), 智 ≥ B's and 勇 ≥ B's, and B is not in any bond (all pool members share a faction, so cohesion is unaffected);
  - reuse per-battle partial sums across permutations;
  - report the evaluation count and time distribution, including the worst case, in `tools/simstats.js`.
  If the measured worst case still exceeds 300 ms on the reference device, the free-play 复盘 is also served by `getReplay` (with a client spinner), as the daily 复盘 already is. The free-play 复盘 is computed on the client by default; the daily 复盘 comes from the server.
- **No per-player adjustment, ever.** No rubber-banding, no pity, no effect from ads watched, run count, new-user status or spending. QA-testable via determinism (§20).

### 7.5 Grade bands and tuning targets

| Record (wins) | Band | Target share of free-play runs (sensible-player model) |
|---|---|---|
| 12-0 | **一统天下** (seal stamp, 编钟) | 1-3% |
| 10-11 | 霸业将成 | 12-18% |
| 8-9 | 雄踞一方 | 25-30% |
| 6-7 | 三分鼎立 | 25-30% |
| 4-5 | 偏安一方 | 12-18% |
| 2-3 | 兵微将寡 | 4-8% |
| 0-1 | 一败涂地 | ≤ 2% |

**Player models** for the tuning tool `tools/simstats.js` (pattern: cheatshaizi `tools/stats.js`), run over ≥ 100k seeds:
- *random*: a random pick into a random open slot. Target mean wins 4.5-5.5.
- *naive*: the highest-tier pick into its `primaryRole`, or else the best open slot. Target mean 7-8.
- *greedy*: the pick and slot that maximise the current `S_r` sum. Target mean 8-9, with a 12-0 rate ≤ 5%.
- *sensible* = a 50/50 mix of naive and greedy. Used for the table above. Median of 7 wins.
- *optimal* (复盘): reaches 12-0 on ≥ 95% of free seeds, and on 100% of accepted daily seeds (a seed-acceptance gate).

**Daily seed gates:** optimal = 12-0; greedy 12-0 rate 0.5-5%; random 12-0 rate < 0.5%.

#### 7.5.1 How the gates are computed for a single seed (C2)

A daily seed fixes the token sheet and the battle and event streams, so a deterministic greedy player would score either 0% or 100%. The per-seed "rates" therefore come from a population of simulated players whose *choices* vary while the seed stays fixed:

- `gateCheck(seed, contentVersion, configVersion)` lives in `core/gate.js`, shared by `tools/simstats.js` and `genDaily` (same drift test as the rest of `core/`).
- **Optimal:** exhaustive search (§7.4) over the **primary tokens with no re-spins**. Gate: best record = 12-0. The search may stop at the first 12-0 for the gate itself, but the stored `best` uses the full search (tie-break: highest Σ p_i).
- **Greedy population:** K = 400 players. Player j uses its own stream `sub(seed, "gate:greedy:" + j)` only for its choices: in each round it re-spins a dimension (within the daily allowance, free only) with probability 0.3 when the best available `S_r` gain is < 7.0; then it takes the greedy pick and slot (max current `S_r` sum) with probability 0.8, otherwise the second-best pick-and-slot. Ties are broken by its stream.
- **Random population:** K = 400 players, each with `sub(seed, "gate:random:" + j)`, using re-spins with probability 0.5 per available re-spin, then a random pick into a random open slot.
- **Rates** = the share of each population reaching 12-0. With K = 400, the greedy band 0.5-5% means 2-20 players, and random < 0.5% means at most 1 player.
- All players share the seed's battle and event streams, exactly like real players. The record is `gates = {optimal: {w,l}, greedyRate, randomRate, K: 400, gateVersion, relaxed}`.
- `gateVersion` is bumped whenever these population rules change; bank entries with an old `gateVersion` are not used.
- The parameters (K, 0.3, 7.0, 0.8, 0.5) are INFERENCE starting values, versioned in `core/config.js` and tuned so that the population means match the §7.5 player-model means over 100k seeds.
- **Time budget.** `tools/simstats.js` reports `gateCheck` time per seed (median and p99, cloud-function-equivalent Node runtime). Live generation of 50 candidates must fit within the cloud function timeout (AC 53); if the measured p99 × 50 does not fit, the bank (§5.2) is mandatory rather than primary, and the live loop relies on its 70% cut-off.

**Arguability checks** (reported by the tool): no single general appears in > 60% of optimal lineups; each role's best occupant varies across seeds; events fire in 15-30% of runs.

**Rarity line.** Daily: the live share of today's submitted daily runs at that record or better (from `daily_stats`), shown once ≥ 30 runs exist, otherwise hidden. Free: the precomputed share from the tool's distribution, written as "约 x% 的阵容能达到".

---

## 8. Screens and flows

General layout rules (mini game, single canvas):
- All content starts below the capsule: `navBottom = capsule.bottom + (capsule.top − statusBarHeight)` (reused from cheatshaizi). Nothing is drawn or tappable in the capsule's row on the right. There is no custom nav bar; the in-game back is a "‹ 返回" text button at top-left under the status bar, level with the capsule.
- The primary action sits in the bottom 40% of the screen (the thumb zone), above the bottom safe-area inset.
- Touch targets are ≥ 48 × 48 pt. Body text is ≥ 16 pt, and the record is ≥ 40 pt.
- Every network-backed area has **loading / empty / error** states as listed. Errors always offer 重试, and free play always remains available.
- Design width is 375. Must work from 320 to 430 width, and 568 to 932 height.

### 8.1 Home

```
┌───────────────────────────────────┐
│ 9:41                    [ ··· ◎ ] │ ← capsule (no content in this row, right side)
│                                   │
│            〔点 将〕 (seal)        │
│             点 将 台               │
│                                   │
│  ┌─────────────────────────────┐  │
│  │ 今日军令 · 第 12 期          │  │
│  │ 全服同一手令牌，每日一战       │  │
│  │                             │  │
│  │      [    出  征    ]        │  │ ← primary
│  └─────────────────────────────┘  │
│                                   │
│      [    自由点将 · 不限次    ]   │ ← secondary
│                                   │
│   [ 群 榜 ]  [ 好友榜 ]  [ 玩法 ]  │
│                                   │
│   🔈声音              隐私与设置   │
└───────────────────────────────────┘
```

| State | Daily card shows |
|---|---|
| Loading daily | skeleton card with "正在取今日军令…"; 自由点将 enabled |
| Daily available | 出征 |
| Daily in progress | "第 3/5 轮" plus 继续出征 |
| Daily done | "今日 10胜2负 · 霸业将成" plus 查看战报; card subline "明日 0:00 换新令" |
| Daily pending submit (offline at the end) | "战报待发送" plus 重试 |
| Daily fetch failed / offline | "今日军令需联网获取" plus 重试; 自由点将 still enabled |

- **First launch:** no consent screen and no login. The 玩法 sheet auto-opens once (three lines plus a picture, dismissible) and stays reachable through 玩法 afterwards.
- **隐私与设置:** sound toggle, the 用户隐私保护指引 link, and 联系我们/反馈 (a WeChat-provided feedback button if available [VERIFY-P0]).
- **群榜** when launched without a shareTicket: opens the 8.6 "how to see the group board" empty state.

### 8.2 Draft (翻令/点将)

```
┌───────────────────────────────────┐
│ ‹ 返回                   [ ··· ◎ ] │
│ 今日军令   第 3 / 5 轮              │
│  ┌────────┐   ┌────────┐          │
│  │   蜀   │   │  赤壁  │          │ ← tokens (faction colour + char)
│  └────────┘   └────────┘          │
│  [换势力 ×1]   [换时代 ×1]          │ ← in free play, "▶看视频再换" once spent
│ ─────────────────────────────────  │
│ 可点之将 (4)                        │
│ ┌───────────────────────────────┐ │
│ │(云) 赵云 甲  智6 信10 仁8 勇9 严8│ │ ← tap to select
│ │(亮) 诸葛亮 甲 智10 信9 …        │ │
│ │(羽) 关羽 甲 …       (已点将 dim) │ │
│ └───────────────────────────────┘ │
│ 我的阵容                            │
│ [主公 刘备 适任][军师 —][先锋 —]     │
│ [猛将 关羽 适任][守将 —]            │
│                                   │
│        [      翻  令      ]        │ ← primary; becomes 出征 after round 5
└───────────────────────────────────┘
```

Flow inside a round:
1. **Await flip:** the tokens are face down and the primary button reads 翻令.
2. **Flipped:** the tokens show, the pool list appears and the re-spin buttons become active.
3. **General selected:** a bottom sheet shows the portrait or monogram, stats as 1-10 pips, `blurb`, `statNote`, and **each open slot as a button with its fit chip and S_r** (for example "先锋 8.5 适任"). Tapping a slot places the general and closes the sheet.
4. **Placed:** the slot fills with a stamp animation. 撤回 shows for this round; the primary button reads 下一轮 (or 出征 after round 5).

| State | Behaviour |
|---|---|
| Pool loading portraits | monograms show immediately; portraits fade in when loaded |
| Re-spin unavailable | button disabled with "此令无可换" |
| Free re-spins spent (free play) | the button changes to "▶ 看视频再换 (剩 2)"; in daily/challenge it shows disabled "已用" |
| Ad loading / failed | §12 fallback |
| 返回 mid-run | confirm dialog. Daily: "本局已开始，进度会保留，可稍后继续" (no forfeit). Free: "放弃本局？" |
| App backgrounded | state is persisted after every action; on resume it restores the same round |
| Pool empty after drafts | automatic reflip with the log line (§4) |

The first-ever run shows coach marks (three bubbles: 翻令 → 选将 → 放入位置), skippable, shown once.

### 8.3 Result (battle reveal plus verdict)

```
┌───────────────────────────────────┐
│ ‹ 首页                   [ ··· ◎ ] │
│ 今日军令 · 第 12 期                  │
│ 第1战 野战  胜  胜算八成 天时平  …     │
│ 第2战 水战  胜  周瑜运筹，火攻得手      │
│ …  (rows appear one by one; tap = skip)│
│ 第9战 守城  负  吕布临阵生变          │
│ ─────────────────────────────────  │
│          十 胜 二 负                │
│        〔霸业将成〕                   │
│  "猛将如云，可惜城头少一员稳将。"       │
│  今日仅 6.2% 的主公达到此战绩          │
│ [主公 刘备 8.2][军师 诸葛亮 9.4] …    │ ← tap for breakdown
│                                   │
│ [ 分享战报 ]        [ 发起挑战 ]       │
│ [ ▶ 复盘·最佳阵容 ]  [ 看群榜/好友榜 ]  │
│        [      再来一局      ]        │
└───────────────────────────────────┘
```

| State | Behaviour |
|---|---|
| Daily: waiting for server result | "军报传递中…" with a drum loop, ≤ 5 s timeout, then the offline state |
| Daily offline at submit | lineup saved; "战报待发送" plus 重试; auto-retries on `onShow` and on launch |
| Reveal playing | 9 s; tapping anywhere skips to the verdict |
| 12-0 | the seal stamp 一统天下 slams in, 编钟 sounds, a light vibration (`vibrateShort`) |
| Breakdown open | sheet with S_r per slot, M parts, per-battle p_i and 天时 |
| 复盘 unlocked | sheet: best lineup vs yours, slot by slot, with the record difference |
| Challenge run | adds a comparison block: 你 10-2 vs 好友 11-1, both lineups revealed, and "同一手令牌" |

再来一局 always starts **free play** (the daily is done). In free play, the interstitial rule in §12 applies to this button.

### 8.4 Result share card (canvas-rendered image)

Rendered on an offscreen canvas into `toTempFilePath` at a 5:4 ratio, 500 × 400 [VERIFY-P0: recommended share image ratio and size].

Daily card (**no general names: spoiler protection**, because group members still have to play the same tokens). Decided by the founder (D4):
```
┌──────────────────────────────┐
│ 点将台 · 今日军令 第12期        │
│        十胜二负                │
│       〔霸业将成〕              │
│  主公■ 军师■ 先锋■ 猛将■ 守将■   │ ← tiles in faction colour + char (蜀/群…)
│  ●●●●●●●●○●●○  (12 battles)    │
│     同一手令，你能一统天下吗？    │
└──────────────────────────────┘
```
Free-play card: the same frame, but the tiles show monograms and names (关羽/吕布…), since free seeds are unique and there is nothing to spoil (D4). **Visual reference for the free-play card:** `docs/dianjiangtai/mockups/share-card/sanguo.png` (palette, seal, tile layout; the corner tag on the mockup is not part of the shipped card). The daily card uses the same frame with the names replaced by faction tiles.

Share title (text, ≤ 2 lines): daily "我今日 10胜2负，同一手令牌，你敢来吗？", free "关羽+吕布才 9胜3负？不服来点将". No fake system-style text, no exaggeration, no "@所有人" style wording. [COMPLIANCE]

| State | Behaviour |
|---|---|
| Card render fails | share with a static fallback image from the main package plus the text title |
| Portrait not loaded | monogram used (always available) |

### 8.5 Challenge-received entry

```
┌───────────────────────────────────┐
│                          [ ··· ◎ ] │
│           〔战 书〕                  │
│       好友向你下了一封战书             │
│   同一手令牌，TA 的战绩：十胜二负        │
│   阵容将在你出征后揭晓                  │
│                                   │
│   (if daily seed of today and you    │
│    haven't played:) 本局将作为你的       │
│    今日军令，计入今日群榜              │
│                                   │
│        [     接受挑战     ]         │
│        [   先去首页看看   ]          │
└───────────────────────────────────┘
```

| State | Behaviour |
|---|---|
| Loading challenge | "展开战书…" skeleton |
| Not found / expired (> 7 days) | "这封战书已经过期了" plus 去自由点将 / 今日军令 |
| Own challenge | "这是你发出的战书" plus the list of who has answered (count only, plus the best record) |
| Already answered | goes straight to the comparison view (8.3, challenge block) |
| Daily-seed challenge, daily already played | "你已完成今日军令，本局为友谊赛，不计入榜单" |
| Daily-seed challenge from a past date | plays as a friendly match, not ranked |
| Offline | "战书需联网展开" plus 重试 plus free play |

The sharer's nickname is **not** shown (we collect none). The card text that the sharer sent carries the personal context.

### 8.6 Group leaderboard (群榜)

```
┌───────────────────────────────────┐
│ ‹ 返回                   [ ··· ◎ ] │
│ 本群 · 今日军令 第12期                 │
│ ┌───────────────────────────────┐ │
│ │ 1 (头像) 张三   12-0 一统天下    │ │ ← open data domain canvas
│ │ 2 (头像) 李四   11-1            │ │
│ │ 3 (头像) 你     10-2            │ │
│ │ …                             │ │
│ └───────────────────────────────┘ │
│ 已出征 7 人                          │
│  [ 分享到本群 ] (voluntary)          │
└───────────────────────────────────┘
```

- **Visibility rule:** another member's lineup is visible only if the viewer has already submitted today's daily. Otherwise their row shows the record only, with "出征后可看阵容".
- The board is shown only when the game was launched from a **group** card with a `shareTicket`.

| State | Behaviour |
|---|---|
| No shareTicket | an explainer: "在群聊里点开本游戏的分享卡片，就能看到本群排行" plus an optional [分享到群] button. No reward, no count, no pressure |
| Loading | skeleton rows |
| Empty (no one in the group has played today) | "本群今天还没有人出征" plus 去出征 |
| You haven't played | your row reads "未出征" plus 去出征 |
| Error / API unavailable | "群榜暂时打不开" plus 重试; if §17 #1 fails in Phase 0, the server fallback (§11.3) applies |
| Friend data not authorized (if required [VERIFY-P0]) | your own result only, plus an explanation and a voluntary 授权 button; refusal never blocks play |

### 8.7 Friend leaderboard (好友榜)

The same layout as 8.6, titled "好友 · 今日军令". It shows friends who played today's daily, sorted by wins and then by earliest submission time. Your own row is pinned at the bottom if it is off-screen. States: loading / empty ("还没有好友出征，叫上他们？" plus a voluntary share button) / error / not authorized (as in 8.6).

### 8.8 Navigation map

```
            ┌──────── card (group/single) ────────┐
            ▼                                      ▼
 launch → Home ──出征──→ Draft ──出征──→ Result ──┬─分享战报→ native share sheet
            │                              ▲     ├─发起挑战→ native share sheet
            ├─自由点将──→ Draft (free) ─────┘     ├─复盘→ rewarded video → 复盘 sheet
            ├─群榜 → Group board                   ├─群榜/好友榜
            ├─好友榜 → Friend board                └─再来一局 → (interstitial?) → Draft (free)
            └─玩法 / 设置
 challenge card → Challenge entry ──接受挑战──→ Draft (challenge) → Result (+comparison)
```

---

## 9. Share flows [COMPLIANCE: 诱导分享]

Universal rules:
- Every share starts with an explicit user tap (`wx.shareAppMessage`), or from the capsule menu (`wx.onShareAppMessage`, `wx.showShareMenu`).
- **No share ever grants anything:** no re-spins, no 复盘, no attempts, no ranks, no cosmetics.
- The UI never depends on knowing whether a share succeeded (WeChat does not reliably report success [VERIFY-P0]).
- Nothing is shared automatically.

### 9.1 Result share
Tap 分享战报 → render the card (§8.4) → `shareAppMessage({title, imageUrl, query: "s=r&m=<daily|free>&d=<date>"})`. `withShareTicket` is enabled via `wx.updateShareMenu({withShareTicket: true})` at startup, so group recipients get a ticket.

### 9.2 Group detection (shareTicket)
- On launch and on `wx.onShow`, read `wx.getEnterOptionsSync()`: `scene`, `query`, `shareTicket`.
- A `shareTicket` is present only when the card was opened from a **group chat**. Cards opened from single chats have none [per the official share doc, fetched 2026-10-14]. The specific scene values for group vs single chat in mini games are [VERIFY-P0].
- With a ticket: home shows a banner "来自群聊 · 查看本群今日排行" which opens 8.6. The ticket is passed to the open data domain for `getGroupCloudStorage` [VERIFY-P0].
- We do **not** call `wx.getShareInfo` or decrypt `openGId` in Phase 1 unless the §11.3 fallback is activated.

### 9.3 Challenge card (同签挑战)
1. Tap 发起挑战 → cloud function `createChallenge({runId})`. The server replays and validates the run (§14.3) and returns `challengeId` (8-char base32).
2. `shareAppMessage({title: "同一手令牌，我 10胜2负，敢接战书吗？", imageUrl: card, query: "c=<challengeId>"})`. The query carries the **id only**: no lineup, no record, no seed.
3. Recipient opens the card → `query.c` → challenge entry screen (8.5) → `getChallenge(c)` returns the record, mode, date and the token sheet. The sharer's lineup is returned **only after** the recipient's run on this challenge exists.
4. Recipient plays the same token sheet → `submitRun({challengeId, actions})` → comparison view.
5. **Counting rule:** if the challenge seed is *today's* daily seed and the recipient has not yet played today's daily, the run **is** their daily attempt. The entry screen states this, and the result goes to the group and friend boards. Otherwise it is a friendly match and is never ranked. This prevents previewing today's daily through a friend's card.
6. If `createChallenge` fails (offline or error), the button falls back to a plain result share with a toast "战书未能生成，已改为分享战报".

### 9.4 Entering from any card (cold or warm start)

| Query | Destination |
|---|---|
| `c=<id>` | challenge entry (8.5) |
| `s=r` with shareTicket | home with the group banner |
| `s=r` without ticket | home |
| malformed | home, logged |

The card-open event fires once per entry (§15). A warm start via `onShow` with new enter options re-routes the same way, but never in the middle of a draft: it waits until the user returns to home and shows a toast "你有一封新战书" instead.

---

## 10. (Reserved: merged into §9)

---

## 11. Leaderboards

### 11.1 Open data domain (primary) [VERIFY-P0 for all API names and behaviour]
- On each **daily** result (server-confirmed), the main domain calls `wx.setUserCloudStorage({KVDataList: [{key: "d_<YYYYMMDD>", value: JSON}]})` with
  `{"w": 10, "l": 2, "t": <submit ts>, "x": ["shu","shu","wu","qun","shu"], "g": ["g_liubei","g_zhugeliang", ...]}`
  (wins, losses, time, slot factions, general ids in slot order). The value stays well under the KV size limit [VERIFY-P0: limits on KV count and size]. Keys older than 7 days are removed with `removeUserCloudStorage`. Who writes this key (client or server) depends on the Phase 0 outcome in §11.4.
- The main domain posts `{type: "group", shareTicket, date, viewerPlayed}` or `{type: "friend", date, viewerPlayed}` to the open data context via `postMessage`. The sub-domain calls `getGroupCloudStorage` / `getFriendCloudStorage` with `keyList: ["d_<date>"]`, sorts, and draws onto the shared canvas, which the main domain composites.
- The sub-domain is one-way and has no network access. Lineup names are resolved from a small id→name table bundled into the open data domain folder.
- Nicknames and avatars are rendered **only inside** the open data domain. Our servers never receive them. [COMPLIANCE: data minimisation]
- Free-play results are never written to cloud storage.

### 11.2 What is stored where

| Data | Where | Who sees |
|---|---|---|
| Today's daily result per user | WeChat user cloud storage `d_<date>` | friends / group members, via WeChat |
| Authoritative run records | our cloud DB `runs` | server only |
| Daily histogram | our cloud DB `daily_stats` | aggregate rarity line |

### 11.3 Fallback if `getGroupCloudStorage` is unavailable (decided after Phase 0)
- The server-side group board decrypts the group id with `wx.getShareInfo(shareTicket)` → cloud function → `openGId` [VERIFY-P0: decryption flow].
- It stores `(openGId, date, openid, record)`. Rows are shown as "群友 1/2/3…" plus records, with no names unless the user voluntarily provides a profile (Phase 2).
- This adds `openGId` to the privacy inventory (§16).

### 11.4 Leaderboard trust (C1)

**The gap.** `submitRun` validates every ranked daily on the server (§14.3), but the friend and group boards read from WeChat user cloud storage, which the **client** writes with `wx.setUserCloudStorage`. A tampered client can write any value (for example `w: 12`) to `d_<date>` without ever submitting a valid run. The server's validation does not reach the boards. The §11.3 server board does not have this gap, because it reads only `runs`.

**Phase 0 check (§17 #19, #21).** minigame-dev verifies:
1. Whether a **server-side write** to user cloud/interactive storage exists for mini games (for example the 小游戏 server API that sets a user's storage with a `session_key`-based signature, such as `set_user_storage` with `sig_method=hmac_sha256`, or the 互动型托管数据 API) [VERIFY-P0: names, parameters, rate limits].
2. Whether the cloud function can get the user's `session_key` (via `code2Session` with the AppSecret held only in the cloud environment config, never in the repo or the client) [VERIFY-P0].
3. Whether a client call to `setUserCloudStorage` can **overwrite** a key written by the server, and whether any server-side **read** of user cloud storage exists.

**Path A: a server write exists and the client cannot overwrite it.** `submitRun`, after a ranked success, writes `d_<date>` from the server's own record. The client never calls `setUserCloudStorage` for `d_` keys. This closes the gap.

**Path B: no server write, or the client can still overwrite it.** We **accept the risk for Phase 1** (it is a friends-and-groups prototype with no prizes; the worst case is an inflated row on a friend board), document it in the release checklist, and make tampering detectable:
- **Signed values.** `submitRun` returns `sig`, an Ed25519 signature by a server-held private key over `openid|dateKey|w|l|lineup` (the key is held in the cloud environment config, never committed). The client stores `sig` in the KV value. The open data domain bundles the **public** key and verifies every row. A row that fails is shown as "未验证" with no rank number and sorted below all verified rows. A tampered client cannot forge a valid signature. Binding to `openid` requires `getFriendCloudStorage`/`getGroupCloudStorage` to return each row's openid [VERIFY-P0]. If they don't, the signature binds only to the date and result, which still stops invented records (copying a real friend's record remains possible, which is low-stakes).
- **Analytics comparison.** The open data domain cannot send data back, so a direct comparison needs a server read path (Phase 0 check 3). If one exists, a nightly job compares each user's `d_<date>` value with `runs.serverRecord` for that date and logs mismatches as `board_mismatch` (count, openids hashed). If none exists, the comparison runs in the harness and in QA only, and the signed-value check is the production guard.
- **Track:** the client logs `board_write` (`path: client|server`, `w`) after each write, so analytics can at least compare declared writes with `runs`; a tampered client can suppress this, so it is a weak signal only.

Whichever path Phase 0 selects is recorded in this section and tested by AC 56.

---

## 12. Ads (IAA only) [COMPLIANCE]

| Placement | Format | Mode | Trigger | Caps |
|---|---|---|---|---|
| Extra re-spin | rewarded video | free only | tap "▶ 看视频再换" after the free re-spins are spent | ≤ 2 per run |
| 复盘 | rewarded video | free and daily (after the result) | tap "▶ 复盘·最佳阵容" | 1 per run; once unlocked, it stays viewable for that run |
| Between runs | interstitial | free only | on 再来一局 after the 3rd, 6th, 9th… completed free run **of the session** | not before the user's 4th lifetime completed run; ≥ 120 s apart; ≤ 5 per day; never in daily, challenge, card-entry first runs, the draft or the reveal |
| Banner | none in Phase 1 | | | |

Rules:
- The reward is granted only when the rewarded video closes with `isEnded === true`. Closing early grants nothing and shows "完整观看才能获得".
- **Ad load error or no fill (founder decision D6):** grant the reward anyway, at most once per run per placement, with the toast "暂无广告，本次免费". A second failure for the same placement in the same run shows "暂无广告，请稍后再试" and grants nothing. This is acceptable because neither reward affects any leaderboard. Phase 0 still checks that 流量主 rules allow it [VERIFY-P0]; if they don't, the fallback is "稍后再试" with no grant.
- Ad buttons always show a ▶ video icon and the word 视频. Ads never auto-play, and no ad sits adjacent to a primary button (to prevent mis-taps, which matters for older users).
- **Phase 1 ad stub (approved, D5):** if ad unit ids are unavailable (流量主 likely needs the entity and a UV threshold [VERIFY-P0]), the ad module runs in `stub` mode: a 3-second "广告位（测试）" overlay with skip/complete buttons, so tap-intent and placement analytics still work. The stub is a config flag that is off in production builds.
- Rewarded videos are always optional, and the game is fully completable without them.

---

## 13. Client data bindings per screen

These are view models that frontend-ui (rendering) and minigame-dev (logic and state) agree on. All strings are pre-formatted by logic, not by the rendering code.

```ts
// Home
{ daily: { state: 'loading'|'available'|'inProgress'|'done'|'pendingSubmit'|'error'|'offline',
           issueNo: number, dateKey: string, round?: number, record?: {w:number,l:number}, bandLabel?: string },
  hasGroupTicket: boolean, muted: boolean, showHowToOnce: boolean }

// Draft
{ mode: 'daily'|'free'|'challenge', round: 1..5,
  phase: 'awaitFlip'|'flipped'|'selecting'|'placed'|'readyToMarch',
  tokens: { faction: {key,label,color}, era: {key,label} } | null,
  respin: { faction: {free:0|1, enabled:boolean}, era: {free:0|1, enabled:boolean},
            adLeft: 0..2, adAllowed: boolean, adState: 'idle'|'loading'|'playing'|'error' },
  pool: [{ id, name, monogram, portraitUrl|null, tier, stats:{zhi,xin,ren,yong,yan}, drafted:boolean }],
  selected: { generalId, blurb, statNote, slotOptions:[{slot,label,score,fit:'good'|'ok'|'bad'}] } | null,
  lineup: [{ slot, label, generalId|null, name|null, score|null, fit|null }],   // 5 entries, fixed order
  canUndo: boolean, primaryLabel: '翻令'|'下一轮'|'出征' }

// Result
{ mode, status: 'waitingServer'|'pendingSubmit'|'revealing'|'done'|'error',
  record: {w,l}, band: {key,label}, comment: string, rarityText: string|null,
  battles: [{ i, typeLabel, win:boolean, chanceText, luckText, cause, event:string|null }],
  lineup: [{ slot, name, score, fit }], morale: { total, lord, bonds:[string], cohesion },
  replay: { unlocked:boolean, adState, best?: { lineup:[{slot,name,score}], record:{w,l} } },
  challenge?: { theirRecord:{w,l}, theirLineup:[{slot,name}]|null },
  interstitialDue: boolean }

// Challenge entry
{ status: 'loading'|'ready'|'expired'|'own'|'answered'|'offline'|'error',
  theirRecord:{w,l}, mode, countsAsDaily:boolean, isFriendly:boolean, answerCount?:number }

// Leaderboards (main domain; the rows themselves live in the open data domain)
{ kind:'group'|'friend', dateKey, issueNo, hasTicket:boolean,
  state:'loading'|'ready'|'empty'|'noTicket'|'error'|'unauthorized', viewerPlayed:boolean }
```

---

## 14. Backend (WeChat Cloud Development)

Identity is always `OPENID` from the cloud function context, never from client input. No `wx.getUserProfile` or user-info calls. All collections deny direct client reads and writes; access goes only through cloud functions. `core/` (sheet, sim, validate, config, content) is shared with the client by copy, with a drift test (cheatshaizi pattern).

### 14.1 Collections

| Collection | Key fields | Notes |
|---|---|---|
| `daily_seeds` | `_id: YYYYMMDD`, `seed`, `issueNo`, `contentVersion`, `configVersion`, `rounds[5]`, `best: {lineup, record}`, `gates: {...}`, `source: bank/live`, `attempts`, `genMs`, `createdAt` | `best` is never returned before the user's result exists |
| `daily_seed_bank` | `_id`, `seed`, `contentVersion`, `configVersion`, `gateVersion`, `best`, `gates`, `used:boolean`, `usedFor?: YYYYMMDD`, `importedAt` | offline-generated accepted seeds (§5.2); imported via the cloud console; never committed to the repo |
| `runs` | `_id`, `openid`, `clientRunId`, `mode`, `dateKey`, `seed`, `challengeId?`, `actions[]`, `serverRecord {w,l}`, `clientRecord?`, `mismatch:boolean`, `contentVersion`, `startedAt`, `submittedAt` | unique (`openid`, `clientRunId`); unique (`openid`, `dateKey`) where `ranked=true` |
| `daily_starts` | `openid`, `dateKey`, `startedAt` | one per openid per date |
| `challenges` | `_id: challengeId`, `ownerOpenid`, `runId`, `mode`, `seed`, `dateKey`, `rounds`, `record`, `lineup`, `createdAt`, `expiresAt (+7d)`, `answerCount`, `bestAnswer` | lineup is withheld from the recipient until they have answered |
| `daily_stats` | `_id: YYYYMMDD`, `hist[13]`, `total` | incremented atomically on each ranked submit |
| `events` | `openid`, `sessionId`, `name`, `props`, `ts`, `clientTs` | analytics (§15) |

### 14.2 Cloud functions

| Function | In | Out | Notes |
|---|---|---|---|
| `getDaily` | `{}` | `{dateKey, issueNo, rounds, serverNow, myStatus: none/started/done, myRecord?}` | creates the seed lazily if the scheduled job missed |
| `genDaily` (timer, 23:00 BJT) | | | writes the next day's seed: next matching `daily_seed_bank` entry first, live §7.5.1 gate loop as fallback (stops at 50 candidates or 70% of the timeout); idempotent; must finish within the cloud function timeout [VERIFY-P0] |
| `startRun` | `{mode, clientRunId, dateKey?, challengeId?}` | `{ok, resumed}` | logs `daily_starts` for ranked runs |
| `submitRun` | `{clientRunId, mode, dateKey?, seed?, challengeId?, actions[], clientRecord?}` | `{record, battles[], band, rarity, ranked, sig?, challengeCompare?}` | §14.3. `sig` only on ranked results under §11.4 Path B. Idempotent: the same `clientRunId` returns the stored result |
| `getReplay` | `{runId}` | `{best}` | only for the caller's own completed run |
| `createChallenge` | `{runId}` | `{challengeId}` | only for the caller's own validated run; one challenge per run (repeat calls return the same id) |
| `getChallenge` | `{challengeId}` | §13 challenge entry model plus `rounds` | lineup only if the caller has answered |
| `track` | `{events[]}` (≤ 50 per batch) | `{ok}` | rate-limited per openid |

### 14.3 Server-side score validation (`submitRun`)
1. Load the seed: daily from `daily_seeds[dateKey]`, challenge from `challenges`, free from the request.
2. Rebuild the token sheet from the seed. Replay `actions[]` in order and reject on: a pick not in the round's pool, a duplicate general or slot, a re-spin beyond the allowance for the mode (ad re-spins in daily or challenge → reject), a re-spin after a pick, fewer or more than 5 picks, or an unknown `contentVersion`.
3. Simulate on the server; the **server record is authoritative**. If `clientRecord` differs, set `mismatch=true` and log it (for bug detection).
4. Ranked daily: require a `daily_starts` row for (openid, dateKey). Reject a second distinct ranked run with `ALREADY_PLAYED`, returning the existing result. Accept submissions for date D until **D+1 00:30 BJT** if the start was logged on D (midnight grace).
5. On a ranked success: increment `daily_stats` and return the rarity. The `d_<date>` board value is then written as decided in Phase 0 (§11.4): **Path A**, the server writes it from `serverRecord`; **Path B**, the server returns `sig` and the client writes the value plus `sig` with `setUserCloudStorage`.

Error codes: `INVALID_ACTIONS`, `ALREADY_PLAYED`, `SEED_NOT_FOUND`, `CHALLENGE_EXPIRED`, `LATE_SUBMIT`, `RATE_LIMITED`.

---

## 15. Analytics events

Sent through `track` (batched, flushed on result, on hide, and every 20 s), plus `wx.reportEvent` if available [VERIFY-P0]. Common props: `sessionId` (a new uuid on each cold start, or a warm start after > 30 min in the background), `ts`, `isNewUser` (first-ever session on this Beijing date), `contentVersion`, `appVersion`.

| Event | Props | Fires when |
|---|---|---|
| `session_start` | `scene`, `fromCard: none/result/challenge`, `hasShareTicket`, `challengeId?` | cold start, or a warm start with a new session |
| `card_open` | `cardKind: result/challenge`, `hasShareTicket`, `challengeId?`, `isNewUser` | launch or `onShow` with share query params (once per entry) |
| `run_start` | `runId`, `mode`, `source: home/replay_button/card/challenge` | first 翻令 |
| `respin` | `runId`, `round`, `dim: faction/era`, `src: free/ad` | re-spin applied |
| `draft_pick` | `runId`, `round`, `generalId`, `slot`, `fit` | general placed |
| `draft_undo` | `runId`, `round` | 撤回 |
| `run_complete` | `runId`, `mode`, `wins`, `durationMs`, `respinsFree`, `respinsAd`, `events[]` | verdict shown |
| `run_abandon` | `runId`, `mode`, `round` | 返回 confirmed in free play, or a session ended mid-run |
| `reveal_skip` | `runId`, `atBattle` | tap to skip |
| `share_tap` | `runId?`, `kind: result/challenge/group_invite/menu`, `mode`, `wins?` | share API called |
| `challenge_created` | `challengeId`, `mode`, `wins` | server returned an id |
| `challenge_answered` | `challengeId`, `myWins`, `theirWins`, `countsAsDaily` | challenge result shown |
| `board_view` | `kind: group/friend`, `state` | board screen shown |
| `ad_request` / `ad_show` / `ad_reward` / `ad_close_early` / `ad_error` | `placement`, `stub:boolean`, `errCode?` | ad lifecycle |
| `interstitial_show` | `runsThisSession` | |
| `board_write` | `dateKey`, `path: client/server`, `w` | after the `d_<date>` value is written (§11.4) |
| `board_mismatch` (server-side) | `dateKey`, `count`, `openidHashes[]` | nightly comparison of board values with `runs.serverRecord`, only if a server read path exists (§11.4) |
| `daily_gen` (server-side) | `dateKey`, `source: bank/live`, `attempts`, `genMs`, `relaxed`, `bankLeft` | each `genDaily` run (§5.2) |
| `error` | `where`, `code` | any handled error state shown |

**Metric definitions (go/kill)**
- **Share rate** = distinct `runId`s with ≥ 1 `share_tap` (kind result or challenge) ÷ `run_complete` count. Go ≥ 10%, kill < 4%.
- **Card-open-to-play** = `card_open` entries followed by a `run_start` in the same session ÷ `card_open` entries. Go ≥ 25%.
- **Runs per session** = `run_complete` ÷ sessions with ≥ 1 `run_start`. Go ≥ 3, kill < 2.
- **D1** = users whose first `session_start` is on Beijing date N and who have any `session_start` on N+1 ÷ new users on N. Go ≥ 35%.
- Secondary: daily participation, challenge answer rate, ad completion rate, reveal skip rate, and the distribution of wins against the §7.5 targets.

---

## 16. Privacy data inventory (for the 用户隐私保护指引) [COMPLIANCE]

| Data | Purpose | Source | Stored | Retention |
|---|---|---|---|---|
| OpenID | identify runs, enforce one daily attempt, challenges | cloud function context | `runs`, `daily_starts`, `challenges`, `events` | 180 days (D7), then deleted or aggregated by a scheduled cleanup |
| Game records (lineups, actions, results, timestamps) | scoring, validation, leaderboards, 复盘 | gameplay | `runs`, `challenges`, `daily_stats` (aggregate) | as above; aggregates kept |
| Today's result in WeChat user cloud storage | friend and group boards | `setUserCloudStorage` | WeChat platform | 7 days (we remove older keys) |
| Friend and group-member nickname/avatar/result | render boards | WeChat open data domain | **not received by us** | n/a. Declare if WeChat treats friend-relationship access as a privacy interface [VERIFY-P0] |
| shareTicket / scene / query | route card entries, group boards | enter options | not stored (only `hasShareTicket` boolean in events) | n/a |
| openGId | only if the §11.3 fallback is activated | `getShareInfo` + decrypt | `group_scores` | 30 days |
| Analytics events | go/kill metrics, bug fixing | client | `events` | 180 days |
| Device: platform, WeChat version, screen size | layout, debugging | `getWindowInfo` / `getDeviceInfo` | `events` props (platform only) | 180 days |
| Ad data | ad delivery | WeChat ad SDK (platform-handled) | not by us | per WeChat |

**Not collected:** nickname or avatar to our servers, phone, location, album, contacts, microphone, camera, clipboard, ID number, payment data.
Privacy-API flow: if any API we call is classified as a privacy interface, use WeChat's privacy authorization flow (for example `wx.onNeedPrivacyAuthorization` / `requirePrivacyAuthorize`), triggered only on the user action that needs it, never at launch, and refusal never blocks play [VERIFY-P0: applicability to mini games and to the open data domain].
Real-name and anti-addiction integration for IAA games: [VERIFY-P0]. Data is stored in mainland WeChat Cloud only, with no cross-border transfer.

---

## 17. Needs verification in Phase 0

Phase 0 (D13) is exactly this list: platform-API verification plus the compliance/legal check, about 3-5 days, before any code. Owner: minigame-dev (APIs), plus the founder and counsel (policy). Each item has a fallback so Phase 1 is not blocked. Outcomes are written back into the referenced sections before Phase 1 starts.

| # | Item | Fallback if it fails |
|---|---|---|
| 1 | `wx.getGroupCloudStorage(shareTicket)` still available in 2026 for mini games | §11.3 server group board via `getShareInfo` |
| 2 | Open data domain APIs (`getOpenDataContext`, `postMessage`, `setUserCloudStorage`, `getFriendCloudStorage`, `removeUserCloudStorage`), KV limits, and whether friend-relationship authorization is now required | the unauthorized state in 8.6/8.7; server board |
| 3 | `wx.getShareInfo` decryption flow and `openGId` | group boards Phase 2 only |
| 4 | Whether `shareAppMessage` reports success, and whether the sharer receives a shareTicket | already designed to not depend on it |
| 5 | Mini game scene values for single vs group chat cards | rely on `shareTicket` presence only |
| 6 | Current 小游戏运营规范 text on 诱导分享; that the result, challenge and group-invite designs comply | adjust copy and placement |
| 7 | That a rewarded-video re-spin in free play is not "paid randomness" | remove ad re-spins; 复盘 only |
| 8 | 流量主 eligibility and threshold, ad unit availability for the prototype, interstitial timing rules, the rule for granting a reward on no-fill | stub ads (§12) |
| 9 | IAA-only 版号 exemption, 软著, self-review, real-name and anti-addiction requirements for IAA | blocks release only, not the prototype |
| 10 | The founder's company registers the game (D9). Confirm it is a mainland-China entity with game-category access, and its 流量主 eligibility (§19 Q1) | blocks release and real ads only; Phase 1 runs with stub ads (D5) |
| 11 | Privacy authorization API flow for mini games; which of our APIs count as privacy interfaces | add consent at the point of use |
| 12 | Subpackage and total package limits, remote CDN domain whitelist and filing for portrait hosting | all portraits in subpackages |
| 13 | Recommended share image ratio and size (5:4 assumed) | adjust render size |
| 14 | `wx.reportEvent` / 自定义分析 availability for mini games | own `track` function only |
| 15 | `updatableMessage` / activity id for mini games (Phase 2) | n/a |
| 16 | How 《人工智能生成合成内容标识办法》 (in force 2025-09-01) applies to AI-generated in-game portraits: explicit and implicit (metadata) labels, where they must appear, and store-listing disclosure (counsel). Also the copyright position of AI output with a human-edit trail (direction §6) | apply the strictest reading (visible label in the general detail sheet plus metadata labels); commissioned art for any asset counsel won't clear. Phase 1 is unaffected (monograms only) |
| 17 | Feedback button API (`createFeedbackButton`) availability | a text link to a 客服 or contact page |
| 18 | WeChat PC/Mac support for mini games and how the layout behaves | portrait letterbox |
| 19 | A **server-side write** to user cloud/interactive storage for mini games (e.g. the 小游戏 server API that sets a user's storage with a `session_key` signature, `sig_method=hmac_sha256`), its parameters and rate limits, and whether the cloud function can obtain `session_key` via `code2Session` (AppSecret only in the cloud environment config) | §11.4 Path B: accept the risk for Phase 1, signed values plus detection |
| 20 | Cloud function **timeout** (default and configurable maximum, including timer triggers) and the measured `gateCheck` time per seed, so `genDaily` fits (AC 53) | 30-day seed bank is mandatory; live loop cut off at 70% of the timeout, relaxed seed if needed (§5.2) |
| 21 | Whether a client `setUserCloudStorage` can overwrite a server-written key; whether any server-side **read** of user cloud storage exists; whether `getFriendCloudStorage`/`getGroupCloudStorage` return each row's openid | Path B; mismatch comparison in harness and QA only; signature bound to date and result only |

---

## 18. Edge cases

1. **Offline at launch:** free play works fully (content bundled, monograms always available). The daily card shows the offline state. Boards show the error state.
2. **Offline mid-daily:** the draft continues. At 出征, the lineup and actions are stored with status `pendingSubmit`. Retries happen on `onShow`, on launch, and on the 重试 tap. The result is shown when the server answers.
3. **Duplicate submission** (double tap, retry after a timeout): the same `clientRunId` returns the stored result and does not double-count `daily_stats`.
4. **Second daily attempt** (reinstall, other device, cleared storage): `getDaily` returns `myStatus: done` and the client shows the done state. A crafted second `submitRun` gets `ALREADY_PLAYED` with the first result. Because the attempt is anchored on `startRun`, restarting still gives the same tokens, and the result stays server-computed.
5. **Midnight in Beijing time:**
   - (a) A run started on D and submitted after 00:00 counts for D until 00:30 (grace), else `LATE_SUBMIT`. The client shows "军令已过期，本局记为友谊赛" and keeps the result locally as a friendly.
   - (b) On `onShow`, the client compares the cached `dateKey` with server time (`serverNow` offset from the last `getDaily`). If the day has changed, it refetches and the home card updates.
   - (c) An open board for date D stays labelled with D's issue number.
   - (d) A device clock or timezone is never used for the date key.
6. **Stale daily cache:** a cached `rounds` for D is never used on D+1. Each cache entry is keyed by `dateKey`.
7. **Challenge edge cases:** expired, not found, own challenge, already answered, daily-seed challenge after the day ended (friendly), opened mid-draft (deferred with a toast), or content version retired (expired message).
8. **Card with a shareTicket opened from a single chat or a forwarded copy:** no ticket, so no group banner; the board shows the explainer.
9. **Ad edge cases:** ad closed early (no reward), load error (fallback grant once), ad shown while the app goes to the background (reward evaluated on close), an interstitial cap reached (skip silently).
10. **Portraits fail to load or the subpackage download fails:** monogram fallback. A subpackage load error is logged once.
11. **Empty pool after drafts:** automatic reflip (§4).
12. **Rapid taps or a second finger:** single-finger routing (cheatshaizi). The primary button is debounced for 300 ms. Taps during token flips are ignored.
13. **App killed during the reveal:** the result is already computed and stored. On relaunch the verdict shows without replaying the reveal.
14. **Small screens (320 × 568) and large system font settings:** the pool list scrolls, the lineup collapses to two rows, and no text is truncated in the record or band.
15. **Server/client record mismatch:** the server value is shown; the event is logged with both values.
16. **Content version bump while a run is in progress:** the run keeps its pinned `contentVersion`, and the server keeps the last 2 versions.
17. **Seed bank empty or out of date** (content/config/gate version bump): `genDaily` falls back to live generation (§5.2); if nothing passes, the relaxed seed is used and an alert is logged. The daily always opens.
18. **Unverified board row** (Path B, signature check fails): the row shows "未验证" without a rank number, below all verified rows (§11.4).

---

## 19. Open questions for the founder

All earlier questions are decided (§0, D1-D13). One item stays open:

1. **Entity status.** The founder's company registers the game (D9). Is it a mainland-China entity with game-category access (and therefore eligible for 备案 and 流量主)? To be confirmed in Phase 0 (§17 #10). It blocks release and real ads, not the Phase 1 prototype (stub ads, D5).

---

## 20. Acceptance criteria (Phase 1)

QA tests these against this spec. "Daily" means the daily 军令. Tests may use the fake-`wx` harness and a seeded config.

**Loop and content**
1. From home, a free run is completable in 5 rounds: each round requires 翻令, then one pick placed into one empty slot. After round 5 the primary button reads 出征.
2. Each pool lists only undrafted generals whose `faction` equals the faction token and whose `eras` include the era token.
3. A general cannot be drafted twice in a run, and a slot cannot hold two generals.
4. 撤回 is available after placing and before the next 翻令, and restores both the pool and the slot.
5. The selection sheet shows all five stats (1-10) and, for each open slot, a fit chip with text (适任/可用/错位) and `S_r` to one decimal, matching §3.4 for the content table.
6. `tier` never changes the probability of any cell or general appearing (verified by the tool: cell frequencies over 100k seeds are independent of tiers).
7. Content passes validation: exactly 32 generals (8 per faction 蜀/魏/吴/群), all fields of §3.5 present, stats are integers 1-10 and match Appendix B, all 16 Phase 1 faction-era cells have ≥ 2 generals (77 general-cell entries, cell sizes as in Appendix B), and no label in the content matches the forbidden-terms list (82-0, NBA, 武力, 统率, 政治, 魅力, SSR, 抽卡).

**Spin and re-spin**
8. In each mode, 换势力 and 换时代 can each be used once for free per run, only after the flip and before the pick of that round. The re-rolled dimension changes and the other stays the same.
9. In free play, after the free re-spins are spent, the ad re-spin is offered at most 2 times per run. In daily and challenge runs no ad re-spin is ever offered.
10. When no valid alternative exists, the re-spin button is disabled with "此令无可换".
11. Given the same seed and the same actions, the token sheet, re-spin results, battle log and record are identical across 1,000 replays on the client and in the cloud function.

**Simulator and grading**
12. The record always sums to 12, and the band shown matches the §7.5 table for every value 0-12.
13. Monotonicity: for a fixed seed with events disabled, raising any stat of any drafted general never lowers the number of wins.
14. Events fire only under their stated conditions, at most once each per run, and every firing shows a named log row.
15. The tuning tool over 100k seeds reports results within the §7.5 bands for the sensible model, random mean 4.5-5.5, greedy 12-0 ≤ 5%, and optimal 12-0 on ≥ 95% of free seeds. The build fails CI if not.
16. 复盘 returns a lineup that is drawable from the player's final tokens and whose record is ≥ the player's record. It completes in < 300 ms on the reference mid-range Android for Phase 1 content (32 generals), including the worst case reported by `tools/simstats.js`; otherwise the free-play 复盘 is served by `getReplay` (§7.4).
17. The reveal shows 12 rows sequentially in ≤ 10 s total. A tap skips to the verdict, and the verdict is identical whether or not the reveal was skipped.
18. Outcomes do not depend on ads watched, run count, new-user status or mode, beyond the documented re-spin allowance (a test runs the same seed and actions under each condition).

**Daily seed**
19. Two different users calling `getDaily` on the same Beijing date receive an identical `rounds` and `issueNo`. The response contains no battle stream and no best lineup.
20. The date key is derived from server time in UTC+8. A device set to another timezone or a wrong date still gets the server's date.
21. Each accepted daily seed satisfies the §7.5 daily gates as computed in §7.5.1 (recorded in `gates`), unless `gates.relaxed = true`, which is logged as an alert.
22. One ranked daily result per openid per date. A second `submitRun` with a new `clientRunId` returns `ALREADY_PLAYED` and the original result. A resubmission with the same `clientRunId` returns the same result without incrementing `daily_stats`.
23. A daily started at 23:59 BJT on D and submitted at 00:10 on D+1 is ranked for D. One submitted at 00:31 returns `LATE_SUBMIT`, and the client shows the friendly-match message.
24. After midnight BJT, bringing the app to the foreground refreshes the home daily card to the new issue without a restart.
25. An in-progress daily survives killing and relaunching the app, at the same round with the same tokens.

**Server validation**
26. `submitRun` rejects with `INVALID_ACTIONS`: a pick outside the round pool, a duplicate general, an ad re-spin in daily or challenge, a re-spin after a pick, or not exactly 5 picks.
27. The server record is the one displayed and stored; a tampered `clientRecord` sets `mismatch=true` and has no effect.
28. All collections deny direct client reads and writes (verified with security-rule tests). Every function derives identity from the context OPENID.

**Sharing and challenges** [COMPLIANCE]
29. No reward, re-spin, attempt, rank or content is granted or unlocked by sharing anywhere in the game (code search plus manual test of every share entry point).
30. Every share is started by an explicit user tap or by the capsule menu. Nothing calls `shareAppMessage` automatically.
31. The daily share card contains no general names. The free share card contains the names. Both render the record and band, and fall back to the static image if rendering fails.
32. A challenge card's query contains only `c=<id>`. Opening it shows the challenge entry with the sharer's record and **without** their lineup. The lineup appears only after the recipient's run on that challenge is submitted.
33. A challenge on today's daily seed, opened by a user who has not played today's daily, states that it counts as the daily, and on completion it appears on the boards. If the user has already played, it is labelled a friendly match and is not ranked.
34. Expired, non-existent and own challenges each show their specific state from §8.5.
35. Opening any card from a group chat routes to home with the group banner when a `shareTicket` is present. With no ticket, no banner shows.

**Leaderboards**
36. After a ranked daily result, the user's `d_<date>` key is written with the §11.1 value. Free-play results are never written.
37. The group board launched with a valid shareTicket lists only that group's members who played today, sorted by wins descending, then by submit time ascending. Without a ticket it shows the explainer, whose share button grants nothing.
38. On either board, other players' lineups are hidden until the viewer has a ranked result for that date.
39. Loading, empty, error and unauthorized states render as specified in 8.6 and 8.7, and none of them blocks returning to home or playing.

**Ads**
40. A rewarded reward is granted only on `isEnded === true`. Closing early grants nothing and shows the message.
41. On ad load error or no fill, the reward is granted at most once per run per placement with the "暂无广告，本次免费" toast. A second failure for the same placement in the same run grants nothing and shows "暂无广告，请稍后再试".
42. Interstitials appear only on 再来一局 in free play: never before the user's 4th lifetime completed run, at most 1 per 3 completed free runs in a session, ≥ 120 s apart, ≤ 5 per day, and never in daily or challenge flows, the draft, or the reveal.
43. With `adMode=stub`, every placement shows the test overlay and logs the ad events with `stub=true`. Production config has stub off (release check).

**UX and platform**
44. On 375 × 812 with the capsule at the test rect (as in the cheatshaizi smoke test), no tappable element overlaps the capsule's row on the right. All primary buttons are within the bottom 40% and above the safe-area inset.
45. All touch targets are ≥ 48 × 48 pt, body text ≥ 16 pt, and the record ≥ 40 pt. Layout holds at 320 × 568 and 430 × 932 with no clipped text.
46. No login, user-info or permission prompt appears on first launch or during a free run. A full free run is possible with zero authorizations.
47. Offline: free play works from cold start. The daily, boards and challenges show their offline states with 重试.
48. Main package ≤ 4 MB (CI check). Portraits, display fonts and audio load from subpackages or CDN.
49. The mute setting persists across launches and silences all game audio.
50. The forbidden-terms check (item 7 list, plus 82-0/NBA/三国志/三国杀/光荣/Koei) passes on all user-visible strings, share titles and store copy.

**Analytics**
51. Every event in §15 fires exactly once per its trigger, with the listed props (verified in the harness by capturing `track` payloads through a scripted session: card open → challenge run → share → 2 free runs → interstitial → board view).
52. The four go/kill metrics can be computed from the `events` collection using the §15 definitions (QA provides one query per metric, run against the harness session data).

**Daily seed generation (C2)**
53. `genDaily` completes within the cloud function timeout (value [VERIFY-P0], §17 #20) on both paths: the bank path, and the live path with an empty bank and a forced worst case (no candidate passes). The live loop stops at 50 candidates or 70% of the timeout, and `genMs` is recorded on the `daily_seeds` document.
54. With a seeded `daily_seed_bank`, `genDaily` uses the next unused entry whose `contentVersion`, `configVersion` and `gateVersion` match, re-verifies the stored best lineup scores 12-0, marks the entry `used`, and records `source: bank`. Non-matching entries are skipped. With < 7 entries left it logs a warning; with none it falls back to live generation and records `source: live`. No bank file is present in the repo (CI check).
55. `gateCheck` for a given seed returns an identical `gates` record in `tools/simstats.js` and in the cloud function. Greedy and random rates are the share of K = 400 simulated players reaching 12-0, each player using its own `sub(seed, "gate:greedy:"/"gate:random:" + j)` stream for choices only, sharing the seed's battle and event streams (§7.5.1).

**Leaderboard trust, retention, content (C1, D7, D10, D8)**
56. The leaderboard write follows the Phase 0 path recorded in §11.4. Path A: the client never calls `setUserCloudStorage` for `d_` keys, and the server-written value equals `runs.serverRecord`. Path B: a value written by a tampered harness client (e.g. `w: 12` with no or a forged `sig`) shows as "未验证" with no rank, below verified rows; a valid run's row verifies. On either path `board_write` fires once per write, and the risk acceptance is recorded in the release checklist.
57. Run records, `daily_starts`, `challenges` and `events` older than 180 days are deleted (or aggregated) by a scheduled cleanup; `daily_stats` aggregates are kept. The privacy guide states 180 days.
58. The Phase 1 build contains no portrait image files: every general renders its monogram. No portrait image assets are committed under `apps/dianjiangtai/` (CI check); Phase 2 portraits are loaded from CDN/cloud storage only.
59. Every 临阵生变 log line comes from the fixed template list in content, the list contains no insulting wording, and the release checklist records its content review before any submission.

---

## 21. Phase 2 (later, out of Phase 1 scope)

- **Content:** 120-160 generals with final AI-generated portraits (D10, direction §6: style guide, prompt/seed log, human review, AIGC labelling, CDN hosting); the 晋 faction and 归晋 era; generals with multiple faction appearances (吕布, 赵云 early career, 姜维…); more bonds; a content review pass and the provenance log.
- **识人模式:** stats hidden during the draft and revealed at the result (a daily variant).
- **擂台 (challenge-holder) mode** on the 社交擂台赛 component, if access is confirmed [VERIFY-P0].
- **Updatable challenge cards** ("已有 3 位好友应战，最高 11-1") via `updatableMessage` [VERIFY-P0].
- **Subscribe message** "好友接下了你的战书", only after an explicit opt-in tap (`requestSubscribeMessage`) [VERIFY-P0].
- **Streaks** (consecutive daily participation) on the friend board, and a daily history archive. No streak rewards that need sharing.
- **Save card to album** (needs the album permission at the point of use, never forced). [COMPLIANCE]
- **视频号 clip of the reveal** [VERIFY-P0].
- **Banner A/B** on the board screens only; interstitial tuning from Phase 1 data.
- **Anti-cheat hardening:** progressive token delivery per round for the daily, and anomaly detection on `mismatch`.
- **Expansion themes:** 水浒, 西游, and a cross-era 关公战秦琼 mode; 盲排 (blind ranking of five generals) as a side mode.
- **Accessibility:** large-text mode, high-contrast mode, and screen reader labels where the platform supports them.
- **Release compliance:** 备案, 软著, privacy guide final text, anti-addiction and real-name integration, 流量主, and the trademark filing. Owned by release, tracked in `docs/dianjiangtai/release-checklist.md`.

---

## Appendix A: Reuse from `apps/cheatshaizi/mini-game/`

| Asset | Reuse | Notes |
|---|---|---|
| `js/main.js` scene loop | Yes | `app.go(scene)`, dirty-flag repaint (only repaints when something changes), `requestAnimationFrame`, `wx.onShow` invalidate |
| `navBottom()` capsule logic, `js/layout.js` pattern | Yes | all sizes in one layout module |
| Single-finger touch routing | Yes | protects against multi-touch mis-taps |
| `app.image()` cache | Yes, extend | add remote/subpackage URLs and a monogram fallback |
| `core/rng.js` (mulberry32 `seededRng`, `pick`, `shuffle`) | Yes, as is | the base of every seed stream; add `hash32` and `sub(seed,name)` |
| `core/` vs `js/` split with copy plus drift test | Yes | here `core/` is copied into the cloud function instead of the mini-program |
| `tests/smoke.test.js` fake-`wx` harness (`node:test`, no build) | Yes, extend | add fakes for `cloud.callFunction`, `shareAppMessage`, `getEnterOptionsSync`, `createRewardedVideoAd`, `createInterstitialAd`, `getOpenDataContext` |
| `tools/stats.js` (mini-program) distribution tool | Pattern | becomes `tools/simstats.js` (§7.5) |
| Dice, cup and cheat logic (`cheat.js`, `lucky.js`, `insane.js`) | **No** | rigged outcomes are explicitly against pillar 3 |

---

## Appendix B: Phase 1 roster (32)

32 historically grounded generals (D3): 8 蜀, 8 魏, 8 吴, 8 群, each with one Phase 1 faction (§3.2) and every era with notable recorded activity (§3.3). Sources: 《三国志》 and 裴松之注, with 《三国演义》 colour where noted (all public domain). Stats (§3.1, 1-10) are our own judgement (INFERENCE), a first draft that `tools/simstats.js` tunes; any change bumps `contentVersion`, and each general's `statNote` in the content file records the rationale. Tier follows §3.5 (甲 ≥ 38, 乙 30-37, 丙 ≤ 29). Role = `primaryRole` (display only). Eras: 黄巾 HJ (184-189), 群雄 QX (190-207), 赤壁 CB (208-214), 三分 SF (215-234).

| Fac. | General (字) | Eras | 智 | 信 | 仁 | 勇 | 严 | Total · tier | Role | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| 蜀 | 刘备 (玄德) | HJ QX CB SF | 7 | 8 | 10 | 6 | 7 | 38 甲 | 主公 | 起兵讨黄巾; d. 223. Bond 桃园 |
| 蜀 | 关羽 (云长) | HJ QX CB SF | 6 | 10 | 6 | 10 | 7 | 39 甲 | 猛将 | 斩颜良; d. 219. Bond 桃园 |
| 蜀 | 张飞 (益德) | HJ QX CB SF | 4 | 9 | 4 | 10 | 6 | 33 乙 | 猛将 | 长坂; 仁4: 鞭挞健儿; d. 221. Bond 桃园 |
| 蜀 | 诸葛亮 (孔明) | CB SF | 10 | 9 | 8 | 3 | 9 | 39 甲 | 军师 | joins 207/208; 北伐 to 234 |
| 蜀 | 赵云 (子龙) | QX CB SF | 6 | 10 | 8 | 9 | 8 | 41 甲 | 猛将 | QX includes service under 公孙瓒 (simplification); §3.5 example |
| 蜀 | 马超 (孟起) | QX CB SF | 5 | 4 | 5 | 10 | 6 | 30 乙 | 先锋 | QX/CB with 马腾 and 关中 forces (平阳 202, 潼关 211; simplification); joins 刘备 214 |
| 蜀 | 黄忠 (汉升) | CB SF | 5 | 8 | 6 | 9 | 7 | 35 乙 | 先锋 | joins 刘备 c. 209; 定军山 219 |
| 蜀 | 姜维 (伯约) | SF | 8 | 8 | 6 | 8 | 7 | 37 乙 | 军师 | joins 蜀 228 |
| 魏 | 曹操 (孟德) | HJ QX CB SF | 9 | 6 | 6 | 7 | 10 | 38 甲 | 主公 | 颍川 vs 黄巾 184; 严10: 割发代首; d. 220 |
| 魏 | 张郃 (儁乂) | HJ QX CB SF | 7 | 6 | 5 | 8 | 8 | 34 乙 | 先锋 | HJ: enlisted under 韩馥 against 黄巾; QX under 袁绍 until 200 (simplifications) |
| 魏 | 夏侯惇 (元让) | QX CB SF | 5 | 9 | 7 | 8 | 7 | 36 乙 | 守将 | with 曹操 from 190; d. 220 |
| 魏 | 张辽 (文远) | QX CB SF | 7 | 8 | 6 | 9 | 9 | 39 甲 | 守将 | QX under 吕布 until 198 (simplification); 合肥 215 |
| 魏 | 许褚 (仲康) | QX CB SF | 3 | 10 | 5 | 10 | 6 | 34 乙 | 猛将 | joins c. 197; 宿卫 |
| 魏 | 荀彧 (文若) | QX CB | 9 | 9 | 9 | 2 | 7 | 36 乙 | 军师 | joins 191; d. 212 |
| 魏 | 郭嘉 (奉孝) | QX | 10 | 7 | 5 | 2 | 3 | 27 丙 | 军师 | 严3: 不治行检 (陈群); d. 207 |
| 魏 | 司马懿 (仲达) | SF | 10 | 5 | 5 | 4 | 9 | 33 乙 | 军师 | 宛 228, 拒诸葛亮 231-234 |
| 吴 | 孙坚 (文台) | HJ QX | 6 | 8 | 6 | 9 | 7 | 36 乙 | 先锋 | vs 黄巾 under 朱儁 184; d. 191 |
| 吴 | 程普 (德谋) | HJ QX CB | 6 | 8 | 7 | 7 | 8 | 36 乙 | 守将 | with 孙坚 vs 黄巾; 赤壁 左督 |
| 吴 | 黄盖 (公覆) | HJ QX CB | 6 | 9 | 6 | 8 | 8 | 37 乙 | 先锋 | with 孙坚 from his first campaigns; 赤壁 fire attack |
| 吴 | 孙策 (伯符) | QX | 7 | 7 | 7 | 9 | 8 | 38 甲 | 先锋 | 平江东 194-200. Bond 江东 |
| 吴 | 周瑜 (公瑾) | QX CB | 10 | 9 | 7 | 6 | 9 | 41 甲 | 军师 | 赤壁 208; d. 210. Bond 江东 |
| 吴 | 孙权 (仲谋) | QX CB SF | 8 | 7 | 7 | 5 | 7 | 34 乙 | 主公 | succeeds 200 |
| 吴 | 吕蒙 (子明) | QX CB SF | 8 | 7 | 5 | 7 | 9 | 36 乙 | 先锋 | vs 黄祖; 白衣渡江 219 |
| 吴 | 陆逊 (伯言) | SF | 9 | 9 | 7 | 5 | 8 | 38 甲 | 军师 | 夷陵 222, 石亭 228 |
| 群 | 张角 | HJ | 7 | 5 | 6 | 3 | 5 | 26 丙 | 主公 | 黄巾 leader; d. 184 |
| 群 | 皇甫嵩 (义真) | HJ QX | 7 | 9 | 8 | 7 | 9 | 40 甲 | 守将 | Han court general vs 黄巾; d. 195 |
| 群 | 董卓 (仲颖) | HJ QX | 6 | 2 | 1 | 8 | 5 | 22 丙 | 猛将 | vs 黄巾 184 and 凉州 rebels; d. 192. 临阵生变 (信2) |
| 群 | 袁绍 (本初) | HJ QX | 6 | 5 | 6 | 5 | 5 | 27 丙 | 主公 | 诛宦官 189; 官渡 200; d. 202 |
| 群 | 韩遂 (文约) | HJ QX CB | 7 | 3 | 4 | 6 | 6 | 26 丙 | 主公 | 凉州 rising 184; 潼关 211. 临阵生变 (信3) |
| 群 | 吕布 (奉先) | QX | 3 | 2 | 4 | 10 | 4 | 23 丙 | 猛将 | d. 198. 临阵生变 (信2) |
| 群 | 张鲁 (公祺) | QX CB SF | 6 | 7 | 9 | 3 | 6 | 31 乙 | 主公 | 汉中 191-215; surrenders to 曹操 215 |
| 群 | 孟获 | SF | 4 | 6 | 6 | 8 | 5 | 29 丙 | 猛将 | 南中 225; recorded in 《汉晋春秋》 (裴注) and 《华阳国志》, not in the 《三国志》 main text |

**Cell sizes (HJ/QX/CB/SF):** 蜀 3/5/7/8 · 魏 2/7/6/6 · 吴 3/7/5/3 · 群 5/6/2/2. All 16 cells have ≥ 2 generals (range 2-8); 77 general-cell entries in total (蜀 23, 魏 21, 吴 18, 群 15). Thinnest cells: 魏-HJ, 群-CB, 群-SF (2 each); add generals there first when content grows.

**Event and bond coverage:** 信 ≤ 3 (临阵生变): 吕布, 董卓, 韩遂. 智 ≥ 9 (奇谋 as 军师): 诸葛亮, 曹操, 荀彧, 郭嘉, 司马懿, 周瑜, 陆逊. 勇 = 10 (万夫莫敌 as 猛将): 关羽, 张飞, 马超, 许褚, 吕布. Bonds: 桃园 (刘备, 关羽, 张飞), 江东 (孙策, 周瑜). Tiers: 10 甲, 15 乙, 7 丙. The 晋 faction and 归晋 era arrive in Phase 2.
