# 点将台 (working title): spec, Phase 1 prototype

Status: **approved by the founder as the Phase 1 scope (2026-10-14)**, revised the same day with the founder decisions and CTO review changes below. Author: product-ux.
Type: WeChat 小游戏 (mini game). Slug: `dianjiangtai`. Companion: `docs/dianjiangtai/direction.md` (vision, pillars, art, phased plan, risks).

Labels:
- **[VERIFY-P0]**: the research marked this API or platform detail as UNVERIFIED. **Phase 0 is done** (findings: `docs/dianjiangtai/phase0-platform.md`, checked against official docs on 2026-10-14); §17 records each item's verdict. Remaining [VERIFY-P0] tags refer to Phase 2 items only. (Policy/legal items were cleared by the founder, D14.)
- **[SPIKE]**: documented, but nothing in our repo has exercised it (cheatshaizi uses none of the social, cloud, ad or privacy APIs, phase0-platform.md §0). It **must be proven in the Phase 1 device spike** (§17.1) before feature work depends on it. Each has a fallback.
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
| D9 | **Resolved.** The founder's company, registered in **Beijing (mainland China)**, registers the game. The following are **operational setup steps for the founder**, not open questions: (1) game-category access, (2) WeChat 认证, (3) 流量主 activation (eligibility: cumulative UV > 500, or one of the two other routes, phase0-platform.md §7.1), (4) declaring **微信朋友关系** in the 用户隐私保护指引 and enabling the privacy popup in MP (before the first board write, §11.6), (5) **for portraits hosted on our own CDN (Phase 2): an ICP-filed HTTPS domain added to the MP 服务器域名 lists (`request` and `downloadFile`)**, or hosting on WeChat cloud storage instead, which needs no domain (phase0-platform.md §10). Until 流量主 ad units exist, Phase 1 runs with stub ads (D5). | §12, §16, §17 #8, #10, #12, §19 |
| D10 | Portraits will be **AI-generated** (Phase 2): a style guide, a prompt/seed log per asset (provenance), human review for historical plausibility and against resemblance to other games' art, labelling under 《人工智能生成合成内容标识办法》 (explicit plus implicit/metadata labels), a kept human-edit trail, and hosting on CDN/cloud storage rather than in git (direction §6). These are **implementation rules** (the legal check is closed, D14). **Phase 1 still ships monograms only.** | direction §6, §3.5, §17 #16, AC 58 |
| D11 | Trademark: the founder has **cleared the name 点将台**. Resolved. | direction §8 |
| D12 | Distribution: the founder posts the **Phase 1 prototype** into **15-20 WeChat groups** for ≥ 7 days. | §1, direction §10 |
| D13 | Scope: the game is **三国 only**. Phase 0 is platform-API verification plus a compliance/legal check (about 3-5 days, before any code); the compliance/legal part is now done (D14), so Phase 0 is platform-API verification only. Concept validation rests entirely on the Phase 1 prototype and the §1 go/kill thresholds. | §1, §17, direction §10 |
| D14 | **Compliance/legal check completed by the founder (2026-10-14):** 版号 (IAA-only), 备案, 软著, 诱导分享, ads, AIGC labelling, content review, privacy. **Cleared.** The compliance-only Phase 0 items are closed ("cleared by founder D14", §17). The [COMPLIANCE] design rules in this spec stay in force, and release still runs its normal pre-submission rules check before any upload. | §4, §12, §16, §17, direction §10 |

D9 (update) and D14 were relayed to product-ux by the CTO on 2026-10-14 as founder confirmations.

CTO review changes, 2026-10-14 (also applied):

| # | Change | Where |
|---|---|---|
| C1 | **Leaderboard trust.** Open-data-domain boards are written by the client and can be tampered with. Phase 0 checks for a server-side write path; if none, the risk is accepted for Phase 1, documented, and made detectable. **Superseded by C3.** | (§11) |
| C2 | **Daily seed generation cost.** `genDaily` gets a measured time budget, a 30-day offline seed bank fallback, and a precise definition of per-seed gate rates. | §5.2, §7.5.1, §14, §17 #20, AC 53-55 |
| C3 | **Server-authoritative leaderboard** (replaces the old §11.4 Path A/B). Phase 0 found that a server write (`setUserStorage`) exists, but the client can overwrite the same key and the server cannot read it back (phase0-platform.md §3). So **ranks come only from our server**: the client's KV holds a minimal display marker that is never trusted for ranking; `getBoard` returns today's server-validated results as `{h: hash(openid + per-day salt), w, …}`; the open data domain hashes each friend/group row's openid and ranks with the server values. Group context comes from `getGroupEnterInfo`, decrypted server-side by `joinGroup` (cloudID). Raw openids never reach the client. Fallback if the device spike fails: §11.8 fallbacks (1: Ed25519-signed values; 2: B-lite). | §11, §13, §14, §15, §16, §17, §17.1, AC 56, 60-63 |
| C4 | **Phase 0 findings applied** (phase0-platform.md): `getGroupEnterInfo` instead of the deprecated `getShareInfo`; 微信朋友关系 privacy declaration and the friend-scope flow; rewarded video `disableFallbackSharePage: true`; interstitial errors 2001-2003; cloud functions run in UTC+0 (`TZ=Asia/Shanghai`), explicit timeouts, idempotent `genDaily`, uniqueness by deterministic `_id`; `track` kept (no `wx.reportEvent`); package 4 MB/30 MB; Phase 2 updatable cards and 擂台赛 reworded. Phase 1 opens with a 1-2 day device spike (§17.1). | §5.2, §9, §12, §14, §15, §16, §17, §21, AC 64-68 |

---

## 1. Goal, target user, scope

**Validation goal.** Find out whether an original 三国 draft-and-grade loop with a daily shared seed spreads through WeChat groups. Go/kill thresholds (INFERENCE): ≥ 10% of completed runs shared, ≥ 25% of card opens lead to a started run, ≥ 3 completed runs per session, D1 ≥ 35%. Kill if share < 4% or runs per session < 2. Metric definitions are in §15.

The game is **三国 only** (D13). There is no pre-build concept test: the Phase 1 prototype, posted by the founder into 15-20 WeChat groups for ≥ 7 days (D12), is the whole validation. Phase 0 (platform-API verification against the official docs) is **done**: findings in `docs/dianjiangtai/phase0-platform.md`, verdicts in §17. The compliance/legal check is done (D14).

**Phase 1 starts with a 1-2 day real-device spike (§17.1).** cheatshaizi uses none of the share, group-entry, cloud, open data, ad or privacy APIs, so nothing in the repo proves they work. The spike proves the [SPIKE] items end to end on real iOS and Android phones; feature work on boards, sharing and ads starts only after its exit criteria pass (or the listed fallback is chosen and the CTO signs off).

**Package budget** (phase0-platform.md §10): main package ≤ **4 MB** (this includes the open data domain folder, which cannot be a subpackage), total ≤ **30 MB**. Phase 1 (code, content JSON, monograms, a few sounds) fits in the main package; display fonts and audio beyond the essentials go in a subpackage.

**Target user.** WeChat players aged 24-40 and 40+, many of them new to mobile games. Portrait, one thumb, large text, no timers. See direction §2.

**Feature scope**

| Feature | Phase 1 | Phase 2 |
|---|---|---|
| Free play (unlimited runs) | Yes | |
| Daily 军令 (shared seed, one attempt) | Yes | |
| 5 roles, 4 factions (魏 蜀 吴 群), 4 eras | Yes | + 晋 faction, + 归晋 era |
| Generals | 32 (8 per faction, Appendix B), monogram portraits | 120-160, final AI-generated portraits (D10) |
| Grading simulator, battle log, 复盘 | Yes | Tuned with live data |
| Result share card (`shareAppMessage`) | Yes | + updatable message (fixed template only, §21), + save to album |
| Challenge card (同签挑战) | Yes | + 擂台赛 option (§21), + "好友已应战" subscribe message |
| Group board (group-card entry) and friend board, server-ranked (C3) | Yes, today's daily only | + streaks, + history |
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
- Ad re-spins never exist in any mode that feeds a leaderboard or challenge. This keeps competition fair and keeps ads away from anything that could look like buying randomness. [COMPLIANCE] (That a rewarded *free-play* re-spin is not "paid randomness": cleared by founder D14.)

**Presentation.** Two lacquered command tokens flip over (about 1.2 s, wood-click sound). There are no reels, spinning wheels, lights, near-miss teasing or casino sounds. [COMPLIANCE]

---

## 5. Modes and seeds

### 5.1 Determinism

A run is fully defined by `(seed, contentVersion, actions[])`, where `actions` is the ordered list of `{round, type: flip|respinFaction|respinEra|pick|undo, generalId?, slot?, source?: free|ad}`. All randomness comes from `seededRng` (mulberry32, reused from cheatshaizi) on named sub-streams: `sub(seed, "sheet")`, `sub(seed, "battle")`, `sub(seed, "event")`, `sub(seed, "fallback")`, where `sub = mulberry32(hash32(seed + ":" + name))`. Battle randomness never depends on the player's choices (§7.2). The same `core/` code runs on the client and in cloud functions.

### 5.2 Daily 军令

- **Date key:** the Beijing date (UTC+8) `YYYYMMDD`, taken from **server time**, never the device clock (players abroad, or wrong clocks).
  - **Cloud function code runs in UTC+0 by default** (phase0-platform.md §9, `MP/wxcloud/guide/functions/notice.html`). Every function sets the environment variable `TZ=Asia/Shanghai`, **and** the shared helper `core/date.js` computes the Beijing date explicitly (`new Date(Date.now() + 8*3600e3).toISOString()` → `YYYYMMDD`, never local-time getters), so the date key is right even if `TZ` is missing. A unit test runs the helper with `TZ=UTC` at 15:59:59 and 16:00:00 UTC (AC 66).
- **Seed:** generated by a scheduled cloud function at 23:00 BJT for the next day (timer trigger `0 0 23 * * * *`; triggers are evaluated in UTC+8; one trigger per function), with a fallback of generating lazily on the first `getDaily` request. It is stored in `daily_seeds`. The same seed applies to all players. Issue number 第 N 期 = days since launch.
- **Idempotency.** WeChat may deliver a timer trigger more than once, and the lazy path can race the timer. `daily_seeds` uses the fixed `_id = YYYYMMDD` and is created with `add` of that `_id` inside a transaction that also marks the bank entry used; a second writer's `add` fails on the duplicate `_id`, its transaction rolls back (the bank entry stays unused), and it returns the existing document. Uniqueness never relies on console unique indexes (unverified, phase0-platform.md §9).
- **Timeouts.** The default cloud function timeout (3 s per CloudBase docs) is far too short. Each function's timeout is set explicitly in its config (§14.2); `genDaily`'s value is set from the spike's measurement (§17.1). The live loop's 70% cut-off is computed from the configured value, read from config, not hard-coded.
- **Seed acceptance:** a daily seed is accepted only if it passes the daily gates in §7.5 (the best lineup for the primary tokens reaches 12-0, and the greedy and random 12-0 rates, computed as defined in §7.5.1, are inside their bands).
- **Where accepted seeds come from (C2).** Running the gates live can be expensive (up to 50 candidate seeds, each needing an exhaustive optimal search plus 800 simulated players), and may exceed the cloud function timeout [SPIKE, §17 #20]. So there are two sources, tried in order:
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
- **隐私与设置:** sound toggle, the 用户隐私保护指引 link, and 联系我们/反馈 (`wx.createFeedbackButton`, a native overlay button positioned over the canvas; verdict OK, phase0-platform.md §12).
- **群榜** when there is no group context (the game was not entered from a group card, §9.2): opens the 8.6 "how to see the group board" explainer.
- **隐私与设置** also shows the privacy and friend-data status (§11.6): "好友排行：已开启 / 未开启 [去设置]" and "用户隐私保护指引" (`wx.openPrivacyContract`). Nothing here is shown as a prompt; it is a passive status line.

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
| Ranked daily result, first board marker write (§11.2) | the verdict is already on screen; WeChat's privacy popup may appear over it (first time only, §11.6). Agree or refuse, the verdict stays; on refusal a small line under the record reads "未同意隐私指引，好友暂看不到你的战绩" (no button, no nagging) |

再来一局 always starts **free play** (the daily is done). In free play, the interstitial rule in §12 applies to this button.

### 8.4 Result share card (canvas-rendered image)

Rendered on an offscreen canvas into `toTempFilePath` at a 5:4 ratio, 500 × 400 (confirmed by the official share guide, phase0-platform.md §4).

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
│ │ 2 (头像) 李四   11-1            │ │   ranks from server values (C3)
│ │ 3 (头像) 你     10-2            │ │
│ │ ─ 未验证 ─                       │ │ ← KV rows with no server match
│ │ - (头像) 王五   12-0 未验证      │ │   (no rank number, always last)
│ └───────────────────────────────┘ │
│ 已出征 7 人 · 战绩经服务器校验          │
│  [ 分享到本群 ] (voluntary)          │
└───────────────────────────────────┘
```

- **Visibility rule:** another member's lineup is visible only if the viewer has already submitted today's daily. This is enforced **by the server**: `getBoard` includes lineups only for a caller who has a ranked result for that date (§11.4). Otherwise rows show the record only, with "出征后可看阵容".
- The board is shown only with **group context**: the game was entered from a group card and `joinGroup` confirmed the group (§9.2, §11.3).
- **Rank numbers come only from server values.** A row whose KV marker disagrees with the server shows the server record. A row with no server match shows "未验证", has no rank number and sorts below all ranked rows (§11.4).

Before the board renders, the authorization gate in §11.6 runs (privacy, then friend scope). Screen states:

| State | Behaviour |
|---|---|
| No group context | an explainer: "在群聊里点开本游戏的分享卡片，就能看到本群排行" plus an optional [分享到群] button. No reward, no count, no pressure |
| Group check in progress (`joinGroup`) | skeleton rows, "正在确认群聊…" |
| Group check failed (40097 wrong scene, 65206 no longer in the group, or not a group chat) | same explainer as "No group context"; logged as `group_join` with the code |
| Loading (`getBoard` + open data domain) | skeleton rows |
| Ready | ranked rows, then any "未验证" rows; footnote "战绩经服务器校验" |
| Empty (no one in the group has played today) | "本群今天还没有人出征" plus 去出征 |
| You haven't played | your row reads "未出征" plus 去出征 |
| Server list unavailable (`getBoard` error/offline) | "群榜暂时打不开" plus 重试. We do **not** fall back to showing self-reported KV values as a ranked list |
| Privacy not agreed (user refused the privacy popup, errno 104) | "查看排行需要同意《用户隐私保护指引》" + [查看指引] (`openPrivacyContract`) + [同意并查看] (re-triggers the privacy flow on this tap only) + your own server result as a plain line "你今日 10胜2负". Dismissable, never repeats on its own |
| Friend data not authorized (`scope.WxFriendInteraction` refused) | "你未开启「微信朋友关系」授权，看不到好友与群友的排行。游戏的其他功能不受影响。" + your own server result + [去设置开启] (`wx.openSetting`, on tap only). No automatic re-prompt |

### 8.7 Friend leaderboard (好友榜)

The same layout as 8.6, titled "好友 · 今日军令". It shows friends who played today's daily, ranked by the **server** record (wins, then earliest server submit time). Your own row is pinned at the bottom if it is off-screen. It goes through the same §11.6 authorization gate. States: loading / empty ("还没有好友出征，叫上他们？" plus a voluntary share button) / server list unavailable / privacy not agreed / not authorized (all as in 8.6).

Extra state for the friend board only:

| State | Behaviour |
|---|---|
| Over the board-list cap (`mode: selfOnly`, §11.5) | your row is ranked and marked "已校验"; friends' rows show their self-reported marker with "好友自报" and **no rank numbers**, sorted below your row, with the footnote "今日出征人数较多，好友战绩暂未校验" |

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
- The UI never depends on knowing whether a share succeeded. `shareAppMessage` documents **no** success/fail callback (phase0-platform.md §4).
- Nothing is shared automatically.
- The capsule-menu share is off by default in mini games: call `wx.showShareMenu({menus: ['shareAppMessage']})` and register `wx.onShareAppMessage` at startup.
- **The rewarded-video fallback share page is disabled** (§12): WeChat's "share to get the reward" page would break the no-share-reward rule.

### 9.1 Result share
Tap 分享战报 → render the card (§8.4) → `shareAppMessage({title, imageUrl, query: "s=r&m=<daily|free>&d=<date>"})`. `withShareTicket` is enabled via `wx.updateShareMenu({withShareTicket: true})` at startup, so group recipients get a ticket. **Never** pass `isUpdatableMessage: false` in the same call (known iOS bug that breaks the ticket, phase0-platform.md §4). Side effect to accept: with `withShareTicket` the picker allows one target and the card cannot be long-press forwarded.

### 9.2 Group detection (`getGroupEnterInfo`)
`wx.getShareInfo` is **deprecated** since base library 2.17.3 and is not used anywhere (phase0-platform.md §2.4, §4). Group context works like this:
1. On launch and on `wx.onShow`, read `wx.getEnterOptionsSync()`: `scene`, `query`, `shareTicket`, `chatType`.
2. **Group signal = a `shareTicket` is present.** Scene (1007 single chat, 1008 group chat, 1044 ticketed card) and `chatType` (3 group, 4 WeCom group) are logged as telemetry only, not used for routing.
3. With a ticket, the main domain calls **`wx.getGroupEnterInfo`** (base library 2.10.4; group message cards 2.17.3), which returns `{encryptedData, iv, cloudID}`. It is not a privacy interface, so no prompt.
4. The client calls the cloud function **`joinGroup`** with `wx.cloud.CloudID(cloudID)`. The cloud function receives the decrypted `{opengid, chat_type, …}` (cloudID route, "方式二", `MG/guide/open-ability/signature`), checks it is a group chat, upserts `group_members` (§14.1), and returns an opaque `groupRef` (never the openGId, never an openid). [SPIKE]
5. On success, home shows the banner "来自群聊 · 查看本群今日排行", which opens 8.6. The client keeps `{groupRef, shareTicket}` in memory for this entry only (not persisted).
6. The open data domain gets the group rows with `getGroupCloudStorage({shareTicket, keyList})`. If the spike shows `shareTicket` does not work on current clients, `joinGroup` also returns the `opengid` and the open data domain passes `groupid` instead (base library 3.8.8; the docs recommend `groupid`). The openGId is a group id, not a user id, so this does not breach the "no raw openids" rule. [SPIKE]
7. Errors: 40097 (wrong scene), 65206 (user no longer in the group), a non-group `chat_type`, or any `joinGroup` failure → no group context; the board shows the explainer. Nothing else changes.

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
| `s=r` with shareTicket | `joinGroup` (§9.2); on success home with the group banner, otherwise plain home |
| `c=<id>` with shareTicket | challenge entry; `joinGroup` also runs in the background so the board has group context afterwards |
| `wxad_fallback_share=1` (a platform ad share page card; should not occur because we disable it, §12) | home; logged; grants nothing |
| `s=r` without ticket | home |
| malformed | home, logged |

The card-open event fires once per entry (§15). A warm start via `onShow` with new enter options re-routes the same way, but never in the middle of a draft: it waits until the user returns to home and shows a toast "你有一封新战书" instead.

---

## 10. (Reserved: merged into §9)

---

## 11. Leaderboards

**Decision C3 (CTO, 2026-10-14): ranks on every board come from our server, never from WeChat user cloud storage.**

### 11.1 Why (Phase 0 outcome)
`submitRun` validates every ranked daily on the server (§14.3), but WeChat's friend and group reads (`getFriendCloudStorage` / `getGroupCloudStorage`) return KV values that **the client can write**. Phase 0 (phase0-platform.md §3) found:
- a server write exists (`storage.setUserStorage`), **but** the client can overwrite the same key at any time (no per-key protection), and there is **no server-side read** of user cloud storage. So the old "Path A" (server writes, client can't overwrite) is not achievable.
- a signed value in the KV would need verifying inside the open data domain, which has no network access and cannot hold a secret.
- the friend/group rows **do** carry each player's `openid` (`UserGameData`), which lets the open data domain join WeChat's rows to our server's results.

So the KV is used only to make a player appear in WeChat's friend/group lists and as a display fallback; **rank and record come from `getBoard`**.

### 11.2 KV display marker (client write)
- After each **ranked daily** result (server-confirmed), the main domain calls `wx.setUserCloudStorage({KVDataList: [{key: "d_<YYYYMMDD>", value: "{\"w\":10,\"l\":2}"}]})`. That is all it holds: no lineup, no time, no signature. It is **never trusted for ranking**; it is shown only in the B-lite fallback (§11.8) and in the `selfOnly` friend mode (§11.5) as "好友自报".
- Limits (phase0-platform.md §2.1): ≤ 128 keys per user, key + value ≤ 1024 bytes, key ≤ 128 bytes. Keys older than 7 days are removed with `removeUserCloudStorage`, so we hold at most 8 `d_` keys.
- `setUserCloudStorage` and `removeUserCloudStorage` are **privacy interfaces** (微信朋友关系). The first write is the moment WeChat may show the privacy popup (§11.6). If the user refuses (errno 104) the write is skipped and marked `markerPending`; it is retried silently only after the user later agrees (for example on the board's "同意并查看" tap). The result screen is unaffected.
- Free-play results are never written.
- [SPIKE] If `getFriendCloudStorage` / `getGroupCloudStorage` return friends who have **no** `d_<date>` key (with an empty `KVDataList`), the marker is not needed for ranking at all; we would then keep it only for the fallback, and could drop the write (and its privacy popup at result time) entirely. The spike decides.
- Optional, spike-dependent: `submitRun` could write the marker server-side with `setUserStorage` (removes the client write and its prompt). Only if the spike confirms the value format and signature handling (phase0-platform.md §3.1-3.3); it would require `code2Session` and the AppSecret in the cloud environment config. **Not in the Phase 1 baseline.**

### 11.3 Group context (`joinGroup`)
See §9.2 for the client steps. On the server, `joinGroup` receives the decrypted group-entry data via cloudID, so the `openGId` is **trusted** (the client cannot forge it). It upserts `group_members` with `_id = <openGId>_<openid>` (deterministic, so repeated entries are idempotent), `firstSeen`, `lastSeen` (Beijing dateKey) and returns `groupRef = hex(sha256(openGId + GROUP_REF_PEPPER)).slice(0,16)`, where the pepper is an environment variable in the cloud config (never committed). `getBoard` accepts `groupRef` only if the caller has a `group_members` row with that `groupRef`, so a client cannot read another group's board by guessing.

Membership is also an analytics signal (distinct groups reached, group-card entries per group), aggregated only.

### 11.4 Board data flow (`getBoard` → open data domain)
1. User taps 群榜/好友榜 → the §11.6 authorization gate.
2. Main domain calls `getBoard({kind: 'group'|'friend', dateKey, groupRef?})`.
3. The server reads today's `daily_results` (one per openid per date, §14.1) and returns:
   `{ dateKey, issueNo, contentVersion, salt, selfHash, mode: 'full'|'group'|'selfOnly', viewerPlayed, rows: [[h, w, s, x?], …] }`
   - `h` = `hex(sha256(openid + "|" + salt)).slice(0, 12)` (48 bits; collisions are negligible at our row counts).
   - `salt` = the per-day `daily_seeds.boardSalt` (16 random bytes, created with the seed). A new salt each day means hashes cannot be linked across days. The salt is not secret; its job is to stop a static openid→hash table, and raw openids never leave the server.
   - `w` = server wins (losses = 12 − w); `s` = server submit time as seconds after 00:00 BJT (tie-break, earlier is better).
   - `x` = the lineup as 5 roster indices in slot order (for the pinned `contentVersion`), included **only if the caller has a ranked result for `dateKey`** (server-enforced spoiler rule).
   - `selfHash` = the caller's own hash, so the open data domain can pin "你".
4. The main domain `postMessage`s `{type: 'render', kind, shareTicket?, groupid?, …the getBoard payload}` to the open data context.
5. The open data domain calls `getGroupCloudStorage` (group) or `getFriendCloudStorage` (friend) with `keyList: ["d_<dateKey>"]`, which returns `{openid, nickname, avatarUrl, KVDataList}` per row. For each row it computes `h` with a bundled pure-JS SHA-256 and looks it up in the server rows:
   - **match:** ranked using the server `w`/`s`; if the KV marker disagrees, the server value is shown.
   - **no match:** shown as "未验证" with the KV record, **no rank number**, sorted below all ranked rows (or hidden when the list is long; config `showUnverified`, default on).
   - Rank numbers are assigned in order over matched rows only.
6. It draws onto the shared canvas (`offscreenCanvas` mode), which the main domain composites. Nicknames and avatars exist **only** inside the open data domain; they never reach the main domain or our servers. [COMPLIANCE: data minimisation]

The open data domain is one-way (it cannot post back), so the main domain never learns friends' identities; the hash list it holds is not linkable to anyone without their openid.

### 11.5 Friend board: which server rows to send (decision)
The server does not know the friend graph, and the main domain cannot see friend openids. Options considered:

| Option | How | Trust | Cost |
|---|---|---|---|
| **A. All of today's results, hashed** | `getBoard(friend)` returns every ranked result for the date (`mode: full`) | every friend's rank is server-true | payload and DB reads grow with daily players: about 35 bytes per row, about 105 KB at 3,000 players |
| B. Own row only | server returns just the caller's row; friends show KV values | friends' ranks are client-claimed (tamperable) | constant |

**Chosen: A, capped, degrading to B.** At prototype scale (15-20 groups, at most a few thousand daily players) option A is the only one that keeps every displayed rank server-true without the server knowing the friend graph, and its cost is bounded by a cap. Config `boardListCap` (default **3,000** rows; the spike checks the `callFunction` response size and `postMessage` size limits and may lower it). The server caches the date's row list in function memory for 60 s to keep DB reads down.
- Today's ranked count ≤ cap → `mode: full` for both boards (it also covers group members who played from home and never entered via that group's card).
- Above the cap → the **group** board uses `mode: group` (results for openids in `group_members` for that `groupRef`; members never seen via a card show "未验证"), and the **friend** board uses `mode: selfOnly` (B: your row ranked and "已校验", friends' rows "好友自报" without rank numbers, §8.7). Either way a tampered KV never earns a rank number.
- Crossing the cap is logged (`board_list` event) and is a Phase 2 trigger to revisit (for example a per-player opt-in friend list).

### 11.6 Privacy and friend-scope authorization flow [COMPLIANCE]
Facts (phase0-platform.md §2.5, §11): `setUserCloudStorage`, `removeUserCloudStorage`, `getFriendCloudStorage`, `getGroupCloudStorage` and `getGroupInfo` are privacy interfaces in the category **微信朋友关系**; the friend/group reads additionally need **`scope.WxFriendInteraction`**. If 微信朋友关系 is not declared in the 用户隐私保护指引, calls fail with 112, so the declaration is a launch prerequisite (founder setup step, D9).

Rules: never at launch, never during a free run, only on a user action that needs it; refusal never blocks play; no repeated prompting.

Flow:
1. **Privacy agreement.** We use WeChat's **official privacy popup** (MP 基础设置 > 隐私授权弹窗; less code and platform-owned wording; note it cannot be turned off once enabled). It fires on the first privacy-interface call: normally the marker write after the first ranked daily, or the first board open, whichever comes first. If the official popup turns out unusable in the spike, we implement `wx.onNeedPrivacyAuthorization` with our own canvas dialog: title "用户隐私保护提示", text "为了在好友榜和群榜上显示你的战绩，我们需要使用你的微信朋友关系。", buttons [拒绝] [同意], and a link to 《用户隐私保护指引》 (`wx.openPrivacyContract`). [SPIKE]
   - Agreed → continue. Refused (errno 104) → the board shows "Privacy not agreed" (8.6); the marker write stays `markerPending`.
2. **Friend scope.** On board open, the main domain checks `wx.getSetting().authSetting['scope.WxFriendInteraction']`:
   - `true` → render.
   - `undefined` (never asked) → call `wx.authorize({scope: 'scope.WxFriendInteraction'})` from the board-open tap; WeChat shows its system prompt. If the spike shows the prompt only fires from the open data domain's first `get…CloudStorage` call, we let it fire there and detect refusal from that call's `fail`. [SPIKE]
   - `false` (refused earlier) → "Friend data not authorized" state (8.6), with [去设置开启] → `wx.openSetting()` on tap. No automatic re-ask.
3. **Denied is a complete game.** With privacy or friend scope refused: free play, the daily, the result, 复盘, sharing and challenges all work. Only the friend and group boards are unavailable; the player still sees their own server result on the board screen. AC 63.

### 11.7 What is stored where

| Data | Where | Who sees |
|---|---|---|
| Display marker `d_<date>` = `{w,l}` | WeChat user cloud storage | friends / group members via WeChat (never used for rank) |
| Authoritative run records | cloud DB `runs` | server only |
| Today's ranked result per user | cloud DB `daily_results` (`_id: <dateKey>_<openid>`) | served hashed via `getBoard` |
| Group membership | cloud DB `group_members` (`openGId`, `openid`) | server only; client sees an opaque `groupRef` |
| Daily histogram | cloud DB `daily_stats` | aggregate rarity line |

### 11.8 Fallbacks (only if the spike fails), in order of preference
If any C3 prerequisite fails in the device spike (friend/group rows lack `openid`; group-entry data cannot be decrypted via cloudID; the per-day salted hash cannot be computed in the open data domain within ~50 ms for 500 rows; or the payload limits cannot fit a useful cap), we fall back as follows, with the CTO's sign-off:

**Fallback 1 (preferred): signed KV values (Ed25519).** Verifying a public-key signature needs no secret and no network, so it works inside the open data domain (phase0-platform.md §3.6; confirmed by the CTO).
- On a ranked success, `submitRun` returns `sig`: an Ed25519 signature by a server-held **private** key (cloud environment variable, never committed) over `openid|dateKey|w|l|lineup`. The client writes `{w,l,x,sig}` to `d_<date>`.
- The open data domain bundles the **public** key and verifies each row against that row's `openid`. Verified rows are ranked by their (signed, hence server-issued) values; rows that fail show "未验证" with no rank number, below all ranked rows. AC 56 holds unchanged.
- If rows lack `openid` (E2 fails), the signature binds only `dateKey|w|l|lineup`: invented records are still rejected, but copying a real friend's signed value stays possible (low stakes, accepted for the prototype).
- Covers every C3 failure mode, including group context: without `joinGroup`, the group board still ranks verified rows via `shareTicket`. Spike check: Ed25519 verification of 500 rows in the open data domain (pure JS) in < 100 ms on the Android phone.

**Fallback 2: Path B-lite** (only if Fallback 1 is also not workable, e.g. verification is too slow):
- The KV marker adds the lineup back (`{w,l,x}`), and boards rank by KV values, marked "好友自报"; the viewer's own row shows "已校验" when it equals their server result.
- **Detection only:** the open data domain cannot report back and the server cannot read KV, so KV-vs-`runs.serverRecord` comparison runs in the harness and QA. The risk (an inflated row on a no-prize board) is accepted for the prototype and recorded in the release checklist.

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
- **Ad load error or no fill (founder decision D6):** grant the reward anyway, at most once per run per placement, with the toast "暂无广告，本次免费". A second failure for the same placement in the same run shows "暂无广告，请稍后再试" and grants nothing. This is acceptable because neither reward affects any leaderboard. The rule is cleared by founder D14 (ads).
- **No platform share-for-reward page.** On base library 3.7.7+, a rewarded video with no fill (1004) by default shows WeChat's fallback page that **grants the reward for sharing**, and then `onError` is not called (`onLoad` fires with `useFallbackSharePage: true`) (phase0-platform.md §7.1). That would violate §9 "no share ever grants anything". Every rewarded instance is created with **`wx.createRewardedVideoAd({adUnitId, disableFallbackSharePage: true})`**. If `onLoad` ever reports `useFallbackSharePage: true` anyway, the client treats it as no-fill (D6 rule) and does not show the ad. A launch carrying `wxad_fallback_share=1` grants nothing (§9.4).
- **Rewarded error handling.** `onError` codes 1000-1008 (1004 = no fill) all go to the D6 rule above; the code is logged in `ad_error.errCode`. After a failed load, retry is `load()` then `show()`. The rewarded instance is a global singleton, so both placements share it and track their own per-run grant state. The platform also caps rewarded views per user per day (number unpublished); hitting it surfaces as an error and follows the same rule.
- **Interstitial error handling.** WeChat enforces its own interstitial frequency limits, **but the numbers are not published** (phase0-platform.md §7.2). Our caps (≥ 120 s apart, ≤ 5/day, from the 4th lifetime run) are a lower layer on top. `show()` rejections **2001** (too soon after launch), **2002** (too soon after the last interstitial or rewarded video) and **2003** (another ad is playing) are normal: skip silently, do not count toward our caps, do not fire `interstitial_show`, log `ad_error` with the code. 2004/2005 are logged as errors. An interstitial never blocks or delays 再来一局.
- Ad buttons always show a ▶ video icon and the word 视频. Ads never auto-play, and no ad sits adjacent to a primary button (to prevent mis-taps, which matters for older users).
- **Phase 1 ad stub (approved, D5):** if ad unit ids are unavailable (流量主 activation is an operational setup step for the founder, D9; it opens at cumulative UV > 500 or via the other two routes, so the prototype will most likely start on the stub), the ad module runs in `stub` mode: a 3-second "广告位（测试）" overlay with skip/complete buttons, so tap-intent and placement analytics still work. The stub can be configured to simulate rewarded errors (1004, 1000) and interstitial rejections (2001-2003) for QA (AC 64, 65). The stub is a config flag that is off in production builds.
- Rewarded videos are always optional, and the game is fully completable without them.

---

## 13. Client data bindings per screen

These are view models that frontend-ui (rendering) and minigame-dev (logic and state) agree on. All strings are pre-formatted by logic, not by the rendering code.

```ts
// Home
{ daily: { state: 'loading'|'available'|'inProgress'|'done'|'pendingSubmit'|'error'|'offline',
           issueNo: number, dateKey: string, round?: number, record?: {w:number,l:number}, bandLabel?: string },
  hasGroupContext: boolean /* joinGroup succeeded for this entry */, muted: boolean, showHowToOnce: boolean,
  settings: { friendBoardEnabled: boolean /* privacy agreed && friendScope granted */ } }

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

// Group context (memory only, per entry; §9.2)
{ status:'none'|'checking'|'ok'|'failed', groupRef:string|null, shareTicket:string|null,
  groupid:string|null /* only if the spike forces the groupid route */, errCode?:number }

// Privacy / friend-scope status (§11.6); also drives the 隐私与设置 status line
{ privacy:'unknown'|'agreed'|'denied', friendScope:'unknown'|'granted'|'denied',
  markerPending:boolean /* ranked result not yet written to KV because privacy was refused */ }

// Leaderboards (main domain; the rows themselves live in the open data domain)
{ kind:'group'|'friend', dateKey, issueNo,
  state:'noGroup'|'checkingGroup'|'loading'|'ready'|'empty'|'serverError'
        |'privacyDenied'|'unauthorized',
  mode:'full'|'group'|'selfOnly'|null,      // from getBoard (§11.5)
  viewerPlayed:boolean,
  self: { record:{w,l}|null, bandLabel:string|null },   // shown in privacyDenied/unauthorized states
  actions: { canOpenSetting:boolean, canRetryPrivacy:boolean, canShareToGroup:boolean } }

// Main domain → open data domain message (postMessage), built from getBoard (§11.4)
{ type:'render', kind:'group'|'friend', dateKey, issueNo, contentVersion,
  shareTicket?:string, groupid?:string, salt:string, selfHash:string,
  mode:'full'|'group'|'selfOnly', viewerPlayed:boolean,
  rows: Array<[h:string, w:number, s:number, x?:string]>,
  showUnverified:boolean, width:number, height:number }
// The open data domain renders ranked rows (server values), then '未验证'/'好友自报' rows without rank numbers.
// It never posts back; the main domain never receives openids, nicknames or avatars.
```

---

## 14. Backend (WeChat Cloud Development)

Identity is always `OPENID` from the cloud function context (`cloud.getWXContext()`), never from client input. No `wx.getUserProfile` or user-info calls. All collections deny direct client reads and writes; access goes only through cloud functions. `core/` (sheet, sim, validate, config, content, date) is shared with the client by copy, with a drift test (cheatshaizi pattern).

**Runtime rules (phase0-platform.md §9):**
- Every function sets `TZ=Asia/Shanghai` in its environment variables, and all date keys go through `core/date.js` (explicit UTC+8 arithmetic, §5.2).
- Every function has an **explicit timeout** in its config (the default is about 3 s). Starting values: `genDaily` from the spike measurement (target ≥ 60 s if the console allows it; the 900 s maximum is unverified for WeChat), `getDaily` 20 s (its lazy path uses the bank, else a live loop cut at 70% of 20 s, else a relaxed seed), `submitRun`/`getReplay` 10 s, all others 5 s.
- **Uniqueness is enforced by deterministic `_id`s**, created with `add` of that `_id` (a duplicate `add` fails), never by console unique indexes. Multi-document updates use `db.runTransaction` (single-record operations only, no `where` batches); counters use `db.command.inc`.
- Secrets in environment variables only: `GROUP_REF_PEPPER` (§11.3). The C3 design needs **no AppSecret** and no `session_key` (they would only be needed for the optional server-side marker write, §11.2).

### 14.1 Collections

| Collection | Key fields | Notes |
|---|---|---|
| `daily_seeds` | `_id: YYYYMMDD`, `seed`, `issueNo`, `contentVersion`, `configVersion`, `rounds[5]`, `best: {lineup, record}`, `gates: {...}`, `source: bank/live`, `attempts`, `genMs`, `boardSalt`, `createdAt` | fixed `_id` per date makes `genDaily` idempotent (§5.2). `best` is never returned before the user's result exists. `boardSalt`: 16 random bytes for §11.4 hashes |
| `daily_seed_bank` | `_id`, `seed`, `contentVersion`, `configVersion`, `gateVersion`, `best`, `gates`, `used:boolean`, `usedFor?: YYYYMMDD`, `importedAt` | offline-generated accepted seeds (§5.2); imported via the cloud console; never committed to the repo. Marked used inside the same transaction that creates `daily_seeds` |
| `runs` | `_id: <openid>_<clientRunId>`, `openid`, `clientRunId`, `mode`, `dateKey`, `seed`, `challengeId?`, `actions[]`, `serverRecord {w,l}`, `clientRecord?`, `mismatch:boolean`, `ranked:boolean`, `contentVersion`, `startedAt`, `submittedAt` | the deterministic `_id` makes resubmission idempotent |
| `daily_starts` | `_id: <dateKey>_<openid>`, `openid`, `dateKey`, `startedAt` | one per openid per date (deterministic `_id`) |
| `daily_results` | `_id: <dateKey>_<openid>`, `dateKey`, `openid`, `runId`, `w`, `l`, `submittedAt`, `lineupIdx` (5 roster indices), `contentVersion` | **the one ranked daily result per openid per date**; created with `add` of the fixed `_id` in the same transaction as the `daily_stats` increment, so a duplicate never double-counts. Source for `getBoard` (§11.4). Index on `dateKey` |
| `group_members` | `_id: <openGId>_<openid>`, `openGId`, `openid`, `groupRef`, `firstSeen`, `lastSeen` (dateKeys) | written only by `joinGroup` from **server-decrypted** group data (§11.3). Index on `groupRef`. Deleted 180 days after `lastSeen` (D7) |
| `challenges` | `_id: challengeId`, `ownerOpenid`, `runId`, `mode`, `seed`, `dateKey`, `rounds`, `record`, `lineup`, `createdAt`, `expiresAt (+7d)`, `answerCount`, `bestAnswer` | lineup is withheld from the recipient until they have answered. One per run: `createChallenge` derives the id deterministically from `runId` (base32 of a keyed hash) and uses `add`, so repeats return the same id |
| `daily_stats` | `_id: YYYYMMDD`, `hist[13]`, `total` | incremented atomically (`inc`) on each ranked submit |
| `events` | `openid`, `sessionId`, `name`, `props`, `ts`, `clientTs` | analytics (§15) |

### 14.2 Cloud functions

| Function | In | Out | Notes |
|---|---|---|---|
| `getDaily` | `{}` | `{dateKey, issueNo, rounds, serverNow, myStatus: none/started/done, myRecord?}` | creates the seed lazily if the scheduled job missed |
| `genDaily` (timer `0 0 23 * * * *`, UTC+8 trigger time) | | | writes the next day's seed: next matching `daily_seed_bank` entry first, live §7.5.1 gate loop as fallback (stops at 50 candidates or 70% of the configured timeout); **idempotent via the fixed `_id`** (a double-fired trigger or a racing lazy `getDaily` creates one document and consumes at most one bank entry, §5.2); explicit timeout set from the spike measurement [SPIKE] |
| `startRun` | `{mode, clientRunId, dateKey?, challengeId?}` | `{ok, resumed}` | creates `daily_starts` (`_id: <dateKey>_<openid>`) for ranked runs |
| `submitRun` | `{clientRunId, mode, dateKey?, seed?, challengeId?, actions[], clientRecord?}` | `{record, battles[], band, rarity, ranked, challengeCompare?}` | §14.3. Idempotent: the same `clientRunId` returns the stored result |
| `joinGroup` | `{groupData: CloudID}` | `{ok, groupRef}` or `{ok:false, code}` | §11.3. Decrypts group-entry data server-side (cloudID); rejects non-group chats; upserts `group_members`; never returns openids. [SPIKE] |
| `getBoard` | `{kind: group/friend, dateKey, groupRef?}` | §11.4 payload `{dateKey, issueNo, contentVersion, salt, selfHash, mode, viewerPlayed, rows}` | rows are hashed (`h`), never openids; lineups only if the caller has a ranked result for `dateKey`; `groupRef` accepted only if the caller is a member; capped at `boardListCap` (§11.5); 60 s in-memory cache per date |
| `getReplay` | `{runId}` | `{best}` | only for the caller's own completed run |
| `createChallenge` | `{runId}` | `{challengeId}` | only for the caller's own validated run; one challenge per run (repeat calls return the same id) |
| `getChallenge` | `{challengeId}` | §13 challenge entry model plus `rounds` | lineup only if the caller has answered |
| `track` | `{events[]}` (≤ 50 per batch) | `{ok}` | rate-limited per openid |
| `cleanup` (timer `0 0 4 * * * *`, its own function because each function allows only one trigger) | | | D7 retention: deletes `runs`, `daily_starts`, `daily_results`, `challenges`, `events` older than 180 days and `group_members` with `lastSeen` older than 180 days; keeps `daily_stats`. Idempotent (re-running deletes nothing new) |

### 14.3 Server-side score validation (`submitRun`)
1. Load the seed: daily from `daily_seeds[dateKey]`, challenge from `challenges`, free from the request.
2. Rebuild the token sheet from the seed. Replay `actions[]` in order and reject on: a pick not in the round's pool, a duplicate general or slot, a re-spin beyond the allowance for the mode (ad re-spins in daily or challenge → reject), a re-spin after a pick, fewer or more than 5 picks, or an unknown `contentVersion`.
3. Simulate on the server; the **server record is authoritative**. If `clientRecord` differs, set `mismatch=true` and log it (for bug detection).
4. Ranked daily: require a `daily_starts` row for (openid, dateKey). Reject a second distinct ranked run with `ALREADY_PLAYED`, returning the existing result (the `daily_results` `_id` already exists). Accept submissions for date D until **D+1 00:30 BJT** if the start was logged on D (midnight grace).
5. On a ranked success, in one transaction: `add` `daily_results` with `_id: <dateKey>_<openid>` and `inc` `daily_stats`; if the `add` fails on the duplicate `_id`, nothing is incremented. Return the rarity. This `daily_results` row is what boards rank by (§11.4). The client then writes only its display marker `d_<date> = {w,l}` (§11.2).

Error codes: `INVALID_ACTIONS`, `ALREADY_PLAYED`, `SEED_NOT_FOUND`, `CHALLENGE_EXPIRED`, `LATE_SUBMIT`, `RATE_LIMITED`.

---

## 15. Analytics events

Sent through our own `track` cloud function (batched, flushed on result, on hide, and every 20 s); it is the single source for the go/kill metrics. **`wx.reportEvent` is not used**: its event ids belong to the MP experiment system, not a general event store (phase0-platform.md §8). Optional extra: mirror `error` events to `wx.getGameLogManager().log({level: 'error', key, value})` (base library 3.7.4; ≤ 999 entries per session, ≤ 16 KB each) for free visibility in MP 游戏日志分析; never relied on for metrics. Common props: `sessionId` (a new uuid on each cold start, or a warm start after > 30 min in the background), `ts`, `isNewUser` (first-ever session on this Beijing date), `contentVersion`, `appVersion`.

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
| `board_view` | `kind: group/friend`, `state`, `mode?: full/group/selfOnly` | board screen shown |
| `group_join` | `result: ok/notGroup/wrongScene/leftGroup/error`, `errCode?`, `scene`, `chatType?` | each `joinGroup` attempt (§9.2). Never contains the openGId or `groupRef` |
| `privacy_result` | `trigger: marker_write/board_open`, `result: agreed/denied` | after a privacy-interface call resolves the first time, or after a retry tap (§11.6) |
| `friend_scope_result` | `result: granted/denied/alreadyGranted/alreadyDenied`, `via: authorize/odc_call` | on board open (§11.6) |
| `ad_request` / `ad_show` / `ad_reward` / `ad_close_early` / `ad_error` | `placement`, `stub:boolean`, `errCode?` | ad lifecycle. Interstitial 2001-2003 are `ad_error` only, never `ad_show` (§12) |
| `interstitial_show` | `runsThisSession` | |
| `board_write` | `dateKey`, `result: ok/privacyDenied/error`, `w` | after the `d_<date>` display marker write (§11.2) |
| `board_list` (server-side) | `dateKey`, `kind`, `mode`, `rows`, `bytes`, `cached:boolean` | each `getBoard` response; watches the §11.5 cap and cost |
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
| OpenID | identify runs, enforce one daily attempt, challenges, server-ranked boards | cloud function context | `runs`, `daily_starts`, `daily_results`, `group_members`, `challenges`, `events` | 180 days (D7), then deleted or aggregated by the scheduled `cleanup` |
| Game records (lineups, actions, results, timestamps) | scoring, validation, leaderboards, 复盘 | gameplay | `runs`, `daily_results`, `challenges`, `daily_stats` (aggregate) | as above; aggregates kept |
| Today's result marker `{w,l}` in WeChat user cloud storage | make the player appear on friend and group boards | `setUserCloudStorage` (privacy interface: 微信朋友关系) | WeChat platform | 7 days (we remove older keys) |
| Friend and group-member nickname/avatar/openid/marker | render boards; openid only hashed inside the open data domain to match server results | `getFriendCloudStorage` / `getGroupCloudStorage` in the open data domain (privacy interfaces: **微信朋友关系**, plus `scope.WxFriendInteraction`) | **not received by us**; never leaves the open data domain | n/a |
| Group id (openGId) and membership (openGId ↔ openid, first/last seen date) | group board context; scale fallback for group boards (§11.5); aggregate group-reach analytics | `getGroupEnterInfo` → `joinGroup`, decrypted server-side via cloudID | `group_members` (client sees only an opaque `groupRef`) | **180 days after last seen** (D7), deleted by `cleanup` |
| Per-day hashed results (`h`, wins, submit time, lineup) | board ranking (§11.4) | derived from `daily_results` | sent to clients in `getBoard`; not stored on device beyond the board session | per day (new salt daily) |
| shareTicket / scene / query / chatType | route card entries, group boards | enter options | not stored (only `hasShareTicket`, `scene`, `chatType` in events) | n/a |
| Analytics events | go/kill metrics, bug fixing | client | `events` | 180 days |
| Device: platform, WeChat version, screen size | layout, debugging | `getWindowInfo` / `getDeviceInfo` | `events` props (platform only) | 180 days |
| Ad data | ad delivery | WeChat ad SDK (platform-handled) | not by us | per WeChat |

**Not collected:** nickname or avatar to our servers, phone, location, album, contacts, microphone, camera, clipboard (clipboard APIs are privacy interfaces; we never use clipboard-based challenge codes), ID number, payment data.

**用户隐私保护指引 declarations (Phase 0 answer: yes, declare).** The guide must declare **微信朋友关系** (used by `setUserCloudStorage`, `removeUserCloudStorage`, `getFriendCloudStorage`, `getGroupCloudStorage`) before the first board write, otherwise those calls fail with 112 (phase0-platform.md §11). Purpose text: "用于在好友榜、群榜中展示你和好友的今日战绩". Phase 2 "save card to album" adds **相册（仅写入）**. Declaring is a founder setup step (D9).

**Privacy-API flow:** §11.6. In short: the official privacy popup (or `onNeedPrivacyAuthorization` with our dialog as the fallback), fired only on the first privacy-interface call, which follows a user action (a ranked daily result or a board open), never at launch or in a free run; `scope.WxFriendInteraction` requested only from the board-open tap; refusal of either leaves the whole game playable except the boards, with a passive "去设置开启" option and no re-prompting.
Real-name and anti-addiction requirements for IAA games: cleared by founder D14; release applies them in its pre-submission rules check. Data is stored in mainland WeChat Cloud only, with no cross-border transfer.

---

## 17. Phase 0 verdicts (platform verification, done 2026-10-14)

Phase 0 (D13) checked every open item against the official docs: findings, URLs and quotes are in **`docs/dianjiangtai/phase0-platform.md`** (cited below as P0 §n). Verdicts: **OK**, **OK-with-changes** (the spec was changed accordingly), **Not available** (the design uses an alternative). The compliance/legal items were cleared by the founder (D14) and stay closed; the entity question is resolved (D9). Because nothing in the repo has exercised these APIs (P0 §0), items marked **[SPIKE]** must be proven on real devices at the start of Phase 1 (§17.1). Owner: minigame-dev. Release still runs its normal pre-submission rules check before any upload.

| # | Item | Verdict | Spec change / remaining check | Fallback |
|---|---|---|---|---|
| 1 | `getGroupCloudStorage` for mini games | **OK-with-changes** (P0 §2.3): open data domain only, needs `scope.WxFriendInteraction`, entry from a group card; `groupid` (3.8.8) recommended over `shareTicket` | §9.2, §11.4, §11.6. [SPIKE] rows include `openid`; `shareTicket` vs `groupid` route | §11.8 fallbacks (1: Ed25519-signed values; 2: B-lite) |
| 2 | Open data domain APIs, KV limits, friend authorization | **OK-with-changes** (P0 §2, §2.1, §2.5): 128 keys, 1 KB per key+value; friend reads need `scope.WxFriendInteraction`; one-way messaging | §11.2, §11.6, 8.6/8.7 states. [SPIKE] where the scope prompt fires (main-domain `wx.authorize` vs first open-data call); whether friends without the key are returned | unauthorized state (8.6) |
| 3 | `getShareInfo` / `openGId` decryption | **Not available** (deprecated since 2.17.3, P0 §2.4, §4). Replaced by `wx.getGroupEnterInfo` + cloudID decryption in `joinGroup` | §9.2, §11.3. [SPIKE] cloudID decrypt end to end | no group context; group board explainer only (friend board unaffected) |
| 4 | Share success signal; sharer ticket | **Not available** (no callbacks documented, P0 §4). Already designed not to depend on it | §9 | n/a |
| 5 | Scene values single vs group | **OK** (P0 §4): 1007 single, 1008 group, 1044 ticketed; `chatType` 3/4 = group | §9.2: ticket presence stays the signal; scene/chatType are telemetry | n/a |
| 6 | ~~诱导分享 rules~~ **Closed: cleared by founder D14.** The §9 share rules stay as design rules | | | n/a |
| 7 | ~~Rewarded re-spin as "paid randomness"~~ **Closed: cleared by founder D14** | | | n/a |
| 8 | Ad units and interstitial timing | **OK-with-changes** (P0 §7): 流量主 opens at UV > 500 (or two other routes), so the stub (D5) is likely for the prototype; rewarded no-fill 1004 shows a share-for-reward page on 3.7.7+ → `disableFallbackSharePage: true`; interstitial 2001-2003 handled; platform frequency limits exist, numbers unpublished | §12, AC 64, 65. [SPIKE] fallback page disabled on a 3.7.7+ client | stub ads |
| 9 | ~~版号, 软著, real-name, anti-addiction for IAA~~ **Closed: cleared by founder D14** | | | n/a |
| 10 | ~~Entity status~~ **Closed: resolved (D9)** | | | stub ads until 流量主 (D5) |
| 11 | Privacy authorization; which APIs are privacy interfaces | **OK-with-changes** (P0 §11): 微信朋友关系 must be declared; `set/removeUserCloudStorage` and friend/group reads are privacy interfaces; `getGroupEnterInfo`, `shareAppMessage`, `login`, ads are not | §11.6, §16, D9 step 4, AC 63. [SPIKE] official popup vs `onNeedPrivacyAuthorization` in a mini game | own dialog via `onNeedPrivacyAuthorization` |
| 12 | Package limits; remote CDN domain | **OK-with-changes** (P0 §10): main ≤ 4 MB (open data folder included), total ≤ 30 MB; CDN domain must be HTTPS, whitelisted (`request` + `downloadFile`) and **ICP-filed** | §1, AC 48, D9 step 5. [SPIKE] `createImage` remote-domain rule (Phase 2 portraits; test now with one image) | WeChat cloud storage (`cloud://`), no own domain needed |
| 13 | Share image ratio | **OK** (P0 §4): 5:4, 500 × 400 | §8.4 | n/a |
| 14 | `wx.reportEvent` | **Not available** for our purpose (MP experiment events only, P0 §8) | §15: own `track`; `GameLogManager` optional | n/a |
| 15 | Updatable messages (Phase 2) | **OK-with-changes** (P0 §5): fixed template text only | §21 reworded | n/a |
| 16 | ~~AIGC labelling and copyright~~ **Closed: cleared by founder D14.** The D10 requirements are Phase 2 implementation rules | | | n/a (Phase 1 is monograms only) |
| 17 | Feedback button | **OK** (P0 §12): `wx.createFeedbackButton`, native overlay | §8.1 | text link to a contact page |
| 18 | WeChat PC/Mac layout | **Not checked in Phase 0** (out of P0 scope) | QA checks on PC WeChat during Phase 1 | portrait letterbox |
| 19 | Server-side write to user storage | **OK-with-changes, but does not close the gap** (P0 §3.1-3.4): `setUserStorage` exists; client can overwrite; no server read; `session_key` obtainable via HTTPS `code2Session` | **Superseded by C3** (§11): server-authoritative ranking; the server write is only an optional marker route (§11.2) | §11.8 fallbacks (1: Ed25519-signed values; 2: B-lite) |
| 20 | Cloud function timeout; `gateCheck` time | **OK-with-changes, partly unverified** (P0 §9): default about 3 s; 900 s max per CloudBase docs, unverified in the WeChat console; one trigger per function; trigger time UTC+8, code time UTC+0; triggers may double-fire | §5.2, §14 runtime rules, AC 53, 66. [SPIKE] configurable maximum, measured `genDaily` time, single fire at 23:00 BJT | seed bank mandatory; live loop cut at 70% of the timeout |
| 21 | Client overwrite; server read; row openid | **Answered** (P0 §2.2, §3.4): overwrite yes, server read none, rows carry `openid` (docs) | C3 relies on row openids. [SPIKE] confirm `openid` present on real friend and group rows | §11.8 fallbacks (1: Ed25519-signed values; 2: B-lite) |
| 22 | Unique indexes in the cloud DB | **Unverified** (P0 §9) | Not needed: uniqueness by deterministic `_id` (§14) | n/a |
| 23 | Server write value format (`setUserStorage` keys '1'-'50'/number vs string JSON) | **Unverified** (P0 §3.1) | Only matters for the optional server-side marker (§11.2). [SPIKE, optional] | client marker write |
| 24 | `callFunction` response size and `postMessage` payload limits | **Not documented in P0** | Bounds `boardListCap` (§11.5). [SPIKE] | lower the cap; `selfOnly` friend mode above it |

### 17.1 Phase 1 device spike (first 1-2 days of Phase 1)

**Why:** cheatshaizi uses none of these APIs (P0 §0), so the docs are our only evidence. **Who:** minigame-dev, with backend for the cloud functions; QA observes. **Where:** a dev build on at least one iOS and one Android phone with current WeChat (base library ≥ 3.8.8), with "不校验合法域名" **off**, plus two more WeChat accounts in a test group chat, all three mutual friends. A throwaway spike folder; nothing ships from it.

Scope:
1. **Share → group entry → `getGroupEnterInfo` → cloud decrypt.** Share a card with `withShareTicket` into the test group; open it from a second account; read `getEnterOptionsSync` (record `scene`, `chatType`, `shareTicket`); call `getGroupEnterInfo`; send the cloudID to a `joinGroup` stub; confirm the decrypted `opengid` and `chat_type`; confirm 40097 when opened from a single chat. Repeat on a warm start (`onShow`).
2. **Open data domain with friend scope.** First board open on a fresh account: where the privacy popup and the `scope.WxFriendInteraction` prompt fire (main-domain `wx.authorize` vs the first open-data call); refuse each and confirm the `fail` path and `wx.openSetting` recovery; render a list to the shared canvas.
3. **`getGroupCloudStorage` / `getFriendCloudStorage` row fields.** Confirm each row has `openid`, `nickname`, `avatarUrl`, `KVDataList`; whether friends without the `d_` key are returned; `shareTicket` vs `groupid` route.
4. **Hash join.** In the open data domain, compute the salted SHA-256 for 500 synthetic rows (target < 50 ms on the Android phone) and match a `getBoard` stub payload; measure the largest `callFunction` response and `postMessage` payload that work (sets `boardListCap`).
5. **Rewarded video** in stub mode and, if any ad unit is available, real mode with `disableFallbackSharePage: true` on a ≥ 3.7.7 client: force or wait for a 1004 and confirm `onError` fires and no share page appears. Interstitial: provoke 2001/2002 right after launch.
6. **`genDaily` timing.** Set the timeout in the real console (record the maximum allowed), run `gateCheck` for 50 candidate seeds, record median/p99; deploy the 23:00 BJT trigger and confirm it fires once (and that a second invocation creates nothing); confirm the date key with the function running at UTC+0.
7. **Privacy declaration.** With 微信朋友关系 declared in the test account's 指引, `setUserCloudStorage` succeeds after agreement; without it, error 112 (confirms the D9 step).
8. **Remote image.** `createImage` from a whitelisted, ICP-filed test domain (if one exists yet) and from `cloud://` storage.

**Exit criteria** (all must hold, or the named fallback is adopted and recorded in §11/§17 with CTO sign-off before feature work continues):
- E1. A group-card entry yields a server-decrypted `opengid` via cloudID on both iOS and Android, and a single-chat entry yields no group context. *Else:* no group board in Phase 1 (explainer only); friend board unaffected.
- E2. Friend and group rows from the open data domain include `openid` on both platforms. *Else:* §11.8 fallbacks (1: Ed25519-signed values; 2: B-lite).
- E3. The salted-hash join of 500 rows runs in < 50 ms on the Android phone, and a `getBoard` payload of ≥ 1,000 rows passes through `callFunction` and `postMessage`. *Else:* §11.8 fallbacks (1: Ed25519-signed values; 2: B-lite), or a lower cap if ≥ 300 rows work.
- E4. The privacy and friend-scope flows behave as in §11.6: no prompt at launch, refusal leaves the game playable, `openSetting` recovers. The prompt location is written into §11.6.
- E5. No platform share page appears for a rewarded no-fill with `disableFallbackSharePage: true` (or, with no ad unit yet, the stub path passes and the real check moves to the first build with ad units, tracked in the release checklist).
- E6. `genDaily` timeout is set and recorded in §14; 50 live candidates fit within 70% of it, **or** the bank is declared mandatory; the trigger fires once at 23:00 BJT and a duplicate run is a no-op; the date key is correct at 15:59:59/16:00:00 UTC.
- E7. Results recorded in a dated spike note under `docs/dianjiangtai/` and the §17 rows updated (verdict and removal of [SPIKE] tags).

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
8. **Card opened from a single chat or a forwarded copy:** no ticket, so no group banner; the board shows the explainer. A ticket present but `getGroupEnterInfo`/`joinGroup` fails (40097 wrong scene, 65206 left the group, non-group `chat_type`, offline): no group context, explainer, `group_join` logged.
9. **Ad edge cases:** ad closed early (no reward), load error (fallback grant once), ad shown while the app goes to the background (reward evaluated on close), an interstitial cap reached (skip silently).
10. **Portraits fail to load or the subpackage download fails:** monogram fallback. A subpackage load error is logged once.
11. **Empty pool after drafts:** automatic reflip (§4).
12. **Rapid taps or a second finger:** single-finger routing (cheatshaizi). The primary button is debounced for 300 ms. Taps during token flips are ignored.
13. **App killed during the reveal:** the result is already computed and stored. On relaunch the verdict shows without replaying the reveal.
14. **Small screens (320 × 568) and large system font settings:** the pool list scrolls, the lineup collapses to two rows, and no text is truncated in the record or band.
15. **Server/client record mismatch:** the server value is shown; the event is logged with both values.
16. **Content version bump while a run is in progress:** the run keeps its pinned `contentVersion`, and the server keeps the last 2 versions.
17. **Seed bank empty or out of date** (content/config/gate version bump): `genDaily` falls back to live generation (§5.2); if nothing passes, the relaxed seed is used and an alert is logged. The daily always opens.
18. **Unverified board row** (a KV marker with no matching server result, e.g. a tampered client or a hash collision): the row shows "未验证" without a rank number, below all ranked rows (§11.4). A KV marker that disagrees with the server shows the server value.
19. **Privacy refused at the first ranked result:** the result shows normally; the marker write is pending and retried only after a later agreement (§11.2). The player is missing from friends' boards until then.
20. **Friend scope refused, then enabled in settings:** on return (`onShow`), the board re-checks `getSetting` and renders without restarting.
21. **Board open across midnight:** the board keeps the date it was opened for (5c); a refresh after midnight loads the new date with the new salt.
22. **Over `boardListCap`:** group board switches to `group` mode, friend board to `selfOnly` (§11.5); no tampered value gains a rank in either.
23. **Timer double-fire or lazy-path race on `genDaily`:** one `daily_seeds` document, at most one bank entry used (§5.2).

---

## 19. Open questions for the founder

No open founder questions. All earlier questions are decided (§0, D1-D14). The operational setup steps for the founder are listed in D9: game-category access, WeChat 认证, 流量主 activation, declaring 微信朋友关系 in the 用户隐私保护指引 and enabling the privacy popup, and (Phase 2 portraits) an ICP-filed CDN domain in the MP domain whitelist or cloud-storage hosting.

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
20. The date key is derived from server time in UTC+8, independent of the cloud function's runtime timezone (see AC 66). A device set to another timezone or a wrong date still gets the server's date.
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
35. Opening a result card from a group chat (a `shareTicket` is present) calls `getGroupEnterInfo` and `joinGroup`; on success home shows the group banner. With no ticket, or when `joinGroup` fails, no banner shows and play is unaffected. `wx.getShareInfo` is never called (code search).

**Leaderboards**
36. After a ranked daily result, the user's `d_<date>` key is written with exactly `{w,l}` (§11.2), only after privacy agreement; free-play results are never written; keys older than 7 days are removed.
37. With group context, the group board lists only that group's members who played today, ranked by **server** wins descending, then by server submit time ascending. Without group context it shows the explainer, whose share button grants nothing.
38. On either board, other players' lineups are hidden until the viewer has a ranked result for that date: `getBoard` omits `x` for a caller without a ranked result (server test), and the board shows "出征后可看阵容".
39. The no-group, checking, loading, empty, server-error, privacy-not-agreed and not-authorized states render as specified in 8.6 and 8.7, and none of them blocks returning to home or playing.

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
48. Main package ≤ 4 MB including the open data domain folder, and total package ≤ 30 MB (CI check). Portraits, display fonts and non-essential audio load from subpackages, cloud storage or a whitelisted CDN.
49. The mute setting persists across launches and silences all game audio.
50. The forbidden-terms check (item 7 list, plus 82-0/NBA/三国志/三国杀/光荣/Koei) passes on all user-visible strings, share titles and store copy.

**Analytics**
51. Every event in §15 fires exactly once per its trigger, with the listed props (verified in the harness by capturing `track` payloads through a scripted session: card open → challenge run → share → 2 free runs → interstitial → board view).
52. The four go/kill metrics can be computed from the `events` collection using the §15 definitions (QA provides one query per metric, run against the harness session data).

**Daily seed generation (C2)**
53. `genDaily` completes within its explicitly configured timeout (value set from the spike, §17 #20, recorded in §14) on both paths: the bank path, and the live path with an empty bank and a forced worst case (no candidate passes). The live loop stops at 50 candidates or 70% of the timeout, and `genMs` is recorded on the `daily_seeds` document.
54. With a seeded `daily_seed_bank`, `genDaily` uses the next unused entry whose `contentVersion`, `configVersion` and `gateVersion` match, re-verifies the stored best lineup scores 12-0, marks the entry `used`, and records `source: bank`. Non-matching entries are skipped. With < 7 entries left it logs a warning; with none it falls back to live generation and records `source: live`. No bank file is present in the repo (CI check).
55. `gateCheck` for a given seed returns an identical `gates` record in `tools/simstats.js` and in the cloud function. Greedy and random rates are the share of K = 400 simulated players reaching 12-0, each player using its own `sub(seed, "gate:greedy:"/"gate:random:" + j)` stream for choices only, sharing the seed's battle and event streams (§7.5.1).

**Leaderboard trust, retention, content (C3, D7, D10, D8)**
56. **A tampered KV value never changes a displayed rank.** In the harness (fake open data domain rows plus a real `getBoard`): (a) a user with no ranked run whose KV says `w: 12` shows "未验证", no rank number, below all ranked rows; (b) a user whose server result is 8-4 but whose KV says 12-0 shows 8-4 at the rank 8-4 earns; (c) the rank numbers on both boards equal the order computed from `daily_results` alone, for any KV contents. Applies in `full`, `group` and `selfOnly` modes.
57. Run records, `daily_starts`, `daily_results`, `challenges` and `events` older than 180 days, and `group_members` whose `lastSeen` is older than 180 days, are deleted by the scheduled `cleanup`; `daily_stats` aggregates are kept. The privacy guide states 180 days.
58. The Phase 1 build contains no portrait image files: every general renders its monogram. No portrait image assets are committed under `apps/dianjiangtai/` (CI check); Phase 2 portraits are loaded from CDN/cloud storage only.
59. Every 临阵生变 log line comes from the fixed template list in content, the list contains no insulting wording, and the release checklist records its content review before any submission.

**Server-authoritative boards, group context, privacy (C3, C4)**
60. **Raw openids never reach the client.** Capturing every `callFunction` response and every `postMessage` payload in a scripted harness session (daily → group entry → both boards → challenge): no value equals any test openid and no field is named `openid`/`openGId`. The same user's `h` differs between two dates. `events` props never contain an openGId or `groupRef`.
61. `getBoard`: returns at most `boardListCap` rows; switches to `mode: group` (group) or `selfOnly` (friend) above the cap; accepts a `groupRef` only from a caller with a matching `group_members` row (another user's or a made-up `groupRef` returns an error and no rows); includes `x` only for a caller with a ranked result for `dateKey`.
62. `joinGroup` with valid group-entry data creates or updates exactly one `group_members` document `_id: <openGId>_<openid>` (repeated calls are idempotent, `lastSeen` updates) and returns a `groupRef` that is not the openGId. Single-chat data, 40097, 65206 or a malformed cloudID return `{ok:false, code}` and leave no document.
63. **Authorization is optional and never blocks play.** No privacy popup or scope prompt appears at launch or during a free run (with AC 46). The first privacy prompt follows a ranked daily result or a board tap. With privacy refused: the result screen is unchanged, the KV write is skipped (`markerPending`), and the boards show the privacy-not-agreed state with the player's own server result. With `scope.WxFriendInteraction` refused: both boards show the not-authorized state with [去设置开启], nothing re-prompts on its own, and after enabling it in settings the board renders on return. In both cases free play, the daily, 复盘, sharing and challenges are fully usable (scripted run of each).
64. Every rewarded-video instance is created with `disableFallbackSharePage: true` (code search plus harness assertion). A simulated 1004 (and `onLoad` with `useFallbackSharePage: true`) follows the D6 rule; no path grants a reward for sharing; a launch with `wxad_fallback_share=1` grants nothing.
65. Interstitial `show()` rejections 2001, 2002 and 2003 are skipped silently: no UI, no `interstitial_show`, not counted toward the §12 caps, logged as `ad_error` with the code; 再来一局 proceeds immediately.
66. With the cloud function process at `TZ=UTC` (and again with `TZ` unset), the date key at 15:59:59 UTC is day D and at 16:00:00 UTC is day D+1. Every cloud function's config sets `TZ=Asia/Shanghai` and an explicit timeout (config check).
67. **Idempotency by deterministic `_id`.** Two concurrent `genDaily` invocations for the same date produce one `daily_seeds` document and mark at most one bank entry used. Two concurrent ranked `submitRun`s for the same openid and date (different `clientRunId`s) produce one `daily_results` document and one `daily_stats` increment; the other returns `ALREADY_PLAYED`. No collection relies on a console unique index.
68. `wx.reportEvent` is never called (code search); all §15 events go through `track`. If `GameLogManager` mirroring is enabled, it carries `error` events only and no openid.

---

## 21. Phase 2 (later, out of Phase 1 scope)

- **Content:** 120-160 generals with final AI-generated portraits (D10, direction §6: style guide, prompt/seed log, human review, AIGC labelling, CDN hosting); the 晋 faction and 归晋 era; generals with multiple faction appearances (吕布, 赵云 early career, 姜维…); more bonds; a content review pass and the provenance log.
- **识人模式:** stats hidden during the draft and revealed at the result (a daily variant).
- **Option: 擂台赛 (challenge-holder) mode** on WeChat's 擂台赛 component (P0 §6). It exists (base library 3.14.2, WeChat 8.0.68+), but: it requires configuring **4 reward gift packs** in MP (擂主 保底/稀有, 挑战者 保底/稀有), which conflicts with our no-prizes IAA design; it takes a **single client-reported numeric score** with no server verification (so it would bypass C3); and the card and flow are platform-owned. Only worth it if Phase 1 shows challenges are the main spread driver and the founder accepts gift packs; eligibility must be checked in the MP console. Our own `createChallenge` stays the mechanism.
- **Option: updatable challenge cards** via `updatableMessage` (P0 §5). The text is a **fixed platform template only** ("成员正在加入，当前 {member_count}/{room_limit} 人" / "已开始"), so a custom card like "已有 3 位好友应战，最高 11-1" is **not possible**. At best the card shows "当前 3/N 人" as an answer count; the activity id expires after 24 h. Low value; consider only if Phase 1 data shows challenge answer rate matters.
- **Subscribe message** "好友接下了你的战书", only after an explicit opt-in tap (`requestSubscribeMessage`) [VERIFY-P0].
- **Streaks** (consecutive daily participation) on the friend board, and a daily history archive. No streak rewards that need sharing.
- **Save card to album** (needs the album permission at the point of use, never forced). [COMPLIANCE]
- **视频号 clip of the reveal** [VERIFY-P0].
- **Banner A/B** on the board screens only; interstitial tuning from Phase 1 data.
- **Anti-cheat hardening:** progressive token delivery per round for the daily, and anomaly detection on `mismatch`.
- **Expansion themes:** 水浒, 西游, and a cross-era 关公战秦琼 mode; 盲排 (blind ranking of five generals) as a side mode.
- **Accessibility:** large-text mode, high-contrast mode, and screen reader labels where the platform supports them.
- **Release compliance:** 备案, 软著, privacy guide final text, anti-addiction and real-name integration, 流量主, and the trademark filing, done per the founder's cleared legal check (D14) and the founder's setup steps (D9). Owned by release, tracked in `docs/dianjiangtai/release-checklist.md`, with its normal pre-submission rules check before any upload.

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
| `tests/smoke.test.js` fake-`wx` harness (`node:test`, no build) | Yes, extend | add fakes for `cloud.callFunction`, `cloud.CloudID`, `shareAppMessage`, `getEnterOptionsSync`, `getGroupEnterInfo`, `createRewardedVideoAd` (incl. `disableFallbackSharePage`, error 1004), `createInterstitialAd` (2001-2003), `getOpenDataContext`, `getSetting`/`authorize`/`openSetting`, the privacy APIs (errno 104), and an open-data-domain fake returning `UserGameData` rows with openids (for AC 56, 60, 63) |
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
