# 传画接龙 (working title): spec, v1 complete release (rev. 2: live rooms)

Status: **v1 complete-release scope, revision 2 (2026-10-15).** The founder approved building this game (F-1). On 2026-10-15 the founder made four further decisions, all relayed by the CTO and implemented here:
- F-2: 今日起点 is removed; each start rolls 3 random prompts from a large bank and the starter picks 1.
- F-3: the canvas fills all the empty space.
- F-4: when time runs out, the turn is sent automatically.
- F-5: simultaneous live play is the default mode.

**Rev. 2.1 (2026-10-16):** a further founder decision, relayed by the CTO: each pick allows up to **5** 换一批, and when they are used up the button stays where it is, greyed out, reading 「换一批机会已用完」 (§4.1, §8.3, §12, §13.2, §14, §17, §19 AC 116 and 164-168). It replaces the earlier "one 换一批 per pick" of PO-34. The decision-log row is added to `decisions.md` with the implementation.

Under the constitution (Art. 4) there are no phases, MVP cuts or interim approvals: this spec is the whole release, and **the app is rebuilt from it**. Appendix C lists what changes in the current build. The founder sees the result at the Founder Handoff (§18), before the device pass and submission. Author: product-ux.

Type: WeChat 小游戏 (mini game). Slug: `chuanhua`. Companions:
- `docs/chuanhua/direction.md`: vision, pillars, tone, art and risks.
- **`docs/chuanhua/decisions.md`**: the dated decision log (date, decision, reason, alternatives). Founder rows are F-n; product calls are PO-n, referenced throughout this spec.

Sources:
- `research/2026-10-15-new-ideas/kept-ideas.md` §0, §3, §5-6 (cited [KI]) and `kept-ideas-alt.md` §3 (cited [KA]).
- `docs/dianjiangtai/spec.md` (cited [DJT]) and `apps/dianjiangtai/`, the reference implementation, which is copied and never imported.
- `docs/dianjiangtai/phase0-platform.md` (cited [P0]).
- `docs/constitution.md` (cited [CON]).
- Official WeChat documentation cited by URL in §6.1 and §3A.7.

Labels:
- **[VERIFY]**: a platform fact taken from official docs or research but not yet exercised on a real phone or in a real console. Every one is listed in §16 with a fallback and is proven in the **founder's device pass** (§16.2) before submission.
- **[COMPLIANCE]**: compliance-sensitive (user data, UGC, sharing rules, ads, minors).
- **INFERENCE**: our own judgement, with no published benchmark behind it.

Scope: everything above §20 is **v1**. §20 is the post-launch backlog and is out of v1 scope.

Terms used in this spec:
- **局 / room:** a live game (§3A).
- **慢慢传 / chain:** the async mode (§3).
- **棒:** one step of a chain (a drawing or a sentence).
- **round:** one simultaneous step in a room.
- **seat:** a player's fixed position in a room.
- **marker step:** a system-made step that stands in for a missing turn (§5.8).

---

## 0. Decision summary

All product decisions are logged in `docs/chuanhua/decisions.md`. The load-bearing ones:

| ID | Decision | § |
|---|---|---|
| F-1 | Founder approved building 传画接龙 | whole doc |
| F-2 | **No 今日起点.** Prompts come from a large bank: roll 3, pick 1 | §4 |
| F-3 | **The canvas fills all free space** on the draw screen | §5.1, §8.4 |
| F-4 | **At 0 s the turn is sent automatically**; no input after time-up | §5.8 |
| F-5 | **Live simultaneous rooms are the default**; at the end everything is released at once, final step first | §3A, §8.8-8.9 |
| Founder, 2026-10-16 | **Up to 5 换一批 per pick**, server-enforced; afterwards the button stays in place, greyed, 「换一批机会已用完」 | §4.1, §8.3 |
| PO-34 | Roll 3 from 3 categories, **up to 5 换一批 per pick** (rev. 2.1; was 1), no repeat within a player's last **300** shown prompts, rolls disjoint within a room | §4.1 |
| PO-35 | 自己出题 stays as a small secondary option | §4.2 |
| PO-36 | Prompt bank v2: **≥ 2,000** prompts, ≥ 120 per category, AI-drafted, **every prompt human-reviewed** before release | §4.3 |
| PO-37 | Daily return = streak (both modes) + the group's open games + 慢慢传 reveal notice; no new daily feature | §4.4 |
| PO-38 | Draw layout: top bar, one source strip, **canvas fills the rest**, colour row, tool row | §8.4 |
| PO-39 | Strokes `v:2`: width 1024, stored height `h` (768-2048); **contain-fit** on other screens | §5.3, §5.7 |
| PO-40 | Force send; empty → 「（没来得及画）」/「（没来得及写）」 markers; blocked at time-up → 「（这一棒没传过来）」 (live) | §5.8 |
| PO-41 | Rooms: **3-10 players**; rounds = **min(n − 1, 4)**; rotation (c + r) mod n; prompt 30 s / draw 60 s / describe 45 s | §3A.4-3A.5 |
| PO-42 | Rooms bound to one group; no late joiners; rejoin allowed; leave or disconnect → auto-empty; host handover | §3A.2-3A.6 |
| PO-43 | Real time: **watch() on a content-free per-seat signal doc**; polling 2 s fallback; lazy server-side round advance | §3A.7 |
| PO-44 | Moderation: **synchronous mini-game image check (`mediaCheckSync`) and text check** for both modes; fail closed; live rooms off if sync is unavailable | §6 |
| PO-45 | Reveal: overview of final steps → step back to the prompt; replay and 笑 kept; **同题再传 removed** | §8.8-8.9 |
| PO-46 | One primary **开一局** (live) + a small **慢慢传** link (async kept) | §2, §8.1 |
| PO-1..PO-5 | 慢慢传 chain shape (6 棒), starter draws 第 1 棒, 3 棒 cap, claim lock 150 s, 48 h lifetime | §3 |
| PO-6 | Rooms and chains are **bound to one WeChat group**; no public play, no strangers | §3.3, §3A.3 |
| PO-7 / PO-47 | Full reveal only for participants (room: members seated at the start); others get a text teaser | §3.7, §3A.8 |
| PO-8, PO-9 | No names on steps; no open data domain, boards or rankings | §8, §10 |
| PO-10 | Strokes are the upload; the server rasterises the PNG that is moderated; PNGs never reach clients | §5.4 |
| PO-16, PO-17, PO-19 | Reports hide at once; strike ladder; 180-day retention | §7 |
| PO-24 | Share images contain **no user drawings** | §9 |

---

## 1. Goal, target user, scope

**Goal.** Launch a complete, compliant drawing-telephone game that lives inside WeChat groups. By default a group plays a short **live game**: every player starts a chain, and each round everyone draws or describes what the previous player passed them. At the end all the chains are revealed at once, final step first. When the group can't gather, **慢慢传** passes one chain through the group over up to 48 h.

Post-launch KPIs (INFERENCE, no gate):
- Rooms started ÷ rooms created ≥ 50%.
- Started games that reach the reveal ≥ 90%.
- Rematch (再来一局 within 10 min) ≥ 30% of finished games.
- Room-card open → join ≥ 40%.
- 慢慢传 completion (≥ 4 passed 棒 within 48 h) ≥ 60%.
- Reveal-card share rate ≥ 15%.
- D1 ≥ 35%, D7 ≥ 12%.
- Moderation health: image check p95 ≤ 3 s, block rate, marker rate and report rate tracked (§14).

**One sentence (Art. 3.2):** 群里一起开一局：看上一位传来的，是画就猜一句，是字就画出来，传完一起看它变成了什么。 ("Start a game with your group: look at what the previous player passed you; if it is a drawing, describe it; if it is words, draw them; when it's all passed on, see together what it turned into.")

**Target user.** WeChat users aged 18-40 in friend, family, class and colleague groups, plus the 40+ players who arrive from family groups (direction §2). Portrait, one thumb, no drawing skill needed: bad drawings are the comedy.

**Product principles check ([CON] Art. 3).**

| Principle | How v1 meets it |
|---|---|
| Simple | The one sentence above. Every screen has one action: pick, draw or type. Timers end turns by themselves (F-4). The host has one button (开始). There are no accounts and no settings to learn. The first draw turn shows one coach line. Learnable in under 30 s |
| Addictive | A live game takes about 2.5-4.5 min (3 players ≈ 2.5 min). The reveal ends on **再来一局**, a strong reason to play again right away. Rolls from 2,000+ prompts keep games fresh. 慢慢传 reveals arrive later and pull you back. A streak with no rewards. Replayable reveals |
| Social | The group *is* the game: rooms and chains are bound to a group. Everyone plays at once, and every player's chain is a punchline. The reveal is a shared moment. The live-updating room card shows who has joined. Group stats. No induced sharing and no reward for sharing (§9) |

**Feature scope (v1, all in):**

| Feature | v1 |
|---|---|
| **Live rooms (开一局, default):** lobby from a group card, 3-10 players, host starts, simultaneous rounds, forced send, server-timed rounds, rejoin, auto-empty for leavers | Yes |
| **慢慢传 (async chain):** 6 棒 bound to a WeChat group, claim lock, 2-person minimum, 48 h, early reveal | Yes |
| Prompt pick: roll 3 from a bank of ≥ 2,000, up to 5 换一批, 自己出题 (moderated) | Yes |
| Full-space drawing canvas (6 + 6 colours, 3 sizes, undo, clear, 60 s), aspect-independent strokes | Yes |
| Describe step (≤ 16 characters, 45 s) | Yes |
| Forced send at time-up with marker steps | Yes |
| Moderation (local filter, synchronous game text and image checks, fail closed, kill switch, circuit breaker; async image pipeline as a configured fallback) | Yes |
| Report flow, admin takedown function, strike ladder, 180-day retention, author deletion | Yes |
| Reveal overview + step-through (final first), stroke replay, 笑, teaser for non-participants | Yes |
| 本群接龙 (the group's open games, chains and stats), 我的接龙 (album), streak | Yes |
| Room invite card (updatable count), chain invite card, reveal card | Yes ([VERIFY] fallback: static cards) |
| Opt-in subscribe message "接龙揭晓了" (慢慢传 only) | Yes (hidden without a template ID) |
| Rewarded: 再开一条 (慢慢传, ≤ 2/day), 今日彩笔 (in 设置); capped interstitial after reveals; banner on list screens (config, default off) | Yes |
| Large-text and high-contrast modes | Yes (copied from [DJT] §8.10) |
| Analytics (`track`), remote `app_config` | Yes |
| **Removed in rev. 2:** 今日起点, national counts, 同题再传, the draw-screen 今日彩笔 pill, the vertical auto-play reveal strip | **No** (F-2, PO-45, PO-49) |
| Public play, stranger matching, names on steps, boards, save reveal to album, voice or chat | **No** (§20 backlog or rejected) |

**Package budget.**
- Main package ≤ 4 MB, total ≤ 30 MB [P0 §10]. No open data domain (PO-9).
- The prompt bank (≥ 2,000 prompts, about 60-80 KB) ships in the main package as a `.js` module. Mini games can only `require` `.js`, so there are no JSON content files.
- No remote images. The UI art is drawn in code (TD-71).

**Release path.** Rebuilt v1 → QA → release pack (`docs/chuanhua/release/`) → Founder Handoff (§18) → founder device pass (§16.2) → founder-approved submission.

---

## 2. Core loop

Home has **one primary button, 开一局** (live room), and a small link **慢慢传（不用同时在线）** (PO-46). If live rooms are switched off (`features.liveRooms: false`, §6.9), 慢慢传 becomes the primary button 开一条接龙 and the link is hidden.

### 2.1 Live game (default, about 2.5-4.5 min)

1. **Host:** Home → **开一局** → (公约 once) → **lobby**. Tap **邀请群友** to share the room card into the group (voluntary, §9).
2. **Others:** tap the card in the group → room entry → **加入这一局** (公约 once) → lobby. The card's count updates ("当前 4/10 人").
3. **Host taps 开始** (≥ 3 players).
4. **Round 0, prompt (30 s):** everyone sees 3 rolled prompts (up to 5 换一批 allowed, or 自己出题) and picks one. This is the start of *their* chain, and the next player will draw it.
5. **Rounds 1..R** (R = min(n − 1, 4)): odd rounds **draw** (60 s), even rounds **describe** (45 s). Each player gets **only the previous step of a different chain** and works on it. When time is up the turn is sent as it is (F-4). A round ends early as soon as everyone has sent.
6. Between rounds: "已交 · 等大家 3/5" then "传递中…" (≤ about 6 s).
7. **Reveal:** everyone gets the reveal at the same moment. The overview shows each chain's **final step**. Tap a chain to step back through it to the original prompt (drawings replay). Then 笑, 举报, **分享揭晓卡**, **再来一局**.

### 2.2 慢慢传 (async chain, secondary)

1. **Starter (about 75 s):** Home → 慢慢传 → pick a prompt (roll 3, §4) → draw it in 60 s (第 1 棒) → "已传出" → **发到群里接龙** (voluntary) and optionally 揭晓时提醒我.
2. **Next player (about 60 s):** taps the card in the group → chain entry ("第 2 棒等你接", no content) → **接这一棒** (claim) → sees only the previous 棒 → describes or draws it → sent.
3. **Reveal:** when 第 6 棒 passes (or on an early reveal), every participant can open the same reveal viewer as in a live game, with one chain.

### 2.3 Ads

Interstitials appear only when leaving a reveal, under the caps in §11. There are never any ads in a lobby, a round or a turn.

---

## 3. 慢慢传 chain rules (async mode)

The rules of v1, with rev. 2 changes marked **(rev. 2)**.

### 3.1 Shape (PO-1)

A chain = a **prompt** + **6 棒**. Odd 棒 are drawings, even 棒 are descriptions:

| 棒 | Kind | Sees | Produces |
|---|---|---|---|
| 起点 | prompt (rolled or own) | n/a | text ≤ 12 chars |
| 1 | 画 draw | the prompt | drawing |
| 2 | 猜 describe | drawing 1 | text ≤ 16 |
| 3 | 画 | text 2 | drawing |
| 4 | 猜 | drawing 3 | text |
| 5 | 画 | text 4 | drawing |
| 6 | 猜 | drawing 5 | text (the punchline) |

Any 棒 may be a **marker step** (§5.8) if its player ran out of time with nothing to send.

### 3.2 Starting (PO-2, PO-34)

- **(rev. 2)** 慢慢传 opens the pick screen (§8.3). `rollPrompts` returns 3 prompts; up to 5 换一批; or 自己出题.
- `createChain({rollId, promptId | customText})` creates the chain and gives the starter an immediate claim on 第 1 棒. The starter draws the prompt.
- The chain counts against the starter's daily start allowance (§3.9) **only when 第 1 棒 is submitted** (including an empty marker at time-up).
- A starter who taps 放弃 before time is up loses nothing. The chain is discarded (`abandoned`, deleted by `cleanup`).
- If the starter came from a group card in this session, the chain is bound to that group at creation. Otherwise it is unbound until the first claim made with group context (§3.3).

### 3.3 Group binding (PO-6) [COMPLIANCE]

- Every chain belongs to **at most one group** (`openGId`, decrypted server-side via `joinGroup`, §9.3). It is bound at creation (the starter has group context) or by the first claim made with group context.
- **Claiming requires group membership:** the caller must have a `group_members` row for the chain's group with `lastSeen` within 30 days. That row exists only if they once opened one of our cards in that group.
- A card opened from a single chat, or a chain bound to group A opened from group B, cannot be claimed. The entry screen says "接龙只能在发起的群里接力".
- There are **no public chains, no stranger matching and no feed**.

### 3.4 Who may take a 棒 (PO-3)

All of these must hold. They are checked server-side in `claimStep`; the pure function `core/chain.js#canClaim` is shared with the client for the button state.
1. The player has agreed to the 接龙公约 (§8.2) and is not restricted (§7.3).
2. UGC creation is enabled (`app_config.ugc.createEnabled`, §6.8) and not circuit-broken.
3. The chain is `open`: its latest 棒 has passed, fewer than 6 棒 have passed, and it is not revealed, expired or removed.
4. Nobody else holds an unexpired claim on the next 棒.
5. The player did **not** author the previous passed 棒 (no two in a row).
6. The player has fewer than **3** passed 棒 (marker steps included) in this chain. Blocked attempts don't count.
7. Group membership as in §3.3.
8. Daily caps (§3.9).

**Few players.** Two people can complete a chain (A: 1, 3, 5; B: 2, 4, 6).

### 3.5 Claims, timers and forced send (PO-4, F-4)

- **Claim:** `claimStep` runs in a DB transaction on the chain document. It re-checks §3.4, writes `claim = {openid, claimId, step, at, expiresAt: now + 150 s}`, and returns the previous 棒 **only to the claimant**. Viewing the entry screen never claims; only the 接这一棒 tap does.
- **On-screen timers:** draw 60 s, describe 45 s (`timers.drawSec`, `timers.describeSec`). The timer is computed from the server's `claim.at` plus `serverNow`, never from the device clock. It is visible, turns red in the last 10 s, and is never extended.
- **(rev. 2) Time-up = forced send (§5.8).** At 0 all input stops and the turn is sent:
  - **≥ 1 stroke**, or a text with ≥ 2 valid characters: sent and checked.
  - **Empty:** sent as a marker step, 「（没来得及画）」 or 「（没来得及写）」. It counts as a passed 棒, and the chain moves on.
  - **Blocked or rejected at a forced send:** the 棒 reopens for anyone eligible, as in v1. The author sees "这一棒没通过审核，没有传出去".
- **Blocked before time is up:** the author keeps the claim and the work and may fix and resend ("没通过审核，改一改再交").
- **Server TTL 150 s** covers loading, the keyboard and retries. A submit after the TTL is still accepted **if nobody else has claimed since** (lazy expiry); otherwise it gets `CLAIM_LOST` and the client discards the work.
- **Client gone** (app killed, no network): there is nothing to send. The claim simply expires after 150 s, and the 棒 is open again (no marker, because the server has no content and the chain does not stall: anyone can claim).
- **Two people at once:** exactly one claim wins; the other gets `TAKEN` ("有群友正在接第 3 棒（约 2 分钟内）").
- **放弃** (before time-up only) asks "放弃这一棒？" and releases the claim.
- **(rev. 2)** Drawings are checked synchronously (§6.3), so the chain is never `pending` in normal operation. `pending` exists only in the async-fallback image mode (§6.10).

### 3.6 Lifetime, early reveal, expiry (PO-5)

- A chain lives **48 h** from creation (`expiresAt`).
- **Early reveal:** the starter may tap **现在揭晓** once ≥ 4 棒 have passed and no claim (or pending 棒) is active.
- **Expiry (`modSweeper`):**
  - At `expiresAt`, if a claim (or pending 棒) is active, expiry waits for it to resolve.
  - Then: ≥ 4 passed → reveal (`revealReason: expiry`).
  - < 4 passed → `expired` ("这条接龙没传完"): participants can see only their own 棒 in 我的接龙.
- **Complete:** when 第 6 棒 passes, the chain reveals immediately (`revealReason: complete`).

### 3.7 Reveal visibility (PO-7) [COMPLIANCE]

- **Participants** = the starter plus every author of a passed 棒 (marker authors included). Only they get the reveal content.
- Anyone else who opens the reveal card sees the **teaser** (§8.10). **(rev. 2)** 同题再传 is removed; the teaser offers **开一局** and **看看本群其他接龙**.
- Drawings and strokes are never sent to non-participants.

### 3.8 Chain state machine

```
            createChain (claim 1 → starter)
                    │
                    ▼
 ┌────────── starting ──放弃 / claim expires, nothing sent──→ abandoned
 │                  │ send 棒1 (drawing or empty marker)
 │                  ▼
 │   open (next 棒 claimable) ⇄ claimed (claim TTL 150 s; release / expiry → open)
 │                  │ send
 │                  │  pass (sync check) or marker → open, or revealed if 棒6
 │                  │  blocked before time-up → stays claimed, author fixes and resends
 │                  │  blocked/rejected at forced send → open (same 棒 reopens)
 │                  │  [imageMode 'async' only: drawing → pending → open (§6.10)]
 │                  ▼
 │   6 passed ─────────────→ revealed
 │   starter 现在揭晓 (≥4) ─→ revealed
 │   48 h & ≥4 passed ─────→ revealed
 │   48 h & <4 passed ─────→ expired
 └── admin removeChain (any state) → removed
```

Step (棒 attempt) states: `passed` | `blocked` | `void`, plus `pending` in the fallback mode only. A step may carry `marker` (§5.8). A `passed` step can later become `hidden` (report or admin) or `deleted` (author). Only `passed` content that is not hidden or deleted is ever shown to anyone other than its author.

### 3.9 Daily allowances (PO-23, PO-48)

| Allowance | Value | Notes |
|---|---|---|
| 慢慢传 starts | 3 per Beijing day free, + up to 2 by rewarded video (§11) | counted at 第 1 棒 send |
| Rooms created | 10 per day | at `createRoom`; a room closed before start gives it back |
| Rooms joined | 30 per day | at `joinRoom`, first join of a room only |
| Turns sent (both modes) | **80** per day | marker steps don't count; hitting it shows "今天玩得够多啦，明天再来" |
| Claims on one chain | 3 per day | anti-peek |
| Reports | 10 per day | anti-griefing |

All counters live on `players` (§13.1), keyed by the server's Beijing date (`core/date.js`).

A player who hits the turn cap in the middle of a live game finishes that game: turns in a game they have already started are never refused for the daily cap. The cap applies at `createRoom` and `joinRoom`.

---

## 3A. Live rooms (开一局, the default mode) (F-5)

### 3A.1 Overview (PO-41)

- A **room** is a live game for **3-10 players** from one WeChat group.
- Each player has a **seat** (0..n−1, in join order) and starts one chain. There are **n chains**.
- Each round, every player works on a different chain at the same time, seeing **only the previous step of that chain**.
- After the last round, all n chains are revealed to all members at the same moment.

### 3A.2 Room state machine

```
 createRoom ──→ lobby ──host 开始 (≥3 active)──→ playing: round 0 (prompt)
                 │                                   │ round ends (all sent, or deadline + grace)
                 │                                   ▼
                 │                          round 1 (draw) → round 2 (describe) → … → round R
                 │                                   │ round R ends
                 │                                   ▼
                 │                                reveal (terminal; the content stays 180 days)
                 ├──lobby idle 30 min, or last member leaves──→ closed
 any state ──admin removeRoom──→ removed
```

- `playing` has a sub-phase per round: `turn` (the timer is running) and `passing` (≤ about 6 s, while the last checks finish and the next round is assigned).
- **Hard cap:** `room.gameMaxMin` (20 min) after start, `roomSweeper` finishes the game. Every unsent slot becomes an empty marker, every remaining round is filled with markers, and the room goes to `reveal`.

### 3A.3 Creating, inviting, joining (PO-42) [COMPLIANCE]

- **Create:** Home → 开一局 → (公约 if needed) → `createRoom({groupRef?})`.
  - The caller becomes host and seat 0.
  - With group context (the game was opened from a group card in this session), the room is bound to that group at once.
  - Without it, the room is unbound, and the lobby says "把邀请发到群里，群友点开就能加入".
- **Invite:** **邀请群友** shares the room card (`m=<roomId>`, `withShareTicket`, §9.1). Sharing is voluntary and grants nothing.
- **Join:** opening the card → `joinGroup` (shareTicket) → room entry (§8.16) → **加入这一局** → `joinRoom({roomId, groupRef})`. Requirements:
  1. 公约 agreed; not restricted; UGC not paused.
  2. The room is in `lobby` and has < 10 seats.
  3. **Group:** an unbound room is bound to the joiner's group (from their valid `groupRef`). A bound room requires a `group_members` row for its group (≤ 30 days). A card opened from a single chat or another group gets "这一局只能在发起的群里加入".
  4. Daily caps (§3.9).
- **Host:** the creator. If the host leaves the lobby, the earliest-joined remaining member becomes host. If the last member leaves, the room is `closed`.
- **Start:** only the host, only with ≥ 3 active seats (`startRoom`).
  - With 2 the button is disabled and reads "至少 3 人才能开局", with a link **两个人？去慢慢传** that opens the 慢慢传 pick screen.
  - Seats are fixed at start. The number of seats n and the number of rounds R are written to the room.
- **No late joiners:** after start, `joinRoom` returns `ROOM_STARTED`. The entry shows "这一局已经开始了，等下一局吧" with 开一局 and 本群接龙.
- **Rejoin:** a seated member can come back at any time (same card, or 回到这一局 on home), into the current round with the remaining server time.

### 3A.4 Rounds and rotation (PO-41)

- **R = min(n − 1, `room.maxRounds`)**, with `maxRounds` = 4 (config, clamped 2-6).
- Round 0 = **prompt**. Rounds 1..R alternate **draw** (odd) and **describe** (even). With R = 3 or with a config of 5, the chain ends on a drawing, which is fine: the reveal shows the final step first either way.
- **Rotation:** chain c (started by seat c in round 0) is worked in round r (1..R) by **seat (c + r) mod n**. Because r ≤ n − 1, nobody works on their own chain and nobody touches the same chain twice. Each seat works on exactly one chain per round.

Example, n = 4, R = 3:

| Round | Kind | Seat 0 works on | Seat 1 | Seat 2 | Seat 3 |
|---|---|---|---|---|---|
| 0 | prompt | chain 0 | chain 1 | chain 2 | chain 3 |
| 1 | draw | chain 3 | chain 0 | chain 1 | chain 2 |
| 2 | describe | chain 2 | chain 3 | chain 0 | chain 1 |
| 3 | draw | chain 1 | chain 2 | chain 3 | chain 0 |

- The player in round r sees **only step r−1 of their chain**: the prompt in round 1, then the previous drawing or sentence.
- Each room chain is a `chains` document with `mode: 'live'`, `roomId`, `seat` (the origin) and `length: R`. Its steps are ordinary `steps` documents (n = 1..R), so reports, deletion, retention and the reveal reuse the 慢慢传 machinery.

### 3A.5 Timers, deadlines and round advance (F-4, PO-40, PO-43)

- **Timers** (`app_config.room`): `promptSec` 30, `drawSec` 60, `describeSec` 45, `graceSec` 5.
- **Deadline:** each round has `roundStartAt` and `deadline = roundStartAt + sec`, written by the server. Clients show `deadline − (Date.now() + offset)`, where `offset = serverNow − clientNow`, measured on every `getRoom`.
- **Forced send:** at 0 the client stops all input and sends at once (§5.8), retrying every 1 s until `deadline + grace`.
- **Acceptance:** `submitRoomStep` accepts a send whose function start time is ≤ `deadline + graceSec`. The function's moderation time does not count.
  - It first marks the slot `received` (a fast transaction).
  - It then runs the check and resolves the slot to `sent`, `blocked` (resendable before the deadline) or `marker`.
- **Early end:** the round ends as soon as every **active** seat (not `left`) has a resolved slot.
- **Deadline end:** at `deadline + grace` the round may end once no slot has been `received` for less than 8 s (a check in flight). Every seat without a resolved slot then gets an **empty marker**, and every `received` slot older than 8 s becomes 「（这一棒没传过来）」.
- **Who advances (lazy, idempotent, server-side):**
  1. the `submitRoomStep` that resolves the last slot;
  2. `roomTick({roomId})`, called by every client at `deadline + grace + 1 s` and then every 2 s until the round changes;
  3. `roomSweeper` (every minute) for rooms nobody is watching.

  Advancing is one transaction guarded by `round` and `version`. Concurrent callers produce exactly one advance.
- **Advancing:** writes the next round's `roundStartAt` / `deadline` (start = now + 1 s, so clients can fetch), bumps `version`, and updates every seat's signal (§3A.7). After round R it sets `state: 'reveal'`, `endedAt`.
- A send that arrives after its round advanced gets `ROUND_OVER`. The client shows "时间到，这一棒已自动交出" and moves on.

### 3A.6 Leaving, disconnects, rejoining (PO-42)

| Situation | What happens |
|---|---|
| **离开这一局** (back during a game, confirm "离开后你的回合会自动跳过，确定离开？") | `leaveRoom` marks the seat `left`. Its slot in the current round and every later round is filled with an empty marker **at once**, so rounds can end early. The player can still open the reveal later (they were seated at start) |
| App backgrounded, killed or offline (no 离开) | The seat stays `active`. Each round it misses gets an empty marker at deadline + grace (the round waits for the deadline, not longer) |
| Back before the deadline | `getRoom` returns the current assignment and the remaining time; the local draft (per room, round) is restored |
| Back after the deadline | The draft is discarded with "时间到了，这一棒已自动交出", and they join the current round |
| Lobby: a member leaves | Their seat is removed; seats renumber in join order; if they were host, the earliest-joined member becomes host |
| Everyone leaves mid-game | All remaining slots fill with markers; the room goes to `reveal`; whoever opens it later sees it |
| Host leaves mid-game | Nothing special: after start, the host has no further powers |

No presence heartbeat exists. The server only records `lastSeenAt` on each room call (for the lobby's "可能已离开" hint after 60 s of silence, and for analytics).

### 3A.7 Real-time sync (PO-43) [VERIFY V17, V18]

**Method.** The WeChat cloud database realtime listener `watch()` on a **content-free signal document per seat**, plus polling as the guaranteed fallback. Source: the cloud development realtime push guide, https://developers.weixin.qq.com/minigame/dev/wxcloud/guide/database/realtime.html. It is in the mini-game docs tree and says "集合的读权限设置在实时数据推送里同样生效": collection read rules apply to watch.

- **`room_signals/<roomId>_<seat>`**, written only by cloud functions, with fields:
  - `_openid`: the seat's member;
  - `roomId`, `seq` (= room `version`);
  - `state`, `round`, `kind`;
  - `deadline`, `serverNow`;
  - `sent`, `active`: counts only.

  There is **no content and no other openid**.
- **Security rule** for `room_signals` (custom): `{"read": "doc._openid == auth.openid", "write": false}`. Every other collection stays deny-all.
- **Client:** `db.collection('chuanhua_room_signals').where({_openid: '{openid}', roomId}).watch({onChange, onError})`. On a new `seq`, it calls `getRoom` (content comes only from functions, with their checks).
- **Fallback:** after 2 `onError`s, or if `watch` is missing (e.g. PC WeChat), the client polls `getRoom` every **2 s** while a room screen is open.
- **Safety poll** every 10 s even while `watch` runs.
- `roomTick` at the deadline also returns the new state, so a round always advances on the client even with no signal at all.
- **Expected latency (INFERENCE, measured at the device pass):** server advance → client screen p95 ≤ 1.5 s with `watch`, ≤ 2.5 s with polling.
- Signal docs are deleted 1 day after the room ends (`roomSweeper`).
- **Cost guard:** polling at 2 s for 10 players is about 5 calls/s per room. The rate limit for `getRoom` is 60/min per player (§13.2).

### 3A.8 Room reveal visibility (PO-47) [COMPLIANCE]

- **Members** = everyone seated at start, including those who left later. Only members get the content of the room's chains (`getRoomReveal`, `getReveal`).
- Anyone else opening the room's reveal card gets the **room teaser** (§8.10): the number of chains, and per chain 「起点」→「终点」 when both are passed text. If the final step is a drawing, it shows 「起点」→（一幅画）. No drawings.

### 3A.9 Room allowances and limits

- Room creates, joins and the daily turn cap are in §3.9.
- A player can be seated in **one** room in `lobby` or `playing` at a time. `createRoom` / `joinRoom` while seated elsewhere returns `IN_OTHER_ROOM` ("你还在另一局里" + 回到那一局 / 离开那一局).
- A player cannot both hold a 慢慢传 claim and be seated in a playing room. A claim taken while seated is refused (`IN_ROOM`), and joining a room while holding a claim asks to finish the claim first.

---

## 4. Prompts: roll 3, pick 1 (F-2)

### 4.1 The roll (PO-34)

- Every start shows **3 prompts from 3 different categories**, rolled **by the server**:
  - 慢慢传: `rollPrompts`.
  - Live: each seat's roll is created when round 0 starts and arrives with `getRoom`.
- **换一批: up to 5 per pick (rev. 2.1, founder 2026-10-16).** A "pick" is one live room's round-0 pick or one 慢慢传 start pick.
  - Each 换一批 replaces **all 3** prompts with 3 new ones from 3 categories, none of them shown earlier in this pick. A player can therefore see up to **6 sets** (the first roll + 5 rerolls) = 18 prompts per pick.
  - Each reroll issues a new `rollId`; the new set is the current roll and the earlier sets can no longer be picked (except by the live forced send, §17 edge 26).
  - The limit is a fixed constant (`MAX_REROLLS = 5` in `core/roll.js`), **enforced by the server**: the count per pick is stored with the roll (`players.roll.rerolls` / `rooms.rolls[seat].rerolls`). A 6th reroll request returns **`REROLL_LIMIT`** and changes nothing (same `rollId`, same prompts, no ids added to `seenPrompts`).
  - The 换一批 button **never disappears**. It shows the remaining count (「换一批（剩5次）」 … 「换一批（剩1次）」); after the 5th reroll it stays in the same place and size, greyed out, reading 「换一批机会已用完」, and a tap does nothing (§8.3).
  - Every bank rule below applies to every reroll: 3 categories per set, the 300 no-repeat window, room-unique prompts, no retired prompts.
  - Live round 0: the round-0 timer and the forced send are unchanged; rerolls are accepted only until the round-0 deadline (§17 edges 25-26).
- **No repeats:**
  - A player is never shown a prompt that is among the **last 300 prompt ids shown to them** (`players.seenPrompts`, a ring buffer). Every shown prompt counts, picked or not, including every rerolled set. (A player who uses all 5 rerolls sees 18 prompts per pick, so the window still covers their last ≥ 16 picks.)
  - In one room, no two seats' rolls share a prompt: every set shown to any seat in round 0 (first roll and all rerolls) is reserved for the room.
  - If the pool is too small to satisfy this, the server drops the oldest ids from the window until it can. With the v2 bank this cannot happen (capacity check below); the fallback stays only as a safety net.
- **Capacity check (rev. 2.1, 5 rerolls).** Bank v2 at the time of writing: **2,042 active prompts in 12 categories, the smallest with 132.**
  - Worst case in a live room: the last reroll by the last of 10 seats. The ids it must avoid are at most the player's own window (300) plus every set shown in the room (10 seats × 6 sets × 3 = 180), so **≤ 480 excluded ids** (fewer in practice, since the player's own sets in this room are in both).
  - Total: at least 2,042 − 480 = **1,562 eligible prompts** remain.
  - Categories: emptying a category takes ≥ 132 excluded ids in it, so 480 excluded ids can empty at most ⌊480 / 132⌋ = **3 categories**; **≥ 9 categories** still hold eligible prompts, and a set needs 3. A room-unique roll from 3 categories therefore **always succeeds**, without touching the drop-oldest fallback.
  - 慢慢传: 300 + 18 = 318 excluded ids at most; trivially satisfied.
  - Margin: the rule holds while ⌊480 / smallest category⌋ ≤ 9, i.e. every category keeps **≥ 49** active prompts; the ≥ 120 floor of §4.3 (⌊480 / 120⌋ = 4, leaving ≥ 8 categories) must therefore survive any later retirements, and the content test (AC 114) guards it.
- The pick must be an id from the player's **current** roll (`rollId`), or custom text. Anything else is `BAD_REQUEST`.
- Retired prompts are never rolled.
- Rolls use a server rng (`core/rng.js`), seeded per call. No client rng is trusted.

### 4.2 自己出题 (custom prompt, PO-35)

- A small secondary text button on the pick screen. 2-12 characters, under the text rules of §5.6.
- Moderated **before use** (§6.2). Blocked → "这个题目不太合适，换一个吧". Nothing is created and the player can pick again.
- **Live round 0:** if time runs out while the custom input is open, unsent or blocked, the server uses the **selected rolled prompt** (the first one if none was tapped). A custom text that was already sent and passed stands.
- Custom prompts appear in reveal and teaser text and in reveal-card titles (they are already-checked text).

### 4.3 Prompt bank v2 (PO-36)

- **Target: ≥ 2,000 non-retired prompts**, in the 12 existing categories (A 动物, B 美食, C 职业, D 出行, E 运动, F 节日与四季, G 家里, H 自然与天气, I 奇思妙想, J 校园与办公室, K 爱好, L 童话与想象), **≥ 120 per category**.
- **Format:** `game/core/content/prompts.v2.js` exports `{version: 2, prompts: [{id, text, cat, retired?}]}`.
  - The 423 v1 prompts (Appendix B) keep their ids (`A01`...).
  - New ids are `<cat><4 digits>`, starting at 1001 (`A1001`).
  - `text` is 2-12 code points. `promptsVersion` = 2.
- **Content rules** (unchanged from v1):
  - Every prompt is drawable, everyday, kind or absurd, and readable by a 40+ player.
  - **None of the following:** politics; national symbols, flags, maps or currency; military or police; weapons; religion or 封建迷信; real people or celebrities; brands or copyrighted characters; regions or ethnic groups as jokes; disasters, illness, medicine or death; violence; alcohol or tobacco; gambling (incl. 麻将, lotteries); romance or bodies; anything that mocks a group of people (age, job, body).
  - Original wording only: no lists from Gartic Phone, Telestrations or any other game.
  - Content-review issue categories as in `docs/chuanhua/content-review.md` §1.1.
- **Pipeline:**
  1. AI drafts in category batches of about 200, following the rules above and the v1 tone.
  2. Automated checks (`tests/qa-content.test.js`): length, allowed characters, exact duplicates, normalised duplicates (with 的/了/一个/the trailing 了 removed), the local blocklist (with exceptions), contact patterns, and category counts.
  3. An AI review pass against the content rules, producing a FIX/DROP list in `docs/chuanhua/content-review.md` §5.
  4. **A mandatory human review of every prompt** by the content owner (Handoff H13), recorded in the sign-off table. **Submission waits on it.**
  5. Later changes only **retire** prompts (`retired: true`); text is never edited in place after release, because existing chains keep their own copy.
- **AIGC:** the bank is AI-drafted and human-edited. Players never receive generated content at runtime. Whether a label is needed is a counsel question (H10). The 用户协议 says prompts are AI-assisted and human-reviewed.

### 4.4 Coming back daily (PO-37, Art. 3.3)

- **Streak** "连续接龙 N 天": consecutive Beijing days with ≥ 1 sent, non-marker turn in **either mode**. Server-computed and shown at N ≥ 2 on home and in 我的接龙. **No rewards, no freeze, no "快断了" reminders.**
- **The group pull:** with group context, home shows the group's open lobby or waiting 慢慢传 chains ("本群有一局正在等人 ›", "本群有 2 条等你接 ›"). The room card in the chat updates its count live.
- **慢慢传 reveal notice** (opt-in, §10.3).
- **No solo mode**: a telephone game needs other people for its payoff.

---

## 5. Drawing tool and stroke data (PO-10, PO-11, PO-38, PO-39)

### 5.1 Canvas (F-3)

- The canvas **fills every bit of the draw screen not used by the minimal controls**: the top bar, the source strip, the colour row and the tool row, with 8 pt gaps and 8 pt side margins (an Android edge-gesture safety margin). Exact rects are in §8.4.
- **Logical grid: 1024 wide, `h` high**, where `h = round(1024 × canvasH / canvasW)`, clamped to **768-2048** (aspect 0.75-2.0).
  - If the free space is outside that range (PC, tablets, landscape), the canvas rect is reduced to the clamped aspect and centred. The leftover is the screen background.
  - The rect and `h` are fixed for the whole turn. They are computed once when the turn opens and never move (TD-73 rule).
- One finger draws. A second finger is ignored, and touches that start outside the canvas never draw (single-finger routing copied from [DJT]).
- Points are kept only when ≥ 3 grid units from the last kept point. Only the stroke being drawn may be smoothed for display.

### 5.2 Tools

| Tool | v1 |
|---|---|
| Colours | **6 base:** 墨 `#1E1B18`, 朱 `#D8433B`, 橙 `#F29B30`, 绿 `#3E9B5A`, 蓝 `#3C78C8`, 紫 `#7B4FB3`. **今日彩笔** (rewarded, unlocked in 设置 only, today only, §11): 粉 `#F28DB2`, 黄 `#F2D13C`, 天青 `#6CC3E0`, 棕 `#8A5A3B`, 灰 `#9A9A9A`, 草 `#9CCB4A`; while unlocked they form a second colour row |
| Brush size | **one toggle button** cycling 细 8 → 中 18 → 粗 36 (grid units); it shows a dot of the real width; default 中 |
| 撤销 (undo) | removes the last stroke; unlimited within the turn |
| 清空 (clear) | confirm "清空画布？"; then undo can't restore. The confirm dialog does not pause the timer; at time-up it closes and the forced send happens |
| Eraser | none (undo covers it) |
| Timer | in the top bar; 10 s warning in 朱 |
| 画好了 | primary; disabled until ≥ 1 stroke |

Colour swatches are 40 pt circles with a 48 pt touch target. The selected one has a ring and a check mark, so selection is never shown by colour alone.

### 5.3 Stroke format v2 (`core/strokes.js`, shared client and server)

```js
{ v: 2,                       // format version
  h: 1363,                    // logical height (768-2048); logical width is always 1024
  s: [                        // strokes, in drawing order
    [c, w, x0, y0, dx1, dy1, dx2, dy2, ...],   // c = colour index 0-11, w = size index 0-2,
  ]                                            // first point absolute, then deltas (ints)
}
```

- **v1 compatibility:** `{v: 1, s}` decodes as `h = 1024` (square). Stored v1 drawings stay valid.
- **Limits (server-validated; the client enforces the same):**
  - `h` is an integer from 768 to 2048;
  - ≤ 200 strokes; ≤ 4,000 points in total; ≤ 600 points per stroke;
  - x within 0-1023 and y within 0-(h−1) after decoding;
  - colour 0-11; size 0-2;
  - path length ≤ `maxPathUnits` (250,000, TD-56);
  - serialized JSON ≤ 32 KB.
- Over the point or path limit, new strokes are blocked with "画得太细啦，先交吧" / "线条太多啦，先交吧".

### 5.4 Strokes vs PNG (PO-10)

- **The client uploads strokes only, never an image.** The server validates them, then **rasterises a PNG of 512 × round(512 × h / 1024)** (white background, round caps and joins, widths scaled ×0.5) with the pure-JS rasteriser (`core/raster.js`, `common/png.js`, TD-6). That PNG is what the image check sees (§6.3).
- **Clients render drawings from strokes** with the same geometry (`render/strokes.js`, TD-74). What others see is exactly what was checked, and the reveal can replay stroke by stroke.
- **PNGs never reach a client.**

### 5.5 Describe input

- The previous drawing fills the drawing area (contain-fit, §5.7, static). The input sits below it, with a 45 s timer.
- Input uses the mini game keyboard (`wx.showKeyboard`, `onKeyboardInput`, `onKeyboardConfirm`, `hideKeyboard`) [VERIFY V4]. The canvas draws the text box, the counter ("7/16") and the placeholder "你觉得这画的是什么？". With the keyboard open, the compact layout of TD-75 applies.
- Submit with 传出去 or the keyboard's confirm key.

### 5.6 Text rules (`core/text.js`, shared)

Applied to custom prompts (2-12 characters) and descriptions (2-16), counted in Unicode code points after trimming:
- Allowed: CJK characters, Latin letters, digits, the punctuation `，。！？、…—·~` and their ASCII forms. Emoji and other symbols are removed on input.
- **Contact and ad patterns are rejected locally** (§7.6). These include:
  - 5 or more digits (also in full-width form and as 一二三… sequences);
  - URL or domain patterns;
  - contact words such as `wx`, `vx`, `微信`, `加我`, `QQ`, `群号`, `电话`, plus the TD-91 additions;
  - @-handles.
- The **local blocklist** (`core/content/blocklist.v1.js`, with exceptions, TD-91) is checked before any API call.
- A local rejection returns "换个说法吧", with no strike.

### 5.7 Showing a drawing on another screen (PO-39)

- Every drawing is drawn **contain-fitted and centred** in the target rect: `scale = min(rectW / 1024, rectH / h)`. It is never cropped or stretched.
- The drawing's own paper is white. The unused part of the rect is drawn in the **margin tone** (`#EFEAE0` standard, `#DDDDDD` in high contrast), so its edge is visible.
- The same function serves the describe screen, the round-wait thumbnail, 已传出, the reveal cards, the step-through, replay and own-棒 detail.
- **Example:** a drawing with `h` = 1363, shown in the 375 × 812 describe area (359 × 510 pt), is drawn at 359 × 478 pt with 16 pt of margin above and below.

### 5.8 Time-up: forced send and marker steps (F-4, PO-40)

At 0 s by server time (live: the round deadline; 慢慢传: `claim.at` + timer):

1. **All input stops at once.**
   - The stroke being drawn ends at its last kept point and is kept.
   - The keyboard closes.
   - Every button is inert: 画好了, 传出去, 撤销, 清空, colours, size, 举报, back, and an open 清空 confirm (it closes).
   - The status strip shows "时间到，正在交出…".
2. **The turn is sent as it is** (`auto: true`):

| What exists at 0 | Sent as | Next player sees | Reveal shows |
|---|---|---|---|
| ≥ 1 stroke | the drawing (checked, §6.3) | the drawing | the drawing |
| 0 strokes | **marker** `emptyDraw`, no check | 「（没来得及画）」 + "上一棒没来得及画，你随便写一句吧" | 「（没来得及画）」 note |
| text with ≥ 2 valid characters | the text (checked, §6.2) | the text | the text |
| 0-1 valid characters | **marker** `emptyText`, no check | 「（没来得及写）」 + "上一棒没来得及写，你自由画一幅吧" | 「（没来得及写）」 note |
| checked and `risky`, or the check errored or timed out, or locally rejected | live: **marker** `notDelivered`; 慢慢传: the 棒 reopens | live: 「（这一棒没传过来）」 + the matching free-play line | live: 「（这一棒没传过来）」 |
| live round 0, nothing confirmed | the selected rolled prompt (or the first) | the prompt | the prompt |

3. **Retries:** the client retries a failed send every 1 s until `deadline + grace` (live) or claim loss (慢慢传).
   - Live, still failing: "网络不好，这一棒没有交上". The server's empty marker stands.
   - 慢慢传: the draft is kept until `CLAIM_LOST`.
4. **Marker steps:**
   - They are fixed system text (`core/copy.js#MARKERS`) stored with `marker` and no content. No moderation call, no strike.
   - They count as passed 棒 / sent turns for chain progress, but not for the daily turn cap or the streak.
   - They cannot be reported (nothing to report) and cannot be deleted. The author's own reveal note shows "(你)".
   - A player whose source is a marker plays freely (the lines above). Their output continues the chain normally.
5. Manual sends keep their rules: 画好了 needs ≥ 1 stroke, and 传出去 needs ≥ 2 valid characters.

---

## 6. Moderation pipeline [COMPLIANCE] (PO-44)

**Principle: check before anyone else sees it, and fail closed.**
- No user text or drawing is shown to anyone but its author until a platform check has returned `pass`.
- If a check is slow, fails or is down, the content is not delivered:
  - live rooms use a marker;
  - 慢慢传 keeps the author's work, so they can retry or the 棒 reopens.
- All checks run server-side in cloud functions, with the author's `openid` from `cloud.getWXContext()`, never from the client.

### 6.1 Platform facts used

**Image check, primary: 小游戏「图片内容安全识别」`mediaCheckSync`** (https://developers.weixin.qq.com/minigame/dev/api-backend/wxa-sec-check/api_gamesecurity.mediacheck.html):
- HTTPS `POST https://api.weixin.qq.com/wxa/game/content_spam/media_check_sync`; cloud call `wxa.game.contentSpam.mediaCheckSync` (same parameters) [VERIFY V16: the name in `wx-server-sdk` `cloud.openapi`].
- **Synchronous:** "接口同步返回", typically within 3 s; the doc recommends a 5 s timeout.
- **Mini game accounts only**; server-side only; no third-party platforms.
- Parameters: `openid`, `version: 2`, `scene` (1 资料, 2 评论, 3 论坛, 4 社交日志, 5 聊天), `media_url` (must be downloadable by the checker), `media_type: 2`.
- Formats jpg/jpeg/png/bmp/tif/tiff/webp/gif, ≤ 10 MB; no dimension limit stated.
- Response: `trace_id`, `result.suggest` (`risky` | `pass`), `result.label` (100 正常, 10001 营销广告, 20001 时政, 20002 色情, 20003 辱骂, 20006 违法犯罪, 20012 低俗, 21000 其他), and `detail[]` with `prob`.
- Limits: **2,000/min and 200,000/day per AppID** (increases on request).
- Errors include 750031 ("game not supported; contact the mini game team to configure"), 750032 (per-minute limit) and 750033 (daily limit).
- The doc recommends this game interface over the general 1.0/2.0 interfaces because it adds detection for "低俗软色情、血腥、恐怖、恶心不适、营销引流".
- The pre-publish limit is not stated [VERIFY V16].

**Text check, primary: 小游戏「文本内容安全识别」** (the game `msgSecCheck`, https://developers.weixin.qq.com/minigame/dev/api-backend/open-api/sec-check/security.msgSecCheck.html):
- HTTPS `POST /wxa/game/content_spam/msg_sec_check`; cloud call `wxa.game.contentSpam.msgSecCheck` [VERIFY V19].
- Parameters `openid`, `version: 2`, `scene` 1-5, `content` ≤ 2,500 characters.
- Result `suggest` `risky` | `pass`, with `label`; usually ≤ 500 ms (the doc suggests a 1 s timeout; we use 2 s).
- 10,000/min, 10 M/day.
- The doc says mini games should use this game interface rather than the general one.

**Text fallback:** the general `security.msgSecCheck` v2 (v1 pipeline: `suggest` may be `review`; 100/day before publish), selected by `app_config.moderation.textApi: 'general'`.

**Image fallback:** `security.mediaCheckAsync` v2 with the `wxa_media_check` push, "异步检测结果在 30 分钟内会推送" (https://developers.weixin.qq.com/minigame/dev/api-backend/open-api/sec-check/security.mediaCheckAsync.html). Used only in `imageMode: 'async'` (§6.10).

**Not used:** the legacy synchronous `security.imgSecCheck` (1.0: ≤ 1 MB, ≤ 750 × 1334 px). The mediaCheckAsync page says the 1.0 interfaces "在2021年9月1日停止更新", and the current server API index no longer lists it.

**Scene:** **3 (论坛)** for all checks, because content is shown to several people in a group [VERIFY V3: compare with 5 聊天 for live rooms].

### 6.2 Text (custom prompts and descriptions)

The check runs synchronously inside `createChain` / `submitRoomStep` round 0 (custom prompt) and `submitStep` / `submitRoomStep` (description):
1. `core/text.js` rules and the local blocklist (§5.6). Fail → `TEXT_REJECTED` (no strike, no API call).
2. Game `msgSecCheck` (scene 3, the author's openid), with a 2 s timeout.
3. Result:
   - `pass` → stored as `passed` and delivered.
   - `risky` → **blocked** and **one strike** (§7.3): "这句话没通过审核，换个说法吧" (a prompt: "这个题目不太合适，换一个吧"). The author keeps the text to edit while time remains.
   - `review` (general fallback API only) → blocked, no strike.
   - API error, timeout or quota → `MODERATION_BUSY`. Nothing is stored; the author keeps the text, "审核服务繁忙，请稍后再试". This feeds the circuit breaker (§6.8).
   - At a forced send, any of the non-pass outcomes gives the §5.8 behaviour.
4. Blocked text is kept in `mod_log` (admin-only, 180 days) and is never shown to others.

### 6.3 Drawings (both modes)

Inside `submitStep` (慢慢传) and `submitRoomStep` (live):
1. Validate the strokes (§5.3). Invalid → `INVALID_STROKES`.
2. Rasterise the PNG (§5.4) and upload it to `chuanhua/mod/<YYYYMM>/<chainId>/<n>_<attempt>.png` (§13.3).
3. `getTempFileURL` with `maxAge` 600 s [VERIFY V11: the checker can fetch it].
4. **`mediaCheckSync`** (`media_type: 2`, scene 3, the author's openid), with a 5 s timeout.
5. Result:
   - `pass` → step `passed`, delivered (live: the slot is `sent`; 慢慢传: the next 棒 opens, or the chain reveals).
   - `risky` → `blocked` + one strike. Before time-up: `IMAGE_BLOCKED`, "这幅画没通过审核，改一改再交" (the strokes stay on the canvas). At forced send: §5.8.
   - Error, timeout, 750032/750033 or quota → `MODERATION_BUSY`. Nothing is delivered. Before time-up the author may resend; at forced send, §5.8 applies.
6. Every verdict is logged (`mod_log`, `mod_verdict` event with `latencyMs`).

Typical live timing: the forced sends at 0 s arrive together, and n checks run in parallel (n ≤ 10, well under 2,000/min). The `passing` phase lasts until the checks resolve, at most about 6 s plus the 8 s in-flight guard of §3A.5.

### 6.4 What each person sees

| Situation | The author | Others |
|---|---|---|
| Drawing or text passed | 已交 / 已传出 | live: the next seat gets it next round; 慢慢传: "第 N+1 棒等你接" |
| Blocked before time-up | inline message, keeps the work, can fix and resend | nothing |
| Blocked or busy at forced send, live | toast "这一棒没通过审核，没有传出去" (blocked) or "网络不好，这一棒没有交上" (busy) | next seat: 「（这一棒没传过来）」; reveal: the same marker; nobody learns why |
| Blocked at forced send, 慢慢传 | 我的接龙: "这一棒没通过内容审核，没有传出去。" | the 棒 simply reopens |
| Empty at time-up | "时间到，已自动交出" | 「（没来得及画/写）」 |
| Passed, then reported or hidden | 我的接龙 and reveal: "这一棒已被举报隐藏" | placeholder "该内容已被举报隐藏" |
| Strike from `risky` | the one-time 公约 sheet on next open | nothing |

### 6.5 Reveal and share gating

- A room or chain is revealed only with steps that are `passed` or markers. Hidden and deleted steps render as placeholders.
- Share images never contain user drawings (PO-24, §9). Share titles may contain the prompt and the final sentence, which are passed text.

### 6.6 Pre-publish quota and test modes (PO-14)

- Environment variables `MODERATION_MODE` = `live` | `mock` and `ENV_KIND` = `prod` | `dev`.
- **`mock`** (dev only; automated tests and QA):
  - **Text:**
    - `测试违规` → `risky`;
    - `测试复审` → `review` (general API path);
    - `测试繁忙` → error;
    - anything else → `pass`.
  - **Images (sync):**
    - exactly 13 strokes → `risky`;
    - 15 strokes → timeout (`MODERATION_BUSY`);
    - anything else → `pass`, after `MOCK_SYNC_DELAY_MS` (default 800) to simulate latency.
  - In `imageMode: 'async'`, the v1 mock pushes apply (13 risky, 14 review, 15 no verdict).
- **`live` in dev** (device pass, QA spot checks): daily budgets `MOD_TEXT_DAILY_BUDGET` (default 80) and `MOD_IMAGE_DAILY_BUDGET` (default 200), counted in `mod_quota/<dateKey>`. Beyond them, requests fail closed with `MODERATION_BUSY`.
- **Production:** `ENV_KIND=prod` forces `live`. If mock is set in prod, every UGC function returns `SERVER_CONFIG` and logs `[ALERT]`.

### 6.7 Quota guard

`mod_quota/<dateKey>` counts image and text calls.
- At **70%** of 200,000 images/day: `[ALERT]` (the founder asks WeChat for a raise, Handoff H11).
- At **95%**: `createRoom` and `createChain` return `UGC_BUSY` ("今天大家玩得太热闹了，明天再来开新的吧"). Rooms already playing and claims of existing chains continue.
- At 100%: drawing sends fail closed (`MODERATION_BUSY` → §5.8).

### 6.8 Kill switches and circuit breaker

- `app_config.ugc = {createEnabled: true, viewEnabled: true}` (cloud console, no release needed).
  - `createEnabled: false`: no new rooms, chains, joins, claims or sends. Rooms in play are finished at once by `roomSweeper`: all remaining slots become markers and the room reveals. Clients show "接龙维护中，可以先看看已揭晓的接龙".
  - `viewEnabled: false`: **every content view returns placeholders** (assignments, claims, reveals: "内容维护中"). This is the emergency stop.
- **Circuit breaker:** if ≥ 50% of moderation calls fail (minimum 20 calls) over 5 minutes, `modSweeper` sets `app_config.ugc.autoPausedUntil = now + 15 min` and logs `[ALERT]`. Creation behaves as `createEnabled: false` until then.

### 6.9 Live-room moderation design and residual risk

**The problem.** In v1 every drawing waited up to 30 minutes for an async verdict. A live round needs the previous drawing within seconds.

**The design (option (a) of the CTO brief, with fail-closed fallbacks):**
1. **Synchronous game image check on every drawing, before delivery** (§6.3). Typical ≤ 3 s, cut off at 5 s. Nothing unchecked is ever shown.
2. **Synchronous game text check on every sentence and custom prompt** (§6.2).
3. **Fail closed in the flow, not around it:** a slow, failed or blocked check becomes the neutral marker 「（这一棒没传过来）」. The game never stalls and never shows unchecked content.
4. **Small, known audience:** rooms are bound to one WeChat group, joined only through that group's card, up to 10 people. Reveals go to members only, and share images carry no UGC.
5. **After delivery:** a report hides the item for everyone at once (§7.1); strikes and restrictions apply (§7.3); daily human sampling (§7.2); kill switches (§6.8).
6. **If `mediaCheckSync` is not usable for our AppID** (750031 not resolved, no cloud-call route, or p95 > 5 s at the device pass): set `app_config.moderation.imageMode = 'async'`. This **switches live rooms off** (`features.liveRooms` is forced false by the server, and home shows only 慢慢传) and runs the v1 async pipeline (§6.10). The CTO escalates to the founder. We do **not** fall back to showing unchecked drawings.

**Alternatives rejected** (decisions PO-44):
- (b) Deliver unchecked drawings within the small group and check them async: shows unchecked UGC, and WeChat review acceptance is unknowable.
- (c) A local or heuristic pre-check: adds nothing a classifier would trust.
- A parallel async second opinion: doubles quota use and keeps the push route on the critical path. Possible later (§20).
- The legacy `imgSecCheck`: stopped updating in 2021.

**Residual risk (stated plainly):**
- **Availability is unverified** [VERIFY V16]. The interface exists and is documented for mini games. We have not yet called it from our AppID, confirmed the cloud-call name, seen whether error 750031 means it must be enabled per game, or learned its pre-publish quota. If it needs enabling, that is a founder request to WeChat (Handoff H5).
- **Classifier misses.** Like any machine check, it can miss crude doodles (a primitive drawing of a leader or genitals). There is no human pre-review. Mitigations: group-only reach, member-only reveals, instant-hide reports, strikes, daily human sampling, kill switch. This risk is the same as in v1 (which was also machine-only), just with faster delivery.
- **Classifier false positives** turn honest drawings into 「（这一棒没传过来）」. This costs some fun, not safety.
- **Latency spikes** (> 5 s) turn into markers. Tracked as the marker rate in §14.
- **Screenshots:** members can screenshot what they saw. This is outside our control and is stated in the 用户协议.

### 6.10 Fallback image mode `imageMode: 'async'` (the v1 pipeline, PO-13)

Kept dormant in the code and switched on by config only:
- Drawings → PNG → `mediaCheckAsync` → `pending` → push to `onMediaCheck`:
  - `pass` opens the next 棒;
  - `review` blocks with no strike;
  - `risky` blocks with a strike.
- 35-min re-check, then `void`. The push route order is PO-33 / V1.
- The author sees 审核中 (TD-37 poll).
- The chain can't be claimed while pending ("第 N 棒审核中，通常几分钟").
- **Live rooms are unavailable** in this mode.
- The old ACs 42-50 apply in this mode only.

---

## 7. Reports, takedown, offenders, retention, minors [COMPLIANCE]

### 7.1 User report flow (PO-16)

- **举报** appears:
  - in the top bar of a draw or describe turn (reports the source shown, when it is user content: a custom prompt, a description or a drawing; never a rolled prompt or a marker);
  - on every step in the step-through;
  - on the teaser (reports the shown texts).
- The sheet has one-tap reasons: 色情低俗 · 政治敏感 · 辱骂攻击 · 广告引流 · 其他不适 → [提交举报] [取消]. There is no free text, so reports create no new UGC to moderate.
- The report sheet does not pause a live timer. At time-up it closes, unsent, and the forced send happens.
- On submit (`report`), the item is **hidden for everyone immediately** (`hidden`, reason `report`). The reporter sees "已举报，该内容已隐藏，我们会尽快核实".
  - **Live round:** the reporter's source becomes 「（该内容已被举报隐藏）」. They keep their turn and timer and play freely. In the reveal the step shows the placeholder. The client reports with `{roomId, reportRef, reason}`: `reportRef` is the opaque token on its own `getRoom` assignment source, and the server derives the chain and step from the caller's seat (TD-140, §13.2). No live chain id reaches the client before the reveal.
  - **Live round, hidden custom prompt:** a reported custom prompt does **not** retract the drawings already made from it. Each of those drawings passed its own image check, so it stays in the chain, is still handed to the next worker as a normal source, and can be reported on its own. The reported prompt itself shows the placeholder. (CTO decision on QA-R2-5, logged in `decisions.md` by backend.)
  - **慢慢传, latest passed 棒 of an open chain:** the 棒 reopens (as v1). A reporter holding the claim on the next 棒 has it released and may take the reopened 棒; someone else's claim is cancelled ("上一棒已被隐藏，本棒取消").
  - **Later steps built on it, or a revealed chain:** placeholder only.
  - **A custom prompt** (teaser or round-1 source): the whole chain is hidden ("该接龙已被举报隐藏"); in a live round the drawings already made from it stand (above).
- Limits: 10 reports per day per player; one report per player per item (`reports/<openid>_<chainId>_<stepId|teaser>`, TD-92); you can't report your own step.
- Reports never reveal the reporter to anyone.

### 7.2 Admin takedown path (no admin UI)

Cloud function **`admin`** is callable **only from the cloud console** (test invocation, which carries no OPENID). Any call with an OPENID returns `FORBIDDEN`, unless the OPENID is listed in env `ADMIN_OPENIDS` (the fallback if console invocation turns out to carry one, [VERIFY V14]). Every operation writes `audit_log` (op, target, before/after state, `ts`, `by: console|<openid>`).

| `op` | Input | Effect |
|---|---|---|
| `listReports` | `{state: 'open', limit ≤ 50}` | open reports, oldest first, with the step text or a short-lived (10 min) temp URL of the PNG |
| `getStep` | `{stepId}` | the step's text/strokes, PNG temp URL (10 min), moderation results, reports, author's strike count (openid shown only here) |
| `sample` | `{n ≤ 50, kind?, mode?}` | random passed steps from the last 24 h for human spot checks |
| `upholdReport` | `{reportId}` | report upheld; the step stays hidden; **one strike** to the author |
| `dismissReport` | `{reportId, restore: boolean}` | report dismissed; with `restore`, the step is unhidden (only if it no longer blocks an open chain, else it stays hidden) |
| `hideStep` / `restoreStep` | `{stepId}` | manual takedown / restore |
| `removeChain` | `{chainId}` | the chain becomes `removed`: every view shows "该接龙已被移除" |
| **`removeRoom`** | `{roomId}` | every chain of the room `removed`; a room in play is ended; the room shows "这一局已被移除" |
| `restrict` | `{openid, days | permanent}` | sets a restriction (§7.3) |
| `liftRestriction` | `{openid}` | clears it |
| `setUgc` | `{createEnabled?, viewEnabled?}` | the kill switches (§6.8) |
| **`setModeration`** | `{imageMode?: 'sync'|'async', textApi?: 'game'|'general'}` | §6.9-6.10; switching to `async` ends rooms in play as in §6.8 |

**Ops routine** (Handoff H9): the founder or a delegate runs `listReports` and a `sample` of 20 daily for the first 4 weeks, then at least every 2 days. Reported content is hidden at once, so a slow queue never exposes content; it only delays restores and strikes. `modSweeper` logs `[ALERT]` when an open report is older than 48 h.

### 7.3 Repeat offenders (PO-17)

**Strikes:** one per `risky` verdict (text or image) and one per upheld report. `review` verdicts, local rejections, busy errors and markers give none. Strikes count over a rolling 30 days.

| Strikes (30 d) | Consequence |
|---|---|
| 1 | A one-time sheet with the 接龙公约 on the next open: "你有内容没通过审核。请遵守接龙公约，多次违规将被限制参与。" |
| 2 | **24 h restriction** |
| 3 | **7-day restriction** |
| ≥ 4 | **30-day restriction**, flagged for admin review (the admin may make it permanent) |

A restricted player cannot create or join rooms, start chains, claim or send. They can still open reveals of games they took part in, 我的接龙 and 设置.

A restriction that starts during a live game takes effect after that game: their remaining turns in it are still accepted and moderated, so the room isn't broken (TD-7 principle).

Copy: "你暂时不能参与接龙（至 10月17日 14:00）。原因：多次发布的内容未通过审核。如有疑问，请在「设置 · 反馈」联系我们。"

### 7.4 Author deletion

- In 我的接龙 a player can **删除这一棒** on any of their passed steps (not markers). 设置 offers **删除我的全部接龙内容**.
- Effect: the content is no longer served (placeholder "作者已删除这一棒"), and its strokes and text are removed from `steps`.
- In 慢慢传, if it was the latest passed 棒 of an open chain, that 棒 reopens.
- In a room **still playing**, deletion is not offered until the reveal (the step is part of a running round).
- A custom prompt is not deleted with its chain (user agreement §八.4).
- The moderation evidence (PNG and the `mod_log` text copy) stays admin-only until its 180-day deletion [VERIFY with counsel, H10].

### 7.5 Retention: 180 days (PO-19)

`cleanup` (daily, 04:00 BJT) deletes, once older than 180 days:
- `rooms`, `chains`, `steps` (text and strokes);
- cloud-storage PNGs (`deleteFile`, batches of 50);
- `mod_traces`, `mod_log`, `reports`, `reactions`, `sub_grants`, `audit_log`, `events`, `rate_limits`;
- `group_members`, `players` (including `seenPrompts`) and `group_stats` with no activity for 180 days.

Shorter clean-ups:
- **`room_signals`** are deleted 1 day after the room ends or closes (`roomSweeper`).
- Closed lobbies (never started) are deleted after 1 day.
- Abandoned chains are deleted after 1 day.

Aggregate `daily_stats` are kept. Every run is idempotent. All of this is declared in the privacy guide (§15).

### 7.6 Protection of minors

We cannot know a player's age (no age API, no data collected), so the whole game is **safe by default** (PO-20):
- Every item is checked before delivery (fail closed); reports hide at once; offenders are restricted.
- **No contact surface:**
  - no names, avatars or profiles;
  - no chat, no DMs, no friend requests, no public feed, no stranger matching;
  - lobbies show numbered seats only;
  - text cannot carry ≥ 5-digit numbers, URLs or contact words;
  - drawings are checked and reportable (广告引流).
- **Group-only reach** (§3.3, §3A.3) and participant-only reveals; share images carry no UGC.
- The 接龙公约 is shown and agreed before the first UGC (§8.2).
- No night-time pushes: the only message is the opt-in 慢慢传 reveal notice, held between 22:00 and 08:00 BJT.
- Platform 防沉迷 and real-name rules for mini games apply as the platform enforces them [VERIFY V13, H10].
- Duties under 《未成年人网络保护条例》 are a counsel check (H10).

---

## 8. Screens and flows

General rules (copied from [DJT] §8):
- Content starts below the capsule: `navBottom = capsule.bottom + (capsule.top − statusBarHeight)`.
- Nothing is drawn or tappable in the capsule row. In-game back is a "‹ 返回" text button at the top left.
- Primary actions sit in the bottom 40% of the screen, above the safe area.
- Touch targets ≥ 48 × 48 pt; body text ≥ 16 pt (20 pt in large text).
- Design width 375. Every screen must work from 320 to 430 wide and from 568 to 932 tall.
- Every network area has loading, empty and error states; errors offer 重试.
- Labels: steps are "第 N 棒", never names. The viewer's own steps and chains are marked "(你)" / "你起的".

Reference devices used for exact rects:
- **375 × 812:** status bar 44; capsule top 48, bottom 80 → **navBottom 84**; bottom safe inset 34 → **safe bottom 778**.
- **320 × 568:** status bar 20; capsule top 26, bottom 58 → **navBottom 64**; no inset → **safe bottom 568**.

At runtime the real `menuRect` and `safeArea` are used. The rects below follow from the same formulas.

### 8.1 Home

```
┌───────────────────────────────────┐
│ 9:41                    [ ··· ◎ ] │ ← capsule row: nothing drawn here
│                                   │
│           传 画 接 龙              │
│      群里一起画，传完一起笑          │
│          连续接龙 4 天              │ ← only when ≥ 2
│                                   │
│ ┌ 回到这一局 · 第 2/4 轮 ›        ┐ │ ← only while seated in a playing/lobby room
│ ┌ 来自群聊 · 本群有一局正在等人 › ┐  │ ← only with group context (§9.3)
│                                   │
│      [        开一局        ]       │ ← primary; subline "3–10 人一起，约 3 分钟"
│        慢慢传（不用同时在线）›        │ ← secondary text link
│                                   │
│  [ 我的接龙 (1) ]   [ 本群接龙 ]     │
│  [ 玩法 ]               [ 设置 ]    │
└───────────────────────────────────┘
```

| State | Behaviour |
|---|---|
| Loading (`getHome`) | skeleton; buttons enabled once loaded |
| Ready | as drawn |
| Offline / error | card "需联网才能接龙" + 重试; 我的接龙 shows the cached list (read-only); 开一局 and 慢慢传 disabled |
| Seated in a room | the 回到这一局 card (lobby: "回到这一局 · 等待开始"); 开一局 opens that room instead of creating one |
| Group context | the group line: open lobby → "本群有一局正在等人 ›" (opens room entry); else waiting chains → "本群有 2 条等你接 ›"; else "来自群聊 · 本群接龙 ›" |
| Live rooms off (`features.liveRooms: false`) | primary becomes **开一条接龙** (慢慢传); the link and room lines are hidden |
| Room cap reached | 开一局 subline "今天开局次数已用完，明天再来"; button disabled |
| 慢慢传 starts used up | tapping 慢慢传 shows a sheet: "今天的 3 条已开完" + "▶ 看视频再开一条 (剩 2)" if ad starts remain, else "明天再来开新的吧" |
| Restricted (§7.3) | banner with the restriction copy; 开一局 and 慢慢传 disabled; 我的接龙 works |
| UGC paused (§6.8) | banner "接龙维护中，可以先看看已揭晓的接龙"; creation disabled |
| First launch | the 玩法 sheet opens once, dismissible; no login, no consent screen |
| Reveal ready since last visit | 我的接龙 shows a dot and "(1)" |
| Strike warning pending | the one-time 公约 sheet (§7.3) |

### 8.2 接龙公约 (before the first UGC only)

Shown before the first 开一局, 加入这一局, 慢慢传 start or 接这一棒, as a bottom sheet:

```
┌───────────────────────────────────┐
│ 接龙公约                            │
│ · 画和字都会先审核，通过后才传给下一位 │
│ · 不画、不写色情低俗、政治、辱骂、广告 │
│   和联系方式                        │
│ · 违规内容会被隐藏，多次违规会被限制   │
│ · 看到不合适的内容，请点「举报」       │
│ 《用户协议》《用户隐私保护指引》        │
│ [ 先看看 ]          [ 同意并开始 ]    │
└───────────────────────────────────┘
```

- 同意并开始 → `agreeRules({version})` stores `rulesVersion`, then continues the tapped action. 先看看 closes the sheet.
- There is no pre-ticked box. A rules-version bump shows the sheet once more. **The rev. 2 user agreement is a material change: bump `rulesVersion`.**
- This is not a WeChat privacy-interface authorization (none is used, §15).

### 8.3 Pick screen (both modes)

```
┌───────────────────────────────────┐
│ ‹ 返回                   [ ··· ◎ ] │ ← live: no back; the top bar shows ⏱ 0:24 at right
│ 选一个题目                          │
│ 传给下一位来画                       │ ← 慢慢传: "你来画第 1 棒"
│ ┌───────────────────────────────┐ │
│ │ 月亮吃月饼                  ●  │ │ ← 3 cards, 64 pt tall, tap = select
│ ├───────────────────────────────┤ │
│ │ 企鹅滑滑梯                  ○  │ │
│ ├───────────────────────────────┤ │
│ │ 熊猫开出租车                ○  │ │
│ └───────────────────────────────┘ │
│ [ 换一批（剩5次）]   [ 自己出题 ]  │ ← count label; same rect in every state
│                                   │
│        [      就这个      ]         │ ← 慢慢传: "开始画 (60 秒)"
└───────────────────────────────────┘
```

After the 5th 换一批 (only the button row changes; nothing moves):

```
│ ┌───────────────────────────────┐ │
│ │ 小狗放风筝                  ●  │ │ ← the 6th set stays selectable
│ ├───────────────────────────────┤ │
│ │ 云朵洗澡                    ○  │ │
│ ├───────────────────────────────┤ │
│ │ 蜗牛送快递                  ○  │ │
│ └───────────────────────────────┘ │
│ [░换一批机会已用完░]   [ 自己出题 ]  │ ← greyed: grey text, disabled fill and dashed outline, no press feedback;
│                                   │   a tap does nothing (no call, no toast)
│        [      就这个      ]         │
```

**换一批 button rules:**
- The rect is fixed for the whole pick: same position and size before, during and after the limit. It is sized for the longest label (「换一批机会已用完」, 8 characters) at 320 × 568 in large-text mode without clipping, and stays ≥ 48 pt tall.
- Label: 「换一批（剩N次）」 with N = `rerollLeft` (5 → 1); 「换一批机会已用完」 at 0.
- Greyed style: neutral grey text and outline from the design tokens (the disabled tone), no colour, a disabled-tone fill with a dashed outline. The text stays readable (≥ 4.5:1 contrast in high-contrast mode). It is not hidden, collapsed or replaced by another control.
- 自己出题 and 就这个 are unaffected by the greyed state.

| State | Behaviour |
|---|---|
| Loading roll | skeleton cards "正在抽题…" (live: the roll comes with `getRoom` and is normally ready) |
| Ready | the first card preselected |
| Ready, rerolls left (N = 5..1) | 换一批 reads 「换一批（剩N次）」 and is tappable |
| Rerolling | after a tap on 换一批: the 3 cards keep showing, dimmed, with "正在换题…"; 换一批, the cards and 就这个 are not tappable until the answer; the label keeps its last count. On success the 3 cards are replaced, the first card is preselected and the count drops by 1 |
| Reroll error (network, `RATE_LIMITED`) | toast "没换成，再试一次"; the current cards and count stay. A `BAD_REQUEST` (stale `rollId` after a retry) reloads the current roll (`rollPrompts` plain call / `getRoom`) and shows it |
| Rerolls used up (`rerollLeft` 0) | 换一批 stays in place, greyed, reading 「换一批机会已用完」; a tap does nothing and sends no request; the cards, 自己出题 and 就这个 work normally |
| `REROLL_LIMIT` answer (client and server out of sync) | the client switches to the used-up state and keeps the current cards; no toast |
| 自己出题 open | canvas-drawn input with keyboard, counter "5/12", [确定] [取消]; 确定 sends the custom text (moderated) |
| Sending | the button reads "准备中…" |
| Custom blocked / rejected | inline "这个题目不太合适，换一个吧" / "换个说法吧"; cards stay selectable |
| `MODERATION_BUSY` | inline "审核服务繁忙，请稍后再试，或先选一个现成的题目" |
| Live, time up | input stops (换一批 included, in any state); the selected (or first) rolled prompt is sent unless a custom one already passed (§4.2) → round wait. A reroll still in flight at 0 is ignored by the client: the forced send uses the card selected on screen (§17 edge 26) |
| Live, sent | → round wait (§8.17) |
| 慢慢传 errors (`START_LIMIT`, `RESTRICTED`, `UGC_PAUSED`, `UGC_BUSY`) | the matching copy; back to home |
| Offline | "需联网才能开始" + 重试 (live: the forced-send rule still applies at 0) |

### 8.4 Draw screen (F-3, PO-38)

```
┌───────────────────────────────────┐
│ 9:41                    [ ··· ◎ ] │
│ ‹ 离开   画出来 · 1/4    举报  0:48 │ ← top bar (48): back · title · 举报 · timer
│ 上一棒说：「恐龙在学跳舞」           │ ← source strip (1-2 lines)
│┌─────────────────────────────────┐│
││                                 ││
││                                 ││
││         CANVAS (fills all       ││
││         remaining space)        ││
││                                 ││
││                                 ││
│└─────────────────────────────────┘│
│ ●  ●  ●  ●  ●  ●                  │ ← colour row (48)
│ [撤销] [清空] [ • ] [   画好了   ]  │ ← tool row (48): undo · clear · size toggle · submit
└───────────────────────────────────┘
```

**Exact rects, standard mode** (x, y, w, h in pt; y from the top of the window):

| Element | 375 × 812 | 320 × 568 |
|---|---|---|
| Top bar | 0, 84, 375, 48 | 0, 64, 320, 48 |
| · back (‹ 离开 live / ‹ 放弃 慢慢传) | 8, 84, 80, 48 | 8, 64, 80, 48 |
| · title (centred, 17 pt) | 88, 84, 159, 48 | 88, 64, 104, 48 |
| · 举报 (only when `canReport`) | 247, 84, 48, 48 | 192, 64, 48, 48 |
| · timer (17 pt, tabular) | 303, 84, 64, 48 | 248, 64, 64, 48 |
| Source strip, 1 line (17 pt) | 16, 132, 343, 40 | 16, 112, 288, 40 |
| Source strip, 2 lines | 16, 132, 343, 64 | 16, 112, 288, 64 |
| **Canvas (1-line strip)** | **8, 180, 359, 478** → `h` 1363 | **8, 160, 304, 288** → `h` 970 |
| **Canvas (2-line strip)** | **8, 204, 359, 454** → `h` 1295 | **8, 184, 304, 264** → `h` 889 |
| Colour row (6 swatches, 48 targets) | 8, 666, 359, 48; swatch i at x = 8 + 62.2·i | 8, 456, 304, 48; swatch i at x = 8 + 51.2·i |
| Tool row | 8, 722, 359, 48 | 8, 512, 304, 48 |
| · 撤销 | 8, 722, 64, 48 | 8, 512, 56, 48 |
| · 清空 | 80, 722, 64, 48 | 72, 512, 56, 48 |
| · 粗细 toggle | 152, 722, 64, 48 | 136, 512, 56, 48 |
| · 画好了 (primary) | 224, 722, 143, 48 | 200, 512, 112, 48 |
| Gap below the tool row | 8 (to safe bottom 778) | 8 (to 568) |

**With 今日彩笔 unlocked** (a second colour row, 6 more swatches): the colour rows sit at y 610 and 666 (375 × 812) or 400 and 456 (320 × 568). The canvas loses 56 pt:
- 375 × 812: 8, 180, 359, 422 → `h` 1204.
- 320 × 568: 8, 160, 304, 232 → `h` 782.
- 320 × 568 with a 2-line strip as well: the free space is 304 × 208 (aspect 0.68 < 0.75), so the canvas is clamped to 277 × 208 at x 21.5 with `h` 768 (§5.1).

**Formula (all sizes and modes):**
- `canvas.y = sourceStrip.bottom + 8`
- `toolRow.bottom = safeBottom − 8`
- `colourRow(s)` sit above the tool row, with 8 pt gaps
- `canvas.bottom = topColourRow.y − 8`
- `canvas.x = 8`, `canvas.w = windowWidth − 16`
- then the clamp of §5.1.
- **Large text:** top bar 56, strip lines 28 pt (20 pt text), rows 56, button labels 20 pt. The canvas absorbs the difference.
- **High contrast:** same rects.

**Copy:**
- Title: live "画出来 · r/R" (r = this round, R = rounds); 慢慢传 "第 3 棒 · 画出来".
- Source strip:
  - round 1 / 第 1 棒: "题目：「月亮吃月饼」";
  - later: "上一棒说：「…」";
  - marker source: "上一棒没来得及写，你自由画一幅吧";
  - hidden: "（该内容已被举报隐藏）你自由画一幅吧";
  - paused: "内容维护中".

| State | Behaviour |
|---|---|
| Drawing | strokes render live; 撤销 enabled with ≥ 1 stroke; 画好了 enabled with ≥ 1 stroke |
| Last 10 s | the timer turns 朱; one soft tick at 10 s (muted if sound is off) |
| **Time up (F-4)** | all input stops (§5.8); the strip over the canvas bottom reads "时间到，正在交出…"; auto-send → live: round wait; 慢慢传: 已传出 |
| Sending (manual) | "正在交出…"; canvas locked; ≤ 10 s, then error |
| Image blocked (before time-up) | the strip reads "这幅画没通过审核，改一改再交"; the canvas unlocks with the strokes; the timer keeps running |
| Send error / offline (before time-up) | "没传出去" + 重试 (the strokes stay); at time-up the retry rule of §5.8 applies |
| 离开 (live) | confirm "离开后你的回合会自动跳过，确定离开？" → `leaveRoom` → home. The timer keeps running under the dialog; at 0 the dialog closes and the forced send happens |
| 放弃 (慢慢传, before time-up) | confirm "放弃这一棒？群友可以接着画" → `releaseClaim` |
| Point or path limit reached | new strokes blocked; "画得太细啦，先交吧" / "线条太多啦，先交吧" |
| First ever draw turn | coach line over the canvas for 3 s: "一根手指画，画得丑没关系，越离谱越好笑" (dismiss only via its corner, TD-84) |
| App backgrounded | the draft is saved; on return the server time decides: before the deadline the turn resumes; after it, "时间到了，这一棒已自动交出" (live) or the late-submit rule of §3.5 (慢慢传) |
| Card opened during a turn | never interrupts; a toast "群里有新消息，交完这一棒再看" |

### 8.5 Describe screen

```
┌───────────────────────────────────┐
│ ‹ 离开   猜一猜 · 2/4    举报  0:31 │ ← top bar as on the draw screen
│┌─────────────────────────────────┐│
││                                 ││
││   previous drawing, contain-fit ││ ← fills all space above the input
││   (margin tone around it)       ││
││                                 ││
│└─────────────────────────────────┘│
│┌─────────────────────────────────┐│
││ 一只猫在开出租车_          7/16  ││ ← input (placeholder 你觉得这画的是什么？)
│└─────────────────────────────────┘│
│ [            传出去             ]  │
└───────────────────────────────────┘
```

| Element (standard) | 375 × 812 | 320 × 568 |
|---|---|---|
| Top bar | 0, 84, 375, 48 | 0, 64, 320, 48 |
| Drawing area | 8, 140, 359, 510 | 8, 120, 304, 328 |
| Input | 8, 658, 359, 56 | 8, 456, 304, 48 |
| 传出去 | 8, 722, 359, 48 | 8, 512, 304, 48 |

With the keyboard open, TD-75's compact layout applies: a small drawing with the counter beside it, then the input with 传出去 beside it, above the keyboard. A marker source shows the marker text in the drawing area plus "上一棒没来得及画，你随便写一句吧".

| State | Behaviour |
|---|---|
| Typing | counter; invalid characters are dropped with a brief shake of the counter |
| < 2 characters | 传出去 disabled |
| Sending | "审核中…" (sync, ≤ 2 s) |
| Passed | live → round wait; 慢慢传 → 已传出, or the reveal if this was 第 6 棒 |
| Blocked / local rejection (before time-up) | inline "这句话没通过审核，换个说法吧" / "换个说法吧"; the text stays for editing |
| `MODERATION_BUSY` | inline "审核服务繁忙，请稍后再试"; the text stays |
| **Time up (F-4)** | keyboard closed, input locked; sends the text (≥ 2 valid characters) or the empty marker (§5.8) |
| Keyboard API unavailable [VERIFY V4] | fallback: `wx.showModal({editable: true})`. At time-up the modal can't be closed programmatically on every platform, so whatever it returns after the deadline is discarded and the turn counts as sent with what existed at 0 (usually the empty marker) |

### 8.6 已传出 (慢慢传 only, after a send)

```
┌───────────────────────────────────┐
│ ‹ 首页                   [ ··· ◎ ] │
│ 第 3 棒已传出                        │
│ ┌──────────────┐                   │
│ │ your drawing │  已通过             │
│ └──────────────┘                   │
│ 群友现在可以接第 4 棒                 │
│ 之前发到群里的卡片会自动更新进度        │ ← only if the updatable card works (§9.5)
│ [   发到群里接龙   ]                 │ ← share (voluntary)
│ [ 揭晓时提醒我 ]                     │ ← subscribe (§10.3), only with a template
│ [ 看看本群其他接龙 ] [ 再开一条 ]      │
└───────────────────────────────────┘
```

States:
- `passed`, or `marker` ("时间到，已自动交出（没来得及画）").
- `blocked` at a forced send: "这一棒没通过内容审核，没有传出去".
- In fallback mode only: `pending` and `void` (TD-37).
- The first time ever, one line explains: "你只能看到上一棒，下一位也只能看到你这一棒。全部传完后，参与的人一起看揭晓。"

### 8.7 Chain entry (慢慢传, from an invite card, 我的接龙 or 本群接龙)

As in v1, with these changes:
- **同题再传 is removed**: the expired state offers participants 看我的那一棒, and everyone 开一局.
- The pending state appears only in fallback mode.
- A new state, `inRoom`: "你正在一局里，先玩完再来接" + 回到这一局.
- The timer line reads "（限时 45 秒，时间到会自动交出）".

```
┌───────────────────────────────────┐
│                          [ ··· ◎ ] │
│           传画接龙                  │
│   ●●●○○○  已传 3/6 棒               │ ← progress dots, no content
│        第 4 棒等你接                 │
│     上一棒是一幅画，你来猜一句          │ ← kind only, never the content
│     （限时 45 秒，时间到会自动交出）     │
│        [    接这一棒    ]            │
│        [ 看看本群其他接龙 ]           │
│   48 小时内传完 · 还剩 31 小时         │
└───────────────────────────────────┘
```

Other states, unchanged from v1:
- loading;
- claimed by someone else;
- you did the previous 棒;
- your 3 棒 used;
- wrong group / no group context;
- unbound chain opened with group context;
- the starter's 现在揭晓 (≥ 4 passed);
- revealed as a participant → reveal (§8.8, one chain);
- revealed as a non-participant → teaser;
- removed; not found; restricted / rules / paused;
- `TAKEN` on tap;
- offline.

The entry screen **never shows the prompt or any 棒 content** before a claim.

### 8.8 Reveal overview (F-5, PO-45)

Opened for all members at the same moment when a room enters `reveal`. For a 慢慢传 chain it opens directly in the step-through (§8.9) with one chain, and its back goes to wherever it was opened from.

```
┌───────────────────────────────────┐
│ ‹ 首页                   [ ··· ◎ ] │
│ 全部揭晓！                           │
│ 5 条接龙 · 每条传了 4 棒              │
│ ┌──────────────┐ ┌──────────────┐ │
│ │  [final      │ │「外星人在吃    │ │ ← each card = the chain's FINAL step only
│ │   drawing]   │ │  披萨」        │ │
│ │ 第 1 条       │ │ 第 2 条 · 你起的│ │
│ └──────────────┘ └──────────────┘ │
│ ┌──────────────┐ ┌──────────────┐ │
│ │ 「（没来得及  │ │  [final      │ │
│ │   写）」      │ │   drawing]   │ │
│ │ 第 3 条       │ │ 第 4 条       │ │
│ └──────────────┘ └──────────────┘ │
│ [ 再来一局 ]         [ 分享揭晓卡 ] │
└───────────────────────────────────┘
```

- Cards are a 2-column grid at window width ≥ 360 in standard mode, otherwise 1 column (incl. 320 wide and large text). Each card is a sticky note showing **only the final step** (drawing contain-fit, static, or the sentence or marker), plus "第 N 条" and "你起的" on the viewer's own chain. **The overview never shows prompts or intermediate steps.**
- Tap a card → step-through (§8.9) on that chain, starting at its final step.
- **再来一局:**
  - **For the old host:** creates a new room bound to the same group, and the old room's members get a "再来一局？" banner on their reveal ("房主开了新的一局 · 加入 ›") via their signal doc. Nobody is moved automatically.
  - **For others:** joins the new room if the host made one; otherwise it creates one.
- **分享揭晓卡:** shares the room reveal card (§9.4).
- The interstitial rule applies on leaving (§11).

| State | Behaviour |
|---|---|
| Loading (`getRoomReveal`) | skeleton cards "正在揭晓…"; final drawings then load per chain (`getReveal`), in order |
| Ready | as drawn; unseen chains have a dot until opened |
| `NOT_MEMBER` | the room teaser (§8.10) |
| View paused | "内容维护中" placeholders |
| Error / offline | "揭晓需联网查看" + 重试 |

### 8.9 Step-through (one chain, final step first)

```
┌───────────────────────────────────┐
│ ‹ 全部          第 2 条 · 你起的     │ ← "‹ 全部" back to the overview (慢慢传: "‹ 返回")
│ ┌───────────────────────────────┐ │
│ │                               │ │
│ │                               │ │
│ │     STEP CONTENT (sticky       │ │ ← drawing (replays when shown) or sentence or marker
│ │     note, fills the space)     │ │   tap left half = earlier, right half = later
│ │                               │ │
│ └───────────────────────────────┘ │
│ 第 4 棒 · 画 · 最后一棒              │ ← position label; "(你)" on the viewer's own step
│ 笑 3                     举报       │
│ ‹ 往前一棒   ○ ● ● ● ◉   往后一棒 › │ ← dots: left = 起点, right = final (current ◉)
└───────────────────────────────────┘
```

- **Opens on the final step.** **‹ 往前一棒** (or a swipe right, or a tap on the left half of the note) shows the step before it. **往后一棒 ›** (or a swipe left, or a tap on the right half) goes back toward the final step.
- At the start, the 起点 card shows "起点：「月亮吃月饼」". 往前一棒 is disabled there, and a button **下一条 ›** opens the next chain at its final step. On the last chain it reads **看完了**, which returns to the overview.
- At the final step, 往后一棒 is disabled.
- **Stroke replay:** a drawing replays stroke by stroke in **2.5 s** whatever its length, the first time it is shown and on a tap on the drawing after that. A tap during the replay completes it at once. Sentences appear at once (no typing animation, so 40+ readers keep control).
- **Navigation is never automatic.**
- Dots: one per step plus the 起点. Tapping a dot jumps to that step. Dots have 48 pt targets; with more than 7 steps, a "4/5" text replaces them.
- Position label: "第 N 棒 · 画/猜", "最后一棒", "起点"; "(你)" on the viewer's own step.
- **笑:** one per member per step, a toggle with a count (PO-27). Not on markers.
- **举报:** on user content that isn't the viewer's own. Not on markers or rolled prompts.
- Hidden or deleted steps show "该内容已被举报隐藏" / "作者已删除这一棒". Markers show their text on a plain note.
- 慢慢传 early or expiry reveals show "提前揭晓 · 传了 4/6 棒" under the title.
- Swipe: a horizontal move of ≥ 48 pt that starts on the note area. Vertical moves are ignored.

| State | Behaviour |
|---|---|
| Loading (`getReveal`) | skeleton note "正在展开…" |
| Ready | as drawn |
| `NOT_PARTICIPANT` | teaser (§8.10) |
| View paused | "内容维护中" |
| Error / offline | "揭晓需联网查看" + 重试 |

### 8.10 Teaser (non-participants)

慢慢传 chain:

```
┌───────────────────────────────────┐
│ 一条接龙揭晓了                        │
│ 「月亮吃月饼」                         │
│      ↓  传了 6 棒                   │
│ 「外星人在吃披萨」                     │
│ 完整接龙仅参与的群友可见                │
│ [ 开一局 ]  [ 看看本群其他接龙 ]        │
└───────────────────────────────────┘
```

Room: "一局传画揭晓了 · 5 条接龙", then one line per chain, 「起点」→「终点」 or 「起点」→（一幅画）, then "完整内容仅这一局的群友可见" and [开一局] [看看本群其他接龙].

States: loading, ready, removed, not found, offline. A small 举报 reports the shown texts.

### 8.11 本群接龙 (group list and stats)

This entry needs group context (§9.3).

```
┌───────────────────────────────────┐
│ ‹ 返回                   [ ··· ◎ ] │
│ 本群接龙                             │
│ 本群一共玩了 12 局 · 画了 41 幅画       │ ← group_stats; no per-person data
│ 正在开的局                            │
│  ● 4 人已加入 · 等待开始          ›   │ ← lobby → room entry
│  ○ 第 2/4 轮进行中                    │ ← not joinable
│ 慢慢传 · 等你接                        │
│  ● 第 4 棒 · 猜一句 · 已传 3/6     ›  │
│ 最近揭晓                              │
│  一局 · 5 条接龙 · 今天 20:14       ›  │ ← member → overview; else teaser
│  「月亮吃月饼」→「外星人在吃披萨」  ›   │
│ [ 开一局 ]                           │
│ ┌ banner (config, default off) ┐      │
└───────────────────────────────────┘
```

States:
- no group context: explainer "在群聊里点开接龙卡片，就能看到本群的接龙" + [开一局];
- checking group; group check failed; loading;
- ready;
- empty: "本群还没有接龙，开第一局吧";
- error / offline.

### 8.12 我的接龙 (album)

```
┌───────────────────────────────────┐
│ ‹ 返回                   [ ··· ◎ ] │
│ 我的接龙            连续接龙 4 天     │
│ ● 一局 · 5 条接龙 · 今天 20:14     › │ ← dot = unseen reveal
│ ○ 一局 · 第 2/4 轮进行中           › │
│ ● 慢慢传 · 已揭晓「月亮吃月饼」      › │
│ ○ 慢慢传 · 进行中 3/6 · 我画了第 1 棒 › │
│ ✕ 这一棒没通过审核 · 第 5 棒          │ ← author-only status line
└───────────────────────────────────┘
```

- Lists the rooms the player was seated in and the chains they started or took a 棒 in. Newest first, paginated (20), for 180 days.
- Tapping:
  - a revealed room → overview;
  - a playing room → back into it;
  - a revealed chain → step-through;
  - an open chain → chain entry;
  - an expired or blocked chain → own-棒 detail (删除这一棒).
- The prompt of an unrevealed chain is shown only to its starter (TD-9).
- States: loading, ready, empty ("还没有接龙，去开一局吧"), error / offline (the cached list, read-only).

### 8.13 Report sheet

As §7.1. States: idle, submitting, done (toast "已举报，该内容已隐藏"), limit reached ("今天举报次数已达上限"), already reported ("你已举报过这条内容"), error (重试). At a live time-up the sheet closes.

### 8.14 设置

- Sound on/off.
- 显示: 大字模式 / 高对比度.
- 接龙公约; 《用户协议》 (the terms screen, TD-88); 《用户隐私保护指引》 (`wx.openPrivacyContract`).
- **▶ 看视频解锁今日彩笔** (the only entry for it, PO-49); when unlocked: "今日彩笔已解锁（今天有效）".
- 删除我的全部接龙内容 (confirm twice).
- 反馈 (`wx.createFeedbackButton`).
- 揭晓提醒 status line.

### 8.15 玩法 sheet

Three lines plus an illustration:
1. 开一局：拉群友一起玩，每人选一个题目。
2. 每一轮你只看到上一位传来的：是画就猜一句，是字就画出来。时间到会自动交出。
3. 最后一起揭晓：先看最后变成了什么，再一步步往回看。

Plus: "人少或者凑不齐？用「慢慢传」，一棒一棒在群里传。所有画和字都会先审核再传给下一位。"

### 8.16 Room entry and lobby (new)

**Room entry** (from a room card `m=<roomId>`, from home's group line or from 本群接龙):

| State (`getRoom` for a non-member) | Shows | Actions |
|---|---|---|
| Loading | skeleton "正在进入…" | |
| Lobby, joinable | "群友开了一局传画" · "4 人已加入（3–10 人）" · "每人选一个题目，轮流画和猜，大约 3 分钟" | **加入这一局** (公约 first if needed) · 首页 |
| Lobby full | "这一局满员了（10 人）" | 开一局 · 本群接龙 |
| Playing (not a member) | "这一局已经开始了，等下一局吧" | 开一局 · 本群接龙 |
| Reveal (not a member) | room teaser (§8.10) | |
| Member, any state | goes straight to the lobby, the current round or the overview | |
| Wrong group / no group context for a bound room | "这一局只能在发起的群里加入" | 开一局 |
| Closed | "这一局已经结束了" | 开一局 |
| In another room | "你还在另一局里" | 回到那一局 · 离开那一局 |
| Restricted / rules / paused / cap | the matching copy | |
| Offline | "需联网才能加入" + 重试 | |

**Lobby:**

```
┌───────────────────────────────────┐
│ ‹ 离开                   [ ··· ◎ ] │
│              这一局                 │
│  ① ② ③ ④ ○ ○ ○ ○ ○ ○              │ ← 10 seat stickers; filled = joined; "你" under yours
│        4 人已加入（3–10 人）          │
│  每人选一个题目，轮流画和猜，          │
│  大约 3 分钟，最后一起揭晓             │
│                                   │
│        [   邀请群友   ]              │ ← share the room card (voluntary)
│        [  开始（4 人） ]              │ ← host only
│                                   │
│   （非房主）等房主开始…                │
└───────────────────────────────────┘
```

- Seat stickers have 48 pt targets but are not tappable (no profiles). Seats silent for > 60 s show a faint "?" ("可能已离开").
- **Host:** 开始 is enabled with ≥ 3 active seats. With 2: disabled, "至少 3 人才能开局" + link **两个人？去慢慢传**. With 1: "把邀请发到群里，群友点开就能加入".
- **Non-host:** "等房主开始…"; no start button.
- **离开:** confirm "离开这一局？" → `leaveRoom` → home.
- **Start:** everyone's screen moves to the round-0 pick screen within the sync latency (§3A.7).
- States: ready, starting ("马上开始…"), closed by idle ("这一局太久没开始，已关闭" → home), removed, offline (polling retries; "网络不好，正在重连…").
- No ads, no 今日彩笔, no banner.

### 8.17 Round wait (new)

Shown after a player has sent, until the next round starts:

```
┌───────────────────────────────────┐
│ ‹ 离开   已交 · 2/4         0:21   │
│ ┌──────────────┐                   │
│ │ what you sent │                  │ ← your drawing (contain-fit) or sentence or marker
│ └──────────────┘                   │
│       等大家交… 3/5 已交             │
│       下一轮：猜一句                  │ ← or "最后一轮了" / "马上揭晓"
└───────────────────────────────────┘
```

- During `passing`: "传递中…".
- Then: the next round's draw, describe or reveal screen, automatically.
- Error / offline: "网络不好，正在重连…" (polling); the server keeps the game going regardless.

### 8.18 Navigation map

```
 room card (m=) ─→ Room entry ─加入→ Lobby ─host 开始→ Pick (round 0) ─→ Round wait
                                                           ↓ round 1..R (auto)
                                     Draw | Describe ─→ Round wait ─→ … ─→ Reveal overview ─→ Step-through
 chain card (k=) ─→ Chain entry ─接这一棒→ Draw | Describe ─→ 已传出 ─┬→ share (voluntary)
                                                                     ├→ 揭晓时提醒我
                                                                     └→ 本群接龙 / 再开一条
 reveal card (r= / m=) ─→ Step-through or Overview (member) | Teaser (others)
 launch → Home ─开一局→ (公约) → Lobby
            ├─ 慢慢传 → (公约) → Pick → Draw 第1棒 → 已传出
            ├─ 回到这一局 → Lobby | current round | Overview
            ├─ 我的接龙 → Overview | Step-through | Chain entry | own-棒 detail
            ├─ 本群接龙 → Room entry | Chain entry | Overview | Teaser
            ├─ 玩法 / 设置
 Overview / Step-through ─首页→ (interstitial?) → Home
 subscribe notice → launch with r=<chainId> → Step-through
```

### 8.19 Screen changes in rev. 2

| Screen | Status |
|---|---|
| Home §8.1 | **changed**: 今日起点 card and national count removed; 开一局 primary, 慢慢传 link, 回到这一局 card, room line |
| 公约 §8.2 | unchanged (rulesVersion bump) |
| Pick §8.3 | **changed** (was "prompt picker"): roll 3, up to 5 换一批 with a count label and a greyed used-up state (rev. 2.1), 自己出题, live timer; 今日 chips gone |
| Draw §8.4 | **changed**: full-space canvas, new rects, 举报 in the top bar, size toggle, no 今日彩笔 pill, forced send |
| Describe §8.5 | **changed**: drawing fills the space, forced send |
| 已传出 §8.6 | **changed**: 慢慢传 only; pending only in fallback |
| Chain entry §8.7 | **changed**: 同题再传 removed; `inRoom` state |
| Reveal overview §8.8 | **new** (replaces the v1 reveal strip §8.8) |
| Step-through §8.9 | **new** (replaces the v1 reveal strip and auto-play) |
| Teaser §8.10 | **changed** (was §8.9): 同题再传 → 开一局; room teaser |
| 本群接龙 §8.11 | **changed** (was §8.10): rooms section |
| 我的接龙 §8.12 | **changed** (was §8.11): room items |
| Report sheet §8.13 | unchanged (was §8.12); new placements (§7.1) |
| 设置 §8.14 | **changed** (was §8.13): the 今日彩笔 entry lives here |
| 玩法 §8.15 | **changed** (was §8.14): new text |
| Room entry + lobby §8.16 | **new** |
| Round wait §8.17 | **new** |
| Removed | the 今日起点 home card, the picker's 今日 chips, the draw-screen 今日彩笔 pill, 同题再传 in the reveal, teaser and entry, the vertical reveal strip with auto-play and 重播 |

---

## 9. Share flows and group detection [COMPLIANCE: 诱导分享]

Universal rules (copied from [DJT] §9):
- Every share starts from an explicit tap (`wx.shareAppMessage`) or the capsule menu (`wx.showShareMenu({menus:['shareAppMessage']})` + `wx.onShareAppMessage`).
- **No share grants anything.** Copy never says "分享才能…" and never promises rewards. Joining a room never requires sharing.
- The UI never depends on whether a share succeeded.
- Rewarded videos use `disableFallbackSharePage: true`.
- `wx.updateShareMenu({withShareTicket: true})` at startup.
- Card queries carry **ids only**: `m=<roomId>` (room invite or room reveal), `k=<chainId>` (chain invite), `r=<chainId>` (chain reveal).

### 9.1 Room invite card (new)

- From the lobby (邀请群友), or the capsule menu while in a lobby.
- Image (500 × 400): our illustration plus "一起传画 · 一局约 3 分钟" and "3–10 人". **No prompt, no drawing.**
- Title: "来一局传画接龙吗？画得丑没关系". No "@所有人", no system-style text.
- Updatable count, §9.5.
- During a game or after it, the capsule menu shares the same `m=` card: newcomers then land on "已经开始了" or the teaser.

### 9.2 Chain invite card (慢慢传)

Unchanged from v1:
- from 已传出 (发到群里接龙), the chain entry, or the capsule menu on an open chain;
- the image has our art + "传画接龙 · 已传 3/6 棒" + progress dots, with no content;
- title "第 4 棒等你接，看看你能猜出什么？".

### 9.3 Group detection

Unchanged:
- `wx.getEnterOptionsSync()` → `shareTicket` → `wx.getGroupEnterInfo` → `joinGroup({cloudID})`;
- the server decrypts with `cloud.getOpenData` (TD-96) and returns an opaque `groupRef`;
- errors mean no group context;
- `wx.getShareInfo` only as the TD-82 fallback.

### 9.4 Reveal cards

- **Room reveal card** (from the overview or the step-through):
  - Image: our art + "一局传画 · 5 条接龙" + one passed-text line from the chain on screen (from the overview: the first chain whose final step is text): "「月亮吃月饼」→「外星人在吃披萨」". **No drawings.**
  - Title: "我们这一局，「月亮吃月饼」传成了「外星人在吃披萨」". If that chain's final step is a drawing: "我们这一局传了 5 条接龙，来看看变成了什么".
  - Query `m=<roomId>`.
- **Chain reveal card** (慢慢传): as v1 ("「月亮吃月饼」传了 6 棒，变成了「外星人在吃披萨」"), query `r=<chainId>`.
- If card rendering fails: the static fallback image (TD-54) + the text title.

### 9.5 Updatable cards [VERIFY V7]

- **Room card (PO-50):** `createRoom` creates the activity id lazily on the first share (`updatableMessage.createActivityId`). Share with `isUpdatableMessage: true`, `activityId`, `templateInfo: {parameterList: [{name:'member_count', value:'<joined>'}, {name:'room_limit', value:'10'}]}`.
  - `joinRoom` and `leaveRoom` (in the lobby) call `setUpdatableMsg` (`target_state: 0`, new count).
  - `startRoom` sets `target_state: 1` (started).
  - Errors are logged and never block anything.
- **Chain card:** v1 PO-25 (n = passed 棒 of 6).
- **Fallback:** static cards (`features.updatableCard: false`).

### 9.6 Entering from a card (cold or warm start)

| Query | Destination |
|---|---|
| `m=<id>` with shareTicket | `joinGroup`, then room entry (§8.16) with group context |
| `m=<id>` without ticket | room entry; joining is refused unless the caller already has a membership row for the room's group (or is a member) |
| `k=<id>` | as v1 (chain entry) |
| `r=<id>` | `joinGroup` if there is a ticket; then step-through (participant) or teaser |
| `wxad_fallback_share=1` | home; logged; grants nothing |
| malformed | home, logged |

A warm start with a new card **never interrupts a turn or a live round**. A toast appears ("群里有新消息，交完这一棒再看"), and the card routes after the turn, or after the game for a live member. `card_open` fires once per entry.

---

## 10. Social mechanics

### 10.1 Group stats (PO-9)

`group_stats/<openGId>` counts rooms played, chains started, chains revealed, drawings passed and last activity. It is shown on 本群接龙 as one line. **No per-person counts, rankings, "MVP" or votes.**

### 10.2 笑 reactions (PO-27)

One 笑 per participant per step in the step-through (a toggle), counts shown. Not on markers. No awards and no sorting by 笑.

### 10.3 Subscribe message "接龙揭晓了" (PO-26, 慢慢传 only) [VERIFY V8]

Unchanged from v1:
- offered after the player's own send (已传出), or on a chain entry they take part in, only with a configured template;
- one message per grant;
- quiet hours 22:00-08:00.

Live rooms need no notice, because the reveal is immediate.

### 10.4 Streak

See §4.4. It is shown on home and in 我的接龙.

### 10.5 同题再传: removed (PO-45)

Removed in rev. 2. Nothing replaces it; the teaser offers 开一局.

---

## 11. Ads (IAA only) [COMPLIANCE] (PO-28, PO-49)

| Placement | Format | Trigger | Caps |
|---|---|---|---|
| 再开一条 (慢慢传) | rewarded video | "▶ 看视频再开一条" after the 3 free starts | ≤ 2 per Beijing day |
| 今日彩笔 | rewarded video | **设置 only** | 1 per day; 6 extra colours until 24:00 BJT (cosmetic) |
| After a reveal | interstitial | on leaving the reveal overview or a 慢慢传 step-through (to home, 本群接龙 or 我的接龙) | not before the player's 3rd lifetime reveal; ≥ 180 s apart; ≤ 3 per day |
| List footer | banner | 本群接龙 and 我的接龙 in `ready` / `empty` | `app_config.ads.banner.enabled`, **default off**; ≥ 24 pt gap; never near a primary button |

**Never:** in the lobby, the room entry, round 0, any draw, describe or round-wait screen, the chain entry or the pick screen, or between the steps of a step-through. No ad ever eats timer time.

Other rules are unchanged:
- the reward only on `isEnded`;
- one no-fill grant per day per placement;
- `grantReward` enforces the caps;
- `disableFallbackSharePage: true`;
- 2001-2003 are skipped;
- ad buttons show ▶ and 视频;
- no ad sits next to 画好了, 传出去, 接这一棒, 加入这一局, 开始 or 举报;
- clamped remote caps;
- stub mode in QA only.

---

## 12. Client view models

Strings are pre-formatted by logic, not by renderers (the [DJT] `vm.js` pattern). `?` = optional.

```ts
// Shared
type ChainId = string; type RoomId = string;     // 10-char base32
type Strokes = { v:2, h:number, s:number[][] } | { v:1, s:number[][] };
type StepKind = 'draw'|'describe';
type Marker = 'emptyDraw'|'emptyText'|'notDelivered';
type Source = { kind:'prompt'|'text', text:string } | { kind:'draw', strokes:Strokes }
            | { kind:'marker', marker:Marker, hint:string } | { kind:'hidden'|'paused', hint:string };
{ display:{ largeText:boolean, highContrast:boolean }, muted:boolean,
  features:{ liveRooms:boolean, subscribe:{tmplId:string}|null, updatableCard:boolean,
             banner:{enabled:boolean, adUnitId:string|null},
             interstitial:{enabled:boolean, minLifetimeReveals:number, minGapSec:number, maxPerDay:number} },
  ugc:{ createEnabled:boolean, viewEnabled:boolean } }

// Group context (memory only, per entry)
{ status:'none'|'checking'|'ok'|'failed', groupRef:string|null, shareTicket:string|null, errCode?:number }

// Home  (no `daily`, no countText)
{ state:'loading'|'ready'|'offline'|'error',
  streakText:string|null,
  primary:{ kind:'room'|'chain', label:'开一局'|'开一条接龙', sublabel:string|null, enabled:boolean },
  slowLink:{ show:boolean, label:'慢慢传（不用同时在线）' },
  activeRoom:{ roomId, line:string /* '回到这一局 · 第 2/4 轮' */ }|null,
  groupLine:{ show:boolean, text:string, target:'room'|'chains'|'group', roomId?:RoomId },
  chainStart:{ freeLeft:0..3, adLeft:0..2, sheet:null|'limit' },
  album:{ unseenReveals:number },
  restriction:{ text:string }|null, ugcPausedText:string|null,
  showHowToOnce:boolean, showRulesWarning:boolean, sheet:null|'howto'|'rules'|'warning'|'settings'|'startLimit' }

// Rules sheet
{ version:number, open:boolean, pendingAction:'createRoom'|'joinRoom'|'start'|'claim'|null }

// Pick (both modes)
{ state:'loading'|'ready'|'rerolling'|'sending'|'error'|'offline'|'timeUp',
  mode:'live'|'chain', title:'选一个题目', subtitle:string,
  timer?:{ secLeft:number, warn:boolean },                 // live only
  rollId:string, prompts:[{ id, text }], selectedId:string|null,
  rerollLeft:0|1|2|3|4|5,                                  // from the server (MAX_REROLLS 5); never computed client-side alone
  rerollDisabled:boolean,                                  // true iff rerollLeft === 0: the greyed used-up state; a tap is a no-op
  rerollLabel:string /* '换一批（剩N次）' | '换一批机会已用完' */,
  rerollTappable:boolean,                                  // !rerollDisabled && state === 'ready'
  rerollRect:{ x,y,w,h },                                  // fixed for the whole pick, identical in every state
  custom:{ open:boolean, text:string, count:string, error:string|null, passed:boolean },
  startLabel:string /* '就这个' | '开始画 (60 秒)' */, canStart:boolean, errorText:string|null, canBack:boolean }

// Draw
{ mode:'live'|'chain', roomId?, round?, rounds?, chainId?, claimId?, step?:number,
  title:string /* '画出来 · 1/4' | '第 3 棒 · 画出来' */, backLabel:'离开'|'放弃',
  source:Source /* prompt|text|marker|hidden|paused */, sourceLines:1|2,
  canReport:boolean, timer:{ secLeft:number, warn:boolean },
  canvas:{ x,y,w,h }, gridH:number,                         // fixed for the turn
  palette:[{ idx, color, locked }], colorIdx:number, sizeIdx:0|1|2,
  strokes:Strokes, strokesRev:number, pointsUsed:number, pointsMax:4000, limitText:string|null,
  canUndo:boolean, canSubmit:boolean, inputLocked:boolean,
  status:'drawing'|'sending'|'blocked'|'error'|'timeUp', statusText:string|null, coach:boolean }

// Describe
{ mode, roomId?, round?, rounds?, chainId?, claimId?, step?:number, title:string, backLabel,
  source:Source /* draw|marker|hidden|paused */, canReport:boolean,
  drawingRect:{ x,y,w,h }, timer:{ secLeft, warn }, text:string, count:'7/16',
  canSubmit:boolean, inputLocked:boolean, keyboardH?:number,
  status:'typing'|'sending'|'blocked'|'busy'|'error'|'timeUp', errorText:string|null }

// Room entry (non-member)
{ state:'loading'|'joinable'|'full'|'started'|'teaser'|'wrongGroup'|'closed'|'removed'|'notFound'
        |'inOtherRoom'|'restricted'|'rulesRequired'|'ugcPaused'|'capReached'|'offline'|'error',
  roomId, joinedText:string|null /* '4 人已加入（3–10 人）' */, headline:string, subline:string|null,
  otherRoomId?:RoomId }

// Lobby
{ state:'ready'|'starting'|'closed'|'removed'|'offline',
  roomId, seats:[{ n:1..10, filled:boolean, me:boolean, quiet:boolean }],
  joinedText:string, isHost:boolean,
  start:{ show:boolean, enabled:boolean, label:'开始（4 人）', hint:string|null, slowLink:boolean },
  waitingText:string|null /* '等房主开始…' */, canInvite:boolean }

// Round wait
{ roomId, round:number, rounds:number, title:'已交 · 2/4', timer:{ secLeft, warn },
  mine:{ strokes?:Strokes, text?:string, marker?:Marker },
  progressText:'等大家交… 3/5 已交', nextText:string /* '下一轮：猜一句' */,
  passing:boolean, offlineText:string|null }

// Reveal overview
{ state:'loading'|'ready'|'notMember'|'paused'|'offline'|'error',
  roomId, title:'全部揭晓！', subtitle:'5 条接龙 · 每条传了 4 棒', columns:1|2,
  cards:[{ chainNo:number, chainId, mineStarted:boolean, unseen:boolean,
           final:{ kind:StepKind|'marker', strokes?:Strokes, text?:string, marker?:Marker,
                   placeholder:null|'reported'|'deleted'|'paused', loaded:boolean } }],
  rematch:{ label:'再来一局', banner:string|null /* '房主开了新的一局 · 加入 ›' */, newRoomId?:RoomId },
  canShare:boolean, interstitialDue:boolean }

// Step-through (both modes)
{ state:'loading'|'ready'|'notParticipant'|'paused'|'offline'|'error',
  mode:'live'|'chain', roomId?, chainId, chainNo?:number, chainCount?:number,
  header:string /* '第 2 条 · 你起的' | '接龙揭晓 · 6 位群友' */, earlyText:string|null,
  steps:[ /* index 0 = 起点 … last = final */
    { n:number, label:string /* '起点' | '第 3 棒 · 画' | '最后一棒' */, kind:'prompt'|StepKind|'marker',
      strokes?:Strokes, text?:string, marker?:Marker, mine:boolean,
      placeholder:null|'reported'|'deleted'|'paused',
      laughs:number, myLaugh:boolean, canLaugh:boolean, canReport:boolean } ],
  index:number /* starts at steps.length-1 */, playT:number /* 0..1 replay of steps[index] */,
  dots:{ show:boolean, text:string|null /* '4/5' when > 7 steps */ },
  canPrev:boolean, canNext:boolean, endAction:null|'nextChain'|'done',
  canShare:boolean, interstitialDue:boolean }

// Teaser
{ state:'loading'|'ready'|'removed'|'notFound'|'offline', kind:'chain'|'room',
  title:string, lines:[{ from:string, to:string|null /* null = '（一幅画）' */ }], passed?:number }

// 本群接龙
{ state:'noGroup'|'checkingGroup'|'loading'|'ready'|'empty'|'error',
  statsText:string|null,
  rooms:[{ roomId, line:string, joinable:boolean }],
  waiting:[{ chainId, line:string }], inProgress:[{ chainId, line:string }],
  revealed:[{ kind:'room'|'chain', id:string, line:string, member:boolean }],
  banner:{ show:boolean, reservedHeight:number } }

// 我的接龙
{ state:'loading'|'ready'|'empty'|'error'|'offline', streakText:string|null,
  items:[{ kind:'room'|'chain', id:string,
           status:'revealed'|'playing'|'lobby'|'open'|'pending'|'expired'|'blocked'|'removed',
           line:string, timeText:string, unseen:boolean }], cursor:string|null,
  banner:{ show:boolean, reservedHeight:number } }

// Own-棒 detail, Report sheet, Settings: as v1, plus
// Settings: { …, palette:{ unlockedToday:boolean, adState:'idle'|'loading'|'playing'|'error' } }
// Report sheet target: { chainId, step:number|0 /* 0 = teaser texts */, roomId? }
```

---

## 13. Backend (WeChat Cloud Development)

Patterns are copied from `apps/dianjiangtai/cloudfunctions/` and the v1 build:
- `common/` helpers are copied into each function by `scripts/sync-core.js`; `core/` is copied from the game.
- Identity comes only from `cloud.getWXContext().OPENID`.
- Every function returns `{ok:true,…}` or `{ok:false, code, message}` and never throws.
- Date keys are `TZ=Asia/Shanghai` plus explicit UTC+8 keys.
- Uniqueness uses deterministic `_id`s; multi-document updates run in `db.runTransaction`; counters use `db.command.inc`.
- Collection names are prefixed `chuanhua_` and deployed functions `chuanhua_<name>` (TD-1, TD-19).
- **All collections deny direct client reads and writes, except `room_signals`**, which only its owner can read (§3A.7). Cloud storage denies all client access.

Environment variables (never committed):
- `GROUP_REF_PEPPER` (≥ 32 characters);
- `MODERATION_MODE`, `ENV_KIND`;
- dev only: `MOD_TEXT_DAILY_BUDGET`, `MOD_IMAGE_DAILY_BUDGET`, `MOCK_SYNC_DELAY_MS`, `MOCK_MEDIA_DELAY_SEC`;
- `ADMIN_OPENIDS` (optional);
- fallback only: `PUSH_TOKEN`, `PUSH_AES_KEY`.

No AppSecret is needed while the cloud calls work (V16 fallback: §16).

### 13.1 Collections

| Collection | Key fields | Notes |
|---|---|---|
| **`rooms`** (new) | `_id: roomId`, `host` (openid), `openGId?`, `groupRef?`, `state: lobby/playing/reveal/closed/removed`, `seats: [{openid, joinedAt, status: active/left, lastSeenAt}]` (≤ 10; fixed at start), `n`, `R`, `round` (0..R), `kind: prompt/draw/describe`, `phase: turn/passing`, `roundStartAt`, `deadline`, `timers: {promptSec, drawSec, describeSec, graceSec}` (snapshot at start), `slots: {<round>: [{state: none/received/sent/blocked/marker, at, stepId?}] per seat}`, `chainIds: [n]`, `rolls: [{rollId, ids[3], rerolls: 0..5, shownIds: [≤ 18]}] per seat` (round 0; `ids` = the current set, `shownIds` = every set shown in this pick, reserved for room uniqueness and accepted by the forced send), `version`, `rematchRoomId?`, `activityId?`, `activityExpiresAt?`, `createdAt`, `startedAt?`, `endedAt?`, `lastActivityAt`, `dateKey` | one doc per room; every lobby, round and slot change is a transaction on this doc. Indexes: `openGId + state + lastActivityAt`; `state + deadline` (sweeper); `seats.openid + state` |
| **`room_signals`** (new) | `_id: <roomId>_<seat>`, `_openid` (the seat's member), `roomId`, `seq`, `state`, `round`, `kind`, `phase`, `deadline`, `serverNow`, `sent`, `active`, `rematchRoomId?` | **custom read rule `doc._openid == auth.openid`, write false**; no content; deleted 1 day after the room ends |
| `chains` | v1 fields, plus `mode: chain/live`, `roomId?`, `seat?` (origin seat), `length` (6 for 慢慢传, R for live), `rollId?` | live chains: `state` follows the room (`open` while playing, `revealed` at the end); claims are unused |
| `steps` | v1 fields, plus `marker?: emptyDraw/emptyText/notDelivered`, `auto: boolean`, `mod.api: game/general/async`; strokes stored in format v2 | markers have no text/strokes/fileID |
| `players` | v1 fields, plus `seenPrompts: [id] (≤ 300, ring)`, `roll: {rollId, ctx: chain/<roomId>, ids, rerolls: 0..5, shownIds: [≤ 18], at}` (`rerolls` replaces the v2 `rerolled` flag), `activeRoomId?`, `day: {…, roomsCreated, roomsJoined, steps}` | `day.steps` excludes markers; the streak uses non-marker sends |
| `mod_traces`, `mod_log`, `mod_quota` | as v1; `mod_quota` adds `imageSync` and `textGame` counters | `mod_traces` only in async fallback |
| `reports` | `_id: <openid>_<chainId>_<stepId|teaser>` (TD-92), `roomId?` | |
| `group_members`, `group_stats` | as v1; `group_stats` adds `rooms` | |
| `reactions`, `sub_grants`, `audit_log`, `events`, `rate_limits` | as v1 | |
| `daily_stats` | `_id: dateKey`, `started`, `revealed`, `rooms`, `roomsFinished`, `markers`, `byPrompt: {<promptId>: n}` | aggregates only, kept; **no UI** (national counts removed) |
| `app_config` | `_id: 'live'`: `ugc`, `subscribe`, `ads`, `features: {updatableCard, liveRooms}`, `timers: {drawSec, describeSec}` (慢慢传), **`room: {minPlayers 3, maxPlayers 10, maxRounds 4, promptSec 30, drawSec 60, describeSec 45, graceSec 5, lobbyIdleMin 30, gameMaxMin 20}`**, **`moderation: {imageMode: 'sync', textApi: 'game'}`**, **`rt: {watch: true, pollSec: 2, safetyPollSec: 10}`**, `updatedAt` | missing → defaults; `imageMode: 'async'` forces `features.liveRooms: false` server-side |
| ~~`meta.launch`~~ | removed (no daily walk) | |

### 13.2 Cloud functions

The binding shapes, codes and limits are in `apps/chuanhua/cloudfunctions/CONTRACT.md` (§5, §6); where it is more detailed than this table, the contract wins and `decisions.md` records why. Every answer is `{ok:true, …}` or `{ok:false, code, message, …extra}`; the common codes `UNAUTHENTICATED`, `RATE_LIMITED`, `SERVER_CONFIG`, `INTERNAL`, `BAD_REQUEST` are not repeated per row, and the create/join/start/claim/submit family also answers `RULES_REQUIRED`, `RESTRICTED` (+`until`) and `UGC_PAUSED`. **Source** (what a player is handed): `{kind:'prompt', text, custom, canReport}` | `{kind:'text', text, canReport}` | `{kind:'draw', strokes, canReport}` | `{kind:'marker', marker, text, hint, canReport:false}` | `{kind:'hidden', hint}` | `{kind:'paused', hint}`; a live-room Source with `canReport:true` adds the opaque `reportRef` (TD-140); a 慢慢传 `prev` may also be `'gone'`.

| Function | In | Out | Notes |
|---|---|---|---|
| `getHome` | `{groupRef?}` | `{dateKey, serverNow, me:{rulesVersion, rulesRequiredVersion, restriction:{until, permanent}\|null, warnPending, startsLeft, adStartsLeft, roomsLeft, joinsLeft, turnsLeft, paletteToday, streak, unseenReveals, activeRoom:{roomId, state, round, rounds}\|null}, features:{liveRooms, subscribe, updatableCard, banner, interstitial, rt:{watch, pollSec, safetyPollSec}}, room:{minPlayers, maxPlayers, maxRounds, promptSec, drawSec, describeSec, graceSec}, timers, ugc:{createEnabled, viewEnabled, pausedSource}, group?:{openRoom:{roomId, joined}\|null, waitingChains}\|null}` | **no `daily`, `launchKey` or counts** (TD-120); `group` only with a valid `groupRef`; `warnPending` is read-once; 5 s |
| `agreeRules` | `{version}` (= `rulesVersion`, now 2, TD-118) | `{ok}` | `BAD_REQUEST` for any other version; 5 s |
| `joinGroup` | `{cloudID}` | `{ok, groupRef}` | TD-96, TD-116 (`chat_type` absent or 3 / 4); `BAD_CLOUDID`, `NOT_GROUP`; 5 s |
| **`rollPrompts`** | `{reroll?:boolean, rollId?}` | `{rollId, prompts:[{id,text}], rerollLeft: 0..5}` | 慢慢传; 3 prompts from 3 categories; a plain call returns the CURRENT unused roll with its `rerollLeft` for 10 min (TD-108), so leaving and reopening the pick screen does not reset the count; writes `players.roll` and `seenPrompts`. **Reroll (rev. 2.1):** up to 5 per pick (`MAX_REROLLS`); each replaces all 3 prompts with none shown earlier in this pick, issues a new `rollId` and decrements `rerollLeft`; `rollId`, if given, must be the current roll (a stale one → `BAD_REQUEST`, the client reloads); a reroll with `rerollLeft` 0 → **`REROLL_LIMIT`** (+`rollId`, `rerollLeft: 0`), nothing written; 5 s |
| `createChain` | `{rollId, promptId}` or `{customText}`, plus `groupRef?` | `{chainId, serverNow, claim:{claimId, step:1, kind:'draw', expiresAt, sourceText, timerSec}}` | `promptId` must be in the caller's current roll (else `BAD_REQUEST`), the roll is spent; custom text moderated (§6.2); `UGC_BUSY`, `START_LIMIT`, `IN_ROOM`, `TEXT_REJECTED`, `TEXT_BLOCKED`, `MODERATION_BUSY`; 8 s |
| `getChain` | `{chainId, groupRef?, wantActivity?}` | chain-entry fields (`core/views.js#entryView`) | never returns content; **no `promptId`, no `canSameAgain`** (TD-80 removed); `state` includes `inRoom`; `CHAIN_NOT_FOUND`; 5 s |
| `claimStep` | `{chainId, groupRef?}` | `{serverNow, claimId, step, kind, expiresAt, timerSec, prev: Source}` | `CHAIN_NOT_FOUND`, `CHAIN_CLOSED` (live chains too), `NEED_GROUP`, `WRONG_GROUP`, `IN_ROOM` (seated in a playing room, TD-109), `PENDING`, `TAKEN` (+`etaSec`), `PREV_MINE`, `CAP_REACHED`, `STEP_LIMIT`, `CLAIM_LIMIT`; 5 s |
| `releaseClaim` | `{chainId, claimId}` | `{ok}` | idempotent; releasing the starter's 棒 1 abandons the chain; 5 s |
| `submitStep` | `{chainId, claimId, text?, strokes?, auto:boolean, empty:boolean, clientMs, undoCount}` | `{serverNow, state:'passed'\|'marker'\|'pending', step, chainState, revealed, marker?}` | §3.5, §5.8, §6.2-6.3; idempotent per `claimId`; `empty: true` only with `auto: true`; a failed forced send answers the error with `reopened:true` (TD-110); `pending` only in the async fallback; `CHAIN_NOT_FOUND`, `CHAIN_CLOSED`, `CLAIM_LOST`, `STEP_LIMIT`, `START_LIMIT`, `INVALID_STROKES` (+`reason`), `TEXT_REJECTED`, `TEXT_BLOCKED`, `IMAGE_BLOCKED`, `MODERATION_BUSY`; 15 s |
| **`createRoom`** | `{groupRef?}` | the room view (`getRoom`, member form) of the new lobby; caller = host = seat 0 | idempotent for a player already in a lobby (returns it, edge 9); `LIVE_OFF`, rules, restriction, pause, `UGC_BUSY`, `STEP_LIMIT` (turn cap), `ROOM_LIMIT` (10 a day), `IN_OTHER_ROOM` (+`otherRoomId`), `IN_CLAIM` (holds a live 慢慢传 claim, TD-109); a fresh `groupRef` binds the room; 5 s |
| **`joinRoom`** | `{roomId, groupRef?}` | the room view | a seated member gets the room back (rejoin, any state); otherwise in order: group gate (`WRONG_GROUP` / `NEED_GROUP`; binds an unbound room), lobby (`ROOM_STARTED`, `ROOM_FULL`, `ROOM_CLOSED`), policy, `IN_OTHER_ROOM`, `IN_CLAIM`, `STEP_LIMIT`, `JOIN_LIMIT` (30 a day, first join of a room only); `ROOM_NOT_FOUND`; updates the card count; 5 s |
| **`leaveRoom`** | `{roomId}` | `{ok}` | lobby: removes the seat, seats renumber in join order, host handover to the earliest joined, the last member closes the lobby (creator's room count refunded); playing: seat `left`, current and later slots filled at once (empty markers; round 0: the first rolled prompt), may end the round or the game; reveal / closed: no-op; `ROOM_NOT_FOUND`, `NOT_IN_ROOM`; 5 s |
| **`startRoom`** | `{roomId}` | the room view | host only (`NOT_HOST`); ≥ 3 active (`NOT_ENOUGH_PLAYERS`); fixes seats, n, R = min(n−1, maxRounds); snapshots timers; creates n chains; rolls round-0 prompts (disjoint); round-0 deadline = start + 1 s + `promptSec`; card `target_state 1`; `ROOM_NOT_FOUND`, `NOT_IN_ROOM`, `ROOM_STARTED`, `ROOM_CLOSED`, `LIVE_OFF`; 8 s |
| **`getRoom`** | `{roomId, groupRef?, wantActivity?}` | **member** (seated at the start, also if `left`): `{roomId, member:true, state, round, rounds, kind, phase, roundStartAt, deadline, roundSec, graceSec, serverNow, version, n, joined, minPlayers, maxPlayers, me:{seat, isHost, status, slot}, seats:[{n, filled, me, quiet, left}], sentCount, activeCount, assignment?, mine?, endedBy?, rematchRoomId?, features:{liveRooms}, activityId?}`; `assignment` round 0 `{chainNo, roll:{rollId, prompts, rerollLeft}}`, rounds ≥ 1 `{chainNo, source: Source}` (with `reportRef` when `canReport`); `mine` `{kind:'prompt', text, custom}` \| `{kind:'draw', strokes}` \| `{kind:'describe', text}` \| `{kind:'marker', marker, text}`. **Non-member:** `{roomId, member:false, state, joined, minPlayers, maxPlayers, entryState, serverNow, otherRoomId?, restrictedUntil?}` | **the assignment content only for the caller's current chain, after `roundStartAt`, while the slot is unresolved**; no live `chainId` before the reveal (TD-140); `entryState`: joinable full started teaser wrongGroup closed removed inOtherRoom restricted rulesRequired ugcPaused capReached (`wrongGroup` has `state` and `joined` null); `ROOM_NOT_FOUND`; 5 s |
| **`submitRoomStep`** | `{roomId, round, rollId?, promptId?, customText?, text?, strokes?, auto:boolean, empty:boolean, clientMs}` | `{state:'sent'\|'marker', round, slot:{state}, serverNow, advanced, marker?, failed?:'blocked'\|'busy'}` | §3A.5 acceptance (≤ deadline + grace by function start, else `ROUND_OVER`); marks `received`, moderates, resolves; round 0: rolled id or custom text (an auto send with a failing custom → selected roll id, else the first; rev. 2.1: an auto send may name any id in the seat's `shownIds`, which covers a reroll that landed after the screen froze, and an id outside it → the first prompt of the current set; a non-auto send must name an id of the current set); not auto + failed check → the error with `slot:{state:'blocked'}`, resend allowed until the deadline; may advance; no daily turn cap mid-game; `ROOM_NOT_FOUND`, `NOT_IN_ROOM`, `ALREADY_SENT` (+`slot`), `ROOM_CLOSED`, `INVALID_STROKES`, `TEXT_REJECTED`, `TEXT_BLOCKED`, `IMAGE_BLOCKED`, `MODERATION_BUSY`; 15 s |
| **`rollPrompts` (room reroll)** | `{roomId, reroll:true, rollId?}` | `{rollId, prompts, rerollLeft: 0..5}` | same function; the first roll arrives with `getRoom` (`rerollLeft` 5); up to 5 rerolls per seat (rev. 2.1), each in a transaction on the room doc so concurrent seats stay disjoint; every set is room-unique and added to the seat's `shownIds`; round 0 only and only until the round-0 deadline (no grace): `ALREADY_SENT` / `ROUND_OVER`; stale `rollId` → `BAD_REQUEST`; 6th reroll → **`REROLL_LIMIT`** (+`rollId`, `rerollLeft: 0`), nothing written; `ROOM_NOT_FOUND`, `NOT_IN_ROOM` |
| **`roomTick`** | `{roomId}` | the room view | advances if due (§3A.5); idempotent, exactly one advance; members only (`NOT_IN_ROOM`); 8 s |
| **`getRoomReveal`** | `{roomId}` | `{roomId, n, rounds, cards:[{chainNo, chainId, mineStarted, finalKind:'draw'\|'describe'\|'marker', finalText?, finalMarker?, placeholder?:'reported'\|'deleted'\|'paused'}], rematchRoomId?, serverNow}` | only the final step of each chain; final drawings come from `getReveal` (TD-115); non-members: `NOT_MEMBER` + `teaser:{roomId, n, rounds, paused, lines:[{from, to\|null}]}`; not over yet: `BAD_REQUEST` + `state`; closed / removed: `ROOM_CLOSED` + `state`; `ROOM_NOT_FOUND`; 5 s |
| `getReveal` | `{chainId}` | `{serverNow, chainId, mode:'chain'\|'live', state:'revealed', reason, early, length, passed, participantCount, durationMs, prompt:{text, custom, mine, canReport}, steps:[{n, kind, strokes?\|text?, marker?, mine, placeholder, laughs, myLaugh, canReport, canLaugh}], roomId?, chainNo?, chainCount?, mineStarted?}` | **the 起点 is `prompt`; `steps` are 棒 1..length** (no `steps[0]` = 起点; the client prepends the 起点, TD-115); a marker step has `marker` and its copy in `text`, no report, no 笑; live chains add `roomId`, `chainNo`, `chainCount`, `mineStarted`; 慢慢传: participants; live: every member seated at the start; non-participants: `NOT_PARTICIPANT` + `teaser:{chainId, promptText, finalText, passed, paused}`; `CHAIN_NOT_FOUND`, `CHAIN_CLOSED`; 5 s |
| **`rematch`** | `{roomId}` | the room view of the ONE new room (+`created`) | members of a revealed room: the first caller creates it (same group; counts as a create) and records `rematchRoomId` in the same transaction; later callers join it (counts as a join); bumps every seat's signal; `ROOM_NOT_FOUND`, `NOT_IN_ROOM`, `BAD_REQUEST`, `LIVE_OFF`, `IN_OTHER_ROOM`, `ROOM_LIMIT`, `JOIN_LIMIT`, `ROOM_FULL`, `STEP_LIMIT`; 5 s |
| `revealNow` | `{chainId}` | `{ok}` | 慢慢传 only; `CHAIN_CLOSED`, `NOT_STARTER`, `TOO_EARLY` (+`busy`); 5 s |
| `laugh` | `{chainId, step}` | `{laughs, mine}` | toggle; participants of a revealed chain; not markers (`BAD_REQUEST`); `CHAIN_NOT_FOUND`, `CHAIN_CLOSED`, `NOT_PARTICIPANT`; 5 s |
| `report` | `{chainId, step, reason}` (`step` 0 = the 起点 / teaser texts), or for a live-round source **`{roomId, reportRef, reason}`** (TD-140) | `{ok, hidden:true, reopened, claimReleased}` | §7.1; hides at once for everyone. Live round: `reportRef` comes from the caller's own `getRoom` `assignment.source` and is recomputed server-side for the caller's seat; chain and step are derived from that seat, never from the client; `reopened` is always false (the room keeps running). Refusals: not seated → `NOT_MEMBER`; room not playing → `ROUND_OVER`; malformed, another seat's or an earlier round's ref → `BAD_REQUEST`; unknown room → `ROOM_NOT_FOUND`. Both forms: markers and rolled prompts → `BAD_REQUEST`, `OWN_STEP`, `DUP_REPORT`, `REPORT_LIMIT` (10 a day), `CHAIN_NOT_FOUND`, `CHAIN_CLOSED`, `NOT_PARTICIPANT`; 5 s |
| `getMyChains` | `{cursor?}` or `{chainId}` | `{items, cursor, streak, unseenReveals}`, items `kind:'chain'` or `kind:'room'` (`roomId, status, n, rounds, round, lastActivityAt, revealedAt, unseen, left`); `{chainId}` → `{item, mine:[…]}` | live chains appear only as their room (TD-115); markers `canDelete:false`; 5 s |
| `getGroupChains` | `{groupRef}` | `{serverNow, stats:{started, revealed, drawings, rooms}, rooms:[{kind:'room', roomId, state, joined?, round?, rounds?, joinable, member}], waiting, inProgress, revealed:[{kind:'chain', chainId, participant, promptText, finalText, revealedAt} \| {kind:'room', roomId, n, member, revealedAt}]}` | membership check (`NOT_MEMBER`); aggregates only; `viewEnabled: false` → no texts (§6.8); 5 s |
| `deleteMyStep` | `{chainId, step}` or `{all:true}` | `{ok, count}` | not markers; not a step of a room still playing (`BAD_REQUEST`); 10 s |
| `subscribeReveal` | `{chainId}` | `{ok}` | 慢慢传 only; `NO_TEMPLATE`, `CHAIN_NOT_FOUND`, `NOT_PARTICIPANT`; 5 s |
| `grantReward` | `{kind:'start'\|'palette', noFill:boolean}` | `{ok, startsLeft?, adStartsLeft?, paletteToday?}` | `BAD_REQUEST`, `REWARD_LIMIT`; 5 s |
| `onMediaCheck` | push `wxa_media_check` | `success` | **async fallback only** (§6.10); a call with an OPENID → `FORBIDDEN`; 5 s |
| `modSweeper` | timer every 5 min | | breaker, quota alerts, report-age alert, 慢慢传 expiry and reveal notices, async-fallback timeouts; live chains skipped; client call → `FORBIDDEN`; 60 s |
| **`roomSweeper`** | timer every 1 min (`0 */1 * * * * *`) | | advance overdue rounds (> deadline + grace + 10 s); close idle lobbies (30 min); finish games over `gameMaxMin`; finish rooms when `createEnabled` is false or `imageMode` turns async (not for a breaker pause, TD-113); materialise reveals; rewrite failed signals; delete signals and closed lobbies after 1 day; client call → `FORBIDDEN`; 60 s |
| `admin` | `{op, …}` | per op | console or `ADMIN_OPENIDS` only (`FORBIDDEN`); ops `listReports getStep sample upholdReport dismissReport hideStep restoreStep removeChain removeRoom restrict liftRestriction setUgc setModeration` (§7.2); every op writes `audit_log`; 20 s |
| `track` | `{events:[{name, props, sessionId, clientTs}]}` | `{ok}` | TD-97 / TD-121 allowlist for §14; 5 s |
| `cleanup` | timer daily 04:00 | | §7.5 incl. `rooms`; idempotent; 120 s |

**openapi permissions** (`config.json`):
- `submitStep`, `submitRoomStep`, `createChain`: `wxa.game.contentSpam.mediaCheckSync` and `wxa.game.contentSpam.msgSecCheck` (exact names [VERIFY V16, V19]), plus `security.msgSecCheck` (fallback).
- `submitStep`: `security.mediaCheckAsync` (fallback).
- `createRoom`, `joinRoom`, `leaveRoom`, `startRoom`: `updatableMessage.createActivityId` / `setUpdatableMsg`.

**Rate limits per openid, fixed one-minute window** (TD-98 style, numbers per TD-114, pinned by `tests/hardening.test.js` against CONTRACT.md; over the limit → `RATE_LIMITED`):
- reads 60: `getHome`, `getChain`, `getReveal`, `getMyChains`, `getGroupChains`, `getRoom`, `getRoomReveal`;
- turns: `submitRoomStep` 30, `submitStep` 30 (the forced send retries every second), `roomTick` 40;
- writes 20: `claimStep`, `releaseClaim`, `joinGroup`, `laugh`, `agreeRules`, `subscribeReveal`, `track`, `rollPrompts`;
- tighter: `createChain` 5, `createRoom` 5, `startRoom` 5, `rematch` 5, `joinRoom` 10, `leaveRoom` 10, `deleteMyStep` 10, `report` 10, `revealNow` 10, `grantReward` 10;
- `admin` 60 for an allow-listed openid; timer, push and console-only functions have no client limiter.

**New error codes:** `ROOM_NOT_FOUND`, `ROOM_STARTED`, `ROOM_FULL`, `ROOM_CLOSED`, `NOT_IN_ROOM`, `NOT_MEMBER`, `NOT_HOST`, `NOT_ENOUGH_PLAYERS`, `IN_OTHER_ROOM`, `IN_ROOM`, `IN_CLAIM` (`createRoom` / `joinRoom` while holding a live 慢慢传 claim, TD-109), `ROUND_OVER`, `ALREADY_SENT`, `IMAGE_BLOCKED`, `ROOM_LIMIT`, `JOIN_LIMIT`, `LIVE_OFF` (live rooms switched off), **`REROLL_LIMIT`** (rev. 2.1: `rollPrompts` reroll after the 5th of a pick; extra `rollId`, `rerollLeft: 0`; no player copy, the client shows the greyed used-up state). The v1 code `STEP_LIMIT` (daily turn cap) is now also answered by `createRoom`, `joinRoom` and `rematch`; `NOT_MEMBER` and `ROUND_OVER` are also `report` refusals for a live-round report (TD-140). v1 codes remain. `PENDING` occurs only in async fallback. Authoritative list with player copy: `game/core/codes.js` (CONTRACT.md §6).

### 13.3 Drawing storage [COMPLIANCE]

As v1:
- path `chuanhua/mod/<YYYYMM>/<chainId>/<n>_<attempt>.png`, 512 × (512·h/1024);
- only the server writes;
- readers are the checker (temp URL, 600 s for the sync check) and admins (10 min);
- no client reads;
- storage rule `read:false, write:false`;
- `cleanup` after 180 days.

### 13.4 Security rules (database)

```json
// every collection except room_signals
{ "read": false, "write": false }
// chuanhua_room_signals
{ "read": "doc._openid == auth.openid", "write": false }
```

`room_signals` docs are written by functions with `_openid` set explicitly to the seat's openid [VERIFY V18]. The client query must include `_openid: '{openid}'` so that it is a subset of the rule.

### 13.5 Code layout (copy, never import)

As v1, with these changes:
- `core/daily.js` removed.
- `core/content/prompts.v2.js` added (v1 kept only if tests need it).
- New in `core/`:
  - `room.js` (pure: rotation, round kinds, R, slot resolution, advance decision, marker fill);
  - `roll.js` (pure: category-diverse roll, reroll, no-repeat window, room-disjoint).
- `core/strokes.js`: v2 with `h`.
- `core/copy.js`: markers.
- New render modules: `render/lobby.js`, `render/roomEntry.js`, `render/roundWait.js`, `render/overview.js`, `render/stepThrough.js`.
- `render/reveal.js` is replaced.
- `js/realtime.js` (watch + polling + tick scheduling).
- New cloud functions per §13.2.

---

## 14. Analytics events

Sent through our own `track`: batched, top-level `sessionId` and `clientTs`, plus the common props `isNewUser`, `appVersion` and `promptsVersion` (2). Events never carry user text, strokes, openids or group ids. The TD-97 allowlist must list every event below.

| Event | Props | Fires when |
|---|---|---|
| `session_start` | `scene`, `fromCard: none/room/invite/reveal/notice`, `hasShareTicket` | cold start or a new session |
| `card_open` | `cardKind: room/invite/reveal`, `hasShareTicket`, `targetState` | entry from a card |
| `group_join` | `result`, `errCode?`, `scene`, `chatType?` | each `joinGroup` |
| `rules_view` / `rules_agree` | `trigger: createRoom/joinRoom/start/claim` | |
| **`prompt_roll`** | `mode: live/chain`, `reroll:boolean`, **`rerollNo: 0..5`** (rev. 2.1; 0 = the first roll), `cats` (3 letters) | a roll shown |
| `prompt_pick` | `mode`, `source: roll/reroll/custom/auto`, `promptId?`, `rerolled:boolean`, **`rerolls: 0..5`** (rev. 2.1; rerolls used in this pick), `pickMs` | a pick sent |
| `custom_prompt_result` | `mode`, `result: pass/local/risky/busy` | |
| **`room_create`** (server) | `bound:boolean` | |
| **`room_join`** | `result: ok/started/full/closed/wrongGroup/needGroup/inOther/limit/error`, `seat?` | 加入这一局 |
| **`room_leave`** | `phase: lobby/playing`, `round?` | |
| **`room_start`** (server) | `n`, `rounds`, `lobbySec` | |
| **`room_round`** (server) | `round`, `kind`, `n`, `sent`, `markers`, `endedBy: all/deadline/sweeper`, `durationMs` | every round end |
| **`room_end`** (server) | `n`, `rounds`, `durationSec`, `markers`, `left`, `endedBy: normal/cap/switch` | reveal |
| **`room_close`** (server) | `reason: idle/empty/admin`, `n` | lobby closed |
| **`rt_mode`** | `mode: watch/poll`, `reason?: error/unsupported`, `latencyMs?` | room screen opened, mode switch, sampled latency (signal seq → screen) |
| `chain_create` | `chainId`, `bound:boolean` | 慢慢传 created |
| `claim_attempt` | as v1, plus `inRoom` | |
| `step_view` | `mode`, `kind`, `sourceKind: prompt/text/draw/marker/hidden` | source shown |
| `step_submit` | `mode`, `kind`, `durationMs`, **`auto:boolean`**, **`empty:boolean`**, `strokes?` (count), `points?`, `undoCount?`, `chars?`, `colorsUsed?`, `palette:boolean`, `canvasH` | send tapped or forced |
| `step_result` | `mode`, `kind`, `result: passed/marker/blocked/busy/rejected/roundOver/claimLost` | response |
| `mod_verdict` (server) | `kind: text/image`, `api: game/general/async`, `suggest`, `label?`, `latencyMs`, `auto:boolean`, `mock:boolean` | every verdict |
| `chain_reveal` (server) | as v1, plus `mode` | |
| **`reveal_open`** | `mode`, `role: member/teaser`, `chains` | overview or 慢慢传 step-through opened |
| **`reveal_step`** | `mode`, `chainNo?`, `index`, `of`, `via: tap/swipe/dot/button` | step-through navigation |
| `reveal_done` | `mode`, `chainsOpened`, `stepsViewed`, `durationSec` | leaving the reveal |
| **`rematch`** | `role: host/member`, `result: created/joined/error` | 再来一局 |
| `laugh`, `report_submit` (+ `mode`), `share_tap` (`kind: room/invite/reveal/menu`), `share_update` (server), `subscribe_*`, `group_list_view` / `album_view`, `delete_step`, `restriction_shown`, `ad_*`, `interstitial_show`, `ugc_pause`, `strike` / `restrict`, `error` | as v1 | |
| **Removed** | `prompt_pick.source: daily/batch/same_again`, `same_again`, `picker_view.source: same_again`, `reveal_view.autoplay/replays` | |

**KPI definitions (post-launch, no gate):**
- Room start rate = `room_start` ÷ `room_create`.
- Game completion = `room_end(normal)` ÷ `room_start`.
- Marker rate = markers ÷ room slots (target < 10%).
- Rematch rate = rooms with a `rematch(created)` ÷ ended rooms.
- Room-card open → join = sessions with `card_open(room)` followed by `room_join(ok)` ÷ `card_open(room)`.
- Sync health = `rt_mode` latency p95 and the poll share.
- Moderation: image `latencyMs` p50/p95 by `api`, block rate, report rate.
- 慢慢传 KPIs and D1/D7 as in v1.
- Reroll use (rev. 2.1) = distribution of `prompt_pick.rerolls` (0-5) by `mode`; the share at 5 shows whether the limit binds. The new props `rerollNo` and `rerolls` must be added to the TD-97 / TD-121 allowlist. No event is sent for a tap on the greyed button.

---

## 15. Privacy data inventory (for the 用户隐私保护指引) [COMPLIANCE]

| Data | Purpose | Source | Stored | Retention |
|---|---|---|---|---|
| OpenID | identify players, seats, claims, authorship, allowances, restrictions | cloud function context | `rooms`, `room_signals._openid`, `chains`, `steps`, `players`, `reports`, `reactions`, `sub_grants`, `group_members`, `events` | 180 days after last activity |
| **Room membership and presence** (seat number, joined / left, join and leave times, last-seen time per room call, host flag) | run a live game (seats, rotation, auto-skip), lobby hints ("可能已离开"), rejoin | the player's room actions | `rooms.seats`; per-seat signal doc (`room_signals`, only state and counts, readable only by that player) | rooms 180 days; signal docs 1 day after the room ends |
| **User-generated drawings** (strokes and a server-rendered PNG) | show to the next player and to the game's or chain's participants at the reveal; content-safety checks; handling reports | the player's drawing | `steps.strokes`; PNG in cloud storage (server/admin only); copies sent to WeChat's content-security service | 180 days; author deletion stops display immediately; the evidence copy is kept until 180 days |
| **User-generated text** (custom prompts, descriptions) | as above; texts of a revealed game may appear in a teaser and in the share card a participant chooses to send | the player's input | `steps.text`, `chains.promptText`, `mod_log` | 180 days, as above |
| Prompt roll history (ids of prompts shown, last 300; the current roll) | avoid showing the same prompts again; validate the pick | derived | `players.seenPrompts`, `players.roll` | 180 days after last activity |
| Moderation results (verdict, label, trace id, API used) | content safety, strikes | WeChat security APIs | `steps.mod`, `mod_log`, `mod_traces` | 180 days |
| Reports (reporter openid, item, reason) | content safety | the reporter's tap | `reports` | 180 days |
| Strikes and restrictions | repeat-offender handling | derived | `players` | 180 days after last activity |
| Group id (openGId) and membership | bind rooms and chains to a group, group list, group stats | `getGroupEnterInfo` → `joinGroup` (cloudID) | `group_members`, `rooms.openGId`, `chains.openGId`, `group_stats` (the client sees an opaque `groupRef`) | 180 days after last seen |
| Reactions (笑) | show counts | tap | `reactions` | 180 days |
| Subscribe grant | send the one reveal notice asked for | `requestSubscribeMessage` tap | `sub_grants` | 180 days |
| Allowance counters, streak, rules agreement | daily caps, streak display, 公约 record | derived | `players` | 180 days after last activity |
| Analytics events | KPIs, bugs | client and server | `events` | 180 days |
| Unsent-turn draft (TD-89) | restore unsent work after an interruption | the player's input | device storage only (`chuanhua_state_v1.turn`, now keyed by claim or room + round) | until sent, abandoned, timed out or lost |
| Reveals already watched (`revealsSeen`: the chain and room ids whose reveal this phone has opened; at most 200, oldest dropped) | count a reveal once toward the interstitial gate (§11); no "new" dot on a reveal already seen | derived from the player's own taps | device storage only (`chuanhua_state_v1.revealsSeen`), not uploaded; holds ids only, no content, no OpenID | until the player clears the game data or removes the game |
| **Album cache** (`albumCache`: your own prompts and sentences from your finished chains, cached locally, up to 60 rows of at most 80 characters) | open the player's own album without a round trip | copy of the player's own text as returned by the server | device storage only (`chuanhua_state_v1.albumCache`), not uploaded | until replaced by a newer first page, or until the player clears the game data or removes the game |
| **Install id** (`installId`, a random UUID) | local marker only; not used for analytics | generated on the device at first start | device storage only (`chuanhua_state_v1.installId`); **generated locally and never sent** | until the player clears the game data or removes the game |
| **Feedback text** (only if the player submits it) | let the player report a problem | typed into WeChat's feedback component (`wx.createFeedbackButton`) | sent through WeChat's feedback component; it reaches the operator in the MP console (反馈管理) and is not written to our database | per WeChat; the operator deletes it on request |
| **Drawing statistics** (the `step_submit` analytics event: stroke, point and undo counts, durations, canvas height, flags) | KPIs and tuning | derived from the player's own turn | `events` | 180 days; **counts only: no strokes, no text, no OpenID in the event** |
| Display and sound settings | preferences | user | device storage | until changed |
| Ad data | ad delivery | WeChat ad SDK | not by us | per WeChat |

**Not collected:** nickname, avatar, phone, location, contacts, album, camera, microphone, clipboard, age, real name, payment data. **No privacy interface** is called (no open data domain, no `setUserCloudStorage`, no album, no location).
- Presence is limited to what the server sees when the player uses a room. There is no background heartbeat, and no device or network data beyond what WeChat Cloud logs.
- The 用户隐私保护指引 describes every row in its free-text sections. Purpose text: "你在游戏中创作的画和文字，会经过内容安全审核后展示给同一局或同一条接龙的参与者" [VERIFY V12].
- Free text reaches us only through the game's own inputs (custom prompts, descriptions), except feedback the player voluntarily submits through WeChat's feedback component, which goes through WeChat to the MP console.
- Data stays in mainland WeChat Cloud. WeChat's content-security service processes copies for checks (declared).
- **`docs/chuanhua/release/privacy-notes.md` and the release 隐私指引 text must add the rows "Room membership and presence", "Prompt roll history" and "Reveals already watched"** (release engineer).

---

## 16. Platform facts to verify, and the device pass

### 16.1 VERIFY items

| # | Item | Design depends on | Fallback |
|---|---|---|---|
| **V16** | **`mediaCheckSync` usable by our AppID:** the cloud-call name (`wxa.game.contentSpam.mediaCheckSync`), no 750031 ("游戏不支持，请联系小游戏团队配置"), the pre-publish quota, latency p50/p95 ≤ 3 s for 512 px PNGs, the checker fetching our temp URL, scene 3 | **every drawing; all live rooms** | (1) HTTPS call from the cloud function with an access token. This needs the AppSecret in the cloud environment config (founder sets it, Handoff H5; never in the repo). (2) Ask WeChat to enable it if 750031 appears (founder, H5). (3) `imageMode: 'async'` → live rooms off, 慢慢传 on the v1 async pipeline (then V1 becomes critical again). The CTO escalates. **First item of the device pass; spike as soon as the AppID exists** |
| **V17** | `watch()` in a mini game cloud environment on iOS, Android and PC WeChat: init, `onChange` latency, reconnect behaviour, the 5,000-record and 200-limit rules (we watch 1 doc) | live-room smoothness | polling every 2 s (always present); correctness doesn't depend on `watch` |
| **V18** | Custom DB rule `doc._openid == auth.openid` for watch; functions writing `_openid` explicitly; the `'{openid}'` placeholder in the client query | `watch` on signals | polling only (`rt.watch: false`) |
| **V19** | Game `msgSecCheck` cloud-call name, pre-publish limit, scene behaviour | text checks | `moderation.textApi: 'general'` (v1 `security.msgSecCheck` v2) |
| V20 | Background and foreground timers in a mini game mid-round (`onHide`/`onShow`, iOS lock screen) | forced send, rejoin | server deadlines decide regardless; the copy of §8.4 covers it |
| V21 | Updatable message `target_state: 1` after start, and `room_limit` 10 for room cards | the room card | static card |
| V1 | `wxa_media_check` push routing to a cloud function | **async fallback only** | as v1 (PO-33) |
| V2 | `mediaCheckAsync` latency | async fallback only | |
| V3 | Scene values (3 vs 5 for live), v2 parameters, error codes, cloud-call permissions | §6 | scene 2 / 5 |
| V4 | `wx.showKeyboard` family; programmatic `hideKeyboard` at time-up | describe step, custom prompt | `showModal` input (§8.5 rule) |
| V5 | Canvas touch drawing at 60 fps on a mid-range Android with the larger canvas (up to about 359 × 478 pt at DPR 3); PC with a mouse | drawing tool | cap the backing store at DPR 2; PC: mouse via touch mapping |
| V6 | Group entry and `getGroupEnterInfo` (TD-82: documented; launch scene still to prove) | group binding | escalate |
| V7 | Updatable messages with `withShareTicket` | cards | static cards |
| V8 | Subscribe messages | 慢慢传 notice | hidden |
| V9 | Custom storage rules | §13.3 | default creator-only rule |
| V10 | Rasterisation time for tall drawings (h 2048 → 512 × 1024 PNG) | send latency | 384 px width |
| V11 | The checker can fetch the temp URL | §6.3 | longer `maxAge` |
| V12 | Privacy-guide form fields for UGC and presence; category qualifications for UGC games | release pack | founder files (H3) |
| V13 | 防沉迷 / real-name for IAA mini games without 版号 | release | counsel (H10) |
| V14 | Console invocation carries no OPENID | admin | `ADMIN_OPENIDS` |
| V15 | `callFunction` response size: `getRoomReveal` without strokes, `getReveal` ≤ 3 drawings (≤ 96 KB) | reveal | per-step fetch |

### 16.2 Founder's device pass (before submission)

Setup as [DJT] §17.1: a release-candidate 体验版 on one iOS and one Android phone (current WeChat), **plus a third phone or PC WeChat and four test accounts** in a test group, with "不校验合法域名" off. QA observes and records; minigame-dev and backend are on call.

1. **V16 first:** in `live` mode (dev image budget on), send 20 drawings and 20 texts. Record `mediaCheckSync` and game `msgSecCheck` latency p50/p95, error codes and quota behaviour. Check one deliberately borderline test drawing (abstract shapes only, nothing offensive). **Exit E1:** it works (primary or HTTPS route), else set `imageMode: 'async'`, re-test 慢慢传 with V1 and escalate.
2. **Live room, 3 accounts:** create from the group card, join from two phones, try to start with 2 (refused), start with 3. Play to the reveal. Measure the round-transition latency on all phones (target p95 ≤ 1.5 s with `watch`; record the `rt_mode`). Confirm everyone sees the reveal together.
3. **Live room, 4 accounts with faults:** one phone lets time run out on a blank canvas (marker shown to the next player and in the reveal); one phone goes to airplane mode mid-round (round ends at deadline + grace with a marker; the phone rejoins and continues); one taps 离开 (later turns are auto-markers; it can still open the reveal).
4. **Forced send:** draw continuously through 0. The stroke in progress is kept, nothing responds after 0, and the drawing arrives. Describe with the keyboard open at 0 (V4: the keyboard closes). Same on PC (V17 polling).
5. **Canvas:** check the canvas rects on the iPhone and Android against §8.4 (screenshot). A drawing from the tall phone shows uncropped, contain-fitted on the shorter one, and vice versa.
6. **V6:** room and chain cards opened in the group (joinable) and from a single chat (refused).
7. **慢慢传** full chain with 2 accounts; forced send of an empty turn shows 「（没来得及画）」.
8. **V7 / V21:** the room card count rises with joins and shows started after 开始.
9. **V8:** subscribe on 慢慢传 → one notice at the reveal.
10. **Reports:** report the source during a live round (the reporter continues; the reveal shows the placeholder) and a step in the step-through. Run `admin listReports` / `upholdReport` (V14).
11. **Kill switches:** `createEnabled: false` mid-game finishes the room into the reveal; `viewEnabled: false` hides content within 10 s; `setModeration imageMode async` switches 开一局 off.
12. Ads: the interstitial only after leaving a reveal; none in the lobby or rounds.
13. V9 / V10 / V15 / V18 measured by backend in the console.

**Exit criteria:**
- E1: V16 passes, or the async fallback is applied and escalated.
- E2: group binding works on both platforms.
- E3: a live game completes with 3 and with 4 accounts, including the fault cases; non-members get only the teaser.
- E4: forced send behaves as §5.8 on both platforms.
- E5: reports hide instantly; admin ops work.
- E6: every other VERIFY row passes or its fallback is applied and re-verified.
- E7: results recorded in `docs/chuanhua/device-pass-<date>.md` and this table updated.

---

## 17. Edge cases

Unchanged v1 cases (慢慢传) still apply where relevant: offline launch, double submit (idempotent per claim), claim races, late submit after TTL, the previous 棒 reported during a claim, verdict after void (fallback), group A/B, leaving the group, author deletion, restricted mid-turn, midnight BJT, app killed, moderation outage, quota, `viewEnabled` off, hidden steps in the reveal, a custom-prompt report, small screens, unreadable config, the dev budget.

v1 edge 20 (the 今日起点 refresh at midnight) is **removed**.

New and changed:
1. **Two seats send the same chain?** Impossible by rotation; the server rejects any send for a chain other than the caller's current assignment (`BAD_REQUEST`).
2. **Double tap on send / retry after a timeout (live):** idempotent per (room, round, seat). A resolved slot returns its stored result (`ALREADY_SENT` with the slot).
3. **Send arrives in the grace window while another client calls `roomTick`:** the `received` slot holds the advance up to 8 s (§3A.5).
4. **Moderation slower than 8 s for a received slot:** the slot becomes 「（这一棒没传过来）」; the late verdict is logged (a `risky` still strikes).
5. **All seats left:** the remaining rounds fill with markers at once and the room reveals.
6. **Host leaves the lobby:** handover to the earliest-joined member; their lobby shows the 开始 button.
7. **Lobby with 2 players for 30 min:** closed by idle; both see "这一局太久没开始，已关闭".
8. **Player in a room opens a 慢慢传 card:** the chain entry shows `inRoom`.
9. **Player seated in a lobby taps 开一局 again:** opens the same lobby (no second room).
10. **Rejoin after the game ended:** goes to the overview.
11. **Device clock wrong:** timers use the server offset; the deadline is server-side.
12. **Network drop during the passing phase:** polling or reconnect; the next `getRoom` puts the client into the right round with the remaining time.
13. **Report of the round-1 source when it is a rolled prompt:** not offered (`canReport: false`). A custom prompt can be reported; it hides the whole chain, and the current worker plays freely.
14. **`createEnabled` set false mid-game:** `roomSweeper` finishes the room at once (markers for the rest) and reveals what exists.
15. **`viewEnabled` false mid-game:** assignments come as `paused` sources ("内容维护中"); players may still draw freely; reveals show placeholders.
16. **A card opened during a live round:** deferred until the game ends (toast).
17. **Large text on 320 × 568 in a draw turn:** the canvas shrinks but stays ≥ 0.75 aspect (clamp, §5.1); nothing is clipped.
18. **A 10-player room with R = 4 where 6 players never touch a given chain:** expected; each chain has 5 contributors.
19. **Rematch pressed by two members at once:** the first caller creates and sets `rematchRoomId`; the second joins it.
20. **Restriction during a game:** the game finishes for that player (§7.3); the next create or join is refused.
21. **A stroke in progress at 0:** kept up to its last point (§5.8).
22. **Drawing over the point limit right at 0:** the forced send sends what exists (valid by construction).
23. **Old v1 drawings (square):** render with h = 1024.
24. **Bank exhausted for a player** (300-window larger than the eligible pool): not possible with ≥ 2,000 (capacity check in §4.1: ≤ 480 excluded ids, ≥ 9 categories always eligible); the server shrinks the window if it ever happens.
25. **A 6th tap on 换一批 (rev. 2.1):** the button is greyed with 「换一批机会已用完」; the tap does nothing and no request is sent. If a 6th request reaches the server anyway (an old client, a crafted call, or client state out of sync), it returns `REROLL_LIMIT` and changes nothing: same `rollId`, same 3 prompts, `seenPrompts` and the room's reserved ids untouched. The client then shows the greyed state over the current cards.
26. **Time runs out mid-reroll (live round 0):** at 0 the screen freezes with the cards it shows, and any reroll answer that arrives later is ignored. The forced send names the card selected on screen (or the first). The server accepts it if the id is in the seat's `shownIds` for this pick, even if a reroll committed just before the deadline and replaced the current set; any other id falls back to the first prompt of the current set. A reroll whose function starts after the deadline returns `ROUND_OVER` and changes nothing. The round-0 timer is never extended by a reroll.
27. **Reroll retried after a timeout:** if the first request committed, the retry carries a stale `rollId` and gets `BAD_REQUEST`; the client reloads the current roll (plain `rollPrompts` or `getRoom`) and shows it with the server's `rerollLeft`. Exactly one reroll is counted.
28. **Leaving and reopening the pick screen (慢慢传), or reopening the game mid-round 0 (live):** the current roll and its remaining count come back from the server; the count is never reset by reopening. (慢慢传: within the 10-minute window of TD-108; after it, or after the roll is spent by `createChain`, a new pick starts with a fresh roll and 5 rerolls.)

---

## 18. Founder Handoff (compiled by release into `docs/chuanhua/release/HANDOFF.md`)

| # | Founder item | Needed for | If not done |
|---|---|---|---|
| H1 | Register a new mini game AppID (name checks: release pack) | everything | nothing can be deployed |
| H2 | WeChat 认证 (fee) | submission | submission waits |
| H3 | 小游戏备案; check UGC category qualification (V12) | submission | submission waits |
| H4 | Cloud environment; deploy functions (incl. the new room functions and `roomSweeper` timer); env vars; collections, **deny-all rules plus the `room_signals` owner-read rule (§13.4)**, storage rules, indexes | all server features | n/a |
| H5 | **Content-security setup:** enable the cloud-call permissions for the **game** content-security APIs (`mediaCheckSync`, game `msgSecCheck`) and the fallbacks. **If the device pass shows error 750031, request activation from WeChat** (小游戏 team / 管理后台 客服). If the cloud call is unavailable, set the AppSecret in the cloud env config for the HTTPS route (never pasted in chat or committed). Message push for `wxa_media_check` → `onMediaCheck` only if the async fallback is used. Create `app_config` | **drawings and live rooms (V16)** | live rooms stay off; 慢慢传 only with the async route |
| H6 | 用户隐私保护指引 (with the new room/presence and roll-history rows) and the 用户协议 (rev. 2 draft) hosting/linking; bump `rulesVersion` | submission | submission waits |
| H7 | Subscribe template "接龙揭晓了" | §10.3 | feature hidden |
| H8 | 流量主 and ad unit IDs | §11 | no-fill behaviour |
| H9 | Name an ops owner for content safety (daily `listReports` + `sample`) | operating UGC responsibly | strikes and restores lag |
| H10 | Counsel check: minors, UGC duties for a live group game, 180-day retention, **AIGC labelling of the AI-drafted prompt bank**, 防沉迷/版号 (V13) | submission | submission waits |
| H11 | Image-quota raise at 70% of 200,000/day | scale | new games pause at 95% |
| H12 | **Device pass** (§16.2), starting with V16 | submission | submission waits |
| H13 | **Content review sign-off: every prompt of the ≥ 2,000-prompt bank v2** and the blocklist (`docs/chuanhua/content-review.md` §4-5) | submission | submission waits |
| H14 | 软著 (optional before launch) | IP | n/a |
| H15 | Approve the upload and the release | submission | n/a |

---

## 19. Acceptance criteria (v1, rev. 2)

QA tests these with:
- the fake-`wx` harness;
- the cloud-function test harness (fake DB with real optimistic transactions, mocked SDK, `MODERATION_MODE=mock`, a controlled clock);
- **[device]** checks in the founder's device pass.

"Pass" means the verdict `pass`.

Status tags on v1 criteria:
- **[CHANGED rev. 2]**: the wording is updated.
- **[REMOVED rev. 2]**: kept for traceability, no longer tested.
- **[FALLBACK ONLY]**: tested only with `imageMode: 'async'`.
- Untagged: unchanged.

**Chain shape and rules (慢慢传)**
1. A 慢慢传 chain has a prompt and exactly 6 棒; 棒 1, 3, 5 are drawings and 棒 2, 4, 6 are descriptions. `submitStep` rejects a text for a draw 棒 and strokes for a describe 棒.
2. `createChain` gives the starter a claim on 第 1 棒 with the prompt as source; no other player can claim 第 1 棒 while that claim is valid.
3. **[CHANGED rev. 2]** A start is counted when 第 1 棒 is sent (including an empty marker at time-up). 放弃 before time-up leaves `startsLeft` unchanged, and the chain becomes `abandoned`.
4. A player who authored 棒 n cannot claim 棒 n+1 (`PREV_MINE`).
5. A player with 3 passed 棒 (markers included) in a chain cannot claim another (`CAP_REACHED`); blocked attempts don't count.
6. Two accounts alternating (1/3/5 and 2/4/6) can complete a chain; the reveal shows all 6 棒.
7. Claiming requires a `group_members` row for the chain's group with `lastSeen` ≤ 30 days; otherwise `WRONG_GROUP` or `NEED_GROUP`.
8. An unbound chain becomes bound to the group of the first claim made with valid group context.
9. Of two concurrent `claimStep` calls for the same 棒, exactly one succeeds (50 concurrent races).
10. `getChain` never returns prompt text, 棒 text or strokes for an unrevealed chain.
11. `claimStep` returns the previous 棒's content only to the claimant, and only if that 棒 is passed or a marker and not hidden or deleted.
12. A claim expires after 150 s; a submit after expiry is accepted if nobody else claimed since, else `CLAIM_LOST`.
13. **[FALLBACK ONLY]** A chain whose latest 棒 is `pending` cannot be claimed (`PENDING`).
14. **[REMOVED rev. 2]** (time-up released the claim on empty work.) Replaced by AC 128-134.
15. When 第 6 棒 passes, the chain is `revealed` with `revealReason: complete` in the same call.
16. `revealNow` works only for the starter, with ≥ 4 passed 棒 and no active claim.
17. At 48 h, `modSweeper` reveals a chain with ≥ 4 passed 棒 and expires one with fewer; it waits while a claim is active.
18. **[CHANGED rev. 2]** Daily caps hold: 3 free starts + ≤ 2 rewarded, **80 sent turns (markers excluded)**, 3 claims per chain, 10 reports, 10 rooms created, 30 rooms joined. Each returns its error code and resets at 00:00 BJT by server time. A game already started is never cut off by the turn cap.
19. Creating, joining, starting, claiming and sending are refused for restricted players (`RESTRICTED` with `until`; a game in progress finishes, §7.3), without the current `rulesVersion` (`RULES_REQUIRED`), and when UGC creation is paused (`UGC_PAUSED`).
20. The chain state machine never moves a `revealed`, `expired` or `removed` chain back to `open` (property test).

**Drawing tool and strokes**
21. **[REMOVED rev. 2]** (square canvas.) Replaced by AC 122-127. One-finger drawing, ignoring a second finger and touches that start outside the canvas, still holds (AC 123).
22. **[CHANGED rev. 2]** Six base colours are always available; the six 彩笔 colours appear as a second row only after the rewarded unlock **in 设置** that day, and are gone after 24:00 BJT.
23. **[CHANGED rev. 2]** 撤销 removes exactly the last stroke; 清空 asks for confirmation; the size toggle cycles 细 → 中 → 粗 and shows the real width; 画好了 is disabled with 0 strokes.
24. **[CHANGED rev. 2]** The v2 stroke codec round-trips any drawing exactly, including `h` (property test, 1,000 random drawings with random `h` from 768 to 2048); v1 drawings decode with h = 1024.
25. **[CHANGED rev. 2]** `submitStep` / `submitRoomStep` reject strokes over the limits (> 200 strokes, > 4,000 points, > 600 per stroke, x outside 0-1023, y outside 0-(h−1), `h` outside 768-2048, colour > 11, size > 2, path > 250,000, JSON > 32 KB) with `INVALID_STROKES`.
26. The client blocks new strokes at 4,000 points ("画得太细啦，先交吧") and at the path limit.
27. **[CHANGED rev. 2]** The server rasterises a 512 × round(512·h/1024) PNG; the golden-image test shows the client renderer and the server rasteriser agree on ≥ 98% of pixels for h = 768, 1024, 1363 and 2048.
28. No client code path uploads an image file.
29. No client receives a PNG URL or fileID from any function except `admin`.
30. Drawings shown to the next player and in the reveal are rendered from strokes and match the passed content.
31. **[CHANGED rev. 2]** The step-through replays a drawing stroke by stroke in 2.5 s ± 0.2 s whatever its stroke count, the first time it is shown and on a tap; a tap during the replay completes it.
32. **[device]** Drawing is smooth (no visible lag) on a mid-range Android for 60 s of continuous drawing on the full-size canvas.

**Text input**
33. Descriptions accept 2-16 code points and custom prompts 2-12; emoji and disallowed symbols are dropped on input.
34. Text with ≥ 5 digits, a URL or domain, or a contact word is rejected locally with "换个说法吧" and no API call.
35. Text matching the local blocklist is rejected locally without an API call and without a strike.
36. **[device]** The describe input works with the system Chinese keyboard on iOS and Android, or the modal fallback is in place.

**Moderation: text**
37. **[CHANGED rev. 2]** Every custom prompt and description reaches the game `msgSecCheck` (or, with `textApi: 'general'`, `security.msgSecCheck` v2) with `scene: 3`, `version: 2` and the author's openid from the context, before it is stored as passed.
38. **[CHANGED rev. 2]** `pass` delivers the text; `risky` blocks it and adds one strike; `review` (general API only) blocks it without a strike. In a block before time-up the author keeps the text and can resend; at a forced send §5.8 applies.
39. An API error, timeout or quota error returns `MODERATION_BUSY`, stores nothing and shows nothing to anyone.
40. A blocked custom prompt creates no chain, and in a live round 0 does not become the chain's prompt.
41. Blocked texts are written to `mod_log` and never returned by any client function.

**Moderation: drawings (async pipeline)**
42-49. **[FALLBACK ONLY]** v1 AC 42-49 (mediaCheckAsync, pending, push handler, re-check, void, late verdicts, author view) apply only with `imageMode: 'async'`.
50. **[FALLBACK ONLY] [device]** The push route works, if the async fallback is used.

**Fail closed, kill switches, quotas**
51. With `MODERATION_MODE=mock` and `ENV_KIND=prod`, every UGC function (incl. room functions) returns `SERVER_CONFIG` and logs `[ALERT]`.
52. **[CHANGED rev. 2]** In dev `live` mode, text and image checks are called at most `MOD_TEXT_DAILY_BUDGET` / `MOD_IMAGE_DAILY_BUDGET` times per day; beyond that, sends fail with `MODERATION_BUSY`.
53. **[CHANGED rev. 2]** `createEnabled: false` blocks `createRoom`, `joinRoom`, `startRoom`, `createChain`, `claimStep`, `submitStep` within 10 s, and `roomSweeper` finishes playing rooms into the reveal; viewing revealed content still works.
54. **[CHANGED rev. 2]** `viewEnabled: false` makes assignments, claims and reveals return placeholders and no content within 10 s.
55. With ≥ 50% moderation failures over ≥ 20 calls in 5 minutes, creation pauses for 15 minutes and `[ALERT]` is logged.
56. **[CHANGED rev. 2]** At 95% of the daily image quota `createRoom` and `createChain` return `UGC_BUSY`; at 100%, drawing sends return `MODERATION_BUSY` (live: marker at time-up).
57. **[CHANGED rev. 2]** Every collection except `room_signals` and every storage path deny all direct client reads and writes; `room_signals` allows reading only one's own docs and no writes (security-rule tests); all identity comes from the context OPENID.

**Reports, takedown, offenders**
58. **[CHANGED rev. 2]** 举报 is available in the top bar of a draw or describe turn when the source is user content (not rolled prompts, not markers), on every user-content step in the step-through, and on the teaser; never on the player's own steps.
59. A report hides the item for every viewer immediately and creates one `reports` row keyed `<openid>_<chainId>_<stepId|teaser>`; a second report by the same player returns `DUP_REPORT`.
60. **[CHANGED rev. 2]** 慢慢传: reporting the latest passed 棒 of an open chain reopens it and cancels any active claim (the reporter's own claim is released with the offer). Live: reporting the source of the current round replaces it with 「（该内容已被举报隐藏）」 for the reporter, who keeps their turn and timer.
61. Reporting a custom prompt hides the whole chain for everyone.
62. `admin` with a client OPENID (not allow-listed) returns `FORBIDDEN`; every admin op writes `audit_log`.
63. `upholdReport` keeps the item hidden and adds a strike; `dismissReport` with `restore` unhides it unless that would expose content in an open chain's claim path.
64. **[CHANGED rev. 2]** `removeChain` and `removeRoom` make every view show the removed copy; `removeRoom` ends a playing room.
65. The strike ladder applies over a rolling 30 days: 1 → warning sheet once; 2 → 24 h; 3 → 7 days; ≥ 4 → 30 days and admin flag; `review`, local rejections, busy errors and markers add no strike.
66. A restricted player can still open reveals of games they took part in and 我的接龙, and sees the restriction copy with the end time.
67. `modSweeper` logs `[ALERT]` when an open report is older than 48 h.
68. **[device]** A report on one phone hides the item on the other phone on its next fetch; the admin ops work from the console.

**Retention, deletion, privacy, minors**
69. **[CHANGED rev. 2]** `cleanup` deletes rooms, chains, steps, PNGs, traces, mod logs, reports, reactions, grants, audit entries and events older than 180 days, and inactive `players`, `group_members` and `group_stats`; `roomSweeper` deletes `room_signals` 1 day after a room ends and closed lobbies after 1 day; re-running deletes nothing new.
70. Abandoned chains are deleted after 1 day.
71. **[CHANGED rev. 2]** 删除这一棒 removes the strokes or text, shows "作者已删除这一棒" to all viewers, reopens the 棒 if it was the latest passed 棒 of an open 慢慢传 chain, is not offered for markers or during a playing room, and keeps the evidence until 180 days.
72. 删除我的全部接龙内容 applies AC 71 to every passed step of the player.
73. **[CHANGED rev. 2]** No function returns any openid, openGId, nickname or avatar to a client except `admin`; `room_signals` docs contain only their owner's `_openid` (schema test across all responses and signal writes).
74. Steps are labelled "第 N 棒"; the viewer's own show "(你)" and own chains "你起的"; seats are numbers only; no other identity is shown anywhere.
75. Analytics events contain no user text, strokes, openids or group ids (schema test on `track`, incl. the new events).
76. **[CHANGED rev. 2]** The 接龙公约 sheet appears before the first create, join, start or claim, has no pre-selected agreement, and 先看看 leaves the game browsable; agreeing stores `rulesVersion`.
77. No UGC feature exists outside a group context: no public list, search, feed or stranger matching (rooms are joinable only via their group).
78. 慢慢传 reveal notices are not sent between 22:00 and 08:00 BJT.
79. The game calls no WeChat privacy interface.

**Reveal and teaser**
80. **[CHANGED rev. 2]** Only participants (慢慢传: starter + authors; live: members seated at start) receive content from `getReveal` / `getRoomReveal`; others get `NOT_PARTICIPANT` / `NOT_MEMBER` with teaser fields only (passed texts, counts).
81. **[REMOVED rev. 2]** (auto-play strip.) Replaced by AC 156-160.
82. **[CHANGED rev. 2]** Hidden and deleted steps render as placeholders and markers as their marker text, in the overview and the step-through.
83. 笑 can be toggled once per participant per step (not on markers); counts update; nothing ranks or awards steps by 笑.
84. 慢慢传 early and expiry reveals show "提前揭晓 · 传了 n/6 棒".
85. **[REMOVED rev. 2]** 同题再传.
86. **[CHANGED rev. 2]** An expired chain shows "这条接龙没传完" and lets participants see only their own 棒; no 同题再传.

**Prompts, streak**
87. **[REMOVED rev. 2]** (≥ 400 prompts.) Replaced by AC 114.
88. **[REMOVED rev. 2]** 今日起点 determinism.
89. **[REMOVED rev. 2]** National count line.
90. **[CHANGED rev. 2]** The streak counts consecutive Beijing days with ≥ 1 sent non-marker turn in either mode, is shown only when ≥ 2, and grants nothing.
91. **[REMOVED rev. 2]** (client-side 换一批.) Replaced by AC 116.

**Sharing and group** [COMPLIANCE]
92. No reward, start, colour, seat, turn or reveal is granted or unlocked by sharing anywhere; joining never requires sharing.
93. Every share starts from a user tap or the capsule menu; nothing calls `shareAppMessage` automatically.
94. **[CHANGED rev. 2]** Card queries contain only `m=<roomId>`, `k=<chainId>` or `r=<chainId>`.
95. **[CHANGED rev. 2]** Share images contain no user drawings; room and chain invite cards contain no prompt or step text; reveal cards contain only passed prompt and final texts (render tests).
96. Opening a card with a shareTicket calls `getGroupEnterInfo` and `joinGroup`; without a ticket or on failure there is no group context, and joins and claims are refused unless membership already exists.
97. **[CHANGED rev. 2]** A card opened during a turn or a live game does not interrupt it; it routes after the turn (慢慢传) or after the game (live) with the toast.
98. **[CHANGED rev. 2]** 本群接龙 shows the current group's open lobbies, playing rooms, waiting chains and recent reveals only, plus aggregate stats, and no per-person data.
99. **[CHANGED rev. 2] [device]** The updatable room card shows the joined count and the started state, and the chain card the passed count; or the static fallback is in place with `features.updatableCard: false`.
100. The subscribe offer (慢慢传) appears only with a configured template, only after a user tap, and never again for that chain after a refusal; one grant sends at most one message.

**Ads**
101. **[CHANGED rev. 2]** Rewards only on `isEnded === true`; caps (2 extra 慢慢传 starts a day, 1 palette a day) are enforced by `grantReward`; the palette is offered only in 设置.
102. On no-fill or load error a reward is granted once per day per placement.
103. Every rewarded instance uses `disableFallbackSharePage: true`.
104. **[CHANGED rev. 2]** Interstitials show only on leaving a reveal (overview or 慢慢传 step-through), never before the 3rd lifetime reveal, ≥ 180 s apart, ≤ 3 per day, and never on the room entry, lobby, pick, draw, describe, round-wait, chain-entry screens or between step-through steps.
105. The banner appears only on 本群接龙 / 我的接龙 in ready or empty states when enabled, and is off by default.
106. **[CHANGED rev. 2]** No ad button sits next to 画好了, 传出去, 接这一棒, 加入这一局, 开始 or 举报.

**Screens, states, tech**
107. **[CHANGED rev. 2]** Every screen in §8 renders each listed state in the preview tool at **320 × 568, 375 × 667, 375 × 812 and 430 × 932** without clipped text, in standard, large-text and high-contrast modes.
108. Nothing is drawn or tappable in the capsule row; primary buttons sit in the bottom 40% of the screen; touch targets are ≥ 48 pt.
109. Every network error state offers 重试 (or reconnects automatically in a live room).
110. `apps/chuanhua/` requires no file outside itself and only `.js` modules.
111. The main package is ≤ 4 MB and the total ≤ 30 MB, including the v2 prompt bank.
112. All cloud functions return `{ok:false, code}` instead of throwing (fuzz test, incl. the room functions).
113. Date keys come from server time in UTC+8 regardless of the runtime timezone.

**Prompt roll and bank (F-2), new**
114. The bank has **≥ 2,000 non-retired prompts**, **≥ 120 in each of the 12 categories**, each 2-12 code points, unique (also after normalisation), and none matches the blocklist (after exceptions) or contact patterns. The 423 v1 ids are present with their texts (content test).
115. Every roll contains 3 non-retired prompts from 3 different categories.
116. **[CHANGED rev. 2.1]** 换一批 is available up to **5 times per pick** in both modes (live round 0 and the 慢慢传 start): each reroll returns 3 prompts from 3 different categories, none of which were in any earlier set of the same pick, with a new `rollId` and `rerollLeft` one lower (5 → 4 → … → 0); only the newest set can be picked by a non-forced send (AC 164-168 cover the limit and the UI).
117. No prompt shown to a player appears again in their rolls while it is within their last 300 shown ids (property test over 200 picks with 0-5 rerolls each).
118. In one room, the round-0 rolls (and all rerolls, up to 6 sets per seat) of different seats never share a prompt, including when seats reroll concurrently (concurrency test, 10 seats × 5 rerolls).
119. `createChain` and `submitRoomStep` round 0 accept only a `promptId` from the caller's current roll (or custom text); anything else is `BAD_REQUEST`.
120. In live round 0, a forced send with an unsent, rejected or blocked custom text uses the selected rolled prompt (the first if none was tapped).
121. Home and `getHome` carry no 今日起点 or national-count data; `core/daily.js` and `meta.launch` are gone (code search).

**Canvas (F-3), new**
122. At 375 × 812 and 320 × 568 in standard mode, the draw-screen rects (top bar, source strip, canvas, colour row, tool row and each button) match §8.4 within 1 pt, for a 1-line and a 2-line source strip and with 今日彩笔 unlocked (render test).
123. The canvas is the only element between the source strip and the colour row, with an 8 pt gap on each side; touches that start inside it draw with one finger; a second finger and touches that start outside are ignored.
124. The stored `h` equals round(1024 × canvasH / canvasW), clamped to 768-2048; when the free space is outside the clamp the canvas is centred at the clamped aspect.
125. A drawing is displayed contain-fitted and centred in any rect, never cropped or stretched, with the margin tone outside its paper (render test: h = 768, 1024, 2048 into 3 rect shapes).
126. The canvas rect and `h` do not change during a turn (status strips are drawn over the canvas bottom).
127. The describe-screen rects match §8.5 at both reference sizes, and the drawing fills the drawing area by contain-fit.

**Forced send (F-4), new**
128. At 0 s by server time, the draw screen ignores every touch and button (canvas, colours, size, 撤销, 清空, 画好了, 举报, back) and sends within 300 ms; a stroke in progress is ended and included.
129. At 0 s the describe screen closes the keyboard, ignores input and sends the current text if it has ≥ 2 valid characters, else the empty marker.
130. An empty drawing becomes a step with `marker: 'emptyDraw'` and an empty text `marker: 'emptyText'`; no moderation call is made; the next player sees 「（没来得及画）」 / 「（没来得及写）」 with the free-play line, and the reveal shows the marker.
131. Live: a send whose function start is ≤ deadline + 5 s is accepted; later sends return `ROUND_OVER`; at deadline + 5 s every seat without a resolved slot (and no in-flight `received` slot younger than 8 s) gets the empty marker.
132. Live: a forced send that is rejected, `risky`, busy or times out becomes `marker: 'notDelivered'` (「（这一棒没传过来）」); 慢慢传: it reopens the 棒 and the author sees "这一棒没通过内容审核，没有传出去".
133. A block before time-up keeps the work on screen and allows resending while time remains (draw and describe, both modes).
134. Markers count as sent turns for chain and round progress, never for the daily turn cap or the streak, and cannot be reported, laughed at or deleted.

**Live rooms (F-5), new**
135. `createRoom` creates a lobby with the caller as host and seat 0 (shown as ①); a player can be seated in only one lobby or playing room (`IN_OTHER_ROOM`).
136. `joinRoom` binds an unbound room to the joiner's group, requires group membership for a bound room (`WRONG_GROUP` / `NEED_GROUP`), and refuses after start (`ROOM_STARTED`), at 10 seats (`ROOM_FULL`) and after closing (`ROOM_CLOSED`).
137. `startRoom` works only for the host (`NOT_HOST`) with ≥ 3 active seats (`NOT_ENOUGH_PLAYERS`); the lobby shows the 2-player copy and the 慢慢传 link.
138. Rounds: R = min(n − 1, maxRounds) (default 4); round 0 is the prompt, odd rounds draw, even rounds describe, with timers 30 / 60 / 45 s from `app_config.room`.
139. Rotation: in round r ≥ 1, seat s works on chain (s − r) mod n; for every n from 3 to 10 no seat works on its own chain or on any chain twice (exhaustive test).
140. `getRoom` returns content only for the caller's current assignment and only after that round started; it never returns other chains' content, other seats' openids or other seats' work (schema test).
141. A round advances exactly once (50 concurrent `roomTick` and `submitRoomStep` calls) when every active seat has a resolved slot, or at deadline + grace with no in-flight slot younger than 8 s.
142. A `left` seat's current and future slots are filled with empty markers at once; a silent seat gets an empty marker at each deadline + grace; the game always reaches `reveal`.
143. Host handover: when the host leaves the lobby, the earliest-joined member becomes host; when the last member leaves, the room is `closed`.
144. `roomSweeper` closes lobbies idle 30 min, finishes games 20 min after start, and advances rounds overdue by > 10 s.
145. When the last round ends, every member's `getRoom` reports `reveal` with the same `version`, and `getRoomReveal` / `getReveal` serve all chains to members only.
146. `room_signals` docs contain only room id, seq, state, round, kind, phase, deadline, serverNow, counts and the owner's `_openid`; the client can read only its own (rule test).
147. When `watch` errors twice or is missing, the client polls `getRoom` every 2 s; with `watch` it also polls every 10 s; `roomTick` at deadline + grace + 1 s advances the client even with no signal (simulated harness tests).
148. **[device]** With 3 phones, round transitions appear on all phones within 1.5 s p95 of the server advance (`watch`) or 2.5 s (polling); results recorded.
149. Client timers use the server offset; changing the device clock does not change the remaining time shown by more than 1 s after the next `getRoom`.
150. A seated member who reopens the game mid-round gets the remaining time and their saved draft; after the deadline the draft is discarded with "时间到了，这一棒已自动交出".
151. 再来一局 from a revealed room returns a single new room for all members who press it (concurrency test), bound to the same group.

**Moderation, synchronous (PO-44), new**
152. With `imageMode: 'sync'`, every drawing in both modes is rasterised and checked with `mediaCheckSync` (`version: 2`, `media_type: 2`, `scene: 3`, the author's openid, a temp URL) before it is stored as passed; the timeout is 5 s.
153. `pass` delivers the drawing; `risky` blocks it and adds a strike; error, timeout or 750032/750033 return `MODERATION_BUSY`; nothing is shown to anyone else in any non-pass case.
154. With `imageMode: 'async'`, `features.liveRooms` is false in every response, 开一局 is hidden, `createRoom` returns `LIVE_OFF`, playing rooms are finished, and 慢慢传 uses the async pipeline (AC 42-50).
155. **[device]** `mediaCheckSync` and the game `msgSecCheck` work from the real AppID with no 750031; latency p50/p95 are recorded (target p95 ≤ 3 s), or the fallback of AC 154 is applied and escalated.

**Reveal (F-5), new**
156. The overview lists every chain of the room as a card showing **only its final step** (drawing, sentence, marker or placeholder) with "第 N 条" and "你起的" on the viewer's own; no prompt or intermediate step appears on the overview.
157. The step-through opens on the final step; 往前一棒, a swipe right or a tap on the left half go one step earlier; 往后一棒, a swipe left or a tap on the right half go later; the first card is 起点 with the prompt; dots jump to any step.
158. At 起点, 下一条 › opens the next chain at its final step; on the last chain it reads 看完了 and returns to the overview; navigation never advances by itself.
159. A drawing replays when first shown and on tap (AC 31); sentences appear at once.
160. All members of a room reach `reveal` at the same moment (AC 145); 慢慢传 reveals use the same step-through with one chain.

**Home and modes, new**
161. Home shows 开一局 as the primary action and 慢慢传 as a secondary link; with `features.liveRooms: false` it shows 开一条接龙 as the primary and no link.
162. A seated player sees 回到这一局 on home and returns to the lobby, the current round or the overview.
163. No ad, banner or 今日彩笔 offer appears on the room entry, lobby, pick, draw, describe or round-wait screens (render and controller tests).

**换一批 limit (founder 2026-10-16, rev. 2.1), new**
164. **5 allowed:** for one pick, 5 consecutive reroll calls each succeed and return `rerollLeft` 4, 3, 2, 1, 0 in that order; the 6 sets shown (first roll + 5) contain 18 distinct, non-retired prompts, each set from 3 different categories, none within the player's previous 300 shown ids and, in a room, none shown to another seat (cloud-function test, both modes).
165. **6th refused:** a 6th reroll call for the same pick returns `{ok:false, code:'REROLL_LIMIT'}` with `rerollLeft: 0`, and afterwards the current `rollId`, its 3 prompts, `players.seenPrompts`, `players.roll` and the room's `rolls[seat]` are byte-identical to before the call; a following `createChain` / `submitRoomStep` with an id from the 6th set still succeeds.
166. **Count label and greyed state:** the 换一批 button reads 「换一批（剩5次）」 on a fresh roll and 「换一批（剩N次）」 after each reroll; after the 5th it reads 「换一批机会已用完」, drawn in the greyed (disabled) style, and its rect is identical (within 0 pt) to its rect before any reroll, at 320 × 568, 375 × 667, 375 × 812 and 430 × 932, in standard, large-text and high-contrast modes, with no clipped text (render test); the button is never hidden or removed, and 自己出题, the cards and 就这个 keep their rects and keep working.
167. **No call on a disabled tap:** with `rerollDisabled` true, tapping the 换一批 rect (10 taps) sends no `rollPrompts` request and no `track` event, shows no toast and changes no state (controller test with a request spy); while a reroll is in flight, further taps on 换一批 also send nothing.
168. **Reroll and the round-0 timer:** rerolls never change the round-0 deadline; a reroll whose function starts after the deadline returns `ROUND_OVER` and changes nothing; a forced send at 0 with a reroll in flight sends the card selected on screen and the server accepts it because the id is in the seat's `shownIds` for this pick (AC 120 still holds for custom text); after a reopen mid-pick the screen shows the server's current set and remaining count (no reset).

---

## 20. Post-launch backlog (out of v1)

- A parallel async image check as a second opinion on live drawings (quota permitting).
- A host-driven shared presentation of the reveal.
- Optional names on seats via the open data domain (a privacy interface; reconsider later).
- Spectators for late joiners.
- Public "官方链" with staff-drawn first steps (needs human moderation capacity).
- Longer games (maxRounds 6) as a host option, if session data allows.
- Reveal video/GIF export (UGC leaving the app: needs its own review).
- Seasonal prompt packs; more 彩笔 sets.

---

## Appendix A: Reuse from `apps/dianjiangtai/` (copied, never imported)

| Piece | Source | Use here |
|---|---|---|
| Capsule-aware layout, single-canvas scene loop, single-finger routing, `render/*` structure, `vm.js` pre-formatted view models, preview tool | `game/js/`, `game/tools/preview/` | all screens |
| `share.js` (share menu, `withShareTicket`, card rendering, enter-options routing) | `game/js/share.js` | room, invite and reveal cards; card entry |
| `ads.js` | `game/js/ads.js` | §11 |
| `analytics.js` + `track` | `game/js/analytics.js`, `cloudfunctions/track` | §14 |
| `core/date.js`, `core/rng.js` | `game/core/` | date keys; prompt rolls (server-seeded) |
| `joinGroup`, `group_members`, `groupRef` pepper scheme | `cloudfunctions/joinGroup` | §9.3 |
| `common/store.js`, `sync-core.js`, deny-all rules + tests, fake DB and fake-`wx` harnesses | `cloudfunctions/`, `game/tests/` | whole backend and tests |
| `cleanup`, `rate_limits`, `app_config` | cloudfunctions | §7.5, §13 |
| Large-text / high-contrast modes, feedback button | render, theme | §8.14 |
| Subscribe-message flow | [DJT] §8.13 | §10.3 |

**New (v1 build):** drawing canvas and stroke codec; describe input; chain state machine; moderation module; server rasteriser and PNG encoder; reports, strikes and admin; storage lifecycle.

**New in rev. 2:**
- room state machine (`core/room.js`) and room functions;
- realtime client (`js/realtime.js`);
- roll engine (`core/roll.js`) and the v2 bank;
- sync moderation calls;
- stroke v2 and contain-fit rendering;
- forced send and markers;
- lobby, round wait, overview and step-through screens.

---

## Appendix B: Prompt bank v1 seed (423 prompts, original; carried into bank v2)

These 423 prompts keep their ids in bank v2 (§4.3). The rest of bank v2 (≥ 1,577 more) lives in `game/core/content/prompts.v2.js` and is reviewed in `docs/chuanhua/content-review.md` §5. The spec no longer lists the full bank. Ids are category letter + number, all ≤ 12 characters, content-reviewed against §4.3 (Handoff H13).

**A 动物 (35):** A01 小猫吃面条 · A02 熊猫荡秋千 · A03 企鹅滑滑梯 · A04 长颈鹿戴围巾 · A05 小狗遛主人 · A06 兔子拔萝卜 · A07 大象坐跷跷板 · A08 猴子捞月亮 · A09 鸭子排队过马路 · A10 小鸡破壳而出 · A11 金鱼吐泡泡 · A12 刺猬背苹果 · A13 松鼠藏松果 · A14 蜗牛赛跑 · A15 海豚和小船赛跑 · A16 树懒睡午觉 · A17 考拉抱大树 · A18 斑马走斑马线 · A19 狐狸照镜子 · A20 青蛙唱歌 · A21 蜜蜂采蜜 · A22 蝴蝶落在花上 · A23 乌龟背着房子 · A24 老鼠搬奶酪 · A25 小羊剪羊毛 · A26 奶牛看星星 · A27 骆驼过沙漠 · A28 鹦鹉学说话 · A29 螃蟹横着走 · A30 章鱼弹钢琴 · A31 猫头鹰戴眼镜 · A32 小猪在泥里打滚 · A33 袋鼠送快递 · A34 河马刷牙 · A35 狮子去理发

**B 美食 (35):** B01 煎饼果子 · B02 热腾腾的饺子 · B03 一碗牛肉面 · B04 糖葫芦 · B05 冰淇淋化了 · B06 西瓜切两半 · B07 火锅冒泡泡 · B08 爆米花满天飞 · B09 蛋糕插蜡烛 · B10 月饼 · B11 粽子 · B12 汤圆 · B13 烤红薯 · B14 糖炒栗子 · B15 炸薯条 · B16 珍珠奶茶 · B17 小笼包 · B18 面包刚出炉 · B19 荷包蛋 · B20 巨大的汉堡 · B21 披萨切八块 · B22 一串葡萄 · B23 削苹果皮 · B24 草莓蛋糕 · B25 煮玉米 · B26 烤串 · B27 豆浆油条 · B28 白馒头 · B29 寿司 · B30 菠萝 · B31 酸柠檬 · B32 包饺子 · B33 糖果罐 · B34 棒棒糖 · B35 番茄炒蛋

**C 职业 (35):** C01 厨师颠勺 · C02 推车卖冰棍 · C03 老师讲课 · C04 消防员救小猫 · C05 快递员送包裹 · C06 理发师剪头发 · C07 画家画画 · C08 宇航员太空漫步 · C09 农民插秧 · C10 渔夫钓鱼 · C11 面包师揉面 · C12 邮递员送信 · C13 园丁修剪树 · C14 摄影师拍照 · C15 魔术师变兔子 · C16 钢琴家演奏 · C17 工人盖房子 · C18 飞行员开飞机 · C19 船长掌舵 · C20 科学家做实验 · C21 裁缝做衣服 · C22 修车师傅 · C23 清洁工扫落叶 · C24 主持人拿话筒 · C25 舞蹈演员转圈 · C26 小丑踩高跷 · C27 养蜂人 · C28 饲养员喂熊猫 · C29 图书管理员 · C30 气象员看云 · C31 潜水员看珊瑚 · C32 指挥家挥棒 · C33 杂技演员走钢丝 · C34 修电脑 · C35 售货员称水果

**D 出行 (35):** D01 骑车上坡 · D02 堵车 · D03 坐过山车 · D04 热气球升空 · D05 地铁上打瞌睡 · D06 高铁穿过隧道 · D07 小船过桥 · D08 纸飞机 · D09 火箭发射 · D10 坐缆车 · D11 骑电动车戴头盔 · D12 雨中等公交 · D13 拖拉机耕地 · D14 帆船出海 · D15 滑板少年 · D16 骑马 · D17 旋转木马 · D18 坐飞机看云 · D19 坐游轮看海 · D20 摩天轮 · D21 拖着行李箱赶车 · D22 自行车爆胎 · D23 狗拉雪橇 · D24 双层巴士 · D25 飞艇 · D26 小火车钻山洞 · D27 划龙舟 · D28 房车去露营 · D29 骑骆驼 · D30 滑翔伞 · D31 推婴儿车 · D32 洒水车 · D33 竹筏漂流 · D34 轮渡和海鸥 · D35 直升机

**E 运动 (35):** E01 跳绳 · E02 踢毽子 · E03 投篮 · E04 射门 · E05 打乒乓球 · E06 打羽毛球 · E07 游泳 · E08 冲过终点线 · E09 举重 · E10 跳水 · E11 滑雪 · E12 拔河 · E13 放风筝 · E14 打太极拳 · E15 攀岩 · E16 冲浪 · E17 滚铁环 · E18 跳高 · E19 做瑜伽 · E20 打保龄球 · E21 打网球 · E22 打排球 · E23 跳远 · E24 花样滑冰 · E25 划船比赛 · E26 做早操 · E27 跳踢踏舞 · E28 跳皮筋 · E29 抖空竹 · E30 打陀螺 · E31 爬山 · E32 跳伞 · E33 转呼啦圈 · E34 打高尔夫 · E35 骑独轮车

**F 节日与四季 (35):** F01 贴春联 · F02 放烟花 · F03 吃年夜饭 · F04 挂灯笼 · F05 舞狮子 · F06 赏月 · F07 堆雪人 · F08 打雪仗 · F09 秋天的落叶 · F10 春天花开了 · F11 夏天吃西瓜 · F12 猜灯谜 · F13 重阳登高 · F14 夏夜乘凉 · F15 生日派对 · F16 毕业合影 · F17 开学第一天 · F18 剪窗花 · F19 写福字 · F20 树上的知了 · F21 雪天喝热汤 · F22 金色的稻田 · F23 春游野餐 · F24 植树 · F25 腊八粥 · F26 围炉煮茶 · F27 春天挖野菜 · F28 中秋团圆饭 · F29 夏天摇蒲扇 · F30 儿童节气球 · F31 新年倒计时 · F32 晒柿子 · F33 吹电风扇 · F34 踏青 · F35 冬天戴手套

**G 家里 (35):** G01 洗衣机转圈 · G02 晾衣服 · G03 拖地 · G04 煮饭 · G05 浇花 · G06 刷牙 · G07 打哈欠 · G08 照镜子 · G09 赖床 · G10 叠被子 · G11 在冰箱里找吃的 · G12 沙发上看电视 · G13 找遥控器 · G14 闹钟响了 · G15 雨伞被吹翻 · G16 手机没电了 · G17 煮泡面 · G18 洗碗 · G19 吸尘器 · G20 挤牙膏 · G21 开窗通风 · G22 修水龙头 · G23 搬家 · G24 拼拼图 · G25 织毛衣 · G26 换灯泡 · G27 扫地机器人 · G28 拆快递 · G29 晒被子 · G30 养多肉 · G31 擦玻璃 · G32 打喷嚏 · G33 自拍 · G34 戴耳机听歌 · G35 擦皮鞋

**H 自然与天气 (35):** H01 彩虹 · H02 雷阵雨 · H03 太阳下山 · H04 满天星星 · H05 弯弯的月亮 · H06 山顶日出 · H07 瀑布 · H08 沙漠里的仙人掌 · H09 海浪拍沙滩 · H10 大雾天 · H11 风吹麦浪 · H12 雪花飘落 · H13 樱花 · H14 荷花池 · H15 竹林 · H16 树下的蘑菇 · H17 向日葵 · H18 棉花糖一样的云 · H19 小溪 · H20 冰山 · H21 极光 · H22 流星 · H23 森林小屋 · H24 草原上的羊群 · H25 椰子树 · H26 银杏叶变黄了 · H27 蒲公英飞走了 · H28 雨后的蜗牛 · H29 海边的灯塔 · H30 小岛 · H31 星空露营 · H32 雪山 · H33 稻草人 · H34 一滴水 · H35 屋檐下的冰柱

**I 奇思妙想 (38):** I01 外卖小哥在月球送餐 · I02 熊猫开出租车 · I03 恐龙学跳舞 · I04 西瓜当头盔 · I05 企鹅在沙漠里撑伞 · I06 云朵下面条 · I07 月亮吃月饼 · I08 太阳戴墨镜 · I09 鲸鱼在天上飞 · I10 猫咪当老板 · I11 冰箱去旅行 · I12 雪人在夏天流汗 · I13 鱼骑自行车 · I14 树上长满糖果 · I15 天上下糖果雨 · I16 大象跳芭蕾 · I17 机器人学做饭 · I18 蚂蚁搬西瓜 · I19 书本长翅膀 · I20 茶壶在跳舞 · I21 外星人来串门 · I22 房子长了腿 · I23 包子当枕头 · I24 鞋子开花了 · I25 牙刷开演唱会 · I26 南瓜马车 · I27 会飞的鱼缸 · I28 星星掉进碗里 · I29 小狗当裁判 · I30 蜗牛开跑车 · I31 气球带走小猫 · I32 月球上种菜 · I33 煎蛋荡秋千 · I34 汽车爬楼梯 · I35 小鸡当宇航员 · I36 老虎吃青菜 · I37 刺猬抱气球 · I38 冰淇淋去滑雪

**J 校园与办公室 (35):** J01 上课传纸条 · J02 涂答题卡 · J03 举手发言 · J04 在黑板上画画 · J05 课间操 · J06 趴桌上午睡 · J07 电脑死机了 · J08 开视频会议 · J09 打印机卡纸 · J10 下班赶地铁 · J11 咖啡续杯 · J12 键盘敲不停 · J13 写作业到深夜 · J14 背书包上学 · J15 放学排队 · J16 用显微镜 · J17 图书馆借书 · J18 食堂打饭 · J19 毕业抛帽子 · J20 接力赛跑 · J21 美术课画苹果 · J22 音乐课合唱 · J23 做手工 · J24 翻幻灯片 · J25 便利贴贴满墙 · J26 团建爬山 · J27 开会打瞌睡 · J28 年会表演节目 · J29 下雨没带伞 · J30 迟到跑进教室 · J31 削铅笔 · J32 橡皮擦错字 · J33 发作业本 · J34 黑板擦拍粉笔灰 · J35 打卡上班

**K 爱好 (35):** K01 弹吉他 · K02 拉二胡 · K03 打鼓 · K04 拿着话筒唱歌 · K05 钓鱼钓睡着了 · K06 下象棋 · K07 下围棋 · K08 搭积木 · K09 画油画 · K10 写毛笔字 · K11 剪纸 · K12 捏泥人 · K13 种花 · K14 养金鱼 · K15 看电影吃爆米花 · K16 拍照打卡 · K17 读小说 · K18 玩魔方 · K19 跳街舞 · K20 吹泡泡 · K21 折纸鹤 · K22 拉小提琴 · K23 吹笛子 · K24 堆沙堡 · K25 观鸟 · K26 烤棉花糖 · K27 做蛋糕 · K28 跳交谊舞 · K29 听相声 · K30 画京剧脸谱 · K31 用望远镜看星星 · K32 捉迷藏 · K33 跳房子 · K34 玩滑梯 · K35 吹口琴

**L 童话与想象 (35):** L01 城堡里的公主 · L02 魔法师挥魔杖 · L03 会说话的树 · L04 骑大鹅去旅行 · L05 海底宫殿 · L06 巨人和小精灵 · L07 会飞的地毯 · L08 许愿瓶 · L09 打开宝箱 · L10 寻宝船 · L11 魔法扫帚 · L12 会唱歌的贝壳 · L13 糖果屋 · L14 月亮上的兔子 · L15 会弹琴的彩虹 · L16 云上的城堡 · L17 独角兽 · L18 会飞的书包 · L19 小精灵修鞋 · L20 时光机 · L21 长翅膀的小猪 · L22 长到天上的豆藤 · L23 小动物开茶会 · L24 机器人朋友 · L25 恐龙蛋孵化了 · L26 森林音乐会 · L27 蘑菇房子 · L28 星星项链 · L29 雪花仙子 · L30 梦里的游乐园 · L31 会走路的蛋糕 · L32 魔法种子 · L33 纸船去远航 · L34 哈哈镜里的我 · L35 会发光的灯笼鱼

Total seed: 11 × 35 + 38 = **423**. The bank v2 content test (AC 114) checks that these ids and texts are present.

---

## Appendix C: What rev. 2 changes in the current build (for the rebuild)

| Area | Current build | Rev. 2 |
|---|---|---|
| `core/daily.js`, `getHome.daily`, `meta.launch`, `daily_stats.byPrompt` UI, home 今日起点 card, national-count copy (TD-3, TD-39) | built | **delete** (keep `byPrompt` counting only) |
| Prompt bank `prompts.v1.js` (423) | built | **replace** with `prompts.v2.js` (≥ 2,000, v1 ids kept); content tests rewritten (AC 114) |
| Picker (client 换一批 from today's 3, 今日 chips) | built | **rewrite** as the pick screen with server `rollPrompts` (§4.1, §8.3); rev. 2.1: up to 5 rerolls with the count label and the greyed used-up state, `REROLL_LIMIT` |
| Stroke codec v1 (square 1024) | built | **extend** to v2 with `h`; validation, rasteriser size, golden tests (AC 24-27) |
| Draw screen layout (square canvas, palette pill, 3 size buttons, 举报 in the source card; TD-72/73/85) | built | **rewrite** to §8.4 rects; contain-fit renderer for all static drawings (§5.7) |
| Describe screen | built | **re-layout** (§8.5); keep TD-75 compact mode |
| Turn-end logic (TD-42: release on empty) | built | **rewrite**: forced send + markers (§5.8) in client, mock, `submitStep` |
| Moderation `mediaCheckAsync` + push + pending UI (PO-13, TD-37) | built | **keep as fallback** behind `imageMode: 'async'`; **add** the sync image and game text calls in `common/modio`/`wxapi`; mock sync paths |
| Reveal strip with auto-play (TD-76), 同题再传 (TD-47, TD-80) | built | **replace** with overview + step-through; **delete** 同题再传 everywhere |
| Rooms: `rooms`, `room_signals`, `createRoom`, `joinRoom`, `leaveRoom`, `startRoom`, `getRoom`, `submitRoomStep`, `roomTick`, `getRoomReveal`, `rematch`, `roomSweeper`, `core/room.js`, `core/roll.js`, `js/realtime.js`, lobby / room entry / round wait screens, room card | not built | **new** |
| Home, 本群接龙, 我的接龙, 设置 (今日彩笔 entry), 玩法 | built | **update** per §8.1, §8.11-8.15 |
| Allowances (40 turns/day) | built | **update** to §3.9 |
| Analytics allowlist (TD-97) | built | **update** to §14 |
| Render CONTRACT.md and cloudfunctions CONTRACT.md | v1 | **rewrite** sections for the changed and new screens and functions |
| Mock server | v1 | **extend** with rooms, rolls, sync moderation and markers (contract suite parity, TD-21) |
| 用户协议 draft, privacy notes | v1 | updated drafts (`release/user-agreement.md`, privacy rows §15); regenerate `user-agreement.txt` → `js/terms-text.js`; bump `rulesVersion` |
| Unchanged | reports/strikes/admin core, group binding (`joinGroup`), share plumbing, ads module, large-text/high-contrast, cleanup pattern, rate limiter, release switch (TD-87), terms screen (TD-88) | reuse |
