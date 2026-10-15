# 群友刻度盘 (working title): spec, v1 complete release

Status: **v1 complete-release scope, 2026-10-15.** The founder approved building this game (D-1). Under the constitution (Art. 4) there are no interim approvals: product decisions are logged in `docs/kedupan/decisions.md` (PD-1 to PD-30), and the founder's part comes at the end as the Founder Handoff (§16). Author: product-ux.
Type: WeChat 小游戏 (mini game). Slug: `kedupan`. Companions: `docs/kedupan/direction.md` (vision, pillars, art, risks) and `docs/kedupan/decisions.md`.
Reference implementation: `docs/dianjiangtai/spec.md` and `apps/dianjiangtai/`. Patterns and code are **copied** into `apps/kedupan/`, never imported (PD-26, §18).

Labels:
- **[COMPLIANCE]**: compliance-sensitive (user data, sharing, ads, content).
- **[SPIKE]**: documented but not yet run on a real phone; proven in the founder's device pass before submission (§14). Each has a specified fallback.
- **INFERENCE**: our own judgement.
- **[P0]**: verified for 点将台 in `docs/dianjiangtai/phase0-platform.md`; the same platform facts apply here.

Scope: everything above §19 is **v1**. §19 is the post-launch backlog and is out of v1.

---

## 1. Goal, target user, scope

**Goal.** Launch one complete, polished daily opinion game whose five shared cards and group stats spread through WeChat groups. Post-launch KPIs (not gates, PD-27): share rate ≥ 8% of completed dailies, card-open-to-play ≥ 30%, host-round reveal rate (≥ 2 guesses) ≥ 40%, D1 ≥ 35%, D7 ≥ 15% (definitions §12; watch levels in direction §10).

**Target user.** WeChat players aged 24-40 and 40+, many new to mobile games, arriving from group-chat cards. Portrait, one thumb, large text, no timers (direction §2).

**Article 3 check (constitution).**

| Principle | How v1 meets it |
|---|---|
| Simple | One sentence: "把指针拖到你觉得对的位置，看看和全国、和群友有多同频". One widget (a ruler), one confirm button, one thumb. No tutorial wall: three lines on first launch and one coach bubble (PD-30). |
| Addictive | Daily 5 cards (about 60 s), live score, 定分 the next morning with a national percentile, streak (no rewards), "most divisive card" reveal, unlimited archive for "one more set", host rounds that pull people back to a reveal. No dark patterns (§9). |
| Social | Group stats are the headline (群默契度, 群内默契分, 7-day trend), friend board, 最同频的群友, host rounds whose reveal names who 最懂你, spoiler-safe share cards. No induced sharing. |

**Package budget.** Main package ≤ 4 MB including the open data domain folder; total ≤ 30 MB [P0 §10]. v1 is code plus content modules (about 3,000 items, estimated ≤ 400 KB as `.js`) plus a few short sounds. No image assets beyond the icon and one static share fallback. No subpackage needed (system font only).

**Feature scope (all v1)**

| Feature | Section |
|---|---|
| 每日刻度: 5 shared cards a day, scored live against the nation (and the group with group context), 定分 at D+1 00:30 | §2.1, §3, §6.2-6.3 |
| 出题 (host rounds): hidden target, preset or in-chat clue, async group guessing, reveal | §2.2, §3.4, §6.5-6.7 |
| 往期刻度 (archive): every closed day, unranked, unlimited | §2.3, §6.9 |
| 本群 (group page): 群默契度, ranked members, 最同频, 7-day trend, recent host rounds | §6.8, §8 |
| 好友榜 (friend board), server-ranked | §6.8, §8 |
| Share cards: daily result, host round, round reveal | §7 |
| Streaks, 昨日定分 and percentile | §3.3, §6.1 |
| Rewarded extras (加一题, 全国分布, 换一批), capped archive interstitials, config banner (default off) | §9 |
| Opt-in subscribe message "刻度题揭晓了" | §6.6, §7.4 |
| Large-text and high-contrast modes | §6.11 |
| "这张卡有问题" content feedback (no text) | §6.3 |
| Analytics, privacy flow, retention cleanup | §12, §13, §11 |

Out of v1 (PD-14, PD-15, PD-22 and §19): updatable share messages, album saving, typed clues, cross-group ranking.

---

## 2. Core loops

### 2.1 每日刻度 (daily, the main mode; no clue-giver)

1. Home shows today's issue: "第 12 期 · 5 张卡". Tap **开始**.
2. **Card n of 5.** A sticky note shows the spectrum and the prompt, for example "冷 ↔ 热 · 火锅". The ruler is empty.
3. **Place.** Touch or drag anywhere on the ruler: the ▼ needle jumps to the finger and follows it. ‹ › nudge one step. Release keeps the needle. No numbers are shown.
4. **Confirm.** Tap **就这儿**. The position is submitted to the server (`submitCard`) and locked.
5. **Reveal (< 1 s after the server answers).** The ◆ national reference and, with group context, the ● group median slide in. Lines: the card label (心有灵犀 / 很同频 / 差不多 / 有点偏 / 想法独特), "+75", and "和全国 63% 的人想法相近" (±10, shown once ≥ 30 people answered the card). With group context, group members' hollow dots appear (unnamed).
6. Tap **下一张** (cards 1-4) or **看结果** (card 5).
7. **Day result.** 今日默契分 (live, out of 500) with its band, the 5 mini rulers, "今日最有争议" (the card with the widest national spread), streak line, and the actions: 分享 · 本群 / 好友榜 · ▶ 加一题 · ▶ 全国分布 · 往期 · 出一道题.

Time: about 8-15 s per card, 45-90 s for the day.

### 2.2 出题 (host rounds, group-clue mode)

1. **Host** taps 出一道题 on home or the day result.
2. Three spectra are offered (random from the library); one free **换一组**, then ▶ 换一批 (rewarded, ≤ 3 per round).
3. The host taps a spectrum. The server draws the hidden **target** (integer 5-95) and shows it to the host only, as a tangerine band on the ruler with the line "只有你能看到这个位置".
4. **Clue.** Two choices (PD-7):
   - **选提示词** (default): 6 curated items for that spectrum are shown (random order, from the content library); one free 换一批 shows 6 more. The host taps the item they think the group will place nearest the target.
   - **群里说**: "回群里用一句话或语音给提示，别直接说数字哦". No text is entered in the game.
5. Tap **发到群里**: the round card is shared (`shareAppMessage`, `r=<roundId>`).
6. **Guessers** open the card, see the spectrum and the clue (or "提示在群聊里，看看 TA 怎么说"), place the needle, tap 就这儿. They then see "已提交 · 已有 5 人作答 · 等待揭晓", never others' guesses or the target.
7. **Reveal** (PD-8): the host taps 揭晓 (≥ 2 on-time guesses), or automatically at the 8th guess, or automatically 24 h after creation if ≥ 1 guess exists.
8. **Reveal view:** the target, every guess as a dot, names via the open data domain where available (§8.5), 最懂你 (the closest guess), and 本题默契值 (§3.4).
9. After the reveal, a latecomer can tap **先猜再看**: place, then see the reveal with their late guess marked "揭晓后作答" (not counted).

### 2.3 往期刻度 (archive)

1. Home → 往期. A list of closed days (newest first, 30 per page).
2. Tap a day you didn't play: play its 5 cards exactly like the daily, but each reveal uses that day's **final** reference (frozen ◆; no group dots). Score shown instantly. Unranked; stored on the device.
3. A day you played as the daily opens as a read-only review (your needles, the final ◆, your 定分 and percentile).
4. Back to the list for another set. Interstitials can appear here only (§9).

---

## 3. Scoring (precise)

All positions are **integers 0-100** (0 = left end, 100 = right end). All formulas live in `core/score.js`, shared by client and server (drift test, §18). Medians and distances may be half-integers.

### 3.1 Card score

```
d = |p − ref|                       // p = your position, ref = the reference (nation, group or target)
s(d) = max(0, 100 − ceil(2.5 × d))  // integer 0-100
```

Test vectors: d 0 → 100; 0.5 → 98; 1 → 97; 2 → 95; 2.5 → 93; 10 → 75; 20 → 50; 39.5 → 1; 40 → 0; 73 → 0.

Card label (by `d`): ≤ 2 **心有灵犀**; ≤ 6 **很同频**; ≤ 12 **差不多**; ≤ 20 **有点偏**; > 20 **想法独特**.

### 3.2 Median definition

For a multiset of M values sorted ascending `v[0..M-1]`: `median = (v[floor((M−1)/2)] + v[floor(M/2)]) / 2`. Computed from a 101-bin histogram in O(101).

### 3.3 Daily: national score (live, then final)

- **Reference.** For card c on date D: `R_c = median( all ranked positions submitted for c ∪ W virtual votes at anchor_c )`, with **W = 10** (`config.score.priorVotes`) and `anchor_c` = the item's editor anchor (§4.2). PD-4.
- **Live.** `R_c` is recomputed from the current histogram (`daily_card_stats.hist`) every time it is shown (reveal, result, boards). It is labelled 实时.
- **Final (定分).** At **D+1 00:30 BJT** the submit window closes; `finalizeDay` (or the first read after that time) freezes `R_c` as `daily_sets.final[c]`. From then on every score for D uses the frozen value.
- **今日默契分** = Σ over the 5 cards `s(|p_c − R_c|)`, 0-500, for a complete daily. A partial daily shows the sum so far with "x/5".
- **Day band:** ≥ 450 **灵魂同频**; 380-449 **默契十足**; 300-379 **大体同频**; 200-299 **各有想法**; < 200 **独树一帜**.
- **"和全国 x% 的人想法相近"** (per card) = share of real positions for c with `|v − p| ≤ 10`, including yours, from the live histogram; shown when the card has ≥ 30 real positions, else "答题人数还少".
- **今日最有争议** = the card with the highest national MAD (mean absolute deviation of real positions from `R_c`); ties → lower card index. Shown after the viewer completed the day.
- **Percentile (定分 only).** `finalizeDay` scores every complete daily for D at the frozen references and stores a histogram of totals (`daily_sets.finalHist`, 101 bins of width 5). "超过全国 x%" = share of complete dailies with a strictly lower final total, rounded down to an integer. Shown on home the next day ("昨日定分 421 · 超过全国 68%") and in the archive review. Hidden below 30 complete dailies.

### 3.4 Group scores (PD-5)

Group G on date D: **members** = openids with a `group_members` row for G (PD-6) who have a **complete** daily for D. n = member count.
- **群内默契分** of member i (n ≥ 2) = Σ cards `s(|p_ic − median of the other members' positions for c|)`. Live until the group day closes with the national day (D+1 00:30), then fixed (positions don't change after that, so it is simply recomputed).
- **群默契度** (n ≥ 3) = round( mean over the 5 cards of `max(0, 100 − ceil(2.5 × MAD_c))` ), with `MAD_c` = mean of `|p_ic − m_c|` over members, `m_c` = median of members' positions. Below 3 members: "完成人数满 3 人后计算".
- **Group median per card** (the ● in the daily reveal) = `m_c` over members who submitted card c so far (n ≥ 1 other than the viewer, else no ●).
- **最同频** (open data domain only, PD-20): for the viewer v and each other visible member j with a complete day: `gap_j = mean over cards of |p_vc − p_jc|`; the smallest gap wins (ties → earlier completion). Line: "今天和你最同频：<nickname>（平均只差 4 格）". Needs ≥ 1 other matched member.

### 3.5 Host rounds (PD-9)

- On-time guess g: `s(|g − target|)`. On-time = submitted before the reveal.
- **本题默契值** = round(mean of on-time guess scores). The host's **出题默契** is the same number.
- **最懂你** = the on-time guess with the smallest `d`; ties → earliest guess.
- Late guesses (after the reveal) show their score but are excluded from 默契值 and 最懂你.

### 3.6 Archive and bonus cards

Scored client-side with `core/score.js` against the frozen `final[c]` from the server (`getArchiveDay`, `getBonusCard`). Unranked, never on a board, never in streaks.

---

## 4. Content

### 4.1 Model (`core/content/spectra.v1.js`, a CommonJS module; mini games can only `require` `.js`, PD-19)

```js
module.exports = {
  contentVersion: 1,
  categories: [{ key: 'food', label: '吃喝' }, /* … 12, §4.3 */],
  spectra: [
    { id: 's001', left: '冷', right: '热', cat: 'food',
      items: [
        { id: 's001i01', text: '火锅',     anchor: 88, tags: ['easy'] },
        { id: 's001i02', text: '冰粉',     anchor: 10, tags: ['easy'] },
        { id: 's001i03', text: '温水',     anchor: 55, tags: ['split'] },
        /* … ≥ 10 items */
      ] },
    /* … ≥ 300 spectra */
  ],
};
```

| Field | Rule |
|---|---|
| `id` | spectrum `s` + 3 digits; item = spectrum id + `i` + 2 digits. Stable forever; never reused |
| `left`, `right` | 1-4 Chinese characters each, a clear opposite pair, no punctuation |
| `cat` | one of the 12 category keys |
| `items` | ≥ 10 per spectrum |
| `text` | 1-10 characters, a **thing, place-type, activity, food, animal, object, weather or feeling**, never a person (§4.5) |
| `anchor` | integer 5-95: the editor's honest guess of the national median. Used only as the prior (§3.3); never shown |
| `tags` | optional: `easy` (anchor ≤ 20 or ≥ 80, clear consensus), `split` (expected to divide people), `season:<spring/summer/autumn/winter>`, `festival:<key>` (scheduling hints) |

`contentVersion` bumps on any change; the server keeps the last 2 versions (`getArchiveDay` and `getDaily` always send the card text, so an old client never shows a blank card).

### 4.2 Daily schedule (`core/content/schedule.v1.js`) and server daily sets

- Built **offline** by `tools/build-schedule.js` from the library: ≥ **365** days of 5 item ids each, keyed by issue number.
- Rules (PD-29), checked by the tool and by CI:
  1. 5 different categories and 5 different spectra per day;
  2. card 1 is an `easy` item;
  3. ≥ 1 `split` item per day;
  4. **no item ever repeats** in the schedule; a spectrum does not repeat within 21 days;
  5. season-tagged items fall in their season (Beijing dates from the launch date); festival-tagged items fall within 3 days before the festival.
- `genDaily` (23:00 BJT) copies issue N+1's 5 ids (with their text and anchors) into `daily_sets/<dateKey>` (§11.1). The server copy is authoritative: **ops can replace a card in the cloud console** before or during the day without a release (a replaced card keeps its index; its histogram restarts; logged in `daily_sets.edits`).
- If the schedule runs out, `genDaily` picks 5 unused items by the same rules from the library with a deterministic seed (`sub(dateKey, 'auto')`) and logs `[ALERT] schedule exhausted`.
- Items used in a published daily are marked in `item_usage` (server) so the auto path never repeats them.

### 4.3 Category plan and quotas (PD-18)

| Key | Label | Min. spectra | Example spectra (ours) |
|---|---|---|---|
| `food` | 吃喝 | 40 | 冷↔热, 清淡↔重口, 快手↔费工, 早饭↔夜宵 |
| `life` | 日常 | 40 | 便宜↔贵, 小事↔大事, 轻松↔累人, 必需↔可有可无 |
| `home` | 居家物件 | 25 | 实用↔好看, 一次性↔用很久, 好收纳↔占地方 |
| `animal` | 动物 | 25 | 温顺↔凶猛, 好养↔难养, 可爱↔吓人, 慢↔快 |
| `nature` | 天气自然 | 25 | 舒服↔难受, 常见↔少见, 安静↔壮观 |
| `senses` | 感官 | 25 | 好闻↔难闻, 好听↔刺耳, 软↔硬, 顺滑↔粗糙 |
| `leisure` | 休闲爱好 | 25 | 好学↔难学, 养生↔刺激, 适合一个人↔适合一群人 |
| `travel` | 出行 | 20 | 省心↔折腾, 近↔远 (generic), 慢悠悠↔赶时间 |
| `study` | 学习工作 | 20 | 简单↔烧脑, 枯燥↔有趣, 正式↔随意 |
| `tech` | 物件科技 (generic, no brands) | 20 | 好用↔难用, 老派↔新潮, 新手友好↔高手专属 |
| `feel` | 心情感受 | 20 | 紧张↔放松, 尴尬↔自在, 平淡↔隆重 |
| `memory` | 童年回忆 | 15 | 常见↔稀罕 (then vs now), 简单↔讲究 |
| **Total** | | **≥ 300** | **≥ 3,000 items** (≥ 10 per spectrum) |

Appendix A lists 60 seed spectra with sample items, which set the tone. The full library is written by the content owner the CTO assigns (default: minigame-dev with product-ux review), into `apps/kedupan/game/core/content/`.

### 4.4 Originality [COMPLIANCE]

- **All text is written by us.** Writers must not open, translate or adapt Wavelength's card list or any other game's spectra (its list is a protected compilation, kept-ideas §2). Generic opposite pairs (冷↔热) are common language; the selection, the Chinese-life items and the anchors are ours.
- Each spectrum records `author` and `date` in a review sheet (`docs/kedupan/content-review.md`, written by the content owner) for provenance and the 软著 file.
- No AI-generated text ships without a human rewrite and review; any AI assistance is noted in the review sheet (INFERENCE: text used as editorial drafts is not AIGC output shown to users, but provenance is kept anyway).

### 4.5 Content rules (review checklist) [COMPLIANCE]

A spectrum or item is **rejected** if it:
1. is about a **person or group of people**: 群友, friends, family roles as targets, celebrities, real or fictional named persons, professions framed as people ("医生↔…"), ages, genders, body types, looks or personalities ("男生↔女生", "胖↔瘦", "帅↔丑" all banned);
2. touches **politics, history of political events, the military, law enforcement, territory, maps, flags or national symbols**;
3. names or ranks **regions, provinces, cities or countries**, or regional customs in a comparative way (地域 risk; "南方↔北方" banned; a generic "城市↔乡村" spectrum is banned too);
4. touches **ethnicity, religion, religious festivals or practices**;
5. names a **brand, product line, company, app, game, show or song**;
6. involves **alcohol, tobacco, gambling (incl. 麻将, 彩票, 赌), drugs, weapons, violence, death, disasters, illness or medical/health claims** ("养生" is allowed only as a leisure style, never as a health claim);
7. is **sexual, vulgar, scatological or insulting**, or uses internet slang that mocks a group (e.g. "老头乐");
8. involves **money flaunting or debt** beyond everyday prices ("便宜↔贵" with everyday items is fine; luxury goods are not);
9. is **sad or negative in tone** (no "失恋", "加班到凌晨" style items); neutral or positive only;
10. could be read as a **test of someone** ("你适合…"), or as **advice**;
11. matches any **forbidden term** in `core/content/forbidden.v1.js` (CI check, §17 AC 8).

Process: the content owner writes; product-ux reviews every spectrum and samples ≥ 20% of items; a second reviewer (QA) checks the full list against the rules; release does the final pass before submission (Founder Handoff H9). Rejected items are deleted, not hidden. Live incidents: ops swaps the card in `daily_sets` (§4.2) and the item is removed from the library in the next release.

---

## 5. Days, windows and identity

- **Date key:** Beijing date `YYYYMMDD` from **server time**, via the copied `core/date.js` (explicit UTC+8 arithmetic). Every cloud function also sets `TZ=Asia/Shanghai` [P0 §9].
- **Issue number** 第 N 期 = days since the launch date (`LAUNCH_DATE_KEY` env or the first `daily_sets` document, as in 点将台).
- **Day D window:** cards of D can be started 00:00-24:00 D. A daily whose first card was submitted on D may submit its remaining cards until **D+1 00:30** (grace). After that, `LATE_SUBMIT`; the day stays partial (PD-24).
- **定分** at D+1 00:30; `finalizeDay` timer at 00:40 (lazy fallback on first read).
- **Identity:** `OPENID` from the cloud context only. No login prompt, no user info. Raw openids never reach any client (§8).

---

## 6. Screens and flows

General layout rules (copied from 点将台 §8):
- All content starts below the capsule: `navBottom = capsule.bottom + (capsule.top − statusBarHeight)`. Nothing drawn or tappable in the capsule's row on the right. The in-game back is "‹ 返回" at top-left.
- **The ruler and the primary button sit in the bottom 45%** (thumb zone), above the bottom safe-area inset.
- Touch targets ≥ 48 × 48 pt; the ruler's touch band is ≥ 64 pt tall and spans the full width minus 16 pt margins. Body ≥ 16 pt; prompt ≥ 28 pt; scores ≥ 40 pt.
- Every network-backed area has **loading / empty / error** states. Errors offer 重试. The archive (once loaded) and the howto always work.
- Design width 375; must work from 320 to 430 wide and 568 to 932 tall.

### 6.1 Home

```
┌───────────────────────────────────┐
│ 9:41                    [ ··· ◎ ] │ ← capsule row: nothing on the right
│                                   │
│        ▼                          │
│   ═══╪═══╪═══╪═══  (tape motif)   │
│        群 友 刻 度 盘               │
│                                   │
│  ┌─────────────────────────────┐  │
│  │ 每日刻度 · 第 12 期 · 5 张卡  │  │
│  │ 昨日定分 421 · 超过全国 68%   │  │ ← only if played yesterday (after 00:30)
│  │ 连续 5 天                     │  │ ← streak ≥ 2
│  │      [     开  始     ]       │  │ ← primary
│  └─────────────────────────────┘  │
│  ┌ 来自群聊 · 查看本群今日默契 › ┐  │ ← only with group context
│                                   │
│   [ 出一道题 ]     [ 往期刻度 ]     │
│   [ 本群 ] [ 好友榜 ] [ 玩法 ]      │
│   声音 开/关                 设置   │
└───────────────────────────────────┘
```

| State | Daily card shows |
|---|---|
| Loading | skeleton "正在取今日卡片…"; 往期 and 出一道题 enabled |
| Available | 开始 |
| In progress | "已答 2/5" + 继续 |
| Done | "今日默契分 412 · 默契十足 (实时)" + 看结果; subline "明日 0:00 换新卡 · 0:30 定分" |
| Pending submit (offline at confirm) | "答案待发送" + 重试 |
| Error / offline / `DAILY_UNAVAILABLE` | "今日卡片需联网获取" + 重试; archive (cached list) still available |

- **First launch:** no consent screen, no login. The 玩法 sheet opens once (PD-30): three lines plus a small animated ruler; dismissible; reachable later via 玩法.
- **本群** without group context opens the explainer (§6.8 state `noGroup`).
- **设置:** sound, 显示 (大字模式 / 高对比度, §6.11), privacy status line ("好友排行：已开启 / 未开启 [去设置]"), 用户隐私保护指引 (`wx.openPrivacyContract`), 联系我们/反馈 (`wx.createFeedbackButton`) [P0 §12].

### 6.2 Daily card (play)

```
┌───────────────────────────────────┐
│ ‹ 返回                   [ ··· ◎ ] │
│ 每日刻度 · 第 12 期        2 / 5    │
│                                   │
│      ┌───────────────────────┐    │
│      │       吃 喝            │    │ ← category, small
│      │       火 锅            │    │ ← prompt ≥ 28pt, sticky note
│      └───────────────────────┘    │
│                                   │
│  ┌────┐                    ┌────┐ │
│  │ 冷 │                    │ 热 │ │ ← end labels on notes
│  └────┘          ▼         └────┘ │
│  ├──┼──┼──┼──┼──╋──┼──┼──┼──┼──┤  │ ← ruler: tap or drag anywhere
│   [‹]                        [›]  │ ← nudge ±1 step
│                                   │
│        [      就 这 儿      ]       │ ← disabled until first touch
└───────────────────────────────────┘
```

| State | Behaviour |
|---|---|
| Empty | no needle; hint over the ruler "点一下或拖动，放上指针" (first card of first-ever daily: coach bubble, PD-30); 就这儿 disabled |
| Placing | needle follows the finger (single-finger routing copied from 点将台); light tick sound per 5 steps; nudges ±1, clamped 0-100 |
| Submitting | 就这儿 shows "提交中…"; needle locked; ≤ 5 s timeout |
| Revealed | §6.3 overlay on the same screen |
| Offline / timeout at confirm | position kept locally as `pending`; line "网络不稳，答案还没送达" + [重试]; 返回 allowed; the card is not revealed until the server accepts (the reveal needs server data) |
| `CARD_DONE` (already answered elsewhere) | the server's stored position and reveal are shown instead |
| `LATE_SUBMIT` | toast "这一期已经结束，可以去往期里玩"; the remaining cards become archive play once the day is closed |
| 返回 mid-day | no dialog needed: progress is per card on the server; home shows "已答 2/5 · 继续" |
| App backgrounded | state persisted after every confirm; resume at the same card |

### 6.3 Card reveal (overlay on 6.2)

```
│  ┌────┐                    ┌────┐ │
│  │ 冷 │          ◆ ● ▼     │ 热 │ │ ← ◆ nation, ● group median, ▼ you
│  ├──┼──┼──┼──┼──┼──┼──┼○─┼○─┼──┤  │ ← ○ group members (unnamed)
│                                   │
│        很同频  +88                  │ ← label + card score
│   全国 ◆ 在你左边 3 格 · 实时        │
│   和全国 63% 的人想法相近            │ ← hidden below 30 answers
│   本群 4 人 ● 和你一样               │ ← with group context only
│                                   │
│  这张卡有问题?                      │ ← small text link, bottom-left
│        [      下 一 张      ]       │
```

- Lines are pre-formatted by logic (§10). "在你左边/右边 N 格" uses `R_c − p` rounded; "和你一样" when `|● − ▼| ≤ 2`.
- 心有灵犀 (d ≤ 2): confetti burst, light vibration (`vibrateShort`), chime.
- **Group dots** appear only with group context for this session (§8.3) and n ≥ 1 other member answered this card.
- **"这张卡有问题?"** → sheet with three choices [不合适] [有歧义] [有错字] + [取消]. No text field. Calls `reportCard({dateKey|null, itemId, reason})`; toast "谢谢，我们会尽快查看". Rate-limited; grants nothing.

### 6.4 Day result

```
┌───────────────────────────────────┐
│ ‹ 首页                   [ ··· ◎ ] │
│ 每日刻度 · 第 12 期                  │
│        今日默契分                    │
│          4 1 2   (实时)             │ ← ≥ 40pt
│        〔默契十足〕                  │
│  火锅    冷 ├──◆▼──────┤ 热  +95     │ ← 5 mini rulers
│  一杯奶茶 便宜├───▼──◆──┤贵   +70     │
│  …                                │
│  今日最有争议：一杯奶茶 (便宜↔贵)      │
│  连续 5 天 · 0:30 定分                │
│ [ 分享 ]  [ 本群 ]  [ 好友榜 ]        │
│ [ ▶ 视频 加一题 ]  [ ▶ 视频 全国分布 ] │ ← ad buttons never next to 分享
│ [ 出一道题 ]          [ 往期刻度 ]    │
└───────────────────────────────────┘
```

| State | Behaviour |
|---|---|
| Live (before 00:30 D+1) | "(实时)" label; numbers refresh on open and on `onShow` (`getDaily` returns current refs) |
| Final | "(定分)" plus "超过全国 x%" (if ≥ 30 complete dailies) |
| Group context present | an extra line "本群群内默契分 388 · 本群默契度 81" (or "本群完成满 3 人后计算默契度") |
| 加一题 (rewarded, §9) | after `isEnded`: a bonus card (an unplayed item from a closed day, `getBonusCard`) played on the 6.2 screen with the "加一题 · 不计分" tag; its reveal uses the frozen final reference. ≤ 3 per day; when spent: "今天的加一题用完了" |
| 全国分布 (rewarded) | after `isEnded`: a sheet with the live histogram of each of today's cards (21 bins of 5), your ▼ marked; unlocked for this set for the rest of the day |
| Ad loading / failed | §9 rules |
| Server refs unavailable | the last known numbers with "暂未更新" |

### 6.5 Host: create round

```
┌───────────────────────────────────┐
│ ‹ 返回                   [ ··· ◎ ] │
│ 出一道题 · 选一条刻度                │
│  [ 冷 ↔ 热 ]                         │
│  [ 便宜 ↔ 贵 ]                       │
│  [ 好学 ↔ 难学 ]                     │
│  [ 换一组 (免费) ]  [ ▶ 视频 换一批 ]  │
└───────────────────────────────────┘
        ↓ tap a spectrum (createRound)
┌───────────────────────────────────┐
│ 便宜 ↔ 贵   只有你能看到这个位置      │
│  ├──┼──┼──┼──███──┼──┼──┼──┼──┤     │ ← tangerine target band (±2)
│ 怎么给提示？                         │
│  (●) 选一个提示词   ( ) 我在群里说     │
│  [一张电影票][一把雨伞][一次理发]       │
│  [一斤苹果][一杯咖啡][一本书]           │ ← 6 items; tap one
│  [ 换一批 ]                          │
│        [     发 到 群 里     ]        │ ← shareAppMessage, r=<id>
└───────────────────────────────────┘
```

| State | Behaviour |
|---|---|
| Spectra list | 3 random spectra from the local library (`sub(randomSeed, …)`); 换一组 free once; then ▶ 换一批 (≤ 3 per round); spent → disabled "就从这几条里选吧" |
| Creating (`createRound`) | spinner "正在生成位置…"; ≤ 5 s |
| Target shown | band ±2 around the target; never shown as a number |
| Clue = 选提示词 | 发到群里 disabled until an item is picked |
| Clue = 群里说 | hint "回群里用一句话或语音给提示，别直接说位置或数字哦"; 发到群里 enabled |
| `RATE_LIMITED` (20 rounds per day) | "今天出的题够多啦，明天再来" |
| Offline / error | "出题需联网" + 重试; nothing is created |
| After share sheet closes | the host lands on 6.7 (host waiting view). Optional inline card "揭晓时提醒我 [提醒我]" (§7.4) |

The round is created at the spectrum tap (target drawn then); the clue is saved with `setClue` at 发到群里. A round with no clue after 30 min is discarded silently (never shared).

### 6.6 Guess (round entry from a card)

```
┌───────────────────────────────────┐
│                          [ ··· ◎ ] │
│      群友出了一道刻度题               │
│      便宜 ↔ 贵                       │
│      提示：一张电影票                 │ ← or "提示在群聊里，看看 TA 怎么说"
│      已有 3 人作答                    │
│  ┌────┐                    ┌────┐ │
│  │便宜│          ▼         │ 贵 │ │
│  ├──┼──┼──┼──┼──┼──┼──┼──┼──┼──┤  │
│   [‹]                        [›]  │
│        [      就 这 儿      ]       │
│        [     先去首页看看     ]      │
└───────────────────────────────────┘
```

| State | Behaviour |
|---|---|
| Loading (`getRound`) | "展开题目…" skeleton |
| Open | as drawn; the host's identity is not shown (we have no names in the main domain) |
| Submitted, waiting | "已提交 · 已有 5 人作答 · 等待揭晓"; "主持人揭晓，或第 8 人作答、24 小时后自动揭晓"; optional "揭晓时提醒我" (§7.4); [回首页] |
| Revealed (opened after the reveal) | "已揭晓" + [先猜再看] (late guess, then 6.7) + [直接看答案] |
| Own round | goes to 6.7 host view |
| 无人作答 (24 h with 0 guesses) | "这道题已经结束了" + [去每日刻度] |
| Revealed and > 7 days old | the reveal view only (no 先猜再看; `ROUND_EXPIRED` for new guesses) |
| Not found | "找不到这道题" + [去首页] |
| Offline | "题目需联网展开" + 重试 |

### 6.7 Round: host waiting view and reveal view

Host waiting:
```
│ 便宜 ↔ 贵 · 提示：一张电影票           │
│ (your target band shown to you only)   │
│ 已有 5 人作答                          │
│ [ 揭 晓 ]  (enabled at ≥ 2)            │
│ 第 8 人作答或 24 小时后自动揭晓          │
│ [ 再发到群里 ]                          │ ← voluntary, same card
```

Reveal (everyone):
```
┌───────────────────────────────────┐
│ 便宜 ↔ 贵 · 提示：一张电影票           │
│  ┌────┐                    ┌────┐ │
│  │便宜│      ○ ○ ▮ ○  ▼    │ 贵 │ │ ← ▮ target, ○ guesses, ▼ you
│  ├──┼──┼──┼──┼──┼──┼──┼──┼──┼──┤  │
│ 本题默契值 78                        │
│ ┌ open data domain list ──────────┐ │
│ │ 最懂你  (头像) 李四   差 1 格  +97 │ │
│ │        (头像) 你     差 6 格  +85 │ │
│ │        群友 A        差 15 格 +62 │ │ ← unmatched rows: "群友 A/B/…"
│ └─────────────────────────────────┘ │
│ [ 分享揭晓 ]   [ 我也出一道 ]          │
└───────────────────────────────────┘
```

| State | Behaviour |
|---|---|
| Host, < 2 guesses | 揭晓 disabled with "至少 2 人作答后可揭晓" |
| Revealing (`revealRound`) | spinner ≤ 5 s; on `TOO_FEW_GUESSES` the count refreshes |
| Revealed | target ▮, all on-time guesses ○, late guesses dashed ○ "揭晓后作答"; 默契值; list in the open data domain (§8.5) |
| No names available (privacy or scope refused, or no matching rows) | list shows "群友 A/B/C…" and "你"/"出题人" only; a passive line "开启「微信朋友关系」可显示好友昵称 [去设置]" |
| 无人作答 (24 h, 0 guesses) | "没有人作答，这道题结束了" + [再出一道] |

The host's own row is labelled 出题人 and has no score. 我也出一道 → 6.5.

### 6.8 本群 (group page) and 好友榜

Group page (requires group context from this entry, PD-6):
```
┌───────────────────────────────────┐
│ ‹ 返回                   [ ··· ◎ ] │
│ 本群 · 第 12 期                      │
│   本群今日默契度  8 1                 │ ← n ≥ 3, viewer completed
│   已完成 6 人 · 今日最有争议：一杯奶茶  │
│ ┌ open data domain ───────────────┐ │
│ │ 1 (头像) 张三  群内 455  全国 430 │ │
│ │ 2 (头像) 你    群内 412  全国 401 │ │
│ │ 3 群友 A       群内 380          │ │ ← server row, no ODC match
│ │ 今天和你最同频：张三（平均差 4 格） │ │
│ └─────────────────────────────────┘ │
│ 近 7 天默契度  72 68 81 75 — 79 81    │ ← "—" = < 3 members that day
│ 本群出题  便宜↔贵 默契 78 ›  …         │ ← last 10 rounds with guesses from this group
│ [ 分享到本群 ] (voluntary)            │
│ ┌ banner (config, default off) ┐      │
└───────────────────────────────────┘
```

| State | Behaviour |
|---|---|
| `noGroup` | "在群聊里点开本游戏的卡片，就能看到本群的默契度" + optional [分享到群]. No reward, no count, no pressure |
| `checkingGroup` (`joinGroup`) | skeleton "正在确认群聊…" |
| `groupFailed` (40097, 65206, non-group chat, error) | same as `noGroup`; `group_join` logged |
| `loading` | skeleton rows |
| `notPlayed` | stats line "本群已完成 6 人"; member positions and scores hidden: "完成今日刻度后查看本群默契" + [去答题]; the 7-day trend and rounds list are visible |
| `ready` | as drawn |
| `small` (n < 3) | "完成人数满 3 人后计算本群默契度"; rows still listed (n ≥ 2 shows 群内分) |
| `empty` (n = 0) | "本群今天还没有人完成" + [去答题] |
| `serverError` | "本群数据暂时打不开" + 重试. Never falls back to self-reported KV values |
| `privacyDenied` | "查看群友昵称需要同意《用户隐私保护指引》" + [查看指引] + [同意并查看]. The server rows still render as "群友 A/B/C" with your own row; stats lines still show |
| `unauthorized` (`scope.WxFriendInteraction` refused) | the same anonymous rendering + "开启「微信朋友关系」可显示群友昵称 [去设置开启]" |

**好友榜** ("好友 · 今日刻度"): friends who completed today, ranked by the server's **national** 默契分 (live), then earlier completion. Rows show score and, if the viewer completed, a 5-dot strip of their positions relative to the ◆. 最同频 line among friends. States: loading / empty ("还没有好友完成今日刻度") / serverError / privacyDenied / unauthorized / `selfOnly` (over the cap: your row ranked "已校验", friends' rows "好友自报" with no rank numbers, §8.4).

### 6.9 往期刻度 (archive)

List:
```
│ 往期刻度                最长连续 12 天  │
│ 第11期 10月14日  已玩 · 定分 421 ›      │
│ 第10期 10月13日  未玩 · 5 张卡 ›         │
│ 第9期  10月12日  往期练习 380 ›          │ ← played in archive (local record)
│ [ 加载更多 ]                             │
│ ┌ banner (config, default off) ┐         │
```
- Closed days only (today never appears until 00:30 D+1).
- States: loading, ready, empty ("还没有往期，明天再来" on launch day), error/offline ("往期需联网查看" + 重试; a cached page shows with "离线").
- Day review (played as daily): your 5 needles, the final ◆, the card labels, 定分 and percentile, today's most divisive card. Read-only. 全国分布 rewarded unlock applies per set.
- Archive play: §2.3. At the end: "往期练习 380 · 不计入排行" + [再来一期] (next unplayed day) + [返回列表]. Interstitial rule §9 applies on 再来一期 and 返回列表.

### 6.10 Navigation map

```
 launch → Home ──开始──→ Daily card ×5 (reveal each) ──→ Day result ─┬─分享→ share sheet
            │                                                       ├─本群/好友榜
            ├─出一道题 → Create round → share sheet → Host view        ├─▶加一题 → bonus card
            ├─往期 → Archive list → Archive play ×5 / Day review     ├─▶全国分布 → sheet
            ├─本群 → Group page (or explainer)                        └─出一道题 / 往期
            ├─好友榜 → Friend board
            └─玩法 / 设置
 daily card (s=d)  → Home (+ group context if ticket)
 round card (r=id) → Guess / Host view / Reveal (+ group context if ticket)
 reveal notice     → Reveal view
```

Warm start with a new card while mid-card: wait until the current card is confirmed or the player returns home, then toast "你有一道新刻度题" (点将台 §9.4 pattern).

### 6.11 Display settings (PD-16)

Copied from 点将台 §8.10: two switches in 设置, local storage, applied instantly.
- **大字模式:** body ≥ 20 pt, prompt ≥ 34 pt, scores ≥ 48 pt, buttons ≥ 56 pt tall, ruler band ≥ 80 pt; result mini rulers become one per row with the prompt above. Holds at 320 × 568 (content scrolls, nothing clipped).
- **高对比度:** white background, black ink, darker markers (direction §6), 2 pt outlines on markers, text ≥ 7:1, non-text ≥ 3:1.
- Default mode meets 4.5:1 for body text. Share cards always use the standard look.

---

## 7. Sharing [COMPLIANCE: 诱导分享]

Universal rules (copied from 点将台 §9):
- Every share starts with an explicit tap (`wx.shareAppMessage`) or the capsule menu (`wx.showShareMenu({menus:['shareAppMessage']})` + `wx.onShareAppMessage` at startup).
- **No share ever grants anything.** Nothing depends on whether a share succeeded (no callback exists [P0 §4]). Nothing is shared automatically.
- `wx.updateShareMenu({withShareTicket: true})` at startup; never pass `isUpdatableMessage: false` in the same call [P0 §4].
- Share images: 5:4, 500 × 400, rendered on an offscreen canvas; static fallback image on render failure.
- Titles: no exaggeration, no fake system wording, no "@所有人", no "不转不是…".

### 7.1 Daily result card (spoiler-safe, PD-11)

```
┌──────────────────────────────┐
│ 群友刻度盘 · 每日刻度 第12期     │
│ 火锅 冷↔热          ■ 很同频    │
│ 一杯奶茶 便宜↔贵     ■ 有点偏    │
│ …  (5 rows: prompt + label     │
│     block, no positions)       │
│ 今日默契分 412 · 默契十足        │
│ 你会把指针放在哪？               │
└──────────────────────────────┘
```
Title: "火锅是冷还是热？我今天和全国的默契分 412，你呢". Query `s=d&d=<dateKey>`. **No positions, no medians, no group numbers on the image.**

### 7.2 Host round card

Image: the spectrum ends and an empty ruler, "提示：一张电影票" or "提示在群聊里", "群友出了一道刻度题". Title: "我出了一道刻度题：便宜↔贵，猜猜我心里的位置". Query `r=<roundId>` (id only, never the target).

### 7.3 Reveal card

Image: the ruler with the target ▮ and the guesses as unnamed dots, "本题默契值 78 · 6 人作答", no names. Title: "刻度题揭晓：本题默契值 78". Query `r=<roundId>`. Group card from the group page ([分享到本群]): image "本群今日默契度 81" (only if n ≥ 3, else "本群今日刻度"), query `s=g`.

### 7.4 Subscribe message "刻度题揭晓了" (PD-13) [COMPLIANCE: opt-in only] [SPIKE]

- Available only when `app_config.subscribe.tmplId` exists (founder's MP console, H7); otherwise never shown, never requested.
- Offered only (a) to the host on the host waiting view after sharing, (b) to a guesser right after their guess. Copy "揭晓时提醒我" [提醒我]. Called directly from the tap: `wx.requestSubscribeMessage({tmplIds:[tmplId]})`.
  - `accept` → `subscribeRound({roundId})` stores one grant (`sub_grants`, `_id: <roundId>_<openid>`).
  - `reject` → hidden for this round; `ban`/20004 → never offered again on this device (local flag).
- **Sending:** at the reveal (host tap, 8th guess or the hourly sweep), the server claims every unused grant for that round in a transaction and sends one message each: title "刻度题揭晓了", fields: the spectrum ("便宜↔贵"), "本题默契值 78", time; opening it launches with `r=<roundId>`. One grant = at most one message. No names, no openids.
- No reward; never required.

### 7.5 Entering from a card

| Query | Destination |
|---|---|
| `s=d` (± ticket) | Home; with a ticket, `joinGroup` → group banner |
| `s=g` (± ticket) | Group page (with ticket) or Home + explainer |
| `r=<id>` (± ticket) | Round entry (6.6/6.7); `joinGroup` runs in the background with a ticket |
| `wxad_fallback_share=1` | Home; logged; grants nothing |
| malformed | Home; logged |

`card_open` fires once per entry (§12).

---

## 8. Group context, boards and the open data domain

**Copied design: 点将台 §9.2, §11 (C3).** Ranks and scores come only from our server; the WeChat KV is a presence marker that is never trusted.

### 8.1 Group detection (`getGroupEnterInfo` → `joinGroup`) [SPIKE]

Exactly as 点将台 §9.2: on launch and `onShow`, read `wx.getEnterOptionsSync()`; a `shareTicket` is the group signal; call `wx.getGroupEnterInfo` → `joinGroup({groupData: wx.cloud.CloudID(cloudID)})`; the server receives the decrypted `opengid`, rejects non-group chats, upserts `group_members` (`_id: <openGId>_<openid>`), returns `groupRef = sha256(openGId + GROUP_REF_PEPPER)[0..16)`. `wx.getShareInfo` is never used. The client keeps `{groupRef, shareTicket}` in memory for this entry only. Errors (40097, 65206, non-group, offline) → no group context; nothing else changes. Code: copy `apps/dianjiangtai/cloudfunctions/joinGroup/index.js`.

### 8.2 KV presence marker (client write)

After the first complete daily of a day (and on the first round guess of a day if none), the main domain writes `wx.setUserCloudStorage({KVDataList:[{key:'kd', value: JSON.stringify({d: dateKey, s: total})}]})`. One key, overwritten daily. Never used for ranking; shown only in `selfOnly` mode as "好友自报". It is a privacy interface (微信朋友关系): the first write may trigger the privacy popup; on refusal (104) the write is skipped and retried only after a later agreement (`markerPending`). [SPIKE: whether friends with no key are returned at all; if they are, the marker can be dropped.]

### 8.3 Server-computed rows and hashing

- **Daily rows:** `h = sha256(openid + '|' + daily_sets.boardSalt)[0..12)`; a new 16-byte salt per day.
- **Round rows:** `h = sha256(openid + '|' + rounds.salt)[0..12)`; a salt per round.
- Raw openids never leave the server. `selfHash` lets the open data domain mark "你".

### 8.4 Board payloads

`getGroupDay({groupRef, dateKey})` (group page): the caller must have a `group_members` row with that `groupRef` (else `NOT_MEMBER`).
```
{ dateKey, issueNo, salt, selfHash, viewerDone, n,
  mq: number|null,                    // 群默契度 (n ≥ 3)
  divisiveIdx: 0..4|null,
  rows: [[h, gs, ns, t, pos?, k?], …], // gs 群内默契分, ns national live score, t completion secs after 00:00 BJT,
                                       // pos "a,b,c,d,e" only if viewerDone, k streak if ≥ 2
  trend: [{dateKey, mq|null, n}] ×7,
  rounds: [{roundId, left, right, clue|null, status, mq|null, guesses}] ≤ 10 }
```
- Rows = all members with a complete daily for D (group mode only; members are known server-side, PD-6). Capped at `groupRowCap` 500 (largest WeChat groups); above the cap the top 500 by `gs` plus the caller.
- `gs`, `mq` computed per §3.4 at request time; 60 s per-instance cache per (groupRef, dateKey) for the member list; the caller's own row always fresh.
- `trend` and closed days come from `group_daily` (a cache written on first read after a day closes, `_id: <groupRef>_<dateKey>`).

`getFriendBoard({dateKey})`: `{dateKey, issueNo, salt, selfHash, viewerDone, mode:'full'|'selfOnly', refs:[R×5], rows:[[h, ns, t, pos?, k?], …]}`. `full` = every complete daily of D, hashed (the server doesn't know the friend graph; the open data domain matches). Above `boardListCap` (default 3,000, the device pass may lower it) → `selfOnly`. Same cap logic and reasoning as 点将台 §11.5.

`getRound` (revealed): `{…, salt, selfHash, target, mq, rows:[[h, g, s, late, isHost], …]}`.

### 8.5 Open data domain rendering

The main domain `postMessage`s `{type:'render', view:'group'|'friend'|'round', shareTicket?, groupid?, salt, selfHash, rows, viewerDone, refs?, width, height, palette, scale}`. The open data domain:
1. reads `getGroupCloudStorage({shareTicket, keyList:['kd']})` (group page, or a round opened with a ticket) or `getFriendCloudStorage({keyList:['kd']})` (friend board, or a round opened without a ticket);
2. hashes each row's `openid` with the bundled pure-JS SHA-256 (copied `opendata/sha256.js`) and the given salt, and looks it up in the server rows;
3. **matched** rows show nickname and avatar with the server values; **server rows without a match** show "群友 A/B/C…" (stable order by `h`); **KV rows without a server row** are not shown (group, round) or shown "好友自报" without rank (friend `selfOnly` only);
4. computes 最同频 (§3.4) from `pos` for matched rows (viewer must be `viewerDone`);
5. draws on the shared canvas; never posts back.

Nicknames and avatars exist only inside the open data domain [COMPLIANCE: data minimisation].

### 8.6 Privacy and friend-scope flow [COMPLIANCE]

Copied from 点将台 §11.6: the official privacy popup (MP 基础设置) fires on the first privacy-interface call, which only follows a user action (a completed daily's marker write, or opening the group page, friend board or a round reveal). `scope.WxFriendInteraction` is requested only from those taps. **Refusal never blocks play**: every view still renders the server data anonymously ("群友 A/B"), with a passive [去设置开启]. No automatic re-prompt. [SPIKE: official popup vs `onNeedPrivacyAuthorization` fallback dialog, same text pattern as 点将台.]

---

## 9. Ads (IAA only) [COMPLIANCE]

| Placement | Format | Where | Trigger | Caps |
|---|---|---|---|---|
| 加一题 | rewarded | day result (after a complete daily) | tap "▶ 视频 加一题" | ≤ 3 per day |
| 全国分布 | rewarded | day result, archive day review/end | tap "▶ 视频 全国分布" | 1 per set (unlocks that set's histograms for the day) |
| 换一批 (host) | rewarded | create round | after the free 换一组 is used | ≤ 3 per round |
| Between archive sets | interstitial | archive | on 再来一期 / 返回列表 after a completed archive set | every 2nd completed set in a session; not before 3 lifetime completed sets (daily or archive); ≥ 120 s apart; ≤ 6 per day |
| Board footer | banner | group page, friend board, archive list (`ready`/`empty` states) | screen shown | `app_config.ads.banner.enabled`, **default off** |

- **Never:** in the daily card flow or its reveals, on the day result as an interstitial, anywhere in the host-round flow except the rewarded 换一批 (PD-28), on first-session card entries, on privacy/authorization/error states, adjacent to a primary button or the ruler.
- Interstitial caps live in `app_config.ads.interstitial` with defaults in `core/config.js` (`everyNSets: 2`, `minLifetimeSets: 3`, `minGapSec: 120`, `maxPerDay: 6`, `enabled: true`), clamped (`everyNSets ≥ 2`, `minLifetimeSets ≥ 2`, `minGapSec ≥ 60`, `maxPerDay ≤ 8`).
- **Rewarded rules (copied from 点将台 §12):** reward only on close with `isEnded === true` ("完整观看才能获得" otherwise). On load error or no fill (1000-1008), grant anyway **at most once per placement per day** with "暂无广告，本次免费"; the next failure that day shows "暂无广告，请稍后再试" and grants nothing. Every instance: `wx.createRewardedVideoAd({adUnitId, disableFallbackSharePage: true})`; `onLoad` with `useFallbackSharePage: true` is treated as no-fill. Global singleton shared by placements.
- **Interstitial errors** 2001-2003 skipped silently, not counted, logged `ad_error`; never delays navigation.
- Ad buttons show ▶ and the word 视频. Nothing that is core is behind an ad: the daily, every reveal, the national ◆, the group page, the friend board, host rounds and the archive are free.
- **Stub mode** (copied): `adMode: 'stub'` for QA only, with simulated errors; production has stub off. Until 流量主 ad units exist, rewarded and interstitial behave as no-fill and the banner stays off.

---

## 10. View models (client)

Strings are pre-formatted by logic (`js/vm.js`), never by renderers. `?` = optional.

```ts
type Marker = { pos:number /* 0-100, may be .5 */, kind:'you'|'nation'|'group'|'member'|'target'|'late' };
type CardText = { itemId:string, spectrumId:string, left:string, right:string, prompt:string, catLabel:string };

// Shared
{ display:{ largeText:boolean, highContrast:boolean, scale:1|1.25, palette:'standard'|'highContrast' },
  features:{ subscribe:{tmplId:string}|null, banner:{enabled:boolean, adUnitId:string|null},
             interstitial:{enabled, everyNSets, minLifetimeSets, minGapSec, maxPerDay} } }

// Home
{ daily:{ state:'loading'|'available'|'inProgress'|'done'|'pendingSubmit'|'error'|'offline'|'unavailable',
          issueNo:number, dateKey:string, answered:0..5,
          scoreText:string|null /* '今日默契分 412 · 默契十足 (实时)' */,
          yesterdayText:string|null /* '昨日定分 421 · 超过全国 68%' */,
          streakText:string|null /* '连续 5 天' when ≥ 2 */ },
  group:{ status:'none'|'checking'|'ok'|'failed', bannerText:string|null },
  muted:boolean, showHowToOnce:boolean }

// Card play (daily, archive or bonus)
{ mode:'daily'|'archive'|'bonus'|'guess', index:1..5|null, total:5|null, tag:string|null /* '加一题 · 不计分' */,
  card:CardText,
  phase:'empty'|'placing'|'submitting'|'pending'|'revealed',
  needle:number|null, canConfirm:boolean,
  reveal:{ markers:Marker[], label:string /* '很同频' */, scoreText:string /* '+88' */,
           nationText:string /* '全国 ◆ 在你左边 3 格 · 实时' */, agreeText:string|null,
           groupText:string|null, bullseye:boolean } | null,
  primaryLabel:'就这儿'|'下一张'|'看结果'|'重试' }

// Day result
{ issueNo, final:boolean, totalText:'412', bandLabel:string, statusTag:'实时'|'定分',
  percentileText:string|null,
  rows:[{ prompt, left, right, you:number, nation:number, label, scoreText }] /* 5 */,
  divisiveText:string|null, streakText:string|null,
  groupText:string|null /* '本群群内默契分 388 · 本群默契度 81' */,
  bonus:{ left:0..3, adState:'idle'|'loading'|'playing'|'error' },
  distribution:{ unlocked:boolean, hist?:number[][] /* 5 × 21 */, adState } }

// Create round
{ step:'pickSpectrum'|'creating'|'pickClue'|'sharing'|'error'|'rateLimited',
  spectra:[{id, left, right}] /* 3 */, freeSwapLeft:0|1, adSwapLeft:0..3,
  roundId:string|null, targetBand:{from:number, to:number}|null,
  clueMode:'preset'|'chat', clueOptions:[{itemId, text}] /* 6 */, clueItemId:string|null, canShare:boolean }

// Round (guess / host / reveal)
{ status:'loading'|'open'|'submitted'|'revealedUnplayed'|'revealed'|'hostWaiting'|'expired'|'noGuesses'|'notFound'|'offline',
  isHost:boolean, left, right, clueText:string /* '提示：一张电影票' | '提示在群聊里，看看 TA 怎么说' */,
  guessCountText:string, canReveal:boolean, revealHint:string,
  myGuess:number|null, late:boolean,
  reveal:{ target:number, mqText:'本题默契值 78', markers:Marker[] } | null,
  subscribe:{ state:'hidden'|'offer'|'requesting'|'granted'|'declined'|'unavailable' } }

// Group page (main domain part; rows are drawn by the open data domain)
{ state:'noGroup'|'checkingGroup'|'groupFailed'|'loading'|'notPlayed'|'ready'|'small'|'empty'|'serverError'|'privacyDenied'|'unauthorized',
  issueNo, mqText:string|null, countText:string, divisiveText:string|null,
  trend:[{ label:'10/14', value:number|null }] /* 7 */,
  rounds:[{ roundId, title:'便宜↔贵', mqText:string|null, statusText }],
  banner:{ show:boolean, reservedHeight:number } }

// Friend board
{ state:'loading'|'ready'|'empty'|'serverError'|'privacyDenied'|'unauthorized', mode:'full'|'selfOnly'|null,
  issueNo, selfText:string|null, banner:{show, reservedHeight} }

// Archive list / day
{ state:'loading'|'ready'|'empty'|'error'|'offline', bestStreakText:string|null, hasMore:boolean,
  items:[{ dateKey, issueNo, dateText:'10月14日', statusText:'已玩 · 定分 421'|'未玩 · 5 张卡'|'往期练习 380' }] }
{ state, dateKey, issueNo, kind:'review'|'play', cards:CardText[], finals:number[] /* 5 */,
  mine:{ positions:number[], totalText, percentileText:string|null } | null }

// Main → open data domain
{ type:'render', view:'group'|'friend'|'round', shareTicket?:string, groupid?:string, salt:string, selfHash:string,
  viewerDone:boolean, rows:Array<Array<string|number|null>>, refs?:number[],
  width:number, height:number, palette:'standard'|'highContrast', scale:1|1.25 }

// Settings
{ muted, largeText, highContrast, privacy:'unknown'|'agreed'|'denied', friendScope:'unknown'|'granted'|'denied' }
```

---

## 11. Backend (WeChat Cloud Development)

Runtime rules (copied from 点将台 §14 and its README): identity only from `cloud.getWXContext().OPENID`; every function returns `{ok:true,…}` or `{ok:false, code, message}` and never throws; `TZ=Asia/Shanghai` on every function plus `core/date.js` for date keys; explicit timeouts (`function.config.json`); uniqueness by deterministic `_id` created with `add`; multi-document writes in `db.runTransaction`; counters with `db.command.inc`; all collections deny-all for clients (`database/rules.json`); secrets only in env vars (`GROUP_REF_PEPPER`). **No AppSecret, no `session_key`, no `code2Session`.** Layout copied: `cloudfunctions/common/` (store, util, coreapi) synced into each function by `scripts/sync-core.js` with a drift check.

### 11.1 Collections

| Collection | Key fields | Notes |
|---|---|---|
| `daily_sets` | `_id: YYYYMMDD`, `issueNo`, `contentVersion`, `cards[5]: {itemId, spectrumId, left, right, prompt, anchor, cat}`, `boardSalt`, `final[5]?`, `finalHist[101]?`, `finalCount?`, `finalizedAt?`, `edits[]`, `source: schedule/auto`, `createdAt` | one per date (fixed `_id`, idempotent). `anchor` never sent to clients for open days |
| `daily_card_stats` | `_id: <dateKey>_<idx>`, `hist[101]`, `n` | atomic `inc` per submitted card. A replaced card resets its doc (ops) |
| `daily_entries` | `_id: <dateKey>_<openid>`, `openid`, `dateKey`, `pos[5]` (null until answered), `answeredAt[5]`, `firstAt`, `completeAt?`, `streak?`, `contentVersion` | one per player per day; per-card writes in a transaction with the stats `inc` |
| `player_stats` | `_id: <openid>`, `curStreak`, `bestStreak`, `lastCompleteDate`, `totalDays`, `flags7d`, `updatedAt` | streak (§11.4) |
| `group_members` | `_id: <openGId>_<openid>`, `openGId`, `openid`, `groupRef`, `firstSeen`, `lastSeen` | copied from 点将台; written only by `joinGroup` |
| `group_daily` | `_id: <groupRef>_<dateKey>`, `n`, `mq`, `divisiveIdx`, `computedAt` | cache for closed days (trend) |
| `rounds` | `_id: roundId` (8-char base32, random), `hostOpenid`, `spectrumId`, `left`, `right`, `target`, `clueMode: preset/chat/null`, `clueItemId?`, `clueText?` (curated item text, copied from content), `salt`, `createdAt`, `status: draft/open/revealed/noGuesses`, `revealedAt?`, `revealBy?: host/count/timer`, `guessCount`, `mq?`, `groupRefs[]` (≤ 10), `contentVersion` | target never returned to non-hosts before reveal |
| `guesses` | `_id: <roundId>_<openid>`, `roundId`, `openid`, `pos`, `ts`, `late: boolean`, `groupRef?` | one per player per round |
| `sub_grants` | `_id: <roundId>_<openid>`, `tmplId`, `grantedAt`, `used`, `sentAt?`, `sendErrCode?` | §7.4 |
| `card_reports` | `_id: auto`, `openid`, `dateKey?`, `itemId`, `reason: unsuitable/ambiguous/typo`, `ts` | content feedback (§6.3); ops reviews; no text |
| `item_usage` | `_id: itemId`, `dateKey` | auto-schedule fallback (§4.2) |
| `anomalies` | `_id: <openid>_<dateKey>_<kind>`, `kind: fast`, `detail`, `ts` | observe-only (§11.5) |
| `events` | copied from 点将台 (`sessionId` top-level, `clientTs`) | analytics |
| `rate_limits` | copied | per-minute and per-day counters |
| `app_config` | `_id: 'live'`, `subscribe:{tmplId, fields}`, `ads:{banner, interstitial}`, `updatedAt` | remote features (copied pattern, 点将台 PO-11) |
| `meta` | `launch` | launch date for issue numbers |

### 11.2 Cloud functions

| Function | In | Out | Notes |
|---|---|---|---|
| `getDaily` | `{groupRef?}` | `{dateKey, issueNo, serverNow, cards[5]: CardText, mine:{pos[5], answered, complete, total?, cardScores?[5]}, refs?:[5] (live R_c, only for answered cards), groupRefs?:[5]|null, yesterday?:{total, pct, final:true}, myStreak:{current,best}, features}` | creates today's set lazily if `genDaily` missed (§4.2). `refs` only for cards the caller has answered. Timeout 10 s |
| `genDaily` (timer `0 0 23 * * * *`) | | | writes tomorrow's `daily_sets` from the schedule (or the auto path); idempotent by `_id`; rejects calls with an OPENID (`FORBIDDEN`). Timeout 20 s |
| `submitCard` | `{dateKey, idx, pos, groupRef?}` | `{idx, pos, ref, score, label, agreePct|null, n, group?:{median|null, n, dots:[…]} , complete, total?, streak?}` | validates: `dateKey` is today (or yesterday within the grace with `firstAt` on D), `idx` = first unanswered card (`CARD_ORDER`), integer 0 ≤ pos ≤ 100 (`INVALID_INPUT`). Transaction: set `pos[idx]`, `inc` `daily_card_stats.hist[pos]` and `n`. Already answered → `CARD_DONE` with the stored reveal. On the 5th card: `completeAt`, streak update (§11.4), returns `total`. Group block only if `groupRef` belongs to the caller (else ignored). `fast` anomaly if card 5 completes < 6 s after card 1. Timeout 5 s |
| `finalizeDay` (timer `0 40 0 * * * *`) | | | for D = yesterday: freeze `final[5]` from the histograms (with the prior), page through complete `daily_entries` (1,000 per query) to build `finalHist`, `finalCount`; idempotent (skips if `finalizedAt`). Any read after D+1 00:30 that finds no `final` computes and stores `final[5]` lazily (percentile then waits for the timer). Timeout from the device pass (start 300 s) [SPIKE] |
| `getArchive` | `{before?: dateKey, limit ≤ 30}` | `{items:[{dateKey, issueNo, mine?:{total, final}}], hasMore, bestStreak}` | closed days only |
| `getArchiveDay` | `{dateKey}` | `{dateKey, issueNo, cards[5], finals[5], mine?:{pos[5], total, pct}, hist?:[5][21] (only if the caller has the 全国分布 unlock for this set)}` | `DAY_OPEN` for today or an unclosed day |
| `getBonusCard` | `{}` | `{card, final, dateKey}` | an item from a closed day the caller has not answered; ≤ 3 per day per openid (`RATE_LIMITED`) |
| `unlockDistribution` | `{dateKey}` | `{hist:[5][21]}` | called after a rewarded `isEnded` (or the no-fill grant); for today it returns the live histograms only for cards the caller answered. ≤ 3 per day (rate limit). Stores nothing beyond the rate counter |
| `joinGroup` | `{groupData: CloudID}` | `{ok, groupRef}` | copied unchanged from 点将台 |
| `getGroupDay` | `{groupRef, dateKey}` | §8.4 | `NOT_MEMBER` if the caller has no row for `groupRef`; `pos` only if `viewerDone`; date today or yesterday |
| `getFriendBoard` | `{dateKey}` | §8.4 | `full` or `selfOnly` by `boardListCap`; 60 s cache |
| `createRound` | `{spectrumId}` | `{roundId, target}` | `spectrumId` must exist in the server's content copy; target = crypto-random integer 5-95; `status: draft`; ≤ 20 per day per openid. Timeout 5 s |
| `setClue` | `{roundId, clueMode, clueItemId?}` | `{ok}` | host only (`NOT_HOST`); `clueItemId` must belong to the round's spectrum; stores `clueText` from content; `status: open` |
| `getRound` | `{roundId, groupRef?}` | role- and state-dependent (§8.4): open → `{left, right, clueText, guessCount, myGuess?}`; host → adds `target`; revealed → adds `target, mq, salt, selfHash, rows` | lazy auto-reveal: if `open` and now > `createdAt + 24 h`, reveal (or `noGuesses`) first. `ROUND_NOT_FOUND`, drafts are not found for non-hosts |
| `submitGuess` | `{roundId, pos, groupRef?}` | `{ok, late, guessCount, reveal?}` | integer 0-100; `OWN_ROUND`; `ALREADY_GUESSED`; > 7 days → `ROUND_EXPIRED`; after reveal → stored `late: true` and the reveal returned. Transaction increments `guessCount`; at the 8th on-time guess → reveal (`revealBy: count`). Appends a valid `groupRef` to `groupRefs` (≤ 10) |
| `revealRound` | `{roundId}` | `{reveal}` | host only; `TOO_FEW_GUESSES` below 2; idempotent |
| `sweepRounds` (timer `0 0 * * * * *`, hourly) | | | reveals `open` rounds older than 24 h (≥ 1 guess) or marks `noGuesses`; sends pending subscribe messages |
| `subscribeRound` | `{roundId}` | `{ok, granted}` | caller must be the host or have guessed; `NO_TEMPLATE` without config; idempotent `add` |
| `reportCard` | `{itemId, dateKey?, reason}` | `{ok}` | reason whitelist; ≤ 10 per day per openid |
| `track` | copied | | analytics batch ≤ 50, rate-limited |
| `cleanup` (timer `0 0 4 * * * *`) | | | retention (§13): deletes `daily_entries`, `player_stats` (stale), `group_members` (lastSeen), `group_daily`, `rounds`, `guesses`, `sub_grants`, `card_reports`, `anomalies`, `events`, `rate_limits` past their limits; keeps `daily_sets` (aggregates only) and `daily_card_stats` |

Reveal side effects (any path): compute `mq` (§3.5), set `status: revealed`, `revealedAt`, then send subscribe messages (best effort, ≤ 2 s inside a request; the rest by `sweepRounds`).

### 11.3 Error codes

`INVALID_INPUT`, `CARD_ORDER`, `CARD_DONE`, `LATE_SUBMIT`, `DAILY_UNAVAILABLE` (no set could be created; schedule and auto path both failed), `DAY_OPEN`, `ROUND_NOT_FOUND`, `ROUND_EXPIRED`, `OWN_ROUND`, `ALREADY_GUESSED`, `TOO_FEW_GUESSES`, `NOT_HOST`, `NO_TEMPLATE`, `NOT_MEMBER`, `NOT_GROUP`, `BAD_CLOUDID`, `RATE_LIMITED`, `UNAUTHENTICATED`, `FORBIDDEN`, `SERVER_CONFIG`, `INTERNAL`. Client copy for each is in §6 states.

### 11.4 Streak (PD-17)

In the transaction that completes a daily: `prev` = the latest `daily_sets._id` < `dateKey`. If `player_stats.lastCompleteDate == prev` → `curStreak + 1`, else 1; `bestStreak = max`; `lastCompleteDate = dateKey`; `totalDays + 1`; write `streak` onto the entry. Days with no published set are skipped automatically. `getDaily.myStreak.current` shows yesterday's streak all of today until today completes; it is 0 once a published day closed without a complete daily. Grace-window completions count for D.

### 11.5 Anti-cheat (PD-25)

Server-stored positions are the only input; all scores are computed server-side for boards. One submission per card, per round. Rate limits (copied `rate_limits`). Observe-only `fast` flag. No penalties. A second account can peek at the national median; accepted (no prizes).

---

## 12. Analytics events

Through our `track` function (copied: batched, flushed on result, on hide and every 20 s; top-level `sessionId`, `clientTs`; common props `isNewUser`, `contentVersion`, `appVersion`). `wx.reportEvent` is not used [P0 §8].

| Event | Props | Fires when |
|---|---|---|
| `session_start` | `scene`, `fromCard: none/daily/round/group`, `hasShareTicket` | cold start or new session (> 30 min background) |
| `card_open` | `cardKind: daily/round/reveal/group/notice`, `hasShareTicket`, `roundId?` | entry with share query, once per entry |
| `howto_view` | `auto:boolean` | 玩法 sheet shown |
| `daily_card_place` | `dateKey`, `idx`, `touches`, `nudges`, `ms` (first touch → confirm) | 就这儿 tapped |
| `daily_card_reveal` | `dateKey`, `idx`, `d`, `score`, `label`, `hasGroup`, `n` | reveal shown |
| `daily_complete` | `dateKey`, `total`, `durationMs`, `hasGroup`, `streak` | 5th reveal |
| `daily_result_view` | `dateKey`, `final:boolean` | day result shown |
| `share_tap` | `kind: daily/round/reveal/group/menu`, `dateKey?`, `roundId?` | share API called |
| `round_create` | `roundId`, `spectrumId`, `swapsFree`, `swapsAd` | `createRound` ok |
| `round_clue` | `roundId`, `clueMode`, `presetSwaps` | `setClue` ok |
| `round_guess` | `roundId`, `late`, `isFirstSession` | guess submitted |
| `round_reveal` | `roundId`, `by: host/count/timer`, `guesses`, `mq` | reveal (server-side) |
| `round_view` | `roundId`, `status`, `isHost` | round screen shown |
| `group_join` | `result`, `errCode?`, `scene`, `chatType?` | each `joinGroup` (never the openGId or `groupRef`) |
| `group_view` | `state`, `n?`, `hasMq` | group page shown |
| `friend_board_view` | `state`, `mode?` | friend board shown |
| `archive_view` | `items`, `state` | archive list shown |
| `archive_set_complete` | `dateKey`, `total`, `setsThisSession` | archive set finished |
| `bonus_card` | `itemId`, `score` | bonus card revealed |
| `distribution_unlock` | `dateKey`, `via: ad/nofill` | unlock granted |
| `card_report` | `itemId`, `reason` | report sent |
| `privacy_result` / `friend_scope_result` | copied | copied triggers |
| `marker_write` | `result: ok/privacyDenied/error` | KV write |
| `ad_request` / `ad_show` / `ad_reward` / `ad_close_early` / `ad_error` | `placement: bonus/distribution/swap/interstitial/banner`, `stub`, `errCode?` | ad lifecycle |
| `interstitial_show` | `setsThisSession` | |
| `subscribe_offer` / `subscribe_result` / `subscribe_send` (server) | `where: host/guess`, `result`, `errCode?` | copied pattern |
| `display_setting` | `largeText`, `highContrast`, `source` | switch changed |
| `daily_gen` / `finalize_day` (server) | `dateKey`, `source`, `finalCount`, `ms`, `failed?` | timers |
| `board_list` (server) | `view`, `mode`, `rows`, `bytes` | each board response |
| `error` | `where`, `code` | any error state shown |

**KPI definitions:** share rate = distinct `dateKey`+user with a `share_tap` (kind daily/group) ÷ `daily_complete`. Card-open-to-play = `card_open` followed by `daily_card_reveal` or `round_guess` in the same session ÷ `card_open`. Round reveal rate = `round_reveal` with `guesses ≥ 2` ÷ `round_clue`. Archive sets per session = `archive_set_complete` ÷ sessions with ≥ 1 `archive_view`. D1/D7 as 点将台 §15. Group activation = groups with `n ≥ 3` on a day ÷ groups with `n ≥ 1` (server query on `daily_entries` × `group_members`).

---

## 13. Privacy data inventory [COMPLIANCE]

| Data | Purpose | Stored | Retention |
|---|---|---|---|
| OpenID | identify entries, rounds, groups; one answer per card | cloud DB | 180 days after last activity (as 点将台 D7) |
| Card positions and timestamps | scoring, aggregates, boards | `daily_entries`; aggregates in `daily_card_stats`, `daily_sets` | entries 180 days; aggregates kept (no openid) |
| Round data (host, target, clue choice, guesses) | host mode | `rounds`, `guesses` | 180 days |
| Group id and membership (openGId ↔ openid) | group stats | `group_members` (client sees only `groupRef`) | 180 days after last seen |
| Group daily stats (`groupRef`, n, 默契度) | trend | `group_daily` | 180 days |
| KV presence marker `kd` = `{d, s}` | appear in friend/group lists | WeChat user cloud storage | overwritten daily |
| Friends' and group members' nickname/avatar/openid | display names in boards and reveals | **not received by us**; open data domain only | n/a |
| Hashed rows (`h`, scores, positions) | boards | sent to clients per request | per day / per round salt |
| Streak stats | display | `player_stats` | 180 days after last update |
| Subscribe grants | the one reveal notice the user asked for | `sub_grants` | 180 days |
| Content reports (item, reason, no text) | content quality | `card_reports` | 180 days |
| Analytics events, anomaly flags | KPIs, bugs | `events`, `anomalies` | 180 days |
| Display settings, local archive results | UX | device only | until changed / uninstalled |
| Ad data | ad delivery | WeChat ad SDK | per WeChat |

**Not collected:** nickname or avatar to our servers, phone, location, album, contacts, microphone, camera, clipboard, any user-typed text.

**用户隐私保护指引 declarations:** **微信朋友关系** (used by `setUserCloudStorage`, `getFriendCloudStorage`, `getGroupCloudStorage`), purpose: "用于在好友榜、本群页和刻度题揭晓中显示好友与群友的昵称和成绩". The guide also describes the subscribe message (opt-in), the content feedback and the retention above. Enable the official privacy popup (founder, H5). Data stays in mainland WeChat Cloud.

**Minors / anti-addiction:** no chat, no UGC, no payments, short sessions. Real-name and anti-addiction obligations for IAA mini games are applied by release in its rules check (as cleared for 点将台 in D14; re-confirmed per app in the handoff, H12).

---

## 14. Platform verification and founder device pass [SPIKE]

All APIs were verified for 点将台 [P0]; the same items need a real-device run for this AppID. The device pass runs after QA and the release pack, before submission, on ≥ 1 iOS and ≥ 1 Android phone (base library ≥ 3.8.8), with three mutual-friend accounts in a test group, privacy popup and 微信朋友关系 declared.

| # | Check | Exit criterion | Fallback (already specified) |
|---|---|---|---|
| E1 | Group card → `getGroupEnterInfo` → `joinGroup` decrypt; single chat → no context | decrypted `opengid` on both platforms | no group page (explainer only); daily, friend board and rounds unaffected |
| E2 | Friend and group rows carry `openid`; whether keyless friends are returned | rows have `openid` | rows render anonymously ("群友 A"); boards stay server-ranked; names unavailable |
| E3 | Hash join of 500 rows in the open data domain < 50 ms (Android); largest working `callFunction`/`postMessage` payload | ≥ 1,000 friend rows pass | lower `boardListCap`; `selfOnly` above it |
| E4 | Privacy popup and friend-scope prompt locations; refusal path; `openSetting` recovery | as §8.6; no prompt at launch | own dialog via `onNeedPrivacyAuthorization` |
| E5 | Rewarded no-fill with `disableFallbackSharePage: true` shows no share page; interstitial 2001/2002 | as §9 | stub path verified; real check with the first ad units |
| E6 | Timers: `genDaily` 23:00, `finalizeDay` 00:40, `sweepRounds` hourly, `cleanup` 04:00 fire once each; double-fire is a no-op; `finalizeDay` time with a synthetic 50k entries | within timeout | raise timeout; lazy finalize path covers refs |
| E7 | Subscribe: accept → exactly one notice at reveal; opens `r=<id>`; no template → no offer | as §7.4 | feature hidden |
| E8 | Ruler feel: drag latency, nudge, edges (0 and 100 reachable), one-thumb use on the smallest and largest phones; PC WeChat | no missed touches; ends reachable | layout fix (must-fix) |
| E9 | Large text and high contrast at 320 × 568 and PC WeChat | no clipping | layout fix (must-fix) |
| E10 | Banner (once 流量主 exists) only on allowed states with ≥ 24 pt gap | no overlap | banner stays off |

Results go in a dated note under `docs/kedupan/` and this table is updated by the CTO.

---

## 15. Edge cases

1. **Offline at launch:** home shows the offline daily state; the archive list shows its cached page; the howto works; card play needs the network (the reveal is server data).
2. **Offline at confirm:** position kept as `pending`, retried on 重试, `onShow` and launch; the card reveals only after the server accepts. If the server already has a position (another device), it wins (`CARD_DONE`).
3. **Double tap / retry on 就这儿:** idempotent: the same `idx` returns `CARD_DONE` with the stored reveal; the histogram is incremented once.
4. **Second device or reinstall:** `getDaily.mine` restores progress; answered cards are locked.
5. **Midnight:** a daily with `firstAt` on D can finish until D+1 00:30; after that `LATE_SUBMIT` and the client offers the archive later. The home card refreshes to the new issue on `onShow` when `serverNow` crosses midnight. Device clock never used.
6. **Card replaced by ops mid-day:** clients holding the old card get `cards` with the new item from `getDaily`; answers already given to the old card stay valid for its index (the card score uses the histogram of the card at that index; the replaced card's histogram restarts). Logged in `edits`.
7. **Very early in the day (n small):** the prior (W = 10) dominates; "和全国 x%" hidden below 30; national label "全国 (样本少)" below 30.
8. **Group with 1-2 completers:** no 默契度 (needs 3); 群内默契分 needs ≥ 2; group ● needs ≥ 1 other member's answer for that card.
9. **Group context present but the user is not yet counted** (first entry today): `joinGroup` creates the membership; the user's dailies count from now on, including today's.
10. **User in many groups:** each group page counts them; no cross-group view (PD-22).
11. **Over the friend cap:** `selfOnly` mode; group page caps at 500 rows plus the caller.
12. **Host never reveals:** auto at 24 h (≥ 1 guess) or `noGuesses`; hourly sweep; lazy reveal on any read after 24 h.
13. **Two guessers hit the 8th guess simultaneously:** the transaction serialises; exactly one reveal; the 9th becomes `late` if it lands after.
14. **Guess after reveal:** stored `late`, excluded from 默契值 and 最懂你, shown dashed.
15. **Host opens own card:** host view; cannot guess (`OWN_ROUND`).
16. **Round card forwarded to another group:** works; guesses from both groups count; each group's page lists the round if a member guessed via that group's card.
17. **Round draft abandoned** (no `setClue` within 30 min): discarded by `sweepRounds`; never shareable.
18. **Content version mismatch:** the server always sends card and clue text; an old client renders it; a spectrum id unknown to an old client in host mode cannot be created (the client only offers its own library).
19. **Rewarded ad closed early / no fill / no ad units:** §9 rules; nothing core depends on ads.
20. **Privacy or scope refused:** every view renders anonymously; nothing re-prompts; play unaffected.
21. **Same score tie on boards:** earlier completion (`t`) wins; group page ties also by `t`.
22. **Small screens / large system font:** ruler stays full-width; prompt wraps to 2 lines; content scrolls; nothing clipped.
23. **`finalizeDay` timeout at scale:** refs are frozen first (cheap) so 定分 is always right; the percentile appears when the paged job completes (it resumes from a stored cursor on the next run).
24. **Schedule exhausted:** auto path picks unused items (§4.2) and logs an alert; if even that fails, `DAILY_UNAVAILABLE` and the archive remains.
25. **App killed during a reveal:** the position is stored; on relaunch the reveal shows from `getDaily`.

---

## 16. Founder Handoff (items only the founder can do; release compiles them into `docs/kedupan/release/HANDOFF.md`)

None blocks the build; each dependent feature degrades gracefully until done.

| # | Founder item | Needed for | If not done yet |
|---|---|---|---|
| H1 | **Register a new mini game AppID** (小游戏) under the founder's Beijing company: name 群友刻度盘 (fallbacks 刻度默契 / 群友刻度尺 / 同频刻度), introduction, category (休闲/益智-type; release proposes the exact category), avatar from the release pack | everything | build runs in the fake-`wx` harness and a test AppID only |
| H2 | **WeChat 认证** for the new AppID (fee paid by the founder) | submission, 流量主 | submission waits |
| H3 | **备案** (小程序/小游戏备案) with the service description from the release pack | submission | submission waits |
| H4 | **软著** submission with the release pack materials (if wanted for the category or stores) | optional per category | n/a |
| H5 | Declare **微信朋友关系** in the 用户隐私保护指引 and enable the official privacy popup | names on boards and reveals | boards and reveals render anonymously; KV writes fail with 112 |
| H6 | Create the **cloud environment**; deploy functions; set `GROUP_REF_PEPPER` (random, 32+ chars, never pasted in chat), `TZ=Asia/Shanghai`, timeouts; upload the 4 timer triggers; create collections and paste `database/rules.json`; add indexes; set `LAUNCH_DATE_KEY` | everything online | daily, rounds and boards unavailable |
| H7 | **Subscribe template**: pick a one-time template matching "刻度题揭晓了" (a topic field, a result field, a time field) and put its ID and field keys in `app_config.subscribe` | §7.4 | offer hidden |
| H8 | **流量主** activation, then ad unit IDs (rewarded, interstitial, banner) into config; banner on when wanted | §9 | no-fill behaviour; banner off |
| H9 | **Content sign-off**: release's final content review of the ≥ 300 spectra / ≥ 3,000 items against §4.5, with the founder's spot check | submission | submission waits |
| H10 | **Device pass** (§14, E1-E10) with minigame-dev and backend on call | submission | submission waits |
| H11 | **In-app search** before registration: 刻度, 刻度盘, 默契刻度, 同频, 心有灵犀 刻度, 波长, Wavelength, plus playing the top 2 默契 games for 5 minutes; and **name availability** | name choice | fallback name |
| H12 | Confirm **版号 / 自审自查** status for an IAA-only casual mini game with no payments (as cleared for 点将台 in D14) and real-name/anti-addiction settings in MP | submission | submission waits |
| H13 | **Approve the upload and release** | submission | n/a |

---

## 17. Acceptance criteria (v1)

QA tests these. Tests may use the copied fake-`wx` harness, the fake DB and controlled time.

**Scoring (core)**
1. `core/score.js` returns exactly the §3.1 test vectors (0→100, 0.5→98, 1→97, 2→95, 2.5→93, 10→75, 20→50, 39.5→1, 40→0, 73→0) and the label boundaries (2 → 心有灵犀, 2.5 → 很同频, 6 → 很同频, 6.5 → 差不多, 12 → 差不多, 20 → 有点偏, 20.5 → 想法独特).
2. The median of a histogram follows §3.2 for odd and even counts (unit tests incl. M = 1, 2, 11, 12, all-equal, all at 0 or 100).
3. With 0 real positions, `R_c` equals the anchor; with 1 real position at 0 and anchor 60, `R_c` = 60; with 1,000 real positions all at 30 and anchor 90, `R_c` = 30 (W = 10 prior).
4. Daily total = sum of the 5 card scores, 0-500; band boundaries 450/380/300/200 map as §3.3.
5. Group: for members' positions {10, 20, 90} on a card, member 1's leave-one-out reference is 55 (median of 20 and 90); MAD and 群默契度 match §3.4 hand-computed fixtures; 群默契度 is null for n = 2 and computed for n = 3.
6. Round: 默契值 = rounded mean of on-time scores; late guesses excluded; 最懂你 tie → earliest.
7. Client and server produce identical scores for 1,000 random fixtures (drift test between `game/core` and the synced function copies).

**Content**
8. `spectra.v1.js` validates: ≥ 300 spectra, each with ≥ 10 items; unique stable ids; `left`/`right` 1-4 chars; `text` 1-10 chars; anchors integers 5-95; category quotas of §4.3 met; no forbidden term (list in `forbidden.v1.js`, incl. 波长, Wavelength, 麻将, 赌, 彩票, 喝酒, 香烟, 男生, 女生, 胖, 丑, 省份, 民族, 宗教, 老头乐, plus a brand list maintained by the content owner) appears in any user-visible string, share title or store copy.
9. `schedule.v1.js` has ≥ 365 days; each day: 5 distinct categories and spectra, card 1 tagged `easy`, ≥ 1 `split`; no item appears twice; no spectrum within 21 days; seasonal and festival tags placed per §4.2 (tool and CI check).
10. The content review sheet (`docs/kedupan/content-review.md`) lists every spectrum with author, date, reviewer and result; every spectrum has a product-ux review mark and QA's rule check (release check).
11. Every item sent to a client is the server copy's text (`getDaily`, `getArchiveDay`, `getRound`), so a client on an older content version shows the correct text.

**Daily flow**
12. Two users on the same Beijing date receive the same `issueNo` and the same 5 cards from `getDaily`.
13. `getDaily` never returns `anchor`, histogram data or `refs` for cards the caller hasn't answered.
14. The ruler shows no needle until the first touch; 就这儿 is disabled until then; positions are integers 0-100; both ends are reachable by drag and by nudge; ‹ › move exactly 1 step and clamp.
15. `submitCard` rejects non-integers, values outside 0-100, wrong `idx` (`CARD_ORDER`), and a second answer for a card (`CARD_DONE` returning the stored reveal); the histogram `n` grows by exactly 1 per first answer (concurrency test with 2 parallel identical calls).
16. A card reveal shows ▼, ◆ and (with group context and ≥ 1 other member answer) ● and member dots, the label, "+score", the "左边/右边 N 格" line, and "和全国 x%" only when the card has ≥ 30 answers.
17. 心有灵犀 (d ≤ 2) triggers the confetti, chime and `vibrateShort`; other labels don't.
18. After 5 cards the day result shows the live total and band, the 5 mini rulers, 今日最有争议 (per §3.3), the streak line (≥ 2), and "(实时)"; after D+1 00:30 it shows "(定分)" with frozen refs and, after `finalizeDay`, "超过全国 x%" (≥ 30 complete dailies).
19. Scores shown on the result, group page and friend board for the same user and moment are consistent with the same `R_c` values (fixture test).
20. A daily started on D at 23:59 accepts cards until D+1 00:30 and returns `LATE_SUBMIT` at 00:31; incomplete days never appear on boards or in streaks.
21. In-progress dailies resume at the first unanswered card after kill/relaunch and on a second device.
22. The date key is correct at 15:59:59 and 16:00:00 UTC with the function at `TZ=UTC` and with `TZ` unset; every function config sets `TZ=Asia/Shanghai` and an explicit timeout.
23. `genDaily` double-fire or a racing lazy `getDaily` creates exactly one `daily_sets` document; a call with an OPENID returns `FORBIDDEN`.
24. Replacing a card in `daily_sets` in the console is reflected by the next `getDaily`; earlier answers for that index remain; `edits` records it.
25. `finalizeDay` is idempotent; after it runs, `final[5]`, `finalHist` and `finalCount` exist; a read after 00:30 before the timer computes and stores `final[5]` lazily; with a synthetic 50k entries it completes within its timeout or resumes from its cursor.

**Host rounds**
26. `createRound` returns a target 5-95 (10,000 draws: min ≥ 5, max ≤ 95, roughly uniform: each decile 8-12%) only to the host; `getRound` never returns `target` to a non-host before the reveal (server test).
27. The create screen offers 3 spectra, 1 free 换一组, then ≤ 3 rewarded 换一批; clue presets are 6 items from the chosen spectrum with 1 free 换一批; 发到群里 is disabled in preset mode until an item is chosen.
28. `setClue` rejects an item from another spectrum and a non-host caller; the share query contains only `r=<roundId>`.
29. No screen in the game accepts typed text (code search: no `wx.showKeyboard`, no text input); no user-authored text is ever displayed (only curated content and WeChat nicknames inside the open data domain).
30. A guesser sees the spectrum, the clue (or "提示在群聊里…") and the count, never other guesses or the target, before the reveal.
31. `submitGuess`: one per user per round (`ALREADY_GUESSED`), host rejected (`OWN_ROUND`), > 7 days `ROUND_EXPIRED`, after reveal stored `late` and returns the reveal.
32. Reveal paths: host 揭晓 works only with ≥ 2 on-time guesses (`TOO_FEW_GUESSES` otherwise); the 8th on-time guess reveals automatically; after 24 h a round with ≥ 1 guess reveals (sweep and lazy read) and one with 0 guesses becomes `noGuesses`; concurrent 8th guesses produce exactly one reveal.
33. The reveal view shows the target, all guesses (late ones dashed), 本题默契值 and 最懂你 per §3.5; the host row is labelled 出题人 with no score.
34. Draft rounds without a clue after 30 min are discarded and are `ROUND_NOT_FOUND` for others.
35. `createRound` is limited to 20 per day per user (`RATE_LIMITED` with the §6.5 copy).

**Archive and extras**
36. The archive lists closed days only (never today before D+1 00:30; `getArchiveDay` returns `DAY_OPEN`), newest first, 30 per page.
37. Archive play scores against the frozen `final[5]`, shows no group dots, is unranked, stores the result locally and never changes boards or streaks.
38. A day played as the daily opens as a read-only review with positions, finals, 定分 and percentile.
39. 加一题 is available only after a complete daily, delivers a closed-day item the user hasn't answered, is labelled "加一题 · 不计分", and is limited to 3 per day.
40. 全国分布 unlocks histograms for one set only after `isEnded` (or the no-fill grant); for today it never includes cards the user hasn't answered.

**Group page and boards (server-authoritative)**
41. `joinGroup` behaves exactly as 点将台 AC 62 (one `group_members` doc per openGId+openid, idempotent, `groupRef` ≠ openGId, errors leave no doc); `wx.getShareInfo` is never called.
42. `getGroupDay` returns rows only for members with a complete daily, `pos` only if the caller completed, `mq` only for n ≥ 3, and `NOT_MEMBER` for a `groupRef` the caller doesn't belong to.
43. **A tampered KV value never changes a displayed score or rank** (harness: a KV `kd` of `{s:500}` for a user with no entry is not shown on the group page or round reveal, and shows only as "好友自报" without rank in `selfOnly`; ranks equal the order computed from `daily_entries` alone).
44. Server rows without an open data domain match render as "群友 A/B/C" in a stable order; the viewer's row is always marked 你.
45. 最同频 is computed only in the open data domain, only for a viewer who completed the day, using the §3.4 rule (fixture test), and names a matched member only.
46. The friend board ranks by national score then completion time; switches to `selfOnly` above `boardListCap`; `pos` only for a viewer who completed.
47. The 7-day trend shows `—` for days with n < 3; the rounds list shows the last ≤ 10 rounds that received a guess carrying this `groupRef`.
48. Every group-page and board state in §6.8 renders as specified, and none blocks returning home or playing.
49. **Raw openids never reach the client:** in a scripted session (daily → group entry → group page → friend board → round create → guess → reveal), no `callFunction` response or `postMessage` payload contains a test openid, an openGId or a field named `openid`/`openGId`; the same user's `h` differs between two dates and between two rounds; events never contain an openGId or `groupRef`.

**Sharing** [COMPLIANCE]
50. Nothing in the game is granted or unlocked by sharing (code search plus a manual test of every share entry point).
51. Every share starts from a user tap or the capsule menu; nothing calls `shareAppMessage` automatically.
52. The daily share image and title contain no needle positions, medians or group numbers; prompts and per-card label blocks only (image inspection test with fixtures).
53. Round cards before the reveal never contain the target; reveal cards contain no names.
54. Card entries route per §7.5 (each query, with and without a ticket, cold and warm start); a warm start mid-card defers with the toast.

**Ads** [COMPLIANCE]
55. No ad (any format) appears in the daily card flow, on card reveals, as an interstitial on the day result, or in the host-round flow except the rewarded 换一批 (harness: ad calls captured per screen).
56. Rewards are granted only on `isEnded === true`; early close grants nothing with the message.
57. No-fill or load error grants the reward at most once per placement per day with "暂无广告，本次免费"; the next failure shows "暂无广告，请稍后再试" and grants nothing.
58. Every rewarded instance uses `disableFallbackSharePage: true`; `useFallbackSharePage: true` is treated as no-fill; a launch with `wxad_fallback_share=1` grants nothing.
59. Interstitials appear only on 再来一期 / 返回列表 after a completed archive set, follow the §9 caps (every 2nd set, not before 3 lifetime sets, ≥ 120 s, ≤ 6/day), honour remote config with clamps, and skip 2001-2003 silently.
60. The banner shows only on the allowed screens and states when `app_config.ads.banner.enabled` and a unit ID exist, with a ≥ 24 pt gap and no overlap; default off.
61. Stub mode logs ad events with `stub: true`; production config has stub off (release check).

**Subscribe message**
62. Without a template ID the offer never renders and `requestSubscribeMessage` is never called.
63. With a template ID: offered only on the host waiting view and after a guess, called only from the 提醒我 tap; `accept` stores one grant per (round, user); at the reveal exactly one message per grant is sent (transaction test with two parallel reveal paths), containing no names or openids and opening `r=<roundId>`; `ban`/20004 hides the offer on this device.

**Privacy and authorization**
64. No login, user-info, privacy or scope prompt at first launch or during a daily before completion; a full daily, archive set and host round are possible with zero authorizations.
65. The first privacy prompt follows a completed daily's marker write or a group page / friend board / reveal tap. With privacy or scope refused, all of those views render anonymously with the passive [去设置开启]; nothing re-prompts; enabling in settings re-renders on return.
66. The KV marker holds exactly `{d, s}` under the single key `kd`; it is written only after privacy agreement and never used for ranking.
67. `cleanup` deletes each collection per §13 retention and keeps `daily_sets` and `daily_card_stats`; idempotent; the privacy guide text states 180 days.
68. All collections deny direct client reads and writes (rules test); every function derives identity from the context OPENID; no AppSecret, `session_key` or `code2Session` string appears in function code.

**UX and platform**
69. On 375 × 812 with the test capsule rect, nothing tappable overlaps the capsule row; the ruler and primary buttons sit in the bottom 45% above the safe area.
70. Touch targets ≥ 48 × 48 pt; the ruler touch band ≥ 64 pt tall (≥ 80 pt in large text); body ≥ 16 pt, prompt ≥ 28 pt, scores ≥ 40 pt; layouts hold at 320 × 568 and 430 × 932 without clipping.
71. Large-text and high-contrast modes meet §6.11 (sizes; ≥ 7:1 text, ≥ 3:1 markers in high contrast; ≥ 4.5:1 body text in default); markers differ by shape (▼ ◆ ● ▮); share cards always use the standard look.
72. Every network-backed screen shows its loading, empty and error states with 重试 as specified in §6; errors never trap the player.
73. The 玩法 sheet auto-opens once on first launch and the first card shows one coach bubble; neither appears again.
74. Main package ≤ 4 MB including `opendata/`; total ≤ 30 MB (CI); the only image files are the icon and the static share fallback.
75. No file under `apps/kedupan/` requires a path outside `apps/kedupan/` (CI code search); every `require` target is a `.js` file; content is shipped as `.js` modules.
76. Mute persists across launches and silences all audio.
77. `wx.reportEvent` is never called; every §12 event fires once per trigger with its props, a top-level `sessionId` and `clientTs` (harness session: card open → daily ×5 → share → group page → round create → guess → reveal → archive ×2 → interstitial).
78. The KPI definitions in §12 can each be computed by a query on the harness data (QA provides one query per KPI).
79. "这张卡有问题" offers exactly three reasons and no text field, stores a `card_reports` row, is limited to 10 per day, and grants nothing.
80. The streak follows §11.4 (server unit tests: consecutive → +1; skipped published day → 1; unpublished day → skipped; grace completion counts for D; partial day doesn't count; duplicate completion doesn't double-count); no reward, freeze or reminder is tied to it (code and copy review).
81. Positions and outcomes never depend on ads watched, session count or new-user status: the same answers produce the same scores under every condition (harness).
82. The `fast` anomaly flag is written when card 5 completes < 6 s after card 1 and never changes any score, rank or streak.

---

## 18. Code reuse map (copy, never import; PD-26)

`apps/kedupan/` layout mirrors 点将台:
```
apps/kedupan/
  game/            game.js, game.json (portrait, openDataContext: "opendata"), project.config.json
    core/          date.js, rng.js (copied); score.js, config.js, content.js (new); content/spectra.v1.js, schedule.v1.js, forbidden.v1.js
    js/            main.js, controller.js, vm.js, store.js, api.js, mock-server.js, ads.js, privacy.js, share.js, analytics.js, audio.js, util.js, render/ (layout, theme, widgets, fmt, overlay copied; ruler, card, result, round, group, archive, settings new)
    opendata/      index.js, draw.js, board.js, sha256.js (copied, adapted for group/friend/round views)
    tests/         harness.js, wechat-loader.js, smoke and render tests (copied pattern)
    tools/         build-schedule.js, validate-content.js
  cloudfunctions/  common/ (store.js, util.js, coreapi.js copied/adapted), one folder per §11.2 function, scripts/sync-core.js, database/rules.json, tests/
```

| Source in `apps/dianjiangtai/` | Use in kedupan |
|---|---|
| `game/core/date.js`, `rng.js` | copy unchanged |
| `game/js/render/layout.js` (capsule-aware layout), `widgets.js`, `overlay.js`, `theme.js` | copy, re-skin (direction §6) |
| `game/js/ads.js`, `privacy.js`, `share.js`, `analytics.js`, `audio.js`, `store.js`, `api.js` | copy, adapt placements and events |
| `game/opendata/*` | copy; new views |
| `game/tests/harness.js`, `wechat-loader.js` | copy |
| `cloudfunctions/common/store.js`, `util.js` | copy |
| `cloudfunctions/joinGroup` | copy unchanged |
| `cloudfunctions/getBoard` (hashing, cap, cache), `track`, `cleanup` | copy and adapt |
| `cloudfunctions/scripts/sync-core.js`, `database/rules.json` pattern | copy and adapt |
| `daily_seeds` idempotent-create pattern | reused for `daily_sets` |

Not reused: sim, sheet, draft, search, gates, seed bank (no seeds here).

---

## 19. Post-launch backlog (not v1, not promised)

- Typed clues (≤ 8 characters) through `msgSecCheck` v2 scene 2 with a report button and takedown (PD-7).
- Cross-group percentile ("本群默契度超过全国 80% 的群", PD-22).
- Updatable round cards if WeChat adds suitable templates (PD-14).
- Save card to album (PD-15).
- Themed weeks and festival specials beyond schedule tags.
- Screen-reader labels.

---

## Appendix A. Seed spectra (60, original; tone reference for the content owner)

Format: `left ↔ right` (category): sample items. Anchors are set during writing.

1. 冷 ↔ 热 (吃喝): 火锅, 冰粉, 温开水
2. 清淡 ↔ 重口 (吃喝): 白粥, 麻辣烫, 蒸蛋
3. 快手 ↔ 费工 (吃喝): 泡面, 包饺子, 红烧肉
4. 早饭 ↔ 夜宵 (吃喝): 油条, 烤串, 煎饼
5. 家常 ↔ 讲究 (吃喝): 番茄炒蛋, 拔丝地瓜, 清蒸鱼
6. 解渴 ↔ 解馋 (吃喝): 绿豆汤, 奶茶, 柠檬水
7. 软 ↔ 脆 (吃喝): 年糕, 薯片, 苹果
8. 便宜 ↔ 贵 (日常): 一把雨伞, 一张电影票, 一次理发
9. 小事 ↔ 大事 (日常): 忘带钥匙, 搬家, 手机没电
10. 轻松 ↔ 累人 (日常): 洗碗, 大扫除, 逛超市
11. 无聊 ↔ 有趣 (日常): 排队, 拼图, 等快递
12. 安静 ↔ 热闹 (日常): 图书馆, 菜市场, 公园早上
13. 必需 ↔ 可有可无 (日常): 雨伞, 充电宝, 闹钟
14. 省时 ↔ 费时 (日常): 网上缴费, 包粽子, 叠衣服
15. 常见 ↔ 少见 (天气自然): 彩虹, 流星, 双黄蛋
16. 舒服 ↔ 难受 (天气自然): 梅雨天, 秋高气爽, 三伏天
17. 安静 ↔ 壮观 (天气自然): 小雪, 雷阵雨, 海浪
18. 温顺 ↔ 凶猛 (动物): 兔子, 鹅, 猫
19. 好养 ↔ 难养 (动物): 金鱼, 仓鼠, 鹦鹉
20. 可爱 ↔ 吓人 (动物): 仓鼠, 蜘蛛, 章鱼
21. 慢 ↔ 快 (动物): 蜗牛, 乌龟, 猎豹
22. 吵 ↔ 安静 (动物): 鹦鹉, 金鱼, 小狗
23. 实用 ↔ 好看 (居家物件): 保温杯, 窗帘, 抱枕
24. 一次性 ↔ 用很久 (居家物件): 一次性筷子, 毛巾, 铁锅
25. 好收纳 ↔ 占地方 (居家物件): 折叠椅, 跑步机, 行李箱
26. 老派 ↔ 新潮 (物件科技): 收音机, 智能手表, 搪瓷杯
27. 好用 ↔ 难用 (物件科技): 遥控器, 自助结账机, 开瓶器
28. 新手友好 ↔ 高手专属 (物件科技): 洗衣机, 单反相机, 缝纫机
29. 好闻 ↔ 难闻 (感官): 榴莲, 新书, 雨后泥土
30. 好听 ↔ 刺耳 (感官): 闹钟, 下雨声, 指甲刮黑板
31. 顺滑 ↔ 粗糙 (感官): 丝巾, 砂纸, 毛衣
32. 软 ↔ 硬 (感官): 枕头, 床板, 棉花糖
33. 好学 ↔ 难学 (休闲爱好): 骑自行车, 游泳, 书法
34. 养生 ↔ 刺激 (休闲爱好): 太极拳, 过山车, 钓鱼
35. 适合一个人 ↔ 适合一群人 (休闲爱好): 拼图, 打羽毛球, 爬山
36. 室内 ↔ 户外 (休闲爱好): 下棋, 放风筝, 瑜伽
37. 省心 ↔ 折腾 (出行): 坐高铁, 自驾游, 转两趟公交
38. 慢悠悠 ↔ 赶时间 (出行): 散步, 早高峰, 骑车上班
39. 想去 ↔ 不想去 (出行): 海边, 游乐园, 排长队的景点
40. 简单 ↔ 烧脑 (学习工作): 数独, 背单词, 填表格
41. 枯燥 ↔ 有趣 (学习工作): 抄笔记, 做实验, 开会
42. 正式 ↔ 随意 (学习工作): 西装, 卫衣, 拖鞋
43. 紧张 ↔ 放松 (心情感受): 体检, 面试, 泡脚
44. 尴尬 ↔ 自在 (心情感受): 认错人, 独自吃饭, 唱生日歌
45. 平淡 ↔ 隆重 (心情感受): 生日, 周末, 中秋节
46. 小确幸 ↔ 大惊喜 (心情感受): 口袋里发现零钱, 下班, 收到礼物
47. 常见 ↔ 稀罕 (童年回忆): 跳房子, 弹珠, 游戏机
48. 简单 ↔ 讲究 (童年回忆): 冰棍, 生日蛋糕, 糖画
49. 熟悉 ↔ 陌生 (童年回忆): 黑白电视, 跳皮筋, 铁皮青蛙
50. 适合夏天 ↔ 适合冬天 (日常): 凉席, 围巾, 西瓜
51. 适合早上 ↔ 适合晚上 (日常): 跑步, 泡澡, 看书
52. 容易坚持 ↔ 很难坚持 (日常): 早起, 记账, 喝水
53. 甜 ↔ 不甜 (吃喝): 西红柿, 玉米, 葡萄
54. 下饭 ↔ 不下饭 (吃喝): 土豆丝, 凉拌黄瓜, 红烧茄子
55. 小份 ↔ 大份 (吃喝): 一碗面, 一份炒饭, 一个包子
56. 容易 ↔ 很难 (休闲爱好): 包饺子, 折纸鹤, 吹口哨
57. 有用 ↔ 没用 (居家物件): 抽屉里的旧钥匙, 说明书, 备用纽扣
58. 新 ↔ 旧 (物件科技): 二维码, 公用电话, 电子书
59. 吵 ↔ 静 (日常): 装修声, 空调声, 冰箱声
60. 普通 ↔ 特别 (心情感受): 周一, 第一场雪, 下班路上的晚霞

Worked example of the review rules: a draft item "小霸王学习机" for spectrum 47 is rejected by rule 5 (brand) and replaced by the generic "游戏机"; "南方的冬天" for spectrum 16 is rejected by rule 3 (region); "加班" for spectrum 43 is rejected by rule 9 (negative tone).
