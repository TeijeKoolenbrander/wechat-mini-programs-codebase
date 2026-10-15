# 点将台 (working title): spec, v1 complete release

Status: **v1 complete-release scope (2026-10-15)**, re-scoped under founder decision **D16** ("merge phase 0, 1, 2") and the CTO's v1 rulings (CTO-D1, CTO-D2). Per D16 there are no interim founder approvals. The founder sees the result at the Founder Handoff (§19), before the device pass and submission. History: approved as the Phase 1 scope (2026-10-14, D1), amended for D15/C5 the same day. The Phase 1 part is built and QA-verified (branch history). Author: product-ux.
Type: WeChat 小游戏 (mini game). Slug: `dianjiangtai`. Companions: `docs/dianjiangtai/direction.md` (vision, pillars, art, release plan, risks) and **`docs/dianjiangtai/decisions.md`** (dated decision log from D16 on: date, decision, reason, alternatives).

Labels:
- **[VERIFY-P0]**: the research marked this API or platform detail as UNVERIFIED. **Phase 0 is done** (findings: `docs/dianjiangtai/phase0-platform.md`, checked against official docs on 2026-10-14); §17 records each item's verdict. (Policy/legal items were cleared by the founder, D14.)
- **[SPIKE]**: documented, but not yet exercised on a real phone. It **must be proven in the founder's device pass before submission** (§17.1; this was the "Phase 1 device spike", PO-16). Each has a fallback that is already specified, so a failure means a dev fix plus re-check, not a new product decision.
- **[COMPLIANCE]**: compliance-sensitive.
- **INFERENCE**: our own judgement.
- **(v1)**: added or changed in the 2026-10-15 re-scope. **(v1 amended)** on an acceptance criterion means its text was updated for v1 content.

Scope: everything above §21 is **v1** (one complete release). §21 is the **post-launch backlog** and is out of v1 scope.

---

## 0. Decisions log

Founder decisions, 2026-10-14. These are closed; do not reopen them without the founder.

| # | Decision | Where it applies |
|---|---|---|
| D1 | This spec is **approved as the Phase 1 scope**. *(Superseded by D16: the spec now describes the complete v1.)* | whole doc |
| D2 | The **五德** stat set (智信仁勇严, integers 1-10) is approved. | §3.1 |
| D3 | Phase 1 roster is **32** historically grounded generals (8 蜀, 8 魏, 8 吴, 8 群) with monogram portraits. All 16 faction-era cells have ≥ 2 generals (cell sizes 2-8, 77 general-cell entries). *(v1: the roster grows to 120 under D16/CTO-D2, Appendix C. The 32 keep their exact stats. Monograms become seal portraits, CTO-D1.)* | §3.5, §4, §7.4, App. B, App. C, AC 7, 16 |
| D4 | Daily share cards **hide** general names; free-play cards **show** them. | §8.4, AC 31 |
| D5 | **Stub ads** are acceptable for the prototype if 流量主 ad units are not available. | §12, AC 43 |
| D6 | On ad **load error or no fill**, grant the reward, **at most once per run per placement**. | §12, AC 41 |
| D7 | Data retention is **180 days** for run records and analytics events. | §16, AC 57 |
| D8 | Keep the **临阵生变** event. Release checks it in content review before submission. | §7.2, AC 59 |
| D9 | **Resolved.** The founder's company, registered in **Beijing (mainland China)**, registers the game. The following are **operational setup steps for the founder**, not open questions: (1) game-category access, (2) WeChat 认证, (3) 流量主 activation (eligibility: cumulative UV > 500, or one of the two other routes, phase0-platform.md §7.1), (4) declaring **微信朋友关系** in the 用户隐私保护指引 and enabling the privacy popup in MP (before the first board write, §11.6), (5) **for portraits hosted on our own CDN (Phase 2): an ICP-filed HTTPS domain added to the MP 服务器域名 lists (`request` and `downloadFile`)**, or hosting on WeChat cloud storage instead, which needs no domain (phase0-platform.md §10). Until 流量主 ad units exist, Phase 1 runs with stub ads (D5). | §12, §16, §17 #8, #10, #12, §19 |
| D10 | Portraits will be **AI-generated** (Phase 2): a style guide, a prompt/seed log per asset (provenance), human review for historical plausibility and against resemblance to other games' art, labelling under 《人工智能生成合成内容标识办法》 (explicit plus implicit/metadata labels), a kept human-edit trail, and hosting on CDN/cloud storage rather than in git (direction §6). These are **implementation rules** (the legal check is closed, D14). **Phase 1 still ships monograms only.** *(Timing superseded by CTO-D1, 2026-10-15: v1 ships code-drawn seal portraits; AI portraits are a post-launch content update, and these rules apply to it then.)* | direction §6, §3.5, §17 #16, AC 58 |
| D11 | Trademark: the founder has **cleared the name 点将台**. Resolved. | direction §8 |
| D12 | Distribution: the founder posts the **Phase 1 prototype** into **15-20 WeChat groups** for ≥ 7 days. *(Superseded by D16: no group test before the full build.)* | §1, direction §10 |
| D13 | Scope: the game is **三国 only**. Phase 0 is platform-API verification plus a compliance/legal check (about 3-5 days, before any code); the compliance/legal part is now done (D14), so Phase 0 is platform-API verification only. Concept validation rests entirely on the Phase 1 prototype and the §1 go/kill thresholds. *(三国 only still holds. The validation clause is superseded by D16: the go/kill thresholds are now post-launch KPIs, PO-15.)* | §1, §17, direction §10 |
| D14 | **Compliance/legal check completed by the founder (2026-10-14):** 版号 (IAA-only), 备案, 软著, 诱导分享, ads, AIGC labelling, content review, privacy. **Cleared.** The compliance-only Phase 0 items are closed ("cleared by founder D14", §17). The [COMPLIANCE] design rules in this spec stay in force, and release still runs its normal pre-submission rules check before any upload. | §4, §12, §16, §17, direction §10 |
| D15 | **"12-0 is really hard"** (founder, 2026-10-14). 一统天下 is a rare event: sensible-player 12-0 at 0.2-0.5%, greedy ≤ 1%, naive < 0.2%, random < 0.01%. Optimal play reaches 12-0 on 100% of accepted daily seeds (a gate) but on only about 1-2% of free seeds, which is accepted. The random/naive/greedy mean-win targets become soft (reported, not gating). Consequence: accepted daily seeds are rare (about 0.5% of candidates), so the offline seed bank is the primary and practically mandatory daily source (§5.2). General stats are unchanged (Appendix B is authoritative). *(v1: the same targets must hold for the 120-general roster, AC 74.)* | §2, §5.2, §7.2, §7.5, §8.3, §18, AC 15, 21, 53, 54, 74 |
| **D16** | **"Merge phase 0, 1, 2" (founder, 2026-10-15).** Build the complete game in one go: no group test, no go/kill gate before the full build, no interim founder approvals. Phase 0 is done; the Phase 1 build is finished and QA-verified; v1 = everything already built + the v1 scope (CTO-D2), then release: **v1 complete build → QA → release pack → Founder Handoff → founder device pass → submission.** | whole doc, §1, §17.1, §19, §21, direction §10 |

D9 (update), D14 and D15 were relayed to product-ux by the CTO on 2026-10-14 as founder confirmations. D16 was relayed by the CTO on 2026-10-15.

**CTO rulings and product calls for v1 (2026-10-15).** Full rationale and alternatives are in `docs/dianjiangtai/decisions.md`.

| # | Ruling / call | Where |
|---|---|---|
| CTO-D1 | **Seal portraits, no AI art in v1.** Ink-seal style, faction colour, the general's name characters, a frame per tier, drawn in code (no image files, no CDN). Supersedes D10's timing; AI portraits become a post-launch content update. | §3.5, §8.2, direction §6, AC 58, 76 |
| CTO-D2 | **v1 scope.** IN: 120 generals with 晋/归晋, multi-appearance and more bonds; seal portraits; 识人模式; streaks; history archive; save card to album; opt-in subscribe message; progressive daily tokens and `mismatch` anomaly flags; large-text and high-contrast modes; banner on board screens behind config (default off); config-driven interstitial; re-tuning to D15. OUT (backlog, §21): 擂台赛, updatable cards, 视频号 clip, expansion themes, the banner A/B test. | §1, §21 |
| PO-1 | 识人模式 = **every Sunday's daily** (Beijing date); no toggle in v1. | §8.11, AC 77-79 |
| PO-2, PO-3 | One record per person with `appearances[]`; a person is drafted at most once per run; cohesion uses the drafted cell's faction; appearance rule; Phase 1 simplifications corrected. | §3.2, §3.5, §7.2, App. C |
| PO-4 | Roster 120: primary 蜀 26 · 魏 26 · 吴 25 · 群 25 · 晋 18; 21 used cells, each ≥ 4. | App. C, AC 69 |
| PO-5 | Pool cap 8 per round, deterministic. | §4, §7.4, AC 72 |
| PO-6, PO-7 | Streak rules (unpublished days skipped, no rewards); 30-issue history, best lineup only after the window closes. | §8.9, AC 80-82 |
| PO-8, PO-9 | Progressive tokens via `startRun`/`getRound`; anomaly flags are observe-only. | §5.2, §14, AC 86-88 |
| PO-10, PO-11 | Subscribe message only for the challenge sharer, one grant per challenge; remote `app_config` for the template ID, banner and interstitial caps. | §8.13, §12, §14, AC 84-85, 91-92 |
| PO-12, PO-13, PO-14 | Large-text and high-contrast modes; seal design; banner only in board `ready`/`empty` states. | §8.10, §8.2, §12, AC 89-91 |
| PO-15, PO-16, PO-17 | Go/kill thresholds become post-launch KPIs; the device spike becomes the founder's device pass; contentVersion 2 and a regenerated seed bank before launch. | §1, §15, §17.1, §19 |

CTO review changes, 2026-10-14 (also applied):

| # | Change | Where |
|---|---|---|
| C1 | **Leaderboard trust.** Open-data-domain boards are written by the client and can be tampered with. Phase 0 checks for a server-side write path; if none, the risk is accepted for Phase 1, documented, and made detectable. **Superseded by C3.** | (§11) |
| C2 | **Daily seed generation cost.** `genDaily` gets a measured time budget, an offline seed bank, and a precise definition of per-seed gate rates. (Amended by D15/C5: the bank is the primary path, live generation is last resort, and no "relaxed" seed is ever published.) | §5.2, §7.5.1, §14, §17 #20, AC 53-55 |
| C3 | **Server-authoritative leaderboard** (replaces the old §11.4 Path A/B). Phase 0 found that a server write (`setUserStorage`) exists, but the client can overwrite the same key and the server cannot read it back (phase0-platform.md §3). So **ranks come only from our server**: the client's KV holds a minimal display marker that is never trusted for ranking; `getBoard` returns today's server-validated results as `{h: hash(openid + per-day salt), w, …}`; the open data domain hashes each friend/group row's openid and ranks with the server values. Group context comes from `getGroupEnterInfo`, decrypted server-side by `joinGroup` (cloudID). Raw openids never reach the client. Fallback if the device spike fails: §11.8 fallbacks (1: Ed25519-signed values; 2: B-lite). | §11, §13, §14, §15, §16, §17, §17.1, AC 56, 60-63 |
| C4 | **Phase 0 findings applied** (phase0-platform.md): `getGroupEnterInfo` instead of the deprecated `getShareInfo`; 微信朋友关系 privacy declaration and the friend-scope flow; rewarded video `disableFallbackSharePage: true`; interstitial errors 2001-2003; cloud functions run in UTC+0 (`TZ=Asia/Shanghai`), explicit timeouts, idempotent `genDaily`, uniqueness by deterministic `_id`; `track` kept (no `wx.reportEvent`); package 4 MB/30 MB; Phase 2 updatable cards and 擂台赛 reworded. Phase 1 opens with a 1-2 day device spike (§17.1). | §5.2, §9, §12, §14, §15, §16, §17, §21, AC 64-68 |
| C5 | **Daily spoiler lock** (implemented). Nothing reveals a daily seed's best or rival lineup to someone who could still play that daily. For any run on a daily seed, `getReplay` returns `REPLAY_LOCKED`, and `submitRun.challengeCompare` / `getChallenge` return `theirLineup: null, lineupLocked: true`, until the caller has a ranked daily result for that date **or** the date's submit window has closed (after D+1 00:30 BJT). `getBoard` lineups (`x`) follow the same rule (`viewerPlayed`). Free seeds are never locked. Client copy: "今日军令完成后可复盘" and "对方阵容 · 完成今日军令后可见". Also recorded with it: the seed bank is the primary `genDaily` path and a failed live generation publishes no seed (`DAILY_UNAVAILABLE` plus an alert), replacing C2's "relaxed" seed; `track` reads `sessionId` top-level. | §5.2, §5.4, §7.4, §8.1, §8.3, §8.5, §9.3, §13, §14 (incl. §14.4 error codes), §15, §18, AC 21, 32, 51, 53, 54 |

---

## 1. Goal, target user, scope

**Goal (v1, D16).** Launch one complete, polished 三国 draft-and-grade game whose daily shared seed spreads through WeChat groups. There is no pre-launch validation gate: the former go/kill thresholds are now **post-launch KPIs** (INFERENCE; PO-15): ≥ 10% of completed runs shared, ≥ 25% of card opens lead to a started run, ≥ 3 completed runs per session, D1 ≥ 35%; watch levels: share < 4% or runs per session < 2. Launch-health targets: D1 ≥ 40%, D7 ≥ 15%, share rate ≥ 8% at scale. Metric definitions are in §15.

The game is **三国 only** (D13). Phase 0 (platform-API verification against the official docs) is **done**: findings in `docs/dianjiangtai/phase0-platform.md`, verdicts in §17. The compliance/legal check is done (D14). The Phase 1 build is done and QA-verified. **Release path (D16):** v1 complete build → QA → release pack → Founder Handoff (§19) → founder device pass (§17.1) → submission.

**Device pass (was the Phase 1 device spike, PO-16).** The share, group-entry, cloud, open data, ad, privacy, subscribe-message and album APIs have only run in the fake-`wx` harness. Before submission the founder (with minigame-dev on call) runs the §17.1 device pass on real iOS and Android phones. Its exit criteria are unchanged (E1-E7) plus E8-E12 for the v1 APIs. Every criterion has a specified fallback; a failure is a dev fix and re-check, not a new product decision.

**Package budget** (phase0-platform.md §10): main package ≤ **4 MB** (this includes the open data domain folder, which cannot be a subpackage), total ≤ **30 MB**. v1 (code, content JSON for 120 generals of about 55 KB, code-drawn seal portraits with **no image files**, a few sounds) fits in the main package; display fonts and audio beyond the essentials go in a subpackage. No CDN is needed (CTO-D1).

**Target user.** WeChat players aged 24-40 and 40+, many of them new to mobile games. Portrait, one thumb, large text, no timers. See direction §2.

**Feature scope**

| Feature | Built (Phase 1, QA-verified) | v1 additions (CTO-D2) | Post-launch backlog (§21) |
|---|---|---|---|
| Free play (unlimited runs) | Yes | | |
| Daily 军令 (shared seed, one attempt) | Yes | progressive per-round token delivery (§5.2) | |
| 5 roles, factions, eras | 4 factions (魏 蜀 吴 群), 4 eras | + **晋** faction, + **归晋** era (21 used cells) | |
| Generals | 32 (Appendix B), monograms | **120** (Appendix C), multi-appearance, 16 bonds, pool cap 8, **seal portraits** (CTO-D1) | AI-generated portraits (D10 rules) as a content update |
| Grading simulator, battle log, 复盘 | Yes | re-tuned for 120 (D15 targets hold, AC 74) | tuning from live data |
| Result share card (`shareAppMessage`) | Yes | + **save card to album** (§8.12) | updatable message |
| Challenge card (同签挑战) | Yes | + opt-in subscribe message "好友接下了你的战书" (§8.13) | 擂台赛 |
| Group and friend boards, server-ranked (C3) | Yes, today's daily | + **streaks** on rows | |
| Streaks, daily history archive | | **Yes** (§8.9) | replay past dailies |
| 识人模式 (hidden stats) | | **Yes: every Sunday's daily** (§8.11) | free-play 识人 toggle |
| Rewarded video: free-play re-spin, 复盘 | Yes (stub if no ad units, §12) | | |
| Interstitial | Yes, conservative caps | caps from remote config (§12) | |
| Banner | | board screens only, config, **default off** (§12) | banner A/B test |
| Accessibility | | **large-text and high-contrast modes** (§8.10) | screen-reader labels |
| Anti-cheat | server replay, `mismatch` field | progressive tokens, **anomaly flags** (§14.5) | automatic sanctions |
| Analytics | Yes | new v1 events (§15); go/kill → post-launch KPIs | |
| Expansion themes (水浒/西游/关公战秦琼/盲排), 视频号 clip | | | backlog |

**Tech reuse from `apps/cheatshaizi/mini-game/`.** See Appendix A. In short: we reuse the native-canvas scene loop, capsule-aware layout, single-finger touch routing, the mulberry32 seeded RNG, the fake-`wx` smoke-test harness, the `core/` vs `js/` split with its drift test, and the `tools/stats.js` distribution-tool pattern. We do not reuse the content, and explicitly not its rigged-roll logic.

---

## 2. Core loop, step by step

A run takes about 40-90 s (draft 30-60 s, reveal about 9 s, result 10-30 s).

1. **Choose a mode** on home: 今日军令 (daily, one attempt) or 自由点将 (free, unlimited). Or arrive from a challenge card (§9.3).
2. **Round n of 5: flip the token.** Tap 翻令. Two tokens flip: a **faction** (魏/蜀/吴/群/晋) and an **era** (黄巾/群雄/赤壁/三分/归晋). The faction-era pair defines the candidate pool. 晋 appears only with 归晋 (§3.2). In the daily, each round's tokens come from the server at that flip (§5.2, progressive delivery).
3. **Optional re-spin.** Before picking, the player may use 换势力 (re-roll faction only) or 换时代 (re-roll era only). Each is free once per run. In free play, rewarded video gives extra re-spins (§4).
4. **Pick a general.** The pool shows up to 8 undrafted generals who served that faction in that era (pool cap, §4), with stats and a role-fit chip for each open slot. On a 识人 daily (Sundays, §8.11) stats, tier and fit chips are hidden until the verdict.
5. **Place the general.** Tap an open role slot (主公/军师/先锋/猛将/守将). 撤回 (undo) is allowed until the next 翻令.
6. Repeat steps 2-5 until all five slots are filled (five rounds, one general per round, one general per slot).
7. **Campaign.** Tap 出征. The simulator runs 12 battles (§7). The reveal animates one battle row at a time (about 0.7 s each, tap to skip), each with a one-line cause.
8. **Verdict.** The record (for example 10胜2负), the grade band (for example 霸业将成), the 说书人 评语 and a rarity line ("今日仅 0.3% 的主公一统天下"; 12-0 is meant to be very rare, D15).
9. **Next actions** (all optional): 分享战报 · 发起挑战 (then, optionally, 应战提醒) · 保存图片 · 复盘 (rewarded video) · 看群榜/好友榜 · 再来一局 (goes to free play).

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
| `jin` | 晋 (the 司马氏 court from 249 on, and the 晋 state) | 月白 `#C9D3DD` (light: always drawn with ink text, never white text) | **v1** |

**v1 rule: multi-appearance (PO-2, PO-3).** Each general has one **primary faction** (`faction`, the camp they are best remembered with; used for the detail sheet and the default seal colour) and one or more **appearances** (`appearances[]`: a faction plus the eras in which they served it). A general appears in every faction-era cell their appearances cover, for example 赵云 in 群-群雄 (under 公孙瓒) and in 蜀-群雄/赤壁/三分. **Appearance rule:** an appearance needs notable recorded service of about a year or more in that camp. A lord fighting under another lord's banner with his own following keeps his own camp (刘备 under 曹操, 孙策 under 袁术). Shorter stints go in `statNote` only (关羽 under 曹操, 200). **晋** = the 司马氏 court from 高平陵 (249) on, plus generals who later served the 晋 state, so 邓艾 and 钟会 (d. 264) are 魏 only. The 晋 camp exists only in the 归晋 era, so the cells 晋 × 黄巾/群雄/赤壁/三分 are unused and never drawn.

**Drafting rule:** a person can be drafted **at most once per run**, from whichever cell. Once drafted, they are shown dimmed "已点将" in any later pool. **Cohesion** (§7.2) counts the faction of the cell each general was drafted from. Bonds (§7.3) count people, whatever the appearance. Stats never differ by appearance.

### 3.3 Eras

| Key | Label | Span (approx.) | Phase |
|---|---|---|---|
| `huangjin` | 黄巾 | 184-189 | 1 |
| `qunxiong` | 群雄 | 190-207 (incl. 官渡) | 1 |
| `chibi` | 赤壁 | 208-214 | 1 |
| `sanfen` | 三分 | 215-234 (荆州, 夷陵, 北伐) | 1 |
| `guijin` | 归晋 | 235-280 (高平陵 249, 灭蜀 263, 平吴 280) | **v1** |

Each appearance lists every era in which the general had notable recorded activity in that camp. The 黄巾 era (184-189) includes the end-189 起兵 of 曹操 and his first followers. The Phase 1 single-faction simplifications (张郃 in 魏-黄巾, 马超 in 蜀-群雄, 赵云/张辽/黄忠 with no 群 cells) are **corrected in v1** with proper 群 appearances (Appendix C). Appendix B keeps the Phase 1 rows for reference.

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
  "appearances": [
    { "faction": "qun", "eras": ["qunxiong"], "note": "从公孙瓒" },
    { "faction": "shu", "eras": ["qunxiong", "chibi", "sanfen"] }
  ],
  "eras": ["qunxiong", "chibi", "sanfen"],
  "primaryRole": "mengjiang",
  "stats": { "zhi": 6, "xin": 10, "ren": 8, "yong": 9, "yan": 8 },
  "tier": "jia",
  "bonds": [],
  "portraitId": null,
  "monogram": "云",
  "blurb": "一身是胆，忠勇无双。",
  "statNote": "信10：终身无二主；智6：以勇略见长而非谋主。",
  "source": "三国志·蜀书 / 三国演义（公有领域）",
  "contentVersion": 2
}
```

Worked role scores for this entry: 主公 8.15 · 军师 7.0 · 先锋 8.45 · 猛将 9.0 · 守将 8.2.

| Field | Type | Notes |
|---|---|---|
| `id` | string | stable, `g_` + pinyin |
| `name`, `courtesy` | string | public-domain historical names |
| `faction` | enum §3.2 | **primary** faction (v1). Detail-sheet colour and default seal colour. Must equal the faction of at least one appearance |
| `appearances` | `[{faction, eras[], note?}]` | **(v1)** ≥ 1 entry; at most one entry per faction; `eras` ≥ 1; `note` ≤ 6 chars, shown under the name in that cell's pool (for example "从公孙瓒"). **Cells are built from appearances.** A 晋 appearance may only list `guijin`. Content v1 (Phase 1) is read as one appearance `{faction, eras}` |
| `eras` | enum[] §3.3 | union of all appearance eras (derived; the validator checks it). Kept for compatibility |
| `primaryRole` | enum §3.4 | display only (the "natural" slot); not used by the sim |
| `stats` | 5 × int 1-10 | §3.1 |
| `tier` | `jia` / `yi` / `bing` (甲/乙/丙) | **display only**. Derived from the stat total (甲 ≥ 38, 乙 30-37, 丙 ≤ 29; tunable). Never affects draw odds. We do not use rarity words like SSR, 传说 or 稀有 |
| `bonds` | string[] | bond keys (§7.3) |
| `portraitId` | string \| null | **v1: always `null`, so the code-drawn seal portrait renders** (CTO-D1). Reserved for the post-launch AI-portrait content update (D10 rules, direction §6). No image file and no CDN in v1 |
| `monogram` | 1 char | the seal at sizes < 48 pt. Need not be unique (渊: 夏侯渊/公孙渊), since the name is always shown next to it |
| `blurb` | string ≤ 14 chars | our own words |
| `statNote` | string | rationale, internal plus shown in the detail sheet |
| `source` | string | provenance |
| `contentVersion` | int | the sim and server validation pin to this |

**Counts (v1, PO-4):** **120** generals, `contentVersion` **2** (Appendix C). By primary faction: 蜀 26, 魏 26, 吴 25, 群 25, 晋 18. By faction membership (any appearance): 蜀 28, 魏 34, 吴 28, 群 38, 晋 22. 26 generals appear in more than one faction. **21 used faction-era cells** (4 factions × 5 eras + 晋-归晋), **each ≥ 4 generals** (sizes 4-27, 273 general-cell entries). The 32 Phase 1 generals keep their exact stats (Appendix B). Content ships as `content/generals.v2.json` (about 55 KB) in the main package. The server keeps v1 and v2 (last 2 versions).

**Seal portrait (v1, CTO-D1, PO-13).** Drawn in code on an offscreen canvas and cached per (general, faction, tier, size, contrast mode). There are no image files.
- **Layout:** the full `name` in seal layout, in the open-licence display face (宋/楷 from the font subpackage; system font until it loads), **not** seal script. 2 characters side by side, read right to left. 3 characters as a right column of 1 large character plus a left column of 2. 4 characters (none in v1) as 2 × 2. Below 48 pt only `monogram` is drawn.
- **Colour:** in pools and lineups, the faction of the cell the general was drawn or drafted from. In the detail sheet, the primary faction. Ink-red seal style: the faction colour as a solid fill with paper-coloured characters, except **晋 月白**, which uses ink characters on 月白 for contrast. High-contrast mode uses the darker set (§8.10).
- **Tier frame:** 甲 = double border with four corner marks; 乙 = single border; 丙 = thin border with a worn (broken) edge. Frames always come with the tier character in text (甲/乙/丙) wherever tier is shown, never frame alone. In 识人 drafts (§8.11) the frame is the plain 乙 style for everyone, so tier doesn't leak.
- Light paper texture and a slight ink bleed are drawn procedurally. No likeness of any person and no imitation of any game's art.

---

## 4. Spin (翻令) and re-spin rules

**Token sheet.** Each run uses a *token sheet* generated deterministically from the run seed by `core/sheet.js`:
`rounds[5] = { faction, era, altFaction[3], altEra[3] }`.

Generation rules:
1. Each primary cell (faction, era) must contain ≥ `minCell` generals (contentVersion 1: 2; **contentVersion 2: 4**). With the 120-general roster exactly the **21 used cells** qualify (§3.2), so the cell is uniformly random among the 21. **No rarity weighting.** The 4 unused 晋 cells are empty and never drawn. Because 晋 exists only in 归晋, 换时代 on a 晋 token always shows "此令无可换", and 换势力 from 晋-归晋 offers 魏/蜀/吴/群.
2. `altFaction[k]` differs from the current faction and makes a valid cell with the current era. The same holds for `altEra[k]` with the current faction. Index k = the number of re-spins of that dimension already used in this round.
3. If a re-spin has no valid alternative, its button is disabled with the hint "此令无可换".

**Pool.** Pool = generals in (faction, era) **minus those already drafted** (a person drafted from any cell counts as drafted, §3.2), **capped at `poolCap` = 8 (v1, PO-5)**:
- For each round r and cell, the **pool order** is a deterministic shuffle of the cell's roster indexes with `sub(seed, "pool:" + r + ":" + faction + ":" + era)`. It depends only on the seed, round and cell, never on the player's choices.
- The pool is the first `poolCap` generals in that order who are not drafted. Undoing a pick restores the earlier pool exactly. The list is displayed in roster order (stable, same as Phase 1). Members of the cell already in the player's lineup are listed after the pool, dimmed with "已点将". They are not selectable and don't count toward the cap.
- A cell with ≤ `poolCap` generals shows all undrafted members, so contentVersion 1 behaves exactly as before.
- The pool header reads "可点之将 (8)"; the 玩法 sheet explains once: "人多之令，每轮随机得见八将".
- `poolCap` lives in `core/config.js` (versioned by `configVersion`). The server and client use the same function (`core/draft.js`).

If a pool is empty because of earlier picks, the token reflips automatically from a deterministic fallback stream. This does not use a re-spin, and the log says "此路无将，重新翻令".

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
- **Variant (v1, PO-1):** `daily_seeds.variant` is `'shiren'` when the Beijing date is a Sunday (`config.shiren.weekday = 0`, computed from the dateKey by `core/date.js`, never the device), otherwise `'standard'`. It is set when the document is created. The variant changes only what the client shows during the draft (§8.11), never the seed, sheet, sim, gates or validation, so bank entries need no variant.
- **Idempotency.** WeChat may deliver a timer trigger more than once, and the lazy path can race the timer. `daily_seeds` uses the fixed `_id = YYYYMMDD` and is created with `add` of that `_id` inside a transaction that also marks the bank entry used; a second writer's `add` fails on the duplicate `_id`, its transaction rolls back (the bank entry stays unused), and it returns the existing document. Uniqueness never relies on console unique indexes (unverified, phase0-platform.md §9).
- **Timeouts.** The default cloud function timeout (3 s per CloudBase docs) is far too short. Each function's timeout is set explicitly in its config (§14.2); `genDaily`'s value is set from the spike's measurement (§17.1). The live loop's 70% cut-off is computed from the configured value, read from config, not hard-coded.
- **Seed acceptance:** a daily seed is accepted only if it passes the daily gates in §7.5 (the best lineup for the primary tokens reaches 12-0, and the greedy and random 12-0 rates, computed as defined in §7.5.1, are inside their windows). Because 12-0 is meant to be rare (D15), only about **0.5%** of candidate seeds pass (measured 0.53% over 1,500 candidates: about **190 candidates per accepted seed**; about 98.5% fail the optimal-12-0 gate alone).
- **Where accepted seeds come from (C2, amended by D15/C5).** At that acceptance rate a live loop of 50 candidates finds a seed on only about 20% of days (measured: about 23%), and 50 candidates take about 12 s at p99. So:
  1. **Seed bank (primary, practically mandatory).** Seeds are generated and gate-checked offline, then imported into the `daily_seed_bank` collection (client access denied). The exact commands are in `apps/dianjiangtai/cloudfunctions/README.md` ("Seed bank flow"): `tools/simstats.js --bank <days> --bank-file <tmp>` generates accepted seeds with their `gates` record, `cloudfunctions/scripts/prepare-bank.js` re-verifies every entry with the real core and writes a JSON Lines import file with deterministic `_id = bank_<seed>` (re-imports cannot duplicate), and the file is imported in the cloud console (skip on conflict). **Who runs it:** an ops step done by whoever holds cloud console access (the founder, or a developer the founder delegates), with backend preparing the files: **before launch** (at least 60 days, **generated for contentVersion 2 and the v1 configVersion**; all contentVersion 1 entries become unusable, PO-17), then **monthly**, and also whenever the low-bank warning fires or after any content/config/gate version bump (old entries become unusable). `genDaily` takes the next unused bank entry (by `_id`) whose `contentVersion`, `configVersion` and `gateVersion` match the live ones, re-runs only the cheap check (rebuilds `rounds` and verifies that the stored best lineup still scores 12-0), and marks the entry used in the same transaction that writes `daily_seeds`. The bank files contain future daily seeds, so they are spoilers: **never committed to the repo**, deleted locally after import.
  2. **Live generation (last resort only).** Only if the bank has no matching entry (empty, or a version bump) does `genDaily` (or the lazy `getDaily` path) run the strict gates live, in a loop that stops at 50 candidates **or** at 70% of the function timeout, whichever comes first. If no candidate passes, **no seed is published**: the function returns `DAILY_UNAVAILABLE`, logs an `[ALERT]`, and writes a `daily_gen` event with `failed: true`. There is no "relaxed" seed: a daily without a 12-0 optimum is never published (`gates.relaxed` is always `false`). Clients then show the daily fetch-failed state ("今日军令需联网获取" plus 重试); free play is unaffected.
  - `genDaily` records `source: bank|live`, `attempts` and `genMs` on the `daily_seeds` document, and `bankLeft` on the `daily_gen` event. **Low-bank warning:** fewer than **10** matching entries left logs a warning so the bank is refilled in time. (The unused `config.daily.bankLowWarn = 7` in `core/config.js` is stale; the backend constant `BANK_LOW_WATER = 10` is what runs.)
- **One attempt:** the attempt starts at the first `flip` (the server logs `startRun`). One official result per openid per date. An in-progress daily is saved locally and resumes on relaunch.
- **Authoritative result:** the client receives only the token sheet (`rounds`), never the battle stream or the best lineup. On 出征, the client sends `actions[]`. The server replays, simulates and returns the record and battle log. This prevents precomputing the optimum from the seed.
- **Progressive token delivery (v1, CTO-D2, PO-8).** For a ranked daily attempt the client never holds a future round:
  1. `getDaily` returns the status only (no `rounds`), plus `variant`, `myStreak` and `features`.
  2. The first 翻令 calls `startRun({mode:'daily', clientRunId, dateKey})`. It logs the start (as before) and returns `rounds: [round1]`. A resumed attempt returns every round released so far.
  3. Each later 翻令 calls **`getRound({clientRunId, dateKey, actions})`** with all actions so far (through round n's pick). The server replays them with the validation rules of §14.3 (partial run). If they extend the stored prefix, it stores them in `daily_progress`, **freezes them** and returns `round n+1`. Each round carries its `altFaction`/`altEra` (re-spins work offline within the round) and its `fallback` token sets (pool-empty reflip). Calls are idempotent: the same prefix returns the same round.
  4. `submitRun` for a ranked daily requires `released == 5`, and its `actions` must **extend the frozen prefix exactly**. Otherwise `INVALID_ACTIONS` plus a `prefix` anomaly (§14.5).
  5. 撤回 still works inside a round, since a pick is frozen only by the next 翻令, which matches the existing undo rule (§2 step 5).
  6. The flip animation (about 1.2 s) covers the round trip. Timeout 5 s, then the draft shows "令牌传递中断" plus 重试 (§8.2). The current round stays playable offline.
  - The same applies to a **challenge run that counts as today's daily** (§9.3): `getChallenge` returns no `rounds`, and `startRun({mode:'challenge', challengeId})` plus `getRound` deliver them. Free play, friendly challenges and challenges on past or free seeds still get the full sheet up front (nothing ranked depends on it, and the sheet doesn't depend on choices).
- **Daily spoiler lock (C5).** For any run on a daily seed (daily, or a challenge/friendly played on a daily seed), `getReplay` returns `REPLAY_LOCKED` until the caller has a ranked daily result for that date **or** D+1 00:30 BJT has passed (the end of the submit window). The client shows "今日军令完成后可复盘" and offers no ad for a locked 复盘. The same rule withholds rival lineups in challenges (§5.4, §9.3) and on boards (§11.4). Free seeds are never locked.

### 5.3 Free play

- Seed = a random uint32 on the client, simulated **on the client** (works offline).
- Unlimited runs. Ad re-spins are allowed. Results never feed a leaderboard.
- Free runs are submitted to the server best-effort (for analytics and as the base for challenges). The server replays them to validate before creating any challenge.

### 5.4 Challenge run

Plays the sharer's seed and token sheet (daily or free), with 1+1 free re-spins and no ad re-spins. See §9.3 for counting rules. On a **daily** seed the spoiler lock (C5, §5.2) applies: after a friendly answer by someone who has not yet played that day's daily, the comparison shows the sharer's record but `theirLineup: null, lineupLocked: true` ("对方阵容 · 完成今日军令后可见"), and 复盘 is locked, until the caller has a ranked daily result for that date or D+1 00:30 BJT has passed.

---

## 6. (Reserved: merged into §5)

---

## 7. Grading simulator (`core/sim.js`)

### 7.1 Inputs
- `lineup`: 5 × `{slot, generalId}`, with all slots filled
- `contentVersion` (the stats table)
- `battleStream` from `sub(seed, "battle")` and `eventStream` from `sub(seed, "event")`
- `config` (all weights, curve, τ, jitter and event thresholds in `core/config.js`, versioned by `configVersion`). **`core/config.js` is authoritative** for every tuning value; the numbers quoted in §7.2-§7.5 are the tuned configVersion 1 values, recorded here for reference. If they ever differ, config.js wins and this spec is updated.

### 7.2 Formula sketch

1. **Role scores.** `S_r = roleScore(general in slot r, r)` (§3.4).
2. **Morale multiplier.**
   `M = 0.85 + 0.03 × S_zhugong + 0.04 × (active bonds) + cohesion`
   cohesion = +0.03 if 4 drafted generals share a faction, +0.05 if all 5 do. M is capped at 1.25. **(v1)** A general's faction here is the faction of the cell they were **drafted from** (the round's faction token at the pick), not their primary faction. For single-appearance content this is identical to Phase 1.
3. **The campaign: 12 battles.** For battle i, the battle stream draws a type `T_i` from {野战, 攻城, 守城, 水战, 奇袭, 安民}, with ≥ 1 of each guaranteed and the rest random. It also draws a **shared luck roll** `u_i ∈ [0,1)` (天时) and an opponent jitter `j_i`, uniform in `[-jitter, +jitter]` with tuned **jitter = 0.35** (starting value was 0.3).
4. **Team power.** `P_i = M × Σ_r b[T_i][r] × S_r`

   | Type | 主公 | 军师 | 先锋 | 猛将 | 守将 |
   |---|---|---|---|---|---|
   | 野战 | .15 | .15 | .30 | .30 | .10 |
   | 攻城 | .15 | .25 | .25 | .20 | .15 |
   | 守城 | .15 | .20 | .05 | .15 | .45 |
   | 水战 | .15 | .40 | .15 | .15 | .15 |
   | 奇袭 | .10 | .30 | .35 | .20 | .05 |
   | 安民 | .45 | .25 | .05 | .05 | .20 |

5. **Opponent.** `D_i = curve[i] + j_i`. Tuned curve (configVersion 1, D15): `[7.41, 7.674, 7.937, 8.201, 8.465, 8.728, 8.992, 9.255, 9.519, 9.783, 10.046, 10.31]` (linear, about +0.264 per battle; flatter and higher than the starting curve `[4.8 … 8.5]`).
6. **Win chance.** `p_i = 1 / (1 + exp(-(P_i - D_i) / τ))`, with tuned **τ = 0.7** (starting value was 0.5).
7. **Outcome.** The battle is won if `u_i < p_i`. Because `u_i` is the same for every lineup on the same seed, a stronger lineup never does worse in any battle than a weaker one, before events. That is what makes daily comparisons fair.
8. **Events** (deterministic from the event stream; at most one of each kind per run; each one logged by name):
   - **临阵生变 (wavering):** each drafted general with 信 ≤ 3 has a `(4 − 信) × 10%` chance to turn one won battle into a loss. If several qualify, only the first triggered event applies. Kept by founder decision D8. [COMPLIANCE: content review] Its log lines come only from a fixed, reviewed template list (neutral wording such as "吕布临阵生变，阵脚动摇", never insults), and release reviews that list before submission (AC 59). In the 32-general roster the qualifying generals are 吕布 (信2), 董卓 (信2) and 韩遂 (信3). In the v1 roster (Appendix C) there are 11: 吕布, 董卓, 糜芳, 钟会, 孟达, 公孙渊 (信2) and 韩遂, 袁术, 孙皓, 文钦, 贾充 (信3). The template list stays neutral and names no motive; content review checks every line against these 11 names.
   - **奇谋 (stratagem):** if the 军师 has 智 ≥ 9, the first lost 水战 or 奇袭 battle with `p_i ≥ pMin` becomes a win.
   - **万夫莫敌 (unstoppable):** if the 猛将 has 勇 = 10, the first lost 野战 with `p_i ≥ pMin` becomes a win.
   - Tuned **pMin = 0.672** for both (starting value was 0.35); with it, events fire in about 28% of sensible runs (target 15-30%).
9. **Record** = wins − losses out of 12.

### 7.3 Bonds (羁绊)
Bonds apply only when all members are drafted, in any slots and **from any appearance** (bonds count people, §3.2). Each adds +0.04 to M (the M cap of 1.25 still applies). Bond names are our own and generic, taken from places, events or plain descriptions; they don't copy any game's skill names. Phase 1 set: 桃园 (刘备, 关羽, 张飞), 江东 (孙策, 周瑜).

**v1 set (contentVersion 2), 16 bonds:**

| Key | Label | Members | Basis |
|---|---|---|---|
| `taoyuan` | 桃园 | 刘备, 关羽, 张飞 | (Phase 1) |
| `jiangdong` | 江东 | 孙策, 周瑜 | (Phase 1) |
| `longfeng` | 龙凤 | 诸葛亮, 庞统 | 卧龙、凤雏 |
| `suwei` | 宿卫 | 许褚, 典韦 | 曹操宿卫 |
| `xiliang` | 西凉 | 马超, 马岱, 庞德 | 随马氏起于凉州 |
| `shiyuan` | 释怨 | 甘宁, 凌统 | 同列孙权帐下而化解宿怨 |
| `shenting` | 神亭 | 孙策, 太史慈 | 神亭相斗，后归孙策 |
| `xiapi` | 下邳 | 吕布, 陈宫, 高顺 | 同守下邳 198 |
| `hebei` | 河北 | 袁绍, 沮授, 颜良 | 袁绍帐下 |
| `pingluan` | 平乱 | 皇甫嵩, 朱儁, 卢植 | 184 讨黄巾 |
| `ershi` | 二士 | 邓艾, 钟会 | 263 分道伐蜀 |
| `pingwu` | 平吴 | 羊祜, 杜预, 王濬 | 谋吴与平吴 |
| `henei` | 河内 | 司马懿, 司马师, 司马昭 | 河内司马氏 |
| `fuzi_guan` | 父子同袍 | 关羽, 关平 | 父子同殁 219 |
| `fuzi_lu` | 父子同袍 | 陆逊, 陆抗 | 父子两代镇西陵 |
| `houji` | 承业 | 蒋琬, 费祎, 姜维 | 继诸葛亮之业 |

Every bond is achievable in one run (its members can be drafted from cells of the same or different rounds). The arguability checks (§7.5) report how often each bond fires.

### 7.4 Battle log and "fair but arguable" rules
- Each row shows: `第i战 · <type> · 胜/负 · 胜算<p_i in 成, e.g. 七成> · 天时<吉/平/凶 from u_i> · <cause line>`.
- The cause line is templated by type and the top-contributing slot, for example "水战：周瑜运筹，火攻得手" or "守城：守将调度失当，城门失守". Event rows name the event.
- After the reveal, the player can see: their lineup with `S_r` per slot and fit chips, M with its parts (主公, bonds, cohesion), and per-battle `p_i` and 天时.
- **复盘** shows the best lineup for *the player's own final tokens* (after re-spins), its record, and the per-slot difference. It is computed by exhaustive search over pool picks × slot permutations. **Size with the 32-general roster:** cells hold 2-8 generals (77 general-cell entries over 16 cells, mean about 4.8 before removing drafted ones; Appendix B), so the pick combinations per run are at most 8^5 = 32,768 and typically about 1,500-2,500 (4.8^5 ≈ 2,550, less after drafted generals are removed); times 120 slot permutations, that is typically about 180k-300k lineup evaluations and **about 3.9M in the theoretical worst case** (five rounds all on the 8-general 蜀-三分 cell). The target stays < 300 ms on a mid-range Android, so the search must:
  - prune dominated picks within a round: drop general B if another general A in the same pool has every role score ≥ B's, 信 ≥ B's (or both > 3), 智 ≥ B's and 勇 ≥ B's, and B is not in any bond (all pool members share a faction, so cohesion is unaffected);
  - reuse per-battle partial sums across permutations;
  - report the evaluation count and time distribution, including the worst case, in `tools/simstats.js`.
  **v1 (120 generals):** cells hold up to 27 generals, but the pool cap (`poolCap` = 8, §4) keeps every pool at ≤ 8, so the bounds above (≤ 32,768 pick combinations, about 3.9M evaluations in the theoretical worst case) **are unchanged**. Without the cap the worst case would be 27^5 ≈ 14M sets, which is one reason for the cap (PO-5). Pools are fuller more often (a cell of ≥ 8 always shows 8), so the typical case moves toward 8^5. `tools/simstats.js` re-measures the distribution, and the `search.heavySets` threshold is re-tuned so the client p99 stays < 300 ms.
  If the measured worst case still exceeds 300 ms on the reference device, the free-play 复盘 is also served by `getReplay` (with a client spinner), as the daily 复盘 already is. The free-play 复盘 is computed on the client by default; the daily 复盘 comes from the server. **As implemented:** token sets with more than `search.heavySets` (2,000) distinct general sets are asked of `getReplay` first (about 10% of free runs); measured client-side search p99 about 115 ms, max about 245 ms in Node.
- **Daily 复盘 is spoiler-locked (C5, §5.2).** For any run on a daily seed, `getReplay` returns `REPLAY_LOCKED` until the caller has a ranked daily result for that date or D+1 00:30 BJT has passed. The 复盘 button then reads "今日军令完成后可复盘" and no rewarded video is offered.
- **No per-player adjustment, ever.** No rubber-banding, no pity, no effect from ads watched, run count, new-user status or spending. QA-testable via determinism (§20).

### 7.5 Grade bands and tuning targets

Targets set by founder decision **D15 ("12-0 is really hard")**. Band targets live in `core/config.js` (`bands[].target`); the "achieved" column is two 100k-seed runs of `tools/simstats.js` (configVersion 1: `simstats-report.md`, `simstats-run2.md`).

| Record (wins) | Band | Target share of free-play runs (sensible-player model) | Achieved (run 1 / run 2) |
|---|---|---|---|
| 12-0 | **一统天下** (seal stamp, 编钟) | **0.2-0.5%** | 0.33% / 0.35% |
| 10-11 | 霸业将成 | **6-10%** | 8.96% / 9.12% |
| 8-9 | 雄踞一方 | 22-32% | 30.46% / 30.16% |
| 6-7 | 三分鼎立 | 25-36% | 33.72% / 33.60% |
| 4-5 | 偏安一方 | 15-25% | 18.73% / 19.00% |
| 2-3 | 兵微将寡 | 5-12% | 6.76% / 6.71% |
| 0-1 | 一败涂地 | **≤ 2%** | 1.04% / 1.06% |

**Player models** for the tuning tool `tools/simstats.js` (pattern: cheatshaizi `tools/stats.js`), run over ≥ 100k seeds. **Hard** targets (the tool fails if missed) are the 12-0 rates, the sensible median and the band shares; the mean-win targets for random, naive and greedy are **soft** (reported as NOTE, not gating, D15).
- *random*: a random pick into a random open slot. 12-0 rate **< 0.01%** (achieved 0.00%). Soft: original mean 4.5-5.5 (achieved about 2.2).
- *naive*: the highest-tier pick into its `primaryRole`, or else the best open slot. 12-0 rate **< 0.2%** (achieved 0.13%). Soft: original mean 7-8 (achieved about 5.9).
- *greedy*: the pick and slot that maximise the current `S_r` sum. 12-0 rate **≤ 1%** (achieved 0.55-0.59%). Soft: original mean 8-9 (achieved about 7.7).
- *sensible* = a 50/50 mix of naive and greedy. Used for the table above. 12-0 rate **0.2-0.5%** (achieved about 0.33-0.35%); median **6-7** wins (achieved 7).
- *optimal* (复盘): reaches 12-0 on **100% of accepted daily seeds** (a seed-acceptance gate). On free seeds optimal 12-0 is low, **about 1-2%** (measured 1.8% over 3,000 seeds), and this is accepted (D15): on most free token sheets no lineup can sweep, so 复盘 shows the best achievable record, not necessarily 12-0.

Formula weights, role weights and morale constants are unchanged from §3.4/§7.2; only the curve, τ, jitter and event pMin were retuned (§7.2).

**v1 re-tuning (contentVersion 2, D15 kept, AC 74).** The 120-general roster changes the stat mix (18 甲 / 67 乙 / 35 丙 vs 10 / 15 / 7), the cell sizes, the pool cap and the bonds, so the configVersion 1 numbers will drift. The D15 targets above are **unchanged and hard** for contentVersion 2: sensible 12-0 in 0.2-0.5%, greedy ≤ 1%, naive < 0.2%, random < 0.01%, sensible median 6-7, every band within its target, events in 15-30%, and optimal 12-0 on 100% of accepted daily seeds. Order of levers: (1) the opponent curve, τ, jitter and pMin in `core/config.js` (new configVersion); (2) the bond bonus or M cap; (3) only if those can't reach the targets, stats of the **88 new** generals, each change recorded in its `statNote` and kept within the historical rationale. **The 32 Phase 1 generals' stats never change.** Arguability checks also report: no general in > 60% of optimal lineups, how often each bond fires, the share of runs drafting at least one multi-appearance general, and the daily seed acceptance rate (which must still let the offline bank produce ≥ 60 days of seeds in a reasonable offline run).

**Daily seed gates** (`core/config.js` `gates`): optimal = 12-0; greedy-population 12-0 rate in **[0.25%, 20%]** (`rateMin 0.0025`, `rateMax 0.2`); random-population 12-0 rate **< 0.5%** (`rateMax 0.005`). Measured acceptance about 0.5% of candidates (§5.2).

#### 7.5.1 How the gates are computed for a single seed (C2)

A daily seed fixes the token sheet and the battle and event streams, so a deterministic greedy player would score either 0% or 100%. The per-seed "rates" therefore come from a population of simulated players whose *choices* vary while the seed stays fixed:

- `gateCheck(seed, contentVersion, configVersion)` lives in `core/gates.js`, shared by `tools/simstats.js` and `genDaily` (same drift test as the rest of `core/`).
- **Optimal:** exhaustive search (§7.4) over the **primary tokens with no re-spins**. Gate: best record = 12-0. The search may stop at the first 12-0 for the gate itself, but the stored `best` uses the full search (tie-break: highest Σ p_i).
- **Greedy population:** K = 400 players. Player j uses its own stream `sub(seed, "gate:greedy:" + j)` only for its choices: in each round it re-spins a dimension (within the daily allowance, free only) with probability 0.3 when the best available `S_r` gain is < 7.0; then it takes the greedy pick and slot (max current `S_r` sum) with probability 0.8, otherwise the second-best pick-and-slot. Ties are broken by its stream.
- **Random population:** K = 400 players, each with `sub(seed, "gate:random:" + j)`, using re-spins with probability 0.5 per available re-spin, then a random pick into a random open slot.
- **Rates** = the share of each population reaching 12-0. With K = 400, the greedy window [0.25%, 20%] (inclusive) means 1-80 players, and random < 0.5% means at most 1 player. The greedy and random populations run only for seeds that pass the optimal gate.
- All players share the seed's battle and event streams, exactly like real players. The record is `gates = {optimal: {w,l}, greedyRate, randomRate, K: 400, gateVersion, relaxed: false, pass}`. `relaxed` is kept for format compatibility and is always `false`, since no relaxed seed is ever published (§5.2).
- `gateVersion` is bumped whenever these population rules change; bank entries with an old `gateVersion` are not used.
- The population parameters (K = 400, re-spin 0.3, gain threshold 7.0, take-best 0.8, random re-spin 0.5) and the gate windows are versioned in `core/config.js` (`gates`), which is authoritative. The greedy window was widened from the starting 0.5-5% to [0.25%, 20%] after the D15 retune.
- **Time budget (measured).** `gateCheck` per seed: median about 21 ms, p99 about 230-240 ms (Node, cloud-function equivalent), so p99 × 50 candidates ≈ 12 s. With about 0.5% acceptance, 50 live candidates succeed on only about 20% of days, so **the bank (§5.2) is mandatory in practice**; the live loop is a last resort bounded by its 50-candidate / 70%-of-timeout cut-off and publishes nothing if it fails.

**Arguability checks** (reported by the tool): no single general appears in > 60% of optimal lineups; each role's best occupant varies across seeds; events fire in **15-30%** of runs. Achieved: most frequent general in optimal lineups about 48% (≤ 60%), 8-16 different best occupants per role, events in about 28% of sensible runs.

**Rarity line.** Daily: the live share of today's submitted daily runs at that record or better (from `daily_stats`), shown once ≥ 30 runs exist, otherwise hidden; for example "今日仅 0.3% 的主公一统天下" or "今日仅 9.3% 的主公达到此战绩" (10-2). Free: the precomputed share from the tool's distribution (`config.freeRarity`, cumulative share of sensible runs reaching w wins or better), written as "约 x% 的阵容能达到"; with the tuned config that is about 0.3% for 12-0, 2.5% for 11+, 9.3% for 10+ and 22% for 9+.

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
│  │ 今日军令 · 第 12 期 · 识人    │  │ ← "· 识人" only on Sundays (§8.11)
│  │ 全服同一手令牌，每日一战       │  │
│  │ 连续出征 5 天                 │  │ ← streak line, only when ≥ 2 (§8.9)
│  │      [    出  征    ]        │  │ ← primary
│  └─────────────────────────────┘  │
│                                   │
│      [    自由点将 · 不限次    ]   │ ← secondary
│                                   │
│ [ 群榜 ] [ 好友榜 ] [ 往期 ] [ 玩法 ] │ ← 往期 = history (§8.9)
│                                   │
│   声音 开/关                设置    │ ← 设置 = 隐私与设置 + 显示 (§8.10)
└───────────────────────────────────┘
```
In large-text mode the four buttons wrap to two rows of two (§8.10).

| State | Daily card shows |
|---|---|
| Loading daily | skeleton card with "正在取今日军令…"; 自由点将 enabled |
| Daily available | 出征 |
| Daily in progress | "第 3/5 轮" plus 继续出征 |
| Daily done | "今日 10胜2负 · 霸业将成" plus 查看战报; card subline "明日 0:00 换新令" |
| Daily pending submit (offline at the end) | "战报待发送" plus 重试 |
| Daily fetch failed / offline (also `DAILY_UNAVAILABLE`, §5.2) | "今日军令需联网获取" plus 重试; 自由点将 still enabled |

- **First launch:** no consent screen and no login. The 玩法 sheet auto-opens once (three lines plus a picture, dismissible) and stays reachable through 玩法 afterwards.
- **设置 (隐私与设置):** sound toggle, **显示: 大字模式 / 高对比度 (v1, §8.10)**, the 用户隐私保护指引 link, and 联系我们/反馈 (`wx.createFeedbackButton`, a native overlay button positioned over the canvas; verdict OK, phase0-platform.md §12).
- **Daily card, v1 additions:** "· 识人" in the title on 识人 days. Streak line "连续出征 N 天" when the current streak is ≥ 2 (§8.9; no reward wording, no "别断了" pressure copy).
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
│ 可点之将 (8)                        │ ← ≤ poolCap (§4)
│ ┌───────────────────────────────┐ │
│ │[赵云] 赵云 甲 智6 信10 仁8 勇9 严8│ │ ← seal portrait; tap to select
│ │       从公孙瓒                  │ │ ← appearance note, if any
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
3. **General selected:** a bottom sheet shows the seal portrait (large, with tier frame and tier character), stats as 1-10 pips, `blurb`, `statNote`, the appearance note if any, and **each open slot as a button with its fit chip and S_r** (for example "先锋 8.5 适任"). Tapping a slot places the general and closes the sheet.
4. **Placed:** the slot fills with a stamp animation. 撤回 shows for this round; the primary button reads 下一轮 (or 出征 after round 5).

| State | Behaviour |
|---|---|
| Pool loading portraits | seals are drawn in code and show immediately (no loading in v1, CTO-D1) |
| Drafted elsewhere (v1) | a general drafted earlier from another cell shows dimmed with "已点将" and can't be selected (§3.2) |
| Waiting for the next round (daily, v1) | the tokens play the flip animation while `getRound`/`startRun` runs; the primary button is disabled ("翻令中…") |
| Next round unavailable (daily, offline or > 5 s, v1) | the tokens stay face down; the line "令牌传递中断" plus [重试] appears above the primary button. The current lineup is saved. 返回 works as usual. Free play is unaffected |
| 识人 run (v1, §8.11) | pool rows show seal, name, courtesy name and `blurb`, with no stats, tier or primaryRole. The detail sheet shows slot buttons with labels only (no S_r, no fit chips). The lineup shows names only. Header tag "识人 · 五德出征后揭晓" |
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
│  今日仅 9.3% 的主公达到此战绩          │
│  连续出征 5 天                        │ ← daily only, streak ≥ 2 (v1)
│ [主公 刘备 8.2][军师 诸葛亮 9.4] …    │ ← tap for breakdown
│ [ 分享战报 ]  [ 发起挑战 ]  [ 保存图片 ] │ ← 保存图片 (v1, §8.12)
│ [ ▶ 复盘·最佳阵容 ]  [ 看群榜/好友榜 ]  │
│        [      再来一局      ]        │
└───────────────────────────────────┘
```
After 发起挑战 succeeds and the share sheet closes, an inline card can appear above 再来一局 (v1, §8.13, only if a template ID is configured): "好友应战时提醒我 [提醒我]".

| State | Behaviour |
|---|---|
| Daily: waiting for server result | "军报传递中…" with a drum loop, ≤ 5 s timeout, then the offline state |
| Daily offline at submit | lineup saved; "战报待发送" plus 重试; auto-retries on `onShow` and on launch |
| Reveal playing | 9 s; tapping anywhere skips to the verdict |
| 12-0 | the seal stamp 一统天下 slams in, 编钟 sounds, a light vibration (`vibrateShort`) |
| Breakdown open | sheet with S_r per slot, M parts, per-battle p_i and 天时 |
| 复盘 unlocked | sheet: best lineup vs yours, slot by slot, with the record difference. The best record is often below 12-0 (D15: on most free seeds no lineup sweeps) |
| 复盘 locked (run on a daily seed, caller has no ranked daily result for that date, before D+1 00:30 BJT; C5) | the 复盘 button shows "今日军令完成后可复盘"; tapping it shows the same text as a toast; no rewarded video is offered |
| Challenge run | adds a comparison block: 你 10-2 vs 好友 11-1, both lineups revealed, and "同一手令牌" |
| Challenge run on a daily seed, lineup locked (`lineupLocked: true`, C5) | the comparison block shows both records and your lineup; the sharer's lineup is replaced by "对方阵容 · 完成今日军令后可见" |
| 识人 run, verdict (v1, §8.11) | after the record appears, a "五德揭晓" step reveals each lineup slot's stats, tier frame, S_r and fit chip, one slot at a time (about 0.3 s each; tap skips). The breakdown and 复盘 then work as usual |
| Save image (v1, §8.12) | 保存图片 → card render → album permission flow → toast "已保存到相册" or the permission-denied sheet |
| Subscribe offer (v1, §8.13) | the inline "好友应战时提醒我" card, only after a challenge was created in this result view and only if `features.subscribe` is available |
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
**v1:** a tile's colour and faction character are those of the cell the general was **drafted from** (§3.2), so a 群 赵云 shows as 群. On a 识人 daily the card adds a small "识人" tag next to the issue number, and the share title can read "识人军令，我 10胜2负，你认得几员将？".
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
| Own challenge | "这是你发出的战书" plus the list of who has answered (count only, plus the best record). **v1:** if `features.subscribe` is available and no grant exists for this challenge, a secondary button "好友应战时提醒我" (§8.13); if granted: "已开启应战提醒" (passive text) |
| Counts as today's daily, accepting (v1) | 接受挑战 starts the attempt and fetches round 1 (progressive delivery, §5.2); offline → "战书需联网展开" state |
| Already answered | goes straight to the comparison view (8.3, challenge block); on a daily seed the sharer's lineup may still be locked ("对方阵容 · 完成今日军令后可见", C5) |
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
│ │ 1 (头像) 张三   12-0 一统天下 连5 │ │ ← open data domain canvas
│ │ 2 (头像) 李四   11-1            │ │   ranks from server values (C3); "连N" = streak ≥ 2 (v1)
│ │ 3 (头像) 你     10-2            │ │
│ │ ─ 未验证 ─                       │ │ ← KV rows with no server match
│ │ - (头像) 王五   12-0 未验证      │ │   (no rank number, always last)
│ └───────────────────────────────┘ │
│ 已出征 7 人 · 战绩经服务器校验          │
│  [ 分享到本群 ] (voluntary)          │
│                                   │ ← ≥ 24 pt gap
│ ┌ banner (v1, config, default off) ┐ │ ← only in ready/empty states (§12)
└───────────────────────────────────┘
```
**v1:** each server row can carry the player's streak `k` (§11.4); the open data domain draws "连N" for k ≥ 2. Streaks come from the server only, never from the KV marker. On a 识人 day the header reads "本群 · 今日军令 第12期 · 识人".

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
            │                              ▲     ├─发起挑战→ native share sheet → (提醒我 → subscribe prompt)
            ├─自由点将──→ Draft (free) ─────┘     ├─保存图片→ (album permission) → album
            ├─群榜 → Group board (+banner?)        ├─复盘→ rewarded video → 复盘 sheet
            ├─好友榜 → Friend board (+banner?)     ├─群榜/好友榜
            ├─往期 → History list → Issue detail   └─再来一局 → (interstitial?) → Draft (free)
            └─玩法 / 设置 (privacy, 显示: 大字/高对比)
 challenge card → Challenge entry ──接受挑战──→ Draft (challenge) → Result (+comparison)
 subscribe message (WeChat service notice) → launch with c=<id> → Challenge entry (own)
```

### 8.9 Streaks and history archive (v1, PO-6, PO-7)

**Streak.** The current streak is the number of consecutive **published** daily dates, ending today or yesterday, on which the player has a ranked daily result (`daily_results`).
- A date with no published seed (`DAILY_UNAVAILABLE`) is skipped: it neither extends nor breaks a streak.
- A ranked result submitted in the midnight grace (until D+1 00:30) counts for D. A `LATE_SUBMIT` friendly does not count.
- Yesterday's streak stays "alive" all of today: if you played yesterday but not yet today, home still shows it. It resets to 0 once a published date passes (its submit window closes) without a ranked result.
- Shown on the home daily card and the daily result ("连续出征 N 天", N ≥ 2), on boards ("连N"), and in history (best streak). The server computes it (`player_stats`, §14.1); the client never computes or stores it beyond display.
- **No rewards of any kind, no streak freeze or repair, no "快断了" reminders or notifications.** [COMPLIANCE: no login rewards, direction §9]

**History list (往期).**
```
┌───────────────────────────────────┐
│ ‹ 返回                   [ ··· ◎ ] │
│ 往期军令          最长连续出征 12 天   │
│ ┌───────────────────────────────┐ │
│ │ 第12期 10月15日 识人             │ │
│ │   今日 10胜2负 · 霸业将成  进行中  │ │ ← today: no best lineup yet
│ │ 第11期 10月14日                  │ │
│ │   9胜3负 · 雄踞一方  ›            │ │
│ │ 第10期 10月13日                  │ │
│ │   未出征  ›                       │ │
│ └───────────────────────────────┘ │
└───────────────────────────────────┘
```
- The last **30** published issues, newest first; dates with no published seed are not listed.
- States: loading (skeleton rows), ready, empty ("还没有往期军令" on launch day), error/offline ("往期需联网查看" plus 重试).

**Issue detail.**
```
┌───────────────────────────────────┐
│ ‹ 往期                   [ ··· ◎ ] │
│ 第11期 · 10月14日                    │
│ 你的战绩  9胜3负 · 雄踞一方            │
│ [主公 刘备][军师 庞统][先锋 魏延] …     │
│ ─────────────────────────────────  │
│ 本期战况  共 2,315 人出征              │
│ 一统天下 0.4% ▏霸业将成 9% ▍ …         │ ← from daily_stats.hist
│ ─────────────────────────────────  │
│ 本期最佳阵容 (首轮令牌，不换令) 12胜0负  │ ← only after D+1 00:30 BJT
│ [主公 …][军师 …][先锋 …][猛将 …][守将 …] │
└───────────────────────────────────┘
```
- Your lineup: from your `daily_results` row (names; 识人 days show stats too, since the day is over).
- Distribution: shown once ≥ 30 runs exist, as for the rarity line (§7.5).
- **Best lineup** (`daily_seeds.best`, the optimum for the primary tokens with no re-spins) appears **only after the date's submit window closed (D+1 00:30 BJT)**, the same rule as C5. For today it reads "今日军令结束后公布".
- No replay of past dailies in v1 (backlog). No share button on this screen in v1.

### 8.10 Display settings: large text and high contrast (v1, PO-12)

In 设置, under 显示, two independent switches, saved on the device (`wx.setStorageSync`), applied immediately with no restart:

| Mode | Changes |
|---|---|
| **大字模式** (large text) | body ≥ 20 pt (from 16), secondary text ≥ 18 pt, record ≥ 48 pt (from 40), buttons ≥ 56 pt tall; pool rows become two lines (name row and stats row); the lineup is two rows; home's four buttons are two rows of two; the result's action buttons stack. Must hold at 320 × 568 with nothing clipped (the content scrolls instead) |
| **高对比度** (high contrast) | background plain white `#FFFFFF`, text pure ink `#000000`; no paper texture behind text; faction fills switch to a dark set with white text (starting values, frontend-ui confirms with the contrast check: 魏 `#7A5510`, 蜀 `#9E2A1E`, 吴 `#1D5552`, 群 `#4F3420`, 晋 `#3E5568`); fit chips get a 2 pt outline as well as text; every text ≥ **7:1**, every non-text indicator ≥ **3:1** |

- Default mode (both off) must still meet **4.5:1** for body text (WCAG AA), including 晋 月白 (ink text on it, §3.5).
- On first launch only, if the platform reports a large system font setting (checked in the device pass, E12), 大字模式 starts on; the player can switch it off. No prompt.
- Neither mode applies to share or saved cards: they always use the standard look, so a group sees one consistent card.
- Screen-reader labels are backlog: the game draws on one canvas with no accessibility tree.

### 8.11 识人模式: the Sunday 识人 daily (v1, PO-1)

**What it is.** Every Sunday (Beijing date) the 今日军令 is a 识人 daily: the same rules, one attempt, boards and challenges, but **the 五德 stay hidden until the verdict**. You draft by what you know of the generals. The sim, seed, gates, validation and scoring are identical to a standard daily. Only the display changes.

**Hidden during the draft** (pool, detail sheet, lineup, any breakdown): the five stats and pips, tier (character and frame: every seal uses the plain 乙 frame), `primaryRole`, `statNote`, S_r, fit chips and the M/bond preview. **Shown:** seal, name, courtesy name, `blurb` (our own ≤ 14-character line), appearance note, faction and era, and the slot names. Bond names are not previewed.

**At the verdict:** the record, band and 评语 appear as usual, then "五德揭晓" reveals each slot's stats, tier, S_r and fit chip (§8.3). From then on the run is a normal run (breakdown, 复盘, sharing).

**Rules:**
- The variant belongs to the **seed's date** (`daily_seeds.variant`): a challenge on a 识人 daily seed is also played hidden, by anyone, on any date. A free seed is never 识人.
- The first 识人 run shows a one-time coach line: "识人军令：五德暂不显示，凭你对三国人物的了解点将。出征后揭晓。"
- Home, the result, share card, boards and history label the issue "识人".
- **Honesty note (INFERENCE):** stats are in the client's content file, so hiding is a UX rule, not a security boundary. A determined player could look them up. That is acceptable: boards carry no prizes, and the same option is open to everyone.

### 8.12 Save card to album (v1) [COMPLIANCE: album permission]

- **Trigger:** only the 保存图片 button on the result screen (both modes). Never automatic and never prompted elsewhere.
- **Image:** the same card as §8.4 (daily hides names, D4; free shows names), rendered at 2× (1000 × 800) for print quality, with the line "微信小游戏 · 点将台" at the bottom. No QR code in v1.
- **Flow:**
  1. Render the card (`toTempFilePath`); on failure use the static fallback image.
  2. `wx.saveImageToPhotosAlbum({filePath})`. This is a privacy interface (相册（仅写入）): the official privacy popup may appear first (§11.6 rules), and WeChat asks for `scope.writePhotosAlbum` on first use.
  3. Success → toast "已保存到相册".
  4. Privacy refused (104) or scope refused → sheet "保存图片需要相册权限" with [去设置] (`wx.openSetting`, on tap only) and [取消]. No automatic re-ask. Next time the button is tapped with the scope `false`, the same sheet shows directly.
- **No reward** for saving. The button is never placed adjacent to an ad button.

### 8.13 Subscribe message: "好友接下了你的战书" (v1, PO-10) [COMPLIANCE: opt-in only] [SPIKE]

- **Availability:** only when `features.subscribe` is present, meaning `app_config` holds a one-time template ID (`tmplId`) and field map. The template ID comes from the founder's MP console (Founder Handoff, §19). **Without it the button never shows, nothing is requested, and nothing errors.**
- **Where offered (only these two, both after the user's own tap):** (a) the inline card on the result screen after 发起挑战 created a challenge, and (b) the own-challenge screen (§8.5). Copy: "好友应战时提醒我" [提醒我]. No other screen, never at launch, never repeated after a refusal for that challenge.
- **Flow:** tap 提醒我 → `wx.requestSubscribeMessage({tmplIds:[tmplId]})` (one-time subscription; called directly from the tap).
  - `accept` → `subscribeChallenge({challengeId})` stores one grant; UI "已开启应战提醒".
  - `reject` → UI hides the card for this challenge; nothing stored.
  - `ban` / error 20004 (user turned off subscriptions) → card hidden, and the offer is not shown again on this device (local flag) until the user's setting changes.
  - Any other failure → toast "提醒未开启", nothing stored.
- **Sending:** when someone else first answers that challenge (`submitRun` with `challengeId`), the server claims the grant and sends one message to the challenge owner (§14.2). **One grant = at most one message.** Later answers send nothing.
- **Message content** (keys mapped by `app_config.subscribe.fields` to the founder's chosen template): title "好友接下了你的战书"; the answerer's record (for example "11胜1负"; no name, since we have none); your record; the time. Tapping the notice opens the game with `c=<challengeId>`, which shows the own-challenge view.
- **No reward** for subscribing, and subscribing is never required for anything.

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
   - **Daily spoiler lock (C5).** If the challenge is on a daily seed, `submitRun.challengeCompare` and `getChallenge` return `theirLineup: null, lineupLocked: true` (records still shown) until the caller has a ranked daily result for that date or D+1 00:30 BJT has passed. A friendly answer therefore never reveals a lineup for a daily the caller can still play. Client copy: "对方阵容 · 完成今日军令后可见". 复盘 for that run is locked by the same rule (`REPLAY_LOCKED`, §5.2).
5. **Counting rule:** if the challenge seed is *today's* daily seed and the recipient has not yet played today's daily, the run **is** their daily attempt. The entry screen states this, and the result goes to the group and friend boards. Otherwise it is a friendly match and is never ranked. This prevents previewing today's daily through a friend's card. **(v1)** Such a run gets its tokens round by round (progressive delivery, §5.2), and `getChallenge` returns no `rounds` for it.
6. If `createChallenge` fails (offline or error), the button falls back to a plain result share with a toast "战书未能生成，已改为分享战报".
7. **(v1) Optional answer notice.** After step 2 the sharer may opt in to one "好友接下了你的战书" message (§8.13). It grants nothing, and the share flow never waits for it.

### 9.4 Entering from any card (cold or warm start)

| Query | Destination |
|---|---|
| `c=<id>` | challenge entry (8.5); also the target of the v1 subscribe notice (§8.13) |
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
- Optional, spike-dependent: `submitRun` could write the marker server-side with `setUserStorage` (removes the client write and its prompt). Only if the spike confirms the value format and signature handling (phase0-platform.md §3.1-3.3); it would require `code2Session` and the AppSecret in the cloud environment config. **Not in v1.**

### 11.3 Group context (`joinGroup`)
See §9.2 for the client steps. On the server, `joinGroup` receives the decrypted group-entry data via cloudID, so the `openGId` is **trusted** (the client cannot forge it). It upserts `group_members` with `_id = <openGId>_<openid>` (deterministic, so repeated entries are idempotent), `firstSeen`, `lastSeen` (Beijing dateKey) and returns `groupRef = hex(sha256(openGId + GROUP_REF_PEPPER)).slice(0,16)`, where the pepper is an environment variable in the cloud config (never committed). `getBoard` accepts `groupRef` only if the caller has a `group_members` row with that `groupRef`, so a client cannot read another group's board by guessing.

Membership is also an analytics signal (distinct groups reached, group-card entries per group), aggregated only.

### 11.4 Board data flow (`getBoard` → open data domain)
1. User taps 群榜/好友榜 → the §11.6 authorization gate.
2. Main domain calls `getBoard({kind: 'group'|'friend', dateKey, groupRef?})`.
3. The server reads today's `daily_results` (one per openid per date, §14.1) and returns:
   `{ dateKey, issueNo, variant, contentVersion, salt, selfHash, mode: 'full'|'group'|'selfOnly', viewerPlayed, rows: [[h, w, s, x?, k?], …] }`
   - **(v1)** `k` = the player's streak as of `dateKey` (from `daily_results.streak`), sent only when ≥ 2 (saves bytes). When `x` is withheld, its position holds `null` (`[h, w, s, null, k]`). `variant` labels the 识人 day.
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

**Chosen: A, capped, degrading to B.** At launch scale (organic group spread, at most a few thousand daily players at first) option A is the only one that keeps every displayed rank server-true without the server knowing the friend graph, and its cost is bounded by a cap. Config `boardListCap` (default **3,000** rows; the spike checks the `callFunction` response size and `postMessage` size limits and may lower it). The server caches the date's row list in function memory for 60 s to keep DB reads down.
- Today's ranked count ≤ cap → `mode: full` for both boards (it also covers group members who played from home and never entered via that group's card).
- Above the cap → the **group** board uses `mode: group` (results for openids in `group_members` for that `groupRef`; members never seen via a card show "未验证"), and the **friend** board uses `mode: selfOnly` (B: your row ranked and "已校验", friends' rows "好友自报" without rank numbers, §8.7). Either way a tampered KV never earns a rank number.
- Crossing the cap is logged (`board_list` event) and is a post-launch trigger to revisit (for example a per-player opt-in friend list). With `k` added, a row is about 38 bytes; the device pass (E3) re-confirms the cap.

### 11.6 Privacy and friend-scope authorization flow [COMPLIANCE]
**(v1)** The same rules cover the new privacy interface `saveImageToPhotosAlbum` (相册（仅写入）, §8.12): it is called only from the 保存图片 tap, and refusal only disables saving. `requestSubscribeMessage` is not a privacy interface, but it follows the same "only on a tap, never re-prompt" rule (§8.13).

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
| Daily histogram | cloud DB `daily_stats` | aggregate rarity line, history distribution |
| Streaks (v1) | cloud DB `player_stats`, copied to `daily_results.streak` | the player; friends/group members via `getBoard` (`k`, hashed rows) |
| Subscribe grants (v1) | cloud DB `sub_grants` | server only |
| Daily progress (v1) | cloud DB `daily_progress` | server only |
| Anomaly flags (v1) | cloud DB `anomalies` | server only (ops review) |

### 11.8 Fallbacks (only if the spike fails), in order of preference
If any C3 prerequisite fails in the device spike (friend/group rows lack `openid`; group-entry data cannot be decrypted via cloudID; the per-day salted hash cannot be computed in the open data domain within ~50 ms for 500 rows; or the payload limits cannot fit a useful cap), we fall back as follows, with the CTO's sign-off:

**Fallback 1 (preferred): signed KV values (Ed25519).** Verifying a public-key signature needs no secret and no network, so it works inside the open data domain (phase0-platform.md §3.6; confirmed by the CTO).
- On a ranked success, `submitRun` returns `sig`: an Ed25519 signature by a server-held **private** key (cloud environment variable, never committed) over `openid|dateKey|w|l|lineup`. The client writes `{w,l,x,sig}` to `d_<date>`.
- The open data domain bundles the **public** key and verifies each row against that row's `openid`. Verified rows are ranked by their (signed, hence server-issued) values; rows that fail show "未验证" with no rank number, below all ranked rows. AC 56 holds unchanged.
- If rows lack `openid` (E2 fails), the signature binds only `dateKey|w|l|lineup`: invented records are still rejected, but copying a real friend's signed value stays possible (low stakes, accepted for the no-prize boards).
- Covers every C3 failure mode, including group context: without `joinGroup`, the group board still ranks verified rows via `shareTicket`. Spike check: Ed25519 verification of 500 rows in the open data domain (pure JS) in < 100 ms on the Android phone.

**Fallback 2: Path B-lite** (only if Fallback 1 is also not workable, e.g. verification is too slow):
- The KV marker adds the lineup back (`{w,l,x}`), and boards rank by KV values, marked "好友自报"; the viewer's own row shows "已校验" when it equals their server result.
- **Detection only:** the open data domain cannot report back and the server cannot read KV, so KV-vs-`runs.serverRecord` comparison runs in the harness and QA. The risk (an inflated row on a no-prize board) is accepted and recorded in the release checklist.

---

## 12. Ads (IAA only) [COMPLIANCE]

| Placement | Format | Mode | Trigger | Caps |
|---|---|---|---|---|
| Extra re-spin | rewarded video | free only | tap "▶ 看视频再换" after the free re-spins are spent | ≤ 2 per run |
| 复盘 | rewarded video | free and daily (after the result) | tap "▶ 复盘·最佳阵容" | 1 per run; once unlocked, it stays viewable for that run |
| Between runs | interstitial | free only | on 再来一局 after the 3rd, 6th, 9th… completed free run **of the session** | not before the user's 4th lifetime completed run; ≥ 120 s apart; ≤ 5 per day; never in daily, challenge, card-entry first runs, the draft or the reveal. **(v1)** The numbers come from config (below) |
| Board footer (v1) | **banner** | group and friend boards only | board in the `ready` or `empty` state | **config, default off** (PO-14). Never on home, draft, result, history, settings, challenge entry, or the board's privacy/authorization/error explainers |

**Interstitial tuning (v1, config-driven).** The caps live in `app_config.ads.interstitial` (remote, §14.1), with `core/config.js` holding the defaults: `everyNRuns: 3`, `minLifetimeRuns: 4`, `minGapSec: 120`, `maxPerDay: 5`, `enabled: true`. The client reads them from `getDaily.features`; missing or invalid values fall back to the defaults. Values are clamped (`everyNRuns ≥ 2`, `minLifetimeRuns ≥ 2`, `minGapSec ≥ 60`, `maxPerDay ≤ 8`) so a config typo can't flood players. Changing them needs no release. The "never in" list above is not configurable.

**Banner (v1).**
- `app_config.ads.banner = {enabled: false, adUnitId: ''}` by default. A banner shows only if `enabled` is true, an `adUnitId` is set and `adMode` is not stub (the stub draws a grey "广告位（测试）" bar for QA). Expected to be switched on by the founder after 流量主 activation (§19).
- `wx.createBannerAd({adUnitId, adIntervals: 30, style: {left, top, width}})`, width = screen width − 32 pt, centred, pinned above the bottom safe area. The board canvas is shortened by the banner height plus a **≥ 24 pt gap**, so the banner never covers a row and never sits next to a button.
- `onResize` repositions it with the real height. It is destroyed when leaving the board, and hidden while any sheet, dialog or privacy/authorization flow is open.
- Errors (`onError`) are silent: no placeholder, logged as `ad_error` with `placement: banner`. A banner never delays rendering the board.

Rules:
- The reward is granted only when the rewarded video closes with `isEnded === true`. Closing early grants nothing and shows "完整观看才能获得".
- **Ad load error or no fill (founder decision D6):** grant the reward anyway, at most once per run per placement, with the toast "暂无广告，本次免费". A second failure for the same placement in the same run shows "暂无广告，请稍后再试" and grants nothing. This is acceptable because neither reward affects any leaderboard. The rule is cleared by founder D14 (ads).
- **No platform share-for-reward page.** On base library 3.7.7+, a rewarded video with no fill (1004) by default shows WeChat's fallback page that **grants the reward for sharing**, and then `onError` is not called (`onLoad` fires with `useFallbackSharePage: true`) (phase0-platform.md §7.1). That would violate §9 "no share ever grants anything". Every rewarded instance is created with **`wx.createRewardedVideoAd({adUnitId, disableFallbackSharePage: true})`**. If `onLoad` ever reports `useFallbackSharePage: true` anyway, the client treats it as no-fill (D6 rule) and does not show the ad. A launch carrying `wxad_fallback_share=1` grants nothing (§9.4).
- **Rewarded error handling.** `onError` codes 1000-1008 (1004 = no fill) all go to the D6 rule above; the code is logged in `ad_error.errCode`. After a failed load, retry is `load()` then `show()`. The rewarded instance is a global singleton, so both placements share it and track their own per-run grant state. The platform also caps rewarded views per user per day (number unpublished); hitting it surfaces as an error and follows the same rule.
- **Interstitial error handling.** WeChat enforces its own interstitial frequency limits, **but the numbers are not published** (phase0-platform.md §7.2). Our caps (≥ 120 s apart, ≤ 5/day, from the 4th lifetime run) are a lower layer on top. `show()` rejections **2001** (too soon after launch), **2002** (too soon after the last interstitial or rewarded video) and **2003** (another ad is playing) are normal: skip silently, do not count toward our caps, do not fire `interstitial_show`, log `ad_error` with the code. 2004/2005 are logged as errors. An interstitial never blocks or delays 再来一局.
- Ad buttons always show a ▶ video icon and the word 视频. Ads never auto-play, and no ad sits adjacent to a primary button (to prevent mis-taps, which matters for older users).
- **Ad stub (approved for the prototype, D5; kept in v1 for QA only):** production builds ship with `adMode` real. Until 流量主 ad units exist, rewarded and interstitial placements behave as no-fill (the D6 rule applies to rewarded) and the banner stays off. Original rule: if ad unit ids are unavailable (流量主 activation is an operational setup step for the founder, D9; it opens at cumulative UV > 500 or via the other two routes, so the prototype will most likely start on the stub), the ad module runs in `stub` mode: a 3-second "广告位（测试）" overlay with skip/complete buttons, so tap-intent and placement analytics still work. The stub can be configured to simulate rewarded errors (1004, 1000) and interstitial rejections (2001-2003) for QA (AC 64, 65). The stub is a config flag that is off in production builds.
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
  replay: { unlocked:boolean, adState, locked:boolean /* REPLAY_LOCKED, C5 */, lockedText:'今日军令完成后可复盘'|null,
            best?: { lineup:[{slot,name,score}], record:{w,l} } },
  challenge?: { theirRecord:{w,l}, theirLineup:[{slot,name}]|null,
                lineupLocked?:boolean /* C5: shows '对方阵容 · 完成今日军令后可见' */ },
  interstitialDue: boolean }

// Challenge entry
{ status: 'loading'|'ready'|'expired'|'own'|'answered'|'offline'|'error',
  theirRecord:{w,l}, mode, countsAsDaily:boolean, isFriendly:boolean, answerCount?:number,
  lineupLocked?:boolean /* answered, daily seed, C5 */ }

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

**v1 additions.** These are additive: existing fields keep their meaning. `?` = optional. Strings are pre-formatted by logic.

```ts
// Shared: display settings (local only, §8.10); every screen's renderer reads it
{ display: { largeText:boolean, highContrast:boolean,
             scale: 1 | 1.25 /* derived from largeText */,
             palette: 'standard'|'highContrast' } }

// Shared: seal portrait descriptor (§3.5); the renderer draws and caches it, no image URL in v1
type Seal = { text:string /* full name, or monogram below 48pt */, monogram:string,
              factionKey:'wei'|'shu'|'wu'|'qun'|'jin', color:string, inkText:boolean /* true for 晋 月白 */,
              frame:'jia'|'yi'|'bing'|'plain' /* 'plain' in 识人 drafts */, size:number }

// Remote features (from getDaily.features; defaults when missing, PO-11)
{ features: { subscribe: { tmplId:string } | null,
              banner: { enabled:boolean, adUnitId:string|null },
              interstitial: { enabled:boolean, everyNRuns:number, minLifetimeRuns:number,
                              minGapSec:number, maxPerDay:number } } }

// Home: added fields
{ daily: { …existing, variant:'standard'|'shiren', variantLabel:'识人'|null,
           streak: { current:number, text:string|null /* '连续出征 5 天' when ≥ 2 */ } },
  nav: { historyEnabled:true } }

// Draft: added fields
{ hidden:boolean,                          // 识人 run (§8.11): renderer must not draw stats/tier/chips/S_r
  variantLabel:'识人'|null,
  roundFetch:'idle'|'loading'|'failed',    // progressive daily delivery (§5.2); 'failed' shows '令牌传递中断' + 重试
  tokens: { faction:{key,label,color}, era:{key,label} } | null,   // faction may be 'jin'
  poolTotal:number,                        // cell size before the cap, analytics only (header shows pool.length)
  pool: [{ id, name, courtesy, seal:Seal, blurb, appearanceNote:string|null,
           tier: 'jia'|'yi'|'bing'|null,               // null when hidden
           stats: {zhi,xin,ren,yong,yan} | null,       // null when hidden
           drafted:boolean /* true rows are the dimmed '已点将' rows after the pool */ }],
  selected: { generalId, seal:Seal, blurb, statNote:string|null, appearanceNote:string|null,
              slotOptions:[{ slot, label, score:number|null, fit:'good'|'ok'|'bad'|null }] } | null,
  lineup: [{ slot, label, generalId|null, name|null, factionKey|null /* drafted cell's faction */,
             score:number|null, fit:…|null }] }

// Result: added fields
{ variantLabel:'识人'|null,
  reveal: { pending:boolean, step:0..5 } | null,  // 识人 '五德揭晓' sequence (§8.3); null for standard runs
  streak: { current:number, text:string|null } | null,   // ranked daily only
  saveImage: { state:'idle'|'rendering'|'saving'|'saved'|'denied'|'error' },   // §8.12
  subscribe: { state:'hidden'|'offer'|'requesting'|'granted'|'declined'|'unavailable',
               challengeId:string|null } }    // §8.13; 'hidden' when no tmplId or no challenge created here

// Challenge entry: added fields
{ variantLabel:'识人'|null,
  subscribe?: { state:'hidden'|'offer'|'requesting'|'granted'|'declined'|'unavailable' } }  // own challenge only

// Leaderboards: added fields (main domain)
{ variantLabel:'识人'|null,
  banner: { show:boolean, reservedHeight:number /* canvas shortened by this + 24pt gap */ } }
// postMessage to the open data domain: rows become Array<[h, w, s, x|null, k?]>, plus variant

// History list (§8.9)
{ state:'loading'|'ready'|'empty'|'error'|'offline',
  bestStreakText:string|null,                       // '最长连续出征 12 天'
  items: [{ dateKey, issueNo, dateText /* '10月14日' */, variantLabel:'识人'|null,
            mine: { record:{w,l}, bandLabel:string } | null,   // null → '未出征'
            isToday:boolean, statusText:string|null /* '进行中' for today */ }] }

// History issue detail (§8.9)
{ state:'loading'|'ready'|'error'|'offline',
  dateKey, issueNo, variantLabel:'识人'|null,
  mine: { record:{w,l}, bandLabel, lineup:[{slot,label,name,seal:Seal,stats:{…}}] } | null,
  stats: { totalText:string /* '共 2,315 人出征' */, bands:[{label, shareText}] } | null,  // null if < 30 runs
  best: { record:{w,l}, lineup:[{slot,label,name,seal:Seal}] } | null,
  bestLockedText: '今日军令结束后公布' | null }

// Settings (§8.1, §8.10)
{ muted:boolean, largeText:boolean, highContrast:boolean,
  privacy:'unknown'|'agreed'|'denied', friendScope:'unknown'|'granted'|'denied',
  album:'unknown'|'granted'|'denied' /* from getSetting scope.writePhotosAlbum */ }
```

---

## 14. Backend (WeChat Cloud Development)

Identity is always `OPENID` from the cloud function context (`cloud.getWXContext()`), never from client input. No `wx.getUserProfile` or user-info calls. All collections deny direct client reads and writes; access goes only through cloud functions. `core/` (sheet, sim, validate, config, content, date) is shared with the client by copy, with a drift test (cheatshaizi pattern).

**Runtime rules (phase0-platform.md §9):**
- Every function sets `TZ=Asia/Shanghai` in its environment variables, and all date keys go through `core/date.js` (explicit UTC+8 arithmetic, §5.2).
- Every function has an **explicit timeout** in its config (the default is about 3 s). Starting values: `genDaily` from the spike measurement (target ≥ 60 s if the console allows it; the 900 s maximum is unverified for WeChat), `getDaily` 20 s (its lazy path uses the bank, else a live loop cut at 70% of 20 s, else `DAILY_UNAVAILABLE`; no relaxed seed), `submitRun`/`getReplay` 10 s, all others 5 s.
- **Uniqueness is enforced by deterministic `_id`s**, created with `add` of that `_id` (a duplicate `add` fails), never by console unique indexes. Multi-document updates use `db.runTransaction` (single-record operations only, no `where` batches); counters use `db.command.inc`.
- Secrets in environment variables only: `GROUP_REF_PEPPER` (§11.3). The C3 design needs **no AppSecret** and no `session_key` (they would only be needed for the optional server-side marker write, §11.2).

### 14.1 Collections

| Collection | Key fields | Notes |
|---|---|---|
| `daily_seeds` | `_id: YYYYMMDD`, `seed`, `issueNo`, `variant: standard/shiren` **(v1)**, `contentVersion`, `configVersion`, `rounds[5]`, `best: {lineup, record}`, `gates: {...}`, `source: bank/live`, `attempts`, `genMs`, `boardSalt`, `createdAt` | fixed `_id` per date makes `genDaily` idempotent (§5.2). `best` is never returned before the user's result exists. `boardSalt`: 16 random bytes for §11.4 hashes |
| `daily_seed_bank` | `_id`, `seed`, `contentVersion`, `configVersion`, `gateVersion`, `best`, `gates`, `used:boolean`, `usedFor?: YYYYMMDD`, `importedAt` | offline-generated accepted seeds (§5.2); imported via the cloud console; never committed to the repo. Marked used inside the same transaction that creates `daily_seeds` |
| `runs` | `_id: <openid>_<clientRunId>`, `openid`, `clientRunId`, `mode`, `dateKey`, `seed`, `challengeId?`, `actions[]`, `serverRecord {w,l}`, `clientRecord?`, `mismatch:boolean`, `ranked:boolean`, `contentVersion`, `startedAt`, `submittedAt` | the deterministic `_id` makes resubmission idempotent |
| `daily_starts` | `_id: <dateKey>_<openid>`, `openid`, `dateKey`, `startedAt` | one per openid per date (deterministic `_id`) |
| `daily_results` | `_id: <dateKey>_<openid>`, `dateKey`, `openid`, `runId`, `w`, `l`, `submittedAt`, `lineupIdx` (5 roster indices), `lineupFac` (5 faction keys of the drafted cells, **v1**), `streak` (**v1**, the streak after this result), `contentVersion` | **the one ranked daily result per openid per date**; created with `add` of the fixed `_id` in the same transaction as the `daily_stats` increment, so a duplicate never double-counts. Source for `getBoard` (§11.4). Index on `dateKey` |
| `group_members` | `_id: <openGId>_<openid>`, `openGId`, `openid`, `groupRef`, `firstSeen`, `lastSeen` (dateKeys) | written only by `joinGroup` from **server-decrypted** group data (§11.3). Index on `groupRef`. Deleted 180 days after `lastSeen` (D7) |
| `challenges` | `_id: challengeId`, `ownerOpenid`, `runId`, `mode`, `seed`, `dateKey`, `rounds`, `record`, `lineup`, `createdAt`, `expiresAt (+7d)`, `answerCount`, `bestAnswer` | lineup is withheld from the recipient until they have answered. One per run: `createChallenge` derives the id deterministically from `runId` (base32 of a keyed hash) and uses `add`, so repeats return the same id |
| `daily_stats` | `_id: YYYYMMDD`, `hist[13]`, `total` | incremented atomically (`inc`) on each ranked submit |
| `events` | `openid`, `sessionId`, `name`, `props`, `ts`, `clientTs` | analytics (§15). `sessionId` is stored **top-level**: `track` takes it from the event's top level, falling back to `props.sessionId` (then removed from `props`). `ts` is server time; `clientTs` (the client's timestamp) is kept |
| **`player_stats`** (v1) | `_id: <openid>`, `curStreak`, `bestStreak`, `lastDailyDate` (dateKey), `totalDailies`, `flags7d` (anomaly count, rolling), `suspect: boolean`, `updatedAt` | streaks (§8.9) and anomaly roll-up (§14.5). Upserted inside the ranked-submit transaction. Deleted 180 days after `updatedAt` (D7) |
| **`daily_progress`** (v1) | `_id: <dateKey>_<openid>`, `clientRunId`, `mode: daily/challenge`, `challengeId?`, `actions[]` (frozen prefix), `released` (1-5), `updatedAt` | progressive token delivery (§5.2). Created by `startRun` (released 1), extended by `getRound`. Deleted with the 180-day `cleanup` |
| **`sub_grants`** (v1) | `_id: <challengeId>`, `ownerOpenid`, `tmplId`, `grantedAt`, `used: boolean`, `sentAt?`, `sendErrCode?` | one-time subscribe grants (§8.13). One per challenge (deterministic `_id`, created with `add`). Claimed (`used: true`) inside a transaction before sending. Deleted 180 days after `grantedAt` |
| **`anomalies`** (v1) | `_id: <openid>_<runId>_<kind>`, `openid`, `runId`, `dateKey`, `kind: mismatch/prefix/fast/invalid_ranked`, `detail` (small object, e.g. `{client:{w,l}, server:{w,l}}`), `ts` | observe-only flags (§14.5). Deterministic `_id` = one flag per run per kind. Deleted after 180 days |
| **`app_config`** (v1) | `_id: 'live'`, `subscribe: {tmplId, fields:{title,theirRecord,myRecord,time}}`, `ads: {banner:{enabled, adUnitId}, interstitial:{enabled, everyNRuns, minLifetimeRuns, minGapSec, maxPerDay}}`, `updatedAt` | remote feature config (PO-11). Edited in the cloud console only (an ops step); read by `getDaily` (60 s in-memory cache). Missing document or field → feature off / defaults. Holds no secrets (template and ad unit IDs are not secret) |

### 14.2 Cloud functions

| Function | In | Out | Notes |
|---|---|---|---|
| `getDaily` | `{}` | `{dateKey, issueNo, variant, serverNow, myStatus: none/started/done, myRecord?, myStreak: {current, best}, features}` **(v1: no `rounds`)** | creates the seed lazily if the scheduled job missed (bank first, live as last resort); returns `DAILY_UNAVAILABLE` if neither yields an accepted seed. **(v1)** Rounds come only from `startRun`/`getRound` (§5.2). `features` is built from `app_config` (§14.1, PO-11). `myStreak.current` follows §8.9 (alive through today if played yesterday) |
| `genDaily` (timer `0 0 23 * * * *`, UTC+8 trigger time) | | | writes the next day's seed: **the seed bank is the primary path** (next matching `daily_seed_bank` entry); the live §7.5.1 gate loop is a last resort (stops at 50 candidates or 70% of the configured timeout) and, if nothing passes, publishes no seed (`DAILY_UNAVAILABLE`, `[ALERT]` log, `daily_gen` with `failed: true`); warns when < 10 bank entries are left; **idempotent via the fixed `_id`** (a double-fired trigger or a racing lazy `getDaily` creates one document and consumes at most one bank entry, §5.2); explicit timeout set from the spike measurement [SPIKE] |
| `startRun` | `{mode, clientRunId, dateKey?, challengeId?}` | `{ok, resumed, rounds?}` | creates `daily_starts` (`_id: <dateKey>_<openid>`) for ranked runs. **(v1)** For a ranked daily or a challenge that counts as today's daily, also creates `daily_progress` (released 1) and returns `rounds` = every round released so far (`[round1]` on a fresh start). Timeout 5 s |
| **`getRound`** (v1) | `{clientRunId, dateKey, actions[]}` | `{round: n+1, data: round}` or `{ok:false, code}` | progressive delivery (§5.2, PO-8). Replays `actions` with the §14.3 rules (partial: exactly n picks for the requested round n+1, re-spins within allowance). They must extend `daily_progress.actions`; on success stores and freezes them and returns round n+1. Same input again → same output (idempotent). A diverging prefix → `INVALID_ACTIONS` plus a `prefix` anomaly. `released` never exceeds 5. Timeout 5 s |
| `submitRun` | `{clientRunId, mode, dateKey?, seed?, challengeId?, actions[], clientRecord?}` | `{record, battles[], band, rarity, ranked, challengeCompare?, streak?}` | §14.3. Idempotent: the same `clientRunId` returns the stored result. **(v1)** Ranked: requires `daily_progress.released == 5` and an exact prefix match; updates `player_stats` and writes `daily_results.streak`/`lineupFac` in the ranked transaction; returns `streak`. Writes `anomalies` (§14.5). For an answer to someone else's challenge: after the main work, claims and sends the subscribe grant (best-effort, ≤ 2 s, never affects the response, see `sub_grants`) |
| **`getHistory`** (v1) | `{limit?: ≤ 30}` | `{items:[{dateKey, issueNo, variant, mine?:{w,l,lineupIdx,lineupFac}, total?, hist?, best?:{lineupIdx, record}}], bestStreak}` | the last ≤ 30 published `daily_seeds` (by `_id` desc). `mine` from the caller's `daily_results`. `hist`/`total` from `daily_stats` (omitted below 30 runs). `best` **only for dates whose window has closed** (now > D+1 00:30 BJT). Never returns a seed, `rounds` for open dates, or other players' data. Timeout 5 s |
| **`subscribeChallenge`** (v1) | `{challengeId}` | `{ok, granted:true}` | stores a `sub_grants` row after the client got `accept`. Only the challenge owner may call; template ID taken from `app_config` (the client never sends it). `add` of `_id: challengeId` makes repeats idempotent. `NO_TEMPLATE` if none is configured. Timeout 5 s. The send itself uses `cloud.openapi.subscribeMessage.send` from `submitRun`, which needs the `subscribeMessage.send` openapi permission in `submitRun`'s `config.json` [SPIKE] |
| `joinGroup` | `{groupData: CloudID}` | `{ok, groupRef}` or `{ok:false, code}` | §11.3. Decrypts group-entry data server-side (cloudID); rejects non-group chats; upserts `group_members`; never returns openids. [SPIKE] |
| `getBoard` | `{kind: group/friend, dateKey, groupRef?}` | §11.4 payload `{dateKey, issueNo, variant, contentVersion, salt, selfHash, mode, viewerPlayed, rows}` (v1: rows carry streak `k`) | rows are hashed (`h`), never openids; lineups only if the caller has a ranked result for `dateKey`; `groupRef` accepted only if the caller is a member; capped at `boardListCap` (§11.5); 60 s in-memory cache per date |
| `getReplay` | `{runId}` | `{best}` (`best` may be null) | only for the caller's own completed run. **Spoiler lock (C5):** for a run on a daily seed, returns `REPLAY_LOCKED` until the caller has a ranked daily result for that date or D+1 00:30 BJT has passed |
| `createChallenge` | `{runId}` | `{challengeId}` | only for the caller's own validated run; one challenge per run (repeat calls return the same id) |
| `getChallenge` | `{challengeId}` | §13 challenge entry model plus `rounds`, `variant`, `subscribe?: {granted}` (own only) | lineup only if the caller has answered **and**, on a daily seed, the C5 lock is open; otherwise `theirLineup: null, lineupLocked: true`. `submitRun.challengeCompare` follows the same rule. **(v1)** If the run would count as the caller's daily (§9.3), `rounds` is omitted (progressive delivery, §5.2) |
| `track` | `{events[]}` (≤ 50 per batch); each event `{name, sessionId, clientTs, props}` | `{ok}` | rate-limited per openid. `sessionId` is read top-level, with `props.sessionId` as a fallback, and stored top-level; `clientTs` is kept alongside the server `ts` |
| `cleanup` (timer `0 0 4 * * * *`, its own function because each function allows only one trigger) | | | D7 retention: deletes `runs`, `daily_starts`, `daily_results`, `challenges`, `events` older than 180 days and `group_members` with `lastSeen` older than 180 days; keeps `daily_stats`. Idempotent (re-running deletes nothing new). **(v1)** Also deletes `daily_progress`, `sub_grants`, `anomalies` older than 180 days and `player_stats` with `updatedAt` older than 180 days, and runs the daily anomaly roll-up (§14.5) |

### 14.3 Server-side score validation (`submitRun`)
1. Load the seed: daily from `daily_seeds[dateKey]`, challenge from `challenges`, free from the request.
2. Rebuild the token sheet from the seed. Replay `actions[]` in order and reject on: a pick not in the round's pool, a duplicate general or slot, a re-spin beyond the allowance for the mode (ad re-spins in daily or challenge → reject), a re-spin after a pick, fewer or more than 5 picks, or an unknown `contentVersion`.
3. Simulate on the server; the **server record is authoritative**. If `clientRecord` differs, set `mismatch=true` and log it (for bug detection).
4. Ranked daily: require a `daily_starts` row for (openid, dateKey). Reject a second distinct ranked run with `ALREADY_PLAYED`, returning the existing result (the `daily_results` `_id` already exists). Accept submissions for date D until **D+1 00:30 BJT** if the start was logged on D (midnight grace).
5. On a ranked success, in one transaction: `add` `daily_results` with `_id: <dateKey>_<openid>` and `inc` `daily_stats`; if the `add` fails on the duplicate `_id`, nothing is incremented. Return the rarity. This `daily_results` row is what boards rank by (§11.4). The client then writes only its display marker `d_<date> = {w,l}` (§11.2).
6. **(v1) Pool and person rules.** A pick must be in the round's **capped** pool (§4, `poolCap`) for the token set current at that moment. A person may be picked once per run across all appearances, so a second pick of the same `generalId` from another cell is a duplicate and is rejected. Cohesion uses the faction token at each pick.
7. **(v1) Progressive prefix.** For a ranked daily (or a challenge counting as today's daily) the submitted `actions` must start with the frozen `daily_progress.actions` and `released` must be 5; otherwise `INVALID_ACTIONS` and a `prefix` anomaly.
8. **(v1) Streak** (inside the step-5 transaction). Let `prev` = the latest `daily_seeds._id` < `dateKey` (one indexed read). If `player_stats.lastDailyDate == prev`, `curStreak + 1`, else 1. Set `bestStreak = max`, `lastDailyDate = dateKey`, `totalDailies + 1`. Write `streak` onto the `daily_results` row. Days with no published seed are skipped automatically, because they have no `daily_seeds` document.

Error codes: `INVALID_ACTIONS`, `ALREADY_PLAYED`, `SEED_NOT_FOUND`, `CHALLENGE_EXPIRED`, `LATE_SUBMIT`, `RATE_LIMITED`.

### 14.4 Error codes (all functions)

Every function returns `{ok: true, …}` or `{ok: false, code, message}` and never throws to the client.

| Code | Returned by | Meaning / client handling |
|---|---|---|
| `INVALID_ACTIONS`, `ALREADY_PLAYED`, `SEED_NOT_FOUND`, `CHALLENGE_EXPIRED`, `LATE_SUBMIT`, `RATE_LIMITED` | as in §14.3 | as in §14.3, §8, §18 |
| **`REPLAY_LOCKED`** (C5) | `getReplay` | run on a daily seed; the caller has no ranked daily result for that date and D+1 00:30 BJT has not passed. Client: "今日军令完成后可复盘", no ad offered |
| **`DAILY_UNAVAILABLE`** (D15/C5) | `genDaily`, `getDaily` (lazy path) | no matching bank entry and no live candidate passed the gates; no seed published, `[ALERT]` logged. Client: daily fetch-failed state ("今日军令需联网获取" plus 重试), free play available |
| `UNAUTHENTICATED`, `FORBIDDEN` | all; `FORBIDDEN` also for a timer function called from the client | no OPENID / not allowed |
| `NOT_STARTED` | `submitRun` | ranked daily without a `daily_starts` row |
| `OWN_CHALLENGE` | `submitRun` | answering one's own challenge |
| `RUN_NOT_FOUND` | `getReplay`, `createChallenge` | unknown run or not the caller's |
| `NOT_MEMBER`, `NOT_GROUP`, `BAD_CLOUDID` | `getBoard`, `joinGroup` | §11.3, §9.2 |
| `SERVER_CONFIG`, `INTERNAL` | any | missing env config (e.g. `GROUP_REF_PEPPER`) / unexpected error |
| `NOT_STARTED` (v1, also) | `getRound` | no `daily_progress` for (dateKey, openid): call `startRun` first |
| `INVALID_ACTIONS` (v1, also) | `getRound` | actions don't extend the frozen prefix, or don't contain exactly the picks needed for the requested round. Client: "令牌传递中断" + 重试 (after re-sync via `startRun`, which returns the released rounds) |
| `NO_TEMPLATE` (v1) | `subscribeChallenge` | no template ID in `app_config`. Client hides the offer |
| `NOT_OWNER` (v1) | `subscribeChallenge` | caller is not the challenge owner |

Not error codes: the challenge lineup lock is a successful response with `theirLineup: null, lineupLocked: true` (C5). A failed subscribe-message send is recorded on `sub_grants` and never surfaces to either player.

### 14.5 Anomaly flags (v1, CTO-D2, PO-9)

Observe-only: **a flag never changes a result, a rank, a streak or any player-visible state.**

| Kind | Written by | When |
|---|---|---|
| `mismatch` | `submitRun` | `clientRecord` present and ≠ the server record (the existing `runs.mismatch` stays too) |
| `prefix` | `getRound`, `submitRun` | actions diverge from the frozen `daily_progress` prefix |
| `fast` | `submitRun` | ranked daily submitted < `config.anomaly.minDailyMs` (default 8,000 ms) after `daily_starts.startedAt` |
| `invalid_ranked` | `submitRun` | any `INVALID_ACTIONS` on a ranked submission |

- Each flag is one `anomalies` document (deterministic `_id`, so repeats don't multiply) and increments `player_stats.flags7d`. When `flags7d ≥ 5` within 7 days, set `suspect: true` for **manual review only**. There is no automatic exclusion in v1.
- **Daily roll-up** (in `cleanup`, 04:00): for yesterday, count runs and flags by kind and write a server `anomaly_daily` event. If `mismatch` is > 0.5% of submitted runs (a likely client/server drift, e.g. content or config version skew), log `[ALERT]`.
- Flags contain no data beyond the run's own records. They are covered by the 180-day retention (D7) and the privacy guide (§16).

---

## 15. Analytics events

Sent through our own `track` cloud function (batched, flushed on result, on hide, and every 20 s); it is the single source for the post-launch KPIs (formerly the go/kill metrics, PO-15). **`wx.reportEvent` is not used**: its event ids belong to the MP experiment system, not a general event store (phase0-platform.md §8). Optional extra: mirror `error` events to `wx.getGameLogManager().log({level: 'error', key, value})` (base library 3.7.4; ≤ 999 entries per session, ≤ 16 KB each) for free visibility in MP 游戏日志分析; never relied on for metrics. Each event carries a **top-level `sessionId`** (a new uuid on each cold start, or a warm start after > 30 min in the background; `track` falls back to `props.sessionId` and always stores it top-level, §14.1) and `clientTs` (client time, kept next to the server `ts`). Common props: `isNewUser` (first-ever session on this Beijing date), `contentVersion`, `appVersion`.

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
| `daily_gen` (server-side) | `dateKey`, `source: bank/live`, `attempts`, `genMs`, `bankLeft`, `failed?` (`true` when no seed was published, `DAILY_UNAVAILABLE`) | each `genDaily` run (§5.2) |
| `error` | `where`, `code` | any handled error state shown |
| **v1 events** | | |
| `run_start`, `run_complete` (props added) | `variant: standard/shiren` (daily/challenge on a daily seed), `multiAppearancePicks` (run_complete: count of picks from a non-primary appearance) | as before |
| `draft_pick` (props added) | `pickFaction` (drafted cell's faction), `poolSize`, `poolTotal` | as before |
| `round_fetch` | `runId`, `round`, `result: ok/timeout/offline/invalid`, `ms` | each `startRun`/`getRound` call for a progressive daily (§5.2) |
| `shiren_reveal` | `runId`, `skipped:boolean` | 识人 "五德揭晓" finished or skipped |
| `streak_shown` | `current`, `where: home/result` | streak line shown (≥ 2), once per session per place |
| `history_view` | `items`, `state` | 往期 list shown |
| `history_issue_view` | `dateKey`, `hasMine`, `bestShown:boolean` | issue detail shown |
| `save_image` | `mode`, `result: saved/privacyDenied/scopeDenied/renderFallback/error`, `errCode?` | after each 保存图片 tap resolves |
| `subscribe_offer` | `where: result/own_challenge` | offer card/button shown |
| `subscribe_result` | `result: accept/reject/ban/error`, `errCode?` | after `requestSubscribeMessage` resolves |
| `subscribe_send` (server-side) | `result: ok/error`, `errCode?`, `delayMs` (grant → send) | `submitRun` attempted a send |
| `display_setting` | `largeText`, `highContrast`, `source: user/auto_first_launch` | a display switch changed (and once on first launch if auto-on) |
| `ad_request` … `ad_error` (placement added) | `placement: banner` | banner lifecycle (`ad_show` on first `onLoad` + show per board visit) |
| `anomaly_daily` (server-side) | `dateKey`, `runs`, `mismatch`, `prefix`, `fast`, `invalidRanked`, `alert:boolean` | `cleanup` roll-up (§14.5) |

**KPI definitions (post-launch; formerly go/kill, PO-15).** No gate attaches to these numbers. They are watched after launch.
- **Share rate** = distinct `runId`s with ≥ 1 `share_tap` (kind result or challenge) ÷ `run_complete` count. Healthy ≥ 10%; watch < 4%.
- **Card-open-to-play** = `card_open` entries followed by a `run_start` in the same session ÷ `card_open` entries. Healthy ≥ 25%.
- **Runs per session** = `run_complete` ÷ sessions with ≥ 1 `run_start`. Healthy ≥ 3; watch < 2.
- **D1** = users whose first `session_start` is on Beijing date N and who have any `session_start` on N+1 ÷ new users on N. Healthy ≥ 35% (launch target ≥ 40%). **D7** likewise for N+7 (target ≥ 15%).
- Secondary: daily participation, 识人-day vs standard-day participation, streak distribution, challenge answer rate, subscribe accept rate, save-image rate, ad completion rate, reveal skip rate, and the distribution of wins against the §7.5 targets.

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
| Analytics events | product KPIs, bug fixing | client | `events` | 180 days |
| Streak stats (v1): current/best streak, last daily date, daily count | streak display on home, result, boards | derived from ranked results | `player_stats`, `daily_results.streak` | 180 days after last update |
| Daily progress (v1): the actions of an in-progress daily | progressive token delivery, anti-cheat | gameplay | `daily_progress` | 180 days |
| Anomaly flags (v1): run id, kind, own client/server records | detect client bugs and tampering (observe-only) | server validation | `anomalies`, `player_stats.flags7d` | 180 days |
| Subscribe grant (v1): challenge id, owner openid, template id, send status | send the one "好友接下了你的战书" message the user asked for | the user's opt-in tap (`requestSubscribeMessage`) | `sub_grants`; message delivered by WeChat | 180 days |
| Album write (v1) | save the result card on the user's tap | `saveImageToPhotosAlbum` (privacy interface: **相册（仅写入）**) | only on the user's device; we never read the album | n/a |
| Display settings (v1) | large text / high contrast | user choice | device local storage only | until changed or uninstalled |
| Device: platform, WeChat version, screen size | layout, debugging | `getWindowInfo` / `getDeviceInfo` | `events` props (platform only) | 180 days |
| Ad data | ad delivery | WeChat ad SDK (platform-handled) | not by us | per WeChat |

**Not collected:** nickname or avatar to our servers, phone, location, album contents (v1 only *writes* a card on tap), contacts, microphone, camera, clipboard (clipboard APIs are privacy interfaces; we never use clipboard-based challenge codes), ID number, payment data.

**用户隐私保护指引 declarations (Phase 0 answer: yes, declare).** The guide must declare **微信朋友关系** (used by `setUserCloudStorage`, `removeUserCloudStorage`, `getFriendCloudStorage`, `getGroupCloudStorage`) before the first board write, otherwise those calls fail with 112 (phase0-platform.md §11). Purpose text: "用于在好友榜、群榜中展示你和好友的今日战绩". **v1 "save card to album" adds 相册（仅写入）**, purpose text "用于在你点击「保存图片」时把战报图片保存到相册"; without the declaration `saveImageToPhotosAlbum` fails with 112, so it is in the Founder Handoff (§19). The guide also describes the subscribe message (opt-in, one message per tap) and the v1 data rows above. Declaring is a founder setup step (D9).

**Privacy-API flow:** §11.6. In short: the official privacy popup (or `onNeedPrivacyAuthorization` with our dialog as the fallback), fired only on the first privacy-interface call, which follows a user action (a ranked daily result or a board open), never at launch or in a free run; `scope.WxFriendInteraction` requested only from the board-open tap; refusal of either leaves the whole game playable except the boards, with a passive "去设置开启" option and no re-prompting.
Real-name and anti-addiction requirements for IAA games: cleared by founder D14; release applies them in its pre-submission rules check. Data is stored in mainland WeChat Cloud only, with no cross-border transfer.

---

## 17. Phase 0 verdicts (platform verification, done 2026-10-14)

Phase 0 (D13) checked every open item against the official docs: findings, URLs and quotes are in **`docs/dianjiangtai/phase0-platform.md`** (cited below as P0 §n). Verdicts: **OK**, **OK-with-changes** (the spec was changed accordingly), **Not available** (the design uses an alternative). The compliance/legal items were cleared by the founder (D14) and stay closed; the entity question is resolved (D9). Because nothing in the repo has exercised these APIs on a phone (P0 §0), items marked **[SPIKE]** must be proven on real devices in the **founder's device pass before submission** (§17.1; D16, PO-16). Owner of fixes: minigame-dev (backend for cloud functions). Release still runs its normal pre-submission rules check before any upload.

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
| 12 | Package limits; remote CDN domain | **OK-with-changes** (P0 §10): main ≤ 4 MB (open data folder included), total ≤ 30 MB; CDN domain must be HTTPS, whitelisted (`request` + `downloadFile`) and **ICP-filed** | §1, AC 48. **v1: no remote images at all** (seal portraits are drawn in code, CTO-D1), so the CDN domain (D9 step 5) and the `createImage` remote check are deferred to the post-launch AI-portrait update | WeChat cloud storage (`cloud://`), no own domain needed |
| 13 | Share image ratio | **OK** (P0 §4): 5:4, 500 × 400 | §8.4 | n/a |
| 14 | `wx.reportEvent` | **Not available** for our purpose (MP experiment events only, P0 §8) | §15: own `track`; `GameLogManager` optional | n/a |
| 15 | Updatable messages | **OK-with-changes** (P0 §5): fixed template text only | post-launch backlog (§21, CTO-D2) | n/a |
| 16 | ~~AIGC labelling and copyright~~ **Closed: cleared by founder D14.** The D10 requirements apply to the post-launch AI-portrait update | | | n/a (v1 has no AI content: code-drawn seals, CTO-D1) |
| 17 | Feedback button | **OK** (P0 §12): `wx.createFeedbackButton`, native overlay | §8.1 | text link to a contact page |
| 18 | WeChat PC/Mac layout | **Not checked in Phase 0** (out of P0 scope) | checked in the founder's device pass (§17.1, item 13) | portrait letterbox |
| 19 | Server-side write to user storage | **OK-with-changes, but does not close the gap** (P0 §3.1-3.4): `setUserStorage` exists; client can overwrite; no server read; `session_key` obtainable via HTTPS `code2Session` | **Superseded by C3** (§11): server-authoritative ranking; the server write is only an optional marker route (§11.2) | §11.8 fallbacks (1: Ed25519-signed values; 2: B-lite) |
| 20 | Cloud function timeout; `gateCheck` time | **OK-with-changes, partly unverified** (P0 §9): default about 3 s; 900 s max per CloudBase docs, unverified in the WeChat console; one trigger per function; trigger time UTC+8, code time UTC+0; triggers may double-fire | §5.2, §14 runtime rules, AC 53, 66. [SPIKE] configurable maximum, measured `genDaily` time, single fire at 23:00 BJT | seed bank mandatory; live loop cut at 70% of the timeout |
| 21 | Client overwrite; server read; row openid | **Answered** (P0 §2.2, §3.4): overwrite yes, server read none, rows carry `openid` (docs) | C3 relies on row openids. [SPIKE] confirm `openid` present on real friend and group rows | §11.8 fallbacks (1: Ed25519-signed values; 2: B-lite) |
| 22 | Unique indexes in the cloud DB | **Unverified** (P0 §9) | Not needed: uniqueness by deterministic `_id` (§14) | n/a |
| 23 | Server write value format (`setUserStorage` keys '1'-'50'/number vs string JSON) | **Unverified** (P0 §3.1) | Only matters for the optional server-side marker (§11.2). [SPIKE, optional] | client marker write |
| 24 | `callFunction` response size and `postMessage` payload limits | **Not documented in P0** | Bounds `boardListCap` (§11.5). [SPIKE] | lower the cap; `selfOnly` friend mode above it |
| 25 (v1) | `wx.requestSubscribeMessage` in a mini game; `subscribeMessage.send` from a cloud function; notice opens the game with the query | **Not checked in P0.** Documented for mini programs (one-time templates; user tap required; `accept`/`reject`/`ban`; developer tools don't support it) | §8.13, §14.2. [SPIKE] | feature stays hidden (`features.subscribe: null`); nothing else depends on it |
| 26 (v1) | `wx.saveImageToPhotosAlbum` + 相册（仅写入） declaration in a mini game | **Not checked in P0** | §8.12. [SPIKE] | button hidden if the API is unavailable; share still works |
| 27 (v1) | `wx.createBannerAd` in a mini game; sizing and `onResize` | **Not checked in P0** (流量主 needed for real units) | §12. [SPIKE] after 流量主 | banner stays off (default) |
| 28 (v1) | System font-size setting readable for the first-launch 大字 default | **Unknown** | §8.10. [SPIKE] | no auto default; manual switch only |

### 17.1 Founder's device pass (before submission; was the "Phase 1 device spike")

**Why:** cheatshaizi uses none of these APIs (P0 §0), and the build has only run in the fake-`wx` harness, so the docs are our only evidence. Under D16 the spike is no longer a gate before feature work. It becomes part of the **founder's device pass**, run after QA and the release pack and before submission (PO-16). **Who:** the founder (who holds the devices, accounts and MP console), with minigame-dev and backend on call; QA observes and records. **Where:** the release-candidate build as an MP 体验版 on at least one iOS and one Android phone with current WeChat (base library ≥ 3.8.8), with "不校验合法域名" **off**, plus two more WeChat accounts in a test group chat, all three mutual friends. **Prerequisites** (Founder Handoff, §19): 微信朋友关系 and 相册（仅写入） declared in the privacy guide, privacy popup enabled, cloud environment deployed with the v1 functions and the contentVersion 2 seed bank imported. The subscribe template ID and 流量主 ad units are needed for E8/E10 when available. **If a criterion fails**, the listed fallback (already specified) is applied by dev, QA re-verifies, and the item is re-run. That needs no product decision, but the CTO records it in §17.

Scope:
1. **Share → group entry → `getGroupEnterInfo` → cloud decrypt.** Share a card with `withShareTicket` into the test group; open it from a second account; read `getEnterOptionsSync` (record `scene`, `chatType`, `shareTicket`); call `getGroupEnterInfo`; send the cloudID to a `joinGroup` stub; confirm the decrypted `opengid` and `chat_type`; confirm 40097 when opened from a single chat. Repeat on a warm start (`onShow`).
2. **Open data domain with friend scope.** First board open on a fresh account: where the privacy popup and the `scope.WxFriendInteraction` prompt fire (main-domain `wx.authorize` vs the first open-data call); refuse each and confirm the `fail` path and `wx.openSetting` recovery; render a list to the shared canvas.
3. **`getGroupCloudStorage` / `getFriendCloudStorage` row fields.** Confirm each row has `openid`, `nickname`, `avatarUrl`, `KVDataList`; whether friends without the `d_` key are returned; `shareTicket` vs `groupid` route.
4. **Hash join.** In the open data domain, compute the salted SHA-256 for 500 synthetic rows (target < 50 ms on the Android phone) and match a `getBoard` stub payload; measure the largest `callFunction` response and `postMessage` payload that work (sets `boardListCap`).
5. **Rewarded video** in stub mode and, if any ad unit is available, real mode with `disableFallbackSharePage: true` on a ≥ 3.7.7 client: force or wait for a 1004 and confirm `onError` fires and no share page appears. Interstitial: provoke 2001/2002 right after launch.
6. **`genDaily` timing.** Set the timeout in the real console (record the maximum allowed), run `gateCheck` for 50 candidate seeds, record median/p99; deploy the 23:00 BJT trigger and confirm it fires once (and that a second invocation creates nothing); confirm the date key with the function running at UTC+0.
7. **Privacy declaration.** With 微信朋友关系 declared in the test account's 指引, `setUserCloudStorage` succeeds after agreement; without it, error 112 (confirms the D9 step).
8. ~~**Remote image.**~~ Not needed in v1: no remote images (CTO-D1). Moves to the post-launch AI-portrait update.
9. **(v1) Subscribe message.** With the template ID in `app_config`: create a challenge, tap 提醒我, accept; answer it from a second account; confirm exactly one service notice arrives and that it opens the game at the own-challenge view. Refuse once and confirm no re-prompt. Remove the template ID and confirm the offer disappears.
10. **(v1) Save to album.** First 保存图片 on a fresh account: privacy popup, then the album scope prompt; refuse → sheet with [去设置]; enable in settings → save succeeds; check the saved image (daily card has no names).
11. **(v1) Progressive daily.** Play a full daily on both phones on mobile data; record `round_fetch` timings (p50/p95). Toggle airplane mode before a flip and confirm "令牌传递中断" + 重试 and a clean resume.
12. **(v1) Display modes.** Large text and high contrast on the smallest phone available (target 320 × 568 equivalent) and on PC WeChat: no clipped text. Check whether a large system font setting is readable (sets §8.10's first-launch default).
13. **(v1) Banner** (only once 流量主 ad units exist): show on both boards, check spacing and that it never covers rows or buttons. Also check the PC WeChat layout (§17 #18).

**Exit criteria** (all must hold, or the named fallback is adopted, re-verified by QA and recorded in §11/§17 by the CTO before submission):
- E1. A group-card entry yields a server-decrypted `opengid` via cloudID on both iOS and Android, and a single-chat entry yields no group context. *Else:* no group board in v1 (explainer only); friend board unaffected.
- E2. Friend and group rows from the open data domain include `openid` on both platforms. *Else:* §11.8 fallbacks (1: Ed25519-signed values; 2: B-lite).
- E3. The salted-hash join of 500 rows runs in < 50 ms on the Android phone, and a `getBoard` payload of ≥ 1,000 rows passes through `callFunction` and `postMessage`. *Else:* §11.8 fallbacks (1: Ed25519-signed values; 2: B-lite), or a lower cap if ≥ 300 rows work.
- E4. The privacy and friend-scope flows behave as in §11.6: no prompt at launch, refusal leaves the game playable, `openSetting` recovers. The prompt location is written into §11.6.
- E5. No platform share page appears for a rewarded no-fill with `disableFallbackSharePage: true` (or, with no ad unit yet, the stub path passes and the real check moves to the first build with ad units, tracked in the release checklist).
- E6. `genDaily` timeout is set and recorded in §14; 50 live candidates fit within 70% of it, **or** the bank is declared mandatory; the trigger fires once at 23:00 BJT and a duplicate run is a no-op; the date key is correct at 15:59:59/16:00:00 UTC.
- E7. Results recorded in a dated device-pass note under `docs/dianjiangtai/` and the §17 rows updated (verdict and removal of [SPIKE] tags).
- E8. (v1) Subscribe: an accepted grant produces exactly one notice on the first answer, the notice opens the challenge, and with no template ID nothing is offered. *Else:* `features.subscribe` stays null (feature hidden); nothing else changes.
- E9. (v1) Album: saving works after agreement on both platforms, and refusal leads only to the [去设置] sheet. *Else:* 保存图片 hidden; sharing unaffected.
- E10. (v1) Banner (when units exist): renders only on board `ready`/`empty` states with the ≥ 24 pt gap and no overlap. *Else:* banner stays off.
- E11. (v1) Progressive daily: `round_fetch` p95 ≤ 1.5 s on mobile data (the flip animation covers ≤ 1.2 s), and the airplane-mode flip shows the retry state and resumes cleanly. *Else:* backend tunes `getRound` (warm instances, smaller payload); if p95 stays > 1.5 s, the flip holds on the "翻令中…" state until the round arrives (§8.2). That is acceptable at up to 3 s p95, and the CTO decides beyond that. Pre-fetching is not an option, because it would freeze the pick before 翻令 and remove 撤回.
- E12. (v1) Large-text and high-contrast layouts hold at the smallest available screen and on PC WeChat with no clipped text. *Else:* layout fixes before submission (no fallback; this is a must-fix).

---

## 18. Edge cases

1. **Offline at launch:** free play works fully (content bundled, monograms always available). The daily card shows the offline state. Boards show the error state.
2. **Offline mid-daily:** the current round continues (picks, re-spins and undo work offline). **(v1)** The next 翻令 needs the network (progressive delivery, §5.2): it shows "令牌传递中断" plus 重试, and the attempt resumes from the same round when back online. At 出征, the lineup and actions are stored with status `pendingSubmit`. Retries happen on `onShow`, on launch, and on the 重试 tap. The result is shown when the server answers.
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
10. **Display font subpackage fails to load:** seals and titles render in the system font (v1 has no portrait images to fail). A subpackage load error is logged once.
11. **Empty pool after drafts:** automatic reflip (§4).
12. **Rapid taps or a second finger:** single-finger routing (cheatshaizi). The primary button is debounced for 300 ms. Taps during token flips are ignored.
13. **App killed during the reveal:** the result is already computed and stored. On relaunch the verdict shows without replaying the reveal.
14. **Small screens (320 × 568) and large system font settings:** the pool list scrolls, the lineup collapses to two rows, and no text is truncated in the record or band.
15. **Server/client record mismatch:** the server value is shown; the event is logged with both values.
16. **Content version bump while a run is in progress:** the run keeps its pinned `contentVersion`, and the server keeps the last 2 versions.
17. **Seed bank empty or out of date** (content/config/gate version bump): `genDaily` falls back to live generation (§5.2), which succeeds on only about 20% of days. If nothing passes, **no seed is published**: `DAILY_UNAVAILABLE`, an `[ALERT]` log and a `daily_gen` event with `failed: true`; clients show the daily fetch-failed state and free play continues. Prevention: the bank refill ops step (before launch, monthly, and on the < 10 entries warning).
18. **Unverified board row** (a KV marker with no matching server result, e.g. a tampered client or a hash collision): the row shows "未验证" without a rank number, below all ranked rows (§11.4). A KV marker that disagrees with the server shows the server value.
19. **Privacy refused at the first ranked result:** the result shows normally; the marker write is pending and retried only after a later agreement (§11.2). The player is missing from friends' boards until then.
20. **Friend scope refused, then enabled in settings:** on return (`onShow`), the board re-checks `getSetting` and renders without restarting.
21. **Board open across midnight:** the board keeps the date it was opened for (5c); a refresh after midnight loads the new date with the new salt.
22. **Over `boardListCap`:** group board switches to `group` mode, friend board to `selfOnly` (§11.5); no tampered value gains a rank in either.
23. **Timer double-fire or lazy-path race on `genDaily`:** one `daily_seeds` document, at most one bank entry used (§5.2).
24. **Friendly or challenge run on today's daily seed before the caller's own daily** (C5): 复盘 returns `REPLAY_LOCKED` ("今日军令完成后可复盘") and the sharer's lineup is withheld (`lineupLocked`, "对方阵容 · 完成今日军令后可见") until the caller has a ranked daily result for that date or D+1 00:30 BJT has passed.
25. **(v1) Same person in two cells:** drafting 赵云 from 群-群雄 in round 1 removes him from a later 蜀-群雄 pool (listed dimmed "已点将"). If that makes a pool empty, the normal auto-reflip applies (§4).
26. **(v1) 识人 daily across midnight:** a 识人 attempt started on Sunday and submitted in the grace window stays a 识人 run (the variant belongs to the seed date). Monday's daily is standard.
27. **(v1) Streak with an unpublished day:** played Mon, no seed Tue (`DAILY_UNAVAILABLE`), played Wed → streak 2 (Tue skipped). Played Mon, skipped Tue (published), played Wed → streak 1.
28. **(v1) Reinstall or second device mid-daily:** `startRun` returns every released round and `daily_progress.actions`; the client restores the same round. Actions that differ from the frozen prefix are rejected (`INVALID_ACTIONS`), and the client re-syncs from the server copy.
29. **(v1) Subscribe grant but the template was removed from `app_config` before the answer:** the send uses the `tmplId` stored on the grant; if WeChat rejects it, `sendErrCode` is stored and nobody sees an error.
30. **(v1) Two friends answer the same challenge at the same moment:** the grant is claimed in a transaction, so exactly one message is sent.
31. **(v1) Album scope refused earlier:** 保存图片 shows the permission sheet directly with [去设置] (no system prompt, which WeChat would not show again anyway).
32. **(v1) Remote config unreadable** (`app_config` missing or `getDaily` offline): subscribe hidden, banner off, interstitial defaults from `core/config.js`.

---

## 19. Open questions and Founder Handoff

**No open founder questions.** All earlier questions are decided (§0, D1-D16). Under D16 there are no interim approvals. The founder's part comes after QA and the release pack, as the **Founder Handoff**, which release compiles into the release pack. None of these items blocks the build: every feature that depends on one degrades gracefully without it.

| # | Founder item | Needed for | If not done yet |
|---|---|---|---|
| H1 | D9 setup: game-category access, WeChat 认证 | submission | submission waits |
| H2 | Declare **微信朋友关系** and **相册（仅写入）** in the 用户隐私保护指引; enable the official privacy popup (MP 基础设置) | boards (§11.6), save to album (§8.12) | those calls fail with 112: boards show their error state, 保存图片 shows its error toast |
| H3 | **Subscribe message template**: choose a one-time template in MP 订阅消息 matching "好友接下了你的战书" (a result/status field, a record field, a time field) and put its ID and field keys into `app_config.subscribe` (cloud console) | §8.13 | feature hidden (`features.subscribe: null`); nothing else affected |
| H4 | **流量主** activation, then ad unit IDs for rewarded, interstitial and banner into config; switch `app_config.ads.banner.enabled` on when wanted | §12 | rewarded/interstitial behave as no-fill (D6), banner off |
| H5 | Import the **contentVersion 2 seed bank** (≥ 60 days) in the cloud console from backend's prepared file, then delete the local file | daily 军令 (§5.2, PO-17) | live generation only, which succeeds on about 20% of days: **effectively a launch blocker for the daily** |
| H6 | Set cloud environment variables (`GROUP_REF_PEPPER`; `TZ=Asia/Shanghai` on every function) and the `subscribeMessage.send` openapi permission for `submitRun` | §14 | `SERVER_CONFIG` errors / no notices |
| H7 | **Device pass** (§17.1, items 1-13, exit criteria E1-E12) on iOS and Android, with minigame-dev and backend on call | submission | submission waits |
| H8 | Review of the 临阵生变 template list and the v1 roster's `statNote`s in release's content review (D8, AC 59) | submission | submission waits |
| H9 | Approve the upload and release (CLAUDE.md: founder approval for any upload/release) | submission | n/a |

No CDN domain is needed for v1 (CTO-D1); D9 step 5 moves to the post-launch AI-portrait update.

---

## 20. Acceptance criteria (v1)

QA tests these against this spec. AC 1-68 were written for Phase 1 and stay in force. Where v1 changes their content, they are marked **(v1 amended)**. AC 69-95 are new for v1. "Daily" means the daily 军令. Tests may use the fake-`wx` harness and a seeded config.

**Loop and content**
1. From home, a free run is completable in 5 rounds: each round requires 翻令, then one pick placed into one empty slot. After round 5 the primary button reads 出征.
2. **(v1 amended)** Each pool lists only undrafted generals who have an **appearance** with the token's faction whose eras include the token's era, at most `poolCap` (8) of them, chosen as in §4 (AC 72).
3. A general cannot be drafted twice in a run, and a slot cannot hold two generals.
4. 撤回 is available after placing and before the next 翻令, and restores both the pool and the slot.
5. The selection sheet shows all five stats (1-10) and, for each open slot, a fit chip with text (适任/可用/错位) and `S_r` to one decimal, matching §3.4 for the content table.
6. `tier` never changes the probability of any cell or general appearing (verified by the tool: cell frequencies over 100k seeds are independent of tiers).
7. **(v1 amended)** contentVersion 1 still passes its original validation (exactly 32 generals, 8 per faction, stats as Appendix B, all 16 cells ≥ 2, 77 entries). contentVersion 2 passes AC 69. For both, no label in the content matches the forbidden-terms list (82-0, NBA, 武力, 统率, 政治, 魅力, SSR, 抽卡, plus 传说, 稀有).

**Spin and re-spin**
8. In each mode, 换势力 and 换时代 can each be used once for free per run, only after the flip and before the pick of that round. The re-rolled dimension changes and the other stays the same.
9. In free play, after the free re-spins are spent, the ad re-spin is offered at most 2 times per run. In daily and challenge runs no ad re-spin is ever offered.
10. When no valid alternative exists, the re-spin button is disabled with "此令无可换".
11. Given the same seed and the same actions, the token sheet, re-spin results, battle log and record are identical across 1,000 replays on the client and in the cloud function.

**Simulator and grading**
12. The record always sums to 12, and the band shown matches the §7.5 table for every value 0-12.
13. Monotonicity: for a fixed seed with events disabled, raising any stat of any drafted general never lowers the number of wins.
14. Events fire only under their stated conditions, at most once each per run, and every firing shows a named log row.
15. The tuning tool over 100k seeds, with the `core/config.js` values, reports (hard targets, D15): sensible 12-0 in 0.2-0.5%, sensible median 6-7, every sensible band share within its §7.5 target (10-11 in 6-10%, 0-1 ≤ 2%, others per the table), greedy 12-0 ≤ 1%, naive 12-0 < 0.2%, random 12-0 < 0.01%, and events firing in 15-30% of sensible runs. The build fails CI if any hard target is missed. The random/naive/greedy mean wins and the optimal 12-0 rate on free seeds (about 1-2%) are reported but soft (NOTE, never a failure).
16. 复盘 returns a lineup that is drawable from the player's final tokens and whose record is ≥ the player's record. It completes in < 300 ms on the reference mid-range Android for Phase 1 content (32 generals), including the worst case reported by `tools/simstats.js`; otherwise the free-play 复盘 is served by `getReplay` (§7.4). **(v1 amended)** The same holds for contentVersion 2 with the pool cap (AC 75).
17. The reveal shows 12 rows sequentially in ≤ 10 s total. A tap skips to the verdict, and the verdict is identical whether or not the reveal was skipped.
18. Outcomes do not depend on ads watched, run count, new-user status or mode, beyond the documented re-spin allowance (a test runs the same seed and actions under each condition).

**Daily seed**
19. **(v1 amended)** Two different users on the same Beijing date receive an identical `issueNo` and `variant` from `getDaily`, and identical round data for each round from `startRun`/`getRound` (whatever their own choices). No response contains a battle stream or the best lineup, and `getDaily` contains no `rounds` (AC 86).
20. The date key is derived from server time in UTC+8, independent of the cloud function's runtime timezone (see AC 66). A device set to another timezone or a wrong date still gets the server's date.
21. Every published daily seed satisfies the §7.5 daily gates as computed in §7.5.1 and recorded in `gates`: optimal (primary tokens, no re-spins) = 12-0, greedy-population 12-0 rate in [0.25%, 20%], random-population 12-0 rate < 0.5%; `gates.relaxed` is always `false`. A seed that fails any gate is never published (D15/C5).
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
32. A challenge card's query contains only `c=<id>`. Opening it shows the challenge entry with the sharer's record and **without** their lineup. The lineup appears only after the recipient's run on that challenge is submitted. On a daily seed it additionally stays hidden (`theirLineup: null, lineupLocked: true`, shown as "对方阵容 · 完成今日军令后可见") until the recipient has a ranked daily result for that date or D+1 00:30 BJT has passed; likewise `getReplay` returns `REPLAY_LOCKED` (shown as "今日军令完成后可复盘", no ad offered) for any run on a daily seed under the same rule. Free seeds are never locked (C5).
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
48. **(v1 amended)** Main package ≤ 4 MB including the open data domain folder, and total package ≤ 30 MB (CI check). Display fonts and non-essential audio load from subpackages. v1 has no portrait images (AC 76).
49. The mute setting persists across launches and silences all game audio.
50. The forbidden-terms check (item 7 list, plus 82-0/NBA/三国志/三国杀/光荣/Koei) passes on all user-visible strings, share titles and store copy.

**Analytics**
51. Every event in §15 fires exactly once per its trigger, with the listed props, a non-null top-level `sessionId` stored on the `events` document (also when the client sends it only in `props`) and `clientTs` (verified in the harness by capturing `track` payloads through a scripted session: card open → challenge run → share → 2 free runs → interstitial → board view).
52. **(v1 amended)** The post-launch KPIs (share rate, card-open-to-play, runs per session, D1, D7) can be computed from the `events` collection using the §15 definitions (QA provides one query per metric, run against the harness session data).

**Daily seed generation (C2)**
53. `genDaily` completes within its explicitly configured timeout (value set from the spike, §17 #20, recorded in §14) on both paths: the bank path, and the live path with an empty bank and a forced worst case (no candidate passes). The live loop stops at 50 candidates or 70% of the timeout, and `genMs` is recorded on the `daily_seeds` document. In the worst case **no `daily_seeds` document is written**: the call returns `DAILY_UNAVAILABLE`, logs an `[ALERT]` and writes a `daily_gen` event with `failed: true`; `getDaily` then returns `DAILY_UNAVAILABLE` and the client shows the daily fetch-failed state with free play available.
54. With a seeded `daily_seed_bank`, `genDaily` uses the next unused entry (by `_id`) whose `contentVersion`, `configVersion` and `gateVersion` match, re-verifies the stored best lineup scores 12-0, marks the entry `used`, and records `source: bank`. Non-matching entries are skipped. With **< 10** matching entries left it logs a low-bank warning (and `bankLeft` is on the `daily_gen` event); with none it tries live generation (`source: live` on success, AC 53 on failure). No bank file is present in the repo (CI check).
55. `gateCheck` for a given seed returns an identical `gates` record in `tools/simstats.js` and in the cloud function. Greedy and random rates are the share of K = 400 simulated players reaching 12-0, each player using its own `sub(seed, "gate:greedy:"/"gate:random:" + j)` stream for choices only, sharing the seed's battle and event streams (§7.5.1).

**Leaderboard trust, retention, content (C3, D7, D10, D8)**
56. **A tampered KV value never changes a displayed rank.** In the harness (fake open data domain rows plus a real `getBoard`): (a) a user with no ranked run whose KV says `w: 12` shows "未验证", no rank number, below all ranked rows; (b) a user whose server result is 8-4 but whose KV says 12-0 shows 8-4 at the rank 8-4 earns; (c) the rank numbers on both boards equal the order computed from `daily_results` alone, for any KV contents. Applies in `full`, `group` and `selfOnly` modes.
57. Run records, `daily_starts`, `daily_results`, `challenges` and `events` older than 180 days, and `group_members` whose `lastSeen` is older than 180 days, are deleted by the scheduled `cleanup`; `daily_stats` aggregates are kept. The privacy guide states 180 days.
58. **(v1 amended)** The v1 build contains no portrait image files and no AI-generated content: every general renders its code-drawn seal portrait (AC 76). No portrait image assets are committed under `apps/dianjiangtai/` (CI check). Post-launch AI portraits will be loaded from cloud storage/CDN only, under the D10 rules.
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

**v1 content and roster (CTO-D2, PO-2 to PO-5)**
69. contentVersion 2 passes validation: exactly **120** generals with unique `id`s; primary-faction counts 蜀 26, 魏 26, 吴 25, 群 25, 晋 18; every §3.5 field present; `appearances` non-empty, at most one per faction, each faction-era pair matching Appendix C, 晋 appearances only in `guijin`, `faction` equal to one appearance's faction, `eras` equal to the union of appearance eras; every one of the **21 used cells** has ≥ 4 generals and the 4 unused 晋 cells have 0 (cell sizes and the 273-entry total as in Appendix C); stats are integers 1-10 and equal Appendix C; **the 32 Appendix B generals' stats are identical to Appendix B**; `tier` matches the §3.5 thresholds from the stat total; every general has a non-empty `statNote` and `source`; `blurb` ≤ 14 characters; `portraitId` is null; the forbidden-terms check (AC 7, AC 50) passes.
70. **A person is drafted at most once per run.** In a scripted run where 赵云 is drafted from 群-群雄, a later 蜀-群雄/赤壁/三分 pool shows him only as a dimmed, unselectable "已点将" row (not counted toward the cap). A crafted `submitRun` that picks the same `generalId` twice via different cells is rejected with `INVALID_ACTIONS`.
71. **Cohesion uses the drafted cell's faction.** A lineup of 4 generals drafted from 群 cells (including a 群-appearance 赵云) gets the +0.03 群 cohesion; the same people drafted from their primary-faction cells give the cohesion their factions imply. The share card tiles and `daily_results.lineupFac` show the drafted factions.
72. **Pool cap.** No pool shows more than 8 selectable generals. For a fixed seed and actions, the pool for every round is identical on the client and in `submitRun`/`getRound`, and does not depend on choices made in other rounds except for drafted-person removal. Undo restores the previous pool exactly. A cell with ≤ 8 members shows all undrafted members, and replays of contentVersion 1 runs give the same pools as the Phase 1 build (regression test over 1,000 stored v1 runs).
73. The 16 bonds of §7.3 exist with the listed members. A bond adds +0.04 to M only when all its members are drafted (from any appearance, in any slots), never otherwise. M never exceeds 1.25. The tool reports each bond's firing rate.
74. **Re-tuning keeps D15 (hard, CI-gating).** `tools/simstats.js` over ≥ 100k seeds with contentVersion 2 and the v1 configVersion meets every AC 15 hard target: sensible 12-0 in 0.2-0.5%, greedy ≤ 1%, naive < 0.2%, random < 0.01%, sensible median 6-7, every band within §7.5, events in 15-30%, and optimal 12-0 on 100% of accepted daily seeds. The arguability checks pass (no general in > 60% of optimal lineups), and the tool reports bond rates, the multi-appearance pick share and the daily seed acceptance rate. The prepared contentVersion 2 bank holds ≥ 60 accepted seeds, each re-verified by `prepare-bank.js`. None of the 32 Appendix B generals' stats changed (diff check).
75. With contentVersion 2, client-side 复盘 meets < 300 ms p99 on the reference Android for token sets under `search.heavySets`; heavier sets go to `getReplay`, which answers within its 10 s timeout at p99 (the measured worst case is recorded in the simstats report).

**Seal portraits (CTO-D1, PO-13)**
76. Every general in every pool, lineup, detail sheet, share card, saved card and history view renders a code-drawn seal: the full name (or the monogram below 48 pt) in the faction colour of the appearance or drafted cell (primary faction in the detail sheet), with the tier frame (three visually distinct frames, the tier character also shown in text wherever tier is shown). 晋 seals use ink text on 月白. No image file is loaded for any portrait, and no network request is made for portraits (harness check). Seals render offline and fall back to the system font if the display-font subpackage fails.

**识人模式 (PO-1)**
77. `daily_seeds.variant` is `shiren` exactly on Sunday Beijing dates and `standard` on all others (unit test over 3 years of dates, at `TZ=UTC` and unset). `getDaily`, `getBoard`, `getChallenge` and `getHistory` return that variant. Changing `config.shiren.weekday` changes the day without a code change.
78. In a 识人 run, **before the verdict** no stat value, pip, tier character or tier frame (all seals use the plain frame), `primaryRole`, `statNote`, S_r, fit chip, M or bond preview is drawn anywhere (pool, detail sheet, lineup, coach marks). Renderer test: with `hidden: true` the draft view model carries `stats: null`, `tier: null`, `score: null`, `fit: null`, and screenshots contain none of them. After the record appears, "五德揭晓" reveals all of them (tap skips). For the same seed and actions, the record and battle log equal a standard run's.
79. A challenge on a 识人 daily seed is played hidden by every recipient, on any date. The share card shows the "识人" tag, and the home card, boards and history label the issue "识人". A free seed is never 识人.

**Streaks and history (PO-6, PO-7)**
80. Streak computation (server unit tests): consecutive published days → +1 each; a skipped published day → reset to 1 on the next play; a day with no `daily_seeds` document → skipped (no break); a grace-window submit counts for D; a `LATE_SUBMIT` friendly doesn't count; `bestStreak` = max ever; duplicate submits don't double-count. `getDaily.myStreak.current` shows yesterday's streak all through today until a ranked result for today exists.
81. The streak shows on home and on the daily result when ≥ 2 ("连续出征 N 天") and on board rows as "连N" from the server `k`. **No reward, re-spin, cosmetic or unlock is tied to a streak**, and no copy pressures the player to keep it (code search for streak-linked grants; copy review). No notification is ever sent about streaks.
82. 往期 lists the last ≤ 30 published issues, newest first, with the player's result or "未出征", and the 识人 label where it applies. Issue detail shows the player's lineup and the distribution (only with ≥ 30 runs). It shows the best lineup **only when now > D+1 00:30 BJT**: `getHistory` omits `best` for an open date (server test at 00:29 and 00:31), and the client shows "今日军令结束后公布". Loading, empty, error and offline states render, and none blocks play.

**Save to album (§8.12)**
83. 保存图片 appears only on the result screen. Nothing album-related is requested before that tap (harness: no `saveImageToPhotosAlbum`, `authorize` or `getSetting` call for the album scope before it). On success the toast "已保存到相册" shows and the saved image is the §8.4 card at 1000 × 800 (daily without names, free with names). If privacy or the scope is refused, the permission sheet with [去设置] shows, there is no automatic re-prompt, and play is unaffected. Saving grants nothing. 相册（仅写入） appears in the privacy-guide checklist (release check).

**Subscribe message (§8.13)**
84. With no `app_config.subscribe.tmplId`: the offer never renders, `requestSubscribeMessage` is never called and no error appears (harness). With a template ID: the offer appears only after a challenge was created in the result view or on the own-challenge screen, and `requestSubscribeMessage` is called only from the 提醒我 tap. `accept` stores exactly one `sub_grants` document per challenge (repeat taps idempotent). `reject`/`ban`/error store nothing, and the offer isn't shown again for that challenge (after `ban`/20004, not again on this device). Subscribing grants nothing.
85. When the first other user answers a challenge with an unused grant, `submitRun` sends exactly one `subscribeMessage.send` to the owner, with the template fields mapped from `app_config.subscribe.fields`, containing no openid, nickname or answerer identity, and opening the game with `c=<challengeId>`. Later answers and concurrent answers send nothing more (transaction test with two parallel answers). A send failure stores `sendErrCode` and never changes the `submitRun` response or its timing beyond the 2 s cap.

**Anti-cheat hardening (PO-8, PO-9)**
86. **Progressive tokens.** For a ranked daily: `getDaily` returns no `rounds`; `startRun` returns only round 1 (or exactly the rounds released so far on resume); `getRound` returns round n+1 only for actions containing exactly n valid picks that extend the stored prefix; no API response ever contains a round beyond `released` for an open ranked attempt (captured-payload test across `getDaily`, `startRun`, `getRound`, `getChallenge`). A `submitRun` whose actions diverge from the frozen prefix, or arrive with `released < 5`, returns `INVALID_ACTIONS` and writes a `prefix` anomaly. Challenge runs that count as today's daily follow the same rules. Free play, friendly challenges and past-seed challenges still receive full sheets.
87. With the network off before a daily 翻令, the draft shows "令牌传递中断" plus 重试 within 5 s. The current round's picks, re-spins and undo still work. After reconnecting, 重试 continues from the same round with the same tokens. Killing and relaunching mid-daily restores the same round from `startRun` (AC 25 still holds).
88. `anomalies` receives one document per (run, kind) for `mismatch`, `prefix`, `fast` and `invalid_ranked` under their §14.5 conditions. `player_stats.suspect` turns true at ≥ 5 flags in 7 days. **No flag changes any result, rank, streak, board row or UI** (same run with and without flags gives identical responses apart from server-side records). The `cleanup` roll-up writes `anomaly_daily` and logs `[ALERT]` when mismatches are > 0.5% of runs.

**Accessibility (PO-12)**
89. **大字模式:** body text ≥ 20 pt, secondary ≥ 18 pt, record ≥ 48 pt, buttons ≥ 56 pt tall, on every screen including boards' main-domain parts, history and settings. At 320 × 568 and 430 × 932 nothing is clipped or overlapping (content scrolls), and AC 44 still holds (capsule row and thumb zone). The setting persists across launches and applies without a restart.
90. **高对比度:** every text/background pair is ≥ 7:1 and every non-text indicator (chips, frames, token outlines) ≥ 3:1, checked by an automated contrast test over the palette tokens. Fit chips and factions never rely on colour alone (text present). In the default mode body text is ≥ 4.5:1 everywhere, including ink text on 晋 月白. Both modes combine, persist across launches, and don't change share or saved cards.

**Ads (CTO-D2, PO-14)**
91. **Banner:** with `app_config.ads.banner.enabled` false (the default) no banner is ever created (harness: no `createBannerAd` call). With it true and a unit ID: a banner is created only on the group and friend boards in the `ready`/`empty` states, with ≥ 24 pt between it and any tappable element, never covering board rows, destroyed on leaving the board and hidden while a sheet or dialog is open. No banner appears on any other screen or state. Errors are silent and logged as `ad_error` with `placement: banner`.
92. **Interstitial config:** changing `app_config.ads.interstitial` values (for example `everyNRuns` 3 → 4, `maxPerDay` 5 → 3) changes behaviour on next launch with no code change. Out-of-range values are clamped as in §12, and missing config uses the `core/config.js` defaults. The non-configurable "never in" rules (AC 42) hold for every config value.

**Analytics, config and release (v1)**
93. Every v1 event in §15 (`round_fetch`, `shiren_reveal`, `streak_shown`, `history_view`, `history_issue_view`, `save_image`, `subscribe_offer`, `subscribe_result`, `subscribe_send`, `display_setting`, `anomaly_daily`, banner `ad_*`, and the added props on `run_start`/`run_complete`/`draft_pick`) fires exactly once per trigger with its listed props, under the same top-level `sessionId` rule as AC 51 (scripted harness session).
94. With `app_config` missing or unreadable, the game is fully playable: subscribe hidden, banner off, interstitial on the `core/config.js` defaults, and no error shown (harness with the document deleted and with `getDaily` failing).
95. The release pack contains the Founder Handoff (§19, H1-H9) and the device-pass checklist (§17.1 items 1-13, exit criteria E1-E12) with an empty result column for the founder. The v1 cloud functions (`getRound`, `getHistory`, `subscribeChallenge`, plus the changed ones) each set `TZ=Asia/Shanghai` and an explicit timeout (AC 66 config check extended), and every new collection denies direct client reads and writes (AC 28 extended).

---

## 21. Post-launch backlog (out of v1 scope; CTO-D2)

Everything that was "Phase 2" and is now in v1 has moved into the sections above: 120 generals, 晋/归晋, multi-appearance, bonds (§3, §7.3, App. C); 识人模式 (§8.11); streaks and history (§8.9); save to album (§8.12); the subscribe message (§8.13); anti-cheat hardening (§5.2, §14.5); large-text and high-contrast modes (§8.10); banner on boards and interstitial tuning (§12). Release compliance (备案, 软著, privacy guide final text, anti-addiction and real-name, 流量主, trademark filing) is part of the v1 release pack and Founder Handoff (§19), owned by release, with its normal pre-submission rules check before any upload.

Backlog, in no order. None is promised.
- **AI-generated portraits** as a content update (D10 rules, direction §6: style guide, prompt/seed log, human review, AIGC labelling, human-edit trail, cloud storage/CDN hosting; needs an ICP-filed domain or `cloud://`). Seals stay as the fallback.
- **Banner A/B experiment** (placement or on/off vs retention), once there is live traffic.
- **Free-play 识人 toggle; replaying past dailies as friendlies** from the history archive (PO-1, PO-7).
- **Screen-reader labels** if the platform ever offers an accessibility tree for canvas games.
- **Automatic anomaly sanctions** (for example excluding `suspect` rows from ranks), only if observe-only data shows a real problem (PO-9).
- **Option: 擂台赛 (challenge-holder) mode** on WeChat's 擂台赛 component (P0 §6). It exists (base library 3.14.2, WeChat 8.0.68+), but: it requires configuring **4 reward gift packs** in MP (擂主 保底/稀有, 挑战者 保底/稀有), which conflicts with our no-prizes IAA design; it takes a **single client-reported numeric score** with no server verification (so it would bypass C3); and the card and flow are platform-owned. Out of v1 because it conflicts with no-prizes and with server scores (CTO-D2). Only worth revisiting if live data shows challenges are the main spread driver and the founder accepts gift packs; eligibility must be checked in the MP console. Our own `createChallenge` stays the mechanism.
- **Option: updatable challenge cards** via `updatableMessage` (P0 §5). The text is a **fixed platform template only** ("成员正在加入，当前 {member_count}/{room_limit} 人" / "已开始"), so a custom card like "已有 3 位好友应战，最高 11-1" is **not possible**. At best the card shows "当前 3/N 人" as an answer count; the activity id expires after 24 h. Low value (template-only, CTO-D2); consider only if live data shows challenge answer rate matters.
- **视频号 clip of the reveal** [VERIFY-P0]: the API is unverified (CTO-D2).
- **Expansion themes:** 水浒, 西游, and a cross-era 关公战秦琼 mode; 盲排 (blind ranking of five generals) as a side mode. These are outside "三国 only" (D13) and would need the founder.

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

**v1 note:** this is contentVersion 1, kept for reference and for the stats diff check (AC 69, 74). These 32 generals' **stats are frozen** and reappear unchanged in Appendix C. Their **appearances** are corrected in v1 (PO-3; see the Appendix C notes for 赵云, 马超, 黄忠, 姜维, 张郃, 夏侯惇, 张辽, 司马懿, 孙权, 陆逊, 吕布). The live roster for v1 is Appendix C.

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

**Event and bond coverage:** 信 ≤ 3 (临阵生变): 吕布, 董卓, 韩遂. 智 ≥ 9 (奇谋 as 军师): 诸葛亮, 曹操, 荀彧, 郭嘉, 司马懿, 周瑜, 陆逊. 勇 = 10 (万夫莫敌 as 猛将): 关羽, 张飞, 马超, 许褚, 吕布. Bonds: 桃园 (刘备, 关羽, 张飞), 江东 (孙策, 周瑜). Tiers: 10 甲, 15 乙, 7 丙. The 晋 faction and 归晋 era arrive in v1 (Appendix C).

---

## Appendix C: v1 roster (120), contentVersion 2

**Authoritative for v1** (CTO-D2, PO-2 to PO-4). 120 historically grounded generals. Sources: 《三国志》 and 裴松之注, 《晋书》 for the 晋 camp, with 《三国演义》 colour where noted (all public domain). Stats (五德, integers 1-10, §3.1) are our own judgement (INFERENCE). The **32 Phase 1 generals (marked ◆) keep their exact Appendix B stats**. The 88 new stat lines are first drafts that `tools/simstats.js` may require adjusting (only under the §7.5 lever order, with the `statNote` updated). Tier from the total (甲 ≥ 38, 乙 30-37, 丙 ≤ 29). Role = `primaryRole` (display only). Each row's note becomes the general's `statNote` (expanded into full sentences in the content file); it is shown in the detail sheet and reviewed in content review.

**Appearances notation:** `faction: eras`, separated by `;` when there are several factions. The **first faction listed is not necessarily primary**: the primary faction is the section the general sits in. Era codes: HJ 黄巾 (184-189), QX 群雄 (190-207), CB 赤壁 (208-214), SF 三分 (215-234), GJ 归晋 (235-280). Appearance rule (§3.2, PO-3): about a year or more of notable service in that camp; lords with their own following keep their own camp; 晋 = the 司马氏 court from 249 on plus later 晋 servants.

### 蜀 (primary 26)

| # | General (字) | Appearances | 智 | 信 | 仁 | 勇 | 严 | Total · tier | Role | statNote (short) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | ◆ 刘备 (玄德) | 蜀: HJ QX CB SF | 7 | 8 | 10 | 6 | 7 | 38 甲 | 主公 | 仁10：携民渡江；起兵讨黄巾，d. 223. 桃园 |
| 2 | ◆ 关羽 (云长) | 蜀: HJ QX CB SF | 6 | 10 | 6 | 10 | 7 | 39 甲 | 猛将 | 斩颜良；200 年暂归曹操不足一年，不计入魏（PO-3）. 桃园、父子同袍 |
| 3 | ◆ 张飞 (益德) | 蜀: HJ QX CB SF | 4 | 9 | 4 | 10 | 6 | 33 乙 | 猛将 | 长坂；仁4：鞭挞健儿；d. 221. 桃园 |
| 4 | ◆ 诸葛亮 (孔明) | 蜀: CB SF | 10 | 9 | 8 | 3 | 9 | 39 甲 | 军师 | 207/208 出山，北伐至 234. 龙凤 |
| 5 | ◆ 赵云 (子龙) | 群: QX; 蜀: QX CB SF | 6 | 10 | 8 | 9 | 8 | 41 甲 | 猛将 | v1：增「从公孙瓒」群-QX 出场（原为简化）；c. 200 归刘备 |
| 6 | ◆ 马超 (孟起) | 群: QX CB; 蜀: CB SF | 5 | 4 | 5 | 10 | 6 | 30 乙 | 先锋 | v1：QX/CB 关中时期改归群（潼关 211）；214 归刘备. 西凉 |
| 7 | ◆ 黄忠 (汉升) | 群: QX; 蜀: CB SF | 5 | 8 | 6 | 9 | 7 | 35 乙 | 先锋 | v1：增「从刘表」群-QX；c. 209 归刘备；定军山 219 |
| 8 | ◆ 姜维 (伯约) | 魏: SF; 蜀: SF GJ | 8 | 8 | 6 | 8 | 7 | 37 乙 | 军师 | v1：增天水仕魏（至 228）与归晋时期北伐（至 263）. 承业 |
| 9 | 简雍 (宪和) | 蜀: HJ QX CB | 6 | 8 | 6 | 2 | 3 | 25 丙 | 军师 | 少与先主有旧；严3：性简傲跌宕；214 说刘璋 |
| 10 | 庞统 (士元) | 蜀: CB | 9 | 7 | 6 | 3 | 6 | 31 乙 | 军师 | 凤雏；献取蜀三计；d. 214 雒城. 龙凤 |
| 11 | 法正 (孝直) | 群: CB; 蜀: CB SF | 9 | 6 | 3 | 3 | 7 | 28 丙 | 军师 | 先仕刘璋；定军山之谋；仁3：睚眦之怨无不报复；d. 220 |
| 12 | 魏延 (文长) | 蜀: CB SF | 6 | 5 | 4 | 9 | 8 | 32 乙 | 先锋 | 镇汉中 219；信5：与杨仪不睦，d. 234 |
| 13 | 马岱 | 群: CB; 蜀: SF | 5 | 8 | 5 | 7 | 6 | 31 乙 | 先锋 | 随马超入蜀；234 斩魏延. 西凉 |
| 14 | 关平 | 蜀: CB SF | 4 | 9 | 5 | 7 | 6 | 31 乙 | 先锋 | 随父镇荆州；219 同殁临沮. 父子同袍 |
| 15 | 王平 (子均) | 魏: SF; 蜀: SF GJ | 6 | 8 | 5 | 6 | 10 | 35 乙 | 守将 | 219 自曹营归刘备；严10：遵履法度；兴势 244 |
| 16 | 马谡 (幼常) | 蜀: CB SF | 8 | 6 | 5 | 3 | 3 | 25 丙 | 军师 | 攻心之策；严3：街亭违亮节度 228 |
| 17 | 马良 (季常) | 蜀: CB SF | 7 | 8 | 7 | 2 | 5 | 29 丙 | 军师 | 「马氏五常，白眉最良」；d. 222 夷陵 |
| 18 | 蒋琬 (公琰) | 蜀: SF GJ | 8 | 9 | 8 | 2 | 7 | 34 乙 | 主公 | 继亮秉政，安定蜀中；d. 246. 承业 |
| 19 | 费祎 (文伟) | 蜀: SF GJ | 8 | 8 | 8 | 3 | 5 | 32 乙 | 军师 | 兴势退魏 244；严5：宽济而疏于防范，d. 253. 承业 |
| 20 | 张嶷 (伯岐) | 蜀: GJ | 6 | 9 | 7 | 7 | 8 | 37 乙 | 守将 | 安定越嶲，恩信并著；d. 254 |
| 21 | 廖化 (元俭) | 蜀: SF GJ | 5 | 9 | 5 | 6 | 6 | 31 乙 | 先锋 | 222 诈死归蜀（陷吴不足一年，不计入吴）；以果烈称 |
| 22 | 黄权 (公衡) | 群: CB; 蜀: CB SF; 魏: SF | 8 | 8 | 6 | 4 | 7 | 33 乙 | 军师 | 先仕刘璋；222 夷陵后降魏：「臣降吴不可，还蜀无路」 |
| 23 | 刘禅 (公嗣) | 蜀: SF GJ | 4 | 6 | 7 | 1 | 2 | 20 丙 | 主公 | 在位四十一年；政事委于诸葛亮、蒋琬；263 降 |
| 24 | 罗宪 (令则) | 蜀: GJ; 晋: GJ | 7 | 9 | 6 | 6 | 9 | 37 乙 | 守将 | 264 守永安拒吴，后仕晋 |
| 25 | 徐庶 (元直) | 蜀: QX; 魏: CB SF | 9 | 8 | 7 | 4 | 6 | 34 乙 | 军师 | 荐诸葛亮；208 母被执，辞先主归曹 |
| 26 | 糜芳 (子方) | 蜀: QX CB SF; 吴: SF | 3 | 2 | 4 | 4 | 3 | 16 丙 | 守将 | 194 随刘备；守江陵；219 降吴（信2） |

### 魏 (primary 26)

| # | General (字) | Appearances | 智 | 信 | 仁 | 勇 | 严 | Total · tier | Role | statNote (short) |
|---|---|---|---|---|---|---|---|---|---|---|
| 27 | ◆ 曹操 (孟德) | 魏: HJ QX CB SF | 9 | 6 | 6 | 7 | 10 | 38 甲 | 主公 | 颍川讨黄巾 184；189 己吾起兵；严10：割发代首；d. 220 |
| 28 | ◆ 张郃 (儁乂) | 群: HJ QX; 魏: QX CB SF | 7 | 6 | 5 | 8 | 8 | 34 乙 | 先锋 | v1：HJ 改为群（从韩馥讨黄巾），QX 从袁绍至 200，后归曹 |
| 29 | ◆ 夏侯惇 (元让) | 魏: HJ QX CB SF | 5 | 9 | 7 | 8 | 7 | 36 乙 | 守将 | v1：增 HJ（「太祖初起，惇常为裨将」189）；d. 220 |
| 30 | ◆ 张辽 (文远) | 群: HJ QX; 魏: QX CB SF | 7 | 8 | 6 | 9 | 9 | 39 甲 | 守将 | v1：增群 HJ/QX（丁原、何进、董卓、吕布，至 198）；合肥 215 |
| 31 | ◆ 许褚 (仲康) | 魏: QX CB SF | 3 | 10 | 5 | 10 | 6 | 34 乙 | 猛将 | c. 197 归曹；宿卫. 宿卫 |
| 32 | ◆ 荀彧 (文若) | 魏: QX CB | 9 | 9 | 9 | 2 | 7 | 36 乙 | 军师 | 191 归曹；d. 212 |
| 33 | ◆ 郭嘉 (奉孝) | 魏: QX | 10 | 7 | 5 | 2 | 3 | 27 丙 | 军师 | 严3：不治行检（陈群）；d. 207 |
| 34 | ◆ 司马懿 (仲达) | 魏: SF GJ; 晋: GJ | 10 | 5 | 5 | 4 | 9 | 33 乙 | 军师 | v1：增魏 GJ（辽东 238）与晋 GJ（高平陵 249）. 河内 |
| 35 | 夏侯渊 (妙才) | 魏: HJ QX CB SF | 5 | 8 | 5 | 8 | 6 | 32 乙 | 先锋 | 189 随曹操起兵；虎步关右；d. 219 定军山 |
| 36 | 曹仁 (子孝) | 魏: HJ QX CB SF | 6 | 9 | 6 | 8 | 9 | 38 甲 | 守将 | 189 聚众从曹操；守江陵 208、樊城 219 |
| 37 | 乐进 (文谦) | 魏: QX CB SF | 5 | 8 | 5 | 9 | 7 | 34 乙 | 先锋 | 每战先登；d. 218 |
| 38 | 于禁 (文则) | 魏: QX CB SF | 6 | 4 | 3 | 6 | 10 | 29 丙 | 守将 | 严10：以法御下；信4：219 樊城降关羽（被俘不计入他营） |
| 39 | 徐晃 (公明) | 群: QX; 魏: QX CB SF | 6 | 8 | 6 | 8 | 9 | 37 乙 | 先锋 | 先随杨奉，196 归曹；219 樊城解围 |
| 40 | 典韦 | 魏: QX | 2 | 10 | 4 | 10 | 5 | 31 乙 | 猛将 | 197 宛城护主战死. 宿卫 |
| 41 | 曹丕 (子桓) | 魏: CB SF | 7 | 5 | 4 | 4 | 7 | 27 丙 | 主公 | 211 副丞相；220 代汉；d. 226 |
| 42 | 曹真 (子丹) | 魏: SF | 6 | 8 | 7 | 7 | 8 | 36 乙 | 守将 | 228 拒诸葛亮；与士卒同劳苦；d. 231 |
| 43 | 贾诩 (文和) | 群: QX; 魏: QX CB SF | 10 | 5 | 4 | 2 | 6 | 27 丙 | 军师 | 先仕董卓、李傕、张绣，199 归曹；d. 223 |
| 44 | 程昱 (仲德) | 魏: QX CB | 8 | 8 | 3 | 5 | 8 | 32 乙 | 军师 | 194 守鄄城；仁3：性刚戾；d. 220 |
| 45 | 荀攸 (公达) | 魏: QX CB | 9 | 9 | 7 | 2 | 7 | 34 乙 | 军师 | 前后凡画奇策十二；d. 214 |
| 46 | 满宠 (伯宁) | 魏: QX CB SF GJ | 8 | 9 | 6 | 5 | 10 | 38 甲 | 守将 | 严10：执法不阿；233 筑合肥新城；d. 242 |
| 47 | 郭淮 (伯济) | 魏: SF GJ | 7 | 8 | 6 | 6 | 8 | 35 乙 | 守将 | 219 收定军山散卒；镇关中三十余年 |
| 48 | 邓艾 (士载) | 魏: GJ | 9 | 7 | 5 | 8 | 8 | 37 乙 | 先锋 | 263 阴平入蜀；d. 264（未仕晋，PO-3）. 二士 |
| 49 | 钟会 (士季) | 魏: GJ | 9 | 2 | 3 | 4 | 6 | 24 丙 | 军师 | 263 伐蜀；信2：264 成都举兵. 二士 |
| 50 | 庞德 (令明) | 群: QX CB; 魏: SF | 4 | 10 | 5 | 9 | 7 | 35 乙 | 猛将 | 随马超、张鲁，215 归曹；信10：219 樊城不降. 西凉 |
| 51 | 陈泰 (玄伯) | 魏: GJ | 8 | 9 | 7 | 5 | 8 | 37 乙 | 守将 | 255 解狄道之围；d. 260 |
| 52 | 夏侯霸 (仲权) | 魏: SF GJ; 蜀: GJ | 5 | 5 | 5 | 7 | 6 | 28 丙 | 先锋 | 249 奔蜀 |

### 吴 (primary 25)

| # | General (字) | Appearances | 智 | 信 | 仁 | 勇 | 严 | Total · tier | Role | statNote (short) |
|---|---|---|---|---|---|---|---|---|---|---|
| 53 | ◆ 孙坚 (文台) | 吴: HJ QX | 6 | 8 | 6 | 9 | 7 | 36 乙 | 先锋 | 184 从朱儁讨黄巾；从袁术时自领其众，不计入群（PO-3）；d. 191 |
| 54 | ◆ 程普 (德谋) | 吴: HJ QX CB | 6 | 8 | 7 | 7 | 8 | 36 乙 | 守将 | 从孙坚讨黄巾；赤壁左督 |
| 55 | ◆ 黄盖 (公覆) | 吴: HJ QX CB | 6 | 9 | 6 | 8 | 8 | 37 乙 | 先锋 | 从孙坚起兵；赤壁火攻 |
| 56 | ◆ 孙策 (伯符) | 吴: QX | 7 | 7 | 7 | 9 | 8 | 38 甲 | 先锋 | 194-200 平江东；依袁术时自领其众，不计入群. 江东、神亭 |
| 57 | ◆ 周瑜 (公瑾) | 吴: QX CB | 10 | 9 | 7 | 6 | 9 | 41 甲 | 军师 | 赤壁 208；d. 210. 江东 |
| 58 | ◆ 孙权 (仲谋) | 吴: QX CB SF GJ | 8 | 7 | 7 | 5 | 7 | 34 乙 | 主公 | 200 继位；v1：增 GJ（d. 252） |
| 59 | ◆ 吕蒙 (子明) | 吴: QX CB SF | 8 | 7 | 5 | 7 | 9 | 36 乙 | 先锋 | 讨黄祖；219 白衣渡江 |
| 60 | ◆ 陆逊 (伯言) | 吴: SF GJ | 9 | 9 | 7 | 5 | 8 | 38 甲 | 军师 | 夷陵 222，石亭 228；v1：增 GJ（d. 245）. 父子同袍 |
| 61 | 韩当 (义公) | 吴: HJ QX CB SF | 5 | 9 | 5 | 8 | 6 | 33 乙 | 先锋 | 从孙坚征伐；历事三主；d. 227 |
| 62 | 朱治 (君理) | 吴: HJ QX CB SF | 6 | 9 | 7 | 5 | 7 | 34 乙 | 守将 | 从孙坚征伐（187 长沙）；镇吴郡；d. 224 |
| 63 | 太史慈 (子义) | 群: QX; 吴: QX | 6 | 10 | 6 | 9 | 7 | 38 甲 | 猛将 | 先从刘繇；信10：「约日中而反」如期而至；d. 206. 神亭 |
| 64 | 甘宁 (兴霸) | 群: QX; 吴: QX CB SF | 6 | 6 | 4 | 10 | 5 | 31 乙 | 猛将 | 先依刘表、黄祖；213 百骑劫营；仁4：粗猛好杀. 释怨 |
| 65 | 周泰 (幼平) | 吴: QX CB SF | 4 | 10 | 5 | 9 | 7 | 35 乙 | 守将 | 信10：身被十二创护孙权 |
| 66 | 凌统 (公绩) | 吴: QX CB SF | 6 | 9 | 7 | 8 | 7 | 37 乙 | 先锋 | 215 逍遥津力战护主；d. c. 217. 释怨 |
| 67 | 鲁肃 (子敬) | 吴: QX CB SF | 9 | 9 | 8 | 4 | 7 | 37 乙 | 军师 | 联刘抗曹；215 单刀会；d. 217 |
| 68 | 张昭 (子布) | 吴: QX CB SF GJ | 8 | 9 | 6 | 2 | 9 | 34 乙 | 主公 | 孙策托孤；严9：直言廷争；d. 236 |
| 69 | 诸葛瑾 (子瑜) | 吴: QX CB SF GJ | 7 | 9 | 8 | 3 | 6 | 33 乙 | 军师 | c. 200 归孙权；兄弟分仕而无私；d. 241 |
| 70 | 徐盛 (文向) | 吴: CB SF | 7 | 8 | 5 | 8 | 7 | 35 乙 | 守将 | 224 疑城退曹丕 |
| 71 | 朱然 (义封) | 吴: SF GJ | 7 | 9 | 6 | 7 | 9 | 38 甲 | 守将 | 223 守江陵；d. 249 |
| 72 | 朱桓 (休穆) | 吴: SF GJ | 7 | 7 | 6 | 8 | 8 | 36 乙 | 守将 | 222 濡须破曹仁；d. 238 |
| 73 | 诸葛恪 (元逊) | 吴: GJ | 9 | 6 | 4 | 5 | 5 | 29 丙 | 军师 | 252 东兴大捷；253 新城失利 |
| 74 | 丁奉 (承渊) | 吴: GJ | 6 | 8 | 5 | 9 | 7 | 35 乙 | 先锋 | 252 东兴雪中奋短兵；d. 271 |
| 75 | 陆抗 (幼节) | 吴: GJ | 9 | 9 | 8 | 6 | 9 | 41 甲 | 守将 | 272 西陵；与羊祜对垒；d. 274. 父子同袍 |
| 76 | 孙皓 (元宗) | 吴: GJ | 5 | 3 | 1 | 4 | 3 | 16 丙 | 主公 | 仁1：用刑酷烈（本传）；280 降晋 |
| 77 | 吾彦 (士则) | 吴: GJ; 晋: GJ | 6 | 9 | 6 | 8 | 8 | 37 乙 | 守将 | 280 建平坚守，后仕晋 |

### 群 (primary 25)

| # | General (字) | Appearances | 智 | 信 | 仁 | 勇 | 严 | Total · tier | Role | statNote (short) |
|---|---|---|---|---|---|---|---|---|---|---|
| 78 | ◆ 张角 | 群: HJ | 7 | 5 | 6 | 3 | 5 | 26 丙 | 主公 | 黄巾首领；d. 184 |
| 79 | ◆ 皇甫嵩 (义真) | 群: HJ QX | 7 | 9 | 8 | 7 | 9 | 40 甲 | 守将 | 汉将讨黄巾；d. 195. 平乱 |
| 80 | ◆ 董卓 (仲颖) | 群: HJ QX | 6 | 2 | 1 | 8 | 5 | 22 丙 | 猛将 | 184 讨黄巾、凉州；d. 192 |
| 81 | ◆ 袁绍 (本初) | 群: HJ QX | 6 | 5 | 6 | 5 | 5 | 27 丙 | 主公 | 189 诛宦官；200 官渡；d. 202. 河北 |
| 82 | ◆ 韩遂 (文约) | 群: HJ QX CB | 7 | 3 | 4 | 6 | 6 | 26 丙 | 主公 | 184 凉州起事；211 潼关 |
| 83 | ◆ 吕布 (奉先) | 群: HJ QX | 3 | 2 | 4 | 10 | 4 | 23 丙 | 猛将 | v1：增 HJ（189 为丁原主簿）；先后从丁原、董卓，皆在群营；d. 198. 下邳 |
| 84 | ◆ 张鲁 (公祺) | 群: QX CB SF | 6 | 7 | 9 | 3 | 6 | 31 乙 | 主公 | 汉中 191-215；215 降曹 |
| 85 | ◆ 孟获 | 群: SF | 4 | 6 | 6 | 8 | 5 | 29 丙 | 猛将 | 225 南中；见《汉晋春秋》（裴注）与《华阳国志》 |
| 86 | 卢植 (子干) | 群: HJ QX | 8 | 9 | 8 | 5 | 8 | 38 甲 | 守将 | 184 讨张角；刘备之师；d. 192. 平乱 |
| 87 | 朱儁 (公伟) | 群: HJ QX | 7 | 8 | 6 | 7 | 8 | 36 乙 | 先锋 | 184 破宛城黄巾；d. 195. 平乱 |
| 88 | 公孙瓒 (伯珪) | 群: HJ QX | 5 | 5 | 3 | 9 | 7 | 29 丙 | 先锋 | 187 讨张纯；白马义从；d. 199 |
| 89 | 袁术 (公路) | 群: QX | 4 | 3 | 2 | 4 | 3 | 16 丙 | 主公 | 信3：197 僭号；d. 199 |
| 90 | 刘表 (景升) | 群: QX CB | 7 | 7 | 7 | 3 | 5 | 29 丙 | 主公 | 保荆州十余年，开立学官；d. 208 |
| 91 | 刘璋 (季玉) | 群: QX CB | 4 | 7 | 7 | 2 | 3 | 23 丙 | 主公 | 194-214 牧益州；214 开城 |
| 92 | 张任 | 群: CB | 6 | 10 | 5 | 8 | 7 | 36 乙 | 守将 | 213 雒城；信10：「老臣终不复事二主」 |
| 93 | 颜良 | 群: QX | 3 | 7 | 4 | 9 | 5 | 28 丙 | 猛将 | 200 白马. 河北 |
| 94 | 沮授 | 群: QX | 9 | 10 | 6 | 3 | 7 | 35 乙 | 军师 | 200 官渡被执不降. 河北 |
| 95 | 陈宫 (公台) | 魏: QX; 群: QX | 8 | 6 | 5 | 4 | 6 | 29 丙 | 军师 | 190-194 从曹操、迎入兖州；194 迎吕布；d. 198. 下邳 |
| 96 | 高顺 | 群: QX | 5 | 10 | 6 | 8 | 10 | 39 甲 | 守将 | 陷阵营；「清白有威严」；d. 198. 下邳 |
| 97 | 公孙康 | 群: QX CB SF | 6 | 5 | 4 | 5 | 6 | 26 丙 | 主公 | 204 嗣位辽东；207 斩袁尚；d. c. 221 |
| 98 | 孟达 (子度) | 群: CB; 蜀: CB SF; 魏: SF | 6 | 2 | 4 | 6 | 5 | 23 丙 | 守将 | 先仕刘璋；220 降魏；228 欲复归蜀（信2） |
| 99 | 公孙渊 (文懿) | 群: SF GJ | 5 | 2 | 3 | 5 | 5 | 20 丙 | 主公 | 228 夺位辽东；反复于魏吴（信2）；238 败亡 |
| 100 | 诸葛诞 (公休) | 魏: GJ; 群: GJ | 6 | 5 | 7 | 5 | 6 | 29 丙 | 主公 | 257 寿春举兵；仁7：麾下数百人拱手不降 |
| 101 | 文钦 (仲若) | 魏: GJ; 群: GJ; 吴: GJ | 4 | 3 | 3 | 8 | 5 | 23 丙 | 先锋 | 255 淮南举兵，奔吴（信3）；d. 258 |
| 102 | 文鸯 (次骞) | 群: GJ; 吴: GJ; 晋: GJ | 5 | 6 | 5 | 10 | 6 | 32 乙 | 猛将 | 255 乐嘉单骑退敌；258 后仕晋 |

### 晋 (primary 18; the 晋 camp exists only in GJ)

| # | General (字) | Appearances | 智 | 信 | 仁 | 勇 | 严 | Total · tier | Role | statNote (short) |
|---|---|---|---|---|---|---|---|---|---|---|
| 103 | 司马师 (子元) | 晋: GJ | 8 | 5 | 4 | 5 | 9 | 31 乙 | 主公 | 255 平淮南；d. 255. 河内 |
| 104 | 司马昭 (子上) | 晋: GJ | 8 | 4 | 4 | 4 | 8 | 28 丙 | 主公 | 258 平诸葛诞；263 定伐蜀之策；d. 265. 河内 |
| 105 | 司马炎 (安世) | 晋: GJ | 6 | 6 | 7 | 3 | 5 | 27 丙 | 主公 | 266 受禅；280 一统 |
| 106 | 司马孚 (叔达) | 晋: GJ | 7 | 10 | 8 | 3 | 7 | 35 乙 | 守将 | 253 拒诸葛恪；信10：自称「大魏之纯臣」 |
| 107 | 司马伷 (子将) | 晋: GJ | 6 | 7 | 6 | 6 | 7 | 32 乙 | 守将 | 280 伐吴出涂中 |
| 108 | 羊祜 (叔子) | 晋: GJ | 9 | 10 | 10 | 4 | 8 | 41 甲 | 主公 | 镇荆州，绥怀远近；堕泪碑；d. 278. 平吴 |
| 109 | 杜预 (元凯) | 晋: GJ | 10 | 8 | 7 | 2 | 8 | 35 乙 | 军师 | 「杜武库」；勇2：身不跨马；280 平吴. 平吴 |
| 110 | 王濬 (士治) | 晋: GJ | 8 | 7 | 6 | 7 | 8 | 36 乙 | 先锋 | 280 楼船下益州. 平吴 |
| 111 | 王浑 (玄冲) | 晋: GJ | 7 | 7 | 6 | 6 | 7 | 33 乙 | 守将 | 280 破张悌 |
| 112 | 贾充 (公闾) | 晋: GJ | 7 | 3 | 3 | 3 | 6 | 22 丙 | 军师 | 信3：260 甘露之变中所为（《晋书》）；伐吴都督 |
| 113 | 石苞 (仲容) | 晋: GJ | 7 | 7 | 6 | 7 | 7 | 34 乙 | 守将 | 镇淮南 |
| 114 | 卫瓘 (伯玉) | 晋: GJ | 8 | 6 | 5 | 4 | 8 | 31 乙 | 军师 | 264 监军，平钟会之乱 |
| 115 | 马隆 (孝兴) | 晋: GJ | 8 | 8 | 6 | 7 | 8 | 37 乙 | 先锋 | 279 西平凉州，以少胜众 |
| 116 | 张华 (茂先) | 晋: GJ | 9 | 8 | 7 | 2 | 6 | 32 乙 | 军师 | 力主伐吴，筹划军略 |
| 117 | 王戎 (濬冲) | 晋: GJ | 7 | 5 | 4 | 4 | 5 | 25 丙 | 军师 | 280 出武昌；仁4：性好兴利（《晋书》） |
| 118 | 胡奋 (玄威) | 晋: GJ | 6 | 7 | 5 | 8 | 7 | 33 乙 | 猛将 | 280 攻江安 |
| 119 | 唐彬 (儒宗) | 晋: GJ | 7 | 7 | 7 | 8 | 7 | 36 乙 | 先锋 | 随王濬伐吴为先驱 |
| 120 | 陈骞 (休渊) | 晋: GJ | 8 | 6 | 5 | 6 | 7 | 32 乙 | 守将 | 257 围寿春 |

### Coverage and checks

**Cell sizes (21 used cells; HJ/QX/CB/SF/GJ):**

| Faction | HJ | QX | CB | SF | GJ | Entries |
|---|---|---|---|---|---|---|
| 蜀 | 4 | 7 | 17 | 22 | 9 | 59 |
| 魏 | 4 | 18 | 17 | 23 | 9 | 71 |
| 吴 | 5 | 16 | 14 | 15 | 13 | 63 |
| 群 | 11 | 27 | 12 | 4 | 4 | 58 |
| 晋 | – | – | – | – | 22 | 22 |
| **Total** | 24 | 68 | 60 | 64 | 57 | **273** |

All 21 used cells have ≥ 4 generals (thinnest: 蜀-HJ, 魏-HJ, 群-SF, 群-GJ with 4 each; add generals there first in later content). The 4 unused 晋 cells are empty by design. The pool cap (8) applies in the 15 cells larger than 8.

**Thin-cell members** (for the validator and reviewers): 蜀-HJ 刘备, 关羽, 张飞, 简雍 · 魏-HJ 曹操, 夏侯惇, 夏侯渊, 曹仁 (all from the 189 起兵) · 群-SF 张鲁, 孟获, 公孙康, 公孙渊 · 群-GJ 公孙渊, 诸葛诞, 文钦, 文鸯.

**Counts:** primary 蜀 26 · 魏 26 · 吴 25 · 群 25 · 晋 18 = 120. Faction membership (any appearance): 蜀 28 · 魏 34 · 吴 28 · 群 38 · 晋 22. Distinct generals per era: HJ 24 · QX 60 · CB 56 · SF 59 · GJ 48. **Multi-faction generals (26):** 赵云, 马超, 黄忠, 姜维, 马岱, 法正, 王平, 黄权 (3 factions), 罗宪, 徐庶, 糜芳, 张郃, 张辽, 司马懿, 徐晃, 贾诩, 庞德, 夏侯霸, 太史慈, 甘宁, 吾彦, 陈宫, 孟达 (3), 诸葛诞, 文钦 (3), 文鸯 (3). 吕布 is multi-era but single-faction: all of his camps (丁原, 董卓, his own) are 群, which is historically accurate (PO-3).

**Tiers:** 18 甲 · 67 乙 · 35 丙 (Phase 1: 10 / 15 / 7). By primary faction (甲/乙/丙): 蜀 4/16/6 · 魏 4/16/6 · 吴 6/17/2 · 群 3/5/17 · 晋 1/13/4.

**Event coverage:** 信 ≤ 3 (临阵生变, 11): 吕布, 董卓, 糜芳, 钟会, 孟达, 公孙渊 (信2); 韩遂, 袁术, 孙皓, 文钦, 贾充 (信3). 智 ≥ 9 (奇谋 as 军师, 21): 诸葛亮, 庞统, 法正, 徐庶, 曹操, 荀彧, 郭嘉, 司马懿, 贾诩, 荀攸, 邓艾, 钟会, 周瑜, 陆逊, 鲁肃, 诸葛恪, 陆抗, 沮授, 羊祜, 杜预, 张华. 勇 = 10 (万夫莫敌 as 猛将, 8): 关羽, 张飞, 马超, 许褚, 吕布, 典韦, 甘宁, 文鸯. Bonds: 16 (§7.3).

**Content-review notes:**
- Low stats come with a neutral, sourced reason (for example 刘禅 智4 "政事委于诸葛亮、蒋琬"; 孙皓 仁1 "用刑酷烈"). No insulting or meme wording in any `statNote`, `blurb` or log line ("乐不思蜀"-style mockery is not used).
- **Left out on purpose** (PO-4): leaders of ethnic-minority uprisings other than 孟获 (for example 轲比能, 秃发树机能), and figures known mainly from 《三国演义》 fiction (华雄 is historical but his 演义 death isn't; left out for v1). 周处 is left out because his military record falls after 280.
- **Forbidden terms** apply to every user-visible v1 string (AC 7, AC 50): 82-0, NBA, 武力, 统率, 政治, 魅力, SSR, 抽卡, 传说, 稀有, 三国志, 三国杀, 光荣, Koei. Because `statNote` is shown in the detail sheet, it never names the book 三国志: it cites "本传", "陈寿评" or "裴注" instead (《晋书》 and 《华阳国志》 are fine). The internal `source` field (not shown to players) may name 《三国志》. Bond and seal names copy no game's skill or card names.
