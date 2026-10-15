# 传画接龙 (working title): spec, v1 complete release

Status: **v1 complete-release scope (2026-10-15).** The founder approved building this game (F-1, relayed by the CTO). Under the constitution (Art. 4) there are no phases, MVP cuts or interim approvals: this spec is the whole release. The founder sees the result at the Founder Handoff (§18), before the device pass and submission. Author: product-ux.
Type: WeChat 小游戏 (mini game). Slug: `chuanhua`. Companions: `docs/chuanhua/direction.md` (vision, pillars, tone, art, risks) and **`docs/chuanhua/decisions.md`** (dated decision log: date, decision, reason, alternatives; IDs PO-n are referenced throughout this spec).

Sources: `research/2026-10-15-new-ideas/kept-ideas.md` §0, §3, §5-6 (cited [KI]); `kept-ideas-alt.md` §3 (cited [KA]); `docs/dianjiangtai/spec.md` (cited [DJT]) and `apps/dianjiangtai/` (the reference implementation, copied, never imported); `docs/dianjiangtai/phase0-platform.md` (cited [P0]); `docs/constitution.md` (cited [CON]).

Labels:
- **[VERIFY]**: a platform fact taken from official docs or research but not yet exercised on a real phone or in a real console. Every one is listed in §16 with a fallback and is proven in the **founder's device pass** (§16.2) before submission.
- **[COMPLIANCE]**: compliance-sensitive (user data, UGC, sharing rules, ads, minors).
- **INFERENCE**: our own judgement, with no published benchmark behind it.

Scope: everything above §20 is **v1**. §20 is the post-launch backlog and is out of v1 scope.

---

## 0. Decision summary

All product decisions are logged in `docs/chuanhua/decisions.md`. The load-bearing ones:

| ID | Decision | § |
|---|---|---|
| F-1 | Founder approved building 传画接龙 (relayed by the CTO, 2026-10-15) | whole doc |
| PO-1 | **Fixed chain length: 6 棒** after the prompt (画 · 猜 · 画 · 猜 · 画 · 猜), so 3 drawings and 3 descriptions; the chain ends on a sentence | §3.1 |
| PO-2 | The **starter draws 第 1 棒** right after picking the prompt | §3.2 |
| PO-3 | Max **3 棒 per person per chain**, never two in a row, so **2 people can finish a chain** | §3.4 |
| PO-4 | Claim lock **150 s** server-side; on screen **60 s to draw, 45 s to describe** | §3.5 |
| PO-5 | Chain lifetime **48 h**; the starter may **揭晓** early at ≥ 4 passed 棒; at 48 h a chain with ≥ 4 passed 棒 reveals, otherwise it ends as 未传完 | §3.6 |
| PO-6 | Chains are **bound to one WeChat group**; no public chains, no strangers | §3.3 |
| PO-7 | The **full reveal is for participants only**; other group members get a text teaser and 同题再传 | §3.7, §8.9 |
| PO-8 | **No names** on steps (第 N 棒); the viewer's own steps are marked 你 | §8 |
| PO-9 | **No open data domain, no boards, no ranking of people**; group stats are aggregate counts | §10 |
| PO-10 | **Strokes are the upload; the server rasterises the PNG** that is moderated; clients render from strokes; PNGs never reach any client | §5, §6 |
| PO-13 | Moderation: text **synchronous `msgSecCheck` v2**, drawings **`mediaCheckAsync` v2 + push**; `review` = blocked; **fail closed** everywhere | §6 |
| PO-14 | Mock moderation only in non-production environments, with a daily budget guard for the 100-call pre-publish quota | §6.6 |
| PO-16 | A report **hides the item for everyone at once** | §7.1 |
| PO-19 | **180-day retention** for all UGC, moderation logs and reports | §7.5 |
| PO-21 | Daily hook **今日起点** (3 shared prompts); no solo mode | §4 |
| PO-24 | Share images contain **no user drawings** (text and our own art only); no save-to-album | §9 |

---

## 1. Goal, target user, scope

**Goal.** Launch a complete, compliant drawing-telephone game that lives inside WeChat groups: one prompt is passed down the group as drawing, description, drawing and so on, and the payoff is the reveal of how far it drifted. Post-launch KPIs (INFERENCE, no gate): chain completion (≥ 4 passed 棒 within 48 h) ≥ 60% of chains whose 第 1 棒 passed; ≥ 2.5 passed 棒 per active player per day; invite-card open → claim ≥ 30%; reveal-card share rate ≥ 15% of revealed chains; D1 ≥ 35%, D7 ≥ 12%. Moderation health: image verdict p95 ≤ 10 min, block rate and report rate tracked (§14).

**One sentence (Art. 3.2):** 看上一棒，是画就猜一句，是字就画出来，传给下一位。 ("Look at the previous step: if it is a drawing, describe it; if it is words, draw them; pass it on.")

**Target user.** WeChat users aged 18-40 in friend, family, class and colleague groups, plus the 40+ players who arrive from family groups (direction §2). Portrait, one thumb, no drawing skill needed: bad drawings are the comedy.

**Product principles check ([CON] Art. 3).**

| Principle | How v1 meets it |
|---|---|
| Simple | One sentence above; each turn is one action (draw or type); no lobby, no accounts, no settings to learn. First turn shows one coach line (§8.6). Learnable in under 30 s |
| Addictive | Turns of 45-60 s; reveals arrive later and pull you back; several chains run in parallel in a group, so one session can be several turns; 今日起点 daily prompts and national counts; a streak with no rewards; reveals are replayable stroke by stroke |
| Social | The group *is* the game: chains are bound to a group; the invite card is the turn signal; the reveal is a group event; group stats; 同题再传 compares two chains from one prompt. No induced sharing and no reward for sharing (§9) |

**Feature scope (v1, all in):**

| Feature | v1 |
|---|---|
| Start a chain from 今日起点 (3 daily prompts), 换一批 (from 423 presets) or 自己出题 (moderated) | Yes |
| Async 6-棒 chain bound to a WeChat group, claim lock, timeouts, 2-person minimum | Yes |
| One-thumb drawing tool (6 + 6 colours, 3 sizes, undo, clear, 60 s) | Yes |
| Describe step (≤ 16 characters, 45 s) | Yes |
| Moderation pipeline (local filter, `msgSecCheck`, `mediaCheckAsync` + push, fail closed, kill switch, circuit breaker) | Yes |
| Report flow, admin takedown function, strike ladder, 180-day retention, author deletion | Yes |
| Reveal with stroke-replay animation, 笑 reactions, teaser for non-participants, 同题再传 | Yes |
| 本群接龙 (group chain list + group stats), 我的接龙 (album), streak | Yes |
| Invite and reveal share cards, updatable invite card (fixed template) | Yes ([VERIFY] fallback: static card) |
| Opt-in subscribe message "接龙揭晓了" | Yes (hidden without a template ID) |
| Rewarded: 再开一条 (+1 start, ≤ 2/day), 今日彩笔 (+6 colours today); capped interstitial; banner on list screens (config, default off) | Yes |
| Large-text and high-contrast modes | Yes (copied from [DJT] §8.10) |
| Analytics (`track`), remote `app_config` | Yes |
| Public chains, real-time rooms, names on steps, boards, save reveal to album | **No** (§20 backlog or rejected, decisions.md) |

**Package budget.** Main package ≤ 4 MB, total ≤ 30 MB [P0 §10]. No open data domain (PO-9). Content (423 prompts, about 12 KB) ships in the main package as a `.js` module (mini games can only `require` `.js`, so no JSON content files). No remote images; the UI art is drawn in code plus a few small PNG illustrations (≤ 300 KB total). Display font in a subpackage, as in [DJT].

**Release path.** v1 complete build → QA → release pack (`docs/chuanhua/release/`) → Founder Handoff (§18) → founder device pass (§16.2) → founder-approved submission.

---

## 2. Core loop

**Starter (about 75 s):**
1. Home → **开一条接龙**.
2. Pick a prompt: one of today's 3 (今日起点), 换一批 for 3 more from the bank, or 自己出题 (≤ 12 characters, moderated before anything is created, §6.2).
3. Draw the prompt in 60 s (第 1 棒). Submit.
4. "已传出" screen: the drawing is in review (§6.3). Tap **发到群里接龙** to share the invite card to a group (voluntary; §9). Optionally 揭晓时提醒我 (§10.3).

**Next player (about 60 s):**
1. Taps the invite card in the group → the chain entry screen shows "第 2 棒等你接" and nothing of the chain's content.
2. Taps **接这一棒** → the server locks the step to them (claim) and only then sends the previous 棒.
3. Sees **only the previous 棒**: a drawing → describe it in ≤ 16 characters (45 s); a sentence → draw it (60 s).
4. Submits → "已传出" (text passes or fails instantly; a drawing waits for review). Optional: share a fresh card, 揭晓时提醒我, or look at other open chains in 本群接龙.

**Reveal (about 30 s):** when 第 6 棒 passes (or on an early reveal), every participant can open the reveal: an animated unrolling, prompt → drawing (stroke replay) → sentence → … → final sentence. Then 笑 stamps, 举报, 重播, **分享揭晓卡** and **同题再传**.

Interstitials appear only when leaving a reveal, under the caps in §11.

---

## 3. Chain rules

### 3.1 Shape (PO-1)

A chain = a **prompt** + **6 棒**. Odd 棒 are drawings, even 棒 are descriptions:

| 棒 | Kind | Sees | Produces |
|---|---|---|---|
| 起点 | prompt (preset or own) | n/a | text ≤ 12 chars |
| 1 | 画 draw | the prompt | drawing |
| 2 | 猜 describe | drawing 1 | text ≤ 16 |
| 3 | 画 | text 2 | drawing |
| 4 | 猜 | drawing 3 | text |
| 5 | 画 | text 4 | drawing |
| 6 | 猜 | drawing 5 | text (the punchline) |

Why 6 (decisions PO-1): every extra 棒 is another point where a quiet group can stall; 6 still gives three rounds of drift; it caps image checks at 3 per chain (quota, §6.7); the reveal stays about 30 s; and the chain ends on a sentence, which makes the reveal card's "从『起点』传成了『终点』" line possible.

### 3.2 Starting (PO-2)

- `createChain` creates the chain and gives the starter an immediate claim on 第 1 棒. The starter draws the prompt themselves, so the first card shared into a group already carries content.
- The chain counts against the starter's daily start allowance (§3.9) **only when 第 1 棒 is submitted**. A starter who abandons the drawing loses nothing; the chain is discarded when the claim expires (`abandoned`, deleted by `cleanup`).
- If the starter entered the game from a group card in this session (group context, §9.2), the chain is bound to that group at creation. Otherwise it is unbound until its first group entry (§3.3).

### 3.3 Group binding (PO-6) [COMPLIANCE]

- Every chain belongs to **at most one group** (`openGId`, server-decrypted via `joinGroup`, §9.2). It is bound at creation (starter has group context) or by the first claim made with group context.
- **Claiming requires group membership:** the caller must have a `group_members` row for the chain's group with `lastSeen` within 30 days. That row exists only if they once opened one of our cards in that group (shareTicket → `getGroupEnterInfo` → `joinGroup`).
- A card opened from a single chat, or a chain bound to group A opened from group B, cannot be claimed: the entry screen says "接龙只能在发起的群里接力" plus 开一条新的.
- `withShareTicket` cards can only be sent to one chat and cannot be long-press forwarded [P0 §4], which also limits reach.
- There are **no public chains, no stranger matching and no feed** (PO-6). Reach of any UGC is limited to one group's members who took part.

### 3.4 Who may take a 棒 (PO-3)

All of these must hold (server-checked in `claimStep`, pure function `core/chain.js#canClaim` shared with the client for the button state):
1. The player has agreed to the 接龙公约 (§8.2) and is not restricted (§7.3).
2. UGC creation is enabled (`app_config.ugc.createEnabled`, §6.8) and not circuit-broken.
3. The chain is `open`: its latest 棒 has passed moderation, fewer than 6 棒 have passed, it is not revealed, expired or removed.
4. Nobody else holds an unexpired claim on the next 棒.
5. The player did **not** author the previous passed 棒 (no two in a row).
6. The player has fewer than **3** passed or pending 棒 in this chain. (A blocked or voided attempt does not count.)
7. Group membership as in §3.3.
8. Daily caps: < 40 submitted 棒 today, and < 3 claims on this chain today (stops "claim to peek, release, repeat").

**Few players.** With the 3-棒 cap and the no-consecutive rule, two people can complete a chain (A: 1, 3, 5; B: 2, 4, 6). With three people every combination works. The fun in small groups also comes from running **several chains in parallel** (each member starts their own, like a round where everyone starts a prompt), early reveal at ≥ 4 棒, and the reveal notice (§10.3) that brings people back.

### 3.5 Claims, timeouts and simultaneous opens (PO-4)

- **Claim:** `claimStep` runs in a DB transaction on the chain document: it re-checks §3.4, writes `claim = {openid, claimId, step, at, expiresAt: now + 150 s}`, and returns the previous 棒 **only to the claimant**. Viewing the entry screen never claims; only the 接这一棒 tap does.
- **On-screen timers:** draw 60 s, describe 45 s (config `timers.drawSec`, `timers.describeSec`). The timer starts when the previous 棒 is on screen. It is a plain visible countdown with a 10 s warning colour; no fake urgency, no extensions sold for ads [CON 3.3].
- **Timer end:** a drawing with ≥ 1 stroke is submitted automatically; an empty canvas is not submitted and the claim is released ("时间到，这一棒交给别人吧"). The describe input is submitted automatically if it holds ≥ 2 valid characters, else released.
- **Server TTL 150 s** covers loading, the keyboard, and network retries. A submit after the TTL is still accepted **if nobody else has claimed the 棒 since** (lazy expiry); otherwise `CLAIM_LOST` ("超时了，这一棒已被群友接走"), and the client discards the work.
- **Two people at once:** the transaction lets exactly one claim win. The other gets `TAKEN` and sees "有群友正在接第 3 棒（约 2 分钟内）" with 看看本群其他接龙 and 开一条新的. When the claim expires unused, the chain is open again.
- **Release:** 返回 during a turn asks "放弃这一棒？" and on confirm calls `releaseClaim`; the claimant has seen the previous 棒, which is acceptable.
- **While the latest 棒 is pending moderation** the chain cannot be claimed: the entry screen shows "第 2 棒审核中，通常几分钟" (§6.3).

### 3.6 Lifetime, early reveal, expiry (PO-5)

- A chain lives **48 h** from creation (`expiresAt`).
- **Early reveal:** the starter may tap **现在揭晓** once ≥ 4 棒 have passed and no claim or pending 棒 is active. The chain reveals with the passed 棒.
- **Expiry (`modSweeper`, §13.2):** at `expiresAt`, if a claim or pending 棒 is active, expiry waits for it to resolve (at most 150 s for a claim, ≤ 70 min for a pending drawing). Then: ≥ 4 passed → reveal (`revealReason: expiry`); < 4 → state `expired` ("这条接龙没传完"): participants can see only their own 棒 in 我的接龙, plus 同题再传.
- **Complete:** when 第 6 棒 passes, the chain reveals immediately (`revealReason: complete`). Because 第 6 棒 is text and its check is synchronous, the last player sees the reveal right after submitting.

### 3.7 Reveal visibility (PO-7) [COMPLIANCE]

- **Participants** = the starter plus every author of a **passed** 棒. Only they get `getReveal` (content).
- Anyone else who opens the reveal card (other group members) sees the **teaser**: the prompt, the final sentence (both already moderated text), the number of 棒, and the line "完整接龙仅参与的群友可见", with **同题再传** (start a new chain from the same prompt in this group) and **看看本群其他接龙**.
- Drawings and strokes are never sent to non-participants (§13.3).

### 3.8 Chain state machine

```
            createChain (claim 1 → starter)
                    │
                    ▼
 ┌────────── starting ──claim expires, nothing submitted──→ abandoned
 │                  │ submit 棒1 (drawing)
 │                  ▼
 │   ┌────────→ pending ──blocked / void──→ open (same 棒 reopens)
 │   │              │ passed
 │   │              ▼
 │   │   open (next 棒 claimable) ⇄ claimed (claim TTL 150 s; release/expiry → open)
 │   │              │ submit
 │   └──drawing─────┘
 │                  │ text: sync check pass → open (or reveal if 棒6)
 │                  │ text: blocked → stays claimed, player retypes
 │                  ▼
 │   6 passed ─────────────→ revealed
 │   starter 现在揭晓 (≥4) ─→ revealed
 │   48 h & ≥4 passed ─────→ revealed
 │   48 h & <4 passed ─────→ expired
 └── admin removeChain (any state) → removed
```

Step (棒 attempt) states: `pending` → `passed` | `blocked` | `void`; a `passed` 棒 can later become `hidden` (report/admin) or `deleted` (author). Only `passed` and not hidden/deleted content is ever shown to anyone other than its author.

### 3.9 Daily allowances

| Allowance | Value | Notes |
|---|---|---|
| Chain starts | 3 per Beijing day free, + up to 2 by rewarded video (§11) | counted at 第 1 棒 submission |
| 棒 submitted | 40 per day | quota and abuse guard; hitting it shows "今天接得够多啦，明天再来" |
| Claims on one chain | 3 per day | anti-peek |
| Reports | 10 per day | anti-griefing |

All counters live on `players` (§13.1), keyed by the server's Beijing date (`core/date.js`, copied from [DJT]).

---

## 4. Daily hook and prompts (PO-21, PO-22, PO-30)

### 4.1 今日起点

- Every Beijing day the home screen features **3 prompts**, the same for everyone in China. Selection is deterministic in `core/daily.js`: a fixed shuffle of all non-retired prompt ids (`mulberry32(hash32("chuanhua-daily-v1"))`, the rng copied from [DJT]) walked 3 per day from the launch date, so no prompt repeats within 141 days. The server is the source (`getHome`); the client can compute the same offline.
- **National count:** the reveal and the home card show "今天全国 2,315 条接龙从『月亮吃月饼』出发" once the count is ≥ 30 (from `daily_stats.byPrompt`). This is aggregate only.
- **Streak:** "连续接龙 N 天" for N ≥ 2: consecutive Beijing days with ≥ 1 passed 棒 (as author). Server-computed. **No rewards, no freeze, no "快断了" reminders** [CON 3.3].
- **No solo mode** (PO-21): a chain needs other people to have a payoff. The "play again now" loop is: start another chain, or take an open 棒 in 本群接龙.

### 4.2 Prompt bank

- **423 original prompts** in 12 categories (Appendix B), `core/content/prompts.v1.js`, each `{id: 'A01', text, cat}`, ≤ 12 characters, drawable, neutral or positive.
- **Content rules** (content review before submission): no politics, national symbols, flags, maps, currency, military or police, religion or 封建迷信 (ghosts, fortune telling), real people, celebrities, brands, regions or ethnic groups as jokes, disasters, illness, death, violence, alcohol, tobacco, gambling (incl. 麻将, lotteries), romance or bodies, and nothing that mocks any group of people (age, job, body). Original wording: no prompt lists from Gartic Phone, Telestrations or any game are used.
- Prompts are never deleted: a removed prompt gets `retired: true` (existing chains keep its text). `promptsVersion` = 1.
- **换一批** picks 3 random non-retired prompts (excluding today's 3) on the client.

### 4.3 自己出题 (custom prompt)

- Optional, behind a secondary button on the picker. ≤ 12 characters, ≥ 2, the character rules of §5.6.
- Moderated **before the chain exists**: `createChain` runs the local filter and `msgSecCheck` (§6.2). Blocked → "这个题目不太合适，换一个吧" and nothing is created. A custom prompt that passes is stored with `custom: true`.
- Custom prompts appear in reveal and teaser text and in the reveal card title (already checked text).

---

## 5. Drawing tool and stroke data (PO-10, PO-11)

### 5.1 Canvas

- Square drawing area, full width minus 16 pt margins (about 343 × 343 pt on a 375 design width), in the middle of the screen; tools in the thumb zone below.
- **Logical grid 1024 × 1024** (integers). All strokes are stored in grid units, independent of screen size.
- One finger draws. A second finger is ignored (single-finger routing copied from [DJT]). Touches that start outside the canvas never draw.
- Smoothing: client-side quadratic smoothing for display; points are kept only when ≥ 3 grid units from the last kept point.

### 5.2 Tools

| Tool | v1 |
|---|---|
| Colours | **6 base:** 墨 `#1E1B18`, 朱 `#D8433B`, 橙 `#F29B30`, 绿 `#3E9B5A`, 蓝 `#3C78C8`, 紫 `#7B4FB3`. **今日彩笔** (rewarded, today only, §11): 粉 `#F28DB2`, 黄 `#F2D13C`, 天青 `#6CC3E0`, 棕 `#8A5A3B`, 灰 `#9A9A9A`, 草 `#9CCB4A` |
| Brush sizes | 3: 细 8, 中 18, 粗 36 (grid units) |
| 撤销 (undo) | removes the last stroke; unlimited within the turn |
| 清空 (clear) | confirm "清空画布？"; then undo can't restore |
| Eraser | none (undo covers it; one less tool to learn) |
| Timer | 60 s, visible; 10 s warning |
| 画好了 | primary button; disabled until ≥ 1 stroke |

Colour swatches are 40 pt circles with a 48 pt touch target; the selected one has a ring and a check mark (not colour alone). Brush sizes are shown as dots of the real width.

### 5.3 Stroke format (`core/strokes.js`, shared client/server)

```js
{ v: 1,                       // format version
  s: [                        // strokes, in drawing order
    [c, w, x0, y0, dx1, dy1, dx2, dy2, ...],   // c = colour index 0-11, w = size index 0-2,
  ]                                            // first point absolute, then deltas (ints)
}
```

**Limits (server-validated; client enforces the same):** ≤ 200 strokes; ≤ 4,000 points in total; ≤ 600 points per stroke; coordinates within 0-1023 after decoding; colour 0-11; size 0-2; serialized JSON ≤ 32 KB. A drawing over the point limit stops accepting new strokes and shows "画得太细啦，先交吧" (rare: 4,000 points is far more than 60 s of drawing produces, INFERENCE, measured in QA).

### 5.4 Strokes vs PNG (decision PO-10)

- **The client uploads strokes only, never an image.** The server validates them, then **rasterises a 512 × 512 PNG** (white background, round caps and joins, widths scaled ×0.5) with a pure-JS renderer plus Node's built-in `zlib` (`cloudfunctions/common/raster.js`). This PNG is what `mediaCheckAsync` checks (§6.3).
- **Clients render drawings from strokes** with the same geometry (`js/render/strokes.js`), so what the next player and the reveal show is exactly what was moderated (up to anti-aliasing), and the reveal can replay stroke by stroke.
- **PNGs never reach a client.** They exist for moderation and admin review only (§7.2).
- Why: a client cannot upload a photo or an image that differs from what others see; uploads are small (typically 4-15 KB of strokes, INFERENCE); and the replay animation needs strokes anyway. Alternatives (client PNG upload; both) are in decisions.md.
- Rasterisation time in a cloud function is [VERIFY] V10 (target ≤ 800 ms for 4,000 points).

### 5.5 Describe input

- The previous drawing fills the top area (rendered from strokes, static); the input sits below with a 45 s timer.
- Input uses the mini game keyboard (`wx.showKeyboard`, `onKeyboardInput`, `onKeyboardConfirm`, `hideKeyboard`) [VERIFY V4]. The canvas draws the text box, the character counter ("7/16") and the placeholder "你觉得这画的是什么？".
- Submit on 传出去 or the keyboard confirm key.

### 5.6 Text rules (`core/text.js`, shared)

Applied to custom prompts (2-12 characters) and descriptions (2-16 characters), counted in Unicode code points after trimming:
- Allowed: CJK characters, Latin letters, digits, and the punctuation `，。！？、…—·~` plus their ASCII forms. Emoji and other symbols are removed on input.
- **Contact and ad patterns rejected locally** (minors protection and anti-spam, §7.6): 5 or more digits in total (including full-width and 一二三… sequences of ≥ 5), any URL or domain pattern, `wx`/`vx`/`微信`/`加我`/`QQ`/`群号`/`电话` style contact words, and @-handles.
- A **local blocklist** (`core/content/blocklist.v1.js`, maintained by the content owner, reviewed before submission; categories: political terms and names of leaders, sexual terms, insults and slurs, drugs, gambling, violence/terror, regional and ethnic slurs) is checked before any API call. The list is a `.js` module, never fetched remotely.
- Local rejection returns "换个说法吧" with no strike (the API was not called).

---

## 6. Moderation pipeline [COMPLIANCE]

**Principle: fail closed.** No user text or drawing is shown to anyone but its author until the platform check returned `pass`. If a check is slow, fails, or the service is down, the content stays unseen. All checks run server-side in cloud functions with the author's `openid` (from `cloud.getWXContext()`, never from the client).

### 6.1 Platform facts used (all [VERIFY] at the device pass, §16)

- `security.msgSecCheck` v2: `content` ≤ 2,500 chars, `version: 2`, `scene` (1 资料, 2 评论, 3 论坛, 4 社交日志), `openid`; the user must have visited within 2 h (else 61010); result `suggest` = `pass`/`review`/`risky` with `label`; 4,000/min and 2M/day per AppID, **only 100/day before the app is published**; supported as a cloud call in mini games [KI §0, KA §3.1].
- `security.mediaCheckAsync` v2: `media_url`, `media_type: 2` (image), `version: 2`, `scene`, `openid`; jpg/png/bmp/gif ≤ 10 MB; returns `trace_id`; the verdict is **pushed within 30 minutes** as event `wxa_media_check` to the message-push endpoint; applies to mini games; 2,000/min and 200,000/day; supported as a cloud call [KI §0, KA §3.1].
- Routing the push event to a cloud function in a mini game environment is **unproven** (V1, the top risk; fallbacks in §16).

**Scene:** we use **scene 3 (论坛)** for all text and images, because content is shown to several people in a group. [VERIFY V3: confirm the scene and whether it changes strictness.]

### 6.2 Text (custom prompts and descriptions)

Synchronous, inside `createChain` (prompt) or `submitStep` (description):
1. `core/text.js` rules and the local blocklist (§5.6). Fail → `TEXT_REJECTED` (no strike, no API call).
2. `msgSecCheck` v2, scene 3, author's openid. Timeout 3 s.
3. Result:
   - `pass` → the text is stored as `passed` and becomes visible (a description opens the next 棒, or reveals the chain at 第 6 棒).
   - `review` → **blocked**, no strike. Author sees "这句话没通过审核，换个说法吧" and keeps their claim (the TTL still applies) to retype.
   - `risky` → **blocked** and **one strike** (§7.3), same message.
   - API error, timeout, quota error or 61010 → `MODERATION_BUSY`: nothing is stored; the author keeps the claim and the text in the input, with "审核服务繁忙，请稍后再试". Nothing is shown to anyone. The error feeds the circuit breaker (§6.8).
4. Blocked text is kept in `mod_log` (admin-only, 180 days) and never shown to others.

### 6.3 Drawings

Inside `submitStep` (draw):
1. Validate strokes (§5.3); invalid → `INVALID_STROKES`.
2. Rasterise to PNG (§5.4) and upload to cloud storage `chuanhua/mod/<YYYYMM>/<chainId>/<step>_<attempt>.png` (§13.3).
3. `getTempFileURL` for that file with `maxAge` 7,200 s (covers the 30-minute window plus one retry) [VERIFY V11: the checker can fetch it].
4. `mediaCheckAsync` v2 (`media_type: 2`, scene 3, author's openid). Store `trace_id` on the step and in `mod_traces/<trace_id>`.
5. The step is **`pending`**; the chain is `pending` (not claimable). `submitStep` returns `{state: 'pending'}`.
6. **Push handler `onMediaCheck`** (idempotent by `trace_id`): looks up the step; `pass` → `passed`, the chain opens the next 棒 (and the updatable card count increases, §9.4); `review` → `blocked`, no strike; `risky` → `blocked` + one strike. A verdict for a step that is no longer pending (timed out, removed) is logged and ignored, except that a late `risky` still adds a strike.
7. **Timeouts (in `modSweeper`, every 5 min):** a step pending for 35 min without a verdict gets **one** new check (same PNG, new temp URL, new `trace_id`). Still no verdict 35 min later → `void` (system fault): no strike, not counted against the author's allowances, the 棒 reopens. Before the app is live, mock mode drives these paths (§6.6).
8. If the `mediaCheckAsync` call itself errors (quota, network): up to 2 retries by `modSweeper` (at +5 and +10 min), then `void`. The step stays `pending` (unseen) the whole time.

### 6.4 What each person sees

| Situation | The author | Other group members / next claimant |
|---|---|---|
| Drawing pending | "已传出 · 审核中，通过后传给下一位" with their own drawing marked **审核中** (in 已传出 and 我的接龙) | entry: "第 N 棒审核中，通常几分钟"; no content; cannot claim |
| Drawing passed | 我的接龙: "已通过" | entry: "第 N+1 棒等你接" |
| Drawing blocked (review or risky) | 我的接龙: "这一棒没通过内容审核，没有传出去。" (no label detail); the next time they open the game, a one-time sheet with the 接龙公约 if it was `risky` | nothing: the 棒 simply reopens ("第 N 棒等你接"); no one learns of the block |
| Drawing void (timeout/system) | "审核超时，这一棒没有传出去，不算你的次数" | the 棒 reopens |
| Text blocked | instant message, retype within the claim | nothing |
| Text busy | instant message, retry | nothing |
| Passed then reported/hidden | 我的接龙 and reveal: "这一棒已被举报隐藏" | reveal placeholder "该内容已被举报隐藏" |

A blocked 棒 can be claimed again by any eligible member, including its author (blocked attempts don't count toward the 3-棒 cap); strikes (§7.3) deter repeats.

### 6.5 Reveal and share gating

- A chain is revealed only when every 棒 it shows is `passed`. Hidden or deleted 棒 render as placeholders.
- Share images never contain user drawings (PO-24, §9). Share titles may contain the prompt and the final sentence, which are passed text.

### 6.6 Pre-publish quota and test modes (PO-14)

Unpublished AppIDs get about **100 `msgSecCheck` calls per day** [KI §0, KA]. Design:
- Environment variable `MODERATION_MODE` = `live` | `mock`, and `ENV_KIND` = `prod` | `dev`.
- **`mock`** (dev only; automated tests, QA): text containing `测试违规` → `risky`, `测试复审` → `review`, `测试繁忙` → error; otherwise `pass`. Images: `mediaCheckAsync` is not called; `modSweeper` resolves mock traces after `MOCK_MEDIA_DELAY_SEC` (default 60): a drawing with exactly 13 strokes → `risky`, 14 → `review`, 15 → no verdict (exercises timeout and void), otherwise `pass`. Mock verdicts go through the same `onMediaCheck` code path.
- **`live` in dev** (device pass, QA spot checks): a daily budget `MOD_TEXT_DAILY_BUDGET` (default 80) is counted in `mod_quota/<dateKey>`; beyond it `msgSecCheck` is not called and the request fails closed with `MODERATION_BUSY`.
- **Production:** `ENV_KIND=prod` forces `live`; if `MODERATION_MODE=mock` is set in prod, every UGC function returns `SERVER_CONFIG` and logs `[ALERT]` (a test enforces this). The release checklist verifies the prod variables.

### 6.7 Quota guard (images)

`mod_quota/<dateKey>` counts `mediaCheckAsync` and `msgSecCheck` calls (`inc`). At **70%** of 200,000 images/day an `[ALERT]` is logged (founder asks WeChat for a raise, Handoff H11). At **95%**, `createChain` returns `UGC_BUSY` ("今天接龙太热闹了，明天再开新的吧") while claims of existing chains continue. At 100%, draw submissions also fail closed (`MODERATION_BUSY`).

### 6.8 Kill switches and circuit breaker

- `app_config.ugc = {createEnabled: true, viewEnabled: true}` (cloud console, no release).
  - `createEnabled: false` → no new chains, claims or submissions; clients show "接龙维护中，可以先看看已揭晓的接龙".
  - `viewEnabled: false` → **every content view returns placeholders** (claims return no previous 棒, reveals show "内容维护中"). The emergency stop for entity risk.
- **Circuit breaker:** if ≥ 50% of moderation calls fail (minimum 20 calls) over 5 minutes, `modSweeper` sets `app_config.ugc.autoPausedUntil = now + 15 min` and logs `[ALERT]`; creation behaves as `createEnabled: false` until then. Viewing passed content is unaffected.

---

## 7. Reports, takedown, offenders, retention, minors [COMPLIANCE]

### 7.1 User report flow (PO-16)

- **举报** appears on: the previous 棒 during a claim (a small text button above the content), every 棒 in a reveal, and the chain teaser (reports the prompt/final text).
- Sheet: reason (one tap): 色情低俗 · 政治敏感 · 辱骂攻击 · 广告引流 · 其他不适 → [提交举报] [取消]. No free text (so no new UGC to moderate).
- On submit (`report`), the item is **hidden for everyone immediately** (`hidden`, reason `report`) and the reporter sees "已举报，该内容已隐藏，我们会尽快核实".
  - If it was the latest passed 棒 of an open chain: the 棒 reopens (the chain continues from the 棒 before it). If the reporter held the claim on the next 棒, their claim is released and they may take the reopened 棒 ("上一棒已隐藏，你可以接这一棒" if eligible). If someone else held the claim, it is cancelled ("上一棒已被隐藏，本棒取消").
  - If later 棒 were built on it, or the chain is revealed: the 棒 shows a placeholder in the reveal; the chain is otherwise unchanged.
- Limits: 10 reports per day per player; one report per player per item; you can't report your own 棒. A report creates `reports/<reporterOpenid>_<stepId>` with state `open`.
- Reports never reveal the reporter to anyone.

### 7.2 Admin takedown path (no admin UI)

Cloud function **`admin`**, callable **only from the cloud console** (test invocation, which carries no OPENID); any call with an OPENID returns `FORBIDDEN` unless the OPENID is listed in env `ADMIN_OPENIDS` (fallback if console invocation turns out to carry one, [VERIFY V14]). Every operation writes `audit_log` (op, target, before/after state, `ts`, `by: console|<openid>`).

| `op` | Input | Effect |
|---|---|---|
| `listReports` | `{state: 'open', limit ≤ 50}` | open reports, oldest first, with step text or a short-lived (10 min) temp URL of the PNG |
| `getStep` | `{stepId}` | the step's text/strokes, PNG temp URL (10 min), mod results, reports, author's strike count (openid shown only here) |
| `sample` | `{n ≤ 50, kind?}` | random passed 棒 from the last 24 h for human spot checks (research advice, [KI] K4) |
| `upholdReport` | `{reportId}` | report upheld; the step stays hidden; **one strike** to the author |
| `dismissReport` | `{reportId, restore: boolean}` | report dismissed; with `restore`, the step is unhidden (only if it no longer blocks an open chain, else it stays hidden) |
| `hideStep` / `restoreStep` | `{stepId}` | manual takedown / restore |
| `removeChain` | `{chainId}` | the chain becomes `removed`: every view shows "该接龙已被移除"; updatable card frozen |
| `restrict` | `{openid, days | permanent}` | sets a restriction (§7.3) |
| `liftRestriction` | `{openid}` | clears it |
| `setUgc` | `{createEnabled?, viewEnabled?}` | the kill switches (§6.8) |

**Ops routine** (Handoff H9): the founder or a delegate runs `listReports` and a `sample` of 20 daily for the first 4 weeks, then at least every 2 days. Because reported content is hidden at once, a slow queue never exposes content; it only delays restores and strikes. `modSweeper` logs `[ALERT]` when an open report is older than 48 h.

### 7.3 Repeat offenders (PO-17)

**Strikes:** one per `risky` verdict (text or image), one per upheld report. `review` verdicts, local rejections and voids give none. Strikes count over a rolling 30 days.

| Strikes (30 d) | Consequence |
|---|---|
| 1 | One-time sheet with the 接龙公约 on next open: "你有内容没通过审核。请遵守接龙公约，多次违规将被限制参与。" |
| 2 | **24 h restriction** |
| 3 | **7-day restriction** |
| ≥ 4 | **30-day restriction** and flagged for admin review (admin may make it permanent) |

A restricted player cannot start chains, claim or submit; they can still open reveals of chains they took part in, 我的接龙 and settings. Copy: "你暂时不能参与接龙（至 10月17日 14:00）。原因：多次发布的内容未通过审核。如有疑问，请在「设置 · 反馈」联系我们。" Restrictions are on the openid (the only identity we have).

### 7.4 Author deletion

In 我的接龙 a player can **删除这一棒** on any of their passed 棒, and 设置 offers **删除我的全部接龙内容**. Effect: the content is no longer served (placeholder "作者已删除这一棒"); strokes and text are removed from `steps`. If it was the latest passed 棒 of an open chain, that 棒 reopens. The moderation evidence (PNG and the `mod_log` text copy) stays admin-only until its 180-day deletion (§7.5), for legal record keeping [VERIFY with counsel, Handoff H10].

### 7.5 Retention: 180 days (PO-19)

`cleanup` (daily 04:00 BJT) deletes, older than 180 days: `chains`, `steps` (text and strokes), cloud-storage PNGs (`deleteFile`, batches of 50), `mod_traces`, `mod_log`, `reports`, `reactions`, `sub_grants`, `audit_log`, `events`, `rate_limits`; `group_members` and `players` with no activity for 180 days; `group_stats` with no activity for 180 days. Aggregate `daily_stats` are kept. Abandoned chains (never submitted) are deleted after 1 day. Idempotent. Declared in the privacy guide (§15).

### 7.6 Protection of minors

We cannot know a player's age (no age API, no data collected), so the whole game is **safe by default** (PO-20):
- Pre-moderation of every item (fail closed); reports hide at once; offenders are restricted.
- **No contact surface:** no names, avatars or profiles on content; no chat, no DMs, no friend requests, no public feed; text cannot carry numbers ≥ 5 digits, URLs or contact words (§5.6); drawings are checked and reportable (广告引流).
- **Group-only reach** (§3.3) and participant-only reveals (§3.7); share images carry no UGC (§9).
- 接龙公约 shown and agreed before the first UGC (§8.2).
- No night-time pushes: the only message is the opt-in reveal notice, and `modSweeper` holds reveal notices between 22:00 and 08:00 BJT until 08:00.
- Platform 防沉迷 and real-name rules for mini games apply as the platform enforces them [VERIFY V13, Handoff H10]. Duties under 《未成年人网络保护条例》 for a group-only UGC game are a counsel check (Handoff H10).

---

## 8. Screens and flows

General rules (copied from [DJT] §8): content starts below the capsule (`navBottom = capsule.bottom + (capsule.top − statusBarHeight)`); nothing in the capsule row; in-game back is a "‹ 返回" text button at top-left; primary actions in the bottom 40% of the screen above the safe area; touch targets ≥ 48 × 48 pt; body text ≥ 16 pt; design width 375, must work from 320 to 430 wide and 568 to 932 tall. Every network area has loading / empty / error states; errors offer 重试. Labels: steps are "第 N 棒", never names.

### 8.1 Home

```
┌───────────────────────────────────┐
│ 9:41                    [ ··· ◎ ] │ ← capsule row: nothing drawn on the right
│                                   │
│           传 画 接 龙              │
│      看上一棒，画出来或猜出来        │
│                                   │
│ ┌───────────────────────────────┐ │
│ │ 今日起点 · 10月15日              │ │
│ │ 月亮吃月饼 · 企鹅滑滑梯 · 搬家    │ │
│ │ 全国已有 2,315 条从这里出发       │ │ ← count line only when ≥ 30
│ │ 连续接龙 4 天                    │ │ ← only when ≥ 2
│ └───────────────────────────────┘ │
│ ┌ 来自群聊 · 本群有 2 条等你接 › ┐   │ ← only with group context (§9.2)
│                                   │
│      [     开一条接龙     ]         │ ← primary; subline "今天还能开 2 条"
│                                   │
│  [ 我的接龙 (1 条揭晓) ] [ 本群接龙 ] │
│  [ 玩法 ]                 [ 设置 ]  │
└───────────────────────────────────┘
```

| State | Behaviour |
|---|---|
| Loading (`getHome`) | skeleton card "正在取今日起点…"; buttons enabled once loaded; 今日起点 can be computed locally (§4.1) |
| Ready | as drawn |
| Offline / error | card "需联网才能接龙" + 重试; 我的接龙 shows cached list (read-only); 开一条接龙 disabled |
| Starts used up | primary reads "今天的 3 条已开完"; secondary "▶ 看视频再开一条 (剩 2)" if ad starts remain; else "明天再来开新的吧" |
| Restricted (§7.3) | banner with the restriction copy; 开一条接龙 disabled; 我的接龙 works |
| UGC paused (§6.8) | banner "接龙维护中，可以先看看已揭晓的接龙"; start disabled |
| Group context, no open chains | the group line reads "来自群聊 · 本群接龙" (no count) |
| First launch | the 玩法 sheet opens once (3 lines + an illustration of a 3-panel mini chain), dismissible; no login, no consent screen |
| Reveal ready since last visit | 我的接龙 shows a dot and "(1 条揭晓)" |
| Strike warning pending | the one-time 公约 sheet (§7.3) shows over home |

**本群接龙** without group context opens the explainer (§8.10).

### 8.2 接龙公约 (first UGC only)

Shown before the first 开一条接龙 or 接这一棒, as a bottom sheet:

```
┌───────────────────────────────────┐
│ 接龙公约                            │
│ · 画和字都会先审核，通过后才传给下一位 │
│ · 不画、不写色情低俗、政治、辱骂、广告 │
│   和联系方式                        │
│ · 违规内容会被隐藏，多次违规会被限制   │
│ · 看到不合适的内容，请点「举报」       │
│ 《用户协议》《用户隐私保护指引》        │ ← links (openPrivacyContract for the guide)
│ [ 先看看 ]          [ 同意并开始 ]    │
└───────────────────────────────────┘
```
- 同意并开始 → `agreeRules({version})` stores `rulesVersion` on `players`, then continues the action the player tapped. 先看看 closes the sheet; nothing else changes and it will show again only on the next UGC tap. No pre-ticked box. A rules-version bump shows it once more.
- This agreement covers participation in UGC. It is not a WeChat privacy-interface authorization (none is used, §15).

### 8.3 Prompt picker (开一条接龙)

```
┌───────────────────────────────────┐
│ ‹ 返回                   [ ··· ◎ ] │
│ 选一个起点，你来画第 1 棒            │
│ 今日起点                            │
│ ┌───────────────────────────────┐ │
│ │ 月亮吃月饼                  ○  │ │
│ │ 企鹅滑滑梯                  ○  │ │
│ │ 搬家                        ●  │ │
│ └───────────────────────────────┘ │
│ [ 换一批 ]                          │ ← 3 random from the bank
│ [ 自己出题 ]                        │ ← opens the input, ≤ 12 chars
│                                   │
│        [   开始画 (60 秒)   ]       │
└───────────────────────────────────┘
```

| State | Behaviour |
|---|---|
| Default | today's 3 shown, first preselected |
| 换一批 | replaces the list with 3 other prompts (client-side); a 今日 chip marks daily prompts when shown |
| 自己出题 input | keyboard; counter "5/12"; [确定] runs `createChain` with the text (moderation, §6.2) |
| Creating (`createChain`) | button "准备画布…"; ≤ 5 s, then error state |
| Custom prompt blocked | inline "这个题目不太合适，换一个吧"; no strike for `review` or local rejection |
| `MODERATION_BUSY` | inline "审核服务繁忙，请稍后再试，或先选一个现成的题目" |
| `START_LIMIT`, `RESTRICTED`, `UGC_PAUSED`, `UGC_BUSY` | the matching copy from §8.1/§6.7; back to home |
| Offline | "需联网才能开始" + 重试 |

### 8.4 Draw screen (第 1/3/5 棒)

```
┌───────────────────────────────────┐
│ ‹ 放弃                   [ ··· ◎ ] │
│ 第 3 棒 · 画出来            ⏱ 0:48  │
│ ┌───────────────────────────────┐ │
│ │ 上一棒说：「恐龙在学跳舞」        │ │ ← the previous 棒 (or the prompt for 第 1 棒)
│ └───────────────────────────────┘ │     [举报] small, right-aligned (not on 第 1 棒)
│ ┌───────────────────────────────┐ │
│ │                               │ │
│ │          drawing area          │ │ ← 1:1
│ │                               │ │
│ └───────────────────────────────┘ │
│ ● ● ● ● ● ●   [▶ 今日彩笔]          │ ← colours; rewarded unlock (once per day)
│ [细·] [中●] [粗⬤]   [撤销] [清空]    │
│        [      画好了      ]         │
└───────────────────────────────────┘
```

| State | Behaviour |
|---|---|
| Drawing | strokes render live; 撤销 enabled when ≥ 1 stroke |
| Last 10 s | timer turns 朱 red; no sound beyond a single soft tick at 10 s (muted if sound off) |
| Time up | ≥ 1 stroke → auto-submit; else "时间到，这一棒交给别人吧" → claim released → chain entry |
| Submitting | "正在传出…"; canvas locked; ≤ 10 s, then error |
| Submit error / offline | "没传出去" + 重试 (the strokes stay; the claim TTL applies; after `CLAIM_LOST` the work is discarded with the message of §3.5) |
| 放弃 | confirm "放弃这一棒？群友可以接着画" → `releaseClaim` |
| 今日彩笔 | rewarded video (§11); on reward, 6 extra swatches appear for the rest of the Beijing day. Tapping it **pauses nothing**: to avoid eating drawing time it is offered only **before** the first stroke of a turn and on the home 设置; once drawing has started the button is hidden |
| App backgrounded | timer keeps running in wall-clock time; on return, if time is up the auto-submit rule applies |
| Point limit reached | new strokes blocked; "画得太细啦，先交吧" |
| First ever draw turn | coach line over the canvas for 3 s: "一根手指画，画得丑没关系，越离谱越好笑" |

### 8.5 Describe screen (第 2/4/6 棒)

```
┌───────────────────────────────────┐
│ ‹ 放弃                   [ ··· ◎ ] │
│ 第 4 棒 · 猜一猜            ⏱ 0:31  │
│ ┌───────────────────────────────┐ │
│ │                               │ │
│ │     previous drawing (static)  │ │   [举报]
│ │                               │ │
│ └───────────────────────────────┘ │
│ 这画的是：                           │
│ ┌───────────────────────────────┐ │
│ │ 一只猫在开出租车_        7/16  │ │ ← canvas-drawn input; keyboard below
│ └───────────────────────────────┘ │
│        [      传出去      ]         │
└───────────────────────────────────┘
```

| State | Behaviour |
|---|---|
| Typing | counter; invalid characters dropped with a brief shake of the counter |
| < 2 characters | 传出去 disabled |
| Submitting | "审核中…" (sync, ≤ 3 s) |
| Passed | → 已传出 (§8.6), or straight to the reveal if this was 第 6 棒 |
| Blocked / local rejection | inline "这句话没通过审核，换个说法吧"; text kept for editing |
| `MODERATION_BUSY` | inline "审核服务繁忙，请稍后再试"; text kept |
| Time up | ≥ 2 valid chars → auto-submit; else claim released |
| Keyboard API unavailable [VERIFY V4] | fallback: a native `wx.showModal({editable: true})` input dialog [VERIFY] |

### 8.6 已传出 (after submit)

```
┌───────────────────────────────────┐
│ ‹ 首页                   [ ··· ◎ ] │
│ 第 3 棒已传出                        │
│ ┌──────────────┐                   │
│ │ your drawing │  审核中             │ ← or "已通过"
│ └──────────────┘                   │
│ 通过后，群友就能接第 4 棒             │
│ 之前发到群里的卡片会自动更新进度        │ ← only if the updatable card works (§9.4)
│ [   发到群里接龙   ]                 │ ← share (voluntary)
│ [ 揭晓时提醒我 ]                     │ ← subscribe (§10.3), only with a template
│ [ 看看本群其他接龙 ] [ 再开一条 ]      │
└───────────────────────────────────┘
```

States: `pending` (drawing), `passed` (text, or a drawing that passed while on screen: the label flips live by polling `getChain` every 15 s while visible, max 10 min), `blocked` (drawing verdict while on screen: "这一棒没通过内容审核，没有传出去"), `void`. The first time ever, one line explains: "你只能看到上一棒，下一位也只能看到你这一棒。全部传完后，参与的人一起看揭晓。"

### 8.7 Chain entry (from an invite card, 我的接龙 or 本群接龙)

```
┌───────────────────────────────────┐
│                          [ ··· ◎ ] │
│           传画接龙                  │
│   ●●●○○○  已传 3/6 棒               │ ← progress dots, no content
│                                   │
│        第 4 棒等你接                 │
│     上一棒是一幅画，你来猜一句          │ ← kind only, never the content
│     （限时 45 秒）                    │
│                                   │
│        [    接这一棒    ]            │
│        [ 看看本群其他接龙 ]           │
│   48 小时内传完 · 还剩 31 小时         │
└───────────────────────────────────┘
```

| State (`getChain`) | Shows | Actions |
|---|---|---|
| Loading | skeleton "展开接龙…" | |
| Claimable | as drawn | 接这一棒 → `claimStep` → draw (§8.4) or describe (§8.5) |
| Claimed by someone else | "有群友正在接第 4 棒（约 2 分钟内）" | 看看本群其他接龙 · 开一条新的 · 刷新 |
| Pending moderation | "第 3 棒审核中，通常几分钟" | 揭晓时提醒我 (if participant and template) · 看看本群其他接龙 |
| You did the previous 棒 | "上一棒是你传的，等别人接下一棒吧" | as above |
| Your 3 棒 used | "这条接龙你已经接了 3 棒，留给群友吧" | as above |
| Not in this group / no group context (single chat, forwarded, wrong group) | "接龙只能在发起的群里接力" | 开一条新的 |
| Unbound chain opened with group context | normal claimable state; the claim binds the chain to this group (§3.3) | |
| Starter viewing own open chain, ≥ 4 passed | adds **现在揭晓** (confirm "现在揭晓？之后就不能再接了") | |
| Revealed, viewer is a participant | "接龙揭晓了！" | 看揭晓 (§8.8) |
| Revealed, viewer is not a participant | teaser (§8.9) | |
| Expired (< 4 棒) | "这条接龙没传完" | participants: 看我的那一棒 (in 我的接龙); everyone: 同题再传 (only shown for preset prompts; custom prompts are not reused) |
| Removed | "该接龙已被移除" | 首页 |
| Not found | "找不到这条接龙" | 首页 |
| Restricted / rules not agreed / UGC paused | the matching copy; 接这一棒 disabled or opens the 公约 sheet | |
| `TAKEN` on tap (lost the race) | toast "被群友抢先一步" → "Claimed by someone else" state | |
| Offline | "需联网才能接龙" + 重试 | |

The entry screen **never shows the prompt or any 棒 content** before a claim.

### 8.8 Reveal (participants)

```
┌───────────────────────────────────┐
│ ‹ 返回                   [ ··· ◎ ] │
│ 接龙揭晓 · 6 位群友 · 用时 5 小时      │ ← "6 棒"; participant count; duration
│ ┌───────────────────────────────┐ │
│ │ 起点：月亮吃月饼                  │ │
│ │ ↓                              │ │
│ │ 第1棒 [drawing replays stroke…] │ │  笑 3   举报
│ │ ↓                              │ │
│ │ 第2棒「一个大饼在天上」           │ │  笑 1   举报
│ │ ↓  …                           │ │
│ │ 第6棒「外星人在吃披萨」  (你)      │ │
│ └───────────────────────────────┘ │
│ 从「月亮吃月饼」传成了「外星人在吃披萨」 │
│ 今天全国 2,315 条从这里出发            │
│ [ 分享揭晓卡 ]  [ 同题再传 ]  [ 重播 ]  │
└───────────────────────────────────┘
```

- **Auto-play:** panels unroll top to bottom: the prompt (0.8 s), each drawing replays stroke by stroke compressed to **2.5 s** whatever its length, each sentence types in (0.6 s), 0.4 s between panels: about 15 s for 6 棒. Tap anywhere skips to the full strip. The strip scrolls; each drawing can be tapped to replay alone. **重播** replays the whole sequence.
- **笑** (laugh stamp): one per player per 棒, toggle; shows the count; no "best" award, no ranking (PO-27).
- Own 棒 show "(你)". No other names.
- Hidden/deleted 棒: "该内容已被举报隐藏" / "作者已删除这一棒" placeholders; the auto-play skips them.
- Early or expiry reveals show "提前揭晓 · 传了 4/6 棒".

| State | Behaviour |
|---|---|
| Loading (`getReveal`) | skeleton strip "正在展开…" |
| Ready | auto-play once on first open; later opens show the full strip with 重播 |
| `NOT_PARTICIPANT` | teaser (§8.9) |
| View paused (`viewEnabled: false`) | "内容维护中" placeholders |
| Error / offline | "揭晓需联网查看" + 重试 |
| Leaving (返回) | interstitial rule (§11) |

### 8.9 Reveal teaser (non-participants)

```
┌───────────────────────────────────┐
│ 一条接龙揭晓了                        │
│ 「月亮吃月饼」                         │
│      ↓  传了 6 棒                   │
│ 「外星人在吃披萨」                     │
│ 完整接龙仅参与的群友可见                │
│ [ 同题再传 ]  [ 看看本群其他接龙 ]      │
└───────────────────────────────────┘
```
States: loading, ready, removed, not found, offline. 同题再传 opens the picker with that prompt preselected (preset prompts only) and, with group context, the new chain is bound to the same group. 举报 (small) on the teaser reports the shown texts.

### 8.10 本群接龙 (group chain list + stats)

Requires group context for this entry (§9.2).

```
┌───────────────────────────────────┐
│ ‹ 返回                   [ ··· ◎ ] │
│ 本群接龙                             │
│ 本群已完成 12 条 · 共画了 41 幅画       │ ← group_stats; no per-person data
│ 等你接                               │
│  ● 第 4 棒 · 猜一句 · 已传 3/6     ›  │
│  ● 第 2 棒 · 画一幅 · 已传 1/6     ›  │
│ 进行中                               │
│  ○ 第 3 棒审核中                       │
│  ○ 有群友在接第 5 棒                    │
│ 最近揭晓                              │
│  「月亮吃月饼」→「外星人在吃披萨」  ›   │
│ [ 开一条接龙 ]                        │
│ ┌ banner (config, default off) ┐      │
└───────────────────────────────────┘
```

| State | Behaviour |
|---|---|
| No group context | explainer: "在群聊里点开接龙卡片，就能看到本群的接龙" + [开一条接龙]. No reward, no count, no pressure |
| Checking group (`joinGroup`) | skeleton "正在确认群聊…" |
| Group check failed | same explainer; `group_join` logged |
| Loading (`getGroupChains`) | skeleton rows |
| Ready | sections as drawn: 等你接 (chains the viewer may claim now), 进行中 (pending/claimed/not eligible, with the reason line), 最近揭晓 (last 20; participant → reveal, else teaser) |
| Empty | "本群还没有接龙，开第一条吧" + 开一条接龙 |
| Error / offline | "本群接龙暂时打不开" + 重试 |

### 8.11 我的接龙 (album)

```
┌───────────────────────────────────┐
│ ‹ 返回                   [ ··· ◎ ] │
│ 我的接龙            连续接龙 4 天     │
│ ● 已揭晓「月亮吃月饼」  今天 14:20  › │ ← dot = unseen reveal
│ ○ 进行中 3/6 · 我画了第 1 棒       › │
│ ○ 审核中 · 我画的第 3 棒           › │
│ ○ 没传完「搬家」                   › │
│ ✕ 这一棒没通过审核 · 第 5 棒          │ ← author-only status line
└───────────────────────────────────┘
```
- Lists chains the player started or authored a 棒 in, newest activity first, paginated (20), for as long as data is retained (180 days).
- Tapping a chain opens the reveal (if revealed and participant), the chain entry (if open) or a detail with **only the player's own 棒** (open, expired), each with **删除这一棒** (confirm).
- States: loading, ready, empty ("还没有接龙，去开一条吧"), error/offline (shows the last cached list read-only).

### 8.12 Report sheet

As §7.1. States: idle, submitting, done (toast "已举报，该内容已隐藏"), limit reached ("今天举报次数已达上限"), already reported ("你已举报过这条内容"), error (重试).

### 8.13 设置

Sound on/off; 显示: 大字模式 / 高对比度 (copied from [DJT] §8.10); 接龙公约; 《用户协议》; 《用户隐私保护指引》 (`wx.openPrivacyContract`); 删除我的全部接龙内容 (confirm twice: "删除后，你画的和写的内容将不再展示，正在进行的接龙会让出你的那一棒"); 反馈 (`wx.createFeedbackButton`, as in [DJT]); 揭晓提醒: a passive status line only. 今日彩笔 can also be unlocked here (▶ 看视频解锁今日彩笔).

### 8.14 玩法 sheet

Three lines plus an illustration: "1. 开一条接龙：选个题目，画出来。 2. 发到群里，群友只能看到上一棒：是画就猜一句，是字就画出来。 3. 传完 6 棒，参与的人一起看它变成了什么。" Plus one line: "所有画和字都会先审核再传给下一位。"

### 8.15 Navigation map

```
 invite card (k=) ─→ Chain entry ─接这一棒→ Draw | Describe ─→ 已传出 ─┬→ share sheet (voluntary)
 reveal card (r=) ─→ Reveal (participant) | Teaser (others)          ├→ 揭晓时提醒我 (subscribe)
                                                                     └→ 本群接龙 / 再开一条
 launch → Home ─开一条接龙→ (公约) → Picker → Draw 第1棒 → 已传出
            ├─ 我的接龙 → Reveal | Chain entry | own-棒 detail
            ├─ 本群接龙 → Chain entry | Reveal | Teaser
            ├─ 玩法 / 设置
 Reveal ─返回→ (interstitial?) → previous screen
 subscribe notice (WeChat service notice) → launch with r=<chainId> → Reveal
```

---

## 9. Share flows and group detection [COMPLIANCE: 诱导分享]

Universal rules (copied from [DJT] §9):
- Every share starts from an explicit tap (`wx.shareAppMessage`) or the capsule menu (`wx.showShareMenu({menus:['shareAppMessage']})` + `wx.onShareAppMessage` at startup).
- **No share grants anything**: no starts, colours, 棒, reveals or anything else. Copy never says "分享才能…" or promises rewards.
- The UI never depends on whether a share succeeded (no callback exists) [P0 §4].
- Rewarded videos use `disableFallbackSharePage: true` (no share-for-reward fallback page) [P0 §7.1].
- `wx.updateShareMenu({withShareTicket: true})` at startup; never pass `isUpdatableMessage: false` [P0 §4].
- Card queries carry **ids only**: `k=<chainId>` (invite) or `r=<chainId>` (reveal). Never content, openids or group ids.

### 9.1 Invite card

- From 已传出 (发到群里接龙), the chain entry (for participants), or the capsule menu while viewing an open chain.
- Image (500 × 400, 5:4, rendered on an offscreen canvas): our own illustration (a brush passing a baton), the line "传画接龙 · 已传 3/6 棒" and progress dots. **No prompt, no drawing, no sentence** (the next player must see only the previous 棒, and share images carry no UGC, PO-24).
- Title: "第 4 棒等你接，看看你能猜出什么？" (draw step: "第 3 棒等你接，你来画画看？"). No "@所有人", no system-style text.

### 9.2 Group detection

Copied from [DJT] §9.2: on launch and `onShow` read `wx.getEnterOptionsSync()`; a `shareTicket` is the group signal; call `wx.getGroupEnterInfo` → `joinGroup` with `wx.cloud.CloudID(cloudID)`; the server decrypts `opengid`, rejects non-group chats, upserts `group_members` and returns an opaque `groupRef`. Errors (40097, 65206, non-group, offline) → no group context. The client keeps `{groupRef, shareTicket}` in memory for this entry only. `wx.getShareInfo` is never used. [VERIFY V6]

### 9.3 Reveal card

- From the reveal (分享揭晓卡) or the capsule menu on the reveal/teaser.
- Image: our illustration with two passed texts: "起点「月亮吃月饼」→ 终点「外星人在吃披萨」 · 6 位群友接力". **No drawings.**
- Title: "「月亮吃月饼」传了 6 棒，变成了「外星人在吃披萨」". The card itself delivers the joke, so non-participants who open it get exactly what it promised (the teaser) [COMPLIANCE: no misleading titles].
- If card rendering fails: a static fallback image from the main package plus the text title.

### 9.4 Updatable invite card [VERIFY V7]

- At the first invite share of a chain the client asks `createChain`/`getChain` for an `activityId` (server: cloud call `updatableMessage.createActivityId`; expires after 24 h; recreated on the next share if expired) and shares with `wx.updateShareMenu({withShareTicket: true, isUpdatableMessage: true, activityId, templateInfo: {parameterList: [{name: 'member_count', value: '<passed>'}, {name: 'room_limit', value: '6'}]}})`.
- The fixed template reads "成员正在加入，当前 3/6 人" [P0 §5]; we treat "人" as passed 棒 (INFERENCE: close enough, and it is the only updatable text available).
- On every passed 棒, the server calls `updatableMessage.setUpdatableMsg` (`target_state: 0`, new `member_count`). At reveal it sets 6/6 (or the passed count) and stops updating. Errors are logged (`share_update` event) and never block anything.
- **Fallback** if the device pass shows that updatable messages break the shareTicket or don't work in mini games: static invite cards only (the progress text is drawn in the image at share time). The 已传出 line about auto-updating is hidden (`features.updatableCard: false`).

### 9.5 Entering from a card (cold or warm start)

| Query | Destination |
|---|---|
| `k=<id>` with shareTicket | `joinGroup`, then the chain entry with group context |
| `k=<id>` without ticket | chain entry; claim is refused unless the caller already has a membership row for the chain's group (§3.3) |
| `r=<id>` | `joinGroup` if ticket; then reveal (participant) or teaser |
| `wxad_fallback_share=1` | home; logged; grants nothing |
| malformed | home, logged |

A warm start with a new card **never interrupts a turn** in progress: it shows a toast "群里有新接龙，传完这一棒再看" and routes after the turn ends. `card_open` fires once per entry.

---

## 10. Social mechanics

### 10.1 Group stats (PO-9)

`group_stats/<openGId>`: chains started, chains revealed, drawings passed, last activity. Shown on 本群接龙 as one line. **No per-person counts, rankings, "MVP" or votes on who drew best** (ranking people is a sensitive area and would turn comedy into judgement, [KI §3]).

### 10.2 笑 reactions (PO-27)

One 笑 per player per 棒 in a reveal (toggle), participants only; counts shown. No awards and no sorting by 笑.

### 10.3 Subscribe message "接龙揭晓了" (PO-26) [VERIFY V8]

- Only when `features.subscribe` holds a one-time template ID (`app_config.subscribe`, Handoff H5). Without it the button never shows.
- Offered only after the player's own submit (已传出) or on a pending/claimed chain entry where they are a participant: [揭晓时提醒我] → `wx.requestSubscribeMessage({tmplIds:[id]})` from the tap.
  - `accept` → `subscribeReveal({chainId})` stores one grant (`sub_grants/<chainId>_<openid>`); "揭晓时会提醒你".
  - `reject` → hidden for this chain. `ban`/20004 → hidden on this device until settings change. Errors → toast "提醒未开启".
- **Sending:** at reveal, `modSweeper` sends one message per grant (claimed in a transaction, so at most one), deferred to 08:00 if the reveal happens between 22:00 and 08:00 BJT. Content: "你参与的接龙揭晓了" + the prompt text + the time. Tapping opens `r=<chainId>`.
- No reward; never required; never asked at launch; never re-asked after a refusal for that chain.

### 10.4 同题再传

From a reveal or teaser of a preset-prompt chain: start a new chain with the same prompt (counts as a normal start). With group context, it binds to the same group, so the group can compare two drifts of one prompt.

---

## 11. Ads (IAA only) [COMPLIANCE]

| Placement | Format | Trigger | Caps |
|---|---|---|---|
| 再开一条 | rewarded video | tap "▶ 看视频再开一条" after the 3 free starts | ≤ 2 per Beijing day |
| 今日彩笔 | rewarded video | tap "▶ 今日彩笔" on the draw screen before the first stroke, or in 设置 | 1 per day; unlocks 6 extra colours until 24:00 BJT (cosmetic, deterministic, no randomness) |
| After a reveal | interstitial | on leaving a reveal (返回) | not before the player's 3rd lifetime reveal; ≥ 180 s apart; ≤ 3 per day; never on the draw, describe, claim, entry or picker screens, never before a turn starts |
| List footer | banner | 本群接龙 and 我的接龙 in `ready`/`empty` states | `app_config.ads.banner.enabled`, **default off**; ≥ 24 pt gap; never near a primary button |

Rules (copied from [DJT] §12):
- Rewards only on `isEnded === true`; closing early grants nothing ("完整观看才能获得").
- Load error or no fill: grant the reward anyway **once per day per placement** ("暂无广告，本次免费"); a second failure grants nothing ("暂无广告，请稍后再试"). Server-side grants go through `grantReward({kind})`, which enforces the daily caps (rewards are cosmetic or a small start allowance, so the server trusts the client's completion signal within caps; INFERENCE, acceptable because nothing competitive is at stake).
- `disableFallbackSharePage: true`; a fallback-share launch grants nothing.
- Interstitial `show()` rejections 2001-2003 are skipped silently and don't count toward caps.
- Ads never auto-play; ad buttons show ▶ and 视频; no ad sits next to 画好了, 传出去, 接这一棒 or 举报.
- Interstitial caps are remote (`app_config.ads.interstitial`), clamped (`minGapSec ≥ 120`, `maxPerDay ≤ 4`).
- Stub mode (QA only) as in [DJT]; production ships `adMode: real`, and before 流量主 exists every placement behaves as no-fill.

---

## 12. Client view models

Strings are pre-formatted by logic, not by renderers (the [DJT] `vm.js` pattern). `?` = optional.

```ts
// Shared
type ChainId = string;             // 10-char base32
type Strokes = { v:1, s:number[][] };
type StepKind = 'draw'|'describe';
{ display:{ largeText:boolean, highContrast:boolean }, muted:boolean,
  features:{ subscribe:{tmplId:string}|null, updatableCard:boolean,
             banner:{enabled:boolean, adUnitId:string|null},
             interstitial:{enabled:boolean, minLifetimeReveals:number, minGapSec:number, maxPerDay:number} },
  ugc:{ createEnabled:boolean, viewEnabled:boolean } }

// Group context (memory only, per entry; §9.2)
{ status:'none'|'checking'|'ok'|'failed', groupRef:string|null, shareTicket:string|null, errCode?:number }

// Home
{ state:'loading'|'ready'|'offline'|'error',
  daily:{ dateText:'10月15日', prompts:[{id,text}], countText:string|null /* '全国已有 2,315 条从这里出发' */ },
  streakText:string|null,                       // '连续接龙 4 天' when ≥ 2
  start:{ freeLeft:0..3, adLeft:0..2, label:string, sublabel:string|null, enabled:boolean },
  groupLine:{ show:boolean, text:string /* '来自群聊 · 本群有 2 条等你接' */ },
  album:{ unseenReveals:number },
  restriction:{ text:string }|null, ugcPausedText:string|null,
  showHowToOnce:boolean, showRulesWarning:boolean }

// Rules sheet
{ version:number, open:boolean, pendingAction:'start'|'claim'|null }

// Picker
{ state:'ready'|'creating'|'error'|'offline',
  prompts:[{ id, text, isDaily:boolean }], selectedId:string|null,
  custom:{ open:boolean, text:string, count:string /* '5/12' */, error:string|null },
  canStart:boolean, errorText:string|null }

// Draw
{ chainId, claimId, step:1|3|5, title:'第 3 棒 · 画出来',
  source:{ kind:'prompt'|'text', text:string },     // what to draw
  canReport:boolean,                                  // false on 第 1 棒
  timer:{ secLeft:number, warn:boolean },
  palette:[{ idx:number, color:string, locked:boolean }], colorIdx:number, sizeIdx:0|1|2,
  strokes:Strokes, pointsUsed:number, pointsMax:4000,
  paletteAd:{ show:boolean /* before first stroke, not unlocked today */, state:'idle'|'loading'|'playing'|'error' },
  canUndo:boolean, canSubmit:boolean,
  status:'drawing'|'submitting'|'error'|'timeUp', errorText:string|null }

// Describe
{ chainId, claimId, step:2|4|6, title:'第 4 棒 · 猜一猜', drawing:Strokes, canReport:true,
  timer:{ secLeft, warn }, text:string, count:'7/16', canSubmit:boolean,
  status:'typing'|'submitting'|'blocked'|'busy'|'error'|'timeUp', errorText:string|null }

// 已传出
{ chainId, step, kind:StepKind, mine:{ strokes?:Strokes, text?:string },
  modState:'pending'|'passed'|'blocked'|'void', modText:string,
  nextText:string|null /* '通过后，群友就能接第 4 棒' */, autoUpdateNote:boolean,
  subscribe:{ state:'hidden'|'offer'|'requesting'|'granted'|'declined'|'unavailable' },
  firstTimeExplainer:boolean, revealed:boolean }

// Chain entry
{ state:'loading'|'claimable'|'taken'|'pending'|'prevMine'|'capReached'|'wrongGroup'
        |'revealedParticipant'|'revealedTeaser'|'expired'|'removed'|'notFound'
        |'restricted'|'rulesRequired'|'ugcPaused'|'offline'|'error',
  passed:0..6, length:6, nextStep:number|null, nextKind:StepKind|null,
  headline:string, subline:string|null, timeLeftText:string|null /* '还剩 31 小时' */,
  takenEtaText:string|null, isParticipant:boolean, isStarter:boolean,
  canRevealNow:boolean, canSameAgain:boolean,
  subscribe:{ state:… } }

// Reveal
{ state:'loading'|'ready'|'notParticipant'|'paused'|'offline'|'error',
  chainId, header:string /* '接龙揭晓 · 6 位群友 · 用时 5 小时' */, early:boolean, earlyText:string|null,
  prompt:{ text:string, custom:boolean },
  steps:[{ n:1..6, kind:StepKind, strokes?:Strokes, text?:string, mine:boolean,
           placeholder:null|'reported'|'deleted'|'paused',
           laughs:number, myLaugh:boolean, canReport:boolean }],
  summaryText:string /* '从「…」传成了「…」' */, nationalText:string|null,
  autoplay:{ enabled:boolean /* first open */, panel:number, playing:boolean },
  canSameAgain:boolean, interstitialDue:boolean }

// Teaser
{ state:'loading'|'ready'|'removed'|'notFound'|'offline',
  promptText:string, finalText:string|null, passed:number, canSameAgain:boolean }

// 本群接龙
{ state:'noGroup'|'checkingGroup'|'loading'|'ready'|'empty'|'error',
  statsText:string|null /* '本群已完成 12 条 · 共画了 41 幅画' */,
  waiting:[{ chainId, line:'第 4 棒 · 猜一句 · 已传 3/6' }],
  inProgress:[{ chainId, line:'第 3 棒审核中' }],
  revealed:[{ chainId, line:'「…」→「…」', participant:boolean }],
  banner:{ show:boolean, reservedHeight:number } }

// 我的接龙
{ state:'loading'|'ready'|'empty'|'error'|'offline', streakText:string|null,
  items:[{ chainId, status:'revealed'|'open'|'pending'|'expired'|'blocked'|'removed',
           line:string, timeText:string, unseen:boolean }], cursor:string|null,
  banner:{ show:boolean, reservedHeight:number } }

// Own-棒 detail (open/expired chains)
{ chainId, mine:[{ n, kind, strokes?, text?, modState, canDelete:boolean }] }

// Report sheet
{ open:boolean, target:{ chainId, step:number|0 /* 0 = teaser texts */ },
  reasons:['porn','politics','abuse','ad','other'], state:'idle'|'submitting'|'done'|'limit'|'dup'|'error' }

// Settings
{ muted, largeText, highContrast, canUnlockPalette:boolean, paletteUnlockedToday:boolean,
  deleteAll:{ state:'idle'|'confirm1'|'confirm2'|'deleting'|'done'|'error' } }
```

---

## 13. Backend (WeChat Cloud Development)

Patterns copied from `apps/dianjiangtai/cloudfunctions/` (README): `common/` helpers copied into each function by `scripts/sync-core.js` with a drift check; `core/` copied from the game; identity only from `cloud.getWXContext().OPENID` (read in `common/store.js` only); every function returns `{ok:true,…}` or `{ok:false, code, message}` and never throws to the client; explicit timeouts; `TZ=Asia/Shanghai` plus explicit UTC+8 date keys (`core/date.js`); uniqueness by deterministic `_id`s created with `add`; multi-document updates in `db.runTransaction`; counters with `db.command.inc`. **All collections deny direct client reads and writes**; cloud storage denies all client reads and writes (§13.3).

Environment variables (never committed): `GROUP_REF_PEPPER` (groupRef hash), `MODERATION_MODE`, `ENV_KIND`, `MOD_TEXT_DAILY_BUDGET` (dev), `MOCK_MEDIA_DELAY_SEC` (dev), `ADMIN_OPENIDS` (optional fallback), and, only if the HTTP-push fallback is used (§16, V1), `PUSH_TOKEN` and `PUSH_AES_KEY`. No AppSecret anywhere (cloud calls need none).

### 13.1 Collections

| Collection | Key fields | Notes |
|---|---|---|
| `chains` | `_id: chainId`, `starter` (openid), `openGId?`, `groupRef?`, `promptId?`, `promptText`, `custom:boolean`, `length: 6`, `state: starting/open/pending/revealed/expired/removed/abandoned`, `passed` (0-6), `nextStep`, `claim?: {openid, claimId, step, at, expiresAt}`, `stepIds[7]` (passed step `_id` per 棒; index 0 unused), `authors[7]` (openid per passed 棒), `participants[]` (openids), `perPersonCount: {<openid>: n}`, `createdAt`, `lastActivityAt`, `expiresAt`, `revealedAt?`, `revealReason?: complete/early/expiry`, `activityId?`, `activityExpiresAt?`, `dateKey` | one doc per chain; all claim/submit/verdict transitions are transactions on this doc. Index: `openGId + state + lastActivityAt`; `state + expiresAt`; `participants`; `createdAt` |
| `steps` | `_id: <chainId>_<n>_<attempt>`, `chainId`, `n`, `attempt`, `kind`, `author`, `text?`, `strokes?`, `fileID?` (PNG), `state: pending/passed/blocked/void/hidden/deleted`, `mod: {kind: text/image, traceIds[], suggest?, label?, submittedAt, verdictAt?, retries}`, `hiddenReason?: report/admin`, `laughs`, `createdAt` | content is served only through `claimStep`/`getReveal` checks. Index: `author + createdAt`; `chainId`; `state + mod.submittedAt` (sweeper) |
| `mod_traces` | `_id: trace_id`, `stepId`, `submittedAt`, `mock:boolean` | push lookup; idempotent verdict handling |
| `mod_log` | `_id: <stepId>_<k>`, `stepId`, `author`, `kind`, `textCopy?`, `fileID?`, `suggest`, `label`, `source: local/api/mock`, `ts` | admin-only evidence, incl. blocked content, 180 days |
| `mod_quota` | `_id: dateKey`, `text`, `image`, `errors` | quota guard and dev budget (§6.6-6.7) |
| `reports` | `_id: <reporterOpenid>_<stepId>`, `reporter`, `stepId`, `chainId`, `reason`, `state: open/upheld/dismissed`, `createdAt`, `resolvedAt?` | §7.1 |
| `players` | `_id: openid`, `rulesVersion`, `strikes: [{at, stepId, src: verdict/report}]`, `restrictedUntil?`, `permanent?`, `warnPending`, `day: {dateKey, starts, adStarts, steps, reports, palette, claims:{<chainId>:n}}`, `curStreak`, `bestStreak`, `lastStepDate`, `lifetimeReveals`, `lastActiveAt` | allowances, strikes, streak; the `day` block resets when `dateKey` changes |
| `group_members` | `_id: <openGId>_<openid>`, `openGId`, `openid`, `groupRef`, `firstSeen`, `lastSeen` | copied from [DJT]; written only by `joinGroup` |
| `group_stats` | `_id: openGId`, `started`, `revealed`, `drawings`, `lastActivityAt` | aggregate only |
| `reactions` | `_id: <stepId>_<openid>` | 笑 toggles; `steps.laughs` via `inc` |
| `sub_grants` | `_id: <chainId>_<openid>`, `tmplId`, `grantedAt`, `used`, `sentAt?`, `sendErrCode?` | §10.3 |
| `daily_stats` | `_id: dateKey`, `started`, `revealed`, `byPrompt: {<promptId>: n}` | aggregate, kept |
| `audit_log` | auto `_id`, `op`, `target`, `before`, `after`, `by`, `ts` | admin actions |
| `events` | `openid`, `sessionId`, `name`, `props`, `ts`, `clientTs` | analytics (copied `track`) |
| `rate_limits` | `<bucket>_<openid>_<minute>` | per-minute limits (copied) |
| `app_config` | `_id: 'live'`: `ugc: {createEnabled, viewEnabled, autoPausedUntil?}`, `subscribe: {tmplId, fields}`, `ads: {banner, interstitial}`, `features: {updatableCard}`, `timers: {drawSec, describeSec}`, `updatedAt` | console-edited; read by `getHome` (60 s cache) and by every UGC function for the kill switches (10 s cache). Missing → defaults (UGC enabled, optional features off) |
| `meta` | `launch` | launch date key for the daily prompt walk |

### 13.2 Cloud functions

| Function | In | Out | Notes |
|---|---|---|---|
| `getHome` | `{}` | `{dateKey, serverNow, daily:{prompts, counts}, me:{rulesVersion, restriction?, warnPending, startsLeft, adStartsLeft, paletteToday, streak}, features, ugc}` | 5 s |
| `agreeRules` | `{version}` | `{ok}` | sets `rulesVersion`; 5 s |
| `joinGroup` | `{groupData: CloudID}` | `{ok, groupRef}` | copied from [DJT]; 5 s [VERIFY V6] |
| `createChain` | `{promptId?, customText?, groupRef?}` | `{chainId, claim:{claimId, step:1, kind:'draw', expiresAt, sourceText}}` | checks rules, restriction, kill switch, quota guard, start allowance (checked here, **consumed at 第 1 棒 submit**); custom text moderated first (§6.2); binds the group if `groupRef` is valid; creates the activity id lazily on first share; 8 s |
| `getChain` | `{chainId, groupRef?, wantActivity?}` | the §12 chain-entry fields + `activityId?` | never returns content; 5 s |
| `claimStep` | `{chainId, groupRef?}` | `{claimId, step, kind, expiresAt, prev: {kind:'text', text} | {kind:'draw', strokes}}` | transaction (§3.5); binds an unbound chain; returns placeholders if `viewEnabled` is false; 5 s |
| `releaseClaim` | `{chainId, claimId}` | `{ok}` | 5 s |
| `submitStep` | `{chainId, claimId, text?, strokes?, clientMs, undoCount}` | `{state:'passed'|'pending', step, chainState, revealed:boolean}` or `TEXT_REJECTED`/`TEXT_BLOCKED`/`MODERATION_BUSY`/`CLAIM_LOST`/`INVALID_STROKES` | claim check; text: §6.2; drawing: validate → rasterise → upload → `mediaCheckAsync` (§6.3); updates allowances, streak, `group_stats`, `daily_stats`; on a passing 第 6 棒 reveals; 10 s; needs openapi permissions `security.msgSecCheck`, `security.mediaCheckAsync`, `updatableMessage.setUpdatableMsg` in `config.json` |
| `onMediaCheck` | push event `wxa_media_check` | `success` | §6.3 step 6; idempotent by `trace_id`; rejects calls that carry an OPENID (client) with `FORBIDDEN`; 5 s [VERIFY V1] |
| `modSweeper` | timer `0 */5 * * * * *` | | moderation timeouts and retries (§6.3), mock verdicts (dev), chain expiry (§3.6), reveal notices (§10.3, quiet hours), updatable-message updates that failed, circuit breaker (§6.8), quota alerts, report-age alert; idempotent; 60 s |
| `getReveal` | `{chainId}` | §12 reveal fields | participants only (`NOT_PARTICIPANT` with teaser fields otherwise); 5 s |
| `revealNow` | `{chainId}` | `{ok}` | starter only; ≥ 4 passed; no claim or pending; 5 s |
| `laugh` | `{chainId, step}` | `{laughs, mine}` | participants; toggle; 5 s |
| `report` | `{chainId, step, reason}` | `{ok, hidden:true}` | §7.1; transaction with the chain doc when it reopens a 棒; 5 s |
| `getMyChains` | `{cursor?}` | list | 5 s |
| `getGroupChains` | `{groupRef}` | §12 fields | membership check (copied from [DJT] `getBoard`); 5 s |
| `deleteMyStep` | `{chainId, step} | {all:true}` | `{ok, count}` | §7.4; 10 s |
| `subscribeReveal` | `{chainId}` | `{ok}` | participant only; template ID from `app_config`; 5 s [VERIFY V8] |
| `grantReward` | `{kind:'start'|'palette', noFill:boolean}` | `{ok, startsLeft?, paletteToday?}` | daily caps (§11); 5 s |
| `admin` | `{op, …}` | per op | §7.2; console only; 20 s |
| `track` | `{events[]}` | `{ok}` | copied from [DJT]; 5 s |
| `cleanup` | timer `0 0 4 * * * *` | | §7.5; also deletes storage files; 120 s |

**Error codes** (in addition to the copied `UNAUTHENTICATED`, `FORBIDDEN`, `RATE_LIMITED`, `NOT_MEMBER`, `NOT_GROUP`, `BAD_CLOUDID`, `SERVER_CONFIG`, `INTERNAL`): `RULES_REQUIRED`, `RESTRICTED` (+`until`), `UGC_PAUSED`, `UGC_BUSY`, `START_LIMIT`, `STEP_LIMIT`, `CLAIM_LIMIT`, `REPORT_LIMIT`, `CHAIN_NOT_FOUND`, `CHAIN_CLOSED`, `TAKEN`, `PENDING`, `PREV_MINE`, `CAP_REACHED`, `NEED_GROUP`, `WRONG_GROUP`, `CLAIM_LOST`, `INVALID_STROKES`, `TEXT_REJECTED` (local), `TEXT_BLOCKED` (API), `MODERATION_BUSY`, `NOT_PARTICIPANT`, `NOT_STARTER`, `TOO_EARLY` (revealNow < 4), `DUP_REPORT`, `OWN_STEP`, `NO_TEMPLATE`.

### 13.3 Drawing storage [COMPLIANCE]

- **Path:** `chuanhua/mod/<YYYYMM>/<chainId>/<n>_<attempt>.png` (one PNG per drawing attempt, 512 × 512, typically 10-40 KB).
- **Who writes:** only `submitStep` (server, admin rights). Clients never upload files.
- **Who reads:**
  - the moderation service, through a temp URL (`maxAge` 7,200 s) created for that check only;
  - admins, through `admin` (`getStep`, `listReports`, `sample`) with 10-minute temp URLs, or the console.
  - **No client ever reads the PNG.** Participants see drawings as strokes from `claimStep` (the claimant of the next 棒, after a pass) and `getReveal` (participants, after reveal). Those functions are the access check: a drawing is "readable only by chain participants" because the only path to its content checks participation (or the active claim).
- **Storage security rule:** custom rule `{"read": false, "write": false}` for all client access (`storage.rules.json`, applied in the console) [VERIFY V9: custom storage rules in a mini game environment; fallback: the default "仅创建者及管理员可读写" rule, which also denies other users because the creator is the server].
- **Deletion:** `cleanup` after 180 days; `removeChain` and author deletion do not delete PNGs early (evidence, §7.4).

### 13.4 Code layout (copy, never import)

```
apps/chuanhua/
  game/
    game.js, game.json, project.config.json
    core/      date.js, rng.js (copied from dianjiangtai), config.js, daily.js, chain.js (eligibility,
               states), strokes.js (encode/decode/validate), text.js (rules, contact patterns),
               content/prompts.v1.js, content/blocklist.v1.js          ← all .js, no JSON content
    js/        main.js, controller.js, vm.js, api.js, share.js, ads.js, analytics.js, store.js,
               util.js, keyboard.js, mock-server.js, render/(home, picker, draw, describe, sent,
               entry, reveal, teaser, group, album, sheets, settings, shareCard, strokes, layout,
               theme, widgets).js                                       ← patterns copied from dianjiangtai
    tests/     harness.js + fake wx (copied), unit and smoke tests
  cloudfunctions/
    common/    store.js, util.js, moderation.js, raster.js, png.js, groups.js (copied/adapted)
    <fn>/      index.js, package.json, function.config.json, config.json (timers, openapi perms)
    scripts/sync-core.js (copied), database/rules.json, storage.rules.json, tests/
```
`apps/chuanhua/` never `require`s anything outside itself. The game uses no open data domain.

---

## 14. Analytics events

Through our own `track` (copied from [DJT] §15: batched, top-level `sessionId`, `clientTs`, common props `isNewUser`, `appVersion`, `promptsVersion`). `wx.reportEvent` is not used. Events never carry user text, strokes, openids or group ids.

| Event | Props | Fires when |
|---|---|---|
| `session_start` | `scene`, `fromCard: none/invite/reveal/notice`, `hasShareTicket` | cold start or new session |
| `card_open` | `cardKind: invite/reveal`, `hasShareTicket`, `chainState` | entry from a card |
| `group_join` | `result`, `errCode?`, `scene`, `chatType?` | each `joinGroup` |
| `rules_view` / `rules_agree` | `trigger: start/claim` | 公约 shown / agreed |
| `picker_view` | `source: home/same_again` | |
| `prompt_pick` | `source: daily/batch/custom/same_again`, `promptId?`, `batchCount` | 开始画 tapped |
| `custom_prompt_result` | `result: pass/local/review/risky/busy` | |
| `chain_create` | `chainId`, `bound:boolean` | `createChain` ok |
| `claim_attempt` | `chainId`, `step`, `result: ok/taken/pending/prevMine/cap/wrongGroup/needGroup/restricted/closed/error` | 接这一棒 |
| `step_view` | `chainId`, `step`, `kind` | previous 棒 shown |
| `step_submit` | `chainId`, `step`, `kind`, `durationMs`, `auto:boolean`, `strokes?`, `points?`, `undoCount?`, `chars?`, `colorsUsed?`, `palette:boolean` | submit tapped or auto |
| `step_release` | `chainId`, `step`, `reason: quit/timeUp/claimLost` | |
| `step_result` | `chainId`, `step`, `kind`, `result: passed/pending/blocked/busy/rejected` | `submitStep` response |
| `mod_verdict` (server) | `kind: text/image`, `suggest`, `label?`, `latencyMs`, `retry:boolean`, `mock:boolean` | every verdict |
| `mod_void` (server) | `kind`, `reason: timeout/error` | |
| `chain_reveal` (server) | `reason: complete/early/expiry`, `passed`, `participants`, `durationMin`, `custom` | |
| `chain_expire` (server) | `passed` | |
| `reveal_view` | `chainId`, `role: participant/teaser`, `autoplay:boolean`, `skippedAt?`, `replays` | |
| `laugh` | `chainId`, `step`, `on:boolean` | |
| `report_submit` | `reason`, `target: step/teaser`, `reopened:boolean` | |
| `share_tap` | `kind: invite/reveal/menu`, `chainState`, `step?` | share API called |
| `share_update` (server) | `result`, `errCode?` | `setUpdatableMsg` |
| `subscribe_offer` / `subscribe_result` / `subscribe_send` (server) | as [DJT] | |
| `same_again` | `fromRole: participant/teaser` | 同题再传 |
| `group_list_view` / `album_view` | `state`, `counts` | |
| `delete_step` | `scope: one/all`, `count` | |
| `restriction_shown` | `level` | |
| `ad_request` … `ad_error`, `interstitial_show` | `placement: start/palette/interstitial/banner`, `stub` | ad lifecycle (as [DJT]) |
| `ugc_pause` (server) | `source: switch/breaker/quota`, `on:boolean` | |
| `strike` / `restrict` (server) | `src`, `level` | |
| `error` | `where`, `code` | handled errors |

**KPI definitions (post-launch, no gate).** Chain completion = chains with ≥ 4 passed 棒 within 48 h ÷ chains whose 第 1 棒 passed. Steps per active player = passed 棒 ÷ players with ≥ 1 `step_submit`. Invite open → claim = `card_open(invite)` followed by `claim_attempt(ok)` in the session ÷ `card_open(invite)`. Reveal share rate = revealed chains with ≥ 1 `share_tap(reveal)` ÷ revealed chains. Moderation: image `latencyMs` p50/p95, block rate (`blocked` ÷ verdicts), void rate, report rate (reports ÷ passed 棒). D1/D7 as in [DJT] §15.

---

## 15. Privacy data inventory (for the 用户隐私保护指引) [COMPLIANCE]

| Data | Purpose | Source | Stored | Retention |
|---|---|---|---|---|
| OpenID | identify players, claims, authorship, allowances, restrictions | cloud function context | `chains`, `steps`, `players`, `reports`, `reactions`, `sub_grants`, `group_members`, `events` | 180 days after last activity |
| **User-generated drawings** (strokes and a server-rendered PNG) | show to the next player in the chain and to the chain's participants at the reveal; content-safety checks; handling reports | the player's drawing | `steps.strokes`; PNG in cloud storage (server/admin only); copies sent to WeChat's content-security service | 180 days; author deletion stops display immediately, evidence copy kept until 180 days |
| **User-generated text** (custom prompts, descriptions) | as above; texts of a revealed chain may appear in the share card the player chooses to send | the player's input | `steps.text`, `chains.promptText`, `mod_log` | 180 days, as above |
| Moderation results (verdict, label, trace id) | content safety, strikes | WeChat security APIs | `steps.mod`, `mod_log`, `mod_traces` | 180 days |
| Reports (reporter openid, item, reason) | content safety | the reporter's tap | `reports` | 180 days |
| Strikes and restrictions | repeat-offender handling | derived | `players` | 180 days after last activity |
| Group id (openGId) and membership | bind chains to a group, group list, group stats | `getGroupEnterInfo` → `joinGroup` (cloudID) | `group_members`, `chains.openGId`, `group_stats` (client sees an opaque `groupRef`) | 180 days after last seen |
| Reactions (笑) | show counts | tap | `reactions` | 180 days |
| Subscribe grant | send the one reveal notice the player asked for | `requestSubscribeMessage` tap | `sub_grants` | 180 days |
| Allowance counters, streak, rules agreement | daily caps, streak display, 公约 record | derived | `players` | 180 days after last activity |
| Analytics events | KPIs, bugs | client | `events` | 180 days |
| Display and sound settings | preferences | user | device storage | until changed |
| Ad data | ad delivery | WeChat ad SDK | not by us | per WeChat |

**Not collected:** nickname, avatar, phone, location, contacts, album (we neither read nor write it), camera, microphone, clipboard, age, real name, payment data. **No privacy interface** (in WeChat's sense) is called: no open data domain, no `setUserCloudStorage`, no album, no location. The 用户隐私保护指引 still describes every row above in its free-text sections, with the purpose text "你在接龙中创作的画和文字，会经过内容安全审核后展示给同一条接龙的参与者" [VERIFY V12: whether the MP privacy form needs a specific item for UGC]. Data stays in mainland WeChat Cloud; WeChat's content-security service processes copies for checks (declared). The 用户协议 (content rules, licence to display a player's content within the chain, reporting, restrictions) is written by release and linked from the 公约 and 设置.

---

## 16. Platform facts to verify, and the device pass

### 16.1 VERIFY items

| # | Item | Design depends on | Fallback |
|---|---|---|---|
| **V1** | **`wxa_media_check` push routed to a cloud function in a mini game cloud environment** (cloud dev "消息推送" with event type `wxa_media_check` → `onMediaCheck`) | every drawing | (a) MP 消息推送 to the cloud environment's **HTTP access service** URL for `onMediaCheck`, verifying the signature with `PUSH_TOKEN` (and `PUSH_AES_KEY` if encrypted mode is required); (b) an HTTPS server on an ICP-filed domain (costs money: founder decision); (c) if none works, drawings cannot be shown and the game **cannot launch**: the CTO escalates to the founder. This is the first item of the device pass and should be spiked as soon as the AppID exists |
| V2 | Real `mediaCheckAsync` latency (p50/p95) and that "within 30 minutes" holds | UX copy "通常几分钟"; 35-min timeout | adjust copy and the timeout (config) |
| V3 | `msgSecCheck` / `mediaCheckAsync` v2 parameters, scene 3, error codes (61010, quota), the 100/day pre-publish limit, cloud-call permission in mini games | §6 | scene 2 if 3 misbehaves; mock mode in dev |
| V4 | `wx.showKeyboard` family in mini games, Chinese IME, confirm key | describe step, custom prompt | `wx.showModal({editable:true})` input |
| V5 | Canvas touch drawing: smoothness at 60 fps on a mid-range Android; PC WeChat with a mouse | drawing tool | lower point density; PC: allow mouse via touch mapping or show "请在手机上画" |
| V6 | Group entry: `getGroupEnterInfo` + cloudID decrypt in `joinGroup` (as [DJT] E1) | group binding | without group context nobody can claim → launch blocker for the core loop; escalate (as V1) |
| V7 | Updatable messages (`createActivityId`, `setUpdatableMsg`) together with `withShareTicket` | invite card progress | static invite cards (`features.updatableCard: false`) |
| V8 | `requestSubscribeMessage` in a mini game; `subscribeMessage.send` from a cloud function; notice opens with the query | reveal notice | feature hidden |
| V9 | Custom cloud storage security rules in a mini game environment | §13.3 | default creator-only rule |
| V10 | Pure-JS rasterisation + PNG encoding time and memory in a cloud function (4,000 points) | `submitStep` latency | lower PNG to 384 × 384; raise the timeout |
| V11 | The moderation service can fetch the cloud-storage temp URL | §6.3 | a longer `maxAge`, or a public-read path for a short-lived object (admin delete after verdict) with CTO sign-off |
| V12 | Privacy-guide form fields for UGC; whether the mini game needs extra category qualifications for UGC (《小游戏审核规范》, 社交/UGC) | release pack | founder files the qualification (Handoff H3) |
| V13 | Platform 防沉迷 and real-name handling for IAA mini games without 版号 (the [DJT] D14 clearance covered 点将台 only) | release | founder/counsel check (H10) |
| V14 | Console test invocation of `admin` carries no OPENID | admin path | `ADMIN_OPENIDS` env |
| V15 | `callFunction` response size for `getReveal` (3 drawings ≤ 96 KB) | reveal | fetch drawings per 棒 |

### 16.2 Founder's device pass (before submission)

Same setup as [DJT] §17.1: release-candidate 体验版 on one iOS and one Android phone (current WeChat), plus two more accounts in a test group, "不校验合法域名" off. QA observes and records; minigame-dev and backend on call. Prerequisites: Handoff H1-H8.

1. **V1/V2/V3/V11:** draw 10 drawings in `live` mode (dev budget guard on); confirm push arrival at `onMediaCheck`, record latency p50/p95, check one deliberately borderline test drawing (abstract shapes only, nothing offensive) gets a verdict; submit descriptions incl. a contact-number pattern (local rejection) and normal texts; confirm text verdicts and the budget guard.
2. **V6:** share an invite card into the test group; open from the second account; confirm group binding and claim; open from a single chat; confirm "接龙只能在发起的群里接力".
3. Full chain with **2 accounts** (A 1/3/5, B 2/4/6) and with 3 accounts; simultaneous 接这一棒 from two phones (one wins, one sees 被抢先一步).
4. **V4/V5:** keyboard input in Chinese; drawing smoothness; PC WeChat behaviour.
5. **V7:** updatable card count increases after each pass; shareTicket still present on open.
6. **V8:** subscribe accept → one notice at reveal, opening the reveal.
7. Report a 棒 from the claim screen and from a reveal; confirm instant hiding on the other phone; run `admin listReports`/`upholdReport` from the console (V14); confirm strike and a 24 h restriction after two upheld reports on a test account.
8. Kill switches: `viewEnabled: false` hides content on both phones within 10 s; `createEnabled: false` blocks starts and claims.
9. Rewarded and interstitial (stub, or real if 流量主 exists) with `disableFallbackSharePage: true`.
10. V9/V10/V15 measured by backend in the console during the pass.

**Exit criteria:** E1 V1 works by the primary or fallback (a) route, else stop and escalate. E2 group binding works on both platforms, else stop and escalate. E3 a 6-棒 chain completes with 2 and with 3 accounts, the reveal shows only passed content, and non-participants get only the teaser. E4 reports hide instantly; admin ops work. E5 every other VERIFY row either passes or its fallback is applied and re-verified by QA. E6 results recorded in `docs/chuanhua/device-pass-<date>.md` by QA and this table updated.

---

## 17. Edge cases

1. **Offline at launch:** home shows the offline state; 我的接龙 shows the cached list; nothing can be claimed or submitted.
2. **Network drop during a turn:** the timer continues; submit retries; if the claim was lost meanwhile, `CLAIM_LOST` and the work is discarded (message as §3.5). Drawings are never queued for later upload (they'd be stale claims).
3. **Double tap on submit / retry after timeout:** `submitStep` is idempotent per `claimId` (the same claim returns the stored result).
4. **Two players tap 接这一棒 at the same moment:** one transaction wins; the other gets `TAKEN` (§3.5).
5. **Claim expires, nobody else claimed, late submit arrives:** accepted (§3.5).
6. **Previous 棒 reported while I hold the next claim:** my claim is cancelled with "上一棒已被隐藏，本棒取消" (or, if I reported it, I may take the reopened 棒).
7. **Drawing verdict arrives after the step was voided by timeout:** ignored (logged), except a `risky` still adds a strike.
8. **Duplicate push for the same `trace_id`:** idempotent.
9. **Push for an unknown `trace_id`:** logged, ignored.
10. **Starter abandons 第 1 棒:** chain `abandoned`, start not consumed, deleted after 1 day.
11. **第 1 棒 blocked on an unbound chain:** the starter (the only eligible person without group context) may claim it again; the chain stays theirs until shared.
12. **Chain shared into group A, later card sent to group B:** group B entries see "接龙只能在发起的群里接力".
13. **A player leaves the group:** their membership row ages out after 30 days for claiming; already-authored 棒 stay; they keep participant access to the reveal (participation, not membership, grants reveal access).
14. **The same person in two groups:** chains are per group; 我的接龙 lists all.
15. **Expiry while a claim/pending is active:** waits (§3.6).
16. **Starter reveals early while someone is about to claim:** `revealNow` requires no active claim/pending; a racing claim either wins (reveal refused, `TOO_EARLY`/`CHAIN_CLOSED` copy "有群友正在接，稍后再揭晓") or loses (`CHAIN_CLOSED` → reveal state).
17. **Author deletes the latest passed 棒 of an open chain:** that 棒 reopens; an active claim on the next 棒 is cancelled.
18. **Author deletes all content:** reveals show placeholders for their 棒; open chains reopen their latest 棒 if it was theirs.
19. **Restricted mid-turn** (a `risky` verdict on an earlier drawing arrives): the current claim may finish; the restriction applies to the next action.
20. **Midnight BJT during a turn:** allowances are counted on the server date at submit; the 今日起点 card refreshes on `onShow` after the date changes (server time, never the device clock).
21. **App killed during a turn:** on relaunch the client re-opens the chain entry; if the claim is still valid, the turn resumes with the remaining server time (strokes kept in local storage per `claimId`, deleted after submit or expiry).
22. **App killed during a reveal:** the reveal is server data; it reopens as the full strip.
23. **Moderation outage:** circuit breaker pauses creation (§6.8); pending drawings stay pending, then void after the timeouts; nothing unchecked is shown.
24. **Image quota near the limit:** §6.7.
25. **`viewEnabled: false` during a turn:** the next `claimStep` returns no content; an active turn already showing content is unaffected until the client's next fetch (≤ 10 s config cache); reveals show placeholders.
26. **Warm start from a new card during a turn:** deferred (§9.5).
27. **Hidden 棒 in the middle of a revealed chain:** placeholder; auto-play skips it; the summary line still uses prompt and final text if both are visible, else "传了 6 棒".
28. **Final 棒 (第 6) hidden after reveal:** the summary and reveal card use the latest visible sentence; if none, "传了 6 棒，看看变成了什么".
29. **Custom prompt chain reported at the prompt:** the whole chain is hidden ("该接龙已被举报隐藏"), since every 棒 derives from it; admin may restore.
30. **Small screens (320 × 568) and large text:** the canvas shrinks to fit width; tools wrap to two rows; nothing clipped.
31. **Remote config unreadable:** UGC enabled, optional features off, timers default.
32. **Dev environment out of text budget:** `MODERATION_BUSY` (fail closed).

---

## 18. Founder Handoff (compiled by release into `docs/chuanhua/release/HANDOFF.md`)

None of these blocks the build; each step's exact values and files come from the release pack. Order matters.

| # | Founder item | Needed for | If not done |
|---|---|---|---|
| H1 | **Register a new mini game AppID** under the Beijing company (same entity as 点将台); game category per the release pack; name check for 传画接龙 with fallbacks (direction §8) | everything | nothing can be deployed |
| H2 | **WeChat 认证** for the new AppID (fee: money, founder) | submission, some open abilities | submission waits |
| H3 | **小程序/小游戏备案** with the release pack's service description; check whether UGC needs extra category qualification (V12) and file it | submission | submission waits |
| H4 | Create the cloud environment; deploy functions; set env vars (`GROUP_REF_PEPPER`, `ENV_KIND=prod`, `MODERATION_MODE=live`; no mock vars in prod); timeouts and `TZ`; create collections, DB rules and storage rules; indexes (backend README) | all server features | n/a |
| H5 | **Content-security setup:** enable the security API cloud-call permissions; configure **message push** for event `wxa_media_check` → cloud function `onMediaCheck` (or fallback (a): HTTP access service URL + `PUSH_TOKEN`/`PUSH_AES_KEY` in env, values never pasted in chat); create the `app_config` document | drawings (V1) | drawings never pass: the game is unusable |
| H6 | 用户隐私保护指引 text (release pack) and the 用户协议 hosting/linking | submission | submission waits |
| H7 | Subscribe template "接龙揭晓了" (a status field, a text field, a time field) into `app_config.subscribe` | §10.3 | feature hidden |
| H8 | 流量主 activation and ad unit IDs (rewarded, interstitial, banner) into config | §11 | no-fill behaviour, banner off |
| H9 | **Name an ops owner for content safety** (the founder or a delegate with console access) and commit to the §7.2 routine (daily `listReports` + `sample` for 4 weeks, then every 2 days) | operating UGC responsibly | reported items stay hidden (safe), but strikes and restores lag |
| H10 | **Counsel check:** duties under 《未成年人网络保护条例》 and UGC rules for a group-only game; 180-day retention incl. author-deleted evidence; 防沉迷/版号 position for an IAA-only game (V13) | submission | submission waits |
| H11 | If the image-quota alert fires (70% of 200,000/day), request a higher `mediaCheckAsync` quota from WeChat | scale | new chains pause at 95% |
| H12 | **Device pass** (§16.2) on iOS and Android | submission | submission waits |
| H13 | Content review sign-off: the 423 prompts (Appendix B) and the local blocklist | submission | submission waits |
| H14 | 软著 filing with the release pack materials (optional before launch, per founder) | IP | n/a |
| H15 | Approve the upload and the release | submission | n/a |

---

## 19. Acceptance criteria (v1)

QA tests these with the fake-`wx` harness, the cloud-function test harness (fake DB, mocked SDK, `MODERATION_MODE=mock`, controlled clock) and, where marked **[device]**, in the founder's device pass. "Pass" means moderation verdict `pass`.

**Chain shape and rules**
1. A chain has a prompt and exactly 6 棒; 棒 1, 3, 5 are drawings and 棒 2, 4, 6 are descriptions; `submitStep` rejects a text for a draw 棒 and strokes for a describe 棒.
2. `createChain` gives the starter a claim on 第 1 棒 with the prompt as source; no other player can claim 第 1 棒 while that claim is valid.
3. A start is counted only when 第 1 棒 is submitted; an abandoned 第 1 棒 leaves `startsLeft` unchanged and the chain becomes `abandoned`.
4. A player who authored 棒 n cannot claim 棒 n+1 (`PREV_MINE`).
5. A player with 3 passed or pending 棒 in a chain cannot claim another (`CAP_REACHED`); blocked or voided attempts don't count.
6. Two accounts alternating (1/3/5 and 2/4/6) can complete a chain; the reveal shows all 6 棒.
7. Claiming requires a `group_members` row for the chain's group with `lastSeen` ≤ 30 days; otherwise `WRONG_GROUP` or `NEED_GROUP`, and the entry shows "接龙只能在发起的群里接力".
8. An unbound chain becomes bound to the group of the first claim made with valid group context; afterwards claims from another group fail.
9. Of two concurrent `claimStep` calls for the same 棒, exactly one succeeds; the other returns `TAKEN` (test runs 50 concurrent races).
10. `getChain` never returns prompt text, 棒 text or strokes for an unrevealed chain (schema test on every state).
11. `claimStep` returns the previous 棒's content only to the caller who now holds the claim, and only if that 棒 is `passed` and not hidden/deleted.
12. A claim expires after 150 s; a submit after expiry is accepted if nobody else claimed since, and rejected with `CLAIM_LOST` otherwise.
13. A chain whose latest 棒 is `pending` cannot be claimed (`PENDING`), and the entry shows "第 N 棒审核中".
14. The draw timer is 60 s and the describe timer 45 s (config); at 0 a drawing with ≥ 1 stroke and a text with ≥ 2 valid characters are submitted automatically; otherwise the claim is released.
15. When 第 6 棒 passes, the chain is `revealed` with `revealReason: complete` in the same `submitStep` call, and the response has `revealed: true`.
16. `revealNow` works only for the starter, with ≥ 4 passed 棒 and no active claim or pending 棒; otherwise `NOT_STARTER`, `TOO_EARLY` or `CHAIN_CLOSED`.
17. At 48 h, `modSweeper` reveals a chain with ≥ 4 passed 棒 (`expiry`) and expires one with fewer; it waits while a claim or pending 棒 is active.
18. Daily caps hold: 3 free starts + ≤ 2 rewarded, 40 submitted 棒, 3 claims per chain, 10 reports; each returns its error code when exceeded and resets at 00:00 BJT by server time.
19. Claiming, starting and submitting are refused for restricted players (`RESTRICTED` with `until`), for players without the current `rulesVersion` (`RULES_REQUIRED`), and when UGC creation is paused (`UGC_PAUSED`).
20. The chain state machine never moves a `revealed`, `expired` or `removed` chain back to `open` (property test over random operation sequences).

**Drawing tool and strokes**
21. The canvas is square, draws with one finger, and ignores a second finger and touches starting outside it.
22. Six base colours and three sizes are available; the six 彩笔 colours are selectable only after the rewarded unlock that day, and are gone after 24:00 BJT.
23. 撤销 removes exactly the last stroke; 清空 asks for confirmation and empties the canvas; 画好了 is disabled with 0 strokes.
24. The stroke encoder/decoder round-trips any drawing exactly (property test, 1,000 random drawings).
25. `submitStep` rejects strokes over the limits (> 200 strokes, > 4,000 points, > 600 points per stroke, coordinates outside 0-1023, colour > 11, size > 2, JSON > 32 KB) with `INVALID_STROKES`.
26. The client blocks new strokes at 4,000 points with "画得太细啦，先交吧".
27. The server rasterises a 512 × 512 PNG from the strokes; a golden-image test shows the client renderer and the server rasteriser produce the same pixels within an anti-aliasing tolerance (≥ 98% of pixels equal at 512 × 512).
28. No client code path uploads an image file (code search: no `uploadFile` in `apps/chuanhua/game`).
29. No client receives a PNG URL or fileID from any function except `admin` (schema test).
30. Drawings shown to the next player and in the reveal are rendered from strokes and match the passed content.
31. The reveal replays each drawing stroke by stroke in 2.5 s ± 0.2 s whatever its stroke count; a tap skips to the full strip.
32. **[device]** Drawing is smooth (no visible lag) on a mid-range Android at 60 s of continuous drawing.

**Text input**
33. Descriptions accept 2-16 code points and custom prompts 2-12; emoji and disallowed symbols are dropped on input.
34. Text with ≥ 5 digits (incl. full-width and 一二三… forms), a URL/domain, or a contact word (微信, wx, vx, QQ, 加我, 群号, 电话) is rejected locally with "换个说法吧" and no API call.
35. Text matching the local blocklist is rejected locally without an API call and without a strike.
36. **[device]** The describe input works with the system Chinese keyboard on iOS and Android, or the modal-input fallback is in place.

**Moderation: text**
37. Every custom prompt and description reaches `msgSecCheck` v2 with `scene: 3`, `version: 2` and the author's openid from the context, before it is stored as passed (mocked SDK asserts the call and parameters).
38. `pass` makes the text visible; `review` blocks it with no strike; `risky` blocks it and adds one strike; in both block cases the author keeps the claim and the text.
39. An API error, timeout or quota error returns `MODERATION_BUSY`, stores nothing, and shows nothing to anyone.
40. A blocked custom prompt creates no chain.
41. Blocked texts are written to `mod_log` and are never returned by `getChain`, `claimStep`, `getReveal` or `getGroupChains`.

**Moderation: drawings**
42. Every drawing submission uploads the server PNG and calls `mediaCheckAsync` v2 with `media_type: 2`, `scene: 3`, the author's openid and a temp URL; the step is stored `pending` with the `trace_id`.
43. No content of a `pending` 棒 is returned to anyone but its author.
44. `onMediaCheck` with `pass` marks the step `passed` and opens the next 棒; with `review` it blocks with no strike; with `risky` it blocks and adds a strike; the 棒 then reopens.
45. `onMediaCheck` is idempotent per `trace_id`, ignores unknown traces, and rejects client calls (`FORBIDDEN`).
46. A drawing pending for 35 min gets exactly one re-check; still no verdict 35 min later, it becomes `void`, no strike, the author's allowance is restored, and the 棒 reopens.
47. A `mediaCheckAsync` call error is retried at most twice by `modSweeper`, then the step becomes `void`; it is never shown meanwhile.
48. A late `risky` verdict for a voided step adds a strike but changes no visibility.
49. The author sees their pending drawing marked 审核中, and later 已通过 / 没通过 / 审核超时 in 我的接龙; other players see only "第 N 棒审核中" and never learn of a block.
50. **[device]** A drawing submitted on a real AppID receives its verdict through the configured push route (primary or fallback (a)); latency p50/p95 are recorded.

**Fail closed, kill switches, quotas**
51. With `MODERATION_MODE=mock` and `ENV_KIND=prod`, every UGC function returns `SERVER_CONFIG` and logs `[ALERT]`.
52. In dev `live` mode, `msgSecCheck` is called at most `MOD_TEXT_DAILY_BUDGET` times per day; beyond that, text submissions fail with `MODERATION_BUSY`.
53. `app_config.ugc.createEnabled: false` blocks `createChain`, `claimStep` and `submitStep` within 10 s; viewing revealed chains still works.
54. `app_config.ugc.viewEnabled: false` makes `claimStep` and `getReveal` return placeholders and no content within 10 s.
55. With ≥ 50% moderation failures over ≥ 20 calls in 5 minutes, `modSweeper` pauses creation for 15 minutes and logs `[ALERT]`.
56. At 95% of the daily image quota `createChain` returns `UGC_BUSY`; at 100%, drawing submissions return `MODERATION_BUSY`.
57. Every collection and the storage path deny direct client reads and writes (security-rule tests); all identity comes from the context OPENID.

**Reports, takedown, offenders**
58. 举报 is available on the previous 棒 in a claim, on every 棒 in a reveal, and on the teaser; it is not shown on the player's own 棒.
59. Submitting a report hides the item for every viewer immediately (next fetch returns the placeholder) and creates one `reports` row; a second report by the same player returns `DUP_REPORT`.
60. Reporting the latest passed 棒 of an open chain reopens that 棒 and cancels any active claim on the next 棒 (the reporter's own claim is released with the offer to take the reopened 棒).
61. Reporting a custom prompt (teaser target) hides the whole chain for everyone.
62. `admin` called with a client OPENID (not in `ADMIN_OPENIDS`) returns `FORBIDDEN`; every admin op writes `audit_log`.
63. `upholdReport` keeps the item hidden and adds a strike; `dismissReport` with `restore` unhides it unless that would expose content in an open chain's claim path.
64. `removeChain` makes every view of the chain show "该接龙已被移除" and stops updatable-card updates.
65. The strike ladder applies over a rolling 30 days: 1 → warning sheet once; 2 → 24 h; 3 → 7 days; ≥ 4 → 30 days and admin flag; `review` verdicts and local rejections add no strike.
66. A restricted player can still open reveals of chains they took part in and 我的接龙, and sees the restriction copy with the end time.
67. `modSweeper` logs `[ALERT]` when an open report is older than 48 h.
68. **[device]** A report on one phone hides the item on the other phone on its next fetch; `listReports` and `upholdReport` work from the console.

**Retention, deletion, privacy, minors**
69. `cleanup` deletes chains, steps, PNG files, traces, mod logs, reports, reactions, grants, audit entries and events older than 180 days, and inactive `players`, `group_members` and `group_stats` after 180 days; re-running deletes nothing new.
70. Abandoned chains are deleted after 1 day.
71. 删除这一棒 removes the strokes/text from `steps`, shows "作者已删除这一棒" to all viewers, reopens the 棒 if it was the latest passed 棒 of an open chain, and keeps the `mod_log`/PNG evidence until 180 days.
72. 删除我的全部接龙内容 applies AC 71 to every passed 棒 of the player.
73. No function returns any openid, openGId, nickname or avatar to a client except `admin` (schema test across all responses).
74. Steps are labelled "第 N 棒"; the viewer's own 棒 show "(你)"; no other identity is shown anywhere.
75. Analytics events contain no user text, strokes, openids or group ids (schema test on `track`).
76. The 接龙公约 sheet appears before the first start or claim, has no pre-selected agreement, and 先看看 leaves the game fully browsable; agreeing stores `rulesVersion`.
77. No UGC feature exists outside a group context: there is no public list, search, feed or stranger matching (code and UI review).
78. Reveal notices are not sent between 22:00 and 08:00 BJT; they are sent at 08:00 instead.
79. The game calls no WeChat privacy interface (code search: no `setUserCloudStorage`, `getFriendCloudStorage`, `saveImageToPhotosAlbum`, `getLocation`, clipboard APIs, `getUserProfile`).

**Reveal and teaser**
80. Only participants (starter + authors of passed 棒) receive content from `getReveal`; others get `NOT_PARTICIPANT` with teaser fields only (prompt text, final text, count).
81. The reveal auto-plays on first open (prompt, then each 棒 in order) and shows the full strip on later opens; 重播 replays it.
82. Hidden and deleted 棒 render as placeholders and are skipped by auto-play.
83. 笑 can be toggled once per participant per 棒; counts update; nothing ranks or awards 棒 by 笑.
84. Early and expiry reveals show "提前揭晓 · 传了 n/6 棒".
85. 同题再传 is offered for preset-prompt chains only and opens the picker with that prompt selected; with group context the new chain is bound to the same group.
86. An expired chain shows "这条接龙没传完" and lets participants see only their own 棒.

**Daily, prompts, streak**
87. The prompt bank has ≥ 400 prompts (423), each ≤ 12 code points, unique, with a category; no prompt matches the local blocklist or contact patterns (content test).
88. Two users on the same Beijing date get the same 3 今日起点 prompts from `getHome`, matching the client's `core/daily.js` result; no prompt repeats within 141 consecutive days.
89. The national count line appears only when the count is ≥ 30.
90. The streak counts consecutive Beijing days with ≥ 1 passed 棒, is shown only when ≥ 2, and grants nothing.
91. 换一批 shows 3 non-retired prompts not among today's 3.

**Sharing and group** [COMPLIANCE]
92. No reward, start, colour, 棒 or reveal is granted or unlocked by sharing anywhere (code search + manual test of every share entry).
93. Every share starts from a user tap or the capsule menu; nothing calls `shareAppMessage` automatically.
94. Invite and reveal card queries contain only `k=<chainId>` or `r=<chainId>`.
95. Share images contain no user drawings; the invite card contains no prompt or 棒 text; the reveal card contains only the prompt and the final sentence (passed text) (render tests).
96. Opening a card with a shareTicket calls `getGroupEnterInfo` and `joinGroup`; without a ticket or on failure there is no group context and claims are refused unless membership already exists; `wx.getShareInfo` is never called.
97. A card opened during a turn does not interrupt it; it routes after the turn with the toast.
98. 本群接龙 shows waiting, in-progress and recently revealed chains of the current group only, plus aggregate stats, and no per-person data.
99. **[device]** The updatable invite card shows the passed count after each pass, or the static fallback is in place with `features.updatableCard: false`.
100. The subscribe offer appears only with a configured template, only after a user tap, and never again for that chain after a refusal; one grant sends at most one message.

**Ads**
101. Rewarded rewards are granted only on `isEnded === true`; caps (2 extra starts/day, 1 palette/day) are enforced by `grantReward`.
102. On no-fill/load error a reward is granted once per day per placement; a second failure grants nothing.
103. Every rewarded instance uses `disableFallbackSharePage: true`.
104. Interstitials show only on leaving a reveal, never before the 3rd lifetime reveal, ≥ 180 s apart, ≤ 3 per day, and never on draw, describe, entry, picker or claim screens; 2001-2003 are skipped silently.
105. The banner appears only on 本群接龙/我的接龙 in ready/empty states when enabled in config, with a ≥ 24 pt gap, and is off by default.
106. No ad button sits adjacent to 画好了, 传出去, 接这一棒 or 举报.

**Screens, states, tech**
107. Every screen in §8 renders each listed state in the preview tool at 320 × 568, 375 × 667 and 430 × 932 without clipped text, in standard, large-text and high-contrast modes.
108. Nothing is drawn or tappable in the capsule row; primary buttons sit in the bottom 40% of the screen; touch targets are ≥ 48 pt.
109. Every network error state offers 重试.
110. `apps/chuanhua/` requires no file outside itself and only `.js` modules (code search; drift test for copied `core/` and `common/`).
111. The main package is ≤ 4 MB and the total ≤ 30 MB; there is no open data domain folder.
112. All cloud functions return `{ok:false, code}` instead of throwing (fuzz test with malformed inputs).
113. Date keys come from server time in UTC+8 regardless of the runtime timezone (test with `TZ=UTC` at 15:59:59 and 16:00:00 UTC).

---

## 20. Post-launch backlog (out of v1)

- Real-time mode (4+ online, 5-minute live round) once the real-time server is verified [KI §3].
- Optional names on steps via the open data domain (privacy interface; reconsider with data on group behaviour).
- Public "官方链" with staff-drawn first steps (needs human moderation capacity).
- Longer chains (8 棒) as a group option, if completion data allows.
- Reveal video/GIF export (UGC leaving the app: needs a review of its own).
- A second prompt bank (seasonal packs), more 彩笔 sets.

---

## Appendix A: Reuse from `apps/dianjiangtai/` (copied, never imported)

| Piece | Source | Use here |
|---|---|---|
| Capsule-aware layout, single-canvas scene loop, single-finger routing, `render/*` structure, `vm.js` pre-formatted view models, preview tool | `game/js/`, `game/tools/preview/` | all screens |
| `share.js` (share menu, `withShareTicket`, card rendering, enter-options routing) | `game/js/share.js` | invite/reveal cards, card entry |
| `ads.js` (rewarded singleton, D6 fallback, interstitial caps, stub, banner) | `game/js/ads.js` | §11 with new placements |
| `analytics.js` + `track` function | `game/js/analytics.js`, `cloudfunctions/track` | §14 |
| `core/date.js`, `core/rng.js` | `game/core/` | date keys, daily prompt walk |
| `joinGroup`, `group_members`, `groupRef` pepper scheme | `cloudfunctions/joinGroup`, README | §9.2 |
| `getBoard` membership check | `cloudfunctions/getBoard` | `getGroupChains` |
| `common/store.js` (identity, duplicate-`_id` detection, transactions), `scripts/sync-core.js`, drift test, deny-all `rules.json` + its test, fake DB test harness, fake-`wx` harness | `cloudfunctions/`, `game/tests/` | whole backend and tests |
| `cleanup` pattern, `rate_limits`, `app_config` remote config | cloudfunctions | §7.5, §13 |
| Large-text/high-contrast modes, feedback button | `render/settings.js`, theme | §8.13 |
| Subscribe-message flow | [DJT] §8.13 | §10.3 |

**New:** drawing canvas and stroke codec; describe input with the keyboard API; chain state machine with claims; moderation module (text, async image, push handler, mock, budget, breaker); server rasteriser and PNG encoder; reports/strikes/admin; reveal player; storage lifecycle.

---

## Appendix B: Prompt bank v1 (423 prompts, original)

Ids are category letter + number. All ≤ 12 characters. Content-reviewed against §4.2 before submission (Handoff H13).

**A 动物 (35):** A01 小猫吃面条 · A02 熊猫荡秋千 · A03 企鹅滑滑梯 · A04 长颈鹿戴围巾 · A05 小狗遛主人 · A06 兔子拔萝卜 · A07 大象洗澡 · A08 猴子摘桃子 · A09 鸭子排队过马路 · A10 小鸡破壳而出 · A11 金鱼吐泡泡 · A12 刺猬背苹果 · A13 松鼠藏松果 · A14 蜗牛赛跑 · A15 海豚钻圈 · A16 树懒睡午觉 · A17 考拉抱大树 · A18 斑马走斑马线 · A19 狐狸照镜子 · A20 青蛙唱歌 · A21 蜜蜂采蜜 · A22 蝴蝶落在花上 · A23 乌龟背着房子 · A24 老鼠搬奶酪 · A25 小羊剪羊毛 · A26 奶牛看星星 · A27 骆驼过沙漠 · A28 鹦鹉学说话 · A29 螃蟹横着走 · A30 章鱼弹钢琴 · A31 猫头鹰戴眼镜 · A32 小猪在泥里打滚 · A33 袋鼠送快递 · A34 河马刷牙 · A35 狮子去理发

**B 美食 (35):** B01 煎饼果子 · B02 热腾腾的饺子 · B03 一碗牛肉面 · B04 糖葫芦 · B05 冰淇淋化了 · B06 西瓜切两半 · B07 火锅冒泡泡 · B08 爆米花满天飞 · B09 蛋糕插蜡烛 · B10 月饼 · B11 粽子 · B12 汤圆 · B13 烤红薯 · B14 糖炒栗子 · B15 蛋炒饭 · B16 珍珠奶茶 · B17 小笼包 · B18 面包刚出炉 · B19 荷包蛋 · B20 巨大的汉堡 · B21 披萨切八块 · B22 一串葡萄 · B23 剥香蕉 · B24 草莓蛋糕 · B25 煮玉米 · B26 烤串 · B27 豆浆油条 · B28 白馒头 · B29 寿司 · B30 菠萝 · B31 酸柠檬 · B32 包饺子 · B33 糖果罐 · B34 棒棒糖 · B35 番茄炒蛋

**C 职业 (35):** C01 厨师颠勺 · C02 医生听诊 · C03 老师讲课 · C04 消防员救小猫 · C05 快递员送包裹 · C06 理发师剪头发 · C07 画家画画 · C08 宇航员太空漫步 · C09 农民插秧 · C10 渔夫钓鱼 · C11 面包师揉面 · C12 邮递员送信 · C13 园丁修剪树 · C14 摄影师拍照 · C15 魔术师变兔子 · C16 钢琴家演奏 · C17 工人盖房子 · C18 飞行员开飞机 · C19 船长掌舵 · C20 科学家做实验 · C21 裁缝做衣服 · C22 修车师傅 · C23 清洁工扫落叶 · C24 主持人拿话筒 · C25 舞蹈演员转圈 · C26 小丑踩高跷 · C27 养蜂人 · C28 饲养员喂熊猫 · C29 图书管理员 · C30 气象员看云 · C31 潜水员看珊瑚 · C32 指挥家挥棒 · C33 杂技演员走钢丝 · C34 修电脑 · C35 售货员称水果

**D 出行 (35):** D01 骑车上坡 · D02 堵车 · D03 坐过山车 · D04 热气球升空 · D05 地铁上打瞌睡 · D06 高铁穿过隧道 · D07 小船过桥 · D08 纸飞机 · D09 火箭发射 · D10 坐缆车 · D11 骑电动车戴头盔 · D12 雨中等公交 · D13 拖拉机耕地 · D14 帆船出海 · D15 滑板少年 · D16 骑马 · D17 旋转木马 · D18 降落伞 · D19 潜水艇 · D20 摩天轮 · D21 拖着行李箱赶车 · D22 自行车爆胎 · D23 狗拉雪橇 · D24 双层巴士 · D25 飞艇 · D26 小火车钻山洞 · D27 划龙舟 · D28 开房车露营 · D29 骑骆驼 · D30 滑翔伞 · D31 推婴儿车 · D32 洒水车 · D33 竹筏漂流 · D34 轮渡和海鸥 · D35 直升机

**E 运动 (35):** E01 跳绳 · E02 踢毽子 · E03 投篮 · E04 射门 · E05 打乒乓球 · E06 打羽毛球 · E07 游泳 · E08 冲过终点线 · E09 举重 · E10 跳水 · E11 滑雪 · E12 拔河 · E13 放风筝 · E14 打太极拳 · E15 攀岩 · E16 冲浪 · E17 射箭 · E18 跳高 · E19 做瑜伽 · E20 打保龄球 · E21 打网球 · E22 打排球 · E23 跳远 · E24 花样滑冰 · E25 划船比赛 · E26 做早操 · E27 跳踢踏舞 · E28 跳皮筋 · E29 抖空竹 · E30 打陀螺 · E31 爬山 · E32 跳伞 · E33 转呼啦圈 · E34 打高尔夫 · E35 骑独轮车

**F 节日与四季 (35):** F01 贴春联 · F02 放烟花 · F03 吃年夜饭 · F04 挂灯笼 · F05 舞狮子 · F06 赏月 · F07 堆雪人 · F08 打雪仗 · F09 秋天的落叶 · F10 春天花开了 · F11 夏天吃西瓜 · F12 猜灯谜 · F13 重阳登高 · F14 七夕看银河 · F15 生日派对 · F16 毕业合影 · F17 开学第一天 · F18 剪窗花 · F19 写福字 · F20 树上的知了 · F21 雪天喝热汤 · F22 金色的稻田 · F23 春游野餐 · F24 植树 · F25 腊八粥 · F26 冬至吃饺子 · F27 咬春饼 · F28 中秋团圆饭 · F29 端午挂艾草 · F30 儿童节气球 · F31 新年倒计时 · F32 晒柿子 · F33 吹电风扇 · F34 踏青 · F35 冬天戴手套

**G 家里 (35):** G01 洗衣机转圈 · G02 晾衣服 · G03 拖地 · G04 煮饭 · G05 浇花 · G06 刷牙 · G07 打哈欠 · G08 照镜子 · G09 赖床 · G10 叠被子 · G11 在冰箱里找吃的 · G12 沙发上看电视 · G13 找遥控器 · G14 闹钟响了 · G15 雨伞被吹翻 · G16 手机没电了 · G17 煮泡面 · G18 洗碗 · G19 吸尘器 · G20 挤牙膏 · G21 开窗通风 · G22 修水龙头 · G23 搬家 · G24 拼拼图 · G25 织毛衣 · G26 换灯泡 · G27 扫地机器人 · G28 拆快递 · G29 晒被子 · G30 养多肉 · G31 擦玻璃 · G32 打喷嚏 · G33 自拍 · G34 戴耳机听歌 · G35 泡脚

**H 自然与天气 (35):** H01 彩虹 · H02 雷阵雨 · H03 太阳下山 · H04 满天星星 · H05 弯弯的月亮 · H06 山顶日出 · H07 瀑布 · H08 沙漠里的仙人掌 · H09 海浪拍沙滩 · H10 大雾天 · H11 风吹麦浪 · H12 雪花飘落 · H13 樱花 · H14 荷花池 · H15 竹林 · H16 树下的蘑菇 · H17 向日葵 · H18 棉花糖一样的云 · H19 小溪 · H20 冰山 · H21 极光 · H22 流星 · H23 森林小屋 · H24 草原上的羊群 · H25 椰子树 · H26 红枫叶 · H27 蒲公英飞走了 · H28 雨后的蜗牛 · H29 海边的灯塔 · H30 小岛 · H31 星空露营 · H32 雪山 · H33 稻草人 · H34 一滴水 · H35 屋檐下的冰柱

**I 奇思妙想 (38):** I01 外卖小哥在月球送餐 · I02 熊猫开出租车 · I03 恐龙学跳舞 · I04 西瓜当头盔 · I05 企鹅在沙漠晒太阳 · I06 云朵下面条 · I07 月亮吃月饼 · I08 太阳戴墨镜 · I09 鲸鱼在天上飞 · I10 猫咪当老板 · I11 冰箱去旅行 · I12 雪人在夏天流汗 · I13 鱼骑自行车 · I14 树上长满糖果 · I15 天上下糖果雨 · I16 大象跳芭蕾 · I17 机器人学做饭 · I18 蚂蚁搬西瓜 · I19 书本长翅膀 · I20 茶壶在跳舞 · I21 外星人来串门 · I22 房子长了腿 · I23 包子当枕头 · I24 鞋子开花了 · I25 牙刷开演唱会 · I26 南瓜马车 · I27 会飞的鱼缸 · I28 星星掉进碗里 · I29 小狗当裁判 · I30 蜗牛开跑车 · I31 气球带走小猫 · I32 月球上种菜 · I33 煎蛋晒日光浴 · I34 汽车洗泡泡浴 · I35 小鸡当宇航员 · I36 老虎吃青菜 · I37 刺猬抱气球 · I38 冰淇淋去滑雪

**J 校园与办公室 (35):** J01 上课传纸条 · J02 涂答题卡 · J03 举手发言 · J04 在黑板上画画 · J05 课间操 · J06 趴桌上午睡 · J07 电脑死机了 · J08 开视频会议 · J09 打印机卡纸 · J10 下班赶地铁 · J11 咖啡续杯 · J12 键盘敲不停 · J13 写作业到深夜 · J14 背书包上学 · J15 放学排队 · J16 用显微镜 · J17 图书馆借书 · J18 食堂打饭 · J19 毕业抛帽子 · J20 接力赛跑 · J21 美术课画苹果 · J22 音乐课合唱 · J23 做手工 · J24 翻幻灯片 · J25 便利贴贴满墙 · J26 团建爬山 · J27 开会打瞌睡 · J28 年会表演节目 · J29 下雨没带伞 · J30 迟到跑进教室 · J31 削铅笔 · J32 橡皮擦错字 · J33 发作业本 · J34 黑板擦拍粉笔灰 · J35 打卡上班

**K 爱好 (35):** K01 弹吉他 · K02 拉二胡 · K03 打鼓 · K04 拿着话筒唱歌 · K05 钓鱼钓睡着了 · K06 下象棋 · K07 下围棋 · K08 搭积木 · K09 画油画 · K10 写毛笔字 · K11 剪纸 · K12 捏泥人 · K13 种花 · K14 养金鱼 · K15 看电影吃爆米花 · K16 拍照打卡 · K17 读小说 · K18 玩魔方 · K19 跳街舞 · K20 吹泡泡 · K21 折纸鹤 · K22 拉小提琴 · K23 吹笛子 · K24 堆沙堡 · K25 观鸟 · K26 烤棉花糖 · K27 做蛋糕 · K28 跳交谊舞 · K29 听相声 · K30 画京剧脸谱 · K31 用望远镜看星星 · K32 捉迷藏 · K33 跳房子 · K34 玩滑梯 · K35 吹口琴

**L 童话与想象 (35):** L01 城堡里的公主 · L02 魔法师挥魔杖 · L03 会说话的树 · L04 骑白马的骑士 · L05 美人鱼唱歌 · L06 巨人和小精灵 · L07 会飞的地毯 · L08 许愿瓶 · L09 藏宝图 · L10 寻宝船 · L11 魔法扫帚 · L12 会唱歌的贝壳 · L13 糖果屋 · L14 月亮上的兔子 · L15 彩虹桥 · L16 云上的城堡 · L17 独角兽 · L18 会飞的书包 · L19 小精灵修鞋 · L20 时光机 · L21 隐身斗篷 · L22 长到天上的豆藤 · L23 冰雪城堡 · L24 机器人朋友 · L25 恐龙蛋孵化了 · L26 森林音乐会 · L27 蘑菇房子 · L28 星星项链 · L29 雪花仙子 · L30 梦里的游乐园 · L31 会走路的蛋糕 · L32 魔法种子 · L33 纸船去远航 · L34 镜子里的另一个我 · L35 会发光的灯笼鱼

Total: 11 × 35 + 38 = **423**. Content QA (AC 87) checks uniqueness, length and blocklist; the content owner may swap individual prompts during review without changing the spec, keeping the total ≥ 400.
